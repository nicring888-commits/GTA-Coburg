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
    const black = () => this.black || (this.black = Landscape.blackTex()), tile = m => m.userData && m.userData.tile;
    const def = (k, f) => { if (!(k in THREE.Material.prototype)) Object.defineProperty(THREE.Material.prototype, k, { get() { return f(this) || black(); }, configurable: true }); };
    def('tslMap', m => m.map);
    def('tslCover', m => tile(m) && tile(m).coverTex);
    def('tslField', m => tile(m) && tile(m).fieldTex);
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
  // Textur einer Material-Eigenschaft je gezeichnetem Objekt (Standard-UV). Der WebGPURenderer teilt einen gebauten Shader
  // zwischen allen Materialien mit gleichem customProgramCacheKey (alle Geländekacheln, alle Laubarten), und Luftbilder
  // werden später getauscht: feste Texturen in TSL gälten für alle und folgten keinem Wechsel. materialReference liest die
  // Eigenschaft beim Zeichnen aus dem Material des Render-Objekts (dem Original); die Getter dafür (tslMap, tslCover,
  // tslField) liegen auf THREE.Material.prototype (init), weil Materialien mit gleichem Schlüssel nicht einzeln
  // umgewandelt werden
  mref(key) { return this.T.materialReference(key, 'texture'); },
  // Luftbild bzw. Textur des Materials, nie leer (sonst bricht der Texturknoten ab)
  map() { return this.mref('tslMap'); },
  // Farbe des Materials (color) je Objekt
  get color() { return this.T.materialReference('color', 'color'); },
  // Relief aus einer Höhe h (Ableitungen im Bildraum, wie die GLSL-Fassungen in js/landscape.js): neue Normale im Blickraum
  bump(h, k) {
    const T = this.T, { dFdx, dFdy, positionView, normalView, cross, dot, sign, abs, normalize } = T;
    const dpx = dFdx(positionView), dpy = dFdy(positionView), hx = dFdx(h), hy = dFdy(h), N = normalView;
    const r1 = cross(dpy, N), r2 = cross(N, dpx), det = dot(dpx, r1);
    return normalize(abs(det).mul(N).sub(sign(det).mul(hx.mul(r1).add(hy.mul(r2))).mul(k)));
  },
  // Landschaft: Wertrauschen wie LAND_NOISE
  lfbm(p) { const n = this.noise; return n(p).mul(0.55).add(n(p.mul(2.13).add(7.1)).mul(0.3)).add(n(p.mul(4.7).add(3.3)).mul(0.15)); },
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
    const T = this.T, { Fn, texture, positionWorld, cameraPosition, materialColor, smoothstep, normalize, reflect, pow, max, mix, clamp, vec3, vec4, output } = T, A = this.A;
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
      // Spiegelstärke für die Nachbearbeitung (js/tsl-post.js liest sie im zweiten Ausgabekanal), rot: nasse Fläche
      T.property('vec4', 'tslRefl').assign(vec4(clamp(A.wet.mul(puddle.mul(0.65).add(0.35)), 0, 1), 0, 0, 1));
      return vec4(mix(output.rgb, sky, k), output.a);
    })();
  },
  // Laub: geschärfte Transparenz (bleibt aus der Ferne dicht), etwas entsättigt, nass dunkler (World.leafShader; das Wiegen
  // im Wind fehlt hier noch)
  leaf(nm) {
    const T = this.T, { Fn, texture, materialColor, fwidth, max, dot, mix, vec3, vec4 } = T, A = this.A;
    if (!nm.map) return;
    // Wiegen im Wind oberhalb von 2,6 m; Phase je Instanz (die Lage der Instanz ist bei geteilten Materialien nicht lesbar)
    nm.positionNode = Fn(() => {
      const p = T.positionLocal, ph = this.hash(T.vec2(T.instanceIndex.toFloat().mul(0.37), 1.3)).mul(6.28), sway = T.max(p.y.sub(2.6), 0);
      return p.add(T.vec3(T.sin(A.time.mul(1.3).add(ph).add(p.z.mul(0.7))).mul(0.035).mul(sway), 0, T.cos(A.time.mul(1.1).add(ph.mul(1.3)).add(p.x.mul(0.6))).mul(0.03).mul(sway)));
    })();
    nm.colorNode = Fn(() => {
      const a = this.map().a, c = materialColor.xyz;
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
      if (map) c.assign(mix(c, this.map().rgb.mul(this.color), smoothstep(0.55, 0.3, N.y)));
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

  // ---------- Landschaft (js/landscape.js) ----------
  // Gelände im Umland: Wiese, Acker (Art nach Fotofarbe, Reihen, Fahrgassen), Waldboden, Ort; Relief aus dem Muster
  // (Landscape.terrainMaterial). Die Kachel (Bodenbedeckung coverTex, Reihenrichtung fieldTex) steht in userData.tile
  terrain(nm, L) {
    const T = this.T, { Fn, texture, uv, positionWorld, cameraPosition, smoothstep, length, dot, max, mix, vec2, vec3, vec4, fract, abs, mod, atan, cos, sin,
      fwidth, float } = T, A = this.A, X = L.T, n = this.noise;
    const sat = (c, s) => max(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, s), 0);
    const tri2 = (tx, p, sc) => {
      const q = vec2(p.x.mul(0.8).add(p.y.mul(0.6)), p.x.mul(-0.6).add(p.y.mul(0.8)));
      return mix(texture(tx, p.div(sc)).rgb, texture(tx, q.div(sc * 1.73).add(0.37)).rgb, 0.45);
    };
    const land = Fn(() => {
      const wp = positionWorld.xz, dist = length(positionWorld.sub(cameraPosition));
      const photo = this.map().rgb.mul(this.color);
      const cov = this.mref('tslCover').rgb;
      const nE = this.lfbm(wp.div(11)).sub(0.5);
      const wF = smoothstep(0.32, 0.62, cov.r.add(nE.mul(0.45))).toVar(), wG = smoothstep(0.32, 0.62, cov.g.add(nE.mul(0.4))).toVar(), wW = smoothstep(0.32, 0.6, cov.b.sub(nE.mul(0.4))).toVar();
      const k = max(wF.add(wG).add(wW), 1);
      wF.divAssign(k); wG.divAssign(k); wW.divAssign(k);
      const wU = float(1).sub(wF.add(wG).add(wW));
      const ph = sat(photo, 1.35).mul(1.05);
      const nBig = this.lfbm(wp.div(37)), nMid = n(wp.div(4.3));
      const near = smoothstep(60, 260, dist).oneMinus();
      // Wiese
      const gT = tri2(X.grass, wp, 2.6);
      const gC0 = mix(vec3(0.075, 0.13, 0.035), ph.mul(vec3(0.85, 1, 0.75)), 0.55).mul(nBig.mul(0.3).add(0.85));
      const gC = mix(gC0, vec3(0.16, 0.15, 0.06), smoothstep(0.62, 0.85, nBig).mul(0.45));
      const grassC = mix(gC, gT.mul(gC.div(vec3(0.095, 0.15, 0.06))).mul(0.62), near.mul(0.85));
      const grassH = dot(gT, vec3(0.33)).mul(2);
      // Acker
      const fm = this.mref('tslField');
      const ang = atan(fm.g.mul(2).sub(1), fm.r.mul(2).sub(1)).mul(0.5), dir = vec2(cos(ang), sin(ang));
      const acr = dot(wp, vec2(dir.y.negate(), dir.x));
      const green = smoothstep(0, 0.07, ph.g.sub(max(ph.r, ph.b).mul(0.95)));
      const yellow = smoothstep(0.03, 0.12, ph.r.add(ph.g.mul(0.4)).sub(ph.b.mul(1.4)).sub(0.25)).mul(green.oneMinus());
      const brown = max(float(1).sub(green).sub(yellow), 0);
      const sT = tri2(X.soil, wp, 2.2);
      const soil0 = mix(vec3(0.17, 0.11, 0.065), ph.mul(vec3(1, 0.85, 0.7)), 0.55).mul(sT.div(vec3(0.17, 0.11, 0.07))).mul(0.55);
      const soilC = mix(mix(vec3(0.17, 0.11, 0.065), ph, 0.5), soil0, near);
      const rw = mix(mix(0.42, 0.75, green), 0.17, yellow), rp = acr.div(rw);
      const rowF = smoothstep(0.35, 0.8, fwidth(rp)).oneMinus(), row = abs(fract(rp).sub(0.5)).mul(2);
      const cropC = mix(vec3(0.06, 0.13, 0.03), ph.mul(vec3(0.8, 1.05, 0.7)), 0.6).mul(nMid.mul(0.3).add(0.85));
      const strawC = mix(vec3(0.42, 0.34, 0.16), ph.mul(vec3(1.1, 1, 0.75)), 0.5);
      const plant = smoothstep(0.25, 0.65, row);
      const fieldC = vec3(soilC).toVar();
      fieldC.assign(mix(fieldC, mix(soilC, cropC, mix(0.75, plant, rowF)), green));
      fieldC.assign(mix(fieldC, mix(strawC.mul(0.8), strawC.mul(1.1), mix(0.5, plant, rowF)), yellow));
      fieldC.assign(mix(fieldC, soilC.mul(mix(1, smoothstep(0.1, 0.9, row).mul(0.4).add(0.72), rowF)), brown.mul(0.9)));
      const tram = abs(mod(acr.add(fm.b.mul(0.37)), 20).sub(10));
      const lane = smoothstep(0.18, 0.32, abs(tram.sub(0.9))).oneMinus().mul(smoothstep(0.6, 1.2, fwidth(acr).mul(6)).oneMinus());
      fieldC.assign(mix(fieldC, soilC.mul(0.9), lane.mul(green.add(yellow)).mul(0.85)));
      fieldC.mulAssign(nBig.mul(0.2).add(0.9));
      const fieldH = mix(row, plant, green.add(yellow)).mul(rowF);
      // Waldboden
      const lT = tri2(X.litter, wp, 3);
      const wood0 = mix(vec3(0.07, 0.055, 0.03), ph.mul(0.6), 0.35).mul(mix(vec3(1), lT.div(vec3(0.14, 0.1, 0.06)).mul(0.75), near));
      const woodC = mix(wood0, vec3(0.05, 0.08, 0.025), smoothstep(0.55, 0.8, nBig).mul(0.5));
      // Rest: Luftbild mit Körnung
      const dA = texture(L.detail, wp.div(9)).r, dB = texture(L.detail, wp.div(1.7)).r;
      const urbC = photo.mul(mix(1, dA.mul(0.5).add(dB.mul(0.5)).mul(0.56).add(0.72), 0.55));
      const pg = smoothstep(0, 0.05, photo.g.sub(max(photo.r, photo.b).mul(0.93))).mul(wU);
      const col = urbC.mul(wU.sub(pg)).add(grassC.mul(wG.add(pg))).add(fieldC.mul(wF)).add(woodC.mul(wW));
      const h = grassH.mul(wG.add(pg)).mul(0.6).add(fieldH.mul(wF)).add(dot(lT, vec3(0.33)).mul(2).mul(wW).mul(0.5)).mul(near);
      return vec4(col.mul(A.wet.mul(-0.3).add(1)), h);
    })();
    nm.colorNode = land.xyz;
    nm.normalNode = this.bump(land.w, 0.06);
  },
  // Kronendach ferner Wälder: einzelne Kronen als Buckel, Nadelwald dunkler (Landscape.canopyMaterial)
  canopy(nm) {
    const T = this.T, { Fn, positionWorld, materialColor, smoothstep, step, mix, floor, vec3, vec4 } = T, n = this.noise;
    const c = Fn(() => {
      const p = positionWorld.xz.div(6.5);
      const v = n(p).mul(0.6).add(n(p.mul(2.3).add(4.1)).mul(0.3)).add(n(p.mul(5.1)).mul(0.1));
      const conifer = step(0.55, n(positionWorld.xz.div(60)));
      const k = mix(vec3(1), vec3(0.62, 0.78, 0.7), conifer).mul(smoothstep(0.25, 0.75, v).mul(0.85).add(0.45)).mul(this.hash(floor(p.mul(1.3))).mul(0.3).add(0.85));
      return vec4(materialColor.xyz.mul(k), v.mul(3));
    })();
    nm.colorNode = c.xyz;
    nm.normalNode = this.bump(c.w, 0.9);
  },
  // 3D-Bewuchs (Gras, Getreide, Blumen, Farn): geschärfte Transparenz, unten im Büschel dunkler (Landscape.coverMaterial;
  // Einsinken am Rand und Wiegen kommen mit 11d)
  cover(nm) {
    const T = this.T, { Fn, texture, uv, materialColor, fwidth, max, mix, vec4 } = T;
    if (!nm.map) return;
    const A = this.A;
    nm.positionNode = Fn(() => {
      const p = T.positionLocal, ph = this.hash(T.vec2(T.instanceIndex.toFloat().mul(0.61), 2.9)).mul(6.28);
      return p.add(T.vec3(T.sin(A.time.mul(1.9).add(ph)).mul(0.07).mul(p.y), 0, T.cos(A.time.mul(1.6).add(ph.mul(0.7))).mul(0.05).mul(p.y)));
    })();
    nm.colorNode = Fn(() => {
      const a = this.map().a;
      // zum Rand des Bewuchses (LAND.coverR) ausblenden statt einsinken
      const d = T.length(T.positionWorld.xz.sub(T.cameraPosition.xz)), fade = T.smoothstep(LAND.coverR - 28, LAND.coverR - 4, d).oneMinus();
      return vec4(materialColor.xyz.mul(mix(0.55, 1.05, uv().y)), a.sub(0.5).div(max(fwidth(a), 1e-4)).add(0.5).mul(fade).sub(fade.oneMinus().mul(0.5)));
    })();
  },
  // Feld- und Waldwege (Landscape.trackMaterial): surf 0 Schotter, 1 Erdweg mit Fahrspuren, 2 Asphalt
  track(nm, L, surf) {
    const T = this.T, { texture, uv, positionWorld, materialColor, smoothstep, abs, min, mix, vec3, vec4, float } = T, A = this.A, X = L.T, n = this.noise;
    const u = uv().x, wp = positionWorld.xz;
    const nn = n(wp.div(2.3)), n2 = n(wp.div(0.6));
    const soil = texture(X.soil, wp.div(2)).rgb, grass = texture(X.grass, wp.div(2.4)).rgb.mul(vec3(0.9, 1, 0.8));
    const rut = min(abs(u.sub(0.27)), abs(u.sub(0.73)));
    const track = smoothstep(0.1, nn.mul(0.06).add(0.2), rut).oneMinus();
    const base = materialColor.xyz.mul(texture(L.detail, wp.div(1.3)).r.mul(0.5).add(0.75)).mul(n2.mul(0.3).add(0.85));
    let c, h;
    if (surf === 1) { c = mix(grass.mul(0.9), soil.mul(1.1), track); h = track; }
    else if (surf === 0) { c = mix(mix(base, grass, smoothstep(0.08, 0.16, abs(u.sub(0.5))).oneMinus().mul(0.55)), base.mul(0.82), track.mul(0.6)); h = n2.mul(0.5); }
    else { c = base.mul(smoothstep(0.4, 0.6, nn).mul(0.2).add(0.9)); h = float(0); }
    const edge = min(u, u.oneMinus());
    const col = mix(grass.mul(0.85), c, smoothstep(0.03, 0.12, edge.add(nn.sub(0.5).mul(0.08))));
    const a = smoothstep(0, 0.05, edge.add(n2.sub(0.5).mul(0.06))).greaterThan(0.5).select(1, 0);
    nm.colorNode = vec4(col.mul(A.wet.mul(-0.3).add(1)), a);
    nm.normalNode = this.bump(h, 0.05);
  },

  // ---------- Scheinwerfer (js/carlights.js) ----------
  // Lichtteppich: Helligkeit aus Abstand und Seitenlage in Fahrzeugkoordinaten (positionLocal), additiv
  carPool(mat, len) {
    const T = this.T, { Fn, positionLocal, smoothstep, abs, max, vec4 } = T, I = this.u(mat.uniforms.uI), col = this.u(mat.uniforms.uCol);
    const nm = new this.mod.MeshBasicNodeMaterial(this.additive(mat));
    nm.colorNode = Fn(() => {
      const d = positionLocal.z, x = positionLocal.x, w = d.mul(0.17).add(0.9);
      const l = max(smoothstep(w, w.mul(0.25), abs(x.sub(0.65))), smoothstep(w, w.mul(0.25), abs(x.add(0.65))));
      const a = l.mul(smoothstep(1, 4, d)).mul(smoothstep(9, len, d).oneMinus()).mul(T.float(2).div(d.mul(0.4).add(1)).add(1));
      return vec4(col.mul(a).mul(I), 0);
    })();
    return nm;
  },
  // Lichtkegel in der Luft: Mitte (Normale zum Betrachter) heller, zum Ende hin aus
  carBeam(mat) {
    const T = this.T, { Fn, uv, normalWorld, positionWorld, cameraPosition, normalize, abs, dot, pow, clamp, vec4 } = T, I = this.u(mat.uniforms.uI), col = this.u(mat.uniforms.uCol);
    const nm = new this.mod.MeshBasicNodeMaterial(Object.assign(this.additive(mat), { side: THREE.DoubleSide }));
    nm.colorNode = Fn(() => {
      const f = abs(dot(normalize(normalWorld), normalize(cameraPosition.sub(positionWorld))));
      const a = pow(clamp(uv().y.oneMinus(), 0, 1), 1.6).mul(pow(clamp(f, 0, 1), 1.5)).mul(I);
      return vec4(col.mul(a), 0);
    })();
    return nm;
  },
  // Mischung wie im ShaderMaterial: Farbe addieren, Alpha (Spiegelstärke) unberührt
  additive(m) {
    return { transparent: true, depthWrite: false, fog: false, blending: m.blending, blendSrc: m.blendSrc, blendDst: m.blendDst,
      blendSrcAlpha: m.blendSrcAlpha, blendDstAlpha: m.blendDstAlpha, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor,
      polygonOffsetUnits: m.polygonOffsetUnits };
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
