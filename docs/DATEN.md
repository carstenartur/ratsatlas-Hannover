# Datenherkunft und Grenzen

[Zur Übersicht](../README.md) · [Technischer Import](../TECHNIK.md)

## Welche Daten übernommen wurden

Der Ratsatlas Hannover übernimmt das öffentlich ausgelieferte Hannover-RIS-Paket
der [Unfallwerkbank](https://github.com/carstenartur/Unfallatlas).
Die Quelle ist [deren hannover.json](https://carstenartur.github.io/Unfallatlas/data/ris/hannover.json).
Die lokale Fassung liegt unverändert im versionierten
[Datenarchiv](../data/hannover-snapshot.parts.json). Nach dem Entpacken steht sie unter
site/data/ris/hannover.json bereit.

| Quellebene | Vorgänge | Mit Originalgeometrie | Ohne Originalgeometrie |
|---|---:|---:|---:|
| Stadt Hannover | 95.535 | 7.969 | 87.566 |
| Region Hannover | 14.055 | 35 | 14.020 |
| Land Niedersachsen | 15 | 0 | 15 |
| **Gesamt** | **109.605** | **8.004** | **101.601** |

Es gibt **3.395 vorhandene Geometrien**. Anzahl der Geometrien, der Ortsbezüge
und der verorteten Vorgänge sind unterschiedliche Größen. Mehrere Vorgänge
können dieselbe Geometrie verwenden. Die Gesamtsuche erfasst jeden Vorgang.

Zum Quellpaket gehören 6.905 unveränderliche Gzip-Dateien mit zusammen 27.264.335
komprimierten und 243.204.894 entpackten Bytes laut geprüfter
provenance.distribution. Die abgeleiteten Such- und Kartendateien kommen
zusätzlich hinzu. Das Repositoryarchiv bewahrt auch diese Original-Gzip-Dateien
bytegleich; die Archivkompression ist eine zusätzliche Speicherebene.

Die übernommene Generation lautet:

~~~text
23e2e6b3f2b0bed02956caf3e8446cb23943e75147be6060cf230dcc4a644ca0
~~~

## Wie die ergänzten Kartenorte entstehen

Der Quellimport bewahrt die verkehrsbezogene Ortsbewertung der Unfallwerkbank.
Beim Aufbau des Ratsatlas werden bislang unverortete **städtische** Vorgänge erneut
auf belegte Maßnahmenorte geprüft. Berücksichtigt werden klare Standortangaben
im Titel und abgegrenzte Ortsbelege im Originaldokument. Jeder zusätzliche Ort
führt Beleg, Methode, Quelle und räumliche Genauigkeit mit.

| Zuordnung | Zusätzlich zum Quellpaket verortete Vorgänge | Bedeutung auf der Karte |
|---|---:|---|
| Amtliche Straßenachse aus dem Titel | 3.514 | Vollständiger Straßenverlauf zur Orientierung; genauer Ort entlang der Straße offen. |
| Amtliche Hauskoordinate aus dem Titel | 288 | Exakte Übereinstimmung von Straße und Hausnummer einschließlich Buchstabenzusatz. |
| Amtliche Hauskoordinate aus dem Dokument | 33 | Ausdrücklicher Projektstandort oder dieselbe benannte Einrichtung mit belegtem Maßnahmenbezug. |
| Hausnummernspanne im Titel | 20 | Bestätigte Endadressen; keine erfundene Flächengrenze oder Zwischenadresse. |
| Bestätigter Bumke-Projektstandort | 19 | Öffentlicher Standortmarker der Landeshauptstadt Hannover. |
| Kreuzung zweier amtlicher Straßenachsen | 183 | Tatsächliche, örtlich verbundene Achsschnitte in einem Bereich bis 80 m Durchmesser. |
| Ausdrücklich genannter Stadtbezirk oder Stadtteil | 2.469 | Amtliche Fläche; nur grober Gebietsbezug bekannt. |
| **Gesamt** | **6.526** | **1.238 ergänzte Kartengeometrien** |

Der Ratsatlas enthält damit **14.530 Vorgänge mit Kartenbezug und 4.633 Kartengeometrien**.
Darunter sind **1.953 reine Stadtbezirksangaben** und
**516 reine Stadtteilangaben**. Diese Zahlen
beschreiben die Genauigkeit offen und werden nicht als punktgenaue Standorte ausgegeben.

Die Erweiterung gegenüber PR #4 gewinnt 5.133 zuvor unkartierte Vorgänge.
Zugleich entfallen 105 ältere Ergänzungen, deren Titel eine
Nummerierung, einen begrenzten Abschnitt, weitere Orte oder einen mehrdeutigen
Einrichtungs-/Parknamen enthalten. Die ursprünglichen Geometrien bleiben unverändert.
Der **Nettozuwachs beträgt 5.028 Vorgänge**.
[Zählungen, Prüfsummen und Beispiele](qa/2026-11-21-weitere-kartenorte/data-audit.json)

Über die Suche nach „Bumke“ sind alle acht Vorgänge mit diesem Namen im Titel,
zehn weitere Titel zum Bebauungsplan 1862 „Oberstraße“ und die Anfrage 0701/2020
erreichbar. Bei der Petition 0673/2020 und der Anfrage belegen amtliche
Dokumente, dass die Neubebauung Gegenstand ist. Der Projektmarker liegt bei
52,3824° N und 9,72521° E. Der Bebauungsplan umfasst zusätzliche Grundstücke.
[Standort und Einzelnachweise](../data/geocoding/bumke.json)

**95.075 Vorgänge bleiben ohne Kartenort.** Unter ihnen haben 7.620 bereits
Ortsbezeichnungen aus dem Quellpaket. Das können bislang unaufgelöste Standorte,
Kontakt- und Empfängeradressen oder unklare Adressspannen sein.
Schulen, Kitas, Haltestellen, Spiel- und Parkplätze können nach einer anderen
Straße benannt sein. Der Name allein genügt deshalb nicht als Beleg für den
Straßenverlauf. Das Verzeichnis
für die Stadt Hannover wird ausschließlich auf städtische Vorlagen angewendet.
Die heutigen Hauskoordinaten belegen die Lage im verwendeten Datenstand und
können bei historischen Vorgängen vom damaligen Zustand abweichen. [Ortsgrundlagen und Lizenz](../data/geocoding/README.md)

Eindeutige Ortsformulierungen benötigen keinen zusätzlichen Themenworttreffer.
Begrenzte grammatische Flexionen beziehen sich auf den vollständigen amtlichen
Namen: „Alten Stöckener Straße“ wird nicht zur anders gelegenen Stöckener Straße.
Benannte Schulen, Haltestellen und Parks bleiben von namensgleichen Straßen
getrennt. Listenpunkte wie „5)“ oder „2. Auslegungsbeschluss“ sind keine Hausnummern.
Straßenabschnitte und unvollständig erkannte Mehrfachorte erhalten keine ganze Achse.

Eine Kreuzung benötigt einen ausdrücklichen Kreuzungsbeleg und genau zwei
vollständig erkannte amtliche Straßen. Alle ausgegebenen Punkte müssen echte
Achsschnitte sein. Neben dem Durchmesser bis 80 m prüft der Build die Verbindung
über die beiden amtlichen Achsen im Rechteck um die Schnittpunkte, erweitert um
40 m je Seite. Fehlende Schnitte, überlappende Achsen, getrennte Kreuzungen und
Verbindungen nur über einen entfernten Umweg bleiben offen. Mehrfachpunkte
bleiben in Übersicht und Auswahl sichtbar und anklickbar.

Eine Dokumentadresse muss den tatsächlichen Vorhabenstandort belegen.
Adressierte Briefe, Post-/Kontaktadressen, Vergleichsorte und frühere Standorte
genügen nicht. Heutige Schulverzeichnisse und verknüpfte Vorlagen werden in dieser
Erweiterung nicht pauschal als Ortsquelle übernommen; sie benötigen eigenständige
Standort- und Zeitbelege. Ausdrücklich bejahte Gebietsangaben sind erst der Rückfall,
wenn kein genauerer Beleg vorliegt. Mehrere unterschiedliche Gebiete, ausgeschlossene
Orte, Streckenendpunkte, Datumszahlen und bloße Sitzungsorte liefern keinen einzelnen
Gebietsbeleg.

## Wie die Gebietszuordnung zählt

Die amtliche SKH5-Gliederung der Landeshauptstadt Hannover umfasst 13 benannte
Stadtbezirke und 51 benannte Stadtteile. Für genaue Orte entscheidet, ob die
Geometrie die Gebietsfläche berührt oder schneidet. Ein Vorgang wird innerhalb
eines Gebiets einmal gezählt und kann mehrere Gebiete berühren.

Bei einer **reinen Gebietsangabe** gilt die ausdrücklich bekannte Ebene: Ein
Stadtbezirk zählt nur zu sich selbst; ein Stadtteil zu sich selbst und seinem
Elternbezirk. Eine gemeinsame Grenzlinie erzeugt keine Nachbarzuordnung und eine
reine Bezirksangabe keine Zuordnung zu allen Stadtteilen. Der Build prüft die
Gebietskennung und die byteinhaltlich gleiche amtliche Geometrie. Flächen bleiben
auch in der Kartenübersicht Flächen und liegen unter präziseren Orten.

Die Zahlen beziehen sich auf die aktuellen Filter. Unverortete Vorgänge und
Kartenorte außerhalb Hannovers bleiben über die Gesamtsuche erreichbar.
[Amtliche Gebietsgrundlagen](../data/geography/README.md)

## Drei verschiedene Zeitstände

| Feld | Überlieferter Wert | Aussage |
|---|---|---|
| provenance.sourceVerifiedAt | 2026-11-08T17:02:48.611Z | Globaler Quellenprüfstand des Pakets |
| provenance.builtAt | 2026-11-15T18:32:00.272Z | Erstellung dieses veröffentlichten Quellpakets |
| migration.importedAt | 2026-11-21T06:09:32.286Z | Übernahme in Ratsatlas Hannover |

generatedAt entspricht in diesem Manifest dem globalen Quellenprüfstand.
Einzelne sourceStatuses enthalten zusätzliche eigene Abrufzeitpunkte, unter
anderem den Landtagsarchivabruf vom 10. November. Diese Angaben sind keine
Behauptung, dass am Importtag sämtliche amtlichen Dokumente erneut geprüft wurden.

## Abdeckung der amtlichen Quellen

Die Quelle meldet coverage.complete: false. Ihr Erhebungsrahmen reicht vom
1. Januar 1999 bis zum 15. November 2026; damit ist keine lückenlose Abdeckung
jedes Tages, jeder Quelle oder jedes amtlichen Archivs zugesichert.

| Quelle | Was der übernommene Status aussagt |
|---|---|
| Hannover SIM | 95.535 städtische Vorgänge; Status partial; historische Quellenarbeit ist fortsetzbar |
| Region Hannover RIS | 14.055 öffentlich gelistete Vorlagen, davon laut Quelle 14.051 Details geprüft; Status partial |
| Niedersächsischer Landtag | 15 Vorgänge aus einem begrenzten Archivabruf; Status partial |
| Ergänzende RSS- und Katalogquellen | Rollierende Ausschnitte oder einzelne Partitionen; keine Archivvollständigkeit belegt |

Die Erhebungsfortsetzung nennt noch offene Jahrgänge **2004, 2007, 2008, 2024
und 2025**. Die Warnungen umfassen nicht verfügbare Detailabrufe sowie Fälle,
in denen Drucksachennummern oder Beratungsdaten nicht zu den erwarteten
Quellenangaben passen. Vier Regionsvorlagen sind nur mit Listenmetadaten
indexiert. Außerdem nennt das Paket 3.317 derzeit nicht verfügbare Detailabrufe,
für die frühere verifizierte Details beibehalten wurden. Diese Warnungen dürfen
nicht zu einer einzigen Zahl fehlender Vorgänge addiert werden: Sie beschreiben
unterschiedliche, möglicherweise überlappende Erhebungsschritte.

Alle ursprünglichen Warnungen und Quellenstatus bleiben im Manifest. Auch ein
dokumentierter fehlgeschlagener Aktualisierungsversuch ändert den
Quellenprüfstand nicht. Ein späterer Import übernimmt einen neuen Stand nur,
wenn das veröffentlichte Paket seine Integritätsprüfung besteht.

## Identität, Belege und Darstellungsgrenzen

Originalkennungen, Drucksachensuffixe und Quellenverweise bleiben im Quellpaket
erhalten. Die Anwendung verwendet quellenqualifizierte IDs. Bei den 15 älteren
Landtagskennungen ohne Präfix ergänzt sie das Quellenpräfix nur in ihrer
Suchprojektion; sourceId enthält weiterhin die Originalkennung.

Eine politische Quellenebene ist kein genauer Wirkungsort. Ein Stadt-, Regions-
oder Landesvorgang erhält einen Kartenort nur über eine konkrete Zuordnung.
Die Vorgangsansicht verbindet die ursprünglichen Ortsbelege mit den ergänzten
Nachweisen. Die neue Verortung verwendet keine automatische Übertragung von
Koordinaten auf verwandte Vorgänge.

Die Suche berücksichtigt die bereitgestellten Suchfelder und Ortsbezeichnungen.
Sie durchsucht nicht automatisch alle verlinkten PDFs oder vollständigen
amtlichen Archive. Vorhandene Beratungsereignisse und Beziehungen können in
den Details nachgeladen werden. Fehlende Daten beweisen weder das Fehlen einer
Beratung noch das Ausbleiben einer Entscheidung. Maßgeblich bleibt das verlinkte
amtliche Original.

## Rechte und Nachnutzung

Das Quellpaket nennt provenance.rights.status: not-specified und license: null.
Es enthält Namensnennungen für Landeshauptstadt Hannover, Region Hannover und
den Niedersächsischen Landtag sowie einen besonderen Rechtehinweis zu
Landtagsdokumenten. Diese Aussagen werden als Herkunftsdaten unverändert
erhalten; der Ratsatlas erklärt damit keine einheitliche Lizenz für sämtliche
Daten oder Dokumente.

Die MIT-Lizenz des Anwendungscodes gilt nicht automatisch für Ratsdaten,
PDFs, Karten und Schriftdateien. Für eine Nachnutzung sind die jeweiligen
Quellen- und Rechtehinweise zu berücksichtigen. Die getrennte Zuordnung der
Komponenten steht in [NOTICE.md](../NOTICE.md).
