// Standbilder der Menü-Kamerafahrt (Hauptmenü, v3.21.0): prüft die Einstellungen in voller Größe und liefert die Bilder
// für den Ladebildschirm (assets/menu/ls-*.jpg). Mit ?bench in der Konsole:
//   await (await fetch('/bench/menu-shots.js')).text().then(eval)
//   await menuShot(0, 0.4)            // Szene 0 bei 40 % der Fahrt → bench/shots/menu/shot-0.jpg
//   await menuShots()                 // alle Szenen
(function () {
  const g = window.game, B = g.bench;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.menuShot = async (i, u = 0.45, name, w = 1600, h = 900) => {
    const D = g.menu.director;
    if (!D.active) D.start();
    g.hold = true;
    D.cut(i);
    const s = D.shots[D.i];
    // Verkehr und Fußgänger anlaufen lassen, Kacheln bauen
    for (let k = 0; k < 60; k++) { D.t = s.dur * u; g.menuStep(1 / 30); await wait(5); }
    B.fix(w, h);
    if (g.post.eye) { g.post.eye.reset = true; g.post.eye.fixedDt = 1 / 30; }
    for (let k = 0; k < 10; k++) { D.t = s.dur * u; D.update(0); B.frame(); await wait(40); }
    D.fade = 0;
    await B.save('menu', (name || 'shot-' + i) + '.jpg', await B.snap(0.86));
    B.restore();
    return s.place;
  };
  window.menuShots = async (u = 0.45) => { const out = []; for (let i = 0; i < g.menu.director.shots.length; i++) out.push(await menuShot(i, u)); return out; };
  return 'menu-shots bereit';
})();
