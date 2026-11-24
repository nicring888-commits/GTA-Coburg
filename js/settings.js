// Einstellungen (seit v3.21.0, Hauptmenü): ein Speicher für alle Optionen des Einstellungsmenüs. Grafikstufe,
// Nachbearbeitung und Bewegungsunschärfe behalten ihre bisherigen Schlüssel (js/boot.js, js/post.js), damit alte
// Einstellungen und Tasten (O, B) weiter gelten; alles Neue liegt unter gta-coburg-settings.
// Liest js/game.js (Lautstärke, Maus, Sichtfeld, Tastenbelegung) und js/mainmenu.js (Menü).
'use strict';

const Settings = (() => {
  const KEY = 'gta-coburg-settings';
  // Aktionen mit änderbarer Taste: Code ist die Standardtaste, unter der das Spiel die Taste abfragt
  const ACTIONS = [
    { code: 'KeyW', name: 'Vorwärts / Gas' }, { code: 'KeyS', name: 'Rückwärts / Bremse' },
    { code: 'KeyA', name: 'Links / lenken' }, { code: 'KeyD', name: 'Rechts / lenken' },
    { code: 'ShiftLeft', name: 'Rennen / Helikopter sinken' }, { code: 'Space', name: 'Springen / Handbremse / steigen' },
    { code: 'KeyE', name: 'Einsteigen, klauen, aussteigen' }, { code: 'KeyF', name: 'Aktion (Rennen, Tür, Laden)' },
    { code: 'KeyH', name: 'Hupe' }, { code: 'KeyR', name: 'Nachladen / Auto aufrichten' },
    { code: 'KeyC', name: 'Kamera im Auto' }, { code: 'KeyV', name: 'Visier beim Zielen' },
    { code: 'KeyQ', name: 'Waffe wechseln' }, { code: 'KeyG', name: 'Garage' },
    { code: 'KeyM', name: 'Stadtplan' }, { code: 'KeyN', name: 'Zeitraffer Tag/Nacht' },
    { code: 'KeyK', name: 'Wetter wechseln' }, { code: 'KeyT', name: 'Chat (online)' },
    { code: 'KeyP', name: 'Pausenmenü' },
  ];
  const DEF = {
    audio: { master: 0.8, sfx: 1, ambient: 1, ui: 0.7, muteHidden: true },
    controls: { sens: 1, invertY: false, fov: 65, keys: {} },          // keys: Standardcode → eigene Taste
    display: { res: 1, adaptive: true },                                // res: Anteil der Renderauflösung
    general: { menuCam: true, tips: true, hints: true, autosave: true, dlgAuto: false, dlgSpeed: 1, subtitles: true },
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher weiter */ } },
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = clone(DEF);
  try {
    const s = JSON.parse(store.get(KEY) || 'null');
    if (s && typeof s === 'object') for (const g in DEF) if (s[g] && typeof s[g] === 'object') Object.assign(data[g], s[g]);
  } catch (e) { /* kaputte Einstellungen: Standard */ }
  const subs = [];
  // Rückwärtstabelle eigene Taste → Standardcode (für die Eingabe in game.js)
  let rev = {};
  const buildRev = () => {
    rev = {};
    const k = data.controls.keys;
    for (const a of ACTIONS) if (k[a.code] && k[a.code] !== a.code) rev[k[a.code]] = a.code;
  };
  buildRev();

  return {
    ACTIONS, DEF,
    get(group, key) { return key === undefined ? data[group] : data[group][key]; },
    set(group, key, value) {
      data[group][key] = value;
      if (group === 'controls' && key === 'keys') buildRev();
      store.set(KEY, JSON.stringify(data));
      for (const f of subs) try { f(group, key, value); } catch (e) { console.warn(e); }
    },
    reset(group) {
      data[group] = clone(DEF[group]);
      if (group === 'controls') buildRev();
      store.set(KEY, JSON.stringify(data));
      for (const f of subs) try { f(group, '*'); } catch (e) { console.warn(e); }
    },
    onChange(f) { subs.push(f); },
    // Taste einer Aktion (für Anzeige) und Übersetzung eigener Tasten in die Standardcodes des Spiels
    keyFor(code) { return data.controls.keys[code] || code; },
    bind(code, key) {
      const k = Object.assign({}, data.controls.keys);
      // dieselbe Taste darf nur eine Aktion haben: alte Belegung tauschen
      for (const a of ACTIONS) if (a.code !== code && (k[a.code] || a.code) === key) k[a.code] = this.keyFor(code);
      k[code] = key;
      for (const c in k) if (k[c] === c) delete k[c];
      this.set('controls', 'keys', k);
    },
    // eingehende Taste → Code, den das Spiel abfragt. Eine Standardtaste, die einer anderen Aktion zugewiesen wurde,
    // fällt dabei weg (sonst löste z. B. „E“ nach dem Tausch zwei Aktionen aus)
    mapKey(code) {
      if (rev[code]) return rev[code];
      if (data.controls.keys[code] && data.controls.keys[code] !== code) return null;
      return code;
    },
    label(code) {
      if (!code) return '–';
      const m = { Space: 'Leertaste', ShiftLeft: 'Shift links', ShiftRight: 'Shift rechts', ControlLeft: 'Strg links', ControlRight: 'Strg rechts',
        AltLeft: 'Alt', Enter: 'Enter', Tab: 'Tab', Backspace: '⌫', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Feststell' };
      if (m[code]) return m[code];
      return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
    },
  };
})();
window.Settings = Settings;
