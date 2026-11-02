// Haustyp-Bibliothek für die Häuser im Umland (seit v3.6.0): Dachformen passend zu Bautyp und Bauzeit (Satteldach,
// Krüppelwalm, Walm- und Zeltdach, Pultdach, Flachdach mit Attika bzw. Blende), Gauben, Balkone, Garagen-Dächer und
// Carports. Alles entsteht als Dreiecke in den Töpfen der Kachel (keine zusätzlichen Zeichenaufrufe): Dachflächen
// tragen das Luftbild (Ziel rt), Wände mit Fenstern das Wandprofil für den Fassadenshader (js/world.js), alles andere
// geht in den einfarbigen Topf (pb). Bautypen: ARCH in js/region.js (aus tools/classify-buildings.js).
'use strict';

const HouseKit = {
  // Rahmen eines Vierecks: Mitte c, Achse u entlang der längeren Seite, v quer dazu, halbe Länge a und halbe Tiefe d
  frame(p) {
    const P = i => [p[(i % 4) * 2], p[(i % 4) * 2 + 1]];
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const s = len(P(0), P(1)) >= len(P(1), P(2)) ? 0 : 1;
    const c = [0, 0];
    for (let i = 0; i < 4; i++) { c[0] += P(i)[0] / 4; c[1] += P(i)[1] / 4; }
    const p0 = P(s), p1 = P(s + 1), L = len(p0, p1) || 1;
    const ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L, vx = -uz, vz = ux;
    let a = 0, d = 0;
    for (let i = 0; i < 4; i++) {
      const q = P(i), du = (q[0] - c[0]) * ux + (q[1] - c[1]) * uz, dv = (q[0] - c[0]) * vx + (q[1] - c[1]) * vz;
      a = Math.max(a, Math.abs(du)); d = Math.max(d, Math.abs(dv));
    }
    return { c, ux, uz, vx, vz, a, d, s, P, X: (u, v, y) => [c[0] + ux * u + vx * v, y, c[1] + uz * u + vz * v],
      N: (nu, nv) => [ux * nu + vx * nv, uz * nu + vz * nv] };
  },

  // Dachform eines Wohnhauses mit vier Ecken: OSM roof:shape (rs) hat Vorrang, sonst je Bautyp wie in echten Orten
  // der Gegend (alter Ortskern fast nur Satteldach, Krüppelwalm; Nachkriegszeit Satteldach, Walmdach; Neubau
  // Zeltdach/Stadtvilla, Pultdach, Flachdach-Würfel). Neigung in Grad.
  plan(arch, rs, aspect, low, rnd) {
    const R = (a, b) => a + rnd() * (b - a), x = rnd();
    const TAG = [null, 'gable', 'hip', 'halfhip', 'pult', 'flat', 'tent', 'mansard'];
    let kind = TAG[rs] || null;
    if (!kind) {
      if (arch === 3) kind = x < 0.78 ? 'gable' : x < 0.88 ? 'halfhip' : 'hip';
      else if (arch === 4) kind = low && x < 0.2 ? 'flat' : x < 0.5 ? 'gable' : x < 0.72 ? 'halfhip' : 'hip';
      else if (arch === 5) kind = aspect < 1.35 ? (x < 0.5 ? 'tent' : x < 0.7 ? 'flat' : x < 0.9 ? 'gable' : 'pult')
        : (x < 0.45 ? 'gable' : x < 0.7 ? 'pult' : x < 0.85 ? 'flat' : 'hip');
      else kind = x < (arch === 2 ? 0.9 : 0.85) ? 'gable' : 'halfhip';
    }
    let pitch = 0;
    if (kind === 'halfhip') pitch = arch >= 4 ? R(35, 45) : R(42, 52);
    else if (kind === 'hip') pitch = arch === 5 ? R(20, 26) : R(28, 38);
    else if (kind === 'tent') pitch = arch === 5 ? R(18, 24) : R(25, 32);
    else if (kind === 'pult') pitch = R(7, 14);
    else if (kind === 'mansard') { kind = 'gable'; pitch = R(48, 55); }
    return { kind, pitch, side: rnd() < 0.5 ? 1 : -1, par: arch === 5 ? 0.35 : arch === 4 ? 0 : 0.12 };
  },

  // Viereck aus zwei Dreiecken in einen Topf
  quad(b, A, B, C, D, col, n) { b.tri(A, B, C, col, null, null, null, n[0], n[1], n[2]); b.tri(A, C, D, col, null, null, null, n[0], n[1], n[2]); },
  rquad(W, rt, A, B, C, D, col, n) { W.roofTri(rt, A, B, C, col, n[0], n[1], n[2]); W.roofTri(rt, A, C, D, col, n[0], n[1], n[2]); },

  // Krüppelwalmdach: Satteldach, dessen Giebelspitzen abgewalmt sind (oberes gut ein Drittel), mit Überständen,
  // Untersicht und Giebelwänden (Wandprofil mit flacher Oberkante, damit Fenster darunter bleiben)
  halfHip(W, rt, wb, pb, p, top, sideBase, wallCol, roofCol, plan, RF, styleCode, minH, BAY_W, BAY_H, rnd) {
    const f = this.frame(p), { a, d } = f;
    const sl = Math.tan(plan.pitch * Math.PI / 180), oE = RF.oE, oG = RF.oG;
    const yR = top + Math.min(d * sl, 8), slope = (yR - top) / d, yE = top - oE * slope, D = d + oE;
    const yK = top + (yR - top) * 0.62, vK = (yR - yK) / slope;
    const ur = Math.max(0.4, a + oG - vK * 1.1);
    const X = f.X, n = (nu, nv, ny) => { const q = f.N(nu, nv); return [q[0], ny, q[1]]; };
    for (const s of [1, -1]) {
      const E1 = X(-a - oG, s * D, yE), E2 = X(a + oG, s * D, yE), K2 = X(a + oG, s * vK, yK), K1 = X(-a - oG, s * vK, yK);
      const R2 = X(ur, 0, yR), R1 = X(-ur, 0, yR), nn = n(0, s, 0.7);
      W.roofTri(rt, E1, E2, K2, roofCol, ...nn); W.roofTri(rt, E1, K2, R2, roofCol, ...nn);
      W.roofTri(rt, E1, R2, R1, roofCol, ...nn); W.roofTri(rt, E1, R1, K1, roofCol, ...nn);
      // Walm am Giebel
      const ue = s * (a + oG), Rr = X(s * ur, 0, yR);
      W.roofTri(rt, X(ue, vK, yK), X(ue, -vK, yK), Rr, roofCol, ...n(s, 0, 0.7));
    }
    // Untersicht und Traufbrett an den Traufen
    const under = U.color(RF.under[Math.floor(rnd() * RF.under.length)], 0.1, rnd), th = 0.16;
    for (const s of [1, -1]) {
      this.quad(pb, X(-a - oG, s * D, yE - th), X(a + oG, s * D, yE - th), X(a, s * d, top - th), X(-a, s * d, top - th), under, n(0, s * 0.3, -1));
      this.quad(pb, X(-a - oG, s * D, yE - th), X(a + oG, s * D, yE - th), X(a + oG, s * D, yE), X(-a - oG, s * D, yE), under, n(0, s, 0));
    }
    // Giebelwände mit flacher Oberkante (Krüppel), echte Ecken des Grundrisses
    const P = f.P, len = (q, r) => Math.hypot(q[0] - r[0], q[1] - r[1]);
    const gable = (A, B, side) => {
      const g = len(A, B), mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, k = Math.min(0.98, vK / (g / 2));
      const K1 = [mx + (A[0] - mx) * k, mz + (A[1] - mz) * k], K2 = [mx + (B[0] - mx) * k, mz + (B[1] - mz) * k];
      const base = sideBase[side] !== undefined ? sideBase[side] : minH, ox = mx - f.c[0], oz = mz - f.c[1];
      const pr = [0, g / 2, g, 1 + styleCode, top, yK, top, base, top - 0.05, 0];
      const uv = (q, y) => [len(q, A) / BAY_W, (y - minH) / BAY_H];
      const v3 = (q, y) => [q[0], y, q[1]];
      wb.tri(v3(A, top), v3(B, top), v3(K2, yK), wallCol, uv(A, top), uv(B, top), uv(K2, yK), ox, 0, oz, pr);
      wb.tri(v3(A, top), v3(K2, yK), v3(K1, yK), wallCol, uv(A, top), uv(K2, yK), uv(K1, yK), ox, 0, oz, pr);
    };
    gable(P(f.s + 1), P(f.s + 2), (f.s + 1) % 4);
    gable(P(f.s + 3), P(f.s), (f.s + 3) % 4);
    return { f, top, yR, slope, d, a };
  },

  // Walm- bzw. Zeltdach (bei quadratischem Grundriss eine Spitze) mit Überstand und Untersicht
  hip(W, rt, pb, p, top, roofCol, plan, RF, rnd) {
    const f = this.frame(p), { a, d } = f, o = RF.oE, tn = Math.tan(plan.pitch * Math.PI / 180);
    const A = a + o, D = d + o, yE = top - o * tn, ridge = plan.kind === 'tent' ? 0 : Math.max(0, A - D), yR = yE + D * tn;
    const X = f.X, n = (nu, nv) => { const q = f.N(nu, nv); return [q[0], 0.6, q[1]]; };
    const R0 = X(-ridge, 0, yR), R1 = X(ridge, 0, yR);
    const E = [X(-A, -D, yE), X(A, -D, yE), X(A, D, yE), X(-A, D, yE)];
    W.roofTri(rt, E[0], E[1], R1, roofCol, ...n(0, -1)); W.roofTri(rt, E[0], R1, R0, roofCol, ...n(0, -1));
    W.roofTri(rt, E[2], E[3], R0, roofCol, ...n(0, 1)); W.roofTri(rt, E[2], R0, R1, roofCol, ...n(0, 1));
    W.roofTri(rt, E[1], E[2], R1, roofCol, ...n(1, 0)); W.roofTri(rt, E[3], E[0], R0, roofCol, ...n(-1, 0));
    const under = U.color(RF.under[Math.floor(rnd() * RF.under.length)], 0.06, rnd), th = 0.18;
    const Ed = E.map(q => [q[0], q[1] - th, q[2]]), inner = [X(-a, -d, top), X(a, -d, top), X(a, d, top), X(-a, d, top)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, mx = (E[i][0] + E[j][0]) / 2 - f.c[0], mz = (E[i][2] + E[j][2]) / 2 - f.c[1];
      this.quad(pb, Ed[i], Ed[j], inner[j], inner[i], under, [mx * 0.1, -1, mz * 0.1]);
      this.quad(pb, Ed[i], Ed[j], E[j], E[i], under, [mx, 0, mz]);
    }
  },

  // Pultdach (Neubau): eine Dachfläche von der niedrigen zur hohen Traufe (side = Richtung der hohen Seite in v),
  // Blechblende rundum; die Wände der hohen Seite und die Dreiecke der Giebelseiten baut region.js
  pult(W, rt, pb, f, top, yHigh, side, RF, roofCol, rnd) {
    const { a, d } = f, oE = RF.oE, oG = RF.oG, k = (yHigh - top) / (2 * d);
    const X = f.X, y = v => top + (v * side + d) * k;
    const c = [X(-a - oG, -d - oE, y(-d - oE)), X(a + oG, -d - oE, y(-d - oE)), X(a + oG, d + oE, y(d + oE)), X(-a - oG, d + oE, y(d + oE))];
    const nn = f.N(0, -side * k);
    W.roofTri(rt, c[0], c[1], c[2], roofCol, nn[0], 1, nn[1]); W.roofTri(rt, c[0], c[2], c[3], roofCol, nn[0], 1, nn[1]);
    const blend = U.color(rnd() < 0.7 ? '#3a3c3f' : '#d9d8d3', 0.05, rnd), th = 0.25, under = U.color('#e7e5e0', 0.04, rnd);
    for (let i = 0; i < 4; i++) {
      const A = c[i], B = c[(i + 1) % 4], mx = (A[0] + B[0]) / 2 - f.c[0], mz = (A[2] + B[2]) / 2 - f.c[1];
      this.quad(pb, [A[0], A[1] - th, A[2]], [B[0], B[1] - th, B[2]], [B[0], B[1] + 0.03, B[2]], [A[0], A[1] + 0.03, A[2]], blend, [mx, 0, mz]);
    }
    this.quad(pb, ...c.map(q => [q[0], q[1] - th, q[2]]), under, [0, -1, 0]);
  },

  // Flachdach: Attika (Neubau, Brüstung mit Blechabdeckung) bzw. dunkle Blende (Bungalow der 1970er) bzw. schmaler Rand
  flat(W, rt, pb, ring, top, plan, arch, roofCol, wallCol, rnd) {
    const par = plan.par, n = ring.length / 2;
    W.flatRoof(rt, [ring], top + 0.02, roofCol, 1);
    const A = U.polyArea(ring), s = A > 0 ? 1 : -1;
    const cap = U.color(arch === 5 ? '#3b3d40' : arch === 4 ? '#5b3f2a' : '#8d8a83', 0.05, rnd);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.2) continue;
      const ox = s * (bz - az) / len, oz = -s * (bx - ax) / len, ang = Math.atan2(bz - az, bx - ax);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (par > 0.01) {
        // Innenseite der Brüstung (die Außenseite ist die hochgezogene Wand) und Abdeckblech
        W.boxTris(pb, mx - ox * 0.12, top, mz - oz * 0.12, len, par, 0.22, ang, wallCol);
        W.boxTris(pb, mx + ox * 0.02, top + par, mz + oz * 0.02, len + 0.1, 0.05, 0.34, ang, cap);
      } else if (arch === 4) W.boxTris(pb, mx + ox * 0.35, top - 0.3, mz + oz * 0.35, len + 0.7, 0.36, 0.7, ang, cap); // Bungalow: Blende mit Überstand
      else W.boxTris(pb, mx + ox * 0.08, top - 0.06, mz + oz * 0.08, len + 0.16, 0.12, 0.2, ang, cap);
    }
  },

  // Gauben auf Sattel- und Krüppelwalmdächern, je Bauzeit: Schleppgaube (alter Kern, Siedlung), Satteldachgaube
  // (1970er–90er, auch alter Kern), Flachdachgaube mit großem Fenster (Neubau). Nur bei ausgebautem Dachgeschoss
  // (genug Höhe, steiles Dach), symmetrisch, nicht am Schornstein, auf der Straßenseite (manchmal beidseits).
  dormers(W, rt, pb, info, arch, wallCol, roofCol, streetSide, avoidU, rnd) {
    const { f, top, yR, slope, d, a } = info;
    const P = { 1: 0.25, 2: 0.45, 3: 0.4, 4: 0.45, 5: 0.12 }[arch] || 0;
    if (rnd() > P || yR - top < 3.0 || slope < Math.tan(33 * Math.PI / 180) || a < 3.5) return 0;
    const type = arch === 5 ? 'flach' : arch === 4 ? (rnd() < 0.7 ? 'sattel' : 'schlepp') : arch === 2 && rnd() < 0.5 ? 'sattel' : 'schlepp';
    const L = 2 * a, cnt = L < 9 ? 1 : L < 13 ? 2 : (arch === 1 ? 2 : 3);
    const us = cnt === 1 ? [0] : cnt === 2 ? [-L * 0.22, L * 0.22] : [-L * 0.3, 0, L * 0.3];
    const w = type === 'flach' ? Math.min(3.4, 1.8 + rnd() * 1.6) : type === 'sattel' ? 1.5 + rnd() * 0.5 : Math.min(2.6, 1.6 + rnd() * 1.0);
    const sides = rnd() < 0.4 ? [1, -1] : [streetSide];
    const X = f.X, vF = Math.min(d * 0.62, d - 0.5 / slope), yBot = yR - vF * slope;
    let hF = type === 'flach' ? 1.7 : 1.35;
    if (yBot + hF > yR - 0.45) hF = yR - 0.45 - yBot;
    if (hF < 1.0) return 0;
    const yTop = yBot + hF;
    const front = arch === 5 ? U.color('#3a3c3f', 0.05, rnd) : wallCol;
    const cheek = arch === 5 ? front : arch === 4 ? U.color('#6a4a32', 0.08, rnd) : arch === 1 ? U.color('#55575b', 0.06, rnd) : wallCol;
    const frameC = U.color(arch === 5 ? '#26282a' : arch === 4 && rnd() < 0.5 ? '#5b3a22' : '#ece9e2', 0.03, rnd), glass = new THREE.Color('#1c2228');
    let built = 0;
    for (const side of sides) for (const uc of us) {
      if (avoidU !== null && Math.abs(uc - avoidU) < w / 2 + 0.7) continue;
      const nn = f.N(0, side), nOut = [nn[0], 0, nn[1]];
      const u0 = uc - w / 2, u1 = uc + w / 2, V = v => side * v;
      // Frontwand mit Fenster (Rahmen und Glas leicht davor)
      this.quad(pb, X(u0, V(vF), yBot - 0.1), X(u1, V(vF), yBot - 0.1), X(u1, V(vF), yTop), X(u0, V(vF), yTop), front, nOut);
      const fi = type === 'flach' ? 0.15 : 0.28, wy0 = yBot + 0.25, wy1 = yTop - (type === 'flach' ? 0.18 : 0.22);
      this.quad(pb, X(u0 + fi, V(vF + 0.02), wy0), X(u1 - fi, V(vF + 0.02), wy0), X(u1 - fi, V(vF + 0.02), wy1), X(u0 + fi, V(vF + 0.02), wy1), frameC, nOut);
      this.quad(pb, X(u0 + fi + 0.07, V(vF + 0.03), wy0 + 0.07), X(u1 - fi - 0.07, V(vF + 0.03), wy0 + 0.07), X(u1 - fi - 0.07, V(vF + 0.03), wy1 - 0.07), X(u0 + fi + 0.07, V(vF + 0.03), wy1 - 0.07), glass, nOut);
      if (type === 'schlepp') {
        // Dach flacher als das Hauptdach bis zum Schnitt mit diesem
        const k = 0.27, vB = (yR - yTop - vF * k) / (slope - k);
        if (vB < 0.15) continue;
        const yB = yR - vB * slope, o = 0.2;
        this.rquad(W, rt, X(u0 - o, V(vF + o), yTop - o * k), X(u1 + o, V(vF + o), yTop - o * k), X(u1 + o, V(vB), yB), X(u0 - o, V(vB), yB), roofCol, [nOut[0], 1.4, nOut[2]]);
        for (const [uu, su] of [[u0, -1], [u1, 1]]) { const ns = f.N(su, 0); pb.tri(X(uu, V(vF), yBot), X(uu, V(vF), yTop), X(uu, V(vB), yB), cheek, null, null, null, ns[0], 0, ns[1]); }
      } else if (type === 'sattel') {
        const o = 0.18, yRd = yTop + w / 2 * 0.9, vRd = (yR - yRd) / slope, vT = (yR - yTop + o * 0.9) / slope;
        if (vRd < 0.1) continue;
        for (const [ue, su] of [[u0 - o, -1], [u1 + o, 1]]) {
          const ns = f.N(su, 0);
          this.rquad(W, rt, X(ue, V(vF + o), yTop - o * 0.9), X(uc, V(vF + o), yRd), X(uc, V(vRd), yRd), X(ue, V(vT), yTop - o * 0.9), roofCol, [ns[0] + nOut[0] * 0.3, 1, ns[1] + nOut[2] * 0.3]);
          pb.tri(X(su < 0 ? u0 : u1, V(vF), yBot), X(su < 0 ? u0 : u1, V(vF), yTop), X(su < 0 ? u0 : u1, V((yR - yTop) / slope), yTop), cheek, null, null, null, ns[0], 0, ns[1]);
        }
        pb.tri(X(u0, V(vF), yTop), X(u1, V(vF), yTop), X(uc, V(vF), yRd), front, null, null, null, nOut[0], 0, nOut[2]);
      } else {
        // Flachdachgaube: waagrechtes Dach bis ins Hauptdach, Blechblende
        const vT = (yR - yTop) / slope;
        this.quad(pb, X(u0 - 0.1, V(vF + 0.15), yTop), X(u1 + 0.1, V(vF + 0.15), yTop), X(u1 + 0.1, V(vT), yTop), X(u0 - 0.1, V(vT), yTop), front, [0, 1, 0]);
        this.quad(pb, X(u0 - 0.1, V(vF + 0.15), yTop - 0.2), X(u1 + 0.1, V(vF + 0.15), yTop - 0.2), X(u1 + 0.1, V(vF + 0.15), yTop), X(u0 - 0.1, V(vF + 0.15), yTop), front, nOut);
        for (const [uu, su] of [[u0, -1], [u1, 1]]) { const ns = f.N(su, 0); pb.tri(X(uu, V(vF), yBot), X(uu, V(vF), yTop), X(uu, V(vT), yTop), cheek, null, null, null, ns[0], 0, ns[1]); }
      }
      built++;
    }
    return built;
  },

  // Balkon vor einer Wand (Mitte mx/mz auf der Wand, Außennormale ox/oz): Platte und Brüstung je Bauweise:
  // 'beton' (1950er–70er, geschlossene Brüstung), 'holz' (1970er–90er, Holzbretter), 'stahl' (Stäbe), 'glas' (Neubau)
  balcony(W, pb, mx, mz, ox, oz, y, width, depth, kind, rnd) {
    const ang = Math.atan2(oz, ox) + Math.PI / 2, cx = mx + ox * depth / 2, cz = mz + oz * depth / 2;
    const slabC = U.color(kind === 'holz' ? '#6b4a2e' : kind === 'glas' ? '#d8d6d1' : '#b9b5ac', 0.05, rnd);
    W.boxTris(pb, cx, y - 0.18, cz, width, 0.18, depth, ang, slabC);
    const fx = mx + ox * (depth - 0.03), fz = mz + oz * (depth - 0.03);
    const side = (k, col, h, th) => {
      // Brüstung vorn und an beiden Seiten
      W.boxTris(pb, fx, y, fz, width, h, th, ang, col);
      for (const sgn of [-1, 1]) {
        const sx = mx + ox * depth / 2 + Math.cos(ang) * sgn * (width / 2 - th / 2), sz = mz + oz * depth / 2 + Math.sin(ang) * sgn * (width / 2 - th / 2);
        W.boxTris(pb, sx, y, sz, depth, h, th, ang + Math.PI / 2, col);
      }
    };
    if (kind === 'beton') side(0, U.color('#c9c4b8', 0.06, rnd), 1.0, 0.1);
    else if (kind === 'holz') side(0, U.color(rnd() < 0.6 ? '#5e3f25' : '#7a5636', 0.06, rnd), 1.0, 0.05);
    else if (kind === 'glas') { side(0, U.color('#5d6a70', 0.03, rnd), 1.0, 0.03); W.boxTris(pb, fx, y + 1.0, fz, width, 0.05, 0.06, ang, U.color('#9a9c9e', 0.03, rnd)); }
    else {
      // Stahlgeländer: Handlauf, unterer Holm und Stäbe
      const col = U.color(rnd() < 0.6 ? '#2f3133' : '#e2e2de', 0.03, rnd);
      W.boxTris(pb, fx, y + 0.95, fz, width, 0.05, 0.05, ang, col);
      W.boxTris(pb, fx, y + 0.08, fz, width, 0.04, 0.04, ang, col);
      const nb = Math.max(2, Math.round(width / 0.45));
      for (let i = 0; i <= nb; i++) {
        const t = -width / 2 + width * i / nb;
        W.boxTris(pb, fx + Math.cos(ang) * t, y + 0.08, fz + Math.sin(ang) * t, 0.03, 0.88, 0.03, ang, col);
      }
    }
  },
};
