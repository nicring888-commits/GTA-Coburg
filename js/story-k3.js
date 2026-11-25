// Story-Modus (seit v3.24.0), Teil 5: Kapitel 3 „Hinter den Kulissen“ – Missionen 11–15.
// Neue Bausteine (hier lokal): Verfolgung zu Fuß (footChase), Wachleute mit Lichtkegel (Guards), Verfolger-Autos (hunters).
// Handlung: STORY.md, Kapitel 3.
'use strict';

(() => {
  const P = S => S.G.player();
  const yOf = (S, x, z) => S.G.world.heightAt(x, z);
  const beside = (S, p, d = 9) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q = S.walkable(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); if (q && Math.hypot(q.x - p.x, q.z - p.z) > d - 2.5) return q; } return S.walkable(p.x, p.z, 15) || p; };
  const doorSpot = (S, h, out = 1) => S.walkable(h.sx + (h.ox || 0) * out, h.sz + (h.oz || 0) * out, 8) || { x: h.sx, z: h.sz };
  const carSide = (S, c, d = 2.2) => S.walkable(c.x + Math.cos(c.heading) * d, c.z - Math.sin(c.heading) * d, 4) || S.walkable(c.x - Math.cos(c.heading) * d, c.z + Math.sin(c.heading) * d, 6) || { x: c.x, z: c.z };
  const kesslerHof = S => S.road(-700, -1130, 250);
  // Brandruine des Autohauses Berger an der Uferstraße (Itzufer)
  const ruine = S => { const r = S.road(-337, 631, 80); return S.walkable(r.x + (-337 - r.x) * 0.6 + 4, r.z + (631 - r.z) * 0.6, 20) || r; };
  const ensureCar = (M, x, z, kind = 'kleinwagen', color = '#8a8f96') => {
    const G = M.G;
    if (M.mode === 'drive') return G.car();
    const near = G.parked.find(c => !c.wrecked && !c.burning && !c.storyDriven && Math.hypot(c.x - x, c.z - z) < 40);
    return near || M.vehicle(kind, color, x, z);
  };
  const keepUp = (M, ctl, who, maxGap = 220, secs = 12) => {
    let lost = 0;
    return M.watch(dt => {
      if (ctl.done || ctl.stopped) return null;
      if (ctl.gap > maxGap) { lost += dt; if (lost > 1 && lost - dt <= 1) M.G.ui.toast(`Du verlierst ${who}!`, 2); } else lost = 0;
      return lost > secs ? `Du hast ${who} aus den Augen verloren.` : null;
    });
  };

  // Figur rennt einen Weg über das Straßennetz ab (Punkte alle 4 m); Promise, wenn sie angekommen ist
  const runPath = (M, id, from, to, speed = 7.4) => {
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
      const x = path[st.i * 2], z = path[st.i * 2 + 1];
      // am Gehsteig bleiben: leicht nach rechts versetzt
      S.chars.walkTo(id, x, z, true, 6).then(() => { if (st.i >= path.length / 2 - 1) st.done = true; else next(); });
    };
    next();
    return st;
  };

  // Wachleute mit Taschenlampen-Kegel: laufen zwischen Punkten, sehen den Spieler im Kegel (13 m, ±34°) ohne Hauswand dazwischen
  class Guards {
    constructor(M, list) {
      this.M = M; this.S = M.S; this.list = list; this.alert = 0; this.cones = [];
      list.forEach((g, i) => {
        const id = 'wache' + i;
        if (!STORY_CAST[id]) STORY_CAST[id] = STORY_CAST.wache;
        const f = M.npc(id, g.route[0].x, g.route[0].z, 0);
        f.p.runSpeed = 3;
        g.id = id; g.k = 0;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(4.6, 13, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe8a0', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
        cone.geometry.translate(0, -6.5, 0); cone.rotation.x = -Math.PI / 2 + 0.12; cone.position.set(0, 1.25, 0.2);
        f.p.group.add(cone);
        this.cones.push(cone);
        this.walk(g);
      });
    }
    walk(g) {
      if (this.M.dead || !this.S.chars.get(g.id)) return;
      g.k = (g.k + 1) % g.route.length;
      const p = g.route[g.k];
      this.S.chars.walkTo(g.id, p.x, p.z, false, 25).then(() => setTimeout(() => this.walk(g), 900 + Math.random() * 1200));
    }
    // 0 … 1: wie sehr der Spieler gerade gesehen wird
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
  }

  // Verfolger: Autos, die alle 2,5 s neu zum Spieler routen
  const hunters = (M, cars, speed = 21) => {
    const S = M.S;
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

  // =============================================================================================================
  // Mission 11 – Die Journalistin
  // =============================================================================================================
  StoryMissions.add({
    id: 'm11', title: 'Die Journalistin', contact: 'sarah', blurb: 'Jemand fotografiert Leon.',
    marker: S => { const h = S.home('lossau'); return h ? beside(S, doorSpot(S, h, 1), 6) : null; },
    stages: [
      { name: 'Die Kamera', async run(M) {
        const S = M.S, G = S.G, h = S.home('lossau');
        const door = doorSpot(S, h, 1);
        const sp = beside(S, door, 14);
        M.npc('sarah', sp.x, sp.z, Math.atan2(door.x - sp.x, door.z - sp.z));
        await M.cut([
          { pos: [sp.x + 3, yOf(S, sp.x, sp.z) + 1.7, sp.z + 3], look: [sp.x, yOf(S, sp.x, sp.z) + 1.6, sp.z], dur: 2.6, fov: 38 },
        ], [{ who: 'leon', text: 'Da fotografiert jemand mein Haus. Und meinen Wagen. Und … mich.', dur: 3 }]);
        await M.say({ who: 'leon', text: 'Hey! Sie da!' });
        // Sarah rennt weg Richtung Bahnhof
        const sp2 = G.spawn;
        const goal = S.road(sp2.roadX, sp2.roadZ, 80);
        M.run11 = runPath(M, 'sarah', sp, goal, 7.4);
        M.flag('metSarah');
      } },
      { name: 'Verfolgung', async run(M) {
        const S = M.S, G = S.G;
        if (M.retry || !S.chars.get('sarah')) {
          const h = S.home('lossau'), door = doorSpot(S, h, 1), sp = beside(S, door, 14);
          M.placePlayer(door.x, door.z);
          M.npc('sarah', sp.x, sp.z, 0);
          M.run11 = runPath(M, 'sarah', sp, S.road(G.spawn.roadX, G.spawn.roadZ, 80), 7.4);
        }
        const st = M.run11;
        M.objective('Hol die <b>Fotografin</b> ein – zu Fuß! (<kbd>Shift</kbd> rennen)');
        S.world.setTarget(0, 0, { r: 1, name: 'Fotografin', beacon: false, route: false });
        let lost = 0, near = 0, said = 0;
        const lines = [
          { who: 'leon', text: 'Stehen bleiben! Ich will nur reden!' },
          { who: 'sarah', text: 'Das sagen sie alle!' },
          { who: 'leon', text: 'Wer sind „alle“?!' },
        ];
        await M.wait(dt => {
          const f = S.chars.get('sarah'); if (!f) return true;
          const T = S.world.target; if (T) { T.x = f.p.x; T.z = f.p.z; }
          const d = Math.hypot(P(S).x - f.p.x, P(S).z - f.p.z);
          if (M.mode !== 'walk') { if (M.stageT > 1) M.fail('Die Fotografin ist in der Menge verschwunden. Zu Fuß wär’s gegangen.'); return true; }
          if (said < lines.length && M.stageT > 3 + said * 5) M.say(lines[said++]);
          lost = d > 45 ? lost + dt : 0;
          if (lost > 7) { M.fail('Die Fotografin ist entkommen.'); return true; }
          // nach 25 s wird sie müde (langsamer)
          if (M.stageT > 25) f.p.runSpeed = 5.2;
          if (st.done) f.p.runSpeed = 0.1;
          near = d < 2.4 ? near + dt : 0;
          return near > 0.5;
        });
        S.world.clearTarget();
        st.stopped = true;
        const f = S.chars.get('sarah'); if (f) { f.walk = null; f.p.runSpeed = undefined; }
      } },
      { name: 'Wer sind Sie?', async run(M) {
        const S = M.S;
        if (!S.chars.get('sarah')) { const p = P(S), q = S.walkable(p.x + 1.6, p.z, 4) || p; M.npc('sarah', q.x, q.z, 0); }
        await M.talk([
          { who: 'sarah', text: 'Okay! Okay. Ich bin stehen geblieben. Bitte nicht schlagen, ich hab Pfefferspray. Irgendwo. In der Tasche. Glaub ich.', mood: 'worried' },
          { who: 'leon', text: 'Warum fotografieren Sie mich?', mood: 'angry' },
          { who: 'sarah', text: '… Moment. Sie sind der Kistenträger! Aus der Lossaustraße! Sie haben meine Kaffeemaschine getragen!', mood: 'surprised' },
          { who: 'leon', text: 'Frau Neumann. Die Journalistin von oben.', mood: 'surprised' },
          { who: 'sarah', text: 'Sarah. Coburger Stadtbote. Und Sie sind Leon Berger, Sohn von Günter Berger, seit zwei Wochen Fahrer von Richard Voss.', mood: 'smug' },
          { who: 'sarah', text: 'Ich recherchiere seit einem Jahr über Voss. Brände. Gekaufte Gutachten. Leute, die plötzlich verkaufen. Und dann steht sein neuer Fahrer bei mir im Haus.', mood: 'cold' },
          { who: 'leon', text: 'Ich fahre Autos. Mehr nicht.', mood: 'cold' },
          { who: 'sarah', text: 'Drei Luxuswagen zum Kessler-Hof in einer Nacht. Ich hab Fotos. Exportiert wird da nicht nur Blech, Herr Berger.', mood: 'cold' },
          { choice: [
            { text: 'Offen: „Ich weiß, dass Voss das Autohaus meines Vaters angezündet hat.“', note: 'Sarah ▲', if: () => !!M.flags.sawList, say: 'Ich hab eine Liste gesehen. Bei Dragan im Wagen. Da steht das Autohaus meines Vaters drauf. „Brand 2021“. Abgehakt.', act: () => { M.rel('sarah', 20); M.flag('m11', 'offen'); },
              then: [{ who: 'sarah', text: '… Das ist das erste Mal, dass das jemand ausspricht. Ich glaube Ihnen. Und ich glaube, Sie brauchen mich mehr, als Sie denken.', mood: 'sad' }] },
            { text: 'Vorsichtig: „Ich kenne Sie nicht. Warum sollte ich Ihnen trauen?“', note: 'neutral', def: true, say: 'Ich kenne Sie seit fünf Minuten. Warum sollte ich Ihnen trauen?', act: () => { M.rel('sarah', 5); M.flag('m11', 'vorsichtig'); },
              then: [{ who: 'sarah', text: 'Weil ich die Einzige in dieser Stadt bin, die Voss nicht bezahlt. Das ist ein Anfang.', mood: 'smug' }] },
            { text: 'Abweisend: „Lassen Sie mich in Ruhe.“', note: 'Sarah ▼', say: 'Lassen Sie mich und meinen Wagen in Ruhe. Sonst lernen Sie Voss’ Anwälte kennen.', mood: 'angry', act: () => { M.rel('sarah', -10); M.flag('m11', 'abweisend'); },
              then: [{ who: 'sarah', text: 'Die kenn ich schon. Drei Abmahnungen dieses Jahr. Ich hab sie eingerahmt.', mood: 'cold' }] },
          ] },
          { who: 'sarah', text: 'Hier, meine Karte. Café Pfannküchle, morgen um elf. Ich zeig Ihnen, was ich habe. Dann entscheiden Sie, auf welcher Seite Sie stehen.', mood: 'neutral' },
          { who: 'sarah', text: 'Und – danke noch mal für die Kaffeemaschine.', mood: 'happy' },
        ], { with: ['sarah'] });
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Neuer Kontakt: <b>Sarah Neumann</b>', 'Beziehung zu Sarah: <b>' + S.rel.label(S.rel.get('sarah')) + '</b>', 'Neue Mission: <b>Unangenehme Fragen</b> (Café Pfannküchle)'] }),
  });

  // =============================================================================================================
  // Mission 12 – Unangenehme Fragen
  // =============================================================================================================
  const cafe = S => { const v = S.venue('pfannkuechle'); return v ? S.walkable(v.sx + 2, v.sz + 1, 8) || { x: v.sx, z: v.sz } : { x: 48, z: 7 }; };
  StoryMissions.add({
    id: 'm12', title: 'Unangenehme Fragen', contact: 'sarah', blurb: 'Sarah erzählt von ihren Recherchen.',
    marker: S => cafe(S),
    stages: [
      { name: 'Café Pfannküchle', async run(M) {
        const S = M.S, G = S.G, c = cafe(S);
        if (G.atmo.clock < 9 || G.atmo.clock > 16) G.atmo.clock = 11;
        const sp = S.walkable(c.x + 1.6, c.z + 0.4, 4) || c;
        M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z));
        await M.talk([
          { who: 'sarah', text: 'Pünktlich. Für einen Mann, der für Voss arbeitet, sind Sie erstaunlich zuverlässig.', mood: 'smug' },
          { who: 'leon', text: 'Ich arbeite nicht für Voss. Ich fahre für Voss. Das ist ein Unterschied.', mood: 'cold' },
          { who: 'sarah', text: 'Erklären Sie das mal den Leuten, deren Häuser gebrannt haben.', mood: 'cold' },
          { if: () => M.flags.m10 === 'verschont', then: [{ who: 'sarah', text: 'Übrigens: Bäcker Hofmann erzählt jedem, ein junger Mann habe seine Schulden bei Voss bezahlt. Aus eigener Tasche.', mood: 'happy' }, { who: 'leon', text: 'Hofmann redet zu viel.', mood: 'smug' }, { who: 'sarah', text: 'Hofmann redet genau richtig.', mood: 'happy', act: () => M.rel('sarah', 10) }] },
          { if: () => M.flags.m10 === 'eingeschuechtert', then: [{ who: 'sarah', text: 'Bäcker Hofmann sagt, Voss hat ihm einen Schläger geschickt. Ende zwanzig, dunkelblond, Jacke wie von einer Tankstelle.', mood: 'cold' }, { who: 'leon', text: '…', mood: 'sad' }, { who: 'sarah', text: 'Dachte ich mir.', mood: 'cold', act: () => M.rel('sarah', -5) }] },
          { who: 'sarah', text: 'Hier. Das ist ein Jahr Arbeit.', mood: 'neutral' },
        ], { with: ['sarah'] });
        await M.doc('Recherche S. Neumann · Brände in Coburg 2019–2026', `<p><b>Gemeinsam:</b> Gebäude im späteren Plangebiet „Quartier Itzaue“ oder auf Zufahrtswegen; Brand nachts, Ursache „ungeklärt“; Versicherung zahlt nicht (Gutachter: <b>Ing.-Büro Hessler &amp; Partner</b>); Verkauf innerhalb von 6 Monaten an <b>Itzgrund GmbH</b>.</p>
          <p>2019 Lager Glasbau Ruß · 2021 <b>Autohaus Berger</b>, Itzufer · 2023 Schuhmacherei Ketschengasse · 2025 Bäckerei Hofmann (Lager)</p>
          <p><b>Itzgrund GmbH:</b> Briefkastenfirma, Geschäftsführer <i>J. Kessler</i> (Kessler Logistik).<br><span class="st-hand">Kessler = Strohmann? Hat er Angst? → ansprechen!</span></p>`);
        await M.talk([
          { who: 'leon', text: 'Kessler. Jürgen Kessler. Wir hatten zusammen ein Geschäft in Nürnberg. Gebrauchtwagen. Ist pleitegegangen.', mood: 'surprised' },
          { who: 'sarah', text: 'Pleite oder pleitegemacht? Egal. Wenn er Sie kennt, redet er vielleicht mit Ihnen. Mit mir redet er nicht.', mood: 'neutral' },
          { who: 'sarah', text: 'Aber vorher will ich etwas sehen. Fahren Sie mich zum Itzufer. Zur Uferstraße.', mood: 'neutral' },
          { who: 'leon', text: 'Was ist da?', mood: 'cold' },
          { who: 'sarah', text: 'Das wissen Sie genau.', mood: 'sad' },
        ], { with: ['sarah'] });
      } },
      { name: 'Itzufer', async run(M) {
        const S = M.S, G = S.G, c = cafe(S);
        if (M.retry) M.placePlayer(c.x, c.z);
        const car = ensureCar(M, c.x + 8, c.z + 8);
        if (M.mode !== 'drive') {
          if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false });
          M.objective('Steig mit Sarah in ein <b>Auto</b>.');
          await M.wait(() => M.mode === 'drive');
          S.world.clearTarget();
        }
        S.chars.hide('sarah');
        const goal = S.road(-337, 631, 80);
        M.every(() => { if (M.stageT > 8) { M.say([
          { who: 'sarah', text: 'Darf ich was Persönliches fragen? Warum sind Sie damals weg?', dur: 3.4 },
          { who: 'leon', text: 'Weil alle gesagt haben, mein Vater sei ein Betrüger. Und ich hab’s irgendwann selbst geglaubt.', dur: 4.6 },
          { who: 'sarah', text: 'Und jetzt?', dur: 1.6 },
          { who: 'leon', text: 'Jetzt fahre ich für den Mann, der ihn ruiniert hat. Tolle Bilanz.', dur: 3.6 },
        ]); return true; } return false; });
        await M.goto(goal, { r: 14, car: true, slow: 6, name: 'Uferstraße', text: 'Fahr mit Sarah zur <b>Uferstraße</b> an der Itz.' });
      } },
      { name: 'Die Ruine', async run(M) {
        const S = M.S, G = S.G, R = ruine(S);
        if (M.mode === 'drive') G.exitCar();
        if (M.retry) M.placePlayer(R.x + 6, R.z + 6);
        // Brandruine: verkohlte Mauerreste und das alte Schild
        const parts = [];
        const add = (w, h, d, x, z, ry, color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color })); m.position.set(R.x + x, yOf(S, R.x + x, R.z + z) + h / 2, R.z + z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; G.scene.add(m); parts.push(m); return m; };
        add(9, 2.6, 0.4, 0, -4, 0, '#2a2522'); add(0.4, 1.6, 7, -4.5, 0, 0, '#25201d'); add(3.5, 3.4, 0.4, 3, 4, 0.1, '#1f1b19'); add(2.2, 0.5, 1.2, 1.5, 0.5, 0.4, '#3a3430');
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const cx = cv.getContext('2d');
        cx.fillStyle = '#2a2d33'; cx.fillRect(0, 0, 512, 128); cx.fillStyle = '#c9a646'; cx.font = '800 54px Inter, sans-serif'; cx.fillText('AUTOHAUS BERGER', 18, 82);
        cx.fillStyle = 'rgba(0,0,0,0.55)'; for (let i = 0; i < 60; i++) { cx.beginPath(); cx.arc(Math.random() * 512, Math.random() * 128, 4 + Math.random() * 22, 0, 6.3); cx.fill(); }
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshLambertMaterial({ map: tex }));
        sign.position.set(R.x - 1, yOf(S, R.x - 1, R.z - 3.7) + 2.9, R.z - 3.7); sign.rotation.z = 0.12; G.scene.add(sign); parts.push(sign);
        M.onCleanup(() => { for (const p of parts) { G.scene.remove(p); p.geometry.dispose(); if (p.material.map) p.material.map.dispose(); p.material.dispose(); } });
        S.world.setTarget(R.x, R.z, { r: 5, name: 'Brandruine' });
        M.objective('Geh zur <b>Brandruine</b>.');
        S.chars.remove('sarah');
        const pl = P(S); const sp = S.walkable(pl.x + 1.4, pl.z + 0.6, 4) || pl;
        M.npc('sarah', sp.x, sp.z, 0);
        S.chars.walkTo('sarah', R.x + 2, R.z + 3, false, 20);
        await M.wait(() => Math.hypot(P(S).x - R.x, P(S).z - R.z) < 6);
        S.world.clearTarget();
        M.objective(null);
        const y = yOf(S, R.x, R.z);
        await M.cut([
          { pos: [R.x + 9, y + 3, R.z + 7], look: [R.x - 1, y + 2.4, R.z - 3.7], to: { pos: [R.x + 4, y + 2, R.z + 3] }, dur: 6, fov: 44 },
        ], [
          { who: 'leon', text: 'Hier stand der Verkaufsraum. Da drüben die Werkstatt. Papa hat mich auf der Hebebühne schlafen lassen, als ich klein war.', dur: 5.4 },
          { who: 'leon', text: 'Fünf Jahre. Und keiner hat hier was gebaut. Als hätte jemand gewartet.', dur: 4 },
        ]);
        await M.talk([
          { who: 'sarah', text: 'Jemand hat gewartet. Auf eine Unterschrift. Das Wegerecht zur Itz läuft über dieses Grundstück. Ohne das gibt es keine Zufahrt fürs Quartier.', mood: 'sad' },
          { who: 'sarah', text: 'Und das Wegerecht gehört nicht Voss. Nicht der Itzgrund GmbH. Es gehört dem Erben von Günter Berger.', mood: 'neutral' },
          { who: 'leon', text: 'Mir.', mood: 'surprised' },
          { who: 'sarah', text: 'Ihnen. Deshalb sind Sie hier, Leon. Nicht weil Voss einen Fahrer braucht.', mood: 'worried' },
          { who: 'leon', text: '„Über Fischer einbinden.“ … Max hat mich zurückgeholt. Max hat mich Voss vorgestellt.', mood: 'angry' },
          { who: 'sarah', text: 'Max Fischer? Ihr bester Freund?', mood: 'surprised' },
          { who: 'leon', text: 'Ich weiß es nicht. Ich weiß gar nichts mehr.', mood: 'sad' },
          { choice: [
            { text: '„Ich helfe Ihnen. Wir holen uns Voss.“', note: 'Sarah ▲▲', say: 'Okay. Ich helfe Ihnen. Wir holen uns Voss. Aber auf meine Art.', act: () => { M.rel('sarah', 15); M.flag('m12', 'verbuendet'); },
              then: [{ who: 'sarah', text: 'Ihre Art macht mir ein bisschen Angst. Aber gut. Partner. Vorläufig.', mood: 'happy' }] },
            { text: '„Ich muss erst nachdenken.“', note: 'neutral', def: true, say: 'Ich muss nachdenken. Allein.', act: () => { M.rel('sarah', 3); M.flag('m12', 'nachdenken'); },
              then: [{ who: 'sarah', text: 'Denken Sie nicht zu lange. Voss denkt schneller.', mood: 'worried' }] },
          ] },
          { who: 'sarah', text: 'Reden Sie mit Kessler. Wenn einer weiß, wie das alles zusammenhängt, dann er.', mood: 'neutral' },
        ], { with: ['sarah'] });
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Du weißt jetzt: Das <b>Wegerecht zur Itz</b> gehört dir', 'Neue Mission: <b>Alte Bekannte</b> (Bismarckturm)'] }),
    after: S => { S.hud.phone('sms', 'kessler', 'Leon? Hier ist Jürgen. Ich hab gehört, du fährst für Voss. Wir müssen reden. Nicht am Telefon. Bismarckturm, heute Abend. Komm allein.', 9); },
  });

  // =============================================================================================================
  // Mission 13 – Alte Bekannte
  // =============================================================================================================
  const turm = S => { const b = S.lm('Bismarckturm') || { x: -1483, z: 177 }; const r = S.road(b.x, b.z, 300); return S.walkable(r.x, r.z, 10) || r; };
  StoryMissions.add({
    id: 'm13', title: 'Alte Bekannte', contact: 'kessler', blurb: 'Ein früherer Geschäftspartner.',
    marker: S => turm(S),
    stages: [
      { name: 'Am Bismarckturm', async run(M) {
        const S = M.S, G = S.G, t = turm(S);
        if (G.atmo.clock < 18 || G.atmo.clock > 22) G.atmo.clock = 19.6;
        const kp = beside(S, t, 6);
        M.npc('kessler', kp.x, kp.z, Math.atan2(P(S).x - kp.x, P(S).z - kp.z));
        M.kCar = M.vehicle('kombi', '#5a5f66', t.x, t.z);
        await M.talk([
          { who: 'kessler', text: 'Leon. Mann, du siehst aus wie dein Vater. Nur wütender.', mood: 'worried' },
          { who: 'leon', text: 'Jürgen. Du siehst aus wie jemand, der seit Wochen nicht schläft.', mood: 'cold' },
          { who: 'kessler', text: 'Weil ich seit Wochen nicht schlafe. Hör zu, ich hab nicht viel Zeit. Wenn Dragan merkt, dass ich hier bin …', mood: 'worried' },
          { who: 'leon', text: 'Die Itzgrund GmbH. Das bist du.', mood: 'angry' },
          { who: 'kessler', text: 'Auf dem Papier. Nach Nürnberg hatte ich Schulden. Voss hat sie bezahlt. Dafür unterschreib ich, was er mir hinlegt. Kaufverträge. Frachtbriefe. Alles.', mood: 'sad' },
          { who: 'kessler', text: 'Die Autos, die du fährst, sind voll mit Bargeld. Im Ausland werden sie verkauft, das Geld kommt sauber zurück. Und daraus baut Voss sein Quartier.', mood: 'worried' },
          { who: 'leon', text: 'Und die Brände?', mood: 'angry' },
          { who: 'kessler', text: 'Dragan. Immer Dragan. Ich hab nie … ich hab nur unterschrieben, Leon. Auch beim Autohaus. Ich wusste nicht, dass es deins ist. Ich schwör’s.', mood: 'sad' },
          { who: 'kessler', text: 'Die Frachtbriefe liegen bei mir im Büro auf dem Hof. Schrank drei. Wenn mir was passiert –', mood: 'worried' },
          { who: 'kessler', text: 'Scheiße. Da kommen Scheinwerfer. Das ist Dragans Wagen!', mood: 'surprised' },
        ], { with: ['kessler'] });
      } },
      { name: 'Flucht', async run(M) {
        const S = M.S, G = S.G, t = turm(S);
        if (M.retry || !M.kCar || M.kCar.disposed) { M.kCar = M.vehicle('kombi', '#5a5f66', t.x, t.z); M.seat(M.kCar); if (!S.chars.get('kessler')) M.npc('kessler', t.x, t.z, 0); }
        const car = M.kCar;
        if (!M.inCar(car) && M.mode !== 'drive') {
          S.world.setTarget(car.x, car.z, { r: 3, name: 'Kesslers Kombi', beacon: false });
          M.objective('Rein in <b>Kesslers Kombi</b>!');
          await M.wait(() => M.mode === 'drive');
          S.world.clearTarget();
        }
        S.chars.hide('kessler');
        // zwei Verfolger aus Richtung Stadt
        const from = S.road(t.x + 160, t.z + 40, 200);
        const h1 = M.driven('suv', '#15161a', from.x, from.z), h2 = M.driven('sport', '#202226', from.x + 8, from.z + 8);
        await M.sleep(1);
        const hunt = hunters(M, [h1, h2], 20);
        M.watch(() => { const c = G.car(); return c && (c.wrecked || c.burning) ? 'Der Wagen ist hinüber – Dragans Leute holen euch.' : null; });
        M.objective('Häng <b>Dragans Leute</b> ab!');
        let free = 0;
        M.meter('Abstand', 0);
        await M.wait(dt => {
          const p = M.pos;
          const d = Math.min(...[h1, h2].map(h => Math.hypot(h.x - p.x, h.z - p.z)));
          free = d > 200 ? free + dt : Math.max(0, free - dt * 2);
          M.meter('Abgehängt', free / 8);
          if (M.mode !== 'drive' && M.stageT > 3) { M.fail('Zu Fuß habt ihr keine Chance gegen Dragans Leute.'); return true; }
          return free >= 8;
        });
        M.meter(null);
        hunt.stop();
        M.say([{ who: 'kessler', text: 'Ich glaub … ich glaub, sie sind weg. Bring mich zum Bahnhof. Ich verschwinde für ein paar Tage.', dur: 4 }]);
      } },
      { name: 'Zum Bahnhof', async run(M) {
        const S = M.S, G = S.G;
        const st = S.road(G.spawn.roadX, G.spawn.roadZ, 60);
        if (M.retry) { const c = ensureCar(M, P(S).x + 4, P(S).z + 4); M.seat(c); }
        await M.goto(st, { r: 14, car: true, slow: 5, name: 'Bahnhof', text: 'Bring Kessler zum <b>Bahnhof</b>.' });
        G.exitCar();
        const p = P(S), kp = S.walkable(p.x + 1.5, p.z + 0.6, 4) || p;
        S.chars.remove('kessler'); M.npc('kessler', kp.x, kp.z, Math.atan2(p.x - kp.x, p.z - kp.z));
        await M.talk([
          { who: 'kessler', text: 'Danke, Leon. Das hätte nach Nürnberg keiner für mich getan. Ich am wenigsten.', mood: 'sad' },
          { who: 'leon', text: 'Wo fährst du hin?', mood: 'neutral' },
          { who: 'kessler', text: 'Besser, du weißt es nicht. Hol die Frachtbriefe, bevor Dragan aufräumt. Schrank drei. Der Schlüssel liegt unter dem Kaktus.', mood: 'worried' },
          { who: 'kessler', text: 'Und Leon … pass auf, wem du vertraust. Voss wusste, dass du zurückkommst. Bevor du es selbst wusstest.', mood: 'worried' },
        ], { with: ['kessler'] });
        S.chars.walkTo('kessler', G.spawn.x, G.spawn.z, false, 15).then(() => S.chars.remove('kessler'));
        await M.sleep(2);
      } },
    ],
    reward: () => ({ money: 0, lines: ['Kessler hat ausgepackt: Geldwäsche über die Autos', 'Neue Mission: <b>Verdächtige Geschäfte</b> (Speditionshof, nachts)'] }),
  });

  // =============================================================================================================
  // Mission 14 – Verdächtige Geschäfte
  // =============================================================================================================
  StoryMissions.add({
    id: 'm14', title: 'Verdächtige Geschäfte', contact: 'leon', blurb: 'Nachts auf dem Speditionshof.',
    marker: S => beside(S, kesslerHof(S), 60),
    stages: [
      { name: 'Einbruch', async run(M) {
        const S = M.S, G = S.G, hof = kesslerHof(S);
        G.atmo.clock = 23.4;
        const start = beside(S, hof, 60);
        if (M.retry) M.placePlayer(start.x, start.z);
        else if (M.mode === 'drive') G.exitCar();
        await M.say({ who: 'leon', text: 'Mitternacht, Speditionshof. Zwei Wachleute mit Taschenlampen. Nicht gesehen werden.', dur: 3.6 });
        // Büro: Gebäude nahe am Hof, Eingang davor
        const office = beside(S, hof, 14);
        const patrol = (a, b) => [S.walkable(a.x, a.z, 6) || a, S.walkable(b.x, b.z, 6) || b];
        const g = new Guards(M, [
          { route: patrol({ x: hof.x - 12, z: hof.z - 6 }, { x: hof.x + 12, z: hof.z - 6 }) },
          { route: patrol({ x: office.x + 8, z: office.z + 8 }, { x: office.x - 8, z: office.z + 2 }) },
        ]);
        M.guards = g;
        M.meter('Entdeckt', 0);
        M.watch(dt => {
          const s = g.seen();
          g.alert = s > 0 ? Math.min(1, g.alert + dt * s * 0.7) : Math.max(0, g.alert - dt * 0.15);
          M.meter('Entdeckt', g.alert);
          if (s > 0 && g.alert > 0.35 && !M.warned) { M.warned = true; M.say({ who: 'wache', name: 'Wachmann', text: 'Hm? Ist da wer?' }); }
          if (g.alert < 0.2) M.warned = false;
          return g.alert >= 1 ? 'Ein Wachmann hat dich entdeckt. „HEY! STEHEN BLEIBEN!“' : null;
        });
        M.watch(() => M.mode !== 'walk' ? 'Mit dem Auto auf den Hof? Das hört jeder.' : null);
        // drei Stellen im Büro: Schlüssel unter dem Kaktus, Schrank drei, Kopierer
        const spots = [
          { p: S.walkable(office.x + 1.2, office.z, 3) || office, label: 'Schlüssel unter dem Kaktus suchen', say: 'Ein Kaktus mit Schlüssel. Jürgen, du alter Fuchs.' },
          { p: S.walkable(office.x - 1.6, office.z + 1.5, 3) || office, label: 'Schrank drei öffnen', say: 'Frachtbriefe. Sechzig Autos in einem Jahr. Alle „Schrott“. Alle Luxuswagen.' },
          { p: S.walkable(office.x + 0.4, office.z - 1.8, 3) || office, label: 'Frachtbriefe fotografieren', say: 'Klick. Klick. Klick. Das reicht für drei Jahre Gefängnis. Für wen auch immer.' },
        ];
        for (let i = 0; i < spots.length; i++) {
          const sp = spots[i];
          S.world.setTarget(sp.p.x, sp.p.z, { r: 1.8, name: 'Büro', beacon: i === 0, color: '#9ad0ff' });
          M.objective(`Schleich dich ins <b>Büro</b> von Kessler (${i}/3). Lichtkegel meiden, nicht rennen.`);
          await M.interact(sp.p, sp.label, 1.9);
          S.world.clearTarget();
          G.audio.beep && G.audio.beep(i === 2 ? 1400 : 700, 0.06);
          M.say({ who: 'leon', text: sp.say });
          await M.sleep(1.2);
        }
        M.flag('hasFreight');
        // raus vom Hof
        const out = beside(S, hof, 70);
        await M.goto(out, { r: 8, name: 'Weg vom Hof', text: 'Verschwinde unbemerkt vom <b>Hof</b>.' });
        M.meter(null);
      } },
      { name: 'Wem gibst du es?', async run(M) {
        const S = M.S;
        await M.say({ who: 'leon', text: 'Ich hab die Beweise. Jetzt muss ich entscheiden, was ich damit mache.', dur: 3.4 });
        M.title('', 'Wem gibst du die Frachtbriefe?', '', 3);
        await M.sleep(1.6);
        await M.talk([
          { who: 'leon', text: '(Sarah würde sie veröffentlichen. Voss würde mich dafür belohnen – oder beseitigen. Oder ich behalte sie für mich.)', name: 'Leon (denkt)', mood: 'worried', cam: 'wide' },
          { choice: [
            { text: 'An Sarah schicken', note: 'Sarah ▲ · Voss ahnt nichts', say: false, act: () => { M.flag('evidenceTo', 'sarah'); M.rel('sarah', 15); },
              then: [{ who: 'leon', text: '(Gesendet. Sarah, mach was Kluges damit.)', name: 'Leon (denkt)', mood: 'neutral' }] },
            { text: 'Voss zeigen – „Ihr Spediteur ist ein Risiko“', note: 'Voss ▲ · gefährlich für Kessler', say: false, act: () => { M.flag('evidenceTo', 'voss'); M.rel('voss', 15); M.rel('sarah', -10); },
              then: [{ who: 'leon', text: '(Wenn Voss mir vertraut, komm ich näher an ihn ran. Hoffentlich bereu ich das nicht.)', name: 'Leon (denkt)', mood: 'worried' }] },
            { text: 'Für mich behalten', note: 'Versicherung', def: true, say: false, act: () => { M.flag('evidenceTo', 'leon'); },
              then: [{ who: 'leon', text: '(Erst mal behalte ich sie. Eine Lebensversicherung.)', name: 'Leon (denkt)', mood: 'smug' }] },
          ] },
        ], { cam: 'none' });
        if (M.flags.evidenceTo === 'sarah') M.sms('sarah', 'Oh mein Gott. Leon. Das ist alles?! Ich ruf dich morgen an. Pass auf dich auf.');
        if (M.flags.evidenceTo === 'voss') M.sms('voss', 'Sehr aufmerksam, Herr Berger. Ich kümmere mich um Herrn Kessler. — R. V.');
        await M.sleep(2);
      } },
    ],
    reward: (S) => ({ money: S.state.flags.evidenceTo === 'voss' ? 2000 : 0, lines: ['Beweise: <b>Frachtbriefe der Itzgrund GmbH</b>', { sarah: 'Die Beweise liegen jetzt bei Sarah', voss: 'Voss hat die Beweise – und weiß, dass Kessler redet', leon: 'Du behältst die Beweise für dich' }[S.state.flags.evidenceTo] || '', 'Neue Mission: <b>Falsche Freunde</b>'].filter(Boolean) }),
  });

  // =============================================================================================================
  // Mission 15 – Falsche Freunde
  // =============================================================================================================
  StoryMissions.add({
    id: 'm15', title: 'Falsche Freunde', contact: 'max', blurb: 'Max verschweigt Leon etwas.',
    marker: S => { const ap = S.lm('Albertsplatz') || { x: -128, z: 333 }; return beside(S, S.road(ap.x, ap.z, 120), 8); },
    stages: [
      { name: 'Max', async run(M) {
        const S = M.S, G = S.G;
        const ap = S.lm('Albertsplatz') || { x: -128, z: 333 }, r = S.road(ap.x, ap.z, 120);
        M.maxCar = M.driven('kleinwagen', '#e6b422', r.x, r.z);
        const mp = carSide(S, M.maxCar);
        M.npc('max', mp.x, mp.z, Math.atan2(P(S).x - mp.x, P(S).z - mp.z));
        await M.talk([
          { who: 'max', text: 'Leon! Mann, wo warst du die letzten Tage? Du gehst nicht mehr ans Telefon!', mood: 'worried' },
          { who: 'leon', text: 'Viel zu tun. Für Voss. Den du ja so gut kennst.', mood: 'cold' },
          { who: 'max', text: 'Ich? Voss? Den kenn ich doch kaum. Ich hab dich nur … empfohlen. Einmal. Flüchtig.', mood: 'worried' },
          { if: () => M.flags.askedEnvelope, then: [{ who: 'leon', text: 'Und der Umschlag im Schließfach? Auch flüchtig?', mood: 'angry' }, { who: 'max', text: 'Das war für den Zapfen-Express! Ich schwör’s!', mood: 'worried' }] },
          { who: 'max', text: 'Hör zu, ich muss los. Termin. Wichtig. Wir reden morgen, okay? Bratwurst bei Erwin, ich zahl!', mood: 'happy' },
          { who: 'leon', text: '(Max zahlt nie. Er lügt.)', name: 'Leon (denkt)', mood: 'cold' },
        ], { with: ['max'] });
        S.chars.remove('max');
      } },
      { name: 'Beschatten', async run(M) {
        const S = M.S, G = S.G;
        const ap = S.lm('Albertsplatz') || { x: -128, z: 333 }, r = S.road(ap.x, ap.z, 120);
        if (!M.maxCar || M.maxCar.disposed || M.retry) { M.maxCar = M.driven('kleinwagen', '#e6b422', r.x, r.z); if (M.retry) M.placePlayer(r.x + 8, r.z + 8); }
        const my = ensureCar(M, r.x + 10, r.z + 10);
        if (M.mode !== 'drive') {
          M.objective('Steig in ein <b>Auto</b> und folge Max unauffällig.');
          if (my) S.world.setTarget(my.x, my.z, { r: 3, name: 'Auto', beacon: false });
        }
        const hg = S.lm('Hofgarten') || { x: 813, z: -350 };
        const goal = S.road(hg.x, hg.z, 250);
        await M.sleep(2.5);
        const ctl = M.autoDrive(M.maxCar, goal, { speed: 14, lead: true });
        S.world.clearTarget();
        S.world.setTarget(M.maxCar.x, M.maxCar.z, { r: 1, name: 'Max', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T && !ctl.done) { T.x = M.maxCar.x; T.z = M.maxCar.z; } return ctl.done; });
        M.objective('Folge <b>Max</b> unauffällig. Nicht zu nah, nicht zu weit.');
        let close = 0;
        M.meter('Verdacht', 0);
        M.watch(dt => {
          if (ctl.done) return null;
          if (ctl.gap < 14 && M.mode === 'drive' && M.stageT > 14) { close += dt; if (close > 0.5 && close - dt <= 0.5) G.ui.toast('Zu nah! Max erkennt dein Auto gleich.', 1.8); } else close = Math.max(0, close - dt * 0.5);
          M.meter('Verdacht', close / 5);
          return close > 5 ? 'Max hat dich im Rückspiegel gesehen. „Leon?! Verfolgst du mich?!“' : null;
        });
        keepUp(M, ctl, 'Max', 220, 12);
        await ctl.arrive();
        M.meter(null);
        S.world.clearTarget();
      } },
      { name: 'Das Treffen', async run(M) {
        const S = M.S, G = S.G;
        const hg = S.lm('Hofgarten') || { x: 813, z: -350 }, goal = S.road(hg.x, hg.z, 250);
        if (M.retry) M.placePlayer(goal.x + 30, goal.z + 30);
        const meet = beside(S, goal, 10);
        M.npc('max', meet.x, meet.z, 0); M.npc('dragan', meet.x + 1.3, meet.z + 0.5, 0);
        S.chars.face('max', meet.x + 1.3, meet.z + 0.5); S.chars.face('dragan', meet.x, meet.z);
        M.objective('Steig aus und belausche <b>Max und Dragan</b>. Nicht zu nah!');
        const lines = [
          { who: 'dragan', text: 'Du bist spät, Fischer.' },
          { who: 'max', text: 'Leon hat mich aufgehalten. Er stellt Fragen. Viele Fragen.' },
          { who: 'dragan', text: 'Dann sorg dafür, dass er aufhört. Dafür bezahlt dich Voss. Vierzigtausend Schulden lösen sich nicht von allein auf.' },
          { who: 'max', text: 'Ich hab ihn doch hergebracht! Ich hab ihm gesagt, er soll den Job annehmen! Was wollt ihr noch?' },
          { who: 'dragan', text: 'Die Unterschrift. Und Kessler. Kessler ist weg. Wenn du weißt, wo er ist …' },
          { who: 'max', text: 'Ich weiß es nicht! Lasst Leon da raus. Bitte. Er ist mein Freund.' },
          { who: 'dragan', text: 'Freunde sind teuer, Fischer. Du kannst sie dir nicht leisten.' },
        ];
        let prog = 0, shown = 0, sus = 0;
        await M.wait(dt => {
          const f = S.chars.get('max'); if (!f) return true;
          const d = Math.hypot(P(S).x - f.p.x, P(S).z - f.p.z);
          const ok = M.mode === 'walk' && d > 3 && d < 9 && P(S).moveSpeed < 5;
          if (ok) prog += dt / 26;
          if (M.mode === 'walk' && d < 3) sus += dt; else sus = Math.max(0, sus - dt * 0.4);
          if (sus > 1.6) { M.fail('Dragan hat dich gesehen. Max auch.'); return true; }
          M.meter('Mithören', prog);
          const want = Math.min(lines.length, Math.floor(prog * lines.length + 0.2));
          while (shown < want) { S.dialog.sub(lines[shown]); shown++; }
          return prog >= 1;
        });
        M.meter(null);
        M.objective(null);
        await M.sleep(4);
        S.chars.walkTo('dragan', meet.x + 30, meet.z + 10, false, 12).then(() => S.chars.remove('dragan'));
        S.chars.walkTo('max', meet.x - 30, meet.z - 10, false, 12).then(() => S.chars.remove('max'));
        await M.say([{ who: 'leon', text: 'Vierzigtausend. Max hat mich verkauft. Für vierzigtausend Euro.', dur: 4 }, { who: 'leon', text: '„Lasst Leon da raus.“ … Und trotzdem.', dur: 3.2 }]);
        M.flag('knowsMax');
      } },
      { name: 'Unter Verdacht', async run(M) {
        const S = M.S, G = S.G;
        await M.sleep(2);
        await M.call('gul', [
          { who: 'gul', text: 'Leon? Gül hier. Hast du die Nachrichten gesehen?' },
          { who: 'leon', text: 'Welche Nachrichten?' },
          { who: 'gul', text: 'Kessler. Der Spediteur. Sein Auto ist heute Nacht am Callenberg ausgebrannt. Von ihm keine Spur.' },
          { who: 'gul', text: 'Und die Polizei war bei mir am Taxistand. Die suchen einen weißen Kleinbus. Kfz Weber. Ein Zeuge hat ihn am Callenberg gesehen.' },
          { who: 'leon', text: 'Tobis Kleinbus. Den ich gefahren hab.' },
          { who: 'gul', text: 'Leon … pass auf dich auf. Irgendwer baut dir da gerade ein Haus. Mit dir drin.' },
        ]);
        await M.doc('Coburger Stadtbote · Eilmeldung', `<p style="font:800 22px Georgia, serif; margin:0 0 6px">Spediteur aus Coburg vermisst – Wagen ausgebrannt</p>
          <p><i>Coburg.</i> Der Coburger Unternehmer Jürgen K. (44) wird seit Dienstagnacht vermisst. Sein Fahrzeug wurde in einem Waldweg unterhalb von Schloss Callenberg ausgebrannt aufgefunden. Die Kriminalpolizei schließt ein Verbrechen nicht aus.</p>
          <p>Ein Zeuge will in der Nähe einen weißen Kleinbus mit der Aufschrift einer Coburger Kfz-Werkstatt gesehen haben. Die Ermittlungen leitet Kriminalhauptkommissarin <b>Hanna Roth</b>.</p>
          <p style="color:#777">— S. Neumann</p>`);
        await M.say([{ who: 'leon', text: 'Mission vier. Die Gläser. Ich bin mit Tobis Bus durch die halbe Stadt gefahren. Jeder hat mich gesehen.', dur: 4.4 }, { who: 'leon', text: 'Voss braucht keinen Fahrer. Er braucht einen Schuldigen.', dur: 3.4 }]);
      } },
    ],
    reward: () => ({ money: 0, lines: ['Du weißt: <b>Max</b> arbeitet für Voss (40.000 € Schulden)', 'Kessler ist verschwunden – und du stehst unter Verdacht'] }),
  });
})();
