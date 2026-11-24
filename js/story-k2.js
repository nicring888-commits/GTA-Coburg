// Story-Modus (seit v3.23.0), Teil 4: Kapitel 2 „Neue Möglichkeiten“ – Missionen 6–10.
// Neue Bausteine aus js/story-core.js: driven/autoDrive (KI fährt Story-Autos), course (Prüfpunkte), giveCar (Garage).
// Handlung: STORY.md, Kapitel 2.
'use strict';

(() => {
  const P = S => S.G.player();
  const yOf = (S, x, z) => S.G.world.heightAt(x, z);
  const beside = (S, p, d = 9) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q = S.walkable(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); if (q && Math.hypot(q.x - p.x, q.z - p.z) > d - 2.5) return q; } return S.walkable(p.x, p.z, 15) || p; };
  const doorSpot = (S, h, out = 1) => S.walkable(h.sx + (h.ox || 0) * out, h.sz + (h.oz || 0) * out, 8) || { x: h.sx, z: h.sz };
  // Gehweg neben einem Auto (rechts), für Figuren, die aussteigen
  const carSide = (S, c, d = 2.2) => S.walkable(c.x + Math.cos(c.heading) * d, c.z - Math.sin(c.heading) * d, 4) || S.walkable(c.x - Math.cos(c.heading) * d, c.z + Math.sin(c.heading) * d, 6) || { x: c.x, z: c.z };
  // Speditionshof Kessler: Gewerbegebiet im Norden beim Autohändler
  const kesslerHof = S => S.road(-700, -1130, 250);
  // Bäckerei Hofmann in Ketschendorf (Süden, bei der Lackiererei Süd)
  const baeckerei = S => { const r = S.road(95, 705, 200); return S.walkable(r.x + 5, r.z + 3, 14) || r; };
  // Fehlschlag, wenn der Spieler ein voranfahrendes Auto zu lange aus den Augen verliert
  const keepUp = (M, ctl, who, maxGap = 220, secs = 12) => {
    let lost = 0;
    return M.watch(dt => {
      if (ctl.done || ctl.stopped) return null;
      if (ctl.gap > maxGap) { lost += dt; if (lost > 1 && lost - dt <= 1) M.G.ui.toast(`Du verlierst ${who}!`, 2); } else lost = 0;
      return lost > secs ? `Du hast ${who} aus den Augen verloren.` : null;
    });
  };
  // Leon braucht ein Auto in der Nähe: sonst eins hinstellen
  const ensureCar = (M, x, z, kind = 'kleinwagen', color = '#8a8f96') => {
    const G = M.G;
    if (M.mode === 'drive') return G.car();
    const near = G.parked.find(c => !c.wrecked && !c.burning && !c.storyDriven && Math.hypot(c.x - x, c.z - z) < 40);
    return near || M.vehicle(kind, color, x, z);
  };

  // =============================================================================================================
  // Mission 6 – Neue Wege
  // =============================================================================================================
  StoryMissions.add({
    id: 'm06', title: 'Neue Wege', contact: 'max', blurb: 'Max zeigt Leon „sein“ Coburg.',
    marker: S => { const h = S.home('lossau'); return h ? beside(S, doorSpot(S, h, 1), 7) : null; },
    stages: [
      { name: 'Abholung', async run(M) {
        const S = M.S, h = S.home('lossau');
        const base = beside(S, doorSpot(S, h, 1), 7);
        M.maxCar = M.driven('kleinwagen', '#e6b422', base.x, base.z);
        M.loaner = M.vehicle('kleinwagen', '#8a8f96', base.x + 6, base.z + 6);
        const mp = carSide(S, M.maxCar);
        M.npc('max', mp.x, mp.z, Math.atan2(P(S).x - mp.x, P(S).z - mp.z));
        await M.talk([
          { who: 'max', text: 'Guten Morgen, Herr Mieter! Na, wie schläft sich’s bei Kraus? Hat er dir schon die Ente gezeigt?', mood: 'laugh' },
          { who: 'leon', text: 'Helmut. Ja. Wir sind jetzt quasi befreundet.', mood: 'smug' },
          { who: 'max', text: 'Heute zeig ich dir MEIN Coburg. Die Leute, die man kennen muss, wenn man hier was werden will.', mood: 'happy' },
          { who: 'max', text: 'Tobi leiht dir seinen alten Kleinwagen. Der grüne da. Also, der war mal grün.', mood: 'neutral' },
          { if: () => M.flags.maxLoan, then: [
            { who: 'leon', text: 'Und meine 200?', mood: 'smug' },
            { who: 'max', text: 'Freitag. Hab ich gesagt. Ich hab nur nicht gesagt, welcher Freitag.', mood: 'smug' },
          ] },
          { who: 'max', text: 'Fahr mir nach. Und verlier mich nicht, ich fahr wie ein junger Gott.', mood: 'laugh' },
          { who: 'leon', text: 'Du fährst wie ein junger Rentner, Max.', mood: 'smug' },
        ], { with: ['max'] });
        S.chars.remove('max');
      } },
      { name: 'Albertsplatz', async run(M) {
        const S = M.S;
        const h = S.home('lossau'), base = beside(S, doorSpot(S, h, 1), 7);
        if (!M.maxCar || M.maxCar.disposed || M.retry) {
          M.maxCar = M.driven('kleinwagen', '#e6b422', base.x, base.z);
          M.loaner = ensureCar(M, base.x + 6, base.z + 6);
          if (M.retry) M.seat(M.loaner);
        }
        if (M.mode !== 'drive') {
          M.objective('Steig in ein <b>Auto</b> und folge Max.');
          if (M.loaner) S.world.setTarget(M.loaner.x, M.loaner.z, { r: 3, name: 'Tobis Kleinwagen', beacon: false });
          await M.wait(() => M.mode === 'drive');
          S.world.clearTarget();
        }
        const ap = S.lm('Albertsplatz') || { x: -128, z: 333 };
        const stop = S.road(ap.x, ap.z, 120);
        const ctl = M.autoDrive(M.maxCar, stop, { speed: 14, lead: true });
        keepUp(M, ctl, 'Max');
        M.objective('Folge <b>Max</b>.');
        S.world.setTarget(stop.x, stop.z, { r: 1, name: 'Max', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T && !ctl.done) { T.x = M.maxCar.x; T.z = M.maxCar.z; } return ctl.done; });
        M.call('max', [
          { who: 'max', text: 'Freisprechanlage! Hörst du mich? Ich hab mir die gegönnt. Für 19,99.' },
          { who: 'leon', text: 'Du rauschst wie ein Kofferradio.' },
          { who: 'max', text: 'Das ist Stereo, Alter.' },
        ]);
        await ctl.arrive();
        S.world.clearTarget();
        M.objective('Park in der Nähe und geh zu <b>Max</b>.');
        await M.wait(() => M.mode === 'walk' && Math.hypot(P(S).x - M.maxCar.x, P(S).z - M.maxCar.z) < 18);
        const mp = carSide(S, M.maxCar), gp = S.walkable(mp.x + 1.4, mp.z + 1.2, 5) || mp;
        M.npc('max', mp.x, mp.z, 0);
        M.npc('gul', gp.x, gp.z, 0);
        M.gulTaxi = M.vehicle('taxi', '#efe6c4', gp.x + 4, gp.z + 4);
        await M.interact('max', 'Zu Max');
        await M.talk([
          { who: 'max', text: 'Darf ich vorstellen: Gül. Die beste Taxifahrerin Oberfrankens und mein Büro.', mood: 'happy' },
          { who: 'gul', text: 'Ich bin nicht dein Büro, Max. Ich bin die, bei der du deinen Kaffee anschreiben lässt.', mood: 'smug' },
          { who: 'gul', text: 'Du bist der Berger-Junge? Ich hab deinen Vater früher oft gefahren. Vom Autohaus zum Ratskeller und zurück. Netter Mann. Großes Trinkgeld.', mood: 'happy' },
          { who: 'leon', text: 'Großes Trinkgeld, kleines Konto. Das war Papa.', mood: 'sad' },
          { who: 'gul', text: 'Wenn du mal was wissen willst in Coburg – frag eine Taxifahrerin. Wir sehen alles. Wer wann wo aussteigt. Und mit wem.', mood: 'smug' },
          { who: 'max', text: 'Gül hat ein fotografisches Gedächtnis. Und eine Dashcam.', mood: 'laugh' },
          { who: 'gul', text: 'Die Dashcam ist legal, Max. Im Gegensatz zu deinen Geschäften.', mood: 'cold' },
          { act: () => M.flag('metGul') },
          { who: 'max', text: 'Weiter, weiter! Nächster Halt: Ketschengasse.', mood: 'happy' },
        ], { with: ['max', 'gul'] });
        S.chars.remove('max');
      } },
      { name: 'Ketschengasse', async run(M) {
        const S = M.S;
        const ap = S.lm('Albertsplatz') || { x: -128, z: 333 };
        if (!M.maxCar || M.maxCar.disposed || M.retry) {
          const s0 = S.road(ap.x, ap.z, 120);
          M.maxCar = M.driven('kleinwagen', '#e6b422', s0.x, s0.z);
          if (M.retry) { M.loaner = ensureCar(M, s0.x + 8, s0.z + 8); M.seat(M.loaner); }
        }
        if (M.mode !== 'drive') { M.objective('Steig wieder ein und folge <b>Max</b>.'); await M.wait(() => M.mode === 'drive'); }
        const kh = S.home('ketschen'), kg = kh ? S.road(kh.sx, kh.sz, 120) : S.road(-35, 251);
        const ctl = M.autoDrive(M.maxCar, kg, { speed: 13, lead: true });
        keepUp(M, ctl, 'Max');
        M.objective('Folge <b>Max</b> in die Ketschengasse.');
        S.world.setTarget(kg.x, kg.z, { r: 1, name: 'Max', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T && !ctl.done) { T.x = M.maxCar.x; T.z = M.maxCar.z; } return ctl.done; });
        M.every(() => { if (M.stageT > 12) { M.say([{ who: 'max', text: 'Jetzt kommt Rocco. Sag nix über seine Frisur. Und kauf nix von ihm.', dur: 4 }, { who: 'leon', text: 'Warum nicht?', dur: 2 }, { who: 'max', text: 'Weil’s meistens schon jemandem gehört.', dur: 3 }]); return true; } return false; });
        await ctl.arrive();
        S.world.clearTarget();
        M.objective('Steig aus und geh zu <b>Max</b>.');
        await M.wait(() => M.mode === 'walk' && Math.hypot(P(S).x - M.maxCar.x, P(S).z - M.maxCar.z) < 18);
        const mp = carSide(S, M.maxCar), rp = S.walkable(mp.x - 1.5, mp.z + 1.3, 5) || mp;
        M.npc('max', mp.x, mp.z, 0);
        M.npc('rocco', rp.x, rp.z, 0);
        await M.interact('rocco', 'Zu Rocco');
        await M.talk([
          { who: 'rocco', text: 'Maxi! Und wer ist der Schönling? Neuer Kunde?', mood: 'smug' },
          { who: 'max', text: 'Leon. Alter Freund. Vertrauenswürdig. Halbwegs.', mood: 'happy' },
          { who: 'rocco', text: 'Leon. Ich hab Uhren, Handys, Navis, Felgen. Alles fast neu. Garantie bis zur nächsten Ecke.', mood: 'smug' },
          { who: 'leon', text: 'Danke, ich hab schon eine Uhr.', mood: 'smug' },
          { who: 'rocco', text: 'Noch.', mood: 'laugh' },
          { who: 'rocco', text: 'Und Max – Dragan war gestern da. Er hat nach dir gefragt. Ich hab gesagt, ich kenn keinen Max.', mood: 'cold' },
          { who: 'max', text: 'Haha. Dragan. Der Witzbold. Alles geklärt, alles bestens.', mood: 'worried' },
          { who: 'leon', text: 'Wer ist Dragan?', mood: 'cold' },
          { who: 'max', text: 'Niemand! Ein Kumpel. Ein … Geschäftskumpel. Weiter jetzt, wir haben einen Termin am Bahnhof.', mood: 'worried' },
          { who: 'rocco', text: 'Wenn du mal Ware brauchst, die keine Fragen stellt, Leon – du weißt, wo ich steh.', mood: 'smug' },
          { act: () => M.flag('metRocco') },
        ], { with: ['rocco', 'max'] });
        S.chars.remove('max'); S.chars.remove('rocco');
      } },
      { name: 'Schließfach', async run(M) {
        const S = M.S, G = S.G;
        const kh = S.home('ketschen'), kg = kh ? S.road(kh.sx, kh.sz, 120) : S.road(-35, 251);
        if (!M.maxCar || M.maxCar.disposed || M.retry) {
          M.maxCar = M.driven('kleinwagen', '#e6b422', kg.x, kg.z);
          if (M.retry) { M.loaner = ensureCar(M, kg.x + 8, kg.z + 8); M.seat(M.loaner); }
        }
        if (M.mode !== 'drive') { M.objective('Steig wieder ein und folge <b>Max</b>.'); await M.wait(() => M.mode === 'drive'); }
        const sp = G.spawn, st = S.road(sp.roadX, sp.roadZ, 60);
        const ctl = M.autoDrive(M.maxCar, st, { speed: 15, lead: true });
        keepUp(M, ctl, 'Max');
        M.objective('Folge <b>Max</b> zum Bahnhof.');
        S.world.setTarget(st.x, st.z, { r: 1, name: 'Max', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T && !ctl.done) { T.x = M.maxCar.x; T.z = M.maxCar.z; } return ctl.done; });
        await ctl.arrive();
        S.world.clearTarget();
        // Max geht zu den Schließfächern im Bahnhof
        const locker = S.walkable(sp.x + (sp.x - sp.roadX) * 0.4, sp.z + (sp.z - sp.roadZ) * 0.4, 10) || { x: sp.x, z: sp.z };
        const mp = carSide(S, M.maxCar);
        M.npc('max', mp.x, mp.z, 0);
        S.chars.walkTo('max', locker.x, locker.z, false, 25);
        M.objective('Steig aus und geh Max hinterher.');
        await M.wait(() => M.mode === 'walk');
        S.world.setTarget(locker.x, locker.z, { r: 3, name: 'Schließfächer' });
        await M.wait(() => Math.hypot(P(S).x - locker.x, P(S).z - locker.z) < 4.5);
        S.world.clearTarget();
        await M.talk([
          { who: 'leon', text: 'Ein Schließfach? Ernsthaft? Was bist du, ein Agent?', mood: 'smug' },
          { who: 'max', text: 'Moment! Nicht gucken. … Okay, jetzt.', mood: 'worried' },
          { who: 'leon', text: 'Das ist ein Umschlag. Ein dicker.', mood: 'surprised' },
          { who: 'max', text: 'Das? Nix. Anzahlung. Für den Zapfen-Express. Investoren, Leon! Ich hab Investoren!', mood: 'happy' },
          { if: () => M.flags.maxLoan, then: [
            { who: 'max', text: 'Hier. Deine 200. Siehste? Freitag. Ist zwar Dienstag, aber Freitag im Herzen.', mood: 'laugh', fx: () => { G.addMoney(200); M.flag('maxRepaid'); } },
          ] },
          { who: 'leon', text: '(Investoren. Für Bratwurst-Drohnen. Im Schließfach am Bahnhof.)', name: 'Leon (denkt)', mood: 'worried' },
          { choice: [
            { text: 'Nachhaken: „Von wem ist das Geld, Max?“', note: 'Max ▼', say: 'Max. Von wem ist das Geld?', act: () => { M.flag('askedEnvelope', true); M.rel('max', -5); },
              then: [{ who: 'max', text: 'Mann, Leon! Du klingst wie meine Mutter. Es ist sauber. Okay? Sauber genug.', mood: 'angry' }, { who: 'max', text: '… Tut mir leid. Lass uns einfach was essen gehen.', mood: 'sad' }] },
            { text: 'Gut sein lassen: „Deine Sache.“', note: 'Max ▲', def: true, say: 'Deine Sache. Aber wenn du Ärger hast, sagst du’s mir.', act: () => { M.flag('askedEnvelope', false); M.rel('max', 5); },
              then: [{ who: 'max', text: 'Ärger? Ich? Ich bin der entspannteste Mensch Oberfrankens.', mood: 'laugh' }] },
          ] },
          { who: 'max', text: 'Übrigens, diese Lenz hat angerufen. Voss hat einen Job für dich. Einen großen. Ruf sie zurück!', mood: 'happy' },
        ], { with: ['max'] });
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Neue Kontakte: <b>Gül</b> (Taxi), <b>Rocco</b> (Hehler)', S.state.flags.maxRepaid ? 'Max hat dir die € 200 zurückgezahlt' : '', 'Neue Mission: <b>Gute Geschäfte</b> (Villa Leopoldstraße)'].filter(Boolean) }),
  });

  // =============================================================================================================
  // Mission 7 – Gute Geschäfte
  // =============================================================================================================
  const PICKUPS = S => [
    { name: 'Penthouse am Glockenberg', kind: 'sport', color: '#c8c8d0', at: (() => { const h = S.home('glocken'); return h ? S.road(h.sx, h.sz, 120) : S.road(254, 170); })() },
    { name: 'Autohaus Coburg Süd', kind: 'cabrio', color: '#7a1f2b', at: (() => { const c = S.carShop('Autohaus Coburg Süd'); return c ? S.road(c.x, c.z, 120) : S.road(-289, 740); })() },
    { name: 'Albertsplatz', kind: 'suv', color: '#15161a', at: (() => { const a = S.lm('Albertsplatz') || { x: -128, z: 333 }; return S.road(a.x, a.z, 120); })() },
  ];
  StoryMissions.add({
    id: 'm07', title: 'Gute Geschäfte', contact: 'voss', blurb: 'Der erste echte Auftrag für Voss.',
    marker: S => { const h = S.home('leopold'); return h ? beside(S, doorSpot(S, h, 1.5), 6) : null; },
    stages: [
      { name: 'Der Auftrag', async run(M) {
        const S = M.S, h = S.home('leopold');
        const lp = doorSpot(S, h, 1.2);
        M.npc('lenz', lp.x, lp.z, Math.atan2(P(S).x - lp.x, P(S).z - lp.z));
        await M.talk([
          { who: 'lenz', text: 'Herr Berger. Herr Voss ist in einem Termin. Ich habe die Details.', mood: 'neutral' },
          { who: 'lenz', text: 'Drei Fahrzeuge aus Kundenbesitz. Sie holen sie ab und bringen sie zum Speditionshof Kessler im Norden. Von dort gehen sie ins Ausland.', mood: 'neutral' },
          { who: 'leon', text: 'Kunden. Ausland. Klingt nach einem sehr seriösen Geschäftsmodell.', mood: 'smug' },
          { who: 'lenz', text: 'Export von Gebrauchtwagen ist legal, Herr Berger. Und gut bezahlt. Fünfhundert pro Wagen. Abzüge für Kratzer.', mood: 'cold' },
          { who: 'lenz', text: 'Die Schlüssel stecken. Fragen Sie niemanden etwas, und niemand fragt Sie etwas.', mood: 'cold' },
          { who: 'leon', text: 'Kessler … Jürgen Kessler?', mood: 'surprised' },
          { who: 'lenz', text: 'Kennen Sie ihn?', mood: 'cold' },
          { who: 'leon', text: '(Jürgen. Mein alter Partner aus Nürnberg. Das kann kein Zufall sein.) Nein. Ein häufiger Name.', mood: 'worried' },
        ], { with: ['lenz'] });
        S.chars.remove('lenz');
        M.state7 = { delivered: 0, pay: 0 };
      } },
      ...[0, 1, 2].map(i => ({ name: 'Wagen ' + (i + 1), async run(M) {
        const S = M.S, G = S.G, list = PICKUPS(S), job = list[i];
        M.state7 = M.state7 || { delivered: i, pay: 0 };
        const hof = kesslerHof(S);
        // Wiederholen: Leon steht beim Abholort
        if (M.retry || i > 0) { const q = beside(S, job.at, 14); M.placePlayer(q.x, q.z); }
        const car = M.vehicle(job.kind, job.color, job.at.x, job.at.z);
        M.say({ who: 'leon', text: ['Erster Wagen. Mal sehen, was Voss so „exportiert“.', 'Ein Cabrio aus dem Autohaus. „Kundenbesitz.“ Klar.', 'Der letzte. Ein Geländewagen mit getönten Scheiben. Natürlich.'][i] });
        S.world.setTarget(car.x, car.z, { r: 3, name: job.name });
        M.objective(`Hol den Wagen beim <b>${job.name}</b> ab (${i + 1}/3).`);
        await M.wait(() => M.inCar(car));
        S.world.clearTarget();
        M.timer(200, 'Zu spät. Der Lkw nach Osteuropa ist ohne den Wagen abgefahren.');
        M.watch(() => (car.wrecked || car.burning || car.health <= 0) ? 'Der Wagen ist Schrott. Voss wird das nicht gefallen.' : null);
        M.watch(() => G.stars() > 2 ? 'Mit der halben Polizei im Schlepptau fährt man nicht zu Kessler.' : null);
        let outT = 0;
        M.watch(dt => { outT = M.inCar(car) ? 0 : outT + dt; return outT > 45 ? 'Du hast den Wagen stehen lassen.' : null; });
        if (i === 1) M.every(() => { if (M.stageT > 25) { M.call('max', [{ who: 'max', text: 'Und? Fühlst du dich schon reich?' }, { who: 'leon', text: 'Ich fühl mich wie ein Autodieb mit Arbeitsvertrag.' }, { who: 'max', text: 'Das ist in Coburg quasi ein Beamtenstatus.' }]); return true; } return false; });
        await M.goto(hof, { r: 14, car, slow: 5, name: 'Speditionshof Kessler', text: `Bring den Wagen zum <b>Speditionshof Kessler</b> (${i + 1}/3).`, tall: true });
        M.stopTimer();
        const hp = car.health, pay = Math.round(500 * (0.5 + 0.5 * hp / 100) / 10) * 10;
        M.state7.pay += pay; M.state7.delivered = i + 1;
        if (i === 0) {
          G.exitCar();
          const dp = beside(S, hof, 5);
          M.npc('dragan', dp.x, dp.z, Math.atan2(P(S).x - dp.x, P(S).z - dp.z));
          await M.talk([
            { who: 'dragan', text: 'Du bist der Neue. Berger.', mood: 'cold' },
            { who: 'leon', text: 'Und du bist …', mood: 'neutral' },
            { who: 'dragan', text: 'Der, der die Wagen zählt. Und die Leute, die sie fahren.', mood: 'cold' },
            hp < 80 ? { who: 'dragan', text: 'Kratzer an der Stoßstange. Das geht von deinem Geld ab. Beim nächsten Mal von deinen Zähnen.', mood: 'angry' }
              : { who: 'dragan', text: 'Sauber. Gut. Voss mag sauber.', mood: 'neutral' },
            { who: 'leon', text: 'Wo ist Kessler? Ich dachte, das ist sein Hof.', mood: 'cold' },
            { who: 'dragan', text: 'Herr Kessler macht Papierkram. Du machst Autos. Nächster Wagen. Ich fahr dich hin.', mood: 'cold' },
          ], { with: ['dragan'] });
          S.chars.remove('dragan');
          M.flag('metDragan');
        } else if (i === 1) {
          G.exitCar();
          M.say({ who: 'dragan', text: 'Zwei. Einer noch. Und lass das Radio aus, das stellt keiner gern zurück.' });
        }
        if (i < 2) { await M.black(true, 500); M.title('', 'Dragan setzt dich ab', '', 2.2); await M.sleep(1.2); M.black(false, 700); }
      } })),
      { name: 'Abrechnung', async run(M) {
        const S = M.S, G = S.G;
        if (M.mode === 'drive') G.exitCar();
        const hof = kesslerHof(S), dp = beside(S, hof, 5);
        M.npc('dragan', dp.x, dp.z, Math.atan2(P(S).x - dp.x, P(S).z - dp.z));
        const pay = (M.state7 && M.state7.pay) || 1200;
        M.pay7 = pay;
        await M.talk([
          { who: 'dragan', text: `Drei Wagen. ${pay} Euro. Zähl nach, wenn du willst. Ich zähl nur einmal.`, mood: 'cold' },
          { who: 'leon', text: 'Was ist in den Wagen, dass sie über die Grenze müssen?', mood: 'cold' },
          { who: 'dragan', text: 'Räder. Lenkrad. Sitze. Und eine Menge Fragen, die du nicht stellst.', mood: 'smug' },
          { who: 'dragan', text: 'Du bist schlau, Berger. Schlaue Leute leben in Coburg lange. Neugierige nicht.', mood: 'cold' },
          { who: 'leon', text: '(Im Büro hinten brennt Licht. Auf der Tür: „J. Kessler – Geschäftsführer“. Jürgen ist hier. Irgendwo.)', name: 'Leon (denkt)', mood: 'worried' },
        ], { with: ['dragan'] });
      } },
    ],
    reward: (S, M) => { S.rel.add('voss', 8); return { money: M.pay7 || 1200, lines: ['Drei Wagen beim Speditionshof Kessler abgeliefert', 'Neuer Kontakt: <b>Dragan</b>', 'Neue Mission: <b>Auf vier Rädern</b> (Kfz Weber)'] }; },
    after: S => { S.hud.phone('sms', 'lenz', 'Herr Voss ist zufrieden. Ihr Dienstwagen steht bei Herrn Weber bereit. — K. Lenz', 8); },
  });

  // =============================================================================================================
  // Mission 8 – Auf vier Rädern
  // =============================================================================================================
  StoryMissions.add({
    id: 'm08', title: 'Auf vier Rädern', contact: 'tobi', blurb: 'Ein eigener Wagen – fast.',
    marker: S => { const w = S.workshop(); return w && beside(S, w); },
    stages: [
      { name: 'Der Dienstwagen', async run(M) {
        const S = M.S, w = S.workshop(), base = beside(S, w);
        const tp = S.walkable(base.x + 1.5, base.z, 4) || base;
        M.npc('tobi', tp.x, tp.z, Math.atan2(P(S).x - tp.x, P(S).z - tp.z));
        M.dienst = M.vehicle('sport', '#1f3a6b', w.x, w.z);
        await M.talk([
          { who: 'tobi', text: 'Da ist er. Voss’ „Dienstwagen“. Hat mir eine Frau mit Klemmbrett gebracht. Wortlos.', mood: 'neutral' },
          { who: 'leon', text: 'Lenz. Sie redet nur, wenn es Geld kostet.', mood: 'smug' },
          { who: 'tobi', text: 'Schönes Auto. Aber: abgefahrene Reifen, der Auspuff klingt wie mein Rasenmäher, und im Kofferraum war ein GPS-Sender.', mood: 'cold' },
          { who: 'leon', text: 'Ein Sender?', mood: 'surprised' },
          { who: 'tobi', text: 'Lag lose drin. Vielleicht vergessen. Vielleicht nicht. Ich hab ihn in die Schublade gelegt. Da sendet er jetzt Schraubenzieher.', mood: 'smug' },
          { who: 'tobi', text: 'Wenn das dein Auto wird, machen wir’s richtig. Ich brauch neue Reifen vom Autohaus Coburg Süd und einen Sportauspuff vom Autohändler. Nimm den Kleinbus.', mood: 'neutral' },
          { who: 'leon', text: 'Du schickst mich einkaufen.', mood: 'smug' },
          { who: 'tobi', text: 'Ich schick dich lernen. Dein Vater hat mich auch immer Teile holen lassen. Am ersten Tag dreimal den Kolbenschmierer.', mood: 'laugh' },
          { who: 'leon', text: 'Den gibt’s nicht.', mood: 'neutral' },
          { who: 'tobi', text: 'Hab ich am dritten Tag auch gemerkt.', mood: 'laugh' },
        ], { with: ['tobi'] });
      } },
      { name: 'Teile holen', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        if (M.retry) { const q = beside(S, w, 10); M.placePlayer(q.x, q.z); }
        M.van = M.vehicle('van', '#f4f4f4', w.x + 4, w.z + 4);
        if (!M.dienst || M.dienst.disposed) M.dienst = M.vehicle('sport', '#1f3a6b', w.x, w.z);
        S.world.setTarget(M.van.x, M.van.z, { r: 3, name: 'Kleinbus', beacon: false });
        M.objective('Nimm Tobis <b>Kleinbus</b>.');
        await M.wait(() => M.inCar(M.van));
        S.world.clearTarget();
        M.watch(() => (M.van.wrecked || M.van.burning) ? 'Der Kleinbus ist hinüber. Tobi braucht ihn morgen für eine Beerdigung. Fahrzeugtechnisch.' : null);
        const cs = S.carShop('Autohaus Coburg Süd') || { x: -289, z: 740 };
        const shopPt = S.road(cs.x, cs.z, 120);
        await M.goto(shopPt, { r: 12, name: 'Autohaus Coburg Süd', text: 'Hol die <b>Reifen</b> beim Autohaus Coburg Süd.' });
        const dp1 = S.walkable(cs.x, cs.z, 10) || shopPt;
        S.world.setTarget(dp1.x, dp1.z, { r: 2.5, name: 'Teileausgabe' });
        M.objective('Steig aus und hol die <b>Reifen</b> an der Teileausgabe.');
        await M.interact(dp1, 'Reifen abholen', 2.8);
        S.world.clearTarget();
        await M.say([{ name: 'Verkäufer', text: 'Vier Sportreifen für Herrn Weber. Auf Rechnung Voss. Der Herr Voss zahlt immer pünktlich. Fast unheimlich.', dur: 4.5 }, { who: 'leon', text: 'Unheimlich pünktlich. Das passt zu ihm.', dur: 3 }]);
        const dl = S.dealer(1) || { x: 112, z: 1129 };
        await M.goto({ x: dl.x, z: dl.z }, { r: 12, name: 'Autohändler', text: 'Hol den <b>Sportauspuff</b> beim Autohändler.' });
        const dp2 = S.walkable(dl.x + 4, dl.z + 4, 10) || dl;
        S.world.setTarget(dp2.x, dp2.z, { r: 2.5, name: 'Händler' });
        M.objective('Steig aus und hol den <b>Auspuff</b>.');
        await M.interact(dp2, 'Auspuff abholen', 2.8);
        S.world.clearTarget();
        await M.say([{ name: 'Händler', text: 'Ein Sportauspuff für einen Sportwagen von Voss? Junge, pass auf, dass du nicht der nächste Auspuff wirst.', dur: 4.5 }, { who: 'leon', text: 'Hier sind heute alle so ermutigend.', dur: 3 }]);
        await M.goto(S.road(w.x, w.z, 60), { r: 12, car: M.van, name: 'Kfz Weber', text: 'Bring die Teile zu <b>Tobi</b>.' });
      } },
      { name: 'Probefahrt', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        await M.black(true, 500);
        if (M.mode === 'drive') G.exitCar();
        if (!M.dienst || M.dienst.disposed) M.dienst = M.vehicle('sport', '#1f3a6b', w.x, w.z);
        M.dienst.health = 100;
        const q = carSide(S, M.dienst, 2.5); M.placePlayer(q.x, q.z);
        const tp = S.walkable(q.x + 1.4, q.z + 0.6, 4) || q;
        M.npc('tobi', tp.x, tp.z, Math.atan2(P(S).x - tp.x, P(S).z - tp.z));
        M.title('', 'Zwei Stunden später …', '', 2.6);
        await M.sleep(1.2);
        M.black(false, 800);
        await M.talk([
          { who: 'tobi', text: 'Fertig. Neue Reifen, neuer Auspuff, Fahrwerk eingestellt. Und kein Sender mehr. Hör mal.', mood: 'happy' },
          { who: 'leon', text: 'Der klingt … wütend.', mood: 'surprised' },
          { who: 'tobi', text: 'Der klingt ehrlich. Komm, Probefahrt. Ich fahr mit. Theater, Schloss, Albertsplatz und zurück. Ich stopp die Zeit.', mood: 'smug' },
        ], { with: ['tobi'] });
        const car = M.dienst;
        S.world.setTarget(car.x, car.z, { r: 3, name: 'Dein Dienstwagen', beacon: false });
        M.objective('Steig in deinen <b>Dienstwagen</b>.');
        await M.wait(() => M.inCar(car));
        S.world.clearTarget();
        S.chars.hide('tobi');
        const lt = S.lm('Landestheater') || { x: 183, z: -147 }, eh = S.lm('Schloss Ehrenburg') || { x: 203, z: 22 }, ap = S.lm('Albertsplatz') || { x: -128, z: 333 };
        const pts = [S.road(lt.x, lt.z, 120), S.road(eh.x, eh.z, 120), S.road(ap.x, ap.z, 120), S.road(w.x, w.z, 60)];
        M.watch(() => (car.wrecked || car.burning || car.health < 30) ? 'Tobi: „Zwei Stunden Arbeit. Zwei Minuten bis zum Schrott.“' : null);
        let impT = 0;
        M.every(dt => { impT -= dt; if (M.inCar(car) && car.lastImpact > 4 && impT <= 0) { impT = 5; M.say({ who: 'tobi', text: ['Das war mein Fahrwerk! MEIN Fahrwerk!', 'Bordsteine sind keine Rampen, Leon.', 'Ich hör das Geld knirschen.'][Math.floor(Math.random() * 3)] }); } return false; });
        M.every(() => { if (M.stageT > 15) { M.say([{ who: 'tobi', text: 'Dein Vater ist die Strecke auch immer gefahren. Jeden Samstag, mit offenem Fenster. Ganz Coburg wusste: der Günter ist unterwegs.', dur: 5 }, { who: 'leon', text: 'Ich weiß. Ich saß hinten und hab mich geschämt.', dur: 3.4 }, { who: 'tobi', text: 'Und heute?', dur: 1.8 }, { who: 'leon', text: 'Heute würd ich alles geben, um wieder hinten zu sitzen.', dur: 3.6 }]); return true; } return false; });
        const t = await M.course(pts, { car, text: 'Probefahrt: Fahr durch die <b>Prüfpunkte</b>', name: 'Prüfpunkt' });
        M.time8 = t;
        G.exitCar();
        const medal = t < 150 ? 'Gold' : t < 200 ? 'Silber' : 'Bronze';
        M.medal8 = medal;
        const pq = S.walkable(P(S).x + 1.5, P(S).z + 0.6, 4) || P(S);
        S.chars.remove('tobi'); M.npc('tobi', pq.x, pq.z, Math.atan2(P(S).x - pq.x, P(S).z - pq.z));
        await M.talk([
          { who: 'tobi', text: `${Math.floor(t / 60)} Minuten ${Math.round(t % 60)} Sekunden. ${medal === 'Gold' ? 'Respekt. Das hätte dein Vater nicht geschafft. Sag ihm das nicht.' : medal === 'Silber' ? 'Ordentlich. Für einen Nürnberger.' : 'Meine Oma fährt schneller. Und die hat keinen Führerschein.'}`, mood: medal === 'Bronze' ? 'smug' : 'happy' },
          { who: 'tobi', text: 'Pass auf dich auf mit dem Ding. Und mit dem, der’s dir geschenkt hat. Geschenke von Voss haben immer ein Preisschild. Man sieht’s nur nicht gleich.', mood: 'worried' },
          { who: 'leon', text: 'Ich weiß, Tobi.', mood: 'neutral' },
          { who: 'tobi', text: 'Weißt du nicht. Aber du wirst’s lernen. Wie den Kolbenschmierer.', mood: 'smug' },
        ], { with: ['tobi'] });
      } },
    ],
    reward: (S, M) => {
      const rec = M.giveCar('sport', '#1f3a6b', 'Dienstwagen von Voss');
      if (M.dienst && rec && !M.dienst.disposed) { M.dienst.ownedId = rec.id; M.dienst.story = null; S.G.property.out && S.G.property.out.set(rec.id, M.dienst); M.cars = M.cars.filter(c => c !== M.dienst); }
      const m = M.medal8 || 'Bronze';
      S.rel.add('tobi', m === 'Gold' ? 10 : m === 'Silber' ? 6 : 2);
      return { money: m === 'Gold' ? 500 : m === 'Silber' ? 250 : 100, lines: [`Probefahrt: <b>${m}</b> (${Math.floor((M.time8 || 0) / 60)}:${String(Math.round((M.time8 || 0) % 60)).padStart(2, '0')})`, rec ? 'Neues Auto in der Garage: <b>Dienstwagen (Sportwagen)</b>' : 'Garage voll – Dienstwagen steht vor der Werkstatt', 'Neue Mission: <b>Unter Geschäftsleuten</b> (Landestheater)'] };
    },
  });

  // =============================================================================================================
  // Mission 9 – Unter Geschäftsleuten
  // =============================================================================================================
  const theater = S => { const t = S.lm('Landestheater') || { x: 183, z: -147 }, e = S.lm('Schloss Ehrenburg') || { x: 203, z: 22 }; return S.walkable(t.x + (e.x - t.x) * 0.18, t.z + (e.z - t.z) * 0.18, 30) || t; };
  StoryMissions.add({
    id: 'm09', title: 'Unter Geschäftsleuten', contact: 'voss', blurb: 'Ein Empfang im Landestheater.',
    marker: S => theater(S),
    stages: [
      { name: 'Der Empfang', async run(M) {
        const S = M.S, G = S.G, c = theater(S), pl = P(S);
        if (G.atmo.clock < 19 || G.atmo.clock > 23) G.atmo.clock = 20.2;
        // Gruppen auf dem Vorplatz
        const spot = (dx, dz) => S.walkable(c.x + dx, c.z + dz, 8) || c;
        const a = spot(7, 2), b = spot(-6, 5), d = spot(2, -9);
        M.groups = { a, b, d };
        M.npc('voss', c.x + 1.4, c.z + 0.6, Math.atan2(pl.x - c.x, pl.z - c.z));
        M.npc('lenz', c.x + 2.4, c.z - 0.6, Math.atan2(pl.x - c.x, pl.z - c.z));
        M.npc('brandt', a.x, a.z, 0); M.npc('hellmuth', a.x + 1.3, a.z + 0.4, 0);
        S.chars.face('brandt', a.x + 1.3, a.z + 0.4); S.chars.face('hellmuth', a.x, a.z);
        M.npc('max', spot(-2, -3).x, spot(-2, -3).z, 0);
        await M.talk([
          { who: 'voss', text: 'Herr Berger. Willkommen in der Gesellschaft. Champagner, Kanapees und Menschen, die sich gegenseitig belügen. Fühlen Sie sich wie zu Hause.', mood: 'smug' },
          { who: 'voss', text: 'Dort drüben: Stadtrat Brandt und Herr Hellmuth von der Sparkasse. Ohne die beiden baut in Coburg niemand eine Hundehütte.', mood: 'neutral' },
          { who: 'voss', text: 'Bleiben Sie in der Nähe, hören Sie zu, lächeln Sie. Ich möchte wissen, was man über mich redet, wenn ich nicht dabei bin.', mood: 'cold' },
          { who: 'leon', text: 'Sie wollen, dass ich Ihre eigenen Gäste belausche.', mood: 'smug' },
          { who: 'voss', text: 'Ich will, dass Sie lernen, Herr Berger. Wer zuhört, gewinnt.', mood: 'smug' },
          { who: 'max', text: 'Und ich mach die Fotos! Voss hat mich als Fotografen gebucht! Ich hab eine Kamera mit sechsfachem Zoom!', mood: 'laugh', to: 'leon' },
          { who: 'lenz', text: 'Der Zoom ist digital, Herr Fischer.', mood: 'cold' },
        ], { with: ['voss', 'lenz', 'max'] });
        S.chars.walkTo('voss', d.x, d.z, false, 12); S.chars.walkTo('lenz', d.x + 1.2, d.z + 0.5, false, 12);
      } },
      { name: 'Zuhören', async run(M) {
        const S = M.S, G = S.G;
        const c = theater(S), g = M.groups || { a: S.walkable(c.x + 7, c.z + 2, 8), b: S.walkable(c.x - 6, c.z + 5, 8), d: S.walkable(c.x + 2, c.z - 9, 8) };
        if (M.retry) {
          if (G.atmo.clock < 19 || G.atmo.clock > 23) G.atmo.clock = 20.2;
          M.npc('brandt', g.a.x, g.a.z, 0); M.npc('hellmuth', g.a.x + 1.3, g.a.z + 0.4, 0);
          M.npc('voss', g.d.x, g.d.z, 0); M.npc('lenz', g.d.x + 1.2, g.d.z + 0.5, 0);
          M.placePlayer(c.x, c.z);
        }
        // Gespräche: Ort, Figuren, Zeilen; der Balken füllt sich nur in 2–6 m Abstand und im Gehen
        const talks = [
          { at: () => this_fig(S, 'brandt'), who: ['brandt', 'hellmuth'], name: 'Brandt und Hellmuth', lines: [
            { who: 'brandt', text: 'Die Abstimmung über den Bebauungsplan Itzaue ist am Zwölften. Ich hab die Mehrheit. Knapp.' },
            { who: 'hellmuth', text: 'Knapp reicht mir nicht, Horst. Die Bank gibt den Kredit nur, wenn alle Grundstücke gesichert sind.' },
            { who: 'brandt', text: 'Alle bis auf das eine Stück an der Itz. Das alte Autohaus. Voss sagt, das regelt er.' },
            { who: 'hellmuth', text: 'Das sagt er seit fünf Jahren.' },
          ], flag: 'heardVote' },
          { at: () => this_fig(S, 'voss'), who: ['voss', 'lenz'], name: 'Voss und Lenz', lines: [
            { who: 'lenz', text: 'Der Grundbuchauszug ist da. Das Wegerecht steht immer noch auf den Erben Berger.' },
            { who: 'voss', text: 'Dann wird der Erbe eben unterschreiben. Freiwillig. Er weiß es nur noch nicht.' },
            { who: 'lenz', text: 'Und wenn nicht?' },
            { who: 'voss', text: 'Katharina. Jeder Mensch unterschreibt. Man muss nur den richtigen Stift finden.' },
          ], flag: 'heardDeed' },
        ];
        function this_fig(S2, id) { const f = S2.chars.get(id); return f ? f.p : null; }
        let sus = 0;
        M.watch(dt => {
          for (const id of ['brandt', 'hellmuth', 'voss', 'lenz']) { const f = S.chars.get(id); if (!f) continue; const d = Math.hypot(P(S).x - f.p.x, P(S).z - f.p.z); if (d < 1.9 && M.lis) { sus += dt; break; } }
          if (sus > 0) sus = Math.max(0, sus - dt * 0.3);
          return sus > 2.2 ? 'Aufgeflogen. „Kann ich Ihnen helfen, junger Mann?“ – Voss wird nicht erfreut sein.' : null;
        });
        for (let k = 0; k < talks.length; k++) {
          const T = talks[k];
          M.lis = true;
          let prog = 0, shown = 0;
          const tgt = T.at();
          S.world.setTarget(tgt.x, tgt.z, { r: 1, name: T.name, beacon: false });
          M.objective(`Belausche <b>${T.name}</b> – nah genug, aber nicht zu nah. Nicht rennen.`);
          await M.wait(dt => {
            const f = T.at(); if (!f) return true;
            const d = Math.hypot(P(S).x - f.x, P(S).z - f.z);
            const ok = d > 1.9 && d < 6.5 && M.mode === 'walk' && P(S).moveSpeed < 5;
            if (ok) prog += dt / 16;
            M.meter('Mithören', prog);
            const want = Math.min(T.lines.length, Math.floor(prog * T.lines.length + 0.25));
            while (shown < want) { S.dialog.sub(T.lines[shown]); shown++; }
            return prog >= 1;
          });
          M.meter(null);
          S.world.clearTarget();
          M.flag(T.flag);
          M.lis = false;
          await M.sleep(4);
          if (k === 0) {
            await M.say([{ who: 'leon', text: 'Das alte Autohaus. Papas Grundstück. Wieso ist das noch nicht verkauft?', dur: 3.6 }]);
            // Max’ Foto-Einlage
            const mx = S.chars.get('max');
            if (mx) { S.chars.walkTo('max', P(S).x + 2.5, P(S).z + 1, true, 6); }
            await M.sleep(2);
            M.say([{ who: 'max', text: 'Leon! Lächeln! Drei, zwei, eins –', dur: 2.2 }, { who: 'max', text: 'Oh. Der Blitz war aus. Und der Deckel war drauf. Und … das war die Speisekarte.', dur: 4 }, { who: 'leon', text: 'Max. Du bist ein Naturtalent.', dur: 2.6 }]);
            await M.sleep(3);
          }
        }
        M.objective(null);
      } },
      { name: 'Unter vier Augen', async run(M) {
        const S = M.S, G = S.G;
        const pl = P(S);
        const vp = S.walkable(pl.x + 1.6, pl.z + 0.4, 4) || pl;
        S.chars.remove('voss'); M.npc('voss', vp.x, vp.z, Math.atan2(pl.x - vp.x, pl.z - vp.z));
        await M.talk([
          { who: 'voss', text: 'Und? Was reden meine Freunde, wenn ich nicht dabei bin?', mood: 'smug' },
          { choice: [
            { text: 'Ehrlich: „Brandt hat die Mehrheit. Knapp. Die Bank will alle Grundstücke.“', note: 'Voss ▲', def: true, say: 'Brandt hat die Mehrheit, aber knapp. Hellmuth gibt den Kredit nur, wenn alle Grundstücke gesichert sind.', act: () => { M.flag('m9answer', 'ehrlich'); M.rel('voss', 8); },
              then: [{ who: 'voss', text: 'Gut. Sehr gut. Sie hören zu UND Sie sagen die Wahrheit. Das ist selten.', mood: 'happy' }] },
            { text: 'Ausweichend: „Nur Gerede über das Wetter.“', note: 'Voss ▼', say: 'Nichts Besonderes. Wetter, Fußball, die Preise im Ratskeller.', act: () => { M.flag('m9answer', 'ausweichend'); M.rel('voss', -6); },
              then: [{ who: 'voss', text: 'Wetter. Natürlich. Sie lügen schlecht, Herr Berger. Das ist beruhigend. Und gefährlich.', mood: 'cold' }] },
            { text: 'Konfrontieren: „Was ist mit dem Grundstück meines Vaters?“', note: 'Riskant', if: () => !!M.flags.heardDeed, say: 'Sie haben über das Grundstück meines Vaters gesprochen. Das Wegerecht. Was wollen Sie davon?', mood: 'angry', act: () => { M.flag('m9answer', 'konfrontiert'); M.rel('voss', -3); },
              then: [{ who: 'voss', text: 'Ein Formfehler im Grundbuch. Eine Unterschrift, und Sie bekommen dafür mehr, als das Autohaus je wert war.', mood: 'neutral' }, { who: 'voss', text: 'Aber nicht heute. Heute genießen wir den Abend. Wir sprechen darüber, wenn Sie so weit sind.', mood: 'smug' }] },
          ] },
          { who: 'voss', text: 'Ich habe morgen eine kleine Aufgabe für Sie. Ein Bäcker in Ketschendorf schuldet mir Geld. Holen Sie es. Höflich.', mood: 'neutral' },
          { who: 'leon', text: 'Und wenn er nicht zahlen kann?', mood: 'cold' },
          { who: 'voss', text: 'Jeder kann zahlen, Herr Berger. Manche wissen es nur noch nicht.', mood: 'cold' },
        ], { with: ['voss'] });
      } },
    ],
    reward: (S) => ({ money: 400, lines: [S.state.flags.heardDeed ? 'Du weißt jetzt: Voss braucht <b>deine Unterschrift</b>' : 'Du hast den Empfang überstanden', 'Neue Mission: <b>Eine offene Rechnung</b> (Ketschendorf)'] }),
  });

  // =============================================================================================================
  // Mission 10 – Eine offene Rechnung
  // =============================================================================================================
  StoryMissions.add({
    id: 'm10', title: 'Eine offene Rechnung', contact: 'voss', blurb: 'Ein Auftrag entwickelt sich anders als erwartet.',
    marker: S => baeckerei(S),
    stages: [
      { name: 'Bäckerei Hofmann', async run(M) {
        const S = M.S, G = S.G, b = baeckerei(S);
        const hp = S.walkable(b.x + 1.6, b.z + 0.8, 4) || b;
        M.npc('hofmann', hp.x, hp.z, Math.atan2(P(S).x - hp.x, P(S).z - hp.z));
        if (M.retry) M.placePlayer(b.x - 3, b.z - 2);
        M.objective('Sprich mit <b>Bäckermeister Hofmann</b>.');
        await M.interact('hofmann', 'Mit Hofmann reden');
        M.objective(null);
        await M.talk([
          { who: 'hofmann', text: 'Wir haben schon zu. Die Brezen sind aus. Die Laugenstangen auch. Alles ist aus.', mood: 'sad' },
          { who: 'leon', text: 'Herr Hofmann? Ich komme von Richard Voss.', mood: 'neutral' },
          { who: 'hofmann', text: 'Natürlich. Natürlich kommen Sie von Voss. Wer kommt schon noch zum Brotkaufen.', mood: 'angry' },
          { who: 'hofmann', text: 'Achthundert Euro. Ich weiß. Ich hab sie nicht.', mood: 'sad' },
          { who: 'hofmann', text: 'Voss hat das Haus gekauft, letztes Jahr. Seitdem kostet die Backstube dreimal so viel Miete. Dann kam der Brand im Lager. Die Versicherung zahlt nicht. „Ungeklärte Ursache.“', mood: 'sad' },
          { who: 'leon', text: '(Ein Brand. Die Versicherung zahlt nicht. Wie bei Papa.)', name: 'Leon (denkt)', mood: 'worried' },
          { who: 'hofmann', text: 'Mein Großvater hat hier 1952 angefangen. Ich bin der Letzte. Wenn ich zumache, macht hier keiner mehr auf.', mood: 'sad' },
          { choice: [
            { text: 'Verschonen: Das Geld aus eigener Tasche an Voss zahlen', note: '€ 800 · Moral', disabled: G.save.money < 800, say: 'Behalten Sie Ihr Geld, Herr Hofmann. Ich regel das mit Voss.', act: () => { G.addMoney(-800); M.flag('m10', 'verschont'); M.rel('voss', -4); },
              then: [{ who: 'hofmann', text: 'Sie … warum?', mood: 'surprised' }, { who: 'leon', text: 'Mein Vater hatte auch mal ein Geschäft in Coburg. Ich hab ihm damals nicht geholfen.', mood: 'sad' }, { who: 'hofmann', text: 'Der Günter. Natürlich. Sie haben seine Augen. Kommen Sie morgen früh vorbei. Die erste Breze ist für Sie. Jeden Tag.', mood: 'happy' }] },
            { text: 'Einschüchtern: „Kasse auf. Jetzt.“', note: '€ 800 für Voss · Moral ▼', def: true, say: 'Tut mir leid, Herr Hofmann. Kasse auf. Jetzt.', mood: 'cold', act: () => { M.flag('m10', 'eingeschuechtert'); M.rel('voss', 6); },
              then: [{ who: 'hofmann', text: 'Achthundertzwölf Euro und fünfzig Cent. Das Wechselgeld für morgen. Und übermorgen. Nehmen Sie. Ich hoffe, Sie schlafen gut.', mood: 'angry' }, { who: 'leon', text: '(Ich schlafe bestimmt großartig. Mit Ente auf dem Umschlag.)', name: 'Leon (denkt)', mood: 'sad' }] },
          ] },
        ], { with: ['hofmann'] });
      } },
      { name: 'Dragan', async run(M) {
        const S = M.S, G = S.G, b = baeckerei(S);
        if (M.retry) M.placePlayer(b.x - 3, b.z - 2);
        const r = S.road(b.x, b.z, 80);
        M.suv = M.driven('suv', '#15161a', r.x, r.z);
        const dp = carSide(S, M.suv);
        M.npc('dragan', dp.x, dp.z, Math.atan2(P(S).x - dp.x, P(S).z - dp.z));
        S.chars.walkTo('dragan', P(S).x + 1.8, P(S).z + 0.8, false, 6);
        await M.sleep(2.4);
        await M.talk([
          { who: 'dragan', text: 'Berger. Voss wollte wissen, ob du’s kannst. Ich soll nachsehen.', mood: 'cold' },
          { if: () => M.flags.m10 === 'verschont', then: [
            { who: 'dragan', text: 'Und du zahlst aus eigener Tasche? Für einen Bäcker? Du bist zu weich für den Job, Berger.', mood: 'angry' },
            { who: 'leon', text: 'Voss kriegt sein Geld. Wie, ist meine Sache.', mood: 'cold' },
          ], else: [
            { who: 'dragan', text: 'Achthundertzwölf. Hast du dir was abgezweigt? Nein? Brav. Voss mag brave Hunde.', mood: 'smug' },
            { who: 'leon', text: 'Nenn mich noch einmal Hund.', mood: 'angry' },
          ] },
          { who: 'dragan', text: 'Gib her. Und hör auf, Fragen über Kessler zu stellen. Rocco redet. Ich hör zu.', mood: 'cold' },
          { who: 'leon', text: 'Was ist mit Jürgen?', mood: 'angry' },
          { who: 'dragan', text: 'Das Gleiche wie mit allen, die zu viel reden. Er hat viel zu tun.', mood: 'smug' },
        ], { with: ['dragan'] });
        S.chars.remove('dragan');
        M.say({ who: 'leon', text: 'Der weiß was über Jürgen. Mal sehen, wo der hinfährt.' });
      } },
      { name: 'Verfolgung', async run(M) {
        const S = M.S, G = S.G, b = baeckerei(S);
        const r = S.road(b.x, b.z, 80);
        if (!M.suv || M.suv.disposed || M.retry) { M.suv = M.driven('suv', '#15161a', r.x, r.z); if (M.retry) M.placePlayer(b.x - 3, b.z - 2); }
        const myCar = ensureCar(M, b.x + 6, b.z + 6, 'kleinwagen', '#8a8f96');
        if (M.mode !== 'drive') {
          M.objective('Steig in ein <b>Auto</b> – Dragan fährt los!');
          if (myCar && !M.inCar(myCar)) S.world.setTarget(myCar.x, myCar.z, { r: 3, name: 'Auto', beacon: false });
        }
        const hof = kesslerHof(S);
        await M.sleep(2.5);
        const ctl = M.autoDrive(M.suv, hof, { speed: 16, lead: true });
        S.world.clearTarget();
        S.world.setTarget(M.suv.x, M.suv.z, { r: 1, name: 'Dragan', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T && !ctl.done) { T.x = M.suv.x; T.z = M.suv.z; } return ctl.done; });
        M.objective('Folge <b>Dragan</b> unauffällig. Nicht zu nah, nicht zu weit.');
        let close = 0;   // zählt erst nach 14 s: am Anfang stehen beide noch nebeneinander
        M.watch(dt => {
          if (ctl.done) return null;
          if (ctl.gap < 14 && M.mode === 'drive' && M.stageT > 14) { close += dt; if (close > 0.5 && close - dt <= 0.5) G.ui.toast('Zu nah! Dragan bemerkt dich gleich.', 1.8); } else close = Math.max(0, close - dt * 0.5);
          return close > 5 ? 'Dragan hat dich bemerkt und ist abgehauen.' : null;
        });
        keepUp(M, ctl, 'Dragan', 200, 12);
        M.meter('Verdacht', 0);
        M.every(() => { M.meter('Verdacht', close / 5); return ctl.done; });
        M.every(() => { if (M.stageT > 20) { M.say([{ who: 'leon', text: 'Richtung Norden. Zum Speditionshof. Natürlich.', dur: 3 }]); return true; } return false; });
        await ctl.arrive();
        M.meter(null);
        S.world.clearTarget();
        // Dragan steigt aus und geht ins Büro
        const dp = carSide(S, M.suv);
        M.npc('dragan', dp.x, dp.z, 0);
        const away = S.walkable(dp.x + (dp.x - M.suv.x) * 6, dp.z + (dp.z - M.suv.z) * 6, 12) || { x: dp.x + 12, z: dp.z };
        S.chars.walkTo('dragan', away.x, away.z, false, 15).then(() => S.chars.remove('dragan'));
        M.objective('Warte, bis Dragan weg ist, und durchsuche seinen <b>Wagen</b>.');
        await M.wait(() => !S.chars.get('dragan'));
        await M.interact(M.suv, 'Wagen durchsuchen', 3.2);
        M.objective(null);
        await M.doc('Mappe im Handschuhfach · Voss Projektentwicklung', `<p><b>Projekt Itzaue – offene Objekte</b> (intern, nicht weitergeben)</p>
          <p>✔ Schuhmacherei Ketschengasse 14 – <i>Lagerbrand, Versicherung abgelehnt</i><br>
          ✔ Bäckerei Hofmann, Ketschendorf – <i>Lagerbrand, Mieterhöhung, Zahlungsplan</i><br>
          ✔ Autohaus Berger, Itzufer – <i>Brand 2021, Verkauf an Strohfirma Itzgrund GmbH</i><br>
          ✘ Flurstück 1147/3 (Wegerecht) – <span class="st-hand">Erbe L. Berger zurück in CO! Über Fischer einbinden. D. kümmert sich.</span></p>
          <p>Kessler Logistik – <span class="st-hand">J.K. wird nervös. Beobachten.</span></p>`);
        await M.cut([
          { pos: [M.suv.x + 4, yOf(S, M.suv.x, M.suv.z) + 2.2, M.suv.z + 4], look: [P(S).x, P(S).y + 1.5, P(S).z], dur: 3.4, fov: 40 },
        ], [{ who: 'leon', text: '„Autohaus Berger. Brand 2021.“ Abgehakt. Wie ein Einkaufszettel.', dur: 4 }]);
        await M.say([
          { who: 'leon', text: '„Über Fischer einbinden.“ Max. Was hast du getan, Max?', dur: 4 },
          { who: 'leon', text: 'Voss hat nicht nur Papas Autohaus gekauft. Er hat es angezündet. Und jetzt will er mich.', dur: 4.6 },
        ]);
        M.flag('sawList');
      } },
    ],
    reward: (S) => ({ money: S.state.flags.m10 === 'verschont' ? 0 : 300, lines: ['Du hast die Liste von Voss gesehen: <b>Autohaus Berger – Brand 2021</b>', S.state.flags.m10 === 'verschont' ? 'Hofmann darf weiterbacken' : 'Hofmanns Wechselgeld liegt jetzt bei Voss'] }),
  });
})();
