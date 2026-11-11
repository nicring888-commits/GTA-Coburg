// Materialbibliothek (seit v3.11.0, Grafik-Fahrplan Phase 7): eine Fabrik für die Materialien der Welt mit
// Voreinstellungen (PBR: Rauheit, Metall, Klarlack) und einem Budget je Grafikstufe (js/boot.js, QUALITY.budget):
//   voll   – MeshPhysicalMaterial/MeshStandardMaterial wie angegeben, volle Anisotropie, gemalte Texturen in voller Größe
//   mobil  – Physical wird Standard (ohne Klarlack), Anisotropie 4, gemalte Texturen halb so groß
//   leicht – alles Lambert (ohne Spiegelung), Anisotropie 2, gemalte Texturen halb so groß
// Dazu der KTX2-Lader (Basis Universal, three.js-Erweiterung) für die Luftbilder im Umland (tools/ortho-ktx2.mjs).
// Später (Phase 11) liefert dieselbe Fabrik Node-Materialien für den WebGPURenderer.
'use strict';

const MAT_PRESETS = {
  // Fahrzeuge
  lack: { pbr: 'physical', metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 },
  lackMatt: { pbr: 'standard', metalness: 0.1, roughness: 0.55 },
  chrom: { pbr: 'standard', metalness: 0.95, roughness: 0.18 },
  glas: { pbr: 'standard', metalness: 0.1, roughness: 0.06 },
  gummi: { pbr: 'standard', metalness: 0, roughness: 0.9 },
  kunststoff: { pbr: 'standard', metalness: 0, roughness: 0.6 },
  // Stadt und Umland
  metall: { pbr: 'standard', metalness: 0.75, roughness: 0.42 },        // Laternenmasten, Geländer, Pfosten
  metallLack: { pbr: 'standard', metalness: 0.3, roughness: 0.5 },      // lackierter Stahl (Schilderpfosten)
  putz: { pbr: 'lambert' }, holz: { pbr: 'lambert' }, stein: { pbr: 'lambert' },
};

const Mat = {
  get budget() {
    const Q = window.QUALITY || {};
    return Q.budget || { level: 'voll', aniso: 16, texScale: 1, pbr: 'physical' };
  },
  _cache: new Map(),

  // Material nach Voreinstellung und eigenen Werten (color, map, emissive …); mit key wird es geteilt
  make(preset, opts = {}, key = null) {
    if (key && this._cache.has(key)) return this._cache.get(key);
    const P = MAT_PRESETS[preset] || { pbr: 'lambert' }, B = this.budget;
    let kind = P.pbr;
    if (B.pbr === 'lambert') kind = 'lambert';
    else if (B.pbr === 'standard' && kind === 'physical') kind = 'standard';
    const o = Object.assign({}, opts);
    // Werte, die das abgestufte Material nicht kennt, weglassen (sonst warnt three.js)
    if (kind !== 'physical') { delete o.clearcoat; delete o.clearcoatRoughness; }
    if (kind === 'lambert') { delete o.roughness; delete o.metalness; delete o.roughnessMap; delete o.metalnessMap; delete o.envMapIntensity; }
    let m;
    if (kind === 'physical') m = new THREE.MeshPhysicalMaterial(Object.assign({ metalness: P.metalness, roughness: P.roughness, clearcoat: P.clearcoat || 0, clearcoatRoughness: P.clearcoatRoughness || 0 }, o));
    else if (kind === 'standard') m = new THREE.MeshStandardMaterial(Object.assign({ metalness: P.metalness || 0, roughness: P.roughness ?? 0.8 }, o));
    else m = new THREE.MeshLambertMaterial(o);
    m.userData.preset = preset;
    if (m.map) this.texture(m.map);
    if (key) this._cache.set(key, m);
    return m;
  },
  lambert(opts, key) { return this.make('putz', opts, key); },

  // Texturbudget: Anisotropie je Stufe (höchstens, was die Grafikkarte kann)
  texture(t, renderer) {
    if (!t) return t;
    const max = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
    t.anisotropy = Math.min(max, this.budget.aniso);
    return t;
  },
  aniso(renderer) { return Math.min(renderer.capabilities.getMaxAnisotropy(), this.budget.aniso); },
  // Kantenlänge gemalter Texturen (Leinwand) je Stufe, als Zweierpotenz und mindestens min
  size(px, min = 128) { return Math.max(min, Math.round(px * this.budget.texScale)); },

  // ---------- KTX2 (Basis Universal) ----------
  // Lader aus den three.js-Erweiterungen (gleiche Version und gleiches CDN wie three.module.js); null ohne ES-Modul
  ktx2(renderer) {
    // ein gemeinsames Promise, damit gleichzeitige Aufrufe auf denselben Lader warten
    if (this._ktx2) return this._ktx2;
    this._ktx2 = (async () => {
      const src = window.THREE_SRC || '';
      if (!/build\/three\.module\.js$/.test(src) || !this.budget.ktx2) return null;
      const base = src.replace(/build\/three\.module\.js$/, '');
      try {
        const mod = await import(base + 'examples/jsm/loaders/KTX2Loader.js');
        return new mod.KTX2Loader().setTranscoderPath(base + 'examples/jsm/libs/basis/').detectSupport(renderer);
      } catch (e) { console.warn('KTX2 nicht verfügbar:', e.message, '– Luftbilder als JPG'); return null; }
    })();
    return this._ktx2;
  },
  // Bild, aus dem die CPU Pixel lesen kann (Bild, Leinwand), sonst null (komprimierte Texturen)
  drawable(img) {
    return img && (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)) ? img : null;
  },
  // KTX2-Datei laden; Promise mit Textur oder Fehler (dann nimmt der Aufrufer das JPG)
  loadKTX2(renderer, url) {
    return this.ktx2(renderer).then(L => {
      if (!L) throw new Error('kein KTX2-Lader');
      return new Promise((res, rej) => L.load(url, res, undefined, rej));
    });
  },
};
