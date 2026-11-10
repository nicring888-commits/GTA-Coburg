// Lichterteppich und Lichtglocke (seit v3.19.0, Grafik-Phase G8b): Nachts leuchten die Orte bis an den Sichtrand.
// Aus dem Straßennetz des Landkreises (schon geladen, keine neuen Daten) entsteht einmal beim Start eine Punktwolke:
// Laternen alle ≈ 32 m an Ortsstraßen (Wohnstraßen immer, größere Straßen nur innerhalb der Orte), dazu einzelne
// Fensterlichter neben der Straße. Gezeichnet als ein einziger Zeichenaufruf (Punkte, additiv, Alphakanal unberührt,
// weil er die Spiegelstärke für js/post.js trägt). In der Nähe (unter ≈ 700 m) blendet der Teppich aus, dort stehen die
// echten Laternen. Dazu leuchtet der Himmel über den Städten orange (Lichtglocke im Himmelsshader, js/atmosphere.js),
// bei Wolken stärker. Nur Stufe „voll“; abschaltbar mit ?carpet=0.
'use strict';

const CARPET = {
  step: 32,            // Abstand der Laternen (m)
  near0: 620, near1: 950, // Ausblenden in der Nähe (dort stehen echte Laternen)
  lampY: 5.5,          // Höhe über dem groben Gelände (m)
  // Orte: größere Straßen bekommen nur innerhalb dieses Umkreises Laternen
  village: 420, suburb: 650, town: 1300, city: 2400,
};
// Lichtglocke: Gewicht und Ausdehnung der Städte (Name aus den Ortsdaten)
const SKYGLOW = {
  'Coburg': { w: 1.0, r: 2600 }, 'Neustadt bei Coburg': { w: 0.5, r: 1500 }, 'Sonneberg': { w: 0.55, r: 1700 },
  'Rödental': { w: 0.35, r: 1400 }, 'Bad Rodach': { w: 0.22, r: 900 }, 'Seßlach': { w: 0.12, r: 600 }, 'Ummerstadt': { w: 0.06, r: 400 },
};

class LightCarpet {
  constructor(region, scene, skyMat) {
    this.R = region; this.skyMat = skyMat;
    this.on = !!(window.QUALITY && window.QUALITY.level === 'voll') && !/[?&]carpet=0\b/.test(location.search);
    this.towns = [];
    for (const p of region.places) {
      const g = SKYGLOW[p.n];
      if (g && (p.k === 'town' || p.k === 'city')) this.towns.push({ x: p.x, z: p.z, w: g.w, r: g.r, n: p.n });
    }
    this.glow = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    if (skyMat && skyMat.uniforms.uGlow) this.glow = skyMat.uniforms.uGlow.value;
    if (!this.on) return;
    const t0 = performance.now();
    this.mesh = this.build();
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.ms = performance.now() - t0;
  }

  // Punkte aus dem Straßennetz: Laternen und Fensterlichter
  build() {
    const R = this.R, E = R.graph.edges, rnd = U.rng(4711), C = CARPET;
    const places = R.places.filter(p => C[p.k]).map(p => ({ x: p.x, z: p.z, r: p.n === 'Coburg' ? C.city : C[p.k] }));
    const grid = new U.Grid(500);
    places.forEach((p, i) => grid.insert(i, p.x - p.r, p.z - p.r, p.x + p.r, p.z + p.r));
    const tmp = [];
    const inPlace = (x, z) => grid.query(x, z, 1, tmp).some(i => { const p = places[i]; return Math.hypot(p.x - x, p.z - z) < p.r; });
    const pos = [], col = [];
    const add = (x, z, dy, r, g, b, i, s) => { pos.push(x, R.coarseAt(x, z) + dy, z); col.push(r * i, g * i, b * i, s); };
    let lamps = 0, wins = 0;
    for (const e of E) {
      const h = e.h || '';
      if (e.br || /motorway|trunk|service|track|path/.test(h)) continue;
      const res = h === 'residential' || h === 'living_street';
      if (!res && !/primary|secondary|tertiary|unclassified/.test(h)) continue;
      // Natrium-Orange an Durchgangsstraßen, warmweiße LED in Wohnstraßen
      const sod = /primary|secondary/.test(h);
      const p = e.p;
      let at = rnd() * C.step, s0 = 0, side = 1;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.1) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        for (; at < s0 + len; at += C.step * (0.85 + rnd() * 0.3)) {
          const s = at - s0, cx = ax + dx * s, cz = az + dz * s;
          if (!res && !inPlace(cx, cz)) continue;
          if (res && !inPlace(cx, cz) && rnd() < 0.5) continue; // Wohnstraßen außerhalb erfasster Orte (Weiler): dünner
          const off = e.w / 2 + 0.8;
          side = -side;
          const x = cx - dz * off * side, z = cz + dx * off * side;
          if (sod) add(x, z, C.lampY, 1.0, 0.6, 0.27, 1.0, 1.0);
          else add(x, z, C.lampY, 1.0, 0.86, 0.66, 0.85, 0.9);
          lamps++;
          // Fensterlichter: Häuser stehen 8–25 m neben der Straße
          if (rnd() < 0.55) {
            const n = rnd() < 0.35 ? 2 : 1;
            for (let j = 0; j < n; j++) {
              const sd = rnd() < 0.5 ? 1 : -1, o = 8 + rnd() * 17, a = (rnd() - 0.5) * 20;
              const wx = cx - dz * o * sd + dx * a, wz = cz + dx * o * sd + dz * a;
              const tv = rnd() < 0.08;
              if (tv) add(wx, wz, 2.5 + rnd() * 4, 0.55, 0.7, 1.0, 0.3, 0.55);
              else add(wx, wz, 2.5 + rnd() * 4, 1.0, 0.72, 0.42, 0.32 + rnd() * 0.25, 0.6);
              wins++;
            }
          }
        }
        s0 += len;
      }
    }
    this.count = { lamps, wins };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 4));
    g.computeBoundingSphere();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uNight: ATMO.uniforms.uNight, uTime: ATMO.uniforms.uTime, uPx: { value: 1 }, uVis: { value: 1 } },
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true, depthWrite: false, fog: false,
      vertexShader: `
        uniform float uNight, uTime, uPx;
        attribute vec4 aCol;
        varying vec3 vCol;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          float fade = smoothstep(${CARPET.near0.toFixed(1)}, ${CARPET.near1.toFixed(1)}, d) * smoothstep(0.25, 0.75, uNight);
          // Größe: nah ein kleiner Lichthof, fern mindestens 1,6 Pixel; fern gleicht die Helligkeit die kleinere Fläche aus
          float raw = aCol.w * 5200.0 / max(d, 1.0);
          float sz = clamp(raw, 1.6, 5.0) * uPx;
          // leichtes Flimmern durch die Luft (je Punkt eigener Takt)
          float tw = 0.88 + 0.12 * sin(uTime * 2.3 + position.x * 0.37 + position.z * 0.53);
          // fern: kleiner als der Mindestpunkt -> dunkler (sonst verschmelzen ganze Orte zu grellen Balken)
          vCol = aCol.rgb * fade * tw * clamp(raw / 1.6, 0.22, 1.0);
          gl_PointSize = fade > 0.001 ? sz : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vCol;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 3.5);
          gl_FragColor = vec4(vCol * a * 6.0, 0.0);
        }`,
    });
    const m = new THREE.Points(g, this.mat);
    m.frustumCulled = false;
    m.renderOrder = 2;
    return m;
  }

  // pro Bild: Sichtbarkeit, Punktgröße; Lichtglocke alle 0,25 s
  update(cam, night, indoor, renderer) {
    const n = ATMO.uniforms.uNight.value;
    if (this.mesh) {
      this.mesh.visible = !indoor && n > 0.2;
      if (renderer) this.mat.uniforms.uPx.value = renderer.getPixelRatio() * Math.max(0.6, renderer.domElement.height / renderer.getPixelRatio() / 720);
    }
    if (!this.skyMat) return;
    const u = this.skyMat.uniforms;
    u.uGlowOn.value = this.on && !indoor ? n : 0;
    const now = performance.now();
    if (this._t && now - this._t < 250) return;
    this._t = now;
    // vier stärkste Städte vom Standpunkt aus: Richtung (x, z), Stärke, Breite (Bogenmaß)
    const L = this.towns.map(t => {
      const dx = t.x - cam.x, dz = t.z - cam.z, d = Math.hypot(dx, dz);
      const s = t.w / (1 + Math.pow(d / 5000, 2));
      const w = Math.min(Math.PI, Math.atan2(t.r, Math.max(d, 1)) + 0.22);
      return { x: d > 1 ? dx / d : 0, z: d > 1 ? dz / d : 1, s, w, d };
    }).sort((a, b) => b.s - a.s);
    for (let k = 0; k < 4; k++) {
      const t = L[k];
      if (t) this.glow[k].set(t.x, t.z, t.s, t.d < 1 ? Math.PI : t.w);
      else this.glow[k].set(0, 1, 0, 1);
    }
  }
}
