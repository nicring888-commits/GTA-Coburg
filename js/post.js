// Nachbearbeitung (Post-Processing) ohne Zusatzbibliothek: Die Szene wird in ein HDR-Bild mit Kantenglättung
// (MSAA) gerechnet, dann kommen Umgebungsverdeckung (SSAO), Luftperspektive mit Höhennebel und Sonnenstreuung,
// Leuchten heller Stellen (Bloom), filmische Tonwertkurve und eine Farbkorrektur im Stil von GTA IV dazu.
// Die Auflösung passt sich der Bildrate an (dynamische Auflösung). Qualitätsstufen mit Taste O.
'use strict';

const POST_QUALITY = {
  ultra: { name: 'Ultra', msaa: 4, ratio: 2, ao: 16, bloom: true, post: true, shadow: 4096, minScale: 0.7 },
  hoch: { name: 'Hoch', msaa: 4, ratio: 1.5, ao: 10, bloom: true, post: true, shadow: 4096, minScale: 0.6 },
  mittel: { name: 'Mittel', msaa: 2, ratio: 1, ao: 0, bloom: true, post: true, shadow: 2048, minScale: 0.6 },
  niedrig: { name: 'Niedrig', msaa: 0, ratio: 0.85, ao: 0, bloom: false, post: false, shadow: 2048, minScale: 0.6 },
};
const POST_ORDER = ['ultra', 'hoch', 'mittel', 'niedrig'];

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
      fogDensity: 0.001, fogBase: 0, night: 0, wet: 0, sunVis: 1,
    };
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
    };
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

    // Zusammensetzen: Verdeckung, Luftperspektive, Bloom, Belichtung, ACES, Farbkorrektur, Vignette, Körnung
    this.compMat = sm(`
      varying vec2 vUv;
      ${POST_COMMON}
      uniform sampler2D tColor, tAO, tBloom;
      uniform mat4 uCamWorld;
      uniform vec3 uFogCol, uSunDir, uSunCol;
      uniform float uFogDensity, uFogBase, uFogFall, uExposure, uBloom, uNight, uWet, uTime, uAO, uSunVis;
      uniform vec2 uRes;
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
        float d = texture2D(tDepth, vUv).r;
        if (d < 0.99999) {
          vec3 vp = viewPosAt(vUv);
          #ifdef USE_AO
            float ao = texture2D(tAO, vUv).r;
            col *= mix(1.0, ao, uAO);
          #endif
          // Luftperspektive: Höhennebel (dichter in Tälern), zur Sonne hin warm aufgehellt
          vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
          vec3 cp = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float dist = length(vp);
          vec3 rd = (wp - cp) / max(dist, 1e-3);
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
        col *= uExposure;
        col = aces(col);
        // Farbkorrektur: etwas entsättigt, warme Lichter, kühle Schatten, sanfter Kontrast (Stil GTA IV)
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, mix(0.86, 0.8, uNight));
        vec3 warm = mix(vec3(1.045, 1.0, 0.9), vec3(1.06, 0.97, 0.86), uNight);
        vec3 cool = mix(vec3(0.94, 0.985, 1.05), vec3(0.85, 0.95, 1.12), uNight);
        col *= mix(cool, warm, smoothstep(0.05, 0.6, l));
        col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);           // S-Kurve
        col = col * 0.975 + 0.012;                                    // leicht angehobene Tiefen (Film)
        // Vignette
        vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
        col *= 1.0 - smoothstep(0.35, 1.15, length(q)) * 0.42;
        col = toSRGB(clamp(col, 0.0, 1.0));
        // Körnung gegen Farbstufen
        col += (ign(gl_FragCoord.xy + fract(uTime * 7.3) * 113.0) - 0.5) / 160.0;
        gl_FragColor = vec4(col, 1.0);
        #ifdef DEBUG_AO
          gl_FragColor = vec4(texture2D(tAO, vUv).rrr, 1.0);
        #endif
      }`, {
      tColor: { value: null }, tDepth: { value: null }, tAO: { value: null }, tBloom: { value: null },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uFogCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
      uFogDensity: { value: 0.001 }, uFogBase: { value: 0 }, uFogFall: { value: 1 / 160 }, uExposure: { value: 1 },
      uBloom: { value: 0.08 }, uNight: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 }, uAO: { value: 0.85 },
      uSunVis: { value: 1 }, uRes: { value: new THREE.Vector2() },
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

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    const T = this.ensureTargets(), P = this.params, q = this.q;
    r.setRenderTarget(T.scene);
    r.render(scene, camera);
    const depth = T.scene.depthTexture;

    // Umgebungsverdeckung
    if (q.ao) {
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
      const bu = this.brightMat.uniforms;
      bu.tColor.value = T.scene.texture; bu.uTexel.value.set(1 / T.w, 1 / T.h); bu.uExposure.value = this.exposure;
      bu.uThreshold.value = P.night > 0.5 ? 0.8 : 1.05;
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
    // Zusammensetzen auf den Bildschirm
    const c = this.compMat, u = c.uniforms;
    const want = (q.ao ? 1 : 0) + (q.bloom ? 2 : 0) + (this.debugAO ? 4 : 0);
    if (c.userData.key !== want) {
      c.userData.key = want;
      c.defines = {};
      if (q.ao) c.defines.USE_AO = '';
      if (q.bloom) c.defines.USE_BLOOM = '';
      if (this.debugAO) c.defines.DEBUG_AO = '';
      c.needsUpdate = true;
    }
    u.tColor.value = T.scene.texture; u.tDepth.value = depth; u.tAO.value = T.ao.texture; u.tBloom.value = T.b1.texture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld);
    u.uFogCol.value.copy(P.fogCol); u.uSunDir.value.copy(P.sunDir); u.uSunCol.value.copy(P.sunCol);
    u.uFogDensity.value = P.fogDensity; u.uFogBase.value = P.fogBase;
    u.uExposure.value = this.exposure; u.uNight.value = P.night; u.uWet.value = P.wet; u.uSunVis.value = P.sunVis;
    u.uBloom.value = P.night > 0.5 ? 0.16 : 0.07;
    u.uTime.value = performance.now() / 1000;
    u.uRes.value.set(this.size.x, this.size.y);
    this.pass(c, null);
  }
}
