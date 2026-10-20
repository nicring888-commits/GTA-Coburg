// Lädt ein Höhenraster für den Kartenausschnitt von opentopodata.org (EU-DEM 25 m).
// Aufruf: node tools/fetch-elevation.js
// Ergebnis: data/raw/elevation.json  { south, west, north, east, cols, rows, heights[] }
const fs = require('fs');
const path = require('path');
const { BBOX } = require('./config');

const STEP_M = 50;               // Rasterabstand in Metern
const PER_REQUEST = 100;         // Limit der öffentlichen API
const DATASET = 'eudem25m';

const lat0 = (BBOX.south + BBOX.north) / 2;
const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(lat0 * Math.PI / 180);
const cols = Math.ceil((BBOX.east - BBOX.west) * mPerDegLon / STEP_M) + 1;
const rows = Math.ceil((BBOX.north - BBOX.south) * mPerDegLat / STEP_M) + 1;

const points = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    points.push([
      BBOX.north - (BBOX.north - BBOX.south) * r / (rows - 1),
      BBOX.west + (BBOX.east - BBOX.west) * c / (cols - 1),
    ]);
  }
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function main() {
  console.log(`Raster ${cols} x ${rows} = ${points.length} Punkte, ${Math.ceil(points.length / PER_REQUEST)} Anfragen`);
  const heights = new Array(points.length).fill(null);
  for (let i = 0; i < points.length; i += PER_REQUEST) {
    const chunk = points.slice(i, i + PER_REQUEST);
    const locations = chunk.map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join('|');
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://api.opentopodata.org/v1/${DATASET}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
      });
      if (res.ok) {
        const json = await res.json();
        json.results.forEach((r, j) => { heights[i + j] = r.elevation; });
        break;
      }
      if (attempt >= 5) throw new Error('Höhenabfrage fehlgeschlagen: HTTP ' + res.status);
      await sleep(2000 * (attempt + 1));
    }
    process.stdout.write(`\r${Math.min(i + PER_REQUEST, points.length)} / ${points.length}`);
    await sleep(1100); // max. 1 Anfrage pro Sekunde
  }
  console.log();
  const out = { ...BBOX, cols, rows, heights: heights.map(h => h == null ? null : Math.round(h * 10) / 10) };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'raw', 'elevation.json'), JSON.stringify(out));
  console.log('Gespeichert: data/raw/elevation.json');
}

main().catch(e => { console.error(e); process.exit(1); });
