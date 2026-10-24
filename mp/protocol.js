// Gemeinsame Werte für Mehrspieler-Server (Node: require) und Spiel (Browser: <script>): Protokollversion,
// Grenzen für die Prüfung der Bewegungen, Raten. Werden beide Seiten geändert, PROTOCOL erhöhen.
'use strict';

(function (root) {
  const MP = {
    PROTOCOL: 1,
    PATH: '/mp',
    ROOM_MAX: 16,              // Spieler je Lobby
    TICK_MS: 50,               // Server schickt 20 Momentaufnahmen pro Sekunde
    SEND_MS: 50,               // Spiel schickt seinen Zustand 20-mal pro Sekunde (in Ruhe seltener)
    IDLE_SEND_MS: 500,
    INTERP_MS: 110,            // Darstellung der anderen liegt so weit in der Vergangenheit (glatt trotz Schwankung)
    AOI: 1600,                 // Momentaufnahmen nur über Spieler und Autos in diesem Umkreis (Meter)
    WORLD: 40000,              // |x|, |z| höchstens (Landkreis ≈ ±20 km um den Markt)
    // Höchsttempo (m/s) für die Bewegungsprüfung; Autos aus VEHICLE_KINDS (js/vehicle.js) plus Spielraum
    WALK_MAX: 12,
    CAR_MAX: { car: 44, sport: 60, taxi: 44, police: 53, kleinwagen: 40, kombi: 46, van: 40, pickup: 45, suv: 47, cabrio: 54 },
    CAR_SLACK: 1.3,            // ×: Gefälle, Rampen, Druckwellen
    ENTER_DIST: 7.5,           // so nah muss man an einem Auto stehen, um einzusteigen
    SEATS: 4,                  // Fahrer + 3 Mitfahrer
    CARS_PER_PLAYER: 5,
    NAME_MAX: 16,
    CHAT_MAX: 140,
    COLORS: ['#e9b949', '#3aa0ff', '#ff5c8a', '#38d97a', '#b57cff', '#ff9a2e', '#2ed3c6', '#f25f4c',
      '#9be15d', '#5d8bf4', '#ffd23a', '#d16ba5', '#4dd0e1', '#c0ca33', '#ff7043', '#90a4ae'],
    WEATHER: ['clear', 'cloudy', 'overcast', 'rain', 'fog'],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MP;
  else root.MP = MP;
})(typeof window !== 'undefined' ? window : globalThis);
