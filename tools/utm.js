// Umrechnung ETRS89/UTM (GRS80) <-> geografische Länge/Breite, Zone 32 (EPSG:25832).
// Krüger-Reihen nach Karney (2011), auf Millimeter genau – für die Spielwelt mehr als genug.
const a = 6378137, f = 1 / 298.257222101;          // GRS80
const k0 = 0.9996, E0 = 500000, LON0 = 9 * Math.PI / 180;
const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
const alpha = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
  61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280];
const beta = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440,
  17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280];
const e = Math.sqrt(f * (2 - f));

function toUTM(lat, lon) {
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180 - LON0;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let x = xi, y = eta;
  for (let j = 1; j <= 4; j++) {
    x += alpha[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    y += alpha[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  return { E: E0 + k0 * A * y, N: k0 * A * x };
}

function fromUTM(E, N) {
  const xi = N / (k0 * A), eta = (E - E0) / (k0 * A);
  let x = xi, y = eta;
  for (let j = 1; j <= 4; j++) {
    x -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    y -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(x) / Math.cosh(y));
  // Breite aus der konformen Breite iterativ
  let phi = chi;
  for (let i = 0; i < 6; i++) {
    phi = Math.asin(Math.tanh(Math.atanh(Math.sin(chi)) + e * Math.atanh(e * Math.sin(phi))));
  }
  const lam = Math.atan2(Math.sinh(y), Math.cos(x));
  return { lat: phi * 180 / Math.PI, lon: (lam + LON0) * 180 / Math.PI };
}

module.exports = { toUTM, fromUTM };
