# Grand Theft Coburg (Coburg Open World) – Projektdokumentation

> Lebendes Projektdokument. Wird bei jeder Arbeitssitzung aktualisiert:
> Stand, Änderungen und **nächste Schritte** stehen immer hier.

**Version:** 1.3.0 „Grand Theft Coburg“ · **Letzte Aktualisierung:** 21.10.2026

---

## 1. Übersicht

Ein Open-World-Spiel im Browser, das aus **echten Kartendaten der Coburger Innenstadt** (OpenStreetMap) gebaut ist.
Man läuft zu Fuß durch die Stadt oder fährt mit dem Auto. Alle Straßen tragen ihre echten Namen. Dazu kommt ein
echtes Höhenmodell, deshalb liegt die Veste wirklich oben auf dem Festungsberg. Seit v0.2.0 liegen **echte
Luftbilder** der Bayerischen Vermessungsverwaltung auf dem Boden und auf allen Dächern. Seit v0.3.0 stehen die Häuser
als **amtliche 3D-Gebäudemodelle (LoD2)** in der Stadt: mit echten Höhen und echten Dachformen, von der Altstadt über
Schloss Ehrenburg bis zur Veste.

**Seit v1.0.0 ist es „Grand Theft Coburg“** (bis v1.0.1 hieß es „GTA Coburg“): das Spielprinzip von Vice City io auf der Coburger Karte: **Autos** klauen
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

**Repository:** https://github.com/nicring888-commits/GTA-Coburg (Branch `main`, öffentlich). Die Rohdaten
`data/raw/` (≈ 430 MB) sind per `.gitignore` ausgeschlossen. Das Spiel ist eine statische Seite und lässt sich ohne
Build-Schritt veröffentlichen (Vercel: Repository importieren, kein Build-Befehl; oder GitHub Pages: `main`, Ordner `/`).

## 3. Steuerung

| | Zu Fuß | Im Auto |
|---|---|---|
| Bewegen | `W A S D` (relativ zur Kamera) | `W`/`S` Gas, Bremse, rückwärts · `A`/`D` lenken |
| Extra | `Shift` rennen · `Leertaste` springen | `Leertaste` Handbremse (Driften) · `H` Hupe · `R` aufrichten · `C` Kamera |
| Allgemein | `E` einsteigen, Auto klauen, aussteigen (bei brennendem Auto bei jedem Tempo) · `F` Rennen starten/abbrechen, Auto verkaufen, an Haustür oder Autohaus: Menü · `G` Garage · `M` Stadtplan mit Schnellreise (gesperrt bei Fahndung und im Rennen) · `N` Tag/Nacht · `F1` Hilfe · Maus umsehen · Mausrad Zoom | |

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
| Fußgänger (seit v1.1.0) | Bis zu 150 Passanten im Umkreis von 170 m, gut die Hälfte gezielt in der Fußgängerzone (Markt, Spitalgasse, Steinweg, Ketschengasse, Herrngasse …). Sie laufen über Fußwege, Plätze und Gehsteige (rechts der Laufrichtung), bleiben stehen, gehen zu zweit, darunter Kinder. Sie springen vor schnellen Autos zur Seite, fliehen bei Explosionen und vor der Hupe (`H`). Anfahren: Person fällt um, Zeugen rufen die Polizei (bei Polizei in Sichtweite sicher, sonst 40 %). Dazu ≈ 130 feste Figuren: Café-Gäste, Leute auf Bänken, Händler, Kunden am Bratwurststand |
| Stadtdetails (seit v1.1.0) | ≈ 1.600 Straßenlaternen (bis 1,3 km um den Markt, nachts mit Lichtkegel am Boden), ≈ 120 Altstadtlaternen in der Fußgängerzone, gestreifte Markisen (≈ 280) und Ladenschilder (≈ 220, nachts leuchtend) an den Fassaden der Fußgängerzone, Café-Terrassen mit Sonnenschirmen vor echten Cafés und Restaurants aus OSM (≈ 90 Tische), Bänke, Mülleimer, Blumenkübel, abgestellte Fahrräder, 17 Brunnen mit Wasserstrahl (OSM `fountain`). Am Markt: Prinz-Albert-Denkmal, sechs Marktstände, Coburger-Bratwurststand mit Grillrauch und Kundschaft, 30 Tauben, die vor Spieler, Autos und Explosionen auffliegen. Stimmengewirr, je mehr Leute in der Nähe sind. Laternen, Bänke, Tische, Stände und Brunnen sind Hindernisse für Autos |
| Wohnungen (seit v1.2.0) | Sieben kaufbare Wohnungen mit eigener Haustür an echten Fassaden (violette Säule, Schild mit Typ, Größe, Preis): Apartment Lossaustraße € 2.500 und Altbauwohnung Judengasse € 4.500 (klein), Stadtwohnung Mohrenstraße € 9.500, Loft am Steinweg € 12.000, Wohnung Ketschengasse € 14.000 (modern), Penthouse am Glockenberg € 38.000, Villa Leopoldstraße € 55.000 (Luxus). `F` an der Tür öffnet das Menü mit Grundriss, Ausstattung und Preis: **Besichtigen** (kostenlos), **Kaufen** (nur mit genug Geld), **Betreten**, **Garage**. Gekaufte Wohnungen leuchten gold |
| Innenräume | Drei Typen, beim Betreten Überblendung in einen eigenen Raum, beim Verlassen (`E` an der Wohnungstür) steht man wieder vor derselben Haustür. **Klein** (9 × 7 m, Altbau mit Dielen und Tapete: Bett, Kochnische, Tisch, Sofa, Fernseher, Bücherregal, Küchenradio). **Modern** (13 × 10 m, Fensterfront, Kücheninsel mit Hockern, Essplatz, Sofalandschaft, Großbild-TV, Hi-Fi, Schlafbereich hinter Glaswand). **Luxus** (19 × 14 m, Marmor, Panoramafenster, Whirlpool mit Wellen und Blasen, Bar mit beleuchtetem Flaschenregal, Flügel, Kamin mit Flammen, Kino-TV, Kronleuchter, Schlafpodest). Blick aus dem Fenster auf Altstadtdächer und Veste, nachts mit Lichtern |
| Interaktionen drinnen | `E`: Schlafen (Leben voll, Tag/Nacht wechselt, Spiel gespeichert), Fernseher (Coburg TV mit Laufband, Fußball, Stadtansicht), Licht an/aus, Radio/Musik (kleine Akkordschleife), Snack/Espresso/Drink (+30 Leben), Whirlpool (Leben voll), Klavier spielen, Kamin. `F`: Kaufen bzw. Infos. Bei Besichtigung gehen Schlafen und Essen erst nach dem Kauf. Mit Fahndung kommt man nicht hinein |
| Autohaus (türkis, seit v1.2.0) | Zwei Autohäuser (am Bahnhof, Coburg Süd). `F` zu Fuß oder langsam im Auto: Neuwagen Pkw € 1.800, Taxi € 2.400, Sportwagen € 9.500 (gleiche Modelle und Fahrphysik wie im Verkehr), Farbe wählbar, Werte als Balken. Das neue Auto steht vor dem Autohaus |
| Garage (`G`) | Eigene Autos (bis 8): Zustand, Farbe und Ort werden gespeichert. **Rausfahren/Herholen** stellt das Auto an den nächsten Straßenrand (immer nur eins draußen, das andere fährt zurück), **Einparken**, zerstörte Autos **reparieren** (20 % des Kaufpreises). Lackiererei ändert die gespeicherte Farbe, Verkauf beim Händler entfernt das Auto aus der Garage. Eigenes Auto: gelber Punkt auf Minikarte und Stadtplan, Einsteigen ohne Fahndung |
| Speicherstand | Geld, Bestzeiten, Wohnungen (`homes`) und Garage (`garage`: Typ, Farbe, Zustand, zerstört) im Browser (`localStorage`, Schlüssel `gta-coburg-v1`; ältere Spielstände werden ergänzt) |

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
| `js/pedestrians.js` | Fußgänger: Wegenetz aus Fußwegen, Plätzen und Gehsteigen, Laufen, Stehenbleiben, Paare, Flucht, Umfallen, feste Café-Gäste; alle Figuren als 5 InstancedMeshes |
| `js/props.js` | Stadtdetails: Laternen, Möbel, Markisen, echte Ladenschilder (`shopSigns`, Texturatlas), Schilder, Café-Terrassen, Marktplatz (Denkmal, Stände, Bratwurststand), Brunnen, Tauben; `mergeGeos` fasst Formen zusammen |
| `js/places.js` | Lackierereien und Autohändler (Lage, Säulen, Schilder) |
| `js/property.js` | Besitz (seit v1.2.0): Wohnungsliste, Haustür an der nächsten Fassade (`placeHome`/`facade`), Autohäuser, Garage mit eigenen Autos (`deliver`/`stow`/`carSold`), gemeinsames Menü (`#menu`), Betreten/Verlassen, Interaktionen und Licht drinnen, Speicherstand |
| `js/interiors.js` | Innenräume (`Room`): Raumhülle, Fenster mit Ausblick, Möbel aus Quadern mit gemalten Texturen, Kollision als Rechtecke (`collide`, `walker` ersetzt die Welt-Abfragen für die Spielfigur), Kamera innerhalb der Wände (`clampCam`), Stellen zum Benutzen; drei Grundrisse `buildSmallRoom`/`buildModernRoom`/`buildLuxuryRoom` |
| `js/fx.js` | Partikel (Rauch, Feuer, Explosion mit Lichtblitz), leuchtende Säulen und Text-Schilder |
| `data/coburg.js` | **Erzeugt** von `tools/convert.js`: kompakte Spielwelt als `window.COBURG` (≈ 1,4 MB) |
| `data/lod2.js` | **Erzeugt** von `tools/convert-lod2.js`: Gebäudeflächen als `window.COBURG_LOD2` (≈ 5,9 MB) |
| `data/shops.js` | **Erzeugt** von `tools/convert-shops.js` aus `recherche/pois-coburg.json`: Läden und Lokale als `window.COBURG_SHOPS` ([Name, Art, x, z, geprüft]) |
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
node tools/convert-shops.js   # nach Änderungen an recherche/pois-coburg.json
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
`game.property` (z. B. `game.property.enter(game.property.homes[0], true)`, `.exit()`, `.openGarage()`, `.openShop(game.property.shops[0])`) und
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

- ✅ v1.3.0 (21.10.2026): **Echte Ladenschilder.** 332 von 345 Läden und Lokalen (OSM, 27 per Google Maps geprüft,
  geschlossene entfernt) tragen ihren Namen auf einem Schild über dem Erdgeschoss, an der Hauswand zur nächsten Straße.
  Farben nach Marke (H&M, Müller, Thalia, Sparkasse, Telekom …) oder nach Art (Döner rot/gelb, Restaurant grün/gold,
  Café braun, Bäckerei creme …). Gaststätten und Bäckereien haben zusätzlich ein zweiseitiges Nasenschild am Arm.
  Nachts leuchten die Schilder. Namenlose Zufallsschilder erscheinen nur noch, wo kein echtes Schild hängt.
  Getestet im Browser: Aufbau ohne Fehler, Spitalgasse (Thalia, Fexcom) und Herrngasse (Goldenes Kreuz, Petra Reuther).
- ⚠️ Grenzen v1.3.0: Das Schild sitzt auf der Wand des Hauses, in dem der OSM-/Google-Punkt liegt, nicht immer genau
  über der echten Ladentür; bei mehreren Läden in einem Haus werden manche weggelassen; die Schrift ist eine
  Standardschrift (keine Logos).

- ✅ v1.2.1 (21.10.2026): **Echtere Altstadt nach Straßenfotos** (Grundlage `recherche/referenz-coburg.md`).
  - Fassadenfarben je Lage statt reinem Zufall (`World.facadePalette`): bunte Altstadt-Palette (Cremeweiß, Ocker,
    Lachs, Altrosa, Ziegelrot, Mint) innerhalb der Altstadt samt Steinweg und Steintor; Gründerzeit-Palette
    (Sandstein, heller Klinker, gedeckte Töne) an Mohrenstraße, Löwenstraße, Bahnhofsviertel usw. (Liste
    `GRUENDERZEIT_STREETS`); sonst die bisherigen Farben. Feste Farben für Stadthaus, Rathaus, Landestheater und
    Bahnhof (`LANDMARK_FACADES`)
  - Granit-Kleinpflaster im Segmentbogen in der Fußgängerzone (Spitalgasse, Ketschengasse, Markt usw.): kachelbare
    Canvas-Textur, die multiplikativ über das Luftbild gelegt wird (`makePaveTexture`, `paveArea`); ohne Luftbild
    granitgrau statt beige
  - Getestet im Browser: Aufbau ohne Fehler, Spitalgasse aus Augenhöhe (Pflaster sichtbar, Luftbild bleibt erhalten),
    Markt (Stadthaus weiß), Mohrenstraße (Sandstein und Klinker)
- ⚠️ Grenzen v1.2.1: Die Fassaden sind weiter einfarbig mit einer Fenstertextur (keine roten Fensterrahmen am
  Stadthaus, keine blauen Wandfelder am Rathaus, keine Ladenschilder); die Pflasterstruktur liegt auch über
  Marktständen und Schatten im Luftbild.

- ✅ v1.2.0 (20.10.2026): **Wohnungen und eigene Autos** (siehe Tabelle in 3a).
  - Neue Module `js/property.js` und `js/interiors.js`; in `game.js` nur Einbindung: Zweig `indoorStep`/`indoorCamera`
    für drinnen, `setIndoor` blendet die Stadt aus (nur Raum, Figur, Sonne und Himmelslicht bleiben, deshalb kostet ein
    Innenraum ≈ 1 ms pro Bild), `applySky` statt Licht-Code in `toggleNight`, `walkInput` gemeinsam für draußen und
    drinnen, Tasten `F` (Tür, Autohaus) und `G` (Garage). `ui.js`: Farbtabelle `PLACE_COLOR` für die neuen Orte.
    Innenräume werden erst beim ersten Betreten gebaut, Licht drinnen nutzt die vorhandenen Lichtquellen (keine
    zusätzlichen Lampen, also kein Neuübersetzen der Shader)
  - Getestet im Browser (Skript und Screenshots): alle 7 Türen finden eine Fassade; Kaufen mit zu wenig Geld gesperrt,
    mit genug Geld abgebucht; Besichtigen, Betreten, alle Interaktionen, Verlassen vor der richtigen Tür; Sperre bei
    Fahndung; Autohaus mit Farbwahl, Auslieferung, Schaden wird gespeichert, Einparken/Herholen, Zerstörung und
    Reparatur, Verkauf eigener Autos; Neuladen behält Geld, Wohnung und Garage; Rennen (auch im eigenen Auto) und
    Polizei laufen weiter, keine Fehler in der Konsole
  - Behoben beim Testen: Fensterbilder teilten sich die Bildquelle (Tag/Nacht hätte alle Fenster umgestellt), Flaschen
    und Whirlpool-Wasser steckten in massiven Blöcken, Kamera klebte nach dem Betreten am Hinterkopf (jetzt steiler von
    oben, wenn eine Wand im Weg ist), Banner überlappte die Ortsanzeige
- ⚠️ Grenzen v1.2.0: Möbel sind achsparallel und aus einfachen Formen; Wohnungen lassen sich nicht wieder verkaufen;
  Neustart nach Festnahme/Krankenhaus bleibt am Bahnhof (nicht zu Hause); in der Fußgängerzone wird ein bestelltes
  Auto an der nächsten befahrbaren Straße abgestellt (Hinweis mit Entfernung und Straße); die Türen sitzen auf der
  Grundrisskante aus LoD2/ALKIS und nicht immer an der echten Haustür.

- ✅ v1.1.0 (20.10.2026): lebendigere Stadt – Fußgänger (besonders in der Fußgängerzone) und viele Details in der
  Innenstadt (siehe Tabelle in 3a). Getestet über `game.simulate`: Aufbau ohne Fehler, ≈ 150 Passanten, davon ≈ 45 im
  Umkreis von 40 m am Markt; Anfahren mit Sturz und Fahndung; Nachtlicht der Laternen. Spiellogik ≈ 0,1 ms, Zeichnen
  ≈ 2,6 ms pro Bild (im verdeckten Vorschaufenster gemessen).
- ⚠️ Grenzen v1.1.0: Fußgänger gehen nicht über Ampeln und weichen einander nicht aus (laufen durcheinander durch);
  der Verkehr auf Schienen hält nicht für sie an, sondern schiebt sie nur zur Seite. Markisen und Schilder sind ohne
  echte Ladennamen. Lage der Marktstände und des Bratwurststands ist geschätzt, nicht vermessen.
- ✅ v1.0.1 (20.10.2026): Spielname „Grand Theft Coburg“ statt „GTA Coburg“ (Titel, Logo, Willkommensmeldung, README).
  Repository-Name und Speicherschlüssel `gta-coburg-v1` bleiben, damit Links und Spielstände gültig bleiben.
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

- [ ] Wohnungen: Neustart nach „ERLEDIGT“/„VERHAFTET“ im eigenen Zuhause, Kleiderschrank (andere Kleidung), Wohnung wieder verkaufen, Einnahmen (Miete)
- [ ] Garagen-Stellplatz vor jeder eigenen Wohnung (Auto dort einparken statt per Menü)

- [ ] **Echtes Geländemodell DGM1** der Bayerischen Vermessungsverwaltung (Open Data, 1-m-Raster) statt EU-DEM:
  Dann passen Straßen, Plätze und LoD2-Häuser ohne Einzelkorrektur zusammen (die LoD2-Bodenhöhen zeigen bis über
  10 m Abweichung des EU-DEM)
- [ ] Schärfere Luftbilder in der Nähe des Spielers (volle 40-cm-Auflösung kachelweise nachladen)
- [ ] Echte Fassadenfarben, Fenster, Gehwege und Wahrzeichen nach der **Referenzrecherche vom 21.10.2026**
  (`recherche/referenz-coburg.md`: Street View, Bildersuche, Farbpalette, Straßen- und Platzbeschreibungen,
  Umbauvorschläge; `recherche/pois-coburg.json`: 349 Läden/Lokale mit Spielkoordinaten, 27 per Google Maps geprüft;
  `recherche/streetview-panos.json`: 802 Street-View-Aufnahmepunkte). Umgesetzt in v1.2.1: Fassadenfarben je Straße,
  Pflaster der Fußgängerzone; v1.3.0: Ladenschilder. Offen: Fensterläden/Sandstein-Gewände, Wahrzeichen-Details (Tortürme,
  Stadthaus-Erker, Rathaus-Türmchen), Gehwegplatten mit Granitrinne, historische Laternen

- [ ] Fußgänger als KI-Figuren auf Gehwegen und Plätzen
- [ ] Brücken über die Itz mit eigener Höhe
- [ ] Spielziele: Taxi- oder Lieferaufträge zwischen Sehenswürdigkeiten, Sammelobjekte, Zeitrennen
- [ ] Straßenlaternen und Ampeln (aus OSM `highway=street_lamp`, `traffic_signals`)
- [ ] Touch-Steuerung für Smartphone und Tablet
- [ ] Tag-Nacht-Wechsel fließend statt per Taste, dazu Wetter (Regen, Nebel)
- [ ] Kartenausschnitt erweitern (z. B. Cortendorf, Ketschendorf) und Daten bei Bedarf kachelweise laden
- [ ] Polizeihubschrauber ab 4 Sternen
- [ ] Fußgänger: an Zebrastreifen/Ampeln über die Straße, einander ausweichen, Verkehr hält für sie an
- [ ] Weihnachtsmarkt im Winter; Ladenschilder genauer an die echte Ladentür setzen (Hausnummern-Positionen aus OSM `addr:*`)
- [ ] Missionen (Taxi-Fahrten, Kurierfahrten, „Auto liefern“ auf Bestellung), Stunt-Sprünge
- [ ] Rennen auch mit Fahndung („illegales Straßenrennen“, Polizei taucht während des Rennens auf)
- [ ] Mehr Fahrzeugtypen (Bus, Lieferwagen, Motorrad)
- [ ] Verkehr mit echter Fahrphysik, der auf Unfälle reagiert (heute fährt er auf Schienen)
