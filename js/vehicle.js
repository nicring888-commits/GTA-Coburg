// Autos: Modelle (Pkw, Kleinwagen, Kombi, Geländewagen, Kleinbus, Pick-up, Cabrio, Sportwagen, Taxi, Polizei) mit gerundeter Karosserie, Glas, Felgen und Lack mit Klarlack, Arcade-Fahrphysik mit Driften,
// Schaden bis zum Ausbrennen.
'use strict';

const CAR_COLORS = ['#c0392b', '#2e6fb7', '#e8e8e8', '#222428', '#7f8c8d', '#f1c40f', '#27ae60', '#8e44ad',
  '#d35400', '#1c3d5a', '#a3a3a3', '#5b2c2c'];
const SPORT_COLORS = ['#d61f1f', '#f2c500', '#ff6a00', '#1e88ff', '#111111', '#19b34a', '#e8e8e8'];

const CAR = {
  length: 4.3, width: 1.8, wheelBase: 2.6, wheelR: 0.34,
  maxSpeed: 50, reverseMax: 9, accel: 9, brake: 15, grip: 10, driftGrip: 1.6,
  circles: [1.35, 0, -1.35], radius: 0.95,
};

// Fahrzeugtypen: Höchstgeschwindigkeit (m/s), Beschleunigung, Haftung, Haltbarkeit, Wert beim Autohändler
const VEHICLE_KINDS = {
  car: { name: 'Pkw', maxSpeed: 44, accel: 8.5, grip: 10, armor: 1, value: 450 },
  sport: { name: 'Sportwagen', maxSpeed: 60, accel: 12.5, grip: 11.5, armor: 0.85, value: 1400 },
  taxi: { name: 'Taxi', maxSpeed: 44, accel: 8.5, grip: 10, armor: 1.1, value: 350 },
  police: { name: 'Streifenwagen', maxSpeed: 53, accel: 11, grip: 11, armor: 1.5, value: 900 },
  kleinwagen: { name: 'Kleinwagen', maxSpeed: 40, accel: 9.5, grip: 10.5, armor: 0.85, value: 300 },
  kombi: { name: 'Kombi', maxSpeed: 46, accel: 9, grip: 10, armor: 1.1, value: 600 },
  van: { name: 'Kleinbus', maxSpeed: 40, accel: 7, grip: 9, armor: 1.35, value: 650 },
  pickup: { name: 'Pick-up', maxSpeed: 45, accel: 8.5, grip: 9.5, armor: 1.3, value: 750 },
  suv: { name: 'Geländewagen', maxSpeed: 47, accel: 9.5, grip: 10.5, armor: 1.45, value: 950 },
  cabrio: { name: 'Cabrio', maxSpeed: 54, accel: 11, grip: 11, armor: 0.9, value: 1100 },
};
// Lackfarben je Typ (Händler, Lackiererei, Verkehr)
function kindPalette(kind) { return kind === 'sport' || kind === 'cabrio' ? SPORT_COLORS : CAR_COLORS; }

// ---------------- Modelle ----------------
// Karosserie als Seitenprofil (Länge × Höhe) mit Radkästen, über die Breite extrudiert und an den Kanten gerundet.
// Teile gleicher Farbe werden je Fahrzeugtyp zu einer Form zusammengefasst (wenige Zeichenaufrufe je Auto).
const CAR_SHAPES = {
  car: {
    body: [[-2.13, 0.3], [2.1, 0.3], [2.17, 0.5], [2.15, 0.7], [2.02, 0.82], [1.05, 0.93], [0.82, 0.96], [-1.62, 0.98], [-2.02, 0.96], [-2.16, 0.78], [-2.16, 0.45]],
    cabin: [[0.84, 0.92], [0.06, 1.4], [-0.98, 1.42], [-1.64, 0.97], [-1.6, 0.9]],
    roof: [[0.11, 1.37], [0.05, 1.45], [-0.97, 1.47], [-1.06, 1.38]],
    pillars: [[0.84, 0.94, 0.06, 1.41], [-0.98, 1.43, -1.64, 0.97]], bPillar: [-0.42, 0.95, 1.42],
    head: [2.1, 0.74], tail: [-2.16, 0.84], cabinW: 1.5, mirror: [0.72, 1.0], roofY: 1.47,
  },
  sport: {
    body: [[-2.13, 0.28], [2.12, 0.28], [2.2, 0.42], [2.18, 0.56], [1.95, 0.7], [0.9, 0.8], [0.62, 0.82], [-1.55, 0.86], [-2.05, 0.84], [-2.17, 0.66], [-2.16, 0.4]],
    cabin: [[0.64, 0.78], [-0.25, 1.17], [-1.0, 1.18], [-1.75, 0.85], [-1.7, 0.78]],
    roof: [[-0.2, 1.14], [-0.25, 1.21], [-1.0, 1.22], [-1.1, 1.13]],
    pillars: [[0.64, 0.8, -0.25, 1.18], [-1.0, 1.19, -1.75, 0.85]], bPillar: null,
    head: [2.12, 0.58], tail: [-2.17, 0.74], cabinW: 1.42, mirror: [0.5, 0.86], roofY: 1.22,
  },
  kleinwagen: {
    body: [[-1.85, 0.3], [1.85, 0.3], [1.92, 0.5], [1.9, 0.72], [1.75, 0.84], [1.05, 0.94], [0.85, 0.98], [-1.6, 1.0], [-1.88, 0.96], [-1.94, 0.8], [-1.92, 0.45]],
    cabin: [[0.86, 0.94], [0.1, 1.44], [-1.45, 1.46], [-1.75, 0.99], [-1.7, 0.92]],
    roof: [[0.15, 1.41], [0.09, 1.49], [-1.45, 1.5], [-1.55, 1.42]],
    pillars: [[0.86, 0.96, 0.1, 1.45], [-1.45, 1.47, -1.75, 0.99]], bPillar: [-0.5, 0.97, 1.46],
    head: [1.88, 0.74], tail: [-1.92, 0.88], cabinW: 1.48, mirror: [0.72, 1.02], roofY: 1.5,
  },
  kombi: {
    body: [[-2.2, 0.3], [2.1, 0.3], [2.17, 0.5], [2.15, 0.7], [2.02, 0.82], [1.05, 0.93], [0.82, 0.96], [-2.0, 0.98], [-2.2, 0.92], [-2.22, 0.45]],
    cabin: [[0.84, 0.92], [0.06, 1.42], [-1.9, 1.44], [-2.08, 0.97], [-2.0, 0.9]],
    roof: [[0.11, 1.39], [0.05, 1.47], [-1.92, 1.48], [-1.98, 1.39]],
    pillars: [[0.84, 0.94, 0.06, 1.43], [-1.92, 1.45, -2.08, 0.97]], bPillar: [[-0.45, 0.95, 1.44], [-1.3, 0.96, 1.45]],
    head: [2.1, 0.74], tail: [-2.2, 0.86], cabinW: 1.5, mirror: [0.72, 1.0], roofY: 1.48,
  },
  suv: {
    body: [[-2.2, 0.42], [2.15, 0.42], [2.24, 0.62], [2.22, 0.92], [2.05, 1.08], [1.0, 1.16], [0.8, 1.2], [-2.05, 1.22], [-2.24, 1.15], [-2.24, 0.6]],
    cabin: [[0.82, 1.16], [0.15, 1.68], [-1.95, 1.7], [-2.12, 1.2], [-2.0, 1.14]],
    roof: [[0.2, 1.65], [0.14, 1.74], [-1.95, 1.75], [-2.02, 1.66]],
    pillars: [[0.82, 1.18, 0.15, 1.69], [-1.95, 1.71, -2.12, 1.2]], bPillar: [[-0.55, 1.19, 1.7], [-1.35, 1.2, 1.71]],
    head: [2.15, 0.98], tail: [-2.24, 1.04], cabinW: 1.56, mirror: [0.7, 1.24], roofY: 1.75,
    // Dachreling
    extra: [[0.05, 0.06, 1.9, 0.68, 1.78, -0.9], [0.05, 0.06, 1.9, -0.68, 1.78, -0.9]],
  },
  van: {
    body: [[-2.25, 0.36], [2.15, 0.36], [2.26, 0.55], [2.25, 0.95], [2.1, 1.1], [1.75, 1.15], [-2.15, 1.15], [-2.28, 1.05], [-2.28, 0.55]],
    cabin: [[1.75, 1.12], [1.35, 1.82], [-2.1, 1.86], [-2.2, 1.12]],
    roof: [[1.38, 1.78], [1.3, 1.9], [-2.12, 1.92], [-2.2, 1.8]],
    pillars: [[1.75, 1.14, 1.35, 1.83], [-2.12, 1.86, -2.2, 1.14]], bPillar: [[0.75, 1.14, 1.86], [-0.7, 1.14, 1.88]],
    head: [2.22, 0.8], tail: [-2.28, 0.9], cabinW: 1.62, mirror: [1.6, 1.2], roofY: 1.92,
  },
  pickup: {
    body: [[-2.25, 0.34], [2.12, 0.34], [2.2, 0.55], [2.18, 0.8], [2.02, 0.95], [0.95, 1.03], [0.75, 1.06], [-2.15, 1.08], [-2.26, 1.02], [-2.26, 0.5]],
    cabin: [[0.78, 1.03], [0.2, 1.5], [-0.5, 1.52], [-0.62, 1.04], [-0.55, 1.0]],
    roof: [[0.25, 1.47], [0.19, 1.55], [-0.5, 1.56], [-0.58, 1.48]],
    pillars: [[0.78, 1.05, 0.2, 1.51], [-0.5, 1.53, -0.62, 1.05]], bPillar: null,
    head: [2.15, 0.82], tail: [-2.26, 0.9], cabinW: 1.5, mirror: [0.62, 1.1], roofY: 1.56,
    // Ladefläche: Boden, Bordwände, Heckklappe
    extra: [[1.6, 0.03, 1.5, 0, 1.09, -1.38], [0.06, 0.14, 1.55, 0.84, 1.14, -1.38], [0.06, 0.14, 1.55, -0.84, 1.14, -1.38], [1.74, 0.14, 0.06, 0, 1.14, -2.14]],
  },
  cabrio: {
    body: [[-2.13, 0.3], [2.1, 0.3], [2.17, 0.48], [2.15, 0.66], [2.0, 0.78], [0.95, 0.88], [0.7, 0.9], [-1.7, 0.92], [-2.05, 0.9], [-2.16, 0.72], [-2.16, 0.42]],
    cabin: [[0.72, 0.88], [0.3, 1.2], [0.22, 1.2], [0.6, 0.88]],   // nur Windschutzscheibe
    roof: null,
    pillars: [[0.72, 0.9, 0.3, 1.21]], bPillar: null,
    head: [2.1, 0.68], tail: [-2.16, 0.78], cabinW: 1.46, mirror: [0.6, 0.95], roofY: 1.2,
    // offener Innenraum: Boden und zwei Sitzlehnen
    extra: [[1.5, 0.03, 1.75, 0, 0.93, -0.5], [0.52, 0.5, 0.12, 0.38, 1.15, -0.6], [0.52, 0.5, 0.12, -0.38, 1.15, -0.6]],
  },
};
// Modell (Form) eines Fahrzeugtyps: Taxi und Polizei sind Pkw
function carShapeKey(kind) { return CAR_SHAPES[kind] && kind !== 'car' ? kind : 'car'; }
const WHEEL_X = 0.8, WHEEL_Z = 1.33;

// Form aus Teilen zusammenfügen: [[geometry, matrix], …] → eine nicht indizierte Geometrie
function carMerge(parts) {
  const pos = [], nor = [], uv = [];
  for (const [g0, m] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    if (m) g.applyMatrix4(m);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}
// Weiche Normalen: Ecken an derselben Stelle mitteln, solange die Flächen weniger als `deg` Grad auseinander liegen
// (gerundete Kanten wirken rund, harte Kanten bleiben hart)
function carSmooth(g, deg = 50) {
  const p = g.attributes.position, n = g.attributes.normal, cnt = p.count, lim = Math.cos(deg * Math.PI / 180);
  const fn = new Float32Array(cnt * 3), map = new Map(), out = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i += 3) { // Flächennormalen
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const ux = p.getX(i + 1) - ax, uy = p.getY(i + 1) - ay, uz = p.getZ(i + 1) - az;
    const vx = p.getX(i + 2) - ax, vy = p.getY(i + 2) - ay, vz = p.getZ(i + 2) - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) fn.set([nx, ny, nz], (i + k) * 3);
  }
  const key = i => Math.round(p.getX(i) * 1000) + ',' + Math.round(p.getY(i) * 1000) + ',' + Math.round(p.getZ(i) * 1000);
  for (let i = 0; i < cnt; i++) { const k = key(i); if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
  for (let i = 0; i < cnt; i++) {
    let sx = 0, sy = 0, sz = 0;
    for (const j of map.get(key(i))) {
      if (fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2] < lim) continue;
      sx += fn[j * 3]; sy += fn[j * 3 + 1]; sz += fn[j * 3 + 2];
    }
    const l = Math.hypot(sx, sy, sz) || 1; out[i * 3] = sx / l; out[i * 3 + 1] = sy / l; out[i * 3 + 2] = sz / l;
  }
  n.array.set(out); n.needsUpdate = true;
  return g;
}
// Seitenprofil [[länge, höhe], …] über die Breite w extrudieren (Rundung r an den Kanten), Mitte bei x = 0
function carExtrude(profile, w, r, arches) {
  const sh = new THREE.Shape();
  sh.moveTo(profile[0][0], profile[0][1]);
  if (arches) {
    // Unterkante mit zwei Radkästen von hinten nach vorn
    const y = profile[0][1];
    for (const cz of [-WHEEL_Z, WHEEL_Z]) {
      sh.lineTo(cz - 0.46, y);
      sh.absarc(cz, CAR.wheelR, 0.44, Math.PI - Math.asin((y - CAR.wheelR) / 0.44), Math.asin((y - CAR.wheelR) / 0.44), true);
    }
  }
  for (let i = 1; i < profile.length; i++) sh.lineTo(profile[i][0], profile[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: w - 2 * r, bevelEnabled: r > 0, bevelThickness: r, bevelSize: r * 0.75, bevelSegments: 3, curveSegments: 10 });
  g.rotateY(-Math.PI / 2);        // Profil-x (Länge) → Welt-z, Extrusion → Welt-x
  g.translate((w - 2 * r) / 2, 0, 0);
  g.computeVertexNormals();
  return carSmooth(g.index ? g.toNonIndexed() : g);
}
// Säulen quer über das Dach (B-, C-Säule): [[länge, unten, oben], …]
function carPosts(S) { return !S.bPillar ? [] : Array.isArray(S.bPillar[0]) ? S.bPillar : [S.bPillar]; }
const _carGeo = {};
function carGeometries(kind = 'car') {
  const key = carShapeKey(kind);
  if (_carGeo[key]) return _carGeo[key];
  const S = CAR_SHAPES[key], M4 = (x, y, z, rx = 0, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1));
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // Säulen als schräge Leisten zwischen zwei Profilpunkten
  const pillar = (s0, y0, s1, y1, x) => {
    const L = Math.hypot(s1 - s0, y1 - y0);
    return [box(0.07, 0.07, L), M4(x, (y0 + y1) / 2, (s0 + s1) / 2, Math.atan2(-(y1 - y0), s1 - s0))];
  };
  const cw = S.cabinW, px = cw / 2 + 0.005;
  const paintParts = [[carExtrude(S.body, 1.8, 0.09, true)]];
  if (S.roof) paintParts.push([carExtrude(S.roof, cw + 0.03, 0.03)]);
  for (const [s0, y0, s1, y1] of S.pillars) for (const x of [px, -px]) paintParts.push(pillar(s0, y0, s1, y1, x));
  for (const [bz, y0, y1] of carPosts(S)) paintParts.push([box(cw + 0.02, y1 - y0, 0.1), M4(0, (y0 + y1) / 2, bz)]);
  for (const x of [1, -1]) paintParts.push([box(0.16, 0.1, 0.2), M4(x * 0.98, S.mirror[1] + 0.05, S.mirror[0])]);
  const [hz, hy] = S.head, [tz, ty] = S.tail;
  const G = {
    paint: carMerge(paintParts),
    glass: carMerge([[carExtrude(S.cabin, cw, 0.05)]]),
    trim: carMerge([
      [box(1.86, 0.2, 0.2), M4(0, 0.4, hz + 0.08)], [box(1.86, 0.22, 0.2), M4(0, 0.42, tz - 0.06)],
      [box(0.9, 0.15, 0.06), M4(0, hy - 0.12, hz + 0.11)],                       // Kühlergrill
      [box(1.82, 0.06, 2.6), M4(0, 0.31, 0)],                                    // Schweller
      [box(0.05, 0.1, 0.2), M4(0.93, S.mirror[1], S.mirror[0])], [box(0.05, 0.1, 0.2), M4(-0.93, S.mirror[1], S.mirror[0])],
      ...(S.extra || []).map(([w, h, d, x, y, z]) => [box(w, h, d), M4(x, y, z)]),
    ]),
    head: carMerge([[box(0.44, 0.13, 0.14), M4(0.6, hy, hz + 0.05)], [box(0.44, 0.13, 0.14), M4(-0.6, hy, hz + 0.05)]]),
    tail: carMerge([[box(0.5, 0.12, 0.12), M4(0.58, ty, tz - 0.02)], [box(0.5, 0.12, 0.12), M4(-0.58, ty, tz - 0.02)]]),
    plate: carMerge([[box(0.52, 0.12, 0.02), M4(0, 0.47, hz + 0.19)], [box(0.52, 0.12, 0.02), M4(0, 0.6, tz - 0.1, 0, Math.PI)]]),
    roofY: S.roofY,
  };
  // Räder: Reifen, Felge mit fünf Speichen auf beiden Seiten (drehen sich mit)
  const tire = new THREE.CylinderGeometry(CAR.wheelR, CAR.wheelR, 0.24, 22); tire.rotateZ(Math.PI / 2);
  G.tire = tire;
  const rimParts = [[new THREE.CylinderGeometry(0.2, 0.2, 0.245, 16), M4(0, 0, 0, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))]];
  for (const side of [1, -1]) for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    rimParts.push([box(0.02, 0.05, 0.19), new THREE.Matrix4().makeTranslation(side * 0.125, 0, 0).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.1))]);
  }
  G.rim = carMerge(rimParts);
  G.spoiler = new THREE.BoxGeometry(1.6, 0.05, 0.32);
  G.strut = new THREE.BoxGeometry(0.06, 0.2, 0.1);
  G.barBase = new THREE.BoxGeometry(1.1, 0.07, 0.3);
  G.lamp = new THREE.BoxGeometry(0.42, 0.14, 0.24);
  G.side = new THREE.PlaneGeometry(2.4, 0.3);
  G.sign = new THREE.BoxGeometry(0.62, 0.2, 0.2);
  G.roofPlate = S.roof ? carExtrude(S.roof, cw + 0.05, 0.03) : null;
  G.blob = new THREE.PlaneGeometry(2.5, 5.0); G.blob.rotateX(-Math.PI / 2);
  _carGeo[key] = G;
  return G;
}

function textTexture(text, bg, fg, w = 256, h = 48) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = fg; c.font = `800 ${Math.round(h * 0.72)}px Segoe UI, Arial, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const _carMat = {};
// Kennzeichen „CO“ (Coburg) mit Euro-Feld
function plateTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 56;
  const c = cv.getContext('2d');
  c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, 256, 56);
  c.fillStyle = '#1f43a6'; c.fillRect(0, 0, 30, 56);
  c.fillStyle = '#ffd400'; c.beginPath(); c.arc(15, 18, 7, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, 253, 53);
  c.fillStyle = '#111'; c.font = '700 40px "DIN Alternate", "Arial Narrow", Arial, sans-serif'; c.textBaseline = 'middle';
  c.fillText('CO GT 77', 40, 30);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// Schatten-Fleck unter dem Auto (Bodenkontakt auch dort, wo die Sonnenschatten nicht mehr hinreichen)
function blobTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 64, 4, 32, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save(); c.scale(1, 2); c.translate(0, -32); c.fillStyle = g; c.fillRect(0, 0, 64, 128); c.restore();
  return new THREE.CanvasTexture(cv);
}
function carMaterials() {
  if (_carMat.glass) return _carMat;
  const std = o => new THREE.MeshStandardMaterial(o);
  _carMat.glass = std({ color: '#121a22', roughness: 0.05, metalness: 0.1, envMapIntensity: 1.8 });
  _carMat.tire = std({ color: '#161616', roughness: 0.92 });
  _carMat.hub = std({ color: '#c3c7cc', roughness: 0.28, metalness: 0.9, envMapIntensity: 1.2 });
  _carMat.trim = std({ color: '#1c1d1f', roughness: 0.6 });
  _carMat.plate = std({ map: plateTexture(), roughness: 0.5 });
  _carMat.head = std({ color: '#fff6dd', emissive: '#fff1c4', emissiveIntensity: 0.2, roughness: 0.15, metalness: 0.3 });
  _carMat.tail = std({ color: '#7a0c0c', emissive: '#ff2020', emissiveIntensity: 0.25, roughness: 0.25 });
  _carMat.policeBlue = new THREE.MeshPhysicalMaterial({ color: '#1f4fa3', roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08 });
  _carMat.lampOff = std({ color: '#16306b', emissive: '#0a1840', emissiveIntensity: 0.4, roughness: 0.3 });
  _carMat.lampOn = new THREE.MeshBasicMaterial({ color: '#7fb4ff' });
  _carMat.policeSide = std({ map: textTexture('POLIZEI', '#1f4fa3', '#ffffff', 512, 72), roughness: 0.4 });
  _carMat.taxiSign = std({ map: textTexture('TAXI', '#f6d23a', '#1a1a1a', 128, 40), emissive: '#ffd84a', emissiveIntensity: 0.25 });
  _carMat.wreck = std({ color: '#1c1a19', roughness: 1 });
  _carMat.blob = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: '#000000', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  _carMat.blob.alphaMap = _carMat.blob.map; _carMat.blob.map = null;
  return _carMat;
}
class Vehicle {
  constructor(scene, color, kind = 'car') {
    this.kind = kind;
    this.spec = VEHICLE_KINDS[kind] || VEHICLE_KINDS.car;
    if (!color) {
      if (kind === 'police') color = '#e9edf1';
      else if (kind === 'taxi') color = '#efe6c4';
      else { const pal = kindPalette(kind); color = pal[Math.floor(Math.random() * pal.length)]; }
    }
    this.color = color;
    // Lack mit Klarlack: spiegelt Himmel und Umgebung (scene.environment aus js/atmosphere.js)
    const paint = new THREE.MeshPhysicalMaterial({ color: this.color, metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 });
    this.paint = paint;
    this.baseColor = new THREE.Color(this.color);
    const G = carGeometries(kind), M = carMaterials();
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m;
    };
    const sport = kind === 'sport', top = G.roofY;
    add(G.paint, paint, 0, 0, 0);
    this.glassMesh = add(G.glass, M.glass, 0, 0, 0);
    add(G.trim, M.trim, 0, 0, 0, false);
    add(G.head, M.head, 0, 0, 0, false);
    add(G.tail, M.tail, 0, 0, 0, false);
    add(G.plate, M.plate, 0, 0, 0, false);
    const blob = add(G.blob, M.blob, 0, 0.05, 0, false);
    blob.userData.keep = true; blob.renderOrder = 1;
    if (sport) {
      add(G.spoiler, paint, 0, 1.06, -1.98);
      add(G.strut, M.trim, 0.55, 0.94, -1.98, false); add(G.strut, M.trim, -0.55, 0.94, -1.98, false);
    }
    this.lamps = null;
    if (kind === 'police') {
      add(G.roofPlate, M.policeBlue, 0, 0.004, 0, false);
      add(G.barBase, M.trim, 0, top + 0.04, -0.4, false);
      this.lamps = [add(G.lamp, M.lampOff, 0.3, top + 0.13, -0.4, false), add(G.lamp, M.lampOff, -0.3, top + 0.13, -0.4, false)];
      const sR = add(G.side, M.policeSide, 0.912, 0.62, -0.1, false); sR.rotation.y = Math.PI / 2;
      const sL = add(G.side, M.policeSide, -0.912, 0.62, -0.1, false); sL.rotation.y = -Math.PI / 2;
    }
    if (kind === 'taxi') add(G.sign, M.taxiSign, 0, top + 0.1, -0.45, false);
    this.wheels = [];
    this.frontPivots = [];
    for (const [x, z] of [[WHEEL_X, WHEEL_Z], [-WHEEL_X, WHEEL_Z], [WHEEL_X, -WHEEL_Z], [-WHEEL_X, -WHEEL_Z]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, CAR.wheelR, z);
      const w = new THREE.Group();
      const tire = new THREE.Mesh(G.tire, M.tire); tire.castShadow = true;
      const rim = new THREE.Mesh(G.rim, M.hub);
      w.add(tire, rim);
      pivot.add(w); g.add(pivot);
      this.wheels.push(w);
      if (z > 0) this.frontPivots.push(pivot);
    }
    this.group = g;
    scene.add(g);

    this.x = 0; this.z = 0; this.y = 0;
    this.heading = 0;
    this.vx = 0; this.vz = 0;
    this.steer = 0; this.pitch = 0; this.roll = 0; this.spin = 0;
    this.ai = null;          // gesetzt vom Verkehr
    this.isPlayer = false;
    this.lastImpact = 0;
    this.sleeping = true;
    this.health = 100;
    this.burning = 0;        // Sekunden bis zur Explosion (0 = brennt nicht)
    this.wrecked = false;
    this.siren = false;
    this.flashSeed = Math.floor(Math.random() * 4);
    this._col = {};
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }
  get speed() { return this.vx * this.forwardX + this.vz * this.forwardZ; }

  place(x, z, heading, world) {
    this.x = x; this.z = z; this.heading = heading; this.vx = this.vz = 0;
    this.y = Infinity; // oberste Fläche (auf Brücken die Fahrbahn)
    this.updateGround(world, 1, true);
    this.sync();
  }

  // input: { throttle -1..1, steer -1..1, handbrake }
  update(dt, input, world) {
    if (this.wrecked) input = { throttle: 0, steer: 0, handbrake: true };
    const S = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const thr = input.throttle, hb = input.handbrake;
    // stark beschädigte Autos verlieren Leistung
    const power = this.health < 25 ? 0.6 : 1;

    let a = 0;
    if (thr > 0) a = vf < -0.5 ? CAR.brake * thr : S.accel * power * thr * Math.max(0, 1 - vf / S.maxSpeed) * (hb ? 0.4 : 1);
    else if (thr < 0) a = vf > 0.5 ? CAR.brake * thr : (vf > -CAR.reverseMax ? 5 * thr : 0);
    a -= 0.0016 * vf * Math.abs(vf) + Math.sign(vf) * (thr === 0 ? 0.9 : 0.25);
    if (hb) a -= Math.sign(vf) * 5.5;
    // Steigung
    a -= 9.81 * Math.sin(this.pitch) * 0.85;
    const before = vf;
    vf += a * dt;
    if (thr === 0 && Math.sign(vf) !== Math.sign(before) && Math.abs(this.pitch) < 0.05) vf = 0;

    const maxSteer = 0.62 / (1 + Math.abs(vf) * 0.055);
    this.steer = U.damp(this.steer, input.steer * maxSteer, 9, dt);
    let yaw = vf * Math.tan(this.steer) / CAR.wheelBase;
    if (hb && Math.abs(vf) > 4) yaw *= 1.45;
    this.heading += yaw * dt;

    vl *= Math.exp(-(hb ? CAR.driftGrip : S.grip) * dt);
    // Geschwindigkeit im alten Bezugssystem zurückrechnen: dreht sich das Auto, entsteht im nächsten
    // Schritt eine Seitwärtskomponente, die die Reifenhaftung abbaut (das ist das Rutschen).
    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.drift = Math.abs(vl);

    this.integrate(dt, world);
    this.spin += vf * dt / CAR.wheelR;
    this.sleeping = Math.abs(vf) < 0.05 && thr === 0;
  }

  // Bewegt das Auto in kleinen Teilschritten und löst Kollisionen auf
  integrate(dt, world) {
    const sp = Math.hypot(this.vx, this.vz);
    const steps = Math.max(1, Math.ceil(sp * dt / 0.35));
    const h = dt / steps;
    this.lastImpact = 0;
    for (let s = 0; s < steps; s++) {
      this.x += this.vx * h; this.z += this.vz * h;
      this.resolveStatic(world);
    }
  }

  resolveStatic(world) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const off of CAR.circles) {
      const cx = this.x + fx * off, cz = this.z + fz * off;
      const r = world.collideCircle(cx, cz, CAR.radius, this._col, this.y);
      if (r.hit) {
        this.x += r.x - cx; this.z += r.z - cz;
        this.bounce(r.nx, r.nz, 0.25);
      }
    }
  }

  bounce(nx, nz, restitution) {
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      this.vx -= (1 + restitution) * vn * nx;
      this.vz -= (1 + restitution) * vn * nz;
      // Reibung abhängig von der Aufprallstärke, damit Entlangschrammen nicht festklebt
      const f = 1 - Math.min(0.35, -vn * 0.025);
      this.vx *= f; this.vz *= f;
      this.lastImpact = Math.max(this.lastImpact, -vn);
      this.damage(-vn);
    }
  }

  // Schaden aus einer Aufprallgeschwindigkeit (m/s): Rempler bis ≈ 25 km/h kosten nichts, ein Frontalaufprall
  // mit 100 km/h etwa ein Fünftel
  damage(v) {
    if (v < 7 || this.wrecked) return;
    this.health -= (v - 7) * 1.0 / this.spec.armor;
    if (this.health <= 0 && !this.burning) { this.health = 0; this.burning = 4.5; }
    // Lack wird mit dem Schaden dunkler und matter
    const f = 0.45 + 0.55 * U.clamp(this.health / 100, 0, 1);
    this.paint.color.copy(this.baseColor).multiplyScalar(f);
  }

  repair(color) {
    this.health = 100; this.burning = 0;
    if (color) this.baseColor.set(color);
    this.paint.color.copy(this.baseColor);
  }

  // ausgebranntes Wrack
  wreck() {
    this.wrecked = true; this.burning = 0; this.health = 0; this.siren = false;
    const M = carMaterials();
    this.group.traverse(o => { if (o.isMesh && o.material !== M.tire && !o.userData.keep) o.material = M.wreck; });
  }

  setSiren(on) {
    this.siren = on && !!this.lamps;
    if (this.lamps && !on) for (const l of this.lamps) l.material = carMaterials().lampOff;
  }

  // Blaulicht blinken lassen (t = Zeit in Sekunden)
  flash(t) {
    if (!this.siren) return;
    const M = carMaterials();
    const ph = Math.floor(t * 7 + this.flashSeed) % 4; // doppeltes Aufblitzen links, dann rechts
    this.lamps[0].material = ph === 0 ? M.lampOn : M.lampOff;
    this.lamps[1].material = ph === 2 ? M.lampOn : M.lampOff;
  }

  // Höhe, Neigung und Rollen aus dem Gelände
  updateGround(world, dt, snap) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx; // links
    const y0 = snap ? Infinity : this.y;
    const hf = world.groundAt(this.x + fx * 1.4, this.z + fz * 1.4, y0);
    const hbk = world.groundAt(this.x - fx * 1.4, this.z - fz * 1.4, y0);
    const hl = world.groundAt(this.x + lx * 0.85, this.z + lz * 0.85, y0);
    const hr = world.groundAt(this.x - lx * 0.85, this.z - lz * 0.85, y0);
    const pitch = Math.atan2(hf - hbk, 2.8);
    const roll = Math.atan2(hl - hr, 1.7);
    const y = (hf + hbk + hl + hr) / 4 + 0.03;
    if (snap) { this.pitch = pitch; this.roll = roll; this.y = y; }
    else {
      this.pitch = U.damp(this.pitch, pitch, 14, dt);
      this.roll = U.damp(this.roll, roll, 14, dt);
      this.y = U.damp(this.y, y, 20, dt);
    }
  }

  sync() {
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(-this.pitch, this.heading, this.roll, 'YXZ');
    for (const p of this.frontPivots) p.rotation.y = this.steer;
    for (const w of this.wheels) w.rotation.x = this.spin;
  }

  // Kreise in Weltkoordinaten (für Auto-Auto-Kollisionen)
  circlePoints(out) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (let i = 0; i < 3; i++) { out[i * 2] = this.x + fx * CAR.circles[i]; out[i * 2 + 1] = this.z + fz * CAR.circles[i]; }
    return out;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.paint.dispose();
    this.disposed = true;
  }
}

// Schiebt zwei Autos auseinander. a ist das bewegte Auto. Gibt die Aufprallgeschwindigkeit zurück (0 = kein Kontakt).
const _ca = [0, 0, 0, 0, 0, 0], _cb = [0, 0, 0, 0, 0, 0];
function collideCars(a, b) {
  const dx0 = a.x - b.x, dz0 = a.z - b.z;
  if (dx0 * dx0 + dz0 * dz0 > 36) return 0;
  a.circlePoints(_ca); b.circlePoints(_cb);
  const R = CAR.radius * 2 * 0.92;
  let hit = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const dx = _ca[i * 2] - _cb[j * 2], dz = _ca[i * 2 + 1] - _cb[j * 2 + 1];
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 1e-3, nx = dx / d, nz = dz / d, push = R - d;
    const movable = !b.ai;
    const share = movable ? 0.5 : 1;
    a.x += nx * push * share; a.z += nz * push * share;
    if (movable) { b.x -= nx * push * 0.5; b.z -= nz * push * 0.5; }
    // Impuls
    const rvx = a.vx - b.vx, rvz = a.vz - b.vz, vn = rvx * nx + rvz * nz;
    if (vn < 0) {
      a.lastImpact = Math.max(a.lastImpact, -vn);
      a.damage(-vn * 0.8); b.damage(-vn * 0.8);
      hit = Math.max(hit, -vn);
      if (movable) {
        const j2 = -vn * 0.6;
        a.vx += nx * j2; a.vz += nz * j2;
        b.vx -= nx * j2; b.vz -= nz * j2;
        b.sleeping = false;
      } else {
        a.vx -= 1.3 * vn * nx; a.vz -= 1.3 * vn * nz;
        if (b.ai) b.ai.bumped = 2.5;
      }
    }
    hit = Math.max(hit, 0.01);
    a.circlePoints(_ca);
  }
  return hit;
}
