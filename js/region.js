// Umland: der ganze Landkreis Coburg in Kacheln von ≈ 1 km (data/region.js aus tools/convert-region.js,
// Luftbilder aus tools/fetch-region-ortho.js). Gebaut werden nur die Kacheln in der Nähe des Spielers:
// Gelände (wie in der Innenstadt mit Catmull-Rom verfeinert), Luftbild, Straßen, Gebäude aus OSM und Bäume.
// Weiter entfernte Kacheln werden wieder abgebaut. Die Innenstadt (data/coburg.js) bleibt, wie sie ist.
'use strict';

const REGION = {
  F: 4,               // Verfeinerung des Geländegitters (wie TERRAIN_UPSAMPLE in world.js)
  load: 1400,         // Kacheln bis zu diesem Abstand vom Spieler voll bauen (m, bis zum Kachelrand; bis v3.11.0 2000)
  drop: 1900,         // weiter entfernte Kacheln abbauen (bis v3.11.0 2800)
  far: 4600,          // dahinter vereinfachte Kacheln (HLOD) bis zu diesem Abstand (0 = keine)
  farDrop: 5200,
  trees: 1100,        // Bäume nur in der Nähe
  treesDrop: 1600,
  skirt: 5,           // Schürze an den Kachelrändern gegen Lichtspalten (m)
  roadY: 0.12,
  sliceMs: 4,         // Bauzeit pro Bild, wenn nichts dringend ist (Zeitscheiben seit v3.12.0)
  life: 650,          // Laternen, Ladenschilder, Lokale und Fußgänger nur in der Nähe
  lifeDrop: 950,
  townBuildings: 12,  // ab so vielen Häusern gilt eine Kachel als Ort
};
// Smartphones (js/boot.js): kleinerer Umkreis, damit der Speicher reicht
if (window.QUALITY && window.QUALITY.region) Object.assign(REGION, window.QUALITY.region);
// Brücken über Straßen: Fahrbahn so hoch über der unteren Straße (m), Rampen höchstens so steil
const BRIDGE = { lift: 6.2, slope: 0.07, step: 4 };
// große Straßen (Bundesstraßen, Autobahn): Randlinien, Mittelstreifen, Leitplanken. Eine Mittelleitplanke gibt es nur
// zwischen getrennten Richtungsfahrbahnen (in OSM zwei Einbahn-Linien, jede mit ihrer eigenen Leitplanke am Rand);
// Straßen mit Gegenverkehr bekommen eine doppelte durchgezogene Linie, auch wenn sie breit sind.
const BIG_ROADS = /^(motorway|motorway_link|trunk|trunk_link|primary)$/;
// Schnittpunkt der Strecken a-b und c-d als Anteil t auf a-b (sonst null)
function segHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}
const LAMP_ROADS = /residential|living_street|tertiary|secondary|primary|unclassified/;
// Gehsteige (seit v3.6.0): Breite je Straßenart; Spielstraßen (Mischfläche), Wirtschaftswege, Zufahrten, Autobahnen und
// Kraftfahrstraßen bekommen keinen. Gebaut wird nur innerorts (Häuser an dieser Straßenseite, Ort groß genug).
const WALK_WIDTH = { primary: 2.2, secondary: 2.1, tertiary: 1.9, unclassified: 1.5, residential: 1.6 };
const SIDEWALK = { curb: 0.15, h: 0.12, cell: 40 };
// begehbare Lokale und Läden im Landkreis: Art aus OSM -> Raumtyp (venues.js)
function regionVenueType(name, kind) {
  if (kind === 'amenity=fast_food' && /kebab|kebap|döner|doner|dürüm/i.test(name)) return 'doener';
  if (/amenity=(restaurant|pub|biergarten)/.test(kind)) return 'gasthaus';
  if (kind === 'amenity=cafe' || kind === 'shop=bakery' || kind === 'shop=pastry') return 'cafe';
  if (kind === 'shop=chemist') return 'drugstore';
  if (kind === 'shop=clothes') return 'fashion';
  if (kind === 'shop=books') return 'books';
  return null;
}
// Putzfarben auf dem Land, Holz- und Ziegeltöne für Scheunen
const RURAL_FACADES = ['#efe9dc', '#e9dfc6', '#e6d3a8', '#f0ebe0', '#ddd3c0', '#e8c9a4', '#d9d0bd', '#efe0b8', '#d8c3a5',
  '#e5ddd0', '#f1ece0', '#e2c48f', '#cdd3c2'];
const BARN_WALLS = ['#8a6446', '#7a5a40', '#9b7b5b', '#a8957c', '#b06a4f', '#8c8478'];
const FARM_TYPES = new Set(['barn', 'farm_auxiliary', 'stable', 'cowshed', 'silo', 'sty']);
// kleine Wohnhäuser auf dem Land bekommen den Landhaus-Stil (Fassadenshader Stil 1/2) und ein steiles Satteldach
const RURAL_HOUSES = new Set(['house', 'detached', 'semidetached_house', 'residential', 'yes', 'farm', 'bungalow', 'terrace']);
const HALL_TYPES = new Set(['industrial', 'warehouse', 'retail', 'supermarket', 'commercial', 'hangar', 'manufacture']);
// Bautypen aus tools/classify-buildings.js. Landhaus-Formen (steiles Dach, Läden, Sandsteinsockel, Fachwerk nur mit
// Fachwerk-Bit) gibt es nur für den historischen Kern; Wohnhäuser der Nachkriegszeit und Neubauten haben eigene Maße,
// Farben, Dächer und Fenster (Fassadenshader: Stil + 8 × Bautyp + 128 × Fachwerk im Wandprofil).
const ARCH = { UNBEKANNT: 0, HOF: 1, BUERGER: 2, SIEDLUNG: 3, EFH: 4, NEUBAU: 5, MFH: 6, GEWERBE: 7, INDUSTRIE: 8,
  AGRAR_ALT: 9, AGRAR_NEU: 10, NEBEN: 11, SONDER: 12 };
const ARCH_NAMES = ['unbekannt', 'Historischer Kern (Dorf)', 'Historischer Kern (Kleinstadt)', 'Siedlung 1950er–70er',
  'Einfamilienhaus 1970er–90er', 'Neubau ab 2000', 'Mehrfamilienhaus', 'Gewerbe', 'Industrie', 'Landwirtschaft alt',
  'Landwirtschaft modern', 'Nebengebäude', 'Sonderbau'];
const SIEDLUNG_FACADES = ['#e4dac2', '#d9cfb6', '#e3d6a6', '#cfc7b4', '#e8e1cf', '#d7c8a7', '#dcd6c8', '#e6dcb9'];
const EFH_FACADES = ['#f2eee5', '#ede4cf', '#efe1bd', '#ead8b8', '#f4f0e8', '#e3d5bd', '#ecdfc8', '#f0e6d2', '#e8d2b5'];
const NEUBAU_FACADES = ['#f5f4f0', '#f3f2ed', '#ebeae5', '#dfddd7', '#f2ede2', '#e7e2d7', '#d4d1ca', '#f6f2e8', '#c9c6bf', '#ece6d8'];
const MFH_FACADES = ['#ebe6db', '#e4dccb', '#d9d5cc', '#efe9dc', '#e2d6bf', '#d4d8d6', '#e9e1d0'];
const GEWERBE_WALLS = ['#d8d8d4', '#c9ccce', '#e4e2dc', '#b8bec4', '#d3cfc5', '#9aa3aa'];
const INDUSTRIE_WALLS = ['#c5c1b7', '#b9bec4', '#d6d8d8', '#8e9aa3', '#a9b0a8', '#c9c4b5', '#7f8d93'];
const AGRAR_NEU_WALLS = ['#b7b9b4', '#8f9a8c', '#6f7f6c', '#c9c7bd', '#a39d90', '#7d8a86'];
const NEBEN_WALLS = ['#d9d4c8', '#cfcac0', '#e2ded4', '#bdb8ad', '#c8c2b4'];
// Garagen je Bauzeit (0 alt, 1 1950er–70er, 2 1970er–90er, 3 Neubau) und Gartenschuppen aus Holz
const GARAGE_WALLS = [['#cfc6b4', '#bfb39d', '#d6cfc0'], ['#d8d2c4', '#cfcabd', '#e0dbd0'], ['#efe6d2', '#e9dfc9', '#f2ede2'], ['#ecebe7', '#e2e0db', '#d4d1ca', '#f2f1ed']];
const SHED_WALLS = ['#7a5a3c', '#8b6a48', '#6e5a46', '#9a7b58', '#5f6b5a'];
const ARCH_WALLS = { 1: RURAL_FACADES, 2: RURAL_FACADES, 3: SIEDLUNG_FACADES, 4: EFH_FACADES, 5: NEUBAU_FACADES, 6: MFH_FACADES, 7: GEWERBE_WALLS };
// Dach je Wohn-Bautyp: Neigung (Grad), Überstand an Traufe und Ortgang (m), Untersicht, Schornstein-Wahrscheinlichkeit
const ARCH_ROOF = {
  0: { pitch: [40, 52], oE: 0.45, oG: 0.3, under: ['#5a4636'], chimney: 1 },
  1: { pitch: [40, 52], oE: 0.45, oG: 0.3, under: ['#5a4636'], chimney: 1 },
  2: { pitch: [42, 55], oE: 0.35, oG: 0.25, under: ['#5a4636'], chimney: 1 },
  3: { pitch: [38, 48], oE: 0.32, oG: 0.22, under: ['#77706a', '#6e675e'], chimney: 0.9 },
  4: { pitch: [30, 42], oE: 0.7, oG: 0.5, under: ['#5b3f2a', '#6a4a30', '#e9e5dc'], chimney: 0.7 },
  5: { pitch: [24, 38], oE: 0.55, oG: 0.35, under: ['#ecebe7', '#3a3c3f', '#ecebe7'], chimney: 0.2 },
};
// Fassaden je Bautyp (seit v3.8.0, Grafik-Phase 4): Wandbaustoff und Fensterart mit Anteilen. Der Fassadenshader
// (js/world.js) liest die Wahl aus dem Wandprofil (Stil + 8 × Bautyp + 128 × Fachwerk + 256 × Baustoff + 2048 × Fensterart).
// Baustoff: 0 Putz, 1 Klinker, 2 Holz im Obergeschoss bzw. Giebel, 3 Faserzement-Schindeln im Giebel, 4 Schiefer im
// Obergeschoss und Giebel, 5 Klinkersockel, 6 Holzhaus. Fensterart: 1 Holz weiß mit Klappläden, 2 Holz weiß,
// 3 Kunststoff weiß mit Rollladen, 4 Holz braun mit Rollladen, 5 anthrazit mit Raffstore, 6 weiß bodentief mit Rollladen,
// 7 anthrazit bodentief mit Raffstore. Fachwerkhäuser bleiben verputzt (Gefache).
const FACADE_KIT = {
  1: { mat: [[0, 0.86], [4, 0.1], [2, 0.04]], win: [[1, 0.42], [2, 0.38], [3, 0.14], [4, 0.06]] },       // alter Dorfkern
  2: { mat: [[0, 0.9], [4, 0.1]], win: [[1, 0.48], [2, 0.4], [3, 0.12]] },                               // Kleinstadtkern
  3: { mat: [[0, 0.7], [3, 0.16], [5, 0.1], [1, 0.04]], win: [[3, 0.72], [2, 0.16], [4, 0.12]] },        // Siedlung 1950er–70er
  4: { mat: [[0, 0.5], [2, 0.3], [5, 0.12], [1, 0.08]], win: [[3, 0.42], [4, 0.46], [6, 0.12]] },        // EFH 1970er–90er
  5: { mat: [[0, 0.7], [2, 0.18], [1, 0.08], [6, 0.04]], win: [[5, 0.3], [7, 0.3], [6, 0.25], [3, 0.15]] },  // Neubau
};
const KLINKER_WALLS = ['#b9705c', '#a0533f', '#9b5a45', '#c98a6a', '#d9c29a', '#8e4b3a'];
const WOOD_WALLS = ['#7a5a3c', '#8b6a48', '#6b5a4a', '#a08a6a', '#5e5a55'];
const REGION_TREE_DENSITY = { forest: 1 / 115, orchard: 1 / 140, park: 1 / 500, cemetery: 1 / 300, allotments: 1 / 600,
  scrub: 1 / 380, residential: 1 / 1700, meadow: 1 / 5000, farmyard: 1 / 2500 };
const tileKey = (ti, tj) => (ti + 512) * 1024 + (tj + 512);

// Bäume einer Art in einer Kachel (seit v3.12.0, Grafik-Phase 8): wenige InstancedMeshes statt je eines pro 250-m-Gruppe.
// Die Instanzen liegen nach Zellen sortiert (4 × 4 je Kachel). Jede Zelle hat eine Stufe: nah (unter 220 m, Blattkarten,
// ein Mesh), fern (grobe Hülle) und ab 600 m Impostor (zwei gekreuzte Flächen mit gerendertem Bild; Stämme entfallen) –
// fern und Impostor je Kachelviertel ein Mesh, damit Unsichtbares weiter ausgeblendet wird. Wechselt eine Zelle die
// Stufe, werden die Puffer neu zusammengesetzt (beim Fahren alle paar Sekunden, ≈ 0,1 ms).
const TREE_CELLS = 4;
const TREE_NEAR = [220, 250], TREE_IMP = [600, 650]; // Stufenwechsel (m) mit Spielraum zurück
class TreeSet {
  // mats: Float32Array (16 je Baum), cols: Float32Array (3 je Baum) oder null, start: Zellgrenzen (TREE_CELLS² + 1);
  // imp: { geo, mat } für die Impostor-Stufe oder null (Stämme: dort nicht zeichnen)
  constructor(t, near, far, mat, mats, cols, start, cw, ch, imp) {
    Object.assign(this, { t, near, far, mat, mats, cols, start, cw, ch, imp });
    const N = TREE_CELLS, S = start;
    this.n = S[N * N];
    this.lv = null;
    // Viertel der Zelle k und Größe jedes Viertels
    this.quad = k => (Math.floor((k % N) * 2 / N)) + 2 * Math.floor(Math.floor(k / N) * 2 / N);
    this.qn = [0, 0, 0, 0];
    for (let k = 0; k < N * N; k++) this.qn[this.quad(k)] += S[k + 1] - S[k];
    this.farM = [null, null, null, null];
    this.impM = [null, null, null, null];
    this.nearM = null;
    this.m = this; // Schlüssel für World.removeTreeLod
  }
  mesh(geo, mat, cap, shadow = true) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    if (this.cols) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.castShadow = shadow; m.receiveShadow = true; m.count = 0;
    this.t.group.add(m);
    return m;
  }
  // Stufe je Zelle aus dem Abstand zur Kamera
  update(x, z) {
    const t = this.t, N = TREE_CELLS, old = this.lv, lv = new Uint8Array(N * N);
    let changed = !old;
    for (let k = 0; k < N * N; k++) {
      if (this.start[k + 1] === this.start[k]) continue;
      const x0 = t.x0 + (k % N) * this.cw, z0 = t.z0 + Math.floor(k / N) * this.ch;
      const d = Math.hypot(Math.max(x0 - x, 0, x - x0 - this.cw), Math.max(z0 - z, 0, z - z0 - this.ch));
      const o = old ? old[k] : -1;
      lv[k] = d < TREE_NEAR[0] || (o === 0 && d <= TREE_NEAR[1]) ? 0 : d < TREE_IMP[0] || (o === 1 && d <= TREE_IMP[1]) ? 1 : 2;
      if (lv[k] !== o) changed = true;
    }
    if (changed) this.fill(lv);
  }
  fill(lv) {
    this.lv = lv;
    const N = TREE_CELLS, S = this.start;
    let nNear = 0;
    for (let k = 0; k < N * N; k++) if (lv[k] === 0) nNear += S[k + 1] - S[k];
    if (nNear && (!this.nearM || this.nearM.instanceMatrix.count < nNear)) {
      if (this.nearM) { this.t.group.remove(this.nearM); this.nearM.dispose(); }
      this.nearM = this.mesh(this.near, this.mat, Math.min(this.n, Math.ceil(nNear * 1.3)));
    }
    const put = (m, at, k) => {
      const a = S[k], b = S[k + 1];
      m.instanceMatrix.array.set(this.mats.subarray(a * 16, b * 16), at * 16);
      if (this.cols) m.instanceColor.array.set(this.cols.subarray(a * 3, b * 3), at * 3);
      return at + b - a;
    };
    const fc = [0, 0, 0, 0], ic = [0, 0, 0, 0];
    let n = 0;
    for (let k = 0; k < N * N; k++) {
      if (S[k + 1] === S[k]) continue;
      const q = this.quad(k);
      if (lv[k] === 0) n = put(this.nearM, n, k);
      else if (lv[k] === 1) fc[q] = put(this.farM[q] || (this.farM[q] = this.mesh(this.far, this.mat, this.qn[q])), fc[q], k);
      else if (this.imp) ic[q] = put(this.impM[q] || (this.impM[q] = this.mesh(this.imp.geo, this.imp.mat, this.qn[q], false)), ic[q], k);
    }
    const done = (m, c) => {
      if (!m) return;
      m.count = c; m.visible = c > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (c) m.computeBoundingSphere();
    };
    for (let q = 0; q < 4; q++) { done(this.farM[q], fc[q]); done(this.impM[q], ic[q]); }
    done(this.nearM, n);
  }
  meshes() { return [...this.farM, ...this.impM, this.nearM].filter(Boolean); }
}

class Region {
  constructor(world, R) {
    this.world = world;
    this.R = R;
    const T = world.data.terrain, G = R.grid;
    this.ok = !!T && Math.abs(R.meta.base - T.base) < 0.01 && Math.abs(G.minX - T.minX) < 0.01 && Math.abs(G.minZ - T.minZ) < 0.01 &&
      Math.abs(G.stepX - T.stepX) < 1e-6 && Math.abs(G.stepZ - T.stepZ) < 1e-6;
    if (!this.ok) return;
    // grobes Höhengitter (Dezimeter, Int16, base64)
    const bin = atob(G.h), n = bin.length / 2;
    this.gh = new Float32Array(n);
    for (let k = 0; k < n; k++) { let v = bin.charCodeAt(k * 2) | (bin.charCodeAt(k * 2 + 1) << 8); if (v > 32767) v -= 65536; this.gh[k] = v / 10; }
    this.gc0 = G.c0; this.gr0 = G.r0; this.gcols = G.cols; this.grows = G.rows;
    this.minX = G.minX; this.minZ = G.minZ; this.stepX = G.stepX; this.stepZ = G.stepZ;
    this.TC = R.meta.tileCells;
    this.N = this.TC * REGION.F;                         // feine Zellen je Kachel
    this.fx = this.stepX / REGION.F; this.fz = this.stepZ / REGION.F;
    this.tw = this.TC * this.stepX; this.th = this.TC * this.stepZ;
    // Innenstadt-Gelände (wird nicht doppelt gebaut)
    this.core = { minX: T.minX, minZ: T.minZ, maxX: T.minX + (T.cols - 1) * T.stepX, maxZ: T.minZ + (T.rows - 1) * T.stepZ,
      fc: (T.cols - 1) * REGION.F, fr: (T.rows - 1) * REGION.F };
    const S = R.tiles;
    this.ti0 = S.i0; this.tj0 = S.j0; this.tni = S.ni; this.tnj = S.nj; this.state = S.state;
    this.limits = { minX: this.tileX(S.i0), minZ: this.tileZ(S.j0), maxX: this.tileX(S.i0 + S.ni), maxZ: this.tileZ(S.j0 + S.nj) };
    this.loaded = new Map();
    this.far = new Map();           // vereinfachte ferne Kacheln (HLOD)
    this.treesOn = new Set();
    this.decodeGraph();
    // Ampeln, Vorfahrt und Haltepunkte des Verkehrs (js/signals.js, seit v3.14.0)
    this.control = typeof TrafficControl !== 'undefined' ? new TrafficControl(this) : null;
    this.places = R.places;
    this.ortho = window.COBURG_REGION_ORTHO && location.protocol !== 'file:' ? window.COBURG_REGION_ORTHO : null;
    this._near = [];
    this.stats = { built: 0, ms: 0, frameMs: 0, maxFrame: 0, maxStep: 0 };
    this.anchors = new Map();       // Kachel -> Objekte, deren Höhe beim Bauen der Kachel nachgeführt wird
    this.lifeOn = new Set();
    this.night = false;
    this.initBridges();
    this.startWorker();
    // Landschaft: Bodenbedeckung, Geländematerial, Bewuchs, Waldkulisse (js/landscape.js)
    this.land = typeof Landscape !== 'undefined' ? new Landscape(this) : null;
    // Feldwege, Hecken, Baumreihen (data/region-rural.js) nach Kacheln
    this.rural = this.land && window.COBURG_RURAL ? Landscape.splitRural(this, window.COBURG_RURAL) : new Map();
  }

  // Objekt (Säule, Schild) auf das Gelände stellen; im Umland stimmt die Höhe erst, wenn die Kachel gebaut ist
  anchor(obj, x, z, dy) {
    obj.position.y = this.world.heightAt(x, z) + dy;
    if (this.inCore(x, z)) return;
    const [ti, tj] = this.tileOf(x, z), key = tileKey(ti, tj);
    if (!this.anchors.has(key)) this.anchors.set(key, []);
    this.anchors.get(key).push({ obj, x, z, dy });
  }

  tileX(ti) { return this.minX + ti * this.tw; }
  tileZ(tj) { return this.minZ + tj * this.th; }
  tileOf(x, z) { return [Math.floor((x - this.minX) / this.tw), Math.floor((z - this.minZ) / this.th)]; }
  stateOf(ti, tj) {
    const i = ti - this.ti0, j = tj - this.tj0;
    return i < 0 || j < 0 || i >= this.tni || j >= this.tnj ? 0 : this.state.charCodeAt(j * this.tni + i) - 48;
  }
  stateAt(x, z) { const [ti, tj] = this.tileOf(x, z); return this.stateOf(ti, tj); }
  inCore(x, z) { const C = this.core; return x >= C.minX && x <= C.maxX && z >= C.minZ && z <= C.maxZ; }

  // ---------------- Straßennetz ----------------
  decodeGraph() {
    const G = this.R.graph, names = this.R.names, cls = this.R.classes;
    this.graph = { nodes: G.nodes.map(v => v / 10), edges: [] };
    this.runs = new Map();          // Kachel -> [Kante, erster Punkt, letzter Punkt]
    this.netGrid = new U.Grid(40);  // alle Straßenabschnitte (Gewässer an Straßen offen lassen, auch ungebaute Kacheln)
    G.edges.forEach((e, ei) => {
      const p = [];
      let x = 0, z = 0;
      for (let k = 7; k < e.length; k += 2) { x += e[k]; z += e[k + 1]; p.push(x / 10, z / 10); }
      const h = cls[e[2]];
      this.graph.edges.push({ a: e[0], b: e[1], p, s: e[6] / 10, o: e[5] & 1 ? 1 : undefined, n: e[4] >= 0 ? names[e[4]] : undefined,
        h, w: e[3] / 10, br: !!(e[5] & 2) });
      for (let k = 0; k + 3 < p.length; k += 2) this.netGrid.insert(ei * 4096 + k / 2, Math.min(p[k], p[k + 2]), Math.min(p[k + 1], p[k + 3]), Math.max(p[k], p[k + 2]), Math.max(p[k + 1], p[k + 3]));
      // Abschnitte nach Kachel (Mitte des Abschnitts); in der Innenstadt zeichnet die Innenstadt selbst
      let run = null;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const mx = (p[k] + p[k + 2]) / 2, mz = (p[k + 1] + p[k + 3]) / 2;
        let key = null;
        if (!this.inCore(mx, mz)) { const [ti, tj] = this.tileOf(mx, mz); if (this.stateOf(ti, tj)) key = tileKey(ti, tj); }
        if (run && run.key === key) { run.k1 = k / 2 + 1; continue; }
        if (key !== null) {
          run = { key, e: ei, k0: k / 2, k1: k / 2 + 1 };
          if (!this.runs.has(key)) this.runs.set(key, []);
          this.runs.get(key).push(run);
        } else run = null;
      }
    });
  }

  // Straße (oder flache Brücke) in der Nähe? Hohe Brücken zählen nicht: unter ihnen bleibt das Wasser.
  // carve: fürs Ausheben der Gewässer; dann zählen auch niedrige Brücken nicht (unter ihnen fließt das Wasser durch)
  roadNear(x, z, margin, carve) { return TileHeights.roadNear(this, x, z, margin, carve); }

  // ---------------- Brücken ----------------
  // Brücken über Täler: Fahrbahn als Gerade zwischen den Brückenenden statt auf dem Gelände. Führt eine Brücke über
  // eine andere Straße, liegt sie dort BRIDGE.lift m über deren Fahrbahn; die Zufahrten steigen als Rampen
  // (höchstens BRIDGE.slope) auf den anschließenden Straßen an.
  initBridges() {
    this.bridgeGrid = new U.Grid(30);
    this.bridges = [];
    const E = this.graph.edges, step = BRIDGE.step;
    const adj = new Map();
    E.forEach((e, ei) => { for (const nd of [e.a, e.b]) { if (!adj.has(nd)) adj.set(nd, []); adj.get(nd).push(ei); } });
    this.nodeDeg = nd => (adj.get(nd) || []).length;
    this.nodeEdges = nd => adj.get(nd) || [];
    // Höhenprofil einer Kante, alle `step` m (Fahrbahn ohne Brücke: Gelände)
    const make = (ei, linear) => {
      const e = E[ei], p = e.p, n = p.length / 2, cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
      const len = cum[n - 1], B = { ei, p, cum, len, w: e.w, prof: null, ramp: !linear };
      const m = Math.max(1, Math.ceil(len / step)), prof = new Float32Array(m + 1);
      const hA = this.fineAt(p[0], p[1]), hB = this.fineAt(p[n * 2 - 2], p[n * 2 - 1]);
      for (let j = 0; j <= m; j++) {
        const s = Math.min(len, j * step);
        if (linear) prof[j] = hA + (hB - hA) * s / (len || 1);
        else { const q = this.along(B, s); prof[j] = this.fineAt(q[0], q[1]); }
      }
      B.prof = prof;
      return B;
    };
    const ground = (B, j) => { const q = this.along(B, Math.min(B.len, j * step)); return this.fineAt(q[0], q[1]); };
    // Profil von Abstand s0 aus auf mindestens h anheben (mit Gefälle zu beiden Seiten)
    const raise = (B, s0, h) => {
      for (let j = 0; j < B.prof.length; j++) B.prof[j] = Math.max(B.prof[j], h - BRIDGE.slope * Math.abs(Math.min(B.len, j * step) - s0));
    };
    const decks = new Map(), under = new Set();
    E.forEach((e, ei) => {
      if (!e.br || e.p.every((v, k) => k % 2 || this.inCore(v, e.p[k + 1]))) return;
      const B = make(ei, true);
      if (B.len < 8) return;
      decks.set(ei, B);
    });
    // Kreuzungen mit Straßen unter der Brücke
    const lifts = [];
    for (const [ei, B] of decks) {
      const e = E[ei], p = e.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        const list = this.netGrid.query((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 1, this._rq || (this._rq = []));
        for (const code of list) {
          const oi = Math.floor(code / 4096), k = (code % 4096) * 2, o = E[oi];
          if (oi === ei || o.br || o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
          const t = segHit(ax, az, bx, bz, o.p[k], o.p[k + 1], o.p[k + 2], o.p[k + 3]);
          if (t === null) continue;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          under.add(oi);
          lifts.push([ei, B.cum[i / 2] + (B.cum[i / 2 + 1] - B.cum[i / 2]) * t, this.fineAt(x, z) + BRIDGE.lift]);
        }
      }
    }
    // Rampe an Knoten `nd` weiterführen: auf der geradesten anschließenden Straße
    const carry = (fromEi, nd, h, depth) => {
      const from = E[fromEi], fp = from.p, n = fp.length / 2;
      const atA = from.a === nd;
      const dx = atA ? fp[0] - fp[2] : fp[n * 2 - 2] - fp[n * 2 - 4], dz = atA ? fp[1] - fp[3] : fp[n * 2 - 1] - fp[n * 2 - 3];
      const dl = Math.hypot(dx, dz) || 1;
      let best = null, bestDot = 0.5;
      for (const ni of adj.get(nd) || []) {
        if (ni === fromEi || under.has(ni)) continue;
        const o = E[ni], op = o.p, m = op.length / 2;
        if (op.some((v, k) => !(k % 2) && this.inCore(v, op[k + 1]))) continue;
        const oa = o.a === nd;
        const ox = oa ? op[2] - op[0] : op[m * 2 - 4] - op[m * 2 - 2], oz = oa ? op[3] - op[1] : op[m * 2 - 3] - op[m * 2 - 1];
        const dot = (dx * ox + dz * oz) / dl / (Math.hypot(ox, oz) || 1);
        if (dot > bestDot) { bestDot = dot; best = ni; }
      }
      if (best === null) return;
      let B = decks.get(best);
      if (!B) { B = make(best, false); decks.set(best, B); }
      const o = E[best], s0 = o.a === nd ? 0 : B.len;
      raise(B, s0, h);
      const far = o.a === nd ? o.b : o.a, j = s0 ? 0 : B.prof.length - 1;
      const hf = B.prof[j];
      if (hf > ground(B, j) + 0.3 && depth < 6) carry(best, far, hf, depth + 1);
    };
    for (const [ei, s0, h] of lifts) raise(decks.get(ei), s0, h);
    for (const [ei, s0, h] of lifts) {
      const B = decks.get(ei), e = E[ei], last = B.prof.length - 1;
      if (B.prof[0] > ground(B, 0) + 0.3) carry(ei, e.a, B.prof[0], 0);
      if (B.prof[last] > ground(B, last) + 0.3) carry(ei, e.b, B.prof[last], 0);
    }
    for (const [ei, B] of decks) {
      const e = E[ei], p = B.p, n = p.length / 2;
      // Hochbrücken und Rampen: irgendwo mindestens 1,5 m (Rampen 0,5 m) über dem Gelände. Flachere Brücken (über
      // Bäche, Flüsse, Gräben) werden niedrige Brücken: leicht gewölbt, darunter wird das Gewässer ausgehoben
      let gap = 0, low = Infinity;
      for (let j = 0; j < B.prof.length; j++) { const g = ground(B, j); gap = Math.max(gap, B.prof[j] - g); low = Math.min(low, B.prof[j] - g); }
      if (gap < (B.ramp ? 0.5 : 1.5)) {
        if (B.ramp || B.len < LOW_BRIDGE.minLen) continue;
        // über einer Kuppe würde die gerade Platte im Boden stecken: dann bleibt die Straße auf dem Gelände
        if (low < -0.3) continue;
        const hA = B.prof[0], hB = B.prof[B.prof.length - 1];
        for (let j = 0; j < B.prof.length; j++) B.prof[j] = lowBridgeH(hA, hB, B.len, Math.min(B.len, j * step));
        B.low = true;
      }
      e.deck = B;
      this.bridges.push(B);
      for (let i = 0; i < n - 1; i++) this.bridgeGrid.insert({ B, i }, Math.min(p[i * 2], p[i * 2 + 2]) - e.w, Math.min(p[i * 2 + 1], p[i * 2 + 3]) - e.w,
        Math.max(p[i * 2], p[i * 2 + 2]) + e.w, Math.max(p[i * 2 + 1], p[i * 2 + 3]) + e.w);
    }
  }
  deckH(B, s) {
    const f = U.clamp(s, 0, B.len) / BRIDGE.step, j = Math.min(Math.floor(f), B.prof.length - 2);
    if (j < 0) return B.prof[0];
    return B.prof[j] + (B.prof[j + 1] - B.prof[j]) * (f - j);
  }
  along(B, s) {
    const p = B.p, cum = B.cum;
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const t = U.clamp((s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), 0, 1);
    return [p[i * 2 - 2] + (p[i * 2] - p[i * 2 - 2]) * t, p[i * 2 - 1] + (p[i * 2 + 1] - p[i * 2 - 1]) * t];
  }
  // Fahrbahnhöhe an (x, z), falls dort eine Hochbrücke ist (sonst null)
  deckAt(x, z) {
    let best = null;
    for (const { B, i } of this.bridgeGrid.query(x, z, 0, this._bq || (this._bq = []))) {
      const p = B.p, c = U.closestOnSeg(x, z, p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      if (Math.hypot(c[0] - x, c[1] - z) > B.w / 2 + 0.4) continue;
      const h = this.deckH(B, B.cum[i] + (B.cum[i + 1] - B.cum[i]) * c[2]);
      if (best === null || h > best) best = h;
    }
    return best;
  }
  groundAt(x, z, y) {
    let h = this.world.heightAt(x, z);
    const d = this.bridges.length ? this.deckAt(x, z) : null;
    if (d !== null && d > h + 0.2 && (y === undefined || y > d - 2.5)) return d;
    // neben Gewässern liegt die Fahrbahn auf dem Gelände ohne Bett (wie sie gezeichnet ist)
    if (!this.inCore(x, z)) { const h0 = this.heightAt0(x, z); if (h0 > h + 0.01 && this.roadNear(x, z, 0.3)) h = h0; }
    return h;
  }

  // ---------------- Höhen ----------------
  // Gelände ohne Gewässer an beliebiger Stelle (auch in ungebauten Kacheln), wie das feine Gitter
  fineAt(x, z) {
    const fc = (x - this.minX) / this.fx, fr = (z - this.minZ) / this.fz;
    const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, tz = fr - r;
    const h00 = this.fine(c, r), h10 = this.fine(c + 1, r), h01 = this.fine(c, r + 1), h11 = this.fine(c + 1, r + 1);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }
  coarse(c, r) {
    c = U.clamp(c - this.gc0, 0, this.gcols - 1); r = U.clamp(r - this.gr0, 0, this.grows - 1);
    return this.gh[r * this.gcols + c];
  }
  // Höhen, Kleinrelief, Straßenmaske: gemeinsamer Rechenweg mit dem Worker (js/tile-worker.js)
  fine(fc, fr) { return TileHeights.fine(this, fc, fr); }
  relief(x, z) { return TileHeights.relief(this, x, z); }
  reliefMask(x, z) { return TileHeights.reliefMask(this, x, z); }
  // Gewässer der Kachel und ihrer acht Nachbarn (damit die Ränder zueinander passen), null ohne Daten
  waterNear(t) {
    if (t.st !== 2 || typeof WaterSet === 'undefined') return null;
    const areas = [], lines = [];
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const w = this.waterOf(t.ti + a, t.tj + b);
      areas.push(...w.areas); lines.push(...w.lines);
    }
    return { areas, lines };
  }
  // Feines Höhenraster einer Kachel mit einem Punkt Rand (für Normalen), Zeilenlänge N + 3. Liegt es schon vom Worker
  // vor, wird es übernommen, sonst hier gerechnet (dringende Kacheln, ohne Worker).
  makeHeights(t) {
    const pre = this.hcache.get(t.key);
    let r = pre && pre.hg0 ? pre : null;
    this.hcache.delete(t.key);
    const water = this.waterNear(t);
    if (!r) r = TileHeights.heights(this, t.ti, t.tj, this.N, this.tileX(t.ti) - this.fx, this.tileZ(t.tj) - this.fz, water);
    t.hg0 = r.hg0; t.hg = r.hg || r.hg0; t.hs = r.S;
    // Horizontkarte für den Geländeschatten bei tiefer Sonne (Grafik-Phase G6); ohne Worker hier gerechnet
    if (this.horizonOn) t.hor = r.hor || TileHeights.horizon(this, t.x0, t.z0, this.tw, this.th, TileHeights.HOR_N / 2);
    if (water) t.waterAll = new WaterSet(water.areas, water.lines);
  }
  // Höhen der Kachel beim Worker bestellen (seit v3.12.0, Grafik-Phase 8)
  prefetch(w) {
    if (!this.hw || this.hcache.has(w.key) || this.hpending >= 3) return;
    const t = { ti: w.ti, tj: w.tj, st: w.st };
    this.hcache.set(w.key, { pending: performance.now() });
    this.hpending++;
    this.hw.postMessage({ key: w.key, ti: w.ti, tj: w.tj, N: this.N, x0: this.tileX(w.ti) - this.fx, z0: this.tileZ(w.tj) - this.fz, water: this.waterNear(t),
      hor: this.horizonOn ? [this.tileX(w.ti), this.tileZ(w.tj), this.tw, this.th] : null });
  }
  // Worker starten (nicht bei file://, nicht mit ?worker=0); er bekommt einmal grobes Raster, Innenstadt und Straßennetz
  startWorker() {
    this.hcache = new Map(); this.hpending = 0; this.hw = null;
    // Geländeschatten bei tiefer Sonne (seit v3.19.0, Grafik-Phase G6): nur Stufe „voll“, ?horizon=0 schaltet ab
    this.horizonOn = !!(window.QUALITY && window.QUALITY.level === 'voll') && !/[?&]horizon=0\b/.test(location.search);
    if (typeof Worker === 'undefined' || location.protocol === 'file:' || /[?&]worker=0/.test(location.search)) return;
    try {
      const hw = new Worker('js/tile-worker.js');
      hw.onmessage = e => {
        const m = e.data, c = this.hcache.get(m.key);
        this.hpending = Math.max(0, this.hpending - 1);
        if (c && c.pending) this.hcache.set(m.key, { hg0: m.hg0, hg: m.hg, S: m.S, hor: m.hor });
      };
      hw.onerror = e => { console.warn('Kachel-Worker aus:', e.message); this.hw = null; this.hcache.clear(); this.hpending = 0; };
      hw.postMessage({ init: { gh: this.gh, gc0: this.gc0, gr0: this.gr0, gcols: this.gcols, grows: this.grows, minX: this.minX, minZ: this.minZ,
        fx: this.fx, fz: this.fz, core: this.core, F: REGION.F,
        edges: this.graph.edges.map(e => ({ p: e.p, w: e.w, d: e.deck ? (e.deck.low ? 2 : 1) : 0 })) } });
      this.hw = hw;
    } catch (e) { console.warn('Kachel-Worker nicht möglich:', e.message); }
  }
  // Gewässer einer Kachel (Flächen und Mittellinien), zwischengespeichert
  waterOf(ti, tj) {
    const key = ti + ',' + tj;
    this._water = this._water || new Map();
    let w = this._water.get(key);
    if (!w) {
      const d = this.stateOf(ti, tj) ? this.decodeTile({ ti, tj }) : { areas: [], water: [] };
      w = { areas: d.areas.filter(a => a.k === 'water' || a.k === 'river'), lines: d.water };
      if (this._water.size > 200) this._water.clear();
      this._water.set(key, w);
    }
    return w;
  }
  heightAt0(x, z) {
    let fc = (x - this.minX) / this.fx, fr = (z - this.minZ) / this.fz;
    const N = this.N, ti = Math.floor(fc / N), tj = Math.floor(fr / N);
    const t = this.loaded.get(tileKey(ti, tj));
    if (!t || !t.hg0) return this.heightAt(x, z);
    let lc = U.clamp(fc - ti * N, 0, N - 0.0001), lr = U.clamp(fr - tj * N, 0, N - 0.0001);
    const c = Math.floor(lc), r = Math.floor(lr), tx = lc - c, tz = lr - r, S = t.hs, g = t.hg0;
    const i = (r + 1) * S + c + 1;
    const h00 = g[i], h10 = g[i + 1], h01 = g[i + S], h11 = g[i + S + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  heightAt(x, z) {
    let fc = (x - this.minX) / this.fx, fr = (z - this.minZ) / this.fz;
    const N = this.N, ti = Math.floor(fc / N), tj = Math.floor(fr / N);
    const t = this.loaded.get(tileKey(ti, tj));
    if (t && t.hg) {
      let lc = fc - ti * N, lr = fr - tj * N;
      lc = U.clamp(lc, 0, N - 0.0001); lr = U.clamp(lr, 0, N - 0.0001);
      const c = Math.floor(lc), r = Math.floor(lr), tx = lc - c, tz = lr - r, S = t.hs, g = t.hg;
      const i = (r + 1) * S + c + 1;
      const h00 = g[i], h10 = g[i + 1], h01 = g[i + S], h11 = g[i + S + 1];
      if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
      return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
    }
    // nicht gebaut: grobes Gitter (gleiche Dreiecksteilung)
    const gc = (x - this.minX) / this.stepX, gr = (z - this.minZ) / this.stepZ;
    const c = Math.floor(gc), r = Math.floor(gr), tx = gc - c, tz = gr - r;
    const h00 = this.coarse(c, r), h10 = this.coarse(c + 1, r), h01 = this.coarse(c, r + 1), h11 = this.coarse(c + 1, r + 1);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  // ---------------- Laden und Abbauen ----------------
  // Jeden Frame aufrufen: baut fehlende Kacheln in der Nähe (die unter dem Spieler sofort), baut ferne ab.
  // Seit v3.12.0 (Grafik-Phase 8) in Zeitscheiben: ein Auftrag (Kachel, Bäume, Ortsleben) ist eine Folge kleiner
  // Schritte (Generator), pro Bild laufen Schritte bis REGION.sliceMs; eine Kachel kommt erst fertig in die Szene.
  // Dringendes (unter dem Spieler, Schnellreise) wird weiter sofort ganz gebaut.
  update(px, pz, force) {
    this.px = px; this.pz = pz;
    if (this.control) this.control.update(px, pz);
    const [pi, pj] = this.tileOf(px, pz);
    const reach = Math.ceil(REGION.drop / Math.min(this.tw, this.th)) + 1;
    const want = [];
    for (let tj = pj - reach; tj <= pj + reach; tj++) for (let ti = pi - reach; ti <= pi + reach; ti++) {
      const st = this.stateOf(ti, tj);
      if (!st) continue;
      const d = this.rectDist(ti, tj, px, pz);
      const key = tileKey(ti, tj), t = this.loaded.get(key);
      if (d < REGION.load && !t) want.push({ ti, tj, key, st, d });
      if (t) {
        if (d > REGION.drop) { this.dispose(t); continue; }
        if (!t.ready) { if (force || d < 350) this.finishJob(t, 'tile'); continue; }
        const treeOn = this.treesOn.has(key);
        if (!treeOn && d < REGION.trees && t.st === 2) want.push({ ti, tj, key, st, d, trees: true });
        else if (treeOn && d > REGION.treesDrop) this.dropTrees(t);
        this.hdNear(t, d);
        const lifeOn = this.lifeOn.has(key);
        if (!lifeOn && d < REGION.life && t.town) want.push({ ti, tj, key, st, d, life: true });
        else if (lifeOn && d > REGION.lifeDrop) this.dropLife(t);
      }
    }
    // ferne Kacheln (HLOD): bauen zwischen 70 % von REGION.load und REGION.far, zeigen, solange die volle Kachel fehlt
    const farWant = [];
    if (REGION.far > 0) {
      const reachF = Math.ceil(REGION.farDrop / Math.min(this.tw, this.th)) + 1;
      for (let tj = pj - reachF; tj <= pj + reachF; tj++) for (let ti = pi - reachF; ti <= pi + reachF; ti++) {
        const st = this.stateOf(ti, tj);
        if (!st) continue;
        const d = this.rectDist(ti, tj, px, pz), key = tileKey(ti, tj), f = this.far.get(key), t = this.loaded.get(key);
        if (f) {
          if (d > REGION.farDrop || (d < REGION.load * 0.5 && t && t.ready)) this.disposeFar(f);
          else if (f.ready) {
            f.group.visible = !(t && t.ready);
            // Kronendach nur bis 3,4 km: am Ende des Rings stünde es sonst als dunkle Kante vor dem Himmel
            const trees = !!(f.forest && f.forest.length) && d < 2500;
            if (f.forest) for (const m of f.forest) m.visible = trees;
            if (f.canopy) f.canopy.visible = !trees && d < REGION.far - 1200;
          }
        } else if (d < REGION.far && d > REGION.load * 0.7) farWant.push({ ti, tj, key, st, d, far: true });
      }
      farWant.sort((a, b) => a.d - b.d);
    }
    // Kacheln weit außerhalb (nach einer Schnellreise) abbauen
    if (this.loaded.size > 60 || force) for (const t of [...this.loaded.values()]) if (this.rectDist(t.ti, t.tj, px, pz) > REGION.drop) this.dispose(t);
    if (this.far.size > 160 || force) for (const f of [...this.far.values()]) if (this.rectDist(f.ti, f.tj, px, pz) > REGION.farDrop) this.disposeFar(f);
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const w of want) if (force || w.d < 350) this.runJob(this.startJob(w), Infinity);
    // Höhen der nächsten Kacheln beim Worker bestellen; eine Kachel beginnt erst, wenn ihre Höhen da sind (spätestens nach 1,5 s
    // rechnet sie selbst), solange baut update() andere Aufträge
    for (const w of want) if (!w.trees && !w.life) this.prefetch(w);
    if (this.hcache.size > 24) for (const [k, c] of this.hcache) if (c.hg0 && !want.some(w => w.key === k)) this.hcache.delete(k);
    const ready = w => w.trees || w.life || !this.hw || (c => c && (c.hg0 || performance.now() - c.pending > 1500))(this.hcache.get(w.key));
    // sonst ein Auftrag nach dem anderen, bis die Zeit für dieses Bild um ist
    const until = performance.now() + REGION.sliceMs;
    while (performance.now() < until) {
      if (!this.job) {
        let w = want.find(w => !(force || w.d < 350) && ready(w));
        if (w) want.splice(want.indexOf(w), 1);
        else w = farWant.shift(); // ferne Kacheln zuletzt
        if (!w) break;
        this.job = this.startJob(w);
        if (!this.job) continue;
      }
      if (this.runJob(this.job, until)) this.job = null;
    }
    this.stats.frameMs = performance.now() - t0;
    if (this.stats.frameMs > this.stats.maxFrame) this.stats.maxFrame = this.stats.frameMs;
  }
  // Auftrag anlegen: { art, Kachel, Schritte }; Kachel, Bäume oder Ortsleben
  startJob(w) {
    if (w.far) {
      const f = { ti: w.ti, tj: w.tj, key: w.key, st: w.st, x0: this.tileX(w.ti), z0: this.tileZ(w.tj) };
      f.x1 = f.x0 + this.tw; f.z1 = f.z0 + this.th;
      this.far.set(f.key, f);
      return { kind: 'far', t: f, it: this.farSteps(f), ms: 0 };
    }
    if (w.trees || w.life) {
      const t = this.loaded.get(w.key);
      if (!t || !t.ready || !t.d) return null;
      if (w.trees) {
        if (this.treesOn.has(t.key)) return null;
        this.treesOn.add(t.key);
        return { kind: 'trees', t, it: this.treeSteps(t), ms: 0 };
      }
      if (this.lifeOn.has(t.key)) return null;
      return { kind: 'life', t, it: (function* (R) { R.buildLife(t); })(this), ms: 0 };
    }
    const t = { ti: w.ti, tj: w.tj, key: w.key, st: w.st, x0: this.tileX(w.ti), z0: this.tileZ(w.tj) };
    t.x1 = t.x0 + this.tw; t.z1 = t.z0 + this.th;
    this.loaded.set(t.key, t);
    return { kind: 'tile', t, it: this.tileSteps(t), ms: 0 };
  }
  // Schritte ausführen, bis der Auftrag fertig ist (true) oder die Zeit abgelaufen (false)
  runJob(job, until) {
    if (!job) return true;
    for (;;) {
      const s0 = performance.now(), r = job.it.next(), dt = performance.now() - s0;
      job.ms += dt;
      if (dt > this.stats.maxStep) this.stats.maxStep = dt;
      if (r.done) { if (job.kind === 'tile') { this.stats.built++; this.stats.ms += job.ms; } return true; }
      if (performance.now() >= until) return false;
    }
  }
  // laufenden Auftrag für diese Kachel sofort zu Ende bringen
  finishJob(t, kind) {
    const job = this.job;
    if (!job || job.t !== t || job.kind !== kind) return false;
    this.job = null;
    this.runJob(job, Infinity);
    return true;
  }
  rectDist(ti, tj, x, z) {
    const x0 = this.tileX(ti), z0 = this.tileZ(tj), x1 = x0 + this.tw, z1 = z0 + this.th;
    return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
  }
  // Alle Kacheln um einen Punkt sofort bauen (Spielstart, Schnellreise)
  ensure(x, z, radius = 900) {
    const [pi, pj] = this.tileOf(x, z);
    for (let tj = pj - 2; tj <= pj + 2; tj++) for (let ti = pi - 2; ti <= pi + 2; ti++) {
      const st = this.stateOf(ti, tj), key = tileKey(ti, tj);
      if (!st || this.rectDist(ti, tj, x, z) > radius) continue;
      let t = this.loaded.get(key);
      if (!t) t = this.buildTile({ ti, tj, key, st });
      else if (!t.ready) this.finishJob(t, 'tile');
      this.finishJob(t, 'trees');
      if (st === 2 && !this.treesOn.has(key) && this.rectDist(ti, tj, x, z) < REGION.trees) this.buildTrees(t);
      if (t.town && !this.lifeOn.has(key) && this.rectDist(ti, tj, x, z) < REGION.life) this.buildLife(t);
    }
  }

  // Stücke für Straßen, Häuser, Gewässer: je Kachelviertel ein Mesh (Sichtbarkeitsprüfung), seit v3.12.0 statt 250 m
  chunks(t) { return new Chunks(Math.max(this.tw, this.th) / 2 + 1, t.x0, t.z0); }
  // Kachel sofort ganz bauen
  buildTile(w) {
    const job = this.startJob(w);
    this.runJob(job, Infinity);
    return job.t;
  }
  // Kachel in Schritten: zwischen zwei yield gibt update() die Kontrolle ans Bild zurück, wenn die Zeit um ist
  *tileSteps(t) {
    t.group = new THREE.Group();
    t.edges = []; t.edgeGrid = new U.Grid(16); t.polyGrid = new U.Grid(32); t.roadGrid = new U.Grid(25);
    t.buildings = [];
    this.makeHeights(t); yield;
    this.makeMaterials(t); yield;
    this.buildTerrain(t); yield;
    if (t.st === 2) {
      t.d = t.d || this.decodeTile(t);
      yield* this.roadSteps(t); yield;
      yield* this.waterSteps(t); yield;
      yield* this.buildingSteps(t);
      yield* this.sidewalkSteps(t); yield;
      this.buildRails(t);
      t.town = t.buildings.length >= REGION.townBuildings;
      const rr = this.rural.get(t.key);
      if (this.land && rr && rr.tracks.length) { yield; this.land.buildTracks(t, rr.tracks); }
      if (this.land) { yield; this.land.buildCanopy(t); }
    }
    if (this.land) this.land.tileChanged(t);
    this.world.group.add(t.group);
    for (const a of this.anchors.get(t.key) || []) a.obj.position.y = this.world.heightAt(a.x, a.z) + a.dy;
    t.ready = true;
  }

  dispose(t) {
    if (this.job && this.job.t === t) this.job = null; // halb gebauter Auftrag: Reste räumt das Folgende ab
    this.dropTrees(t);
    this.dropLife(t);
    if (t.group) { t.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); this.world.group.remove(t.group); }
    for (const m of t.mats || []) m.dispose();
    if (t.tex) t.tex.dispose();
    if (t.texHd) t.texHd.dispose();
    if (t.coverTex) { t.coverTex.dispose(); t.fieldTex.dispose(); }
    if (t.horTex) { t.horTex[0].dispose(); t.horTex[1].dispose(); }
    t.disposed = true;
    this.loaded.delete(t.key);
  }

  // ---------------- Ferne Kacheln (HLOD, seit v3.12.0, Grafik-Phase 8) ----------------
  // Zwischen REGION.load und REGION.far zeigt jede Kachel eine einfache Fassung: Gelände im groben 50-m-Raster mit dem
  // kleinen Luftbild (*.256.jpg), Häuser als Körper mit Sattel- bzw. Flachdach (Dach mit Luftbild), Wald als
  // Kronendach-Hülle. Drei Zeichenaufrufe je Kachel; zu sehen, solange die volle Kachel nicht fertig ist.
  coarseAt(x, z) {
    const gc = (x - this.minX) / this.stepX, gr = (z - this.minZ) / this.stepZ;
    const c = Math.floor(gc), r = Math.floor(gr), tx = gc - c, tz = gr - r;
    const h00 = this.coarse(c, r), h10 = this.coarse(c + 1, r), h01 = this.coarse(c, r + 1), h11 = this.coarse(c + 1, r + 1);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }
  farWallMaterial() {
    return this._farWall || (this._farWall = new THREE.MeshLambertMaterial({ vertexColors: true }));
  }
  *farSteps(f) {
    const TC = this.TC, S = TC + 1, F = REGION.F, C = this.core, sx = this.stepX, sz = this.stepZ;
    const c0 = f.ti * TC, r0 = f.tj * TC, x0 = this.tileX(f.ti), z0 = this.tileZ(f.tj);
    f.group = new THREE.Group();
    f.group.visible = false;
    f.mat = new THREE.MeshLambertMaterial({ map: this.placeholder(), color: ORTHO_TINT, vertexColors: true });
    this.farPhoto(f);
    // Gelände: Punkte des groben Gitters, weiche Normalen aus den Nachbarn, Schürze gegen Spalten zur vollen Kachel
    const pos = [], nor = [], col = [], uv = [], idx = [];
    const h = (c, r) => this.coarse(c0 + c, r0 + r);
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
      const hx = (h(c + 1, r) - h(c - 1, r)) / (2 * sx), hz = (h(c, r + 1) - h(c, r - 1)) / (2 * sz), l = Math.hypot(hx, 1, hz);
      pos.push(x0 + c * sx, h(c, r), z0 + r * sz); nor.push(-hx / l, 1 / l, -hz / l); col.push(1, 1, 1); uv.push(c / TC, 1 - r / TC);
    }
    for (let r = 0; r < TC; r++) for (let c = 0; c < TC; c++) {
      const gc = (c0 + c) * F, gr = (r0 + r) * F;
      if (gc >= 0 && gc < C.fc && gr >= 0 && gr < C.fr) continue; // Innenstadt
      const a = r * S + c, b = a + 1, d = a + S, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const rim = [];
    for (let c = 0; c < S; c++) rim.push(c);
    for (let r = 1; r < S; r++) rim.push(r * S + TC);
    for (let c = TC - 1; c >= 0; c--) rim.push(TC * S + c);
    for (let r = TC - 1; r >= 0; r--) rim.push(r * S);
    let v = S * S;
    for (let k = 0; k < rim.length; k++) {
      const i = rim[k];
      pos.push(pos[i * 3], pos[i * 3 + 1] - 8, pos[i * 3 + 2]); nor.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      col.push(1, 1, 1); uv.push(uv[i * 2], uv[i * 2 + 1]);
      if (k) { const a = rim[k - 1], as = v - 1; idx.push(a, as, i, i, as, v, a, i, as, i, v, as); }
      v++;
    }
    yield;
    const d = f.st === 2 ? this.decodeTile(f) : null;
    if (d) {
      // Häuser: Wände (eigene Farbe je Bautyp) und Dächer (Luftbild von oben, mit im Geländenetz)
      const walls = new Bucket(), roofs = new Bucket(), white = new THREE.Color(1, 1, 1);
      const tuv = (x, z) => [(x - x0) / this.tw, 1 - (z - z0) / this.th];
      const rt = { b: roofs, uv: tuv };
      let k = 0;
      for (const b of d.buildings) {
        if (++k % 200 === 0) yield;
        const ring = b.p, n = ring.length / 2;
        if (b.t === 'roof' || b.t === 'carport' || n < 3) continue;
        const area = U.polyArea(ring), absA = Math.abs(area), sgn = area > 0 ? 1 : -1;
        if (absA < 12) continue;
        let minH = Infinity, maxH = -Infinity;
        for (let i = 0; i < ring.length; i += 2) { const y = this.coarseAt(ring[i], ring[i + 1]); minH = Math.min(minH, y); maxH = Math.max(maxH, y); }
        const arch = b.a || 0, hall = HALL_TYPES.has(b.t) || arch === ARCH.GEWERBE || arch === ARCH.INDUSTRIE || arch === ARCH.AGRAR_NEU;
        const house = (arch >= ARCH.HOF && arch <= ARCH.MFH) || arch === ARCH.AGRAR_ALT || (!arch && HIP_TYPES.has(b.t));
        const pitched = n === 4 && !b.f && b.rs !== 5 && absA <= 900 && (b.r || house) && arch !== ARCH.NEBEN;
        const eave = pitched ? (b.h <= 4.6 ? 3.3 : arch === ARCH.NEUBAU ? 6.1 : 5.2) : arch === ARCH.NEBEN ? Math.min(b.h, 3) : b.h;
        const top = Math.max(minH + eave, maxH + 2), base = minH - 2;
        const hs = U.hashStr(b.t + ring[0].toFixed(1) + ring[1].toFixed(1));
        const pal = ARCH_WALLS[arch] || (arch === ARCH.INDUSTRIE ? INDUSTRIE_WALLS : arch === ARCH.AGRAR_NEU ? AGRAR_NEU_WALLS
          : FARM_TYPES.has(b.t) || arch === ARCH.AGRAR_ALT ? BARN_WALLS : arch === ARCH.NEBEN ? NEBEN_WALLS : hall ? GEWERBE_WALLS : RURAL_FACADES);
        const wc = new THREE.Color(pal[hs % pal.length]).multiplyScalar(0.92);
        const f4 = pitched ? HouseKit.frame(ring) : null;
        const rh = f4 ? Math.min(f4.d * Math.tan((arch === ARCH.NEUBAU ? 30 : arch === ARCH.EFH ? 36 : 45) * Math.PI / 180), 7) : 0;
        const du = (x, z) => (x - f4.c[0]) * f4.ux + (z - f4.c[1]) * f4.uz;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
          const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
          if (len < 0.01) continue;
          const ox = sgn * dz / len, oz = -sgn * dx / len;
          const A0 = [ax, base, az], B0 = [bx, base, bz], A1 = [ax, top, az], B1 = [bx, top, bz];
          walls.tri(A0, B0, B1, wc, null, null, null, ox, 0, oz); walls.tri(A0, B1, A1, wc, null, null, null, ox, 0, oz);
          if (!f4) continue;
          if (Math.abs(dx / len * f4.ux + dz / len * f4.uz) > 0.7) {
            // Traufseite: Dachfläche bis zum First
            const RA = f4.X(du(ax, az), 0, top + rh), RB = f4.X(du(bx, bz), 0, top + rh);
            roofs.tri(A1, B1, RB, white, tuv(ax, az), tuv(bx, bz), tuv(RB[0], RB[2]), 0, 1, 0);
            roofs.tri(A1, RB, RA, white, tuv(ax, az), tuv(RB[0], RB[2]), tuv(RA[0], RA[2]), 0, 1, 0);
          } else {
            // Giebel
            const R = f4.X(du((ax + bx) / 2, (az + bz) / 2), 0, top + rh);
            walls.tri(A1, B1, R, wc, null, null, null, ox, 0, oz);
          }
        }
        if (!f4) this.world.flatRoof(rt, [ring], top, white, 1);
      }
      // Dächer ins Geländenetz (gleiches Material und Luftbild)
      let base = pos.length / 3;
      for (let i = 0; i < roofs.pos.length; i++) pos.push(roofs.pos[i]);
      for (let i = 0; i < roofs.nor.length; i++) nor.push(roofs.nor[i]);
      for (let i = 0; i < roofs.col.length; i++) col.push(roofs.col[i]);
      for (let i = 0; i < roofs.uv.length; i++) uv.push(roofs.uv[i]);
      for (let i = base; i < pos.length / 3; i++) idx.push(i);
      const wg = walls.geometry();
      if (wg) f.group.add(new THREE.Mesh(wg, this.farWallMaterial()));
      yield;
      // Wald: Kronendach-Hülle über dem groben Gitter
      const forests = d.areas.filter(a => a.k === 'forest').map(a => ({ a, bb: U.polyBBox(a.p) }));
      if (forests.length && this.land) {
        const inF = new Uint8Array(S * S);
        let any = false;
        for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
          const x = x0 + c * sx, z = z0 + r * sz;
          for (const { a, bb } of forests) {
            if (x < bb.minX || x > bb.maxX || z < bb.minZ || z > bb.maxZ || !U.pointInPoly(x, z, a.p)) continue;
            if (a.ho && a.ho.some(q => U.pointInPoly(x, z, q))) continue;
            inF[r * S + c] = 1; any = true; break;
          }
        }
        if (any) {
          const cp = [], cc = [], ci = [], map = new Int32Array(S * S).fill(-1), rnd = U.rng(f.key * 13 + 5);
          for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
            let near = inF[r * S + c];
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = c + dc, w = r + dr; if (q >= 0 && w >= 0 && q < S && w < S) near |= inF[w * S + q]; }
            if (!near) continue;
            map[r * S + c] = cp.length / 3;
            cp.push(x0 + c * sx, h(c, r) + (inF[r * S + c] ? LAND.canopyH * (0.75 + 0.45 * rnd()) : -2), z0 + r * sz);
            const vv = 0.7 + rnd() * 0.45; cc.push(vv * 0.9, vv, vv * 0.85);
          }
          for (let r = 0; r < TC; r++) for (let c = 0; c < TC; c++) {
            const a = map[r * S + c], b = map[r * S + c + 1], e1 = map[(r + 1) * S + c], e2 = map[(r + 1) * S + c + 1];
            if (a < 0 || b < 0 || e1 < 0 || e2 < 0) continue;
            if (inF[r * S + c] + inF[r * S + c + 1] + inF[(r + 1) * S + c] + inF[(r + 1) * S + c + 1] < 2) continue;
            ci.push(a, e1, b, b, e1, e2);
          }
          if (ci.length) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
            g.setIndex(ci); g.computeVertexNormals();
            f.canopy = new THREE.Mesh(g, this.land.canopyMaterial());
            f.group.add(f.canopy);
          }
        }
      }
      // Wald aus Impostor-Bäumen (bis 2,5 km statt der Kronendach-Hülle): Dichte und Nadelholz-Anteil wie bei den
      // Bäumen der vollen Kacheln (treeSteps), zwei Zeichenaufrufe je Kachel
      const imps = forests.length ? this.treeImpostors() : null;
      if (imps) {
        yield;
        const rnd = U.rng(f.key * 29 + 11), lists = [[], []];
        let budget = 6000;
        for (const { a, bb } of forests) {
          const hh = U.hashStr(a.k + a.p[0] + ',' + a.p[1]), conifer = 0.15 + (hh % 100) / 100 * 0.7;
          const count = Math.min(Math.round(Math.abs(U.polyArea(a.p)) / 115), budget);
          for (let k = 0, tries = 0; k < count && tries < count * 2; tries++) {
            const x = bb.minX + rnd() * (bb.maxX - bb.minX), z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
            if (!U.pointInPoly(x, z, a.p) || (a.ho && a.ho.some(q => U.pointInPoly(x, z, q)))) continue;
            lists[rnd() < conifer ? 1 : 0].push(x, z, 0.55 + Math.pow(rnd(), 0.7) * 1.15);
            k++;
          }
          budget -= count;
          if (budget <= 0) break;
        }
        const greens = ['#5f8d3e', '#4f7d35', '#6a9a45', '#577f3a', '#7a9e4a', '#46703a'];
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
        f.forest = [];
        lists.forEach((L, kind) => {
          const n = L.length / 3;
          if (!n) return;
          const m = new THREE.InstancedMesh(imps[kind].geo, imps[kind].mat, n);
          for (let i = 0; i < n; i++) {
            const x = L[i * 3], z = L[i * 3 + 1], s = L[i * 3 + 2];
            q.setFromAxisAngle(up, rnd() * 6.28); ps.set(x, this.coarseAt(x, z) - 0.2, z); sc.set(s, s * (0.85 + rnd() * 0.35), s);
            m.setMatrixAt(i, m4.compose(ps, q, sc));
            m.setColorAt(i, c.set(kind ? '#3f6634' : greens[Math.floor(rnd() * greens.length)]).multiplyScalar(0.85 + rnd() * 0.3));
          }
          m.computeBoundingSphere(); m.visible = false;
          f.forest.push(m); f.group.add(m);
        });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    f.group.add(new THREE.Mesh(g, f.mat));
    this.world.group.add(f.group);
    f.ready = true;
  }
  // kleines Luftbild der Kachel: Vorschaubild der KTX2-Fassung, sonst das JPG, sonst aus den Flächen gemalt
  farPhoto(f) {
    const flag = this.ortho && this.ortho.tiles[f.ti + ',' + f.tj], K = window.COBURG_REGION_KTX2;
    const name = (flag === 2 ? 'th' : 'by') + f.ti + '_' + f.tj;
    const done = tex => {
      if (f.disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4;
      f.tex = tex; f.mat.map = tex;
    };
    if (!flag) { if (f.st === 2) { f.d = this.decodeTile(f); done(new THREE.CanvasTexture(this.paintTile(f, 128))); f.d = null; } return; }
    const im = new Image();
    im.onload = () => {
      if (f.disposed) return;
      // große JPGs (Mischkacheln) auf 256 px verkleinern: weniger Grafikspeicher
      if (im.width > 256) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; cv.getContext('2d').drawImage(im, 0, 0, 256, 256); done(new THREE.CanvasTexture(cv)); }
      else { const tx = new THREE.Texture(im); tx.needsUpdate = true; done(tx); }
    };
    im.src = flag !== 3 && K && K.tiles[name] ? `data/region/ortho/${name}.256.jpg` : `data/region/ortho/${name}.jpg`;
  }
  disposeFar(f) {
    if (this.job && this.job.t === f) this.job = null;
    // Impostor-Wald: gemeinsame Form (nicht freigeben), nur die Instanzpuffer
    if (f.group) { f.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.isMesh) o.geometry.dispose(); }); this.world.group.remove(f.group); }
    if (f.mat) f.mat.dispose();
    if (f.tex) f.tex.dispose();
    f.disposed = true;
    this.far.delete(f.key);
  }

  // Kachel-Daten entpacken (Formate siehe tools/convert-region.js)
  decodeTile(t) {
    const raw = this.R.data[t.ti + ',' + t.tj] || {};
    const line = (a, from = 0) => { const o = []; let x = 0, z = 0; for (let k = from; k < a.length; k += 2) { x += a[k]; z += a[k + 1]; o.push(x / 10, z / 10); } return o; };
    const types = this.R.types, names = this.R.names;
    return {
      // Flags: Bit 0 Satteldach, Bit 1 Flachdach, Bits 2–5 Bautyp (tools/classify-buildings.js, 0 = ältere Daten), Bit 6 Fachwerk,
      // Bits 7–9 Dachform aus OSM (1 Sattel, 2 Walm, 3 Krüppelwalm, 4 Pult, 5 Flach, 6 Zelt, 7 Mansard), Bits 10–11 Bauzeit
      buildings: (raw.b || []).map(b => ({ t: types[b[0]], h: b[1] / 10, r: b[2] & 1, f: b[2] & 2, a: (b[2] >> 2) & 15, fw: (b[2] >> 6) & 1,
        rs: (b[2] >> 7) & 7, e: (b[2] >> 10) & 3,
        n: b[3] >= 0 ? names[b[3]] : undefined, p: line(b, 4) })),
      areas: (raw.a || []).map(a => ({ k: a[0], p: line(a[1]), ho: a[2] ? a[2].map(h => line(h)) : undefined })),
      trees: line(raw.t || []),
      water: (raw.w || []).map(w => ({ w: w[0] / 10, p: line(w, 1) })),
      rails: (raw.r || []).map(r => line(r)),
      shops: (raw.s || []).map(q => ({ name: q[0], kind: q[1], x: q[2] / 10, z: q[3] / 10 })),
    };
  }

  // ---------------- Material und Luftbild ----------------
  placeholder() {
    if (!this._ph) {
      const d = new Uint8Array([150, 172, 110, 255]);
      this._ph = new THREE.DataTexture(d, 1, 1); this._ph.colorSpace = THREE.SRGBColorSpace; this._ph.needsUpdate = true;
    }
    return this._ph;
  }
  makeMaterials(t) {
    if (!this._detail) this._detail = this.world.makeDetailTexture();
    if (this.land) {
      // Bodenbedeckung aus den OSM-Flächen, Material mischt Gras, Acker, Waldboden und Luftbild
      if (t.st === 2) { t.d = t.d || this.decodeTile(t); this.land.paintCover(t); }
      t.terrainMat = this.land.terrainMaterial(t);
    } else {
      t.terrainMat = new THREE.MeshLambertMaterial({ map: this.placeholder(), color: ORTHO_TINT });
      this.world.addDetail(t.terrainMat, this._detail);
    }
    t.roofMat = this.world.roofShader(this.world.surfaceMat({ map: this.placeholder(), vertexColors: true }));
    t.mats = [t.terrainMat, t.roofMat];
    const flag = this.ortho && this.ortho.tiles[t.ti + ',' + t.tj];
    t.photo = !!flag;
    if (flag) this.loadOrtho(t, flag);
    else if (t.st === 2) {
      // ohne Luftbild: Bodentextur aus den Flächen malen
      t.d = t.d || this.decodeTile(t);
      this.setTexture(t, new THREE.CanvasTexture(this.paintTile(t, 256)));
    }
  }
  setTexture(t, tex) {
    if (t.disposed) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Mat.aniso(this.world.renderer);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    t.tex = tex;
    // Gehölze aus dem Luftbild und die Farbe des Bewuchses brauchen das Foto: jetzt nachholen
    t.photoSmall = null;
    if (this.land) this.land.tileChanged(t);
    if (this.treesOn.has(t.key) && !t.photoVeg) this.rebuildTrees(t);
    if (t.hd === 'an') return; // schärferes Bild liegt schon
    t.terrainMat.map = tex; t.roofMat.map = tex;
  }
  // flag 1: Bayern, 2: nur Thüringen, 3: beides (weiße Flächen im bayerischen Bild aus dem thüringischen füllen)
  loadOrtho(t, flag) {
    const url = pre => `data/region/ortho/${pre}${t.ti}_${t.tj}.jpg`;
    const img = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const job = flag === 3 ? Promise.all([img(url('by')), img(url('th'))]).then(([a, b]) => {
      const cv = document.createElement('canvas'); cv.width = a.width; cv.height = a.height;
      const c = cv.getContext('2d');
      c.drawImage(b, 0, 0, a.width, a.height);
      const tb = c.getImageData(0, 0, a.width, a.height);
      c.drawImage(a, 0, 0);
      const ta = c.getImageData(0, 0, a.width, a.height), A = ta.data, B = tb.data;
      for (let k = 0; k < A.length; k += 4) if (A[k] > 246 && A[k + 1] > 246 && A[k + 2] > 246) { A[k] = B[k]; A[k + 1] = B[k + 1]; A[k + 2] = B[k + 2]; }
      c.putImageData(ta, 0, 0);
      return new THREE.CanvasTexture(cv);
    }) : this.ktx2Or(`${flag === 2 ? 'th' : 'by'}${t.ti}_${t.tj}`, () => img(url(flag === 2 ? 'th' : 'by')).then(im => { const tx = new THREE.Texture(im); tx.needsUpdate = true; return tx; }), t);
    job.then(tex => this.setTexture(t, tex)).catch(e => console.warn('Luftbild fehlt', t.ti, t.tj, e));
  }
  // Luftbild als KTX2 (tools/ortho-ktx2.mjs, Liste in data/region/ortho-ktx2.js), sonst bzw. bei Fehlern das JPG
  // (komprimierte Texturen haben keine lesbaren Pixel: für Bewuchsfarbe und Gehölze aus dem Luftbild lädt die Kachel
  // dann das kleine Vorschaubild {name}.256.jpg nach t.photoImg)
  ktx2Or(name, jpg, t) {
    const K = window.COBURG_REGION_KTX2;
    if (!K || !K.tiles[name] || !Mat.budget.ktx2) return jpg();
    return Mat.loadKTX2(this.world.renderer, `data/region/ortho/${name}.ktx2`).then(tex => {
      if (t && !t.photoImg) {
        const im = new Image();
        im.onload = () => {
          if (t.disposed) return;
          t.photoImg = im; t.photoSmall = null;
          if (this.land) this.land.tileChanged(t);
          if (this.treesOn.has(t.key) && !t.photoVeg) this.rebuildTrees(t);
        };
        im.src = `data/region/ortho/${name}.256.jpg`;
      }
      return tex;
    }).catch(e => { console.warn('KTX2', name, e.message, '– JPG'); return jpg(); });
  }
  // Luftbild der Kachel als lesbares Bild (Vorschaubild bei KTX2, sonst das geladene Bild)
  photoImage(t) { return t.photoImg || Mat.drawable(t.tex && t.tex.image); }
  // Schärferes Luftbild (tools/fetch-region-ortho-hd.js) für Kacheln direkt um den Spieler, weiter weg wieder das normale
  hdNear(t, d) {
    const H = window.COBURG_REGION_ORTHO_HD;
    if (!H || !this.ortho || !H.tiles[t.ti + ',' + t.tj]) return;
    if (d < 450 && !t.hd) {
      t.hd = 'laden';
      const jpg = () => new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => { const tx = new THREE.Texture(im); tx.needsUpdate = true; res(tx); };
        im.onerror = rej;
        im.src = `data/region/ortho/hd${t.ti}_${t.tj}.jpg`;
      });
      this.ktx2Or(`hd${t.ti}_${t.tj}`, jpg).then(tx => {
        if (t.disposed || t.hd !== 'laden') { tx.dispose(); return; }
        tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = Mat.aniso(this.world.renderer);
        tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
        t.texHd = tx; t.hd = 'an';
        t.terrainMat.map = tx; t.roofMat.map = tx;
      }).catch(() => { t.hd = 'fehlt'; });
    } else if (d > 900 && t.hd === 'an') {
      t.terrainMat.map = t.tex || this.placeholder(); t.roofMat.map = t.tex || this.placeholder();
      t.texHd.dispose(); t.texHd = null; t.hd = null;
    } else if (d > 900 && t.hd === 'laden') t.hd = null;
  }

  // Gemalte Bodentextur einer Kachel (ohne Luftbild)
  paintTile(t, px) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const c = cv.getContext('2d');
    c.fillStyle = '#8a9f5a'; c.fillRect(0, 0, px, px);
    c.setTransform(px / this.tw, 0, 0, px / this.th, -t.x0 * px / this.tw, -t.z0 * px / this.th);
    const order = Object.keys(AREA_STYLE);
    const d = t.d || { areas: [], water: [], rails: [] };
    for (const a of d.areas.slice().sort((x, y) => order.indexOf(x.k) - order.indexOf(y.k))) {
      c.fillStyle = AREA_STYLE[a.k] || AREA_STYLE[{ farmyard: 'farmland', orchard: 'meadow', scrub: 'meadow', river: 'water' }[a.k]] || '#8a9f5a';
      this.world.pathPoly(c, a.p, a.ho); c.fill('evenodd');
    }
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = AREA_STYLE.water;
    for (const w of d.water) { c.lineWidth = Math.max(w.w, 2); this.world.pathLine(c, w.p); c.stroke(); }
    c.strokeStyle = '#7d756b';
    for (const r of d.rails) { c.lineWidth = 4; this.world.pathLine(c, r); c.stroke(); }
    return cv;
  }

  // ---------------- Gelände ----------------
  buildTerrain(t) {
    const N = this.N, S = N + 1, H = t.hg, HS = t.hs;
    const verts = S * S, skirtV = 4 * S;
    const pos = new Float32Array((verts + skirtV) * 3), nor = new Float32Array((verts + skirtV) * 3), uv = new Float32Array((verts + skirtV) * 2);
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
      const i = r * S + c, hi = (r + 1) * HS + c + 1;
      pos[i * 3] = t.x0 + c * this.fx; pos[i * 3 + 1] = H[hi]; pos[i * 3 + 2] = t.z0 + r * this.fz;
      const hx = (H[hi + 1] - H[hi - 1]) / (2 * this.fx), hz = (H[hi + HS] - H[hi - HS]) / (2 * this.fz);
      const l = Math.hypot(hx, 1, hz);
      nor[i * 3] = -hx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -hz / l;
      uv[i * 2] = c / N; uv[i * 2 + 1] = 1 - r / N;
    }
    const idx = [];
    const C = this.core, fcBase = t.ti * N, frBase = t.tj * N;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const gc = fcBase + c, gr = frBase + r;
      if (gc >= 0 && gc < C.fc && gr >= 0 && gr < C.fr) continue; // Innenstadt
      const a = r * S + c, b = a + 1, d = a + S, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    // Schürzen: Rand nach unten verlängert (beidseitig), verdeckt kleine Spalten zur Nachbarkachel
    const rim = [];
    for (let c = 0; c < S; c++) rim.push(c);                              // Norden
    for (let r = 0; r < S; r++) rim.push(r * S + N);                       // Osten
    for (let c = N; c >= 0; c--) rim.push(N * S + c);                      // Süden
    for (let r = N; r >= 0; r--) rim.push(r * S);                          // Westen
    let v = verts;
    const rimIdx = [];
    for (const i of rim.slice(0, skirtV)) {
      pos[v * 3] = pos[i * 3]; pos[v * 3 + 1] = pos[i * 3 + 1] - REGION.skirt; pos[v * 3 + 2] = pos[i * 3 + 2];
      nor[v * 3] = nor[i * 3]; nor[v * 3 + 1] = nor[i * 3 + 1]; nor[v * 3 + 2] = nor[i * 3 + 2];
      uv[v * 2] = uv[i * 2]; uv[v * 2 + 1] = uv[i * 2 + 1];
      rimIdx.push([i, v]); v++;
    }
    for (let k = 0; k + 1 < rimIdx.length; k++) {
      const [a, as] = rimIdx[k], [b, bs] = rimIdx[k + 1];
      if (pos[a * 3] === pos[b * 3] && pos[a * 3 + 2] === pos[b * 3 + 2]) continue;
      idx.push(a, as, b, b, as, bs, a, b, as, b, bs, as);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, t.terrainMat);
    m.receiveShadow = true;
    t.group.add(m);
  }

  // ---------------- Straßen ----------------
  roadMaterials() {
    if (!this._roadMat) {
      const mat = o => this.world.roadShader(this.world.surfaceMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 - o, polygonOffsetUnits: -2 - o * 2 }));
      this._roadMat = mat(3); this._markMat = mat(5);
    }
    return [this._roadMat, this._markMat];
  }
  buildRoads(t) { for (const _ of this.roadSteps(t)); }
  // Straßen in Schritten: gibt etwa alle 2 ms ab (Zeitscheiben, siehe update)
  *roadSteps(t) {
    const runs = this.runs.get(t.key);
    if (!runs) return;
    const W = this.world, roads = this.chunks(t), marks = this.chunks(t);
    const rnd = U.rng(t.key);
    const white = new THREE.Color('#e9e6dc');
    const y = REGION.roadY;
    const posts = []; // Leitpfosten der Kachel
    let ty = performance.now();
    for (const run of runs) {
      if (performance.now() - ty > 2) { yield; ty = performance.now(); }
      const e = this.graph.edges[run.e];
      let raw = e.p.slice(run.k0 * 2, run.k1 * 2 + 2);
      for (let k = 0; k + 2 < raw.length; k += 2) {
        const ax = raw[k], az = raw[k + 1], bx = raw[k + 2], bz = raw[k + 3];
        t.roadGrid.insert({ ax, az, bx, bz, n: e.n, k: 'road', h: e.h, w: e.w }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
      }
      // an Kreuzungen (eigene Fläche) zurücknehmen, nach Bogenlänge auf der ganzen Kante (die Rücknahme kann in eine
      // Nachbarkachel reichen)
      const Ja = this.junction(e.a), Jb = this.junction(e.b);
      if (Ja || Jb) {
        const cum = this.edgeCum(e), len = cum[cum.length - 1];
        const s0 = Math.max(cum[run.k0], Ja ? this.armD(Ja, run.e, true) : 0), s1 = Math.min(cum[run.k1], len - (Jb ? this.armD(Jb, run.e, false) : 0));
        if (s1 - s0 < 0.3) continue;
        raw = this.sliceEdge(e, s0, s1);
      }
      const pts = W.resample(raw, 4), n = pts.length / 2, half = e.w / 2;
      const col = U.color(/motorway|trunk/.test(e.h) ? '#45484c' : '#3d4045', 0.08, rnd);
      // Hochbrücke: Höhe entlang der Kante (Abstand ab Kantenanfang)
      const B = e.deck;
      const sAt = [];
      if (B) { let acc = B.cum[run.k0]; sAt.push(acc); for (let i = 1; i < n; i++) { acc += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]); sAt.push(acc); } }
      // Fahrbahn: auf Brücken die Platte, sonst das Gelände ohne ausgehobene Gewässer (kein Wasser auf der Straße)
      const roadAt = (x, z) => this.heightAt0(x, z);
      const hAt = (x, z, i) => B ? this.deckH(B, sAt[i]) : roadAt(x, z);
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let d1x = pts[i * 2] - pts[a * 2], d1z = pts[i * 2 + 1] - pts[a * 2 + 1];
        let d2x = pts[b * 2] - pts[i * 2], d2z = pts[b * 2 + 1] - pts[i * 2 + 1];
        let l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
        if (l1 < 1e-6) { d1x = d2x; d1z = d2z; l1 = l2; }
        if (l2 < 1e-6) { d2x = d1x; d2z = d1z; l2 = l1; }
        d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
        let tx = d1x + d2x, tz = d1z + d2z;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const miter = Math.min(1 / Math.max(0.35, tx * d2x + tz * d2z), 2.5);
        const nx = -tz * half * miter, nz = tx * half * miter, x = pts[i * 2], z = pts[i * 2 + 1];
        L.push([x + nx, hAt(x + nx, z + nz, i) + y, z + nz]);
        R.push([x - nx, hAt(x - nx, z - nz, i) + y, z - nz]);
      }
      if (B && B.low) {
        const water = (x, z) => t.waterAll && !t.waterAll.empty && t.waterAll.carveAt(x, z) > 0 ? this.heightAt0(x, z) - WATER.surface : -Infinity;
        lowBridgeParts(t.bridgeParts || (t.bridgeParts = this.chunks(t)), pts, L, R, (x, z) => W.heightAt(x, z), water, false);
      } else if (B) this.bridgeStructure(t, B, pts, sAt, L, R);
      else W.bankSkirt(roads, L, R);
      for (let i = 0; i < n - 1; i++) {
        const b = roads.get(pts[i * 2], pts[i * 2 + 1]);
        b.tri(L[i], R[i], R[i + 1], col, null, null, null, 0, 1, 0);
        b.tri(L[i], R[i + 1], L[i + 1], col, null, null, null, 0, 1, 0);
      }
      // runde Enden an echten Kantenenden (Kreuzungen)
      const ends = [];
      if (B) { /* Brückenenden liegen auf dem Gelände, die Kreuzung zeichnet die Nachbarstraße */ }
      else if (run.k0 === 0 && !Ja) ends.push(0);
      if (!B && run.k1 === e.p.length / 2 - 1 && !Jb) ends.push(n - 1);
      for (const ei of ends) {
        const x = pts[ei * 2], z = pts[ei * 2 + 1], b = roads.get(x, z);
        const c = [x, roadAt(x, z) + y, z];
        for (let s = 0; s < 10; s++) {
          const a1 = s / 10 * Math.PI * 2, a2 = (s + 1) / 10 * Math.PI * 2;
          const p1x = x + Math.cos(a1) * half, p1z = z + Math.sin(a1) * half, p2x = x + Math.cos(a2) * half, p2z = z + Math.sin(a2) * half;
          b.tri(c, [p1x, roadAt(p1x, p1z) + y, p1z], [p2x, roadAt(p2x, p2z) + y, p2z], col, null, null, null, 0, 1, 0);
        }
      }
      // Fahrbahnmarkierung (auf Brücken und Rampen auf der Fahrbahnhöhe)
      const hf = B ? (x, z) => { const d = this.deckAt(x, z); return d !== null ? d : roadAt(x, z); } : roadAt;
      const big = BIG_ROADS.test(e.h);
      if (big) {
        // Randlinien, Mittelstreifen (zweibahnig: Leitplanke, sonst doppelte durchgezogene Linie), Spurtrennung
        for (const E of [L, R]) {
          const k = (half - 0.45) / half, side = [];
          for (let i = 0; i < n; i++) side.push(pts[i * 2] + (E[i][0] - pts[i * 2]) * k, pts[i * 2 + 1] + (E[i][2] - pts[i * 2 + 1]) * k);
          W.dashes(side, 1e9, 1, 0.065, y + 0.02, marks, white, hf);
        }
        if (e.o) { if (e.w >= 7) W.dashes(pts, 6, 12, 0.07, y + 0.02, marks, white, hf); }
        else for (const o of [-0.14, 0.14]) W.dashes(this.offsetLine(pts, o), 1e9, 1, 0.06, y + 0.02, marks, white, hf);
      } else if (e.w >= 5.5 && !e.o && !/residential|living_street/.test(e.h)) W.dashes(pts, 3, 6, 0.07, y + 0.02, marks, white, hf);
      // Kanaldeckel, Gullys, Flickstellen, Leitpfosten (nicht auf Brücken)
      if (!B) this.roadDetails(t, e, pts, half, col, marks, U.rng(run.e * 7 + run.k0 * 13 + 1), posts);
      // Leitplanken an großen Straßen und auf Brücken/Rampen: erst nach den Häusern (Ortsdurchfahrten erkennen)
      if (big || B) (t.railJobs || (t.railJobs = [])).push({ e, run, pts, sAt, B, big });
    }
    // Kreuzungsflächen der Knoten in dieser Kachel: Fächer vom Knoten zum Rand, mit Zwischenring (folgt dem Gelände)
    t.junctions = [];
    const seen = new Set(), jc = U.color('#3e4146', 0.04, rnd);
    for (const run of runs) for (const nd of [this.graph.edges[run.e].a, this.graph.edges[run.e].b]) {
      if (seen.has(nd)) continue;
      seen.add(nd);
      const J = this.junction(nd);
      if (!J || J.x < t.x0 || J.x >= t.x1 || J.z < t.z0 || J.z >= t.z1) continue;
      t.junctions.push(J);
      const ring = this.junctionRing(J), b = roads.get(J.x, J.z), v = (q, f) => {
        const px = J.x + (q[0] - J.x) * f, pz = J.z + (q[1] - J.z) * f;
        return [px, this.heightAt0(px, pz) + y, pz];
      };
      const c = [J.x, this.heightAt0(J.x, J.z) + y, J.z];
      for (let i = 0; i < ring.length; i++) {
        const q0 = ring[i], q1 = ring[(i + 1) % ring.length];
        const m0 = v(q0, 0.5), m1 = v(q1, 0.5), o0 = v(q0, 1), o1 = v(q1, 1);
        b.tri(c, m0, m1, jc, null, null, null, 0, 1, 0);
        b.tri(m0, o0, o1, jc, null, null, null, 0, 1, 0);
        b.tri(m0, o1, m1, jc, null, null, null, 0, 1, 0);
      }
    }
    yield;
    this.nodeMarks(t, marks, white);
    this.postMesh(t, posts);
    if (this.control) this.control.build(t, t.group, (x, z) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1 && !this.inCore(x, z));
    const [rm, mm] = this.roadMaterials();
    if (t.bridgeParts) t.bridgeParts.meshes(this.world.buildingMaterials().plain, { cast: true, receive: true }).forEach(m => t.group.add(m));
    roads.meshes(rm, { receive: true }).forEach(m => t.group.add(m));
    marks.meshes(mm, { receive: true }).forEach(m => t.group.add(m));
  }

  // ---------------- Gehsteige und Belebtheit (seit v3.6.0) ----------------
  // Grobes Raster über den ganzen Landkreis (40 m): Wohn- und Geschäftshäuser, Läden, Sonderbauten (Schule, Kirche,
  // Amt …). Daraus: innerorts ja/nein (Gehsteige) und wie belebt eine Straße ist (Fußgänger).
  activity() {
    if (this._act) return this._act;
    const C = SIDEWALK.cell, m = new Map(), types = this.R.types;
    const cell = (x, z) => { const k = Math.floor(x / C) * 100003 + Math.floor(z / C); let o = m.get(k); if (!o) m.set(k, o = { h: 0, s: 0, x: 0 }); return o; };
    for (const key in this.R.data) {
      const d = this.R.data[key];
      for (const b of d.b || []) {
        const a = (b[2] >> 2) & 15, x = b[4] / 10, z = b[5] / 10;
        if ((a >= 1 && a <= 7) || (a === 0 && RURAL_HOUSES.has(types[b[0]]))) cell(x, z).h++;
        else if (a === 12) cell(x, z).x++;
      }
      for (const q of d.s || []) cell(q[2] / 10, q[3] / 10).s++;
    }
    const sum = (x, z, r, f) => {
      let n = 0;
      const i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const o = m.get(i * 100003 + j); if (o) n += o[f]; }
      return n;
    };
    const towns = this.places.filter(p => p.k === 'town' || p.k === 'city'), villages = this.places.filter(p => p.k === 'village' || p.k === 'suburb');
    return this._act = { sum, towns, villages };
  }
  // innerorts an dieser Stelle (Häuser in ≈ 45 m) und Ort groß genug: Hauptstraßen ab 10 Häusern im Umkreis von
  // 160 m, Wohn- und Nebenstraßen ab 25 (in kleinen Dörfern gibt es meist keinen Gehsteig)
  builtUp(x, z, h) {
    // Ergebnis je 20-m-Feld zwischenspeichern (viele Stützpunkte liegen im selben Feld)
    const A = this.activity(), memo = A.memo || (A.memo = new Map()), k = Math.floor(x / 20) * 100003 + Math.floor(z / 20);
    let m = memo.get(k);
    if (!m) { m = [A.sum(x, z, 40, 'h'), A.sum(x, z, 160, 'h')]; memo.set(k, m); }
    return m[0] >= 4 && m[1] >= (/residential|unclassified/.test(h) ? 25 : 10);
  }
  // Belebtheit einer Straßenstelle 0…1: Läden und Lokale, Nähe zur Stadt- bzw. Dorfmitte, Wohndichte, Schulen/Kirchen
  liveliness(x, z) {
    // je 40-m-Feld einmal rechnen
    const A = this.activity(), memo = A.live || (A.live = new Map()), k = Math.floor(x / 40) * 100003 + Math.floor(z / 40);
    if (memo.has(k)) return memo.get(k);
    const shops = Math.min(1, A.sum(x, z, 120, 's') / 8), homes = Math.min(1, A.sum(x, z, 100, 'h') / 45), pub = Math.min(1, A.sum(x, z, 120, 'x') / 2);
    let center = 0;
    for (const p of A.towns) { const d = Math.hypot(p.x - x, p.z - z); if (d < 600) center = Math.max(center, 1 - d / 600); }
    for (const p of A.villages) { const d = Math.hypot(p.x - x, p.z - z); if (d < 260) center = Math.max(center, (1 - d / 260) * 0.45); }
    const v = U.clamp(Math.max(shops * 0.95, center * 0.8) + 0.22 * homes + 0.12 * pub, 0.02, 1);
    memo.set(k, v);
    return v;
  }
  edgeCum(e) {
    if (!e.cum) { const p = e.p, c = [0]; for (let i = 1; i < p.length / 2; i++) c.push(c[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1])); e.cum = c; }
    return e.cum;
  }
  // Kreuzung am Knoten nd (seit v3.13.0, Grafik-Phase 9): Arme je einmündender Straße, nach Winkel sortiert, mit
  // Rücknahme d (ab da beginnen Fahrbahn und Gehsteig; aus dem Winkel zu den Nachbararmen, damit sich die Fahrbahnen
  // nicht überlappen, plus 2,5 m Eckradius) und den Ecken L/R am Ende der Rücknahme. null: keine eigene Fläche (weniger als
  // drei Straßen, Brücke, Innenstadt, zu kurze Straße) – dann bleiben die runden Enden.
  junction(nd) {
    const memo = this._junc || (this._junc = new Map());
    if (memo.has(nd)) return memo.get(nd);
    let J = null;
    const x = this.graph.nodes[nd * 2], z = this.graph.nodes[nd * 2 + 1], list = this.nodeEdges(nd);
    if (list.length >= 3 && !this.inCore(x, z)) {
      const arms = [];
      let ok = true;
      for (const ei of list) {
        const e = this.graph.edges[ei];
        // Brücken, Autobahnen und Kraftfahrstraßen (Ein- und Ausfahrten mit Markierung bis zur Spitze) behalten die alten Enden
        if (e.deck || /motorway|trunk/.test(e.h)) { ok = false; break; }
        for (const atA of [true, false]) {
          if ((atA ? e.a : e.b) !== nd) continue;
          const p = e.p, n = p.length / 2, P = i => atA ? [p[i * 2], p[i * 2 + 1]] : [p[(n - 1 - i) * 2], p[(n - 1 - i) * 2 + 1]];
          const cum = this.edgeCum(e), len = cum[cum.length - 1];
          const q = this.alongEnd(P, n, Math.min(6, len / 2));
          const dl = Math.hypot(q[0] - x, q[1] - z) || 1;
          arms.push({ ei, e, atA, P, n, len, half: e.w / 2, dx: (q[0] - x) / dl, dz: (q[1] - z) / dl });
        }
      }
      if (ok && arms.length >= 3) {
        for (const a of arms) a.ang = Math.atan2(a.dz, a.dx);
        arms.sort((a, b) => a.ang - b.ang);
        for (const a of arms) {
          let d = 0;
          for (const o of arms) {
            if (o === a) continue;
            const c = U.clamp(a.dx * o.dx + a.dz * o.dz, -1, 1), phi = Math.acos(c);
            if (phi < 0.44) { ok = false; break; } // spitzer Abzweig (unter 25°): keine eigene Fläche
            d = Math.max(d, o.half + 2.5);
            // so weit überlappen die beiden auseinanderlaufenden Fahrbahnstreifen, dazu der Eckradius
            if (phi < 2.6) d = Math.max(d, (o.half + a.half * c) / Math.max(0.25, Math.sin(phi)) + 2.5);
          }
          if (!ok) break;
          a.d = Math.min(d, 26);
          if (a.len < a.d * 2 + 2) { ok = false; break; }
          const [px, pz, tx, tz] = this.alongEnd(a.P, a.n, a.d, true);
          a.px = px; a.pz = pz; a.tx = tx; a.tz = tz;
          a.L = [px - tz * a.half, pz + tx * a.half]; a.R = [px + tz * a.half, pz - tx * a.half];
        }
        if (ok) J = { nd, x, z, arms };
      }
    }
    memo.set(nd, J);
    return J;
  }
  // ---------------- Markierungen (seit v3.13.0, Grafik-Phase 9) ----------------
  // Straßenknoten aus OSM (data/roadnodes.js, tools/convert-road-nodes.js) im Umkreis r: { x, z, k } mit k 0 Zebrastreifen,
  // 1 Fußgängerfurt, 2 Ampel, 3 Stopp, 4 Vorfahrt achten, 5 Mini-Kreisel
  roadNodesNear(x, z, r) {
    if (!this._rnGrid) {
      this._rnGrid = new U.Grid(100);
      const N = window.COBURG_ROADNODES;
      if (N) for (let i = 0; i < N.n.length; i += 3) { const q = { x: N.n[i] / 10, z: N.n[i + 1] / 10, k: N.n[i + 2] }; this._rnGrid.insert(q, q.x, q.z, q.x, q.z); }
    }
    return this._rnGrid.query(x, z, r, []).filter(q => Math.hypot(q.x - x, q.z - z) <= r);
  }
  // nächste Fahrbahn (keine Brücke) bis max m: Kante, Lage auf ihr (Bogenlänge s), Richtung, Abstand
  snapRoad(x, z, max) {
    let best = null;
    for (const code of this.netGrid.query(x, z, max, this._snq || (this._snq = []))) {
      const ei = Math.floor(code / 4096), e = this.graph.edges[ei], k = (code % 4096) * 2;
      if (e.deck) continue;
      const c = U.closestOnSeg(x, z, e.p[k], e.p[k + 1], e.p[k + 2], e.p[k + 3]), d = Math.hypot(c[0] - x, c[1] - z);
      if (d > max || (best && d >= best.d)) continue;
      const l = Math.hypot(e.p[k + 2] - e.p[k], e.p[k + 3] - e.p[k + 1]) || 1;
      best = { ei, e, d, x: c[0], z: c[1], ux: (e.p[k + 2] - e.p[k]) / l, uz: (e.p[k + 3] - e.p[k + 1]) / l,
        s: this.edgeCum(e)[k / 2] + Math.hypot(c[0] - e.p[k], c[1] - e.p[k + 1]) };
    }
    return best;
  }
  // Rang der Straßenart für die Vorfahrt ohne OSM-Angabe (gleicher Rang: rechts vor links, keine Linie)
  roadRank(h) {
    return { primary: 5, primary_link: 5, secondary: 4, secondary_link: 4, tertiary: 3, tertiary_link: 3, unclassified: 2,
      residential: 1, living_street: 1, service: 0 }[h] ?? 1;
  }
  // Querungen, Mini-Kreisel und Linien an den Kreuzungen einer Kachel in den Markierungs-Topf
  nodeMarks(t, marks, col) {
    const W = this.world, y = REGION.roadY + 0.025, hf = (x, z) => this.heightAt0(x, z);
    // Zebrastreifen und Fußgängerfurten: auf die Fahrbahn rasten, aus der Kreuzungsfläche herausschieben
    for (const q of this.roadNodesNear((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2, Math.max(this.tw, this.th))) {
      if (q.x < t.x0 || q.x >= t.x1 || q.z < t.z0 || q.z >= t.z1 || this.inCore(q.x, q.z)) continue;
      if (q.k === 5) { const J = this.nearJunction(q.x, q.z, 8); if (J) W.markDisc(marks, J.x, J.z, 2.2, y, col, hf); continue; }
      if (q.k > 1) continue;
      const c = this.crossingAt(q.x, q.z);
      if (c) W.crossingMarks(marks, q.k, c.x, c.z, c.tx, c.tz, c.half, y, col, hf, c.oneway);
    }
    // Kreuzungen (Regeln aus js/signals.js, rules): Haltlinien an Ampeln und Stoppschildern, Wartelinien an
    // Vorfahrt-achten-Schildern, untergeordneten Straßen und Mini-Kreiseln, dazu Haifischzähne und Fahrbahnpfeile
    for (const J of t.junctions || []) {
      const ru = this.control && this.control.rules(J.nd);
      if (!ru) continue;
      for (const r of ru.arms) {
        const a = r.a;
        if (!r.incoming) continue;
        // ankommende Spur: rechts des ankommenden Verkehrs, also o < 0 im Rahmen des Arms (der zeigt von der Kreuzung weg)
        const one = !!a.e.o, o0 = -a.half + 0.25, o1 = one ? a.half - 0.25 : -0.15;
        if (r.line) W.stopLine(marks, r.line === 'give', a.px, a.pz, a.tx, a.tz, 0.4, o0, o1, y, col, hf);
        if (r.teeth) W.sharkTeeth(marks, a.px, a.pz, a.tx, a.tz, 1.1, o0, o1, y, col, hf);
        if (r.arrows) { const [px, pz, tx, tz] = this.alongEnd(a.P, a.n, a.d + r.arrowS, true); W.laneArrow(marks, px, pz, tx, tz, 0, one ? 0 : -a.half / 2, r.arrows, y, col, hf); }
      }
    }
  }
  // Querung (Zebrastreifen, Furt, Fußgängerampel) an (x, z): auf die nächste Fahrbahn bis 6 m gerastet und aus den
  // Kreuzungsflächen herausgeschoben; { ei, s, x, z, tx, tz, half, oneway } oder null (schmal, Autobahn, Zufahrt)
  crossingAt(x, z) {
    const r = this.snapRoad(x, z, 6);
    if (!r || r.e.w < 4 || /motorway|trunk|service|track/.test(r.e.h)) return null;
    const cum = this.edgeCum(r.e), len = cum[cum.length - 1];
    const Ja = this.junction(r.e.a), Jb = this.junction(r.e.b);
    const lo = (Ja ? this.armD(Ja, r.ei, true) : 0) + 4.6, hi = len - (Jb ? this.armD(Jb, r.ei, false) : 0) - 4.6;
    if (hi < lo) return null;
    const s = U.clamp(r.s, lo, hi), p = this.edgePoint(r.e, s);
    return { ei: r.ei, s, x: p[0], z: p[1], tx: p[2], tz: p[3], half: r.e.w / 2, oneway: !!r.e.o };
  }
  // Straßendetails eines Abschnitts (seit v3.13.0, Grafik-Phase 9, World.roadDetails): innerorts Kanaldeckel und Gullys,
  // überall Flickstellen, außerorts an Landstraßen Leitpfosten (posts: [x, z, Winkel, Seite] je Pfosten)
  roadDetails(t, e, pts, half, col, marks, rnd, posts) {
    if (/motorway|trunk|track|path|foot/.test(e.h)) return;
    this.world.roadDetails(pts, half, e.w, !!e.o, col, marks, rnd, { y: REGION.roadY + 0.015, hf: (x, z) => this.heightAt0(x, z),
      town: (x, z) => this.builtUp(x, z, e.h) || this.inSettlement(t, x, z), posts: /primary|secondary|tertiary|unclassified/.test(e.h) && !/link/.test(e.h) ? posts : null });
  }
  // Liegt (x, z) in einem Wohn-, Gewerbe-, Industriegebiet oder Hof der Kachel (bis 12 m daneben)? Dort keine Leitpfosten
  inSettlement(t, x, z) {
    if (!t._settle) t._settle = ((t.d && t.d.areas) || []).filter(a => /^(residential|commercial|industrial|retail|farmyard|construction)$/.test(a.k)).map(a => ({ a, bb: U.polyBBox(a.p) }));
    for (const [dx, dz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) {
      const px = x + dx, pz = z + dz;
      for (const { a, bb } of t._settle) if (px >= bb.minX && px <= bb.maxX && pz >= bb.minZ && pz <= bb.maxZ && U.pointInPoly(px, pz, a.p)) return true;
    }
    return false;
  }
  // Leitpfosten einer Kachel als Instanzen: weißer Pfosten (1 m über dem Boden), schwarzes Band, Rückstrahler
  postMesh(t, posts) {
    const N = posts.length / 4;
    if (!N) return;
    if (!this._postGeo) {
      const box = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(); const col = new Float32Array(g.attributes.position.count * 3); const cc = new THREE.Color(c); for (let i = 0; i < col.length; i += 3) { col[i] = cc.r; col[i + 1] = cc.g; col[i + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g; };
      const merge = list => { const P = [], Nn = [], C = []; for (const g of list) { P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array); C.push(...g.attributes.color.array); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeBoundingSphere(); return g; };
      // x = Fahrtrichtung: Rechteck-Rückstrahler auf der Stirnseite −x (zum Verkehr, der den Pfosten rechts hat), zwei runde auf +x
      this._postGeo = merge([box(0.1, 1.15, 0.12, 0, 0.425, 0, '#f2f1ec'), box(0.104, 0.28, 0.124, 0, 0.78, 0, '#1b1b1b'),
        box(0.01, 0.1, 0.06, -0.053, 0.8, 0, '#f3d9a0'), box(0.01, 0.03, 0.03, 0.053, 0.8, -0.03, '#f2f2f2'), box(0.01, 0.03, 0.03, 0.053, 0.8, 0.03, '#f2f2f2')]);
      this._postMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
    const m = new THREE.InstancedMesh(this._postGeo, this._postMat, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const x = posts[i * 4], z = posts[i * 4 + 1], ang = posts[i * 4 + 2], side = posts[i * 4 + 3];
      // Seite 1 liegt rechts der Richtung (x = Osten, z = Süden: rechts von (ux, uz) ist (−uz, ux)); dort zeigt das Rechteck
      // gegen die Richtung zum Verkehr, der den Pfosten rechts hat. Seite −1 (links): umgedreht
      q.setFromAxisAngle(up, -ang + (side < 0 ? Math.PI : 0));
      m.setMatrixAt(i, m4.compose(p.set(x, this.heightAt0(x, z) - 0.15, z), q, one));
    }
    m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere();
    t.group.add(m);
  }
  // Kreuzung (mit eigener Fläche) am nächsten Knoten bis max m
  nearJunction(x, z, max) {
    const r = this.snapRoad(x, z, max);
    if (!r) return null;
    for (const nd of [r.e.a, r.e.b]) { const J = this.junction(nd); if (J && Math.hypot(J.x - x, J.z - z) < max) return J; }
    return null;
  }
  // Punkt und Richtung auf der Kante bei Bogenlänge s: [x, z, tx, tz]
  edgePoint(e, s) {
    const p = e.p, cum = this.edgeCum(e), n = p.length / 2;
    let i = 0;
    while (i + 2 < n && cum[i + 1] < s) i++;
    const l = cum[i + 1] - cum[i] || 1, f = U.clamp((s - cum[i]) / l, 0, 1), tx = (p[i * 2 + 2] - p[i * 2]) / l, tz = (p[i * 2 + 3] - p[i * 2 + 1]) / l;
    return [p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * f, p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * f, tx, tz];
  }
  // Rücknahme der Kante ei an der Kreuzung J (atA: Anfang der Kante)
  armD(J, ei, atA) { for (const a of J.arms) if (a.ei === ei && a.atA === atA) return a.d; return 0; }
  // Stück der Kante zwischen den Bogenlängen s0 und s1 als Punktliste [x, z, …]
  sliceEdge(e, s0, s1) {
    const p = e.p, cum = this.edgeCum(e), out = [], n = p.length / 2;
    const at = s => { let i = 0; while (i + 2 < n && cum[i + 1] < s) i++; const l = cum[i + 1] - cum[i], f = l > 0 ? U.clamp((s - cum[i]) / l, 0, 1) : 0; return [p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * f, p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * f]; };
    out.push(...at(s0));
    for (let i = 0; i < n; i++) if (cum[i] > s0 + 0.05 && cum[i] < s1 - 0.05) out.push(p[i * 2], p[i * 2 + 1]);
    out.push(...at(s1));
    return out;
  }
  // Punkt im Abstand s entlang einer Linie (Punkte P(i), i < n), optional mit Richtung [x, z, tx, tz]
  alongEnd(P, n, s, dir) {
    let acc = 0;
    for (let i = 0; i + 1 < n; i++) {
      const a = P(i), b = P(i + 1), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + l >= s || i + 2 === n) {
        const f = l > 0 ? U.clamp((s - acc) / l, 0, 1) : 0, tx = l > 0 ? (b[0] - a[0]) / l : 1, tz = l > 0 ? (b[1] - a[1]) / l : 0;
        const pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        return dir ? [pt[0], pt[1], tx, tz] : pt;
      }
      acc += l;
    }
    return dir ? [P(0)[0], P(0)[1], 1, 0] : P(0);
  }
  // Rand der Kreuzungsfläche: je Arm die Ecken R und L, zwischen zwei Armen ein Bogen (quadratische Bézierkurve, Stützpunkt
  // im Schnitt der beiden Fahrbahnränder; laufen sie fast parallel, eine Gerade). off: Rand um so viel nach außen versetzt
  junctionRing(J, off = 0) {
    const out = [], A = J.arms;
    const corner = (a, side) => {
      const s = side * (a.half + off); // side 1: links (L), -1: rechts (R)
      return [a.px - a.tz * s, a.pz + a.tx * s];
    };
    for (let i = 0; i < A.length; i++) {
      const a = A[i], b = A[(i + 1) % A.length];
      out.push(corner(a, -1), ...this.junctionFillet(a, b, off).slice(0, -1));
    }
    return out;
  }
  // Bogen von der linken Ecke des Arms a zur rechten Ecke des nächsten Arms b (beide um off nach außen versetzt), 7 Punkte
  junctionFillet(a, b, off) {
    const p0 = [a.px - a.tz * (a.half + off), a.pz + a.tx * (a.half + off)], p1 = [b.px + b.tz * (b.half + off), b.pz - b.tx * (b.half + off)];
    // Schnitt der Linien p0 + u·(a.dx, a.dz) und p1 + v·(b.dx, b.dz)
    const den = a.dx * b.dz - a.dz * b.dx;
    let c = null;
    if (Math.abs(den) > 0.15) {
      const u = ((p1[0] - p0[0]) * b.dz - (p1[1] - p0[1]) * b.dx) / den;
      const v = ((p1[0] - p0[0]) * a.dz - (p1[1] - p0[1]) * a.dx) / den;
      if (u < 0.5 && v < 0.5 && u > -40 && v > -40) c = [p0[0] + a.dx * u, p0[1] + a.dz * u];
    }
    const out = [], steps = 6;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (c) out.push([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]]);
      else out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]);
    }
    return out;
  }
  // Abstand vom Knoten, ab dem der Gehsteig beginnt (Kreuzung: wie die Fahrbahn, sonst Querstraße plus Übergang)
  nodeTrim(nd, e) {
    const J = this.junction(nd);
    if (J) { let d = 0; for (const a of J.arms) if (a.e === e) d = Math.max(d, a.d); if (d) return d; }
    if (this.nodeDeg(nd) < 3) return 0;
    let w = 0;
    for (const ei of this.nodeEdges(nd)) { const o = this.graph.edges[ei]; if (o !== e) w = Math.max(w, o.w / 2); }
    return w + 2.2;
  }
  // Gehsteige an beiden Straßenseiten: Bordstein (Granit, 12 cm), Belag, Absenkung an Einfahrten und vor Kreuzungen,
  // Schürze zum tieferen Gelände. Fußgänger und Spielfigur stehen darauf (walkAt), Bäume und Zäune halten Abstand.
  buildSidewalks(t) { for (const _ of this.sidewalkSteps(t)); }
  *sidewalkSteps(t) {
    const runs = this.runs.get(t.key);
    t.walkGrid = new U.Grid(16);
    if (!runs) return;
    const W = this.world, walkB = new Bucket(); // ein Netz je Kachel (Belag und Bordstein, eine Zeichnung)
    const colS = U.color('#7a7772', 0.04, U.rng(t.key)), colC = new THREE.Color('#bdb9b0'), y0 = REGION.roadY;
    const hAt = (x, z) => this.heightAt0(x, z);
    let built = 0;
    // Wohnhäuser und Garagen der Kachel (für Einfahrten) in einem kleinen Raster
    const homes = new U.Grid(20), hq = [];
    for (const b of t.buildings) {
      if (!(b.a >= 3 && b.a <= 6) && b.a !== 11 && b.a !== 0) continue;
      const x = (b.bb.minX + b.bb.maxX) / 2, z = (b.bb.minZ + b.bb.maxZ) / 2;
      homes.insert({ x, z }, x, z, x, z);
    }
    let rk = 0;
    for (const run of runs) {
      if (++rk % 8 === 0) yield;
      const e = this.graph.edges[run.e], wid = WALK_WIDTH[e.h];
      if (!wid || e.deck || e.br) continue;
      const cum = this.edgeCum(e), total = cum[cum.length - 1], half = e.w / 2;
      // an Kreuzungen mit eigener Fläche genau an der Rücknahme beginnen (dort schließt die Gehweg-Ecke an)
      const Ja = this.junction(e.a), Jb = this.junction(e.b);
      let raw = e.p.slice(run.k0 * 2, run.k1 * 2 + 2), s0 = cum[run.k0];
      if (Ja || Jb) {
        s0 = Math.max(s0, Ja ? this.armD(Ja, run.e, true) : 0);
        const s1 = Math.min(cum[run.k1], total - (Jb ? this.armD(Jb, run.e, false) : 0));
        if (s1 - s0 < 1) continue;
        raw = this.sliceEdge(e, s0, s1);
      }
      const pts = W.resample(raw, 4), n = pts.length / 2;
      if (n < 2) continue;
      const sAt = [s0];
      for (let i = 1; i < n; i++) sAt.push(sAt[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
      const trimA = this.nodeTrim(e.a, e), trimB = this.nodeTrim(e.b, e);
      const nrm = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        nrm.push([-tz, tx]);
      }
      for (const side of [1, -1]) {
        const on = new Uint8Array(n), low = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          const x = pts[i * 2] + nrm[i][0] * side * (half + 14), z = pts[i * 2 + 1] + nrm[i][1] * side * (half + 14);
          on[i] = this.builtUp(x, z, e.h) && !this.inCore(pts[i * 2], pts[i * 2 + 1]) ? 1 : 0;
        }
        // Lücken bis 12 m schließen, Stücke unter 16 m weglassen
        for (let i = 1; i < n - 1; i++) if (!on[i]) { let j = i; while (j < n && !on[j]) j++; if (j < n && j - i <= 3 && on[i - 1]) for (let k = i; k < j; k++) on[k] = 1; i = j; }
        for (let i = 0; i < n; i++) if (on[i]) { let j = i; while (j < n && on[j]) j++; if (j - i < 5) for (let k = i; k < j; k++) on[k] = 0; i = j; }
        // Kreuzungen frei, davor abgesenkt (Übergang)
        for (let i = 0; i < n; i++) if (sAt[i] < trimA - 0.05 || total - sAt[i] < trimB - 0.05) on[i] = 0;
        // Enden an Kreuzungsflächen bleiben oben (dort geht es in die Gehweg-Ecke), sonst abgesenkt
        const atJa = i => Ja && i === 0 && sAt[0] < trimA + 0.1, atJb = i => Jb && i === n - 1 && total - sAt[n - 1] < trimB + 0.1;
        for (let i = 0; i < n; i++) if (on[i] && ((i > 0 && !on[i - 1]) || (i < n - 1 && !on[i + 1])) && !atJa(i) && !atJb(i)) low[i] = 1;
        // Gehsteig-Enden an Kreuzungen merken (Seite bezogen auf den Arm: 1 links, -1 rechts)
        const ends = this._walkEnds || (this._walkEnds = new Map());
        if (on[0] && atJa(0)) ends.set(e.a + '|' + run.e + '|1|' + side, wid);
        if (on[n - 1] && atJb(n - 1)) ends.set(e.b + '|' + run.e + '|0|' + (-side), wid);
        // Einfahrten: Häuser und Garagen an dieser Seite bis 30 m hinter dem Gehsteig, je eines an der nächsten Stelle
        const best = new Map();
        for (let i = 0; i < n; i++) {
          if (!on[i]) continue;
          for (const h of homes.query(pts[i * 2], pts[i * 2 + 1], half + 32, hq)) {
            const dx = h.x - pts[i * 2], dz = h.z - pts[i * 2 + 1], lat = (dx * nrm[i][0] + dz * nrm[i][1]) * side, d = Math.hypot(dx, dz);
            if (lat <= half || lat >= half + 32) continue;
            const o = best.get(h);
            if (!o || d < o[1]) best.set(h, [i, d]);
          }
        }
        for (const [i] of best.values()) low[i] = 2;
        const P = (i, o) => [pts[i * 2] + nrm[i][0] * side * o, pts[i * 2 + 1] + nrm[i][1] * side * o];
        const geo = [];
        for (let i = 0; i < n; i++) {
          const p0 = P(i, half), p1 = P(i, half + SIDEWALK.curb), p2 = P(i, half + SIDEWALK.curb + wid);
          const hr = hAt(p0[0], p0[1]) + y0, top = hr + (low[i] ? 0.03 : SIDEWALK.h), ground = hAt(p2[0], p2[1]);
          const outer = U.clamp(ground + 0.03, top, top + 0.25);
          geo.push({ p0, p1, p2, hr, top, inner: low[i] ? top : top, outer, ground });
        }
        for (let i = 0; i < n - 1; i++) {
          if (!on[i] || !on[i + 1]) continue;
          const A = geo[i], B = geo[i + 1], mx = pts[i * 2], mz = pts[i * 2 + 1];
          const nx = nrm[i][0] * side, nz = nrm[i][1] * side;
          const v = (p, y) => [p[0], y, p[1]];
          const sb = walkB, cb = walkB;
          // Bordstein: Ansichtsfläche zur Fahrbahn und Oberseite
          cb.tri(v(A.p0, A.hr - 0.04), v(B.p0, B.hr - 0.04), v(B.p0, B.top), colC, null, null, null, -nx, 0, -nz);
          cb.tri(v(A.p0, A.hr - 0.04), v(B.p0, B.top), v(A.p0, A.top), colC, null, null, null, -nx, 0, -nz);
          cb.tri(v(A.p0, A.top), v(B.p0, B.top), v(B.p1, B.top), colC, null, null, null, 0, 1, 0);
          cb.tri(v(A.p0, A.top), v(B.p1, B.top), v(A.p1, A.top), colC, null, null, null, 0, 1, 0);
          // Belag
          sb.tri(v(A.p1, A.top), v(B.p1, B.top), v(B.p2, B.outer), colS, null, null, null, 0, 1, 0);
          sb.tri(v(A.p1, A.top), v(B.p2, B.outer), v(A.p2, A.outer), colS, null, null, null, 0, 1, 0);
          // Schürze zum tieferen Gelände
          if (A.ground < A.outer - 0.05 || B.ground < B.outer - 0.05) {
            cb.tri(v(A.p2, A.outer), v(B.p2, B.outer), v(B.p2, Math.min(B.ground, B.outer) - 0.3), colS, null, null, null, nx, 0, nz);
            cb.tri(v(A.p2, A.outer), v(B.p2, Math.min(B.ground, B.outer) - 0.3), v(A.p2, Math.min(A.ground, A.outer) - 0.3), colS, null, null, null, nx, 0, nz);
          }
          const strip = { ax: mx, az: mz, bx: pts[i * 2 + 2], bz: pts[i * 2 + 3], side, o0: half, o1: half + SIDEWALK.curb + wid, ya: A.top, yb: B.top, oa: A.outer, ob: B.outer };
          t.walkGrid.insert(strip, Math.min(A.p0[0], A.p2[0], B.p0[0], B.p2[0]), Math.min(A.p0[1], A.p2[1], B.p0[1], B.p2[1]),
            Math.max(A.p0[0], A.p2[0], B.p0[0], B.p2[0]), Math.max(A.p0[1], A.p2[1], B.p0[1], B.p2[1]));
          built++;
        }
      }
    }
    // Gehweg-Ecken an den Kreuzungsflächen der Kachel: zwischen zwei Armen, wenn an beiden Seiten ein Gehsteig ankommt
    const ends = this._walkEnds || new Map();
    for (const J of t.junctions || []) for (let i = 0; i < J.arms.length; i++) {
      const a = J.arms[i], b = J.arms[(i + 1) % J.arms.length];
      const wa = ends.get(J.nd + '|' + a.ei + '|' + (a.atA ? 1 : 0) + '|1'), wb = ends.get(J.nd + '|' + b.ei + '|' + (b.atA ? 1 : 0) + '|-1');
      if (!wa || !wb) continue;
      const wid = (wa + wb) / 2, C0 = this.junctionFillet(a, b, 0), C1 = this.junctionFillet(a, b, SIDEWALK.curb), C2 = this.junctionFillet(a, b, SIDEWALK.curb + wid);
      const geo = C0.map((p0, k) => {
        const p1 = C1[k], p2 = C2[k], hr = hAt(p0[0], p0[1]) + y0, top = hr + SIDEWALK.h, ground = hAt(p2[0], p2[1]);
        return { p0, p1, p2, hr, top, outer: U.clamp(ground + 0.03, top, top + 0.25), ground };
      });
      const v = (p, y) => [p[0], y, p[1]];
      for (let k = 0; k + 1 < geo.length; k++) {
        const A = geo[k], B = geo[k + 1];
        let nx = A.p0[0] - A.p1[0], nz = A.p0[1] - A.p1[1];
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl; // zur Fahrbahn
        walkB.tri(v(A.p0, A.hr - 0.04), v(B.p0, B.hr - 0.04), v(B.p0, B.top), colC, null, null, null, nx, 0, nz);
        walkB.tri(v(A.p0, A.hr - 0.04), v(B.p0, B.top), v(A.p0, A.top), colC, null, null, null, nx, 0, nz);
        walkB.tri(v(A.p0, A.top), v(B.p0, B.top), v(B.p1, B.top), colC, null, null, null, 0, 1, 0);
        walkB.tri(v(A.p0, A.top), v(B.p1, B.top), v(A.p1, A.top), colC, null, null, null, 0, 1, 0);
        walkB.tri(v(A.p1, A.top), v(B.p1, B.top), v(B.p2, B.outer), colS, null, null, null, 0, 1, 0);
        walkB.tri(v(A.p1, A.top), v(B.p2, B.outer), v(A.p2, A.outer), colS, null, null, null, 0, 1, 0);
        if (A.ground < A.outer - 0.05 || B.ground < B.outer - 0.05) {
          walkB.tri(v(A.p2, A.outer), v(B.p2, B.outer), v(B.p2, Math.min(B.ground, B.outer) - 0.3), colS, null, null, null, -nx, 0, -nz);
          walkB.tri(v(A.p2, A.outer), v(B.p2, Math.min(B.ground, B.outer) - 0.3), v(A.p2, Math.min(A.ground, A.outer) - 0.3), colS, null, null, null, -nx, 0, -nz);
        }
      }
      built++;
    }
    const g = walkB.geometry();
    if (g) { const m = new THREE.Mesh(g, W.buildingMaterials().plain); m.receiveShadow = true; t.group.add(m); }
    t.walkPieces = built;
  }
  // Höhe der Gehsteig-Oberfläche an einer Stelle (oder null): für Spielfigur, Fußgänger, Bäume und Zäune
  walkAt(x, z) {
    const [ti, tj] = this.tileOf(x, z), t = this.loaded.get(tileKey(ti, tj));
    if (!t || !t.walkGrid) return null;
    for (const s of t.walkGrid.query(x, z, 0.5, this._walkQ || (this._walkQ = []))) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz;
      if (l2 < 1e-6) continue;
      const k = ((x - s.ax) * dx + (z - s.az) * dz) / l2;
      if (k < -0.05 || k > 1.05) continue;
      const l = Math.sqrt(l2), lat = ((x - s.ax) * -dz + (z - s.az) * dx) / l * s.side;
      if (lat < s.o0 || lat > s.o1) continue;
      const kk = U.clamp(k, 0, 1), f = (lat - s.o0) / (s.o1 - s.o0);
      return (s.ya + (s.yb - s.ya) * kk) * (1 - f) + (s.oa + (s.ob - s.oa) * kk) * f;
    }
    return null;
  }

  // Linie parallel zur Polylinie im Abstand o (positiv: links)
  offsetLine(pts, o) {
    const n = pts.length / 2, out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = pts[b * 2] - pts[a * 2], dz = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(dx, dz) || 1;
      out.push(pts[i * 2] - dz / l * o, pts[i * 2 + 1] + dx / l * o);
    }
    return out;
  }

  // Leitplanken (verzinkt, Holm 0,45–0,78 m mit Pfosten) neben großen Straßen außerhalb der Orte (zwischen getrennten
  // Richtungsfahrbahnen stehen so die beiden inneren) und als unsichtbare Kante auf Brücken und Rampen. Sie halten nur
  // Autos auf und nur auf ihrer Höhe (Straßen darunter oder darüber bleiben frei). An Kreuzungen und Einmündungen und
  // wo eine andere Fahrbahn daneben liegt bleiben sie offen. Hindernis sind sie nur dort, wo man sie auch sieht.
  buildRails(t) {
    const jobs = t.railJobs;
    t.railJobs = null;
    t.rails = []; t.railGrid = new U.Grid(16);
    if (!jobs) return;
    const W = this.world, E = this.graph.edges, parts = this.chunks(t), steel = new THREE.Color('#b9bdc1'), post = new THREE.Color('#7d8186');
    const town = (x, z) => t.polyGrid.query(x, z, 35, W._tmp).some(b => Math.abs(b.bb.minX - x) < 65 && Math.abs(b.bb.minZ - z) < 65);
    const quad = (b, a, c, d, e, col, nx, ny, nz) => { b.tri(a, c, d, col, null, null, null, nx, ny, nz); b.tri(a, d, e, col, null, null, null, nx, ny, nz); };
    // Höhe einer anderen Straße am Punkt (x, z) nahe ihrem Abschnitt k
    const levelOf = (o, k, x, z) => {
      if (!o.deck) return W.heightAt(x, z);
      const c = U.closestOnSeg(x, z, o.p[k], o.p[k + 1], o.p[k + 2], o.p[k + 3]);
      return this.deckH(o.deck, o.deck.cum[k / 2] + (o.deck.cum[k / 2 + 1] - o.deck.cum[k / 2]) * c[2]);
    };
    for (const { e, run, pts, sAt, B, big } of jobs) {
      const n = pts.length / 2, half = e.w / 2, ei = run.e;
      // Abstand ab Kantenanfang
      let s0 = 0;
      for (let k = 1; k <= run.k0; k++) s0 += Math.hypot(e.p[k * 2] - e.p[k * 2 - 2], e.p[k * 2 + 1] - e.p[k * 2 - 1]);
      let len = s0;
      for (let k = run.k0 + 1; k < e.p.length / 2; k++) len += Math.hypot(e.p[k * 2] - e.p[k * 2 - 2], e.p[k * 2 + 1] - e.p[k * 2 - 1]);
      const sE = [s0];
      for (let i = 1; i < n; i++) sE.push(sE[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
      const openA = this.nodeDeg(e.a) >= 3, openB = this.nodeDeg(e.b) >= 3;
      // auf niedrigen Brücken an der Innenseite der Brüstung, sonst neben der Fahrbahn
      const side = B && B.low ? half - 0.3 : half + 0.45;
      for (const off of [side, -side]) {
        const P = [], ok = [];
        const line = this.offsetLine(pts, off);
        for (let i = 0; i < n; i++) {
          const x = line[i * 2], z = line[i * 2 + 1];
          const h = (B ? this.deckH(B, sAt[i]) : this.heightAt0(x, z)) + REGION.roadY;
          P.push([x, h, z]);
          let free = !(openA && sE[i] < 16) && !(openB && sE[i] > len - 16);
          if (free) {
            // andere Fahrbahn auf gleicher Höhe direkt daneben: offen lassen
            for (const code of this.netGrid.query(x, z, 12, this._rq2 || (this._rq2 = []))) {
              const oi = Math.floor(code / 4096), k = (code % 4096) * 2, o = E[oi];
              if (oi === ei) continue;
              const c = U.closestOnSeg(x, z, o.p[k], o.p[k + 1], o.p[k + 2], o.p[k + 3]);
              if (Math.hypot(c[0] - x, c[1] - z) > o.w / 2 + 1.2) continue;
              if (Math.abs(levelOf(o, k, c[0], c[1]) + REGION.roadY - h) < 3) { free = false; break; }
            }
          }
          ok.push(free);
        }
        for (let i = 0; i < n - 1; i++) {
          if (!ok[i] || !ok[i + 1]) continue;
          const a = P[i], c = P[i + 1];
          // sichtbar nur neben großen Straßen außerhalb der Orte (Autobahnen auch dort); auf Brücken steht schon die Brüstung
          const bare = B && (B.ramp ? Math.min(a[1] - W.heightAt(a[0], a[2]), c[1] - W.heightAt(c[0], c[2])) > 1.1 : true);
          const show = !bare && big && (/^motorway/.test(e.h) || !town(a[0], a[2]));
          // Hindernis nur, wo sie steht, und als Kante der Brüstung auf Brücken und hohen Rampen
          if (show || bare) {
            t.rails.push(a[0], a[2], c[0], c[2], (a[1] + c[1]) / 2);
            t.railGrid.insert(t.rails.length / 5 - 1, Math.min(a[0], c[0]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[2], c[2]));
          }
          if (!show) continue;
          const b = parts.get(a[0], a[2]);
          const dx = c[0] - a[0], dz = c[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
          const up = (q, d) => [q[0], q[1] + d, q[2]];
          quad(b, up(a, 0.45), up(c, 0.45), up(c, 0.78), up(a, 0.78), steel, nx, 0, nz);
          quad(b, up(a, 0.45), up(a, 0.78), up(c, 0.78), up(c, 0.45), steel, -nx, 0, -nz);
          quad(b, up(a, 0.78), up(c, 0.78), [c[0] + nx * 0.06, c[1] + 0.78, c[2] + nz * 0.06], [a[0] + nx * 0.06, a[1] + 0.78, a[2] + nz * 0.06], steel, 0, 1, 0);
          // Pfosten
          const r = 0.06, sq = [[-r, -r], [r, -r], [r, r], [-r, r]];
          for (let q = 0; q < 4; q++) {
            const [px, pz] = sq[q], [qx, qz] = sq[(q + 1) % 4];
            quad(b, [a[0] + px, a[1] - 0.3, a[2] + pz], [a[0] + qx, a[1] - 0.3, a[2] + qz], [a[0] + qx, a[1] + 0.72, a[2] + qz], [a[0] + px, a[1] + 0.72, a[2] + pz], post, px + qx, 0, pz + qz);
          }
        }
      }
    }
    parts.meshes(W.buildingMaterials().plain, { cast: true, receive: true }).forEach(m => t.group.add(m));
  }

  // Brückenbauwerk: Platte unter der Fahrbahn, Geländer, Pfeiler bis zum Gelände
  bridgeStructure(t, B, pts, sAt, L, R) {
    const parts = t.bridgeParts || (t.bridgeParts = this.chunks(t));
    const W = this.world, n = pts.length / 2;
    const concrete = new THREE.Color('#a9a59c'), rail = new THREE.Color('#8d8a84');
    const quad = (b, a, c, d, e, col, nx, ny, nz) => { b.tri(a, c, d, col, null, null, null, nx, ny, nz); b.tri(a, d, e, col, null, null, null, nx, ny, nz); };
    const dn = (p, h) => [p[0], p[1] - h, p[2]];
    for (let i = 0; i < n - 1; i++) {
      const b = parts.get(pts[i * 2], pts[i * 2 + 1]);
      const dx = pts[i * 2 + 2] - pts[i * 2], dz = pts[i * 2 + 3] - pts[i * 2 + 1], l = Math.hypot(dx, dz) || 1;
      const ox = -dz / l, oz = dx / l; // links
      if (B.ramp) {
        // Rampe: Stützmauern bis ins Gelände, Brüstung erst ab 1,2 m Höhe
        const gL = q => [q[0], W.heightAt(q[0], q[2]) - 0.5, q[2]];
        if (Math.max(L[i][1] - gL(L[i])[1], L[i + 1][1] - gL(L[i + 1])[1]) < 0.9) continue;
        quad(b, L[i], L[i + 1], gL(L[i + 1]), gL(L[i]), concrete, ox, 0, oz);
        quad(b, R[i], gL(R[i]), gL(R[i + 1]), R[i + 1], concrete, -ox, 0, -oz);
        if (Math.min(L[i][1] - gL(L[i])[1], L[i + 1][1] - gL(L[i + 1])[1]) < 1.7) continue;
      } else {
        // Unterseite und Seitenflächen der Platte (0,9 m stark)
        quad(b, dn(L[i], 0.9), dn(L[i + 1], 0.9), dn(R[i + 1], 0.9), dn(R[i], 0.9), concrete, 0, -1, 0);
        quad(b, L[i], L[i + 1], dn(L[i + 1], 0.9), dn(L[i], 0.9), concrete, ox, 0, oz);
        quad(b, R[i], dn(R[i], 0.9), dn(R[i + 1], 0.9), R[i + 1], concrete, -ox, 0, -oz);
      }
      // Geländer: Brüstung 0,9 m hoch auf beiden Seiten
      for (const [P, s] of [[L, 1], [R, -1]]) {
        const a = P[i], c = P[i + 1], up = q => [q[0], q[1] + 0.9, q[2]];
        quad(b, a, c, up(c), up(a), rail, ox * s, 0, oz * s);
        quad(b, a, up(a), up(c), c, rail, -ox * s, 0, -oz * s);
      }
    }
    // Widerlager: Wand unter den Brückenenden bis ins Gelände
    if (!B.ramp) for (const i of [0, n - 1]) {
      if (sAt[i] > 1 && sAt[i] < B.len - 1) continue;
      const g = q => [q[0], W.heightAt(q[0], q[2]) - 0.5, q[2]];
      if (L[i][1] - g(L[i])[1] < 1.6) continue;
      const dx = pts[Math.min(n - 1, i + 1) * 2] - pts[Math.max(0, i - 1) * 2], dz = pts[Math.min(n - 1, i + 1) * 2 + 1] - pts[Math.max(0, i - 1) * 2 + 1];
      const sg = i ? 1 : -1, b = parts.get(pts[i * 2], pts[i * 2 + 1]);
      quad(b, dn(L[i], 0.9), g(L[i]), g(R[i]), dn(R[i], 0.9), concrete, dx * sg, 0, dz * sg);
    }
    // Pfeiler alle ≈ 28 m, wo die Brücke hoch genug ist
    for (let i = 3; !B.ramp && i < n - 3; i += 7) {
      const x = pts[i * 2], z = pts[i * 2 + 1], top = this.deckH(B, sAt[i]) - 0.9, ground = W.heightAt(x, z);
      if (top - ground < 2) continue;
      const b = parts.get(x, z), r = Math.min(0.9, B.w * 0.12);
      const c = [[-r, -r], [r, -r], [r, r], [-r, r]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = c[k], [bx, bz] = c[(k + 1) % 4];
        quad(b, [x + ax, ground - 1, z + az], [x + bx, ground - 1, z + bz], [x + bx, top, z + bz], [x + ax, top, z + az], concrete, (ax + bx), 0, (az + bz));
      }
      // (keine Kollision: die Hindernisse sind flach und würden sonst auch oben auf der Fahrbahn bremsen)
    }
  }

  // ---------------- Wasser ----------------
  buildWater(t) { for (const _ of this.waterSteps(t)); }
  *waterSteps(t) {
    if (typeof WaterSet === 'undefined') return;
    const own = this.waterOf(t.ti, t.tj);
    if (!own.areas.length && !own.lines.length) return;
    const ws = new WaterSet(own.areas, own.lines);
    const inside = (x, z) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1 && !this.inCore(x, z);
    const surf = this.chunks(t);
    yield* ws.surfaceSteps(surf, (x, z) => this.heightAt0(x, z), inside, (x, z) => this.heightAt(x, z));
    surf.meshes(waterMaterial(), { receive: true }).forEach(m => t.group.add(m));
    yield;
    ws.edges((ax, az, bx, bz) => {
      t.edges.push(ax, az, bx, bz);
      t.edgeGrid.insert(t.edges.length / 4 - 1, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }, (x, z) => this.roadNear(x, z, WATER.roadGap), { x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1 }, (x, z) => !this.inCore(x, z));
    yield;
    t.rivers = new U.Grid(20);
    ws.riverPieces(q => {
      q.y = this.heightAt0((q.ax + q.bx) / 2, (q.az + q.bz) / 2) - WATER.surface;
      t.rivers.insert(q, Math.min(q.ax, q.bx) - q.hw, Math.min(q.az, q.bz) - q.hw, Math.max(q.ax, q.bx) + q.hw, Math.max(q.az, q.bz) + q.hw);
    }, (x, z) => this.roadNear(x, z, WATER.roadGap), (x, z) => !this.inCore(x, z));
  }

  // ---------------- Orte: Laternen, Ladenschilder, Lokale, Fußgänger ----------------
  lifeAssets() {
    if (!this._life) {
      const pole = mergeGeos([[new THREE.CylinderGeometry(0.06, 0.09, 5.2, 6), 0, 2.6, 0], [new THREE.BoxGeometry(0.06, 0.06, 1.0), 0, 5.15, 0.45]]);
      const head = mergeGeos([[new THREE.BoxGeometry(0.5, 0.14, 0.3), 0, 5.08, 0.9]]);
      const glowTex = (() => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,196,120,0.62)'); g.addColorStop(0.45, 'rgba(255,160,80,0.26)'); g.addColorStop(1, 'rgba(255,150,70,0)');
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(cv);
      })();
      const glow = new THREE.PlaneGeometry(10, 10); glow.rotateX(-Math.PI / 2);
      const P = this.props;
      this._life = { pole, head, glow, poleMat: Mat.make('metallLack', { color: '#2e3236' }),
        headMat: P && P.lampMat ? P.lampMat : new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffd890', emissiveIntensity: 0.05 }),
        glowMat: new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }) };
    }
    return this._life;
  }
  buildLife(t) {
    if (this.lifeOn.has(t.key) || !t.d) return;
    this.lifeOn.add(t.key);
    const W = this.world, life = t.life = { meshes: [], venues: [], segs: [] };
    const near = (x, z, r) => t.polyGrid.query(x, z, r, W._tmp).some(b => Math.abs(b.bb.minX - x) < r + 30 && Math.abs(b.bb.minZ - z) < r + 30);
    // Laternen alle ≈ 30 m an Ortsstraßen (abwechselnd links und rechts), Gehwege für Fußgänger
    const lamps = [];
    for (const run of this.runs.get(t.key) || []) {
      const e = this.graph.edges[run.e];
      if (!LAMP_ROADS.test(e.h) || e.deck) continue;
      const p = e.p;
      let segStart = 0, nextAt = 15, side = (run.e % 2) ? 1 : -1;
      for (let k = run.k0; k < run.k1; k++) {
        const ax = p[k * 2], az = p[k * 2 + 1], bx = p[k * 2 + 2], bz = p[k * 2 + 3], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.1) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const town = near(mx, mz, 30);
        if (town) {
          // Belebtheit (Fußgängerdichte) und auf welcher Seite ein Gehsteig ist (1 links, 2 rechts in Richtung a→b)
          const off = e.w / 2 + 1, sl = this.walkAt(mx - dz * off, mz + dx * off) !== null, sr = this.walkAt(mx + dz * off, mz - dx * off) !== null;
          life.segs.push({ ax, az, bx, bz, n: e.n, k: 'road', h: e.h, w: e.w, act: this.liveliness(mx, mz), walk: (sl ? 1 : 0) | (sr ? 2 : 0) });
        }
        for (; nextAt < segStart + len; nextAt += 30) {
          const s = nextAt - segStart, x0 = ax + dx * s, z0 = az + dz * s;
          if (!near(x0, z0, 25)) { side = -side; continue; }
          const off = e.w / 2 + (this.walkAt(x0 - dz * (e.w / 2 + 1) * side, z0 + dx * (e.w / 2 + 1) * side) !== null ? SIDEWALK.curb + 0.45 : 0.7), x = x0 - dz * off * side, z = z0 + dx * off * side;
          side = -side;
          // nicht im Haus, nicht an einem Hindernis und nicht auf einer anderen Fahrbahn (Kreuzungen, Einmündungen)
          if (this.insideBuilding(x, z, 0.4, t) || W.collideCircle(x, z, 0.3, {}).hit || this.nearRoad(x, z, 0.4)) continue;
          const wy = this.walkAt(x, z);
          lamps.push({ x, z, y: wy !== null ? wy : W.heightAt(x, z), ry: Math.atan2(dz * -side, -dx * -side) });
        }
        segStart += len;
      }
    }
    if (lamps.length) {
      const A = this.lifeAssets(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
      const poles = new THREE.InstancedMesh(A.pole, A.poleMat, lamps.length), heads = new THREE.InstancedMesh(A.head, A.headMat, lamps.length);
      const glows = new THREE.InstancedMesh(A.glow, A.glowMat, lamps.length);
      lamps.forEach((l, i) => {
        q.setFromAxisAngle(up, l.ry); ps.set(l.x, l.y, l.z); m4.compose(ps, q, one);
        poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
        ps.set(l.x + Math.sin(l.ry) * 0.9, l.y + 0.08, l.z + Math.cos(l.ry) * 0.9); q.identity(); m4.compose(ps, q, one); glows.setMatrixAt(i, m4);
      });
      poles.castShadow = heads.castShadow = true; glows.visible = this.night;
      for (const m of [poles, heads, glows]) { m.computeBoundingSphere(); t.group.add(m); life.meshes.push(m); }
      life.glow = glows;
      life.lamps = lamps; // für das Laternenlicht an Fassaden (js/post.js, seit v3.18.0)
    }
    // geparkte Autos auf den Parkflächen der Kachel (js/parking.js, seit v3.18.0)
    if (typeof ParkKit !== 'undefined') ParkKit.build(this, t, life);
    // Ladenschilder an den Fassaden und begehbare Lokale (Döner, Gasthaus, Café, Mode, Drogerie, Bücher)
    // dazu Firmennamen (OSM name) an Gewerbe- und Industriehallen; an Hallen größere Schrift unter der Attika
    // (Punkt: Ecke der Halle, die der Straße am nächsten liegt, 1 m nach innen – große Hallen liegen weit von der Straße)
    const firms = t.buildings.filter(b => b.hk >= 0 && b.n && !t.d.shops.some(q => q.name === b.n)).map(b => {
      const cx = (b.bb.minX + b.bb.maxX) / 2, cz = (b.bb.minZ + b.bb.maxZ) / 2, r = this.nearestRoad(cx, cz, 200, null);
      let x = cx, z = cz, bd = Infinity;
      if (r) for (let i = 0; i < b.p.length; i += 2) { const d = Math.hypot(b.p[i] - r.x, b.p[i + 1] - r.z); if (d < bd) { bd = d; x = b.p[i]; z = b.p[i + 1]; } }
      const l = Math.hypot(cx - x, cz - z) || 1;
      return [b.n, 'office=company', x + (cx - x) / l * 1.5, z + (cz - z) / l * 1.5];
    });
    if ((t.d.shops.length || firms.length) && this.props && this.props.signsFor) {
      const placed = new U.Grid(20);
      const res = this.props.signsFor(t.d.shops.map(q => [q.name, q.kind, q.x, q.z]).concat(firms), {
        atlas: 1024, maxDist: Infinity, roadDist: 80,
        big: b => b.hk >= 0 ? { h: b.hk === HALL.MARKT ? 1.25 : 1.05, top: b.top } : null,
        crowded: (x, z, r) => placed.query(x, z, r).some(o => Math.hypot(o.x - x, o.z - z) < r),
        mark: (x, z) => placed.insert({ x, z }, x, z, x, z),
      });
      for (const m of res.meshes) { t.group.add(m); life.meshes.push(m); }
      life.signMats = res.mats;
      for (const mt of res.mats) mt.emissiveIntensity = this.night ? 0.85 : 0;
    }
    // Preismasten der Tankstellen, Ortstafeln an den Ortseingängen (js/archetypes.js)
    SiteKit.lifeSigns(this, t, life);
    if (this.property) {
      let n = 0;
      for (const q of t.d.shops) {
        const type = regionVenueType(q.name, q.kind);
        if (!type || n >= 4) continue;
        const r = W.nearestRoad(q.x, q.z, 60, s => !!s.n);
        const v = this.property.placeVenue({ id: 'r' + Math.round(q.x) + '_' + Math.round(q.z), name: q.name, street: r ? r.seg.n : '', type, x: q.x, z: q.z });
        if (v) { life.venues.push(v); n++; }
      }
    }
    this.lifeChanged = true;
  }
  dropLife(t) {
    if (!this.lifeOn.has(t.key)) return;
    this.lifeOn.delete(t.key);
    const life = t.life;
    t.life = null;
    this.lifeChanged = true;
    if (!life) return;
    for (const m of life.meshes) { t.group.remove(m); if (m.isInstancedMesh) m.dispose(); else if (m.geometry) m.geometry.dispose(); }
    for (const mt of (life.signMats || []).concat(life.ownMats || [])) { if (mt.map) mt.map.dispose(); mt.dispose(); }
    if (this.property) for (const v of life.venues) this.property.removeVenue(v);
  }
  // Gehwege aller Orte in der Nähe (für die Fußgänger)
  lifeSegments() {
    const out = [];
    for (const key of this.lifeOn) { const t = this.loaded.get(key); if (t && t.life) out.push(...t.life.segs); }
    return out;
  }
  // Testansicht: Wände nach Bautyp einfärben (rot historisch, dunkelrot Fachwerk, gelb 1950er–70er, grün 1970er–90er,
  // blau Neubau, violett Mehrfamilienhaus, türkis Gewerbe)
  set debugArch(v) { this.world.archDebug.value = v ? 1 : 0; }
  get debugArch() { return this.world.archDebug.value > 0.5; }
  // Bautyp des Hauses an einer Stelle (für Tests)
  archAt(x, z) {
    const t = this.loaded.get(tileKey(...this.tileOf(x, z)));
    if (!t || !t.polyGrid) return null;
    const hit = t.polyGrid.query(x, z, 1, []).find(r => U.pointInPoly(x, z, r.p));
    return hit ? { a: hit.a, name: ARCH_NAMES[hit.a], t: hit.t } : null;
  }
  setNight(n) {
    this.night = n;
    for (const key of this.lifeOn) {
      const t = this.loaded.get(key);
      if (!t || !t.life) continue;
      if (t.life.glow) t.life.glow.visible = n;
      for (const mt of t.life.signMats || []) mt.emissiveIntensity = n ? 0.85 : 0;
      for (const mt of t.life.ownMats || []) mt.emissiveIntensity = n ? 0.35 : 0;
    }
  }

  // ---------------- Gebäude ----------------
  buildBuildings(t) { for (const _ of this.buildingSteps(t)); }
  // Häuser einer Kachel; gibt alle 20 Häuser die Kontrolle ab (Zeitscheiben, siehe update)
  *buildingSteps(t) {
    const W = this.world, list = t.d.buildings;
    if (!list.length) return;
    const walls = this.chunks(t), plain = this.chunks(t), roofs = this.chunks(t);
    const rnd = U.rng(t.key * 7 + 3);
    const BAY_W = 3.2 * 4, BAY_H = 3.1 * 4;
    const photoCol = new THREE.Color(ORTHO_TINT);
    const tuv = (x, z) => [(x - t.x0) / this.tw, 1 - (z - t.z0) / this.th];
    // Läden in Hallen (Markt) und Tankstellen unter den OSM-Tankdächern (js/archetypes.js)
    const shopPts = t.d.shops.filter(q => q.kind !== 'amenity=fuel'), fuelRoof = new Map(), agrar = [];
    for (const q of t.d.shops) {
      if (q.kind !== 'amenity=fuel') continue;
      let best = null, bd = 25;
      for (const b of list) {
        if (b.t !== 'roof' && b.t !== 'carport') continue;
        const bb = U.polyBBox(b.p), a = Math.abs(U.polyArea(b.p)), d = Math.hypot((bb.minX + bb.maxX) / 2 - q.x, (bb.minZ + bb.maxZ) / 2 - q.z);
        if (a >= 50 && a <= 900 && d < bd && !fuelRoof.has(b)) { bd = d; best = b; }
      }
      if (best) fuelRoof.set(best, q.name);
    }
    t.fuelSites = [];
    let done = 0;
    for (const b of list) {
      if (++done % 20 === 0) yield;
      const ring = b.p, n = ring.length / 2;
      let minH = Infinity, maxH = -Infinity;
      for (let i = 0; i < ring.length; i += 2) { const h = W.heightAt0(ring[i], ring[i + 1]); if (h < minH) minH = h; if (h > maxH) maxH = h; }
      const isCanopy = b.t === 'roof' || b.t === 'carport';
      const area = U.polyArea(ring), absA = Math.abs(area), sgn = area > 0 ? 1 : -1;
      const arch = b.a || 0, neben = arch === ARCH.NEBEN, agNeu = arch === ARCH.AGRAR_NEU, indus = arch === ARCH.INDUSTRIE;
      const farm = FARM_TYPES.has(b.t) || arch === ARCH.AGRAR_ALT || agNeu, hall = HALL_TYPES.has(b.t) || indus;
      // Halle je Art (Stahl, Gewerbe, Markt, Agrar) bzw. runder Behälter (js/archetypes.js)
      const shopIn = absA >= 150 && (hall || arch === 7) && shopPts.some(q => U.pointInPoly(q.x, q.z, ring));
      const hk = SiteKit.hallKind(b, arch, absA, shopIn), tank = ROUND_TANKS.has(b.t) ? SiteKit.round(ring) : null;
      const plainType = (PLAIN_TYPES.has(b.t) || farm || hall || isCanopy || neben || !!tank) && hk < 0;
      // kleines Wohnhaus: eigene Fenster, Haustür und Dach je Bautyp (Landhaus nur im historischen Kern)
      const rural = !plainType && arch <= ARCH.NEUBAU && RURAL_HOUSES.has(b.t) && absA >= 30 && absA <= 300 && b.h < 14 && n <= 12;
      // Garage (mit Tor zur Straße), Garagenzeile, Gartenschuppen; Bauzeit vom Nachbarhaus (tools/classify-buildings.js)
      const road0 = neben ? this.nearestRoad((ring[0] + ring[4 % ring.length]) / 2, (ring[1] + ring[5 % ring.length]) / 2, 40, null) : null;
      const garage = neben && !isCanopy && absA >= 14 && (b.t === 'garage' || b.t === 'garages' || (b.t === 'yes' && absA <= 75 && !!road0));
      const shed = neben && !garage && !isCanopy && absA < 40;
      const era = b.e || 0;
      // Nebengebäude ohne Typ (Garage, Schuppen) bekämen sonst die geschätzten 8 m eines Hauses
      const eaveH = hk >= 0 ? SiteKit.hallEave(hk, b.h, rnd) : rural ? this.eaveHeight(arch, b.h, rnd) : garage ? 2.55 + rnd() * 0.4 : shed ? Math.min(b.h, 2.3 + rnd() * 0.3)
        : neben && b.t === 'yes' ? Math.min(b.h, 2.9 + rnd() * 0.5) : b.h;
      const top = Math.max(minH + eaveH, maxH + (garage || shed ? 1.4 : 2.2)), base = isCanopy ? top - 0.6 : minH - 2;
      const bb = U.polyBBox(ring), cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
      const pick = list => list[Math.floor(rnd() * list.length)];
      let kit = null;
      if (rural) {
        const K = FACADE_KIT[arch] || FACADE_KIT[1], kr = U.rng((Math.floor(cx * 3.1) * 7919 + Math.floor(cz * 2.3)) & 0x7fffffff);
        const ch = list => { let x = kr(); for (const [k, p] of list) if ((x -= p) <= 0) return k; return list[list.length - 1][0]; };
        kit = { mat: b.fw ? 0 : ch(K.mat), win: ch(K.win), kr };
      }
      const hex = kit && kit.mat === 1 ? KLINKER_WALLS[Math.floor(kit.kr() * KLINKER_WALLS.length)] : kit && kit.mat === 6 ? WOOD_WALLS[Math.floor(kit.kr() * WOOD_WALLS.length)]
        : hk >= 0 ? SiteKit.hallWall(hk, rnd) : tank ? (b.t === 'digester' ? pick(['#8f9a8c', '#b5b8b2', '#6f7f6c']) : b.t === 'slurry_tank' ? '#a9a59c' : '#d2d5d4')
        : farm ? pick(agNeu ? AGRAR_NEU_WALLS : BARN_WALLS) : indus ? pick(INDUSTRIE_WALLS) : hall ? '#c5c1b7'
        : garage ? pick(GARAGE_WALLS[era]) : shed && /shed|hut|allotment_house|yes/.test(b.t) ? pick(SHED_WALLS)
        : neben ? pick(NEBEN_WALLS) : PLAIN_TYPES.has(b.t) ? '#a7a39a'
        : /church|chapel|cathedral/.test(b.t) ? '#e6dfcc' : b.t === 'castle' ? '#d8ccae' : pick(ARCH_WALLS[arch] || RURAL_FACADES);
      const styleCode = 8 * arch + 128 * (b.fw || 0) + (kit ? 256 * kit.mat + 2048 * kit.win : 0);
      const wallCol = U.color(hex, 0.1, rnd);
      const wb = plainType && !garage ? plain.get(cx, cz) : walls.get(cx, cz), pb = plain.get(cx, cz);
      // Dachform (js/houses.js) vor den Wänden festlegen: Pultdach hebt die hohe Wand an, Flachdach bekommt eine Attika
      const f4 = n === 4 ? HouseKit.frame(ring) : null;
      const plan = hk >= 0 ? SiteKit.hallPlan(hk, b.rs || 0, f4, rnd) : rural && n === 4 ? HouseKit.plan(arch, b.rs || 0, f4.a / Math.max(0.5, f4.d), eaveH < 4.2, rnd)
        : rural && arch === ARCH.NEUBAU && (b.rs === 5 || (!b.rs && rnd() < 0.3)) ? { kind: 'flat', par: 0.35 }
        : garage && (era === 3 || (era !== 0 && !(era === 2 && rnd() < 0.4))) && b.rs !== 1 ? { kind: 'flat', par: era === 3 ? 0.25 : 0 } : null;
      const yHigh = plan && plan.kind === 'pult' ? top + 2 * f4.d * Math.tan(plan.pitch * Math.PI / 180) : top;
      const wallTop = (ox, oz) => !plan ? top : plan.kind === 'pult' ? ((ox * f4.vx + oz * f4.vz) * plan.side > 0.7 ? yHigh : top)
        : plan.kind === 'flat' ? top + plan.par : top;
      // Haustür: an der längsten Wand, die zur nächsten Straße zeigt (Garage: Tor zur Straße)
      let doorWall = -1, doorSlot = 0;
      if (rural || garage || hk >= 0) {
        const road = hk >= 0 ? this.nearestRoad(cx, cz, 90, null) : rural ? this.nearestRoad(cx, cz, 45, null) : road0;
        let best = -Infinity;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], len = Math.hypot(bx - ax, bz - az);
          if (len < (garage ? 2.6 : hk >= 0 ? 6 : 3.6)) continue;
          const ox = sgn * (bz - az) / len, oz = -sgn * (bx - ax) / len;
          const tx = road ? road.x - (ax + bx) / 2 : ox, tz = road ? road.z - (az + bz) / 2 : oz, tl = Math.hypot(tx, tz) || 1;
          const score = (ox * tx + oz * tz) / tl + len * 0.02;
          if (score > best) {
            best = score; doorWall = i;
            const nS = Math.max(1, Math.floor(len / 3.1)), sw = len / nS;
            const proj = road ? U.clamp(((road.x - ax) * (bx - ax) + (road.z - az) * (bz - az)) / len, 0, len) : len / 2;
            doorSlot = U.clamp(Math.floor(proj / sw), nS >= 3 ? 1 : 0, nS >= 3 ? nS - 2 : nS - 1);
          }
        }
      }
      let along = 0, frontW = null;
      const sideBase = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
        if (len < 0.01) { sideBase.push(minH); continue; }
        const ox = sgn * dz / len, oz = -sgn * dx / len;
        const wt = wallTop(ox, oz), profTop = plan && plan.kind === 'pult' ? wt : top;
        const u0 = along / BAY_W, u1 = (along + len) / BAY_W, v0 = (base - minH) / BAY_H, v1 = (wt - minH) / BAY_H;
        // Boden an dieser Wand: höchstes Gelände an ihr (Fenster und Tür darüber)
        const gnd = Math.max(minH, this.heightAt(ax, az), this.heightAt(bx, bz), this.heightAt((ax + bx) / 2, (az + bz) / 2));
        sideBase.push(gnd);
        const style = (rural ? (i === doorWall ? 2 : 1) : garage ? (i === doorWall ? 5 : 4) : hk >= 0 ? (i === doorWall ? 7 : 6) : 0) + styleCode;
        // Halle: Feld „Tür“ = Art × 16 + Tore (nur an der Front zur Straße)
        const hDoor = hk >= 0 ? hk * 16 + (i === doorWall ? SiteKit.gates(hk, len) : 0) : 0;
        if (hk >= 0 && i === doorWall) frontW = { ax, az, bx, bz, len, ox, oz, g: gnd, nG: hDoor - hk * 16 };
        // Garage: Feld „Tür“ = Bauzeit × 16 + Zahl der Tore (Doppelgarage am Neubau mit einem breiten Tor)
        const gDoors = garage && i === doorWall ? era * 16 + (era === 3 && len < 7.2 ? 1 : U.clamp(Math.floor((len - 0.35) / 2.95), 1, 12)) : 0;
        const pr = plainType && !garage ? null : rectProfile(along, len, profTop, gnd, style, garage ? gDoors : hk >= 0 ? hDoor : i === doorWall ? doorSlot : 0);
        along += len;
        const A0 = [ax, base, az], B0 = [bx, base, bz], B1 = [bx, wt, bz], A1 = [ax, wt, az];
        wb.tri(A0, B0, B1, wallCol, [u0, v0], [u1, v0], [u1, v1], ox, 0, oz, pr);
        wb.tri(A0, B1, A1, wallCol, [u0, v0], [u1, v1], [u0, v1], ox, 0, oz, pr);
        if (!isCanopy) { t.edges.push(ax, az, bx, bz); t.edgeGrid.insert(t.edges.length / 4 - 1, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)); }
        // Pultdach: Giebelseiten bekommen das Dreieck bis zur hohen Traufe
        if (plan && plan.kind === 'pult' && Math.abs(ox * f4.vx + oz * f4.vz) < 0.3) {
          const hiB = ((bx - f4.c[0]) * f4.vx + (bz - f4.c[1]) * f4.vz) * plan.side > 0, a0 = along - len;
          const T = hiB ? [bx, yHigh, bz] : [ax, yHigh, az];
          const tp = hiB ? [a0, a0 + len, a0 + len, style, top, yHigh, yHigh, gnd, top - 0.05, 0] : [a0, a0, a0 + len, style, yHigh, yHigh, top, gnd, top - 0.05, 0];
          wb.tri(A1, B1, T, wallCol, [u0, v1], [u1, v1], [hiB ? u1 : u0, (yHigh - minH) / BAY_H], ox, 0, oz, tp);
        }
        if (i === doorWall && rural) {
          // Vordach über der Haustür und eine Stufe davor
          const nS = Math.max(1, Math.floor(len / 3.1)), sw = len / nS, dm = (doorSlot + 0.5) * sw;
          const px = ax + dx / len * dm, pz = az + dz / len * dm, ang = Math.atan2(dz, dx);
          // Holz am historischen Haus, Beton an Siedlungshäusern, flaches Anthrazit-Vordach an Neubauten
          const cv = arch === ARCH.NEUBAU ? ['#3a3c3f', 2.3, 0.07, 1.1] : arch === ARCH.SIEDLUNG ? ['#8d8a83', 1.6, 0.1, 0.85]
            : arch === ARCH.EFH ? ['#5b3f2a', 2.0, 0.12, 1.0] : ['#4a4038', 1.75, 0.09, 0.9];
          W.boxTris(pb, px + ox * cv[3] / 2, gnd + 2.42, pz + oz * cv[3] / 2, cv[1], cv[2], cv[3], ang, U.color(cv[0], 0.1, rnd));
          const gy = this.heightAt(px + ox * 0.35, pz + oz * 0.35);
          W.boxTris(pb, px + ox * 0.3, gy - 0.3, pz + oz * 0.3, 1.5, gnd - gy + 0.3 + 0.02, 0.6, ang, U.color('#9c927f', 0.08, rnd));
        }
      }
      // Dach: mit Luftbild das Foto von oben, sonst Ziegel- oder Flachdachfarbe
      const rt = t.photo ? { b: roofs.get(cx, cz), uv: tuv } : { b: plain.get(cx, cz) };
      const roofCol = t.photo ? photoCol : U.color(b.r || HIP_TYPES.has(b.t) ? TILE_ROOFS[Math.floor(rnd() * TILE_ROOFS.length)] : '#7c7973', 0.12, rnd);
      if (isCanopy) {
        W.flatRoof({ b: pb }, [ring], base, roofCol, -1);
        if (fuelRoof.has(b)) t.fuelSites.push(SiteKit.fuelStation(this, t, rt, pb, ring, base, fuelRoof.get(b), rnd));
        else this.carportPosts(pb, ring, base, minH, rnd);
      }
      // Markt: Vordach über der Glasfront; Stahl- und Gewerbehallen: Vordächer über den Toren
      if (frontW && hk === HALL.MARKT) SiteKit.marketCanopy(W, pb, frontW, frontW.g, top, rnd);
      else if (frontW && frontW.nG > 0 && hk !== HALL.AGRAR) SiteKit.gateCanopies(W, pb, frontW, frontW.g, hk, frontW.nG, top - frontW.g, rnd);
      if (hk === HALL.AGRAR && f4 && absA >= 300) agrar.push(f4);
      const RF = ARCH_ROOF[arch] || ARCH_ROOF[0];
      let info = null;
      // Straßenseite in v (für Gauben): Seite der Haustür
      const streetSide = f4 && doorWall >= 0 ? Math.sign(((ring[doorWall * 2] + ring[((doorWall + 1) % n) * 2]) / 2 - f4.c[0]) * f4.vx + ((ring[doorWall * 2 + 1] + ring[((doorWall + 1) % n) * 2 + 1]) / 2 - f4.c[1]) * f4.vz) || 1 : 1;
      if (plan && plan.kind === 'lowgable') SiteKit.lowGable(W, rt, walls.get(cx, cz), pb, f4, top, plan.pitch, Math.min(...sideBase), wallCol, roofCol, 6 + styleCode, hk * 16, minH, BAY_W, BAY_H);
      else if (tank) {
        // Biogas-Speicher mit Kuppel, Silo mit Kegeldach, Tank und Güllebehälter flach geneigt
        const kc = t.photo ? roofCol : U.color(b.t === 'digester' ? '#6f8a5e' : '#9a9c9a', 0.05, rnd);
        if (b.t === 'digester') SiteKit.dome(W, rt, ring, tank, top, tank.r * 0.55, kc, 5);
        else SiteKit.cone(W, rt, ring, tank, top, tank.r * (b.t === 'silo' ? 0.35 : b.t === 'slurry_tank' ? 0.2 : 0.12), kc);
      }
      else if (plan && plan.kind === 'flat') HouseKit.flat(W, rt, pb, ring, top, plan, garage ? (era === 3 ? 5 : 3) : arch, roofCol, wallCol, rnd);
      else if (plan && plan.kind === 'pult') HouseKit.pult(W, rt, pb, f4, top, yHigh, plan.side, RF, roofCol, rnd);
      else if (plan && (plan.kind === 'hip' || plan.kind === 'tent')) HouseKit.hip(W, rt, pb, ring, top, roofCol, plan, RF, rnd);
      else if (plan && plan.kind === 'halfhip') info = HouseKit.halfHip(W, rt, walls.get(cx, cz), pb, ring, top, sideBase, wallCol, roofCol, plan, RF, styleCode, minH, BAY_W, BAY_H, rnd);
      else if (plan) info = this.ruralRoof(t, rt, walls.get(cx, cz), pb, ring, top, sideBase, wallCol, roofCol, rnd, minH, BAY_W, BAY_H,
        plan.pitch ? Object.assign({}, RF, { pitch: [plan.pitch, plan.pitch] }) : RF, styleCode);
      else if (/tower/.test(b.t) && absA < 200) W.pyramidRoof(rt, ring, top, roofCol, Math.sqrt(absA) * 1.1);
      else if (b.r && n === 4) W.gableRoof(rt, pb, ring, top, wallCol, roofCol);
      else if (!b.f && !isCanopy && !neben && (HIP_TYPES.has(b.t) || farm || rural) && absA > 25 && absA < 3500 && b.h < 28 && W.hipRoof(rt, ring, top, roofCol)) { /* Walmdach */ }
      else W.flatRoof(rt, [ring], top, roofCol, 1);
      // Gauben (nur Sattel- und Krüppelwalmdach mit ausgebautem Dachgeschoss), Balkone je Bautyp und Bauzeit
      if (info) HouseKit.dormers(W, rt, pb, info, arch, wallCol, roofCol, streetSide, info.chimU !== undefined ? info.chimU : null, rnd);
      if (!plainType && (rural || arch === ARCH.MFH)) this.balconies(pb, ring, sgn, sideBase, top, arch, era, rural, f4, info, doorWall, rnd);
      if (!isCanopy) {
        const rec = { p: ring, bb, top, n: b.n, t: b.t, a: arch, e: era, hk };
        t.buildings.push(rec);
        t.polyGrid.insert(rec, bb.minX, bb.minZ, bb.maxX, bb.maxZ);
      }
    }
    yield;
    // Fahrsilos an modernen Höfen, Stellplatz-Linien auf Parkplätzen (js/archetypes.js)
    t.silos = [];
    for (const f of agrar) if (rnd() < 0.55) { const p = SiteKit.bunkerSilo(this, t, plain.get(f.c[0], f.c[1]), f, rnd); if (p) t.silos.push(p); }
    for (const a of t.d.areas) if (a.k === 'parking') { const bb = U.polyBBox(a.p); SiteKit.parkingLines(this, t, plain.get((bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2), a); }
    const mats = W.buildingMaterials();
    walls.meshes(mats.wall, { cast: true, receive: true }).forEach(m => t.group.add(m));
    plain.meshes(mats.plain, { cast: true, receive: true }).forEach(m => t.group.add(m));
    roofs.meshes(t.roofMat, { cast: true, receive: true }).forEach(m => t.group.add(m));
  }

  // Traufhöhe eines Wohnhauses je Bautyp (OSM-Höhe ≤ 4,6 m = eingeschossig/Bungalow)
  eaveHeight(arch, h, rnd) {
    const low = h <= 4.6;
    switch (arch) {
      case ARCH.SIEDLUNG: return low ? 3.1 + rnd() * 0.4 : rnd() < 0.6 ? 3.6 + rnd() * 0.8 : 5.4 + rnd() * 0.6;
      case ARCH.EFH: return low ? 3.0 + rnd() * 0.4 : rnd() < 0.3 ? 3.6 + rnd() * 0.6 : 5.0 + rnd() * 0.9;
      case ARCH.NEUBAU: return low ? 3.2 + rnd() * 0.3 : 5.8 + rnd() * 0.7;
      default: return low ? 3.5 + rnd() * 0.5 : rnd() < 0.3 ? 4.1 + rnd() * 0.5 : 5.3 + rnd() * 0.9;
    }
  }

  // Satteldach (Grundriss mit vier Ecken): Neigung je Bautyp (ARCH_ROOF bzw. HouseKit.plan), First über die lange Seite, Dachüberstand
  // an Traufe und Ortgang mit Untersicht und Traufbrett, Giebelwände mit Fenstern (Wandprofil als Dreieck), Schornstein auf
  // dem First; gibt die Maße für Gauben zurück (js/houses.js)
  ruralRoof(t, rt, wb, pb, p, top, sideBase, wallCol, roofCol, rnd, minH, BAY_W, BAY_H, RF = ARCH_ROOF[0], styleCode = 0) {
    const W = this.world;
    const P = i => [p[(i % 4) * 2], p[(i % 4) * 2 + 1]];
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const s = len(P(0), P(1)) >= len(P(1), P(2)) ? 0 : 1;
    const p0 = P(s), p1 = P(s + 1), p2 = P(s + 2), p3 = P(s + 3);
    const L = len(p0, p1), depth = (len(p1, p2) + len(p3, p0)) / 2;
    const pitch = (RF.pitch[0] + rnd() * (RF.pitch[1] - RF.pitch[0])) * Math.PI / 180, tn = Math.tan(pitch);
    const rise = Math.min(depth / 2 * tn, 8.5), ridgeH = top + rise, slope = rise / (depth / 2);
    const dx = (p1[0] - p0[0]) / L, dz = (p1[1] - p0[1]) / L;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const r0 = mid(p3, p0), r1 = mid(p1, p2);
    const cx = (p0[0] + p1[0] + p2[0] + p3[0]) / 4, cz = (p0[1] + p1[1] + p2[1] + p3[1]) / 4;
    const oE = RF.oE, oG = RF.oG, yE = top - oE * slope;
    const outA = (() => { const m = mid(p0, p1); const l = Math.hypot(m[0] - r0[0] - (r1[0] - r0[0]) / 2, m[1] - r0[1] - (r1[1] - r0[1]) / 2) || 1; return [(m[0] - (r0[0] + r1[0]) / 2) / l, (m[1] - (r0[1] + r1[1]) / 2) / l]; })();
    const outB = [-outA[0], -outA[1]];
    const v = (q, y) => [q[0], y, q[1]];
    const off = (q, a, o, g) => [q[0] + dx * g + a[0] * o, q[1] + dz * g + a[1] * o];
    const R0 = off(r0, [0, 0], 0, -oG), R1 = off(r1, [0, 0], 0, oG);
    const A0 = off(p0, outA, oE, -oG), A1 = off(p1, outA, oE, oG), B2 = off(p2, outB, oE, oG), B3 = off(p3, outB, oE, -oG);
    const face = (a, b, c, ref) => W.roofTri(rt, a, b, c, roofCol, ref[0], 0.6, ref[1]);
    face(v(A0, yE), v(A1, yE), v(R1, ridgeH), outA); face(v(A0, yE), v(R1, ridgeH), v(R0, ridgeH), outA);
    face(v(B2, yE), v(B3, yE), v(R0, ridgeH), outB); face(v(B2, yE), v(R0, ridgeH), v(R1, ridgeH), outB);
    // Untersicht (Holz, dunkel) und Traufbrett
    const under = U.color(RF.under[Math.floor(rnd() * RF.under.length)], 0.1, rnd), th = 0.16;
    const quad = (a, b, c, d, nx, ny, nz, col) => { pb.tri(a, b, c, col, null, null, null, nx, ny, nz); pb.tri(a, c, d, col, null, null, null, nx, ny, nz); };
    quad(v(A0, yE - th), v(A1, yE - th), v(R1, ridgeH - th), v(R0, ridgeH - th), outA[0] * 0.3, -1, outA[1] * 0.3, under);
    quad(v(B2, yE - th), v(B3, yE - th), v(R0, ridgeH - th), v(R1, ridgeH - th), outB[0] * 0.3, -1, outB[1] * 0.3, under);
    quad(v(A0, yE - th), v(A1, yE - th), v(A1, yE), v(A0, yE), outA[0], 0, outA[1], under);
    quad(v(B2, yE - th), v(B3, yE - th), v(B3, yE), v(B2, yE), outB[0], 0, outB[1], under);
    // Ortgang (Stirnbretter an den Giebeln)
    quad(v(A0, yE - th), v(R0, ridgeH - th), v(R0, ridgeH), v(A0, yE), -dx, 0, -dz, under);
    quad(v(B3, yE - th), v(R0, ridgeH - th), v(R0, ridgeH), v(B3, yE), -dx, 0, -dz, under);
    quad(v(A1, yE - th), v(R1, ridgeH - th), v(R1, ridgeH), v(A1, yE), dx, 0, dz, under);
    quad(v(B2, yE - th), v(R1, ridgeH - th), v(R1, ridgeH), v(B2, yE), dx, 0, dz, under);
    // Giebelwände: Wandprofil als Dreieck, damit Giebelfenster unter der Dachschräge bleiben
    const gable = (a, b, r, side) => {
      const g = len(a, b), gx = (a[0] + b[0]) / 2 - cx, gz = (a[1] + b[1]) / 2 - cz;
      const base = sideBase[side] !== undefined ? sideBase[side] : minH;
      const pr = [0, g / 2, g, 1 + styleCode, top, ridgeH, top, base, top - 0.05, 0];
      const uv = (q, y) => [len(q, a) / BAY_W, (y - minH) / BAY_H];
      wb.tri(v(a, top), v(b, top), v(r, ridgeH), wallCol, uv(a, top), uv(b, top), uv(r, ridgeH), gx, 0, gz, pr);
    };
    gable(p1, p2, r1, (s + 1) % 4);
    gable(p3, p0, r0, (s + 3) % 4);
    // Schornstein auf dem First (verputzt oder Ziegel), mit Abdeckplatte
    const info = { f: HouseKit.frame(p), top, yR: ridgeH, slope, d: depth / 2, a: L / 2 };
    if (rnd() > RF.chimney) return info;                 // Neubauten meist ohne Schornstein
    const f = rnd() < 0.5 ? 0.28 : 0.68, sx = r0[0] + (r1[0] - r0[0]) * f, sz = r0[1] + (r1[1] - r0[1]) * f, ang = Math.atan2(dz, dx);
    const ch = rnd() < 0.55 ? U.color('#8c4a38', 0.1, rnd) : wallCol;
    W.boxTris(pb, sx, top + rise * 0.4, sz, 0.55, ridgeH + 0.95 - (top + rise * 0.4), 0.55, ang, ch);
    W.boxTris(pb, sx, ridgeH + 0.95, sz, 0.72, 0.08, 0.72, ang, U.color('#55524d', 0.05, rnd));
    info.chimU = (sx - info.f.c[0]) * info.f.ux + (sz - info.f.c[1]) * info.f.uz;
    return info;
  }

  // Pfosten eines Carports an den Ecken (Holz oder Anthrazit)
  carportPosts(pb, ring, y, minH, rnd) {
    const col = U.color(rnd() < 0.5 ? '#6e5236' : '#3a3c3f', 0.06, rnd), n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const x = ring[i * 2], z = ring[i * 2 + 1], g = this.heightAt(x, z);
      this.world.boxTris(pb, x, g - 0.1, z, 0.12, y - g + 0.1, 0.12, 0, col);
    }
  }

  // Balkone: Mehrfamilienhäuser an der Rückseite je Geschoss (Bauweise nach Bauzeit), Häuser der 1970er–90er oft
  // ein Holzbalkon am Giebel, Neubauten manchmal ein Stahl-/Glasbalkon im Obergeschoss, Siedlungshäuser selten.
  // Die Rückseite ist die längste Wand, die nicht zur Straße zeigt.
  balconies(pb, ring, sgn, sideBase, top, arch, era, rural, f4, info, doorWall, rnd) {
    const n = ring.length / 2;
    const wall = i => {
      const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], len = Math.hypot(bx - ax, bz - az);
      return { i, ax, az, bx, bz, len, ox: sgn * (bz - az) / (len || 1), oz: -sgn * (bx - ax) / (len || 1), g: sideBase[i] };
    };
    const kindFor = e => e === 1 ? 'beton' : e === 2 ? (rnd() < 0.55 ? 'holz' : 'stahl') : e === 3 ? (rnd() < 0.5 ? 'glas' : 'stahl') : 'stahl';
    if (!rural) {
      // Mehrfamilienhaus: Balkonreihen übereinander (Geschoss ≈ 2,9 m), alle ≈ 7 m eine Achse
      if (rnd() > (era === 0 ? 0.25 : 0.85)) return;
      const floors = Math.floor((top - sideBase[0]) / 2.9);
      if (floors < 2) return;
      let best = null;
      const road = this.nearestRoad((ring[0] + ring[2]) / 2, (ring[1] + ring[3]) / 2, 60, null);
      for (let i = 0; i < n; i++) {
        const w = wall(i);
        if (w.len < 6) continue;
        const mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2, toRoad = road ? ((road.x - mx) * w.ox + (road.z - mz) * w.oz) / (Math.hypot(road.x - mx, road.z - mz) || 1) : 0;
        const score = w.len * (toRoad > 0.3 && era !== 3 ? 0.4 : 1);
        if (!best || score > best.score) best = Object.assign(w, { score });
      }
      if (!best) return;
      const kind = kindFor(era || 1), cols = Math.max(1, Math.floor(best.len / 7)), width = era === 3 ? 4.2 : 3.4, depth = era === 1 ? 1.1 : 1.5;
      for (let c = 0; c < cols; c++) {
        const f = (c + 0.5) / cols, mx = best.ax + (best.bx - best.ax) * f, mz = best.az + (best.bz - best.az) * f;
        for (let k = 1; k < Math.min(floors, 7); k++) HouseKit.balcony(this.world, pb, mx, mz, best.ox, best.oz, best.g + k * 2.9, width, depth, kind, rnd);
      }
      return;
    }
    const P = { 3: 0.1, 4: 0.4, 5: 0.3 }[arch] || 0;
    if (!f4 || rnd() > P) return;
    if (arch === ARCH.NEUBAU) {
      // Obergeschoss an der Gartenseite (nicht die Wand mit der Haustür)
      if (top - sideBase[0] < 5.4) return;
      let best = null;
      for (let i = 0; i < n; i++) { const w = wall(i); if (i !== doorWall && w.len >= 5 && (!best || w.len > best.len)) best = w; }
      if (best) HouseKit.balcony(this.world, pb, (best.ax + best.bx) / 2, (best.az + best.bz) / 2, best.ox, best.oz, best.g + 2.85, Math.min(5, best.len * 0.55), 1.4, kindFor(3), rnd);
      return;
    }
    // Giebelbalkon (Holz in den 1970er–90ern, kleine Betonplatte an Siedlungshäusern) im Obergeschoss bzw. Dachgeschoss
    if (!info) return;
    for (let i = 0; i < n; i++) {
      const w = wall(i);
      if (Math.abs(w.ox * info.f.ux + w.oz * info.f.uz) < 0.8 || w.len < 6.5) continue;
      const y = w.g + 2.8;
      if (info.yR - y < 2.4) return;
      HouseKit.balcony(this.world, pb, (w.ax + w.bx) / 2, (w.az + w.bz) / 2, w.ox, w.oz, y, Math.min(arch === 3 ? 2.6 : 4.4, w.len - 2), arch === 3 ? 1.0 : 1.3,
        arch === 3 ? 'beton' : kindFor(2), rnd);
      return;
    }
  }

  // ---------------- Bäume ----------------
  treeAssets() {
    if (!this._trees) {
      // gleiche Formen wie in der Innenstadt (js/world.js), aber gröber, weil hier viel mehr Bäume stehen
      const A = treeAssets(0, this.world.renderer);
      this.world.leafShader(A.leafMat);
      this._trees = { trunk: A.trunk, trunkFar: A.trunkFar, leaf: A.crowns[1], leafFar: A.crownsFar[1], bush: A.bush, bushFar: A.bushFar,
        pine: A.pine, pineFar: A.pineFar, trunkMat: A.trunkMat, leafMat: A.leafMat };
    }
    return this._trees;
  }
  // Impostors (seit v3.12.0, Grafik-Phase 8): die fernen Formen von Laubbaum (mit Stamm), Nadelbaum (mit Stamm) und Busch
  // einmal von der Seite in je eine Textur gerendert (Grundfarbe mit Eigenschatten, ohne Licht); dazu zwei gekreuzte
  // Flächen, jede in beide Richtungen mit Normalen nach oben (gleichmäßig beleuchtet wie eine Krone von weitem).
  // Die Grünfärbung kommt wie beim Laub aus der Instanzfarbe. null ohne Renderer bzw. bei Fehlern.
  treeImpostors() {
    if (this._imp !== undefined) return this._imp;
    this._imp = null;
    const r = this.world.renderer;
    if (!r || !r.setRenderTarget) return null;
    try {
      const A = this.treeAssets(), S = 256, cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
      const leafM = new THREE.MeshBasicMaterial({ map: A.leafMat.map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
      const trunkM = new THREE.MeshBasicMaterial({ color: A.trunkMat.color });
      const prevRT = r.getRenderTarget(), prevCol = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha();
      const out = [[A.leafFar, true], [A.pineFar, true], [A.bushFar, false]].map(([g, trunk]) => {
        g.computeBoundingBox();
        const b = g.boundingBox, w = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z) * 2.08;
        const y0 = trunk ? 0 : Math.max(0, b.min.y), y1 = b.max.y * 1.02, side = Math.max(w, y1 - y0), cy = (y0 + y1) / 2;
        const scene = new THREE.Scene();
        scene.add(new THREE.Mesh(g, leafM));
        if (trunk) scene.add(new THREE.Mesh(A.trunkFar, trunkM));
        Object.assign(cam, { left: -side / 2, right: side / 2, top: cy + side / 2, bottom: cy - side / 2 });
        cam.position.set(0, 0, 20); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
        const rt = new THREE.WebGLRenderTarget(S, S, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
        r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
        // zwei gekreuzte Flächen (Breite und Höhe = side), jede vorne und hinten
        const pos = [], nor = [], uv = [], b0 = cy - side / 2, h = side / 2;
        for (const [dx, dz] of [[1, 0], [0, 1]]) for (const back of [false, true]) {
          const P = [[-h * dx, b0, -h * dz, 0, 0], [h * dx, b0, h * dz, 1, 0], [h * dx, b0 + side, h * dz, 1, 1], [-h * dx, b0 + side, -h * dz, 0, 1]];
          const order = back ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
          for (const i of order) { pos.push(P[i][0], P[i][1], P[i][2]); nor.push(0, 1, 0); uv.push(P[i][3], P[i][4]); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.computeBoundingSphere();
        return { geo, mat: new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.45 }), rt };
      });
      r.setRenderTarget(prevRT); r.setClearColor(prevCol, prevA);
      leafM.dispose(); trunkM.dispose();
      this._imp = out;
    } catch (e) { console.warn('Baum-Impostors aus:', e.message); }
    return this._imp;
  }
  // Bäume sofort ganz bauen (Spielstart, Schnellreise)
  buildTrees(t) {
    if (this.finishJob(t, 'trees') || this.treesOn.has(t.key) || !t.d) return;
    this.treesOn.add(t.key);
    this.runJob({ kind: 'trees', t, it: this.treeSteps(t), ms: 0 }, Infinity);
  }
  // neu bauen (Luftbild kam nach): in der Nähe sofort, sonst übernimmt update() in Zeitscheiben
  rebuildTrees(t) {
    this.dropTrees(t);
    if (this.px !== undefined && this.rectDist(t.ti, t.tj, this.px, this.pz) < 350) this.buildTrees(t);
  }
  // Bäume, Büsche und Hecken einer Kachel in Schritten. Punkte: [x, z, Art (0 Laubbaum, 1 Nadelbaum, 2 Busch), Größe]
  *treeSteps(t) {
    const pts = [];
    const d = t.d;
    const wet = (x, z) => t.waterAll && !t.waterAll.empty && t.waterAll.carveAt(x, z) > 0; // keine Bäume im Wasser
    const free = (x, z, m) => !this.inCore(x, z) && !this.insideBuilding(x, z, m, t) && !this.nearRoad(x, z, m, t) && !wet(x, z) && this.walkAt(x, z) === null &&
      !(this.land && this.land.onTrack(x, z, t, m * 0.6));
    const onEdge = (x, z) => Math.abs(x - t.x0) < 0.6 || Math.abs(x - t.x1) < 0.6 || Math.abs(z - t.z0) < 0.6 || Math.abs(z - t.z1) < 0.6;
    const rT = U.rng(t.key * 31 + 7);
    // echte Einzelbäume (OSM): liegt einer durch geschätzte Straßenbreiten auf der Fahrbahn, an den Rand rücken
    for (let i = 0; i < d.trees.length; i += 2) {
      const q = this.world.offCarriageway(d.trees[i], d.trees[i + 1], 1.0), s = 0.8 + rT() * 0.6;
      if (q && !wet(q[0], q[1]) && !this.inCore(q[0], q[1])) pts.push([q[0], q[1], 0, s]);
    }
    let budget = 9000;
    for (const a of d.areas) {
      const dens = REGION_TREE_DENSITY[a.k];
      if (!dens || budget <= 0) continue;
      const forest = a.k === 'forest', scrub = a.k === 'scrub';
      const h = U.hashStr(a.k + a.p[0] + ',' + a.p[1]);
      // Anteil Nadelbäume je Waldstück (Fichte, Kiefer) wie in den Wäldern um Coburg sehr verschieden
      const conifer = forest ? 0.15 + (h % 100) / 100 * 0.7 : 0;
      const area = Math.abs(U.polyArea(a.p)), count = Math.min(Math.round(area * dens), budget);
      const bb = U.polyBBox(a.p), rnd = U.rng(h);
      const inside = (x, z) => U.pointInPoly(x, z, a.p) && !(a.ho && a.ho.some(q => U.pointInPoly(x, z, q)));
      let made = 0;
      for (let tries = 0; made < count && tries < count * 3; tries++) {
        const x = bb.minX + rnd() * (bb.maxX - bb.minX), z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
        if (!inside(x, z) || !free(x, z, 1.5)) continue;
        if (scrub && rnd() < 0.6) pts.push([x, z, 2, 0.8 + rnd() * 0.9]);
        else pts.push([x, z, rnd() < conifer ? 1 : 0, forest ? 0.55 + Math.pow(rnd(), 0.7) * 1.15 : 0.75 + rnd() * 0.7]);
        made++;
      }
      if (forest || scrub) {
        // Waldrand: dichte Büsche und junge Bäume entlang der Grenze, etwas nach innen versetzt
        const ring = a.p, n = ring.length / 2;
        for (let i = 0; i < n && made < count + 2500; i++) {
          const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
          if (onEdge(ax, az) && onEdge(bx, bz)) continue;
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 1) continue;
          let nx = -(bz - az) / len, nz = (bx - ax) / len;
          if (!inside((ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2)) { nx = -nx; nz = -nz; }
          for (let s0 = rnd() * 3; s0 < len; s0 += 2.6 + rnd() * 2) {
            const off = 0.5 + rnd() * 4.5, x = ax + (bx - ax) * s0 / len + nx * off, z = az + (bz - az) * s0 / len + nz * off;
            if (!free(x, z, 1.2)) continue;
            if (rnd() < 0.72) pts.push([x, z, 2, 0.7 + rnd() * 0.9]);
            else pts.push([x, z, rnd() < conifer * 0.6 ? 1 : 0, 0.45 + rnd() * 0.45]);
            made++;
          }
        }
        // Unterholz
        const under = Math.min(Math.round(area / 420), 900);
        for (let k = 0, tries = 0; k < under && tries < under * 3; tries++) {
          const x = bb.minX + rnd() * (bb.maxX - bb.minX), z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
          if (!inside(x, z) || !free(x, z, 1)) continue;
          pts.push([x, z, 2, 0.45 + rnd() * 0.5]); k++; made++;
        }
      }
      budget -= made;
      yield;
    }
    // Hecken (dicht an dicht Büsche) und Baumreihen aus OSM
    const rr = this.rural.get(t.key);
    if (rr) {
      const along = (p, step, f) => { for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3], L = Math.hypot(bx - ax, bz - az); for (let s0 = rT() * step; s0 < L; s0 += step * (0.8 + rT() * 0.4)) f(ax + (bx - ax) * s0 / L, az + (bz - az) * s0 / L, -(bz - az) / L, (bx - ax) / L); } };
      for (const h of rr.hedges) along(h.p, 1.7, (x, z, nx, nz) => { const o = (rT() - 0.5) * 0.9, px = x + nx * o, pz = z + nz * o; if (free(px, pz, 0.5)) pts.push([px, pz, 2, 0.85 + rT() * 0.5]); });
      for (const r of rr.rows) along(r.p, 8, (x, z) => { if (free(x, z, 1)) pts.push([x, z, 0, 0.8 + rT() * 0.45]); });
    }
    // Gärten, Zäune, Einfahrten und Rundballen in den Dörfern
    if (this.land && t.buildings.length) { yield; t.villageMeshes = yield* this.land.villageSteps(t, pts, free); }
    yield;
    // Feldgehölze, Hecken und Einzelbäume, die das Luftbild zeigt, OSM aber nicht kennt
    yield* this.photoVegSteps(t, pts, free);
    if (!pts.length) return;
    yield;
    const A = this.treeAssets(), rnd = U.rng(t.key);
    // je Art (0 Laubbaum, 1 Nadelbaum, 2 Busch, 3 Stamm) und Zelle (4 × 4 je Kachel) Matrizen und Farben sammeln
    const N = TREE_CELLS, cw = this.tw / N, ch = this.th / N;
    const bins = [0, 1, 2, 3].map(() => Array.from({ length: N * N }, () => ({ m: [], c: [] })));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const greens = ['#5f8d3e', '#4f7d35', '#6a9a45', '#577f3a', '#7a9e4a', '#46703a'];
    const bushGreens = ['#5a7f38', '#6b8c3f', '#4d7334', '#7d9445', '#5f7a3a'];
    const trees = [], treeGrid = new U.Grid(16), col = new THREE.Color();
    const add = (kind, cell, c) => { const b = bins[kind][cell]; for (let i = 0; i < 16; i++) b.m.push(m4.elements[i]); if (c) b.c.push(c.r, c.g, c.b); };
    let k = 0;
    for (const p of pts) {
      if (++k % 1500 === 0) yield;
      const s = p[3];
      q.setFromAxisAngle(up, rnd() * 6.28);
      ps.set(p[0], this.heightAt(p[0], p[1]) - 0.2, p[1]); sc.set(s, s * (0.85 + rnd() * 0.35), s);
      m4.compose(ps, q, sc);
      const kind = p[2], cell = U.clamp(Math.floor((p[0] - t.x0) / cw), 0, N - 1) + N * U.clamp(Math.floor((p[1] - t.z0) / ch), 0, N - 1);
      if (kind === 2) {
        col.set(bushGreens[Math.floor(rnd() * bushGreens.length)]).multiplyScalar(0.8 + rnd() * 0.35);
        add(2, cell, col);
        continue;
      }
      add(3, cell, null);
      col.set(kind ? '#3f6634' : greens[Math.floor(rnd() * greens.length)]).multiplyScalar(0.85 + rnd() * 0.3);
      add(kind, cell, col);
      trees.push(p[0], p[1], 0.35 * s);
      treeGrid.insert(trees.length / 3 - 1, p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1);
    }
    yield;
    t.trees = trees; t.treeGrid = treeGrid; // Kollision erst, wenn die Bäume zu sehen sind
    if (t.canopy) t.canopy.visible = false;
    t.treeMeshes = [];
    const forms = [[A.leaf, A.leafFar, A.leafMat], [A.pine, A.pineFar, A.leafMat], [A.bush, A.bushFar, A.leafMat], [A.trunk, A.trunkFar, A.trunkMat]];
    const imps = this.treeImpostors(); // Laubbaum, Nadelbaum, Busch; Stämme ohne

    bins.forEach((cells, kind) => {
      const start = new Int32Array(N * N + 1);
      cells.forEach((b, c) => { start[c + 1] = start[c] + b.m.length / 16; });
      const n = start[N * N];
      if (!n) return;
      const mats = new Float32Array(n * 16), cols = kind === 3 ? null : new Float32Array(n * 3);
      cells.forEach((b, c) => { mats.set(b.m, start[c] * 16); if (cols) cols.set(b.c, start[c] * 3); });
      const set = new TreeSet(t, forms[kind][0], forms[kind][1], forms[kind][2], mats, cols, start, cw, ch, imps ? imps[kind] : null);
      set.update(this.px !== undefined ? this.px : t.x0, this.pz !== undefined ? this.pz : t.z0);
      t.treeMeshes.push(set);
      (this.world.treeLod || (this.world.treeLod = [])).push(set);
    });
  }
  // Gehölze aus dem Luftbild: dunkelgrüne Flecken außerhalb von Wald, Häusern, Straßen und Wasser werden zu Büschen
  // (Hecken, schmale Streifen) und Bäumen (große Flecken)
  photoVegetation(t, pts, free) { for (const _ of this.photoVegSteps(t, pts, free)); }
  *photoVegSteps(t, pts, free) {
    const img = this.photoImage(t);
    if (!img || !img.width || img.width < 64) return;
    t.photoVeg = true;
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0, S, S);
    const px = c.getImageData(0, 0, S, S).data, cov = t.coverRaw;
    // Gehölz = deutlich dunkler als die Umgebung (Mittel über ≈ 50 m) und grünlich; Schatten von Häusern sind bläulich
    const L = new Float32Array(S * S), M = new Uint8ClampedArray(S * S * 4);
    for (let k = 0; k < S * S; k++) { L[k] = 0.3 * px[k * 4] + 0.59 * px[k * 4 + 1] + 0.11 * px[k * 4 + 2]; M[k * 4] = L[k]; }
    Landscape.blur(M, S, 6, 1, 1);
    yield;
    const mean = k => M[k * 4];
    const mask = new Uint8Array(S * S);
    for (let k = 0; k < S * S; k++) {
      const r = px[k * 4], g = px[k * 4 + 1], b = px[k * 4 + 2], l = L[k];
      if (l > 18 && l < 125 && l < mean(k) * 0.84 && g >= r - 4 && g > b + 3 && !(cov && cov[k * 4 + 2] > 120)) mask[k] = 1;
    }
    const rnd = U.rng(t.key * 17 + 3);
    let made = 0, ty = performance.now();
    for (let y = 1; y < S - 1 && made < 5000; y++) {
      if (performance.now() - ty > 2) { yield; ty = performance.now(); }
      for (let x = 1; x < S - 1; x++) {
        if (!mask[y * S + x]) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += mask[(y + dy) * S + x + dx];
        if (n < 3 || rnd() > 0.6) continue;
        const wx = t.x0 + (x + rnd()) / S * this.tw, wz = t.z0 + (y + rnd()) / S * this.th;
        if (!free(wx, wz, 1.2)) continue;
        if (n >= 8 && rnd() < 0.45) pts.push([wx, wz, rnd() < 0.15 ? 1 : 0, 0.7 + rnd() * 0.6]);
        else pts.push([wx, wz, 2, 0.8 + rnd() * 0.8]);
        made++;
      }
    }
  }
  dropTrees(t) {
    if (this.job && this.job.t === t && this.job.kind === 'trees') this.job = null;
    if (!this.treesOn.has(t.key)) return;
    this.treesOn.delete(t.key);
    if (t.canopy) t.canopy.visible = true;
    for (const m of t.villageMeshes || []) { t.group.remove(m); if (m.isInstancedMesh) m.dispose(); else m.geometry.dispose(); }
    t.villageMeshes = null;
    for (const set of t.treeMeshes || []) { this.world.removeTreeLod(set.m); for (const m of set.meshes()) { t.group.remove(m); m.dispose(); } }
    t.treeMeshes = null; t.trees = null; t.treeGrid = null;
  }

  // ---------------- Abfragen ----------------
  // geladene Kacheln, deren Rechteck (um margin erweitert) den Punkt enthält
  tilesNear(x, z, margin) {
    const out = this._near; out.length = 0;
    const [ti, tj] = this.tileOf(x, z);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const t = this.loaded.get(tileKey(ti + a, tj + b));
      if (t && x > t.x0 - margin && x < t.x1 + margin && z > t.z0 - margin && z < t.z1 + margin) out.push(t);
    }
    return out;
  }
  insideBuilding(x, z, margin, only) {
    const tiles = only ? [only] : this.tilesNear(x, z, 120);
    for (const t of tiles) {
      const list = t.polyGrid.query(x, z, 0, this.world._tmp);
      for (const b of list) {
        if (x < b.bb.minX - margin || x > b.bb.maxX + margin || z < b.bb.minZ - margin || z > b.bb.maxZ + margin) continue;
        if (U.pointInPoly(x, z, b.p)) return b;
      }
    }
    return null;
  }
  // Straßenabschnitt, dessen Fahrbahn (plus margin) (x, z) überdeckt. Sucht im ganzen Straßennetz, nicht nur in einer
  // gebauten Kachel: lange Abschnitte aus der Nachbarkachel zählen mit (sonst stünden dort Bäume auf der Fahrbahn).
  // Das frühere vierte Argument (nur diese Kachel) wird ignoriert.
  nearRoad(x, z, margin) {
    const E = this.graph.edges;
    for (const code of this.netGrid.query(x, z, 10 + margin, this._nq || (this._nq = []))) {
      const e = E[Math.floor(code / 4096)], k = (code % 4096) * 2, p = e.p;
      const c = U.closestOnSeg(x, z, p[k], p[k + 1], p[k + 2], p[k + 3]);
      if (Math.hypot(c[0] - x, c[1] - z) < e.w / 2 + margin) return { ax: p[k], az: p[k + 1], bx: p[k + 2], bz: p[k + 3], n: e.n, k: 'road', h: e.h, w: e.w };
    }
    return null;
  }
  nearestRoad(x, z, maxDist, filter, best) {
    let bestD = best ? best.d : maxDist;
    for (const t of this.tilesNear(x, z, maxDist).slice()) for (const s of t.roadGrid.query(x, z, maxDist, [])) {
      if (filter && !filter(s)) continue;
      const c = U.closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz), dd = Math.hypot(c[0] - x, c[1] - z);
      if (dd < bestD) { bestD = dd; best = { seg: s, x: c[0], z: c[1], d: dd }; }
    }
    return best;
  }
  // Kollision mit Häusern und Bäumen des Umlands; verschiebt out.x/out.z
  collide(out, r, y) {
    let x = out.x, z = out.z, moved = false;
    for (const t of this.tilesNear(x, z, 90).slice()) {
      // Leitplanken und Brückenkanten: nur für Autos (mit Höhe y) und nur auf ihrer Höhe
      if (y !== undefined && t.railGrid) {
        const RL = t.rails, list = t.railGrid.query(x, z, r + 1, this.world._tmp);
        for (let n = 0; n < list.length; n++) {
          const e = list[n] * 5;
          if (Math.abs(RL[e + 4] - y) > 2) continue;
          const c = U.closestOnSeg(x, z, RL[e], RL[e + 1], RL[e + 2], RL[e + 3]);
          const dx = x - c[0], dz = z - c[1], d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
            x += nx * (r - d); z += nz * (r - d);
            out.nx += nx; out.nz += nz; out.hit = true; moved = true;
          }
        }
      }
      const E = t.edges, list = t.edgeGrid.query(x, z, r + 1, this.world._tmp);
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        const c = U.closestOnSeg(x, z, E[e * 4], E[e * 4 + 1], E[e * 4 + 2], E[e * 4 + 3]);
        const dx = x - c[0], dz = z - c[1], d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
          x += nx * (r - d); z += nz * (r - d);
          out.nx += nx; out.nz += nz; out.hit = true; moved = true;
        }
      }
      if (t.rivers) {
        out.x = x; out.z = z;
        if (pushFromRivers(t.rivers, out, r, this.world._tmp, y)) { x = out.x; z = out.z; moved = true; }
      }
      // geparkte Autos (js/parking.js, seit v3.18.0)
      if (t.life && t.life.lot) {
        out.x = x; out.z = z;
        if (ParkKit.collide(t.life.lot, x, z, r, out)) { x = out.x; z = out.z; moved = true; }
      }
      if (!t.treeGrid) continue;
      const TR = t.trees, tl = t.treeGrid.query(x, z, r + 1, this.world._tmp);
      for (let n = 0; n < tl.length; n++) {
        const k = tl[n], dx = x - TR[k * 3], dz = z - TR[k * 3 + 1], rr = r + TR[k * 3 + 2], d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
          x += nx * (rr - d); z += nz * (rr - d);
          out.nx += nx; out.nz += nz; out.hit = true; moved = true;
        }
      }
    }
    out.x = x; out.z = z;
    return moved;
  }
  // Rand der befahrbaren Kacheln: zurück auf die nächste befahrbare Kachel schieben
  clamp(out) {
    const [ti, tj] = this.tileOf(out.x, out.z);
    if (this.stateOf(ti, tj) === 2) return;
    let best = null, bd = Infinity;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      if (this.stateOf(ti + a, tj + b) !== 2) continue;
      const x0 = this.tileX(ti + a) + 0.5, z0 = this.tileZ(tj + b) + 0.5, x1 = x0 + this.tw - 1, z1 = z0 + this.th - 1;
      const x = U.clamp(out.x, x0, x1), z = U.clamp(out.z, z0, z1), d = Math.hypot(x - out.x, z - out.z);
      if (d < bd) { bd = d; best = [x, z]; }
    }
    if (!best) return;
    const dx = best[0] - out.x, dz = best[1] - out.z, l = Math.hypot(dx, dz) || 1;
    out.x = best[0]; out.z = best[1]; out.hit = true; out.nx = dx / l; out.nz = dz / l;
  }
  walkable(x, z) { return this.stateAt(x, z) === 2; }

  // Nächster Ort (Stadt, Dorf, Ortsteil) im Umkreis, für die Ortsanzeige
  placeAt(x, z, maxD = 1600) {
    let best = null, bd = Infinity;
    for (const p of this.places) {
      if (!/city|town|village|suburb|hamlet|quarter/.test(p.k)) continue;
      const w = p.k === 'town' || p.k === 'city' ? 0.55 : p.k === 'village' ? 0.8 : 1;
      const d = Math.hypot(p.x - x, p.z - z) * w;
      if (d < bd && d < maxD) { bd = d; best = p; }
    }
    return best;
  }

  // ---------------- Karte ----------------
  // Minikarte: Häuser und Straßen der gebauten Kacheln im Umkreis r (Weltkoordinaten, k Pixel pro Meter)
  drawNear(ctx, x, z, r, k) {
    const tiles = [...this.loaded.values()].filter(t => t.st === 2 && this.rectDist(t.ti, t.tj, x, z) < r);
    ctx.fillStyle = '#c9bba6';
    for (const t of tiles) for (const b of t.buildings) {
      if (Math.abs(b.bb.minX - x) > r || Math.abs(b.bb.minZ - z) > r) continue;
      this.world.pathPoly(ctx, b.p); ctx.fill();
    }
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const t of tiles) {
        const runs = this.runs.get(t.key) || [];
        for (const run of runs) {
          const e = this.graph.edges[run.e];
          const major = /motorway|trunk|primary|secondary/.test(e.h);
          ctx.strokeStyle = pass ? (major ? '#f7d58b' : '#ffffff') : '#a49c8c';
          ctx.lineWidth = Math.max(e.w + (pass ? 0 : 3), (pass ? 3 : 5) / k);
          ctx.beginPath();
          for (let i = run.k0; i <= run.k1; i++) i === run.k0 ? ctx.moveTo(e.p[i * 2], e.p[i * 2 + 1]) : ctx.lineTo(e.p[i * 2], e.p[i * 2 + 1]);
          ctx.stroke();
        }
      }
    }
  }

  // Übersichtskarte des Landkreises (S Pixel pro Meter), in Teilen gemalt: paintMap(cb) ruft cb(canvas, scale)
  paintMap(done) {
    const L = this.limits, S = 0.08;
    const W = Math.ceil((L.maxX - L.minX) * S), H = Math.ceil((L.maxZ - L.minZ) * S);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = '#3a4535'; c.fillRect(0, 0, W, H);
    c.setTransform(S, 0, 0, S, -L.minX * S, -L.minZ * S);
    // befahrbare Kacheln hell, Randkacheln etwas dunkler
    for (let j = 0; j < this.tnj; j++) for (let i = 0; i < this.tni; i++) {
      const st = this.state.charCodeAt(j * this.tni + i) - 48;
      if (!st) continue;
      c.fillStyle = st === 2 ? '#ece8dc' : '#b9bcae';
      c.fillRect(this.tileX(this.ti0 + i) - 1, this.tileZ(this.tj0 + j) - 1, this.tw + 2, this.th + 2);
    }
    const keys = Object.keys(this.R.data);
    const order = Object.keys(MAP_STYLE);
    let k = 0;
    const MAPK = { farmyard: 'farmland', orchard: 'meadow', scrub: 'meadow', river: 'water' };
    const stepPaint = () => {
      const t0 = performance.now();
      while (k < keys.length && performance.now() - t0 < 12) {
        const [ti, tj] = keys[k++].split(',').map(Number);
        const d = this.decodeTile({ ti, tj });
        for (const a of d.areas.sort((x, y) => order.indexOf(MAPK[x.k] || x.k) - order.indexOf(MAPK[y.k] || y.k))) {
          const col = MAP_STYLE[MAPK[a.k] || a.k];
          if (!col) continue;
          c.fillStyle = col; this.world.pathPoly(c, a.p, a.ho); c.fill('evenodd');
        }
        c.lineCap = c.lineJoin = 'round';
        c.strokeStyle = MAP_STYLE.water;
        for (const w of d.water) { c.lineWidth = Math.max(w.w, 8); this.world.pathLine(c, w.p); c.stroke(); }
        c.fillStyle = '#c9bba6';
        for (const b of d.buildings) { this.world.pathPoly(c, b.p); c.fill(); }
      }
      if (k < keys.length) { setTimeout(stepPaint, 0); return; }
      // Straßen nach Klasse
      const E = this.graph.edges;
      const draw = (re, color, w) => {
        c.strokeStyle = color; c.lineWidth = w;
        for (const e of E) if (re.test(e.h)) { this.world.pathLine(c, e.p); c.stroke(); }
      };
      draw(/residential|living|unclassified/, '#ffffff', 14);
      draw(/tertiary/, '#fff4c2', 22);
      draw(/secondary/, '#f7d58b', 28);
      draw(/primary|trunk/, '#f2b25c', 34);
      draw(/motorway/, '#e98a6a', 40);
      done(cv, S);
    };
    stepPaint();
  }
}
