// Wandelt die Rohdaten des Umlands (data/raw/region/) in data/region.js um (window.COBURG_REGION).
// Aufruf (nach convert.js, fetch-region-osm.js und fetch-region-elevation.js): node tools/convert-region.js
//
// Das Umland ist in Kacheln von 20 × 20 Zellen des Geländegitters geteilt (≈ 1 km). Das Spiel baut nur die
// Kacheln in der Nähe des Spielers. Kachel (i, j) umfasst die Gitterzellen c = 20i … 20i+20, r = 20j … 20j+20,
// gezählt ab der Nordwestecke des Innenstadt-Geländes (data/coburg.js), dessen Gitter hier fortgesetzt wird.
//
// Kompakte Formate (alle Längen in Dezimetern als ganze Zahlen, Linien als Differenzen):
//   Linie/Ring:  [x0, z0, dx1, dz1, dx2, dz2, …]
//   Gebäude:     [Typ-Index, Höhe dm, Flags (1 Satteldach, 2 Flachdach), Name-Index (-1 = keiner), …Ring]
//   Kante:       [a, b, Klasse, Breite dm, Name-Index, Flags (1 Einbahn, 2 Brücke), Tempo dm/s, …Linie]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ORIGIN } = require('./config');
const { BBOX, TILE_CELLS } = require('./region-config');
const { computeTiles } = require('./region-tiles');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'region');
const OUT = path.join(ROOT, 'data', 'region.js');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon;
const projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;
const dm = v => Math.round(v * 10);

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'coburg.js'), 'utf8'), ctx);
const CORE = ctx.window.COBURG;
const T = CORE.terrain;
if (!T) throw new Error('Kein Gelände in data/coburg.js');
const CB = { minX: T.minX, minZ: T.minZ, maxX: T.minX + (T.cols - 1) * T.stepX, maxZ: T.minZ + (T.rows - 1) * T.stepZ };
const inCore = (x, z, m = 0) => x > CB.minX - m && x < CB.maxX + m && z > CB.minZ - m && z < CB.maxZ + m;

// ---------- Rohdaten zusammenführen ----------
const nodes = new Map(), ways = new Map(), rels = new Map(), tagNodes = new Map();
let osmTime = null;
for (const f of fs.readdirSync(RAW).filter(f => /^(osm|rel)_[\d_]+\.json$/.test(f)).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  if (j.osm3s && j.osm3s.timestamp_osm_base) osmTime = j.osm3s.timestamp_osm_base;
  for (const e of j.elements) {
    if (e.type === 'node') { nodes.set(e.id, [projX(e.lon), projZ(e.lat)]); if (e.tags) tagNodes.set(e.id, e); }
    else if (e.type === 'way' && e.tags) ways.set(e.id, e);
    else if (e.type === 'relation' && e.tags) rels.set(e.id, e);
  }
}
if (!ways.size) throw new Error('Keine OSM-Daten in data/raw/region – erst node tools/fetch-region-osm.js');
console.log(`OSM: ${nodes.size} Punkte, ${ways.size} Wege, ${rels.size} Relationen`);

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
function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function centroid(r) { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; }
function coordsOf(way) {
  const pts = [];
  for (const id of way.nodes) {
    const p = nodes.get(id);
    if (!p) continue;
    const l = pts[pts.length - 1];
    if (l && Math.abs(l[0] - p[0]) < 0.05 && Math.abs(l[1] - p[1]) < 0.05) continue;
    pts.push(p);
  }
  return pts;
}
const isClosed = w => w.nodes && w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
// Douglas-Peucker
function simplify(pts, tol, closed) {
  if (pts.length <= (closed ? 4 : 2)) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = tol;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    for (let i = a + 1; i < b; i++) {
      let t = l2 ? ((pts[i][0] - ax) * dx + (pts[i][1] - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pts[i][0] - ax - dx * t, pts[i][1] - az - dz * t);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
const enc = pts => { const o = []; let px = 0, pz = 0; for (const [x, z] of pts) { const X = dm(x), Z = dm(z); o.push(X - px, Z - pz); px = X; pz = Z; } return o; };

// ---------- Kacheln ----------
const EL = JSON.parse(fs.readFileSync(path.join(RAW, 'elevation.json'), 'utf8'));
const TC = TILE_CELLS;
const i0 = EL.c0 / TC, j0 = EL.r0 / TC, ni = (EL.cols - 1) / TC, nj = (EL.rows - 1) / TC;
const tileX0 = i => T.minX + i * TC * T.stepX, tileZ0 = j => T.minZ + j * TC * T.stepZ;
const tileOf = (x, z) => [Math.floor((x - T.minX) / (TC * T.stepX)), Math.floor((z - T.minZ) / (TC * T.stepZ))];
const tkey = (i, j) => i + ',' + j;

const TL = computeTiles(T, EL), { state } = TL, stateAt = TL.stateAt;
const tiles = new Map();
const tileData = (x, z) => {
  const [ti, tj] = tileOf(x, z), k = tkey(ti, tj);
  if (!tiles.has(k)) tiles.set(k, { b: [], a: [], t: [], w: [], r: [], s: [] });
  return tiles.get(k);
};
console.log(`Kacheln: ${state.filter(s => s === 2).length} befahrbar, ${state.filter(s => s === 1).length} Rand (${ni} × ${nj})`);

// ---------- Gelände ----------
// Höhen relativ zum Marktplatz; im Kern genau die Werte der Innenstadt, außen in einem Übergang angeglichen
const H = new Float64Array(EL.cols * EL.rows);
for (let k = 0; k < H.length; k++) H[k] = EL.h[k] - T.base;
const coreAt = (c, r) => T.h[Math.max(0, Math.min(T.rows - 1, r)) * T.cols + Math.max(0, Math.min(T.cols - 1, c))];
const BLEND = 900;
const raw = Float64Array.from(H);
for (let r = 0; r < EL.rows; r++) for (let c = 0; c < EL.cols; c++) {
  const gc = EL.c0 + c, gr = EL.r0 + r, k = r * EL.cols + c;
  if (gc >= 0 && gc < T.cols && gr >= 0 && gr < T.rows) { H[k] = coreAt(gc, gr); continue; }
  const cc = Math.max(0, Math.min(T.cols - 1, gc)), rr = Math.max(0, Math.min(T.rows - 1, gr));
  const dist = Math.hypot((gc - cc) * T.stepX, (gr - rr) * T.stepZ);
  if (dist >= BLEND) continue;
  const d = coreAt(cc, rr) - raw[(rr - EL.r0) * EL.cols + (cc - EL.c0)];
  const t = 1 - dist / BLEND, w = t * t * (3 - 2 * t);
  H[k] += d * w;
}
const hBuf = Buffer.alloc(H.length * 2);
for (let k = 0; k < H.length; k++) hBuf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(H[k] * 10))), k * 2);

// ---------- Namen und Typen ----------
const names = [], nameIdx = new Map();
const nameOf = s => { if (!s) return -1; if (!nameIdx.has(s)) { nameIdx.set(s, names.length); names.push(s); } return nameIdx.get(s); };
const types = [], typeIdx = new Map();
const typeOf = s => { if (!typeIdx.has(s)) { typeIdx.set(s, types.length); types.push(s); } return typeIdx.get(s); };

// ---------- Gebäude ----------
const DEFAULT_HEIGHT = {
  house: 7.5, detached: 7.5, semidetached_house: 7.5, terrace: 8, residential: 10, apartments: 13, farm: 8,
  garage: 2.8, garages: 2.8, carport: 2.6, shed: 2.6, roof: 4, hut: 3, kiosk: 3, service: 3.5, barn: 7, farm_auxiliary: 6,
  stable: 6, cowshed: 6, greenhouse: 3.5, church: 18, chapel: 9, cathedral: 25, castle: 15, college: 12, university: 14,
  school: 11, kindergarten: 5, train_station: 10, retail: 6, supermarket: 6, commercial: 10, office: 13,
  industrial: 9, warehouse: 9, public: 12, dormitory: 13, hotel: 15, silo: 14, yes: 8,
};
const GABLE_TYPES = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'yes', 'residential', 'apartments', 'farm', 'barn']);
const parseNum = v => { if (!v) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
const hash = id => { let x = (id * 2654435761) % 4294967296; x ^= x >>> 15; x = (x * 2246822519) % 4294967296; x ^= x >>> 13; return (x % 10000) / 10000; };

// Häuser der Innenstadt-Daten, die über den Kernrand ragen, nicht doppelt bauen
const coreBuildings = CORE.buildings.map(b => { const r = []; for (let i = 0; i < b.p.length; i += 2) r.push([b.p[i], b.p[i + 1]]); return r; });
const inCoreBuilding = (x, z) => coreBuildings.some(r => pointInRing(x, z, r));

const bSources = [];
for (const w of ways.values()) if (w.tags.building && isClosed(w)) bSources.push({ id: w.id, tags: w.tags, ring: coordsOf(w).slice(0, -1) });
for (const r of rels.values()) if (r.tags.building && r.members) {
  const outer = assembleRings(r.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry));
  outer.forEach((ring, k) => bSources.push({ id: r.id * 10 + k, tags: r.tags, ring }));
}
let nb = 0;
for (const s of bSources) {
  const t = s.tags;
  if (t.building === 'no' || t.building === 'construction' && !t['building:levels']) continue;
  let ring = s.ring;
  if (ring.length < 3) continue;
  const area = Math.abs(ringArea(ring));
  if (area < 6) continue;
  const [cx, cz] = centroid(ring);
  if (inCore(cx, cz) || !stateAt(cx, cz) || stateAt(cx, cz) < 2) continue;
  if (inCore(cx, cz, 400) && inCoreBuilding(cx, cz)) continue;
  ring = simplify(ring.concat([ring[0]]), 0.3, true); ring.pop();
  if (ring.length < 3) continue;
  const type = t.building;
  let h = parseNum(t.height);
  const lv = parseNum(t['building:levels']);
  if (!h && lv) h = lv * 3.0 + (t['roof:levels'] ? parseNum(t['roof:levels']) * 2.5 : 1);
  if (!h) {
    h = DEFAULT_HEIGHT[type] || 8;
    if (type === 'yes' && area < 40) h = 3.2;
    else if (type === 'yes' && area > 900) h = 11;
    h *= 0.88 + hash(s.id) * 0.26;
  }
  let flags = 0;
  const shape = t['roof:shape'];
  if (shape === 'gabled' || shape === 'pitched') flags |= 1;
  else if (!shape && GABLE_TYPES.has(type) && ring.length === 4 && area < 400 && h < 16) flags |= 1;
  if (ring.length !== 4) flags &= ~1;
  if (shape === 'flat') flags |= 2;
  tileData(cx, cz).b.push([typeOf(type), Math.round(h * 10), flags, nameOf(t.name || null), ...enc(ring)]);
  nb++;
}

// ---------- Straßennetz (zugleich die gezeichneten Straßen) ----------
const ROAD = {
  motorway: [11, 1, 33], motorway_link: [6, 2, 17], trunk: [10, 3, 28], trunk_link: [6, 4, 15],
  primary: [8.5, 5, 24], primary_link: [6, 6, 12], secondary: [7.5, 7, 22], secondary_link: [6, 8, 12],
  tertiary: [7, 9, 19], tertiary_link: [5.5, 10, 12], unclassified: [5.5, 11, 14], residential: [6, 12, 9],
  living_street: [5, 13, 5],
};
const CLASS_NAMES = []; for (const [k, v] of Object.entries(ROAD)) CLASS_NAMES[v[1]] = k;
function speedOf(t) {
  const d = ROAD[t.highway][2];
  const ms = t.maxspeed;
  if (!ms) return d;
  if (/DE:urban/.test(ms)) return Math.min(d, 13);
  if (/DE:rural/.test(ms)) return Math.max(d, 24);
  if (/none|DE:motorway/.test(ms)) return 36;
  const n = parseFloat(ms);
  return Number.isFinite(n) && n > 4 ? n / 3.6 * 0.95 : d;
}
const drivable = [...ways.values()].filter(w => w.nodes && ROAD[w.tags.highway] && w.tags.area !== 'yes' && w.tags.access !== 'no' &&
  w.nodes.some(id => { const p = nodes.get(id); return p && stateAt(p[0], p[1]) === 2; }));
const useCount = new Map();
for (const w of drivable) w.nodes.forEach((id, i) => useCount.set(id, (useCount.get(id) || 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));
const gIndex = new Map(), gNodes = [];
const gNode = id => { if (!gIndex.has(id)) { gIndex.set(id, gNodes.length / 2); const p = nodes.get(id); gNodes.push(dm(p[0]), dm(p[1])); } return gIndex.get(id); };
const edges = [];
let roadKm = 0;
for (const w of drivable) {
  const ids = w.nodes.filter(id => nodes.has(id));
  if (ids.length < 2) continue;
  const t = w.tags, def = ROAD[t.highway];
  let width = parseNum(t.width) || def[0];
  if (t.lanes) width = Math.max(width, Math.min(parseNum(t.lanes), 4) * (def[1] <= 2 ? 3.5 : 3.1));
  const oneway = t.oneway === 'yes' || t.oneway === '1' || t.highway === 'motorway' || t.junction === 'roundabout';
  const flags = (oneway || t.oneway === '-1' ? 1 : 0) | (t.bridge === 'yes' || t.bridge === 'viaduct' ? 2 : 0);
  const sp = Math.round(speedOf(t) * 10);
  let start = 0;
  for (let i = 1; i < ids.length; i++) {
    if (i === ids.length - 1 || useCount.get(ids[i]) > 1) {
      let seg = ids.slice(start, i + 1);
      if (t.oneway === '-1') seg = seg.reverse();
      const pts = seg.map(id => nodes.get(id));
      for (let k = 1; k < pts.length; k++) roadKm += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) / 1000;
      edges.push([gNode(seg[0]), gNode(seg[seg.length - 1]), def[1], Math.round(width * 10), nameOf(t.name || t.ref || null), flags, sp, ...enc(pts)]);
      start = i;
    }
  }
}

// ---------- Flächen ----------
const AREA_KIND = {
  'landuse=forest': 'forest', 'natural=wood': 'forest', 'landuse=grass': 'grass', 'landuse=meadow': 'meadow',
  'landuse=village_green': 'grass', 'landuse=recreation_ground': 'grass', 'leisure=park': 'park', 'leisure=garden': 'park',
  'leisure=playground': 'playground', 'leisure=pitch': 'pitch', 'leisure=track': 'trackSport', 'leisure=stadium': 'pitch',
  'leisure=sports_centre': 'sport', 'leisure=golf_course': 'meadow', 'landuse=allotments': 'allotments',
  'landuse=farmland': 'farmland', 'landuse=farmyard': 'farmyard', 'landuse=orchard': 'orchard', 'landuse=vineyard': 'orchard',
  'landuse=industrial': 'industrial', 'landuse=railway': 'industrial', 'landuse=quarry': 'construction',
  'landuse=commercial': 'commercial', 'landuse=retail': 'commercial', 'landuse=construction': 'construction',
  'landuse=brownfield': 'construction', 'landuse=landfill': 'construction', 'landuse=residential': 'residential',
  'landuse=religious': 'grass', 'landuse=education': 'yard', 'landuse=cemetery': 'cemetery', 'natural=water': 'water',
  'landuse=reservoir': 'water', 'landuse=basin': 'water', 'leisure=swimming_pool': 'pool', 'amenity=parking': 'parking',
  'landuse=greenhouse_horticulture': 'farmland', 'landuse=plant_nursery': 'allotments', 'natural=scrub': 'scrub',
  'natural=grassland': 'meadow', 'natural=heath': 'meadow', 'natural=wetland': 'meadow',
};
const kindOf = t => {
  // Flussflächen (Uferlinien von Itz, Rodach …) folgen dem Gefälle, Seen und Teiche liegen flach
  if (t.natural === 'water' && /river|stream|canal|riverbank/.test(t.water || '') || t.waterway === 'riverbank') return 'river';
  for (const k of ['natural', 'leisure', 'landuse', 'amenity']) if (t[k] && AREA_KIND[k + '=' + t[k]]) return AREA_KIND[k + '=' + t[k]]; return null; };
// Vieleck an einem Rechteck abschneiden (Sutherland–Hodgman)
function clipRing(ring, x0, z0, x1, z1) {
  let pts = ring;
  const edgesC = [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= z0, (a, b) => [a[0] + (b[0] - a[0]) * (z0 - a[1]) / (b[1] - a[1]), z0]],
    [p => p[1] <= z1, (a, b) => [a[0] + (b[0] - a[0]) * (z1 - a[1]) / (b[1] - a[1]), z1]]];
  for (const [inside, cut] of edgesC) {
    if (!pts.length) break;
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[(k + pts.length - 1) % pts.length], b = pts[k];
      const ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
    pts = out;
  }
  return pts;
}
const areaSources = [];
for (const w of ways.values()) { const k = kindOf(w.tags); if (k && !w.tags.building && isClosed(w)) areaSources.push({ k, n: w.tags.name, rings: [coordsOf(w).slice(0, -1)] }); }
for (const r of rels.values()) {
  const k = kindOf(r.tags);
  if (!k || r.tags.building || !r.members) continue;
  const outer = assembleRings(r.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry));
  const inner = assembleRings(r.members.filter(m => m.type === 'way' && m.role === 'inner' && m.geometry));
  for (const o of outer) areaSources.push({ k, n: r.tags.name, rings: [o, ...inner.filter(h => pointInRing(h[0][0], h[0][1], o))] });
}
let na = 0;
const TOL = { forest: 3, farmland: 3, meadow: 3, scrub: 3, residential: 2.5, water: 1.5 };
for (const s of areaSources) {
  const rings = s.rings.map(r => { const q = simplify(r.concat([r[0]]), TOL[s.k] || 1.5, true); q.pop(); return q; }).filter(r => r.length >= 3);
  if (!rings.length) continue;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of rings[0]) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
  const [ta, tb] = tileOf(minX, minZ), [tc, td] = tileOf(maxX, maxZ);
  for (let tj = tb; tj <= td; tj++) for (let ti = ta; ti <= tc; ti++) {
    const i = ti - i0, j = tj - j0;
    if (i < 0 || j < 0 || i >= ni || j >= nj || !state[j * ni + i]) continue;
    const x0 = tileX0(ti) - 0.5, z0 = tileZ0(tj) - 0.5, x1 = tileX0(ti + 1) + 0.5, z1 = tileZ0(tj + 1) + 0.5;
    const outer = clipRing(rings[0], x0, z0, x1, z1);
    if (outer.length < 3 || Math.abs(ringArea(outer)) < 4) continue;
    const holes = rings.slice(1).map(h => clipRing(h, x0, z0, x1, z1)).filter(h => h.length >= 3);
    const key = tkey(ti, tj);
    if (!tiles.has(key)) tiles.set(key, { b: [], a: [], t: [], w: [], r: [], s: [] });
    const a = [s.k, enc(outer)];
    if (holes.length) a.push(holes.map(enc));
    tiles.get(key).a.push(a);
    na++;
  }
}

// ---------- Bäume, Gewässer, Bahn ----------
let ntree = 0;
for (const n of tagNodes.values()) {
  if (n.tags.natural !== 'tree') continue;
  const [x, z] = nodes.get(n.id);
  if (inCore(x, z) || stateAt(x, z) !== 2) continue;
  tileData(x, z).t.push(dm(x), dm(z)); ntree++;
}
const WATER_WIDTH = { river: 12, stream: 2.5, canal: 8 };
for (const w of ways.values()) {
  const t = w.tags;
  const water = t.waterway && WATER_WIDTH[t.waterway] && t.tunnel !== 'culvert' && t.tunnel !== 'yes';
  const rail = t.railway === 'rail' && t.tunnel !== 'yes';
  if (!w.nodes || (!water && !rail)) continue;
  const pts = simplify(coordsOf(w), 2, false);
  // in Stücke je Kachel zerlegen (nach Mitte des Abschnitts)
  let run = [], runKey = null;
  const flush = () => { if (run.length >= 2 && tiles.has(runKey)) { const td = tiles.get(runKey); if (water) td.w.push([Math.round((parseNum(t.width) || WATER_WIDTH[t.waterway]) * 10), ...enc(run)]); else td.r.push(enc(run)); } };
  for (let k = 1; k < pts.length; k++) {
    const mx = (pts[k][0] + pts[k - 1][0]) / 2, mz = (pts[k][1] + pts[k - 1][1]) / 2;
    const st = stateAt(mx, mz);
    const key = st ? tkey(...tileOf(mx, mz)) : null;
    if (key !== runKey) { flush(); run = key ? [pts[k - 1]] : []; runKey = key; if (key && !tiles.has(key)) tiles.set(key, { b: [], a: [], t: [], w: [], r: [], s: [] }); }
    if (key) run.push(pts[k]);
  }
  flush();
}

// ---------- Läden und Lokale (Ladenschilder, begehbare Lokale) ----------
let nshop = 0;
const shopFile = path.join(RAW, 'shops.json');
if (fs.existsSync(shopFile)) {
  for (const e of JSON.parse(fs.readFileSync(shopFile, 'utf8')).elements) {
    const t = e.tags || {}, la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon);
    if (la == null || !t.name) continue;
    const x = projX(lo), z = projZ(la);
    if (inCore(x, z) || stateAt(x, z) !== 2) continue;
    tileData(x, z).s.push([t.name, t.shop ? 'shop=' + t.shop : 'amenity=' + t.amenity, dm(x), dm(z)]);
    nshop++;
  }
}

// ---------- Orte ----------
const places = [];
const PLACE_RANK = { city: 0, town: 1, village: 2, suburb: 3, quarter: 4, hamlet: 4, isolated_dwelling: 5 };
for (const n of tagNodes.values()) {
  const t = n.tags;
  if (!t.name) continue;
  const [x, z] = nodes.get(n.id);
  if (!stateAt(x, z)) continue;
  if (t.place && PLACE_RANK[t.place] !== undefined) places.push({ n: t.name, k: t.place, x: Math.round(x), z: Math.round(z) });
  else if (t.tourism || t.historic) places.push({ n: t.name, k: t.tourism || t.historic, x: Math.round(x), z: Math.round(z) });
}
// benannte Burgen und Schlösser (Gebäude) als Sehenswürdigkeiten
for (const s of bSources) if (s.tags.name && /castle|church|palace/.test(s.tags.building + ' ' + (s.tags.historic || ''))) {
  const [x, z] = centroid(s.ring);
  if (stateAt(x, z) === 2 && !inCore(x, z)) places.push({ n: s.tags.name, k: s.tags.historic || s.tags.building, x: Math.round(x), z: Math.round(z) });
}

// ---------- Schreiben ----------
const stateStr = Array.from(state).join('');
const tileObj = {};
for (const [k, v] of tiles) {
  const [ti, tj] = k.split(',').map(Number), i = ti - i0, j = tj - j0;
  if (i < 0 || j < 0 || i >= ni || j >= nj || !state[j * ni + i]) continue;
  const o = {};
  for (const f of ['b', 'a', 't', 'w', 'r', 's']) if (v[f].length) o[f] = v[f];
  if (Object.keys(o).length) tileObj[k] = o;
}
const region = {
  meta: {
    origin: ORIGIN, bbox: BBOX, base: T.base, tileCells: TC, osmTimestamp: osmTime,
    source: '© OpenStreetMap-Mitwirkende (ODbL), Höhen: Terrarium/EU-DEM',
  },
  grid: { c0: EL.c0, r0: EL.r0, cols: EL.cols, rows: EL.rows, minX: T.minX, minZ: T.minZ, stepX: T.stepX, stepZ: T.stepZ, h: hBuf.toString('base64') },
  tiles: { i0, j0, ni, nj, state: stateStr },
  names, types, classes: CLASS_NAMES,
  graph: { nodes: gNodes, edges },
  places, data: tileObj,
};
const js = '// Automatisch erzeugt von tools/convert-region.js – nicht von Hand bearbeiten.\n' +
  '// Kartendaten © OpenStreetMap-Mitwirkende (ODbL); Höhen: Terrarium (Mapzen, AWS Open Data), Europa: EU-DEM\n' +
  'window.COBURG_REGION = ' + JSON.stringify(region) + ';\n';
fs.writeFileSync(OUT, js);
console.log(`Gebäude ${nb}, Flächenstücke ${na}, Bäume ${ntree}, Läden ${nshop}, Orte ${places.length}, Netz ${gNodes.length / 2} Knoten / ${edges.length} Kanten ` +
  `(${roadKm.toFixed(0)} km), Namen ${names.length}`);
console.log(`Geschrieben: data/region.js (${(js.length / 1024 / 1024).toFixed(2)} MB)`);
