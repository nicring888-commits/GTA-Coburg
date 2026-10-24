// Mehrspieler (Client): Lobby, Verbindung zum Server (mp/game-server.js), andere Spieler und ihre Autos.
// Die eigene Figur und das eigene Auto rechnet weiter das Spiel selbst (keine Eingabeverzögerung); der Zustand geht
// 20-mal pro Sekunde an den Server. Andere werden 110 ms in der Vergangenheit zwischen zwei Momentaufnahmen
// gleitend dargestellt (kurz darüber hinaus vorausberechnet). Autos, die jemand fährt, sind für alle dasselbe
// Netz-Auto mit einer Nummer (vid); wer am Steuer sitzt, rechnet es. Einsteigen, Mitfahren und Besitz entscheidet
// der Server.
'use strict';

const NET_NAME_KEY = 'gtc-mp-name', NET_SERVER_KEY = 'gtc-mp-server';

class NetClient {
  // G: Schnittstelle zum Spiel (js/game.js), siehe dort „Mehrspieler“
  constructor(G) {
    this.G = G;
    this.ws = null;
    this.online = false;
    this.id = 0;
    this.players = new Map();     // id → { id, name, color, look, fig, tag, buf, seen, map }
    this.vehicles = new Map();    // vid → Vehicle (eigene: c.net, fremde zusätzlich c.remote)
    this.remoteCars = [];         // sichtbare fremde Autos (für Kollision, Einsteigen, Minikarte)
    this.walkers = [];            // sichtbare andere Spieler zu Fuß
    this.pendingReg = new Map();  // ref → eigenes Auto, das gerade angemeldet wird
    this.refSeq = 1;
    this.offset = 0;              // Serverzeit − performance.now()
    this.rtt = 0;
    this.sendT = 0; this.pingT = 0; this.parkedT = 0;
    this.last = null;             // zuletzt gesendeter Zustand (in Ruhe seltener senden)
    this.ride = null;             // fremdes Auto, in dem man mitfährt
    this.waitEnter = null;
    this.chatLog = [];
    this.buildHud();
  }

  // ---------- Server-Adresse ----------
  static serverUrl() {
    const q = new URLSearchParams(location.search).get('server');
    let s = q || (() => { try { return localStorage.getItem(NET_SERVER_KEY); } catch (e) { return null; } })() || window.MP_SERVER || '';
    if (!s) {
      if (!/^https?:$/.test(location.protocol)) return '';
      s = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    }
    s = s.trim().replace(/\/+$/, '');
    if (/^https?:\/\//.test(s)) s = s.replace(/^http/, 'ws');
    if (!/^wss?:\/\//.test(s)) s = (location.protocol === 'https:' ? 'wss://' : 'ws://') + s;
    if (!s.endsWith(MP.PATH)) s += MP.PATH;
    return s;
  }
  static httpUrl(wsUrl, path) { return wsUrl.replace(/^ws/, 'http').replace(new RegExp(MP.PATH + '$'), path); }

  async listRooms(url) {
    const r = await fetch(NetClient.httpUrl(url, '/api/rooms'), { cache: 'no-store' });
    if (!r.ok) throw new Error('Server antwortet nicht');
    return r.json();
  }

  // ---------- Verbindung ----------
  // join: { name, code } | { name, create: { name, priv } } | { name } (schnell beitreten)
  connect(url, join) {
    this.url = url; this.joinReq = join; this.wantOnline = true;
    return new Promise((resolve, reject) => {
      let done = false, joined = false; // done: Versprechen erledigt, joined: in der Lobby angekommen
      const ws = new WebSocket(url);
      this.ws = ws;
      const fail = msg => { if (!done) { done = true; reject(new Error(msg)); try { ws.close(); } catch (e) { /* zu */ } } };
      const timer = setTimeout(() => fail('Zeitüberschreitung beim Verbinden'), 8000);
      ws.onopen = () => {
        const p = this.G.pos();
        ws.send(JSON.stringify(Object.assign({ t: 'join', v: MP.PROTOCOL, look: this.G.look(), x: p.x, y: p.y, z: p.z }, join)));
      };
      ws.onerror = () => fail('Keine Verbindung zum Server (' + url + ')');
      ws.onclose = e => {
        clearTimeout(timer);
        if (!joined) { fail(e.reason || 'Verbindung abgelehnt'); return; }
        if (this.ws === ws) this.lost(e.code === 4000 ? null : 'Verbindung verloren');
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (!done) {
          if (m.t === 'error') { fail(m.msg); return; }
          if (m.t === 'welcome') { done = joined = true; clearTimeout(timer); this.welcome(m); resolve(m); }
          return;
        }
        this.onMessage(m);
      };
    });
  }

  welcome(m) {
    this.online = true;
    this.id = m.id; this.name = m.name; this.color = m.color; this.room = m.room; this.max = m.max;
    this.offset = m.n - performance.now();
    this.retries = 0;
    for (const p of m.players) this.addPlayer(p);
    for (const v of m.vehicles) this.addVehicle(v);
    this.applySky(m.sky, true);
    this.G.atmo.auto = false;
    this.sendPing();
    this.$hud.classList.remove('hidden');
    try { localStorage.setItem(NET_NAME_KEY, m.name.replace(/ \d+$/, '')); } catch (e) { /* ohne Speicher */ }
    // sitzt man schon in einem Auto (Wiederverbinden), wird es neu angemeldet
    const car = this.G.car();
    if (car) this.register(car);
    this.updateBadge();
  }

  leave() {
    this.wantOnline = false;
    const ws = this.ws;
    this.lost(null);
    if (ws) try { ws.close(1000, 'bye'); } catch (e) { /* zu */ }
  }

  // Verbindung weg: fremde Spieler und Autos abbauen, eigene Autos bleiben im eigenen Spiel
  lost(why) {
    if (!this.online && !why) return;
    const was = this.online;
    this.online = false;
    this.ws = null;
    if (this.ride) this.G.endRide(false);
    this.ride = null; this.waitEnter = null;
    for (const p of this.players.values()) this.dropPlayer(p);
    this.players.clear();
    for (const [vid, c] of this.vehicles) { if (c.remote) c.dispose(this.G.scene); else delete c.net; }
    this.vehicles.clear(); this.pendingReg.clear();
    this.remoteCars = []; this.walkers = [];
    this.updateBadge();
    if (!why || !this.wantOnline) { this.$hud.classList.add('hidden'); return; }
    // automatisch wieder verbinden (bis zu 5 Versuche, dieselbe Lobby)
    this.retries = (this.retries || 0) + 1;
    if (this.retries > 5) {
      this.wantOnline = false;
      this.G.ui.bigMessage('OFFLINE', 3, '#e2463f', why + ' · Du spielst allein weiter');
      this.$hud.classList.add('hidden');
      return;
    }
    if (was || this.retries === 1) this.G.ui.toast(`${why}, neuer Versuch …`, 2.5);
    const code = this.room && this.room.code;
    setTimeout(() => {
      if (this.online || !this.wantOnline) return;
      this.connect(this.url, { name: this.joinReq.name, code }).then(() => this.G.ui.toast('Wieder verbunden', 2))
        .catch(() => this.lost('Server nicht erreichbar'));
    }, 1000 * this.retries);
  }

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  get serverNow() { return performance.now() + this.offset; }
  sendPing() { this.send({ t: 'ping', c: performance.now() }); }

  // ---------- Nachrichten ----------
  onMessage(m) {
    switch (m.t) {
      case 'snap': return this.onSnap(m);
      case 'pong': {
        const t = performance.now(), rtt = t - m.c;
        this.rtt = this.rtt ? this.rtt * 0.7 + rtt * 0.3 : rtt;
        const off = m.n + rtt / 2 - t;
        this.offset = Math.abs(off - this.offset) > 250 ? off : this.offset * 0.8 + off * 0.2;
        return;
      }
      case 'map': {
        this.mapList = m.p;
        for (const [id, x, z, mode, st, pg] of m.p) {
          const p = this.players.get(id);
          if (p) p.map = { x, z, mode, st, pg };
        }
        if (!this.$list.classList.contains('hidden')) this.renderList();
        return;
      }
      case 'pjoin': this.addPlayer(m.p); this.sys(`${m.p.name} ist da`); this.updateBadge(); return;
      case 'pleave': {
        const p = this.players.get(m.id);
        if (p) { this.sys(`${p.name} ist gegangen`); this.dropPlayer(p); this.players.delete(m.id); }
        this.updateBadge();
        return;
      }
      case 'plook': { const p = this.players.get(m.id); if (p) { p.look = m.look; p.fig.setOutfit({ shirt: m.look.shirt || p.color, pants: m.look.pants }); } return; }
      case 'vnew': return this.addVehicle(m.v);
      case 'vdel': {
        const c = this.vehicles.get(m.vid);
        if (!c) return;
        this.vehicles.delete(m.vid);
        if (c === this.ride) this.G.endRide(false);
        if (c.remote) c.dispose(this.G.scene); else delete c.net;
        return;
      }
      case 'vehOk': {
        const c = this.pendingReg.get(m.ref);
        this.pendingReg.delete(m.ref);
        if (!c || c.disposed) { this.send({ t: 'del', vid: m.vid }); return; }
        c.net = { vid: m.vid, owner: this.id, driver: this.G.car() === c ? this.id : 0, pass: [], owned: !!c.ownedId };
        this.vehicles.set(m.vid, c);
        // schon wieder ausgestiegen, bevor die Antwort kam
        if (this.G.car() !== c) this.send({ t: 'exit' });
        return;
      }
      case 'vehNo': {
        const c = this.pendingReg.get(m.ref);
        this.pendingReg.delete(m.ref);
        if (c && this.G.car() === c) c.netRetry = performance.now() + 1200; // später noch einmal
        return;
      }
      case 'enterOk': return this.onEnterOk(m);
      case 'enterNo': {
        const c = this.vehicles.get(m.vid);
        this.waitEnter = null;
        this.G.ui.toast(m.msg, 2);
        if (c && !c.remote && this.G.car() === c) this.G.forceExit(); // jemand war schneller
        return;
      }
      case 'own': {
        const c = this.vehicles.get(m.vid);
        if (!c) return;
        c.net.owner = m.owner;
        // jemand hat mein abgestelltes Auto genommen: ab jetzt rechnet er es
        if (m.owner !== this.id && !c.remote) this.makeRemote(c);
        return;
      }
      case 'occ': {
        const c = this.vehicles.get(m.vid);
        if (!c) return;
        const was = c.net.pass.length;
        c.net.driver = m.d; c.net.pass = m.p;
        if (c === this.ride && !m.p.includes(this.id)) this.G.endRide(false);
        if (!c.remote && this.G.car() === c && m.d !== this.id) this.G.forceExit();
        if (!c.remote && this.G.car() === c && m.p.length > was) {
          const p = this.players.get(m.p[m.p.length - 1]);
          if (p) this.G.ui.toast(`${p.name} fährt bei dir mit`, 2);
        }
        return;
      }
      case 'eject': {
        const c = this.vehicles.get(m.vid);
        if (c && c === this.ride) this.G.endRide(false);
        else if (c && this.G.car() === c) this.G.forceExit();
        return;
      }
      case 'boom': {
        const c = this.vehicles.get(m.vid);
        if (!c || !c.remote) return; // eigene Explosion hat das Spiel schon gezeigt
        if (!c.wrecked) { c.wreck(); this.G.remoteBoom(c, c === this.ride); }
        c.burning = 0;
        return;
      }
      case 'fix': return this.G.correct(m);
      case 'sky': return this.applySky(m, false);
      case 'chat': {
        const p = this.players.get(m.id);
        const name = m.id === this.id ? this.name : p ? p.name : '?';
        const color = m.id === this.id ? this.color : p ? p.color : '#ccc';
        this.addChat(name, m.text, color);
        return;
      }
      case 'sys': return this.sys(m.text);
      case 'kick': this.wantOnline = false; this.G.ui.bigMessage('GETRENNT', 5, '#e2463f', m.msg); this.sys(m.msg); return;
    }
  }

  applySky(m, instant) {
    const A = this.G.atmo;
    if (WEATHER_ORDER.includes(m.w) && A.kind !== m.w) A.setWeather(m.w, instant);
    A.nextChange = 1e9;
    if (m.s !== null && m.s !== undefined) { if (Math.abs(A.clock - m.c) > 0.1) A.clock = m.c; A.skipTarget = m.s; }
    else if (A.skipTarget === null && Math.abs(((A.clock - m.c + 36) % 24) - 12) > 0.04) A.clock = m.c;
    if (instant) A.update(0, null, true);
  }

  // ---------- andere Spieler ----------
  addPlayer(info) {
    if (info.id === this.id || this.players.has(info.id)) return;
    const look = info.look || {};
    const fig = new Player(this.G.scene, { shirt: look.shirt || info.color, pants: look.pants || '#2c2f38' });
    fig.visible = false;
    const p = { id: info.id, name: info.name, color: info.color, look, fig, tag: null, tagKey: '', buf: [], seen: -1e9, map: null, mode: 0, st: 0 };
    this.players.set(info.id, p);
  }

  dropPlayer(p) {
    this.G.scene.remove(p.fig.group);
    if (p.tag) { this.G.scene.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); }
  }

  // Namensschild: Farbpunkt, Name, Sterne (neu gemalt, wenn sich etwas ändert)
  tagFor(p) {
    const key = p.name + p.st;
    if (p.tag && p.tagKey === key) return p.tag;
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    const stars = p.st ? ' ' + '★'.repeat(p.st) : '';
    ctx.font = '600 34px Segoe UI, sans-serif';
    const w = Math.ceil(ctx.measureText(p.name + stars).width) + 64;
    cv.width = w; cv.height = 56;
    ctx.font = '600 34px Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(14,17,24,0.72)';
    ctx.beginPath(); ctx.roundRect(0, 0, w, 56, 16); ctx.fill();
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(26, 28, 10, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(p.name, 46, 30);
    if (stars) { ctx.fillStyle = '#ffd23a'; ctx.fillText(stars, 46 + ctx.measureText(p.name).width, 30); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    if (p.tag) { p.tag.material.map.dispose(); p.tag.material.map = tex; p.tag.material.needsUpdate = true; }
    else {
      p.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false, sizeAttenuation: false }));
      p.tag.renderOrder = 20;
      this.G.scene.add(p.tag);
    }
    p.tag.scale.set(0.062 * w / 56, 0.062, 1);
    p.tagKey = key;
    return p.tag;
  }

  // ---------- Autos ----------
  addVehicle(v) {
    if (this.vehicles.has(v.vid)) return;
    const c = new Vehicle(this.G.scene, v.color, v.kind);
    c.remote = true;
    c.net = { vid: v.vid, owner: v.owner, driver: v.driver, pass: v.pass, owned: v.owned, buf: [] };
    c.seen = -1e9;
    if (v.s) this.pushVehicle(c, v.s, this.serverNow);
    const s = c.net.buf[0];
    if (s) { c.x = s.x; c.y = s.y; c.z = s.z; c.heading = s.h; c.sync(); }
    if (v.wrecked) c.wreck();
    c.group.visible = !!s;
    this.vehicles.set(v.vid, c);
  }

  pushVehicle(c, a, snapT) {
    const [, x, y, z, h, pi, ro, se, v, hl, f, age] = a;
    const buf = c.net.buf, t = snapT - age;
    if (buf.length && t <= buf[buf.length - 1].t) return;
    buf.push({ t, x, y, z, h, pi, ro, se, v, hl, f });
    while (buf.length > 2 && buf[1].t < t - 1000) buf.shift();
    c.seen = performance.now();
  }

  // Ein Auto, das bisher nur im eigenen Spiel existierte, für alle sichtbar machen
  register(c) {
    if (!this.online || c.net || c.remote || [...this.pendingReg.values()].includes(c)) return;
    const ref = this.refSeq++;
    this.pendingReg.set(ref, c);
    this.send({ t: 'veh', ref, kind: c.kind, color: '#' + c.baseColor.getHexString(), x: c.x, y: c.y, z: c.z, h: c.heading,
      hl: c.health, owned: !!c.ownedId });
  }

  // fremdes Auto wird eigenes (Einsteigen am Steuer bestätigt)
  makeLocal(c) {
    c.remote = false;
    c.net.owner = this.id; c.net.buf = [];
    c.vx = c.vz = 0; c.sleeping = false;
    c.group.visible = true;
    this.G.parked.push(c);
  }
  // eigenes abgestelltes Auto hat jemand anderes übernommen
  makeRemote(c) {
    const i = this.G.parked.indexOf(c);
    if (i >= 0) this.G.parked.splice(i, 1);
    c.remote = true; c.isPlayer = false;
    c.net.buf = [];
    c.seen = performance.now();
  }

  // ---------- vom Spiel aufgerufen ----------
  // Spieler ist (im eigenen Spiel) in ein Auto gestiegen
  entered(c) {
    if (!this.online) return;
    if (c.netGranted) { delete c.netGranted; return; }
    if (c.net) this.send({ t: 'enter', vid: c.net.vid, seat: 0 });
    else this.register(c);
  }
  exited() { if (this.online) this.send({ t: 'exit' }); this.last = null; }
  teleported() {
    if (!this.online) return;
    const p = this.G.pos();
    this.send({ t: 'tp', x: p.x, y: p.y, z: p.z });
    this.last = null;
  }
  boom(c) { if (this.online && c.net && !c.remote) this.send({ t: 'boom', vid: c.net.vid }); }
  sky(a) { this.send({ t: 'sky', a }); }
  lookChanged() { if (this.online) this.send({ t: 'look', look: this.G.look() }); }

  // E an einem fremden Auto: Steuer übernehmen oder mitfahren (der Server entscheidet)
  requestEnter(c) {
    if (this.waitEnter && performance.now() - this.waitEnter.t < 1500) return;
    const n = c.net, seat = n.driver ? 1 : 0;
    if (seat === 0 && n.owned && n.owner !== this.id) { this.G.ui.toast(`Abgeschlossen: gehört ${this.nameOf(n.owner)}`, 1.8); return; }
    this.waitEnter = { vid: n.vid, t: performance.now() };
    this.send({ t: 'enter', vid: n.vid, seat });
  }

  onEnterOk(m) {
    this.waitEnter = null;
    const c = this.vehicles.get(m.vid);
    if (!c) return;
    if (!c.remote) return; // eigenes Auto: schon drin
    if (m.seat === 0) {
      this.makeLocal(c);
      c.netGranted = true;
      this.G.enterCar(c);
    } else {
      this.ride = c;
      this.G.startRide(c, this.nameOf(c.net.driver));
    }
  }
  endedRide() { if (this.ride) { this.ride = null; this.send({ t: 'exit' }); } }

  nameOf(id) { if (id === this.id) return this.name; const p = this.players.get(id); return p ? p.name : 'jemand'; }

  // Text für die Einsteige-Anzeige bei einem fremden Auto
  prompt(c) {
    const n = c.net;
    if (n.driver) return n.pass.length >= MP.SEATS - 1 ? `Kein Platz frei bei ${this.nameOf(n.driver)}` : `<kbd>E</kbd> Mitfahren bei ${this.nameOf(n.driver)}`;
    if (n.owned && n.owner !== this.id) return `Abgeschlossen: ${c.spec.name} von ${this.nameOf(n.owner)}`;
    return `<kbd>E</kbd> ${c.spec.name} von ${this.nameOf(n.owner)} nehmen`;
  }
  canEnter(c) { const n = c.net; if (c.wrecked) return false; return n.driver ? n.pass.length < MP.SEATS - 1 : !(n.owned && n.owner !== this.id); }

  // ---------- Takt ----------
  update(dt, L) {
    if (!this.online) return;
    const t = performance.now();
    // eigener Zustand
    this.sendT -= dt * 1000;
    const st = this.stateMsg(L);
    const moved = !this.last || Math.abs(st.x - this.last.x) + Math.abs(st.z - this.last.z) > 0.02 || st.m !== this.last.m
      || Math.abs(U.wrapAngle(st.h - this.last.h)) > 0.01 || st.hp !== this.last.hp || st.st !== this.last.st || (st.c && st.c.f !== (this.last.c || {}).f);
    if (this.sendT <= 0 && (moved || this.sendT <= -MP.IDLE_SEND_MS)) {
      this.send(st); this.last = st; this.sendT = MP.SEND_MS;
    }
    // angestoßene eigene Autos, die herumstehen
    this.parkedT -= dt;
    if (this.parkedT <= 0) {
      this.parkedT = 0.1;
      for (const [vid, c] of this.vehicles) {
        if (c.remote) continue;
        if (c.disposed) { this.vehicles.delete(vid); this.send({ t: 'del', vid }); continue; }
        if (c === L.car) continue;
        const k = `${c.x.toFixed(2)},${c.z.toFixed(2)},${c.heading.toFixed(3)},${c.burning ? 1 : 0},${Math.round(c.health)}`;
        if (k !== c.netKey) {
          c.netKey = k;
          this.send({ t: 'vs', vid, x: r2(c.x), y: r2(c.y), z: r2(c.z), h: r3(c.heading), pi: r3(c.pitch), ro: r3(c.roll), v: r2(c.speed), hl: Math.round(c.health), f: c.burning ? 1 : 0 });
        }
      }
    }
    // eigenes Auto noch nicht angemeldet (Server hat abgelehnt): erneut versuchen
    if (L.car && !L.car.net && L.car.netRetry && t > L.car.netRetry) { L.car.netRetry = 0; this.teleported(); setTimeout(() => this.register(L.car), 150); }
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 2; this.sendPing(); this.tickHud(); }
    this.interpolate(dt, L);
  }

  stateMsg(L) {
    const P = L.player, st = { t: 's', m: 0, x: r2(P.x), y: r2(P.y), z: r2(P.z), h: r3(P.heading), sp: r1(P.moveSpeed), hp: Math.max(0, Math.round(P.health)), st: L.stars, f: P.onGround ? 0 : 1, pg: Math.round(this.rtt) };
    if (L.indoor) st.m = 3;
    else if (this.ride) st.m = 2;
    else if (L.car) {
      const c = L.car;
      Object.assign(st, { x: r2(c.x), y: r2(c.y), z: r2(c.z), h: r3(c.heading) });
      if (c.net && !c.remote) {
        st.m = 1;
        st.c = { x: st.x, y: st.y, z: st.z, h: st.h, pi: r3(c.pitch), ro: r3(c.roll), se: r3(c.steer), v: r2(c.speed), hl: Math.round(c.health),
          f: (c.burning ? 1 : 0) | (L.horn ? 2 : 0) | (c.siren ? 4 : 0) };
      } else st.m = 3; // Auto noch nicht angemeldet: kurz unsichtbar statt falsch
    }
    return st;
  }

  onSnap(m) {
    const now = performance.now();
    for (const a of m.p) {
      const p = this.players.get(a[0]);
      if (!p) continue;
      const t = m.n - a[11];
      if (p.buf.length && t <= p.buf[p.buf.length - 1].t) continue;
      p.buf.push({ t, x: a[1], y: a[2], z: a[3], h: a[4], m: a[5], sp: a[6], hp: a[7], st: a[8], f: a[9], vid: a[10] });
      while (p.buf.length > 2 && p.buf[1].t < t - 1000) p.buf.shift();
      p.seen = now;
    }
    for (const a of m.v) {
      const c = this.vehicles.get(a[0]);
      if (c && c.remote) this.pushVehicle(c, a, m.n);
    }
  }

  // Zustand zur Zeit rt aus dem Puffer: zwischen zwei Aufnahmen gleiten, kurz darüber hinaus vorausrechnen
  static sample(buf, rt, out) {
    let a = buf[0], b = null;
    for (let i = buf.length - 1; i >= 0; i--) if (buf[i].t <= rt) { a = buf[i]; b = buf[i + 1] || null; break; }
    if (b) {
      const f = (rt - a.t) / ((b.t - a.t) || 1);
      out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; out.z = a.z + (b.z - a.z) * f;
      out.h = a.h + U.wrapAngle(b.h - a.h) * f;
      out.vx = (b.x - a.x) / ((b.t - a.t) / 1000 || 1); out.vz = (b.z - a.z) / ((b.t - a.t) / 1000 || 1);
      out.a = a; out.b = b; out.f = f;
    } else {
      // neuer als die letzte Aufnahme: höchstens 250 ms mit der letzten Geschwindigkeit weiter
      const p = buf[buf.length - 2], dtv = p ? (a.t - p.t) / 1000 : 0;
      const vx = p && dtv > 0 ? (a.x - p.x) / dtv : 0, vz = p && dtv > 0 ? (a.z - p.z) / dtv : 0;
      const ex = U.clamp((rt - a.t) / 1000, 0, 0.25);
      out.x = a.x + vx * ex; out.y = a.y; out.z = a.z + vz * ex; out.h = a.h;
      out.vx = vx; out.vz = vz; out.a = a; out.b = null; out.f = 0;
    }
    return out;
  }

  interpolate(dt, L) {
    const now = performance.now(), rt = this.serverNow - MP.INTERP_MS, s = this._s || (this._s = {});
    const cam = this.G.camera.position;
    this.walkers.length = 0;
    // Autos
    this.remoteCars = [];
    for (const c of this.vehicles.values()) {
      if (!c.remote) continue;
      const buf = c.net.buf;
      const vis = buf.length > 0 && now - c.seen < 4000;
      c.group.visible = vis;
      if (!vis) continue;
      NetClient.sample(buf, rt, s);
      const a = s.a, b = s.b || a, f = s.f;
      c.x = s.x; c.y = s.y; c.z = s.z; c.heading = s.h;
      c.pitch = a.pi + (b.pi - a.pi) * f; c.roll = a.ro + (b.ro - a.ro) * f; c.steer = a.se + (b.se - a.se) * f;
      const v = a.v + (b.v - a.v) * f;
      c.vx = Math.sin(c.heading) * v; c.vz = Math.cos(c.heading) * v;
      c.spin += v * dt / CAR.wheelR;
      if (!c.wrecked) {
        if (Math.abs(c.health - b.hl) > 0.5) { c.health = b.hl; c.paint.color.copy(c.baseColor).multiplyScalar(0.45 + 0.55 * U.clamp(c.health / 100, 0, 1)); }
        c.burning = b.f & 1 ? 1 : 0;
        if (!!(b.f & 4) !== c.siren) c.setSiren(!!(b.f & 4));
        if (c.siren) c.flash(now / 1000);
        // Hupe anderer Spieler in der Nähe
        if (b.f & 2) {
          const d = Math.hypot(c.x - cam.x, c.z - cam.z);
          if (d < 90 && (!c.hornT || now - c.hornT > 420)) { c.hornT = now; this.G.audio.beep(392, 0.38, 0, 'square', 0.07 * (1 - d / 90)); this.G.audio.beep(494, 0.38, 0, 'square', 0.07 * (1 - d / 90)); }
        }
      }
      c.sync();
      this.remoteCars.push(c); // Wracks bleiben Hindernisse
    }
    // Spieler
    for (const p of this.players.values()) {
      const vis = p.buf.length > 0 && now - p.seen < 3000;
      if (!vis) { p.fig.visible = false; if (p.tag) p.tag.visible = false; continue; }
      NetClient.sample(p.buf, rt, s);
      const a = s.a;
      p.mode = a.m; p.st = a.st; p.hp = a.hp;
      const F = p.fig;
      const onFoot = a.m === 0;
      F.visible = onFoot;
      let tagX = s.x, tagY = s.y + 2.35, tagZ = s.z, tagOn = onFoot;
      if (onFoot) {
        F.x = s.x; F.y = s.y; F.z = s.z; F.heading = s.h;
        F.moveSpeed = U.damp(F.moveSpeed, a.sp, 10, dt);
        F.onGround = !(a.f & 1);
        F.walkPhase += dt * F.moveSpeed * 2.2;
        F.sync();
        this.walkers.push(F);
        // nicht ineinander laufen
        if (L.walking) {
          const P = L.player, dx = P.x - F.x, dz = P.z - F.z, d = Math.hypot(dx, dz), R = WALK.radius * 2;
          if (d < R && d > 1e-3 && Math.abs(P.y - F.y) < 1.5) { P.x += dx / d * (R - d); P.z += dz / d * (R - d); }
        }
      } else if (a.m === 1 && a.vid) {
        const c = this.vehicles.get(a.vid);
        if (c && c.remote && c.group.visible) { tagX = c.x; tagY = c.y + 2.6; tagZ = c.z; tagOn = true; }
      }
      const tag = this.tagFor(p);
      const d = Math.hypot(tagX - cam.x, tagY - cam.y, tagZ - cam.z);
      tag.visible = tagOn && d < 450 && !L.indoor;
      tag.position.set(tagX, tagY, tagZ);
    }
  }

  // für Minikarte und Stadtplan
  blips() {
    if (!this.online) return [];
    const out = [];
    for (const p of this.players.values()) {
      // nahe: dargestellte Figur bzw. ihr Auto, ferne: grober Ort aus der Kartenmeldung
      const near = p.buf.length && performance.now() - p.seen < 3000;
      const last = near && p.buf[p.buf.length - 1], car = last && last.vid && this.vehicles.get(last.vid);
      const at = !near ? p.map : p.fig.visible ? p.fig : car && car.group.visible ? car : p.map;
      if (!at || p.mode === 3 || (p.map && p.map.mode === 3 && !near)) continue;
      out.push({ x: at.x, z: at.z, color: p.color, name: p.name });
    }
    return out;
  }

  // ---------- HUD: Abzeichen, Chat, Spielerliste ----------
  buildHud() {
    const hud = document.getElementById('hud');
    const el = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; };
    this.$hud = el('div', 'mp-hud', 'hidden');
    this.$badge = el('div', 'mp-badge');
    this.$chat = el('div', 'mp-chat');
    this.$input = el('input', 'mp-input', 'hidden');
    this.$input.maxLength = MP.CHAT_MAX; this.$input.placeholder = 'Nachricht … (Enter senden, Esc abbrechen)';
    this.$list = el('div', 'mp-list', 'hidden');
    this.$hud.append(this.$badge, this.$chat, this.$input, this.$list);
    hud.appendChild(this.$hud);
    this.$input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = this.$input.value.trim(); if (t) this.send({ t: 'chat', text: t }); this.closeChat(); }
      else if (e.key === 'Escape') this.closeChat();
    });
    this.$list.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'invite') {
        const link = location.origin + location.pathname + '?lobby=' + this.room.code + (new URLSearchParams(location.search).get('server') ? '&server=' + encodeURIComponent(new URLSearchParams(location.search).get('server')) : '');
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => this.G.ui.toast('Einladungslink kopiert', 2))
          .catch(() => prompt('Einladungslink:', link));
      } else if (b.dataset.act === 'leave') { this.toggleList(false); this.leave(); this.G.ui.toast('Lobby verlassen, du spielst allein weiter', 2.5); }
      else if (b.dataset.act === 'close') this.toggleList(false);
    });
  }

  get typing() { return document.activeElement === this.$input; }
  openChat() {
    if (!this.online) return;
    this.$input.classList.remove('hidden');
    this.$input.value = '';
    this.$chat.classList.add('open');
    setTimeout(() => this.$input.focus(), 0);
  }
  closeChat() { this.$input.blur(); this.$input.classList.add('hidden'); this.$chat.classList.remove('open'); this.G.lockPointer(); }

  addChat(name, text, color) {
    const line = document.createElement('div');
    line.className = 'mp-line';
    const b = document.createElement('b'); b.textContent = name + ': '; b.style.color = color;
    const s = document.createElement('span'); s.textContent = text;
    line.append(b, s);
    this.pushLine(line);
  }
  sys(text) {
    const line = document.createElement('div');
    line.className = 'mp-line sys'; line.textContent = text;
    this.pushLine(line);
  }
  pushLine(line) {
    this.$chat.appendChild(line);
    while (this.$chat.children.length > 8) this.$chat.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 12000);
  }

  toggleList(on) {
    on = on === undefined ? this.$list.classList.contains('hidden') : on;
    this.$list.classList.toggle('hidden', !on);
    if (on) { document.exitPointerLock?.(); this.renderList(); } else this.G.lockPointer();
  }
  renderList() {
    const me = { name: this.name + ' (du)', color: this.color, st: this.G.stars(), pg: Math.round(this.rtt), mode: -1 };
    const rows = [me].concat([...this.players.values()].map(p => ({ name: p.name, color: p.color, st: p.map ? p.map.st : p.st, pg: p.map ? p.map.pg : 0, mode: p.map ? p.map.mode : p.mode })));
    const how = m => m === 1 ? 'fährt' : m === 2 ? 'fährt mit' : m === 3 ? 'drinnen' : m === 0 ? 'zu Fuß' : '';
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    this.$list.innerHTML = `<div class="mp-list-head"><b>${esc(this.room.name)}</b><span>${this.players.size + 1}/${this.max} Spieler · Code <code>${this.room.code}</code></span></div>
      <table>${rows.map(r => `<tr><td><i style="background:${r.color}"></i>${esc(r.name)}</td><td>${how(r.mode)}</td><td class="st">${'★'.repeat(r.st || 0)}</td><td>${r.pg ? r.pg + ' ms' : ''}</td></tr>`).join('')}</table>
      <div class="mp-list-foot"><button data-act="invite">Einladungslink kopieren</button><button data-act="leave" class="ghost">Lobby verlassen</button><button data-act="close" class="ghost">Schließen (Tab)</button></div>`;
  }

  updateBadge() {
    if (!this.online) { this.$badge.textContent = ''; return; }
    this.$badge.innerHTML = `<i></i>${this.room.name.replace(/[&<>]/g, '')} · ${this.players.size + 1}/${this.max} · <span id="mp-ping">${Math.round(this.rtt)} ms</span> · <kbd>T</kbd> Chat · <kbd>Tab</kbd> Spieler`;
  }
  tickHud() {
    if (!this.online) return;
    const el = document.getElementById('mp-ping');
    if (el) el.textContent = Math.round(this.rtt) + ' ms';
  }
}

function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }

// ---------- Lobby auf dem Startbildschirm ----------
class NetLobby {
  constructor(net, onJoined) {
    this.net = net; this.onJoined = onJoined;
    const $ = id => document.getElementById(id);
    this.$ = $;
    this.url = NetClient.serverUrl();
    $('mp-btn').onclick = () => this.open();
    $('lobby-back').onclick = () => this.close();
    $('lobby-refresh').onclick = () => this.refresh();
    $('lobby-quick').onclick = () => this.join({});
    $('lobby-create').onclick = () => this.join({ create: { name: $('lobby-new-name').value, priv: $('lobby-new-priv').checked } });
    $('lobby-code-join').onclick = () => this.join({ code: $('lobby-code').value });
    $('lobby-server-save').onclick = () => {
      const v = $('lobby-server').value.trim();
      try { if (v) localStorage.setItem(NET_SERVER_KEY, v); else localStorage.removeItem(NET_SERVER_KEY); } catch (e) { /* ohne Speicher */ }
      this.url = NetClient.serverUrl(); this.refresh();
    };
    let name = '';
    try { name = localStorage.getItem(NET_NAME_KEY) || ''; } catch (e) { /* ohne Speicher */ }
    $('lobby-name').value = name;
    for (const id of ['lobby-name', 'lobby-code', 'lobby-new-name', 'lobby-server']) $(id).addEventListener('keydown', e => e.stopPropagation());
    const code = new URLSearchParams(location.search).get('lobby');
    if (code) { $('lobby-code').value = code.toUpperCase(); this.invite = true; }
  }

  // Startbildschirm ist bereit: mit Einladungslink gleich die Lobby zeigen
  ready() { if (this.invite) this.open(); }

  open() {
    this.$('start').classList.add('hidden');
    this.$('lobby').classList.remove('hidden');
    this.$('lobby-server').value = this.url || '';
    if (!this.url) { this.status('Online spielen geht nur über den Server: <code>node server.js</code> starten und http://127.0.0.1:8175 öffnen.', true); return; }
    this.refresh();
    if (!this.$('lobby-name').value) this.$('lobby-name').focus();
  }
  close() { this.$('lobby').classList.add('hidden'); this.$('start').classList.remove('hidden'); }

  status(html, bad) { const s = this.$('lobby-status'); s.innerHTML = html; s.classList.toggle('bad', !!bad); }

  async refresh() {
    const ul = this.$('lobby-rooms');
    ul.innerHTML = '<li class="muted">Suche Lobbys …</li>';
    try {
      const r = await this.net.listRooms(this.url);
      if (r.protocol !== MP.PROTOCOL) { this.status('Der Server hat eine andere Spielversion. Bitte die Seite neu laden.', true); return; }
      ul.innerHTML = '';
      for (const room of r.rooms) {
        const li = document.createElement('li');
        const full = room.n >= room.max;
        li.innerHTML = `<span class="ln"></span><span class="lc">${room.n}/${room.max}</span>`;
        li.querySelector('.ln').textContent = room.name;
        const b = document.createElement('button');
        b.textContent = full ? 'Voll' : 'Beitreten'; b.disabled = full;
        b.onclick = () => this.join({ code: room.code });
        li.appendChild(b); ul.appendChild(li);
      }
      if (!r.rooms.length) ul.innerHTML = '<li class="muted">Keine öffentlichen Lobbys</li>';
      this.status(`Server verbunden · ${r.online} online`);
    } catch (e) {
      ul.innerHTML = '';
      this.status('Kein Mehrspieler-Server erreichbar (' + this.url.replace(/[<>]/g, '') + '). Läuft <code>node server.js</code>?', true);
    }
  }

  async join(how) {
    const name = this.$('lobby-name').value.trim();
    if (name.length < 2) { this.status('Bitte zuerst einen Namen eingeben (mindestens 2 Zeichen).', true); this.$('lobby-name').focus(); return; }
    this.status('Verbinde …');
    for (const b of this.$('lobby').querySelectorAll('button')) b.disabled = true;
    try {
      const w = await this.net.connect(this.url, Object.assign({ name }, how));
      this.$('lobby').classList.add('hidden');
      this.onJoined(w);
    } catch (e) {
      this.status(String(e.message).replace(/[<>]/g, ''), true);
    } finally {
      for (const b of this.$('lobby').querySelectorAll('button')) b.disabled = false;
    }
  }
}
