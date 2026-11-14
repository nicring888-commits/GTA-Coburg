// Stadtboden (seit v3.20.0, Update „Lebendige Stadt“, Phase U1/U2): glaubwürdige Bodenflächen direkt an Gebäuden,
// damit scharfe 3D-Häuser nicht mehr wie auf das unscharfe Luftbild gestellt wirken.
//
// Regeln statt Zufall: Jede Gebäudekante bekommt einen Streifen nach außen. Belag und Breite folgen dem Gebiet und dem
// Gebäudetyp; zeigt die Kante zu einer Straße, reicht der Streifen bis an die Fahrbahn (Gehweg, Vorplatz, Zufahrt),
// sonst bleibt er schmal (Traufkies, Plattenstreifen, Hofpflaster). Unsicher → neutrale Standardlösung (schmaler
// Streifen). Die Variation ist nur leicht (Helligkeit je Ort aus einem festen Rauschen), nie zufällig je Bild.
//
// Gebiete: 'alt' Altstadt (Pflaster und Platten bis zur Fahrbahn), 'urb' städtische Mehrfamilien- und Gründerzeithäuser
// (Platten zur Straße, Plattenstreifen im Hof), 'res' Wohnhäuser (Traufkies, Platten nur bei schmalem Vorgarten),
// 'com' Gewerbe und Industrie (Beton-Verbundpflaster zur Straße, Asphalt-Vorfeld ringsum), 'pub' Schulen, Ämter,
// Kirchen (Pflaster), 'gar' Garagen (Zufahrt zur Straße), 'none' (Schuppen, Scheunen: nichts).
//
// Alles landet als Dreiecke in einem Topf (Chunks, 500-m-Zellen) mit EINEM Material: die fünf Beläge liegen in einem
// Textur-Atlas, die Eckenfarbe trägt Helligkeit (r) und Belag (g); Grundfarbe je Belag aus einer Tabelle im Shader.
// Gelände-folgend (Stützpunkte alle ≤ 3 m), unter Fahrbahnen und Gehsteigen; feste Höhenstaffel der Beläge
// untereinander (kein Flimmern bei Überlappung). WebGPU-Probe: vorerst ohne (kein TSL-Zwilling).
'use strict';

const URBAN = {
  y: 0.06,          // über dem Gelände
  step: 5,          // Stützpunktabstand (m); das Gelände hat ein 12,5-m-Raster
  far: 380,         // Töpfe, deren Rand weiter als das von der Kamera liegt, werden nicht gezeichnet
  rim: 0.14,        // Randstein / Rasenkante am äußeren Rand schmaler Streifen
  minEdge: 1.2,     // kürzere Kanten bekommen nur den Standardstreifen
  // Belag: Kachelgröße der Textur (m), Grundfarbe, polygonOffset (Reihenfolge), Rauheit
  surf: {
    gravel: { i: 0, tile: 1.0, col: '#b9b2a4', y: 0.050 },
    slab: { i: 1, tile: 1.05, col: '#a6a39c', y: 0.056 },
    paver: { i: 2, tile: 1.2, col: '#a09a91', y: 0.062 },
    sett: { i: 3, tile: 1.0, col: '#8f8d89', y: 0.068 },
    asphalt: { i: 4, tile: 2.0, col: '#5a5d61', y: 0.074 },
    lawn: { i: 5, tile: 1.6, col: '#5f7d3c', y: 0.044 },   // Farbe kommt aus dem Luftbild (beruhigt)
    lot: { i: 4, tile: 2.0, col: '#4d5054', y: 0.040 },    // Parkplatzfläche (Asphalt, unter den Linien)
    paint: { i: 6, tile: 1.0, col: '#d8d8d0', y: 0.090 },  // Markierungen (Stellplätze)
  },
  // Gebiet → [Belag zur Straße, größter Abstand zur Fahrbahn, der noch aufgefüllt wird (m), Belag sonst, Breite sonst]
  style: {
    alt: ['slab', 9, 'sett', 1.2],
    urb: ['slab', 6, 'slab', 1.0],
    res: ['slab', 3, 'gravel', 0.5],
    com: ['paver', 14, 'asphalt', 3.5],
    pub: ['paver', 10, 'paver', 2.5],
    church: ['sett', 8, 'sett', 2.0],
    gar: ['asphalt', 9, null, 0],
    fuel: [null, 0, 'asphalt', 8],          // Tankstellen-Vorfeld um das Tankdach (fest, Fahrbahnen liegen darüber)
    school: ['paver', 14, 'paver', 7],      // Schule in einer Schul-/Bildungsfläche: Pausenhof ringsum
  },
  lawnW: 5,
  lawnK: 1.15,      // Helligkeitsabgleich Rasen (Standard-Material) ↔ Luftbild (Lambert mit ORTHO_TINT)         // Rasenstreifen hinter dem Traufstreifen (Wohngebiete, nur wo das Luftbild grün ist)
  pathY: 0.085,     // Eingangswege liegen über den Streifen (unter Plätzen/Fahrbahnen)
  chunk: 500,       // Topfgröße (m): ein Zeichenaufruf je Zelle
};

const URBAN_COM = new Set(['commercial', 'industrial', 'retail', 'warehouse', 'supermarket', 'manufacture', 'factory',
  'hangar', 'service', 'office', 'transportation', 'train_station', 'depot', 'storage_tank', 'parking', 'kiosk']);
const URBAN_PUB = new Set(['school', 'kindergarten', 'college', 'university', 'hospital', 'public', 'civic', 'townhall',
  'government', 'fire_station', 'sports_hall', 'museum', 'theatre', 'library', 'hotel']);
const URBAN_CHURCH = new Set(['church', 'chapel', 'cathedral', 'religious', 'monastery']);
const URBAN_GAR = new Set(['garage', 'garages', 'carport']);
const URBAN_NONE = new Set(['shed', 'roof', 'barn', 'farm_auxiliary', 'greenhouse', 'hut', 'cabin', 'stable', 'cowshed',
  'silo', 'ruins', 'bridge', 'container', 'tent', 'construction', 'toilets', 'transformer_tower', 'bunker']);

const UrbanKit = {
  _tex: null, _mats: null,

  // ---------- Textur-Atlas (zur Laufzeit gemalt, hell; Farbe je Belag im Shader) ----------
  // 4 × 2 Felder à 256 px: 0 Kies, 1 Platten, 2 Verbundpflaster, 3 Kleinpflaster, 4 Asphalt
  textures() {
    if (this._tex) return this._tex;
    const S = 256, mk = (draw, seed) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const c = cv.getContext('2d'), rnd = U.rng(seed);
      draw(c, rnd);
      return cv;
    };
    const gv = (c, v) => { c.fillStyle = `rgb(${v},${v},${v})`; };
    const tiled = (c, f) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { c.save(); c.translate(ox, oy); f(); c.restore(); } };
    this._tex = {
      // Traufkies: helle Kiesel auf dunklerem Grund
      gravel: mk((c, r) => {
        gv(c, 150); c.fillRect(0, 0, S, S);
        for (let i = 0; i < 2600; i++) {
          const x = r() * S, y = r() * S, rr = 1.2 + r() * 2.6, v = 170 + Math.floor(r() * 85);
          gv(c, v);
          tiled(c, () => { c.beginPath(); c.ellipse(x, y, rr, rr * (0.6 + r() * 0.4), r() * 3, 0, 7); c.fill(); });
        }
      }, 11),
      // Gehwegplatten 40 × 40 cm (3 × 3 je Kachel), leicht verschiedene Helligkeit, dunkle Fugen
      slab: mk((c, r) => {
        gv(c, 158); c.fillRect(0, 0, S, S);
        const n = 3, w = S / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          gv(c, 206 + Math.floor(r() * 22)); c.fillRect(i * w + 1.2, j * w + 1.2, w - 2.4, w - 2.4);
          for (let k = 0; k < 160; k++) { gv(c, 185 + Math.floor(r() * 55)); c.fillRect(i * w + 2 + r() * (w - 5), j * w + 2 + r() * (w - 5), 1.3, 1.3); }
        }
      }, 12),
      // Betonstein-Verbundpflaster 20 × 10 cm im Läuferverband
      paver: mk((c, r) => {
        gv(c, 115); c.fillRect(0, 0, S, S);
        const rows = 12, h = S / rows, w = h * 2;
        for (let j = 0; j < rows; j++) {
          const off = (j % 2) * w / 2;
          for (let x = -w; x < S + w; x += w) {
            gv(c, 195 + Math.floor(r() * 50));
            tiled(c, () => c.fillRect(x + off + 1, j * h + 1, w - 2, h - 2));
          }
        }
      }, 13),
      // Granit-Kleinpflaster (≈ 9 cm) in Reihen, unregelmäßig
      sett: mk((c, r) => {
        gv(c, 105); c.fillRect(0, 0, S, S);
        const rows = 11, h = S / rows;
        for (let j = 0; j < rows; j++) {
          let x = r() * h;
          const xs = [];
          while (x < S + h) { const w = h * (0.8 + r() * 0.45); xs.push([x, w]); x += w; }
          const k = S / (x - xs[0][0]);
          for (const [x0, w] of xs) {
            const v = 175 + Math.floor(r() * 70);
            c.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
            const X = xs[0][0] + (x0 - xs[0][0]) * k;
            tiled(c, () => { c.beginPath(); c.roundRect(X + 1.2, j * h + 1.2, w * k - 2.4, h - 2.4, 3); c.fill(); });
          }
        }
      }, 14),
      // Asphalt: feines Korn, ein paar helle Splittkörner
      asphalt: mk((c, r) => {
        gv(c, 200); c.fillRect(0, 0, S, S);
        for (let i = 0; i < 9000; i++) { gv(c, 150 + Math.floor(r() * 100)); c.fillRect(r() * S, r() * S, 1.3, 1.3); }
        for (let i = 0; i < 500; i++) { gv(c, 245); c.fillRect(r() * S, r() * S, 1, 1); }
      }, 15),
      // Rasen: feine Halme, hell (Farbe aus dem Luftbild)
      lawn: mk((c, r) => {
        gv(c, 190); c.fillRect(0, 0, S, S);
        for (let i = 0; i < 7000; i++) {
          const x = r() * S, y = r() * S, l = 2 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 1.2, v = 140 + Math.floor(r() * 115);
          c.strokeStyle = `rgb(${v},${v},${v})`; c.lineWidth = 0.8 + r() * 0.8;
          tiled(c, () => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); });
        }
      }, 16),
      // Markierungsfarbe: fast weiß, leicht abgefahren
      paint: mk((c, r) => {
        gv(c, 235); c.fillRect(0, 0, S, S);
        for (let i = 0; i < 3000; i++) { gv(c, 190 + Math.floor(r() * 60)); c.fillRect(r() * S, r() * S, 2, 2); }
      }, 17),
    };
    const at = document.createElement('canvas'); at.width = S * 4; at.height = S * 2;
    const ac = at.getContext('2d');
    ac.fillStyle = '#c8c8c8'; ac.fillRect(0, 0, at.width, at.height);   // leere Felder deckend (kein Alpha 0)
    ['gravel', 'slab', 'paver', 'sett', 'asphalt', 'lawn', 'paint'].forEach((k, i) => ac.drawImage(this._tex[k], (i % 4) * S, Math.floor(i / 4) * S));
    const t = new THREE.CanvasTexture(at);
    t.flipY = false;   // Feld 0 oben links = UV (0, 0)
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = (typeof Mat !== 'undefined' && Mat.aniso) ? Mat.aniso : 8;
    this._tex.atlas = t;
    return this._tex;
  },

  // Ein Material für alle Beläge (Innenstadt und Umland); world: World (surfaceMat)
  material(world) {
    if (this._mat) return this._mat;
    const tex = this.textures().atlas;
    const m = world.surfaceMat({ vertexColors: true, map: tex, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3, roughness: 0.85 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, ATMO.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aSurf;
          varying float vSurf;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vSurf = aSurf;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vSurf;
          uniform float uWet;`)
        .replace('#include <map_fragment>', `
          // Atlas: Feld aus dem Belag-Attribut, Kachel innerhalb des Feldes wiederholt; Ableitungen der
          // ungefalteten UV, damit an den Kachelgrenzen keine Mipmap-Naht entsteht
          float sIdx = floor(vSurf + 0.5);
          vec2 cell = vec2(mod(sIdx, 4.0), floor(sIdx / 4.0));
          vec2 auv = (cell + 0.004 + fract(vMapUv) * 0.992) * vec2(0.25, 0.5);
          vec4 sampledDiffuseColor = textureGrad(map, auv, dFdx(vMapUv) * vec2(0.25, 0.5), dFdy(vMapUv) * vec2(0.25, 0.5));
          diffuseColor.rgb *= sampledDiffuseColor.rgb;   // Alpha bleibt 1 (Alphakanal = Spiegelstärke in post.js)`)
        .replace('#include <color_fragment>', `
          diffuseColor.rgb *= vColor.rgb * mix(1.0, 0.62, uWet);`);
    };
    m.customProgramCacheKey = () => 'urbanground';
    return this._mat = m;
  },

  // Topf (size, Ursprung wie Chunks)
  pots(size, ox, oz) { return { all: new Chunks(size || URBAN.chunk, ox || 0, oz || 0) }; },
  // Topf als Meshes in die Gruppe hängen
  finish(pots, group, world) {
    let n = 0;
    const M = this.material(world);
    for (const b of pots.all.map.values()) {
      const g = b.geometry();
      if (!g) continue;
      g.setAttribute('aSurf', new THREE.Float32BufferAttribute(b.surf, 1));
      const m = new THREE.Mesh(g, M);
      m.receiveShadow = true; m.userData.urban = true;
      group.add(m); n++;
      this.live.add(m);
    }
    return n;
  },
  // Nahbereich: ferne Töpfe nur für dieses Bild ausblenden (game.js hideFar stellt sie danach wieder her)
  live: new Set(),
  _s: null,
  cull(camera, hidden) {
    const S = this._s || (this._s = new THREE.Sphere()), cp = camera.position;
    for (const m of this.live) {
      if (!m.parent || (m.parent.isGroup && !m.parent.parent)) { this.live.delete(m); continue; }
      if (!m.visible) continue;
      S.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
      if (S.center.distanceTo(cp) - S.radius > URBAN.far) { m.visible = false; hidden.push(m); }
    }
  },
  // auf dieser Stufe an? (WebGPU-Probe: noch ohne Zwilling)
  enabled() {
    if (/[?&]urban=0/.test(location.search)) return false;
    if (typeof GfxProbe !== 'undefined' && GfxProbe.wanted) return false;
    if (/[?&]urban=1/.test(location.search)) return true;
    return typeof Mat === 'undefined' || Mat.budget.level === 'voll';
  },

  // Gebiet eines Gebäudes. info: { t: OSM-Typ, area, top (Höhe), alt (in der Altstadt), arch (Bautyp im Umland) }
  district(info) {
    const t = info.t || '';
    if (URBAN_NONE.has(t)) return 'none';
    if (URBAN_GAR.has(t)) return 'gar';
    if (URBAN_CHURCH.has(t)) return 'church';
    if (URBAN_PUB.has(t)) return 'pub';
    if (info.arch !== undefined) {
      // Umland: Bautyp (region.js ARCH)
      const a = info.arch;
      if (a === 7 || a === 8) return 'com';
      if (a === 9 || a === 10) return 'none';
      if (a === 11) return info.area < 60 ? 'gar' : 'none';
      if (a === 12) return 'pub';
      if (a === 2) return 'alt';
      if (a === 6) return 'urb';
      if (URBAN_COM.has(t)) return 'com';
      return 'res';
    }
    if (URBAN_COM.has(t) || info.area > 1600) return 'com';
    if (info.area < 22) return 'none';
    if (info.alt) return 'alt';
    if (info.top > 11 || t === 'apartments') return 'urb';
    return 'res';
  },

  // Helligkeit je Ort (fest, weich): ± 6 %
  shade(x, z) {
    const s = Math.sin(x * 0.071 + z * 0.023) * 0.5 + Math.sin(x * 0.019 - z * 0.057) * 0.5;
    return 1 + s * 0.06;
  },

  // Abstand entlang des Strahls (px, pz) + s·(nx, nz) bis zur nächsten Fahrbahnkante, oder Infinity.
  // roads: [{ax, az, bx, bz, w, k}], nur ungefähr parallel liegende Straßen zählen.
  rayToRoad(px, pz, nx, nz, roads, maxS) {
    let best = Infinity, kind = null, rot = 0;
    for (const s of roads) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const den = nx * dz - nz * dx;               // Kreuzprodukt Strahl × Abschnitt
      const sinA = Math.abs(den) / L;              // 1 = Straße senkrecht zum Strahl (parallel zur Hauskante)
      if (sinA < 0.45) continue;
      const qx = s.ax - px, qz = s.az - pz;
      const t = (qx * dz - qz * dx) / den;         // Strahlparameter
      const u = (qx * nz - qz * nx) / den;         // Abschnittsparameter
      if (u < -0.08 || u > 1.08 || t <= 0) continue;
      const edge = t - (s.w / 2) / sinA;
      if (edge < best && edge < maxS + 0.5) { best = edge; kind = s.k; rot = Math.atan2(dz, dx); }
    }
    return { d: best, k: kind, rot };
  },

  // Streifen um ein Gebäude. b: { p (flach [x,z,…]), ho? }, ctx: {
  //   h(x, z) Geländehöhe, roads(x, z, r) → Abschnitte, blocked(x, z) → true in einem (anderen) Gebäude/auf Wasser,
  //   plaza(x, z) → true auf einem gepflasterten Platz (dort nichts), pots, dist (Gebiet) }
  // Gibt die Kanten mit Straßenbezug zurück (für die Eingangswege).
  apron(b, ctx) {
    const S = URBAN.style[ctx.dist];
    if (!S) return null;
    const [streetSurf, streetMax, otherSurf, otherW] = S;
    const p = b.p, n = p.length / 2;
    if (n < 3) return null;
    let area2 = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area2 += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    const sgn = area2 > 0 ? 1 : -1;   // x-z-Ebene: Außennormale = (dz, -dx)·sgn
    const edges = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.05) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = uz * sgn, nz = -ux * sgn;
      // Stützpunkte entlang der Kante, je Stützpunkt Breite bis zur Fahrbahn
      const k = Math.max(1, Math.ceil(L / URBAN.step)), pts = [];
      let hits = 0, hitKind = null, rot = 0;
      const roads = L >= URBAN.minEdge && streetSurf ? ctx.roads((ax + bx) / 2, (az + bz) / 2, L / 2 + streetMax + 12) : [];
      for (let s = 0; s <= k; s++) {
        const f = s / k, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
        let w = null;
        if (roads.length) {
          const r = this.rayToRoad(x + nx * 0.05, z + nz * 0.05, nx, nz, roads, streetMax);
          if (r.d < streetMax) { w = Math.max(0.3, r.d + 0.25); hits++; hitKind = r.k; rot = r.rot; }
        }
        pts.push({ x, z, w });
      }
      let street = hits >= Math.max(1, (k + 1) * 0.5);
      if (street) {
        // Lücken mit dem Mittel füllen; Hindernis (Haus, Wasser) auf dem Weg kappt die ganze Kante
        let sum = 0, c = 0;
        for (const q of pts) if (q.w !== null) { sum += q.w; c++; }
        const avg = sum / c;
        let cap = Infinity;
        for (const f of [0.2, 0.5, 0.8]) {
          const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
          for (let s = 0.8; s < avg + 0.4; s += 0.9) if (ctx.blocked(x + nx * s, z + nz * s)) { cap = Math.min(cap, s - 0.2); break; }
        }
        for (const q of pts) q.w = Math.min(q.w === null ? avg : q.w, cap);
        if (cap < 0.6) street = false;
      }
      const surf = street ? (hitKind === 'plaza' ? 'sett' : streetSurf) : otherSurf;
      if (!surf) { edges.push(null); continue; }
      if (!street) for (const q of pts) q.w = otherW;
      if (ctx.plaza && ctx.plaza((ax + bx) / 2 + nx * 0.8, (az + bz) / 2 + nz * 0.8)) { edges.push(null); continue; }
      // Raster an der Straße ausrichten (gleiche Straße = gleiches Raster, Überlappungen unsichtbar); sonst Weltachsen
      const e = { ax, az, bx, bz, ux, uz, nx, nz, L, pts, surf, street, rot: street ? rot : 0 };
      edges.push(e);
      this.strip(e, ctx, !street);
      if (!street && ctx.photo && (ctx.dist === 'res' || ctx.dist === 'urb' || ctx.dist === 'pub')) this.lawn(e, ctx);
    }
    // Ecken: Keil zwischen den Streifen zweier Kanten an einer nach außen gewölbten Ecke
    const E = edges.filter(Boolean);
    for (let i = 0; i < edges.length; i++) {
      const a = edges[i], c = edges[(i + 1) % edges.length];
      if (!a || !c) continue;
      const cross = (a.ux * c.uz - a.uz * c.ux) * sgn;
      if (cross >= -0.02) continue;     // nach innen geknickt oder gerade: Streifen überlappen ohnehin
      const wa = a.pts[a.pts.length - 1].w, wc = c.pts[0].w;
      const vx = a.bx, vz = a.bz;
      if (a.street !== c.street) {
        // Straßenstreifen läuft um die Breite des schmalen Streifens über die Ecke weiter (sauberer Anschluss)
        const S = a.street ? a : c, w2 = a.street ? wc : wa, ws = a.street ? wa : wc, dir = a.street ? 1 : -1;
        const ux = S.ux * dir, uz = S.uz * dir;
        const q0 = [vx, vz], q1 = [vx + ux * w2, vz + uz * w2], q2 = [q1[0] + S.nx * ws, q1[1] + S.nz * ws], q3 = [vx + S.nx * ws, vz + S.nz * ws];
        this.mark(ctx, [...q0, ...q1, ...q2, ...q3]);
        this.tri(ctx, S.surf, q0, q1, q2, 1, false, S.rot);
        this.tri(ctx, S.surf, q0, q2, q3, 1, false, S.rot);
        continue;
      }
      const surf = wa >= wc ? a.surf : c.surf, w = Math.max(wa, wc), rt = wa >= wc ? a.rot : c.rot;
      let bxn = a.nx + c.nx, bzn = a.nz + c.nz;
      const bl = Math.hypot(bxn, bzn) || 1; bxn /= bl; bzn /= bl;
      const P1 = [vx + a.nx * wa, vz + a.nz * wa], P2 = [vx + bxn * w, vz + bzn * w], P3 = [vx + c.nx * wc, vz + c.nz * wc];
      this.mark(ctx, [vx, vz, ...P1, ...P2, ...P3]);
      this.tri(ctx, surf, [vx, vz], P1, P2, 1, false, rt);
      this.tri(ctx, surf, [vx, vz], P2, P3, 1, false, rt);
    }
    return E;
  },

  // Viereckstreifen einer Kante (mit Unterteilung quer, Randstein außen bei schmalen Streifen)
  strip(e, ctx, rim) {
    const pts = e.pts;
    for (let s = 0; s + 1 < pts.length; s++) {
      const A = pts[s], B = pts[s + 1];
      this.mark(ctx, [A.x, A.z, B.x, B.z, B.x + e.nx * B.w, B.z + e.nz * B.w, A.x + e.nx * A.w, A.z + e.nz * A.w]);
      const wmax = Math.max(A.w, B.w), m = Math.max(1, Math.ceil(wmax / URBAN.step));
      for (let q = 0; q < m; q++) {
        const f0 = q / m, f1 = (q + 1) / m;
        const a0 = [A.x + e.nx * A.w * f0, A.z + e.nz * A.w * f0], a1 = [A.x + e.nx * A.w * f1, A.z + e.nz * A.w * f1];
        const b0 = [B.x + e.nx * B.w * f0, B.z + e.nz * B.w * f0], b1 = [B.x + e.nx * B.w * f1, B.z + e.nz * B.w * f1];
        this.tri(ctx, e.surf, a0, b0, b1, 1, false, e.rot);
        this.tri(ctx, e.surf, a0, b1, a1, 1, false, e.rot);
      }
      if (rim && e.surf !== 'asphalt' && e.surf !== 'gravel') {
        // Randstein / Rasenkante: schmaler dunklerer Saum am äußeren Rand
        const r = URBAN.rim;
        const a1 = [A.x + e.nx * A.w, A.z + e.nz * A.w], b1 = [B.x + e.nx * B.w, B.z + e.nz * B.w];
        const a2 = [a1[0] + e.nx * r, a1[1] + e.nz * r], b2 = [b1[0] + e.nx * r, b1[1] + e.nz * r];
        this.tri(ctx, e.surf, a1, b1, b2, 0.62, false, e.rot);
        this.tri(ctx, e.surf, a1, b2, a2, 0.62, false, e.rot);
      }
    }
  },

  // Rasen hinter dem schmalen Streifen: nur wo das Luftbild Grün zeigt, nicht auf Fahrbahnen oder in Häusern.
  // Farbe je Ecke aus dem (weichgezeichneten) Luftbild, zur mittleren Rasenfarbe hin beruhigt; die Textur bringt
  // scharfe Halme. So passt der Rand zum Foto, die Fläche am Haus wird ruhiger und schärfer.
  lawn(e, ctx) {
    const pts = e.pts, W = URBAN.lawnW, m = 2;
    // calm: 0 = genau die Fotofarbe (äußerer Rand), 1 = innen beruhigt (Baumschatten angehoben, zur Rasenfarbe hin)
    const col = (x, z, calm) => {
      const k = (Math.round(x * 2) * 100003 + Math.round(z * 2)) * 2 + calm, c = this._lc || (this._lc = new Map());
      if (c.has(k)) return c.get(k);
      const p = ctx.photo(x, z), L = v => Math.pow(v / 255, 2.2);
      const r = L(p[0]), g = L(p[1]), b = L(p[2]), lum = 0.3 * r + 0.6 * g + 0.1 * b;
      const lift = calm ? Math.max(1, 0.06 / Math.max(lum, 0.01)) : 1, f = calm ? 0.35 : 0;
      const K = URBAN.lawnK, mr = 0.085, mg = 0.13, mb = 0.045;
      const v = [K * (r * lift * (1 - f) + mr * f), K * (g * lift * (1 - f) + mg * f), K * (b * lift * (1 - f) + mb * f)];
      c.set(k, v);
      return v;
    };
    const green = (x, z) => { const p = ctx.photo(x, z); return p[1] > p[0] * 1.02 && p[1] > p[2] * 1.06 && p[0] + p[1] + p[2] > 110; };
    for (let s = 0; s + 1 < pts.length; s++) {
      const A = pts[s], B = pts[s + 1];
      for (let q = 0; q < m; q++) {
        const f0 = A.w + W * q / m - 0.05, f1 = A.w + W * (q + 1) / m - 0.05, g0 = B.w + W * q / m - 0.05, g1 = B.w + W * (q + 1) / m - 0.05;
        const a0 = [A.x + e.nx * f0, A.z + e.nz * f0], a1 = [A.x + e.nx * f1, A.z + e.nz * f1];
        const b0 = [B.x + e.nx * g0, B.z + e.nz * g0], b1 = [B.x + e.nx * g1, B.z + e.nz * g1];
        const cx = (a0[0] + a1[0] + b0[0] + b1[0]) / 4, cz = (a0[1] + a1[1] + b0[1] + b1[1]) / 4;
        if (!green(cx, cz) || ctx.blocked(cx, cz) || ctx.blocked(a1[0], a1[1]) || ctx.blocked(b1[0], b1[1]) || (ctx.onRoad && ctx.onRoad(cx, cz))) break;
        // innerste Reihe ruhig, äußerste Kante exakt Fotofarbe (kein sichtbarer Rand)
        const C1 = p => col(p[0], p[1], 0);
        const ca0 = col(a0[0], a0[1], 1), cb0 = col(b0[0], b0[1], 1);
        const last = q === m - 1 || !green(cx + e.nx * W / m, cz + e.nz * W / m);
        const ca1 = last ? C1(a1) : col(a1[0], a1[1], 1), cb1 = last ? C1(b1) : col(b1[0], b1[1], 1);
        this.tri(ctx, 'lawn', a0, b0, b1, 1, false, 0, [ca0, cb0, cb1]);
        this.tri(ctx, 'lawn', a0, b1, a1, 1, false, 0, [ca0, cb1, ca1]);
        if (last) break;
      }
    }
  },

  // befestigte Fläche merken (Vieleck flach [x,z,…]); Bewuchs und Requisiten fragen sie mit paved() ab
  mark(ctx, poly) {
    if (!ctx.pave) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]); }
    ctx.pave.insert(poly, x0, z0, x1, z1);
  },
  // liegt (x, z) auf einer befestigten Fläche dieses Rasters?
  paved(grid, x, z) {
    if (!grid) return false;
    for (const p of grid.query(x, z, 0, this._pq || (this._pq = []))) if (U.pointInPoly(x, z, p)) return true;
    return false;
  },

  // Ein Dreieck in den Topf des Belags (Gelände-folgend, Welt-UV)
  tri(ctx, surf, a, b, c, bright, path, rot, cols) {
    const s = URBAN.surf[surf], pot = ctx.pots.all;
    const y = path ? URBAN.pathY : s.y;
    const P = q => [q[0], ctx.h(q[0], q[1]) + y, q[1]];
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[1] + b[1] + c[1]) / 3;
    const col = this._col || (this._col = new THREE.Color());
    col.set(s.col).multiplyScalar(bright * this.shade(cx, cz));
    const T = s.tile || 1, co = rot ? Math.cos(rot) : 1, si = rot ? Math.sin(rot) : 0;
    const uv = q => [(q[0] * co + q[1] * si) / T, (q[1] * co - q[0] * si) / T];
    const bk = pot.get(cx, cz), n0 = bk.pos.length;
    bk.tri(P(a), P(b), P(c), col, uv(a), uv(b), uv(c), 0, 1, 0);
    if (bk.pos.length === n0) return;
    if (!bk.surf) bk.surf = [];
    bk.surf.push(s.i, s.i, s.i);
    if (cols) {
      // Eckenfarben (Rasen aus dem Luftbild); Bucket.tri kann b und c getauscht haben
      const C = bk.col, k = C.length - 9, swapped = bk.pos[n0 + 3] !== P(b)[0] || bk.pos[n0 + 5] !== b[1];
      const order = swapped ? [cols[0], cols[2], cols[1]] : cols;
      for (let i = 0; i < 3; i++) { C[k + i * 3] = order[i][0]; C[k + i * 3 + 1] = order[i][1]; C[k + i * 3 + 2] = order[i][2]; }
    }
  },

  // ---------- Parkplätze (Phase U3) ----------
  // OSM-Parkfläche: Asphalt über die ganze Fläche (gelände-folgend), Stellplatz-Linien nach derselben Regel wie
  // SiteKit.parkingLines/ParkKit.stalls (die geparkten Autos stehen also genau in den Feldern), Zufahrt zur nächsten
  // Straße, falls die Fläche sie nicht schon berührt. ctx wie bei apron, dazu walk(x, z) → Gehsteighöhe oder null.
  lot(area, ctx) {
    const toV = p => { const a = []; for (let i = 0; i < p.length; i += 2) a.push(new THREE.Vector2(p[i], p[i + 1])); return a; };
    const contour = toV(area.p), holes = (area.ho || []).map(toV);
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return 0; }
    if (!faces.length) return 0;
    const all = contour.concat(...holes);
    this.mark(ctx, area.p);
    const emit = (a, b, c, depth) => {
      const ab = Math.hypot(a[0] - b[0], a[1] - b[1]), bc = Math.hypot(b[0] - c[0], b[1] - c[1]), ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.max(ab, bc, ca) > 2 * URBAN.step && depth < 10) {
        if (ab >= bc && ab >= ca) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; emit(a, m, c, depth + 1); emit(m, b, c, depth + 1); }
        else if (bc >= ca) { const m = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; emit(a, b, m, depth + 1); emit(a, m, c, depth + 1); }
        else { const m = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; emit(a, b, m, depth + 1); emit(m, b, c, depth + 1); }
        return;
      }
      this.tri(ctx, 'lot', a, b, c, 1, false, 0);
    };
    for (const fc of faces) emit([all[fc[0]].x, all[fc[0]].y], [all[fc[1]].x, all[fc[1]].y], [all[fc[2]].x, all[fc[2]].y], 0);
    const lines = this.stallLines(area, ctx);
    this.access(area, ctx);
    return lines;
  },
  // Stellplatz-Linien (gleiche Felder wie SiteKit.parkingLines: 2,5 m breit, 4,7 m tief, 0,3 m vom Rand)
  stallLines(area, ctx) {
    const ring = area.p, n = ring.length / 2;
    const inside = (x, z) => U.pointInPoly(x, z, ring) && !(area.ho && area.ho.some(h => U.pointInPoly(x, z, h)));
    const ok = (x, z) => inside(x, z) && !ctx.blockedM(x, z, 0.3) && !ctx.onRoadM(x, z, 0.3) && (!ctx.walk || ctx.walk(x, z) === null);
    let made = 0;
    const placed = [];   // Mitten der Linien (mit Kante): an Ecken überschneiden sich Reihen zweier Kanten
    for (let i = 0; i < n && made < 400; i++) {
      const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 7.5) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      let nx = -dz, nz = dx;
      if (!inside((ax + bx) / 2 + nx * 1.5, (az + bz) / 2 + nz * 1.5)) { nx = -nx; nz = -nz; }
      let first = null, last = null;
      for (let s0 = 1.2; s0 < len - 1.1; s0 += 2.5) {
        const x0 = ax + dx * s0 + nx * 0.3, z0 = az + dz * s0 + nz * 0.3, x1 = x0 + nx * 4.7, z1 = z0 + nz * 4.7;
        if (!ok(x0, z0) || !ok(x1, z1) || !ok((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (placed.some(p => p.i !== i && (p.x - mx) * (p.x - mx) + (p.z - mz) * (p.z - mz) < 5.5 * 5.5)) continue;
        placed.push({ x: mx, z: mz, i });
        const w = 0.06;
        this.tri(ctx, 'paint', [x0 - dx * w, z0 - dz * w], [x0 + dx * w, z0 + dz * w], [x1 + dx * w, z1 + dz * w], 1, false, 0);
        this.tri(ctx, 'paint', [x0 - dx * w, z0 - dz * w], [x1 + dx * w, z1 + dz * w], [x1 - dx * w, z1 - dz * w], 1, false, 0);
        if (first === null) first = s0;
        last = s0;
        made++;
      }
      // Abschlusslinie vorn (Fahrgasse) über die ganze Reihe
      if (first !== null && last > first) {
        const ex = nx * 5.0, ez = nz * 5.0, w = 0.06;
        const p0 = [ax + dx * first + ex, az + dz * first + ez], p1 = [ax + dx * last + ex, az + dz * last + ez];
        this.tri(ctx, 'paint', [p0[0] - nx * w, p0[1] - nz * w], [p1[0] - nx * w, p1[1] - nz * w], [p1[0] + nx * w, p1[1] + nz * w], 0.92, false, 0);
        this.tri(ctx, 'paint', [p0[0] - nx * w, p0[1] - nz * w], [p1[0] + nx * w, p1[1] + nz * w], [p0[0] + nx * w, p0[1] + nz * w], 0.92, false, 0);
      }
    }
    return made;
  },
  // Zufahrt: kürzeste Verbindung vom Rand der Fläche zur Fahrbahn (0,8–18 m), 5 m breit, nur wenn frei
  access(area, ctx) {
    const ring = area.p, n = ring.length / 2;
    let best = null;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1], len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len; s += 4) {
        const x = ax + (bx - ax) * s / (len || 1), z = az + (bz - az) * s / (len || 1);
        const r = ctx.nearest(x, z, 25);
        if (!r) continue;
        const gap = r.d - r.seg.w / 2;
        if (!best || gap < best.gap) best = { x, z, rx: r.x, rz: r.z, gap, d: r.d, w: r.seg.w };
      }
    }
    if (!best || best.gap < 0.8 || best.gap > 18) return false;
    const ux = (best.rx - best.x) / best.d, uz = (best.rz - best.z) / best.d, L = best.gap + 1.5, hw = 2.5;
    for (let s = 1; s < best.gap; s += 1) {
      const x = best.x + ux * s, z = best.z + uz * s;
      if (ctx.blocked(x, z) || ctx.blocked(x - uz * hw, z + ux * hw) || ctx.blocked(x + uz * hw, z - ux * hw)) return false;
    }
    // Rechteck vom Flächenrand (1 m hinein) bis unter die Fahrbahnkante
    const nx = -uz, nz = ux, x0 = best.x - ux, z0 = best.z - uz;
    const P = (a, b) => [x0 + ux * a + nx * b, z0 + uz * a + nz * b];
    const k = Math.max(1, Math.ceil((L + 1) / URBAN.step));
    for (let i = 0; i < k; i++) {
      const a0 = (L + 1) * i / k, a1 = (L + 1) * (i + 1) / k;
      this.tri(ctx, 'lot', P(a0, -hw), P(a1, -hw), P(a1, hw), 1, false, 0);
      this.tri(ctx, 'lot', P(a0, -hw), P(a1, hw), P(a0, hw), 1, false, 0);
    }
    this.mark(ctx, [...P(0, -hw), ...P(L + 1, -hw), ...P(L + 1, hw), ...P(0, hw)]);
    return true;
  },

  // ---------- Eingangswege (Phase U2) ----------
  // Wählt die Kante zur Straße (längste mit Straßenbezug, sonst die der nächsten Straße zugewandte) und legt einen
  // Weg von der Türmitte bis an den Streifen bzw. die Fahrbahn. Gibt { x, z, ox, oz } der Tür zurück oder null.
  entrance(b, edges, ctx) {
    if (!edges || !edges.length) return null;
    const S = URBAN.style[ctx.dist];
    if (!S || ctx.dist === 'gar' || ctx.dist === 'none') return null;
    // Kandidat: Straßenkante mit größter Länge
    let best = null;
    for (const e of edges) if (e.street && e.L >= 2.5 && (!best || e.L > best.L)) best = e;
    let pathLen = 0, toRoad = null;
    if (!best) {
      // keine Kante bis zur Straße: die der nächsten Straße zugewandte Kante, Weg bis höchstens 25 m
      let cx = 0, cz = 0;
      for (const e of edges) { cx += e.ax; cz += e.az; }
      cx /= edges.length; cz /= edges.length;
      const near = ctx.nearest(cx, cz, 40);
      if (!near) return null;
      let dot = -2;
      for (const e of edges) {
        if (e.L < 2.5) continue;
        const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2, dx = near.x - mx, dz = near.z - mz, dl = Math.hypot(dx, dz) || 1;
        const d = (dx * e.nx + dz * e.nz) / dl;
        if (d > dot) { dot = d; best = e; }
      }
      if (!best || dot < 0.35) return null;
      toRoad = near;
    }
    // Tür: Kantenmitte (fest, keine Zufallsverschiebung)
    const dx = (best.ax + best.bx) / 2, dz = (best.az + best.bz) / 2;
    const door = { x: dx, z: dz, ox: best.nx, oz: best.nz, e: best };
    const surf = ctx.dist === 'com' || ctx.dist === 'school' ? 'paver' : ctx.dist === 'alt' || ctx.dist === 'church' ? 'sett' : 'slab';
    const hw = ctx.dist === 'com' || ctx.dist === 'pub' || ctx.dist === 'school' ? 1.3 : ctx.dist === 'urb' ? 0.9 : 0.6;
    // Podest vor der Tür (immer, neutrale Standardlösung)
    const depth = ctx.dist === 'res' ? 1.4 : 1.8, pw = hw + 0.5;
    this.quad(ctx, surf, dx, dz, best.ux, best.uz, best.nx, best.nz, -pw, pw, 0, depth, 1.04);
    if (best.street) return door;          // Streifen reicht schon bis an die Fahrbahn
    // Weg bis zur Straße: geradeaus entlang der Normalen, nur wenn frei (kein Haus, keine Fahrbahn quer davor)
    const maxLen = 25, roads = ctx.roads(dx, dz, maxLen + 10);
    const r = this.rayToRoad(dx + best.nx * 0.05, dz + best.nz * 0.05, best.nx, best.nz, roads, maxLen);
    if (r.d < maxLen) pathLen = r.d + 0.2;
    else return door;                      // keine Straße geradeaus: nur das Podest (Stabilität vor Kreativität)
    for (let s = depth; s < pathLen; s += 0.8) {
      const x = dx + best.nx * s, z = dz + best.nz * s;
      if (ctx.blocked(x, z) || ctx.blocked(x + best.ux * hw, z + best.uz * hw) || ctx.blocked(x - best.ux * hw, z - best.uz * hw)) return door;
    }
    this.quad(ctx, surf, dx, dz, best.ux, best.uz, best.nx, best.nz, -hw, hw, depth - 0.05, pathLen, 1);
    door.path = pathLen;
    return door;
  },

  // Rechteck in (entlang u, quer n) um (x, z), unterteilt; als Wegbelag
  quad(ctx, surf, x, z, ux, uz, nx, nz, u0, u1, n0, n1, bright) {
    const mu = Math.max(1, Math.ceil((u1 - u0) / URBAN.step)), mn = Math.max(1, Math.ceil((n1 - n0) / URBAN.step));
    const P = (fu, fn) => { const u = u0 + (u1 - u0) * fu, v = n0 + (n1 - n0) * fn; return [x + ux * u + nx * v, z + uz * u + nz * v]; };
    this.mark(ctx, [...P(0, 0), ...P(1, 0), ...P(1, 1), ...P(0, 1)]);
    for (let i = 0; i < mu; i++) for (let j = 0; j < mn; j++) {
      const a = P(i / mu, j / mn), b = P((i + 1) / mu, j / mn), c = P((i + 1) / mu, (j + 1) / mn), d = P(i / mu, (j + 1) / mn);
      const rot = Math.atan2(uz, ux);   // Raster parallel zur Hauswand
      this.tri(ctx, surf, a, b, c, bright, true, rot);
      this.tri(ctx, surf, a, c, d, bright, true, rot);
    }
  },
};
if (typeof window !== 'undefined') window.UrbanKit = UrbanKit;
