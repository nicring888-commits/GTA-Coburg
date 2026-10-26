// Spielfigur zu Fuß: einfache Figur mit Lauf-Animation, Springen und Kollision.
// Mit anderem Aussehen auch für Polizisten benutzt.
'use strict';

const WALK = { speed: 4.2, run: 8.5, jump: 5.6, gravity: 18, radius: 0.38 };

class Player {
  constructor(scene, look = {}) {
    const g = new THREE.Group();
    const mat = c => new THREE.MeshLambertMaterial({ color: c, vertexColors: true });
    const skin = mat(look.skin || '#e0b08e'), shirt = mat(look.shirt || '#2f6db5'), pants = mat(look.pants || '#2c2f38'),
      hair = mat(look.hair || '#4a3020');
    const F = U.figParts();
    const part = (geo, m, x, y, z, parent) => {
      const b = new THREE.Mesh(geo, m);
      b.position.set(x, y, z); b.castShadow = true; (parent || g).add(b); return b;
    };
    // Gliedmaßen hängen an Gelenken, damit sie schwingen können (abgerundete Teile aus U.figParts)
    const joint = (x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); g.add(j); return j; };
    this.legL = joint(0.13, 0.92, 0); this.legR = joint(-0.13, 0.92, 0);
    part(F.leg, pants, 0, -0.43, 0, this.legL); part(F.leg, pants, 0, -0.43, 0, this.legR);
    part(F.torso, shirt, 0, 1.23, 0);
    this.armL = joint(0.33, 1.5, 0); this.armR = joint(-0.33, 1.5, 0);
    this.armL.rotation.order = this.armR.rotation.order = 'YXZ'; // erst nach vorn heben, dann zur Mitte drehen (Zielen)
    part(F.arm, shirt, 0, -0.27, 0, this.armL); part(F.arm, shirt, 0, -0.27, 0, this.armR);
    part(F.head, skin, 0, 1.73, 0);
    part(F.hair, hair, 0, 1.92, 0);
    if (look.cap) {
      part(U.mergeParts([[U.roundBox(0.34, 0.13, 0.35, 0.06, 3), 0, 0, 0]]), mat(look.cap), 0, 1.95, 0);
      part(U.mergeParts([[U.roundBox(0.32, 0.03, 0.15, 0.012, 2), 0, 0, 0]]), mat('#111'), 0, 1.9, 0.22);
    }
    this.group = g;
    this.mats = { shirt, pants };
    this.health = 100;
    scene.add(g);
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
    this.heading = 0; this.walkPhase = 0; this.onGround = true; this.moveSpeed = 0;
    this._col = {};
    // Waffenhaltung (js/weapons.js): aim 0 = Arme frei, 1 = einhändig, 2 = beidhändig; pitch hebt die Arme; swing = Schlag 1 → 0
    this.pose = { aim: 0, pitch: 0, swing: 0 };
    this.weapon = null; this.gun = null;
  }

  // Waffe in die rechte Hand (Modell aus weaponModel in js/weapons.js), null = keine
  setWeapon(id) {
    if (id === this.weapon) return;
    this.weapon = id;
    if (this.gun) { this.armR.remove(this.gun); this.gun = null; }
    const m = id && typeof weaponModel === 'function' ? weaponModel(id) : null;
    if (m) { m.position.set(0, -0.56, 0.04); m.rotation.x = Math.PI / 2; this.armR.add(m); this.gun = m; }
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
    this.armL.rotation.y = this.armR.rotation.y = 0;
    const P = this.pose;
    if (P.aim) {
      this.armR.rotation.x = -Math.PI / 2 - P.pitch; this.armR.rotation.y = 0.12;
      if (P.aim === 2) { this.armL.rotation.x = -Math.PI / 2 - P.pitch + 0.15; this.armL.rotation.y = -0.62; }
    } else if (P.swing > 0) this.armR.rotation.x = -2.3 * Math.sin(P.swing * Math.PI) - 0.2;
    g.position.y += Math.abs(Math.cos(this.walkPhase)) * 0.05 * Math.min(1, this.moveSpeed / 4);
  }
}
