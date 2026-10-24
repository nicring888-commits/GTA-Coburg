// WebSocket (RFC 6455) ohne Abhängigkeiten: Handshake, Rahmen lesen und schreiben, Ping/Pong, Größenlimit.
// Nur das, was der Mehrspieler-Server braucht: Textnachrichten (JSON), keine Erweiterungen (keine Kompression).
'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WsConn extends EventEmitter {
  constructor(socket, maxMessage) {
    super();
    this.socket = socket;
    this.maxMessage = maxMessage;
    this.buf = Buffer.alloc(0);
    this.frags = null;          // Teile einer fragmentierten Nachricht
    this.open = true;
    this.lastSeen = Date.now();
    socket.setNoDelay(true);    // kleine Pakete sofort senden (Latenz)
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.finish(1006, 'Verbindung getrennt'));
    socket.on('error', () => this.finish(1006, 'Fehler'));
  }

  // wie viele Bytes noch im Sendepuffer liegen (für Gegendruck: Momentaufnahmen auslassen, statt zu stauen)
  get backlog() { return this.socket.writableLength; }

  onData(d) {
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > this.maxMessage * 2 + 16) return this.close(1009, 'Nachricht zu groß');
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (b[0] & 0x70) return this.close(1002, 'Erweiterungen nicht unterstützt');
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        if (b.readUInt32BE(2) !== 0) return this.close(1009, 'Nachricht zu groß');
        len = b.readUInt32BE(6); off = 10;
      }
      if (!masked) return this.close(1002, 'Client-Rahmen müssen maskiert sein');
      if (len > this.maxMessage) return this.close(1009, 'Nachricht zu groß');
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this.frame(fin, op, data);
    }
  }

  frame(fin, op, data) {
    if (op === 0x8) { this.close(1000, ''); return; }
    if (op === 0x9) { this.send(data, 0xA); return; }
    if (op === 0xA) return;
    if (op === 0x1 || op === 0x2) {
      if (this.frags) return this.close(1002, 'Unerwarteter Rahmen');
      if (fin) return this.message(data, op);
      this.frags = { op, parts: [data], size: data.length };
      return;
    }
    if (op === 0x0) {
      if (!this.frags) return this.close(1002, 'Unerwartete Fortsetzung');
      this.frags.parts.push(data); this.frags.size += data.length;
      if (this.frags.size > this.maxMessage) return this.close(1009, 'Nachricht zu groß');
      if (fin) { const f = this.frags; this.frags = null; this.message(Buffer.concat(f.parts), f.op); }
      return;
    }
    this.close(1002, 'Unbekannter Rahmen');
  }

  message(data, op) {
    if (op !== 0x1) return; // nur Text (JSON)
    this.emit('message', data.toString('utf8'));
  }

  send(data, op = 0x1) {
    if (!this.open) return false;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n])
      : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
        : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(n, 6); return h; })();
    this.socket.write(Buffer.concat([head, payload]));
    return true;
  }

  ping() { this.send(Buffer.alloc(0), 0x9); }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const r = Buffer.from(String(reason).slice(0, 100), 'utf8'), b = Buffer.alloc(2 + r.length);
    b.writeUInt16BE(code, 0); r.copy(b, 2);
    try { this.send(b, 0x8); } catch (e) { /* schon zu */ }
    this.finish(code, reason);
    setTimeout(() => this.socket.destroy(), 200);
  }

  finish(code, reason) {
    if (!this.open) return;
    this.open = false;
    this.emit('close', code, reason);
  }
}

// HTTP-Upgrade annehmen; gibt die Verbindung zurück oder null (dann ist der Socket schon beantwortet)
function accept(req, socket, maxMessage = 8192) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
  return new WsConn(socket, maxMessage);
}

module.exports = { accept, WsConn };
