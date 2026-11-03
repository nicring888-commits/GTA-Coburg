// Fassaden-Merkmale der Innenstadt (seit v3.8.0, Grafik-Fahrplan Phase 4): ordnet jedem LoD2-Haus aus data/lod2.js
// das OSM-Gebäude zu, in dem sein Grundriss-Mittelpunkt liegt, und übernimmt Denkmal-Kennung, Baustoff und Geschosse.
// Das Spiel wählt danach Fenster, Gewände, Läden, Gesimse und Gauben (js/world.js, CITY_KIT).
// Aufruf (nach convert.js und convert-lod2.js): node tools/convert-facades.js
// Ergebnis: data/facades.js (window.COBURG_FACADES): b[i] je LoD2-Haus i =
//   Bit 0 Denkmal (heritage / historic), Bits 1–3 Baustoff (1 Ziegel/Klinker, 2 Putz, 3 Sandstein/Stein, 4 Glas,
//   5 Fachwerk), Bits 4–7 Geschosse (0 = unbekannt, höchstens 15)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ORIGIN } = require('./config');

const ROOT = path.join(__dirname, '..');
const mPerDegLat = 110540, mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon, projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'lod2.js'), 'utf8'), ctx);
const L = ctx.window.COBURG_LOD2;
if (!L) throw new Error('data/lod2.js fehlt – erst node tools/convert-lod2.js');

const osm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', 'coburg.osm.json'), 'utf8'));
const nodes = new Map();
for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, [projX(e.lon), projZ(e.lat)]);
const MAT = { brick: 1, plaster: 2, stone: 3, sandstone: 3, glass: 4, timber_framing: 5 };
const polys = [];
const grid = new Map(), CELL = 50, key = (i, j) => i + ',' + j;
for (const e of osm.elements) {
  if (e.type !== 'way' || !e.tags || !e.tags.building || !e.nodes) continue;
  const ring = e.nodes.map(id => nodes.get(id)).filter(Boolean);
  if (ring.length < 4) continue;
  const t = e.tags;
  const lv = Math.min(15, Math.round(parseFloat(t['building:levels']) || 0));
  const flags = (t.heritage || t.historic ? 1 : 0) | ((MAT[t['building:material']] || 0) << 1) | (lv << 4);
  if (!flags) continue;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const idx = polys.push({ ring, flags }) - 1;
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    if (!grid.has(key(i, j))) grid.set(key(i, j), []);
    grid.get(key(i, j)).push(idx);
  }
}
const inside = (x, z, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

const out = [];
let hits = 0, her = 0;
for (const b of L.buildings) {
  // Mittelpunkt der Bodenpunkte (Höhe 0) des Hauses
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < b.v.length; i += 3) if (b.v[i + 1] <= 0.5) { sx += b.o[0] + b.v[i] / 10; sz += b.o[1] + b.v[i + 2] / 10; n++; }
  if (!n) { out.push(0); continue; }
  const x = sx / n, z = sz / n;
  let f = 0;
  for (const idx of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []) if (inside(x, z, polys[idx].ring)) { f = polys[idx].flags; break; }
  if (f) hits++;
  if (f & 1) her++;
  out.push(f);
}
const js = '// Automatisch erzeugt von tools/convert-facades.js – nicht von Hand bearbeiten.\n' +
  '// Grundlage: OpenStreetMap-Mitwirkende (ODbL), 3D-Gebäudemodelle LoD2 Bayern (CC BY 4.0)\n' +
  'window.COBURG_FACADES = ' + JSON.stringify({ v: 1, n: L.buildings.length, b: out }) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data', 'facades.js'), js);
console.log(`LoD2-Häuser ${L.buildings.length}, mit OSM-Merkmalen ${hits}, Denkmäler ${her}; data/facades.js ${(js.length / 1024).toFixed(0)} KB`);
