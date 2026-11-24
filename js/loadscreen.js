// Ladebildschirm (seit v3.21.0): wechselnde Szenen aus Coburg mit langsamer Kamerabewegung (Standbilder aus der
// Spielwelt, assets/menu/), Logo, Ladefortschritt und wechselnde Spieltipps. Läuft vor allen anderen Skripten, damit
// er schon beim Laden von three.js und den Kartendaten steht.
// Fortschritt: js/boot.js meldet echte Werte (Dateien, MB, Weltaufbau); solange es keinen echten Wert gibt (three.js
// wird geladen, Kacheln werden gebaut ohne Zählung), läuft eine unbestimmte Ladeanimation statt erfundener Prozente.
'use strict';

(function () {
  const $ = id => document.getElementById(id);
  // Szenen: Standbilder aus dem Spiel (bench/menu-shots.js), Ort und Unterzeile
  const SCENES = [
    { img: 'assets/menu/ls-markt.jpg', place: 'Marktplatz', sub: 'Rathaus und Stadthaus' },
    { img: 'assets/menu/ls-veste.jpg', place: 'Veste Coburg', sub: 'Die Krone Frankens' },
    { img: 'assets/menu/ls-ehrenburg.jpg', place: 'Schloss Ehrenburg', sub: 'Schlossplatz' },
    { img: 'assets/menu/ls-bahnhof.jpg', place: 'Bahnhof Coburg', sub: 'Lossaustraße' },
    { img: 'assets/menu/ls-altstadt.jpg', place: 'Altstadt', sub: 'Dächer zwischen Morizkirche und Festungsberg' },
    { img: 'assets/menu/ls-theater.jpg', place: 'Landestheater', sub: 'Schlossplatz im Regen' },
    { img: 'assets/menu/ls-abend.jpg', place: 'Marktplatz', sub: 'Abend in der Altstadt' },
  ];
  const TIPS = [
    'Bleib außer Sicht der Polizei, bis die Sterne aufhören zu blinken – dann ist die Fahndung vorbei.',
    'Eine grüne Lackiererei repariert dein Auto und lässt die Fahndung verschwinden – solange dich niemand sieht.',
    'Geklaute Autos bringen beim orangen Autohändler Geld. Streifenwagen nimmt dort niemand.',
    'Mit M öffnest du den Stadtplan. Ein Klick auf die Karte bringt dich per Schnellreise dorthin.',
    'Blaue Säulen starten Straßenrennen – 14 Strecken von der Altstadt bis nach Bad Rodach und Seßlach.',
    'Am Bahnhof, am Klinikum und auf der Brandensteinsebene stehen Hubschrauber bereit.',
    'In einer eigenen Wohnung kannst du schlafen: Leben voll, Tag und Nacht wechseln, Spiel gespeichert.',
    'Die Schutzweste aus dem roten Waffenladen fängt Treffer ab, bevor dein Leben sinkt.',
    'Rechte Maustaste zielt über die Schulter, V schaltet beim Zielen auf Kimme und Korn.',
    'Online fahren bis zu 16 Spieler in derselben Stadt. Mit E steigst du bei Mitspielern ein.',
    'Die Veste liegt wirklich oben auf dem Festungsberg: Das Gelände stammt aus echten Höhendaten.',
    'Mit der Leertaste ziehst du im Auto die Handbremse – so kommst du driftend um enge Altstadtecken.',
    'Deine eigenen Autos holst du mit G aus der Garage an den nächsten Straßenrand.',
    'Ab drei Sternen baut die Polizei Straßensperren vor dir auf.',
    'Im Pausenmenü (P) kannst du jederzeit speichern, Einstellungen ändern oder ins Hauptmenü zurückkehren.',
  ];
  const SCENE_T = 8.5, FADE_T = 1.8, TIP_T = 7.5;

  const root = $('loading');
  if (!root) return;
  let tipsOn = true;
  try { const s = JSON.parse(localStorage.getItem('gta-coburg-settings') || 'null'); if (s && s.general && s.general.tips === false) tipsOn = false; } catch (e) { /* Standard */ }

  const stage = root.querySelector('.ls-stage');
  const els = [];
  let order = SCENES.map((s, i) => i).sort(() => Math.random() - 0.5);
  let cur = -1, sceneT = 0, tipT = 0, tipI = Math.floor(Math.random() * TIPS.length);
  const pans = ['pan-a', 'pan-b', 'pan-c', 'pan-d'];
  // Bild vorladen; fehlt es, wird die Szene übersprungen (der Bildschirm zeigt dann den Himmelsverlauf)
  const ok = new Set();
  SCENES.forEach((s, i) => {
    const im = new Image();
    im.onload = () => { ok.add(i); if (cur < 0 && running) next(); };
    im.src = s.img;
  });
  function next() {
    const avail = order.filter(i => ok.has(i));
    if (!avail.length) return;
    const pos = avail.indexOf(order[cur]);
    const i = avail[(pos + 1) % avail.length];
    const prev = els.find(e => e.classList.contains('on'));
    const el = document.createElement('div');
    el.className = 'ls-scene ' + pans[Math.floor(Math.random() * pans.length)];
    el.style.backgroundImage = `url("${SCENES[i].img}")`;
    el.style.animationDuration = (SCENE_T + FADE_T * 2) + 's';
    stage.appendChild(el);
    els.push(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    if (prev) { prev.classList.remove('on'); setTimeout(() => { prev.remove(); els.splice(els.indexOf(prev), 1); }, FADE_T * 1000 + 100); }
    cur = order.indexOf(i);
    const cap = $('ls-place');
    cap.classList.remove('in');
    setTimeout(() => {
      $('ls-place-name').textContent = SCENES[i].place;
      $('ls-place-sub').textContent = SCENES[i].sub;
      cap.classList.add('in');
    }, 450);
    sceneT = 0;
  }
  function nextTip() {
    const t = $('ls-tip');
    if (!tipsOn) { t.parentElement.classList.add('hidden'); return; }
    t.classList.remove('in');
    setTimeout(() => { tipI = (tipI + 1) % TIPS.length; t.textContent = TIPS[tipI]; t.classList.add('in'); }, 400);
    tipT = 0;
  }

  // ---------- Fortschritt ----------
  let target = null, shown = 0, running = true, last = performance.now();
  const bar = $('load-bar'), pct = $('ls-pct'), track = root.querySelector('.ls-track');
  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    sceneT += dt; tipT += dt;
    if (sceneT > SCENE_T && ok.size > 1) next();
    if (tipT > TIP_T) nextTip();
    const indet = target === null || root.classList.contains('error');
    track.classList.toggle('indet', indet && !root.classList.contains('error'));
    if (!indet) {
      // gleitend nachführen, nie rückwärts
      shown += (Math.max(shown, target) - shown) * (1 - Math.exp(-dt * 6));
      bar.style.width = (shown * 100).toFixed(2) + '%';
      pct.textContent = Math.floor(shown * 100) + ' %';
    } else pct.textContent = '';
  }

  window.LoadScreen = {
    // text: Ladeschritt; f: echter Anteil 0…1 oder null (unbestimmt)
    set(text, f) {
      if (text != null) $('load-text').textContent = text;
      if (f === null || f === undefined) target = null;
      else target = Math.max(0, Math.min(1, f));
    },
    // erneut zeigen (z. B. beim Betreten der Spielwelt aus dem Menü); title: Überschrift
    show(title) {
      root.classList.remove('hidden', 'out', 'error');
      $('load-actions').classList.add('hidden');
      $('load-detail').textContent = '';
      $('ls-title').textContent = title || '';
      target = null; shown = 0; bar.style.width = '0%';
      if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
      next();   // jedes Mal eine neue Szene
    },
    // sanft ausblenden; cb nach dem Ausblenden
    hide(cb, ms = 1100) {
      root.style.setProperty('--ls-out', ms + 'ms');
      root.classList.add('out');
      setTimeout(() => { root.classList.add('hidden'); root.classList.remove('out'); running = false; if (cb) cb(); }, ms);
    },
    get visible() { return !root.classList.contains('hidden'); },
    tips: TIPS,
  };
  $('ls-tip').textContent = TIPS[tipI];
  if (!tipsOn) $('ls-tip').parentElement.classList.add('hidden');
  requestAnimationFrame(() => $('ls-tip').classList.add('in'));
  requestAnimationFrame(tick);
})();
