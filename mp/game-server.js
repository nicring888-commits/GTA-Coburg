// Mehrspieler-Server (Node): WebSocket-Anbindung und HTTP-Abfragen um den gemeinsamen Kern (mp/core.js).
'use strict';

const MP = require('./protocol');
const ws = require('./ws');
const core = require('./core')(MP);

const MAX_CONN = +process.env.MP_MAX_CONN || 256, MAX_PER_IP = +process.env.MP_MAX_PER_IP || 8;
const perIp = new Map();
let open = 0;

function attach(server) {
  const origins = (process.env.MP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== MP.PATH) { socket.destroy(); return; }
    if (origins.length && !origins.includes(req.headers.origin)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket.remoteAddress;
    if (open >= MAX_CONN || (perIp.get(ip) || 0) >= MAX_PER_IP) { socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return; }
    const c = ws.accept(req, socket, 8192);
    if (!c) return;
    open++; perIp.set(ip, (perIp.get(ip) || 0) + 1);
    core.accept(c);
    c.on('message', raw => core.message(c, raw));
    c.on('close', () => {
      open--;
      const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
      core.closed(c);
    });
  });
  setInterval(core.tick, MP.TICK_MS);
}

// HTTP-Abfragen für die Lobby-Liste
function handleHttp(req, res) {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/api/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ rooms: core.roomList(), max: MP.ROOM_MAX, protocol: MP.PROTOCOL, online: core.online }));
    return true;
  }
  if (p === '/api/health') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }); res.end('ok'); return true; }
  return false;
}

module.exports = { attach, handleHttp, _rooms: core.rooms };
