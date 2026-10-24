// Umland: der ganze Landkreis Coburg in Kacheln von ≈ 1 km (data/region.js aus tools/convert-region.js,
// Luftbilder aus tools/fetch-region-ortho.js). Gebaut werden nur die Kacheln in der Nähe des Spielers:
// Gelände (wie in der Innenstadt mit Catmull-Rom verfeinert), Luftbild, Straßen, Gebäude aus OSM und Bäume.
// Weiter entfernte Kacheln werden wieder abgebaut. Die Innenstadt (data/coburg.js) bleibt, wie sie ist.
'use strict';

const REGION = {
  F: 4,               // Verfeinerung des Geländegitters (wie TERRAIN_UPSAMPLE in world.js)
  load: 2000,         // Kacheln bis zu diesem Abstand vom Spieler bauen (m, bis zum Kachelrand)
  drop: 2800,         // weiter entfernte Kacheln abbauen
  trees: 1100,        // Bäume nur in der Nähe
  treesDrop: 1600,
  skirt: 5,           // Schürze an den Kachelrändern gegen Lichtspalten (m)
  roadY: 0.12,
  budgetMs: 9,        // Bauzeit pro Bild, wenn nichts dringend ist
  life: 650,          // Laternen, Ladenschilder, Lokale und Fußgänger nur in der Nähe
  lifeDrop: 950,
  townBuildings: 12,  // ab so vielen Häusern gilt eine Kachel als Ort
};
// Smartphones (js/boot.js): kleinerer Umkreis, damit der Speicher reicht
if (window.QUALITY && window.QUALITY.region) Object.assign(REGION, window.QUALITY.region);
// Brücken über Straßen: Fahrbahn so hoch über der unteren Straße (m), Rampen höchstens so steil
const BRIDGE = { lift: 6.2, slope: 0.07, step: 4 };
// große Straßen (Bundesstraßen, Autobahn): Randlinien, Mittelstreifen, Leitplanken
const BIG_ROADS = /^(motorway|motorway_link|trunk|trunk_link|primary)$/;
const BIG_MEDIAN_W = 10;   // zweibahnige Straßen ab dieser Breite bekommen eine Mittelleitplanke
// Schnittpunkt der Strecken a-b und c-d als Anteil t auf a-b (sonst null)
function segHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}
const LAMP_ROADS = /residential|living_street|tertiary|secondary|primary|unclassified/;
// begehbare Lokale und Läden im Landkreis: Art aus OSM -> Raumtyp (venues.js)
function regionVenueType(name, kind) {
  if (kind === 'amenity=fast_food' && /kebab|kebap|döner|doner|dürüm/i.test(name)) return 'doener';
  if (/amenity=(restaurant|pub|biergarten)/.test(kind)) return 'gasthaus';
  if (kind === 'amenity=cafe' || kind === 'shop=bakery' || kind === 'shop=pastry') return 'cafe';
  if (kind === 'shop=chemist') return 'drugstore';
  if (kind === 'shop=clothes') return 'fashion';
  if (kind === 'shop=books') return 'books';
  return null;
}
// Putzfarben auf dem Land, Holz- und Ziegeltöne für Scheunen
const RURAL_FACADES = ['#efe9dc', '#e9dfc6', '#e6d3a8', '#f0ebe0', '#ddd3c0', '#e8c9a4', '#d9d0bd', '#efe0b8', '#d8c3a5',
  '#e5ddd0', '#f1ece0', '#e2c48f', '#cdd3c2'];
const BARN_WALLS = ['#8a6446', '#7a5a40', '#9b7b5b', '#a8957c', '#b06a4f', '#8c8478'];
const FARM_TYPES = new Set(['barn', 'farm_auxiliary', 'stable', 'cowshed', 'silo', 'sty']);
const HALL_TYPES = new Set(['industrial', 'warehouse', 'retail', 'supermarket', 'commercial', 'hangar', 'manufacture']);
const REGION_TREE_DENSITY = { forest: 1 / 150, orchard: 1 / 140, park: 1 / 500, cemetery: 1 / 300, allotments: 1 / 600,
  scrub: 1 / 380, residential: 1 / 1700, meadow: 1 / 5000, farmyard: 1 / 2500 };
const tileKey = (ti, tj) => (ti + 512) * 1024 + (tj + 512);

class Region {
  constructor(world, R) {
    this.world = world;
    this.R = R;
    const T = world.data.terrain, G = R.grid;
    this.ok = !!T && Math.abs(R.meta.base - T.base) < 0.01 && Math.abs(G.minX - T.minX) < 0.01 && Math.abs(G.minZ - T.minZ) < 0.01 &&
      Math.abs(G.stepX - T.stepX) < 1e-6 && Math.abs(G.stepZ - T.stepZ) < 1e-6;
    if (!this.ok) return;
    // grobes Höhengitter (Dezimeter, Int16, base64)
    const bin = atob(G.h), n = bin.length / 2;
    this.gh = new Float32Array(n);
    for (let k = 0; k < n; k++) { let v = bin.charCodeAt(k * 2) | (bin.charCodeAt(k * 2 + 1) << 8); if (v > 32767) v -= 65536; this.gh[k] = v / 10; }
    this.gc0 = G.c0; this.gr0 = G.r0; this.gcols = G.cols; this.grows = G.rows;
    this.minX = G.minX; this.minZ = G.minZ; this.stepX = G.stepX; this.stepZ = G.stepZ;
    this.TC = R.meta.tileCells;
    this.N = this.TC * REGION.F;                         // feine Zellen je Kachel
    this.fx = this.stepX / REGION.F; this.fz = this.stepZ / REGION.F;
    this.tw = this.TC * this.stepX; this.th = this.TC * this.stepZ;
    // Innenstadt-Gelände (wird nicht doppelt gebaut)
    this.core = { minX: T.minX, minZ: T.minZ, maxX: T.minX + (T.cols - 1) * T.stepX, maxZ: T.minZ + (T.rows - 1) * T.stepZ,
      fc: (T.cols - 1) * REGION.F, fr: (T.rows - 1) * REGION.F };
    const S = R.tiles;
    this.ti0 = S.i0; this.tj0 = S.j0; this.tni = S.ni; this.tnj = S.nj; this.state = S.state;
    this.limits = { minX: this.tileX(S.i0), minZ: this.tileZ(S.j0), maxX: this.tileX(S.i0 + S.ni), maxZ: this.tileZ(S.j0 + S.nj) };
    this.loaded = new Map();
    this.treesOn = new Set();
    this.decodeGraph();
    this.places = R.places;
    this.ortho = window.COBURG_REGION_ORTHO && location.protocol !== 'file:' ? window.COBURG_REGION_ORTHO : null;
    this._near = [];
    this.stats = { built: 0, ms: 0 };
    this.anchors = new Map();       // Kachel -> Objekte, deren Höhe beim Bauen der Kachel nachgeführt wird
    this.lifeOn = new Set();
    this.night = false;
    this.initBridges();
  }

  // Objekt (Säule, Schild) auf das Gelände stellen; im Umland stimmt die Höhe erst, wenn die Kachel gebaut ist
  anchor(obj, x, z, dy) {
    obj.position.y = this.world.heightAt(x, z) + dy;
    if (this.inCore(x, z)) return;
    const [ti, tj] = this.tileOf(x, z), key = tileKey(ti, tj);
    if (!this.anchors.has(key)) this.anchors.set(key, []);
    this.anchors.get(key).push({ obj, x, z, dy });
  }

  tileX(ti) { return this.minX + ti * this.tw; }
  tileZ(tj) { return this.minZ + tj * this.th; }
  tileOf(x, z) { return [Math.floor((x - this.minX) / this.tw), Math.floor((z - this.minZ) / this.th)]; }
  stateOf(ti, tj) {
    const i = ti - this.ti0, j = tj - this.tj0;
    return i < 0 || j < 0 || i >= this.tni || j >= this.tnj ? 0 : this.state.charCodeAt(j * this.tni + i) - 48;
  }
  stateAt(x, z) { const [ti, tj] = this.tileOf(x, z); return this.stateOf(ti, tj); }
  inCore(x, z) { const C = this.core; return x >= C.minX && x <= C.maxX && z >= C.minZ && z <= C.maxZ; }

  // ---------------- Straßennetz ----------------
  decodeGraph() {
    const G = this.R.graph, names = this.R.names, cls = this.R.classes;
    this.graph = { nodes: G.nodes.map(v => v / 10), edges: [] };
    this.runs = new Map();          // Kachel -> [Kante, erster Punkt, letzter Punkt]
    this.netGrid = new U.Grid(40);  // alle Straßenabschnitte (Gewässer an Straßen offen lassen, auch ungebaute Kacheln)
    G.edges.forEach((e, ei) => {
      const p = [];
      let x = 0, z = 0;
      for (let k = 7; k < e.length; k += 2) { x += e[k]; z += e[k + 1]; p.push(x / 10, z / 10); }
      const h = cls[e[2]];
      this.graph.edges.push({ a: e[0], b: e[1], p, s: e[6] / 10, o: e[5] & 1 ? 1 : undefined, n: e[4] >= 0 ? names[e[4]] : undefined,
        h, w: e[3] / 10, br: !!(e[5] & 2) });
      for (let k = 0; k + 3 < p.length; k += 2) this.netGrid.insert(ei * 4096 + k / 2, Math.min(p[k], p[k + 2]), Math.min(p[k + 1], p[k + 3]), Math.max(p[k], p[k + 2]), Math.max(p[k + 1], p[k + 3]));
      // Abschnitte nach Kachel (Mitte des Abschnitts); in der Innenstadt zeichnet die Innenstadt selbst
      let run = null;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const mx = (p[k] + p[k + 2]) / 2, mz = (p[k + 1] + p[k + 3]) / 2;
        let key = null;
        if (!this.inCore(mx, mz)) { const [ti, tj] = this.tileOf(mx, mz); if (this.stateOf(ti, tj)) key = tileKey(ti, tj); }
        if (run && run.key === key) { run.k1 = k / 2 + 1; continue; }
        if (key !== null) {
          run = { key, e: ei, k0: k / 2, k1: k / 2 + 1 };
          if (!this.runs.has(key)) this.runs.set(key, []);
          this.runs.get(key).push(run);
        } else run = null;
      }
    });
  }

  // Straße (oder flache Brücke) in der Nähe? Hohe Brücken zählen nicht: unter ihnen bleibt das Wasser.
  roadNear(x, z, margin) {
    const list = this.netGrid.query(x, z, 14, this._rq || (this._rq = []));
    for (const code of list) {
      const e = this.graph.edges[Math.floor(code / 4096)], k = (code % 4096) * 2;
      if (e.deck) continue;
      const c = U.closestOnSeg(x, z, e.p[k], e.p[k + 1], e.p[k + 2], e.p[k + 3]);
      if (Math.hypot(c[0] - x, c[1] - z) < e.w / 2 + margin) return true;
    }
    return false;
  }

  // ---------------- Brücken ----------------
  // Brücken über Täler: Fahrbahn als Gerade zwischen den Brückenenden statt auf dem Gelände. Führt eine Brücke über
  // eine andere Straße, liegt sie dort BRIDGE.lift m über deren Fahrbahn; die Zufahrten steigen als Rampen
  // (höchstens BRIDGE.slope) auf den anschließenden Straßen an.
  initBridges() {
    this.bridgeGrid = new U.Grid(30);
    this.bridges = [];
    const E = this.graph.edges, step = BRIDGE.step;
    const adj = new Map();
    E.forEach((e, ei) => { for (const nd of [e.a, e.b]) { if (!adj.has(nd)) adj.set(nd, []); adj.get(nd).push(ei); } });
    this.nodeDeg = nd => (adj.get(nd) || []).length;
    // Höhenprofil einer Kante, alle `step` m (Fahrbahn ohne Brücke: Gelände)
    const make = (ei, linear) => {
      const e = E[ei], p = e.p, n = p.length / 2, cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
      const len = cum[n - 1], B = { ei, p, cum, len, w: e.w, prof: null, ramp: !linear };
      const m = Math.max(1, Math.ceil(len / step)), prof = new Float32Array(m + 1);
      const hA = this.fineAt(p[0], p[1]), hB = this.fineAt(p[n * 2 - 2], p[n * 2 - 1]);
      for (let j = 0; j <= m; j++) {
        const s = Math.min(len, j * step);
        if (linear) prof[j] = hA + (hB - hA) * s / (len || 1);
        else { const q = this.along(B, s); prof[j] = this.fineAt(q[0], q[1]); }
      }
      B.prof = prof;
      return B;
    };
    const ground = (B, j) => { const q = this.along(B, Math.min(B.len, j * step)); return this.fineAt(q[0], q[1]); };
    // Profil von Abstand s0 aus auf mindestens h anheben (mit Gefälle zu beiden Seiten)
    const raise = (B, s0, h) => {
      for (let j = 0; j < B.prof.length; j++) B.prof[j] = Math.max(B.prof[j], h - BRIDGE.slope * Math.abs(Math.min(B.len, j * step) - s0));
    };
    const decks = new Map(), under = new Set();
    E.forEach((e, ei) => {
      if (!e.br || e.p.every((v, k) => k % 2 || this.inCore(v, e.p[k + 1]))) return;
      const B = make(ei, true);
      if (B.len < 8) return;
      decks.set(ei, B);
    });
    // Kreuzungen mit Straßen unter der Brücke
    const lifts = [];
    for (const [ei, B] of decks) {
      const e = E[ei], p = e.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        const list = this.netGrid.query((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 1, this._rq || (this._rq = []));
        for (const code of list) {
          const oi = Math.floor(code / 4096), k = (code % 4096) * 2, o = E[oi];
          if (oi === ei || o.br || o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
          const t = segHit(ax, az, bx, bz, o.p[k], o.p[k + 1], o.p[k + 2], o.p[k + 3]);
          if (t === null) continue;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          under.add(oi);
          lifts.push([ei, B.cum[i / 2] + (B.cum[i / 2 + 1] - B.cum[i / 2]) * t, this.fineAt(x, z) + BRIDGE.lift]);
        }
      }
    }
    // Rampe an Knoten `nd` weiterführen: auf der geradesten anschließenden Straße
    const carry = (fromEi, nd, h, depth) => {
      const from = E[fromEi], fp = from.p, n = fp.length / 2;
      const atA = from.a === nd;
      const dx = atA ? fp[0] - fp[2] : fp[n * 2 - 2] - fp[n * 2 - 4], dz = atA ? fp[1] - fp[3] : fp[n * 2 - 1] - fp[n * 2 - 3];
      const dl = Math.hypot(dx, dz) || 1;
      let best = null, bestDot = 0.5;
      for (const ni of adj.get(nd) || []) {
        if (ni === fromEi || under.has(ni)) continue;
        const o = E[ni], op = o.p, m = op.length / 2;
        if (op.some((v, k) => !(k % 2) && this.inCore(v, op[k + 1]))) continue;
        const oa = o.a === nd;
        const ox = oa ? op[2] - op[0] : op[m * 2 - 4] - op[m * 2 - 2], oz = oa ? op[3] - op[1] : op[m * 2 - 3] - op[m * 2 - 1];
        const dot = (dx * ox + dz * oz) / dl / (Math.hypot(ox, oz) || 1);
        if (dot > bestDot) { bestDot = dot; best = ni; }
      }
      if (best === null) return;
      let B = decks.get(best);
      if (!B) { B = make(best, false); decks.set(best, B); }
      const o = E[best], s0 = o.a === nd ? 0 : B.len;
      raise(B, s0, h);
      const far = o.a === nd ? o.b : o.a, j = s0 ? 0 : B.prof.length - 1;
      const hf = B.prof[j];
      if (hf > ground(B, j) + 0.3 && depth < 6) carry(best, far, hf, depth + 1);
    };
    for (const [ei, s0, h] of lifts) raise(decks.get(ei), s0, h);
    for (const [ei, s0, h] of lifts) {
      const B = decks.get(ei), e = E[ei], last = B.prof.length - 1;
      if (B.prof[0] > ground(B, 0) + 0.3) carry(ei, e.a, B.prof[0], 0);
      if (B.prof[last] > ground(B, last) + 0.3) carry(ei, e.b, B.prof[last], 0);
    }
    for (const [ei, B] of decks) {
      const e = E[ei], p = B.p, n = p.length / 2;
      // nur echte Hochbrücken und Rampen: irgendwo mindestens 1,5 m (Rampen 0,5 m) über dem Gelände
      let gap = 0;
      for (let j = 0; j < B.prof.length; j++) gap = Math.max(gap, B.prof[j] - ground(B, j));
      if (gap < (B.ramp ? 0.5 : 1.5)) continue;
      e.deck = B;
      this.bridges.push(B);
      for (let i = 0; i < n - 1; i++) this.bridgeGrid.insert({ B, i }, Math.min(p[i * 2], p[i * 2 + 2]) - e.w, Math.min(p[i * 2 + 1], p[i * 2 + 3]) - e.w,
        Math.max(p[i * 2], p[i * 2 + 2]) + e.w, Math.max(p[i * 2 + 1], p[i * 2 + 3]) + e.w);
    }
  }
  deckH(B, s) {
    const f = U.clamp(s, 0, B.len) / BRIDGE.step, j = Math.min(Math.floor(f), B.prof.length - 2);
    if (j < 0) return B.prof[0];
    return B.prof[j] + (B.prof[j + 1] - B.prof[j]) * (f - j);
  }
  along(B, s) {
    const p = B.p, cum = B.cum;
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const t = U.clamp((s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), 0, 1);
    return [p[i * 2 - 2] + (p[i * 2] - p[i * 2 - 2]) * t, p[i * 2 - 1] + (p[i * 2 + 1] - p[i * 2 - 1]) * t];
  }
  // Fahrbahnhöhe an (x, z), falls dort eine Hochbrücke ist (sonst null)
  deckAt(x, z) {
    let best = null;
    for (const { B, i } of this.bridgeGrid.query(x, z, 0, this._bq || (this._bq = []))) {
      const p = B.p, c = U.closestOnSeg(x, z, p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      if (Math.hypot(c[0] - x, c[1] - z) > B.w / 2 + 0.4) continue;
      const h = this.deckH(B, B.cum[i] + (B.cum[i + 1] - B.cum[i]) * c[2]);
      if (best === null || h > best) best = h;
    }
    return best;
  }
  groundAt(x, z, y) {
    const h = this.world.heightAt(x, z);
    if (!this.bridges.length) return h;
    const d = this.deckAt(x, z);
    if (d !== null && d > h + 0.2 && (y === undefined || y > d - 2.5)) return d;
    return h;
  }

  // ---------------- Höhen ----------------
  // Gelände ohne Gewässer an beliebiger Stelle (auch in ungebauten Kacheln), wie das feine Gitter
  fineAt(x, z) {
    const fc = (x - this.minX) / this.fx, fr = (z - this.minZ) / this.fz;
    const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, tz = fr - r;
    const h00 = this.fine(c, r), h10 = this.fine(c + 1, r), h01 = this.fine(c, r + 1), h11 = this.fine(c + 1, r + 1);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }
  coarse(c, r) {
    c = U.clamp(c - this.gc0, 0, this.gcols - 1); r = U.clamp(r - this.gr0, 0, this.grows - 1);
    return this.gh[r * this.gcols + c];
  }
  // Höhe am feinen Gitterpunkt (fc, fr), gezählt ab der Nordwestecke der Innenstadt (wie in World.buildTerrainData)
  fine(fc, fr) {
    const F = REGION.F;
    const gr = fr / F, r0 = Math.floor(gr), tr = gr - r0, gc = fc / F, c0 = Math.floor(gc), tc = gc - c0;
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const row = k => cr(this.coarse(c0 - 1, r0 + k), this.coarse(c0, r0 + k), this.coarse(c0 + 1, r0 + k), this.coarse(c0 + 2, r0 + k), tc);
    return tr === 0 ? row(0) : cr(row(-1), row(0), row(1), row(2), tr);
  }
  // Feines Höhenraster einer Kachel mit einem Punkt Rand (für Normalen), Zeilenlänge N + 3
  makeHeights(t) {
    const N = this.N, S = N + 3, g = new Float32Array(S * S);
    const fc0 = t.ti * N - 1, fr0 = t.tj * N - 1;
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) g[r * S + c] = this.fine(fc0 + c, fr0 + r);
    t.hg0 = g; t.hs = S;
    t.hg = g;
    if (t.st !== 2 || typeof WaterSet === 'undefined') return;
    // Gewässer dieser und der Nachbarkacheln (damit die Ränder zueinander passen)
    const areas = [], lines = [];
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const w = this.waterOf(t.ti + a, t.tj + b);
      areas.push(...w.areas); lines.push(...w.lines);
    }
    t.waterAll = new WaterSet(areas, lines);
    if (t.waterAll.empty) return;
    t.hg = Float32Array.from(g);
    const x0 = this.tileX(t.ti) - this.fx, z0 = this.tileZ(t.tj) - this.fz;
    t.waterAll.carveGrid(t.hg, S * S, i => [x0 + (i % S) * this.fx, z0 + Math.floor(i / S) * this.fz],
      (x, z) => this.inCore(x, z) || this.roadNear(x, z, WATER.roadGap));
  }
  // Gewässer einer Kachel (Flächen und Mittellinien), zwischengespeichert
  waterOf(ti, tj) {
    const key = ti + ',' + tj;
    this._water = this._water || new Map();
    let w = this._water.get(key);
    if (!w) {
      const d = this.stateOf(ti, tj) ? this.decodeTile({ ti, tj }) : { areas: [], water: [] };
      w = { areas: d.areas.filter(a => a.k === 'water' || a.k === 'river'), lines: d.water };
      if (this._water.size > 200) this._water.clear();
      this._water.set(key, w);
    }
    return w;
  }
  heightAt0(x, z) {
    let fc = (x - this.minX) / this.fx, fr = (z - this.minZ) / this.fz;
    const N = this.N, ti = Math.floor(fc / N), tj = Math.floor(fr / N);
    const t = this.loaded.get(tileKey(ti, tj));
    if (!t || !t.hg0) return this.heightAt(x, z);
    let lc = U.clamp(fc - ti * N, 0, N - 0.0001), lr = U.clamp(fr - tj * N, 0, N - 0.0001);
    const c = Math.floor(lc), r = Math.floor(lr), tx = lc - c, tz = lr - r, S = t.hs, g = t.hg0;
    const i = (r + 1) * S + c + 1;
    const h00 = g[i], h10 = g[i + 1], h01 = g[i + S], h11 = g[i + S + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  heightAt(x, z) {
    let fc = (x - this.minX) / this.fx, fr = (z - this.minZ) / this.fz;
    const N = this.N, ti = Math.floor(fc / N), tj = Math.floor(fr / N);
    const t = this.loaded.get(tileKey(ti, tj));
    if (t && t.hg) {
      let lc = fc - ti * N, lr = fr - tj * N;
      lc = U.clamp(lc, 0, N - 0.0001); lr = U.clamp(lr, 0, N - 0.0001);
      const c = Math.floor(lc), r = Math.floor(lr), tx = lc - c, tz = lr - r, S = t.hs, g = t.hg;
      const i = (r + 1) * S + c + 1;
      const h00 = g[i], h10 = g[i + 1], h01 = g[i + S], h11 = g[i + S + 1];
      if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
      return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
    }
    // nicht gebaut: grobes Gitter (gleiche Dreiecksteilung)
    const gc = (x - this.minX) / this.stepX, gr = (z - this.minZ) / this.stepZ;
    const c = Math.floor(gc), r = Math.floor(gr), tx = gc - c, tz = gr - r;
    const h00 = this.coarse(c, r), h10 = this.coarse(c + 1, r), h01 = this.coarse(c, r + 1), h11 = this.coarse(c + 1, r + 1);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  // ---------------- Laden und Abbauen ----------------
  // Jeden Frame aufrufen: baut fehlende Kacheln in der Nähe (die unter dem Spieler sofort), baut ferne ab
  update(px, pz, force) {
    const [pi, pj] = this.tileOf(px, pz);
    const reach = Math.ceil(REGION.drop / Math.min(this.tw, this.th)) + 1;
    const want = [];
    for (let tj = pj - reach; tj <= pj + reach; tj++) for (let ti = pi - reach; ti <= pi + reach; ti++) {
      const st = this.stateOf(ti, tj);
      if (!st) continue;
      const d = this.rectDist(ti, tj, px, pz);
      const key = tileKey(ti, tj), t = this.loaded.get(key);
      if (d < REGION.load && !t) want.push({ ti, tj, key, st, d });
      if (t) {
        if (d > REGION.drop) { this.dispose(t); continue; }
        const treeOn = this.treesOn.has(key);
        if (!treeOn && d < REGION.trees && t.st === 2) want.push({ ti, tj, key, st, d, trees: true });
        else if (treeOn && d > REGION.treesDrop) this.dropTrees(t);
        this.hdNear(t, d);
        const lifeOn = this.lifeOn.has(key);
        if (!lifeOn && d < REGION.life && t.town) want.push({ ti, tj, key, st, d, life: true });
        else if (lifeOn && d > REGION.lifeDrop) this.dropLife(t);
      }
    }
    // Kacheln weit außerhalb (nach einer Schnellreise) abbauen
    if (this.loaded.size > 60 || force) for (const t of [...this.loaded.values()]) if (this.rectDist(t.ti, t.tj, px, pz) > REGION.drop) this.dispose(t);
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const w of want) {
      const urgent = force || w.d < 350;
      if (!urgent && performance.now() - t0 > REGION.budgetMs) break;
      if (w.trees) { const t = this.loaded.get(w.key); if (t) this.buildTrees(t); }
      else if (w.life) { const t = this.loaded.get(w.key); if (t) this.buildLife(t); }
      else this.buildTile(w);
      if (!urgent) break; // höchstens eine nicht dringende Kachel pro Bild
    }
  }
  rectDist(ti, tj, x, z) {
    const x0 = this.tileX(ti), z0 = this.tileZ(tj), x1 = x0 + this.tw, z1 = z0 + this.th;
    return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
  }
  // Alle Kacheln um einen Punkt sofort bauen (Spielstart, Schnellreise)
  ensure(x, z, radius = 900) {
    const [pi, pj] = this.tileOf(x, z);
    for (let tj = pj - 2; tj <= pj + 2; tj++) for (let ti = pi - 2; ti <= pi + 2; ti++) {
      const st = this.stateOf(ti, tj), key = tileKey(ti, tj);
      if (!st || this.rectDist(ti, tj, x, z) > radius) continue;
      let t = this.loaded.get(key);
      if (!t) t = this.buildTile({ ti, tj, key, st });
      if (st === 2 && !this.treesOn.has(key) && this.rectDist(ti, tj, x, z) < REGION.trees) this.buildTrees(t);
      if (t.town && !this.lifeOn.has(key) && this.rectDist(ti, tj, x, z) < REGION.life) this.buildLife(t);
    }
  }

  buildTile(w) {
    const t0 = performance.now();
    const t = { ti: w.ti, tj: w.tj, key: w.key, st: w.st, x0: this.tileX(w.ti), z0: this.tileZ(w.tj) };
    t.x1 = t.x0 + this.tw; t.z1 = t.z0 + this.th;
    t.group = new THREE.Group();
    t.edges = []; t.edgeGrid = new U.Grid(16); t.polyGrid = new U.Grid(32); t.roadGrid = new U.Grid(25);
    t.buildings = [];
    this.makeHeights(t);
    this.loaded.set(t.key, t);
    this.makeMaterials(t);
    this.buildTerrain(t);
    if (t.st === 2) {
      t.d = t.d || this.decodeTile(t);
      this.buildRoads(t);
      this.buildWater(t);
      this.buildBuildings(t);
      this.buildRails(t);
      t.town = t.buildings.length >= REGION.townBuildings;
    }
    this.world.group.add(t.group);
    for (const a of this.anchors.get(t.key) || []) a.obj.position.y = this.world.heightAt(a.x, a.z) + a.dy;
    this.stats.built++; this.stats.ms += performance.now() - t0;
    return t;
  }

  dispose(t) {
    this.dropTrees(t);
    this.dropLife(t);
    t.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    this.world.group.remove(t.group);
    for (const m of t.mats || []) m.dispose();
    if (t.tex) t.tex.dispose();
    if (t.texHd) t.texHd.dispose();
    t.disposed = true;
    this.loaded.delete(t.key);
  }

  // Kachel-Daten entpacken (Formate siehe tools/convert-region.js)
  decodeTile(t) {
    const raw = this.R.data[t.ti + ',' + t.tj] || {};
    const line = (a, from = 0) => { const o = []; let x = 0, z = 0; for (let k = from; k < a.length; k += 2) { x += a[k]; z += a[k + 1]; o.push(x / 10, z / 10); } return o; };
    const types = this.R.types, names = this.R.names;
    return {
      buildings: (raw.b || []).map(b => ({ t: types[b[0]], h: b[1] / 10, r: b[2] & 1, f: b[2] & 2, n: b[3] >= 0 ? names[b[3]] : undefined, p: line(b, 4) })),
      areas: (raw.a || []).map(a => ({ k: a[0], p: line(a[1]), ho: a[2] ? a[2].map(h => line(h)) : undefined })),
      trees: line(raw.t || []),
      water: (raw.w || []).map(w => ({ w: w[0] / 10, p: line(w, 1) })),
      rails: (raw.r || []).map(r => line(r)),
      shops: (raw.s || []).map(q => ({ name: q[0], kind: q[1], x: q[2] / 10, z: q[3] / 10 })),
    };
  }

  // ---------------- Material und Luftbild ----------------
  placeholder() {
    if (!this._ph) {
      const d = new Uint8Array([150, 172, 110, 255]);
      this._ph = new THREE.DataTexture(d, 1, 1); this._ph.colorSpace = THREE.SRGBColorSpace; this._ph.needsUpdate = true;
    }
    return this._ph;
  }
  makeMaterials(t) {
    if (!this._detail) this._detail = this.world.makeDetailTexture();
    t.terrainMat = new THREE.MeshLambertMaterial({ map: this.placeholder(), color: ORTHO_TINT });
    this.world.addDetail(t.terrainMat, this._detail);
    t.roofMat = new THREE.MeshLambertMaterial({ map: this.placeholder(), vertexColors: true });
    t.mats = [t.terrainMat, t.roofMat];
    const flag = this.ortho && this.ortho.tiles[t.ti + ',' + t.tj];
    t.photo = !!flag;
    if (flag) this.loadOrtho(t, flag);
    else if (t.st === 2) {
      // ohne Luftbild: Bodentextur aus den Flächen malen
      t.d = t.d || this.decodeTile(t);
      this.setTexture(t, new THREE.CanvasTexture(this.paintTile(t, 256)));
    }
  }
  setTexture(t, tex) {
    if (t.disposed) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.world.renderer.capabilities.getMaxAnisotropy();
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    t.tex = releaseAfterUpload(tex);
    if (t.hd === 'an') return; // schärferes Bild liegt schon
    t.terrainMat.map = tex; t.roofMat.map = tex;
  }
  // flag 1: Bayern, 2: nur Thüringen, 3: beides (weiße Flächen im bayerischen Bild aus dem thüringischen füllen)
  loadOrtho(t, flag) {
    const url = pre => `data/region/ortho/${pre}${t.ti}_${t.tj}.jpg`;
    const img = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const job = flag === 3 ? Promise.all([img(url('by')), img(url('th'))]).then(([a, b]) => {
      const cv = document.createElement('canvas'); cv.width = a.width; cv.height = a.height;
      const c = cv.getContext('2d');
      c.drawImage(b, 0, 0, a.width, a.height);
      const tb = c.getImageData(0, 0, a.width, a.height);
      c.drawImage(a, 0, 0);
      const ta = c.getImageData(0, 0, a.width, a.height), A = ta.data, B = tb.data;
      for (let k = 0; k < A.length; k += 4) if (A[k] > 246 && A[k + 1] > 246 && A[k + 2] > 246) { A[k] = B[k]; A[k + 1] = B[k + 1]; A[k + 2] = B[k + 2]; }
      c.putImageData(ta, 0, 0);
      return new THREE.CanvasTexture(cv);
    }) : img(url(flag === 2 ? 'th' : 'by')).then(im => { const tx = new THREE.Texture(im); tx.needsUpdate = true; return tx; });
    job.then(tex => this.setTexture(t, tex)).catch(e => console.warn('Luftbild fehlt', t.ti, t.tj, e));
  }
  // Schärferes Luftbild (tools/fetch-region-ortho-hd.js) für Kacheln direkt um den Spieler, weiter weg wieder das normale
  hdNear(t, d) {
    const H = window.COBURG_REGION_ORTHO_HD;
    if (!H || !this.ortho || !H.tiles[t.ti + ',' + t.tj]) return;
    if (d < 450 && !t.hd) {
      t.hd = 'laden';
      const im = new Image();
      im.onload = () => {
        if (t.disposed || t.hd !== 'laden') return;
        const tx = new THREE.Texture(im);
        tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = this.world.renderer.capabilities.getMaxAnisotropy();
        tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.needsUpdate = true;
        t.texHd = releaseAfterUpload(tx); t.hd = 'an';
        t.terrainMat.map = tx; t.roofMat.map = tx;
      };
      im.onerror = () => { t.hd = 'fehlt'; };
      im.src = `data/region/ortho/hd${t.ti}_${t.tj}.jpg`;
    } else if (d > 900 && t.hd === 'an') {
      t.terrainMat.map = t.tex || this.placeholder(); t.roofMat.map = t.tex || this.placeholder();
      t.texHd.dispose(); t.texHd = null; t.hd = null;
    } else if (d > 900 && t.hd === 'laden') t.hd = null;
  }

  // Gemalte Bodentextur einer Kachel (ohne Luftbild)
  paintTile(t, px) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const c = cv.getContext('2d');
    c.fillStyle = '#8a9f5a'; c.fillRect(0, 0, px, px);
    c.setTransform(px / this.tw, 0, 0, px / this.th, -t.x0 * px / this.tw, -t.z0 * px / this.th);
    const order = Object.keys(AREA_STYLE);
    const d = t.d || { areas: [], water: [], rails: [] };
    for (const a of d.areas.slice().sort((x, y) => order.indexOf(x.k) - order.indexOf(y.k))) {
      c.fillStyle = AREA_STYLE[a.k] || AREA_STYLE[{ farmyard: 'farmland', orchard: 'meadow', scrub: 'meadow', river: 'water' }[a.k]] || '#8a9f5a';
      this.world.pathPoly(c, a.p, a.ho); c.fill('evenodd');
    }
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = AREA_STYLE.water;
    for (const w of d.water) { c.lineWidth = Math.max(w.w, 2); this.world.pathLine(c, w.p); c.stroke(); }
    c.strokeStyle = '#7d756b';
    for (const r of d.rails) { c.lineWidth = 4; this.world.pathLine(c, r); c.stroke(); }
    return cv;
  }

  // ---------------- Gelände ----------------
  buildTerrain(t) {
    const N = this.N, S = N + 1, H = t.hg, HS = t.hs;
    const verts = S * S, skirtV = 4 * S;
    const pos = new Float32Array((verts + skirtV) * 3), nor = new Float32Array((verts + skirtV) * 3), uv = new Float32Array((verts + skirtV) * 2);
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
      const i = r * S + c, hi = (r + 1) * HS + c + 1;
      pos[i * 3] = t.x0 + c * this.fx; pos[i * 3 + 1] = H[hi]; pos[i * 3 + 2] = t.z0 + r * this.fz;
      const hx = (H[hi + 1] - H[hi - 1]) / (2 * this.fx), hz = (H[hi + HS] - H[hi - HS]) / (2 * this.fz);
      const l = Math.hypot(hx, 1, hz);
      nor[i * 3] = -hx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -hz / l;
      uv[i * 2] = c / N; uv[i * 2 + 1] = 1 - r / N;
    }
    const idx = [];
    const C = this.core, fcBase = t.ti * N, frBase = t.tj * N;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const gc = fcBase + c, gr = frBase + r;
      if (gc >= 0 && gc < C.fc && gr >= 0 && gr < C.fr) continue; // Innenstadt
      const a = r * S + c, b = a + 1, d = a + S, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    // Schürzen: Rand nach unten verlängert (beidseitig), verdeckt kleine Spalten zur Nachbarkachel
    const rim = [];
    for (let c = 0; c < S; c++) rim.push(c);                              // Norden
    for (let r = 0; r < S; r++) rim.push(r * S + N);                       // Osten
    for (let c = N; c >= 0; c--) rim.push(N * S + c);                      // Süden
    for (let r = N; r >= 0; r--) rim.push(r * S);                          // Westen
    let v = verts;
    const rimIdx = [];
    for (const i of rim.slice(0, skirtV)) {
      pos[v * 3] = pos[i * 3]; pos[v * 3 + 1] = pos[i * 3 + 1] - REGION.skirt; pos[v * 3 + 2] = pos[i * 3 + 2];
      nor[v * 3] = nor[i * 3]; nor[v * 3 + 1] = nor[i * 3 + 1]; nor[v * 3 + 2] = nor[i * 3 + 2];
      uv[v * 2] = uv[i * 2]; uv[v * 2 + 1] = uv[i * 2 + 1];
      rimIdx.push([i, v]); v++;
    }
    for (let k = 0; k + 1 < rimIdx.length; k++) {
      const [a, as] = rimIdx[k], [b, bs] = rimIdx[k + 1];
      if (pos[a * 3] === pos[b * 3] && pos[a * 3 + 2] === pos[b * 3 + 2]) continue;
      idx.push(a, as, b, b, as, bs, a, b, as, b, bs, as);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, t.terrainMat);
    m.receiveShadow = true;
    t.group.add(m);
  }

  // ---------------- Straßen ----------------
  roadMaterials() {
    if (!this._roadMat) {
      const mat = o => this.world.roadShader(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 - o, polygonOffsetUnits: -2 - o * 2 }));
      this._roadMat = mat(3); this._markMat = mat(5);
    }
    return [this._roadMat, this._markMat];
  }
  buildRoads(t) {
    const runs = this.runs.get(t.key);
    if (!runs) return;
    const W = this.world, roads = new Chunks(), marks = new Chunks();
    const rnd = U.rng(t.key);
    const white = new THREE.Color('#e9e6dc');
    const y = REGION.roadY;
    for (const run of runs) {
      const e = this.graph.edges[run.e];
      const raw = e.p.slice(run.k0 * 2, run.k1 * 2 + 2);
      for (let k = 0; k + 2 < raw.length; k += 2) {
        const ax = raw[k], az = raw[k + 1], bx = raw[k + 2], bz = raw[k + 3];
        t.roadGrid.insert({ ax, az, bx, bz, n: e.n, k: 'road', h: e.h, w: e.w }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
      }
      const pts = W.resample(raw, 4), n = pts.length / 2, half = e.w / 2;
      const col = U.color(/motorway|trunk/.test(e.h) ? '#45484c' : '#3d4045', 0.08, rnd);
      // Hochbrücke: Höhe entlang der Kante (Abstand ab Kantenanfang)
      const B = e.deck;
      const sAt = [];
      if (B) { let acc = B.cum[run.k0]; sAt.push(acc); for (let i = 1; i < n; i++) { acc += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]); sAt.push(acc); } }
      const hAt = (x, z, i) => B ? this.deckH(B, sAt[i]) : W.heightAt(x, z);
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let d1x = pts[i * 2] - pts[a * 2], d1z = pts[i * 2 + 1] - pts[a * 2 + 1];
        let d2x = pts[b * 2] - pts[i * 2], d2z = pts[b * 2 + 1] - pts[i * 2 + 1];
        let l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
        if (l1 < 1e-6) { d1x = d2x; d1z = d2z; l1 = l2; }
        if (l2 < 1e-6) { d2x = d1x; d2z = d1z; l2 = l1; }
        d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
        let tx = d1x + d2x, tz = d1z + d2z;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const miter = Math.min(1 / Math.max(0.35, tx * d2x + tz * d2z), 2.5);
        const nx = -tz * half * miter, nz = tx * half * miter, x = pts[i * 2], z = pts[i * 2 + 1];
        L.push([x + nx, hAt(x + nx, z + nz, i) + y, z + nz]);
        R.push([x - nx, hAt(x - nx, z - nz, i) + y, z - nz]);
      }
      if (B) this.bridgeStructure(t, B, pts, sAt, L, R);
      for (let i = 0; i < n - 1; i++) {
        const b = roads.get(pts[i * 2], pts[i * 2 + 1]);
        b.tri(L[i], R[i], R[i + 1], col, null, null, null, 0, 1, 0);
        b.tri(L[i], R[i + 1], L[i + 1], col, null, null, null, 0, 1, 0);
      }
      // runde Enden an echten Kantenenden (Kreuzungen)
      const ends = [];
      if (B) { /* Brückenenden liegen auf dem Gelände, die Kreuzung zeichnet die Nachbarstraße */ }
      else if (run.k0 === 0) ends.push(0);
      if (!B && run.k1 === e.p.length / 2 - 1) ends.push(n - 1);
      for (const ei of ends) {
        const x = pts[ei * 2], z = pts[ei * 2 + 1], b = roads.get(x, z);
        const c = [x, W.heightAt(x, z) + y, z];
        for (let s = 0; s < 10; s++) {
          const a1 = s / 10 * Math.PI * 2, a2 = (s + 1) / 10 * Math.PI * 2;
          const p1x = x + Math.cos(a1) * half, p1z = z + Math.sin(a1) * half, p2x = x + Math.cos(a2) * half, p2z = z + Math.sin(a2) * half;
          b.tri(c, [p1x, W.heightAt(p1x, p1z) + y, p1z], [p2x, W.heightAt(p2x, p2z) + y, p2z], col, null, null, null, 0, 1, 0);
        }
      }
      // Fahrbahnmarkierung (auf Brücken und Rampen auf der Fahrbahnhöhe)
      const hf = B ? (x, z) => { const d = this.deckAt(x, z); return d !== null ? d : W.heightAt(x, z); } : undefined;
      const big = BIG_ROADS.test(e.h);
      if (big) {
        // Randlinien, Mittelstreifen (zweibahnig: Leitplanke, sonst doppelte durchgezogene Linie), Spurtrennung
        for (const E of [L, R]) {
          const k = (half - 0.45) / half, side = [];
          for (let i = 0; i < n; i++) side.push(pts[i * 2] + (E[i][0] - pts[i * 2]) * k, pts[i * 2 + 1] + (E[i][2] - pts[i * 2 + 1]) * k);
          W.dashes(side, 1e9, 1, 0.065, y + 0.02, marks, white, hf);
        }
        if (e.o) { if (e.w >= 7) W.dashes(pts, 6, 12, 0.07, y + 0.02, marks, white, hf); }
        else if (e.w < BIG_MEDIAN_W) for (const o of [-0.14, 0.14]) W.dashes(this.offsetLine(pts, o), 1e9, 1, 0.06, y + 0.02, marks, white, hf);
      } else if (e.w >= 5.5 && !e.o && !/residential|living_street/.test(e.h)) W.dashes(pts, 3, 6, 0.07, y + 0.02, marks, white, hf);
      // Leitplanken an großen Straßen und auf Brücken/Rampen: erst nach den Häusern (Ortsdurchfahrten erkennen)
      if (big || B) (t.railJobs || (t.railJobs = [])).push({ e, run, pts, sAt, B, big });
    }
    const [rm, mm] = this.roadMaterials();
    if (t.bridgeParts) t.bridgeParts.meshes(this.world.buildingMaterials().plain, { cast: true, receive: true }).forEach(m => t.group.add(m));
    roads.meshes(rm, { receive: true }).forEach(m => t.group.add(m));
    marks.meshes(mm, { receive: true }).forEach(m => t.group.add(m));
  }

  // Linie parallel zur Polylinie im Abstand o (positiv: links)
  offsetLine(pts, o) {
    const n = pts.length / 2, out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = pts[b * 2] - pts[a * 2], dz = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(dx, dz) || 1;
      out.push(pts[i * 2] - dz / l * o, pts[i * 2 + 1] + dx / l * o);
    }
    return out;
  }

  // Leitplanken (verzinkt, Holm 0,45–0,78 m mit Pfosten) neben großen Straßen außerhalb der Orte, als Mittelstreifen
  // breiter zweibahniger Straßen und als unsichtbare Kante auf Brücken und Rampen. Sie halten nur Autos auf und nur
  // auf ihrer Höhe (Straßen darunter oder darüber bleiben frei). An Kreuzungen und Einmündungen bleiben sie offen.
  buildRails(t) {
    const jobs = t.railJobs;
    t.railJobs = null;
    t.rails = []; t.railGrid = new U.Grid(16);
    if (!jobs) return;
    const W = this.world, E = this.graph.edges, parts = new Chunks(), steel = new THREE.Color('#b9bdc1'), post = new THREE.Color('#7d8186');
    const town = (x, z) => t.polyGrid.query(x, z, 35, W._tmp).some(b => Math.abs(b.bb.minX - x) < 65 && Math.abs(b.bb.minZ - z) < 65);
    const quad = (b, a, c, d, e, col, nx, ny, nz) => { b.tri(a, c, d, col, null, null, null, nx, ny, nz); b.tri(a, d, e, col, null, null, null, nx, ny, nz); };
    // Höhe einer anderen Straße am Punkt (x, z) nahe ihrem Abschnitt k
    const levelOf = (o, k, x, z) => {
      if (!o.deck) return W.heightAt(x, z);
      const c = U.closestOnSeg(x, z, o.p[k], o.p[k + 1], o.p[k + 2], o.p[k + 3]);
      return this.deckH(o.deck, o.deck.cum[k / 2] + (o.deck.cum[k / 2 + 1] - o.deck.cum[k / 2]) * c[2]);
    };
    for (const { e, run, pts, sAt, B, big } of jobs) {
      const n = pts.length / 2, half = e.w / 2, ei = run.e;
      // Abstand ab Kantenanfang
      let s0 = 0;
      for (let k = 1; k <= run.k0; k++) s0 += Math.hypot(e.p[k * 2] - e.p[k * 2 - 2], e.p[k * 2 + 1] - e.p[k * 2 - 1]);
      let len = s0;
      for (let k = run.k0 + 1; k < e.p.length / 2; k++) len += Math.hypot(e.p[k * 2] - e.p[k * 2 - 2], e.p[k * 2 + 1] - e.p[k * 2 - 1]);
      const sE = [s0];
      for (let i = 1; i < n; i++) sE.push(sE[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
      const openA = this.nodeDeg(e.a) >= 3, openB = this.nodeDeg(e.b) >= 3;
      const lines = [];
      if (big || B) lines.push(half + 0.45, -(half + 0.45));
      if (big && !e.o && e.w >= BIG_MEDIAN_W) lines.push(0);
      for (const off of lines) {
        const P = [], ok = [];
        const line = this.offsetLine(pts, off);
        for (let i = 0; i < n; i++) {
          const x = line[i * 2], z = line[i * 2 + 1];
          const h = (B ? this.deckH(B, sAt[i]) : W.heightAt(x, z)) + REGION.roadY;
          P.push([x, h, z]);
          let free = !(openA && sE[i] < 16) && !(openB && sE[i] > len - 16);
          if (free) {
            // andere Fahrbahn auf gleicher Höhe direkt daneben: offen lassen
            for (const code of this.netGrid.query(x, z, 12, this._rq2 || (this._rq2 = []))) {
              const oi = Math.floor(code / 4096), k = (code % 4096) * 2, o = E[oi];
              if (oi === ei) continue;
              const c = U.closestOnSeg(x, z, o.p[k], o.p[k + 1], o.p[k + 2], o.p[k + 3]);
              if (Math.hypot(c[0] - x, c[1] - z) > o.w / 2 + 1.2) continue;
              if (Math.abs(levelOf(o, k, c[0], c[1]) + REGION.roadY - h) < 3) { free = false; break; }
            }
          }
          ok.push(free);
        }
        for (let i = 0; i < n - 1; i++) {
          if (!ok[i] || !ok[i + 1]) continue;
          const a = P[i], c = P[i + 1];
          t.rails.push(a[0], a[2], c[0], c[2], (a[1] + c[1]) / 2);
          t.railGrid.insert(t.rails.length / 5 - 1, Math.min(a[0], c[0]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[2], c[2]));
          // sichtbar nur neben großen Straßen außerhalb der Orte; auf Brücken steht schon die Brüstung
          const bare = B && (B.ramp ? Math.min(a[1] - W.heightAt(a[0], a[2]), c[1] - W.heightAt(c[0], c[2])) > 1.1 : true);
          if (bare || (!B && !big) || (e.h === 'primary' && off !== 0 && town(a[0], a[2]))) continue;
          const b = parts.get(a[0], a[2]);
          const dx = c[0] - a[0], dz = c[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
          const up = (q, d) => [q[0], q[1] + d, q[2]];
          quad(b, up(a, 0.45), up(c, 0.45), up(c, 0.78), up(a, 0.78), steel, nx, 0, nz);
          quad(b, up(a, 0.45), up(a, 0.78), up(c, 0.78), up(c, 0.45), steel, -nx, 0, -nz);
          quad(b, up(a, 0.78), up(c, 0.78), [c[0] + nx * 0.06, c[1] + 0.78, c[2] + nz * 0.06], [a[0] + nx * 0.06, a[1] + 0.78, a[2] + nz * 0.06], steel, 0, 1, 0);
          // Pfosten
          const r = 0.06, sq = [[-r, -r], [r, -r], [r, r], [-r, r]];
          for (let q = 0; q < 4; q++) {
            const [px, pz] = sq[q], [qx, qz] = sq[(q + 1) % 4];
            quad(b, [a[0] + px, a[1] - 0.3, a[2] + pz], [a[0] + qx, a[1] - 0.3, a[2] + qz], [a[0] + qx, a[1] + 0.72, a[2] + qz], [a[0] + px, a[1] + 0.72, a[2] + pz], post, px + qx, 0, pz + qz);
          }
        }
      }
    }
    parts.meshes(W.buildingMaterials().plain, { cast: true, receive: true }).forEach(m => t.group.add(m));
  }

  // Brückenbauwerk: Platte unter der Fahrbahn, Geländer, Pfeiler bis zum Gelände
  bridgeStructure(t, B, pts, sAt, L, R) {
    const parts = t.bridgeParts || (t.bridgeParts = new Chunks());
    const W = this.world, n = pts.length / 2;
    const concrete = new THREE.Color('#a9a59c'), rail = new THREE.Color('#8d8a84');
    const quad = (b, a, c, d, e, col, nx, ny, nz) => { b.tri(a, c, d, col, null, null, null, nx, ny, nz); b.tri(a, d, e, col, null, null, null, nx, ny, nz); };
    const dn = (p, h) => [p[0], p[1] - h, p[2]];
    for (let i = 0; i < n - 1; i++) {
      const b = parts.get(pts[i * 2], pts[i * 2 + 1]);
      const dx = pts[i * 2 + 2] - pts[i * 2], dz = pts[i * 2 + 3] - pts[i * 2 + 1], l = Math.hypot(dx, dz) || 1;
      const ox = -dz / l, oz = dx / l; // links
      if (B.ramp) {
        // Rampe: Stützmauern bis ins Gelände, Brüstung erst ab 1,2 m Höhe
        const gL = q => [q[0], W.heightAt(q[0], q[2]) - 0.5, q[2]];
        if (Math.max(L[i][1] - gL(L[i])[1], L[i + 1][1] - gL(L[i + 1])[1]) < 0.9) continue;
        quad(b, L[i], L[i + 1], gL(L[i + 1]), gL(L[i]), concrete, ox, 0, oz);
        quad(b, R[i], gL(R[i]), gL(R[i + 1]), R[i + 1], concrete, -ox, 0, -oz);
        if (Math.min(L[i][1] - gL(L[i])[1], L[i + 1][1] - gL(L[i + 1])[1]) < 1.7) continue;
      } else {
        // Unterseite und Seitenflächen der Platte (0,9 m stark)
        quad(b, dn(L[i], 0.9), dn(L[i + 1], 0.9), dn(R[i + 1], 0.9), dn(R[i], 0.9), concrete, 0, -1, 0);
        quad(b, L[i], L[i + 1], dn(L[i + 1], 0.9), dn(L[i], 0.9), concrete, ox, 0, oz);
        quad(b, R[i], dn(R[i], 0.9), dn(R[i + 1], 0.9), R[i + 1], concrete, -ox, 0, -oz);
      }
      // Geländer: Brüstung 0,9 m hoch auf beiden Seiten
      for (const [P, s] of [[L, 1], [R, -1]]) {
        const a = P[i], c = P[i + 1], up = q => [q[0], q[1] + 0.9, q[2]];
        quad(b, a, c, up(c), up(a), rail, ox * s, 0, oz * s);
        quad(b, a, up(a), up(c), c, rail, -ox * s, 0, -oz * s);
      }
    }
    // Widerlager: Wand unter den Brückenenden bis ins Gelände
    if (!B.ramp) for (const i of [0, n - 1]) {
      if (sAt[i] > 1 && sAt[i] < B.len - 1) continue;
      const g = q => [q[0], W.heightAt(q[0], q[2]) - 0.5, q[2]];
      if (L[i][1] - g(L[i])[1] < 1.6) continue;
      const dx = pts[Math.min(n - 1, i + 1) * 2] - pts[Math.max(0, i - 1) * 2], dz = pts[Math.min(n - 1, i + 1) * 2 + 1] - pts[Math.max(0, i - 1) * 2 + 1];
      const sg = i ? 1 : -1, b = parts.get(pts[i * 2], pts[i * 2 + 1]);
      quad(b, dn(L[i], 0.9), g(L[i]), g(R[i]), dn(R[i], 0.9), concrete, dx * sg, 0, dz * sg);
    }
    // Pfeiler alle ≈ 28 m, wo die Brücke hoch genug ist
    for (let i = 3; !B.ramp && i < n - 3; i += 7) {
      const x = pts[i * 2], z = pts[i * 2 + 1], top = this.deckH(B, sAt[i]) - 0.9, ground = W.heightAt(x, z);
      if (top - ground < 2) continue;
      const b = parts.get(x, z), r = Math.min(0.9, B.w * 0.12);
      const c = [[-r, -r], [r, -r], [r, r], [-r, r]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = c[k], [bx, bz] = c[(k + 1) % 4];
        quad(b, [x + ax, ground - 1, z + az], [x + bx, ground - 1, z + bz], [x + bx, top, z + bz], [x + ax, top, z + az], concrete, (ax + bx), 0, (az + bz));
      }
      // (keine Kollision: die Hindernisse sind flach und würden sonst auch oben auf der Fahrbahn bremsen)
    }
  }

  // ---------------- Wasser ----------------
  buildWater(t) {
    if (typeof WaterSet === 'undefined') return;
    const own = this.waterOf(t.ti, t.tj);
    if (!own.areas.length && !own.lines.length) return;
    const ws = new WaterSet(own.areas, own.lines);
    const inside = (x, z) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1 && !this.inCore(x, z);
    const surf = new Chunks();
    ws.buildSurface(surf, (x, z) => this.heightAt0(x, z), inside);
    surf.meshes(waterMaterial(), { receive: true }).forEach(m => t.group.add(m));
    ws.edges((ax, az, bx, bz) => {
      t.edges.push(ax, az, bx, bz);
      t.edgeGrid.insert(t.edges.length / 4 - 1, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }, (x, z) => this.roadNear(x, z, WATER.roadGap), { x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1 }, (x, z) => !this.inCore(x, z));
    t.rivers = new U.Grid(20);
    ws.riverPieces(q => t.rivers.insert(q, Math.min(q.ax, q.bx) - q.hw, Math.min(q.az, q.bz) - q.hw, Math.max(q.ax, q.bx) + q.hw, Math.max(q.az, q.bz) + q.hw),
      (x, z) => this.roadNear(x, z, WATER.roadGap), (x, z) => !this.inCore(x, z));
  }

  // ---------------- Orte: Laternen, Ladenschilder, Lokale, Fußgänger ----------------
  lifeAssets() {
    if (!this._life) {
      const pole = mergeGeos([[new THREE.CylinderGeometry(0.06, 0.09, 5.2, 6), 0, 2.6, 0], [new THREE.BoxGeometry(0.06, 0.06, 1.0), 0, 5.15, 0.45]]);
      const head = mergeGeos([[new THREE.BoxGeometry(0.5, 0.14, 0.3), 0, 5.08, 0.9]]);
      const glowTex = (() => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,214,140,0.55)'); g.addColorStop(1, 'rgba(255,214,140,0)');
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(cv);
      })();
      const glow = new THREE.PlaneGeometry(10, 10); glow.rotateX(-Math.PI / 2);
      const P = this.props;
      this._life = { pole, head, glow, poleMat: new THREE.MeshLambertMaterial({ color: '#2e3236' }),
        headMat: P && P.lampMat ? P.lampMat : new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffd890', emissiveIntensity: 0.05 }),
        glowMat: new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }) };
    }
    return this._life;
  }
  buildLife(t) {
    if (this.lifeOn.has(t.key) || !t.d) return;
    this.lifeOn.add(t.key);
    const W = this.world, life = t.life = { meshes: [], venues: [], segs: [] };
    const near = (x, z, r) => t.polyGrid.query(x, z, r, W._tmp).some(b => Math.abs(b.bb.minX - x) < r + 30 && Math.abs(b.bb.minZ - z) < r + 30);
    // Laternen alle ≈ 30 m an Ortsstraßen (abwechselnd links und rechts), Gehwege für Fußgänger
    const lamps = [];
    for (const run of this.runs.get(t.key) || []) {
      const e = this.graph.edges[run.e];
      if (!LAMP_ROADS.test(e.h) || e.deck) continue;
      const p = e.p;
      let segStart = 0, nextAt = 15, side = (run.e % 2) ? 1 : -1;
      for (let k = run.k0; k < run.k1; k++) {
        const ax = p[k * 2], az = p[k * 2 + 1], bx = p[k * 2 + 2], bz = p[k * 2 + 3], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.1) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const town = near(mx, mz, 30);
        if (town) life.segs.push({ ax, az, bx, bz, n: e.n, k: 'road', h: e.h, w: e.w });
        for (; nextAt < segStart + len; nextAt += 30) {
          const s = nextAt - segStart, x0 = ax + dx * s, z0 = az + dz * s;
          if (!near(x0, z0, 25)) { side = -side; continue; }
          const off = e.w / 2 + 0.7, x = x0 - dz * off * side, z = z0 + dx * off * side;
          side = -side;
          if (this.insideBuilding(x, z, 0.4, t) || W.collideCircle(x, z, 0.3, {}).hit) continue;
          lamps.push({ x, z, y: W.heightAt(x, z), ry: Math.atan2(dz * -side, -dx * -side) });
        }
        segStart += len;
      }
    }
    if (lamps.length) {
      const A = this.lifeAssets(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
      const poles = new THREE.InstancedMesh(A.pole, A.poleMat, lamps.length), heads = new THREE.InstancedMesh(A.head, A.headMat, lamps.length);
      const glows = new THREE.InstancedMesh(A.glow, A.glowMat, lamps.length);
      lamps.forEach((l, i) => {
        q.setFromAxisAngle(up, l.ry); ps.set(l.x, l.y, l.z); m4.compose(ps, q, one);
        poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
        ps.set(l.x + Math.sin(l.ry) * 0.9, l.y + 0.08, l.z + Math.cos(l.ry) * 0.9); q.identity(); m4.compose(ps, q, one); glows.setMatrixAt(i, m4);
      });
      poles.castShadow = heads.castShadow = true; glows.visible = this.night;
      for (const m of [poles, heads, glows]) { m.computeBoundingSphere(); t.group.add(m); life.meshes.push(m); }
      life.glow = glows;
    }
    // Ladenschilder an den Fassaden und begehbare Lokale (Döner, Gasthaus, Café, Mode, Drogerie, Bücher)
    if (t.d.shops.length && this.props && this.props.signsFor) {
      const placed = new U.Grid(20);
      const res = this.props.signsFor(t.d.shops.map(q => [q.name, q.kind, q.x, q.z]), {
        atlas: 1024, maxDist: Infinity,
        crowded: (x, z, r) => placed.query(x, z, r).some(o => Math.hypot(o.x - x, o.z - z) < r),
        mark: (x, z) => placed.insert({ x, z }, x, z, x, z),
      });
      for (const m of res.meshes) { t.group.add(m); life.meshes.push(m); }
      life.signMats = res.mats;
      for (const mt of res.mats) mt.emissiveIntensity = this.night ? 0.85 : 0;
    }
    if (this.property) {
      let n = 0;
      for (const q of t.d.shops) {
        const type = regionVenueType(q.name, q.kind);
        if (!type || n >= 4) continue;
        const r = W.nearestRoad(q.x, q.z, 60, s => !!s.n);
        const v = this.property.placeVenue({ id: 'r' + Math.round(q.x) + '_' + Math.round(q.z), name: q.name, street: r ? r.seg.n : '', type, x: q.x, z: q.z });
        if (v) { life.venues.push(v); n++; }
      }
    }
    this.lifeChanged = true;
  }
  dropLife(t) {
    if (!this.lifeOn.has(t.key)) return;
    this.lifeOn.delete(t.key);
    const life = t.life;
    t.life = null;
    this.lifeChanged = true;
    if (!life) return;
    for (const m of life.meshes) { t.group.remove(m); if (m.isInstancedMesh) m.dispose(); else if (m.geometry) m.geometry.dispose(); }
    for (const mt of life.signMats || []) { if (mt.map) mt.map.dispose(); mt.dispose(); }
    if (this.property) for (const v of life.venues) this.property.removeVenue(v);
  }
  // Gehwege aller Orte in der Nähe (für die Fußgänger)
  lifeSegments() {
    const out = [];
    for (const key of this.lifeOn) { const t = this.loaded.get(key); if (t && t.life) out.push(...t.life.segs); }
    return out;
  }
  setNight(n) {
    this.night = n;
    for (const key of this.lifeOn) {
      const t = this.loaded.get(key);
      if (!t || !t.life) continue;
      if (t.life.glow) t.life.glow.visible = n;
      for (const mt of t.life.signMats || []) mt.emissiveIntensity = n ? 0.85 : 0;
    }
  }

  // ---------------- Gebäude ----------------
  buildBuildings(t) {
    const W = this.world, list = t.d.buildings;
    if (!list.length) return;
    const walls = new Chunks(), plain = new Chunks(), roofs = new Chunks();
    const rnd = U.rng(t.key * 7 + 3);
    const BAY_W = 3.2 * 4, BAY_H = 3.1 * 4;
    const photoCol = new THREE.Color(ORTHO_TINT);
    const tuv = (x, z) => [(x - t.x0) / this.tw, 1 - (z - t.z0) / this.th];
    for (const b of list) {
      const ring = b.p, n = ring.length / 2;
      let minH = Infinity, maxH = -Infinity;
      for (let i = 0; i < ring.length; i += 2) { const h = W.heightAt0(ring[i], ring[i + 1]); if (h < minH) minH = h; if (h > maxH) maxH = h; }
      const isCanopy = b.t === 'roof' || b.t === 'carport';
      const top = Math.max(minH + b.h, maxH + 2.2), base = isCanopy ? top - 0.6 : minH - 2;
      const bb = U.polyBBox(ring), cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
      const farm = FARM_TYPES.has(b.t), hall = HALL_TYPES.has(b.t);
      const plainType = PLAIN_TYPES.has(b.t) || farm || hall || isCanopy;
      const hex = farm ? BARN_WALLS[Math.floor(rnd() * BARN_WALLS.length)] : hall ? '#c5c1b7' : PLAIN_TYPES.has(b.t) ? '#a7a39a'
        : /church|chapel|cathedral/.test(b.t) ? '#e6dfcc' : b.t === 'castle' ? '#d8ccae' : RURAL_FACADES[Math.floor(rnd() * RURAL_FACADES.length)];
      const wallCol = U.color(hex, 0.1, rnd);
      const wb = plainType ? plain.get(cx, cz) : walls.get(cx, cz), pb = plain.get(cx, cz);
      const area = U.polyArea(ring), sgn = area > 0 ? 1 : -1;
      let along = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
        if (len < 0.01) continue;
        const ox = sgn * dz / len, oz = -sgn * dx / len;
        const u0 = along / BAY_W, u1 = (along + len) / BAY_W, v0 = (base - minH) / BAY_H, v1 = (top - minH) / BAY_H;
        along += len;
        const A0 = [ax, base, az], B0 = [bx, base, bz], B1 = [bx, top, bz], A1 = [ax, top, az];
        wb.tri(A0, B0, B1, wallCol, [u0, v0], [u1, v0], [u1, v1], ox, 0, oz);
        wb.tri(A0, B1, A1, wallCol, [u0, v0], [u1, v1], [u0, v1], ox, 0, oz);
        if (!isCanopy) { t.edges.push(ax, az, bx, bz); t.edgeGrid.insert(t.edges.length / 4 - 1, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)); }
      }
      // Dach: mit Luftbild das Foto von oben, sonst Ziegel- oder Flachdachfarbe
      const rt = t.photo ? { b: roofs.get(cx, cz), uv: tuv } : { b: plain.get(cx, cz) };
      const roofCol = t.photo ? photoCol : U.color(b.r || HIP_TYPES.has(b.t) ? TILE_ROOFS[Math.floor(rnd() * TILE_ROOFS.length)] : '#7c7973', 0.12, rnd);
      const absA = Math.abs(area);
      if (isCanopy) W.flatRoof({ b: pb }, [ring], base, roofCol, -1);
      if (/tower/.test(b.t) && absA < 200) W.pyramidRoof(rt, ring, top, roofCol, Math.sqrt(absA) * 1.1);
      else if (b.r && n === 4) W.gableRoof(rt, pb, ring, top, wallCol, roofCol);
      else if (!b.f && !isCanopy && (HIP_TYPES.has(b.t) || farm) && absA > 25 && absA < 3500 && b.h < 28 && W.hipRoof(rt, ring, top, roofCol)) { /* Walmdach */ }
      else W.flatRoof(rt, [ring], top, roofCol, 1);
      if (!isCanopy) {
        const rec = { p: ring, bb, top, n: b.n, t: b.t };
        t.buildings.push(rec);
        t.polyGrid.insert(rec, bb.minX, bb.minZ, bb.maxX, bb.maxZ);
      }
    }
    const mats = W.buildingMaterials();
    walls.meshes(mats.wall, { cast: true, receive: true }).forEach(m => t.group.add(m));
    plain.meshes(mats.plain, { cast: true, receive: true }).forEach(m => t.group.add(m));
    roofs.meshes(t.roofMat, { cast: true, receive: true }).forEach(m => t.group.add(m));
  }

  // ---------------- Bäume ----------------
  treeAssets() {
    if (!this._trees) {
      // gleiche Formen wie in der Innenstadt (js/world.js), aber gröber, weil hier viel mehr Bäume stehen
      const A = treeAssets(0);
      this.world.leafShader(A.leafMat);
      this._trees = { trunk: A.trunk, leaf: A.crowns[1], pine: A.pine, trunkMat: A.trunkMat, leafMat: A.leafMat };
    }
    return this._trees;
  }
  buildTrees(t) {
    if (this.treesOn.has(t.key) || !t.d) return;
    this.treesOn.add(t.key);
    const pts = [];
    const d = t.d;
    const wet = (x, z) => t.waterAll && !t.waterAll.empty && t.waterAll.carveAt(x, z) > 0; // keine Bäume im Wasser
    for (let i = 0; i < d.trees.length; i += 2) if (!wet(d.trees[i], d.trees[i + 1])) pts.push([d.trees[i], d.trees[i + 1], 0]);
    let budget = 7000;
    for (const a of d.areas) {
      const dens = REGION_TREE_DENSITY[a.k];
      if (!dens || budget <= 0) continue;
      const area = Math.abs(U.polyArea(a.p)), count = Math.min(Math.round(area * dens), budget);
      const bb = U.polyBBox(a.p), rnd = U.rng(U.hashStr(a.k + a.p[0] + ',' + a.p[1]));
      let made = 0;
      for (let tries = 0; made < count && tries < count * 3; tries++) {
        const x = bb.minX + rnd() * (bb.maxX - bb.minX), z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
        if (this.inCore(x, z) || !U.pointInPoly(x, z, a.p)) continue;
        if (a.ho && a.ho.some(h => U.pointInPoly(x, z, h))) continue;
        if (this.insideBuilding(x, z, 1.5, t) || this.nearRoad(x, z, 1.5, t) || wet(x, z)) continue;
        pts.push([x, z, a.k === 'forest' && rnd() < 0.5 ? 1 : 0]);
        made++;
      }
      budget -= made;
    }
    if (!pts.length) return;
    const A = this.treeAssets(), rnd = U.rng(t.key);
    const leaves = pts.filter(p => !p[2]), pines = pts.filter(p => p[2]);
    const trunks = new THREE.InstancedMesh(A.trunk, A.trunkMat, pts.length);
    const lm = leaves.length ? new THREE.InstancedMesh(A.leaf, A.leafMat, leaves.length) : null;
    const pm = pines.length ? new THREE.InstancedMesh(A.pine, A.leafMat, pines.length) : null;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const greens = ['#5f8d3e', '#4f7d35', '#6a9a45', '#577f3a', '#7a9e4a', '#46703a'];
    t.trees = []; t.treeGrid = new U.Grid(16);
    let li = 0, pi = 0;
    pts.forEach((p, i) => {
      const s = 0.75 + rnd() * 0.7;
      q.setFromAxisAngle(up, rnd() * 6.28);
      ps.set(p[0], this.heightAt(p[0], p[1]) - 0.2, p[1]); sc.set(s, s * (0.85 + rnd() * 0.35), s);
      m4.compose(ps, q, sc);
      trunks.setMatrixAt(i, m4);
      const col = new THREE.Color(p[2] ? '#3f6634' : greens[Math.floor(rnd() * greens.length)]).multiplyScalar(0.85 + rnd() * 0.3);
      if (p[2]) { pm.setMatrixAt(pi, m4); pm.setColorAt(pi++, col); } else { lm.setMatrixAt(li, m4); lm.setColorAt(li++, col); }
      t.trees.push(p[0], p[1], 0.35 * s);
      t.treeGrid.insert(t.trees.length / 3 - 1, p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1);
    });
    t.treeMeshes = [trunks, lm, pm].filter(Boolean);
    for (const m of t.treeMeshes) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); t.group.add(m); }
  }
  dropTrees(t) {
    if (!this.treesOn.has(t.key)) return;
    this.treesOn.delete(t.key);
    for (const m of t.treeMeshes || []) { t.group.remove(m); m.dispose(); }
    t.treeMeshes = null; t.trees = null; t.treeGrid = null;
  }

  // ---------------- Abfragen ----------------
  // geladene Kacheln, deren Rechteck (um margin erweitert) den Punkt enthält
  tilesNear(x, z, margin) {
    const out = this._near; out.length = 0;
    const [ti, tj] = this.tileOf(x, z);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const t = this.loaded.get(tileKey(ti + a, tj + b));
      if (t && x > t.x0 - margin && x < t.x1 + margin && z > t.z0 - margin && z < t.z1 + margin) out.push(t);
    }
    return out;
  }
  insideBuilding(x, z, margin, only) {
    const tiles = only ? [only] : this.tilesNear(x, z, 120);
    for (const t of tiles) {
      const list = t.polyGrid.query(x, z, 0, this.world._tmp);
      for (const b of list) {
        if (x < b.bb.minX - margin || x > b.bb.maxX + margin || z < b.bb.minZ - margin || z > b.bb.maxZ + margin) continue;
        if (U.pointInPoly(x, z, b.p)) return b;
      }
    }
    return null;
  }
  nearRoad(x, z, margin, only) {
    const tiles = only ? [only] : this.tilesNear(x, z, 30);
    for (const t of tiles) for (const s of t.roadGrid.query(x, z, 10, this.world._tmp)) {
      const c = U.closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      if (Math.hypot(c[0] - x, c[1] - z) < s.w / 2 + margin) return s;
    }
    return null;
  }
  nearestRoad(x, z, maxDist, filter, best) {
    let bestD = best ? best.d : maxDist;
    for (const t of this.tilesNear(x, z, maxDist).slice()) for (const s of t.roadGrid.query(x, z, maxDist, [])) {
      if (filter && !filter(s)) continue;
      const c = U.closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz), dd = Math.hypot(c[0] - x, c[1] - z);
      if (dd < bestD) { bestD = dd; best = { seg: s, x: c[0], z: c[1], d: dd }; }
    }
    return best;
  }
  // Kollision mit Häusern und Bäumen des Umlands; verschiebt out.x/out.z
  collide(out, r, y) {
    let x = out.x, z = out.z, moved = false;
    for (const t of this.tilesNear(x, z, 90).slice()) {
      // Leitplanken und Brückenkanten: nur für Autos (mit Höhe y) und nur auf ihrer Höhe
      if (y !== undefined && t.railGrid) {
        const RL = t.rails, list = t.railGrid.query(x, z, r + 1, this.world._tmp);
        for (let n = 0; n < list.length; n++) {
          const e = list[n] * 5;
          if (Math.abs(RL[e + 4] - y) > 2) continue;
          const c = U.closestOnSeg(x, z, RL[e], RL[e + 1], RL[e + 2], RL[e + 3]);
          const dx = x - c[0], dz = z - c[1], d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
            x += nx * (r - d); z += nz * (r - d);
            out.nx += nx; out.nz += nz; out.hit = true; moved = true;
          }
        }
      }
      const E = t.edges, list = t.edgeGrid.query(x, z, r + 1, this.world._tmp);
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        const c = U.closestOnSeg(x, z, E[e * 4], E[e * 4 + 1], E[e * 4 + 2], E[e * 4 + 3]);
        const dx = x - c[0], dz = z - c[1], d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
          x += nx * (r - d); z += nz * (r - d);
          out.nx += nx; out.nz += nz; out.hit = true; moved = true;
        }
      }
      if (t.rivers) {
        out.x = x; out.z = z;
        if (pushFromRivers(t.rivers, out, r, this.world._tmp)) { x = out.x; z = out.z; moved = true; }
      }
      if (!t.treeGrid) continue;
      const TR = t.trees, tl = t.treeGrid.query(x, z, r + 1, this.world._tmp);
      for (let n = 0; n < tl.length; n++) {
        const k = tl[n], dx = x - TR[k * 3], dz = z - TR[k * 3 + 1], rr = r + TR[k * 3 + 2], d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
          x += nx * (rr - d); z += nz * (rr - d);
          out.nx += nx; out.nz += nz; out.hit = true; moved = true;
        }
      }
    }
    out.x = x; out.z = z;
    return moved;
  }
  // Rand der befahrbaren Kacheln: zurück auf die nächste befahrbare Kachel schieben
  clamp(out) {
    const [ti, tj] = this.tileOf(out.x, out.z);
    if (this.stateOf(ti, tj) === 2) return;
    let best = null, bd = Infinity;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      if (this.stateOf(ti + a, tj + b) !== 2) continue;
      const x0 = this.tileX(ti + a) + 0.5, z0 = this.tileZ(tj + b) + 0.5, x1 = x0 + this.tw - 1, z1 = z0 + this.th - 1;
      const x = U.clamp(out.x, x0, x1), z = U.clamp(out.z, z0, z1), d = Math.hypot(x - out.x, z - out.z);
      if (d < bd) { bd = d; best = [x, z]; }
    }
    if (!best) return;
    const dx = best[0] - out.x, dz = best[1] - out.z, l = Math.hypot(dx, dz) || 1;
    out.x = best[0]; out.z = best[1]; out.hit = true; out.nx = dx / l; out.nz = dz / l;
  }
  walkable(x, z) { return this.stateAt(x, z) === 2; }

  // Nächster Ort (Stadt, Dorf, Ortsteil) im Umkreis, für die Ortsanzeige
  placeAt(x, z, maxD = 1600) {
    let best = null, bd = Infinity;
    for (const p of this.places) {
      if (!/city|town|village|suburb|hamlet|quarter/.test(p.k)) continue;
      const w = p.k === 'town' || p.k === 'city' ? 0.55 : p.k === 'village' ? 0.8 : 1;
      const d = Math.hypot(p.x - x, p.z - z) * w;
      if (d < bd && d < maxD) { bd = d; best = p; }
    }
    return best;
  }

  // ---------------- Karte ----------------
  // Minikarte: Häuser und Straßen der gebauten Kacheln im Umkreis r (Weltkoordinaten, k Pixel pro Meter)
  drawNear(ctx, x, z, r, k) {
    const tiles = [...this.loaded.values()].filter(t => t.st === 2 && this.rectDist(t.ti, t.tj, x, z) < r);
    ctx.fillStyle = '#c9bba6';
    for (const t of tiles) for (const b of t.buildings) {
      if (Math.abs(b.bb.minX - x) > r || Math.abs(b.bb.minZ - z) > r) continue;
      this.world.pathPoly(ctx, b.p); ctx.fill();
    }
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const t of tiles) {
        const runs = this.runs.get(t.key) || [];
        for (const run of runs) {
          const e = this.graph.edges[run.e];
          const major = /motorway|trunk|primary|secondary/.test(e.h);
          ctx.strokeStyle = pass ? (major ? '#f7d58b' : '#ffffff') : '#a49c8c';
          ctx.lineWidth = Math.max(e.w + (pass ? 0 : 3), (pass ? 3 : 5) / k);
          ctx.beginPath();
          for (let i = run.k0; i <= run.k1; i++) i === run.k0 ? ctx.moveTo(e.p[i * 2], e.p[i * 2 + 1]) : ctx.lineTo(e.p[i * 2], e.p[i * 2 + 1]);
          ctx.stroke();
        }
      }
    }
  }

  // Übersichtskarte des Landkreises (S Pixel pro Meter), in Teilen gemalt: paintMap(cb) ruft cb(canvas, scale)
  paintMap(done) {
    const L = this.limits, S = 0.08;
    const W = Math.ceil((L.maxX - L.minX) * S), H = Math.ceil((L.maxZ - L.minZ) * S);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = '#3a4535'; c.fillRect(0, 0, W, H);
    c.setTransform(S, 0, 0, S, -L.minX * S, -L.minZ * S);
    // befahrbare Kacheln hell, Randkacheln etwas dunkler
    for (let j = 0; j < this.tnj; j++) for (let i = 0; i < this.tni; i++) {
      const st = this.state.charCodeAt(j * this.tni + i) - 48;
      if (!st) continue;
      c.fillStyle = st === 2 ? '#ece8dc' : '#b9bcae';
      c.fillRect(this.tileX(this.ti0 + i) - 1, this.tileZ(this.tj0 + j) - 1, this.tw + 2, this.th + 2);
    }
    const keys = Object.keys(this.R.data);
    const order = Object.keys(MAP_STYLE);
    let k = 0;
    const MAPK = { farmyard: 'farmland', orchard: 'meadow', scrub: 'meadow', river: 'water' };
    const stepPaint = () => {
      const t0 = performance.now();
      while (k < keys.length && performance.now() - t0 < 12) {
        const [ti, tj] = keys[k++].split(',').map(Number);
        const d = this.decodeTile({ ti, tj });
        for (const a of d.areas.sort((x, y) => order.indexOf(MAPK[x.k] || x.k) - order.indexOf(MAPK[y.k] || y.k))) {
          const col = MAP_STYLE[MAPK[a.k] || a.k];
          if (!col) continue;
          c.fillStyle = col; this.world.pathPoly(c, a.p, a.ho); c.fill('evenodd');
        }
        c.lineCap = c.lineJoin = 'round';
        c.strokeStyle = MAP_STYLE.water;
        for (const w of d.water) { c.lineWidth = Math.max(w.w, 8); this.world.pathLine(c, w.p); c.stroke(); }
        c.fillStyle = '#c9bba6';
        for (const b of d.buildings) { this.world.pathPoly(c, b.p); c.fill(); }
      }
      if (k < keys.length) { setTimeout(stepPaint, 0); return; }
      // Straßen nach Klasse
      const E = this.graph.edges;
      const draw = (re, color, w) => {
        c.strokeStyle = color; c.lineWidth = w;
        for (const e of E) if (re.test(e.h)) { this.world.pathLine(c, e.p); c.stroke(); }
      };
      draw(/residential|living|unclassified/, '#ffffff', 14);
      draw(/tertiary/, '#fff4c2', 22);
      draw(/secondary/, '#f7d58b', 28);
      draw(/primary|trunk/, '#f2b25c', 34);
      draw(/motorway/, '#e98a6a', 40);
      done(cv, S);
    };
    stepPaint();
  }
}
