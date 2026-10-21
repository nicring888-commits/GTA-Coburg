// Touch-Steuerung (iPad/Tablet): virtueller Joystick, Kamera per Wischen, Pinch-Zoom und Aktionsknöpfe.
// Schreibt in game.keys / game.pressed, damit die Spiellogik unverändert bleibt.
'use strict';

(() => {
  const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch()) return;

  const $ = id => document.getElementById(id);
  document.body.classList.add('touch');

  // Texte für Touch statt Tastatur
  const startHint = document.querySelector('#start .hint');
  if (startHint) startHint.innerHTML = 'Links Joystick zum Laufen/Fahren, rechts wischen = umsehen, zwei Finger = Zoom. Knöpfe unten rechts.';
  const sub = document.querySelector('#start .controls');
  if (sub) sub.classList.add('hidden');
  const helpHint = $('help-hint'); if (helpHint) helpHint.innerHTML = '';

  const root = document.createElement('div');
  root.id = 'touch';
  root.classList.add('hidden');
  root.innerHTML = `
    <div id="t-stick"><div id="t-knob"></div></div>
    <div id="t-btns">
      <button data-key="KeyE" class="big" id="t-e">E<small>Ein/Aus</small></button>
      <button data-key="KeyF" class="big" id="t-f">F<small>Aktion</small></button>
      <button data-key="Space" hold id="t-jump">⤒<small>Sprung</small></button>
      <button data-key="ShiftLeft" hold class="walk" id="t-run">»<small>Rennen</small></button>
      <button data-key="Space" hold class="drive" id="t-brake">■<small>Bremse</small></button>
      <button data-key="KeyH" hold class="drive" id="t-horn">♪<small>Hupe</small></button>
      <button data-key="KeyC" class="drive" id="t-cam">◎<small>Kamera</small></button>
      <button data-key="KeyR" class="drive" id="t-flip">⟳<small>Aufricht.</small></button>
    </div>
    <div id="t-top">
      <button data-key="KeyM">🗺</button>
      <button data-key="KeyN">☾</button>
      <button id="t-help">?</button>
    </div>`;
  document.body.appendChild(root);

  const G = () => window.game;
  const press = (code, down) => {
    const g = G(); if (!g) return;
    if (down) { if (!g.keys[code]) g.pressed[code] = true; g.keys[code] = true; } else g.keys[code] = false;
  };

  // ---------- Knöpfe ----------
  const held = new Map(); // pointerId -> code
  root.querySelectorAll('#t-btns button, #t-top button[data-key]').forEach(b => {
    const code = b.dataset.key;
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId);
      b.classList.add('on'); held.set(e.pointerId, code); press(code, true);
    });
    const up = e => { if (!held.has(e.pointerId)) return; b.classList.remove('on'); held.delete(e.pointerId); press(code, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
  $('t-help').addEventListener('pointerdown', e => { e.preventDefault(); press('F1', true); setTimeout(() => press('F1', false), 50); });

  // Hilfe schließt per Tippen auf "Weiter" (vorhandener Button)

  // ---------- Joystick ----------
  const stick = $('t-stick'), knob = $('t-knob');
  let stickId = null, sc = null;
  const R = 60, DEAD = 0.28;
  const setDir = (x, y) => { // x: rechts+, y: unten+
    press('KeyW', y < -DEAD); press('KeyS', y > DEAD);
    press('KeyA', x < -DEAD); press('KeyD', x > DEAD);
    press('ShiftLeft', G() && G().mode !== 'drive' && Math.hypot(x, y) > 0.9 || runBtn);
  };
  let runBtn = false;
  $('t-run').addEventListener('pointerdown', () => { runBtn = true; });
  $('t-run').addEventListener('pointerup', () => { runBtn = false; });
  $('t-run').addEventListener('pointercancel', () => { runBtn = false; });
  const moveStick = e => {
    let dx = e.clientX - sc.x, dy = e.clientY - sc.y;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    setDir(dx / R, dy / R);
  };
  stick.addEventListener('pointerdown', e => {
    if (stickId !== null) return;
    e.preventDefault(); stick.setPointerCapture(e.pointerId);
    stickId = e.pointerId;
    const r = stick.getBoundingClientRect();
    sc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    moveStick(e);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
  const stickEnd = e => {
    if (e.pointerId !== stickId) return;
    stickId = null; knob.style.transform = '';
    setDir(0, 0);
  };
  stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);

  // ---------- Kamera: wischen + Pinch-Zoom auf dem Spielfeld ----------
  const look = new Map(); // pointerId -> letzte Position
  let pinch = null;
  const canvasArea = document.getElementById('app');
  canvasArea.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (look.size === 2) { const [a, b] = [...look.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvasArea.addEventListener('pointermove', e => {
    const p = look.get(e.pointerId); if (!p) return;
    const g = G(); if (!g) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (look.size >= 2) {
      const [a, b] = [...look.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) g.cam.dist = Math.min(40, Math.max(2.2, g.cam.dist * pinch / d));
      pinch = d;
    } else {
      g.cam.yaw -= dx * 0.0055;
      g.cam.pitch = Math.min(1.25, Math.max(-0.35, g.cam.pitch + dy * 0.004));
      g.cam.lastMouse = performance.now() / 1000;
    }
  });
  const lookEnd = e => { look.delete(e.pointerId); pinch = null; };
  canvasArea.addEventListener('pointerup', lookEnd); canvasArea.addEventListener('pointercancel', lookEnd);
  // Scrollen/Zoomen der Seite verhindern
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  // ---------- Sichtbarkeit / Modus ----------
  $('start-btn').addEventListener('click', () => {
    root.classList.remove('hidden');
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });
  const tick = () => {
    requestAnimationFrame(tick);
    const g = G(); if (!g) return;
    const drive = g.mode === 'drive';
    root.classList.toggle('driving', drive);
    // Karte offen oder Hilfe: Steuerung ausblenden
    const overlay = !$('map-overlay').classList.contains('hidden') || !$('help').classList.contains('hidden');
    root.classList.toggle('suspended', overlay);
  };
  tick();
})();
