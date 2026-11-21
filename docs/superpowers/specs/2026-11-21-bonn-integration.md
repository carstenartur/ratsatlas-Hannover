# Bonner Anwendung im bestehenden Ratsatlas Hannover

## Auftrag und Entscheidung

Carsten hat am 21. November 2026 ausdrücklich beauftragt, sinnvolle Bestandteile
von Ratsatlas Bonn in seinen bestehenden Ratsatlas-Fork zu integrieren und den
abweichenden Teil der Anwendung zu entfernen. Das bestehende Repository und
seine Veröffentlichung bleiben das Ziel. Die zuvor diskutierte Möglichkeit
eines neuen Forks wird damit nicht verfolgt.

## Ergebnis

Die Startseite wird zur Bonner Kartenanwendung mit vollflächiger Karte,
schwebender Navigation, einklappbarer Liste, Vorgangsdetails und der echten
Bonner Zeitleiste. Die vorhandene Karten-/Listen-Kacheloberfläche und ihr
Stylesheet entfallen. Übernommene Bestandteile werden mit festem Ursprung
`daimpad/ratsatlas-bonn@f8850008e81825ae79be49ca7f3441b928a1858b`, Lizenz und
örtlichen Änderungen dokumentiert.

Die Integration übernimmt das Bonner Stylesheet und Zeitleistenmodul sowie die
benötigte HTML-Struktur und Fenster-/Fokus-/Größensteuerung aus Bonn. Eine kleine
Hannover-Anbindung verbindet diese Teile mit dem bestehenden Datenzugriff.
Bonner Haushalt, Statistik, Ortsrecht, Beteiligungsfristen, KI und zusätzliche
Geodaten werden ohne passende Hannover-Daten nicht als nutzbare Menüpunkte
ausgeliefert. Es entsteht eine einzige Anwendung.

## Bindende Anforderungen

- Alle 109.605 importierten Vorgänge bleiben erhalten: Stadt 95.535, Region
  14.055, Land 15. Auch die 101.601 Vorgänge ohne Geometrie sind durchsuchbar.
- Das Originalpaket, dessen Prüfsummen, Importer und Quellenstände bleiben
  unverändert. Vollständiger Paketimport bedeutet keine Archivvollständigkeit.
- Quellenqualifizierte IDs bleiben technisch maßgeblich. Drucksachennummern
  sind Anzeigefelder; gleiche Nummern verschiedener Quellen dürfen nicht
  kollidieren. Landtags-Originalkennungen bleiben sichtbar.
- Die 3.395 Originalgeometrien werden erhalten, einschließlich Linien und
  Flächen. Keine Umwandlung aller Orte in Straßenmittelpunkte, keine
  erfundenen Orte. Vorhandene Hausnummern und Ortsbelege bleiben sichtbar.
- Suche nach Drucksache, Straße, mehreren Begriffen, Quellenebene, Zeitraum
  und Verortung bleibt erhalten. Suchvorgänge dürfen nachfolgende Eingaben
  nicht überschreiben.
- Originalverweise, vorhandene Ereignisse und navigierbare Beziehungen
  zwischen Vorgängen bleiben vorhanden; Anfrage/Antwort 1047/2026 und
  Gustav-Adolf-Straße dienen als reale Abnahmefälle.
- Die Bonner Zeitleiste zeigt aggregierte Datumsverteilungen aus dem gesamten
  Suchbestand und filtert die Ergebnisse. Sie lädt dafür nicht alle Details.
  Die 16 undatierten Vorgänge bleiben bei aufgehobenem Datumsfilter enthalten.
  Quellenprüfstand und jüngstes Vorgangsdatum sind unterschiedliche Angaben.
- Teilen und Browsernavigation erhalten Suchtext, Quellen, Datum/Jahr,
  Verortungsfilter, ausgewählten Vorgang, Karte und offene Fenster. Bestehende
  Hannover-Links funktionieren weiterhin.
- Auf schmalen Bildschirmen ist höchstens ein Inhaltsfenster gleichzeitig
  offen. Karte und Navigation bleiben bedienbar. Desktop, Tablet und Telefon
  werden mit realen Daten visuell geprüft; soweit verfügbar auch WebKit.
- Fehlende oder beschädigte Daten führen zu einer sichtbaren Fehlermeldung
  mit Wiederholungsmöglichkeit. Quellen- und Datenstatus bleibt erreichbar.

## Technische Grenze

`AtlasData` bleibt der überprüfende Datenzugriff. `SearchIndex` liefert
zusätzlich Tages-/Monatszählungen vor dem Datumsfilter. Das Bonner
Zeitleistenmodul erhält diese Aggregate über einen Adapter; lokale Termine,
Wahlperioden oder Rechtsfolgen werden nicht erfunden. Eigene Hannover-CSS
beschränkt sich auf zusätzliche Quellen-/Status-/Filterelemente und nötige
Anpassungen an die übernommenen Fenster.

## Abnahme

Bestehende Daten- und Importprüfungen; gezielte neue Tests für Datum,
Zeitleistenaggregation und teilbaren Zustand; reale Browserabläufe unter
dem Repository-Unterpfad; unabhängige Code- und Bildprüfung; anschließend
Veröffentlichung über den bestehenden GitHub-Pages-Ablauf.
