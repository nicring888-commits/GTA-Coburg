// Hauptmenü (seit v3.21.0): Vollbild-Menü über einer Kamerafahrt durch die echte Spielwelt, Pausenmenü, Spielstände
// (Plätze, Sicherung, Import/Export), Online-Modus (Fenster für js/net.js NetLobby), Einstellungen, Credits, Beenden.
// Teile:
//   MenuDirector  Kamera-Regie: Einstellungen an bekannten Orten (Landmarken aus js/ui.js), Tageszeit und Wetter je Szene
//   MenuAudio     dezente Menügeräusche und Stadtatmosphäre (WebAudio, ohne Dateien)
//   SaveSlots     Spielstände in localStorage (aktiver Stand bleibt gta-coburg-v1, wie bisher)
//   MainMenu      Oberfläche, Navigation mit Maus, Tastatur und Touch
// Die Schnittstelle zum Spiel (G) liefert js/game.js; das Menü greift nicht in die Spiellogik ein.
'use strict';

// ---------------------------------------------------------------------------------------------------------------
// Kamera-Regie
// ---------------------------------------------------------------------------------------------------------------
// Szenen: at = Landmarke; orbit: Kreisbahn um den Ort (Winkel in Grad, 0 = Norden/−z, 90 = Osten/+x), r = Abstand,
// h = Höhe über dem Boden am Ort; dolly: Fahrt von from nach to (Versatz zum Ort, [x, Höhe, z]), Blick auf look.
// clock: Uhrzeit, weather: Wetter (js/atmosphere.js). Höhen werden auf Gelände und Dächer geprüft.
const MENU_SHOTS = [
  { at: 'Veste Coburg', place: 'Veste Coburg', sub: 'Festungsberg · Abendsonne', kind: 'orbit', r: [300, 255], a: [215, 250], h: [95, 75], lookH: 12, clock: 19.25, weather: 'clear', dur: 17 },
  { at: 'Marktplatz', place: 'Marktplatz', sub: 'Rathaus und Stadthaus', kind: 'orbit', r: [30, 26], a: [150, 205], h: [9, 15], lookH: 7, clock: 9.6, weather: 'cloudy', dur: 15 },
  { at: 'Schloss Ehrenburg', place: 'Schloss Ehrenburg', sub: 'Schlossplatz', kind: 'orbit', r: [105, 92], a: [8, 40], h: [26, 40], lookH: 13, clock: 16.6, weather: 'clear', dur: 16 },
  { at: 'Stadtkirche St. Moriz', place: 'Altstadt', sub: 'Über den Dächern von St. Moriz', kind: 'orbit', r: [190, 170], a: [120, 165], h: [70, 82], lookH: 30, clock: 7.4, weather: 'cloudy', dur: 16 },
  { at: 'Bahnhof', place: 'Bahnhof Coburg', sub: 'Lossaustraße bei Nacht', kind: 'orbit', r: [120, 95], a: [140, 185], h: [38, 22], lookH: 4, clock: 22.6, weather: 'clear', dur: 15 },
  { at: 'Landestheater', place: 'Landestheater', sub: 'Schlossplatz im Regen', kind: 'orbit', r: [105, 90], a: [168, 196], h: [16, 22], lookH: 10, clock: 21.2, weather: 'rain', dur: 14 },
  { at: 'Marktplatz', place: 'Marktplatz', sub: 'Abend in der Altstadt', kind: 'orbit', r: [27, 24], a: [320, 365], h: [6, 10], lookH: 6, clock: 20.4, weather: 'clear', dur: 15 },
];

class MenuDirector {
  constructor(G) {
    this.G = G;
    this.shots = [];
    this.i = -1; this.t = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.focus = { x: 0, y: 0, z: 0 };
    this.fade = 1;      // 1 = schwarz
    this.active = false;
    this.still = false;  // Menü-Kamerafahrt aus: stehendes Bild
    this.onShot = null;
  }
  // Szenen aus den Landmarken berechnen (fehlende Orte fallen weg)
  build() {
    const lm = this.G.landmarks();
    this.shots = MENU_SHOTS.map(s => {
      const L = lm.find(l => l.name === s.at);
      return L ? Object.assign({ L }, s) : null;
    }).filter(Boolean);
    if (!this.shots.length) this.shots = [{ L: { x: 0, z: 0 }, place: 'Coburg', sub: '', kind: 'orbit', r: [200, 180], a: [0, 40], h: [80, 70], lookH: 10, clock: 18, weather: 'clear', dur: 18 }];
  }
  start(random) {
    if (!this.shots.length) this.build();
    this.active = true;
    this.cut(random ? Math.floor(Math.random() * this.shots.length) : 0);
  }
  stop() { this.active = false; }
  cut(i) {
    this.i = (i + this.shots.length) % this.shots.length;
    this.t = 0;
    const s = this.shots[this.i], G = this.G;
    G.atmo.clock = s.clock;
    if (G.atmo.skipTarget !== undefined) G.atmo.skipTarget = null;
    G.atmo.setWeather(s.weather || 'clear', true);
    if (G.post && G.post.eye) G.post.eye.reset = true;
    this.pose(0);
    // Kacheln an der neuen Stelle sofort bauen (während das Bild schwarz ist)
    G.prepare(this.focus.x, this.focus.z);
    if (this.onShot) this.onShot(s);
  }
  // Pose zur Zeit u (0…1) der aktuellen Szene
  pose(u) {
    const s = this.shots[this.i], L = s.L, W = this.G.world;
    const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;   // fast gleichmäßig, weicher Anfang und Ende
    const gy = W.heightAt(L.x, L.z);
    const lerp = (a, b) => a + (b - a) * e;
    if (s.kind === 'orbit') {
      const a = lerp(s.a[0], s.a[1]) * Math.PI / 180, r = lerp(s.r[0], s.r[1]);
      this.pos.set(L.x + Math.sin(a) * r, gy + lerp(s.h[0], s.h[1]), L.z - Math.cos(a) * r);
      this.look.set(L.x, gy + (s.lookH || 0), L.z);
    } else {
      this.pos.set(L.x + lerp(s.from[0], s.to[0]), gy + lerp(s.from[1], s.to[1]), L.z + lerp(s.from[2], s.to[2]));
      const lk = s.look || [0, 0, 0], lk2 = s.lookTo || lk;
      this.look.set(L.x + lerp(lk[0], lk2[0]), gy + lerp(lk[1], lk2[1]), L.z + lerp(lk[2], lk2[2]));
    }
    // nicht im Boden oder in Häusern
    const b = W.insideBuilding(this.pos.x, this.pos.z, 2);
    const floor = Math.max(W.heightAt(this.pos.x, this.pos.z) + 1.8, b ? b.top + 3 : -Infinity);
    if (this.pos.y < floor) this.pos.y = floor;
    // leichte Handkamera (sehr dezent)
    const T = performance.now() / 1000;
    this.pos.x += Math.sin(T * 0.37) * 0.25; this.pos.y += Math.sin(T * 0.51 + 1) * 0.18; this.pos.z += Math.cos(T * 0.29) * 0.25;
    // Mitte für Verkehr, Fußgänger und Schatten: zwischen Kamera und Ziel, am Boden
    const fx = this.pos.x + (this.look.x - this.pos.x) * 0.55, fz = this.pos.z + (this.look.z - this.pos.z) * 0.55;
    this.focus.x = fx; this.focus.z = fz; this.focus.y = W.heightAt(fx, fz);
  }
  update(dt) {
    if (!this.active) return;
    const s = this.shots[this.i];
    if (!this.still) this.t += dt;
    const u = Math.min(1, this.t / s.dur);
    this.pose(this.still ? 0.35 : u);
    // Abblende: 0,9 s auf, 1,1 s zu
    const end = s.dur - this.t;
    this.fade = this.still ? Math.max(0, this.fade - dt * 1.2) : this.t < 0.9 ? 1 - this.t / 0.9 : end < 1.1 ? 1 - Math.max(0, end) / 1.1 : 0;
    if (!this.still && this.t >= s.dur) this.cut(this.i + 1);
  }
  apply(camera) {
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    if (Math.abs(camera.fov - 50) > 0.01) { camera.fov = 50; camera.updateProjectionMatrix(); }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Menü-Ton: Klicks, Wischen, Stadtatmosphäre und eine leise Klangfläche (alles erzeugt, keine Dateien)
// ---------------------------------------------------------------------------------------------------------------
class MenuAudio {
  constructor() { this.ctx = null; this.amb = null; this.vol = { master: 0.8, ui: 0.7, ambient: 1 }; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      const c = this.ctx = new A();
      this.out = c.createGain(); this.out.connect(c.destination);
      this.uiG = c.createGain(); this.uiG.connect(this.out);
      this.ambG = c.createGain(); this.ambG.gain.value = 0; this.ambG.connect(this.out);
      this.applyVol();
      // Stadtrauschen: braunes Rauschen, tief gefiltert, langsam pulsierend
      const len = c.sampleRate * 4, buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch); let b = 0;
        for (let i = 0; i < len; i++) { b = (b + (Math.random() * 2 - 1) * 0.02) / 1.02; d[i] = b * 3.2; }
      }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const cityG = c.createGain(); cityG.gain.value = 0.32;
      src.connect(lp); lp.connect(cityG); cityG.connect(this.ambG); src.start();
      // Klangfläche: Akkorde a-Moll – F – C – G, weich, sehr leise
      this.padG = c.createGain(); this.padG.gain.value = 0.0;
      const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 900; pf.Q.value = 0.4;
      this.padG.connect(pf); pf.connect(this.ambG);
      const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 260;
      lfo.connect(lfoG); lfoG.connect(pf.frequency); lfo.start();
      this.voices = [0, 1, 2, 3].map(() => {
        const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
        o1.type = 'sawtooth'; o2.type = 'triangle'; o2.detune.value = 7; g.gain.value = 0.05;
        o1.connect(g); o2.connect(g); g.connect(this.padG); o1.start(); o2.start();
        return { o1, o2 };
      });
      this.chord = 0;
      this.nextChord();
      this.chordTimer = setInterval(() => this.nextChord(), 8000);
    } catch (e) { this.ctx = null; }
  }
  applyVol() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(this.vol.master, t, 0.1);
    this.uiG.gain.setTargetAtTime(this.vol.ui, t, 0.1);
    this.ambTarget = 0.55 * this.vol.ambient;
    if (this.ambOn) this.ambG.gain.setTargetAtTime(this.ambTarget, t, 0.4);
  }
  setVolumes(v) { Object.assign(this.vol, v); this.applyVol(); }
  nextChord() {
    if (!this.ctx) return;
    const CH = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]];
    const notes = CH[this.chord++ % CH.length], t = this.ctx.currentTime;
    const f = n => 440 * Math.pow(2, (n - 69) / 12) / 2;
    this.voices.forEach((v, i) => { v.o1.frequency.setTargetAtTime(f(notes[i]), t, 1.2); v.o2.frequency.setTargetAtTime(f(notes[i]) * 2, t, 1.2); });
  }
  // Atmosphäre ein/aus (Menü offen bzw. Spiel läuft)
  ambience(on) {
    this.ambOn = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambG.gain.setTargetAtTime(on ? this.ambTarget || 0.5 : 0, t, on ? 1.2 : 0.35);
    this.padG.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 2.5 : 0.35);
  }
  blip(f0, f1, dur, vol, type = 'sine') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.uiG); o.start(t); o.stop(t + dur + 0.02);
  }
  whoosh(up = true, dur = 0.45, vol = 0.16) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, n = c.sampleRate * dur, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(up ? 300 : 2400, t); f.frequency.exponentialRampToValueAtTime(up ? 2600 : 280, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(this.uiG); s.start(t);
  }
  hover() { this.blip(2100, 1500, 0.05, 0.035); }
  select() { this.blip(520, 260, 0.22, 0.09, 'triangle'); this.whoosh(true, 0.4, 0.07); }
  back() { this.blip(900, 520, 0.12, 0.05, 'triangle'); }
  error() { this.blip(220, 160, 0.25, 0.08, 'square'); }
  start() { this.blip(110, 55, 0.9, 0.18, 'sine'); this.whoosh(true, 1.2, 0.12); }
}

// ---------------------------------------------------------------------------------------------------------------
// Spielstände
// ---------------------------------------------------------------------------------------------------------------
const SaveSlots = {
  LIVE: 'gta-coburg-v1', N: 6,
  key(i) { return 'gta-coburg-slot-' + i; },
  read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ohne Speicher */ } },
  valid(s) { return !!s && typeof s === 'object' && typeof s.money === 'number' && isFinite(s.money); },
  live() { const s = this.read(this.LIVE); return this.valid(s) ? s : null; },
  // kurze Beschreibung eines Spielstands
  summary(s) {
    const n = v => Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
    const homes = Array.isArray(s.homes) ? s.homes.length : n(s.homes);
    const parts = ['€ ' + Math.round(s.money).toLocaleString('de-DE')];
    if (homes) parts.push(homes + (homes === 1 ? ' Wohnung' : ' Wohnungen'));
    const cars = n(s.garage); if (cars) parts.push(cars + (cars === 1 ? ' Auto' : ' Autos'));
    const best = n(s.best); if (best) parts.push(best + (best === 1 ? ' Bestzeit' : ' Bestzeiten'));
    const w = s.weapons ? Object.keys(s.weapons).filter(k => k !== 'fist').length : 0; if (w) parts.push(w + (w === 1 ? ' Waffe' : ' Waffen'));
    return parts.join(' · ');
  },
  slot(i) { const r = this.read(this.key(i)); return r && this.valid(r.data) ? r : null; },
  store(i, data, name) { return this.write(this.key(i), { v: 1, t: Date.now(), name: name || '', data }); },
  backup(why) { const s = this.live(); if (s) this.write(this.key('backup'), { v: 1, t: Date.now(), name: why, data: s }); },
  ago(t) {
    if (!t) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'gerade eben';
    if (s < 3600) return 'vor ' + Math.round(s / 60) + ' Min.';
    if (s < 86400) return 'vor ' + Math.round(s / 3600) + ' Std.';
    return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Oberfläche
// ---------------------------------------------------------------------------------------------------------------
class MainMenu {
  // G: Schnittstelle zum Spiel, siehe js/game.js („Hauptmenü“)
  constructor(G) {
    this.G = G;
    this.$ = id => document.getElementById(id);
    this.root = this.$('start');
    this.audio = new MenuAudio();
    this.director = new MenuDirector(G);
    this.mode = 'main';      // 'main' | 'pause'
    this.panel = null;
    this.open = false;
    this.busy = false;
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'mm-fade';
    this.root.prepend(this.fadeEl);
    this.$('mm-ver').textContent = 'Version ' + (G.version || '');
    this.$('mm-back').onclick = () => this.back();
    // Fokus und scrollIntoView dürfen das Vollbild-Menü nicht verschieben (overflow: hidden scrollt trotzdem)
    for (const el of [this.root, this.root.querySelector('.mm-main') && null, document.scrollingElement].filter(Boolean)) el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } });
    this.director.onShot = s => {
      const el = this.$('mm-shot');
      el.classList.remove('in');
      setTimeout(() => { el.querySelector('b').textContent = s.place; el.querySelector('span').textContent = s.sub; el.classList.add('in'); }, 900);
    };
    // erste Berührung startet den Ton (Browser erlauben Ton erst nach einer Eingabe)
    const wake = () => { this.audio.init(); this.syncAudio(); if (this.open) this.audio.ambience(true); };
    addEventListener('pointerdown', wake, { capture: true });
    addEventListener('keydown', wake, { capture: true });
    addEventListener('keydown', e => this.onKey(e));
    Settings.onChange(() => this.syncAudio());
    document.addEventListener('visibilitychange', () => {
      if (!this.audio.ctx || !Settings.get('audio', 'muteHidden')) return;
      if (document.hidden) this.audio.ctx.suspend().catch(() => {}); else this.audio.ctx.resume().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => { if (this.panel === 'settings') this.renderSettings(); });
    // Dialog „Beendet“
    this.$('mm-quit-back').onclick = () => { this.$('mm-quit').classList.add('hidden'); this.G.resumeRendering(); this.show('main'); };
    this.$('mm-quit-close').onclick = () => {
      window.close();
      setTimeout(() => { this.$('mm-quit-hint').textContent = 'Der Browser erlaubt Webseiten nicht, den eigenen Tab zu schließen. Bitte den Tab selbst schließen.'; }, 300);
    };
  }

  syncAudio() {
    const a = Settings.get('audio');
    this.audio.setVolumes({ master: a.master, ui: a.ui, ambient: a.ambient });
  }

  // ---------- Anzeigen ----------
  show(mode = 'main') {
    this.mode = mode;
    this.open = true;
    this.root.classList.remove('hidden', 'leaving');
    this.root.classList.toggle('paused', mode === 'pause');
    this.closePanel(true);
    this.renderNav();
    this.director.still = !Settings.get('general', 'menuCam');
    if (mode === 'main') { this.director.start(true); this.root.classList.add('cine'); } else { this.director.stop(); this.root.classList.remove('cine'); }
    this.audio.ambience(mode === 'main');
    this.root.classList.remove('intro'); void this.root.offsetWidth; this.root.classList.add('intro');
    setTimeout(() => this.focusFirst(), 60);
  }
  hide() {
    this.open = false;
    this.director.stop();
    this.audio.ambience(false);
    this.closeDialog();
    this.root.classList.add('leaving');
    setTimeout(() => { if (!this.open) this.root.classList.add('hidden'); this.root.classList.remove('leaving'); }, 650);
  }
  // Abblende der Kamera-Regie (wird jedes Bild aus game.js gesetzt)
  tick() { if (this.open) this.fadeEl.style.opacity = this.mode === 'main' ? this.director.fade.toFixed(3) : '0'; }

  // ---------- Hauptliste ----------
  items() {
    const G = this.G, live = SaveSlots.live(), session = G.session();
    const info = live ? SaveSlots.summary(live) : '';
    if (this.mode === 'pause') {
      return [
        { id: 'resume', label: 'Fortsetzen', desc: 'Zurück ins Spiel.', act: () => this.resume() },
        { id: 'save', label: 'Spiel speichern', desc: 'Den aktuellen Stand auf einen Speicherplatz schreiben.', act: () => this.openPanel('save') },
        { id: 'load', label: 'Spiel laden', desc: 'Einen gespeicherten Spielstand laden.', act: () => this.openPanel('load') },
        { id: 'online', label: G.net && G.net.online ? 'Online-Sitzung' : 'Online-Modus', desc: G.net && G.net.online ? `Verbunden mit „${G.net.room.name}“. Lobby verlassen oder wechseln.` : 'Mit anderen Spielern in derselben Stadt spielen.', act: () => this.openPanel('online') },
        { id: 'settings', label: 'Einstellungen', desc: 'Grafik, Anzeige, Audio, Steuerung und Allgemeines.', act: () => this.openPanel('settings') },
        { id: 'menu', label: 'Hauptmenü', desc: 'Spiel verlassen und zum Hauptmenü zurückkehren. Geld, Besitz und Garage bleiben gespeichert.', act: () => this.toMainMenu() },
        { id: 'quit', label: 'Beenden', desc: 'Spiel speichern und beenden.', act: () => this.quit() },
      ];
    }
    return [
      { id: 'continue', label: session ? 'Fortsetzen' : 'Weiterspielen', disabled: !live && !session,
        desc: session ? 'Zurück in die laufende Sitzung.' : live ? `Dein Spielstand: ${info}.` : 'Noch kein Spielstand vorhanden – starte ein neues Spiel.',
        act: () => session ? this.resume() : this.start('continue') },
      { id: 'new', label: 'Neues Spiel', desc: 'Neu am Coburger Bahnhof beginnen: € 500, ein Auto steht bereit.' + (live ? ' Der bisherige Stand wird vorher gesichert.' : ''), act: () => this.newGame() },
      { id: 'online', label: 'Online-Modus', desc: 'Bis zu 16 Spieler in derselben Stadt: Lobbys, Sitzungen, eigene Server oder Peer-to-Peer.', act: () => this.openPanel('online') },
      { id: 'load', label: 'Spiel laden', desc: 'Speicherplätze, automatische Sicherung, Import und Export.', act: () => this.openPanel('load') },
      { id: 'settings', label: 'Einstellungen', desc: 'Grafik, Auflösung und Darstellung, Audio, Steuerung, Allgemeines.', act: () => this.openPanel('settings') },
      { id: 'credits', label: 'Credits', desc: 'Mitwirkende, Datenquellen und Lizenzen.', act: () => this.openPanel('credits') },
      { id: 'quit', label: 'Beenden', desc: 'Spiel speichern und beenden.', act: () => this.quit() },
    ];
  }
  renderNav() {
    const nav = this.$('mm-nav');
    nav.innerHTML = '';
    this.list = this.items();
    this.list.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'mm-item'; b.dataset.id = it.id; b.style.setProperty('--i', i);
      b.disabled = !!it.disabled;
      b.innerHTML = `<span class="mm-num">${String(i + 1).padStart(2, '0')}</span><span class="mm-label"></span><span class="mm-arrow">›</span>`;
      b.querySelector('.mm-label').textContent = it.label;
      b.addEventListener('mouseenter', () => { if (!b.disabled && document.activeElement !== b) b.focus({ preventScroll: true }); });
      b.addEventListener('focus', () => { this.audio.hover(); this.describe(it); nav.querySelectorAll('.mm-item').forEach(x => x.classList.toggle('sel', x === b)); });
      b.addEventListener('click', () => { if (this.busy || b.disabled) return; this.fullscreenOnTouch(); this.audio.select(); it.act(); });
      nav.appendChild(b);
    });
  }
  describe(it) {
    const el = this.$('mm-info');
    el.classList.remove('in'); void el.offsetWidth;
    el.textContent = it.desc || '';
    el.classList.add('in');
  }
  focusFirst() {
    if (this.panel) { const f = this.$('mm-panel-body').querySelector('button:not(:disabled), input, select'); if (f) f.focus({ preventScroll: true }); return; }
    const b = this.$('mm-nav').querySelector('.mm-item:not(:disabled)');
    if (b) b.focus({ preventScroll: true });
  }
  fullscreenOnTouch() {
    if (!document.body.classList.contains('touch')) return;
    const d = document.documentElement;
    if (d.requestFullscreen && !document.fullscreenElement) d.requestFullscreen().catch(() => {});
  }

  // ---------- Tastatur ----------
  onKey(e) {
    if (!this.open) return;
    if (this.waitKey) return;   // Tastenbelegung nimmt die Taste selbst
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'range';
    if (!this.$('mm-dialog').classList.contains('hidden')) {
      if (e.key === 'Escape') { e.preventDefault(); this.closeDialog(); }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (typing) { e.target.blur(); return; }
      if (this.panel) this.back(); else if (this.mode === 'pause') this.resume();
      return;
    }
    if (typing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const scope = this.panel ? this.$('mm-panel-body') : this.$('mm-nav');
      const all = [...scope.querySelectorAll(this.panel ? 'button:not(:disabled), input:not([type=hidden]), select, summary' : '.mm-item:not(:disabled)')].filter(x => x.offsetParent);
      if (!all.length) return;
      e.preventDefault();
      const i = all.indexOf(document.activeElement);
      const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
      n.focus(); if (this.panel) n.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---------- Fenster rechts (Online, Laden, Speichern, Einstellungen, Credits) ----------
  openPanel(name) {
    this.panel = name;
    const titles = { online: 'Online-Modus', load: 'Spiel laden', save: 'Spiel speichern', settings: 'Einstellungen', credits: 'Credits' };
    this.$('mm-panel-title').textContent = titles[name] || '';
    this.root.classList.add('has-panel');
    const P = this.$('mm-panel'); P.classList.remove('in'); void P.offsetWidth; P.classList.add('in');
    P.dataset.panel = name;
    const body = this.$('mm-panel-body');
    body.innerHTML = ''; body.scrollTop = 0;
    clearInterval(this.creditsT);
    if (name === 'online') this.renderOnline();
    else if (name === 'load' || name === 'save') this.renderSlots(name);
    else if (name === 'settings') this.renderSettings();
    else if (name === 'credits') this.renderCredits();
    this.$('mm-nav').querySelectorAll('.mm-item').forEach(x => x.classList.toggle('open', x.dataset.id === name));
    setTimeout(() => this.focusFirst(), 80);
  }
  closePanel(silent) {
    if (!this.panel) return;
    if (this.panel === 'online' && this.G.lobby) this.G.lobby.detach();
    clearInterval(this.creditsT);
    const id = this.panel;
    this.panel = null;
    this.root.classList.remove('has-panel');
    this.$('mm-panel').classList.remove('in');
    this.$('mm-nav').querySelectorAll('.mm-item').forEach(x => x.classList.remove('open'));
    if (!silent) { const b = this.$('mm-nav').querySelector(`[data-id="${id}"]`); if (b) b.focus({ preventScroll: true }); }
  }
  back() { if (this.panel) { this.audio.back(); this.closePanel(); } }

  // ---------- Dialog ----------
  dialog(title, text, buttons) {
    this.$('mm-dialog-title').textContent = title;
    this.$('mm-dialog-text').textContent = text;
    const box = this.$('mm-dialog-btns'); box.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = 'mm-btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      el.textContent = b.label;
      el.onclick = () => { this.audio[b.primary || b.danger ? 'select' : 'back'](); this.closeDialog(); if (b.act) b.act(); };
      box.appendChild(el);
    }
    this.$('mm-dialog').classList.remove('hidden');
    setTimeout(() => { const p = box.querySelector('.primary, .danger') || box.querySelector('button'); if (p) p.focus(); }, 30);
  }
  closeDialog() { this.$('mm-dialog').classList.add('hidden'); }
  toast(text, bad) {
    let t = this.root.querySelector('.mm-toast');
    if (!t) { t = document.createElement('div'); t.className = 'mm-toast'; this.root.appendChild(t); }
    t.textContent = text; t.classList.toggle('bad', !!bad);
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('in'), 2600);
    if (bad) this.audio.error();
  }

  // ---------- Aktionen ----------
  start(how, online) {
    if (this.busy) return;
    this.busy = true;
    this.audio.start();
    this.hide();
    this.G.enterWorld({ how, online }).finally(() => { this.busy = false; });
  }
  resume() { this.hide(); this.G.resume(); }
  newGame() {
    const live = SaveSlots.live();
    if (!live && !this.G.session()) { this.start('new'); return; }
    this.dialog('Neues Spiel beginnen?', `Dein bisheriger Spielstand (${live ? SaveSlots.summary(live) : 'laufende Sitzung'}) wird als „Sicherung“ unter „Spiel laden“ aufbewahrt. Danach startest du neu am Bahnhof mit € 500.`, [
      { label: 'Abbrechen' },
      { label: 'Neues Spiel', primary: true, act: () => {
        this.G.persist();
        SaveSlots.backup('Sicherung vor neuem Spiel');
        SaveSlots.write(SaveSlots.LIVE, { money: 500, best: {} });
        this.G.reloadInto('new');
      } },
    ]);
  }
  toMainMenu() {
    const online = this.G.net && this.G.net.online;
    this.dialog('Zum Hauptmenü?', 'Geld, Wohnungen, Garage und Bestzeiten sind gespeichert.' + (online ? ' Du verlässt dabei die Online-Lobby.' : ''), [
      { label: 'Abbrechen' },
      { label: 'Zum Hauptmenü', primary: true, act: () => { this.G.toMenu(); this.show('main'); } },
    ]);
  }
  quit() {
    this.dialog('Spiel beenden?', 'Der Spielstand wird gespeichert, eine Online-Sitzung wird beendet und die 3D-Grafik angehalten.', [
      { label: 'Abbrechen' },
      { label: 'Beenden', danger: true, act: () => {
        this.G.persist();
        if (this.G.net && this.G.net.online) this.G.net.leave();
        this.hide();
        this.G.stopRendering();
        this.$('mm-quit').classList.remove('hidden');
      } },
    ]);
  }

  // ---------- Spielstände ----------
  renderSlots(kind) {
    const body = this.$('mm-panel-body');
    const saving = kind === 'save';
    const live = SaveSlots.live();
    const wrap = document.createElement('div');
    wrap.className = 'sv';
    const row = (title, meta, info, buttons, cls = '') => {
      const r = document.createElement('div');
      r.className = 'sv-row ' + cls;
      r.innerHTML = `<div class="sv-txt"><b></b><span class="sv-meta"></span><span class="sv-info"></span></div><div class="sv-act"></div>`;
      r.querySelector('b').textContent = title;
      r.querySelector('.sv-meta').textContent = meta;
      r.querySelector('.sv-info').textContent = info;
      for (const b of buttons) {
        const el = document.createElement('button');
        el.className = 'mm-btn' + (b.primary ? ' primary' : '') + (b.ghost ? ' ghost' : '');
        el.textContent = b.label; el.disabled = !!b.disabled; el.onclick = () => { this.audio.select(); b.act(); };
        r.querySelector('.sv-act').appendChild(el);
      }
      wrap.appendChild(r);
    };
    const head = t => { const h = document.createElement('h3'); h.className = 'mm-h3'; h.textContent = t; wrap.appendChild(h); };
    if (!saving) {
      head('Aktueller Spielstand');
      row('Automatisch gespeichert', live ? 'wird laufend gesichert' : 'leer', live ? SaveSlots.summary(live) : 'Noch kein Spielstand – starte ein neues Spiel.',
        [{ label: this.G.session() ? 'Fortsetzen' : 'Weiterspielen', primary: true, disabled: !live && !this.G.session(), act: () => this.G.session() ? this.resume() : this.start('continue') }], 'live');
      const bk = SaveSlots.read(SaveSlots.key('backup'));
      if (bk && SaveSlots.valid(bk.data)) row(bk.name || 'Sicherung', SaveSlots.ago(bk.t), SaveSlots.summary(bk.data), [{ label: 'Laden', act: () => this.loadData(bk.data, bk.name || 'Sicherung') }]);
    }
    head('Speicherplätze');
    for (let i = 1; i <= SaveSlots.N; i++) {
      const s = SaveSlots.slot(i);
      const title = `Platz ${i}` + (s && s.name ? ' · ' + s.name : '');
      const btns = [];
      if (saving) btns.push({ label: s ? 'Überschreiben' : 'Hier speichern', primary: !s, act: () => this.saveTo(i, !!s) });
      else btns.push({ label: 'Laden', primary: true, disabled: !s, act: () => this.loadData(s.data, title) });
      if (s) btns.push({ label: 'Löschen', ghost: true, act: () => this.dialog(`${title} löschen?`, 'Dieser Speicherplatz wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.', [
        { label: 'Abbrechen' }, { label: 'Löschen', danger: true, act: () => { SaveSlots.del(SaveSlots.key(i)); this.renderSlots(kind === 'save' ? 'save' : 'load'); this.toast('Speicherplatz gelöscht'); } }]) });
      row(title, s ? SaveSlots.ago(s.t) : 'leer', s ? SaveSlots.summary(s.data) : '–', btns, s ? '' : 'empty');
    }
    head('Datei');
    const io = document.createElement('div');
    io.className = 'sv-io';
    io.innerHTML = `<button class="mm-btn" data-a="export">Spielstand exportieren (.json)</button><button class="mm-btn" data-a="import">Spielstand importieren …</button><input type="file" accept="application/json,.json" hidden>`;
    const file = io.querySelector('input');
    io.querySelector('[data-a=export]').disabled = !live;
    io.querySelector('[data-a=export]').onclick = () => {
      this.G.persist();
      const data = SaveSlots.live(); if (!data) return;
      const blob = new Blob([JSON.stringify({ game: 'GTA Coburg', v: 1, t: Date.now(), data }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'gta-coburg-spielstand-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.toast('Spielstand exportiert');
    };
    io.querySelector('[data-a=import]').onclick = () => file.click();
    file.onchange = () => {
      const f = file.files && file.files[0]; if (!f) return;
      if (f.size > 2e6) { this.toast('Datei zu groß für einen Spielstand', true); return; }
      f.text().then(txt => {
        let o = null; try { o = JSON.parse(txt); } catch (e) { /* unten */ }
        const data = o && (o.data || o);
        if (!SaveSlots.valid(data)) { this.toast('Keine gültige GTA-Coburg-Spielstanddatei', true); return; }
        this.loadData(data, f.name);
      });
      file.value = '';
    };
    wrap.appendChild(io);
    const note = document.createElement('p');
    note.className = 'mm-hint';
    note.textContent = 'Spielstände liegen nur in diesem Browser. Zum Übertragen auf ein anderes Gerät exportieren und dort importieren.';
    wrap.appendChild(note);
    body.innerHTML = ''; body.appendChild(wrap);
  }
  saveTo(i, overwrite) {
    const doIt = () => {
      this.G.persist();
      const data = SaveSlots.live();
      if (!data) { this.toast('Es gibt noch nichts zu speichern', true); return; }
      const where = this.G.whereText ? this.G.whereText() : '';
      if (!SaveSlots.store(i, data, where)) { this.toast('Speichern fehlgeschlagen (Browserspeicher voll?)', true); return; }
      this.renderSlots('save');
      this.toast(`Gespeichert auf Platz ${i}`);
    };
    if (overwrite) this.dialog(`Platz ${i} überschreiben?`, 'Der bisherige Inhalt dieses Speicherplatzes wird ersetzt.', [{ label: 'Abbrechen' }, { label: 'Überschreiben', primary: true, act: doIt }]);
    else doIt();
  }
  loadData(data, title) {
    this.dialog(`„${title}“ laden?`, `${SaveSlots.summary(data)}. Der aktuelle Stand wird vorher als „Sicherung“ aufbewahrt. Das Spiel lädt dafür neu.`, [
      { label: 'Abbrechen' },
      { label: 'Laden', primary: true, act: () => {
        this.G.persist();
        SaveSlots.backup('Sicherung vor dem Laden');
        if (!SaveSlots.write(SaveSlots.LIVE, data)) { this.toast('Laden fehlgeschlagen (Browserspeicher voll?)', true); return; }
        this.G.reloadInto('continue');
      } },
    ]);
  }

  // ---------- Online ----------
  renderOnline() {
    const body = this.$('mm-panel-body');
    body.appendChild(this.$('tpl-online').content.cloneNode(true));
    if (this.G.lobby) this.G.lobby.attach(body);
    else { const s = body.querySelector('#lobby-status'); s.textContent = 'Der Mehrspieler-Teil ist noch nicht bereit.'; s.classList.add('bad'); }
  }

  // ---------- Einstellungen ----------
  renderSettings(tab) {
    tab = tab || this.setTab || 'grafik';
    this.setTab = tab;
    const body = this.$('mm-panel-body');
    const keep = body.scrollTop;
    body.innerHTML = '';
    const G = this.G, S = Settings;
    const tabs = [['grafik', 'Grafik'], ['anzeige', 'Anzeige'], ['audio', 'Audio'], ['steuerung', 'Steuerung'], ['allgemein', 'Allgemein']];
    const bar = document.createElement('div'); bar.className = 'st-tabs'; bar.setAttribute('role', 'tablist');
    for (const [id, name] of tabs) {
      const b = document.createElement('button');
      b.className = 'st-tab' + (id === tab ? ' on' : ''); b.textContent = name; b.setAttribute('role', 'tab');
      b.onclick = () => { this.audio.hover(); this.renderSettings(id); setTimeout(() => { const t = body.querySelector('.st-tab.on'); if (t) t.focus(); }, 0); };
      bar.appendChild(b);
    }
    body.appendChild(bar);
    const list = document.createElement('div'); list.className = 'st-list';
    body.appendChild(list);
    const row = (label, hint, control) => {
      const r = document.createElement('div'); r.className = 'st-row';
      r.innerHTML = `<div class="st-l"><b></b><span></span></div><div class="st-c"></div>`;
      r.querySelector('b').textContent = label; r.querySelector('span').textContent = hint || '';
      r.querySelector('.st-c').appendChild(control);
      list.appendChild(r);
      return r;
    };
    const head = t => { const h = document.createElement('h3'); h.className = 'mm-h3'; h.textContent = t; list.appendChild(h); };
    const seg = (opts, value, onPick, disabled) => {
      const w = document.createElement('div'); w.className = 'st-seg';
      for (const [v, name] of opts) {
        const b = document.createElement('button');
        b.textContent = name; b.className = v === value ? 'on' : ''; b.disabled = !!disabled;
        b.onclick = () => { this.audio.hover(); onPick(v); };
        w.appendChild(b);
      }
      return w;
    };
    const toggle = (on, onSet) => {
      const b = document.createElement('button');
      b.className = 'st-toggle' + (on ? ' on' : ''); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.innerHTML = '<i></i><span></span>'; b.querySelector('span').textContent = on ? 'An' : 'Aus';
      b.onclick = () => { this.audio.hover(); onSet(!on); };
      return b;
    };
    const slider = (min, max, step, value, fmt, onSet) => {
      const w = document.createElement('div'); w.className = 'st-slider';
      const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
      const o = document.createElement('output'); o.textContent = fmt(value);
      const paint = () => r.style.setProperty('--p', ((r.value - min) / (max - min) * 100) + '%');
      r.oninput = () => { o.textContent = fmt(+r.value); paint(); onSet(+r.value, false); };
      r.onchange = () => { onSet(+r.value, true); this.audio.hover(); };
      paint();
      w.append(r, o); return w;
    };
    const pct = v => Math.round(v * 100) + ' %';
    const Q = window.QUALITY || {};

    if (tab === 'grafik') {
      head('Qualität');
      const lv = (window.Boot && window.Boot.level) || Q.level || 'voll';
      const r1 = row('Grafikstufe', 'Weltdetails, Sichtweite, 3D-Gebäude und Luftbilder. Ändern lädt das Spiel neu (Spielstand bleibt).',
        seg([['voll', 'Voll'], ['mobil', 'Mobil'], ['leicht', 'Leicht']], lv, v => {
          if (v === lv) return;
          this.dialog('Grafikstufe ändern?', `Für „${v}“ lädt das Spiel neu. Geld, Besitz und Garage bleiben erhalten.`, [{ label: 'Abbrechen' }, { label: 'Neu laden', primary: true, act: () => G.reloadGraphics(v) }]);
        }));
      r1.classList.add('wide');
      const post = G.post;
      row('Nachbearbeitung', Q.postForce ? 'In der leichten Grafikstufe fest auf Niedrig.' : 'Umgebungsverdeckung, Spiegelungen, Bloom, Kantenglättung (im Spiel auch Taste O).',
        seg(POST_ORDER.map(k => [k, POST_QUALITY[k].name]), post.level, v => { post.setLevel(v); this.renderSettings(); }, Q.postForce));
      row('Bewegungsunschärfe', 'Bei schnellen Kamerafahrten, nur zum Bildrand hin (Taste B).', toggle(post.blur.on, v => { post.toggleBlur(v); this.renderSettings(); }));
      row('Dynamische Auflösung', 'Senkt die Renderauflösung kurz, wenn die Bildrate einbricht.', toggle(S.get('display', 'adaptive'), v => { S.set('display', 'adaptive', v); this.renderSettings(); }));
      const gl = G.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unbekannt';
      head('System');
      const info = document.createElement('div'); info.className = 'st-info';
      info.textContent = `three.js r${THREE.REVISION} · ${G.renderer.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1'} · Grafikkarte: ${String(gpu).replace(/ANGLE \((.*)\)/, '$1').slice(0, 90)}`;
      list.appendChild(info);
    } else if (tab === 'anzeige') {
      head('Auflösung und Darstellungsmodus');
      const fs = !!document.fullscreenElement;
      row('Darstellungsmodus', document.fullscreenEnabled ? 'Vollbild über die ganze Bildschirmfläche oder im Browserfenster.' : 'Dieser Browser erlaubt kein Vollbild für Webseiten.',
        seg([['window', 'Fenster'], ['full', 'Vollbild']], fs ? 'full' : 'window', v => {
          if (v === 'full') document.documentElement.requestFullscreen?.().catch(() => this.toast('Vollbild wurde vom Browser abgelehnt', true));
          else if (document.fullscreenElement) document.exitFullscreen?.();
        }, !document.fullscreenEnabled));
      const res = S.get('display', 'res');
      const size = new THREE.Vector2(); G.renderer.getDrawingBufferSize(size);
      row('Renderauflösung', `Anteil der Bildschirmauflösung. Jetzt: ${Math.round(size.x)} × ${Math.round(size.y)} Pixel (Fenster ${innerWidth} × ${innerHeight}, Pixeldichte ${(devicePixelRatio || 1).toFixed(2).replace('.', ',')}).`,
        seg([[0.5, '50 %'], [0.67, '67 %'], [0.75, '75 %'], [0.85, '85 %'], [1, '100 %']], res, v => { S.set('display', 'res', v); G.post.apply(); this.renderSettings(); }));
      row('Sichtfeld', 'Blickwinkel der Spielkamera zu Fuß und im Auto.', slider(55, 90, 1, S.get('controls', 'fov'), v => v + '°', v => S.set('controls', 'fov', v)));
      head('Oberfläche');
      row('Tastenhinweise im Spiel', 'Hinweis „F1 Hilfe · M Stadtplan“ oben links.', toggle(S.get('general', 'hints'), v => { S.set('general', 'hints', v); this.renderSettings(); }));
    } else if (tab === 'audio') {
      const A = S.get('audio');
      head('Lautstärke');
      row('Gesamt', '', slider(0, 1, 0.01, A.master, pct, v => S.set('audio', 'master', v)));
      row('Effekte und Fahrzeuge', 'Motoren, Hupe, Schüsse, Explosionen, Aufpralle.', slider(0, 1, 0.01, A.sfx, pct, v => S.set('audio', 'sfx', v)));
      row('Umgebung', 'Stimmengewirr, Martinshorn, Stadtatmosphäre im Menü.', slider(0, 1, 0.01, A.ambient, pct, v => S.set('audio', 'ambient', v)));
      row('Menü und Oberfläche', 'Klicks und Klangfläche im Menü.', slider(0, 1, 0.01, A.ui, pct, v => { S.set('audio', 'ui', v); }));
      head('Verhalten');
      row('Stumm im Hintergrund', 'Ton aus, solange der Tab nicht sichtbar ist.', toggle(A.muteHidden, v => { S.set('audio', 'muteHidden', v); this.renderSettings(); }));
    } else if (tab === 'steuerung') {
      const C = S.get('controls');
      head('Maus und Kamera');
      row('Mausempfindlichkeit', 'Umsehen mit der Maus bzw. dem Finger.', slider(0.3, 2.5, 0.05, C.sens, v => v.toFixed(2).replace('.', ',') + '×', v => S.set('controls', 'sens', v)));
      row('Y-Achse umkehren', 'Maus nach oben = nach unten schauen.', toggle(C.invertY, v => { S.set('controls', 'invertY', v); this.renderSettings(); }));
      head('Tastenbelegung');
      if (document.body.classList.contains('touch')) { const p = document.createElement('p'); p.className = 'mm-hint'; p.textContent = 'Auf Touch-Geräten steuerst du mit Joystick und Knöpfen; die Belegung gilt für eine angeschlossene Tastatur.'; list.appendChild(p); }
      const grid = document.createElement('div'); grid.className = 'st-keys';
      for (const a of S.ACTIONS) {
        const r = document.createElement('div'); r.className = 'st-key';
        const k = S.keyFor(a.code);
        r.innerHTML = `<span></span><button class="mm-key${k !== a.code ? ' changed' : ''}"></button>`;
        r.querySelector('span').textContent = a.name;
        const b = r.querySelector('button'); b.textContent = S.label(k);
        b.onclick = () => this.captureKey(a, b);
        grid.appendChild(r);
      }
      list.appendChild(grid);
      const fixed = document.createElement('p'); fixed.className = 'mm-hint';
      fixed.textContent = 'Fest belegt: Maus (umsehen, zielen, schießen), 1–7 Waffen, O Grafik, B Unschärfe, F1 Hilfe, Tab Spielerliste, Pfeiltasten als zweite Fahrtasten.';
      list.appendChild(fixed);
      const rs = document.createElement('button'); rs.className = 'mm-btn'; rs.textContent = 'Standardbelegung wiederherstellen';
      rs.onclick = () => { S.set('controls', 'keys', {}); this.renderSettings(); this.toast('Standardbelegung wiederhergestellt'); };
      list.appendChild(rs);
    } else if (tab === 'allgemein') {
      const g = S.get('general');
      head('Menü und Laden');
      row('Kamerafahrt im Menü', 'Fahrt durch Coburg hinter dem Hauptmenü; aus = stehendes Bild (spart Leistung).', toggle(g.menuCam, v => { S.set('general', 'menuCam', v); this.director.still = !v; this.renderSettings(); }));
      row('Tipps auf dem Ladebildschirm', '', toggle(g.tips, v => { S.set('general', 'tips', v); this.renderSettings(); }));
      head('Spiel');
      row('Ort für „Weiterspielen“ merken', 'Speichert alle 20 s, wo du bist (draußen, ohne Fahndung, nicht im Rennen). Aus = Start immer am Bahnhof.', toggle(g.autosave, v => { S.set('general', 'autosave', v); this.renderSettings(); }));
      head('Zurücksetzen');
      const rs = document.createElement('button'); rs.className = 'mm-btn'; rs.textContent = 'Alle Einstellungen zurücksetzen';
      rs.onclick = () => this.dialog('Alle Einstellungen zurücksetzen?', 'Audio, Steuerung, Anzeige und Allgemeines gehen auf den Standard. Spielstände bleiben unberührt.', [
        { label: 'Abbrechen' }, { label: 'Zurücksetzen', danger: true, act: () => { for (const k of ['audio', 'controls', 'display', 'general']) S.reset(k); G.post.apply(); this.director.still = false; this.renderSettings(); this.toast('Einstellungen zurückgesetzt'); } }]);
      list.appendChild(rs);
    }
    body.scrollTop = keep;
  }
  captureKey(a, b) {
    this.audio.hover();
    b.textContent = 'Taste drücken …'; b.classList.add('wait');
    const done = () => { removeEventListener('keydown', on, true); setTimeout(() => { this.waitKey = false; }, 0); };
    const on = e => {
      e.preventDefault(); e.stopPropagation();
      done();
      if (e.code === 'Escape') { this.renderSettings(); return; }
      if (/^(F1|Tab|Digit[1-7]|KeyO|KeyB|Escape|MetaLeft|MetaRight)$/.test(e.code)) { this.toast(`${Settings.label(e.code)} ist fest belegt`, true); this.renderSettings(); return; }
      Settings.bind(a.code, e.code);
      this.renderSettings();
      this.toast(`${a.name}: ${Settings.label(e.code)}`);
    };
    this.waitKey = true;
    addEventListener('keydown', on, true);
  }

  // ---------- Credits ----------
  renderCredits() {
    const body = this.$('mm-panel-body');
    const C = [
      ['GTA Coburg', ['Ein Open-World-Spiel im Browser auf den echten Straßen der Stadt und des Landkreises Coburg.']],
      ['Spielidee und Projektleitung', ['Das GTA-Coburg-Projekt']],
      ['Entwicklung', ['Programmierung, Spielwelt, Grafik und Mehrspieler: entwickelt mit Claude (Anthropic) im Auftrag des Projekts']],
      ['Kartendaten', ['© OpenStreetMap-Mitwirkende (ODbL)']],
      ['Luftbilder und 3D-Gebäude (LoD2)', ['Bayerische Vermessungsverwaltung – www.geodaten.bayern.de (CC BY 4.0)', 'Luftbilder Thüringen: © GDI-Th (CC BY 4.0)']],
      ['Höhendaten', ['EU-DEM über opentopodata.org', 'Terrarium-Höhenkacheln (Mapzen, AWS Open Data)']],
      ['Automodelle', ['Comrade1280 auf Sketchfab (CC BY 4.0)']],
      ['Software', ['three.js (MIT-Lizenz)', 'PeerJS (MIT-Lizenz) für Peer-to-Peer-Mehrspieler', 'Schriften Anton, Cinzel und Inter (SIL Open Font License) über Google Fonts']],
      ['Hinweis', ['GTA Coburg ist ein nicht kommerzielles Fan-Projekt. Es steht in keiner Verbindung zu Rockstar Games oder Take-Two Interactive. Alle Fahrzeugmarken im Spiel sind erfunden.']],
      ['Danke', ['an alle, die OpenStreetMap pflegen, und an die Stadt Coburg für eine Altstadt, durch die man gerne fährt.']],
    ];
    const roll = document.createElement('div'); roll.className = 'cr';
    roll.innerHTML = `<div class="gc-logo gc-logo--sm"><span class="gc-gta">GTA</span><span class="gc-city">Coburg</span></div>` +
      C.map(([h, lines]) => `<section><h4>${h}</h4>${lines.map(l => `<p>${l}</p>`).join('')}</section>`).join('') + `<p class="cr-end">Version ${this.G.version || ''}</p>`;
    body.appendChild(roll);
    // langsam rollen, bei Maus darüber oder Berührung anhalten
    let hold = false, acc = 0;
    body.onmouseenter = () => { hold = true; }; body.onmouseleave = () => { hold = false; };
    body.ontouchstart = () => { hold = true; };
    clearInterval(this.creditsT);
    this.creditsT = setInterval(() => {
      if (this.panel !== 'credits' || hold) return;
      acc += 0.6;
      if (acc >= 1) { body.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 1) clearInterval(this.creditsT);
    }, 33);
  }
}
window.MainMenu = MainMenu; window.MenuDirector = MenuDirector; window.SaveSlots = SaveSlots;
