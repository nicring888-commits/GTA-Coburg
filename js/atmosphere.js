// Himmel, Wetter und Licht: Himmelskuppel mit Sonne, Wolken und Sternen, fließender Tag-Nacht-Wechsel,
// Wetter (klar, wolkig, bedeckt, Regen, Nebel) mit weichen Übergängen, Regentropfen, nasse Straßen und ein
// Umgebungsbild (PMREM) für Spiegelungen in Autolack, Glas und Wasser.
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
  fog: { name: 'Nebel', cloud: 0.7, dark: 0.35, vis: 0.14, rain: 0, sun: 0.35 },
};
const WEATHER_ORDER = ['clear', 'cloudy', 'overcast', 'rain', 'fog'];
const WEATHER_ODDS = { clear: 0.38, cloudy: 0.3, overcast: 0.12, rain: 0.13, fog: 0.07 };

// Farben und Lichtstärken für Tag und Nacht (Tag bei klarem Wetter; Bewölkung mischt Grau hinein)
const SKY_DAY = { top: '#3d74c0', horizon: '#c8dbec', ground: '#6b6a5e', sun: '#fff1dc', sunI: 2.8, hemiSky: '#cfe2ff', hemiGround: '#7f7a68', hemiI: 1.7 };
const SKY_GREY = { top: '#8792a0', horizon: '#b4bcc4', ground: '#5f5f5a', hemiSky: '#c4ccd6' };
const SKY_NIGHT = { top: '#02040b', horizon: '#141c30', ground: '#0b0d12', sun: '#8fa6ff', sunI: 0.22, hemiSky: '#4a5a8a', hemiGround: '#151515', hemiI: 0.26 };

class Atmosphere {
  // ctx: { scene, renderer, sun, hemi, sunDir (Vector3, zur Sonne) }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.night = 0; this.nightTarget = 0;
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
        uniform float uCover, uDark, uNight, uTime;
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
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  // Regen: Striche in einem Würfel um die Kamera, im Shader bewegt (keine Arbeit auf der CPU)
  makeRain() {
    const N = 7000, seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), rnd = U.rng(313);
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
          p.y -= aEnd * 0.55; p.x -= aEnd * 0.05;
          vA = 1.0 - aEnd * 0.6;
          // in der Ferne ausblenden
          vA *= 1.0 - smoothstep(10.0, 18.0, length(p - uCam));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uAmount; uniform vec3 uColor;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor, 0.32 * uAmount * vA); }`,
    });
    const rain = new THREE.LineSegments(g, m);
    rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 10;
    return rain;
  }

  setNight(on, instant) {
    this.nightTarget = on ? 1 : 0;
    if (instant) this.night = this.nightTarget;
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
    this.night += U.clamp(this.nightTarget - this.night, -dt / 3, dt / 3);
    if (force) this.night = this.nightTarget;
    const n = this.night, g = w.dark, C = this.c;

    // Himmelsfarben: Tag (klar → grau), dann zur Nacht
    const mix3 = (out, a, b, c2, tb, tc) => out.set(a).lerp(C.tmp.set(b), tb).lerp(C.tmp.set(c2), tc);
    mix3(C.top, SKY_DAY.top, SKY_GREY.top, SKY_NIGHT.top, g, n);
    mix3(C.horizon, SKY_DAY.horizon, SKY_GREY.horizon, SKY_NIGHT.horizon, g, n);
    mix3(C.ground, SKY_DAY.ground, SKY_GREY.ground, SKY_NIGHT.ground, g * 0.5, n);
    mix3(C.hemiSky, SKY_DAY.hemiSky, SKY_GREY.hemiSky, SKY_NIGHT.hemiSky, g, n);
    C.hemiGround.set(SKY_DAY.hemiGround).lerp(C.tmp.set(SKY_NIGHT.hemiGround), n);
    C.sun.set(SKY_DAY.sun).lerp(C.tmp.set(SKY_NIGHT.sun), n);
    C.cloud.set('#ffffff').lerp(C.tmp.set('#9aa1aa'), g).lerp(C.tmp.set('#1c2232'), n);
    C.shade.set('#a9b3c0').lerp(C.tmp.set('#5d636c'), g).lerp(C.tmp.set('#0b0e16'), n);

    const su = this.skyMat.uniforms;
    su.uTop.value.copy(C.top); su.uHorizon.value.copy(C.horizon); su.uGround.value.copy(C.ground);
    su.uSunCol.value.copy(C.sun); su.uCloudCol.value.copy(C.cloud); su.uCloudShade.value.copy(C.shade);
    su.uCover.value = w.cloud; su.uDark.value = g; su.uNight.value = n; su.uTime.value = this.time;

    // Licht: Bewölkung schwächt die Sonne (weichere Schatten), das Himmelslicht nimmt etwas zu
    const dayI = SKY_DAY.sunI * w.sun;
    this.sun.intensity = U.lerp(dayI, SKY_NIGHT.sunI * (1 - g * 0.6), n);
    this.sun.color.copy(C.sun);
    this.hemi.intensity = U.lerp(SKY_DAY.hemiI * (1 + (1 - w.sun) * 0.35), SKY_NIGHT.hemiI, n);
    this.hemi.color.copy(C.hemiSky); this.hemi.groundColor.copy(C.hemiGround);

    // Nebel und Sichtweite: klarer Tag weit, Regen und Nebel nah
    const fog = this.scene.fog;
    let far = U.lerp(2700 * w.vis + 180, 1100 * Math.min(1, w.vis * 1.6) + 150, n);
    // Smartphones bauen das Umland nur in einem kleineren Umkreis: Nebel davor, damit kein Rand zu sehen ist
    if (window.QUALITY && window.QUALITY.fogFar) far = Math.min(far, window.QUALITY.fogFar);
    fog.far = far; fog.near = Math.min(far * 0.12, 320);
    fog.color.copy(C.horizon).lerp(C.tmp.set('#9aa2aa'), (1 - w.vis) * 0.5 * (1 - n));
    this.scene.background.copy(fog.color);

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
    const key = [this.night, this.w.cloud, this.w.dark].map(v => Math.round(v * 12)).join(',');
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
