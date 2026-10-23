// Lädt ländliche Details für das Umland über die Overpass-API: Feld- und Waldwege (highway=track, Wege mit
// Belag), Hecken (barrier=hedge), Baumreihen (natural=tree_row) und Einzelbäume sind schon in osm_….json.
// Gleiche Teilstücke wie tools/fetch-region-osm.js; Geometrie direkt an den Wegen (out geom), also klein.
// Aufruf: node tools/fetch-region-rural.js   Ergebnis: data/raw/region/rural_{zeile}_{spalte}[_{viertel}].json
const fs = require('fs');
const path = require('path');
const { BBOX } = require('./region-config');

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const ROWS = 5, COLS = 6;
const OUT = path.join(__dirname, '..', 'data', 'raw', 'region');
const query = B => `[out:json][timeout:180];(
  way["highway"="track"](${B});
  way["highway"~"^(path|footway|bridleway|cycleway)$"]["surface"~"^(gravel|fine_gravel|compacted|dirt|ground|grass|unpaved|earth|asphalt)$"](${B});
  way["barrier"="hedge"](${B}); way["natural"="tree_row"](${B});
);out tags geom qt;`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function load(q, tries) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CoburgOpenWorld/1.0 (privates Spielprojekt)' },
        body: 'data=' + encodeURIComponent(q),
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
async function fetchBox(name, box, depth = 0) {
  const dest = path.join(OUT, `rural_${name}.json`);
  if (fs.existsSync(dest)) return;
  const split = fs.readdirSync(OUT).some(f => f.startsWith(`rural_${name}_`));
  if (!split) {
    process.stdout.write(`Lade rural_${name} … `);
    const text = await load(query(box.map(v => v.toFixed(5)).join(',')), depth >= 2 ? 10 : 3);
    if (text) { fs.writeFileSync(dest, text); console.log(`${(text.length / 1024 / 1024).toFixed(1)} MB`); await sleep(1500); return; }
    if (depth >= 2) throw new Error('Overpass-API nicht erreichbar');
    console.log('zu groß oder Server belegt, teile in vier Stücke');
  }
  const [s, w, n, e] = box, ms = (s + n) / 2, mw = (w + e) / 2;
  const parts = [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]];
  for (let q = 0; q < 4; q++) await fetchBox(`${name}_${q}`, parts[q], depth + 1);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // REVERSE=1: von der anderen Ecke her laden (zweiter Ladevorgang parallel)
  const boxes = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) boxes.push([r, c]);
  if (process.env.REVERSE) boxes.reverse();
  for (const [r, c] of boxes) {
    const s = BBOX.south + (BBOX.north - BBOX.south) * r / ROWS, n = BBOX.south + (BBOX.north - BBOX.south) * (r + 1) / ROWS;
    const w = BBOX.west + (BBOX.east - BBOX.west) * c / COLS, e = BBOX.west + (BBOX.east - BBOX.west) * (c + 1) / COLS;
    await fetchBox(`${r}_${c}`, [s, w, n, e]);
  }
  console.log('Fertig. Danach: node tools/convert-region-rural.js');
})().catch(e => { console.error(e.message); process.exit(1); });
