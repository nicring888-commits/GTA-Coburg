// Lädt die 3D-Gebäudemodelle LoD2 der Bayerischen Vermessungsverwaltung (Open Data, CC BY 4.0)
// als CityGML-Kacheln für den Kartenausschnitt BBOX aus tools/config.js.
// Aufruf: node tools/fetch-lod2.js
// Ergebnis: data/raw/lod2/{ost}_{nord}.gml (2 × 2 km, Name = linke untere Ecke in km, UTM 32N EPSG:25832)
//
// Quelle: https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=lod2
// Die Metalink-Datei für ganz Bayern liefert Adressen, Größen und SHA-256-Prüfsummen jeder Kachel.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BBOX } = require('./config');
const { toUTM } = require('./utm');

const METALINK = 'https://geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink/09.meta4';
const MIRRORS = ['https://download1.bayernwolke.de/a/lod2/citygml/', 'https://download2.bayernwolke.de/a/lod2/citygml/'];
const TILE_KM = 2;
const OUT = path.join(__dirname, '..', 'data', 'raw', 'lod2');

// Kacheln, die den Ausschnitt berühren (alle vier Ecken umrechnen, weil UTM gegenüber Länge/Breite leicht gedreht ist)
const corners = [[BBOX.south, BBOX.west], [BBOX.south, BBOX.east], [BBOX.north, BBOX.west], [BBOX.north, BBOX.east]]
  .map(([la, lo]) => toUTM(la, lo));
const km = v => Math.floor(v / 1000 / TILE_KM) * TILE_KM;
const e0 = km(Math.min(...corners.map(c => c.E))), e1 = km(Math.max(...corners.map(c => c.E)));
const n0 = km(Math.min(...corners.map(c => c.N))), n1 = km(Math.max(...corners.map(c => c.N)));
const wanted = [];
for (let e = e0; e <= e1; e += TILE_KM) for (let n = n0; n <= n1; n += TILE_KM) wanted.push(`${e}_${n}.gml`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = file => new Promise((res, rej) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const tmp = dest + '.part';
  const ws = fs.createWriteStream(tmp);
  let got = 0, shown = 0;
  for await (const chunk of res.body) {
    ws.write(chunk);
    got += chunk.length;
    if (got - shown > 10e6) { shown = got; process.stdout.write(` ${(got / 1e6).toFixed(0)} MB`); }
  }
  await new Promise(r => ws.end(r));
  fs.renameSync(tmp, dest);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Kacheln für den Ausschnitt: ${wanted.join(', ')}`);
  console.log('Lade Metalink (Prüfsummen) …');
  const meta = await (await fetch(METALINK)).text();
  const info = new Map();
  for (const m of meta.matchAll(/<file name="([^"]+)">[\s\S]*?<size>(\d+)<\/size>[\s\S]*?<hash type="sha-256">([0-9a-f]+)<\/hash>/g)) {
    info.set(m[1], { size: +m[2], hash: m[3] });
  }
  let total = 0;
  for (const name of wanted) {
    const inf = info.get(name);
    if (!inf) { console.log(`${name}: nicht im Bestand (keine Gebäude oder außerhalb Bayerns) – übersprungen`); continue; }
    const dest = path.join(OUT, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size === inf.size && await sha256(dest) === inf.hash) {
      console.log(`${name}: schon vorhanden`); total += inf.size; continue;
    }
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      const url = MIRRORS[attempt % MIRRORS.length] + name;
      process.stdout.write(`${name} (${(inf.size / 1e6).toFixed(1)} MB) von ${new URL(url).host} …`);
      try {
        await download(url, dest);
        if (await sha256(dest) !== inf.hash) throw new Error('Prüfsumme falsch');
        console.log(' ok'); ok = true; total += inf.size;
      } catch (e) {
        console.log(' ' + e.message + ', neuer Versuch …');
        await sleep(3000 * (attempt + 1));
      }
    }
    if (!ok) throw new Error(name + ' konnte nicht geladen werden');
  }
  console.log(`Fertig: ${(total / 1e6).toFixed(0)} MB in data/raw/lod2/. Weiter mit: node tools/convert.js`);
})().catch(e => { console.error(e.message); process.exit(1); });
