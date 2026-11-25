// Story-Modus (seit v3.22.0), Teil 1: Oberfläche ohne Vertonung.
//   STORY_CAST        Figuren der Geschichte: Name, Farbe, Aussehen der 3D-Figur, Porträt
//   Portrait          gezeichnete, animierte Porträts (Blinzeln, Mund beim Sprechen, Stimmung über Brauen und Mund)
//   DialogueManager   Dialogfenster (Szene: Kinobalken, Porträt, Schreibmaschine, Antworten) und Untertitel im Spiel
//   StoryHUD          Missionsziel, Zeit, Balken, Handy (SMS, Anrufe), Titelkarten, Erfolg/Gescheitert, Dokumente,
//                     Beziehungs-Hinweise, Tagebuch
// Alles hängt am DOM (eigene Elemente unter #story-root), Aussehen in css/story.css.
'use strict';

// ---------------------------------------------------------------------------------------------------------------
// Figuren
// ---------------------------------------------------------------------------------------------------------------
// look: Player-Figur (js/player.js) plus Zubehör (CharacterManager in js/story-core.js)
// face: Porträt (Haut, Haar, Frisur, Kleidung, Akzentfarbe, Bart, Brille, Kappe, Krawatte)
const STORY_CAST = {
  leon: { name: 'Leon', full: 'Leon Berger', color: '#e9b949',
    look: { skin: '#e2b493', shirt: '#56603f', pants: '#262c38', hair: '#8a6a3a' },
    face: { skin: '#e2b493', hair: '#8a6a3a', style: 'short', shirt: '#56603f', collar: '#3f4730', bg: ['#2b3a4a', '#121820'] } },
  max: { name: 'Max', full: 'Maximilian „Max“ Fischer', color: '#ff8a3d',
    look: { skin: '#d9a47c', shirt: '#e6b422', pants: '#3d4a66', hair: '#4a2e1a', cap: '#c0392b', curls: true, chain: true },
    face: { skin: '#d9a47c', hair: '#4a2e1a', style: 'curls', shirt: '#e6b422', collar: '#b88a10', cap: '#c0392b', chain: true, bg: ['#5a2a18', '#1c0f0a'] } },
  voss: { name: 'Voss', full: 'Richard Voss', color: '#c9c9d6',
    look: { skin: '#e7c3a6', shirt: '#33363d', pants: '#2a2c31', hair: '#9a9a9a', tie: '#7a1f2b', slick: true },
    face: { skin: '#e7c3a6', hair: '#a5a5a8', style: 'slick', shirt: '#33363d', collar: '#f2f2f2', tie: '#7a1f2b', lines: true, bg: ['#30323a', '#0d0e12'] } },
  sarah: { name: 'Sarah', full: 'Sarah Neumann', color: '#3ec7c2',
    look: { skin: '#efc9ad', shirt: '#1f6f78', pants: '#22252c', hair: '#141414', glasses: true, bob: true },
    face: { skin: '#efc9ad', hair: '#151515', style: 'bob', shirt: '#1f6f78', collar: '#185860', glasses: true, bg: ['#163c44', '#091416'] } },
  tobi: { name: 'Tobi', full: 'Tobias „Tobi“ Weber', color: '#5fa0ff',
    look: { skin: '#e8b591', shirt: '#2c4f8c', pants: '#2c4f8c', hair: '#e8b591', beard: '#b0602c', bald: true },
    face: { skin: '#e8b591', hair: null, style: 'bald', shirt: '#2c4f8c', collar: '#223e70', beard: '#b0602c', bg: ['#1f3150', '#0b111c'] } },
  erwin: { name: 'Erwin', full: 'Erwin vom Bratwurststand', color: '#c0392b',
    look: { skin: '#e4ad8a', shirt: '#f0ece2', pants: '#3a3a3a', hair: '#d8d8d8', cap: '#b8322a', beard: '#cfcfcf' },
    face: { skin: '#e4ad8a', hair: '#d8d8d8', style: 'short', shirt: '#f0ece2', collar: '#c0392b', cap: '#b8322a', beard: '#cfcfcf', lines: true, bg: ['#4a1a14', '#160806'] } },
  gundermann: { name: 'Fr. Gundermann', full: 'Frau Gundermann', color: '#b57cff',
    look: { skin: '#eac2a8', shirt: '#6a4a7a', pants: '#3b3346', hair: '#cfc6d6', bob: true },
    face: { skin: '#eac2a8', hair: '#d6cfdc', style: 'perm', shirt: '#6a4a7a', collar: '#e8e0ec', glasses: true, lines: true, bg: ['#3a2a46', '#120c16'] } },
  kraus: { name: 'Hr. Kraus', full: 'Herr Kraus', color: '#8fbf6a',
    look: { skin: '#e6b89a', shirt: '#7a6a52', pants: '#4a4438', hair: '#efefef', cap: '#5a5040' },
    face: { skin: '#e6b89a', hair: '#efefef', style: 'short', shirt: '#7a6a52', collar: '#5a4c3a', cap: '#5a5040', lines: true, bg: ['#2f3a24', '#0e120a'] } },
  lenz: { name: 'Dr. Lenz', full: 'Dr. Katharina Lenz', color: '#e86a9a',
    look: { skin: '#f0cdb4', shirt: '#2a2a33', pants: '#2a2a33', hair: '#a8562a', bob: true },
    face: { skin: '#f0cdb4', hair: '#a8562a', style: 'bun', shirt: '#2a2a33', collar: '#f4f4f4', bg: ['#3a1c2a', '#12080d'] } },
  // Kapitel 2
  gul: { name: 'Gül', full: 'Gül Aydın, Taxifahrerin', color: '#f2c230',
    look: { skin: '#d8a07a', shirt: '#efe6c4', pants: '#2a2c34', hair: '#1c1410', bob: true },
    face: { skin: '#d8a07a', hair: '#1c1410', style: 'bun', shirt: '#efe6c4', collar: '#d4c89a', bg: ['#4a3a10', '#141006'] } },
  rocco: { name: 'Rocco', full: 'Rocco, Ketschengasse', color: '#c97a3a',
    look: { skin: '#d9a682', shirt: '#5a3a24', pants: '#1e1e22', hair: '#141414', slick: true, chain: true },
    face: { skin: '#d9a682', hair: '#141414', style: 'slick', shirt: '#5a3a24', collar: '#3a2414', chain: true, bg: ['#3a2414', '#100a06'] } },
  dragan: { name: 'Dragan', full: 'Dragan', color: '#e2463f',
    look: { skin: '#e0b494', shirt: '#151619', pants: '#151619', hair: '#e0b494', beard: '#2a2420', bald: true },
    face: { skin: '#e0b494', hair: null, style: 'bald', shirt: '#151619', collar: '#26282c', beard: '#2a2420', lines: true, bg: ['#3a0e0c', '#100404'] } },
  brandt: { name: 'Brandt', full: 'Stadtrat Horst Brandt', color: '#8aa7d8',
    look: { skin: '#e9c2a4', shirt: '#1f2a44', pants: '#1f2a44', hair: '#b8b8b8', tie: '#c8a23a', glasses: true },
    face: { skin: '#e9c2a4', hair: '#b8b8b8', style: 'short', shirt: '#1f2a44', collar: '#f2f2f2', tie: '#c8a23a', glasses: true, lines: true, bg: ['#1c2638', '#080b12'] } },
  hellmuth: { name: 'Hellmuth', full: 'Bankdirektor Hellmuth', color: '#7fc9a8',
    look: { skin: '#efc8ae', shirt: '#4a4d55', pants: '#4a4d55', hair: '#f0f0f0', tie: '#2a5aa0' },
    face: { skin: '#efc8ae', hair: '#f0f0f0', style: 'short', shirt: '#4a4d55', collar: '#f2f2f2', tie: '#2a5aa0', lines: true, bg: ['#1c3a2e', '#08120e'] } },
  hofmann: { name: 'Hofmann', full: 'Bäckermeister Hofmann', color: '#e8d2a0',
    look: { skin: '#eab896', shirt: '#f4f1ea', pants: '#e8e4da', hair: '#6a4a2a', cap: '#f4f1ea' },
    face: { skin: '#eab896', hair: '#6a4a2a', style: 'short', shirt: '#f4f1ea', collar: '#dcd6c8', cap: '#f4f1ea', bg: ['#4a3a20', '#14100a'] } },
  // Kapitel 3
  kessler: { name: 'Kessler', full: 'Jürgen Kessler', color: '#d8b46a',
    look: { skin: '#e6b894', shirt: '#6a5a3a', pants: '#2e2a24', hair: '#7a5a34', glasses: true },
    face: { skin: '#e6b894', hair: '#7a5a34', style: 'short', shirt: '#6a5a3a', collar: '#4a3e28', glasses: true, lines: true, bg: ['#3a2e18', '#120e08'] } },
  roth: { name: 'Roth', full: 'Kriminalhauptkommissarin Hanna Roth', color: '#6fa8dc',
    look: { skin: '#e8bfa0', shirt: '#3a3f4a', pants: '#26282e', hair: '#5a4632', bob: true },
    face: { skin: '#e8bfa0', hair: '#5a4632', style: 'bob', shirt: '#3a3f4a', collar: '#d8dce4', lines: true, bg: ['#1a2a3a', '#080c12'] } },
  hessler: { name: 'Hessler', full: 'Ingenieur Frank Hessler', color: '#b0b8a0',
    look: { skin: '#ecc4a8', shirt: '#8a9070', pants: '#3a3a34', hair: '#c8c0b0', glasses: true },
    face: { skin: '#ecc4a8', hair: '#c8c0b0', style: 'short', shirt: '#8a9070', collar: '#e8e8e0', glasses: true, lines: true, bg: ['#2a2e24', '#0c0e0a'] } },
  wache: { name: 'Wachmann', full: 'Wachmann', color: '#9aa3b2',
    look: { skin: '#dcae8c', shirt: '#22262e', pants: '#22262e', hair: '#2a2a2a', cap: '#14161a' },
    face: { skin: '#dcae8c', hair: '#2a2a2a', style: 'short', shirt: '#22262e', collar: '#14161a', cap: '#14161a', bg: ['#1c2028', '#08090c'] } },
};

// ---------------------------------------------------------------------------------------------------------------
// Porträts
// ---------------------------------------------------------------------------------------------------------------
const Portrait = {
  // Stimmungen: Brauen (Neigung, Höhe), Mund (Krümmung), Augen (Öffnung)
  MOODS: {
    neutral: { brow: 0, browY: 0, smile: 0.1, eye: 1 },
    happy: { brow: -0.1, browY: -1, smile: 0.9, eye: 0.85 },
    laugh: { brow: -0.15, browY: -2, smile: 1.2, eye: 0.45 },
    angry: { brow: 0.55, browY: 2, smile: -0.6, eye: 0.9 },
    sad: { brow: -0.5, browY: -1, smile: -0.5, eye: 0.75 },
    surprised: { brow: -0.05, browY: -4, smile: 0, eye: 1.3, o: true },
    smug: { brow: 0.2, browY: 0, smile: 0.55, eye: 0.7, side: true },
    worried: { brow: -0.4, browY: -2, smile: -0.25, eye: 1.05 },
    cold: { brow: 0.25, browY: 1, smile: 0, eye: 0.7 },
  },
  // ctx: Leinwand 2D, f: Porträt-Daten, mood, t (Sekunden), talk (0..1 Mundöffnung)
  draw(ctx, who, mood, t, talk) {
    const C = STORY_CAST[who] || STORY_CAST.leon, f = C.face, W = ctx.canvas.width, H = ctx.canvas.height;
    const M = Portrait.MOODS[mood] || Portrait.MOODS.neutral;
    const s = W / 160;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, f.bg[0]); g.addColorStop(1, f.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Lichtkreis hinter dem Kopf
    const rg = ctx.createRadialGradient(W * 0.5, H * 0.42, 4 * s, W * 0.5, H * 0.42, 80 * s);
    rg.addColorStop(0, 'rgba(255,255,255,0.18)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    ctx.scale(s, s);
    // leichtes Atmen und Kopfbewegung beim Sprechen
    const breathe = Math.sin(t * 1.6) * 0.8, nod = talk > 0 ? Math.sin(t * 7.3) * 1.2 : 0, tilt = talk > 0 ? Math.sin(t * 2.1) * 0.03 : Math.sin(t * 0.7) * 0.012;
    // Schultern und Kleidung
    ctx.fillStyle = f.shirt;
    ctx.beginPath(); ctx.moveTo(14, 160); ctx.quadraticCurveTo(22, 116 + breathe, 58, 110 + breathe); ctx.lineTo(102, 110 + breathe);
    ctx.quadraticCurveTo(138, 116 + breathe, 146, 160); ctx.closePath(); ctx.fill();
    // Kragen
    ctx.fillStyle = f.collar;
    ctx.beginPath(); ctx.moveTo(62, 110 + breathe); ctx.lineTo(80, 132 + breathe); ctx.lineTo(98, 110 + breathe); ctx.lineTo(90, 108); ctx.lineTo(80, 120 + breathe); ctx.lineTo(70, 108); ctx.closePath(); ctx.fill();
    if (f.tie) { ctx.fillStyle = f.tie; ctx.beginPath(); ctx.moveTo(77, 122 + breathe); ctx.lineTo(83, 122 + breathe); ctx.lineTo(86, 160); ctx.lineTo(74, 160); ctx.closePath(); ctx.fill(); }
    if (f.chain) { ctx.strokeStyle = '#e8c45a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(80, 108 + breathe, 15, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    // Hals
    ctx.fillStyle = Portrait.shade(f.skin, -0.12);
    ctx.fillRect(70, 94 + breathe, 20, 18);
    ctx.translate(80, 66 + breathe + nod * 0.3);
    ctx.rotate(tilt);
    // Haar hinten (Bob, Locken, Dutt)
    if (f.hair && (f.style === 'bob' || f.style === 'perm')) { ctx.fillStyle = f.hair; ctx.beginPath(); ctx.ellipse(0, 4, 36, 40, 0, 0, Math.PI * 2); ctx.fill(); }
    if (f.hair && f.style === 'curls') { ctx.fillStyle = f.hair; for (let i = 0; i < 9; i++) { const a = Math.PI * (0.95 + i * 0.14); ctx.beginPath(); ctx.arc(Math.cos(a) * 30, -6 + Math.sin(a) * 30, 11, 0, Math.PI * 2); ctx.fill(); } }
    if (f.hair && f.style === 'bun') { ctx.fillStyle = f.hair; ctx.beginPath(); ctx.arc(0, -40, 12, 0, Math.PI * 2); ctx.fill(); }
    // Ohren
    ctx.fillStyle = Portrait.shade(f.skin, -0.06);
    ctx.beginPath(); ctx.ellipse(-29, 4, 5, 8, 0, 0, Math.PI * 2); ctx.ellipse(29, 4, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Kopf
    ctx.fillStyle = f.skin;
    ctx.beginPath(); ctx.ellipse(0, 0, 28, 34, 0, 0, Math.PI * 2); ctx.fill();
    // Wangenschatten
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath(); ctx.ellipse(16, 10, 9, 14, 0, 0, Math.PI * 2); ctx.fill();
    if (f.lines) { ctx.strokeStyle = 'rgba(80,40,20,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, 16); ctx.quadraticCurveTo(-14, 22, -10, 26); ctx.moveTo(12, 16); ctx.quadraticCurveTo(14, 22, 10, 26); ctx.moveTo(-8, -20); ctx.lineTo(8, -20); ctx.stroke(); }
    // Bart
    if (f.beard) { ctx.fillStyle = f.beard; ctx.beginPath(); ctx.moveTo(-26, 6); ctx.quadraticCurveTo(-24, 40, 0, 42); ctx.quadraticCurveTo(24, 40, 26, 6); ctx.quadraticCurveTo(14, 26, 0, 24); ctx.quadraticCurveTo(-14, 26, -26, 6); ctx.fill(); }
    // Augen (blinzeln alle paar Sekunden)
    const blink = (t % 3.7) < 0.12 ? 0.1 : 1;
    const eo = Math.max(0.1, M.eye * blink);
    for (const sx of [-11, 11]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx, -2, 6, 4.2 * eo, 0, 0, Math.PI * 2); ctx.fill();
      if (eo > 0.2) { ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.arc(sx + (M.side ? 1.5 : 0), -2, 2.6 * Math.min(1, eo + 0.2), 0, Math.PI * 2); ctx.fill(); }
    }
    // Brauen
    ctx.strokeStyle = f.hair ? Portrait.shade(f.hair, -0.25) : Portrait.shade(f.skin, -0.45); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) {
      const y = -10 + M.browY;
      ctx.beginPath(); ctx.moveTo(sd * 5, y + M.brow * 4 * 1); ctx.lineTo(sd * 17, y - M.brow * 4 + (M.side && sd > 0 ? -2 : 0)); ctx.stroke();
    }
    // Nase
    ctx.strokeStyle = 'rgba(90,50,30,0.45)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.quadraticCurveTo(4, 9, 0, 12); ctx.stroke();
    // Mund: Stimmung + Sprechen
    const my = 20, open = talk * (M.o ? 1.4 : 1);
    ctx.fillStyle = '#5a1f1f'; ctx.strokeStyle = '#7a3030'; ctx.lineWidth = 2;
    if (open > 0.08 || M.o) {
      ctx.beginPath(); ctx.ellipse(0, my + M.smile * -1.5, 7 - (M.o ? 2 : 0), 1.5 + 5 * Math.max(open, M.o ? 0.6 : 0), 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-9, my - M.smile * 1); ctx.quadraticCurveTo(0, my + M.smile * 6, 9, my - M.smile * 1 - (M.side ? 2 : 0)); ctx.stroke();
    }
    // Brille
    if (f.glasses) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-11, -2, 8, 0, Math.PI * 2); ctx.moveTo(19, -2); ctx.arc(11, -2, 8, 0, Math.PI * 2); ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.stroke(); }
    // Haar vorn
    if (f.hair) {
      ctx.fillStyle = f.hair;
      ctx.beginPath();
      if (f.style === 'short' || f.style === 'grey') { ctx.ellipse(0, -22, 29, 15, 0, Math.PI, 0); ctx.quadraticCurveTo(14, -24, -2, -20); ctx.quadraticCurveTo(-18, -16, -29, -16); }
      else if (f.style === 'slick') { ctx.ellipse(0, -21, 29, 16, 0, Math.PI, 0); ctx.quadraticCurveTo(10, -30, -29, -18); }
      else if (f.style === 'curls') { for (let i = 0; i < 7; i++) { const x = -24 + i * 8; ctx.moveTo(x + 8, -26); ctx.arc(x, -26 - (i % 2) * 3, 8, 0, Math.PI * 2); } }
      else if (f.style === 'bob') { ctx.ellipse(0, -20, 30, 16, 0, Math.PI, 0); ctx.lineTo(30, 22); ctx.lineTo(24, 22); ctx.quadraticCurveTo(22, -10, 4, -14); ctx.quadraticCurveTo(-18, -8, -24, 22); ctx.lineTo(-30, 22); }
      else if (f.style === 'perm') { for (let i = 0; i < 8; i++) { const x = -28 + i * 8; ctx.moveTo(x + 7, -24); ctx.arc(x, -24 - (i % 2) * 2, 7, 0, Math.PI * 2); } }
      else if (f.style === 'bun') { ctx.ellipse(0, -21, 29, 15, 0, Math.PI, 0); ctx.quadraticCurveTo(0, -26, -29, -18); }
      ctx.fill();
    }
    // Kappe
    if (f.cap) {
      ctx.fillStyle = f.cap;
      ctx.beginPath(); ctx.ellipse(0, -24, 30, 16, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = Portrait.shade(f.cap, -0.25); ctx.beginPath(); ctx.ellipse(-4, -24, 34, 5, -0.05, 0, Math.PI); ctx.fill();
    }
    ctx.restore();
  },
  shade(hex, k) {
    const c = new THREE.Color(hex);
    if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new THREE.Color('#fff'), k);
    return '#' + c.getHexString();
  },
};

// ---------------------------------------------------------------------------------------------------------------
// DOM-Gerüst
// ---------------------------------------------------------------------------------------------------------------
const StoryDOM = (() => {
  let root = null;
  const el = (tag, id, cls, parent, html) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; (parent || root).appendChild(e); return e; };
  return {
    get root() {
      if (root) return root;
      root = document.createElement('div'); root.id = 'story-root'; document.body.appendChild(root);
      el('div', 'st-bar-top', 'st-bar');
      el('div', 'st-bar-bot', 'st-bar');
      const d = el('div', 'st-dlg', 'hidden');
      d.innerHTML = '<canvas id="st-portrait" width="160" height="160"></canvas><div class="st-dlg-body"><div id="st-name"></div><div id="st-text"></div><div id="st-choices" class="hidden"></div><div id="st-hint"><span id="st-auto"></span><kbd>Leertaste</kbd> weiter · <kbd>Esc</kbd> überspringen</div></div>';
      el('div', 'st-sub', 'hidden');
      el('div', 'st-obj', 'hidden');
      el('div', 'st-hudbox', '', null, '<div id="st-timer" class="hidden"></div><div id="st-meter" class="hidden"><span></span><div class="st-mbar"><div></div></div></div>');
      const ph = el('div', 'st-phone', 'hidden');
      ph.innerHTML = '<div class="st-ph-top"><span id="st-ph-kind"></span><span id="st-ph-time"></span></div><div class="st-ph-who"><canvas id="st-ph-pic" width="72" height="72"></canvas><div><b id="st-ph-name"></b><span id="st-ph-sub"></span></div></div><div id="st-ph-msg"></div>';
      el('div', 'st-card', 'hidden');
      el('div', 'st-result', 'hidden');
      el('div', 'st-doc', 'hidden');
      el('div', 'st-rels');
      el('div', 'st-journal', 'hidden');
      el('div', 'st-flash', 'hidden');
      el('div', 'st-black', 'hidden');
      return root;
    },
    $(id) { this.root; return document.getElementById(id); },
  };
})();

// ---------------------------------------------------------------------------------------------------------------
// Dialoge
// ---------------------------------------------------------------------------------------------------------------
// Ein Dialog ist eine Liste von Zeilen:
//   { who: 'max', text: '…', mood: 'happy', cam: 'wide'|'close'|'ots' }  Zeile
//   { choice: [{ text, mood, then: [Zeilen], act: fn }] }                 Antwortwahl (Leon)
//   { act: fn }                                                           Wirkung ohne Text (z. B. Geld)
//   { if: fn, then: [Zeilen], else: [Zeilen] }                            Verzweigung
// Text darf {name}-Platzhalter nicht enthalten; Hervorhebung mit *Stern*.
class DialogueManager {
  constructor() {
    this.busy = null;    // laufende Szene
    this.subs = [];      // Untertitel-Warteschlange
    this.subCur = null;
    this.t = 0;
    this.onLine = null;  // Rückruf je Zeile (Kamera, Gesten): f(line)
    addEventListener('keydown', e => this.key(e), true);
    StoryDOM.$('st-dlg').addEventListener('click', e => { if (!e.target.closest('#st-choices')) this.advance(); });
  }

  get settings() {
    const g = typeof Settings !== 'undefined' ? Settings.get('general') : {};
    return { auto: !!g.dlgAuto, speed: g.dlgSpeed || 1, subs: g.subtitles !== false };
  }

  // Szene: blockiert das Spiel (Kinobalken, Porträt); Promise löst nach der letzten Zeile auf
  scene(lines, opt = {}) {
    if (this.busy) this.finish(true);
    return new Promise(resolve => {
      this.busy = { queue: this.flatten(lines), cur: null, shown: 0, wait: 0, done: resolve, opt, skip: false };
      StoryDOM.$('st-dlg').classList.remove('hidden');
      this.next();
    });
  }

  // Zeilen mit Bedingungen und Wirkungen auflösen, sobald sie dran sind (Wahl und Zustand können sich ändern)
  flatten(lines) { return lines.slice(); }

  next() {
    const B = this.busy;
    if (!B) return;
    while (B.queue.length) {
      const L = B.queue.shift();
      if (L.act && !L.text && !L.choice) { try { L.act(); } catch (e) { console.warn(e); } continue; }
      if (L.if) { const ok = !!L.if(); B.queue.unshift(...((ok ? L.then : L.else) || [])); continue; }
      if (L.choice) {
        B.skip = false;   // Überspringen hält an Entscheidungen an: der Spieler wählt selbst
        this.showChoice(L.choice); return;
      }
      if (B.skip && !L.keep) continue;
      B.cur = L; B.shown = 0; B.wait = 0; B.full = this.clean(L.text);
      const C = STORY_CAST[L.who] || { name: L.who || '', color: '#fff' };
      const n = StoryDOM.$('st-name'); n.textContent = L.name || C.name; n.style.color = C.color;
      StoryDOM.$('st-text').innerHTML = '';
      StoryDOM.$('st-choices').classList.add('hidden');
      StoryDOM.$('st-portrait').style.visibility = L.who && STORY_CAST[L.who] ? 'visible' : 'hidden';
      if (this.onLine) try { this.onLine(L); } catch (e) { console.warn(e); }
      if (L.fx) try { L.fx(); } catch (e) { console.warn(e); }
      return;
    }
    this.finish(false);
  }

  clean(t) { return String(t || ''); }

  showChoice(list) {
    const B = this.busy;
    B.cur = { who: 'leon', text: '', choosing: true };
    StoryDOM.$('st-name').textContent = 'Leon'; StoryDOM.$('st-name').style.color = STORY_CAST.leon.color;
    StoryDOM.$('st-text').innerHTML = '<i class="st-think">Was sagst du?</i>';
    StoryDOM.$('st-portrait').style.visibility = 'visible';
    if (this.onLine) try { this.onLine({ who: 'leon', text: '', mood: 'neutral', choosing: true }); } catch (e) { console.warn(e); }
    const box = StoryDOM.$('st-choices');
    box.innerHTML = '';
    B.choices = list.filter(c => !c.if || c.if());
    B.sel = 0;
    B.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'st-choice' + (c.disabled ? ' off' : '');
      b.innerHTML = `<span>${i + 1}</span>${c.text}${c.note ? `<em>${c.note}</em>` : ''}`;
      b.onclick = ev => { ev.stopPropagation(); if (!c.disabled) this.pick(c); };
      b.onmouseenter = () => { B.sel = i; this.markSel(); };
      box.appendChild(b);
    });
    box.classList.remove('hidden');
    this.markSel();
    document.exitPointerLock?.();
  }

  markSel() { const B = this.busy; StoryDOM.$('st-choices').querySelectorAll('.st-choice').forEach((b, i) => b.classList.toggle('sel', i === B.sel)); }

  pick(c, silent) {
    const B = this.busy;
    if (!B) return;
    StoryDOM.$('st-choices').classList.add('hidden');
    if (c.act) try { c.act(); } catch (e) { console.warn(e); }
    const say = c.say === false ? [] : [{ who: 'leon', text: c.say || c.text, mood: c.mood || 'neutral' }];
    B.queue.unshift(...(silent ? [] : say), ...(c.then || []));
    this.next();
  }

  advance() {
    const B = this.busy;
    if (!B || !B.cur || B.cur.choosing) return;
    if (B.shown < B.full.length) { B.shown = B.full.length; this.render(); return; }
    this.next();
  }

  finish(cancel) {
    const B = this.busy;
    if (!B) return;
    this.busy = null;
    StoryDOM.$('st-dlg').classList.add('hidden');
    StoryDOM.$('st-choices').classList.add('hidden');
    B.done(!cancel);
  }

  // Esc: Gespräch bis zur nächsten Entscheidung bzw. bis zum Ende überspringen
  skip() {
    const B = this.busy;
    if (!B || (B.cur && B.cur.choosing)) return;
    B.skip = true;
    this.next();
  }

  key(e) {
    const B = this.busy;
    if (!B || (this.blocked && this.blocked())) return;
    if (B.cur && B.cur.choosing) {
      const n = B.choices.length;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { B.sel = (B.sel + 1) % n; this.markSel(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { B.sel = (B.sel + n - 1) % n; this.markSel(); }
      else if (e.code === 'Enter' || e.code === 'Space') { const c = B.choices[B.sel]; if (c && !c.disabled) this.pick(c); }
      else if (/^Digit[1-9]$/.test(e.code)) { const c = B.choices[+e.code.slice(5) - 1]; if (c && !c.disabled) this.pick(c); }
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { this.advance(); e.preventDefault(); e.stopImmediatePropagation(); }
    else if (e.code === 'Escape' || e.code === 'Backspace') { this.skip(); e.preventDefault(); e.stopImmediatePropagation(); }
  }

  // Untertitel während des Spielens (nicht blockierend): who, text; Dauer nach Textlänge
  sub(lines) {
    for (const L of Array.isArray(lines) ? lines : [lines]) this.subs.push(L);
    return new Promise(r => this.subs.push({ resolve: r }));
  }
  clearSubs() { for (const s of this.subs) if (s.resolve) s.resolve(); this.subs = []; this.subCur = null; StoryDOM.$('st-sub').classList.add('hidden'); }

  // Takt: Schreibmaschine, automatisches Weiterblättern, Untertitel
  update(dt) {
    this.t += dt;
    const B = this.busy, S = this.settings;
    if (B && B.cur && !B.cur.choosing) {
      if (B.shown < B.full.length) { B.shown = Math.min(B.full.length, B.shown + dt * 46 * S.speed); this.render(); }
      else if (S.auto || B.opt.auto) { B.wait += dt; if (B.wait > 1.1 + B.full.length * 0.045 / S.speed) this.next(); }
    }
    if (B) {
      const cv = StoryDOM.$('st-portrait'), who = B.cur ? B.cur.who : 'leon';
      const talking = B.cur && !B.cur.choosing && B.shown < B.full.length;
      if (who && STORY_CAST[who]) Portrait.draw(cv.getContext('2d'), who, B.cur.mood || 'neutral', this.t, talking ? 0.35 + 0.35 * Math.abs(Math.sin(this.t * 17)) : 0);
      StoryDOM.$('st-auto').textContent = S.auto ? 'AUTO · ' : '';
    }
    // Untertitel
    if (!this.subCur && this.subs.length) {
      const L = this.subs.shift();
      if (L.resolve) { L.resolve(); }
      else {
        this.subCur = { L, t: 0, dur: L.dur || Math.max(2.2, 1.2 + String(L.text).length * 0.055 / S.speed) };
        const C = STORY_CAST[L.who] || { name: L.who || '', color: '#fff' };
        const el = StoryDOM.$('st-sub');
        el.innerHTML = (L.who ? `<b style="color:${C.color}">${L.name || C.name}:</b> ` : '') + this.fmt(L.text);
        el.classList.toggle('hidden', !S.subs && !L.force);
        if (L.fx) try { L.fx(); } catch (e) { console.warn(e); }
      }
    }
    if (this.subCur) {
      this.subCur.t += dt;
      if (this.subCur.t > this.subCur.dur) { this.subCur = null; StoryDOM.$('st-sub').classList.add('hidden'); }
    }
  }

  fmt(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*([^*]+)\*/g, '<b>$1</b>'); }

  render() {
    const B = this.busy;
    const vis = B.full.slice(0, Math.floor(B.shown));
    StoryDOM.$('st-text').innerHTML = this.fmt(vis.replace(/\*/g, '')) + (B.shown < B.full.length ? '<span class="st-caret">▌</span>' : '');
    if (B.shown >= B.full.length) StoryDOM.$('st-text').innerHTML = this.fmt(B.full);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// HUD der Geschichte
// ---------------------------------------------------------------------------------------------------------------
class StoryHUD {
  constructor() {
    StoryDOM.root;
    this.phoneT = 0; this.cardT = 0; this.flashT = 0;
    this.phoneQueue = [];
    this.result = null;
  }

  cine(on) {
    document.body.classList.toggle('st-cine', !!on);
  }

  objective(html) {
    const el = StoryDOM.$('st-obj');
    if (!html) { el.classList.add('hidden'); el.dataset.t = ''; return; }
    if (el.dataset.t !== html) { el.dataset.t = html; el.innerHTML = html; el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
  }

  timer(secs) {
    const el = StoryDOM.$('st-timer');
    if (secs === null || secs === undefined) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const s = Math.max(0, Math.ceil(secs));
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('low', secs < 20);
  }

  meter(label, f) {
    const el = StoryDOM.$('st-meter');
    if (label === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.querySelector('span').textContent = label;
    const b = el.querySelector('.st-mbar div');
    b.style.width = Math.round(U.clamp(f, 0, 1) * 100) + '%';
    b.style.background = f > 0.6 ? '#7ee36f' : f > 0.3 ? '#f2c230' : '#e2463f';
  }

  // Handy: SMS oder Anruf (von, Text bzw. Zeilen)
  phone(kind, who, text, secs = 6) {
    const C = STORY_CAST[who] || { name: who, color: '#fff' };
    StoryDOM.$('st-ph-kind').textContent = kind === 'call' ? '📞 Anruf' : '✉ Nachricht';
    StoryDOM.$('st-ph-time').textContent = this.clock || '';
    StoryDOM.$('st-ph-name').textContent = C.full || C.name;
    StoryDOM.$('st-ph-sub').textContent = kind === 'call' ? 'verbunden' : 'jetzt';
    StoryDOM.$('st-ph-msg').innerHTML = text ? String(text).replace(/</g, '&lt;') : '';
    StoryDOM.$('st-ph-msg').classList.toggle('hidden', !text);
    if (STORY_CAST[who]) Portrait.draw(StoryDOM.$('st-ph-pic').getContext('2d'), who, 'neutral', 1, 0);
    const el = StoryDOM.$('st-phone');
    el.classList.remove('hidden'); el.classList.toggle('call', kind === 'call');
    this.phoneT = secs; this.phoneWho = who;
  }

  // Titelkarte (Kapitel, Missionsname)
  card(top, main, sub, secs = 4.2) {
    const el = StoryDOM.$('st-card');
    el.innerHTML = `${top ? `<div class="st-card-top">${top}</div>` : ''}<div class="st-card-main">${main}</div>${sub ? `<div class="st-card-sub">${sub}</div>` : ''}`;
    el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.cardT = secs;
  }

  // Erfolg / Gescheitert. buttons: [{ label, key, act }]
  showResult(kind, title, lines, buttons) {
    const el = StoryDOM.$('st-result');
    el.className = 'st-' + kind;
    el.innerHTML = `<div class="st-res-main">${title}</div>${(lines || []).map(l => `<div class="st-res-line">${l}</div>`).join('')}` +
      (buttons && buttons.length ? `<div class="st-res-btns">${buttons.map((b, i) => `<button data-i="${i}">${b.key ? `<kbd>${b.key}</kbd> ` : ''}${b.label}</button>`).join('')}</div>` : '');
    el.classList.remove('hidden');
    this.result = { buttons: buttons || [] };
    el.querySelectorAll('button').forEach(b => { b.onclick = () => this.resultPick(+b.dataset.i); });
    if (buttons && buttons.length) document.exitPointerLock?.();
  }
  resultPick(i) {
    const R = this.result; if (!R) return;
    const b = R.buttons[i];
    this.hideResult();
    if (b && b.act) b.act();
  }
  hideResult() { StoryDOM.$('st-result').classList.add('hidden'); this.result = null; }

  // Dokument (Brief, Gutachten …) zum Lesen; Promise nach dem Schließen
  doc(title, html) {
    return new Promise(res => {
      const el = StoryDOM.$('st-doc');
      el.innerHTML = `<div class="st-paper"><div class="st-paper-title">${title}</div><div class="st-paper-body">${html}</div><div class="st-paper-hint"><kbd>Leertaste</kbd> weiter</div></div>`;
      el.classList.remove('hidden');
      const close = e => {
        if (e && e.type === 'keydown' && !/^(Space|Enter|Escape|KeyE)$/.test(e.code)) return;
        if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
        removeEventListener('keydown', close, true); el.onclick = null;
        el.classList.add('hidden'); res();
      };
      setTimeout(() => { addEventListener('keydown', close, true); el.onclick = () => close(); }, 400);
    });
  }

  // kleiner Hinweis links: „Max ♥ +10“
  rel(who, d) {
    const C = STORY_CAST[who] || { name: who, color: '#fff' };
    const box = StoryDOM.$('st-rels');
    const e = document.createElement('div');
    e.className = 'st-rel ' + (d >= 0 ? 'up' : 'down');
    e.innerHTML = `<b style="color:${C.color}">${C.name}</b> ${d >= 0 ? '▲' : '▼'} ${d >= 0 ? '+' : ''}${d}`;
    box.appendChild(e);
    setTimeout(() => e.classList.add('out'), 2600);
    setTimeout(() => e.remove(), 3300);
  }

  flash(text, secs = 2.2) {
    const el = StoryDOM.$('st-flash');
    el.innerHTML = text; el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.flashT = secs;
  }

  update(dt) {
    if (this.phoneT > 0 && (this.phoneT -= dt) <= 0) StoryDOM.$('st-phone').classList.add('hidden');
    if (this.cardT > 0 && (this.cardT -= dt) <= 0) StoryDOM.$('st-card').classList.add('hidden');
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) StoryDOM.$('st-flash').classList.add('hidden');
  }

  hideAll() {
    for (const id of ['st-dlg', 'st-sub', 'st-obj', 'st-phone', 'st-card', 'st-result', 'st-doc', 'st-journal', 'st-flash']) StoryDOM.$(id).classList.add('hidden');
    this.timer(null); this.meter(null);
    this.cine(false);
    this.result = null;
  }
}

window.STORY_CAST = STORY_CAST; window.Portrait = Portrait; window.DialogueManager = DialogueManager; window.StoryHUD = StoryHUD; window.StoryDOM = StoryDOM;
