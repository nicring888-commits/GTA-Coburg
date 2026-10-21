// Besitz: kaufbare Wohnungen mit Haustür an echten Coburger Häusern und eigenem Innenraum, Autohäuser für
// Neuwagen und die Garage mit den eigenen Autos. Wohnungen und Autos stehen im Spielstand (localStorage).
'use strict';

// Wohnungen: Lage ungefähr an der genannten Straße; die Tür sucht sich die nächste passende Fassade
const HOMES = [
  { id: 'lossau', name: 'Apartment Lossaustraße', street: 'Lossaustraße', type: 'small', price: 2500, x: -420, z: -333 },
  { id: 'juden', name: 'Altbauwohnung Judengasse', street: 'Judengasse', type: 'small', price: 4500, x: -351, z: -99 },
  { id: 'mohren', name: 'Stadtwohnung Mohrenstraße', street: 'Mohrenstraße', type: 'modern', price: 9500, x: -69, z: -246 },
  { id: 'steinweg', name: 'Loft am Steinweg', street: 'Steinweg', type: 'modern', price: 12000, x: 136, z: -474 },
  { id: 'ketschen', name: 'Wohnung Ketschengasse', street: 'Ketschengasse', type: 'modern', price: 14000, x: -35, z: 251 },
  { id: 'glocken', name: 'Penthouse am Glockenberg', street: 'Glockenberg', type: 'luxury', price: 38000, x: 254, z: 170 },
  { id: 'leopold', name: 'Villa Leopoldstraße', street: 'Leopoldstraße', type: 'luxury', price: 55000, x: 499, z: 103 },
];
const CAR_SHOPS = [
  { name: 'Autohaus am Bahnhof', x: -340, z: -503 },
  { name: 'Autohaus Coburg Süd', x: -289, z: 740 },
];
// Neuwagen: dieselben Modelle und Fahrwerte wie im Verkehr
const SHOP_MODELS = [
  { kind: 'car', title: 'Pkw', tag: 'Solide Limousine für jeden Tag', price: 1800, colors: CAR_COLORS },
  { kind: 'taxi', title: 'Taxi', tag: 'Robust, mit Dachschild', price: 2400, colors: ['#efe6c4'] },
  { kind: 'sport', title: 'Sportwagen', tag: 'Spoiler, 216 km/h, zieht wie verrückt', price: 9500, colors: SPORT_COLORS },
];
const GARAGE_SLOTS = 8;
const PROP_COLOR = { flat: '#b57cff', home: '#e9b949', shop: '#2ed3c6' };

const euro = n => '€ ' + (Math.abs(n - Math.round(n)) > 0.004 ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString('de-DE'));

// Seitenansicht eines Autos als SVG (für Autohaus und Garage)
function carSVG(kind, color) {
  const body = kind === 'sport'
    ? 'M8 57 L12 45 Q16 39 30 38 L62 36 L86 25 Q93 22 104 22 L128 22 Q137 22 143 27 L160 36 L184 39 Q195 41 195 49 L195 57 Z'
    : 'M8 57 L12 42 Q16 35 30 34 L56 32 L76 17 Q83 12 94 12 L134 12 Q142 12 148 18 L162 32 L184 35 Q195 37 195 47 L195 57 Z';
  const win = kind === 'sport'
    ? '<path d="M90 28 Q95 26 104 26 L114 26 L114 36 L70 36 Z M120 26 L128 26 Q134 26 139 30 L148 36 L120 36 Z" fill="#1e2730"/>'
    : '<path d="M84 18 Q89 16 96 16 L112 16 L112 31 L64 31 Z M118 16 L132 16 Q139 16 143 21 L152 31 L118 31 Z" fill="#1e2730"/>';
  const extra = kind === 'sport' ? '<rect x="172" y="30" width="22" height="4" rx="1" fill="' + color + '" stroke="#0005"/><rect x="182" y="33" width="3" height="6" fill="#222"/>'
    : kind === 'taxi' ? '<rect x="104" y="4" width="26" height="8" rx="2" fill="#f6d23a" stroke="#0006"/><text x="117" y="10.5" font-size="6" font-weight="800" text-anchor="middle" fill="#111">TAXI</text>' : '';
  const wheel = x => `<circle cx="${x}" cy="57" r="12" fill="#151515"/><circle cx="${x}" cy="57" r="6" fill="#b8bcc0"/>`;
  return `<svg viewBox="0 0 204 76" class="car-svg"><ellipse cx="102" cy="69" rx="92" ry="5" fill="#0006"/>
    <path d="${body}" fill="${color}" stroke="#0007" stroke-width="1.5"/>${win}${extra}
    <rect x="186" y="42" width="8" height="4" fill="#fff6dd"/><rect x="8" y="44" width="6" height="4" fill="#c0392b"/>${wheel(50)}${wheel(156)}</svg>`;
}

class Property {
  // ctx: { world, scene, ui, save, persist, audio, addMoney, parkCarNear, parked, hemi, sun, cam,
  //        player(), car(), mode(), stars(), night(), setIndoor(room), sleep(), lockPointer() }
  constructor(ctx) {
    Object.assign(this, ctx);
    const s = this.save;
    s.homes = Array.isArray(s.homes) ? s.homes.filter(id => HOMES.some(h => h.id === id)) : [];
    s.garage = Array.isArray(s.garage) ? s.garage.filter(c => c && VEHICLE_KINDS[c.kind] && c.kind !== 'police') : [];
    s.carSeq = s.carSeq || s.garage.length + 1;
    this.homes = [];
    this.venues = [];           // Läden und Lokale zum Hineingehen (venues.js)
    this.shops = [];
    this.rooms = {};
    this.out = new Map();       // eigene Autos, die gerade in der Stadt stehen: id → Vehicle
    this.inside = null;         // { home, room, viewing }
    this.menu = null;
    this.shopPick = {};         // gewählte Farbe je Modell
    this.indoorRoot = new THREE.Group();
    this.indoorRoot.visible = false;
    this.scene.add(this.indoorRoot);
    this.syncT = 0;
    this.musicT = 0; this.musicI = 0;
    for (const h of HOMES) this.placeHome(h);
    for (const p of CAR_SHOPS) this.placeShop(p);
    if (typeof VENUES !== 'undefined') for (const v of VENUES) this.placeVenue(v);
    this.bindMenu();
  }

  owns(id) { return this.save.homes.includes(id); }

  // ---------- Haustüren an echten Fassaden ----------
  placeHome(def) {
    const W = this.world;
    const r = W.nearestRoad(def.x, def.z, 80, s => s.n === def.street) || W.nearestRoad(def.x, def.z, 80, s => s.k === 'road');
    if (!r) return;
    const s = r.seg;
    let dx = s.bx - s.ax, dz = s.bz - s.az;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let best = null;
    for (const along of [0, 5, -5, 10, -10, 15, -15]) for (const side of [1, -1]) {
      const px = r.x + dx * along, pz = r.z + dz * along, nx = -dz * side, nz = dx * side;
      for (let t = 1; t < 18; t += 0.5) {
        const x = px + nx * t, z = pz + nz * t;
        const b = W.insideBuilding(x, z, 0);
        if (!b) continue;
        const f = this.facade(b, x, z);
        if (f && f.len >= 2.4) {
          const sx = f.x + f.ox * 1.4, sz = f.z + f.oz * 1.4;
          if (!W.insideBuilding(sx, sz, 0.4)) {
            const score = t + Math.abs(along) * 0.4;
            if (!best || score < best.score) best = { ...f, sx, sz, score };
          }
        }
        break;
      }
    }
    if (!best) { // keine Fassade gefunden: Markierung am Straßenrand
      best = { x: r.x - dz * (s.w / 2 + 1), z: r.z + dx * (s.w / 2 + 1), ox: -dz, oz: dx };
      best.sx = best.x; best.sz = best.z; best.noDoor = true;
    }
    const h = { ...def, ...best, heading: Math.atan2(best.ox, best.oz) };
    h.y = W.heightAt(h.sx, h.sz);
    if (!h.noDoor) this.scene.add(this.doorMesh(h));
    h.beacon = makeBeacon(PROP_COLOR.flat, 0.75, 2.4);
    h.beacon.position.set(h.sx, h.y - 0.2, h.sz);
    this.scene.add(h.beacon);
    this.homes.push(h);
    this.refreshHome(h);
  }

  // nächste Kante des Grundrisses mit Normalen nach außen
  facade(b, x, z) {
    const p = b.p;
    let best = null, bd = 1e9;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const c = U.closestOnSeg(x, z, p[j], p[j + 1], p[i], p[i + 1]);
      const d = Math.hypot(c[0] - x, c[1] - z);
      if (d < bd) { bd = d; best = { ax: p[j], az: p[j + 1], bx: p[i], bz: p[i + 1] }; }
    }
    if (!best) return null;
    let ex = best.bx - best.ax, ez = best.bz - best.az;
    const len = Math.hypot(ex, ez) || 1; ex /= len; ez /= len;
    // Tür in die Mitte der Kante, höchstens 3 m vom Treffpunkt weg
    const c = U.closestOnSeg(x, z, best.ax, best.az, best.bx, best.bz);
    const tm = U.clamp(((best.ax + best.bx) / 2 - c[0]) * ex + ((best.az + best.bz) / 2 - c[1]) * ez, -3, 3);
    const cx = c[0] + ex * tm, cz = c[1] + ez * tm;
    let ox = -ez, oz = ex;
    if (U.pointInPoly(cx + ox * 0.5, cz + oz * 0.5, p)) { ox = -ox; oz = -oz; }
    return { x: cx, z: cz, ox, oz, len };
  }

  doorMesh(h) {
    const g = new THREE.Group(), mats = this._doorMats || (this._doorMats = {});
    const add = (w, ht, d, color, x, y, z, extra) => { // Materialien teilen sich alle Türen
      const mat = mats[color] || (mats[color] = new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {})));
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, ht, d), mat);
      m.position.set(x, y + ht / 2, z); m.castShadow = d > 0.1; m.receiveShadow = true; g.add(m); return m;
    };
    add(1.7, 2.75, 0.3, '#d8cfc0', 0, -0.2, 0);                   // Steinrahmen
    add(1.2, 2.3, 0.12, '#5a3520', 0, 0, 0.12);                    // Türblatt
    add(0.5, 0.9, 0.02, '#6f4428', -0.25, 1.15, 0.185); add(0.5, 0.9, 0.02, '#6f4428', 0.25, 1.15, 0.185);
    add(0.5, 0.75, 0.02, '#6f4428', -0.25, 0.2, 0.185); add(0.5, 0.75, 0.02, '#6f4428', 0.25, 0.2, 0.185);
    add(0.06, 0.2, 0.06, '#d8b65a', 0.45, 1.0, 0.2);               // Klinke
    add(2.0, 0.18, 0.75, '#bdb3a3', 0, -0.2, 0.35);                // Stufe
    add(0.32, 0.2, 0.06, '#1c3d5a', 0.62, 2.45, 0.2);              // Hausnummer
    add(0.22, 0.3, 0.2, '#ffe2a0', -1.05, 2.1, 0.2, { emissive: '#ffcf7a', emissiveIntensity: 0.3 });
    g.position.set(h.x + h.ox * 0.04, this.world.heightAt(h.sx, h.sz) - 0.02, h.z + h.oz * 0.04);
    g.rotation.y = h.heading;
    return g;
  }

  refreshHome(h) {
    const owned = this.owns(h.id);
    if (h.label) this.ui.removeLabel(h.label);
    const T = INTERIOR_TYPES[h.type];
    h.label = makeLabel(owned ? h.name : `${h.name}`, owned ? PROP_COLOR.home : PROP_COLOR.flat,
      owned ? 'Dein Zuhause · F betreten' : `${T.label} · ${T.size} m² · ${euro(h.price)}`);
    h.label.position.set(h.sx, h.y + 4.2, h.sz);
    h.label.userData.range = 280;
    this.ui.addLabel(h.label, this.scene);
    h.beacon.material.color.set(owned ? PROP_COLOR.home : PROP_COLOR.flat);
  }

  placeShop(p) {
    const r = this.world.nearestRoad(p.x, p.z, 250, s => s.k === 'road' && !/motorway|trunk/.test(s.h || ''));
    if (!r) return;
    const s = r.seg;
    let dx = s.bx - s.ax, dz = s.bz - s.az;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const off = Math.max(0, s.w / 2 - 1.5);
    let x = r.x - dz * off, z = r.z + dx * off;
    if (this.world.insideBuilding(x, z, 1)) { x = r.x; z = r.z; }
    const y = this.world.heightAt(x, z);
    const b = makeBeacon(PROP_COLOR.shop, 4.5, 14);
    b.position.set(x, y - 0.5, z);
    this.scene.add(b);
    const lab = makeLabel(p.name, PROP_COLOR.shop, 'Neuwagen kaufen · F');
    lab.position.set(x, y + 7, z);
    lab.userData.range = 600;
    this.ui.addLabel(lab, this.scene);
    this.shops.push({ ...p, x, z });
  }

  doorAt(x, z) {
    return this.homes.find(h => Math.hypot(h.sx - x, h.sz - z) < 1.9) || this.venues.find(v => Math.hypot(v.sx - x, v.sz - z) < 1.9) || null;
  }
  shopAt(x, z) { return this.shops.find(p => Math.hypot(p.x - x, p.z - z) < 5.5) || null; }

  // Hinweis draußen (zu Fuß oder im Auto)
  prompt(x, z, walking) {
    if (walking) {
      const h = this.doorAt(x, z);
      if (h && h.venue) return `<kbd>F</kbd> ${h.name} betreten`;
      if (h) return this.owns(h.id) ? `<kbd>F</kbd> Nach Hause: ${h.name}` : `<kbd>F</kbd> ${h.name} · ${euro(h.price)}`;
    }
    const s = this.shopAt(x, z);
    if (s) return `<kbd>F</kbd> ${s.name}: Neuwagen`;
    return null;
  }

  // Markierungen für Minikarte und Stadtplan
  mapPlaces() {
    const list = this.homes.map(h => this.owns(h.id)
      ? { type: 'home', name: 'Zuhause: ' + h.name, x: h.sx, z: h.sz }
      : { type: 'flat', name: `${h.name} (${euro(h.price)})`, x: h.sx, z: h.sz });
    for (const s of this.shops) list.push({ type: 'shop', name: s.name, x: s.x, z: s.z });
    for (const v of this.venues) list.push({ type: VENUE_FOOD.has(v.type) ? 'food' : 'store', name: v.name, x: v.sx, z: v.sz });
    for (const [id, c] of this.out) if (!c.disposed && c !== this.car()) list.push({ type: 'mycar', name: 'Dein ' + c.spec.name, x: c.x, z: c.z });
    return list;
  }

  // ---------- Menü (gemeinsam für Wohnung, Autohaus, Garage) ----------
  bindMenu() {
    this.menuEl = document.getElementById('menu');
    this.panel = document.getElementById('menu-panel');
    this.panel.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled || !this.menu) return;
      this.audio.beep(880, 0.05, 0, 'square', 0.04);
      this.menu.onAct(b.dataset.act, b.dataset);
    });
    this.menuEl.addEventListener('mousedown', e => { if (e.target === this.menuEl) this.closeMenu(); });
  }

  get menuOpen() { return !!this.menu; }

  openMenu(theme, render, onAct) {
    this.menu = { theme, render, onAct };
    this.panel.className = 'menu-panel ' + theme;
    this.menuEl.classList.remove('hidden');
    this.ui.setPrompt(null);
    this.renderMenu();
    document.exitPointerLock?.();
  }
  renderMenu() { if (this.menu) this.panel.innerHTML = this.menu.render(); }
  closeMenu(relock) {
    if (!this.menu) return;
    this.menu = null;
    this.menuEl.classList.add('hidden');
    if (relock) this.lockPointer();
  }

  moneyLine() { return `<div class="mn-wallet">Dein Geld: <b>${euro(this.save.money)}</b></div>`; }

  // Wohnung: ansehen, kaufen, betreten, Garage
  openHome(h) {
    if (h.venue) { this.enter(h, false); return; }
    const room = this.room(h.type);
    const T = INTERIOR_TYPES[h.type];
    this.openMenu('theme-home', () => {
      const owned = this.owns(h.id), money = this.save.money, short = h.price - money;
      const insideThis = this.inside && this.inside.home === h;
      const wanted = this.stars() > 0;
      const btns = [];
      if (owned) {
        if (!insideThis) btns.push(`<button class="mn-btn primary" data-act="enter" ${wanted ? 'disabled' : ''}>Betreten</button>`);
        if (!this.inside) btns.push(`<button class="mn-btn" data-act="garage">Garage öffnen</button>`);
      } else {
        btns.push(`<button class="mn-btn primary" data-act="buy" ${short > 0 ? 'disabled' : ''}>Kaufen für ${euro(h.price)}</button>`);
        if (!insideThis) btns.push(`<button class="mn-btn" data-act="view" ${wanted ? 'disabled' : ''}>Besichtigen</button>`);
      }
      btns.push(`<button class="mn-btn ghost" data-act="close">${insideThis ? 'Weiter umsehen' : 'Schließen'}</button>`);
      const note = wanted && !insideThis ? '<p class="mn-warn">Mit Fahndung lässt dich keiner rein. Erst die Polizei abhängen!</p>'
        : !owned && short > 0 ? `<p class="mn-warn">Dir fehlen noch ${euro(short)}. Gewinne Rennen oder verkaufe Autos beim Händler.</p>`
        : owned ? '<p class="mn-note">Gehört dir. Im Bett schlafen füllt das Leben auf, wechselt Tag und Nacht und speichert.</p>'
        : '<p class="mn-note">Besichtigen ist kostenlos. Nach dem Kauf kannst du hier schlafen und die Garage nutzen.</p>';
      return `<div class="mn-head"><span class="mn-badge t-${h.type}">${T.label}</span><h2>${h.name}</h2><button class="mn-x" data-act="close" aria-label="Schließen">✕</button></div>
        <div class="mn-sub">${h.street} · ${T.title} · ${T.size} m²${owned ? ' · <b class="ok">Dein Eigentum</b>' : ''}</div>
        <div class="mn-home">
          <div class="mn-plan">${this.planSVG(room)}</div>
          <div class="mn-info">
            <h3>Ausstattung</h3>
            <ul class="mn-feat">${T.features.map(f => `<li>${f}</li>`).join('')}</ul>
            <div class="mn-price">${owned ? '<span class="ok">Gekauft</span>' : euro(h.price)}</div>
            ${this.moneyLine()}
          </div>
        </div>
        ${note}
        <div class="mn-actions">${btns.join('')}</div>`;
    }, act => {
      if (act === 'close') this.closeMenu(true);
      else if (act === 'buy') this.buyHome(h);
      else if (act === 'view' || act === 'enter') { this.closeMenu(true); this.enter(h, act === 'view'); }
      else if (act === 'garage') this.openGarage();
    });
  }

  buyHome(h) {
    if (this.owns(h.id)) return;
    if (this.save.money < h.price) { this.ui.toast(`Zu wenig Geld (${euro(h.price)})`, 2); return; }
    this.addMoney(-h.price);
    this.save.homes.push(h.id);
    this.persist();
    this.audio.cash();
    this.refreshHome(h);
    if (this.inside && this.inside.home === h) { this.inside.viewing = false; this.updateBanner(); }
    this.closeMenu(true);
    this.ui.bigMessage('GEKAUFT', 2.6, PROP_COLOR.home, `${h.name} gehört jetzt dir`);
  }

  // Grundriss des Innenraums als kleine Zeichnung
  planSVG(room) {
    const s = 220 / Math.max(room.W, room.D * 1.25), w = room.W * s, d = room.D * s;
    const rect = b => `<rect x="${(b.minX + room.W / 2) * s}" y="${(b.minZ + room.D / 2) * s}" width="${(b.maxX - b.minX) * s}" height="${(b.maxZ - b.minZ) * s}" rx="1.5"/>`;
    const spots = room.spots.filter(p => p.act !== 'exit' && p.act !== 'light')
      .map(p => `<circle cx="${(p.x + room.W / 2) * s}" cy="${(p.z + room.D / 2) * s}" r="3.2"/>`).join('');
    return `<svg viewBox="-6 -6 ${w + 12} ${d + 18}" class="plan-svg">
      <rect x="0" y="0" width="${w}" height="${d}" class="pl-room"/>
      <g class="pl-furn">${room.boxes.map(rect).join('')}</g><g class="pl-spot">${spots}</g>
      <rect x="${(room.door.x + room.W / 2) * s - 9}" y="${d - 2}" width="18" height="5" class="pl-door"/>
      <text x="${w / 2}" y="${d + 12}" text-anchor="middle">${room.W} × ${room.D} m</text></svg>`;
  }

  // ---------- Autohaus ----------
  openShop(shop) {
    this.openMenu('theme-shop', () => {
      const n = this.save.garage.length, full = n >= GARAGE_SLOTS;
      const cards = SHOP_MODELS.map(m => {
        const spec = VEHICLE_KINDS[m.kind];
        const col = this.shopPick[m.kind] || m.colors[0];
        const short = m.price - this.save.money;
        const bar = (label, v) => `<div class="mn-stat"><span>${label}</span><i><b style="width:${Math.round(U.clamp(v, 0.05, 1) * 100)}%"></b></i></div>`;
        return `<div class="mn-car">
          <div class="mn-car-pic">${carSVG(m.kind, col)}</div>
          <div class="mn-car-name">${m.title}</div><div class="mn-car-tag">${m.tag}</div>
          ${bar('Tempo', spec.maxSpeed / 60)}${bar('Beschleunigung', spec.accel / 12.5)}${bar('Robustheit', spec.armor / 1.5)}
          <div class="mn-swatches">${m.colors.map(c => `<button class="sw${c === col ? ' on' : ''}" style="background:${c}" data-act="color" data-kind="${m.kind}" data-color="${c}" aria-label="Farbe"></button>`).join('')}</div>
          <div class="mn-car-price">${euro(m.price)} <small>${Math.round(spec.maxSpeed * 3.6)} km/h</small></div>
          <button class="mn-btn primary" data-act="buy" data-kind="${m.kind}" ${short > 0 || full ? 'disabled' : ''}>${short > 0 ? 'Fehlen ' + euro(short) : 'Kaufen'}</button>
        </div>`;
      }).join('');
      return `<div class="mn-head"><span class="mn-badge t-shop">Neuwagen</span><h2>${shop.name}</h2><button class="mn-x" data-act="close" aria-label="Schließen">✕</button></div>
        <div class="mn-sub">Gekaufte Autos gehören dir für immer und warten in deiner Garage (<kbd>G</kbd>). Garage: ${n}/${GARAGE_SLOTS} Plätze</div>
        <div class="mn-cars">${cards}</div>
        <div class="mn-foot">${this.moneyLine()}<button class="mn-btn ghost" data-act="garage">Meine Garage</button><button class="mn-btn ghost" data-act="close">Schließen</button></div>`;
    }, (act, d) => {
      if (act === 'close') this.closeMenu(true);
      else if (act === 'color') { this.shopPick[d.kind] = d.color; this.renderMenu(); }
      else if (act === 'garage') this.openGarage();
      else if (act === 'buy') this.buyCar(shop, d.kind);
    });
  }

  buyCar(shop, kind) {
    const m = SHOP_MODELS.find(x => x.kind === kind);
    if (!m) return;
    if (this.save.garage.length >= GARAGE_SLOTS) { this.ui.toast('Garage voll', 2); return; }
    if (this.save.money < m.price) { this.ui.toast(`Zu wenig Geld (${euro(m.price)})`, 2); return; }
    this.addMoney(-m.price);
    const rec = { id: 'c' + (this.save.carSeq++), kind, color: this.shopPick[kind] || m.colors[0], health: 100, bought: m.price };
    this.save.garage.push(rec);
    this.persist();
    this.closeMenu(true);
    const c = this.mode() === 'walk' ? this.deliver(rec, shop.x, shop.z) : null;
    this.ui.bigMessage('NEUWAGEN', 2.6, PROP_COLOR.shop, c ? `Dein ${m.title} steht vor dem Autohaus` : `Dein ${m.title} wartet in der Garage (G)`);
  }

  // ---------- Garage ----------
  rec(id) { return this.save.garage.find(c => c.id === id); }
  repairCost(rec) { const m = SHOP_MODELS.find(x => x.kind === rec.kind); return Math.round((m ? m.price : 2000) * 0.2 / 10) * 10; }

  openGarage() {
    this.openMenu('theme-garage', () => {
      const cur = this.car();
      const blocked = this.inside ? 'Erst die Wohnung verlassen.' : this.mode() !== 'walk' ? 'Steig zuerst aus, dann bringen wir dein Auto.'
        : this.stars() > 0 ? 'Während einer Fahndung liefert die Garage nicht.' : null;
      const rows = this.save.garage.map(rec => {
        const v = this.out.get(rec.id), spec = VEHICLE_KINDS[rec.kind];
        const driving = v && v === cur;
        const status = rec.destroyed ? '<span class="bad">Zerstört</span>' : driving ? '<span class="ok">Du fährst es</span>' : v ? 'In der Stadt' : 'In der Garage';
        let act = '';
        if (rec.destroyed) act = `<button class="mn-btn" data-act="fix" data-id="${rec.id}" ${this.save.money < this.repairCost(rec) ? 'disabled' : ''}>Reparieren ${euro(this.repairCost(rec))}</button>`;
        else if (!driving) act = `<button class="mn-btn primary" data-act="call" data-id="${rec.id}" ${blocked ? 'disabled' : ''}>${v ? 'Herholen' : 'Rausfahren'}</button>`;
        if (v && !driving && !rec.destroyed) act += `<button class="mn-btn ghost" data-act="stow" data-id="${rec.id}">Einparken</button>`;
        const hp = rec.destroyed ? 0 : Math.round(rec.health);
        return `<div class="mn-row">
          <div class="mn-row-pic">${carSVG(rec.kind, rec.destroyed ? '#3a3633' : rec.color)}</div>
          <div class="mn-row-info"><b>${spec.name}</b><span>${status}</span>
            <div class="mn-hp"><i style="width:${hp}%" class="${hp < 30 ? 'low' : ''}"></i></div></div>
          <div class="mn-row-act">${act}</div></div>`;
      }).join('');
      return `<div class="mn-head"><span class="mn-badge t-garage">Garage</span><h2>Meine Autos</h2><button class="mn-x" data-act="close" aria-label="Schließen">✕</button></div>
        <div class="mn-sub">Wähle ein Auto, es wird am nächsten Straßenrand abgestellt. Es steht immer nur eins draußen. ${this.save.garage.length}/${GARAGE_SLOTS} Plätze</div>
        ${blocked && this.save.garage.length ? `<p class="mn-warn">${blocked}</p>` : ''}
        <div class="mn-list">${rows || '<div class="mn-empty">Noch keine eigenen Autos.<br>Kauf eins im <b style="color:' + PROP_COLOR.shop + '">Autohaus</b> (türkis auf der Karte).</div>'}</div>
        <div class="mn-foot">${this.moneyLine()}<button class="mn-btn ghost" data-act="close">Schließen</button></div>`;
    }, (act, d) => {
      const rec = d.id && this.rec(d.id);
      if (act === 'close') this.closeMenu(true);
      else if (act === 'call' && rec) {
        const p = this.player();
        this.closeMenu(true);
        const c = this.deliver(rec, p.x, p.z);
        if (c) {
          const d = Math.hypot(c.x - p.x, c.z - p.z), r = this.world.nearestRoad(c.x, c.z, 30, s => !!s.n);
          this.ui.toast(d < 25 ? `Dein ${c.spec.name} steht bereit` : `Dein ${c.spec.name} steht ${Math.round(d)} m entfernt${r ? ' in der ' + r.seg.n : ''} (gelb auf der Karte)`, 3);
        }
      } else if (act === 'stow' && rec) { this.stow(rec); this.persist(); this.renderMenu(); }
      else if (act === 'fix' && rec) {
        const cost = this.repairCost(rec);
        if (this.save.money < cost) return;
        this.addMoney(-cost);
        rec.destroyed = false; rec.health = 100;
        this.persist(); this.renderMenu();
        this.ui.toast('Repariert', 1.5);
      }
    });
  }

  // eigenes Auto an den Straßenrand stellen (andere eigene Autos fahren zurück in die Garage)
  deliver(rec, x, z) {
    if (rec.destroyed) return null;
    for (const r of this.save.garage) if (this.out.has(r.id) && this.out.get(r.id) !== this.car()) this.stow(r);
    const c = this.parkCarNear(x, z, rec.color, rec.kind);
    if (!c) { this.ui.toast('Hier ist kein Platz zum Abstellen', 2); return null; }
    c.ownedId = rec.id;
    c.health = U.clamp(rec.health, 1, 100);
    c.paint.color.copy(c.baseColor).multiplyScalar(0.45 + 0.55 * c.health / 100);
    this.out.set(rec.id, c);
    this.persist();
    return c;
  }

  stow(rec) {
    const c = this.out.get(rec.id);
    this.out.delete(rec.id);
    if (!c || c.disposed || c === this.car()) return;
    rec.health = c.health; rec.color = c.color;
    const i = this.parked.indexOf(c);
    if (i >= 0) this.parked.splice(i, 1);
    c.dispose(this.scene);
  }

  // beim Händler verkauft: Auto gehört nicht mehr dir
  carSold(c) {
    if (!c.ownedId) return false;
    this.out.delete(c.ownedId);
    this.save.garage = this.save.garage.filter(r => r.id !== c.ownedId);
    this.persist();
    return true;
  }

  // Zustand der eigenen Autos in der Stadt mitschreiben
  update(dt) {
    this.syncT -= dt;
    let dirty = false;
    for (const [id, c] of this.out) {
      const rec = this.rec(id);
      if (!rec) { this.out.delete(id); continue; }
      if (c.wrecked) {
        rec.destroyed = true; rec.health = 0; this.out.delete(id); dirty = true;
        this.ui.toast(`Dein ${c.spec.name} ist zerstört. In der Garage (G) reparieren`, 3);
      } else if (c.disposed) { this.out.delete(id); dirty = true; }
      else if (Math.abs(rec.health - c.health) > 0.5 || rec.color !== c.color) { rec.health = Math.round(c.health * 10) / 10; rec.color = c.color; dirty = this.syncT <= 0; }
    }
    if (dirty) { this.syncT = 2; this.persist(); }
    if (this._doorMats) this._doorMats['#ffe2a0'].emissiveIntensity = this.night() ? 1.6 : 0.3;
  }

  // ---------- Innenräume ----------
  room(type) {
    if (!this.rooms[type]) {
      const r = INTERIOR_BUILDERS[type](Object.keys(INTERIOR_TYPES).indexOf(type));
      this.indoorRoot.add(r.group);
      this.rooms[type] = r;
    }
    return this.rooms[type];
  }

  enter(h, viewing) {
    if (this.stars() > 0) { this.ui.toast('Mit Fahndung lässt dich keiner rein!', 2); return; }
    const room = h.venue ? this.venueRoom(h) : this.room(h.type), p = this.player();
    if (h.venue || this.owns(h.id)) viewing = false;
    this.inside = { home: h, room, viewing };
    for (const r of Object.values(this.rooms)) r.group.visible = r === room;
    this.indoorRoot.visible = true;
    room.setNight(this.night());
    room.state.tv = false; room.state.music = false; room.setLight(true);
    this.setIndoor(room);
    p.place(room.ox + room.spawn.x, room.oz + room.spawn.z, room.walker);
    p.heading = room.spawn.heading;
    Object.assign(this.cam, { yaw: room.spawn.heading, pitch: 0.3, init: false });
    this.cam.dist = Math.min(this.cam.dist, 3.6);
    this.applyLight();
    this.flash();
    this.updateBanner();
    this.ui.toast(h.venue ? `Willkommen bei ${h.name}` : viewing ? `Besichtigung: ${h.name}` : `Willkommen zu Hause`, 2);
  }

  exit() {
    const io = this.inside;
    if (!io) return;
    io.room.group.visible = false;
    this.indoorRoot.visible = false;
    this.inside = null;
    this.setIndoor(null);
    const p = this.player(), h = io.home;
    p.place(h.sx + h.ox * 0.3, h.sz + h.oz * 0.3, this.world);
    p.heading = h.heading;
    Object.assign(this.cam, { yaw: h.heading, pitch: 0.28, init: false });
    this.flash();
    document.getElementById('indoor').classList.add('hidden');
    if (io.viewing) this.ui.toast(`${h.name}: ${euro(h.price)} · F zum Kaufen`, 2.5);
  }

  flash() {
    const el = document.getElementById('blackout');
    el.classList.remove('hidden', 'go'); void el.offsetWidth; el.classList.add('go');
  }

  updateBanner() {
    const io = this.inside, el = document.getElementById('indoor');
    if (!io) { el.classList.add('hidden'); return; }
    const T = INTERIOR_TYPES[io.home.type];
    el.classList.remove('hidden');
    if (io.home.venue) {
      el.className = 'own';
      el.innerHTML = `<span class="ib-tag">${T.label}</span><b>${io.home.name}</b><span>${io.home.street}</span><span class="ib-key"><kbd>F</kbd> ${VENUE_FOOD.has(io.home.type) ? 'Speisekarte' : 'Sortiment'}</span>`;
      return;
    }
    el.className = io.viewing ? 'view' : 'own';
    el.innerHTML = io.viewing
      ? `<span class="ib-tag">Besichtigung</span><b>${io.home.name}</b><span>${T.title} · ${T.size} m² · ${euro(io.home.price)}</span><span class="ib-key"><kbd>F</kbd> kaufen</span>`
      : `<span class="ib-tag">Zuhause</span><b>${io.home.name}</b><span>${T.title} · ${T.size} m²</span><span class="ib-key"><kbd>F</kbd> Infos</span>`;
  }

  // Licht im Raum über die vorhandenen Lichtquellen (Himmelslicht und Sonne)
  applyLight() {
    if (!this.inside) return;
    const on = this.inside.room.state.light, night = this.night();
    this.hemi.color.set(on ? '#fff3e2' : (night ? '#3a4a7a' : '#d8e4f5'));
    this.hemi.groundColor.set(on ? '#806c58' : '#2a2622');
    this.hemi.intensity = on ? 1.2 : (night ? 0.16 : 0.45);
    this.sun.color.set(on ? '#fff1dc' : '#cfe0ff');
    this.sun.intensity = on ? 1.05 : (night ? 0.05 : 0.35);
  }

  setNight(night) { if (this.inside) { this.inside.room.setNight(night); this.applyLight(); } }

  // ein Schritt drinnen: Benutzen mit E, Kaufen/Infos mit F; gibt den Hinweistext zurück
  indoorStep(dt, pressed) {
    const io = this.inside, room = io.room, p = this.player(), now = performance.now() / 1000;
    room.update(dt, now);
    if (room.state.music) this.music(dt);
    const sp = room.nearestSpot(p.x, p.z);
    if (pressed.KeyE && sp) { this.use(sp); if (!this.inside) return null; }
    if (pressed.KeyF) { if (io.home.venue) this.openVenueMenu(io.home); else this.openHome(io.home); return null; }
    return sp ? `<kbd>E</kbd> ${sp.label(room.state)}` : null;
  }

  use(sp) {
    const io = this.inside, room = io.room, st = room.state, p = this.player(), a = this.audio;
    const ownOnly = msg => { if (io.viewing) { this.ui.toast(msg || 'Erst kaufen, dann gehört das dir', 1.8); return true; } return false; };
    switch (sp.act) {
      case 'exit': this.exit(); break;
      case 'order': this.openVenueMenu(io.home); break;
      case 'sleep':
        if (ownOnly('Schlafen erst nach dem Kauf')) break;
        this.sleep();
        this.flash();
        this.ui.bigMessage('AUSGESCHLAFEN', 2.4, PROP_COLOR.home, 'Leben voll · Spiel gespeichert');
        break;
      case 'tv': st.tv = !st.tv; if (!st.tv) drawTV(room.screen, 0, false); a.beep(st.tv ? 660 : 330, 0.08, 0, 'sine', 0.06); break;
      case 'light': room.setLight(!st.light); this.applyLight(); a.beep(1400, 0.03, 0, 'square', 0.05); break;
      case 'music': st.music = !st.music; this.musicT = 0; break;
      case 'fire': st.fire = !st.fire; a.noise(0.5, 900, 0.15); break;
      case 'snack': case 'spa': {
        if (ownOnly()) break;
        if (p.health >= 100) { this.ui.toast(sp.act === 'spa' ? 'Du bist schon tiefenentspannt' : 'Du bist satt', 1.4); break; }
        p.health = Math.min(100, p.health + (sp.act === 'spa' ? 100 : 30));
        this.ui.toast(sp.act === 'spa' ? 'Herrlich entspannt · Leben voll' : 'Lecker! · Leben +30', 1.6);
        a.beep(520, 0.1, 0, 'triangle', 0.08); a.beep(780, 0.14, 0.1, 'triangle', 0.08);
        break;
      }
      case 'piano': // „Freude schöner Götterfunken“, erste Zeile
        [330, 330, 349, 392, 392, 349, 330, 294, 262, 262, 294, 330, 330, 294, 294].forEach((f, i) => a.beep(f, 0.32, i * 0.3, 'triangle', 0.09));
        break;
    }
  }

  // kleine Musikschleife (Akkordfolge C–a–F–G)
  music(dt) {
    this.musicT -= dt;
    if (this.musicT > 0) return;
    const prog = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
    const bar = Math.floor(this.musicI / 8) % 4, step = this.musicI % 8, ch = prog[bar];
    const f = ch[[0, 1, 2, 1, 0, 2, 1, 2][step]] * (step === 5 ? 2 : 1);
    this.audio.beep(f, 0.2, 0, 'triangle', 0.045);
    if (step % 4 === 0) this.audio.beep(ch[0] / 2, 0.45, 0, 'sine', 0.07);
    this.musicI++;
    this.musicT = 0.2;
  }
}
