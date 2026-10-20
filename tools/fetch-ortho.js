// Lädt Luftbilder (Digitale Orthophotos 40 cm, Bayerische Vermessungsverwaltung, CC BY 4.0)
// für die Spielwelt als Kacheln. Die Kacheln liegen genau auf Linien des Geländegitters, damit
// jede Kachel ein eigenes Geländestück mit eigener Textur bekommen kann.
// Aufruf (nach convert.js): node tools/fetch-ortho.js
// Ergebnis: data/ortho/r{zeile}_c{spalte}.jpg und data/ortho/tiles.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ORIGIN } = require('./config');

const WMS = 'https://geoservices.bayern.de/od/wms/dop/v1/dop40';
const LAYER = 'by_dop40c';
const TILE_PX = 1024;           // Pixel pro Kachel (Kante)
const TARGET_M = 620;           // ungefähre Kachelgröße in Metern (≈ 0,6 m pro Pixel)
const UPSAMPLE = 4;             // muss zu TERRAIN_UPSAMPLE in js/world.js passen

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'ortho');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'coburg.js'), 'utf8'), ctx);
const W = ctx.window.COBURG;
const T = W.terrain;
if (!T) throw new Error('Kein Gelände in data/coburg.js – erst fetch-elevation.js und convert.js ausführen');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const lonOf = x => ORIGIN.lon + x / mPerDegLon;
const latOf = z => ORIGIN.lat - z / mPerDegLat;

const cellsX = (T.cols - 1) * UPSAMPLE, cellsZ = (T.rows - 1) * UPSAMPLE;
const stepX = T.stepX / UPSAMPLE, stepZ = T.stepZ / UPSAMPLE;
const nX = Math.max(1, Math.round(cellsX * stepX / TARGET_M)), nZ = Math.max(1, Math.round(cellsZ * stepZ / TARGET_M));
const perX = Math.ceil(cellsX / nX), perZ = Math.ceil(cellsZ / nZ);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.ok && buf[0] === 0xff && buf[1] === 0xd8) return buf; // JPEG
      console.log(`  HTTP ${res.status}, neuer Versuch …`);
    } catch (e) { console.log('  ' + e.message + ', neuer Versuch …'); }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error('Luftbild-Dienst nicht erreichbar');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tiles = [];
  for (let r = 0; r < nZ; r++) for (let c = 0; c < nX; c++) {
    const c0 = c * perX, c1 = Math.min(cellsX, (c + 1) * perX);
    const r0 = r * perZ, r1 = Math.min(cellsZ, (r + 1) * perZ);
    if (c0 >= c1 || r0 >= r1) continue;
    const minX = T.minX + c0 * stepX, maxX = T.minX + c1 * stepX;
    const minZ = T.minZ + r0 * stepZ, maxZ = T.minZ + r1 * stepZ;
    // Seitenverhältnis der Kachel beibehalten
    const wM = maxX - minX, hM = maxZ - minZ;
    const px = wM >= hM ? [TILE_PX, Math.round(TILE_PX * hM / wM)] : [Math.round(TILE_PX * wM / hM), TILE_PX];
    const file = `r${r}_c${c}.jpg`;
    const bbox = [lonOf(minX), latOf(maxZ), lonOf(maxX), latOf(minZ)].map(v => v.toFixed(7)).join(',');
    const url = `${WMS}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${LAYER}&STYLES=&SRS=EPSG:4326` +
      `&BBOX=${bbox}&WIDTH=${px[0]}&HEIGHT=${px[1]}&FORMAT=image/jpeg`;
    const dest = path.join(OUT, file);
    if (!fs.existsSync(dest)) {
      process.stdout.write(`Kachel ${file} (${px[0]}×${px[1]}) … `);
      fs.writeFileSync(dest, await get(url));
      console.log('ok');
      await sleep(400);
    }
    tiles.push({ file, c0, c1, r0, r1, minX: +minX.toFixed(2), maxX: +maxX.toFixed(2), minZ: +minZ.toFixed(2), maxZ: +maxZ.toFixed(2) });
  }
  const meta = {
    upsample: UPSAMPLE, tiles,
    attribution: 'Luftbilder: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de (CC BY 4.0)',
  };
  fs.writeFileSync(path.join(OUT, 'tiles.js'),
    '// Automatisch erzeugt von tools/fetch-ortho.js\nwindow.COBURG_ORTHO = ' + JSON.stringify(meta) + ';\n');
  console.log(`Fertig: ${tiles.length} Kacheln (${nX}×${nZ}) in data/ortho/`);
})().catch(e => { console.error(e.message); process.exit(1); });
