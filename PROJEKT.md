# GTA Coburg (Coburg Open World) – Projektdokumentation

> Lebendes Projektdokument. Wird bei jeder Arbeitssitzung aktualisiert:
> Stand, Änderungen und **nächste Schritte** stehen immer hier.

**Version:** 3.1.1 „GTA Coburg – Online überall“ · **Letzte Aktualisierung:** 24.10.2026

---

## 1. Übersicht

Ein Open-World-Spiel im Browser, das aus **echten Kartendaten der Coburger Innenstadt** (OpenStreetMap) gebaut ist.
Man läuft zu Fuß durch die Stadt oder fährt mit dem Auto. Alle Straßen tragen ihre echten Namen. Dazu kommt ein
echtes Höhenmodell, deshalb liegt die Veste wirklich oben auf dem Festungsberg. Seit v0.2.0 liegen **echte
Luftbilder** der Bayerischen Vermessungsverwaltung auf dem Boden und auf allen Dächern. Seit v0.3.0 stehen die Häuser
als **amtliche 3D-Gebäudemodelle (LoD2)** in der Stadt: mit echten Höhen und echten Dachformen, von der Altstadt über
Schloss Ehrenburg bis zur Veste.

**Seit v1.0.0 ist es ein GTA-artiges Spiel**, seit v3.1.1 heißt es wieder **„GTA Coburg“** (v1.0.1–v3.1.0 „Grand Theft Coburg“): das Spielprinzip von Vice City io auf der Coburger Karte: **Autos** klauen
und verkaufen, **Straßenrennen** gegen KI-Fahrer um Preisgeld und die **Polizei**, die mit Sternen fahndet, verfolgt,
rammt, Straßensperren baut und festnimmt. Man startet am **Bahnhof** (Vorplatz an der Lossaustraße), ein Auto steht bereit.

Kartenausschnitt: **seit v2.0.0 der ganze Landkreis Coburg mit der Stadt Coburg** (≈ 39,6 × 37,9 km, Breite
50,074–50,411, Länge 10,690–11,225). Die Innenstadt (3,6 × 2,6 km vom Bahnhof bis zur Veste) bleibt das detaillierte
Kerngebiet mit LoD2-Häusern, Fußgängern und Läden. Drumherum liegt das Umland in Kacheln von ≈ 1 km, die rund um den
Spieler gebaut und wieder abgebaut werden: Gelände, Luftbild, Straßen, Häuser aus OSM und Bäume (siehe 5, „Umland“).
Der Nullpunkt der Welt ist der Marktplatz.

## 2. Starten

- **Doppelklick auf `start.bat`**: Das startet den Server und öffnet http://127.0.0.1:8175 im Browser.
- Oder im Terminal: `node server.js`.
- Notfalls geht auch ein direkter Doppelklick auf `index.html`. Dann fehlen aber die Luftbilder, weil der Browser
  Bilddateien von der Festplatte nicht als Textur erlaubt. Das Spiel nimmt dann die gemalte Bodentextur.

Für three.js (r160, über das CDN jsDelivr) wird eine Internetverbindung gebraucht.

**Online spielen (seit v3.0.0):** Der Server (`server.js`) betreibt neben dem Spiel den Mehrspieler-Server
(WebSocket unter `/mp`, ohne Fremdpakete). Auf dem Startbildschirm „🌐 Online spielen“ → Name, Lobby wählen,
„Schnell beitreten“, eigene (auch private) Lobby erstellen oder mit Code beitreten. Einladungslink: `?lobby=CODE`.
- **Auf Vercel, GitHub Pages & Co. (seit v3.1.0, ohne eigenen Server):** Das Spiel merkt, dass die Seite keinen
  Mehrspieler-Server hat (`/api/health` fehlt), und spielt **Peer-to-Peer** über WebRTC: Wer eine leere Lobby betritt,
  wird Gastgeber; der Mehrspieler-Kern mit allen Prüfungen läuft dann in seinem Browser. Verbindungsaufbau über den
  kostenlosen PeerJS-Dienst (inkl. TURN-Relais für schwierige Router), Spieldaten direkt zwischen den Browsern.
  Verlässt der Gastgeber das Spiel, übernimmt ein anderer Spieler in ≈ 1 s (Autos werden neu angemeldet).
  Erzwingen mit `?server=p2p`.
- **Nur dieser Rechner:** `start.bat` bzw. `node server.js` (mehrere Browserfenster zum Ausprobieren).
- **Heimnetz (LAN):** `start-lan.bat` bzw. `node server.js --lan`; die Konsole zeigt die Adresse
  (`http://192.168.x.x:8175`), die Freunde im selben WLAN öffnen. Windows fragt einmal nach der Firewall-Freigabe.
- **Internet, kostenlos:** auf Render (render.com, Free-Plan) das GitHub-Repository als „Blueprint“ verbinden;
  `render.yaml` startet `node server.js --public` (Spiel und Server zusammen, WebSocket über `wss://`). Free-Dienste
  schlafen nach 15 min ohne Besucher ein, der erste Aufruf dauert dann ≈ 1 min. Liegt das Spiel woanders (Vercel,
  GitHub Pages), in `js/mp-config.js` `window.MP_SERVER = 'wss://….onrender.com'` eintragen (oder `?server=…`).
- Grenzen per Umgebungsvariable: `MP_MAX_PER_IP` (Standard 8), `MP_MAX_CONN` (256), `MP_ORIGINS` (erlaubte Seiten,
  kommagetrennt; leer = alle).

**Repository:** https://github.com/nicring888-commits/GTA-Coburg (Branch `main`, öffentlich). Die Rohdaten
`data/raw/` (≈ 430 MB) sind per `.gitignore` ausgeschlossen. Das Spiel ist eine statische Seite und lässt sich ohne
Build-Schritt veröffentlichen (Vercel: Repository importieren, kein Build-Befehl; oder GitHub Pages: `main`, Ordner `/`).

## 3. Steuerung

| | Zu Fuß | Im Auto |
|---|---|---|
| Bewegen | `W A S D` (relativ zur Kamera) | `W`/`S` Gas, Bremse, rückwärts · `A`/`D` lenken |
| Extra | `Shift` rennen · `Leertaste` springen | `Leertaste` Handbremse (Driften) · `H` Hupe · `R` aufrichten · `C` Kamera |
| Online | `T`/`Enter` Chat · `Tab` Spielerliste mit Lobby-Code, Einladungslink, „Lobby verlassen“ · `E` am Auto eines Mitspielers: mitfahren (Fahrer da) bzw. übernehmen (leer) · `N`/`K` Zeitraffer und Wetter für die ganze Lobby | |
| Allgemein | `E` einsteigen, Auto klauen, aussteigen (bei brennendem Auto bei jedem Tempo) · `F` Rennen starten/abbrechen, Auto verkaufen, an Haustür oder Autohaus: Menü · `G` Garage · `M` Stadtplan mit Schnellreise (gesperrt bei Fahndung und im Rennen) · `N` Zeitraffer bis 22 bzw. 9 Uhr · `K` Wetter wechseln · `O` Grafikqualität (Ultra, Hoch, Mittel, Niedrig; wird gespeichert) · `F1` Hilfe · Maus umsehen · Mausrad Zoom | |

## 3a. Spielprinzip (seit v1.0.0)

| Was | Wie es funktioniert |
|---|---|
| Start | Vorplatz des Bahnhofs (zwischen Bahnhofsgebäude und Lossaustraße), rotes Auto am Straßenrand, Startgeld € 500 |
| Autos | Kleinwagen (144 km/h), Pkw (158 km/h), Kombi (166 km/h), Kleinbus (144 km/h, sehr robust), Pick-up (162 km/h), Geländewagen (169 km/h, fast so robust wie ein Streifenwagen), Cabrio (194 km/h, offen), Sportwagen (216 km/h, schnell beschleunigend), Taxi (elfenbein mit Dachschild), Streifenwagen (silber-blau, Blaulicht, „POLIZEI“). Jedes Auto im Verkehr lässt sich mit `E` klauen. Autos nehmen Schaden: erst Rauch, unter 25 % weniger Leistung, bei 0 % brennt das Auto und explodiert nach 4,5 s (Druckwelle beschädigt Autos und verletzt Fußgänger). Wracks qualmen und bleiben eine Weile liegen |
| Fahndung (★ 1–5) | Autodiebstahl, wenn ein Polizist oder ein Zeuge (30 %) es sieht · Unfall vor den Augen der Polizei · Polizeiauto rammen · Streifenwagen klauen (mind. 2 ★) · Polizist anfahren (mind. 2 ★) · Streifenwagen zerstören. Je länger die Polizei dich sieht, desto mehr Sterne |
| Polizei | 2/3/4/5/7 Streifenwagen je Sternzahl; zuerst werden Streifen aus dem Verkehr alarmiert, sonst kommen neue außer Sicht hinzu. Sie fahren mit der normalen Fahrphysik über das Straßennetz (kürzester Weg), rammen aus der Nähe, halten neben einem langsamen Spieler an. Tempo wächst mit den Sternen (1 ★ ≈ 135 km/h, 5 ★ ≈ 175 km/h). Ab 3 ★ Straßensperren vor dem Spieler. Martinshorn (Tatü-tata), Blaulicht, blinkende Punkte auf der Minikarte |
| Festnahme | Steht man still, steigt ein Polizist aus und rennt hinterher (etwas langsamer als der rennende Spieler). Erwischt er dich, füllt sich der Balken „Festnahme“ → **VERHAFTET**, Strafe € 100 + 100 je Stern, Neustart am Bahnhof |
| Entkommen | Außer Sicht der Polizei bleiben und sich von der Stelle entfernen, an der sie dich zuletzt gesehen hat (Sterne blinken). Nach 8 s + 3,5 s je Stern ist die Fahndung vorbei: **ENTKOMMEN**, Belohnung € 150 je Stern |
| Leben | Zu Fuß verletzen dich Autos (ab 18 km/h) und Explosionen; nach 8 s ohne Treffer heilt man langsam. Bei 0 oder im explodierenden Auto: **ERLEDIGT**, Krankenhaus € 100, Neustart am Bahnhof |
| Rennen (blaue Säulen) | Im Auto in die Säule fahren, `F`: Countdown 3-2-1, drei KI-Gegner in Sportwagen (Kevin, Jessy, Dennis) mit Gummiband und Ausweichen. Gelbe Checkpoint-Säulen, Zielsäule kariert, Strecke gelb auf der Minikarte. Preisgeld für Platz 1–3, Bestzeiten werden gespeichert. Nur ohne Fahndung startbar |
| Strecken (Stadt) | **Bahnhofs-Sprint** (2,1 km, Bahnhof → Theater → Ehrenburg → Rosengarten) · **Schnellweg-Rennen** (2,5 km, B 4 von Nord nach Süd) · **Veste-Bergrennen** (1,2 km bergauf zur Veste) · **Altstadt-Runde** (3,5 km Rundkurs) |
| Strecken (Landkreis, seit v2.0.0) | **Callenberg-Bergsprint** (Coburg → Schloss Callenberg) · **Rosenau-Rallye** (6,7 km, Dörfles-Esbach → Rödental → Schloss Rosenau) · **Neustadt-Express** (9,3 km, Rödental → Mönchröden → Neustadt Markt) · **Rodachtal-Rennen** (12,8 km, Wiesenfeld → Meeder → Bad Rodach) · **Seßlach-Classic** (10,3 km, Weitramsdorf → Tambach → Seßlach) · **Itzgrund-Sprint** (Untersiemau → Großheirath → Rossach → Kaltenbrunn) · **Sonnefelder Runde** (21,5 km, Ebersdorf → Sonnefeld → Weidhausen → Ebersdorf) · **Lautertal-Tour** (Coburg-Neuses → Tiefenlauter → Froschgrundsee) · **Hohenstein-Hügelrennen** (7,8 km, Ahorn → Schloss Hohenstein → Scherneck) · **Großer Preis des Landkreises** (50,3 km, Bahnhof → Rödental → Neustadt → Fürth am Berg → Sonnefeld → Ebersdorf → Grub am Forst → Niederfüllbach → Coburg; € 9.000 für den Sieg). Wegpunkte als Breite/Länge (`geo` in `RACES`); auf langen Strecken liegen die Checkpoints weiter auseinander (≈ 45 je Strecke) |
| Lackiererei (grün) | Langsam hineinfahren: Reparatur € 100, mit Fahndung € 250 (neue Farbe, Sterne weg). Geht nicht, solange die Polizei dich sieht. In der Stadt Nord, Süd, Ost; im Landkreis Rödental, Neustadt, Bad Rodach, Ebersdorf, Seßlach |
| Autohändler (orange) | `F`: Auto verkaufen; Preis je nach Typ und Zustand (Sportwagen bis € 1.400). Streifenwagen nimmt keiner. Zwei in der Stadt, dazu Neustadt, Ebersdorf, Untersiemau |
| Orte im Landkreis (seit v2.1.0) | In jeder Ortskachel (ab 12 Häusern) im Umkreis von 650 m: Straßenlaternen alle ≈ 30 m an Ortsstraßen (nachts mit Lichtkegel), Ladenschilder mit echten Namen an den Fassaden (800 Läden und Lokale aus OSM), bis zu 4 begehbare Lokale je Kachel nach Art (Döner, Gasthaus/Restaurant/Pizzeria, Café/Bäckerei, Mode, Drogerie, Bücher) mit den Innenräumen und Speisekarten der Innenstadt, und bis zu 45 Fußgänger auf den Gehsteigen |
| Wasser (seit v2.1.0) | Flüsse, Bäche, Seen und Teiche haben ein ausgehobenes Bett (1,7 m, Bäche 0,8 m) und eine bewegte Wasseroberfläche. Flüsse ab 5 m Breite und Gewässer ab 150 m² sind Hindernisse für Figuren und Autos: Wer dem Flusslauf näher kommt als die halbe Breite, wird ans eigene Ufer zurückgeschoben; Seen und Flussflächen haben Uferkanten. An Straßen und Brücken bleibt frei (dort wird auch nicht gegraben). Bäume stehen nicht im Wasser. Gilt in der Innenstadt (Itz, Lauter) und im Landkreis |
| Brücken (seit v2.1.0) | Brücken, die mehr als 1,5 m über dem Gelände liegen (A 73 über das Itztal bis 16 m hoch, B 4), haben eine gerade Fahrbahn zwischen den Brückenenden mit Platte, Brüstung und Pfeilern alle ≈ 28 m. Autos und Figuren fahren bzw. laufen oben (`World.groundAt` mit der jetzigen Höhe), darunter bleibt das Tal frei befahrbar |
| Landkreis (seit v2.0.0) | Die Ortsanzeige zeigt Straße und Ort („Marktplatz · Neustadt bei Coburg“), beim Ankommen in einem Ort erscheint der Ortsname. Schnellreise zu 18 Orten (Rödental, Neustadt, Bad Rodach, Seßlach, Sonnefeld …) und Sehenswürdigkeiten (Schloss Rosenau, Callenberg, Hohenstein, Tambach, Muppberg …). Die Karte (`M`) zoomt von der Altstadt bis zum ganzen Landkreis mit Ortsnamen. Verkehr und Polizei fahren überall; am Rand (Landkreis + 600 m) ist Schluss |
| Fußgänger (seit v1.1.0) | Bis zu 150 Passanten im Umkreis von 170 m, gut die Hälfte gezielt in der Fußgängerzone (Markt, Spitalgasse, Steinweg, Ketschengasse, Herrngasse …). Sie laufen über Fußwege, Plätze und Gehsteige (rechts der Laufrichtung), bleiben stehen, gehen zu zweit, darunter Kinder. Sie springen vor schnellen Autos zur Seite, fliehen bei Explosionen und vor der Hupe (`H`). Anfahren: Person fällt um, Zeugen rufen die Polizei (bei Polizei in Sichtweite sicher, sonst 40 %). Dazu ≈ 130 feste Figuren: Café-Gäste, Leute auf Bänken, Händler, Kunden am Bratwurststand |
| Stadtdetails (seit v1.1.0) | ≈ 1.600 Straßenlaternen (bis 1,3 km um den Markt, nachts mit Lichtkegel am Boden), ≈ 120 Altstadtlaternen in der Fußgängerzone, gestreifte Markisen (≈ 280) und Ladenschilder (≈ 220, nachts leuchtend) an den Fassaden der Fußgängerzone, Café-Terrassen mit Sonnenschirmen vor echten Cafés und Restaurants aus OSM (≈ 90 Tische), Bänke, Mülleimer, Blumenkübel, abgestellte Fahrräder, 17 Brunnen mit Wasserstrahl (OSM `fountain`). Am Markt: Prinz-Albert-Denkmal, sechs Marktstände, Coburger-Bratwurststand mit Grillrauch und Kundschaft, 30 Tauben, die vor Spieler, Autos und Explosionen auffliegen. Stimmengewirr, je mehr Leute in der Nähe sind. Laternen, Bänke, Tische, Stände und Brunnen sind Hindernisse für Autos |
| Wohnungen (seit v1.2.0) | Sieben kaufbare Wohnungen mit eigener Haustür an echten Fassaden (violette Säule, Schild mit Typ, Größe, Preis): Apartment Lossaustraße € 2.500 und Altbauwohnung Judengasse € 4.500 (klein), Stadtwohnung Mohrenstraße € 9.500, Loft am Steinweg € 12.000, Wohnung Ketschengasse € 14.000 (modern), Penthouse am Glockenberg € 38.000, Villa Leopoldstraße € 55.000 (Luxus). `F` an der Tür öffnet das Menü mit Grundriss, Ausstattung und Preis: **Besichtigen** (kostenlos), **Kaufen** (nur mit genug Geld), **Betreten**, **Garage**. Gekaufte Wohnungen leuchten gold |
| Innenräume | Drei Typen, beim Betreten Überblendung in einen eigenen Raum, beim Verlassen (`E` an der Wohnungstür) steht man wieder vor derselben Haustür. **Klein** (9 × 7 m, Altbau mit Dielen und Tapete: Bett, Kochnische, Tisch, Sofa, Fernseher, Bücherregal, Küchenradio). **Modern** (13 × 10 m, Fensterfront, Kücheninsel mit Hockern, Essplatz, Sofalandschaft, Großbild-TV, Hi-Fi, Schlafbereich hinter Glaswand). **Luxus** (19 × 14 m, Marmor, Panoramafenster, Whirlpool mit Wellen und Blasen, Bar mit beleuchtetem Flaschenregal, Flügel, Kamin mit Flammen, Kino-TV, Kronleuchter, Schlafpodest). Blick aus dem Fenster auf Altstadtdächer und Veste, nachts mit Lichtern |
| Interaktionen drinnen | `E`: Schlafen (Leben voll, Tag/Nacht wechselt, Spiel gespeichert), Fernseher (Coburg TV mit Laufband, Fußball, Stadtansicht), Licht an/aus, Radio/Musik (kleine Akkordschleife), Snack/Espresso/Drink (+30 Leben), Whirlpool (Leben voll), Klavier spielen, Kamin. `F`: Kaufen bzw. Infos. Bei Besichtigung gehen Schlafen und Essen erst nach dem Kauf. Mit Fahndung kommt man nicht hinein |
| Autohaus (türkis, seit v1.2.0) | Zwei Autohäuser (am Bahnhof, Coburg Süd). `F` zu Fuß oder langsam im Auto: Neuwagen Kleinwagen € 1.100, Pkw € 1.800, Taxi € 2.400, Kombi € 2.900, Kleinbus € 3.400, Pick-up € 4.200, Geländewagen € 5.600, Cabrio € 6.900, Sportwagen € 9.500 (gleiche Modelle und Fahrphysik wie im Verkehr), Farbe wählbar, Werte als Balken. Das neue Auto steht vor dem Autohaus |
| Garage (`G`) | Eigene Autos (bis 8): Zustand, Farbe und Ort werden gespeichert. **Rausfahren/Herholen** stellt das Auto an den nächsten Straßenrand (immer nur eins draußen, das andere fährt zurück), **Einparken**, zerstörte Autos **reparieren** (20 % des Kaufpreises). Lackiererei ändert die gespeicherte Farbe, Verkauf beim Händler entfernt das Auto aus der Garage. Eigenes Auto: gelber Punkt auf Minikarte und Stadtplan, Einsteigen ohne Fahndung |
| Online (seit v3.0.0) | Bis 16 Spieler je Lobby in derselben Welt. Man sieht die anderen als Figuren mit Namensschild (Farbe, Sterne), ihre Autos mit Lenkung, Neigung, Schaden, Feuer, Blaulicht und Hupe, auf Minikarte und Stadtplan als farbige Punkte (Stadtplan: „Spieler: Name“ = Schnellreise hin). Wer in ein Auto steigt, macht es für alle sichtbar; nach dem Aussteigen bleibt es stehen und andere können es nehmen (Garagenautos sind abgeschlossen, dort nur mitfahren). Bis zu 3 Mitfahrer. Autos anderer sind Hindernisse, fahren einen um und explodieren für alle. Uhrzeit und Wetter gelten für die Lobby. Geld, Wohnungen, Garage, Bestzeiten bleiben im eigenen Spielstand; Verkehr, Fußgänger, Polizei und Rennen rechnet jedes Spiel für sich |
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
| Umland: Kacheln | 869 befahrbar + 188 Randkacheln (nur Gelände und Luftbild), je 20 × 20 Geländezellen ≈ 988 × 997 m | `tools/region-tiles.js` |
| Umland: Gebäude | 78.786 | OSM `building`, Höhe aus `height`/`building:levels` oder geschätzt, Sattel-/Walm-/Flachdach |
| Umland: Straßennetz | 11.660 Knoten / 13.613 Kanten, 1.899 km (Autobahn bis Wohnstraße, Tempo aus `maxspeed`) | OSM `highway`; ersetzt im Spiel das Netz der Innenstadt |
| Umland: Gelände | 801 × 761 Punkte im Raster der Innenstadt (≈ 49,5 m), 246–815 m ü. NN; im Spiel ×4 verfeinert | Terrarium-Höhenkacheln (Mapzen/AWS Open Data, in Europa EU-DEM), Zoom 12; im Kern genau die Innenstadt-Werte, 900 m Übergang |
| Umland: scharfe Luftbilder (seit v2.1.0) | 1024 × 1024 px (≈ 1 m pro Pixel) für die 396 Ortskacheln; das Spiel nimmt sie für Kacheln unter 450 m Abstand. Bisher 29 (Thüringer Grenzgebiet), die 367 bayerischen fehlen noch (siehe 7) | `tools/fetch-region-ortho-hd.js` → `data/region/ortho/hd…jpg`, `data/region/ortho-hd.js` |
| Umland: Läden und Lokale | 800 im befahrbaren Landkreis (2.077 im Ausschnitt) | OSM `shop`/`amenity` mit Namen, `tools/fetch-region-shops.js` |
| Umland: Luftbilder | 1.055 Kacheln à 512 × 512 px (≈ 1,9 m pro Pixel), 60 MB | Bayern: DOP 40 (CC BY 4.0); Thüringer Gebiet: GDI-Th `th_dop` (CC BY 4.0, „© GDI-Th“); Mischkacheln setzt der Browser zusammen |
| Schnellreiseziele | 12 in der Stadt + 18 Orte und Sehenswürdigkeiten im Landkreis | Marktplatz, Rathaus, St. Moriz, Schloss Ehrenburg, Landestheater, Hofgarten, Veste, Albertsplatz, Kongresshaus Rosengarten, Bahnhof, Bismarckturm, Hexenturm |

Kartendaten © OpenStreetMap-Mitwirkende (ODbL). Luftbilder und 3D-Gebäudemodelle LoD2: Bayerische
Vermessungsverwaltung – www.geodaten.bayern.de (CC BY 4.0). Luftbilder Thüringen: © GDI-Th (CC BY 4.0). Höhen im
Umland: Terrarium (Mapzen, AWS Open Data). Die Quellenangaben werden im Spiel unten rechts angezeigt
und müssen dort bleiben.

## 5. Architektur

| Datei | Aufgabe |
|---|---|
| `index.html`, `css/style.css` | Lade- und Startbildschirm, HUD, Stadtplan, Hilfe |
| `js/util.js` | Zufall, Raster für Nachbarschaftssuche, Polygon-Hilfen; Figurenteile seit v2.4.0 (`roundBox`: Quader mit runden Kanten und Verjüngung, `mergeParts`, `figParts`: Bein mit Schuh, Arm mit Hand, Rumpf, Kopf mit Hals, Nase, Augen und Mund, Haar) |
| `js/post.js` | Nachbearbeitung (seit v2.4.0, ohne Zusatzbibliothek): Szene in HDR-Bild (HalfFloat) mit MSAA und Tiefentextur, SSAO in halber Auflösung mit tiefenbewusstem Weichzeichner, Luftperspektive (Höhennebel nach Tiefe, Sonnenstreuung), Bloom (Dual-Kawase-Kette bis 1/32), Belichtung, ACES, Farbkorrektur (entsättigt, warme Lichter, kühle Schatten, S-Kurve), Vignette, Körnung. Qualitätsstufen `POST_QUALITY` (Ultra/Hoch/Mittel/Niedrig: MSAA, Pixelverhältnis, SSAO-Proben, Schattenkarte; Niedrig ohne Nachbearbeitung), dynamische Auflösung (`adapt`: bei > 22 ms pro Bild 10 % kleiner, bei Luft langsam wieder größer), `debugAO` zeigt nur die Verdeckung |
| `js/atmosphere.js` | Himmelskuppel (Sonne, Wolken, Sterne, Dunst), Uhr mit Sonnenstand (`clock`; Aufgang 6, Untergang 20 Uhr; 1 Spielstunde = 1 Minute; Zeitraffer über `setNight`), Abendrot (`SKY_DUSK`, `golden`), Wetter, Regen, Nässe, Umgebungsbild (PMREM); liefert Nebel, Sonne und Belichtung an `post.params` |
| `js/water.js` | Wasser (seit v2.1.0): `WaterSet` aus Wasserflächen (`water`, `river`) und Mittellinien mit Breite; `carveGrid` gräbt das Bett ins Höhengitter (Straßen ausgenommen), `buildSurface` die Wasseroberfläche (Gelände ohne Bett minus 0,35 m), `edges` Uferkanten der Flächen, `riverPieces` + `pushFromRivers` Kollision mit Flussläufen; gemeinsames Material mit wandernden Wellen (`waterMaterial`, `waterTick`) |
| `js/landscape.js` | Landschaft im Umland (seit v2.5.0): Bodenbedeckungskarte je Kachel aus den OSM-Flächen (`paintCover`: r Acker, g Wiese, b Wald, Feldraine an Feldgrenzen, weichgezeichnet; zweite Karte mit Reihenrichtung je Feld), Geländematerial (`terrainMaterial`: Gras-, Ackerboden- und Waldbodentextur aus der Leinwand, Farbe aus dem unscharfen Luftbild, Ackerart nach Fotofarbe mit Saatreihen, Furchen, Stoppeln, Fahrgassen; Relief über die Normale), 3D-Bewuchs um die Kamera (`update`/`makeCell`: Gras, Getreide, Blumen, Farn als Instanzen in 8-m-Zellen bis 88 m, sinkt am Rand ein), Kronendach-Hülle über fernen Wäldern (`buildCanopy`), Feld- und Waldwege (`splitRural`, `buildTracks`, `trackMaterial`: Fahrspuren, Grasnarbe, Schotter, Asphalt), Dörfer (`buildVillage`: Gärten mit Staketen- und Lattenzaun, Tor und Einfahrt zur Straße, Hecken, Obstbäume, Rundballen an Scheunen) |
| `js/region.js` | Umland (seit v2.0.0): Kacheln laden und abbauen (`update`, `ensure`), feines Gelände je Kachel (`makeHeights`, Catmull-Rom wie in der Innenstadt), Luftbild je Kachel (Thüringer Mischkacheln im Canvas zusammengesetzt), Straßen aus dem Netz, OSM-Häuser, Bäume nur in der Nähe; Abfragen `heightAt`, `insideBuilding`, `nearestRoad`, `collide`, `clamp` (Landkreisrand), `anchor` (Säulen und Schilder auf die echte Höhe setzen), Übersichtskarte `paintMap`, Minikarte `drawNear` |
| `js/world.js` | Baut die Welt: Höhenmodell (Catmull-Rom auf 12,5 m verfeinert), Bodentextur (Leinwand, 1 px/m), Straßenbänder, Gebäude (LoD2-Flächen bzw. eigene Extrusion aus OSM, in 250-m-Kacheln für Sichtbarkeitsprüfung), Bäume (instanziert), Stadtplan. Dazu Kollision (`collideCircle`), `heightAt`, `insideBuilding`, `nearestRoad` |
| `js/vehicle.js` | Automodelle (Pkw, Sportwagen mit Spoiler, Taxi mit Dachschild, Streifenwagen mit Blaulicht), Fahrwerte je Typ, Arcade-Fahrphysik (Längs- und Seitenhaftung, Handbremse, Steigung, Teilschritte gegen Durchtunneln), Schaden, Brand, Wrack, Auto-gegen-Auto-Kollision |
| `js/traffic.js` | KI-Verkehr auf dem Straßennetz: fährt rechts, beachtet Einbahnstraßen, bremst vor Kurven, Hindernissen und dem Spieler |
| `js/player.js` | Spielfigur mit Lauf-Animation, Springen, Kollision mit Häusern, Bäumen und Autos; mit anderem Aussehen auch Polizisten |
| `js/ui.js` | Minikarte (dreht mit, Markierungen für Polizei, Checkpoints, Rennstarts, Läden, ferne am Rand), großer Stadtplan (Zoom, Verschieben, Klick = Reise), Ortsschilder, Geld, Sterne, Lebens- und Schadensbalken, große Meldungen |
| `js/game.js` | Szene, Licht und Schatten (folgt dem Spieler, Größe je Qualitätsstufe), Tag/Nacht folgt der Uhr (`syncNight`), Eingabe, Kamera (weicht Hauswänden aus), Ton (WebAudio: Motor, Hupe, Aufprall, Martinshorn, Explosion, Signaltöne), Spielstand (Geld, Leben), Spawn am Bahnhof, Straftaten, Verhaftet/Erledigt, Feuer und Explosionen, Lackiererei und Händler, Hauptschleife |
| `js/driver.js` | `RoadNav`: Straßennetz als Graph (beide Richtungen, ohne Durchfahrten durch Gebäude), Dijkstra nach Fahrzeit, Wegsuche, Zufallspunkte. `AutoDriver`: KI-Fahrer mit echter Fahrphysik (Vorausschau-Lenkung, Kurvenbremsung, Ausweichen, Freifahren) |
| `js/police.js` | Fahndung, Streifenwagen (Verfolgen, Rammen, Anhalten), Polizisten zu Fuß, Festnahme, Straßensperren, Entkommen |
| `js/race.js` | Rennstrecken (aus Wegpunkten über das Netz berechnet), Start-Säulen, Checkpoints, KI-Gegner mit Gummiband, Zeitnahme, Preisgeld, Bestzeiten |
| `js/pedestrians.js` | Fußgänger: Wegenetz aus Fußwegen, Plätzen und Gehsteigen, Laufen, Stehenbleiben, Paare, Flucht, Umfallen, feste Café-Gäste; alle Figuren als 5 InstancedMeshes |
| `js/venues.js` | Läden und Lokale zum Hineingehen (seit v1.4.0): `VENUES` (Ort, Typ), `VENUE_MENUS` (Speisekarten, Sortimente), sieben Innenraum-Bauer auf Basis der Raum-Klasse aus `interiors.js`, erweitert `Property` um `placeVenue`, `venueRoom`, `openVenueMenu` |
| `js/townlife.js` | Stadtleben (seit v1.4.1): Pfandsammler am Markt (`updateCollector`), Schulhöfe mit Kindern, Ball, Tischtennis und Aufsicht (`SCHOOLS`, `yardCells`, `updateYard`), nachts leer |
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
| `tools/region-config.js`, `tools/region-tiles.js` | Umland: Landkreis-Relationen, Ausschnitt, Kachelgröße, Puffer; gemeinsame Kachel-Einteilung |
| `tools/fetch-region-osm.js` | OSM fürs Umland in 30 Teilstücken (zu große werden geviertelt; `REVERSE=1` lädt von hinten, für einen zweiten Lauf parallel) |
| `tools/fetch-region-elevation.js` | Terrarium-PNG-Kacheln (eigener PNG-Leser ohne Bibliothek) → `data/raw/region/elevation.json` |
| `tools/fetch-region-ortho.js` | Luftbilder je Kachel nach `data/region/ortho/by…/th….jpg` und `data/region/ortho.js` |
| `tools/convert-region.js` | → `data/region.js` (11 MB): Gelände (Int16, base64), Kachelzustände, Straßennetz, je Kachel Häuser, zugeschnittene Flächen, Bäume, Gewässer, Gleise; Orte |
| `tools/utm.js` | Umrechnung UTM 32N (EPSG:25832) ↔ Länge/Breite (Krüger-Reihen, millimetergenau) |
| `tools/fetch-osm.js` | Lädt die OSM-Daten über die Overpass-API (mit Ausweichservern) |
| `tools/fetch-elevation.js` | Lädt das Höhenraster (≈ 38 Anfragen, 1 pro Sekunde) |
| `tools/fetch-ortho.js` | Lädt die Luftbildkacheln nach `data/ortho/` (Kachelgrenzen liegen auf Linien des Geländegitters) und schreibt `data/ortho/tiles.js` |
| `data/ortho/` | Luftbildkacheln `r{zeile}_c{spalte}.jpg` und `tiles.js` (Lage der Kacheln) |
| `tools/fetch-lod2.js` | Lädt die LoD2-Kacheln für den Ausschnitt von `download1/2.bayernwolke.de` und prüft sie mit den SHA-256-Summen aus der Metalink-Datei `geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink/09.meta4` |
| `tools/convert-lod2.js` | CityGML → `data/lod2.js`: Wand-, Dach- und Bodenflächen, UTM → Länge/Breite → Spielmeter (`projX`/`projZ` wie in `convert.js`), Höhen relativ zu `terrain.base`, Wände nach außen und Dächer nach oben gedreht, Namen und Typen aus OSM |
| `tools/convert.js` | Rohdaten → `data/coburg.js` (Projektion in Meter, Gebäudehöhen, Straßenbreiten, Multipolygone, Straßennetz, Gelände) |
| `server.js`, `start.bat`, `start-lan.bat` | Webserver ohne Abhängigkeiten auf Port 8175 (`--lan` Heimnetz, `--public` Hosting), hängt den Mehrspieler-Server an; `/api/rooms` (Lobby-Liste), `/api/health` |
| `mp/protocol.js` | Gemeinsame Werte für Server und Spiel (Node `require` und Browser `<script>`): Protokollversion, Takt (20 Hz), Interpolation 110 ms, Sichtbereich 1,6 km, Tempo-Grenzen je Autotyp, Sitze, Farben |
| `mp/ws.js` | WebSocket nach RFC 6455 ohne Fremdpaket: Handshake, maskierte Rahmen, Fragmente, Ping/Pong, Größenlimit 8 KB, `setNoDelay` |
| `mp/core.js` | **Kern** (seit v3.1.0 aus `game-server.js` herausgelöst, läuft in Node und im Browser): siehe nächste Zeile; `createCore(MP, { rooms, single })`, Transport von außen (`accept`, `message`, `closed`, `tick`) |
| `mp/game-server.js` | Node-Anbindung des Kerns (WebSocket, Verbindungen je IP, `/api/rooms`, `/api/health`). Kern: Lobbys (zwei feste: „Coburg Altstadt“ `COBURG`, „Landkreis-Tour“ `LANDKR`; eigene öffentlich/privat mit 5-stelligem Code, leer nach 2 min gelöscht), Spieler, Netz-Autos (`vid`, Besitzer, Fahrer, Mitfahrer, abgeschlossen), Uhr und Wetter je Lobby, Momentaufnahmen 20 Hz nur im Umkreis und nur Geändertes (jede Sekunde alles), grobe Orte aller für die Karte. **Schutz:** Bewegungsprüfung mit Weg-Guthaben (Lauf 12 m/s, Auto Höchsttempo × 1,3 + 6), Teleport nur über `tp` alle 2 s, Unplausibles wird verworfen und zurückgesetzt (`fix`), ab 8 Verstößen Rauswurf; Server entscheidet Einsteigen (Abstand, freier Sitz, Besitz), Explosion nur durch den Besitzer; Nachrichten-Rate (60/s), Größe, Namen/Chat bereinigt, Verbindungen je IP, Gegendruck bei langsamen Spielern |
| `js/net.js` | `NetClient`: Verbindung, Wiederverbinden (5 Versuche), Uhrabgleich per Ping, Zustand senden (20 Hz, in Ruhe 2 Hz), andere Spieler (`Player`-Figuren, Namensschild-Sprite) und Autos (`Vehicle` mit `remote`) zwischen zwei Aufnahmen gleitend darstellen (≤ 250 ms vorausrechnen), Einsteigen/Mitfahren/Besitzwechsel, Chat, Spielerliste; `NetLobby`: Lobby-Fenster |
| `js/net-p2p.js` | Peer-to-Peer (seit v3.1.0): `P2PSocket` verhält sich wie ein WebSocket; Lobby = feste Peer-Kennung `gtcoburg-v1-CODE`, erst verbinden, sonst Gastgeber werden (gleichzeitige Versuche klärt die Kennungs-Vergabe), Lobby-Liste durch Abfrage der festen Lobbys, Gegendruck über `bufferedAmount`, Kennung beim Schließen des Tabs freigeben |
| `js/mp-host-worker.js` | Gastgeber: Kern in einem Worker-Thread (taktet auch bei verdecktem Tab mit 20 Hz) |
| `js/mp-config.js` | Adresse eines entfernten Mehrspieler-Servers (leer = gleicher Server) |
| `tools/mp-test.js`, `tools/mp-bot.js`, `tools/mp-load.js` | Protokolltest (27 Prüfungen), Test-Mitspieler (läuft/fährt im Kreis, `--drive`), Lasttest mit N Bots |

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
# Umland (Landkreis), nach convert.js:
node tools/fetch-region-osm.js        # Overpass, oft überlastet: dauert 1–2 Stunden
node tools/fetch-region-elevation.js
node tools/fetch-region-ortho.js      # ≈ 15 Minuten, 60 MB
node tools/fetch-region-ortho-hd.js   # scharfe Ortskacheln, nach convert-region.js
node tools/fetch-region-shops.js      # Läden und Lokale, vor convert-region.js
node tools/convert-region.js
node tools/fetch-region-rural.js      # Feldwege, Hecken, Baumreihen (Overpass, oft überlastet; REVERSE=1 parallel)
node tools/convert-region-rural.js    # → data/region-rural.js (geht auch mit einem Teil der Stücke)
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
`game.atmo.clock = 19.5` (Uhrzeit), `game.atmo.setWeather('rain', true)`, `game.post.cycle()`, `game.post.debugAO = true` und
`game.simulate(sekunden, dt, zeichnen)`, das die Spielschleife ohne Bildschirm rechnet (zum Testen, wenn das
Browserfenster verdeckt ist; mit `zeichnen = false` sehr schnell). Tasten lassen sich über `game.keys.KeyW = true` usw. setzen.

**Umland (`js/region.js`):** Das Geländegitter der Innenstadt wird nach außen fortgesetzt; Kachel (i, j) sind die Zellen
20i…20i+20. Gelände, Straßen und Häuser einer Kachel werden gebaut, wenn der Spieler näher als 2 km ist (die Kachel
unter ihm sofort, sonst höchstens eine pro Bild), Bäume unter 1,1 km; ab 2,8 km wird abgebaut. Im Kern rechnet weiter
`world.js` (Innenstadt-Straßen werden am Kernrand abgeschnitten, außen zeichnet das Umland), sonst fragt `World` die
geladenen Kacheln ab. Das Straßennetz des ganzen Landkreises ersetzt das der Innenstadt; Verkehr, Polizei und
`randomPoint` suchen deshalb über Raster in Spielernähe, und Dijkstra hat eine Kostengrenze (`costsFrom(loc, maxCost)`).
Gemessen: in Neustadt 56 Kacheln geladen, ≈ 0,9 Mio. Dreiecke, ≈ 10 ms pro Bild (Spiellogik und Zeichnen).
Seit v2.1.0 hat jede Kachel zwei Höhenraster: `hg0` (Gelände) und `hg` (mit ausgehobenen Gewässern; dafür werden die
Gewässer der acht Nachbarkacheln mitgelesen, damit die Ränder passen). Häuser stehen auf `heightAt0`, Fahrzeuge und
Figuren auf `groundAt` (Brückenfahrbahn, wenn sie schon oben sind). Ortsleben (`buildLife`/`dropLife`) nutzt
`CityProps.signsFor` (Ladenschilder, aus `shopSigns` herausgelöst), `Property.placeVenue`/`removeVenue` und
`Pedestrians.setExtra` (Gehwege der belebten Ortskacheln zusätzlich zum Netz der Innenstadt).

## 6. Stand

- ✅ v3.1.1 (24.10.2026): Spielname wieder **„GTA Coburg“** (Fenstertitel, Logo auf Lade-, Start- und Lobby-Bildschirm,
  Willkommensmeldung, README, Serverausgabe, `package.json`).

- ✅ v3.1.0 (24.10.2026): **Online auch auf Vercel.** Auf `gta-coburg.vercel.app` kam „Keine Verbindung zum Server“,
  weil Vercel keine dauerhaften WebSocket-Verbindungen kann. Jetzt automatisch Peer-to-Peer (siehe 2), lokal bzw.
  auf Render weiter der Node-Server. Kern nach `mp/core.js` verschoben; Verbindungs-Wächter (6 s still → neu
  verbinden); Namensschild „(du bist Gastgeber)“.
  - Getestet: Node-Server weiter 27/27; im Browser mit `?server=p2p` zwei Spieler: Lobby-Liste mit Belegung,
    Gastgeber in 0,7 s, Beitritt per WebRTC in 1,2 s, Ping ≈ 10 ms, Fahren und Mitfahren, Teleport-Schummeln vom
    Browser-Gastgeber zurückgesetzt, Gastgeber schließt den Tab → anderer Spieler übernimmt in 0,9 s, Neuankömmling
    tritt beim neuen Gastgeber bei; ohne Parameter lokal weiter der Node-Server
- ⚠️ Grenzen v3.1.0: Im Peer-to-Peer-Modus prüft der Browser des Gastgebers; ihm selbst muss man vertrauen. Eigene
  (nicht feste) Lobbys sind nur per Code/Einladungslink auffindbar. Beim Gastgeber-Wechsel verschwinden abgestellte
  Netz-Autos (gefahrene werden neu angemeldet). Abhängig vom kostenlosen PeerJS-Vermittlungsdienst.

- ✅ v3.0.0 (24.10.2026): **Online-Mehrspieler.** Eigener Server ohne Abhängigkeiten (WebSocket in `server.js`),
  Lobby auf dem Startbildschirm, bis 16 Spieler je Lobby (Details: 3a „Online“, 5 `mp/…`, `js/net.js`).
  - Eigene Figur und eigenes Auto rechnet weiter das eigene Spiel (keine Eingabeverzögerung), der Server prüft und
    verteilt; andere werden 110 ms verzögert gleitend dargestellt
  - Eingebaut in `game.js`: `net`-Schnittstelle, Mitfahrer-Modus (`ride`: Kamera, Tacho, Aussteigen mit E auf der
    Beifahrerseite), fremde Autos in `allCars`/`enterable`/Verkehrs- und Fußgänger-Hindernissen, `collideCars`
    schiebt fremde Autos nicht, Explosion fremder Autos (Druckwelle auf eigene Figur/Auto), Teleport-Meldung bei
    Schnellreise/Neustart/Zurücksetzen, `N`/`K` gehen an die Lobby, Schlafen ohne Zeitraffer, Eingaben in Textfeldern
    sind keine Spieltasten mehr; Touch: 💬 und 👥
  - Getestet: `node tools/mp-test.js` 27/27 (Beitritt, Code, Doppelname, Sichtbarkeit, Autos, Mitfahren, Besitzwechsel,
    Garagenauto abgeschlossen, Explosion, Chat ohne HTML, Wetter, Speedhack → 7 Korrekturen + Rauswurf, Flutbremse,
    Verlassen); im Browser zwei echte Spieler + zwei Bots: Lobby, Einladungslink, Schnell beitreten, gegenseitig
    sehen, Mitfahren in beide Richtungen, Auto des anderen übernehmen, Explosion, Chat, Wetter-Sync, Spielerliste,
    Teleport-Schummeln zurückgesetzt, Server-Neustart → automatisch wieder verbunden; Lasttest 15 Bots: ≈ 21 KB/s je
    Spieler, Momentaufnahmen alle 50 ms (95 % ≤ 66 ms), Darstellung der Mitspieler < 0,01 ms pro Bild, keine Fehler
  - Beim Testen behoben: doppelte Wiederverbindungs-Kette (doppelter Beitritt), Server lauschte unter der Vorschau auf
    allen Adressen (jetzt nur mit `--lan`/`--public`), zu kleine Namensschilder, Wracks fremder Autos ohne Kollision
- ⚠️ Grenzen v3.0.0: Verkehr, Fußgänger, Polizei und Rennen sind je Spiel eigen (andere sehen deine Sterne, aber
  nicht deine Streifenwagen; KI-Autos stehen bei jedem anders). Bewegung ist „Client rechnet, Server prüft“: Tempo
  und Teleports sind geschützt, Geld/Leben nicht (betrifft nur den eigenen Spielstand, es gibt keinen Handel und
  keinen PvP-Schaden außer Anfahren). Wer angefahren wird, entscheidet sein eigenes Spiel. Kein öffentlicher Server
  vorkonfiguriert: Der Render-Dienst muss einmal mit dem eigenen Konto angelegt werden.

- ✅ v2.6.1 (23.10.2026): **Brücken über Wasser, nichts mehr auf der Fahrbahn** (vor dem Multiplayer-Einbau).
  - Ursache Wasser auf der Straße (Viktoriastraße/Alexandrinenbrücke der Lossaustraße): Fahrbahnen lagen auf dem
    ausgehobenen Flussbett-Gelände (12,5-m-Raster) und sanken unter den Wasserspiegel. Jetzt liegen Fahrbahnen auf dem
    Gelände ohne Bett (`World.roadHeightAt`, im Umland `heightAt0`), mit Böschung (`bankSkirt`) wo das Ufer tiefer liegt
  - Brücken (OSM `bridge`) über Wasser werden echte niedrige Brücken (`initLowBridges` in world.js, `B.low` in
    region.js): leicht gewölbte Platte zwischen den Enden, darunter wird das Bett ausgehoben, Sandsteinbrüstung bzw.
    Stahlgeländer bei Fußgängerbrücken, Widerlager (`lowBridgeParts` in water.js); Autos, Figuren und Fußgänger laufen
    auf der Platte (`groundAt`), Brüstung ist Hindernis. Innenstadt 23, Umland 240 Brücken
  - Wasserspiegel von Flüssen und Wasserflächen höchstens auf Uferhöhe (kein schwebendes Wasserband mehr)
  - Ursache Objekte auf der Fahrbahn (B 289 u. a.): Mittelleitplanke auf allen Straßen mit Gegenverkehr ab 10 m
    (70 Abschnitte) → entfällt, doppelte durchgezogene Linie; unsichtbare Leitplanken-Kollision in Orten → nur noch wo
    sichtbar; Bäume prüften nur Straßen der eigenen Kachel → `Region.nearRoad` sucht im ganzen Netz; OSM-Einzelbäume,
    Laternen, Bänke, Kübel und Café-Tische (außer in Spielstraßen) werden von Fahrbahnen weggerückt bzw. weggelassen
  - Getestet: Alexandrinenbrücke, Mohrenstraße, Fußgängersteg, Rosenauer Straße (Itz), B 303, B 289; Fahrt mit
    90 km/h über die Brücke; Prüfskript über 10 Gebiete: 0 Leitplanken/Bäume auf Fahrbahnen, Innenstadt 0 Hindernisse;
    keine Fehler. Kachelaufbau ≈ 26 statt 24 ms (Wasserspiegel)
- ⚠️ Grenzen v2.6.1: Wenig Durchfahrtshöhe unter niedrigen Brücken (das EU-DEM legt Flüsse fast auf Straßenhöhe);
  Brücken ohne Pfeiler; Einfahrten zu Wegen außerhalb des Straßennetzes (Tankstellen) sind nicht in Leitplanken offen.

- ✅ v2.6.0 (23.10.2026): **Fenster passen in die Fassade, Landhäuser im Stil oberfränkischer Dörfer.**
  - Ursache der abgeschnittenen Fenster: Das Fensterraster lief starr ab dem tiefsten Geländepunkt des Hauses in
    12,8 × 12,4-m-Kacheln über jede Wand, ohne Dach- und Giebelkanten, Hang, Wandbreite oder Hausecken zu kennen.
    Jetzt trägt jede Wand ein **Wandprofil** als Vertex-Attribut (`aProfA/B/C`, Int16, gebaut in `Bucket.tri` mit
    `rectProfile` bzw. `polyProfile`): linke und rechte Kante, Oberkante als Linienzug links – First – rechts (aus dem
    LoD2-Umriss in 25 Stichproben, so abgesenkt, dass er nie über der echten Kante liegt), Unterkante, Boden an der Wand
    (höchstes Gelände entlang der Wand), Stil und Türfeld
  - Stadt (Stil 0): Achsen werden auf ganze Achsen über die Wandbreite verteilt (symmetrisch), Geschosse bis zur Traufe
    eingepasst (2,6–4,2 m), Geschossreihen beginnen am Boden der jeweiligen Wand. Ein Fenster erscheint nur, wenn
    Gewände und Sohlbank ganz in der Wand liegen: unter Trauf-/Giebelkante (30 cm Abstand), über dem Boden und der
    Unterkante, nicht über die Hausecke. Giebel bekommen so von selbst weniger Fenster nach oben hin; schmale
    Wandstücke bleiben ohne Fenster. Gesims nur unterhalb der Traufe, Schaufenster nur unter der Traufe
  - Landhaus (Stil 1/2, `RURAL_HOUSES` im Umland bis 300 m² und 14 m): Traufhöhe ein-, eineinhalb- oder zweigeschossig,
    steiles Satteldach (40–52°) mit Dachüberstand an Traufe und Ortgang, Untersicht und Stirnbrettern, Schornstein
    (verputzt oder Ziegel) auf dem First; Giebelwände mit Dreiecksprofil und Giebelfenstern; Walmdach bei anderen
    Grundrissen. Fenster in Feldern zu ≈ 3,1 m, leicht versetzt, einzelne Felder leer, Größe je Haus verschieden,
    Erdgeschoss größer als Obergeschoss, Giebelfenster kleiner; Faschen um die Fenster, Sohlbank aus Sandstein,
    Fensterkreuz, Glas mit Tiefe; Fensterläden (grün, braun, graublau) an knapp der Hälfte der Häuser;
    **Haustür** an der Wand zur Straße mit Füllungen, Oberlicht, Vordach und Stufe; Sandsteinsockel (gelb oder rot)
    mit Fugen, Eckquader an manchen Häusern; Fachwerk nur noch an Landhäusern, im Obergeschoss und Giebel, mit
    Ständern neben den Fenstern und Streben in fensterlosen Feldern; nachts einzelne erleuchtete Fenster
  - Getestet im Browser: Markt (Stadthaus-Giebel: Fenster folgen der Dreiecksform), Altstadt-Dächer von oben,
    Spitalgasse, Albertinum am Hang (10 m Höhenunterschied), Beiersdorf, Wohlbach, Neustadt; 60 Bilder/s, keine Fehler
- ⚠️ Grenzen v2.6.0: LoD2-Wände mit Stufen in der Oberkante bekommen ein vorsichtiges Profil (unter der niedrigsten
  Stelle), dort fehlen dann manche Fenster. Gauben und Dachfenster gibt es nicht. Landhaus-Erkennung nach OSM-Typ und
  Größe, nicht nach echtem Baustil. Die Innenstadt-Fassaden bleiben beim gemeinsamen Fenstermuster.

- ✅ v2.5.0 (23.10.2026): **Ländliche Gebiete wie echte Landschaft.** Neues Modul `js/landscape.js`.
  - **Boden**: Statt flachem Luftbild mischt der Geländeshader echte Materialien nach den OSM-Flächen (Acker, Wiese,
    Wald) mit unregelmäßigen Rändern: Gras mit Halmen und trockenen Flecken, Ackerboden mit Erdkrumen und Steinchen,
    Waldboden mit Laub, Nadeln und Zweigen. Das Luftbild bleibt als unscharfe Farbquelle (echte Felderteppiche bleiben
    sichtbar) und bestimmt die Ackerart: grün = Saat in Reihen, braun = gepflügt mit Furchen, gelb = Stoppeln.
    Reihenrichtung je Feld entlang der längsten Feldkante, Fahrgassen alle 20 m, Feldraine an den Feldgrenzen.
    Texturen werden doppelt (gedreht, anderer Maßstab) gelesen, damit keine Kachelung zu sehen ist
  - **3D-Bewuchs** um den Spieler (bis 88 m, Instanzen in Zellen): Grasbüschel, Getreide in den Saatreihen,
    Wiesenblumen, Farn im Wald; wiegt sich im Wind, sinkt am Rand weich in den Boden; Farbe aus dem Luftbild
  - **Gelände**: Kleinrelief (sanfte Wellen bis ≈ ±1,8 m) im offenen Land, läuft an Straßen und zur Innenstadt aus
  - **Wälder**: dichter (1 Baum je 115 m²), Nadelbaum-Anteil je Waldstück 15–85 %, Baumgrößen von jung bis alt,
    Waldränder mit dichten Büschen und Jungbäumen, Unterholz. Ferne Wälder (ohne gebaute Bäume) als Kronendach-Hülle mit
    Kronenbuckeln, dadurch bewaldete Hügel bis an den Sichtrand
  - **Hecken und Feldgehölze aus dem Luftbild**: dunkelgrüne Flecken außerhalb von Wald, Häusern, Straßen und Wasser
    werden zu Büschen (Hecken) und Bäumen (größere Flecken), genau dort, wo sie wirklich stehen
  - **Feldwege, Hecken, Baumreihen aus OSM** (neu geladen mit `tools/fetch-region-rural.js`): Wege als Bänder mit zwei
    Fahrspuren und Grasnarbe (Erdweg), Schotter mit grasiger Mitte oder schmalem Asphalt; Hecken als dichte Buschreihen,
    Baumreihen alle ≈ 8 m. Bewuchs und Bäume halten die Wege frei. Stand: Teil der Gebiete geladen (siehe Grenzen)
  - **Dörfer**: Gärten um Wohnhäuser (Zaun zur Straße mit Tor, Kieseinfahrt zum Haus, an den anderen Seiten Hecke oder
    Lattenzaun, Zäune nur bis zur Hälfte zum Nachbarhaus), Obstbäume und Büsche im Garten, Rundballen an Scheunen;
    **Fachwerk** (Schwelle, Rähm, Riegel, Ständer, Streben; dunkelbraun oder ochsenblutrot, weiße Gefache) an etwa einem
    Drittel der Häuser im Umland (Erdgeschoss und erstes Obergeschoss)
  - Detailstufen: Laubbäume, Büsche, Nadelbäume und Stämme nah detailliert, ab ≈ 230 m grob (Stämme ohne Äste, Nadelbäume
    aus zwei Kegeln, Busch als ein Ballen); dazu weniger Dunst bei klarem Wetter
  - Getestet im Browser: Meeder (Acker mit Furchen bis zum Horizont, Hecken am Feldrand), Wiesenfeld, Feldweg im
    Süden, Waldrand bei Tiefenlauter, Lautertal von oben, Beiersdorf (Gärten, Zäune, Fachwerk), Fahrten nach Neustadt,
    Rödental, Seßlach, Bad Rodach; keine Fehler. Kachelaufbau ≈ 14 ms, Bäume ≈ 4 ms je Kachel. Bei ≈ 1930 × 1310 Pixeln
    60 Bilder/s im Lautertal, ≈ 4,3 Mio. Dreiecke und ≈ 700 Zeichenaufrufe pro Bild (vor den Detailstufen 21,8 Mio.)
- ⚠️ Grenzen v2.5.0: Feldwege, Hecken und Baumreihen aus OSM sind seit 23.10. vollständig geladen (60 Stücke). Hecken, Zäune und Bewuchs sind keine Hindernisse. Die Gärten sind geschätzt
  (keine Flurstücke), Fachwerk sitzt auch an manchen größeren Häusern. Die Kronendach-Hülle springt beim Bau der Bäume
  (≈ 1,1 km) auf echte Bäume um. Die Innenstadt (Festungsberg, Hofgarten) nutzt noch den alten Boden.

- ✅ v2.4.0 (23.10.2026): **Grafik realistischer, Stil GTA IV.** Baut auf dem Zwischenstand v2.2.0 vom 21.10. auf.
  - **Nachbearbeitung** (`js/post.js`): HDR-Bild mit 4× MSAA, Umgebungsverdeckung (SSAO: Kontaktschatten unter Bänken,
    an Hauskanten, unter Autos), Luftperspektive mit Höhennebel und warmer Streuung zur Sonne (ersetzt den linearen
    Nebel), Bloom (Sonne, Laternen, Scheinwerfer, beleuchtete Fenster), ACES-Tonwertkurve, Farbkorrektur wie GTA IV
    (leicht entsättigt, warme Lichter, kühle Schatten, S-Kurve), Vignette, Körnung gegen Farbstufen
  - **Qualitätsstufen** mit Taste `O` (Ultra, Hoch = Standard, Mittel, Niedrig ohne Nachbearbeitung; im Browser
    gespeichert, Schlüssel `gta-coburg-quality`) und **dynamische Auflösung**, die bei Ruckeln bis auf 60 % heruntergeht
  - **Tageszeit**: Uhr mit wanderndem Sonnenstand (1 Spielstunde = 1 Minute), Morgen- und Abendrot mit warmem, flachem
    Licht und langen Schatten, Dämmerung; Nacht mit Mondlicht und orangem Stadtschein am Horizont. `N` ist jetzt ein
    Zeitraffer bis 22 bzw. 9 Uhr, Lichter und Stadtleben folgen der Uhr. Uhrzeit und Wetter oben rechts im HUD
  - Ausgangsbasis vom 21.10.: Himmelskuppel mit Wolken, Wetter (`K`), Regen, nasse Straßen mit Pfützen, Umgebungsbild
    für Spiegelungen, Fassaden mit Gewänden und Gesimsen, Straßen mit Asphaltstruktur und Bordsteinen, gerundete Autos
  - **Fassaden**: Normal Map aus einem Höhenfeld (Gewände 2 cm vor, Fensterbank 4 cm, Putzstruktur), **Fenstertiefe**
    per Parallaxe (Glas 22 cm hinter der Wand, je nach Blickwinkel sieht man die Laibung), je Haus andere Achsbreite
    (2,9/3,2/3,6 m) und Geschosshöhe (2,9/3,1/3,45 m), nachts Widerschein der Laternen unten an den Wänden
  - **Dächer**: Ziegelreihen im Shader über dem Luftbild (Pfannen mit Wellen, Schatten unter jeder Reihe,
    Farbschwankung je Ziegel, Relief über die Normale), kräftigere Ziegelfarbe, Moosflecken; steile Flächen nehmen die
    unscharfe Mittelfarbe statt des verschmierten Fotos; Flachdächer mit Kieskörnung. Gilt in Stadt und Landkreis
  - **Bäume**: Kronen aus 26–46 Blattbüschel-Karten (Laubtextur aus der Leinwand, mit Zweigen) um einen dichten Kern,
    runde Schattierung, weiche Kanten (Alpha-to-Coverage), wiegen sich im Wind; Stamm mit Ästen; Nadelbäume mit
    Nadeltextur und zerzausten Zweigspitzen. **Detailstufen**: Blattkarten nur bis ≈ 230 m (Gruppen von 250 m),
    weiter weg eine grobe Laubhülle
  - **Figuren**: Spieler, Polizisten und alle Passanten aus abgerundeten, sich verjüngenden Teilen statt Quadern, mit
    Schuhen, Händen, Hals, Nase, Augen und Mund
  - **Nacht**: Laternen als Natriumdampflicht (orange, Lichthof durch Bloom), hellere Nacht (Mondlicht, Belichtung),
    Schaufenster gedämpft
  - **Wetter**: Nebel dichter, der Himmel verschwindet im Dunst; Regen feiner und dichter
  - Boden: Das Detailrauschen erkennt Wiese (Grashalme, trockene Stellen) und Pflaster/Asphalt (Körnung) an der Fotofarbe
  - Getestet im Browser: Bahnhof, Markt (Tag, 19:20 Abendrot, 22:30 Nacht, Regen, Nebel), Spitalgasse, Fassade aus
    der Nähe (Laibung sichtbar), Dächer von oben, Bäume, Spieler aus der Nähe, Villa (Innenraum), Zeitraffer `N`,
    alle vier Qualitätsstufen mit `O`, Rödental; keine Fehler in der Konsole. Bildrate: bei ≈ 1930 × 1310 Pixeln
    (Stufe Hoch mit MSAA, SSAO und Bloom) weiter 60 Bilder/s, auch in Rödental; dort ≈ 3,2 Mio. Dreiecke und ≈ 800
    Zeichenaufrufe pro Bild (ohne Baum-LOD waren es ≈ 7 Mio.)
- ⚠️ Grenzen v2.4.0: Der Boden im Landkreis bleibt unscharf, weil dort nur Luftbilder mit 1,9 m pro Pixel vorliegen
  (bayerischer Dienst gesperrt). Fassaden haben weiter ein gemeinsames Fenstermuster (variiert in Maß, Farbe, Rahmen,
  Gesimsen, Vorhängen), keine Balkone, Gauben oder Dachüberstände. Gesichter sind einfach (Augen, Nase, Mund aus
  Formen). Die Uhr steht in Innenräumen still. Gemessen nur auf diesem Rechner; auf schwachen Grafikkarten Stufe
  Mittel oder Niedrig wählen (die dynamische Auflösung hilft automatisch).
- ✅ v2.3.0 (22.10.2026): **Robustere Autos, Leitplanken, Brücken über Straßen.**
  - Autos halten viel mehr aus: Rempler bis ≈ 25 km/h kosten nichts, ein Frontalaufprall mit 100 km/h etwa ein
    Fünftel (vorher fast zwei Drittel). Explosionen beschädigen Autos in der Nähe weiterhin stark
  - Große Straßen im Umland (Autobahn, B 4, B 303, B 89, B 289 …): durchgezogene Randlinien; Leitplanken mit Pfosten
    an beiden Seiten (Bundesstraßen der Klasse `primary` nur außerhalb der Orte), an Kreuzungen und Einmündungen offen;
    zweibahnige Abschnitte haben damit eine Leitplanke im Mittelstreifen, breite Straßen mit Gegenverkehr eine
    Mittelleitplanke, schmalere eine doppelte durchgezogene Mittellinie, Richtungsfahrbahnen eine Spurtrennung
  - Leitplanken und Brückenkanten halten nur Autos auf und nur auf ihrer Höhe (`Region.collide` mit Höhe `y`): Wer
    unter einer Brücke durchfährt, prallt nicht an deren Geländer ab
  - Brücken über Straßen (78 im Landkreis) liegen jetzt 6,2 m über der Straße darunter. Die anschließenden Straßen
    steigen als Rampen mit höchstens 7 % an (Stützmauern, ab 1,1 m Höhe mit Brüstung); Widerlager an den Brückenenden.
    Markierungen liegen auch auf Brücken und Rampen. Der Verkehr bremst nicht mehr für Autos auf einer anderen Ebene
  - Nur im Umland: die Innenstadt (`world.js`) hat weiter ihre flachen Brücken und keine Leitplanken
- ✅ v2.2.1 (22.10.2026): **Sechs neue Automodelle, kein Blitzen mehr.**
  - Neue Modelle mit eigener Karosserie und eigenen Fahrwerten: Kleinwagen (€ 1.100), Kombi (€ 2.900), Kleinbus
    (€ 3.400), Pick-up mit Ladefläche (€ 4.200), Geländewagen mit Dachreling (€ 5.600), offenes Cabrio (€ 6.900).
    Alle im Autohaus kaufbar und in der Garage, außerdem fahren sie im Verkehr mit (und lassen sich klauen)
  - Die Seitenansichten im Autohaus und in der Garage werden jetzt aus dem Seitenprofil der 3D-Modelle gezeichnet
  - Zu schnelles Fahren an einer Streife vorbei löst keine Fahndung mehr aus
- ✅ v2.2.0 (21.10.2026): Zwischenstand der Grafik (Himmel, Wetter, Fassaden-, Straßen- und Autodetails); fertig in v2.4.0, siehe dort

- ✅ v2.1.0 (21.10.2026): **Wasser, Talbrücken, Leben in den Orten, schärfere Luftbilder.**
  - Echtes Wasser in Stadt und Landkreis: ausgehobenes Bett, Wasseroberfläche mit Wellen, Ufer als Hindernis
  - Hochbrücken (A 73 Itztal, B 4) mit gerader Fahrbahn, Brüstung und Pfeilern; befahrbar oben und unten
  - Orte im Landkreis mit Laternen, Ladenschildern, begehbaren Lokalen und Fußgängern
  - Schärfere Luftbilder (1 m pro Pixel) in der Nähe des Spielers, wo vorhanden
  - Getestet im Browser: Neustadt (46 Fußgänger, Lokale wie Mega-Döner, Café-Bistro Marktbäckerei, Buchhandlung
    Stache), Rödental nachts, Fahrt über die 857 m lange A-73-Brücke (bis 13 m über dem Tal, ohne Hänger),
    Itz bei Niederfüllbach und in der Innenstadt: an 17 von 17 Prüfstellen kein Durchlaufen; 3,7 ms pro Bild in Rödental
- ⚠️ Grenzen v2.1.0: Der bayerische Luftbilddienst (geodaten.bayern.de) hat nach dem Massendownload für v2.0.0 den
  Zugriff gesperrt („aus sicherheitstechnischen Gründen nicht verfügbar“); die scharfen Bilder gibt es deshalb erst
  im Thüringer Grenzgebiet. Laternen im Umland sind kein Hindernis. Fußgänger im Umland nur auf Ortsstraßen.
  Schwimmen gibt es nicht (Wasser schiebt zurück). Nur Brücken, die in OSM als Brücke eingetragen sind und
  mindestens 1,5 m über dem Gelände liegen, bekommen ein Bauwerk.

- ✅ v2.0.0 (21.10.2026): **Der ganze Landkreis Coburg.**
  - Umland in Kacheln mit echtem Gelände, Luftbildern (Bayern und Thüringer Grenzgebiet), allen Straßen von der A 73
    bis zur Wohnstraße und 78.786 Häusern aus OSM; Bäume in Wäldern, Parks und Streuobstwiesen
  - Verkehr, Polizei und Navigation auf dem Netz des ganzen Landkreises (1.899 km), Tempo nach `maxspeed`
  - 10 neue Rennen durch den Landkreis (zusammen 14), darunter der „Große Preis des Landkreises“ über 50 km
  - Lackierereien in Rödental, Neustadt, Bad Rodach, Ebersdorf, Seßlach; Autohändler in Neustadt, Ebersdorf, Untersiemau
  - Ortsanzeige mit Ortsnamen, Schnellreise zu 18 Orten und Sehenswürdigkeiten, Karte bis zum ganzen Landkreis
  - Getestet im Browser: Laden ohne Fehler, Kaltenbrunn, Rödental und Neustadt (Marktplatz) aus der Luft und von der
    Straße, alle 14 Rennen werden gebaut, KI-Gegner fahren die Rosenau-Rallye, Karte, ≈ 10 ms pro Bild
- ⚠️ Grenzen v2.0.0: Häuser im Umland stammen aus OSM (keine LoD2-Dachformen), die Fassaden sind erfunden. Luftbilder
  haben 1,9 m pro Pixel (aus der Nähe unscharf, Dächer blass). Brücken und Autobahn folgen dem Gelände (keine Talbrücken).
  Fußgänger, Laternen und Läden gibt es nur in der Innenstadt; ferne Bäume fehlen (nur Luftbild). Der „Große Preis“
  dauert ≈ 20 Minuten. Ein Durchspielen mit Tastatur steht noch aus (getestet mit Skripten).

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

- ✅ v1.5.0 (21.10.2026): **Restaurant BARCELONA** (Ernstplatz 1, Tapas) nach Fotos nachgebaut (`buildTapas`,
  `recherche/referenz-coburg.md`): Sandsteinquader mit Strahlern, Rundbogen zum Kaminzimmer mit Feuer, Holztische,
  Wandbank, Bar mit Weinregal und Serranoschinken, Tapas auf den Tischen (Gambas, Champiñones, Garnelenteller, Brot mit
  Alioli, Rotwein). Speisekarte mit 13 spanischen Gerichten und Getränken (Preise geschätzt). Draußen Biergarten mit
  acht Holzgarnituren, roten Kissen und bordeauxroten Schirmen, rotes Schild „BARCELONA“ über der Tür. Vor dem Eingang
  steht **Hugo** (blond, rotes Hemd) und winkt; sein Name schwebt über dem Kopf (Schild auch aus der Nähe sichtbar:
  neue Label-Optionen `near`, `minScale` in `ui.js`). Getestet im Browser: Biergarten, Hugo mit Namen, Innenraum,
  Bestellung (Gambas: Leben +35, Geld −9,90 €); keine Fehler.

- ✅ v1.4.2 (21.10.2026): Pfandsammler schneller (3,5 m/s, weiter langsamer als der Spieler) und mit Greifzange in der
  linken Hand (Alustange, gelber Griff, Zange; beim Laufen schräg nach vorn, am Eimer hochgehoben und stochernd).
  Drei weitere Schulhöfe: Gymnasium Casimirianum (Gymnasiumsgasse), Ernestinum (Untere Realschulstraße) und
  Alexandrinum (Seidmannsdorfer Straße), Lage nach Google Maps. Getestet im Browser: Zange beim Laufen und im Eimer,
  alle neun Höfe mit Kindern, Ball und Tischtennis; keine Fehler.

- ✅ v1.4.1 (21.10.2026): **Mehr Leben** (`js/townlife.js`).
  - **Pfandsammler** auf dem Marktplatz: grauhaariger Mann in olivgrüner Jacke mit blauer Tasche voller Flaschen.
    Er eilt mit 2,6 m/s (Spaziergänger 1,1–1,6, Spieler 4,2) von Mülleimer zu Mülleimer (14 Eimer rund um den Markt,
    vier davon neu), kramt jeweils ein paar Sekunden und läuft zum nächsten.
  - **Schulhöfe** an sechs Schulen (Gymnasium Albertinum, Rückert-, Heiligkreuz-Mittelschule, Lutherschule, Berufsschule,
    Regiomontanus-FOS): Hof aus OSM oder die größte freie Fläche neben der Schule (höchstens 30 m entfernt). Dort
    spielen Kinder Fußball (Ball rollt, wird geschossen, prallt am Rand ab), Fangen, stehen in Grüppchen, spielen
    Tischtennis an einer Platte; eine Lehrkraft hat Aufsicht. Schild „Pause auf dem Schulhof“. Nachts sind die Höfe leer.
  - Bewegt wird nur im Umkreis von 260 m um den Spieler; gezeichnet über die Fußgänger-Instanzen (`maxDrawn` 330).
  Getestet im Browser: Pfandsammler läuft und hält an den Eimern, Kinder auf Rückert-Mittelschule und Lutherschule,
  Ball bewegt sich, Tag/Nacht blendet die Kinder aus und ein; keine Fehler in der Konsole.
- ⚠️ Grenzen v1.4.1: Kinder und Pfandsammler weichen Autos und anderen Fußgängern nicht aus und können nicht
  angefahren werden; der Hof des Albertinum ist klein (OSM-Fläche fast ganz bebaut).

- ✅ v1.4.0 (21.10.2026): **Läden und Lokale zum Hineingehen** (`js/venues.js`). Neun echte Orte haben eine Tür an
  der Fassade unter ihrem Ladenschild (orange bzw. pinke Markierung auf Minikarte und Stadtplan, Schild „F betreten“):
  - Dönerläden Stadt Döner, Umut’s Döner Kebab, Coburger Kebaphaus: Döner, Dürüm, Döner-Teller, Lahmacun, Pommes, Ayran
  - Ratskeller (Gewölbekeller), Gasthaus Goldenes Kreuz (Holzbalken, Bleiglasfenster), Café Pfannküchle: fränkische
    Gerichte, Kuchen, Kaffee
  - H&M (Kleidung kaufen und sofort anziehen, wird gespeichert), Müller (Pflaster, Verbandskasten, Getränke),
    Thalia (Bücher mit kleinen Texten)
  Essen füllt das Leben auf. Bestellen an der Theke mit `E` oder überall drinnen mit `F`. Die Einrichtung folgt Fotos
  der echten Räume (`recherche/referenz-coburg.md`, Abschnitt 7). Geld ist jetzt auf den Cent genau.
  Getestet im Browser: alle neun Räume betreten und angesehen, Döner bestellt (Leben 40 → 85, Geld −7,50 €), Hemd bei
  H&M gekauft (Farbe der Figur wechselt, im Spielstand), Hinausgehen an die richtige Tür; keine Fehler in der Konsole.
- ⚠️ Grenzen v1.4.0: Gäste und Personal stehen still; Umut’s und Kebaphaus teilen sich den Grundriss von Stadt Döner;
  die Räume sind nicht so groß oder so geschnitten wie die echten; Essen hat keine Animation.

- ✅ v1.3.1 (21.10.2026): **Wahrzeichen genauer.** Die LoD2-Formen von Spitaltor, Judentor, Ketschentor und Rathaus
  bekommen echte Farben statt Fensterraster und Luftbild (`LANDMARK_LOD2` in `world.js`): Tortürme in grauem
  Sandstein mit Schieferhauben, Ketschentor oben ockergelb, Rathaus-Türmchen mit grüner Kupferhaube. Dazu
  (`CityProps.landmarks`): dunkle Torbögen und Uhren (zehn nach zehn) auf beiden Straßenseiten der Tore, die beiden
  ochsenblutroten Eckerker des Stadthauses zum Markt mit weißen Bändern, Fenstern und Schieferhelm.
  Getestet im Browser: Spitaltor aus der Spitalgasse, Ketschentor aus der Ketschengasse, Stadthaus und Rathaus vom Markt.
- ⚠️ Grenzen v1.3.1: Die Torbögen sind aufgemalt, durchfahren kann man die Tore weiterhin nicht; die Hauben haben die
  LoD2-Form (eckig statt Zwiebel); das Rathaus hat noch keine blauen Wandfelder und das Stadthaus keine roten
  Fensterrahmen.

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

- [ ] **Mehrspieler-Ausbau:** Render-Dienst anlegen und Adresse ggf. in `js/mp-config.js` eintragen; gemeinsame Rennen
  (alle an derselben Säule, Server misst Zeiten); gemeinsame Fahndung (Polizei jagt den Gesuchten auch bei den
  anderen); Emotes/Winken; Sprachchat (WebRTC); Spielstand auf dem Server (Konten) gegen Geld-Schummeln

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
  Pflaster der Fußgängerzone; v1.3.0: Ladenschilder. v1.3.1: Tortürme, Stadthaus-Erker, Rathaus-Türmchen. Offen: Fensterläden/Sandstein-Gewände,
  Rathaus-Wandfelder, Stadthaus-Fensterrahmen, Tore durchfahrbar, Gehwegplatten mit Granitrinne, historische Laternen

- [ ] Fußgänger als KI-Figuren auf Gehwegen und Plätzen
- [x] ~~Brücken über die Itz mit eigener Höhe~~ Talbrücken seit v2.1.0; flache Itz-Brücken liegen weiter auf dem Gelände (das Flussbett ist dort nicht ausgehoben)
- [ ] Spielziele: Taxi- oder Lieferaufträge zwischen Sehenswürdigkeiten, Sammelobjekte, Zeitrennen
- [ ] Straßenlaternen und Ampeln (aus OSM `highway=street_lamp`, `traffic_signals`)
- [ ] Touch-Steuerung für Smartphone und Tablet
- [x] ~~Tag-Nacht-Wechsel fließend statt per Taste, dazu Wetter (Regen, Nebel)~~ Erledigt in v2.4.0 (Uhr, Abendrot, Wetter)
- [ ] Grafik weiter: zweites Fenstermuster (Rundbogen-, Sprossen- und Ladenfenster) je Haus, Balkone, Gauben und
  Dachüberstände als Geometrie, Kanaldeckel auf der Fahrbahn, Scheinwerferkegel der KI-Autos nachts,
  Wolkenschatten auf dem Boden
- [x] ~~Ferne Wälder als Baumkulisse (Hülle über den Waldflächen) bis an den Sichtrand~~ Erledigt in v2.5.0
- [x] ~~Feldwege/Hecken fertig laden~~ Erledigt am 23.10.2026 (100 %)
- [ ] Landschafts-Boden auch für die Innenstadt (Festungsberg, Hofgarten, Itzaue); Hecken und Zäune als Hindernisse;
  Feldwege befahrbar für den KI-Verkehr; Weidetiere, Hochsitze, Feldscheunen, Strommasten
- [x] ~~Kartenausschnitt erweitern~~ Erledigt in v2.0.0 (ganzer Landkreis, kachelweise)
- [ ] **Scharfe Luftbilder fertig laden:** `node tools/fetch-region-ortho-hd.js` erneut starten, sobald
  geodaten.bayern.de wieder antwortet (lädt nur die fehlenden 367 Ortskacheln, eine Anfrage alle 1,5 s)
- [ ] LoD2-Häuser für das ganze Umland (≈ 175 CityGML-Kacheln, mehrere GB; dann je Kachel als JSON nachladen)
- [x] ~~Umland: Fußgänger, Laternen und Läden in den Orten~~ Erledigt in v2.1.0 (Wohnungen dort fehlen noch)
- [ ] Schwimmen statt Zurückschieben am Wasser
- [ ] Polizeihubschrauber ab 4 Sternen
- [ ] Fußgänger: an Zebrastreifen/Ampeln über die Straße, einander ausweichen, Verkehr hält für sie an
- [ ] Weihnachtsmarkt im Winter; Ladenschilder genauer an die echte Ladentür setzen (Hausnummern-Positionen aus OSM `addr:*`)
- [ ] Missionen (Taxi-Fahrten, Kurierfahrten, „Auto liefern“ auf Bestellung), Stunt-Sprünge
- [ ] Rennen auch mit Fahndung („illegales Straßenrennen“, Polizei taucht während des Rennens auf)
- [ ] Mehr Fahrzeugtypen (Bus, Lieferwagen, Motorrad)
- [ ] Verkehr mit echter Fahrphysik, der auf Unfälle reagiert (heute fährt er auf Schienen)
