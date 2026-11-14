// Bushaltestellen und Buslinien (tools/fetch-bus-stops.js) -> data/busstops.js (seit v3.20.0, Phase U4)
// Aufruf: node tools/convert-bus-stops.js
// Ergebnis: window.COBURG_BUSSTOPS = {
//   names: [Name, …],
//   stops: [x·10, z·10, Name-Index, Merkmale, …]   Merkmale: 1 Wartehäuschen (shelter=yes), 2 Bank, 4 Busbahnhof/Bussteig
//   lines: [{ r: Liniennummer, n: Name, s: [Halt-Indizes in Fahrtreihenfolge] }]
// } in Spielmetern (Projektion wie convert.js). Mehrere OSM-Punkte einer Haltestelle (Mast, Bussteig, Halteposition)
// werden je Straßenseite zusammengefasst: gleicher Name und näher als 18 m → ein Halt (Mast bevorzugt).
const fs = require('fs');
const path = require('path');
const { ORIGIN } = require('./config');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'region', 'bus-stops.json');
const OUT = path.join(ROOT, 'data', 'busstops.js');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon;
const projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;

const els = JSON.parse(fs.readFileSync(RAW, 'utf8')).elements;
const pts = [], byId = new Map();
for (const e of els) {
  if (e.type === 'relation') continue;
  const lat = e.lat !== undefined ? e.lat : e.center && e.center.lat, lon = e.lon !== undefined ? e.lon : e.center && e.center.lon;
  if (lat === undefined) continue;
  const t = e.tags || {};
  const station = t.amenity === 'bus_station';
  const rank = t.highway === 'bus_stop' ? 0 : t.public_transport === 'platform' ? 1 : station ? 3 : 2;   // Mast vor Bussteig vor Halteposition
  const p = { id: e.type[0] + e.id, x: projX(lon), z: projZ(lat), name: (t.name || '').trim(), rank, station,
    shelter: t.shelter === 'yes', bench: t.bench === 'yes', pos: t.public_transport === 'stop_position' };
  pts.push(p); byId.set(p.id, p);
}
// zusammenfassen: Halteposition (auf der Fahrbahn) und Mast/Bussteig gleichen Namens bis 18 m
pts.sort((a, b) => a.rank - b.rank);
const stops = [];
for (const p of pts) {
  if (p.station) { p.stop = null; continue; }
  const s = stops.find(q => q.name === p.name && Math.hypot(q.x - p.x, q.z - p.z) < 18);
  if (s) { s.shelter = s.shelter || p.shelter; s.bench = s.bench || p.bench; p.stop = s; continue; }
  const q = { x: p.x, z: p.z, name: p.name, shelter: p.shelter, bench: p.bench, station: false };
  stops.push(q); p.stop = q;
}
// Busbahnhöfe: Halte in ihrer Nähe markieren
for (const p of pts) if (p.station) for (const s of stops) if (Math.hypot(s.x - p.x, s.z - p.z) < 80) s.station = true;

const names = [], nameIdx = new Map();
const ni = n => { if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); } return nameIdx.get(n); };
const flat = [];
stops.forEach((s, i) => { s.i = i; flat.push(Math.round(s.x * 10), Math.round(s.z * 10), ni(s.name), (s.shelter ? 1 : 0) | (s.bench ? 2 : 0) | (s.station ? 4 : 0)); });

// Linien: Halte in der Reihenfolge der Relation (Rollen platform*/stop*), ohne direkte Wiederholungen
const lines = [];
for (const r of els) {
  if (r.type !== 'relation') continue;
  const t = r.tags || {}, seq = [];
  for (const m of r.members || []) {
    if (!/^(platform|stop)/.test(m.role || '')) continue;
    const p = byId.get(m.type[0] + m.ref);
    if (!p || !p.stop) continue;
    if (seq[seq.length - 1] !== p.stop.i) seq.push(p.stop.i);
  }
  if (seq.length >= 3) lines.push({ r: (t.ref || '').trim(), n: (t.name || '').trim(), s: seq });
}
const out = { names, stops: flat, lines };
fs.writeFileSync(OUT, '// Erzeugt von tools/convert-bus-stops.js (OSM, ODbL)\nwindow.COBURG_BUSSTOPS = ' + JSON.stringify(out) + ';\n');
console.log(`${stops.length} Halte (${stops.filter(s => s.shelter).length} mit Häuschen, ${stops.filter(s => s.station).length} am Busbahnhof), ${lines.length} Linien → ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
