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
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };

// Messläufe (js/bench.js, seit v3.18.0): Bilder und Messwerte nach bench/shots/<lauf>/ speichern und auflisten.
// Nur ohne --public und nur von diesem Rechner aus.
const BENCH = path.join(__dirname, 'bench', 'shots');
const benchName = s => /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(s || '') && !s.includes('..') ? s : null;
function handleBench(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/bench')) return false;
  const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
  if (process.argv.includes('--public') || !local) { res.writeHead(403); res.end(); return true; }
  if (url.pathname === '/api/bench-list') {
    const out = {};
    try {
      for (const d of fs.readdirSync(BENCH, { withFileTypes: true })) if (d.isDirectory()) out[d.name] = fs.readdirSync(path.join(BENCH, d.name)).sort();
    } catch (e) { /* noch keine Läufe */ }
    res.writeHead(200, { 'Content-Type': TYPES['.json'] }); res.end(JSON.stringify(out));
    return true;
  }
  const label = benchName(url.searchParams.get('label')), file = benchName(url.searchParams.get('file'));
  if (url.pathname !== '/api/bench-save' || req.method !== 'POST' || !label || !file || !/\.(png|jpg|json|glb)$/.test(file)) {
    res.writeHead(400); res.end(); return true;
  }
  const parts = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 30e6) req.destroy(); else parts.push(c); });
  req.on('end', () => {
    const dir = path.join(BENCH, label);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFile(path.join(dir, file), Buffer.concat(parts), err => { res.writeHead(err ? 500 : 200); res.end(); });
  });
  return true;
}

const server = http.createServer((req, res) => {
  if (mp.handleHttp(req, res)) return;
  if (handleBench(req, res)) return;
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
