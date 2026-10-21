// Macht aus der Ladenliste der Recherche (recherche/pois-coburg.json) die Spieldatei data/shops.js.
// Aufruf: node tools/convert-shops.js
// Geschlossene oder nicht mehr auffindbare Läden fallen weg. Eintrag: [Name, Art, x, z, geprüft]
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'recherche', 'pois-coburg.json');
const out = path.join(__dirname, '..', 'data', 'shops.js');
const { meta, pois } = JSON.parse(fs.readFileSync(src, 'utf8'));

const shops = [];
for (const p of pois) {
  if (p.status === 'dauerhaft_geschlossen' || p.status === 'nicht_gefunden') continue;
  const name = (p.google_name && p.status === 'bestaetigt' && p.google_name.length <= 26 ? p.google_name : p.name).trim();
  if (!name) continue;
  shops.push([name, p.kind, p.x, p.z, p.status === 'bestaetigt' ? 1 : 0]);
}
const js = `// Erzeugt von tools/convert-shops.js aus recherche/pois-coburg.json (Stand ${meta.stand}).\n` +
  `// Quellen: OpenStreetMap-Mitwirkende (ODbL), Abgleich mit Google Maps. Eintrag: [Name, Art, x, z, geprüft]\n` +
  `window.COBURG_SHOPS = ${JSON.stringify(shops)};\n`;
fs.writeFileSync(out, js);
console.log(`${shops.length} Läden → data/shops.js`);
