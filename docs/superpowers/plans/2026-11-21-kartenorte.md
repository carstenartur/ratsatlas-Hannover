# Kartenorte und Bonner Kartenverhalten – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Die drei gemeldeten Integrationslücken nachvollziehbar korrigieren.

**Architecture:** Unveränderter Quelldatenstand plus reproduzierbare, belegte Ortsanreicherung. Gemeinsame abgeleitete Such-/Kartenprojektion mit räumlichen Gebietszuordnungen; tatsächliche Bonner Kartenkomponenten für Übersicht und Auswahl.

**Tech Stack:** Statisches JavaScript, Leaflet, Python, vorhandene Node-/Python-Tests und Playwright in GitHub Actions. Shapely für reproduzierbare Geometrieschnitte; OGR nur zur einmaligen Aufbereitung der amtlichen Grenzen.

**Spec:** `docs/superpowers/specs/2026-11-21-kartenorte.md`

## Global Constraints

- Alle 109.605 Originalvorgänge und ihre qualifizierten Kennungen bleiben erhalten. Die bestehenden 6.905 Quelldateien und das Quellarchiv bleiben bytegleich.
- Neue Ortszuordnungen werden als Ergänzung mit Quelle, Beleg, Methode und räumlicher Genauigkeit ausgewiesen.
- Keine lokale Browserausführung nach der früheren Ablehnung; Browserprüfungen über CI und zugelassenen Browser.
- Keine ungeprüften Namenszuordnungen, privaten Kontaktadressen oder pauschale Vererbung über verwandte Vorgänge.
- Bestehende Links bleiben lesbar; Quellen-/Zeitfilter und exakte Originalgeometrien bleiben erhalten.

## Review Focus

- Späte Detailantworten, wiederholte Auswahl und gespeicherte Kartenausschnitte: Aufgabe 1.
- Straßenname zugleich Stadtteil/Institution, fehlende Hausnummer und fremde Kommune: Aufgabe 2.
- Gemischte alte/neue Daten, falsche Zählwerte, Quelldateiveränderungen: Aufgaben 2 und 4.
- Linien über Gebietsgrenzen, Mehrfachorte und Orte außerhalb der Stadt: Aufgabe 3.
- Mobile Fenster, vergrößerte Panels, Gebiet plus Zeit-/Quellenfilter und History: Aufgaben 1, 3 und 4.

### Task 1: Auswahl und Kartenfokus

**Files:** `site/app.js` (Auswahl/Highlight/Fokus), ggf. fokussiertes Hilfsmodul, `tests/map-selection.test.mjs`, Browserregression später in Aufgabe 4.

**Interfaces:** `selectRecord(id, options)` unterscheidet Liste/Verknüpfung von Kartenklick. `highlightRecord(data)` zeichnet alle `data.features` in einer eigenen nichtinteraktiven Ebene. Kameraanpassung arbeitet unabhängig vom Schließen der Fenster.

- [ ] Rote Regression an den tatsächlichen Ereignispfaden beobachten: Punkt, Linie, Polygon, mehrere Geometrien; Kartenposition bleibt bisher unverändert.
- [ ] Auswahlabsicht, gepaddete Kartengrenzen und sichtbare Hervorhebung implementieren. Erneuter Klick fokussiert erneut; veraltete Antworten haben keine Wirkung.
- [ ] Tests für explizite Kamera, History und unverortete Vorgänge grün ausführen; `npm test`.
- [ ] Diff und Testbelege prüfen.

### Task 2: Belegte allgemeine Verortung

**Files:** `scripts/enrich_locations.py`, `data/geocoding/`, `tests/test_enrich_locations.py`. Keine Änderungen des Quellimports/Quellarchivs.

**Interfaces:** CLI `--source-dir site/data/ris --output-dir site/data/enriched`. Ausgabe `enrichment.json` mit `schemaVersion:1`, `sourceGeneration`, `sourceManifestSha256`, `totals`, `sources`, `derived` für `searchIndex`, `map`, `additions`. Deskriptoren haben `path`, `sha256`, `bytes`, `compressedBytes`. Jeder Nutzinhalt trägt `generation` des Quellsnapshots. `additions.records` ist nach qualifizierter Vorgangs-ID indiziert, mit `locations` und `geometryIds`. Such-/Kartenprojektion enthält Originale plus Ergänzungen; neue Feature-Properties enthalten `geometryId`, `recordIds`, `label`, `accuracy` und Provenienz.

- [ ] Rote Tests für belegtes Bumke-Areal, Straße mit genauer Hausnummer, eindeutige Straßenmaßnahme und negative Mehrdeutigkeiten schreiben und ausführen.
- [ ] Amtliches Ortsverzeichnis festhalten und prüfbare Sachbezüge erschließen. Keine Koordinaten erfinden; klare Präzisionsklassen.
- [ ] Ergänzte Projektionen deterministisch erzeugen und Gesamtzahlen, Originalfelder sowie Originalgeometrien abgleichen.
- [ ] Python-Suite und Vollbestandsprobe ausführen; Treffergewinne und verbleibende Grenzen dokumentieren.

### Task 3: Bonner Gebietsübersicht

**Files:** `data/geography/`, `scripts/build_geography.py`, `requirements-geo.txt`, `site/map-geography.js`, `tests/map-geography.test.mjs`, `tests/test_geography.py`.

**Interfaces:** CLI `--data-dir site/data/enriched` ergänzt `enrichment.json.derived.geography`. Nutzinhalt `generation`, `mapSha256`, `sources`, `features` (GeoJSON): Properties `areaId`, `kind`, `name`, `parentId`, `geometryIds`, `recordIds`. Gebietsschlüssel `bezirk:01` / `stadtteil:01`; unbenannte Nullflächen ausgeschlossen. Das JS-Modul konsumiert diese Daten, aktuelle Treffer-IDs und Gebietsauswahl; meldet Auswahl/Reset an die Anwendung. Root integriert Formular, State und Suchfilter nach der Modulabgabe.

- [ ] Amtliche SKH5-Grenzen inklusive Lizenz und Prüfsumme festhalten; unvereinfachte Daten für Zuordnung, vereinfachte Anzeige.
- [ ] Rote räumliche Tests für grenzüberschreitende Linie, Mehrfachorte, Duplikate und Außenpunkte.
- [ ] Exakte Schnittmenge und eindeutige Gebietszuordnung erzeugen; 13 Bezirke und 51 Stadtteile prüfen.
- [ ] Bonner Flächenfarben, Beschriftung, Auswahl und Drilldown in einem begrenzten Modul übernehmen; Auswahl per Tastatur ermöglichen.
- [ ] Geometrie- und Modultests ausführen; Attribution und Datenbindung prüfen.

### Task 4: Integration, Sichtprüfung und Veröffentlichung

**Files:** `site/data.js`, `site/search-worker.js`, `site/search.js`, `site/view-state.js`, `site/index.html`, `site/hannover.css`, `site/app.js` (Integration), Workflow, README, TECHNIK, DATEN, UPSTREAM, QA, Browser-Smoke.

- [ ] `AtlasData` erhält optional `enrichmentUrl`, prüft Bindung an Quellsnapshot und lädt ergänzte Projektionen; Originalzugriff bleibt für Datenintegrität verfügbar.
- [ ] Ergänzte Detailorte, Zählungen und Herkunft sichtbar machen. Gebiet vor Paginierung und Histogramm filtern; URL-State wiederherstellen.
- [ ] Build-Schritte für Ergänzung und Gebiete in Prüf- und Pages-Job einbinden. Gemeinsame Assetversion aktualisieren.
- [ ] Vollständige Node-/Python-/Archivprüfung und gezielte Browserregressionen; reale Screenshots von Übersicht, Bumke, Linie und Telefon prüfen.
- [ ] Unabhängiges Review und Korrekturen; PR mit Ergebniszahlen und Grenzen, erfolgreicher CI-Lauf, Merge und Pages-Veröffentlichung.
- [ ] Öffentliche Anwendung nach Deployment prüfen, PR-/QA-Nachweise aktualisieren und Ergebnis erklären.
