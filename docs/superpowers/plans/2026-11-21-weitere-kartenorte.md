# Weitere Kartenorte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Weitere nachvollziehbare Straßen-, Adress-, Kreuzungs- und Gebietsbezüge aus dem vorhandenen Hannover-Bestand erschließen.

**Architecture:** Die ursprünglichen Projektionen bleiben unverändert; `Resolver` ergänzt die abgeleitete Karten- und Suchprojektion. Zwei kleine Hilfsmodule liefern geprüfte Achsschnitte und ausdrücklich benannte amtliche Gebiete. Die Gebietszuordnung berücksichtigt die ausdrücklich bekannte Genauigkeitsstufe.

**Tech Stack:** Python, vorhandenes Shapely 2.1.2, amtliches ATKIS/ALKIS-Verzeichnis, SKH5; bestehende JavaScript-App und GitHub-Actions-Browserprüfung.

**Spec:** `docs/superpowers/specs/2026-11-21-weitere-kartenorte-design.md`

## Global Constraints

- Originaldatenarchiv und Originalgeometrien nicht verändern.
- Nur `hannover-sim`/`city` anhand der Hannover-Ortsgrundlagen ergänzen.
- Quelle, Beleg und Genauigkeit an jeder Ergänzung festhalten.
- Keine pauschale Vererbung von Ortsbezügen; keine Gleichsetzung benannter Einrichtungen mit Straßen.
- Gemeinsamer Kreuzungsbereich maximal 80 m Durchmesser; keine Näherung bei fehlendem Achsschnitt.
- Keine lokalen Browser; Browserprüfung ausschließlich in GitHub Actions.

## Review Focus

- Eine Aufzählungsnummer nach einer Straße darf keine Hauskoordinate werden (15-1137/2011).
- Flexion eines längeren Straßennamens darf nicht dessen anders gelegenen Namensbestandteil treffen.
- Abschnitte/weitere Straßennamen dürfen nicht zum Schnitt zweier unvollständig erkannter Orte werden.
- Aktuelle Einrichtung/Verwaltungsadresse darf weder historischen noch abweichenden Projektstandort ersetzen.
- Gebietsflächen dürfen keine angrenzenden Gebiete oder unbelegten untergeordneten Stadtteile zuordnen.

## Task 1: Direkte Straßen- und Adressbelege

**Files:** `scripts/enrich_locations.py`, `tests/test_enrich_locations.py`.

**Interfaces:** `Resolver.find(row, documents=())` behält die vorhandene Liste von Achtertupeln; `street_matches(title)` liefert weiterhin `(start,end,entry)`. Benötigt `intersection_geometry(first,second)` aus Task 2 und `AreaResolver.find(title,evidence)`/`area_ids` aus Task 3.

- [x] Failing regressions für Stüvestraße/Geschwindigkeitskontrollen, Grunderneuerung mit Artikel, voll bezeichnete ungebräuchliche Straßennamen und Flexionen schreiben.
- [x] Failing regressions für konkrete Einrichtungs-Appositionen und gleiche benannte Einrichtung im Dokument schreiben; Ordnungszahlen und unterschiedliche Standorte bleiben negativ.
- [x] Tests ausführen und fehlendes Verhalten belegen; anschließend eng begrenzte Ortsgrammatik und Adressprüfung implementieren.
- [x] Kreuzungsgrammatik mit genau zwei vollständig erkannten Straßennamen integrieren; Abschnitte und Adress-/Aufzählungsreste ablehnen.
- [x] Präzisere Belege vor Gebiets-Rückfall anwenden; `areaId` bei Gebietsfeatures und Ortsbelegen festhalten, Quellen ergänzen.
- [x] Alle Python-Tests ausführen. Erwartet: alte und neue Positiv-/Negativfälle grün.

## Task 2: Tatsächlicher Achsschnitt

**Files:** neu `scripts/geocoding_geometry.py`, neu `tests/test_geocoding_geometry.py`.

**Interfaces:** `intersection_geometry(first: dict, second: dict) -> dict | None`, Eingaben GeoJSON-LineString/MultiLineString in WGS84; Ausgabe Point/MultiPoint mit ausschließlich tatsächlich vorhandenen Schnittpunkten, deterministisch sortiert/gerundet; sonst `None`.

- [x] Zuerst Tests für kreuzende/nicht kreuzende Achsen, ein kompakter Mehrfachschnitt, zwei getrennte Kreuzungen über 80 m und überlappende Achsen schreiben und scheitern sehen.
- [x] Schnitt mit Shapely implementieren. Geometrisch unklare Fälle ablehnen; keinen Mittel-/Näherungspunkt erfinden.
- [x] Tests ausführen. Erwartet: alle beschriebenen Fälle grün, reale Hannover-Achsen funktionieren.

## Task 3: Ehrliche Gebietsgenauigkeit

**Files:** neu `scripts/geocoding_areas.py`, neu `tests/test_geocoding_areas.py`, `scripts/build_geography.py`, `tests/test_geography.py`.

**Interfaces:** `AreaResolver(boundaries, source)` erhält die Ausgabe von `load_boundaries()`. `find(title: str,evidence: dict)` liefert vorhandene Achtertupel mit `kind='area'`, amtlicher Originalfläche, Genauigkeit „Nur Stadtbezirk bekannt“/„Nur Stadtteil bekannt“, eigener Methode und Original-Titelbeleg. `area_ids` ordnet die ausgegebenen eindeutigen Labels der amtlichen `areaId` zu. Root integriert in `Resolver`; dieses Task ändert `enrich_locations.py` nicht.

- [x] Failing tests für ausdrückliche Gebietsangaben, mehrdeutige/mehrere Gebiete, Sitzungs-/Gremiensuffix und Ortsnamen als bloßer Wortbestandteil schreiben.
- [x] Failing geography tests: Bezirk nur eigener Bezirk, Stadtteil eigener Stadtteil+Elternbezirk, kein benachbartes Gebiet und keine pauschalen Kinder. Falsche `areaId`/abweichende Geometrie ablehnen.
- [x] Parser und gesonderte Gebietszuordnung implementieren; normale Straßen-/Punkt-/Flächenzuordnung unverändert lassen.
- [x] Tests ausführen. Erwartet: neue semantische Zuordnung und vorhandene Geographietests grün.

## Task 4: Vollbestand, Dokumentation und Auslieferung

**Files:** `README.md`, `TECHNIK.md`, `docs/DATEN.md`, `docs/QA.md`, `scripts/browser_smoke.mjs`; erforderliche Laufzeitversionen nur bei Appänderung.

- [x] Originalbestand zu neuer Ergänzung und Gebietszuordnung bauen; Methoden, Nettozugewinn und verbleibende Lücken zählen. Tatsächliche Ergänzungen anhand reproduzierbarer Stichprobe und Gegenbeispiele prüfen.
- [x] Neue Daten-/Genauigkeitsregeln und offene Einrichtungs-/Relationsfragen dokumentieren. Historische Prüfberichte behalten ihre ursprünglichen Zahlen.
- [x] Browserchecks um konkrete neue Orts-/Gebietsbeispiele und neue verifizierte Bestandszahlen ergänzen.
- [ ] Gesamte Python-/Node-Suite und reproduzierbaren Build prüfen; unabhängige Gesamtprüfung durchführen, relevante Fehler beheben.
- [ ] Exakte Git-Objekte über GitHub-App veröffentlichen, PR mit grünem CI zusammenführen; Pages-Lauf und tatsächlich öffentliche Daten überprüfen.
