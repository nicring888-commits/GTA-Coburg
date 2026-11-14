// Lädt Bushaltestellen und Buslinien (seit v3.20.0, Update „Lebendige Stadt“, Phase U4) im ganzen Landkreis samt
// Innenstadt: Haltestellen (highway=bus_stop, Bussteige public_transport=platform/stop_position mit bus=yes),
// Busbahnhöfe (amenity=bus_station) und die Linien-Relationen route=bus (Reihenfolge der Halte).
// Aufruf: node tools/fetch-bus-stops.js
// Ergebnis: data/raw/region/bus-stops.json (Overpass); weiter mit node tools/convert-bus-stops.js
const fs = require('fs');
const path = require('path');
const { BBOX } = require('./region-config');

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const B = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const QUERY = `[out:json][timeout:240];(
  node["highway"="bus_stop"](${B});
  node["public_transport"="platform"]["bus"="yes"](${B});
  node["public_transport"="stop_position"]["bus"="yes"](${B});
  nwr["amenity"="bus_station"](${B});
);out center tags;
relation["route"="bus"](${B});
out body;`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CoburgOpenWorld/1.0 (privates Spielprojekt)' },
        body: 'data=' + encodeURIComponent(QUERY) });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        fs.writeFileSync(path.join(__dirname, '..', 'data', 'raw', 'region', 'bus-stops.json'), text);
        const els = JSON.parse(text).elements;
        console.log(`Gespeichert: ${els.filter(e => e.type !== 'relation').length} Haltepunkte, ${els.filter(e => e.type === 'relation').length} Linien`);
        return;
      }
      console.log(`  ${url}: HTTP ${res.status}, neuer Versuch …`);
    } catch (e) { console.log(`  ${url}: ${e.message}, neuer Versuch …`); }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('Overpass-API nicht erreichbar');
})().catch(e => { console.error(e.message); process.exit(1); });
