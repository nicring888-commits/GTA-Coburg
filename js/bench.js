// Mess- und Vergleichsstand (seit v3.18.0, Grafik-Phase G0). Wird nur mit ?bench geladen (js/boot.js).
// Feste Kamerapunkte in Stadt und Landkreis × Uhrzeiten × Wetter: Bilder (bench/shots/<lauf>/*.jpg) und Messwerte
// (GPU-Zeit je Durchgang, CPU-Zeit, Zeichenaufrufe, Dreiecke) für den Vorher/Nachher-Vergleich (bench/index.html).
//   await game.bench.run('basis')                         alle Punkte, Uhrzeiten, Wetter
//   await game.bench.run('test', { points: ['markt'], times: [13], weathers: ['clear'] })
//   game.bench.view('markt', 19.5, 'rain')                nur hinstellen (zum Ansehen)
//   game.bench.probe()                                    Prüfsumme von Höhen, Kollision und Straßensuche
// Während eines Laufs hält game.hold das Spiel an; Uhr, Wetter und Kamera werden für jedes Bild neu gesetzt.
'use strict';

// at: Blickziel (Spielmeter, x Osten, z Süden), yaw: Blickrichtung (Grad, 0 = Norden, 90 = Osten),
// dist: Abstand der Kamera waagerecht, h: Kamerahöhe über Gelände, lookH: Höhe des Blickziels über Gelände
const BENCH_POINTS = [
  { id: 'markt', name: 'Marktplatz', at: [0, -15], yaw: 0, dist: 45, h: 7, lookH: 8 },
  { id: 'bahnhof', name: 'Bahnhof, Lossaustraße', at: [-470, -545], yaw: 150, dist: 35, h: 3, lookH: 4 },
  { id: 'veste', name: 'Blick von der Veste', at: [0, 0], yaw: 242, dist: 1290, h: 75, lookH: 0 },
  { id: 'ketschengasse', name: 'Ketschengasse', at: [-20, 260], yaw: 10, dist: 45, h: 1.8, lookH: 5 },
  { id: 'neustadt', name: 'Neustadt, Markt', at: [10964, -7876], yaw: 30, dist: 40, h: 6, lookH: 6 },
  { id: 'neubau', name: 'Neubaugebiet', at: [-3613, -2626], yaw: 45, dist: 120, h: 35, lookH: 0 },
  { id: 'gewerbe', name: 'Gewerbegebiet Ebersdorf', at: [7089, 3575], yaw: 0, dist: 150, h: 35, lookH: 0 },
  { id: 'wiese', name: 'Wiese und Wald, Dörfles-Esbach', at: [2305, -2940], yaw: 90, dist: 40, h: 2, lookH: 2 },
  { id: 'itztal', name: 'Itztal bei Untersiemau', at: [1028, 5908], yaw: 0, dist: 200, h: 30, lookH: 0 },
  { id: 'sesslach', name: 'Seßlach, Altstadt', at: [-8622, 7600], yaw: 0, dist: 40, h: 5, lookH: 6 },
  { id: 'feldflur', name: 'Feldflur bei Meeder', at: [-4594, -5477], yaw: 0, dist: 400, h: 50, lookH: 0 },
  { id: 'itz', name: 'Rosengarten', at: [281, -238], yaw: 200, dist: 80, h: 6, lookH: 7 },
];
const BENCH_TIMES = [8, 13, 19.5, 23];
const BENCH_WEATHERS = ['clear', 'rain', 'fog'];

const Bench = {
  points: BENCH_POINTS, times: BENCH_TIMES, weathers: BENCH_WEATHERS,
  get g() { return window.game; },

  point(id) {
    const p = typeof id === 'string' ? this.points.find(q => q.id === id) : id;
    if (!p) throw new Error('Unbekannter Punkt: ' + id);
    let [x, z] = p.at;
    if (p.place) {
      const R = this.g.world.region, pl = R && R.places.find(q => p.place.test(q.n));
      if (!pl) throw new Error('Ort fehlt: ' + p.place);
      x += pl.x; z += pl.z;
    }
    const a = p.yaw * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a);
    return { ...p, x, z, cx: x - dx * p.dist, cz: z - dz * p.dist };
  },

  // Kacheln am Punkt bauen und einschwingen lassen (Zeitscheiben, Bäume, Bewuchs)
  // Luftbilder und Texturen laden echt nach (Bilder dekodieren), deshalb danach wirklich warten
  async go(id, secs = 4, wait = 2500) {
    const P = this.point(id), g = this.g;
    g.hold = true;
    g.travel(P.x, P.z, null);
    this.aim(P);
    g.simulate(secs, 1 / 30, false);
    this.aim(P);
    this.frame();
    await new Promise(r => setTimeout(r, wait));
    g.simulate(1, 1 / 30, false);
    this.frame();
    await new Promise(r => setTimeout(r, wait / 4));
    return P;
  },
  aim(P) {
    const W = this.g.world;
    const cy = W.heightAt(P.cx, P.cz) + P.h, ty = W.heightAt(P.x, P.z) + P.lookH;
    this.g.debugCam = { pos: [P.cx, cy, P.cz], look: [P.x, ty, P.z] };
  },
  sky(clock, weather) {
    const A = this.g.atmo;
    A.auto = false; A.skipTarget = null;
    A.setWeather(weather, true);
    A.clock = clock;
    A.update(0, this.g.camera, true);
    const E = this.g.post.eye;
    if (E) { E.reset = true; E.fixedDt = 1 / 30; }
  },
  frame() { this.g.post.scale = 1; this.g.post.cool = 1e9; this.g.simulate(0, 1 / 30, true); },
  // eine Aufgabe weiter (GPU-Abfragen werden erst danach fertig); MessageChannel statt setTimeout, weil der Browser
  // setTimeout in verdeckten Seiten auf einmal pro Sekunde bremst
  idle() {
    const ch = this._ch || (this._ch = new MessageChannel());
    return new Promise(r => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  },

  // n Bilder hintereinander zeichnen und messen (GPU-Abfragen brauchen einige Bilder bis zum Ergebnis)
  async measure(n = 45) {
    const post = this.g.post, wasT = post.timing;
    post.timing = true;
    // noch offene Abfragen älterer Bilder abholen, dann neu sammeln
    for (let i = 0; i < 6; i++) { this.frame(); await this.idle(); }
    if (post.timer) { post.timer.acc = {}; post.timer.n = 0; post.timer.ms = null; post.timer.hist = []; post.timer.f = {}; }
    const cpu = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      this.frame();
      cpu.push(performance.now() - t0);
      await this.idle();
    }
    for (let i = 0; i < 6; i++) { this.frame(); await this.idle(); } // letzte Abfragen abholen
    cpu.sort((a, b) => a - b);
    const S = post.sceneInfo || {}, r = {
      cpu: +cpu[cpu.length >> 1].toFixed(2), gpu: post.timer ? post.timer.median() : null, calls: S.calls, tris: S.tris,
    };
    const R = post.renderer.info;
    r.programs = R.programs ? R.programs.length : 0; r.geometries = R.memory.geometries; r.textures = R.memory.textures;
    post.timing = wasT;
    return r;
  },

  // Bild der Leinwand als JPEG (gleich nach dem Zeichnen, sonst ist der Zeichenpuffer leer)
  snap(quality = 0.9) {
    this.frame();
    return new Promise(res => this.g.post.renderer.domElement.toBlob(res, 'image/jpeg', quality));
  },
  async save(label, file, body) {
    const r = await fetch(`/api/bench-save?label=${encodeURIComponent(label)}&file=${encodeURIComponent(file)}`, { method: 'POST', body });
    if (!r.ok) throw new Error('Speichern fehlgeschlagen: ' + r.status);
  },

  // feste Bildgröße unabhängig vom Fenster (Leinwand behält ihre Größe auf der Seite), restore() stellt zurück
  fix(w = 1280, h = 720) {
    const g = this.g, r = g.post.renderer;
    r.setPixelRatio(1); r.setSize(w, h, false);
    g.camera.aspect = w / h; g.camera.updateProjectionMatrix();
  },
  restore() {
    const g = this.g;
    if (g.post.eye) g.post.eye.fixedDt = 0;
    g.hold = false; g.debugCam = null;
    g.post.cool = 0; g.post.apply();
    g.camera.aspect = innerWidth / innerHeight; g.camera.updateProjectionMatrix();
  },

  async view(id, clock = 13, weather = 'clear') {
    this.fix();
    const P = await this.go(id);
    this.sky(clock, weather); this.frame();
    return P;
  },

  // Messlauf: Bilder und Werte je Punkt, Uhrzeit, Wetter; Ergebnis auch als results.json im Ordner des Laufs
  async run(label, o = {}) {
    const g = this.g, pts = o.points || this.points.map(p => p.id);
    const times = o.times || this.times, weathers = o.weathers || this.weathers;
    const res = { label, date: new Date().toISOString(), quality: g.post.level, version: o.version || null,
      size: [g.post.renderer.domElement.width, g.post.renderer.domElement.height], shots: [] };
    const t0 = performance.now();
    this.fix(o.w, o.h);
    res.size = [o.w || 1280, o.h || 720];
    try {
      for (const id of pts) {
        await this.go(id);
        for (const w of weathers) for (const t of times) {
          this.sky(t, w);
          for (let i = 0; i < 3; i++) this.frame(); // Umgebungsbild, Schatten, Bloom einschwingen
          const m = o.measure === false ? {} : await this.measure(o.frames || 30);
          this.sky(t, w);
          const name = `${id}_${String(t).replace('.', '-')}_${w}.jpg`;
          await this.save(label, name, await this.snap());
          res.shots.push({ id, time: t, weather: w, file: name, ...m });
          if (o.log !== false) console.log('Bench', label, name, m.gpu ? `GPU ${m.gpu.total} ms` : '', `CPU ${m.cpu} ms`, `${m.calls} Aufrufe`);
        }
        // Zwischenstand nach jedem Ort (bricht ein Lauf ab, bleiben die Bilder vergleichbar)
        await this.save(label, 'results.json', JSON.stringify({ ...res, partial: true }, null, 1));
      }
    } finally {
      this.restore();
    }
    res.probe = this.probe();
    res.secs = +((performance.now() - t0) / 1000).toFixed(1);
    await this.save(label, 'results.json', JSON.stringify(res, null, 1));
    return res;
  },

  // Prüfsumme der Spielwelt-Abfragen an 500 festen Punkten (Höhe, Kollision, Straßensuche) und Zählung des Umlands;
  // muss vor und nach jeder Grafik-Phase gleich sein. Nur in der Innenstadt (immer ganz gebaut), damit das Ergebnis
  // nicht davon abhängt, welche Umland-Kacheln gerade stehen.
  probe() {
    const W = this.g.world, R = W.region;
    let h = 2166136261;
    const mix = v => { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
    const rnd = U.rng(4711), out = { x: 0, z: 0 };
    for (let i = 0; i < 500; i++) {
      const x = -1300 + rnd() * 2600, z = -900 + rnd() * 1800;
      mix(W.heightAt(x, z).toFixed(3));
      const c = W.collideCircle(x, z, 0.6, out, undefined); mix(c ? `${out.x.toFixed(2)},${out.z.toFixed(2)}` : '-');
      const r = W.nearestRoad(x, z, 60); mix(r ? `${r.x.toFixed(2)},${r.z.toFixed(2)}` : '-');
    }
    const counts = R ? { tiles: R.tiles ? R.tiles.length || R.tiles.size : 0, nodes: R.net ? (R.net.nodes || R.net.n || []).length : 0 } : null;
    return { hash: (h >>> 0).toString(16), counts };
  },
};
