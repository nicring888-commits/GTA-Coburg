// Wandelt die rohen OpenStreetMap-Daten (data/raw/coburg.osm.json) und das Höhenraster
// (data/raw/elevation.json, optional) in die kompakte Spielwelt data/coburg.js um.
// Aufruf: node tools/convert.js
//
// Koordinaten der Spielwelt: Meter, Nullpunkt Marktplatz, x = Osten, z = Süden (wie in three.js,
// wo -z nach Norden zeigt). Höhen sind relativ zum Marktplatz.
const fs = require('fs');
const path = require('path');
const { ORIGIN, BBOX } = require('./config');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const OUT = path.join(__dirname, '..', 'data', 'coburg.js');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon;
const projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;
const r1 = v => Math.round(v * 10) / 10;

const osm = JSON.parse(fs.readFileSync(path.join(RAW, 'coburg.osm.json'), 'utf8'));
const nodes = new Map();
const ways = [];
const tagNodes = [];
for (const e of osm.elements) {
  if (e.type === 'node') {
    nodes.set(e.id, [r1(projX(e.lon)), r1(projZ(e.lat))]);
    if (e.tags) tagNodes.push(e);
  } else if (e.type === 'way' && e.tags) {
    ways.push(e);
  }
}

// Multipolygone (z. B. Schloss Ehrenburg, Hofgarten): Ringe aus den Mitgliedswegen zusammensetzen.
// Sie werden als "Wege" mit fertigen Ringen (rings: [outer, ...holes]) in dieselbe Liste gehängt.
const relFile = path.join(RAW, 'relations.osm.json');
if (fs.existsSync(relFile)) {
  const rel = JSON.parse(fs.readFileSync(relFile, 'utf8'));
  for (const r of rel.elements) {
    if (r.type !== 'relation' || !r.tags) continue;
    const tags = { ...r.tags };
    if (tags.type === 'building') tags.building = tags.building || 'yes';
    const outer = assembleRings(r.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry));
    const inner = assembleRings(r.members.filter(m => m.type === 'way' && m.role === 'inner' && m.geometry));
    outer.forEach((ring, i) => {
      // Löcher dem passenden äußeren Ring zuordnen
      const holes = inner.filter(h => pointInRing(h[0], ring));
      ways.push({ id: r.id * 10 + i, tags, rings: [ring, ...holes] });
    });
  }
}
function assembleRings(members) {
  const segs = members.map(m => m.geometry.map(g => [r1(projX(g.lon)), r1(projZ(g.lat))]));
  const same = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let grown = true;
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const end = ring[ring.length - 1];
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
function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Kleiner deterministischer Zufall pro OSM-ID, damit die Welt bei jedem Umwandeln gleich aussieht.
function hash(id) {
  let x = (id * 2654435761) % 4294967296;
  x ^= x >>> 15; x = (x * 2246822519) % 4294967296; x ^= x >>> 13;
  return (x % 10000) / 10000;
}

function coordsOf(way, closed) {
  const pts = [];
  for (const id of way.nodes) {
    const p = nodes.get(id);
    if (!p) continue;
    const last = pts[pts.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    pts.push(p);
  }
  if (closed && pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  return pts;
}
const flat = pts => pts.flatMap(p => p);
const isClosed = w => !!w.rings || w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
// Ringe einer Fläche: [außen, ...Löcher]
const ringsOf = w => w.rings || [coordsOf(w, true)];
const holesOut = rings => rings.slice(1).filter(r => r.length >= 3).map(flat);

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [r1(x / pts.length), r1(z / pts.length)];
}

// ---------- Gebäude ----------
const DEFAULT_HEIGHT = {
  house: 7.5, detached: 7.5, semidetached_house: 7.5, terrace: 8, residential: 11, apartments: 13,
  garage: 2.8, garages: 2.8, carport: 2.6, shed: 2.6, roof: 4, hut: 3, kiosk: 3, service: 3.5,
  greenhouse: 3.5, church: 18, chapel: 9, cathedral: 25, castle: 15, college: 12, university: 14,
  school: 11, kindergarten: 5, train_station: 10, retail: 6, supermarket: 6, commercial: 10,
  office: 13, industrial: 8, warehouse: 8, public: 12, dormitory: 13, hotel: 15, yes: 9,
};
const GABLE_TYPES = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'yes', 'residential', 'apartments']);

function parseHeight(v) {
  if (!v) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const buildings = [];
for (const w of ways) {
  const t = w.tags;
  if (!t.building || !isClosed(w)) continue;
  if (t.building === 'no' || t.building === 'construction' && !t['building:levels']) continue;
  const rings = ringsOf(w);
  const pts = rings[0];
  if (pts.length < 3) continue;
  const area = Math.abs(polygonArea(pts));
  if (area < 4) continue;

  const type = t.building;
  let h = parseHeight(t.height);
  const levels = parseHeight(t['building:levels']);
  if (!h && levels) h = levels * 3.1 + (t['roof:levels'] ? parseHeight(t['roof:levels']) * 2.5 : 1.5);
  if (!h) {
    h = DEFAULT_HEIGHT[type] || 9;
    // große Gebäude ohne Angaben etwas höher, kleine Nebengebäude niedriger
    if (type === 'yes' && area < 40) h = 3.5;
    else if (type === 'yes' && area > 800) h = 13;
    h *= 0.88 + hash(w.id) * 0.26;
  }
  let roof = 0; // 0 = flach, 1 = Satteldach
  const shape = t['roof:shape'];
  if (shape === 'gabled' || shape === 'hipped' || shape === 'pitched') roof = 1;
  else if (!shape && GABLE_TYPES.has(type) && pts.length === 4 && area < 400 && h < 16) roof = 1;
  if (pts.length !== 4 || rings.length > 1) roof = 0; // Satteldach nur für Rechtecke

  const b = { t: type, h: r1(h), p: flat(pts) };
  if (rings.length > 1) b.ho = holesOut(rings);
  if (roof) b.r = 1;
  if (shape === 'flat') b.f = 1;
  if (t.name) b.n = t.name;
  if (t['building:colour']) b.c = t['building:colour'];
  if (t['roof:colour']) b.rc = t['roof:colour'];
  buildings.push(b);
}

// ---------- Straßen und Wege ----------
const ROAD = {
  motorway: [14, 'road'], trunk: [11, 'road'], trunk_link: [7, 'road'], primary: [10, 'road'],
  primary_link: [7, 'road'], secondary: [9, 'road'], secondary_link: [6.5, 'road'], tertiary: [8, 'road'],
  tertiary_link: [6, 'road'], unclassified: [6.5, 'road'], residential: [6.5, 'road'],
  living_street: [5.5, 'road'], service: [4, 'road'], pedestrian: [7, 'plaza'], track: [3, 'track'],
  footway: [2.2, 'foot'], path: [1.8, 'path'], cycleway: [2.2, 'foot'], steps: [2.2, 'steps'],
  bridleway: [2, 'path'], corridor: [0, null], platform: [3, 'foot'], construction: [6, 'road'],
};
const DRIVABLE = new Set(['motorway', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
  'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street']);

const roads = [];
for (const w of ways) {
  const t = w.tags;
  const def = ROAD[t.highway];
  if (!def || !def[1]) continue;
  if (t.tunnel === 'yes' || t.tunnel === 'building_passage' && def[1] !== 'road') continue;
  if (t.highway === 'pedestrian' && (t.area === 'yes' || w.rings) && isClosed(w)) {
    const rings = ringsOf(w);
    const r = { k: 'plazaArea', p: flat(rings[0]), n: t.name };
    if (rings.length > 1) r.ho = holesOut(rings);
    roads.push(r);
    continue;
  }
  if (!w.nodes) continue;
  const pts = coordsOf(w, false);
  if (pts.length < 2) continue;
  let width = parseHeight(t.width) || def[0];
  if (t.lanes && def[1] === 'road') width = Math.max(width, parseHeight(t.lanes) * 3.2);
  const r = { k: def[1], h: t.highway, w: r1(width), p: flat(pts) };
  if (t.name) r.n = t.name;
  if (t.oneway === 'yes') r.o = 1;
  if (t.bridge === 'yes') r.b = 1;
  roads.push(r);
}

// ---------- Flächen ----------
const AREA_KIND = {
  'landuse=forest': 'forest', 'natural=wood': 'forest', 'landuse=grass': 'grass', 'landuse=meadow': 'meadow',
  'landuse=village_green': 'grass', 'landuse=recreation_ground': 'grass', 'leisure=park': 'park',
  'leisure=garden': 'park', 'leisure=playground': 'playground', 'leisure=pitch': 'pitch',
  'leisure=track': 'trackSport', 'leisure=stadium': 'pitch', 'leisure=sports_centre': 'sport',
  'leisure=schoolyard': 'yard', 'landuse=allotments': 'allotments', 'landuse=farmland': 'farmland',
  'landuse=farmyard': 'farmland', 'landuse=industrial': 'industrial', 'landuse=railway': 'industrial',
  'landuse=commercial': 'commercial', 'landuse=retail': 'commercial', 'landuse=construction': 'construction',
  'landuse=brownfield': 'construction', 'landuse=residential': 'residential', 'landuse=religious': 'grass',
  'landuse=education': 'yard', 'landuse=cemetery': 'cemetery', 'natural=water': 'water',
  'leisure=swimming_pool': 'pool', 'leisure=water_park': 'sport', 'amenity=parking': 'parking',
  'landuse=greenhouse_horticulture': 'farmland', 'natural=scrub': 'meadow', 'natural=grassland': 'meadow',
};
const areas = [];
for (const w of ways) {
  const t = w.tags;
  if (!isClosed(w) || t.building) continue;
  let kind = null;
  for (const k of ['natural', 'leisure', 'landuse', 'amenity']) {
    if (t[k] && AREA_KIND[k + '=' + t[k]]) { kind = AREA_KIND[k + '=' + t[k]]; break; }
  }
  if (!kind) continue;
  const rings = ringsOf(w);
  if (rings[0].length < 3) continue;
  const a = { k: kind, p: flat(rings[0]) };
  if (rings.length > 1) a.ho = holesOut(rings);
  if (t.name) a.n = t.name;
  areas.push(a);
}

// ---------- Gewässer und Bahn ----------
const WATER_WIDTH = { river: 14, stream: 3, canal: 8, drain: 2, ditch: 1.5 };
const waterways = [];
const rails = [];
for (const w of ways) {
  const t = w.tags;
  if (!w.nodes) continue;
  if (t.waterway && WATER_WIDTH[t.waterway] && t.tunnel !== 'culvert' && t.tunnel !== 'yes') {
    const pts = coordsOf(w, false);
    if (pts.length >= 2) waterways.push({ w: parseHeight(t.width) || WATER_WIDTH[t.waterway], p: flat(pts), n: t.name });
  }
  if (t.railway === 'rail' && t.tunnel !== 'yes') {
    const pts = coordsOf(w, false);
    if (pts.length >= 2) rails.push(flat(pts));
  }
}

// ---------- Bäume und Orte ----------
const trees = [];
const pois = [];
for (const n of tagNodes) {
  const p = nodes.get(n.id);
  const t = n.tags;
  if (t.natural === 'tree') { trees.push(p[0], p[1]); continue; }
  if (t.name && (t.tourism || t.amenity)) pois.push({ n: t.name, k: t.tourism || t.amenity, x: p[0], z: p[1] });
}
// benannte Gebäude und Parks als zusätzliche Orte
for (const b of buildings) if (b.n) {
  const pts = []; for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]]);
  const [x, z] = centroid(pts);
  pois.push({ n: b.n, k: 'building', x, z });
}
for (const a of areas) if (a.n) {
  const pts = []; for (let i = 0; i < a.p.length; i += 2) pts.push([a.p[i], a.p[i + 1]]);
  const [x, z] = centroid(pts);
  pois.push({ n: a.n, k: a.k, x, z });
}

// ---------- Straßennetz für den Verkehr ----------
// Knoten: Enden von Straßen und Punkte, die mehrere Straßen teilen. Kanten: Polylinien dazwischen.
const drivableWays = ways.filter(w => w.nodes && DRIVABLE.has(w.tags.highway) && w.tags.tunnel !== 'yes' && w.tags.area !== 'yes');
const useCount = new Map();
for (const w of drivableWays) {
  w.nodes.forEach((id, i) => {
    const c = (useCount.get(id) || 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1);
    useCount.set(id, c);
  });
}
const graphIndex = new Map();
const graphNodes = [];
const nodeIndex = id => {
  if (!graphIndex.has(id)) { graphIndex.set(id, graphNodes.length / 2); graphNodes.push(...nodes.get(id)); }
  return graphIndex.get(id);
};
const edges = [];
for (const w of drivableWays) {
  const ids = w.nodes.filter(id => nodes.has(id));
  if (ids.length < 2) continue;
  let start = 0;
  for (let i = 1; i < ids.length; i++) {
    if (i === ids.length - 1 || useCount.get(ids[i]) > 1) {
      const seg = ids.slice(start, i + 1);
      const pts = [];
      for (const id of seg) pts.push(...nodes.get(id));
      const e = { a: nodeIndex(seg[0]), b: nodeIndex(seg[seg.length - 1]), p: pts, s: ROAD_SPEED(w.tags.highway) };
      if (w.tags.oneway === 'yes') e.o = 1;
      if (w.tags.oneway === '-1') { e.o = 1; [e.a, e.b] = [e.b, e.a]; e.p = reversePairs(pts); }
      if (w.tags.name) e.n = w.tags.name;
      edges.push(e);
      start = i;
    }
  }
}
function ROAD_SPEED(hw) {
  if (/trunk|primary/.test(hw)) return 14;
  if (/secondary|tertiary/.test(hw)) return 12;
  if (hw === 'living_street') return 5;
  return 9;
}
function reversePairs(pts) {
  const out = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
}

// ---------- Gelände ----------
let terrain = null;
const elevFile = path.join(RAW, 'elevation.json');
if (fs.existsSync(elevFile)) {
  const el = JSON.parse(fs.readFileSync(elevFile, 'utf8'));
  const { cols, rows } = el;
  const h = el.heights.slice();
  // Lücken mit Nachbarwerten füllen
  for (let pass = 0; pass < 10 && h.some(v => v == null); pass++) {
    for (let i = 0; i < h.length; i++) if (h[i] == null) {
      const r = Math.floor(i / cols), c = i % cols;
      const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([rr, cc]) => rr >= 0 && rr < rows && cc >= 0 && cc < cols)
        .map(([rr, cc]) => h[rr * cols + cc]).filter(v => v != null);
      if (nb.length) h[i] = nb.reduce((s, v) => s + v, 0) / nb.length;
    }
  }
  const minX = projX(el.west), maxX = projX(el.east);
  const minZ = projZ(el.north), maxZ = projZ(el.south);
  const stepX = (maxX - minX) / (cols - 1), stepZ = (maxZ - minZ) / (rows - 1);
  // Höhe am Nullpunkt (bilinear) als Bezug
  const fc = (0 - minX) / stepX, fr = (0 - minZ) / stepZ;
  const c0 = Math.floor(fc), r0 = Math.floor(fr), tx = fc - c0, tz = fr - r0;
  const at = (r, c) => h[r * cols + c] ?? 0;
  const base = at(r0, c0) * (1 - tx) * (1 - tz) + at(r0, c0 + 1) * tx * (1 - tz) +
    at(r0 + 1, c0) * (1 - tx) * tz + at(r0 + 1, c0 + 1) * tx * tz;
  terrain = {
    minX: r1(minX), minZ: r1(minZ), stepX: Math.round(stepX * 1000) / 1000, stepZ: Math.round(stepZ * 1000) / 1000,
    cols, rows, base: r1(base), h: h.map(v => r1((v ?? base) - base)),
  };
}

const world = {
  meta: {
    name: 'Coburg', origin: ORIGIN, bbox: BBOX,
    bounds: { minX: r1(projX(BBOX.west)), maxX: r1(projX(BBOX.east)), minZ: r1(projZ(BBOX.north)), maxZ: r1(projZ(BBOX.south)) },
    source: '© OpenStreetMap-Mitwirkende (ODbL)' + (terrain ? ', Höhen: EU-DEM über opentopodata.org' : ''),
    osmTimestamp: osm.osm3s && osm.osm3s.timestamp_osm_base,
  },
  terrain, buildings, roads, areas, waterways, rails, trees, pois,
  graph: { nodes: graphNodes, edges },
};

const js = '// Automatisch erzeugt von tools/convert.js – nicht von Hand bearbeiten.\n' +
  '// Kartendaten ' + world.meta.source + '\n' +
  'window.COBURG = ' + JSON.stringify(world) + ';\n';
fs.writeFileSync(OUT, js);
console.log(`Gebäude ${buildings.length}, Straßen/Wege ${roads.length}, Flächen ${areas.length}, Gewässer ${waterways.length}, ` +
  `Gleise ${rails.length}, Bäume ${trees.length / 2}, Orte ${pois.length}, Netz ${graphNodes.length / 2} Knoten / ${edges.length} Kanten, ` +
  `Gelände ${terrain ? terrain.cols + 'x' + terrain.rows : 'flach'}`);
console.log(`Geschrieben: data/coburg.js (${(js.length / 1024 / 1024).toFixed(2)} MB)`);
