// Effekte: Rauch, Feuer, Explosionen (Partikel als Sprites) und leuchtende Markierungen in der Welt
// (Rennstart, Checkpoints, Lackiererei, Autohändler).
'use strict';

const SKID = { max: 900, hw: 0.11 };

class FX {
  constructor(scene) {
    this.scene = scene;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this.tex = new THREE.CanvasTexture(cv);
    this.pool = [];
    this.live = [];
    this.flashLight = new THREE.PointLight('#ffb35c', 0, 60, 1.6);
    scene.add(this.flashLight);
    this.flashT = 0;
    // Bremsspuren: Ringpuffer aus Vierecken (die ältesten werden überschrieben)
    const N = SKID.max;
    this.skidPos = new Float32Array(N * 18);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.skidMesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: '#141414', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    this.skidMesh.frustumCulled = false; this.skidMesh.renderOrder = 1;
    scene.add(this.skidMesh);
    this.skidI = 0;
    this.skidLast = [null, null];
  }

  // Spur des Rads w (0/1) bis (x, y, z) weiterziehen; null beendet die Spur
  skid(w, x, y, z) {
    if (x === null) { this.skidLast[w] = null; return; }
    const L = this.skidLast[w];
    if (!L) { this.skidLast[w] = [x, y, z]; return; }
    const dx = x - L[0], dz = z - L[2], l = Math.hypot(dx, dz);
    if (l < 0.35) return;
    if (l > 6) { this.skidLast[w] = [x, y, z]; return; }
    const nx = -dz / l * SKID.hw, nz = dx / l * SKID.hw, P = this.skidPos, o = this.skidI * 18;
    const v = [L[0] + nx, L[1], L[2] + nz, L[0] - nx, L[1], L[2] - nz, x - nx, y, z - nz,
      L[0] + nx, L[1], L[2] + nz, x - nx, y, z - nz, x + nx, y, z + nz];
    for (let k = 0; k < 18; k++) P[o + k] = v[k];
    this.skidI = (this.skidI + 1) % SKID.max;
    const attr = this.skidMesh.geometry.attributes.position;
    attr.needsUpdate = true;
    this.skidLast[w] = [x, y, z];
  }

  particle(x, y, z, o) {
    let p = this.pool.pop();
    if (!p) {
      if (this.live.length > 220) return;
      const m = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false });
      p = { sprite: new THREE.Sprite(m) };
    }
    const m = p.sprite.material;
    m.color.set(o.color); m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sprite.position.set(x, y, z);
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = p.max = o.life; p.size = o.size; p.grow = o.grow || 0; p.alpha = o.alpha ?? 1;
    p.sprite.scale.setScalar(o.size);
    this.scene.add(p.sprite);
    this.live.push(p);
  }

  smoke(x, y, z, dark = 0.5) {
    const v = Math.round(200 - dark * 150);
    this.particle(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, {
      color: `rgb(${v},${v},${v})`, life: 1.8, size: 1.2, grow: 1.8, alpha: 0.55,
      vx: (Math.random() - 0.5) * 0.6, vy: 1.6 + Math.random(), vz: (Math.random() - 0.5) * 0.6,
    });
  }

  fire(x, y, z) {
    this.particle(x + (Math.random() - 0.5) * 1.2, y, z + (Math.random() - 0.5) * 1.2, {
      color: Math.random() < 0.5 ? '#ff7a1a' : '#ffc23a', add: true, life: 0.55, size: 1.4, grow: -1, alpha: 0.9,
      vy: 2.5 + Math.random() * 2,
    });
  }

  explosion(x, y, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.283, s = 4 + Math.random() * 9;
      this.particle(x, y + 1, z, { color: i % 3 ? '#ff8a24' : '#ffe08a', add: true, life: 0.7 + Math.random() * 0.4,
        size: 2.5, grow: 4, vx: Math.cos(a) * s, vy: 3 + Math.random() * 8, vz: Math.sin(a) * s });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283, s = 1 + Math.random() * 3;
      this.particle(x, y + 1.5, z, { color: '#3a3836', life: 2.5 + Math.random(), size: 3, grow: 3, alpha: 0.7,
        vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s });
    }
    this.flashLight.position.set(x, y + 3, z);
    this.flashT = 0.6;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.sprite); this.live.splice(i, 1); this.pool.push(p); continue; }
      const s = p.sprite;
      s.position.x += p.vx * dt; s.position.y += p.vy * dt; s.position.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
      const k = p.life / p.max;
      s.scale.setScalar(Math.max(0.1, p.size + p.grow * (1 - k) * p.size));
      s.material.opacity = p.alpha * Math.min(1, k * 2.2);
    }
    if (this.flashT > 0) { this.flashT -= dt; this.flashLight.intensity = Math.max(0, this.flashT) * 900; }
    else this.flashLight.intensity = 0;
  }
}

// Leuchtende, nach oben ausblendende Säule als Markierung
const _beaconTex = {};
function beaconTexture(checker) {
  const key = checker ? 'c' : 'p';
  if (_beaconTex[key]) return _beaconTex[key];
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d');
  if (checker) {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#222'; c.fillRect(i * 8, j * 8 + 96, 8, 8); }
    c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 96);
  } else { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 128); }
  // Alpha: unten kräftig, oben weg
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping;
  if (checker) t.repeat.set(6, 1);
  _beaconTex[key] = t;
  return t;
}

function makeBeacon(color, radius, height, checker = false) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 40, 1, true);
  geo.translate(0, height / 2, 0);
  // ohne Tonwertkurve, sonst überstrahlen die Säulen (gleiche Helligkeit wie vorher)
  const mat = new THREE.MeshBasicMaterial({ color, map: beaconTexture(checker), transparent: true, depthWrite: false, toneMapped: false,
    opacity: 0.8, side: THREE.DoubleSide, blending: checker ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

// Text-Schild als Sprite (für Markierungen)
function makeLabel(text, accent = '#e9b949', sub = '') {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = '700 44px Segoe UI, sans-serif';
  const w1 = ctx.measureText(text).width;
  ctx.font = '500 30px Segoe UI, sans-serif';
  const w2 = sub ? ctx.measureText(sub).width : 0;
  const w = Math.ceil(Math.max(w1, w2)) + 48, h = sub ? 112 : 76;
  cv.width = w; cv.height = h;
  ctx.fillStyle = 'rgba(14,16,22,0.82)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 18); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(18, h - 12, w - 36, 4);
  ctx.textBaseline = 'middle';
  ctx.font = '700 44px Segoe UI, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(text, 24, 38);
  if (sub) { ctx.font = '500 30px Segoe UI, sans-serif'; ctx.fillStyle = '#cfd3da'; ctx.fillText(sub, 24, 80); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(w / 76 * 2.6, h / 76 * 2.6, 1);
  return sp;
}
