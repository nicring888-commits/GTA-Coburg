// Webserver ohne Abhängigkeiten: liefert das Spiel aus und betreibt den Mehrspieler-Server (WebSocket unter /mp).
//   node server.js          -> http://127.0.0.1:8175 (nur dieser Rechner)
//   node server.js --lan    -> auch für andere Geräte im Heimnetz (Adresse steht in der Konsole)
//   node server.js --public -> Hosting (z. B. Render, Port aus PORT): lauscht auf allen Adressen
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mp = require('./mp/game-server');

const PORT = process.env.PORT || 8175;
const HOST = process.env.HOST || (process.argv.includes('--lan') || process.argv.includes('--public') ? '0.0.0.0' : '127.0.0.1');
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  if (mp.handleHttp(req, res)) return;
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || file.includes(path.sep + 'tools' + path.sep) || file.includes(path.sep + 'raw' + path.sep)
    || file.includes(path.sep + '.git')) {
    res.writeHead(403); return res.end('Verboten');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
mp.attach(server);
server.listen(PORT, HOST, () => {
  console.log(`GTA Coburg läuft auf http://127.0.0.1:${PORT} (Mehrspieler: ws://…:${PORT}/mp)`);
  if (HOST === '0.0.0.0') {
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  im Heimnetz: http://${a.address}:${PORT}`);
    }
  }
});
