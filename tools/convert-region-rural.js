// Ländliche Details (tools/fetch-region-rural.js) → data/region-rural.js (window.COBURG_RURAL):
// Feld- und Waldwege mit Breite und Belag, Hecken und Baumreihen als Linien in Spielmetern (Dezimeter, Differenzen).
// Die Zuordnung zu den Kacheln macht das Spiel beim Laden (js/region.js).
// Aufruf: node tools/convert-region-rural.js
const fs = require('fs');
const path = require('path');
const { RAW, ROOT, projX, projZ } = require('./region-tiles');

const files = fs.readdirSync(RAW).filter(f => /^rural_.*\.json$/.test(f));
const seen = new Set();
const out = { tracks: [], hedges: [], rows: [] };
const dm = v => Math.round(v * 10);
const enc = pts => { const o = []; let px = 0, pz = 0; for (const [x, z] of pts) { const X = dm(x), Z = dm(z); o.push(X - px, Z - pz); px = X; pz = Z; } return o; };
// Linie vereinfachen (Douglas-Peucker, 0,8 m)
function simplify(pts, eps = 0.8) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a], [bx, bz] = pts[b], L = Math.hypot(bx - ax, bz - az) || 1;
    let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L; if (d > bd) { bd = d; best = i; } }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
// Belag: 0 Schotter/fest, 1 Erde/Gras (zwei Fahrspuren mit Grasnarbe), 2 Asphalt
const SURF = s => /asphalt|paved|concrete/.test(s || '') ? 2 : /grass|ground|dirt|earth|mud/.test(s || '') ? 1 : 0;
let km = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  for (const e of j.elements || []) {
    if (e.type !== 'way' || !e.geometry || seen.has(e.id)) continue;
    seen.add(e.id);
    const t = e.tags || {};
    const pts = simplify(e.geometry.filter(g => g).map(g => [projX(g.lon), projZ(g.lat)]));
    if (pts.length < 2) continue;
    if (t.highway) {
      const grade = t.tracktype || '';
      const surf = t.surface ? SURF(t.surface) : grade === 'grade1' ? 2 : /grade[45]/.test(grade) ? 1 : 0;
      const w = t.highway === 'track' ? (surf === 2 ? 3.2 : 3.0) : 1.8;
      out.tracks.push([dm(w), surf, ...enc(pts)]);
      for (let i = 1; i < pts.length; i++) km += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / 1000;
    } else if (t.barrier === 'hedge') out.hedges.push(enc(pts));
    else if (t.natural === 'tree_row') out.rows.push(enc(pts));
  }
}
fs.writeFileSync(path.join(ROOT, 'data', 'region-rural.js'),
  '// Erzeugt von tools/convert-region-rural.js aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL)\n' +
  'window.COBURG_RURAL = ' + JSON.stringify(out) + ';\n');
console.log(`${files.length} Dateien: ${out.tracks.length} Wege (${km.toFixed(0)} km), ${out.hedges.length} Hecken, ${out.rows.length} Baumreihen`);
