// Story-Modus (seit v3.29.0), Teil 9: Kapitel 7 „Das Ende einer Geschichte“ – Missionen 31–35, die drei Enden,
// Abspann und freies Spiel nach der Story. Ende A „Neuanfang“, B „Der Aufstieg“, C „Alles verloren“ (Bedingungen:
// STORY.md 4 und storyEnding unten). Handlung: STORY.md, Kapitel 7.
'use strict';

(() => {
  const P = S => S.G.player();
  const yOf = (S, x, z) => S.G.world.heightAt(x, z);
  const beside = (S, p, d = 9) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q = S.walkable(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2); if (q && Math.hypot(q.x - p.x, q.z - p.z) > d - 2.5) return q; } return S.walkable(p.x, p.z, 15) || p; };
  const doorSpot = (S, h, out = 1) => S.walkable(h.sx + (h.ox || 0) * out, h.sz + (h.oz || 0) * out, 8) || { x: h.sx, z: h.sz };
  const carSide = (S, c, d = 2.2) => S.walkable(c.x + Math.cos(c.heading) * d, c.z - Math.sin(c.heading) * d, 4) || S.walkable(c.x - Math.cos(c.heading) * d, c.z + Math.sin(c.heading) * d, 6) || { x: c.x, z: c.z };
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
  const navPt = (S, x, z, r = 400) => { const l = S.G.nav.locate(x, z, r); return l ? { x: l.x, z: l.z } : S.road(x, z, r); };
  // Orte
  const rathaus = S => { const r = S.lm('Rathaus') || { x: -12, z: 69 }; return S.walkable(r.x + 6, r.z - 10, 18) || r; };
  const markt = S => S.walkable(0, 12, 20) || { x: 0, z: 12 };
  const gueterbahnhof = S => S.road(-289, 931, 120);
  const baustelle = S => { const r = S.road(-337, 631, 80); return S.walkable(r.x + 14, r.z - 10, 25) || r; };
  const ufer = S => { const r = S.road(-337, 631, 80); return S.walkable(r.x + (-337 - r.x) * 0.6 + 4, r.z + (631 - r.z) * 0.6, 20) || r; };   // Itzufer an der Brandruine
  const lenzOrt = S => { const h = S.home('lossau'); return h ? doorSpot(S, h, 1) : { x: -420, z: -333 }; };
  const F = S => S.state.flags;
  const evidence = S => { const f = F(S); return !!(f.serverCopy || f.vossTape || f.lenzData || f.draganTape || f.kesslerSafe); };

  // Ende aus der Wahl in M34 und dem Spielverlauf: 'A' Neuanfang, 'B' Aufstieg, 'C' Alles verloren
  const storyEnding = (S, choice) => {
    const allies = S.rel.allies(), f = F(S);
    if (choice === 'publish') return (S.rel.get('sarah') >= 20 && evidence(S)) || allies >= 2 ? 'A' : 'C';
    if (choice === 'takeover') return S.rel.get('voss') >= 0 || f.buyout ? 'B' : allies >= 2 ? 'A' : 'C';
    return 'C';
  };
  window.storyEnding = storyEnding;   // für Tests
  const ENDINGS = { A: 'Neuanfang', B: 'Der Aufstieg', C: 'Alles verloren' };

  // Requisiten aus Quadern und Schildern, beim Aufräumen entfernt
  const props = M => {
    const S = M.S, G = S.G, parts = [];
    M.onCleanup(() => { for (const p of parts) { G.scene.remove(p); p.geometry.dispose(); if (p.material.map) p.material.map.dispose(); p.material.dispose(); } });
    return {
      box(w, h, d, x, z, color, y0 = 0, ry = 0) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
        m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
        S.world.anchor(m, x, z, y0 + h / 2); G.scene.add(m); parts.push(m); return m;
      },
      sign(lines, w, h, x, z, y0, ry = 0, bg = '#0f2236', fg = '#ffffff') {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const c = cv.getContext('2d');
        c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height); c.textAlign = 'center';
        lines.forEach((L, i) => { c.fillStyle = L.c || fg; c.font = `${L.w || 700} ${Math.round(cv.height * (L.s || 0.24))}px Inter, Georgia, sans-serif`; c.fillText(L.t, 256, cv.height * L.y); });
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
        m.rotation.y = ry; S.world.anchor(m, x, z, y0); G.scene.add(m); parts.push(m); return m;
      },
    };
  };
  const buildSite = (M, c) => {
    const B = props(M);
    for (let i = -3; i <= 3; i++) { B.box(3.4, 2, 0.08, c.x + i * 3.5, c.z - 12, '#c9c9c9'); B.box(3.4, 2, 0.08, c.x + i * 3.5, c.z + 12, '#c9c9c9'); }
    B.box(6, 2.6, 2.4, c.x - 6, c.z - 4, '#d9822b'); B.box(6, 2.6, 2.4, c.x - 6, c.z - 4, '#3a6ea5', 2.6);
    B.box(1.2, 26, 1.2, c.x + 8, c.z + 4, '#e8b923'); B.box(22, 1, 1, c.x + 15, c.z + 4, '#e8b923', 25); B.box(1, 4, 1, c.x + 22, c.z + 4, '#555', 21);
    B.sign([{ t: 'VOSS PROJEKTENTWICKLUNG', y: 0.2, s: 0.12, c: '#e9b949' }, { t: 'QUARTIER ITZAUE', y: 0.48, s: 0.2, w: 800 }, { t: 'Fertigstellung 2030', y: 0.78, s: 0.1, w: 500 }], 5, 2.5, c.x, c.z - 12.2, 2.6);
  };
  const buildRuin = (M, R) => {
    const B = props(M);
    B.box(9, 2.6, 0.4, R.x, R.z - 4, '#2a2522'); B.box(0.4, 1.6, 7, R.x - 4.5, R.z, '#25201d'); B.box(3.5, 3.4, 0.4, R.x + 3, R.z + 4, '#1f1b19', 0, 0.1);
    B.sign([{ t: 'AUTOHAUS BERGER', y: 0.66, s: 0.42, w: 800, c: '#c9a646' }], 4, 1, R.x - 1, R.z - 3.7, 2.9, 0, '#2a2d33');
  };
  // Verfolger
  const hunters = (M, cars, speed = 21) => {
    let t = 99;
    const ctl = { stopped: false, stop() { this.stopped = true; for (const c of cars) if (c && c._ctl) c._ctl.stopped = true; } };
    M.every(dt => {
      if (ctl.stopped) return true;
      if ((t += dt) < 2.5) return false;
      t = 0;
      const p = M.pos;
      for (const c of cars) if (c && !c.disposed && !c.wrecked) M.autoDrive(c, { x: p.x, z: p.z }, { speed });
      return false;
    });
    return ctl;
  };
  const keepUp = (M, ctl, who, maxGap = 240, secs = 14) => {
    let lost = 0;
    return M.watch(dt => {
      if (ctl.done || ctl.stopped) return null;
      if (ctl.gap > maxGap) { lost += dt; if (lost > 1 && lost - dt <= 1) M.G.ui.toast(`Du verlierst ${who}!`, 2); } else lost = 0;
      return lost > secs ? `Du hast ${who} aus den Augen verloren.` : null;
    });
  };
  // Verbündete als Figuren um einen Punkt (Szenen in M33 und M35)
  const crowd = (M, ids, c, r = 3.2) => ids.filter(id => STORY_CAST[id]).forEach((id, i, a) => {
    const ang = i / Math.max(1, a.length) * Math.PI * 1.4 - 0.7 + Math.PI;
    const p = M.S.walkable(c.x + Math.sin(ang) * r, c.z + Math.cos(ang) * r, 4) || c;
    M.npc(id, p.x, p.z, Math.atan2(c.x - p.x, c.z - p.z));
  });
  const friends = S => { const f = F(S); const a = (f.allies || ['sarah']).filter(id => STORY_CAST[id] && !(id === 'tobi' && f.tobiOut)); for (const x of ['lenz', 'kessler']) if (!a.includes(x)) a.push(x); return a; };

  // Abspann: Text rollt von unten nach oben (≈ 34 s), Esc/Enter/Leertaste überspringt
  const credits = (M, ending) => {
    const S = M.S, f = F(S);
    M.lock++;
    const el = document.createElement('div'); el.id = 'st-credits';
    const who = [['Leon Berger', 'Der Heimkehrer'], ['Maximilian „Max“ Fischer', f.maxFate === 'verschont' ? 'Der Freund, der eine zweite Chance bekam' : 'Der Freund, der ging'],
      ['Richard Voss', ending === 'B' ? 'Der Vorgänger' : 'Der Bauunternehmer'], ['Sarah Neumann', 'Coburger Stadtbote'], ['Tobias „Tobi“ Weber', 'Kfz Weber'],
      ['Erwin', 'Bratwurststand am Markt'], ['Dr. Katharina Lenz', 'Die Kronzeugin'], ['Jürgen Kessler', 'Der Spediteur'], ['Hanna Roth', 'Kriminalhauptkommissarin'],
      ['Gül Aydın', 'Taxifahrerin und Zeugin'], ['Dragan', 'Der Brandstifter']];
    el.innerHTML = `<div class="st-cr-roll"><h1>GTA COBURG</h1><p class="st-cr-end">Zurück in der Heimat</p>
      <h2>Ende ${ending}</h2><p class="st-cr-end">${ENDINGS[ending]}</p>
      <h2>Mitwirkende</h2>${who.map(([n, r]) => `<p><b>${n}</b> · ${r}</p>`).join('')}
      <h2>Schauplatz</h2><p>Coburg und der Landkreis Coburg</p><p>Veste, Marktplatz, Rathaus, Itzaue, Glockenberg, Callenberg</p>
      <h2>Kartendaten</h2><p>© OpenStreetMap-Mitwirkende · Höhen: EU-DEM, Terrarium</p><p>Luftbilder und 3D-Gebäude: Bayerische Vermessungsverwaltung – geodaten.bayern.de · Thüringen: © GDI-Th (CC BY 4.0)</p>
      <h2>Automodelle</h2><p>Comrade1280 (CC BY 4.0)</p>
      <h2>Deine Geschichte</h2><p>${S.state.done.length} Missionen · ${S.state.stats.fails} Fehlschläge · Spielzeit ${Math.round((S.state.stats.time + M.t) / 60)} Minuten</p>
      <p>${S.rel.allies()} Verbündete an deiner Seite</p>
      <h2>Danke fürs Spielen</h2><p class="st-cr-end">Coburg gehört jetzt dir.</p><p>Freies Spiel: Rennen, Wohnungen, Autos, Online-Modus.</p></div>
      <div class="st-cr-skip"><kbd>Esc</kbd> überspringen</div>`;
    document.body.appendChild(el);
    const roll = el.querySelector('.st-cr-roll');
    return M.guard(new Promise(res => {
      let done = false;
      const end = () => { if (done) return; done = true; removeEventListener('keydown', key, true); el.style.transition = 'opacity 0.8s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 850); M.lock--; res(); };
      const key = e => { if (/^(Escape|Enter|Space)$/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); end(); } };
      setTimeout(() => addEventListener('keydown', key, true), 600);
      el.onclick = () => end();
      M.onCleanup(end);
      requestAnimationFrame(() => {
        const h = roll.offsetHeight + innerHeight;
        roll.style.transition = 'transform 34s linear'; roll.style.transform = `translateY(${-h}px)`;
        roll.addEventListener('transitionend', end, { once: true });
        setTimeout(end, 36000);
      });
    }));
  };

  // =============================================================================================================
  // Mission 31 – Der Wendepunkt
  // =============================================================================================================
  StoryMissions.add({
    id: 'm31', title: 'Der Wendepunkt', contact: 'sarah', blurb: 'Die Stadtratssitzung im Rathaus.',
    marker: S => beside(S, rathaus(S), 9),
    stages: [
      { name: 'Stadtratssitzung', async run(M) {
        const S = M.S, G = S.G, rh = rathaus(S), f = F(S);
        G.atmo.clock = 17.9;
        if (M.mode === 'drive') G.exitCar();
        const vp = beside(S, rh, 3), bp = S.walkable(vp.x + 1.6, vp.z + 0.8, 4) || vp, sp = beside(S, P(S), 2.4);
        M.npc('voss', vp.x, vp.z, Math.atan2(P(S).x - vp.x, P(S).z - vp.z));
        M.npc('brandt', bp.x, bp.z, Math.atan2(P(S).x - bp.x, P(S).z - bp.z));
        M.npc('sarah', sp.x, sp.z, Math.atan2(vp.x - sp.x, vp.z - sp.z));
        const rl = S.lm('Rathaus') || { x: -12, z: 69 }, y = yOf(S, rl.x, rl.z);
        await M.cut([{ pos: [rl.x + 26, y + 14, rl.z - 44], look: [rl.x, y + 9, rl.z], to: { pos: [rl.x + 14, y + 6, rl.z - 28] }, dur: 6, fov: 46 }], [
          { who: 'brandt', text: 'Meine Damen und Herren, Tagesordnungspunkt sieben: Bebauungsplan Quartier Itzaue. Herr Voss, bitte.', dur: 4.6 },
          { who: 'voss', text: 'Sechshundertvierzig Wohnungen. Tausend Arbeitsplätze. Coburg wächst – oder Coburg schrumpft. So einfach ist das.', dur: 4.6 },
        ]);
        await M.talk([
          { who: 'sarah', text: 'Jetzt, Leon. Tobi, schalt die Kamera auf die Leinwand.', mood: 'neutral' },
          { who: 'tobi', name: 'Tobi (Funk)', text: 'Ich … Leon, das Bild ist schwarz. Die Kamera ist weg. Einfach weg.', mood: 'worried' },
          { who: 'voss', text: 'Suchen Sie etwas, Herr Berger? Ihre Kamera hängt jetzt in meinem Büro. Sie zeigt einen sehr schönen Gummibaum.', mood: 'smug' },
          { who: 'voss', text: 'Und Ihre Server-Kopie ist verschlüsselt. Dr. Lenz’ Zugangscode wurde gestern Nacht geändert. Sie haben einen Stick voller Zahlensalat.', mood: 'smug' },
          { if: () => f.maxFate === 'verschont' && (f.allies || []).includes('max'), then: [
            { who: 'max', text: 'Ich will aussagen! Ich hab Geld von Voss bekommen, damit ich Leon –', mood: 'worried' },
            { who: 'brandt', text: 'Herr Fischer steht nicht auf der Rednerliste. Saaldiener!', mood: 'cold' }] },
          { who: 'brandt', text: 'Die Abstimmung wird vertagt. Bis die Eigentumsfragen … geklärt sind.', mood: 'neutral' },
          { who: 'voss', text: 'Bis Sie unterschrieben haben, Herr Berger. Und das werden Sie. Heute noch.', mood: 'cold' },
          { who: 'sarah', text: 'Wer hat ihm das verraten? Wir waren nur … Ich hol meine Notizen aus dem Wagen. Wir reden draußen.', mood: 'angry' },
        ], { with: ['voss', 'sarah'] });
        S.chars.remove('voss'); S.chars.remove('brandt');
        S.chars.walkTo('sarah', P(S).x + 18, P(S).z - 6, false, 8);
        await M.sleep(3);
      } },
      { name: 'Entführt', async run(M) {
        const S = M.S, G = S.G, rh = rathaus(S);
        if (M.retry) M.placePlayer(rh.x, rh.z);
        const st = S.road(P(S).x + 30, P(S).z, 120);
        M.van = M.driven('van', '#2a2c30', st.x, st.z);
        S.chars.remove('sarah');
        const sp = S.walkable(st.x + 3, st.z + 2, 4) || st;
        M.npc('sarah', sp.x, sp.z, 0);
        await M.cut([{ pos: [st.x + 9, yOf(S, st.x, st.z) + 3, st.z + 8], look: [st.x, yOf(S, st.x, st.z) + 1.2, st.z], dur: 2.6, fov: 40 }], [
          { who: 'sarah', text: 'Hey! Lassen Sie mich los! LEON!', dur: 2.4 },
        ]);
        S.chars.remove('sarah');
        M.flag('sarahTaken');
        await M.say({ who: 'leon', text: 'SARAH!', dur: 1.4 });
      } },
      { name: 'Verfolgung', async run(M) {
        const S = M.S, G = S.G, gb = gueterbahnhof(S), rh = rathaus(S);
        if (M.retry || !M.van || M.van.disposed) { if (M.retry) M.placePlayer(rh.x, rh.z); const st = S.road(P(S).x + 30, P(S).z, 120); M.van = M.driven('van', '#2a2c30', st.x, st.z); }
        const van = M.van;
        const ctl = M.autoDrive(van, gb, { speed: 17 });
        const car = ensureCar(M, P(S).x + 6, P(S).z + 6, 'sport', '#1e88ff');
        await toCar(M, car, 'Schnell! Steig in ein <b>Auto</b> – hinter den <b>Kleinbus</b>!');
        S.world.setTarget(van.x, van.z, { r: 1, name: 'Kleinbus', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T) { T.x = van.x; T.z = van.z; } return false; });
        M.objective('Bleib am <b>Kleinbus</b> dran!');
        keepUp(M, ctl, 'den Kleinbus');
        M.every(() => { if (M.stageT > 9) { M.call('voss', [{ who: 'voss', text: 'Ihre Journalistin macht eine kleine Spazierfahrt, Herr Berger. Fahren Sie vorsichtig. Für sie.' }]); return true; } return false; });
        await ctl.arrive();
        S.world.clearTarget();
        await M.goto(S.road(van.x, van.z, 30), { r: 14, name: 'Kleinbus', text: 'Zum <b>Kleinbus</b> am Güterbahnhof.' });
        if (M.mode === 'drive') G.exitCar();
        const seat = carSide(S, van);
        await M.interact(seat, 'Kleinbus durchsuchen', 2.6);
        await M.say([
          { who: 'leon', text: 'Leer. Umgestiegen. Nur Sarahs Handy, unter dem Sitz.', dur: 3 },
        ]);
        M.sms('voss', 'Baustelle Itzaue. Mitternacht. Bringen Sie den Stick und einen Stift mit. Allein. — R. V.');
        await M.sleep(3.5);
        await M.say({ who: 'leon', text: 'Allein. Natürlich. Er hat keine Ahnung, wie viele Leute ich inzwischen kenne.', dur: 3.6 });
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Voss war vorbereitet: Kamera weg, Daten verschlüsselt', '<b>Sarah wurde entführt</b> – Treffpunkt: Baustelle Itzaue, Mitternacht'] }),
  });

  // =============================================================================================================
  // Mission 32 – Die Abrechnung
  // =============================================================================================================
  StoryMissions.add({
    id: 'm32', title: 'Die Abrechnung', contact: 'voss', blurb: 'Mitternacht auf der Baustelle Itzaue.',
    marker: S => beside(S, gueterbahnhof(S), 7),
    stages: [
      { name: 'Mitternacht', async run(M) {
        const S = M.S, G = S.G, f = F(S);
        G.atmo.clock = 23.7;
        if (!f.tobiOut) await M.call('tobi', [{ who: 'tobi', text: 'Ich hab dir einen zweiten Stick gebastelt. Sieht genauso aus. Ist genauso leer. Falls du Zeit brauchst.' }, { who: 'leon', text: 'Tobi, du bist ein Genie.' }, { who: 'tobi', text: 'Weiß ich. Bring sie heil zurück.' }]);
        if (f.roth === 'verbuendet') M.sms('roth', 'Ich weiß, wo Sie hinfahren. Ich bin in der Nähe. Keine Dummheiten, Berger. — H. R.');
        const car = ensureCar(M, P(S).x + 6, P(S).z + 6, 'suv', '#222428');
        await toCar(M, car, 'Steig in ein <b>Auto</b>.');
        await M.goto(S.road(-337, 631, 80), { r: 20, car: true, slow: 6, name: 'Baustelle Itzaue', text: 'Fahr zur <b>Baustelle Itzaue</b>.' });
      } },
      { name: 'Die Übergabe', async run(M) {
        const S = M.S, G = S.G, c = baustelle(S), f = F(S);
        G.atmo.clock = Math.max(G.atmo.clock, 23.9);
        if (M.mode === 'drive') G.exitCar();
        if (M.retry) M.placePlayer(c.x - 10, c.z - 10);
        buildSite(M, c);
        const vp = S.walkable(c.x - 2, c.z + 1, 5) || c, sp = S.walkable(vp.x - 1.8, vp.z + 0.6, 4) || vp;
        const heavy = f.dragan === 'polizei' ? 'wache' : 'dragan';
        const hp = S.walkable(vp.x + 1.8, vp.z + 0.4, 4) || vp;
        M.npc('voss', vp.x, vp.z, Math.atan2(P(S).x - vp.x, P(S).z - vp.z));
        M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z));
        M.npc(heavy, hp.x, hp.z, Math.atan2(P(S).x - hp.x, P(S).z - hp.z));
        M.vossSuv = M.driven('suv', '#0d0e10', c.x - 14, c.z + 4, 0);
        await M.goto(S.walkable(vp.x - 4, vp.z - 4, 5) || vp, { r: 3, foot: true, name: 'Voss', text: 'Geh zu <b>Voss</b>.' });
        await M.talk([
          { who: 'voss', text: 'Pünktlich. Das hätte ich Ihrem Vater nie zugetraut, aber Ihnen schon.', mood: 'smug' },
          { who: 'sarah', text: 'Leon, gib ihm nichts! Er lässt uns sowieso nicht –', mood: 'angry' },
          { who: heavy, name: heavy === 'wache' ? 'Voss’ Mann' : undefined, text: 'Ruhe.', mood: 'cold' },
          { who: 'voss', text: 'Den Stick. Und Ihre Unterschrift unter das Wegerecht. Dann fährt Frau Neumann nach Hause und schreibt über Blumenschauen.', mood: 'cold' },
          { choice: [
            { text: 'Tobis Attrappe übergeben', note: 'nur mit Tobi · Zeit gewinnen', if: () => !f.tobiOut, def: true, say: 'Hier. Der Stick. Und jetzt lass sie gehen.', act: () => M.flag('fakeStick'),
              then: [{ who: 'voss', text: 'Sehr vernünftig. … Lassen Sie sie los.', mood: 'smug' }] },
            { text: 'Bluffen: „Roth steht mit drei Streifen an der Uferstraße.“', note: 'nur mit Roth', if: () => f.roth === 'verbuendet', say: 'Kommissarin Roth steht mit drei Streifen an der Uferstraße, Richard. Ein Funkspruch, und sie ist hier.', act: () => M.flag('rothBluff'),
              then: [{ who: 'voss', text: '… Sie lügen. Aber ich bin kein Mann, der Risiken eingeht. Lassen Sie sie los.', mood: 'angry' }] },
            { text: 'Unterschreiben: „Sarah ist mir wichtiger als ein Feldweg.“', note: 'Wegerecht weg · Voss ▲ · Sarah ▲', def: f.tobiOut, say: 'Gib her. Sarah ist mir wichtiger als ein Feldweg.', act: () => { M.flag('signed'); M.rel('voss', 15); M.rel('sarah', 10); },
              then: [{ who: 'voss', text: 'Sehen Sie? Am Ende unterschreiben alle. Lassen Sie sie los.', mood: 'smug' }] },
          ] },
        ], { with: ['voss', 'sarah'] });
        S.chars.walkTo('sarah', P(S).x + 1.2, P(S).z + 0.6, true, 5);
        await M.sleep(1.4);
        await M.talk([
          { if: () => !!F(S).fakeStick, then: [{ who: heavy, name: heavy === 'wache' ? 'Voss’ Mann' : undefined, text: 'Chef … der Stick ist leer. Komplett leer.', mood: 'angry' }],
            else: [{ who: heavy, name: heavy === 'wache' ? 'Voss’ Mann' : undefined, text: 'Chef, Blaulicht an der Uferstraße!', mood: 'worried' }] },
          { who: 'voss', text: 'Sie kleiner … Erledigt das hier. Ich habe einen Termin.', mood: 'angry' },
          { who: 'sarah', text: 'Er haut ab! Leon, er darf nicht weg – er hat noch den Original-Server im Wagen!', mood: 'angry' },
        ], { with: ['voss', 'sarah'] });
        S.chars.remove('voss');
      } },
      { name: 'Voss stellen', async run(M) {
        const S = M.S, G = S.G, c = baustelle(S);
        if (M.retry || !M.vossSuv || M.vossSuv.disposed) { if (M.retry) M.placePlayer(c.x - 10, c.z - 10); M.vossSuv = M.driven('suv', '#0d0e10', c.x - 14, c.z + 4, 0); }
        const vs = M.vossSuv;
        S.chars.remove('sarah'); S.chars.remove('dragan'); S.chars.remove('wache');
        // Flucht durch den Landkreis Richtung Rödental
        const goal = navPt(S, 2600, -2600, 900);
        const ctl = M.autoDrive(vs, goal, { speed: 19 });
        const car = ensureCar(M, c.x - 6, c.z - 14, 'super', '#111111');
        await toCar(M, car, 'Hinterher! Ins <b>Auto</b>!');
        S.world.setTarget(vs.x, vs.z, { r: 1, name: 'Voss', beacon: false, route: false });
        M.every(() => { const T = S.world.target; if (T) { T.x = vs.x; T.z = vs.z; } return false; });
        M.objective('Stopp <b>Voss</b>: Ramm seinen Geländewagen, bis er stehen bleibt!');
        keepUp(M, ctl, 'Voss', 260, 14);
        M.watch(() => ctl.done && vs.health >= 45 ? 'Voss ist im Landkreis verschwunden. Mitsamt dem Server.' : null);
        M.watch(() => { const k = G.car(); return k && (k.wrecked || k.burning) ? 'Dein Wagen ist hinüber. Voss ist weg.' : null; });
        const from = S.road(c.x + 120, c.z + 60, 200);
        const h = M.driven('suv', '#202226', from.x, from.z);
        const hunt = hunters(M, [h], 20);
        M.every(() => { if (M.stageT > 8) { M.call('voss', [{ who: 'voss', text: 'Sie haben gar nichts, Berger! Gar nichts!' }, { who: 'leon', text: 'Ich hab deinen Brandstifter, deinen Spediteur, deine Sekretärin. Und gleich deinen Wagen.' }]); return true; } return false; });
        vs.health = 100;
        await M.wait(() => { M.meter('Voss’ Geländewagen', vs.health / 100); return vs.health < 45 || vs.wrecked; });
        M.meter(null);
        ctl.hold = true; hunt.stop();
        S.world.clearTarget();
        await M.wait(() => Math.abs(vs.speed) < 1 && (M.mode === 'walk' || Math.abs(G.car().speed) < 2));
        if (M.mode === 'drive') G.exitCar();
        const vp = carSide(S, vs);
        M.npc('voss', vp.x, vp.z, Math.atan2(P(S).x - vp.x, P(S).z - vp.z));
        await M.talk([
          { who: 'voss', text: 'Mein Wagen. Mein … Haben Sie eine Ahnung, was der gekostet hat?', mood: 'angry' },
          { who: 'leon', text: 'Ungefähr so viel wie ein Autohaus an der Itz?', mood: 'cold' },
          { who: 'voss', text: 'Den Server bekommen Sie. Bitte. Er ist verschlüsselt. Ohne Lenz’ neuen Code ist er ein Briefbeschwerer.', mood: 'smug' },
          { who: 'leon', text: 'Dann frag ich eben Lenz.', mood: 'cold' },
        ], { with: ['voss'] });
        M.flag('serverOriginal');
        // Voss’ Leute holen ihn ab
        S.chars.walkTo('voss', vp.x + 20, vp.z + 12, true, 8).then(() => S.chars.remove('voss'));
        await M.sleep(2);
        await M.call('sarah', [
          { who: 'sarah', text: 'Leon? Mir geht’s gut. Roth hat mich am Ufer aufgelesen. Hast du den Server?' },
          { who: 'leon', text: 'Hab ich. Voss ist zu Fuß weg. Weit kommt er nicht.' },
          { who: 'sarah', text: 'Lass ihn laufen. Wir machen das anders: live. Vor ganz Coburg.' },
        ]);
      } },
    ],
    reward: (S) => { const f = F(S); return { money: 0, lines: ['<b>Sarah ist frei</b>', 'Du hast Voss’ Original-Server', f.signed ? 'Du hast das <b>Wegerecht unterschrieben</b>' : f.fakeStick ? 'Voss ist auf Tobis Attrappe hereingefallen' : 'Dein Bluff hat funktioniert'] }; },
  });

  // =============================================================================================================
  // Mission 33 – Nichts bleibt geheim
  // =============================================================================================================
  StoryMissions.add({
    id: 'm33', title: 'Nichts bleibt geheim', contact: 'lenz', blurb: 'Die Wahrheit geht live.',
    marker: S => beside(S, lenzOrt(S), 6),
    stages: [
      { name: 'Der Code', async run(M) {
        const S = M.S, G = S.G;
        G.atmo.clock = 4.6;
        if (M.mode === 'drive') G.exitCar();
        const lp = beside(S, lenzOrt(S), 2.5);
        M.npc('lenz', lp.x, lp.z, Math.atan2(P(S).x - lp.x, P(S).z - lp.z));
        await M.talk([
          { who: 'lenz', text: 'Er hat den Code geändert, ja. Aber Richard benutzt seit zwanzig Jahren dasselbe Muster. Den Geburtstag seiner Yacht.', mood: 'neutral' },
          { who: 'lenz', text: '„Itzaue2030!“ … Drin. Konten. Gutachten. Und die Überweisung an Dragan, März 2021. Zwanzigtausend, Verwendungszweck: „Abriss“.', mood: 'happy' },
          { who: 'leon', text: 'Abriss. Er hat es wirklich Abriss genannt.', mood: 'cold' },
          { who: 'lenz', text: 'Sarah wartet am Marktplatz. Der Stream läuft um sechs. Und Richards Leute wissen, dass Sie den Server haben.', mood: 'worried' },
        ], { with: ['lenz'] });
        S.chars.remove('lenz');
      } },
      { name: 'Zum Marktplatz', async run(M) {
        const S = M.S, G = S.G, mk = markt(S), lp = lenzOrt(S);
        if (M.retry) M.placePlayer(lp.x, lp.z);
        const car = ensureCar(M, P(S).x + 6, P(S).z + 6, 'kombi', '#2e6fb7');
        await toCar(M, car, 'Steig in ein <b>Auto</b> – die Daten müssen zum <b>Marktplatz</b>.');
        const from = S.road(P(S).x - 160, P(S).z + 100, 200);
        const h1 = M.driven('suv', '#15161a', from.x, from.z), h2 = M.driven('suv', '#202226', from.x + 8, from.z + 6);
        const hunt = hunters(M, [h1, h2], 21);
        M.timer(200, 'Der Stream ist ohne die Daten gestartet. Voss’ Anwälte sind schneller.');
        M.watch(() => { const k = G.car(); return k && (k.wrecked || k.burning) ? 'Der Wagen ist Schrott – und mit ihm der Server.' : null; });
        await M.goto(S.road(mk.x, mk.z, 120), { r: 26, car: true, slow: 6, name: 'Marktplatz', text: 'Bring den <b>Server</b> zu Sarah auf den <b>Marktplatz</b>. Voss’ Leute sind hinter dir!' });
        M.stopTimer(); hunt.stop();
      } },
      { name: 'Live', async run(M) {
        const S = M.S, G = S.G, mk = markt(S), f = F(S);
        G.atmo.clock = Math.max(G.atmo.clock, 5.9);
        if (M.mode === 'drive') G.exitCar();
        if (M.retry) M.placePlayer(mk.x + 8, mk.z + 8);
        const sp = beside(S, mk, 2);
        M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z));
        crowd(M, friends(S).filter(id => id !== 'sarah'), sp, 4.5);
        const y = yOf(S, mk.x, mk.z);
        await M.cut([{ pos: [mk.x + 18, y + 7, mk.z + 16], look: [sp.x, y + 1.6, sp.z], to: { pos: [mk.x + 9, y + 3, mk.z + 8] }, dur: 6, fov: 44 }], [
          { who: 'sarah', text: 'Guten Morgen, Coburg. Hier ist Sarah Neumann, live vom Marktplatz. Was Sie jetzt sehen, sollte nie jemand sehen.', dur: 5 },
        ]);
        await M.doc('Livestream · Coburger Stadtbote', `<p><b>🔴 LIVE · 4.812 Zuschauer</b></p>
          <p>Überweisung Voss Projektentwicklung → D. Petrović, 12.03.2021 · € 20.000 · „Abriss“<br>
          Gutachten Brandursache 2021: Original „Fremdtäter“ – Fassung im Gerichtsakt „Eigentümer“<br>
          Zahlungen an Stadtrat H. Brandt 2023–2026 · € 145.000 „Beratung“<br>
          Itzgrund GmbH: 61 Fahrzeuge als „Schrott“ deklariert, Geldwäsche über die Spedition Kessler</p>
          <p><span class="st-hand">@coburgerin: Das ist doch der Voss vom Plakat am Markt?!<br>@itzgrund_fan: Und Brandt hat dafür gestimmt …<br>@erwin_bratwurst: Günter, siehst du das?</span></p>`);
        await M.talk([
          { who: 'sarah', text: 'Wir sind geteilt. Bamberg, Nürnberg, München. Die Staatsanwaltschaft hat angerufen. Zweimal.', mood: 'happy' },
          { if: () => !!f.buyout, then: [{ who: 'sarah', text: 'Eine Frage noch, Leon. Die fünfundzwanzigtausend von Voss. Kommt das auch in den Artikel?', mood: 'cold' }, { who: 'leon', text: '… Das entscheide ich gleich. Ich verspreche es.', mood: 'worried' }] },
          { who: 'leon', text: 'Es ist vorbei. Endlich.', mood: 'happy' },
        ], { with: ['sarah'] });
        M.flag('streamLive');
        await M.sleep(1);
        await M.call('voss', [
          { who: 'voss', text: 'Bravo, Herr Berger. Wirklich. Ein Meisterstück.' },
          { who: 'voss', text: 'Eine letzte Sache noch, unter vier Augen. Am Ufer, wo das Autohaus stand. Ich habe Ihnen ein letztes Angebot zu machen.' },
          { who: 'leon', text: 'Ich komme. Aber nicht wegen deines Angebots.' },
        ]);
      } },
    ],
    reward: (S) => ({ money: 0, lines: ['Die Wahrheit ist <b>live</b>: Brandstiftung, Bestechung, Geldwäsche', 'Voss wartet am Itzufer – <b>allein</b>'] }),
  });

  // =============================================================================================================
  // Mission 34 – Letzte Entscheidungen
  // =============================================================================================================
  StoryMissions.add({
    id: 'm34', title: 'Letzte Entscheidungen', contact: 'voss', blurb: 'Am Ufer der Itz.',
    marker: S => beside(S, ufer(S), 10),
    stages: [
      { name: 'Am Ufer', async run(M) {
        const S = M.S, G = S.G, R = ufer(S), f = F(S);
        G.atmo.clock = 6.4;
        if (M.mode === 'drive') G.exitCar();
        buildRuin(M, R);
        const vp = S.walkable(R.x + 2, R.z + 2, 4) || R;
        M.npc('voss', vp.x, vp.z, Math.atan2(R.x - 1 - vp.x, R.z - 3.7 - vp.z));
        await M.goto(S.walkable(vp.x - 3, vp.z - 3, 4) || vp, { r: 2.6, foot: true, name: 'Voss', text: 'Geh zu <b>Voss</b> an der Brandruine.' });
        const y = yOf(S, R.x, R.z);
        await M.cut([{ pos: [R.x + 16, y + 3, R.z + 12], look: [R.x, y + 2, R.z], to: { pos: [R.x + 7, y + 2.2, R.z + 6] }, dur: 6, fov: 42 }], [
          { who: 'voss', text: 'Hier hat alles angefangen. Ihr Vater stand genau hier und hat Nein gesagt. Ich habe ihn bewundert. Und ruiniert.', dur: 5.2 },
        ]);
        const allies = S.rel.allies(), ev = evidence(S);
        await M.talk([
          { who: 'voss', text: 'In einer Stunde stehen Polizisten vor meiner Villa. Ich habe vielleicht noch Zeit für ein Geschäft. Ein letztes.', mood: 'neutral' },
          { who: 'voss', text: 'Die Voss Projektentwicklung. Alles. Firma, Grundstücke, Konten in Luxemburg. Ich überschreibe Ihnen alles – und Sie sagen dem Staatsanwalt, die Daten seien gefälscht.', mood: 'smug' },
          { who: 'leon', text: '(Reich. Mächtig. Das Penthouse am Glockenberg. Oder …)', name: 'Leon (denkt)', mood: 'worried' },
          { who: 'voss', text: 'Oder Sie tun, was Ihr Vater nie getan hat. Sie schlagen zurück. Hier ist niemand. Nur Sie, ich und der Fluss.', mood: 'cold' },
          { choice: [
            { text: 'Veröffentlichen: „Du gehst ins Gefängnis, Richard.“', note: allies >= 2 || (S.rel.get('sarah') >= 20 && ev) ? 'Ende A: Neuanfang' : 'Du stehst allein da …', def: true, say: 'Nein. Die Daten bleiben draußen. Du gehst ins Gefängnis, Richard. Und ich bau hier was Neues.', act: () => { M.flag('finalChoice', 'publish'); M.flag('ending', storyEnding(S, 'publish')); } },
            { text: 'Übernehmen: „Unterschreib. Alles.“', note: S.rel.get('voss') >= 0 || f.buyout ? 'Ende B: Der Aufstieg' : 'Voss traut dir nicht …', say: 'Unterschreib, Richard. Alles. Die Firma, die Grundstücke, die Konten.', act: () => { M.flag('finalChoice', 'takeover'); M.flag('ending', storyEnding(S, 'takeover')); } },
            { text: 'Rache: „Für Papa.“', note: 'Ende C: Alles verloren', mood: 'angry', say: 'Du hast meinen Vater umgebracht. Langsam. Fünf Jahre lang. Jetzt bist du dran.', act: () => { M.flag('finalChoice', 'revenge'); M.flag('ending', 'C'); M.flag('revenge', (f.revenge || 0) + 1); } },
          ] },
        ], { with: ['voss'] });
        const end = F(S).ending, ch = F(S).finalChoice;
        if (end === 'A') { const rp = beside(S, P(S), 6); M.npc(f.roth === 'verbuendet' ? 'roth' : 'wache', rp.x, rp.z, Math.atan2(vp.x - rp.x, vp.z - rp.z)); if (ch === 'takeover') { const sp = beside(S, P(S), 3); M.npc('sarah', sp.x, sp.z, Math.atan2(P(S).x - sp.x, P(S).z - sp.z)); } }
        if (end === 'A') await M.talk([
          ...(ch === 'takeover' ? [{ who: 'voss', text: 'Übernehmen? Sie? Ich unterschreibe Ihnen gar nichts, Sie Amateur.', mood: 'cold' }, { who: 'sarah', text: 'Leon. Hör auf. Das bist nicht du. Das war nie du.', mood: 'sad' }, { who: 'leon', text: '… Du hast recht. Danke, dass du da bist.', mood: 'sad' }] : []),
          { who: f.roth === 'verbuendet' ? 'roth' : 'wache', name: f.roth === 'verbuendet' ? undefined : 'Polizist', text: f.roth === 'verbuendet' ? 'Richard Voss, Sie sind festgenommen. Brandstiftung, Bestechung, Geldwäsche, Freiheitsberaubung. Die Liste ist lang.' : 'Polizei! Richard Voss? Sie sind festgenommen.', mood: 'cold' },
          { who: 'voss', text: 'Sie werden sehen, Berger. In fünf Jahren bin ich wieder draußen.', mood: 'angry' },
          { who: 'leon', text: 'In fünf Jahren steht hier eine Werkstatt. Komm vorbei. Ölwechsel geht aufs Haus.', mood: 'smug' },
        ], { with: ['voss'] });
        else if (end === 'B') await M.talk([
          { who: 'voss', text: 'Ich wusste es. Sie sind wie ich. Nur jünger.', mood: 'smug' },
          { who: 'leon', text: 'Ich bin nicht wie du. Ich bin besser darin.', mood: 'cold' },
          { who: 'voss', text: 'Hier. Die Vollmachten, die Konten, die Schlüssel zum Penthouse. Viel Spaß mit Coburg, Herr Berger.', mood: 'smug' },
        ], { with: ['voss'] });
        else await M.talk([
          ...(ch === 'publish' ? [{ who: 'voss', text: 'Ins Gefängnis? Und wer sagt aus? Ihre Freunde? Sie haben keine mehr, Berger. Ich habe dafür gesorgt.', mood: 'smug' }, { who: 'leon', text: '… Dann eben anders.', mood: 'angry' }] : []),
          ...(ch === 'takeover' ? [{ who: 'voss', text: 'Ihnen? Niemals. Sie sind nur der Sohn eines Pleitiers.', mood: 'cold' }, { who: 'leon', text: 'Falsche Antwort, Richard.', mood: 'angry' }] : []),
          { who: 'voss', text: 'Berger, nicht! Lassen Sie – AAH!', mood: 'surprised' },
          { who: 'leon', text: '(Er liegt im Wasser. Er lebt. Und ich hab gerade alles weggeworfen, was ich mir aufgebaut habe.)', name: 'Leon (denkt)', mood: 'sad' },
        ], { with: ['voss'] });
        S.chars.remove('voss');
      } },
      { name: 'Konsequenzen', async run(M) {
        const S = M.S, G = S.G, end = F(S).ending || 'A';
        if (end === 'A') { await M.say({ who: 'leon', text: 'Vorbei. Wirklich vorbei. Zeit für etwas Neues.', dur: 3 }); return; }
        if (end === 'B') { M.money(250000); await M.say({ who: 'leon', text: 'Zweihundertfünfzigtausend als Anfang. Und eine ganze Firma. Mal sehen, wer sich jetzt traut, Nein zu sagen.', dur: 4.4 }); return; }
        // Ende C: Fahndung, Flucht
        G.police.crime(0.2, 'Angriff auf Richard Voss! Leon Berger wird gesucht', 2);
        const car = ensureCar(M, P(S).x + 8, P(S).z + 8, 'car', '#7f8c8d');
        await M.call('sarah', [{ who: 'sarah', text: 'Leon, was hast du getan?! Die Polizei … alle suchen dich. Ich kann dir nicht mehr helfen.' }]);
        if (M.mode !== 'drive') { if (car) S.world.setTarget(car.x, car.z, { r: 3, name: 'Auto', beacon: false }); M.objective('Weg hier! <b>Auto</b> und die <b>Polizei</b> abhängen.'); }
        await M.wait(() => M.mode === 'drive' || G.police.stars === 0);
        S.world.clearTarget();
        if (G.police.stars > 0) { M.objective('Häng die <b>Polizei</b> ab!'); await M.wait(() => G.police.stars === 0); }
        M.objective(null);
        await M.say({ who: 'leon', text: 'Abgehängt. Für heute. Coburg ist zu klein für mich geworden.', dur: 3.4 });
      } },
    ],
    reward: (S) => { const e = F(S).ending || 'A'; return { money: 0, lines: [{ A: 'Voss ist <b>festgenommen</b>', B: 'Die Voss Projektentwicklung gehört jetzt <b>dir</b> (€ 250.000)', C: 'Du hast dich gerächt – und die Polizei sucht dich' }[e], `Es geht auf <b>Ende ${e} – ${ENDINGS[e]}</b> zu`] }; },
  });

  // =============================================================================================================
  // Mission 35 – Zurück in die Zukunft (Epilog je Ende, Abspann, freies Spiel)
  // =============================================================================================================
  const epilogSpot = S => {
    const e = F(S).ending || 'A';
    if (e === 'B') { const h = S.home('glocken'); return h ? doorSpot(S, h, 1.5) : S.road(254, 170); }
    if (e === 'C') { const sp = S.G.spawn; return { x: sp.x, z: sp.z }; }
    const w = S.workshop() || { x: -376, z: -856 }; return beside(S, S.road(w.x, w.z, 60), 6);
  };
  StoryMissions.add({
    id: 'm35', title: 'Zurück in die Zukunft', contact: 'leon', blurb: 'Wie es weitergeht.',
    marker: S => beside(S, epilogSpot(S), 5),
    stages: [
      { name: 'Epilog', async run(M) {
        const S = M.S, G = S.G, e = F(S).ending || 'A', f = F(S), p0 = epilogSpot(S);
        if (M.mode === 'drive') G.exitCar();
        if (G.police.stars > 0) G.police.heat = 0;
        const y = yOf(S, p0.x, p0.z);
        if (e === 'A') {
          G.atmo.clock = 16.5;
          const w = S.workshop() || { x: -376, z: -856 }, B = props(M);
          B.sign([{ t: 'BERGER & WEBER', y: 0.5, s: 0.36, w: 800, c: '#e9b949' }, { t: 'Kfz-Meisterbetrieb · seit 1994 · wieder da', y: 0.82, s: 0.12, w: 500 }], 5, 1.4, w.x, w.z, 4.2, 0, '#1c2a3a');
          M.title('Drei Monate später', 'BERGER & WEBER', 'Neueröffnung', 4);
          crowd(M, friends(S).concat(['erwin']).filter((v, i, a) => a.indexOf(v) === i && !(v === 'max' && f.maxFate !== 'verschont')), p0, 4);
          await M.cut([{ pos: [p0.x + 14, y + 6, p0.z + 12], look: [p0.x, y + 2, p0.z], to: { pos: [p0.x + 7, y + 2.6, p0.z + 6] }, dur: 7, fov: 44 }], [
            { who: 'tobi', text: 'Berger & Weber. Klingt besser als Weber & Berger, gebe ich zu. Aber nur, weil’s alphabetisch ist.', dur: 4.4 },
            { who: 'sarah', text: 'Voss wurde zu neun Jahren verurteilt. Brandt ist zurückgetreten. Und das Grundstück an der Itz gehört jetzt der Bürgerstiftung. Mit einem Spielplatz.', dur: 5.4 },
          ]);
          await M.talk([
            { if: () => f.maxFate === 'verschont', then: [{ who: 'max', text: 'Ich hab die Bratwurst-Drohne fertig. Sie fliegt. Meistens. Erwin hat schon drei bestellt.', mood: 'laugh' }] },
            { who: 'erwin', text: 'Dein Vater wäre stolz, Leon. Und jetzt alle: Bratwurst aufs Haus!', mood: 'happy' },
            { who: 'leon', text: 'Ich bin zurückgekommen, weil ich keine Wahl hatte. Ich bleibe, weil ich eine habe.', mood: 'happy' },
          ], { with: ['sarah', 'tobi'] });
        } else if (e === 'B') {
          G.atmo.clock = 20.8;
          M.title('Ein Jahr später', 'BERGER PROJEKTENTWICKLUNG', 'Penthouse am Glockenberg', 4);
          await M.cut([{ pos: [p0.x + 30, y + 40, p0.z + 30], look: [0, yOf(S, 0, 0) + 10, 0], to: { pos: [p0.x + 10, y + 22, p0.z + 10] }, dur: 8, fov: 50 }], [
            { who: 'leon', text: 'Das Quartier Itzaue heißt jetzt „Berger-Park“. Sechshundertvierzig Wohnungen. Die Mieten sind … ambitioniert.', dur: 5 },
            { who: 'leon', text: 'Voss sitzt in Untersuchungshaft. Die Daten waren „leider manipuliert“. Mein Anwalt ist sehr gut.', dur: 4.6 },
          ]);
          M.sms('tobi', 'Ich hab die Werkstatt verkauft. Nicht an dich. Mach’s gut, Leon. Ich hoffe, es war es wert.');
          await M.sleep(3);
          M.sms('sarah', 'Mein Artikel erscheint morgen. Titel: „Der neue Voss“. Du bekommst ihn vorab. Aus alter Freundschaft. — S.');
          await M.sleep(3.5);
          await M.say([{ who: 'leon', text: 'Ganz oben ist die Aussicht gut. Nur ist keiner mehr da, dem ich sie zeigen kann.', dur: 4.4 }]);
        } else {
          G.atmo.clock = 5.2;
          M.title('Zwei Tage später', 'BAHNHOF COBURG', 'Gleis 1 · 5:47 Uhr', 4);
          await M.cut([{ pos: [p0.x + 12, y + 3, p0.z + 10], look: [p0.x, y + 1.6, p0.z], to: { pos: [p0.x + 5, y + 2, p0.z + 4] }, dur: 7, fov: 40 }], [
            { who: 'leon', text: 'Hier hat alles angefangen. Ein Rucksack, Schulden und ein bester Freund, der am Bahnsteig gewartet hat.', dur: 5 },
            { who: 'leon', text: 'Jetzt wartet keiner mehr. Voss liegt im Klinikum und erzählt jedem, ich hätte ihn umbringen wollen. Vielleicht stimmt das sogar.', dur: 5.4 },
          ]);
          if (f.maxFate === 'verschont') M.sms('max', 'Ich hab gehört, du fährst. Pass auf dich auf. Und wenn du je zurückkommst – ich steh am Bahnsteig. Versprochen.');
          else M.sms('sarah', 'Ich hab die Daten trotzdem veröffentlicht. Voss wird verurteilt werden. Du auch, wenn sie dich finden. Ich hoffe, sie finden dich nicht.');
          await M.sleep(4);
          await M.black(true, 1400);
          await M.say({ who: 'leon', text: 'Nächster Halt: irgendwo anders.', dur: 3 });
          await M.black(false, 1400);
        }
        S.state.ending = e;
        S.persist();
        await M.sleep(1);
        await credits(M, e);
      } },
    ],
    reward: (S) => { const e = S.state.ending || F(S).ending || 'A'; return { money: 0, lines: [`<b>Ende ${e} – ${ENDINGS[e]}</b>`, 'Story abgeschlossen · Freies Spiel in ganz Coburg'] }; },
    after: S => {
      const e = S.state.ending;
      S.hud.flash(`<b>Story abgeschlossen – Ende ${e}: ${ENDINGS[e]}</b><br>Freies Spiel · <kbd>J</kbd> Tagebuch · „Neues Spiel“ für einen anderen Weg`, 7);
      setTimeout(() => { if (S.active) S.hud.phone('sms', { A: 'erwin', B: 'voss', C: 'gul' }[e], { A: 'Bratwurst wartet, Chef. Und Tobi sagt, du sollst morgen um acht in der Werkstatt sein. — Erwin', B: 'Glückwunsch zum Penthouse. Genießen Sie es, solange es dauert. — R. V. (JVA Kronach)', C: 'Falls du je ein Taxi zurück brauchst: Ich frag nicht, wohin. — Gül' }[e], 9); }, 9000);
    },
  });
})();
