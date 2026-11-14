// Probe für das Bussystem (js/bus.js) ohne OSM-Daten: 7 Probehalte auf zweispurigen Straßen bis 700 m um den Spawn,
// eine Linie durch alle. In der Konsole (nach „Allein spielen“):
//   await (await fetch('/bench/bus-test.js')).text().then(eval)
// danach game.buses.stats, busReport() (Zustand aller Busse).
(function () {
  const T = game.traffic, G = game.world.data.graph, sp = game.spawn, rnd = U.rng(9);
  const mid = i => T.sample(T.edges[i], T.edges[i].len / 2, 1, {});
  let cand = [...new Set(T.grid.query(sp.x, sp.z, 700, []))].filter(i => T.edges[i].len > 90 && !T.edges[i].o);
  const pick = [];
  let cur = { x: sp.x, z: sp.z };
  for (let n = 0; n < 7 && cand.length; n++) {
    cand.sort((a, b) => { const A = mid(a), B = mid(b); return Math.hypot(A.x - cur.x, A.z - cur.z) - Math.hypot(B.x - cur.x, B.z - cur.z); });
    const j = cand.splice(Math.min(cand.length - 1, 2 + Math.floor(rnd() * 3)), 1)[0];
    pick.push(j);
    const q = mid(j); cur = { x: q.x, z: q.z };
    cand = cand.filter(i => { const a = mid(i); return Math.hypot(a.x - q.x, a.z - q.z) > 150; });
  }
  const stops = [], names = [];
  pick.forEach((j, k) => {
    const e = T.edges[j], q = mid(j), w = (G.edges[e.gi] && G.edges[e.gi].w) || 6;
    stops.push(Math.round((q.x - q.dz * (w / 2 + 2)) * 10), Math.round((q.z + q.dx * (w / 2 + 2)) * 10), k, k % 2 ? 1 : 0);
    names.push('Probehalt ' + (k + 1));
  });
  window.COBURG_BUSSTOPS = { names, stops, lines: [{ r: 'P', n: 'Probe', s: names.map((_, i) => i) }] };
  game.buses = new BusSystem({ world: game.world, scene: T.scene, traffic: T, peds: game.peds });
  window.busReport = () => game.buses.buses.map(b => ({ state: b.state, next: b.next, step: b.step, s: +b.s.toFixed(1), v: +b.speed.toFixed(1), car: !!b.car, load: b.load,
    x: b.car ? Math.round(b.car.x) : null, z: b.car ? Math.round(b.car.z) : null }));
  return 'Probe: ' + pick.length + ' Halte';
})();
