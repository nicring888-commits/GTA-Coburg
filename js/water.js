// Wasser: Flüsse, Bäche, Seen und Teiche aus OSM mit ausgehobenem Bett, bewegter Wasseroberfläche und Ufern,
// über die man nicht laufen oder fahren kann (außer über Brücken und Straßen). Benutzt von world.js (Innenstadt)
// und region.js (Umland, je Kachel).
'use strict';

const WATER = {
  depth: 1.7,        // Tiefe des Betts unter dem Gelände (Flüsse, Seen)
  streamDepth: 0.8,  // Bäche
  surface: 0.35,     // Wasseroberfläche unter dem ursprünglichen Gelände
  blockWidth: 5,     // Fließgewässer ab dieser Breite sind ein Hindernis
  blockArea: 150,    // stehende Gewässer ab dieser Fläche (m²) sind ein Hindernis
  roadGap: 2.5,      // so viel Platz neben Straßen bleibt frei (Brücken, Durchlässe)
};

let _waterMat = null;
// Gemeinsames Material: Grundfarbe, Glanz und eine wandernde Wellen-Normalenkarte
function waterMaterial() {
  if (_waterMat) return _waterMat;
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), img = c.createImageData(S, S), rnd = U.rng(91);
  // Höhenfeld aus überlagerten Sinuswellen, daraus Normalen
  const waves = [];
  for (let i = 0; i < 9; i++) waves.push([1 + Math.floor(rnd() * 5), Math.floor(rnd() * 5) - 2, rnd() * 6.28, 0.4 + rnd() * 0.6]);
  const h = (x, y) => { let v = 0; for (const [a, b, p, w] of waves) v += w * Math.sin((a * x + b * y) / S * Math.PI * 2 + p); return v; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const l = Math.hypot(dx * 0.5, dy * 0.5, 1), k = (y * S + x) * 4;
    img.data[k] = (-dx * 0.5 / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy * 0.5 / l * 0.5 + 0.5) * 255;
    img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const nt = new THREE.CanvasTexture(cv);
  nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
  // physikalisches Material: spiegelt Himmel und Wolken aus dem Umgebungsbild (flacher Blick = mehr Spiegelung)
  _waterMat = new THREE.MeshStandardMaterial({
    color: '#34524f', roughness: 0.06, metalness: 0, envMapIntensity: 1.5, normalMap: nt, normalScale: new THREE.Vector2(0.3, 0.3),
    transparent: true, opacity: 0.93, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  _waterMat.userData.tex = nt;
  return _waterMat;
}
// Wellen wandern lassen (einmal pro Bild)
function waterTick(dt) {
  if (!_waterMat) return;
  const t = _waterMat.userData.tex;
  t.offset.x = (t.offset.x + dt * 0.012) % 1; t.offset.y = (t.offset.y + dt * 0.02) % 1;
}

// Gewässer aufbereiten: areas [{k, p, ho}] (k: water, river), lines [{w, p}] (Mittellinien mit Breite)
class WaterSet {
  constructor(areas, lines) {
    this.polys = [];
    this.lines = [];
    this.grid = new U.Grid(24);
    for (const a of areas) {
      if (a.k !== 'water' && a.k !== 'river' && a.k !== 'pool') continue;
      if (a.k === 'pool') continue; // Schwimmbecken bleiben gemalt
      const bb = U.polyBBox(a.p), area = Math.abs(U.polyArea(a.p));
      const poly = { p: a.p, ho: a.ho, bb, river: a.k === 'river', block: a.k === 'river' || area > WATER.blockArea };
      this.polys.push(poly);
      this.grid.insert(poly, bb.minX - 1, bb.minZ - 1, bb.maxX + 1, bb.maxZ + 1);
    }
    for (const l of lines) {
      if (l.p.length < 4) continue;
      const line = { p: l.p, w: l.w, hw: l.w / 2, block: l.w >= WATER.blockWidth };
      this.lines.push(line);
      for (let k = 0; k + 3 < l.p.length; k += 2) {
        const seg = { line, k };
        const m = line.hw + 1.5;
        this.grid.insert(seg, Math.min(l.p[k], l.p[k + 2]) - m, Math.min(l.p[k + 1], l.p[k + 3]) - m, Math.max(l.p[k], l.p[k + 2]) + m, Math.max(l.p[k + 1], l.p[k + 3]) + m);
      }
    }
    this._q = [];
  }
  get empty() { return !this.polys.length && !this.lines.length; }

  inPoly(x, z, P) {
    return x >= P.bb.minX && x <= P.bb.maxX && z >= P.bb.minZ && z <= P.bb.maxZ && U.pointInPoly(x, z, P.p) && !(P.ho && P.ho.some(h => U.pointInPoly(x, z, h)));
  }
  // Wie tief das Bett an (x, z) unter dem Gelände liegt (0 = gar nicht)
  carveAt(x, z) {
    let best = 0;
    const list = this.grid.query(x, z, 0, this._q);
    for (const o of list) {
      if (o.line) {
        const L = o.line, p = L.p, k = o.k;
        const c = U.closestOnSeg(x, z, p[k], p[k + 1], p[k + 2], p[k + 3]);
        const d = Math.hypot(c[0] - x, c[1] - z), r = L.hw + 1;
        if (d >= r) continue;
        const t = d / r, depth = (L.w >= WATER.blockWidth ? WATER.depth : WATER.streamDepth) * (1 - t * t);
        if (depth > best) best = depth;
      } else if (this.inPoly(x, z, o)) {
        // zum Ufer hin flacher
        let ed = Infinity;
        const p = o.p;
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
          const c = U.closestOnSeg(x, z, p[j], p[j + 1], p[i], p[i + 1]);
          ed = Math.min(ed, Math.hypot(c[0] - x, c[1] - z));
          if (ed < 0.3) break;
        }
        const depth = WATER.depth * Math.min(1, 0.25 + ed / 3);
        if (depth > best) best = depth;
      }
    }
    return best;
  }
  // Bett in ein Höhengitter graben. g: Werte, S: Zeilenlänge, xy(i) -> [x, z]; skip(x, z): nicht graben (Straßen)
  carveGrid(g, n, xy, skip) {
    if (this.empty) return;
    for (let i = 0; i < n; i++) {
      const [x, z] = xy(i);
      const d = this.carveAt(x, z);
      if (d > 0 && !(skip && skip(x, z))) g[i] -= d;
    }
  }

  // Wasseroberfläche (Höhe = ursprüngliches Gelände minus WATER.surface) in bucket; inside(x, z): Abschnitt zeichnen?
  // hc(x, z): Gelände mit ausgehobenem Bett. Das Wasser liegt dann höchstens so hoch wie das Ufer an seinem Rand
  // (das grobe Höhengitter senkt die Ufer oft tiefer ab), sonst schwebte es als Platte bzw. Band über der Böschung.
  buildSurface(bucket, h0, inside, hc) {
    const col = new THREE.Color('#ffffff');
    const y = (x, z) => h0(x, z) - WATER.surface;
    // Wasserspiegel einer Fläche: höchstens Ufer am nächsten Randpunkt, mindestens 20 cm über dem Bett
    const polyLevel = (P, x, z) => {
      const v = y(x, z);
      if (!hc) return v;
      // Randstücke der Fläche im Suchraster (einmal je Fläche), Suche mit wachsendem Radius
      if (!P.rim) {
        P.rim = new U.Grid(16);
        for (const ring of [P.p].concat(P.ho || [])) for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
          P.rim.insert([ring[j], ring[j + 1], ring[i], ring[i + 1]], Math.min(ring[j], ring[i]), Math.min(ring[j + 1], ring[i + 1]), Math.max(ring[j], ring[i]), Math.max(ring[j + 1], ring[i + 1]));
      }
      let bd = Infinity, bx = x, bz = z;
      for (let r = 8; r < 5000 && !(bd <= r); r *= 4) for (const s of P.rim.query(x, z, r, this._rimQ || (this._rimQ = []))) {
        const c = U.closestOnSeg(x, z, s[0], s[1], s[2], s[3]), d = Math.hypot(c[0] - x, c[1] - z);
        if (d < bd) { bd = d; bx = c[0]; bz = c[1]; }
      }
      return Math.min(v, Math.max(hc(bx, bz) - 0.08, hc(x, z) + 0.2));
    };
    const emit = (a, b, c, depth, poly) => {
      const ab = Math.hypot(a[0] - b[0], a[1] - b[1]), bc = Math.hypot(b[0] - c[0], b[1] - c[1]), ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.max(ab, bc, ca) > 7 && depth < 12) {
        if (ab >= bc && ab >= ca) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; emit(a, m, c, depth + 1, poly); emit(m, b, c, depth + 1, poly); }
        else if (bc >= ca) { const m = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; emit(a, b, m, depth + 1, poly); emit(a, m, c, depth + 1, poly); }
        else { const m = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; emit(a, b, m, depth + 1, poly); emit(m, b, c, depth + 1, poly); }
        return;
      }
      const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[1] + b[1] + c[1]) / 3;
      if (inside && !inside(cx, cz)) return;
      const P = q => [q[0], polyLevel(poly, q[0], q[1]), q[1]];
      bucket.get(cx, cz).tri(P(a), P(b), P(c), col, [a[0] / 9, a[1] / 9], [b[0] / 9, b[1] / 9], [c[0] / 9, c[1] / 9], 0, 1, 0);
    };
    const toV = p => { const o = []; for (let i = 0; i < p.length; i += 2) o.push(new THREE.Vector2(p[i], p[i + 1])); return o; };
    for (const P of this.polys) {
      const contour = toV(P.p), holes = (P.ho || []).map(toV);
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { continue; }
      const all = contour.concat(...holes);
      for (const f of faces) {
        const a = all[f[0]], b = all[f[1]], c = all[f[2]];
        if (a && b && c) emit([a.x, a.y], [b.x, b.y], [c.x, c.y], 0, P);
      }
    }
    // Fließgewässer als Band; wo schon eine Flussfläche liegt, nicht doppelt
    for (const L of this.lines) {
      const p = L.p, n = p.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (this.polys.some(P => this.inPoly(mx, mz, P))) continue;
        if (inside && !inside(mx, mz)) continue;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const nx = -(bz - az) / len * L.hw, nz = (bx - ax) / len * L.hw;
        const steps = Math.max(1, Math.ceil(len / 5));
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 1) / steps;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          const lvl = (x, z) => {
            const v = y(x, z);
            if (!hc) return v;
            const bank = Math.min(hc(x + nx, z + nz), hc(x - nx, z - nz), hc(x + nx * 0.6, z + nz * 0.6), hc(x - nx * 0.6, z - nz * 0.6)) - 0.08;
            return Math.min(v, Math.max(bank, hc(x, z) + 0.2));
          };
          const y0 = lvl(x0, z0), y1 = lvl(x1, z1);
          // etwas über die Enden hinaus, damit Knicke keine Lücken haben
          const ex = (bx - ax) / len * 0.6, ez = (bz - az) / len * 0.6;
          const A = [x0 + nx - ex, y0, z0 + nz - ez], B = [x0 - nx - ex, y0, z0 - nz - ez], C = [x1 - nx + ex, y1, z1 - nz + ez], D = [x1 + nx + ex, y1, z1 + nz + ez];
          const uv = q => [q[0] / 9, q[2] / 9];
          const b = bucket.get(x0, z0);
          b.tri(A, B, C, col, uv(A), uv(B), uv(C), 0, 1, 0);
          b.tri(A, C, D, col, uv(A), uv(C), uv(D), 0, 1, 0);
        }
      }
    }
  }

  // Uferkanten als Hindernis: emit(ax, az, bx, bz). nearRoad(x, z): Straße/Brücke in der Nähe (dort bleibt frei);
  // rect: Rand der Kachel (künstliche Kanten zugeschnittener Flächen auslassen); inside(x, z): eigene Kachel?
  edges(emit, nearRoad, rect, inside) {
    const onRect = (ax, az, bx, bz) => rect && (
      (Math.abs(ax - rect.x0) < 1 && Math.abs(bx - rect.x0) < 1) || (Math.abs(ax - rect.x1) < 1 && Math.abs(bx - rect.x1) < 1) ||
      (Math.abs(az - rect.z0) < 1 && Math.abs(bz - rect.z0) < 1) || (Math.abs(az - rect.z1) < 1 && Math.abs(bz - rect.z1) < 1));
    const piece = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 2));
      for (let s = 0; s < n; s++) {
        const x0 = ax + (bx - ax) * s / n, z0 = az + (bz - az) * s / n, x1 = ax + (bx - ax) * (s + 1) / n, z1 = az + (bz - az) * (s + 1) / n;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (inside && !inside(mx, mz)) continue;
        if (nearRoad(mx, mz)) continue;
        emit(x0, z0, x1, z1);
      }
    };
    for (const P of this.polys) {
      if (!P.block) continue;
      for (const ring of [P.p].concat(P.ho || [])) for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ax = ring[j], az = ring[j + 1], bx = ring[i], bz = ring[i + 1];
        if (onRect(ax, az, bx, bz)) continue;
        piece(ax, az, bx, bz);
      }
    }
  }

  // Fließgewässer als Hindernis: Stücke der Mittellinie (≤ 3 m) mit halber Breite. Wer näher kommt, wird zurück auf
  // seine Uferseite geschoben (robuster als Uferlinien, auch in engen Biegungen). An Straßen und Brücken bleibt frei.
  riverPieces(emit, nearRoad, inside) {
    for (const L of this.lines) {
      if (!L.block) continue;
      const p = L.p, hw = Math.max(1, L.hw - 0.3);
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const n = Math.max(1, Math.ceil(len / 3));
        for (let s = 0; s < n; s++) {
          const x0 = ax + (bx - ax) * s / n, z0 = az + (bz - az) * s / n, x1 = ax + (bx - ax) * (s + 1) / n, z1 = az + (bz - az) * (s + 1) / n;
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          if (inside && !inside(mx, mz)) continue;
          if (this.polys.some(P => P.block && this.inPoly(mx, mz, P))) continue;
          if (nearRoad(mx, mz) || nearRoad(x0, z0) || nearRoad(x1, z1)) continue;
          emit({ ax: x0, az: z0, bx: x1, bz: z1, hw });
        }
      }
    }
  }
}

// ---------------- Niedrige Brücken (über Flüsse, Bäche, Gräben) ----------------
// Die Fahrbahn einer Brücke liegt als leicht gewölbte Gerade zwischen den Brückenenden (dort auf dem Gelände ohne
// ausgehobenes Bett). Unter ihr wird das Bett weiter ausgehoben, deshalb fließt das Wasser sichtbar darunter durch.
const LOW_BRIDGE = { hump: 0.022, maxHump: 0.6, minLen: 6 };
// Wölbung in der Mitte (m): höchstens ≈ 7 % Steigung an den Enden
function lowBridgeHump(len) { return Math.min(LOW_BRIDGE.maxHump, len * LOW_BRIDGE.hump); }
function lowBridgeH(hA, hB, len, s) {
  const t = len > 0 ? U.clamp(s / len, 0, 1) : 0;
  return hA + (hB - hA) * t + lowBridgeHump(len) * Math.sin(Math.PI * t);
}

// Bauwerk einer niedrigen Brücke: Platte (Unterkante über dem Wasserspiegel), Brüstung aus Sandstein bzw. Geländer
// bei Fußgängerbrücken, Widerlager an beiden Enden. parts: Chunks; pts: Mittellinie [x, z, …]; L/R: Fahrbahnkanten
// [x, y, z]; ground(x, z): Gelände darunter; water(x, z): Wasserspiegel (oder -Infinity); foot: Fußgängerbrücke
function lowBridgeParts(parts, pts, L, R, ground, water, foot) {
  const n = pts.length / 2;
  if (n < 2) return;
  const slab = new THREE.Color('#a8a397'), stone = new THREE.Color('#b8a585'), cap = new THREE.Color('#c9b998'), steel = new THREE.Color('#4f5a52');
  const thick = foot ? 0.4 : 0.85;
  const quad = (b, a, c, d, e, col, nx, ny, nz) => { b.tri(a, c, d, col, null, null, null, nx, ny, nz); b.tri(a, d, e, col, null, null, null, nx, ny, nz); };
  // Unterkante: so dick wie die Platte, aber mindestens 25 cm über dem Wasser und mindestens 25 cm stark
  const under = q => [q[0], Math.min(q[1] - 0.25, Math.max(q[1] - thick, water(q[0], q[2]) + 0.25)), q[2]];
  const lerp3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  const up = (q, h) => [q[0], q[1] + h, q[2]];
  for (let i = 0; i < n - 1; i++) {
    const b = parts.get(pts[i * 2], pts[i * 2 + 1]);
    const dx = pts[i * 2 + 2] - pts[i * 2], dz = pts[i * 2 + 3] - pts[i * 2 + 1], l = Math.hypot(dx, dz) || 1;
    const ox = -dz / l, oz = dx / l; // links
    // Platte: Seitenflächen und Unterseite
    quad(b, L[i], L[i + 1], under(L[i + 1]), under(L[i]), slab, ox, 0, oz);
    quad(b, R[i], under(R[i]), under(R[i + 1]), R[i + 1], slab, -ox, 0, -oz);
    quad(b, under(L[i]), under(L[i + 1]), under(R[i + 1]), under(R[i]), slab, 0, -1, 0);
    for (const [P, Q, s] of [[L, R, 1], [R, L, -1]]) {
      const a = P[i], c = P[i + 1];
      if (foot) {
        // Geländer: Handlauf und Knieleiste, Pfosten alle ≈ 2 m
        for (const [h0, h1] of [[1.0, 1.08], [0.48, 0.53]]) {
          quad(b, up(a, h0), up(c, h0), up(c, h1), up(a, h1), steel, ox * s, 0, oz * s);
          quad(b, up(a, h0), up(a, h1), up(c, h1), up(c, h0), steel, -ox * s, 0, -oz * s);
        }
        const k = Math.max(1, Math.round(l / 2));
        for (let j = 0; j <= k; j++) {
          if (j === k && i < n - 2) continue;
          const q = lerp3(a, c, j / k), w = 0.03;
          for (const [px, pz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
            const tx = -pz, tz = px, A = [q[0] + px * w + tx * w, q[1], q[2] + pz * w + tz * w], B = [q[0] + px * w - tx * w, q[1], q[2] + pz * w - tz * w];
            quad(b, A, B, up(B, 1.08), up(A, 1.08), steel, px, 0, pz);
          }
        }
        continue;
      }
      // Brüstung aus Sandstein: 0,3 m stark, 1,0 m hoch, mit Abdeckplatte; außen bündig mit der Platte
      const ia = lerp3(a, Q[i], 0.3 / Math.max(0.6, Math.hypot(a[0] - Q[i][0], a[2] - Q[i][2]))),
        ic = lerp3(c, Q[i + 1], 0.3 / Math.max(0.6, Math.hypot(c[0] - Q[i + 1][0], c[2] - Q[i + 1][2])));
      quad(b, a, c, up(c, 1.0), up(a, 1.0), stone, ox * s, 0, oz * s);
      quad(b, ia, up(ia, 0.92), up(ic, 0.92), ic, stone, -ox * s, 0, -oz * s);
      const ca = [a[0] + ox * s * 0.05, a[1], a[2] + oz * s * 0.05], cc = [c[0] + ox * s * 0.05, c[1], c[2] + oz * s * 0.05];
      const ka = lerp3(ia, a, -0.15), kc = lerp3(ic, c, -0.15);
      quad(b, up(ca, 0.92), up(cc, 0.92), up(cc, 1.06), up(ca, 1.06), cap, ox * s, 0, oz * s);
      quad(b, up(ka, 0.92), up(ka, 1.06), up(kc, 1.06), up(kc, 0.92), cap, -ox * s, 0, -oz * s);
      quad(b, up(ca, 1.06), up(cc, 1.06), up(kc, 1.06), up(ka, 1.06), cap, 0, 1, 0);
    }
  }
  // Widerlager: Wand unter den Brückenenden bis ins Gelände (verdeckt den Spalt zur Uferböschung)
  for (const i of [0, n - 1]) {
    const g = q => [q[0], Math.min(under(q)[1], ground(q[0], q[2]) - 0.6), q[2]];
    const j = i ? i - 1 : 1, dx = pts[i * 2] - pts[j * 2], dz = pts[i * 2 + 1] - pts[j * 2 + 1];
    const b = parts.get(pts[i * 2], pts[i * 2 + 1]);
    quad(b, under(L[i]), g(L[i]), g(R[i]), under(R[i]), foot ? slab : stone, -dx, 0, -dz);
  }
}

// Kreis (x, z, r) aus Flussstücken im Raster herausschieben; out wie bei World.collideCircle. Gibt true zurück, wenn verschoben.
// y: Höhe eines Autos; wer deutlich über dem Wasserspiegel (q.y) fährt, ist auf einer Brücke und wird nicht geschoben.
function pushFromRivers(grid, out, r, tmp, y) {
  let moved = false;
  const list = grid.query(out.x, out.z, r + 2, tmp);
  for (const q of list) {
    if (y !== undefined && q.y !== undefined && y > q.y + 2.5) continue;
    const c = U.closestOnSeg(out.x, out.z, q.ax, q.az, q.bx, q.bz);
    const dx = out.x - c[0], dz = out.z - c[1], d = Math.hypot(dx, dz), need = q.hw + r;
    if (d >= need) continue;
    let nx, nz;
    if (d > 1e-4) { nx = dx / d; nz = dz / d; }
    else { const l = Math.hypot(q.bx - q.ax, q.bz - q.az) || 1; nx = -(q.bz - q.az) / l; nz = (q.bx - q.ax) / l; }
    out.x = c[0] + nx * need; out.z = c[1] + nz * need;
    out.nx += nx; out.nz += nz; out.hit = true; moved = true;
  }
  return moved;
}
