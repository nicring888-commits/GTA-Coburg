// Prüfbilder für den Stadtboden (Update „Lebendige Stadt“). In der Konsole mit ?bench:
//   await (await fetch('/bench/urban-shots.js')).text().then(eval)
// legt shot(name, pos, look), ab(name, pos, look) (mit/ohne Stadtboden) und doorShot an; Bilder in bench/shots/urban/.
(function () {
  const g = window.game, B = g.bench;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.shot = async (name, pos, look, clock = 13, label = 'urban') => {
    g.travel(look[0], look[2], 't');
    for (let i = 0; i < 40; i++) { g.simulate(0.05, 1 / 30, false); await wait(20); }
    B.fix(); g.hold = true; g.atmo.clock = clock; g.debugCam = { pos, look };
    for (let i = 0; i < 8; i++) { B.frame(); await wait(60); }
    await B.save(label, name + '.jpg', await B.snap());
    B.restore();
    return name;
  };
  const urbanMeshes = () => {
    const out = [];
    g.world.group.traverse(o => { if (o.userData && o.userData.urban) out.push(o); });
    return out;
  };
  window.ab = async (name, pos, look, clock) => {
    const ms = urbanMeshes();
    await shot(name + '_neu', pos, look, clock);
    ms.forEach(m => m.visible = false);
    await shot(name + '_alt', pos, look, clock);
    ms.forEach(m => m.visible = true);
  };
  window.doorShot = (name, b, back, hgt, side, fn = shot) => {
    const d = b.door, e = d.e, h = g.world.heightAt(d.x, d.z);
    return fn(name, [d.x + d.ox * back + e.ux * side, h + hgt, d.z + d.oz * back + e.uz * side], [d.x, h + 0.5, d.z]);
  };
  window.L = (g.world.buildingList || []).filter(b => b.door);
  return 'urban-shots bereit';
})();
