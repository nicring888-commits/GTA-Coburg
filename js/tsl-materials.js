// Node-Fassungen der eigenen Shader für den WebGPURenderer (seit v3.16.0, Grafik-Fahrplan Phase 11). Der WebGL-Weg bleibt
// unverändert: Die Materialien der Welt sind weiter WebGL-Materialien mit onBeforeCompile. Wer eine TSL-Fassung hat, trägt
// in material.userData.tsl eine Funktion (nodeMaterial, kit), die js/gfx-webgpu.js aufruft, wenn der WebGPURenderer das
// Material in ein Node-Material umwandelt (NodeLibrary.fromMaterial, einmal je Material). ShaderMaterials (Himmel, Regen)
// tragen in userData.node eine Fabrik für einen Node-Zwilling, den die Probe beim Zeichnen einsetzt.
// Uniforms: kit.u(uniformObjekt) macht aus einem WebGL-Uniform ({ value }) einen TSL-Uniform, der jedem Bild folgt
// (Zahlen über onRenderUpdate, Farben und Vektoren teilen dasselbe Objekt).
'use strict';

const NodeKit = {
  // ---------- Grundlagen ----------
  init(mod) {
    this.mod = mod; this.T = mod.TSL;
    this._u = new Map();
    const T = this.T, { Fn, vec2, float, fract, floor, dot, mix, Loop } = T;
    // dieselben Rauschfunktionen wie im GLSL (js/atmosphere.js, js/post.js)
    this.hash = Fn(([p]) => {
      const q = fract(p.mul(vec2(123.34, 456.21))).toVar();
      q.addAssign(dot(q, q.add(45.32)));
      return fract(q.x.mul(q.y));
    });
    this.noise = Fn(([p]) => {
      const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(f0.mul(-2).add(3));
      const h = this.hash;
      return mix(mix(h(i), h(i.add(vec2(1, 0))), f.x), mix(h(i.add(vec2(0, 1))), h(i.add(vec2(1, 1))), f.x), f.y);
    });
    this.fbm = Fn(([p0, n]) => {
      const v = float(0).toVar(), a = float(0.5).toVar(), p = vec2(p0).toVar();
      Loop(n, () => {
        v.addAssign(a.mul(this.noise(p)));
        p.assign(vec2(p.x.mul(1.6).sub(p.y.mul(1.2)), p.x.mul(1.2).add(p.y.mul(1.6))));
        a.mulAssign(0.5);
      });
      return v;
    });
  },
  // WebGL-Uniform → TSL-Uniform (einmal je Objekt)
  u(obj) {
    let n = this._u.get(obj);
    if (!n) {
      const T = this.T;
      n = typeof obj.value === 'number' ? T.uniform(obj.value).onRenderUpdate(() => obj.value) : T.uniform(obj.value);
      this._u.set(obj, n);
    }
    return n;
  },
  get A() { const U = ATMO.uniforms; return { wet: this.u(U.uWet), night: this.u(U.uNight), time: this.u(U.uTime), top: this.u(U.uSkyTop), horizon: this.u(U.uSkyHorizon), ground: this.u(U.uSkyGround) }; },
  // Node-Zwilling eines ShaderMaterials (oder null)
  twin(mat) {
    if (!mat.userData.node) return null;
    if (!mat.userData._twin) {
      try { mat.userData._twin = mat.userData.node(this); } catch (e) { console.warn('TSL-Zwilling:', e.message); mat.userData.node = null; return null; }
    }
    return mat.userData._twin;
  },

  // ---------- Welt (js/world.js) ----------
  // Boden mit Luftbild: Detailrauschen in Weltkoordinaten, Wiese und Pflaster nach Fotofarbe (World.addDetail)
  detail(nm, tex) {
    const T = this.T, { Fn, texture, positionWorld, materialColor, smoothstep, max, min, mix, vec3 } = T, A = this.A;
    nm.colorNode = Fn(() => {
      const wp = positionWorld.xz, oc = materialColor.xyz;
      const dA = texture(tex, wp.div(9)).r, dB = texture(tex, wp.div(1.7)).r, dC = texture(tex, wp.div(0.33)).r;
      const grass = smoothstep(0, 0.05, oc.y.sub(max(oc.x, oc.z).mul(0.93)));
      const sat = max(oc.x, max(oc.y, oc.z)).sub(min(oc.x, min(oc.y, oc.z)));
      const paved = smoothstep(0.025, 0.08, sat).oneMinus().mul(grass.oneMinus());
      const c = oc.mul(mix(1, dA.mul(0.5).add(dB.mul(0.5)).mul(0.56).add(0.72), 0.55)).toVar();
      c.mulAssign(mix(1, dC.mul(0.76).add(0.62), grass.mul(0.55)));
      c.assign(mix(c, c.mul(vec3(1.1, 1.05, 0.78)), grass.mul(smoothstep(0.55, 0.8, dA)).mul(0.6)));
      c.mulAssign(mix(1, dC.mul(0.28).add(0.86), paved.mul(0.6)));
      return c.mul(A.wet.mul(-0.28).add(1));
    })();
  },
  // Straßen: Asphaltkörnung, bei Regen dunkler mit Pfützen, Himmelsspiegelung nach Fresnel (World.roadShader)
  road(nm, tex) {
    const T = this.T, { Fn, texture, positionWorld, cameraPosition, materialColor, smoothstep, normalize, reflect, pow, max, mix, vec3, vec4, output } = T, A = this.A;
    const puddle = Fn(() => {
      const wp = positionWorld.xz;
      const g2 = texture(tex, wp.div(6.5)).r, g3 = texture(tex, wp.div(29)).r;
      return smoothstep(0.52, 0.66, g2.mul(0.7).add(g3.mul(0.3))).mul(A.wet);
    })();
    nm.colorNode = Fn(() => {
      const wp = positionWorld.xz;
      const g1 = texture(tex, wp.div(0.8)).r, g2 = texture(tex, wp.div(6.5)).r, g3 = texture(tex, wp.div(29)).r;
      const k = g1.mul(0.3).add(0.82).mul(g2.mul(0.2).add(0.9)).mul(smoothstep(0.42, 0.62, g3).mul(0.14).add(0.93));
      return materialColor.xyz.mul(k).mul(A.wet.mul(-0.38).add(1).sub(puddle.mul(0.2)));
    })();
    nm.outputNode = Fn(() => {
      const V = normalize(positionWorld.sub(cameraPosition)), R = reflect(V, vec3(0, 1, 0));
      const fres = pow(max(V.y.negate(), 0).oneMinus(), 5).mul(0.97).add(0.03);
      const sky = mix(A.horizon, A.top, pow(max(R.y, 0), 0.6));
      const k = A.wet.mul(fres.mul(0.75).add(0.1)).mul(puddle.mul(0.55).add(0.45)).mul(A.night.mul(-0.6).add(1));
      return vec4(mix(output.rgb, sky, k), output.a);
    })();
  },
  // Laub: geschärfte Transparenz (bleibt aus der Ferne dicht), etwas entsättigt, nass dunkler (World.leafShader; das Wiegen
  // im Wind fehlt hier noch)
  leaf(nm) {
    const T = this.T, { Fn, texture, materialColor, fwidth, max, dot, mix, vec3, vec4 } = T, A = this.A;
    if (!nm.map) return;
    const map = nm.map;
    nm.colorNode = Fn(() => {
      const a = texture(map).a, c = materialColor.xyz;
      const l = dot(c, vec3(0.299, 0.587, 0.114));
      const sharp = a.sub(0.5).div(max(fwidth(a), 1e-4)).add(0.5);
      return vec4(mix(vec3(l), c, 0.85).mul(0.95).mul(A.wet.mul(-0.2).add(1)), sharp);
    })();
  },
  // Dächer mit Luftbild: Ziegelreihen nach Dachneigung mit Relief, Flachdächer gekörnt, steile Flächen mit der unscharfen
  // Mittelfarbe des Fotos (World.roofShader)
  roof(nm, tex) {
    const T = this.T, { Fn, texture, positionWorld, normalWorld, normalView, cameraViewMatrix, materialColor, uv, smoothstep, length, fract, floor, mod,
      fwidth, max, cos, sin, dot, mix, vec2, vec3, vec4, normalize, float, If } = T, A = this.A;
    const map = nm.map;
    const h = Fn(([p]) => fract(T.sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));
    // Lage im Ziegelraster: hangabwärts dn, quer ac, Reihe r, Spalte cc, Ausblenden nach Bildschirmgröße
    const grid = () => {
      const N = normalize(normalWorld), sl = length(N.xz), P = positionWorld;
      const dn = N.xz.div(max(sl, 1e-4)), ac = vec2(dn.y.negate(), dn.x);
      const r = P.y.div(max(sl, 1e-4)).div(0.3), row = floor(r), fr = fract(r);
      const cc = dot(P.xz, ac).div(0.27).add(mod(row, 2).mul(0.5));
      const fade = smoothstep(0.3, 0.85, max(fwidth(r), fwidth(cc))).oneMinus();
      return { N, sl, P, dn, ac, row, fr, cc, col: floor(cc), fc: fract(cc), fade, tiled: sl.greaterThan(0.22).and(N.y.greaterThan(0.05)) };
    };
    nm.colorNode = Fn(() => {
      const g = grid(), { N, P, row, fr, col, fc, fade } = g;
      const big = texture(tex, P.xz.mul(0.11)).r;
      const c = materialColor.xyz.toVar();
      // steile Flächen: das von oben projizierte Foto wäre verschmiert, dort die unscharfe Mittelfarbe
      if (map) c.assign(mix(c, texture(map, uv()).level(5).rgb.mul(T.uniform(nm.color)), smoothstep(0.55, 0.3, N.y)));
      If(g.tiled, () => {
        const tileV = h(vec2(row, col)).mul(0.28).add(0.86), wave = cos(fc.mul(6.2831853));
        const pat = tileV.mul(wave.mul(0.07).add(0.93)).mul(mix(1, 0.58, smoothstep(0.72, 1, fr)))
          .mul(mix(0.7, 1, smoothstep(0, 0.05, fc).mul(smoothstep(1, 0.95, fc)))).div(0.86);
        c.mulAssign(mix(1, pat, fade));
        const l = dot(c, vec3(0.299, 0.587, 0.114));
        c.assign(mix(vec3(l), c, 1.15).mul(big.mul(0.22).add(0.88)));
      }).Else(() => {
        const g1 = texture(tex, P.xz.mul(1.9)).r, g2 = texture(tex, P.xz.mul(0.35)).r;
        c.mulAssign(g1.mul(0.24).add(0.86).mul(g2.mul(0.16).add(0.92)));
      });
      return c.mul(A.wet.mul(-0.3).add(1));
    })();
    // Relief der Ziegel als Neigung der Normale
    nm.normalNode = Fn(() => {
      const g = grid(), { ac, dn, fr, fc, fade } = g;
      const b = vec3(ac.x, 0, ac.y).mul(sin(fc.mul(6.2831853)).mul(0.22)).add(vec3(dn.x, 0, dn.y).mul(smoothstep(0.6, 1, fr).mul(0.35))).mul(fade).mul(g.tiled.select(1, 0));
      return normalize(normalView.add(cameraViewMatrix.mul(vec4(b, 0)).xyz));
    })();
  },

  // ---------- Himmel und Regen (js/atmosphere.js) ----------
  // Himmelskuppel wie Atmosphere.makeSkyMaterial: Verlauf, Sonnenhof, Dunst, Sterne, Wolken (fbm), Sonne/Mond, Nebel
  sky(mat) {
    const T = this.T, { Fn, positionLocal, normalize, clamp, max, pow, mix, smoothstep, abs, dot, floor, fract, length, step, vec2, vec3, float, If } = T;
    const U = mat.uniforms, u = k => this.u(U[k]);
    const nm = new this.mod.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    nm.colorNode = Fn(() => {
      const d = normalize(positionLocal), h = d.y;
      const col = mix(u('uHorizon'), u('uTop'), pow(clamp(h, 0, 1), 0.5)).toVar();
      col.assign(mix(col, u('uGround'), smoothstep(0, -0.1, h)));
      const mu = max(dot(d, u('uSunDir')), 0), clearSky = u('uDark').oneMinus();
      col.addAssign(u('uSunCol').mul(pow(mu, 5).mul(0.16).add(pow(mu, 48).mul(0.32))).mul(clearSky).mul(mix(1, 0.25, u('uNight'))));
      col.assign(mix(col, u('uHorizon'), smoothstep(0, 0.18, abs(h)).oneMinus().mul(0.35)));
      const sp = d.mul(260), id = floor(sp), f = fract(sp).sub(0.5);
      const r = this.hash(id.xy.add(id.z.mul(17.13)));
      const star = step(0.986, r).mul(smoothstep(0.16, 0, length(f))).mul(fract(r.mul(91.7)).mul(0.65).add(0.35));
      const cover = float(0).toVar();
      If(h.greaterThan(0), () => {
        const t = u('uTime');
        const uvv = d.xz.div(h.add(0.12)).mul(2.2).add(vec2(t.mul(0.006), t.mul(0.0022)));
        const n = this.fbm(uvv, 5), e0 = u('uCover').mul(-0.42).add(0.66);
        cover.assign(smoothstep(e0, e0.add(0.2), n).mul(smoothstep(0, 0.1, h)));
        const n2 = this.fbm(uvv.add(u('uSunDir').xz.mul(0.06)), 5);
        const lit = clamp(n.sub(n2).mul(3).add(0.62), 0.15, 1);
        const cc = mix(u('uCloudShade'), u('uCloudCol'), lit).add(u('uSunCol').mul(pow(mu, 7)).mul(0.35).mul(clearSky).mul(u('uNight').oneMinus()));
        col.assign(mix(col, cc, cover.mul(0.97)));
      });
      col.addAssign(vec3(0.85, 0.9, 1).mul(star).mul(u('uNight')).mul(cover.oneMinus()).mul(smoothstep(0.02, 0.2, h)).mul(1.6));
      const disk = smoothstep(0.99955, 0.99975, dot(d, u('uSunDir'))).mul(cover.oneMinus()).mul(clearSky);
      col.assign(mix(col, mix(vec3(14, 12.5, 10.5), vec3(1.6, 1.65, 1.8), u('uNight')), disk));
      col.assign(mix(col, u('uFogCol'), u('uHaze').mul(smoothstep(0, 0.8, h).mul(-0.55).add(1))));
      return col;
    })();
    return nm;
  },
  // Regen: Striche in einem Würfel um die Kamera, im Shader bewegt (Atmosphere.makeRain)
  rain(mat) {
    const T = this.T, { Fn, positionLocal, attribute, floor, length, smoothstep, varying, float, vec3, vec4 } = T;
    const U = mat.uniforms, u = k => this.u(U[k]);
    const nm = new this.mod.LineBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const vA = varying(float(1), 'vRainA');
    nm.positionNode = Fn(() => {
      const B = 36, pos = positionLocal, end = attribute('aEnd', 'float'), cam = u('uCam'), t = u('uTime');
      const p = pos.mul(B).toVar();
      p.y.subAssign(t.mul(13).mul(pos.x.mul(0.3).add(0.85)));
      p.x.addAssign(t.mul(1.2));
      const q = p.sub(cam).add(B * 0.5);
      p.assign(q.sub(floor(q.div(B)).mul(B)).sub(B * 0.5).add(cam));
      p.y.subAssign(end.mul(0.42)); p.x.subAssign(end.mul(0.04));
      vA.assign(end.mul(-0.6).add(1).mul(smoothstep(10, 18, length(p.sub(cam))).oneMinus()));
      return p;
    })();
    nm.colorNode = u('uColor');
    nm.opacityNode = u('uAmount').mul(vA).mul(0.2);
    return nm;
  },
};
