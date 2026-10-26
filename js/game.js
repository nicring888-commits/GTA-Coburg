// Hauptprogramm von GTA Coburg: Szene, Licht, Eingabe, Kamera, Spielzustand (Geld, Fahndung, Leben),
// Polizei, Rennen, Explosionen und die Hauptschleife.
'use strict';

(function () {
  const $ = id => document.getElementById(id);
  // Lader aus js/boot.js (Fortschritt, Fehlermeldung); ohne ihn nur den Ladetext setzen
  const boot = window.Boot || { progress: (t, f) => { $('load-text').textContent = t; $('load-bar').style.width = Math.round(f * 100) + '%'; },
    fail: (t, d) => { $('load-text').textContent = t + (d ? ' ' + d : ''); }, done() {} };
  const Q = window.QUALITY || { antialias: true, shadow: 0, ensure: 1400 };
  if (!window.THREE) { boot.fail('three.js konnte nicht geladen werden.', 'Bitte Internetverbindung prüfen.'); return; }
  if (!window.COBURG) { boot.fail('Kartendaten fehlen (data/coburg.js).', 'Bitte tools/convert.js ausführen.'); return; }

  // ---------- Renderer und Szene ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: Q.antialias !== false, powerPreference: Q.phone ? 'default' : 'high-performance' });
  } catch (e) {
    boot.fail('3D-Grafik (WebGL) ist auf diesem Gerät nicht verfügbar.',
      'Auf dem iPhone: Blockierungsmodus für diese Seite ausschalten (Safari: aA → Website-Einstellungen) oder andere Tabs schließen und neu laden.');
    return;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Nachbearbeitung (js/post.js): HDR mit MSAA, Umgebungsverdeckung, Luftperspektive, Bloom, filmische Tonwertkurve
  // und Farbkorrektur; setzt Auflösung und Tonwertkurve je Qualitätsstufe (Taste O)
  const post = new PostFX(renderer);
  $('app').appendChild(renderer.domElement);
  // Grafikspeicher voll (häufig auf dem iPhone): verständlich melden statt schwarzes Bild
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    const msg = 'Die 3D-Grafik wurde vom Gerät beendet (zu wenig Grafikspeicher).';
    if (!boot.finished) { boot.fail(msg, 'Bitte die leichte Grafik laden.'); return; }
    $('loading').classList.remove('hidden'); $('loading').classList.add('error');
    $('load-text').textContent = msg; $('load-detail').textContent = 'Neu laden oder die leichte Grafik wählen.';
    $('load-actions').classList.remove('hidden');
  });

  const scene = new THREE.Scene();
  const BASE_FOV = 65;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.3, 4000);
  scene.fog = new THREE.Fog('#c8dbec', 300, 2800);

  const hemi = new THREE.HemisphereLight('#cfe2ff', '#6f6a55', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 3);
  // Sonne aus Südsüdost wie zur Aufnahmezeit der Luftbilder, damit 3D-Schatten und Fotoschatten zusammenpassen
  const SUN_DIR = new THREE.Vector3(0.15, 1.3, 0.95).normalize();
  sun.castShadow = true;
  // große Schattenkarte, wenn die Grafikkarte sie kann (schärfere Schatten bei gleicher Reichweite)
  const MAX_SHADOW = Math.min(renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048, Q.shadow || Infinity);
  let SC = 110;
  sun.shadow.bias = -0.0005;
  const setShadow = q => {
    const px = Math.min(q.shadow, MAX_SHADOW);
    if (sun.shadow.mapSize.x !== px) {
      sun.shadow.mapSize.set(px, px);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    // Smartphones: kleinere Schattenkarte (Q.shadow) über kürzere Reichweite
    SC = px > 2048 ? 135 : px < 2048 ? 85 : 110;
    Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 700 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = px > 2048 ? 0.4 : px < 2048 ? 0.8 : 0.6;
  };
  post.onChange = setShadow;
  setShadow(post.q);
  scene.add(sun, sun.target);
  // Himmel, Wolken, Tageszeit, Wetter und Spiegelungen (js/atmosphere.js) steuern ab jetzt Sonne, Himmelslicht und
  // Nebel; SUN_DIR wird dabei mit dem Sonnenstand gedreht
  const atmo = new Atmosphere({ scene, renderer, sun, hemi, sunDir: SUN_DIR });
  atmo.post = post;

  // Scheinwerfer für das gefahrene Auto (nachts)
  const headlight = new THREE.SpotLight('#fff1d0', 0, 70, 0.55, 0.5, 1.2);
  headlight.castShadow = false;
  scene.add(headlight, headlight.target);

  // ---------- Spielstand (bleibt im Browser gespeichert) ----------
  const SAVE_KEY = 'gta-coburg-v1';
  let save = null;
  try { save = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { save = null; }
  if (!save || typeof save.money !== 'number') save = { money: 500, best: {} };
  save.best = save.best || {};
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ohne Speicher weiter */ } };

  // ---------- Welt laden ----------
  const world = new World(window.COBURG, scene, renderer);
  let ui, traffic, player, nav, fx, police, races, places, spawn, peds, props, property, life, net, lobby, weapons;
  let ride = null;         // Mehrspieler: Auto eines anderen Spielers, in dem man mitfährt
  let lastBoom = null;     // letzte Explosion (scheucht Tauben auf)
  const parked = [];       // Autos ohne KI (auch das eigene)
  const wrecks = [];       // ausgebrannte oder brennende Autos
  let car = null;          // Auto, in dem der Spieler sitzt
  let mode = 'walk';
  let night = false;
  let camMode = 0;         // 0 Verfolger, 1 Motorhaube
  let over = null;         // Verhaftet/Erledigt-Sequenz

  const progress = (text, f) => boot.progress(text, f);
  world.build(progress).then(() => {
    progress('Polizei und Rennstrecken …', 0.98);
    $('attr-ortho').classList.toggle('hidden', !world.ortho);
    $('attr-lod2').classList.toggle('hidden', !world.lod2);
    $('attr-bvv').classList.toggle('hidden', !world.ortho && !world.lod2);
    $('attr-th').classList.toggle('hidden', !(world.region && world.region.ortho && world.region.ortho.th));
    ui = new UI(world);
    ui.addLabels(scene);
    traffic = new Traffic(world, scene);
    player = new Player(scene);
    player.setOutfit(save.outfit);
    nav = new RoadNav(world);
    fx = new FX(scene);
    police = new Police({ world, scene, nav, traffic, fx, ui,
      others: () => nonPlayerCars().concat(races.cars()),
      onBusted: busted,
      onLost: c => { if (!wrecks.includes(c)) wrecks.push(c); },
      onEscaped: (stars, reward) => { ui.bigMessage('ENTKOMMEN', 2.5, '#7ee36f', `Die Polizei hat dich verloren · € ${reward}`); addMoney(reward); },
      armed: () => weapons && weapons.armed(),
      onShot: policeShot,
      onDown: o => { if (weapons && o.hp <= 0) weapons.drop('weapon', o.fig.x, o.fig.z, 'pistol', 12); },
    });
    races = new Races({ world, scene, nav, ui, audio, save, persist,
      addMoney: (n, why) => addMoney(n),
      adopt: c => { if (!wrecks.includes(c)) wrecks.push(c); },
    });
    places = new Places({ world, scene, ui, nav });
    property = new Property({ world, scene, ui, save, persist, audio, addMoney, parkCarNear, parked, hemi, sun, cam,
      player: () => player, car: () => car, mode: () => mode, stars: () => police.stars, night: () => night,
      setIndoor, sleep, lockPointer,
    });
    progress('Fußgänger und Stadtleben …', 0.99);
    peds = new Pedestrians(world, scene);
    // Waffen (js/weapons.js): Waffenläden, Schüsse, Granaten, Pickups
    weapons = new Weapons({ world, scene, fx, ui, audio, peds, police, property, camera, cam, save, persist, addMoney, keys, pressed,
      player: () => player, car: () => car, ride: () => ride, mode: () => mode, cars: allCars, blast });
    props = new CityProps(world, scene, peds, fx, ui);
    props.build();
    life = new TownLife(world, scene, peds, props, ui);
    spawn = bahnhofSpawn();
    if (world.region) {
      // Laternen, Ladenschilder und Lokale in den Orten nutzen dieselben Bausteine wie die Innenstadt
      world.region.props = props; world.region.property = property;
      progress('Landkreis um den Bahnhof aufbauen …', 0.995);
      world.region.ensure(spawn.x, spawn.z, Q.ensure);
      // Übersichtskarte des Landkreises nebenbei malen
      setTimeout(() => world.region.paintMap((canvas, scale) => { world.regionMap = { canvas, scale }; }), 1500);
    }
    respawn(true);
    // Mehrspieler (js/net.js): Schnittstelle zum Spiel
    net = new NetClient({ scene, ui, atmo, audio, camera, parked, lockPointer,
      car: () => car, stars: () => police.stars,
      pos: () => (mode === 'drive' ? { x: car.x, y: car.y, z: car.z } : { x: player.x, y: player.y, z: player.z }),
      look: () => ({ shirt: (save.outfit || {}).shirt, pants: (save.outfit || {}).pants }),
      enterCar, startRide, endRide, remoteBoom, correct,
      forceExit: () => { if (car) { ui.toast('Jemand anderes sitzt schon am Steuer', 2); exitCar(); } },
    });
    lobby = new NetLobby(net, w => {
      begin();
      ui.bigMessage('ONLINE', 3, '#3aa0ff', `${w.room.name} · ${w.players.length + 1} Spieler · Code ${w.room.code}`);
      net.sys(`Willkommen, ${w.name}! T = Chat, Tab = Spielerliste und Einladungslink`);
    });
    progress('Fertig', 1);
    boot.done();
    $('loading').classList.add('hidden');
    $('start').classList.remove('hidden');
    lobby.ready();
    renderer.compile(scene, camera);
    requestAnimationFrame(loop);
  }).catch(err => {
    console.error(err);
    boot.fail('Fehler beim Aufbau der Welt.', err && err.message);
  });

  const drivable = s => s.k === 'road' && !/motorway|trunk/.test(s.h || '');

  // Auto am Straßenrand neben einem Punkt abstellen
  function parkCarNear(x, z, color, kind) {
    const r = world.nearestRoad(x, z, 250, s => drivable(s) && s.h !== 'service' && s.w >= 6)
      || world.nearestRoad(x, z, 250, drivable);
    if (!r) return null;
    const s = r.seg;
    let dx = s.bx - s.ax, dz = s.bz - s.az;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // am rechten Rand parken, aber nicht in einer Hauswand
    let off = U.clamp(s.w / 2 - 1.2, 0, 2.5);
    const free = o => [-1.6, 0, 1.6].every(t => !world.collideCircle(r.x - dz * o + dx * t, r.z + dx * o + dz * t, 1, {}).hit);
    while (off > 0 && !free(off)) off -= 0.5;
    off = Math.max(0, off);
    const px = r.x - dz * off, pz = r.z + dx * off;
    // in die Richtung mit mehr freier Strecke schauen
    const room = sgn => { let d = 0; for (let t = 3; t <= 30; t += 3) { if (world.collideCircle(px + dx * t * sgn, pz + dz * t * sgn, 1, {}).hit) break; d = t; } return d; };
    const flip = room(-1) > room(1);
    const c = new Vehicle(scene, color, kind);
    c.place(px, pz, Math.atan2(dx, dz) + (flip ? Math.PI : 0), world);
    parked.push(c);
    return c;
  }

  // Spawnpunkt: Vorplatz des Coburger Bahnhofs, Blick zur Straße
  function bahnhofSpawn() {
    const st = ui.landmarks.find(l => l.name === 'Bahnhof') || { x: 0, z: 0 };
    const r = world.nearestRoad(st.x, st.z, 200, drivable) || { x: st.x, z: st.z };
    let dx = st.x - r.x, dz = st.z - r.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let p = { x: r.x, z: r.z };
    for (let t = 10; t >= 3; t -= 1) {
      const x = r.x + dx * t, z = r.z + dz * t;
      if (!world.insideBuilding(x, z, 0.8) && !world.collideCircle(x, z, 0.8, {}).hit) { p = { x, z }; break; }
    }
    return { x: p.x, z: p.z, heading: Math.atan2(-dx, -dz), roadX: r.x, roadZ: r.z };
  }

  // Neustart am Bahnhof (Spielbeginn, nach Festnahme oder Krankenhaus)
  function respawn(first) {
    if (races.active) races.stop();
    police.reset();
    if (ride) { ride = null; net.endedRide(); }
    if (car) { car.isPlayer = false; car = null; net.exited(); }
    mode = 'walk';
    player.health = 100;
    player.visible = true;
    player.place(spawn.x, spawn.z, world);
    player.heading = spawn.heading;
    cam.yaw = spawn.heading; cam.pitch = 0.3; cam.init = false;
    // ein Auto steht bereit
    if (!parked.some(c => !c.wrecked && Math.hypot(c.x - spawn.x, c.z - spawn.z) < 40)) parkCarNear(spawn.roadX, spawn.roadZ, '#c0392b');
    over = null;
    $('fade').classList.add('hidden');
    if (!first) { ui.toast('Zurück am Bahnhof', 2); net.teleported(); }
  }

  // ---------- Eingabe ----------
  const keys = {};
  const pressed = {};
  let started = false;
  addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // Namen, Lobby-Code, Chat tippen
    if (e.code === 'F1' || e.code === 'Tab') e.preventDefault();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const cam = { yaw: 0, pitch: 0.28, dist: 6.5, lastMouse: -10, x: 0, y: 0, z: 0, init: false };
  const canvas = renderer.domElement;
  let dragging = false;
  const lockPointer = () => {
    try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ohne Mausfang weiter */ }
  };
  // Maustasten als keys.Mouse0 (schießen) und keys.Mouse2 (zielen); der erste Klick fängt nur die Maus ein
  let touchT = -1e9; // nach einem Fingertipp kommt ein nachgemachter Mausklick: der soll nicht schießen
  addEventListener('touchstart', () => { touchT = performance.now(); }, { passive: true });
  canvas.addEventListener('mousedown', e => {
    if (!started || performance.now() - touchT < 1000) return;
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) lockPointer();
    else { const k = 'Mouse' + e.button; if (!keys[k]) pressed[k] = true; keys[k] = true; }
    dragging = true;
  });
  addEventListener('mouseup', e => { dragging = false; keys['Mouse' + e.button] = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (!started || ui.mapOpen || property.menuOpen) return;
    if (document.pointerLockElement === canvas || dragging) {
      const aim = weapons && weapons.aiming;
      cam.yaw -= e.movementX * (aim ? 0.0022 : 0.0032);
      cam.pitch = U.clamp(cam.pitch + e.movementY * (aim ? 0.0018 : 0.0025), aim ? -0.9 : -0.35, 1.25);
      cam.lastMouse = performance.now() / 1000;
    }
  });
  canvas.addEventListener('wheel', e => {
    cam.dist = U.clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 2.2, 40);
  }, { passive: true });

  function begin() {
    $('start').classList.add('hidden');
    $('hud').classList.remove('hidden');
    started = true;
    audio.init();
    lockPointer();
  }
  $('start-btn').onclick = () => {
    begin();
    ui.bigMessage('GTA COBURG', 2.5, '#e9b949', 'Willkommen am Bahnhof. Schnapp dir ein Auto!');
  };
  $('help-close').onclick = () => { $('help').classList.add('hidden'); };

  // ---------- Reifen: Bremsspuren, Qualm, Quietschen, Drift-Anzeige ----------
  let driftT = 0, driftM = 0;
  function tireMarks(c, input, dt) {
    const sp = Math.hypot(c.vx, c.vz), slip = Math.abs(c.slip || 0);
    const braking = input.throttle < 0 && c.speed > 14;
    const level = c.wrecked ? 0 : U.clamp(Math.max((slip - 0.14) * 2.5, input.handbrake && sp > 4 ? 0.7 : 0, braking ? 0.45 : 0), 0, 1) * Math.min(1, sp / 8);
    audio.squeal(level * 0.6);
    const fx0 = Math.sin(c.heading), fz0 = Math.cos(c.heading), rx = -fz0, rz = fx0;
    for (const w of [0, 1]) {
      if (level < 0.25) { fx.skid(w, null); continue; }
      const sd = w ? 1 : -1, x = c.x + rx * WHEEL_X * sd - fx0 * WHEEL_Z, z = c.z + rz * WHEEL_X * sd - fz0 * WHEEL_Z;
      fx.skid(w, x, c.y + 0.13, z);   // knapp über Fahrbahn und Markierungen
      if (Math.random() < level * dt * 14) fx.smoke(x, c.y + 0.3, z, 0.05);
    }
    // Drift: Zeit und Strecke mitzählen, bei langen Drifts kurz anzeigen
    if (slip > 0.3 && sp > 8 && !input.handbrake) { driftT += dt; driftM += sp * dt; }
    else if (slip < 0.15) {
      if (driftT > 1.4) ui.toast(`Drift! ${Math.round(driftM)} m · ${driftT.toFixed(1).replace('.', ',')} s`, 1.6);
      driftT = 0; driftM = 0;
    }
  }

  // ---------- Ton ----------
  const audio = {
    ctx: null,
    init() {
      if (this.ctx) return;
      try {
        const A = window.AudioContext || window.webkitAudioContext;
        this.ctx = new A();
        const c = this.ctx;
        this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
        // Motor: zwei Oszillatoren durch einen Tiefpass
        this.engGain = c.createGain(); this.engGain.gain.value = 0;
        this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 600;
        this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
        this.o2 = c.createOscillator(); this.o2.type = 'square';
        const g2 = c.createGain(); g2.gain.value = 0.35;
        this.o1.connect(this.filter); this.o2.connect(g2); g2.connect(this.filter);
        this.filter.connect(this.engGain); this.engGain.connect(this.master);
        this.o1.start(); this.o2.start();
        // Hupe
        this.hornGain = c.createGain(); this.hornGain.gain.value = 0; this.hornGain.connect(this.master);
        for (const f of [392, 494]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(this.hornGain); o.start(); }
        // Martinshorn (Tatü-tata, Quarte a′–d″)
        this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
        const sf = c.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
        this.sirenOsc = c.createOscillator(); this.sirenOsc.type = 'sawtooth'; this.sirenOsc.frequency.value = 440;
        this.sirenOsc.connect(sf); sf.connect(this.sirenGain); this.sirenGain.connect(this.master); this.sirenOsc.start();
        // Stimmengewirr in der Fußgängerzone: gefiltertes Rauschen in einer Schleife
        const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        let b = 0;
        for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.3; d[i] = b * (0.6 + 0.4 * Math.sin(i / c.sampleRate * 7.3) * Math.sin(i / c.sampleRate * 2.1)); }
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.8;
        this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0;
        src.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master); src.start();
        // Reifenquietschen: Rauschen durch einen schmalen Bandpass
        const sq = c.createBuffer(1, c.sampleRate, c.sampleRate), sd = sq.getChannelData(0);
        for (let i = 0; i < sd.length; i++) sd[i] = Math.random() * 2 - 1;
        const ss = c.createBufferSource(); ss.buffer = sq; ss.loop = true;
        this.squealBp = c.createBiquadFilter(); this.squealBp.type = 'bandpass'; this.squealBp.frequency.value = 1700; this.squealBp.Q.value = 9;
        this.squealGain = c.createGain(); this.squealGain.gain.value = 0;
        ss.connect(this.squealBp); this.squealBp.connect(this.squealGain); this.squealGain.connect(this.master); ss.start();
      } catch (e) { this.ctx = null; }
    },
    engine(on, speed, throttle) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const gear = Math.min(4, Math.floor(Math.abs(speed) / 11));
      const rpm = 0.25 + (Math.abs(speed) - gear * 11) / 11 * 0.75;
      const f = 38 + rpm * 70 + gear * 6;
      this.o1.frequency.setTargetAtTime(f, t, 0.05);
      this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.filter.frequency.setTargetAtTime(350 + Math.abs(throttle) * 900 + rpm * 400, t, 0.08);
      this.engGain.gain.setTargetAtTime(on ? 0.11 + Math.abs(throttle) * 0.12 : 0, t, 0.1);
      if (!on) this.squeal(0);
    },
    squeal(v) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.squealGain.gain.setTargetAtTime(v * 0.5, t, 0.06);
      this.squealBp.frequency.setTargetAtTime(1500 + v * 500, t, 0.1);
    },
    horn(on) { if (this.ctx) this.hornGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.02); },
    siren(vol) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.sirenOsc.frequency.setValueAtTime(Math.floor(t / 0.62) % 2 ? 587 : 440, t);
      this.sirenGain.gain.setTargetAtTime(vol, t, 0.15);
    },
    noise(len, freq, gain) {
      if (!this.ctx) return;
      const c = this.ctx, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); g.gain.value = gain;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    },
    thump(strength) { if (strength >= 2) this.noise(0.25, 700, Math.min(1, strength / 15) * 0.8); },
    boom(dist) { this.noise(1.6, 380, U.clamp(1.4 - dist / 200, 0.1, 1.4)); },
    beep(freq, dur, when = 0, type = 'square', vol = 0.12) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    },
    cash() { this.beep(1320, 0.12, 0, 'triangle', 0.2); this.beep(1760, 0.25, 0.09, 'triangle', 0.2); },
    fanfare(win) {
      const notes = win ? [523, 659, 784, 1047] : [523, 494, 440];
      notes.forEach((f, i) => this.beep(f, i === notes.length - 1 ? 0.5 : 0.16, i * 0.15, 'square', 0.1));
    },
    crowd(level) { if (this.ctx) this.crowdGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5); },
    sting() { [392, 370, 349, 262].forEach((f, i) => this.beep(f, 0.4, i * 0.22, 'sawtooth', 0.09)); },
  };

  // ---------- Geld ----------
  function addMoney(n) {
    save.money = Math.max(0, Math.round((save.money + n) * 100) / 100); // auf Cent genau (Essen, Einkäufe)
    persist();
    if (n > 0) audio.cash();
  }

  // ---------- Autos ----------
  // alle Autos außer dem, in dem der Spieler gerade fährt (Polizei und Rennen kümmern sich um ihre eigenen)
  // (Mehrspieler: dazu die sichtbaren Autos der anderen Spieler, net.remoteCars)
  function nonPlayerCars() {
    const list = traffic.cars.concat(parked, wrecks, net.remoteCars);
    return mode === 'drive' ? list.filter(c => c !== car) : list;
  }
  function allCars() { return traffic.cars.concat(parked, wrecks, police.cars(), races.cars(), net.remoteCars); }

  // Autos, in die der Spieler einsteigen kann
  function enterable() {
    const list = traffic.cars.filter(c => !c.burning).concat(parked.filter(c => !c.wrecked && !c.burning));
    for (const u of police.units) if ((u.officer || u.mode === 'block') && !u.car.burning) list.push(u.car);
    for (const c of net.remoteCars) if (!c.burning && net.canEnter(c)) list.push(c);
    return list;
  }

  function nearestCar(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of enterable()) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar(c) {
    const unit = police.units.find(u => u.car === c);
    if (unit) {
      police.takeCar(c); parked.push(c);
      police.crime(1, 'Streifenwagen geklaut!', 2);
    } else if (c.ai) {
      traffic.release(c); parked.push(c);
      if (c.kind === 'police') police.crime(1, 'Streifenwagen geklaut!', 2);
      else if (police.witness(c.x, c.z, 120) || Math.random() < 0.3) police.crime(0, 'Autodiebstahl! Jemand hat die Polizei gerufen', 1);
      else ui.toast(`${c.spec.name} geklaut`, 1.8);
    }
    car = c; car.isPlayer = true; car.sleeping = false;
    mode = 'drive';
    player.visible = false;
    cam.yaw = car.heading;
    net.entered(c);
  }

  // ---------- Mehrspieler ----------
  // Mitfahren im Auto eines anderen Spielers (der Server hat den Platz bestätigt)
  function startRide(c, driver) {
    ride = c;
    player.visible = false;
    cam.yaw = c.heading; cam.init = false;
    ui.toast(`Du fährst bei ${driver} mit · E aussteigen`, 2.5);
  }
  // Aussteigen auf der Beifahrerseite (byPlayer: mit E; sonst hat der Server die Fahrt beendet)
  function endRide(byPlayer) {
    if (!ride) return;
    const c = ride;
    ride = null;
    const lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
    let x = c.x - lx * 2.1, z = c.z - lz * 2.1;
    if (world.insideBuilding(x, z, 0.4)) { x = c.x + lx * 2.1; z = c.z + lz * 2.1; }
    player.place(x, z, world);
    player.heading = c.heading;
    player.visible = true;
    cam.init = false;
    net.endedRide();
    if (!byPlayer) ui.toast('Fahrt beendet', 1.5);
  }
  // Explosion eines fremden Autos: Bild, Ton, Druckwelle auf die eigene Figur bzw. das eigene Auto
  function remoteBoom(c, inside) {
    fx.explosion(c.x, c.y, c.z);
    peds.panic(c.x, c.z, 45);
    lastBoom = { x: c.x, z: c.z, t: 0.5 };
    const p = net.G.pos();
    audio.boom(Math.hypot(c.x - p.x, c.z - p.z));
    if (inside) { endRide(false); wasted('Im Auto verbrannt'); return; }
    if (car) {
      const d = Math.hypot(car.x - c.x, car.z - c.z);
      if (d < 9) { car.damage((9 - d) * 9); const k = (9 - d) * 1.5 / (d || 1); car.vx += (car.x - c.x) * k; car.vz += (car.z - c.z) * k; }
    } else if (!property.inside) {
      const d = Math.hypot(player.x - c.x, player.z - c.z);
      if (d < 9) hurtPlayer((9 - d) * 14, c.x, c.z);
    }
  }
  // Server hat eine unplausible Bewegung verworfen: zurück an die letzte gültige Stelle
  function correct(m) {
    if (m.car && car) {
      car.x = m.x; car.z = m.z; car.heading = m.h; car.vx = car.vz = 0;
      car.updateGround(world, 1, true); car.sync();
    } else if (!car && !ride && !property.inside) player.place(m.x, m.z, world);
  }

  function exitCar() {
    const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
    let x = car.x + lx * 2.1, z = car.z + lz * 2.1;
    if (world.insideBuilding(x, z, 0.4)) { x = car.x - lx * 2.1; z = car.z - lz * 2.1; }
    player.place(x, z, world);
    player.heading = car.heading;
    player.visible = true;
    car.vx *= 0.3; car.vz *= 0.3;
    car.isPlayer = false;
    car = null;
    mode = 'walk';
    audio.engine(false, 0, 0);
    net.exited();
    // nicht zu viele abgestellte Autos behalten
    while (parked.length > 8) {
      const far = parked.reduce((a, b) => Math.hypot(b.x - player.x, b.z - player.z) > Math.hypot(a.x - player.x, a.z - player.z) ? b : a);
      parked.splice(parked.indexOf(far), 1); far.dispose(scene);
    }
  }

  function resetCar() {
    const r = world.nearestRoad(car.x, car.z, 300, s => s.k === 'road');
    if (!r) return;
    const s = r.seg;
    let h = Math.atan2(s.bx - s.ax, s.bz - s.az);
    if (Math.cos(U.wrapAngle(h - car.heading)) < 0) h += Math.PI;
    car.place(r.x, r.z, h, world);
    ui.toast('Auto zurückgesetzt', 1.5);
    net.teleported();
  }

  // Auto beim Händler verkaufen
  function sellPrice(c) { return Math.round(c.spec.value * (0.25 + 0.75 * c.health / 100) / 10) * 10; }
  function sellCar(pl) {
    const c = car, price = sellPrice(c);
    exitCar();
    parked.splice(parked.indexOf(c), 1);
    c.dispose(scene);
    const mine = property.carSold(c);
    addMoney(price);
    pl.cool = 3;
    ui.bigMessage('VERKAUFT', 2, '#ff9a2e', `${mine ? 'Dein ' : ''}${c.spec.name} für € ${price}`);
  }

  // In die Lackiererei fahren
  function sprayCar(pl) {
    const stars = police.stars;
    if (stars > 0 && police.seen) { ui.toast('Die Polizei sieht dich! Erst abhängen.', 1.5); pl.cool = 1.5; return; }
    if (stars === 0 && car.health >= 99) { ui.toast('Dein Auto ist in Ordnung', 1.5); pl.cool = 4; return; }
    const cost = stars > 0 ? SPRAY_COST.wanted : SPRAY_COST.repair;
    if (save.money < cost) { ui.toast(`Zu wenig Geld (€ ${cost})`, 2); pl.cool = 3; return; }
    addMoney(-cost);
    let color = null;
    if (car.kind !== 'police' && car.kind !== 'taxi') {
      const pal = kindPalette(car.kind);
      do color = pal[Math.floor(Math.random() * pal.length)]; while (pal.length > 1 && color === car.color);
      car.color = color;
    }
    car.repair(color);
    if (stars > 0) police.clear();
    pl.cool = 8;
    ui.bigMessage('FRISCH LACKIERT', 2.2, '#38d97a', (stars > 0 ? 'Fahndung aufgehoben · ' : 'Auto repariert · ') + `€ ${cost}`);
    audio.noise(1.2, 3000, 0.25);
  }

  function travel(x, z, name) {
    ui.closeMap();
    if (world.region) world.region.ensure(x, z); // Kacheln am Ziel sofort bauen
    if (mode === 'drive') {
      const r = world.nearestRoad(x, z, 400, drivable);
      if (r) {
        const s = r.seg;
        car.place(r.x, r.z, Math.atan2(s.bx - s.ax, s.bz - s.az), world);
        cam.yaw = car.heading;
      }
    } else {
      let p = { x, z };
      if (world.insideBuilding(x, z, 0)) {
        const r = world.nearestRoad(x, z, 300);
        if (r) p = { x: r.x, z: r.z };
      }
      player.place(p.x, p.z, world);
    }
    cam.init = false;
    ui.toast(name ? 'Willkommen: ' + name : 'Schnellreise', 2);
    net.teleported();
  }

  // Taste N: Zeitraffer bis 22 bzw. 9 Uhr (drinnen sofort); online gilt die Uhr der Lobby für alle
  function toggleNight() {
    if (net.online) { net.sky('night'); return; }
    const toNight = !night;
    atmo.setNight(toNight, !!property.inside);
    if (property.inside) { atmo.update(0, null, true); syncNight(); }
    ui.toast(toNight ? 'Zeitraffer bis 22 Uhr' : 'Zeitraffer bis 9 Uhr', 1.4);
  }
  // Lichter, Fenster und Stadtleben folgen der Uhr der Atmosphäre
  function syncNight() {
    if (atmo.isNight === night) return;
    night = atmo.isNight;
    applySky();
  }
  function cycleWeather() {
    if (net.online) { net.sky('weather'); return; }
    atmo.auto = false; // von Hand gewählt: bleibt, bis man wieder wechselt
    ui.toast('Wetter: ' + atmo.cycleWeather(), 1.6);
  }
  // instant: ohne Überblendung (z. B. nach dem Verlassen einer Wohnung)
  function applySky(instant) {
    atmo.setNight(night, instant);
    if (instant) atmo.update(0, camera, true);
    world.setNight(night);
    if (world.region) world.region.setNight(night);
    props.setNight(night);
    life.setNight(night);
    carMaterials().head.emissiveIntensity = night ? 2.5 : 0.2;
    carMaterials().tail.emissiveIntensity = night ? 1.6 : 0.25;
    property.setNight(night);
  }

  // ---------- Wohnungen ----------
  // drinnen: die Stadt ausblenden (nur Raum, Spielfigur und Licht bleiben), draußen alles wiederherstellen
  let hiddenOutdoor = null;
  function setIndoor(room) {
    if (room) {
      const keep = new Set([property.indoorRoot, player.group, sun, sun.target, hemi]);
      hiddenOutdoor = scene.children.filter(o => o.visible && !keep.has(o));
      for (const o of hiddenOutdoor) o.visible = false;
      audio.engine(false, 0, 0); audio.siren(0); audio.crowd(0); audio.horn(false);
    } else {
      for (const o of hiddenOutdoor || []) o.visible = true;
      hiddenOutdoor = null;
      applySky(true);
    }
    $('minimap-wrap').classList.toggle('hidden', !!room);
    $('location').classList.toggle('hidden', !!room);
    cam.init = false;
  }

  // im eigenen Bett schlafen: Leben voll, Tag/Nacht wechseln, speichern
  function sleep() {
    if (net.online) ui.toast('Online läuft die Uhr für alle weiter (N: Zeitraffer für die Lobby)', 2.5);
    else toggleNight();
    player.health = 100;
    persist();
  }

  // ---------- Feuer, Explosionen, Verletzungen ----------
  let puffT = 0;
  function vehicleLife(dt, px, pz) {
    puffT += dt;
    const puff = puffT > 0.07;
    if (puff) puffT = 0;
    for (const c of allCars()) {
      if (c.disposed) continue;
      const near = Math.abs(c.x - px) < 180 && Math.abs(c.z - pz) < 180;
      if (c.remote) { // Auto eines anderen Spielers: sein Spiel entscheidet über die Explosion, hier nur Feuer und Rauch
        if (puff && near && c.burning) { fx.fire(c.x, c.y + 1.1, c.z); fx.smoke(c.x, c.y + 1.8, c.z, 0.9); }
        continue;
      }
      if (c.burning > 0) {
        c.burning -= dt;
        if (puff && near) { fx.fire(c.x, c.y + 1.1, c.z); fx.smoke(c.x, c.y + 1.8, c.z, 0.9); }
        if (c.burning <= 0) explode(c);
      } else if (c.wrecked) {
        if (puff && near && c.smokeT > 0 && Math.random() < 0.4) fx.smoke(c.x, c.y + 1.4, c.z, 0.85);
        c.smokeT -= dt;
      } else if (c.health < 40 && puff && near && Math.random() < 0.25 + (40 - c.health) / 60) {
        fx.smoke(c.x + Math.sin(c.heading) * 1.7, c.y + 1, c.z + Math.cos(c.heading) * 1.7, 0.2 + (40 - c.health) / 60);
      }
    }
    // weit entfernte Wracks abräumen
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i];
      if (!w.burning && (wrecks.length > 12 || Math.hypot(w.x - px, w.z - pz) > 450)) { w.dispose(scene); wrecks.splice(i, 1); }
    }
  }

  function explode(c) {
    c.wreck(); c.smokeT = 12;
    net.boom(c);
    if (c.ai) traffic.release(c);
    const pi = parked.indexOf(c);
    if (pi >= 0 && c !== car) parked.splice(pi, 1);
    if (!wrecks.includes(c) && c !== car) wrecks.push(c);
    if (c.kind === 'police' && police.stars > 0) police.crime(0.5, 'Streifenwagen zerstört!', 2);
    blast(c.x, c.y, c.z, c);
    if (car === c) {
      parked.splice(parked.indexOf(c), 1); wrecks.push(c);
      wasted('Im Auto verbrannt');
    }
  }

  // Druckwelle (explodierendes Auto src oder Granate): Autos, Spieler zu Fuß, Passanten und Polizisten in der Nähe.
  // Gibt die Zahl der umgeworfenen Passanten zurück.
  function blast(x, y, z, src) {
    fx.explosion(x, y, z);
    peds.panic(x, z, 45);
    lastBoom = { x, z, t: 0.5 };
    const px = mode === 'drive' ? car.x : player.x, pz = mode === 'drive' ? car.z : player.z;
    audio.boom(Math.hypot(x - px, z - pz));
    for (const o of allCars()) {
      if (o === src || o.disposed || o.remote) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d > 9) continue;
      o.damage((9 - d) * 9);
      if (!o.ai) { const k = (9 - d) * 1.5 / (d || 1); o.vx += (o.x - x) * k; o.vz += (o.z - z) * k; o.sleeping = false; }
    }
    if (mode === 'walk' && !ride && !over) {
      const d = Math.hypot(player.x - x, player.z - z);
      if (d < 9) hurtPlayer((9 - d) * 14, x, z, 'Explosion');
    }
    police.knockDown(x, z, 6);
    return peds.knockDown(x, z, 5.5);
  }

  // Polizist schießt auf den Spieler (Treffer gewürfelt in police.js)
  function policeShot(hit, fig) {
    if (over || property.inside) return;
    const t = mode === 'drive' ? car : ride || player;
    weapons.npcShot(fig, { x: t.x, y: t.y + (mode === 'drive' || ride ? 1 : 1.3), z: t.z }, hit);
    if (!hit) return;
    if (mode === 'drive') car.hit(WANTED.shotCarDamage);
    else if (!ride) hurtPlayer(WANTED.shotDamage, fig.x, fig.z, 'Erschossen', false);
  }

  let hurtCool = 0, sinceHurt = 99;
  // knock: zur Seite stoßen (Auto, Explosion); die Schutzweste fängt den Schaden zuerst ab
  function hurtPlayer(dmg, fromX, fromZ, reason = 'Überfahren', knock = true) {
    const vest = Math.min(save.armor || 0, dmg);
    if (vest > 0) { save.armor -= vest; dmg -= vest; }
    player.health -= dmg;
    sinceHurt = 0;
    audio.thump(knock ? 8 : 4);
    if (knock) {
      const dx = player.x - fromX, dz = player.z - fromZ, d = Math.hypot(dx, dz) || 1;
      const r = world.collideCircle(player.x + dx / d * 1.6, player.z + dz / d * 1.6, WALK.radius, {});
      player.x = r.x; player.z = r.z; player.vy = 4.5; player.onGround = false;
    }
    if (player.health <= 0) wasted(reason);
  }

  // Autos, die den Spieler zu Fuß erwischen
  function carHits(dt) {
    hurtCool -= dt;
    if (mode !== 'walk' || hurtCool > 0 || ride) return;
    for (const c of allCars()) {
      const sp = c.ai ? c.ai.speed : Math.hypot(c.vx, c.vz);
      if (sp < 5) continue;
      const dx = player.x - c.x, dz = player.z - c.z;
      if (dx * dx + dz * dz > 16) continue;
      const fx_ = Math.sin(c.heading), fz_ = Math.cos(c.heading);
      const lf = dx * fx_ + dz * fz_, ll = dx * fz_ - dz * fx_;
      if (Math.abs(lf) < CAR.length / 2 + 0.6 && Math.abs(ll) < CAR.width / 2 + 0.6) {
        hurtPlayer((sp - 4) * 5, c.x, c.z);
        hurtCool = 0.8;
        return;
      }
    }
  }

  // ---------- Verhaftet / Erledigt ----------
  function busted() {
    if (over) return;
    const fine = Math.min(save.money, 100 + 100 * police.stars);
    addMoney(-fine);
    over = { t: 0 };
    const guns = weapons.confiscate();
    ui.bigMessage('VERHAFTET', 4, '#5fa0ff', (fine ? `Strafe: € ${fine}` : 'Diesmal ohne Strafe') + (guns ? ' · Waffen beschlagnahmt' : ''));
    audio.sting(); audio.engine(false, 0, 0); audio.siren(0);
    $('fade').classList.remove('hidden');
  }

  function wasted(reason) {
    if (over) return;
    const fee = Math.min(save.money, 100);
    addMoney(-fee);
    save.armor = 0;
    if (car) { car.isPlayer = false; car = null; mode = 'walk'; player.visible = true; net.exited(); }
    if (ride) { ride = null; player.visible = true; net.endedRide(); }
    over = { t: 0 };
    ui.bigMessage('ERLEDIGT', 4, '#e2463f', `${reason} · Krankenhaus: € ${fee}`);
    audio.sting(); audio.engine(false, 0, 0); audio.siren(0);
    $('fade').classList.remove('hidden');
  }

  // ---------- Drinnen ----------
  // Laufrichtung aus WASD relativ zur Kamera
  function walkInput() {
    const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const side = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    // Kamera-Vorwärts ist (sin yaw, cos yaw), links davon (cos yaw, -sin yaw)
    const sx = Math.sin(cam.yaw), sz = Math.cos(cam.yaw);
    let mx = sx * fwd + sz * side, mz = sz * fwd - sx * side;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    return { x: mx, z: mz, run: keys.ShiftLeft || keys.ShiftRight, jump: !!pressed.Space };
  }

  // Spielschritt in einer Wohnung: die Stadt ruht, nur Figur, Raum und HUD laufen
  function indoorStep(dt) {
    if (pressed.F1) $('help').classList.toggle('hidden');
    if (pressed.KeyN) toggleNight();
    if (pressed.KeyK) cycleWeather();
    if (pressed.KeyO) ui.toast('Grafik: ' + post.cycle(), 1.6);
    if (pressed.KeyM || pressed.KeyG) ui.toast(property.inside.home.venue ? 'Erst nach draußen gehen' : 'Erst die Wohnung verlassen', 1.5);
    const io = property.inside, mv = walkInput();
    mv.run = false; // drinnen wird nicht gerannt
    weapons.holster();
    player.update(dt, mv, io.room.walker, []);
    sinceHurt += dt;
    if (sinceHurt > 8 && player.health < 100) player.health = Math.min(100, player.health + dt * 2);
    const prompt = property.indoorStep(dt, pressed);
    ui.setMoney(save.money);
    ui.setWanted(police.stars, false);
    ui.setBars(player.health, null);
    ui.setBust(0); ui.setSpeed(0, '', false);
    ui.setPrompt(property.menuOpen ? null : prompt);
    if (property.inside) ui.setLocation(io.home.name, io.home.venue ? INTERIOR_TYPES[io.home.type].title : io.viewing ? 'Besichtigung' : 'zu Hause');
  }

  // Kamera drinnen: näher dran und immer innerhalb der Wände
  function indoorCamera(dt) {
    const R = property.inside.room;
    const tx = player.x, ty = player.y + 1.45, tz = player.z;
    // vor einer Wand steiler von oben schauen, statt am Hinterkopf zu kleben
    const dist = Math.min(cam.dist, 4.2);
    let p = null;
    for (const pitch of [cam.pitch, 0.75, 1.05, 1.3]) {
      if (pitch < cam.pitch) continue;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const q = R.clampCam(tx, ty, tz, tx - Math.sin(cam.yaw) * dist * cp, ty + dist * sp + 0.3, tz - Math.cos(cam.yaw) * dist * cp);
      const d = Math.hypot(q[0] - tx, q[1] - ty, q[2] - tz);
      if (!p || d > p.d + 0.3) p = { q, d };
      if (d > Math.min(dist, 2.6) - 0.05) break;
    }
    p = p.q;
    if (!cam.init) { cam.x = p[0]; cam.y = p[1]; cam.z = p[2]; cam.init = true; }
    cam.x = U.damp(cam.x, p[0], 20, dt); cam.y = U.damp(cam.y, p[1], 20, dt); cam.z = U.damp(cam.z, p[2], 20, dt);
    const q = R.clampCam(tx, ty, tz, cam.x, cam.y, cam.z);
    camera.position.set(q[0], q[1], q[2]);
    camera.lookAt(tx, ty, tz);
  }

  // ---------- Kamera ----------
  const tmpV = new THREE.Vector3();
  function updateCamera(dt) {
    if (window.game.debugCam) { // freie Kamera für Tests: game.debugCam = { pos: [x,y,z], look: [x,y,z] }
      camera.position.fromArray(window.game.debugCam.pos); camera.lookAt(...window.game.debugCam.look); return;
    }
    if (property.inside) { indoorCamera(dt); return; }
    let tx, ty, tz, follow = false, heading = 0;
    const vc = mode === 'drive' ? car : ride; // eigenes Auto oder (Mehrspieler) das Auto, in dem man mitfährt
    if (vc) {
      tx = vc.x; ty = vc.y + 1.3; tz = vc.z; follow = true; heading = vc.heading;
      // Blickrichtung folgt dem Auto, wenn die Maus ruht
      const idle = performance.now() / 1000 - cam.lastMouse > 1.2;
      if (idle) {
        cam.yaw += U.wrapAngle(heading - cam.yaw) * (1 - Math.exp(-3.2 * dt));
        cam.pitch = U.damp(cam.pitch, 0.22, 2, dt);
      }
    } else if (weapons && weapons.aiming) {
      aimCamera(dt);
      return;
    } else {
      tx = player.x; ty = player.y + 1.6; tz = player.z;
      cam.pitch = Math.max(cam.pitch, -0.35); // nach dem Zielen wieder normale Neigung
    }
    if (vc && camMode === 1) {
      // Motorhaubenkamera
      const fx = Math.sin(vc.heading), fz = Math.cos(vc.heading);
      camera.position.set(vc.x + fx * 0.6, vc.y + 1.55, vc.z + fz * 0.6);
      const lookYaw = vc.heading + U.wrapAngle(cam.yaw - vc.heading);
      tmpV.set(camera.position.x + Math.sin(lookYaw) * 10, camera.position.y - Math.sin(cam.pitch - 0.22) * 10 - 0.3, camera.position.z + Math.cos(lookYaw) * 10);
      camera.lookAt(tmpV);
      cam.init = false;
      return;
    }
    const dist = vc ? Math.max(cam.dist, 6.5) + Math.min(Math.abs(vc.speed), 40) * 0.06 : cam.dist;
    const cp = Math.cos(cam.pitch), spch = Math.sin(cam.pitch);
    let wx = tx - Math.sin(cam.yaw) * dist * cp, wy = ty + dist * spch + 0.4, wz = tz - Math.cos(cam.yaw) * dist * cp;
    // Kamera nicht in Gebäuden verschwinden lassen
    const steps = Math.ceil(dist / 0.8);
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const x = tx + (wx - tx) * f, y = ty + (wy - ty) * f, z = tz + (wz - tz) * f;
      const b = world.insideBuilding(x, z, 0);
      if (b && y < b.top + 1) {
        const f2 = Math.max(0.05, (i - 1.5) / steps);
        wx = tx + (wx - tx) * f2; wy = ty + (wy - ty) * f2; wz = tz + (wz - tz) * f2;
        break;
      }
    }
    wy = Math.max(wy, world.heightAt(wx, wz) + 0.6);
    if (!cam.init) { cam.x = wx; cam.y = wy; cam.z = wz; cam.init = true; }
    const lam = follow ? 12 : 30;
    cam.x = U.damp(cam.x, wx, lam, dt); cam.y = U.damp(cam.y, wy, lam, dt); cam.z = U.damp(cam.z, wz, lam, dt);
    // bei hohem Tempo etwas weiteres Sichtfeld (Geschwindigkeitsgefühl, ohne Verzerrung)
    const fov = BASE_FOV + (vc ? Math.min(Math.abs(vc.speed), 45) * 0.16 : 0);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = U.damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(tx, ty, tz);
  }

  // Zielen (rechte Maustaste): Kamera über der rechten Schulter, Fadenkreuz in der Bildmitte, etwas Zoom
  function aimCamera(dt) {
    const yaw = cam.yaw, p = U.clamp(cam.pitch, -0.9, 0.9);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx; // rechts von der Blickrichtung
    const hx = player.x, hy = player.y + 1.62, hz = player.z;
    let back = 2.3;
    let wx = hx + rx * 0.62 - fx * back * Math.cos(p), wy = hy + back * Math.sin(p) + 0.1, wz = hz + rz * 0.62 - fz * back * Math.cos(p);
    // nicht in eine Hauswand hinter dem Spieler
    for (let i = 0; i < 4 && world.insideBuilding(wx, wz, 0.2); i++) {
      back *= 0.6;
      wx = hx + rx * 0.45 - fx * back * Math.cos(p); wz = hz + rz * 0.45 - fz * back * Math.cos(p);
    }
    wy = Math.max(wy, world.heightAt(wx, wz) + 0.4);
    cam.x = U.damp(cam.x, wx, 25, dt); cam.y = U.damp(cam.y, wy, 25, dt); cam.z = U.damp(cam.z, wz, 25, dt);
    camera.position.set(cam.x, cam.y, cam.z);
    tmpV.set(cam.x + fx * Math.cos(p) * 30, cam.y - Math.sin(p) * 30, cam.z + fz * Math.cos(p) * 30);
    camera.lookAt(tmpV);
    const fov = weapons.def.zoom || 50;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = U.damp(camera.fov, fov, 10, dt); camera.updateProjectionMatrix(); }
  }

  // ---------- Schleife ----------
  let last = performance.now();
  let hudTimer = 0;
  let prevPX = 0, prevPZ = 0;
  let burnWarned = null;
  let lastTown = null;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    if (started) post.adapt(now - last);
    last = now;
    if (started && ui.mapOpen && (pressed.KeyM || pressed.Escape)) ui.closeMap();
    else if (started && property.menuOpen) { if (pressed.Escape || pressed.KeyF || pressed.KeyG) property.closeMenu(); }
    else if (started && !ui.mapOpen) step(dt);
    if (started) netStep(dt);
    render(dt);
    for (const k in pressed) delete pressed[k];
  }

  // Mehrspieler-Takt: Zustand senden, andere Spieler darstellen, Chat und Spielerliste
  function netStep(dt) {
    if (!net.online) return;
    if (!net.typing && (pressed.KeyT || pressed.Enter)) { for (const k in keys) keys[k] = false; net.openChat(); }
    if (!net.typing && pressed.Tab) net.toggleList();
    net.update(dt, { player, car: mode === 'drive' ? car : null, indoor: !!property.inside, stars: police.stars,
      horn: mode === 'drive' && !!keys.KeyH, walking: mode === 'walk' && !ride && !property.inside && !over });
  }

  function mapExtra() {
    const locked = police.stars > 0 ? 'Schnellreise gesperrt: Die Polizei sucht dich!' : races.active ? 'Schnellreise gesperrt: Rennen läuft'
      : ride ? 'Schnellreise gesperrt: Du fährst mit' : null;
    const players = net.blips().map(b => ({ name: 'Spieler: ' + b.name, x: b.x, z: b.z, type: 'player', color: b.color }));
    return { locked, raceStarts: races.list, places: places.list.concat(property.mapPlaces(), weapons.mapPlaces(), players) };
  }

  function step(dt) {
    fx.update(dt);
    ui.tick(dt);
    if (over) {
      over.t += dt;
      ui.setBust(0); ui.setPrompt(null); ui.setSpeed(0, '', false);
      if (over.t > 3.8) respawn(false);
      return;
    }
    if (property.inside) { indoorStep(dt); return; }
    // Tasten mit einmaliger Wirkung
    if (pressed.KeyM) { ui.openMap(mode === 'drive' ? car.x : player.x, mode === 'drive' ? car.z : player.z, travel, mapExtra()); document.exitPointerLock?.(); return; }
    if (pressed.F1) $('help').classList.toggle('hidden');
    if (pressed.KeyN) toggleNight();
    if (pressed.KeyK) cycleWeather();
    if (pressed.KeyO) ui.toast('Grafik: ' + post.cycle(), 1.6);
    if (pressed.KeyC && (mode === 'drive' || ride)) camMode = 1 - camMode;
    const freeze = !!(races.active && races.active.t < 0);
    if (pressed.KeyE && !freeze) {
      if (ride) endRide(true);
      else if (mode === 'drive') {
        if (Math.abs(car.speed) < 6 || car.burning) { exitCar(); if (races.active) races.stop('Rennen abgebrochen'); }
        else ui.toast('Erst langsamer fahren', 1.2);
      } else { const c = nearestCar(player.x, player.z, 4.2); if (c && c.remote) net.requestEnter(c); else if (c) enterCar(c); }
    }
    if (pressed.KeyR && mode === 'drive' && !freeze) resetCar();
    if (pressed.KeyG && !freeze && !ride) { property.openGarage(); return; }

    const pl = mode === 'drive' ? places.at(car.x, car.z) : null;
    const door = mode === 'walk' && !ride ? property.doorAt(player.x, player.z) : null;
    const shop = ride ? null : property.shopAt(mode === 'drive' ? car.x : player.x, mode === 'drive' ? car.z : player.z);
    const gunShop = mode === 'walk' && !ride ? weapons.shopAt(player.x, player.z) : null;
    if (pressed.KeyF && !ride) {
      if (races.active) races.stop('Rennen abgebrochen');
      else if (door) { property.openHome(door); return; }
      else if (gunShop) { weapons.openShop(gunShop); return; }
      else if (shop && (mode === 'walk' || Math.abs(car.speed) < 4)) { property.openShop(shop); return; }
      else if (pl && pl.type === 'dealer' && pl.cool <= 0 && Math.abs(car.speed) < 4) {
        if (car.kind === 'police') ui.toast('Streifenwagen kauft hier keiner!', 1.8);
        else sellCar(pl);
      } else if (mode === 'drive') {
        const r = races.near({ x: car.x, z: car.z, inCar: true });
        if (r && police.stars > 0) ui.toast('Erst die Polizei abhängen!', 1.8);
        else if (r) { car.vx = car.vz = 0; races.start(r, car); cam.yaw = car.heading; cam.init = false; }
      }
    }

    // Spieler bewegen
    if (mode === 'drive') {
      const input = freeze ? { throttle: 0, steer: 0, handbrake: true } : {
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
        steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
        handbrake: !!keys.Space,
      };
      car.update(dt, input, world);
      const now = performance.now() / 1000;
      const pvx = car.vx, pvz = car.vz; // Geschwindigkeit vor dem Aufprall
      for (const o of allCars()) {
        if (o === car) continue;
        const imp = collideCars(car, o);
        if (imp < 3 || (o.hitT && now - o.hitT < 1)) continue;
        o.hitT = now;
        // nur zählen, wenn der Spieler auf das andere Auto zufährt (nicht, wenn die Polizei ihn rammt)
        const dx = o.x - car.x, dz = o.z - car.z, dl = Math.hypot(dx, dz) || 1;
        const mine = (pvx * dx + pvz * dz) / dl > 4;
        if (!mine) continue;
        if (o.kind === 'police' && !o.isPlayer && !o.wrecked) police.crime(0.4, 'Polizei gerammt!', 1);
        else if (o.ai && imp > 7 && police.stars === 0 && police.witness(car.x, car.z, 80)) police.crime(0, 'Unfall vor den Augen der Polizei!', 1);
      }
      police.hitOfficers(car);
      car.updateGround(world, dt, false);
      car.sync();
      if (car.lastImpact > 3) audio.thump(car.lastImpact);
      audio.engine(true, car.speed, input.throttle);
      tireMarks(car, input, dt);
      audio.horn(!!keys.KeyH);
      if (pressed.KeyH) peds.panic(car.x + Math.sin(car.heading) * 7, car.z + Math.cos(car.heading) * 7, 8, 0.5); // Hupe: aus dem Weg!
      if (car.burning && burnWarned !== car) { burnWarned = car; ui.toast('Das Auto brennt! Schnell raus: E', 2.5); }
      if (car.siren) car.flash(performance.now() / 1000);
    } else if (ride) {
      // Mitfahrer: Figur sitzt unsichtbar im Auto des anderen Spielers
      player.x = ride.x; player.y = ride.y; player.z = ride.z; player.heading = ride.heading; player.moveSpeed = 0;
      audio.horn(false);
    } else {
      const mv = walkInput();
      if (weapons.aiming) mv.run = false; // beim Zielen nur gehen
      player.update(dt, mv, world, allCars());
      audio.horn(false);
    }
    weapons.update(dt, freeze);
    if (over) return;
    // abgestellte Autos und Wracks rollen aus, wenn sie angestoßen wurden
    for (const c of parked.concat(wrecks)) {
      if (c === car || c.sleeping) continue;
      c.update(dt, { throttle: 0, steer: 0, handbrake: true }, world);
      c.updateGround(world, dt, false);
      c.sync();
    }
    const px = mode === 'drive' ? car.x : player.x, pz = mode === 'drive' ? car.z : player.z;
    const T = {
      x: px, z: pz, inCar: mode === 'drive', car: mode === 'drive' ? car : null,
      vx: mode === 'drive' ? car.vx : (px - prevPX) / dt, vz: mode === 'drive' ? car.vz : (pz - prevPZ) / dt,
    };
    T.speed = Math.hypot(T.vx, T.vz);
    prevPX = px; prevPZ = pz;

    if (world.region) {
      world.region.update(px, pz);
      if (world.region.lifeChanged) { world.region.lifeChanged = false; peds.setExtra(world.region.lifeSegments()); }
      peds.cap = world.inCoreRect(px, pz) ? 0 : 45;
    }
    const obstacles = (mode === 'drive' ? [car] : [{ x: player.x, z: player.z }]).concat(police.cars(), races.cars(), net.remoteCars, net.walkers);
    traffic.update(dt, px, pz, obstacles);
    police.update(dt, T, cam.yaw);
    if (over) return;
    races.update(dt, T, nonPlayerCars().concat(police.cars()));
    places.update(dt);
    property.update(dt);

    // Fußgänger: laufen, ausweichen, angefahren werden
    const physCars = (mode === 'drive' ? [car] : []).concat(police.cars(), races.cars(), net.remoteCars);
    for (const h of peds.update(dt, px, pz, physCars, traffic.cars, mode === 'walk' && !ride)) {
      audio.thump(Math.min(14, h.speed));
      peds.panic(h.ped.x, h.ped.z, 18);
      if (h.car === car && mode === 'drive') {
        if (police.witness(h.ped.x, h.ped.z, 100)) police.crime(0.5, 'Passant angefahren!', 1);
        else if (Math.random() < 0.4) police.crime(0, 'Passant angefahren! Zeugen rufen die Polizei', 1);
        else ui.toast('Passant angefahren!', 1.5);
      }
    }
    // Tauben, Brunnen, Grillrauch
    const threats = [{ x: px, z: pz, r: mode === 'drive' ? (Math.abs(car.speed) > 2 ? 14 : 4) : 3.5 }];
    if (lastBoom && (lastBoom.t -= dt) > 0) threats.push({ x: lastBoom.x, z: lastBoom.z, r: 60 });
    props.update(dt, px, pz, threats, performance.now() / 1000);
    life.update(dt, px, pz);
    audio.crowd(Math.min(0.09, peds.countNear(px, pz, 25) * 0.005));
    vehicleLife(dt, px, pz);
    if (over) return;
    carHits(dt);
    if (over) return;
    sinceHurt += dt;
    if (sinceHurt > 8 && player.health < 100) player.health = Math.min(100, player.health + dt * 2);

    // Lackiererei: einfach hineinfahren
    if (pl && pl.type === 'spray' && pl.cool <= 0 && Math.abs(car.speed) < 6 && !car.burning) sprayCar(pl);

    // Martinshorn
    audio.siren(police.sirenDist < 260 ? 0.07 * (1 - police.sirenDist / 260) : 0);

    // HUD
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.25;
      $('clock').textContent = atmo.timeText + ' · ' + atmo.weatherName;
      const r = world.nearestRoad(px, pz, 35, s => !!s.n);
      const b = world.insideBuilding(px, pz, 0);
      const how = mode === 'drive' ? (car.kind === 'car' ? 'im Auto' : 'im ' + car.spec.name) : ride ? 'Mitfahrer bei ' + net.nameOf(ride.net.driver) : 'zu Fuß';
      // im Landkreis: Ort zur Straße, beim Ankommen ein Ortsschild
      const place = world.region && !world.inCoreRect(px, pz) ? world.region.placeAt(px, pz) : null;
      const town = place ? place.n : 'Coburg';
      if (town !== lastTown) { if (lastTown !== null && place) ui.toast(town, 2.2); lastTown = town; }
      ui.setLocation(r ? r.seg.n : (b && b.n) || town, place ? town + ' · ' + how : how);
    }
    ui.setMoney(save.money);
    ui.setWanted(police.stars, police.stars > 0 && !police.seen);
    ui.setBars(player.health, mode === 'drive' ? car.health : null);
    ui.setBust(police.bust);
    let prompt = null;
    if (mode === 'drive') {
      const sp = car.speed;
      ui.setSpeed(Math.abs(sp) * 3.6, sp < -0.5 ? 'R' : Math.abs(sp) < 0.5 ? 'N' : 'D', true);
      const r = races.near({ x: car.x, z: car.z, inCar: true });
      if (pl && pl.type === 'dealer') prompt = car.kind === 'police' ? 'Streifenwagen kauft hier keiner' : `<kbd>F</kbd> ${car.ownedId ? 'Deinen ' : ''}${car.spec.name} verkaufen: € ${sellPrice(car)}`;
      else if (shop && Math.abs(sp) < 6) prompt = property.prompt(car.x, car.z, false);
      else if (r) prompt = police.stars > 0 ? 'Rennen: erst die Polizei abhängen' : `<kbd>F</kbd> Rennen starten: ${r.name}`;
      else if (Math.abs(sp) < 6 || car.burning) prompt = '<kbd>E</kbd> Aussteigen';
    } else if (ride) {
      ui.setSpeed(Math.abs(ride.speed) * 3.6, 'D', true);
      prompt = '<kbd>E</kbd> Aussteigen';
    } else {
      ui.setSpeed(0, '', false);
      const c = nearestCar(player.x, player.z, 4.2);
      if (c && c.remote) prompt = net.prompt(c);
      else if (c) prompt = c.kind === 'police' && (c.ai || police.units.some(u => u.car === c)) ? '<kbd>E</kbd> Streifenwagen klauen'
        : c.ai ? `<kbd>E</kbd> ${c.spec.name} klauen` : c.ownedId ? `<kbd>E</kbd> Einsteigen: dein ${c.spec.name}` : '<kbd>E</kbd> Einsteigen';
      const pp = gunShop ? `<kbd>F</kbd> ${gunShop.name}: Waffen und Munition` : property.prompt(player.x, player.z, true);
      if (pp) prompt = prompt ? prompt + ' · ' + pp : pp;
    }
    ui.setPrompt(prompt);
    const ri = races.mapInfo();
    const vc = mode === 'drive' ? car : ride;
    ui.drawMinimap(px, pz, vc ? vc.heading : player.heading, cam.yaw, traffic.cars, vc ? vc.speed : 0, {
      police: police.cars(), officers: police.officers.filter(o => o.state === 'run').map(o => o.fig),
      race: ri, places: places.list.concat(property.mapPlaces(), weapons.mapPlaces()), raceStarts: races.list, wanted: police.stars > 0,
      players: net.blips(),
    });
  }

  function render(dt) {
    if (!player) return;
    updateCamera(dt);
    const t = mode === 'drive' ? car : player;
    // Sonne folgt dem Spieler (auf Schattentexel gerastert, damit nichts flimmert)
    const texel = (SC * 2) / sun.shadow.mapSize.x;
    const sx = Math.round(t.x / texel) * texel, sz = Math.round(t.z / texel) * texel;
    sun.target.position.set(sx, t.y, sz);
    sun.position.set(sx + SUN_DIR.x * 300, t.y + SUN_DIR.y * 300, sz + SUN_DIR.z * 300);
    if (mode === 'drive' && night) {
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      headlight.intensity = 60;
      headlight.position.set(car.x + fx * 2.2, car.y + 0.8, car.z + fz * 2.2);
      headlight.target.position.set(car.x + fx * 20, car.y - 1, car.z + fz * 20);
    } else headlight.intensity = 0;
    if (!property.inside) { atmo.update(dt, camera); syncNight(); }
    peds.draw(camera.position.x, camera.position.z);
    world.updateTreeLod(camera.position.x, camera.position.z);
    if (world.region && world.region.land) world.region.land.update(camera.position.x, camera.position.z, !property.inside);
    waterTick(dt);
    ui.updateLabels(camera);
    post.render(scene, camera);
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    post.scale = 1;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // für Tests in der Konsole
  window.game = { world, parked, wrecks, cam, save, get car() { return car; }, get player() { return player; }, get traffic() { return traffic; },
    get police() { return police; }, get peds() { return peds; }, get props() { return props; }, get life() { return life; }, get races() { return races; }, get places() { return places; }, get nav() { return nav; },
    get mode() { return mode; }, get spawn() { return spawn; }, get property() { return property; }, get atmo() { return atmo; }, get net() { return net; }, get ride() { return ride; }, get weapons() { return weapons; }, post, travel, toggleNight, cycleWeather, enterCar, exitCar, explode, busted, wasted, addMoney,
    keys, pressed,
    // Simulation ohne Bildschirm (z. B. im Hintergrund-Tab): game.simulate(5) rechnet 5 Sekunden
    simulate(secs, dt = 1 / 30, draw = true) { for (let t = 0; t < secs; t += dt) { step(dt); netStep(dt); for (const k in pressed) delete pressed[k]; } if (draw) render(dt); } };
})();
