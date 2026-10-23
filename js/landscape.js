// Landschaft im Umland: aus den OSM-Flächen wird je Kachel eine Bodenbedeckungskarte gemalt (Acker, Wiese, Wald;
// Feldraine an den Feldgrenzen, Reihenrichtung je Feld). Der Geländeshader mischt damit echte Materialien (Gras,
// Ackerboden mit Pflanzreihen, Fahrgassen und Furchen, Stoppeln, Waldboden) und nimmt die Farbe weiter aus dem
// Luftbild, nur unscharf (das Foto sagt, was wo wächst; die Nähe kommt aus den Texturen). Dazu um den Spieler 3D-Bewuchs
// (Grasbüschel, Getreide, Blumen, Farne) als Instanzen und für ferne Wälder eine Kronendach-Hülle.
'use strict';

const LAND = {
  coverPx: 256,       // Bodenbedeckungskarte je Kachel (≈ 3,9 m pro Pixel)
  blur: 2,            // Weichzeichnen (Pixel, drei Durchgänge): weiche Übergänge zwischen den Flächen
  rain: 3,            // Feldrain an Feldgrenzen (m)
  coverR: 88,         // 3D-Bewuchs bis zu diesem Abstand (m)
  cell: 8,            // Zellgröße für den Bewuchs (m)
  canopyH: 19,        // Höhe der fernen Kronendach-Hülle über dem Boden (m)
};
// Bodenbedeckung je OSM-Fläche: r Acker, g Wiese/Gras, b Wald (0–255); Schwarz heißt: nur das Luftbild zählt
const COVER_RGB = {
  residential: [0, 110, 0], farmyard: [60, 40, 0], farmland: [255, 0, 0], meadow: [0, 255, 0], grass: [0, 255, 0],
  park: [0, 230, 25], cemetery: [0, 170, 40], orchard: [0, 235, 0], allotments: [0, 150, 0], pitch: [0, 210, 0],
  sport: [0, 120, 0], playground: [0, 90, 0], scrub: [0, 150, 105], forest: [0, 0, 255], construction: [70, 0, 0],
  industrial: [0, 0, 0], commercial: [0, 0, 0], parking: [0, 0, 0], yard: [0, 0, 0], trackSport: [0, 0, 0], pool: [0, 0, 0],
  water: [0, 0, 0], river: [0, 0, 0],
};
const COVER_ORDER = ['residential', 'farmyard', 'farmland', 'meadow', 'grass', 'park', 'cemetery', 'orchard', 'allotments',
  'pitch', 'sport', 'playground', 'scrub', 'forest', 'construction', 'industrial', 'commercial', 'parking', 'yard',
  'trackSport', 'pool', 'water', 'river'];

// ---------- Texturen (einmal aus der Leinwand gemalt, nahtlos kachelbar) ----------
function landCanvas(S, base, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  if (base) { c.fillStyle = base; c.fillRect(0, 0, S, S); }
  // jede Form auch an den gegenüberliegenden Rändern, damit die Textur nahtlos ist
  const wrap = (x, y, r, f) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (x + dx > -r && x + dx < S + r && y + dy > -r && y + dy < S + r) f(x + dx, y + dy); };
  draw(c, wrap, S);
  return cv;
}
function landTextures(renderer) {
  if (landTextures.cache) return landTextures.cache;
  const rnd = U.rng(4242);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (cv, srgb = true) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    return t;
  };
  const rgb = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  // Gras: dichte Halme in vielen Grüntönen, dazwischen etwas trockenes Gras und dunkle Lücken
  const grass = landCanvas(512, '#46602a', (c, wrap, S) => {
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * S, y = rnd() * S, l = 10 + rnd() * 26, a = -Math.PI / 2 + (rnd() - 0.5) * 1.6, v = rnd();
      const dry = rnd() < 0.12;
      c.strokeStyle = dry ? rgb(150 + v * 50, 140 + v * 40, 70 + v * 20) : rgb(45 + v * 70, 80 + v * 80, 25 + v * 35);
      c.lineWidth = 1 + rnd() * 2.2;
      wrap(x, y, l, (px, py) => { c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 6, py + Math.sin(a) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke(); });
    }
    for (let i = 0; i < 260; i++) { const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 9; c.fillStyle = 'rgba(25,35,15,0.35)'; wrap(x, y, r, (px, py) => { c.beginPath(); c.ellipse(px, py, r, r * 0.6, rnd() * 3, 0, 7); c.fill(); }); }
  });
  // Ackerboden: Erdkrumen, Steinchen, feuchte dunkle Stellen
  const soil = landCanvas(512, '#6e5440', (c, wrap, S) => {
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 10, v = rnd();
      c.fillStyle = rgb(80 + v * 70, 60 + v * 50, 42 + v * 34);
      wrap(x, y, r, (px, py) => { c.beginPath(); c.ellipse(px, py, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); c.fill(); });
    }
    for (let i = 0; i < 700; i++) { const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 2.5, v = rnd(); c.fillStyle = rgb(150 + v * 70, 145 + v * 65, 135 + v * 60); wrap(x, y, r, (px, py) => { c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); }); }
    for (let i = 0; i < 90; i++) { const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 30; c.fillStyle = 'rgba(40,28,20,0.18)'; wrap(x, y, r, (px, py) => { c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); }); }
  });
  // Waldboden: Laub, Nadeln, Zweige, etwas Moos
  const litter = landCanvas(512, '#4d3d2b', (c, wrap, S) => {
    for (let i = 0; i < 2400; i++) {
      const x = rnd() * S, y = rnd() * S, l = 4 + rnd() * 9, v = rnd(), k = rnd();
      c.fillStyle = k < 0.55 ? rgb(110 + v * 70, 70 + v * 45, 30 + v * 20) : k < 0.8 ? rgb(70 + v * 40, 55 + v * 30, 35 + v * 20) : rgb(60 + v * 30, 85 + v * 40, 35 + v * 15);
      wrap(x, y, l, (px, py) => { c.beginPath(); c.ellipse(px, py, l, l * 0.45, rnd() * 3, 0, 7); c.fill(); });
    }
    c.strokeStyle = 'rgba(60,40,25,0.8)';
    for (let i = 0; i < 160; i++) { const x = rnd() * S, y = rnd() * S, l = 15 + rnd() * 50, a = rnd() * 6.3; c.lineWidth = 1.5 + rnd() * 2.5; wrap(x, y, l, (px, py) => { c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke(); }); }
  });
  // Halme für die 3D-Grasbüschel (mit Transparenz): Fächer aus Halmen von unten Mitte
  const blades = landCanvas(256, null, (c, wrap, S) => {
    for (let i = 0; i < 70; i++) {
      const x0 = S * (0.3 + rnd() * 0.4), a = (rnd() - 0.5) * 1.2, h = S * (0.45 + rnd() * 0.55), v = 0.6 + rnd() * 0.4;
      c.strokeStyle = rgb(200 * v, 235 * v, 160 * v); c.lineWidth = 2 + rnd() * 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, S); c.quadraticCurveTo(x0 + Math.sin(a) * h * 0.4, S - h * 0.6, x0 + Math.sin(a) * h, S - h); c.stroke();
    }
  });
  // Getreide: aufrechte Halme mit Ähren
  const crop = landCanvas(256, null, (c, wrap, S) => {
    for (let i = 0; i < 46; i++) {
      const x0 = S * (0.08 + rnd() * 0.84), h = S * (0.7 + rnd() * 0.3), lean = (rnd() - 0.5) * 18, v = 0.7 + rnd() * 0.3;
      c.strokeStyle = rgb(215 * v, 230 * v, 170 * v); c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(x0, S); c.lineTo(x0 + lean, S - h); c.stroke();
      c.fillStyle = rgb(235 * v, 235 * v, 180 * v);
      c.beginPath(); c.ellipse(x0 + lean, S - h + 9, 4, 13, lean * 0.01, 0, 7); c.fill();
      for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(x0 + lean * 0.4, S - h * 0.4); c.quadraticCurveTo(x0 + (k ? 18 : -18), S - h * 0.5, x0 + (k ? 26 : -26), S - h * 0.35); c.stroke(); }
    }
  });
  // Wiesenblumen: Stängel mit weißen, gelben, violetten Blüten
  const flowers = landCanvas(256, null, (c, wrap, S) => {
    const cols = ['#ffffff', '#f4e04a', '#c79ae8', '#ffffff', '#f2a7c4', '#f6d23a'];
    for (let i = 0; i < 22; i++) {
      const x0 = S * (0.1 + rnd() * 0.8), h = S * (0.35 + rnd() * 0.5);
      c.strokeStyle = 'rgb(150,190,110)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, S); c.lineTo(x0 + (rnd() - 0.5) * 20, S - h); c.stroke();
      c.fillStyle = cols[Math.floor(rnd() * cols.length)];
      const bx = x0 + (rnd() - 0.5) * 20, by = S - h;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(bx + Math.cos(k * 1.26) * 5, by + Math.sin(k * 1.26) * 5, 4, 0, 7); c.fill(); }
      c.fillStyle = '#e0b020'; c.beginPath(); c.arc(bx, by, 3, 0, 7); c.fill();
    }
  });
  // Farnwedel für den Waldboden
  const fern = landCanvas(256, null, (c, wrap, S) => {
    for (let f = 0; f < 7; f++) {
      const a = -Math.PI / 2 + (f - 3) * 0.32, len = S * (0.55 + rnd() * 0.4), v = 0.65 + rnd() * 0.35;
      c.strokeStyle = rgb(170 * v, 220 * v, 130 * v); c.fillStyle = c.strokeStyle; c.lineWidth = 2.5;
      const x0 = S / 2, y0 = S, ex = x0 + Math.cos(a) * len, ey = y0 + Math.sin(a) * len;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(ex, ey); c.stroke();
      for (let k = 1; k < 16; k++) {
        const t = k / 16, px = x0 + (ex - x0) * t, py = y0 + (ey - y0) * t, l = (1 - t) * 26 + 4;
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(px + Math.cos(a + s * 1.2) * l * 0.5, py + Math.sin(a + s * 1.2) * l * 0.5, l * 0.5, 3, a + s * 1.2, 0, 7); c.fill(); }
      }
    }
  });
  landTextures.cache = {
    grass: tex(grass), soil: tex(soil), litter: tex(litter),
    blades: tex(blades), crop: tex(crop), flowers: tex(flowers), fern: tex(fern),
  };
  for (const k of ['blades', 'crop', 'flowers', 'fern']) landTextures.cache[k].wrapS = landTextures.cache[k].wrapT = THREE.ClampToEdgeWrapping;
  return landTextures.cache;
}

// Gemeinsame GLSL-Hilfen: Wertrauschen
const LAND_NOISE = `
  float lh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(lh(i), lh(i + vec2(1.0, 0.0)), f.x), mix(lh(i + vec2(0.0, 1.0)), lh(i + vec2(1.0, 1.0)), f.x), f.y); }
  float lfbm(vec2 p) { return ln(p) * 0.55 + ln(p * 2.13 + 7.1) * 0.3 + ln(p * 4.7 + 3.3) * 0.15; }`;

class Landscape {
  constructor(region) {
    this.region = region;
    this.world = region.world;
    this.T = landTextures(this.world.renderer);
    this.detail = region._detail || (region._detail = this.world.makeDetailTexture());
    this.cells = new Map();          // Bewuchs je Zelle
    this.coverCenter = null;
    this.buildCoverMeshes();
  }

  // ---------- Bodenbedeckungskarte einer Kachel ----------
  paintCover(t) {
    const R = this.region, S = LAND.coverPx;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const fv = document.createElement('canvas'); fv.width = fv.height = S;
    const f = fv.getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
    f.fillStyle = 'rgb(128,128,0)'; f.fillRect(0, 0, S, S);
    const sx = S / R.tw, sz = S / R.th;
    for (const ctx of [c, f]) ctx.setTransform(sx, 0, 0, sz, -t.x0 * sx, -t.z0 * sz);
    const areas = (t.d ? t.d.areas : []).slice().sort((a, b) => COVER_ORDER.indexOf(a.k) - COVER_ORDER.indexOf(b.k));
    for (const a of areas) {
      const col = COVER_RGB[a.k];
      if (!col) continue;
      c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      this.world.pathPoly(c, a.p, a.ho); c.fill('evenodd');
      if (a.k === 'farmland' || a.k === 'meadow') {
        // Reihenrichtung: längste Kante des Felds (bei Wiesen die Mährichtung)
        let best = 0, ang = 0;
        for (let i = 0; i + 3 < a.p.length; i += 2) {
          const dx = a.p[i + 2] - a.p[i], dz = a.p[i + 3] - a.p[i + 1], l = dx * dx + dz * dz;
          if (l > best) { best = l; ang = Math.atan2(dz, dx); }
        }
        const h = U.hashStr(a.k + a.p[0] + ',' + a.p[1]);
        if (h % 3 === 0) ang += Math.PI / 2;
        f.fillStyle = `rgb(${Math.round((Math.cos(2 * ang) * 0.5 + 0.5) * 255)},${Math.round((Math.sin(2 * ang) * 0.5 + 0.5) * 255)},${h % 251})`;
        this.world.pathPoly(f, a.p, a.ho); f.fill('evenodd');
      }
    }
    // Feldraine: Grasstreifen an den Feldgrenzen (nicht an den Schnittkanten der Kachel)
    c.strokeStyle = 'rgb(0,255,0)'; c.lineWidth = LAND.rain; c.lineCap = 'round';
    const onEdge = (x, z) => Math.abs(x - t.x0) < 0.6 || Math.abs(x - t.x1) < 0.6 || Math.abs(z - t.z0) < 0.6 || Math.abs(z - t.z1) < 0.6;
    for (const a of areas) {
      if (a.k !== 'farmland') continue;
      for (const ring of [a.p].concat(a.ho || [])) {
        const n = ring.length / 2;
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
          if (onEdge(ax, az) && onEdge(bx, bz)) continue;
          c.moveTo(ax, az); c.lineTo(bx, bz);
        }
        c.stroke();
      }
    }
    // Weichzeichnen (Ränder wiederholt, damit Nachbarkacheln zueinander passen)
    const img = c.getImageData(0, 0, S, S);
    t.coverRaw = new Uint8ClampedArray(img.data);
    Landscape.blur(img.data, S, LAND.blur, 2);
    c.putImageData(img, 0, 0);
    t.coverPx = img.data;
    t.fieldPx = f.getImageData(0, 0, S, S).data;
    const ct = new THREE.CanvasTexture(cv);
    ct.wrapS = ct.wrapT = THREE.ClampToEdgeWrapping;
    const ft = new THREE.CanvasTexture(fv);
    ft.magFilter = ft.minFilter = THREE.NearestFilter; ft.generateMipmaps = false;
    ft.wrapS = ft.wrapT = THREE.ClampToEdgeWrapping;
    t.coverTex = ct; t.fieldTex = ft;
  }
  static blur(d, S, r, passes, channels = 3) {
    const tmp = new Float32Array(S * S);
    for (let ch = 0; ch < channels; ch++) for (let p = 0; p < passes; p++) {
      for (let y = 0; y < S; y++) {               // waagrecht
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += d[(y * S + U.clamp(k, 0, S - 1)) * 4 + ch];
        for (let x = 0; x < S; x++) {
          tmp[y * S + x] = acc / (2 * r + 1);
          acc += d[(y * S + Math.min(S - 1, x + r + 1)) * 4 + ch] - d[(y * S + Math.max(0, x - r)) * 4 + ch];
        }
      }
      for (let x = 0; x < S; x++) {               // senkrecht
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += tmp[U.clamp(k, 0, S - 1) * S + x];
        for (let y = 0; y < S; y++) {
          d[(y * S + x) * 4 + ch] = acc / (2 * r + 1);
          acc += tmp[Math.min(S - 1, y + r + 1) * S + x] - tmp[Math.max(0, y - r) * S + x];
        }
      }
    }
  }
  // Bedeckung an einem Punkt (0..1 je Art), aus der geladenen Kachel
  coverAt(x, z, out) {
    const R = this.region, [ti, tj] = R.tileOf(x, z), t = R.loaded.get(tileKey(ti, tj));
    out = out || {};
    if (!t || !t.coverPx) { out.f = 0; out.g = 0; out.w = 0; out.t = null; return out; }
    const S = LAND.coverPx;
    const px = U.clamp(Math.floor((x - t.x0) / R.tw * S), 0, S - 1), py = U.clamp(Math.floor((z - t.z0) / R.th * S), 0, S - 1);
    const k = (py * S + px) * 4, d = t.coverPx;
    out.f = d[k] / 255; out.g = d[k + 1] / 255; out.w = d[k + 2] / 255; out.t = t;
    const fp = t.fieldPx; out.dir = Math.atan2(fp[k + 1] / 127.5 - 1, fp[k] / 127.5 - 1) / 2; out.field = fp[k + 2];
    return out;
  }
  // Farbe des Luftbilds an einem Punkt (stark verkleinert, für die Farbe des Bewuchses)
  photoAt(x, z, t) {
    if (!t.photoSmall) {
      const img = t.terrainMat.map && t.terrainMat.map.image;
      if (!img || !img.width || img.width < 8) return null;
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0, 64, 64);
      t.photoSmall = c.getImageData(0, 0, 64, 64).data;
    }
    const R = this.region;
    const px = U.clamp(Math.floor((x - t.x0) / R.tw * 64), 0, 63), py = U.clamp(Math.floor((z - t.z0) / R.th * 64), 0, 63), k = (py * 64 + px) * 4, d = t.photoSmall;
    return [d[k] / 255, d[k + 1] / 255, d[k + 2] / 255];
  }

  // ---------- Geländematerial ----------
  terrainMaterial(t) {
    const T = this.T;
    const mat = new THREE.MeshLambertMaterial({ map: this.region.placeholder(), color: ORTHO_TINT });
    const cover = t.coverTex || Landscape.blackTex(), field = t.fieldTex || Landscape.blackTex();
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, {
        coverMap: { value: cover }, fieldMap: { value: field }, grassTex: { value: T.grass }, soilTex: { value: T.soil },
        litterTex: { value: T.litter }, detailMap: { value: this.detail }, uWet: ATMO.uniforms.uWet,
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vLW;
          uniform sampler2D coverMap, fieldMap, grassTex, soilTex, litterTex, detailMap;
          uniform float uWet;
          float landH = 0.0;
          ${LAND_NOISE}
          vec3 sat(vec3 c, float s) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return max(mix(vec3(l), c, s), 0.0); }
          // Textur zweimal in verschiedenem Maßstab und gedreht lesen: keine sichtbare Kachelung
          vec3 tri2(sampler2D tx, vec2 p, float sc) {
            vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
            return mix(texture2D(tx, p / sc).rgb, texture2D(tx, q / (sc * 1.73) + 0.37).rgb, 0.45);
          }`)
        .replace('#include <map_fragment>', `
          vec4 photoTx = texture2D(map, vMapUv, 1.2);
          diffuseColor.rgb *= photoTx.rgb;
          vec3 photo = diffuseColor.rgb;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 wp = vLW.xz;
            float dist = length(vLW - cameraPosition);
            vec3 cov = texture2D(coverMap, vMapUv).rgb;
            // unregelmäßige Ränder statt weicher Verläufe
            float nE = lfbm(wp / 11.0) - 0.5;
            float wF = smoothstep(0.32, 0.62, cov.r + nE * 0.45);
            float wG = smoothstep(0.32, 0.62, cov.g + nE * 0.4);
            float wW = smoothstep(0.32, 0.6, cov.b - nE * 0.4);
            float sum = wF + wG + wW;
            if (sum > 1.0) { wF /= sum; wG /= sum; wW /= sum; sum = 1.0; }
            float wU = 1.0 - sum;   // Rest: Ort, Straße, Gewerbe – Luftbild mit Körnung
            vec3 ph = sat(photo, 1.35) * 1.05;
            float nBig = lfbm(wp / 37.0), nMid = ln(wp / 4.3);
            float near = 1.0 - smoothstep(60.0, 260.0, dist);

            // Wiese: Grastextur, Farbton aus dem Luftbild, Flecken trockener und frischer
            vec3 gT = tri2(grassTex, wp, 2.6);
            vec3 gC = mix(vec3(0.075, 0.13, 0.035), ph * vec3(0.85, 1.0, 0.75), 0.55) * (0.85 + 0.3 * nBig);
            gC = mix(gC, vec3(0.16, 0.15, 0.06), smoothstep(0.62, 0.85, nBig) * 0.45);
            vec3 grassC = mix(gC, gT * (gC / vec3(0.095, 0.15, 0.06)) * 0.62, near * 0.85);
            float grassH = dot(gT, vec3(0.33)) * 2.0;

            // Acker: Art nach Fotofarbe (grün: Saat in Reihen, braun: gepflügt, gelb: Stoppeln)
            vec4 fm = texture2D(fieldMap, vMapUv);
            float ang = atan(fm.g * 2.0 - 1.0, fm.r * 2.0 - 1.0) * 0.5;
            vec2 dir = vec2(cos(ang), sin(ang));
            float acr = dot(wp, vec2(-dir.y, dir.x)), alg = dot(wp, dir);
            float pl = dot(ph, vec3(0.333));
            float green = smoothstep(0.0, 0.07, ph.g - max(ph.r, ph.b) * 0.95);
            float yellow = smoothstep(0.03, 0.12, ph.r + ph.g * 0.4 - ph.b * 1.4 - 0.25) * (1.0 - green);
            float brown = max(0.0, 1.0 - green - yellow);
            vec3 sT = tri2(soilTex, wp, 2.2);
            vec3 soilC = mix(vec3(0.17, 0.11, 0.065), ph * vec3(1.0, 0.85, 0.7), 0.55) * (sT / vec3(0.17, 0.11, 0.07)) * 0.55;
            soilC = mix(mix(vec3(0.17, 0.11, 0.065), ph, 0.5), soilC, near);
            // Reihen: Saat 0,75 m, Furchen 0,4 m, Stoppeln 0,17 m (aus der Ferne ausgeblendet)
            float rw = mix(mix(0.42, 0.75, green), 0.17, yellow);
            float rp = acr / rw, fw = fwidth(rp);
            float rowF = 1.0 - smoothstep(0.35, 0.8, fw);
            float row = abs(fract(rp) - 0.5) * 2.0;
            vec3 cropC = mix(vec3(0.06, 0.13, 0.03), ph * vec3(0.8, 1.05, 0.7), 0.6) * (0.85 + 0.3 * nMid);
            vec3 strawC = mix(vec3(0.42, 0.34, 0.16), ph * vec3(1.1, 1.0, 0.75), 0.5);
            float plant = smoothstep(0.25, 0.65, row);
            vec3 fieldC = soilC;
            fieldC = mix(fieldC, mix(soilC, cropC, mix(0.75, plant, rowF)), green);
            fieldC = mix(fieldC, mix(strawC * 0.8, strawC * 1.1, mix(0.5, plant, rowF)), yellow);
            fieldC = mix(fieldC, soilC * mix(1.0, 0.72 + 0.4 * smoothstep(0.1, 0.9, row), rowF), brown * 0.9);
            // Fahrgassen alle 20 m (zwei Spuren im Abstand 1,8 m)
            float tram = abs(mod(acr + fm.b * 0.37, 20.0) - 10.0);
            float lane = (1.0 - smoothstep(0.18, 0.32, abs(tram - 0.9))) * (1.0 - smoothstep(0.6, 1.2, fwidth(acr) * 6.0));
            fieldC = mix(fieldC, soilC * 0.9, lane * (green + yellow) * 0.85);
            fieldC *= 0.9 + 0.2 * nBig;
            float fieldH = mix(row, plant, green + yellow) * rowF;

            // Waldboden
            vec3 lT = tri2(litterTex, wp, 3.0);
            vec3 woodC = mix(vec3(0.07, 0.055, 0.03), ph * 0.6, 0.35) * mix(vec3(1.0), lT / vec3(0.14, 0.1, 0.06) * 0.75, near);
            woodC = mix(woodC, vec3(0.05, 0.08, 0.025), smoothstep(0.55, 0.8, nBig) * 0.5);

            // Rest: Luftbild mit Körnung wie bisher (Ort, Gewerbe, ohne Angabe)
            float dA = texture2D(detailMap, wp / 9.0).r, dB = texture2D(detailMap, wp / 1.7).r;
            vec3 urbC = photo * mix(1.0, 0.72 + 0.56 * (dA * 0.5 + dB * 0.5), 0.55);
            // Ohne Flächenangabe: grünes Foto wie Wiese behandeln
            float pg = smoothstep(0.0, 0.05, photo.g - max(photo.r, photo.b) * 0.93) * wU;
            vec3 col = urbC * (wU - pg) + grassC * (wG + pg) + fieldC * wF + woodC * wW;
            diffuseColor.rgb = col;
            landH = grassH * (wG + pg) * 0.6 + fieldH * wF + dot(lT, vec3(0.33)) * 2.0 * wW * 0.5;
            landH *= near;
            diffuseColor.rgb *= 1.0 - 0.3 * uWet;
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            // Relief aus dem Muster (Furchen, Pflanzreihen, Grasbüschel)
            vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
            float hx = dFdx(landH), hy = dFdy(landH);
            vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
            float det = dot(dpx, r1);
            vec3 grad = sign(det) * (hx * r1 + hy * r2);
            normal = normalize(abs(det) * normal - grad * 0.06);
          }`);
    };
    mat.customProgramCacheKey = () => 'land';
    return mat;
  }
  static blackTex() {
    if (!Landscape._black) { const d = new Uint8Array([0, 0, 0, 255]); Landscape._black = new THREE.DataTexture(d, 1, 1); Landscape._black.needsUpdate = true; }
    return Landscape._black;
  }

  // ---------- Kronendach-Hülle für ferne Wälder ----------
  // Über den Waldflächen eine Hülle in Kronenhöhe, an den Rändern abfallend; sichtbar, solange die Kachel keine Bäume hat
  buildCanopy(t) {
    if (!t.coverPx) return;
    const R = this.region, N = R.N, S = N + 1, H = t.hg, HS = t.hs, C = LAND.coverPx;
    const cov = (c, r) => {
      const px = U.clamp(Math.round(c / N * C), 0, C - 1), py = U.clamp(Math.round(r / N * C), 0, C - 1);
      return t.coverPx[(py * C + px) * 4 + 2] / 255 + t.coverPx[(py * C + px) * 4 + 1] / 255 * 0.0;
    };
    const wv = new Float32Array(S * S);
    let any = false;
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) { const w = cov(c, r); wv[r * S + c] = w; if (w > 0.3) any = true; }
    if (!any) return;
    const pos = [], col = [], idx = [], map = new Int32Array(S * S).fill(-1);
    const rnd = U.rng(t.key * 13 + 5);
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
      const w = wv[r * S + c];
      // nur Punkte in oder neben Wald
      let near = w;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < S && rr < S) near = Math.max(near, wv[rr * S + cc]); }
      if (near < 0.3) continue;
      const x = t.x0 + c * R.fx, z = t.z0 + r * R.fz, g = H[(r + 1) * HS + c + 1];
      const k = U.smoothstep(0.3, 0.75, w);
      const h = g + (k > 0 ? LAND.canopyH * (0.75 + 0.45 * rnd()) * k : -2);
      map[r * S + c] = pos.length / 3;
      pos.push(x, h, z);
      const v = 0.7 + rnd() * 0.45;
      col.push(v * 0.9, v, v * 0.85);
    }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const a = map[r * S + c], b = map[r * S + c + 1], d = map[(r + 1) * S + c], e = map[(r + 1) * S + c + 1];
      if (a < 0 || b < 0 || d < 0 || e < 0) continue;
      if (wv[r * S + c] + wv[r * S + c + 1] + wv[(r + 1) * S + c] + wv[(r + 1) * S + c + 1] < 0.6) continue;
      idx.push(a, d, b, b, d, e);
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.canopyMaterial());
    m.receiveShadow = true; m.castShadow = false;
    m.visible = !R.treesOn.has(t.key);
    t.canopy = m;
    t.group.add(m);
  }
  canopyMaterial() {
    if (this._canopyMat) return this._canopyMat;
    const m = new THREE.MeshLambertMaterial({ color: '#4c6a34', vertexColors: true });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vCW;\nfloat cH = 0.0;\n${LAND_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // einzelne Kronen als Buckel (≈ 7 m), dunkle Lücken dazwischen, Farbe je Baum
            vec2 p = vCW.xz / 6.5;
            float n = ln(p) * 0.6 + ln(p * 2.3 + 4.1) * 0.3 + ln(p * 5.1) * 0.1;
            cH = n * 3.0;
            float conifer = step(0.55, ln(vCW.xz / 60.0));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.78, 0.7), conifer) * (0.45 + 0.85 * smoothstep(0.25, 0.75, n));
            diffuseColor.rgb *= 0.85 + 0.3 * lh(floor(p * 1.3));
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
            float hx = dFdx(cH), hy = dFdy(cH);
            vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
            float det = dot(dpx, r1);
            normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * 0.9);
          }`);
    };
    m.customProgramCacheKey = () => 'canopy';
    this._canopyMat = m;
    return m;
  }

  // ---------- 3D-Bewuchs um den Spieler ----------
  buildCoverMeshes() {
    const T = this.T;
    // Büschel aus drei gekreuzten Karten; Normalen nach oben (wie der Boden beleuchtet)
    const clump = (w, h, n) => {
      const P = [], N = [], UV = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI, cx = Math.cos(a) * w / 2, cz = Math.sin(a) * w / 2;
        const quad = [[-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [cx, h, cz, 1, 1], [-cx, h, -cz, 0, 1]];
        for (const k of [0, 1, 2, 0, 2, 3]) { const q = quad[k]; P.push(q[0], q[1], q[2]); N.push(0, 1, 0); UV.push(q[3], q[4]); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      return g;
    };
    const mk = (geo, tex, max) => {
      const m = new THREE.InstancedMesh(geo, this.coverMaterial(tex), max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color()); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
      this.world.group.add(m);
      return m;
    };
    this.kinds = {
      grass: { m: mk(clump(0.9, 0.55, 3), T.blades, 26000) },
      crop: { m: mk(clump(0.8, 0.85, 3), T.crop, 22000) },
      flower: { m: mk(clump(0.6, 0.45, 2), T.flowers, 4000) },
      fern: { m: mk(clump(1.1, 0.7, 3), T.fern, 6000) },
    };
  }
  coverMaterial(tex) {
    const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = ATMO.uniforms.uTime;
      sh.uniforms.uFade = { value: LAND.coverR };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uFade;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec3 ip = instanceMatrix[3].xyz;
            float d = length(ip.xz - cameraPosition.xz);
            float s = 1.0 - smoothstep(uFade - 28.0, uFade - 4.0, d);   // zum Rand hin in den Boden einsinken
            transformed *= s;
            float sway = transformed.y;
            transformed.x += sin(uTime * 1.9 + ip.x * 0.31 + ip.z * 0.17) * 0.07 * sway;
            transformed.z += cos(uTime * 1.6 + ip.x * 0.23) * 0.05 * sway;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <alphatest_fragment>', `
          diffuseColor.a = (diffuseColor.a - 0.5) / max(fwidth(diffuseColor.a), 1e-4) + 0.5;
          #include <alphatest_fragment>`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(0.55, 1.05, vMapUv.y);   // unten im Büschel dunkler`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(vNormal);');
    };
    m.customProgramCacheKey = () => 'cover';
    return m;
  }

  // Bewuchs einer Zelle (deterministisch): Liste [art, x, y, z, drehung, größe, r, g, b]
  makeCell(ix, iz) {
    const R = this.region, C = LAND.cell, rnd = U.rng((ix * 73856093) ^ (iz * 19349663));
    const out = [], cv = {};
    const x0 = ix * C, z0 = iz * C;
    const center = this.coverAt(x0 + C / 2, z0 + C / 2, cv);
    if (!center.t || !center.t.coverPx || R.inCore(x0, z0)) return out;
    const n = 70;
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * C, z = z0 + rnd() * C, r1 = rnd(), r2 = rnd();
      const c = this.coverAt(x, z, cv);
      if (!c.t) continue;
      let kind = null;
      const pg = c.g, pf = c.f, pw = c.w;
      let photo = null;
      if (r1 < pg * 0.85) kind = r2 < 0.035 ? 'flower' : 'grass';
      else if (r1 < pg * 0.85 + pf) {
        photo = this.photoAt(x, z, c.t);
        const greenF = photo ? photo[1] - Math.max(photo[0], photo[2]) * 0.95 : 0;
        if (greenF > 0.01) {
          // Saat in Reihen (0,75 m): nur nahe der Reihenmitte
          const acr = -x * Math.sin(c.dir) + z * Math.cos(c.dir);
          if (Math.abs(((acr / 0.75) % 1 + 1) % 1 - 0.5) < 0.22) kind = 'crop'; else if (r2 < 0.15) kind = 'grass';
        } else if (r2 < 0.018) kind = 'grass';
      } else if (r1 < pg * 0.85 + pf + pw * 0.9) kind = r2 < 0.22 ? 'fern' : r2 < 0.45 ? 'grass' : null;
      else if (r2 < 0.12 && !c.t.town) kind = 'grass';
      if (!kind) continue;
      if (R.nearRoad(x, z, 0.6, c.t) || R.insideBuilding(x, z, 0.3, c.t) || this.onTrack(x, z, c.t, kind === 'grass' ? -0.9 : 0.2)) continue;
      if (c.t.waterAll && !c.t.waterAll.empty && c.t.waterAll.carveAt(x, z) > 0) continue;
      const y = R.heightAt(x, z);
      photo = photo || this.photoAt(x, z, c.t) || [0.4, 0.45, 0.3];
      // Farbe aus dem Luftbild (linear umgerechnet), zu natürlichem Grün hin gezogen
      const lr = Math.pow(photo[0], 2.2), lg = Math.pow(photo[1], 2.2), lb = Math.pow(photo[2], 2.2);
      let col;
      if (kind === 'grass') col = [0.05 + lr * 0.35, 0.095 + lg * 0.45, 0.03 + lb * 0.2];
      else if (kind === 'crop') col = [0.06 + lr * 0.3, 0.1 + lg * 0.38, 0.035 + lb * 0.18];
      else if (kind === 'fern') col = [0.07, 0.13, 0.04];
      else col = [0.85, 0.85, 0.85];
      const v = 0.85 + rnd() * 0.3;
      out.push(kind, x, y - 0.03, z, rnd() * 6.283, (kind === 'crop' ? 0.9 : 0.7) + rnd() * 0.6, col[0] * v, col[1] * v, col[2] * v);
    }
    return out;
  }
  // Jedes Bild: Zellen um die Kamera bereithalten und die Instanzen neu füllen, wenn die Kamera eine Zelle weiter ist
  update(cx, cz, enabled) {
    const C = LAND.cell, ix = Math.floor(cx / C), iz = Math.floor(cz / C);
    if (!enabled) { for (const k in this.kinds) this.kinds[k].m.count = 0; this.coverCenter = null; return; }
    const key = ix + ',' + iz;
    if (key === this.coverCenter && !this.dirty) return;
    this.coverCenter = key; this.dirty = false;
    const rc = Math.ceil(LAND.coverR / C);
    const keep = new Set();
    const t0 = performance.now();
    let pending = false;
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      if ((dx * dx + dz * dz) * C * C > (LAND.coverR + C) * (LAND.coverR + C)) continue;
      const k = (ix + dx) + ',' + (iz + dz);
      keep.add(k);
      if (!this.cells.has(k)) {
        if (performance.now() - t0 > 6 && Math.abs(dx) + Math.abs(dz) > 3) { pending = true; continue; } // Rest im nächsten Bild
        this.cells.set(k, this.makeCell(ix + dx, iz + dz));
      }
    }
    for (const k of this.cells.keys()) if (!keep.has(k)) this.cells.delete(k);
    if (pending) { this.dirty = true; this.coverCenter = null; }
    // Instanzen schreiben
    const M = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), s = this._s || (this._s = new THREE.Vector3()), p = this._p || (this._p = new THREE.Vector3()), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const cnt = {};
    for (const k in this.kinds) cnt[k] = 0;
    for (const list of this.cells.values()) for (let i = 0; i < list.length; i += 9) {
      const kind = list[i], K = this.kinds[kind], n = cnt[kind];
      if (n >= K.m.instanceMatrix.count) continue;
      q.setFromAxisAngle(up, list[i + 4]); p.set(list[i + 1], list[i + 2], list[i + 3]); s.setScalar(list[i + 5]);
      M.compose(p, q, s); K.m.setMatrixAt(n, M);
      col.setRGB(list[i + 6], list[i + 7], list[i + 8]); K.m.setColorAt(n, col);
      cnt[kind] = n + 1;
    }
    for (const k in this.kinds) {
      const m = this.kinds[k].m; m.count = cnt[k];
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    }
  }
  // nach dem Neubau einer Kachel die Zellen darin neu würfeln
  tileChanged(t) {
    const C = LAND.cell;
    for (const k of [...this.cells.keys()]) {
      const [a, b] = k.split(',').map(Number);
      if (a * C + C > t.x0 && a * C < t.x1 && b * C + C > t.z0 && b * C < t.z1) this.cells.delete(k);
    }
    this.coverCenter = null;
  }
}

// ---------- Feld- und Waldwege, Hecken und Baumreihen (data/region-rural.js) ----------
// Linien des ganzen Landkreises nach Kacheln aufteilen (Abschnitte nach ihrer Mitte)
Landscape.splitRural = function (region, R) {
  const map = new Map();
  const dec = (a, from) => { const o = []; let x = 0, z = 0; for (let k = from; k < a.length; k += 2) { x += a[k]; z += a[k + 1]; o.push(x / 10, z / 10); } return o; };
  const put = (kind, p, extra) => {
    let run = null, key = null;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const mx = (p[k] + p[k + 2]) / 2, mz = (p[k + 1] + p[k + 3]) / 2;
      if (region.inCore(mx, mz)) { run = null; continue; }
      const [ti, tj] = region.tileOf(mx, mz), kk = tileKey(ti, tj);
      if (run && kk === key) { run.p.push(p[k + 2], p[k + 3]); continue; }
      key = kk;
      if (!map.has(kk)) map.set(kk, { tracks: [], hedges: [], rows: [] });
      run = Object.assign({ p: [p[k], p[k + 1], p[k + 2], p[k + 3]] }, extra);
      map.get(kk)[kind].push(run);
    }
  };
  for (const tr of R.tracks || []) put('tracks', dec(tr, 2), { w: tr[0] / 10, s: tr[1] });
  for (const h of R.hedges || []) put('hedges', dec(h, 0));
  for (const r of R.rows || []) put('rows', dec(r, 0));
  return map;
};

Landscape.prototype.trackMaterial = function (surf) {
  this._trackMats = this._trackMats || [];
  if (this._trackMats[surf]) return this._trackMats[surf];
  const col = ['#9a8f7c', '#7d6a52', '#55575a'][surf];
  const m = new THREE.MeshLambertMaterial({ color: col, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, alphaToCoverage: true, alphaTest: 0.5 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { grassTex: { value: this.T.grass }, soilTex: { value: this.T.soil }, detailMap: { value: this.detail }, uWet: ATMO.uniforms.uWet });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec2 vTU;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTU = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTW; varying vec2 vTU;
        uniform sampler2D grassTex, soilTex, detailMap;
        uniform float uWet;
        float tH = 0.0;
        ${LAND_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float u = vTU.x;                                   // quer: 0 links … 1 rechts
          vec2 wp = vTW.xz;
          float n = ln(wp / 2.3), n2 = ln(wp / 0.6);
          vec3 soil = texture2D(soilTex, wp / 2.0).rgb;
          vec3 grass = texture2D(grassTex, wp / 2.4).rgb * vec3(0.9, 1.0, 0.8);
          // zwei Fahrspuren (bei 25 % und 75 %), dazwischen und am Rand Gras
          float rut = min(abs(u - 0.27), abs(u - 0.73));
          float track = 1.0 - smoothstep(0.1, 0.2 + 0.06 * n, rut);
          vec3 c = diffuseColor.rgb * (0.75 + 0.5 * texture2D(detailMap, wp / 1.3).r) * (0.85 + 0.3 * n2);
          #if SURF == 1
            c = mix(grass * 0.9, soil * 1.1, track);
            tH = track;
          #elif SURF == 0
            c = mix(mix(c, grass, 0.55 * (1.0 - smoothstep(0.08, 0.16, abs(u - 0.5)))), c * 0.82, track * 0.6);
            tH = n2 * 0.5;
          #else
            c *= 0.9 + 0.2 * smoothstep(0.4, 0.6, n);
          #endif
          // Ränder unregelmäßig in die Wiese übergehend
          float edge = min(u, 1.0 - u);
          diffuseColor.rgb = mix(grass * 0.85, c, smoothstep(0.03, 0.12, edge + (n - 0.5) * 0.08));
          diffuseColor.a = smoothstep(0.0, 0.05, edge + (n2 - 0.5) * 0.06) > 0.5 ? 1.0 : 0.0;
          diffuseColor.rgb *= 1.0 - 0.3 * uWet;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(tH), hy = dFdy(tH);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * 0.05);
        }`);
    sh.defines = sh.defines || {};
    sh.fragmentShader = '#define SURF ' + surf + '\n' + sh.fragmentShader;
  };
  m.customProgramCacheKey = () => 'track' + surf;
  this._trackMats[surf] = m;
  return m;
};

// Wege einer Kachel als Bänder auf dem Gelände (UV: quer 0..1, längs in Metern)
Landscape.prototype.buildTracks = function (t, list) {
  const R = this.region, W = this.world;
  const buckets = [new Bucket(), new Bucket(), new Bucket()];
  const white = new THREE.Color('#ffffff');
  t.trackGrid = new U.Grid(25);
  for (const tr of list) {
    const pts = W.resample(tr.p, 3), n = pts.length / 2, half = tr.w / 2;
    if (n < 2) continue;
    for (let k = 0; k + 3 < tr.p.length; k += 2) {
      const ax = tr.p[k], az = tr.p[k + 1], bx = tr.p[k + 2], bz = tr.p[k + 3];
      t.trackGrid.insert({ ax, az, bx, bz, w: tr.w }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }
    const L = [], Rr = [];
    let along = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const x = pts[i * 2], z = pts[i * 2 + 1];
      if (i) along += Math.hypot(x - pts[i * 2 - 2], z - pts[i * 2 - 1]);
      const lx = x - tz * half, lz = z + tx * half, rx = x + tz * half, rz = z - tx * half;
      L.push([lx, R.heightAt(lx, lz) + 0.05, lz, along]); Rr.push([rx, R.heightAt(rx, rz) + 0.05, rz, along]);
    }
    const B = buckets[tr.s] || buckets[0];
    for (let i = 0; i < n - 1; i++) {
      // nicht über Straßen zeichnen (dort liegt die Fahrbahn)
      const mx = (L[i][0] + Rr[i][0]) / 2, mz = (L[i][2] + Rr[i][2]) / 2;
      if (R.nearRoad(mx, mz, 0.3, t)) continue;
      B.tri(L[i], Rr[i], Rr[i + 1], white, [0, L[i][3]], [1, Rr[i][3]], [1, Rr[i + 1][3]], 0, 1, 0);
      B.tri(L[i], Rr[i + 1], L[i + 1], white, [0, L[i][3]], [1, Rr[i + 1][3]], [0, L[i + 1][3]], 0, 1, 0);
    }
  }
  buckets.forEach((b, s) => {
    const g = b.geometry();
    if (!g) return;
    const m = new THREE.Mesh(g, this.trackMaterial(s));
    m.receiveShadow = true;
    t.group.add(m);
  });
};
// liegt der Punkt auf einem Feldweg?
Landscape.prototype.onTrack = function (x, z, t, margin = 0.5) {
  if (!t || !t.trackGrid) return false;
  for (const s of t.trackGrid.query(x, z, 4, this._tq || (this._tq = []))) {
    const c = U.closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
    if (Math.hypot(c[0] - x, c[1] - z) < s.w / 2 + margin) return true;
  }
  return false;
};

// ---------- Dörfer: Gärten, Zäune, Hecken, Einfahrten, Rundballen ----------
const GARDEN_HOUSES = new Set(['house', 'detached', 'residential', 'yes', 'semidetached_house', 'terrace', 'farm', 'bungalow', 'apartments']);
Landscape.prototype.villageAssets = function () {
  if (this._village) return this._village;
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  // Zaunfeld 2 m lang (x = 0 … 2), Pfosten am Anfang
  const picket = [box(0.09, 1.05, 0.09, 0, 0.52, 0), box(2, 0.07, 0.03, 1, 0.28, -0.05), box(2, 0.07, 0.03, 1, 0.78, -0.05)];
  for (let i = 0; i < 11; i++) picket.push(box(0.07, 0.95, 0.025, 0.12 + i * 0.172, 0.47, -0.08));
  const rail = [box(0.1, 1.0, 0.1, 0, 0.5, 0)];
  for (const y of [0.3, 0.6, 0.9]) rail.push(box(2, 0.1, 0.04, 1, y, -0.06));
  const bale = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14); bale.rotateZ(Math.PI / 2); bale.translate(0, 0.75, 0);
  this._village = {
    picket: U.mergeParts(picket.map(g => [g, 0, 0, 0])), rail: U.mergeParts(rail.map(g => [g, 0, 0, 0])),
    bale: U.mergeParts([[bale, 0, 0, 0]]),
    woodMat: new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }),
    baleMat: new THREE.MeshLambertMaterial({ color: '#c9b277', vertexColors: true }),
  };
  return this._village;
};
// Gärten um Wohnhäuser: Zaun zur Straße mit Tor und Einfahrt, an den anderen Seiten Hecke oder Lattenzaun,
// Obstbäume und Büsche im Garten (gehen als Punkte an buildTrees). Rundballen an Scheunen.
Landscape.prototype.buildVillage = function (t, pts, free) {
  const R = this.region, A = this.villageAssets(), rnd = U.rng(t.key * 101 + 9);
  const fences = { picket: [], rail: [] }, bales = [];
  const drive = new Bucket(), white = new THREE.Color('#ffffff');
  const houses = t.buildings.filter(b => GARDEN_HOUSES.has(b.t) || FARM_TYPES.has(b.t));
  for (const b of houses) {
    const cx = (b.bb.minX + b.bb.maxX) / 2, cz = (b.bb.minZ + b.bb.maxZ) / 2;
    if (FARM_TYPES.has(b.t)) {
      // Rundballen neben Scheunen
      if (rnd() < 0.55) {
        const n = 1 + Math.floor(rnd() * 4), a = rnd() * 6.28, d = Math.max(b.bb.maxX - b.bb.minX, b.bb.maxZ - b.bb.minZ) / 2 + 3;
        for (let k = 0; k < n; k++) {
          const x = cx + Math.cos(a) * d + Math.cos(a + 1.57) * (k * 1.7), z = cz + Math.sin(a) * d + Math.sin(a + 1.57) * (k * 1.7);
          if (free(x, z, 1)) bales.push([x, z, a]);
        }
      }
      continue;
    }
    const ring = b.p, area = Math.abs(U.polyArea(ring));
    if (area < 40 || area > 420) continue;
    // Hauptrichtung des Hauses (längste Kante) und Ausdehnung in diesem Rahmen
    let best = 0, ang = 0;
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length, dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1], l = dx * dx + dz * dz;
      if (l > best) { best = l; ang = Math.atan2(dz, dx); }
    }
    const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      const dx = ring[i] - cx, dz = ring[i + 1] - cz, u = dx * ux + dz * uz, v = dx * vx + dz * vz;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const gu = 4 + rnd() * 5, gv = 5 + rnd() * 6;
    u0 -= gu; u1 += gu; v0 -= gv; v1 += gv;
    const P = (u, v) => [cx + ux * u + vx * v, cz + uz * u + vz * v];
    const corners = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    // welche Seite zeigt zur Straße?
    const road = R.nearestRoad(cx, cz, 45, null);
    let front = -1, fd = Infinity;
    if (road) for (let s = 0; s < 4; s++) {
      const a = corners[s], c = corners[(s + 1) % 4], mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, d = Math.hypot(mx - road.x, mz - road.z);
      if (d < fd) { fd = d; front = s; }
    }
    const style = rnd() < 0.55 ? 'picket' : 'rail';
    const backHedge = rnd() < 0.5;
    // Nachbarn: Zaun nur, wo der Punkt näher an diesem Haus liegt als an einem anderen
    const others = [];
    for (const tt of R.tilesNear(cx, cz, 40)) for (const o of tt.polyGrid.query(cx, cz, 35, [])) if (o !== b && !others.includes(o)) others.push(o);
    const mine = (x, z) => { const d0 = Math.hypot(x - cx, z - cz); for (const o of others) if (Math.hypot(x - (o.bb.minX + o.bb.maxX) / 2, z - (o.bb.minZ + o.bb.maxZ) / 2) < d0 - 1) return false; return true; };
    for (let s = 0; s < 4; s++) {
      const a = corners[s], c = corners[(s + 1) % 4], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const dx = (c[0] - a[0]) / L, dz = (c[1] - a[1]) / L;
      const isFront = s === front, gate = isFront ? L * (0.25 + rnd() * 0.5) : -99;
      if (isFront && road) {
        // Einfahrt vom Tor zum Haus
        const gx = a[0] + dx * gate, gz = a[1] + dz * gate, hx = cx + (gx - cx) * 0.45, hz = cz + (gz - cz) * 0.45;
        const ex = road.x + (gx - road.x) * 0.1, ez = road.z + (gz - road.z) * 0.1;
        const ddx = hx - ex, ddz = hz - ez, dl = Math.hypot(ddx, ddz);
        if (dl > 2 && dl < 40) {
          const nx = -ddz / dl * 1.6, nz = ddx / dl * 1.6, y = p => R.heightAt(p[0], p[2]) + 0.04;
          const q = [[ex + nx, 0, ez + nz], [ex - nx, 0, ez - nz], [hx - nx, 0, hz - nz], [hx + nx, 0, hz + nz]].map(p => [p[0], y(p), p[2]]);
          drive.tri(q[0], q[1], q[2], white, [0, 0], [1, 0], [1, dl], 0, 1, 0);
          drive.tri(q[0], q[2], q[3], white, [0, 0], [1, dl], [0, dl], 0, 1, 0);
        }
      }
      for (let d = 0; d + 1.9 < L; d += 2) {
        if (Math.abs(d + 1 - gate) < 2.2) continue;
        const x = a[0] + dx * (d + 1), z = a[1] + dz * (d + 1);
        if (!mine(x, z) || R.insideBuilding(x, z, 0.8, t) || R.nearRoad(x, z, 0.9, t) || this.onTrack(x, z, t, 0.4)) continue;
        if (!isFront && backHedge) {
          if (rnd() < 0.85) pts.push([x - dx * 0.5, z - dz * 0.5, 2, 0.55 + rnd() * 0.25], [x + dx * 0.5, z + dz * 0.5, 2, 0.55 + rnd() * 0.25]);
          continue;
        }
        fences[isFront ? 'picket' : style].push([a[0] + dx * d, a[1] + dz * d, Math.atan2(-dz, dx)]);
      }
    }
    // Obstbäume und Büsche im Garten hinter dem Haus
    const back = front >= 0 ? (front + 2) % 4 : Math.floor(rnd() * 4);
    const ba = corners[back], bc = corners[(back + 1) % 4];
    for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) {
      const f = 0.2 + rnd() * 0.6, x = ba[0] + (bc[0] - ba[0]) * f + (cx - ba[0]) * 0.18, z = ba[1] + (bc[1] - ba[1]) * f + (cz - ba[1]) * 0.18;
      if (free(x, z, 1.5)) pts.push([x, z, rnd() < 0.18 ? 1 : rnd() < 0.5 ? 2 : 0, 0.5 + rnd() * 0.3]);
    }
  }
  const meshes = [];
  const cols = { picket: ['#ece8df', '#d8d2c4', '#7a5a3c', '#6e7466'], rail: ['#8a6a48', '#6f5438', '#9c8466'] };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
  for (const kind of ['picket', 'rail']) {
    const list = fences[kind];
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(A[kind], A.woodMat, list.length);
    const c = new THREE.Color(), col = cols[kind], pick = U.rng(t.key + list.length);
    list.forEach((f, i) => {
      q.setFromAxisAngle(up, f[2]); ps.set(f[0], R.heightAt(f[0], f[1]) - 0.05, f[1]);
      m4.compose(ps, q, one); m.setMatrixAt(i, m4);
      m.setColorAt(i, c.set(col[Math.floor(pick() * col.length)]));
    });
    meshes.push(m);
  }
  if (bales.length) {
    const m = new THREE.InstancedMesh(A.bale, A.baleMat, bales.length);
    bales.forEach((b, i) => { q.setFromAxisAngle(up, b[2]); ps.set(b[0], R.heightAt(b[0], b[1]) - 0.05, b[1]); m4.compose(ps, q, one); m.setMatrixAt(i, m4); });
    meshes.push(m);
  }
  const g = drive.geometry();
  if (g) { const m = new THREE.Mesh(g, this.trackMaterial(0)); meshes.push(m); }
  for (const m of meshes) { m.castShadow = !!m.isInstancedMesh; m.receiveShadow = true; if (m.isInstancedMesh) m.computeBoundingSphere(); t.group.add(m); }
  return meshes;
};
