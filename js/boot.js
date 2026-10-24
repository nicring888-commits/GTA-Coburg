// Startlader: wählt die Grafikstufe, lädt three.js, Kartendaten und Spielskripte mit Fortschritt, erkennt hängendes
// Laden (Zeitlimit), Ladefehler und Abstürze beim Aufbau (iPhone: Safari lädt die Seite nach zu viel Speicher neu)
// und zeigt dann eine verständliche Meldung mit „Neu laden“ und „Leichte Grafik“.
'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const LEVELS = ['voll', 'mobil', 'leicht'];
  const QKEY = 'gta-coburg-grafik', BOOTKEY = 'gta-coburg-start';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher weiter */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ohne Speicher weiter */ } },
  };

  // ---------- Gerät und Grafikstufe ----------
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const phone = ios || /Android|Mobile/.test(ua) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
  const param = new URLSearchParams(location.search).get('grafik');
  let level = LEVELS.includes(param) ? param : LEVELS.includes(store.get(QKEY)) ? store.get(QKEY) : (phone ? 'mobil' : 'voll');
  if (LEVELS.includes(param)) store.set(QKEY, param);

  // Ist der letzte Start beim Aufbau abgebrochen (Tab abgestürzt und neu geladen), eine Stufe leichter starten
  let crashNote = '';
  try {
    const last = JSON.parse(store.get(BOOTKEY) || 'null');
    if (last && last.stage === 'aufbau' && Date.now() - last.t < 10 * 60 * 1000 && !LEVELS.includes(param)) {
      const i = LEVELS.indexOf(last.level);
      if (i >= 0 && i < LEVELS.length - 1 && LEVELS.indexOf(level) <= i) {
        level = LEVELS[i + 1];
        store.set(QKEY, level);
        crashNote = `Der letzte Start ist abgebrochen (vermutlich zu wenig Speicher). Grafik jetzt: ${level}.`;
      }
    }
  } catch (e) { /* kaputter Eintrag: ignorieren */ }

  // Was die Stufen ändern (gelesen von game.js, region.js, atmosphere.js und world.js)
  const Q = {
    voll: { level: 'voll', pixelRatio: 1.5, antialias: true, shadow: 0, lod2: true, hd: true, ensure: 1400, fogFar: 0, region: null },
    mobil: { level: 'mobil', pixelRatio: 1.25, antialias: false, shadow: 1024, lod2: true, hd: false, ensure: 900, fogFar: 1500,
      region: { load: 1200, drop: 1700, trees: 700, treesDrop: 1000, life: 500, lifeDrop: 750 } },
    leicht: { level: 'leicht', pixelRatio: 1, antialias: false, shadow: 1024, lod2: false, hd: false, ensure: 600, fogFar: 1000,
      region: { load: 800, drop: 1200, trees: 450, treesDrop: 700, life: 400, lifeDrop: 600 } },
  }[level];
  Q.phone = phone; Q.ios = ios;
  Q.freeGeometry = level !== 'voll';
  window.QUALITY = Q;

  // ---------- Anzeige ----------
  const SCRIPT_SHARE = 0.25;    // Anteil des Balkens für das Herunterladen der Skripte
  let lastChange = Date.now(), finished = false, failed = false, warned = false, building = false;
  const setText = (text, f) => {
    $('load-text').textContent = text;
    if (f != null) $('load-bar').style.width = Math.round(Math.min(1, f) * 100) + '%';
    lastChange = Date.now();
    if (warned && !failed) { warned = false; $('load-detail').textContent = note(); $('load-actions').classList.add('hidden'); }
  };
  const note = () => crashNote || (level !== 'voll' ? `Grafik: ${level} (für Smartphones angepasst)` : '');

  function showActions() {
    $('load-actions').classList.remove('hidden');
    $('load-light').classList.toggle('hidden', level === 'leicht');
  }
  function fail(msg, detail) {
    if (finished) { console.error(msg, detail || ''); return; }
    if (failed) return;
    failed = true;
    $('loading').classList.add('error');
    $('load-text').textContent = msg;
    $('load-detail').textContent = detail ? String(detail).slice(0, 300) : '';
    showActions();
    mark('fehler');
  }
  // Startzustand merken: „aufbau“ ohne „fertig“ beim nächsten Start heißt, die Seite ist dabei abgestürzt
  function mark(stage) {
    if (stage === 'fertig') store.del(BOOTKEY);
    else store.set(BOOTKEY, JSON.stringify({ stage, level, t: Date.now() }));
  }

  window.Boot = {
    level,
    // f: Anteil 0…1 des Weltaufbaus (nach dem Laden der Skripte)
    progress(text, f) { building = true; if (!failed) setText(text, SCRIPT_SHARE + (1 - SCRIPT_SHARE) * f); },
    fail,
    done() {
      finished = true; clearInterval(watch); mark('fertig');
      // Auf dem Startbildschirm die Grafikstufe zeigen und wechseln lassen
      const el = $('grafik-line');
      if (!el) return;
      el.textContent = `Grafik: ${level} · `;
      for (const lv of LEVELS) if (lv !== level) {
        const b = document.createElement('button'); b.textContent = lv; b.onclick = () => reloadWith(lv); el.appendChild(b);
      }
      el.classList.remove('hidden');
    },
    get finished() { return finished; },
  };

  // ---------- Knöpfe ----------
  const reloadWith = lv => {
    const u = new URL(location.href);
    u.searchParams.delete('grafik');
    if (lv) store.set(QKEY, lv);
    store.del(BOOTKEY);
    location.replace(u.toString());
  };
  $('load-retry').onclick = () => reloadWith(null);
  $('load-light').onclick = () => reloadWith(LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(level) + 1)]);
  $('load-detail').textContent = note();

  // ---------- Zeitlimit: hängt das Laden, Hinweis mit Knöpfen zeigen (Laden läuft weiter) ----------
  const STALL_WARN = 45000, STALL_FAIL = 150000;
  const watch = setInterval(() => {
    if (finished || failed) return;
    const idle = Date.now() - lastChange;
    if (idle > STALL_FAIL) fail('Das Laden hängt.', `Seit ${Math.round(idle / 1000)} s kein Fortschritt bei „${$('load-text').textContent}“. Bitte neu laden oder die leichte Grafik wählen.`);
    else if (idle > STALL_WARN && !warned) {
      warned = true;
      $('load-detail').textContent = 'Das dauert ungewöhnlich lange (langsame Verbindung oder wenig Speicher). Es lädt weiter …';
      showActions();
    }
  }, 2000);

  // ---------- Fehler während des Ladens ----------
  addEventListener('error', e => {
    if (finished) return;
    const t = e.target;
    if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) return; // meldet der Skriptlader selbst
    fail('Beim Laden ist ein Fehler aufgetreten.', e.message || (e.error && e.error.message));
  }, true);
  addEventListener('unhandledrejection', e => {
    if (!finished) fail('Beim Laden ist ein Fehler aufgetreten.', e.reason && (e.reason.message || e.reason));
  });
  // Tab verlassen oder selbst neu geladen ist kein Absturz
  addEventListener('pagehide', () => { if (!finished && !failed) mark('verlassen'); });

  // ---------- Daten und Skripte laden ----------
  // Pflichtteile brechen bei Fehlern ab, optionale Daten fehlen dann nur (das Spiel hat für alle einen Ersatz)
  const THREE_URLS = ['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js', 'https://unpkg.com/three@0.160.0/build/three.min.js'];
  const DATA = [
    { src: 'data/coburg.js', need: true, what: 'Stadtplan' },
    { src: 'data/ortho/tiles.js', what: 'Luftbilder' },
    Q.lod2 && { src: 'data/lod2.js', what: '3D-Gebäude' },
    { src: 'data/shops.js', what: 'Läden' },
    { src: 'data/region.js', what: 'Landkreis' },
    { src: 'data/region/ortho.js', what: 'Luftbilder Landkreis' },
    Q.hd && { src: 'data/region/ortho-hd.js', what: 'scharfe Luftbilder' },
  ].filter(Boolean);
  const CODE = ['util', 'atmosphere', 'water', 'world', 'region', 'vehicle', 'traffic', 'player', 'ui', 'fx', 'pedestrians', 'props',
    'townlife', 'driver', 'police', 'race', 'places', 'interiors', 'property', 'venues', 'game', 'touch'].map(n => `js/${n}.js`);

  const TIMEOUT = 90000;  // ohne jeden Fortschritt; große Dateien bei langsamer Mobilverbindung
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false; // parallel laden, in Reihenfolge ausführen
      const timer = setTimeout(() => rej(new Error('Zeitüberschreitung')), TIMEOUT);
      s.onload = () => { clearTimeout(timer); res(); };
      s.onerror = () => { clearTimeout(timer); rej(new Error('nicht erreichbar')); };
      document.body.appendChild(s);
    });
  }

  // Datendatei „window.NAME = {…};“ als Text holen und mit JSON.parse auspacken: braucht viel weniger Speicher als
  // ein Skript dieser Größe (Safari baut sonst für Millionen Zahlen einen Syntaxbaum und behält den Quelltext).
  // Zeitlimit ohne Fortschritt; bei Fehlern oder file:// als normales Skript nachladen.
  let bytes = 0;
  async function fetchData(src, onBytes) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT); };
    arm();
    try {
      const r = await fetch(src, ctl ? { signal: ctl.signal } : {});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      let text = '';
      if (r.body && r.body.getReader && typeof TextDecoder !== 'undefined') {
        const rd = r.body.getReader(), dec = new TextDecoder();
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          arm(); onBytes(value.length);
          text += dec.decode(value, { stream: true });
        }
        text += dec.decode();
      } else text = await r.text();
      const m = /window\.(\w+)\s*=\s*/.exec(text);
      if (!m) throw new Error('unerwarteter Inhalt');
      const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')) + 1;
      let obj;
      try { obj = JSON.parse(text.slice(m.index + m[0].length, end)); } catch (e) {
        const err = new Error('Daten beschädigt oder unvollständig (' + e.message + ')'); err.corrupt = true; throw err;
      }
      window[m[1]] = obj;
    } finally { clearTimeout(timer); }
  }
  const loadData = (src, onBytes) => /^https?:$/.test(location.protocol)
    ? fetchData(src, onBytes).catch(e => {
      if (e.corrupt) throw e; // als Skript wäre es genauso kaputt
      console.warn(src, 'per fetch fehlgeschlagen:', e.message, '– lade als Skript'); return loadScript(src);
    })
    : loadScript(src);

  async function start() {
    mark('laden');
    setText('Lade 3D-Grafik (three.js) …', 0.01);
    let ok = false;
    for (const u of THREE_URLS) {
      try { await loadScript(u); ok = !!window.THREE; } catch (e) { console.warn('three.js nicht geladen von', u, e.message); }
      if (ok) break;
    }
    if (!ok) return fail('three.js konnte nicht geladen werden.', 'Bitte Internetverbindung prüfen und neu laden.');
    mark('aufbau'); // ab hier wird viel Speicher gebraucht (Daten auspacken, Welt bauen)

    // Kartendaten gleichzeitig holen
    const total = DATA.length + CODE.length;
    let done = 0;
    const show = () => {
      if (failed || building) return;
      const mb = bytes > 3e5 ? ` · ${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : '';
      setText(`Lade Kartendaten … (${done}/${total})${mb}`, 0.02 + (SCRIPT_SHARE - 0.02) * done / total);
    };
    const settle = it => r => {
      done++; show();
      if (r === true) return;
      if (it.need) fail(`${it.what}: ${it.src} konnte nicht geladen werden.`, `${r.message}. Bitte Verbindung prüfen und neu laden.`);
      else console.warn(`${it.src} fehlt (${r.message}), Spiel läuft ohne`);
    };
    let shown = 0;
    await Promise.all(DATA.map(it => loadData(it.src, n => { bytes += n; if (bytes - shown > 2e5) { shown = bytes; show(); } })
      .then(() => true, e => e).then(settle(it))));
    if (failed) return;
    // dann die Spielskripte (gleichzeitig geladen, in Reihenfolge ausgeführt; game.js beginnt sofort mit dem Aufbau)
    await Promise.all(CODE.map(src => loadScript(src).then(() => true, e => e).then(settle({ src, need: true, what: 'Spiel' }))));
  }
  start();
})();
