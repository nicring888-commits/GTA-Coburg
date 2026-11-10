// Geparkte Autos auf Parkplätzen (seit v3.18.0, Grafik-Phase G7): auf den OSM-Parkflächen der Ortskacheln im Umkreis
// des Ortslebens (REGION.life) stehen Autos in den Stellplätzen, die SiteKit.parkingLines markiert (gleiche Reihen),
// nie auf der Fahrbahn. Gezeichnet als Instanzen je Autoart (Lack mit Farbe je Auto, übrige Teile dunkel), Hindernisse
// über Region.collide. Mit E wird ein geparktes Auto zum echten Vehicle, das sich klauen lässt (Zeugen wie im Verkehr).
'use strict';

// Belegung und Höchstzahl je Kachel nach Messung (791 Autos in 5 Kacheln kosteten 14 ms GPU): Instanzen werfen keine
// Schatten, Lack ohne Klarlack
const PARK = { kinds: ['car', 'kombi', 'kleinwagen', 'suv', 'car', 'kleinwagen'], fill: 0.4, max: 70, core: 450 };

const ParkKit = {
  hash(x, z, k) { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); },

  // Stellplatz-Mitten einer Parkfläche: dieselben Prüfungen und Abstände wie SiteKit.parkingLines (Linien alle 2,5 m,
  // 4,7 m tief), Platz zwischen zwei gültigen Linien
  stalls(R, t, area, out) {
    const ring = area.p, n = ring.length / 2;
    const inside = (x, z) => U.pointInPoly(x, z, ring) && !(area.ho && area.ho.some(h => U.pointInPoly(x, z, h)));
    const ok = (x, z) => inside(x, z) && !R.insideBuilding(x, z, 0.3, t) && !R.nearRoad(x, z, 0.3) && R.walkAt(x, z) === null;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 7.5) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      let nx = -dz, nz = dx;
      if (!inside((ax + bx) / 2 + nx * 1.5, (az + bz) / 2 + nz * 1.5)) { nx = -nx; nz = -nz; }
      let prev = false;
      for (let s0 = 1.2; s0 < len - 1.1; s0 += 2.5) {
        const x0 = ax + dx * s0 + nx * 0.3, z0 = az + dz * s0 + nz * 0.3, x1 = x0 + nx * 4.7, z1 = z0 + nz * 4.7;
        const good = ok(x0, z0) && ok(x1, z1) && ok((x0 + x1) / 2, (z0 + z1) / 2);
        if (good && prev) {
          const cx = x0 - dx * 1.25 + nx * 2.35, cz = z0 - dz * 1.25 + nz * 2.35;
          if (ok(cx, cz)) out.push({ x: cx, z: cz, nx, nz });
        }
        prev = good;
      }
    }
    return out;
  },

  // Formen je Autoart: Lack und alles Übrige (Glas, Zierteile, Leuchten, Räder) als ein dunkler Körper
  shapes(kind) {
    const C = this._shapes || (this._shapes = {});
    if (C[kind]) return C[kind];
    // Automodell (seit v3.19.0): Lack mit Maske und Instanzfarbe, übrige Teile samt Rädern als ein dunkler Körper
    const D = typeof CarModels !== 'undefined' ? CarModels.get(kind) : null;
    if (D) {
      const s = D.scale, S = new THREE.Matrix4().makeScale(s, s, s), rest = [];
      for (const g of [D.glass, D.head, D.tail]) if (g) rest.push([g, S]);
      // stehende Autos: einfache Räder (Reifen aus der gebauten Form, auf den Radius des Modells), spart ≈ 2.200 Dreiecke je Auto
      const G0 = carGeometries('car'), rs = D.u.r / CAR.wheelR;
      for (const [x, y, z] of D.u.wheels) rest.push([G0.tire, S.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeScale(1, rs, rs))]);
      const paintMat = CarModels.paintShader(Mat.make('lackMatt', { color: '#ffffff', map: D.paintMap, roughnessMap: D.mr, metalnessMap: D.mr, roughness: 1, metalness: 1 }));
      return (C[kind] = { paint: carMerge([[D.paint, S]]), rest: carMerge(rest), paintMat });
    }
    const G = carGeometries(kind), M4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const rest = [[G.glass], [G.trim], [G.head], [G.tail], [G.plate]];
    for (const [x, z] of [[WHEEL_X, WHEEL_Z], [-WHEEL_X, WHEEL_Z], [WHEEL_X, -WHEEL_Z], [-WHEEL_X, -WHEEL_Z]]) {
      rest.push([G.tire, M4(x, CAR.wheelR, z)], [G.rim, M4(x, CAR.wheelR, z)]);
    }
    return (C[kind] = { paint: G.paint, rest: carMerge(rest) });
  },
  mats() {
    return this._mats || (this._mats = {
      paint: Mat.make('lackMatt', { color: '#ffffff', roughness: 0.32, metalness: 0.25 }),
      rest: Mat.make('glas', { color: '#15191e', roughness: 0.3, metalness: 0.2 }),
    });
  },

  // Autos einer Ortskachel aufstellen (in buildLife); life.lot = Liste, life.meshes bekommt die Instanzen
  build(R, t, life) {
    const stalls = [];
    for (const a of t.d.areas) if (a.k === 'parking') this.stalls(R, t, a, stalls);
    // Plätze verschiedener Kanten überschneiden sich an Ecken: parallele brauchen 2,3 m, quer stehende 3,6 m Abstand
    const kept = [];
    for (const s of stalls) {
      if (kept.some(o => {
        const d2 = (o.x - s.x) * (o.x - s.x) + (o.z - s.z) * (o.z - s.z), par = Math.abs(o.nx * s.nx + o.nz * s.nz) > 0.7;
        return d2 < (par ? 2.3 * 2.3 : 3.6 * 3.6);
      })) continue;
      kept.push(s);
    }
    const cars = [];
    for (const s of kept) {
      if (cars.length >= PARK.max || this.hash(s.x, s.z, 1) > PARK.fill) continue;
      const kind = PARK.kinds[Math.floor(this.hash(s.x, s.z, 2) * PARK.kinds.length)];
      const pal = kindPalette(kind), color = pal[Math.floor(this.hash(s.x, s.z, 3) * pal.length)];
      // vorwärts oder rückwärts eingeparkt
      const back = this.hash(s.x, s.z, 4) < 0.35, fx = back ? -s.nx : s.nx, fz = back ? -s.nz : s.nz;
      cars.push({ x: s.x, z: s.z, y: R.heightAt(s.x, s.z) + 0.03, fx, fz, h: Math.atan2(fx, fz), kind, color, alive: true });
    }
    if (!cars.length) return;
    life.lot = cars;
    const M = this.mats(), byKind = {};
    for (const c of cars) (byKind[c.kind] || (byKind[c.kind] = [])).push(c);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
    for (const kind in byKind) {
      const list = byKind[kind], S = this.shapes(kind);
      const paint = new THREE.InstancedMesh(S.paint, S.paintMat || M.paint, list.length), rest = new THREE.InstancedMesh(S.rest, M.rest, list.length);
      list.forEach((c, i) => {
        q.setFromAxisAngle(up, c.h); p.set(c.x, c.y, c.z); m4.compose(p, q, one);
        paint.setMatrixAt(i, m4); rest.setMatrixAt(i, m4); paint.setColorAt(i, col.set(c.color));
        c.meshes = [paint, rest]; c.index = i;
      });
      paint.receiveShadow = rest.receiveShadow = true;
      for (const m of [paint, rest]) { m.computeBoundingSphere(); t.group.add(m); life.meshes.push(m); }
    }
  },

  // Innenstadt (seit v3.19.0): Parkflächen aus den Landkreisdaten, deren Mitte im Kerngebiet liegt (die Innenstadtdaten
  // haben keine). Je Kachel eine Gruppe; sichtbar und Hindernis nur bis PARK.core m (updateCore), Prüfungen über die
  // Innenstadt-Welt (Häuser, Straßen) statt über die Kacheln. world.coreLots = [{ group, lot, x0, z0, x1, z1 }]
  buildCore(R) {
    const W = R.world, C = R.core, lots = [];
    const A = {
      insideBuilding: (x, z, m) => W.insideBuilding(x, z, m),
      nearRoad: (x, z, m) => !!W.nearRoad(x, z, m),
      walkAt: () => null,
      heightAt: (x, z) => W.heightAt(x, z),
    };
    const [i0, j0] = R.tileOf(C.minX, C.minZ), [i1, j1] = R.tileOf(C.maxX, C.maxZ);
    for (let tj = j0; tj <= j1; tj++) for (let ti = i0; ti <= i1; ti++) {
      if (!R.stateOf(ti, tj)) continue;
      const d = R.decodeTile({ ti, tj });
      const areas = d.areas.filter(a => {
        if (a.k !== 'parking') return false;
        let cx = 0, cz = 0;
        for (let k = 0; k < a.p.length; k += 2) { cx += a.p[k]; cz += a.p[k + 1]; }
        return R.inCore(cx / (a.p.length / 2), cz / (a.p.length / 2));
      });
      if (!areas.length) continue;
      const t = { d: { areas }, group: new THREE.Group() }, life = { meshes: [] };
      this.build(A, t, life);
      if (!life.lot) continue;
      t.group.visible = false;
      W.group.add(t.group);
      const x0 = R.tileX(ti), z0 = R.tileZ(tj);
      lots.push({ group: t.group, lot: life.lot, x0, z0, x1: x0 + R.tw, z1: z0 + R.th });
    }
    W.coreLots = lots;
    return lots;
  },
  updateCore(W, x, z) {
    for (const L of W.coreLots || []) {
      const d = Math.hypot(Math.max(L.x0 - x, 0, x - L.x1), Math.max(L.z0 - z, 0, z - L.z1));
      L.group.visible = d < PARK.core;
    }
  },

  // ausblenden (beim Klauen): Instanz auf Größe 0, kein Hindernis mehr
  hide(c) {
    c.alive = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of c.meshes) { m.setMatrixAt(c.index, z); m.instanceMatrix.needsUpdate = true; }
  },

  // nächstes geparktes Auto im Umkreis d (für E und den Hinweis)
  nearest(R, x, z, d) {
    let best = null, bd = d * d;
    for (const key of R.lifeOn) {
      const t = R.loaded.get(key), L = t && t.life && t.life.lot;
      if (L) for (const c of L) {
        if (!c.alive) continue;
        const dd = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
        if (dd < bd) { bd = dd; best = c; }
      }
    }
    for (const L of R.world.coreLots || []) if (L.group.visible) for (const c of L.lot) {
      if (!c.alive) continue;
      const dd = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  },

  // Kollision mit geparkten Autos einer Kachel: drei Kreise je Auto wie bei Auto-gegen-Auto (CAR.circles)
  collide(L, x, z, r, out) {
    let moved = false;
    for (const c of L) {
      if (!c.alive) continue;
      const ex = x - c.x, ez = z - c.z;
      if (ex * ex + ez * ez > 36) continue;
      for (const k of CAR.circles) {
        const dx = x - (c.x + c.fx * k), dz = z - (c.z + c.fz * k), rr = r + CAR.radius, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
          x += nx * (rr - d); z += nz * (rr - d);
          out.nx += nx; out.nz += nz; out.hit = true; moved = true;
        }
      }
    }
    out.x = x; out.z = z;
    return moved;
  },
};
