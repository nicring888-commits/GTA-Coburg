// Kern des Mehrspieler-Servers von Grand Theft Coburg: Lobbys, Spieler, Autos, Sitzplätze, Uhrzeit und Wetter.
// Läuft im Node-Server (mp/game-server.js, über WebSocket) und beim Peer-to-Peer-Gastgeber im Browser
// (js/mp-host-worker.js, über WebRTC). Jedes Spiel rechnet seine eigene Figur bzw. sein Auto (flüssige Steuerung) und
// schickt den Zustand; der Kern prüft ihn (Tempo, Kartenrand, Sitzplätze, Besitz, Raten) und verteilt Momentaufnahmen
// an alle in der Nähe. Unplausible Bewegungen werden verworfen und zurückgesetzt, Wiederholungstäter fliegen raus.
'use strict';

(function (root) {
const T0 = Date.now();
const now = () => Date.now() - T0;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const int = (v, lo, hi, d = lo) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WEATHER_ODDS = { clear: 0.38, cloudy: 0.3, overcast: 0.12, rain: 0.13, fog: 0.07 };
const IDLE_KICK = 30000;

// opts.rooms: feste Lobbys [{ code, name, priv }]; opts.single: nur diese eine Lobby (Gastgeber im Browser)
function createCore(MP, opts = {}) {
const rooms0 = opts.rooms || [{ code: 'COBURG', name: 'Coburg Altstadt' }, { code: 'LANDKR', name: 'Landkreis-Tour' }];
const single = !!opts.single;
let nextPid = 1, nextVid = 1;
const rooms = new Map();     // Code → Raum
const conns = new Set();

// ---------- Lobbys ----------
function randomWeather() {
  let r = Math.random();
  for (const k of MP.WEATHER) { r -= WEATHER_ODDS[k]; if (r <= 0) return k; }
  return 'clear';
}
function makeRoom(name, priv, persistent, code) {
  if (!code) do code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); while (rooms.has(code));
  const r = { code, name, priv: !!priv, persistent: !!persistent, players: new Map(), vehicles: new Map(),
    clock: 9 + Math.random() * 6, weather: 'clear', skip: null, nextWeather: 200 + Math.random() * 200,
    emptySince: now(), lastSky: -1e9, tick: 0, created: now() };
  rooms.set(code, r);
  return r;
}
for (const r of rooms0) makeRoom(r.name, !!r.priv, true, r.code);

function roomList() {
  return [...rooms.values()].filter(r => !r.priv).map(r => ({ code: r.code, name: r.name, n: r.players.size, max: MP.ROOM_MAX }))
    .sort((a, b) => b.n - a.n);
}

function broadcast(room, msg, except) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) if (p !== except) p.conn.send(s);
}
const send = (p, msg) => p.conn.send(JSON.stringify(msg));
const skyMsg = r => ({ t: 'sky', c: r3(r.clock), w: r.weather, s: r.skip });

// ---------- Kodierung ----------
function pubPlayer(p) { return { id: p.id, name: p.name, color: p.color, look: p.look }; }
function encPlayer(p, t) {
  return [p.id, r2(p.x), r2(p.y), r2(p.z), r3(p.h), p.mode, r1(p.sp), Math.round(p.hp), p.st, p.f, p.vid || 0, t - p.ts];
}
function pubVehicle(v) {
  return { vid: v.vid, kind: v.kind, color: v.color, owner: v.owner, owned: v.owned, driver: v.driver || 0, pass: [...v.pass], wrecked: v.wrecked };
}
function encVehicle(v, t) {
  return [v.vid, r2(v.x), r2(v.y), r2(v.z), r3(v.h), r3(v.pi), r3(v.ro), r3(v.se), r2(v.v), Math.round(v.hl), v.f, t - v.ts];
}
const occMsg = v => ({ t: 'occ', vid: v.vid, d: v.driver || 0, p: [...v.pass] });

// ---------- Bewegungsprüfung ----------
// Guthaben-Prinzip: Mit der Zeit wächst das erlaubte Wegstück (Höchsttempo), jede Bewegung verbraucht davon.
// Pakete, die gebündelt ankommen (kurzes Netzloch), sind so kein Fehlalarm, Teleportieren und Raketentempo schon.
function moveOk(e, x, z, vmax) {
  const t = now(), dt = Math.min(5, (t - e.mt) / 1000);
  e.mt = t;
  e.credit = Math.min(e.credit + dt * vmax, vmax * 2.5 + 20);
  const d = Math.hypot(x - e.x, z - e.z);
  if (d > e.credit) return false;
  e.credit -= d;
  return true;
}
const resetCredit = e => { e.mt = now(); e.credit = 30; };
const carMax = kind => (MP.CAR_MAX[kind] || 50) * MP.CAR_SLACK + 6;

function strike(p, why) {
  p.strikes += 1;
  p.lastStrike = now();
  if (p.strikes >= 8) { console.log(`[mp] ${p.name} entfernt: ${why}`); kick(p, 'Vom Server entfernt: unplausible Bewegungen (' + why + ')'); return; }
  // zurück an die letzte gültige Stelle
  const v = p.vid && p.room.vehicles.get(p.vid);
  send(p, v && v.driver === p.id ? { t: 'fix', x: v.x, y: v.y, z: v.z, h: v.h, car: 1 } : { t: 'fix', x: p.x, y: p.y, z: p.z, h: p.h });
}

function kick(p, msg) {
  try { send(p, { t: 'kick', msg }); } catch (e) { /* weg */ }
  p.conn.close(4000, 'kick');
}

// ---------- Sitzplätze ----------
function leaveSeat(p, room) {
  const v = p.vid && room.vehicles.get(p.vid);
  p.vid = 0; p.seat = -1;
  if (p.mode === 1 || p.mode === 2) p.mode = 0;
  if (!v) return;
  if (v.driver === p.id) { v.driver = 0; v.emptySince = now(); }
  v.pass.delete(p.id);
  broadcast(room, occMsg(v));
}

function removeVehicle(room, v) {
  for (const id of [v.driver, ...v.pass]) {
    const q = id && room.players.get(id);
    if (q && q.vid === v.vid) { q.vid = 0; q.seat = -1; q.mode = 0; resetCredit(q); send(q, { t: 'eject', vid: v.vid }); }
  }
  room.vehicles.delete(v.vid);
  broadcast(room, { t: 'vdel', vid: v.vid });
}

// ---------- Nachrichten ----------
function onMessage(c, raw) {
  // Rate begrenzen (Eimer mit 120 Marken, 60 pro Sekunde nachgefüllt)
  const t = now();
  c.tokens = Math.min(120, c.tokens + (t - c.tokT) * 0.06); c.tokT = t;
  if (c.tokens < 1) { if (++c.drops > 400) c.close(4001, 'Zu viele Nachrichten'); return; }
  c.tokens -= 1;
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;
  const p = c.player;
  if (!p) {
    if (m.t === 'list') c.send(JSON.stringify({ t: 'rooms', rooms: roomList(), max: MP.ROOM_MAX }));
    else if (m.t === 'join') join(c, m);
    else if (m.t === 'ping') c.send(JSON.stringify({ t: 'pong', c: m.c, n: now() }));
    return;
  }
  const room = p.room;
  switch (m.t) {
    case 's': return onState(p, room, m);
    case 'vs': return onParked(p, room, m);
    case 'ping': return send(p, { t: 'pong', c: m.c, n: now() });
    case 'veh': return onRegister(p, room, m);
    case 'enter': return onEnter(p, room, m);
    case 'exit': if (p.vid) { leaveSeat(p, room); resetCredit(p); } return;
    case 'del': {
      const v = room.vehicles.get(m.vid);
      if (v && v.owner === p.id && (!v.driver || v.driver === p.id)) { if (v.driver === p.id) leaveSeat(p, room); removeVehicle(room, v); }
      return;
    }
    case 'boom': {
      const v = room.vehicles.get(m.vid);
      if (!v || v.wrecked || v.owner !== p.id) return;
      v.wrecked = true; v.wreckT = t; v.f |= 1; v.hl = 0;
      for (const id of [v.driver, ...v.pass]) { const q = id && room.players.get(id); if (q) { q.vid = 0; q.seat = -1; q.mode = 0; resetCredit(q); } }
      v.driver = 0; v.pass.clear();
      broadcast(room, { t: 'boom', vid: v.vid, x: r2(v.x), y: r2(v.y), z: r2(v.z) });
      broadcast(room, occMsg(v));
      return;
    }
    case 'tp': {
      // Schnellreise, Neustart, Auto zurücksetzen: höchstens alle 2 s, nur innerhalb der Karte
      const x = num(m.x, -MP.WORLD, MP.WORLD), z = num(m.z, -MP.WORLD, MP.WORLD), y = num(m.y, -500, 3000);
      if (x === null || z === null || y === null || t - p.lastTp < 2000) return strike(p, 'Teleport');
      p.lastTp = t;
      p.x = x; p.y = y; p.z = z; p.ts = t; resetCredit(p);
      const v = p.vid && room.vehicles.get(p.vid);
      if (v && v.driver === p.id) { v.x = x; v.y = y; v.z = z; v.ts = t; resetCredit(v); }
      return;
    }
    case 'chat': {
      const text = clean(m.text, MP.CHAT_MAX);
      if (!text || t - p.lastChat < 600) return;
      p.lastChat = t;
      broadcast(room, { t: 'chat', id: p.id, text });
      return;
    }
    case 'sky': {
      if (t - room.lastSky < 3000) return send(p, { t: 'sys', text: 'Bitte kurz warten' });
      room.lastSky = t;
      if (m.a === 'night') {
        const night = room.clock >= 20 || room.clock < 6;
        room.skip = night ? 9 : 22;
        broadcast(room, { t: 'sys', text: `${p.name}: Zeitraffer bis ${room.skip} Uhr` });
      } else if (m.a === 'weather') {
        room.weather = MP.WEATHER[(MP.WEATHER.indexOf(room.weather) + 1) % MP.WEATHER.length];
        room.nextWeather = 400;
        broadcast(room, { t: 'sys', text: `${p.name} hat das Wetter geändert` });
      }
      broadcast(room, skyMsg(room));
      return;
    }
    case 'look': {
      p.look = cleanLook(m.look);
      broadcast(room, { t: 'plook', id: p.id, look: p.look }, p);
      return;
    }
  }
}

function cleanLook(l) {
  const o = {};
  if (l && COLOR_RE.test(l.shirt)) o.shirt = l.shirt;
  if (l && COLOR_RE.test(l.pants)) o.pants = l.pants;
  return o;
}

function join(c, m) {
  if (m.v !== MP.PROTOCOL) return c.send(JSON.stringify({ t: 'error', msg: 'Neue Spielversion: Bitte die Seite neu laden.' }));
  let name = clean(m.name, MP.NAME_MAX);
  if (name.length < 2) return c.send(JSON.stringify({ t: 'error', msg: 'Bitte einen Namen mit mindestens 2 Zeichen eingeben.' }));
  let room = null;
  if (single) {
    // Gastgeber im Browser (Peer-to-Peer): genau eine Lobby; wer sie als Erster anlegt, gibt Name und Sichtbarkeit vor
    room = rooms.values().next().value;
    if (m.create && !room.players.size) { room.name = clean(m.create.name, 28) || `Lobby von ${name}`; room.priv = !!m.create.priv; }
  } else if (m.create) {
    const rn = clean(m.create.name, 28) || `Lobby von ${name}`;
    if (rooms.size >= 60) return c.send(JSON.stringify({ t: 'error', msg: 'Zu viele Lobbys auf dem Server. Bitte einer bestehenden beitreten.' }));
    room = makeRoom(rn, !!m.create.priv, false);
  } else if (m.code) {
    room = rooms.get(clean(m.code, 8).toUpperCase());
    if (!room) return c.send(JSON.stringify({ t: 'error', msg: 'Lobby nicht gefunden. Code prüfen.' }));
  } else {
    // Schnell beitreten: die vollste öffentliche Lobby, in der noch Platz ist
    room = [...rooms.values()].filter(r => !r.priv && r.players.size < MP.ROOM_MAX).sort((a, b) => b.players.size - a.players.size)[0];
  }
  if (!room || room.players.size >= MP.ROOM_MAX) return c.send(JSON.stringify({ t: 'error', msg: 'Die Lobby ist voll.' }));
  const taken = new Set([...room.players.values()].map(p => p.name.toLowerCase()));
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = clean(m.name, MP.NAME_MAX - 3) + ' ' + i;
  const used = new Set([...room.players.values()].map(p => p.color));
  const color = MP.COLORS.find(col => !used.has(col)) || MP.COLORS[0];
  const x = num(m.x, -MP.WORLD, MP.WORLD) ?? 0, z = num(m.z, -MP.WORLD, MP.WORLD) ?? 0, y = num(m.y, -500, 3000) ?? 0;
  const t = now();
  const p = { id: nextPid++, name, color, look: cleanLook(m.look), conn: c, room, x, y, z, h: 0, mode: 0, sp: 0, hp: 100, st: 0, f: 0,
    vid: 0, seat: -1, ts: t, mt: t, credit: 30, strikes: 0, lastStrike: 0, lastChat: 0, lastTp: 0, lastVeh: 0, ping: 0,
    sent: new Map(), vsent: new Map() };
  c.player = p;
  room.players.set(p.id, p);
  send(p, { t: 'welcome', id: p.id, color, name, n: t, max: MP.ROOM_MAX,
    room: { code: room.code, name: room.name, priv: room.priv },
    players: [...room.players.values()].filter(q => q !== p).map(pubPlayer),
    vehicles: [...room.vehicles.values()].map(v => Object.assign(pubVehicle(v), { s: encVehicle(v, t) })),
    sky: skyMsg(room) });
  broadcast(room, { t: 'pjoin', p: pubPlayer(p) }, p);
  console.log(`[mp] ${name} → ${room.name} (${room.code}), ${room.players.size} Spieler`);
}

function leave(p) {
  const room = p.room;
  if (!room.players.has(p.id)) return;
  if (p.vid) leaveSeat(p, room);
  room.players.delete(p.id);
  for (const v of [...room.vehicles.values()]) if (v.owner === p.id) removeVehicle(room, v);
  broadcast(room, { t: 'pleave', id: p.id });
  if (!room.players.size) room.emptySince = now();
  console.log(`[mp] ${p.name} hat ${room.name} verlassen, ${room.players.size} Spieler`);
}

function onState(p, room, m) {
  const t = now();
  const mode = int(m.m, 0, 3, 0);
  p.hp = num(m.hp, 0, 100) ?? p.hp;
  p.st = int(m.st, 0, 5, 0);
  p.f = int(m.f, 0, 255, 0);
  if (num(m.pg, 0, 9999) !== null) p.ping = Math.round(m.pg);
  const v = p.vid && room.vehicles.get(p.vid);
  if (mode === 1 && v && v.driver === p.id && m.c) {
    const c = m.c;
    const x = num(c.x, -MP.WORLD, MP.WORLD), z = num(c.z, -MP.WORLD, MP.WORLD), y = num(c.y, -500, 3000), h = num(c.h, -1e4, 1e4);
    if (x === null || z === null || y === null || h === null) return;
    if (!moveOk(v, x, z, carMax(v.kind))) return strike(p, 'Tempo im Auto');
    Object.assign(v, { x, y, z, h, pi: num(c.pi, -2, 2) ?? 0, ro: num(c.ro, -2, 2) ?? 0, se: num(c.se, -1, 1) ?? 0,
      v: num(c.v, -80, 120) ?? 0, hl: v.wrecked ? 0 : (num(c.hl, 0, 100) ?? v.hl), f: int(c.f, 0, 255, 0) | (v.wrecked ? 1 : 0), ts: t });
    Object.assign(p, { x, y, z, h, mode: 1, sp: Math.abs(v.v), ts: t });
    resetCreditSoft(p, t);
    return;
  }
  if (mode === 2 && v && v.pass.has(p.id)) {
    Object.assign(p, { x: v.x, y: v.y, z: v.z, mode: 2, sp: 0, ts: t });
    resetCreditSoft(p, t);
    return;
  }
  const x = num(m.x, -MP.WORLD, MP.WORLD), z = num(m.z, -MP.WORLD, MP.WORLD), y = num(m.y, -500, 3000), h = num(m.h, -1e4, 1e4);
  if (x === null || z === null || y === null || h === null) return;
  if (mode === 3) { p.mode = 3; p.ts = t; return; } // in einer Wohnung: unsichtbar, Ort bleibt an der Tür
  if (!moveOk(p, x, z, MP.WALK_MAX)) return strike(p, 'Lauftempo');
  Object.assign(p, { x, y, z, h, mode: 0, sp: num(m.sp, 0, 20) ?? 0, ts: t });
}
// im Auto: Fußgänger-Guthaben mitführen, damit das Aussteigen kein Fehlalarm ist
function resetCreditSoft(p, t) { p.mt = t; p.credit = 30; }

// abgestellte, angestoßene Autos des Besitzers
function onParked(p, room, m) {
  const v = room.vehicles.get(m.vid);
  if (!v || v.owner !== p.id || v.driver || v.wrecked) return;
  const x = num(m.x, -MP.WORLD, MP.WORLD), z = num(m.z, -MP.WORLD, MP.WORLD), y = num(m.y, -500, 3000), h = num(m.h, -1e4, 1e4);
  if (x === null || z === null || y === null || h === null) return;
  if (!moveOk(v, x, z, carMax(v.kind))) return;
  Object.assign(v, { x, y, z, h, pi: num(m.pi, -2, 2) ?? 0, ro: num(m.ro, -2, 2) ?? 0, se: 0, v: num(m.v, -80, 120) ?? 0,
    hl: num(m.hl, 0, 100) ?? v.hl, f: int(m.f, 0, 255, 0) & 1, ts: now() });
}

// Spieler steigt in ein Auto, das bisher nur in seinem Spiel existierte: Es wird für alle sichtbar
function onRegister(p, room, m) {
  const t = now();
  const fail = why => send(p, { t: 'vehNo', ref: m.ref, msg: why });
  if (p.vid) return fail('Du sitzt schon in einem Auto');
  if (t - p.lastVeh < 800) return fail('Zu schnell');
  if (!MP.CAR_MAX[m.kind] || !COLOR_RE.test(m.color)) return fail('Unbekanntes Auto');
  const x = num(m.x, -MP.WORLD, MP.WORLD), z = num(m.z, -MP.WORLD, MP.WORLD), y = num(m.y, -500, 3000), h = num(m.h, -1e4, 1e4);
  if (x === null || z === null || y === null || h === null) return fail('Ungültiger Ort');
  if (Math.hypot(x - p.x, z - p.z) > MP.ENTER_DIST * 2) return fail('Zu weit weg');
  p.lastVeh = t;
  const mine = [...room.vehicles.values()].filter(v => v.owner === p.id).sort((a, b) => a.created - b.created);
  while (mine.length >= MP.CARS_PER_PLAYER) {
    const old = mine.find(v => !v.driver && !v.pass.size);
    if (!old) return fail('Zu viele Autos');
    mine.splice(mine.indexOf(old), 1);
    removeVehicle(room, old);
  }
  const v = { vid: nextVid++, kind: m.kind, color: m.color, owner: p.id, owned: !!m.owned, driver: p.id, pass: new Set(),
    x, y, z, h, pi: 0, ro: 0, se: 0, v: 0, hl: num(m.hl, 0, 100) ?? 100, f: 0, ts: t, mt: t, credit: 30, created: t,
    emptySince: t, wrecked: false, wreckT: 0 };
  room.vehicles.set(v.vid, v);
  p.vid = v.vid; p.seat = 0; p.mode = 1;
  send(p, { t: 'vehOk', ref: m.ref, vid: v.vid });
  broadcast(room, { t: 'vnew', v: Object.assign(pubVehicle(v), { s: encVehicle(v, t) }) }, p);
}

function onEnter(p, room, m) {
  const v = room.vehicles.get(m.vid), seat = m.seat === 1 ? 1 : 0;
  const no = why => send(p, { t: 'enterNo', vid: m.vid, msg: why });
  if (!v || v.wrecked) return no('Das Auto gibt es nicht mehr');
  if (p.vid) return no('Du sitzt schon in einem Auto');
  if (Math.hypot(v.x - p.x, v.z - p.z) > MP.ENTER_DIST + 2) return no('Zu weit weg');
  if (seat === 0) {
    if (v.driver) return no('Da sitzt schon jemand am Steuer');
    if (v.owned && v.owner !== p.id) return no(`Abgeschlossen: gehört ${(room.players.get(v.owner) || {}).name || 'jemand anderem'}`);
    v.driver = p.id;
    if (v.owner !== p.id) { v.owner = p.id; broadcast(room, { t: 'own', vid: v.vid, owner: p.id }); }
    p.mode = 1;
  } else {
    if (v.pass.size >= MP.SEATS - 1) return no('Kein Platz mehr frei');
    v.pass.add(p.id);
    p.mode = 2;
  }
  p.vid = v.vid; p.seat = seat;
  resetCredit(v);
  send(p, { t: 'enterOk', vid: v.vid, seat });
  broadcast(room, occMsg(v));
}

// ---------- Takt ----------
let tickN = 0;
function tick() {
  const t = now();
  tickN++;
  for (const room of rooms.values()) {
    const dt = MP.TICK_MS / 1000;
    // Uhr und Wetter je Lobby (1 Spielstunde = 1 Minute, Zeitraffer 2 Stunden pro Sekunde wie im Spiel)
    if (room.skip !== null) {
      const left = (room.skip - room.clock + 24) % 24, step = Math.min(left, dt * 2);
      room.clock = (room.clock + step) % 24;
      if (left - step < 1e-3) room.skip = null;
    } else room.clock = (room.clock + dt / 60) % 24;
    if ((room.nextWeather -= dt) <= 0) { room.weather = randomWeather(); room.nextWeather = 180 + Math.random() * 240; if (room.players.size) broadcast(room, skyMsg(room)); }
    if (!room.players.size) {
      if (!room.persistent && !single && t - room.emptySince > 120000) rooms.delete(room.code);
      continue;
    }
    if (tickN % 100 === 0) broadcast(room, skyMsg(room));
    // Aufräumen: Wracks nach 90 s, leere Autos nach 10 min
    if (tickN % 20 === 0) for (const v of [...room.vehicles.values()]) {
      if ((v.wrecked && t - v.wreckT > 90000) || (!v.driver && !v.pass.size && t - v.emptySince > 600000)) removeVehicle(room, v);
    }
    // Mitfahrer sitzen im Auto
    for (const p of room.players.values()) {
      if (p.strikes > 0 && t - p.lastStrike > 5000) { p.strikes--; p.lastStrike = t; }
      if (p.mode === 2) { const v = room.vehicles.get(p.vid); if (v) { p.x = v.x; p.y = v.y; p.z = v.z; } }
    }
    const full = tickN % 20 === 0;
    for (const c of room.players.values()) {
      if ((c.conn.backlog || 0) > 65536) continue; // Spieler hängt hinterher: lieber auslassen als stauen
      const pl = [], vl = [];
      for (const p of room.players.values()) {
        if (p === c || Math.abs(p.x - c.x) > MP.AOI || Math.abs(p.z - c.z) > MP.AOI) continue;
        if (full || p.ts > (c.sent.get(p.id) || -1)) { pl.push(encPlayer(p, t)); c.sent.set(p.id, p.ts); }
      }
      for (const v of room.vehicles.values()) {
        if (v.driver === c.id || Math.abs(v.x - c.x) > MP.AOI || Math.abs(v.z - c.z) > MP.AOI) continue;
        if (full || v.ts > (c.vsent.get(v.vid) || -1)) { vl.push(encVehicle(v, t)); c.vsent.set(v.vid, v.ts); }
      }
      if (pl.length || vl.length) c.conn.send(JSON.stringify({ t: 'snap', n: t, p: pl, v: vl }));
    }
    // grobe Orte aller Spieler für Karte und Spielerliste (1-mal pro Sekunde)
    if (full) broadcast(room, { t: 'map', p: [...room.players.values()].map(p => [p.id, Math.round(p.x), Math.round(p.z), p.mode, p.st, p.ping]) });
  }
  // stille Verbindungen schließen, die anderen anpingen
  if (tickN % 200 === 0) for (const c of [...conns]) {
    if (Date.now() - c.lastSeen > IDLE_KICK) c.close(4002, 'Zeitüberschreitung');
    else if (c.ping) c.ping();
  }
}

// ---------- Verbindungen (Transport von außen: WebSocket im Node-Server, WebRTC beim Gastgeber im Browser) ----------
// c: { send(text), close(code, reason), backlog, ping?(), lastSeen }
function accept(c) {
  conns.add(c);
  c.tokens = 120; c.tokT = now(); c.drops = 0; c.lastSeen = Date.now();
}
function message(c, raw) {
  c.lastSeen = Date.now();
  try { onMessage(c, raw); } catch (e) { console.error('[mp]', e); }
}
function closed(c) {
  if (!conns.has(c)) return;
  conns.delete(c);
  if (c.player) leave(c.player);
}
return { accept, message, closed, tick, roomList, get online() { return conns.size; }, rooms };
}


if (typeof module !== 'undefined' && module.exports) module.exports = createCore;
else root.MPCore = createCore;
})(typeof window !== 'undefined' ? window : globalThis);
