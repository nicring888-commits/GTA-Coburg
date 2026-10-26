// Waffen wie in GTA: Faust, Baseballschläger, Pistole, Maschinenpistole, Schrotflinte, Sturmgewehr und Granaten.
// Zielen mit der rechten Maustaste (Schulterkamera, freies Zielen), ohne Zielen rastet der Schuss auf das nächste
// Ziel vor dem Spieler ein (wie die Zielhilfe in GTA, auch für Touch). Treffer auf Passanten, Polizisten und Autos,
// Mündungsfeuer, Leuchtspur, Einschläge, Blut, Nachladen, Drive-by aus dem Auto, Waffenläden, Schutzweste und
// Pickups (Geld von Passanten, Pistole von Polizisten).
'use strict';

// dmg: Schaden je Treffer (Leben 100), rate: Sekunden zwischen zwei Schüssen, mag: Magazin, pack: Munition je Kauf
const WEAPONS = {
  fist:    { name: 'Faust', melee: true, dmg: 25, range: 1.7, rate: 0.42 },
  bat:     { name: 'Baseballschläger', melee: true, dmg: 55, range: 2.2, rate: 0.62, price: 150, tag: 'Leise und zuverlässig' },
  pistol:  { name: 'Pistole', dmg: 34, range: 75, rate: 0.3, mag: 12, reload: 1.2, spread: 0.012, carDmg: 6, price: 600, pack: 36, ammoPrice: 60,
    driveBy: true, hands: 1, snd: [0.22, 2400, 0.7], sight: 'kimme', sightFov: 48, bloom: 0.35, tag: 'Handlich, auch aus dem Auto' },
  smg:     { name: 'Maschinenpistole', dmg: 18, range: 55, rate: 0.085, mag: 30, reload: 1.6, spread: 0.04, carDmg: 3.5, auto: true, price: 1800, pack: 90, ammoPrice: 150,
    driveBy: true, hands: 1, snd: [0.12, 2800, 0.45], sight: 'kimme', sightFov: 46, bloom: 0.12, tag: 'Dauerfeuer, auch aus dem Auto' },
  shotgun: { name: 'Schrotflinte', dmg: 16, pellets: 8, range: 30, rate: 0.95, mag: 6, reload: 2.2, spread: 0.075, carDmg: 3, price: 2500, pack: 18, ammoPrice: 120,
    hands: 2, snd: [0.5, 1400, 1.0], sight: 'perle', sightFov: 52, bloom: 0.5, tag: 'Verheerend auf kurze Distanz' },
  rifle:   { name: 'Sturmgewehr', dmg: 32, range: 120, rate: 0.12, mag: 30, reload: 2, spread: 0.016, carDmg: 6, auto: true, price: 4500, pack: 90, ammoPrice: 250,
    hands: 2, zoom: 38, snd: [0.2, 2600, 0.65], sight: 'rotpunkt', sightFov: 26, bloom: 0.1, tag: 'Weit und präzise, mit Leuchtpunktvisier' },
  grenade: { name: 'Granate', throw: true, sight: 'bogen', rate: 1.1, price: 450, pack: 3, ammoPrice: 450, tag: 'Explodiert nach 2 Sekunden' },
};
const WEAPON_ORDER = ['fist', 'bat', 'pistol', 'smg', 'shotgun', 'rifle', 'grenade'];
const ARMOR_PRICE = 500;

// Visier-Ansicht (Taste V beim Zielen): Blick über die Waffe, Bildmitte (0, 0) = Treffpunkt
const SIGHT_SVG = {
  kimme: `<defs><linearGradient id="sg-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34373d"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient></defs>
    <path d="M-200 360 L-95 170 H95 L200 360 Z" fill="#141518"/>
    <rect x="-7" y="0" width="14" height="150" fill="url(#sg-m)"/><circle cx="0" cy="7" r="4" class="sg-dot"/>
    <path d="M-120 0 H-19 V62 H19 V0 H120 L140 120 L170 360 H-170 L-140 120 Z" fill="url(#sg-m)"/>
    <circle cx="-38" cy="14" r="5" class="sg-dot"/><circle cx="38" cy="14" r="5" class="sg-dot"/>`,
  perle: `<path d="M-260 360 L-16 6 H16 L260 360 Z" fill="#17181b"/><path d="M-60 360 L-3 6 H3 L60 360 Z" fill="#2c2e33"/>
    <path d="M-420 360 L-200 200 H200 L420 360 Z" fill="#5a3a1e"/>
    <circle cx="0" cy="0" r="8" fill="#e8cf7a" stroke="#3a2a10" stroke-width="2"/>`,
  rotpunkt: `<path fill-rule="evenodd" fill="rgba(6,7,9,0.94)" d="M-3000 -3000 H3000 V3000 H-3000 Z M250 0 A250 250 0 1 0 -250 0 A250 250 0 1 0 250 0 Z"/>
    <circle r="250" fill="rgba(120,170,220,0.07)" stroke="#1d1f23" stroke-width="30"/>
    <circle r="236" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
    <path d="M-120 360 L-60 252 H60 L120 360 Z" fill="#1d1f23"/>
    <circle r="42" class="sg-red" fill="none" stroke-width="2.5"/><circle r="3.5" class="sg-red sg-fill"/>`,
};

// Waffenläden (Hindenburgstraße, Ketschendorfer Straße; Neustadt mit Landkreis)
const WEAPON_SHOPS = [
  { name: 'Waffenladen Hindenburgstraße', x: 13, z: -507 },
  { name: 'Waffenladen Ketschendorf', x: 24, z: 527 },
  { name: 'Waffenladen Neustadt', geo: [50.3228, 11.1125] },
];
const GUN_COLOR = '#e2463f';

// Umrisse für HUD und Waffenladen (viewBox 0 0 64 32)
const WEAPON_ICON = {
  fist: '<path d="M18 9h22a6 6 0 0 1 6 6v6a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8v-9a3 3 0 0 1 2-3z"/><path d="M22 9v6M28 9v6M34 9v6M40 9v6" stroke="#0007" stroke-width="2"/>',
  bat: '<path d="M6 26l3 3 32-15c6-3 13-5 17-9l-2-3c-4 3-11 5-17 7z"/>',
  pistol: '<path d="M10 9h40v8H28l-3 13h-9l3-13h-9z"/>',
  smg: '<path d="M6 9h48v3h4v5H40v4h-6l-1 10h-7l1-10h-4l-3 10h-7l3-12H6z"/>',
  shotgun: '<path d="M2 14l12-4h50v5H32l-6 4H16L4 24z"/>',
  rifle: '<path d="M2 15l12-5h22V8h4v2h24v4H44l2 12h-6l-3-9h-7l-3 6h-5l2-6h-9L4 22z"/>',
  grenade: '<ellipse cx="32" cy="19" rx="10" ry="11"/><path d="M28 6h8v4h-8zM36 7l9 4-1 2-9-3z"/>',
};

// 3D-Modell einer Waffe (Lauf entlang +z, Griff am Ursprung); geteilte Formen und Materialien
const _wm = {};
function weaponModel(id) {
  if (id === 'fist' || !WEAPONS[id]) return null;
  if (!_wm.mats) {
    _wm.mats = { metal: new THREE.MeshLambertMaterial({ color: '#2b2d31' }), dark: new THREE.MeshLambertMaterial({ color: '#141518' }),
      wood: new THREE.MeshLambertMaterial({ color: '#7a4b26' }),
      green: new THREE.MeshLambertMaterial({ color: '#3d4a2c' }), brass: new THREE.MeshLambertMaterial({ color: '#d9b45a' }),
      red: new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false }) };
  }
  const M = _wm.mats;
  if (!_wm[id]) {
    const box = (w, h, l, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, l); if (rx) g.rotateX(rx); g.translate(x, y, z); return g; };
    const cyl = (r1, r2, l, z, y = 0) => { const g = new THREE.CylinderGeometry(r1, r2, l, 10); g.rotateX(Math.PI / 2); g.translate(0, y, z); return g; };
    const lens = (r, y, z) => { const g = new THREE.CircleGeometry(r, 14); g.rotateY(Math.PI); g.translate(0, y, z); return g; };
    // Kimme (zwei Backen) und Korn
    const irons = (y, zf, zr) => [[box(0.008, 0.016, 0.012, 0, y, zf), M.dark], [box(0.012, 0.016, 0.014, 0.013, y, zr), M.dark], [box(0.012, 0.016, 0.014, -0.013, y, zr), M.dark]];
    const parts = {
      bat: [[cyl(0.038, 0.017, 0.82, 0.3), M.wood]],
      pistol: [[box(0.04, 0.05, 0.2, 0, 0.035, 0.06), M.metal], [box(0.034, 0.1, 0.05, 0, -0.02, -0.01, -0.25), M.dark], ...irons(0.067, 0.15, -0.03)],
      smg: [[box(0.05, 0.07, 0.3, 0, 0.04, 0.08), M.metal], [box(0.03, 0.15, 0.04, 0, -0.06, 0.12), M.dark], [box(0.034, 0.09, 0.045, 0, -0.03, -0.02, -0.2), M.dark],
        [cyl(0.012, 0.012, 0.12, 0.28), M.dark], ...irons(0.082, 0.21, -0.05)],
      shotgun: [[cyl(0.018, 0.018, 0.55, 0.42), M.metal], [box(0.05, 0.07, 0.26, 0, -0.01, 0.06), M.dark], [box(0.045, 0.085, 0.26, 0, -0.04, -0.19, 0.12), M.wood],
        [box(0.04, 0.04, 0.16, 0, -0.035, 0.32), M.wood], [new THREE.SphereGeometry(0.009, 8, 6).translate(0, 0.022, 0.69), M.brass]],
      rifle: [[cyl(0.013, 0.013, 0.32, 0.5), M.dark], [box(0.05, 0.08, 0.42, 0, 0.01, 0.15), M.metal], [box(0.034, 0.15, 0.055, 0, -0.1, 0.2, 0.3), M.dark],
        [box(0.045, 0.085, 0.22, 0, -0.02, -0.17), M.dark], [box(0.026, 0.022, 0.07, 0, 0.06, 0.13), M.dark],
        [cyl(0.026, 0.026, 0.085, 0.13, 0.095), M.dark], [lens(0.019, 0.095, 0.0865), M.red]],
      grenade: [[new THREE.SphereGeometry(0.065, 10, 8), M.green]],
    };
    _wm[id] = parts[id];
  }
  const g = new THREE.Group();
  for (const [geo, mat] of _wm[id]) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); }
  return g;
}

class Weapons {
  // ctx: { world, scene, fx, ui, audio, peds, police, property, camera, cam, save, persist, addMoney, keys, pressed,
  //        player(), car(), ride(), mode(), cars(), hurtPlayer(dmg, x, z, grund, stoß), blast(x, y, z) }
  constructor(ctx) {
    Object.assign(this, ctx);
    const S = this.save;
    if (!S.weapons || typeof S.weapons !== 'object') S.weapons = {};
    S.weapons.fist = S.weapons.fist || {};
    if (!WEAPONS[S.weapon] || !S.weapons[S.weapon]) S.weapon = 'fist';
    S.armor = S.armor || 0;
    this.cool = 0; this.reloadT = 0; this.aimHold = 0; this.aimYaw = 0; this.aimPitch = 0;
    this.aiming = false; this.lock = null; this.lockT = 0; this.reportT = 0; this.hintT = 0;
    this.bloom = 0; this.sinceShot = 9; // Aufblühen der Streuung durch Rückstoß, 0..1
    this.sightMode = false;   // V: über das Visier zielen statt über die Schulter
    this.sighting = false; this.onTarget = null; this.targetT = 0;
    this.grenades = []; this.pickups = []; this.shops = [];
    this._v = new THREE.Vector3();
    // Leuchtspuren: ein Linienbündel, kurze Lebensdauer
    const N = 48;
    this.tracers = [];
    this.trPos = new Float32Array(N * 6);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.trLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.trLines.frustumCulled = false;
    this.scene.add(this.trLines);
    this.trMax = N;
    // Mündungsfeuer (Licht immer in der Szene, nur die Stärke wechselt: kein Neuübersetzen der Shader)
    this.flash = new THREE.PointLight('#ffc070', 0, 14, 2);
    this.scene.add(this.flash);
    this.flashT = 0;
    this.grenadeGeo = new THREE.SphereGeometry(0.08, 10, 8);
    // Wurfbahn der Granate beim Zielen: Linie und Ring an der Landestelle
    this.arcPts = new Float32Array(60 * 3);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.arcPts, 3).setUsage(THREE.DynamicDrawUsage));
    const arcMat = new THREE.LineBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    this.arc = new THREE.Line(ag, arcMat);
    this.arc.frustumCulled = false; this.arc.visible = false;
    const rg = new THREE.RingGeometry(0.55, 0.75, 28); rg.rotateX(-Math.PI / 2);
    this.arcRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.arcRing.visible = false;
    this.scene.add(this.arc, this.arcRing);
    this.buildHud();
    for (const def of WEAPON_SHOPS) this.placeShop(def);
  }

  get id() { return this.save.weapon; }
  get def() { return WEAPONS[this.save.weapon]; }
  inv(id = this.id) { return this.save.weapons[id]; }
  owned() { return WEAPON_ORDER.filter(id => this.save.weapons[id]); }
  // Waffe gezogen (alles außer Faust und Schläger): Polizei schießt dann schon ab 2 Sternen
  armed() { const d = this.def; return !d.melee && this.mode() === 'walk'; }

  // ---------- HUD ----------
  buildHud() {
    const st = document.getElementById('status');
    const w = document.createElement('div');
    w.id = 'weapon';
    w.innerHTML = '<svg id="wp-icon" viewBox="0 0 64 32"></svg><div id="wp-text"><div id="wp-name"></div><div id="wp-ammo"></div></div>';
    st.appendChild(w);
    const ar = document.createElement('div');
    ar.className = 'bar-row hidden'; ar.id = 'armor-row';
    ar.innerHTML = '<span class="ico">⛨</span><div class="hbar"><div id="armor-bar"></div></div>';
    st.insertBefore(ar, document.getElementById('car-row'));
    const hud = document.getElementById('hud');
    this.$cross = document.createElement('div'); this.$cross.id = 'crosshair'; this.$cross.className = 'hidden';
    this.$cross.innerHTML = '<i class="t n"></i><i class="t s"></i><i class="t w"></i><i class="t e"></i><b class="dot"></b><s class="ring"></s>';
    this.$sight = document.createElement('div'); this.$sight.id = 'sight'; this.$sight.className = 'hidden';
    this.$hit = document.createElement('div'); this.$hit.id = 'hitmark';
    hud.prepend(this.$sight); // unter Geld, Sternen und Minikarte
    hud.append(this.$cross, this.$hit);
    this.crossKey = ''; this.sightKey = '';
    this.$lock = document.createElement('div'); this.$lock.id = 'aimlock'; this.$lock.className = 'hidden'; hud.appendChild(this.$lock);
    this.$w = w; this.hudKey = '';
  }

  hud() {
    const d = this.def, inv = this.inv();
    const ammo = d.melee ? '' : d.throw ? `× ${inv.ammo || 0}` : this.reloadT > 0 ? 'Nachladen …' : `${inv.clip || 0} / ${inv.ammo || 0}`;
    const key = this.id + '|' + ammo;
    if (key !== this.hudKey) {
      this.hudKey = key;
      document.getElementById('wp-icon').innerHTML = WEAPON_ICON[this.id];
      document.getElementById('wp-name').textContent = d.name;
      document.getElementById('wp-ammo').textContent = ammo;
      this.$w.classList.toggle('empty', !d.melee && !(inv.clip || inv.ammo));
    }
    const a = this.save.armor;
    document.getElementById('armor-row').classList.toggle('hidden', a <= 0);
    if (a > 0) document.getElementById('armor-bar').style.width = a + '%';
  }

  // ---------- Auswahl ----------
  select(id, quiet) {
    if (!this.save.weapons[id] || id === this.id) return;
    this.save.weapon = id; this.reloadT = 0; this.cool = Math.max(this.cool, 0.25);
    this.$w.classList.remove('pop'); void this.$w.offsetWidth; this.$w.classList.add('pop');
    if (!quiet) this.audio.beep(660, 0.04, 0, 'square', 0.05);
  }
  cycle(dir = 1) {
    const list = this.owned();
    if (list.length < 2) { this.ui.toast('Nur Fäuste: Waffen gibt es im Waffenladen (rot)', 2); return; }
    let i = list.indexOf(this.id);
    // im Auto nur Waffen für den Drive-by
    for (let n = 0; n < list.length; n++) {
      i = (i + dir + list.length) % list.length;
      if (this.mode() !== 'drive' && !this.ride() || WEAPONS[list[i]].driveBy) break;
    }
    this.select(list[i]);
  }

  // Waffen weg (Verhaftung): Polizei beschlagnahmt alles außer den Fäusten, Weste auch
  confiscate() {
    const had = this.owned().length > 1;
    this.save.weapons = { fist: {} }; this.save.weapon = 'fist'; this.save.armor = 0;
    this.persist();
    return had;
  }

  // drinnen: Waffe wegstecken
  holster() {
    const p = this.player();
    p.setWeapon(null); p.pose.aim = 0; p.pose.swing = 0; p.group.visible = true;
    this.aiming = this.sighting = false; this.arc.visible = this.arcRing.visible = false;
    for (const el of [this.$cross, this.$lock, this.$sight]) el.classList.add('hidden');
  }

  // ---------- Hauptschritt (draußen) ----------
  update(dt, freeze) {
    const keys = this.keys, pressed = this.pressed, p = this.player();
    const mode = this.mode(), ride = this.ride();
    const onFoot = mode === 'walk' && !ride;
    const vehicle = mode === 'drive' ? this.car() : ride;
    this.cool -= dt; this.aimHold -= dt; this.hintT -= dt; this.reportT -= dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; }
    // Auswahl: 1–7 direkt, Q weiter
    WEAPON_ORDER.forEach((id, i) => { if (pressed['Digit' + (i + 1)]) { if (this.save.weapons[id]) this.select(id); else this.ui.toast(`${WEAPONS[id].name}: gibt es im Waffenladen`, 1.6); } });
    if (pressed.KeyQ) this.cycle(1);
    if (pressed.KeyV && onFoot) {
      this.sightMode = !this.sightMode;
      this.ui.toast(this.sightMode ? 'Zielen über das Visier (V)' : 'Zielen über die Schulter (V)', 1.4);
    }
    this.sinceShot += dt;
    if (this.sinceShot > 0.2) this.bloom = Math.max(0, this.bloom - dt * 1.8); // erst nach dem Feuern abklingen
    if (vehicle && !this.def.driveBy) {
      // im Auto auf eine Waffe für den Drive-by wechseln, wenn vorhanden
      const alt = this.owned().find(id => WEAPONS[id].driveBy);
      if (alt && (pressed.Mouse0 || pressed.KeyQ)) this.select(alt, true);
    }
    const d = this.def, inv = this.inv();
    // Nachladen
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const n = Math.min(d.mag - (inv.clip || 0), inv.ammo || 0);
        inv.clip = (inv.clip || 0) + n; inv.ammo -= n;
        this.audio.beep(900, 0.04, 0, 'square', 0.06);
      }
    } else if (d.mag && ((onFoot && pressed.KeyR && (inv.clip || 0) < d.mag) || (!inv.clip && this.cool <= 0)) && inv.ammo > 0) this.startReload();

    this.aiming = onFoot && !!keys.Mouse2 && !d.melee && !freeze;
    this.sighting = this.aiming && this.sightMode && !!SIGHT_SVG[d.sight];
    const fire = !freeze && (d.auto ? keys.Mouse0 : pressed.Mouse0);
    if (fire && this.cool <= 0 && this.reloadT <= 0) {
      if (onFoot) this.attack();
      else if (vehicle && d.driveBy) this.attack(vehicle);
      else if (vehicle && pressed.Mouse0 && this.hintT <= 0) { this.hintT = 3; this.ui.toast('Aus dem Auto: nur Pistole oder Maschinenpistole', 2); }
    }
    // Figur: Waffe in der Hand, beim Zielen in Blickrichtung
    if (onFoot) {
      p.setWeapon(this.id);
      const yaw = this.aiming ? this.cam.yaw : this.aimYaw;
      if (this.aiming) this.aimPitch = -this.camPitch();
      const hold = this.aiming || this.aimHold > 0;
      p.pose.aim = hold && !d.melee ? (d.hands || 1) : 0;
      p.pose.pitch = this.aimPitch;
      if (hold) { p.heading = yaw; }
      p.pose.swing = Math.max(0, p.pose.swing - dt * 2.6);
      p.group.visible = !this.sighting; // über das Visier: Blick aus den Augen der Figur
      p.sync();
    } else p.pose.aim = 0;
    this.updateAimHud(dt);
    this.updateArc();
    this.updateLock(dt, onFoot, vehicle);
    this.updateGrenades(dt);
    this.updatePickups(dt, onFoot);
    this.updateTracers(dt);
    const me = vehicle || p;
    this.fadeShops(me.x, me.z);
    this.hud();
  }

  // Blickneigung der Kamera als Winkel nach oben (Kamera über dem Kopf schaut leicht nach unten)
  camPitch() { this.camera.getWorldDirection(this._v); return -Math.asin(U.clamp(this._v.y, -1, 1)); }

  // aktuelle Streuung (Winkel je Achse): Rückstoß, Zielen, Visier, Laufen, Auto
  spreadNow(vehicle) {
    const d = this.def, p = this.player();
    let s = (d.spread || 0) * (1 + this.bloom * 2.2);
    if (vehicle) return s * 1.6;
    if (this.sighting) s *= 0.35; else if (this.aiming) s *= 0.6;
    return s * (p.moveSpeed > 5 ? 1.8 : p.moveSpeed > 0.5 ? 1.25 : 1);
  }

  // Fadenkreuz (Spreizung = echte Streuung auf dem Bildschirm), Farbe über Zielen, Visier-Bild
  updateAimHud(dt) {
    const d = this.def, show = this.aiming && !this.sighting;
    this.$cross.classList.toggle('hidden', !show);
    this.$sight.classList.toggle('hidden', !this.sighting);
    if (!this.aiming) { this.onTarget = null; return; }
    if (this.sighting && this.sightKey !== d.sight) {
      this.sightKey = d.sight;
      this.$sight.innerHTML = `<svg viewBox="-640 -360 1280 720" preserveAspectRatio="xMidYMid slice">${SIGHT_SVG[d.sight]}</svg>`;
    }
    const f = innerHeight / 2 / Math.tan(this.camera.fov * Math.PI / 360);
    const g = d.throw ? 5 : Math.max(3, this.spreadNow(null) * f);
    this.$cross.style.setProperty('--g', g.toFixed(1) + 'px');
    // was liegt unter dem Fadenkreuz? (alle 0,1 s)
    this.targetT -= dt;
    if (this.targetT <= 0 && !d.throw) {
      this.targetT = 0.1;
      this.camera.getWorldDirection(this._v);
      const o = this.camera.position, dir = { x: this._v.x, y: this._v.y, z: this._v.z };
      const skip = Math.max(0, U3.along(o, dir, this.player()) - 0.2);
      const h = this.ray(o, dir, (d.range || 30) + skip, null, skip);
      this.onTarget = h.type === 'ped' || h.type === 'officer' ? 'enemy' : h.type === 'car' ? 'car' : null;
    }
    const key = d.sight + '|' + this.onTarget + '|' + show;
    if (key !== this.crossKey) {
      this.crossKey = key;
      this.$cross.className = `w-${d.sight}` + (this.onTarget ? ' ' + this.onTarget : '') + (show ? '' : ' hidden');
      this.$sight.className = (this.onTarget ? 'on-' + this.onTarget : '') + (this.sighting ? '' : ' hidden');
    }
  }

  // Treffer- bzw. Abschussmarke in der Bildmitte (nur beim Zielen)
  hitMark(kill) {
    this.audio.beep(kill ? 700 : 1500, kill ? 0.09 : 0.03, 0, 'triangle', kill ? 0.08 : 0.05);
    if (!this.aiming) return;
    const el = this.$hit;
    el.className = ''; void el.offsetWidth; el.className = kill ? 'on kill' : 'on';
  }

  startReload() {
    const d = this.def;
    if (!d.mag || this.reloadT > 0) return;
    this.reloadT = d.reload;
    this.audio.beep(420, 0.05, 0, 'square', 0.06); this.audio.beep(300, 0.05, 0.12, 'square', 0.05);
  }

  // Ursprung der Schüsse: Mündung vor der rechten Hand bzw. Fenster des Autos
  muzzle(vehicle, dir) {
    if (vehicle) {
      const side = (dir.x * Math.cos(vehicle.heading) - dir.z * Math.sin(vehicle.heading)) > 0 ? 1 : -1;
      return { x: vehicle.x + Math.cos(vehicle.heading) * 0.9 * side + dir.x, y: vehicle.y + 1.35, z: vehicle.z - Math.sin(vehicle.heading) * 0.9 * side + dir.z };
    }
    const p = this.player(), h = p.heading, d = this.def;
    if (this.sighting) { // Mündung knapp unter der Bildmitte vor der Kamera
      const c = this.camera.position;
      return { x: c.x + dir.x * 0.7, y: c.y + dir.y * 0.7 - 0.07, z: c.z + dir.z * 0.7 };
    }
    const fwd = d.hands === 2 ? 0.75 : 0.62;
    return { x: p.x + Math.sin(h) * fwd - Math.cos(h) * 0.3, y: p.y + 1.45 + Math.sin(this.aimPitch) * fwd, z: p.z + Math.cos(h) * fwd + Math.sin(h) * 0.3 };
  }

  // ---------- Angriff ----------
  attack(vehicle) {
    const d = this.def, inv = this.inv(), p = this.player();
    if (d.melee) { this.melee(); return; }
    if (d.throw) {
      if (!(inv.ammo > 0)) { this.empty(); return; }
      this.cool = d.rate;
      inv.ammo--;
      this.throwGrenade();
      if (!inv.ammo) this.dropEmpty();
      this.persist();
      return;
    }
    if (!(inv.clip > 0)) { this.empty(); return; }
    this.cool = d.rate;
    inv.clip--;
    // Richtung: frei zielen (Kamera-Mitte) oder Zielhilfe auf das nächste Ziel, sonst geradeaus
    let origin, dir, camRay = null;
    const tgt = this.aiming ? null : this.pickTarget(vehicle);
    if (this.aiming) {
      this.camera.getWorldDirection(this._v);
      camRay = { o: this.camera.position.clone(), d: { x: this._v.x, y: this._v.y, z: this._v.z } };
      dir = camRay.d;
    } else if (tgt) {
      const m = this.muzzle(vehicle, { x: 0, y: 0, z: 0 });
      dir = U3.norm({ x: tgt.x - m.x, y: tgt.y - m.y, z: tgt.z - m.z });
    } else {
      const yaw = this.cam.yaw;
      dir = { x: Math.sin(yaw), y: vehicle ? 0 : -0.02, z: Math.cos(yaw) };
    }
    if (!vehicle) {
      this.aimYaw = Math.atan2(dir.x, dir.z); this.aimHold = 0.9;
      if (!this.aiming) this.aimPitch = Math.asin(U.clamp(dir.y, -0.9, 0.9));
      p.heading = this.aimYaw; p.pose.aim = d.hands || 1; p.pose.pitch = this.aimPitch; p.sync();
    }
    origin = this.muzzle(vehicle, dir);
    // Mündungsfeuer, Knall
    this.fx.particle(origin.x, origin.y, origin.z, { color: '#ffd27a', add: true, life: 0.06, size: d.hands === 2 ? 0.7 : 0.5, grow: -0.6 });
    this.flash.position.set(origin.x, origin.y, origin.z); this.flash.intensity = 30; this.flashT = 0.05;
    this.audio.noise(d.snd[0], d.snd[1], d.snd[2]);
    this.audio.beep(110, 0.07, 0, 'square', d.hands === 2 ? 0.14 : 0.09);
    const spread = this.spreadNow(vehicle);
    this.bloom = Math.min(1, this.bloom + (d.bloom || 0.2)); this.sinceShot = 0;
    let best = 0;
    for (let k = 0; k < (d.pellets || 1); k++) {
      const dd = U3.norm({ x: dir.x + U3.rnd() * spread, y: dir.y + U3.rnd() * spread, z: dir.z + U3.rnd() * spread });
      // beim freien Zielen zählt der Strahl aus der Kamera (ab Höhe der Figur), sonst aus der Mündung
      let o = origin, skipT = 0;
      if (camRay) { o = camRay.o; skipT = Math.max(0, U3.along(camRay.o, dd, p) - 0.2); }
      const h = this.ray(o, dd, d.range + skipT, vehicle, skipT);
      const end = { x: o.x + dd.x * h.t, y: o.y + dd.y * h.t, z: o.z + dd.z * h.t };
      if (k < 3) this.tracer(origin, end);
      best = Math.max(best, this.applyHit(h, end, dd, d));
    }
    if (best) this.hitMark(best === 2);
    // Schüsse scheuchen die Leute auf; vor den Augen der Polizei gibt es einen Stern
    const px = vehicle ? vehicle.x : p.x, pz = vehicle ? vehicle.z : p.z;
    this.peds.panic(px, pz, 35);
    if (this.police.stars === 0 && this.reportT <= 0) {
      this.reportT = 1.5;
      if (this.police.witness(px, pz, 90)) this.police.crime(0, 'Schüsse! Die Polizei hat es gesehen', 1);
    }
    if (!inv.clip && !inv.ammo) this.dropEmpty();
    this.persist();
  }

  // leer geschossen: Klicken, auf die nächste Waffe mit Munition wechseln
  empty() {
    this.cool = 0.3;
    this.audio.beep(1900, 0.025, 0, 'square', 0.05);
    this.dropEmpty();
  }
  dropEmpty() {
    const inv = this.inv();
    if (this.def.melee || inv.clip > 0 || inv.ammo > 0) return;
    const next = this.owned().filter(id => id !== this.id && (WEAPONS[id].melee || this.save.weapons[id].clip > 0 || this.save.weapons[id].ammo > 0)).pop();
    if (this.def.throw) delete this.save.weapons.grenade;
    this.ui.toast(`${this.def.name}: keine Munition mehr`, 1.6);
    this.select(next || 'fist', true);
  }

  // Zielhilfe: nächstes Ziel (Polizisten zuerst, dann Passanten) im Kegel vor dem Spieler mit freier Sicht
  pickTarget(vehicle) {
    const p = this.player(), d = this.def;
    const o = vehicle ? { x: vehicle.x, y: vehicle.y + 1.35, z: vehicle.z } : { x: p.x, y: p.y + 1.45, z: p.z };
    const yaw = vehicle ? this.cam.yaw : (this.aimHold > 0 ? this.aimYaw : this.cam.yaw);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), range = Math.min(d.range || 30, 45);
    const list = [];
    const add = (x, y, z, s, obj, kind) => {
      const dx = x - o.x, dz = z - o.z, dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.8) return;
      const cos = (dx * fx + dz * fz) / dist;
      if (cos < 0.86) return; // ≈ 30°
      list.push({ x, y, z, obj, kind, score: dist * (1 + (1 - cos) * 12) * s });
    };
    for (const q of this.police.officers) if (q.state === 'run') add(q.fig.x, q.fig.y + 1.3, q.fig.z, 0.6, q, 'officer');
    for (const q of this.peds.list) if (q.state !== 'down') add(q.x, q.y + 1.25 * q.scale, q.z, 1, q, 'ped');
    list.sort((a, b) => a.score - b.score);
    for (const c of list.slice(0, 4)) {
      const dir = U3.norm({ x: c.x - o.x, y: c.y - o.y, z: c.z - o.z }), len = Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z);
      if (this.wallHit(o, dir, len - 0.5) === Infinity) return c;
    }
    return null;
  }

  // Markierung über dem eingerasteten Ziel (wie in GTA), alle 0,15 s neu gesucht
  updateLock(dt, onFoot, vehicle) {
    const d = this.def;
    const show = (onFoot || (vehicle && d.driveBy)) && !this.aiming && !d.melee && !d.throw && (this.aimHold > 0 || this.keys.Mouse0 || document.body.classList.contains('touch'));
    this.lockT -= dt;
    if (!show) { this.lock = null; this.$lock.classList.add('hidden'); return; }
    if (this.lockT <= 0) { this.lockT = 0.15; this.lock = this.pickTarget(vehicle); }
    const L = this.lock;
    if (!L || (L.kind === 'ped' && L.obj.state === 'down') || (L.kind === 'officer' && L.obj.state !== 'run')) { this.$lock.classList.add('hidden'); return; }
    const x = L.kind === 'officer' ? L.obj.fig.x : L.obj.x, z = L.kind === 'officer' ? L.obj.fig.z : L.obj.z;
    const y = (L.kind === 'officer' ? L.obj.fig.y : L.obj.y) + 2.25;
    this._v.set(x, y, z).project(this.camera);
    if (this._v.z > 1) { this.$lock.classList.add('hidden'); return; }
    this.$lock.classList.remove('hidden');
    this.$lock.classList.toggle('cop', L.kind === 'officer');
    this.$lock.style.transform = `translate(${(this._v.x + 1) / 2 * innerWidth}px, ${(1 - this._v.y) / 2 * innerHeight}px)`;
  }

  // ---------- Treffer berechnen ----------
  // Strahl gegen Passanten, Polizisten, Autos, Häuser und Boden; skip: eigenes Auto, minT: erst ab dieser Länge
  ray(o, d, range, skip, minT = 0) {
    let best = { t: range, type: null, obj: null };
    const cyl = (cx, cy, cz, r, h) => {
      const ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z;
      if (a < 1e-6) return Infinity;
      const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r, disc = b * b - a * c;
      if (disc < 0) return Infinity;
      const s = Math.sqrt(disc);
      let t = (-b - s) / a;
      if (t < minT) t = (-b + s) / a;
      if (t < minT) return Infinity;
      const y = o.y + d.y * t;
      return y >= cy && y <= cy + h ? t : Infinity;
    };
    const near = (x, z) => { const dx = x - o.x, dz = z - o.z; const t = dx * d.x + dz * d.z; return t > -3 && t < best.t + 3 && Math.abs(dx * d.z - dz * d.x) < 4; };
    for (const q of this.peds.list) {
      if (q.state === 'down' || !near(q.x, q.z)) continue;
      const t = cyl(q.x, q.y, q.z, 0.34 * q.scale, 1.85 * q.scale);
      if (t < best.t) best = { t, type: 'ped', obj: q };
    }
    for (const q of this.police.officers) {
      if (q.state !== 'run' || !near(q.fig.x, q.fig.z)) continue;
      const t = cyl(q.fig.x, q.fig.y, q.fig.z, 0.36, 1.95);
      if (t < best.t) best = { t, type: 'officer', obj: q };
    }
    for (const c of this.cars()) {
      if (c === skip || c.disposed || !near(c.x, c.z)) continue;
      const t = this.boxHit(o, d, c, minT);
      if (t < best.t) best = { t, type: 'car', obj: c };
    }
    const w = this.wallHit(o, d, best.t, minT);
    if (w < best.t) best = { t: w, type: 'wall', obj: null };
    return best;
  }

  // Auto als Quader (Länge × Breite × 1,45 m) im Fahrzeugsystem
  boxHit(o, d, c, minT = 0) {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading), ox = o.x - c.x, oz = o.z - c.z;
    const lo = [ox * fx + oz * fz, o.y - c.y, ox * fz - oz * fx], ld = [d.x * fx + d.z * fz, d.y, d.x * fz - d.z * fx];
    const mn = [-CAR.length / 2, 0.15, -CAR.width / 2], mx = [CAR.length / 2, 1.45, CAR.width / 2];
    let t0 = minT, t1 = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ld[i]) < 1e-6) { if (lo[i] < mn[i] || lo[i] > mx[i]) return Infinity; continue; }
      let a = (mn[i] - lo[i]) / ld[i], b = (mx[i] - lo[i]) / ld[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return Infinity;
    }
    return t0;
  }

  // erste Hauswand oder Bodenstelle entlang des Strahls (in Schritten von 0,5 m)
  wallHit(o, d, maxT, minT = 0) {
    const W = this.world;
    for (let t = Math.max(0.3, minT); t < maxT; t += 0.5) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < W.heightAt(x, z) - 0.05) return t;
      const b = W.insideBuilding(x, z, 0);
      if (b && y < b.top) return t;
    }
    return Infinity;
  }

  // Wirkung eines Treffers: 0 Wand/nichts, 1 Ziel getroffen, 2 Ziel ausgeschaltet
  applyHit(h, at, dir, d) {
    const fx = this.fx;
    if (h.type === 'ped') {
      this.blood(at.x, at.y, at.z, dir);
      const q = h.obj;
      if (this.peds.hurt(q, d.dmg, dir.x, dir.z)) { this.pedDown(q); return 2; }
      if (this.police.witness(q.x, q.z, 80)) this.police.crime(0.15, 'Passant verletzt!', 1);
      return 1;
    }
    if (h.type === 'officer') {
      this.blood(at.x, at.y, at.z, dir);
      if (this.police.shootOfficer(h.obj, d.dmg)) { this.drop('weapon', h.obj.fig.x, h.obj.fig.z, 'pistol', 12); return 2; }
      return 1;
    }
    if (h.type === 'car') {
      const c = h.obj;
      for (let i = 0; i < 3; i++) fx.particle(at.x, at.y, at.z, { color: '#ffe08a', add: true, life: 0.18, size: 0.16, vx: U3.rnd() * 4, vy: 1 + Math.random() * 3, vz: U3.rnd() * 4 });
      if (!c.remote) {
        c.hit(d.carDmg || 4);
        c.sleeping = false;
        if (c.kind === 'police' && !c.isPlayer && !c.wrecked) { this.police.hostileT = 30; this.police.crime(0.2, 'Auf einen Streifenwagen geschossen!', 2); }
      }
      return 1;
    }
    if (h.type === 'wall') {
      for (let i = 0; i < 2; i++) fx.particle(at.x, at.y, at.z, { color: '#ffd890', add: true, life: 0.12, size: 0.14, vx: -dir.x * 3 + U3.rnd() * 2, vy: Math.random() * 2, vz: -dir.z * 3 + U3.rnd() * 2 });
      fx.particle(at.x - dir.x * 0.2, at.y, at.z - dir.z * 0.2, { color: '#b9b2a4', life: 0.7, size: 0.3, grow: 1.6, alpha: 0.55, vy: 0.5 });
    }
    return 0;
  }

  blood(x, y, z, dir) {
    for (let i = 0; i < 3; i++) this.fx.particle(x, y, z, { color: '#8a0f0f', life: 0.45, size: 0.28, grow: 1, alpha: 0.85,
      vx: dir.x * 2 + U3.rnd() * 1.5, vy: 0.5 + Math.random(), vz: dir.z * 2 + U3.rnd() * 1.5 });
  }

  // Passant liegt: Geld fallen lassen, Zeugen rufen die Polizei
  pedDown(q) {
    this.drop('cash', q.x, q.z, null, 5 + Math.floor(Math.random() * 36));
    if (this.police.witness(q.x, q.z, 100)) this.police.crime(0.6, 'Passant niedergeschossen!', 1);
    else if (Math.random() < 0.5) this.police.crime(0.3, 'Passant niedergeschossen! Zeugen rufen die Polizei', 1);
  }

  // Faust und Schläger: nächstes Ziel vor dem Spieler
  melee() {
    const d = this.def, p = this.player();
    this.cool = d.rate;
    p.pose.swing = 1; this.aimHold = 0;
    const yaw = p.moveSpeed > 0.5 ? p.heading : this.cam.yaw;
    p.heading = yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null, bd = d.range + 0.5;
    const look = (x, z, obj, kind) => {
      const dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz);
      if (dist < bd && (dx * fx + dz * fz) / (dist || 1) > 0.45) { bd = dist; best = { obj, kind }; }
    };
    for (const q of this.peds.list) if (q.state !== 'down') look(q.x, q.z, q, 'ped');
    for (const q of this.police.officers) if (q.state === 'run') look(q.fig.x, q.fig.z, q, 'officer');
    for (const c of this.cars()) if (!c.disposed && !c.remote && Math.hypot(c.x - p.x, c.z - p.z) < 3.4) look(c.x, c.z, c, 'car');
    if (!best) { this.audio.noise(0.12, 900, 0.12); return; }
    this.audio.thump(d.dmg > 30 ? 10 : 6);
    if (best.kind === 'ped') {
      if (this.peds.hurt(best.obj, d.dmg, fx, fz)) this.pedDown(best.obj);
      else if (this.police.witness(best.obj.x, best.obj.z, 60)) this.police.crime(0.15, 'Schlägerei!', 1);
    } else if (best.kind === 'officer') {
      if (this.police.shootOfficer(best.obj, d.dmg * 0.6, 'Polizist angegriffen!')) this.drop('weapon', best.obj.fig.x, best.obj.fig.z, 'pistol', 12);
    } else if (this.id === 'bat') {
      best.obj.hit(3); best.obj.sleeping = false;
      if (best.obj.kind === 'police' && !best.obj.isPlayer) this.police.crime(0.2, 'Streifenwagen beschädigt!', 1);
    }
  }

  // ---------- Granaten ----------
  // Abwurf: Ort und Geschwindigkeit (beim Zielen in Kamerarichtung, sonst schräg nach vorn)
  grenadeLaunch() {
    const p = this.player(), sp = 15;
    let dir;
    if (this.aiming) { this.camera.getWorldDirection(this._v); dir = U3.norm({ x: this._v.x, y: this._v.y + 0.35, z: this._v.z }); }
    else { const yaw = this.cam.yaw; dir = U3.norm({ x: Math.sin(yaw), y: 0.5, z: Math.cos(yaw) }); }
    return { x: p.x + dir.x * 0.6, y: p.y + 1.7, z: p.z + dir.z * 0.6, vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp, dir };
  }

  // Wurfbahn bis zum ersten Aufschlag (ohne Abpraller) vorausberechnen und zeigen
  updateArc() {
    const show = this.aiming && this.def.throw && this.inv().ammo > 0;
    this.arc.visible = this.arcRing.visible = !!show;
    if (!show) return;
    const W = this.world, L = this.grenadeLaunch(), P = this.arcPts;
    let { x, y, z, vx, vy, vz } = L, n = 0;
    for (; n < 60; n++) {
      P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z;
      const g = W.groundAt ? W.groundAt(x, z, y) : W.heightAt(x, z), b = W.insideBuilding(x, z, 0);
      if (n > 0 && (y < g + 0.08 || (b && y < b.top))) break;
      x += vx * 0.04; y += vy * 0.04; z += vz * 0.04; vy -= 16 * 0.04;
    }
    n = Math.min(n, 59);
    for (let k = n + 1; k < 60; k++) { P[k * 3] = P[n * 3]; P[k * 3 + 1] = P[n * 3 + 1]; P[k * 3 + 2] = P[n * 3 + 2]; }
    this.arc.geometry.attributes.position.needsUpdate = true;
    const ex = P[n * 3], ez = P[n * 3 + 2];
    this.arcRing.position.set(ex, (W.groundAt ? W.groundAt(ex, ez, P[n * 3 + 1] + 1) : W.heightAt(ex, ez)) + 0.06, ez);
  }

  throwGrenade() {
    const p = this.player(), L = this.grenadeLaunch();
    p.heading = Math.atan2(L.dir.x, L.dir.z); p.pose.swing = 1; this.aimHold = 0;
    const m = new THREE.Mesh(this.grenadeGeo, _wm.mats ? _wm.mats.green : new THREE.MeshLambertMaterial({ color: '#3d4a2c' }));
    m.castShadow = true;
    this.scene.add(m);
    this.grenades.push({ m, x: L.x, y: L.y, z: L.z, vx: L.vx, vy: L.vy, vz: L.vz, t: 2.1 });
    this.audio.noise(0.15, 700, 0.12);
  }

  updateGrenades(dt) {
    const W = this.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t -= dt;
      g.vy -= 16 * dt;
      const nx = g.x + g.vx * dt, nz = g.z + g.vz * dt;
      const b = W.insideBuilding(nx, nz, 0.1);
      if (b && g.y < b.top) { g.vx *= -0.4; g.vz *= -0.4; } else { g.x = nx; g.z = nz; }
      g.y += g.vy * dt;
      const ground = W.groundAt ? W.groundAt(g.x, g.z, g.y) : W.heightAt(g.x, g.z);
      if (g.y < ground + 0.08) {
        g.y = ground + 0.08;
        if (g.vy < -2) this.audio.beep(260, 0.03, 0, 'triangle', 0.04);
        g.vy = Math.abs(g.vy) * 0.32; g.vx *= 0.55; g.vz *= 0.55;
      }
      g.m.position.set(g.x, g.y, g.z);
      if (g.t <= 0) {
        this.scene.remove(g.m);
        this.grenades.splice(i, 1);
        const n = this.blast(g.x, g.y, g.z);
        if (n && (this.police.witness(g.x, g.z, 120) || Math.random() < 0.6)) this.police.crime(0.8, 'Anschlag mit einer Granate!', 2);
        else if (!this.police.stars && this.police.witness(g.x, g.z, 120)) this.police.crime(0, 'Explosion! Die Polizei hat es gesehen', 1);
      }
    }
  }

  // ---------- Pickups: Geld und Waffen zum Aufsammeln ----------
  drop(kind, x, z, id, amount) {
    if (this.pickups.length > 30) this.removePickup(0);
    let m;
    if (kind === 'cash') {
      m = new THREE.Mesh(_wm.cash || (_wm.cash = new THREE.BoxGeometry(0.34, 0.1, 0.2)),
        _wm.cashMat || (_wm.cashMat = new THREE.MeshLambertMaterial({ color: '#4caf50', emissive: '#1d5a1d' })));
    } else {
      m = new THREE.Group();
      const g = weaponModel(id); g.scale.setScalar(1.8); g.rotation.y = Math.PI / 2; m.add(g);
      const b = makeBeacon(GUN_COLOR, 0.45, 1.4); b.position.y = -0.55; m.add(b); m.userData.beacon = b;
    }
    const y = this.world.groundAt ? this.world.groundAt(x, z, Infinity) : this.world.heightAt(x, z);
    m.position.set(x, y + 0.55, z);
    this.scene.add(m);
    this.pickups.push({ kind, id, amount, x, y, z, m, t: 0 });
  }
  removePickup(i) {
    const m = this.pickups[i].m, b = m.userData.beacon;
    if (b) { b.geometry.dispose(); b.material.dispose(); } // Waffenmodell und Geldschein teilen ihre Formen
    this.scene.remove(m); this.pickups.splice(i, 1);
  }

  updatePickups(dt, onFoot) {
    const p = this.player(), car = this.car();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      k.m.rotation.y += dt * 2.2;
      k.m.position.y = k.y + 0.55 + Math.sin(k.t * 3) * 0.08;
      if (k.t > 70) { this.removePickup(i); continue; }
      const who = onFoot ? p : car;
      if (k.t < 0.6 || !who || Math.hypot(who.x - k.x, who.z - k.z) > (onFoot ? 1.3 : 2.4)) continue;
      if (k.kind === 'cash') { this.addMoney(k.amount); this.ui.toast(`+ € ${k.amount}`, 1); }
      else if (onFoot) {
        const def = WEAPONS[k.id], inv = this.save.weapons[k.id];
        if (inv) inv.ammo = (inv.ammo || 0) + k.amount;
        else { this.save.weapons[k.id] = { clip: Math.min(def.mag, k.amount), ammo: Math.max(0, k.amount - def.mag) }; if (this.def.melee) this.select(k.id, true); }
        this.audio.beep(990, 0.06, 0, 'square', 0.07); this.audio.beep(1320, 0.08, 0.07, 'square', 0.07);
        this.ui.toast(`${def.name} + ${k.amount} Schuss`, 1.6);
        this.persist();
      } else continue;
      this.removePickup(i);
    }
  }

  // ---------- Effekte ----------
  tracer(a, b) {
    if (this.tracers.length >= this.trMax) this.tracers.shift();
    this.tracers.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], t: 0.05 });
  }
  updateTracers(dt) {
    const P = this.trPos;
    for (let i = this.tracers.length - 1; i >= 0; i--) if ((this.tracers[i].t -= dt) <= 0) this.tracers.splice(i, 1);
    P.fill(0);
    this.tracers.forEach((r, i) => {
      // nur das vordere Stück der Strecke zeichnen, das mit der Zeit nach vorn wandert
      const f0 = 1 - r.t / 0.05, f1 = Math.min(1, f0 + 0.55);
      for (let k = 0; k < 3; k++) { P[i * 6 + k] = r.a[k] + (r.b[k] - r.a[k]) * f0 * 0.6; P[i * 6 + 3 + k] = r.a[k] + (r.b[k] - r.a[k]) * f1; }
    });
    this.trLines.geometry.attributes.position.needsUpdate = true;
  }

  // Schuss eines Polizisten auf den Spieler (Treffer hat police.js schon gewürfelt)
  npcShot(fig, target, hit) {
    const h = fig.heading;
    const o = { x: fig.x + Math.sin(h) * 0.62 - Math.cos(h) * 0.3, y: fig.y + 1.45, z: fig.z + Math.cos(h) * 0.62 + Math.sin(h) * 0.3 };
    const e = { x: target.x + (hit ? 0 : U3.rnd() * 2.5), y: target.y + (hit ? 0 : U3.rnd()), z: target.z + (hit ? 0 : U3.rnd() * 2.5) };
    this.tracer(o, e);
    this.fx.particle(o.x, o.y, o.z, { color: '#ffd27a', add: true, life: 0.06, size: 0.45, grow: -0.6 });
    const p = this.player(), dist = Math.hypot(fig.x - p.x, fig.z - p.z);
    this.audio.noise(0.2, 2200, U.clamp(0.75 - dist / 60, 0.08, 0.6));
    if (hit) this.blood(e.x, e.y, e.z, U3.norm({ x: e.x - o.x, y: 0, z: e.z - o.z }));
  }

  // ---------- Waffenladen ----------
  placeShop(def) {
    const W = this.world;
    let x = def.x, z = def.z;
    if (def.geo) {
      if (!W.region) return;
      const O = W.data.meta.origin, mLat = 110540, mLon = 111320 * Math.cos(O.lat * Math.PI / 180);
      x = (def.geo[1] - O.lon) * mLon; z = -(def.geo[0] - O.lat) * mLat;
    }
    // auf den Gehsteig neben der nächsten Straße
    const r = W.nearestRoad(x, z, 250, s => s.k === 'road' && !/motorway|trunk/.test(s.h || ''));
    if (r) {
      const s = r.seg;
      let dx = s.bx - s.ax, dz = s.bz - s.az;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const off = s.w / 2 + 1.6;
      for (const sd of [1, -1]) {
        const qx = r.x - dz * off * sd, qz = r.z + dx * off * sd;
        if (!W.insideBuilding(qx, qz, 0.8)) { x = qx; z = qz; break; }
      }
    }
    const y = W.heightAt(x, z);
    const b = makeBeacon(GUN_COLOR, 1.2, 6);
    b.position.set(x, y - 0.3, z);
    this.scene.add(b);
    if (W.region) W.region.anchor(b, x, z, -0.3);
    const lab = makeLabel(def.name, GUN_COLOR, 'Waffen, Munition, Schutzweste · F');
    lab.position.set(x, y + 4.5, z);
    lab.userData.range = 350;
    if (W.region) W.region.anchor(lab, x, z, 4.5);
    this.ui.addLabel(lab, this.scene);
    this.shops.push({ name: def.name, x, z, beacon: b });
  }

  // Säule aus der Nähe ausblenden, sonst färbt sie das ganze Bild rot, wenn man im Laden steht
  fadeShops(x, z) {
    for (const s of this.shops) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 40) s.beacon.material.opacity = 0.8 * U.clamp((d - 1.5) / 6, 0.12, 1);
    }
  }

  shopAt(x, z) { return this.shops.find(s => Math.hypot(s.x - x, s.z - z) < 2.6) || null; }
  mapPlaces() { return this.shops.map(s => ({ type: 'guns', name: s.name, x: s.x, z: s.z })); }

  openShop(shop) {
    const P = this.property;
    P.openMenu('theme-guns', () => {
      const money = this.save.money;
      const rows = WEAPON_ORDER.filter(id => WEAPONS[id].price).map(id => {
        const d = WEAPONS[id], inv = this.save.weapons[id];
        const stats = d.melee ? 'Nahkampf' : d.throw ? `${d.pack} Stück` : `Magazin ${d.mag} · ${d.pack} Schuss dabei`;
        const have = inv ? (d.melee ? 'Hast du' : d.throw ? `Hast du: ${inv.ammo || 0}` : `Hast du: ${(inv.clip || 0) + (inv.ammo || 0)} Schuss`) : '';
        let btn;
        if (!inv || d.throw) btn = `<button class="mn-btn primary" data-act="buy" data-id="${id}" ${money < d.price ? 'disabled' : ''}>${d.throw && inv ? '+' + d.pack : 'Kaufen'} ${euro(d.price)}</button>`;
        else if (d.melee) btn = '<button class="mn-btn" disabled>Gekauft</button>';
        else btn = `<button class="mn-btn" data-act="ammo" data-id="${id}" ${money < d.ammoPrice ? 'disabled' : ''}>+${d.pack} Schuss ${euro(d.ammoPrice)}</button>`;
        const bar = (label, v) => `<div class="mn-stat"><span>${label}</span><i><b style="width:${Math.round(U.clamp(v, 0.05, 1) * 100)}%"></b></i></div>`;
        const dps = d.melee ? d.dmg / d.rate / 130 : d.throw ? 1 : d.dmg * (d.pellets || 1) / d.rate / 300;
        return `<div class="gn-row">
          <svg class="gn-ico" viewBox="0 0 64 32">${WEAPON_ICON[id]}</svg>
          <div class="vn-txt"><b>${d.name}</b><span>${d.tag} · ${stats}</span>${have ? `<span class="vn-hp">${have}</span>` : ''}</div>
          <div class="gn-stats">${bar('Wirkung', dps)}${bar('Reichweite', d.melee ? 0.04 : d.throw ? 0.3 : d.range / 120)}</div>
          <div class="gn-buy">${btn}</div>
        </div>`;
      }).join('');
      const a = this.save.armor;
      const armor = `<div class="gn-row">
          <svg class="gn-ico" viewBox="0 0 64 32"><path d="M32 2l16 6v9c0 7-7 12-16 14-9-2-16-7-16-14V8z"/></svg>
          <div class="vn-txt"><b>Schutzweste</b><span>Fängt Treffer, Explosionen und Unfälle ab, bis sie aufgebraucht ist</span>${a > 0 ? `<span class="vn-hp">Weste: ${Math.round(a)} %</span>` : ''}</div>
          <div class="gn-stats"></div>
          <div class="gn-buy"><button class="mn-btn primary" data-act="armor" ${money < ARMOR_PRICE || a >= 100 ? 'disabled' : ''}>${a >= 100 ? 'Voll' : 'Kaufen ' + euro(ARMOR_PRICE)}</button></div>
        </div>`;
      return `<div class="mn-head"><span class="mn-badge t-guns">Waffen</span><h2>${shop.name}</h2><button class="mn-x" data-act="close" aria-label="Schließen">✕</button></div>
        <div class="mn-sub">Waffe wählen: <kbd>1</kbd>–<kbd>7</kbd> oder <kbd>Q</kbd> · Schießen: linke Maustaste · Zielen: rechte Maustaste · Visier: <kbd>V</kbd> · Nachladen: <kbd>R</kbd>.
          Wer verhaftet wird, verliert seine Waffen.</div>
        <div class="vn-list">${rows}${armor}</div>
        <div class="mn-foot">${P.moneyLine()}<button class="mn-btn ghost" data-act="close">Schließen</button></div>`;
    }, (act, ds) => {
      if (act === 'close') { P.closeMenu(true); return; }
      const d = WEAPONS[ds.id];
      if (act === 'buy' && this.save.money >= d.price) {
        this.addMoney(-d.price);
        const inv = this.save.weapons[ds.id];
        if (d.throw) { if (inv) inv.ammo += d.pack; else this.save.weapons[ds.id] = { ammo: d.pack }; }
        else this.save.weapons[ds.id] = d.melee ? {} : { clip: d.mag, ammo: d.pack - d.mag };
        if (!inv) this.select(ds.id, true);
      } else if (act === 'ammo' && this.save.money >= d.ammoPrice) {
        this.addMoney(-d.ammoPrice);
        this.save.weapons[ds.id].ammo = (this.save.weapons[ds.id].ammo || 0) + d.pack;
      } else if (act === 'armor' && this.save.money >= ARMOR_PRICE && this.save.armor < 100) {
        this.addMoney(-ARMOR_PRICE);
        this.save.armor = 100;
      }
      this.persist();
      P.renderMenu();
    });
  }
}

// kleine Vektorhelfer
const U3 = {
  norm(v) { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; },
  rnd() { return Math.random() * 2 - 1; },
  // Länge entlang des Strahls (Richtung d ab o) bis auf Höhe des Punkts p
  along(o, d, p) { return (p.x - o.x) * d.x + (p.y + 1.4 - o.y) * d.y + (p.z - o.z) * d.z; },
};
