// Gemeinsame Kachel-Einteilung des Umlands für convert-region.js und fetch-region-ortho.js.
// Kachel (i, j) umfasst die Zellen c = 20i … 20i+20, r = 20j … 20j+20 des Geländegitters der Innenstadt (fortgesetzt).
// Zustand: 0 = nicht Teil der Welt, 1 = Randkachel (nur Gelände und Luftbild), 2 = befahrbar (Landkreis + Puffer).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ORIGIN } = require('./config');
const { TILE_CELLS, BUFFER_M, RELATIONS } = require('./region-config');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'region');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon;
const projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;
const lonOf = x => ORIGIN.lon + x / mPerDegLon;
const latOf = z => ORIGIN.lat - z / mPerDegLat;

function assembleRings(members) {
  const segs = members.map(m => m.geometry.map(g => [projX(g.lon), projZ(g.lat)]));
  const same = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let grown = true;
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = ring[ring.length - 1];
        if (same(end, s[0])) ring = ring.concat(s.slice(1));
        else if (same(end, s[s.length - 1])) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        segs.splice(i, 1); grown = true; break;
      }
    }
    if (same(ring[0], ring[ring.length - 1])) ring.pop();
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}
function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
// Abstand Strecke–Rechteck über Stichproben (Grenzsegmente sind kurz)
function segRectDist(a, b, x0, z0, x1, z1) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 50));
  let best = Infinity;
  for (let k = 0; k <= n; k++) {
    const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
    best = Math.min(best, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
  }
  return best;
}

function loadCoreTerrain() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'coburg.js'), 'utf8'), ctx);
  const W = ctx.window.COBURG;
  if (!W.terrain) throw new Error('Kein Gelände in data/coburg.js');
  return W;
}

function computeTiles(T, EL) {
  const TC = TILE_CELLS;
  const i0 = EL.c0 / TC, j0 = EL.r0 / TC, ni = (EL.cols - 1) / TC, nj = (EL.rows - 1) / TC;
  const tileX0 = i => T.minX + i * TC * T.stepX, tileZ0 = j => T.minZ + j * TC * T.stepZ;
  const tileOf = (x, z) => [Math.floor((x - T.minX) / (TC * T.stepX)), Math.floor((z - T.minZ) / (TC * T.stepZ))];
  const bnd = JSON.parse(fs.readFileSync(path.join(RAW, 'boundary.json'), 'utf8'));
  const shapes = bnd.elements.filter(r => RELATIONS.includes(r.id)).map(r => ({
    outer: assembleRings(r.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry)),
    inner: assembleRings(r.members.filter(m => m.type === 'way' && m.role === 'inner' && m.geometry)),
  }));
  const inArea = (x, z) => shapes.some(s => s.outer.some(r => pointInRing(x, z, r)) && !s.inner.some(r => pointInRing(x, z, r)));
  const borderSegs = [];
  for (const s of shapes) for (const r of s.outer) for (let k = 0; k < r.length; k++) borderSegs.push([r[k], r[(k + 1) % r.length]]);
  const state = new Uint8Array(ni * nj);
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const ti = i0 + i, tj = j0 + j;
    const x0 = tileX0(ti), z0 = tileZ0(tj), x1 = tileX0(ti + 1), z1 = tileZ0(tj + 1);
    let on = false;
    for (let a = 0; a <= 2 && !on; a++) for (let b = 0; b <= 2 && !on; b++) on = inArea(x0 + (x1 - x0) * a / 2, z0 + (z1 - z0) * b / 2);
    if (!on) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const [a, b] of borderSegs) {
        if (Math.abs(a[0] - cx) > 2500 || Math.abs(a[1] - cz) > 2500) continue;
        if (segRectDist(a, b, x0, z0, x1, z1) < BUFFER_M) { on = true; break; }
      }
    }
    if (on) state[j * ni + i] = 2;
  }
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    if (state[j * ni + i]) continue;
    let near = false;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const ii = i + a, jj = j + b;
      if (ii >= 0 && jj >= 0 && ii < ni && jj < nj && state[jj * ni + ii] === 2) near = true;
    }
    if (near) state[j * ni + i] = 1;
  }
  const stateAt = (x, z) => { const [ti, tj] = tileOf(x, z); const i = ti - i0, j = tj - j0; return i < 0 || j < 0 || i >= ni || j >= nj ? 0 : state[j * ni + i]; };
  return { TC, i0, j0, ni, nj, state, tileX0, tileZ0, tileOf, stateAt, inArea };
}

module.exports = { RAW, ROOT, projX, projZ, lonOf, latOf, assembleRings, pointInRing, loadCoreTerrain, computeTiles };
