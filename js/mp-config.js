// Adresse des Mehrspieler-Servers, wenn das Spiel woanders liegt als der Server (z. B. Spiel auf Vercel oder
// GitHub Pages, Server auf Render): window.MP_SERVER = 'wss://gta-coburg.onrender.com';
// Leer: derselbe Server, der die Seite ausliefert (node server.js). Überschreiben geht auch mit ?server=… in der
// Adresszeile oder im Lobby-Fenster unter „Server“.
window.MP_SERVER = window.MP_SERVER || '';
