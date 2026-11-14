// Bushaltestellen und Stadtbusse (seit v3.20.0, Update „Lebendige Stadt“, Phase U4).
//
// Daten: data/busstops.js (OSM: Haltestellen, Linien-Relationen; tools/fetch-bus-stops.js, tools/convert-bus-stops.js).
// Fehlt die Datei, bleibt alles wie bisher.
//
// Netz: Jeder Halt wird an die nächste Verkehrskante geheftet (js/traffic.js). Fahrtrichtung = die Richtung, für die
// der Halt rechts liegt (Einbahnstraßen: vorwärts). Linienwege aus der Haltfolge der OSM-Relation, Teilstücke per
// Dijkstra über die Verkehrskanten (Einbahnstraßen beachtet), in Zeitscheiben während des Spiels berechnet.
//
// Busse: je Linie 1–3 Busse über die Strecke verteilt. Fern vom Spieler fahren sie nur rechnerisch (Strecke, Halte,
// Wartezeiten); unter BUS.near werden sie zum Fahrzeug (Vehicle 'bus', Modell aus dem CC-BY-Paket) auf der Schiene des
// Verkehrs und beachten Ampeln, Vorfahrt und Hindernisse (Traffic.ruleLimit). Ablauf am Halt, fest und zuverlässig:
// anfahren → halten → Türen auf → aussteigen → einsteigen → Türen zu → weiterfahren. An der Endhaltestelle beginnt
// der Bus seine Linie neu, sobald ihn der Spieler nicht sieht.
//
// Haltestellen in Spielernähe (BUS.stopNear): Mast mit H-Schild und Namen, Wartefläche mit Bordstein, Wartehäuschen
// (OSM shelter=yes oder Busbahnhof) mit Bank, wartende Fahrgäste (Figuren aus js/pedestrians.js), die einsteigen.
'use strict';

const BUS = {
  near: 650,           // ab hier ein echtes Fahrzeug
  far: 760,            // ab hier wieder nur rechnerisch
  stopNear: 320,       // Haltestellen-Bauten und Wartende
  stopFar: 420,
  speed: 13.9,         // höchstens 50 km/h
  virt: 8.5,           // Schnitt fern vom Spieler (m/s, ohne Halte)
  dwellMin: 7,         // Mindesthaltezeit (s)
  dwellMax: 28,
  wait: [0, 4],        // Wartende je Halt
  doors: [3.9, -0.4],  // Türen (m vor der Wagenmitte), rechte Seite
  half: [5.75, 1.3],   // halbe Länge/Breite (Kollision)
  lineMax: 30,         // höchstens so viele Linien
  color: '#eef1f4',
  ms: 3,               // Rechenzeit je Bild für den Aufbau der Linien
};

class BusSystem {
  constructor({ world, scene, traffic, peds }) {
    this.world = world; this.scene = scene; this.traffic = traffic; this.peds = peds;
    this.stops = []; this.lines = []; this.buses = []; this.queue = [];
    this.active = new Set();
    this.ok = !!(window.COBURG_BUSSTOPS && traffic && traffic.edges && traffic.edges.length);
    this.models = typeof CarModels !== 'undefined' && CarModels.on && CarModels.on() && CarModels.data && !!CarModels.data.bus;
    this.rnd = U.rng(77);
    this.stats = { stops: 0, lines: 0, failed: 0, buses: 0, boarded: 0, alighted: 0 };
    if (!this.ok) return;
    this.snapStops();
    const D = window.COBURG_BUSSTOPS;
    // Linien: je Nummer und Richtung (Name) die vollständigste Fassung; Rang nach Halten in Städten (Stadtverkehr
    // zuerst: Coburg 1402/1403), dann die übrigen bis BUS.lineMax
    const R = world.region, urban = st => R && R.urbanTown ? R.urbanTown(st.x, st.z) : Math.hypot(st.x, st.z) < 3500;
    const best = new Map();
    for (const L of D.lines) {
      const s = L.s.filter(i => this.stops[i] && this.stops[i].ei !== undefined);
      if (s.length < 3) continue;
      const key = L.r + '|' + L.n, o = best.get(key);
      if (!o || s.length > o.stops.length) best.set(key, { ref: L.r, name: L.n, stops: s, score: s.filter(i => urban(this.stops[i])).length });
    }
    const cand = [...best.values()].sort((a, b) => b.score - a.score || a.stops.length - b.stops.length);
    this.queue = cand.slice(0, BUS.lineMax);
    this.mats = this.makeMats();
  }

  // ---------- Netz ----------
  snapStops() {
    const D = window.COBURG_BUSSTOPS, T = this.traffic, G = this.world.data.graph, q = [];
    this.stopGrid = new U.Grid(100);
    for (let i = 0; i < D.stops.length; i += 4) {
      const x = D.stops[i] / 10, z = D.stops[i + 1] / 10, st = { i: i / 4, x, z, name: D.names[D.stops[i + 2]] || 'Haltestelle', flags: D.stops[i + 3], waiting: [], group: null };
      this.stops.push(st);
      let best = null;
      for (const ei of T.grid.query(x, z, 40, q)) {
        const e = T.edges[ei], p = e.p;
        for (let k = 0; k + 3 < p.length; k += 2) {
          const c = U.closestOnSeg(x, z, p[k], p[k + 1], p[k + 2], p[k + 3]), d = Math.hypot(c[0] - x, c[1] - z);
          if (!best || d < best.d) best = { ei, d, s: e.cum[k / 2] + c[2] * (e.cum[k / 2 + 1] - e.cum[k / 2]), cx: c[0], cz: c[1], dx: p[k + 2] - p[k], dz: p[k + 3] - p[k + 1] };
        }
      }
      if (!best || best.d > 28) continue;
      const e = T.edges[best.ei], l = Math.hypot(best.dx, best.dz) || 1, dx = best.dx / l, dz = best.dz / l;
      // rechts von a→b liegt (-dz, dx)
      const right = (x - best.cx) * -dz + (z - best.cz) * dx > 0;
      st.ei = best.ei; st.dir = e.o ? 1 : (right ? 1 : -1);
      st.sd = st.dir > 0 ? best.s : e.len - best.s;           // Lage entlang der Fahrtrichtung
      st.side = right ? 1 : -1;                                 // Seite des Halts relativ zu a→b
      st.w = (G.edges[e.gi] && G.edges[e.gi].w) || 6;
      st.cx = best.cx; st.cz = best.cz; st.ux = dx * st.dir; st.uz = dz * st.dir;   // Fahrtrichtung am Halt
      this.stopGrid.insert(st, x, z, x, z);
      this.stats.stops++;
    }
  }
  // kürzester Weg von Knoten a zu Knoten b über die Verkehrskanten → [[Kante, Richtung], …] oder null
  path(a, b, maxCost) {
    if (a === b) return [];
    const T = this.traffic, dist = new Map([[a, 0]]), prev = new Map(), heap = [[0, a]];
    const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, n] = pop();
      if (d > (dist.get(n) ?? Infinity)) continue;
      if (n === b) break;
      if (d > maxCost) return null;
      for (const [ei, dir] of T.out.get(n) || []) {
        const e = T.edges[ei], m = dir > 0 ? e.b : e.a, nd = d + e.len;
        if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, [ei, dir, n]); push(nd, m); }
      }
    }
    if (!prev.has(b)) return null;
    const out = [];
    for (let n = b; n !== a;) { const [ei, dir, p] = prev.get(n); out.push([ei, dir]); n = p; }
    return out.reverse();
  }
  // Linie aus der Haltfolge bauen: steps = [[Kante, Richtung]], marks = [{ step, sd, stop }]
  buildLine(c) {
    const T = this.traffic, steps = [], marks = [];
    const S = c.stops.map(i => this.stops[i]);
    const endNode = (ei, dir) => dir > 0 ? T.edges[ei].b : T.edges[ei].a, startNode = (ei, dir) => dir > 0 ? T.edges[ei].a : T.edges[ei].b;
    steps.push([S[0].ei, S[0].dir]);
    marks.push({ step: 0, sd: S[0].sd, stop: S[0] });
    for (let k = 1; k < S.length; k++) {
      const A = S[k - 1], B = S[k], cur = steps[steps.length - 1];
      if (cur[0] === B.ei && cur[1] === B.dir && B.sd > marks[marks.length - 1].sd + 8 && marks[marks.length - 1].step === steps.length - 1) {
        marks.push({ step: steps.length - 1, sd: B.sd, stop: B });
        continue;
      }
      const p = this.path(endNode(cur[0], cur[1]), startNode(B.ei, B.dir), 6000);
      if (!p) { this.stats.failed++; return null; }
      steps.push(...p, [B.ei, B.dir]);
      marks.push({ step: steps.length - 1, sd: B.sd, stop: B });
      if (steps.length > 4000) return null;
    }
    // Länge je Schritt (für die Verteilung der Busse)
    const cum = [0];
    for (const [ei] of steps) cum.push(cum[cum.length - 1] + T.edges[ei].len);
    return { ref: c.ref, name: c.name, steps, marks, cum, len: cum[cum.length - 1] };
  }

  // ---------- Busse ----------
  addBuses(line) {
    const n = U.clamp(Math.round(line.len / 2800), 1, 3);
    for (let k = 0; k < n; k++) {
      const at = line.len * (k + 0.15) / n;
      let step = 0;
      while (step < line.steps.length - 1 && line.cum[step + 1] < at) step++;
      const b = { line, step, s: Math.max(0, at - line.cum[step]), speed: 0, next: 0, state: 'drive', t: 0, car: null, load: 4 + Math.floor(this.rnd() * 12), doorsOut: 0, doorsIn: 0, moving: [] };
      // nächster Halt voraus
      b.next = line.marks.findIndex(m => m.step > b.step || (m.step === b.step && m.sd > b.s));
      if (b.next < 0) { b.next = 0; b.step = 0; b.s = 0; }
      this.buses.push(b);
    }
  }
  stepEdge(b) { return this.traffic.edges[b.line.steps[b.step][0]]; }
  // Abstand bis zum nächsten Halt entlang der Strecke (Mitte des Busses ≈ 1 m hinter dem Mast)
  toStop(b) {
    const m = b.line.marks[b.next];
    if (!m) return Infinity;
    let d = -b.s;
    for (let k = b.step; k < m.step; k++) d += b.line.cum[k + 1] - b.line.cum[k];
    return d + m.sd - 1;
  }
  advance(b, ds) {
    b.s += ds;
    for (let guard = 0; guard < 50; guard++) {
      const e = this.stepEdge(b);
      if (b.s < e.len) break;
      if (b.step >= b.line.steps.length - 1) { b.s = e.len; break; }
      b.s -= e.len; b.step++;
      if (b.car) { const ai = b.car.ai; ai.passed = null; ai.go = null; ai.wait = 0; }
    }
  }
  restart(b) {
    b.step = 0; b.s = Math.max(0, b.line.marks[0].sd - 30); b.next = 0; b.state = 'drive'; b.speed = 0; b.t = 0;
    if (b.car) this.release(b);
  }
  release(b) {
    if (!b.car) return;
    b.car.dispose(this.scene);
    b.car = null;
    // Fahrgäste, die gerade ein- oder aussteigen, beenden das sofort
    for (const p of b.moving) this.dropFigure(p);
    b.moving = [];
  }
  spawnCar(b) {
    const car = new Vehicle(this.scene, BUS.color, 'bus');
    const [ei, dir] = b.line.steps[b.step];
    car.ai = { edge: ei, dir, s: b.s, speed: b.speed, target: 0, bumped: 0, next: this.nextStep(b) };
    car.bus = b;
    b.car = car;
    this.traffic.placeCar(car, 1, true);
    car.sync();
  }
  nextStep(b) { return b.step < b.line.steps.length - 1 ? b.line.steps[b.step + 1] : null; }

  update(dt, px, pz, obstacles) {
    if (!this.ok) return;
    // Linien nach und nach aufbauen
    if (this.queue.length) {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < BUS.ms) {
        const line = this.buildLine(this.queue.shift());
        if (line) { this.lines.push(line); this.stats.lines++; if (this.models) this.addBuses(line); }
      }
    }
    this.updateStops(dt, px, pz);
    for (const b of this.buses) this.updateBus(b, dt, px, pz, obstacles);
    this.stats.buses = this.buses.filter(b => b.car).length;
  }

  updateBus(b, dt, px, pz, obstacles) {
    const T = this.traffic, e = this.stepEdge(b);
    const q = T.sample(e, b.s, b.line.steps[b.step][1], this._q || (this._q = {}));
    const dPl = Math.hypot(q.x - px, q.z - pz);
    if (!b.car && dPl < BUS.near) this.spawnCar(b);
    else if (b.car && dPl > BUS.far) this.release(b);
    const stopD = this.toStop(b), m = b.line.marks[b.next];

    if (b.state === 'drive') {
      let target = Math.min(BUS.speed, e.s || BUS.speed);
      if (b.car) {
        const car = b.car, ai = car.ai;
        ai.edge = b.line.steps[b.step][0]; ai.dir = b.line.steps[b.step][1]; ai.s = b.s; ai.next = this.nextStep(b);
        // Kurve am Kantenende
        const remain = e.len - b.s;
        if (ai.next && remain < 25) {
          const ne = T.edges[ai.next[0]], q1 = T.sample(e, e.len - 0.1, ai.dir, {}), q2 = T.sample(ne, 0.1, ai.next[1], {});
          const turn = Math.acos(U.clamp(q1.dx * q2.dx + q1.dz * q2.dz, -1, 1));
          target = Math.min(target, U.lerp(target, 3.5, U.clamp(turn / 1.4, 0, 1)));
        }
        // Hindernisse voraus (Spieler, Verkehr, Polizei): längerer Bus → weiter vorausschauen
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        let blocked = Infinity;
        const check = (ox, oz) => { const dx = ox - car.x, dz = oz - car.z, ah = dx * fx + dz * fz, sd = Math.abs(dx * -fz + dz * fx); if (ah > 0 && ah < 24 && sd < 2.6) blocked = Math.min(blocked, ah); };
        for (const o of obstacles) check(o.x, o.z);
        for (const o of T.cars) if (Math.abs(o.y - car.y) < 3) check(o.x, o.z);
        for (const o of this.buses) if (o !== b && o.car) check(o.car.x, o.car.z);
        if (blocked < Infinity) target = Math.min(target, Math.max(0, (blocked - 9) * 0.7));
        ai.speed = b.speed;
        target = Math.min(target, T.ruleLimit(car, e, obstacles, dt));
        if (car.burning || car.health < 15) target = 0;
      } else {
        target = Math.min(target, BUS.virt);
      }
      // am Halt sanft zum Stehen kommen
      if (m) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 1.3 * stopD)));
      const acc = target > b.speed ? 1.4 : 3.5;
      b.speed = Math.max(0, b.speed + U.clamp(target - b.speed, -acc * dt, acc * dt));
      this.advance(b, Math.min(b.speed * dt, Math.max(0, stopD) + 0.05));
      if (m && this.toStop(b) < 0.35 && b.speed < 0.6) { b.speed = 0; b.state = 'arrive'; b.t = 0; }
      // Ende der Strecke ohne weiteren Halt
      if (!m && b.step >= b.line.steps.length - 1 && b.s >= e.len - 0.5) { b.state = 'end'; b.t = 0; }
    } else if (b.state === 'arrive') {
      b.t += dt;
      if (b.t > 1.0) { b.state = 'doors'; b.t = 0; this.openDoors(b, m.stop); }
    } else if (b.state === 'doors') {
      b.t += dt;
      this.passengers(b, m.stop, dt);
      const done = b.doorsOut <= 0 && b.doorsIn <= 0 && !b.moving.length;
      if ((done && b.t > BUS.dwellMin) || b.t > BUS.dwellMax) { b.state = 'close'; b.t = 0; this.finishStop(b, m.stop); }
    } else if (b.state === 'close') {
      b.t += dt;
      if (b.t > 1.2) {
        b.next++;
        b.state = b.next < b.line.marks.length ? 'drive' : 'end';
        b.t = 0;
      }
    } else if (b.state === 'end') {
      // Endhaltestelle: neu beginnen, wenn der Spieler weit weg ist oder nach 40 s
      b.t += dt;
      if (!b.car || dPl > 250 || b.t > 40) this.restart(b);
    }
    if (b.car) {
      const car = b.car, ai = car.ai;
      ai.edge = b.line.steps[b.step][0]; ai.dir = b.line.steps[b.step][1]; ai.s = b.s; ai.speed = b.speed;
      T.placeCar(car, dt, false);
      car.spin += b.speed * dt / 0.5;
      car.sync();
    }
  }

  // ---------- Fahrgäste ----------
  doorPos(b, k) {
    const car = b.car, fx = Math.sin(car.heading), fz = Math.cos(car.heading), d = BUS.doors[k];
    // rechte Seite (wie in js/traffic.js: rechts von (fx, fz) liegt (-fz, fx))
    return { x: car.x + fx * d - fz * 1.45, z: car.z + fz * d + fx * 1.45 };
  }
  openDoors(b, stop) {
    if (!b.car) { b.doorsOut = b.doorsIn = 0; return; }
    b.doorsOut = Math.min(b.load, Math.floor(this.rnd() * 4));
    b.doorsIn = stop.waiting.length;
    b.gap = 0;
  }
  // je 0,8 s ein Fahrgast: zuerst aussteigen (Mitteltür), dann einsteigen (vordere Tür)
  passengers(b, stop, dt) {
    if (b.car) {
      b.gap -= dt;
      if (b.gap <= 0 && b.doorsOut > 0) {
        b.gap = 0.8; b.doorsOut--; b.load--;
        const d = this.doorPos(b, 1), fx = Math.sin(b.car.heading), fz = Math.cos(b.car.heading);
        const p = this.peds.look({ x: d.x, z: d.z, y: this.world.groundAt(d.x, d.z), heading: Math.atan2(-fz, fx), state: 'stand', phase: 0, moving: 0 });
        p.scale = 0.92 + this.rnd() * 0.12;
        p.bus = { mode: 'out', tx: d.x - fz * 2.6 + fx * (this.rnd() * 3 - 1.5), tz: d.z + fx * 2.6 + fz * (this.rnd() * 3 - 1.5), b };
        this.peds.sitters.push(p);
        b.moving.push(p);
        this.stats.alighted++;
      } else if (b.gap <= 0 && b.doorsOut <= 0 && stop.waiting.length) {
        b.gap = 0.8;
        const p = stop.waiting.shift();
        b.doorsIn--;
        const d = this.doorPos(b, 0);
        p.state = 'stand';
        p.bus = { mode: 'in', tx: d.x, tz: d.z, b };
        b.moving.push(p);
      }
    }
    // Figuren gehen zu ihrem Ziel (Tür bzw. Gehsteig)
    for (let i = b.moving.length - 1; i >= 0; i--) {
      const p = b.moving[i], dx = p.bus.tx - p.x, dz = p.bus.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.25) {
        b.moving.splice(i, 1);
        if (p.bus.mode === 'in') { this.dropFigure(p); b.load++; this.stats.boarded++; }
        else this.adopt(p);
        continue;
      }
      const v = Math.min(d, 1.35 * dt);
      p.x += dx / d * v; p.z += dz / d * v; p.y = this.world.groundAt(p.x, p.z);
      p.heading = Math.atan2(dx, dz); p.moving = 1.3; p.phase += dt * 7.5;
    }
  }
  finishStop(b) {
    // wer noch läuft, ist eingestiegen bzw. geht weiter
    for (const p of b.moving) { if (p.bus.mode === 'in') { this.dropFigure(p); b.load++; } else this.adopt(p); }
    b.moving = [];
    b.doorsOut = b.doorsIn = 0;
  }
  dropFigure(p) {
    const S = this.peds.sitters, i = S.indexOf(p);
    if (i >= 0) S.splice(i, 1);
  }
  // ausgestiegener Fahrgast wird ein normaler Fußgänger (oder verschwindet, wenn kein Weg in der Nähe ist)
  adopt(p) {
    this.dropFigure(p);
    if (this.peds.adopt) this.peds.adopt(p);
  }

  // ---------- Haltestellen in Spielernähe ----------
  updateStops(dt, px, pz) {
    const now = new Set();
    for (const st of this.stopGrid.query(px, pz, BUS.stopNear, this._sq || (this._sq = []))) {
      if (Math.hypot(st.x - px, st.z - pz) < BUS.stopNear) now.add(st);
    }
    for (const st of now) if (!this.active.has(st)) { this.active.add(st); this.buildStop(st); }
    for (const st of this.active) {
      if (now.has(st) || Math.hypot(st.x - px, st.z - pz) < BUS.stopFar) {
        // Wartende nachfüllen (nicht während ein Bus hält)
        st.refill = (st.refill || 0) - dt;
        if (st.refill <= 0) {
          st.refill = 14 + this.rnd() * 26;
          if (st.waiting.length < st.maxWait && !this.buses.some(b => b.state === 'doors' && b.line.marks[b.next] && b.line.marks[b.next].stop === st)) this.addWaiting(st);
        }
        continue;
      }
      this.active.delete(st);
      this.dropStop(st);
    }
  }
  // Lage der Wartefläche: rechts der Fahrtrichtung neben der Fahrbahn
  stopFrame(st) {
    const rx = -st.uz, rz = st.ux;   // rechts von (ux, uz), wie in js/traffic.js
    const side = (st.side * st.dir > 0) ? 1 : -1;   // Halt rechts (1) oder links (Einbahnstraße) der Fahrtrichtung
    const o = st.w / 2;
    return { rx: rx * side, rz: rz * side, o, ux: st.ux, uz: st.uz };
  }
  buildStop(st) {
    const W = this.world, F = this.stopFrame(st);
    const at = (along, off) => [st.cx + F.ux * along + F.rx * (F.o + off), st.cz + F.uz * along + F.rz * (F.o + off)];
    const walk = (x, z) => { const w = W.walkAt(x, z); return w !== null ? w : W.heightAt(x, z); };
    const big = (st.flags & 4) || (st.flags & 1);
    const g = new THREE.Group();
    const parts = [];
    // Wartefläche mit Bordstein (nur wo kein Gehsteig ist): 12 m lang (Busbahnhof 18 m), 2,4 m tief, 16 cm hoch
    const L = (st.flags & 4) ? 18 : 12, pc = at(-1.5, 1.45);
    const hasWalk = W.walkAt(pc[0], pc[1]) !== null;
    if (!hasWalk && !W.insideBuilding(pc[0], pc[1], 0.3)) parts.push({ box: [L, 0.16, 2.4], at: at(-1.5, 1.45), col: '#b4b0a8', y0: W.heightAt(pc[0], pc[1]) - 0.02 });
    const padTop = hasWalk ? null : W.heightAt(pc[0], pc[1]) + 0.14;
    const yAt = (x, z) => padTop !== null ? padTop : walk(x, z);
    // Mast mit H-Schild vorn
    const mp = at(3.6, 0.55), my = yAt(mp[0], mp[1]);
    parts.push({ cyl: [0.04, 2.6], at: mp, y0: my, col: '#9aa0a4' });
    // Fahrplankasten
    parts.push({ box: [0.32, 0.45, 0.05], at: mp, y0: my + 1.25, col: '#e6e6e0', off: [0, 0, 0.06] });
    // Wartehäuschen (Häuschen laut OSM oder Busbahnhof/große Halte), nur wenn Platz ist
    let shelter = null;
    if (big) {
      const sc = at(-2, 2.05), back = at(-2, 2.85);
      if (!W.insideBuilding(back[0], back[1], 0.4) && !W.insideBuilding(sc[0], sc[1], 0.2)) shelter = { c: sc, y: yAt(sc[0], sc[1]) };
    }
    const head = Math.atan2(F.ux, F.uz);
    const geo = this.mergeParts(parts, head);
    if (geo) { const m = new THREE.Mesh(geo, this.mats.solid); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    // Schild (beidseitig): gelber Kreis mit grünem H, darunter Name
    const sign = new THREE.Mesh(this.signGeo || (this.signGeo = new THREE.PlaneGeometry(0.62, 0.95)), this.signMat(st.name));
    sign.position.set(mp[0], my + 2.2, mp[1]);
    sign.rotation.y = head + Math.PI / 2;
    g.add(sign);
    const sign2 = sign.clone(); sign2.rotation.y += Math.PI; g.add(sign2);
    if (shelter) g.add(this.shelterMesh(shelter.c, shelter.y, head));
    this.scene.add(g);
    st.group = g;
    st.seat = shelter ? { x: shelter.c[0], z: shelter.c[1], y: shelter.y } : null;
    st.F = F; st.at = at; st.yAt = yAt;
    st.maxWait = BUS.wait[0] + Math.floor(this.rnd() * (BUS.wait[1] - BUS.wait[0] + 1)) + ((st.flags & 4) ? 2 : 0);
    st.refill = 0;
    for (let k = 0; k < st.maxWait; k++) this.addWaiting(st);
  }
  dropStop(st) {
    if (st.group) {
      st.group.traverse(o => { if (o.isMesh && o.geometry !== this.signGeo && !o.userData.shared) o.geometry.dispose(); if (o.isMesh && o.material && o.material.userData.own) { o.material.map && o.material.map.dispose(); o.material.dispose(); } });
      this.scene.remove(st.group); st.group = null;
    }
    for (const p of st.waiting) this.dropFigure(p);
    st.waiting = [];
  }
  addWaiting(st) {
    if (!st.at) return;
    const k = st.waiting.length;
    let x, z, state = 'stand', y;
    const sitting = st.seat && k < 2 && this.rnd() < 0.6;
    if (sitting) {
      const F = st.F, a = (k === 0 ? -0.5 : 0.5);
      x = st.seat.x + F.ux * a + F.rx * 0.25; z = st.seat.z + F.uz * a + F.rz * 0.25; state = 'sit'; y = st.seat.y + 0.05;
    } else {
      const p = st.at(-4.5 + this.rnd() * 7, 0.9 + this.rnd() * 1.1); x = p[0]; z = p[1]; y = st.yAt(x, z);
    }
    // Blick zur Straße (dorthin, woher der Bus kommt, leicht gedreht)
    const head = Math.atan2(-st.F.rx - st.F.ux * 0.6, -st.F.rz - st.F.uz * 0.6) + (this.rnd() - 0.5) * 0.6;
    const p = this.peds.look({ x, z, y, heading: head, state, phase: this.rnd() * 6, moving: 0 });
    p.scale = 0.9 + this.rnd() * 0.14;
    p.busWait = st;
    this.peds.sitters.push(p);
    st.waiting.push(p);
  }

  // ---------- Formen ----------
  makeMats() {
    return {
      solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
      glass: new THREE.MeshStandardMaterial({ color: '#a9c4cc', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
    };
  }
  // Quader und Zylinder in eine Form (Eckenfarben), Drehung head um y
  mergeParts(parts, head) {
    const pos = [], nor = [], col = [], c = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), head);
    for (const p of parts) {
      let g;
      if (p.box) g = new THREE.BoxGeometry(p.box[0], p.box[1], p.box[2]).toNonIndexed();
      else g = new THREE.CylinderGeometry(p.cyl[0], p.cyl[0], p.cyl[1], 8).toNonIndexed();
      const h = p.box ? p.box[1] : p.cyl[1];
      // Quader: lange Seite entlang der Fahrtrichtung (x der Box → Fahrtrichtung)
      const qq = p.box ? q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)) : q;
      const off = p.off ? new THREE.Vector3(...p.off).applyQuaternion(q) : new THREE.Vector3();
      m4.compose(new THREE.Vector3(p.at[0] + off.x, p.y0 + h / 2 + off.y, p.at[1] + off.z), qq, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m4);
      c.set(p.col);
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
      for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
      g.dispose();
    }
    if (!pos.length) return null;
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    G.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return G;
  }
  // Wartehäuschen: Rahmen und Dach (dunkelgrau), Bank, Glas hinten und an den Seiten (3,6 × 1,5 × 2,4 m)
  shelterMesh(c, y, head) {
    const g = new THREE.Group(), fx = Math.sin(head), fz = Math.cos(head), rx = -fz, rz = fx;
    const P = (a, o) => [c[0] + fx * a + rx * o, c[1] + fz * a + rz * o];
    const parts = [], frame = '#3b4046';
    for (const a of [-1.8, 1.8]) for (const o of [-0.7, 0.7]) parts.push({ box: [0.07, 2.35, 0.07], at: P(a, o), y0: y, col: frame });
    parts.push({ box: [3.9, 0.12, 1.75], at: P(0, 0.05), y0: y + 2.35, col: frame });
    parts.push({ box: [3.9, 0.04, 1.6], at: P(0, 0.05), y0: y + 2.47, col: '#8f9aa1' });
    parts.push({ box: [2.4, 0.06, 0.42], at: P(0, 0.42), y0: y + 0.45, col: '#7a5236' });       // Sitzfläche
    for (const a of [-1.0, 1.0]) parts.push({ box: [0.06, 0.45, 0.35], at: P(a, 0.42), y0: y, col: frame });
    parts.push({ box: [1.05, 1.75, 0.04], at: P(-2.35, 0.75), y0: y + 0.35, col: '#e0dccf' });  // Werbetafel seitlich
    const geo = this.mergeParts(parts, head);
    const m = new THREE.Mesh(geo, this.mats.solid); m.castShadow = true; m.receiveShadow = true; g.add(m);
    // Glas: Rückwand und Seiten
    const glassParts = [{ box: [3.6, 1.95, 0.03], at: P(0, 0.72), y0: y + 0.25, col: '#ffffff' }];
    for (const a of [-1.8, 1.8]) glassParts.push({ box: [0.03, 1.95, 1.3], at: P(a, 0.05), y0: y + 0.25, col: '#ffffff' });
    const gg = this.mergeParts(glassParts, head);
    const gm = new THREE.Mesh(gg, this.mats.glass); gm.renderOrder = 2; g.add(gm);
    return g;
  }
  // Haltestellenschild: gelber Kreis mit grünem Rand und grünem H, darunter weißes Namensschild
  signMat(name) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 392;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 262, 256, 130);
    c.strokeStyle = '#0a7a3c'; c.lineWidth = 6; c.strokeRect(3, 265, 250, 124);
    c.beginPath(); c.arc(128, 128, 122, 0, 7); c.fillStyle = '#0a7a3c'; c.fill();
    c.beginPath(); c.arc(128, 128, 104, 0, 7); c.fillStyle = '#ffd400'; c.fill();
    c.fillStyle = '#0a7a3c'; c.font = 'bold 150px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 136);
    c.fillStyle = '#111'; let fs = 40;
    c.font = `bold ${fs}px Arial, sans-serif`;
    const words = name.split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > 230 && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    while (lines.length > 2) lines.splice(1, 2, lines[1] + ' ' + lines[2]);
    if (lines.some(l => c.measureText(l).width > 236)) { fs = 30; c.font = `bold ${fs}px Arial, sans-serif`; }
    lines.forEach((l, i) => c.fillText(l, 128, 327 + (i - (lines.length - 1) / 2) * (fs + 4), 236));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.FrontSide });
    m.userData.own = true;
    return m;
  }

  // ---------- Kollision ----------
  // Kreis (x, z, r) aus allen Bussen schieben; gibt true zurück, wenn etwas getroffen wurde. out.x/out.z werden gesetzt
  push(o, r) {
    let hit = false;
    for (const b of this.buses) {
      const car = b.car;
      if (!car || Math.abs((o.y || car.y) - car.y) > 3) continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading), dx = o.x - car.x, dz = o.z - car.z;
      const a = dx * fx + dz * fz, s = dx * fz - dz * fx;   // entlang, quer
      const ha = BUS.half[0] + r, hs = BUS.half[1] + r;
      if (Math.abs(a) >= ha || Math.abs(s) >= hs) continue;
      // an der nächsten Seite hinaus
      const pa = ha - Math.abs(a), ps = hs - Math.abs(s);
      if (pa < ps) { const k = Math.sign(a) * pa; o.x += fx * k; o.z += fz * k; }
      else { const k = Math.sign(s) * ps; o.x += fz * k; o.z -= fx * k; }
      hit = true;
    }
    return hit;
  }
  // Hindernis-Punkte für den Verkehr (Mitte, vorn, hinten), damit Autos hinter dem langen Bus halten
  obstacles() {
    const out = [];
    for (const b of this.buses) {
      const car = b.car;
      if (!car) continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      out.push({ x: car.x, z: car.z, vx: car.vx, vz: car.vz }, { x: car.x - fx * 4.2, z: car.z - fz * 4.2 }, { x: car.x + fx * 4.2, z: car.z + fz * 4.2 });
    }
    return out;
  }
  cars() { return this.buses.filter(b => b.car).map(b => b.car); }
}
if (typeof window !== 'undefined') window.BusSystem = BusSystem;
