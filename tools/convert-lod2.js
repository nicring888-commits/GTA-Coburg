// Wandelt die LoD2-Gebäudemodelle (data/raw/lod2/*.gml, CityGML 1.0, ETRS89/UTM 32N + DHHN2016)
// in die Spielwelt um und schreibt data/lod2.js (window.COBURG_LOD2).
// Aufruf (nach convert.js, weil Geländebezug und OSM-Namen aus data/coburg.js kommen): node tools/convert-lod2.js
//
// Weltkoordinaten wie in convert.js: Meter, Nullpunkt Marktplatz, x = Osten, z = Süden.
// UTM -> Länge/Breite -> projX/projZ, damit die Häuser genau auf den OSM-Straßen und Luftbildern liegen.
// Höhen: Meter über NN minus terrain.base (Geländehöhe am Marktplatz).
//
// Format je Gebäude (kompakt, ganze Zahlen in Dezimetern relativ zum Gebäudeursprung):
//   o: [x, z]          Ursprung (Meter, eine Nachkommastelle)
//   g: Bodenhöhe       relativ zu terrain.base (Meter)
//   v: [dx, y, dz, …]  Eckpunkte in dm; y relativ zu g
//   f: [[i, …], …]     Grundriss (GroundSurface), -1 trennt Löcher ab
//   r: [[i, …], …]     Dachflächen, nach oben orientiert
//   w: [[i, …], …]     Wandflächen, nach außen orientiert
//   n, t, c            Name, Gebäudetyp und Fassadenfarbe aus OSM (falls zuzuordnen), sonst Name aus LoD2
//   k                  Gebäudefunktion nach ALKIS (z. B. 31001_1000 = Wohnhaus)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ORIGIN } = require('./config');
const { fromUTM } = require('./utm');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'lod2');
const OUT = path.join(ROOT, 'data', 'lod2.js');

const mPerDegLat = 110540;
const mPerDegLon = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const projX = lon => (lon - ORIGIN.lon) * mPerDegLon;
const projZ = lat => -(lat - ORIGIN.lat) * mPerDegLat;
const r1 = v => Math.round(v * 10) / 10;

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'coburg.js'), 'utf8'), ctx);
const W = ctx.window.COBURG;
if (!W.terrain) throw new Error('Kein Gelände in data/coburg.js – erst fetch-elevation.js und convert.js ausführen');
const BASE = W.terrain.base;
const B = W.meta.bounds;

if (!fs.existsSync(RAW)) throw new Error('data/raw/lod2 fehlt – erst node tools/fetch-lod2.js ausführen');
const files = fs.readdirSync(RAW).filter(f => /\.gml$/i.test(f)).sort();
if (!files.length) throw new Error('Keine .gml-Dateien in data/raw/lod2');

// ---------- OSM-Gebäude für Namen und Typen ----------
const osmGrid = new Map(), CELL = 50;
const cellKey = (i, j) => i * 100000 + j;
W.buildings.forEach((b, idx) => {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < b.p.length; i += 2) {
    minX = Math.min(minX, b.p[i]); maxX = Math.max(maxX, b.p[i]);
    minZ = Math.min(minZ, b.p[i + 1]); maxZ = Math.max(maxZ, b.p[i + 1]);
  }
  for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++)
    for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
      const k = cellKey(i, j);
      if (!osmGrid.has(k)) osmGrid.set(k, []);
      osmGrid.get(k).push(idx);
    }
});
function pointInFlat(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function osmAt(x, z) {
  const list = osmGrid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
  for (const idx of list) {
    const b = W.buildings[idx];
    if (pointInFlat(x, z, b.p) && !(b.ho && b.ho.some(h => pointInFlat(x, z, h)))) return b;
  }
  return null;
}

// ---------- Geometrie-Hilfen ----------
// Newell-Normale eines 3D-Rings [[x,y,z], …]
function newell(ring) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz);
  return l > 1e-9 ? [nx / l, ny / l, nz / l, l / 2] : null;
}
function ringArea2D(r) { // Weltkoordinaten x/z
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][2] - r[i][0] * r[j][2];
  return a / 2;
}
function pointInRing2D(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], zi = r[i][2], xj = r[j][0], zj = r[j][2];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// posList (UTM E N H) -> Ring in Weltkoordinaten [x, y, z]; doppelter Schlusspunkt entfällt
const projCache = new Map();
function parseRing(text) {
  const v = text.trim().split(/\s+/).map(Number);
  const ring = [];
  for (let i = 0; i + 2 < v.length; i += 3) {
    const key = v[i] + ',' + v[i + 1];
    let p = projCache.get(key);
    if (!p) {
      const ll = fromUTM(v[i], v[i + 1]);
      p = [projX(ll.lon), projZ(ll.lat)];
      projCache.set(key, p);
    }
    const q = [p[0], v[i + 2] - BASE, p[1]];
    const last = ring[ring.length - 1];
    if (last && Math.abs(last[0] - q[0]) < 0.02 && Math.abs(last[1] - q[1]) < 0.02 && Math.abs(last[2] - q[2]) < 0.02) continue;
    ring.push(q);
  }
  if (ring.length > 1) {
    const a = ring[0], b = ring[ring.length - 1];
    if (Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.02 && Math.abs(a[2] - b[2]) < 0.02) ring.pop();
  }
  return ring;
}
function parsePolygons(xml) {
  const polys = [];
  for (const m of xml.matchAll(/<gml:Polygon[\s\S]*?<\/gml:Polygon>/g)) {
    const rings = [];
    for (const r of m[0].matchAll(/<gml:(exterior|interior)>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) {
      const ring = parseRing(r[2]);
      if (ring.length >= 3) rings.push({ inner: r[1] === 'interior', ring });
      else if (r[1] === 'exterior') { rings.length = 0; break; }
    }
    if (rings.length && !rings[0].inner) polys.push(rings.map(r => r.ring));
  }
  return polys;
}
const attr = (xml, name) => {
  const m = xml.match(new RegExp(`<gen:stringAttribute name="${name}">\\s*<gen:value>([^<]*)<`));
  return m ? m[1] : null;
};

// ---------- Umwandeln ----------
const out = [];
const stats = { files: 0, buildings: 0, outside: 0, noGround: 0, roofs: 0, walls: 0, flippedWalls: 0, flippedRoofs: 0, named: 0, verts: 0 };
const seen = new Set();

for (const file of files) {
  const xml = fs.readFileSync(path.join(RAW, file), 'utf8');
  stats.files++;
  let pos = 0;
  for (;;) {
    const s = xml.indexOf('<bldg:Building ', pos);
    if (s < 0) break;
    const e = xml.indexOf('</bldg:Building>', s);
    if (e < 0) break;
    pos = e + 16;
    const chunk = xml.slice(s, e);
    const id = (chunk.match(/gml:id="([^"]+)"/) || [])[1];
    if (id && seen.has(id)) continue; // Gebäude an Kachelgrenzen nur einmal
    if (id) seen.add(id);
    stats.buildings++;
    // Bauteile (BuildingPart) gibt es in Bayern nicht; falls doch, werden ihre Flächen einfach mitgenommen.
    const surf = { GroundSurface: [], RoofSurface: [], WallSurface: [] };
    for (const m of chunk.matchAll(/<bldg:(GroundSurface|RoofSurface|WallSurface|ClosureSurface|OuterCeilingSurface|OuterFloorSurface)\b[\s\S]*?<\/bldg:\1>/g)) {
      const kind = m[1] === 'GroundSurface' || m[1] === 'OuterFloorSurface' ? 'GroundSurface'
        : m[1] === 'RoofSurface' || m[1] === 'OuterCeilingSurface' ? 'RoofSurface' : 'WallSurface';
      surf[kind].push(...parsePolygons(m[0]));
    }
    if (!surf.GroundSurface.length) { stats.noGround++; continue; }

    // Grundriss: alle Bodenflächen (meist genau eine)
    const ground = surf.GroundSurface;
    let cx = 0, cz = 0, cn = 0, gMin = Infinity, area = 0;
    for (const poly of ground) {
      for (const p of poly[0]) { cx += p[0]; cz += p[2]; cn++; gMin = Math.min(gMin, p[1]); }
      area += Math.abs(ringArea2D(poly[0]));
    }
    cx /= cn; cz /= cn;
    if (cx < B.minX || cx > B.maxX || cz < B.minZ || cz > B.maxZ) { stats.outside++; continue; }
    if (area < 2) continue;

    const inFoot = (x, z) => ground.some(poly => pointInRing2D(x, z, poly[0]) && !poly.slice(1).some(h => pointInRing2D(x, z, h)));
    // Wände nach außen drehen: Probepunkt vor der Wand darf nicht im Grundriss liegen
    const walls = [];
    for (const poly of surf.WallSurface) {
      const n = newell(poly[0]);
      if (!n || n[3] < 0.05) continue;
      const hl = Math.hypot(n[0], n[2]);
      if (hl > 0.3) {
        let mx = 0, mz = 0;
        for (const p of poly[0]) { mx += p[0]; mz += p[2]; }
        mx /= poly[0].length; mz /= poly[0].length;
        const ox = n[0] / hl, oz = n[2] / hl;
        const front = inFoot(mx + ox * 0.4, mz + oz * 0.4), back = inFoot(mx - ox * 0.4, mz - oz * 0.4);
        if (front && !back) { poly.forEach(r => r.reverse()); stats.flippedWalls++; }
      }
      walls.push(poly);
    }
    // Dächer zeigen nach oben
    const roofs = [];
    for (const poly of surf.RoofSurface) {
      const n = newell(poly[0]);
      if (!n || n[3] < 0.05) continue;
      if (n[1] < 0) { poly.forEach(r => r.reverse()); stats.flippedRoofs++; }
      roofs.push(poly);
    }
    if (!roofs.length) continue;

    // Eckpunkte zusammenfassen (Dezimeter relativ zum Ursprung)
    const ox = r1(cx), oz = r1(cz), g = Math.round(gMin * 100) / 100;
    const v = [], index = new Map();
    const vid = p => {
      const X = Math.round((p[0] - ox) * 10), Y = Math.round((p[1] - g) * 10), Z = Math.round((p[2] - oz) * 10);
      const key = X + ',' + Y + ',' + Z;
      let i = index.get(key);
      if (i === undefined) { i = v.length / 3; v.push(X, Y, Z); index.set(key, i); }
      return i;
    };
    const enc = poly => {
      const res = [];
      poly.forEach((ring, ri) => {
        if (ri) res.push(-1);
        let last = -2;
        for (const p of ring) { const i = vid(p); if (i !== last) res.push(i); last = i; }
        if (res.length > 1 && res[res.length - 1] === res[ri ? res.lastIndexOf(-1) + 1 : 0]) res.pop();
      });
      return res;
    };
    const rec = { o: [ox, oz], g, v, f: ground.map(enc), r: roofs.map(enc), w: walls.map(enc) };
    stats.roofs += roofs.length; stats.walls += walls.length; stats.verts += v.length / 3;

    const osm = osmAt(cx, cz) || (ground[0][0].length ? (() => {
      // Schwerpunkt außerhalb (z. B. L-Form): ersten Grundrisspunkt etwas nach innen probieren
      for (const p of ground[0][0]) { const b = osmAt(p[0] + (cx - p[0]) * 0.1, p[2] + (cz - p[2]) * 0.1); if (b) return b; }
      return null;
    })() : null);
    if (osm) { rec.t = osm.t; if (osm.n) rec.n = osm.n; if (osm.c) rec.c = osm.c; }
    if (!rec.n) { const nm = chunk.match(/<gml:name>([^<]+)<\/gml:name>/); if (nm) rec.n = nm[1].trim(); }
    if (rec.n) stats.named++;
    const fn = chunk.match(/<bldg:function>([^<]+)</);
    if (fn) rec.k = fn[1];
    out.push(rec);
  }
  console.log(`${file}: ${out.length} Gebäude bisher`);
}

const meta = {
  base: BASE,
  attribution: '3D-Gebäudemodelle LoD2: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de (CC BY 4.0)',
  files,
};
const js = '// Automatisch erzeugt von tools/convert-lod2.js – nicht von Hand bearbeiten.\n' +
  '// ' + meta.attribution + '\n' +
  'window.COBURG_LOD2 = ' + JSON.stringify({ meta, buildings: out }) + ';\n';
fs.writeFileSync(OUT, js);
console.log(`Gebäude im Ausschnitt ${out.length} (gelesen ${stats.buildings}, außerhalb ${stats.outside}, ohne Grundfläche ${stats.noGround}), ` +
  `Dachflächen ${stats.roofs}, Wandflächen ${stats.walls}, Eckpunkte ${stats.verts}, gedrehte Wände ${stats.flippedWalls}, gedrehte Dächer ${stats.flippedRoofs}, mit Namen ${stats.named}`);
console.log(`Geschrieben: data/lod2.js (${(js.length / 1024 / 1024).toFixed(2)} MB)`);
