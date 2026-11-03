// Straßenknoten (tools/fetch-road-nodes.js) -> data/roadnodes.js (seit v3.13.0, Grafik-Phase 9)
// Aufruf: node tools/convert-road-nodes.js
// Ergebnis: window.COBURG_ROADNODES = { kinds: [...], n: [x·10, z·10, Art, ...] } in Spielmetern (Projektion wie convert.js).
// Arten: 0 Zebrastreifen, 1 Fußgängerfurt (Querung an Ampel oder mit unterbrochenen Linien), 2 Ampel, 3 Stopp,
// 4 Vorfahrt achten, 5 Mini-Kreisel. Unmarkierte Querungen und solche ohne Angabe entfallen. In Deutschland ist eine
// Querung "uncontrolled"/"marked" ohne Ampel ein Zebrastreifen, außer die Markierung sagt etwas anderes.
const fs = require('fs');
const path = require('path');
const { ORIGIN } = require('./config');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'region', 'road-nodes.json');
const OUT = path.join(ROOT, 'data', 'roadnodes.js');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon;
const projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;

const KINDS = ['zebra', 'furt', 'ampel', 'stopp', 'vorfahrt', 'minikreisel'];
function kindOf(t) {
  switch (t.highway) {
    case 'traffic_signals': return 2;
    case 'stop': return 3;
    case 'give_way': return 4;
    case 'mini_roundabout': return 5;
    case 'crossing': {
      const c = t.crossing, m = t['crossing:markings'];
      if (c === 'traffic_signals') return m === 'no' ? -1 : 1;
      if (t.crossing_ref === 'zebra' || c === 'zebra' || m === 'zebra') return 0;
      if (m === 'dashes' || m === 'lines') return 1;
      if ((c === 'uncontrolled' || c === 'marked') && m !== 'no' && m !== 'surface') return 0;
      return -1;
    }
  }
  return -1;
}

const els = JSON.parse(fs.readFileSync(RAW, 'utf8')).elements;
const n = [], count = KINDS.map(() => 0);
for (const e of els) {
  if (e.type !== 'node' || !e.tags || e.lat === undefined) continue;
  const k = kindOf(e.tags);
  if (k < 0) continue;
  n.push(Math.round(projX(e.lon) * 10), Math.round(projZ(e.lat) * 10), k);
  count[k]++;
}
fs.writeFileSync(OUT, '// Erzeugt von tools/convert-road-nodes.js aus OpenStreetMap (ODbL) – nicht von Hand ändern\n' +
  'window.COBURG_ROADNODES = ' + JSON.stringify({ kinds: KINDS, n }) + ';\n');
console.log(`${n.length / 3} Straßenknoten -> ${path.relative(ROOT, OUT)}`);
KINDS.forEach((k, i) => console.log(`  ${k}: ${count[i]}`));
