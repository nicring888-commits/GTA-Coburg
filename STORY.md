# GTA Coburg – Story „Zurück in der Heimat“ (Story-Bibel)

> Grundlage für alle Story-Missionen. Was hier steht, gilt für Dialoge, Orte, Entscheidungen und die drei Enden.
> Umsetzungsstand und Technik: PROJEKT.md, Abschnitt 8. Die Missionen 1–5 sind spielbar (`js/story-k1.js`),
> alle weiteren sind hier ausgearbeitet und werden in Phase 4/5 umgesetzt.

## 1. Prämisse

Coburg, Gegenwart. **Leon Berger** (26) kommt nach fünf Jahren zurück. In Nürnberg ist sein Gebrauchtwagenhandel
pleitegegangen, er hat Schulden und ein Ziel: auf eigenen Beinen stehen. Vor fünf Jahren brannte das **Autohaus
Berger** seines Vaters an der Itz ab; die Versicherung zahlte nicht, der Vater verkaufte das Grundstück für einen
Spottpreis und starb zwei Jahre später. Leon ging damals im Streit.

Heute plant **Richard Voss** (51) mit der *Voss Projektentwicklung* das Prestigeprojekt **„Quartier Itzaue – Neue
Mitte Coburg 2030“**: Wohntürme, Hotel und Einkaufszentrum auf den Itzwiesen. Dafür kauft er seit Jahren Häuser
und Grundstücke auf, notfalls mit Druck, gekauften Gutachten und Brandstiftung. Das Geld wäscht er über Luxusautos,
die die Spedition seines Partners **Jürgen Kessler** „exportiert“.

Was niemand weiß: Ein schmaler Streifen des alten Autohaus-Grundstücks (Wegerecht und Zufahrt zur Itz) gehört bis
heute **Leon**, als Erbe seines Vaters. Ohne seine Unterschrift ist das Quartier nicht genehmigungsfähig. Voss holt
Leon nicht zufällig nach Coburg zurück.

Ton: GTA-typisch – schlagfertige Dialoge, Situationskomik, fränkische Eigenheiten (Bratwurst über Kiefernzapfen,
„Gell?“, „Bassd scho“), dazu echte Dramatik um Freundschaft, Schuld und Heimat.

## 2. Figuren

| Figur | Alter | Erscheinung (im Spiel) | Kern | Stimme im Text |
|---|---|---|---|---|
| **Leon Berger** (Spieler) | 26 | dunkelblonde Haare, Bomberjacke Oliv, dunkle Jeans | selbstbewusst, schlagfertig, ehrgeizig, impulsiv, misstrauisch | trocken, ironisch, kurze Sätze; wird leise, wenn es um den Vater geht |
| **Maximilian „Max“ Fischer** | 28 | wilde braune Locken, rote Kappe, gelbes Hemd, Goldkettchen | Kindheitsfreund, Charmeur, ständig „die nächste große Sache“ | redet schnell, Superlative, Anglizismen, „Digga“, „Alter“ |
| **Richard Voss** | 51 | grau meliertes, nach hinten gekämmtes Haar, anthrazit Anzug, weißes Hemd, dunkelrote Krawatte | Bauunternehmer, Mäzen, Stadtrat-Freund; charmant, kalt, kontrolliert | höflich, gewählt, siezt immer, Fragen statt Befehle, leise Drohungen |
| **Sarah Neumann** | 29 | kurzer schwarzer Bob, runde Brille, petrolfarbener Mantel | Lokaljournalistin beim *Coburger Stadtboten* (fiktiv), hartnäckig, idealistisch | präzise, bissig, stellt unbequeme Fragen, Humor als Waffe |
| **Tobias „Tobi“ Weber** | 39 | Glatze, rotblonder Vollbart, blauer Arbeitsoverall | Kfz-Meister, betreibt „Kfz Weber“ (Lackiererei Nord), loyal, bodenständig, Ex-Lehrling von Leons Vater | ruhig, fränkisch, Werkstattsprüche, wenig Worte mit Gewicht |

Nebenfiguren: **Erwin** (Bratwurststand am Markt, kennt alle), **Frau Gundermann** (Vermieterin Judengasse,
streng), **Herr Kraus** (Vermieter Lossaustraße, Rentner mit Umzugskisten), **Dr. Katharina Lenz** (Voss' Assistentin,
später Verbündete), **Jürgen Kessler** (Spediteur, Leons alter Geschäftspartner aus Nürnberg), **Dragan** (Geldeintreiber
mit Schulden-Liste, für Voss tätig), **Kommissarin Hanna Roth** (Kripo Coburg).

Beziehungen am Start (−100 … 100): Max 40, Tobi 30, Sarah 0, Voss 0. Werte steigen und fallen durch Entscheidungen
und Missionsleistung; im Tagebuch (`J`) sichtbar.

## 3. Entscheidungen, die zählen

| Mission | Entscheidung | Wirkung |
|---|---|---|
| 2 Alte Zeiten | Max € 200 leihen oder nicht | Max ±, Flag `maxLoan` (Max erinnert sich in M15 und M25) |
| 4 Der erste Auftrag | Umschlag im Paket lesen oder nicht | Flag `readEnvelope` (Leon kennt das Itzaue-Gutachten früh; Sarah vertraut ihm in M12 schneller) |
| 4 Der erste Auftrag | Ware heil abliefern | Voss + (Lieferzustand) |
| 5 Ein interessanter Kontakt | Haltung zu Voss: respektvoll / frech / neugierig | Voss ±, Flag `vossAttitude` |
| 5 | Fahrstil mit Voss im Auto | Voss + bei sauberer Fahrt |
| 10 Eine offene Rechnung | Schuldner verschonen oder einschüchtern | Moral ±, Sarah erfährt es in M12 |
| 14 Verdächtige Geschäfte | Beweise an Sarah oder an Voss | Sarah ±/Voss ±, Flag `evidenceTo` |
| 19 Eine Entscheidung | Max helfen (Schulden) oder Sarah schützen (Quelle) | einer der beiden −40, Flag `chose19` |
| 22 Verlorenes Vertrauen | Tobi verzeihen oder nicht | Tobi ± |
| 25 Der Verrat | Max verschonen / verstoßen | Flag `maxFate` |
| 27 Kein einfacher Ausweg | Voss' Abfindung (€ 250.000) annehmen / ablehnen | Flag `buyout` |
| 34 Letzte Entscheidungen | Veröffentlichen / Übernehmen / Rache | bestimmt das Ende (mit den Werten oben) |

## 4. Die drei Enden

- **Ende A – Neuanfang:** Leon gibt die Beweise an Sarah und Kommissarin Roth, Voss wird verhaftet, das Quartier
  Itzaue gestoppt. Leon überschreibt sein Grundstück einer Bürgerstiftung und eröffnet mit Tobi die Werkstatt
  „Berger & Weber“ neu. Bedingung: Wahl „Veröffentlichen“, Sarah ≥ 20 und Beweise vollständig (`evidenceTo` nicht
  `voss` oder in M29 zurückgeholt). Max ist dabei, wenn `maxFate = verschont`.
- **Ende B – Der Aufstieg:** Leon erpresst Voss mit den Akten und übernimmt die Voss Projektentwicklung. Reich,
  mächtig, mit Blick über die Stadt aus dem Penthouse am Glockenberg – aber Sarah veröffentlicht trotzdem einen
  Artikel über *ihn*, Tobi verlässt ihn. Bedingung: Wahl „Übernehmen“ und Voss-Vertrauen ≥ 0 oder `buyout`.
- **Ende C – Alles verloren:** Rache an Voss eskaliert, die Polizei sucht Leon, alle Brücken sind abgebrochen. Am
  Bahnhof – wo alles begann – steigt er in den Zug. Bedingung: Wahl „Rache“ oder bei A/B nicht erfüllte Bedingung
  und weniger als zwei Verbündete (Max, Sarah, Tobi ≥ 20).

Nach jedem Ende: **freies Spielen** in Coburg mit allen Freischaltungen; Nebenmissionen bleiben, Story-Marker weg,
Abspann und „Epilog“-Anrufe passend zum Ende.

## 5. Die 35 Hauptmissionen

Format: **Ort** · Ablauf · Erfolg · Belohnung · Übergang. Orte sind reale Orte der Spielkarte.

### Kapitel 1 – Zurück in Coburg (spielbar)

1. **Wieder daheim** · Bahnhof → Spitalgasse → Marktplatz · Filmischer Start am Bahnhofsvorplatz (Leon steigt mit
   Sporttasche aus, innerer Monolog). Zu Fuß zum Markt, unterwegs Kommentare zur Stadt. Am Bratwurststand Erwin:
   Wiedererkennen, Bratwurst bestellen (Dialogwahl: zahlen / „anschreiben wie früher“). Kamera schwenkt auf das große
   Voss-Plakat „Quartier Itzaue – Neue Mitte Coburg 2030“; Erwin erzählt, dass Voss halb Coburg aufkauft. SMS von Max:
   „ALTER?! Erwin sagt du bist zurück?! Komm zu Tobi in die Werkstatt!!!“ · Erfolg: Gespräch mit Erwin beendet ·
   € 50 (Erwins „Willkommensgeld“), Kontakt Erwin · Marker M bei Kfz Weber.
2. **Alte Zeiten** · Kfz Weber (Lackiererei Nord) → Veste Coburg · Wiedersehen mit Max und Tobi (Umarmung, Sticheleien,
   Tobi erinnert an Leons Vater). Max: „Wie früher – wer zuerst an der Veste ist!“ Leon fährt Max' alten Kombi mit
   Max auf dem Beifahrersitz die Serpentinen zum Festungsberg hinauf (Zeitlimit 3:30, Auto muss heil bleiben; Max
   kommentiert Fahrstil, Untertitel während der Fahrt). Oben Blick über Coburg: Gespräch über den Brand, den Vater,
   warum Leon ging. Max bittet um € 200 („nur bis Freitag“) – Entscheidung. · Erfolg: an der Veste ankommen ·
   € 150, Max-Kontakt · Max: „Du brauchst 'ne Bude. Ich kenn da wen.“
3. **Eine Unterkunft** · Judengasse → Hofgarten → Lossaustraße · Besichtigung Altbauwohnung Judengasse bei Frau
   Gundermann (scheitert komisch: keine Haustiere, keine Musik, keine Gäste, kein Leon). Max' Tipp: Herr Kraus,
   Lossaustraße. Kraus ist im Hofgarten Enten füttern – hinlaufen, ihn überreden. Bedingung: beim Einzug der neuen
   Mieterin oben helfen – 3 Umzugskisten aus dem Transporter zur Haustür tragen (E aufnehmen, langsamer gehen,
   nicht rennen sonst fällt sie). Kraus übergibt den Schlüssel (Apartment Lossaustraße gehört Leon zur Miete).
   Wohnung betreten, schlafen. · Erfolg: geschlafen · Wohnung, € 0, Speicherpunkt · Morgens ruft Tobi an.
4. **Der erste Auftrag** · Kfz Weber → Kongresshaus Rosengarten · Tobi hat einen Kurierauftrag: Kisten mit
   Kristallgläsern für einen Empfang der Voss Projektentwicklung. Kleinbus „Weber“ abholen, Ladung heil zum
   Lieferhof des Rosengartens bringen (Ladungsanzeige: jeder Aufprall kostet Glas; Zeitlimit 4:00). Unterwegs ruft Max
   an („Voss? DER Voss? Digga, das ist unser Ticket!“). Am Ziel: Dr. Katharina Lenz nimmt ab. In einer Kiste liegt ein
   versiegelter Umschlag „Gutachten Hochwasser Itzaue – VERTRAULICH“. Entscheidung: lesen oder unberührt abgeben.
   Lenz: „Herr Voss möchte den Fahrer kennenlernen.“ · Erfolg: Abgabe mit ≥ 30 % Ladung · € 300 + Bonus je
   Ladungsprozent · Einladung zu Voss.
5. **Ein interessanter Kontakt** · H&M Spitalgasse → Schloss Ehrenburg → Villa Leopoldstraße · Lenz: „Dresscode,
   Herr Berger.“ Ein Hemd kaufen (echter Modeladen, beliebiges Oberteil außer Hoodie/Shirt reicht nicht → Hemd,
   Pullover oder Jacke). Treffen mit Voss auf dem Schlossplatz vor der Ehrenburg: langes Gespräch mit drei Haltungen.
   Voss lässt Leon seinen Sportwagen zur Villa fahren – „ohne Kratzer, ich möchte sehen, wie Sie mit Verantwortung
   umgehen“. Voss kommentiert Tempo, Unfälle und rote Ampeln. In der Villa: das Angebot – „Fahrer und Mann für
   besondere Aufgaben, € 5.000 im Monat“. Kapitel-Abschluss mit Rückblick. · Erfolg: Ankunft mit Autozustand ≥ 50 % ·
   € 1.000 Handgeld · **KAPITEL 1 ABGESCHLOSSEN** – „Ein Angebot, das sein Leben verändern könnte.“

### Kapitel 2 – Neue Möglichkeiten

6. **Neue Wege** · Max zeigt Leon „sein“ Coburg: Max fährt voraus (KI-Fahrer), Leon folgt ohne den Anschluss zu
   verlieren – Stationen: Albertsplatz (Max' „Büro“ = Café), Ketschengasse (Hehler), Bahnhof (Schließfach). Max stellt
   Leute vor, die später wiederkommen (Hehler Rocco, Taxifahrerin Gül). Erfolg: Folgen ohne > 150 m Abstand.
7. **Gute Geschäfte** · Erster echter Voss-Auftrag: drei Luxuswagen von verschiedenen Orten (Rödental, Neustadt,
   Ahorn) zum Speditionshof Kessler bringen, je Wagen ein Zeitfenster. Erfolg: alle drei geliefert.
8. **Auf vier Rädern** · Voss stellt Leon einen Dienstwagen (Sportwagen) – Tobi baut ihn um. Werkstatt-Minispiel
   (Teile holen: Reifen vom Autohaus Süd, Auspuff vom Händler), danach Testfahrt auf der Rodachtal-Strecke mit Tobi
   als Beifahrer. Freischaltung: Leons Wagen in der Garage.
9. **Unter Geschäftsleuten** · Empfang im Landestheater: Leon begleitet Voss, belauscht Gespräche (zu Personen gehen,
   zuhören), trifft Stadtrat Brandt und Bankdirektor Hellmuth. Max soll Fotos machen – vermasselt es komisch.
10. **Eine offene Rechnung** · Schulden eintreiben bei Bäcker Hofmann (Ketschendorf). Er kann nicht zahlen, weil
    Voss ihm die Miete verdreifacht hat. Entscheidung: verschonen (Leon zahlt selbst) oder einschüchtern. Dragan taucht
    auf, Verfolgungsjagd. **Kapitelabschluss:** Leon sieht in Dragans Wagen das Logo der Voss Projektentwicklung –
    Voss ist nicht so seriös.

### Kapitel 3 – Hinter den Kulissen

11. **Die Journalistin** · Sarah fotografiert Leon beim Kessler-Hof. Verfolgung zu Fuß durch die Altstadt
    (Herrngasse, Judengasse), Leon stellt sie an der Stadtmauer – Wortgefecht, sie gibt ihm ihre Karte.
12. **Unangenehme Fragen** · Treffen im Café Pfannküchle: Sarah zeigt ihre Recherche (Brandserie, Gutachten).
    Gemeinsame Fahrt zum Itzufer, wo das Autohaus Berger stand – Leon sieht die Brandruine zum ersten Mal wieder.
13. **Alte Bekannte** · Jürgen Kessler, Leons Ex-Geschäftspartner aus Nürnberg, ist Voss' Spediteur. Treffen am
    Goldbergsee, Fahrt zu einer Scheune bei Ahorn; Kessler gesteht Angst vor Voss.
14. **Verdächtige Geschäfte** · Nachts in den Kessler-Hof einbrechen, Frachtbriefe fotografieren (Wachleute meiden,
    Taschenlampen-Kegel). Entscheidung: Beweise an Sarah oder an Voss.
15. **Falsche Freunde** · Max benimmt sich seltsam, hat neues Geld. Leon beschattet Max zu einem Treffen mit Dragan.
    **Kapitelabschluss:** Kessler ist verschwunden, sein Wagen ausgebrannt am Callenberg – und Zeugen haben den
    Weber-Kleinbus aus Mission 4 dort gesehen. Leon steht unter Verdacht.

### Kapitel 4 – Kein Zurück

16. **Ärger in Coburg** · Polizeirazzia bei Tobi. Flucht mit dem Kleinbus vor der Polizei (3 Sterne), Kleinbus loswerden.
17. **Unter Beobachtung** · Leon wird verfolgt: Verfolger-Auto erkennen und abschütteln, Wanze in der Wohnung finden.
18. **Der falsche Verdacht** · Alibi beweisen: Überwachungsvideo der Tankstelle besorgen, Zeugin Gül (Taxi) finden.
19. **Eine Entscheidung** · Dragan entführt Max wegen Schulden, gleichzeitig wird Sarahs Quelle bedroht – Leon kann
    nur einen retten (zeitgleiche Marker, Wahl durch Losfahren).
20. **Konsequenzen** · Schießerei am Güterbahnhof, Tobis Werkstatt brennt. **Kapitelabschluss:** In Voss' Akten
    findet Leon seinen eigenen Namen: Grundbuchauszug Autohaus Berger – Leon war von Anfang an Teil des Plans.

### Kapitel 5 – Die Wahrheit

21. **Das große Geschäft** · Leon spielt mit, besucht mit Voss die Baustelle Itzaue, erfährt vom Wegerecht.
22. **Verlorenes Vertrauen** · Tobi hat heimlich seine Werkstatt an Voss verkauft. Streit, Entscheidung verzeihen.
23. **Die Wahrheit kommt ans Licht** · Sarah findet das Original-Gutachten zum Brand von vor fünf Jahren: Brandstiftung,
    Auftraggeber Voss. Gemeinsame Flucht aus dem Redaktionsgebäude.
24. **Ein neuer Verbündeter** · Dr. Katharina Lenz meldet sich, will aussteigen; Leon holt sie bei Schloss Rosenau ab
    und schützt sie vor Dragan.
25. **Der Verrat** · Lenz' Dateien zeigen: Max hat Voss seit Leons Rückkehr informiert (Spielschulden bei Dragan).
    Konfrontation auf der Veste – wo Kapitel 1 die Freundschaft feierte. Entscheidung `maxFate`.

### Kapitel 6 – Alles auf eine Karte

26. **Alte Rechnungen** · Leon besucht das Grab seines Vaters (Friedhof am Glockenberg), dann die Brandruine:
    Erinnerungs-Cutscene; stellt Dragan, der den Brand legte.
27. **Kein einfacher Ausweg** · Voss bietet € 250.000 für die Unterschrift. Entscheidung `buyout`.
28. **Alles verändert sich** · Kessler lebt – festgehalten in Voss' Jagdhütte bei Callenberg. Befreiung.
29. **Zusammenhalt** · Alle Verbündeten versammeln (Sarah, Tobi, Lenz, Kessler, ggf. Max); Plan für die Stadtratssitzung.
30. **Der letzte Auftrag** · Vorbereitung: Server-Kopie bei Voss stehlen, Fluchtwagen bei Tobi parken, Kamera im
    Rathaus platzieren.

### Kapitel 7 – Das Ende einer Geschichte

31. **Der Wendepunkt** · Stadtratssitzung im Rathaus: Voss hat vorgesorgt, der Plan fliegt auf, Sarah wird entführt.
32. **Die Abrechnung** · Verfolgung durch den Landkreis bis zur Baustelle Itzaue, Konfrontation mit Voss.
33. **Nichts bleibt geheim** · Livestream vom Marktplatz bzw. Datenübergabe – je nach Weg.
34. **Letzte Entscheidungen** · Die finale Wahl am Ufer der Itz (Veröffentlichen / Übernehmen / Rache).
35. **Zurück in die Zukunft** · Epilog je Ende (A Werkstatt-Eröffnung, B Penthouse-Ansprache, C Zug am Bahnhof),
    Abspann, Freies Spiel.

## 6. Nebenmissionen (Plan)

- **Kfz Weber** (ab Kapitel 1): Reparatur- und Abschleppaufträge, Teile holen – Geld und Tobi +.
- **Taxi** (im Taxi `F`): Fahrgäste zwischen Sehenswürdigkeiten, Trinkgeld nach Tempo und Fahrstil.
- **Zeitrennen** an der Veste und im Landkreis (bestehende Rennen als „Story-Challenges“ mit Medaillen).
- **Erwins Bratwurst-Lieferdienst**: heiße Würste in 90 s quer durch die Altstadt.
- **Sarahs Fotoaufträge**: Orte im Landkreis finden und fotografieren (Sammelobjekte „Voss-Plakate“: 20 Stück).
- **Immobilien**: bestehende Wohnungen kaufen und einrichten, Miete aus Wohnungen.
- **Besondere Fahrzeuge**: Voss' Oldtimer, Tobis Abschleppwagen, Max' tiefergelegter Kleinwagen.
- **Zufällige Begegnungen**: Anhalterin bei Seßlach, liegengebliebener Bus, Hochzeit am Schloss Rosenau.
