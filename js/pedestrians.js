// Fußgänger: laufen über Fußwege, Gehsteige und vor allem durch die Fußgängerzone, bleiben stehen, gehen zu
// zweit, sitzen in Cafés, springen vor rasenden Autos zur Seite, fliehen bei Explosionen und können
// angefahren werden. Gezeichnet werden alle mit wenigen InstancedMeshes (fünf Zeichenaufrufe für alle Figuren).
'use strict';

const PEDS = {
  max: 150,          // laufende Fußgänger gleichzeitig
  maxDrawn: 330,     // inkl. sitzender Café-Gäste, Schulkinder und Pfandsammler
  spawnMin: 35, spawnMax: 170, despawn: 210,
  walk: [1.1, 1.6], run: 5.2,
  // Wie gern auf welchem Weg gelaufen wird (Fußgängerzone am liebsten)
  weight: { 'plaza:pedestrian': 1, 'road:living_street': 0.7, 'foot:footway': 0.35, 'foot:platform': 0.5, 'road:residential': 0.25,
    'road:tertiary': 0.3, 'road:secondary': 0.3, 'road:primary': 0.3, 'road:unclassified': 0.15, 'path:path': 0.12, 'steps:steps': 0.12, 'road:service': 0.06 },
};
const PED_SHIRTS = ['#2f6db5', '#b83b3b', '#e7e3d8', '#2d2d2d', '#5a8f4e', '#d9a13b', '#7a4fa0', '#c96a8a', '#3f8f9c', '#8a6a4a', '#f0f0f0', '#1f3f6f', '#a33a2a', '#6b6b6b'];
const PED_PANTS = ['#2c2f38', '#1f2b44', '#3b3b3b', '#5c4a3a', '#2a3a5a', '#7a7066', '#161616', '#4a5a7a'];
const PED_SKIN = ['#f1c9a5', '#e0b08e', '#c68e6a', '#a0694a', '#7a4a32', '#f5d5bb'];
const PED_HAIR = ['#2a1d14', '#4a3020', '#6b4a2a', '#c8a050', '#1a1a1a', '#8a8a8a', '#a0522d', '#d8d0c0'];

class Pedestrians {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.list = [];       // laufende Fußgänger
    this.sitters = [];    // sitzende Gäste (fest)
    this.rnd = Math.random;
    this.buildGraph();
    this.buildMeshes();
    this.spawnT = 0; this.threatT = 0;
    this._m = new THREE.Matrix4(); this._b = new THREE.Matrix4(); this._p = new THREE.Matrix4(); this._c = new THREE.Color();
  }

  // Wegenetz aus den Straßenstücken der Welt: Knoten = gemeinsame Endpunkte (auf 0,5 m gerundet)
  buildGraph(extra) {
    if (!this.coreSegs) {
      const set = new Set();
      for (const arr of this.world.roadGrid.map.values()) for (const s of arr) set.add(s);
      this.coreSegs = [...set];
    }
    const segs = extra && extra.length ? this.coreSegs.concat(extra) : this.coreSegs;
    this.segs = [];
    this.nodes = new Map();
    const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    for (const s of segs) {
      const w = PEDS.weight[s.k + ':' + s.h];
      if (!w) continue;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      if (len < 0.3) continue;
      const e = { s, w, len, ka: key(s.ax, s.az), kb: key(s.bx, s.bz), road: s.k === 'road', wide: s.k === 'plaza' };
      this.segs.push(e);
      for (const k of [e.ka, e.kb]) { if (!this.nodes.has(k)) this.nodes.set(k, []); this.nodes.get(k).push(e); }
    }
    this.plazaSegs = this.segs.filter(e => e.wide);
    this.segGrid = new U.Grid(20);
    for (const e of this.segs) this.segGrid.insert(e, Math.min(e.s.ax, e.s.bx), Math.min(e.s.az, e.s.bz), Math.max(e.s.ax, e.s.bx), Math.max(e.s.az, e.s.bz));
    this._q = [];
  }

  // Gehwege der Orte im Landkreis dazunehmen (js/region.js); Fußgänger auf weggefallenen Wegen verschwinden
  setExtra(extra) {
    this.buildGraph(extra);
    const alive = new Set(this.segs);
    this.list = this.list.filter(p => alive.has(p.e));
    for (const p of this.list) if (p.buddy && !this.list.includes(p.buddy)) p.buddy = null;
  }

  buildMeshes() {
    // abgerundete Körperteile (U.figParts) mit Schuhen, Hals, Nase und Haaransatz; Farbe je Figur als Instanzfarbe
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
    const F = U.figParts();
    const mk = (g0, n, dy = 0) => {
      const g = g0.clone(); if (dy) g.translate(0, dy, 0);
      const m = new THREE.InstancedMesh(g, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color()); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true; m.count = 0; m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    const N = PEDS.maxDrawn;
    this.mLegs = mk(F.leg, N * 2, -0.43);
    this.mArms = mk(F.arm, N * 2, -0.29);
    this.mTorso = mk(F.torso, N);
    this.mHead = mk(F.head, N);
    this.mHair = mk(F.hair, N);
  }

  look(o) {
    const r = this.rnd, pick = a => a[Math.floor(r() * a.length)];
    o.shirt = new THREE.Color(pick(PED_SHIRTS)); o.pants = new THREE.Color(pick(PED_PANTS));
    o.skin = new THREE.Color(pick(PED_SKIN)); o.hair = new THREE.Color(r() < 0.15 ? o.shirt : pick(PED_HAIR));
    o.scale = r() < 0.08 ? 0.68 + r() * 0.1 : 0.9 + r() * 0.17; // ein paar Kinder
    return o;
  }

  // Punkt auf dem Weg: Abstand t entlang (0..len), seitlicher Versatz lat rechts der Laufrichtung
  pos(p, out) {
    const s = p.e.s;
    let ax = s.ax, az = s.az, bx = s.bx, bz = s.bz;
    if (p.dir < 0) { [ax, bx] = [bx, ax]; [az, bz] = [bz, az]; }
    const dx = (bx - ax) / p.e.len, dz = (bz - az) / p.e.len;
    out.x = ax + dx * p.t - dz * p.lat; out.z = az + dz * p.t + dx * p.lat;
    out.dx = dx; out.dz = dz;
    return out;
  }

  // seitlicher Versatz passend zum Weg (Gehsteig neben der Fahrbahn, verteilt in der Fußgängerzone)
  pickLat(p) {
    const e = p.e, w = e.s.w || 2;
    let lat;
    if (e.road) lat = w / 2 + 0.9 + this.rnd() * 0.7;
    else if (e.wide) lat = (this.rnd() * 2 - 1) * Math.max(0.3, w / 2 - 1);
    else lat = (this.rnd() - 0.3) * 0.6;
    if (p.buddy) lat = p.buddy.latT - 0.65;
    // nicht in eine Hauswand
    const q = this.pos({ e, dir: p.dir, t: e.len / 2, lat }, {});
    if (this.world.insideBuilding(q.x, q.z, 0)) lat *= 0.3;
    p.latT = lat;
  }

  spawnAt(e, t, dir, buddy) {
    const p = this.look({ e, t, dir, lat: 0, latT: 0, speed: PEDS.walk[0] + this.rnd() * (PEDS.walk[1] - PEDS.walk[0]),
      state: 'walk', timer: 0, phase: this.rnd() * 6, x: 0, z: 0, y: 0, heading: 0, buddy: buddy || null, vx: 0, vz: 0 });
    if (buddy) { p.speed = buddy.speed; p.dir = buddy.dir; p.t = Math.max(0, buddy.t - 0.3); }
    this.pickLat(p); p.lat = p.latT;
    const q = this.pos(p, {});
    p.x = q.x; p.z = q.z; p.y = this.world.heightAt(q.x, q.z); p.heading = Math.atan2(q.dx, q.dz);
    this.list.push(p);
    return p;
  }

  spawn(px, pz) {
    // jeder zweite Versuch gezielt in die Fußgängerzone (falls in der Nähe), damit es dort voll wird
    if (this.rnd() < 0.55) {
      const near = this.segGrid.query(px, pz, PEDS.spawnMax, this._q).filter(e => e.wide);
      if (near.length) {
        const e = near[Math.floor(this.rnd() * near.length)];
        const mx = (e.s.ax + e.s.bx) / 2, mz = (e.s.az + e.s.bz) / 2, d = Math.hypot(mx - px, mz - pz);
        if (d > 25 && d < PEDS.spawnMax) {
          const p = this.spawnAt(e, this.rnd() * e.len, this.rnd() < 0.5 ? 1 : -1);
          if (this.rnd() < 0.3 && this.list.length < PEDS.max) this.spawnAt(e, p.t, p.dir, p);
          return true;
        }
      }
    }
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rnd() * 6.283, d = PEDS.spawnMin + this.rnd() * (PEDS.spawnMax - PEDS.spawnMin);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      const list = this.segGrid.query(x, z, 12, this._q);
      if (!list.length) continue;
      const e = list[Math.floor(this.rnd() * list.length)];
      if (this.rnd() > e.w) continue;
      const p = this.spawnAt(e, this.rnd() * e.len, this.rnd() < 0.5 ? 1 : -1);
      if (this.rnd() < 0.28 && this.list.length < PEDS.max) this.spawnAt(e, p.t, p.dir, p); // zu zweit unterwegs
      return true;
    }
    return false;
  }

  // Café-Gast, Bankbesucher oder Kunde am Stand (fest an einem Ort; state 'sit' oder 'stand')
  addSitter(x, z, heading, state = 'sit') {
    const p = this.look({ x, z, y: this.world.heightAt(x, z), heading, state, phase: this.rnd() * 6, moving: 0 });
    p.scale = 0.92 + this.rnd() * 0.12;
    this.sitters.push(p);
  }

  // am Ende eines Wegstücks weiter
  nextSeg(p) {
    const node = p.dir > 0 ? p.e.kb : p.e.ka;
    const opts = (this.nodes.get(node) || []).filter(e => e !== p.e);
    let e;
    if (!opts.length) e = p.e;
    else {
      // gleichen Straßennamen und Wegtyp bevorzugen, damit Leute nicht ständig abbiegen
      const same = opts.filter(o => o.s.n && o.s.n === p.e.s.n);
      e = same.length && this.rnd() < 0.75 ? same[Math.floor(this.rnd() * same.length)] : opts[Math.floor(this.rnd() * opts.length)];
      if (this.rnd() > e.w * 1.5 + 0.15 && opts.length > 1) e = opts[Math.floor(this.rnd() * opts.length)];
    }
    const dir = e === p.e ? -p.dir : (e.ka === node ? 1 : -1);
    p.e = e; p.dir = dir; p.t = 0;
    if (!p.buddy) this.pickLat(p);
    else p.latT = p.buddy.latT - 0.65;
    // ab und zu stehen bleiben (Schaufenster, Unterhaltung)
    if (!p.buddy && this.rnd() < (e.wide ? 0.12 : 0.05)) { p.state = 'idle'; p.timer = 2 + this.rnd() * 6; }
  }

  // Gefahr: alle in der Nähe laufen weg (Explosion, Hupe, rasendes Auto)
  panic(x, z, r, strength = 1) {
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r) continue;
      p.state = 'flee'; p.timer = (2.5 + this.rnd() * 2.5) * strength;
      const k = d || 1; p.vx = (p.x - x) / k; p.vz = (p.z - z) / k;
      // etwas streuen, damit nicht alle in dieselbe Richtung rennen
      const a = (this.rnd() - 0.5) * 1.2, c = Math.cos(a), s = Math.sin(a);
      [p.vx, p.vz] = [p.vx * c - p.vz * s, p.vx * s + p.vz * c];
    }
  }

  // nach der Flucht wieder auf den nächsten Weg
  reattach(p) {
    const list = this.segGrid.query(p.x, p.z, 25, this._q);
    let best = null, bd = 30, bt = 0;
    for (const e of list) {
      const c = U.closestOnSeg(p.x, p.z, e.s.ax, e.s.az, e.s.bx, e.s.bz);
      const d = Math.hypot(c[0] - p.x, c[1] - p.z);
      if (d < bd) { bd = d; best = e; bt = c[2]; }
    }
    if (!best) return false;
    p.e = best; p.dir = this.rnd() < 0.5 ? 1 : -1; p.t = (p.dir > 0 ? bt : 1 - bt) * best.len;
    p.buddy = null; this.pickLat(p);
    // aktuellen Versatz aus der Position übernehmen, damit niemand springt
    const q = this.pos({ e: best, dir: p.dir, t: p.t, lat: 0 }, {});
    p.lat = (p.x - q.x) * -q.dz + (p.z - q.z) * q.dx;
    p.state = 'walk';
    return true;
  }

  // cars: Autos mit Fahrphysik (Spieler, Polizei, Rennen) – sie können umfahren;
  // rails: Verkehr auf Schienen (schiebt nur zur Seite). Gibt Liste der Unfälle zurück: [{ ped, car }]
  update(dt, px, pz, cars, rails, playerOnFoot) {
    const hits = [];
    // entfernen und auffüllen
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (Math.hypot(p.x - px, p.z - pz) > PEDS.despawn || (p.state === 'down' && p.timer > 14)) {
        this.list.splice(i, 1);
        for (const o of this.list) if (o.buddy === p) o.buddy = null;
      }
    }
    this.spawnT -= dt;
    let n = 0;
    const max = this.cap || PEDS.max; // im Landkreis weniger als in der Fußgängerzone
    while (this.list.length < max && n++ < 6 && this.spawnT <= 0) this.spawn(px, pz);
    if (this.list.length >= max) this.spawnT = 0.5;

    const tmp = this._tmpPos || (this._tmpPos = {});
    for (const p of this.list) {
      p.timer -= dt;
      if (p.state === 'down') {
        // ausrutschen bis zum Stillstand
        p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 1 - Math.min(1, dt * 3); p.vz *= 1 - Math.min(1, dt * 3);
        p.timer += 2 * dt; // zählt beim Liegen hoch (oben wird dt abgezogen), nach 14 s abräumen
        continue;
      }
      if (p.state === 'flee') {
        const sp = PEDS.run;
        let x = p.x + p.vx * sp * dt, z = p.z + p.vz * sp * dt;
        const r = this.world.collideCircle(x, z, 0.35, {});
        if (r.hit) { // an Wänden entlang abgleiten
          const dot = p.vx * r.nx + p.vz * r.nz;
          p.vx -= r.nx * dot; p.vz -= r.nz * dot;
          const l = Math.hypot(p.vx, p.vz) || 1; p.vx /= l; p.vz /= l;
        }
        p.x = r.x; p.z = r.z;
        p.heading += U.wrapAngle(Math.atan2(p.vx, p.vz) - p.heading) * Math.min(1, dt * 10);
        p.phase += dt * sp * 2.2; p.moving = sp;
        if (p.timer <= 0 && !this.reattach(p)) p.timer = 1;
      } else if (p.state === 'idle') {
        p.moving = 0;
        if (p.timer <= 0) p.state = 'walk';
      } else {
        p.t += p.speed * dt;
        if (p.t >= p.e.len) { p.t -= p.e.len; this.nextSeg(p); }
        p.lat = U.damp(p.lat, p.latT, 1.5, dt);
        const q = this.pos(p, tmp);
        const mx = q.x - p.x, mz = q.z - p.z, ml = Math.hypot(mx, mz);
        if (ml > 4) { p.x = q.x; p.z = q.z; } // Sprung über eine Kreuzung: nicht über die Straße gleiten
        else { p.x = U.damp(p.x, q.x, 6, dt); p.z = U.damp(p.z, q.z, 6, dt); }
        if (ml > 0.02) p.heading += U.wrapAngle(Math.atan2(q.dx, q.dz) - p.heading) * Math.min(1, dt * 6);
        p.phase += dt * p.speed * 2.6; p.moving = p.speed;
      }
      p.y = this.world.heightAt(p.x, p.z);
    }

    // Autos: Ausweichen, Umfahren, Wegschieben
    this.threatT -= dt;
    const look = this.threatT <= 0;
    if (look) this.threatT = 0.25;
    for (const c of cars) {
      const sp = Math.hypot(c.vx, c.vz);
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      for (const p of this.list) {
        if (p.state === 'down') continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        if (Math.abs(dx) > 16 || Math.abs(dz) > 16) continue;
        const lf = dx * fx + dz * fz, ll = dx * fz - dz * fx;
        if (Math.abs(lf) < CAR.length / 2 + 0.3 && Math.abs(ll) < CAR.width / 2 + 0.3) {
          if (sp > 4.5) {
            p.state = 'down'; p.timer = 0;
            p.vx = c.vx * 0.55 + (ll > 0 ? fz : -fz) * 1.5; p.vz = c.vz * 0.55 + (ll > 0 ? -fx : fx) * 1.5;
            p.heading = c.heading + Math.PI;
            hits.push({ ped: p, car: c, speed: sp });
          } else { // langsam: zur Seite schieben
            const s = Math.sign(ll) || 1, push = CAR.width / 2 + 0.3 - Math.abs(ll);
            p.x += fz * s * push; p.z += -fx * s * push;
          }
        } else if (look && sp > 7 && lf > 0 && lf < 6 + sp * 0.8 && Math.abs(ll) < 3 && p.state !== 'flee') {
          // Auto rast auf mich zu: zur Seite springen
          p.state = 'flee'; p.timer = 1.2 + this.rnd();
          const s = Math.sign(ll) || 1; p.vx = fz * s; p.vz = -fx * s;
        }
      }
    }
    for (const c of rails) {
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      for (const p of this.list) {
        const dx = p.x - c.x, dz = p.z - c.z;
        if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
        const lf = dx * fx + dz * fz, ll = dx * fz - dz * fx;
        if (Math.abs(lf) < CAR.length / 2 + 0.25 && Math.abs(ll) < CAR.width / 2 + 0.25) {
          const s = Math.sign(ll) || 1, push = CAR.width / 2 + 0.25 - Math.abs(ll);
          p.x += fz * s * push; p.z += -fx * s * push;
        }
      }
    }
    // Spieler zu Fuß: Platz machen
    if (playerOnFoot) {
      for (const p of this.list) {
        const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
        if (d < 0.75 && d > 0.001 && p.state !== 'down') { p.x = px + dx / d * 0.75; p.z = pz + dz / d * 0.75; }
      }
    }
    return hits;
  }

  // Anzahl in der Nähe (für Stimmengewirr)
  countNear(x, z, r) {
    let n = 0;
    for (const p of this.list) if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) n++;
    for (const p of this.sitters) if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) n++;
    return n;
  }

  // Instanzen schreiben
  draw(camX, camZ) {
    const M = this._m, B = this._b, P = this._p;
    let i = 0;
    const put = p => {
      if (i >= PEDS.maxDrawn) return;
      const s = p.scale;
      B.makeRotationY(p.heading);
      if (p.state === 'down') { P.makeRotationX(-Math.PI / 2); B.multiply(P); }
      B.scale(this._sv.set(s, s, s));
      const y = p.state === 'down' ? p.y + 0.16 : p.state === 'sit' ? p.y - 0.45 * s : p.y + Math.abs(Math.cos(p.phase)) * 0.04 * Math.min(1, (p.moving || 0) / 1.5);
      B.setPosition(p.x, y, p.z);
      const mv = Math.min(1, (p.moving || 0) / 1.6);
      const sw = p.state === 'sit' ? 0 : Math.sin(p.phase) * 0.6 * mv;
      const legRot = p.state === 'sit' ? -Math.PI / 2 : 0;
      // Beine
      for (const [k, side] of [[0, 1], [1, -1]]) {
        M.copy(B).multiply(P.makeTranslation(0.12 * side, 0.92, 0)).multiply(this._r.makeRotationX(legRot + sw * side));
        this.mLegs.setMatrixAt(i * 2 + k, M); this.mLegs.setColorAt(i * 2 + k, p.pants);
        const armSw = p.state === 'sit' ? -0.7 : -sw * side * 0.9;
        M.copy(B).multiply(P.makeTranslation(0.33 * side, 1.5, 0)).multiply(this._r.makeRotationX(armSw));
        this.mArms.setMatrixAt(i * 2 + k, M); this.mArms.setColorAt(i * 2 + k, p.shirt);
      }
      M.copy(B).multiply(P.makeTranslation(0, 1.23, 0)); this.mTorso.setMatrixAt(i, M); this.mTorso.setColorAt(i, p.shirt);
      const nod = p.state === 'sit' ? Math.sin(p.phase + performance.now() / 900) * 0.08 : 0;
      M.copy(B).multiply(P.makeTranslation(0, 1.73, 0)).multiply(this._r.makeRotationX(nod)); this.mHead.setMatrixAt(i, M); this.mHead.setColorAt(i, p.skin);
      M.multiply(P.makeTranslation(0, 0.19, 0)); this.mHair.setMatrixAt(i, M); this.mHair.setColorAt(i, p.hair);
      i++;
    };
    this._r = this._r || new THREE.Matrix4(); this._sv = this._sv || new THREE.Vector3();
    for (const p of this.list) put(p);
    for (const p of this.sitters) if (Math.abs(p.x - camX) < 220 && Math.abs(p.z - camZ) < 220) put(p);
    for (const m of [this.mLegs, this.mArms]) { m.count = i * 2; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    for (const m of [this.mTorso, this.mHead, this.mHair]) { m.count = i; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
}
