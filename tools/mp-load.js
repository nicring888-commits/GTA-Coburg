// Lasttest: N Bots fahren bzw. laufen gleichzeitig um einen Punkt; misst Datenmenge und Abstand der Momentaufnahmen.
//   node tools/mp-load.js --n 12 --x -450 --z -510 --y -6.9 [--secs 20] [--url ws://127.0.0.1:8175/mp]
'use strict';

const MP = require('../mp/protocol');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 12), cx = +arg('x', 0), cz = +arg('z', 0), y = +arg('y', 0), secs = +arg('secs', 20);
const url = arg('url', 'ws://127.0.0.1:8175/mp'), code = arg('code', 'COBURG');
const stats = { bytes: 0, snaps: 0, gaps: [], fixes: 0, kicks: 0 };

for (let i = 0; i < N; i++) setTimeout(() => {
  const ws = new WebSocket(url), drive = i % 2 === 0, R = 10 + i * 3, sp = drive ? 12 : 3;
  let vid = 0, me = 0, ang = i, last = 0;
  const send = m => ws.readyState === 1 && ws.send(JSON.stringify(m));
  ws.onopen = () => send({ t: 'join', v: MP.PROTOCOL, name: 'Last' + i, code, x: cx + Math.cos(ang) * R, y, z: cz + Math.sin(ang) * R });
  ws.onmessage = e => {
    stats.bytes += e.data.length;
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { me = m.id; if (drive) send({ t: 'veh', ref: 1, kind: 'car', color: '#2e6fb7', x: cx + Math.cos(ang) * R, y, z: cz + Math.sin(ang) * R, h: 0 }); }
    else if (m.t === 'vehOk') vid = m.vid;
    else if (m.t === 'snap' && i === 1) { const t = Date.now(); if (last) stats.gaps.push(t - last); last = t; stats.snaps++; }
    else if (m.t === 'fix') stats.fixes++;
    else if (m.t === 'kick') stats.kicks++;
  };
  setInterval(() => {
    if (!me) return;
    ang += sp / R * 0.05;
    const x = cx + Math.cos(ang) * R, z = cz + Math.sin(ang) * R, h = Math.atan2(-Math.sin(ang), Math.cos(ang));
    if (drive && vid) send({ t: 's', m: 1, x, y, z, h, hp: 100, st: 0, f: 0, c: { x, y, z, h, pi: 0, ro: 0, se: 0.2, v: sp, hl: 100, f: 0 } });
    else send({ t: 's', m: 0, x, y, z, h, sp, hp: 100, st: 0, f: 0 });
  }, 50);
}, i * 120);

setTimeout(() => {
  const g = stats.gaps.sort((a, b) => a - b), q = p => g[Math.floor(g.length * p)] || 0;
  console.log(`${N} Bots, ${secs} s: ${(stats.bytes / secs / N / 1024).toFixed(1)} KB/s je Spieler empfangen, ` +
    `Momentaufnahmen alle ${q(0.5)} ms (95 %: ${q(0.95)} ms, max ${g[g.length - 1]} ms), Korrekturen ${stats.fixes}, Rauswürfe ${stats.kicks}`);
  process.exit(0);
}, secs * 1000 + N * 120);
