// Mehr Leben in der Stadt: ein grauhaariger Pfandsammler, der auf dem Marktplatz von Mülleimer zu Mülleimer eilt,
// und Kinder auf den Schulhöfen (Fußball, Fangen, Grüppchen, Tischtennis, eine Aufsicht). Alle Figuren werden
// über die Fußgänger-Instanzen gezeichnet (peds.sitters), bewegt werden sie hier. Nachts sind die Schulhöfe leer.
'use strict';

const LIFE = {
  collectorSpeed: 2.6,   // m/s: schneller als Spaziergänger (1,1–1,6), langsamer als Rennende (5,2) und der Spieler (4,2)
  kidRun: [2.4, 3.6],
  activeRange: 260,      // nur in der Nähe des Spielers bewegen
};
// Schulen mit Pausenhof (Spielkoordinaten der Schule aus OSM); ohne Hofpolygon wird die freie Fläche daneben gesucht
const SCHOOLS = [
  { name: 'Gymnasium Albertinum', x: 25, z: 240 },
  { name: 'Rückert-Mittelschule', x: -300, z: -205 },
  { name: 'Lutherschule', x: -123, z: 214 },
  { name: 'Heiligkreuz-Mittelschule', x: -205, z: -877 },
  { name: 'Berufsschule', x: -622, z: 129 },
  { name: 'Regiomontanus-Fachoberschule', x: -626, z: 14 },
];

class TownLife {
  constructor(world, scene, peds, props, ui) {
    this.world = world; this.scene = scene; this.peds = peds; this.props = props; this.ui = ui;
    this.rnd = U.rng(77);
    this.night = false;
    this.binMat = new THREE.MeshLambertMaterial({ color: '#2f4a36' });
    this.buildCollector();
    this.yards = [];
    for (const s of SCHOOLS) this.buildYard(s);
  }

  // Figur im Stil der Fußgänger
  figure(o) {
    const C = c => new THREE.Color(c);
    const p = Object.assign({ y: 0, heading: 0, state: 'stand', phase: this.rnd() * 6, moving: 0, scale: 1 }, o);
    p.shirt = C(o.shirt); p.pants = C(o.pants); p.skin = C(o.skin || '#e0b08e'); p.hair = C(o.hair || '#4a3020');
    p.y = this.world.heightAt(p.x, p.z);
    return p;
  }

  // ---------- Pfandsammler ----------
  buildCollector() {
    const W = this.world, st = this.props.statue || { x: 5, z: 12 };
    // Mülleimer: die vorhandenen in der Nähe des Markts und vier zusätzliche am Platzrand
    this.bins = (this.props.items.bin || []).filter(b => Math.hypot(b.x - st.x, b.z - st.z) < 75).map(b => ({ x: b.x, z: b.z }));
    const g = new THREE.CylinderGeometry(0.26, 0.22, 0.95, 10); g.translate(0, 0.48, 0);
    for (let a = 0.4; a < Math.PI * 2; a += Math.PI / 2) {
      for (const r of [24, 19, 28, 14]) {
        const x = st.x + Math.cos(a) * r, z = st.z + Math.sin(a) * r;
        if (!this.props.free(x, z, 1.2) || this.bins.some(b => Math.hypot(b.x - x, b.z - z) < 8)) continue;
        const m = new THREE.Mesh(g, this.binMat);
        m.position.set(x, W.heightAt(x, z), z); m.castShadow = true;
        this.scene.add(m);
        this.props.solid(x, z, 0.25);
        this.bins.push({ x, z });
        break;
      }
    }
    if (this.bins.length < 2) return;
    const b0 = this.bins[0];
    const c = this.figure({ x: b0.x + 1, z: b0.z + 1, shirt: '#5b5f4e', pants: '#4a4238', skin: '#e3b897', hair: '#c9c9c4', scale: 0.98 });
    c.target = 1; c.wait = 0; c.bottles = 0;
    this.collector = c;
    this.peds.sitters.push(c);
    // Tragetasche mit Flaschen in der rechten Hand
    const bag = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.16), new THREE.MeshLambertMaterial({ color: '#2b5aa8' }));
    bm.position.y = -0.2; bm.castShadow = true; bag.add(bm);
    for (let i = 0; i < 3; i++) {
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 6), new THREE.MeshLambertMaterial({ color: ['#3c7a3a', '#8a5a2a', '#cfe3ea'][i] }));
      bt.position.set(-0.1 + i * 0.1, 0.02, 0); bag.add(bt);
    }
    this.bag = bag;
    this.scene.add(bag);
  }

  updateCollector(dt) {
    const c = this.collector;
    if (!c) return;
    const b = this.bins[c.target];
    const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
    if (c.wait > 0) { // im Mülleimer kramen
      c.wait -= dt; c.moving = 0;
      if (c.wait <= 0) {
        if (this.rnd() < 0.6) c.bottles++;
        let n = c.target;
        while (n === c.target) n = Math.floor(this.rnd() * this.bins.length);
        c.target = n;
      }
    } else if (d < 0.75) {
      c.wait = 2.5 + this.rnd() * 3;
      c.heading = Math.atan2(dx, dz);
    } else {
      const sp = LIFE.collectorSpeed;
      let x = c.x + dx / d * sp * dt, z = c.z + dz / d * sp * dt;
      const r = this.world.collideCircle(x, z, 0.35, {});
      c.x = r.x; c.z = r.z;
      c.heading += U.wrapAngle(Math.atan2(dx, dz) - c.heading) * Math.min(1, dt * 8);
      c.phase += dt * sp * 2.4; c.moving = sp;
    }
    c.y = this.world.heightAt(c.x, c.z);
    // Tasche an der rechten Hand, schwingt beim Laufen mit
    const sw = Math.sin(c.phase) * 0.6 * Math.min(1, c.moving / 1.6);
    const hx = -0.36, fx = Math.cos(c.heading), fz = -Math.sin(c.heading), ax = Math.sin(c.heading), az = Math.cos(c.heading);
    const fwd = Math.sin(sw) * 0.25;
    this.bag.position.set(c.x + fx * hx + ax * fwd, c.y + 0.85, c.z + fz * hx + az * fwd);
    this.bag.rotation.y = c.heading;
  }

  // ---------- Schulhöfe ----------
  // freie Fläche: Rasterpunkte (2 m) ohne Haus und Fahrbahn im Umkreis der Schule, größte zusammenhängende Fläche
  yardCells(s) {
    const W = this.world, S = 2, R = 56; // R durch S teilbar, damit die Rasterindizes ganzzahlig sind
    const poly = W.data.areas.find(a => a.k === 'yard' && U.pointInPoly(s.x, s.z, a.p)) ||
      W.data.areas.filter(a => a.k === 'yard').find(a => { const bb = U.polyBBox(a.p); return s.x > bb.minX - 30 && s.x < bb.maxX + 30 && s.z > bb.minZ - 30 && s.z < bb.maxZ + 30; });
    const free = new Map();
    const key = (i, j) => i + ',' + j;
    for (let i = -R / S; i <= R / S; i++) for (let j = -R / S; j <= R / S; j++) {
      const x = s.x + i * S, z = s.z + j * S;
      if (poly && !U.pointInPoly(x, z, poly.p)) continue;
      if (W.insideBuilding(x, z, 1.2)) continue;
      const rd = W.nearestRoad(x, z, 4, q => q.k === 'road' && q.h !== 'service');
      if (rd) continue;
      if (W.collideCircle(x, z, 0.8, {}).hit) continue;
      free.set(key(i, j), [x, z]);
    }
    // größte zusammenhängende freie Fläche (Flutfüllung über alle Teilflächen)
    const done = new Set();
    let seen = null;
    for (const start of free.keys()) {
      if (done.has(start)) continue;
      const part = new Set([start]), queue = [start];
      done.add(start);
      while (queue.length) {
        const [i, j] = queue.pop().split(',').map(Number);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = key(i + di, j + dj);
          if (free.has(k) && !done.has(k)) { done.add(k); part.add(k); queue.push(k); }
        }
      }
      if (!seen || part.size > seen.size) seen = part;
    }
    if (!seen) return null;
    // auf den Teil nahe der Schule begrenzen (höchstens 30 m um den Punkt, der der Schule am nächsten liegt)
    let anchor = null, ad = 1e9;
    for (const k of seen) { const [x, z] = free.get(k); const d = Math.hypot(x - s.x, z - s.z); if (d < ad) { ad = d; anchor = free.get(k); } }
    for (const k of [...seen]) { const [x, z] = free.get(k); if (Math.hypot(x - anchor[0], z - anchor[1]) > 30) seen.delete(k); }
    const cells = [...seen].map(k => free.get(k));
    return { cells, set: seen, key, S, ox: s.x, oz: s.z };
  }

  buildYard(s) {
    const Y = this.yardCells(s);
    if (!Y || Y.cells.length < 40) return; // unter ≈ 160 m² kein Hof
    const R = this.rnd, cells = Y.cells;
    let cx = 0, cz = 0;
    for (const [x, z] of cells) { cx += x; cz += z; }
    cx /= cells.length; cz /= cells.length;
    const yard = { name: s.name, cx, cz, Y, kids: [], ball: null, pong: null, active: false };
    const pick = () => cells[Math.floor(R() * cells.length)];
    const inside = (x, z) => Y.set.has(Y.key(Math.round((x - Y.ox) / Y.S), Math.round((z - Y.oz) / Y.S)));
    yard.inside = inside; yard.pick = pick;
    const kid = (x, z, role) => {
      const k = this.figure({ x, z, role, shirt: PED_SHIRTS[Math.floor(R() * PED_SHIRTS.length)], pants: PED_PANTS[Math.floor(R() * PED_PANTS.length)],
        skin: PED_SKIN[Math.floor(R() * PED_SKIN.length)], hair: PED_HAIR[Math.floor(R() * 5)], scale: 0.66 + R() * 0.14 });
      k.speed = LIFE.kidRun[0] + R() * (LIFE.kidRun[1] - LIFE.kidRun[0]); k.wait = R() * 2; k.tx = x; k.tz = z;
      yard.kids.push(k);
      return k;
    };
    // Grüppchen, die beieinander stehen und reden
    const groups = Math.min(3, 1 + Math.floor(cells.length / 120));
    for (let g = 0; g < groups; g++) {
      const [gx, gz] = pick(), n = 3 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, x = gx + Math.cos(a) * 0.8, z = gz + Math.sin(a) * 0.8;
        if (!inside(x, z)) continue;
        const k = kid(x, z, 'chat'); k.heading = Math.atan2(gx - x, gz - z);
      }
    }
    // Fangen spielen
    for (let i = 0; i < 4 + Math.floor(cells.length / 150); i++) { const [x, z] = pick(); kid(x, z, 'tag'); }
    // Fußball auf größeren Höfen
    if (cells.length >= 110) {
      const [bx, bz] = pick();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshLambertMaterial({ color: '#f4f4f0' }));
      ball.castShadow = true; this.scene.add(ball);
      yard.ball = { x: bx, z: bz, vx: 0, vz: 0, mesh: ball };
      for (let i = 0; i < 6; i++) { const [x, z] = pick(); kid(x, z, 'ball'); }
    }
    // Tischtennisplatte mit zwei Spielern
    const spot = cells.find(([x, z]) => [[-2, 0], [2, 0], [-2.6, 0], [2.6, 0], [0, 1.2], [0, -1.2]].every(([dx, dz]) => inside(x + dx, z + dz)) &&
      Math.hypot(x - cx, z - cz) > 6);
    if (spot) {
      const [tx, tz] = spot, y = this.world.heightAt(tx, tz);
      const T = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.06, 1.52), new THREE.MeshLambertMaterial({ color: '#2f6a4a' }));
      top.position.y = 0.73; top.castShadow = true; T.add(top);
      const net = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 1.6), new THREE.MeshLambertMaterial({ color: '#e8e8e8' }));
      net.position.y = 0.83; T.add(net);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 1.2), new THREE.MeshLambertMaterial({ color: '#5a5f66' }));
      leg.position.set(0, 0.35, 0); T.add(leg);
      T.position.set(tx, y, tz); this.scene.add(T);
      this.props.solid(tx - 0.9, tz, 0.8); this.props.solid(tx + 0.9, tz, 0.8);
      const a = kid(tx - 2.0, tz, 'pong'), b = kid(tx + 2.0, tz, 'pong');
      a.heading = Math.PI / 2; b.heading = -Math.PI / 2;
      const pb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff9a2e' }));
      this.scene.add(pb);
      yard.pong = { x: tx, z: tz, y, t: 0, mesh: pb, players: [a, b] };
    }
    // Aufsicht am Rand
    const edge = cells.reduce((m, c) => Math.hypot(c[0] - cx, c[1] - cz) > Math.hypot(m[0] - cx, m[1] - cz) ? c : m, cells[0]);
    const t = this.figure({ x: edge[0], z: edge[1], role: 'teacher', shirt: '#7a6a5a', pants: '#2c2f38', hair: '#5a4632', scale: 1.02 });
    t.heading = Math.atan2(cx - edge[0], cz - edge[1]);
    yard.kids.push(t);
    yard.label = makeLabel(s.name, '#8fd3ff', 'Pause auf dem Schulhof');
    yard.label.position.set(cx, this.world.heightAt(cx, cz) + 6, cz);
    yard.label.userData.range = 80;
    this.ui.addLabel(yard.label, this.scene);
    this.yards.push(yard);
    this.showYard(yard, true);
  }

  // Kinder zeichnen lassen oder (nachts) verstecken
  showYard(yard, on) {
    const S = this.peds.sitters;
    for (const k of yard.kids) {
      const i = S.indexOf(k);
      if (on && i < 0) S.push(k);
      if (!on && i >= 0) S.splice(i, 1);
    }
    if (yard.ball) yard.ball.mesh.visible = on;
    if (yard.pong) yard.pong.mesh.visible = on;
  }

  updateYard(y, dt) {
    const R = this.rnd, ball = y.ball;
    // Ball rollt, prallt am Hofrand ab
    if (ball) {
      let nx = ball.x + ball.vx * dt, nz = ball.z + ball.vz * dt;
      if (!y.inside(nx, nz) || this.world.collideCircle(nx, nz, 0.15, {}).hit) { ball.vx *= -0.6; ball.vz *= -0.6; nx = ball.x; nz = ball.z; }
      ball.x = nx; ball.z = nz;
      const f = Math.exp(-1.4 * dt); ball.vx *= f; ball.vz *= f;
      ball.mesh.position.set(ball.x, this.world.heightAt(ball.x, ball.z) + 0.12, ball.z);
      ball.mesh.rotation.x += ball.vz * dt * 8; ball.mesh.rotation.z -= ball.vx * dt * 8;
    }
    // die zwei, die am nächsten am Ball sind, rennen hin
    let chasers = [];
    if (ball) chasers = y.kids.filter(k => k.role === 'ball').sort((a, b) => Math.hypot(a.x - ball.x, a.z - ball.z) - Math.hypot(b.x - ball.x, b.z - ball.z)).slice(0, 2);
    for (const k of y.kids) {
      let tx = k.x, tz = k.z, sp = 0;
      if (k.role === 'tag') {
        if (k.wait > 0) k.wait -= dt;
        else {
          if (Math.hypot(k.tx - k.x, k.tz - k.z) < 0.5) { const [x, z] = y.pick(); k.tx = x; k.tz = z; k.wait = R() < 0.4 ? 0.4 + R() * 1.5 : 0; }
          tx = k.tx; tz = k.tz; sp = k.speed;
        }
      } else if (k.role === 'ball' && ball) {
        if (chasers.includes(k)) {
          tx = ball.x; tz = ball.z; sp = k.speed;
          if (Math.hypot(ball.x - k.x, ball.z - k.z) < 0.55 && Math.hypot(ball.vx, ball.vz) < 3) { // schießen
            const [gx, gz] = y.pick(), d = Math.hypot(gx - ball.x, gz - ball.z) || 1, v = 5 + R() * 4;
            ball.vx = (gx - ball.x) / d * v; ball.vz = (gz - ball.z) / d * v;
          }
        } else { // mitlaufen, mit etwas Abstand zum Ball
          const a = (y.kids.indexOf(k) * 1.7) % 6.28;
          tx = ball.x + Math.cos(a) * 4; tz = ball.z + Math.sin(a) * 4;
          if (!y.inside(tx, tz)) { tx = k.x; tz = k.z; }
          sp = k.speed * 0.6;
        }
      } else if (k.role === 'chat' || k.role === 'teacher') {
        k.phase += dt * 0.5; k.moving = 0;
      }
      const dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
      if (sp > 0 && d > 0.3) {
        const st = Math.min(d, sp * dt);
        const r = this.world.collideCircle(k.x + dx / d * st, k.z + dz / d * st, 0.25, {});
        if (y.inside(r.x, r.z)) { k.x = r.x; k.z = r.z; }
        else { const [x, z] = y.pick(); k.tx = x; k.tz = z; }
        k.heading += U.wrapAngle(Math.atan2(dx, dz) - k.heading) * Math.min(1, dt * 10);
        k.phase += dt * sp * 2.8; k.moving = sp;
      } else if (k.role !== 'chat' && k.role !== 'teacher' && k.role !== 'pong') k.moving = 0;
      k.y = this.world.heightAt(k.x, k.z);
    }
    // Tischtennis: Ball fliegt im Bogen hin und her, die Spieler wippen mit
    const P = y.pong;
    if (P) {
      P.t += dt * 0.9;
      const u = P.t % 2, s = u < 1 ? u : 2 - u, x = P.x - 1.3 + s * 2.6;
      P.mesh.position.set(x, P.y + 0.8 + Math.sin(s * Math.PI * 2) * 0.12 + Math.abs(Math.sin(s * Math.PI)) * 0.25, P.z + Math.sin(P.t * 2.3) * 0.4);
      for (const k of P.players) { k.phase += dt * 3; k.moving = 0.8; }
    }
  }

  setNight(n) {
    this.night = n;
    for (const y of this.yards) this.showYard(y, !n);
  }

  update(dt, px, pz) {
    if (this.collector && Math.abs(this.collector.x - px) < LIFE.activeRange && Math.abs(this.collector.z - pz) < LIFE.activeRange) this.updateCollector(dt);
    if (this.night) return;
    for (const y of this.yards) if (Math.abs(y.cx - px) < LIFE.activeRange && Math.abs(y.cz - pz) < LIFE.activeRange) this.updateYard(y, dt);
  }
}
