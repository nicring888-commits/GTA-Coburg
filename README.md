# GTA Coburg

Ein Open-World-Spiel im Browser in der echten Coburger Innenstadt: Autos klauen, Straßenrennen fahren und die
Polizei abhängen. Straßen, Gelände, Luftbilder und 3D-Gebäude stammen aus offenen Geodaten. Du startest am Bahnhof.

## Spielen

Das Spiel ist eine statische Webseite ohne Build-Schritt. Lokal starten:

```bash
node server.js
```

Dann http://127.0.0.1:8175 öffnen (unter Windows geht auch ein Doppelklick auf `start.bat`).
three.js wird über das CDN jsDelivr geladen, dafür braucht es eine Internetverbindung.

**Veröffentlichen:** Den Ordner so wie er ist als statische Seite ausliefern, zum Beispiel über Vercel
(Repository importieren, kein Build-Befehl, Ausgabeordner = Projektwurzel) oder GitHub Pages (Branch `main`, Ordner `/`).

## Online spielen

`node server.js` startet auch den Mehrspieler-Server. Im Spiel „🌐 Online spielen“ wählen: Name eingeben, Lobby
beitreten, schnell beitreten, eigene (private) Lobby erstellen oder mit Code beitreten. Bis zu 16 Spieler je Lobby
sehen sich, fahren zusammen, fahren beieinander mit (`E`), chatten (`T`) und teilen Uhrzeit und Wetter.

- Ohne eigenen Server (Vercel, GitHub Pages): automatisch Peer-to-Peer über WebRTC; der erste Spieler einer Lobby
  ist Gastgeber, geht er, übernimmt ein anderer.
- Heimnetz: `node server.js --lan` (Windows: `start-lan.bat`), Freunde öffnen die angezeigte Adresse.
- Internet (kostenlos): Repository auf [Render](https://render.com) als Blueprint verbinden (`render.yaml`).
- Test: `node tools/mp-test.js`, Testmitspieler: `node tools/mp-bot.js --x … --z … --drive`.

## Steuerung

| | |
|---|---|
| `W A S D` | laufen bzw. Gas, Bremse, lenken |
| `Shift` / `Leertaste` | rennen, springen bzw. Handbremse |
| `E` | einsteigen, Auto klauen, aussteigen |
| `F` | Rennen starten/abbrechen, Auto beim Händler verkaufen, Wohnung oder Autohaus öffnen |
| `G` | Garage: eigene Autos herholen |
| `T` / `Tab` | online: Chat / Spielerliste mit Einladungslink |
| `M` | Stadtplan · `N` Zeitraffer Tag/Nacht · `K` Wetter · `O` Grafikqualität · `F1` Hilfe |

Blaue Säulen = Rennen, grüne = Lackiererei (Reparatur, Fahndung weg), orange = Autohändler, türkis = Autohaus
(Neuwagen kaufen), violette Haustüren = Wohnungen zum Besichtigen und Kaufen. Wohnungen, eigene Autos und Geld
bleiben im Browser gespeichert.

## Daten und Quellen

- Kartendaten © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright) (ODbL)
- Luftbilder (DOP) und 3D-Gebäudemodelle (LoD2): Bayerische Vermessungsverwaltung – [www.geodaten.bayern.de](https://geodaten.bayern.de/opengeodata/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de))
- Höhen: EU-DEM über opentopodata.org

Die Quellenangaben stehen auch im Spiel unten rechts und müssen dort bleiben.

Die aufbereiteten Daten liegen in `data/`. Die Rohdaten (`data/raw/`, ≈ 430 MB) sind nicht im Repository; die
Skripte in `tools/` laden und konvertieren sie neu (Reihenfolge siehe `PROJEKT.md`).

Ausführliche Dokumentation, Architektur und Stand: [PROJEKT.md](PROJEKT.md).

Fan-Projekt ohne Verbindung zu Rockstar Games oder Take-Two Interactive.
