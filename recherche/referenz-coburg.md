# Referenz Coburg: Straßen, Fassaden, Plätze, Läden

Stand: 21.10.2026. Recherche für Grand Theft Coburg, **noch kein Code geändert**.
Quellen:
- Google Street View: Autoaufnahmen von 2025/26 (Bildrechte „© 2026 Google“)
- Nutzer-Rundumfotos auf Google Maps
- Google-Bildersuche
- Google Maps zum Abgleich der Läden
- OpenStreetMap (Overpass)

Die Fotos dienen nur als Vorlage für Farben, Maße und Formen. Ins Spiel kommen **keine Bilder als Texturen**.
Farbwerte sind am Bildschirm geschätzt (sRGB, Tageslicht). Bei der Umsetzung leicht variieren, wie es `U.color()` schon tut.

Koordinaten wie im Spiel: x = Osten, z = Süden in Metern, Nullpunkt Marktplatz (50.25845 / 10.96455).

---

## 1. Was Street View abdeckt

- **Mit Autoaufnahmen:** alle befahrbaren Straßen, darunter Mohrenstraße, Steinweg (Nordteil), Theaterplatz, Steingasse, Rückertstraße, Grafengasse, Steintor, Oberer Bürglaß, Webergasse, Mühlgasse, Löwenstraße, Viktoriastraße, Lossaustraße, Bahnhofstraße, Heiligkreuzstraße, Kasernenstraße, Allee, Obere Anlage, Festungsstraße, Schillerplatz und Alexandrinenstraße. Insgesamt sind 802 Aufnahmepunkte erfasst.
- **Ohne Autoaufnahmen (Fußgängerzone):** Markt, Spitalgasse, Ketschengasse, Judengasse, Herrngasse, Rosengasse und Albertsplatz. Für sie habe ich Nutzer-Rundumfotos und die Bildersuche genommen.

Alle Aufnahmepunkte (ID, Straße, lat/lon, x/z, Fahrtrichtung) stehen in [`streetview-panos.json`](streetview-panos.json), zusammen mit der Bild-URL zum Nachschauen.

---

## 2. Allgemeine Merkmale der Innenstadt

### Gebäude und Fassaden
- **Altstadt (innerhalb der Tore):** Bürgerhäuser mit 3–4 Geschossen, giebel- oder traufständig, glatt verputzt. Steile Satteldächer aus roten Biberschwanzziegeln mit 1–2 Gaubenreihen. Oft Zwerchhäuser oder Schweifgiebel in Renaissance- oder Barockform.
- **Farbpalette der Altstadt** (gemessen an Markt, Ketschengasse, Judengasse, Steintor, Herrngasse):

  | Ton | Hex | Wo typisch |
  |---|---|---|
  | Cremeweiß | `#f1ece0` | überall, Stadthaus-Grund |
  | Hellocker / Sandgelb | `#e9d29a` | Markt-Westseite, Steintor |
  | Ockergelb kräftig | `#e2b84c` | Spitaltor-Nachbarn, Herrngasse |
  | Lachs / Apricot | `#e8a27c` | Markt, Ketschengasse, Oberer Bürglaß |
  | Altrosa | `#e3aaa0` | Markt (Haus mit „BR“), Heiligkreuzstraße |
  | Ziegelrot (Putz) | `#b8463a` | Ketschengasse (großes rotes Haus), Markt Südwest |
  | Blassgrün / Mint | `#cfd9c4` | Steintor, Judengasse |
  | Hellgrau-Blau | `#c9d0d4` | Judengasse, Löwenstraße |
  | Graugrün mit dunkelgrünen Läden | `#b9bfb2` | Oberer Bürglaß |

  Das passt grob zur bisherigen `FACADES`-Liste. Es fehlen das kräftige Ziegelrot, das kräftige Ocker und das Altrosa. Das bläuliche `#c3ced4` ist eher selten.
- **Sandstein:** gelblich-grauer Coburger Sandstein `#cbb99a` (verwittert `#a99c86`). Daraus sind Erdgeschosse, Fenstergewände, Ecklisenen und Portale gebaut. Bei Barockhäusern bilden die Gewände oft eine verzierte Ädikula, zum Beispiel am Steintor.
- **Gründerzeit (Mohrenstraße, Löwenstraße, Webergasse, Bahnhofsviertel):** 4–5 Geschosse, Erdgeschoss aus Sandstein mit Bogenöffnungen oder modernen Schaufenstern mit Metallvordach. Darüber Klinker in Hellrot/Rosé `#b9705c` oder Putz. Erker aus Sandstein mit Zierwerk, Gesimse.
- **Fachwerk:** einzelne Häuser mit rotbraunem `#8a3b2a` oder ochsenblutrotem `#a43a2c` Fachwerk auf weißem oder cremefarbenem Putz. Beispiele: Hofapotheke am Markt, Steinweg-Nordende, Rückertstraße/Kirchhof. Außerdem schiefergraue Fachwerkhäuser mit Schieferverkleidung `#56595e` (Steintor, Grafengasse).
- **Fenster:** hochrechteckig, etwa 1,1 × 1,6 m, zweiflüglig mit Oberlicht, weiße Rahmen. Ältere Häuser haben Sprossen (6 Felder). Viele Häuser tragen Fensterläden: dunkelgrün `#3d4a3a` oder grau. In der Altstadt liegen 3–5 Fensterachsen je Haus. Abstand der Geschosse 3,0–3,4 m, im Erdgeschoss 4 m.
- **Dächer:** rote bis rotbraune Ziegel (`#a5452f` … `#7e3a2c`, wie `TILE_ROOFS`). Schlösser, Kirchtürme und Tore haben Schiefer `#4f5866`.

### Straßen, Gehwege, Ausstattung
- **Fußgängerzone (Markt, Spitalgasse, Ketschengasse, Judengasse, Herrngasse):**
  - Granit-Kleinpflaster in Dunkelgrau-Blau `#5f6168`, im Segmentbogen verlegt.
  - Dazu Bänder aus hellgrauem Granit `#a9a9a4` als Linien oder Raster.
  - Vor den Häusern laufen glatte Streifen aus hellen Granitplatten (etwa 1,5–2 m breit).
  - Keine Bordsteine, nur flache Rinnen.
- **Befahrene Altstadtstraßen (Mohrenstraße, Steinweg, Steintor, Steingasse):**
  - Asphalt `#4a4b4d` mit weißen Markierungen, oft „30“ auf der Fahrbahn.
  - Am Fahrbahnrand eine Rinne aus 2–3 Reihen grauer Granitpflastersteine.
  - Bordstein aus Granit, etwa 12 cm hoch.
  - Gehweg aus grauen Betonplatten 30×30 oder 40×40 cm `#9b9a96`, an Ecken und Einfahrten Kleinpflaster.
- **Wohn- und Villenstraßen (Lossaustraße, Bahnhofstraße, Viktoriastraße):**
  - Gehwege aus rotem Betonpflaster `#a8574a` oder grauen Platten.
  - Grünstreifen, Hecken, Bäume, Vorgärten mit niedrigen Zäunen.
  - Lossaustraße und Ketschendorfer Straße/Schillerplatz sind vierspurig mit begrüntem Mittelstreifen.
- **Laternen:** in der Altstadt schwarze bis dunkelgrüne Mastleuchten im historischen Stil mit Laternenkopf, etwa 4 m hoch. An den Hauptstraßen moderne Mastleuchten.
- **Ausstattung:**
  - Straßenbäume (Linden) mit gusseisernen Baumscheiben und Schutzgittern (Mohrenstraße)
  - Fahrradständer als Bügel
  - blaue Parkschilder „P“
  - Sitzbänke aus Holz mit Metallgestell
  - Pflanzkübel aus grauem Beton mit Blumen (Markt)
  - Mülleimer anthrazit

### Schilder
- **Ladenschilder:** meist Einzelbuchstaben auf der Fassade über dem Erdgeschoss, in der Markenfarbe. Beispiele: Sparkasse rot, Targobank blau, DEVK grün, Riemann dunkelrot. Dazu Ausleger (Nasenschilder) an der Fassade, bei Gaststätten oft schmiedeeisern.
- **Straßennamen:** weiße Schilder mit schwarzer Schrift und schwarzem Rand, die übliche bayerische Form.
- **Verkehrsschilder:** Zone 30, Fußgängerzone (Zeichen 242), Parken, Einbahnstraße.

---

## 3. Straßen im Einzelnen (Street View)

| Straße | Ort (x,z) | Bebauung | Farben | Boden |
|---|---|---|---|---|
| **Mohrenstraße** | −80…−230, −250…−370 | Gründerzeit, 4–5 Geschosse, Sandstein-Erdgeschoss mit Bogenportal (grüne Holztür), Klinker darüber, Sandstein-Erker | Klinker `#b9705c`, Sandstein `#cbb99a`, Fensterrahmen grün oder weiß | Asphalt, Gehweg aus grauen Platten, Granitrinne, Linden mit Gittern |
| **Steinweg** (Nordende) | 60…100, −330…−420 | 2–3 Geschosse, verputzt, Läden, großes Fachwerkhaus (rot auf weiß) als Blickpunkt | Ocker `#d9c08a`, Apricot `#e59f7a`, Weiß | Asphalt, Gehweg aus Platten und Pflaster |
| **Theaterplatz** | 100…180, −140…−190 | Landestheater (siehe unten), moderne Bank (Glas/Weiß), Geschäftshäuser | Sand `#d8c08f` | großflächig hellgraues Granit-Kleinpflaster `#b3b0a8`, Bäume, Bushaltestelle |
| **Steingasse / Kirchhof** | 100…200, 70…160 | Sandsteinbauten mit Renaissance-Fenstern, Barockhäuser weiß/creme mit Sandsteinportalen | Sandstein `#cbb89a`, Creme | schmaler Gehweg, Asphalt |
| **Rückertstraße** | 150…160, −5…25 | ockerfarbener massiger Bau (Gymnasium/Kirchhof) mit vergitterten Fenstern; Puppenmuseum (weiß, rote Schrift „PUPPENMUSEUM“, Café mit roten Stühlen) | Ocker `#c9a86a`, Weiß | Kopfsteinpflaster am Rand, Blick auf Fachwerkhaus (orange-rot) |
| **Steintor** | 280…330, 150…170 | Barockhäuser, Ädikula-Fenster aus Sandstein, ein schiefergraues Fachwerkhaus | Creme `#e0c99a`, Altrosa mit rotem Sandstein `#c99b88`/`#b0705a`, Mint `#cfd8c2` | Asphalt, schmale Gehwege, Granitbord |
| **Grafengasse** | 165…185, −10…−80 | Sandstein-Erdgeschosse mit Bogenfenstern, darüber weißer Putz, ein rot gestrichenes Fachwerkhaus | Weiß, Sandstein, Rot `#a43a2c` | Sandsteinmauer mit Hecke (Schlossplatz-Rand) |
| **Oberer Bürglaß** | 150…240, −230…−400 | Pizzeria Maccaroni (weiß), cremefarbenes Haus mit Garagentoren, graugrünes Haus mit dunkelgrünen Läden und Schmiedeeisen-Balkon | Weiß, Beige, Apricot `#e4a36b`, Graugrün | Asphalt, Gehweg aus Platten |
| **Webergasse** | −40…−150, −110…−190 | Gründerzeit-Sandsteinbau mit Rundbogentür, weißes modernes Geschäftshaus, ockergelbe Häuser | Sandsteingrau `#c8bfa8`, Weiß, Ocker | Asphalt, Zone 30, gelbe Baustellenmarkierung (temporär) |
| **Löwenstraße** | −230…−290, −160…−220 | Gründerzeit-Reihe, ein Klinkerbau, Sandsteinvilla | Hellgrau/Weiß, Creme, Klinker | Asphalt mit „30 ZONE“, graue Platten |
| **Viktoriastraße** | −320…−360, −140…−180 | Villen, eine mit Türmchen; Fachwerk weiß mit graublauem Gebälk | Sandgelb, Weiß | Grünstreifen, Blumenbeete |
| **Lossaustraße** (zum Bahnhof) | −410…−520, −300…−780 | breite vierspurige Straße, Villen gelb `#e8cf75` und weiß, Lagerhaus mit Fachwerk | Gelb, Weiß | Einfahrten aus grauem Pflaster, Hecken |
| **Bahnhofstraße** | −250…0, −520…−590 | Villen (blassgrün `#c8cfa3` mit weißen Gliederungen), Bäume | Salbeigrün, Weiß | rotes Betonpflaster auf dem Gehweg |
| **Heiligkreuzstraße** | 80…115, −530…−600 | verputzte Häuser mit Läden im Erdgeschoss | Gelb `#e2c56a`, Rosa `#e3a7a0`, Weiß, Schiefergrau im Erdgeschoss | Asphalt |

---

## 4. Fußgängerzone und Plätze (Nutzerfotos und Bildersuche)

### Marktplatz (Nullpunkt)
- **Boden:**
  - Dunkelgraues Granit-Kleinpflaster.
  - Hellgraue Granitbänder bilden ein großes Muster aus Kreisen und Strahlen. Im Luftbild zieht ein Diagonalraster über den Platz.
  - Um das Denkmal liegt ein Kreisring.
  - Am Rand verlaufen glatte Plattenstreifen.
- **Prinz-Albert-Denkmal** in der Platzmitte:
  - Bronzefigur mit Grünspan `#5f7d72` auf hohem Sockel aus grauem Granit `#7d7d7a` mit Inschrifttafeln.
  - Ringsum Bodenfontänen (Wasserspiel im Boden).
- **Rathaus (Südseite, Markt 1, Ratskeller):**
  - Renaissance, im 18. Jh. umgebaut, breite traufständige Front mit 3 Geschossen.
  - Fassade cremeweiß mit **hellblauen Wandfeldern** `#9fb7d6` zwischen den Fenstern und blassgelben Pilastern/Rahmen `#e6cf86`.
  - Mittelrisalit mit Dreiecksgiebel, Wappen und Uhr.
  - Auf dem Dachfirst ein achteckiges **Türmchen mit grüner Kupferhaube** `#5f9a86` und Laterne.
  - An der Westecke ein runder Eckerker (orange-ocker), braunrotes Ziegeldach mit Gauben.
  - Fahnen an Stangen (Blau-Gelb sowie Stadt-, Bayern- und Europafahne). Im Erdgeschoss Bogenportale.
- **Stadthaus (Nordseite, bei x 27, z −19):**
  - Renaissancebau, weißer Putz mit **ochsenblutroten** `#a83a2e` Fensterrahmen, Gesimsbändern und Eckquadern.
  - Zwei Zwerchhäuser mit Volutengiebeln und Obelisk-Aufsätzen.
  - Ein zweigeschossiger **Eckerker** („Coburger Erker“): rot-weiß bemalt, reich geschnitzter Fuß mit Figuren (rot und gold), oben ein spitzer Schieferhelm.
  - Das Erdgeschoss ist hell und gequadert. Im Sommer stehen davor Cafétische mit weißen Schirmen.
- **Westseite / Ecke Judengasse:**
  - **Hofapotheke** (Markt 15, x 43, z 39): spätgotisches Fachwerkhaus, rotes Gebälk auf Creme, mächtiges Ziegeldach mit drei Gaubenreihen.
  - Daneben eine Reihe schmaler Giebelhäuser: Creme, Pfirsich, Lachs, Ocker, alle mit steilen roten Dächern.
  - Dahinter ragt die Morizkirche auf.
- **Nordwest-Ecke (zur Spitalgasse):**
  - Rosa Eckhaus `#e7b3a4` mit 4 Geschossen, Läden im Erdgeschoss, Schild „BR“ (Studio des Bayerischen Rundfunks).
  - Großes cremeweißes Gründerzeithaus mit Ziergiebel.
- **Südwest-Ecke (zur Ketschengasse):**
  - Ockerfarbenes Haus mit der **Buchhandlung Riemann** (Markt 9): Schaufenster mit Rundbogen, Schriftzug in Dunkelrot.
  - Rot verputztes Haus mit weißen Fenstern.
  - Ein reich verziertes Renaissance-Giebelhaus aus Sandstein.
- **Ausstattung:** graue Pflanzkübel mit Bäumchen, Bänke, Marktstände (weiß und rot gestreift, an Markttagen). Bratwurststände sind Coburger Tradition.

### Spitalgasse (Markt → Spitaltor, nach Norden)
- Gemischte Häuser aus Sandstein-Gründerzeit und Putz: Altrosa, Ockergelb, Weiß, Hellgrau. Im Erdgeschoss durchgehend Schaufenster.
- **Boden:** helle Granitplatten und Kleinpflaster, schwarze historische Laternen, keine Bordsteine.
- **Spitaltor** (x 39, z −181) als Blickpunkt:
  - Quadratischer Turm aus grob behauenem grauem Sandstein `#b0a48c` mit spitzbogiger Durchfahrt.
  - Darüber ein achteckiges Obergeschoss mit Uhr, dann eine **dunkle Schiefer-Zwiebelhaube** `#4b5262` mit Laterne und Spitze.
  - Daneben ockergelbe Häuser `#e2b84c` mit Arkaden im Erdgeschoss.

### Ketschengasse (Markt → Ketschentor, nach Süden, leicht ansteigend und geschwungen)
- 3–4 Geschosse, kräftige Farben nebeneinander: **Ziegelrot**, Weiß, Ockergelb, Lachs, Blassgrün, ein Giebel in Orange-Lachs mit Sandstein. Steile rote Dächer mit Gauben.
- **Boden:** Kleinpflaster, schwarze Mastlaternen.
- **Ketschentor** (x −10, z 349):
  - Unterbau aus Sandstein mit Bogendurchfahrt.
  - Darüber ein ockergelb verputztes Turmgeschoss mit Uhr, dann eine dunkle Schiefer-Zwiebelhaube mit Laterne.
  - Davor steht der Ketschentorbrunnen (x −38, z 281).

### Judengasse (Markt → Judentor, nach Westen)
- Pastellfarbene Häuser: Mint, Hellgelb `#f0dc8a`, Weiß, Hellblau-Grau, mit Läden.
- **Judentor** (x −128, z −19):
  - Hoher schmaler Turm aus rauem grauem Sandstein `#a99c86`.
  - Oben ein auskragender hölzerner Wehrgang (dunkelbraun).
  - Darüber eine Schiefer-Zwiebelhaube (blaugrau) mit Laterne, rot-weißes Zifferblatt.

### Herrngasse (Markt → Schlossplatz, nach Osten)
- **Renaissance-Sandsteinbauten:** dreigeschossig mit Mittelturm und Zwerchgiebel, Fensterbänder mit Verdachungen.
- Ockergelbes Haus `#e8b94a` mit weißen Fenstern und roten Türen, daneben ein rosafarbenes Haus.
- Nach Westen fällt der Blick auf den rot-weißen Giebel des Stadthauses.

### Schlossplatz und Schloss Ehrenburg (x 200–320, z 0–60)
- **Ehrenburg:**
  - Neugotische Fassade (nach Schinkel), Putz und Sandstein in hellem Sand `#d9cdb0`.
  - Graue Schieferdächer `#5a6170`.
  - Quadratische Ecktürme mit Zinnen, Mittelrisalit mit Spitzbogenfenstern, ein Turm mit Spitzhelm.
- **Platz:**
  - Rasenparterre mit Buchsbaumkanten und hochstämmigen Kübelbäumchen.
  - Kieswege in Hellbeige `#d8cbb0`.
  - Denkmal Ernst I. in der Mitte.
- **Arkaden:** Sandstein-Balustrade mit Bogengang zum Hofgarten am Hang, Blumenschalen auf der Brüstung.

### Landestheater (Schloßplatz 6, x 181, z −149)
- Klassizistisch, Sandstein und Putz in Hellcreme `#e0d4b5`.
- Gequadertes Erdgeschoss mit Bogenöffnungen.
- Im Obergeschoss eine Reihe aus 9 hohen Rundbogenfenstern, großer Dreiecksgiebel.
- Flache Freitreppe, Fahnenmasten mit blau-gelben Bannern, davor Kleinpflaster.

### Morizkirche (Kirchhof, x ≈ 120…170, z ≈ 90…150)
- Gotische Hallenkirche aus dunkel verwittertem, fleckigem grau-braunem Sandstein `#8a7f6e`.
- **Zwei ungleiche Westtürme:** Der Nordturm (etwa 72 m) hat ein achteckiges Obergeschoss und eine schlanke Schieferhaube mit Laterne. Der Südturm ist niedriger.
- Steiles rotbraunes Ziegeldach `#a3533a`, hohe Maßwerkfenster mit Spitzbogen, Strebepfeiler.

### Bahnhof (Vorplatz an der Lossaustraße, x ≈ −400, z ≈ −500)
- Bau der 1920er Jahre im neoklassizistischen Stil, heller Kalk- oder Sandstein `#d6cdb8`.
- **Mittelbau:**
  - Drei hohe Türen.
  - Darüber **drei ovale Fenster** (Ochsenaugen) und der Schriftzug „Bahnhof Coburg“.
  - Davor ein Vordach aus Glas und Stahl mit schwarzem Rahmen, DB-Logo rot.
- Rotes Ziegel-Walmdach, lange niedrige Seitenflügel mit roten Dächern.
- **Vorplatz:** graues Pflaster, Bäume, Ampeln, Taxistand.

---

## 5. Läden und Lokale

Die vollständige Liste steht in [`pois-coburg.json`](pois-coburg.json): 349 Einträge mit Name, Art, Küche, Adresse, lat/lon und x/z.

- **Grundlage:** alle benannten Geschäfte und Lokale (shop/amenity) aus OSM zwischen Bahnhof und Ketschentor.
- **Mit Google Maps abgeglichen:** 27 Einträge; die Koordinate stammt dann aus Google.

### Dönerläden und Imbisse
| Name | Adresse | x, z | Status |
|---|---|---|---|
| Stadt Döner | Judengasse 2 | −63, −10 | neu (Google) |
| Ararat | Herrngasse 8 | 117, 8 | bestätigt |
| BB-Kebab | Badergasse 6 | −19, −260 | bestätigt |
| Coburger Kebaphaus | Steinweg 12 | 58, −261 | bestätigt |
| Umut’s Döner Kebab | Mohrenstraße 21 | −82, −279 | bestätigt |
| MEGA DÖNER macht schöner | Mohrenstraße 15A | −113, −319 | bestätigt |
| Döner Eckla | Lohgraben 4 | 1, −333 | neu (Google) |
| Pizzeria Fares | Mohrenstraße 10 | −233, −372 | bestätigt |
| Cafe Ani Kebab | Ketschengasse 52 | −26, 331 | neu (Google), am Ketschentor |
| Bella Turko (Grill) | Steintor 9 | 310, 152 | neu (Google) |
| ~~Stadt Kebab~~ | Rosengasse 4 | | Google findet ihn nicht mehr |
| ~~Theater Kebab~~ | Salzmarkt 3 | | Google findet ihn nicht mehr |
| ~~Behnam Döner~~ | (Salzmarkt) | | dauerhaft geschlossen |
| ~~ANKA Shawarma~~ | Steinweg 46 | | Google findet ihn nicht mehr |

### Restaurants und Cafés rund um den Markt (bestätigt)
- Ratskeller (Markt 1, im Rathaus)
- Café Pfannküchle (Markt 11)
- Gasthaus Goldenes Kreuz (Herrngasse 1)
- Brauhaus zu Coburg und Brauhaus Stadl (Mauer 2)
- Haxenbraterei (Judengasse 10)
- Restaurant Loreley (Herrngasse 14)
- Andaaz (indisch, Theatergasse 1)
- Hanskaschber (Burger, Theatergasse 5)
- Münchner Hofbräu (Kleine Johannisgasse 8)
- Café Feiler (Theaterplatz 5)
- Coburger Klößerei (Judengasse 25)

Ohne Abgleich, nur aus OSM: Café Prinz Albert (Ketschengasse 27), Eis-Café Panciera (Markt 17), Bratwurstglöckle, Künstler-Klause und weitere, siehe JSON.

### Geschäfte (Auswahl, bestätigt)
- H&M (Spitalgasse 16)
- Müller (Spitalgasse 3)
- Thalia (Spitalgasse 21)
- Woolworth (Steinweg 17)
- WÖHRL (Ketschengasse 14)

Nur in OSM, laut Fotos plausibel:
- Riemann (Markt 9, auf den Fotos gesehen)
- Telekom (Spitalgasse 1), Vodafone (Spitalgasse 13), O2 (Spitalgasse 8)
- Deichmann (Markt 6), engbers (Markt 7)
- Sparkasse (Markt 2–3, Mohrenstraße)
- Targobank (Mohrenstraße 28), DEVK und „Moehre 27“ (Mohrenstraße 27, auf Street View gesehen)

**Außerhalb der Karte:** McDonald’s liegt an der Neustadter Straße 9C (50.2730 N), also nördlich des Kartenausschnitts.

**Hinweis:** OSM- und Google-Punkte liegen meist in der Gebäudemitte oder am Eingang. Für die Tür im Spiel den Punkt auf die nächste Außenwand zur Straße schieben.

---

## 6. Vorschläge für den Umbau (noch nicht umgesetzt)

1. **Fassadenfarben je Straße statt Zufall:** `FACADES` um Ziegelrot, Ocker und Altrosa ergänzen. In der Fußgängerzone kräftiger und bunter färben, in Gründerzeitstraßen mehr Klinker und Sandstein.
2. **Erdgeschoss eigenständig:** Schaufensterband mit Ladenschild (Name aus `pois-coburg.json`) an der Wand, die dem POI am nächsten liegt. Sandstein-Sockel bei Altbauten.
3. **Fenstertextur:** Sprossen und weiße Rahmen sind schon da. Dazu eine Variante mit dunkelgrünen Fensterläden und eine mit Sandstein-Gewänden.
4. **Boden:**
   - Fußgängerzone mit Kleinpflaster-Textur (dunkelgrau mit hellen Bändern) statt Asphalt.
   - Marktplatz mit eigenem Kreis- und Strahlenmuster.
   - Gehwege aus grauen Platten mit Granitrinne.
5. **Wahrzeichen als Einzelmodelle:**
   - die drei Tortürme (Spitaltor, Ketschentor, Judentor)
   - der Erker des Stadthauses
   - das Rathaus-Türmchen mit grüner Haube
   - das Albert-Denkmal mit Fontänen
   - die Fassaden von Bahnhof, Landestheater und Ehrenburg

   Die LoD2-Hüllen liefern die Form, dazu kommen Farbe und Details aus diesem Dokument.
6. **Ausstattung:** historische Laternen in der Altstadt, Linden mit Baumgittern an der Mohrenstraße, Pflanzkübel und Marktstände am Markt.
7. **Läden einbauen:** zuerst die bestätigten Einträge. Geschlossene oder nicht gefundene Läden weglassen.

---

## 7. Innenräume (Bildersuche, 21.10.2026)

Grundlage für die betretbaren Läden und Lokale in `js/venues.js`. Die Fotos dienen nur als Vorlage, im Spiel ist alles aus einfachen Formen und gemalten Texturen gebaut.

| Ort | Was die Fotos zeigen | Umsetzung im Spiel |
|---|---|---|
| **Stadt Döner** (Judengasse 2) | Theke mit Glasvitrine und Edelstahlschalen (Rotkraut, Salat, Tomate, Zwiebel, Mais), senkrechter Dönerspieß vor dem Grillstrahler, Pizzaofen aus Edelstahl, beleuchtete Menütafel mit Bildern, weiß gefliest; außen Sandsteinfassade mit Rundbogenfenster | Edelstahltheke mit acht farbigen Schalen und Spuckschutz, drehender Spieß vor glühendem Strahler, Pizzaofen, Leuchttafel mit Name und Preisen, weiße Wand- und anthrazit Bodenfliesen, Kühlschrank mit Flaschen, Tische mit roten Stühlen |
| **Umut’s Döner / Coburger Kebaphaus** | (keine eigenen Innenfotos gefunden) | gleicher Imbiss-Grundriss, andere Farben der Menütafel |
| **Ratskeller** (Markt 1) | weiß verputzte Gewölbe mit Gurtbögen, Bogenfenster mit Sprossen, Hängelampen mit warmen Glühbirnen, dunkle Holztische und -stühle, geschwungene Holztheke, Bilder an der Wand | zwei Tonnengewölbe mit Pfeilern und Bögen, Bogenfenster, Pendelleuchte über jedem Tisch, dunkles Holz, Theke mit beleuchtetem Flaschenregal |
| **Gasthaus Goldenes Kreuz** (Herrngasse 1) | dunkle Holzbalkendecke, Holztäfelung, lange Tafeln mit weißen Decken und roten Läufern, Tischlampen mit weißen Schirmen, Bleiglasfenster mit goldenem Kreuz | genau so: Balken, Täfelung, zwei lange Tafeln mit Läufer und Lämpchen, Bleiglasfenster mit Kreuz |
| **Café Pfannküchle** (Markt 11) | Theke mit Holzkisten voller Brötchen, Granitplatte, langer Holztisch mit dunkelgrünen Stühlen, Kronleuchter, Ziegelwand | Theke mit Brotkisten und Kuchenvitrine, Siebträger, Ziegelwand, langer Tisch mit grünen Stühlen, zwei Kronleuchter |
| **H&M** (Spitalgasse 16) | helle Fliesen, Kleiderstangen aus Metall, Tische mit gefalteten Stapeln, Schaufensterpuppen, Wandregale, Kasse mit Logo | Kleiderstangen mit bunten Teilen, Stapeltische, Wandregal, zwei Puppen, drei Umkleidekabinen, Kasse mit rotem Logo |
| **Müller** (Spitalgasse 3) | helle Gänge mit weißen Regalen voller bunter Packungen, orange Leitsystem-Schilder, Kosmetikwand | sechs doppelseitige Regale mit Packungstextur und orangen Kopfschildern, Kosmetikwand, orange Kasse |
| **Thalia** (Spitalgasse 21) | schwarze Bücherregale, Holz-/Fischgrätboden, Tische mit Buchstapeln, Leseecke, Schild „Bestseller“ | schwarze Regale an zwei Wänden, vier Stapeltische, rote Sessel, Schild „BESTSELLER“, Kasse |

### BARCELONA – Tapas. Carne. Vino (Ernstplatz 1)

Google Maps: 50.2575711 N / 10.9624285 O (Spiel x −151, z 97), Tapas-Restaurant, 4,5 Sterne. Laut Google „helle Steinmauern und Separees“, laut Website (barcelona-coburg.de) ein Kaminzimmer, Öffnungszeiten Mo–Sa 17–24 Uhr, So 17–22:30 Uhr. Die Speisekarte gibt es nur als PDF-Download; die Gerichte im Spiel folgen den Essensfotos und Bewertungen (Tapas-Platte, Bruschetta, Alioli), die Preise sind geschätzt.

| Was die Fotos zeigen | Umsetzung |
|---|---|
| Wände aus hellen Sandsteinquadern, warm angestrahlt | Quadermauerwerk-Textur, Strahlerleiste unter der Decke |
| Rundbogen-Durchgänge zwischen den Räumen | Sandsteinwand mit Rundbogen vor dem Kaminzimmer |
| helle Holztische, dunkle Stühle, Wandbänke | Eichentische, schwarzbraune Stühle, lange Wandbank mit roten Polstern |
| Raum mit weißen Tischdecken | Kaminzimmer: weiß gedeckte Tische mit Kerzen, Kamin mit flackerndem Feuer |
| Bar mit Weinregal und Hockern | Theke, Hocker, Weinregal, Zapfhähne, Serranoschinken auf dem Halter |
| Tonschälchen mit Gambas al Ajillo und Champiñones, weiße Teller mit Garnelen und Paprika, Brot mit Alioli, Rotwein | auf mehreren Tischen nachgebaut |
| Biergarten am Ernstplatz: Holzgarnituren, rote Kissen, bordeauxrote Schirme | acht Garnituren mit Schirmen vor dem Eingang |
| rotes Schild „BARCELONA“ | rotes Schild mit weißer Schrift über der Tür |
