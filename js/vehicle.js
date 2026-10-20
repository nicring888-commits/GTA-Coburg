// Autos: Modelle aus einfachen Formen (Pkw, Sportwagen, Taxi, Polizei), Arcade-Fahrphysik mit Driften,
// Schaden bis zum Ausbrennen.
'use strict';

const CAR_COLORS = ['#c0392b', '#2e6fb7', '#e8e8e8', '#222428', '#7f8c8d', '#f1c40f', '#27ae60', '#8e44ad',
  '#d35400', '#1c3d5a', '#a3a3a3', '#5b2c2c'];
const SPORT_COLORS = ['#d61f1f', '#f2c500', '#ff6a00', '#1e88ff', '#111111', '#19b34a', '#e8e8e8'];

const CAR = {
  length: 4.3, width: 1.8, wheelBase: 2.6, wheelR: 0.34,
  maxSpeed: 50, reverseMax: 9, accel: 9, brake: 15, grip: 10, driftGrip: 1.6,
  circles: [1.35, 0, -1.35], radius: 0.95,
};

// Fahrzeugtypen: Höchstgeschwindigkeit (m/s), Beschleunigung, Haftung, Haltbarkeit, Wert beim Autohändler
const VEHICLE_KINDS = {
  car: { name: 'Pkw', maxSpeed: 44, accel: 8.5, grip: 10, armor: 1, value: 450 },
  sport: { name: 'Sportwagen', maxSpeed: 60, accel: 12.5, grip: 11.5, armor: 0.85, value: 1400 },
  taxi: { name: 'Taxi', maxSpeed: 44, accel: 8.5, grip: 10, armor: 1.1, value: 350 },
  police: { name: 'Streifenwagen', maxSpeed: 53, accel: 11, grip: 11, armor: 1.5, value: 900 },
};

const _carGeo = {};
function carGeometries() {
  if (_carGeo.body) return _carGeo;
  _carGeo.body = new THREE.BoxGeometry(1.8, 0.62, 4.3);
  _carGeo.hood = new THREE.BoxGeometry(1.7, 0.1, 1.2);
  _carGeo.cabin = new THREE.BoxGeometry(1.58, 0.55, 2.1);
  _carGeo.roof = new THREE.BoxGeometry(1.5, 0.07, 1.85);
  _carGeo.wheel = new THREE.CylinderGeometry(CAR.wheelR, CAR.wheelR, 0.26, 14);
  _carGeo.wheel.rotateZ(Math.PI / 2);
  _carGeo.hub = new THREE.CylinderGeometry(0.17, 0.17, 0.27, 8);
  _carGeo.hub.rotateZ(Math.PI / 2);
  _carGeo.light = new THREE.BoxGeometry(0.42, 0.14, 0.06);
  _carGeo.bumper = new THREE.BoxGeometry(1.84, 0.2, 0.22);
  _carGeo.plate = new THREE.BoxGeometry(0.52, 0.12, 0.03);
  _carGeo.spoiler = new THREE.BoxGeometry(1.6, 0.06, 0.32);
  _carGeo.strut = new THREE.BoxGeometry(0.08, 0.22, 0.12);
  _carGeo.barBase = new THREE.BoxGeometry(1.1, 0.08, 0.32);
  _carGeo.lamp = new THREE.BoxGeometry(0.42, 0.16, 0.26);
  _carGeo.side = new THREE.PlaneGeometry(2.6, 0.36);
  _carGeo.sign = new THREE.BoxGeometry(0.62, 0.2, 0.2);
  return _carGeo;
}

function textTexture(text, bg, fg, w = 256, h = 48) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = fg; c.font = `800 ${Math.round(h * 0.72)}px Segoe UI, Arial, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const _carMat = {};
function carMaterials() {
  if (_carMat.glass) return _carMat;
  _carMat.glass = new THREE.MeshLambertMaterial({ color: '#1e2730' });
  _carMat.tire = new THREE.MeshLambertMaterial({ color: '#1a1a1a' });
  _carMat.hub = new THREE.MeshLambertMaterial({ color: '#b8bcc0' });
  _carMat.trim = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
  _carMat.plate = new THREE.MeshLambertMaterial({ color: '#f4f4f4' });
  _carMat.head = new THREE.MeshLambertMaterial({ color: '#fff6dd', emissive: '#fff1c4', emissiveIntensity: 0.2 });
  _carMat.tail = new THREE.MeshLambertMaterial({ color: '#8a1010', emissive: '#ff2020', emissiveIntensity: 0.25 });
  _carMat.policeBlue = new THREE.MeshLambertMaterial({ color: '#1f4fa3' });
  _carMat.lampOff = new THREE.MeshLambertMaterial({ color: '#16306b', emissive: '#0a1840', emissiveIntensity: 0.4 });
  _carMat.lampOn = new THREE.MeshBasicMaterial({ color: '#5fa0ff' });
  _carMat.policeSide = new THREE.MeshLambertMaterial({ map: textTexture('POLIZEI', '#1f4fa3', '#ffffff', 512, 72) });
  _carMat.taxiSign = new THREE.MeshLambertMaterial({ map: textTexture('TAXI', '#f6d23a', '#1a1a1a', 128, 40), emissive: '#ffd84a', emissiveIntensity: 0.25 });
  _carMat.wreck = new THREE.MeshLambertMaterial({ color: '#1c1a19' });
  return _carMat;
}

class Vehicle {
  constructor(scene, color, kind = 'car') {
    const G = carGeometries(), M = carMaterials();
    this.kind = kind;
    this.spec = VEHICLE_KINDS[kind] || VEHICLE_KINDS.car;
    if (!color) {
      if (kind === 'police') color = '#e9edf1';
      else if (kind === 'taxi') color = '#efe6c4';
      else if (kind === 'sport') color = SPORT_COLORS[Math.floor(Math.random() * SPORT_COLORS.length)];
      else color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    }
    this.color = color;
    const paint = new THREE.MeshLambertMaterial({ color: this.color });
    this.paint = paint;
    this.baseColor = new THREE.Color(this.color);
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m;
    };
    const sport = kind === 'sport';
    const body = add(G.body, paint, 0, 0.62, 0);
    if (sport) { body.scale.y = 0.8; body.position.y = 0.56; }
    add(G.hood, paint, 0, sport ? 0.86 : 0.96, 1.35);
    this.glassMesh = add(G.cabin, M.glass, 0, sport ? 1.02 : 1.2, sport ? -0.35 : -0.25);
    if (sport) this.glassMesh.scale.set(1, 0.72, 0.95);
    add(G.roof, kind === 'police' ? M.policeBlue : paint, 0, sport ? 1.24 : 1.5, sport ? -0.4 : -0.3);
    add(G.bumper, M.trim, 0, 0.42, 2.17, false);
    add(G.bumper, M.trim, 0, 0.42, -2.17, false);
    add(G.plate, M.plate, 0, 0.6, 2.29, false);
    add(G.plate, M.plate, 0, 0.6, -2.29, false);
    add(G.light, M.head, 0.62, 0.74, 2.16, false);
    add(G.light, M.head, -0.62, 0.74, 2.16, false);
    add(G.light, M.tail, 0.62, 0.76, -2.16, false);
    add(G.light, M.tail, -0.62, 0.76, -2.16, false);
    if (sport) {
      add(G.spoiler, paint, 0, 1.12, -2.0);
      add(G.strut, M.trim, 0.55, 0.98, -2.0, false); add(G.strut, M.trim, -0.55, 0.98, -2.0, false);
    }
    this.lamps = null;
    if (kind === 'police') {
      add(G.barBase, M.trim, 0, 1.57, -0.3, false);
      this.lamps = [add(G.lamp, M.lampOff, 0.3, 1.66, -0.3, false), add(G.lamp, M.lampOff, -0.3, 1.66, -0.3, false)];
      const sR = add(G.side, M.policeSide, 0.905, 0.66, 0, false); sR.rotation.y = Math.PI / 2;
      const sL = add(G.side, M.policeSide, -0.905, 0.66, 0, false); sL.rotation.y = -Math.PI / 2;
      add(G.hood, M.policeBlue, 0, 0.965, 1.35, false).scale.set(0.35, 1.2, 1.01);
    }
    if (kind === 'taxi') add(G.sign, M.taxiSign, 0, 1.63, -0.3, false);
    this.wheels = [];
    this.frontPivots = [];
    for (const [x, z] of [[0.84, 1.33], [-0.84, 1.33], [0.84, -1.33], [-0.84, -1.33]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, CAR.wheelR, z);
      const w = new THREE.Group();
      const tire = new THREE.Mesh(G.wheel, M.tire); tire.castShadow = true;
      const hub = new THREE.Mesh(G.hub, M.hub);
      w.add(tire, hub);
      pivot.add(w); g.add(pivot);
      this.wheels.push(w);
      if (z > 0) this.frontPivots.push(pivot);
    }
    this.group = g;
    scene.add(g);

    this.x = 0; this.z = 0; this.y = 0;
    this.heading = 0;
    this.vx = 0; this.vz = 0;
    this.steer = 0; this.pitch = 0; this.roll = 0; this.spin = 0;
    this.ai = null;          // gesetzt vom Verkehr
    this.isPlayer = false;
    this.lastImpact = 0;
    this.sleeping = true;
    this.health = 100;
    this.burning = 0;        // Sekunden bis zur Explosion (0 = brennt nicht)
    this.wrecked = false;
    this.siren = false;
    this.flashSeed = Math.floor(Math.random() * 4);
    this._col = {};
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }
  get speed() { return this.vx * this.forwardX + this.vz * this.forwardZ; }

  place(x, z, heading, world) {
    this.x = x; this.z = z; this.heading = heading; this.vx = this.vz = 0;
    this.y = world.heightAt(x, z);
    this.updateGround(world, 1, true);
    this.sync();
  }

  // input: { throttle -1..1, steer -1..1, handbrake }
  update(dt, input, world) {
    if (this.wrecked) input = { throttle: 0, steer: 0, handbrake: true };
    const S = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const thr = input.throttle, hb = input.handbrake;
    // stark beschädigte Autos verlieren Leistung
    const power = this.health < 25 ? 0.6 : 1;

    let a = 0;
    if (thr > 0) a = vf < -0.5 ? CAR.brake * thr : S.accel * power * thr * Math.max(0, 1 - vf / S.maxSpeed) * (hb ? 0.4 : 1);
    else if (thr < 0) a = vf > 0.5 ? CAR.brake * thr : (vf > -CAR.reverseMax ? 5 * thr : 0);
    a -= 0.0016 * vf * Math.abs(vf) + Math.sign(vf) * (thr === 0 ? 0.9 : 0.25);
    if (hb) a -= Math.sign(vf) * 5.5;
    // Steigung
    a -= 9.81 * Math.sin(this.pitch) * 0.85;
    const before = vf;
    vf += a * dt;
    if (thr === 0 && Math.sign(vf) !== Math.sign(before) && Math.abs(this.pitch) < 0.05) vf = 0;

    const maxSteer = 0.62 / (1 + Math.abs(vf) * 0.055);
    this.steer = U.damp(this.steer, input.steer * maxSteer, 9, dt);
    let yaw = vf * Math.tan(this.steer) / CAR.wheelBase;
    if (hb && Math.abs(vf) > 4) yaw *= 1.45;
    this.heading += yaw * dt;

    vl *= Math.exp(-(hb ? CAR.driftGrip : S.grip) * dt);
    // Geschwindigkeit im alten Bezugssystem zurückrechnen: dreht sich das Auto, entsteht im nächsten
    // Schritt eine Seitwärtskomponente, die die Reifenhaftung abbaut (das ist das Rutschen).
    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.drift = Math.abs(vl);

    this.integrate(dt, world);
    this.spin += vf * dt / CAR.wheelR;
    this.sleeping = Math.abs(vf) < 0.05 && thr === 0;
  }

  // Bewegt das Auto in kleinen Teilschritten und löst Kollisionen auf
  integrate(dt, world) {
    const sp = Math.hypot(this.vx, this.vz);
    const steps = Math.max(1, Math.ceil(sp * dt / 0.35));
    const h = dt / steps;
    this.lastImpact = 0;
    for (let s = 0; s < steps; s++) {
      this.x += this.vx * h; this.z += this.vz * h;
      this.resolveStatic(world);
    }
  }

  resolveStatic(world) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const off of CAR.circles) {
      const cx = this.x + fx * off, cz = this.z + fz * off;
      const r = world.collideCircle(cx, cz, CAR.radius, this._col);
      if (r.hit) {
        this.x += r.x - cx; this.z += r.z - cz;
        this.bounce(r.nx, r.nz, 0.25);
      }
    }
  }

  bounce(nx, nz, restitution) {
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      this.vx -= (1 + restitution) * vn * nx;
      this.vz -= (1 + restitution) * vn * nz;
      // Reibung abhängig von der Aufprallstärke, damit Entlangschrammen nicht festklebt
      const f = 1 - Math.min(0.35, -vn * 0.025);
      this.vx *= f; this.vz *= f;
      this.lastImpact = Math.max(this.lastImpact, -vn);
      this.damage(-vn);
    }
  }

  // Schaden aus einer Aufprallgeschwindigkeit (m/s)
  damage(v) {
    if (v < 4 || this.wrecked) return;
    this.health -= (v - 4) * 2.6 / this.spec.armor;
    if (this.health <= 0 && !this.burning) { this.health = 0; this.burning = 4.5; }
    // Lack wird mit dem Schaden dunkler und matter
    const f = 0.45 + 0.55 * U.clamp(this.health / 100, 0, 1);
    this.paint.color.copy(this.baseColor).multiplyScalar(f);
  }

  repair(color) {
    this.health = 100; this.burning = 0;
    if (color) this.baseColor.set(color);
    this.paint.color.copy(this.baseColor);
  }

  // ausgebranntes Wrack
  wreck() {
    this.wrecked = true; this.burning = 0; this.health = 0; this.siren = false;
    const M = carMaterials();
    this.group.traverse(o => { if (o.isMesh && o.material !== M.tire) o.material = M.wreck; });
  }

  setSiren(on) {
    this.siren = on && !!this.lamps;
    if (this.lamps && !on) for (const l of this.lamps) l.material = carMaterials().lampOff;
  }

  // Blaulicht blinken lassen (t = Zeit in Sekunden)
  flash(t) {
    if (!this.siren) return;
    const M = carMaterials();
    const ph = Math.floor(t * 7 + this.flashSeed) % 4; // doppeltes Aufblitzen links, dann rechts
    this.lamps[0].material = ph === 0 ? M.lampOn : M.lampOff;
    this.lamps[1].material = ph === 2 ? M.lampOn : M.lampOff;
  }

  // Höhe, Neigung und Rollen aus dem Gelände
  updateGround(world, dt, snap) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx; // links
    const hf = world.heightAt(this.x + fx * 1.4, this.z + fz * 1.4);
    const hbk = world.heightAt(this.x - fx * 1.4, this.z - fz * 1.4);
    const hl = world.heightAt(this.x + lx * 0.85, this.z + lz * 0.85);
    const hr = world.heightAt(this.x - lx * 0.85, this.z - lz * 0.85);
    const pitch = Math.atan2(hf - hbk, 2.8);
    const roll = Math.atan2(hl - hr, 1.7);
    const y = (hf + hbk + hl + hr) / 4 + 0.03;
    if (snap) { this.pitch = pitch; this.roll = roll; this.y = y; }
    else {
      this.pitch = U.damp(this.pitch, pitch, 14, dt);
      this.roll = U.damp(this.roll, roll, 14, dt);
      this.y = U.damp(this.y, y, 20, dt);
    }
  }

  sync() {
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(-this.pitch, this.heading, this.roll, 'YXZ');
    for (const p of this.frontPivots) p.rotation.y = this.steer;
    for (const w of this.wheels) w.rotation.x = this.spin;
  }

  // Kreise in Weltkoordinaten (für Auto-Auto-Kollisionen)
  circlePoints(out) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (let i = 0; i < 3; i++) { out[i * 2] = this.x + fx * CAR.circles[i]; out[i * 2 + 1] = this.z + fz * CAR.circles[i]; }
    return out;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.paint.dispose();
    this.disposed = true;
  }
}

// Schiebt zwei Autos auseinander. a ist das bewegte Auto. Gibt die Aufprallgeschwindigkeit zurück (0 = kein Kontakt).
const _ca = [0, 0, 0, 0, 0, 0], _cb = [0, 0, 0, 0, 0, 0];
function collideCars(a, b) {
  const dx0 = a.x - b.x, dz0 = a.z - b.z;
  if (dx0 * dx0 + dz0 * dz0 > 36) return 0;
  a.circlePoints(_ca); b.circlePoints(_cb);
  const R = CAR.radius * 2 * 0.92;
  let hit = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const dx = _ca[i * 2] - _cb[j * 2], dz = _ca[i * 2 + 1] - _cb[j * 2 + 1];
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 1e-3, nx = dx / d, nz = dz / d, push = R - d;
    const movable = !b.ai;
    const share = movable ? 0.5 : 1;
    a.x += nx * push * share; a.z += nz * push * share;
    if (movable) { b.x -= nx * push * 0.5; b.z -= nz * push * 0.5; }
    // Impuls
    const rvx = a.vx - b.vx, rvz = a.vz - b.vz, vn = rvx * nx + rvz * nz;
    if (vn < 0) {
      a.lastImpact = Math.max(a.lastImpact, -vn);
      a.damage(-vn * 0.8); b.damage(-vn * 0.8);
      hit = Math.max(hit, -vn);
      if (movable) {
        const j2 = -vn * 0.6;
        a.vx += nx * j2; a.vz += nz * j2;
        b.vx -= nx * j2; b.vz -= nz * j2;
        b.sleeping = false;
      } else {
        a.vx -= 1.3 * vn * nx; a.vz -= 1.3 * vn * nz;
        if (b.ai) b.ai.bumped = 2.5;
      }
    }
    hit = Math.max(hit, 0.01);
    a.circlePoints(_ca);
  }
  return hit;
}
