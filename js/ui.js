// Oberfläche: Minikarte, Stadtplan mit Schnellreise, Anzeigen, Hinweise, Ortsschilder in der Welt.
'use strict';

// Farben der Orte auf Minikarte und Stadtplan
const PLACE_COLOR = { spray: '#38d97a', dealer: '#ff9a2e', shop: '#2ed3c6', flat: '#b57cff', home: '#e9b949', mycar: '#ffe066' };

class UI {
  constructor(world) {
    this.world = world;
    this.$ = id => document.getElementById(id);
    this.mini = this.$('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.big = this.$('bigmap');
    this.bigCtx = this.big.getContext('2d');
    this.mapOpen = false;
    this.view = null;     // Ausschnitt des großen Plans {cx, cz, scale}
    this.toastTimer = 0;
    this.landmarks = this.findLandmarks();
  }

  findLandmarks() {
    const P = this.world.data.pois;
    const find = re => P.find(p => re.test(p.n));
    const station = this.world.data.buildings.filter(b => b.t === 'train_station')
      .sort((a, b) => Math.abs(U.polyArea(b.p)) - Math.abs(U.polyArea(a.p)))[0];
    const centroid = p => { let x = 0, z = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; } return { x: x / (p.length / 2), z: z / (p.length / 2) }; };
    const list = [
      ['Marktplatz', { x: 0, z: 0 }],
      ['Rathaus', find(/^Rathaus$/)],
      ['Stadtkirche St. Moriz', find(/Sankt Moriz|St\.? Moriz|Morizkirche/)],
      ['Schloss Ehrenburg', find(/Ehrenburg/)],
      ['Landestheater', find(/Landestheater/)],
      ['Hofgarten', find(/^Hofgarten$/)],
      ['Veste Coburg', find(/Kunstsammlungen der Veste/) || find(/Veste Coburg/)],
      ['Albertsplatz', find(/Albertsplatz/)],
      ['Kongresshaus Rosengarten', find(/Kongresshaus Rosengarten/)],
      ['Bahnhof', station && centroid(station.p)],
      ['Bismarckturm', find(/Bismarckturm/)],
      ['Hexenturm', find(/Hexenturm/)],
    ];
    return list.filter(l => l[1]).map(([name, p]) => ({ name, x: p.x, z: p.z }));
  }

  // Schwebende Ortsschilder über den Sehenswürdigkeiten
  addLabels(scene) {
    this.labels = [];
    for (const l of this.landmarks) {
      const cv = document.createElement('canvas');
      const ctx = cv.getContext('2d');
      ctx.font = '600 44px Segoe UI, sans-serif';
      const w = Math.ceil(ctx.measureText(l.name).width) + 48;
      cv.width = w; cv.height = 76;
      ctx.font = '600 44px Segoe UI, sans-serif';
      ctx.fillStyle = 'rgba(18,22,30,0.78)';
      const r = 18;
      ctx.beginPath(); ctx.roundRect(0, 0, w, 76, r); ctx.fill();
      ctx.fillStyle = '#e9b949'; ctx.fillRect(18, 62, w - 36, 4);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(l.name, 24, 36);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
      const b = this.world.insideBuilding(l.x, l.z, 0);
      const ground = this.world.heightAt(l.x, l.z);
      sp.position.set(l.x, Math.max(b ? b.top + 6 : ground + 14, ground + 14), l.z);
      sp.scale.set(w / 76 * 4, 4, 1);
      sp.userData.base = sp.scale.clone();
      scene.add(sp);
      this.labels.push(sp);
    }
  }

  // weitere Schilder (Rennen, Läden) mit derselben Größenanpassung
  addLabel(sp, scene) {
    sp.userData.base = sp.scale.clone();
    scene.add(sp);
    (this.labels || (this.labels = [])).push(sp);
  }

  removeLabel(sp) {
    const i = this.labels.indexOf(sp);
    if (i >= 0) this.labels.splice(i, 1);
    sp.parent && sp.parent.remove(sp);
  }

  updateLabels(cam) {
    if (!this.labels) return;
    for (const sp of this.labels) {
      const d = cam.position.distanceTo(sp.position);
      sp.visible = !sp.userData.hidden && d < (sp.userData.range || 900) && d > 12;
      const f = U.clamp(d / 120, 0.6, 4);
      sp.scale.copy(sp.userData.base).multiplyScalar(f);
    }
  }

  setLocation(street, mode) {
    if (street !== this._street) { this.$('loc-street').textContent = street; this._street = street; }
    if (mode !== this._mode) { this.$('loc-mode').textContent = mode; this._mode = mode; }
  }

  setSpeed(kmh, gear, visible) {
    this.$('speedo').classList.toggle('hidden', !visible);
    if (!visible) return;
    const v = Math.round(kmh);
    if (v !== this._v) { this.$('speed-val').textContent = v; this._v = v; }
    if (gear !== this._g) { this.$('gear').textContent = gear; this._g = gear; }
  }

  setPrompt(text) {
    const el = this.$('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el.innerHTML !== text) el.innerHTML = text;
  }

  toast(text, secs = 2.5) {
    const el = this.$('toast');
    el.textContent = text; el.classList.remove('hidden');
    this.toastTimer = secs;
  }

  tick(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.$('toast').classList.add('hidden');
    }
    if (this.bigTimer > 0) {
      this.bigTimer -= dt;
      if (this.bigTimer <= 0) this.$('bigmsg').classList.add('hidden');
    }
  }

  // ---------- Minikarte ----------
  drawMinimap(px, pz, heading, camYaw, cars, speed, extra = {}) {
    const ctx = this.miniCtx, W = this.mini.width, H = this.mini.height;
    const w = this.world, S = w.mapScale, B = w.bounds;
    const metersAcross = 300 + Math.min(Math.abs(speed), 40) * 9;
    const k = W / metersAcross; // Pixel pro Meter auf der Minikarte
    const rot = camYaw - Math.PI;
    ctx.save();
    ctx.fillStyle = '#d9d3c5'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rot);
    ctx.scale(k, k);
    ctx.translate(-px, -pz);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(w.mapCanvas, B.minX, B.minZ, w.mapCanvas.width / S, w.mapCanvas.height / S);
    // Rennstrecke
    const race = extra.race;
    if (race) {
      ctx.strokeStyle = 'rgba(255,196,0,0.85)'; ctx.lineWidth = 5 / k; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < race.path.length; i += 2) i ? ctx.lineTo(race.path[i], race.path[i + 1]) : ctx.moveTo(race.path[0], race.path[1]);
      ctx.stroke();
    }
    // andere Autos
    ctx.fillStyle = '#3b6fd1';
    for (const c of cars) if (c.kind !== 'police') { ctx.beginPath(); ctx.arc(c.x, c.z, 3.2 / k * 0.9, 0, 6.283); ctx.fill(); }
    ctx.restore();

    // Markierungen in Bildschirmkoordinaten, ferne am Rand festgehalten
    const cr = Math.cos(rot), sr = Math.sin(rot), R = W / 2 - 9;
    const blip = (x, z, color, size, clamp, shape) => {
      const dx = (x - px) * k, dz = (z - pz) * k;
      let sx = dx * cr - dz * sr, sy = dx * sr + dz * cr;
      const d = Math.hypot(sx, sy);
      if (d > R) { if (!clamp) return; sx *= R / d; sy *= R / d; }
      ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (shape === 'sq') ctx.rect(W / 2 + sx - size, H / 2 + sy - size, size * 2, size * 2);
      else ctx.arc(W / 2 + sx, H / 2 + sy, size, 0, 6.283);
      ctx.fill(); ctx.stroke();
    };
    for (const c of cars) if (c.kind === 'police') blip(c.x, c.z, '#2a5bd7', 3.5, false);
    for (const p of extra.places || []) blip(p.x, p.z, PLACE_COLOR[p.type] || '#fff', p.type === 'flat' ? 3.5 : 5, p.type !== 'flat', p.type === 'mycar' ? 'dot' : 'sq');
    if (!race) for (const r of extra.raceStarts || []) blip(r.x, r.z, '#3aa0ff', 5, true, 'sq');
    if (race) {
      for (const c of race.rivals) blip(c.x, c.z, '#ffffff', 4, false);
      if (race.cp) blip(race.cp.x, race.cp.z, '#ffd23a', 6.5, true);
    }
    const blink = Math.floor(performance.now() / 250) % 2;
    for (const c of extra.police || []) blip(c.x, c.z, blink ? '#ff3030' : '#2a6bff', 5, !!extra.wanted);
    for (const o of extra.officers || []) blip(o.x, o.z, '#2a6bff', 3, false);

    // Spieler-Pfeil
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rot - heading + Math.PI);
    ctx.fillStyle = '#e9b949'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    this.$('compass').style.transform = `rotate(${rot}rad)`;
    this.$('minimap-wrap').classList.toggle('alarm', !!extra.wanted);
  }

  // ---------- Spielstand-Anzeigen ----------
  setMoney(m) {
    if (m === this._money) return;
    this._money = m;
    this.$('money').textContent = '€ ' + Math.round(m).toLocaleString('de-DE');
  }

  setWanted(stars, flashing) {
    const key = stars + (flashing ? 'f' : '');
    if (key === this._wanted) return;
    this._wanted = key;
    const el = this.$('stars');
    el.innerHTML = [1, 2, 3, 4, 5].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
    el.classList.toggle('flash', !!flashing && stars > 0);
  }

  setBars(hp, carHp) {
    this.$('hp-bar').style.width = U.clamp(hp, 0, 100) + '%';
    this.$('hp-bar').classList.toggle('low', hp < 30);
    this.$('car-row').classList.toggle('hidden', carHp === null);
    if (carHp !== null) {
      this.$('car-bar').style.width = U.clamp(carHp, 0, 100) + '%';
      this.$('car-bar').classList.toggle('low', carHp < 30);
    }
  }

  setBust(f) {
    this.$('bust').classList.toggle('hidden', f <= 0.01);
    this.$('bust-bar').style.width = Math.round(f * 100) + '%';
  }

  // Große Meldung in der Bildmitte
  bigMessage(text, secs = 2, color = '#fff', sub = '') {
    const el = this.$('bigmsg');
    el.innerHTML = `<div class="bm-main" style="color:${color}">${text}</div>${sub ? `<div class="bm-sub">${sub}</div>` : ''}`;
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.bigTimer = secs;
  }

  // ---------- Großer Stadtplan ----------
  openMap(px, pz, onTravel, extra = {}) {
    this.mapOpen = true;
    this.mapExtra = extra;
    this.onTravel = onTravel;
    this.$('map-overlay').classList.remove('hidden');
    const wrap = this.$('map-canvas-wrap');
    this.big.width = wrap.clientWidth * devicePixelRatio;
    this.big.height = wrap.clientHeight * devicePixelRatio;
    const B = this.world.bounds;
    if (!this.view) {
      const fit = Math.min(this.big.width / (B.maxX - B.minX), this.big.height / (B.maxZ - B.minZ));
      this.view = { cx: (B.minX + B.maxX) / 2, cz: (B.minZ + B.maxZ) / 2, scale: fit, min: fit * 0.9 };
    }
    this.player = { x: px, z: pz };
    if (!this._mapBound) this.bindMap();
    const ul = this.$('landmarks');
    ul.innerHTML = '';
    const ex = this.mapExtra;
    this.$('map-tip').textContent = ex.locked ? ex.locked : 'Klick auf die Karte = dorthin reisen';
    const entries = this.landmarks.map(l => ({ ...l, cls: '' }))
      .concat((ex.raceStarts || []).map(r => ({ name: 'Rennen: ' + r.name, x: r.x, z: r.z, cls: 'race' })))
      .concat((ex.places || []).map(p => ({ name: p.name, x: p.x, z: p.z, cls: p.type })));
    for (const l of entries) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = l.name;
      btn.className = l.cls;
      btn.disabled = !!ex.locked;
      btn.onclick = () => this.onTravel(l.x, l.z, l.name);
      li.appendChild(btn); ul.appendChild(li);
    }
    this.drawBigMap();
  }

  closeMap() {
    this.mapOpen = false;
    this.$('map-overlay').classList.add('hidden');
  }

  bindMap() {
    this._mapBound = true;
    let drag = null;
    const toWorld = (e) => {
      const r = this.big.getBoundingClientRect();
      const sx = (e.clientX - r.left) * devicePixelRatio, sy = (e.clientY - r.top) * devicePixelRatio;
      const v = this.view;
      return { x: v.cx + (sx - this.big.width / 2) / v.scale, z: v.cz + (sy - this.big.height / 2) / v.scale };
    };
    this.big.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz, moved: false }; });
    window.addEventListener('mousemove', e => {
      if (!drag || !this.mapOpen) return;
      const dx = (e.clientX - drag.x) * devicePixelRatio, dy = (e.clientY - drag.y) * devicePixelRatio;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      this.view.cx = drag.cx - dx / this.view.scale; this.view.cz = drag.cz - dy / this.view.scale;
      this.drawBigMap();
    });
    window.addEventListener('mouseup', e => {
      if (!drag || !this.mapOpen) { drag = null; return; }
      if (!drag.moved && e.target === this.big && !this.mapExtra.locked) { const p = toWorld(e); this.onTravel(p.x, p.z, null); }
      drag = null;
    });
    // Touch: ein Finger verschiebt/tippt = reisen, zwei Finger zoomen
    const tp = new Map();
    let pinch = 0, tdrag = null;
    this.big.style.touchAction = 'none';
    this.big.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      tp.set(e.pointerId, e);
      if (tp.size === 1) tdrag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz, moved: false };
      else { tdrag = null; const [a, b] = [...tp.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    });
    this.big.addEventListener('pointermove', e => {
      if (!tp.has(e.pointerId)) return;
      tp.set(e.pointerId, e);
      if (tp.size >= 2) {
        const [a, b] = [...tp.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch) { this.view.scale = U.clamp(this.view.scale * d / pinch, this.view.min, 4); this.drawBigMap(); }
        pinch = d;
      } else if (tdrag) {
        const dx = (e.clientX - tdrag.x) * devicePixelRatio, dy = (e.clientY - tdrag.y) * devicePixelRatio;
        if (Math.abs(dx) + Math.abs(dy) > 10) tdrag.moved = true;
        if (tdrag.moved) { this.view.cx = tdrag.cx - dx / this.view.scale; this.view.cz = tdrag.cz - dy / this.view.scale; this.drawBigMap(); }
      }
    });
    const tend = e => {
      if (!tp.has(e.pointerId)) return;
      tp.delete(e.pointerId);
      if (e.type === 'pointerup' && tdrag && !tdrag.moved && tp.size === 0 && !this.mapExtra.locked) {
        const p = toWorld(e); this.onTravel(p.x, p.z, null);
      }
      if (tp.size === 0) tdrag = null;
      pinch = 0;
    };
    this.big.addEventListener('pointerup', tend); this.big.addEventListener('pointercancel', tend);
    this.big.addEventListener('wheel', e => {
      e.preventDefault();
      const before = toWorld(e);
      this.view.scale = U.clamp(this.view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), this.view.min, 4);
      const after = toWorld(e);
      this.view.cx += before.x - after.x; this.view.cz += before.z - after.z;
      this.drawBigMap();
    }, { passive: false });
    this.$('map-close').onclick = () => this.closeMap();
  }

  drawBigMap() {
    const ctx = this.bigCtx, W = this.big.width, H = this.big.height, v = this.view;
    const w = this.world, S = w.mapScale, B = w.bounds;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2c3528'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(v.scale, 0, 0, v.scale, W / 2 - v.cx * v.scale, H / 2 - v.cz * v.scale);
    ctx.drawImage(w.mapCanvas, B.minX, B.minZ, w.mapCanvas.width / S, w.mapCanvas.height / S);
    const px = 1 / v.scale;
    ctx.font = `600 ${13 * devicePixelRatio * px}px Segoe UI, sans-serif`;
    for (const l of this.landmarks) {
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(l.x, l.z, 5 * devicePixelRatio * px, 0, 6.283); ctx.fill();
      ctx.lineWidth = 3 * devicePixelRatio * px; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(l.name, l.x + 8 * devicePixelRatio * px, l.z + 4 * devicePixelRatio * px);
      ctx.fillStyle = '#222'; ctx.fillText(l.name, l.x + 8 * devicePixelRatio * px, l.z + 4 * devicePixelRatio * px);
    }
    const ex = this.mapExtra || {};
    const icon = (x, z, color, label) => {
      const r = 7 * devicePixelRatio * px;
      ctx.fillStyle = color; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 * devicePixelRatio * px;
      ctx.fillRect(x - r, z - r, r * 2, r * 2); ctx.strokeRect(x - r, z - r, r * 2, r * 2);
      ctx.lineWidth = 3 * devicePixelRatio * px; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(label, x + 10 * devicePixelRatio * px, z + 4 * devicePixelRatio * px);
      ctx.fillStyle = '#222'; ctx.fillText(label, x + 10 * devicePixelRatio * px, z + 4 * devicePixelRatio * px);
    };
    for (const r of ex.raceStarts || []) icon(r.x, r.z, '#3aa0ff', 'Rennen: ' + r.name);
    for (const p of ex.places || []) icon(p.x, p.z, PLACE_COLOR[p.type] || '#fff', p.name);
    ctx.fillStyle = '#e9b949'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * devicePixelRatio * px;
    ctx.beginPath(); ctx.arc(this.player.x, this.player.z, 8 * devicePixelRatio * px, 0, 6.283); ctx.fill(); ctx.stroke();
  }
}
