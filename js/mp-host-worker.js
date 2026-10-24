// Gastgeber einer Peer-to-Peer-Lobby: Der Mehrspieler-Kern (mp/core.js) läuft hier in einem eigenen Thread, damit er
// auch dann 20-mal pro Sekunde taktet, wenn der Tab des Gastgebers im Hintergrund liegt (dort bremst der Browser
// die Zeitgeber der Seite auf 1 pro Sekunde). js/net-p2p.js reicht die WebRTC-Nachrichten durch.
'use strict';

importScripts('../mp/protocol.js', '../mp/core.js');

let core = null;
const conns = new Map();

onmessage = e => {
  const m = e.data;
  if (m.k === 'init') {
    core = MPCore(MP, { single: true, rooms: [{ code: m.code, name: m.name }] });
    setInterval(core.tick, MP.TICK_MS);
  } else if (m.k === 'open') {
    const c = {
      id: m.id, backlog: 0,
      send(d) { postMessage({ k: 'send', id: this.id, d }); },
      close(code, reason) { if (!conns.has(this.id)) return; conns.delete(this.id); postMessage({ k: 'close', id: this.id, code, reason }); core.closed(this); },
    };
    conns.set(m.id, c);
    core.accept(c);
  } else if (m.k === 'msg') {
    const c = conns.get(m.id);
    if (c) core.message(c, m.d);
  } else if (m.k === 'close') {
    const c = conns.get(m.id);
    if (c) { conns.delete(m.id); core.closed(c); }
  }
};
