// Hilfsfunktionen: Zufall, Raster für schnelle Nachbarschaftssuche, Geometrie in der Ebene.
'use strict';

const U = {};

// Safari vor iOS 16 kennt ctx.roundRect nicht (sonst bricht der Aufbau bei Pflaster und Schildern ab)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.max(0, Math.min(Array.isArray(r) ? r[0] || 0 : r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

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
