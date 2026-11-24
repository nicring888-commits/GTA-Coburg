// Story-Modus (seit v3.22.0), Teil 3: Kapitel 1 „Zurück in Coburg“ – Missionen 1–5.
// Jede Mission: marker(S) (Startpunkt, null = startet anders), stages (Checkpoints: name, run(M)), reward, after.
// Bausteine von M siehe MissionRun in js/story-core.js. Orte sind echte Orte der Karte (Landmarken, Wohnungen,
// Läden, Lackiererei Nord = Tobis Werkstatt „Kfz Weber“). Handlung: STORY.md.
'use strict';

(() => {
  // Kamera-Hilfen: Punkt um ein Ziel (Winkel im Bogenmaß, 0 = von Süden), Blick auf Kopfhöhe
  const orbit = (o, dist, h, ang, lookH = 1.5) => ({ pos: [o.x + Math.sin(ang) * dist, (o.y || 0) + h, o.z + Math.cos(ang) * dist], look: [o.x, (o.y || 0) + lookH, o.z] });
  const yOf = (S, x, z) => S.G.world.heightAt(x, z);
  const P = S => S.G.player();
  const eur = n => '€ ' + Math.round(n).toLocaleString('de-DE');
  // Treffpunkt neben einem Ort (nicht in der Säule der Lackiererei): erster freier Punkt im Abstand d
  const beside = (S, p, d = 9) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q = S.walkable(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); if (q && Math.hypot(q.x - p.x, q.z - p.z) > d - 2.5) return q; } return S.walkable(p.x, p.z, 15) || p; };

  // =============================================================================================================
  // Mission 1 – Wieder daheim
  // =============================================================================================================
  StoryMissions.add({
    id: 'm01', title: 'Wieder daheim', contact: 'leon', blurb: 'Fünf Jahre war Leon weg.',
    marker: S => { const sp = S.G.spawn; return { x: sp.x, z: sp.z }; },
    stages: [
      { name: 'Ankunft', async run(M) {
        const S = M.S, pl = P(S);
        const st = S.lm('Bahnhof') || { x: pl.x, z: pl.z };
        // Leon am Bahnhofsvorplatz, Blick zur Stadt
        const y = pl.y;
        const hx = Math.sin(pl.heading), hz = Math.cos(pl.heading);
        await M.cut([
          { pos: [st.x - hx * 6 + hz * 26, yOf(S, st.x, st.z) + 18, st.z - hz * 6 - hx * 26], look: [pl.x, y + 2, pl.z], to: { pos: [pl.x - hx * 4 + hz * 14, y + 7, pl.z - hz * 4 - hx * 14] }, dur: 6.5, fov: 48 },
          { pos: [pl.x + hx * 3.2 + hz * 0.8, y + 1.75, pl.z + hz * 3.2 - hx * 0.8], look: [pl.x, y + 1.6, pl.z], to: { pos: [pl.x + hx * 2.4 + hz * 0.6, y + 1.7, pl.z + hz * 2.4 - hx * 0.6] }, dur: 5.5, fov: 38 },
          { pos: [pl.x - hx * 2.6 + hz * 0.9, y + 1.8, pl.z - hz * 2.6 - hx * 0.9], look: [pl.x + hx * 30, y + 3, pl.z + hz * 30], dur: 5, fov: 46 },
        ], [
          { who: 'leon', text: 'Coburg. Fünf Jahre war ich weg.', dur: 3.2 },
          { who: 'leon', text: 'Gleicher Bahnhof. Gleiche Tauben. Nur ich bin pleite.', dur: 3.6 },
          { who: 'leon', text: 'Nürnberg hat mir alles genommen, was ich nicht hatte. Also … zurück auf Anfang.', dur: 4.4 },
          { who: 'leon', text: 'Erst mal was Vernünftiges essen. Eine echte Coburger.', dur: 3.4 },
        ]);
        M.title('Kapitel 1', 'ZURÜCK IN COBURG', 'Zurück in der Heimat', 4.5);
        // zu Fuß zum Markt; unterwegs Gedanken
        const markt = { x: 0, z: 6 };
        let said = 0;
        M.every(() => {
          const d = Math.hypot(M.pos.x - markt.x, M.pos.z - markt.z);
          if (said === 0 && M.stageT > 14) { said = 1; M.say({ who: 'leon', text: 'Die Spitalgasse … früher gab’s hier einen Plattenladen. Jetzt verkaufen sie Handyhüllen.' }); }
          if (said === 1 && M.stageT > 34) { said = 2; M.say({ who: 'leon', text: 'Mama hätte gesagt: „Bub, zieh dir was Gscheits an.“ Na ja.' }); }
          if (said < 3 && d < 160) { said = 3; M.say({ who: 'leon', text: 'Da riecht’s schon. Kiefernzapfen. Ich bin zu Hause.' }); return true; }
          return false;
        });
        await M.goto(markt, { r: 30, name: 'Marktplatz', text: 'Geh zum <b>Marktplatz</b>.' });
      } },
      { name: 'Am Bratwurststand', async run(M) {
        const S = M.S, G = S.G;
        const g = G.props && G.props.grill ? G.props.grill : { x: -6, z: 36 };
        let dx = -g.x, dz = -g.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const ep = S.walkable(g.x + dx * 1.1, g.z + dz * 1.1, 4, 0.4) || { x: g.x + dx * 1.5, z: g.z + dz * 1.5 };
        M.npc('erwin', ep.x, ep.z, Math.atan2(dx, dz));
        if (M.retry) M.placePlayer(ep.x + dx * 6, ep.z + dz * 6, Math.atan2(-dx, -dz));
        M.objective('Sprich mit <b>Erwin</b> am Bratwurststand.');
        const T = S.world.setTarget(ep.x, ep.z, { r: 3, name: 'Erwin', beacon: false });
        await M.interact('erwin', 'Mit Erwin reden');
        S.world.clearTarget();
        M.objective(null);
        await M.talk([
          { who: 'erwin', text: 'Was darf’s sein, junger Mann? Zwei im Weckla, Senf, und …', mood: 'neutral' },
          { who: 'erwin', text: '… Moment. Leon? Leon Berger?! Der Bub vom Günter?', mood: 'surprised' },
          { who: 'leon', text: 'Hallo Erwin. Du stehst ja immer noch hier.', mood: 'happy' },
          { who: 'erwin', text: 'Wo soll ich denn hin? Der Rost brennt seit 38 Jahren. Ich geh erst, wenn mich die Zapfen holen.', mood: 'laugh' },
          { who: 'erwin', text: 'Fünf Jahre, Bub. Fünf Jahre keine Postkarte, nix. Und jetzt stehst du da, als wär nix gewesen.', mood: 'sad' },
          { who: 'leon', text: 'War viel los.', mood: 'sad' },
          { who: 'erwin', text: '„War viel los.“ Genau so hat dein Vater auch immer geredet. Na komm. Zwei Bratwürst?', mood: 'neutral' },
          { choice: [
            { text: 'Zahlen: „Zwei, mit Senf. Ich zahl.“', note: '€ 4', say: 'Zwei, mit Senf. Und ich zahl, Erwin.', act: () => { G.addMoney(-4); M.flag('erwinPaid'); },
              then: [{ who: 'erwin', text: 'Bargeld! Dass ich das noch erleb. Die jungen Leute wollen ja alle mit dem Handy zahlen. Am Grill!', mood: 'laugh' }] },
            { text: 'Frech: „Schreib’s an. Wie früher.“', say: 'Schreib’s an. Wie früher.', mood: 'smug', act: () => M.flag('erwinTab'),
              then: [{ who: 'erwin', text: 'Anschreiben?! Deine alte Rechnung hängt noch hinter der Theke. Vierzehn Würste, Juli 2021. Ich hab sie laminiert.', mood: 'angry' },
                { who: 'erwin', text: '… Aber gut. Weil du’s bist. Die hier geht aufs Haus. Die nächste nicht.', mood: 'smug' }] },
          ] },
          { who: 'leon', text: 'Mmh. Die schmeckt immer noch wie damals.', mood: 'happy' },
          { who: 'erwin', text: 'Natürlich. Manche Sachen ändern sich nicht in Coburg. Andere schon … schau mal da rüber.', mood: 'worried' },
        ], { with: ['erwin'] });
        // Kamera auf das Voss-Plakat
        const po = S.world.poster;
        if (po) {
          const fx = Math.sin(po.ry), fz = Math.cos(po.ry);
          await M.talk([
            { who: 'leon', text: '„Quartier Itzaue. Neue Mitte Coburg 2030.“ Wer ist denn Voss?', mood: 'neutral', cam: 'none' },
            { who: 'erwin', text: 'Richard Voss. Der baut die halbe Stadt um. Kauft Häuser, Wiesen, alles an der Itz. Wer nicht verkauft, hat irgendwann … Pech.', mood: 'cold', cam: 'none' },
            { who: 'erwin', text: 'Bei der Hofmann-Bäckerei hat’s letztes Jahr gebrannt. Beim Schuster in der Ketschengasse auch. Zufälle, sagt die Zeitung.', mood: 'worried', cam: 'none' },
            { who: 'leon', text: 'Brände. Klar. Zufälle.', mood: 'angry', cam: 'none' },
            { who: 'erwin', text: 'Dein Vater hätt’ dem was erzählt. Der hat sich nie was gefallen lassen.', mood: 'sad', cam: 'none' },
          ], { with: ['erwin'], shot: () => ({ pos: [po.x + fx * 8.5 - fz * 2, po.y + 2.4, po.z + fz * 8.5 + fx * 2], look: [po.x, po.y + 2.0, po.z], fov: 44 }) });
        }
        // SMS von Max
        await M.sleep(0.8);
        M.sms('max', 'ALTER?!?! Erwin hat mir grad geschrieben dass du zurück bist!!! 😱 Komm SOFORT zu Tobi in die Werkstatt, Lackiererei Nord!!!');
        await M.sleep(1.4);
        await M.talk([
          { who: 'leon', text: 'Max. Natürlich weiß Max es schon.', mood: 'smug' },
          { who: 'erwin', text: 'Ich hab ihm geschrieben. Ich hab jetzt auch so ein Whatsdings. Meine Enkelin hat’s mir eingerichtet.', mood: 'happy' },
          { who: 'erwin', text: 'Hier, nimm. Willkommensgeld. Und lass dich öfter blicken, gell?', mood: 'happy' },
          { who: 'leon', text: 'Erwin, das kann ich nicht annehmen.', mood: 'surprised' },
          { who: 'erwin', text: 'Doch, kannst du. Du gibst’s mir zurück, wenn du reich bist. Mit Zinsen. In Bratwürst.', mood: 'laugh' },
        ], { with: ['erwin'] });
      } },
    ],
    reward: () => ({ money: 50, lines: ['Neuer Kontakt: <b>Erwin</b>', 'Neue Mission: <b>Alte Zeiten</b> (Kfz Weber)'] }),
  });

  // =============================================================================================================
  // Mission 2 – Alte Zeiten
  // =============================================================================================================
  StoryMissions.add({
    id: 'm02', title: 'Alte Zeiten', contact: 'max', blurb: 'Wiedersehen in der Werkstatt.',
    marker: S => { const w = S.workshop(); return w && beside(S, w); },
    stages: [
      { name: 'Wiedersehen', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        const pl = P(S);
        const base = beside(S, w);
        const mp = S.walkable(base.x + 2.2, base.z + 1.2, 6) || base, tp = S.walkable(base.x - 1.6, base.z + 2.4, 6) || base;
        M.npc('tobi', tp.x, tp.z, Math.atan2(pl.x - tp.x, pl.z - tp.z));
        const max = M.npc('max', mp.x + 6, mp.z + 6, 0);
        M.kombi = M.vehicle('kombi', '#4f8f8a', w.x, w.z);
        // Max kommt angerannt
        S.chars.walkTo('max', mp.x, mp.z, true, 4);
        await M.cut([{ ...orbit({ x: (pl.x + mp.x) / 2, y: pl.y, z: (pl.z + mp.z) / 2 }, 7, 2.6, Math.atan2(mp.x - pl.x, mp.z - pl.z) + 1.4, 1.4), dur: 2.6, fov: 44 }]);
        await M.talk([
          { who: 'max', text: 'LEEEEOOON! Digga! Komm her, du Verräter!', mood: 'laugh' },
          { who: 'leon', text: 'Max. Du hast dich null verändert.', mood: 'happy' },
          { who: 'max', text: 'Danke! Ich nehm das als Kompliment. Fünf Jahre, Alter! FÜNF! Ich dachte, du bist tot. Oder in Berlin. Was schlimmer wär.', mood: 'happy' },
          { who: 'tobi', text: 'Servus, Leon. Lang nicht gesehen.', mood: 'neutral' },
          { who: 'leon', text: 'Tobi. Die Werkstatt läuft?', mood: 'neutral' },
          { who: 'tobi', text: 'Läuft. Lackieren, Bremsen, Unfallschäden. Und manchmal Autos, die keine Fragen beantworten wollen.', mood: 'smug' },
          { who: 'tobi', text: 'Dein Vater hat mir das alles beigebracht. Ohne den Günter wär ich heute Hausmeister im Klinikum.', mood: 'sad' },
          { who: 'leon', text: '… Ja. Er hat immer gesagt, du hast goldene Hände und ein Spatzenhirn.', mood: 'smug' },
          { who: 'tobi', text: 'Die Hände hab ich noch. Das Hirn hab ich mir angelernt.', mood: 'laugh' },
          { who: 'max', text: 'Okay, okay, genug geweint. Leon, weißt du, was jetzt ansteht?', mood: 'smug' },
          { who: 'leon', text: 'Oh nein.', mood: 'worried' },
          { who: 'max', text: 'Oh doch! Wie früher: wer zuerst an der Veste ist! Du fährst, ich navigier. Mein Kombi. Frisch aus Tobis Hand.', mood: 'laugh' },
          { who: 'tobi', text: 'Wenn ihr mir den Kombi zerlegt, zahlt ihr. Beide. In bar.', mood: 'angry' },
        ], { with: ['max', 'tobi'] });
      } },
      { name: 'Zur Veste', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        if (!M.kombi || M.kombi.disposed || M.retry) {
          M.kombi = M.vehicle('kombi', '#4f8f8a', w.x, w.z);
          if (M.retry) M.seat(M.kombi);
        }
        const k = M.kombi;
        if (!M.inCar(k)) {
          const T = S.world.setTarget(k.x, k.z, { r: 3, name: 'Max’ Kombi', beacon: false });
          M.objective('Steig in <b>Max’ Kombi</b>.');
          await M.wait(() => M.inCar(k));
          S.world.clearTarget();
        }
        S.chars.hide('max'); S.chars.remove('tobi');
        const veste = S.lm('Veste Coburg') || { x: 700, z: -650 };
        const goal = S.road(veste.x, veste.z, 450);
        M.timer(240, 'Zu langsam. Max: „Früher warst du schneller, Alter.“');
        M.watch(() => (k.wrecked || k.burning || k.health <= 0) ? 'Max’ Kombi ist Schrott. Tobi wird nicht begeistert sein.' : null);
        let outT = 0;
        M.watch(dt => { if (M.inCar(k)) { outT = 0; return null; } outT += dt; if (outT > 1 && outT < 1.1) G.ui.toast('Steig wieder ein – Max wartet!', 2); return outT > 30 ? 'Du hast Max einfach stehen lassen.' : null; });
        // Max kommentiert
        let impT = 0, fastT = 0, banter = 0;
        const hits = ['Alter! Das war ’ne Mülltonne!', 'Das zahl ich nicht. Das sag ich Tobi nicht.', 'Fahrschule bei Herrn Dötsch hat dir echt nix gebracht.', 'Mein Kombi! Der hat Gefühle!'];
        M.every(dt => {
          impT -= dt; fastT -= dt;
          if (!M.inCar(k)) return false;
          if (k.lastImpact > 4 && impT <= 0) { impT = 4; M.say({ who: 'max', text: hits[Math.floor(Math.random() * hits.length)] }); }
          if (Math.abs(k.speed) * 3.6 > 105 && fastT <= 0) { fastT = 12; M.say({ who: 'max', text: 'Digga, das ist ein Kombi, kein Raumschiff!' }); }
          const tt = M.stageT;
          if (banter === 0 && tt > 6) { banter = 1; M.say([{ who: 'max', text: 'Weißt du noch? Abiball. Du, ich, der Golf von deinem Vater und die Polizei am Schlossplatz.' }, { who: 'leon', text: 'Wir haben nur Musik gehört.' }, { who: 'max', text: 'Auf dem Dach vom Golf. Um drei Uhr nachts.' }]); }
          if (banter === 1 && tt > 40) { banter = 2; M.say([{ who: 'max', text: 'Ich hab übrigens grad ’ne Geschäftsidee. Bratwurst-Lieferservice. Per Drohne.' }, { who: 'leon', text: 'Max.' }, { who: 'max', text: 'Die Drohne heißt „Zapfen-Express“. Ich hab schon Sticker drucken lassen.' }]); }
          if (banter === 2 && tt > 80) { banter = 3; M.say([{ who: 'max', text: 'Ernsthaft, Leon … warum bist du damals einfach weg? Ohne was zu sagen?' }, { who: 'leon', text: 'Lass uns erst mal ankommen.' }]); }
          return false;
        });
        await M.goto(goal, { r: 14, car: k, name: 'Veste Coburg', text: 'Fahr mit Max hoch zur <b>Veste Coburg</b>.', tall: true });
        M.stopTimer();
        M.goal = goal;
      } },
      { name: 'Über den Dächern', async run(M) {
        const S = M.S, G = S.G;
        const veste = S.lm('Veste Coburg') || { x: 700, z: -650 };
        const goal = M.goal || S.road(veste.x, veste.z, 450);
        await M.black(true, 500);
        const pp = S.walkable(goal.x, goal.z, 14) || goal;
        M.placePlayer(pp.x, pp.z, Math.atan2(-pp.x, -pp.z));
        const mx = S.walkable(pp.x + 1.4, pp.z + 0.6, 4) || pp;
        S.chars.remove('max');
        M.npc('max', mx.x, mx.z, Math.atan2(-mx.x, -mx.z));
        await M.black(false, 700);
        const y = P(S).y;
        // Blick über Coburg (Richtung Markt)
        const dir = Math.atan2(-pp.x, -pp.z);
        await M.cut([
          // Drohnenflug über die Mauern der Veste hinaus, Blick auf die Altstadt
          { pos: [pp.x - Math.sin(dir) * 14, y + 36, pp.z - Math.cos(dir) * 14], look: [0, yOf(S, 0, 0) + 10, 0], to: { pos: [pp.x + Math.sin(dir) * 70, y + 24, pp.z + Math.cos(dir) * 70] }, dur: 8, fov: 52 },
        ], [{ who: 'max', text: 'Und? Hab ich zu viel versprochen?', dur: 3 }, { who: 'leon', text: 'Nein. Von hier oben sieht alles so … einfach aus.', dur: 3.6 }]);
        await M.talk([
          { who: 'max', text: 'Okay. Jetzt mal ehrlich. Warum bist du damals abgehauen? Nach dem Brand?', mood: 'worried' },
          { who: 'leon', text: 'Die Versicherung hat behauptet, Papa hat das Autohaus selbst angezündet. Für das Geld.', mood: 'sad' },
          { who: 'leon', text: 'Die ganze Stadt hat geredet. Ich hab mich mit ihm gestritten. Ich hab gesagt, er soll kämpfen. Er hat verkauft.', mood: 'angry' },
          { who: 'leon', text: 'Und dann war ich weg. Und zwei Jahre später war er tot. Ich war nicht mal auf der Beerdigung.', mood: 'sad' },
          { who: 'max', text: '… Ich war da. Tobi auch. Und Erwin hat Bratwürst gemacht. Für umsonst. Das hätte deinem Vater gefallen.', mood: 'sad' },
          { who: 'leon', text: 'Ja. Hätte es.', mood: 'sad' },
          { who: 'max', text: 'Wem hat er das Grundstück eigentlich verkauft? An der Itz?', mood: 'neutral' },
          { who: 'leon', text: 'Irgendeiner Firma. Ich hab den Vertrag nie gelesen.', mood: 'neutral' },
          { who: 'max', text: 'Hm. … Egal! Neues Thema! Du, äh … ich hab da grad einen kleinen Engpass.', mood: 'worried' },
          { who: 'max', text: 'Aber erst mal – hier. Hundertfünfzig. Die schuld ich dir noch vom Abiball. Siehst du? Ehrenmann.', mood: 'smug' },
          { who: 'leon', text: 'Du gibst mir 150 … um mich dann nach Geld zu fragen.', mood: 'smug' },
          { who: 'max', text: 'Zweihundert. Nur bis Freitag. Ein todsicheres Ding, ich schwör’s auf den Zapfen-Express.', mood: 'happy' },
          { choice: [
            { text: 'Leihen: „Bis Freitag. Und ich will’s wiedersehen.“', note: '€ 200 · Max ▲', if: () => true, disabled: G.save.money < 200,
              say: 'Bis Freitag. Und ich will die Kohle wiedersehen, Max.', act: () => { G.addMoney(-200); M.flag('maxLoan', true); M.rel('max', 15); },
              then: [{ who: 'max', text: 'DU BIST DER BESTE! Ich wusste es! Freitag. Großes Indianerehrenwort.', mood: 'laugh' }] },
            { text: 'Ablehnen: „Ich hab selbst nix, Max.“', note: 'Max ▼', say: 'Ich hab selbst nix, Max. Ich bin pleite zurückgekommen.', def: true, act: () => { M.flag('maxLoan', false); M.rel('max', -5); },
              then: [{ who: 'max', text: 'Schon gut, schon gut. War nur ’ne Frage. Ich krieg das anders hin.', mood: 'worried' }, { who: 'max', text: 'Irgendwie krieg ich’s immer hin.', mood: 'sad' }] },
          ] },
          { who: 'max', text: 'Sag mal, wo pennst du eigentlich?', mood: 'neutral' },
          { who: 'leon', text: 'Gute Frage.', mood: 'worried' },
          { who: 'max', text: 'Die Gundermann in der Judengasse vermietet. Die ist streng, aber fair. Also … hauptsächlich streng.', mood: 'smug' },
        ], { with: ['max'] });
      } },
    ],
    reward: () => ({ money: 150, lines: ['Max hat seine Abiball-Schulden bezahlt', 'Neue Mission: <b>Eine Unterkunft</b> (Judengasse)'] }),
  });

  // =============================================================================================================
  // Mission 3 – Eine Unterkunft
  // =============================================================================================================
  const doorSpot = (S, h, out = 1) => S.walkable(h.sx + (h.ox || 0) * out, h.sz + (h.oz || 0) * out, 8) || { x: h.sx, z: h.sz };
  StoryMissions.add({
    id: 'm03', title: 'Eine Unterkunft', contact: 'leon', blurb: 'Leon braucht ein Dach über dem Kopf.',
    marker: S => { const h = S.home('juden'); return h ? doorSpot(S, h, 2.5) : null; },
    stages: [
      { name: 'Judengasse', async run(M) {
        const S = M.S, h = S.home('juden');
        const gp = doorSpot(S, h, 0.9);
        M.npc('gundermann', gp.x, gp.z, h.heading || 0);
        if (M.retry) { const p = doorSpot(S, h, 3); M.placePlayer(p.x, p.z); }
        M.objective('Sprich mit <b>Frau Gundermann</b>.');
        await M.interact('gundermann', 'Klingeln');
        await M.talk([
          { who: 'gundermann', text: 'Ja bitte? Wenn Sie von den Zeugen Jehovas sind: Ich bin schon gerettet.', mood: 'cold' },
          { who: 'leon', text: 'Guten Tag. Leon Berger. Ich hab gehört, Sie vermieten die Altbauwohnung.', mood: 'happy' },
          { who: 'gundermann', text: 'Berger. Berger … Doch nicht der Berger vom Autohaus an der Itz?', mood: 'surprised' },
          { who: 'leon', text: 'Der Sohn.', mood: 'neutral' },
          { who: 'gundermann', text: 'Soso. Haustiere?', mood: 'cold' },
          { who: 'leon', text: 'Nein.', mood: 'neutral' },
          { who: 'gundermann', text: 'Musik? Damenbesuch? Herrenbesuch? Besuch generell? Grillen? Fahrrad im Treppenhaus? Duschen nach 22 Uhr?', mood: 'cold' },
          { who: 'leon', text: 'Darf ich atmen?', mood: 'smug' },
          { who: 'gundermann', text: 'Leise. — Arbeitsvertrag? Gehaltsnachweise der letzten sechs Monate? Schufa? Bürgschaft der Eltern?', mood: 'cold' },
          { who: 'leon', text: 'Ich bin … gerade im Übergang.', mood: 'worried' },
          { who: 'gundermann', text: 'Im Übergang. Junger Mann, die Wohnung kostet 4.500 Kaution. Kommen Sie wieder, wenn Sie angekommen sind.', mood: 'cold' },
          { who: 'gundermann', text: 'Und richten Sie Ihrer Mutter schöne Grüße aus. Die hat wenigstens Manieren gehabt.', mood: 'smug' },
        ], { with: ['gundermann'] });
        await M.sleep(0.6);
        M.sms('max', 'Und? Hat die Gundermann dich gefressen? 😂 Plan B: Herr Kraus, Lossaustraße. Hängt jeden Tag im Hofgarten bei den Enten rum. Sag, du kommst von mir. Also, vielleicht sag’s lieber nicht.');
        await M.sleep(1);
      } },
      { name: 'Hofgarten', async run(M) {
        const S = M.S;
        const hg = S.lm('Hofgarten') || { x: 200, z: -150 };
        const kp = S.walkable(hg.x, hg.z, 30) || hg;
        M.npc('kraus', kp.x, kp.z, 0);
        const T = S.world.setTarget(kp.x, kp.z, { r: 3, name: 'Herr Kraus' });
        M.objective('Finde <b>Herrn Kraus</b> im Hofgarten.');
        await M.interact('kraus', 'Herrn Kraus ansprechen');
        S.world.clearTarget();
        await M.talk([
          { who: 'kraus', text: 'Pssst! Die Ente mit dem weißen Fleck, das ist Helmut. Der ist scheu.', mood: 'neutral' },
          { who: 'leon', text: 'Herr Kraus? Ich suche eine Wohnung. Max Fischer meinte …', mood: 'neutral' },
          { who: 'kraus', text: 'Der Fischer-Max! Der schuldet mir noch einen Rasenmäher. Und eine Entschuldigung.', mood: 'angry' },
          { who: 'leon', text: 'Das … klingt nach Max.', mood: 'smug' },
          { who: 'kraus', text: 'Hm. Sie haben ehrliche Augen. Und kräftige Arme. Das ist gut.', mood: 'smug' },
          { who: 'kraus', text: 'Das Apartment unten in der Lossaustraße ist frei. Klein, aber gemütlich. 380 warm.', mood: 'happy' },
          { who: 'kraus', text: 'Ein Problem: Heute zieht oben die Neue ein, Frau Neumann. Schreibt für die Zeitung. Und ihr Umzugshelfer ist nicht gekommen.', mood: 'worried' },
          { who: 'kraus', text: 'Ich hab Rücken. Sie tragen die Kisten rein – und ich vergess die Kaution. Abgemacht?', mood: 'happy' },
          { choice: [
            { text: '„Abgemacht.“', def: true, say: 'Abgemacht. Ich bin in zehn Minuten da.' },
            { text: '„Wie viele Kisten?“', say: 'Wie viele Kisten genau?', then: [{ who: 'kraus', text: 'Drei. Sagt sie. Journalisten übertreiben aber gern nach unten.', mood: 'smug' }, { who: 'leon', text: 'Abgemacht.', mood: 'neutral' }] },
          ] },
          { who: 'kraus', text: 'Ich nehm den Bus. Und Helmut kriegt noch sein Brot.', mood: 'happy' },
        ], { with: ['kraus'] });
        S.chars.remove('kraus');
      } },
      { name: 'Umzugskisten', async run(M) {
        const S = M.S, G = S.G, h = S.home('lossau');
        const door = doorSpot(S, h, 0.8);
        const van = M.vehicle('van', '#eceae4', door.x, door.z);
        const kp = S.walkable(door.x + (h.ox || 0) * 1.5 + 1.2, door.z + (h.oz || 0) * 1.5, 6) || door;
        M.npc('kraus', kp.x, kp.z, 0);
        if (M.retry) { const p = S.walkable(door.x + 6, door.z + 6, 10) || door; M.placePlayer(p.x, p.z); }
        // Kisten hinter dem Transporter
        const hx = Math.sin(van.heading), hz = Math.cos(van.heading);
        const rear = { x: van.x - hx * 3.6, z: van.z - hz * 3.6 };
        const labels = ['BÜCHER – S. Neumann', 'AKTEN!!! NICHT KNICKEN', 'Küche / Kaffeemaschine'];
        const boxes = labels.map((l, i) => { const p = S.walkable(rear.x - hz * (0.4 + i * 0.7), rear.z + hx * (0.4 + i * 0.7), 5, 0.35) || rear; return S.world.box(p.x, p.z, ['#b08a5a', '#a67c4e', '#bb9466'][i], l); });
        await M.goto(door, { r: 12, name: 'Lossaustraße', text: 'Komm zur <b>Lossaustraße</b>, Herr Kraus wartet.' });
        await M.talk([
          { who: 'kraus', text: 'Da sind Sie ja! Drei Kisten, hinten am Transporter. Und nicht rennen, da ist Geschirr drin. Und Akten. Und vermutlich ihr Leben.', mood: 'happy' },
        ], { with: ['kraus'] });
        let carried = null, delivered = 0;
        const pl = P(S);
        const comments = [
          [{ who: 'kraus', text: 'Bücher. Die schreibt nicht nur, die liest auch. Gefährliche Frau.' }],
          [{ who: 'kraus', text: '„Akten.“ Die recherchiert irgendwas. Über Voss, hab ich gehört. Halten Sie sich da raus, junger Mann.' }, { who: 'leon', text: 'Voss. Der Name verfolgt mich heute.' }],
          [{ who: 'kraus', text: 'Die Kaffeemaschine! Die wichtigste Kiste. Ohne Kaffee keine Wahrheit, sagt sie.' }],
        ];
        // Tragen: Kiste in den Händen, langsam gehen; Rennen oder Einsteigen = Kiste fällt
        const drop = (why) => {
          if (!carried) return;
          pl.group.remove(carried.mesh);
          const p = S.walkable(pl.x, pl.z, 3, 0.3) || pl;
          carried.mesh.position.set(p.x, S.world.ground(p.x, p.z) + 0.2, p.z); carried.x = p.x; carried.z = p.z;
          G.scene.add(carried.mesh);
          carried = null; pl.runSpeed = undefined;
          if (why) G.ui.toast(why, 2);
        };
        M.every(() => {
          if (!carried) return false;
          if (M.mode !== 'walk') { drop('Die Kiste liegt wieder auf der Straße.'); return false; }
          if ((G.keys.ShiftLeft || G.keys.ShiftRight) && pl.moveSpeed > 4.6) { drop('Nicht rennen! Die Kiste ist runtergefallen.'); M.say({ who: 'kraus', text: 'Vorsicht! Da ist Porzellan drin!' }); }
          return false;
        });
        while (delivered < 3) {
          M.objective(`Trag die <b>Umzugskisten</b> zur Haustür (${delivered}/3).`);
          if (!carried) {
            const left = boxes.filter(b => !b.done);
            const near = () => left.reduce((a, b) => Math.hypot(b.x - pl.x, b.z - pl.z) < Math.hypot(a.x - pl.x, a.z - pl.z) ? b : a);
            await M.interact({ get x() { return near().x; }, get z() { return near().z; } }, 'Kiste aufnehmen', 1.8);
            const b = near();
            carried = b;
            G.scene.remove(b.mesh);
            b.mesh.position.set(0, 1.12, 0.42); b.mesh.rotation.set(0, 0, 0);
            pl.group.add(b.mesh);
            pl.runSpeed = 4.6;
            G.ui.toast(b.label, 2.2);
          }
          const T = S.world.setTarget(door.x, door.z, { r: 2.2, name: 'Haustür' });
          await M.interact(door, 'Kiste abstellen', 2.2);
          S.world.clearTarget();
          if (!carried) continue;   // unterwegs fallen gelassen
          const b = carried; carried = null; pl.runSpeed = undefined;
          pl.group.remove(b.mesh); b.done = true;
          const sp = S.walkable(door.x + (delivered - 1) * 0.65, door.z + 0.5, 3, 0.3) || door;
          b.mesh.position.set(sp.x, S.world.ground(sp.x, sp.z) + 0.2 + 0, sp.z); G.scene.add(b.mesh);
          M.say(comments[delivered]);
          delivered++;
        }
        M.objective(null);
        await M.talk([
          { who: 'kraus', text: 'Respekt! Drei Kisten, null Scherben. Sie sind eingestellt. Also – eingezogen.', mood: 'laugh' },
          { who: 'kraus', text: 'Hier, Ihr Schlüssel. Apartment Lossaustraße, Erdgeschoss links. Miete am Ersten, bar, in einem Umschlag mit Ente drauf.', mood: 'happy' },
          { who: 'leon', text: 'Mit … Ente drauf.', mood: 'surprised' },
          { who: 'kraus', text: 'Ich hab meine Prinzipien.', mood: 'smug' },
          { act: () => {
            const P0 = G.property;
            if (!P0.owns('lossau')) { G.save.homes.push('lossau'); M.flag('rentLossau'); }
            const hh = S.home('lossau'); if (hh && P0.refreshHome) P0.refreshHome(hh);
            G.persist();
          } },
        ], { with: ['kraus'] });
        S.chars.walkTo('kraus', kp.x + 12, kp.z + 12, false, 8).then(() => S.chars.remove('kraus'));
      } },
      { name: 'Die erste Nacht', async run(M) {
        const S = M.S, G = S.G, h = S.home('lossau');
        if (!G.property.owns('lossau')) { G.save.homes.push('lossau'); if (G.property.refreshHome) G.property.refreshHome(h); }
        if (M.retry) { const p = doorSpot(S, h, 3); M.placePlayer(p.x, p.z); }
        const door = doorSpot(S, h, 0.8);
        if (!(G.property.inside && G.property.inside.home.id === 'lossau')) {
          S.world.setTarget(door.x, door.z, { r: 2.2, name: 'Deine Wohnung' });
          M.objective('Geh in deine <b>Wohnung</b> (<kbd>F</kbd> an der Haustür).');
          await M.wait(() => G.property.inside && G.property.inside.home.id === 'lossau');
          S.world.clearTarget();
        }
        await M.sleep(1);
        await M.say({ who: 'leon', text: 'Eigenes Bett. Eigene vier Wände. Klein, aber meins. Fast.' });
        M.objective('Leg dich <b>schlafen</b> (<kbd>E</kbd> am Bett).');
        await M.waitEvent('sleep');
        M.objective(null);
        M.title('', 'Am nächsten Morgen …', '', 3);
        await M.sleep(2.5);
      } },
    ],
    reward: () => ({ money: 0, lines: ['Neues Zuhause: <b>Apartment Lossaustraße</b> (gemietet)', 'Speicherpunkt: Bett'] }),
    after: S => {
      S.dialog.sub([]);
      S.hud.phone('call', 'tobi', '', 999);
      S.dialog.sub([
        { who: 'tobi', text: 'Leon? Tobi hier. Ausgeschlafen?' },
        { who: 'leon', text: 'Geht so. Was gibt’s?' },
        { who: 'tobi', text: 'Ich hätt’ einen Fahrauftrag. Leicht verdientes Geld. Komm in die Werkstatt.' },
      ]).then(() => { S.hud.phoneT = 0.6; });
    },
  });

  // =============================================================================================================
  // Mission 4 – Der erste Auftrag
  // =============================================================================================================
  StoryMissions.add({
    id: 'm04', title: 'Der erste Auftrag', contact: 'tobi', blurb: 'Ein kleiner Transportauftrag.',
    marker: S => { const w = S.workshop(); return w && beside(S, w); },
    stages: [
      { name: 'Werkstatt', async run(M) {
        const S = M.S, w = S.workshop(), pl = P(S);
        const tp = S.walkable(beside(S, w).x + 1.5, beside(S, w).z, 4) || beside(S, w);
        M.npc('tobi', tp.x, tp.z, Math.atan2(pl.x - tp.x, pl.z - tp.z));
        M.van = M.vehicle('van', '#f4f4f4', w.x, w.z);
        await M.talk([
          { who: 'tobi', text: 'Morgen. Kaffee steht da. Schmeckt wie Motoröl, wirkt aber.', mood: 'neutral' },
          { who: 'tobi', text: 'Also. Ein Kunde braucht einen Fahrer. Zwölf Kisten Kristallgläser zum Kongresshaus Rosengarten. Heute Abend ist da ein Empfang.', mood: 'neutral' },
          { who: 'leon', text: 'Gläser fahren. Klingt nach einem Abenteuer.', mood: 'smug' },
          { who: 'tobi', text: 'Gläser für 30.000 Euro. Jede Bodenwelle kostet. Jeder Bordstein auch.', mood: 'cold' },
          { who: 'leon', text: 'Wer bestellt Gläser für 30.000?', mood: 'surprised' },
          { who: 'tobi', text: 'Voss Projektentwicklung.', mood: 'neutral' },
          { who: 'leon', text: '… Natürlich.', mood: 'cold' },
          { who: 'tobi', text: 'Ich mag den auch nicht. Aber sein Geld ist genauso grün wie deins. Und ich hab Rechnungen.', mood: 'sad' },
          { who: 'tobi', text: 'Mein Kleinbus steht vorne. Fahr wie mit einem Ei auf dem Armaturenbrett.', mood: 'neutral' },
        ], { with: ['tobi'] });
      } },
      { name: 'Die Fahrt', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        if (!M.van || M.van.disposed || M.retry) { M.van = M.vehicle('van', '#f4f4f4', w.x, w.z); if (M.retry) M.seat(M.van); }
        const van = M.van;
        if (!M.inCar(van)) {
          S.world.setTarget(van.x, van.z, { r: 3, name: 'Kleinbus', beacon: false });
          M.objective('Steig in Tobis <b>Kleinbus</b>.');
          await M.wait(() => M.inCar(van));
          S.world.clearTarget();
        }
        S.chars.remove('tobi');
        const rg = S.lm('Kongresshaus Rosengarten') || { x: 230, z: -520 };
        const goal = S.road(rg.x, rg.z, 300);
        M.goal = goal;
        let cargo = 100, hitT = 0, called = false;
        M.meter('Ladung', 1);
        M.timer(210, 'Zu spät. Der Empfang beginnt ohne Gläser.');
        M.watch(() => (van.wrecked || van.burning || van.health <= 0) ? 'Der Kleinbus ist hinüber – und die Gläser auch.' : null);
        let outT = 0;
        M.watch(dt => { outT = M.inCar(van) ? 0 : outT + dt; return outT > 40 ? 'Du hast die Ladung einfach stehen lassen.' : null; });
        M.every(dt => {
          hitT -= dt;
          if (M.inCar(van) && van.lastImpact > 2.2 && hitT <= 0) {
            hitT = 0.35;
            const loss = Math.min(40, (van.lastImpact - 1.5) * 3.4);
            cargo = Math.max(0, cargo - loss);
            G.ui.toast(cargo > 0 ? `Klirr! Ladung ${Math.round(cargo)} %` : 'Alles kaputt …', 1.4);
            if (cargo > 0 && loss > 8) M.say({ who: 'leon', text: ['Das war … ein teures Geräusch.', 'Ruhig, Leon. Wie ein Ei.', 'Hoffentlich waren das die hässlichen.'][Math.floor(Math.random() * 3)] });
          }
          M.cargo = cargo;
          M.meter('Ladung', cargo / 100);
          if (cargo <= 0) { M.fail('Alle Gläser sind kaputt. Tobi wird das von deinem Lohn abziehen. Für die nächsten zehn Jahre.'); return true; }
          if (!called && M.stageT > 22) { called = true; M.call('max', [
            { who: 'max', text: 'Leon! Tobi sagt, du fährst für VOSS?! DEN Voss?!' },
            { who: 'leon', text: 'Ich fahr Gläser, Max. Für Tobi.' },
            { who: 'max', text: 'Digga, das ist unser Ticket! Der Typ hat Kohle ohne Ende. Mach einen guten Eindruck!' },
            { who: 'leon', text: 'Ich leg jetzt auf. Ich muss mich auf die Gläser konzentrieren.' },
            { who: 'max', text: 'Grüß die Gläser von mir!' },
          ]); }
          return false;
        });
        await M.goto(goal, { r: 12, car: van, slow: 5, name: 'Kongresshaus Rosengarten', text: 'Bring die Gläser zum <b>Kongresshaus Rosengarten</b>. Vorsichtig!' });
        M.stopTimer();
      } },
      { name: 'Die Übergabe', async run(M) {
        const S = M.S, G = S.G;
        const goal = M.goal || S.road(230, -520);
        const cargo = M.cargo === undefined ? 100 : M.cargo;
        M.cargoFinal = cargo;
        M.meter(null);
        const lp = S.walkable(goal.x + 3, goal.z + 3, 12) || goal;
        M.npc('lenz', lp.x, lp.z, 0);
        if (M.retry) M.placePlayer(lp.x + 4, lp.z + 4);
        M.objective('Steig aus und melde dich bei <b>Dr. Lenz</b>.');
        await M.interact('lenz', 'Lieferung übergeben');
        M.objective(null);
        const good = cargo >= 75;
        await M.talk([
          { who: 'lenz', text: 'Herr Weber hat einen neuen Fahrer? Lenz. Dr. Katharina Lenz, Büro Voss.', mood: 'cold' },
          { who: 'leon', text: 'Berger. Zwölf Kisten Gläser. Mehr oder weniger.', mood: 'smug' },
          good ? { who: 'lenz', text: `Ich zähle … fast alles heil. Respekt. Der letzte Fahrer hat es auf ${Math.round(40 + Math.random() * 15)} Prozent gebracht.`, mood: 'happy' }
            : { who: 'lenz', text: 'Ich höre es klirren, Herr Berger. Das ist kein gutes Geräusch für 30.000 Euro.', mood: 'angry' },
          { who: 'lenz', text: 'Moment. In Kiste sieben liegt etwas, das nicht zu den Gläsern gehört.', mood: 'worried' },
          { who: 'leon', text: 'Ein Umschlag. „Gutachten Hochwasser Itzaue – VERTRAULICH“.', mood: 'surprised' },
          { who: 'lenz', text: 'Den hat Herr Weber wohl versehentlich mit eingepackt. Ich muss kurz telefonieren. Warten Sie hier.', mood: 'cold' },
          { act: () => S.chars.walkTo('lenz', lp.x + 6, lp.z + 2, false, 5) },
          { who: 'leon', text: 'Vertraulich. Wenn’s irgendwo „vertraulich“ steht, steht da meistens was Interessantes.', mood: 'smug' },
          { choice: [
            { text: 'Umschlag öffnen und lesen', note: 'Neugier', say: false, act: () => M.flag('readEnvelope', true) },
            { text: 'Nicht anrühren', note: 'Diskret', def: true, say: 'Geht mich nichts an. Ich bin nur der Fahrer.', act: () => { M.flag('readEnvelope', false); M.rel('voss', 5); } },
          ] },
        ], { with: ['lenz'] });
        if (M.flags.readEnvelope) {
          await M.doc('Gutachten Hochwasser Itzaue · VERTRAULICH', `<p><b>Ingenieurbüro Hessler &amp; Partner</b> · Entwurf 3 · zur Vorlage bei R. Voss</p>
            <p>Das Plangebiet „Quartier Itzaue“ liegt <s>vollständig im festgesetzten Überschwemmungsgebiet (HQ100)</s> <span class="st-hand">am Rand eines Gebiets mit geringem Hochwasserrisiko</span>.</p>
            <p>Eine Bebauung ist <s>nach § 78 WHG nicht genehmigungsfähig</s> <span class="st-hand">mit Auflagen möglich</span>.</p>
            <p>Offene Punkte: Wegerecht Flurstück 1147/3 (ehem. Autohaus Berger) – <span class="st-hand">Eigentümer klären!! R.V.</span></p>`);
          await M.say({ who: 'leon', text: 'Autohaus Berger. Das ist das Grundstück von Papa. Was zum …' });
          await M.sleep(0.4);
          S.chars.walkTo('lenz', lp.x, lp.z, false, 4);
          await M.sleep(1.8);
          await M.talk([
            { who: 'lenz', text: 'Den Umschlag nehme ich. Sie haben doch nicht etwa …', mood: 'cold' },
            { who: 'leon', text: 'Hochwassergutachten sind nicht so mein Genre.', mood: 'smug' },
            { who: 'lenz', text: 'Gut. Wir verstehen uns.', mood: 'cold' },
          ], { with: ['lenz'] });
        } else {
          S.chars.walkTo('lenz', lp.x, lp.z, false, 4);
          await M.sleep(2);
        }
        await M.talk([
          { who: 'lenz', text: 'Herr Voss möchte den Fahrer kennenlernen, der so … sorgfältig ist. Heute Abend, Schlossplatz vor der Ehrenburg.', mood: 'neutral' },
          { who: 'lenz', text: 'Ein Hinweis unter uns: Herr Voss legt Wert auf Kleidung. Bitte keine Kapuze. Und nichts, was nach Tankstelle aussieht.', mood: 'smug' },
          { who: 'leon', text: 'Meine Jacke ist von einer sehr guten Tankstelle.', mood: 'smug' },
          { who: 'lenz', text: 'Genau das meinte ich. Hier ist Ihr Geld. Guten Tag, Herr Berger.', mood: 'cold' },
        ], { with: ['lenz'] });
      } },
    ],
    reward: (S, M) => { const c = M.cargoFinal === undefined ? 100 : M.cargoFinal; S.rel.add('voss', c >= 75 ? 10 : c >= 40 ? 3 : -5); return { money: 300 + Math.round(c * 4), lines: [`Ladung heil angekommen: <b>${Math.round(c)} %</b>`, 'Neue Mission: <b>Ein interessanter Kontakt</b> (Schlossplatz)'] }; },
  });

  // =============================================================================================================
  // Mission 5 – Ein interessanter Kontakt
  // =============================================================================================================
  const FANCY = { '#7a1f2b': 'hemd', '#c8902e': 'jacke', '#5a6b3a': 'pulli' };
  // Schlossplatz: zwischen Ehrenburg und Landestheater
  const schlossplatz = S => {
    const e = S.lm('Schloss Ehrenburg') || { x: 203, z: 22 }, t = S.lm('Landestheater') || { x: 183, z: -147 };
    const p = { x: e.x * 0.55 + t.x * 0.45, z: e.z * 0.55 + t.z * 0.45 };
    return S.walkable(p.x, p.z, 30) || p;
  };
  StoryMissions.add({
    id: 'm05', title: 'Ein interessanter Kontakt', contact: 'voss', blurb: 'Ein Treffen am Schlossplatz.',
    marker: S => schlossplatz(S),
    stages: [
      { name: 'Dresscode', async run(M) {
        const S = M.S, G = S.G;
        const shirt = () => (G.save.outfit || {}).shirt;
        if (FANCY[shirt()]) return;
        await M.say({ who: 'leon', text: 'Lenz hat recht. In der Jacke lässt mich Voss nicht mal in die Nähe seines Autos.' });
        const v = S.venue('hm');
        const door = v ? { x: v.sx, z: v.sz } : { x: 52, z: -106 };
        S.world.setTarget(door.x, door.z, { r: 2.5, name: 'H&M' });
        M.objective('Kauf dir in der <b>Spitalgasse</b> ein <b>Hemd</b>, einen <b>Pullover</b> oder eine <b>Jacke</b> (Modeladen, <kbd>F</kbd>).');
        await M.wait(() => !!FANCY[shirt()]);
        S.world.clearTarget();
        await M.say({ who: 'leon', text: { hemd: 'Bordeaux. Mutig. Passt zu meinem Kontostand.', jacke: 'Ocker. Fällt auf. Genau richtig.', pulli: 'Grobstrick. Bodenständig. Fränkisch-seriös.' }[FANCY[shirt()]] });
      } },
      { name: 'Schlossplatz', async run(M) {
        const S = M.S, G = S.G;
        const sp = schlossplatz(S);
        const e = S.lm('Schloss Ehrenburg') || { x: sp.x + 20, z: sp.z };
        M.objective('Geh zum <b>Schlossplatz</b> vor der Ehrenburg.');
        if (Math.hypot(M.pos.x - sp.x, M.pos.z - sp.z) > 12) await M.goto(sp, { r: 8, name: 'Schlossplatz', text: 'Geh zum <b>Schlossplatz</b> vor der Ehrenburg.', foot: true });
        if (G.atmo.clock < 18.5 || G.atmo.clock > 21.5) G.atmo.clock = 19.2;   // Treffen am Abend
        const pl = P(S);
        const vp = S.walkable(sp.x + 2.2, sp.z + 1.4, 6) || sp, lp = S.walkable(sp.x + 3.6, sp.z - 0.4, 6) || sp;
        M.npc('voss', vp.x, vp.z, Math.atan2(e.x - vp.x, e.z - vp.z));
        M.npc('lenz', lp.x, lp.z, Math.atan2(pl.x - lp.x, pl.z - lp.z));
        M.sport = M.vehicle('sport', '#15161a', sp.x, sp.z);
        M.objective(null);
        const vy = pl.y;
        await M.cut([
          { pos: [vp.x + 7, vy + 1.2, vp.z - 4], look: [vp.x, vy + 1.6, vp.z], to: { pos: [vp.x + 3.4, vy + 1.6, vp.z - 1.6] }, dur: 5, fov: 40, fx: () => S.chars.face('voss', e.x, e.z) },
          Object.assign(S.cut.dialogShot(M.fig('voss').p, pl, 'close'), { dur: 2.8, fx: () => S.chars.face('voss', pl.x, pl.z) }),
        ], [{ who: 'voss', text: 'Schön, nicht wahr? Herzog Ernst hat hier Bälle gegeben. Heute parken hier Touristen.', dur: 4.2 }, { who: 'voss', text: 'Herr Berger. Pünktlich. Das ist selten geworden.', dur: 2.8 }]);
        const sh = FANCY[(G.save.outfit || {}).shirt];
        await M.talk([
          { who: 'voss', text: 'Richard Voss. Und Sie sind der Mann, der zwölf Kisten Kristall durch Coburg fährt, ohne dass Katharina einen Herzinfarkt bekommt.', mood: 'smug' },
          sh ? { who: 'voss', text: { hemd: 'Bordeaux. Eine Farbe für Menschen, die keine Angst haben, gesehen zu werden.', jacke: 'Ocker. Selbstbewusst. Ein wenig laut. Ich mag das.', pulli: 'Strick. Bodenständig. Das kommt in Coburg gut an.' }[sh], mood: 'neutral' } : { act: () => {} },
          { who: 'voss', text: 'Ich kannte Ihren Vater. Flüchtig. Ein ehrlicher Händler. Das Feuer damals … eine Tragödie.', mood: 'sad' },
          { who: 'leon', text: 'Sie kannten ihn?', mood: 'surprised' },
          { who: 'voss', text: 'Coburg ist klein, Herr Berger. Jeder kennt jeden. Die Frage ist nur, wer wen wie gut kennt.', mood: 'cold' },
          { choice: [
            { text: 'Respektvoll: „Danke für die Einladung, Herr Voss.“', note: 'Voss ▲', def: true, say: 'Danke für die Einladung, Herr Voss. Ich weiß das zu schätzen.', act: () => { M.flag('vossAttitude', 'resp'); M.rel('voss', 10); },
              then: [{ who: 'voss', text: 'Höflichkeit. Unterschätzt, aber unbezahlbar. Wir werden uns verstehen.', mood: 'happy' }] },
            { text: 'Frech: „Sie wollen was von mir. Was?“', note: 'Voss ▼ · Respekt', say: 'Lassen wir das Vorspiel. Sie wollen was von mir. Was?', mood: 'smug', act: () => { M.flag('vossAttitude', 'frech'); M.rel('voss', -5); },
              then: [{ who: 'voss', text: 'Direkt. Wie Ihr Vater. Er hat es damit nicht weit gebracht. Aber Sie sind jünger.', mood: 'cold' }] },
            { text: 'Neugierig: „Was ist das Quartier Itzaue?“', note: 'Infos', say: 'Ich hab Ihr Plakat am Markt gesehen. Was genau ist das Quartier Itzaue?', act: () => { M.flag('vossAttitude', 'neugierig'); M.rel('voss', 2); },
              then: [{ who: 'voss', text: 'Die Zukunft. Wohnungen für junge Familien, ein Hotel, Arbeitsplätze. Coburg schläft seit 1920. Ich wecke es.', mood: 'smug' },
                { who: 'voss', text: 'Natürlich gibt es immer Menschen, die lieber weiterschlafen.', mood: 'cold' }] },
          ] },
          { if: () => M.flags.readEnvelope, then: [
            { who: 'leon', text: '(Er weiß nicht, dass ich das Gutachten gelesen habe. Ganz ruhig bleiben.)', mood: 'worried', name: 'Leon (denkt)' },
          ] },
          { who: 'voss', text: 'Ich mache Ihnen einen Vorschlag. Fahren Sie mich nach Hause. Leopoldstraße. Mein Wagen.', mood: 'neutral' },
          { who: 'lenz', text: 'Richard, du kennst ihn seit drei Minuten.', mood: 'worried' },
          { who: 'voss', text: 'Und in zehn Minuten weiß ich alles über ihn. Wie jemand fährt, so lebt er. Ohne Kratzer, Herr Berger. Und ohne Polizei.', mood: 'smug' },
        ], { with: ['voss', 'lenz'] });
      } },
      { name: 'Die Probefahrt', async run(M) {
        const S = M.S, G = S.G;
        const sp = schlossplatz(S);
        if (!M.sport || M.sport.disposed || M.retry) { M.sport = M.vehicle('sport', '#15161a', sp.x, sp.z); if (M.retry) M.seat(M.sport); }
        const car = M.sport;
        if (!M.inCar(car)) {
          S.world.setTarget(car.x, car.z, { r: 3, name: 'Voss’ Wagen', beacon: false });
          M.objective('Steig in <b>Voss’ Sportwagen</b>.');
          await M.wait(() => M.inCar(car));
          S.world.clearTarget();
        }
        S.chars.remove('voss'); S.chars.remove('lenz');
        const villa = S.home('leopold');
        const goal = villa ? S.road(villa.sx, villa.sz, 120) : S.road(499, 103);
        M.goal = goal;
        let impT = 0, fastT = 0, bumps = 0, said = 0;
        M.watch(() => (car.health < 50 || car.wrecked || car.burning) ? 'Voss steigt aus. „Ich sagte: ohne Kratzer.“ Der Wagen ist ruiniert.' : null);
        M.watch(() => G.stars() > 0 ? 'Voss steigt an der nächsten Ampel aus. „Polizei ist schlecht fürs Geschäft, Herr Berger.“' : null);
        let outT = 0;
        M.watch(dt => { outT = M.inCar(car) ? 0 : outT + dt; return outT > 20 ? 'Man lässt einen Richard Voss nicht im Auto sitzen.' : null; });
        const hit = ['Das war ein Poller, Herr Berger. Poller stehen still. Das ist ihr einziger Vorteil.', 'Ich zähle mit.', 'Interessant. Sie bremsen mit der Karosserie.'];
        M.every(dt => {
          impT -= dt; fastT -= dt;
          if (!M.inCar(car)) return false;
          if (car.lastImpact > 3 && impT <= 0) { impT = 5; bumps++; M.say({ who: 'voss', text: hit[Math.min(bumps - 1, hit.length - 1)] }); }
          if (Math.abs(car.speed) * 3.6 > 85 && fastT <= 0) { fastT = 14; M.say({ who: 'voss', text: 'Wir sind nicht auf der Flucht, Herr Berger. Noch nicht.' }); }
          const t = M.stageT;
          if (said === 0 && t > 5) { said = 1; M.say([{ who: 'voss', text: 'Wissen Sie, was ich an Coburg liebe? Hier wird nichts vergessen. Gar nichts.' }, { who: 'leon', text: 'Klingt eher nach einer Drohung.' }, { who: 'voss', text: 'Nach einem Versprechen.' }]); }
          if (said === 1 && t > 35) { said = 2; M.say([{ who: 'voss', text: 'Ihr Freund Fischer. Laut, aber nützlich. Er spricht gut von Ihnen.' }, { who: 'leon', text: 'Sie kennen Max?' }, { who: 'voss', text: 'Ich sagte doch: Coburg ist klein.' }]); }
          M.bumps = bumps;
          return false;
        });
        await M.goto(goal, { r: 12, car, slow: 5, name: 'Villa Leopoldstraße', text: 'Fahr Voss zu seiner <b>Villa in der Leopoldstraße</b>. Ohne Kratzer.' });
        M.health = car.health;
      } },
      { name: 'Das Angebot', async run(M) {
        const S = M.S, G = S.G;
        const villa = S.home('leopold');
        const goal = M.goal || S.road(499, 103);
        await M.black(true, 500);
        const d = villa ? doorSpot(S, villa, 2.2) : goal;
        M.placePlayer(d.x, d.z);
        const vp = S.walkable(d.x + 1.5, d.z + 0.8, 4) || d;
        M.npc('voss', vp.x, vp.z, Math.atan2(P(S).x - vp.x, P(S).z - vp.z));
        if (G.atmo.clock < 20 || G.atmo.clock > 23) G.atmo.clock = 20.8;
        await M.black(false, 800);
        const bumps = M.bumps || 0, hp = M.health === undefined ? 100 : M.health;
        const clean = bumps === 0 && hp > 90;
        if (clean) M.rel('voss', 10); else if (bumps > 2) M.rel('voss', -5);
        await M.talk([
          clean ? { who: 'voss', text: 'Kein Kratzer. Keine rote Ampel. Kein Wort zu viel. Sie haben mich beeindruckt.', mood: 'happy' }
            : { who: 'voss', text: `${bumps} Berührungen. Ich bin nicht beeindruckt, aber ich bin auch nicht enttäuscht. Das ist bei mir viel.`, mood: 'cold' },
          { who: 'voss', text: 'Ich brauche jemanden, dem ich vertraue, Herr Berger. Einen Fahrer. Und einen Mann für … besondere Aufgaben.', mood: 'neutral' },
          { who: 'leon', text: 'Wie besonders?', mood: 'cold' },
          { who: 'voss', text: 'Pakete. Termine. Gespräche mit Menschen, die meine Anrufe nicht annehmen. Nichts, was ein intelligenter Mann nicht könnte.', mood: 'smug' },
          { who: 'voss', text: 'Fünftausend im Monat. Bar, wenn Sie wollen. Und eine Zukunft in dieser Stadt. Die hatten Sie bisher nicht.', mood: 'neutral' },
          { who: 'leon', text: '(Fünftausend. Damit wären die Schulden in einem Jahr weg. Aber Voss …)', mood: 'worried', name: 'Leon (denkt)' },
          { choice: [
            { text: '„Ich bin dabei.“', note: 'Voss ▲', say: 'Ich bin dabei.', act: () => { M.flag('vossAnswer', 'ja'); M.rel('voss', 5); },
              then: [{ who: 'voss', text: 'Ausgezeichnet. Katharina meldet sich. Willkommen in der Zukunft, Herr Berger.', mood: 'happy' }] },
            { text: '„Ich denk drüber nach.“', note: 'Vorsicht', def: true, say: 'Ich denk drüber nach.', act: () => M.flag('vossAnswer', 'bedenkzeit'),
              then: [{ who: 'voss', text: 'Tun Sie das. Aber denken Sie schnell. Gute Angebote haben in Coburg eine kurze Halbwertszeit.', mood: 'cold' }] },
          ] },
          { who: 'voss', text: 'Ach, und Herr Berger … grüßen Sie Ihren Freund Fischer von mir. Er weiß dann schon.', mood: 'smug' },
        ], { with: ['voss'] });
        S.chars.walkTo('voss', vp.x + (villa ? (villa.sx - vp.x) : 0), vp.z + (villa ? (villa.sz - vp.z) : 0), false, 4).then(() => S.chars.remove('voss'));
        await M.sleep(1.5);
        await M.say([{ who: 'leon', text: 'Max kennt Voss. Max hat mir nichts gesagt.', dur: 3 }, { who: 'leon', text: 'Fünftausend im Monat. Was kann da schon schiefgehen …', dur: 3.4 }]);
      } },
    ],
    reward: (S, M) => ({ money: 1000, lines: ['Handgeld von Richard Voss', 'Beziehung zu Voss: <b>' + S.rel.label(S.rel.get('voss')) + '</b>'] }),
    after: S => { S.hud.phone('sms', 'lenz', 'Herr Voss meldet sich. Halten Sie Ihr Telefon bereit. — K. Lenz', 8); },
  });
})();
