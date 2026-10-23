// Hilfsfunktionen: Zufall, Raster für schnelle Nachbarschaftssuche, Geometrie in der Ebene.
'use strict';

const U = {};

// Deterministischer Zufall (Mulberry32)
U.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
U.hashStr = function (s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
U.lerp = (a, b, t) => a + (b - a) * t;
U.smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
U.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
U.wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// Gleichmäßiges Raster: jedes Objekt wird in alle Zellen seiner Bounding-Box eingetragen.
U.Grid = class {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return (i + 4096) * 8192 + (j + 4096); }
  insert(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    const i0 = Math.floor(minX / c), i1 = Math.floor(maxX / c);
    const j0 = Math.floor(minZ / c), j1 = Math.floor(maxZ / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(item);
    }
  }
  // Alle Objekte in Zellen, die den Kreis um (x,z) mit Radius r berühren (kann Doppelte enthalten)
  query(x, z, r, out) {
    out = out || [];
    out.length = 0;
    const c = this.cell;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c);
    const j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const arr = this.map.get(this.key(i, j));
      if (arr) for (let n = 0; n < arr.length; n++) out.push(arr[n]);
    }
    return out;
  }
};

// Punkt in Polygon (flaches Array [x,z,x,z,...])
U.pointInPoly = function (x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
U.polyArea = function (p) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return a / 2;
};
U.polyBBox = function (p) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
    if (p[i + 1] < minZ) minZ = p[i + 1]; if (p[i + 1] > maxZ) maxZ = p[i + 1];
  }
  return { minX, minZ, maxX, maxZ };
};
// Nächster Punkt auf Strecke a-b zu p; gibt [x, z, t] zurück
U.closestOnSeg = function (px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * t, az + dz * t, t];
};

// Kleine Farbhilfe: sRGB-Hex -> THREE.Color (linear), mit Helligkeitsvariation
U.color = function (hex, vary, rnd) {
  const c = new THREE.Color(hex);
  if (vary) {
    const f = 1 + (rnd() - 0.5) * vary;
    c.r *= f; c.g *= f; c.b *= f;
  }
  return c;
};

// ---------- Figuren: abgerundete Körperteile ----------
// Quader mit runden Kanten (Radius r) aus einem unterteilten Würfel; taper(t) skaliert x/z über die Höhe
// (t = 0 unten … 1 oben). Normalen werden aus der Rundung berechnet, damit keine Kanten zu sehen sind.
U.roundBox = function (w, h, d, r, seg = 4, taper) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(U.clamp(v.x, -ix, ix), U.clamp(v.y, -iy, iy), U.clamp(v.z, -iz, iz));
    n.subVectors(v, c);
    if (n.lengthSq() > 1e-10) { n.normalize(); v.copy(c).addScaledVector(n, r); nor.setXYZ(i, n.x, n.y, n.z); }
    if (taper) { const s = taper(v.y / h + 0.5); v.x *= s; v.z *= s; }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return g.toNonIndexed();
};
// Teile zusammenfassen: [geometrie, x, y, z, farbe (Graustufe, optional)]
U.mergeParts = function (list) {
  const P = [], N = [], C = [];
  for (const [g0, x, y, z, col = 1] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(col, col, col);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
};
// Körperteile mit denselben Maßen und Drehpunkten wie die früheren Quader (Spieler, Polizisten, Passanten).
// Beine mit Schuh (dunkle Eckenfarbe), Kopf mit Hals und Nase, Haar als Kappe mit Hinterkopf.
U.figParts = function () {
  if (U._fig) return U._fig;
  const leg = U.mergeParts([
    [U.roundBox(0.19, 0.84, 0.22, 0.085, 4, t => U.lerp(0.72, 1.0, t)), 0, 0.01, 0],
    [U.roundBox(0.18, 0.11, 0.3, 0.05, 3), 0, -0.4, 0.045, 0.22],
  ]);
  const arm = U.mergeParts([
    [U.roundBox(0.14, 0.52, 0.16, 0.065, 4, t => U.lerp(0.78, 1.0, t)), 0, 0.04, 0],
    [U.roundBox(0.1, 0.13, 0.11, 0.045, 3), 0, -0.27, 0.01, 0.82],
  ]);
  const torso = U.mergeParts([[U.roundBox(0.48, 0.62, 0.27, 0.1, 5, t => t < 0.75 ? U.lerp(0.84, 1.0, t / 0.75) : U.lerp(1.0, 0.9, (t - 0.75) / 0.25)), 0, 0, 0]]);
  const head = U.mergeParts([
    [U.roundBox(0.27, 0.32, 0.29, 0.12, 4), 0, 0.01, 0],
    [new THREE.CylinderGeometry(0.06, 0.07, 0.16, 8), 0, -0.2, -0.01],
    [U.roundBox(0.05, 0.08, 0.06, 0.02, 2), 0, -0.01, 0.15],
    [U.roundBox(0.05, 0.035, 0.03, 0.012, 2), 0.065, 0.035, 0.137, 0.12],
    [U.roundBox(0.05, 0.035, 0.03, 0.012, 2), -0.065, 0.035, 0.137, 0.12],
    [U.roundBox(0.09, 0.018, 0.02, 0.008, 2), 0, -0.075, 0.14, 0.45],
  ]);
  const hair = U.mergeParts([
    [U.roundBox(0.3, 0.1, 0.32, 0.05, 3), 0, -0.03, -0.01],
    [U.roundBox(0.3, 0.2, 0.09, 0.04, 3), 0, -0.13, -0.12],
  ]);
  U._fig = { leg, arm, torso, head, hair };
  return U._fig;
};
