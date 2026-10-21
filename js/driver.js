// Navigation auf dem Straßennetz (kürzeste Wege) und ein KI-Fahrer, der ein echtes Auto mit der
// normalen Fahrphysik über einen Pfad steuert. Benutzt von Polizei und Rennfahrern.
'use strict';

class RoadNav {
  constructor(world) {
    this.world = world;
    const G = world.data.graph;
    this.nodes = G.nodes; // flach [x, z, x, z, ...]
    this.n = G.nodes.length / 2;
    this.edges = G.edges.map(e => {
      const p = e.p, cum = [0];
      for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
      const len = cum[cum.length - 1];
      return { a: e.a, b: e.b, p, cum, len, s: e.s || 9, cost: len / (e.s || 9) };
    });
    // Nachbarn in beide Richtungen (Polizei und Rennen ignorieren Einbahnstraßen)
    this.adj = Array.from({ length: this.n }, () => []);
    this.segGrid = new U.Grid(30);
    // Straßen, die durch Gebäude führen (Durchfahrten, die im 3D-Modell zu sind), meiden
    // (nur in der Innenstadt nötig, wo die LoD2-Häuser über OSM-Straßen ragen)
    const blocked = e => {
      if (world.region && !e.p.some((v, k) => k % 2 === 0 && world.inCoreRect(v, e.p[k + 1]))) return false;
      for (let k = 0; k + 2 < e.p.length; k += 2) {
        const ax = e.p[k], az = e.p[k + 1], bx = e.p[k + 2], bz = e.p[k + 3];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5));
        for (let j = 0; j <= n; j++) if (world.insideBuilding(ax + (bx - ax) * j / n, az + (bz - az) * j / n, -0.6)) return true;
      }
      return false;
    };
    this.blocked = 0;
    this.edges.forEach((e, i) => {
      if (e.len < 0.5) return;
      if (blocked(e)) { this.blocked++; return; }
      this.adj[e.a].push(i); this.adj[e.b].push(i);
      for (let k = 0; k + 2 < e.p.length; k += 2) {
        const ax = e.p[k], az = e.p[k + 1], bx = e.p[k + 2], bz = e.p[k + 3];
        this.segGrid.insert(i * 4096 + k / 2, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
      }
    });
    this._q = [];
  }

  // Nächster Punkt auf dem Netz: { edge, s (Abstand von a), x, z, d }
  locate(x, z, maxD = 250) {
    let best = null, bd = maxD;
    for (let r = 40; r <= maxD * 2 && !best; r *= 2) {
      const list = this.segGrid.query(x, z, Math.min(r, maxD), this._q);
      for (const code of list) {
        const ei = Math.floor(code / 4096), k = (code % 4096) * 2, e = this.edges[ei];
        const c = U.closestOnSeg(x, z, e.p[k], e.p[k + 1], e.p[k + 2], e.p[k + 3]);
        const d = Math.hypot(c[0] - x, c[1] - z);
        if (d < bd) {
          bd = d;
          const segLen = e.cum[k / 2 + 1] - e.cum[k / 2];
          best = { edge: ei, s: e.cum[k / 2] + segLen * c[2], x: c[0], z: c[1], d };
        }
      }
      if (r >= maxD) break;
    }
    return best;
  }

  // Dijkstra (Fahrzeit) von einem Punkt auf dem Netz aus; liefert Kosten zu jedem Knoten.
  // maxCost (Sekunden) begrenzt die Suche, damit sie im großen Landkreis-Netz schnell bleibt.
  costsFrom(loc, maxCost = Infinity) {
    const dist = new Float64Array(this.n).fill(Infinity);
    const e = this.edges[loc.edge];
    const heap = [];
    const push = (node, d) => {
      if (d >= dist[node]) return;
      dist[node] = d; heap.push([d, node]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    push(e.a, loc.s / e.s);
    push(e.b, (e.len - loc.s) / e.s);
    while (heap.length) {
      const [d, node] = pop();
      if (d > dist[node]) continue;
      if (d > maxCost) break;
      for (const ei of this.adj[node]) {
        const ed = this.edges[ei], other = ed.a === node ? ed.b : ed.a;
        push(other, d + ed.cost);
      }
    }
    return { dist, loc };
  }

  // Polylinie eines Kantenstücks von s0 nach s1 (beliebige Richtung) an out anhängen
  appendEdge(e, s0, s1, out) {
    const p = e.p, cum = e.cum;
    const pt = s => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return [p[(i - 1) * 2] + (p[i * 2] - p[(i - 1) * 2]) * t, p[(i - 1) * 2 + 1] + (p[i * 2 + 1] - p[(i - 1) * 2 + 1]) * t];
    };
    const a = pt(s0); out.push(a[0], a[1]);
    if (s1 > s0) { for (let i = 1; i < cum.length - 1; i++) if (cum[i] > s0 && cum[i] < s1) out.push(p[i * 2], p[i * 2 + 1]); }
    else { for (let i = cum.length - 2; i >= 1; i--) if (cum[i] < s0 && cum[i] > s1) out.push(p[i * 2], p[i * 2 + 1]); }
    const b = pt(s1); out.push(b[0], b[1]);
  }

  // Weg von (x, z) zum Ziel der Kostentabelle; maxLen begrenzt die Länge (für Verfolger reicht ein Stück)
  route(costs, x, z, maxLen = Infinity) {
    const out = [];
    const start = this.locate(x, z, 400);
    if (!start) return out;
    const { dist, loc: goal } = costs;
    const e = this.edges[start.edge];
    if (start.edge === goal.edge) { out.push(x, z); this.appendEdge(e, start.s, goal.s, out); return out; }
    const viaA = start.s / e.s + dist[e.a], viaB = (e.len - start.s) / e.s + dist[e.b];
    if (!isFinite(Math.min(viaA, viaB))) return out;
    out.push(x, z);
    let node = viaA <= viaB ? e.a : e.b;
    this.appendEdge(e, start.s, node === e.a ? 0 : e.len, out);
    let len = node === e.a ? start.s : e.len - start.s;
    const ge = this.edges[goal.edge];
    for (let guard = 0; guard < 20000 && len < maxLen; guard++) {
      // am Zielkantenende angekommen?
      if (node === ge.a && Math.abs(dist[node] - goal.s / ge.s) < 1e-6) { this.appendEdge(ge, 0, goal.s, out); break; }
      if (node === ge.b && Math.abs(dist[node] - (ge.len - goal.s) / ge.s) < 1e-6) { this.appendEdge(ge, ge.len, goal.s, out); break; }
      let bestE = -1, bestC = Infinity, bestN = -1;
      for (const ei of this.adj[node]) {
        const ed = this.edges[ei], other = ed.a === node ? ed.b : ed.a;
        const c = ed.cost + dist[other];
        if (c < bestC) { bestC = c; bestE = ei; bestN = other; }
      }
      if (bestE < 0) break;
      const ed = this.edges[bestE];
      this.appendEdge(ed, node === ed.a ? 0 : ed.len, node === ed.a ? ed.len : 0, out);
      len += ed.len;
      node = bestN;
    }
    return out;
  }

  // Zufälliger Punkt auf dem Netz in einem Abstandsring um (x, z) (Abschnitte aus dem Suchraster)
  randomPoint(x, z, rMin, rMax, filter) {
    const list = this.segGrid.query(x, z, rMax, []);
    if (!list.length) return null;
    for (let tries = 0; tries < 300; tries++) {
      const code = list[Math.floor(Math.random() * list.length)];
      const e = this.edges[Math.floor(code / 4096)], i = code % 4096 + 1;
      if (e.len < 8) continue;
      const t = Math.random();
      const px = e.p[(i - 1) * 2] + (e.p[i * 2] - e.p[(i - 1) * 2]) * t, pz = e.p[(i - 1) * 2 + 1] + (e.p[i * 2 + 1] - e.p[(i - 1) * 2 + 1]) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < rMin || d > rMax) continue;
      if (this.world.region) { if (!this.world.region.walkable(px, pz)) continue; }
      else {
        const B = this.world.bounds;
        if (px < B.minX + 20 || px > B.maxX - 20 || pz < B.minZ + 20 || pz > B.maxZ - 20) continue;
      }
      const dx = e.p[i * 2] - e.p[(i - 1) * 2], dz = e.p[i * 2 + 1] - e.p[(i - 1) * 2 + 1];
      const p = { x: px, z: pz, heading: Math.atan2(dx, dz) };
      if (filter && !filter(p)) continue;
      return p;
    }
    return null;
  }
}

// Gleichmäßig neu abtasten (Punktabstand step), damit der Fahrer gleichmäßige Stützpunkte hat
function resamplePath(p, step) {
  const out = [];
  if (p.length < 4) return p.slice();
  out.push(p[0], p[1]);
  let carry = 0;
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-6) continue;
    let t = step - carry;
    while (t <= l) { out.push(ax + (bx - ax) * t / l, az + (bz - az) * t / l); t += step; }
    carry = l - (t - step);
  }
  const lx = p[p.length - 2], lz = p[p.length - 1];
  if (Math.hypot(out[out.length - 2] - lx, out[out.length - 1] - lz) > 0.5) out.push(lx, lz);
  return out;
}

// Steuert ein Vehicle mit Gas, Bremse und Lenkung entlang eines Pfads (oder direkt auf ein Ziel zu)
class AutoDriver {
  constructor(car, opts = {}) {
    this.car = car;
    this.path = null;       // flach [x, z, ...], Punktabstand ≈ 4 m
    this.idx = 0;
    this.maxSpeed = opts.maxSpeed || 30;
    this.world = opts.world || null;     // für das Ausweichen (nicht in Hauswände lenken)
    this.cornerFactor = opts.cornerFactor || 1;
    this.stuck = 0; this.reverse = 0;
    this.input = { throttle: 0, steer: 0, handbrake: false };
  }

  setPath(p, keepNearest = true) {
    this.path = p; this.idx = 0;
    if (keepNearest && p && p.length) this.idx = this.nearestIndex(0, p.length / 2);
  }

  nearestIndex(from, to) {
    const p = this.path, c = this.car;
    let best = from, bd = Infinity;
    for (let i = Math.max(0, from); i < Math.min(to, p.length / 2); i++) {
      const d = (p[i * 2] - c.x) ** 2 + (p[i * 2 + 1] - c.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Punkt in Abstand L entlang des Pfads ab idx
  ahead(L) {
    const p = this.path, n = p.length / 2;
    let i = this.idx, acc = 0;
    while (i < n - 1) {
      const l = Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
      if (acc + l >= L) { const t = (L - acc) / (l || 1); return [p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * t, p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * t]; }
      acc += l; i++;
    }
    return [p[(n - 1) * 2], p[(n - 1) * 2 + 1]];
  }

  get done() { return !this.path || this.idx >= this.path.length / 2 - 2; }

  // Langsameres Auto voraus auf der eigenen Spur? Dann daneben vorbeizielen.
  // Gibt { x, z, ahead, ov } zurück oder null.
  avoid(obstacles, tx, tz) {
    const c = this.car, fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const rx = -fz, rz = fx; // rechts
    const v = c.speed;
    let best = null, bd = 10 + Math.max(0, v) * 0.9;
    for (const o of obstacles) {
      if (o === c || o.disposed) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 1.5 || ahead > bd) continue;
      const lat = dx * rx + dz * rz;
      if (Math.abs(lat) > 2.5) continue;
      const ov = o.ai ? o.ai.speed * (Math.sin(o.heading) * fx + Math.cos(o.heading) * fz) : o.vx * fx + o.vz * fz;
      if (ov > v - 2) continue;
      bd = ahead; best = { lat, ahead, ov, ox: o.x, oz: o.z };
    }
    if (!best) return null;
    // auf die Seite ausweichen, auf der das Hindernis nicht steht (und keine Hauswand ist)
    const sides = best.lat > 0 ? [-1, 1] : [1, -1];
    for (const side of sides) {
      const off = best.lat + side * 3.3;
      const x = best.ox + rx * (off - best.lat), z = best.oz + rz * (off - best.lat);
      if (!this.world || !this.world.insideBuilding(x, z, 0.5)) return { x, z, ahead: best.ahead, ov: best.ov };
    }
    return { x: tx, z: tz, ahead: best.ahead, ov: best.ov, blocked: true };
  }

  // Liefert die Eingabe für Vehicle.update. direct: {x, z} fährt ohne Pfad direkt auf den Punkt zu.
  // speedCap begrenzt zusätzlich (z. B. Gummiband im Rennen, Anhalten neben dem Spieler);
  // obstacles: Autos, an denen der Fahrer vorbeilenken soll
  steer(dt, direct, speedCap = Infinity, obstacles = null) {
    const c = this.car, inp = this.input;
    const v = c.speed;
    let tx, tz, farX, farZ;
    if (direct) { tx = direct.x; tz = direct.z; farX = tx; farZ = tz; }
    else if (this.path && this.path.length >= 4) {
      this.idx = this.nearestIndex(this.idx, this.idx + 14);
      const L = 5 + Math.abs(v) * 0.45;
      [tx, tz] = this.ahead(L);
      [farX, farZ] = this.ahead(L + 12 + Math.abs(v) * 0.9);
    } else { inp.throttle = 0; inp.steer = 0; inp.handbrake = true; return inp; }

    let dodge = null;
    if (obstacles && !direct) {
      dodge = this.avoid(obstacles, tx, tz);
      if (dodge) { tx = dodge.x; tz = dodge.z; }
    }
    const want = Math.atan2(tx - c.x, tz - c.z);
    const a = U.wrapAngle(want - c.heading);
    const aFar = U.wrapAngle(Math.atan2(farX - c.x, farZ - c.z) - c.heading);
    // Kurvengeschwindigkeit: je stärker der Knick voraus, desto langsamer
    const sharp = Math.max(Math.abs(a), Math.abs(aFar) * 0.9);
    let vTarget = Math.min(this.maxSpeed, speedCap) * (1 - U.clamp((sharp - 0.1) / 0.85, 0, 0.8) * this.cornerFactor);
    vTarget = Math.max(vTarget, Math.min(7, speedCap));
    if (dodge) vTarget = Math.min(vTarget, Math.max(dodge.blocked ? 0 : 9, dodge.ov + dodge.ahead * (dodge.blocked ? 0.5 : 1.2)));

    // Festgefahren? Kurz zurücksetzen
    if (this.reverse > 0) {
      this.reverse -= dt;
      inp.throttle = -1; inp.steer = -Math.sign(a || 1); inp.handbrake = false;
      return inp;
    }
    if (Math.abs(v) < 1.2 && vTarget > 3) { this.stuck += dt; if (this.stuck > 1.1) { this.stuck = 0; this.reverse = 1.0; } }
    else this.stuck = Math.max(0, this.stuck - dt * 2);

    if (Math.abs(a) > 1.9 && Math.abs(v) < 8) {
      // Ziel liegt hinter uns: rückwärts wenden
      inp.throttle = -1; inp.steer = -Math.sign(a); inp.handbrake = false;
      return inp;
    }
    inp.steer = U.clamp(a * 2.6, -1, 1);
    if (v < vTarget - 1) inp.throttle = 1;
    else if (v > vTarget + 3) inp.throttle = -1;
    else inp.throttle = v < vTarget ? 0.5 : 0;
    inp.handbrake = Math.abs(a) > 0.85 && v > 14;
    return inp;
  }
}
