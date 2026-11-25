// Story-Modus (seit v3.28.0), Teil 8: Kapitel 6 „Alles auf eine Karte“ – Missionen 26–30.
// Neu: Grab des Vaters und Rückblende an der Brandruine, Fahndung als Folge einer Entscheidung, Jagdhütte im Landkreis
// (Schloss Callenberg) mit Wachen, mehrere Verbündete in beliebiger Reihenfolge einsammeln, Daten kopieren unter
// Beobachtung, Voss' Supersportwagen als Fluchtwagen. Handlung: STORY.md, Kapitel 6.
'use strict';

(() => {
  const P = S => S.G.player();
  const yOf = (S, x, z) => S.G.world.heightAt(x, z);
  const beside = (S, p, d = 9) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q = S.walkable(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); if (q && Math.hypot(q.x - p.x, q.z - p.z) > d - 2.5) return q; } return S.walkable(p.x, p.z, 15) || p; };
  const doorSpot = (S, h, out = 1) => S.walkable(h.sx + (h.ox || 0) * out, h.sz + (h.oz || 0) * out, 8) || { x: h.sx, z: h.sz };
  const ensureCar = (M, x, z, kind = 'kleinwagen', color = '#8a8f96') => {
    const G = M.G;
    if (M.mode === 'drive') return G.car();
    const near = G.parked.find(c => !c.wrecked && !c.burning && !c.storyDriven && Math.hypot(c.x - x, c.z - z) < 40);
    return near || M.vehicle(kind, color, x, z);
  };
  const toCar = async (M, car, text) => {
    const S = M.S;
    if (M.mode === 'drive') return;
    if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false });
    M.objective(text || 'Steig in ein <b>Auto</b>.');
    await M.wait(() => M.mode === 'drive');
    S.world.clearTarget();
  };
  // Orte
  const friedhof = S => S.road(473, 488, 160);                       // Friedhof am Glockenberg
  const grab = S => { const r = friedhof(S); return S.walkable(r.x + (473 - r.x) * 0.7, r.z + (488 - r.z) * 0.7, 25) || beside(S, r, 12); };
  const ruine = S => { const r = S.road(-337, 631, 80); return S.walkable(r.x + (-337 - r.x) * 0.6 + 4, r.z + (631 - r.z) * 0.6, 20) || r; };
  const polizei = S => S.road(13, -507, 80);
  const redaktion = S => { const r = S.road(136, -474, 120); return S.walkable(r.x + 3, r.z + 3, 12) || r; };
  // Straßenpunkt auch im Landkreis (S.road kennt nur das Stadtgebiet): nächster Punkt im Navigationsnetz
  const navPt = (S, x, z, r = 400) => { const l = S.G.nav.locate(x, z, r); return l ? { x: l.x, z: l.z } : S.road(x, z, r); };
  const huette = S => navPt(S, -3140, -2290);                       // Waldweg hinter Schloss Callenberg
  const rathaus = S => { const r = S.lm('Rathaus') || { x: -12, z: 69 }; return S.walkable(r.x + 6, r.z - 10, 18) || r; };
  const markt = S => { const g = S.G.props && S.G.props.grill; return g ? (S.walkable(g.x + 3, g.z + 2, 8) || g) : S.walkable(0, 20, 20) || { x: 0, z: 20 }; };

  // einfache Requisiten aus Quadern (werden beim Aufräumen entfernt); im Landkreis über world.anchor auf das Gelände
  const props = M => {
    const S = M.S, G = S.G, parts = [];
    M.onCleanup(() => { for (const p of parts) { G.scene.remove(p); p.geometry.dispose(); if (p.material.map) p.material.map.dispose(); p.material.dispose(); } });
    return {
      box(w, h, d, x, z, color, y0 = 0, ry = 0) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
        m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
        S.world.anchor(m, x, z, y0 + h / 2);
        G.scene.add(m); parts.push(m); return m;
      },
      sign(text, sub, w, h, x, z, y0, ry = 0, bg = '#2a2d33', fg = '#e9e4d8') {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const c = cv.getContext('2d');
        c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = fg; c.textAlign = 'center';
        c.font = '700 ' + Math.round(cv.height * 0.26) + 'px Inter, Georgia, serif'; c.fillText(text, 256, cv.height * (sub ? 0.45 : 0.6));
        if (sub) { c.font = '500 ' + Math.round(cv.height * 0.16) + 'px Inter, Georgia, serif'; c.fillText(sub, 256, cv.height * 0.75); }
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
        m.rotation.y = ry; S.world.anchor(m, x, z, y0); G.scene.add(m); parts.push(m); return m;
      },
    };
  };
  const buildRuin = (M, R) => {
    const B = props(M);
    B.box(9, 2.6, 0.4, R.x, R.z - 4, '#2a2522'); B.box(0.4, 1.6, 7, R.x - 4.5, R.z, '#25201d'); B.box(3.5, 3.4, 0.4, R.x + 3, R.z + 4, '#1f1b19', 0, 0.1); B.box(2.2, 0.5, 1.2, R.x + 1.5, R.z + 0.5, '#3a3430', 0, 0.4);
    B.sign('AUTOHAUS BERGER', '', 4, 1, R.x - 1, R.z - 3.7, 2.9, 0, '#2a2d33', '#c9a646');
  };
  // Grabstein Günter Berger mit Blumen
  const buildGrave = (M, g) => {
    const B = props(M);
    B.box(1.1, 1.0, 0.22, g.x, g.z, '#6d6a66');
    B.sign('Günter Berger', '1958 – 2021', 0.9, 0.55, g.x, g.z + 0.12, 0.58, 0, '#6d6a66', '#f1ede4');
    B.box(1.0, 0.12, 1.8, g.x, g.z + 1.05, '#4c6b3a');
    for (const [dx, c] of [[-0.3, '#e2463f'], [0, '#f2c230'], [0.3, '#ffffff']]) B.box(0.16, 0.22, 0.16, g.x + dx, g.z + 0.4, c, 0.1);
    return { x: g.x, z: g.z + 1.6 };
  };
  // Jagdhütte: Blockhaus mit Dach und Tür
  const buildHut = (M, h) => {
    const B = props(M);
    B.box(6, 2.6, 4.5, h.x, h.z, '#5a4330');
    B.box(6.8, 0.25, 5.4, h.x, h.z, '#3a2a1e', 2.75);
    B.box(4.2, 0.9, 5.4, h.x, h.z, '#3a2a1e', 3.0);
    B.box(1.0, 1.9, 0.12, h.x, h.z + 2.3, '#2a1e14');
    B.box(1.6, 1.0, 1.0, h.x + 4, h.z + 1, '#7a5a3a');   // Holzstapel
    return { door: { x: h.x, z: h.z + 3.3 } };
  };
  // Verfolger: Autos, die alle 2,5 s neu zum Spieler routen
  const hunters = (M, cars, speed = 21) => {
    let t = 99;
    const ctl = { stopped: false, stop() { this.stopped = true; for (const c of cars) if (c._ctl) c._ctl.stopped = true; } };
    M.every(dt => {
      if (ctl.stopped) return true;
      if ((t += dt) < 2.5) return false;
      t = 0;
      const p = M.pos;
      for (const c of cars) if (!c.disposed && !c.wrecked) M.autoDrive(c, { x: p.x, z: p.z }, { speed });
      return false;
    });
    return ctl;
  };
  const shakeOff = (M, cars, dist = 200, secs = 8) => {
    let free = 0;
    return M.wait(dt => {
      const p = M.pos;
      const d = Math.min(...cars.filter(c => !c.disposed && !c.wrecked).map(c => Math.hypot(c.x - p.x, c.z - p.z)), 1e9);
      free = d > dist ? free + dt : Math.max(0, free - dt * 2);
      M.meter('Abgehängt', free / secs);
      return free >= secs;
    }).then(() => M.meter(null));
  };
  // Figur rennt über das Straßennetz (Punkte alle 4 m)
  const runPath = (M, id, from, to, speed = 7.2) => {
    const S = M.S, nav = S.G.nav, f = S.chars.get(id);
    const loc = nav.locate(to.x, to.z, 300);
    let raw = loc ? nav.route(nav.costsFrom(loc, 3000), from.x, from.z) : [];
    if (raw.length < 4) raw = [from.x, from.z, to.x, to.z];
    const path = resamplePath(raw, 4);
    f.p.runSpeed = speed;
    const st = { i: 0, path, done: false, stopped: false };
    const next = () => {
      if (st.stopped || !S.chars.get(id)) return;
      st.i = Math.min(path.length / 2 - 1, st.i + 2);
      S.chars.walkTo(id, path[st.i * 2], path[st.i * 2 + 1], true, 6).then(() => { if (st.i >= path.length / 2 - 1) st.done = true; else next(); });
    };
    next();
    return st;
  };
  // Wachleute mit Lichtkegel (wie Kapitel 3): sehen den Spieler im Kegel (13 m, ±34°), Hauswände verdecken
  class Guards {
    constructor(M, list) {
      this.M = M; this.S = M.S; this.list = list; this.alert = 0;
      list.forEach((g, i) => {
        const id = 'wache' + i;
        if (!STORY_CAST[id]) STORY_CAST[id] = STORY_CAST.wache;
        const f = M.npc(id, g.route[0].x, g.route[0].z, 0);
        f.p.runSpeed = 3;
        g.id = id; g.k = 0;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(4.6, 13, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe8a0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
        cone.geometry.translate(0, -6.5, 0); cone.rotation.x = -Math.PI / 2 + 0.12; cone.position.set(0, 1.25, 0.2);
        f.p.group.add(cone);
        this.walk(g);
      });
    }
    walk(g) {
      if (this.M.dead || !this.S.chars.get(g.id)) return;
      g.k = (g.k + 1) % g.route.length;
      const p = g.route[g.k];
      this.S.chars.walkTo(g.id, p.x, p.z, false, 25).then(() => setTimeout(() => this.walk(g), 900 + Math.random() * 1200));
    }
    seen() {
      const W = this.S.G.world, pl = P(this.S);
      let best = 0;
      for (const g of this.list) {
        const f = this.S.chars.get(g.id); if (!f) continue;
        const dx = pl.x - f.p.x, dz = pl.z - f.p.z, d = Math.hypot(dx, dz);
        if (d > 13) continue;
        const a = Math.abs(U.wrapAngle(Math.atan2(dx, dz) - f.p.heading));
        if (a > 0.6 && d > 2.2) continue;
        let blocked = false;
        for (let t = 0.15; t < 0.95 && !blocked; t += 0.1) if (W.insideBuilding(f.p.x + dx * t, f.p.z + dz * t, 0)) blocked = true;
        if (blocked) continue;
        best = Math.max(best, d < 2.2 ? 1 : 1 - d / 15 + (pl.moveSpeed > 5 ? 0.4 : 0));
      }
      return U.clamp(best, 0, 1);
    }
    // Entdeckt-Balken als Fehlschlag-Wächter
    watch(msg) {
      const M = this.M;
      M.meter('Entdeckt', 0);
      return M.watch(dt => {
        const s = this.seen();
        this.alert = s > 0 ? Math.min(1, this.alert + dt * s * 0.7) : Math.max(0, this.alert - dt * 0.15);
        M.meter('Entdeckt', this.alert);
        if (s > 0 && this.alert > 0.35 && !this.warned) { this.warned = true; M.say({ who: 'wache', name: 'Wachmann', text: 'Hm? Ist da wer?' }); }
        if (this.alert < 0.2) this.warned = false;
        return this.alert >= 1 ? msg : null;
      });
    }
  }
  const patrol = (S, a, b) => [S.walkable(a.x, a.z, 6) || a, S.walkable(b.x, b.z, 6) || b];

  // =============================================================================================================
  // Mission 26 – Alte Rechnungen
  // =============================================================================================================
  StoryMissions.add({
    id: 'm26', title: 'Alte Rechnungen', contact: 'leon', blurb: 'Leon besucht das Grab seines Vaters.',
    marker: S => beside(S, friedhof(S), 5),
    stages: [
      { name: 'Am Grab', async run(M) {
        const S = M.S, G = S.G, g = grab(S);
        if (G.atmo.clock < 8 || G.atmo.clock > 18) G.atmo.clock = 10.5;
        if (M.mode === 'drive') G.exitCar();
        if (M.retry) M.placePlayer(g.x + 8, g.z + 8);
        const front = buildGrave(M, g);
        await M.goto(front, { r: 2, foot: true, name: 'Grab', color: '#d9d4c7', text: 'Geh zum <b>Grab deines Vaters</b> (Friedhof am Glockenberg).' });
        M.objective(null);
        P(S).heading = Math.atan2(g.x - P(S).x, g.z - P(S).z); P(S).sync();
        const y = yOf(S, g.x, g.z);
        await M.cut([{ pos: [g.x + 3.5, y + 1.6, g.z + 4.5], look: [g.x, y + 0.7, g.z], to: { pos: [g.x - 2.5, y + 1.9, g.z + 4] }, dur: 9, fov: 40 }], [
          { who: 'leon', text: 'Hallo Papa. Fünf Jahre. Ich war nicht mal bei deiner Beerdigung. Ich hab mich geschämt. Für dich.', dur: 5 },
          { if: () => S.state.flags.fatherLetter, then: [{ who: 'leon', text: 'Ich hab deinen Brief gelesen. Du warst es nicht. Du hast nur geschwiegen. Für mich.', dur: 4.6 }], else: [{ who: 'leon', text: 'Alle haben gesagt, du hättest es selbst angezündet. Und ich hab’s geglaubt.', dur: 4.2 }] },
          { who: 'leon', text: 'Ich bring das in Ordnung. Versprochen.', dur: 3 },
        ]);
        const ep = beside(S, front, 5);
        M.npc('erwin', ep.x, ep.z, Math.atan2(P(S).x - ep.x, P(S).z - ep.z));
        S.chars.walkTo('erwin', front.x + 1.3, front.z + 0.4, false, 8);
        await M.sleep(2.2);
        await M.talk([
          { who: 'erwin', text: 'Dachte mir, dass ich dich hier mal treffe. Ich bring ihm jeden Donnerstag Blumen. Er hat mir den Stand finanziert, wusstest du das?', mood: 'sad' },
          { who: 'leon', text: 'Nein. Ich weiß überhaupt wenig über ihn, Erwin.', mood: 'sad' },
          { who: 'erwin', text: 'Die Nacht vom Brand. Ich hab um halb zwei noch aufgeräumt. Da kam ein schwarzer Geländewagen von der Uferstraße. Ohne Licht.', mood: 'worried' },
          { who: 'erwin', text: 'Und weißt du, was das Verrückte ist? Den sehe ich jeden Donnerstag. Abends, an der Ruine. Als würde einer nachschauen, ob noch alles kaputt ist.', mood: 'worried' },
          { who: 'leon', text: 'Heute ist Donnerstag.', mood: 'cold' },
          { who: 'erwin', text: 'Leon. Mach keine Dummheiten. Dein Vater hätte –', mood: 'worried' },
          { who: 'leon', text: 'Mein Vater hat fünf Jahre geschwiegen. Ich nicht.', mood: 'angry' },
        ], { with: ['erwin'] });
        S.chars.remove('erwin');
      } },
      { name: 'Die Ruine', async run(M) {
        const S = M.S, G = S.G, R = ruine(S);
        if (M.retry) { const f = friedhof(S); const c = M.vehicle('car', '#3a4a6a', f.x, f.z); M.seat(c); }
        G.atmo.clock = Math.max(G.atmo.clock, 19.6);
        await M.goto(S.road(R.x, R.z, 80), { r: 22, name: 'Brandruine', text: 'Fahr zur <b>Brandruine</b> an der Uferstraße.' });
        if (M.mode === 'drive') G.exitCar();
        buildRuin(M, R);
        const dp = S.walkable(R.x + 1, R.z + 1, 4) || R;
        M.npc('dragan', dp.x, dp.z, Math.atan2(R.x - 1 - dp.x, R.z - 3.7 - dp.z));
        M.dsuv = M.vehicle('suv', '#15161a', R.x + 12, R.z + 8);
        const y = yOf(S, R.x, R.z);
        // Rückblende: die Nacht des Brandes
        await M.black(true, 700);
        M.title('Rückblende', '14. MÄRZ 2021, 1:30 UHR', '', 3.4);
        await M.black(false, 700);
        let ft = 0, fireOn = true;
        M.every(dt => { if (!fireOn) return true; if ((ft -= dt) > 0) return false; ft = 0.06; const fx = R.x + (Math.random() - 0.5) * 8, fz = R.z + (Math.random() - 0.5) * 7; G.fx.fire(fx, yOf(S, fx, fz) + 0.6, fz); G.fx.smoke(fx, yOf(S, fx, fz) + 3, fz, 0.9); return false; });
        await M.cut([{ pos: [R.x + 14, y + 4, R.z + 10], look: [R.x, y + 2, R.z], to: { pos: [R.x + 8, y + 2.4, R.z + 6] }, dur: 8, fov: 44 }], [
          { who: 'dragan', text: '(2021) Benzin bis zur Werkstatt. Und die Bücher im Büro zuerst. Der Chef will, dass nichts übrig bleibt.', dur: 4.6 },
          { who: 'leon', text: '(Papa hat mich in dieser Nacht angerufen. Dreimal. Ich bin nicht rangegangen.)', name: 'Leon (denkt)', dur: 4.2 },
        ]);
        fireOn = false;
        await M.black(true, 500); await M.black(false, 700);
        await M.talk([
          { who: 'leon', text: 'Jeden Donnerstag, Dragan? Kommst du zum Beten her?', mood: 'cold' },
          { who: 'dragan', text: 'Berger junior. Ich schau nach meinem Lieblingsprojekt. Wird bald planiert. Dann ist es weg. Wie alles andere.', mood: 'smug' },
          { who: 'leon', text: 'Du hast es angezündet. Für Voss. Und mein Vater hat dafür bezahlt.', mood: 'angry' },
          { who: 'dragan', text: 'Beweis es. … Ach, warte. Kannst du ja nicht.', mood: 'smug' },
          { who: 'leon', text: 'Erwin hat deinen Wagen gesehen. Gutachten, Brief, Lenz’ Protokoll. Es ist vorbei, Dragan.', mood: 'cold' },
          { who: 'dragan', text: '…', mood: 'cold' },
        ], { with: ['dragan'] });
        // Dragan rennt los (Wagen blockiert: Leon steht davor)
        const goal = S.road(R.x + 260, R.z - 120, 200);
        M.run26 = runPath(M, 'dragan', dp, goal, 7.0);
      } },
      { name: 'Dragan stellen', async run(M) {
        const S = M.S, G = S.G, R = ruine(S);
        if (M.retry || !S.chars.get('dragan')) {
          buildRuin(M, R);
          M.placePlayer(R.x + 3, R.z + 4);
          const dp = beside(S, R, 10);
          M.npc('dragan', dp.x, dp.z, 0);
          M.run26 = runPath(M, 'dragan', dp, S.road(R.x + 260, R.z - 120, 200), 7.0);
        }
        const st = M.run26;
        M.objective('Hol <b>Dragan</b> ein – zu Fuß! (<kbd>Shift</kbd> rennen)');
        S.world.setTarget(0, 0, { r: 1, name: 'Dragan', beacon: false, route: false });
        const lines = [
          { who: 'leon', text: 'Lauf ruhig! Ich bin fünf Jahre gelaufen!' },
          { who: 'dragan', text: 'Du kriegst mich nicht, Berger!' },
          { who: 'leon', text: 'Doch, Dragan. Heute schon.' },
        ];
        let lost = 0, near = 0, said = 0;
        await M.wait(dt => {
          const f = S.chars.get('dragan'); if (!f) return true;
          const T = S.world.target; if (T) { T.x = f.p.x; T.z = f.p.z; }
          const d = Math.hypot(P(S).x - f.p.x, P(S).z - f.p.z);
          if (M.mode !== 'walk') { if (M.stageT > 1) M.fail('Dragan ist zwischen den Gärten verschwunden. Zu Fuß wär’s gegangen.'); return true; }
          if (said < lines.length && M.stageT > 3 + said * 6) M.say(lines[said++]);
          lost = d > 50 ? lost + dt : 0;
          if (lost > 8) { M.fail('Dragan ist entkommen.'); return true; }
          if (M.stageT > 22) f.p.runSpeed = 5.0;          // außer Puste
          if (st.done) f.p.runSpeed = 0.1;
          near = d < 2.4 ? near + dt : 0;
          return near > 0.5;
        });
        S.world.clearTarget();
        st.stopped = true;
        const f = S.chars.get('dragan'); if (f) { f.walk = null; f.p.runSpeed = undefined; }
      } },
      { name: 'Die Abrechnung', async run(M) {
        const S = M.S, F = S.state.flags;
        if (!S.chars.get('dragan')) { const p = P(S), q = S.walkable(p.x + 1.6, p.z, 4) || p; M.npc('dragan', q.x, q.z, 0); }
        await M.talk([
          { who: 'dragan', text: 'Okay! Okay … Luft. Ich krieg keine Luft. Ich bin zu alt für sowas.', mood: 'worried' },
          { who: 'leon', text: 'Warum, Dragan? Warum mein Vater?', mood: 'angry' },
          { who: 'dragan', text: 'Zwanzigtausend. Bar. Von Voss persönlich. Dein Alter wollte nicht verkaufen, also sollte er pleitegehen. Versicherung zahlt nicht bei Brandstiftung durch den Eigentümer.', mood: 'cold' },
          { who: 'dragan', text: 'Er hat mich gesehen, in der Nacht. Er wusste es. Aber Voss hat ihm gesagt: Ein Wort, und dem Sohn in Nürnberg passiert was. Er hat geschwiegen. Für dich.', mood: 'neutral' },
          { who: 'leon', text: '…', mood: 'sad' },
          { choice: [
            { text: F.roth === 'verbuendet' ? 'Kommissarin Roth anrufen' : 'Die Polizei rufen', note: 'Dragan in Haft · Sarah ▲', def: true, say: 'Du erzählst das gleich noch mal. Der Polizei.', act: () => { M.flag('dragan', 'polizei'); M.rel('sarah', 10); },
              then: [{ who: 'dragan', text: 'Die Polizei? Voss hat halb Coburg gekauft, Junge.', mood: 'smug' }, { who: 'leon', text: 'Dann fangen wir mit der anderen Hälfte an.', mood: 'cold' }] },
            { text: 'Geständnis aufnehmen, dann laufen lassen', note: 'Beweis auf Video · Dragan frei', say: 'Noch mal. In die Kamera. Namen, Datum, Betrag. Dann verschwindest du aus Coburg.', act: () => { M.flag('dragan', 'video'); M.flag('draganTape'); },
              then: [{ who: 'dragan', text: '„Ich, Dragan Petrović, habe am 14. März 2021 im Auftrag von Richard Voss …“ Zufrieden?', mood: 'cold' }, { who: 'leon', text: 'Lauf, Dragan. Bevor ich’s mir anders überlege.', mood: 'cold' }] },
            { text: 'Zuschlagen. Für Papa.', note: 'Rache · Sarah ▼ · Tobi ▼', say: 'Das ist für meinen Vater.', mood: 'angry', act: () => { M.flag('dragan', 'rache'); M.flag('revenge', (F.revenge || 0) + 1); M.rel('sarah', -10); M.rel('tobi', -5); },
              then: [{ who: 'dragan', text: 'Argh! … Du bist … wie er. Nur dümmer.', mood: 'angry' }, { who: 'leon', text: '(Das hat sich gut angefühlt. Für zwei Sekunden.)', name: 'Leon (denkt)', mood: 'cold' }] },
          ] },
        ], { with: ['dragan'] });
        if (M.flags.dragan === 'polizei') {
          if (S.state.flags.roth === 'verbuendet') await M.call('roth', [{ who: 'roth', text: 'Ich schicke eine Streife. Halten Sie ihn fest, Berger. Und dann reden wir zwei.' }]);
          else await M.say({ who: 'leon', text: 'Polizei Coburg? Ich habe hier jemanden, der einen Brand gestehen möchte.', dur: 3.6 });
        } else S.chars.walkTo('dragan', P(S).x + 30, P(S).z + 20, false, 10).then(() => S.chars.remove('dragan'));
        await M.sleep(1.5);
        await M.say({ who: 'leon', text: 'Papa hat mich beschützt. Fünf Jahre lang. Jetzt bin ich dran.', dur: 3.6 });
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Dragan hat gestanden: <b>Voss hat den Brand 2021 bezahlt</b>', { polizei: 'Dragan sitzt in Untersuchungshaft', video: 'Dragans Geständnis ist auf Video', rache: 'Du hast dich an Dragan gerächt' }[S.state.flags.dragan] || ''].filter(Boolean) }),
    after: S => { S.hud.phone('sms', 'voss', 'Herr Berger, ich glaube, wir sollten reden. Wie Erwachsene. Heute Abend, bei mir. — R. V.', 9); },
  });

  // =============================================================================================================
  // Mission 27 – Kein einfacher Ausweg
  // =============================================================================================================
  StoryMissions.add({
    id: 'm27', title: 'Kein einfacher Ausweg', contact: 'voss', blurb: 'Voss macht ein letztes Angebot.',
    marker: S => { const h = S.home('leopold'); return h ? beside(S, doorSpot(S, h, 1.5), 6) : null; },
    stages: [
      { name: 'Das Angebot', async run(M) {
        const S = M.S, G = S.G, h = S.home('leopold'), F = S.state.flags;
        if (G.atmo.clock < 18) G.atmo.clock = 20.2;
        const vp = doorSpot(S, h, 1.2);
        M.npc('voss', vp.x, vp.z, Math.atan2(P(S).x - vp.x, P(S).z - vp.z));
        const canTape = (S.rel.get('sarah') >= 20 || F.m12 === 'verbuendet');
        await M.talk([
          { who: 'voss', text: 'Herr Berger. Kommen Sie, die Terrasse hat den besten Blick auf die Veste. Ein Glas?', mood: 'smug' },
          { if: () => F.dragan === 'polizei', then: [{ who: 'voss', text: 'Ich höre, ein ehemaliger Mitarbeiter von mir wurde heute festgenommen. Ärgerlich. Er erzählt gern Märchen.', mood: 'cold' }] },
          { if: () => F.dragan === 'rache', then: [{ who: 'voss', text: 'Dragan liegt im Klinikum. Er sagt, er sei gestürzt. Sie haben einen harten Sturz, Herr Berger.', mood: 'cold' }] },
          { who: 'voss', text: 'Lassen wir das Theater. Zweihundertfünfzigtausend Euro. Für eine Unterschrift unter das Wegerecht. Morgen, beim Notar, vor der Stadtratssitzung.', mood: 'neutral' },
          { who: 'voss', text: 'Fünfundzwanzigtausend sofort. Sie könnten heute Abend noch in Nürnberg sein. Oder in Lissabon. Neu anfangen. Ohne Schulden.', mood: 'smug' },
          { who: 'leon', text: '(Eine Viertelmillion. Alles, was ich je verloren habe. Und mehr.)', name: 'Leon (denkt)', mood: 'worried' },
          { choice: [
            { text: 'Annehmen: „Fünfundzwanzigtausend. Jetzt.“', note: '€ 25.000 · Voss ▲▲ · Sarah ▼ · Tobi ▼', say: 'Fünfundzwanzigtausend. Jetzt. Den Rest morgen beim Notar.', act: () => { M.flag('buyout'); M.money(25000); M.rel('voss', 25); M.rel('sarah', -20); M.rel('tobi', -10); },
              then: [{ who: 'voss', text: 'Ich wusste, dass Sie ein vernünftiger Mann sind. Ganz anders als Ihr Vater.', mood: 'smug' }, { who: 'leon', text: '(Ganz anders als mein Vater. Das ist es ja.)', name: 'Leon (denkt)', mood: 'sad' }] },
            { text: 'Hinhalten – und heimlich mitschneiden', note: 'nur mit Sarah · Beweis gegen Voss', if: () => canTape, say: 'Eine Viertelmillion für einen Feldweg? Erklären Sie mir, warum er Ihnen so viel wert ist.', act: () => { M.flag('vossTape'); M.rel('sarah', 10); },
              then: [{ who: 'voss', text: 'Weil ohne ihn achtzig Millionen in der Itz versinken. Und weil man in Coburg alles kaufen kann. Stadträte, Gutachter, Brandursachen.', mood: 'smug' }, { who: 'leon', text: '(Sarahs Mikrofon in meinem Kragen läuft. Danke, Richard.)', name: 'Leon (denkt)', mood: 'smug' }] },
            { text: 'Ablehnen: „Mein Vater war nicht käuflich. Ich auch nicht.“', note: 'Voss ▼▼', def: true, say: 'Mein Vater war nicht käuflich. Ich auch nicht.', act: () => { M.rel('voss', -30); M.flag('refused27'); },
              then: [{ who: 'voss', text: 'Ihr Vater war nicht käuflich, nein. Er war pleite. Und dann war er tot.', mood: 'cold' }] },
          ] },
          { who: 'voss', text: 'Wie dem auch sei. Ich habe gelernt, mich nie auf nur einen Plan zu verlassen. Guten Abend, Herr Berger.', mood: 'cold' },
        ], { with: ['voss'] });
        S.chars.walkTo('voss', vp.x + (h.ox || 0) * -3, vp.z + (h.oz || 0) * -3, false, 5).then(() => S.chars.remove('voss'));
        await M.sleep(1.5);
      } },
      { name: 'Haftbefehl', async run(M) {
        const S = M.S, G = S.G, h = S.home('leopold');
        if (M.retry) { const d = doorSpot(S, h, 3); M.placePlayer(d.x, d.z); }
        // Voss' „zweiter Plan“: die Polizei sucht Leon im Fall Kessler
        const car = ensureCar(M, P(S).x + 8, P(S).z + 8, 'kombi', '#2e6fb7');
        await M.call('sarah', [
          { who: 'sarah', text: 'Leon! Im Polizeifunk: Haftbefehl gegen dich. Voss’ Zeuge sagt, du hättest Kessler am Bismarckturm überfallen!' },
          { who: 'leon', text: 'Sein zweiter Plan. Natürlich.' },
          { who: 'sarah', text: 'Die Streifen sind schon unterwegs. Versteck dich bei Tobi, in der Werkstatt!' },
        ]);
        G.police.crime(0.2, 'Haftbefehl: Leon Berger wird im Fall Kessler gesucht!', 2);
        if (M.mode !== 'drive') { if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false }); M.objective('Weg hier! Steig in ein <b>Auto</b> und häng die <b>Polizei</b> ab.'); }
        else M.objective('Häng die <b>Polizei</b> ab!');
        await M.wait(() => M.mode === 'drive' || G.police.stars === 0);
        S.world.clearTarget();
        if (G.police.stars > 0) { M.objective('Häng die <b>Polizei</b> ab!'); await M.wait(() => G.police.stars === 0); }
        M.objective(null);
        await M.say({ who: 'leon', text: 'Abgehängt. Jetzt zu Tobi, bevor sie mich wieder finden.', dur: 3 });
      } },
      { name: 'Unterschlupf', async run(M) {
        const S = M.S, G = S.G, w = S.workshop() || { x: -376, z: -856 };
        if (M.retry) { const c = M.vehicle('kombi', '#2e6fb7', w.x + 200, w.z + 120); M.seat(c); }
        M.watch(() => G.police.stars > 0 ? 'Die Polizei hat dich zur Werkstatt verfolgt. Tobi wird mit hineingezogen.' : null);
        await M.goto(S.road(w.x, w.z, 60), { r: 14, name: 'Kfz Weber', text: 'Versteck dich bei <b>Kfz Weber</b> – ohne Polizei im Nacken.' });
        if (M.mode === 'drive') G.exitCar();
        const tp = beside(S, w, 5);
        M.npc('tobi', tp.x, tp.z, Math.atan2(P(S).x - tp.x, P(S).z - tp.z));
        await M.talk([
          { who: 'tobi', text: 'Schau an. Der meistgesuchte Mann Coburgs. Komm rein, das Rolltor geht nur noch halb zu, aber es reicht.', mood: 'neutral' },
          { if: () => S.state.flags.buyout, then: [{ who: 'tobi', text: 'Sarah hat erzählt, dass du Voss’ Geld genommen hast. Sag mir, dass das ein Trick ist, Leon.', mood: 'sad' }, { who: 'leon', text: 'Ich weiß selbst noch nicht, was es ist, Tobi.', mood: 'worried' }] },
          { who: 'tobi', text: 'Kessler soll tot sein, und du sollst es gewesen sein. Super Geschichte. Nur ohne Leiche.', mood: 'worried' },
        ], { with: ['tobi'] });
        await M.call('gul', [
          { who: 'gul', text: 'Leon? Gül. Ich muss dir was sagen, aber du darfst nicht lachen.' },
          { who: 'gul', text: 'Gestern Nacht, Fahrt nach Callenberg. Ein Wagen von Voss überholt mich, hinten sitzt einer. Grauer Bart, Brille. Lebend!' },
          { who: 'leon', text: 'Kessler. Er lebt.' },
          { who: 'gul', text: 'Die sind in den Waldweg hinter dem Schloss abgebogen. Zur alten Jagdhütte.' },
        ]);
        await M.talk([
          { who: 'tobi', text: 'Wenn Kessler lebt, bist du raus aus der Nummer. Und Voss ist mittendrin.', mood: 'happy' },
          { who: 'leon', text: 'Dann holen wir ihn. Heute Nacht.', mood: 'cold' },
        ], { with: ['tobi'] });
      } },
    ],
    reward: (S) => { const F = S.state.flags; return { money: 0, lines: [F.buyout ? 'Du hast <b>€ 25.000</b> von Voss angenommen' : F.vossTape ? 'Voss’ Geständnis ist <b>mitgeschnitten</b>' : 'Du hast Voss’ Angebot <b>abgelehnt</b>', 'Heiße Spur: <b>Kessler lebt</b> – Jagdhütte bei Callenberg'] }; },
  });

  // =============================================================================================================
  // Mission 28 – Alles verändert sich
  // =============================================================================================================
  StoryMissions.add({
    id: 'm28', title: 'Alles verändert sich', contact: 'gul', blurb: 'Eine Spur führt in den Wald bei Callenberg.',
    marker: S => { const w = S.workshop() || { x: -376, z: -856 }; return beside(S, S.road(w.x, w.z, 60), 7); },
    stages: [
      { name: 'Nach Callenberg', async run(M) {
        const S = M.S, G = S.G, w = S.workshop() || { x: -376, z: -856 };
        G.atmo.clock = Math.max(G.atmo.clock, 22.3);
        const car = ensureCar(M, w.x + 10, w.z + 10, 'pickup', '#5b2c2c');
        await toCar(M, car, 'Nimm Tobis <b>Pick-up</b> und fahr nach <b>Callenberg</b>.');
        M.every(() => { if (M.stageT > 10) { M.say([
          { who: 'leon', text: 'Gül, Erwin, Lenz, Sarah. Vor vier Wochen kannte ich keinen davon. Jetzt riskieren sie alles für mich.', dur: 4.6 },
          { who: 'leon', text: 'Und Max … Max hat mich verkauft. Komisch, wie schnell sich alles dreht.', dur: 4 },
        ]); return true; } return false; });
        await M.goto(huette(S), { r: 30, car: true, name: 'Waldweg bei Callenberg', text: 'Fahr zum <b>Waldweg hinter Schloss Callenberg</b>.' });
        await M.say({ who: 'leon', text: 'Licht aus. Den Rest zu Fuß.', dur: 2.4 });
      } },
      { name: 'Die Jagdhütte', async run(M) {
        const S = M.S, G = S.G, r = huette(S);
        G.atmo.clock = Math.max(G.atmo.clock, 22.3);
        if (M.mode === 'drive') G.exitCar();
        if (M.retry) { M.placePlayer(r.x, r.z); }
        const hp = S.walkable(r.x - 36, r.z - 8, 30) || beside(S, r, 36);
        const hut = buildHut(M, hp);
        M.vehicle('suv', '#15161a', hp.x - 8, hp.z + 6, 0.4);
        const g = new Guards(M, [
          { route: patrol(S, { x: hp.x - 9, z: hp.z + 7 }, { x: hp.x + 9, z: hp.z + 7 }) },
          { route: patrol(S, { x: hp.x + 7, z: hp.z - 6 }, { x: hp.x + 7, z: hp.z + 9 }) },
        ]);
        g.watch('Ein Wachmann hat dich entdeckt. „Die Hütte ist gefunden – weg mit ihm!“');
        M.watch(() => M.mode !== 'walk' ? 'Mit dem Auto vor die Hütte? Die Wachen hören dich kommen.' : null);
        S.world.setTarget(hut.door.x, hut.door.z, { r: 1.8, name: 'Jagdhütte', beacon: true, color: '#9ad0ff' });
        M.objective('Schleich zur <b>Tür der Jagdhütte</b>. Lichtkegel meiden, nicht rennen.');
        await M.interact(hut.door, 'Tür aufbrechen', 2.2);
        S.world.clearTarget();
        G.audio.beep && G.audio.beep(300, 0.12);
        M.meter(null);
        M.watchers = [];
        // Kessler in der Hütte
        const kp = S.walkable(hut.door.x + 1, hut.door.z + 0.6, 3) || hut.door;
        M.npc('kessler', kp.x, kp.z, Math.atan2(P(S).x - kp.x, P(S).z - kp.z));
        await M.talk([
          { who: 'kessler', text: 'Leon?! Bist du … bist du echt? Ich dachte, die kommen zurück, um es zu Ende zu bringen.', mood: 'surprised' },
          { who: 'leon', text: 'Ganz Coburg glaubt, ich hätte dich umgebracht, Jürgen. Komm. Wir gehen.', mood: 'neutral' },
          { who: 'kessler', text: 'Voss hat mich am Bahnhof abgefangen, nachdem du mich abgesetzt hast. Er wollte, dass ich verschwinde – und du der Mörder bist.', mood: 'worried' },
          { who: 'wache', name: 'Wachmann', text: 'HEY! Die Tür ist offen! Ruf Dragans Leute!', mood: 'angry' },
        ], { with: ['kessler'] });
      } },
      { name: 'Flucht', async run(M) {
        const S = M.S, G = S.G, r = huette(S);
        if (M.retry || !S.chars.get('kessler')) { M.placePlayer(r.x + 6, r.z + 6); const p = P(S); M.npc('kessler', p.x + 1.5, p.z, 0); }
        // eigenes Auto in der Nähe, sonst eins direkt an den Waldweg stellen (im Landkreis findet parkCarNear keine Straße)
        const pl = P(S);
        const car = M.mode === 'drive' ? G.car() : G.parked.filter(c => !c.wrecked && !c.burning && Math.hypot(c.x - pl.x, c.z - pl.z) < 90).sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0] || M.vehicle('pickup', '#5b2c2c', r.x, r.z, 0);
        S.chars.walkTo('kessler', car.x, car.z, true, 20);
        await toCar(M, car, 'Zum <b>Auto</b> – mit Kessler!');
        S.chars.hide('kessler');
        const from = navPt(S, r.x + 220, r.z + 60);
        const h1 = M.driven('suv', '#15161a', from.x, from.z, 0), h2 = M.driven('suv', '#202226', from.x + 3, from.z + 9, 0);
        const hunt = hunters(M, [h1, h2], 22);
        M.watch(() => { const c = G.car(); return c && (c.wrecked || c.burning) ? 'Der Wagen ist hinüber. Voss’ Leute holen sich Kessler zurück.' : null; });
        M.objective('Häng <b>Voss’ Leute</b> ab!');
        await shakeOff(M, [h1, h2], 200, 9);
        hunt.stop();
        await M.say({ who: 'kessler', text: 'Sind sie weg? Gott. Ich hab drei Wochen nur Dosenravioli gegessen.', dur: 3.4 });
      } },
      { name: 'In Sicherheit', async run(M) {
        const S = M.S, G = S.G, F = S.state.flags;
        const toRoth = F.roth === 'verbuendet';
        const dest = toRoth ? polizei(S) : redaktion(S);
        if (M.retry) { const c = M.vehicle('pickup', '#5b2c2c', dest.x + 400, dest.z - 300); M.seat(c); }
        await M.goto(S.road(dest.x, dest.z, 80), { r: 15, car: true, slow: 6, name: toRoth ? 'Polizeiinspektion' : 'Redaktion', text: toRoth ? 'Bring Kessler zu <b>Kommissarin Roth</b> (Polizeiinspektion).' : 'Bring Kessler zu <b>Sarah</b> in die Redaktion.' });
        G.exitCar();
        const who = toRoth ? 'roth' : 'sarah';
        const wp = beside(S, P(S), 3), kp = S.walkable(P(S).x + 1.4, P(S).z + 0.6, 4) || P(S);
        S.chars.remove('kessler'); M.npc('kessler', kp.x, kp.z, 0); M.npc(who, wp.x, wp.z, Math.atan2(P(S).x - wp.x, P(S).z - wp.z));
        await M.talk(toRoth ? [
          { who: 'roth', text: 'Jürgen Kessler. Lebendig. Herr Berger, Sie haben eine seltsame Art, Ihre Unschuld zu beweisen.', mood: 'surprised' },
          { who: 'kessler', text: 'Ich sage aus. Alles. Die Autos, das Geld, die Hütte. Und wer mich da reingesteckt hat.', mood: 'neutral' },
          { who: 'roth', text: 'Der Haftbefehl ist hiermit gegenstandslos. Und ich glaube, ich muss mich mal mit Herrn Voss’ Zeugen unterhalten.', mood: 'cold' },
        ] : [
          { who: 'sarah', text: 'Ist das … Jürgen Kessler? Der tote Jürgen Kessler?', mood: 'surprised' },
          { who: 'kessler', text: 'Ziemlich lebendig, danke. Und ziemlich bereit, mit einer Journalistin zu reden.', mood: 'neutral' },
          { who: 'sarah', text: 'Ich ruf die Staatsanwaltschaft in Bamberg an. Die kauft Voss nicht. Leon, du bist raus. Offiziell.', mood: 'happy' },
        ], { with: ['kessler', who] });
        M.flag('kesslerSafe');
        await M.say({ who: 'leon', text: 'Ich bin kein Verdächtiger mehr. Jetzt ist Voss dran.', dur: 3.2 });
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['<b>Kessler lebt</b> und sagt gegen Voss aus', 'Der Haftbefehl gegen dich ist aufgehoben'] }),
    after: S => { S.hud.phone('sms', 'sarah', 'Wir brauchen einen Plan für die Stadtratssitzung übermorgen. Alle, die dir noch vertrauen. Komm in deine Wohnung, ich bring Kaffee.', 9); },
  });

  // =============================================================================================================
  // Mission 29 – Zusammenhalt
  // =============================================================================================================
  // Verbündete: Rolle und Ort; wer mitmacht, hängt von der Beziehung ab
  const ALLY = {
    sarah: { role: 'Artikel und Livestream', at: S => redaktion(S), name: 'Sarah (Redaktion)' },
    tobi: { role: 'Fluchtwagen und Technik', at: S => { const w = S.workshop() || { x: -376, z: -856 }; return beside(S, S.road(w.x, w.z, 60), 6); }, name: 'Tobi (Kfz Weber)' },
    max: { role: 'Aussage über Voss’ Geld', at: S => markt(S), name: 'Max (Bratwurststand)' },
    roth: { role: 'Durchsuchungsbeschluss', at: S => polizei(S), name: 'Roth (Polizei)' },
    gul: { role: 'Zeugin und Fahrerin', at: S => { const a = S.lm('Albertsplatz') || { x: 100, z: -150 }; return S.walkable(a.x, a.z, 20) || a; }, name: 'Gül (Albertsplatz)' },
  };
  const ALLY_LINES = {
    sarah: [{ who: 'sarah', text: 'Ich schreibe den Artikel. Er erscheint in der Sekunde, in der Voss im Rathaus lügt. Live.', mood: 'happy' }],
    tobi: [{ who: 'tobi', text: 'Ein Fluchtwagen, ein Funkgerät und eine Kamera, die durch Wände guckt. Na gut, durch Fenster. Ich bin dabei.', mood: 'happy' }],
    max: [{ who: 'max', text: 'Ich sag aus. Vor dem ganzen Stadtrat. Mit Kontoauszügen. Das ist das Mindeste.', mood: 'sad' }, { who: 'leon', text: 'Das ist ein Anfang, Max.', mood: 'neutral' }],
    roth: [{ who: 'roth', text: 'Mit Kesslers Aussage krieg ich einen Durchsuchungsbeschluss für die Villa. Aber erst, wenn Sie mir die Server-Daten bringen.', mood: 'neutral' }],
    gul: [{ who: 'gul', text: 'Ich fahr dich, wohin du willst. Und ich sag jedem, was ich in der Nacht am Bahnhof gesehen hab. Taxifahrerinnen vergessen nichts.', mood: 'happy' }],
  };
  StoryMissions.add({
    id: 'm29', title: 'Zusammenhalt', contact: 'sarah', blurb: 'Leon sammelt seine Verbündeten.',
    marker: S => { const h = S.home('lossau'); return h ? beside(S, doorSpot(S, h, 1), 6) : null; },
    stages: [
      { name: 'Der Kreis', async run(M) {
        const S = M.S, G = S.G, h = S.home('lossau'), F = S.state.flags;
        if (G.atmo.clock < 8 || G.atmo.clock > 19) G.atmo.clock = 9.5;
        const sp = beside(S, doorSpot(S, h, 1), 3);
        M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z));
        await M.talk([
          { who: 'sarah', text: 'Kaffee. Schwarz, wie deine Zukunft, wenn das schiefgeht.', mood: 'happy' },
          { who: 'sarah', text: 'Übermorgen stimmt der Stadtrat über das Quartier Itzaue ab. Voss wird da sein, Brandt wird da sein, die Presse auch. Wenn wir ihn stürzen wollen, dann dort.', mood: 'neutral' },
          { who: 'leon', text: 'Allein schaffen wir das nicht.', mood: 'worried' },
          { who: 'sarah', text: 'Nein. Wir brauchen alle, die dir noch vertrauen. Frag sie. Persönlich. Leute sagen am Telefon zu schnell Nein.', mood: 'neutral' },
        ], { with: ['sarah'] });
        S.chars.remove('sarah');
      } },
      { name: 'Verbündete', async run(M) {
        const S = M.S, G = S.G, F = S.state.flags;
        // wen Leon fragen kann
        const ids = ['tobi', 'gul'];
        if (F.maxFate === 'verschont') ids.push('max');
        if (F.roth === 'verbuendet') ids.push('roth');
        const pts = {};
        for (const id of ids) { const p = ALLY[id].at(S); pts[id] = p; S.world.addMarker('m29' + id, p.x, p.z, ALLY[id].name, id); }
        M.onCleanup(() => { for (const id of ids) S.world.removeMarker('m29' + id); });
        const joined = (F.allies || []).filter(a => a === 'sarah' || ids.includes(a));
        if (!joined.includes('sarah')) joined.push('sarah');
        for (const id of ids) if (joined.includes(id)) S.world.removeMarker('m29' + id);
        M.timer(480, 'Zu spät: Die Sitzung ist morgen früh, und du hast niemanden erreicht.');
        const left = () => ids.filter(id => !joined.includes(id) && !(M.asked || []).includes(id));
        M.asked = [];
        while (left().length) {
          M.objective(`Frag deine <b>Verbündeten</b> persönlich (${M.asked.length}/${ids.length}): ${left().map(id => ALLY[id].name).join(' · ')}`);
          const id = await M.wait(() => left().find(i => Math.hypot(M.pos.x - pts[i].x, M.pos.z - pts[i].z) < 14 && (M.mode === 'walk' || Math.abs(M.car.speed) < 4)) || null);
          S.world.removeMarker('m29' + id);
          M.asked.push(id);
          if (M.mode === 'drive') G.exitCar();
          const fp = beside(S, P(S), 3);
          M.npc(id, fp.x, fp.z, Math.atan2(P(S).x - fp.x, P(S).z - fp.z));
          const trust = S.rel.get(id);
          const no = id === 'tobi' && (trust < 10 || F.buyout);
          await M.talk([
            { who: 'leon', text: 'Ich brauche dich. Übermorgen, Stadtratssitzung. Wir holen uns Voss.', mood: 'neutral' },
            ...(no ? [
              { who: 'tobi', text: F.buyout ? 'Du hast sein Geld genommen, Leon. Woher weiß ich, dass du uns nicht morgen auch verkaufst?' : 'Nach allem? Ich hab dir die Wahrheit gesagt, und du hast mich stehen lassen.', mood: 'sad' },
              { choice: [
                { text: '„Du hast recht. Aber ohne dich schaffen wir es nicht.“', note: 'ehrlich', def: true, say: 'Du hast recht, Tobi. Ich hab Mist gebaut. Aber ohne dich schaffen wir es nicht.', act: () => { M.rel('tobi', 15); },
                  then: [{ who: 'tobi', text: '… Für deinen Vater. Nicht für dich. Noch nicht.', mood: 'neutral' }] },
                { text: '„Dann eben ohne dich.“', note: 'Tobi ist raus', say: 'Dann eben ohne dich.', act: () => { M.rel('tobi', -10); M.flag('tobiOut'); },
                  then: [{ who: 'tobi', text: 'Viel Glück, Leon. Wirklich.', mood: 'sad' }] },
              ] },
            ] : ALLY_LINES[id]),
          ], { with: [id] });
          if (!M.flags.tobiOut || id !== 'tobi') { joined.push(id); M.rel(id, 5); G.ui.toast(`${STORY_CAST[id].name} ist dabei: ${ALLY[id].role}`, 2.4); }
          S.chars.remove(id);
          M.flag('allies', joined.slice());
        }
        M.stopTimer();
        M.objective(null);
      } },
      { name: 'Der Plan', async run(M) {
        const S = M.S, G = S.G, h = S.home('lossau'), F = S.state.flags;
        const d = doorSpot(S, h, 1);
        if (M.retry) M.placePlayer(d.x + 30, d.z + 30);
        await M.goto(d, { r: 3, name: 'Lossaustraße', text: 'Zurück in deine <b>Wohnung</b> – Lagebesprechung.' });
        if (M.mode === 'drive') G.exitCar();
        const al = (F.allies || ['sarah']).filter(a => STORY_CAST[a]);
        const extra = ['lenz', 'kessler'];
        await M.black(true, 600);
        const rows = al.concat(extra).map(a => `<b>${STORY_CAST[a].full || STORY_CAST[a].name}</b> — ${ALLY[a] ? ALLY[a].role : a === 'lenz' ? 'Konten, Verträge, Protokolle (USB-Stick)' : 'Aussage: Geldwäsche, Entführung'}`).join('<br>');
        await M.doc('Plan · Stadtratssitzung, Rathaus, 18:00', `<p>${rows}</p>
          <p><b>Leon</b> — holt vorher die Server-Kopie aus der Villa, parkt den Fluchtwagen, platziert die Kamera im Sitzungssaal.</p>
          <p><span class="st-hand">Voss redet. Wir zeigen live, was er wirklich gesagt hat.</span></p>`);
        await M.black(false, 600);
        const sp = beside(S, P(S), 2.5);
        M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z));
        await M.talk([
          { who: 'sarah', text: `${al.length + extra.length} Leute. Vor einem Monat warst du ein Fahrer mit Schulden.`, mood: 'happy' },
          { if: () => al.length < 3, then: [{ who: 'sarah', text: 'Es sind wenige. Aber es sind die Richtigen. Hoffe ich.', mood: 'worried' }] },
          { who: 'leon', text: 'Und morgen Nacht hole ich, was wir noch brauchen. Direkt aus Voss’ Arbeitszimmer.', mood: 'cold' },
          { who: 'sarah', text: 'Du bist verrückt. Ich mag das. Ein bisschen.', mood: 'laugh' },
        ], { with: ['sarah'] });
      } },
    ],
    reward: (S) => { const a = (S.state.flags.allies || []).filter(x => STORY_CAST[x]); return { money: 0, lines: [`Verbündete für die Sitzung: <b>${a.map(x => STORY_CAST[x].name).join(', ')}</b>, Dr. Lenz, Kessler`] }; },
  });

  // =============================================================================================================
  // Mission 30 – Der letzte Auftrag
  // =============================================================================================================
  StoryMissions.add({
    id: 'm30', title: 'Der letzte Auftrag', contact: 'tobi', blurb: 'Eine Nacht, drei Aufgaben.',
    marker: S => { const w = S.workshop() || { x: -376, z: -856 }; return beside(S, S.road(w.x, w.z, 60), 7); },
    stages: [
      { name: 'Die Villa', async run(M) {
        const S = M.S, G = S.G, h = S.home('leopold'), w = S.workshop() || { x: -376, z: -856 };
        G.atmo.clock = 23.2;
        if (!M.retry) await M.say([
          { who: 'tobi', text: 'Drei Dinge heute Nacht: Server-Kopie aus der Villa. Fluchtwagen hierher. Kamera ins Rathaus. In der Reihenfolge.', dur: 4.4 },
          { who: 'tobi', text: 'Lenz sagt, der Server steht im Arbeitszimmer, Fenster zum Garten. Kopieren dauert. Lass dich nicht erwischen.', dur: 4.2 },
        ]);
        const vd = doorSpot(S, h, 1.2);
        const start = beside(S, vd, 40);
        if (M.retry) M.placePlayer(start.x, start.z);
        else { const car = ensureCar(M, w.x + 8, w.z + 8, 'kombi', '#1c3d5a'); await toCar(M, car, 'Fahr zur <b>Villa Leopoldstraße</b>.'); }
        await M.goto(start, { r: 12, name: 'Villa Leopoldstraße', text: 'Fahr zur <b>Villa Leopoldstraße</b> und park in sicherer Entfernung.' });
        if (M.mode === 'drive') G.exitCar();
        const win = S.walkable(vd.x + (h.oz || 0) * 4, vd.z - (h.ox || 0) * 4, 6) || beside(S, vd, 4);
        const g = new Guards(M, [
          { route: patrol(S, { x: vd.x - 10, z: vd.z + 4 }, { x: vd.x + 10, z: vd.z + 4 }) },
          // läuft in 7 m Abstand am Fenster vorbei: gefährlich nur auf halber Strecke (Kopie läuft weiter, wenn man kurz ausweicht)
          { route: patrol(S, { x: win.x - 14, z: win.z + 7 }, { x: win.x + 14, z: win.z + 7 }) },
        ]);
        g.watch('Ein Wachmann hat dich im Garten entdeckt. Voss ist gewarnt.');
        M.watch(() => M.mode !== 'walk' ? 'Mit dem Auto in Voss’ Garten? Mutig. Und dumm.' : null);
        S.world.setTarget(win.x, win.z, { r: 1.8, name: 'Arbeitszimmer', color: '#9ad0ff' });
        M.objective('Schleich zum <b>Fenster des Arbeitszimmers</b>.');
        await M.interact(win, 'USB-Stick einstecken', 2.2);
        S.world.clearTarget();
        // Kopieren: in der Nähe bleiben (unentdeckt)
        let prog = 0;
        M.objective('Bleib am Fenster, bis die <b>Kopie</b> fertig ist.');
        await M.wait(dt => {
          const near = Math.hypot(P(S).x - win.x, P(S).z - win.z) < 3.2;
          if (near) prog += dt / 14;
          M.S.hud.meter('Kopie ' + Math.round(prog * 100) + ' %', prog);
          return prog >= 1;
        });
        G.audio.beep && G.audio.beep(1400, 0.08);
        M.flag('serverCopy');
        M.say({ who: 'leon', text: 'Kopie fertig. Konten, Mails, Verträge. Alles.', dur: 2.6 });
        await M.goto(start, { r: 8, foot: true, name: 'Weg vom Garten', text: 'Raus aus dem <b>Garten</b>, unbemerkt.' });
        M.watchers = [];
        M.meter(null);
      } },
      { name: 'Der Fluchtwagen', async run(M) {
        const S = M.S, G = S.G, h = S.home('leopold'), w = S.workshop() || { x: -376, z: -856 };
        const r = S.road(h.sx, h.sz, 120);
        if (M.retry) M.placePlayer(r.x + 20, r.z + 20);
        M.vossCar = M.vehicle('super', '#111111', r.x, r.z);
        await M.say({ who: 'leon', text: 'Und das da ist Voss’ neuer Supersportwagen. Zweihundertfünfzig Sachen. Tobi wollte einen Fluchtwagen …', dur: 4 });
        S.world.setTarget(M.vossCar.x, M.vossCar.z, { r: 3, name: 'Voss’ Supersportwagen', beacon: false });
        M.objective('Nimm <b>Voss’ Supersportwagen</b> als Fluchtwagen.');
        await M.wait(() => M.inCar(M.vossCar));
        S.world.clearTarget();
        G.police.crime(0.1, 'Autoalarm in der Leopoldstraße!', 1);
        M.watch(() => M.vossCar.wrecked || M.vossCar.health < 35 ? 'Der Fluchtwagen ist Schrott. So entkommt morgen keiner.' : null);
        M.objective('Bring den Wagen zu <b>Kfz Weber</b>. Erst die Polizei abhängen, wenig Schaden.');
        await M.goto(S.road(w.x, w.z, 60), { r: 12, car: M.vossCar, slow: 5, name: 'Kfz Weber' });
        if (G.police.stars > 0) { M.objective('Erst die <b>Polizei</b> abhängen – sonst ist das Versteck verraten.'); await M.wait(() => G.police.stars === 0); await M.goto(S.road(w.x, w.z, 60), { r: 12, car: M.vossCar, slow: 5, name: 'Kfz Weber', text: 'Zurück zu <b>Kfz Weber</b>.' }); }
        G.exitCar();
        await M.say({ who: 'tobi', text: 'Du hast … Voss’ Auto geklaut? Leon. Ich liebe dich. Nicht so. Aber ein bisschen.', dur: 3.8 });
      } },
      { name: 'Das Rathaus', async run(M) {
        const S = M.S, G = S.G, rh = rathaus(S), rl = S.lm('Rathaus') || { x: -12, z: 69 };
        M.watchers = [];
        G.atmo.clock = Math.max(G.atmo.clock, 23.6);
        if (M.retry) M.placePlayer(rh.x + 40, rh.z - 40);
        await M.goto(beside(S, rh, 28), { r: 8, name: 'Marktplatz', text: 'Zum <b>Marktplatz</b>. Die Kamera muss ins Rathaus.' });
        if (M.mode === 'drive') G.exitCar();
        const g = new Guards(M, [{ route: patrol(S, { x: rh.x - 12, z: rh.z - 2 }, { x: rh.x + 12, z: rh.z - 2 }) }]);
        g.watch('Der Nachtwächter hat dich am Rathaus erwischt.');
        S.world.setTarget(rh.x, rh.z, { r: 1.8, name: 'Rathaus', color: '#9ad0ff' });
        M.objective('Bring die <b>Kamera</b> am Fenster des Sitzungssaals an (Rathaus).');
        await M.interact(rh, 'Kamera anbringen', 2.2);
        S.world.clearTarget();
        G.audio.beep && G.audio.beep(900, 0.06);
        M.flag('cameraSet');
        M.watchers = [];
        M.meter(null);
        const y = yOf(S, rl.x, rl.z);
        await M.cut([{ pos: [rl.x + 30, y + 12, rl.z - 40], look: [rl.x, y + 8, rl.z], to: { pos: [rl.x + 22, y + 9, rl.z - 30] }, dur: 5, fov: 46 }],
          [{ who: 'leon', text: 'Server-Kopie. Fluchtwagen. Kamera. Morgen um sechs ist es vorbei, Richard.', dur: 4.4 }]);
        await M.sleep(0.8);
        M.sms('voss', 'Schöne Kamera, Herr Berger. Ich freue mich auf morgen. Bringen Sie Ihre Freunde mit. — R. V.');
        await M.sleep(3);
        await M.say([
          { who: 'leon', text: '… Er weiß es. Er weiß alles.', dur: 2.8 },
          { who: 'leon', text: 'Woher? Wer hat –', dur: 2 },
        ]);
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Server-Kopie, Fluchtwagen, Kamera: <b>alles bereit</b>', 'Voss’ Supersportwagen steht bei Kfz Weber', 'Kapitel 6 abgeschlossen: Voss weiß Bescheid'] }),
  });
})();
