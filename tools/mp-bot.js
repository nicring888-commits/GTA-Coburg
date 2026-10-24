// Test-Mitspieler für den Mehrspieler-Modus: tritt einer Lobby bei und läuft oder fährt im Kreis.
//   node tools/mp-bot.js --x 123 --z -456 [--name Bot] [--code COBURG] [--drive] [--kind sport] [--r 18] [--url ws://127.0.0.1:8175/mp]
// Mit --drive meldet er ein Auto an und fährt einen Kreis (Mitfahren mit E ausprobieren); antwortet im Chat.
'use strict';

const MP = require('../mp/protocol');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);
const url = arg('url', 'ws://127.0.0.1:8175/mp');
const cx = +arg('x', 0), cz = +arg('z', 0), cy = +arg('y', 0), R = +arg('r', 18);
const name = arg('name', 'Bot'), code = arg('code', 'COBURG'), drive = has('drive'), kind = arg('kind', 'sport');
const speed = drive ? +arg('speed', 9) : 3.2;

const ws = new WebSocket(url);
let me = 0, vid = 0, ang = 0, t0 = Date.now(), y = cy;
const send = m => ws.readyState === 1 && ws.send(JSON.stringify(m));
ws.onopen = () => send({ t: 'join', v: MP.PROTOCOL, name, code, x: cx + R, y, z: cz, look: { shirt: '#19b34a', pants: '#333344' } });
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.t === 'welcome') {
    me = m.id;
    console.log(`${m.name} in ${m.room.name} (${m.room.code}), ${m.players.length} andere`);
    if (drive) send({ t: 'veh', ref: 1, kind, color: '#ff6a00', x: cx + R, y, z: cz, h: 0, hl: 100 });
    send({ t: 'chat', text: drive ? 'Ich drehe Runden, steig ein (E)!' : 'Hallo aus dem Testbot!' });
  } else if (m.t === 'vehOk') { vid = m.vid; console.log('Auto', vid); }
  else if (m.t === 'occ' && m.vid === vid && m.p.length) send({ t: 'chat', text: 'Willkommen an Bord!' });
  else if (m.t === 'chat' && m.id !== me) { console.log('Chat:', m.text); if (/bot/i.test(m.text)) send({ t: 'chat', text: 'Bot hier, alles klar!' }); }
  else if (m.t === 'fix') console.log('Server-Korrektur', m);
  else if (m.t === 'error' || m.t === 'kick') { console.log(m.msg); process.exit(1); }
  else if (m.t === 'snap' && has('verbose')) console.log('snap', m.p.length, m.v.length);
};
ws.onclose = e => { console.log('getrennt', e.code, e.reason); process.exit(0); };

setInterval(() => {
  if (!me) return;
  const dt = 0.05;
  ang += speed / R * dt;
  const x = cx + Math.cos(ang) * R, z = cz + Math.sin(ang) * R;
  // Fahrtrichtung entlang des Kreises (heading: atan2(dx, dz))
  const h = Math.atan2(-Math.sin(ang), Math.cos(ang));
  if (drive && vid) send({ t: 's', m: 1, x, y, z, h, hp: 100, st: 0, f: 0, c: { x, y, z, h, pi: 0, ro: 0, se: 0.3, v: speed, hl: 100, f: (Date.now() - t0) % 8000 < 600 ? 2 : 0 } });
  else send({ t: 's', m: 0, x, y, z, h, sp: speed, hp: 100, st: 0, f: 0 });
}, 50);
