// Mehrspieler ohne eigenen Server (z. B. auf Vercel oder GitHub Pages): Peer-to-Peer über WebRTC (PeerJS).
// Jede Lobby hat eine feste Peer-Kennung („gtcoburg-v1-CODE“). Wer beitritt, verbindet sich mit ihr; ist sie frei,
// wird man selbst Gastgeber: Der Mehrspieler-Kern läuft dann im eigenen Browser (js/mp-host-worker.js) und prüft
// alle wie der Node-Server. Geht der Gastgeber, verbinden sich die anderen neu und einer von ihnen übernimmt.
// Den Verbindungsaufbau vermittelt der kostenlose PeerJS-Dienst (0.peerjs.com, mit STUN/TURN), die Spieldaten
// laufen direkt zwischen den Browsern. P2PSocket verhält sich wie ein WebSocket, deshalb merkt js/net.js kaum etwas.
'use strict';

const P2P_PREFIX = 'gtcoburg-v' + MP.PROTOCOL + '-';
const P2P_ROOMS = [{ code: 'COBURG', name: 'Coburg Altstadt' }, { code: 'LANDKR', name: 'Landkreis-Tour' }];

const P2P = {
  _peer: null, _peerP: null,
  available: () => typeof window.Peer === 'function',

  // eigener Peer (zufällige Kennung) für Verbindungen zu Gastgebern, wird wiederverwendet
  client() {
    const p = this._peer;
    if (p && !p.destroyed && p.open) return Promise.resolve(p);
    if (this._peerP) return this._peerP;
    this._peerP = new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      const t = setTimeout(() => { reject(new Error('Vermittlungsdienst (PeerJS) antwortet nicht')); peer.destroy(); }, 10000);
      peer.on('open', () => { clearTimeout(t); this._peer = peer; resolve(peer); });
      peer.on('disconnected', () => { if (!peer.destroyed) try { peer.reconnect(); } catch (e) { /* neu beim nächsten Mal */ } });
      peer.on('error', err => { if (!peer.open) { clearTimeout(t); reject(new Error('Vermittlungsdienst: ' + err.type)); } });
    }).finally(() => { this._peerP = null; });
    return this._peerP;
  },

  // Verbindung zum Gastgeber einer Lobby; null, wenn es (noch) keinen gibt
  async dial(code, ms = 6000) {
    const peer = await this.client(), id = P2P_PREFIX + code;
    return new Promise(resolve => {
      const dc = peer.connect(id, { reliable: true, serialization: 'raw' });
      let done = false;
      const finish = v => { if (done) return; done = true; clearTimeout(t); peer.off('error', onErr); if (!v) try { dc.close(); } catch (e) { /* zu */ } resolve(v); };
      const onErr = err => { if (err.type === 'peer-unavailable' && String(err.message).includes(id)) finish(null); };
      const t = setTimeout(() => finish(null), ms);
      peer.on('error', onErr);
      dc.on('open', () => finish(dc));
      dc.on('error', () => finish(null));
    });
  },

  // Belegung einer Lobby abfragen (für die Lobby-Liste)
  async query(code) {
    const dc = await this.dial(code, 4000);
    if (!dc) return null;
    return new Promise(resolve => {
      const t = setTimeout(() => { resolve(null); dc.close(); }, 3000);
      dc.on('data', d => {
        try { const m = JSON.parse(d); if (m.t === 'rooms') { clearTimeout(t); resolve(m.rooms[0] || null); dc.close(); } } catch (e) { /* weiter warten */ }
      });
      dc.send(JSON.stringify({ t: 'list' }));
    });
  },

  async listRooms() {
    const res = await Promise.all(P2P_ROOMS.map(r => this.query(r.code).catch(() => null)));
    const rooms = P2P_ROOMS.map((r, i) => ({ code: r.code, name: r.name, n: res[i] ? res[i].n : 0, max: MP.ROOM_MAX }));
    return { rooms, max: MP.ROOM_MAX, protocol: MP.PROTOCOL, online: rooms.reduce((s, r) => s + r.n, 0), p2p: true };
  },

  newCode() { const C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 5 }, () => C[Math.floor(Math.random() * C.length)]).join(''); },
};

class P2PSocket {
  constructor(code) {
    this.code = String(code || 'COBURG').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'COBURG';
    this.readyState = 0;
    this.isHost = false;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this.start();
  }

  async start() {
    try {
      if (!P2P.available()) throw new Error('PeerJS konnte nicht geladen werden (Internetverbindung?)');
      // erst beitreten, sonst Gastgeber werden; gleichzeitige Versuche klärt der Vermittlungsdienst (Kennung nur einmal)
      for (let i = 0; i < 4 && this.readyState === 0; i++) {
        const dc = await P2P.dial(this.code);
        if (this.readyState !== 0) { if (dc) dc.close(); return; }
        if (dc) return this.asClient(dc);
        if (await this.tryHost()) return;
        await new Promise(r => setTimeout(r, 400 + Math.random() * 900));
      }
      if (this.readyState === 0) this.fail('Lobby nicht erreichbar');
    } catch (e) { this.fail(e.message); }
  }

  asClient(dc) {
    this.dc = dc;
    dc.on('data', d => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: d }); });
    dc.on('close', () => this.ended(1006, 'Gastgeber weg'));
    dc.on('error', () => this.ended(1006, 'Verbindungsfehler'));
    this.opened();
  }

  tryHost() {
    return new Promise(resolve => {
      const peer = new Peer(P2P_PREFIX + this.code, { debug: 0 });
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; peer.destroy(); resolve(false); } }, 10000);
      peer.on('error', err => {
        if (!settled) { settled = true; clearTimeout(t); peer.destroy(); resolve(false); }  // z. B. unavailable-id: jemand war schneller
        else if (err.type === 'network' || err.type === 'server-error') { /* Vermittlung kurz weg; bestehende Verbindungen laufen weiter */ }
      });
      peer.on('disconnected', () => { if (!peer.destroyed) try { peer.reconnect(); } catch (e) { /* weiter ohne neue Beitritte */ } });
      peer.on('open', () => {
        if (settled || this.readyState !== 0) { peer.destroy(); resolve(false); return; }
        settled = true; clearTimeout(t);
        this.becomeHost(peer);
        resolve(true);
      });
    });
  }

  becomeHost(peer) {
    this.isHost = true;
    this.peer = peer;
    this.links = new Map();  // Nummer → DataConnection
    let seq = 0;
    const known = P2P_ROOMS.find(r => r.code === this.code);
    const w = this.worker = new Worker('js/mp-host-worker.js');
    w.postMessage({ k: 'init', code: this.code, name: known ? known.name : 'Lobby ' + this.code });
    w.onmessage = e => {
      const m = e.data;
      if (m.k === 'send') {
        if (m.id === 0) { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: m.d }); return; }
        const dc = this.links.get(m.id);
        if (!dc || !dc.open) return;
        // langsame Verbindung: Momentaufnahmen auslassen statt stauen (die nächste kommt in 50 ms)
        const buffered = dc.dataChannel ? dc.dataChannel.bufferedAmount : 0;
        if (buffered > 262144 && m.d.startsWith('{"t":"snap"')) return;
        try { dc.send(m.d); } catch (err) { /* Verbindung bricht gerade ab */ }
      } else if (m.k === 'close') {
        if (m.id === 0) { this.ended(m.code || 4000, m.reason || ''); return; }
        const dc = this.links.get(m.id);
        this.links.delete(m.id);
        if (dc) setTimeout(() => dc.close(), 300); // Rauswurf-Nachricht noch zustellen
      }
    };
    w.onerror = () => this.ended(1011, 'Gastgeber-Fehler');
    peer.on('connection', dc => {
      const id = ++seq;
      dc.on('open', () => { this.links.set(id, dc); w.postMessage({ k: 'open', id }); });
      dc.on('data', d => { if (typeof d === 'string' && d.length <= 8192) w.postMessage({ k: 'msg', id, d }); });
      const gone = () => { if (this.links.delete(id)) w.postMessage({ k: 'close', id }); };
      dc.on('close', gone);
      dc.on('error', gone);
    });
    w.postMessage({ k: 'open', id: 0 }); // das eigene Spiel ist Spieler Nummer 0
    this.opened();
  }

  opened() {
    this.readyState = 1;
    if (this.onopen) this.onopen({});
  }

  send(d) {
    if (this.readyState !== 1) return;
    if (this.isHost) this.worker.postMessage({ k: 'msg', id: 0, d });
    else try { this.dc.send(d); } catch (e) { this.ended(1006, 'Verbindungsfehler'); }
  }

  close(code = 1000, reason = '') { this.ended(code, reason); }

  fail(msg) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    if (this.onerror) this.onerror({ message: msg });
    if (this.onclose) this.onclose({ code: 1006, reason: msg });
  }

  ended(code, reason) {
    if (this.readyState === 3) return;
    const was = this.readyState;
    this.readyState = 3;
    if (this.isHost) {
      // Lobby freigeben: die anderen merken das und einer von ihnen wird neuer Gastgeber
      if (this.worker) this.worker.terminate();
      for (const dc of this.links.values()) try { dc.close(); } catch (e) { /* zu */ }
      if (this.peer) this.peer.destroy();
    } else if (this.dc) try { this.dc.close(); } catch (e) { /* zu */ }
    if (was !== 0 && this.onclose) this.onclose({ code, reason });
  }
}

// beim Schließen des Tabs die Lobby-Kennung sofort freigeben, damit ein anderer übernehmen kann
addEventListener('pagehide', () => {
  try { if (P2P._peer) P2P._peer.destroy(); } catch (e) { /* zu */ }
  try { if (window.game && window.game.net && window.game.net.ws && window.game.net.ws.isHost) window.game.net.ws.close(1001, 'Tab geschlossen'); } catch (e) { /* zu */ }
});
