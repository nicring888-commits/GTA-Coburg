// Verkehr: Autos fahren auf dem echten Straßennetz (Kanten zwischen Kreuzungen) rechts und
// biegen an Kreuzungen zufällig ab. Sie halten vor dem Spieler und vor anderen Autos, seit v3.14.0 auch an roten
// Ampeln, Stoppschildern, Wartelinien (Vorfahrt) und Zebrastreifen (Haltepunkte aus js/signals.js).
'use strict';

// Zivile Modelle im Verkehr (Mehrfachnennung = häufiger)
const TRAFFIC_CIVIL = ['car', 'car', 'car', 'car', 'kleinwagen', 'kleinwagen', 'kombi', 'kombi', 'suv', 'van', 'pickup', 'cabrio'];
const TRAFFIC = { count: 34, spawnMin: 90, spawnMax: 380, despawn: 470, lane: 1.7 };

class Traffic {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.cars = [];
    this.policeShare = 0.09;   // Anteil Streifenwagen im Verkehr
    const G = world.data.graph;
    this.nodes = G.nodes;
    this.edges = G.edges.map((e, gi) => {
      const p = e.p, cum = [0];
      for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
      return { a: e.a, b: e.b, p, cum, len: cum[cum.length - 1], o: !!e.o, s: e.s, n: e.n, gi };
    }).filter(e => e.len > 1);
    this.peds = null;          // Fußgänger (game.js), für die Zebrastreifen
    // Abgehende Kanten pro Knoten: [Kante, Richtung]
    this.out = new Map();
    const add = (node, ei, dir) => { if (!this.out.has(node)) this.out.set(node, []); this.out.get(node).push([ei, dir]); };
    this.edges.forEach((e, i) => { add(e.a, i, 1); if (!e.o) add(e.b, i, -1); });
    // Suchraster der Kanten, damit im großen Landkreis-Netz schnell Kanten in Spielernähe gefunden werden
    this.grid = new U.Grid(150);
    this.edges.forEach((e, i) => { const b = U.polyBBox(e.p); this.grid.insert(i, b.minX, b.minZ, b.maxX, b.maxZ); });
    this._near = [];
  }

  // Punkt und Richtung bei Abstand s entlang der Kante (dir 1: a->b, -1: b->a)
  sample(e, s, dir, out) {
    if (dir < 0) s = e.len - s;
    s = U.clamp(s, 0, e.len);
    let i = 1;
    while (i < e.cum.length - 1 && e.cum[i] < s) i++;
    const p = e.p, t = (s - e.cum[i - 1]) / ((e.cum[i] - e.cum[i - 1]) || 1);
    const ax = p[(i - 1) * 2], az = p[(i - 1) * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
    let dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (dir < 0) { dx = -dx; dz = -dz; }
    out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.dx = dx; out.dz = dz;
    return out;
  }

  spawn(px, pz) {
    const near = this.grid.query(px, pz, TRAFFIC.spawnMax, this._near);
    if (!near.length) return null;
    const q = {};
    for (let tries = 0; tries < 30; tries++) {
      const ei = near[Math.floor(Math.random() * near.length)];
      const e = this.edges[ei];
      const dir = e.o ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const s = Math.random() * e.len;
      this.sample(e, s, dir, q);
      const d = Math.hypot(q.x - px, q.z - pz);
      if (d < TRAFFIC.spawnMin || d > TRAFFIC.spawnMax) continue;
      if (this.world.region && !this.world.region.walkable(q.x, q.z)) continue;
      if (this.cars.some(c => c.ai.edge === ei && Math.abs(c.ai.s - s) < 12)) continue;
      const r = Math.random();
      const kind = r < this.policeShare ? 'police' : r < this.policeShare + 0.1 ? 'taxi' : r < this.policeShare + 0.18 ? 'sport'
        : TRAFFIC_CIVIL[Math.floor(Math.random() * TRAFFIC_CIVIL.length)];
      const car = new Vehicle(this.scene, null, kind);
      car.ai = { edge: ei, dir, s, speed: e.s * 0.6, target: e.s, bumped: 0, next: null };
      this.cars.push(car);
      this.placeCar(car, 1, true);
      return car;
    }
    return null;
  }

  pickNext(car) {
    const e = this.edges[car.ai.edge];
    const node = car.ai.dir > 0 ? e.b : e.a;
    const opts = (this.out.get(node) || []).filter(([ei]) => ei !== car.ai.edge);
    if (!opts.length) {
      // Sackgasse: umdrehen, wenn erlaubt
      if (!e.o) return [car.ai.edge, -car.ai.dir];
      return null;
    }
    return opts[Math.floor(Math.random() * opts.length)];
  }

  placeCar(car, dt, snap) {
    const ai = car.ai, e = this.edges[ai.edge];
    const q = this.sample(e, ai.s, ai.dir, this._q || (this._q = {}));
    const lane = e.o ? 0 : TRAFFIC.lane;
    // rechts fahren: rechts von der Fahrtrichtung (dx, dz) liegt (-dz, dx)
    const tx = q.x - q.dz * lane, tz = q.z + q.dx * lane;
    const head = Math.atan2(q.dx, q.dz);
    if (snap) { car.x = tx; car.z = tz; car.heading = head; }
    else {
      car.x = U.damp(car.x, tx, 8, dt); car.z = U.damp(car.z, tz, 8, dt);
      const dh = U.wrapAngle(head - car.heading);
      car.heading += dh * (1 - Math.exp(-6 * dt));
      car.steer = U.clamp(dh * 2, -0.5, 0.5);
    }
    car.vx = Math.sin(car.heading) * ai.speed; car.vz = Math.cos(car.heading) * ai.speed;
    car.updateGround(this.world, dt, snap);
  }

  update(dt, px, pz, obstacles) {
    // auffüllen und entfernen
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (!c.ai) { this.cars.splice(i, 1); continue; } // vom Spieler übernommen
      if (Math.hypot(c.x - px, c.z - pz) > TRAFFIC.despawn) { c.dispose(this.scene); this.cars.splice(i, 1); }
    }
    let spawned = 0;
    while (this.cars.length < TRAFFIC.count && spawned++ < 3) if (!this.spawn(px, pz)) break;

    for (const car of this.cars) {
      const ai = car.ai, e = this.edges[ai.edge];
      // Hindernisse voraus?
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let blocked = Infinity;
      const check = (ox, oz) => {
        const dx = ox - car.x, dz = oz - car.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
        if (ahead > 0 && ahead < 18 && side < 2.4) blocked = Math.min(blocked, ahead);
      };
      for (const o of obstacles) check(o.x, o.z);
      for (const o of this.cars) if (o !== car && Math.abs(o.y - car.y) < 3) check(o.x, o.z);   // nicht unter/auf Brücken

      // Vor Kurven am Kantenende bremsen
      let target = e.s;
      const remain = e.len - ai.s;
      if (!ai.next) ai.next = this.pickNext(car);
      if (ai.next && remain < 25) {
        const ne = this.edges[ai.next[0]];
        const q1 = this.sample(e, e.len - 0.1, ai.dir, {}), q2 = this.sample(ne, 0.1, ai.next[1], {});
        const turn = Math.acos(U.clamp(q1.dx * q2.dx + q1.dz * q2.dz, -1, 1));
        target = Math.min(target, U.lerp(e.s, 4.5, U.clamp(turn / 1.6, 0, 1)));
      }
      if (blocked < Infinity) target = Math.min(target, Math.max(0, (blocked - 6) * 0.8));
      target = Math.min(target, this.ruleLimit(car, e, obstacles, dt));
      if (ai.bumped > 0) { ai.bumped -= dt; target = 0; }
      if (car.burning || car.health < 15) target = 0;
      const acc = target > ai.speed ? 3 : 8;
      ai.speed = Math.max(0, ai.speed + U.clamp(target - ai.speed, -acc * dt, acc * dt));
      ai.s += ai.speed * dt;
      if (ai.s >= e.len) {
        if (ai.next) {
          ai.s -= e.len; ai.edge = ai.next[0]; ai.dir = ai.next[1]; ai.next = null; ai.passed = null; ai.go = null; ai.wait = 0;
        } else { ai.s = e.len; ai.speed = 0; }
      }
      this.placeCar(car, dt, false);
      car.spin += ai.speed * dt / CAR.wheelR;
      car.sync();
    }
  }

  // Verkehrsregeln: Tempogrenze aus den Haltepunkten voraus (aktuelle Kante, kurz vor dem Ende auch die nächste).
  // Ampel rot oder rot-gelb: halten; gelb: halten, wenn das noch bequem geht (sonst durchfahren, ai.go). Stopp: anhalten,
  // 1,2 s stehen, dann wie Vorfahrt achten: warten, solange ein bevorrechtigtes Auto auf die Kreuzung zufährt oder darauf
  // ist (nach 9 s Warten fährt es trotzdem, keine Blockade). Zebrastreifen: halten, solange jemand auf der Fahrbahn quert.
  ruleLimit(car, e, obstacles, dt) {
    const ctl = this.world.region && this.world.region.control, ai = car.ai;
    if (!ctl || e.gi === undefined) return Infinity;
    const v = ai.speed, now = performance.now() / 1000;
    let lim = Infinity, waiting = false;
    const check = (ed, dir, base) => {
      for (const st of ctl.stopsOn(ed.gi)) {
        if (st.dir !== dir || st === ai.passed) continue;
        // Abstand der Wagenmitte zum Haltepunkt 2,6 m vor der Linie
        const dist = base + (dir > 0 ? st.s : ed.len - st.s) - ai.s - 2.6;
        if (dist < -1.5 || dist > 45) continue;
        let halt = false;
        if (st.kind === 'signal') {
          const s = ctl.state(st.sig, st.g, now);
          if (s !== 2 && ai.go !== st) {
            // schon zu nah zum Bremsen (gelb oder gerade rot geworden): durchfahren
            if (dist < v * v / 12 + 0.5 && v > 3) ai.go = st; else halt = true;
          }
        } else if (st.kind === 'zebra') halt = this.crossingBusy(st, obstacles);
        else {
          const stopped = st.kind === 'stop' && (ai.wait || 0) < 1.2;
          halt = stopped || !this.clear(car, st, obstacles);
          if (!halt) lim = Math.min(lim, 4 + Math.max(0, dist) * 0.6); // vorsichtig hineinrollen
        }
        if (!halt) continue;
        if (dist < 1.2) {
          waiting = true;
          // an Stopp und Vorfahrt: weiter, sobald frei (Stopp erst nach dem Stehen), nach 9 s auf jeden Fall
          if ((st.kind === 'stop' || st.kind === 'give') && (ai.wait || 0) >= 1.2 && ((ai.wait || 0) > 9 || this.clear(car, st, obstacles))) { ai.passed = st; continue; }
        }
        lim = Math.min(lim, Math.max(0, dist) * 0.9);
      }
    };
    check(e, ai.dir, 0);
    const remain = e.len - ai.s;
    if (ai.next && remain < 45) { const ne = this.edges[ai.next[0]]; if (ne && ne !== e) check(ne, ai.next[1], remain); }
    ai.wait = waiting && v < 0.6 ? (ai.wait || 0) + dt : 0;
    return lim;
  }
  // Ist die Kreuzung für einen Wartepflichtigen frei? Kein anderes Auto (Verkehr, Spieler, Polizei) bis 9 m auf ihr und
  // keins, das bis 30 m mit über 2 m/s auf sie zufährt, außer es wartet selbst an diesem Knoten
  clear(car, st, obstacles) {
    const busy = o => {
      if (o === car || o.disposed) return false;
      const dx = st.x - o.x, dz = st.z - o.z, d = Math.hypot(dx, dz);
      if (d > 30) return false;
      if (o.ai && o.ai.wait > 0) return false;
      const sp = o.ai ? o.ai.speed : Math.hypot(o.vx || 0, o.vz || 0);
      if (d < 9) return sp > 0.5 || !o.ai;
      if (sp < 2) return false;
      const fx = o.ai ? Math.sin(o.heading) : o.vx / sp, fz = o.ai ? Math.cos(o.heading) : o.vz / sp;
      return (dx * fx + dz * fz) / d > 0.6;
    };
    for (const o of this.cars) if (busy(o)) return false;
    for (const o of obstacles) if (o.vx !== undefined && busy(o)) return false;
    return true;
  }
  // Steht oder läuft jemand (Fußgänger, Spieler zu Fuß) auf dem Zebrastreifen bzw. auf der Fahrbahn daneben?
  crossingBusy(st, obstacles) {
    const on = (x, z) => { const dx = x - st.x, dz = z - st.z; return Math.abs(dx * st.ux + dz * st.uz) < 3 && Math.abs(dx * st.uz - dz * st.ux) < st.half + 0.6; };
    for (const o of obstacles) if (o.vx === undefined && on(o.x, o.z)) return true;
    if (this.peds) for (const p of this.peds.list) if (p.state !== 'down' && on(p.x, p.z)) return true;
    return false;
  }

  // Auto wird vom Spieler übernommen
  release(car) {
    car.ai = null;
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}
