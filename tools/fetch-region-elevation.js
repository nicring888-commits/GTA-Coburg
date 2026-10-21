// Lädt das Höhenmodell für das Umland aus den freien Terrarium-Höhenkacheln (Mapzen/AWS Open Data,
// in Europa aus EU-DEM) und tastet es im Gitter der Innenstadt ab (gleiche Zellgröße, gleiche Gitterlinien).
// Aufruf (nach convert.js): node tools/fetch-region-elevation.js
// Ergebnis: data/raw/region/elevation.json  { c0, r0, cols, rows, h[] }  (Meter über NN, Zeile für Zeile)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { ORIGIN } = require('./config');
const { BBOX, TILE_CELLS } = require('./region-config');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'region');
const CACHE = path.join(RAW, 'terrarium');
const Z = 12;
const URL = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'coburg.js'), 'utf8'), ctx);
const T = ctx.window.COBURG.terrain;
if (!T) throw new Error('Kein Gelände in data/coburg.js – erst fetch-elevation.js und convert.js ausführen');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon;
const projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;
const lonOf = x => ORIGIN.lon + x / mPerDegLon;
const latOf = z => ORIGIN.lat - z / mPerDegLat;

// Gitter: Zellen des Kerngitters nach außen fortgesetzt, auf ganze Kacheln gerundet
const floorTo = (v, k) => Math.floor(v / k) * k, ceilTo = (v, k) => Math.ceil(v / k) * k;
const c0 = floorTo(Math.floor((projX(BBOX.west) - T.minX) / T.stepX), TILE_CELLS);
const c1 = ceilTo(Math.ceil((projX(BBOX.east) - T.minX) / T.stepX), TILE_CELLS);
const r0 = floorTo(Math.floor((projZ(BBOX.north) - T.minZ) / T.stepZ), TILE_CELLS);
const r1 = ceilTo(Math.ceil((projZ(BBOX.south) - T.minZ) / T.stepZ), TILE_CELLS);
const cols = c1 - c0 + 1, rows = r1 - r0 + 1;

// ---------- PNG lesen (8 Bit RGB/RGBA, ohne Zusatzbibliothek) ----------
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8) throw new Error('PNG: nur 8 Bit'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('PNG: Farbtyp ' + ct + ' nicht unterstützt');
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

// Kachelkoordinaten (Web-Mercator) eines Punkts, als Bruchzahl
const n = 2 ** Z;
const tileX = lon => (lon + 180) / 360 * n;
const tileY = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getTile(x, y) {
  const file = path.join(CACHE, `${Z}_${x}_${y}.png`);
  if (!fs.existsSync(file)) {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(URL(x, y));
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.ok && buf[1] === 0x50) { fs.writeFileSync(file, buf); break; }
        console.log(`  Kachel ${x}/${y}: HTTP ${res.status}`);
      } catch (e) { console.log(`  Kachel ${x}/${y}: ${e.message}`); }
      if (attempt >= 5) throw new Error('Höhenkacheln nicht erreichbar');
      await sleep(2000 * (attempt + 1));
    }
  }
  return decodePNG(fs.readFileSync(file));
}

(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  const minLon = lonOf(T.minX + c0 * T.stepX), maxLon = lonOf(T.minX + c1 * T.stepX);
  const maxLat = latOf(T.minZ + r0 * T.stepZ), minLat = latOf(T.minZ + r1 * T.stepZ);
  const tx0 = Math.floor(tileX(minLon)), tx1 = Math.floor(tileX(maxLon));
  const ty0 = Math.floor(tileY(maxLat)), ty1 = Math.floor(tileY(minLat));
  console.log(`Gitter ${cols} × ${rows} (${(cols * T.stepX / 1000).toFixed(1)} × ${(rows * T.stepZ / 1000).toFixed(1)} km), ` +
    `${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} Höhenkacheln (Zoom ${Z})`);
  const tiles = new Map();
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    tiles.set(x + ',' + y, await getTile(x, y));
    process.stdout.write('.');
  }
  console.log();
  const S = 256;
  const elev = (gx, gy) => { // gx, gy: Pixel im Gesamtmosaik
    const tx = Math.floor(gx / S), ty = Math.floor(gy / S), t = tiles.get(tx + ',' + ty);
    if (!t) return null;
    const i = ((gy - ty * S) * t.w + (gx - tx * S)) * t.bpp;
    return t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768;
  };
  const h = new Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = T.minX + (c0 + c) * T.stepX, z = T.minZ + (r0 + r) * T.stepZ;
    const fx = tileX(lonOf(x)) * S - 0.5, fy = tileY(latOf(z)) * S - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const v00 = elev(ix, iy), v10 = elev(ix + 1, iy), v01 = elev(ix, iy + 1), v11 = elev(ix + 1, iy + 1);
    h[r * cols + c] = v00 == null ? null : Math.round(((v00 * (1 - ax) + v10 * ax) * (1 - ay) + (v01 * (1 - ax) + v11 * ax) * ay) * 10) / 10;
  }
  fs.writeFileSync(path.join(RAW, 'elevation.json'), JSON.stringify({ c0, r0, cols, rows, h, source: 'Terrarium (Mapzen, AWS Open Data), Europa: EU-DEM' }));
  console.log('Gespeichert: data/raw/region/elevation.json');
})().catch(e => { console.error(e); process.exit(1); });
