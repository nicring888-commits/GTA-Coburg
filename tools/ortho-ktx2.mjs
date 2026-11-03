// Luftbilder des Umlands zusätzlich als KTX2 (Basis Universal ETC1S, mit Mipmaps) speichern (seit v3.11.0, Grafik-Phase 7).
// Auf der Grafikkarte belegt eine 512er-Kachel dann ≈ 0,2 MB statt ≈ 1,4 MB (JPG wird als RGBA mit Mipmaps entpackt);
// die Dateien sind etwa so groß wie die JPGs. Das Spiel nimmt die KTX2-Datei, wenn sie in data/region/ortho-ktx2.js
// steht, sonst das JPG. Thüringer Mischkacheln (beide Bilder werden im Spiel zusammengesetzt) bleiben JPG.
//
// Braucht ffmpeg/ffprobe (JPEG entpacken) und das Paket ktx2-encoder (wird nicht ins Projekt aufgenommen):
//   npm i --no-save ktx2-encoder@0.6.0
//   node tools/ortho-ktx2.mjs            # nur fehlende Dateien; --alle wandelt alles neu um
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'region', 'ortho');
let encodeToKTX2;
try { ({ encodeToKTX2 } = await import('ktx2-encoder')); } catch (e) {
  console.error('Paket ktx2-encoder fehlt: npm i --no-save ktx2-encoder@0.6.0'); process.exit(1);
}
const all = process.argv.includes('--alle');

// Welche Kacheln das Spiel als Einzelbild lädt: Flag 1 (Bayern) bzw. 2 (nur Thüringen); 3 = Mischkachel bleibt JPG
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'region', 'ortho.js'), 'utf8'), ctx);
const O = ctx.window.COBURG_REGION_ORTHO;
const jobs = [];
for (const [k, flag] of Object.entries(O.tiles)) {
  if (flag === 3) continue;
  const [i, j] = k.split(',');
  jobs.push(`${flag === 2 ? 'th' : 'by'}${i}_${j}`);
}
for (const f of fs.readdirSync(DIR)) if (/^hd-?\d+_-?\d+\.jpg$/.test(f)) jobs.push(f.slice(0, -4));

// kleines Vorschaubild (256 px) für das Spiel: Bewuchsfarbe und Gehölze aus dem Luftbild brauchen lesbare Pixel,
// die eine komprimierte Textur nicht hat (HD-Kacheln brauchen keins)
function thumb(name, jpg) {
  const out = path.join(DIR, name + '.256.jpg');
  if (name.startsWith('hd') || (!all && fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(jpg).mtimeMs)) return;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', jpg, '-vf', 'scale=256:256', '-q:v', '4', out]);
}
const done = {};
let n = 0, inB = 0, outB = 0;
const t0 = Date.now();
for (const name of jobs) {
  const jpg = path.join(DIR, name + '.jpg'), ktx = path.join(DIR, name + '.ktx2');
  if (!fs.existsSync(jpg)) continue;
  if (!all && fs.existsSync(ktx) && fs.statSync(ktx).mtimeMs > fs.statSync(jpg).mtimeMs) { thumb(name, jpg); done[name] = 1; continue; }
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', jpg]).toString().trim().split(',').map(Number);
  const rgba = execFileSync('ffmpeg', ['-v', 'error', '-i', jpg, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 });
  // isYFlip: KTX2-Texturen werden beim Hochladen nicht gespiegelt, die Kachel-UVs erwarten aber die Bildzeile 0 oben
  const out = await encodeToKTX2(new Uint8Array(rgba), { isUASTC: false, generateMipmap: true, qualityLevel: 128, isYFlip: true,
    imageDecoder: async () => ({ width: w, height: h, data: new Uint8Array(rgba) }) });
  fs.writeFileSync(ktx, out);
  thumb(name, jpg);
  done[name] = 1; n++; inB += fs.statSync(jpg).size; outB += out.length;
  if (n % 50 === 0) console.log(`${n} umgewandelt (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const js = '// Automatisch erzeugt von tools/ortho-ktx2.mjs – Luftbilder, die als KTX2 vorliegen\n' +
  'window.COBURG_REGION_KTX2 = ' + JSON.stringify({ tiles: done }) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data', 'region', 'ortho-ktx2.js'), js);
console.log(`Fertig: ${n} neu umgewandelt (JPG ${(inB / 1e6).toFixed(1)} MB → KTX2 ${(outB / 1e6).toFixed(1)} MB), ${Object.keys(done).length} im Verzeichnis, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
