// Straßenrennen: Startpunkte in der Stadt, Strecke über das echte Straßennetz, Checkpoints,
// drei KI-Gegner mit derselben Fahrphysik wie der Spieler, Zeitnahme und Preisgeld.
'use strict';

// Wegpunkte in Spielmetern (x = Osten, z = Süden, Nullpunkt Marktplatz); die Strecke dazwischen sucht das Navi
const RACES = [
  { id: 'bahnhof', name: 'Bahnhofs-Sprint', wp: [[-452, -540], [-140, -480], [183, -170], [215, 60], [68, 470]], prize: [900, 400, 150] },
  { id: 'b4', name: 'Schnellweg-Rennen', wp: [[-628, -1150], [-560, -300], [-470, 600], [-446, 1180]], prize: [1100, 450, 180] },
  { id: 'veste', name: 'Veste-Bergrennen', wp: [[330, -240], [813, -330], [1110, -560]], prize: [1300, 550, 200] },
  { id: 'altstadt', name: 'Altstadt-Runde', wp: [[-128, 333], [-180, 120], [-120, -230], [183, -147], [250, 250], [-110, 345]], prize: [1500, 600, 250] },
  // Landkreis (nur mit data/region.js): Wegpunkte als [Breite, Länge]
  { id: 'callenberg', name: 'Callenberg-Bergsprint', geo: [[50.2648, 10.9440], [50.2782, 10.9213]], prize: [1400, 550, 200] },
  { id: 'rosenau', name: 'Rosenau-Rallye', geo: [[50.2850, 10.9969], [50.2960, 11.0432], [50.2979, 11.0231]], prize: [2000, 800, 300] },
  { id: 'neustadt', name: 'Neustadt-Express', geo: [[50.2960, 11.0432], [50.3003, 11.0581], [50.3273, 11.1238]], prize: [2600, 1000, 400] },
  { id: 'rodachtal', name: 'Rodachtal-Rennen', geo: [[50.3008, 10.9079], [50.3204, 10.9083], [50.3411, 10.7785]], prize: [3600, 1400, 500] },
  { id: 'sesslach', name: 'Seßlach-Classic', geo: [[50.2497, 10.8716], [50.2330, 10.8658], [50.1876, 10.8430]], prize: [2600, 1000, 400] },
  { id: 'itzgrund', name: 'Itzgrund-Sprint', geo: [[50.2002, 10.9610], [50.1819, 10.9288], [50.1625, 10.9365], [50.1242, 10.8791]], prize: [3400, 1300, 500] },
  { id: 'sonnefeld', name: 'Sonnefelder Runde', geo: [[50.2209, 11.0665], [50.2378, 11.1494], [50.2033, 11.1419], [50.2190, 11.0700]], prize: [4200, 1600, 600] },
  { id: 'lautertal', name: 'Lautertal-Tour', geo: [[50.2850, 10.9620], [50.3362, 10.9698], [50.3563, 11.0231]], prize: [3000, 1200, 450] },
  { id: 'hohenstein', name: 'Hohenstein-Hügelrennen', geo: [[50.2380, 10.9549], [50.2175, 10.9339], [50.2003, 10.9541]], prize: [2000, 800, 300] },
  { id: 'grosserpreis', name: 'Großer Preis des Landkreises', geo: [[50.2627, 10.9579], [50.2850, 10.9969], [50.2960, 11.0432], [50.3273, 11.1238],
    [50.2772, 11.1585], [50.2378, 11.1494], [50.2209, 11.0665], [50.2321, 11.0262], [50.2215, 10.9895], [50.2470, 10.9640]], prize: [9000, 3500, 1200] },
];
const RIVALS = [
  { name: 'Kevin', color: '#f2c500', speed: 41, corner: 0.95 },
  { name: 'Jessy', color: '#1e88ff', speed: 38, corner: 1.0 },
  { name: 'Dennis', color: '#19b34a', speed: 35, corner: 1.05 },
];

const fmtTime = t => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
};

class Races {
  // ctx: { world, scene, nav, ui, audio, save, addMoney(n, why) }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.list = RACES.map(r => this.build(r)).filter(Boolean);
    this.active = null;
    for (const r of this.list) this.addStartMarker(r);
    this.cpMeshes = [makeBeacon('#ffd23a', 7, 16), makeBeacon('#ffd23a', 7, 16), makeBeacon('#ffffff', 8, 18, true)];
    this.cpMeshes[1].material.opacity = 0.35;
    for (const m of this.cpMeshes) { m.visible = false; this.scene.add(m); }
  }

  build(def) {
    // Landkreis-Strecken stehen als [Breite, Länge] drin
    let wp = def.wp;
    if (def.geo) {
      if (!this.world.region) return null;
      const O = this.world.data.meta.origin, mLat = 110540, mLon = 111320 * Math.cos(O.lat * Math.PI / 180);
      wp = def.geo.map(([lat, lon]) => [(lon - O.lon) * mLon, -(lat - O.lat) * mLat]);
    }
    const locs = wp.map(([x, z]) => this.nav.locate(x, z, 200));
    if (locs.some(l => !l)) { console.warn('Rennen ohne Straße am Wegpunkt:', def.name); return null; }
    let raw = [];
    for (let i = 0; i + 1 < locs.length; i++) {
      // Suche begrenzen (Fahrzeit): reicht für Umwege, bleibt im großen Netz schnell
      const d = Math.hypot(locs[i + 1].x - locs[i].x, locs[i + 1].z - locs[i].z);
      const seg = this.nav.route(this.nav.costsFrom(locs[i + 1], d / 6 + 90), locs[i].x, locs[i].z);
      if (seg.length < 4) { console.warn('Rennen ohne Weg:', def.name, i); return null; }
      raw = raw.concat(raw.length ? seg.slice(2) : seg);
    }
    const path = resamplePath(raw, 4);
    const n = path.length / 2;
    const cps = [];
    // Checkpoints alle ≈ 144 m, auf langen Landstraßen-Strecken weiter auseinander
    const every = Math.max(36, Math.round(n / 45));
    for (let i = every; i < n - 15; i += every) cps.push(i);
    cps.push(n - 1);
    const hx = path[6] - path[0], hz = path[7] - path[1];
    return { ...def, path, n, cps, length: (n - 1) * 4, x: path[0], z: path[1], heading: Math.atan2(hx, hz) };
  }

  addStartMarker(r) {
    const b = makeBeacon('#3aa0ff', 6, 26);
    b.position.set(r.x, this.world.heightAt(r.x, r.z) - 0.5, r.z);
    if (this.world.region) this.world.region.anchor(b, r.x, r.z, -0.5);
    this.scene.add(b);
    r.beacon = b;
    this.makeLabel(r);
  }

  makeLabel(r) {
    if (r.label) { this.ui.removeLabel(r.label); r.label.material.map.dispose(); r.label.material.dispose(); }
    const best = this.save.best[r.id];
    const lab = makeLabel('Rennen: ' + r.name, '#3aa0ff', `${(r.length / 1000).toFixed(1)} km · ${best ? 'Bestzeit ' + fmtTime(best) : '1. Platz: € ' + r.prize[0]}`);
    lab.position.set(r.x, this.world.heightAt(r.x, r.z) + 9, r.z);
    if (this.world.region) this.world.region.anchor(lab, r.x, r.z, 9);
    this.ui.addLabel(lab, this.scene);
    r.label = lab;
  }

  setMarkers(on) {
    for (const r of this.list) { r.beacon.visible = on; r.label.userData.hidden = !on; }
  }

  cars() { return this.active ? this.active.rivals.map(v => v.car) : []; }

  // Startpunkt in der Nähe? (nur im Auto)
  near(T) {
    if (this.active || !T.inCar) return null;
    return this.list.find(r => Math.hypot(r.x - T.x, r.z - T.z) < 9) || null;
  }

  pointAt(r, i, lateral) {
    const p = r.path, k = U.clamp(i, 0, r.n - 2);
    const x = p[k * 2], z = p[k * 2 + 1];
    let dx = p[k * 2 + 2] - x, dz = p[k * 2 + 3] - z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // rechts von der Fahrtrichtung (dx, dz) liegt (-dz, dx)
    return { x: x - dz * lateral, z: z + dx * lateral, heading: Math.atan2(dx, dz) };
  }

  start(r, car) {
    this.setMarkers(false);
    const place = (c, i, lat) => {
      let p = this.pointAt(r, i, lat);
      if (this.world.insideBuilding(p.x, p.z, 1)) p = this.pointAt(r, i, 0);
      c.place(p.x, p.z, p.heading, this.world);
    };
    // Startaufstellung: [Index auf der Strecke (4 m), seitlicher Versatz]
    const grid = [[4, 1.4], [4, -1.6], [1, 1.4], [1, -1.6]];
    place(car, ...grid[0]);
    const rivals = RIVALS.map((d, k) => {
      const c = new Vehicle(this.scene, d.color, 'sport');
      place(c, ...grid[k + 1]);
      c.sleeping = false;
      c.spec = { ...c.spec, armor: 2.5 }; // KI-Fahrer verschrammen sich öfter als der Spieler
      const drv = new AutoDriver(c, { maxSpeed: d.speed, cornerFactor: d.corner, world: this.world });
      drv.setPath(r.path, true);
      return { ...d, car: c, driver: drv, done: null, out: false };
    });
    this.active = { r, rivals, t: -3.5, cp: 0, pIdx: 4, done: null, result: 0, lastBeep: 4 };
    this.ui.$('race-panel').classList.remove('hidden');
    this.showCheckpoints();
  }

  showCheckpoints() {
    const A = this.active, r = A.r;
    const [m0, m1, mf] = this.cpMeshes;
    m0.visible = m1.visible = mf.visible = false;
    if (!A || A.done) return;
    const put = (m, idx) => {
      const x = r.path[idx * 2], z = r.path[idx * 2 + 1];
      m.position.set(x, this.world.heightAt(x, z) - 0.5, z); m.visible = true;
    };
    const cur = r.cps[A.cp], next = r.cps[A.cp + 1];
    put(A.cp === r.cps.length - 1 ? mf : m0, cur);
    if (next !== undefined) put(A.cp + 1 === r.cps.length - 1 ? mf : m1, next);
  }

  // Rennen beenden (mit oder ohne Ergebnis) und aufräumen
  stop(msg) {
    const A = this.active;
    if (!A) return;
    for (const v of A.rivals) {
      if (v.car.disposed) continue;
      if (v.car.burning || v.car.wrecked) this.adopt(v.car); // Wracks bleiben in der Welt
      else v.car.dispose(this.scene);
    }
    this.active = null;
    for (const m of this.cpMeshes) m.visible = false;
    this.setMarkers(true);
    this.ui.$('race-panel').classList.add('hidden');
    if (msg) this.ui.toast(msg, 2.5);
  }

  progressOf(path, n, x, z, from) {
    let best = from, bd = Infinity;
    for (let i = Math.max(0, from - 8); i < Math.min(n, from + 40); i++) {
      const d = (path[i * 2] - x) ** 2 + (path[i * 2 + 1] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Gibt true zurück, solange der Spieler (Countdown) stillstehen muss
  update(dt, T, others) {
    const A = this.active;
    if (!A) return false;
    const r = A.r;
    if (!T.inCar || T.car.wrecked || T.car.burning) { this.stop('Rennen abgebrochen'); return false; }
    A.t += dt;
    const freeze = A.t < 0;
    if (freeze) {
      const sec = Math.ceil(-A.t);
      if (sec !== A.lastBeep && sec <= 3) { A.lastBeep = sec; this.ui.bigMessage(String(sec), 0.9, '#ffd23a'); this.audio.beep(520, 0.15); }
    } else if (A.lastBeep !== 0) { A.lastBeep = 0; this.ui.bigMessage('LOS!', 1, '#3ad46a'); this.audio.beep(1040, 0.35); }

    // Gegner
    for (const v of A.rivals) {
      const c = v.car;
      if (c.disposed) continue;
      if (c.burning || c.wrecked) { v.out = true; continue; }
      let input;
      if (freeze || v.done !== null) input = { throttle: 0, steer: 0, handbrake: true };
      else {
        // Gummiband: Abstand zum Spieler entlang der Strecke
        const gap = (v.driver.idx - A.pIdx) * 4;
        const cap = gap > 140 ? v.speed * 0.72 : gap > 70 ? v.speed * 0.88 : Infinity;
        v.driver.maxSpeed = gap < -120 ? v.speed * 1.12 : v.speed;
        input = v.driver.steer(dt, null, cap, others.concat(A.rivals.map(w => w.car), [T.car]));
        if (v.driver.idx >= r.n - 3) { v.done = A.t; this.audio.beep(300, 0.1); }
      }
      c.update(dt, input, this.world);
      for (const o of others) if (o !== c && o !== T.car) collideCars(c, o);
      for (const w of A.rivals) if (w !== v && !w.car.disposed) collideCars(c, w.car);
      c.updateGround(this.world, dt, false);
      c.sync();
    }
    if (freeze) {
      T.car.vx = T.car.vz = 0;
    }

    // Spieler: Fortschritt und Checkpoints
    if (!A.done) {
      A.pIdx = this.progressOf(r.path, r.n, T.x, T.z, A.pIdx);
      const ci = r.cps[A.cp];
      const cx = r.path[ci * 2], cz = r.path[ci * 2 + 1];
      if (Math.hypot(cx - T.x, cz - T.z) < 13) {
        A.cp++;
        if (A.cp >= r.cps.length) this.finish();
        else { this.audio.beep(880, 0.12); this.showCheckpoints(); }
      }
    }
    if (A.done && A.t - A.done > 6) this.stop();
    if (this.active) this.panel();
    return freeze;
  }

  place() {
    const A = this.active;
    if (A.done) return A.result;
    let ahead = 0;
    for (const v of A.rivals) if (!v.out && (v.done !== null || v.driver.idx > A.pIdx)) ahead++;
    return ahead + 1;
  }

  finish() {
    const A = this.active, r = A.r;
    A.done = A.t;
    A.result = 1 + A.rivals.filter(v => v.done !== null).length;
    for (const m of this.cpMeshes) m.visible = false;
    const prize = r.prize[A.result - 1] || 0;
    const best = this.save.best[r.id];
    const record = !best || A.t < best;
    if (record) this.save.best[r.id] = A.t;
    this.ui.bigMessage(A.result === 1 ? '1. PLATZ!' : `${A.result}. Platz`, 3.5, A.result === 1 ? '#ffd23a' : '#ffffff',
      `${fmtTime(A.t)}${record ? ' · neue Bestzeit!' : ''}${prize ? ' · € ' + prize : ''}`);
    this.audio.fanfare(A.result === 1);
    if (prize) this.addMoney(prize, r.name);
    else this.persist && this.persist();
    this.makeLabel(r);
  }

  panel() {
    const A = this.active, r = A.r, $ = this.ui.$;
    const t = Math.max(0, A.done || A.t);
    const html = `<div class="rp-name">${r.name}</div>
      <div class="rp-row"><span>Platz</span><b>${this.place()}/${A.rivals.length + 1}</b></div>
      <div class="rp-row"><span>Checkpoint</span><b>${Math.min(A.cp, r.cps.length)}/${r.cps.length}</b></div>
      <div class="rp-row"><span>Zeit</span><b>${fmtTime(t)}</b></div>
      ${this.save.best[r.id] ? `<div class="rp-row dim"><span>Bestzeit</span><b>${fmtTime(this.save.best[r.id])}</b></div>` : ''}
      <div class="rp-hint"><kbd>F</kbd> abbrechen</div>`;
    const el = $('race-panel');
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  // Daten für Minikarte und Stadtplan
  mapInfo() {
    const A = this.active;
    if (!A) return null;
    const r = A.r, ci = r.cps[Math.min(A.cp, r.cps.length - 1)];
    return { path: r.path, cp: A.done ? null : { x: r.path[ci * 2], z: r.path[ci * 2 + 1] },
      rivals: A.rivals.filter(v => !v.car.disposed).map(v => v.car) };
  }
}
