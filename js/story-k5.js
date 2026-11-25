// Story-Modus (seit v3.26.0), Teil 7: Kapitel 5 „Die Wahrheit“ – Missionen 21–25.
// Neu: Baustelle Itzaue als Missionsrequisite, heimliches Fotografieren, Begleitschutz zu Fuß (Sarah folgt, Verfolger
// zu Fuß), Max stellen (Rammen) an der Veste. Handlung: STORY.md, Kapitel 5.
'use strict';

(() => {
  const P = S => S.G.player();
  const yOf = (S, x, z) => S.G.world.heightAt(x, z);
  const beside = (S, p, d = 9) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q = S.walkable(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); if (q && Math.hypot(q.x - p.x, q.z - p.z) > d - 2.5) return q; } return S.walkable(p.x, p.z, 15) || p; };
  const doorSpot = (S, h, out = 1) => S.walkable(h.sx + (h.ox || 0) * out, h.sz + (h.oz || 0) * out, 8) || { x: h.sx, z: h.sz };
  const carSide = (S, c, d = 2.2) => S.walkable(c.x + Math.cos(c.heading) * d, c.z - Math.sin(c.heading) * d, 4) || S.walkable(c.x - Math.cos(c.heading) * d, c.z + Math.sin(c.heading) * d, 6) || { x: c.x, z: c.z };
  const baustelle = S => { const r = S.road(-337, 631, 80); return S.walkable(r.x + 14, r.z - 10, 25) || r; };
  const redaktion = S => { const r = S.road(136, -474, 120); return S.walkable(r.x + 3, r.z + 3, 12) || r; };   // Coburger Stadtbote, Steinweg
  const polizei = S => S.road(13, -507, 80);
  const ensureCar = (M, x, z, kind = 'kleinwagen', color = '#8a8f96') => {
    const G = M.G;
    if (M.mode === 'drive') return G.car();
    const near = G.parked.find(c => !c.wrecked && !c.burning && !c.storyDriven && Math.hypot(c.x - x, c.z - z) < 40);
    return near || M.vehicle(kind, color, x, z);
  };
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
  // abhängen: > dist für secs Sekunden
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
  // Baustelle Itzaue: Bauzaun, Container, Kran, Bauschild (nur während der Mission)
  const buildSite = (M, c) => {
    const S = M.S, G = S.G, parts = [];
    const box = (w, h, d, x, z, color, y0 = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color })); m.position.set(c.x + x, yOf(S, c.x + x, c.z + z) + y0 + h / 2, c.z + z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; G.scene.add(m); parts.push(m); return m; };
    for (let i = -3; i <= 3; i++) { box(3.4, 2, 0.08, i * 3.5, -12, '#c9c9c9'); box(3.4, 2, 0.08, i * 3.5, 12, '#c9c9c9'); }
    box(6, 2.6, 2.4, -6, -4, '#d9822b'); box(6, 2.6, 2.4, -6, -4, '#3a6ea5', 2.6);   // Bürocontainer
    box(1.2, 26, 1.2, 8, 4, '#e8b923'); box(22, 1, 1, 15, 4, '#e8b923', 25); box(1, 4, 1, 22, 4, '#555', 21);   // Kran
    box(2.4, 1, 1.4, 1, 1, '#7a5a3a', 0);   // Plantisch
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = '#0f2236'; x.fillRect(0, 0, 512, 256); x.fillStyle = '#e9b949'; x.font = '700 30px Inter, sans-serif'; x.fillText('VOSS PROJEKTENTWICKLUNG', 20, 50);
    x.fillStyle = '#fff'; x.font = '800 46px Inter, sans-serif'; x.fillText('QUARTIER ITZAUE', 20, 110); x.font = '500 24px Inter, sans-serif'; x.fillText('Bauabschnitt 1 · Zufahrt Itzufer', 20, 160); x.fillText('Fertigstellung 2030', 20, 200);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshLambertMaterial({ map: tex })); sign.position.set(c.x, yOf(S, c.x, c.z - 12.2) + 2.6, c.z - 12.2); G.scene.add(sign); parts.push(sign);
    M.onCleanup(() => { for (const p of parts) { G.scene.remove(p); p.geometry.dispose(); if (p.material.map) p.material.map.dispose(); p.material.dispose(); } });
    return { table: { x: c.x + 1, z: c.z + 2.2 } };
  };

  // =============================================================================================================
  // Mission 21 – Das große Geschäft
  // =============================================================================================================
  StoryMissions.add({
    id: 'm21', title: 'Das große Geschäft', contact: 'voss', blurb: 'Leon erfährt mehr über Voss.',
    marker: S => { const h = S.home('leopold'); return h ? beside(S, doorSpot(S, h, 1.5), 6) : null; },
    stages: [
      { name: 'Mitspielen', async run(M) {
        const S = M.S, G = S.G, h = S.home('leopold');
        const vp = doorSpot(S, h, 1.2);
        M.npc('voss', vp.x, vp.z, Math.atan2(P(S).x - vp.x, P(S).z - vp.z));
        await M.talk([
          { who: 'voss', text: 'Herr Berger. Ich höre, Sie hatten turbulente Tage. Feuer, Polizei, Abschleppdienste.', mood: 'smug' },
          { who: 'leon', text: '(Ruhig bleiben. Mitspielen. Er darf nicht wissen, was ich weiß.) Coburg ist aufregender, als ich dachte.', mood: 'neutral' },
          { if: () => S.state.flags.knowsPlan, then: [{ who: 'leon', text: '(Er hat meine Schulden gekauft. Meine Wohnung. Meinen Job. Lächeln, Leon.)', name: 'Leon (denkt)', mood: 'cold' }] },
          { who: 'voss', text: 'Ich zeige Ihnen heute etwas, das nur wenige gesehen haben. Die Zukunft dieser Stadt. Fahren Sie.', mood: 'smug' },
        ], { with: ['voss'] });
        S.chars.remove('voss');
      } },
      { name: 'Zur Baustelle', async run(M) {
        const S = M.S, G = S.G, h = S.home('leopold');
        const r = h ? S.road(h.sx, h.sz, 120) : S.road(499, 103);
        M.vcar = M.vehicle('sport', '#15161a', r.x, r.z);
        if (M.retry) M.seat(M.vcar);
        if (!M.inCar(M.vcar)) { S.world.setTarget(M.vcar.x, M.vcar.z, { r: 3, name: 'Voss’ Wagen', beacon: false }); M.objective('Steig in <b>Voss’ Wagen</b>.'); await M.wait(() => M.inCar(M.vcar)); S.world.clearTarget(); }
        M.watch(() => (M.vcar.wrecked || M.vcar.health < 40) ? 'Voss steigt aus. „Ich hatte gehofft, Sie hätten dazugelernt.“' : null);
        M.watch(() => G.stars() > 0 ? '„Polizei? Mit mir im Wagen?“ Voss ruft seinen Anwalt – und dich nie wieder an.' : null);
        M.every(() => { if (M.stageT > 8) { M.say([
          { who: 'voss', text: 'Wissen Sie, warum Ihr Vater gescheitert ist? Er hat gedacht, Ehrlichkeit sei ein Geschäftsmodell.', dur: 4.2 },
          { who: 'leon', text: 'Und was ist Ihres?', dur: 2 },
          { who: 'voss', text: 'Geduld. Ich warte, bis die anderen müde werden. Dann kaufe ich.', dur: 3.6 },
        ]); return true; } return false; });
        await M.goto(S.road(-337, 631, 80), { r: 14, car: M.vcar, slow: 5, name: 'Baustelle Itzaue', text: 'Fahr Voss zur <b>Baustelle Itzaue</b> an der Uferstraße.' });
      } },
      { name: 'Baustelle', async run(M) {
        const S = M.S, G = S.G, c = baustelle(S);
        if (M.mode === 'drive') G.exitCar();
        if (M.retry) M.placePlayer(c.x - 8, c.z - 8);
        const site = buildSite(M, c);
        const vp = S.walkable(c.x - 2, c.z + 1, 5) || c;
        M.npc('voss', vp.x, vp.z, Math.atan2(P(S).x - vp.x, P(S).z - vp.z));
        const y = yOf(S, c.x, c.z);
        await M.cut([{ pos: [c.x - 20, y + 14, c.z - 22], look: [c.x, y + 6, c.z], to: { pos: [c.x - 10, y + 6, c.z - 14] }, dur: 5, fov: 46 }],
          [{ who: 'voss', text: 'Hier entstehen 640 Wohnungen, ein Hotel, ein Einkaufszentrum. Und eine Zufahrt. Genau dort, wo das Autohaus Ihres Vaters stand.', dur: 5 }]);
        await M.talk([
          { who: 'voss', text: 'Ich bin ein offener Mensch, Herr Berger. Das Grundstück gehört mir. Das Wegerecht leider Ihnen. Ein Erbe, von dem Sie nichts wussten.', mood: 'neutral' },
          { who: 'leon', text: 'Und das wollen Sie haben.', mood: 'cold' },
          { who: 'voss', text: 'Ich will es nicht. Ich brauche es. Das ist ein Unterschied, über den man reden kann. Über Zahlen.', mood: 'smug' },
          { who: 'voss', text: 'Entschuldigen Sie. Stadtrat Brandt. … Horst! Ja. Nein, die Abstimmung bleibt am Zwölften …', mood: 'neutral' },
        ], { with: ['voss'] });
        // Voss telefoniert mit dem Rücken zum Plantisch: Plan fotografieren, solange er wegschaut
        S.chars.walkTo('voss', c.x - 9, c.z - 6, false, 6);
        await M.sleep(2);
        S.chars.face('voss', c.x - 20, c.z - 10);
        M.objective('Voss telefoniert: Fotografiere den <b>Bauplan</b> am Tisch, solange er wegschaut.');
        let watchT = 0;
        const lookout = M.watch(dt => {
          const f = S.chars.get('voss'); if (!f) return null;
          // alle 9 s dreht er sich 3 s lang um
          const t = M.stageT % 9, look = t > 6;
          if (look) S.chars.face('voss', P(S).x, P(S).z); else S.chars.face('voss', c.x - 20, c.z - 10);
          const atTable = Math.hypot(P(S).x - site.table.x, P(S).z - site.table.z) < 2.2;
          watchT = look && atTable ? watchT + dt : 0;
          if (look && atTable && watchT > 0.1 && watchT - dt <= 0.1) G.ui.toast('Voss dreht sich um!', 1.2);
          return watchT > 1.6 ? 'Voss hat gesehen, wie du seinen Plan fotografierst. „Wir sind fertig, Herr Berger.“' : null;
        });
        await M.interact(site.table, 'Bauplan fotografieren', 2.2);
        await M.sleep(0.6);
        M.flag('photoPlan');
        M.unwatch(lookout);
        M.objective('Weg vom Tisch, bevor er sich umdreht.');
        await M.wait(() => Math.hypot(P(S).x - site.table.x, P(S).z - site.table.z) > 4);
        M.objective(null);
        await M.say({ who: 'leon', text: '„Zufahrt nur über Flurstück 1147/3 möglich. Alternative: keine.“ Ohne mich kein Quartier.', dur: 4 });
        S.chars.walkTo('voss', P(S).x + 1.6, P(S).z + 0.6, false, 8);
        await M.sleep(2.5);
        await M.talk([
          { who: 'voss', text: 'Wo waren wir? Ach ja. Zahlen. Denken Sie an eine Zahl mit fünf Nullen, Herr Berger. Wir sprechen bald darüber.', mood: 'smug' },
          { choice: [
            { text: '„Ich denke drüber nach.“', note: 'mitspielen', def: true, say: 'Ich denke drüber nach. Fünf Nullen sind eine gute Gesprächsgrundlage.', act: () => { M.flag('m21', 'mitspielen'); M.rel('voss', 5); },
              then: [{ who: 'voss', text: 'Ich wusste, dass Sie ein vernünftiger Mann sind.', mood: 'happy' }] },
            { text: '„Das Grundstück gehörte meinem Vater. Sie haben es angezündet.“', note: 'Voss ▼▼ · gefährlich', say: 'Das Autohaus gehörte meinem Vater. Und Sie haben es anzünden lassen.', mood: 'angry', act: () => { M.flag('m21', 'konfrontiert'); M.rel('voss', -20); },
              then: [{ who: 'voss', text: 'Was für eine Unterstellung. Vorsicht, Herr Berger. Behauptungen ohne Beweise sind in Coburg teuer. Fragen Sie Herrn Kessler.', mood: 'cold' }] },
          ] },
        ], { with: ['voss'] });
      } },
    ],
    reward: () => ({ money: 0, lines: ['Foto des Bauplans: <b>Zufahrt nur über dein Wegerecht</b>'] }),
  });

  // =============================================================================================================
  // Mission 22 – Verlorenes Vertrauen
  // =============================================================================================================
  const klinik = S => { const r = S.road(623, 1291, 200); return S.walkable(r.x + 4, r.z + 4, 15) || r; };
  StoryMissions.add({
    id: 'm22', title: 'Verlorenes Vertrauen', contact: 'tobi', blurb: 'Ein wichtiger Mensch enttäuscht Leon.',
    marker: S => klinik(S),
    stages: [
      { name: 'Klinikum', async run(M) {
        const S = M.S, G = S.G, k = klinik(S);
        const tp = S.walkable(k.x + 1.6, k.z + 0.5, 4) || k;
        M.npc('tobi', tp.x, tp.z, Math.atan2(P(S).x - tp.x, P(S).z - tp.z));
        await M.talk([
          { who: 'tobi', text: 'Sie lassen mich raus. Lunge wie ein alter Diesel, sagt der Arzt. Passt zu mir.', mood: 'smug' },
          { who: 'leon', text: 'Tobi, in Dragans Mappe stand: „Job über Weber“. Du hast mich auf Voss’ Liste gesetzt.', mood: 'cold' },
          { who: 'tobi', text: '… Ja.', mood: 'sad' },
          { who: 'tobi', text: 'Voss hat die Werkstatt gekauft. Vor drei Monaten. Ich hatte 80.000 Schulden, die Bank wollte zumachen. Er hat bezahlt. Ich darf bleiben, solange ich tue, was Lenz sagt.', mood: 'sad' },
          { who: 'tobi', text: 'Lenz hat gesagt: „Wenn der Berger-Junge kommt, gib ihm Arbeit.“ Ich dachte, ich tu dir was Gutes. Ich dachte …', mood: 'sad' },
          { who: 'leon', text: 'Und dann hat Voss deine Werkstatt angezündet. Deine eigene, die ihm gehört.', mood: 'angry' },
          { who: 'tobi', text: 'Versicherung, Leon. Er verdient sogar am Feuer. Wie bei deinem Vater.', mood: 'angry' },
          { choice: [
            { text: 'Verzeihen: „Du warst erpressbar. Wie ich.“', note: 'Tobi ▲', def: true, say: 'Du hattest Schulden und Angst. Ich auch. Er hat uns beide gekauft. Das heißt nicht, dass er uns behält.', act: () => { M.flag('m22', 'verziehen'); M.rel('tobi', 20); },
              then: [{ who: 'tobi', text: 'Dein Vater hätte genau das gesagt. Und mir dann eine reingehauen. Danke, dass du das auslässt.', mood: 'happy' }] },
            { text: 'Nicht verzeihen: „Du hättest es mir sagen müssen.“', note: 'Tobi ▼', say: 'Du hättest es mir sagen müssen. Am ersten Tag. Du hast zugesehen, wie ich in die Falle laufe.', mood: 'angry', act: () => { M.flag('m22', 'nicht'); M.rel('tobi', -25); },
              then: [{ who: 'tobi', text: 'Ich weiß. Ich kann’s nicht zurücknehmen. Ich kann nur helfen. Wenn du mich lässt.', mood: 'sad' }] },
          ] },
          { who: 'tobi', text: 'Eins noch. In der Werkstatt, im Tresor, liegt der Werkzeugkoffer deines Vaters. Er hat ihn mir nach dem Brand gegeben. Da ist was drin, das du sehen musst.', mood: 'neutral' },
        ], { with: ['tobi'] });
      } },
      { name: 'Der Koffer', async run(M) {
        const S = M.S, G = S.G, w = S.workshop(), k = klinik(S);
        if (M.retry) M.placePlayer(k.x, k.z);
        const car = ensureCar(M, k.x + 6, k.z + 6, 'kombi', '#4f8f8a');
        if (M.mode !== 'drive') { if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false }); M.objective('Steig mit Tobi in ein <b>Auto</b>.'); await M.wait(() => M.mode === 'drive'); S.world.clearTarget(); }
        S.chars.hide('tobi');
        M.every(() => { if (M.stageT > 10) { M.say([
          { who: 'tobi', text: 'Können wir kurz bei Erwin halten? Ich hab seit vier Tagen nur Krankenhauspudding gegessen.', dur: 4 },
          { who: 'leon', text: 'Nein, Tobi.', dur: 1.6 },
          { who: 'tobi', text: 'Eine Bratwurst. Für meine Lunge. Kiefernzapfen sind gesund. Ätherische Öle.', dur: 4 },
        ]); return true; } return false; });
        await M.goto(S.road(w.x, w.z, 60), { r: 14, car: true, slow: 5, name: 'Werkstatt', text: 'Fahr mit Tobi zur ausgebrannten <b>Werkstatt</b>.' });
        G.exitCar();
        const sp = S.walkable(w.x + 3, w.z - 2, 8) || w;
        S.chars.remove('tobi'); M.npc('tobi', P(S).x + 1.5, P(S).z + 0.5, 0);
        S.world.box(sp.x, sp.z, '#6a1a14', 'Werkzeugkoffer');
        S.world.setTarget(sp.x, sp.z, { r: 2, name: 'Tresor' });
        M.objective('Hol den <b>Werkzeugkoffer</b> aus dem Tresor.');
        await M.interact(sp, 'Werkzeugkoffer öffnen', 2.4);
        S.world.clearTarget();
        await M.doc('Im Werkzeugkoffer von Günter Berger', `<p>Unter den Schraubenschlüsseln: ein Briefumschlag, „Für Leon. Wenn er zurückkommt.“</p>
          <p class="st-hand">Leon, wenn du das liest, bin ich wahrscheinlich ein sturer alter Mann gewesen bis zum Schluss. Ich habe das Autohaus nicht angezündet. Ein Mann namens Dragan war in der Nacht da, Tobi hat ihn gesehen, aber Tobi hatte Angst. Ich habe verkauft, damit sie Tobi in Ruhe lassen. Das Wegerecht an der Itz habe ich behalten – für dich. Verkauf es nicht an den, der uns das angetan hat. Ich bin stolz auf dich. Auch wenn ich es nie gesagt habe. Papa</p>`);
        await M.talk([
          { who: 'leon', text: 'Er wusste es. Die ganze Zeit. Und er hat das Wegerecht für mich behalten.', mood: 'sad' },
          { who: 'tobi', text: 'Er hat jeden Tag von dir geredet. Jeden Tag. „Der Leon kommt zurück. Der lässt sich nichts gefallen.“', mood: 'sad' },
          { who: 'leon', text: 'Dann wollen wir ihn mal nicht enttäuschen.', mood: 'angry' },
        ], { with: ['tobi'] });
        M.flag('fatherLetter');
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Der Brief deines Vaters: Er hat das Autohaus <b>nicht</b> angezündet', S.state.flags.m22 === 'verziehen' ? 'Du hast Tobi verziehen' : 'Du hast Tobi nicht verziehen'] }),
  });

  // =============================================================================================================
  // Mission 23 – Die Wahrheit kommt ans Licht
  // =============================================================================================================
  StoryMissions.add({
    id: 'm23', title: 'Die Wahrheit kommt ans Licht', contact: 'sarah', blurb: 'Sarah findet entscheidende Informationen.',
    marker: S => beside(S, redaktion(S), 6),
    stages: [
      { name: 'Redaktion', async run(M) {
        const S = M.S, G = S.G, r = redaktion(S);
        const sp = S.walkable(r.x + 1.5, r.z + 0.4, 4) || r;
        M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z));
        await M.talk([
          { if: () => S.state.flags.chose19 === 'max', then: [{ who: 'sarah', text: 'Du hast Max gewählt. Hessler ist seitdem verschwunden. Ich versteh’s ja. Aber es tut weh.', mood: 'sad' }, { who: 'leon', text: 'Ich weiß. Es tut mir leid, Sarah.', mood: 'sad' }] },
          { who: 'sarah', text: 'Ich hab’s gefunden. Im Archiv des Stadtboten. Das Original-Gutachten zum Brand des Autohauses. Bevor Hessler es „überarbeitet“ hat.', mood: 'surprised' },
          { who: 'sarah', text: '„Brandbeschleuniger an drei Stellen, Brandstiftung eindeutig, Spuren eines Fremdtäters.“ Unterschrieben 2021. Das hat nie jemand veröffentlicht.', mood: 'neutral' },
          { who: 'leon', text: 'Und warum liegt es in eurem Archiv?', mood: 'surprised' },
          { who: 'sarah', text: 'Weil unser damaliger Chefredakteur es zugeschickt bekam. Und zwei Wochen später in Rente ging. Mit einem Haus am Gardasee.', mood: 'cold' },
          { who: 'sarah', text: 'Leon. Draußen. Der schwarze Geländewagen. Das ist –', mood: 'worried' },
          { who: 'leon', text: 'Dragan. Raus hier. Hinten raus, jetzt!', mood: 'angry' },
        ], { with: ['sarah'] });
      } },
      { name: 'Flucht zu Fuß', async run(M) {
        const S = M.S, G = S.G, r = redaktion(S);
        if (M.retry || !S.chars.get('sarah')) { M.placePlayer(r.x, r.z); M.npc('sarah', r.x + 1.5, r.z, 0); }
        // Fluchtauto ein Stück weiter, Verfolger zu Fuß
        const carSpot = S.road(r.x + 120, r.z - 60, 120);
        const car = M.vehicle('kombi', '#4f8f8a', carSpot.x, carSpot.z);
        const t1 = beside(S, r, 22), t2 = beside(S, t1, 3);
        M.npc('dragan', t1.x, t1.z, 0); M.npc('wache', t2.x, t2.z, 0);
        for (const id of ['dragan', 'wache']) S.chars.get(id).p.runSpeed = 6.4;
        S.chars.get('sarah').p.runSpeed = 8;
        S.world.setTarget(car.x, car.z, { r: 3, name: 'Fluchtauto' });
        M.objective('Lauf mit Sarah zum <b>Fluchtauto</b>. Sarah folgt dir – lass sie nicht zurück!');
        let rt = 0, caught = 0;
        const trail = [];
        M.every(dt => {
          if ((rt -= dt) > 0) return false; rt = 0.4;
          const pl = P(S), sa = S.chars.get('sarah');
          // Sarah folgt Leons echtem Weg (Spur alle 0,4 s), bei mehr als 12 m Abstand schließt sie auf der Spur auf
          const last = trail[trail.length - 1];
          if (!last || Math.hypot(last.x - pl.x, last.z - pl.z) > 1.5) { trail.push({ x: pl.x, z: pl.z }); if (trail.length > 30) trail.shift(); }
          if (sa && M.mode === 'walk') {
            const d = Math.hypot(sa.p.x - pl.x, sa.p.z - pl.z), k = Math.max(0, trail.length - 3), tp = trail[k] || pl;
            if (d > 12 && trail.length > 4) { const q = trail[trail.length - 4]; sa.p.place(q.x, q.z, G.world); sa.walk = null; }
            else if (d > 2.2) S.chars.walkTo('sarah', tp.x, tp.z, d > 4, 1);
          }
          for (const id of ['dragan', 'wache']) { const f = S.chars.get(id); if (f && sa) S.chars.walkTo(id, sa.p.x, sa.p.z, true, 1); }
          return false;
        });
        M.watch(dt => {
          const sa = S.chars.get('sarah'); if (!sa) return null;
          const near = ['dragan', 'wache'].some(id => { const f = S.chars.get(id); return f && Math.hypot(f.p.x - sa.p.x, f.p.z - sa.p.z) < 1.4; });
          caught = near && M.stageT > 3 ? caught + dt : Math.max(0, caught - dt);
          if (Math.hypot(sa.p.x - P(S).x, sa.p.z - P(S).z) > 40) return 'Du hast Sarah zurückgelassen. Dragans Leute haben sie.';
          return caught > 1.2 ? 'Dragans Leute haben Sarah geschnappt.' : null;
        });
        M.say([{ who: 'sarah', text: 'Ich hab das Gutachten! Lauf!', dur: 2 }, { who: 'dragan', text: 'BERGER! Gib mir die Mappe!', dur: 2.4 }]);
        await M.wait(() => Math.hypot(P(S).x - car.x, P(S).z - car.z) < 4 && Math.hypot(S.chars.get('sarah').p.x - car.x, S.chars.get('sarah').p.z - car.z) < 7);
        S.world.clearTarget();
        S.chars.remove('dragan'); S.chars.remove('wache');
        M.objective('Steig ein!');
        await M.wait(() => M.inCar(car));
        S.chars.hide('sarah');
        M.car23 = car;
      } },
      { name: 'Abhängen', async run(M) {
        const S = M.S, G = S.G, r = redaktion(S);
        if (M.retry) { const c = M.vehicle('kombi', '#4f8f8a', r.x + 10, r.z + 10); M.seat(c); }
        const from = S.road(r.x - 80, r.z, 150);
        const h = M.driven('suv', '#15161a', from.x, from.z);
        const hunt = hunters(M, [h], 22);
        M.watch(() => { const c = G.car(); return c && (c.wrecked || c.burning) ? 'Das Auto ist hinüber. Dragan holt sich Sarah und das Gutachten.' : null; });
        M.objective('Häng <b>Dragans Geländewagen</b> ab!');
        M.every(() => { if (M.stageT > 12) { M.say([{ who: 'sarah', text: 'Er fährt uns hinterher wie ein Bluthund! Links! LINKS!', dur: 3 }, { who: 'leon', text: 'Ich weiß, wo links ist!', dur: 2 }]); return true; } return false; });
        await shakeOff(M, [h], 200, 8);
        hunt.stop();
        const safe = S.state.flags.roth === 'verbuendet';
        const goal = safe ? polizei(S) : (() => { const kh = S.home('ketschen'); return kh ? S.road(kh.sx, kh.sz, 120) : S.road(-35, 251); })();
        await M.goto(goal, { r: 14, car: true, slow: 6, name: safe ? 'Polizeiinspektion' : 'Rocco', text: safe ? 'Bring Sarah und das Gutachten zu <b>Kommissarin Roth</b>.' : 'Bring Sarah in Sicherheit – zu <b>Rocco</b> in die Ketschengasse.' });
        G.exitCar();
        const sp = S.walkable(P(S).x + 1.5, P(S).z + 0.5, 4) || P(S);
        S.chars.remove('sarah'); M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z));
        await M.talk([
          { who: 'sarah', text: 'Wir leben. Das Gutachten lebt. Und mein Herz läuft noch einen Marathon.', mood: 'laugh' },
          { if: () => safe, then: [{ who: 'sarah', text: 'Roth macht eine Kopie und legt sie in ihren Safe. Offiziell weiß sie von nichts. Inoffiziell ist sie ziemlich beeindruckt.', mood: 'smug' }],
            else: [{ who: 'sarah', text: 'Rocco hat einen Keller, von dem nicht mal die Ratten wissen. Ich will gar nicht wissen, was da sonst liegt.', mood: 'smug' }] },
          { who: 'sarah', text: 'Leon … danke. Du hättest auch wegfahren können.', mood: 'sad' },
          { who: 'leon', text: 'Hab ich kurz überlegt. Dann hab ich an deine Kaffeemaschine gedacht.', mood: 'smug' },
        ], { with: ['sarah'] });
        M.rel('sarah', 10);
        M.flag('fireReport');
      } },
    ],
    reward: () => ({ money: 0, lines: ['Beweis: <b>Original-Brandgutachten 2021</b> – Brandstiftung durch Fremdtäter'] }),
  });

  // =============================================================================================================
  // Mission 24 – Ein neuer Verbündeter
  // =============================================================================================================
  const rosengarten = S => { const r = S.lm('Kongresshaus Rosengarten') || { x: 68, z: 477 }; return S.road(r.x, r.z, 300); };
  StoryMissions.add({
    id: 'm24', title: 'Ein neuer Verbündeter', contact: 'lenz', blurb: 'Leon bekommt unerwartete Unterstützung.',
    marker: S => { const h = S.home('lossau'); return h ? beside(S, doorSpot(S, h, 1), 8) : null; },
    stages: [
      { name: 'Der Anruf', async run(M) {
        const S = M.S;
        await M.call('lenz', [
          { who: 'lenz', text: 'Herr Berger. Katharina Lenz. Bitte legen Sie nicht auf.' },
          { who: 'lenz', text: 'Ich steige aus. Richard hat die Werkstatt anzünden lassen, während Herr Weber drin war. Das … war zu viel.' },
          { who: 'lenz', text: 'Ich habe alles: Konten, Mails, Verträge. Aber Dragan beobachtet mich. Ich bin am Rosengarten, Lieferhof. Wo wir uns kennengelernt haben.' },
          { who: 'leon', text: 'Bleiben Sie, wo Sie sind. Ich komme.' },
        ]);
      } },
      { name: 'Rosengarten', async run(M) {
        const S = M.S, G = S.G, rg = rosengarten(S);
        await M.goto(rg, { r: 14, name: 'Rosengarten', text: 'Hol <b>Dr. Lenz</b> am Lieferhof des Rosengartens ab.' });
        if (M.mode === 'drive') G.exitCar();
        const lp = beside(S, rg, 5);
        M.npc('lenz', lp.x, lp.z, Math.atan2(P(S).x - lp.x, P(S).z - lp.z));
        await M.talk([
          { who: 'lenz', text: 'Hier haben Sie mir zwölf Kisten Gläser gebracht. Mit einem Umschlag, den ich Ihnen nicht hätte geben dürfen.', mood: 'sad' },
          { if: () => S.state.flags.readEnvelope, then: [{ who: 'lenz', text: 'Sie haben ihn gelesen, oder? Ich hab’s an Ihrem Gesicht gesehen. Ich habe nichts gesagt. Vielleicht wollte ich, dass es jemand liest.', mood: 'neutral' }] },
          { who: 'leon', text: 'Warum jetzt, Katharina?', mood: 'cold' },
          { who: 'lenz', text: 'Weil ich bei der Planung einer Brandstiftung Protokoll geschrieben habe. Mit Uhrzeit. Ich kann nicht mehr schlafen, Herr Berger.', mood: 'sad' },
          { who: 'lenz', text: 'Da kommt er. Dragan. Bitte – fahren Sie!', mood: 'worried' },
        ], { with: ['lenz'] });
        const car = ensureCar(M, rg.x + 6, rg.z + 6, 'car', '#3a4a6a');
        if (M.mode !== 'drive') { if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false }); M.objective('Rein ins <b>Auto</b> mit Lenz!'); await M.wait(() => M.mode === 'drive'); S.world.clearTarget(); }
        S.chars.hide('lenz');
        const from = S.road(rg.x + 100, rg.z + 40, 150);
        const h1 = M.driven('suv', '#15161a', from.x, from.z), h2 = M.driven('sport', '#202226', from.x + 8, from.z + 6);
        const hunt = hunters(M, [h1, h2], 21);
        M.watch(() => { const c = G.car(); return c && (c.wrecked || c.burning) ? 'Das Auto ist Schrott – Dragan bekommt Lenz und die Daten.' : null; });
        M.objective('Schütz Lenz: Häng <b>Dragans Leute</b> ab!');
        await shakeOff(M, [h1, h2], 200, 9);
        hunt.stop();
      } },
      { name: 'Die Daten', async run(M) {
        const S = M.S, G = S.G, h = S.home('lossau'), d = doorSpot(S, h, 1);
        if (M.retry) { const c = M.vehicle('car', '#3a4a6a', d.x + 30, d.z + 30); M.seat(c); }
        await M.goto(S.road(d.x, d.z, 60), { r: 14, car: true, slow: 6, name: 'Lossaustraße', text: 'Bring Lenz in deine <b>Wohnung</b> (Lossaustraße).' });
        G.exitCar();
        const lp = S.walkable(P(S).x + 1.5, P(S).z + 0.5, 4) || P(S);
        S.chars.remove('lenz'); M.npc('lenz', lp.x, lp.z, Math.atan2(P(S).x - lp.x, P(S).z - lp.z));
        await M.talk([
          { who: 'lenz', text: 'Auf diesem Stick ist alles. Und noch etwas, das Ihnen wehtun wird.', mood: 'sad' },
          { who: 'leon', text: 'Was kann mir noch wehtun?', mood: 'cold' },
          { who: 'lenz', text: 'Die Nachrichten von Maximilian Fischer an Richard. Seit Ihrem ersten Tag. Jeden Tag.', mood: 'sad' },
        ], { with: ['lenz'] });
        await M.doc('USB-Stick · Ordner „Fischer“', `<p><b>M. Fischer → R. Voss</b></p>
          <p>01.10. — „Leon kommt nächste Woche. Wohnung bei Kraus ist klar.“<br>
          Tag 1 — „Er ist da. War bei Erwin. Kommt morgen zu Tobi.“<br>
          Tag 2 — „Veste. Hat nach dem Grundstück gefragt. Weiß nix vom Wegerecht.“<br>
          Tag 9 — „Fragt nach dem Schließfach. Ich hab ihn abgewimmelt.“<br>
          Tag 14 — „Er redet mit der Journalistin. Bitte lasst ihn in Ruhe, ich krieg ihn zum Unterschreiben.“<br>
          Tag 17 — <span class="st-hand">„Dragan, bitte. Ich hab euch alles gegeben. Lasst Leon da raus.“</span></p>`);
        await M.say([{ who: 'leon', text: 'Jeden Tag. Vom ersten Tag an. Max.', dur: 3.4 }]);
        M.flag('lenzData');
      } },
    ],
    reward: (S) => { S.rel.add('voss', -20, true); return { money: 0, lines: ['Neue Verbündete: <b>Dr. Katharina Lenz</b>', 'Beweise: Konten, Mails, Verträge der Voss Projektentwicklung'] }; },
  });

  // =============================================================================================================
  // Mission 25 – Der Verrat
  // =============================================================================================================
  StoryMissions.add({
    id: 'm25', title: 'Der Verrat', contact: 'max', blurb: 'Die Hintergründe des Verrats werden bekannt.',
    marker: S => { const v = S.lm('Veste Coburg') || { x: 1141, z: -567 }; const g = S.road(v.x, v.z, 450); return S.walkable(g.x, g.z, 14) || g; },
    stages: [
      { name: 'Auf der Veste', async run(M) {
        const S = M.S, G = S.G;
        const v = S.lm('Veste Coburg') || { x: 1141, z: -567 }, g = S.road(v.x, v.z, 450);
        if (G.atmo.clock < 17 || G.atmo.clock > 21) G.atmo.clock = 19.4;
        const mp = beside(S, g, 6);
        M.npc('max', mp.x, mp.z, Math.atan2(-mp.x, -mp.z));
        M.maxCar = M.driven('kleinwagen', '#e6b422', g.x + 6, g.z + 6);
        await M.talk([
          { who: 'max', text: 'Du hast geschrieben: „Veste. Wie früher.“ Ich dachte, du willst Bratwurst-Drohnen besprechen.', mood: 'worried' },
          { if: () => S.state.flags.chose19 === 'sarah', then: [{ who: 'max', text: 'Dragan hat mich laufen lassen. Weil ich … weil ich ihm gesagt hab, wo Hessler ist. Ich wusste nicht, dass du schon dort warst.', mood: 'sad' }] },
          { who: 'leon', text: 'Ich hab deine Nachrichten gelesen, Max. Alle. Vom ersten Oktober bis gestern.', mood: 'cold' },
          { who: 'max', text: '…', mood: 'sad' },
          { who: 'max', text: 'Vierzigtausend, Leon. Poker, dann Sportwetten, dann Dragan. Er hat gesagt, er bricht mir die Hände. Dann kam Voss und hat gesagt, er zahlt. Wenn ich dich nach Hause hole.', mood: 'sad' },
          { who: 'max', text: 'Ich hab gedacht, du kriegst einen guten Job. Geld. Eine Wohnung. Ich dachte, ich tu dir was Gutes UND bin meine Schulden los!', mood: 'worried' },
          { who: 'leon', text: 'Du hast mich verkauft. An den Mann, der Papa ruiniert hat.', mood: 'angry' },
          { who: 'max', text: 'Ich weiß! Ich weiß … Ich kann das nicht … Ich muss hier weg.', mood: 'worried' },
        ], { with: ['max'] });
        // Max rennt zu seinem Wagen und fährt los
        S.chars.walkTo('max', M.maxCar.x, M.maxCar.z, true, 4).then(() => S.chars.hide('max'));
        await M.sleep(3);
      } },
      { name: 'Max stellen', async run(M) {
        const S = M.S, G = S.G;
        const v = S.lm('Veste Coburg') || { x: 1141, z: -567 }, g = S.road(v.x, v.z, 450);
        if (!M.maxCar || M.maxCar.disposed || M.retry) { M.maxCar = M.driven('kleinwagen', '#e6b422', g.x + 6, g.z + 6); if (M.retry) M.placePlayer(g.x - 6, g.z - 6); }
        const mc = M.maxCar;
        const hg = S.lm('Hofgarten') || { x: 813, z: -350 };
        const ctl = M.autoDrive(mc, S.road(hg.x, hg.z, 250), { speed: 15 });
        const my = ensureCar(M, g.x - 8, g.z - 8, 'sport', '#1f3a6b');
        if (M.mode !== 'drive') { if (my) S.world.setTarget(my.x, my.z, { r: 3, name: 'Auto', beacon: false }); M.objective('Hinterher! Steig in ein <b>Auto</b>.'); await M.wait(() => M.mode === 'drive'); S.world.clearTarget(); }
        S.world.setTarget(mc.x, mc.z, { r: 1, name: 'Max', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T) { T.x = mc.x; T.z = mc.z; } return false; });
        M.objective('Stopp <b>Max</b>: Ramm seinen Wagen, bis er stehen bleibt!');
        let lost = 0;
        M.watch(dt => { lost = ctl.gap > 240 ? lost + dt : 0; return lost > 12 ? 'Max ist weg. Für immer, vielleicht.' : null; });
        M.watch(() => ctl.done && mc.health >= 50 ? 'Max hat den Hofgarten erreicht und ist zu Fuß verschwunden.' : null);
        M.every(() => { if (M.stageT > 6) { M.call('max', [{ who: 'max', text: 'Leon, lass mich! Ich bin es nicht wert!' }, { who: 'leon', text: 'Das entscheide ich, Max! Halt an!' }]); return true; } return false; });
        mc.health = 100;
        await M.wait(() => { M.meter('Max’ Wagen', mc.health / 100); return mc.health < 50 || mc.wrecked; });
        M.meter(null);
        ctl.hold = true;
        S.world.clearTarget();
        await M.wait(() => Math.abs(mc.speed) < 1 && (M.mode === 'walk' || Math.abs(G.car().speed) < 2));
        if (M.mode === 'drive') G.exitCar();
        const mp = carSide(S, mc);
        S.chars.remove('max'); M.npc('max', mp.x, mp.z, Math.atan2(P(S).x - mp.x, P(S).z - mp.z));
        await M.talk([
          { who: 'max', text: 'Du hast meinen Kombi- … meinen Kleinwagen geschrottet. Schon wieder.', mood: 'sad' },
          { who: 'leon', text: 'Du hast mein Leben geschrottet, Max. Wir sind quitt bei den Autos.', mood: 'cold' },
          { who: 'max', text: 'Mach mit mir, was du willst. Ich hab’s verdient.', mood: 'sad' },
          { choice: [
            { text: 'Verschonen: „Du hilfst mir, Voss zu Fall zu bringen.“', note: 'Max bleibt Verbündeter', def: true, say: 'Du hast eine Chance, Max. Eine. Du sagst gegen Voss aus. Alles. Die Nachrichten, das Geld, Dragan.', act: () => { M.flag('maxFate', 'verschont'); M.rel('max', 25); },
              then: [{ who: 'max', text: 'Alles. Ich schwör’s. Auf … auf deinen Vater. Nicht auf die Drohnen.', mood: 'sad' }, { who: 'leon', text: 'Und Max? Wenn du mich noch einmal verkaufst –', mood: 'cold' }, { who: 'max', text: 'Dann fahr ich freiwillig gegen die Veste.', mood: 'sad' }] },
            { text: 'Verstoßen: „Verschwinde aus meinem Leben.“', note: 'Max ist raus', say: 'Geh, Max. Verschwinde aus Coburg. Aus meinem Leben. Ich will dich nie wieder sehen.', mood: 'angry', act: () => { M.flag('maxFate', 'verstossen'); M.rel('max', -40); },
              then: [{ who: 'max', text: 'Okay. … Okay. Pass auf dich auf, Leon. Ehrlich.', mood: 'sad' }, { who: 'leon', text: '(Zwanzig Jahre Freundschaft. Und das ist das Ende.)', name: 'Leon (denkt)', mood: 'sad' }] },
          ] },
        ], { with: ['max'] });
        if (M.flags.maxFate === 'verstossen') S.chars.walkTo('max', mp.x + 25, mp.z + 10, false, 10).then(() => S.chars.remove('max'));
        await M.sleep(2);
        await M.say({ who: 'leon', text: 'Der eigene beste Freund. Das war Voss’ letzter Trumpf. Jetzt bin ich dran.', dur: 4 });
      } },
    ],
    reward: (S) => ({ money: 0, lines: [S.state.flags.maxFate === 'verschont' ? 'Du hast <b>Max verschont</b> – er sagt gegen Voss aus' : 'Du hast <b>Max verstoßen</b>', 'Kapitel 5 abgeschlossen: Der Verräter war dein bester Freund'] }),
  });
})();
