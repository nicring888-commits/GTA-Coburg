// Fassaden für den WebGPURenderer (seit v3.16.0, Grafik-Fahrplan Phase 11c): TSL-Fassung von World.facadeShader, Zweig für
// Zweig übertragen (Garage, Halle, Landhaus, Stadt, dann Glas, Putz, Relief, Nässe). Werte, die Licht und Ausgabe brauchen
// (Glas, Vorhang, Schaufenster, Licht im Fenster, Fenster-UV), stehen als Shader-Eigenschaften (property) bereit. Die
// Wandfarbe (Vertexfarbe) wird hier selbst verrechnet, weil Rahmen und Läden sie ersetzen (vertexColors aus).
'use strict';

NodeKit.facade = function (nm, tex, detail, archDebug) {
  const T = this.T, A = this.A, K = this;
  const { Fn, If, float, vec2, vec3, vec4, floor, fract, sin, dot, mix, clamp, max, min, abs, step, smoothstep, fwidth, dFdx, dFdy,
    normalize, length, pow, select, texture, uv, attribute, positionWorld, cameraPosition, normalWorld, property, reflect, vertexColor } = T;
  const v = (a, b, c) => vec3(a, b, c);
  const mod = (a, b) => a.sub(floor(a.div(b)).mul(b));
  const fh = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));
  const P = {
    glass: property('float', 'fcGlass'), shop: property('float', 'fcShop'), curtain: property('float', 'fcCurtain'),
    gvar: property('float', 'fcGlassVar'), flat: property('float', 'fcFlat'), lit: property('float', 'fcLit'),
    rural: property('float', 'fcRural'), uvg: property('vec2', 'fcUvG'), hb: property('float', 'fcHb'), diff: property('vec3', 'fcDiff'),
  };
  // Wandprofil (Attribute, je Wand gleich)
  // Int32-Puffer: in WebGPU ganzzahlige Vektoren, deshalb ausdrücklich in Gleitkomma umwandeln (sonst rechnet × 0,1 ganzzahlig)
  const aA = vec4(attribute('aProfA')), aB = vec4(attribute('aProfB')), aC = vec2(attribute('aProfC'));
  const pA0 = vec4(aA.xyz.mul(0.1), aA.w), pB0 = aB.mul(0.1), pC0 = vec2(aC.x.mul(0.1), aC.y);
  const topAtOf = (pA, pB) => u => select(u.lessThan(pA.y),
    mix(pB.x, pB.y, clamp(u.sub(pA.x).div(max(pA.y.sub(pA.x), 1e-3)), 0, 1)),
    mix(pB.y, pB.z, clamp(u.sub(pA.y).div(max(pA.z.sub(pA.y), 1e-3)), 0, 1)));
  const winFrame = k => select(k.lessThan(2.5), v(0.9, 0.9, 0.87), select(k.lessThan(3.5), v(0.93, 0.93, 0.91), select(k.lessThan(4.5), v(0.36, 0.23, 0.13),
    select(k.lessThan(5.5), v(0.2, 0.21, 0.22), select(k.lessThan(6.5), v(0.93, 0.93, 0.91), v(0.2, 0.21, 0.22))))));
  const winShut = k => select(k.lessThan(1.5), float(1), select(k.lessThan(2.5), float(0), select(k.lessThan(4.5), float(2), select(k.lessThan(5.5), float(3), select(k.lessThan(6.5), float(2), float(3))))));
  const winDiv = k => select(k.lessThan(2.5), float(2), select(k.lessThan(4.5), float(1), select(k.lessThan(5.5), float(0), select(k.lessThan(6.5), float(1), float(0)))));
  const archCol = (a, fw) => select(fw.greaterThan(0.5), v(0.42, 0.05, 0.04), select(a.lessThan(1.5), v(0.85, 0.2, 0.12), select(a.lessThan(2.5), v(0.9, 0.45, 0.12),
    select(a.lessThan(3.5), v(0.9, 0.8, 0.25), select(a.lessThan(4.5), v(0.3, 0.7, 0.3), select(a.lessThan(5.5), v(0.2, 0.5, 0.95), select(a.lessThan(6.5), v(0.62, 0.35, 0.8), v(0.3, 0.8, 0.85))))))));
  const box = ALTSTADT_BOX, dbg = K.u(archDebug);
  nm.vertexColors = false;

  nm.colorNode = Fn(() => {
    // Alle Werte, die mehrere Zweige brauchen, hier oben als Variablen festlegen: TSL legt einen mehrfach benutzten Knoten
    // dort als Variable an, wo er zuerst erzeugt wird – geschieht das in einem nicht ausgeführten Zweig, ist er anderswo 0
    const wpos = positionWorld.toVar(), wy = wpos.y, vUv = uv().toVar();
    const pA = pA0.toVar(), pB = pB0.toVar(), pC = pC0.toVar(), topAt = topAtOf(pA, pB);
    const S = K.map().rgb.toVar();               // sampledDiffuseColor
    const vcol = attribute('color', 'vec3').toVar();
    const c = K.color.mul(S).mul(vcol).toVar();                  // diffuseColor
    P.glass.assign(0); P.shop.assign(0); P.curtain.assign(0); P.gvar.assign(0); P.flat.assign(0); P.lit.assign(0); P.rural.assign(0);
    const qc = floor(vcol.mul(255).add(0.5));
    const bh = fh(qc.xy.add(qc.z.mul(0.37))).toVar(), bh2 = fh(qc.yz.mul(1.31).add(7.7)).toVar();
    const f2 = fract(bh2.mul(13.7));
    const kk = vec2(select(bh2.lessThan(0.3), float(1.1), select(bh2.lessThan(0.72), float(1), float(0.89))), select(f2.lessThan(0.35), float(1.07), select(f2.lessThan(0.75), float(1), float(0.9)))).toVar();
    const hasProf = pA.z.sub(pA.x).greaterThan(0.25).toVar();
    const styleRaw = select(hasProf, pA.w, float(0));
    const winK = floor(styleRaw.div(2048).add(0.001)).toVar(), sr = styleRaw.sub(winK.mul(2048));
    const matK = floor(sr.div(256).add(0.001)).toVar(), sr2 = sr.sub(matK.mul(256));
    const fwBit = floor(sr2.div(128).add(0.001)).toVar(), sr3 = sr2.sub(fwBit.mul(128));
    const arch = floor(sr3.div(8).add(0.001)).toVar(), style = sr3.sub(arch.mul(8)).toVar();
    const histA = arch.lessThan(2.5).toVar(), sied = abs(arch.sub(3)).lessThan(0.5).toVar(), efh = abs(arch.sub(4)).lessThan(0.5).toVar(), neu = abs(arch.sub(5)).lessThan(0.5).toVar();
    const uAl = vUv.x.mul(12.8);
    const W = select(hasProf, pA.z.sub(pA.x), float(1e4)).toVar();
    const uLoc = select(hasProf, uAl.sub(pA.x), uAl).toVar();
    const base = select(hasProf, pB.w, wy.sub(vUv.y.mul(12.4))).toVar();
    const h = wy.sub(base).toVar();
    const eave = select(hasProf, min(pB.x, pB.z), float(1e4)).toVar();
    const bwB = float(3.2).div(kk.x), fHB = float(3.1).div(kk.y);
    const bw = select(hasProf, W.div(max(1, floor(W.div(bwB).add(0.5)))), bwB).toVar();
    const Hs = eave.sub(base);
    const fH = select(hasProf.and(Hs.greaterThan(2)), clamp(Hs.div(max(1, floor(Hs.div(fHB).add(0.5)))), 2.6, 4.2), fHB).toVar();
    const gp = vec2(uLoc.div(bw), h.div(fH)).toVar();
    const fUv = gp.mul(0.25).toVar();
    P.uvg.assign(fUv);
    const cell = floor(gp).toVar(), loc = fract(gp).mul(vec2(bw, fH)).toVar();
    const frameC = select(bh.lessThan(0.5), v(0.86, 0.84, 0.79), select(bh.lessThan(0.78), v(0.56, 0.45, 0.33), v(0.5, 0.5, 0.49))).toVar();
    const wallBase = vec3(c).toVar();
    const glass = float(0).toVar(), frame = float(0).toVar(), relief = float(1).toVar(), reveal = float(0).toVar();
    const Vw = normalize(cameraPosition.sub(wpos)), Nw = normalize(normalWorld);
    const Tw0 = normalize(vec3(Nw.z, 0, Nw.x.negate()).add(1e-5));
    const su = dot(dFdx(wpos), Tw0).mul(dFdx(vUv.x)).add(dot(dFdy(wpos), Tw0).mul(dFdy(vUv.x)));
    const Tw = Tw0.mul(select(su.lessThan(0), float(-1), float(1)));
    const vt = vec3(dot(Vw, Tw), Vw.y, max(dot(Vw, Nw), 0.12)).toVar();
    const shop = float(0).toVar();
    const wr = fh(cell.add(bh.mul(7))).toVar();

    If(style.greaterThan(3.5).and(style.lessThan(5.5)), () => {
      // ===== Garage =====
      P.flat.assign(1);
      const gEra = (floor(pC.y.div(16).add(0.01))).toVar(), nD = (max(1, pC.y.sub(gEra.mul(16)))).toVar();
      If(h.lessThan(0.22), () => { c.mulAssign(0.62); });
      If(style.greaterThan(4.5), () => {
        const gq = 0.35, dw = (W.sub(nD.add(1).mul(gq)).div(nD)).toVar(), dh = (select(gEra.lessThan(0.5), float(2.3), float(2.05))).toVar();
        const k = (floor(uLoc.sub(gq).div(dw.add(gq)))).toVar(), xx = (uLoc.sub(gq).sub(k.mul(dw.add(gq)))).toVar();
        If(k.greaterThanEqual(0).and(k.lessThan(nD)).and(xx.lessThan(dw)).and(h.lessThan(dh)).and(dw.greaterThan(1.7)), () => {
          const dC = vec3(0).toVar(), rib = float(0).toVar(), fb = (fract(bh.mul(3.1))).toVar();
          If(gEra.lessThan(0.5), () => { dC.assign(v(0.3, 0.2, 0.12)); rib.assign(step(fract(xx.div(0.16)), 0.1).add(step(abs(xx.sub(dw.mul(0.5))), 0.03))); })
            .ElseIf(gEra.lessThan(1.5), () => { dC.assign(select(fb.lessThan(0.4), v(0.76, 0.76, 0.73), select(fb.lessThan(0.7), v(0.32, 0.42, 0.34), v(0.88, 0.88, 0.85)))); rib.assign(step(fract(xx.div(0.11)), 0.14)); })
            .ElseIf(gEra.lessThan(2.5), () => { dC.assign(select(fb.lessThan(0.55), v(0.4, 0.27, 0.16), v(0.88, 0.88, 0.85))); rib.assign(step(fract(xx.div(0.11)), 0.14)); })
            .Else(() => { dC.assign(select(fb.lessThan(0.6), v(0.21, 0.22, 0.23), v(0.9, 0.9, 0.88))); rib.assign(step(fract(h.div(0.5)), 0.05)); });
          const edge = (step(min(min(xx, dw.sub(xx)), dh.sub(h)), 0.05)).toVar();
          c.assign(dC.mul(min(rib, 1).mul(-0.16).add(1)).mul(edge.mul(-0.4).add(1)).mul(S));
          relief.assign(min(rib, 1).oneMinus().mul(0.14).add(0.86));
        });
      });
    }).ElseIf(style.greaterThan(5.5), () => {
      // ===== Halle =====
      P.flat.assign(1);
      const hk = (floor(pC.y.div(16).add(0.01))).toVar(), nG = (pC.y.sub(hk.mul(16))).toVar();
      const Hh = (eave.sub(base)).toVar(), front = (style.greaterThan(6.5)).toVar();
      If(hk.lessThan(0.5).or(hk.greaterThan(2.5)), () => {
        const pr = (select(hk.greaterThan(2.5), float(0.3), float(0.25))).toVar(), f = (fract(uLoc.div(pr))).toVar();
        const rb = (smoothstep(0, 0.06, f).mul(smoothstep(0.34, 0.42, f).oneMinus())).toVar();
        relief.assign(mix(rb, 0.4, smoothstep(0.03, 0.08, fwidth(uLoc.div(pr)))).mul(0.14).add(0.86));
      }).Else(() => {
        const pw = (select(hk.greaterThan(1.5), float(1.2), float(1))).toVar(), j = (step(fract(h.div(pw)), 0.035)).toVar();
        relief.assign(mix(j, 0.035, smoothstep(0.02, 0.05, fwidth(h.div(pw)))).mul(-0.3).add(1));
      });
      const sock = (select(hk.greaterThan(2.5), fract(bh.mul(3.3)).add(1.8), fract(bh.mul(5.1)).mul(0.45).add(0.35))).toVar();
      If(h.lessThan(sock), () => { c.assign(v(0.6, 0.59, 0.56).mul(S)); relief.assign(step(fract(uLoc.div(6)), 0.012).mul(-0.3).add(1)); });
      const bandH = (select(hk.greaterThan(0.5).and(hk.lessThan(2.5)), float(0.55), float(0.2))).toVar();
      If(wy.greaterThan(eave.sub(bandH)).and(wy.lessThan(eave.add(0.02)).or(pB.y.sub(eave).lessThan(0.05))), () => {
        c.assign(select(fract(bh.mul(6.7)).lessThan(0.5), v(0.22, 0.23, 0.25), wallBase.mul(0.72)).mul(S)); relief.assign(1);
      });
      const officeW = (W.mul(mix(0.25, 0.6, fract(bh.mul(4.3))))).toVar();
      const office = (hk.greaterThan(0.5).and(hk.lessThan(1.5)).and(uLoc.lessThan(officeW)).and(front.not().or(nG.lessThan(0.5)))).toVar();
      If(hk.lessThan(0.5).and(Hh.greaterThan(5)).and(h.greaterThan(Hh.sub(2))).and(h.lessThan(Hh.sub(1.05))).and(uLoc.greaterThan(0.6)).and(uLoc.lessThan(W.sub(0.6))), () => {
        c.assign(v(0.62, 0.68, 0.7).mul(S));
        frame.assign(step(fract(uLoc.div(1.05)), 0.05)); frameC.assign(v(0.55, 0.56, 0.57));
        relief.assign(0.9); P.gvar.assign(0.5);
      }).ElseIf(office.and(uLoc.greaterThan(0.6)).and(h.greaterThan(1).and(h.lessThan(2.25)).or(Hh.greaterThan(6.4).and(h.greaterThan(4)).and(h.lessThan(5.2)))), () => {
        glass.assign(step(fract(uLoc.div(1.35)), 0.06).oneMinus()); frame.assign(glass.oneMinus()); frameC.assign(v(0.22, 0.23, 0.24));
        P.lit.assign(glass.mul(step(0.55, fh(vec2(floor(uLoc.div(1.35)), floor(h.div(3))).add(bh.mul(5))))));
      });
      If(front.and(hk.greaterThan(1.5)).and(hk.lessThan(2.5)), () => {
        const g0 = (W.mul(mix(0.06, 0.18, fract(bh.mul(2.1))))).toVar(), g1 = (W.mul(mix(0.45, 0.85, fract(bh.mul(8.9))))).toVar();
        If(uLoc.greaterThan(g0).and(uLoc.lessThan(g1)).and(h.greaterThan(0.12)).and(h.lessThan(Hh.sub(bandH).sub(0.15))), () => {
          const xx = (uLoc.sub(g0)).toVar();
          frame.assign(max(step(fract(xx.div(1.25)), 0.05), step(abs(h.sub(2.6)), 0.05)));
          glass.assign(frame.oneMinus()); frameC.assign(v(0.2, 0.21, 0.22)); P.shop.assign(glass.mul(step(h, 2.6)));
          If(xx.greaterThan(1.3).and(xx.lessThan(3.7)).and(h.lessThan(2.4)), () => { glass.assign(0.6); frame.assign(step(abs(xx.sub(2.5)), 0.03).add(step(2.33, h))); P.shop.assign(0.6); });
          c.assign(wallBase); relief.assign(1);
        });
      }).ElseIf(front.and(nG.greaterThan(0.5)), () => {
        const gw0 = (select(hk.greaterThan(2.5), float(5), select(hk.greaterThan(0.5), float(3.6), float(4.5)))).toVar();
        const gh = (min(Hh.sub(0.8), select(hk.greaterThan(2.5), float(4.6), select(hk.greaterThan(0.5), float(3.9), float(4.6))))).toVar();
        const gw = (min(gw0, W.sub(1).div(nG).sub(0.8))).toVar();
        const gap = (W.sub(nG.mul(gw)).div(nG.add(1))).toVar(), k = (floor(uLoc.sub(gap).div(gw.add(gap)))).toVar(), xx = (uLoc.sub(gap).sub(k.mul(gw.add(gap)))).toVar();
        If(k.greaterThanEqual(0).and(k.lessThan(nG)).and(xx.greaterThan(0)).and(xx.lessThan(gw)).and(h.lessThan(gh)).and(gw.greaterThan(2.2)), () => {
          const gC = vec3(0).toVar(), ln = float(0).toVar(), fb = (fract(bh.mul(3.9))).toVar();
          If(hk.greaterThan(2.5), () => { gC.assign(select(fb.lessThan(0.5), v(0.42, 0.3, 0.19), v(0.36, 0.43, 0.36))); ln.assign(step(fract(xx.div(0.3)), 0.08).add(step(abs(xx.sub(gw.mul(0.5))), 0.04))); })
            .ElseIf(hk.greaterThan(0.5), () => {
              gC.assign(select(fb.lessThan(0.6), v(0.9, 0.9, 0.88), v(0.23, 0.24, 0.26))); ln.assign(step(fract(h.div(0.55)), 0.05));
              If(h.greaterThan(2.6).and(h.lessThan(3)).and(fract(xx.div(0.9)).greaterThan(0.1)), () => { glass.assign(1); });
            })
            .Else(() => { gC.assign(select(fb.lessThan(0.4), v(0.7, 0.71, 0.7), select(fb.lessThan(0.7), v(0.25, 0.36, 0.52), v(0.86, 0.86, 0.83)))); ln.assign(step(fract(h.div(0.11)), 0.2)); });
          ln.assign(mix(min(ln, 1), 0.15, smoothstep(0.02, 0.05, fwidth(h))));
          const edge = (step(min(min(xx, gw.sub(xx)), gh.sub(h)), 0.08)).toVar();
          c.assign(gC.mul(ln.mul(-0.18).add(1)).mul(edge.mul(-0.45).add(1)).mul(S));
          relief.assign(ln.oneMinus().mul(0.1).add(0.9));
        });
        const dx0 = (gap.sub(1.6)).toVar();
        If(hk.lessThan(1.5).and(dx0.greaterThan(0.4)).and(uLoc.greaterThan(dx0)).and(uLoc.lessThan(dx0.add(1))).and(h.lessThan(2.1)), () => {
          c.assign(v(0.3, 0.31, 0.33).mul(S)); relief.assign(step(0.05, min(uLoc.sub(dx0), dx0.add(1).sub(uLoc))).mul(0.2).add(0.8));
        });
      });
      c.assign(mix(c, frameC.mul(S), frame));
    }).ElseIf(style.greaterThan(0.5).and(style.lessThan(2.5)), () => {
      // ===== Landhaus =====
      P.rural.assign(1); P.flat.assign(1);
      const hEG = 2.8, hOG = 2.65;
      const fl = (select(h.lessThan(hEG), float(0), floor(h.sub(hEG).div(hOG)).add(1))).toVar();
      const flBot = (base.add(select(fl.lessThan(0.5), float(0), fl.sub(1).mul(hOG).add(hEG)))).toVar();
      const nS = (max(1, floor(W.div(3.1)))).toVar(), sw = (W.div(nS)).toVar();
      const s = (floor(uLoc.div(sw))).toVar();
      const wseed = (fh(floor(vec2(pA.x, pB.y).mul(2).add(0.5)).mul(0.137).add(bh))).toVar();
      const ws = (fh(vec2(s.mul(1.7).add(fl.mul(5.3)), wseed.mul(19)))).toVar();
      const attic = (flBot.greaterThan(eave.sub(0.4))).toVar();
      const ww = mix(0.82, 1.12, fract(bh.mul(5.3))).toVar(), whh = mix(1.18, 1.42, fract(bh.mul(9.1))).toVar();
      If(fl.greaterThan(0.5), () => { whh.mulAssign(0.93); });
      If(attic, () => { ww.mulAssign(0.72); whh.assign(0.92); });
      const tall = float(0).toVar();
      If(sied, () => { ww.assign(mix(0.95, 1.2, fract(bh.mul(5.3)))); whh.assign(mix(1.2, 1.35, fract(bh.mul(9.1)))); })
        .ElseIf(efh, () => { ww.assign(mix(1.1, 1.65, fract(bh.mul(5.3)))); whh.assign(mix(1.25, 1.4, fract(bh.mul(9.1)))); })
        .ElseIf(neu, () => {
          ww.assign(mix(1, 1.9, fract(bh.mul(5.3)))); whh.assign(mix(1.3, 1.5, fract(bh.mul(9.1))));
          tall.assign(select(fl.lessThan(0.5).and(fh(vec2(s.mul(3.1), wseed.mul(5))).lessThan(0.45)), float(1), float(0)));
          If(tall.greaterThan(0.5), () => { ww.assign(mix(1, 2.2, fract(bh.mul(3.9)))); whh.assign(2.15); });
        });
      If(winK.greaterThan(5.5), () => {
        tall.assign(select(fl.lessThan(0.5).and(fh(vec2(s.mul(3.1), wseed.mul(5))).lessThan(0.55)), float(1), float(0)));
        If(tall.greaterThan(0.5), () => { ww.assign(mix(1, 2.2, fract(bh.mul(3.9)))); whh.assign(2.15); });
      }).ElseIf(winK.greaterThan(0.5).and(tall.greaterThan(0.5)), () => { tall.assign(0); ww.assign(mix(1, 1.9, fract(bh.mul(5.3)))); whh.assign(mix(1.3, 1.5, fract(bh.mul(9.1)))); });
      If(histA.not().and(attic), () => { ww.assign(min(ww, 1)); whh.assign(1); });
      const isTall = (tall.greaterThan(0.5)).toVar();
      const sill = (select(attic, float(0.65), select(isTall, float(0.05), float(0.88)))).toVar();
      const isDoor = (style.greaterThan(1.5).and(fl.lessThan(0.5)).and(abs(s.sub(pC.y)).lessThan(0.5))).toVar();
      const cx = (s.add(0.5).mul(sw).add(select(isDoor.or(histA.not()), float(0), fh(vec2(s, wseed.mul(7))).sub(0.5).mul(min(0.5, sw.mul(0.16)))))).toVar();
      const wsz = (select(isDoor, vec2(1.05, 2.15), vec2(ww, whh))).toVar();
      const rl = (cx.sub(wsz.x.mul(0.5))).toVar(), rb = (flBot.add(select(isDoor, float(0), sill))).toVar();
      const rt = (rb.add(wsz.y)).toVar();
      const tp = (min(topAt(pA.x.add(rl).sub(0.2)), topAt(pA.x.add(rl).add(wsz.x).add(0.2)))).toVar();
      const ok = (isDoor.or(ws.greaterThan(select(histA, float(0.16), float(0.08)))).and(rl.greaterThan(0.35)).and(rl.add(wsz.x).lessThan(W.sub(0.35))) .and(rt.lessThan(tp.sub(0.3))).and(rb.greaterThan(pC.x.add(0.2))).and(W.greaterThan(1.6))).toVar();
      const q = (vec2(uLoc.sub(rl), wy.sub(rb))).toVar();
      const fasche = (select(fract(bh.mul(3.3)).lessThan(0.5), wallBase.mul(1.12), v(0.62, 0.55, 0.45).mul(S))).toVar();
      If(ok, () => {
        const inWin = (q.x.greaterThan(0).and(q.x.lessThan(wsz.x)).and(q.y.greaterThan(0)).and(q.y.lessThan(wsz.y))).toVar();
        const fb = (select(histA, float(0.13), select(sied, float(0.07), float(0)))).toVar();
        If(fb.greaterThan(0).and(inWin.not()).and(q.x.greaterThan(fb.negate())).and(q.x.lessThan(wsz.x.add(fb))).and(q.y.greaterThan(fb.negate())).and(q.y.lessThan(wsz.y.add(fb))), () => { c.assign(fasche); relief.assign(0.93); });
        If(histA.and(isDoor.not()).and(q.y.lessThan(0)).and(q.y.greaterThan(-0.08)).and(q.x.greaterThan(-0.18)).and(q.x.lessThan(wsz.x.add(0.18))), () => { c.assign(v(0.6, 0.55, 0.46).mul(S)); relief.assign(0.85); });
        If(histA.not().and(isDoor.not()).and(isTall.not()).and(q.y.lessThan(0)).and(q.y.greaterThan(-0.05)).and(q.x.greaterThan(-0.05)).and(q.x.lessThan(wsz.x.add(0.05))), () => {
          c.assign(select(sied, v(0.62, 0.6, 0.56), v(0.55, 0.56, 0.57)).mul(S)); relief.assign(0.85);
        });
        const shutOn = (select(winK.greaterThan(0.5), winK.lessThan(1.5), histA.and(fract(bh.mul(2.3)).lessThan(0.45)))).toVar();
        If(isDoor.not().and(attic.not()).and(shutOn).and(q.y.greaterThan(0)).and(q.y.lessThan(wsz.y))
          .and(q.x.lessThan(fb.negate()).and(q.x.greaterThan(fb.negate().sub(wsz.x.mul(0.5)))).or(q.x.greaterThan(wsz.x.add(fb)).and(q.x.lessThan(wsz.x.add(fb).add(wsz.x.mul(0.5)))))), () => {
          const f7 = (fract(bh.mul(7.7))).toVar();
          const shC = (select(f7.lessThan(0.35), v(0.16, 0.26, 0.17), select(f7.lessThan(0.65), v(0.3, 0.19, 0.11), v(0.3, 0.35, 0.4)))).toVar();
          const lp = (q.y.div(0.07)).toVar(), louv = (mix(0.5, step(0.5, fract(lp)), smoothstep(0.25, 0.6, fwidth(lp)).oneMinus())).toVar();
          c.assign(shC.mul(louv.mul(0.25).add(0.85))); relief.assign(louv.mul(0.2).add(0.8));
        });
        If(inWin.and(isDoor), () => {
          const f6 = (fract(bh.mul(6.1))).toVar();
          const dC = select(f6.lessThan(0.4), v(0.28, 0.16, 0.08), select(f6.lessThan(0.7), v(0.13, 0.22, 0.15), v(0.42, 0.12, 0.08))).toVar();
          If(neu, () => { dC.assign(v(0.17, 0.18, 0.19)); })
            .ElseIf(efh, () => { dC.assign(select(f6.lessThan(0.6), v(0.34, 0.21, 0.11), v(0.85, 0.85, 0.83))); })
            .ElseIf(sied, () => { dC.assign(select(f6.lessThan(0.5), v(0.4, 0.3, 0.2), v(0.55, 0.5, 0.42))); });
          c.assign(dC);
          const px = (abs(q.x.sub(wsz.x.mul(0.5)))).toVar();
          const panel = (step(0.12, q.x).mul(step(q.x, wsz.x.sub(0.12))).mul(step(0.2, q.y)).mul(step(q.y, 1.5)).mul(step(0.06, px))).toVar();
          relief.assign(panel.mul(step(0.03, min(min(q.x.sub(0.12), wsz.x.sub(0.12).sub(q.x)), min(q.y.sub(0.2), float(1.5).sub(q.y)))).oneMinus()).mul(-0.25).add(1));
          If(q.y.greaterThan(1.62).and(q.y.lessThan(2)).and(q.x.greaterThan(0.18)).and(q.x.lessThan(wsz.x.sub(0.18))).and(neu.not()), () => { glass.assign(1); });
          If(neu, () => { relief.assign(1); If(q.x.greaterThan(wsz.x.mul(0.64)).and(q.x.lessThan(wsz.x.mul(0.84))).and(q.y.greaterThan(0.15)).and(q.y.lessThan(1.95)), () => { glass.assign(1); }); });
          If(q.y.lessThan(0.04), () => { relief.assign(0.7); });
        }).ElseIf(inWin, () => {
          const q2 = (q.sub(vt.xy.div(vt.z).mul(0.14))).toVar();
          If(q2.x.lessThan(0).or(q2.x.greaterThan(wsz.x)).or(q2.y.lessThan(0)).or(q2.y.greaterThan(wsz.y)), () => { reveal.assign(1); }).Else(() => {
            const bord = (step(min(min(q2.x, wsz.x.sub(q2.x)), min(q2.y, wsz.y.sub(q2.y))), 0.06)).toVar();
            const dv = (select(winK.greaterThan(0.5), winDiv(winK), float(-1))).toVar();
            const noMull = (select(dv.greaterThan(-0.5), dv.lessThan(0.5).or(wsz.x.lessThan(0.95)), neu.and(wsz.x.lessThan(1.3)))).toVar();
            const mull = (select(noMull, float(0), step(abs(q2.x.sub(wsz.x.mul(0.5))), 0.03))).toVar();
            const noTrans = (select(dv.greaterThan(-0.5), dv.lessThan(1.5).or(isTall), neu.or(isTall).or(efh.and(fract(bh.mul(2.7)).lessThan(0.5))))).toVar();
            const trans = (select(noTrans, float(0), step(abs(q2.y.sub(wsz.y.mul(0.64))), 0.03))).toVar();
            frame.assign(mix(max(bord, max(mull, trans)), 0.32, smoothstep(0.02, 0.05, fwidth(q2.x))));
            glass.assign(frame.oneMinus());
            const f49 = (fract(bh.mul(4.9))).toVar();
            frameC.assign(select(f49.lessThan(0.75), v(0.9, 0.9, 0.87), v(0.32, 0.2, 0.12)));
            If(neu, () => { frameC.assign(select(f49.lessThan(0.6), v(0.2, 0.21, 0.22), v(0.92, 0.92, 0.9))); })
              .ElseIf(efh, () => { frameC.assign(select(f49.lessThan(0.5), v(0.36, 0.23, 0.13), v(0.9, 0.9, 0.88))); })
              .ElseIf(sied, () => { frameC.assign(v(0.9, 0.9, 0.87)); });
            If(winK.greaterThan(0.5), () => { frameC.assign(winFrame(winK)); });
            P.lit.assign(glass.mul(step(0.5, fh(vec2(s, fl).add(bh.mul(3))))));
            const rk = (fh(vec2(s.mul(1.3).add(fl.mul(2.1)), wseed.mul(11)))).toVar();
            const shT = (select(winK.greaterThan(0.5), winShut(winK), select(histA, float(0), select(neu, float(3), float(2))))).toVar();
            const rq = (select(shT.greaterThan(2.5), float(0.4), float(0.3))).toVar();
            If(shT.greaterThan(1.5).and(rk.lessThan(rq)).and(q2.y.greaterThan(wsz.y.mul(rk.div(rq).mul(-0.85).add(1)))), () => {
              const rC = (select(shT.greaterThan(2.5), v(0.3, 0.31, 0.32), select(frameC.x.lessThan(0.5), v(0.4, 0.27, 0.16), v(0.8, 0.79, 0.75)))).toVar();
              const lp = (q2.y.div(select(shT.greaterThan(2.5), float(0.03), float(0.045)))).toVar();
              const lam = (mix(0.5, step(0.5, fract(lp)), smoothstep(0.25, 0.6, fwidth(lp)).oneMinus())).toVar();
              c.assign(rC.mul(lam.mul(0.2).add(0.85)).mul(S));
              glass.assign(0); frame.assign(0); P.lit.assign(0); relief.assign(lam.mul(0.15).add(0.85));
            });
          });
        });
      });
      // Sockel
      const sock = (select(histA, mix(0.45, 0.85, fract(bh.mul(8.3))), mix(0.3, 0.5, fract(bh.mul(8.3))))).toVar();
      const inOpen = (ok.and(q.x.greaterThan(-0.02)).and(q.x.lessThan(wsz.x.add(0.02))).and(q.y.greaterThan(-0.1)).and(q.y.lessThan(wsz.y.add(0.02)))).toVar();
      If(histA.not().and(h.lessThan(sock)).and(inOpen.not()), () => {
        const f29 = (fract(bh.mul(2.9))).toVar();
        c.assign(select(neu, select(f29.lessThan(0.6), v(0.26, 0.27, 0.28), v(0.5, 0.5, 0.49)), select(efh, v(0.5, 0.48, 0.45), v(0.56, 0.54, 0.5))).mul(S));
        frame.assign(0); reveal.assign(0);
      }).ElseIf(histA.and(h.lessThan(sock)).and(glass.lessThan(0.5)).and(isDoor.and(ok).and(q.x.greaterThan(0)).and(q.x.lessThan(wsz.x)).not()), () => {
        const sC = (select(fract(bh.mul(2.9)).lessThan(0.6), v(0.66, 0.58, 0.44), v(0.55, 0.36, 0.28))).toVar();
        const joint = (step(fract(h.div(0.3)), 0.06).add(step(fract(uLoc.add(step(0.5, fract(h.div(0.6))).mul(0.3)).div(0.6)), 0.04))).toVar();
        c.assign(sC.mul(S).mul(min(joint, 1).mul(-0.35).add(1)));
        frame.assign(0); reveal.assign(0);
      });
      // Eckquader
      If(histA.and(fract(bh.mul(4.1)).lessThan(0.3)).and(h.greaterThan(sock)).and(h.lessThan(eave.sub(base))), () => {
        const bi = (floor(h.div(0.34))).toVar(), wq = (select(mod(bi, 2).lessThan(0.5), float(0.45), float(0.28))).toVar();
        If(uLoc.lessThan(wq).or(uLoc.greaterThan(W.sub(wq))), () => { c.assign(v(0.68, 0.6, 0.47).mul(S).mul(step(fract(h.div(0.34)), 0.05).mul(-0.3).add(1))); });
      });
      // Wandbaustoffe
      const upper = (wy.greaterThan(eave.add(0.15))).toVar(), ogz = (fl.greaterThan(0.5).or(upper)).toVar();
      const boards = (select(matK.greaterThan(0.5), abs(matK.sub(2)).lessThan(0.5).and(select(neu, fl.greaterThan(0.5).and(fract(wseed.mul(3.7)).lessThan(0.5)), upper)).or(abs(matK.sub(6)).lessThan(0.5)), efh.and(fract(bh.mul(12.7)).lessThan(0.35)).and(upper).or(neu.and(fract(bh.mul(11.3)).lessThan(0.28)).and(fl.greaterThan(0.5)).and(fract(wseed.mul(3.7)).lessThan(0.5))))).toVar();
      If(inOpen.not().and(glass.lessThan(0.5)).and(reveal.lessThan(0.5)), () => {
        If(abs(matK.sub(1)).lessThan(0.5).and(h.greaterThan(sock)).or(abs(matK.sub(5)).lessThan(0.5).and(h.lessThan(0.95))), () => {
          const kyB = (h.div(0.083)).toVar(), rowB = (floor(kyB)).toVar(), kxB = (uLoc.div(0.25).add(mod(rowB, 2).mul(0.5))).toVar();
          const mB = (mix(max(step(fract(kyB), 0.15), step(fract(kxB), 0.05)), 0.2, smoothstep(0.03, 0.09, fwidth(kyB)))).toVar();
          const kC = (select(matK.lessThan(1.5), wallBase, select(fract(bh.mul(3.7)).lessThan(0.7), v(0.55, 0.28, 0.2), v(0.78, 0.66, 0.46)).mul(S))).toVar();
          c.assign(mix(kC.mul(fh(vec2(floor(kxB), rowB)).mul(0.2).add(0.9)), v(0.7, 0.69, 0.66).mul(S), mB));
          frame.assign(0); relief.assign(mB.mul(-0.15).add(1));
        }).ElseIf(abs(matK.sub(3)).lessThan(0.5).and(upper).or(abs(matK.sub(4)).lessThan(0.5).and(ogz).and(h.greaterThan(sock))), () => {
          const sl = (matK.greaterThan(3.5)).toVar();
          const ch = (select(sl, float(0.17), float(0.2))).toVar(), rS = (floor(h.div(ch))).toVar(), xS = (uLoc.div(select(sl, float(0.24), float(0.4))).add(mod(rS, 2).mul(0.5))).toVar();
          const fy = (fract(h.div(ch))).toVar(), fx = (fract(xS)).toVar();
          const edge0 = (select(sl, step(fy, pow(abs(fx.sub(0.5)).mul(2), 2).mul(0.35).add(0.12)), max(step(fy, 0.08), step(fx, 0.03)))).toVar();
          const edge = (mix(edge0, 0.25, smoothstep(0.03, 0.08, fwidth(h.div(ch))))).toVar();
          const sC = (select(sl, v(0.33, 0.35, 0.38), select(fract(bh.mul(6.1)).lessThan(0.6), v(0.58, 0.58, 0.56), v(0.48, 0.42, 0.37)))).toVar();
          c.assign(sC.mul(fh(vec2(floor(xS), rS)).mul(0.15).add(0.9)).mul(edge.mul(-0.35).add(1)).mul(S));
          frame.assign(0); relief.assign(edge.mul(-0.2).add(1));
        });
      });
      If(boards.and(inOpen.not()).and(h.greaterThan(sock)), () => {
        const bC = (select(abs(matK.sub(6)).lessThan(0.5), wallBase.div(max(S, vec3(0.01))), select(neu, select(fract(bh.mul(5.9)).lessThan(0.5), v(0.62, 0.45, 0.3), v(0.22, 0.23, 0.24)), v(0.42, 0.28, 0.16)))).toVar();
        const bd = (fract(uLoc.div(select(neu, float(0.14), float(0.11))))).toVar();
        c.assign(bC.mul(step(0.08, bd).mul(0.18).add(0.82)).mul(S));
        relief.assign(step(0.08, bd).mul(0.1).add(0.9));
      });
      // Fachwerk (nur belegt)
      If(fwBit.greaterThan(0.5).and(fl.greaterThan(0.5)).and(glass.lessThan(0.5)).and(reveal.lessThan(0.5)), () => {
        const ly = (wy.sub(flBot)).toVar(), xs = (uLoc.sub(s.mul(sw))).toVar(), b2 = 0.09;
        const beam = step(ly, 0.18).add(step(hOG - 0.12, ly)).add(step(abs(ly.sub(sill.sub(0.05))), b2)) .add(step(abs(ly.sub(sill.add(whh).add(0.06))), b2)).add(step(xs, b2)).add(step(sw.sub(b2), xs)).toVar();
        If(ok, () => { beam.addAssign(step(abs(uLoc.sub(rl.sub(0.17))), b2).add(step(abs(uLoc.sub(rl.add(wsz.x).add(0.17))), b2))); })
          .Else(() => { beam.addAssign(step(abs(xs.mul(float(hOG).div(sw)).sub(ly)), b2 * 1.4).add(step(abs(sw.sub(xs).mul(float(hOG).div(sw)).sub(ly)), b2 * 1.4))); });
        const beamC = (select(fract(bh.mul(3.7)).lessThan(0.6), v(0.12, 0.07, 0.04), v(0.28, 0.085, 0.055)).mul(S)).toVar();
        If(frame.lessThan(0.5), () => { c.assign(mix(v(0.88, 0.85, 0.78).mul(S), beamC, min(beam, 1))); });
      });
      If(reveal.greaterThan(0.5), () => { c.assign(fasche.mul(0.55)); });
      c.assign(mix(c, frameC.mul(S), frame));
    }).Else(() => {
      // ===== Stadt =====
      const fm = (texture(tex.mask, fUv)).toVar();
      glass.assign(fm.r); frame.assign(fm.g); relief.assign(fm.b);
      const winOK = select(style.lessThan(2.5), float(1), float(0)).toVar();
      If(hasProf, () => {
        const wl = (cell.x.add(0.23).mul(bw)).toVar(), wrr = (cell.x.add(0.77).mul(bw)).toVar();
        const wt = (base.add(cell.y.add(0.914).mul(fH))).toVar(), wbt = (base.add(cell.y.add(0.254).mul(fH))).toVar();
        const tp = (min(topAt(pA.x.add(wl)), topAt(pA.x.add(wrr)))).toVar();


        If(W.lessThan(1.7).or(wl.lessThan(0.15)).or(wrr.greaterThan(W.sub(0.15))).or(wt.greaterThan(tp.sub(0.25))).or(wbt.lessThan(pC.x.add(0.15))), () => { winOK.assign(0); });
      });
      If(winOK.lessThan(0.5), () => { glass.assign(0); frame.assign(0); relief.assign(1); P.flat.assign(1); })
        .ElseIf(texture(tex.depth, fUv).r.greaterThan(0.5), () => {
          const offM = (vt.xy.div(vt.z).mul(-0.22)).toVar();
          const g2 = (fUv.add(offM.div(vec2(bw.mul(4), fH.mul(4))))).toVar();
          P.uvg.assign(g2);
          If(texture(tex.depth, g2).r.lessThan(0.5), () => { reveal.assign(1); glass.assign(0); frame.assign(0); relief.assign(1); })
            .Else(() => { const fm2 = texture(tex.mask, g2); glass.assign(fm2.r); frame.assign(fm2.g); relief.assign(fm2.b); });
        });
      const gew = float(0).toVar();
      const gewC = (select(winK.greaterThan(4.5), v(0.62, 0.2, 0.15), select(winK.greaterThan(1.5).and(winK.lessThan(2.5)), wallBase.mul(1.1), v(0.8, 0.73, 0.6).mul(S)))).toVar();
      const grz = (winK.greaterThan(2.5).and(winK.lessThan(3.5))).toVar();
      const ox0 = (bw.mul(0.3125)).toVar(), ox1 = (bw.mul(0.6875)).toVar(), oy0 = (fH.mul(0.297)).toVar(), oy1 = (fH.mul(0.836)).toVar();
      const inOp = (loc.x.greaterThan(ox0).and(loc.x.lessThan(ox1)).and(loc.y.greaterThan(oy0)).and(loc.y.lessThan(oy1))).toVar();
      If(winK.greaterThan(0.5).and(winOK.greaterThan(0.5)), () => {
        If(frame.greaterThan(0.3).and(inOp.not()), () => { gew.assign(1); });
        If(grz, () => {
          const rad = (ox1.sub(ox0).mul(0.5)).toVar(), sg = (select(cell.y.lessThan(0.5), rad, rad.mul(0.28))).toVar();
          const Rr = (rad.mul(rad).add(sg.mul(sg)).div(sg.mul(2))).toVar(), cyA = (oy1.sub(Rr)).toVar(), dA = (length(vec2(loc.x.sub(ox0.add(ox1).mul(0.5)), loc.y.sub(cyA)))).toVar();
          If(loc.y.greaterThan(oy1.sub(sg)).and(loc.x.greaterThan(ox0.sub(0.2))).and(loc.x.lessThan(ox1.add(0.2))).and(loc.y.lessThan(oy1.add(0.25))), () => {
            If(dA.greaterThan(Rr.add(0.15)), () => { gew.assign(0); frame.assign(0); glass.assign(0); reveal.assign(0); relief.assign(1); })
              .ElseIf(dA.greaterThan(Rr), () => { gew.assign(1); frame.assign(1); glass.assign(0); reveal.assign(0); relief.assign(0.95); });
          });
        });
        If(winK.greaterThan(1.5).and(winK.lessThan(2.5)).or(winK.greaterThan(3.5).and(winK.lessThan(4.5))).and(loc.y.greaterThan(oy0)).and(loc.y.lessThan(oy1)), () => {
          const swd = (ox1.sub(ox0).mul(0.5)).toVar();
          If(loc.x.lessThan(ox0.sub(0.15)).and(loc.x.greaterThan(ox0.sub(0.15).sub(swd))).or(loc.x.greaterThan(ox1.add(0.15)).and(loc.x.lessThan(ox1.add(0.15).add(swd)))), () => {
            const f7 = (fract(bh.mul(7.7))).toVar();
            const shC = (select(f7.lessThan(0.55), v(0.22, 0.29, 0.22), select(f7.lessThan(0.8), v(0.4, 0.42, 0.42), v(0.32, 0.21, 0.13)))).toVar();
            const lp = (loc.y.div(0.07)).toVar(), louv = (mix(0.5, step(0.5, fract(lp)), smoothstep(0.25, 0.6, fwidth(lp)).oneMinus())).toVar();
            c.assign(shC.mul(louv.mul(0.25).add(0.85)).mul(S));
            glass.assign(0); frame.assign(0); gew.assign(0); reveal.assign(0); relief.assign(louv.mul(0.2).add(0.8));
          });
        });
      });
      // Schaufenster im Erdgeschoss der Altstadt
      const isShop = (wpos.x.greaterThan(box.minX).and(wpos.x.lessThan(box.maxX)).and(wpos.z.greaterThan(box.minZ)).and(wpos.z.lessThan(box.maxZ)) .and(bh.lessThan(0.82)).and(h.greaterThan(-0.3)).and(h.lessThan(3.1)).and(W.greaterThan(2.2))).toVar();
      If(isShop, () => {
        shop.assign(1);
        const door = (step(0.72, fh(cell.add(bh.mul(13))))).toVar(), lx = (fract(gp.x)).toVar();
        const gx0 = (select(door.greaterThan(0.5), float(0.33), float(0.08))).toVar(), gx1 = (select(door.greaterThan(0.5), float(0.67), float(0.92))).toVar();
        const gy0 = (select(door.greaterThan(0.5), float(0.02), float(0.5))).toVar(), gy1 = (min(2.55, eave.sub(base).sub(0.4))).toVar();
        const ex = 0.025;
        const inG = (step(gx0, lx).mul(step(lx, gx1)).mul(step(gy0, h)).mul(step(h, gy1))).toVar();
        const inF = (step(gx0.sub(ex), lx).mul(step(lx, gx1.add(ex))).mul(step(gy0.sub(0.08), h)).mul(step(h, gy1.add(0.08)))).toVar();
        glass.assign(inG); frame.assign(inF.sub(inG)); relief.assign(inG.mul(smoothstep(gy1.sub(0.3), gy1, h)).mul(-0.35).add(1)); reveal.assign(0);
        P.flat.assign(1); frameC.assign(v(0.12, 0.12, 0.13));
        c.mulAssign(step(2.65, h).mul(-0.18).add(1));
        P.shop.assign(inG);
      }).ElseIf(h.lessThan(0.45).and(h.greaterThan(-2.5)), () => {
        c.assign(mix(c, v(0.42, 0.41, 0.39).mul(S), 0.75));
        glass.assign(0); frame.assign(0); relief.assign(1); reveal.assign(0); P.flat.assign(1); gew.assign(0);
      }).ElseIf(glass.lessThan(0.5).and(frame.lessThan(0.5)).and(reveal.lessThan(0.5)), () => {
        const sand = (v(0.8, 0.73, 0.6).mul(S)).toVar();
        If(grz.and(h.lessThan(fH.sub(0.1))).or(matK.greaterThan(2.5).and(matK.lessThan(3.5))), () => {
          const jy = (step(fract(h.div(select(grz, float(0.42), float(0.5)))), select(grz, float(0.07), float(0.04)))).toVar();
          const jx = (select(grz, float(0), step(fract(uLoc.add(step(0.5, fract(h)).mul(0.5))), 0.025))).toVar();
          c.assign(sand.mul(min(jy.add(jx), 1).mul(-0.3).add(1))); relief.assign(jy.mul(-0.25).add(1));
        }).ElseIf(matK.greaterThan(0.5).and(matK.lessThan(1.5)).and(h.greaterThan(fH.sub(0.1))), () => {
          const kyB = (h.div(0.083)).toVar(), rowB = (floor(kyB)).toVar(), kxB = (uLoc.div(0.25).add(mod(rowB, 2).mul(0.5))).toVar();
          const mB = (mix(max(step(fract(kyB), 0.15), step(fract(kxB), 0.05)), 0.2, smoothstep(0.03, 0.09, fwidth(kyB)))).toVar();
          c.assign(mix(c.mul(fh(vec2(floor(kxB), rowB)).mul(0.16).add(0.92)), v(0.72, 0.7, 0.66).mul(S), mB));
        });
        If(winK.greaterThan(3.5).and(winK.lessThan(4.5)).and(h.greaterThan(0.45)).and(h.lessThan(eave.sub(base))), () => {
          const bi = (floor(h.div(0.38))).toVar(), wq = (select(mod(bi, 2).lessThan(0.5), float(0.55), float(0.32))).toVar();
          If(uLoc.lessThan(wq).or(uLoc.greaterThan(W.sub(wq))), () => { c.assign(sand.mul(step(fract(h.div(0.38)), 0.06).mul(-0.3).add(1))); });
        });
        If(fwBit.greaterThan(0.5).and(h.greaterThan(fH)).and(wy.lessThan(eave.sub(0.1))), () => {
          const b2 = 0.1, ly = (loc.y).toVar(), lx = (loc.x).toVar();
          const beam = (step(ly, 0.2).add(step(fH.sub(0.12), ly)).add(step(abs(ly.sub(oy0.sub(0.1))), b2)).add(step(abs(ly.sub(oy1.add(0.1))), b2)) .add(step(lx, b2)).add(step(bw.sub(b2), lx)).add(step(abs(lx.sub(ox0.sub(0.12))), b2 * 0.9)).add(step(abs(lx.sub(ox1.add(0.12))), b2 * 0.9)) .add(step(abs(lx.div(ox0).mul(oy0.sub(0.15)).sub(ly)), 0.11).mul(step(lx, ox0.sub(0.2))).mul(step(ly, oy0.sub(0.15))))).toVar();
          c.assign(mix(v(0.93, 0.9, 0.83).mul(S), v(0.5, 0.2, 0.14).mul(S), min(beam, 1)));
        });
      });
      If(reveal.greaterThan(0.5), () => { c.assign(mix(wallBase, frameC.mul(S), 0.5).mul(smoothstep(2.2, 0.9, loc.y).mul(0.18).add(0.5))); });
      If(gew.greaterThan(0.5), () => { c.assign(mix(c, gewC, frame)); }).Else(() => { c.assign(mix(c, frameC.mul(S), frame)); });
      const flh = (fract(h.div(fH)).mul(fH)).toVar();
      If(grz.and(shop.lessThan(0.5)).and(h.greaterThan(1)), () => {
        const sand = (v(0.8, 0.73, 0.6).mul(S)).toVar();
        const band = (step(flh, 0.26).mul(step(0.02, flh)).mul(step(wy, eave.sub(0.6)))).toVar();
        const cor = (step(eave.sub(0.55), wy).mul(step(wy, eave.add(0.02)))).toVar();
        c.assign(mix(c, sand, max(band, cor)));
        relief.mulAssign(step(0.26, flh).mul(smoothstep(0.26, 0.4, flh).oneMinus()).add(step(eave.sub(0.75), wy).mul(step(wy, eave.sub(0.55)))).mul(-0.35).add(1));
      }).ElseIf(bh.greaterThan(0.33).and(h.greaterThan(2)).and(shop.lessThan(0.5)).and(wy.lessThan(eave.sub(0.2))), () => {
        const band = (step(0.02, flh).mul(step(flh, 0.16))).toVar();
        c.assign(mix(c, frameC.mul(1.05), band.mul(0.85)));
        relief.mulAssign(step(0.16, flh).mul(smoothstep(0.16, 0.3, flh).oneMinus()).mul(-0.3).add(1));
      });
    });
    // Glas: dunkel, je Fenster etwas anders; manche mit hellem Vorhang
    const glassC = mix(v(0.035, 0.045, 0.055), v(0.07, 0.075, 0.07), wr).toVar();
    P.curtain.assign(step(0.62, wr).mul(shop.oneMinus()));
    glassC.assign(mix(glassC, v(0.55, 0.5, 0.42), P.curtain.mul(0.55)));
    If(shop.greaterThan(0.5), () => { glassC.assign(mix(v(0.03, 0.03, 0.035), mix(v(0.2, 0.17, 0.13), v(0.14, 0.15, 0.17), wr), smoothstep(0.6, 2.5, h).mul(0.8))); });
    c.assign(mix(c, glassC, glass));
    P.glass.assign(glass); P.gvar.assign(fh(cell.mul(1.7).add(bh.mul(3))));
    // Putz: großflächige Flecken und senkrechte Schmutzfahnen
    const wp2 = vec2(wpos.x.add(wpos.z), wy);
    const big = texture(detail, wp2.mul(0.045)).r, streak = texture(detail, vec2(wp2.x.mul(0.55), wp2.y.mul(0.02))).r, grain = texture(detail, wp2.mul(0.9)).r;
    c.mulAssign(mix(1, big.mul(0.2).add(0.9).mul(smoothstep(0.45, 0.8, streak).mul(-0.12).add(1)).mul(grain.sub(0.5).mul(0.12).mul(P.rural).add(1)), glass.oneMinus()));
    c.mulAssign(mix(1, relief, 0.6).mul(mix(0.62, 1, smoothstep(-0.3, 1.6, h))));
    c.mulAssign(A.wet.mul(0.22).mul(glass.oneMinus()).oneMinus());
    If(dbg.greaterThan(0.5).and(arch.greaterThan(0.5)), () => { c.assign(mix(archCol(arch, fwBit), c, glass.mul(0.6))); });
    P.hb.assign(wy.sub(pB.w)); P.diff.assign(c);
    return c;
  })();

  // Normal Map nur auf der Stadtfassade mit Fensterachsen (Stil 0, über dem Sockel). Eigene Rechnung, weil die Normale
  // vor der Farbe entsteht und die Eigenschaften der Farbstufe dort noch nicht gesetzt sind
  nm.normalNode = Fn(() => {
    const vUv = uv(), vcol = attribute('color', 'vec3'), qc = floor(vcol.mul(255).add(0.5));
    const bh2 = fh(qc.yz.mul(1.31).add(7.7)), f2 = fract(bh2.mul(13.7));
    const kk = vec2(select(bh2.lessThan(0.3), float(1.1), select(bh2.lessThan(0.72), float(1), float(0.89))), select(f2.lessThan(0.35), float(1.07), select(f2.lessThan(0.75), float(1), float(0.9))));
    const pA = pA0, pB = pB0;
    const hasProf = pA.z.sub(pA.x).greaterThan(0.25), W = select(hasProf, pA.z.sub(pA.x), float(1e4));
    const style = select(hasProf, mod(pA.w, 8), float(0));
    const uAl = vUv.x.mul(12.8), uLoc = select(hasProf, uAl.sub(pA.x), uAl);
    const base = select(hasProf, pB.w, positionWorld.y.sub(vUv.y.mul(12.4))), h = positionWorld.y.sub(base);
    const eave = select(hasProf, min(pB.x, pB.z), float(1e4)), Hs = eave.sub(base);
    const bwB = float(3.2).div(kk.x), fHB = float(3.1).div(kk.y);
    const bw = select(hasProf, W.div(max(1, floor(W.div(bwB).add(0.5)))), bwB);
    const fH = select(hasProf.and(Hs.greaterThan(2)), clamp(Hs.div(max(1, floor(Hs.div(fHB).add(0.5)))), 2.6, 4.2), fHB);
    const fUv = vec2(uLoc.div(bw), h.div(fH)).mul(0.25);
    const city = style.lessThan(0.5).and(h.greaterThan(0.45));
    return select(city, T.normalMap(texture(tex.normal, fUv), vec2(1, 1)), T.normalView);
  })();
  // nachts erleuchtete Fenster der Stadt (Emissive-Textur am Glas)
  nm.emissiveNode = T.materialReference('emissive', 'color').mul(T.materialReference('emissiveIntensity', 'float'))
    .mul(texture(tex.lit, P.uvg).rgb).mul(P.flat.oneMinus()).mul(step(0.5, P.glass)).mul(P.rural.oneMinus());
  // Spiegelung im Glas, Schaufensterlicht, Widerschein der Laternen, Licht in Landhaus-Fenstern
  nm.outputNode = Fn(() => {
    const o = T.output, wpos = positionWorld;
    const V = normalize(wpos.sub(cameraPosition)), N = normalize(normalWorld), R = reflect(V, N);
    const fres = pow(max(dot(V.negate(), N), 0).oneMinus(), 4).mul(0.92).add(0.08);
    const sky0 = select(R.y.greaterThan(0), mix(A.horizon, A.top, pow(max(R.y, 0), 0.6)), mix(A.horizon.mul(0.45), A.ground.mul(0.35), clamp(R.y.negate().mul(3), 0, 1)));
    const sky = mix(sky0, A.ground.mul(0.6), P.gvar.mul(0.6));
    const k = P.glass.mul(fres.mul(0.55).add(0.12)).mul(A.night.mul(-0.85).add(1)).mul(P.curtain.mul(-0.5).add(1)).mul(P.shop.mul(-0.45).add(1));
    const col = mix(o.rgb, sky, k).toVar();
    col.addAssign(v(1, 0.74, 0.45).mul(0.085).mul(A.night).mul(P.shop).mul(P.gvar.mul(0.5).add(0.5)).mul(smoothstep(0.5, 2.5, P.hb).mul(0.4).add(0.6)));
    col.addAssign(P.diff.mul(v(1, 0.58, 0.26)).mul(A.night).mul(0.14).mul(smoothstep(0, 8, P.hb).oneMinus()).mul(P.glass.oneMinus()));
    col.addAssign(v(1, 0.78, 0.48).mul(0.55).mul(A.night).mul(P.lit).mul(P.curtain.mul(-0.3).add(1)));
    // Spiegelstärke für die Nachbearbeitung (js/tsl-post.js, zweiter Ausgabekanal), grün: Glas (Normale aus dem Bild)
    property('vec4', 'tslRefl').assign(vec4(0, clamp(P.glass.mul(P.curtain.mul(-0.5).add(1)).mul(P.shop.mul(-0.45).add(1)).mul(P.lit.mul(-0.7).add(1)).mul(P.gvar.mul(0.45).add(0.55)), 0, 1), 0, 1));
    return vec4(col, o.a);
  })();
  // Testansicht: ?fcdbg=G zeigt Glas (rot), flache Fläche ohne Normal Map (grün) und Landhaus (blau)
  if (/[?&]fcdbg=G/.test(location.search)) nm.outputNode = vec4(P.glass, P.flat, P.rural, 1);
};
