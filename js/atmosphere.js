// Himmel, Wetter und Licht: Himmelskuppel mit Sonne, Wolken und Sternen, Tageszeit mit wanderndem Sonnenstand
// (Morgen, Mittag, Abendrot, Nacht; 1 Spielstunde = 1 Minute), Wetter (klar, wolkig, bedeckt, Regen, Nebel) mit
// weichen Übergängen, Regentropfen, nasse Straßen und ein Umgebungsbild (PMREM) für Spiegelungen in Autolack, Glas
// und Wasser. Mit Nachbearbeitung (js/post.js) wird der Nebel dort als Luftperspektive aus der Tiefe gerechnet.
'use strict';

// Gemeinsame Werte für die Shader der Welt (Fassaden, Straßen, Boden), einmal pro Bild gesetzt
const ATMO = {
  uniforms: {
    uWet: { value: 0 },                              // Nässe 0..1
    uNight: { value: 0 },                            // 0 Tag, 1 Nacht
    uTime: { value: 0 },
    uSkyTop: { value: new THREE.Color('#3a6fb8') },  // für einfache Spiegelungen (Fenster, nasse Straßen)
    uSkyHorizon: { value: new THREE.Color('#c9dcec') },
    uSkyGround: { value: new THREE.Color('#5b5a52') },
  },
};

const WEATHER = {
  clear: { name: 'Klar', cloud: 0.22, dark: 0, vis: 1, rain: 0, sun: 1 },
  cloudy: { name: 'Wolkig', cloud: 0.5, dark: 0.12, vis: 0.85, rain: 0, sun: 0.85 },
  overcast: { name: 'Bedeckt', cloud: 0.92, dark: 0.5, vis: 0.6, rain: 0, sun: 0.28 },
  rain: { name: 'Regen', cloud: 1, dark: 0.72, vis: 0.4, rain: 1, sun: 0.12 },
  fog: { name: 'Nebel', cloud: 0.7, dark: 0.35, vis: 0.08, rain: 0, sun: 0.35 },
};
const WEATHER_ORDER = ['clear', 'cloudy', 'overcast', 'rain', 'fog'];
const WEATHER_ODDS = { clear: 0.38, cloudy: 0.3, overcast: 0.12, rain: 0.13, fog: 0.07 };
// Tageslauf: Aufgang 6 Uhr, Untergang 20 Uhr, Mittag mit 54° Sonnenhöhe; 1 Spielstunde = 1 Minute
const CLOCK = { rise: 6.0, set: 20.0, maxElev: 54, hoursPerSec: 1 / 60 };
const DEG = Math.PI / 180;

// Licht-Tabelle (seit v3.18.0, Grafik-Phase G1, nach dem Vorbild des „Timecycle“ großer Open-World-Spiele): je Uhrzeit
// alle Werte für Himmel, Sonne, Umgebungslicht, Nebel, Belichtung, Bloom und Farblook bei klarem Wetter; dazwischen
// weich gemischt. Bewölkung und Regen mischen danach Grau hinein (SKY_GREY, w.dark).
//   top/horizon/ground: Himmelskuppel · sun/sunI: Sonnenfarbe und -stärke (nachts Mond) · amb/ambGround/ambI:
//   Himmelslicht oben und Rückstrahlung vom Boden (als Kugelflächen-Licht, siehe skyProbe) · fog: Dunstfarbe ·
//   cloud/shade: Wolken hell/dunkel · exp: Belichtung · bloomT/bloom: Schwelle und Stärke des Leuchtens ·
//   sat/curve: Sättigung und S-Kurve · lo/hi: Tönung der Schatten und Lichter (Faktoren um 1) · lift: angehobenes Schwarz
const TIMECYCLE = [
  { t: 0, top: '#040917', horizon: '#2b2633', ground: '#0c0d12', sun: '#93a8ff', sunI: 0.32, amb: '#4a5b92', ambGround: '#2c2219', ambI: 0.5, fog: '#1d202c',
    cloud: '#1c2232', shade: '#0b0e16', exp: 1.9, bloomT: 0.75, bloom: 0.2, sat: 0.86, curve: 0.26, lo: [0.86, 0.95, 1.14], hi: [1.07, 0.97, 0.84], lift: 0.014 },
  { t: 4.6, same: 0 },
  // blaue Stunde vor dem Aufgang
  { t: 5.5, top: '#18295a', horizon: '#b4827a', ground: '#28252d', sun: '#ff9466', sunI: 0.9, amb: '#7d84b2', ambGround: '#43352f', ambI: 0.78, fog: '#8b7f8e',
    cloud: '#d49a8a', shade: '#4a4660', exp: 1.5, bloomT: 0.9, bloom: 0.14, sat: 0.92, curve: 0.24, lo: [0.9, 0.96, 1.1], hi: [1.06, 0.99, 0.9], lift: 0.012 },
  // Sonnenaufgang: tief, warm, lange Schatten
  { t: 6.6, top: '#3a5c9e', horizon: '#ffb27c', ground: '#5a4a44', sun: '#ffa058', sunI: 2.2, amb: '#c6b0aa', ambGround: '#6b5546', ambI: 1.12, fog: '#e2b99c',
    cloud: '#ffc8a0', shade: '#8a7286', exp: 1.24, bloomT: 1.0, bloom: 0.09, sat: 1.08, curve: 0.24, lo: [0.92, 0.97, 1.08], hi: [1.07, 0.99, 0.88], lift: 0.01 },
  { t: 8.2, top: '#3c76c6', horizon: '#d4e3f0', ground: '#6b6a5e', sun: '#ffe7c8', sunI: 2.85, amb: '#bfd6f6', ambGround: '#7c7562', ambI: 1.58, fog: '#c8dbed',
    cloud: '#ffffff', shade: '#a6b1c0', exp: 1.08, bloomT: 1.05, bloom: 0.07, sat: 1.06, curve: 0.22, lo: [0.94, 0.985, 1.05], hi: [1.04, 1.0, 0.93], lift: 0.01 },
  // Mittag: kräftiges Blau, helles fast weißes Licht
  { t: 12.5, top: '#2d69c4', horizon: '#c3dbf0', ground: '#6b6a5e', sun: '#fff3e2', sunI: 3.05, amb: '#c2daff', ambGround: '#857b6a', ambI: 1.62, fog: '#c4d8ec',
    cloud: '#ffffff', shade: '#a9b3c0', exp: 1.04, bloomT: 1.08, bloom: 0.07, sat: 1.07, curve: 0.24, lo: [0.94, 0.985, 1.05], hi: [1.035, 1.0, 0.94], lift: 0.01 },
  { t: 16.5, top: '#3370c2', horizon: '#d6dde4', ground: '#6b6a5e', sun: '#ffe6bc', sunI: 2.9, amb: '#c6d6ef', ambGround: '#82785f', ambI: 1.52, fog: '#ced8e2',
    cloud: '#fffaf2', shade: '#a7afbb', exp: 1.08, bloomT: 1.05, bloom: 0.07, sat: 1.09, curve: 0.24, lo: [0.94, 0.98, 1.05], hi: [1.05, 1.0, 0.91], lift: 0.01 },
  // goldene Stunde
  { t: 18.6, top: '#4266a8', horizon: '#ffb676', ground: '#5c4b40', sun: '#ffab5c', sunI: 2.55, amb: '#d4b8aa', ambGround: '#6e5848', ambI: 1.16, fog: '#e7b892',
    cloud: '#ffc694', shade: '#8f7484', exp: 1.18, bloomT: 1.0, bloom: 0.09, sat: 1.15, curve: 0.25, lo: [0.9, 0.96, 1.1], hi: [1.08, 0.99, 0.86], lift: 0.01 },
  // Sonnenuntergang
  { t: 19.7, top: '#2d3e78', horizon: '#ff8752', ground: '#4a3a38', sun: '#ff763a', sunI: 1.7, amb: '#a68aa0', ambGround: '#5a4440', ambI: 0.95, fog: '#c78876',
    cloud: '#ff9e70', shade: '#5e4a66', exp: 1.34, bloomT: 0.95, bloom: 0.11, sat: 1.13, curve: 0.25, lo: [0.88, 0.95, 1.12], hi: [1.09, 0.97, 0.84], lift: 0.012 },
  // blaue Stunde nach dem Untergang (Mond übernimmt ab ≈ 20:20)
  { t: 20.6, top: '#121b42', horizon: '#76587a', ground: '#1c1a22', sun: '#8c94d2', sunI: 0.4, amb: '#686a9a', ambGround: '#3a2e2a', ambI: 0.64, fog: '#47405a',
    cloud: '#5a4a6a', shade: '#1e1e30', exp: 1.66, bloomT: 0.82, bloom: 0.17, sat: 0.94, curve: 0.26, lo: [0.86, 0.94, 1.14], hi: [1.07, 0.97, 0.86], lift: 0.013 },
  { t: 21.6, same: 0 },
  { t: 24, same: 0 },
];
// Bewölkt/Regen: Himmel und Licht werden grau (gemischt mit w.dark)
const SKY_GREY = { top: '#8792a0', horizon: '#b4bcc4', ground: '#5f5f5a', amb: '#c4ccd6', cloud: '#9aa1aa', shade: '#5d636c' };
const TC_COLORS = ['top', 'horizon', 'ground', 'sun', 'amb', 'ambGround', 'fog', 'cloud', 'shade'];
const TC_NUMS = ['sunI', 'ambI', 'exp', 'bloomT', 'bloom', 'sat', 'curve', 'lift'];
// „same: i“ übernimmt die Werte von Eintrag i; Farben als THREE.Color (linear) vorbereiten
for (const k of TIMECYCLE) {
  if (k.same !== undefined) Object.assign(k, TIMECYCLE[k.same], { t: k.t });
  for (const c of TC_COLORS) if (typeof k[c] === 'string') k[c] = new THREE.Color(k[c]);
}
// Kugelflächen-Licht (SH, 9 Werte) aus einer Himmelsfunktion: Himmelslicht trifft Flächen je nach Richtung verschieden
// (Westseiten abends warm, Oberseiten blau), statt des gleichförmigen Halbkugel-Lichts. Gleiches Maß wie
// THREE.HemisphereLight (Kalibrierung in skyProbe).
const SH_DIRS = (() => {
  const N = 192, out = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
})();
// three.js teilt das Licht der Halbkugel nicht durch π, die Bestrahlung aus SH schon (gemessen, siehe PROJEKT.md v3.18.0)
const PROBE_SCALE = 1 / Math.PI;

class Atmosphere {
  // ctx: { scene, renderer, sun, hemi, sunDir (Vector3, zur Sonne) }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.night = 0;
    this.clock = 12.5;                   // Uhrzeit in Stunden
    this.skipTarget = null;              // Zeitraffer bis zu dieser Uhrzeit (Taste N, Schlafen)
    this.golden = 0;                     // Abend-/Morgenlicht 0..1
    this.sunTrue = new THREE.Vector3();  // echte Sonnenrichtung (Himmel); this.sunDir ist die Lichtrichtung
    this.post = null;                    // PostFX, wenn vorhanden
    this.kind = 'clear';
    this.w = { ...WEATHER.clear };       // aktuelle (gemischte) Wetterwerte
    this.wet = 0;
    this.time = 0;
    this.nextChange = 150 + Math.random() * 150;
    this.auto = true;
    this.c = {
      top: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color(),
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), tmp: new THREE.Color(), cloud: new THREE.Color(), shade: new THREE.Color(),
    };
    // Werte der Licht-Tabelle zur jetzigen Uhrzeit (TIMECYCLE)
    this.tc = { lo: new THREE.Vector3(), hi: new THREE.Vector3() };
    for (const c of TC_COLORS) this.tc[c] = new THREE.Color();
    // Himmelslicht als Kugelflächen-Licht; ersetzt draußen das Halbkugel-Licht (drinnen blendet game.js es aus)
    this.probe = new THREE.LightProbe();
    this.probeOn = !/[?&]probe=0\b/.test(location.search);
    if (this.probeOn) this.scene.add(this.probe);
    this.probeKey = '';
    this.skyMat = this.makeSkyMaterial();
    this.skyMat.userData.node = kit => kit.sky(this.skyMat); // Node-Zwilling für WebGPU (js/tsl-materials.js)
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), this.skyMat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    this.scene.add(this.dome);
    this.rain = this.makeRain();
    this.scene.add(this.rain);
    this.scene.background = new THREE.Color('#c8dbec');
    // Umgebungsbild aus einer eigenen kleinen Szene mit derselben Himmelskuppel
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat);
    this.envScene.add(this.envDome);
    this.envRT = null; this.envKey = ''; this.envTimer = 0;
    this.update(0, null, true);
  }

  makeSkyMaterial() {
    const u = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir.clone() }, uSunCol: { value: new THREE.Color() },
      uCloudCol: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
      uCover: { value: 0.2 }, uDark: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 },
      uFogCol: { value: new THREE.Color() }, uHaze: { value: 0 },
    };
    return new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // immer ganz hinten
        }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunCol, uCloudCol, uCloudShade;
        uniform float uCover, uDark, uNight, uTime, uHaze;
        uniform vec3 uFogCol;
        varying vec3 vDir;
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
          for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
          return v;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uGround, smoothstep(0.0, -0.1, h));
          float mu = max(dot(d, uSunDir), 0.0);
          float clearSky = 1.0 - uDark;
          // Sonnenhof (bei Nacht schwacher Mondhof)
          col += uSunCol * (pow(mu, 5.0) * 0.16 + pow(mu, 48.0) * 0.32) * clearSky * mix(1.0, 0.25, uNight);
          // Dunst am Horizont
          col = mix(col, uHorizon, (1.0 - smoothstep(0.0, 0.18, abs(h))) * 0.35);
          // Sterne
          vec3 sp = d * 260.0; vec3 id = floor(sp); vec3 f = fract(sp) - 0.5;
          float r = hash(id.xy + id.z * 17.13);
          float star = step(0.986, r) * smoothstep(0.16, 0.0, length(f)) * (0.35 + 0.65 * fract(r * 91.7));
          float cover = 0.0;
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.12) * 2.2 + vec2(uTime * 0.006, uTime * 0.0022);
            float n = fbm(uv);
            float e0 = 0.66 - uCover * 0.42;
            cover = smoothstep(e0, e0 + 0.2, n) * smoothstep(0.0, 0.1, h);
            float n2 = fbm(uv + uSunDir.xz * 0.06);
            float lit = clamp(0.62 + (n - n2) * 3.0, 0.15, 1.0);
            vec3 cc = mix(uCloudShade, uCloudCol, lit);
            cc += uSunCol * pow(mu, 7.0) * 0.35 * clearSky * (1.0 - uNight);
            col = mix(col, cc, cover * 0.97);
          }
          col += vec3(0.85, 0.9, 1.0) * star * uNight * (1.0 - cover) * smoothstep(0.02, 0.2, h) * 1.6;
          // Sonne bzw. Mond
          float disk = smoothstep(0.99955, 0.99975, dot(d, uSunDir)) * (1.0 - cover) * clearSky;
          col = mix(col, mix(vec3(14.0, 12.5, 10.5), vec3(1.6, 1.65, 1.8), uNight), disk);
          // Dunst und Nebel verschlucken den Himmel, am Horizont am stärksten
          col = mix(col, uFogCol, uHaze * (1.0 - 0.55 * smoothstep(0.0, 0.8, h)));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  // Regen: Striche in einem Würfel um die Kamera, im Shader bewegt (keine Arbeit auf der CPU)
  makeRain() {
    const N = 14000, seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), rnd = U.rng(313);
    for (let i = 0; i < N; i++) {
      const x = rnd(), y = rnd(), z = rnd();
      for (let k = 0; k < 2; k++) { seed.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color('#aab4bf') } },
      transparent: true, depthWrite: false, fog: false,
      vertexShader: `
        attribute float aEnd;
        uniform float uTime; uniform vec3 uCam;
        varying float vA;
        const float B = 36.0;
        void main() {
          vec3 p = position * B;
          p.y -= uTime * 13.0 * (0.85 + position.x * 0.3);
          p.x += uTime * 1.2;
          p = mod(p - uCam + B * 0.5, B) - B * 0.5 + uCam;
          p.y -= aEnd * 0.42; p.x -= aEnd * 0.04;
          vA = 1.0 - aEnd * 0.6;
          // in der Ferne ausblenden
          vA *= 1.0 - smoothstep(10.0, 18.0, length(p - uCam));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uAmount; uniform vec3 uColor;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor, 0.2 * uAmount * vA); }`,
    });
    m.userData.node = kit => kit.rain(m);
    const rain = new THREE.LineSegments(g, m);
    rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 10;
    return rain;
  }

  // Nacht ein/aus: Zeitraffer (instant: Sprung) auf 22 bzw. 9 Uhr, wenn es nicht schon passt
  setNight(on, instant) {
    if (on === this.isNight && this.skipTarget === null) return;
    const t = on ? 22 : 9;
    if (instant) { this.clock = t; this.skipTarget = null; } else this.skipTarget = t;
  }
  get isNight() { return this.night > 0.5; }
  get timeText() { const h = Math.floor(this.clock), m = Math.floor((this.clock - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

  // Sonnenstand aus der Uhrzeit: Aufgang im Osten, Mittag im Süden (etwas östlich wie in den Luftbildern),
  // Untergang im Westen; nachts sinkt sie bis 25° unter den Horizont. Gibt die Höhe in Grad zurück.
  sunFromClock() {
    const C = CLOCK, t = this.clock;
    const day = (t - C.rise) / (C.set - C.rise);
    const e = day >= 0 && day <= 1 ? Math.sin(Math.PI * day) * C.maxElev * DEG
      : -Math.min((day < 0 ? -day : day - 1) * 90, 25) * DEG;
    const az = (95 + day * 170) * DEG;   // 95° (Ost) … 265° (West), um 12:30 etwa 171° wie die Fotoschatten
    this.sunTrue.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e));
    return e / DEG;
  }
  setWeather(kind, instant) {
    if (!WEATHER[kind]) return;
    this.kind = kind;
    if (instant) { this.w = { ...WEATHER[kind] }; this.wet = WEATHER[kind].rain; }
    this.nextChange = 180 + Math.random() * 240;
  }
  cycleWeather() {
    const i = WEATHER_ORDER.indexOf(this.kind);
    this.setWeather(WEATHER_ORDER[(i + 1) % WEATHER_ORDER.length]);
    return WEATHER[this.kind].name;
  }
  randomWeather() {
    let r = Math.random(), k = 'clear';
    for (const key of WEATHER_ORDER) { r -= WEATHER_ODDS[key]; if (r <= 0) { k = key; break; } }
    return k;
  }

  // dt: Sekunden, camera: zum Mitführen von Kuppel und Regen; force: Umgebungsbild sofort neu
  update(dt, camera, force) {
    this.time += dt;
    // Wetter wechselt von selbst alle paar Minuten
    if (this.auto && (this.nextChange -= dt) <= 0) this.setWeather(this.randomWeather());
    const T = WEATHER[this.kind], w = this.w, k = 1 - Math.exp(-dt / 9); // ≈ 20 s Übergang
    for (const key of ['cloud', 'dark', 'vis', 'rain', 'sun']) w[key] += (T[key] - w[key]) * (force ? 1 : k);
    // nass wird es schnell, trocken langsam
    this.wet += (w.rain > 0.3 ? 1 : 0) * dt / 40 - (w.rain > 0.3 ? 0 : dt / 150);
    this.wet = U.clamp(this.wet, 0, 1);
    // Uhr: normal 1 Stunde pro Minute, im Zeitraffer 2 Stunden pro Sekunde
    if (this.skipTarget !== null) {
      const left = (this.skipTarget - this.clock + 24) % 24;
      const step = Math.min(left, dt * 2);
      this.clock = (this.clock + step) % 24;
      if (left - step < 1e-3) this.skipTarget = null;
    } else this.clock = (this.clock + dt * CLOCK.hoursPerSec) % 24;
    const elev = this.sunFromClock();
    this.night = 1 - U.smoothstep(-7, 2, elev);
    this.golden = (1 - U.smoothstep(2, 20, elev)) * (1 - this.night);
    // Licht kommt tagsüber von der Sonne (nicht flacher als 9°, sonst flimmern die Schatten), nachts vom Mond
    if (elev > -2) this.sunDir.set(this.sunTrue.x, Math.max(this.sunTrue.y, 0.16), this.sunTrue.z).normalize();
    else this.sunDir.set(-0.35, 0.82, -0.45).normalize();
    const n = this.night, g = w.dark, C = this.c, tc = this.lookup(this.clock);

    // Himmelsfarben aus der Licht-Tabelle; Bewölkung mischt Grau hinein (nachts kaum, dort ist alles dunkel)
    const gg = g * (1 - n * 0.85);
    C.top.copy(tc.top).lerp(C.tmp.set(SKY_GREY.top).multiplyScalar(1 - n * 0.9), gg);
    C.horizon.copy(tc.horizon).lerp(C.tmp.set(SKY_GREY.horizon).multiplyScalar(1 - n * 0.85), gg);
    C.ground.copy(tc.ground).lerp(C.tmp.set(SKY_GREY.ground).multiplyScalar(1 - n * 0.85), gg * 0.5);
    C.hemiSky.copy(tc.amb).lerp(C.tmp.set(SKY_GREY.amb).multiplyScalar(1 - n * 0.7), gg);
    C.hemiGround.copy(tc.ambGround);
    C.sun.copy(tc.sun);
    C.cloud.copy(tc.cloud).lerp(C.tmp.set(SKY_GREY.cloud).multiplyScalar(1 - n * 0.85), gg);
    C.shade.copy(tc.shade).lerp(C.tmp.set(SKY_GREY.shade).multiplyScalar(1 - n * 0.85), gg);

    const su = this.skyMat.uniforms;
    su.uTop.value.copy(C.top); su.uHorizon.value.copy(C.horizon); su.uGround.value.copy(C.ground);
    su.uSunCol.value.copy(C.sun); su.uSunDir.value.copy(n > 0.5 ? this.sunDir : this.sunTrue); su.uCloudCol.value.copy(C.cloud); su.uCloudShade.value.copy(C.shade);
    su.uCover.value = w.cloud; su.uDark.value = g; su.uNight.value = n; su.uTime.value = this.time;

    // Licht: Bewölkung schwächt die Sonne (weichere Schatten), das Himmelslicht nimmt etwas zu
    // nachts scheint der Mond (Tabellenwert um Mitternacht), tagsüber die Sonne nach Höhe und Wetter
    const dayI = tc.sunI * w.sun * U.smoothstep(-4, 5, elev), moon = U.smoothstep(0.6, 1, n);
    this.sun.intensity = U.lerp(dayI, TIMECYCLE[0].sunI * (1 - g * 0.6), moon);
    this.sun.color.copy(C.sun).lerp(TIMECYCLE[0].sun, moon);
    const ambI = tc.ambI * (1 + (1 - w.sun) * 0.35 * (1 - n));
    this.hemi.color.copy(C.hemiSky); this.hemi.groundColor.copy(C.hemiGround);
    if (this.probeOn) { this.hemi.intensity = 0; this.skyProbe(C, ambI, w.cloud, elev); } else this.hemi.intensity = ambI;

    // Nebel und Sichtweite: klarer Tag weit, Regen und Nebel nah
    const fog = this.scene.fog;
    // klarer Tag: seit v3.12.0 weiter (ferne Kacheln bis 4,6 km, js/region.js REGION.far), vorher 2700 m
    let far = U.lerp(3600 * w.vis + 180, 1100 * Math.min(1, w.vis * 1.6) + 150, n);
    // Smartphones bauen das Umland nur in einem kleineren Umkreis: Nebel davor, damit kein Rand zu sehen ist
    if (window.QUALITY && window.QUALITY.fogFar) far = Math.min(far, window.QUALITY.fogFar);
    fog.far = far; fog.near = Math.min(far * 0.12, 320);
    // Dunstfarbe aus der Tabelle (weicher als der Horizont, sonst wird abends alles orange)
    fog.color.copy(tc.fog).lerp(C.tmp.set(SKY_GREY.horizon).multiplyScalar(1 - n * 0.85), gg).lerp(C.tmp.set('#9aa2aa'), (1 - w.vis) * 0.5 * (1 - n));
    this.scene.background.copy(fog.color);
    su.uFogCol.value.copy(fog.color); su.uHaze.value = U.clamp((1 - w.vis) * 1.1, 0, 0.97);
    // Mit Nachbearbeitung: Nebel dort (Höhennebel, Sonnenstreuung), in den Materialien aus
    const post = this.post;
    if (post && post.enabled) {
      const P = post.params;
      P.fogCol.copy(fog.color); P.fogDensity = 2.1 / far;
      P.sunDir.copy(this.sunTrue); P.sunCol.copy(C.sun).multiplyScalar(1 + this.golden * 1.5);
      P.sunVis = w.sun * (1 - n) * (1 - g * 0.6); P.night = n; P.wet = this.wet; P.cloud = w.cloud; P.cloudT = this.time; P.golden = this.golden;
      post.exposure = tc.exp * (1 + g * 0.12);
      // Bloom und Farblook aus der Tabelle; trübes Wetter: weniger Sättigung und Kontrast, Tönung schwächer
      P.bloomT = tc.bloomT; P.bloom = tc.bloom * (1 + g * 0.3);
      const G = P.grade || (P.grade = { lo: new THREE.Vector3(), hi: new THREE.Vector3() }), one = this._one || (this._one = new THREE.Vector3(1, 1, 1));
      G.sat = tc.sat * (1 - gg * 0.2); G.curve = tc.curve * (1 - gg * 0.3); G.lift = tc.lift;
      G.lo.copy(tc.lo).lerp(one, gg * 0.5); G.hi.copy(tc.hi).lerp(one, gg * 0.6);
      fog.near = 1e7; fog.far = 2e7;
    }

    const A = ATMO.uniforms;
    A.uWet.value = this.wet; A.uNight.value = n; A.uTime.value = this.time;
    A.uSkyTop.value.copy(C.top); A.uSkyHorizon.value.copy(C.horizon); A.uSkyGround.value.copy(C.ground);

    if (camera) {
      this.dome.position.copy(camera.position);
      const ru = this.rain.material.uniforms;
      ru.uTime.value = this.time; ru.uCam.value.copy(camera.position);
      ru.uAmount.value = w.rain * (1 - n * 0.4);
      ru.uColor.value.set(n > 0.5 ? '#6f7a8c' : '#aab4bf');
      this.rain.visible = w.rain > 0.02;
    }
    this.updateEnv(dt, force);
  }

  // Umgebungsbild nur neu rechnen, wenn sich der Himmel sichtbar geändert hat (höchstens alle 2 s)
  updateEnv(dt, force) {
    this.envTimer -= dt;
    const key = [this.night, this.w.cloud, this.w.dark, this.golden, this.clock / 6].map(v => Math.round(v * 12)).join(',');
    if (!force && (key === this.envKey || this.envTimer > 0)) return;
    this.envKey = key; this.envTimer = 2;
    const old = this.envRT;
    this.envDome.material = this.skyMat;
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 500);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }

  // Werte der Licht-Tabelle zur Uhrzeit h (weich zwischen den Einträgen gemischt)
  lookup(h) {
    const T = TIMECYCLE, o = this.tc;
    let i = 0;
    while (i < T.length - 2 && T[i + 1].t <= h) i++;
    const a = T[i], b = T[i + 1], f = U.smoothstep(0, 1, (h - a.t) / Math.max(1e-6, b.t - a.t));
    for (const c of TC_COLORS) o[c].copy(a[c]).lerp(b[c], f);
    for (const k of TC_NUMS) o[k] = a[k] + (b[k] - a[k]) * f;
    const va = this._va || (this._va = new THREE.Vector3()), vb = this._vb || (this._vb = new THREE.Vector3());
    o.lo.copy(va.fromArray(a.lo)).lerp(vb.fromArray(b.lo), f);
    o.hi.copy(va.fromArray(a.hi)).lerp(vb.fromArray(b.hi), f);
    return o;
  }

  // Kugelflächen-Licht aus einem einfachen Himmelsmodell: oben Himmelslicht (amb), zum Horizont die Horizontfarbe, zur
  // Sonne hin wärmer und heller, unten die Rückstrahlung vom Boden (ambGround). Nur neu, wenn sich etwas merklich ändert.
  skyProbe(C, ambI, cloud, elev) {
    const key = [C.hemiSky.r, C.hemiSky.g, C.hemiSky.b, C.horizon.r, C.horizon.g, C.sun.r, ambI, this.sunTrue.x, this.sunTrue.z, cloud]
      .map(v => Math.round(v * 60)).join(',');
    if (key === this.probeKey) return;
    this.probeKey = key;
    const sh = this.probe.sh, coef = sh.coefficients, basis = this._basis || (this._basis = new Array(9).fill(0));
    for (const c of coef) c.set(0, 0, 0);
    const col = this._pc || (this._pc = new THREE.Color()), hz = this._hz || (this._hz = new THREE.Color());
    // Horizont als Mischung aus Himmelslicht und Horizontfarbe (der Himmelsverlauf selbst ist für Licht zu farbig)
    hz.copy(C.hemiSky).lerp(C.horizon, 0.45);
    const sd = this.sunTrue, glow = Math.max(0, U.smoothstep(-6, 4, elev)) * (1 - cloud * 0.7);
    for (const d of SH_DIRS) {
      if (d.y >= 0) {
        col.copy(hz).lerp(C.hemiSky, Math.pow(d.y, 0.6));
        // Himmel zur Sonne hin heller (Streulicht), auch kurz nach Untergang
        const mu = Math.max(0, d.x * sd.x + d.y * sd.y + d.z * sd.z);
        col.lerp(C.sun, Math.min(0.6, (mu * mu * mu * 0.45 + mu * 0.12) * glow));
      } else col.copy(C.hemiGround).lerp(hz, 0.25 * (1 + d.y));
      THREE.SphericalHarmonics3.getBasisAt(d, basis);
      for (let k = 0; k < 9; k++) { coef[k].x += col.r * basis[k]; coef[k].y += col.g * basis[k]; coef[k].z += col.b * basis[k]; }
    }
    // Maß: gleichförmiges Licht L ergäbe mit THREE.HemisphereLight(L, L, I) dieselbe Helligkeit
    const s = 4 * Math.PI / SH_DIRS.length * ambI * PROBE_SCALE;
    for (const c of coef) c.multiplyScalar(s);
    this.probe.intensity = 1;
  }

  get weatherName() { return WEATHER[this.kind].name; }
}
