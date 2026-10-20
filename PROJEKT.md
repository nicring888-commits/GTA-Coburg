# GTA Coburg (Coburg Open World) – Projektdokumentation

> Lebendes Projektdokument. Wird bei jeder Arbeitssitzung aktualisiert:
> Stand, Änderungen und **nächste Schritte** stehen immer hier.

**Version:** 1.0.0 „GTA Coburg“ · **Letzte Aktualisierung:** 20.10.2026

---

## 1. Übersicht

Ein Open-World-Spiel im Browser, das aus **echten Kartendaten der Coburger Innenstadt** (OpenStreetMap) gebaut ist.
Man läuft zu Fuß durch die Stadt oder fährt mit dem Auto. Alle Straßen tragen ihre echten Namen. Dazu kommt ein
echtes Höhenmodell, deshalb liegt die Veste wirklich oben auf dem Festungsberg. Seit v0.2.0 liegen **echte
Luftbilder** der Bayerischen Vermessungsverwaltung auf dem Boden und auf allen Dächern. Seit v0.3.0 stehen die Häuser
als **amtliche 3D-Gebäudemodelle (LoD2)** in der Stadt: mit echten Höhen und echten Dachformen, von der Altstadt über
Schloss Ehrenburg bis zur Veste.

**Seit v1.0.0 ist es „GTA Coburg“** – das Spielprinzip von Vice City io auf der Coburger Karte: **Autos** klauen
und verkaufen, **Straßenrennen** gegen KI-Fahrer um Preisgeld und die **Polizei**, die mit Sternen fahndet, verfolgt,
rammt, Straßensperren baut und festnimmt. Man startet am **Bahnhof** (Vorplatz an der Lossaustraße), ein Auto steht bereit.

Kartenausschnitt: etwa 3,6 × 2,6 km (Breite 50,2470–50,2700, Länge 10,9420–10,9920). Er reicht vom Bahnhof im
Nordwesten über die Altstadt und den Hofgarten bis zur Veste im Nordosten. Der Nullpunkt der Welt ist der Marktplatz.

## 2. Starten

- **Doppelklick auf `start.bat`**: Das startet den Server und öffnet http://127.0.0.1:8175 im Browser.
- Oder im Terminal: `node server.js`.
- Notfalls geht auch ein direkter Doppelklick auf `index.html`. Dann fehlen aber die Luftbilder, weil der Browser
  Bilddateien von der Festplatte nicht als Textur erlaubt. Das Spiel nimmt dann die gemalte Bodentextur.

Für three.js (r160, über das CDN jsDelivr) wird eine Internetverbindung gebraucht.

## 3. Steuerung

| | Zu Fuß | Im Auto |
|---|---|---|
| Bewegen | `W A S D` (relativ zur Kamera) | `W`/`S` Gas, Bremse, rückwärts · `A`/`D` lenken |
| Extra | `Shift` rennen · `Leertaste` springen | `Leertaste` Handbremse (Driften) · `H` Hupe · `R` aufrichten · `C` Kamera |
| Allgemein | `E` einsteigen, Auto klauen, aussteigen (bei brennendem Auto bei jedem Tempo) · `F` Rennen starten/abbrechen, Auto verkaufen · `M` Stadtplan mit Schnellreise (gesperrt bei Fahndung und im Rennen) · `N` Tag/Nacht · `F1` Hilfe · Maus umsehen · Mausrad Zoom | |

## 3a. Spielprinzip (seit v1.0.0)

| Was | Wie es funktioniert |
|---|---|
| Start | Vorplatz des Bahnhofs (zwischen Bahnhofsgebäude und Lossaustraße), rotes Auto am Straßenrand, Startgeld € 500 |
| Autos | Pkw (158 km/h), Sportwagen (216 km/h, schnell beschleunigend), Taxi (elfenbein mit Dachschild), Streifenwagen (silber-blau, Blaulicht, „POLIZEI“). Jedes Auto im Verkehr lässt sich mit `E` klauen. Autos nehmen Schaden: erst Rauch, unter 25 % weniger Leistung, bei 0 % brennt das Auto und explodiert nach 4,5 s (Druckwelle beschädigt Autos und verletzt Fußgänger). Wracks qualmen und bleiben eine Weile liegen |
| Fahndung (★ 1–5) | Autodiebstahl, wenn ein Polizist oder ein Zeuge (30 %) es sieht · mit über 90 km/h an einer Streife vorbei · Unfall vor den Augen der Polizei · Polizeiauto rammen · Streifenwagen klauen (mind. 2 ★) · Polizist anfahren (mind. 2 ★) · Streifenwagen zerstören. Je länger die Polizei dich sieht, desto mehr Sterne |
| Polizei | 2/3/4/5/7 Streifenwagen je Sternzahl; zuerst werden Streifen aus dem Verkehr alarmiert, sonst kommen neue außer Sicht hinzu. Sie fahren mit der normalen Fahrphysik über das Straßennetz (kürzester Weg), rammen aus der Nähe, halten neben einem langsamen Spieler an. Tempo wächst mit den Sternen (1 ★ ≈ 135 km/h, 5 ★ ≈ 175 km/h). Ab 3 ★ Straßensperren vor dem Spieler. Martinshorn (Tatü-tata), Blaulicht, blinkende Punkte auf der Minikarte |
| Festnahme | Steht man still, steigt ein Polizist aus und rennt hinterher (etwas langsamer als der rennende Spieler). Erwischt er dich, füllt sich der Balken „Festnahme“ → **VERHAFTET**, Strafe € 100 + 100 je Stern, Neustart am Bahnhof |
| Entkommen | Außer Sicht der Polizei bleiben und sich von der Stelle entfernen, an der sie dich zuletzt gesehen hat (Sterne blinken). Nach 8 s + 3,5 s je Stern ist die Fahndung vorbei: **ENTKOMMEN**, Belohnung € 150 je Stern |
| Leben | Zu Fuß verletzen dich Autos (ab 18 km/h) und Explosionen; nach 8 s ohne Treffer heilt man langsam. Bei 0 oder im explodierenden Auto: **ERLEDIGT**, Krankenhaus € 100, Neustart am Bahnhof |
| Rennen (blaue Säulen) | Im Auto in die Säule fahren, `F`: Countdown 3-2-1, drei KI-Gegner in Sportwagen (Kevin, Jessy, Dennis) mit Gummiband und Ausweichen. Gelbe Checkpoint-Säulen, Zielsäule kariert, Strecke gelb auf der Minikarte. Preisgeld für Platz 1–3, Bestzeiten werden gespeichert. Nur ohne Fahndung startbar |
| Strecken | **Bahnhofs-Sprint** (2,1 km, Bahnhof → Theater → Ehrenburg → Rosengarten) · **Schnellweg-Rennen** (2,5 km, B 4 von Nord nach Süd) · **Veste-Bergrennen** (1,2 km bergauf zur Veste) · **Altstadt-Runde** (3,3 km Rundkurs) |
| Lackiererei (grün) | Langsam hineinfahren: Reparatur € 100, mit Fahndung € 250 (neue Farbe, Sterne weg). Geht nicht, solange die Polizei dich sieht. Drei Stück: Nord, Süd, Ost |
| Autohändler (orange) | `F`: Auto verkaufen; Preis je nach Typ und Zustand (Sportwagen bis € 1.400). Streifenwagen nimmt keiner |
| Speicherstand | Geld und Bestzeiten im Browser (`localStorage`, Schlüssel `gta-coburg-v1`) |

## 4. Inhalt der Welt

| Was | Anzahl | Quelle |
|---|---|---|
| Gebäude mit echten Höhen und Dachformen (Wand- und Dachflächen) | 11.444 (ohne 15 flache Brücken) | 3D-Gebäudemodelle LoD2 der Bayerischen Vermessungsverwaltung (CC BY 4.0), 9 CityGML-Kacheln à 2 × 2 km |
| Gebäude, die in LoD2 fehlen (Neubauten, Container, Randgebäude) | ≈ 160 | OSM `building`, mit geschätzter Höhe und Walmdach |
| Straßen und Wege (eigene Breiten, Mittellinien, Gehwege) | 3.420 | OSM `highway` |
| Flächen (Parks, Wald, Wiesen, Wasser, Sportplätze …) | 337 | OSM `landuse`, `leisure`, `natural` |
| Bäume (echte Einzelbäume plus Wald und Parks aufgefüllt) | ≈ 17.000 | OSM `natural=tree` und Flächen |
| Straßennetz für den KI-Verkehr | 898 Knoten / 1.031 Kanten | befahrbare Straßen |
| Gelände | 73 × 52 Punkte im 50-m-Raster, 290–457 m ü. NN | EU-DEM 25 m über opentopodata.org |
| Luftbilder (Boden und Dächer) | 24 Kacheln à ≈ 600 × 640 m, ≈ 0,6 m pro Pixel, 5 MB | DOP 40 der Bayerischen Vermessungsverwaltung (CC BY 4.0), WMS `geoservices.bayern.de/od/wms/dop/v1/dop40` |
| Schnellreiseziele | 12 | Marktplatz, Rathaus, St. Moriz, Schloss Ehrenburg, Landestheater, Hofgarten, Veste, Albertsplatz, Kongresshaus Rosengarten, Bahnhof, Bismarckturm, Hexenturm |

Kartendaten © OpenStreetMap-Mitwirkende (ODbL). Luftbilder und 3D-Gebäudemodelle LoD2: Bayerische
Vermessungsverwaltung – www.geodaten.bayern.de (CC BY 4.0). Die Quellenangaben werden im Spiel unten rechts angezeigt
und müssen dort bleiben.

## 5. Architektur

| Datei | Aufgabe |
|---|---|
| `index.html`, `css/style.css` | Lade- und Startbildschirm, HUD, Stadtplan, Hilfe |
| `js/util.js` | Zufall, Raster für Nachbarschaftssuche, Polygon-Hilfen |
| `js/world.js` | Baut die Welt: Höhenmodell (Catmull-Rom auf 12,5 m verfeinert), Bodentextur (Leinwand, 1 px/m), Straßenbänder, Gebäude (LoD2-Flächen bzw. eigene Extrusion aus OSM, in 250-m-Kacheln für Sichtbarkeitsprüfung), Bäume (instanziert), Stadtplan. Dazu Kollision (`collideCircle`), `heightAt`, `insideBuilding`, `nearestRoad` |
| `js/vehicle.js` | Automodelle (Pkw, Sportwagen mit Spoiler, Taxi mit Dachschild, Streifenwagen mit Blaulicht), Fahrwerte je Typ, Arcade-Fahrphysik (Längs- und Seitenhaftung, Handbremse, Steigung, Teilschritte gegen Durchtunneln), Schaden, Brand, Wrack, Auto-gegen-Auto-Kollision |
| `js/traffic.js` | KI-Verkehr auf dem Straßennetz: fährt rechts, beachtet Einbahnstraßen, bremst vor Kurven, Hindernissen und dem Spieler |
| `js/player.js` | Spielfigur mit Lauf-Animation, Springen, Kollision mit Häusern, Bäumen und Autos; mit anderem Aussehen auch Polizisten |
| `js/ui.js` | Minikarte (dreht mit, Markierungen für Polizei, Checkpoints, Rennstarts, Läden, ferne am Rand), großer Stadtplan (Zoom, Verschieben, Klick = Reise), Ortsschilder, Geld, Sterne, Lebens- und Schadensbalken, große Meldungen |
| `js/game.js` | Szene, Licht und Schatten (folgt dem Spieler), Tag/Nacht, Eingabe, Kamera (weicht Hauswänden aus), Ton (WebAudio: Motor, Hupe, Aufprall, Martinshorn, Explosion, Signaltöne), Spielstand (Geld, Leben), Spawn am Bahnhof, Straftaten, Verhaftet/Erledigt, Feuer und Explosionen, Lackiererei und Händler, Hauptschleife |
| `js/driver.js` | `RoadNav`: Straßennetz als Graph (beide Richtungen, ohne Durchfahrten durch Gebäude), Dijkstra nach Fahrzeit, Wegsuche, Zufallspunkte. `AutoDriver`: KI-Fahrer mit echter Fahrphysik (Vorausschau-Lenkung, Kurvenbremsung, Ausweichen, Freifahren) |
| `js/police.js` | Fahndung, Streifenwagen (Verfolgen, Rammen, Anhalten), Polizisten zu Fuß, Festnahme, Straßensperren, Entkommen |
| `js/race.js` | Rennstrecken (aus Wegpunkten über das Netz berechnet), Start-Säulen, Checkpoints, KI-Gegner mit Gummiband, Zeitnahme, Preisgeld, Bestzeiten |
| `js/places.js` | Lackierereien und Autohändler (Lage, Säulen, Schilder) |
| `js/fx.js` | Partikel (Rauch, Feuer, Explosion mit Lichtblitz), leuchtende Säulen und Text-Schilder |
| `data/coburg.js` | **Erzeugt** von `tools/convert.js`: kompakte Spielwelt als `window.COBURG` (≈ 1,4 MB) |
| `data/lod2.js` | **Erzeugt** von `tools/convert-lod2.js`: Gebäudeflächen als `window.COBURG_LOD2` (≈ 5,9 MB) |
| `data/raw/` | Rohdaten: `coburg.osm.json`, `relations.osm.json`, `elevation.json` |
| `data/raw/lod2/` | LoD2-Rohdaten: 9 CityGML-Kacheln `{ost}_{nord}.gml` (UTM 32N, ≈ 430 MB, werden vom Spiel nicht geladen) |
| `tools/config.js` | Kartenausschnitt und Nullpunkt |
| `tools/utm.js` | Umrechnung UTM 32N (EPSG:25832) ↔ Länge/Breite (Krüger-Reihen, millimetergenau) |
| `tools/fetch-osm.js` | Lädt die OSM-Daten über die Overpass-API (mit Ausweichservern) |
| `tools/fetch-elevation.js` | Lädt das Höhenraster (≈ 38 Anfragen, 1 pro Sekunde) |
| `tools/fetch-ortho.js` | Lädt die Luftbildkacheln nach `data/ortho/` (Kachelgrenzen liegen auf Linien des Geländegitters) und schreibt `data/ortho/tiles.js` |
| `data/ortho/` | Luftbildkacheln `r{zeile}_c{spalte}.jpg` und `tiles.js` (Lage der Kacheln) |
| `tools/fetch-lod2.js` | Lädt die LoD2-Kacheln für den Ausschnitt von `download1/2.bayernwolke.de` und prüft sie mit den SHA-256-Summen aus der Metalink-Datei `geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink/09.meta4` |
| `tools/convert-lod2.js` | CityGML → `data/lod2.js`: Wand-, Dach- und Bodenflächen, UTM → Länge/Breite → Spielmeter (`projX`/`projZ` wie in `convert.js`), Höhen relativ zu `terrain.base`, Wände nach außen und Dächer nach oben gedreht, Namen und Typen aus OSM |
| `tools/convert.js` | Rohdaten → `data/coburg.js` (Projektion in Meter, Gebäudehöhen, Straßenbreiten, Multipolygone, Straßennetz, Gelände) |
| `server.js`, `start.bat` | Statischer Webserver ohne Abhängigkeiten auf Port 8175 |

**Koordinaten:** Meter, x = Osten, z = Süden, Höhe relativ zum Marktplatz.

**Daten neu laden / anderen Ausschnitt nehmen:** In `tools/config.js` den Ausschnitt (`BBOX`) und den Nullpunkt
(`ORIGIN`) ändern, dann:

```
node tools/fetch-osm.js
node tools/fetch-elevation.js
node tools/convert.js
node tools/fetch-ortho.js     # bei geändertem Ausschnitt vorher den Ordner data/ortho leeren
node tools/fetch-lod2.js      # lädt nur fehlende oder geänderte Kacheln
node tools/convert-lod2.js    # nach jedem convert.js neu ausführen (Geländebezug und OSM-Namen)
```

**Luftbilder in der Welt (`js/world.js`):** Jede Kachel ist ein eigenes Geländestück mit eigener Textur. Die Normalen
kommen aus dem ganzen Gitter, deshalb sieht man keine Kanten. Dächer werden von oben mit demselben Foto belegt
(Planarprojektion). Ein feines Rauschen im Shader (`addDetail`) bringt aus der Nähe Körnung ins Bild. `ORTHO_TINT`
gleicht die Helligkeit an die Szenenbeleuchtung an. Mit Luftbild werden nur Fahrbahnen als Geometrie gebaut, denn
Gehwege, Pfade und Plätze zeigt das Foto schon echt (`PHOTO_HIDE`).

**3D-Gebäude (LoD2) in der Welt (`js/world.js`, `buildLod2`):** Jedes Haus besteht aus seinen echten Wand- und
Dachflächen (Vielecke, konvexe als Fächer, sonst mit `THREE.ShapeUtils` zerlegt). Dächer bekommen das Luftbild
(`roofTri` mit `orthoUV`), Wände die Fenstertextur, kleine Nebengebäude graue Wände ohne Fenster. Das EU-DEM liegt im
Mittel 4 m (bis über 10 m) über der echten Bodenhöhe, weil es Dächer und Bäume enthält. Deshalb wird jedes Haus mit
seiner echten Höhe auf das tiefste Spielgelände unter dem Grundriss gestellt (an steilen Hängen so, dass mindestens 30 %
über den höchsten Geländepunkt ragen); die Wände reichen 2 m in den Boden. Die Grundrisse liefern die Kollisionskanten
(`edges`/`edgeGrid`) und `polyGrid`/`insideBuilding` mit der echten Firsthöhe als `top`. OSM-Häuser werden nur gebaut,
wenn weniger als 40 % ihres Grundrisses von LoD2 abgedeckt sind (`coveredByLod2`). Fehlt `data/lod2.js` oder passt
sie nicht zum Gelände (`meta.base`), baut das Spiel alle Häuser wie bisher aus OSM.

**Testen in der Konsole:** `game.travel(x, z, 'Name')`, `game.toggleNight()`, `game.enterCar(game.parked[0])`,
`game.debugCam = { pos: [x, y, z], look: [x, y, z] }` (freie Kamera, `null` schaltet sie wieder ab).
Seit v1.0.0 außerdem: `game.police.crime(0, 'Test', 3)` (3 Sterne), `game.races.list` / `game.races.start(r, game.car)`,
`game.addMoney(1000)`, `game.explode(auto)`, `game.busted()`, `game.wasted('Grund')` und
`game.simulate(sekunden, dt, zeichnen)`, das die Spielschleife ohne Bildschirm rechnet (zum Testen, wenn das
Browserfenster verdeckt ist; mit `zeichnen = false` sehr schnell). Tasten lassen sich über `game.keys.KeyW = true` usw. setzen.

## 6. Stand

- ✅ v0.1.0 (20.10.2026): spielbare erste Version.
  - Echte Coburger Innenstadt mit Gelände, Gebäuden, Straßen, Flüssen (Itz), Gleisen, Parks, Wald und Bäumen
  - Laufen (rennen, springen) und Autofahren (Driften, Steigungen), Ein-/Aussteigen, KI-Autos übernehmen
  - KI-Verkehr mit 34 Autos rund um den Spieler
  - Minikarte, Stadtplan mit Schnellreise, Straßenname im HUD, Tacho, schwebende Ortsschilder
  - Tag/Nacht mit leuchtenden Fenstern, Sternenhimmel und Scheinwerfern; Motor- und Hupenton
- ✅ Getestet im Browser: Laden ohne Fehler, ≈ 60 Bilder/s, Fahren durch Herrngasse/Theatergasse/Goethestraße,
  Driften, Wandkollision und Entlangrutschen, Laufen durch die Spitalgasse, Schnellreise zur Veste, Nachtmodus.
- ⚠️ Bekannte Grenzen:
  - Brücken und Tunnel liegen flach auf dem Gelände.
  - ~~Komplexe Bauten (Veste, Kirchen) sind nur einfache Blöcke; Gebäude ohne Höhenangabe haben geschätzte Höhen.~~
    Gelöst in v0.3.0 durch LoD2.
  - Der KI-Verkehr hält nicht an Ampeln oder Vorfahrtsregeln und fährt auch durch enge Altstadtgassen.
  - Am Smartphone fehlt eine Touch-Steuerung.

- ✅ v0.2.0 (20.10.2026): realistischere Stadt durch Luftbilder.
  - Echte Luftbilder als Boden: Pflaster des Marktplatzes, Gehwege, Gärten, Wald am Festungsberg
  - Jedes Dach trägt sein echtes Luftbild (Ziegelfarbe, Gauben, Solaranlagen)
  - Walmdächer für Altstadt- und Wohnhäuser statt Flachdächern (Grundriss nach innen versetzt; fällt bei schwierigen
    Grundrissen auf ein Flachdach zurück); Flachdächer aus OSM (`roof:shape=flat`) bleiben flach
  - Türme bekommen Spitzhelme; Türme mit pauschal 40 m in OSM werden auf 26 m begrenzt (Veste)
  - Sonne aus Südsüdost wie in den Luftbildern, damit 3D-Schatten und Fotoschatten zusammenpassen
- ✅ Getestet im Browser: alle 24 Kacheln laden, keine Fehler, weiter ≈ 60 Bilder/s, Tag und Nacht.
- ⚠️ Grenzen der Luftbilder: Hohe Gebäude sind im Foto leicht gekippt, deshalb sieht man neben manchen Häusern Teile
  von Dächern auf dem Boden. Geparkte Autos und Fotoschatten sind ins Bild „eingebrannt“. Aus Fußgängersicht ist das
  Foto etwas unscharf (0,6 m pro Pixel). Die Fassaden sind weiterhin erfunden, weil Luftbilder sie nicht zeigen.

- ✅ v0.3.0 (20.10.2026): echte 3D-Gebäude.
  - 11.459 Gebäude aus den amtlichen LoD2-Modellen: echte Höhen, Sattel-, Walm-, Pult- und Flachdächer und
    Türme, wie sie vermessen sind. Schloss Ehrenburg mit Innenhof, St. Moriz mit Doppeltürmen,
    die Veste mit Fürstenbau, Hohem Haus, Rotem und Blauem Turm
  - Dächer weiter mit Luftbild, Wände mit Fenstern (nachts beleuchtet); Namen aus OSM (Ortsanzeige im HUD)
  - ≈ 160 Gebäude, die in LoD2 fehlen oder über den Kartenrand reichen, kommen weiter aus OSM
  - Quellenangabe für LoD2 im HUD
- ✅ Getestet im Browser: Laden ohne Fehler, Altstadt, Ehrenburg und Veste aus der Luft und auf Straßenhöhe,
  Kollision und Herausschieben aus Hauswänden, Nachtmodus, Rückfall auf OSM-Häuser ohne `data/lod2.js`.
  Renderzeit 3–6 ms pro Bild (bis 1,4 Mio. Dreiecke, 200–1.400 Zeichenaufrufe), also Luft für 60 Bilder/s.
  Aufbau der Gebäude beim Laden ≈ 0,5 s.
- ⚠️ Grenzen von LoD2: Fassaden, Fenster und Wandfarben sind weiter erfunden (LoD2 hat keine Fassadentexturen).
  Dachüberstände, Balkone und Gauben-Details fehlen. Weil das Gelände (EU-DEM) ungenau ist, stehen Häuser einzeln
  auf dem Spielgelände; Treppen und Stufen zwischen Nachbarhäusern am Hang sind daher nicht ganz echt.

- ✅ v1.0.0 (20.10.2026): **GTA Coburg**.
  - Spawn am Bahnhof, Geld, Leben, Fahndungssterne, Speicherstand
  - Vier Fahrzeugtypen mit eigenen Fahrwerten und Modellen; Schaden, Rauch, Brand, Explosion, Wracks
  - Polizei mit echter Verfolgung über das Straßennetz, Rammen, Straßensperren, Polizisten zu Fuß, Festnahme,
    Entkommen, Martinshorn und Blaulicht
  - Vier Straßenrennen gegen drei KI-Gegner mit Checkpoints, Preisgeld und Bestzeiten
  - Lackierereien (Fahndung weg, Reparatur) und Autohändler (geklaute Autos verkaufen)
  - HUD im GTA-Stil (Geld, Sterne, Balken, Rennanzeige, VERHAFTET/ERLEDIGT), Markierungen auf Minikarte und Stadtplan
  - Fehler behoben: 20 LoD2-Brücken (ALKIS `53001_1800`) waren unsichtbare Wände quer über Straßen (Itz-Brücken,
    B 4). Flache Brücken werden jetzt nicht mehr gebaut (das Luftbild zeigt sie), hohe werden gezeichnet, sind aber
    keine Kollision mehr. Straßenabschnitte, die durch Gebäude führen (8 Stück), meidet die KI
- ✅ Getestet im Browser (über `game.simulate`): alle vier Strecken werden gebaut, die KI-Gegner fahren alle vier
  Strecken zu Ende (Schnitt 70–100 km/h) und weichen einem abgestellten Auto aus; Rennstart, Countdown, Checkpoints,
  Platzierung, Preisgeld und Bestzeit; Verfolgung mit 1–5 Sternen, Rammen, Polizist steigt aus, Festnahme;
  Straßensperren; Auto brennt aus mit Spieler darin („ERLEDIGT“); Lackiererei und Autohändler; keine Fehler in der
  Konsole. Die Spiellogik braucht ≈ 0,2 ms pro Bild (60 s Verfolgungsjagd in 0,35 s gerechnet).
- ⚠️ Grenzen von v1.0.0:
  - Ein echtes Durchspielen mit Tastatur und Blick auf die Bildrate steht noch aus (getestet wurde mit Skripten).
  - KI-Gegner verschrammen sich in der engen Altstadt (deshalb robustere Autos); Rennbalance (Tempo der Gegner,
    Preisgeld) ist geschätzt.
  - Polizisten schießen nicht, es gibt keine Waffen und keine Fußgänger.
  - Der Verkehr fährt weiter auf Schienen: er weicht nicht aus und bleibt bei Unfällen nur kurz stehen.

## 7. Nächste Schritte

- [ ] **Echtes Geländemodell DGM1** der Bayerischen Vermessungsverwaltung (Open Data, 1-m-Raster) statt EU-DEM:
  Dann passen Straßen, Plätze und LoD2-Häuser ohne Einzelkorrektur zusammen (die LoD2-Bodenhöhen zeigen bis über
  10 m Abweichung des EU-DEM)
- [ ] Schärfere Luftbilder in der Nähe des Spielers (volle 40-cm-Auflösung kachelweise nachladen)
- [ ] Echte Fassadenfarben, z. B. aus Straßenfotos (Mapillary, braucht einen kostenlosen Zugangsschlüssel)

- [ ] Fußgänger als KI-Figuren auf Gehwegen und Plätzen
- [ ] Brücken über die Itz mit eigener Höhe
- [ ] Spielziele: Taxi- oder Lieferaufträge zwischen Sehenswürdigkeiten, Sammelobjekte, Zeitrennen
- [ ] Straßenlaternen und Ampeln (aus OSM `highway=street_lamp`, `traffic_signals`)
- [ ] Touch-Steuerung für Smartphone und Tablet
- [ ] Tag-Nacht-Wechsel fließend statt per Taste, dazu Wetter (Regen, Nebel)
- [ ] Kartenausschnitt erweitern (z. B. Cortendorf, Ketschendorf) und Daten bei Bedarf kachelweise laden
- [ ] GTA Coburg: Fußgänger (Passanten, die weglaufen; Anfahren gibt Sterne), Polizeihubschrauber ab 4 Sternen
- [ ] GTA Coburg: Missionen (Taxi-Fahrten, Kurierfahrten, „Auto liefern“ auf Bestellung), Stunt-Sprünge
- [ ] GTA Coburg: Rennen auch mit Fahndung („illegales Straßenrennen“, Polizei taucht während des Rennens auf)
- [ ] Mehr Fahrzeugtypen (Bus, Lieferwagen, Motorrad)
- [ ] Verkehr mit echter Fahrphysik, der auf Unfälle reagiert (heute fährt er auf Schienen)
