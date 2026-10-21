// Einstellungen für das Umland: Landkreis Coburg mit der kreisfreien Stadt Coburg.
// Die Innenstadt (tools/config.js) bleibt das detaillierte Kerngebiet; das Umland wird in Kacheln gebaut.
module.exports = {
  // OSM-Relationen, deren Fläche zur Spielwelt gehört: Landkreis Coburg, Stadt Coburg
  RELATIONS: [62561, 62717],
  // Ausschnitt für alle Downloads: Landkreis-Grenzen plus gut 1,5 km Rand
  BBOX: { south: 50.074, west: 10.690, north: 50.411, east: 11.225 },
  // Kachelgröße in Zellen des Geländegitters (≈ 49,4 × 49,9 m je Zelle, also ≈ 1 km je Kachel)
  TILE_CELLS: 20,
  // Kacheln, die näher als so viele Meter an der Landkreisfläche liegen, sind befahrbar
  BUFFER_M: 600,
  // Luftbildkacheln: Pixel je Kachelkante (≈ 1,9 m pro Pixel)
  ORTHO_PX: 512,
};
