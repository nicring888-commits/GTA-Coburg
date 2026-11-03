// Verkehrsregelung (seit v3.14.0, Rest von Grafik-Phase 9): Ampeln an den OSM-Ampeln mit Schaltung je Kreuzung, Masten mit
// leuchtenden Lichtern, Regeln je Kreuzungsarm (Haltlinie, Wartelinie, Haifischzähne, Fahrbahnpfeile) und Haltepunkte auf den
// Kanten für den KI-Verkehr (Ampel, Stopp, Vorfahrt achten, Zebrastreifen). Gehört zu js/region.js (region.control).
'use strict';

// Umlauf einer Kreuzung: Gruppe 0 grün, gelb, alles rot, dann Gruppe 1; Fußgängerampel: lange grün für die Straße
const SIGNAL = { green: 13, yellow: 2.5, allRed: 1.5, redYellow: 1, pedCycle: 40, pedRed: 9, near: 32, lightDist: 420, tick: 0.15 };

class TrafficControl {
  constructor(region) {
    this.R = region;
    this.sets = [];          // Lichter je Kachel bzw. Innenstadt: { meshes, heads, x, z, t }
    this._t = 0;
    this._rules = new Map();
    this._stops = null;
  }
  get W() { return this.R.world; }

  // ---------------- Ampeln ----------------
  // einmalig: Knoten mit mindestens drei Straßen ins Raster; OSM-Ampeln und Fußgängerfurten bis 32 m davon machen den Knoten
  // zur Ampelkreuzung, die übrigen werden Fußgängerampeln auf der Strecke (nahe beieinander liegende zusammengefasst)
  init() {
    if (this.signals) return;
    const R = this.R, G = R.graph, nodes = new U.Grid(80);
    for (let nd = 0; nd < G.nodes.length / 2; nd++) if (R.nodeEdges(nd).length >= 3) nodes.insert(nd, G.nodes[nd * 2], G.nodes[nd * 2 + 1], G.nodes[nd * 2], G.nodes[nd * 2 + 1]);
    this.signals = new Map();     // Knoten -> Ampel
    this.peds = [];               // Fußgängerampeln
    const N = window.COBURG_ROADNODES, q = [], loose = [];
    if (N) for (let i = 0; i < N.n.length; i += 3) {
      const k = N.n[i + 2];
      if (k !== 1 && k !== 2) continue;
      const x = N.n[i] / 10, z = N.n[i + 1] / 10;
      let best = -1, bd = SIGNAL.near;
      for (const nd of nodes.query(x, z, SIGNAL.near, q)) { const d = Math.hypot(G.nodes[nd * 2] - x, G.nodes[nd * 2 + 1] - z); if (d < bd) { bd = d; best = nd; } }
      if (best >= 0) { if (!this.signals.has(best)) this.signals.set(best, this.makeSignal(G.nodes[best * 2], G.nodes[best * 2 + 1], false)); }
      else loose.push({ x, z, k });
    }
    // Fußgängerampeln: Furt bevorzugt (dort liegen die Markierungen), Ampelknoten bis 15 m daneben gehören dazu
    loose.sort((a, b) => a.k - b.k);
    const taken = [];
    for (const p of loose) {
      if (taken.some(o => Math.hypot(o.x - p.x, o.z - p.z) < 15)) continue;
      taken.push(p);
      const c = R.crossingAt(p.x, p.z);
      if (!c) continue;
      const sig = this.makeSignal(c.x, c.z, true);
      Object.assign(sig, { ei: c.ei, s: c.s, tx: c.tx, tz: c.tz, half: c.half, oneway: c.oneway });
      this.peds.push(sig);
    }
  }
  makeSignal(x, z, ped) {
    // feste Verschiebung je Ort, damit nicht alle Ampeln im Gleichtakt schalten
    return { x, z, ped, off: (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453) % 60 };
  }
  // Zustand einer Ampel für Gruppe g zur Zeit now: 0 rot, 1 rot-gelb, 2 grün, 3 gelb
  state(sig, g, now = performance.now() / 1000) {
    const S = SIGNAL;
    if (sig.ped) {
      const t = (now + sig.off) % S.pedCycle, red0 = S.pedCycle - S.pedRed - S.redYellow;
      if (g === 1) return t >= red0 + S.allRed && t < S.pedCycle - S.redYellow - S.allRed ? 2 : 0; // Fußgänger
      return t < red0 - S.yellow ? 2 : t < red0 ? 3 : t < S.pedCycle - S.redYellow ? 0 : 1;
    }
    const half = S.green + S.yellow + S.allRed + S.redYellow, t = (now + sig.off) % (2 * half), u = g ? (t + half) % (2 * half) : t;
    // u: 0 … grün … gelb … rot (bis 2·half), am Ende rot-gelb
    return u < S.green ? 2 : u < S.green + S.yellow ? 3 : u < 2 * half - S.redYellow ? 0 : 1;
  }

  // ---------------- Regeln je Kreuzung ----------------
  // Arme eines Knotens: mit Kreuzungsfläche die von region.junction, sonst (Innenstadt, Brücken) einfache Arme mit einer
  // Rücknahme aus den Nachbarbreiten
  arms(nd) {
    const R = this.R, J = R.junction(nd);
    if (J) return J.arms;
    const x = R.graph.nodes[nd * 2], z = R.graph.nodes[nd * 2 + 1], out = [];
    for (const ei of R.nodeEdges(nd)) {
      const e = R.graph.edges[ei];
      for (const atA of [true, false]) {
        if ((atA ? e.a : e.b) !== nd) continue;
        const p = e.p, n = p.length / 2, P = i => atA ? [p[i * 2], p[i * 2 + 1]] : [p[(n - 1 - i) * 2], p[(n - 1 - i) * 2 + 1]];
        const len = R.edgeCum(e)[n - 1], q = R.alongEnd(P, n, Math.min(6, len / 2)), dl = Math.hypot(q[0] - x, q[1] - z) || 1;
        out.push({ ei, e, atA, P, n, len, half: e.w / 2, dx: (q[0] - x) / dl, dz: (q[1] - z) / dl });
      }
    }
    for (const a of out) {
      let w = 0;
      for (const o of out) if (o !== a) w = Math.max(w, o.half);
      a.d = Math.min(w + 2.5, a.len / 2);
      const [px, pz, tx, tz] = R.alongEnd(a.P, a.n, a.d, true);
      a.px = px; a.pz = pz; a.tx = tx; a.tz = tz;
    }
    return out;
  }
  // je Arm: line ('stop' | 'give' | null) für den ankommenden Verkehr, Ampelgruppe, Haifischzähne, Fahrbahnpfeile
  // (Richtungen: s geradeaus, l links, r rechts). Ampeln gelten auch in der Innenstadt, alles andere nur an Kreuzungsflächen
  rules(nd) {
    if (this._rules.has(nd)) return this._rules.get(nd);
    this.init();
    const R = this.R, sig = this.signals.get(nd) || null, J = R.junction(nd);
    let out = null;
    if (sig || J) {
      const arms = this.arms(nd), x = R.graph.nodes[nd * 2], z = R.graph.nodes[nd * 2 + 1];
      const near = R.roadNodesNear(x, z, SIGNAL.near), mini = near.some(q => q.k === 5 && Math.hypot(q.x - x, q.z - z) < 10);
      const ranks = arms.map(a => R.roadRank(a.e.h)), top = Math.max(...ranks), nTop = ranks.filter(r => r === top).length;
      const a0 = arms[0];
      out = { nd, x, z, sig, arms: arms.map((a, i) => {
        // Einbahnstraße, die von der Kreuzung wegführt: kein ankommender Verkehr
        const r = { a, line: null, sign: false, incoming: !(a.e.o && a.atA), group: 0, teeth: false, arrows: null };
        if (sig) {
          r.line = 'stop';
          // Gruppe 0: Arme parallel oder gegenüber dem ersten, Gruppe 1: quer dazu
          const c = a.dx * a0.dx + a.dz * a0.dz;
          r.group = c * c > 0.5 ? 0 : 1;
        } else {
          // Schild an diesem Arm: vor der Kreuzung (vorwärts entlang des Arms) und höchstens 4 m neben der Fahrbahnmitte
          for (const q of near) {
            if (q.k !== 3 && q.k !== 4) continue;
            const dx = q.x - x, dz = q.z - z, along = dx * a.dx + dz * a.dz, across = Math.abs(dx * a.dz - dz * a.dx);
            if (along > 0 && across < a.half + 4) { r.line = q.k === 3 ? 'stop' : 'give'; r.sign = true; }
          }
          if (!r.line && nTop >= 2 && ranks[i] < top && ranks[i] > 0) r.line = 'give';
          if (!r.line && mini) r.line = 'give';
          // Haifischzähne: am Mini-Kreisel und dort, wo ein Schild die Wartepflicht vor einer Hauptstraße anordnet
          r.teeth = r.line === 'give' && !!J && (mini || (r.sign && top >= 4));
        }
        // Querung (Zebrastreifen, Furt) am Arm bis 30 m: an der Ampel hält der Verkehr vor ihrer Haltlinie (4,1 m vor der
        // Mitte), Pfeile liegen dahinter. hold: Abstand der Linie vom Knoten, clear: ab da ist die Spur frei für Pfeile
        r.hold = a.d + 0.9; r.clear = r.hold;
        for (const q of near) {
          if (q.k > 1) continue;
          const c = R.crossingAt(q.x, q.z);
          if (!c || c.ei !== a.ei) continue;
          const dn = a.atA ? c.s : a.len - c.s;
          if (dn > 30) continue;
          r.clear = Math.max(r.clear, dn + 4.1);
          if (sig) r.hold = Math.max(r.hold, dn + 4.1);
        }
        return r;
      }) };
      // Fahrbahnpfeile: an Ampelkreuzungen und an Armen großer Straßen (nur mit Kreuzungsfläche und langem, breitem Arm),
      // Spitze 5 m hinter der letzten Linie
      if (J) for (const r of out.arms) {
        const a = r.a, lane = a.e.o ? a.half * 2 : a.half;
        if (!r.incoming || lane < 2.8 || a.len < r.clear + a.d + 14 || !(sig || R.roadRank(a.e.h) >= 4)) continue;
        r.arrowS = r.clear - a.d + 5;
        const ux = -a.dx, uz = -a.dz, dirs = { s: false, l: false, r: false };
        for (const o of out.arms) {
          if (o === r || (o.a.e.o && !o.a.atA)) continue; // Einbahnstraße zur Kreuzung hin: nicht hinein
          const fwd = o.a.dx * ux + o.a.dz * uz, right = o.a.dx * -uz + o.a.dz * ux;
          if (fwd > 0.7) dirs.s = true; else if (right > 0.4) dirs.r = true; else if (right < -0.4) dirs.l = true;
        }
        if (dirs.s || dirs.l || dirs.r) r.arrows = dirs;
      }
    }
    this._rules.set(nd, out);
    return out;
  }

  // ---------------- Haltepunkte für den KI-Verkehr ----------------
  // je Kante: [{ s (Lage der Linie auf der Kante), dir (1: Verkehr a→b, -1: b→a), kind, sig, g, rule, x, z, ux, uz, half }];
  // kind: 'signal' (Ampel), 'stop', 'give', 'zebra'
  stopsOn(ei) {
    if (!this._stops) this.buildCrossingStops();
    let list = this._stops.get(ei);
    if (list && list.full) return list;
    list = list || [];
    const R = this.R, e = R.graph.edges[ei], len = R.edgeCum(e)[e.p.length / 2 - 1];
    for (const [nd, atA] of [[e.a, true], [e.b, false]]) {
      const ru = this.rules(nd);
      if (!ru) continue;
      const r = ru.arms.find(r => r.a.ei === ei && r.a.atA === atA);
      if (!r || !r.line || !r.incoming) continue;
      const at = r.hold; // vordere Kante der Linie (vor der Kreuzungsfläche bzw. vor der Furt)
      list.push({ s: atA ? at : len - at, dir: atA ? -1 : 1, kind: ru.sig ? 'signal' : r.line, sig: ru.sig, g: r.group, rule: ru, x: ru.x, z: ru.z });
    }
    list.full = true;
    this._stops.set(ei, list);
    return list;
  }
  // Zebrastreifen und Fußgängerampeln auf den Kanten (einmalig)
  buildCrossingStops() {
    this.init();
    const R = this.R, M = this._stops = new Map(), N = window.COBURG_ROADNODES;
    const add = (c, kind, sig) => {
      const list = M.get(c.ei) || []; M.set(c.ei, list);
      for (const dir of c.oneway ? [1] : [1, -1]) list.push({ s: c.s - dir * 3.6, dir, kind, sig, g: 0, x: c.x, z: c.z, ux: c.tx, uz: c.tz, half: c.half });
    };
    if (N) for (let i = 0; i < N.n.length; i += 3) {
      if (N.n[i + 2] !== 0) continue;
      const c = R.crossingAt(N.n[i] / 10, N.n[i + 1] / 10);
      if (c) add(c, 'zebra', null);
    }
    for (const p of this.peds) add({ ei: p.ei, s: p.s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, half: p.half, oneway: p.oneway }, 'signal', p);
  }

  // ---------------- Masten und Lichter ----------------
  // Masten einer Kachel (bzw. mit t = null der Innenstadt): je ankommendem Arm einer Ampelkreuzung ein Mast rechts an der
  // Haltlinie, an Fußgängerampeln je Fahrtrichtung einer
  build(t, group, inside) {
    this.init();
    const heads = [], R = this.R, hf = (x, z) => this.W.heightAt0(x, z);
    const push = (bx, bz, nx, nz, half, sig, g) => {
      const off = half + 0.85, x = bx + nz * off, z = bz - nx * off; // rechts des ankommenden Verkehrs (der fährt gegen n)
      heads.push({ x, z, y: hf(x, z), ang: Math.atan2(nx, nz), sig, g });
    };
    for (const [nd, sig] of this.signals) {
      if (!inside(sig.x, sig.z)) continue;
      const ru = this.rules(nd);
      if (!ru) continue;
      // Gesicht zeigt den Arm hinaus (zum ankommenden Fahrer)
      for (const r of ru.arms) {
        if (!r.incoming) continue;
        const [px, pz, tx, tz] = R.alongEnd(r.a.P, r.a.n, r.hold - 0.5, true);
        push(px, pz, tx, tz, r.a.half, sig, r.group);
      }
    }
    for (const p of this.peds) {
      if (!inside(p.x, p.z)) continue;
      push(p.x - p.tx * 4.1, p.z - p.tz * 4.1, -p.tx, -p.tz, p.half, p, 0);
      if (!p.oneway) push(p.x + p.tx * 4.1, p.z + p.tz * 4.1, p.tx, p.tz, p.half, p, 0);
    }
    if (!heads.length) return;
    const G = this.geos(), n = heads.length, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const pole = new THREE.InstancedMesh(G.pole, G.mat, n), lamps = [0, 1, 2].map(i => new THREE.InstancedMesh(G.lamp[i], G.lampMat, n));
    heads.forEach((h, i) => {
      q.setFromAxisAngle(up, h.ang);
      m4.compose(v.set(h.x, h.y - 0.1, h.z), q, one);
      pole.setMatrixAt(i, m4);
      for (const l of lamps) { l.setMatrixAt(i, m4); l.setColorAt(i, G.off[0]); }
    });
    pole.castShadow = true; pole.receiveShadow = true;
    for (const m of [pole, ...lamps]) { m.computeBoundingSphere(); group.add(m); }
    lamps.forEach(l => { l.instanceColor.setUsage(THREE.DynamicDrawUsage); });
    const cx = heads.reduce((s, h) => s + h.x, 0) / n, cz = heads.reduce((s, h) => s + h.z, 0) / n;
    const set = { pole, lamps, heads, x: cx, z: cz, t, last: [] };
    this.sets.push(set);
    this.paint(set, performance.now() / 1000);
  }
  // gemeinsame Formen: Mast (grau, 3,4 m) mit schwarzem Gehäuse, gelb-schwarzer Blende und Schirmen; drei Lichter
  // (rot, gelb, grün) als Scheiben auf der Vorderseite (+z), Farbe je Instanz
  geos() {
    if (this._geos) return this._geos;
    const parts = [], col = (g, c) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); const a = new Float32Array(g.attributes.position.count * 3), cc = new THREE.Color(c); for (let i = 0; i < a.length; i += 3) { a[i] = cc.r; a[i + 1] = cc.g; a[i + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
    col(new THREE.CylinderGeometry(0.065, 0.075, 3.5, 8).translate(0, 1.75, 0), '#8c9196');
    col(new THREE.BoxGeometry(0.3, 0.92, 0.22).translate(0, 2.75, 0.06), '#141516');
    col(new THREE.BoxGeometry(0.5, 1.12, 0.02).translate(0, 2.75, -0.06), '#e3c12b');   // Kontrastblende (gelber Rand)
    col(new THREE.BoxGeometry(0.42, 1.04, 0.03).translate(0, 2.75, -0.045), '#151617');
    for (const y of [3.03, 2.75, 2.47]) col(new THREE.BoxGeometry(0.26, 0.03, 0.12).translate(0, y + 0.12, 0.23), '#141516'); // Schirme
    const P = [], Nn = [], C = [];
    for (const g of parts) { P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array); C.push(...g.attributes.color.array); }
    const pole = new THREE.BufferGeometry();
    pole.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    pole.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    pole.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    pole.computeBoundingSphere();
    const lamp = [3.03, 2.75, 2.47].map(y => new THREE.CircleGeometry(0.095, 14).translate(0, y, 0.172));
    // Leuchtfarben über 1, damit der Bloom (js/post.js) sie aufgreift; aus: dunkles Glas in der Farbe
    const on = [new THREE.Color(4.2, 0.35, 0.22), new THREE.Color(4.0, 2.3, 0.25), new THREE.Color(0.35, 3.6, 1.3)];
    const off = [new THREE.Color(0.09, 0.03, 0.025), new THREE.Color(0.09, 0.07, 0.02), new THREE.Color(0.02, 0.07, 0.04)];
    return this._geos = { pole, lamp, on, off, mat: new THREE.MeshLambertMaterial({ vertexColors: true }), lampMat: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
  }
  // Lichter eines Satzes nach dem Zustand setzen (nur, was sich geändert hat)
  paint(set, now) {
    const G = this.geos();
    let dirty = false;
    set.heads.forEach((h, i) => {
      const st = this.state(h.sig, h.g, now);
      if (set.last[i] === st) return;
      set.last[i] = st; dirty = true;
      const lit = [st <= 1, st === 1 || st === 3, st === 2];
      set.lamps.forEach((l, k) => l.setColorAt(i, lit[k] ? G.on[k] : G.off[k]));
    });
    if (dirty) for (const l of set.lamps) l.instanceColor.needsUpdate = true;
  }
  // je Bild aus region.update: Innenstadt-Masten einmal bauen, Lichter in der Nähe alle 0,15 s schalten
  update(px, pz) {
    if (!this.coreBuilt) {
      this.coreBuilt = true;
      this.coreGroup = new THREE.Group();
      this.build(null, this.coreGroup, (x, z) => this.R.inCore(x, z));
      this.W.group.add(this.coreGroup);
    }
    const now = performance.now() / 1000;
    if (now < this._t) return;
    this._t = now + SIGNAL.tick;
    for (let i = this.sets.length - 1; i >= 0; i--) {
      const s = this.sets[i];
      if (s.t && s.t.disposed) { this.sets.splice(i, 1); continue; }
      if (Math.hypot(s.x - px, s.z - pz) < SIGNAL.lightDist + 600) this.paint(s, now);
    }
  }
}
