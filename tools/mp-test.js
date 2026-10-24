// Automatischer Test des Mehrspieler-Servers mit mehreren Verbindungen (Node 22+ hat WebSocket eingebaut).
//   node tools/mp-test.js [ws://127.0.0.1:8175/mp]
// Prüft: Lobby-Liste, Beitritt, Sichtbarkeit, Autos anmelden, Einsteigen/Mitfahren/Aussteigen, Besitzwechsel,
// abgeschlossene Garagenautos, Tempo- und Teleport-Prüfung (Zurücksetzen, Rauswurf), Chat, Wetter, Verlassen.
'use strict';

const URL_ = process.argv[2] || 'ws://127.0.0.1:8175/mp';
const MP = require('../mp/protocol');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) { passed++; console.log('  ✓ ' + what); } else { failed++; console.log('  ✗ ' + what); } };

class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.snaps = []; this.waiters = []; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(URL_);
      this.ws.onopen = () => res();
      this.ws.onerror = e => rej(e);
      this.ws.onclose = e => { this.closed = e.code; };
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.t === 'snap') this.snaps.push(m); else this.msgs.push(m);
        for (const w of this.waiters.slice()) if (w.f(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); }
      };
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(f, ms = 2000) {
    const hit = this.msgs.concat(this.snaps).find(f);
    if (hit) return Promise.resolve(hit);
    return new Promise(res => { const w = { f, res }; this.waiters.push(w); setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); res(null); } }, ms); });
  }
  clear() { this.msgs = []; this.snaps = []; }
  async join(extra) {
    await this.connect();
    this.send(Object.assign({ t: 'join', v: MP.PROTOCOL, name: this.name, x: 0, y: 0, z: 0 }, extra));
    const w = await this.wait(m => m.t === 'welcome' || m.t === 'error');
    if (w && w.t === 'welcome') { this.id = w.id; this.room = w.room; }
    return w;
  }
  state(x, z, extra = {}) { this.x = x; this.z = z; this.send(Object.assign({ t: 's', m: 0, x, y: 0, z, h: 0, sp: 0, hp: 100, st: 0, f: 0 }, extra)); }
  close() { this.ws.close(); }
}

(async () => {
  console.log('Mehrspieler-Test gegen ' + URL_);
  const res = await fetch(URL_.replace(/^ws/, 'http').replace(/\/mp$/, '/api/rooms')).then(r => r.json());
  ok(res.rooms.length >= 2 && res.protocol === MP.PROTOCOL, `Lobby-Liste per HTTP (${res.rooms.map(r => r.name).join(', ')})`);

  const a = new Bot('Anna'), b = new Bot('Ben'), c = new Bot('Cheater');
  const wa = await a.join({ create: { name: 'Testlobby', priv: true } });
  ok(wa && wa.t === 'welcome' && wa.room.priv, 'Anna erstellt private Lobby ' + (wa && wa.room.code));
  const wb = await b.join({ code: a.room.code.toLowerCase() });
  ok(wb && wb.t === 'welcome' && wb.players.some(p => p.name === 'Anna'), 'Ben tritt per Code bei und sieht Anna');
  ok(await a.wait(m => m.t === 'pjoin' && m.p.name === 'Ben'), 'Anna bekommt Bens Beitritt');
  const bad = new Bot('X');
  const we = await bad.join({ code: 'NOPE1' });
  ok(we && we.t === 'error', 'Falscher Code wird abgelehnt'); bad.close();
  const dup = new Bot('anna');
  const wd = await dup.join({ code: a.room.code });
  ok(wd && wd.name === 'anna 2', 'Doppelter Name wird nummeriert (' + (wd && wd.name) + ')'); dup.close();

  // Bewegung und Momentaufnahmen
  for (let i = 0; i < 10; i++) { a.state(i * 0.4, 0); b.state(5, 5); await sleep(50); }
  const snap = await b.wait(m => m.t === 'snap' && m.p.some(p => p[0] === a.id && p[1] > 2));
  ok(snap, 'Ben sieht Annas Bewegung in der Momentaufnahme');

  // Auto anmelden und fahren
  a.send({ t: 'veh', ref: 1, kind: 'sport', color: '#d61f1f', x: 4, y: 0, z: 1, h: 0, hl: 100 });
  const vo = await a.wait(m => m.t === 'vehOk');
  ok(vo && vo.vid, 'Anna meldet ihr Auto an (vid ' + (vo && vo.vid) + ')');
  ok(await b.wait(m => m.t === 'vnew' && m.v.vid === vo.vid && m.v.driver === a.id), 'Ben sieht das neue Auto mit Anna am Steuer');
  // Ben steigt als Mitfahrer ein
  b.state(5, 2); await sleep(60);
  b.send({ t: 'enter', vid: vo.vid, seat: 0 });
  ok(await b.wait(m => m.t === 'enterNo'), 'Fahrersitz besetzt: Ben wird abgelehnt');
  b.send({ t: 'enter', vid: vo.vid, seat: 1 });
  ok(await b.wait(m => m.t === 'enterOk' && m.seat === 1), 'Ben fährt als Mitfahrer mit');
  ok(await a.wait(m => m.t === 'occ' && m.p.includes(b.id)), 'Anna sieht Ben als Mitfahrer');
  // Anna fährt 40 m/s Richtung Norden
  let x = 4;
  for (let i = 0; i < 20; i++) { x += 40 * 0.05; a.send({ t: 's', m: 1, x, y: 0, z: 1, h: 0, hp: 100, st: 0, f: 0, c: { x, y: 0, z: 1, h: 0, pi: 0, ro: 0, se: 0, v: 40, hl: 100, f: 0 } }); b.send({ t: 's', m: 2, x: 0, y: 0, z: 0, h: 0, hp: 100 }); await sleep(50); }
  await sleep(150);
  b.clear();
  await sleep(1100);
  const mp = await b.wait(m => m.t === 'map');
  const bpos = mp && mp.p.find(p => p[0] === b.id);
  ok(bpos && Math.abs(bpos[1] - x) < 3, `Mitfahrer Ben wird mit dem Auto bewegt (x ≈ ${bpos && bpos[1]})`);
  ok(!a.msgs.some(m => m.t === 'fix'), 'Normales Fahrtempo wird angenommen');
  // Tempo-Schummeln: 400 m in einem Schritt
  a.send({ t: 's', m: 1, x: x + 400, y: 0, z: 1, h: 0, hp: 100, c: { x: x + 400, y: 0, z: 1, h: 0, v: 40, hl: 100 } });
  const fix = await a.wait(m => m.t === 'fix');
  ok(fix && Math.abs(fix.x - x) < 1, 'Sprung um 400 m wird verworfen, Anna wird zurückgesetzt');
  // Anna steigt aus, Ben steigt aus, Ben übernimmt das Auto
  a.send({ t: 'exit' }); await sleep(50);
  b.send({ t: 'exit' }); await sleep(50);
  b.send({ t: 'enter', vid: vo.vid, seat: 0 });
  ok(await b.wait(m => m.t === 'enterOk' && m.seat === 0), 'Ben setzt sich ans Steuer des leeren Autos');
  ok(await a.wait(m => m.t === 'own' && m.owner === b.id), 'Besitz geht an Ben über (Anna bekommt "own")');
  b.send({ t: 'exit' });

  // Garagenauto ist abgeschlossen
  a.state(x + 1, 3); await sleep(60);
  a.send({ t: 'veh', ref: 2, kind: 'suv', color: '#222428', x: x + 2, y: 0, z: 3, h: 0, owned: true });
  const vo2 = await a.wait(m => m.t === 'vehOk' && m.ref === 2);
  a.send({ t: 'exit' }); await sleep(50);
  b.state(x + 1, 4); await sleep(60);
  b.send({ t: 'enter', vid: vo2.vid, seat: 0 });
  const lock = await b.wait(m => m.t === 'enterNo' && m.vid === vo2.vid);
  ok(lock && /Abgeschlossen/.test(lock.msg), 'Annas Garagenauto ist für Ben abgeschlossen: ' + (lock && lock.msg));
  b.send({ t: 'enter', vid: vo2.vid, seat: 1 });
  ok(await b.wait(m => m.t === 'enterOk' && m.vid === vo2.vid), 'Mitfahren im Garagenauto geht');
  b.send({ t: 'exit' });

  // Explosion
  a.send({ t: 'boom', vid: vo2.vid });
  ok(await b.wait(m => m.t === 'boom' && m.vid === vo2.vid), 'Explosion wird an alle verteilt');

  // Chat, Wetter
  a.send({ t: 'chat', text: 'Hallo <b>Ben</b>!' });
  const ch = await b.wait(m => m.t === 'chat');
  ok(ch && ch.text === 'Hallo bBen/b!', 'Chat kommt an, HTML-Zeichen entfernt: ' + (ch && ch.text));
  a.send({ t: 'sky', a: 'weather' });
  const sk = await b.wait(m => m.t === 'sky' && m.w === 'cloudy');
  ok(sk, 'Wetterwechsel gilt für die ganze Lobby');

  // Lauftempo-Schummeln bis zum Rauswurf
  const wc = await c.join({ code: a.room.code });
  ok(wc && wc.t === 'welcome', 'Cheater tritt bei');
  let cx = 0, fixes = 0;
  for (let i = 0; i < 12 && !c.closed; i++) { cx += 80; c.state(cx, 0); await sleep(60); }
  fixes = c.msgs.filter(m => m.t === 'fix').length;
  const kicked = await c.wait(m => m.t === 'kick', 1500);
  ok(fixes >= 3 && kicked, `Speedhack: ${fixes}× zurückgesetzt, dann entfernt („${kicked && kicked.msg}")`);
  ok(await a.wait(m => m.t === 'pleave' && m.id === c.id), 'Andere sehen, dass der Cheater weg ist');

  // Nachrichtenflut
  const f = new Bot('Flut');
  await f.join({ code: a.room.code });
  for (let i = 0; i < 1500; i++) f.send({ t: 'ping', c: i });
  await sleep(800);
  ok(f.closed === 4001 || f.msgs.filter(m => m.t === 'pong').length < 600, 'Nachrichtenflut wird gebremst (' + f.msgs.filter(m => m.t === 'pong').length + ' Antworten)');

  // Verlassen: Bens Auto verschwindet
  b.close();
  ok(await a.wait(m => m.t === 'vdel' && m.vid === vo.vid), 'Ben verlässt das Spiel: sein Auto verschwindet bei Anna');
  a.close(); try { f.close(); } catch (e) { /* zu */ }
  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
