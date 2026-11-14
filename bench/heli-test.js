// Probe für den Helikopter (js/heli.js). In der Konsole (nach „Allein spielen“):
//   await (await fetch('/bench/heli-test.js')).text().then(eval)
// legt heliFly(tx, tz, opt) an: Autopilot mit Höhenhaltung (opt.alt m über Grund), Anflug, Abbremsen, Sinken bis
// zur Landung; gibt ein Protokoll zurück. heliBoard() steigt am nächsten Hubschrauber ein.
(function () {
  const K = game.keys, set = ks => { Object.keys(K).forEach(k => K[k] = false); ks.forEach(k => K[k] = true); };
  window.heliBoard = () => {
    const h = game.heliPads.nearest(game.player.x, game.player.z, 12);
    if (!h) return null;
    game.enterHeli(h);
    return h;
  };
  window.heliFly = (tx, tz, opt = {}) => {
    const h = game.heli, alt = opt.alt || 45, log = { maxImpact: 0, minClear: Infinity };
    let landing = false;
    if (!h) return 'kein Hubschrauber';
    for (let i = 0; i < (opt.steps || 2400); i++) {
      const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz), err = U.wrapAngle(Math.atan2(dx, dz) - h.yaw);
      const clear = h.y - h.ground, ks = [];
      if (err > 0.06) ks.push('KeyA'); else if (err < -0.06) ks.push('KeyD');
      if (d < 14 && h.speed < 4) landing = true;   // einmal begonnen: sinken bis zur Landung
      if (!landing) { if (clear < alt - 3) ks.push('Space'); else if (clear > alt + 8 && d > 60) ks.push('ShiftLeft'); }
      if ((d > 30 + h.speed * 1.6 || (d > 6 && h.speed < 2.5)) && Math.abs(err) < 0.4) ks.push('KeyW');
      else if (h.speed > 3 && d < 30 + h.speed * 1.6) ks.push('KeyS');
      if (landing) ks.push('ShiftLeft');
      set(ks);
      const hp = h.health;
      game.simulate(0.1, 1 / 30, false);
      if (h.health < hp) log.maxImpact = Math.max(log.maxImpact, hp - h.health);
      if (!h.landed) log.minClear = Math.min(log.minClear, clear);
      if (h.landed && landing) { log.landed = true; log.d = Math.round(d); break; }
      if (!game.heli) { log.crashed = true; break; }
    }
    set([]);
    Object.assign(log, { x: Math.round(h.x), z: Math.round(h.z), y: +h.y.toFixed(1), ground: +(h.ground || 0).toFixed(1), hp: Math.round(h.health), mode: game.mode });
    return log;
  };
  return 'heli-test bereit';
})();
