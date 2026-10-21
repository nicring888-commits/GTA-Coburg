// Lädt schärfere Luftbilder (1024 × 1024 px je Kachel ≈ 1 m pro Pixel) für die Ortskacheln des Umlands.
// Das Spiel nimmt sie für die Kacheln direkt um den Spieler, weiter weg bleibt es bei den 512er-Bildern.
// Aufruf (nach convert-region.js): node tools/fetch-region-ortho-hd.js [px]
// Ergebnis: data/region/ortho/hd{i}_{j}.jpg und data/region/ortho-hd.js
//
// Höflich laden: eine Anfrage alle 1,5 s. Meldet der Dienst eine Sperre (HTML statt Bild), bricht das Skript ab;
// ein späterer Aufruf macht dort weiter, wo es aufgehört hat.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { lonOf, latOf, ROOT } = require('./region-tiles');

const PX = +(process.argv[2] || 1024);
const MIN_BUILDINGS = 12;   // wie REGION.townBuildings in js/region.js
const SOURCES = {
  by: 'https://geoservices.bayern.de/od/wms/dop/v1/dop40?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=by_dop40c&STYLES=&SRS=EPSG:4326&FORMAT=image/jpeg',
  th: 'https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=th_dop&STYLES=&SRS=EPSG:4326&FORMAT=image/jpeg',
};
const OUT = path.join(ROOT, 'data', 'region', 'ortho');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'region.js'), 'utf8'), ctx);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'region', 'ortho.js'), 'utf8'), ctx);
const R = ctx.window.COBURG_REGION, LO = ctx.window.COBURG_REGION_ORTHO;
const G = R.grid, TC = R.meta.tileCells, tw = TC * G.stepX, th = TC * G.stepZ;

(async () => {
  const keys = Object.keys(R.data).filter(k => (R.data[k].b || []).length >= MIN_BUILDINGS && LO.tiles[k] && LO.tiles[k] !== 3);
  console.log(`${keys.length} Ortskacheln, ${PX} px`);
  const done = {};
  let n = 0, bytes = 0;
  const blocked = {};
  for (const k of keys) {
    const [ti, tj] = k.split(',').map(Number), src = LO.tiles[k] === 2 ? 'th' : 'by';
    const dest = path.join(OUT, `hd${ti}_${tj}.jpg`);
    if (!fs.existsSync(dest)) {
      if (blocked[src]) continue;
      const x0 = G.minX + ti * tw, x1 = x0 + tw, z0 = G.minZ + tj * th, z1 = z0 + th;
      const bbox = [lonOf(x0), latOf(z1), lonOf(x1), latOf(z0)].map(v => v.toFixed(7)).join(',');
      const res = await fetch(SOURCES[src] + `&BBOX=${bbox}&WIDTH=${PX}&HEIGHT=${PX}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!(buf[0] === 0xff && buf[1] === 0xd8)) {
        console.log(`\nLuftbild-Dienst ${src} liefert kein Bild (HTTP ${res.status}, ${buf.length} Bytes) – vermutlich gesperrt. Später erneut starten.`);
        blocked[src] = true;
        continue;
      }
      fs.writeFileSync(dest, buf);
      await sleep(1500);
    }
    done[k] = 1; bytes += fs.statSync(dest).size;
    if (++n % 10 === 0) process.stdout.write(`\r${n} / ${keys.length}, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'region', 'ortho-hd.js'),
    '// Automatisch erzeugt von tools/fetch-region-ortho-hd.js\nwindow.COBURG_REGION_ORTHO_HD = ' + JSON.stringify({ px: PX, tiles: done }) + ';\n');
  console.log(`\nGeschrieben: data/region/ortho-hd.js (${Object.keys(done).length} Kacheln)`);
})().catch(e => { console.error(e.message); process.exit(1); });
