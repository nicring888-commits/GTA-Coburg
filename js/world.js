// Baut die Spielwelt aus den OSM-Daten: Gelände, Bodentextur, Gebäude, Straßen, Bäume
// sowie Kollisions- und Suchstrukturen.
'use strict';

const CHUNK = 250;              // Kachelgröße für Sichtbarkeitsprüfung (m)
const TERRAIN_UPSAMPLE = 4;     // feineres Gelände als das 50-m-Raster
const GROUND_PX = 1;            // Bodentextur: Pixel pro Meter
const ORTHO_TINT = '#c4c4c4';   // Farbabgleich der Luftbilder mit der Szenenbeleuchtung (Foto enthält schon Licht)
// Mit Luftbild zeigt das Foto Gehwege, Pfade und Plätze schon echt, dann werden nur Fahrbahnen modelliert
const PHOTO_HIDE = new Set(['foot', 'path', 'track', 'plaza', 'steps']);
const PAVE_TILE = 2;   // Meter je Kachel der Pflastertextur (Steine etwa 10 cm)

const AREA_STYLE = {
  // Reihenfolge = Zeichenreihenfolge (unten zuerst)
  residential: '#8e9d6c', commercial: '#a8a290', industrial: '#a29c8b', construction: '#a99b7b',
  farmland: '#b2ab68', meadow: '#8eaa5c', allotments: '#88a15d', grass: '#7ead54', park: '#6e9f4b',
  cemetery: '#6c9150', forest: '#4b6f35', yard: '#b1a996', sport: '#8ea679', pitch: '#5e9c44',
  trackSport: '#b2634a', playground: '#c8b88c', parking: '#8c8b87', pool: '#5db1d4', water: '#4a7ea6',
};
const MAP_STYLE = {
  residential: '#e6e1d6', commercial: '#e9dfd7', industrial: '#e0dbe3', construction: '#d9d3bf',
  farmland: '#eef0d5', meadow: '#cdebb0', allotments: '#c9e1bf', grass: '#c8e8a8', park: '#b9e3a0',
  cemetery: '#aacbaf', forest: '#9cc68b', yard: '#efe9dc', sport: '#bfe8cf', pitch: '#a9dfb9',
  trackSport: '#d9a48b', playground: '#d4f0d8', parking: '#d6d6d6', pool: '#9fd3ef', water: '#9fc8e6',
};
const ROAD_STYLE = {
  road: { color: '#3d4045', y: 0.10 },
  plaza: { color: '#8e8d89', y: 0.07 },           // Granit-Kleinpflaster der Fußgängerzone
  foot: { color: '#a99d89', y: 0.06 },
  path: { color: '#9b8b69', y: 0.05 },
  track: { color: '#8c7c5b', y: 0.05 },
  steps: { color: '#9a958c', y: 0.07 },
};
const FACADES = ['#ece2c8', '#e3c88f', '#e6b39a', '#efe3ad', '#f1eee6', '#cdd6b4', '#d4cfc4', '#e8c3b8',
  '#c3ced4', '#e9d6a8', '#dfd2bd', '#f0dcc0'];
// Fassadenfarben nach Straßenfotos (recherche/referenz-coburg.md); doppelte Einträge kommen öfter vor.
// Altstadt und Vorstädte: bunter Putz von Cremeweiß über Ocker und Lachs bis Ziegelrot
const FACADES_ALTSTADT = ['#f1ece0', '#f1ece0', '#ede4cf', '#e9d29a', '#e9d29a', '#e2b84c', '#e8a27c', '#e8a27c',
  '#e3aaa0', '#e3aaa0', '#b8463a', '#cfd9c4', '#f0dc8a', '#c9d0d4', '#e0c99a'];
// Gründerzeitstraßen: Sandstein, heller Klinker und gedeckte Putzfarben
const FACADES_GRUENDERZEIT = ['#cbb99a', '#cbb99a', '#c8bfa8', '#b9705c', '#b9705c', '#e9e2cf', '#d9d6cf', '#ede7da',
  '#c8cfa3', '#e8cf75'];
const GRUENDERZEIT_STREETS = new Set(['Mohrenstraße', 'Löwenstraße', 'Viktoriastraße', 'Hindenburgstraße',
  'Bahnhofstraße', 'Lossaustraße', 'Webergasse', 'Mühlgasse', 'Walkmühlgasse', 'Floßstegstraße', 'Callenberger Straße',
  'Heiligkreuzstraße', 'Hintere Kreuzgasse', 'Kanalstraße', 'Lohgraben', 'Seifartshofstraße', 'Schenkgasse',
  'Sally-Ehrlich-Straße', 'Goethestraße', 'Alexandrinenstraße', 'Marienstraße', 'Casimirstraße',
  'Ketschendorfer Straße', 'Am Viktoriabrunnen', 'Allee', 'Rosenauer Straße', 'Kasernenstraße', 'Kreuzwehrstraße']);
// Feste Farben für Wahrzeichen (Mitte des LoD2-Hauses, Spielkoordinaten)
const LANDMARK_FACADES = [
  { x: 28.2, z: -18.5, c: '#f3efe6' },    // Stadthaus (weiß, im Original mit roten Fensterrahmen)
  { x: -5.3, z: 63.2, c: '#e4e2d6' },     // Rathaus (cremeweiß mit hellblauen Wandfeldern)
  { x: 187.3, z: -147.1, c: '#e0d4b5' },  // Landestheater
  { x: -413.3, z: -481.7, c: '#d6cdb8' }, // Bahnhof
];
// Wahrzeichen in den LoD2-Daten (nach Namen): Wandfarbe ohne Fensterraster, Wandfarbe oberhalb einer Höhe über dem
// Boden, Dachfarbe statt Luftbild; Dachteile im Kreis (x, z, r) ab Höhe minY bekommen eine eigene Farbe
const LANDMARK_LOD2 = {
  Spitaltor: { wall: '#b3a68c', roof: '#4b5262' },
  Judentor: { wall: '#a99c86', roof: '#4f5866' },
  Ketschentor: { wall: '#b3a68c', upper: { y: 13, c: '#e2b84c' }, roof: '#4b5262' },
  Rathaus: { parts: [{ x: -9.3, z: 62.4, r: 4.5, minY: 19, c: '#5f9a86' }] },
  Stadthaus: {},                          // nur vormerken: Erker in props.js
};
// Altstadt mit Steinweg und Steintor (Spielkoordinaten, grob)
const ALTSTADT_BOX = { minX: -175, maxX: 340, minZ: -470, maxZ: 360 };
// Gebäudetypen, die ohne Angabe ein geneigtes (Walm-)Dach bekommen
const HIP_TYPES = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'yes', 'residential', 'apartments',
  'church', 'chapel', 'school', 'public', 'hotel', 'college', 'dormitory', 'castle', 'kindergarten', 'office', 'civic', 'townhall']);
// Schneiden sich die Strecken a-b und c-d echt?
function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
// Nebengebäude ohne Fenster
const PLAIN_TYPES = new Set(['garage', 'garages', 'carport', 'shed', 'service', 'roof', 'hut', 'greenhouse', 'kiosk']);
const TILE_ROOFS = ['#a5452f', '#963b2a', '#b5553a', '#7e3a2c', '#5e4a44', '#8a4b36'];

// Wandprofil (für die Fensterverteilung im Fassadenshader), je Ecke 10 Werte:
// [u links, u First, u rechts, Stil, Oberkante links, Oberkante am First, Oberkante rechts, Boden, Unterkante, Tür]
// u in Metern im System der Wand-UV (u · 12,8), Höhen in Weltmetern. Stil: 0 Stadt (Achsenraster), 1 Landhaus,
// 2 Landhaus mit Haustür (Tür: Feld-Nummer), 3 ohne Fenster.
const PROF_NONE = new Array(10).fill(0);
class Bucket {
  constructor() { this.pos = []; this.col = []; this.uv = []; this.nor = []; this.prof = null; }
  // Dreieck, das zur Referenzrichtung (rx, ry, rz) zeigt; pr: Wandprofil (optional)
  tri(a, b, c, col, uva, uvb, uvc, rx, ry, rz, pr) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    if (nx * rx + ny * ry + nz * rz < 0) {
      let t = b; b = c; c = t; t = uvb; uvb = uvc; uvc = t;
      nx = -nx; ny = -ny; nz = -nz;
    }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) { this.col.push(col.r, col.g, col.b); this.nor.push(nx, ny, nz); }
    if (uva) this.uv.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
    if (pr || this.prof) {
      if (!this.prof) this.prof = new Array((this.pos.length / 3 - 3) * 10).fill(0);
      const q = pr || PROF_NONE;
      for (let i = 0; i < 3; i++) this.prof.push(q[0] * 10, q[1] * 10, q[2] * 10, q[3], q[4] * 10, q[5] * 10, q[6] * 10, q[7] * 10, q[8] * 10, q[9]);
    }
  }
  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.prof) {
      const n = this.pos.length / 3, A = new Int16Array(n * 4), B = new Int16Array(n * 4), C = new Int16Array(n * 2), P = this.prof;
      const cl = v => Math.max(-32767, Math.min(32767, Math.round(v)));
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 4; k++) { A[i * 4 + k] = cl(P[i * 10 + k]); B[i * 4 + k] = cl(P[i * 10 + 4 + k]); }
        C[i * 2] = cl(P[i * 10 + 8]); C[i * 2 + 1] = cl(P[i * 10 + 9]);
      }
      g.setAttribute('aProfA', new THREE.Int16BufferAttribute(A, 4));
      g.setAttribute('aProfB', new THREE.Int16BufferAttribute(B, 4));
      g.setAttribute('aProfC', new THREE.Int16BufferAttribute(C, 2));
    }
    g.computeBoundingSphere();
    return g;
  }
}

// Profil einer rechteckigen Wand (Traufwand): von along bis along + len, Oberkante top, Boden base
function rectProfile(along, len, top, base, style = 0, door = 0) {
  return [along, along + len / 2, along + len, style, top, top, top, base, base - 2, door];
}
// Profil einer beliebigen ebenen Wand aus ihrem Umriss in (u, y): Oberkante als Linienzug links – höchster Punkt –
// rechts, so abgesenkt, dass er nirgends über der echten Oberkante liegt; Unterkante als höchster Punkt der Unterseite
function polyProfile(P, base, style = 0) {
  let uMin = Infinity, uMax = -Infinity;
  for (const p of P) { if (p[0] < uMin) uMin = p[0]; if (p[0] > uMax) uMax = p[0]; }
  if (uMax - uMin < 0.3) return [uMin, uMin, uMin, 3, 0, 0, 0, base, base, 0];
  const N = 24, us = [], tops = [], bots = [];
  for (let k = 0; k <= N; k++) {
    const u = uMin + (uMax - uMin) * (0.01 + 0.98 * k / N);
    let top = -Infinity, bot = Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a[0] - u) * (b[0] - u) > 0 || a[0] === b[0]) continue;
      const y = a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
      if (y > top) top = y; if (y < bot) bot = y;
    }
    if (top === -Infinity) continue;
    us.push(u); tops.push(top); bots.push(bot);
  }
  if (!us.length) return [uMin, uMin, uMin, 3, 0, 0, 0, base, base, 0];
  let kp = 0;
  for (let k = 1; k < tops.length; k++) if (tops[k] > tops[kp] + 0.05) kp = k;
  const uP = us[kp];
  let hL = tops[0], hP = tops[kp], hR = tops[tops.length - 1];
  const prof = u => u <= uP ? hL + (hP - hL) * (u - uMin) / Math.max(uP - uMin, 1e-3) : hP + (hR - hP) * (u - uP) / Math.max(uMax - uP, 1e-3);
  let over = 0;
  for (let k = 0; k < us.length; k++) over = Math.max(over, prof(us[k]) - tops[k]);
  hL -= over; hP -= over; hR -= over;
  return [uMin, uP, uMax, style, hL, hP, hR, base, Math.max(...bots), 0];
}

class Chunks {
  constructor() { this.map = new Map(); }
  get(x, z) {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let b = this.map.get(k);
    if (!b) { b = new Bucket(); this.map.set(k, b); }
    return b;
  }
  meshes(material, opts) {
    const out = [];
    for (const b of this.map.values()) {
      const g = b.geometry();
      if (!g) continue;
      const m = new THREE.Mesh(g, material);
      m.castShadow = !!opts.cast; m.receiveShadow = !!opts.receive;
      if (opts.order) m.renderOrder = opts.order;
      out.push(m);
    }
    return out;
  }
}

// ---------------- Bäume (Formen für Innenstadt und Umland) ----------------
// Laubkronen: Ikosaeder mit Beulen, weichen Normalen (rund statt facettiert) und Eigenschatten in den
// Eckenfarben (unten und innen dunkler); die Grundfarbe kommt je Baum aus der Instanzfarbe.
function treeMergeGeos(list) {
  const pos = [], nor = [], col = [], uv = [];
  for (const g of list) {
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array);
    uv.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}
// Laubtextur: links (u 0…0,75) ein Blattbüschel mit Transparenz für die Laubkarten, rechts dichtes Laub ohne
// Lücken für den Kern der Krone und die Nadelbäume. Fast weiß, die Grünfärbung kommt je Baum als Instanzfarbe.
function leafTexture(renderer) {
  if (_treeAssets.tex) return _treeAssets.tex;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), rnd = U.rng(9);
  const leaf = (x, y, len, wid, rot, v, warm) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    const r = Math.round(v * (205 + warm * 40)), g = Math.round(v * 248), b = Math.round(v * (170 - warm * 40));
    c.fillStyle = `rgb(${r},${g},${b})`;
    c.beginPath(); c.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = `rgba(0,0,0,0.18)`; c.lineWidth = 1; c.beginPath(); c.moveTo(-len, 0); c.lineTo(len, 0); c.stroke();
    c.restore();
  };
  // Zweige im Büschel
  c.strokeStyle = 'rgb(70,58,44)'; c.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = rnd() * 6.283, l = 60 + rnd() * 100;
    c.lineWidth = 2 + rnd() * 2; c.beginPath(); c.moveTo(192, 256); c.lineTo(192 + Math.cos(a) * l, 256 + Math.sin(a) * l); c.stroke();
  }
  for (let i = 0; i < 900; i++) {
    const a = rnd() * 6.283, rr = Math.pow(rnd(), 0.65) * 170;
    const x = 192 + Math.cos(a) * rr, y = 256 + Math.sin(a) * rr * 1.15;
    const shade = 0.5 + 0.5 * rnd() * (1 - rr / 260) + (y < 256 ? 0.08 : 0);
    leaf(x, y, 9 + rnd() * 8, 4 + rnd() * 3, rnd() * 6.283, Math.min(1, shade), rnd() < 0.2 ? 1 : 0);
  }
  // dichtes Laub (rechtes Viertel)
  c.fillStyle = 'rgb(95,110,80)'; c.fillRect(384, 0, 128, S);
  for (let i = 0; i < 1400; i++) leaf(384 + rnd() * 128, rnd() * S, 8 + rnd() * 6, 3.5 + rnd() * 2.5, rnd() * 6.283, 0.45 + rnd() * 0.5, rnd() < 0.2 ? 1 : 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  _treeAssets.tex = t;
  return t;
}
const SOLID_U = [0.78, 0.97];  // Bereich des dichten Laubs in der Textur
// Laubkrone: dunklerer, geschlossener Kern plus viele schräg stehende Blattbüschel-Karten auf der Hülle.
// Normalen zeigen von der Kronenmitte nach außen (weiche, runde Schattierung statt flacher Karten).
function treeCrown(seed, cards, r, cx, cy, cz, coreDetail = 1, coreScale = 0.62) {
  const rnd = U.rng(seed);
  const P = [], N = [], C = [], UV = [];
  const push = (x, y, z, u, v, ao) => {
    P.push(x, y, z);
    const nx = x - cx, ny = (y - cy) + r * 0.45, nz = z - cz, l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l); C.push(ao, ao, ao); UV.push(u, v);
  };
  // Kern
  const core = new THREE.IcosahedronGeometry(1, coreDetail), cp = core.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    const d = coreScale + 0.08 * Math.sin(x * 5.1 + z * 3.7);
    push(cx + x * r * d, cy + y * r * d * (y < 0 ? 0.7 : 0.95), cz + z * r * d,
      SOLID_U[0] + (Math.atan2(z, x) / 6.283 + 0.5) * (SOLID_U[1] - SOLID_U[0]), y * 0.5 + 0.5, 0.42 + 0.2 * (y * 0.5 + 0.5));
  }
  // Karten
  const t = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    const a = rnd() * 6.283, y = rnd() * 1.7 - 0.7, s0 = Math.sqrt(Math.max(0, 1 - y * y));
    d.set(Math.cos(a) * s0, y, Math.sin(a) * s0);
    const dist = r * (0.55 + 0.4 * rnd());
    const px = cx + d.x * dist, py = cy + d.y * dist * (d.y < 0 ? 0.72 : 0.95), pz = cz + d.z * dist;
    n.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().lerp(d, 0.5).normalize();
    q.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    t.crossVectors(n, q).normalize(); b.crossVectors(n, t).normalize();
    const sz = r * (0.42 + 0.22 * rnd());
    const ao = U.clamp(0.5 + 0.38 * (dist / r) + 0.18 * (d.y * 0.5 + 0.5), 0.4, 1.05);
    const cn = [[-1, -1, 0, 0], [1, -1, 0.75, 0], [1, 1, 0.75, 1], [-1, 1, 0, 1]].map(([u, v, tu, tv]) =>
      [px + (t.x * u + b.x * v) * sz, py + (t.y * u + b.y * v) * sz, pz + (t.z * u + b.z * v) * sz, tu, tv]);
    for (const k of [0, 1, 2, 0, 2, 3]) push(cn[k][0], cn[k][1], cn[k][2], cn[k][3], cn[k][4], ao);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
function treePine(seed) {
  const parts = [], rnd = U.rng(seed);
  [[2.2, 3.4, 3.3], [1.7, 3.0, 5.0], [1.1, 2.6, 6.7]].forEach(([r, h, y], k) => {
    const c = new THREE.ConeGeometry(r * (0.9 + rnd() * 0.2), h, 11, 2, true).toNonIndexed();
    c.translate(0, y, 0);
    const p = c.attributes.position, col = new Float32Array(p.count * 3), uv = c.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      // Zweigspitzen etwas zerzaust, unten heller (Licht), innen dunkler
      const yy = p.getY(i), f = U.clamp((yy - y + h / 2) / h, 0, 1);
      if (f < 0.05) { const ang = Math.atan2(p.getZ(i), p.getX(i)); const j = 1 + 0.12 * Math.sin(ang * 7 + k * 2); p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j); p.setY(i, yy - 0.25 * (0.5 + 0.5 * Math.sin(ang * 11))); }
      const v = 0.5 + 0.45 * f + k * 0.05; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
      uv.setXY(i, SOLID_U[0] + uv.getX(i) * (SOLID_U[1] - SOLID_U[0]), uv.getY(i) * 2);
    }
    c.setAttribute('color', new THREE.BufferAttribute(col, 3));
    c.computeVertexNormals();
    parts.push(c);
  });
  return treeMergeGeos(parts);
}
const _treeAssets = {};
// detail 1 für die Innenstadt, 0 für das Umland (viele Bäume)
function treeAssets(detail, renderer) {
  if (_treeAssets[detail]) return _treeAssets[detail];
  const n = detail ? 46 : 26;
  // Kronenformen: nah mit Blattkarten, fern (LOD) nur eine grobe geschlossene Laubhülle
  const shapes = [[[11, 1, 2.4, 0, 4.6, 0]], [[23, 1, 2.1, 0.5, 4.4, 0.2], [29, 0.5, 1.5, -1.0, 5.5, -0.5]], [[37, 1, 2.0, 0, 5.1, 0], [41, 0.5, 1.4, 0.4, 3.9, 1.0]]];
  const crowns = shapes.map(sh => treeMergeGeos(sh.map(([seed, f, r, x, y, z]) => treeCrown(seed, Math.round(n * f), r, x, y, z))));
  const crownsFar = shapes.map(sh => treeMergeGeos(sh.map(([seed, f, r, x, y, z]) => treeCrown(seed, 0, r, x, y, z, 0, 0.92))));
  // Stamm mit zwei Ästen in die Krone
  const tr = [new THREE.CylinderGeometry(0.16, 0.3, 3.9, 8).translate(0, 1.95, 0)];
  for (const [ang, tilt] of [[0.4, 0.6], [2.6, 0.55], [4.4, 0.7]]) {
    const br = new THREE.CylinderGeometry(0.05, 0.1, 1.9, 5).translate(0, 0.95, 0);
    br.rotateZ(tilt); br.rotateY(ang); br.translate(0, 3.0, 0);
    tr.push(br);
  }
  const trunk = U.mergeParts(tr.map(g => [g, 0, 0, 0]));
  // Busch (Hecken, Waldrand, Unterholz): sitzt auf dem Boden, zwei Laubballen
  const bushShape = [[53, 0.7, 1.3, 0, 1.0, 0], [59, 0.4, 0.95, 0.85, 0.75, 0.35]];
  const bush = treeMergeGeos(bushShape.map(([seed, f, r, x, y, z]) => treeCrown(seed, Math.round(n * f), r, x, y, z)));
  const bushFar = treeMergeGeos([treeCrown(53, 0, 1.45, 0.3, 1.0, 0.1, 0, 0.92)]);
  // ferne Stämme und Nadelbäume: wenige Dreiecke
  const trunkFar = U.mergeParts([[new THREE.CylinderGeometry(0.16, 0.3, 3.9, 5, 1, true).translate(0, 1.95, 0), 0, 0, 0]]);
  const pineFar = (() => {
    const parts = [[2.2, 3.4, 3.3], [1.4, 3.2, 5.6]].map(([r, h, y]) => {
      const c = new THREE.ConeGeometry(r, h, 6, 1, true).toNonIndexed(); c.translate(0, y, 0);
      const n = c.attributes.position.count, col = new Float32Array(n * 3).fill(0.75), uv = c.attributes.uv;
      for (let i = 0; i < n; i++) uv.setXY(i, SOLID_U[0] + uv.getX(i) * (SOLID_U[1] - SOLID_U[0]), uv.getY(i));
      c.setAttribute('color', new THREE.BufferAttribute(col, 3)); c.computeVertexNormals();
      return c;
    });
    return treeMergeGeos(parts);
  })();
  const tex = leafTexture(renderer);
  _treeAssets[detail] = {
    crowns, crownsFar, bush, bushFar, trunk, trunkFar, pine: treePine(5), pineFar,
    trunkMat: new THREE.MeshLambertMaterial({ color: '#5a4d40' }),
    leafMat: new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }),
  };
  return _treeAssets[detail];
}

class World {
  constructor(data, scene, renderer) {
    this.data = data;
    this.scene = scene;
    this.renderer = renderer;
    this.bounds = data.meta.bounds;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.edgeGrid = new U.Grid(16);   // Gebäudekanten für Kollision
    this.polyGrid = new U.Grid(32);   // Gebäudegrundrisse für "Punkt im Gebäude"
    this.treeGrid = new U.Grid(16);   // Baumstämme
    this.roadGrid = new U.Grid(25);   // Straßenabschnitte (Namen, Suche)
    this.edges = [];                  // [ax, az, bx, bz] flach
    this.trees = [];                  // [x, z, r]
    this._tmp = [];
    this.windowMaterials = [];
    this.region = null;               // Umland (Landkreis), siehe js/region.js
    this.limits = this.bounds;        // befahrbarer Bereich (mit Umland: alle Landkreis-Kacheln)
  }

  // Baut die Welt Schritt für Schritt; progress(text, anteil)
  async build(progress) {
    const step = async (text, f, fn) => { progress(text, f); await new Promise(r => setTimeout(r, 0)); fn(); };
    await step('Gelände berechnen …', 0.05, () => this.buildTerrainData());
    await step('Landkreis vorbereiten …', 0.08, () => this.initRegion());
    progress('Luftbilder laden …', 0.1);
    await this.loadOrtho(f => progress('Luftbilder laden …', 0.1 + f * 0.1));
    if (!this.ortho) await step('Bodentextur malen …', 0.15, () => this.paintGround());
    await step('Gelände formen …', 0.3, () => this.buildTerrainMesh());
    await step('Straßen bauen …', 0.4, () => this.buildRoads());
    await step('Flüsse füllen …', 0.5, () => this.buildWater());
    await step('Gebäude errichten …', 0.55, () => this.buildBuildings());
    await step('Bäume pflanzen …', 0.8, () => this.buildTrees());
    await step('Stadtplan zeichnen …', 0.92, () => this.paintMap());
  }

  // ---------------- Gelände ----------------
  buildTerrainData() {
    const T = this.data.terrain;
    if (!T) { this.hgrid = null; return; }
    const F = TERRAIN_UPSAMPLE;
    this.tcols = (T.cols - 1) * F + 1;
    this.trows = (T.rows - 1) * F + 1;
    this.tminX = T.minX; this.tminZ = T.minZ;
    this.tstepX = T.stepX / F; this.tstepZ = T.stepZ / F;
    const h = T.h, cols = T.cols, rows = T.rows;
    const at = (r, c) => h[U.clamp(r, 0, rows - 1) * cols + U.clamp(c, 0, cols - 1)];
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const g = new Float32Array(this.tcols * this.trows);
    for (let r = 0; r < this.trows; r++) {
      const gr = r / F, r0 = Math.floor(gr), tr = gr - r0;
      for (let c = 0; c < this.tcols; c++) {
        const gc = c / F, c0 = Math.floor(gc), tc = gc - c0;
        const row = k => cr(at(r0 + k, c0 - 1), at(r0 + k, c0), at(r0 + k, c0 + 1), at(r0 + k, c0 + 2), tc);
        g[r * this.tcols + c] = cr(row(-1), row(0), row(1), row(2), tr);
      }
    }
    this.hgrid = g;
    this.carveCoreWater();
  }

  // Fluss- und Seebetten der Innenstadt ausheben; hgrid0 behält das ursprüngliche Gelände (Häuser, Wasseroberfläche)
  carveCoreWater() {
    this.hgrid0 = Float32Array.from(this.hgrid);
    if (typeof WaterSet === 'undefined') return;
    const d = this.data;
    this.water = new WaterSet(d.areas.filter(a => a.k === 'water'), d.waterways.map(w => ({ w: w.w, p: w.p })));
    // an Straßen und Wegen nicht graben (Brücken liegen flach auf dem Gelände)
    const roads = new U.Grid(25);
    for (const r of d.roads) {
      if (r.k === 'plazaArea' || !r.p) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
        roads.insert({ ax, az, bx, bz, w: r.w }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
      }
    }
    const tmp = [];
    const skip = (x, z) => roads.query(x, z, 12, tmp).some(s => {
      const c = U.closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      return Math.hypot(c[0] - x, c[1] - z) < s.w / 2 + WATER.roadGap;
    });
    const cols = this.tcols;
    this.water.carveGrid(this.hgrid, this.hgrid.length, i => [this.tminX + (i % cols) * this.tstepX, this.tminZ + Math.floor(i / cols) * this.tstepZ], skip);
  }

  // Wasseroberflächen und Ufer als Hindernis (nach den Straßen, weil die Ufer an Straßen offen bleiben)
  buildWater() {
    if (!this.water || this.water.empty) return;
    const surf = new Chunks();
    const inside = this.region ? (x, z) => this.inCoreRect(x, z) : null;
    this.water.buildSurface(surf, (x, z) => this.heightAt0(x, z), inside);
    surf.meshes(waterMaterial(), { receive: true }).forEach(m => this.group.add(m));
    this.water.edges((ax, az, bx, bz) => {
      this.edges.push(ax, az, bx, bz);
      this.edgeGrid.insert(this.edges.length / 4 - 1, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }, (x, z) => !!this.nearRoad(x, z, WATER.roadGap), null, inside);
    this.riverGrid = new U.Grid(20);
    this.water.riverPieces(q => this.riverGrid.insert(q, Math.min(q.ax, q.bx) - q.hw, Math.min(q.az, q.bz) - q.hw, Math.max(q.ax, q.bx) + q.hw, Math.max(q.az, q.bz) + q.hw),
      (x, z) => !!this.nearRoad(x, z, WATER.roadGap), inside);
  }

  // Gelände ohne ausgehobene Gewässer (Häuser stehen darauf, Wasseroberfläche liegt knapp darunter)
  heightAt0(x, z) {
    if (this.region && !this.inCoreRect(x, z)) return this.region.heightAt0(x, z);
    const g = this.hgrid0 || this.hgrid;
    if (!g) return 0;
    let fc = (x - this.tminX) / this.tstepX, fr = (z - this.tminZ) / this.tstepZ;
    fc = U.clamp(fc, 0, this.tcols - 1.0001); fr = U.clamp(fr, 0, this.trows - 1.0001);
    const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, tz = fr - r, i = r * this.tcols + c;
    const h00 = g[i], h10 = g[i + 1], h01 = g[i + this.tcols], h11 = g[i + this.tcols + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  // Boden für Figuren und Autos: auf Brücken die Fahrbahn, sonst das Gelände. y: jetzige Höhe (Infinity = oberste Fläche)
  groundAt(x, z, y) {
    return this.region ? this.region.groundAt(x, z, y) : this.heightAt(x, z);
  }

  // Umland aus data/region.js; ersetzt das Straßennetz der Innenstadt durch das des ganzen Landkreises
  initRegion() {
    const R = window.COBURG_REGION;
    if (!R || !this.hgrid || typeof Region === 'undefined') return;
    const reg = new Region(this, R);
    if (!reg.ok) { console.warn('data/region.js passt nicht zu data/coburg.js – bitte node tools/convert-region.js neu ausführen'); return; }
    this.region = reg;
    this.data.graph = reg.graph;
    this.limits = reg.limits;
    this.coreRect = reg.core;
  }
  inCoreRect(x, z) { const C = this.coreRect; return !C || (x >= C.minX && x <= C.maxX && z >= C.minZ && z <= C.maxZ); }

  // ---------------- Luftbilder ----------------
  // Kacheln aus data/ortho (tools/fetch-ortho.js). Fehlt etwas, bleibt es bei der gemalten Bodentextur.
  async loadOrtho(onProgress) {
    const O = window.COBURG_ORTHO;
    this.ortho = null;
    if (!O || !this.hgrid || O.upsample !== TERRAIN_UPSAMPLE || location.protocol === 'file:') return;
    const loader = new THREE.TextureLoader();
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    let done = 0;
    try {
      const tex = await Promise.all(O.tiles.map(t => loader.loadAsync('data/ortho/' + t.file).then(tx => {
        tx.colorSpace = THREE.SRGBColorSpace;
        tx.anisotropy = aniso;
        tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
        onProgress(++done / O.tiles.length);
        return tx;
      })));
      const detail = this.makeDetailTexture();
      this.ortho = O.tiles.map((t, i) => {
        const mat = new THREE.MeshLambertMaterial({ map: tex[i], color: ORTHO_TINT });
        this.addDetail(mat, detail);
        return { ...t, tex: tex[i], mat };
      });
      this.orthoAttribution = O.attribution;
    } catch (e) {
      console.warn('Luftbilder nicht geladen, nutze gemalte Textur', e);
      this.ortho = null;
    }
  }

  // Feines Rauschen (um 1,0), das aus der Nähe Körnung ins unscharfe Luftbild bringt
  makeDetailTexture() {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), img = c.createImageData(S, S), rnd = U.rng(21);
    // mehrere Oktaven Wertrauschen, nahtlos kachelbar
    const oct = [[8, 0.5], [32, 0.3], [128, 0.2]].map(([n, w]) => {
      const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd();
      return { n, w, g };
    });
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0;
      for (const o of oct) {
        const fx = x / S * o.n, fy = y / S * o.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const at = (a, b) => o.g[((b % o.n) * o.n) + (a % o.n)];
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        v += o.w * U.lerp(U.lerp(at(x0, y0), at(x0 + 1, y0), sx), U.lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx), sy);
      }
      const k = (y * S + x) * 4, g = Math.round(U.clamp(v * 255, 0, 255));
      img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // Shader-Ergänzung: Detailrauschen in Weltkoordinaten über die Grundfarbe legen
  addDetail(mat, detail) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.uWet = ATMO.uniforms.uWet;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;\nuniform sampler2D detailMap;\nuniform float uWet;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float dA = texture2D(detailMap, vWorldXZ / 9.0).r;
          float dB = texture2D(detailMap, vWorldXZ / 1.7).r;
          float dC = texture2D(detailMap, vWorldXZ / 0.33).r;
          vec3 oc = diffuseColor.rgb;
          // Art des Bodens nach Fotofarbe: Grün = Wiese, Grau = Asphalt/Pflaster
          float grass = smoothstep(0.0, 0.05, oc.g - max(oc.r, oc.b) * 0.93);
          float sat = max(oc.r, max(oc.g, oc.b)) - min(oc.r, min(oc.g, oc.b));
          float paved = (1.0 - smoothstep(0.025, 0.08, sat)) * (1.0 - grass);
          diffuseColor.rgb *= mix(1.0, 0.72 + 0.56 * (dA * 0.5 + dB * 0.5), 0.55);
          diffuseColor.rgb *= mix(1.0, 0.62 + 0.76 * dC, grass * 0.55);                      // Grashalme
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.05, 0.78), grass * smoothstep(0.55, 0.8, dA) * 0.6); // trockene Stellen
          diffuseColor.rgb *= mix(1.0, 0.86 + 0.28 * dC, paved * 0.6);                      // Körnung
          diffuseColor.rgb *= 1.0 - 0.28 * uWet;`);
    };
    mat.customProgramCacheKey = () => 'ortho-detail';
  }

  // Shader-Ergänzung für Straßen, Wege und Markierungen: Asphaltkörnung und Flicken in Weltkoordinaten,
  // bei Regen dunkler mit Pfützen, die den Himmel spiegeln
  roadShader(mat) {
    if (!this._roadDetail) this._roadDetail = this.makeDetailTexture();
    const detail = this._roadDetail;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, ATMO.uniforms);
      sh.uniforms.detailMap = { value: detail };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRPos;
          uniform sampler2D detailMap;
          uniform float uWet, uNight;
          uniform vec3 uSkyTop, uSkyHorizon;
          float rPuddle = 0.0;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 wp = vRPos.xz;
            float g1 = texture2D(detailMap, wp / 0.8).r, g2 = texture2D(detailMap, wp / 6.5).r, g3 = texture2D(detailMap, wp / 29.0).r;
            diffuseColor.rgb *= (0.82 + 0.3 * g1) * (0.9 + 0.2 * g2) * (0.93 + 0.14 * smoothstep(0.42, 0.62, g3));
            rPuddle = smoothstep(0.52, 0.66, g2 * 0.7 + g3 * 0.3) * uWet;
            diffuseColor.rgb *= 1.0 - 0.38 * uWet - 0.2 * rPuddle;
          }`)
        .replace('#include <opaque_fragment>', `
          {
            vec3 V = normalize(vRPos - cameraPosition);
            vec3 Rf = reflect(V, vec3(0.0, 1.0, 0.0));
            float fres = 0.03 + 0.97 * pow(1.0 - max(-V.y, 0.0), 5.0);
            vec3 sky = mix(uSkyHorizon, uSkyTop, pow(max(Rf.y, 0.0), 0.6));
            outgoingLight = mix(outgoingLight, sky, uWet * (0.1 + 0.75 * fres) * (0.45 + 0.55 * rPuddle) * (1.0 - uNight * 0.6));
          }
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'road';
    return mat;
  }

  // Laub: Blattbüschel-Karten mit geschärfter Transparenz (bleibt auch aus der Ferne dicht, mit MSAA weiche
  // Kanten), runde Schattierung der Krone auf beiden Seiten, leichtes Wiegen im Wind, nasses Laub dunkler
  leafShader(mat) {
    if (mat.userData.leaf) return;
    mat.userData.leaf = true;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uWet = ATMO.uniforms.uWet;
      sh.uniforms.uTime = ATMO.uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = dot(instanceMatrix[3].xz, vec2(0.13, 0.21));
            float sway = max(position.y - 2.6, 0.0);
            transformed.x += sin(uTime * 1.3 + ph + position.z * 0.7) * 0.035 * sway;
            transformed.z += cos(uTime * 1.1 + ph * 1.3 + position.x * 0.6) * 0.03 * sway;
          #endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWet;')
        .replace('#include <alphatest_fragment>', `
          diffuseColor.a = (diffuseColor.a - 0.5) / max(fwidth(diffuseColor.a), 1e-4) + 0.5;
          #include <alphatest_fragment>`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 0.85) * 0.95 * (1.0 - 0.2 * uWet);
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize(vNormal);`);
    };
    mat.customProgramCacheKey = () => 'leaf';
  }

  // Dächer mit Luftbild: Das Foto liefert die echte Farbe, der Shader legt Ziegelreihen (Pfannen mit Wellen, Schatten
  // unter jeder Reihe, Farbschwankung je Ziegel) und deren Relief darüber; Flachdächer bekommen Kies-/Bitumenkörnung.
  // Aus der Ferne blendet das Muster aus (kein Flimmern).
  roofShader(mat) {
    if (mat.userData.roof) return mat;
    mat.userData.roof = true;
    const detail = this._roadDetail || (this._roadDetail = this.makeDetailTexture());
    mat.onBeforeCompile = sh => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.uWet = ATMO.uniforms.uWet;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRfP;\nvarying vec3 vRfN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRfP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRfN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRfP; varying vec3 vRfN;
          uniform sampler2D detailMap;
          uniform float uWet;
          vec3 rfBumpW = vec3(0.0);
          float rfh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 N = normalize(vRfN);
            float sl = length(N.xz);
            float big = texture2D(detailMap, vRfP.xz * 0.11).r;
            // steile Flächen: das von oben projizierte Foto wäre verschmiert, dort die unscharfe Mittelfarbe nehmen
            #ifdef USE_MAP
              diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, vMapUv, 5.0).rgb * diffuse * vColor.rgb, smoothstep(0.55, 0.3, N.y));
            #endif
            if (sl > 0.22 && N.y > 0.05) {
              vec2 dn = N.xz / sl;                       // waagrecht hangabwärts
              vec2 ac = vec2(-dn.y, dn.x);
              float r = vRfP.y / sl / 0.3;               // Reihen alle 30 cm entlang der Dachneigung
              float row = floor(r), fr = fract(r);
              float c = dot(vRfP.xz, ac) / 0.27 + 0.5 * mod(row, 2.0);
              float col = floor(c), fc = fract(c);
              float fw = max(fwidth(r), fwidth(c));
              float fade = 1.0 - smoothstep(0.3, 0.85, fw);
              float tileV = 0.86 + 0.28 * rfh(vec2(row, col));
              float wave = cos(fc * 6.2831853);
              float pat = tileV * (0.93 + 0.07 * wave)
                * mix(1.0, 0.58, smoothstep(0.72, 1.0, fr))             // Schatten unter der nächsten Reihe
                * mix(0.7, 1.0, smoothstep(0.0, 0.05, fc) * smoothstep(1.0, 0.95, fc));
              pat /= 0.86;
              diffuseColor.rgb *= mix(1.0, pat, fade);
              // Moos und Schmutz in Flecken, etwas kräftigere Ziegelfarbe als im blassen Foto
              float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 1.15) * (0.88 + 0.22 * big);
              rfBumpW = (vec3(ac.x, 0.0, ac.y) * sin(fc * 6.2831853) * 0.22 + vec3(dn.x, 0.0, dn.y) * smoothstep(0.6, 1.0, fr) * 0.35) * fade;
            } else {
              float g1 = texture2D(detailMap, vRfP.xz * 1.9).r, g2 = texture2D(detailMap, vRfP.xz * 0.35).r;
              diffuseColor.rgb *= (0.86 + 0.24 * g1) * (0.92 + 0.16 * g2);
            }
            diffuseColor.rgb *= 1.0 - 0.3 * uWet;
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize(normal + (viewMatrix * vec4(rfBumpW, 0.0)).xyz);`);
    };
    mat.customProgramCacheKey = () => 'roof';
    return mat;
  }

  // Kachel, in der ein Punkt liegt (oder die nächste am Rand)
  tileAt(x, z) {
    const T = this.ortho;
    let best = 0, bd = Infinity;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      const dx = Math.max(t.minX - x, 0, x - t.maxX), dz = Math.max(t.minZ - z, 0, z - t.maxZ);
      const d = dx + dz;
      if (d === 0) return i;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  orthoUV(ti, x, z) {
    const t = this.ortho[ti];
    return [(x - t.minX) / (t.maxX - t.minX), 1 - (z - t.minZ) / (t.maxZ - t.minZ)];
  }

  // Höhe genau wie das Geländenetz (gleiche Dreiecksaufteilung)
  heightAt(x, z) {
    const g = this.hgrid;
    if (!g) return 0;
    if (this.region && !this.inCoreRect(x, z)) return this.region.heightAt(x, z);
    let fc = (x - this.tminX) / this.tstepX, fr = (z - this.tminZ) / this.tstepZ;
    fc = U.clamp(fc, 0, this.tcols - 1.0001); fr = U.clamp(fr, 0, this.trows - 1.0001);
    const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, tz = fr - r;
    const i = r * this.tcols + c;
    const h00 = g[i], h10 = g[i + 1], h01 = g[i + this.tcols], h11 = g[i + this.tcols + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  paintGround() {
    const B = this.bounds;
    const W = Math.ceil((B.maxX - B.minX) * GROUND_PX), H = Math.ceil((B.maxZ - B.minZ) * GROUND_PX);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#7f9c58';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(GROUND_PX, 0, 0, GROUND_PX, -B.minX * GROUND_PX, -B.minZ * GROUND_PX);
    const d = this.data;

    const order = Object.keys(AREA_STYLE);
    const areas = d.areas.slice().sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
    for (const a of areas) {
      ctx.fillStyle = AREA_STYLE[a.k];
      this.pathPoly(ctx, a.p, a.ho);
      ctx.fill('evenodd');
      if (a.k === 'pitch') { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    }
    // Gewässer
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = AREA_STYLE.water;
    for (const w of d.waterways) { ctx.lineWidth = w.w; this.pathLine(ctx, w.p); ctx.stroke(); }
    // Gleise: Schotterbett mit Schwellen
    for (const r of d.rails) {
      ctx.strokeStyle = '#7d756b'; ctx.lineWidth = 4.2; this.pathLine(ctx, r); ctx.stroke();
      ctx.strokeStyle = '#4b443c'; ctx.lineWidth = 2.4; ctx.setLineDash([0.3, 0.4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.25;
      this.offsetLine(ctx, r, 0.72); ctx.stroke(); this.offsetLine(ctx, r, -0.72); ctx.stroke();
    }
    // Plätze und Gehwege neben Straßen
    for (const r of d.roads) {
      if (r.k === 'plazaArea') { ctx.fillStyle = ROAD_STYLE.plaza.color; this.pathPoly(ctx, r.p, r.ho); ctx.fill('evenodd'); }
    }
    ctx.strokeStyle = '#a49f95';
    for (const r of d.roads) {
      if (r.k !== 'road' || r.h === 'service') continue;
      ctx.lineWidth = r.w + 3.6; this.pathLine(ctx, r.p); ctx.stroke();
    }
    ctx.strokeStyle = '#9c968b';
    for (const r of d.roads) {
      if (r.k !== 'road' || r.h !== 'service') continue;
      ctx.lineWidth = r.w + 1.2; this.pathLine(ctx, r.p); ctx.stroke();
    }
    // feines Rauschen gegen gleichförmige Flächen
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const n = document.createElement('canvas'); n.width = n.height = 256;
    const nc = n.getContext('2d'), img = nc.createImageData(256, 256), rnd = U.rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = rnd() * 38;
    }
    nc.putImageData(img, 0, 0);
    ctx.fillStyle = ctx.createPattern(n, 'repeat');
    ctx.fillRect(0, 0, W, H);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.groundTexture = tex;
    this.groundCanvas = cv;
  }

  pathPoly(ctx, p, holes) {
    ctx.beginPath();
    const ring = q => { ctx.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i + 1]); ctx.closePath(); };
    ring(p);
    if (holes) holes.forEach(ring);
  }
  pathLine(ctx, p) {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  }
  offsetLine(ctx, p, off) {
    ctx.beginPath();
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const x = p[i * 2] - dz * off, z = p[i * 2 + 1] + dx * off;
      if (i === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z);
    }
  }

  // Ein Geländestück pro Luftbildkachel (Kachelgrenzen liegen auf Gitterlinien)
  buildOrthoTerrain() {
    const cols = this.tcols;
    for (const t of this.ortho) {
      const w = t.c1 - t.c0 + 1, h = t.r1 - t.r0 + 1;
      const pos = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2);
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const gi = (t.r0 + r) * cols + (t.c0 + c), i = r * w + c;
        pos[i * 3] = this.tminX + (t.c0 + c) * this.tstepX;
        pos[i * 3 + 1] = this.hgrid[gi];
        pos[i * 3 + 2] = this.tminZ + (t.r0 + r) * this.tstepZ;
        uv[i * 2] = c / (w - 1); uv[i * 2 + 1] = 1 - r / (h - 1);
      }
      const idx = [];
      for (let r = 0; r < h - 1; r++) for (let c = 0; c < w - 1; c++) {
        const a = r * w + c, b = a + 1, d = a + w, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
      // Normalen aus dem ganzen Gitter, damit an den Kachelgrenzen keine Kanten sichtbar sind
      const nor = new Float32Array(w * h * 3), H = this.hgrid, rows = this.trows;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const gc = t.c0 + c, gr = t.r0 + r, i = r * w + c;
        const hx = (H[gr * cols + Math.min(cols - 1, gc + 1)] - H[gr * cols + Math.max(0, gc - 1)]) / (2 * this.tstepX);
        const hz = (H[Math.min(rows - 1, gr + 1) * cols + gc] - H[Math.max(0, gr - 1) * cols + gc]) / (2 * this.tstepZ);
        const l = Math.hypot(hx, 1, hz);
        nor[i * 3] = -hx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -hz / l;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, t.mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  buildTerrainMesh() {
    const B = this.bounds;
    const W = B.maxX - B.minX, H = B.maxZ - B.minZ;
    if (this.ortho) { this.buildOrthoTerrain(); if (!this.region) this.buildSkirt(); return; }
    let cols, rows, sx, sz, x0, z0;
    if (this.hgrid) { cols = this.tcols; rows = this.trows; sx = this.tstepX; sz = this.tstepZ; x0 = this.tminX; z0 = this.tminZ; }
    else { cols = 2; rows = 2; sx = W; sz = H; x0 = B.minX; z0 = B.minZ; }
    const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x = x0 + c * sx, z = z0 + r * sz;
      pos[i * 3] = x; pos[i * 3 + 1] = this.hgrid ? this.hgrid[i] : 0; pos[i * 3 + 2] = z;
      uv[i * 2] = (x - B.minX) / W; uv[i * 2 + 1] = 1 - (z - B.minZ) / H;
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: this.groundTexture }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (!this.region) this.buildSkirt();
  }

  // Umland außerhalb des Kartenausschnitts (grobes Gitter, etwas tiefer)
  buildSkirt() {
    const B = this.bounds;
    const W = B.maxX - B.minX, H = B.maxZ - B.minZ;
    const M = 1600, step = 80;
    const sCols = Math.ceil((W + 2 * M) / step) + 1, sRows = Math.ceil((H + 2 * M) / step) + 1;
    const sp = [], sc = [], si = [];
    const rnd = U.rng(3);
    for (let r = 0; r < sRows; r++) for (let c = 0; c < sCols; c++) {
      const x = B.minX - M + c * step, z = B.minZ - M + r * step;
      const inside = x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ;
      const hx = U.clamp(x, B.minX, B.maxX), hz = U.clamp(z, B.minZ, B.maxZ);
      const dist = Math.max(B.minX - x, x - B.maxX, B.minZ - z, z - B.maxZ, 0);
      sp.push(x, this.heightAt(hx, hz) - (inside ? 6 : 0.4) + Math.sin(x * 0.004) * Math.cos(z * 0.005) * Math.min(dist, 400) * 0.06, z);
      const col = new THREE.Color(rnd() < 0.35 ? '#4f7238' : '#7f9c58').multiplyScalar(0.9 + rnd() * 0.15);
      sc.push(col.r, col.g, col.b);
    }
    for (let r = 0; r < sRows - 1; r++) for (let c = 0; c < sCols - 1; c++) {
      const a = r * sCols + c, b = a + 1, d = a + sCols, e = d + 1;
      si.push(a, d, b, b, d, e);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sg.setIndex(si);
    sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    skirt.receiveShadow = true;
    this.group.add(skirt);
  }

  // ---------------- Straßen ----------------
  buildRoads() {
    const chunks = {}, marks = new Chunks();
    this.pave = new Chunks();
    for (const k in ROAD_STYLE) chunks[k] = new Chunks();
    const rnd = U.rng(11);
    const white = new THREE.Color('#e9e6dc');
    this.curbs = new Chunks();
    // erst alle Abschnitte ins Suchraster (Bordsteine brauchen die Kreuzungen), dann die Bänder bauen
    const sampled = new Map();
    for (const r of this.data.roads) {
      if (r.k === 'plazaArea') continue;
      const pts = this.resample(r.p, 4);
      sampled.set(r, pts);
      for (let i = 0; i < pts.length / 2 - 1; i++) {
        const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[i * 2 + 2], bz = pts[i * 2 + 3];
        this.roadGrid.insert({ ax, az, bx, bz, n: r.n, k: r.k, h: r.h, w: r.w, src: r },
          Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
      }
    }
    for (const r of this.data.roads) {
      if (r.k === 'plazaArea') continue;
      const style = ROAD_STYLE[r.k];
      const pts = sampled.get(r);
      const col = U.color(style.color, 0.08, rnd);
      const hidden = this.ortho && PHOTO_HIDE.has(r.k);
      if (hidden && r.k !== 'plaza') continue;
      // mit Umland nur die Stücke innerhalb des Innenstadt-Geländes (außen zeichnet js/region.js)
      const pieces = this.region ? this.clipToCore(pts) : [pts];
      for (const pts of pieces) this.roadRibbon(r, pts, style, col, hidden, chunks, marks, white);
    }
    this.finishRoads(chunks, marks);
  }

  // Polylinie in die Stücke zerlegen, deren Abschnitte im Innenstadt-Gelände liegen
  clipToCore(pts) {
    const out = [];
    let cur = null;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const inside = this.inCoreRect((pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
      if (inside) { if (!cur) { cur = [pts[i], pts[i + 1]]; out.push(cur); } cur.push(pts[i + 2], pts[i + 3]); }
      else cur = null;
    }
    return out;
  }

  roadRibbon(r, pts, style, col, hidden, chunks, marks, white) {
      const n = pts.length / 2;
      const half = r.w / 2;
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        // Gehrung: Mittel der beiden Segmentrichtungen
        let d1x = pts[i * 2] - pts[a * 2], d1z = pts[i * 2 + 1] - pts[a * 2 + 1];
        let d2x = pts[b * 2] - pts[i * 2], d2z = pts[b * 2 + 1] - pts[i * 2 + 1];
        let l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
        if (l1 < 1e-6) { d1x = d2x; d1z = d2z; l1 = l2; }
        if (l2 < 1e-6) { d2x = d1x; d2z = d1z; l2 = l1; }
        d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
        let tx = d1x + d2x, tz = d1z + d2z;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const miter = Math.min(1 / Math.max(0.35, tx * d2x + tz * d2z), 2.5);
        const nx = -tz * half * miter, nz = tx * half * miter;
        const x = pts[i * 2], z = pts[i * 2 + 1];
        L.push([x + nx, this.heightAt(x + nx, z + nz) + style.y, z + nz]);
        R.push([x - nx, this.heightAt(x - nx, z - nz) + style.y, z - nz]);
      }
      // Fußgängerzone: Pflasterstruktur in Weltkoordinaten (auch über dem Luftbild)
      const pave = r.k === 'plaza' ? this.pave : null;
      const puv = p => [p[0] / PAVE_TILE, p[2] / PAVE_TILE];
      const quad = (b, a, c, d, e) => {
        b.tri(a, c, d, col, null, null, null, 0, 1, 0);
        b.tri(a, d, e, col, null, null, null, 0, 1, 0);
      };
      for (let i = 0; i < n - 1; i++) {
        if (!hidden) quad(chunks[r.k].get(pts[i * 2], pts[i * 2 + 1]), L[i], R[i], R[i + 1], L[i + 1]);
        if (pave) {
          const b = pave.get(pts[i * 2], pts[i * 2 + 1]);
          b.tri(L[i], R[i], R[i + 1], white, puv(L[i]), puv(R[i]), puv(R[i + 1]), 0, 1, 0);
          b.tri(L[i], R[i + 1], L[i + 1], white, puv(L[i]), puv(R[i + 1]), puv(L[i + 1]), 0, 1, 0);
        }
      }
      // runde Enden schließen Lücken an Kreuzungen
      if (r.k === 'road' || r.k === 'plaza') {
        for (const e of [0, n - 1]) {
          const x = pts[e * 2], z = pts[e * 2 + 1];
          const b = hidden ? null : chunks[r.k].get(x, z);
          const pb = pave ? pave.get(x, z) : null;
          const c = [x, this.heightAt(x, z) + style.y, z];
          for (let s = 0; s < 10; s++) {
            const a1 = s / 10 * Math.PI * 2, a2 = (s + 1) / 10 * Math.PI * 2;
            const p1x = x + Math.cos(a1) * half, p1z = z + Math.sin(a1) * half;
            const p2x = x + Math.cos(a2) * half, p2z = z + Math.sin(a2) * half;
            const p1 = [p1x, this.heightAt(p1x, p1z) + style.y, p1z], p2 = [p2x, this.heightAt(p2x, p2z) + style.y, p2z];
            if (b) b.tri(c, p1, p2, col, null, null, null, 0, 1, 0);
            if (pb) pb.tri(c, p1, p2, white, puv(c), puv(p1), puv(p2), 0, 1, 0);
          }
        }
      }
      // Bordsteine und Randlinien (nicht an Wohnwegen, Feldwegen, Autobahnen)
      if (r.k === 'road' && r.w >= 5 && !/service|living_street|track|motorway/.test(r.h || '')) {
        for (const E of [L, R]) this.curb(r, pts, E, half, style.y);
        if (r.w >= 7.5 && /primary|secondary|trunk|tertiary/.test(r.h || '')) {
          for (const E of [L, R]) {
            const k = (half - 0.45) / half, side = [];
            for (let i = 0; i < n; i++) side.push(pts[i * 2] + (E[i][0] - pts[i * 2]) * k, pts[i * 2 + 1] + (E[i][2] - pts[i * 2 + 1]) * k);
            this.dashes(side, 1e9, 1, 0.065, style.y + 0.02, marks, white);
          }
        }
      }
      // Mittellinie
      if (r.k === 'road' && r.w >= 6 && !r.o && r.h !== 'service' && r.h !== 'living_street') {
        this.dashes(pts, 3, 6, 0.07, style.y + 0.02, marks, white);
      }
      // Treppenstufen andeuten
      if (r.k === 'steps') this.dashes(pts, 0.12, 0.3, half, style.y + 0.015, marks, new THREE.Color('#6f6a62'));
  }

  // Bordstein (0,12 m hoch, 0,22 m breit) entlang einer Straßenkante E (Punkte [x, y, z]); an Kreuzungen und
  // Einmündungen, wo eine andere Fahrbahn anschließt, bleibt er offen
  curb(r, pts, E, half, y0) {
    const n = pts.length / 2, H = 0.12, W = 0.22, col = this._curbCol || (this._curbCol = new THREE.Color('#a19f98'));
    const ok = [];
    for (let i = 0; i < n; i++) {
      const cx = pts[i * 2], cz = pts[i * 2 + 1];
      let ox = E[i][0] - cx, oz = E[i][2] - cz;
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const px = E[i][0] + ox * 0.6, pz = E[i][2] + oz * 0.6;
      let free = true;
      for (const s of this.roadGrid.query(px, pz, 12, this._tmp)) {
        if (s.src === r || (s.k !== 'road' && s.k !== 'plaza')) continue;
        const c = U.closestOnSeg(px, pz, s.ax, s.az, s.bx, s.bz);
        if (Math.hypot(c[0] - px, c[1] - pz) < s.w / 2 + 1.2) { free = false; break; }
      }
      ok.push(free ? [ox, oz] : null);
    }
    for (let i = 0; i < n - 1; i++) {
      if (!ok[i] || !ok[i + 1]) continue;
      const b = this.curbs.get(pts[i * 2], pts[i * 2 + 1]);
      const A = E[i], B = E[i + 1], [ax, az] = ok[i], [bx, bz] = ok[i + 1];
      const At = [A[0], A[1] + H, A[2]], Bt = [B[0], B[1] + H, B[2]];
      const Ao = [A[0] + ax * W, Math.max(this.heightAt(A[0] + ax * W, A[2] + az * W) + y0 + H, At[1]), A[2] + az * W];
      const Bo = [B[0] + bx * W, Math.max(this.heightAt(B[0] + bx * W, B[2] + bz * W) + y0 + H, Bt[1]), B[2] + bz * W];
      b.tri(At, Ao, Bo, col, null, null, null, 0, 1, 0); b.tri(At, Bo, Bt, col, null, null, null, 0, 1, 0);
      b.tri(A, B, Bt, col, null, null, null, -ax, 0, -az); b.tri(A, Bt, At, col, null, null, null, -ax, 0, -az);
    }
  }

  finishRoads(chunks, marks) {
    const mat = (o) => this.roadShader(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 - o, polygonOffsetUnits: -2 - o * 2 }));
    const order = { path: 0, track: 0, foot: 1, steps: 1, plaza: 2, road: 3 };
    for (const k in chunks) chunks[k].meshes(mat(order[k]), { receive: true }).forEach(m => this.group.add(m));
    marks.meshes(mat(5), { receive: true }).forEach(m => this.group.add(m));
    this.curbs.meshes(this.roadShader(new THREE.MeshLambertMaterial({ vertexColors: true })), { receive: true }).forEach(m => this.group.add(m));
    this.curbs = null;

    // Pflaster: Plätze als Fläche, dann die Struktur multiplikativ über Luftbild bzw. Bodenfarbe legen
    for (const r of this.data.roads) if (r.k === 'plazaArea') this.paveArea(r);
    const paveMat = new THREE.MeshBasicMaterial({
      map: this.makePaveTexture(), transparent: true, premultipliedAlpha: true, blending: THREE.MultiplyBlending,
      depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    this.pave.meshes(paveMat, {}).forEach(m => this.group.add(m));
    this.pave = null;
  }

  // Platzfläche (OSM highway=pedestrian, area=yes) in kleine Dreiecke zerlegen, die dem Gelände folgen
  paveArea(r) {
    const toV = p => { const a = []; for (let i = 0; i < p.length; i += 2) a.push(new THREE.Vector2(p[i], p[i + 1])); return a; };
    const contour = toV(r.p), holes = (r.ho || []).map(toV);
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return; }
    const all = contour.concat(...holes);
    const y = ROAD_STYLE.plaza.y;
    const white = new THREE.Color('#ffffff');
    const emit = (a, b, c, depth) => {
      const ab = Math.hypot(a[0] - b[0], a[1] - b[1]), bc = Math.hypot(b[0] - c[0], b[1] - c[1]), ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.max(ab, bc, ca) > 4 && depth < 10) {
        // längste Kante halbieren
        if (ab >= bc && ab >= ca) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; emit(a, m, c, depth + 1); emit(m, b, c, depth + 1); }
        else if (bc >= ca) { const m = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; emit(a, b, m, depth + 1); emit(a, m, c, depth + 1); }
        else { const m = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; emit(a, b, m, depth + 1); emit(m, b, c, depth + 1); }
        return;
      }
      const P = q => [q[0], this.heightAt(q[0], q[1]) + y, q[1]];
      const pa = P(a), pb = P(b), pc = P(c);
      const uv = q => [q[0] / PAVE_TILE, q[1] / PAVE_TILE];
      this.pave.get((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3).tri(pa, pb, pc, white, uv(a), uv(b), uv(c), 0, 1, 0);
    };
    for (const f of faces) emit([all[f[0]].x, all[f[0]].y], [all[f[1]].x, all[f[1]].y], [all[f[2]].x, all[f[2]].y], 0);
  }

  // Kachelbare Textur für Granit-Kleinpflaster im Segmentbogen (PAVE_TILE Meter je Kachel). Hell = Stein,
  // dunkel = Fuge; sie wird multipliziert, damit Luftbild und Bodenfarbe erhalten bleiben.
  makePaveTexture() {
    const S = 512, rows = 20, rowH = S / rows, arcW = S / 2, arcH = rowH * 1.2;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, S, S);
    const rnd = U.rng(23);
    const arc = x => arcH * (1 - Math.cos(x / arcW * Math.PI * 2)) / 2;
    for (let j = 0; j < rows; j++) {
      // Steinbreiten einer Reihe so strecken, dass die Reihe genau eine Kachel lang ist
      const w = [];
      let sum = 0;
      while (sum < S) { const v = rowH * (0.8 + rnd() * 0.5); w.push(v); sum += v; }
      const k = S / sum;
      let x = rnd() * rowH;
      for (const wi of w) {
        const sw = wi * k, cx = x + sw / 2, cy = j * rowH + rowH / 2 + arc(cx);
        const ang = Math.atan2(arc(cx + 1) - arc(cx - 1), 2);
        const g = Math.floor(205 + rnd() * 50);
        c.fillStyle = `rgb(${g},${g},${g})`;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          c.save();
          c.translate(cx + ox, cy + oy); c.rotate(ang);
          c.beginPath();
          c.roundRect(-sw / 2 + 1.5, -rowH / 2 + 1.5, sw - 3, rowH - 3, 4);
          c.fill();
          c.restore();
        }
        x += sw;
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  // Unterteilt eine Polylinie in Abschnitte von höchstens maxLen Metern
  resample(p, maxLen) {
    const out = [p[0], p[1]];
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(l / maxLen));
      for (let s = 1; s <= n; s++) out.push(ax + (bx - ax) * s / n, az + (bz - az) * s / n);
    }
    return out;
  }

  // Gestrichelte Linie (Länge dash, Lücke gap, halbe Breite hw) entlang der Polylinie
  dashes(pts, dash, gap, hw, y, chunks, col, hf) {
    let acc = 0, on = true, startX = pts[0], startZ = pts[1];
    const emit = (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 0.05) return;
      const nx = -dz / l * hw, nz = dx / l * hw;
      const p = (x, z) => [x, (hf ? hf(x, z) : this.heightAt(x, z)) + y, z];
      const b = chunks.get(ax, az);
      const a1 = p(ax + nx, az + nz), a2 = p(ax - nx, az - nz), b1 = p(bx + nx, bz + nz), b2 = p(bx - nx, bz - nz);
      b.tri(a1, a2, b2, col, null, null, null, 0, 1, 0);
      b.tri(a1, b2, b1, col, null, null, null, 0, 1, 0);
    };
    for (let i = 2; i < pts.length; i += 2) {
      let ax = pts[i - 2], az = pts[i - 1];
      const bx = pts[i], bz = pts[i + 1];
      let segLen = Math.hypot(bx - ax, bz - az);
      while (segLen > 0) {
        const limit = on ? dash : gap;
        const take = Math.min(limit - acc, segLen);
        const t = take / segLen;
        const nx = ax + (bx - ax) * t, nz = az + (bz - az) * t;
        if (on) emit(ax, az, nx, nz);
        acc += take; segLen -= take; ax = nx; az = nz;
        if (acc >= limit - 1e-6) { acc = 0; on = !on; }
      }
    }
  }

  // ---------------- Gebäude ----------------
  // Fassadentexturen: 4 × 4 Fensterachsen (je 3,2 m breit, 3,1 m hoch) auf 1024 px.
  // color: Putz und Steinstruktur (wird mit der Wandfarbe multipliziert), lit: beleuchtete Fenster bei Nacht,
  // mask: R = Glas, G = Gewände/Rahmen (eigene Farbe statt Wandfarbe), B = Relief (Schatten in Laibung und unter Simsen)
  makeWindowTextures() {
    if (this._facadeTex) return this._facadeTex;
    const S = 1024, bay = S / 4, rnd = U.rng(5);
    const canvas = fill => { const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d'); c.fillStyle = fill; c.fillRect(0, 0, S, S); return [cv, c]; };
    const [cvC, cc] = canvas('#fff'), [cvL, cl] = canvas('#000'), [cvM, cm] = canvas('rgb(0,0,255)');
    // Putzkörnung
    const img = cc.getImageData(0, 0, S, S);
    for (let k = 0; k < img.data.length; k += 4) { const g = 246 + rnd() * 9; img.data[k] = img.data[k + 1] = img.data[k + 2] = g; }
    cc.putImageData(img, 0, 0);
    const mask = (r, g, b, x, y, w, h) => { cm.fillStyle = `rgb(${r},${g},${b})`; cm.fillRect(x, y, w, h); };
    const shade = (x, y, w, h, from, to, vertical = true) => { // Relief als Verlauf im B-Kanal
      const d = cm.getImageData(x, y, w, h);
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const t = vertical ? py / Math.max(1, h - 1) : px / Math.max(1, w - 1), k = (py * w + px) * 4 + 2;
        d.data[k] = Math.round(d.data[k] * (1 - (from + (to - from) * t)));
      }
      cm.putImageData(d, x, y);
    };
    // Höhenfeld für die Normal Map (Putz 0,5, Gewände höher, Fensteröffnung tief) und Maske der Fensteröffnung
    const HF = new Float32Array(S * S).fill(0.5), REC = new Uint8Array(S * S);
    const hRect = (x, y, w, h, v) => { for (let py = Math.max(0, y); py < Math.min(S, y + h); py++) HF.fill(v, py * S + Math.max(0, x), py * S + Math.min(S, x + w)); };
    const rRect = (x, y, w, h) => { for (let py = Math.max(0, y); py < Math.min(S, y + h); py++) REC.fill(255, py * S + Math.max(0, x), py * S + Math.min(S, x + w)); };
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x0 = i * bay, fb = (j + 1) * bay;                 // linker Rand der Achse, Unterkante des Geschosses
      const wx = x0 + 80, ww = 96, wy = fb - 214, wh = 138;   // Fensteröffnung (1,2 × 1,7 m, Brüstung 0,9 m)
      const g = 14, sill = 11;
      // Gewände (Steinrahmen) mit Sturz und Fensterbank
      mask(0, 255, 255, wx - g, wy - g - 6, ww + 2 * g, wh + g + 6);
      mask(0, 255, 255, wx - g - 7, wy + wh, ww + 2 * g + 14, sill);
      // Glas, Flügelrahmen, Mittelpfosten und Kämpfer
      mask(255, 0, 255, wx, wy, ww, wh);
      const fr = 6;
      mask(0, 255, 255, wx, wy, ww, fr); mask(0, 255, 255, wx, wy + wh - fr, ww, fr);
      mask(0, 255, 255, wx, wy, fr, wh); mask(0, 255, 255, wx + ww - fr, wy, fr, wh);
      mask(0, 255, 255, wx + ww / 2 - 3, wy, 6, wh);
      mask(0, 255, 255, wx, wy + Math.round(wh * 0.3), ww, 5);
      // Relief: Gewände steht 2 cm vor, Fensterbank 4 cm, die Öffnung liegt tief (Glas und Flügel)
      hRect(wx - g, wy - g - 6, ww + 2 * g, wh + g + 6, 0.62);
      hRect(wx - g - 7, wy + wh, ww + 2 * g + 14, sill, 0.7);
      hRect(wx, wy, ww, wh, 0.04);
      rRect(wx, wy, ww, wh);
      // Tiefe: Schatten der Laibung oben und links, unter der Fensterbank, leicht unter dem Sturz
      shade(wx, wy, ww, 22, 0.5, 0);
      shade(wx, wy, 12, wh, 0.3, 0, false);
      shade(wx - g - 7, wy + wh + sill, ww + 2 * g + 14, 16, 0.45, 0);
      shade(wx - g, wy - g - 6 - 8, ww + 2 * g, 8, 0, 0.15);
      // nachts beleuchtete Fenster
      if (rnd() < 0.42) {
        cl.fillStyle = ['#ffd27a', '#ffe2a6', '#fff0c8', '#ffc56a'][Math.floor(rnd() * 4)];
        cl.fillRect(wx + fr, wy + fr, ww - 2 * fr, wh - 2 * fr);
        cl.fillStyle = '#000'; cl.fillRect(wx + ww / 2 - 3, wy, 6, wh); cl.fillRect(wx, wy + Math.round(wh * 0.3), ww, 5);
      }
    }
    const tex = (cv, srgb) => {
      const t = new THREE.CanvasTexture(cv);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    // Putzstruktur ins Höhenfeld, leicht weichzeichnen (stabile Mipmaps), daraus die Normalen
    const nz = U.rng(77);
    for (let k = 0; k < HF.length; k++) if (HF[k] > 0.3) HF[k] += (nz() - 0.5) * 0.035;
    const HB = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += HF[((y + dy + S) % S) * S + ((x + dx + S) % S)];
      HB[y * S + x] = v / 9;
    }
    const cvN = document.createElement('canvas'); cvN.width = cvN.height = S;
    const cn = cvN.getContext('2d'), nimg = cn.createImageData(S, S);
    const cvR = document.createElement('canvas'); cvR.width = cvR.height = S;
    const cr = cvR.getContext('2d'), rimg = cr.createImageData(S, S);
    const K = 7;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const at = (a, b) => HB[((b + S) % S) * S + ((a + S) % S)];
      // Leinwand-y läuft nach unten, Textur-v nach oben (flipY)
      let nx = -(at(x + 1, y) - at(x - 1, y)) * K, ny = (at(x, y + 1) - at(x, y - 1)) * K, nzz = 1;
      const l = Math.hypot(nx, ny, nzz); nx /= l; ny /= l; nzz /= l;
      const k = (y * S + x) * 4;
      nimg.data[k] = Math.round((nx * 0.5 + 0.5) * 255); nimg.data[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nimg.data[k + 2] = Math.round((nzz * 0.5 + 0.5) * 255); nimg.data[k + 3] = 255;
      rimg.data[k] = rimg.data[k + 1] = rimg.data[k + 2] = REC[y * S + x]; rimg.data[k + 3] = 255;
    }
    cn.putImageData(nimg, 0, 0); cr.putImageData(rimg, 0, 0);
    this._facadeTex = { color: tex(cvC, true), lit: tex(cvL, true), mask: tex(cvM, false), normal: tex(cvN, false), depth: tex(cvR, false) };
    return this._facadeTex;
  }

  // Shader-Ergänzung für Hauswände (Innenstadt und Umland): Gewände in eigener Farbe, Glas mit Spiegelung von Himmel
  // und Gegenüber, Vorhänge, Sockel, Geschossgesimse, Verwitterung, Kontaktschatten am Boden und Schaufenster in der
  // Altstadt. Die Wand-UV ist (Länge / 12,8 m, Höhe über Grund / 12,4 m). Mit Wandprofil (aProfA/B/C, siehe Bucket)
  // werden Achsen auf die Wandbreite und Geschosse bis zur Traufe eingepasst, und es erscheinen nur Fenster, die ganz
  // in die Wand passen (nicht unter Dach- oder Giebelkante, nicht im Boden, nicht über die Hausecke). Stil 1/2:
  // Landhaus mit eigenen Fenstern, Faschen, Läden, Haustür, Sandsteinsockel, Eckquadern und Fachwerk.
  facadeShader(mat, tex) {
    const A = ALTSTADT_BOX;
    const detail = this.makeDetailTexture();
    mat.normalMap = tex.normal;
    mat.normalScale = new THREE.Vector2(1, 1);
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, ATMO.uniforms);
      sh.uniforms.facadeMask = { value: tex.mask };
      sh.uniforms.facadeDepth = { value: tex.depth };
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.shopBox = { value: new THREE.Vector4(A.minX, A.minZ, A.maxX, A.maxZ) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWNor;
          attribute vec4 aProfA, aProfB; attribute vec2 aProfC;
          flat varying vec4 vProfA, vProfB; flat varying vec2 vProfC;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWNor = normalize(mat3(modelMatrix) * objectNormal);
          vProfA = vec4(aProfA.xyz * 0.1, aProfA.w); vProfB = aProfB * 0.1; vProfC = vec2(aProfC.x * 0.1, aProfC.y);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWNor;
          flat varying vec4 vProfA, vProfB; flat varying vec2 vProfC;
          uniform sampler2D facadeMask, detailMap, facadeDepth;
          uniform vec4 shopBox;
          uniform float uNight, uWet;
          uniform vec3 uSkyTop, uSkyHorizon, uSkyGround;
          float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float fGlass = 0.0, fShop = 0.0, fCurtain = 0.0, fGlassVar = 0.0, fFlat = 0.0, fLit = 0.0, fRural = 0.0;
          vec2 fUv = vec2(0.0), fUvG = vec2(0.0);
          // Oberkante der Wand an der Stelle u (Linienzug links – First – rechts aus dem Wandprofil)
          float topAt(float u) {
            if (u < vProfA.y) return mix(vProfB.x, vProfB.y, clamp((u - vProfA.x) / max(vProfA.y - vProfA.x, 1e-3), 0.0, 1.0));
            return mix(vProfB.y, vProfB.z, clamp((u - vProfA.y) / max(vProfA.z - vProfA.y, 1e-3), 0.0, 1.0));
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 qc = floor(vColor.rgb * 255.0 + 0.5);          // gerundet, sonst flackert der Wert je Pixel
            float bh = fh(qc.rg + qc.b * 0.37);               // Zufall je Haus
            float bh2 = fh(qc.gb * 1.31 + 7.7);
            vec2 kk = vec2(bh2 < 0.3 ? 1.1 : bh2 < 0.72 ? 1.0 : 0.89, fract(bh2 * 13.7) < 0.35 ? 1.07 : fract(bh2 * 13.7) < 0.75 ? 1.0 : 0.9);
            bool hasProf = vProfA.z - vProfA.x > 0.25;
            float style = hasProf ? vProfA.w : 0.0;
            float uAl = vMapUv.x * 12.8;                        // Meter entlang der Wand (System der Wand-UV)
            float W = hasProf ? vProfA.z - vProfA.x : 1e4;      // Wandbreite
            float uLoc = hasProf ? uAl - vProfA.x : uAl;
            float base = hasProf ? vProfB.w : vWPos.y - vMapUv.y * 12.4;
            float h = vWPos.y - base;                          // Höhe über dem Boden an dieser Wand
            float eave = hasProf ? min(vProfB.x, vProfB.z) : 1e4;
            // Achsen und Geschosse an die Wand angepasst: ganze Achsen über die Wandbreite, ganze Geschosse bis zur Traufe
            float bwB = 3.2 / kk.x, fHB = 3.1 / kk.y;
            float bw = hasProf ? W / max(1.0, floor(W / bwB + 0.5)) : bwB;
            float Hs = eave - base;
            float fH = hasProf && Hs > 2.0 ? clamp(Hs / max(1.0, floor(Hs / fHB + 0.5)), 2.6, 4.2) : fHB;
            vec2 gp = vec2(uLoc / bw, h / fH);                  // fortlaufend: Achse, Geschoss
            fUv = gp * 0.25; fUvG = fUv;
            vec2 cell = floor(gp);
            vec2 loc = fract(gp) * vec2(bw, fH);              // Lage in der Achse (m)
            vec3 frameC = bh < 0.5 ? vec3(0.86, 0.84, 0.79) : bh < 0.78 ? vec3(0.56, 0.45, 0.33) : vec3(0.5, 0.5, 0.49);
            vec3 wallBase = diffuseColor.rgb;
            float glass = 0.0, frame = 0.0, relief = 1.0, reveal = 0.0;
            vec3 Vw = normalize(cameraPosition - vWPos), Nw = normalize(vWNor);
            vec3 Tw = normalize(vec3(Nw.z, 0.0, -Nw.x) + 1e-5);
            float su = dot(dFdx(vWPos), Tw) * dFdx(vMapUv.x) + dot(dFdy(vWPos), Tw) * dFdy(vMapUv.x);
            Tw *= su < 0.0 ? -1.0 : 1.0;
            vec3 vt = vec3(dot(Vw, Tw), Vw.y, max(dot(Vw, Nw), 0.12));
            bool shop = false;
            float wr = fh(cell + bh * 7.0);

            if (style > 0.5 && style < 2.5) {
              // ===== Landhaus (oberfränkisches Dorf): Fenster in Feldern, nicht streng gereiht, Haustür, Läden =====
              fRural = 1.0; fFlat = 1.0;
              float hEG = 2.8, hOG = 2.65;
              float fl = h < hEG ? 0.0 : 1.0 + floor((h - hEG) / hOG);
              float flBot = base + (fl < 0.5 ? 0.0 : hEG + (fl - 1.0) * hOG);
              float nS = max(1.0, floor(W / 3.1)), sw = W / nS;
              float s = floor(uLoc / sw);
              float wseed = fh(floor(vec2(vProfA.x, vProfB.y) * 2.0 + 0.5) * 0.137 + bh);
              float ws = fh(vec2(s * 1.7 + fl * 5.3, wseed * 19.0));
              bool attic = flBot > eave - 0.4;
              float ww = mix(0.82, 1.12, fract(bh * 5.3)), whh = mix(1.18, 1.42, fract(bh * 9.1));
              if (fl > 0.5) whh *= 0.93;
              if (attic) { ww *= 0.72; whh = 0.92; }
              float sill = attic ? 0.65 : 0.88;
              bool isDoor = style > 1.5 && fl < 0.5 && abs(s - vProfC.y) < 0.5;
              float cx = (s + 0.5) * sw + (isDoor ? 0.0 : (fh(vec2(s, wseed * 7.0)) - 0.5) * min(0.5, sw * 0.16));
              vec2 wsz = isDoor ? vec2(1.05, 2.15) : vec2(ww, whh);
              float rl = cx - wsz.x * 0.5, rb = flBot + (isDoor ? 0.0 : sill);
              float rt = rb + wsz.y;
              float tp = min(topAt(vProfA.x + rl - 0.2), topAt(vProfA.x + rl + wsz.x + 0.2));
              bool ok = (isDoor || ws > 0.16) && rl > 0.35 && rl + wsz.x < W - 0.35 && rt < tp - 0.3 && rb > vProfC.x + 0.2 && W > 1.6;
              vec2 q = vec2(uLoc - rl, vWPos.y - rb);
              vec3 fasche = fract(bh * 3.3) < 0.5 ? wallBase * 1.12 : vec3(0.62, 0.55, 0.45) * sampledDiffuseColor.rgb;
              if (ok) {
                bool inWin = q.x > 0.0 && q.x < wsz.x && q.y > 0.0 && q.y < wsz.y;
                // Faschen (Putzband) um das Fenster, Sohlbank aus Sandstein darunter
                float fb = 0.13;
                if (!inWin && q.x > -fb && q.x < wsz.x + fb && q.y > -fb && q.y < wsz.y + fb) { diffuseColor.rgb = fasche; relief = 0.93; }
                if (!isDoor && q.y < 0.0 && q.y > -0.08 && q.x > -0.18 && q.x < wsz.x + 0.18) { diffuseColor.rgb = vec3(0.6, 0.55, 0.46) * sampledDiffuseColor.rgb; relief = 0.85; }
                // Fensterläden (an knapp der Hälfte der Häuser)
                if (!isDoor && !attic && fract(bh * 2.3) < 0.45 && q.y > 0.0 && q.y < wsz.y && ((q.x < -fb && q.x > -fb - wsz.x * 0.5) || (q.x > wsz.x + fb && q.x < wsz.x + fb + wsz.x * 0.5))) {
                  vec3 shC = fract(bh * 7.7) < 0.35 ? vec3(0.16, 0.26, 0.17) : fract(bh * 7.7) < 0.65 ? vec3(0.3, 0.19, 0.11) : vec3(0.3, 0.35, 0.4);
                  float lp = q.y / 0.07, louv = mix(0.5, step(0.5, fract(lp)), 1.0 - smoothstep(0.25, 0.6, fwidth(lp)));
                  diffuseColor.rgb = shC * (0.85 + 0.25 * louv);
                  relief = 0.8 + 0.2 * louv;
                }
                if (inWin && isDoor) {
                  // Haustür: Holz in Hausfarbe, zwei Füllungen, oben ein kleines Fenster
                  vec3 dC = fract(bh * 6.1) < 0.4 ? vec3(0.28, 0.16, 0.08) : fract(bh * 6.1) < 0.7 ? vec3(0.13, 0.22, 0.15) : vec3(0.42, 0.12, 0.08);
                  diffuseColor.rgb = dC;
                  float px = abs(q.x - wsz.x * 0.5);
                  float panel = step(0.12, q.x) * step(q.x, wsz.x - 0.12) * step(0.2, q.y) * step(q.y, 1.5) * step(0.06, px);
                  relief = 1.0 - 0.25 * panel * (1.0 - step(0.03, min(min(q.x - 0.12, wsz.x - 0.12 - q.x), min(q.y - 0.2, 1.5 - q.y))));
                  if (q.y > 1.62 && q.y < 2.0 && q.x > 0.18 && q.x < wsz.x - 0.18) { glass = 1.0; }
                  if (q.y < 0.04) relief = 0.7;
                } else if (inWin) {
                  // Fenster mit Tiefe: Glas 14 cm hinter der Wand, Laibung sichtbar
                  vec2 q2 = q - vt.xy / vt.z * 0.14;
                  if (q2.x < 0.0 || q2.x > wsz.x || q2.y < 0.0 || q2.y > wsz.y) { reveal = 1.0; }
                  else {
                    float fr = 0.06;
                    float bord = step(min(min(q2.x, wsz.x - q2.x), min(q2.y, wsz.y - q2.y)), fr);
                    float mull = step(abs(q2.x - wsz.x * 0.5), 0.03);
                    float trans = step(abs(q2.y - wsz.y * 0.64), 0.03);
                    frame = max(bord, max(mull, trans));
                    frame = mix(frame, 0.32, smoothstep(0.02, 0.05, fwidth(q2.x)));   // aus der Ferne gemittelt
                    glass = 1.0 - frame;
                    frameC = fract(bh * 4.9) < 0.75 ? vec3(0.9, 0.9, 0.87) : vec3(0.32, 0.2, 0.12);
                    fLit = glass * step(0.5, fh(vec2(s, fl) + bh * 3.0));
                  }
                }
              }
              // Sandsteinsockel mit Fugen
              float sock = mix(0.45, 0.85, fract(bh * 8.3));
              if (h < sock && glass < 0.5 && !(isDoor && ok && q.x > 0.0 && q.x < wsz.x)) {
                vec3 sC = fract(bh * 2.9) < 0.6 ? vec3(0.66, 0.58, 0.44) : vec3(0.55, 0.36, 0.28);
                float joint = step(fract(h / 0.3), 0.06) + step(fract((uLoc + step(0.5, fract(h / 0.6)) * 0.3) / 0.6), 0.04);
                diffuseColor.rgb = sC * sampledDiffuseColor.rgb * (1.0 - 0.35 * min(joint, 1.0));
                frame = 0.0; reveal = 0.0;
              }
              // Eckquader aus Sandstein an manchen Häusern
              if (fract(bh * 4.1) < 0.3 && h > sock && h < eave - base) {
                float bi = floor(h / 0.34), wq = mod(bi, 2.0) < 0.5 ? 0.45 : 0.28;
                if (uLoc < wq || uLoc > W - wq) diffuseColor.rgb = vec3(0.68, 0.6, 0.47) * sampledDiffuseColor.rgb * (1.0 - 0.3 * step(fract(h / 0.34), 0.05));
              }
              // Fachwerk im Obergeschoss und Giebel (gut ein Drittel der Häuser): Ständer an den Feldern und neben den
              // Fenstern, Riegel an Schwelle, Brüstung, Sturz und Rähm, Streben in fensterlosen Feldern
              if (fract(bh2 * 7.31) < 0.38 && fl > 0.5 && glass < 0.5 && reveal < 0.5) {
                float ly = vWPos.y - flBot, xs = uLoc - s * sw, b2 = 0.09;
                float beam = step(ly, 0.18) + step(hOG - 0.12, ly) + step(abs(ly - (sill - 0.05)), b2);
                beam += step(abs(ly - (sill + whh + 0.06)), b2) + step(xs, b2) + step(sw - b2, xs);
                if (ok) beam += step(abs(uLoc - (rl - 0.17)), b2) + step(abs(uLoc - (rl + wsz.x + 0.17)), b2);
                else beam += step(abs(xs * (hOG / sw) - ly), b2 * 1.4) + step(abs((sw - xs) * (hOG / sw) - ly), b2 * 1.4);
                vec3 beamC = (fract(bh * 3.7) < 0.6 ? vec3(0.12, 0.07, 0.04) : vec3(0.28, 0.085, 0.055)) * sampledDiffuseColor.rgb;
                if (frame < 0.5) diffuseColor.rgb = mix(vec3(0.88, 0.85, 0.78) * sampledDiffuseColor.rgb, beamC, min(beam, 1.0));
              }
              if (reveal > 0.5) diffuseColor.rgb = fasche * 0.55;
              diffuseColor.rgb = mix(diffuseColor.rgb, frameC * sampledDiffuseColor.rgb, frame);
            } else {
              // ===== Stadt: Fensterachsen aus der Textur, nur vollständig passende Fenster =====
              vec4 fm = texture2D(facadeMask, fUv);
              glass = fm.r; frame = fm.g; relief = fm.b;
              bool winOK = style < 2.5;
              if (hasProf) {
                float wl = (cell.x + 0.23) * bw, wrr = (cell.x + 0.77) * bw;
                float wt = base + (cell.y + 0.914) * fH, wbt = base + (cell.y + 0.254) * fH;
                float tp = min(topAt(vProfA.x + wl), topAt(vProfA.x + wrr));
                if (W < 1.7 || wl < 0.15 || wrr > W - 0.15 || wt > tp - 0.25 || wbt < vProfC.x + 0.15) winOK = false;
              }
              if (!winOK) { glass = 0.0; frame = 0.0; relief = 1.0; fFlat = 1.0; }
              // Fenstertiefe (Parallaxe): durch die Öffnung sieht man das Glas 22 cm tiefer, am Rand die Laibung
              else if (texture2D(facadeDepth, fUv).r > 0.5) {
                vec2 offM = -vt.xy / vt.z * 0.22;
                fUvG = fUv + offM / vec2(bw * 4.0, fH * 4.0);
                if (texture2D(facadeDepth, fUvG).r < 0.5) { reveal = 1.0; glass = 0.0; frame = 0.0; relief = 1.0; }
                else { vec4 fm2 = texture2D(facadeMask, fUvG); glass = fm2.r; frame = fm2.g; relief = fm2.b; }
              }
              // Schaufenster im Erdgeschoss der Altstadt
              shop = vWPos.x > shopBox.x && vWPos.x < shopBox.z && vWPos.z > shopBox.y && vWPos.z < shopBox.w && bh < 0.82 && h > -0.3 && h < 3.1 && W > 2.2;
              if (shop) {
                float door = step(0.72, fh(cell + bh * 13.0));
                float lx = fract(gp.x);
                float gx0 = door > 0.5 ? 0.33 : 0.08, gx1 = door > 0.5 ? 0.67 : 0.92, gy0 = door > 0.5 ? 0.02 : 0.5, gy1 = min(2.55, eave - base - 0.4);
                float ex = 0.025;
                float inG = step(gx0, lx) * step(lx, gx1) * step(gy0, h) * step(h, gy1);
                float inF = step(gx0 - ex, lx) * step(lx, gx1 + ex) * step(gy0 - 0.08, h) * step(h, gy1 + 0.08);
                glass = inG; frame = inF - inG; relief = 1.0 - 0.35 * inG * smoothstep(gy1 - 0.3, gy1, h); reveal = 0.0;
                fFlat = 1.0;
                frameC = vec3(0.12, 0.12, 0.13);
                diffuseColor.rgb *= 1.0 - 0.18 * step(2.65, h);
                fShop = inG;
              } else if (h < 0.45 && h > -2.5) {
                // Sockel aus Stein
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.41, 0.39) * sampledDiffuseColor.rgb, 0.75);
                glass = 0.0; frame = 0.0; relief = 1.0; reveal = 0.0; fFlat = 1.0;
              }
              if (reveal > 0.5) diffuseColor.rgb = mix(wallBase, frameC * sampledDiffuseColor.rgb, 0.5) * (0.5 + 0.18 * smoothstep(2.2, 0.9, loc.y));
              diffuseColor.rgb = mix(diffuseColor.rgb, frameC * sampledDiffuseColor.rgb, frame);
              // Geschossgesims (an etwa zwei Dritteln der Häuser), nur unterhalb der Traufe
              float fl = fract(h / fH) * fH;
              if (bh > 0.33 && h > 2.0 && !shop && vWPos.y < eave - 0.2) {
                float band = step(0.02, fl) * step(fl, 0.16);
                diffuseColor.rgb = mix(diffuseColor.rgb, frameC * 1.05, band * 0.85);
                relief *= 1.0 - 0.3 * step(0.16, fl) * (1.0 - smoothstep(0.16, 0.3, fl));
              }
            }
            // Glas: dunkel, je Fenster etwas anders; manche mit hellem Vorhang
            vec3 glassC = mix(vec3(0.035, 0.045, 0.055), vec3(0.07, 0.075, 0.07), wr);
            fCurtain = step(0.62, wr) * (shop ? 0.0 : 1.0);
            glassC = mix(glassC, vec3(0.55, 0.5, 0.42), fCurtain * 0.55);
            if (shop) glassC = mix(vec3(0.03, 0.03, 0.035), mix(vec3(0.2, 0.17, 0.13), vec3(0.14, 0.15, 0.17), wr), smoothstep(0.6, 2.5, h) * 0.8);
            diffuseColor.rgb = mix(diffuseColor.rgb, glassC, glass);
            fGlass = glass; fGlassVar = fh(cell * 1.7 + bh * 3.0);
            // Putz: großflächige Flecken und senkrechte Schmutzfahnen
            vec2 wp = vec2(vWPos.x + vWPos.z, vWPos.y);
            float big = texture2D(detailMap, wp * 0.045).r;
            float streak = texture2D(detailMap, vec2(wp.x * 0.55, wp.y * 0.02)).r;
            float grain = texture2D(detailMap, wp * 0.9).r;
            diffuseColor.rgb *= mix(1.0, (0.9 + 0.2 * big) * (1.0 - 0.12 * smoothstep(0.45, 0.8, streak)) * (1.0 + (grain - 0.5) * 0.12 * fRural), 1.0 - glass);
            // Kontaktschatten am Boden und Relief (die Normal Map übernimmt die Kanten, daher schwächer)
            diffuseColor.rgb *= mix(1.0, relief, 0.6) * mix(0.62, 1.0, smoothstep(-0.3, 1.6, h));
            // Regen dunkelt Putz und Stein
            diffuseColor.rgb *= 1.0 - 0.22 * uWet * (1.0 - glass);
          }`)
        .replace('#include <opaque_fragment>', `
          {
            // Spiegelung im Glas: Himmel oben, Häuser und Straße unten (Fresnel, nachts schwach)
            vec3 V = normalize(vWPos - cameraPosition);
            vec3 N = normalize(vWNor);
            vec3 R = reflect(V, N);
            float fres = 0.08 + 0.92 * pow(1.0 - max(dot(-V, N), 0.0), 4.0);
            vec3 sky = R.y > 0.0 ? mix(uSkyHorizon, uSkyTop, pow(R.y, 0.6)) : mix(uSkyHorizon * 0.45, uSkyGround * 0.35, clamp(-R.y * 3.0, 0.0, 1.0));
            float k = fGlass * (0.12 + 0.55 * fres) * (1.0 - uNight * 0.85) * (1.0 - fCurtain * 0.5) * (1.0 - fShop * 0.45);
            sky = mix(sky, uSkyGround * 0.6, fGlassVar * 0.6);
            outgoingLight = mix(outgoingLight, sky, k);
            float hb = vWPos.y - vProfB.w;
            outgoingLight += vec3(1.0, 0.74, 0.45) * 0.085 * uNight * fShop * (0.5 + 0.5 * fGlassVar) * (0.6 + 0.4 * smoothstep(0.5, 2.5, hb));
            // nachts: Widerschein der Straßenlaternen unten an den Fassaden; erleuchtete Fenster der Landhäuser
            outgoingLight += diffuseColor.rgb * vec3(1.0, 0.58, 0.26) * uNight * 0.14 * (1.0 - smoothstep(0.0, 8.0, hb)) * (1.0 - fGlass);
            outgoingLight += vec3(1.0, 0.78, 0.48) * 0.55 * uNight * fLit * (1.0 - fCurtain * 0.3);
          }
          #include <opaque_fragment>`)
        .replace('#include <normal_fragment_maps>', `
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 mapN = texture2D(normalMap, fUv).xyz * 2.0 - 1.0;
            mapN.xy *= normalScale;
            normal = normalize(tbn * mapN);
            normal = normalize(mix(normal, nonPerturbedNormal, fFlat));
          #endif`)
        .replace('#include <emissivemap_fragment>', `
          #ifdef USE_EMISSIVEMAP
            totalEmissiveRadiance *= texture2D(emissiveMap, fUvG).rgb * (1.0 - fFlat) * step(0.5, fGlass) * (1.0 - fRural);
          #endif`);
    };
    mat.customProgramCacheKey = () => 'facade';
  }

  // Fassadenfarbe nach OSM-Angaben, Gebäudetyp und Lage (x, z: Mitte des Hauses)
  wallColorHex(b, plainType, rnd, x, z) {
    if (b.c && (b.c[0] === '#' || THREE.Color.NAMES[b.c.toLowerCase()] !== undefined)) return b.c.toLowerCase();
    if (plainType) return '#a7a39a';
    if (/church|chapel|cathedral/.test(b.t)) return '#d3c7ad';
    if (b.t === 'castle') return '#d8ccae';
    if (/industrial|warehouse|retail|supermarket/.test(b.t)) return '#c5c1b7';
    if (x !== undefined) for (const l of LANDMARK_FACADES) if (Math.hypot(l.x - x, l.z - z) < 3) return l.c;
    const pal = this.facadePalette(x, z);
    return pal[Math.floor(rnd() * pal.length)];
  }

  // Palette nach der nächsten benannten Straße: Gründerzeitstraßen, sonst Altstadt oder übrige Stadt
  facadePalette(x, z) {
    if (x === undefined) return FACADES;
    const r = this.nearestRoad(x, z, 35, s => !!s.n && s.k !== 'path' && s.k !== 'track');
    if (r && GRUENDERZEIT_STREETS.has(r.seg.n)) return FACADES_GRUENDERZEIT;
    const A = ALTSTADT_BOX;
    if (x > A.minX && x < A.maxX && z > A.minZ && z < A.maxZ) return FACADES_ALTSTADT;
    return FACADES;
  }

  buildBuildings() {
    const tex = this.makeWindowTextures();
    const walls = new Chunks(), plain = new Chunks();
    const rnd = U.rng(42);
    const BAY_W = 3.2 * 4, BAY_H = 3.1 * 4;
    this.buildingList = [];
    const photoRoofs = new Map();             // Kachel -> Dachflächen mit Luftbild
    const photoCol = new THREE.Color(ORTHO_TINT);
    // Dachziel an einer Stelle: mit Luftbild das Foto der Kachel, sonst der einfarbige Topf
    const roofTarget = (cx, cz) => {
      if (!this.ortho) return { b: plain.get(cx, cz) };
      const ti = this.tileAt(cx, cz);
      if (!photoRoofs.has(ti)) photoRoofs.set(ti, new Bucket());
      return { b: photoRoofs.get(ti), uv: (x, z) => this.orthoUV(ti, x, z) };
    };

    // Echte 3D-Gebäude (LoD2), wenn vorhanden und zum Gelände passend; OSM-Häuser füllen nur noch Lücken
    const L = window.COBURG_LOD2;
    this.lod2 = L && L.buildings && L.buildings.length && this.data.terrain && Math.abs(L.meta.base - this.data.terrain.base) < 0.01 ? L : null;
    if (L && !this.lod2) console.warn('LoD2-Daten passen nicht zu data/coburg.js (anderer Geländebezug) – nutze OSM-Gebäude. Bitte node tools/convert-lod2.js neu ausführen.');
    if (this.lod2) this.buildLod2({ walls, plain, roofTarget, photoCol, rnd, BAY_W, BAY_H });
    let osmBuilt = 0;

    for (const b of this.data.buildings) {
      if (this.lod2 && this.coveredByLod2(b)) continue;
      osmBuilt++;
      const rings = [b.p].concat(b.ho || []);
      const outer = b.p;
      const n = outer.length / 2;
      let minH = Infinity, maxH = -Infinity;
      for (let i = 0; i < outer.length; i += 2) {
        const h = this.heightAt0(outer[i], outer[i + 1]);
        if (h < minH) minH = h; if (h > maxH) maxH = h;
      }
      const isCanopy = b.t === 'roof';
      // Türme der Veste stehen in OSM pauschal mit 40 m drin; das ist deutlich zu hoch
      const towerName = /turm\b|turm$|tower/i.test(b.n || '') || b.t === 'tower';
      const bh = towerName && b.h >= 35 ? 26 : b.h;
      const top = Math.max(minH + bh, maxH + 2.4);
      const base = isCanopy ? top - 0.6 : minH - 2;
      const bb = U.polyBBox(outer);
      const cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
      const plainType = PLAIN_TYPES.has(b.t);
      const wallCol = U.color(this.wallColorHex(b, plainType, rnd, cx, cz), 0.1, rnd);
      let roofHex = b.rc && (b.rc[0] === '#' || THREE.Color.NAMES[b.rc.toLowerCase()] !== undefined) ? b.rc.toLowerCase()
        : b.r ? TILE_ROOFS[Math.floor(rnd() * TILE_ROOFS.length)]
        : /church|castle|chapel/.test(b.t) ? '#6e5a50' : '#7c7973';
      const roofCol = U.color(roofHex, 0.12, rnd);

      const wb = (plainType || isCanopy) ? plain.get(cx, cz) : walls.get(cx, cz);
      const pb = plain.get(cx, cz);

      // Wände
      rings.forEach((ring, ri) => {
        const area = U.polyArea(ring);
        const sgn = (area > 0 ? 1 : -1) * (ri === 0 ? 1 : -1);
        const m = ring.length / 2;
        let along = 0;
        for (let i = 0; i < m; i++) {
          const j = (i + 1) % m;
          const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
          const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
          if (len < 0.01) continue;
          const ox = sgn * dz / len, oz = -sgn * dx / len;
          const u0 = along / BAY_W, u1 = (along + len) / BAY_W;
          const v0 = (base - minH) / BAY_H, v1 = (top - minH) / BAY_H;
          along += len;
          const A0 = [ax, base, az], B0 = [bx, base, bz], B1 = [bx, top, bz], A1 = [ax, top, az];
          const gnd = Math.max(this.heightAt(ax, az), this.heightAt(bx, bz), this.heightAt((ax + bx) / 2, (az + bz) / 2));
          const pr = rectProfile(u0 * BAY_W, len, top, Math.max(gnd, minH));
          wb.tri(A0, B0, B1, wallCol, [u0, v0], [u1, v0], [u1, v1], ox, 0, oz, pr);
          wb.tri(A0, B1, A1, wallCol, [u0, v0], [u1, v1], [u0, v1], ox, 0, oz, pr);
          if (!isCanopy) {
            this.edges.push(ax, az, bx, bz);
            const e = this.edges.length / 4 - 1;
            this.edgeGrid.insert(e, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
          }
        }
      });
      if (isCanopy) {
        // Unterseite des Dachs
        this.flatRoof({ b: pb }, rings, base, roofCol, -1);
      }

      // Dach: mit Luftbild bekommt es das echte Foto von oben, sonst eine geschätzte Farbe
      const rt = roofTarget(cx, cz), rc = this.ortho ? photoCol : roofCol;
      const area = Math.abs(U.polyArea(outer));
      const isTower = towerName && area < 260 && rings.length === 1;
      if (isTower) this.pyramidRoof(rt, outer, top, this.ortho ? rc : U.color('#4f5a52', 0.1, rnd), Math.sqrt(area) * 1.1);
      else if (b.r && n === 4) this.gableRoof(rt, pb, outer, top, wallCol, rc);
      else if (!b.f && !isCanopy && rings.length === 1 && HIP_TYPES.has(b.t) && area > 25 && area < 3500 && b.h < 28 &&
        this.hipRoof(rt, outer, top, rc)) { /* Walmdach gebaut */ }
      else this.flatRoof(rt, rings, top, rc, 1);

      if (!isCanopy) {
        const rec = { p: outer, ho: b.ho, bb, top, n: b.n, t: b.t };
        this.buildingList.push(rec);
        this.polyGrid.insert(rec, bb.minX, bb.minZ, bb.maxX, bb.maxZ);
      }
    }
    if (this.lod2) console.info(`Gebäude: ${this.lod2Count} aus LoD2, ${osmBuilt} aus OSM ergänzt`);
    const wallMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: tex.color, emissive: new THREE.Color('#ffffff'), emissiveMap: tex.lit, emissiveIntensity: 0,
    });
    this.facadeShader(wallMat, tex);
    const plainMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
    this.windowMaterials.push(wallMat);
    this._buildingMats = { wall: wallMat, plain: plainMat };
    walls.meshes(wallMat, { cast: true, receive: true }).forEach(m => this.group.add(m));
    plain.meshes(plainMat, { cast: true, receive: true }).forEach(m => this.group.add(m));
    for (const [ti, bucket] of photoRoofs) {
      const g = bucket.geometry();
      if (!g) continue;
      const m = new THREE.Mesh(g, this.roofShader(new THREE.MeshLambertMaterial({ map: this.ortho[ti].tex, vertexColors: true })));
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
  }

  // Wand- und Nebengebäude-Material (auch für das Umland)
  buildingMaterials() { return this._buildingMats; }

  // ---------------- Gebäude aus LoD2 ----------------
  // Wand- und Dachflächen der amtlichen 3D-Gebäudemodelle (data/lod2.js aus tools/convert-lod2.js).
  // Das grobe EU-DEM liegt oft einige Meter neben der echten Bodenhöhe. Deshalb wird jedes Haus mit seiner echten
  // Höhe auf das Spielgelände gestellt; die Wände reichen 2 m unter das tiefste Gelände am Grundriss.
  buildLod2(K) {
    const { walls, plain, roofTarget, photoCol, rnd, BAY_W, BAY_H } = K;
    this.lod2Grid = new U.Grid(32);           // LoD2-Grundrisse, um doppelte OSM-Häuser zu erkennen
    this.landmarkLod2 = [];                   // Wahrzeichen für Details (Torbögen, Uhren, Erker in props.js)
    const flatRoofCol = U.color('#7c7973', 0, rnd);
    let count = 0;
    for (const b of this.lod2.buildings) {
      const ox = b.o[0], oz = b.o[1], v = b.v, nv = v.length / 3;
      const X = new Float64Array(nv), Y = new Float64Array(nv), Z = new Float64Array(nv);
      let maxY = 0;
      for (let i = 0; i < nv; i++) {
        X[i] = ox + v[i * 3] / 10; Y[i] = v[i * 3 + 1] / 10; Z[i] = oz + v[i * 3 + 2] / 10;
        if (Y[i] > maxY) maxY = Y[i];
      }
      if (maxY < 0.5) continue;
      // Brücken (ALKIS 53001_*): flache liegen als Platte auf der Straße (das Luftbild zeigt sie schon), hohe werden
      // gezeichnet, sind aber keine Wand, damit man über und unter ihnen durchfahren kann
      const bridge = /^53001/.test(b.k || '');
      if (bridge && maxY < 3) continue;
      // Grundriss (Ringe als [x, z, …]) und Gelände darunter
      const foot = b.f.map(poly => this.lodRings(poly).map(r => { const a = []; for (const i of r) a.push(X[i], Z[i]); return a; }))
        .filter(rings => rings[0].length >= 6);
      if (!foot.length) continue;
      let minH = Infinity, maxH = -Infinity, area = 0;
      for (const rings of foot) {
        const o = rings[0];
        area += Math.abs(U.polyArea(o));
        for (let i = 0; i < o.length; i += 2) { const h = this.heightAt0(o[i], o[i + 1]); if (h < minH) minH = h; if (h > maxH) maxH = h; }
      }
      // Auf steilem Gelände nicht ganz eingraben: mindestens 30 % der Höhe ragen über den höchsten Geländepunkt
      const y0 = Math.max(minH, maxH - maxY * 0.7), top = y0 + maxY, bottom = minH - 2;
      const WY = new Float64Array(nv), RY = new Float64Array(nv);
      for (let i = 0; i < nv; i++) { RY[i] = y0 + Y[i]; WY[i] = Y[i] <= 0.05 ? bottom : RY[i]; }

      const plainType = PLAIN_TYPES.has(b.t) || /^31001_246/.test(b.k || '') || (!b.t && area < 30 && maxY < 4.5);
      const wallCol = U.color(this.wallColorHex(b, plainType, rnd, ox, oz), 0.1, rnd);
      const roofCol = U.color(TILE_ROOFS[Math.floor(rnd() * TILE_ROOFS.length)], 0.12, rnd);
      const lm = LANDMARK_LOD2[b.n];
      const wb = plainType || (lm && lm.wall) ? plain.get(ox, oz) : walls.get(ox, oz);
      const lmWall = lm && lm.wall ? U.color(lm.wall, 0.04, rnd) : null, lmUpper = lm && lm.upper ? U.color(lm.upper.c, 0.04, rnd) : null;
      if (lm) this.landmarkLod2.push({ name: b.n, b, X, Z, RY, y0 });

      // Wände: Fenstertextur entlang der Wand, Fensterreihen ab Bodenhöhe
      for (const poly of b.w) {
        const rings = this.lodRings(poly);
        const n = this.newell(rings[0], X, WY, Z);
        if (!n) continue;
        let tx = -n[2], tz = n[0];
        const tl = Math.hypot(tx, tz);
        if (tl < 1e-3) { tx = 1; tz = 0; } else { tx /= tl; tz /= tl; }
        let d0 = Infinity;
        for (const i of rings[0]) d0 = Math.min(d0, X[i] * tx + Z[i] * tz);
        const uv = i => [(X[i] * tx + Z[i] * tz - d0) / BAY_W, (WY[i] - y0) / BAY_H];
        const p = i => [X[i], WY[i], Z[i]];
        // Wandprofil: Umriss in (u, y), Boden an fünf Stellen entlang der Wand
        const ring0 = rings[0], i0 = ring0[0], u0w = X[i0] * tx + Z[i0] * tz - d0;
        const P2 = ring0.map(i => [X[i] * tx + Z[i] * tz - d0, WY[i]]);
        let uMn = Infinity, uMx = -Infinity;
        for (const q of P2) { uMn = Math.min(uMn, q[0]); uMx = Math.max(uMx, q[0]); }
        let gnd = y0;
        for (let k = 0; k <= 4; k++) {
          const u = uMn + (uMx - uMn) * k / 4, x = X[i0] + tx * (u - u0w), z = Z[i0] + tz * (u - u0w);
          gnd = Math.max(gnd, this.heightAt(x, z));
        }
        const pr = polyProfile(P2, Math.min(gnd, y0 + 3));
        let col = lmWall || wallCol;
        if (lmUpper) { let ym = 0; for (const i of rings[0]) ym += Y[i]; if (ym / rings[0].length > lm.upper.y) col = lmUpper; }
        this.triPoly(rings, X, WY, Z, n, (i, j, k) => wb.tri(p(i), p(j), p(k), col, uv(i), uv(j), uv(k), n[0], n[1], n[2], pr));
      }
      // Dächer: Luftbild von oben (oder Ziegel- bzw. Flachdachfarbe ohne Luftbild)
      const rt = roofTarget(ox, oz);
      for (const poly of b.r) {
        const rings = this.lodRings(poly);
        const n = this.newell(rings[0], X, RY, Z);
        if (!n) continue;
        let col = this.ortho ? photoCol : n[1] > 0.97 ? flatRoofCol : roofCol, target = rt;
        // Wahrzeichen: Schiefer- oder Kupferfarbe statt Luftbild (auf steilen Hauben verschmiert das Foto)
        const part = lm && lm.parts && lm.parts.find(q => rings[0].every(i => Math.hypot(X[i] - q.x, Z[i] - q.z) < q.r && Y[i] > q.minY));
        if (part || (lm && lm.roof)) { col = U.color(part ? part.c : lm.roof, 0.03, rnd); target = { b: plain.get(ox, oz) }; }
        const p = i => [X[i], RY[i], Z[i]];
        this.triPoly(rings, X, RY, Z, n, (i, j, k) => this.roofTri(target, p(i), p(j), p(k), col, n[0], n[1], n[2]));
      }
      // Kollision und Abfragen
      for (const rings of foot) {
        if (bridge) continue;
        for (const ring of rings) {
          const m = ring.length / 2;
          for (let i = 0; i < m; i++) {
            const j = (i + 1) % m;
            const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
            if (Math.abs(ax - bx) + Math.abs(az - bz) < 0.01) continue;
            this.edges.push(ax, az, bx, bz);
            this.edgeGrid.insert(this.edges.length / 4 - 1, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
          }
        }
        const bb = U.polyBBox(rings[0]);
        const rec = { p: rings[0], ho: rings.length > 1 ? rings.slice(1) : undefined, bb, top, n: b.n, t: b.t, lod2: true };
        this.buildingList.push(rec);
        this.polyGrid.insert(rec, bb.minX, bb.minZ, bb.maxX, bb.maxZ);
        this.lod2Grid.insert(rec, bb.minX, bb.minZ, bb.maxX, bb.maxZ);
      }
      count++;
    }
    this.lod2Count = count;
  }

  // Indexliste mit -1 als Trenner -> Ringe [außen, ...Löcher]
  lodRings(poly) {
    const rings = [[]];
    for (const i of poly) { if (i < 0) rings.push([]); else rings[rings.length - 1].push(i); }
    return rings.filter((r, k) => k === 0 || r.length >= 3);
  }

  // Newell-Normale eines Rings aus Eckpunkt-Indizes (zeigt in Umlaufrichtung nach außen)
  newell(ring, X, Y, Z) {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      nx += (Y[a] - Y[b]) * (Z[a] + Z[b]);
      ny += (Z[a] - Z[b]) * (X[a] + X[b]);
      nz += (X[a] - X[b]) * (Y[a] + Y[b]);
    }
    const l = Math.hypot(nx, ny, nz);
    return l > 1e-6 ? [nx / l, ny / l, nz / l] : null;
  }

  // Zerlegt ein ebenes Vieleck im Raum in Dreiecke; emit(i, j, k) bekommt Eckpunkt-Indizes
  triPoly(rings, X, Y, Z, n, emit) {
    const outer = rings[0], m = outer.length;
    if (m < 3) return;
    // Projektionsebene: Die Achse mit dem größten Normalenanteil fällt weg
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    let PU, PV;
    if (ax >= ay && ax >= az) { PU = Z; PV = Y; } else if (ay >= az) { PU = X; PV = Z; } else { PU = X; PV = Y; }
    if (rings.length === 1) {
      if (m === 3) { emit(outer[0], outer[1], outer[2]); return; }
      // konvexe Vielecke (die meisten Wände und Dachflächen) als Fächer
      let sign = 0, convex = true;
      for (let k = 0; k < m && convex; k++) {
        const a = outer[k], b = outer[(k + 1) % m], c = outer[(k + 2) % m];
        const cr = (PU[b] - PU[a]) * (PV[c] - PV[b]) - (PV[b] - PV[a]) * (PU[c] - PU[b]);
        if (Math.abs(cr) < 1e-6) continue;
        const s = cr > 0 ? 1 : -1;
        if (!sign) sign = s; else if (s !== sign) convex = false;
      }
      if (convex) { for (let k = 1; k < m - 1; k++) emit(outer[0], outer[k], outer[k + 1]); return; }
    }
    const all = [];
    const vecs = rings.map(r => {
      const q = r.slice();
      // three.js entfernt doppelte Endpunkte selbst; vorher entfernen, damit die Indizes stimmen
      while (q.length > 3 && PU[q[0]] === PU[q[q.length - 1]] && PV[q[0]] === PV[q[q.length - 1]]) q.pop();
      return q.map(i => { all.push(i); return new THREE.Vector2(PU[i], PV[i]); });
    });
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(vecs[0], vecs.slice(1)); } catch (e) { return; }
    for (const f of faces) {
      const a = all[f[0]], b = all[f[1]], c = all[f[2]];
      if (a !== undefined && b !== undefined && c !== undefined) emit(a, b, c);
    }
  }

  // Ist ein OSM-Haus schon durch LoD2-Grundrisse abgedeckt? (Stichproben im Grundriss)
  coveredByLod2(b) {
    const bb = U.polyBBox(b.p);
    let tot = 0, hit = 0;
    const test = (x, z) => {
      tot++;
      const list = this.lod2Grid.query(x, z, 0, this._tmp);
      for (const r of list) {
        if (U.pointInPoly(x, z, r.p) && !(r.ho && r.ho.some(h => U.pointInPoly(x, z, h)))) { hit++; return; }
      }
    };
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = bb.minX + (bb.maxX - bb.minX) * (i + 0.5) / 4, z = bb.minZ + (bb.maxZ - bb.minZ) * (j + 0.5) / 4;
      if (U.pointInPoly(x, z, b.p)) test(x, z);
    }
    if (!tot) test((bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2);
    return hit >= tot * 0.4;
  }

  // Dreieck für ein Dach; mit Luftbild bekommen die Ecken Fotokoordinaten (Draufsicht)
  roofTri(rt, a, b, c, col, rx, ry, rz) {
    if (rt.uv) rt.b.tri(a, b, c, col, rt.uv(a[0], a[2]), rt.uv(b[0], b[2]), rt.uv(c[0], c[2]), rx, ry, rz);
    else rt.b.tri(a, b, c, col, null, null, null, rx, ry, rz);
  }

  // Walmdach: Grundriss nach innen versetzen und anheben. Gelingt das nicht sauber, gibt es false zurück.
  hipRoof(rt, ring, top, col) {
    const n = ring.length / 2;
    if (n > 40) return false;
    const A = U.polyArea(ring), s = A > 0 ? 1 : -1;
    const P = i => [ring[((i + n) % n) * 2], ring[((i + n) % n) * 2 + 1]];
    const dir = i => { const a = P(i), b = P(i + 1); const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    for (const d of [4.5, 3.6, 2.8, 2.1, 1.5]) {
      const q = [];
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const p = P(i), e1 = dir(i - 1), e2 = dir(i);
        const n1 = [-s * e1[1], s * e1[0]], n2 = [-s * e2[1], s * e2[0]]; // nach innen
        const p1 = [p[0] + n1[0] * d, p[1] + n1[1] * d], p2 = [p[0] + n2[0] * d, p[1] + n2[1] * d];
        const cr = cross(e1, e2);
        let v;
        if (Math.abs(cr) < 0.08) v = p2;
        else {
          const t = cross([p2[0] - p1[0], p2[1] - p1[1]], e2) / cr;
          v = [p1[0] + e1[0] * t, p1[1] + e1[1] * t];
        }
        if (Math.hypot(v[0] - p[0], v[1] - p[1]) > d * 3) ok = false;
        q.push(v);
      }
      if (!ok) continue;
      const flatQ = q.flat();
      const Aq = U.polyArea(flatQ);
      if (Math.sign(Aq) !== s || Math.abs(Aq) < Math.abs(A) * 0.06) continue;
      // keine umgeklappten Kanten
      for (let i = 0; i < n && ok; i++) {
        const a = q[i], b = q[(i + 1) % n], e = dir(i);
        if ((b[0] - a[0]) * e[0] + (b[1] - a[1]) * e[1] <= 0) ok = false;
      }
      // keine Selbstüberschneidung
      for (let i = 0; i < n && ok; i++) for (let j = i + 2; j < n && ok; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segCross(q[i], q[(i + 1) % n], q[j], q[(j + 1) % n])) ok = false;
      }
      if (!ok) continue;
      const rise = d * 0.85, y2 = top + rise;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = P(i), b = P(j), e = dir(i);
        const ox = s * e[1], oz = -s * e[0];
        this.roofTri(rt, [a[0], top, a[1]], [b[0], top, b[1]], [q[j][0], y2, q[j][1]], col, ox, 0.8, oz);
        this.roofTri(rt, [a[0], top, a[1]], [q[j][0], y2, q[j][1]], [q[i][0], y2, q[i][1]], col, ox, 0.8, oz);
      }
      this.flatRoof(rt, [flatQ], y2, col, 1);
      return true;
    }
    return false;
  }

  // Spitzdach (Turmhelm) mit der Spitze über dem Schwerpunkt
  pyramidRoof(rt, ring, top, col, rise) {
    const n = ring.length / 2;
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += ring[i * 2]; cz += ring[i * 2 + 1]; }
    cx /= n; cz /= n;
    const apex = [cx, top + rise, cz];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = [ring[i * 2], top, ring[i * 2 + 1]], b = [ring[j * 2], top, ring[j * 2 + 1]];
      this.roofTri(rt, a, b, apex, col, (a[0] + b[0]) / 2 - cx, 0.4, (a[2] + b[2]) / 2 - cz);
    }
  }

  flatRoof(rt, rings, y, col, dir) {
    const toV = r => { const a = []; for (let i = 0; i < r.length; i += 2) a.push(new THREE.Vector2(r[i], r[i + 1])); return a; };
    const contour = toV(rings[0]);
    const holes = rings.slice(1).map(toV);
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return; }
    const all = contour.concat(...holes);
    for (const f of faces) {
      const a = all[f[0]], b = all[f[1]], c = all[f[2]];
      if (!a || !b || !c) continue;
      this.roofTri(rt, [a.x, y, a.y], [b.x, y, b.y], [c.x, y, c.y], col, 0, dir, 0);
    }
  }

  // Quader (z. B. Schornstein, Vordach, Stufe) als Dreiecke in einen Topf: Mitte unten (x, y, z), Breite w (entlang
  // der Richtung ang), Höhe h, Tiefe d
  boxTris(bucket, x, y, z, w, h, d, ang, col) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u, v, k) => [x + ca * u - sa * k, y + v, z + sa * u + ca * k];
    const hw = w / 2, hd = d / 2;
    const c = [P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd), P(-hw, 0, hd), P(-hw, h, -hd), P(hw, h, -hd), P(hw, h, hd), P(-hw, h, hd)];
    const quad = (a, b, cc, dd, nx, ny, nz) => { bucket.tri(c[a], c[b], c[cc], col, null, null, null, nx, ny, nz); bucket.tri(c[a], c[cc], c[dd], col, null, null, null, nx, ny, nz); };
    quad(4, 5, 6, 7, 0, 1, 0); quad(0, 1, 2, 3, 0, -1, 0);
    quad(0, 1, 5, 4, sa, 0, -ca); quad(2, 3, 7, 6, -sa, 0, ca);
    quad(1, 2, 6, 5, ca, 0, sa); quad(3, 0, 4, 7, -ca, 0, -sa);
  }

  // Satteldach; die Dachflächen kommen nach rt, die Giebelwände nach wallBucket
  gableRoof(rt, wallBucket, p, top, wallCol, roofCol) {
    const P = i => [p[(i % 4) * 2], p[(i % 4) * 2 + 1]];
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Firstrichtung entlang der längeren Seite
    let s = len(P(0), P(1)) >= len(P(1), P(2)) ? 0 : 1;
    const p0 = P(s), p1 = P(s + 1), p2 = P(s + 2), p3 = P(s + 3);
    const shortLen = (len(p1, p2) + len(p3, p0)) / 2;
    const ridgeH = top + Math.min(shortLen * 0.42, 7);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const r0 = mid(p3, p0), r1 = mid(p1, p2);
    const cx = (p0[0] + p1[0] + p2[0] + p3[0]) / 4, cz = (p0[1] + p1[1] + p2[1] + p3[1]) / 4;
    const v = (q, y) => [q[0], y, q[1]];
    const face = (a, b, c, col) => {
      // Normale nach außen und oben
      const mx = (a[0] + b[0] + c[0]) / 3 - cx, mz = (a[2] + b[2] + c[2]) / 3 - cz;
      this.roofTri(rt, a, b, c, col, mx, 0.5, mz);
    };
    face(v(p0, top), v(p1, top), v(r1, ridgeH), roofCol);
    face(v(p0, top), v(r1, ridgeH), v(r0, ridgeH), roofCol);
    face(v(p2, top), v(p3, top), v(r0, ridgeH), roofCol);
    face(v(p2, top), v(r0, ridgeH), v(r1, ridgeH), roofCol);
    // Giebel
    const gab = (a, b, r) => {
      const ox = (a[0] + b[0]) / 2 - cx, oz = (a[1] + b[1]) / 2 - cz;
      wallBucket.tri(v(a, top), v(b, top), v(r, ridgeH), wallCol, null, null, null, ox, 0, oz);
    };
    gab(p1, p2, r1);
    gab(p3, p0, r0);
  }

  // ---------------- Bäume ----------------
  buildTrees() {
    const pts = [];
    const d = this.data;
    const wet = (x, z) => this.water && this.water.carveAt(x, z) > 0; // keine Bäume im Wasser
    for (let i = 0; i < d.trees.length; i += 2) if (!wet(d.trees[i], d.trees[i + 1])) pts.push([d.trees[i], d.trees[i + 1], 0]);
    const keep = (x, z) => (!this.region || this.inCoreRect(x, z)) && !wet(x, z); // außerhalb pflanzt das Umland
    const DENSITY = { forest: 1 / 70, park: 1 / 500, cemetery: 1 / 300, allotments: 1 / 600, meadow: 1 / 2500, residential: 1 / 1800 };
    let budget = 16000;
    for (const a of d.areas) {
      const dens = DENSITY[a.k];
      if (!dens) continue;
      const area = Math.abs(U.polyArea(a.p));
      const count = Math.min(Math.round(area * dens), 7000, budget);
      const bb = U.polyBBox(a.p);
      const rnd = U.rng(U.hashStr(a.k + a.p[0] + ',' + a.p[1]));
      let made = 0;
      for (let tries = 0; made < count && tries < count * 4; tries++) {
        const x = bb.minX + rnd() * (bb.maxX - bb.minX), z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
        if (!keep(x, z) || !U.pointInPoly(x, z, a.p)) continue;
        if (a.ho && a.ho.some(h => U.pointInPoly(x, z, h))) continue;
        if (this.insideBuilding(x, z, 1.5) || this.nearRoad(x, z, 1.2)) continue;
        pts.push([x, z, a.k === 'forest' && rnd() < 0.45 ? 1 : 0]);
        made++;
      }
      budget -= made;
      if (budget <= 0) break;
    }

    const TA = treeAssets(1, this.renderer);
    this.leafShader(TA.leafMat);
    const trunkGeo = TA.trunk, pineGeo = TA.pine, trunkMat = TA.trunkMat, leafMat = TA.leafMat;
    const byChunk = new Map();
    const rnd = U.rng(77);
    for (const t of pts) {
      const k = Math.floor(t[0] / CHUNK) + ',' + Math.floor(t[1] / CHUNK);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(t);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const greens = ['#5a8a3a', '#4b7a33', '#679845', '#557d38', '#77994a', '#43703a', '#6e8f3f'];
    for (const list of byChunk.values()) {
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      // drei Kronenformen, je Baum zufällig
      const kind = list.map(t => t[2] ? -1 : Math.floor(rnd() * TA.crowns.length));
      const lms = TA.crowns.map((geo, v) => { const c = kind.filter(k => k === v).length; return c ? new THREE.InstancedMesh(geo, leafMat, c) : null; });
      const lcount = TA.crowns.map(() => 0);
      const pines = list.filter(t => t[2]);
      const pm = pines.length ? new THREE.InstancedMesh(pineGeo, leafMat, pines.length) : null;
      let pi = 0;
      list.forEach((t, i) => {
        const s = 0.7 + rnd() * 0.65;
        const y = this.heightAt(t[0], t[1]) - 0.2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
        ps.set(t[0], y, t[1]); sc.set(s, s * (0.85 + rnd() * 0.3), s);
        m4.compose(ps, q, sc);
        trunks.setMatrixAt(i, m4);
        const col = new THREE.Color(t[2] ? '#3f6634' : greens[Math.floor(rnd() * greens.length)]).multiplyScalar(0.85 + rnd() * 0.3);
        if (t[2]) { pm.setMatrixAt(pi, m4); pm.setColorAt(pi++, col); }
        else { const lm = lms[kind[i]], li = lcount[kind[i]]++; lm.setMatrixAt(li, m4); lm.setColorAt(li, col); }
        this.trees.push(t[0], t[1], 0.35 * s);
        const ti = this.trees.length / 3 - 1;
        this.treeGrid.insert(ti, t[0] - 1, t[1] - 1, t[0] + 1, t[1] + 1);
      });
      for (const m of [trunks, pm, ...lms]) {
        if (!m) continue;
        m.castShadow = true; m.receiveShadow = true;
        m.computeBoundingSphere();
        this.group.add(m);
      }
      lms.forEach((m, v) => { if (m) this.addTreeLod(m, TA.crowns[v], TA.crownsFar[v], list); });
    }
  }

  // ---------------- Detailstufen der Bäume ----------------
  // Laubkronen nah mit Blattkarten, ab ≈ 230 m (Abstand zum Rechteck der Gruppe) als grobe Hülle
  addTreeLod(m, near, far, pts) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    const e = { m, near, far, minX, minZ, maxX, maxZ };
    (this.treeLod || (this.treeLod = [])).push(e);
    m.geometry = far;
    return e;
  }
  removeTreeLod(m) { if (this.treeLod) this.treeLod = this.treeLod.filter(e => e.m !== m); }
  updateTreeLod(x, z) {
    for (const e of this.treeLod || []) {
      const dx = Math.max(e.minX - x, 0, x - e.maxX), dz = Math.max(e.minZ - z, 0, z - e.maxZ), d = Math.hypot(dx, dz);
      const nearNow = e.m.geometry === e.near;
      if (!nearNow && d < 220) e.m.geometry = e.near;
      else if (nearNow && d > 250) e.m.geometry = e.far;
    }
  }

  // ---------------- Stadtplan ----------------
  paintMap() {
    const B = this.bounds, S = 0.5; // Pixel pro Meter
    const W = Math.ceil((B.maxX - B.minX) * S), H = Math.ceil((B.maxZ - B.minZ) * S);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ebe6dc'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(S, 0, 0, S, -B.minX * S, -B.minZ * S);
    const d = this.data;
    const order = Object.keys(MAP_STYLE);
    for (const a of d.areas.slice().sort((x, y) => order.indexOf(x.k) - order.indexOf(y.k))) {
      ctx.fillStyle = MAP_STYLE[a.k]; this.pathPoly(ctx, a.p, a.ho); ctx.fill('evenodd');
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = MAP_STYLE.water;
    for (const w of d.waterways) { ctx.lineWidth = Math.max(w.w, 3); this.pathLine(ctx, w.p); ctx.stroke(); }
    ctx.strokeStyle = '#9a948c'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    for (const r of d.rails) { this.pathLine(ctx, r); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const r of d.roads) if (r.k === 'plazaArea') { ctx.fillStyle = '#f3eee2'; this.pathPoly(ctx, r.p, r.ho); ctx.fill('evenodd'); }
    const draw = (filter, color, extra) => {
      ctx.strokeStyle = color;
      for (const r of d.roads) if (filter(r)) { ctx.lineWidth = r.w + extra; this.pathLine(ctx, r.p); ctx.stroke(); }
    };
    draw(r => r.k === 'path' || r.k === 'track' || r.k === 'foot' || r.k === 'steps', '#c9b9a0', 1);
    draw(r => r.k === 'road' || r.k === 'plaza', '#b9b2a4', 3);
    draw(r => r.k === 'plaza', '#f6f1e6', 1);
    draw(r => r.k === 'road', '#ffffff', 1);
    draw(r => r.k === 'road' && /trunk|primary|secondary/.test(r.h), '#f7d58b', 1);
    ctx.fillStyle = '#c9bba6'; ctx.strokeStyle = '#a89880'; ctx.lineWidth = 1;
    for (const b of d.buildings) { this.pathPoly(ctx, b.p, b.ho); ctx.fill('evenodd'); ctx.stroke(); }
    this.mapCanvas = cv;
    this.mapScale = S;
  }

  // ---------------- Abfragen ----------------
  insideBuilding(x, z, margin) {
    const list = this.polyGrid.query(x, z, 0, this._tmp);
    for (const b of list) {
      if (x < b.bb.minX - margin || x > b.bb.maxX + margin || z < b.bb.minZ - margin || z > b.bb.maxZ + margin) continue;
      if (U.pointInPoly(x, z, b.p) && !(b.ho && b.ho.some(h => U.pointInPoly(x, z, h)))) return b;
    }
    return this.region ? this.region.insideBuilding(x, z, margin) : null;
  }

  nearRoad(x, z, margin) {
    const list = this.roadGrid.query(x, z, 10, this._tmp);
    for (const s of list) {
      const c = U.closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      if (Math.hypot(c[0] - x, c[1] - z) < s.w / 2 + margin) return s;
    }
    return this.region ? this.region.nearRoad(x, z, margin) : null;
  }

  // Nächster Straßenabschnitt (optional gefiltert) im Umkreis
  nearestRoad(x, z, maxDist, filter) {
    let best = null, bestD = maxDist;
    const list = this.roadGrid.query(x, z, maxDist, []);
    for (const s of list) {
      if (filter && !filter(s)) continue;
      const c = U.closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      const dd = Math.hypot(c[0] - x, c[1] - z);
      if (dd < bestD) { bestD = dd; best = { seg: s, x: c[0], z: c[1], d: dd }; }
    }
    return this.region ? this.region.nearestRoad(x, z, maxDist, filter, best) : best;
  }

  // Schiebt einen Kreis aus Gebäuden und Bäumen heraus. Gibt {x, z, nx, nz, hit} zurück.
  // y: Höhe eines Autos (dann halten auch Leitplanken und Brückenkanten auf dieser Höhe auf)
  collideCircle(x, z, r, out, y) {
    out = out || {};
    out.hit = false; out.nx = 0; out.nz = 0;
    const E = this.edges;
    // Doppelte Kanten aus mehreren Zellen sind harmlos: nach dem ersten Herausschieben greift die Bedingung nicht mehr.
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.edgeGrid.query(x, z, r + 1, this._tmp);
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        const c = U.closestOnSeg(x, z, E[e * 4], E[e * 4 + 1], E[e * 4 + 2], E[e * 4 + 3]);
        const dx = x - c[0], dz = z - c[1];
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-4;
          const push = r - d;
          const nx = dx / d, nz = dz / d;
          x += nx * push; z += nz * push;
          out.nx += nx; out.nz += nz; out.hit = true; moved = true;
        }
      }
      const tl = this.treeGrid.query(x, z, r + 1, this._tmp);
      const T = this.trees;
      for (let n = 0; n < tl.length; n++) {
        const t = tl[n];
        const dx = x - T[t * 3], dz = z - T[t * 3 + 1], rr = r + T[t * 3 + 2];
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4;
          const nx = dx / d, nz = dz / d;
          x += nx * (rr - d); z += nz * (rr - d);
          out.nx += nx; out.nz += nz; out.hit = true; moved = true;
        }
      }
      if (this.riverGrid) {
        out.x = x; out.z = z;
        if (pushFromRivers(this.riverGrid, out, r, this._tmp)) { x = out.x; z = out.z; moved = true; }
      }
      if (this.region) {
        out.x = x; out.z = z;
        if (this.region.collide(out, r, y)) { x = out.x; z = out.z; moved = true; }
      }
      if (!moved) break;
    }
    const nl = Math.hypot(out.nx, out.nz);
    if (nl > 0) { out.nx /= nl; out.nz /= nl; }
    out.x = x; out.z = z;
    if (this.region) { this.region.clamp(out); return out; }
    // Kartenrand
    const B = this.bounds, m = 3;
    if (x < B.minX + m) { x = B.minX + m; out.hit = true; out.nx = 1; out.nz = 0; }
    if (x > B.maxX - m) { x = B.maxX - m; out.hit = true; out.nx = -1; out.nz = 0; }
    if (z < B.minZ + m) { z = B.minZ + m; out.hit = true; out.nx = 0; out.nz = 1; }
    if (z > B.maxZ - m) { z = B.maxZ - m; out.hit = true; out.nx = 0; out.nz = -1; }
    out.x = x; out.z = z;
    return out;
  }

  setNight(night) {
    for (const m of this.windowMaterials) m.emissiveIntensity = night ? 0.9 : 0;
  }
}
