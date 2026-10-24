// Adresse des Mehrspieler-Servers, wenn das Spiel woanders liegt als der Server (z. B. Spiel auf Vercel oder
// GitHub Pages, Server auf Render): window.MP_SERVER = 'wss://gta-coburg.onrender.com';
// Leer: automatisch – der Server, der die Seite ausliefert (node server.js), wenn er Mehrspieler kann, sonst
// Peer-to-Peer (js/net-p2p.js, ohne eigenen Server, z. B. auf Vercel). 'p2p' erzwingt Peer-to-Peer.
// Überschreiben geht auch mit ?server=… in der Adresszeile oder im Lobby-Fenster unter „Server“.
window.MP_SERVER = window.MP_SERVER || '';
