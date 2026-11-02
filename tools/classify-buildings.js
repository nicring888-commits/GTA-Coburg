// Bautyp-Erkennung für die Häuser des Umlands (aufgerufen von tools/convert-region.js).
//
// Ordnet jedem OSM-Haus einen Bautyp zu und entscheidet, ob ein historisches Haus Fachwerk zeigt. Ein Dorf ist nicht
// automatisch historisch: Die Bauzeit wird aus der Lage im Ort (Abstand zum alten Kern um Kirche und Ortsmittelpunkt),
// der Siedlungsstruktur (gleich große, gleich ausgerichtete Häuser mit gleichem Abstand zur Straße = geplantes
// Baugebiet), der Lage an der Straße (alte Häuser stehen direkt an der Gasse, neue hinter dem Vorgarten), Hofstellen
// (Scheunen am Haus), Sackgassen und Spielstraßen, dem Grundriss und OSM-Angaben (Baujahr, Denkmal, Dachform,
// Geschosse, Baustoff, Flächennutzung) geschätzt. Fachwerk nur an historischen Häusern mit Beleg oder starken
// historischen Merkmalen, nie an Wohnhäusern der Nachkriegszeit oder Neubauten.
'use strict';

const ARCH = {
  UNBEKANNT: 0, HOF: 1, BUERGER: 2, SIEDLUNG: 3, EFH: 4, NEUBAU: 5, MFH: 6, GEWERBE: 7, INDUSTRIE: 8,
  AGRAR_ALT: 9, AGRAR_NEU: 10, NEBEN: 11, SONDER: 12,
};
const ARCH_NAMES = ['unbekannt', 'Historischer Kern (Dorf/Hof)', 'Historischer Kern (Kleinstadt)', 'Siedlung 1950er–70er',
  'Einfamilienhaus 1970er–90er', 'Neubau ab 2000', 'Mehrfamilienhaus', 'Gewerbe', 'Industrie', 'Landwirtschaft alt',
  'Landwirtschaft modern', 'Nebengebäude', 'Sonderbau'];

// Landkreis Coburg (17 Gemeinden) und die kreisfreie Stadt Coburg (Stadtteile außerhalb der Innenstadt)
const LANDKREIS = ['Ahorn', 'Bad Rodach', 'Dörfles-Esbach', 'Ebersdorf b.Coburg', 'Großheirath', 'Grub a.Forst', 'Itzgrund',
  'Lautertal', 'Meeder', 'Neustadt bei Coburg', 'Niederfüllbach', 'Rödental', 'Seßlach', 'Sonnefeld', 'Untersiemau',
  'Weidhausen b.Coburg', 'Weitramsdorf', 'Coburg'];

const NEBEN_T = new Set(['garage', 'garages', 'carport', 'shed', 'roof', 'hut', 'kiosk', 'service', 'transformer_tower', 'tech_cab',
  'allotment_house', 'greenhouse', 'bunker', 'toilets', 'container', 'cabin', 'bakehouse', 'gazebo', 'boathouse', 'pavilion']);
const SONDER_T = new Set(['church', 'chapel', 'cathedral', 'monastery', 'school', 'kindergarten', 'college', 'university', 'public',
  'government', 'fire_station', 'hospital', 'train_station', 'castle', 'palace', 'civic', 'townhall', 'museum', 'sports_centre',
  'sports_hall', 'stadium', 'presbytery', 'religious', 'ruins', 'tower', 'temple', 'mosque', 'grandstand']);
const AGRAR_T = new Set(['barn', 'farm_auxiliary', 'stable', 'cowshed', 'sty', 'silo', 'sheepfold', 'stall', 'slurry_tank']);
const IND_T = new Set(['industrial', 'warehouse', 'manufacture', 'hangar', 'factory', 'storage_tank']);
const GEW_T = new Set(['retail', 'supermarket', 'commercial', 'office', 'hotel']);
const MFH_T = new Set(['apartments', 'dormitory']);
const HOUSE_T = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'residential', 'bungalow', 'farm', 'farmhouse', 'yes']);
const ROADS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'pedestrian', 'road']);
const LOCAL = new Set(['residential', 'living_street', 'service', 'unclassified']);
const HALF_W = { motorway: 5.5, trunk: 5, primary: 4.2, secondary: 3.8, tertiary: 3.5, unclassified: 2.8, residential: 3,
  living_street: 2.5, service: 2, pedestrian: 2.5, road: 3 };
const LANDUSE = { residential: 'res', industrial: 'ind', commercial: 'com', retail: 'com', farmyard: 'farm', construction: 'new' };

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// Zufall je Haus aus der OSM-Kennung (ganzzahlig gerechnet, große Kennungen verlören sonst Stellen)
const hash = (id, k) => {
  let x = (Math.floor(id / 4294967296) * 374761393 + (id >>> 0)) >>> 0;
  x = Math.imul(x ^ Math.imul(k, 668265263), 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};
const yearOf = v => { const m = v && String(v).match(/(1[0-9]{3}|20[0-9]{2})/); return m ? +m[1] : null; };

class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); }
  key(i, j) { return i * 100003 + j; }
  add(x, z, v) { const k = this.key(Math.floor(x / this.c), Math.floor(z / this.c)); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(v); }
  addBox(x0, z0, x1, z1, v) {
    for (let i = Math.floor(x0 / this.c); i <= Math.floor(x1 / this.c); i++)
      for (let j = Math.floor(z0 / this.c); j <= Math.floor(z1 / this.c); j++) { const k = this.key(i, j); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(v); }
  }
  near(x, z, r, fn) {
    for (let i = Math.floor((x - r) / this.c); i <= Math.floor((x + r) / this.c); i++)
      for (let j = Math.floor((z - r) / this.c); j <= Math.floor((z + r) / this.c); j++) { const a = this.m.get(this.key(i, j)); if (a) for (const v of a) fn(v); }
  }
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
// Winkelabstand zweier Achsen, gefaltet auf 0…45° (parallel oder rechtwinklig = 0)
function axisDiff(a, b) { let d = Math.abs(a - b) % (Math.PI / 2); if (d > Math.PI / 4) d = Math.PI / 2 - d; return d * 180 / Math.PI; }
function quantile(arr, q) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

// list: [{ id, tags, ring: [[x, z]…], area, cx, cz, h }]; osm: { ways, nodes, tagNodes, rels, coordsOf, isClosed, assembleRings, pointInRing }
function classify(list, osm) {
  const { ways, nodes, tagNodes, rels, coordsOf, isClosed, assembleRings, pointInRing } = osm;

  // ---------- Merkmale je Haus ----------
  for (const b of list) {
    const t = b.tags, r = b.ring;
    let best = 0, ang = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l > best) { best = l; ang = Math.atan2(q[1] - p[1], q[0] - p[0]); }
    }
    const ux = Math.cos(ang), uz = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of r) { const u = x * ux + z * uz, v = -x * uz + z * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    b.ang = ang; b.L = u1 - u0; b.Wd = v1 - v0; b.aspect = b.L / Math.max(b.Wd, 0.5);
    b.rEq = Math.sqrt(b.area / Math.PI);
    b.type = t.building;
    b.year = yearOf(t.start_date || t['building:year'] || t.construction_date);
    b.levels = parseFloat(t['building:levels']) || null;
    b.roof = t['roof:shape'] || null;
    b.mat = t['building:material'] || t['building:facade:material'] || null;
    b.heritage = !!(t.heritage || t['ref:BLfD'] || t['heritage:operator'] || /^(yes|building|house|heritage|villa|manor)$/.test(t.historic || ''));
    b.minX = Math.min(...r.map(p => p[0])); b.maxX = Math.max(...r.map(p => p[0]));
    b.minZ = Math.min(...r.map(p => p[1])); b.maxZ = Math.max(...r.map(p => p[1]));
  }

  // ---------- Dachfarbe aus dem Luftbild (tools/roof-colors.ps1): je Luftbild auf dessen mittlere Dachhelligkeit
  // bezogen, weil Belichtung und Jahreszeit der Bilder schwanken. Anthrazit/Schwarz = typisch für Neubauten ab ≈ 2000,
  // rote bis braune Ziegel eher älter. Grün = Baum über dem Dach (keine Aussage).
  const lumByTile = new Map();
  for (const b of list) if (b.rc) {
    const [r, g, bl] = b.rc;
    b.lum = 0.299 * r + 0.587 * g + 0.114 * bl;
    b.chroma = Math.max(r, g, bl) - Math.min(r, g, bl);
    b.green = g > r + 4 && g > bl + 4;
    if (!b.green && b.area > 50) { let a = lumByTile.get(b.tk); if (!a) lumByTile.set(b.tk, a = []); a.push(b.lum); }
  }
  const medLum = new Map([...lumByTile].map(([k, a]) => [k, a.length >= 12 ? quantile(a, 0.5) : null]));
  for (const b of list) {
    b.roofDark = false; b.roofRed = false;
    if (!b.rc || b.green || !medLum.get(b.tk)) continue;
    const rel = b.lum / medLum.get(b.tk), [r, g, bl] = b.rc;
    b.roofDark = rel < 0.78 && b.chroma < 30;
    b.roofRed = r > g * 1.1 && r > bl * 1.22 && rel > 0.8;
  }

  // ---------- Flächennutzung (Wohngebiet, Gewerbe, Industrie, Hofstelle, Baustelle) ----------
  const luGrid = new Grid(200), luList = [];
  const addLu = (kind, ring) => {
    if (ring.length < 3) return;
    const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
    const o = { kind, ring, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    luList.push(o); luGrid.addBox(o.minX, o.minZ, o.maxX, o.maxZ, o);
  };
  for (const w of ways.values()) { const k = LANDUSE[w.tags.landuse]; if (k && !w.tags.building && isClosed(w)) addLu(k, coordsOf(w).slice(0, -1)); }
  for (const r of rels.values()) {
    const k = LANDUSE[r.tags.landuse];
    if (!k || !r.members) continue;
    for (const ring of assembleRings(r.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry))) addLu(k, ring);
  }
  const landuseAt = (x, z) => {
    let res = null;
    luGrid.near(x, z, 0, o => { if (!res && x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && pointInRing(x, z, o.ring)) res = o.kind; });
    return res;
  };

  // ---------- Straßen: Abschnitte, Knotengrad (Sackgassen), Spielstraßen ----------
  const segGrid = new Grid(40), wayInfo = [], deg = new Map();
  const roadWays = [...ways.values()].filter(w => w.nodes && ROADS.has(w.tags.highway) && w.tags.area !== 'yes');
  for (const w of roadWays) w.nodes.forEach((id, i) => deg.set(id, (deg.get(id) || 0) + (i === 0 || i === w.nodes.length - 1 ? 1 : 2)));
  for (const w of roadWays) {
    const hw = w.tags.highway.replace('_link', ''), ids = w.nodes.filter(id => nodes.has(id));
    if (ids.length < 2) continue;
    const pts = ids.map(id => nodes.get(id));
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const chord = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
    const dead = LOCAL.has(hw) && (deg.get(ids[0]) === 1 || deg.get(ids[ids.length - 1]) === 1);
    const wi = wayInfo.length;
    wayInfo.push({ hw, name: w.tags.name || null, len, curv: chord > 1 ? len / chord : 1, dead, living: hw === 'living_street' });
    const hwid = HALF_W[hw] || 2.5;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const s = { ax, az, bx, bz, hw: hwid, wi, ang: Math.atan2(bz - az, bx - ax) };
      segGrid.addBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), s);
    }
  }
  for (const b of list) {
    let best = Infinity, bs = null;
    segGrid.near(b.cx, b.cz, 60 + b.rEq, s => {
      let d = segDist(b.cx, b.cz, s.ax, s.az, s.bx, s.bz);
      if (d - b.rEq * 1.6 > best) return;
      for (const [x, z] of b.ring) d = Math.min(d, segDist(x, z, s.ax, s.az, s.bx, s.bz));
      d -= s.hw;
      if (d < best) { best = d; bs = s; }
    });
    b.setback = bs ? Math.max(0, best) : 99;
    b.road = bs;
    b.relAng = bs ? axisDiff(b.ang, bs.ang) : 45;
    b.street = (b.tags['addr:street'] || (bs && wayInfo[bs.wi].name) || (bs ? 'w' + bs.wi : 'b' + b.id));
  }

  // ---------- Grundkategorie aus Typ, Größe und Flächennutzung ----------
  const all = new Grid(60);
  for (const b of list) { b.lu = landuseAt(b.cx, b.cz); all.add(b.cx, b.cz, b); }
  for (const b of list) {
    const ty = b.type;
    if (b.year && b.year < 1300) b.year = null;
    if (NEBEN_T.has(ty)) b.cat = 'neben';
    else if (SONDER_T.has(ty)) b.cat = 'sonder';
    else if (AGRAR_T.has(ty)) b.cat = 'agrar';
    else if (IND_T.has(ty)) b.cat = 'ind';
    else if (GEW_T.has(ty)) b.cat = 'gew';
    else if (MFH_T.has(ty)) b.cat = 'mfh';
    else if (HOUSE_T.has(ty) || !ty) b.cat = 'wohn';
    else b.cat = b.area > 400 ? 'gew' : 'wohn';
    if (ty !== 'yes') continue;
    // Gebäude ohne Typ (≈ 85 %): nach Fläche, Nutzung und Nachbarschaft
    if (b.area < 38) { b.cat = 'neben'; continue; }
    if (b.lu === 'ind') { b.cat = b.area < 90 ? 'neben' : 'ind'; continue; }
    if (b.lu === 'com') { b.cat = b.area < 70 ? 'neben' : 'gew'; continue; }
    if (b.lu === 'farm' && b.area > 230) { b.cat = 'agrar'; continue; }
    if (b.area < 75) {
      // kleines Gebäude neben einem größeren Wohnhaus: Garage oder Schuppen
      let host = false;
      all.near(b.cx, b.cz, 30, o => { if (o !== b && o.area > b.area * 1.5 && o.area > 70 && Math.hypot(o.cx - b.cx, o.cz - b.cz) - o.rEq - b.rEq < 14) host = true; });
      if (host) { b.cat = 'neben'; continue; }
    }
    if (b.area > 700) b.cat = b.lu === 'res' ? 'mfh' : 'agrarOrGew';
  }

  // ---------- Siedlungen (zusammenhängende Bebauung) und alte Ortskerne ----------
  const main = list.filter(b => b.cat !== 'neben');
  const parent = new Map(main.map(b => [b, b]));
  const find = b => { let r = b; while (parent.get(r) !== r) r = parent.get(r); let c = b; while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; } return r; };
  const mg = new Grid(50);
  for (const b of main) mg.add(b.cx, b.cz, b);
  for (const b of main) mg.near(b.cx, b.cz, 50 + b.rEq, o => {
    if (o !== b && Math.hypot(o.cx - b.cx, o.cz - b.cz) - o.rEq - b.rEq < 45) { const ra = find(b), rb = find(o); if (ra !== rb) parent.set(ra, rb); }
  });
  const clusters = new Map();
  for (const b of main) { const r = find(b); let c = clusters.get(r); if (!c) clusters.set(r, c = { n: 0, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, sx: 0, sz: 0, list: [] }); c.n++; c.list.push(b); c.sx += b.cx; c.sz += b.cz; c.minX = Math.min(c.minX, b.cx); c.maxX = Math.max(c.maxX, b.cx); c.minZ = Math.min(c.minZ, b.cz); c.maxZ = Math.max(c.maxZ, b.cz); b.cl = c; }
  // Kernpunkte: Kirchen und Ortsmittelpunkte (Dorf, Stadt, Weiler, Stadtteil)
  const cores = [];
  for (const n of tagNodes.values()) {
    const t = n.tags, p = nodes.get(n.id);
    if (!p) continue;
    if (/^(village|town|hamlet|suburb|city)$/.test(t.place || '')) cores.push({ x: p[0], z: p[1], town: t.place === 'town' || t.place === 'city', place: t.place });
    else if (t.amenity === 'place_of_worship') cores.push({ x: p[0], z: p[1], church: true });
  }
  for (const b of list) if (/^(church|chapel|cathedral|monastery)$/.test(b.type) || b.tags.amenity === 'place_of_worship') cores.push({ x: b.cx, z: b.cz, church: true });
  const coreGrid = new Grid(400);
  cores.forEach(c => coreGrid.add(c.x, c.z, c));
  const towns = cores.filter(c => c.town);
  for (const c of clusters.values()) {
    c.cores = [];
    coreGrid.near((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, Math.max(c.maxX - c.minX, c.maxZ - c.minZ) / 2 + 120, k => {
      if (k.x > c.minX - 120 && k.x < c.maxX + 120 && k.z > c.minZ - 120 && k.z < c.maxZ + 120) c.cores.push(k);
    });
    if (!c.cores.length) c.cores.push({ x: c.sx / c.n, z: c.sz / c.n, fake: true });
  }
  for (const b of main) {
    let best = Infinity, bk = null;
    for (const k of b.cl.cores) { const d = Math.hypot(k.x - b.cx, k.z - b.cz); if (d < best) { best = d; bk = k; } }
    b.dCore = best; b.core = bk;
    // Kleinstadt-Kern: Ortsmittelpunkt einer Stadt (oder Kirche nahe dabei) und nicht weit davon entfernt
    let tw = Infinity;
    for (const k of towns) tw = Math.min(tw, Math.hypot(k.x - b.cx, k.z - b.cz));
    b.townCore = tw < 420;
  }
  // Ortsgröße je Kernpunkt: 85 % der Häuser liegen innerhalb von R
  const byCore = new Map();
  for (const b of main) { let a = byCore.get(b.core); if (!a) byCore.set(b.core, a = []); a.push(b.dCore); }
  const coreR = new Map();
  for (const [k, a] of byCore) coreR.set(k, Math.max(90, quantile(a, 0.85)));
  for (const b of main) b.r = b.dCore / coreR.get(b.core);

  // große Gebäude ohne Typ und ohne Hausnummer im Ort: meist Scheunen und Stallungen alter Hofstellen
  for (const b of main) if (b.cat === 'wohn' && b.type === 'yes' && b.area > 230 && !b.tags['addr:housenumber'] && (b.r < 0.8 || b.lu === 'farm')) b.cat = 'agrar';

  // ---------- Nachbarschaft: Gleichförmigkeit (Baugebiet) und Hofstellen ----------
  const wohn =main.filter(b => b.cat === 'wohn' || b.cat === 'mfh');
  const wg = new Grid(70);
  for (const b of wohn) wg.add(b.cx, b.cz, b);
  const farmish = main.filter(b => b.cat === 'agrar' || b.cat === 'agrarOrGew' || (b.type === 'yes' && b.area > 140 && b.aspect > 1.4 && b.lu === 'farm'));
  const fg = new Grid(40);
  for (const b of farmish) fg.add(b.cx, b.cz, b);
  for (const b of wohn) {
    const nb = [];
    let gap = Infinity;
    wg.near(b.cx, b.cz, 75, o => {
      const d = Math.hypot(o.cx - b.cx, o.cz - b.cz);
      if (o !== b) gap = Math.min(gap, d - o.rEq - b.rEq);
      if (d < 75 && o.area >= 45 && o.area <= 400) nb.push(o);
    });
    b.gap = Math.max(0, gap);
    let hof = 0;
    fg.near(b.cx, b.cz, 40, o => { if (o !== b && Math.hypot(o.cx - b.cx, o.cz - b.cz) - o.rEq - b.rEq < 12) hof++; });
    b.hof = hof > 0;
    b.nN = nb.length;
    if (nb.length >= 5) {
      const A = nb.map(o => o.area), m = A.reduce((s, v) => s + v, 0) / A.length;
      b.cvA = Math.sqrt(A.reduce((s, v) => s + (v - m) ** 2, 0) / A.length) / m;
      b.alignFrac = nb.filter(o => o.relAng < 11).length / nb.length;
      const sb = nb.map(o => Math.min(o.setback, 25)), sm = sb.reduce((s, v) => s + v, 0) / sb.length;
      b.sbMean = sm; b.sbStd = Math.sqrt(sb.reduce((s, v) => s + (v - sm) ** 2, 0) / sb.length);
      b.onStreetFrac = nb.filter(o => o.setback < 2).length / nb.length;
    } else { b.cvA = 0.6; b.alignFrac = 0.4; b.sbMean = b.setback; b.sbStd = 4; b.onStreetFrac = b.setback < 2 ? 1 : 0; }
  }
  for (const b of wohn) {
    let hofN = 0, n = 0;
    wg.near(b.cx, b.cz, 75, o => { if (Math.hypot(o.cx - b.cx, o.cz - b.cz) < 75) { n++; if (o.hof) hofN++; } });
    b.hofFrac = n ? hofN / n : 0;
  }

  // ---------- Bewertung: S = geplantes Baugebiet, O = historischer Bestand, E = Bauzeit innerhalb der Nachkriegszeit ----------
  for (const b of wohn) {
    const w = b.road ? wayInfo[b.road.wi] : null;
    const sCv = clamp01((0.62 - b.cvA) / 0.4);
    const sAl = clamp01((b.alignFrac - 0.3) / 0.5);
    const sSb = clamp01((b.sbMean - 1.5) / 2.5) * clamp01((12 - b.sbMean) / 4) * clamp01(1 - (b.sbStd - 1.5) / 4);
    const sOn = clamp01(1 - b.onStreetFrac * 1.6);
    const sHof = clamp01(1 - b.hofFrac * 2.2);
    let S = 0.24 * sCv + 0.22 * sAl + 0.2 * sSb + 0.17 * sOn + 0.17 * sHof;
    if (w && w.dead) S += 0.06;
    if (w && w.living) S += 0.12;
    if (b.lu === 'new') S += 0.2;
    b.S = clamp01(S);

    const prox = 1 - clamp01((b.r - 0.2) / 0.5);
    const near = clamp01((260 - b.dCore) / 200);
    const onSt = b.setback < 1.5 ? 1 : b.setback < 3.5 ? 0.55 : b.setback < 5 ? 0.2 : 0;
    const elong = b.aspect > 1.45 && b.area > 70 && b.area < 320 ? 1 : 0.35;
    const att = b.gap < 1 ? 1 : b.gap < 3 ? 0.5 : 0;
    let O = 0.22 * Math.max(prox, near * 0.9) + 0.2 * onSt + 0.16 * (b.hof ? 1 : b.hofFrac) + 0.08 * att + 0.06 * elong + 0.28 * (1 - b.S);
    if (b.core && b.core.fake) O -= 0.06;                        // Ort ohne Kirche/Ortsmittelpunkt: eher neu (Aussiedlung, Siedlung)
    if (/^(hipped|pyramidal|flat|skillion)$/.test(b.roof || '')) O -= 0.25;
    if (b.roof === 'mansard' || b.roof === 'gambrel') O += 0.1;
    if (b.levels && b.levels >= 4) O -= 0.15;
    if (w && w.living) O -= 0.15;
    if (b.roofDark) O -= 0.05;
    b.O = O;

    // Lage im Ort: Dörfer wachsen nach außen; in großen Siedlungskörpern (Stadtteile) sagt der Abstand wenig
    const big = b.cl.n > 700;
    const ring = clamp01((b.r - 0.15) / 0.85);
    // Hausform: schmal und lang = Siedlungshaus (1930er–60er, oft Doppel-/Reihenhaus), Winkel = 1970er–90er,
    // kompakter Würfel = Stadtvilla/Neubau
    let fp = 0.4;
    if (b.area < 100 && b.aspect > 1.45) fp = 0.0;
    else if (b.area < 95) fp = 0.2;
    else if (b.aspect > 1.9) fp = 0.15;                            // Zeilenbau
    else if (b.ring.length >= 6 && b.area > 115) fp = 0.5;          // L-Grundriss, Winkelbungalow
    else if (b.aspect < 1.3 && b.area >= 85 && b.area <= 175) fp = 0.8;
    const gE = clamp01((20 - b.gap) / 13);
    let E = (big ? 0.18 : 0.38) * ring + (big ? 0.5 : 0.32) * fp + 0.12 * gE + 0.08 * b.S + 0.1 * clamp01((b.sbMean - 3) / 5);
    if (/^(hipped|pyramidal|flat|skillion)$/.test(b.roof || '')) E += 0.25;
    if (b.roof === 'half-hipped') E -= 0.05;
    if (w && w.living) E += 0.22;
    if (w && w.dead && w.curv > 1.08) E += 0.06;
    if (b.lu === 'new') E += 0.4;
    // Dachfarbe nur als Zusatz: graue Faserzement-Dächer der Nachkriegszeit sehen im Luftbild ähnlich aus wie Anthrazit
    if (b.roofDark && fp >= 0.4) E += 0.1; else if (b.roofRed) E -= 0.05;
    b.E = E;
  }

  // Straßenzüge glätten: ein Baugebiet entsteht in einem Zug, also ähnliche Bauzeit je Straße (im selben Ort)
  const streets = new Map();
  for (const b of wohn) { const k = b.street + '|' + (b.core ? b.core.x.toFixed(0) : ''); let a = streets.get(k); if (!a) streets.set(k, a = []); a.push(b); }
  for (const a of streets.values()) {
    if (a.length < 4) continue;
    const mE = quantile(a.map(b => b.E), 0.5), mS = quantile(a.map(b => b.S), 0.5);
    for (const b of a) { b.E = 0.6 * mE + 0.4 * b.E; b.Sst = mS; }
  }

  // Schwellen: Anteile grob nach dem Wohnungsbestand im ländlichen Oberfranken (Zensus): ≈ 22 % vor 1949,
  // danach ≈ 47 % 1949–78, 32 % 1979–2000, 21 % ab 2001
  const houses = wohn.filter(b => b.cat === 'wohn' && !b.year && !b.heritage);
  const tO = quantile(houses.map(b => b.O), 0.78);
  const modernE = houses.filter(b => b.O < tO).map(b => b.E);
  const tE1 = quantile(modernE, 0.47), tE2 = quantile(modernE, 0.79);

  // ---------- Zuordnung ----------
  for (const b of list) {
    let a;
    switch (b.cat) {
      case 'neben': a = ARCH.NEBEN; break;
      case 'sonder': a = ARCH.SONDER; break;
      case 'ind': a = ARCH.INDUSTRIE; break;
      case 'gew': a = ARCH.GEWERBE; break;
      case 'agrar': case 'agrarOrGew': {
        const old = b.dCore !== undefined && b.r < 0.75 && b.area < 700 && (b.lu !== 'ind' && b.lu !== 'com');
        if (b.cat === 'agrarOrGew' && !old && (b.townCore || b.lu === 'res')) a = ARCH.GEWERBE;
        else a = old ? ARCH.AGRAR_ALT : ARCH.AGRAR_NEU;
        break;
      }
      default: a = null;
    }
    if (a !== null) { b.a = a; continue; }
    // Wohnen
    const hist = b.heritage || (b.year ? b.year < 1919 : b.O >= tO && (b.Sst === undefined || b.Sst < 0.62 || b.O > tO + 0.12));
    if (hist && !(b.year && b.year >= 1919)) {
      b.a = b.townCore && !b.hof ? ARCH.BUERGER : ARCH.HOF;
      continue;
    }
    if (b.cat === 'mfh' || b.area > 330 || (b.levels && b.levels >= 3) || (b.type === 'residential' && b.area > 240)) { b.a = ARCH.MFH; continue; }
    if (b.year) { b.a = b.year < 1979 ? ARCH.SIEDLUNG : b.year < 2001 ? ARCH.EFH : ARCH.NEUBAU; continue; }
    b.a = b.E < tE1 ? ARCH.SIEDLUNG : b.E < tE2 ? ARCH.EFH : ARCH.NEUBAU;
  }

  // ---------- Fachwerk: nur historische Häuser mit Beleg oder starken historischen Merkmalen ----------
  for (const b of list) {
    b.fw = 0;
    if (b.a !== ARCH.HOF && b.a !== ARCH.BUERGER) continue;
    const m = (b.mat || '').toLowerCase();
    if (m === 'timber_framing') { b.fw = 1; continue; }
    if (m && /plaster|stone|brick|concrete|sandstone|glass/.test(m)) continue;
    let p;
    if (b.heritage) p = b.a === ARCH.HOF ? 0.62 : 0.5;
    else if (b.year && b.year < 1919) p = 0.4;
    else p = b.O > tO + 0.12 ? 0.3 : 0.14;
    if (b.area > 330) p *= 0.4;
    b.fw = hash(b.id, 7) < p ? 1 : 0;
  }

  // ---------- Gemeinde (für die Statistik): Mehrheit der nächsten Adressen ----------
  const ag = new Grid(150);
  for (const b of list) if (b.tags['addr:city']) ag.add(b.cx, b.cz, b);
  for (const b of list) {
    const cand = [];
    ag.near(b.cx, b.cz, 450, o => { const d = Math.hypot(o.cx - b.cx, o.cz - b.cz); if (d < 450) cand.push([d, o.tags['addr:city']]); });
    cand.sort((p, q) => p[0] - q[0]);
    const votes = new Map();
    for (const [d, c] of cand.slice(0, 7)) votes.set(c, (votes.get(c) || 0) + 1 / (1 + d / 60));
    let best = null, bv = 0;
    for (const [c, v] of votes) if (v > bv) { bv = v; best = c; }
    b.gemeinde = best || '?';
  }

  // ---------- Bauzeit (für Balkone, Gauben, Garagen, Zäune): 0 historisch/unbekannt, 1 1950er–70er, 2 1970er–90er,
  // 3 ab 2000; Mehrfamilienhäuser und Nebengebäude bekommen sie aus der Bewertung bzw. vom Nachbarhaus
  const ERA = { [ARCH.SIEDLUNG]: 1, [ARCH.EFH]: 2, [ARCH.NEUBAU]: 3 };
  for (const b of list) {
    if (ERA[b.a]) b.era = ERA[b.a];
    else if (b.a === ARCH.MFH) b.era = b.year ? (b.year < 1949 ? 0 : b.year < 1979 ? 1 : b.year < 2001 ? 2 : 3)
      : b.E === undefined ? 1 : b.E < tE1 ? 1 : b.E < tE2 ? 2 : 3;
    else b.era = 0;
  }
  const eg = new Grid(40);
  for (const b of list) if (b.a >= ARCH.HOF && b.a <= ARCH.MFH) eg.add(b.cx, b.cz, b);
  for (const b of list) {
    if (b.a !== ARCH.NEBEN) continue;
    let best = Infinity, host = null;
    eg.near(b.cx, b.cz, 40, o => { const d = Math.hypot(o.cx - b.cx, o.cz - b.cz) - o.rEq; if (d < best) { best = d; host = o; } });
    if (host && best < 30) b.era = host.a <= ARCH.BUERGER ? 0 : host.era;
  }
  return { list, thresholds: { tO, tE1, tE2 } };
}

module.exports = { classify, ARCH, ARCH_NAMES, LANDKREIS };
