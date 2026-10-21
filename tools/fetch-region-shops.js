// Lädt Läden und Lokale mit Namen im Umland (für Ladenschilder und begehbare Lokale in den Orten).
// Aufruf: node tools/fetch-region-shops.js
// Ergebnis: data/raw/region/shops.json (Overpass, Punkte und Mittelpunkte von Flächen)
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
  nwr["shop"]["name"](${B});
  nwr["amenity"~"^(restaurant|cafe|fast_food|pub|bar|ice_cream|biergarten|pharmacy|bank|fuel)$"]["name"](${B});
);out center tags;`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CoburgOpenWorld/1.0 (privates Spielprojekt)' },
        body: 'data=' + encodeURIComponent(QUERY) });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        fs.writeFileSync(path.join(__dirname, '..', 'data', 'raw', 'region', 'shops.json'), text);
        console.log(`Gespeichert: ${JSON.parse(text).elements.length} Läden und Lokale`);
        return;
      }
      console.log(`  ${url}: HTTP ${res.status}, neuer Versuch …`);
    } catch (e) { console.log(`  ${url}: ${e.message}, neuer Versuch …`); }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('Overpass-API nicht erreichbar');
})().catch(e => { console.error(e.message); process.exit(1); });
