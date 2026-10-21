// Stadtleben und Details: Straßenlaternen (nachts mit Lichtkegel am Boden), Bänke, Mülleimer, Pflanzkübel und
// Fahrräder, gestreifte Markisen und Ladenschilder in der Fußgängerzone, Café-Terrassen mit Gästen, Wochenmarkt,
// Prinz-Albert-Denkmal und Bratwurststand am Markt, Brunnen und Tauben. Fast alles als InstancedMesh.
'use strict';

// Mehrere Geometrien (mit Verschiebung/Drehung) zu einer zusammenfassen
function mergeGeos(parts) {
  const pos = [], nor = [], uv = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const [g0, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z);
    nm.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal, T = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      if (T) uv.push(T.getX(i), T.getY(i)); else uv.push(0, 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);

const AWNING_COLORS = ['#b8322a', '#2f6b3a', '#1f4f8a', '#8a2a3a', '#d58a1e', '#4a4a4a', '#6b3a7a', '#2a7a7a', '#a8862a'];
const PARASOL_COLORS = ['#efe6cf', '#b8322a', '#2f6b3a', '#1f3f6f', '#e8d24a', '#ffffff', '#7a2a2a'];
const STALL_COLORS = ['#c0392b', '#2e7d32', '#1565c0', '#ef6c00', '#6a1b9a'];

// Ladenschilder: Farben nach Marke, sonst nach Art des Ladens [Hintergrund, Schrift]
const SIGN_BRANDS = [
  [/^H&M$/, '#ffffff', '#e50010'], [/^Müller$/, '#f39200', '#ffffff'], [/^Thalia/, '#ffffff', '#1d4f91'],
  [/^Woolworth/, '#ffffff', '#d2001f'], [/W[ÖO]HRL/i, '#1b1b1b', '#ffffff'], [/^dm$/, '#ffffff', '#002878'],
  [/Deichmann/, '#ffffff', '#00843d'], [/Sparkasse/, '#ff0000', '#ffffff'], [/Telekom/, '#e20074', '#ffffff'],
  [/Vodafone/, '#e60000', '#ffffff'], [/^O2$/i, '#0019a5', '#ffffff'], [/Targobank/, '#ffffff', '#003a7d'],
  [/Commerzbank/, '#ffcc00', '#002e3c'], [/Deutsche Bank/, '#0018a8', '#ffffff'], [/VR-Bank|Raiffeisen/, '#0066b3', '#ffffff'],
  [/Riemann/, '#7a1e22', '#f3e7cf'], [/Apotheke/, '#ffffff', '#d4001a'], [/Rossmann/, '#e2001a', '#ffffff'],
  [/Ernsting/, '#ffffff', '#e2001a'], [/TK Maxx/, '#ffffff', '#c8102e'], [/Bijou Brigitte/, '#000000', '#d8b56d'],
  [/^BARCELONA$/, '#b3261e', '#ffffff'], [/Netto/, '#ffe500', '#d4001a'], [/NORMA/, '#e30613', '#ffffff'], [/TEDi/, '#e30613', '#ffffff'],
];
const SIGN_KINDS = {
  'amenity=fast_food': ['#b8322a', '#ffd84a'], 'amenity=restaurant': ['#23402f', '#e8c766'],
  'amenity=cafe': ['#5a3b2a', '#f3e7cf'], 'amenity=ice_cream': ['#f4d7e0', '#9c2a55'], 'amenity=bar': ['#1c1c22', '#f0b84a'],
  'amenity=pub': ['#3b2418', '#e8c766'], 'amenity=bank': ['#173a6a', '#ffffff'], 'amenity=pharmacy': ['#ffffff', '#d4001a'],
  'shop=bakery': ['#f3e7cf', '#7a4a1e'], 'shop=butcher': ['#ffffff', '#a01d1d'], 'shop=clothes': ['#151515', '#ffffff'],
  'shop=shoes': ['#2b2b2b', '#f2f2f2'], 'shop=jewelry': ['#141c33', '#d8b56d'], 'shop=hairdresser': ['#ffffff', '#222222'],
  'shop=optician': ['#ffffff', '#1d3f73'], 'shop=books': ['#f3e7cf', '#3a2a1a'], 'shop=mobile_phone': ['#1f4f8a', '#ffffff'],
  'shop=florist': ['#2f5d32', '#ffffff'], 'shop=supermarket': ['#ffffff', '#c0392b'], 'shop=travel_agency': ['#0f6aa8', '#ffffff'],
};
const SIGN_DEFAULT = ['#f1ece0', '#2b2b2b'];
const FOOD_KINDS = /amenity=(fast_food|restaurant|cafe|ice_cream|bar|pub)|shop=bakery/;

class CityProps {
  constructor(world, scene, peds, fx, ui) {
    this.world = world; this.scene = scene; this.peds = peds; this.fx = fx; this.ui = ui;
    this.rnd = U.rng(2026);
    this.items = {};      // Name -> Liste von Instanzen { x, y, z, ry, rx, s:[sx,sy,sz], c }
    this.placed = new U.Grid(20);
    this.fountains = [];
    this.night = false;
    const segs = new Set();
    for (const arr of world.roadGrid.map.values()) for (const s of arr) segs.add(s);
    this.segs = [...segs];
    this.plaza = this.segs.filter(s => s.k === 'plaza');
  }

  add(kind, o) { (this.items[kind] || (this.items[kind] = [])).push(o); }

  // nahe an anderen Objekten derselben Gruppe?
  crowded(x, z, r, tag) {
    for (const o of this.placed.query(x, z, r)) if (o.tag === tag && Math.hypot(o.x - x, o.z - z) < r) return true;
    return false;
  }
  mark(x, z, tag) { this.placed.insert({ x, z, tag }, x, z, x, z); }
  free(x, z, r) { return !this.world.insideBuilding(x, z, r) && !this.world.collideCircle(x, z, r, {}).hit; }
  solid(x, z, r) { // als Hindernis für Autos und Fußgänger-Kollision (wie Baumstämme)
    const W = this.world;
    W.trees.push(x, z, r);
    W.treeGrid.insert(W.trees.length / 3 - 1, x - 1, z - 1, x + 1, z + 1);
  }

  build() {
    this.lamps();
    this.marketSquare();
    this.cafes();
    this.furniture();
    this.shopSigns();
    this.awnings();
    this.fountainsBuild();
    this.makeMeshes();
    this.landmarks();
    this.pigeonsBuild();
  }

  // ---------- Straßenlaternen ----------
  lamps() {
    const R = this.rnd;
    for (const s of this.segs) {
      const road = s.k === 'road' && !/trunk|motorway|construction|service/.test(s.h || '');
      const plaza = s.k === 'plaza';
      if (!road && !plaza) continue;
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      if (road && Math.hypot(mx, mz) > 1300) continue;
      const gap = plaza ? 15 : 26;
      if (this.crowded(mx, mz, gap, 'lamp')) continue;
      let dx = s.bx - s.ax, dz = s.bz - s.az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const side = (Math.floor(mx / 9) + Math.floor(mz / 13)) % 2 ? 1 : -1;
      const off = plaza ? Math.max(1.2, s.w / 2 - 0.7) : s.w / 2 + 0.7;
      const x = mx - dz * off * side, z = mz + dx * off * side;
      if (!this.free(x, z, 0.4)) continue;
      this.mark(mx, mz, 'lamp');
      const y = this.world.heightAt(x, z);
      // Arm zeigt zur Straßenmitte
      const ry = Math.atan2(dz * side, -dx * side);
      this.add(plaza ? 'lantern' : 'lamp', { x, y, z, ry });
      this.add('glow', { x: plaza ? x : x + Math.sin(ry) * 0.9, y: this.world.heightAt(x, z) + 0.07, z: plaza ? z : z + Math.cos(ry) * 0.9, ry: 0 });
      this.solid(x, z, 0.15);
    }
  }

  // ---------- Bänke, Mülleimer, Kübel, Fahrräder in der Fußgängerzone ----------
  furniture() {
    const R = this.rnd;
    for (const s of this.plaza) {
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      if (s.w < 5 || this.crowded(mx, mz, 11, 'furn')) continue;
      let dx = s.bx - s.ax, dz = s.bz - s.az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const side = R() < 0.5 ? 1 : -1, off = Math.max(1.2, s.w / 2 - 1.3);
      const x = mx - dz * off * side, z = mz + dx * off * side;
      if (!this.free(x, z, 0.9)) continue;
      this.mark(mx, mz, 'furn');
      const y = this.world.heightAt(x, z);
      const facing = Math.atan2(dz * side, -dx * side); // zur Wegmitte
      const r = R();
      if (r < 0.38) { this.add('bench', { x, y, z, ry: facing }); this.solid(x, z, 0.5); if (R() < 0.35) this.peds.addSitter(x + Math.sin(facing) * 0.15, z + Math.cos(facing) * 0.15, facing); }
      else if (r < 0.58) { this.add('bin', { x, y, z, ry: 0 }); this.solid(x, z, 0.25); }
      else if (r < 0.82) { this.add('planter', { x, y, z, ry: R() * 3 }); this.add('bush', { x, y: y + 0.95, z, ry: R() * 3, s: [1, 0.8 + R() * 0.4, 1], c: new THREE.Color(R() < 0.3 ? '#a8486a' : '#3f7a34') }); this.solid(x, z, 0.65); }
      else {
        const n = 2 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++) this.add('bike', { x: x + dx * (k - n / 2) * 0.7, y, z: z + dz * (k - n / 2) * 0.7, ry: facing, c: new THREE.Color(PED_SHIRTS[Math.floor(R() * PED_SHIRTS.length)]) });
      }
    }
  }

  // ---------- Wahrzeichen-Details ----------
  // Die Formen kommen aus LoD2 (World.landmarkLod2). Hier kommen dazu: dunkle Torbögen und Uhren an den drei
  // Tortürmen (zur Straße hin) und die beiden rot-weißen Eckerker am Stadthaus.
  landmarks() {
    const W = this.world, list = W.landmarkLod2 || [];
    const lam = (o) => new THREE.MeshLambertMaterial(o);
    const archMat = lam({ color: '#1f1c19' }), clockMat = lam({ map: this.clockTexture() });
    const add = (geo, mat, x, y, z, ry) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.y = ry || 0;
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    // Torbogen-Fläche: Rechteck mit Halbkreis oben, Unterkante bei y = 0
    const archGeo = (w, h) => {
      const s = new THREE.Shape(), r = w / 2;
      s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r);
      s.absarc(0, h - r, r, 0, Math.PI, false);
      s.lineTo(-r, 0);
      return new THREE.ShapeGeometry(s, 12);
    };
    const GATES = { Spitaltor: { clock: 20.5, w: 3.4, h: 4.8 }, Judentor: { clock: 18.5, w: 3.0, h: 4.2 }, Ketschentor: { clock: 19.5, w: 3.6, h: 5.0 } };
    for (const L of list) {
      const g = GATES[L.name];
      if (!g) continue;
      const { X, Z, RY, y0 } = L;
      let cx = 0, cz = 0;
      for (let i = 0; i < X.length; i++) { cx += X[i]; cz += Z[i]; }
      cx /= X.length; cz /= Z.length;
      const r = W.nearestRoad(cx, cz, 30, s => s.k !== 'path' && s.k !== 'track');
      if (!r) continue;
      let dx = r.seg.bx - r.seg.ax, dz = r.seg.bz - r.seg.az;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      // halbe Tiefe des Turms in Straßenrichtung in einem Höhenband (über Grund)
      const depth = (lo, hi) => {
        let m = 0;
        for (let i = 0; i < X.length; i++) {
          const y = RY[i] - y0;
          if (y >= lo && y <= hi) m = Math.max(m, Math.abs((X[i] - cx) * dx + (Z[i] - cz) * dz));
        }
        return m;
      };
      const dLow = depth(-1, 6), dHigh = depth(g.clock - 4, g.clock + 1) || dLow;
      for (const sd of [1, -1]) {
        const fx = cx + dx * sd * (dLow + 0.06), fz = cz + dz * sd * (dLow + 0.06);
        const ry = Math.atan2(dx * sd, dz * sd);
        add(archGeo(g.w, g.h), archMat, fx, W.heightAt(fx, fz) - 0.05, fz, ry);
        const kx = cx + dx * sd * (dHigh + 0.08), kz = cz + dz * sd * (dHigh + 0.08);
        add(new THREE.CircleGeometry(1.05, 24), clockMat, kx, y0 + g.clock, kz, ry);
      }
    }
    // Stadthaus: zweigeschossige Eckerker an beiden Ecken zum Markt (Süden = +z)
    const sh = list.filter(L => L.name === 'Stadthaus').sort((a, b) => b.X.length - a.X.length)[0];
    if (sh) {
      const { X, Z, RY, y0 } = sh;
      let cx = 0, cz = 0, n = 0;
      for (let i = 0; i < X.length; i++) if (RY[i] - y0 < 1) { cx += X[i]; cz += Z[i]; n++; }
      cx /= n; cz /= n;
      const bodyMat = lam({ map: this.orielTexture() }), helmMat = lam({ color: '#4b5262' }), baseMat = lam({ color: '#a83a2e' });
      for (const sx of [-1, 1]) {
        let bi = -1, bv = -Infinity;
        for (let i = 0; i < X.length; i++) if (RY[i] - y0 < 1 && Z[i] + X[i] * sx > bv) { bv = Z[i] + X[i] * sx; bi = i; }
        if (bi < 0) continue;
        let ox = X[bi] - cx, oz = Z[bi] - cz;
        const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
        const x = X[bi] + ox * 0.55, z = Z[bi] + oz * 0.55;
        const ry = Math.atan2(ox, oz) + Math.PI / 8;
        const R = 1.55;
        add(new THREE.CylinderGeometry(R, 0.25, 1.6, 8), baseMat, x, y0 + 3.6, z, ry);              // Konsole
        add(new THREE.CylinderGeometry(R, R, 8, 8), bodyMat, x, y0 + 8.4, z, ry);                    // Erkerkörper
        add(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.25, 8), baseMat, x, y0 + 12.5, z, ry);   // Gesims
        add(new THREE.ConeGeometry(R + 0.1, 3.4, 8), helmMat, x, y0 + 14.3, z, ry);                  // Schieferhelm
        add(new THREE.CylinderGeometry(0.03, 0.05, 1.4, 4), lam({ color: '#c9a646' }), x, y0 + 16.6, z); // Spitze
      }
    }
  }

  // Zifferblatt: weiß mit schwarzem Ring, Strichen und Zeigern (zehn nach zehn)
  clockTexture() {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), m = S / 2;
    c.fillStyle = '#1d1d1d'; c.fillRect(0, 0, S, S);
    c.fillStyle = '#f2efe6'; c.beginPath(); c.arc(m, m, m - 14, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1d1d1d'; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      c.lineWidth = i % 3 ? 5 : 10;
      c.beginPath(); c.moveTo(m + Math.sin(a) * (m - 24), m - Math.cos(a) * (m - 24)); c.lineTo(m + Math.sin(a) * (m - 44), m - Math.cos(a) * (m - 44)); c.stroke();
    }
    c.strokeStyle = '#a8862a';
    const hand = (a, l, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(m, m); c.lineTo(m + Math.sin(a) * l, m - Math.cos(a) * l); c.stroke(); };
    hand(-Math.PI / 3, m * 0.45, 11); hand(Math.PI / 3, m * 0.68, 7);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Stadthaus-Erker: ochsenblutrot mit weißen Bändern, je Seite ein Fenster pro Geschoss
  orielTexture() {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#a83a2e'; c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#efe9dc';
    for (const y of [0, 124, 244]) c.fillRect(0, y, 512, 12);
    for (let i = 0; i < 8; i++) {
      c.fillRect(i * 64, 0, 4, 256);                     // weiße Kanten
      for (const y of [22, 146]) {
        c.fillStyle = '#efe9dc'; c.fillRect(i * 64 + 14, y, 36, 86);
        c.fillStyle = '#3b4652'; c.fillRect(i * 64 + 19, y + 5, 26, 76);
        c.fillStyle = '#efe9dc'; c.fillRect(i * 64 + 30, y + 5, 4, 76); c.fillRect(i * 64 + 19, y + 34, 26, 4);
      }
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------- Echte Ladenschilder (data/shops.js) ----------
  // Jedes Schild hängt über dem Erdgeschoss an der Hauswand, die zur nächsten Straße zeigt. Gaststätten bekommen
  // dazu ein Nasenschild quer zur Wand. Die Schrift steht in wenigen großen Texturatlanten.
  shopSigns() {
    const S = window.COBURG_SHOPS, W = this.world;
    this.signMats = [];
    if (!S || !S.length) return;
    const H = 0.62;                                   // Schildhöhe in Metern
    const ATLAS = 2048, ROW = 128;
    const atlases = [];
    let atlas = null, cx = 0, cy = 0;
    const newAtlas = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS;
      atlas = { cv, c: cv.getContext('2d'), quads: [] }; atlases.push(atlas); cx = 0; cy = 0;
    };
    // Schild auf die Leinwand malen; gibt Atlas und UV-Rechteck zurück
    const paint = (name, bg, fg) => {
      if (!atlas) newAtlas();
      const c = atlas.c;
      let fs = 74;
      c.font = `bold ${fs}px "Segoe UI", Arial, sans-serif`;
      let tw = c.measureText(name).width;
      if (tw > 1150) { fs = Math.floor(fs * 1150 / tw); c.font = `bold ${fs}px "Segoe UI", Arial, sans-serif`; tw = c.measureText(name).width; }
      const cw = Math.ceil(U.clamp(tw + 60, 220, 1240));
      if (cx + cw > ATLAS) { cx = 0; cy += ROW; }
      if (cy + ROW > ATLAS) newAtlas();
      const a = atlas, x0 = cx, y0 = cy;
      a.c.font = `bold ${fs}px "Segoe UI", Arial, sans-serif`;
      a.c.fillStyle = bg; a.c.fillRect(x0 + 2, y0 + 2, cw - 4, ROW - 4);
      a.c.strokeStyle = fg; a.c.globalAlpha = 0.35; a.c.lineWidth = 4; a.c.strokeRect(x0 + 9, y0 + 9, cw - 18, ROW - 18); a.c.globalAlpha = 1;
      a.c.fillStyle = fg; a.c.textAlign = 'center'; a.c.textBaseline = 'middle';
      a.c.fillText(name, x0 + cw / 2, y0 + ROW / 2 + 3);
      cx += cw;
      return { a, u0: x0 / ATLAS, u1: (x0 + cw) / ATLAS, v0: 1 - (y0 + ROW) / ATLAS, v1: 1 - y0 / ATLAS, w: cw / ROW * H };
    };
    // Rechteck (Mitte m, Schreibrichtung e, Breite w, Höhe h) in den Atlas eintragen
    const quad = (t, m, ex, ez, w, h) => {
      const hw = w / 2, hh = h / 2;
      const p = (s, u) => [m[0] + ex * hw * s, m[1] + hh * u, m[2] + ez * hw * s];
      t.a.quads.push([p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)], [t.u0, t.v0, t.u1, t.v0, t.u1, t.v1, t.u0, t.v1]);
    };

    let placed = 0;
    for (const [name, kind, px, pz] of S) {
      if (Math.hypot(px, pz) > 1600) continue;
      if (typeof VENUES !== 'undefined' && VENUES.some(v => v.road && v.name === name)) continue; // eigenes Schild über der Tür (venues.js)
      const r = W.nearestRoad(px, pz, 45, s => s.k === 'road' || s.k === 'plaza' || s.k === 'foot');
      if (!r) continue;
      // Haus des Ladens: Punkt selbst oder auf der Linie Straße → Laden (bis 8 m dahinter)
      let dx = px - r.x, dz = pz - r.z;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      let b = W.insideBuilding(px, pz, 0);
      for (let t = 0; !b && t < dl + 8; t += 0.5) b = W.insideBuilding(r.x + dx * t, r.z + dz * t, 0);
      if (!b) continue;
      // Wand des Hauses, die der Straße am nächsten liegt und zu ihr zeigt
      const p = b.p;
      let best = null;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1.8) continue;
        let nx = -(bz - az) / len, nz = (bx - ax) / len;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (U.pointInPoly(mx + nx * 0.3, mz + nz * 0.3, p)) { nx = -nx; nz = -nz; }
        const c = U.closestOnSeg(r.x, r.z, ax, az, bx, bz);
        if ((r.x - c[0]) * nx + (r.z - c[1]) * nz < 0.3) continue;   // Wand zeigt nicht zur Straße
        const d = Math.hypot(r.x - c[0], r.z - c[1]);
        if (!best || d < best.d) best = { ax, az, bx, bz, len, nx, nz, d };
      }
      if (!best || best.d > 25) continue;
      const ex = (best.bx - best.ax) / best.len, ez = (best.bz - best.az) / best.len;
      const st = (SIGN_BRANDS.find(s => s[0].test(name)) || [null, ...(SIGN_KINDS[kind] || SIGN_DEFAULT)]).slice(1);
      // Platz auf der Wand: dem Laden gegenüber, ganz auf der Wand, nicht auf einem anderen Schild
      const tex = paint(name, st[0], st[1]);
      let w = Math.min(tex.w, best.len - 0.4);
      if (w < 1.1) continue;
      const half = best.len / 2 - w / 2 - 0.2;
      let along = U.clamp((px - best.ax) * ex + (pz - best.az) * ez - best.len / 2, -half, half);
      let fx = best.ax + ex * (best.len / 2 + along), fz = best.az + ez * (best.len / 2 + along);
      if (this.crowded(fx, fz, Math.max(1.6, w * 0.6), 'shop')) {
        const alt = along + (along > 0 ? -1 : 1) * (w + 0.4);
        if (Math.abs(alt) > half) continue;
        along = alt; fx = best.ax + ex * (best.len / 2 + along); fz = best.az + ez * (best.len / 2 + along);
        if (this.crowded(fx, fz, Math.max(1.6, w * 0.6), 'shop')) continue;
      }
      this.mark(fx, fz, 'shop');
      const ground = W.heightAt(fx + best.nx * 1.5, fz + best.nz * 1.5);
      // Schreibrichtung so, dass die Vorderseite zur Straße zeigt (bei schmaler Wand wird die Schrift gestaucht)
      const qx = best.nz, qz = -best.nx;
      quad(tex, [fx + best.nx * 0.1, ground + 3.55, fz + best.nz * 0.1], qx, qz, w, H);
      if (FOOD_KINDS.test(kind) && best.len > 3) {
        // Nasenschild: zwei Seiten, damit die Schrift von beiden Richtungen lesbar ist
        const bw = Math.min(1.25, tex.w * 0.5), bh = H * 0.8, off = 0.18 + bw / 2;
        const sx = fx + ex * (w / 2 + 0.35), sz = fz + ez * (w / 2 + 0.35);
        if (Math.abs(along) + w / 2 + 0.35 < best.len / 2) {
          const m = [sx + best.nx * off, ground + 2.9, sz + best.nz * off];
          quad(tex, [m[0] - qx * 0.03, m[1], m[2] - qz * 0.03], best.nx, best.nz, bw, bh);
          quad(tex, [m[0] + qx * 0.03, m[1], m[2] + qz * 0.03], -best.nx, -best.nz, bw, bh);
          this.add('signArm', { x: sx + best.nx * (off / 2 + 0.05), y: ground + 2.9 + bh / 2 + 0.05, z: sz + best.nz * (off / 2 + 0.05),
            ry: Math.atan2(best.nx, best.nz), s: [1, 1, off + 0.1] });
        }
      }
      placed++;
    }
    // ein Mesh je Atlas; die Vorderseite zeigt zur Straße (Normalen aus der Dreiecksreihenfolge)
    for (const a of atlases) {
      if (!a.quads.length) continue;
      const pos = [], uv = [], nor = [], idx = [];
      for (let q = 0; q < a.quads.length; q += 2) {
        const P = a.quads[q], T = a.quads[q + 1], base = pos.length / 3;
        const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], v = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const nl = Math.hypot(...n) || 1; n = n.map(c => c / nl);
        for (const pt of P) { pos.push(...pt); nor.push(...n); }
        uv.push(...T);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const t = new THREE.CanvasTexture(a.cv);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      const mat = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0 });
      this.signMats.push(mat);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = false; m.receiveShadow = true;
      this.scene.add(m);
    }
    console.info(`Ladenschilder: ${placed} von ${S.length}`);
  }

  // ---------- Markisen und Ladenschilder ----------
  awnings() {
    const R = this.rnd, W = this.world;
    for (const s of this.plaza) {
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      if (Math.hypot(mx, mz) > 1000) continue;
      let dx = s.bx - s.ax, dz = s.bz - s.az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (const side of [-1, 1]) {
        // Fassade suchen: senkrecht zur Straße nach außen tasten
        let d = null;
        for (let t = Math.max(1, s.w / 2 - 1.5); t < s.w / 2 + 9; t += 0.4) {
          if (W.insideBuilding(mx - dz * t * side, mz + dx * t * side, 0)) { d = t; break; }
        }
        if (d === null) continue;
        const fx = mx - dz * d * side, fz = mz + dx * d * side;
        if (this.crowded(fx, fz, 4.2, 'awn')) continue;
        this.mark(fx, fz, 'awn');
        if (R() < 0.3) continue;
        const nx = dz * side, nz = -dx * side; // von der Fassade zur Straße
        const ry = Math.atan2(nx, nz);
        const ground = W.heightAt(fx + nx * 1.5, fz + nz * 1.5);
        const c = new THREE.Color(AWNING_COLORS[Math.floor(R() * AWNING_COLORS.length)]);
        const w = 2.4 + R() * 1.4;
        if (R() < 0.75) this.add('awning', { x: fx + nx * 0.08, y: ground + 3.1, z: fz + nz * 0.08, ry, rx: 0.38, s: [w, 1, 1.25], c });
        // namenlose Schilder nur, wo kein echtes Ladenschild hängt
        if (R() < 0.6 && !this.crowded(fx, fz, 6, 'shop')) this.add('sign', { x: fx + nx * 0.06, y: ground + 3.95, z: fz + nz * 0.06, ry, s: [1.2 + R() * 1.4, 1, 1],
          c: new THREE.Color(R() < 0.5 ? c.getHex() : AWNING_COLORS[Math.floor(R() * AWNING_COLORS.length)]).multiplyScalar(1.15) });
      }
    }
  }

  // ---------- Café-Terrassen ----------
  cafes() {
    const R = this.rnd, W = this.world;
    const gastro = W.data.pois.filter(p => /cafe|restaurant|ice_cream|bar|pub|fast_food/.test(p.k) && Math.hypot(p.x, p.z) < 1300);
    for (const poi of gastro) {
      let best = null, bd = 28;
      for (const s of this.plaza) {
        if (s.w < 6) continue;
        const c = U.closestOnSeg(poi.x, poi.z, s.ax, s.az, s.bx, s.bz);
        const d = Math.hypot(c[0] - poi.x, c[1] - poi.z);
        if (d < bd) { bd = d; best = { s, x: c[0], z: c[1] }; }
      }
      if (!best || this.crowded(best.x, best.z, 9, 'cafe')) continue;
      const s = best.s;
      let dx = s.bx - s.ax, dz = s.bz - s.az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let ux = poi.x - best.x, uz = poi.z - best.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const reach = Math.min(Math.max(1.5, ul - 2.4), s.w / 2 - 1.4);
      if (reach < 1) continue;
      const cx = best.x + ux * reach, cz = best.z + uz * reach;
      this.mark(best.x, best.z, 'cafe');
      const col = new THREE.Color(PARASOL_COLORS[Math.floor(R() * PARASOL_COLORS.length)]);
      const n = 2 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const x = cx + dx * (k - (n - 1) / 2) * 2.7, z = cz + dz * (k - (n - 1) / 2) * 2.7;
        if (!this.free(x, z, 1.1)) continue;
        const y = W.heightAt(x, z);
        this.add('table', { x, y, z, ry: 0 });
        this.add('parasol', { x, y, z, ry: R() * 3, c: col });
        this.solid(x, z, 0.55);
        for (const side of [-1, 1]) {
          const sx = x + dz * side * 0.75, sz = z - dx * side * 0.75;
          const face = Math.atan2(x - sx, z - sz);
          this.add('chair', { x: sx, y, z: sz, ry: face });
          if (R() < 0.55) this.peds.addSitter(sx, sz, face);
        }
      }
    }
  }

  // ---------- Marktplatz: Prinz-Albert-Denkmal, Wochenmarkt, Bratwurststand ----------
  marketSquare() {
    const W = this.world, R = this.rnd;
    const ok = (x, z, r) => this.free(x, z, r) && !(W.nearRoad(x, z, 1) && W.nearRoad(x, z, 1).k === 'road');
    // Denkmal in der Platzmitte
    const sp = [[5, 12], [0, 10], [8, 15]].find(([x, z]) => ok(x, z, 2.5));
    if (sp) {
      const [x, z] = sp, y = W.heightAt(x, z);
      this.add('pedestal', { x, y, z, ry: 0.3 });
      this.add('statue', { x, y: y + 2.9, z, ry: 0.3 + Math.PI, s: [1.5, 1.5, 1.5] });
      this.solid(x, z, 1.6);
      this.statue = { x, z };
      const lab = makeLabel('Prinz-Albert-Denkmal', '#b08a3a', 'Prinzgemahl von Queen Victoria, geb. bei Coburg');
      lab.position.set(x, y + 9, z); lab.userData.range = 90;
      this.labels = [lab];
    }
    // Marktstände (Coburger Wochenmarkt)
    const stalls = [[-22, 8, 0.1], [-22, 18, 0.1], [-22, 28, 0.1], [22, 2, -0.1], [24, 14, -0.1], [-8, 26, 1.67]];
    stalls.forEach(([x, z, ry], i) => {
      if (!ok(x, z, 2)) return;
      const y = W.heightAt(x, z);
      const c = new THREE.Color(STALL_COLORS[i % STALL_COLORS.length]);
      this.add('stall', { x, y, z, ry: ry + Math.PI / 2 });
      this.add('stallRoof', { x, y: y + 2.35, z, ry: ry + Math.PI / 2, rx: 0, c });
      for (let k = 0; k < 4; k++) {
        const fx = Math.cos(ry) * (k - 1.5) * 0.65, fz = -Math.sin(ry) * (k - 1.5) * 0.65;
        this.add('goods', { x: x + fx, y: y + 0.95, z: z + fz, ry, c: new THREE.Color(['#d93a2a', '#f2b632', '#5aa83a', '#e8762a', '#7a3a9a'][Math.floor(R() * 5)]) });
      }
      this.solid(x, z, 1.4);
      // Verkäufer hinter dem Stand
      this.peds.addSitter(x + Math.sin(ry + Math.PI / 2) * -1.4, z + Math.cos(ry + Math.PI / 2) * -1.4, ry + Math.PI / 2, 'stand');
    });
    // Bratwurststand (Coburger Bratwurst, gegrillt über Kiefernzapfen)
    const bw = [[-6, 38], [-14, 36], [10, 36]].find(([x, z]) => ok(x, z, 2.5));
    if (bw) {
      const [x, z] = bw, y = W.heightAt(x, z);
      const ry = Math.atan2(-x, -z); // Theke zur Platzmitte
      this.add('booth', { x, y, z, ry });
      this.add('boothRoof', { x, y: y + 2.75, z, ry, c: new THREE.Color('#b8322a') });
      this.solid(x, z, 1.8);
      this.grill = { x: x + Math.sin(ry) * 1.1, y: y + 1.2, z: z + Math.cos(ry) * 1.1 };
      for (let k = 0; k < 4; k++) {
        const a = ry + (k - 1.5) * 0.35, d = 3.2 + (k % 2) * 0.6;
        const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        this.peds.addSitter(px, pz, Math.atan2(x - px, z - pz), 'stand');
      }
      const lab = makeLabel('Coburger Bratwurst', '#c0392b', 'über Kiefernzapfen gegrillt');
      lab.position.set(x, y + 5.2, z); lab.userData.range = 120;
      (this.labels || (this.labels = [])).push(lab);
    }
  }

  // ---------- Brunnen ----------
  fountainsBuild() {
    for (const p of this.world.data.pois) {
      if (p.k !== 'fountain' || !this.free(p.x, p.z, 2)) continue;
      if (this.crowded(p.x, p.z, 6, 'fountain')) continue;
      this.mark(p.x, p.z, 'fountain');
      const y = this.world.heightAt(p.x, p.z);
      this.add('fountain', { x: p.x, y, z: p.z, ry: 0 });
      this.add('water', { x: p.x, y: y + 0.52, z: p.z, ry: 0 });
      this.solid(p.x, p.z, 1.9);
      this.fountains.push({ x: p.x, y, z: p.z });
    }
  }

  // ---------- Meshes ----------
  makeMeshes() {
    const lam = c => new THREE.MeshLambertMaterial({ color: c });
    const stripe = (() => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
      const c = cv.getContext('2d');
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#c9c4ba'; c.fillRect(i * 8, 0, 8, 8); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
      return t;
    })();
    const striped = new THREE.MeshLambertMaterial({ color: '#ffffff', map: stripe });
    const white = lam('#ffffff');
    this.lampMat = new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffd890', emissiveIntensity: 0.05 });
    this.signMat = lam('#ffffff');
    this.signNightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const glowTex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,214,140,0.55)'); g.addColorStop(1, 'rgba(255,214,140,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    })();
    const metal = '#2e3236', wood = '#7a5434', stone = '#b9b1a3';
    const D = {
      lamp: [[mergeGeos([[CYL(0.06, 0.09, 5.2, 6), 0, 2.6, 0], [BOX(0.06, 0.06, 1.0), 0, 5.15, 0.45]]), lam(metal)],
        [mergeGeos([[BOX(0.5, 0.14, 0.3), 0, 5.08, 0.9]]), this.lampMat, 'head']],
      lantern: [[mergeGeos([[CYL(0.05, 0.08, 3.6, 6), 0, 1.8, 0], [CYL(0.2, 0.12, 0.12, 6), 0, 4.32, 0]]), lam('#1d2124')],
        [mergeGeos([[CYL(0.16, 0.12, 0.55, 6), 0, 3.98, 0]]), this.lampMat, 'head']],
      glow: [[mergeGeos([[new THREE.PlaneGeometry(10, 10), 0, 0, 0, -Math.PI / 2]]),
        new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }), 'glow']],
      bench: [[mergeGeos([[BOX(1.7, 0.07, 0.45), 0, 0.46, 0], [BOX(1.7, 0.42, 0.06), 0, 0.74, -0.22, -0.15], [BOX(0.08, 0.46, 0.4), 0.72, 0.23, 0], [BOX(0.08, 0.46, 0.4), -0.72, 0.23, 0]]), lam(wood)]],
      bin: [[mergeGeos([[CYL(0.26, 0.22, 0.95, 10), 0, 0.48, 0], [CYL(0.28, 0.28, 0.05, 10), 0, 0.97, 0]]), lam('#2f4a36')]],
      planter: [[mergeGeos([[BOX(1.2, 0.65, 1.2), 0, 0.33, 0]]), lam(stone)]],
      bush: [[new THREE.IcosahedronGeometry(0.62, 0), white, 'color']],
      bike: [[mergeGeos([[new THREE.TorusGeometry(0.32, 0.03, 4, 12), 0, 0.34, 0.52, 0, Math.PI / 2], [new THREE.TorusGeometry(0.32, 0.03, 4, 12), 0, 0.34, -0.52, 0, Math.PI / 2],
        [BOX(0.05, 0.05, 0.95), 0, 0.62, 0], [BOX(0.04, 0.5, 0.04), 0, 0.5, -0.15], [BOX(0.45, 0.04, 0.04), 0, 0.98, 0.42]]), white, 'color']],
      awning: [[mergeGeos([[BOX(1, 0.05, 1), 0, 0, 0.5]]), striped, 'color']],
      sign: [[mergeGeos([[BOX(1, 0.5, 0.1), 0, 0, 0]]), this.signMat, 'color', 'sign']],
      signArm: [[mergeGeos([[BOX(0.04, 0.04, 1), 0, 0, 0]]), lam('#1d2124')]],
      table: [[mergeGeos([[CYL(0.42, 0.42, 0.04, 12), 0, 0.74, 0], [CYL(0.04, 0.04, 0.72, 6), 0, 0.37, 0], [CYL(0.25, 0.25, 0.03, 8), 0, 0.02, 0]]), lam('#d8d4cc')]],
      chair: [[mergeGeos([[BOX(0.42, 0.05, 0.42), 0, 0.45, 0], [BOX(0.42, 0.45, 0.05), 0, 0.68, -0.19], [BOX(0.04, 0.45, 0.04), 0.18, 0.22, 0.18], [BOX(0.04, 0.45, 0.04), -0.18, 0.22, 0.18], [BOX(0.04, 0.45, 0.04), 0.18, 0.22, -0.18], [BOX(0.04, 0.45, 0.04), -0.18, 0.22, -0.18]]), lam('#3a3a3a')]],
      parasol: [[mergeGeos([[new THREE.ConeGeometry(1.35, 0.5, 8), 0, 2.45, 0]]), white, 'color'], [mergeGeos([[CYL(0.03, 0.03, 2.3, 5), 0, 1.15, 0]]), lam('#e0e0e0')]],
      pedestal: [[mergeGeos([[BOX(2.6, 0.5, 2.6), 0, 0.25, 0], [BOX(1.8, 2.2, 1.8), 0, 1.6, 0], [BOX(2.1, 0.25, 2.1), 0, 2.78, 0]]), lam('#a9a194')]],
      statue: [[mergeGeos([[BOX(0.55, 1.2, 0.4), 0, 1.75, 0], [BOX(0.24, 1.1, 0.26), 0.15, 0.55, 0], [BOX(0.24, 1.1, 0.26), -0.15, 0.55, 0], [BOX(0.18, 0.95, 0.2), 0.38, 1.85, 0.05, 0.25], [BOX(0.18, 0.95, 0.2), -0.38, 1.9, 0, -0.1],
        [BOX(0.34, 0.38, 0.34), 0, 2.58, 0], [BOX(0.7, 1.05, 0.12), 0, 1.6, -0.25, 0.08]]), lam('#4f6a58')]],
      stall: [[mergeGeos([[BOX(3, 0.9, 1.4), 0, 0.45, 0], [BOX(0.07, 2.3, 0.07), 1.45, 1.15, 0.65], [BOX(0.07, 2.3, 0.07), -1.45, 1.15, 0.65], [BOX(0.07, 2.3, 0.07), 1.45, 1.15, -0.65], [BOX(0.07, 2.3, 0.07), -1.45, 1.15, -0.65]]), lam('#8a6a4a')]],
      stallRoof: [[mergeGeos([[BOX(3.4, 0.06, 1.0), 0, 0.12, 0.42, 0.25], [BOX(3.4, 0.06, 1.0), 0, 0.12, -0.42, -0.25]]), striped, 'color']],
      goods: [[mergeGeos([[BOX(0.55, 0.12, 0.9), 0, 0, 0]]), white, 'color']],
      booth: [[mergeGeos([[BOX(3.2, 2.5, 2.0), 0, 1.25, -0.3], [BOX(3.3, 0.12, 0.7), 0, 1.0, 0.95], [BOX(1.4, 0.15, 0.6), 0, 1.12, 0.95]]), lam('#7a2a22')]],
      boothRoof: [[mergeGeos([[BOX(3.7, 0.1, 2.9), 0, 0, 0.1, 0.12]]), striped, 'color']],
      fountain: [[mergeGeos([[CYL(1.8, 1.95, 0.6, 20), 0, 0.3, 0], [CYL(0.22, 0.3, 1.7, 8), 0, 0.85, 0], [CYL(0.75, 0.3, 0.3, 12), 0, 1.75, 0]]), lam(stone)]],
      water: [[mergeGeos([[CYL(1.62, 1.62, 0.06, 20), 0, 0, 0]]), new THREE.MeshLambertMaterial({ color: '#6fa7c9', emissive: '#1d4a66', emissiveIntensity: 0.4 })]],
    };
    this.meshes = [];
    const dummy = new THREE.Object3D();
    for (const kind in this.items) {
      const list = this.items[kind], defs = D[kind];
      if (!defs || !list.length) continue;
      for (const [geo, mat, flag, flag2] of defs) {
        const m = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((o, i) => {
          dummy.position.set(o.x, o.y, o.z);
          dummy.rotation.set(o.rx || 0, o.ry || 0, 0, 'YXZ');
          dummy.scale.set(...(o.s || [1, 1, 1]));
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
          if (flag === 'color' && o.c) m.setColorAt(i, o.c);
        });
        m.castShadow = flag !== 'glow' && kind !== 'water';
        m.receiveShadow = kind === 'water';
        m.computeBoundingSphere();
        if (flag === 'glow') { m.visible = false; this.glowMesh = m; m.castShadow = false; }
        if (flag2 === 'sign') this.signMesh = m;
        this.scene.add(m);
        this.meshes.push(m);
      }
    }
    for (const l of this.labels || []) this.ui.addLabel(l, this.scene);
  }

  // ---------- Tauben auf dem Markt ----------
  pigeonsBuild() {
    if (!this.statue) { this.pigeons = []; return; }
    const R = this.rnd, n = 30;
    this.pigeons = [];
    for (let i = 0; i < n; i++) {
      const p = this.pigeonSpot();
      this.pigeons.push({ x: p.x, z: p.z, y: this.world.heightAt(p.x, p.z), h: R() * 6.28, state: 'ground', t: R() * 3, vx: 0, vy: 0, vz: 0, peck: R() * 6 });
    }
    const mat = new THREE.MeshLambertMaterial({ color: '#8a8f99' });
    this.pBody = new THREE.InstancedMesh(mergeGeos([[BOX(0.16, 0.14, 0.3), 0, 0.12, 0], [BOX(0.06, 0.03, 0.14), 0, 0.12, -0.2]]), mat, n);
    this.pHead = new THREE.InstancedMesh(mergeGeos([[BOX(0.09, 0.1, 0.11), 0, 0, 0]]), new THREE.MeshLambertMaterial({ color: '#5a6070' }), n);
    this.pWing = new THREE.InstancedMesh(mergeGeos([[BOX(0.3, 0.02, 0.16), 0.15, 0, 0]]), mat, n * 2);
    for (const m of [this.pBody, this.pHead, this.pWing]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; this.scene.add(m); }
  }

  pigeonSpot() {
    for (let k = 0; k < 20; k++) {
      const a = this.rnd() * 6.283, d = 3 + this.rnd() * 16;
      const x = this.statue.x + Math.cos(a) * d, z = this.statue.z + Math.sin(a) * d;
      if (this.free(x, z, 0.3)) return { x, z };
    }
    return { x: this.statue.x + 2.5, z: this.statue.z };
  }

  setNight(n) {
    this.night = n;
    this.lampMat.emissiveIntensity = n ? 2.2 : 0.05;
    if (this.glowMesh) this.glowMesh.visible = n;
    if (this.signMesh) this.signMesh.material = n ? this.signNightMat : this.signMat;
    for (const m of this.signMats || []) m.emissiveIntensity = n ? 0.85 : 0;
  }

  // Tauben aufscheuchen, Wasser sprühen, Grillrauch
  update(dt, px, pz, threats, time) {
    this.t = (this.t || 0) + dt;
    const near = (o, r) => Math.abs(o.x - px) < r && Math.abs(o.z - pz) < r;
    if (this.t > 0.09) {
      this.t = 0;
      for (const f of this.fountains) if (near(f, 60)) {
        this.fx.particle(f.x + (Math.random() - 0.5) * 0.2, f.y + 1.95, f.z + (Math.random() - 0.5) * 0.2,
          { color: '#cfe8ff', life: 0.9, size: 0.25, grow: 1.5, alpha: 0.7, vx: (Math.random() - 0.5) * 1.4, vy: 2.2, vz: (Math.random() - 0.5) * 1.4 });
      }
      if (this.grill && near(this.grill, 90) && Math.random() < 0.6) this.fx.smoke(this.grill.x, this.grill.y, this.grill.z, 0.15);
    }
    if (!this.pigeons.length) return;
    const R = this.rnd, d4 = this._d4 || (this._d4 = new THREE.Object3D()), M2 = this._m2 || (this._m2 = new THREE.Matrix4()), M3 = this._m3 || (this._m3 = new THREE.Matrix4());
    this.pigeons.forEach((p, i) => {
      p.t -= dt;
      if (p.state === 'ground') {
        for (const th of threats) {
          if (Math.hypot(th.x - p.x, th.z - p.z) < th.r) {
            p.state = 'fly'; p.t = 4 + R() * 4;
            const a = Math.atan2(p.z - th.z, p.x - th.x) + (R() - 0.5);
            p.vx = Math.cos(a) * 5; p.vz = Math.sin(a) * 5; p.vy = 4 + R() * 2;
            break;
          }
        }
        if (p.state === 'ground' && p.t <= 0) { // ein paar Schritte trippeln
          p.t = 0.6 + R() * 2.5; p.h += (R() - 0.5) * 2;
          const nx = p.x + Math.sin(p.h) * 0.4, nz = p.z + Math.cos(p.h) * 0.4;
          if (this.free(nx, nz, 0.2)) { p.x = nx; p.z = nz; }
        }
        p.peck += dt * 6;
        p.y = this.world.heightAt(p.x, p.z);
      } else if (p.state === 'fly') {
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        p.vy = U.damp(p.vy, p.y > this.world.heightAt(p.x, p.z) + 12 ? 0 : 2, 1, dt);
        // im Kreis über dem Platz
        const a = Math.atan2(p.vz, p.vx) + dt * 0.9;
        const s = Math.hypot(p.vx, p.vz);
        p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s;
        p.h = Math.atan2(p.vx, p.vz);
        if (p.t <= 0) { const s2 = this.pigeonSpot(); p.target = s2; p.state = 'land'; }
      } else { // landen
        const dx = p.target.x - p.x, dz = p.target.z - p.z, d = Math.hypot(dx, dz);
        const gy = this.world.heightAt(p.target.x, p.target.z);
        p.x += dx / (d || 1) * Math.min(d, 6 * dt); p.z += dz / (d || 1) * Math.min(d, 6 * dt);
        p.y = U.damp(p.y, d < 3 ? gy : gy + 4, 2.5, dt);
        p.h = Math.atan2(dx, dz);
        if (d < 0.2 && p.y - gy < 0.2) { p.state = 'ground'; p.y = gy; p.t = 1; }
      }
      const flying = p.state !== 'ground';
      d4.position.set(p.x, p.y, p.z); d4.rotation.set(0, p.h, 0); d4.scale.set(1, 1, 1); d4.updateMatrix();
      this.pBody.setMatrixAt(i, d4.matrix);
      const pk = flying ? 0 : Math.max(0, Math.sin(p.peck)) * 0.12;
      d4.position.set(p.x + Math.sin(p.h) * (0.15 + pk * 0.3), p.y + 0.27 - pk, p.z + Math.cos(p.h) * (0.15 + pk * 0.3)); d4.updateMatrix();
      this.pHead.setMatrixAt(i, d4.matrix);
      const flap = flying ? Math.sin(time * 22 + i) * 0.9 : 0;
      for (const side of [1, -1]) {
        d4.position.set(p.x, p.y + 0.17, p.z);
        d4.rotation.set(0, p.h, 0); d4.updateMatrix();
        // zweiter Flügel um 180° gedreht statt gespiegelt (Spiegeln würde die Flächen umdrehen)
        M2.copy(d4.matrix).multiply(M3.makeRotationY(side > 0 ? 0 : Math.PI)).multiply(M3.makeRotationZ(flying ? flap : -0.1));
        if (!flying) M2.multiply(M3.makeScale(0.6, 1, 1));
        this.pWing.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), M2);
      }
    });
    this.pBody.instanceMatrix.needsUpdate = this.pHead.instanceMatrix.needsUpdate = this.pWing.instanceMatrix.needsUpdate = true;
  }
}
