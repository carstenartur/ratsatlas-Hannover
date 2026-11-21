# Kartenorte und Bonner Kartenverhalten

## Auftrag und Befund

Carstens bestehender Auftrag ist die Übernahme der sinnvollen Bonner Anwendungsteile in den Hannover-Fork. Die Rückmeldung nach der ersten Veröffentlichung konkretisiert drei fehlende Eigenschaften: eine vergleichbare Kartenübersicht, die Verortung eindeutig örtlicher Vorgänge (Beispiel ehemaliges Bumke-Gelände) und das direkte Hinzoomen mit hervorgehobenen Geometrien bei der Auswahl.

Die bisherige Anwendung zeichnet alle Quellgeometrien gleichzeitig, übernimmt verkehrsbezogene Ausschlüsse aus der Unfallwerkbank und verschiebt die Karte nur über einen zusätzlichen Knopf. Das sind Integrationslücken des bestehenden Auftrags.

## Umsetzung und Abwägung

Die vorhandene statische Anwendung bleibt die Basis. Bonns tatsächliche Gebietsnavigation und Darstellungsmuster werden für amtliche Hannover-Grenzen übernommen. Ein vollständiger Austausch durch die Bonn-Anwendung würde unpassende Bonn-Dienste und Daten voraussetzen. Eine rein optische Entsättigung würde die überladene Geometrieübersicht nicht lösen.

Der unveränderte Quellsnapshot bleibt separat prüfbar. Ein reproduzierbarer ergänzender Datenstand erschließt Ortsangaben anhand eines festgehaltenen amtlichen Straßen-/Hausnummernverzeichnisses und belegter benannter Orte. Ein ungeprüftes Gleichsetzen jedes Namensfundes mit einem Ort ist ausgeschlossen. Die Ergänzung wird beim Build erzeugt; es sind keine Browseranfragen an Geocoder nötig.

## Anforderungen

- Alle 109.605 Originalvorgänge und ihre qualifizierten Kennungen bleiben erhalten. Die bestehenden 6.905 Quelldateien und das Quellarchiv bleiben bytegleich.
- Neue Ortszuordnungen werden als Ergänzung mit Quelle, Beleg, Methode und räumlicher Genauigkeit ausgewiesen. Ein Projektpunkt ist keine Grundstücksfläche; eine Straßenachse ist keine Hausnummer.
- Verkehrliche Relevanz ist keine Voraussetzung für einen Ort im Ratsatlas. Private Kontakt-/Absenderadressen und mehrdeutige Namen werden nicht automatisch übernommen. Hannover-Stadtdaten werden nicht auf unqualifizierte Regions-/Landesorte angewandt.
- Bumke-Areal und Bebauungsplan 1862 werden nur bei belegtem Sachbezug verknüpft; keine pauschale Weitergabe von Orten an alle verwandten Vorgänge.
- Die Karte beginnt mit grauem OSM-Hintergrund und den 13 amtlichen Stadtbezirken. Der Drilldown zeigt 51 Stadtteile und anschließend die betroffenen Orte. Alle Vorgänge, auch unverortete und außerhalb Hannovers gelegene, bleiben über die Gesamtsuche erreichbar.
- Gebietsfilter gelten konsistent für Karte, Liste und Zeitleiste. Mehrfach berührte Gebiete dürfen denselben Vorgang jeweils einmal zählen; die Gebietsanzahlen sind nicht additiv. Amtliche Grenzen und Kartenquellen werden genannt.
- Auswahl aus Liste oder Verknüpfung zeigt automatisch alle zugehörigen Geometrien im freien Kartenbereich und hebt sie kontrastreich hervor. Die Auswahl eines Vorgangs im Kartenpopup bewahrt den aktuellen Kartenausschnitt; beim Öffnen darf das Popup in den sichtbaren Bereich rücken. Ein explizit gespeicherter Kartenausschnitt und Zurück/Vorwärts bleiben maßgeblich. Späte Detailantworten dürfen keine neuere Auswahl verschieben.
- Bestehende Links bleiben lesbar. Neue Gebietsfilter werden in Teilen, Reload und History erhalten. Mobile Fenster bleiben bedienbar; der Knopf „Auf Karte zeigen“ bleibt ein direkter Weg zur freien Karte.
- Browserprüfungen laufen im vorhandenen GitHub-Workflow in Chromium und WebKit. Keine lokale Browserausführung nach der früheren Ablehnung. Tatsächliche Bildschirmbilder prüfen die Kartenübersicht und Auswahl.

## Abnahme

Gezielte Regressionen für Punkt, Linie, Polygon, mehrere Ortsbezüge, wiederholte Auswahl, späte Antwort, explizite Link-Kamera und History; Verortungsfälle für Bumke, eindeutige Straße/Hausnummer sowie Gegenbeispiele; Gebietsgrenzen, mehrfach berührte Gebiete und Quellenfilter; vollständige Datenprüfung, beide Browser, mobile Sichtprüfung und abschließender Live-Test.
