// Läden und Lokale zum Hineingehen: Dönerläden (Döner kaufen), Gaststätten und ein Café (essen und trinken füllt
// das Leben auf), ein Modegeschäft (neue Kleidung), eine Drogerie (Verbandszeug) und eine Buchhandlung.
// Die Einrichtung folgt Fotos der echten Räume bzw. der Ketten (recherche/referenz-coburg.md, Abschnitt Innenräume).
// Baut auf der Raum-Klasse aus interiors.js auf und erweitert Property (property.js) um Türen und Menüs.
'use strict';

// Raumtypen (für die Raum-Klasse in interiors.js)
Object.assign(INTERIOR_TYPES, {
  doener: { label: 'Imbiss', title: 'Döner-Imbiss', size: 60, W: 7.5, D: 9, H: 3.1, features: [] },
  ratskeller: { label: 'Restaurant', title: 'Gewölbekeller', size: 190, W: 16, D: 12, H: 4.4, features: [] },
  gasthaus: { label: 'Gasthaus', title: 'Fränkisches Gasthaus', size: 130, W: 14, D: 9.5, H: 3.4, features: [] },
  cafe: { label: 'Café', title: 'Café und Bäckerei', size: 80, W: 10, D: 8, H: 3.3, features: [] },
  tapas: { label: 'Tapas', title: 'Spanisches Restaurant', size: 170, W: 15, D: 11, H: 3.5, features: [] },
  fashion: { label: 'Mode', title: 'Modegeschäft', size: 210, W: 16, D: 13, H: 3.6, features: [] },
  drugstore: { label: 'Drogerie', title: 'Drogeriemarkt', size: 180, W: 15, D: 12, H: 3.3, features: [] },
  books: { label: 'Bücher', title: 'Buchhandlung', size: 170, W: 14, D: 12, H: 3.4, features: [] },
});

// Speisekarten und Sortimente (Preise etwa wie 2026 in Coburg). hp: Leben, outfit: Kleidung
const VENUE_MENUS = {
  doener: [
    { n: 'Döner Kebab', d: 'Kalbfleisch, Salat, Kraut, Soße im Fladenbrot', p: 7.5, hp: 45 },
    { n: 'Dürüm', d: 'Im Yufka gerollt, mit scharfer Soße', p: 8.5, hp: 50 },
    { n: 'Döner-Teller', d: 'Mit Pommes und Salat', p: 12.9, hp: 70 },
    { n: 'Lahmacun', d: 'Türkische Pizza mit Salat', p: 6, hp: 35 },
    { n: 'Pommes', d: 'Mit Ketchup oder Mayo', p: 4, hp: 20 },
    { n: 'Ayran', d: 'Joghurtgetränk, eiskalt', p: 2, hp: 10 },
  ],
  ratskeller: [
    { n: 'Coburger Bratwurst', d: 'Zwei Stück vom Kiefernzapfen, mit Sauerkraut und Brot', p: 11.9, hp: 50 },
    { n: 'Schäufele', d: 'Fränkische Schweineschulter mit Kloß und Soße', p: 19.9, hp: 90 },
    { n: 'Coburger Klöße', d: 'Rohe Klöße mit Rahmsoße', p: 9.5, hp: 40 },
    { n: 'Obatzda mit Brezel', d: 'Bayerischer Käseaufstrich', p: 8.9, hp: 30 },
    { n: 'Helles 0,5 l', d: 'Aus der Region', p: 4.6, hp: 5 },
    { n: 'Apfelschorle 0,4 l', d: '', p: 3.9, hp: 8 },
  ],
  gasthaus: [
    { n: 'Sauerbraten', d: 'Mit Rotkohl und Kloß', p: 18.5, hp: 85 },
    { n: 'Schnitzel Wiener Art', d: 'Mit Pommes und Salat', p: 16.9, hp: 75 },
    { n: 'Coburger Bratwurst', d: 'Mit Kartoffelsalat', p: 11.5, hp: 50 },
    { n: 'Käsespätzle', d: 'Mit Röstzwiebeln', p: 13.9, hp: 60 },
    { n: 'Dunkles 0,5 l', d: 'Vom Fass', p: 4.5, hp: 5 },
  ],
  cafe: [
    { n: 'Cappuccino', d: '', p: 3.6, hp: 10 },
    { n: 'Frühstück', d: 'Brötchen, Butter, Marmelade, Ei', p: 9.8, hp: 45 },
    { n: 'Pfannkuchen', d: 'Mit Apfelmus und Zimtzucker', p: 7.9, hp: 40 },
    { n: 'Käsekuchen', d: 'Ein Stück, hausgemacht', p: 3.9, hp: 20 },
    { n: 'Butterbrezel', d: '', p: 2.4, hp: 15 },
  ],
  fashion: [
    { n: 'T-Shirt Weiß', d: 'Baumwolle', p: 9.99, outfit: { shirt: '#f2f2ee' } },
    { n: 'Hoodie Schwarz', d: 'Mit Kapuze', p: 29.99, outfit: { shirt: '#1d1e22' } },
    { n: 'Hemd Bordeaux', d: 'Slim Fit', p: 24.99, outfit: { shirt: '#7a1f2b' } },
    { n: 'Pullover Olivgrün', d: 'Grobstrick', p: 34.99, outfit: { shirt: '#5a6b3a' } },
    { n: 'Jacke Ocker', d: 'Leichte Übergangsjacke', p: 49.99, outfit: { shirt: '#c8902e' } },
    { n: 'Jeans Hellblau', d: 'Regular Fit', p: 29.99, outfit: { pants: '#7f9cc0' } },
    { n: 'Chino Beige', d: '', p: 27.99, outfit: { pants: '#c8b48e' } },
    { n: 'Jogginghose Grau', d: '', p: 19.99, outfit: { pants: '#6b6e74' } },
  ],
  drugstore: [
    { n: 'Pflaster', d: '20 Stück', p: 2.95, hp: 15 },
    { n: 'Verbandskasten', d: 'Nach DIN 13164', p: 12.95, hp: 60 },
    { n: 'Kopfschmerztabletten', d: '20 Stück', p: 4.45, hp: 25 },
    { n: 'Energydrink', d: '0,25 l', p: 1.49, hp: 8 },
    { n: 'Mineralwasser', d: '1,5 l', p: 0.89, hp: 5 },
    { n: 'Sonnencreme LSF 50', d: '200 ml', p: 6.95, hp: 0 },
  ],
  // Barcelona Coburg: typische Gerichte laut Bildern und Bewertungen; Preise geschätzt (die Karte gibt es nur als PDF)
  tapas: [
    { n: 'Gambas al Ajillo', d: 'Garnelen in Knoblauchöl, im Tonschälchen', p: 9.9, hp: 35 },
    { n: 'Champiñones al Ajillo', d: 'Champignons in Knoblauch und Petersilie', p: 6.9, hp: 25 },
    { n: 'Dátiles con Bacon', d: 'Datteln im Speckmantel', p: 7.5, hp: 25 },
    { n: 'Calamares Fritos', d: 'Frittierte Tintenfischringe mit Zitrone', p: 8.9, hp: 30 },
    { n: 'Patatas Bravas', d: 'Kartoffeln mit scharfer Soße und Alioli', p: 5.9, hp: 25 },
    { n: 'Bruschetta', d: 'Geröstetes Brot mit Tomaten', p: 6.5, hp: 20 },
    { n: 'Pan con Alioli', d: 'Brot mit hausgemachter Knoblauchcreme', p: 4.5, hp: 15 },
    { n: 'Tapas-Platte für zwei', d: 'Serrano, Käse, Gambas, Datteln, Oliven', p: 26.9, hp: 90 },
    { n: 'Paella Valenciana', d: 'Mit Huhn, Meeresfrüchten und Safran', p: 19.9, hp: 80 },
    { n: 'Solomillo', d: 'Rinderfilet vom Grill (Carne)', p: 29.9, hp: 85 },
    { n: 'Crema Catalana', d: 'Karamellisierte Creme', p: 6.5, hp: 15 },
    { n: 'Sangria 0,25 l', d: '', p: 5.5, hp: 5 },
    { n: 'Rioja 0,2 l', d: 'Vino tinto', p: 6.9, hp: 5 },
  ],
  books: [
    { n: 'Stadtführer Coburg', d: 'Veste, Ehrenburg, Altstadt', p: 14.95, hp: 0, read: 'Wusstest du? Prinz Albert, der Mann von Queen Victoria, stammte aus Coburg.' },
    { n: 'Franken-Krimi', d: 'Mord am Marktplatz', p: 12, hp: 0, read: 'Spannend! Der Täter war … nein, wird nicht verraten.' },
    { n: 'Kochbuch Fränkisch', d: 'Klöße, Schäufele, Bratwurst', p: 24, hp: 0, read: 'Rezept des Tages: Coburger Bratwurst über Kiefernzapfen grillen.' },
    { n: 'Comic', d: 'Für zwischendurch', p: 9.99, hp: 0, read: 'Kurzweilig. Du fühlst dich gut unterhalten.' },
  ],
};

// Lokale und Läden: Lage (Spielmeter) wie die geprüften Einträge in recherche/pois-coburg.json
const VENUES = [
  { id: 'stadtdoener', name: 'Stadt Döner', street: 'Judengasse 2', type: 'doener', x: -63, z: -10, theme: { menu: '#7a1414', acc: '#e8a33a' } },
  { id: 'umut', name: 'Umut’s Döner Kebab', street: 'Mohrenstraße 21', type: 'doener', x: -82, z: -279, theme: { menu: '#13324f', acc: '#f2c230' } },
  { id: 'kebaphaus', name: 'Coburger Kebaphaus', street: 'Steinweg 12', type: 'doener', x: 58, z: -261, theme: { menu: '#1e4a2a', acc: '#f0e2b6' } },
  { id: 'ratskeller', name: 'Ratskeller Coburg', street: 'Markt 1', type: 'ratskeller', x: 5, z: 62 },
  { id: 'goldkreuz', name: 'Gasthaus Goldenes Kreuz', street: 'Herrngasse 1', type: 'gasthaus', x: 54, z: -18 },
  { id: 'pfannkuechle', name: 'Café Pfannküchle', street: 'Markt 11', type: 'cafe', x: 52, z: 8 },
  { id: 'hm', name: 'H&M', street: 'Spitalgasse 16', type: 'fashion', x: 52, z: -106 },
  { id: 'mueller', name: 'Müller', street: 'Spitalgasse 3', type: 'drugstore', x: 5, z: -46 },
  { id: 'thalia', name: 'Thalia Coburg', street: 'Spitalgasse 21', type: 'books', x: 29, z: -111 },
  { id: 'barcelona', name: 'BARCELONA', street: 'Ernstplatz 1', type: 'tapas', x: -151, z: 97, road: 'Ernstplatz', garden: true, host: 'Hugo' },
];
const VENUE_COLOR = { food: '#ff8a3d', store: '#ff5fa2' };
const VENUE_FOOD = new Set(['doener', 'ratskeller', 'gasthaus', 'cafe', 'tapas']);

// ---------- gemalte Texturen ----------
function tileTex(key, base, grout, n) {
  return intCanvas(key, 256, 256, (c, w, h) => {
    const r = U.rng(U.hashStr(key)), s = w / n, col = new THREE.Color(base), tmp = new THREE.Color();
    c.fillStyle = grout; c.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      tmp.copy(col).offsetHSL(0, 0, (r() - 0.5) * 0.04);
      c.fillStyle = '#' + tmp.getHexString(); c.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    }
  }, true);
}
function brickTex() {
  return intCanvas('brick', 256, 256, (c, w, h) => {
    const r = U.rng(5);
    c.fillStyle = '#d8cfc2'; c.fillRect(0, 0, w, h);
    for (let j = 0; j < 16; j++) for (let i = -1; i < 5; i++) {
      const x = i * 64 + (j % 2) * 32, y = j * 16;
      c.fillStyle = ['#9c4f36', '#a85a3c', '#8c4530', '#b0643f', '#93503a'][Math.floor(r() * 5)];
      c.fillRect(x + 2, y + 2, 60, 12);
    }
  }, true);
}
function plasterTex() { // weißer Putz mit leichter Unruhe (Gewölbe)
  return intCanvas('plaster', 256, 256, (c, w, h) => {
    const r = U.rng(9);
    c.fillStyle = '#f1ebe0'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '120,100,80' : '255,255,255'},0.06)`; c.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
  }, true);
}
function productTex(key, palette) { // Regalfach voller bunter Packungen
  return intCanvas(key, 512, 256, (c, w, h) => {
    const r = U.rng(U.hashStr(key));
    c.fillStyle = '#f4f4f2'; c.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      let x = 4;
      while (x < w - 8) {
        const bw = 14 + r() * 26, bh = 34 + r() * 22, y = row * 64 + 60 - bh;
        c.fillStyle = palette[Math.floor(r() * palette.length)]; c.fillRect(x, y, bw, bh);
        c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x + 2, y + bh * 0.3, bw - 4, bh * 0.18);
        x += bw + 2;
      }
      c.fillStyle = '#cfd2d6'; c.fillRect(0, row * 64 + 60, w, 4);
    }
  });
}
// Menütafel über der Theke: Name, Gerichte mit Preisen und kleinen Bildchen
function menuBoardTex(key, title, items, bg, acc) {
  return intCanvas(key, 1024, 320, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = acc; c.fillRect(0, 0, w, 64);
    c.fillStyle = bg; c.font = 'bold 44px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(title, w / 2, 34);
    const cols = 3, cw = w / cols;
    items.slice(0, 6).forEach((it, i) => {
      const x = (i % cols) * cw, y = 78 + Math.floor(i / cols) * 120;
      // Bildchen: Brot/Teller in warmen Farben
      c.fillStyle = '#d9a35c'; c.beginPath(); c.ellipse(x + 62, y + 56, 46, 30, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#8a4a2a'; c.fillRect(x + 30, y + 46, 64, 12);
      c.fillStyle = '#5aa04a'; c.fillRect(x + 34, y + 40, 56, 6);
      c.fillStyle = '#d8452b'; c.fillRect(x + 40, y + 58, 20, 6);
      c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.font = 'bold 30px "Segoe UI", Arial, sans-serif';
      c.fillText(it.n, x + 120, y + 40);
      c.fillStyle = acc; c.font = 'bold 34px "Segoe UI", Arial, sans-serif';
      c.fillText(it.p.toFixed(2).replace('.', ',') + ' €', x + 120, y + 82);
    });
  });
}
// Bleiglasfenster mit goldenem Kreuz (Goldenes Kreuz)
function leadGlassTex() {
  return intCanvas('leadglass', 256, 384, (c, w, h) => {
    const r = U.rng(3);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
      c.fillStyle = `hsl(${40 + r() * 20},${30 + r() * 30}%,${72 + r() * 14}%)`; c.fillRect(x, y, 32, 32);
    }
    c.strokeStyle = '#2b2620'; c.lineWidth = 3;
    for (let y = 0; y <= h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.fillStyle = '#d4a531'; c.fillRect(w / 2 - 22, 70, 44, 220); c.fillRect(w / 2 - 80, 130, 160, 44);
    c.strokeRect(w / 2 - 22, 70, 44, 220); c.strokeRect(w / 2 - 80, 130, 160, 44);
  });
}

// Figur (Verkäufer, Gäste) aus der Spielfigur, ohne eigene Szene
function venueFigure(R, x, z, ry, look) {
  const p = new Player({ add() {} }, look);
  p.group.position.set(x, 0, z); p.group.rotation.y = ry;
  R.group.add(p.group);
  return p;
}
// gemeinsamer Abschluss: Ausgang beschriften
function venueExit(R) { const s = R.spots.find(q => q.act === 'exit'); if (s) s.label = () => 'Hinausgehen'; }

// ---------- Döner-Imbiss (nach Fotos von Stadt Döner: Salatvitrine, Spieß, Pizzaofen, Leuchttafel) ----------
function buildDoener(index, v) {
  const R = new Room('doener', index), th = v.theme;
  R.shell(new THREE.MeshLambertMaterial({ map: tileTex('tile-anth', '#4a4c50', '#2c2d30', 4) }),
    new THREE.MeshLambertMaterial({ map: tileTex('tile-white', '#f4f4f2', '#cfd0d2', 6) }), '#f8f8f6', 1.8);
  R.group.children[0].material.map.repeat.set(R.W / 1.2, R.D / 1.2);
  R.wallMeshes.forEach(m => m.material.map.repeat.set(5, 2.4));
  R.window('w', 1.2, 2.2, 1.6, 0.6);
  const steel = R.mat('#b9bec3'), dark = R.mat('#2a2c30');
  // Theke mit Salatvitrine quer durch den Raum
  const cz = -1.6;
  R.piece(-0.6, cz, 0, 5.2, 0.9, g => {
    R.pbox(g, 5.2, 0.95, 0.9, steel, 0, 0, 0);
    R.pbox(g, 5.2, 0.05, 0.95, R.mat('#d9dcdf'), 0, 0.95, 0);
    const toppings = ['#6b2a6a', '#5aa03a', '#d8452b', '#f2efe4', '#f0c330', '#2f7d3a', '#c8452b', '#e8e2c8'];
    toppings.forEach((col, i) => R.pbox(g, 0.5, 0.06, 0.32, R.mat(col), -2.2 + i * 0.6, 0.98, 0.05, false));
    R.pbox(g, 5.2, 0.5, 0.02, new THREE.MeshLambertMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.35 }), 0, 1.05, 0.38, false);
    R.pbox(g, 5.2, 0.03, 0.5, new THREE.MeshLambertMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.35 }), 0, 1.55, 0.15, false);
  });
  R.box(0.6, 0.95, 0.9, steel, 2.85, 0, cz, { solid: true }); // Kasse
  R.box(0.32, 0.22, 0.3, dark, 2.85, 0.95, cz);
  // hinter der Theke: Dönerspieß mit Grill, Pizzaofen, Arbeitsplatte
  const bz = -R.D / 2 + 0.45;
  R.box(1.0, 1.9, 0.35, R.lampMat('#ff7a2a', 1.2), -1.4, 0.4, bz - 0.15);         // Grillstrahler
  R.box(0.8, 0.12, 0.8, steel, -1.4, 0.3, bz + 0.4);
  const spit = R.cyl(0.32, 0.18, 1.0, R.mat('#8a4f2a'), -1.4, 0.45, bz + 0.4, 12);  // Fleischspieß
  R.cyl(0.02, 0.02, 1.6, steel, -1.4, 0.3, bz + 0.4, 6);
  R.anims.push(dt => { spit.rotation.y += dt * 0.8; });
  R.box(1.4, 0.75, 0.9, steel, 1.0, 1.0, bz + 0.2);                                   // Pizzaofen
  R.box(1.2, 0.12, 0.02, dark, 1.0, 1.3, bz + 0.66);
  R.box(1.4, 0.95, 0.7, steel, 1.0, 0, bz + 0.1, { solid: true });
  R.box(5.6, 0.9, 0.62, steel, 0, 0, bz + 0.05, { solid: false });
  R.solid(0, bz + 0.05, 6.2, 0.7);
  // Leuchttafel mit Speisekarte über der Arbeitsfläche
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.44), new THREE.MeshLambertMaterial({
    map: menuBoardTex('menu-' + v.id, v.name, VENUE_MENUS.doener, th.menu, th.acc), emissive: '#ffffff', emissiveIntensity: 0.55 }));
  board.material.emissiveMap = board.material.map; board.material.userData.on = 0.55; R.lamps.push(board.material);
  board.position.set(0, 2.25, -R.D / 2 + 0.03); R.group.add(board);
  // Getränkekühlschrank mit Glastür
  R.piece(R.W / 2 - 0.45, -0.2, -Math.PI / 2, 0.8, 0.7, g => {
    R.pbox(g, 0.8, 2.0, 0.7, R.mat('#d8452b'), 0, 0, 0);
    R.pbox(g, 0.66, 1.5, 0.02, R.lampMat('#dff3ff', 0.6), 0, 0.3, 0.355, false);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++)
      R.cyl(0.035, 0.035, 0.22, R.mat(['#2e7d32', '#c0392b', '#f1c40f', '#1565c0'][i]), -0.24 + j * 0.12, 0.4 + i * 0.36, 0.25, 6, g);
  });
  // Sitzplätze am Fenster
  for (const z of [1.2, 3.0]) {
    R.table(-2.55, z, 1.1, 0.75, 0.75, '#e8e2d6', '#3a3a3a');
    R.chair(-2.55, z - 0.62, 0, '#c0392b'); R.chair(-2.55, z + 0.62, Math.PI, '#c0392b');
  }
  R.box(0.04, 0.04, 2.6, steel, R.W / 2 - 0.25, 1.05, 2.4); // Stehtisch-Ablage
  R.box(0.3, 0.04, 2.6, R.mat('#e8e2d6'), R.W / 2 - 0.15, 1.05, 2.4, { solid: true });
  R.ceilingLamp(-1, cz, '#fff6e8', 0.22); R.ceilingLamp(-2.5, 2.1, '#fff6e8', 0.22); R.ceilingLamp(1.8, 2.4, '#fff6e8', 0.22);
  R.plant(R.W / 2 - 0.4, R.D / 2 - 0.5, 0.9);
  venueFigure(R, -0.4, cz - 0.95, 0, { shirt: '#f4f4f2', pants: '#2c2f38', hair: '#1d1712' });
  R.spot(-0.4, cz + 0.85, 1.3, () => 'Bestellen', 'order');
  venueExit(R);
  return R;
}

// ---------- Ratskeller: Gewölbe, Bögen, Hängelampen, dunkles Holz, Bogenfenster ----------
function buildRatskeller(index) {
  const R = new Room('ratskeller', index);
  const plaster = new THREE.MeshLambertMaterial({ map: plasterTex() });
  R.shell(new THREE.MeshLambertMaterial({ map: planksTex('oak-smoked', '#5a3b24', 0.1, 6) }), plaster, '#efe7da', -5);
  R.group.children[0].material.map.repeat.set(R.W / 3, R.D / 3);
  const { W, D, H } = R;
  // zwei Tonnengewölbe in Längsrichtung, dazwischen Pfeiler mit Gurtbögen
  const springY = 2.7, vr = W / 4;
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(vr, vr, D, 24, 1, true, -Math.PI / 2, Math.PI);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: plasterTex(), side: THREE.BackSide, emissive: '#f1ebe0', emissiveIntensity: 0.45 }));
    m.material.userData.on = 0.45; R.lamps.push(m.material);
    m.rotation.x = -Math.PI / 2; m.position.set(sx * vr, springY, 0);
    m.scale.set(1, 1, (H - springY) / vr);
    R.group.add(m);
  }
  const stone = R.mat('#d8cfc0');
  for (const z of [-D / 4, D / 4]) {
    R.box(0.7, springY, 0.7, stone, 0, 0, z, { solid: true });
    R.box(0.9, 0.2, 0.9, stone, 0, springY - 0.2, z);
  }
  // Gurtbögen quer (Halbringe)
  for (const z of [-D / 4, D / 4]) for (const sx of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(vr - 0.15, 0.18, 6, 18, Math.PI), stone);
    arc.position.set(sx * vr, springY, z); arc.scale.set(1, (H - springY - 0.15) / (vr - 0.15), 1); R.group.add(arc);
  }
  // Bogenfenster an der Nordwand
  for (const x of [-4.2, 4.2]) R.window('n', x, 2.0, 2.0, 1.0);
  // geschwungene Theke mit Flaschenregal
  R.counter(5.6, 3.6, -Math.PI / 2, 3.6, '#4a2c18', '#2a1a10');
  R.piece(W / 2 - 0.2, 3.6, -Math.PI / 2, 3.4, 0.3, g => {
    R.pbox(g, 3.4, 1.6, 0.3, R.mat('#3a2414'), 0, 1.0, 0);
    for (let i = 0; i < 14; i++) R.cyl(0.04, 0.04, 0.3, R.mat(['#2e5d32', '#7a2a1a', '#d8b65a', '#e8e2c8'][i % 4]), -1.5 + i * 0.23, 1.62, 0.05, 6, g);
    R.pbox(g, 3.4, 0.04, 0.3, R.lampMat('#ffd49a', 0.9), 0, 2.58, 0.02, false);
  }, false);
  // Tische mit Stühlen
  const wood = '#5b3a22';
  for (const [x, z] of [[-5.2, -3.4], [-2.4, -3.4], [2.4, -3.4], [5.2, -3.4], [-5.2, 0.4], [-2.4, 0.4], [2.4, 0.4], [-5.2, 3.6], [-2.4, 3.6]]) {
    R.table(x, z, 1.4, 0.85, 0.76, wood, '#2a1a10');
    R.chair(x - 0.4, z - 0.68, 0, '#7a4a28'); R.chair(x + 0.4, z - 0.68, 0, '#7a4a28');
    R.chair(x - 0.4, z + 0.68, Math.PI, '#7a4a28'); R.chair(x + 0.4, z + 0.68, Math.PI, '#7a4a28');
    R.cyl(0.005, 0.005, H - 2.4, R.mat('#222'), x, 2.4, z, 4);
    R.cyl(0.07, 0.12, 0.2, R.lampMat('#ffcf80', 1.6), x, 2.25, z, 10);
  }
  R.painting('w', -3, 1.9, 0.9, 0.7, 31); R.painting('w', 1.5, 1.9, 0.9, 0.7, 32); R.painting('e', -2.5, 1.9, 0.9, 0.7, 33);
  R.plant(-W / 2 + 0.5, D / 2 - 0.6, 1.2); R.plant(W / 2 - 0.5, -D / 2 + 0.6, 1.2);
  venueFigure(R, 4.4, 2.6, Math.PI / 2, { shirt: '#1d1d1d', pants: '#1d1d1d', hair: '#6b4a2a' }); // Bedienung
  venueFigure(R, -2.0, 0.0, -2.4, { shirt: '#3a6ea8', pants: '#2c2f38' });
  venueFigure(R, 2.8, -3.0, 2.2, { shirt: '#b5651d', pants: '#3a3a3a', hair: '#cfc7b8' });
  R.spot(4.4, 3.6, 1.4, () => 'Bestellen', 'order');
  venueExit(R);
  return R;
}

// ---------- Gasthaus Goldenes Kreuz: Holzbalken, Täfelung, weiße Tischdecken, Bleiglasfenster ----------
function buildGasthaus(index) {
  const R = new Room('gasthaus', index);
  R.shell(new THREE.MeshLambertMaterial({ map: planksTex('oak-warm', '#7a4e2c', 0.1, 6) }),
    new THREE.MeshLambertMaterial({ color: '#efe2c8' }), '#3a2616', -4.5);
  R.group.children[0].material.map.repeat.set(R.W / 3, R.D / 3);
  const { W, D, H } = R, dark = R.mat('#3a2414');
  // Deckenbalken und Wandtäfelung
  for (let x = -W / 2 + 0.8; x < W / 2; x += 1.6) R.box(0.22, 0.26, D, dark, x, H - 0.26, 0, { shadow: false });
  R.box(W, 1.2, 0.05, dark, 0, 0, -D / 2 + 0.03, { shadow: false });
  R.box(0.05, 1.2, D, dark, -W / 2 + 0.03, 0, 0, { shadow: false });
  R.box(0.05, 1.2, D, dark, W / 2 - 0.03, 0, 0, { shadow: false });
  // Bleiglasfenster mit goldenem Kreuz an der Stirnwand
  const lead = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ map: leadGlassTex() }));
  lead.position.set(0, 1.9, -D / 2 + 0.04); R.group.add(lead);
  R.box(1.8, 0.1, 0.1, dark, 0, 0.65, -D / 2 + 0.06);
  // zwei lange Tafeln mit weißer Decke und rotem Läufer, Tischlampen
  for (const x of [-3.2, 3.2]) {
    R.piece(x, -0.4, 0, 1.3, 6.4, g => {
      R.pbox(g, 1.3, 0.04, 6.4, R.mat('#f7f4ee'), 0, 0.74, 0);
      R.pbox(g, 1.34, 0.25, 6.44, R.mat('#f7f4ee'), 0, 0.5, 0);
      R.pbox(g, 0.36, 0.005, 6.4, R.mat('#9a1f22'), 0, 0.78, 0);
      for (const z of [-2.2, 0, 2.2]) { R.cyl(0.03, 0.05, 0.3, R.mat('#c9a646'), 0, 0.78, z, 8, g); R.cyl(0.1, 0.16, 0.18, R.lampMat('#fff1d6', 1.3), 0, 1.06, z, 14, g); }
    });
    for (let z = -3.2; z <= 2.4; z += 0.8) { R.chair(x - 0.9, z, Math.PI / 2, '#5a3820'); R.chair(x + 0.9, z, -Math.PI / 2, '#5a3820'); }
  }
  R.counter(0, D / 2 - 1.2, Math.PI, 3.0, '#4a2c18', '#2a1a10');
  R.painting('w', -1.5, 1.95, 1.0, 0.75, 41); R.painting('e', 1.5, 1.95, 1.0, 0.75, 42);
  R.ceilingLamp(-3.2, -0.4, '#ffe6b8', 0.3); R.ceilingLamp(3.2, -0.4, '#ffe6b8', 0.3);
  venueFigure(R, 0.3, D / 2 - 1.95, 0, { shirt: '#f4f4f2', pants: '#1d1d1d', hair: '#3a2a1a' });
  venueFigure(R, -4.1, 1.6, Math.PI / 2, { shirt: '#4a6a3a', pants: '#3a3a3a' });
  R.spot(0, D / 2 - 2.0, 1.3, () => 'Bestellen', 'order');
  venueExit(R);
  return R;
}

// ---------- Café: Theke mit Brotkisten und Kuchenvitrine, Ziegelwand, Kronleuchter, langer Holztisch ----------
function buildCafe(index) {
  const R = new Room('cafe', index);
  R.shell(new THREE.MeshLambertMaterial({ map: planksTex('oak-honey', '#b07a48', 0.08, 6) }),
    new THREE.MeshLambertMaterial({ color: '#ece6dc' }), '#fbf8f2', 3);
  R.group.children[0].material.map.repeat.set(R.W / 3, R.D / 3);
  const { W, D } = R;
  R.box(W, R.H, 0.04, new THREE.MeshLambertMaterial({ map: brickTex() }), 0, 0, -D / 2 + 0.03, { shadow: false }).material.map.repeat.set(4, 1.6);
  R.window('e', 0.5, 2.4, 1.8, 0.5);
  // Theke mit Granitplatte, Brotkisten und Kuchenvitrine
  R.piece(-2.2, -1.9, 0, 4.4, 0.8, g => {
    R.pbox(g, 4.4, 0.95, 0.8, R.mat('#c8955c'), 0, 0, 0);
    R.pbox(g, 4.5, 0.05, 0.85, R.mat('#5a5048'), 0, 0.95, 0);
    for (let i = 0; i < 4; i++) {
      R.pbox(g, 0.55, 0.16, 0.4, R.mat('#c08a4a'), -1.7 + i * 0.62, 1.0, -0.1, false);
      for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), R.mat(k % 2 ? '#d49a52' : '#c4823a')); b.position.set(-1.85 + i * 0.62 + (k % 3) * 0.15, 1.17, -0.18 + Math.floor(k / 3) * 0.15); g.add(b); }
    }
    R.pbox(g, 1.6, 0.45, 0.6, new THREE.MeshLambertMaterial({ color: '#dff0f5', transparent: true, opacity: 0.35 }), 1.3, 1.0, 0.05, false);
    for (let i = 0; i < 4; i++) R.cyl(0.13, 0.13, 0.1, R.mat(['#f3e2b8', '#6b3a1e', '#e8c3c8', '#f0d36a'][i]), 0.75 + i * 0.37, 1.04, 0.05, 14, g);
  });
  R.box(0.5, 0.45, 0.45, R.mat('#c9ccd0'), -4.2, 0.95, -D / 2 + 0.5); // Siebträger
  R.box(5.0, 0.9, 0.6, R.mat('#c8955c'), -2.4, 0, -D / 2 + 0.35, { solid: true });
  // langer Holztisch mit dunkelgrünen Stühlen, Kronleuchter
  R.table(1.6, 1.4, 4.2, 1.0, 0.76, '#6a4426', '#2a1a10');
  for (let i = 0; i < 4; i++) { R.chair(0.2 + i * 0.95, 0.65, 0, '#2f4a3a'); R.chair(0.2 + i * 0.95, 2.15, Math.PI, '#2f4a3a'); }
  for (const x of [0.6, 2.6]) {
    R.cyl(0.01, 0.01, 0.5, R.mat('#333'), x, R.H - 0.5, 1.4, 6);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; R.cyl(0.04, 0.05, 0.12, R.lampMat('#fff1d0', 1.6), x + Math.cos(a) * 0.32, R.H - 0.85, 1.4 + Math.sin(a) * 0.32, 8); }
    R.cyl(0.36, 0.2, 0.08, R.mat('#c9b48a'), x, R.H - 0.9, 1.4, 16);
  }
  R.table(-3.6, 2.2, 0.8, 0.8, 0.76, '#e8e2d6', '#2a2a2a'); R.chair(-3.6, 1.6, 0, '#2f4a3a'); R.chair(-3.6, 2.8, Math.PI, '#2f4a3a');
  R.plant(W / 2 - 0.5, -D / 2 + 0.5, 1.1); R.painting('w', 0, 1.8, 1.2, 0.8, 51);
  venueFigure(R, -2.2, -2.75, 0, { shirt: '#f4f4f2', pants: '#3a2a1a', hair: '#8a5a2a' });
  venueFigure(R, 1.2, 0.65, 0.2, { shirt: '#c97a9a', pants: '#2c2f38', hair: '#d8b878' });
  R.spot(-2.2, -1.0, 1.3, () => 'Bestellen', 'order');
  venueExit(R);
  return R;
}

// ---------- Modegeschäft (nach H&M-Filialen: helle Fliesen, Kleiderstangen, Tische mit Stapeln, Puppen) ----------
function buildFashion(index) {
  const R = new Room('fashion', index);
  R.shell(new THREE.MeshLambertMaterial({ map: tileTex('tile-light', '#dedbd5', '#c9c6c0', 2) }),
    new THREE.MeshLambertMaterial({ color: '#f6f5f2' }), '#ffffff', 0);
  R.group.children[0].material.map.repeat.set(R.W / 1.2, R.D / 1.2);
  const { W, D } = R, metal = R.mat('#2a2b2e');
  const garments = ['#1d1e22', '#f2f2ee', '#7a1f2b', '#5a6b3a', '#c8902e', '#7f9cc0', '#c8b48e', '#6b6e74', '#d8a0b0', '#2e4a7a'];
  const rack = (x, z, ry, len, seed) => R.piece(x, z, ry, len, 0.6, g => {
    const r = U.rng(seed);
    R.pbox(g, 0.04, 1.5, 0.04, metal, -len / 2, 0, 0); R.pbox(g, 0.04, 1.5, 0.04, metal, len / 2, 0, 0);
    R.pbox(g, len, 0.03, 0.03, metal, 0, 1.48, 0);
    for (let s = -len / 2 + 0.1; s < len / 2 - 0.05; s += 0.09) R.pbox(g, 0.05, 0.7 + r() * 0.25, 0.5, R.mat(garments[Math.floor(r() * garments.length)]), s, 0.55, 0, false);
  });
  for (const z of [-3.0, 0.2]) { rack(-4.5, z, 0, 3.0, 11 + z); rack(-0.5, z, 0, 3.0, 21 + z); }
  // Tische mit gefalteten Stapeln
  for (const [x, z] of [[4.2, -2.5], [4.2, 1.0]]) R.piece(x, z, 0, 2.0, 1.0, g => {
    R.pbox(g, 2.0, 0.8, 1.0, R.mat('#d8cbb4'), 0, 0, 0);
    for (let i = 0; i < 6; i++) R.pbox(g, 0.5, 0.18, 0.36, R.mat(garments[(i * 3 + x | 0) % garments.length]), -0.65 + (i % 3) * 0.65, 0.8, i < 3 ? -0.22 : 0.22, false);
  });
  // Wandregale mit Kleidung
  R.piece(0, -D / 2 + 0.3, 0, W - 1, 0.5, g => {
    for (let i = 0; i < 4; i++) R.pbox(g, W - 1, 0.03, 0.45, R.mat('#e8e6e2'), 0, 0.5 + i * 0.5, 0, false);
    const r = U.rng(4);
    for (let i = 0; i < 4; i++) for (let x = -W / 2 + 0.8; x < W / 2 - 0.8; x += 0.55) R.pbox(g, 0.45, 0.16, 0.36, R.mat(garments[Math.floor(r() * garments.length)]), x, 0.53 + i * 0.5, 0, false);
  });
  // Schaufensterpuppen
  venueFigure(R, -5.6, 3.6, Math.PI, { shirt: '#1d1e22', pants: '#7f9cc0', skin: '#efefef', hair: '#efefef' });
  venueFigure(R, -4.6, 3.8, Math.PI, { shirt: '#c8902e', pants: '#c8b48e', skin: '#efefef', hair: '#efefef' });
  R.box(2.6, 0.12, 1.2, R.mat('#e8e6e2'), -5.1, 0, 3.7, { solid: true });
  // Umkleidekabinen an der Westwand und Kasse mit rotem Schild
  for (let i = 0; i < 3; i++) R.piece(-W / 2 + 0.7, -1.4 + i * 1.3, Math.PI / 2, 1.2, 1.2, g => {
    R.pbox(g, 0.04, 2.2, 1.2, R.mat('#f6f5f2'), 0.6, 0, 0); R.pbox(g, 1.2, 2.0, 0.04, R.mat('#8a8d92'), 0, 0.1, 0.6);
  });
  R.counter(4.6, 4.6, Math.PI, 3.0, '#f6f5f2', '#2a2b2e');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshLambertMaterial({ map: intCanvas('hm-logo', 256, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#e50010'; c.font = 'italic bold 84px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H&M', w / 2, h / 2 + 4);
  }) }));
  sign.position.set(4.6, 2.5, D / 2 - 0.04); sign.rotation.y = Math.PI; R.group.add(sign);
  for (let x = -6; x <= 6; x += 3) for (const z of [-3, 1.5]) R.ceilingLamp(x, z, '#ffffff', 0.18);
  venueFigure(R, 4.6, 5.3, Math.PI, { shirt: '#1d1e22', pants: '#1d1e22', hair: '#d8b878' });
  R.spot(-W / 2 + 1.7, -0.1, 1.5, () => 'Umkleide: Kleidung kaufen', 'order');
  R.spot(4.6, 3.8, 1.3, () => 'Kasse', 'order');
  venueExit(R);
  return R;
}

// ---------- Drogerie (nach Müller-Filialen: helle Gänge mit Regalen, orange Schilder, Kasse) ----------
function buildDrugstore(index) {
  const R = new Room('drugstore', index);
  R.shell(new THREE.MeshLambertMaterial({ map: tileTex('tile-grey', '#d9d9d6', '#c4c4c1', 2) }),
    new THREE.MeshLambertMaterial({ color: '#f7f7f5' }), '#ffffff', -5);
  R.group.children[0].material.map.repeat.set(R.W / 1.2, R.D / 1.2);
  const { W, D } = R;
  const tex = productTex('prod-drug', ['#e2001a', '#0058a3', '#ffd400', '#00a54f', '#f39200', '#ffffff', '#9b59b6', '#ff8fb1', '#1d1d1d']);
  const shelf = (x, z, len) => R.piece(x, z, 0, len, 1.0, g => {
    R.pbox(g, len, 1.75, 0.2, R.mat('#e6e6e3'), 0, 0, 0);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.1, 1.5), new THREE.MeshLambertMaterial({ map: tex }));
      p.position.set(0, 0.85, s * 0.42); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p);
      R.pbox(g, len, 0.06, 0.42, R.mat('#e6e6e3'), 0, 0.05, s * 0.25, false);
    }
    R.pbox(g, len, 0.32, 0.04, R.mat('#f39200'), 0, 1.95, 0, false);
  });
  for (const z of [-3.4, -0.6, 2.2]) { shelf(-3.6, z, 5.0); shelf(3.0, z, 5.0); }
  // Wandregal Kosmetik
  R.piece(0, -D / 2 + 0.25, 0, W - 1, 0.4, g => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.9), new THREE.MeshLambertMaterial({ map: productTex('prod-cosm', ['#f2d7d5', '#d4a5a5', '#1d1d1d', '#c9a65a', '#ffffff', '#8e44ad', '#e74c3c']) }));
    p.position.set(0, 1.05, 0.21); g.add(p);
    R.pbox(g, W - 1, 0.3, 0.4, R.mat('#f39200'), 0, 2.15, 0, false);
  });
  R.counter(5.0, D / 2 - 1.3, Math.PI, 3.2, '#f39200', '#2a2b2e');
  R.box(0.35, 0.3, 0.35, R.mat('#2a2b2e'), 4.4, 0.9, D / 2 - 1.3);
  for (let x = -6; x <= 6; x += 3) for (const z of [-2, 1.2]) R.ceilingLamp(x, z, '#ffffff', 0.18);
  venueFigure(R, 5.0, D / 2 - 0.65, Math.PI, { shirt: '#f39200', pants: '#2c2f38', hair: '#3a2a1a' });
  venueFigure(R, -0.3, -2.0, 1.4, { shirt: '#5a8a5a', pants: '#2c2f38', hair: '#cfc7b8' });
  R.spot(5.0, D / 2 - 2.1, 1.4, () => 'Kasse', 'order');
  venueExit(R);
  return R;
}

// ---------- Buchhandlung (nach Thalia-Filialen: schwarze Regale, Fischgrätparkett, Tische mit Stapeln) ----------
function buildBooks(index) {
  const R = new Room('books', index);
  R.shell(new THREE.MeshLambertMaterial({ map: planksTex('oak-grey', '#8f7a64', 0.1, 10) }),
    new THREE.MeshLambertMaterial({ color: '#f1efe9' }), '#ffffff', -4);
  R.group.children[0].material.map.repeat.set(R.W / 2.5, R.D / 2.5);
  const { W, D } = R;
  for (let x = -W / 2 + 1.3; x < W / 2 - 1; x += 2.5) R.bookshelf(x, -D / 2 + 0.2, 0, 2.4, 2.4, '#1f2226', 70 + x);
  for (let z = -3.5; z < 3; z += 2.5) R.bookshelf(-W / 2 + 0.2, z, Math.PI / 2, 2.4, 2.4, '#1f2226', 90 + z);
  for (const [x, z] of [[-2.5, -1.2], [1.0, -1.2], [-2.5, 1.8], [1.0, 1.8]]) R.piece(x, z, 0, 1.8, 1.0, g => {
    R.pbox(g, 1.8, 0.8, 1.0, R.mat('#b08a5a'), 0, 0, 0);
    const r = U.rng(x * 7 + z);
    for (let i = 0; i < 8; i++) R.pbox(g, 0.3, 0.05 + r() * 0.2, 0.42, R.mat(['#8e2c2c', '#2c4a8e', '#2e7d4f', '#d8b65a', '#e0dccf', '#1f2a36'][i % 6]), -0.68 + (i % 4) * 0.45, 0.8, i < 4 ? -0.24 : 0.24, false);
  });
  // Leseecke mit Sesseln und Kasse
  R.sofa(5.2, -3.6, -Math.PI / 2, 1.0, 0.9, '#6b2a2a', '#7a3434');
  R.sofa(5.2, -2.2, -Math.PI / 2, 1.0, 0.9, '#6b2a2a', '#7a3434');
  R.counter(4.6, D / 2 - 1.2, Math.PI, 3.0, '#1f2226', '#b08a5a');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshLambertMaterial({ map: intCanvas('bestseller', 512, 116, (c, w, h) => {
    c.fillStyle = '#1f2226'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.font = 'bold 60px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BESTSELLER', w / 2, h / 2 + 3);
  }) }));
  sign.position.set(0, 2.85, -D / 2 + 0.05); R.group.add(sign);
  for (let x = -5; x <= 5; x += 2.5) R.ceilingLamp(x, 0, '#fff4e0', 0.18);
  R.plant(W / 2 - 0.5, -D / 2 + 0.5, 1.2);
  venueFigure(R, 4.6, D / 2 - 0.55, Math.PI, { shirt: '#7a1f2b', pants: '#1d1d1d', hair: '#2a1a10' });
  venueFigure(R, -1.4, -3.9, Math.PI, { shirt: '#3a6ea8', pants: '#2c2f38' });
  R.spot(4.6, D / 2 - 2.0, 1.3, () => 'Kasse', 'order');
  venueExit(R);
  return R;
}

// ---------- Barcelona (Tapas): Sandsteinwände mit Strahlern, Rundbogen, Holztische, Wandbank, Kaminzimmer, Bar ----------
function sandstoneTex() { // Quadermauerwerk aus hellem Sandstein (wie im Gastraum des Barcelona)
  return intCanvas('sandstone', 512, 512, (c, w, h) => {
    const r = U.rng(21);
    c.fillStyle = '#b89c70'; c.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const bh = 40 + Math.floor(r() * 30);
      let x = -r() * 80;
      while (x < w) {
        const bw = 70 + r() * 90, g = new THREE.Color('#d6bd8e').offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.09);
        c.fillStyle = '#' + g.getHexString(); c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(${r() < 0.5 ? '90,70,40' : '255,240,210'},0.12)`; c.fillRect(x + r() * bw, y + r() * bh, 3 + r() * 10, 2 + r() * 4); }
        x += bw;
      }
      y += bh;
    }
  }, true);
}
function spainPosterTex() { // Plakat in Rot-Gelb mit Schriftzug
  return intCanvas('spain-poster', 256, 360, (c, w, h) => {
    c.fillStyle = '#f2c230'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b3261e'; for (let i = 0; i < 4; i++) c.fillRect(0, 40 + i * 70, w, 32);
    c.fillStyle = '#1d1d1d'; c.beginPath(); c.arc(w / 2, 150, 46, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b3261e'; c.beginPath(); c.moveTo(w / 2 - 50, 190); c.quadraticCurveTo(w / 2, 330, w / 2 + 70, 210); c.fill();
    c.fillStyle = '#ffffff'; c.font = 'bold 40px Georgia, serif'; c.textAlign = 'center'; c.fillText('BARCELONA', w / 2, 340);
  });
}
// Tapas auf einem Tisch (nach den Essensfotos): Tonschälchen mit Gambas oder Champignons, weißer Teller mit
// Garnelen und Paprika, Brot mit Alioli, zwei Gläser Rotwein. Mitte x, z, Tischhöhe y
function tapasOnTable(R, g, x, z, y, seed) {
  const r = U.rng(seed), clay = R.mat('#b5562a'), plate = R.mat('#f7f5f0');
  const dish = (dx, dz, kind) => {
    if (kind === 0) { // Gambas al Ajillo
      R.cyl(0.11, 0.08, 0.05, clay, x + dx, y, z + dz, 14, g);
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.012, 5, 8, 4.2), R.mat('#f08a5a'));
        s.position.set(x + dx + Math.cos(i * 1.3) * 0.05, y + 0.055, z + dz + Math.sin(i * 1.3) * 0.05); s.rotation.x = -Math.PI / 2; g.add(s);
      }
    } else if (kind === 1) { // Champiñones al Ajillo
      R.cyl(0.11, 0.08, 0.05, clay, x + dx, y, z + dz, 14, g);
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6, 0, 6.3, 0, 1.6), R.mat('#a8865a'));
        m.position.set(x + dx + Math.cos(i) * 0.05, y + 0.05, z + dz + Math.sin(i) * 0.05); g.add(m);
      }
    } else if (kind === 2) { // Garnelen mit Paprika auf weißem Oval
      const p = R.cyl(0.18, 0.16, 0.02, plate, x + dx, y, z + dz, 18, g); p.scale.z = 0.62;
      for (let i = 0; i < 4; i++) R.pbox(g, 0.07, 0.025, 0.03, R.mat(['#f08a5a', '#e8c43a', '#4f9a3a', '#d8452b'][i]), x + dx - 0.09 + i * 0.06, y + 0.02, z + dz + (r() - 0.5) * 0.06, false);
    } else { // Brot mit Alioli
      R.cyl(0.14, 0.12, 0.02, plate, x + dx, y, z + dz, 16, g);
      R.pbox(g, 0.16, 0.04, 0.07, R.mat('#d8a860'), x + dx - 0.03, y + 0.02, z + dz, false);
      R.cyl(0.04, 0.035, 0.03, R.mat('#f4eedc'), x + dx + 0.07, y + 0.02, z + dz, 10, g);
    }
  };
  [[-0.22, -0.12], [0.18, -0.1], [-0.05, 0.14], [0.26, 0.15]].forEach(([dx, dz], i) => { if (r() < 0.85) dish(dx, dz, (i + seed) % 4); });
  for (const [dx, dz] of [[-0.35, 0.22], [0.38, -0.25]]) {
    R.cyl(0.003, 0.03, 0.12, R.mat('#dde6ea', { transparent: true, opacity: 0.5 }), x + dx, y, z + dz, 8, g);
    R.cyl(0.035, 0.03, 0.06, R.mat('#7a1424'), x + dx, y + 0.11, z + dz, 10, g);
  }
}

function buildTapas(index) {
  const R = new Room('tapas', index);
  const stone = new THREE.MeshLambertMaterial({ map: sandstoneTex() });
  R.shell(new THREE.MeshLambertMaterial({ map: planksTex('oak-dark2', '#5a3a22', 0.1, 7) }), stone, '#efe4cc', -4.5);
  R.group.children[0].material.map.repeat.set(R.W / 3, R.D / 3);
  R.wallMeshes.forEach(m => m.material.map.repeat.set(3, 1));
  const { W, D, H } = R;
  // Strahler an den Längswänden (warmes Licht auf den Stein)
  for (let x = -W / 2 + 1; x < W / 2; x += 1.8) for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) R.box(0.25, 0.06, 0.06, R.lampMat('#ffd9a0', 1.6), x, H - 0.3, z, { shadow: false });
  // Zwischenwand aus Sandstein mit Rundbogen (wie die Durchgänge auf den Fotos); dahinter das Kaminzimmer
  const wx = 2.2, arch = 2.4, aH = 2.6;
  const sh = new THREE.Shape();
  sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(D / 2, H); sh.lineTo(-D / 2, H); sh.lineTo(-D / 2, 0);
  const hole = new THREE.Path();
  hole.moveTo(-arch / 2, 0); hole.lineTo(-arch / 2, aH - arch / 2); hole.absarc(0, aH - arch / 2, arch / 2, Math.PI, 0, true); hole.lineTo(arch / 2, 0); hole.lineTo(-arch / 2, 0);
  sh.holes.push(hole);
  const wallG = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false, curveSegments: 16 });
  const uvA = wallG.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) / 3, uvA.getY(i) / 3);
  const wm = new THREE.Mesh(wallG, stone); wm.rotation.y = Math.PI / 2; wm.position.set(wx - 0.25, 0, 0);
  wm.receiveShadow = true; R.group.add(wm);
  R.solid(wx, -D / 4 - arch / 4, 0.5, D / 2 - arch / 2); R.solid(wx, D / 4 + arch / 4, 0.5, D / 2 - arch / 2);
  // Vorderer Gastraum: helle Holztische, dunkle Stühle, Wandbank mit roten Polstern
  const oak = '#c79a62', chairCol = '#2a1e16';
  R.piece(-W / 2 + 0.35, -0.5, Math.PI / 2, 6.5, 0.6, g => {
    R.pbox(g, 6.5, 0.45, 0.55, R.mat('#7a5232'), 0, 0, 0);
    R.pbox(g, 6.5, 0.1, 0.5, R.mat('#7a1f22'), 0, 0.45, 0.02);
    R.pbox(g, 6.5, 0.55, 0.1, R.mat('#7a5232'), 0, 0.5, -0.24);
  });
  for (const z of [-3.2, -0.5, 2.2]) {
    R.table(-W / 2 + 1.25, z, 0.85, 1.3, 0.76, oak, '#3a2a1c');
    R.chair(-W / 2 + 2.05, z - 0.3, -Math.PI / 2, chairCol); R.chair(-W / 2 + 2.05, z + 0.3, -Math.PI / 2, chairCol);
  }
  for (const [x, z] of [[-2.2, -2.6], [-2.2, 0.6], [0.2, -2.6], [0.2, 0.6]]) {
    R.table(x, z, 1.2, 0.85, 0.76, oak, '#3a2a1c');
    for (const s of [-1, 1]) { R.chair(x - 0.32, z + s * 0.65, s > 0 ? Math.PI : 0, chairCol); R.chair(x + 0.32, z + s * 0.65, s > 0 ? Math.PI : 0, chairCol); }
  }
  const food = new THREE.Group(); R.group.add(food);
  [[-W / 2 + 1.25, -3.2], [-W / 2 + 1.25, 2.2], [-2.2, -2.6], [0.2, 0.6]].forEach(([x, z], i) => tapasOnTable(R, food, x, z, 0.76, 11 + i));
  // Bar an der Südwand: Theke, Hocker, Weinregal, Zapfhähne, Serranoschinken auf dem Halter
  R.counter(-1.2, D / 2 - 1.0, Math.PI, 3.4, '#5a3a22', '#2a1a10');
  for (const x of [-2.4, -1.6, -0.8, 0]) R.stool(x, D / 2 - 1.75, '#2a1e16');
  R.piece(-1.2, D / 2 - 0.2, Math.PI, 3.4, 0.3, g => {
    R.pbox(g, 3.4, 1.8, 0.3, R.mat('#3a2414'), 0, 0.95, 0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 12; j++) {
      const b = R.cyl(0.035, 0.035, 0.25, R.mat(['#4a0f18', '#2e5d32', '#7a1424', '#d8c87a'][(i + j) % 4]), -1.5 + j * 0.27, 1.05 + i * 0.42, 0.06, 6, g);
      b.rotation.x = Math.PI / 2;
    }
  }, false);
  for (let i = 0; i < 3; i++) R.cyl(0.02, 0.02, 0.35, R.mat('#c9ccd0'), -2.2 + i * 0.15, 0.9, D / 2 - 1.15, 8);
  R.piece(0.2, D / 2 - 1.0, 0, 0.3, 0.5, g => {
    R.pbox(g, 0.18, 0.04, 0.45, R.mat('#3a2414'), 0, 0.9, 0);
    const ham = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.5, 10), R.mat('#8a3a28'));
    ham.rotation.x = Math.PI / 2 - 0.3; ham.position.set(0, 1.02, 0.02); g.add(ham);
  }, false);
  // Kaminzimmer hinter dem Bogen: weiße Tischdecken, Kerzen, Kamin mit flackerndem Feuer
  for (const [x, z] of [[4.6, -2.6], [4.6, 1.2]]) {
    R.piece(x, z, 0, 1.6, 1.0, g => { R.pbox(g, 1.6, 0.04, 1.0, R.mat('#f7f5f0'), 0, 0.74, 0); R.pbox(g, 1.64, 0.3, 1.04, R.mat('#f7f5f0'), 0, 0.44, 0); });
    for (const s of [-1, 1]) { R.chair(x - 0.4, z + s * 0.75, s > 0 ? Math.PI : 0, chairCol); R.chair(x + 0.4, z + s * 0.75, s > 0 ? Math.PI : 0, chairCol); }
    R.cyl(0.03, 0.04, 0.2, R.mat('#f2efe6'), x, 0.78, z, 8); R.cyl(0.012, 0.012, 0.03, R.lampMat('#ffcf70', 2), x, 0.98, z, 6);
  }
  tapasOnTable(R, food, 4.6, -2.6, 0.78, 21);
  R.piece(W / 2 - 0.45, -0.8, -Math.PI / 2, 1.8, 0.7, g => {
    R.pbox(g, 1.8, 1.2, 0.7, R.mat('#cdb48a'), 0, 0, 0);
    R.pbox(g, 2.0, 0.12, 0.8, R.mat('#a8906a'), 0, 1.2, 0.02);
    R.pbox(g, 1.0, 0.7, 0.1, R.mat('#1a1410'), 0, 0.15, 0.31, false);
    const fire = R.pbox(g, 0.7, 0.35, 0.05, R.lampMat('#ff7a1a', 2.2), 0, 0.2, 0.34, false);
    R.anims.push((dt, t) => { fire.scale.y = 0.85 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.05; });
  });
  // Plakat, Bilder, Pendelleuchten, Pflanzen
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.12), new THREE.MeshLambertMaterial({ map: spainPosterTex() }));
  poster.position.set(-1, 1.75, -D / 2 + 0.04); R.group.add(poster);
  R.painting('n', -4.5, 1.8, 1.0, 0.75, 61); R.painting('n', 4.6, 1.8, 1.1, 0.8, 62);
  for (const [x, z] of [[-2.2, -2.6], [-2.2, 0.6], [0.2, -2.6], [0.2, 0.6], [4.6, -2.6], [4.6, 1.2]]) R.ceilingLamp(x, z, '#ffcf8a', 0.18);
  R.plant(W / 2 - 0.5, D / 2 - 0.5, 1.2); R.plant(-W / 2 + 0.5, -D / 2 + 0.5, 1.1);
  venueFigure(R, -1.2, D / 2 - 0.55, Math.PI, { shirt: '#1d1d1d', pants: '#1d1d1d', hair: '#2a1a10' });  // hinter der Bar
  venueFigure(R, 1.4, -1.0, -Math.PI / 2, { shirt: '#f4f4f2', pants: '#1d1d1d', hair: '#3a2a1a' });    // Kellner
  venueFigure(R, -1.0, -3.6, 0.4, { shirt: '#c97a9a', pants: '#2c2f38', hair: '#d8b878' });
  venueFigure(R, 3.8, 0.2, 2.6, { shirt: '#3a6ea8', pants: '#3a3a3a', hair: '#6b4a2a' });
  R.spot(-1.2, D / 2 - 2.0, 1.4, () => 'Bestellen', 'order');
  R.spot(1.4, -1.0, 1.2, () => 'Beim Kellner bestellen', 'order');
  venueExit(R);
  return R;
}

const VENUE_BUILDERS = { doener: buildDoener, ratskeller: buildRatskeller, gasthaus: buildGasthaus, cafe: buildCafe,
  fashion: buildFashion, drugstore: buildDrugstore, books: buildBooks, tapas: buildTapas };

// ---------- Erweiterung von Property: Türen, Betreten, Bestellen ----------
Object.assign(Property.prototype, {
  // Tür an der Hauswand des Lokals, die zur nächsten Straße zeigt (wie die Ladenschilder in props.js)
  placeVenue(def) {
    const W = this.world;
    const r = (def.road && W.nearestRoad(def.x, def.z, 70, s => s.n === def.road)) ||
      W.nearestRoad(def.x, def.z, 45, s => s.k === 'road' || s.k === 'plaza' || s.k === 'foot');
    if (!r) return;
    let dx = def.x - r.x, dz = def.z - r.z;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    let b = W.insideBuilding(def.x, def.z, 0);
    for (let t = 0; !b && t < dl + 8; t += 0.5) b = W.insideBuilding(r.x + dx * t, r.z + dz * t, 0);
    if (!b) return;
    const p = b.p;
    let best = null;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1.8) continue;
      let nx = -(bz - az) / len, nz = (bx - ax) / len;
      if (U.pointInPoly((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, p)) { nx = -nx; nz = -nz; }
      const c = U.closestOnSeg(r.x, r.z, ax, az, bx, bz);
      if ((r.x - c[0]) * nx + (r.z - c[1]) * nz < 0.3) continue;
      const d = Math.hypot(r.x - c[0], r.z - c[1]);
      if (!best || d < best.d) best = { ax, az, bx, bz, len, nx, nz, d };
    }
    if (!best) return;
    const ex = (best.bx - best.ax) / best.len, ez = (best.bz - best.az) / best.len;
    // Tür unter dem Ladenschild, aber zur Seite versetzt, damit sie nicht in der Schaufenstermitte sitzt
    const half = best.len / 2 - 0.8;
    const along = U.clamp((def.x - best.ax) * ex + (def.z - best.az) * ez - best.len / 2, -half, half);
    const x = best.ax + ex * (best.len / 2 + along), z = best.az + ez * (best.len / 2 + along);
    const v = { ...def, venue: true, x, z, ox: best.nx, oz: best.nz, sx: x + best.nx * 1.4, sz: z + best.nz * 1.4,
      heading: Math.atan2(best.nx, best.nz) };
    v.y = W.heightAt(v.sx, v.sz);
    v.door = this.doorMesh(v);
    this.scene.add(v.door);
    const food = VENUE_FOOD.has(def.type);
    v.label = makeLabel(def.name, food ? VENUE_COLOR.food : VENUE_COLOR.store, `${INTERIOR_TYPES[def.type].title} · F betreten`);
    v.label.position.set(v.sx, v.y + 3.2, v.sz);
    v.label.userData.range = 70;
    this.ui.addLabel(v.label, this.scene);
    this.venues.push(v);
    if (def.road) this.venueSign(v);
    if (def.garden) this.beerGarden(v);
    if (def.host) this.placeHost(v, def.host);
    return v;
  },

  // Lokal wieder entfernen (Umland-Kachel wird abgebaut)
  removeVenue(v) {
    const i = this.venues.indexOf(v);
    if (i >= 0) this.venues.splice(i, 1);
    if (v.door) { this.scene.remove(v.door); v.door.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    if (v.label) { this.ui.removeLabel(v.label); v.label.material.map.dispose(); v.label.material.dispose(); }
  },

  venueRoom(v) {
    const key = 'v:' + v.id;
    if (!this.rooms[key]) {
      const idx = VENUES.findIndex(q => q.id === v.id);
      const r = VENUE_BUILDERS[v.type](10 + (idx >= 0 ? idx : U.hashStr(v.id) % 997), v);
      this.indoorRoot.add(r.group);
      this.rooms[key] = r;
    }
    return this.rooms[key];
  },

  // Speisekarte bzw. Sortiment: Kaufen zieht Geld ab, Essen füllt Leben auf, Kleidung zieht man gleich an
  openVenueMenu(v) {
    const items = VENUE_MENUS[v.type], food = VENUE_FOOD.has(v.type);
    const verb = v.type === 'fashion' ? 'Kaufen' : food ? 'Bestellen' : 'Kaufen';
    this.openMenu('theme-venue', () => {
      const money = this.save.money, hp = Math.round(this.player().health);
      const rows = items.map((it, i) => {
        const extra = it.hp ? `<span class="vn-hp">+${it.hp} Leben</span>` : it.outfit ? '<span class="vn-hp">sofort anziehen</span>' : '';
        return `<div class="vn-row"><div class="vn-txt"><b>${it.n}</b>${it.d ? `<span>${it.d}</span>` : ''}${extra}</div>
          <div class="vn-price">${it.p.toFixed(2).replace('.', ',')} €</div>
          <button class="mn-btn primary" data-act="buy" data-i="${i}" ${money < it.p ? 'disabled' : ''}>${verb}</button></div>`;
      }).join('');
      return `<div class="mn-head"><span class="mn-badge">${INTERIOR_TYPES[v.type].label}</span><h2>${v.name}</h2><button class="mn-x" data-act="close" aria-label="Schließen">✕</button></div>
        <div class="mn-sub">${v.street} · ${INTERIOR_TYPES[v.type].title}${food ? ` · Leben: <b>${hp}</b>` : ''}</div>
        <div class="vn-list">${rows}</div>
        <div class="mn-foot">${this.moneyLine()}<button class="mn-btn ghost" data-act="close">Schließen</button></div>`;
    }, (act, data) => {
      if (act === 'close') { this.closeMenu(true); return; }
      if (act !== 'buy') return;
      const it = items[+data.i];
      if (!it || this.save.money < it.p) return;
      this.addMoney(-it.p);
      const p = this.player();
      if (it.outfit) {
        this.save.outfit = Object.assign({}, this.save.outfit, it.outfit);
        p.setOutfit(this.save.outfit);
        this.persist();
        this.ui.toast(`${it.n} gekauft und angezogen`, 2);
      } else if (it.hp) {
        const before = p.health;
        p.health = Math.min(100, p.health + it.hp);
        this.ui.toast(food ? `Guten Appetit! ${it.n} · Leben +${Math.round(p.health - before)}` : `${it.n} · Leben +${Math.round(p.health - before)}`, 2);
      } else {
        this.ui.toast(it.read ? `${it.n}: ${it.read}` : `${it.n} gekauft`, it.read ? 4 : 1.8);
      }
      this.audio.cash();
      this.renderMenu();
    });
  },
});

// ---------- Barcelona außen: Biergarten am Ernstplatz und Hugo, der vor dem Lokal winkt ----------
Object.assign(Property.prototype, {
  // eigenes Schild über der Tür (Lokale, deren Eingang an einer bestimmten Straße liegt; props.js lässt sie aus)
  venueSign(v) {
    const ex = -v.oz, ez = v.ox, w = 3.2;
    const tex = intCanvas('sign-' + v.id, 512, 128, (c, cw, ch) => {
      c.fillStyle = '#b3261e'; c.fillRect(0, 0, cw, ch);
      c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.strokeRect(10, 10, cw - 20, ch - 20);
      c.fillStyle = '#ffffff'; c.font = 'bold 70px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(v.name, cw / 2, ch / 2 + 4);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 }));
    m.position.set(v.x + v.ox * 0.12, this.world.heightAt(v.sx, v.sz) + 3.4, v.z + v.oz * 0.12);
    m.rotation.y = Math.atan2(v.ox, v.oz);
    this.scene.add(m);
  },

  // Holzgarnituren mit roten Kissen unter bordeauxroten Schirmen (nach den Fotos vom Ernstplatz)
  beerGarden(v) {
    const W = this.world, ex = -v.oz, ez = v.ox;
    const wood = new THREE.MeshLambertMaterial({ color: '#b0703a' }), cushion = new THREE.MeshLambertMaterial({ color: '#a8252a' });
    const cloth = new THREE.MeshLambertMaterial({ color: '#7a2230', side: THREE.DoubleSide }), pole = new THREE.MeshLambertMaterial({ color: '#d8d4cc' });
    const box = (g, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); };
    let n = 0;
    for (const row of [5.6, 8.4]) for (const col of [-1.6, 1.6, -4.8, 4.8]) {
      const x = v.x + v.ox * row + ex * col, z = v.z + v.oz * row + ez * col;
      if (W.insideBuilding(x, z, 1.6) || W.nearestRoad(x, z, 2.6, s => s.k === 'road') || W.collideCircle(x, z, 1.2, {}).hit) continue;
      const g = new THREE.Group();
      g.position.set(x, W.heightAt(x, z), z); g.rotation.y = Math.atan2(ex, ez);
      box(g, 0.7, 0.05, 1.9, wood, 0, 0.76, 0); box(g, 0.08, 0.74, 0.08, wood, 0, 0.37, -0.7); box(g, 0.08, 0.74, 0.08, wood, 0, 0.37, 0.7);
      for (const s of [-1, 1]) { box(g, 0.3, 0.05, 1.9, wood, s * 0.6, 0.45, 0); box(g, 0.26, 0.05, 1.8, cushion, s * 0.6, 0.5, 0); box(g, 0.06, 0.45, 0.06, wood, s * 0.6, 0.22, -0.7); box(g, 0.06, 0.45, 0.06, wood, s * 0.6, 0.22, 0.7); }
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), pole); p.position.y = 1.2; g.add(p);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.5, 4, 1, true), cloth); roof.position.y = 2.45; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      this.scene.add(g);
      W.trees.push(x, z, 1.0); W.treeGrid.insert(W.trees.length / 3 - 1, x - 1, z - 1, x + 1, z + 1);
      n++;
    }
    v.gardenTables = n;
  },

  // Gastgeber vor der Tür: winkt allen zu, Name schwebt über dem Kopf
  placeHost(v, name) {
    const W = this.world, ex = -v.oz, ez = v.ox;
    let x = v.x + v.ox * 2.0 + ex * 1.6, z = v.z + v.oz * 2.0 + ez * 1.6;
    if (W.insideBuilding(x, z, 0.5)) { x = v.sx; z = v.sz; }
    const p = new Player(this.scene, { shirt: '#b3261e', pants: '#2c2f38', hair: '#ecd27a', skin: '#f1c9a5' });
    p.place(x, z, W);
    p.heading = v.heading; p.sync();
    const lab = makeLabel(name, '#ecd27a');
    lab.position.set(x, p.y + 2.45, z);
    lab.userData.range = 60; lab.userData.near = 0; lab.userData.minScale = 0.22; // auch direkt vor ihm lesbar
    this.ui.addLabel(lab, this.scene);
    this.hosts = this.hosts || [];
    this.hosts.push({ p, t: 0 });
    W.trees.push(x, z, 0.35); W.treeGrid.insert(W.trees.length / 3 - 1, x - 1, z - 1, x + 1, z + 1);
  },
});
// Winken: linker Arm über dem Kopf, schwingt hin und her
{
  const baseUpdate = Property.prototype.update;
  Property.prototype.update = function (dt) {
    baseUpdate.call(this, dt);
    for (const h of this.hosts || []) {
      h.t += dt;
      h.p.armL.rotation.set(0, 0, 2.7 + Math.sin(h.t * 7) * 0.35);
      h.p.armR.rotation.set(0, 0, 0);
    }
  };
}
