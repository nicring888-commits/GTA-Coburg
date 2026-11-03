// Lädt Straßenknoten für Markierungen (seit v3.13.0, Grafik-Phase 9): Querungen (Zebrastreifen, Ampelübergänge),
// Ampeln, Stopp- und Vorfahrt-achten-Schilder, Mini-Kreisel im ganzen Landkreis samt Innenstadt.
// Aufruf: node tools/fetch-road-nodes.js
// Ergebnis: data/raw/region/road-nodes.json (Overpass, nur Punkte); weiter mit node tools/convert-road-nodes.js
const fs = require('fs');
const path = require('path');
const { BBOX } = require('./region-config');

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const B = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const QUERY = `[out:json][timeout:180];(
  node["highway"~"^(crossing|stop|give_way|traffic_signals|mini_roundabout)$"](${B});
);out;`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CoburgOpenWorld/1.0 (privates Spielprojekt)' },
        body: 'data=' + encodeURIComponent(QUERY) });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        fs.writeFileSync(path.join(__dirname, '..', 'data', 'raw', 'region', 'road-nodes.json'), text);
        console.log(`Gespeichert: ${JSON.parse(text).elements.length} Straßenknoten`);
        return;
      }
      console.log(`  ${url}: HTTP ${res.status}, neuer Versuch …`);
    } catch (e) { console.log(`  ${url}: ${e.message}, neuer Versuch …`); }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('Overpass-API nicht erreichbar');
})().catch(e => { console.error(e.message); process.exit(1); });
