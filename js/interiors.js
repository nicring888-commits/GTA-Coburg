// Innenräume der kaufbaren Wohnungen: drei Typen (klein, modern, Luxus) aus einfachen Formen mit gemalten
// Texturen. Jeder Raum liegt weit außerhalb der Karte, hat eigene Kollision (Wände und Möbel als Rechtecke)
// und Stellen zum Benutzen (Bett, Fernseher, Licht …). Gebaut wird erst beim ersten Betreten.
'use strict';

const INTERIOR_TYPES = {
  small: { label: 'Klein', title: 'Altbau-Apartment', size: 45, W: 9, D: 7, H: 2.9,
    features: ['Bett', 'Kochnische', 'Fernseher', 'Radio', 'Sofa'] },
  modern: { label: 'Modern', title: 'Moderne Stadtwohnung', size: 110, W: 13, D: 10, H: 3.2,
    features: ['Fensterfront', 'Kücheninsel', 'Espressomaschine', 'Großbild-TV', 'Hi-Fi-Anlage', 'Schlafbereich'] },
  luxury: { label: 'Luxus', title: 'Luxus-Penthouse', size: 240, W: 19, D: 14, H: 3.8,
    features: ['Panoramafenster', 'Whirlpool', 'Bar', 'Flügel', 'Kamin', 'Kino-TV', 'Kronleuchter'] },
};
const INTERIOR_ORIGIN = { x: 6000, z: 6000, step: 120 }; // weit weg von der Stadt (Karte reicht etwa ±1.900 m)

// ---------- gemalte Texturen ----------
const _intTex = {};
function intCanvas(key, w, h, draw, repeat) {
  if (_intTex[key]) return _intTex[key];
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _intTex[key] = t;
  return t;
}

function planksTex(key, base, spread, rows) {
  return intCanvas(key, 512, 512, (c, w, h) => {
    const r = U.rng(U.hashStr(key)), col = new THREE.Color(base), tmp = new THREE.Color();
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 300;
      while (x < w) {
        const len = 180 + r() * 220;
        tmp.copy(col).offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * spread);
        c.fillStyle = '#' + tmp.getHexString(); c.fillRect(x, i * ph, len, ph);
        c.globalAlpha = 0.12; c.strokeStyle = '#000';
        for (let g = 0; g < 5; g++) { // Maserung
          const y = i * ph + r() * ph;
          c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len, y); c.stroke();
        }
        c.globalAlpha = 0.45; c.fillStyle = '#2a1a0e'; c.fillRect(x, i * ph, 2, ph);
        c.globalAlpha = 1;
        x += len;
      }
      c.fillStyle = 'rgba(30,18,8,0.5)'; c.fillRect(0, i * ph, w, 2);
    }
  }, true);
}

function marbleTex() {
  return intCanvas('marble', 512, 512, (c, w, h) => {
    const r = U.rng(77);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x = i * 256, y = j * 256;
      c.fillStyle = (i + j) % 2 ? '#e9e5de' : '#f4f1ec'; c.fillRect(x, y, 256, 256);
      c.strokeStyle = 'rgba(120,115,110,0.35)'; c.lineWidth = 1.2;
      for (let v = 0; v < 7; v++) { // Adern
        let px = x + r() * 256, py = y + r() * 256;
        c.beginPath(); c.moveTo(px, py);
        for (let s = 0; s < 8; s++) { px += (r() - 0.3) * 40; py += (r() - 0.5) * 40; c.lineTo(U.clamp(px, x, x + 256), U.clamp(py, y, y + 256)); }
        c.stroke();
      }
    }
    c.fillStyle = 'rgba(160,140,100,0.6)'; c.fillRect(0, 0, w, 3); c.fillRect(0, 255, w, 3); c.fillRect(0, 0, 3, h); c.fillRect(255, 0, 3, h);
  }, true);
}

function wallpaperTex() {
  return intCanvas('wallpaper', 256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(150,120,80,0.10)'; c.fillRect(x, 0, 14, h); }
    c.fillStyle = 'rgba(150,120,80,0.18)';
    for (let y = 16; y < h; y += 48) for (let x = 23; x < w; x += 32) { c.beginPath(); c.arc(x, y + (x % 64 ? 24 : 0), 3, 0, 6.3); c.fill(); }
  }, true);
}

function rugTex(key, a, b, cc) {
  return intCanvas(key, 256, 256, (c, w, h) => {
    c.fillStyle = a; c.fillRect(0, 0, w, h);
    c.strokeStyle = b; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 3; c.strokeRect(32, 32, w - 64, h - 64);
    c.fillStyle = cc;
    for (let i = 0; i < 4; i++) { c.save(); c.translate(w / 2, h / 2); c.rotate(i * Math.PI / 2); c.beginPath(); c.moveTo(0, -70); c.lineTo(28, 0); c.lineTo(0, 70); c.lineTo(-28, 0); c.fill(); c.restore(); }
    c.fillStyle = b; c.beginPath(); c.arc(w / 2, h / 2, 16, 0, 6.3); c.fill();
  });
}

function paintingTex(seed) {
  return intCanvas('paint' + seed, 256, 192, (c, w, h) => {
    const r = U.rng(seed * 31 + 5);
    const pal = [['#e9b949', '#c0392b', '#1c3d5a', '#f4efe6'], ['#2e6fb7', '#f1c40f', '#ecf0f1', '#111'], ['#27ae60', '#d35400', '#f8f1e5', '#2c3e50'], ['#8e44ad', '#f39c12', '#fdfcfa', '#16a085']][seed % 4];
    c.fillStyle = pal[2]; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = pal[Math.floor(r() * 4)]; c.globalAlpha = 0.6 + r() * 0.4;
      if (r() < 0.5) c.fillRect(r() * w, r() * h, 20 + r() * 110, 10 + r() * 80);
      else { c.beginPath(); c.arc(r() * w, r() * h, 10 + r() * 50, 0, 6.3); c.fill(); }
    }
    c.globalAlpha = 1;
  });
}

// Blick aus dem Fenster: Coburger Dächer und die Veste auf dem Berg (Tag und Nacht)
function viewTex(night) {
  return intCanvas(night ? 'view-n' : 'view-d', 1024, 384, (c, w, h) => {
    const r = U.rng(night ? 3 : 4);
    const g = c.createLinearGradient(0, 0, 0, h);
    if (night) { g.addColorStop(0, '#050a1a'); g.addColorStop(1, '#1d2744'); } else { g.addColorStop(0, '#4f8bd0'); g.addColorStop(1, '#d7e6f2'); }
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (night) for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; c.fillRect(r() * w, r() * h * 0.45, 1.5, 1.5); }
    else { c.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 6; i++) { const x = r() * w, y = 30 + r() * 80; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + k * 22, y + Math.sin(k) * 6, 18 + r() * 10, 0, 6.3); c.fill(); } } }
    // Festungsberg mit Veste
    c.fillStyle = night ? '#0b1322' : '#5d7a4f';
    c.beginPath(); c.moveTo(0, h * 0.72); c.quadraticCurveTo(w * 0.62, h * 0.18, w, h * 0.6); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = night ? '#1a2033' : '#b9ad95';
    c.fillRect(w * 0.55, h * 0.27, 120, 40); c.fillRect(w * 0.58, h * 0.17, 26, 60); c.fillRect(w * 0.66, h * 0.21, 20, 50);
    c.beginPath(); c.moveTo(w * 0.58 - 4, h * 0.17); c.lineTo(w * 0.58 + 13, h * 0.08); c.lineTo(w * 0.58 + 30, h * 0.17); c.fill();
    if (night) { c.fillStyle = '#ffd98a'; for (let i = 0; i < 10; i++) c.fillRect(w * 0.555 + r() * 110, h * 0.29 + r() * 25, 4, 5); }
    // Dächer der Altstadt
    for (let row = 0; row < 3; row++) {
      let x = -20;
      const base = h * (0.7 + row * 0.12);
      while (x < w) {
        const bw = 40 + r() * 70, bh = 30 + r() * 50;
        c.fillStyle = night ? ['#141a28', '#10151f', '#181f2e'][row] : ['#b45a3c', '#9c4a32', '#c06a48'][row];
        c.beginPath(); c.moveTo(x, base); c.lineTo(x + bw / 2, base - bh * 0.6); c.lineTo(x + bw, base); c.fill();
        c.fillStyle = night ? '#0e1320' : ['#e8dcc4', '#ddd0b5', '#efe5d0'][row];
        c.fillRect(x + 3, base, bw - 6, h - base);
        c.fillStyle = night ? '#ffcf7a' : 'rgba(40,50,60,0.55)';
        for (let wy = base + 8; wy < h; wy += 18) for (let wx = x + 9; wx < x + bw - 12; wx += 16) if (!night || r() < 0.4) c.fillRect(wx, wy, 6, 9);
        x += bw - 4;
      }
    }
  });
}

// Fernsehbild: "Coburg TV" mit Nachrichtenlaufband
function tvCanvas() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return { cv, ctx: cv.getContext('2d'), tex: t };
}
const TV_NEWS = ['+++ Bratwurst-Preise am Markt stabil', '+++ Stau am Ketschentor', '+++ Polizei sucht Raser in der Innenstadt',
  '+++ Veste meldet Besucherrekord', '+++ Wetter: sonnig, 21 Grad', '+++ Straßenrennen am Bahnhof gesichtet'];
function drawTV(s, t, on) {
  const c = s.ctx, w = 256, h = 144;
  if (!on) { c.fillStyle = '#07090c'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(20, 10, 70, 124); s.tex.needsUpdate = true; return; }
  const scene = Math.floor(t / 6) % 3;
  if (scene === 0) { // Nachrichtenstudio
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0e3a78'); g.addColorStop(1, '#1b6fd1'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e9b949'; c.fillRect(160, 30, 70, 60);
    c.fillStyle = '#e0b08e'; c.beginPath(); c.arc(90, 62, 18, 0, 6.3); c.fill();
    c.fillStyle = '#20232a'; c.fillRect(66, 80, 48, 40);
    c.fillStyle = '#fff'; c.font = '700 11px Segoe UI'; c.fillText('COBURG TV', 168, 64);
  } else if (scene === 1) { // Fußball
    c.fillStyle = '#2f8f3a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.strokeRect(10, 10, w - 20, h - 34); c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w / 2, h - 24); c.stroke();
    c.beginPath(); c.arc(w / 2, (h - 14) / 2, 18, 0, 6.3); c.stroke();
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#d61f1f' : '#1e88ff'; c.fillRect(30 + ((i * 37 + t * (20 + i * 3)) % 190), 20 + (i * 29) % 80, 5, 7); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(40 + (t * 45) % 170, 30 + Math.abs(Math.sin(t * 1.3)) * 70, 3, 0, 6.3); c.fill();
  } else { // Stadtansicht
    c.drawImage(viewTex(false).image, (t * 20) % 600, 0, 420, 240, 0, 0, w, h);
  }
  c.fillStyle = '#c0392b'; c.fillRect(0, h - 22, w, 22);
  c.fillStyle = '#fff'; c.font = '600 12px Segoe UI';
  const msg = TV_NEWS.join('   ');
  c.fillText(msg, w - ((t * 50) % (msg.length * 7 + w)), h - 7);
  s.tex.needsUpdate = true;
}

// ---------- Raum ----------
class Room {
  constructor(type, index) {
    const T = INTERIOR_TYPES[type];
    this.type = type; this.T = T;
    this.W = T.W; this.D = T.D; this.H = T.H;
    this.ox = INTERIOR_ORIGIN.x + index * INTERIOR_ORIGIN.step; this.oz = INTERIOR_ORIGIN.z;
    this.group = new THREE.Group();
    this.group.position.set(this.ox, 0, this.oz);
    this.group.visible = false;
    this.boxes = [];     // Kollision: Rechtecke in Raumkoordinaten
    this.spots = [];     // Stellen zum Benutzen
    this.lamps = [];     // leuchtende Materialien (Licht an/aus)
    this.windows = [];   // Fenstermaterialien (Tag/Nacht)
    this.anims = [];     // kleine Animationen
    this.state = { light: true, tv: false, music: false, fire: true };
    this._mats = {};
    this._col = {};
  }

  mat(color, extra) {
    const key = color + (extra ? JSON.stringify(Object.keys(extra)) + (extra.emissive || '') : '');
    if (!extra && this._mats[key]) return this._mats[key];
    const m = new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));
    if (!extra) this._mats[key] = m;
    return m;
  }

  lampMat(color, on = 1.4) {
    const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: on });
    m.userData.on = on;
    this.lamps.push(m);
    return m;
  }

  // Quader in Raumkoordinaten (y = Unterkante); solid trägt ihn in die Kollision ein
  box(w, h, d, m, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true;
    (opts.parent || this.group).add(mesh);
    if (opts.solid) this.solid(x, z, w, d);
    return mesh;
  }
  cyl(rt, rb, h, m, x, y, z, seg = 16, parent) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
    (parent || this.group).add(mesh);
    return mesh;
  }
  solid(x, z, w, d) { this.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }

  // Möbelstück, das nach +z schaut, um ry (Vielfaches von 90°) gedreht; Grundriss w × d wird Kollision
  piece(x, z, ry, w, d, build, solid = true) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    this.group.add(g);
    build(g);
    if (solid) {
      const q = Math.round(ry / (Math.PI / 2)) & 1;
      this.solid(x, z, q ? d : w, q ? w : d);
    }
    return g;
  }
  pbox(g, w, h, d, m, x, y, z, shadow = true) { return this.box(w, h, d, m, x, y, z, { parent: g, shadow }); }

  spot(x, z, r, label, act) { this.spots.push({ x, z, r, label, act }); }

  // ---------- Raumhülle ----------
  shell(floorMat, wallMat, ceilColor, door) {
    const { W, D, H } = this;
    const floor = this.box(W + 0.4, 0.1, D + 0.4, floorMat, 0, -0.1, 0, { shadow: false });
    floor.receiveShadow = true;
    const ceilMat = this.mat(ceilColor, { emissive: ceilColor, emissiveIntensity: 0.35 });
    ceilMat.userData.on = 0.35; this.lamps.push(ceilMat); // Decke wirkt beleuchtet
    const ceil = this.box(W + 0.4, 0.1, D + 0.4, ceilMat, 0, H, 0, { shadow: false });
    ceil.castShadow = false;
    const t = 0.2;
    const walls = [
      [W + 0.4, D / 2 + t / 2, 0, true], [W + 0.4, -D / 2 - t / 2, 0, true],
      [D, W / 2 + t / 2, Math.PI / 2, false], [D, -W / 2 - t / 2, Math.PI / 2, false],
    ];
    this.wallMeshes = [];
    for (const [len, off, ry, ns] of walls) {
      const m = this.box(ns ? len : t, H, ns ? t : len, wallMat, ns ? 0 : off, 0, ns ? off : 0, { shadow: false });
      m.castShadow = false;
      this.wallMeshes.push(m);
    }
    // Sockelleiste
    const sk = this.mat('#ece6dc');
    this.box(W, 0.1, 0.03, sk, 0, 0, -D / 2 + 0.015, { shadow: false });
    this.box(W, 0.1, 0.03, sk, 0, 0, D / 2 - 0.015, { shadow: false });
    this.box(0.03, 0.1, D, sk, -W / 2 + 0.015, 0, 0, { shadow: false });
    this.box(0.03, 0.1, D, sk, W / 2 - 0.015, 0, 0, { shadow: false });
    // Wohnungstür (Südwand)
    this.door = { x: door, z: D / 2 - 0.7 };
    const frame = this.mat('#efe9df'), leaf = this.mat('#7a4b2a');
    this.box(1.3, 2.35, 0.06, frame, door, 0, D / 2 - 0.03, { shadow: false });
    this.box(1.05, 2.2, 0.05, leaf, door, 0, D / 2 - 0.07, { shadow: false });
    this.box(0.14, 0.03, 0.06, this.mat('#d8b65a'), door + 0.38, 1.0, D / 2 - 0.12, { shadow: false });
    this.box(0.9, 0.01, 0.6, this.mat('#5b4a3a'), door, 0, D / 2 - 0.45, { shadow: false }); // Fußmatte
    this.spawn = { x: door, z: D / 2 - 1.5, heading: Math.PI };
    this.spot(door, D / 2 - 0.6, 1.1, () => 'Wohnung verlassen', 'exit');
  }

  // Fenster als leuchtende Fläche mit Rahmen; wall: 'n' | 'e' | 'w', pos entlang der Wand
  window(wall, pos, w, h, sill) {
    const { W, D } = this;
    // je Fenster ein eigener Ausschnitt für Tag und Nacht (Klone teilen nur das Bild)
    const cut = night => { const t = viewTex(night).clone(); t.repeat.set(w / 12, h / 4.5); t.offset.set(((pos + 20) / 40) % 1, 0.05); t.needsUpdate = true; return t; };
    const m = new THREE.MeshBasicMaterial({ map: cut(false), fog: false });
    m.userData.day = m.map; m.userData.night = cut(true);
    this.windows.push(m);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    const fr = this.mat('#f2efe9'), g = new THREE.Group();
    g.add(plane);
    const bar = (bw, bh, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.08), fr); b.position.set(x, y, 0.03); g.add(b); };
    bar(w + 0.12, 0.08, 0, h / 2); bar(w + 0.12, 0.08, 0, -h / 2); bar(0.08, h, -w / 2, 0); bar(0.08, h, w / 2, 0);
    const n = Math.max(1, Math.round(w / 1.4));
    for (let i = 1; i < n; i++) bar(0.05, h, -w / 2 + w * i / n, 0);
    if (h > 1.6) bar(w, 0.05, 0, h * 0.18);
    const y = sill + h / 2;
    if (wall === 'n') { g.position.set(pos, y, -D / 2 + 0.02); }
    else if (wall === 'e') { g.position.set(W / 2 - 0.02, y, pos); g.rotation.y = -Math.PI / 2; }
    else { g.position.set(-W / 2 + 0.02, y, pos); g.rotation.y = Math.PI / 2; }
    this.group.add(g);
    if (sill > 0.3) { // Fensterbank
      const s = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.05, 0.25), fr);
      s.position.set(0, -h / 2 - 0.03, 0.1); g.add(s);
    }
  }

  painting(wall, pos, y, w, h, seed) {
    const { W, D } = this;
    const g = new THREE.Group();
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05), this.mat('#3a2a1c'));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: paintingTex(seed) }));
    pic.position.z = 0.03; g.add(fr, pic);
    if (wall === 's') { g.position.set(pos, y, D / 2 - 0.03); g.rotation.y = Math.PI; }
    else if (wall === 'n') g.position.set(pos, y, -D / 2 + 0.03);
    else if (wall === 'e') { g.position.set(W / 2 - 0.03, y, pos); g.rotation.y = -Math.PI / 2; }
    else { g.position.set(-W / 2 + 0.03, y, pos); g.rotation.y = Math.PI / 2; }
    this.group.add(g);
  }

  rug(x, z, w, d, tex) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); m.receiveShadow = true;
    this.group.add(m);
  }

  // ---------- Möbel ----------
  bed(x, z, ry, w, l, frameCol, blanketCol) {
    this.piece(x, z, ry, w, l, g => {
      this.pbox(g, w, 0.35, l, this.mat(frameCol), 0, 0, 0);
      this.pbox(g, w - 0.08, 0.22, l - 0.1, this.mat('#f4f2ee'), 0, 0.35, 0.02);
      this.pbox(g, w - 0.02, 0.08, l * 0.62, this.mat(blanketCol), 0, 0.53, l * 0.18);
      for (const s of w > 1.2 ? [-1, 1] : [0]) this.pbox(g, w > 1.2 ? w / 2 - 0.15 : w - 0.2, 0.14, 0.4, this.mat('#ffffff'), s * w / 4, 0.57, -l / 2 + 0.32);
      this.pbox(g, w + 0.08, 1.05, 0.1, this.mat(frameCol), 0, 0, -l / 2 - 0.02);
    });
  }
  nightstand(x, z, ry, col, lampCol) {
    this.piece(x, z, ry, 0.5, 0.42, g => {
      this.pbox(g, 0.5, 0.5, 0.42, this.mat(col), 0, 0, 0);
      this.pbox(g, 0.4, 0.02, 0.02, this.mat('#c9a65a'), 0, 0.36, 0.215, false);
      this.cyl(0.07, 0.09, 0.25, this.mat('#2a2a2a'), 0, 0.5, 0, 12, g);
      this.cyl(0.11, 0.17, 0.2, this.lampMat(lampCol || '#ffe2a8', 1.1), 0, 0.72, 0, 16, g);
    });
  }
  sofa(x, z, ry, w, d, col, cushion) {
    this.piece(x, z, ry, w, d, g => {
      const m = this.mat(col), c = this.mat(cushion || col);
      this.pbox(g, w, 0.42, d, m, 0, 0, 0);
      this.pbox(g, w, 0.5, 0.22, m, 0, 0.42, -d / 2 + 0.11);
      this.pbox(g, 0.2, 0.25, d, m, w / 2 - 0.1, 0.42, 0); this.pbox(g, 0.2, 0.25, d, m, -w / 2 + 0.1, 0.42, 0);
      const n = Math.max(2, Math.round((w - 0.4) / 0.8));
      for (let i = 0; i < n; i++) this.pbox(g, (w - 0.4) / n - 0.04, 0.12, d - 0.3, c, -w / 2 + 0.2 + (i + 0.5) * (w - 0.4) / n, 0.42, 0.08);
    });
  }
  table(x, z, w, d, h, top, leg, solid = true) {
    this.piece(x, z, 0, w, d, g => {
      this.pbox(g, w, 0.05, d, this.mat(top), 0, h - 0.05, 0);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.pbox(g, 0.05, h - 0.05, 0.05, this.mat(leg), sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08));
    }, solid);
  }
  chair(x, z, ry, col) {
    this.piece(x, z, ry, 0.45, 0.45, g => {
      const m = this.mat(col);
      this.pbox(g, 0.45, 0.05, 0.45, m, 0, 0.45, 0);
      this.pbox(g, 0.45, 0.5, 0.05, m, 0, 0.5, -0.2);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.pbox(g, 0.04, 0.45, 0.04, m, sx * 0.19, 0, sz * 0.19);
    });
  }
  stool(x, z, col) {
    this.piece(x, z, 0, 0.4, 0.4, g => {
      this.cyl(0.2, 0.2, 0.06, this.mat(col), 0, 0.72, 0, 16, g);
      this.cyl(0.03, 0.03, 0.72, this.mat('#9aa0a6'), 0, 0, 0, 8, g);
      this.cyl(0.18, 0.18, 0.03, this.mat('#9aa0a6'), 0, 0, 0, 16, g);
    });
  }
  counter(x, z, ry, len, bodyCol, topCol, opts = {}) {
    this.piece(x, z, ry, len, 0.62, g => {
      this.pbox(g, len, 0.86, 0.6, this.mat(bodyCol), 0, 0, 0);
      this.pbox(g, len + 0.02, 0.04, 0.64, this.mat(topCol), 0, 0.86, 0);
      for (let i = 0; i < Math.floor(len / 0.6); i++) this.pbox(g, 0.02, 0.6, 0.01, this.mat('#000000'), -len / 2 + 0.6 * (i + 1), 0.12, 0.305, false);
      if (opts.sink !== undefined) { this.pbox(g, 0.5, 0.02, 0.4, this.mat('#b8bec4'), opts.sink, 0.9, 0); this.cyl(0.015, 0.015, 0.3, this.mat('#c8ccd0'), opts.sink, 0.9, -0.22, 8, g); }
      if (opts.hob !== undefined) {
        this.pbox(g, 0.6, 0.015, 0.5, this.mat('#111111'), opts.hob, 0.9, 0);
        for (const [a, b] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) this.cyl(0.08, 0.08, 0.005, this.mat('#3a3a3a'), opts.hob + a, 0.915, b, 16, g);
      }
      if (opts.upper) { // Hängeschränke
        this.pbox(g, len, 0.7, 0.35, this.mat(bodyCol), 0, 1.5, -0.13);
        this.pbox(g, len, 0.03, 0.35, this.mat('#ffe9b8', { emissive: '#ffe2a0', emissiveIntensity: 0.5 }), 0, 1.47, -0.13, false);
      }
      if (opts.coffee !== undefined) {
        this.pbox(g, 0.3, 0.38, 0.3, this.mat('#1e1f22'), opts.coffee, 0.9, -0.08);
        this.pbox(g, 0.22, 0.04, 0.12, this.mat('#c9ccd0'), opts.coffee, 1.02, 0.08);
      }
    });
  }
  fridge(x, z, ry, h = 1.85) {
    this.piece(x, z, ry, 0.7, 0.66, g => {
      this.pbox(g, 0.7, h, 0.66, this.mat('#dfe3e6'), 0, 0, 0);
      this.pbox(g, 0.69, 0.01, 0.01, this.mat('#9aa0a6'), 0, h * 0.62, 0.335, false);
      this.pbox(g, 0.03, 0.4, 0.04, this.mat('#9aa0a6'), 0.28, h * 0.68, 0.35, false);
      this.pbox(g, 0.03, 0.3, 0.04, this.mat('#9aa0a6'), 0.28, h * 0.4, 0.35, false);
    });
  }
  tv(x, z, ry, w, standCol) {
    const s = tvCanvas();
    drawTV(s, 0, false);
    this.piece(x, z, ry, w * 0.9, 0.45, g => {
      this.pbox(g, w * 0.9, 0.5, 0.45, this.mat(standCol), 0, 0, 0);
      const h = w * 0.5625;
      this.pbox(g, w, h, 0.06, this.mat('#111214'), 0, 0.62, -0.08, false);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), new THREE.MeshBasicMaterial({ map: s.tex, fog: false }));
      scr.position.set(0, 0.62 + h / 2, -0.045); g.add(scr);
    });
    this.screen = s;
  }
  wallTV(wall, pos, w, y) { // flacher Fernseher an der Wand (Luxus)
    const s = tvCanvas(); drawTV(s, 0, false);
    const g = new THREE.Group(), h = w * 0.5625;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), this.mat('#0d0e10')));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), new THREE.MeshBasicMaterial({ map: s.tex, fog: false }));
    scr.position.z = 0.035; g.add(scr);
    if (wall === 'e') { g.position.set(this.W / 2 - 0.05, y, pos); g.rotation.y = -Math.PI / 2; }
    this.group.add(g);
    this.screen = s;
  }
  wardrobe(x, z, ry, w, col) {
    this.piece(x, z, ry, w, 0.6, g => {
      this.pbox(g, w, 2.1, 0.6, this.mat(col), 0, 0, 0);
      this.pbox(g, 0.01, 2.0, 0.01, this.mat('#00000a'), 0, 0.05, 0.305, false);
      this.pbox(g, 0.03, 0.25, 0.03, this.mat('#c9a65a'), -0.08, 1.0, 0.32, false);
      this.pbox(g, 0.03, 0.25, 0.03, this.mat('#c9a65a'), 0.08, 1.0, 0.32, false);
    });
  }
  bookshelf(x, z, ry, w, h, col, seed) {
    const r = U.rng(seed);
    const books = ['#8e2c2c', '#2c4a8e', '#2e7d4f', '#d8b65a', '#5b3a6e', '#e0dccf', '#1f2a36', '#b5651d'];
    this.piece(x, z, ry, w, 0.35, g => {
      const m = this.mat(col);
      this.pbox(g, w, h, 0.04, m, 0, 0, -0.16);
      this.pbox(g, 0.04, h, 0.35, m, -w / 2 + 0.02, 0, 0); this.pbox(g, 0.04, h, 0.35, m, w / 2 - 0.02, 0, 0);
      const rows = Math.floor(h / 0.38);
      for (let i = 0; i <= rows; i++) this.pbox(g, w, 0.03, 0.35, m, 0, i * (h - 0.03) / rows, 0, false);
      for (let i = 0; i < rows; i++) {
        let bx = -w / 2 + 0.06;
        while (bx < w / 2 - 0.1) {
          const bw = 0.03 + r() * 0.05, bh = 0.2 + r() * 0.1;
          if (r() < 0.85) this.pbox(g, bw, bh, 0.22, this.mat(books[Math.floor(r() * books.length)]), bx + bw / 2, i * (h - 0.03) / rows + 0.03, 0.02, false);
          bx += bw + 0.005 + (r() < 0.1 ? 0.12 : 0);
        }
      }
    });
  }
  plant(x, z, s = 1, pot = '#c8b8a2') {
    this.piece(x, z, 0, 0.45 * s, 0.45 * s, g => {
      this.cyl(0.2 * s, 0.15 * s, 0.4 * s, this.mat(pot), 0, 0, 0, 14, g);
      const leaf = this.mat('#2f7d3a'), leaf2 = this.mat('#3f9a4a');
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * s, 0), i % 2 ? leaf : leaf2);
        b.position.set(Math.sin(i * 2.1) * 0.13 * s, (0.6 + (i % 3) * 0.22) * s, Math.cos(i * 2.1) * 0.13 * s);
        b.castShadow = true; g.add(b);
      }
    });
  }
  floorLamp(x, z, shade) {
    this.piece(x, z, 0, 0.35, 0.35, g => {
      this.cyl(0.16, 0.18, 0.03, this.mat('#2a2a2a'), 0, 0, 0, 16, g);
      this.cyl(0.015, 0.015, 1.5, this.mat('#2a2a2a'), 0, 0, 0, 8, g);
      this.cyl(0.14, 0.22, 0.28, this.lampMat(shade || '#fff0cc', 1.2), 0, 1.45, 0, 18, g);
    });
  }
  ceilingLamp(x, z, col, r = 0.25) {
    const H = this.H;
    this.cyl(0.01, 0.01, 0.5, this.mat('#333333'), x, H - 0.5, z, 6);
    this.cyl(r * 0.4, r, r * 0.8, this.lampMat(col || '#fff3d6', 1.5), x, H - 0.5 - r * 0.8, z, 20);
  }
  pendantRow(x, z, n, gap, col) { for (let i = 0; i < n; i++) this.ceilingLamp(x + (i - (n - 1) / 2) * gap, z, col, 0.16); }
  speaker(x, z, ry) {
    this.piece(x, z, ry, 0.32, 0.32, g => {
      this.pbox(g, 0.32, 1.05, 0.32, this.mat('#1a1b1e'), 0, 0, 0);
      for (const y of [0.35, 0.75]) { const c = this.cyl(0.1, 0.1, 0.02, this.mat('#3a3c40'), 0, y, 0.16, 16, g); c.rotation.x = Math.PI / 2; }
    });
  }
  lightSwitch(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 1.15, z); g.rotation.y = ry;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), this.mat('#f4f4f4')));
    this.group.add(g);
  }

  // ---------- Kollision: Kreis aus Möbeln und Wänden schieben ----------
  collide(x, z, r, out) {
    out = out || this._col;
    out.hit = false; out.nx = 0; out.nz = 0;
    let lx = x - this.ox, lz = z - this.oz;
    for (const b of this.boxes) {
      const cx = U.clamp(lx, b.minX, b.maxX), cz = U.clamp(lz, b.minZ, b.maxZ);
      const dx = lx - cx, dz = lz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); lx = cx + dx / d * r; lz = cz + dz / d * r; out.nx += dx / d; out.nz += dz / d; }
      else { // Mittelpunkt im Möbel: zur nächsten Seite hinaus
        const e = [lx - b.minX, b.maxX - lx, lz - b.minZ, b.maxZ - lz], m = Math.min(...e);
        if (m === e[0]) lx = b.minX - r; else if (m === e[1]) lx = b.maxX + r; else if (m === e[2]) lz = b.minZ - r; else lz = b.maxZ + r;
      }
      out.hit = true;
    }
    const hx = this.W / 2 - r, hz = this.D / 2 - r;
    if (lx < -hx) { lx = -hx; out.hit = true; } if (lx > hx) { lx = hx; out.hit = true; }
    if (lz < -hz) { lz = -hz; out.hit = true; } if (lz > hz) { lz = hz; out.hit = true; }
    out.x = lx + this.ox; out.z = lz + this.oz;
    return out;
  }

  // Ersatz für die Welt-Abfragen, damit die Spielfigur unverändert im Raum laufen kann
  get walker() {
    if (!this._walker) this._walker = { heightAt: () => 0, insideBuilding: () => null, collideCircle: (x, z, r, out) => this.collide(x, z, r, out) };
    return this._walker;
  }

  // Kamera bleibt innerhalb der Wände: Punkt auf dem Strahl vom Ziel zur Wunschposition kürzen
  clampCam(tx, ty, tz, wx, wy, wz) {
    const m = 0.28, lo = [this.ox - this.W / 2 + m, 0.35, this.oz - this.D / 2 + m], hi = [this.ox + this.W / 2 - m, this.H - 0.2, this.oz + this.D / 2 - m];
    const t = [tx, ty, tz], w = [wx, wy, wz];
    let f = 1;
    for (let i = 0; i < 3; i++) {
      const d = w[i] - t[i];
      if (t[i] + d * f > hi[i] && d > 0) f = Math.max(0, (hi[i] - t[i]) / d);
      if (t[i] + d * f < lo[i] && d < 0) f = Math.max(0, (lo[i] - t[i]) / d);
    }
    return [tx + (wx - tx) * f, ty + (wy - ty) * f, tz + (wz - tz) * f];
  }

  nearestSpot(x, z) {
    const lx = x - this.ox, lz = z - this.oz;
    let best = null, bd = 1e9;
    for (const s of this.spots) { const d = Math.hypot(s.x - lx, s.z - lz); if (d < s.r && d < bd) { bd = d; best = s; } }
    return best;
  }

  setNight(night) {
    for (const m of this.windows) m.map = night ? m.userData.night : m.userData.day;
  }

  setLight(on) {
    this.state.light = on;
    for (const m of this.lamps) m.emissiveIntensity = on ? m.userData.on : 0.05;
  }

  update(dt, t) {
    if (this.screen && this.state.tv) { this._tvT = (this._tvT || 0) - dt; if (this._tvT <= 0) { this._tvT = 0.08; drawTV(this.screen, t, true); } }
    for (const a of this.anims) a(dt, t);
  }
}

// ---------- die drei Grundrisse ----------
function buildSmallRoom(index) {
  const R = new Room('small', index);
  R.shell(new THREE.MeshLambertMaterial({ map: planksTex('oak-dark', '#8a5a35', 0.12, 8) }),
    new THREE.MeshLambertMaterial({ color: '#efe4cf', map: wallpaperTex() }), '#f6f1e8', -3);
  R.group.children[0].material.map.repeat.set(R.W / 2.5, R.D / 2.5);
  R.wallMeshes.forEach(m => { m.material.map.repeat.set(4, 2); });
  R.window('n', 0.3, 1.5, 1.4, 0.95);
  R.window('w', -1.6, 1.2, 1.4, 0.95);
  // Schlafecke
  R.bed(3.25, -2.35, 0, 1.6, 2.1, '#6b4428', '#2e6fb7');
  R.nightstand(2.15, -3.2, 0, '#6b4428');
  R.wardrobe(4.15, -0.4, -Math.PI / 2, 1.5, '#e6dccb');
  // Kochnische
  R.fridge(-4.1, -3.12, 0);
  R.counter(-2.55, -3.18, 0, 2.3, '#d9cdb8', '#3a3a3a', { sink: -0.5, hob: 0.6, upper: true });
  R.table(-2.2, -1.1, 1.1, 0.75, 0.76, '#a0703f', '#5b3d22');
  R.chair(-2.85, -1.1, Math.PI / 2, '#5b3d22'); R.chair(-1.55, -1.1, -Math.PI / 2, '#5b3d22');
  // Wohnecke
  R.rug(2.7, 2.1, 2.8, 2.0, rugTex('rug-s', '#8e2c2c', '#e9d9b4', '#c9a65a'));
  R.sofa(1.55, 2.1, Math.PI / 2, 1.9, 0.85, '#4a5a6a', '#5d6f80');
  R.table(2.75, 2.1, 0.5, 0.9, 0.42, '#6b4428', '#4a2f1b');
  R.tv(4.22, 2.1, -Math.PI / 2, 1.1, '#6b4428');
  R.bookshelf(-4.3, 1.1, Math.PI / 2, 1.2, 1.9, '#7a5233', 3);
  R.plant(-4.05, 2.95, 1, '#b5651d'); R.plant(0.9, -3.15, 0.8);
  R.painting('n', 2.9, 1.55, 0.6, 0.45, 1);
  R.painting('s', 1.6, 1.6, 0.9, 0.6, 2);
  R.ceilingLamp(0, 0, '#fff0cc', 0.3);
  R.lightSwitch(-2.3, R.D / 2 - 0.11, Math.PI);
  R.spot(3.2, -0.9, 1.0, () => 'Schlafen', 'sleep');
  R.spot(2.6, 1.1, 1.2, s => s.tv ? 'Fernseher ausschalten' : 'Fernsehen', 'tv');
  R.spot(-4.0, -2.3, 0.9, () => 'Snack aus dem Kühlschrank', 'snack');
  R.box(0.3, 0.16, 0.14, R.mat('#7a1f1f'), -1.52, 0.9, -3.25); // Küchenradio
  R.box(0.1, 0.1, 0.01, R.mat('#d8d4cc'), -1.6, 0.93, -3.175, { shadow: false });
  R.spot(-1.55, -2.45, 0.8, s => s.music ? 'Radio aus' : 'Radio an', 'music');
  R.spot(-2.3, 2.95, 0.6, s => s.light ? 'Licht aus' : 'Licht an', 'light');
  return R;
}

function buildModernRoom(index) {
  const R = new Room('modern', index);
  R.shell(new THREE.MeshLambertMaterial({ map: planksTex('oak-light', '#c9a77c', 0.08, 5) }),
    new THREE.MeshLambertMaterial({ color: '#f1f0ec' }), '#fbfbf9', 4.5);
  R.group.children[0].material.map.repeat.set(R.W / 3, R.D / 3);
  // Akzentwand
  R.box(0.04, R.H, R.D, R.mat('#2f3b46'), R.W / 2 - 0.02, 0, 0, { shadow: false }).castShadow = false;
  R.window('n', -4.3, 3.6, 2.6, 0.3); R.window('n', 0, 3.6, 2.6, 0.3); R.window('n', 4.3, 3.6, 2.6, 0.3);
  // Küche
  R.counter(-6.17, 0.5, Math.PI / 2, 4.0, '#ffffff', '#2b2d30', { sink: -0.9, hob: 0.9, upper: true, coffee: -1.7 });
  R.fridge(-6.15, 3.3, Math.PI / 2, 2.1);
  R.piece(-4.05, 0.5, 0, 1.0, 2.4, g => {
    R.pbox(g, 1.0, 0.9, 2.4, R.mat('#2b2d30'), 0, 0, 0);
    R.pbox(g, 1.1, 0.05, 2.5, R.mat('#e8e6e1'), 0, 0.9, 0);
    R.pbox(g, 0.25, 0.18, 0.25, R.mat('#c0392b'), 0, 0.95, -0.6);
    for (let i = 0; i < 3; i++) R.cyl(0.07, 0.06, 0.08, R.mat(['#f1c40f', '#27ae60', '#d35400'][i]), 0.1 - i * 0.08, 0.95, 0.4 + i * 0.12, 10, g);
  });
  for (const z of [-0.3, 0.5, 1.3]) R.stool(-3.15, z, '#2b2d30');
  R.pendantRow(-4.05, 0.5, 3, 0.8, '#ffe9c4');
  // Essplatz
  R.table(-3.6, -3.2, 1.9, 0.95, 0.76, '#3a2a1c', '#1d1d1d');
  for (const x of [-4.2, -3.0]) { R.chair(x, -3.95, 0, '#e8e6e1'); R.chair(x, -2.45, Math.PI, '#e8e6e1'); }
  R.ceilingLamp(-3.6, -3.2, '#ffe9c4', 0.35);
  // Wohnbereich
  R.rug(4.0, -0.4, 3.8, 3.4, rugTex('rug-m', '#d8d4cc', '#2f3b46', '#9aa3ab'));
  R.sofa(2.55, -0.4, Math.PI / 2, 2.9, 0.95, '#8c9399', '#a3aab0');
  R.piece(3.45, 1.55, 0, 1.6, 0.95, g => { // Récamiere
    R.pbox(g, 1.6, 0.42, 0.95, R.mat('#8c9399'), 0, 0, 0);
    R.pbox(g, 1.5, 0.12, 0.85, R.mat('#a3aab0'), 0.05, 0.42, 0);
  });
  R.table(4.1, -0.4, 0.75, 1.3, 0.38, '#e8e6e1', '#1d1d1d');
  R.tv(6.2, -0.4, -Math.PI / 2, 2.0, '#1d1d1d');
  R.speaker(6.25, 1.35, -Math.PI / 2);
  R.speaker(6.25, -2.0, -Math.PI / 2);
  R.floorLamp(1.7, -2.1, '#fff0d0');
  // Schlafbereich hinter Glaswand
  R.box(2.9, 2.4, 0.06, new THREE.MeshLambertMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.35 }), 5.05, 0, -2.6, { solid: true, shadow: false });
  R.bed(5.35, -3.65, -Math.PI / 2, 1.8, 2.2, '#3b3f44', '#e9b949');
  R.floorLamp(6.2, -4.75, '#fff5dd');
  // Deko
  R.bookshelf(-1.4, 4.78, Math.PI, 2.2, 2.2, '#f1f0ec', 9);
  R.plant(-6.0, -4.5, 1.3, '#e8e6e1'); R.plant(0.8, -4.5, 1.1, '#2b2d30'); R.plant(6.0, 4.5, 1.2, '#e8e6e1');
  R.painting('s', 1.6, 1.7, 1.4, 0.9, 5);
  R.painting('w', -3.3, 1.8, 1.1, 0.8, 6);
  R.lightSwitch(3.6, R.D / 2 - 0.11, Math.PI);
  R.spot(3.5, -3.65, 1.3, () => 'Schlafen', 'sleep');
  R.spot(3.55, -0.4, 1.2, s => s.tv ? 'Fernseher ausschalten' : 'Fernsehen', 'tv');
  R.spot(5.3, 2.1, 1.0, s => s.music ? 'Musik aus' : 'Musik an', 'music');
  R.spot(-5.3, 2.2, 1.0, () => 'Espresso trinken', 'snack');
  R.spot(3.6, 4.35, 0.7, s => s.light ? 'Licht aus' : 'Licht an', 'light');
  return R;
}

function buildLuxuryRoom(index) {
  const R = new Room('luxury', index);
  R.shell(new THREE.MeshLambertMaterial({ map: marbleTex() }),
    new THREE.MeshLambertMaterial({ color: '#efe6d6' }), '#f7f2ea', 0);
  R.group.children[0].material.map.repeat.set(R.W / 2, R.D / 2);
  const gold = R.mat('#c9a65a');
  R.box(R.W, 0.06, 0.04, gold, 0, R.H - 0.35, R.D / 2 - 0.02, { shadow: false }); // Zierleiste
  R.window('n', -6.2, 6.0, 3.2, 0.25); R.window('n', 0, 6.0, 3.2, 0.25); R.window('n', 6.2, 6.0, 3.2, 0.25);
  // Whirlpool
  R.piece(-6.6, -4.4, 0, 3.2, 3.2, g => { // Becken: Rand aus vier Seiten, innen gefliest
    const rim = R.mat('#f4f1ec');
    R.pbox(g, 3.2, 0.62, 0.25, rim, 0, 0, -1.475); R.pbox(g, 3.2, 0.62, 0.25, rim, 0, 0, 1.475);
    R.pbox(g, 0.25, 0.62, 2.7, rim, -1.475, 0, 0); R.pbox(g, 0.25, 0.62, 2.7, rim, 1.475, 0, 0);
    R.pbox(g, 2.7, 0.05, 2.7, R.mat('#1f6fa8'), 0, 0, 0, false);
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7, 12, 12), new THREE.MeshLambertMaterial({ color: '#4fc3f7', emissive: '#0b5f8a', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.set(-6.6, 0.55, -4.4); R.group.add(water);
  const bubbles = [];
  for (let i = 0; i < 18; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), R.mat('#e8f8ff')); R.group.add(b); bubbles.push([b, Math.random() * 6.3, 0.3 + Math.random() * 1.1]); }
  R.anims.push((dt, t) => {
    const p = water.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(t * 2.2 + p.getX(i) * 3) * 0.015 + Math.cos(t * 1.7 + p.getY(i) * 2.5) * 0.015);
    p.needsUpdate = true;
    for (const [b, a, r] of bubbles) b.position.set(-6.6 + Math.cos(a + t * 0.8) * r, 0.56 + Math.abs(Math.sin(t * 5 + a * 3)) * 0.05, -4.4 + Math.sin(a + t * 0.8) * r);
  });
  // Bar
  R.counter(-8.55, 2.6, Math.PI / 2, 3.6, '#2a1c14', '#e8e2d6', { sink: 0.9 });
  R.piece(-9.3, 2.6, Math.PI / 2, 3.6, 0.35, g => {
    R.pbox(g, 3.6, 2.2, 0.06, R.mat('#2a1c14'), 0, 0.9, -0.12);
    const glow = R.lampMat('#ffcf7a', 0.9);
    for (const y of [1.25, 1.75, 2.25]) {
      R.pbox(g, 3.4, 0.03, 0.28, glow, 0, y, 0.04, false);
      for (let i = 0; i < 9; i++) R.cyl(0.04, 0.04, 0.26, R.mat(['#2e7d4f', '#8e2c2c', '#d8b65a', '#e0dccf'][i % 4], { transparent: true, opacity: 0.85 }), -1.55 + i * 0.38, y + 0.03, 0.04, 8, g);
    }
  });
  for (const z of [1.5, 2.3, 3.1, 3.9]) R.stool(-7.55, z, '#7a1f1f');
  // Flügel
  R.piece(-3.0, -1.4, 0, 1.5, 2.0, g => {
    const black = R.mat('#0c0c0d');
    R.pbox(g, 1.5, 0.3, 2.0, black, 0, 0.7, 0);
    R.pbox(g, 1.4, 0.06, 0.18, R.mat('#f7f5f0'), 0, 0.78, 1.0, false);
    for (let i = 0; i < 12; i++) R.pbox(g, 0.05, 0.02, 0.1, black, -0.6 + i * 0.11, 0.84, 0.97, false);
    const lid = R.pbox(g, 1.45, 0.03, 1.9, black, 0, 1.0, -0.05); lid.rotation.x = -0.35; lid.position.y = 1.35;
    for (const [x, z] of [[0.6, 0.8], [-0.6, 0.8], [0, -0.8]]) R.pbox(g, 0.1, 0.7, 0.1, black, x, 0, z);
  });
  R.piece(-3.0, 0.15, 0, 0.8, 0.4, g => R.pbox(g, 0.8, 0.48, 0.4, R.mat('#0c0c0d'), 0, 0, 0));
  // Wohnlandschaft und Kino
  R.rug(5.5, 0.6, 5.2, 4.4, rugTex('rug-l', '#efe3c8', '#7a1f1f', '#c9a65a'));
  R.sofa(4.4, 0.6, Math.PI / 2, 3.4, 1.05, '#f2ede2', '#e6dcc8');
  R.sofa(6.3, 2.8, Math.PI, 2.2, 1.0, '#7a1f1f', '#8e2c2c');
  R.table(6.3, 0.6, 1.0, 1.6, 0.4, '#c9a65a', '#3a2a1c');
  R.wallTV('e', 0.6, 3.4, 1.9);
  R.piece(9.2, 0.6, -Math.PI / 2, 4.0, 0.45, g => R.pbox(g, 4.0, 0.45, 0.45, R.mat('#2a1c14'), 0, 0, 0));
  R.speaker(9.2, -2.0, -Math.PI / 2); R.speaker(9.2, 3.2, -Math.PI / 2);
  // Schlafbereich auf Podest
  R.box(4.4, 0.12, 4.0, R.mat('#3a2a1c'), 7.3, 0, -4.9, { shadow: false });
  R.bed(8.05, -4.9, -Math.PI / 2, 2.2, 2.4, '#e9e2d4', '#7a1f1f');
  R.nightstand(8.75, -3.4, -Math.PI / 2, '#3a2a1c', '#fff2d6'); R.nightstand(8.75, -6.4, -Math.PI / 2, '#3a2a1c', '#fff2d6');
  // Kamin an der Südwand
  R.piece(-5.0, 6.65, Math.PI, 2.4, 0.6, g => {
    R.pbox(g, 2.4, 1.3, 0.6, R.mat('#d9d2c5'), 0, 0, 0);
    R.pbox(g, 2.6, 0.1, 0.7, R.mat('#c9c0b0'), 0, 1.3, 0);
    R.pbox(g, 1.4, 0.75, 0.05, R.mat('#111111'), 0, 0.15, 0.29, false);
  });
  const fire = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.9, fog: false });
  const flames = [];
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), fire); f.position.set(-5.4 + i * 0.2, 0.42, 6.3); R.group.add(f); flames.push(f); }
  R.anims.push((dt, t) => {
    flames.forEach((f, i) => { f.visible = R.state.fire; f.scale.y = 0.7 + 0.45 * Math.abs(Math.sin(t * 7 + i * 1.7)); });
    fire.color.setHSL(0.07 + 0.02 * Math.sin(t * 9), 1, 0.55);
  });
  // Kronleuchter
  const H = R.H;
  R.cyl(0.01, 0.01, 0.6, gold, 0, H - 0.6, 0, 6);
  R.cyl(0.7, 0.5, 0.08, gold, 0, H - 0.9, 0, 24);
  const crystal = R.lampMat('#fff6dc', 1.6);
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; R.cyl(0.03, 0.06, 0.22, crystal, Math.cos(a) * 0.62, H - 1.12, Math.sin(a) * 0.62, 6); }
  R.cyl(0.18, 0.08, 0.3, crystal, 0, H - 1.25, 0, 12);
  // Kunst und Pflanzen
  R.painting('s', 4.6, 2.0, 2.0, 1.3, 7); R.painting('w', -1.5, 2.0, 1.6, 1.1, 4); R.painting('s', -8.0, 2.0, 1.0, 1.3, 8);
  R.piece(-1.2, -5.6, 0, 0.6, 0.6, g => {
    R.pbox(g, 0.5, 1.0, 0.5, R.mat('#f4f1ec'), 0, 0, 0);
    const s = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.06, 64, 8), gold); s.position.y = 1.35; s.castShadow = true; g.add(s);
    R.anims.push(dt => { s.rotation.y += dt * 0.4; });
  });
  R.plant(9.0, 6.3, 1.5, '#c9a65a'); R.plant(-9.0, -6.3, 1.4, '#c9a65a'); R.plant(2.2, -6.3, 1.3, '#c9a65a');
  R.lightSwitch(1.4, R.D / 2 - 0.11, Math.PI);
  R.spot(6.25, -4.9, 1.2, () => 'Schlafen', 'sleep');
  R.spot(5.6, 0.6, 1.3, s => s.tv ? 'Kino ausschalten' : 'Kino einschalten', 'tv');
  R.spot(-6.6, -2.3, 1.2, () => 'Im Whirlpool entspannen', 'spa');
  R.spot(-7.0, 2.6, 1.0, () => 'Drink an der Bar', 'snack');
  R.spot(-3.0, 0.75, 0.8, () => 'Klavier spielen', 'piano');
  R.spot(-5.0, 5.7, 1.0, s => s.fire ? 'Kamin löschen' : 'Kamin anzünden', 'fire');
  R.spot(8.4, 2.0, 0.9, s => s.music ? 'Musik aus' : 'Musik an', 'music');
  R.spot(1.4, 6.35, 0.7, s => s.light ? 'Licht aus' : 'Licht an', 'light');
  return R;
}

const INTERIOR_BUILDERS = { small: buildSmallRoom, modern: buildModernRoom, luxury: buildLuxuryRoom };
