// Verkehr: Autos fahren auf dem echten Straßennetz (Kanten zwischen Kreuzungen) rechts und
// biegen an Kreuzungen zufällig ab. Sie halten vor dem Spieler und vor anderen Autos.
'use strict';

const TRAFFIC = { count: 34, spawnMin: 90, spawnMax: 380, despawn: 470, lane: 1.7 };

class Traffic {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.cars = [];
    this.policeShare = 0.09;   // Anteil Streifenwagen im Verkehr
    const G = world.data.graph;
    this.nodes = G.nodes;
    this.edges = G.edges.map(e => {
      const p = e.p, cum = [0];
      for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
      return { a: e.a, b: e.b, p, cum, len: cum[cum.length - 1], o: !!e.o, s: e.s, n: e.n };
    }).filter(e => e.len > 1);
    // Abgehende Kanten pro Knoten: [Kante, Richtung]
    this.out = new Map();
    const add = (node, ei, dir) => { if (!this.out.has(node)) this.out.set(node, []); this.out.get(node).push([ei, dir]); };
    this.edges.forEach((e, i) => { add(e.a, i, 1); if (!e.o) add(e.b, i, -1); });
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
    for (let tries = 0; tries < 30; tries++) {
      const ei = Math.floor(Math.random() * this.edges.length);
      const e = this.edges[ei];
      const mi = Math.floor(e.p.length / 4) * 2;
      const d = Math.hypot(e.p[mi] - px, e.p[mi + 1] - pz);
      if (d < TRAFFIC.spawnMin || d > TRAFFIC.spawnMax) continue;
      const dir = e.o ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const s = Math.random() * e.len;
      if (this.cars.some(c => c.ai.edge === ei && Math.abs(c.ai.s - s) < 12)) continue;
      const r = Math.random();
      const kind = r < this.policeShare ? 'police' : r < this.policeShare + 0.1 ? 'taxi' : r < this.policeShare + 0.18 ? 'sport' : 'car';
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
      for (const o of this.cars) if (o !== car) check(o.x, o.z);

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
      if (ai.bumped > 0) { ai.bumped -= dt; target = 0; }
      if (car.burning || car.health < 15) target = 0;
      const acc = target > ai.speed ? 3 : 8;
      ai.speed = Math.max(0, ai.speed + U.clamp(target - ai.speed, -acc * dt, acc * dt));
      ai.s += ai.speed * dt;
      if (ai.s >= e.len) {
        if (ai.next) {
          ai.s -= e.len; ai.edge = ai.next[0]; ai.dir = ai.next[1]; ai.next = null;
        } else { ai.s = e.len; ai.speed = 0; }
      }
      this.placeCar(car, dt, false);
      car.spin += ai.speed * dt / CAR.wheelR;
      car.sync();
    }
  }

  // Auto wird vom Spieler übernommen
  release(car) {
    car.ai = null;
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}
