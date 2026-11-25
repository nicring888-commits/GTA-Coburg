// Story-Modus (seit v3.25.0), Teil 6: Kapitel 4 „Kein Zurück“ – Missionen 16–20.
// Neu: Polizeiflucht als Missionsziel (echte Fahndung aus js/police.js), Beschatter-Auto, zwei gleichzeitige Ziele
// (Wahl durch Hinfahren), Rammen bis zum Stillstand, Feuer an der Werkstatt. Handlung: STORY.md, Kapitel 4.
'use strict';

(() => {
  const P = S => S.G.player();
  const yOf = (S, x, z) => S.G.world.heightAt(x, z);
  const beside = (S, p, d = 9) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q = S.walkable(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); if (q && Math.hypot(q.x - p.x, q.z - p.z) > d - 2.5) return q; } return S.walkable(p.x, p.z, 15) || p; };
  const doorSpot = (S, h, out = 1) => S.walkable(h.sx + (h.ox || 0) * out, h.sz + (h.oz || 0) * out, 8) || { x: h.sx, z: h.sz };
  const carSide = (S, c, d = 2.2) => S.walkable(c.x + Math.cos(c.heading) * d, c.z - Math.sin(c.heading) * d, 4) || S.walkable(c.x - Math.cos(c.heading) * d, c.z + Math.sin(c.heading) * d, 6) || { x: c.x, z: c.z };
  const kesslerHof = S => S.road(-700, -1130, 250);
  const polizei = S => S.road(13, -507, 80);                 // Polizeiinspektion Coburg, Hindenburgstraße
  const gueterbahnhof = S => S.road(-289, 931, 120);         // Am Güterbahnhof
  const klinikum = S => S.road(623, 1291, 200);              // Klinikum Coburg
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

  // =============================================================================================================
  // Mission 16 – Ärger in Coburg
  // =============================================================================================================
  StoryMissions.add({
    id: 'm16', title: 'Ärger in Coburg', contact: 'tobi', blurb: 'Ein Auftrag bringt Leon in Schwierigkeiten.',
    marker: S => { const w = S.workshop(); return w && beside(S, w); },
    stages: [
      { name: 'Razzia', async run(M) {
        const S = M.S, G = S.G, w = S.workshop(), base = beside(S, w);
        const tp = S.walkable(base.x + 1.5, base.z, 4) || base;
        M.npc('tobi', tp.x, tp.z, Math.atan2(P(S).x - tp.x, P(S).z - tp.z));
        M.van = M.vehicle('van', '#f4f4f4', w.x, w.z);
        await M.talk([
          { who: 'tobi', text: 'Leon! Gut, dass du da bist. Die Polizei hat angerufen. Die wollen den Kleinbus. Wegen Kessler.', mood: 'worried' },
          { who: 'leon', text: 'Der Bus war die ganze Nacht hier, Tobi. Oder?', mood: 'cold' },
          { who: 'tobi', text: '… Nein. Dragan hat ihn sich geliehen. „Für Voss.“ Ich hab nicht nein gesagt. Ich hab nie nein gesagt.', mood: 'sad' },
          { who: 'tobi', text: 'Im Laderaum liegt was. Ein Benzinkanister. Und ein Feuerzeug mit „Autohaus Berger“ drauf. Das hat jemand absichtlich da hingelegt.', mood: 'worried' },
          { who: 'leon', text: 'Papas Werbefeuerzeuge. Von früher. Die liegen nicht zufällig da.', mood: 'angry' },
          { who: 'tobi', text: 'Wenn die Polizei das findet, bist du dran. Und ich gleich mit. Hörst du das? Die kommen schon.', mood: 'worried' },
          { who: 'leon', text: 'Ich nehm den Bus. Ich weiß, wer ihn verschwinden lässt.', mood: 'cold' },
          { who: 'tobi', text: 'Rocco. Natürlich weißt du das. Fahr!', mood: 'worried' },
        ], { with: ['tobi'] });
      } },
      { name: 'Flucht', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        if (!M.van || M.van.disposed || M.retry) { M.van = M.vehicle('van', '#f4f4f4', w.x, w.z); M.seat(M.van); }
        const van = M.van;
        if (!M.inCar(van)) {
          S.world.setTarget(van.x, van.z, { r: 3, name: 'Kleinbus', beacon: false });
          M.objective('Rein in den <b>Kleinbus</b>!');
          await M.wait(() => M.inCar(van));
          S.world.clearTarget();
        }
        S.chars.remove('tobi');
        G.police.crime(0.2, 'Razzia bei Kfz Weber! Die Polizei sucht den Kleinbus', 3);
        M.watch(() => (van.wrecked || van.burning) ? 'Der Kleinbus ist ausgebrannt – mit allen Spuren. Die Polizei wird das anders sehen.' : null);
        let outT = 0;
        M.watch(dt => { outT = M.inCar(van) ? 0 : outT + dt; return outT > 40 ? 'Du hast den Bus mit dem Kanister stehen lassen. Die Polizei findet ihn.' : null; });
        M.objective('Häng die <b>Polizei</b> ab (Sterne loswerden). Bleib im Kleinbus.');
        M.every(() => { if (M.stageT > 6) { M.call('rocco', [{ who: 'rocco', text: 'Tobi hat angerufen. Ein heißer Bus? Ich mag heiße Busse. Aber nicht mit Polizei dran.' }, { who: 'rocco', text: 'Häng sie ab, dann komm in die Ketschengasse. Hinterhof.' }]); return true; } return false; });
        await M.sleep(1.5);
        await M.wait(() => G.police.stars === 0 && M.inCar(van));
        M.say({ who: 'leon', text: 'Weg. Jetzt zu Rocco, bevor sie mich wieder finden.' });
      } },
      { name: 'Ketschengasse', async run(M) {
        const S = M.S, G = S.G;
        if (M.retry) { const w = S.workshop(); M.van = M.vehicle('van', '#f4f4f4', w.x, w.z); M.seat(M.van); }
        const van = M.van || G.car();
        const kh = S.home('ketschen'), kg = kh ? S.road(kh.sx, kh.sz, 120) : S.road(-35, 251);
        await M.goto(kg, { r: 12, car: van, slow: 5, name: 'Rocco', text: 'Bring den Bus zu <b>Rocco</b> in die Ketschengasse. Ohne Polizei.' });
        if (G.police.stars > 0) { M.objective('Erst die <b>Polizei</b> abhängen!'); await M.wait(() => G.police.stars === 0); }
        G.exitCar();
        const rp = beside(S, kg, 4);
        M.npc('rocco', rp.x, rp.z, Math.atan2(P(S).x - rp.x, P(S).z - rp.z));
        await M.talk([
          { who: 'rocco', text: 'Schöner Bus. Weiß. Unauffällig. Bis auf das Blaulicht, das dich verfolgt hat.', mood: 'smug' },
          { who: 'leon', text: 'Kannst du ihn verschwinden lassen?', mood: 'cold' },
          { who: 'rocco', text: 'In drei Stunden ist das ein Gartenhaus in Tschechien. Kostet dich aber was.', mood: 'smug' },
          { choice: [
            { text: 'Zahlen', note: '€ 1.000', disabled: G.save.money < 1000, say: 'Wie viel?', act: () => { G.addMoney(-1000); M.flag('m16', 'bezahlt'); },
              then: [{ who: 'rocco', text: 'Tausend. Freundschaftspreis. Weil Max mir so viel schuldet, dass du quasi Familie bist.', mood: 'laugh' }] },
            { text: 'Gefallen anbieten: „Ich schulde dir was.“', note: 'Rocco hat etwas gut', def: true, say: 'Ich hab kein Geld übrig. Aber ich schulde dir einen Gefallen.', act: () => M.flag('m16', 'gefallen'),
              then: [{ who: 'rocco', text: 'Ein Gefallen von einem Berger. Den heb ich mir auf. Und ich vergess ihn nicht.', mood: 'smug' }] },
          ] },
          { who: 'rocco', text: 'Und Leon – das Feuerzeug. Willst du das behalten? Andenken?', mood: 'neutral' },
          { who: 'leon', text: 'Ja. Das behalte ich. Irgendwann gebe ich es dem zurück, der es da reingelegt hat.', mood: 'angry' },
        ], { with: ['rocco'] });
        M.flag('lighter');
      } },
    ],
    reward: () => ({ money: 0, lines: ['Der Kleinbus mit den falschen Spuren ist weg', 'Du hast Papas altes Feuerzeug'] }),
  });

  // =============================================================================================================
  // Mission 17 – Unter Beobachtung
  // =============================================================================================================
  StoryMissions.add({
    id: 'm17', title: 'Unter Beobachtung', contact: 'leon', blurb: 'Etwas hat sich verändert.',
    marker: S => { const h = S.home('lossau'); return h ? beside(S, doorSpot(S, h, 1), 8) : null; },
    stages: [
      { name: 'Der graue Wagen', async run(M) {
        const S = M.S, G = S.G, h = S.home('lossau'), d = doorSpot(S, h, 1);
        await M.say([{ who: 'leon', text: 'Seit zwei Tagen steht derselbe graue Wagen vor dem Haus. Immer mit Motor an.', dur: 3.6 }, { who: 'leon', text: 'Mal sehen, ob er mitkommt.', dur: 2.4 }]);
        const car = ensureCar(M, d.x + 6, d.z + 6, 'car', '#3a4a6a');
        if (M.mode !== 'drive') {
          if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false });
          M.objective('Steig in ein <b>Auto</b>.');
          await M.wait(() => M.mode === 'drive');
          S.world.clearTarget();
        }
        // Beschatter: fährt mit Abstand hinterher
        const tail = M.driven('car', '#7d8288', d.x - 30, d.z - 30);
        M.tail = tail;
        let t = 99;
        M.every(dt => {
          if (tail.disposed || M.tailOff) return true;
          if ((t += dt) < 2) return false;
          t = 0;
          const p = M.pos, ctl = M.autoDrive(tail, { x: p.x, z: p.z }, { speed: 19 });
          ctl.hold = Math.hypot(tail.x - p.x, tail.z - p.z) < 30;
          return false;
        });
        M.every(() => { if (tail._ctl) tail._ctl.hold = Math.hypot(tail.x - M.pos.x, tail.z - M.pos.z) < 30; return M.tailOff; });
        // Test: drei Punkte abfahren – folgt er?
        const lt = S.lm('Landestheater') || { x: 183, z: -147 }, ap = S.lm('Albertsplatz') || { x: -128, z: 333 };
        await M.course([S.road(lt.x, lt.z, 120), S.road(ap.x, ap.z, 120)], { text: 'Fahr ein paar Umwege und schau, ob der <b>graue Wagen</b> folgt' });
        const gap = Math.hypot(tail.x - M.pos.x, tail.z - M.pos.z);
        await M.say({ who: 'leon', text: gap < 200 ? 'Er ist immer noch da. Okay. Dann lernen wir uns mal kennen.' : 'Er holt auf. Natürlich. Zeit, ihn loszuwerden.', dur: 3 });
        M.objective('Häng den <b>grauen Wagen</b> ab.');
        let free = 0;
        await M.wait(dt => {
          const d2 = Math.hypot(tail.x - M.pos.x, tail.z - M.pos.z);
          free = d2 > 220 ? free + dt : Math.max(0, free - dt * 2);
          M.meter('Abgehängt', free / 8);
          return free >= 8;
        });
        M.meter(null);
        M.tailOff = true;
        if (tail._ctl) tail._ctl.stopped = true;
        M.say({ who: 'leon', text: 'Weg. Aber wie hat der mich überhaupt jedes Mal gefunden?', dur: 3 });
      } },
      { name: 'Der Sender', async run(M) {
        const S = M.S, G = S.G;
        await M.sleep(1);
        M.objective('Halt an und untersuch dein <b>Auto</b>.');
        await M.wait(() => M.mode === 'walk' || (M.mode === 'drive' && Math.abs(G.car().speed) < 1));
        if (M.mode === 'drive') G.exitCar();
        const c = G.parked.slice().sort((a, b) => Math.hypot(a.x - P(S).x, a.z - P(S).z) - Math.hypot(b.x - P(S).x, b.z - P(S).z))[0];
        const spot = c ? { x: c.x, z: c.z } : P(S);
        await M.interact(spot, 'Unter dem Auto nachsehen', 3.2);
        await M.say({ who: 'leon', text: 'Da. Unter der Stoßstange. Ein GPS-Sender. Wie der, den Tobi aus dem Dienstwagen gebaut hat.', dur: 4 });
        await M.talk([
          { who: 'leon', text: '(Voss weiß jederzeit, wo ich bin. Was mach ich damit?)', name: 'Leon (denkt)', mood: 'cold', cam: 'wide' },
          { choice: [
            { text: 'Zertreten', note: 'Voss merkt es', say: false, act: () => { M.flag('tracker', 'zerstört'); M.rel('voss', -5); },
              then: [{ who: 'leon', text: '(Knack. Viele Grüße an Herrn Voss.)', name: 'Leon (denkt)', mood: 'smug' }] },
            { text: 'Auf einen Stadtbus kleben', note: 'Voss jagt den Bus', def: true, say: false, act: () => M.flag('tracker', 'bus'),
              then: [{ who: 'leon', text: '(Linie 1402 nach Wüstenahorn. Viel Spaß, Dragan. Den ganzen Tag im Kreis.)', name: 'Leon (denkt)', mood: 'laugh' }] },
            { text: 'Behalten – für später', note: 'Falle stellen', say: false, act: () => M.flag('tracker', 'behalten'),
              then: [{ who: 'leon', text: '(Wenn Voss mich sucht, entscheide ich ab jetzt, wo er mich findet.)', name: 'Leon (denkt)', mood: 'smug' }] },
          ] },
        ], { cam: 'none' });
        await M.call('sarah', [
          { who: 'sarah', text: 'Leon? In meiner Wohnung war jemand. Nichts geklaut. Aber im Rauchmelder steckt ein Mikrofon.' },
          { who: 'leon', text: 'Bei mir ein Sender am Auto. Voss wird nervös.' },
          { who: 'sarah', text: 'Nervöse Leute machen Fehler. Und die Polizei sucht dich jetzt offiziell als Zeugen. Kommissarin Roth.' },
          { who: 'leon', text: '„Als Zeugen.“ Noch.' },
        ]);
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Beschatter abgehängt, Sender gefunden', { 'zerstört': 'Sender zerstört', bus: 'Der Sender fährt jetzt Linie 1402', behalten: 'Den Sender behältst du – für eine Falle' }[S.state.flags.tracker] || ''].filter(Boolean) }),
  });

  // =============================================================================================================
  // Mission 18 – Der falsche Verdacht
  // =============================================================================================================
  const taxistand = S => { const ap = S.lm('Albertsplatz') || { x: -128, z: 333 }; return beside(S, S.road(ap.x, ap.z, 120), 7); };
  StoryMissions.add({
    id: 'm18', title: 'Der falsche Verdacht', contact: 'gul', blurb: 'Leon muss seinen Namen reinwaschen.',
    marker: S => taxistand(S),
    stages: [
      { name: 'Gül', async run(M) {
        const S = M.S, G = S.G, t = taxistand(S);
        const gp = S.walkable(t.x + 1.5, t.z + 0.4, 4) || t;
        M.npc('gul', gp.x, gp.z, Math.atan2(P(S).x - gp.x, P(S).z - gp.z));
        await M.talk([
          { who: 'gul', text: 'Da ist ja der meistgesuchte Zeuge Coburgs. Setz dich, aber nicht ins Taxi. Das wird beobachtet.', mood: 'smug' },
          { who: 'leon', text: 'Gül, in der Nacht, als Kessler verschwunden ist – ich hab ihn zum Bahnhof gebracht. Lebend.', mood: 'worried' },
          { who: 'gul', text: 'Ich weiß. Ich stand am Taxistand am Bahnhof. Meine Dashcam läuft immer. 21:42 Uhr: du, Kessler, Umarmung, er geht rein. Du fährst weg.', mood: 'neutral' },
          { who: 'leon', text: 'Gül, ich könnte dich küssen.', mood: 'happy' },
          { who: 'gul', text: 'Könntest du nicht. Problem: Die Speicherkarte liegt im Handschuhfach meines alten Taxis. Und das wurde gestern abgeschleppt. Falschparken. Angeblich.', mood: 'cold' },
          { who: 'gul', text: 'Abschlepphof beim Autohändler im Süden. Hol die Karte, bevor jemand anders auf die Idee kommt.', mood: 'worried' },
          { if: () => S.state.flags.metGul, then: [{ who: 'gul', text: 'Und sag Max, er schuldet mir immer noch sieben Kaffee.', mood: 'smug' }] },
        ], { with: ['gul'] });
      } },
      { name: 'Abschlepphof', async run(M) {
        const S = M.S, G = S.G;
        const dl = S.dealer(1) || { x: 112, z: 1129 };
        const yard = beside(S, { x: dl.x, z: dl.z }, 14);
        if (M.retry) M.placePlayer(yard.x + 30, yard.z + 30);
        await M.goto(yard, { r: 12, name: 'Abschlepphof', text: 'Fahr zum <b>Abschlepphof</b> beim Autohändler.' });
        if (M.mode === 'drive') G.exitCar();
        const taxi = M.vehicle('taxi', '#efe6c4', yard.x, yard.z);
        // Dragans Mann ist schon da
        const dp = beside(S, taxi, 5);
        M.npc('dragan', dp.x, dp.z, Math.atan2(taxi.x - dp.x, taxi.z - dp.z));
        await M.talk([
          { who: 'dragan', text: 'Berger. Suchst du was? Ein Taxi vielleicht?', mood: 'smug' },
          { who: 'leon', text: 'Dragan. Du bist überall, wo es nach Ärger riecht.', mood: 'cold' },
          { who: 'dragan', text: 'Ich bin der Ärger. Geh nach Hause. Oder geh zur Polizei und gestehe. Voss würde dir einen guten Anwalt bezahlen.', mood: 'cold' },
          { who: 'leon', text: 'Ich hab eine bessere Idee.', mood: 'angry' },
        ], { with: ['dragan'] });
        // Dragan greift an: Leon muss ihn umhauen (Nahkampf/Waffen des Spiels) oder an ihm vorbei ans Handschuhfach
        M.objective('Hol die Speicherkarte aus <b>Güls Taxi</b> – Dragan steht im Weg!');
        S.chars.walkTo('dragan', taxi.x + 1.5, taxi.z, false, 4);
        let shoves = 0;
        M.every(dt => {
          const f = S.chars.get('dragan'); if (!f) return true;
          const d = Math.hypot(P(S).x - f.p.x, P(S).z - f.p.z);
          if (d < 1.3 && (M.stoveT = (M.stoveT || 0) - dt) <= 0) {
            M.stoveT = 1.6; shoves++;
            const pl = P(S), dx = pl.x - f.p.x, dz = pl.z - f.p.z, l = Math.hypot(dx, dz) || 1;
            pl.place(pl.x + dx / l * 2.5, pl.z + dz / l * 2.5, G.world);
            G.ui.toast(shoves < 3 ? 'Dragan stößt dich weg!' : 'Dragan wird müde …', 1.2);
            if (shoves === 3) { S.chars.walkTo('dragan', f.p.x + 18, f.p.z + 6, false, 8).then(() => { M.dfled = true; }); M.say({ who: 'dragan', text: 'Das ist es nicht wert. Noch nicht, Berger.' }); }
          }
          return false;
        });
        await M.interact(taxi, 'Handschuhfach durchsuchen', 3);
        M.flag('dashcam');
        S.chars.remove('dragan');
        await M.say([{ who: 'leon', text: 'Speicherkarte. 21:42. Ich und Kessler am Bahnhof. Mein Alibi.', dur: 3.4 }]);
      } },
      { name: 'Polizeiinspektion', async run(M) {
        const S = M.S, G = S.G, pi = polizei(S);
        if (M.retry) { const dl = S.dealer(1) || { x: 112, z: 1129 }; M.placePlayer(dl.x + 20, dl.z + 20); }
        await M.goto(pi, { r: 12, name: 'Polizeiinspektion', text: 'Bring die Speicherkarte zur <b>Polizeiinspektion</b> (Hindenburgstraße). Ohne Fahndung.' });
        if (G.police.stars > 0) { M.objective('Erst die <b>Polizei</b> abhängen – so kommst du nicht rein.'); await M.wait(() => G.police.stars === 0); }
        if (M.mode === 'drive') G.exitCar();
        const rp = beside(S, pi, 5);
        M.npc('roth', rp.x, rp.z, Math.atan2(P(S).x - rp.x, P(S).z - rp.z));
        await M.talk([
          { who: 'roth', text: 'Herr Berger. Sie kommen freiwillig. Das ist entweder sehr klug oder sehr dumm.', mood: 'cold' },
          { who: 'leon', text: 'Ich hab Kessler in der Nacht zum Bahnhof gebracht. Lebend. Hier ist die Aufnahme einer Taxi-Dashcam.', mood: 'neutral' },
          { who: 'roth', text: '21:42 … Kessler betritt den Bahnhof. Und sein Wagen brennt um 23:10 am Callenberg. Mit Ihrem Kleinbus daneben, sagt ein Zeuge.', mood: 'cold' },
          { who: 'leon', text: 'Den Bus hatte Dragan. Fragen Sie Tobias Weber.', mood: 'angry' },
          { who: 'roth', text: 'Herr Weber sagt dasselbe. Und der Zeuge vom Callenberg … arbeitet seit drei Monaten für die Voss Projektentwicklung.', mood: 'smug' },
          { who: 'roth', text: 'Sie sind nicht mehr verdächtig, Herr Berger. Aber Sie sind auch nicht unschuldig. Sie fahren für einen Mann, gegen den ich seit zwei Jahren ermittle.', mood: 'cold' },
          { choice: [
            { text: '„Dann helfen Sie mir, ihn zu kriegen.“', note: 'Roth als Verbündete', def: true, say: 'Dann sind wir schon zwei. Helfen Sie mir, ihn zu kriegen.', act: () => M.flag('roth', 'verbuendet'),
              then: [{ who: 'roth', text: 'Ich helfe niemandem, Herr Berger. Ich nehme Beweise entgegen. Bringen Sie mir welche, die vor Gericht halten.', mood: 'neutral' }] },
            { text: '„Halten Sie sich raus.“', note: 'allein weiter', say: 'Danke. Den Rest mach ich allein.', act: () => M.flag('roth', 'allein'),
              then: [{ who: 'roth', text: 'Allein haben schon viele gegen Voss gekämpft. Fragen Sie mal Ihren Vater.', mood: 'sad' }] },
          ] },
        ], { with: ['roth'] });
      } },
    ],
    reward: () => ({ money: 0, lines: ['Alibi: Güls Dashcam beweist, dass Kessler lebend am Bahnhof war', 'Neuer Kontakt: <b>Kommissarin Roth</b>'] }),
  });

  // =============================================================================================================
  // Mission 19 – Eine Entscheidung
  // =============================================================================================================
  const hesslerSpot = S => { const hg = S.lm('Hofgarten') || { x: 813, z: -350 }; return S.road(hg.x - 250, hg.z + 80, 250); };
  StoryMissions.add({
    id: 'm19', title: 'Eine Entscheidung', contact: 'leon', blurb: 'Leon muss zwischen zwei Verbündeten wählen.',
    marker: S => { const h = S.home('lossau'); return h ? beside(S, doorSpot(S, h, 1), 8) : null; },
    stages: [
      { name: 'Zwei Anrufe', async run(M) {
        const S = M.S, G = S.G;
        await M.call('max', [{ who: 'max', text: 'Leon … Leon, bitte. Die haben mich. Dragans Leute. Güterbahnhof. Die wollen das Geld. Heute.' }, { who: 'max', text: 'Ich weiß, ich hab dich verraten. Ich weiß. Aber bitte –' }]);
        await M.call('sarah', [{ who: 'sarah', text: 'Leon! Hessler, der Gutachter, will gegen Voss aussagen. Er hat mich angerufen – Dragan ist bei ihm! Am Hofgarten, unten an der Straße!' }, { who: 'sarah', text: 'Ich schaffe es nicht rechtzeitig. Bitte. Er ist unser einziger Zeuge für die gefälschten Gutachten.' }]);
        await M.talk([
          { who: 'leon', text: '(Max am Güterbahnhof. Hessler am Hofgarten. Zwei Enden der Stadt. Ich schaffe nur einen.)', name: 'Leon (denkt)', mood: 'worried', cam: 'wide' },
        ], { cam: 'none' });
      } },
      { name: 'Wahl', async run(M) {
        const S = M.S, G = S.G;
        const gb = gueterbahnhof(S), hs = hesslerSpot(S);
        S.world.addMarker('m19max', gb.x, gb.z, 'Max retten', 'max');
        S.world.addMarker('m19sarah', hs.x, hs.z, 'Hessler retten', 'sarah');
        M.onCleanup(() => { S.world.removeMarker('m19max'); S.world.removeMarker('m19sarah'); });
        M.objective('Fahr zum <b>Güterbahnhof</b> (Max) <i>oder</i> zum <b>Hofgarten</b> (Hessler). Der andere ist auf sich allein gestellt.');
        M.timer(240, 'Zu spät für beide. Max und Hessler sind verschwunden.');
        const choice = await M.wait(() => Math.hypot(M.pos.x - gb.x, M.pos.z - gb.z) < 22 ? 'max' : Math.hypot(M.pos.x - hs.x, M.pos.z - hs.z) < 22 ? 'sarah' : null);
        M.stopTimer();
        S.world.removeMarker('m19max'); S.world.removeMarker('m19sarah');
        M.flag('chose19', choice);
        M.rel(choice === 'max' ? 'sarah' : 'max', -40);
        M.objective(null);
      } },
      { name: 'Rettung', async run(M) {
        const S = M.S, G = S.G, ch = M.flags.chose19 || 'max';
        if (ch === 'max') {
          const gb = gueterbahnhof(S);
          if (M.retry) M.placePlayer(gb.x + 20, gb.z + 20);
          if (M.mode === 'drive') G.exitCar();
          const mp = beside(S, gb, 6), dp = S.walkable(mp.x + 1.6, mp.z + 0.6, 4) || mp;
          M.npc('max', mp.x, mp.z, 0); M.npc('dragan', dp.x, dp.z, Math.atan2(P(S).x - dp.x, P(S).z - dp.z));
          await M.talk([
            { who: 'dragan', text: 'Der edle Retter. Vierzigtausend, Berger. Oder Max lernt fliegen. Vom Stellwerk.', mood: 'cold' },
            { who: 'max', text: 'Leon, du hättest nicht kommen sollen …', mood: 'sad' },
            { choice: [
              { text: 'Bluffen: „Ich hab Kesslers Frachtbriefe. Kopien liegen bei der Polizei.“', note: 'nur mit Beweisen', if: () => !!S.state.flags.hasFreight, say: 'Ich hab Kesslers Frachtbriefe, Dragan. Wenn Max was passiert, liegen sie morgen bei Kommissarin Roth.', act: () => M.flag('m19how', 'bluff'),
                then: [{ who: 'dragan', text: '… Du bluffst. Aber Voss mag keine Risiken. Nimm deinen Clown. Diesmal.', mood: 'angry' }] },
              { text: 'Zahlen, was du hast', note: 'bis € 5.000', def: true, say: 'Ich hab nicht vierzig. Ich hab das hier. Nimm es.', act: () => { const n = Math.min(5000, G.save.money); G.addMoney(-n); M.flag('m19how', 'bezahlt'); M.paid19 = n; },
                then: [{ who: 'dragan', text: 'Eine Anzahlung. Gut. Die Zinsen holen wir uns trotzdem. Lauf, Fischer.', mood: 'smug' }] },
            ] },
            { who: 'max', text: 'Du bist gekommen. Nach allem. Du bist echt gekommen.', mood: 'sad' },
            { who: 'leon', text: 'Erklär’s mir später. Jetzt rein ins Auto.', mood: 'cold' },
          ], { with: ['dragan', 'max'] });
          S.chars.remove('dragan');
          const car = M.vehicle('kombi', '#4f8f8a', gb.x, gb.z);
          S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false });
          M.objective('Rein ins <b>Auto</b>, Max mitnehmen!');
          await M.wait(() => M.mode === 'drive');
          S.world.clearTarget();
          S.chars.hide('max');
          const from = S.road(gb.x + 120, gb.z - 60, 200);
          const h1 = M.driven('suv', '#15161a', from.x, from.z);
          const hunt = hunters(M, [h1], 21);
          const w = S.workshop();
          M.every(() => { if (M.stageT > 10) { M.say([{ who: 'max', text: 'Die verfolgen uns! Natürlich verfolgen die uns!', dur: 2.6 }, { who: 'max', text: 'Leon … es tut mir leid. Alles. Ich hatte Angst.', dur: 3.2 }]); return true; } return false; });
          await M.goto(S.road(w.x, w.z, 60), { r: 14, car: true, slow: 6, name: 'Kfz Weber', text: 'Bring Max zu <b>Tobi</b> in Sicherheit.' });
          hunt.stop();
        } else {
          const hs = hesslerSpot(S);
          if (M.retry) M.placePlayer(hs.x + 25, hs.z + 25);
          const suv = M.driven('suv', '#15161a', hs.x, hs.z);
          M.npc('hessler', hs.x + 3, hs.z + 3, 0); S.chars.hide('hessler');
          await M.say({ who: 'leon', text: 'Da! Dragans Geländewagen fährt los – Hessler sitzt hinten drin!', dur: 3 });
          if (M.mode !== 'drive') {
            const c = ensureCar(M, P(S).x + 4, P(S).z + 4);
            if (c) S.world.setTarget(c.x, c.z, { r: 3, name: 'Auto', beacon: false });
            M.objective('Steig in ein <b>Auto</b>!');
            await M.wait(() => M.mode === 'drive');
            S.world.clearTarget();
          }
          const ctl = M.autoDrive(suv, kesslerHof(S), { speed: 17 });
          M.objective('Ramm <b>Dragans Geländewagen</b>, bis er stehen bleibt!');
          S.world.setTarget(suv.x, suv.z, { r: 1, name: 'Dragan', beacon: false, route: false });
          M.every(() => { const T = S.world.target; if (T) { T.x = suv.x; T.z = suv.z; } return false; });
          M.watch(() => ctl.done ? 'Dragan hat Hessler zum Speditionshof gebracht. Zu spät.' : null);
          let lost = 0;
          M.watch(dt => { lost = ctl.gap > 260 ? lost + dt : 0; return lost > 12 ? 'Dragan ist mit Hessler entkommen.' : null; });
          suv.health = 100;
          await M.wait(() => { M.meter('Geländewagen', suv.health / 100); return suv.health < 45 || suv.wrecked; });
          M.meter(null);
          ctl.hold = true;
          S.world.clearTarget();
          await M.wait(() => Math.abs(suv.speed) < 1);
          if (M.mode === 'drive') G.exitCar();
          const hp = carSide(S, suv);
          S.chars.remove('hessler'); M.npc('hessler', hp.x, hp.z, Math.atan2(P(S).x - hp.x, P(S).z - hp.z));
          await M.talk([
            { who: 'hessler', text: 'Sie … Sie sind Berger? Der Sohn? Mein Gott. Ich habe das Gutachten zu Ihrem Vater geschrieben. Das falsche.', mood: 'sad' },
            { who: 'leon', text: 'Dann schreiben Sie jetzt das richtige. Bei Sarah Neumann. Und bei der Polizei.', mood: 'cold' },
            { who: 'hessler', text: 'Dragan ist weggerannt. Er wird wiederkommen. Aber ja. Ja, ich sage aus. Ich bin es Ihrem Vater schuldig.', mood: 'worried' },
          ], { with: ['hessler'] });
          M.flag('hesslerSafe');
        }
      } },
    ],
    reward: (S, M) => ({ money: 0, lines: [S.state.flags.chose19 === 'max' ? 'Du hast <b>Max</b> gerettet. Sarah ist enttäuscht – Hessler ist verschwunden.' : 'Du hast <b>Hessler</b> gerettet. Max ist in Dragans Händen.', 'Beziehung zu ' + (S.state.flags.chose19 === 'max' ? 'Sarah' : 'Max') + ': <b>' + S.rel.label(S.rel.get(S.state.flags.chose19 === 'max' ? 'sarah' : 'max')) + '</b>'] }),
  });

  // =============================================================================================================
  // Mission 20 – Konsequenzen
  // =============================================================================================================
  StoryMissions.add({
    id: 'm20', title: 'Konsequenzen', contact: 'tobi', blurb: 'Die Situation eskaliert.',
    marker: S => { const ap = S.lm('Albertsplatz') || { x: -128, z: 333 }; return beside(S, S.road(ap.x, ap.z, 120), 9); },
    stages: [
      { name: 'Feuer', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        await M.call('tobi', [{ who: 'tobi', text: 'Leon … es brennt. Die Werkstatt. Jemand hat … ich krieg keine Luft –' }, { who: 'leon', text: 'Tobi! Raus da! Ich komme!' }]);
        const car = ensureCar(M, P(S).x + 5, P(S).z + 5);
        if (M.mode !== 'drive' && car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false });
        M.timer(170, 'Zu spät. Die Feuerwehr zieht Tobi raus – er überlebt knapp, aber er wird dir das nie verzeihen.');
        await M.goto(S.road(w.x, w.z, 60), { r: 14, name: 'Kfz Weber', text: 'Schnell zu <b>Kfz Weber</b> – die Werkstatt brennt!' });
        M.stopTimer();
      } },
      { name: 'Tobi', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        if (M.mode === 'drive') G.exitCar();
        if (M.retry) M.placePlayer(w.x + 12, w.z + 12);
        // Flammen und Rauch an der Werkstatt
        const fires = [0, 1, 2, 3, 4].map(k => ({ x: w.x + Math.cos(k * 1.3) * 6, z: w.z + Math.sin(k * 1.3) * 6 }));
        let ft = 0;
        M.every(dt => {
          if ((ft -= dt) > 0) return false; ft = 0.08;
          const f = fires[Math.floor(Math.random() * fires.length)];
          G.fx.fire(f.x, yOf(S, f.x, f.z) + 0.5, f.z); G.fx.smoke(f.x, yOf(S, f.x, f.z) + 2.5, f.z, 0.85);
          return false;
        });
        const tp = beside(S, w, 4);
        M.npc('tobi', tp.x, tp.z, 0);
        M.objective('Hol <b>Tobi</b> aus dem Rauch! (Rauch kostet Leben)');
        M.every(dt => { if (Math.hypot(P(S).x - w.x, P(S).z - w.z) < 9) P(S).health = Math.max(5, P(S).health - dt * 6); return false; });
        await M.interact('tobi', 'Tobi rausziehen', 2.4);
        // Dragans Mappe am Boden
        const mp = S.walkable(tp.x + 2, tp.z - 1.5, 4) || tp;
        S.world.box(mp.x, mp.z, '#2a2a2e', 'Mappe');
        await M.black(true, 400);
        const out = beside(S, w, 14);
        M.placePlayer(out.x, out.z);
        S.chars.remove('tobi'); M.npc('tobi', out.x + 1.4, out.z + 0.4, 0);
        await M.black(false, 600);
        await M.talk([
          { who: 'tobi', text: '*hust* … Dragan. Er hat gesagt … das ist für die Aussage … zu Kessler und dem Bus …', mood: 'sad' },
          { if: () => S.state.flags.chose19 === 'max', then: [{ who: 'tobi', text: 'Max … ist er … in Sicherheit? Er war hier, als es losging. Er ist durch die Hintertür.', mood: 'worried' }] },
          { who: 'leon', text: 'Nicht reden, Tobi. Ich bring dich ins Klinikum.', mood: 'worried' },
          { who: 'tobi', text: 'Da drüben … Dragan hat was fallen lassen. Eine Mappe. Nimm sie mit.', mood: 'sad' },
        ], { with: ['tobi'] });
        await M.interact(mp, 'Mappe aufheben', 2.6);
        S.world.clearExtra();
        await M.doc('Mappe · Voss Projektentwicklung · „Erbe Berger“', `<p><b>Grundbuch Coburg, Flurstück 1147/3 (Wegerecht Itzufer)</b> – Eigentümer: <b>Leon Berger</b>, geb. 2000.</p>
          <p><b>Maßnahmen (R. V.):</b><br>
          1. Nürnberger Schulden L. B. über Kessler aufgekauft (€ 61.400) – Druckmittel.<br>
          2. Rückkehr nach Coburg über Fischer organisiert (Wohnung Kraus, Job über Weber).<br>
          3. Bindung durch Aufträge, Dienstwagen, Gehalt.<br>
          4. Plan B: L. B. als Täter im Fall Kessler (Kleinbus Weber, Feuerzeug Autohaus Berger).<br>
          <span class="st-hand">Unterschrift bis Abstimmung am 12.! Sonst Plan B. — R.V.</span></p>`);
        await M.say([{ who: 'leon', text: 'Meine Schulden. Meine Wohnung. Mein Job. Alles war geplant. Von Anfang an.', dur: 4 }, { who: 'leon', text: 'Ich bin nicht nach Hause gekommen. Ich wurde geliefert.', dur: 3.2 }]);
        M.flag('knowsPlan');
      } },
      { name: 'Klinikum', async run(M) {
        const S = M.S, G = S.G, w = S.workshop();
        const car = ensureCar(M, P(S).x + 5, P(S).z + 5, 'kombi', '#4f8f8a');
        if (M.retry) { M.placePlayer(w.x + 14, w.z + 14); }
        if (M.mode !== 'drive') {
          if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false });
          M.objective('Bring Tobi in ein <b>Auto</b>.');
          await M.wait(() => M.mode === 'drive');
          S.world.clearTarget();
        }
        S.chars.hide('tobi');
        M.timer(200, 'Tobi hat es nicht ins Klinikum geschafft. Der Notarzt kam von allein – gerade noch rechtzeitig. Aber knapp.');
        let said = 0;
        M.every(() => {
          const lines = [{ who: 'tobi', text: 'Weißt du, was dein Vater immer gesagt hat? „Ein Auto kann man reparieren. Einen Ruf nicht.“' }, { who: 'leon', text: 'Bleib wach, Tobi.' }, { who: 'tobi', text: 'Hol dir deinen Ruf zurück, Leon. Und seinen.' }];
          if (said < lines.length && M.stageT > 6 + said * 9) M.say(lines[said++]);
          return said >= lines.length;
        });
        await M.goto(klinikum(S), { r: 16, car: true, slow: 6, name: 'Klinikum Coburg', text: 'Bring Tobi ins <b>Klinikum Coburg</b>!' });
        M.stopTimer();
        G.exitCar();
        await M.say([{ who: 'leon', text: 'Voss will meine Unterschrift bis zum Zwölften. Sonst bin ich der Mörder von Kessler.', dur: 4 }, { who: 'leon', text: 'Gut. Dann spielen wir ab jetzt nach meinen Regeln.', dur: 3 }]);
      } },
    ],
    reward: (S) => { S.rel.add('tobi', 15); return { money: 0, lines: ['Tobi ist im Klinikum in Sicherheit', 'Du weißt: Deine Rückkehr war <b>Voss’ Plan</b> – von Anfang an'] }; },
  });
})();
