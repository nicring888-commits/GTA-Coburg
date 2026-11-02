// Statistik der Bautyp-Erkennung (tools/classify-buildings.js) aus data/raw/region/arch-report.json, das
// tools/convert-region.js schreibt: Verteilung der Bautypen je Gemeinde, Fachwerk-Anteil, Abgleich mit den Häusern,
// die in OSM ein Baujahr oder eine Denkmal-Kennung haben.
// Aufruf: node tools/arch-stats.js [--md datei.md]
'use strict';

const fs = require('fs');
const path = require('path');

const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'raw', 'region', 'arch-report.json'), 'utf8'));
const N = R.names, LK = R.landkreis;
const SHORT = ['?', 'Hist. Dorf', 'Hist. Stadt', '50–70er', '70–90er', 'Neubau', 'MFH', 'Gewerbe', 'Industrie', 'Agrar alt', 'Agrar neu', 'Neben', 'Sonder'];
const WOHN = [1, 2, 3, 4, 5, 6];

const per = new Map();
const add = (k, a, fw) => { let o = per.get(k); if (!o) per.set(k, o = { n: 0, c: new Array(N.length).fill(0), fw: 0 }); o.n++; o.c[a]++; o.fw += fw; };
for (const [a, fw, g] of R.b) { add(LK.includes(g) ? g : 'andere (Nachbarkreise)', a, fw); add('Gesamt Landkreis + Stadtteile Coburg', ...(LK.includes(g) ? [a, fw] : [0, 0])); }
const tot = per.get('Gesamt Landkreis + Stadtteile Coburg');
tot.n = tot.n - tot.c[0]; tot.c[0] = 0;

const pct = (v, n) => n ? (100 * v / n).toFixed(0) + ' %' : '–';
const lines = [];
const head = ['Gemeinde', 'Häuser', 'Wohnhäuser', ...WOHN.map(a => SHORT[a]), 'Fachwerk', 'Gewerbe', 'Industrie', 'Agrar alt/neu'];
lines.push('| ' + head.join(' | ') + ' |', '|' + head.map((_, i) => i ? '---:' : '---').join('|') + '|');
const rows = [...LK.filter(g => per.has(g)), 'Gesamt Landkreis + Stadtteile Coburg', 'andere (Nachbarkreise)'];
for (const g of rows) {
  const o = per.get(g);
  if (!o) continue;
  const w = WOHN.reduce((s, a) => s + o.c[a], 0);
  const name = g === 'Coburg' ? 'Coburg (Stadtteile außerhalb der Innenstadt)' : g;
  lines.push('| ' + [g.startsWith('Gesamt') ? '**' + name + '**' : name, o.n, w, ...WOHN.map(a => pct(o.c[a], w)), pct(o.fw, w),
    o.c[7], o.c[8], o.c[9] + ' / ' + o.c[10]].join(' | ') + ' |');
}

// Abgleich: Häuser mit Baujahr in OSM (Baujahr fließt in die Erkennung ein, deshalb zusätzlich ohne Baujahr geschätzt
// über die Bewertung O/E und die Schwellen) und Denkmäler
const T = R.thresholds;
const era = y => y < 1919 ? 'vor 1919' : y < 1949 ? '1919–48' : y < 1979 ? '1949–78' : y < 2001 ? '1979–2000' : 'ab 2001';
const blind = (O, E) => O === null ? null : O >= T.tO ? 'historisch' : E < T.tE1 ? '50–70er' : E < T.tE2 ? '70–90er' : 'Neubau';
const conf = new Map();
for (const r of R.b) {
  const [a, , , , , y, , , O, , E] = r;
  if (!y || !WOHN.includes(a) || a === 6) continue;
  const k = era(y) + ' → ' + blind(O, E);
  conf.set(k, (conf.get(k) || 0) + 1);
}
let her = 0, herHist = 0, fwBad = 0, fwAll = 0;
for (const [a, fw, , , , , h] of R.b) {
  if (h && WOHN.includes(a)) { her++; if (a === 1 || a === 2) herHist++; }
  if (fw) { fwAll++; if (a !== 1 && a !== 2) fwBad++; }
}
const out = [
  '## Bautypen je Gemeinde (Anteile an den Wohnhäusern)', '', ...lines, '',
  `Schwellen: historisch ab O ≥ ${T.tO.toFixed(3)}, Bauzeit-Schwellen E ${T.tE1.toFixed(3)} / ${T.tE2.toFixed(3)}`, '',
  '## Abgleich', '',
  `- Denkmäler (OSM \`heritage\`/\`ref:BLfD\`) unter den Wohnhäusern: ${her}, davon als historisch erkannt: ${herHist} (${pct(herHist, her)})`,
  `- Fachwerk insgesamt: ${fwAll}, davon außerhalb historischer Bautypen: ${fwBad}`,
  '- Häuser mit Baujahr in OSM, Schätzung ohne das Baujahr (Bauzeit → geschätzt):',
  ...[...conf].sort().map(([k, v]) => `  - ${k}: ${v}`),
];
console.log(out.join('\n'));
const i = process.argv.indexOf('--md');
if (i > 0) fs.writeFileSync(process.argv[i + 1], out.join('\n') + '\n');
