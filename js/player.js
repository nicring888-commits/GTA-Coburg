// Spielfigur zu Fuß: einfache Figur mit Lauf-Animation, Springen und Kollision.
// Mit anderem Aussehen auch für Polizisten benutzt.
'use strict';

const WALK = { speed: 4.2, run: 8.5, jump: 5.6, gravity: 18, radius: 0.38 };

class Player {
  constructor(scene, look = {}) {
    const g = new THREE.Group();
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    const skin = mat(look.skin || '#e0b08e'), shirt = mat(look.shirt || '#2f6db5'), pants = mat(look.pants || '#2c2f38'),
      shoe = mat('#1d1d1d'), hair = mat(look.hair || '#4a3020');
    const box = (w, h, d, m, x, y, z, parent) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z); b.castShadow = true; (parent || g).add(b); return b;
    };
    // Gliedmaßen hängen an Gelenken, damit sie schwingen können
    const joint = (x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); g.add(j); return j; };
    this.legL = joint(0.13, 0.92, 0); this.legR = joint(-0.13, 0.92, 0);
    box(0.2, 0.86, 0.24, pants, 0, -0.43, 0, this.legL); box(0.2, 0.86, 0.24, pants, 0, -0.43, 0, this.legR);
    box(0.22, 0.1, 0.32, shoe, 0, -0.88, 0.05, this.legL); box(0.22, 0.1, 0.32, shoe, 0, -0.88, 0.05, this.legR);
    box(0.5, 0.62, 0.28, shirt, 0, 1.23, 0);
    this.armL = joint(0.33, 1.5, 0); this.armR = joint(-0.33, 1.5, 0);
    box(0.15, 0.6, 0.17, shirt, 0, -0.27, 0, this.armL); box(0.15, 0.6, 0.17, shirt, 0, -0.27, 0, this.armR);
    box(0.13, 0.14, 0.14, skin, 0, -0.62, 0, this.armL); box(0.13, 0.14, 0.14, skin, 0, -0.62, 0, this.armR);
    box(0.32, 0.34, 0.32, skin, 0, 1.73, 0);
    box(0.34, 0.1, 0.34, hair, 0, 1.92, -0.01);
    box(0.34, 0.2, 0.08, hair, 0, 1.8, -0.15);
    if (look.cap) { box(0.38, 0.12, 0.38, mat(look.cap), 0, 1.95, 0); box(0.36, 0.04, 0.16, mat('#111'), 0, 1.9, 0.22); }
    this.group = g;
    this.mats = { shirt, pants };
    this.health = 100;
    scene.add(g);
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
    this.heading = 0; this.walkPhase = 0; this.onGround = true; this.moveSpeed = 0;
    this._col = {};
  }

  set visible(v) { this.group.visible = v; }

  // Kleidung wechseln (z. B. nach dem Einkauf im Modegeschäft)
  setOutfit(o) {
    if (o && o.shirt) this.mats.shirt.color.set(o.shirt);
    if (o && o.pants) this.mats.pants.color.set(o.pants);
  }

  place(x, z, world) {
    this.x = x; this.z = z; this.y = world.groundAt ? world.groundAt(x, z, Infinity) : world.heightAt(x, z); this.vy = 0;
    this.sync();
  }

  // move: Richtung in Weltkoordinaten (Länge 0..1), run, jump
  update(dt, move, world, cars) {
    const ml = Math.hypot(move.x, move.z);
    const target = ml > 0.01 ? (move.run ? (this.runSpeed || WALK.run) : WALK.speed) : 0;
    this.moveSpeed = U.damp(this.moveSpeed, target, 10, dt);
    if (ml > 0.01) {
      const want = Math.atan2(move.x, move.z);
      this.heading += U.wrapAngle(want - this.heading) * (1 - Math.exp(-12 * dt));
    }
    const dirX = ml > 0.01 ? move.x / ml : Math.sin(this.heading), dirZ = ml > 0.01 ? move.z / ml : Math.cos(this.heading);
    const sp = this.moveSpeed;
    const steps = Math.max(1, Math.ceil(sp * dt / 0.25));
    for (let s = 0; s < steps; s++) {
      this.x += dirX * sp * dt / steps; this.z += dirZ * sp * dt / steps;
      const r = world.collideCircle(this.x, this.z, WALK.radius, this._col);
      this.x = r.x; this.z = r.z;
      for (const c of cars) this.pushFromCar(c);
    }
    const ground = world.groundAt ? world.groundAt(this.x, this.z, this.y) : world.heightAt(this.x, this.z);
    if (move.jump && this.onGround) { this.vy = WALK.jump; this.onGround = false; }
    this.vy -= WALK.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= ground) {
      // kleine Stufen hinauf glätten
      this.y = this.onGround ? U.damp(this.y, ground, 25, dt) : ground;
      if (this.y < ground) this.y = ground;
      this.vy = 0; this.onGround = true;
    } else if (this.onGround && this.y - ground < 0.4) {
      this.y = ground; this.vy = 0; // bergab am Boden bleiben
    } else this.onGround = false;

    this.walkPhase += dt * sp * 2.2;
    this.sync();
  }

  pushFromCar(c) {
    const dx = this.x - c.x, dz = this.z - c.z;
    if (dx * dx + dz * dz > 16) return;
    // Auto als Rechteck in lokalen Koordinaten
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const lf = dx * fx + dz * fz, ll = dx * fz - dz * fx;
    const hl = CAR.length / 2 + WALK.radius, hw = CAR.width / 2 + WALK.radius;
    if (Math.abs(lf) < hl && Math.abs(ll) < hw) {
      const pf = hl - Math.abs(lf), pl = hw - Math.abs(ll);
      if (pf < pl) { const s = Math.sign(lf) * pf; this.x += fx * s; this.z += fz * s; }
      else { const s = Math.sign(ll) * pl; this.x += fz * s; this.z += -fx * s; }
    }
  }

  sync() {
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.y = this.heading;
    const sw = Math.sin(this.walkPhase) * Math.min(1, this.moveSpeed / 4) * 0.75;
    const air = this.onGround ? 0 : 0.5;
    this.legL.rotation.x = sw - air; this.legR.rotation.x = -sw + air * 0.3;
    this.armL.rotation.x = -sw * 0.9; this.armR.rotation.x = sw * 0.9;
    g.position.y += Math.abs(Math.cos(this.walkPhase)) * 0.05 * Math.min(1, this.moveSpeed / 4);
  }
}
