// Polizei: Fahndungsstufe (1–5 Sterne), Streifenwagen, die den Spieler über das Straßennetz verfolgen und
// rammen, Polizisten zu Fuß, die festnehmen, und Straßensperren ab drei Sternen.
'use strict';

const WANTED = {
  units: [0, 2, 3, 4, 5, 7],                 // Verfolger je Sternzahl
  lose: s => 8 + s * 3.5,                    // so lange ungesehen, dann ist die Fahndung vorbei
  seeRange: 110,                             // Sichtweite der Polizei (mit freier Sicht)
  officerSpeed: 7.6,                         // zu Fuß etwas langsamer als der rennende Spieler (8,5)
  shootRange: 24,                            // Polizisten schießen ab 3 Sternen (ab 2, wenn der Spieler bewaffnet ist)
  shotDamage: 6, shotCarDamage: 3,           // je Treffer: Leben zu Fuß bzw. Schaden am Auto
};
const OFFICER_LOOK = { shirt: '#24467e', pants: '#17202f', cap: '#1a2b4d', hair: '#2a2018' };

class Police {
  // ctx: { world, scene, nav, traffic, fx, ui, onBusted(), others(), armed(), onShot(treffer, polizist), onDown(polizist) }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.heat = 0;            // Fahndungswert; Sterne = ganzzahliger Anteil
    this.units = [];          // { car, driver, mode: chase|block|leave, officer, cool, t }
    this.officers = [];
    this.unseen = 0;
    this.seen = false;
    this.bust = 0;            // Fortschritt der Festnahme 0..1
    this.spawnT = 0; this.blockT = 12; this.routeT = 0;
    this.costs = null;
    this.time = 0;
    this.sirenDist = Infinity;
    this.hostileT = 0;        // so lange nach Schüssen auf die Polizei wird ab 2 Sternen zurückgeschossen
  }

  get stars() { return Math.min(5, Math.floor(this.heat)); }
  cars() { return this.units.map(u => u.car); }

  // Straftat melden. min: Mindeststerne. Gibt true zurück, wenn sich die Sternzahl erhöht hat.
  crime(add, label, min = 0) {
    const before = this.stars;
    this.heat = Math.min(5.99, Math.max(this.heat, min) + add);
    if (this.heat >= 1) { this.unseen = 0; if (this.lastT) this.lastSeen = { x: this.lastT.x, z: this.lastT.z }; }
    const up = this.stars > before;
    if (label) this.ui.toast(up ? `${label}  ${'★'.repeat(this.stars)}` : label, 2.2);
    return up;
  }

  // Freie Sicht zwischen zwei Punkten (keine Hauswand dazwischen)
  sees(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.world.insideBuilding(ax + (bx - ax) * t, az + (bz - az) * t, 0)) return false;
    }
    return true;
  }

  // Patrouille im Verkehr oder eine Einheit in der Nähe, die etwas sehen könnte
  witness(x, z, range = 100) {
    for (const u of this.units) if (u.mode !== 'leave' && Math.hypot(u.car.x - x, u.car.z - z) < range && this.sees(u.car.x, u.car.z, x, z)) return true;
    for (const c of this.traffic.cars) if (c.kind === 'police' && Math.hypot(c.x - x, c.z - z) < range && this.sees(c.x, c.z, x, z)) return true;
    return false;
  }

  addUnit(car, mode = 'chase') {
    car.isPlayer = false; car.sleeping = false;
    car.setSiren(mode !== 'leave');
    car.spec = { ...car.spec, armor: 2.2 };
    const u = { car, driver: new AutoDriver(car, { maxSpeed: 40, world: this.world }), mode, skill: Math.random() * 3, officer: null, cool: 0, t: 0, routeT: Math.random() * 0.5 };
    this.units.push(u);
    return u;
  }

  removeUnit(u, dispose = true) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    if (u.officer) u.officer.unit = null;
    if (dispose) u.car.dispose(this.scene);
  }

  // Spieler übernimmt einen Streifenwagen, dessen Besatzung ausgestiegen ist
  takeCar(car) {
    const u = this.units.find(u => u.car === car);
    if (u) this.removeUnit(u, false);
    car.setSiren(false);
  }

  // Fahndung beenden; Einheiten fahren ohne Blaulicht weg
  clear() {
    this.heat = 0; this.unseen = 0; this.bust = 0; this.hostileT = 0;
    for (const u of this.units) { u.mode = 'leave'; u.car.setSiren(false); u.driver.path = null; u.t = 0; }
    for (const o of this.officers) o.giveUp = true;
  }

  // alles entfernen (Neustart nach Festnahme)
  reset() {
    for (const u of this.units.slice()) this.removeUnit(u);
    for (const o of this.officers) this.disposeFigure(o.fig);
    this.officers.length = 0;
    this.heat = 0; this.unseen = 0; this.bust = 0; this.hostileT = 0;
  }

  disposeFigure(fig) {
    this.scene.remove(fig.group);
    fig.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

  // Neuen Streifenwagen außer Sicht des Spielers ins Netz setzen
  spawnUnit(T, camYaw) {
    // zuerst Streifen aus dem normalen Verkehr in der Nähe alarmieren
    let best = null, bd = 320;
    for (const c of this.traffic.cars) {
      if (c.kind !== 'police' || c.burning) continue;
      const d = Math.hypot(c.x - T.x, c.z - T.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { this.traffic.release(best); return this.addUnit(best); }
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    // nur Stellen, von denen aus der Spieler über das Straßennetz erreichbar ist
    const reach = p => {
      if (!this.costs) return true;
      const l = this.nav.locate(p.x, p.z, 30), e = l && this.nav.edges[l.edge];
      return !!e && isFinite(Math.min(this.costs.dist[e.a], this.costs.dist[e.b]));
    };
    const behind = p => reach(p) && ((p.x - T.x) * fx + (p.z - T.z) * fz) / Math.hypot(p.x - T.x, p.z - T.z) < 0.25;
    const p = this.nav.randomPoint(T.x, T.z, 140, 300, behind) || this.nav.randomPoint(T.x, T.z, 140, 320, reach);
    if (!p || this.world.insideBuilding(p.x, p.z, 1)) return null;
    const car = new Vehicle(this.scene, null, 'police');
    car.place(p.x, p.z, p.heading, this.world);
    return this.addUnit(car);
  }

  // Zwei Streifenwagen quer über die Straße vor dem Spieler
  roadblock(T) {
    const fx = T.vx / (T.speed || 1), fz = T.vz / (T.speed || 1);
    const ax = T.x + fx * 170, az = T.z + fz * 170;
    const loc = this.nav.locate(ax, az, 70);
    if (!loc) return;
    const e = this.nav.edges[loc.edge];
    const q = { x: loc.x, z: loc.z };
    // Richtung der Straße an dieser Stelle
    const i = Math.max(1, e.cum.findIndex(c => c >= loc.s));
    let dx = e.p[i * 2] - e.p[i * 2 - 2], dz = e.p[i * 2 + 1] - e.p[i * 2 - 1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (Math.hypot(q.x - T.x, q.z - T.z) < 90) return;
    for (const side of [-1, 1]) {
      const x = q.x - dz * side * 2.3, z = q.z + dx * side * 2.3;
      if (this.world.insideBuilding(x, z, 0.5)) continue;
      const car = new Vehicle(this.scene, null, 'police');
      car.place(x, z, Math.atan2(dx, dz) + Math.PI / 2 * side, this.world);
      this.addUnit(car, 'block');
    }
    this.ui.toast('Straßensperre voraus!', 1.8);
  }

  // T: Zielinfo { x, z, vx, vz, speed, inCar, car, yaw }
  update(dt, T, camYaw) {
    this.time += dt;
    this.lastT = T;
    if (!this.lastSeen) this.lastSeen = { x: T.x, z: T.z };
    const stars = this.stars;
    const wanted = stars > 0;

    // Wegekosten zum Spieler, gemeinsam für alle Verfolger
    this.routeT -= dt;
    if (wanted && this.routeT <= 0) {
      this.routeT = 0.6;
      const loc = this.nav.locate(T.x, T.z, 300);
      this.costs = loc ? this.nav.costsFrom(loc, 150) : null;
    }

    // Einheiten auffüllen bzw. überzählige abziehen
    const chasing = this.units.filter(u => u.mode === 'chase');
    const want = WANTED.units[stars];
    this.spawnT -= dt;
    if (wanted && chasing.length < want && this.spawnT <= 0) { this.spawnT = chasing.length < 1 ? 0.3 : 1.6; this.spawnUnit(T, camYaw); }
    if (chasing.length > want + 1) { const u = chasing[chasing.length - 1]; u.mode = 'leave'; u.car.setSiren(false); u.driver.path = null; }
    // Straßensperren ab drei Sternen
    this.blockT -= dt;
    if (stars >= 3 && T.inCar && T.speed > 12 && this.blockT <= 0 && this.units.filter(u => u.mode === 'block').length < 4) {
      this.blockT = 26 - stars * 2; this.roadblock(T);
    }

    // Einheiten steuern
    this.seen = false;
    this.sirenDist = Infinity;
    const others = this.others();
    for (const u of this.units.slice()) {
      const c = u.car;
      u.t += dt;
      const d = Math.hypot(c.x - T.x, c.z - T.z);
      if (c.burning || c.wrecked) { this.removeUnit(u, false); this.onLost && this.onLost(c); continue; }
      if (d > 560 || (u.mode === 'leave' && (d > 260 || u.t > 45)) || (u.mode === 'block' && d > 380)) { this.removeUnit(u); continue; }
      if (c.siren) this.sirenDist = Math.min(this.sirenDist, d);
      const los = d < WANTED.seeRange && this.sees(c.x, c.z, T.x, T.z);
      if (wanted && u.mode !== 'leave' && (d < 40 || los)) this.seen = true;
      if (u.mode === 'block' && wanted && d < 30) u.mode = 'chase';

      let input;
      if (u.officer || u.mode === 'block' || (u.mode !== 'leave' && !wanted)) input = { throttle: 0, steer: 0, handbrake: true };
      else if (u.mode === 'leave') {
        if (!u.driver.path || u.driver.done) {
          const p = this.nav.randomPoint(c.x, c.z, 250, 500);
          if (p) { const loc = this.nav.locate(p.x, p.z); u.driver.setPath(resamplePath(this.nav.route(this.nav.costsFrom(loc, 150), c.x, c.z, 600), 4)); }
        }
        u.driver.maxSpeed = 14;
        input = u.driver.steer(dt, null, Infinity, others);
      } else {
        u.routeT -= dt;
        // Tempo wächst mit der Fahndungsstufe: bei 1 Stern hängt ein normales Auto die Streife auf der Geraden ab
        u.driver.maxSpeed = 34 + stars * 2.6 + u.skill;
        const direct = d < 45 && los;
        if (!direct && u.routeT <= 0 && this.costs) {
          u.routeT = 0.6;
          const r = this.nav.route(this.costs, c.x, c.z, 260);
          if (r.length >= 4) { r.push(T.x, T.z); u.driver.setPath(resamplePath(r, 4)); }
        }
        if (direct) {
          // auf den Spieler zuhalten (leicht vorausberechnet); steht er, daneben anhalten
          const lead = Math.min(1, d / 25);
          const tgt = { x: T.x + T.vx * lead, z: T.z + T.vz * lead };
          // langsamen Spieler nicht vor sich herschieben, sondern danebenstehen bleiben
          const stop = T.speed < 6 && d < 11;
          input = u.driver.steer(dt, tgt, stop ? 0 : Infinity);
          if (stop) { input.throttle = c.speed > 1 ? -1 : 0; input.handbrake = true; }
        } else input = u.driver.steer(dt, null, Infinity, others);
        // kein Weg zum Spieler (abgetrenntes Straßenstück): abziehen und anderswo neu einsetzen
        u.noPath = direct || u.driver.path ? 0 : (u.noPath || 0) + dt;
        if (u.noPath > 5 && d > 50) { this.removeUnit(u); continue; }
      }
      c.update(dt, input, this.world);
      for (const o of others) if (o !== c) collideCars(c, o);
      for (const v of this.units) if (v !== u) collideCars(c, v.car);
      c.updateGround(this.world, dt, false);
      c.sync();
      c.flash(this.time);

      // Polizist steigt aus, wenn der Spieler steht oder zu Fuß ist
      u.cool -= dt;
      if (wanted && u.mode === 'chase' && !u.officer && u.cool <= 0 && d < 24 && Math.abs(c.speed) < 2.5 && (!T.inCar || T.speed < 3)) {
        const fig = new Player(this.scene, OFFICER_LOOK);
        fig.runSpeed = WANTED.officerSpeed;
        fig.setWeapon('pistol');
        const lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
        let ox = c.x + lx * 1.8, oz = c.z + lz * 1.8;
        if (this.world.insideBuilding(ox, oz, 0.3)) { ox = c.x - lx * 1.8; oz = c.z - lz * 1.8; }
        fig.place(ox, oz, this.world);
        const o = { fig, unit: u, state: 'run', t: 0, giveUp: false, hp: 100, fireT: 0.6 + Math.random() * 0.6 };
        u.officer = o;
        this.officers.push(o);
      }
    }

    // Polizisten zu Fuß (bewaffnet: bleiben in Schussweite stehen und schießen)
    this.hostileT -= dt;
    const armed = stars >= 3 || (stars >= 2 && (this.hostileT > 0 || !!(this.armed && this.armed())));
    let near = false;
    const cars = others.concat(this.cars());
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i], f = o.fig;
      o.t += dt;
      const d = Math.hypot(f.x - T.x, f.z - T.z);
      if (o.state === 'down') {
        if (o.t > 6) { this.disposeFigure(f); this.officers.splice(i, 1); }
        continue;
      }
      // zu weit weg oder Fahndung vorbei: zurück ins Auto
      if (o.giveUp || !wanted || d > 45) {
        if (o.unit) { o.unit.officer = null; o.unit.cool = 5; }
        this.disposeFigure(f); this.officers.splice(i, 1); continue;
      }
      if (d < 30) this.seen = true;
      let mx = T.x - f.x, mz = T.z - f.z;
      const reach = T.inCar ? 2.6 : 1.3;
      const shoot = armed && d > reach && d < WANTED.shootRange && this.sees(f.x, f.z, T.x, T.z);
      if (d > reach * 0.8 && !shoot) { mx /= d; mz /= d; } else { mx = 0; mz = 0; }
      if (shoot) f.heading = Math.atan2(T.x - f.x, T.z - f.z);
      f.pose.aim = shoot ? 1 : 0;
      f.update(dt, { x: mx, z: mz, run: true, jump: false }, this.world, T.inCar ? cars.filter(c => c !== T.car) : cars);
      o.fireT -= dt;
      if (shoot && o.fireT <= 0) {
        o.fireT = 0.75 + Math.random() * 0.7;
        // trifft seltener auf Entfernung und bei schnellem Ziel
        const hit = Math.random() < U.clamp(0.62 - d * 0.017 - T.speed * 0.03, 0.12, 0.6);
        this.onShot && this.onShot(hit, f);
      }
      if (d < reach && (!T.inCar || T.speed < 2.5)) near = true;
    }
    this.bust = U.clamp(this.bust + (near ? dt / 2.2 : -dt / 1.2), 0, 1);
    if (this.bust >= 1 && wanted) { this.bust = 0; this.onBusted(); return; }

    // Verfolgung abschütteln
    if (wanted) {
      // entkommen: außer Sicht und weit genug weg von der Stelle, an der die Polizei dich zuletzt gesehen hat
      const away = Math.hypot(T.x - this.lastSeen.x, T.z - this.lastSeen.z) > 70 + 30 * stars;
      if (this.seen) {
        this.unseen = 0;
        this.lastSeen = { x: T.x, z: T.z };
        this.heat = Math.min(5.99, this.heat + dt / (55 + 25 * stars)); // je länger die Jagd, desto mehr Sterne
      } else if (away) {
        this.unseen += dt;
        if (this.unseen > WANTED.lose(stars)) {
          const reward = stars * 150;
          this.clear();
          this.onEscaped && this.onEscaped(stars, reward);
        }
      }
    }
  }

  // Polizist liegt (angefahren, erschossen, Explosion)
  downOfficer(o) {
    o.state = 'down'; o.t = 0; o.fig.pose.aim = 0;
    o.fig.group.rotation.x = -Math.PI / 2; o.fig.group.position.y += 0.2;
    if (o.unit) { o.unit.officer = null; o.unit.cool = 8; }
    this.onDown && this.onDown(o);
  }

  // Treffer durch den Spieler; gibt true zurück, wenn der Polizist umfällt
  shootOfficer(o, dmg, label = 'Auf die Polizei geschossen!') {
    if (o.state !== 'run') return false;
    o.hp -= dmg;
    this.hostileT = 30;
    if (o.hp > 0) { this.crime(0.35, label, 2); return false; }
    this.downOfficer(o);
    this.crime(1, 'Polizist niedergeschossen!', 3);
    return true;
  }

  // Druckwelle: Polizisten im Umkreis umwerfen
  knockDown(x, z, r) {
    let n = 0;
    for (const o of this.officers) if (o.state === 'run' && Math.hypot(o.fig.x - x, o.fig.z - z) < r) { this.downOfficer(o); n++; }
    if (n) { this.hostileT = 30; this.crime(1, 'Polizist verletzt!', 3); }
    return n;
  }

  // Spieler fährt mit dem Auto in einen Polizisten
  hitOfficers(car) {
    if (Math.abs(car.speed) < 5) return;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const o of this.officers) {
      if (o.state !== 'run') continue;
      const dx = o.fig.x - car.x, dz = o.fig.z - car.z;
      const lf = dx * fx + dz * fz, ll = dx * fz - dz * fx;
      if (Math.abs(lf) < CAR.length / 2 + 0.5 && Math.abs(ll) < CAR.width / 2 + 0.5) {
        this.downOfficer(o);
        this.crime(1, 'Polizist angefahren!', 2);
      }
    }
  }
}
