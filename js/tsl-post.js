// Nachbearbeitung für den WebGPURenderer (seit v3.16.0, Grafik-Fahrplan Phase 11e): dieselbe Kette wie js/post.js als
// Node-Kette (RenderPipeline). Szene in ein Bild mit zweitem Ausgabekanal (MRT): Normale und Spiegelstärke (Straßen und Glas
// setzen material.mrtNode, statt sie wie unter WebGL in den Alphakanal zu schreiben). Dann Umgebungsverdeckung (GTAO,
// three.js-Zusatz), Spiegelungen (Strahl durch das Tiefenbild), Wolkenschatten, Höhennebel mit Sonnenstreuung,
// Lichtstrahlen, Bloom (three.js-Zusatz), Belichtung, ACES, Farbkorrektur, Vignette, Körnung. Werte aus PostFX.params
// (js/atmosphere.js setzt sie für beide Wege).
'use strict';

NodeKit.post = {
  async build(r, scene, camera, post, quality) {
    const K = NodeKit, T = K.T, mod = K.mod;
    const { Fn, If, Loop, Break, float, vec2, vec3, vec4, uniform, pass, mrt, output, normalView, packNormalToRGB, unpackRGBToNormal, sample, screenUV,
      getViewPosition, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraWorldMatrix, cameraPosition, texture, mix, max, min, clamp, pow,
      exp, dot, length, normalize, reflect, smoothstep, abs, fract, floor, sin, select } = T;
    const P = post.params, PP = (location.search.match(/[?&]pp=([\w,]+)/) || [])[1] || '';
    // Testschalter ?pp=noao,nossr,norays,nobloom,nocomp (zum Vergleichen und Eingrenzen)
    const q = Object.assign({}, quality, PP.includes('noao') ? { ao: 0 } : {}, PP.includes('nossr') ? { ssr: 0 } : {}, PP.includes('nobloom') ? { bloom: false } : {});
    this.noRays = PP.includes('norays'); this.noComp = PP.includes('nocomp');
    // Zusätze (GTAO, Bloom) nur, wenn three.js vom CDN der Import-Map kommt (sonst zwei three.js-Instanzen)
    let aoFn = null, bloomFn = null;
    this.fxaaFn = null;
    if (/cdn\.jsdelivr\.net/.test(window.THREE_SRC || '')) {
      try { aoFn = (await import('three/addons/tsl/display/GTAONode.js')).ao; } catch (e) { console.warn('GTAO nicht verfügbar:', e.message); }
      try { bloomFn = (await import('three/addons/tsl/display/BloomNode.js')).bloom; } catch (e) { console.warn('Bloom nicht verfügbar:', e.message); }
      try { this.fxaaFn = (await import('three/addons/tsl/display/FXAANode.js')).fxaa; } catch (e) { this.fxaaFn = null; }
    }
    // GTAO liest das Tiefenbild direkt (geht nicht mit MSAA): mit Verdeckung ohne Mehrfachabtastung
    const sp = pass(scene, camera, aoFn && q.ao ? { samples: 0 } : {});
    sp.setMRT(mrt({ output, normal: packNormalToRGB(normalView), refl: T.property('vec4', 'tslRefl') }));
    const colorT = sp.getTextureNode('output'), depthT = sp.getTextureNode('depth'), normT = sp.getTextureNode('normal'), reflT = sp.getTextureNode('refl');
    // Uniforms, die jedem Bild folgen
    const U = {};
    const num = (k, f) => (U[k] = uniform(0).onRenderUpdate(f));
    num('fogDensity', () => P.fogDensity); num('sunVis', () => P.sunVis); num('night', () => P.night); num('cloud', () => P.cloud);
    num('cloudT', () => P.cloudT); num('exposure', () => post.exposure); num('golden', () => P.golden || 0);
    num('time', () => performance.now() / 1000); num('rays', () => this.rays);
    const fogCol = uniform(P.fogCol), sunDir = uniform(P.sunDir), sunCol = uniform(P.sunCol), sunUV = uniform(new THREE.Vector2(0.5, 0.5));
    this.sunUV = sunUV.value; this.rays = 0;

    const viewPosAt = uvN => getViewPosition(uvN, depthT.sample(uvN).r, cameraProjectionMatrixInverse);
    // Blickraum → Bild-UV (WebGPU: v von oben nach unten)
    const toUv = p => { const c = cameraProjectionMatrix.mul(vec4(p, 1)); const n = c.xy.div(c.w); return vec2(n.x.mul(0.5).add(0.5), n.y.mul(-0.5).add(0.5)); };
    const aoNode = aoFn && q.ao ? aoFn(depthT, sample(uvS => unpackRGBToNormal(normT.sample(uvS).rgb)), camera).getTextureNode() : null;
    if (aoNode && aoNode.node && aoNode.node.resolutionScale !== undefined) aoNode.node.resolutionScale = 0.5;

    const cloudShadow = Fn(([wp]) => {
      const qq = wp.xz.add(sunDir.xz.mul(float(1500).sub(wp.y)).div(max(sunDir.y, 0.2))).sub(vec2(9, 3.5).mul(U.cloudT)).div(1150).toVar();
      const v = float(0).toVar(), a = float(0.5).toVar();
      Loop(4, () => {
        v.addAssign(a.mul(K.noise(qq)));
        qq.assign(vec2(qq.x.mul(1.6).sub(qq.y.mul(1.2)), qq.x.mul(1.2).add(qq.y.mul(1.6))));
        a.mulAssign(0.5);
      });
      const e0 = U.cloud.mul(-0.42).add(0.62);
      return smoothstep(e0, e0.add(0.22), v);
    });
    const ssr = Fn(([P0, N]) => {
      const V = normalize(P0), R = reflect(V, N);
      const hit = vec4(0).toVar();
      If(R.z.lessThan(0.6), () => {
        const st = clamp(P0.z.negate().mul(0.025), 0.12, 2.5).toVar(), t = float(0).toVar();
        const qp = P0.add(N.mul(0.05)).toVar();
        Loop(q.ssr || 24, () => {
          qp.addAssign(R.mul(st)); t.addAssign(st); st.mulAssign(1.11);
          const uv2 = toUv(qp);
          If(uv2.x.lessThan(0).or(uv2.x.greaterThan(1)).or(uv2.y.lessThan(0)).or(uv2.y.greaterThan(1)).or(qp.z.greaterThan(-0.3)), () => { Break(); });
          const sz = viewPosAt(uv2).z;
          If(qp.z.lessThan(sz).and(sz.sub(qp.z).lessThan(max(0.6, st.mul(2.5)))), () => {
            If(depthT.sample(uv2).r.lessThan(0.99999), () => {
              const e = smoothstep(0, 0.08, uv2).mul(smoothstep(1, 0.92, uv2));
              const fade = e.x.mul(e.y).mul(smoothstep(0, 0.6, R.z).oneMinus()).mul(smoothstep(120, 260, t).oneMinus());
              hit.assign(vec4(colorT.sample(uv2).rgb, fade));
            });
            Break();
          });
        });
      });
      return hit;
    });
    const aces = Fn(([c0]) => {
      const c = c0.mul(1 / 0.6);
      const i = vec3(dot(c, vec3(0.59719, 0.35458, 0.04823)), dot(c, vec3(0.076, 0.90834, 0.01566)), dot(c, vec3(0.0284, 0.13383, 0.83777)));
      const a = i.mul(i.add(0.0245786)).sub(0.000090537), b = i.mul(i.mul(0.983729).add(0.432951)).add(0.238081), f = a.div(b);
      return clamp(vec3(dot(f, vec3(1.60475, -0.53108, -0.07367)), dot(f, vec3(-0.10208, 1.10813, -0.00605)), dot(f, vec3(-0.00327, -0.07276, 1.07602))), 0, 1);
    });

    const comp = Fn(() => {
      const uvN = screenUV;
      const col = colorT.sample(uvN).rgb.toVar();
      const d = depthT.sample(uvN).r;
      If(d.lessThan(0.99999), () => {
        const vp = viewPosAt(uvN).toVar();
        if (aoNode) col.mulAssign(mix(1, aoNode.sample(uvN).r, 0.85));
        // Spiegelungen: Stärke aus dem zweiten Ausgabekanal (r: nasse Straße, Normale nach oben; g: Glas, Normale aus dem Bild)
        if (q.ssr) {
          const rf = reflT.sample(uvN);
          If(rf.r.add(rf.g).greaterThan(0.02), () => {
            const N = select(rf.r.greaterThan(rf.g), normalize(T.cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz), unpackRGBToNormal(normT.sample(uvN).rgb));
            const hit = ssr(vp, N), rs = max(rf.r, rf.g);
            const fres = pow(max(dot(normalize(vp).negate(), N), 0).oneMinus(), 5).mul(0.96).add(0.04);
            col.assign(mix(col, hit.rgb, hit.a.mul(rs).mul(mix(0.25, 1, fres)).mul(0.9)));
          });
        }
        const wp = cameraWorldMatrix.mul(vec4(vp, 1)).xyz, cp = cameraPosition;
        If(U.sunVis.greaterThan(0.02), () => { col.mulAssign(cloudShadow(wp).mul(0.46).mul(U.sunVis).oneMinus()); });
        // Luftperspektive: Höhennebel, zur Sonne hin warm
        const dist = length(vp), rd = wp.sub(cp).div(max(dist, 1e-3));
        const kf = 1 / 160, h0 = cp.y, h1 = wp.y, dh = h1.sub(h0);
        const avg = clamp(select(abs(dh).greaterThan(0.5), exp(h0.mul(-kf)).sub(exp(h1.mul(-kf))).div(dh.mul(kf)), exp(h0.mul(-kf))), 0.45, 1.6);
        const fogAmt = exp(U.fogDensity.negate().mul(max(dist.sub(6), 0)).mul(avg)).oneMinus();
        const sunAmt = pow(max(dot(rd, sunDir), 0), 6).mul(U.sunVis);
        col.assign(mix(col, fogCol.add(sunCol.mul(sunAmt).mul(0.35)), fogAmt));
      });
      // Lichtstrahlen: Himmel nahe der Sonne entlang der Linie zur Sonne aufsummiert (24 Proben)
      If(U.rays.greaterThan(0.01), () => {
        const dd = sunUV.sub(uvN).mul(0.9 / 24), uvq = uvN.toVar(), acc = float(0).toVar(), w = float(1).toVar(), tw = float(0).toVar();
        Loop(24, () => {
          const sky = depthT.sample(uvq).r.greaterThanEqual(0.99999);
          const l = min(dot(colorT.sample(uvq).rgb, vec3(0.2126, 0.7152, 0.0722)), 4);
          acc.addAssign(select(sky, l, float(0)).mul(w)); tw.addAssign(w); w.mulAssign(0.95); uvq.addAssign(dd);
        });
        const near = smoothstep(0.7, 0, length(uvN.sub(sunUV)));
        col.addAssign(sunCol.mul(acc.div(tw)).mul(near.mul(0.6).add(0.15)).mul(U.rays).mul(0.5));
      });
      return col;
    });
    let lin = this.noComp ? colorT.rgb : comp();
    if (bloomFn && q.bloom) lin = lin.add(bloomFn(colorT, 0.12, 0.4, 1.05).rgb);
    // Belichtung, ACES, Farbkorrektur wie js/post.js; Ausgabe linear (die Pipeline wandelt in sRGB)
    const graded = Fn(() => {
      const c = aces(lin.mul(U.exposure)).toVar();
      const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c.assign(mix(vec3(l), c, mix(0.86, 0.8, U.night)));
      const warm = mix(vec3(1.045, 1, 0.9), vec3(1.06, 0.97, 0.86), U.night), cool = mix(vec3(0.94, 0.985, 1.05), vec3(0.85, 0.95, 1.12), U.night);
      c.mulAssign(mix(cool, warm, smoothstep(0.05, 0.6, l)));
      c.assign(mix(c, c.mul(c).mul(c.mul(-2).add(3)), 0.22));
      c.assign(c.mul(0.975).add(0.012));
      const qv = screenUV.sub(0.5).mul(vec2(T.screenSize.x.div(T.screenSize.y), 1));
      c.mulAssign(smoothstep(0.35, 1.15, length(qv)).mul(-0.42).add(1));
      // Körnung gegen Farbstufen
      const g = fract(sin(dot(screenUV.mul(T.screenSize).add(fract(U.time.mul(7.3)).mul(113)), vec2(12.9898, 78.233))).mul(43758.5453));
      c.addAssign(g.sub(0.5).div(160));
      return vec4(clamp(c, 0, 1), 1);
    })();
    const Pipe = mod.RenderPipeline || mod.PostProcessing;
    this.pipe = new Pipe(r);
    // ohne MSAA (mit GTAO) glättet FXAA die Kanten
    this.pipe.outputNode = aoFn && q.ao && this.fxaaFn ? this.fxaaFn(graded) : graded;
    this.camera = camera; this.post = post;
    r.toneMapping = THREE.NoToneMapping;
    return this.pipe;
  },
  // Sonne im Bild für die Lichtstrahlen (wie PostFX.render)
  frame(camera, P) {
    this.rays = 0;
    if (this.noRays) return;
    if (!(P.sunVis > 0.05)) return;
    const v = this._v || (this._v = new THREE.Vector3()), f = this._f || (this._f = new THREE.Vector3());
    camera.getWorldDirection(f);
    const facing = f.dot(P.sunDir);
    if (facing < 0.1) return;
    v.copy(P.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    this.sunUV.set(v.x * 0.5 + 0.5, 0.5 - v.y * 0.5);
    const off = Math.max(0, Math.abs(v.x) - 1, Math.abs(v.y) - 1);
    this.rays = P.sunVis * U.smoothstep(0.1, 0.45, facing) * (1 - U.smoothstep(0.2, 1.2, off)) * (0.6 + 0.6 * (P.golden || 0));
  },
};
