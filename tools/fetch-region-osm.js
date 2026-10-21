// Lädt die OpenStreetMap-Daten für das Umland (Landkreis Coburg) über die Overpass-API.
// Der Ausschnitt wird in Teilstücke zerlegt, damit keine Abfrage zu groß wird; scheitert ein Stück mehrmals,
// wird es noch einmal geviertelt.
// Aufruf: node tools/fetch-region-osm.js
// Ergebnis: data/raw/region/osm_{zeile}_{spalte}[_{viertel}].json, rel_….json und boundary.json
const fs = require('fs');
const path = require('path');
const { BBOX, RELATIONS } = require('./region-config');

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const ROWS = 5, COLS = 6;
const OUT = path.join(__dirname, '..', 'data', 'raw', 'region');

const ROADS = 'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|pedestrian';
const wayQuery = B => `[out:json][timeout:180];(
  way["highway"~"^(${ROADS})$"](${B}); way["building"](${B});
  way["landuse"](${B}); way["natural"~"^(wood|water|scrub|grassland|heath|wetland)$"](${B});
  way["leisure"~"^(park|pitch|garden|golf_course|sports_centre|stadium|playground|swimming_pool|track)$"](${B});
  way["waterway"~"^(river|stream|canal)$"](${B}); way["railway"="rail"](${B}); way["amenity"="parking"](${B});
  node["place"~"^(city|town|village|hamlet|suburb|quarter|isolated_dwelling)$"](${B}); node["natural"="tree"](${B});
  node["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park)$"]["name"](${B});
  node["historic"~"^(castle|monument|memorial|ruins|church)$"]["name"](${B});
);out body;>;out skel qt;`;
const relQuery = B => `[out:json][timeout:240];(
  relation["type"="multipolygon"]["building"](${B}); relation["type"="multipolygon"]["landuse"](${B});
  relation["type"="multipolygon"]["natural"](${B}); relation["type"="multipolygon"]["leisure"](${B});
);out geom;`;
const boundaryQuery = `[out:json][timeout:240];(${RELATIONS.map(id => `relation(${id});`).join('')});out geom;`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function load(query, tries = 10) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CoburgOpenWorld/1.0 (privates Spielprojekt)' },
        body: 'data=' + encodeURIComponent(query),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{') && !/"remark":\s*"runtime error/.test(text)) return text;
      console.log(`  ${url}: HTTP ${res.status}, neuer Versuch …`);
    } catch (e) {
      console.log(`  ${url}: ${e.message}, neuer Versuch …`);
    }
    await sleep(4000 * (attempt + 1));
  }
  return null;
}

// Ein Stück laden; schlägt es fehl, in vier kleinere Stücke teilen (bis zu zweimal)
async function fetchBox(pre, name, box, query, depth = 0) {
  const dest = path.join(OUT, `${pre}_${name}.json`);
  if (fs.existsSync(dest)) return; // schon geladen (Abbruch und Neustart möglich)
  // schon geviertelt geladen? Dann gleich bei den Vierteln weitermachen
  const split = fs.readdirSync(OUT).some(f => f.startsWith(`${pre}_${name}_`));
  if (!split) {
    process.stdout.write(`Lade ${pre}_${name} … `);
    const text = await load(query(box), depth >= 2 ? 10 : 3);
    if (text) { fs.writeFileSync(dest, text); console.log(`${(text.length / 1024 / 1024).toFixed(1)} MB`); await sleep(1500); return; }
    if (depth >= 2) throw new Error('Overpass-API nicht erreichbar');
    console.log('zu groß oder Server belegt, teile in vier Stücke');
  }
  const [s, w, n, e] = box, ms = (s + n) / 2, mw = (w + e) / 2;
  const parts = [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]];
  for (let q = 0; q < 4; q++) await fetchBox(pre, `${name}_${q}`, parts[q], query, depth + 1);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(path.join(OUT, 'boundary.json'))) {
    const text = await load(boundaryQuery);
    if (!text) throw new Error('Overpass-API nicht erreichbar');
    fs.writeFileSync(path.join(OUT, 'boundary.json'), text);
  }
  const fmt = b => b.map(v => v.toFixed(5)).join(',');
  // REVERSE=1: von der anderen Ecke her laden (zweiter Ladevorgang parallel)
  const boxes = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) boxes.push([r, c]);
  if (process.env.REVERSE) boxes.reverse();
  for (const [r, c] of boxes) {
    const s = BBOX.south + (BBOX.north - BBOX.south) * r / ROWS, n = BBOX.south + (BBOX.north - BBOX.south) * (r + 1) / ROWS;
    const w = BBOX.west + (BBOX.east - BBOX.west) * c / COLS, e = BBOX.west + (BBOX.east - BBOX.west) * (c + 1) / COLS;
    await fetchBox('osm', `${r}_${c}`, [s, w, n, e], b => wayQuery(fmt(b)));
    await fetchBox('rel', `${r}_${c}`, [s, w, n, e], b => relQuery(fmt(b)));
  }
  console.log('Fertig. Danach: node tools/fetch-region-elevation.js und node tools/convert-region.js');
})().catch(e => { console.error(e.message); process.exit(1); });
