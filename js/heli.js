// Helikopter (seit v3.20.0, Update „Lebendige Stadt“, Phase U5): steuerbarer Hubschrauber zum Erkunden aus der Luft.
//
// Modell: prozedural in der Größe eines leichten Zweiturbinen-Hubschraubers (≈ 10,2 m lang, Rotor 10,2 m): Kabine mit
// Glaskanzel, Heckausleger, Seitenleitwerk mit Heckrotor, Höhenleitwerk, Kufen, Vierblatt-Hauptrotor; fiktive
// Kennung und Lackierung. Bei hoher Drehzahl wird die Rotorscheibe unscharf (Blätter blenden aus, Scheibe ein).
//
// Flugmodell (Arcade, stabil): Drehzahl läuft beim Einsteigen in ≈ 3 s hoch, erst dann trägt der Rotor. W/S neigen die
// Nase und beschleunigen vorwärts/rückwärts, A/D drehen, Leertaste steigt, Shift sinkt. Seitliches Rutschen wird stark
// gedämpft, ohne Eingabe bremst er zum Schweben ab. Landen auf Boden und Dächern (Gebäude-Oberkante), Gebäude sind
// Hindernisse (Rotorkreis), harte Aufpralle kosten Leben, bei 0 stürzt er ab.
//
// Landeplätze (HeliPads): Klinikum Coburg, Verkehrslandeplatz Coburg-Brandensteinsebene und einer nahe dem Bahnhof.
// Der Platz wird erst gesucht und gebaut, wenn der Spieler näher als 900 m ist (freie, ebene Fläche ohne Häuser und
// Straßen), dann steht dort ein Hubschrauber bereit (E zum Einsteigen).
'use strict';

const HELI = {
  fwd: 0.42,          // größte Neigung (rad)
  climb: 9, sink: 7,  // m/s
  yawRate: 1.25,
  drag: 0.085,        // Luftwiderstand vorwärts (Höchsttempo ≈ 50 m/s)
  side: 1.6,          // Dämpfung quer
  brake: 0.55,        // Abbremsen ohne Eingabe
  spool: 0.34,        // Drehzahl je Sekunde
  r: 4.6,             // Rotorkreis für Kollision
  ceil: 900,          // höchstens so hoch über Grund
  colors: { body: '#1d3b6e', stripe: '#f1f1ee', belly: '#2a2d31' },
};

class Helicopter {
  constructor(scene, x, z, y, yaw) {
    this.scene = scene;
    this.x = x; this.z = z; this.y = y; this.yaw = yaw || 0;
    this.vx = 0; this.vy = 0; this.vz = 0; this.yawVel = 0; this.pitch = 0; this.roll = 0;
    this.rpm = 0; this.engine = false; this.landed = true; this.health = 100; this.spinA = 0; this.tailA = 0;
    this.kind = 'heli';
    this.group = this.build();
    scene.add(this.group);
    this.sync();
  }
  get speed() { return Math.hypot(this.vx, this.vz); }

  // ---------- Modell ----------
  build() {
    const g = new THREE.Group(), C = HELI.colors;
    const mat = (preset, v) => (typeof Mat !== 'undefined' && Mat.make) ? Mat.make(preset, v) : new THREE.MeshStandardMaterial(v);
    const paint = mat('lack', { color: C.body, roughness: 0.35, metalness: 0.2 });
    const white = mat('lack', { color: C.stripe, roughness: 0.4 });
    const dark = mat('kunststoff', { color: C.belly, roughness: 0.6 });
    const metal = mat('metall', { color: '#8d9399', roughness: 0.4, metalness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: '#1b2a36', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.78 });
    const blade = mat('kunststoff', { color: '#232528', roughness: 0.5 });
    this.mats = [paint, white, dark, metal, glass, blade];
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = g) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz);
      o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
    };
    // Kabine: gestreckte Kugel (Länge 4,4 m, Breite 1,6, Höhe 1,75), Unterseite dunkel, Streifen
    const pod = new THREE.SphereGeometry(1, 28, 18);
    add(pod, paint, 0, 1.55, 0.6, 0, 0, 0, 0.82, 0.9, 2.2);
    add(pod, dark, 0, 1.2, 0.55, 0, 0, 0, 0.78, 0.55, 2.05);
    add(new THREE.CylinderGeometry(0.84, 0.84, 0.16, 28, 1, true), white, 0, 1.45, 0.6, 0, 0, 0, 1, 1, 2.62);
    // Glaskanzel vorn und Seitenfenster
    const canopy = new THREE.SphereGeometry(1, 24, 14, -Math.PI * 0.62, Math.PI * 1.24, Math.PI * 0.12, Math.PI * 0.42);
    add(canopy, glass, 0, 1.62, 1.15, -0.25, Math.PI / 2 + Math.PI / 2, 0, 0.84, 0.92, 1.5);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.55, 1.15), glass, s * 0.8, 1.78, 0.05, 0, s * 0.04, 0);
    // Triebwerksverkleidung oben
    add(new THREE.BoxGeometry(0.95, 0.42, 2.1), paint, 0, 2.48, -0.2, 0, 0, 0);
    add(new THREE.SphereGeometry(0.48, 14, 10), paint, 0, 2.48, -1.25, 0, 0, 0, 1, 0.9, 1.4);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.13, 0.15, 0.25, 12), dark, s * 0.3, 2.5, -1.95, Math.PI / 2, 0, 0);
    // Heckausleger (verjüngt), Seitenleitwerk, Höhenleitwerk
    add(new THREE.CylinderGeometry(0.17, 0.36, 4.8, 14), paint, 0, 2.05, -3.55, Math.PI / 2 - 0.05, 0, 0);
    const fin = new THREE.Shape();
    fin.moveTo(0, 0); fin.lineTo(-0.9, 0); fin.lineTo(-1.25, 1.35); fin.lineTo(-0.75, 1.4); fin.lineTo(0.2, 0.25); fin.lineTo(0, 0);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false });
    add(finGeo, paint, -0.04, 2.0, -5.65, 0, -Math.PI / 2, 0);
    add(new THREE.BoxGeometry(1.9, 0.06, 0.45), paint, 0, 2.1, -4.9, 0, 0, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.38, 0.4), white, s * 0.95, 2.18, -4.95, 0, 0, 0);
    // Kufen: zwei Rohre mit hochgebogener Spitze, zwei Querbügel
    const tube = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
    for (const s of [-1, 1]) {
      add(tube, metal, s * 1.05, 0.06, 0.4, Math.PI / 2, 0, 0, 1, 3.4, 1);
      add(tube, metal, s * 1.05, 0.2, 2.25, Math.PI / 2 - 0.9, 0, 0, 1, 0.55, 1);
      for (const zz of [1.45, -0.55]) add(tube, metal, s * 0.85, 0.5, zz, 0, 0, s * 0.5, 1, 0.95, 1);
    }
    for (const zz of [1.45, -0.55]) add(tube, metal, 0, 0.88, zz, 0, 0, Math.PI / 2, 1, 1.25, 1);
    // Kennung „D-HCOB“ auf beiden Seiten des Heckauslegers
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.font = 'bold 46px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('D-HCOB', 128, 34);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const lab = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    this.mats.push(lab); this.tex = tex;
    for (const s of [-1, 1]) { const p = add(new THREE.PlaneGeometry(1.3, 0.32), lab, s * 0.33, 2.12, -2.6, 0, s * Math.PI / 2, 0); p.castShadow = false; }
    // Hauptrotor: Mast, Nabe, vier Blätter (Drehgruppe), unscharfe Scheibe
    add(new THREE.CylinderGeometry(0.09, 0.11, 0.45, 10), metal, 0, 2.86, 0);
    const rotor = new THREE.Group(); rotor.position.set(0, 3.1, 0); g.add(rotor);
    add(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 14), metal, 0, 0, 0, 0, 0, 0, 1, 1, 1, rotor);
    const bladeGeo = new THREE.BoxGeometry(0.28, 0.045, 4.85); bladeGeo.translate(0, 0, 2.6);
    this.blades = [];
    for (let k = 0; k < 4; k++) this.blades.push(add(bladeGeo, blade, 0, 0.02, 0, 0, k * Math.PI / 2, 0, 1, 1, 1, rotor));
    const discMat = new THREE.MeshBasicMaterial({ color: '#1e2124', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.mats.push(discMat);
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.3, 5.15, 40), discMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 3.13; disc.renderOrder = 3;
    g.add(disc);
    // Heckrotor (links am Seitenleitwerk, zwei Blätter)
    const tail = new THREE.Group(); tail.position.set(0.16, 2.55, -5.95); g.add(tail);
    const tb = new THREE.BoxGeometry(0.03, 1.5, 0.14);
    add(tb, blade, 0, 0, 0, 0, 0, 0, 1, 1, 1, tail); add(tb, blade, 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 1, tail);
    const tdisc = new THREE.Mesh(new THREE.CircleGeometry(0.76, 24), discMat); tdisc.rotation.y = Math.PI / 2; tdisc.position.set(0.18, 2.55, -5.95); g.add(tdisc);
    // Positionslichter (rot links, grün rechts, weißer Blitz am Heck)
    const lamp = (col) => new THREE.MeshBasicMaterial({ color: col });
    this.blink = add(new THREE.SphereGeometry(0.07, 8, 6), lamp('#ff3030'), 0, 1.0, -0.5);
    add(new THREE.SphereGeometry(0.06, 8, 6), lamp('#ff2a2a'), -0.98, 2.12, -4.9);
    add(new THREE.SphereGeometry(0.06, 8, 6), lamp('#2aff6a'), 0.98, 2.12, -4.9);
    this.rotor = rotor; this.tail = tail; this.disc = disc; this.tdisc = tdisc; this.discMat = discMat;
    return g;
  }

  // ---------- Flug ----------
  // Bodenhöhe unter (x, z): Gelände bzw. Gebäude-Oberkante (Dachlandung)
  floorAt(world, x, z) {
    let h = world.groundAt ? world.groundAt(x, z, this.y) : world.heightAt(x, z);
    const b = world.insideBuilding(x, z, 0);
    if (b && b.top !== undefined && b.top > h) h = b.top;
    return h;
  }
  // input: { fwd -1..1, yaw -1..1, lift -1..1 }; gibt Aufprallstärke zurück (0 = keiner)
  update(dt, input, world) {
    const I = input || { fwd: 0, yaw: 0, lift: 0 };
    this.rpm = U.clamp(this.rpm + (this.engine ? 1 : -0.6) * HELI.spool * dt, 0, 1);
    const floor = this.floorAt(world, this.x, this.z);
    let impact = 0;
    const power = U.clamp((this.rpm - 0.55) / 0.45, 0, 1);   // erst ab 55 % Drehzahl trägt der Rotor
    // senkrecht
    let tvy = I.lift > 0 ? HELI.climb * I.lift : I.lift < 0 ? HELI.sink * I.lift : 0;
    tvy = tvy * power - (1 - power) * 12;
    if (this.landed && (I.lift <= 0 || power < 0.6)) tvy = Math.min(0, tvy);
    this.vy += (tvy - this.vy) * (1 - Math.exp(-(power > 0 ? 2.4 : 1.2) * dt));
    // Drehen (mit Nachlauf), Neigung und Schräglage nur in der Luft
    const air = !this.landed;
    this.yawVel += ((air ? I.yaw * HELI.yawRate * (0.4 + 0.6 * power) : I.yaw * 0.3 * power) - this.yawVel) * (1 - Math.exp(-3 * dt));
    this.yaw += this.yawVel * dt;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let vf = this.vx * fx + this.vz * fz, vs = this.vx * fz - this.vz * fx;    // vorwärts, quer
    const tp = air ? -I.fwd * HELI.fwd * power : 0;
    this.pitch += (tp - this.pitch) * (1 - Math.exp(-2.6 * dt));
    const tr = air ? U.clamp(-this.yawVel * 0.22 * Math.min(1, Math.abs(vf) / 12) - vs * 0.02, -0.45, 0.45) : 0;
    this.roll += (tr - this.roll) * (1 - Math.exp(-3 * dt));
    // vorwärts: Schub aus der Neigung, Luftwiderstand; ohne Eingabe zum Schweben abbremsen; quer stark gedämpft
    vf += 9.81 * Math.tan(-this.pitch) * dt;
    vf *= Math.exp(-(HELI.drag + (Math.abs(I.fwd) < 0.1 ? HELI.brake : 0)) * dt);
    vs *= Math.exp(-HELI.side * dt);
    if (this.landed) { vf *= Math.exp(-5 * dt); vs *= Math.exp(-5 * dt); }
    this.vx = fx * vf + fz * vs; this.vz = fz * vf - fx * vs;
    // bewegen, Gebäude als Hindernis (Rotorkreis unter ihrer Oberkante)
    const ox = this.x, oz = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    if (this.blocked(world)) {
      impact = Math.max(impact, this.speed);
      this.x = ox; this.z = oz;
      this.vx *= -0.25; this.vz *= -0.25;
    }
    // Boden / Dach
    const fl = this.floorAt(world, this.x, this.z);
    if (this.y <= fl) {
      const hit = -this.vy;
      if (hit > 6 || (this.speed > 14 && hit > 1)) impact = Math.max(impact, hit + this.speed * 0.4);
      this.y = fl; this.vy = Math.max(0, this.vy);
      this.landed = I.lift <= 0.05 || power < 0.6;
    } else if (this.y > fl + 0.15) this.landed = false;
    this.y = Math.min(this.y, Math.max(floor, fl) + HELI.ceil);
    if (impact > 8) this.hit((impact - 8) * 2.6);   // 25 km/h frei, 100 km/h gegen eine Wand ≈ 50 %
    this.ground = fl;
    return impact;
  }
  blocked(world) {
    for (let k = 0; k < 9; k++) {
      const a = k * Math.PI / 4, r = k === 8 ? 0 : HELI.r;
      const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
      const b = world.insideBuilding(x, z, 0);
      // Rotorebene (y + 3,1) unter der Oberkante und Kabine nicht schon darüber (Dachlandung)
      if (b && b.top !== undefined && this.y + 2.4 < b.top && this.y < b.top - 0.4) return true;
    }
    return false;
  }
  hit(amount) {
    if (this.wrecked) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.wrecked = true;
  }

  sync(dt = 0.016) {
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(0, 0, 0);
    g.rotateY(this.yaw); g.rotateX(this.pitch); g.rotateZ(this.roll);
    // Rotor: sichtbare Drehung höchstens ≈ 6 U/s, darüber Scheibe statt Blättern (kein Stroboskop-Flackern)
    const w = this.rpm * 40;
    this.spinA += Math.min(w, 38) * dt; this.tailA += Math.min(w * 4.5, 60) * dt;
    this.rotor.rotation.y = this.spinA; this.tail.rotation.x = this.tailA;
    const blur = U.clamp((this.rpm - 0.45) / 0.4, 0, 1);
    this.discMat.opacity = blur * 0.16;
    // Blitzlicht
    this.blink.visible = this.rpm > 0.1 && (performance.now() % 1200) < 120;
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    if (this.tex) this.tex.dispose();
  }
}

// ---------- Landeplätze ----------
const HELIPADS = [
  { name: 'Hubschrauberlandeplatz Klinikum', x: 623, z: 1291, search: 220 },
  { name: 'Verkehrslandeplatz Brandensteinsebene', geo: [50.2628, 10.9961], search: 260 },
  { name: 'Hubschrauberlandeplatz Bahnhof', spawn: true, search: 320 },
];

class HeliPads {
  constructor({ world, scene, spawn }) {
    this.world = world; this.scene = scene;
    this.list = [];
    this.loose = [];     // abgestellte Hubschrauber außerhalb der Plätze
    const O = world.data.meta.origin, mLat = 110540, mLon = 111320 * Math.cos(O.lat * Math.PI / 180);
    for (const d of HELIPADS) {
      const p = { name: d.name, search: d.search, built: false, heli: null };
      if (d.geo) { p.x = (d.geo[1] - O.lon) * mLon; p.z = -(d.geo[0] - O.lat) * mLat; }
      else if (d.spawn) { if (!spawn) continue; p.x = spawn.x; p.z = spawn.z; }
      else { p.x = d.x; p.z = d.z; }
      p.tx = p.x; p.tz = p.z;
      this.list.push(p);
    }
  }
  // freie, ebene Fläche (22 × 22 m ohne Gebäude, Straßen und Wasser, Höhenunterschied < 1,2 m) nahe am Ziel
  findSpot(p) {
    const W = this.world, R = 11;
    const free = (x, z) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const sx = x + i * R / 2, sz = z + j * R / 2;
        if (W.insideBuilding(sx, sz, 1)) return false;
        if (W.nearRoad && W.nearRoad(sx, sz, 2)) return false;
        const h = W.heightAt(sx, sz); lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      return hi - lo < 1.2;
    };
    for (let r = 0; r <= p.search; r += 8) {
      const n = Math.max(1, Math.round(r * Math.PI * 2 / 10));
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, x = p.tx + Math.cos(a) * r, z = p.tz + Math.sin(a) * r;
        // am Bahnhof nicht direkt auf den Spawn
        if (p.name.includes('Bahnhof') && r < 40) continue;
        if (free(x, z)) return [x, z];
      }
    }
    return null;
  }
  build(p) {
    const s = this.findSpot(p);
    p.built = true;
    if (!s) { p.failed = true; return; }
    p.x = s[0]; p.z = s[1];
    const W = this.world;
    let top = -Infinity;
    for (const [i, j] of [[-8, -8], [8, -8], [8, 8], [-8, 8], [0, 0]]) top = Math.max(top, W.heightAt(p.x + i, p.z + j));
    p.y = top + 0.12;
    // Platte 16 × 16 m mit gelbem Kreis und H, Rand etwas in den Boden
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const c = cv.getContext('2d');
    c.fillStyle = '#8f8f8a'; c.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 2500; k++) { const v = 120 + Math.floor(Math.random() * 40); c.fillStyle = `rgb(${v},${v},${v - 4})`; c.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
    c.strokeStyle = '#f0f0ea'; c.lineWidth = 10; c.strokeRect(14, 14, 484, 484);
    c.strokeStyle = '#f2c200'; c.lineWidth = 22; c.beginPath(); c.arc(256, 256, 190, 0, 7); c.stroke();
    c.fillStyle = '#f0f0ea'; c.font = 'bold 260px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 256, 268);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const top0 = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), side = new THREE.MeshStandardMaterial({ color: '#77776f', roughness: 0.9 });
    const geo = new THREE.BoxGeometry(16, 1.6, 16);
    const mesh = new THREE.Mesh(geo, [side, side, top0, side, side, side]);
    mesh.position.set(p.x, p.y - 0.8, p.z); mesh.receiveShadow = true;
    // Randleuchten (nachts sichtbar)
    const lamp = new THREE.MeshBasicMaterial({ color: '#ffd23a' });
    const g = new THREE.Group(); g.add(mesh);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lamp); l.position.set(p.x + Math.cos(a) * 7.6, p.y + 0.08, p.z + Math.sin(a) * 7.6); g.add(l); }
    this.scene.add(g);
    p.group = g; p.mats = [top0, side, lamp]; p.tex = tex;
    p.top = { minX: p.x - 8, maxX: p.x + 8, minZ: p.z - 8, maxZ: p.z + 8, y: p.y };
  }
  // Platte als Boden (für Hubschrauber und Spielfigur)
  padAt(x, z) {
    for (const p of this.list) if (p.top && x > p.top.minX && x < p.top.maxX && z > p.top.minZ && z < p.top.maxZ) return p.top.y;
    return null;
  }
  update(dt, px, pz, piloted) {
    for (const p of this.list) {
      const d = Math.hypot(p.tx - px, p.tz - pz);
      if (!p.built && d < 900) this.build(p);
      if (p.failed || !p.built) continue;
      // bereitstehender Hubschrauber (nicht der, den der Spieler gerade fliegt)
      const occupied = this.loose.some(h => Math.hypot(h.x - p.x, h.z - p.z) < 12);
      if (p.away && d < 120) continue;   // neuer Hubschrauber erst, wenn der Spieler weg war
      p.away = false;
      if (!p.heli && d < 500 && !occupied) {
        p.heli = new Helicopter(this.scene, p.x, p.z, p.y, Math.atan2(px - p.x, pz - p.z));
      }
      if (p.heli && p.heli !== piloted && d > 1400) { p.heli.dispose(); p.heli = null; }
    }
    for (const h of this.all()) if (h !== piloted) { h.engine = false; h.update(dt, null, this.worldWithPads()); h.sync(dt); }
    // abgestellte Hubschrauber fern vom Spieler aufräumen
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const h = this.loose[i];
      if (h !== piloted && Math.hypot(h.x - px, h.z - pz) > 1600) { h.dispose(); this.loose.splice(i, 1); }
    }
  }
  all() { return this.list.filter(p => p.heli).map(p => p.heli).concat(this.loose); }
  nearest(x, z, r) {
    let best = null, bd = r;
    for (const h of this.all()) { if (h.wrecked) continue; const d = Math.hypot(h.x - x, h.z - z); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  // Welt-Schnittstelle mit den Plattformen als Boden
  worldWithPads() {
    if (this._w) return this._w;
    const W = this.world, self = this;
    this._w = {
      heightAt: (x, z) => W.heightAt(x, z),
      groundAt: (x, z, y) => { const p = self.padAt(x, z), g = W.groundAt(x, z, y); return p !== null ? Math.max(p, g) : g; },
      insideBuilding: (x, z, m) => W.insideBuilding(x, z, m),
    };
    return this._w;
  }
  // Einsteigen: der Hubschrauber gehört nicht mehr zum Platz (dort steht später ein neuer, sobald der Spieler weg ist)
  take(h) {
    for (const p of this.list) if (p.heli === h) { p.heli = null; p.away = true; }
    if (!this.loose.includes(h)) this.loose.push(h);
  }
  // abgestellter Hubschrauber bleibt stehen (auch außerhalb der Plätze)
  park(h) {
    if (!this.list.some(p => p.heli === h) && !this.loose.includes(h)) this.loose.push(h);
  }
  remove(h) {
    for (const p of this.list) if (p.heli === h) p.heli = null;
    const i = this.loose.indexOf(h); if (i >= 0) this.loose.splice(i, 1);
  }
  mapPlaces() { return this.list.filter(p => p.built && !p.failed).map(p => ({ x: p.x, z: p.z, type: 'heli', name: p.name, color: '#5ad1ff' })); }
}
if (typeof window !== 'undefined') { window.Helicopter = Helicopter; window.HeliPads = HeliPads; }
