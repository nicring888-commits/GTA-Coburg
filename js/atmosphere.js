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

// Farben und Lichtstärken für Tag und Nacht (Tag bei klarem Wetter; Bewölkung mischt Grau hinein)
const SKY_DAY = { top: '#3d74c0', horizon: '#c8dbec', ground: '#6b6a5e', sun: '#fff1dc', sunI: 2.8, hemiSky: '#cfe2ff', hemiGround: '#7f7a68', hemiI: 1.7 };
const SKY_GREY = { top: '#8792a0', horizon: '#b4bcc4', ground: '#5f5f5a', hemiSky: '#c4ccd6' };
const SKY_DUSK = { top: '#3b5287', horizon: '#f2a46e', ground: '#5a4a44', sun: '#ffa660', sunI: 2.1, hemiSky: '#d6b9b0', hemiGround: '#6b5546', hemiI: 1.15 };
// Nacht: Mondlicht bläulich, am Horizont der orange Schein der Stadtbeleuchtung
const SKY_NIGHT = { top: '#03060f', horizon: '#2a2530', ground: '#0d0e12', sun: '#8fa6ff', sunI: 0.3, hemiSky: '#5a6a9a', hemiGround: '#2a2218', hemiI: 0.48 };

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
    this.skyMat = this.makeSkyMaterial();
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), this.skyMat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    this.scene.add(this.dome);
    this.rain = this.makeRain();
    this.scene.add(this.rain);
    this.scene.background = new THREE.Color(SKY_DAY.horizon);
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
    const n = this.night, g = w.dark, C = this.c, gd = this.golden * (1 - g * 0.7);

    // Himmelsfarben: Tag (klar → grau), dann zur Nacht
    // Tag → Abendrot → Bewölkung (grau) → Nacht
    const mix4 = (out, key, tg) => out.set(SKY_DAY[key]).lerp(C.tmp.set(SKY_DUSK[key]), gd)
      .lerp(C.tmp.set(SKY_GREY[key] || SKY_DAY[key]), tg).lerp(C.tmp.set(SKY_NIGHT[key]), n);
    mix4(C.top, 'top', g);
    mix4(C.horizon, 'horizon', g);
    mix4(C.ground, 'ground', g * 0.5);
    mix4(C.hemiSky, 'hemiSky', g);
    C.hemiGround.set(SKY_DAY.hemiGround).lerp(C.tmp.set(SKY_DUSK.hemiGround), gd).lerp(C.tmp.set(SKY_NIGHT.hemiGround), n);
    C.sun.set(SKY_DAY.sun).lerp(C.tmp.set(SKY_DUSK.sun), this.golden).lerp(C.tmp.set(SKY_NIGHT.sun), n);
    C.cloud.set('#ffffff').lerp(C.tmp.set('#ffc59a'), gd).lerp(C.tmp.set('#9aa1aa'), g).lerp(C.tmp.set('#1c2232'), n);
    C.shade.set('#a9b3c0').lerp(C.tmp.set('#8a6f80'), gd).lerp(C.tmp.set('#5d636c'), g).lerp(C.tmp.set('#0b0e16'), n);

    const su = this.skyMat.uniforms;
    su.uTop.value.copy(C.top); su.uHorizon.value.copy(C.horizon); su.uGround.value.copy(C.ground);
    su.uSunCol.value.copy(C.sun); su.uSunDir.value.copy(n > 0.5 ? this.sunDir : this.sunTrue); su.uCloudCol.value.copy(C.cloud); su.uCloudShade.value.copy(C.shade);
    su.uCover.value = w.cloud; su.uDark.value = g; su.uNight.value = n; su.uTime.value = this.time;

    // Licht: Bewölkung schwächt die Sonne (weichere Schatten), das Himmelslicht nimmt etwas zu
    const dayI = U.lerp(SKY_DAY.sunI, SKY_DUSK.sunI, this.golden) * w.sun * U.smoothstep(-4, 5, elev);
    this.sun.intensity = U.lerp(dayI, SKY_NIGHT.sunI * (1 - g * 0.6), U.smoothstep(0.6, 1, n));
    this.sun.color.copy(C.sun);
    this.hemi.intensity = U.lerp(U.lerp(SKY_DAY.hemiI, SKY_DUSK.hemiI, this.golden) * (1 + (1 - w.sun) * 0.35), SKY_NIGHT.hemiI, n);
    this.hemi.color.copy(C.hemiSky); this.hemi.groundColor.copy(C.hemiGround);

    // Nebel und Sichtweite: klarer Tag weit, Regen und Nebel nah
    const fog = this.scene.fog;
    const far = U.lerp(2700 * w.vis + 180, 1100 * Math.min(1, w.vis * 1.6) + 150, n);
    fog.far = far; fog.near = Math.min(far * 0.12, 320);
    fog.color.copy(C.horizon).lerp(C.tmp.set('#9aa2aa'), (1 - w.vis) * 0.5 * (1 - n));
    this.scene.background.copy(fog.color);
    su.uFogCol.value.copy(fog.color); su.uHaze.value = U.clamp((1 - w.vis) * 1.1, 0, 0.97);
    // Mit Nachbearbeitung: Nebel dort (Höhennebel, Sonnenstreuung), in den Materialien aus
    const post = this.post;
    if (post && post.enabled) {
      const P = post.params;
      P.fogCol.copy(fog.color); P.fogDensity = 2.1 / far;
      P.sunDir.copy(this.sunTrue); P.sunCol.copy(C.sun).multiplyScalar(1 + this.golden * 1.5);
      P.sunVis = w.sun * (1 - n) * (1 - g * 0.6); P.night = n; P.wet = this.wet;
      post.exposure = U.lerp(U.lerp(1.08, 1.2, this.golden), 1.85, n) * (1 + g * 0.12);
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
    const key = [this.night, this.w.cloud, this.w.dark, this.golden].map(v => Math.round(v * 12)).join(',');
    if (!force && (key === this.envKey || this.envTimer > 0)) return;
    this.envKey = key; this.envTimer = 2;
    const old = this.envRT;
    this.envDome.material = this.skyMat;
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 500);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }

  get weatherName() { return WEATHER[this.kind].name; }
}
