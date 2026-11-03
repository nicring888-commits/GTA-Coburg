// WebGPU-Probe (seit v3.10.0, Grafik-Fahrplan Phase 6): mit ?gfx=webgpu zeichnet three.js' WebGPURenderer dieselbe Szene
// wie das Spiel (Gelände, Häuser, Bäume, Figuren, Autos), ?gfx=webgpu-gl erzwingt dessen WebGL2-Rückfall. Spiellogik,
// Eingabe (auf der unsichtbaren WebGL-Leinwand darüber) und alle Daten bleiben gleich. Der WebGPURenderer übersetzt die
// Materialien selbst in Node-Materialien; eigene Shader-Erweiterungen (onBeforeCompile: Fassaden, Dächer, Straßen,
// Landschaft) und ShaderMaterials (Himmel, Wasser, Nachbearbeitung) kennt er nicht – die Probe zeigt deshalb die
// Grundmaterialien, der Himmel wird zur Nebelfarbe. Phase 11 übersetzt diese Shader in TSL.
// Messanzeige oben rechts: Backend, Bildzeit (Mittel über 1 s), Zeichenaufrufe, Dreiecke; game.gfx.stats für Tests.
'use strict';

const GfxProbe = {
  wanted: /[?&]gfx=webgpu/.test(location.search),
  statsOnly: /[?&]gfx=stats\b/.test(location.search),   // nur Messanzeige für den normalen WebGL-Weg (zum Vergleich)
  forceGL: /[?&]gfx=webgpu-gl\b/.test(location.search),
  ready: false,
  stats: { backend: '–', ms: 0, cpu: 0, calls: 0, tris: 0, frames: 0 },

  async start(webgl, scene) {
    if (!this.wanted) return false;
    const src = window.THREE_SRC || '';
    const url = src.replace(/three\.module\.js$/, 'three.webgpu.js');
    if (!/three\.webgpu\.js$/.test(url)) { this.fail('three.js wurde nicht als ES-Modul geladen (WebGPU braucht r171 oder neuer)'); return false; }
    try {
      // dasselbe CDN wie three.module.js: beide nutzen three.core.js, die Szene ist dann mit beiden Renderern verwendbar
      const mod = await import(url);
      const r = new mod.WebGPURenderer({ antialias: true, forceWebGL: this.forceGL });
      await r.init();
      r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      r.setSize(innerWidth, innerHeight);
      r.shadowMap.enabled = true;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.0;
      this.r = r; this.webgl = webgl;
      this.stats.backend = r.backend && r.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (Rückfall)';
      // eigene Leinwand unter der (durchsichtigen) WebGL-Leinwand, damit Maus und Tastatur dort bleiben
      const c = r.domElement;
      Object.assign(c.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 0 });
      webgl.domElement.parentNode.insertBefore(c, webgl.domElement);
      webgl.domElement.style.opacity = '0';
      webgl.domElement.style.position = 'relative'; webgl.domElement.style.zIndex = 1;
      this.panel = document.createElement('div');
      Object.assign(this.panel.style, { position: 'fixed', right: '10px', top: '120px', zIndex: 50, font: '12px/1.4 monospace', color: '#fff',
        background: 'rgba(0,0,0,0.55)', padding: '6px 9px', borderRadius: '6px', pointerEvents: 'none', whiteSpace: 'pre' });
      document.body.appendChild(this.panel);
      addEventListener('resize', () => r.setSize(innerWidth, innerHeight));
      this.ready = true;
      console.info('WebGPU-Probe:', this.stats.backend);
      return true;
    } catch (e) {
      this.fail(e.message);
      return false;
    }
  },
  // Messanzeige für den WebGL-Weg (?gfx=stats): gleiche Werte aus renderer.info (nach der Nachbearbeitung zählt
  // three.js nur den letzten Durchgang, deshalb Zeichenaufrufe und Dreiecke der Szene aus world.renderer.info.memory nicht)
  measureWebGL(renderer, cpu) {
    if (!this.statsOnly) return;
    if (!this.panel) {
      this.panel = document.createElement('div');
      Object.assign(this.panel.style, { position: 'fixed', right: '10px', top: '120px', zIndex: 50, font: '12px/1.4 monospace', color: '#fff',
        background: 'rgba(0,0,0,0.55)', padding: '6px 9px', borderRadius: '6px', pointerEvents: 'none', whiteSpace: 'pre' });
      document.body.appendChild(this.panel);
      this.stats.backend = 'WebGL (Spiel)';
    }
    this.tick(cpu, null);
  },
  tick(cpu, info) {
    const now = performance.now(), S = this.stats;
    this.acc = this.acc || { t: now, n: 0, cpu: 0 };
    this.acc.n++; this.acc.cpu += cpu;
    if (now - this.acc.t > 1000) {
      S.ms = +((now - this.acc.t) / this.acc.n).toFixed(1); S.cpu = +(this.acc.cpu / this.acc.n).toFixed(1);
      if (info) { S.calls = info.drawCalls !== undefined ? info.drawCalls : info.calls; S.tris = info.triangles; }
      this.acc = { t: now, n: 0, cpu: 0 };
      this.panel.textContent = `${info ? 'WebGPU-Probe' : 'Messung'} · ${S.backend}\nBild ${S.ms} ms (${(1000 / S.ms).toFixed(0)} fps), CPU ${S.cpu} ms` +
        (info ? `\nZeichenaufrufe ${S.calls} · Dreiecke ${(S.tris / 1e6).toFixed(2)} Mio.` : '');
    }
    S.frames++;
  },
  fail(msg) { this.stats.backend = 'nicht verfügbar'; console.warn('WebGPU-Probe:', msg, '– das Spiel zeichnet weiter mit WebGL'); },

  // Szene zeichnen; Himmelskuppel, Wasser und andere ShaderMaterials ausblenden, Umgebungsbild (WebGL-Rendertarget) weglassen
  render(scene, camera, fogColor) {
    const hidden = [];
    if (!this.skip || ++this.skipAge > 120) {
      this.skip = []; this.skipAge = 0;
      scene.traverse(o => { if (o.material && (o.material.isShaderMaterial || o.material.isRawShaderMaterial)) this.skip.push(o); });
    }
    for (const o of this.skip) if (o.visible) { o.visible = false; hidden.push(o); }
    const env = scene.environment, bg = scene.background;
    scene.environment = null;
    scene.background = fogColor || (scene.fog && scene.fog.color) || null;
    const t0 = performance.now();
    this.r.render(scene, camera);
    const cpu = performance.now() - t0;
    scene.environment = env; scene.background = bg;
    for (const o of hidden) o.visible = true;
    // Messung: Bildzeit aus dem Abstand der Bilder, Zeichenaufrufe und Dreiecke des letzten Bildes
    this.tick(cpu, this.r.info.render);
  },
};
