// Lädt die OpenStreetMap-Daten für den Kartenausschnitt über die Overpass-API.
// Aufruf: node tools/fetch-osm.js
// Ergebnis: data/raw/coburg.osm.json (Wege und Punkte) und data/raw/relations.osm.json (Multipolygone)
const fs = require('fs');
const path = require('path');
const { BBOX } = require('./config');

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const B = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;

const QUERIES = {
  'coburg.osm.json': `[out:json][timeout:120];(
    way["building"](${B}); way["highway"](${B}); way["natural"="water"](${B}); way["waterway"](${B});
    way["landuse"](${B}); way["leisure"](${B}); way["railway"="rail"](${B}); way["natural"="wood"](${B});
    node["natural"="tree"](${B}); node["amenity"]["name"](${B}); node["tourism"]["name"](${B});
  );out body;>;out skel qt;`,
  'relations.osm.json': `[out:json][timeout:120];(
    relation["type"="multipolygon"]["building"](${B}); relation["type"="building"](${B});
    relation["type"="multipolygon"]["landuse"](${B}); relation["type"="multipolygon"]["leisure"](${B});
    relation["type"="multipolygon"]["natural"](${B}); relation["type"="multipolygon"]["highway"="pedestrian"](${B});
  );out geom;`,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function load(query) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CoburgOpenWorld/1.0 (privates Spielprojekt)' },
        body: 'data=' + encodeURIComponent(query),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return text;
      console.log(`  ${url}: HTTP ${res.status}, neuer Versuch …`);
    } catch (e) {
      console.log(`  ${url}: ${e.message}, neuer Versuch …`);
    }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('Overpass-API nicht erreichbar');
}

(async () => {
  const dir = path.join(__dirname, '..', 'data', 'raw');
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, q] of Object.entries(QUERIES)) {
    console.log('Lade ' + file + ' …');
    const text = await load(q);
    fs.writeFileSync(path.join(dir, file), text);
    console.log(`  gespeichert (${(text.length / 1024 / 1024).toFixed(1)} MB)`);
  }
  console.log('Fertig. Danach: node tools/convert.js');
})().catch(e => { console.error(e.message); process.exit(1); });
