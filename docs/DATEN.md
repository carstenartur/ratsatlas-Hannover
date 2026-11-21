# Datenherkunft und Grenzen

[Zur Übersicht](../README.md) · [Technischer Import](../TECHNIK.md)

## Welche Daten übernommen wurden

Der Ratsatlas Hannover übernimmt das öffentlich ausgelieferte Hannover-RIS-Paket
der [Unfallwerkbank](https://github.com/carstenartur/Unfallatlas).
Die Quelle ist [deren hannover.json](https://carstenartur.github.io/Unfallatlas/data/ris/hannover.json).
Die lokale Fassung liegt unverändert im versionierten
[Datenarchiv](../data/hannover-snapshot.parts.json). Nach dem Entpacken steht sie unter
site/data/ris/hannover.json bereit.

| Ebene | Vorgänge | Mit Geometrie | Ohne Geometrie |
|---|---:|---:|---:|
| Stadt Hannover | 95.535 | 7.969 | 87.566 |
| Region Hannover | 14.055 | 35 | 14.020 |
| Land Niedersachsen | 15 | 0 | 15 |
| **Gesamt** | **109.605** | **8.004** | **101.601** |

Es gibt **3.395 vorhandene Geometrien**. Anzahl der Geometrien, der Ortsbezüge
und der verorteten Vorgänge sind unterschiedliche Größen. Mehrere Vorgänge
können dieselbe Geometrie verwenden. Vorgänge ohne Geometrie bleiben im Suchindex;
es werden keine künstlichen Punkte hinzugefügt.

Zum Quellpaket gehören 6.905 unveränderliche Gzip-Dateien mit zusammen 27.264.335
komprimierten und 243.204.894 entpackten Bytes laut geprüfter
provenance.distribution. Die abgeleiteten Such- und Kartendateien kommen
zusätzlich hinzu. Das Repositoryarchiv bewahrt auch diese Original-Gzip-Dateien
bytegleich; die Archivkompression ist eine zusätzliche Speicherebene.

Die übernommene Generation lautet:

~~~text
23e2e6b3f2b0bed02956caf3e8446cb23943e75147be6060cf230dcc4a644ca0
~~~

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
oder Landesvorgang bekommt deshalb nicht automatisch eine Geometrie. Die Karte
übernimmt ausschließlich die vorhandenen Geometrien und Zuordnungen. Belege
und Genauigkeitsangaben stammen aus dem Quellpaket; der Import ist keine neue
fachliche Abnahme dieser Verortungen.

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
