// Schutz der Karte (seit v3.18.0, Grafik-Phase G0): SHA-256 aller Spieldaten in data/ (ohne data/raw/).
//   node tools/data-hash.js          vergleicht mit bench/data-hash.json (Exit 1 bei Abweichung)
//   node tools/data-hash.js --save   schreibt den jetzigen Stand als Vergleich
// Neue Dateien sind erlaubt (Grafik-Phasen dürfen Daten nur hinzufügen), geänderte oder fehlende nicht.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'bench', 'data-hash.json');

function walk(dir, out) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'raw') walk(p, out); } else out.push(p);
  }
  return out;
}

const now = {};
for (const f of walk(DATA, []).sort()) {
  now[path.relative(ROOT, f).replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

if (process.argv.includes('--save')) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(now, null, 1) + '\n');
  console.log(`${Object.keys(now).length} Dateien gespeichert in ${path.relative(ROOT, OUT)}`);
  process.exit(0);
}
if (!fs.existsSync(OUT)) { console.error('Kein Vergleich: erst mit --save anlegen'); process.exit(2); }
const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const changed = [], missing = [], added = [];
for (const k in old) { if (!(k in now)) missing.push(k); else if (old[k] !== now[k]) changed.push(k); }
for (const k in now) if (!(k in old)) added.push(k);
for (const k of changed) console.log('GEÄNDERT ', k);
for (const k of missing) console.log('FEHLT    ', k);
for (const k of added) console.log('neu      ', k);
console.log(`${Object.keys(old).length} geprüft: ${changed.length} geändert, ${missing.length} fehlen, ${added.length} neu`);
process.exit(changed.length || missing.length ? 1 : 0);
