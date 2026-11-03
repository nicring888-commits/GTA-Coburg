// Gewerbe, Industrie, moderne Höfe und Ortsränder im Umland (seit v3.7.0, Grafik-Fahrplan Phase 3): Hallen je Art
// (Stahlhalle, Gewerbehalle, Markt/Discounter, Agrarhalle) mit flachem Satteldach bzw. Attika, Vordach und Toren,
// runde Behälter (Biogas-Kuppel, Silo, Güllebehälter), Fahrsilos an modernen Höfen, Tankstellen unter den echten
// OSM-Tankdächern (Blende in Markenfarbe, Zapfinseln, Preismast), Parkplatz-Markierungen, Ortstafeln am Ortsrand.
// Alles als Dreiecke in den Töpfen der Kachel (wie js/houses.js); Schrift (Preismast, Ortstafel) in einem kleinen
// Atlas je Kachel, nur in Spielernähe (Region.buildLife). Die Fassaden der Hallen malt der Fassadenshader (js/world.js,
// Stil 6/7, Feld „Tür“ = Art × 16 + Tore).
'use strict';

const HALL = { STAHL: 0, GEWERBE: 1, MARKT: 2, AGRAR: 3 };
const HALL_WALLS = [
  ['#c5c8c9', '#b9bec4', '#d6d8d8', '#8e9aa3', '#a9b0a8', '#7f8d93', '#c9c4b5', '#6f7c86'],   // Stahlhalle
  ['#d8d8d4', '#c9ccce', '#e4e2dc', '#b8bec4', '#d3cfc5', '#9aa3aa', '#e9e9e6'],              // Gewerbe
  ['#ecebe7', '#e2e2de', '#f2f1ed', '#d9dadb', '#cfd2d4'],                                    // Markt
  ['#7a5a3c', '#8b6a48', '#6e5a46', '#b7b9b4', '#8f9a8c', '#6f7f6c', '#a39d90'],              // Agrar (Holz, Blech)
];
// Tankstellen-Marken: [Muster, Blende, Streifen, Schrift]
const FUEL_BRANDS = [
  [/aral/i, '#0b4ea2', '#ffffff', '#ffffff'], [/shell/i, '#fbce07', '#dd1d21', '#dd1d21'], [/esso/i, '#ffffff', '#d31f26', '#1c3f94'],
  [/total/i, '#ffffff', '#ed0000', '#1d3a8a'], [/avia/i, '#e2001a', '#ffffff', '#ffffff'], [/jet/i, '#ffd200', '#1a1a1a', '#1a1a1a'],
  [/eni|agip/i, '#ffd500', '#1a1a1a', '#1a1a1a'], [/bft/i, '#0a5aa5', '#ffd400', '#ffffff'], [/hem/i, '#ffffff', '#e30613', '#e30613'],
  [/baywa/i, '#00843d', '#ffffff', '#ffffff'], [/oil!/i, '#1a1a1a', '#f5a400', '#f5a400'],
];
const FUEL_DEFAULT = ['#ffffff', '#2a5aa0', '#2a5aa0'];
const ROUND_TANKS = new Set(['storage_tank', 'silo', 'digester', 'slurry_tank']);

const SiteKit = {
  // Art der Halle (oder -1): Bautyp aus tools/classify-buildings.js, OSM-Typ, Grundfläche, Laden im Haus
  hallKind(b, arch, absA, shop) {
    if (ROUND_TANKS.has(b.t)) return -1;
    if (arch === 10) return absA >= 120 ? HALL.AGRAR : -1;
    const hallType = HALL_TYPES.has(b.t);
    if (arch === 8 || hallType) {
      if (absA < 150) return -1;
      if (shop) return HALL.MARKT;
      return arch === 7 || /retail|supermarket|commercial/.test(b.t) ? HALL.GEWERBE : HALL.STAHL;
    }
    if (arch === 7 && absA >= 300 && b.h <= 13) return shop ? HALL.MARKT : HALL.GEWERBE;
    return -1;
  },
  hallWall(kind, rnd) { const l = HALL_WALLS[kind]; return l[Math.floor(rnd() * l.length)]; },
  // Traufhöhe: Agrarhallen 4,2–7 m, Märkte höchstens 7,5 m, sonst die OSM-Höhe
  hallEave(kind, h, rnd) {
    if (kind === HALL.AGRAR) return U.clamp(h * 0.7, 4.2, 7) + rnd() * 0.4;
    if (kind === HALL.MARKT) return Math.min(h, 5.4 + rnd() * 1.6);
    return h;
  },
  // Dach: flaches Satteldach (Stahl- und Agrarhallen mit vier Ecken), sonst Flachdach mit Attika; OSM roof:shape zuerst
  hallPlan(kind, rs, f4, rnd) {
    const gableOK = f4 && f4.d * 2 <= 45;
    if (!f4 && kind === HALL.AGRAR) return null;                // verwinkelte Agrarhalle: Walmdach wie bisher
    if (rs === 5) return { kind: 'flat', par: 0.35 + rnd() * 0.5 };
    if (gableOK && (rs === 1 || kind === HALL.AGRAR || (kind === HALL.STAHL && rnd() < 0.55)))
      return { kind: 'lowgable', pitch: kind === HALL.AGRAR ? 12 + rnd() * 8 : 5 + rnd() * 6 };
    return { kind: 'flat', par: kind === HALL.STAHL ? 0.3 + rnd() * 0.3 : 0.6 + rnd() * 0.5 };
  },
  // Zahl der Tore an der Front je Art und Wandlänge
  gates(kind, len) {
    if (kind === HALL.MARKT) return 0;
    if (kind === HALL.AGRAR) return len < 16 ? 1 : 2;
    return U.clamp(Math.floor(len / (kind === HALL.GEWERBE ? 9 : 12)), 1, 6);
  },

  // Flaches Satteldach einer Halle: First über die lange Seite, kleiner Überstand, Giebel als Wanddreieck (Stil 6)
  lowGable(W, rt, wb, pb, f, top, pitch, sideBase, wallCol, roofCol, style, gDoor, minH, BAY_W, BAY_H) {
    const { a, d } = f, sl = Math.tan(pitch * Math.PI / 180), rise = Math.min(d * sl, 6), yR = top + rise;
    const oE = 0.45, oG = 0.3, yE = top - oE * rise / d, X = f.X;
    for (const s of [1, -1]) {
      const n = f.N(0, s);
      HouseKit.rquad(W, rt, X(-a - oG, s * (d + oE), yE), X(a + oG, s * (d + oE), yE), X(a + oG, 0, yR), X(-a - oG, 0, yR), roofCol, [n[0], 2.5, n[1]]);
      // Untersicht und Traufblech
      const under = U.color('#6f7376', 0.05, () => 0.5);
      HouseKit.quad(pb, X(-a - oG, s * (d + oE), yE - 0.12), X(a + oG, s * (d + oE), yE - 0.12), X(a + oG, s * d, top - 0.12), X(-a - oG, s * d, top - 0.12), under, [0, -1, 0]);
      HouseKit.quad(pb, X(-a - oG, s * (d + oE), yE - 0.12), X(a + oG, s * (d + oE), yE - 0.12), X(a + oG, s * (d + oE), yE), X(-a - oG, s * (d + oE), yE), under, [n[0], 0, n[1]]);
    }
    for (const s of [1, -1]) {
      // Giebelwand mit Profil (Oberkante als Dreieck), Ortgangblech
      const n = f.N(s, 0), g = 2 * d;
      const A = X(s * a, -s * d, top), B = X(s * a, s * d, top), R = X(s * a, 0, yR);
      const pr = [0, g / 2, g, style, top, yR, top, sideBase, top - 0.05, gDoor];
      const uv = (v, y) => [(v + d) / BAY_W, (y - minH) / BAY_H];
      wb.tri(A, B, R, wallCol, uv(-s * d, top), uv(s * d, top), uv(0, yR), n[0], 0, n[1], pr);
      const cap = U.color('#55595c', 0.04, () => 0.5);
      for (const v of [-1, 1]) HouseKit.quad(pb, X(s * (a + oG), v * (d + oE), yE), X(s * (a + oG), 0, yR), X(s * (a + oG), 0, yR + 0.12), X(s * (a + oG), v * (d + oE), yE + 0.12), cap, [n[0], 0.3, n[1]]);
    }
    return yR;
  },

  // Vordach über der Glasfront eines Marktes (Platte auf zwei Stützen) und Einkaufswagen-Box daneben
  marketCanopy(W, pb, w, gnd, eave, rnd) {
    const L = w.len, g0 = L * 0.12, g1 = L * 0.62, cw = g1 - g0, dep = 3.2 + rnd() * 1.6, y = gnd + Math.min(3.6, eave - gnd - 0.9);
    const ux = (w.bx - w.ax) / L, uz = (w.bz - w.az) / L, ang = Math.atan2(uz, ux);
    const mx = w.ax + ux * (g0 + cw / 2) + w.ox * dep / 2, mz = w.az + uz * (g0 + cw / 2) + w.oz * dep / 2;
    const col = U.color(rnd() < 0.6 ? '#3a3c3f' : '#e9e9e5', 0.04, rnd);
    W.boxTris(pb, mx, y, mz, cw, 0.38, dep, ang, col);
    for (const s of [-1, 1]) {
      const px = mx + ux * s * (cw / 2 - 0.4) + w.ox * (dep / 2 - 0.4), pz = mz + uz * s * (cw / 2 - 0.4) + w.oz * (dep / 2 - 0.4);
      W.boxTris(pb, px, gnd - 0.3, pz, 0.25, y - gnd + 0.3, 0.25, ang, U.color('#55585b', 0.04, rnd));
    }
    // Einkaufswagen-Box: Dach, Rückwand, Wagenreihe (vor der Wand neben dem Vordach)
    const bx = w.ax + ux * (g1 + 3.2) + w.ox * 4.5, bz = w.az + uz * (g1 + 3.2) + w.oz * 4.5;
    if (g1 + 5.5 < L) {
      W.boxTris(pb, bx, gnd + 2.1, bz, 4.2, 0.12, 2.4, ang, U.color('#d8d8d4', 0.03, rnd));
      W.boxTris(pb, bx - w.ox * 1.15, gnd, bz - w.oz * 1.15, 4.2, 2.1, 0.06, ang, U.color('#8b9197', 0.03, rnd));
      W.boxTris(pb, bx, gnd, bz, 3.8, 1.0, 0.9, ang, U.color('#b7bcc0', 0.05, rnd));
    }
  },
  // Vordach über den Toren einer Stahl- oder Gewerbehalle
  gateCanopies(W, pb, w, gnd, kind, nG, Hh, rnd) {
    const gw0 = kind === HALL.GEWERBE ? 3.6 : 4.5, gh = Math.min(Hh - 0.8, kind === HALL.GEWERBE ? 3.9 : 4.6);
    const gw = Math.min(gw0, (w.len - 1) / nG - 0.8);
    if (gw < 2.2 || rnd() < 0.45) return;
    const gap = (w.len - nG * gw) / (nG + 1), ux = (w.bx - w.ax) / w.len, uz = (w.bz - w.az) / w.len, ang = Math.atan2(uz, ux);
    const col = U.color('#5d6266', 0.05, rnd);
    for (let k = 0; k < nG; k++) {
      const c = gap + k * (gw + gap) + gw / 2;
      W.boxTris(pb, w.ax + ux * c + w.ox * 0.7, gnd + gh + 0.35, w.az + uz * c + w.oz * 0.7, gw + 0.9, 0.14, 1.4, ang, col);
    }
  },

  // Runder Behälter? (Vieleck mit vielen Ecken, fast kreisförmig) → Mitte und Radius
  round(ring) {
    const n = ring.length / 2;
    if (n < 7) return null;
    let cx = 0, cz = 0, P = 0;
    for (let i = 0; i < n; i++) { cx += ring[i * 2]; cz += ring[i * 2 + 1]; }
    cx /= n; cz /= n;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; P += Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]); }
    const A = Math.abs(U.polyArea(ring));
    return 4 * Math.PI * A / (P * P) > 0.82 ? { cx, cz, r: Math.sqrt(A / Math.PI) } : null;
  },
  // Kuppel (Biogas-Speicher) bzw. flacher Kegel (Silo, Güllebehälter) über dem Grundriss
  dome(W, rt, ring, c, top, rise, col, steps) {
    const n = ring.length / 2, lv = [];
    for (let k = 0; k <= steps; k++) {
      const ph = k / steps * Math.PI / 2, s = Math.cos(ph), y = top + rise * Math.sin(ph), row = [];
      for (let i = 0; i < n; i++) row.push([c.cx + (ring[i * 2] - c.cx) * s, y, c.cz + (ring[i * 2 + 1] - c.cz) * s]);
      lv.push(row);
    }
    for (let k = 0; k < steps; k++) for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = lv[k][i], b = lv[k][j], cc = lv[k + 1][j], d = lv[k + 1][i];
      const nx = (a[0] + b[0]) / 2 - c.cx, nz = (a[2] + b[2]) / 2 - c.cz;
      W.roofTri(rt, a, b, cc, col, nx, (k + 0.5) / steps * c.r, nz);
      if (k < steps - 1) W.roofTri(rt, a, cc, d, col, nx, (k + 0.5) / steps * c.r, nz);
    }
  },
  cone(W, rt, ring, c, top, rise, col) {
    const n = ring.length / 2, apex = [c.cx, top + rise, c.cz];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = [ring[i * 2], top, ring[i * 2 + 1]], b = [ring[j * 2], top, ring[j * 2 + 1]];
      W.roofTri(rt, a, b, apex, col, (a[0] + b[0]) / 2 - c.cx, c.r * 0.5, (a[2] + b[2]) / 2 - c.cz);
    }
  },

  // Fahrsilos neben einer modernen Agrarhalle: 2–3 Kammern mit Betonwänden, Silage unter schwarzer Folie mit
  // Reifenreihen; Wände sind Hindernisse (Kanten der Kachel)
  bunkerSilo(R, t, pb, f, rnd) {
    const W = R.world, cnt = rnd() < 0.5 ? 2 : 3, cw = 8 + rnd() * 3, L = U.clamp(f.a * 2, 22, 42), Wt = cnt * cw;
    // neben der Halle (quer) oder hinter ihrem Ende (längs), erste freie Lage
    const opts = [];
    for (const s of rnd() < 0.5 ? [1, -1] : [-1, 1]) opts.push({ u: 0, v: s * (f.d + 7 + Wt / 2), along: true });
    for (const s of [1, -1]) opts.push({ u: s * (f.a + 7 + L / 2), v: 0, along: true });
    const P = (o, u, v) => [f.c[0] + f.ux * (o.u + u) + f.vx * (o.v + v), f.c[1] + f.uz * (o.u + u) + f.vz * (o.v + v)];
    // nicht auf Acker, Wiese, Wald oder Obstwiese (Fahrsilos stehen auf der Hoffläche)
    const R0 = Math.hypot(f.a, f.d) + 20 + Math.max(L, Wt);
    const fields = t.d.areas.filter(a => /^(farmland|meadow|forest|orchard|grass|scrub)$/.test(a.k)).filter(a => {
      const bb = U.polyBBox(a.p); return bb.maxX > f.c[0] - R0 && bb.minX < f.c[0] + R0 && bb.maxZ > f.c[1] - R0 && bb.minZ < f.c[1] + R0; });
    const onField = (x, z) => fields.some(a => U.pointInPoly(x, z, a.p) && !(a.ho && a.ho.some(h => U.pointInPoly(x, z, h))));
    for (const o of opts) {
      let ok = true, hMin = Infinity, hMax = -Infinity;
      for (let u = -L / 2; u <= L / 2 + 0.1 && ok; u += 4) for (let v = -Wt / 2 - 0.5; v <= Wt / 2 + 0.6 && ok; v += 3) {
        const [x, z] = P(o, u, v);
        if (R.inCore(x, z) || R.insideBuilding(x, z, 1.5) || onField(x, z) || R.nearRoad(x, z, 2) || R.walkAt(x, z) !== null || (R.land && R.land.onTrack(x, z, t, 1))) ok = false;
        const h = R.heightAt(x, z); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
      }
      if (!ok || hMax - hMin > 1.6) continue;
      const ang = Math.atan2(f.uz, f.ux), y0 = hMin - 0.4, wh = 2.6 + (hMax - hMin);
      const con = U.color('#8e8a81', 0.04, rnd), foil = U.color('#232624', 0.04, rnd), tire = new THREE.Color('#151515');
      const edge = (a, b) => { t.edges.push(a[0], a[1], b[0], b[1]); t.edgeGrid.insert(t.edges.length / 4 - 1, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); };
      for (let k = 0; k <= cnt; k++) {
        const v = -Wt / 2 + k * cw, [x, z] = P(o, 0, v);
        W.boxTris(pb, x, y0, z, L, wh, 0.3, ang, con);
        edge(P(o, -L / 2, v), P(o, L / 2, v));
      }
      // Rückwand am geschlossenen Ende
      const [bx, bz] = P(o, -L / 2, 0);
      W.boxTris(pb, bx, y0, bz, 0.3, wh, Wt, ang, con);
      edge(P(o, -L / 2, -Wt / 2), P(o, -L / 2, Wt / 2));
      for (let k = 0; k < cnt; k++) {
        const fill = rnd();
        if (fill < 0.2) continue;                                    // leere Kammer (Betonboden)
        const vc = -Wt / 2 + (k + 0.5) * cw, hs = hMax - y0 + 1.6 + rnd() * 0.6, uEnd = L / 2 - (fill < 0.5 ? L * 0.35 : 1), uR = uEnd - 6;
        const Y = (u) => y0 + (u <= uR ? hs : hs * Math.max(0.05, 1 - (u - uR) / 6));
        const q = (u, v) => { const [x, z] = P(o, u, v); return [x, Y(u), z]; };
        const hw = cw / 2 - 0.2;
        HouseKit.quad(pb, q(-L / 2 + 0.2, vc - hw), q(uR, vc - hw), q(uR, vc + hw), q(-L / 2 + 0.2, vc + hw), foil, [0, 1, 0]);
        HouseKit.quad(pb, q(uR, vc - hw), q(uEnd, vc - hw), q(uEnd, vc + hw), q(uR, vc + hw), foil, [f.ux, 1.5, f.uz]);
        // Reifen in Reihen auf der Folie
        for (let u = -L / 2 + 1.5; u < uR - 0.5; u += 2.2) for (let v = -hw + 1.2; v < hw - 0.8; v += 2.4) {
          const [x, z] = P(o, u, vc + v);
          W.boxTris(pb, x, Y(u) - 0.04, z, 0.75, 0.22, 0.75, ang + 0.4, tire);
        }
      }
      return P(o, 0, 0);
    }
    return null;
  },

  // Tankstelle unter einem OSM-Tankdach (building=roof): Blende in Markenfarbe mit Streifen, Dach oben mit Luftbild,
  // Zapfinseln mit Säulen (Inseln und Stützen sind Hindernisse), Leuchtfelder unter dem Dach
  fuelStation(R, t, rt, pb, ring, y, name, rnd) {
    const W = R.world, br = (FUEL_BRANDS.find(b => b[0].test(name)) || [null, ...FUEL_DEFAULT]).slice(1);
    const c0 = new THREE.Color(br[0]), c1 = new THREE.Color(br[1]), n = ring.length / 2, A = U.polyArea(ring), s = A > 0 ? 1 : -1;
    const bh = 0.9;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.2) continue;
      const ox = s * (bz - az) / len, oz = -s * (bx - ax) / len, nn = [ox, 0, oz];
      HouseKit.quad(pb, [ax, y + 0.2, az], [bx, y + 0.2, bz], [bx, y + bh, bz], [ax, y + bh, az], c0, nn);
      HouseKit.quad(pb, [ax + ox * 0.01, y, az + oz * 0.01], [bx + ox * 0.01, y, bz + oz * 0.01], [bx + ox * 0.01, y + 0.2, bz + oz * 0.01], [ax + ox * 0.01, y + 0.2, az + oz * 0.01], c1, nn);
    }
    W.flatRoof(rt, [ring], y + bh, t.photo ? new THREE.Color(ORTHO_TINT) : U.color('#d9d9d6', 0.03, rnd), 1);
    // Rahmen des Daches (längste Kante) und Inseln entlang der langen Achse
    let best = 0, ang = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]); if (l > best) { best = l; ang = Math.atan2(ring[j * 2 + 1] - ring[i * 2 + 1], ring[j * 2] - ring[i * 2]); } }
    const bb = U.polyBBox(ring), cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
    const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
    let a = 0, d = 0;
    for (let i = 0; i < n; i++) { const dx = ring[i * 2] - cx, dz = ring[i * 2 + 1] - cz; a = Math.max(a, Math.abs(dx * ux + dz * uz)); d = Math.max(d, Math.abs(dx * vx + dz * vz)); }
    const rows = d * 2 > 13 ? [-d * 0.42, d * 0.42] : [0], per = U.clamp(Math.floor(a * 2 / 8.5), 1, 4);
    const curb = U.color('#b9b6ad', 0.04, rnd), white = U.color('#f0f0ee', 0.02, rnd), post = U.color('#d6d6d2', 0.03, rnd), lamp = new THREE.Color('#fbfbf6');
    const edge = (p, q) => { t.edges.push(p[0], p[1], q[0], q[1]); t.edgeGrid.insert(t.edges.length / 4 - 1, Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])); };
    for (const v of rows) for (let k = 0; k < per; k++) {
      const u = -a + (k + 0.5) * (2 * a / per), x = cx + ux * u + vx * v, z = cz + uz * u + vz * v;
      if (!U.pointInPoly(x, z, ring)) continue;
      const g = R.heightAt(x, z);
      W.boxTris(pb, x, g - 0.2, z, 4.8, 0.36, 1.2, ang, curb);
      for (const o of [-1.25, 1.25]) {
        const px = x + ux * o, pz = z + uz * o;
        W.boxTris(pb, px, g + 0.16, pz, 0.6, 1.5, 0.42, ang, white);
        W.boxTris(pb, px, g + 1.66, pz, 0.64, 0.32, 0.46, ang, c0);
      }
      W.boxTris(pb, x, g + 0.16, z, 0.32, y - g - 0.16, 0.32, ang, post);   // Stütze bis unter das Dach
      const P = (du, dv) => [x + ux * du + vx * dv, z + uz * du + vz * dv];
      edge(P(-2.4, -0.6), P(2.4, -0.6)); edge(P(2.4, -0.6), P(2.4, 0.6)); edge(P(2.4, 0.6), P(-2.4, 0.6)); edge(P(-2.4, 0.6), P(-2.4, -0.6));
      // Leuchtfeld unter dem Dach über der Insel
      HouseKit.quad(pb, [P(-2, -0.5)[0], y - 0.02, P(-2, -0.5)[1]], [P(2, -0.5)[0], y - 0.02, P(2, -0.5)[1]], [P(2, 0.5)[0], y - 0.02, P(2, 0.5)[1]], [P(-2, 0.5)[0], y - 0.02, P(-2, 0.5)[1]], lamp, [0, -1, 0]);
    }
    return { x: cx, z: cz, name, brand: br };
  },

  // Parkplätze: weiße Stellplatz-Linien quer zu den Rändern der OSM-Fläche (2,5 m breit, 5 m tief), dem Gelände folgend
  parkingLines(R, t, bucket, area) {
    const ring = area.p, n = ring.length / 2, col = new THREE.Color('#d9d9d2');
    const inside = (x, z) => U.pointInPoly(x, z, ring) && !(area.ho && area.ho.some(h => U.pointInPoly(x, z, h)));
    const ok = (x, z) => inside(x, z) && !R.insideBuilding(x, z, 0.3, t) && !R.nearRoad(x, z, 0.3) && R.walkAt(x, z) === null;
    let made = 0;
    for (let i = 0; i < n && made < 400; i++) {
      const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 7.5) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      let nx = -dz, nz = dx;
      if (!inside((ax + bx) / 2 + nx * 1.5, (az + bz) / 2 + nz * 1.5)) { nx = -nx; nz = -nz; }
      for (let s0 = 1.2; s0 < len - 1.1; s0 += 2.5) {
        const x0 = ax + dx * s0 + nx * 0.3, z0 = az + dz * s0 + nz * 0.3, x1 = x0 + nx * 4.7, z1 = z0 + nz * 4.7;
        if (!ok(x0, z0) || !ok(x1, z1) || !ok((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        for (let k = 0; k < 2; k++) {
          const f0 = k / 2, f1 = (k + 1) / 2, pa = [x0 + (x1 - x0) * f0, z0 + (z1 - z0) * f0], pb = [x0 + (x1 - x0) * f1, z0 + (z1 - z0) * f1];
          const ya = R.heightAt(pa[0], pa[1]) + 0.07, yb = R.heightAt(pb[0], pb[1]) + 0.07, w = 0.06;
          HouseKit.quad(bucket, [pa[0] - dx * w, ya, pa[1] - dz * w], [pa[0] + dx * w, ya, pa[1] + dz * w], [pb[0] + dx * w, yb, pb[1] + dz * w], [pb[0] - dx * w, yb, pb[1] - dz * w], col, [0, 1, 0]);
        }
        made++;
      }
    }
    return made;
  },

  // ---------- Schrift in Spielernähe: Preismasten der Tankstellen, Ortstafeln am Ortsrand ----------
  // Ortsein- und -ausgänge: an Straßen, wo auf ≥ 100 m freie Strecke bebautes Gebiet folgt; Tafel rechts in
  // Fahrtrichtung, Vorderseite (gelb, Ortsname) zum Ankommenden, Rückseite rot durchgestrichen (Ortsende)
  townEntries(R, t) {
    const out = [], E = R.graph.edges;
    const built = (x, z) => {
      let c = 0;
      for (const tt of R.tilesNear(x, z, 60)) for (const b of tt.polyGrid.query(x, z, 45, R.world._tmp)) {
        if (b.a === 11 || b.a === 9 || b.a === 10) continue;              // Nebengebäude, Höfe und Scheunen draußen zählen nicht
        if (Math.hypot((b.bb.minX + b.bb.maxX) / 2 - x, (b.bb.minZ + b.bb.maxZ) / 2 - z) < 45 && ++c >= 2) return true;
      }
      return false;
    };
    for (const run of R.runs.get(t.key) || []) {
      const e = E[run.e];
      if (!/^(primary|secondary|tertiary|unclassified)$/.test(e.h) || e.deck) continue;
      const p = e.p, S = [];
      let carry = 0;
      for (let k = run.k0; k < run.k1; k++) {
        const ax = p[k * 2], az = p[k * 2 + 1], bx = p[k * 2 + 2], bz = p[k * 2 + 3], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.1) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        for (let s0 = carry; s0 < len; s0 += 10) { const x = ax + dx * s0, z = az + dz * s0; S.push({ x, z, dx, dz, b: built(x, z) }); }
        carry = (carry - len) % 10; if (carry < 0) carry += 10;
      }
      const run0 = (i, step, val) => { let c = 0; for (let k = i; k >= 0 && k < S.length && S[k].b === val; k += step) c++; return c; };
      for (let i = 1; i < S.length - 1; i++) {
        if (S[i].b && !S[i - 1].b && run0(i - 1, -1, false) >= 10 && run0(i, 1, true) >= 4) out.push({ s: S[i], dir: 1, w: e.w });
        if (S[i].b && !S[i + 1].b && run0(i + 1, 1, false) >= 10 && run0(i, -1, true) >= 4) out.push({ s: S[i], dir: -1, w: e.w });
      }
    }
    return out;
  },
  placeName(R, x, z) {
    const RANK = { town: 0, village: 1, suburb: 1, hamlet: 2, quarter: 2, city: 0 };
    let best = null, bd = Infinity;
    for (const p of R.places || []) {
      if (RANK[p.k] === undefined) continue;
      const d = Math.hypot(p.x - x, p.z - z) + RANK[p.k] * 150;
      if (d < bd) { bd = d; best = p; }
    }
    return best && bd < 2200 ? best : null;
  },
  lifeSigns(R, t, life) {
    const W = R.world, signs = [], pylons = [];
    const seen = new U.Grid(60);
    for (const en of this.townEntries(R, t)) {
      const s = en.s, dx = s.dx * en.dir, dz = s.dz * en.dir, rx = -dz, rz = dx, off = en.w / 2 + 1.4;
      const x = s.x + rx * off, z = s.z + rz * off;
      const pl = this.placeName(R, x, z);
      if (!pl || R.insideBuilding(x, z, 0.5) || R.nearRoad(x, z, 0.4)) continue;
      if (seen.query(x, z, 60, []).some(o => o.n === pl.n && Math.hypot(o.x - x, o.z - z) < 60)) continue;
      seen.insert({ x, z, n: pl.n }, x, z, x, z);
      signs.push({ x, z, nx: -dx, nz: -dz, name: pl.n, sub: /^(suburb|quarter)$/.test(pl.k) ? '' : 'Landkreis Coburg' });
      if (signs.length >= 12) break;
    }
    for (const f of t.fuelSites || []) {
      const r = R.nearestRoad(f.x, f.z, 45, null);
      if (!r) continue;
      let ox = f.x - r.x, oz = f.z - r.z;
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const sx = r.seg.bx - r.seg.ax, sz = r.seg.bz - r.seg.az, sl = Math.hypot(sx, sz) || 1;
      for (const shift of [6, -6, 12, -12, 0]) {
        const off = (r.seg.w || 7) / 2 + 2.2, x = r.x + ox * off + sx / sl * shift, z = r.z + oz * off + sz / sl * shift;
        if (R.insideBuilding(x, z, 1) || R.nearRoad(x, z, 0.8) || W.collideCircle(x, z, 0.8, {}).hit) continue;
        pylons.push({ x, z, ux: sx / sl, uz: sz / sl, f });
        break;
      }
    }
    if (!signs.length && !pylons.length) return;
    // Atlas: Ortstafeln 256 × 128 (Vorder- und Rückseite), Preismasten 128 × 256
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
    const c = cv.getContext('2d'), quads = [];
    let cx = 0, cy = 0, rowH = 0;
    const cell = (w, h) => { if (cx + w > 1024) { cx = 0; cy += rowH; rowH = 0; } if (cy + h > 1024) return null; const r = { x: cx, y: cy, w, h }; cx += w; rowH = Math.max(rowH, h); return r; };
    const uvOf = r => [r.x / 1024, 1 - (r.y + r.h) / 1024, (r.x + r.w) / 1024, 1 - r.y / 1024];
    const fit = (txt, max, size, weight = 'bold') => { let fs = size; c.font = `${weight} ${fs}px Arial, sans-serif`; while (c.measureText(txt).width > max && fs > 10) { fs -= 2; c.font = `${weight} ${fs}px Arial, sans-serif`; } };
    const panel = (r, strike, name, sub) => {
      c.fillStyle = '#1a1a1a'; c.fillRect(r.x, r.y, r.w, r.h);
      c.fillStyle = '#f5cc16'; c.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
      c.fillStyle = '#1a1a1a'; c.textAlign = 'center'; c.textBaseline = 'middle';
      fit(name, r.w - 30, sub ? 46 : 54); c.fillText(name, r.x + r.w / 2, r.y + (sub ? 50 : 64));
      if (sub) { fit(sub, r.w - 40, 22, 'normal'); c.fillText(sub, r.x + r.w / 2, r.y + 96); }
      if (strike) { c.strokeStyle = '#c4151c'; c.lineWidth = 14; c.beginPath(); c.moveTo(r.x + 14, r.y + r.h - 14); c.lineTo(r.x + r.w - 14, r.y + 14); c.stroke(); }
    };
    const quad = (m, ex, ez, w, h, uv) => {
      const hw = w / 2, hh = h / 2, P = (s, u) => [m[0] + ex * hw * s, m[1] + hh * u, m[2] + ez * hw * s];
      quads.push([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]]);
    };
    const pb = new Bucket(), grey = new THREE.Color('#8d9195');
    for (const s of signs) {
      const f = cell(256, 128), b = cell(256, 128);
      if (!f || !b) break;
      panel(f, false, s.name, s.sub); panel(b, true, s.name, '');
      // Schreibrichtung (n.z, −n.x) zur Normalen n: Vorderseite zum Ankommenden, Rückseite zum Hinausfahrenden
      const g = W.heightAt(s.x, s.z), ex = s.nz, ez = -s.nx;
      for (const o of [-0.5, 0.5]) W.boxTris(pb, s.x + ex * o, g - 0.2, s.z + ez * o, 0.07, 2.6, 0.07, 0, grey);
      quad([s.x + s.nx * 0.05, g + 2.05, s.z + s.nz * 0.05], ex, ez, 1.5, 0.75, uvOf(f));
      quad([s.x - s.nx * 0.05, g + 2.05, s.z - s.nz * 0.05], -ex, -ez, 1.5, 0.75, uvOf(b));
    }
    for (const p of pylons) {
      const r = cell(128, 256);
      if (!r) break;
      const br = p.f.brand;
      c.fillStyle = br[0]; c.fillRect(r.x, r.y, r.w, r.h);
      c.fillStyle = br[1]; c.fillRect(r.x, r.y + 70, r.w, 8);
      c.fillStyle = br[2]; c.textAlign = 'center'; c.textBaseline = 'middle';
      fit(p.f.name.toUpperCase(), r.w - 14, 30); c.fillText(p.f.name.toUpperCase(), r.x + r.w / 2, r.y + 38);
      c.fillStyle = '#151515'; c.fillRect(r.x + 8, r.y + 88, r.w - 16, r.h - 98);
      const rnd = U.rng(Math.round(p.x * 7 + p.z));
      ['Super E10', 'Super', 'Diesel'].forEach((k, i) => {
        const yy = r.y + 112 + i * 50, pr = (1.62 + rnd() * 0.22).toFixed(2).replace('.', ',');
        c.fillStyle = '#e8e8e8'; c.font = 'bold 13px Arial, sans-serif'; c.textAlign = 'left'; c.fillText(k, r.x + 14, yy - 12);
        c.fillStyle = '#ff3b2f'; c.font = 'bold 30px Arial, sans-serif'; c.textAlign = 'right'; c.fillText(pr, r.x + r.w - 26, yy + 10);
        c.font = 'bold 16px Arial, sans-serif'; c.fillText('9', r.x + r.w - 12, yy + 2);
      });
      const g = W.heightAt(p.x, p.z), nx = -p.uz, nz = p.ux;
      W.boxTris(pb, p.x, g - 0.3, p.z, 0.3, 2.6, 0.3, Math.atan2(p.uz, p.ux), grey);
      W.boxTris(pb, p.x, g + 2.3, p.z, 0.3, 3.7, 1.9, Math.atan2(p.uz, p.ux), new THREE.Color(br[0]));
      // beide Seiten quer zur Straße (lesbar aus beiden Fahrtrichtungen)
      quad([p.x + p.ux * 0.16, g + 4.15, p.z + p.uz * 0.16], -nx, -nz, 1.75, 3.5, uvOf(r));
      quad([p.x - p.ux * 0.16, g + 4.15, p.z - p.uz * 0.16], nx, nz, 1.75, 3.5, uvOf(r));
    }
    const g0 = pb.geometry();
    if (g0) { const m = new THREE.Mesh(g0, W.buildingMaterials().plain); m.castShadow = m.receiveShadow = true; t.group.add(m); life.meshes.push(m); }
    if (!quads.length) return;
    const pos = [], uv = [], nor = [], idx = [];
    for (let q = 0; q < quads.length; q += 2) {
      const P = quads[q], T = quads[q + 1], base = pos.length / 3;
      const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], v = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
      let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const nl = Math.hypot(...nn) || 1; nn = nn.map(k => k / nl);
      for (const pt of P) { pos.push(...pt); nor.push(...nn); }
      uv.push(...T); idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: R.night ? 0.35 : 0 });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    t.group.add(m); life.meshes.push(m);
    (life.ownMats || (life.ownMats = [])).push(mat);
  },
};
