// Nachbearbeitung (Post-Processing) ohne Zusatzbibliothek: Die Szene wird in ein HDR-Bild mit Kantenglättung
// (MSAA) gerechnet, dann kommen Umgebungsverdeckung (SSAO), Luftperspektive mit Höhennebel und Sonnenstreuung,
// Leuchten heller Stellen (Bloom), filmische Tonwertkurve und eine Farbkorrektur im Stil von GTA IV dazu.
// Die Auflösung passt sich der Bildrate an (dynamische Auflösung). Qualitätsstufen mit Taste O.
'use strict';

const POST_QUALITY = {
  ultra: { name: 'Ultra', msaa: 4, ratio: 2, ao: 16, bloom: true, post: true, shadow: 4096, minScale: 0.7, ssr: 40 },
  hoch: { name: 'Hoch', msaa: 4, ratio: 1.5, ao: 10, bloom: true, post: true, shadow: 4096, minScale: 0.6, ssr: 28 },
  mittel: { name: 'Mittel', msaa: 2, ratio: 1, ao: 0, bloom: true, post: true, shadow: 2048, minScale: 0.6 },
  niedrig: { name: 'Niedrig', msaa: 0, ratio: 0.85, ao: 0, bloom: false, post: false, shadow: 2048, minScale: 0.6 },
};
const POST_ORDER = ['ultra', 'hoch', 'mittel', 'niedrig'];
const POST_NL = 32; // Laternen, die nachts Flächen beleuchten (Grafik-Phase G8)

const POST_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Gemeinsame Hilfen: Blickraum-Position aus der Tiefe
const POST_COMMON = `
  uniform sampler2D tDepth;
  uniform mat4 uInvProj;
  vec3 viewPosAt(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

// GPU-Zeit je Durchgang (seit v3.18.0, Grafik-Phase G0): EXT_disjoint_timer_query_webgl2, nur wenn PostFX.timing an
// ist (?gfx=stats, js/bench.js). Ergebnisse kommen einige Bilder später; ms = Mittel über die letzten 30 Bilder,
// median() = Median je Durchgang über die gesammelten Bilder (robust gegen einzelne Störungen, für Messläufe).
class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.free = []; this.open = []; this.cur = null;
    this.acc = {}; this.n = 0; this.ms = null;
    this.f = {}; this.hist = [];
  }
  begin(name) {
    if (!this.ext) return;
    this.end();
    const q = this.free.pop() || this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.cur = { q, name };
  }
  end() {
    if (!this.cur) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.open.push(this.cur); this.cur = null;
  }
  // nach dem letzten Durchgang eines Bildes: fertige Abfragen einsammeln
  frame() {
    if (!this.ext) return;
    this.end();
    this.open.push({ frameEnd: true });
    const gl = this.gl, disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.open.length) {
      const o = this.open[0];
      if (o.frameEnd) {
        this.open.shift();
        if (Object.keys(this.f).length) { this.hist.push(this.f); if (this.hist.length > 240) this.hist.shift(); }
        this.f = {};
        if (++this.n >= 30) this.flush();
        continue;
      }
      if (!gl.getQueryParameter(o.q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(o.q, gl.QUERY_RESULT);
      if (!disjoint) { this.acc[o.name] = (this.acc[o.name] || 0) + ns / 1e6; this.f[o.name] = (this.f[o.name] || 0) + ns / 1e6; }
      this.free.push(o.q); this.open.shift();
    }
  }
  flush() {
    const ms = { total: 0 };
    for (const k in this.acc) { ms[k] = +(this.acc[k] / this.n).toFixed(2); ms.total += this.acc[k] / this.n; }
    ms.total = +ms.total.toFixed(2);
    this.ms = ms; this.acc = {}; this.n = 0;
  }
  median() {
    if (!this.hist.length) return null;
    const med = a => { a.sort((x, y) => x - y); return +a[a.length >> 1].toFixed(2); }, out = {};
    const keys = new Set(); for (const f of this.hist) for (const k in f) keys.add(k);
    for (const k of keys) out[k] = med(this.hist.map(f => f[k] || 0));
    // Summe der Mediane: andere Programme auf der GPU (Fenster, Browser) verlängern einzelne Durchgänge zufällig
    out.total = +Object.values(out).reduce((a, b) => a + b, 0).toFixed(2);
    out.frames = this.hist.length;
    return out;
  }
}

class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.gl2 = renderer.capabilities.isWebGL2;
    // Smartphones (js/boot.js) starten niedriger; in der leichten Grafik bleibt es dabei, auch nach Taste O
    const Q = window.QUALITY || {};
    let q = Q.post || 'hoch';
    if (!Q.postForce) try { const s = localStorage.getItem('gta-coburg-quality'); if (POST_QUALITY[s]) q = s; } catch (e) { /* Standard */ }
    this.level = q;
    this.scale = 1;            // dynamische Auflösung (Anteil der vollen Auflösung)
    this.ft = 16.7;            // geglättete Bildzeit (ms)
    this.slowT = 0; this.fastT = 0; this.cool = 0;
    this.exposure = 1.0;
    this.params = {
      fogCol: new THREE.Color('#c8dbec'), sunDir: new THREE.Vector3(0, 1, 0), sunCol: new THREE.Color('#fff1dc'),
      fogDensity: 0.001, fogBase: 0, night: 0, wet: 0, sunVis: 1, cloud: 0.2, cloudT: 0, golden: 0,
      // Bloom und Farblook (seit v3.18.0 aus der Licht-Tabelle in js/atmosphere.js)
      bloomT: 1.05, bloom: 0.07,
      grade: { sat: 0.86, curve: 0.22, lift: 0.012, lo: new THREE.Vector3(0.94, 0.985, 1.05), hi: new THREE.Vector3(1.045, 1, 0.9) },
    };
    // Augenanpassung (seit v3.18.0): mittlere Helligkeit des Bildes, träge nachgeführt; ändert die Belichtung der
    // Tabelle nur in Grenzen (dunkle Gassen heller, Blick in den hellen Himmel dunkler). eye.reset: sofort einstellen
    this.eye = { on: !/[?&]adapt=0\b/.test(location.search), reset: true, min: 0.8, max: 1.3, key: 0.2, rate: 1.4, dt: 1 / 60, last: 0 };
    // Bewegungsunschärfe (seit v3.18.0, Grafik-Phase G9): nur bei schneller Kamerafahrt, nur zum Bildrand hin;
    // abschaltbar (Taste B, Startbildschirm, ?blur=0), Wahl gespeichert unter gta-coburg-blur
    let blurOn = !/[?&]blur=0\b/.test(location.search);
    try { if (localStorage.getItem('gta-coburg-blur') === '0') blurOn = false; } catch (e) { /* ohne Speicher */ }
    this.blur = { on: blurOn, k: 0, prevVP: new THREE.Matrix4(), prevPos: new THREE.Vector3(), t: 0, has: false };
    // Laternenlicht (seit v3.18.0, Grafik-Phase G8): bis zu NL nächste Lampen um die Kamera, Lage im Blickraum; die
    // Liste liefert lampSource(x, z, out) aus game.js (Innenstadt und Ortskacheln des Landkreises)
    this.lamps = { list: [], t: 0, view: Array.from({ length: POST_NL }, () => new THREE.Vector4()), n: 0, source: null };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.makeMaterials();
    this.targets = null;
    this.size = new THREE.Vector2();
    this.apply();
  }

  get q() { return POST_QUALITY[this.level]; }
  get enabled() { return this.q.post && this.gl2; }

  // Bewegungsunschärfe an/aus (Taste B, Startbildschirm); gibt den neuen Zustand zurück
  toggleBlur(on) {
    this.blur.on = on === undefined ? !this.blur.on : !!on;
    try { localStorage.setItem('gta-coburg-blur', this.blur.on ? '1' : '0'); } catch (e) { /* ohne Speicher */ }
    return this.blur.on;
  }

  // Qualitätsstufe wechseln (Taste O); gibt den Namen zurück
  cycle() {
    this.level = POST_ORDER[(POST_ORDER.indexOf(this.level) + 1) % POST_ORDER.length];
    try { localStorage.setItem('gta-coburg-quality', this.level); } catch (e) { /* ohne Speicher */ }
    this.scale = 1; this.cool = 3;
    this.apply();
    return this.q.name;
  }

  apply() {
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.ratio, (window.QUALITY && window.QUALITY.pixelRatio) || Infinity));
    r.setSize(innerWidth, innerHeight);
    // ohne Nachbearbeitung macht der Renderer Tonwertkurve und Farbraum selbst
    r.toneMapping = this.enabled ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.12;
    this.disposeTargets();
    if (this.onChange) this.onChange(this.q);
  }

  disposeTargets() {
    if (!this.targets) return;
    for (const k in this.targets) { const t = this.targets[k]; if (t && t.dispose) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); } }
    this.targets = null;
  }

  ensureTargets() {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const W = Math.max(2, Math.round(this.size.x * this.scale)), H = Math.max(2, Math.round(this.size.y * this.scale));
    const T = this.targets;
    if (T && T.w === W && T.h === H) return T;
    this.disposeTargets();
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const scene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: this.q.msaa, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    scene.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
    const half = (w, h, o) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), o || opt);
    const aoOpt = { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const hw = Math.ceil(W / 2), hh = Math.ceil(H / 2);
    this.targets = {
      w: W, h: H, scene,
      ao: half(hw, hh, aoOpt), ao2: half(hw, hh, aoOpt),
      b1: half(hw, hh), b2: half(Math.ceil(W / 4), Math.ceil(H / 4)), b3: half(Math.ceil(W / 8), Math.ceil(H / 8)),
      b4: half(Math.ceil(W / 16), Math.ceil(H / 16)), b5: half(Math.ceil(W / 32), Math.ceil(H / 32)),
      r1: half(Math.ceil(W / 4), Math.ceil(H / 4)), r2: half(Math.ceil(W / 4), Math.ceil(H / 4)),
      // Helligkeit: 32 × 18 log. Luminanz, dann 1 × 1 nachgeführt (zwei Ziele im Wechsel)
      lum: half(32, 18, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }),
      eyeA: half(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }),
      eyeB: half(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }),
    };
    if (this.eye) this.eye.reset = true;
    return this.targets;
  }

  makeMaterials() {
    const sm = (frag, uniforms, extra) => new THREE.ShaderMaterial(Object.assign({
      vertexShader: POST_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
    }, extra || {}));

    // Umgebungsverdeckung (Scalable Ambient Obscurance, vereinfacht) in halber Auflösung
    this.aoMat = sm(`
      varying vec2 vUv;
      ${POST_COMMON}
      uniform vec2 uTexel; uniform vec2 uProjScale; uniform float uRadius, uIntensity;
      #define SAMPLES AO_SAMPLES
      void main() {
        float d = texture2D(tDepth, vUv).r;
        if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        vec3 P = viewPosAt(vUv);
        // Normale aus den Nachbarn (jeweils die nähere Seite, damit Kanten sauber bleiben)
        vec3 pr = viewPosAt(vUv + vec2(uTexel.x, 0.0)), pl = viewPosAt(vUv - vec2(uTexel.x, 0.0));
        vec3 pu = viewPosAt(vUv + vec2(0.0, uTexel.y)), pd = viewPosAt(vUv - vec2(0.0, uTexel.y));
        vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
        vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
        vec3 N = normalize(cross(dx, dy));
        if (dot(N, P) > 0.0) N = -N;
        float R = uRadius * (1.0 + smoothstep(20.0, 120.0, -P.z) * 2.0);  // in der Ferne größer, sonst unsichtbar
        vec2 rUV = uProjScale * 0.5 * R / -P.z;
        rUV = min(rUV, vec2(0.12));
        float ang = ign(gl_FragCoord.xy) * 6.2831853;
        float sum = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          float fi = float(i) + 0.5;
          float a = ang + fi * 2.39996323;
          float rr = sqrt(fi / float(SAMPLES));
          vec2 o = vec2(cos(a), sin(a)) * rr * rUV;
          vec3 Q = viewPosAt(vUv + o);
          vec3 v = Q - P;
          float vv = dot(v, v);
          float fall = max(0.0, 1.0 - vv / (R * R * 4.0));
          sum += max(0.0, dot(v, N) - 0.002 * -P.z - 0.02) / (vv + 0.02 * R * R) * fall;
        }
        float ao = max(0.0, 1.0 - uIntensity * 2.0 * R * sum / float(SAMPLES));
        ao = mix(ao, 1.0, smoothstep(140.0, 260.0, -P.z));
        gl_FragColor = vec4(vec3(ao), 1.0);
      }`, {
      tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() },
      uProjScale: { value: new THREE.Vector2() }, uRadius: { value: 0.9 }, uIntensity: { value: 1.4 },
    }, { defines: { AO_SAMPLES: 10 } });

    // Weichzeichnen der Verdeckung, Kanten (Tiefensprünge) bleiben erhalten
    this.aoBlurMat = sm(`
      varying vec2 vUv;
      ${POST_COMMON}
      uniform sampler2D tAO; uniform vec2 uDir;
      void main() {
        float z0 = viewPosAt(vUv).z;
        float s = 0.0, w = 0.0;
        for (int i = -3; i <= 3; i++) {
          vec2 uv = vUv + uDir * float(i);
          float z = viewPosAt(uv).z;
          float wi = exp(-float(i * i) * 0.12) * max(0.0, 1.0 - abs(z - z0) / (0.04 * abs(z0) + 0.2));
          s += texture2D(tAO, uv).r * wi; w += wi;
        }
        gl_FragColor = vec4(vec3(s / max(w, 1e-4)), 1.0);
      }`, { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, tAO: { value: null }, uDir: { value: new THREE.Vector2() } });

    // Bloom: heller Teil verkleinert (Dual-Kawase), dann schrittweise wieder vergrößert und aufaddiert
    this.brightMat = sm(`
      varying vec2 vUv;
      uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThreshold, uExposure;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb * 4.0;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        c = min(c / 8.0 * uExposure, vec3(60.0));
        float l = max(c.r, max(c.g, c.b));
        float knee = uThreshold * 0.5;
        float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee + 1e-4);
        float k = max(soft, l - uThreshold) / max(l, 1e-4);
        gl_FragColor = vec4(c * k, 1.0);
      }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 }, uExposure: { value: 1 } });
    this.downMat = sm(`
      varying vec2 vUv;
      uniform sampler2D tColor; uniform vec2 uTexel;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb * 4.0;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = sm(`
      varying vec2 vUv;
      uniform sampler2D tColor; uniform vec2 uTexel;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(tColor, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(2.0, 0.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(0.0, -2.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(0.0, 2.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 2.0;
        c += texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb * 2.0;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb * 2.0;
        c += texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb * 2.0;
        gl_FragColor = vec4(c / 12.0, 1.0);
      }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } },
    { blending: THREE.AdditiveBlending, transparent: true });

    // Lichtstrahlen (seit v3.15.0, Grafik-Phase 10d): Himmel um die Sonne (Wolken und Häuser verdecken) in Viertelauflösung,
    // dann zweimal radial zur Sonne hin verwischt
    this.raysMaskMat = sm(`
      varying vec2 vUv;
      ${POST_COMMON}
      uniform sampler2D tColor; uniform mat4 uCamWorld; uniform vec3 uSunDir;
      void main() {
        if (texture2D(tDepth, vUv).r < 0.99999) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        vec3 rd = normalize(mat3(uCamWorld) * viewPosAt(vUv));
        float mu = max(dot(rd, uSunDir), 0.0);
        vec3 c = texture2D(tColor, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(vec3(min(l, 4.0) * (pow(mu, 10.0) * 0.6 + pow(mu, 60.0) * 4.0)), 1.0);
      }`, { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, tColor: { value: null }, uCamWorld: { value: new THREE.Matrix4() }, uSunDir: { value: new THREE.Vector3() } });
    this.raysBlurMat = sm(`
      varying vec2 vUv;
      uniform sampler2D tColor; uniform vec2 uSun; uniform float uLen;
      float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main() {
        vec2 d = (uSun - vUv) * uLen / 40.0;
        vec2 uv = vUv + d * ign(gl_FragCoord.xy);
        vec3 s = vec3(0.0); float w = 1.0, tw = 0.0;
        for (int i = 0; i < 40; i++) { s += texture2D(tColor, uv).rgb * w; tw += w; w *= 0.965; uv += d; }
        gl_FragColor = vec4(s / tw, 1.0);
      }`, { tColor: { value: null }, uSun: { value: new THREE.Vector2() }, uLen: { value: 1 } });

    // Augenanpassung: log. Luminanz in 32 × 18 (je 4 × 4 Proben, Himmel zählt halb), dann Mittel und Nachführen in 1 × 1
    this.lumMat = sm(`
      varying vec2 vUv;
      uniform sampler2D tColor, tDepth;
      void main() {
        float s = 0.0, w = 0.0;
        for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
          vec2 uv = vUv + (vec2(float(i), float(j)) - 1.5) / vec2(128.0, 72.0);
          float l = dot(texture2D(tColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
          float wi = texture2D(tDepth, uv).r >= 0.99999 ? 0.5 : 1.0;
          // Bildmitte zählt mehr
          wi *= 1.0 - 0.6 * length(uv - 0.5);
          s += log(max(l, 1e-4)) * wi; w += wi;
        }
        gl_FragColor = vec4(s / w, w, 0.0, 1.0);
      }`, { tColor: { value: null }, tDepth: { value: null } });
    this.eyeMat = sm(`
      varying vec2 vUv;
      uniform sampler2D tLum, tPrev;
      uniform float uK, uReset;
      void main() {
        float s = 0.0, w = 0.0;
        for (int i = 0; i < 32; i++) for (int j = 0; j < 18; j++) {
          vec2 v = texture2D(tLum, (vec2(float(i), float(j)) + 0.5) / vec2(32.0, 18.0)).rg;
          s += v.r * v.g; w += v.g;
        }
        float now = exp(s / max(w, 1e-4)), prev = texture2D(tPrev, vec2(0.5)).r;
        gl_FragColor = vec4(uReset > 0.5 || !(prev > 0.0) ? now : mix(prev, now, uK), 0.0, 0.0, 1.0);
      }`, { tLum: { value: null }, tPrev: { value: null }, uK: { value: 0.05 }, uReset: { value: 1 } });

    // Zusammensetzen: Verdeckung, Luftperspektive, Bloom, Belichtung, ACES, Farbkorrektur, Vignette, Körnung
    this.compMat = sm(`
      varying vec2 vUv;
      ${POST_COMMON}
      uniform sampler2D tColor, tAO, tBloom, tRays;
      uniform float uRays;
      uniform mat4 uCamWorld, uProj;
      uniform vec2 uSceneTexel;
      uniform vec3 uFogCol, uSunDir, uSunCol;
      uniform float uFogDensity, uFogBase, uFogFall, uExposure, uBloom, uNight, uWet, uTime, uAO, uSunVis, uCloud, uCloudT;
      uniform sampler2D tEye;
      uniform vec3 uEye;                 // x: an/aus, y: untere, z: obere Grenze des Faktors
      uniform float uEyeKey;
      uniform vec3 uGradeLo, uGradeHi;   // Tönung der Schatten und Lichter
      uniform mat4 uPrevVP;              // Blick-Projektion des letzten Bildes (Bewegungsunschärfe)
      uniform vec4 uLamp[${POST_NL}];      // Laternen: Lage im Blickraum, w = Stärke
      uniform float uLampN;
      uniform vec3 uViewDown;            // Richtung nach unten im Blickraum
      uniform float uBlur;
      uniform float uSat, uCurve, uLift;
      uniform vec2 uRes;
      // Wolkenschatten (seit v3.15.0, Grafik-Phase 10b): dieselbe Rauschart wie die Wolken am Himmel (js/atmosphere.js)
      float cHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float cNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // Spiegelungen (seit v3.15.0, Grafik-Phase 10c): Strahl im Blickraum durch das Tiefenbild, Treffer mit 5 Halbierungen
      // verfeinert; ohne Treffer bleibt die Himmelsspiegelung der Materialien. Alpha des Szenenbilds: 1 … 2 nasse Straße
      // (Normale nach oben), 3 … 4 Glas (Normale aus der Tiefe), sonst höchstens 1
      #ifdef USE_SSR
      vec2 toUv(vec3 p) { vec4 c = uProj * vec4(p, 1.0); return c.xy / c.w * 0.5 + 0.5; }
      vec4 ssr(vec3 P, vec3 N) {
        vec3 V = normalize(P), R = reflect(V, N);
        if (R.z > 0.6) return vec4(0.0); // zur Kamera zurück: nicht im Bild
        float st = clamp(-P.z * 0.025, 0.12, 2.5), t = 0.0;
        vec3 q = P + N * 0.05;
        float jit = ign(gl_FragCoord.xy);
        for (int i = 0; i < SSR_STEPS; i++) {
          float s = st * (1.0 + (i == 0 ? jit : 0.0));
          q += R * s; t += s; st *= 1.11;
          vec2 uv = toUv(q);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || q.z > -0.3) break;
          float sz = viewPosAt(uv).z;
          if (q.z < sz && sz - q.z < max(0.6, s * 2.5)) {
            // Treffer: Halbierungen zwischen letztem Punkt davor und dahinter
            vec3 a = q - R * s, b = q;
            for (int k = 0; k < 5; k++) { vec3 m = (a + b) * 0.5; if (m.z < viewPosAt(toUv(m)).z) b = m; else a = m; }
            uv = toUv(b);
            if (texture2D(tDepth, uv).r >= 0.99999) break;
            vec2 e = smoothstep(0.0, 0.08, uv) * smoothstep(1.0, 0.92, uv);
            float fade = e.x * e.y * (1.0 - smoothstep(0.0, 0.6, R.z)) * (1.0 - smoothstep(120.0, 260.0, t));
            return vec4(texture2D(tColor, uv).rgb, fade);
          }
        }
        return vec4(0.0);
      }
      #endif
      float cloudShadow(vec3 wp) {
        // Wolkendecke in 1.500 m Höhe, entlang der Sonnenrichtung auf den Boden projiziert; Wind 9 m/s aus Westsüdwest
        vec2 q = (wp.xz + uSunDir.xz * (1500.0 - wp.y) / max(uSunDir.y, 0.2) - vec2(9.0, 3.5) * uCloudT) / 1150.0;
        float v = 0.0, a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 4; i++) { v += a * cNoise(q); q = m * q; a *= 0.5; }
        float e0 = 0.62 - uCloud * 0.42;
        return smoothstep(e0, e0 + 0.22, v);
      }
      vec3 RRTAndODTFit(vec3 v) {
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return a / b;
      }
      vec3 aces(vec3 color) {
        const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        color *= 1.0 / 0.6;
        color = ACESInputMat * color;
        color = RRTAndODTFit(color);
        color = ACESOutputMat * color;
        return clamp(color, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() {
        vec3 col = texture2D(tColor, vUv).rgb;
        #ifdef USE_BLUR
          // Kamera-Bewegungsunschärfe: Punkt mit der Blick-Projektion des letzten Bildes zurückrechnen, entlang der
          // Bewegung mitteln; Bildmitte (Auto, Fadenkreuz) bleibt scharf, Länge begrenzt
          if (uBlur > 0.001) {
            vec4 pc = uPrevVP * (uCamWorld * vec4(viewPosAt(vUv), 1.0));
            vec2 vel = (vUv - (pc.xy / pc.w * 0.5 + 0.5)) * uBlur;
            vel *= smoothstep(0.14, 0.6, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
            float vl = length(vel);
            if (vl > 0.035) vel *= 0.035 / vl;
            if (vl > 0.0008) {
              vec3 acc = col;
              for (int i = 1; i < 8; i++) acc += texture2D(tColor, vUv + vel * (float(i) / 7.0 - 0.5)).rgb;
              col = acc / 8.0;
            }
          }
        #endif
        float d = texture2D(tDepth, vUv).r;
        vec3 dbgSSR = vec3(0.0);
        if (d < 0.99999) {
          vec3 vp = viewPosAt(vUv);
          #ifdef USE_LAMPS
            // Laternenlicht: Lichtkegel nach unten, Abstand bis ≈ 22 m, Fläche nach Normale aus der Tiefe; die Farbe der
            // Fläche wird aus dem Bild geschätzt (Farbton bleibt, mittlere Helligkeit). Boden direkt unter der Lampe hat
            // schon den Lichtteppich, deshalb waagrechte Flächen schwächer
            if (uLampN > 0.5) {
              vec2 tx = uSceneTexel;
              vec3 pr = viewPosAt(vUv + vec2(tx.x, 0.0)), pl = viewPosAt(vUv - vec2(tx.x, 0.0));
              vec3 pu = viewPosAt(vUv + vec2(0.0, tx.y)), pd = viewPosAt(vUv - vec2(0.0, tx.y));
              vec3 ddx = abs(pr.z - vp.z) < abs(vp.z - pl.z) ? pr - vp : vp - pl;
              vec3 ddy = abs(pu.z - vp.z) < abs(vp.z - pd.z) ? pu - vp : vp - pd;
              vec3 Nl = normalize(cross(ddx, ddy));
              if (dot(Nl, vp) > 0.0) Nl = -Nl;
              float lFlat = smoothstep(0.55, 0.9, dot(Nl, -uViewDown));
              vec3 lsum = vec3(0.0);
              for (int i = 0; i < ${POST_NL}; i++) {
                if (float(i) >= uLampN) break;
                vec3 L = uLamp[i].xyz - vp;
                float d2 = dot(L, L);
                if (d2 > 484.0) continue;
                vec3 Ln = L * inversesqrt(d2);
                float att = (1.0 - d2 / 484.0); att *= att / (1.0 + d2 * 0.035);
                float cone = smoothstep(-0.3, 0.45, dot(-Ln, uViewDown));
                lsum += vec3(1.0, 0.68, 0.36) * uLamp[i].w * att * cone * max(dot(Nl, Ln), 0.0);
              }
              float mx = max(col.r, max(col.g, col.b));
              vec3 alb = clamp(col / max(mx, 0.025), 0.0, 1.0) * 0.6;
              col += alb * lsum * (1.0 - 0.75 * lFlat);
            }
          #endif
          #ifdef USE_AO
            float ao = texture2D(tAO, vUv).r;
            col *= mix(1.0, ao, uAO);
          #endif
          #ifdef USE_SSR
            float ra = texture2D(tColor, vUv).a;
            if (ra > 1.02) {
              vec3 N;
              float rs;
              if (ra < 2.5) { N = normalize(transpose(mat3(uCamWorld)) * vec3(0.0, 1.0, 0.0)); rs = clamp(ra - 1.0, 0.0, 1.0); }
              else {
                vec2 tx = uSceneTexel;
                vec3 pr = viewPosAt(vUv + vec2(tx.x, 0.0)), pl = viewPosAt(vUv - vec2(tx.x, 0.0));
                vec3 pu = viewPosAt(vUv + vec2(0.0, tx.y)), pd = viewPosAt(vUv - vec2(0.0, tx.y));
                vec3 dx = abs(pr.z - vp.z) < abs(vp.z - pl.z) ? pr - vp : vp - pl;
                vec3 dy = abs(pu.z - vp.z) < abs(vp.z - pd.z) ? pu - vp : vp - pd;
                N = normalize(cross(dx, dy));
                if (dot(N, vp) > 0.0) N = -N;
                rs = clamp(ra - 3.0, 0.0, 1.0);
              }
              vec4 hit = ssr(vp, N);
              float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-normalize(vp), N), 0.0), 5.0);
              col = mix(col, hit.rgb, hit.a * rs * mix(0.25, 1.0, fres) * 0.9);
              dbgSSR = vec3(rs * step(ra, 2.5), hit.a * rs, rs * step(2.5, ra));
            }
          #endif
          // Luftperspektive: Höhennebel (dichter in Tälern), zur Sonne hin warm aufgehellt
          vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
          vec3 cp = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float dist = length(vp);
          vec3 rd = (wp - cp) / max(dist, 1e-3);
          // Wolkenschatten: dunkelt Boden und Häuser, wo eine Wolke vor der Sonne steht (bei Bewölkung kaum, nachts nicht)
          if (uSunVis > 0.02) col *= 1.0 - cloudShadow(wp) * 0.46 * uSunVis;
          float h0 = cp.y - uFogBase, h1 = wp.y - uFogBase, dh = h1 - h0;
          float k = uFogFall;
          float avg = abs(dh) > 0.5 ? (exp(-k * h0) - exp(-k * h1)) / (k * dh) : exp(-k * h0);
          avg = clamp(avg, 0.45, 1.6);
          float fogAmt = 1.0 - exp(-uFogDensity * max(dist - 6.0, 0.0) * avg);
          float sunAmt = pow(max(dot(rd, uSunDir), 0.0), 6.0) * uSunVis;
          vec3 fogC = uFogCol + uSunCol * sunAmt * 0.35;
          col = mix(col, fogC, fogAmt);
        }
        #ifdef USE_BLOOM
          col += texture2D(tBloom, vUv).rgb * uBloom;
        #endif
        #ifdef USE_RAYS
          if (uRays > 0.0) col += texture2D(tRays, vUv).rgb * uSunCol * uRays;
          #ifdef DEBUG_RAYS
            gl_FragColor = vec4(texture2D(tRays, vUv).rgb, 1.0); return;
          #endif
        #endif
        float eye = 1.0;
        if (uEye.x > 0.5) {
          float avg = texture2D(tEye, vec2(0.5)).r * uExposure;
          eye = clamp(uEyeKey / max(avg, 1e-4), uEye.y, uEye.z);
          eye = pow(eye, 0.6); // nur ein Teil des Weges: der Look der Tabelle bleibt
        }
        col *= uExposure * eye;
        col = aces(col);
        // Farbkorrektur aus der Licht-Tabelle (js/atmosphere.js TIMECYCLE): Sättigung, Tönung von Schatten und Lichtern,
        // S-Kurve, angehobene Tiefen
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, uSat);
        col *= mix(uGradeLo, uGradeHi, smoothstep(0.05, 0.6, l));
        col = clamp(col, 0.0, 1.0);
        col = mix(col, col * col * (3.0 - 2.0 * col), uCurve);         // S-Kurve
        col = col * (1.0 - 2.0 * uLift) + uLift;                     // leicht angehobene Tiefen (Film)
        // Vignette
        vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
        col *= 1.0 - smoothstep(0.35, 1.15, length(q)) * 0.42;
        col = toSRGB(clamp(col, 0.0, 1.0));
        // Körnung gegen Farbstufen
        col += (ign(gl_FragCoord.xy + fract(uTime * 7.3) * 113.0) - 0.5) / 160.0;
        gl_FragColor = vec4(col, 1.0);
        #ifdef DEBUG_SSR
          gl_FragColor = vec4(dbgSSR, 1.0); // rot: nasse Fläche, blau: Glas, grün: Treffer
        #endif
        #ifdef DEBUG_AO
          gl_FragColor = vec4(texture2D(tAO, vUv).rrr, 1.0);
        #endif
      }`, {
      tColor: { value: null }, tDepth: { value: null }, tAO: { value: null }, tBloom: { value: null },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uFogCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
      uFogDensity: { value: 0.001 }, uFogBase: { value: 0 }, uFogFall: { value: 1 / 160 }, uExposure: { value: 1 },
      uBloom: { value: 0.08 }, uNight: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 }, uAO: { value: 0.85 },
      tRays: { value: null }, uRays: { value: 0 },
      uProj: { value: new THREE.Matrix4() }, uSceneTexel: { value: new THREE.Vector2() },
      uSunVis: { value: 1 }, uRes: { value: new THREE.Vector2() }, uCloud: { value: 0.2 }, uCloudT: { value: 0 },
      tEye: { value: null }, uEye: { value: new THREE.Vector3() }, uEyeKey: { value: 0.2 },
      uPrevVP: { value: new THREE.Matrix4() }, uBlur: { value: 0 },
      uLamp: { value: Array.from({ length: POST_NL }, () => new THREE.Vector4()) }, uLampN: { value: 0 }, uViewDown: { value: new THREE.Vector3() },
      uGradeLo: { value: new THREE.Vector3(1, 1, 1) }, uGradeHi: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uCurve: { value: 0.22 }, uLift: { value: 0.012 },
    });
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qScene, this.qCam);
  }

  // Bildzeit messen und Auflösung anpassen (bei Ruckeln kleiner, bei Luft wieder größer)
  adapt(dtMs) {
    if (!this.enabled) return;
    this.ft += (Math.min(dtMs, 100) - this.ft) * 0.08;
    this.cool -= dtMs / 1000;
    if (this.cool > 0) return;
    if (this.ft > 22) { this.slowT += dtMs; this.fastT = 0; } else if (this.ft < 17.8) { this.fastT += dtMs; this.slowT = 0; } else { this.slowT = this.fastT = 0; }
    if (this.slowT > 1200 && this.scale > this.q.minScale) { this.scale = Math.max(this.q.minScale, this.scale - 0.1); this.slowT = 0; this.cool = 2; this.ceiling = this.scale + 0.1; }
    else if (this.fastT > 4000 && this.scale < 1) {
      // nicht sofort wieder auf die Stufe, die zu langsam war
      if (!this.ceiling || this.scale + 0.05 < this.ceiling || this.fastT > 30000) { this.scale = Math.min(1, this.scale + 0.05); this.ceiling = 0; }
      this.fastT = 0; this.cool = 1.5;
    }
  }

  // GPU-Zeiten (null ohne timing oder ohne Erweiterung) und Zeichenaufrufe/Dreiecke des Szenen-Durchgangs
  get gpu() { return this.timer && this.timer.ms; }

  render(scene, camera) {
    const r = this.renderer;
    const G = this.timing ? (this.timer || (this.timer = new GpuTimer(r.getContext()))) : null;
    const info = r.info.render, S = this.sceneInfo || (this.sceneInfo = { calls: 0, tris: 0 });
    if (!this.enabled) {
      if (G) G.begin('scene');
      r.setRenderTarget(null); r.render(scene, camera);
      S.calls = info.calls; S.tris = info.triangles;
      if (G) G.frame();
      return;
    }
    const T = this.ensureTargets(), P = this.params, q = this.q;
    if (G) G.begin('scene');
    r.setRenderTarget(T.scene);
    r.render(scene, camera);
    S.calls = info.calls; S.tris = info.triangles;
    const depth = T.scene.depthTexture;

    // Umgebungsverdeckung
    if (q.ao) {
      if (G) G.begin('ao');
      const m = this.aoMat;
      if (m.defines.AO_SAMPLES !== q.ao) { m.defines.AO_SAMPLES = q.ao; m.needsUpdate = true; }
      const u = m.uniforms;
      u.tDepth.value = depth; u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uTexel.value.set(1 / T.ao.width, 1 / T.ao.height);
      u.uProjScale.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
      this.pass(m, T.ao);
      const b = this.aoBlurMat.uniforms;
      b.tDepth.value = depth; b.uInvProj.value.copy(camera.projectionMatrixInverse);
      b.tAO.value = T.ao.texture; b.uDir.value.set(1 / T.ao.width, 0); this.pass(this.aoBlurMat, T.ao2);
      b.tAO.value = T.ao2.texture; b.uDir.value.set(0, 1 / T.ao.height); this.pass(this.aoBlurMat, T.ao);
    }
    // Bloom
    if (q.bloom) {
      if (G) G.begin('bloom');
      const bu = this.brightMat.uniforms;
      bu.tColor.value = T.scene.texture; bu.uTexel.value.set(1 / T.w, 1 / T.h); bu.uExposure.value = this.exposure;
      bu.uThreshold.value = P.bloomT;
      this.pass(this.brightMat, T.b1);
      const chain = [T.b1, T.b2, T.b3, T.b4, T.b5];
      const du = this.downMat.uniforms;
      for (let i = 1; i < chain.length; i++) {
        du.tColor.value = chain[i - 1].texture; du.uTexel.value.set(1 / chain[i - 1].width, 1 / chain[i - 1].height);
        this.pass(this.downMat, chain[i]);
      }
      const uu = this.upMat.uniforms;
      r.autoClear = false;
      for (let i = chain.length - 1; i > 0; i--) {
        uu.tColor.value = chain[i].texture; uu.uTexel.value.set(0.5 / chain[i].width, 0.5 / chain[i].height);
        this.pass(this.upMat, chain[i - 1]);
      }
      r.autoClear = true;
    }
    // Lichtstrahlen: nur, wenn die Sonne vor der Kamera steht (auch knapp außerhalb des Bildes) und scheint
    let rays = 0;
    if (q.bloom && P.sunVis > 0.05 && !this.noRays) {
      const v = this._sv || (this._sv = new THREE.Vector3()), f = this._sf || (this._sf = new THREE.Vector3());
      camera.getWorldDirection(f);
      const facing = f.dot(P.sunDir);
      if (facing > 0.1) {
        v.copy(P.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
        const sx = v.x * 0.5 + 0.5, sy = v.y * 0.5 + 0.5, off = Math.max(0, Math.abs(v.x) - 1, Math.abs(v.y) - 1);
        rays = P.sunVis * U.smoothstep(0.1, 0.45, facing) * (1 - U.smoothstep(0.2, 1.2, off)) * (0.6 + 0.6 * P.golden);
        if (rays > 0.01) {
          if (G) G.begin('rays');
          const mu = this.raysMaskMat.uniforms;
          mu.tDepth.value = depth; mu.uInvProj.value.copy(camera.projectionMatrixInverse); mu.tColor.value = T.scene.texture;
          mu.uCamWorld.value.copy(camera.matrixWorld); mu.uSunDir.value.copy(P.sunDir);
          this.pass(this.raysMaskMat, T.r1);
          const bu = this.raysBlurMat.uniforms;
          bu.uSun.value.set(sx, sy);
          bu.tColor.value = T.r1.texture; bu.uLen.value = 0.9; this.pass(this.raysBlurMat, T.r2);
          bu.tColor.value = T.r2.texture; bu.uLen.value = 0.3; this.pass(this.raysBlurMat, T.r1);
        } else rays = 0;
      }
    }
    // Augenanpassung
    const A = this.eye;
    if (A.on) {
      if (G) G.begin('eye');
      const now = performance.now(), dt = A.last ? Math.min(0.25, (now - A.last) / 1000) : A.dt;
      A.last = now;
      const lu = this.lumMat.uniforms;
      lu.tColor.value = T.scene.texture; lu.tDepth.value = depth;
      this.pass(this.lumMat, T.lum);
      const eu = this.eyeMat.uniforms, src = T.eyeA, dst = T.eyeB;
      eu.tLum.value = T.lum.texture; eu.tPrev.value = src.texture;
      eu.uK.value = 1 - Math.exp(-(A.fixedDt || dt) * A.rate); eu.uReset.value = A.reset ? 1 : 0;
      this.pass(this.eyeMat, dst);
      T.eyeA = dst; T.eyeB = src; A.reset = false;
    }
    // Zusammensetzen auf den Bildschirm
    if (G) G.begin('comp');
    const c = this.compMat, u = c.uniforms;
    u.tEye.value = T.eyeA.texture; u.uEye.value.set(A.on ? 1 : 0, A.min, A.max); u.uEyeKey.value = A.key;
    // Bewegungsunschärfe: Stärke aus dem Kameratempo (ab ≈ 80 km/h), bei Sprüngen (Schnellreise, Messlauf) aus
    const Bl = this.blur, nowB = performance.now() / 1000, dtB = Bl.t ? nowB - Bl.t : 0;
    let kB = 0;
    if (Bl.on && Bl.has && dtB > 0.004 && dtB < 0.25) {
      const jump = camera.position.distanceTo(Bl.prevPos);
      if (jump < 25) kB = U.smoothstep(22, 45, jump / dtB) * 0.55;
    }
    Bl.k += (kB - Bl.k) * 0.25;
    u.uBlur.value = Bl.k; u.uPrevVP.value.copy(Bl.prevVP);
    Bl.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    Bl.prevPos.copy(camera.position); Bl.t = nowB; Bl.has = true;
    // Laternen: nur nachts, Auswahl der nächsten alle 0,3 s, Lage im Blickraum jedes Bild
    const Lm = this.lamps;
    let nL = 0;
    if (q.ssr && P.night > 0.3 && Lm.source) {
      if (nowB - Lm.t > 0.3) { Lm.t = nowB; Lm.source(camera.position.x, camera.position.z, Lm.list, POST_NL); }
      const vm = camera.matrixWorldInverse, k = U.smoothstep(0.3, 0.8, P.night) * 3.6;
      for (const l of Lm.list) { u.uLamp.value[nL].set(l.x, l.y, l.z, 1).applyMatrix4(vm); u.uLamp.value[nL].w = k; if (++nL >= POST_NL) break; }
      u.uViewDown.value.set(0, -1, 0).transformDirection(vm);
    }
    u.uLampN.value = nL;
    const want = (q.ao ? 1 : 0) + (q.bloom ? 2 : 0) + (this.debugAO ? 4 : 0) + (q.ssr && !this.noSSR ? 8 : 0) + (this.debugSSR ? 16 : 0) + (this.debugRays ? 32 : 0) + (this.blur.on ? 64 : 0) + (q.ssr ? 128 : 0);
    if (c.userData.key !== want) {
      c.userData.key = want;
      c.defines = {};
      if (q.ao) c.defines.USE_AO = '';
      if (q.bloom) c.defines.USE_BLOOM = '';
      if (this.debugAO) c.defines.DEBUG_AO = '';
      if (q.ssr && !this.noSSR) { c.defines.USE_SSR = ''; c.defines.SSR_STEPS = q.ssr; }
      if (this.debugSSR) c.defines.DEBUG_SSR = '';
      if (q.bloom) c.defines.USE_RAYS = '';
      if (this.debugRays) c.defines.DEBUG_RAYS = '';
      if (this.blur.on) c.defines.USE_BLUR = '';
      if (q.ssr) c.defines.USE_LAMPS = ''; // nur Ultra/Hoch
      c.needsUpdate = true;
    }
    u.tColor.value = T.scene.texture; u.tDepth.value = depth; u.tAO.value = T.ao.texture; u.tBloom.value = T.b1.texture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uProj.value.copy(camera.projectionMatrix); u.uSceneTexel.value.set(1 / T.w, 1 / T.h);
    u.uFogCol.value.copy(P.fogCol); u.uSunDir.value.copy(P.sunDir); u.uSunCol.value.copy(P.sunCol);
    u.uFogDensity.value = P.fogDensity; u.uFogBase.value = P.fogBase;
    u.uExposure.value = this.exposure; u.uNight.value = P.night; u.uWet.value = P.wet; u.uSunVis.value = P.sunVis;
    u.uCloud.value = P.cloud; u.uCloudT.value = P.cloudT;
    u.tRays.value = T.r1.texture; u.uRays.value = rays * 0.14;
    u.uBloom.value = P.bloom;
    const Gr = P.grade;
    u.uGradeLo.value.copy(Gr.lo); u.uGradeHi.value.copy(Gr.hi); u.uSat.value = Gr.sat; u.uCurve.value = Gr.curve; u.uLift.value = Gr.lift;
    u.uTime.value = performance.now() / 1000;
    u.uRes.value.set(this.size.x, this.size.y);
    this.pass(c, null);
    if (G) G.frame();
  }
}
