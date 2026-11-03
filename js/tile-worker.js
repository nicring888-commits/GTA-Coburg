// Höhengitter einer Umland-Kachel (seit v3.12.0, Grafik-Phase 8): Catmull-Rom aus dem groben Raster, Kleinrelief
// (an Straßen auslaufend) und ausgehobene Gewässer. Dieselbe Datei läuft zweimal: im Spiel als normales Skript (Region
// rechnet damit dringende Kacheln selbst) und als Worker, der die Höhen der nächsten Kacheln neben dem Spiel rechnet.
// Kontext ctx (Region bzw. der Nachbau im Worker): coarse(c, r), inCore(x, z), core, minX, minZ, fx, fz, netGrid,
// graph.edges ({ p, w, deck }), _rmask.
'use strict';

const TileHeights = {
  F: 4, // Verfeinerung des Geländegitters (REGION.F)

  // Höhe am feinen Gitterpunkt (fc, fr), gezählt ab der Nordwestecke der Innenstadt (wie in World.buildTerrainData)
  fine(ctx, fc, fr) {
    const F = this.F;
    const gr = fr / F, r0 = Math.floor(gr), tr = gr - r0, gc = fc / F, c0 = Math.floor(gc), tc = gc - c0;
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const row = k => cr(ctx.coarse(c0 - 1, r0 + k), ctx.coarse(c0, r0 + k), ctx.coarse(c0 + 1, r0 + k), ctx.coarse(c0 + 2, r0 + k), tc);
    const h = tr === 0 ? row(0) : cr(row(-1), row(0), row(1), row(2), tr);
    return h + this.relief(ctx, ctx.minX + fc * ctx.fx, ctx.minZ + fr * ctx.fz);
  },
  // Kleinrelief: sanfte Bodenwellen (bis ≈ ±1,8 m) im offenen Land, die das grobe Höhenmodell nicht kennt.
  // An Straßen (bis 12 m neben der Fahrbahn) und am Rand der Innenstadt läuft es aus.
  relief(ctx, x, z) {
    const C = ctx.core, dc = Math.hypot(Math.max(C.minX - x, 0, x - C.maxX), Math.max(C.minZ - z, 0, z - C.maxZ));
    if (dc < 150) return 0;
    const m = this.reliefMask(ctx, x, z) * U.smoothstep(150, 450, dc);
    if (m <= 0.001) return 0;
    return m * ((U.vnoise(x / 140, z / 140) - 0.5) * 3.0 + (U.vnoise(x / 47 + 17.3, z / 47 - 3.1) - 0.5) * 1.0);
  },
  // Abstand zur nächsten Straße als Maske 0..1, auf einem 25-m-Raster zwischengespeichert und weich interpoliert
  reliefMask(ctx, x, z) {
    const G = 25, gx = x / G, gz = z / G, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const at = (a, b) => {
      const k = a * 100003 + b;
      let v = ctx._rmask.get(k);
      if (v === undefined) {
        const px = a * G, pz = b * G;
        let d = 60;
        for (const code of ctx.netGrid.query(px, pz, 60, ctx._rq3 || (ctx._rq3 = []))) {
          const e = ctx.graph.edges[Math.floor(code / 4096)], q = (code % 4096) * 2;
          const c = U.closestOnSeg(px, pz, e.p[q], e.p[q + 1], e.p[q + 2], e.p[q + 3]);
          d = Math.min(d, Math.hypot(c[0] - px, c[1] - pz) - e.w / 2);
        }
        v = U.smoothstep(14, 50, d);
        if (ctx._rmask.size > 400000) ctx._rmask.clear();
        ctx._rmask.set(k, v);
      }
      return v;
    };
    if (!ctx._rmask) ctx._rmask = new Map();
    return U.lerp(U.lerp(at(i, j), at(i + 1, j), fx), U.lerp(at(i, j + 1), at(i + 1, j + 1), fx), fz);
  },
  // Straße in der Nähe? carve: auch niedrige Brücken zählen (darunter wird kein Bett ausgehoben)
  roadNear(ctx, x, z, margin, carve) {
    const list = ctx.netGrid.query(x, z, 14, ctx._rq || (ctx._rq = []));
    for (const code of list) {
      const e = ctx.graph.edges[Math.floor(code / 4096)], k = (code % 4096) * 2;
      if (e.deck && (!e.deck.low || carve)) continue;
      const c = U.closestOnSeg(x, z, e.p[k], e.p[k + 1], e.p[k + 2], e.p[k + 3]);
      if (Math.hypot(c[0] - x, c[1] - z) < e.w / 2 + margin) return true;
    }
    return false;
  },
  // Feines Höhenraster einer Kachel mit einem Punkt Rand (Zeilenlänge S = N + 3): hg0 Gelände, hg mit ausgehobenen
  // Gewässern (dasselbe Feld, wenn keine da sind). water: { areas, lines } der Kachel und ihrer acht Nachbarn oder null;
  // (x0, z0): Weltlage des ersten Punkts
  heights(ctx, ti, tj, N, x0, z0, water) {
    const S = N + 3, g = new Float32Array(S * S);
    const fc0 = ti * N - 1, fr0 = tj * N - 1;
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) g[r * S + c] = this.fine(ctx, fc0 + c, fr0 + r);
    let hg = g;
    if (water) {
      const ws = new WaterSet(water.areas, water.lines);
      if (!ws.empty) {
        hg = Float32Array.from(g);
        ws.carveGrid(hg, S * S, i => [x0 + (i % S) * ctx.fx, z0 + Math.floor(i / S) * ctx.fz],
          (x, z) => ctx.inCore(x, z) || this.roadNear(ctx, x, z, WATER.roadGap, true));
      }
    }
    return { hg0: g, hg, S };
  },
};

// ---------------- als Worker ----------------
if (typeof window === 'undefined' && typeof importScripts === 'function') {
  importScripts('util.js', 'water.js');
  let ctx = null;
  self.onmessage = e => {
    const m = e.data;
    if (m.init) {
      // Nachbau des Region-Kontexts: grobes Raster, Innenstadt, Straßennetz mit Suchraster
      const I = m.init, gh = I.gh;
      ctx = {
        minX: I.minX, minZ: I.minZ, fx: I.fx, fz: I.fz, core: I.core,
        coarse(c, r) { c = U.clamp(c - I.gc0, 0, I.gcols - 1); r = U.clamp(r - I.gr0, 0, I.grows - 1); return gh[r * I.gcols + c]; },
        inCore(x, z) { const C = I.core; return x >= C.minX && x <= C.maxX && z >= C.minZ && z <= C.maxZ; },
        graph: { edges: I.edges.map(e => ({ p: e.p, w: e.w, deck: e.d ? { low: e.d === 2 } : null })) },
        netGrid: new U.Grid(40),
      };
      ctx.graph.edges.forEach((e, ei) => {
        const p = e.p;
        for (let k = 0; k + 3 < p.length; k += 2) ctx.netGrid.insert(ei * 4096 + k / 2, Math.min(p[k], p[k + 2]), Math.min(p[k + 1], p[k + 3]), Math.max(p[k], p[k + 2]), Math.max(p[k + 1], p[k + 3]));
      });
      TileHeights.F = I.F;
      return;
    }
    const r = TileHeights.heights(ctx, m.ti, m.tj, m.N, m.x0, m.z0, m.water);
    const same = r.hg === r.hg0;
    self.postMessage({ key: m.key, hg0: r.hg0, hg: same ? null : r.hg, S: r.S }, same ? [r.hg0.buffer] : [r.hg0.buffer, r.hg.buffer]);
  };
}
