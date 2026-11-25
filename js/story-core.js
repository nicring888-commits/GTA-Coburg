// Story-Modus (seit v3.22.0), Teil 2: Kern. Ein Objekt `Story` (in js/game.js erzeugt) mit den Bausteinen
//   StorySave            Story-Stand im normalen Spielstand (save.story, Schlüssel gta-coburg-v1 bzw. Speicherplätze)
//   Relationships        Beziehungen zu den Figuren (−100 … 100), Hinweise bei Änderungen
//   CharacterManager     Story-Figuren als 3D-Figuren (Player-Klasse + Zubehör), Laufen, Blick, Gesten beim Sprechen
//   CutsceneManager      Kamera-Einstellungen und -Fahrten, Kinobalken, Dialogkamera (Schuss/Gegenschuss)
//   WorldEventManager    Missionsmarker, Ziele mit Säule, Minikarten-Punkt und Route, Story-Requisiten (Voss-Plakat …)
//   MissionRun           eine laufende Mission: Etappen (Checkpoints), Warten, Ziele, Dialoge, Fehlschlag
//   Story                StoryManager + MissionManager: Kapitel, Fortschritt, Entscheidungen, Enden, Anbindung ans Spiel
// Missionen kommen aus js/story-k1.js (Kapitel 1) über StoryMissions.add(...). Online (net.online) ruht alles.
'use strict';

const STORY_ABORT = { abort: true };

// Kapitel (Titel, Abschlusssatz)
const STORY_CHAPTERS = [
  { n: 1, title: 'Zurück in Coburg', end: 'Ein Angebot, das sein Leben verändern könnte.' },
  { n: 2, title: 'Neue Möglichkeiten', end: 'Voss ist nicht so seriös, wie er vorgibt.' },
  { n: 3, title: 'Hinter den Kulissen', end: 'Ein Geschäftspartner verschwindet – und Leon gerät unter Verdacht.' },
  { n: 4, title: 'Kein Zurück', end: 'Leon war von Anfang an Teil eines größeren Plans.' },
  { n: 5, title: 'Die Wahrheit', end: 'Jemand aus dem engsten Kreis hat ihn hintergangen.' },
  { n: 6, title: 'Alles auf eine Karte', end: 'Der Plan geht nicht auf.' },
  { n: 7, title: 'Das Ende einer Geschichte', end: '' },
];

// Alle 35 Hauptmissionen (Titel, Kapitel); spielbar sind die, für die eine Missionsbeschreibung registriert ist
const STORY_LIST = [
  'Wieder daheim', 'Alte Zeiten', 'Eine Unterkunft', 'Der erste Auftrag', 'Ein interessanter Kontakt',
  'Neue Wege', 'Gute Geschäfte', 'Auf vier Rädern', 'Unter Geschäftsleuten', 'Eine offene Rechnung',
  'Die Journalistin', 'Unangenehme Fragen', 'Alte Bekannte', 'Verdächtige Geschäfte', 'Falsche Freunde',
  'Ärger in Coburg', 'Unter Beobachtung', 'Der falsche Verdacht', 'Eine Entscheidung', 'Konsequenzen',
  'Das große Geschäft', 'Verlorenes Vertrauen', 'Die Wahrheit kommt ans Licht', 'Ein neuer Verbündeter', 'Der Verrat',
  'Alte Rechnungen', 'Kein einfacher Ausweg', 'Alles verändert sich', 'Zusammenhalt', 'Der letzte Auftrag',
  'Der Wendepunkt', 'Die Abrechnung', 'Nichts bleibt geheim', 'Letzte Entscheidungen', 'Zurück in die Zukunft',
].map((title, i) => ({ id: 'm' + String(i + 1).padStart(2, '0'), n: i + 1, chapter: Math.floor(i / 5) + 1, title }));

const StoryMissions = {
  defs: {},
  add(def) { this.defs[def.id] = def; },
  get(id) { return this.defs[id] || null; },
};

// ---------------------------------------------------------------------------------------------------------------
// Speicherstand
// ---------------------------------------------------------------------------------------------------------------
const StorySave = {
  REL0: { max: 40, tobi: 30, sarah: 0, voss: 0 },
  fresh() { return { v: 1, chapter: 1, done: [], flags: {}, rel: { ...this.REL0 }, stats: { fails: 0, time: 0 }, ending: null, t0: Date.now() }; },
  // fehlende Teile ergänzen (ältere Stände)
  fix(s) {
    if (!s || typeof s !== 'object' || s.v !== 1) return this.fresh();
    s.done = Array.isArray(s.done) ? s.done.filter(id => typeof id === 'string') : [];
    s.flags = s.flags && typeof s.flags === 'object' ? s.flags : {};
    s.rel = Object.assign({ ...this.REL0 }, s.rel || {});
    s.stats = Object.assign({ fails: 0, time: 0 }, s.stats || {});
    s.chapter = U.clamp(s.chapter | 0 || 1, 1, 7);
    return s;
  },
  summary(s) {
    if (!s || !s.done) return '';
    const n = s.done.length;
    return s.ending ? `Story abgeschlossen (Ende ${s.ending})` : `Kapitel ${s.chapter} · ${n}/35 Missionen`;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Beziehungen
// ---------------------------------------------------------------------------------------------------------------
class Relationships {
  constructor(S) { this.S = S; }
  get(who) { return this.S.state.rel[who] || 0; }
  add(who, d, quiet) {
    if (!d) return;
    const R = this.S.state.rel;
    R[who] = U.clamp((R[who] || 0) + d, -100, 100);
    if (!quiet) this.S.hud.rel(who, d);
  }
  // Verbündete für die Enden: Max, Sarah, Tobi mit mindestens 20
  allies() { return ['max', 'sarah', 'tobi'].filter(w => this.get(w) >= 20).length; }
  label(v) { return v >= 60 ? 'Vertraut' : v >= 30 ? 'Freundlich' : v >= 5 ? 'Bekannt' : v > -20 ? 'Neutral' : v > -50 ? 'Misstrauisch' : 'Feindlich'; }
}

// ---------------------------------------------------------------------------------------------------------------
// Figuren
// ---------------------------------------------------------------------------------------------------------------
class CharacterManager {
  constructor(S) {
    this.S = S;
    this.figs = new Map();
    this.t = 0;
    const F = U.figParts();
    for (const k of ['torso', 'head']) F[k].computeBoundingBox();
    this.dims = { front: F.torso.boundingBox.max.z, face: F.head.boundingBox.max.z, headTop: F.head.boundingBox.max.y };
  }

  spawn(id, x, z, heading = 0) {
    this.remove(id);
    const G = this.S.G, C = STORY_CAST[id] || STORY_CAST.leon;
    const p = new Player(G.scene, C.look);
    this.dress(p, C.look);
    p.place(x, z, G.world);
    p.heading = heading; p.sync();
    const f = { id, p, talk: 0, look: null, walk: null, hidden: false, solid: true };
    this.figs.set(id, f);
    return f;
  }

  // Zubehör: Brille, Bart, Krawatte, Kettchen, Locken, Bob
  dress(p, L) {
    const D = this.dims, g = p.group;
    const box = (w, h, d, color, x, y, z, r = 0.02) => {
      const m = new THREE.Mesh(U.mergeParts([[U.roundBox(w, h, d, r, 2), 0, 0, 0]]), new THREE.MeshLambertMaterial({ color, vertexColors: true }));
      m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    const fz = 1.73, face = D.face;
    if (L.glasses) { box(0.075, 0.05, 0.015, '#151515', 0.065, fz + 0.03, face + 0.005, 0.01); box(0.075, 0.05, 0.015, '#151515', -0.065, fz + 0.03, face + 0.005, 0.01); box(0.05, 0.012, 0.012, '#151515', 0, fz + 0.04, face + 0.008, 0.004); }
    if (L.beard) box(0.24, 0.14, 0.1, L.beard, 0, fz - 0.1, face - 0.04, 0.05);
    if (L.tie) { box(0.07, 0.36, 0.02, L.tie, 0, 1.3, D.front + 0.01, 0.01); box(0.2, 0.06, 0.03, '#f2f2f2', 0, 1.49, D.front - 0.01, 0.02); }
    if (L.chain) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 18, Math.PI), new THREE.MeshLambertMaterial({ color: '#e8c45a' })); t.position.set(0, 1.5, D.front - 0.04); t.rotation.set(Math.PI * 0.62, 0, Math.PI); g.add(t); }
    if (L.curls) box(0.36, 0.14, 0.36, L.hair, 0, 1.94, 0, 0.07);
    if (L.bob) box(0.34, 0.26, 0.16, L.hair, 0, 1.78, -0.1, 0.06);
  }

  get(id) { return this.figs.get(id) || null; }
  remove(id) {
    const f = this.figs.get(id);
    if (!f) return;
    this.S.G.scene.remove(f.p.group);
    f.p.group.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    this.figs.delete(id);
  }
  clear() { for (const id of [...this.figs.keys()]) this.remove(id); }

  hide(id, h = true) { const f = this.get(id); if (f) { f.hidden = h; f.p.visible = !h; } }
  // zu einem Punkt laufen; Promise nach Ankunft (oder nach maxT Sekunden)
  walkTo(id, x, z, run = false, maxT = 20) {
    const f = this.get(id);
    if (!f) return Promise.resolve();
    return new Promise(res => { f.walk = { x, z, run, t: maxT, res }; });
  }
  face(id, x, z) { const f = this.get(id); if (f) f.look = { x, z }; }

  update(dt) {
    this.t += dt;
    const G = this.S.G, W = G.world, pl = G.player();
    for (const f of this.figs.values()) {
      if (f.hidden) continue;
      const p = f.p;
      let move = { x: 0, z: 0, run: false, jump: false };
      if (f.walk) {
        const dx = f.walk.x - p.x, dz = f.walk.z - p.z, d = Math.hypot(dx, dz);
        f.walk.t -= dt;
        if (d < 0.5 || f.walk.t <= 0) { const r = f.walk.res; f.walk = null; r(); }
        else move = { x: dx / d, z: dz / d, run: f.walk.run, jump: false };
      }
      p.update(dt, move, W, []);
      if (!f.walk && f.look) {
        const want = Math.atan2(f.look.x - p.x, f.look.z - p.z);
        p.heading += U.wrapAngle(want - p.heading) * (1 - Math.exp(-6 * dt));
        p.sync();
      }
      // Gesten beim Sprechen: Arme heben und bewegen, Oberkörper wippt leicht
      if (f.talk > 0) {
        f.talk = Math.max(0, f.talk - dt);
        const k = Math.min(1, f.talk * 2), t = this.t + f.id.length;
        p.armR.rotation.x = -0.35 * k - 0.35 * k * (0.5 + 0.5 * Math.sin(t * 4.3));
        p.armR.rotation.y = 0.25 * k;
        p.armL.rotation.x = -0.2 * k * (0.5 + 0.5 * Math.sin(t * 3.1 + 1));
        p.group.rotation.z = Math.sin(t * 2.6) * 0.02 * k;
      } else p.group.rotation.z = 0;
      // Spieler nicht durch Story-Figuren laufen lassen
      if (f.solid && G.mode() === 'walk' && pl) {
        const dx = pl.x - p.x, dz = pl.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-3) { pl.x = p.x + dx / d * 0.7; pl.z = p.z + dz / d * 0.7; }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Kamera
// ---------------------------------------------------------------------------------------------------------------
class CutsceneManager {
  constructor(S) { this.S = S; this.shot = null; this.queue = null; this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); }
  get active() { return !!this.shot; }

  // feste Einstellung (bis zur nächsten oder clear); shot: { pos, look, to: { pos, look }, dur, fov }
  set(shot) {
    const s = Object.assign({ t: 0, dur: 0, fov: 50 }, shot);
    // Kamera nicht in Wänden: feste Positionen zum Blickziel hin ziehen, bis frei
    if (Array.isArray(s.pos) && Array.isArray(s.look)) s.pos = this.free(s.pos, s.look);
    if (s.to && Array.isArray(s.to.pos)) s.to = { ...s.to, pos: this.free(s.to.pos, Array.isArray(s.to.look) ? s.to.look : s.look) };
    this.shot = s;
  }
  // frei = nicht in einem Haus (mit 0,6 m Abstand) oder über dem Dach, über dem Boden
  clearAt(x, y, z) {
    const W = this.S.G.world, B = W.insideBuilding(x, z, 0.6);
    return (!B || y > B.top + 0.6) && y > W.heightAt(x, z) + 0.35;
  }
  free(pos, look) {
    if (typeof look === 'function') return pos;
    const [x, y, z] = pos, [lx, ly, lz] = look;
    const d = Math.hypot(x - lx, y - ly, z - lz);
    for (let f = 1; f > 0.05; f -= 0.06) {
      const px = lx + (x - lx) * f, py = ly + (y - ly) * f, pz = lz + (z - lz) * f;
      if (d * f < 1.2) break;
      let ok = this.clearAt(px, py, pz);
      // freie Sicht zum Ziel
      for (let i = 1; ok && i < 8; i++) { const g = i / 8; ok = this.clearAt(px + (lx - px) * g * 0.85, py + (ly - py) * g * 0.85, pz + (lz - pz) * g * 0.85) || g > 0.8; }
      if (ok) return [px, py, pz];
    }
    return [x, Math.max(y, this.S.G.world.heightAt(x, z) + 6), z];
  }
  clear() { this.shot = null; this.queue = null; const C = this.S.G.cam; C.init = false; }

  // Folge von Einstellungen; Promise nach der letzten (Esc überspringt)
  play(shots) {
    return new Promise(res => { this.queue = { list: shots.slice(), res }; this.nextShot(); });
  }
  nextShot() {
    const Q = this.queue;
    if (!Q) return;
    const s = Q.list.shift();
    if (!s) { this.queue = null; Q.res(); return; }
    this.set(s);
    if (s.fx) try { s.fx(); } catch (e) { console.warn(e); }
  }
  skip() { if (this.queue) { const Q = this.queue; this.queue = null; Q.res(); } }

  update(dt) {
    const s = this.shot;
    if (!s) return;
    s.t += dt;
    if (this.queue && s.dur && s.t >= s.dur) this.nextShot();
  }

  apply(camera, dt) {
    const s = this.shot;
    const P = v => typeof v === 'function' ? v() : v;
    let pos = P(s.pos), look = P(s.look);
    if (s.to && s.dur) {
      const k = U.clamp(s.t / s.dur, 0, 1), e = k * k * (3 - 2 * k);
      const p2 = P(s.to.pos || s.pos), l2 = P(s.to.look || s.look);
      pos = [pos[0] + (p2[0] - pos[0]) * e, pos[1] + (p2[1] - pos[1]) * e, pos[2] + (p2[2] - pos[2]) * e];
      look = [look[0] + (l2[0] - look[0]) * e, look[1] + (l2[1] - look[1]) * e, look[2] + (l2[2] - look[2]) * e];
    }
    // leichtes Handkamera-Atmen
    const t = performance.now() / 1000, sway = s.still ? 0 : 0.02;
    camera.position.set(pos[0] + Math.sin(t * 0.7) * sway, pos[1] + Math.sin(t * 0.9) * sway, pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
  }

  // Dialogkamera: über die Schulter des Zuhörers auf den Sprecher, sonst Halbtotale von der Seite
  dialogShot(speaker, listener, kind) {
    const W = this.S.G.world;
    const a = speaker, b = listener || speaker;
    const head = (o, h = 1.62) => [o.x, o.y + h, o.z];
    const clear = (x, y, z, tx, ty, tz) => {
      if (!this.clearAt(x, y, z)) return false;
      for (let i = 1; i <= 6; i++) { const f = i / 6 * 0.9, px = x + (tx - x) * f, pz = z + (tz - z) * f, py = y + (ty - y) * f; const B = W.insideBuilding(px, pz, 0.2); if (B && py < B.top + 0.5) return false; }
      return true;
    };
    if (kind !== 'wide' && listener && listener !== speaker) {
      let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      for (const side of [1, -1]) {
        const px = b.x + dx * 1.35 - dz * 0.6 * side, pz = b.z + dz * 1.35 + dx * 0.6 * side, py = b.y + 1.75;
        const L = head(a);
        if (clear(px, py, pz, L[0], L[1], L[2])) return { pos: [px, py, pz], look: L, fov: kind === 'close' ? 34 : 42, still: false };
      }
    }
    // Zweier von der Seite bzw. Nahe von vorn bei Selbstgesprächen
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
    let nx = -(b.z - a.z), nz = b.x - a.x; let nl = Math.hypot(nx, nz);
    if (nl < 0.1) { nx = Math.sin(a.heading); nz = Math.cos(a.heading); nl = 1; }
    nx /= nl; nz /= nl;
    const dist = listener && listener !== speaker ? 4.2 : 2.6;
    for (const side of [1, -1, 0.6, -0.6]) {
      const px = mx + nx * dist * side, pz = mz + nz * dist * side, py = my + 1.7;
      if (clear(px, py, pz, mx, my + 1.4, mz)) return { pos: [px, py, pz], look: [mx, my + 1.45, mz], fov: 45 };
    }
    return { pos: [mx + nx * 2, my + 4, mz + nz * 2], look: [mx, my + 1.4, mz], fov: 50 };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Welt: Marker, Ziele, Route, Requisiten
// ---------------------------------------------------------------------------------------------------------------
class WorldEventManager {
  constructor(S) {
    this.S = S;
    this.markers = new Map();   // Mission → { x, z, beacon, label }
    this.target = null;         // { x, z, r, beacon, name, route, costs, routeT }
    this.props = [];
    this.extra = [];            // Missionsgegenstände (Kisten …)
    this.route = null;
  }
  get G() { return this.S.G; }

  ground(x, z) { const W = this.G.world; return W.groundAt ? W.groundAt(x, z, Infinity) : W.heightAt(x, z); }
  anchor(o, x, z, dy) { o.position.set(x, this.G.world.heightAt(x, z) + dy, z); if (this.G.world.region) this.G.world.region.anchor(o, x, z, dy); }

  addMarker(id, x, z, name, contact) {
    this.removeMarker(id);
    const C = STORY_CAST[contact] || STORY_CAST.leon;
    const b = makeBeacon('#ffd23a', 1.6, 16);
    this.anchor(b, x, z, -0.3);
    this.G.scene.add(b);
    const lab = makeLabel(name, C.color, 'Mission · ' + C.name);
    this.anchor(lab, x, z, 4.2);
    lab.userData.range = 160;
    this.G.ui.addLabel(lab, this.G.scene);
    this.markers.set(id, { x, z, beacon: b, label: lab, name, contact });
  }
  removeMarker(id) {
    const m = this.markers.get(id);
    if (!m) return;
    this.G.scene.remove(m.beacon); m.beacon.geometry.dispose(); m.beacon.material.dispose();
    this.G.ui.removeLabel(m.label); m.label.material.map.dispose(); m.label.material.dispose();
    this.markers.delete(id);
  }
  clearMarkers() { for (const id of [...this.markers.keys()]) this.removeMarker(id); }
  markersVisible(on) { for (const m of this.markers.values()) { m.beacon.visible = on; m.label.userData.hidden = !on; } }

  // Ziel: Säule, Minikarten-Punkt (am Rand festgehalten), Route im Auto
  setTarget(x, z, o = {}) {
    this.clearTarget();
    const T = { x, z, r: o.r || 4, name: o.name || 'Ziel', route: o.route !== false, routeT: 0, costs: null };
    if (o.beacon !== false) {
      T.beacon = makeBeacon(o.color || '#ffd23a', Math.max(1.2, Math.min(T.r * 0.7, 4)), o.tall ? 30 : 9);
      this.anchor(T.beacon, x, z, -0.3);
      this.G.scene.add(T.beacon);
    }
    this.target = T;
    return T;
  }
  clearTarget() {
    const T = this.target;
    if (!T) return;
    if (T.beacon) { this.G.scene.remove(T.beacon); T.beacon.geometry.dispose(); T.beacon.material.dispose(); }
    this.target = null; this.route = null;
  }

  // Route alle 1,5 s neu (nur im Auto); Kostentabelle je Ziel einmal
  updateRoute(dt, px, pz, driving) {
    const T = this.target;
    if (!T || !T.route || !driving || !this.G.nav) { this.route = null; return; }
    if ((T.routeT -= dt) > 0) return;
    T.routeT = 1.5;
    const nav = this.G.nav;
    if (!T.costs) { const loc = nav.locate(T.x, T.z, 300); if (!loc) { T.route = false; return; } T.costs = nav.costsFrom(loc, 2400); }
    const p = nav.route(T.costs, px, pz, 6000);
    this.route = p.length >= 4 ? { path: p.concat([T.x, T.z]) } : null;
  }

  blips() {
    const out = [];
    for (const m of this.markers.values()) out.push({ x: m.x, z: m.z, type: 'story', name: 'Mission: ' + m.name });
    if (this.target) out.push({ x: this.target.x, z: this.target.z, type: 'storyTarget', name: this.target.name });
    return out;
  }

  // Story-Requisiten: Voss-Plakat am Markt, Schild „Kfz Weber“ an der Lackiererei Nord
  buildProps() {
    if (this.props.length) return;
    const G = this.G, W = G.world;
    // Plakatwand auf dem Marktplatz (freie Stelle, nicht auf der Fahrbahn), Bild zur Platzmitte
    // nahe dem Bratwurststand (Blickachse von Erwin), freie Stelle mit 2,6 m Platz, nicht auf der Fahrbahn
    const gr = G.props && G.props.grill ? G.props.grill : { x: -6, z: 36 };
    const want = { x: gr.x - 12, z: gr.z - 9 };
    const free = (x, z) => !W.insideBuilding(x, z, 2.8) && !W.collideCircle(x, z, 2.6, {}).hit && !(W.nearRoad && W.nearRoad(x, z, 1) && W.nearRoad(x, z, 1).k === 'road');
    let sp = null, bd = Infinity;
    for (let x = -44; x <= 44; x += 2) for (let z = -40; z <= 52; z += 2) {
      const d = Math.hypot(x - want.x, z - want.z), dg = Math.hypot(x - gr.x, z - gr.z);
      if (d < bd && dg > 7 && free(x, z)) { bd = d; sp = [x, z]; }
    }
    if (sp) {
      const [x, z] = sp, g = new THREE.Group(), y = W.heightAt(x, z);
      const tex = new THREE.CanvasTexture(this.posterCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9), new THREE.MeshLambertMaterial({ map: tex }));
      panel.position.y = 2.75; g.add(panel);
      const back = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.1, 0.12), new THREE.MeshLambertMaterial({ color: '#2a2c30' }));
      back.position.set(0, 2.75, -0.08); g.add(back);
      for (const sx of [-1.8, 1.8]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), new THREE.MeshLambertMaterial({ color: '#2a2c30' })); post.position.set(sx, 0.65, -0.08); g.add(post); }
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(x, y, z);
      g.rotation.y = Math.atan2(gr.x - x, gr.z - z);
      G.scene.add(g);
      this.props.push(g);
      this.poster = { x, z, y, ry: g.rotation.y };
    }
    // Schild der Werkstatt
    const ws = this.S.workshop();
    if (ws) {
      const lab = makeLabel('Kfz Weber', '#5fa0ff', 'Meisterbetrieb · Tobias Weber');
      this.anchor(lab, ws.x, ws.z, 7.5); lab.userData.range = 140;
      G.ui.addLabel(lab, G.scene);
      this.props.push(lab); lab.userData.isLabel = true;
    }
  }
  removeProps() {
    for (const o of this.props) {
      if (o.userData.isLabel) { this.G.ui.removeLabel(o); continue; }
      this.G.scene.remove(o);
      o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } });
    }
    this.props = []; this.poster = null;
  }

  posterCanvas() {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 646;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 646); g.addColorStop(0, '#0f2236'); g.addColorStop(0.62, '#3a6f8f'); g.addColorStop(1, '#d9a35a');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 646);
    // Silhouette: Wohntürme an der Itz, Veste im Hintergrund
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(620, 300); c.lineTo(700, 250); c.lineTo(780, 262); c.lineTo(860, 240); c.lineTo(940, 300); c.closePath(); c.fill();
    const towers = [[90, 210, 90], [200, 150, 110], [330, 240, 80], [430, 120, 120], [570, 200, 95], [690, 260, 70], [790, 180, 100]];
    for (const [x, top, w] of towers) {
      c.fillStyle = '#e8eef2'; c.fillRect(x, top + 120, w, 646 - top - 120 - 110);
      c.fillStyle = 'rgba(30,60,90,0.55)';
      for (let yy = top + 136; yy < 646 - 120; yy += 22) for (let xx = x + 8; xx < x + w - 10; xx += 18) c.fillRect(xx, yy, 10, 12);
    }
    c.fillStyle = '#3a8f5a'; c.fillRect(0, 536, 1024, 30);
    c.fillStyle = '#4a90b8'; c.fillRect(0, 566, 1024, 80);
    c.fillStyle = 'rgba(10,15,25,0.86)'; c.fillRect(0, 0, 1024, 118);
    c.fillStyle = '#e9b949'; c.font = '700 30px Inter, Segoe UI, sans-serif'; c.fillText('VOSS PROJEKTENTWICKLUNG', 40, 48);
    c.fillStyle = '#fff'; c.font = '800 54px Inter, Segoe UI, sans-serif'; c.fillText('QUARTIER ITZAUE', 40, 102);
    c.fillStyle = 'rgba(10,15,25,0.8)'; c.fillRect(540, 560, 484, 86);
    c.fillStyle = '#fff'; c.font = '600 34px Inter, Segoe UI, sans-serif'; c.fillText('Neue Mitte Coburg 2030', 562, 600);
    c.fillStyle = '#e9b949'; c.font = '500 22px Inter, Segoe UI, sans-serif'; c.fillText('Wohnen · Arbeiten · Leben an der Itz', 562, 632);
    return cv;
  }

  // einfache Kiste (Umzugskisten u. Ä.)
  box(x, z, color = '#b08a5a', label) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.42), new THREE.MeshLambertMaterial({ color }));
    m.castShadow = true;
    m.position.set(x, this.ground(x, z) + 0.2, z);
    this.G.scene.add(m);
    const o = { mesh: m, x, z, label };
    this.extra.push(o);
    return o;
  }
  removeExtra(o) { const i = this.extra.indexOf(o); if (i >= 0) this.extra.splice(i, 1); this.G.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
  clearExtra() { for (const o of this.extra.slice()) this.removeExtra(o); }
}

// ---------------------------------------------------------------------------------------------------------------
// Eine laufende Mission
// ---------------------------------------------------------------------------------------------------------------
class MissionRun {
  constructor(S, def, stage = 0, retry = false) {
    this.S = S; this.G = S.G; this.def = def; this.stage = stage; this.retry = retry;
    this.waiters = []; this.watchers = []; this.ticks = []; this.cleanups = [];
    this.cars = []; this.dead = false; this.t = 0; this.stageT = 0;
    this.interactT = null; this.events = [];
    this.lock = 0;     // > 0: Spieler-Eingabe gesperrt (Szenen)
    this.timerLeft = null; this.timerMsg = '';
  }
  get flags() { return this.S.state.flags; }
  get player() { return this.G.player(); }
  get car() { return this.G.car(); }
  get mode() { return this.G.mode(); }
  get pos() { const c = this.mode === 'drive' ? this.car : this.player; return { x: c.x, z: c.z }; }

  async run() {
    const stages = this.def.stages;
    try {
      for (; this.stage < stages.length; this.stage++) {
        this.stageT = 0; this.events = [];
        this.S.checkpoint(this);
        await stages[this.stage].run(this);
        this.alive();
        this.retry = false;
      }
      this.S.complete(this);
    } catch (e) {
      if (e === STORY_ABORT) return;
      console.error('Mission', this.def.id, e);
      if (!this.dead) this.S.failed(this, 'Interner Fehler: ' + (e && e.message));
    }
  }

  alive() { if (this.dead) throw STORY_ABORT; }
  // nach dem Warten prüfen, ob die Mission noch läuft; nicht abgewartete Versprechen (Untertitel) melden keinen Fehler
  guard(p) { const q = Promise.resolve(p).then(v => { this.alive(); return v; }); q.catch(() => {}); return q; }
  abort() {
    this.dead = true;
    for (const w of this.waiters) w.rej(STORY_ABORT);
    this.waiters = []; this.watchers = []; this.ticks = [];
  }

  tick(dt) {
    if (this.dead) return;
    this.t += dt; this.stageT += dt;
    if (this.timerLeft !== null) {
      this.timerLeft -= dt;
      this.S.hud.timer(this.timerLeft);
      if (this.timerLeft <= 0) { this.fail(this.timerMsg || 'Die Zeit ist abgelaufen.'); return; }
    }
    for (const w of this.watchers) { const r = w(dt); if (r) { this.fail(r); return; } }
    // während des Takts neu angelegte Aufgaben (z. B. autoDrive aus einem every heraus) nicht verlieren
    const cur = this.ticks; this.ticks = [];
    const keep = cur.filter(f => !f(dt));
    if (this.dead) { this.ticks = []; return; }
    this.ticks = keep.concat(this.ticks);
    for (const w of this.waiters.slice()) {
      if (this.dead) return;
      let ok = false;
      try { ok = w.fn(dt); } catch (e) { console.warn(e); }
      if (ok) { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); w.res(ok); } }
    }
  }

  // ---------- Bausteine für Missionsskripte ----------
  wait(fn) { this.alive(); const q = new Promise((res, rej) => this.waiters.push({ fn, res, rej })); q.catch(() => {}); return q; }
  sleep(s) { let t = 0; return this.wait(dt => (t += dt) >= s); }
  watch(fn) { this.watchers.push(fn); return fn; }
  unwatch(fn) { this.watchers = this.watchers.filter(w => w !== fn); }
  every(fn) { this.ticks.push(fn); }
  // beim Aufräumen (Erfolg, Fehlschlag, Abbruch) ausführen, z. B. Missionsrequisiten entfernen
  onCleanup(fn) { this.cleanups.push(fn); }
  objective(html) { this.S.hud.objective(html); }
  fail(reason) { if (!this.dead) this.S.failed(this, reason); }
  rel(who, d) { this.S.rel.add(who, d); }
  money(n) { this.G.addMoney(n); }
  flag(k, v = true) { this.flags[k] = v; }

  timer(secs, msg) { this.timerLeft = secs; this.timerMsg = msg || ''; this.S.hud.timer(secs); }
  stopTimer() { this.timerLeft = null; this.S.hud.timer(null); }
  meter(label, f) { this.S.hud.meter(label, f); }

  title(top, main, sub, secs) { this.S.hud.card(top, main, sub, secs); }
  sms(who, text) { this.S.hud.phone('sms', who, text, 7); this.G.audio.beep && this.G.audio.beep(1320, 0.07, 0, 'sine', 0.06); this.G.audio.beep && this.G.audio.beep(1760, 0.09, 0.09, 'sine', 0.06); }
  // Anruf: Handy einblenden, Zeilen als Untertitel
  call(who, lines) { const q = this._call(who, lines); q.catch(() => {}); return q; }   // auch ohne await sicher
  async _call(who, lines) {
    this.S.hud.phone('call', who, '', 999);
    if (this.G.audio.beep) { for (let i = 0; i < 2; i++) this.G.audio.beep(880, 0.25, i * 0.45, 'sine', 0.05); }
    await this.guard(this.S.dialog.sub(lines));
    this.S.hud.phoneT = 0.6;
  }
  say(lines) { return this.guard(this.S.dialog.sub(lines)); }
  doc(title, html) { this.lock++; return this.guard(this.S.hud.doc(title, html).finally(() => { this.lock--; })); }

  // Figuren
  npc(id, x, z, heading) { const f = this.S.chars.spawn(id, x, z, heading); return f; }
  npcAt(id, pt, heading) { const p = this.S.walkable(pt.x, pt.z, 12) || pt; return this.npc(id, p.x, p.z, heading === undefined ? Math.atan2(this.player.x - p.x, this.player.z - p.z) : heading); }
  fig(id) { return this.S.chars.get(id); }
  // Auto für die Mission (wird am Ende entfernt, außer keep)
  vehicle(kind, color, x, z, heading) {
    const G = this.G;
    let c;
    if (heading === undefined || heading === null) c = G.parkCarNear(x, z, color, kind);
    else { c = new Vehicle(G.scene, color, kind); c.place(x, z, heading, G.world); G.parked.push(c); }
    if (c) { c.story = this.def.id; this.cars.push(c); }
    return c;
  }
  inCar(c) { return this.mode === 'drive' && (!c || this.car === c); }

  // Ziel anfahren/anlaufen. o: { r, text, name, car (Auto oder true), foot, slow (m/s), beacon, route }
  goto(pt, o = {}) {
    const T = this.S.world.setTarget(pt.x, pt.z, { r: o.r, name: o.name || 'Ziel', beacon: o.beacon, route: o.route, tall: o.tall, color: o.color });
    if (o.text) this.objective(o.text);
    return this.wait(() => {
      const p = this.pos, d = Math.hypot(p.x - pt.x, p.z - pt.z);
      if (d > T.r) return false;
      if (o.car === true && this.mode !== 'drive') return false;
      if (o.car && o.car !== true && !this.inCar(o.car)) return false;
      if (o.foot && this.mode !== 'walk') return false;
      if (o.slow !== undefined && this.mode === 'drive' && Math.abs(this.car.speed) > o.slow) return false;
      return true;
    }).then(v => { if (this.S.world.target === T) this.S.world.clearTarget(); return v; });
  }

  // auf E bei einer Figur oder einem Punkt warten
  interact(target, label, r = 2.6) {
    const get = () => typeof target === 'string' ? (this.fig(target) && this.fig(target).p) : target;
    this.interactT = { get, label, r, hit: false };
    return this.wait(() => {
      const I = this.interactT;
      if (!I || !I.hit) return false;
      this.interactT = null; return true;
    });
  }

  // Szene mit Dialogkamera: who = beteiligte Figuren (Story-IDs; 'leon' = Spieler)
  async talk(lines, o = {}) {
    this.alive();
    this.lock++;
    const S = this.S;
    if (this.mode === 'walk') this.player.moveSpeed = 0;
    S.hud.cine(true);
    const figOf = id => id === 'leon' ? this.player : (this.fig(id) && this.fig(id).p);
    const others = (o.with || []).filter(id => id !== 'leon' && this.fig(id));
    // alle schauen einander an
    const center = () => { const all = [this.player, ...others.map(figOf)]; let x = 0, z = 0; for (const f of all) { x += f.x; z += f.z; } return { x: x / all.length, z: z / all.length }; };
    if (others.length && this.mode === 'walk') {
      const f0 = figOf(others[0]);
      this.player.heading = Math.atan2(f0.x - this.player.x, f0.z - this.player.z); this.player.sync();
      for (const id of others) S.chars.face(id, this.player.x, this.player.z);
    }
    let last = null;
    S.dialog.onLine = L => {
      const sp = figOf(L.who) || this.player;
      const lis = L.who === 'leon' || L.choosing ? (others.length ? figOf(L.to || others[0]) : null) : this.player;
      if (L.who && L.who !== 'leon' && this.fig(L.who)) { this.fig(L.who).talk = 2 + String(L.text).length * 0.04; S.chars.face(L.who, (L.to && figOf(L.to) || this.player).x, (L.to && figOf(L.to) || this.player).z); }
      if (o.shot) { if (!S.cut.active) S.cut.set(o.shot()); return; }   // feste Einstellung für die ganze Szene
      if (L.cam === 'none' || o.cam === 'none') return;
      const kind = L.cam || o.cam || (last === L.who ? 'keep' : 'ots');
      if (kind === 'keep' && S.cut.active) return;
      const c = center();
      S.cut.set(S.cut.dialogShot(sp, lis && lis !== sp ? lis : (others.length ? null : null), kind === 'keep' ? 'ots' : kind) || { pos: [c.x + 3, this.player.y + 2, c.z + 3], look: [c.x, this.player.y + 1.5, c.z] });
      last = L.who;
    };
    try {
      await this.guard(S.dialog.scene(lines, o));
    } finally {
      S.dialog.onLine = null;
      this.lock--;
      if (!o.keepCam) { S.cut.clear(); S.hud.cine(false); }
      this.G.lockPointer();
    }
  }

  // Kamerafahrt; lines laufen als Untertitel mit (Esc überspringt)
  async cut(shots, lines) {
    this.alive();
    this.lock++;
    const S = this.S;
    S.hud.cine(true);
    if (lines) S.dialog.sub(lines);
    try { await this.guard(S.cut.play(shots)); }
    finally { this.lock--; S.cut.clear(); S.hud.cine(false); if (lines) S.dialog.clearSubs(); }
  }

  // Abblende: an = schwarz
  black(on, ms = 600) {
    const el = StoryDOM.$('st-black');
    el.style.transitionDuration = ms + 'ms';
    if (on) { el.classList.remove('hidden'); void el.offsetWidth; el.classList.add('on'); }
    else { el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.classList.add('hidden'); }, ms); }
    return this.sleep(ms / 1000);
  }

  // Spieler an einen Ort stellen (steigt vorher aus)
  placePlayer(x, z, heading) {
    const G = this.G;
    if (G.mode() === 'drive') G.exitCar();
    const p = this.S.walkable(x, z, 10) || { x, z };
    G.player().place(p.x, p.z, G.world);
    if (heading !== undefined) { G.player().heading = heading; G.cam.yaw = heading; }
    G.cam.init = false;
    if (G.net && G.net.teleported) G.net.teleported();
  }
  // Auto, das die Mission selbst fährt (Max fährt voraus, Dragan flieht); nicht in parked, damit das Spiel es nicht anhält
  driven(kind, color, x, z, heading) {
    const G = this.G;
    let c;
    if (heading === undefined || heading === null) {
      c = G.parkCarNear(x, z, color, kind);
      if (c) { const i = G.parked.indexOf(c); if (i >= 0) G.parked.splice(i, 1); }
    } else { c = new Vehicle(G.scene, color, kind); c.place(x, z, heading, G.world); }
    if (!c) return null;
    c.story = this.def.id; c.sleeping = false; c.storyDriven = true;
    this.S.driven.push(c); this.cars.push(c);
    return c;
  }
  // Auto c fährt über das Straßennetz zu goal. o: { speed (m/s), lead (wartet auf den Spieler), corner }
  // Rückgabe: Steuerung { done, gap, hold, stop(), arrive() }
  autoDrive(c, goal, o = {}) {
    const G = this.G, nav = G.nav;
    if (c._ctl) c._ctl.stopped = true;
    const loc = nav.locate(goal.x, goal.z, 300);
    let raw = loc ? nav.route(nav.costsFrom(loc, 4000), c.x, c.z) : [];
    if (raw.length < 4) raw = [c.x, c.z, goal.x, goal.z];
    const path = resamplePath(raw, 4);
    const drv = new AutoDriver(c, { maxSpeed: o.speed || 15, cornerFactor: o.corner || 1, world: G.world });
    drv.setPath(path, true);
    const speed = o.speed || 15;
    const ctl = c._ctl = { c, drv, path, done: false, stopped: false, hold: false, gap: 0, goal };
    ctl.stop = () => { ctl.stopped = true; };
    ctl.arrive = () => this.wait(() => ctl.done);
    this.every(dt => {
      if (ctl.stopped || c.disposed || this.dead) return true;
      const p = this.pos;
      ctl.gap = Math.hypot(p.x - c.x, p.z - c.z);
      let cap = Infinity;
      if (o.lead) cap = ctl.gap > 120 ? 0 : ctl.gap > 70 ? speed * 0.45 : ctl.gap > 45 ? speed * 0.75 : Infinity;
      const near = Math.hypot(c.x - goal.x, c.z - goal.z) < 9;
      const stopNow = ctl.hold || near || drv.done || c.wrecked || c.burning;
      const others = G.trafficCars().concat(G.car() ? [G.car()] : []);
      const input = stopNow ? { throttle: 0, steer: 0, handbrake: true } : drv.steer(dt, null, cap, others);
      // festgefahren (Räder drehen, Auto bewegt sich nicht): zurücksetzen, beim dritten Mal auf die Route versetzen
      ctl.chk = (ctl.chk || 0) + dt;
      if (ctl.chk > 1.5) {
        const moved = ctl.px === undefined ? 9 : Math.hypot(c.x - ctl.px, c.z - ctl.pz);
        ctl.px = c.x; ctl.pz = c.z; ctl.chk = 0;
        if (!stopNow && cap > 0 && moved < 0.6) {
          ctl.stuck = (ctl.stuck || 0) + 1;
          if (ctl.stuck >= 3) {
            const k = Math.min(path.length / 2 - 2, drv.idx + 4), x = path[k * 2], z = path[k * 2 + 1];
            c.place(x, z, Math.atan2(path[k * 2 + 2] - x, path[k * 2 + 3] - z), G.world); c.vx = c.vz = 0; ctl.stuck = 0;
          } else drv.reverse = 0.9;
        } else if (moved > 3) ctl.stuck = 0;
      }
      // kein Fortschritt entlang der Route (z. B. Stau mit dem KI-Verkehr): nach 8 s ein Stück weiter auf die Route setzen
      if (!stopNow && cap > 0) {
        if (drv.idx > (ctl.bestIdx || 0)) { ctl.bestIdx = drv.idx; ctl.noProg = 0; }
        else if ((ctl.noProg = (ctl.noProg || 0) + dt) > 8) {
          const k = Math.min(path.length / 2 - 2, drv.idx + 8), x = path[k * 2], z = path[k * 2 + 1];
          c.place(x, z, Math.atan2(path[k * 2 + 2] - x, path[k * 2 + 3] - z), G.world); c.vx = c.vz = 0;
          drv.idx = k; ctl.bestIdx = k; ctl.noProg = 0; drv.reverse = 0;
        }
      } else ctl.noProg = 0;
      c.update(dt, input, G.world);
      if (G.car() && G.car() !== c) collideCars(c, G.car());
      for (const t of G.trafficCars()) if (Math.abs(t.x - c.x) < 7 && Math.abs(t.z - c.z) < 7) collideCars(c, t);
      c.updateGround(G.world, dt, false);
      c.sync();
      if ((near || drv.done) && Math.abs(c.speed) < 1.5) ctl.done = true;
      return false;
    });
    return ctl;
  }
  // Prüfpunkt-Strecke im Auto: Punkte nacheinander, liefert die Zeit in Sekunden
  async course(points, o = {}) {
    const t0 = this.t;
    for (let i = 0; i < points.length; i++) {
      const last = i === points.length - 1;
      await this.goto(points[i], { r: o.r || 12, car: o.car || true, name: (o.name || 'Prüfpunkt') + ' ' + (i + 1) + '/' + points.length, tall: true, color: last ? '#ffffff' : '#ffd23a',
        text: (o.text || 'Fahr durch die <b>Prüfpunkte</b>') + ' (' + i + '/' + points.length + ')' });
      if (this.G.audio.beep) this.G.audio.beep(last ? 1040 : 880, 0.12);
    }
    return this.t - t0;
  }
  // Auto in die Garage des Spielers (Belohnung); liefert den Garagen-Eintrag
  giveCar(kind, color, name) {
    const G = this.G, s = G.save;
    s.carSeq = s.carSeq || s.garage.length + 1;
    if (s.garage.length >= 8) return null;
    const rec = { id: 'c' + (s.carSeq++), kind, color, health: 100, bought: 0, story: name || '' };
    s.garage.push(rec);
    G.persist();
    return rec;
  }
  // Spieler direkt in ein Auto setzen (Wiederholen ab Checkpoint)
  seat(c) { const G = this.G; if (G.mode() === 'drive' && G.car() === c) return; if (G.mode() === 'drive') G.exitCar(); G.enterCar(c); G.cam.yaw = c.heading; G.cam.init = false; }

  event(name) { const i = this.events.indexOf(name); if (i >= 0) { this.events.splice(i, 1); return true; } return false; }
  waitEvent(name) { return this.wait(() => this.event(name)); }   // Ereignisse ab Etappenbeginn zählen

  // aufräumen (Mission vorbei oder abgebrochen)
  cleanup(keepCars) {
    const S = this.S, G = this.G;
    for (const f of this.cleanups.splice(0)) try { f(); } catch (e) { console.warn(e); }
    S.chars.clear();
    S.world.clearTarget();
    S.world.clearExtra();
    S.hud.objective(null); S.hud.timer(null); S.hud.meter(null); S.hud.cine(false);
    S.dialog.clearSubs();
    if (S.dialog.busy) S.dialog.finish(true);
    S.cut.clear();
    this.interactT = null;
    // selbst fahrende Story-Autos verschwinden immer
    for (const c of this.cars) if (c.storyDriven) {
      const k = S.driven.indexOf(c); if (k >= 0) S.driven.splice(k, 1);
      if (c === G.car() && G.mode() === 'drive') G.exitCar();
      if (c._ctl) c._ctl.stopped = true;
      c.dispose(G.scene);
    }
    if (keepCars) for (const c of this.cars) if (!c.storyDriven) c.story = null;   // bleiben als normale Autos stehen
    if (!keepCars) for (const c of this.cars) {
      if (c.storyDriven) continue;
      if (c === G.car() && G.mode() === 'drive') G.exitCar();   // gescheitert/abgebrochen: aussteigen, Missionsauto verschwindet
      const i = G.parked.indexOf(c);
      if (i >= 0 && !c.ownedId) { G.parked.splice(i, 1); c.dispose(G.scene); }
    }
    this.cars = [];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Story: StoryManager + MissionManager
// ---------------------------------------------------------------------------------------------------------------
class Story {
  // G: Schnittstelle zum Spiel (js/game.js)
  constructor(G) {
    this.G = G;
    this.active = false;
    this.state = null;
    this.run = null;
    this.dialog = new DialogueManager();
    this.hud = new StoryHUD();
    this.rel = new Relationships(this);
    this.chars = new CharacterManager(this);
    this.cut = new CutsceneManager(this);
    this.world = new WorldEventManager(this);
    this.pendingFail = null;
    this.startCool = 0;
    this.driven = [];      // Autos, die Missionen selbst fahren (für Kollision und Verkehr in game.js)
    this.dialog.blocked = () => !this.active || (this.G.menuOpen && this.G.menuOpen());
    addEventListener('keydown', e => this.key(e), true);
  }

  // ---------- Zustand ----------
  get save() { return this.G.save; }
  load() { this.state = this.save.story = StorySave.fix(this.save.story); }
  persist() { this.G.persist(); }
  done(id) { return !!this.state && this.state.done.includes(id); }
  get lockInput() { return this.active && (!!this.dialog.busy || this.cut.active || (this.run && this.run.lock > 0)); }

  // Spielstart aus dem Menü: 'new' | 'continue' | 'online'
  start(how) {
    if (how === 'online') { this.suspend(); this.wasOnline = true; if (!this.state && this.save.story) this.load(); return; }
    this.wasOnline = false;
    const fresh = how === 'new' || !this.save.story;
    if (how === 'new') {
      this.save.story = StorySave.fresh();
      this.save.outfit = { shirt: STORY_CAST.leon.look.shirt, pants: STORY_CAST.leon.look.pants };
      this.G.player().setOutfit(this.save.outfit);
    }
    this.load();
    this.active = true;
    this.world.buildProps();
    this.refreshMarkers();
    this.persist();
    // Neues Spiel: die Geschichte beginnt sofort am Bahnhof
    if (how === 'new' && fresh) setTimeout(() => { if (this.active && !this.run) this.begin('m01'); }, 2600);
    else if (!this.state.done.length && !this.run) this.hud.flash('<b>Story: „Zurück in der Heimat“</b><br>Gelber Marker am Bahnhof · <kbd>J</kbd> Tagebuch', 5);
  }

  // Online-Modus oder Hauptmenü: Story ruht (laufende Mission wird ohne Wertung beendet)
  suspend() {
    if (this.run) { const r = this.run; this.run = null; r.abort(); r.cleanup(); }
    this.pendingFail = null;
    this.world.clearMarkers(); this.world.removeProps(); this.world.clearTarget();
    this.hud.hideAll();
    this.active = false;
  }

  // ---------- Orte ----------
  lm(name) { const l = this.G.landmarks().find(l => l.name === name); return l ? { x: l.x, z: l.z } : null; }
  carShop(name) { return (typeof CAR_SHOPS !== 'undefined' ? CAR_SHOPS : []).find(c => c.name === name) || null; }
  dealer(i = 1) { const d = this.G.places.list.filter(p => p.type === 'dealer'); return d[i] || d[0] || null; }
  workshop() { const p = this.G.places.list.find(p => p.name === 'Lackiererei Nord'); return p ? { x: p.x, z: p.z } : null; }
  home(id) { return this.G.property.homes.find(h => h.id === id) || null; }
  venue(id) { return (this.G.property.venues || []).find(v => v.id === id) || null; }
  road(x, z, r = 250) { const W = this.G.world; const R = W.nearestRoad(x, z, r, s => s.k === 'road' && !/motorway|trunk/.test(s.h || '')); return R ? { x: R.x, z: R.z, seg: R.seg } : { x, z }; }
  // nächster freier Punkt (kein Haus, keine Hindernisse) in Spiralen um (x, z)
  walkable(x, z, maxR = 15, rad = 0.6) {
    const W = this.G.world;
    const ok = (px, pz) => !W.insideBuilding(px, pz, rad) && !W.collideCircle(px, pz, rad, {}).hit;
    if (ok(x, z)) return { x, z };
    for (let r = 1; r <= maxR; r += 1) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a / 16 * 6.283) * r, pz = z + Math.sin(a / 16 * 6.283) * r; if (ok(px, pz)) return { x: px, z: pz }; }
    return null;
  }

  // ---------- Missionen ----------
  // verfügbar: nicht erledigt, registriert, Vorgänger erledigt
  available() {
    if (!this.state) return [];
    return STORY_LIST.filter(m => !this.done(m.id) && StoryMissions.get(m.id) && (m.n === 1 || this.done(STORY_LIST[m.n - 2].id)));
  }
  refreshMarkers() {
    this.world.clearMarkers();
    if (!this.active || this.run) return;
    for (const m of this.available()) {
      const def = StoryMissions.get(m.id), p = def.marker && def.marker(this);
      if (p) this.world.addMarker(m.id, p.x, p.z, def.title, def.contact);
    }
  }

  begin(id, stage = 0, retry = false) {
    const def = StoryMissions.get(id);
    if (!def || this.run) return;
    this.hud.hideResult();
    this.world.clearMarkers();
    this.run = new MissionRun(this, def, stage, retry);
    this.state.current = id;
    const L = STORY_LIST.find(m => m.id === id);
    if (stage === 0 && !retry) this.hud.card(`Kapitel ${L.chapter} · Mission ${L.n}`, def.title.toUpperCase(), def.blurb || '', 4);
    this.run.run();
  }

  checkpoint(run) { run.stageName = run.def.stages[run.stage].name; }

  complete(run) {
    if (this.run !== run) return;
    const def = run.def, L = STORY_LIST.find(m => m.id === def.id);
    run.cleanup(true);
    this.run = null;
    const st = this.state;
    if (!st.done.includes(def.id)) st.done.push(def.id);
    st.current = null;
    st.stats.time += run.t;
    const rw = def.reward ? def.reward(this, run) : {};
    if (rw.money) this.G.addMoney(rw.money);
    const lines = [];
    if (rw.money) lines.push(`Belohnung: <b>€ ${Math.round(rw.money).toLocaleString('de-DE')}</b>`);
    for (const t of rw.lines || []) lines.push(t);
    lines.push(`Zeit: ${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')}`);
    this.hud.showResult('pass', 'MISSION ERFÜLLT', [`<i>${def.title}</i>`].concat(lines), []);
    setTimeout(() => this.hud.hideResult(), 5200);
    if (this.G.audio.fanfare) this.G.audio.fanfare(true);
    // Kapitel fertig?
    const chapDone = STORY_LIST.filter(m => m.chapter === L.chapter).every(m => st.done.includes(m.id));
    if (chapDone && st.chapter === L.chapter) {
      st.chapter = Math.min(7, L.chapter + 1);
      const C = STORY_CHAPTERS[L.chapter - 1], N = STORY_CHAPTERS[L.chapter];
      setTimeout(() => {
        this.hud.card(`Kapitel ${L.chapter} abgeschlossen`, C.title.toUpperCase(), C.end, 6);
        if (N) setTimeout(() => this.hud.card(`Kapitel ${N.n}`, N.title.toUpperCase(), StoryMissions.get(STORY_LIST[L.n].id) ? '' : 'Folgt in einem kommenden Update · Coburg gehört bis dahin dir.', 6), 6400);
      }, 5600);
    }
    this.persist();
    if (def.after) setTimeout(() => { if (this.active) try { def.after(this); } catch (e) { console.warn(e); } }, 6000);
    setTimeout(() => this.refreshMarkers(), 5400);
  }

  failed(run, reason) {
    if (this.run !== run || run.dead) return;
    run.abort();
    run.cleanup();
    this.state.stats.fails++;
    this.persist();
    this.run = null;
    const id = run.def.id, stage = run.stage;
    const show = () => {
      this.pendingFail = null;
      this.hud.showResult('fail', 'MISSION GESCHEITERT', [reason, `<i>${run.def.title}</i>${stage > 0 ? ` · Checkpoint: ${run.def.stages[stage].name}` : ''}`], [
        { label: stage > 0 ? 'Ab Checkpoint wiederholen' : 'Wiederholen', key: 'Enter', act: () => this.begin(id, stage, true) },
        { label: 'Abbrechen', key: 'Esc', act: () => { this.refreshMarkers(); this.G.lockPointer(); } },
      ]);
    };
    // nach „Erledigt“/„Verhaftet“ erst die Sequenz abwarten
    if (this.G.over()) this.pendingFail = show; else show();
  }

  // ---------- Takt (aus game.step) ----------
  update(dt) {
    const online = !!(this.G.net && this.G.net.online);
    if (!this.active) {
      // Online-Sitzung verlassen: Story läuft im selben Spiel weiter
      if (this.wasOnline && !online && this.state) { this.wasOnline = false; this.start('continue'); }
      return;
    }
    if (online) { this.suspend(); this.wasOnline = true; return; }
    this.dialog.update(dt);
    this.hud.update(dt);
    this.hud.clock = this.G.atmo.timeText;
    this.cut.update(dt);
    this.chars.update(dt);
    if (this.pendingFail && !this.G.over()) this.pendingFail();
    const G = this.G, mode = G.mode();
    const p = mode === 'drive' ? G.car() : G.player();
    if (this.run) {
      this.run.tick(dt);
      this.world.updateRoute(dt, p.x, p.z, mode === 'drive');
      return;
    }
    // Missionsmarker betreten (zu Fuß oder langsam im Auto, ohne Fahndung, nicht im Rennen, nicht drinnen)
    if ((this.startCool -= dt) > 0 || this.hud.result) return;
    for (const [id, m] of this.world.markers) {
      if (Math.hypot(p.x - m.x, p.z - m.z) > 2.6) continue;
      if (G.stars() > 0) { G.ui.toast('Erst die Polizei abhängen!', 1.5); this.startCool = 2; return; }
      if (G.busy()) return;
      if (mode === 'drive' && Math.abs(G.car().speed) > 3) return;
      if (mode === 'fly') return;
      this.begin(id);
      return;
    }
  }

  // E-Taste: Story-Interaktion hat Vorrang
  useKey() {
    const I = this.run && this.run.interactT;
    if (!I || this.lockInput) return false;
    const o = I.get(); if (!o) return false;
    const p = this.G.player();
    if (this.G.mode() !== 'walk' || Math.hypot(p.x - o.x, p.z - o.z) > I.r) return false;
    I.hit = true;
    return true;
  }
  prompt(p) {
    if (!this.active) return p;
    if (this.lockInput) return null;
    const I = this.run && this.run.interactT;
    if (I) { const o = I.get(), pl = this.G.player(); if (o && this.G.mode() === 'walk' && Math.hypot(pl.x - o.x, pl.z - o.z) <= I.r) return `<kbd>E</kbd> ${I.label}`; }
    return p;
  }

  onDown(kind) { if (this.run) this.failed(this.run, kind === 'busted' ? 'Leon wurde verhaftet.' : 'Leon ist im Krankenhaus gelandet.'); }
  event(name) { if (this.run) this.run.events.push(name); }
  blips() { return this.active ? this.world.blips() : []; }
  get route() { return this.active && this.world.route; }

  // ---------- Tastatur: Ergebnisfenster, Tagebuch, Kamerafahrt überspringen ----------
  key(e) {
    if (!this.active || (this.G.menuOpen && this.G.menuOpen()) || !this.G.playing()) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const R = this.hud.result;
    if (R && R.buttons.length) {
      if (e.code === 'Enter') { this.hud.resultPick(0); e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.code === 'Escape' && R.buttons[1]) { this.hud.resultPick(1); e.preventDefault(); e.stopImmediatePropagation(); return; }
    }
    if (this.cut.queue && !this.dialog.busy && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) { this.cut.skip(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.code === 'KeyJ' && !this.lockInput) { this.toggleJournal(); e.preventDefault(); }
  }

  // ---------- Tagebuch (J) ----------
  toggleJournal() {
    const el = StoryDOM.$('st-journal');
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    const st = this.state, R = this.rel;
    const chap = STORY_CHAPTERS.map(C => {
      const ms = STORY_LIST.filter(m => m.chapter === C.n);
      const rows = ms.map(m => {
        const d = st.done.includes(m.id), cur = this.run && this.run.def.id === m.id, ok = !!StoryMissions.get(m.id);
        return `<li class="${d ? 'done' : cur ? 'cur' : ok ? 'open' : 'locked'}"><span>${m.n}</span>${d || ok || m.n <= st.done.length + 1 ? m.title : '???'}${!ok ? ' <em>in Entwicklung</em>' : ''}</li>`;
      }).join('');
      return `<div class="st-j-chap${C.n === st.chapter ? ' now' : ''}"><h4>Kapitel ${C.n} · ${C.title}</h4><ol>${rows}</ol></div>`;
    }).join('');
    const rels = ['max', 'tobi', 'sarah', 'voss'].filter(w => w !== 'sarah' || st.flags.metSarah).map(w => {
      const v = R.get(w), C = STORY_CAST[w];
      return `<div class="st-j-rel"><b style="color:${C.color}">${C.name}</b><div class="st-j-bar"><div style="left:50%;width:${Math.abs(v) / 2}%;${v < 0 ? 'transform:translateX(-100%);background:#e2463f' : ''}"></div></div><span>${R.label(v)}</span></div>`;
    }).join('');
    const F = st.flags, notes = [];
    if (F.maxLoan !== undefined) notes.push(F.maxLoan ? 'Max € 200 geliehen' : 'Max kein Geld geliehen');
    if (F.readEnvelope !== undefined) notes.push(F.readEnvelope ? 'Umschlag „Gutachten Itzaue“ gelesen' : 'Umschlag ungeöffnet abgegeben');
    if (F.vossAttitude) notes.push('Haltung gegenüber Voss: ' + { resp: 'respektvoll', frech: 'frech', neugierig: 'neugierig' }[F.vossAttitude]);
    if (F.vossAnswer) notes.push('Voss’ Angebot: ' + (F.vossAnswer === 'ja' ? 'angenommen' : 'Bedenkzeit'));
    el.innerHTML = `<div class="st-j-head"><div><small>Story</small><b>Zurück in der Heimat</b></div><span>${StorySave.summary(st)} · <kbd>J</kbd> schließen</span></div>
      <div class="st-j-cols"><div class="st-j-list">${chap}</div><div class="st-j-side"><h4>Beziehungen</h4>${rels}<h4>Entscheidungen</h4>${notes.length ? '<ul>' + notes.map(n => `<li>${n}</li>`).join('') + '</ul>' : '<p>Noch keine.</p>'}${this.run ? `<h4>Aktuelle Mission</h4><p>${this.run.def.title}</p>` : ''}</div></div>`;
    el.classList.remove('hidden');
  }
}

window.Story = Story; window.StoryMissions = StoryMissions; window.STORY_LIST = STORY_LIST; window.STORY_CHAPTERS = STORY_CHAPTERS; window.StorySave = StorySave;
