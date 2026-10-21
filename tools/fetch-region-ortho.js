// Lädt Luftbilder für jede Kachel des Umlands: Bayern (DOP 40, Bayerische Vermessungsverwaltung, CC BY 4.0) und
// für Thüringer Gebiet (Sonneberg, Hildburghausen) die Orthophotos der GDI-Th (CC BY 4.0, „© GDI-Th“).
// Aufruf (nach fetch-region-elevation.js): node tools/fetch-region-ortho.js
// Ergebnis: data/region/ortho/by{i}_{j}.jpg bzw. th{i}_{j}.jpg und data/region/ortho.js (welche Kachel welche Bilder hat)
const fs = require('fs');
const path = require('path');
const { ORTHO_PX } = require('./region-config');
const { RAW, ROOT, lonOf, latOf, loadCoreTerrain, computeTiles } = require('./region-tiles');

const SOURCES = {
  by: 'https://geoservices.bayern.de/od/wms/dop/v1/dop40?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=by_dop40c&STYLES=&SRS=EPSG:4326&FORMAT=image/jpeg',
  th: 'https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=th_dop&STYLES=&SRS=EPSG:4326&FORMAT=image/jpeg',
};
// Ein ganz weißes Bild (außerhalb des Landes) ist sehr klein; darunter gilt die Kachel als leer
const EMPTY_BYTES = 9000;
// Thüringen liegt nur im Norden und Nordwesten; südlich davon wird gar nicht erst gefragt
const TH_MIN_LAT = 50.22;
const OUT = path.join(ROOT, 'data', 'region', 'ortho');

const W = loadCoreTerrain();
const EL = JSON.parse(fs.readFileSync(path.join(RAW, 'elevation.json'), 'utf8'));
const TL = computeTiles(W.terrain, EL);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
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
  const manifestFile = path.join(ROOT, 'data', 'region', 'ortho.js');
  const flags = {};
  let n = 0, total = TL.state.filter(s => s).length, bytes = 0;
  for (let j = 0; j < TL.nj; j++) for (let i = 0; i < TL.ni; i++) {
    if (!TL.state[j * TL.ni + i]) continue;
    const ti = TL.i0 + i, tj = TL.j0 + j;
    const x0 = TL.tileX0(ti), x1 = TL.tileX0(ti + 1), z0 = TL.tileZ0(tj), z1 = TL.tileZ0(tj + 1);
    const bbox = [lonOf(x0), latOf(z1), lonOf(x1), latOf(z0)].map(v => v.toFixed(7)).join(',');
    const size = `&BBOX=${bbox}&WIDTH=${ORTHO_PX}&HEIGHT=${ORTHO_PX}`;
    let flag = 0;
    for (const src of ['by', 'th']) {
      if (src === 'th' && latOf(z1) < TH_MIN_LAT) continue;
      const dest = path.join(OUT, `${src}${ti}_${tj}.jpg`), none = dest + '.leer';
      if (fs.existsSync(none)) continue;
      if (!fs.existsSync(dest)) {
        const buf = await get(SOURCES[src] + size);
        if (buf.length < EMPTY_BYTES) { fs.writeFileSync(none, ''); continue; }
        fs.writeFileSync(dest, buf);
        await sleep(150);
      }
      bytes += fs.statSync(dest).size;
      flag |= src === 'by' ? 1 : 2;
    }
    if (flag) flags[ti + ',' + tj] = flag;
    if (++n % 25 === 0) process.stdout.write(`\r${n} / ${total} Kacheln, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }
  console.log(`\r${n} / ${total} Kacheln, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  const meta = {
    px: ORTHO_PX, tiles: flags, th: Object.values(flags).some(f => f & 2),
    attribution: 'Luftbilder: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de (CC BY 4.0); Thüringen: © GDI-Th (CC BY 4.0)',
  };
  fs.writeFileSync(manifestFile, '// Automatisch erzeugt von tools/fetch-region-ortho.js\nwindow.COBURG_REGION_ORTHO = ' + JSON.stringify(meta) + ';\n');
  console.log('Geschrieben: data/region/ortho.js');
})().catch(e => { console.error(e.message); process.exit(1); });
