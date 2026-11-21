# Ratsatlas Hannover – Technik

[Zur Übersicht](README.md) · [Datenherkunft](docs/DATEN.md) ·
[Bonner Quellstand](docs/UPSTREAM.md) · [Lizenzen](NOTICE.md)

Die Anwendung liefert statische Dateien aus site/ aus. Ein Python-Importer
übernimmt das veröffentlichte Hannover-RIS-Paket der Unfallwerkbank. Suche,
Filter, Karte und Detailansicht arbeiten anschließend im Browser. Es gibt
keinen Anwendungsserver, keine Datenbank im Betrieb und keinen API-Schlüssel.

## Dateien und Zuständigkeiten

| Pfad | Aufgabe |
|---|---|
| `site/index.html`, `site/style.css` | Von Bonn übernommene Karten- und Fensterstruktur und Bonner Stylesheet |
| `site/bonn-panels.js` | Fenster, Fokus, Breiten und mobile Navigation, aus der Bonner Anwendung abgeleitet |
| `site/app.js`, `site/hannover.css` | Hannover-Anbindung für Suche, Karte, Vorgangsdetails und Quellenstatus sowie Ergänzungen zur Darstellung |
| `site/timeline.js`, `site/timeline-adapter.js` | Bonner Zeitleistenmodul mit Hannover-Anbindung für Datumsverteilungen und Beratungsereignisse |
| `site/view-state.js` | Validierung und Serialisierung des Ansichtszustands in URLs |
| `site/data.js` | Geprüfter Datenzugriff, Baumabfragen und Detailnachladung |
| `site/search.js`, `site/search-worker.js` | Suche, kombinierte Filter und Datumsverteilungen über den vollständigen Suchindex |
| `site/tokens.css`, `site/fonts/` | Gestaltungsbasis des ursprünglichen Forks und lokale Schrift Inter |
| `site/portal.css` | Früheres Portal-Stylesheet für Datenschutz und 404-Seite |
| `site/vendor/leaflet/` | Leaflet 1.9.4 samt Bildern und Lizenz, lokal ausgeliefert |
| `data/hannover-snapshot.tar.gz.part*`, `data/hannover-snapshot.parts.json`, `data/hannover-snapshot.sha256` | Versioniertes vollständiges Archiv in vier überprüfbaren Teilen |
| `site/data/ris/` | Entpacktes Quellpaket, abgeleitete Such- und Kartendateien, Importnachweis |
| `site/data/enriched/` | Reproduzierbare kombinierte Such- und Kartendaten, ergänzte Ortsbelege und Gebietszählungen |
| `data/geocoding/`, `scripts/enrich_locations.py` | Versioniertes LGLN-Ortsverzeichnis und städtischer Projektmarker, ergänzende Verortung und Offlineprüfung |
| `data/geography/`, `scripts/build_geography.py`, `requirements-geo.txt` | Amtliche SKH5-Flächen, Shapely und Zuordnung der Kartenorte zu Bezirken und Stadtteilen |
| `site/map-geography.js` | Bonner Gebietsnavigation für Hannover mit Flächenfarben, Beschriftung, Legende und Auswahl |
| `scripts/snapshot_bundle.py` | Archiv packen und für lokale Nutzung oder Deployment entpacken |
| `scripts/import_unfallwerkbank.py` | Wiederholbare Übernahme und Offlineprüfung, Python-Standardbibliothek |
| `tests/`, `scripts/browser_smoke.mjs` | JavaScript- und Python-Tests und Browserprüfung |
| `.github/workflows/veroeffentlichen.yml` | Gemeinsamer Prüf- und Pages-Workflow |

Die früheren Portaldateien staedte.json, scripts/kacheln.py, scripts/sitemap.py,
scripts/indexnow.py und deploy/ sind historische Bestandteile des Forks. Sie
gehören nicht zum Build oder Deployment dieser Stadtanwendung. Insbesondere
darf der alte Sitemap-Generator nicht über die Hannover-Sitemap laufen. Der
aktive Workflow ruft keinen dieser früheren Portal- oder Plesk-Schritte auf.

## Quellpaket und Import

Quelle ist
[das veröffentlichte Hannover-RIS-Paket der Unfallwerkbank](https://carstenartur.github.io/Unfallatlas/data/ris/hannover.json).
Der Import übernimmt einen einmal gelesenen Manifeststand. Die darin genannten
Dateien sind über SHA-256-basierte Namen adressiert. Der ursprüngliche Stand
enthält sieben Wurzeln für records, locations, relations, search, geometry,
links und spatial.

Der Importer prüft vor der Installation:

1. Hannover-Schemaversion 2, das Raumindexformat und die Generation aus den
   serialisierten Wurzeldeskriptoren.
2. Zulässige Dateinamen, Typen, Größen, SHA-256-Prüfsummen des entpackten Inhalts,
   Knotenzählungen und sortierte Schlüssel.
3. Erreichbare Kindknoten, Baumgrenzen, zusammenhängende Fortsetzungsseiten und
   die im Quellpaket angegebenen Datei- und Bytezählungen.
4. Datensatz-, Geometrie- und Ebenenzählungen, eindeutige Anwendungs-IDs,
   Geometriezuordnungen und vorhandene Orts-, Ereignis- und Beziehungszählungen.
5. Koordinaten und Bounds der übernommenen Geometrien. Die zusätzliche städtische
   Verortung folgt in einem eigenen Build-Schritt.

Gzip-Dateien werden höchstens bis zur erlaubten entpackten Knotengröße gelesen.
Ein neuer Stand entsteht zunächst in einem temporären Nachbarverzeichnis. Der
bisherige Katalog bleibt während Download, Validierung und Ableitung erhalten.
Erst nach erfolgreicher Prüfung wird das Verzeichnis ausgetauscht; scheitert
das Einsetzen des neuen Verzeichnisses, wird das vorige zurückbenannt. Das ist
ein lokaler Dateivorgang, kein Live-Update einer ausgelieferten Seite.

~~~bash
python3 scripts/import_unfallwerkbank.py \
  --source-url https://carstenartur.github.io/Unfallatlas/data/ris/ \
  --output-dir site/data/ris

python3 scripts/import_unfallwerkbank.py --check --output-dir site/data/ris
python3 scripts/snapshot_bundle.py pack
~~~

--source-dir /pfad/zum/quellpaket liest stattdessen lokale Dateien.
--workers begrenzt parallele Dateizugriffe auf 1 bis 32; die Vorgabe ist 16.
Der Import richtet sich an die veröffentlichte Unfallwerkbank und fragt keine
amtlichen RIS-Server erneut ab. Es gibt keinen geplanten oder regelmäßigen Abruf.

## Archiv und abgeleitete Dateien

Das versionierte Archiv enthält den vollständigen Quellimport einschließlich
seiner ursprünglichen Such- und Kartenprojektion.
Es liegt in vier Teilen `data/hannover-snapshot.tar.gz.part01` bis `part04`
vor. `data/hannover-snapshot.parts.json` verzeichnet die Teile; die SHA-256-Datei
prüft zusätzlich das gesamte Archiv. So bleiben sämtliche
Originaldateien erhalten, ohne sie zusätzlich als Tausende einzelne Git-Dateien
zu versionieren. Zum Starten, Testen oder Veröffentlichen wird das Archiv
zunächst nach site/data/ris/ entpackt:

~~~bash
python3 scripts/snapshot_bundle.py unpack
~~~

Nach einer geprüften Datenaktualisierung erstellt pack das Archiv, seine Teile
und die Prüfsummennachweise neu. Alle Teile und Nachweise müssen gemeinsam
versioniert werden. Das ungeteilte Archiv bleibt ein lokales Zwischenprodukt.

| Entpackte Datei | Inhalt und Integrität |
|---|---|
| hannover.json | Bytegleiches Originalmanifest; enthält Quellenstand, Warnungen, Rechte und Wurzeldeskriptoren |
| hannover.&lt;sha256&gt;.&lt;kind&gt;.json.gz | Alle 6.905 referenzierten Originaldateien, bytegleich übernommen |
| search-index.json.gz | Eine Zeile für jeden Vorgang, auch ohne Geometrie |
| map.geojson.gz | Vorhandene Originalgeometrien mit zugeordneten Anwendungs-IDs |
| migration.json | Importzeitpunkt, Herkunft, Manifestprüfsumme, Generation, Zählungen und Prüfsummen der Ableitungen |

Der Suchindex enthält id, sourceId, title, number, date, type, source, level,
body, mapped und locations. Originaldetails bleiben in den Quellpartitionen.
Die Suchprojektion enthält keine neu erzeugten Zusammenfassungen oder
zusätzlichen Volltexte.

Die Anwendungs-ID ist quellenqualifiziert. 15 Landtagsvorgänge haben im
Quellpaket ältere Kennungen ohne Quellenpräfix; für die Anwendung wird das
Präfix ergänzt. sourceId und das Originalpaket behalten deren ursprüngliche
Kennung. Gleiche Drucksachennummern aus verschiedenen Quellen bleiben separate
Vorgänge. Suffixe und Originalverweise werden nicht vereinheitlicht.

--check liest den installierten Bestand ohne Netz erneut vollständig ein,
prüft die Originalstruktur und vergleicht die reproduzierten Such- und
Kartenprojektionen mit den ausgelieferten Dateien. Der Importzeitpunkt wird
dabei nicht als neuer Quellenprüfstand ausgegeben.

## Ergänzte Projektion und Gebietsdaten

`scripts/enrich_locations.py` liest die geprüfte Quellsuche, die Originalkarte
und die über das Manifest erreichbaren Ortsbeleg-Partitionen. Straßenachsen
und Hausnummern werden mit dem per SHA-256 festgelegten LGLN-Verzeichnis
abgeglichen. Für den Bumke-Standort verwendet der Build den städtischen
Projektmarker und amtliche Belege für die Zuordnung zum Vorhaben. Ergebnisse und
Grenzen der Regeln stehen in der [Datenbeschreibung](docs/DATEN.md#wie-die-ergänzten-kartenorte-entstehen).

Die Ausgaben liegen in `site/data/enriched/`. Das Manifest `enrichment.json`
bindet die Dateien an Generation und SHA-256 des ursprünglichen RIS-Manifests.
Aus den Dateideskriptoren überprüft der Client Größe und Prüfsumme des
entpackten Inhalts. Die Rohdaten und Archivteile gehören weiterhin zum
separat prüfbaren Originalimport.

| Datei | Aufgabe |
|---|---|
| `search-index.json.gz` | Alle Originalzeilen, ergänzt um belegte Ortsnamen und den entsprechenden Verortungsstatus. |
| `map.geojson.gz` | Alle 3.395 ursprünglichen Features sowie 533 zusätzliche Features mit qualifizierten Vorgangs-IDs. |
| `additions.json.gz` | Nach Vorgangs-ID geordnete zusätzliche Ortsbelege, Genauigkeiten und Geometrie-IDs für die Detailansicht. |
| `geography.json.gz` | 13 Bezirke und 51 Stadtteile mit Gebietskennungen, Anzeigegeometrien, Schnittmengen und eindeutigen Vorgangs-IDs. |

`scripts/build_geography.py` prüft den Stand der ergänzten Karte. Ein räumlicher
Index und `intersects` in Shapely ordnen ihre Punkte, Linien und Flächen den
unvereinfachten amtlichen SKH5-Grenzen zu. Je Gebiet werden die Vorgangs-IDs
dedupliziert. Die Darstellungsflächen werden separat vereinfacht. Die Gebietsdatei
enthält neben der Quellgeneration die SHA-256 der ergänzten Kartenprojektion.
[Gebietsgrenzen und Datenstand](data/geography/source.json)

## Suche, Zeitleiste und Details

`AtlasData` in `site/data.js` bietet `init()`, `search(params)`,
`getRecord(id)` und `getMap()`. Der Suchworker durchsucht den vollständigen
Index nach Suchbegriffen, Quellenebenen und Verortung. Bei einem gewählten
Gebiet schränkt die Menge seiner Vorgangs-IDs die Suche vor Datumsverteilung
und Paginierung ein. Aus diesen Treffern
berechnet er Tageszählungen, Monatszählungen nach Quellenebene und die Zahl
der undatierten Treffer. Anschließend wendet er die Datums- oder Jahresgrenzen
an. Diese Grenzen wirken auf Liste und Karte. Die Liste zeigt eine Seite der
zugehörigen Treffer.

Der Adapter übergibt die Zählungen an das Bonner Zeitleistenmodul.
**gesamter Bestand** hebt den Datumsfilter auf und schließt damit die zu Suche,
Quellen und Verortungsfilter passenden undatierten Vorgänge wieder ein. Die
Auswahlspur kann das Datum und überlieferte Beratungsereignisse des geöffneten
Vorgangs anzeigen. Der globale Quellenprüfstand und das jüngste Datum der
Vorgänge werden getrennt geführt. Der Hannover-Index enthält Vorgangsdaten
und die Ereignisse liegen in den Detailpartitionen. Die Zeitleiste verwendet
daher eine Vorgangsachse und die belegte Auswahlspur.

Die Anwendung liest Details bei Bedarf aus den unveränderten Bäumen. Vor der
Verwendung werden gzip-komprimierte Inhalte entpackt und ihre SHA-256-Prüfsummen
kontrolliert. Die Vorgangsansicht zeigt Originalverweise, Ortsbelege,
überlieferte Ereignisse und dokumentierte Beziehungen. Interne Links verwenden
quellenqualifizierte IDs. Ergänzte Geometrien und Nachweise werden aus den
geprüften Projektionen anhand derselben Vorgangs-ID dazugeladen.

Die Karte startet mit grauem OSM-Hintergrund und den 13 Bezirken. Die Auswahl
eines Bezirks zeigt die zugehörigen Stadtteile, die Auswahl eines Stadtteils
seine Kartenorte. Auch beim freien Hineinzoomen sind ab Zoomstufe 14 die
Ortsgeometrien zugänglich. Die Auswahl über Liste oder Vorgangsverknüpfung
passt den Ausschnitt an alle Geometrien des Vorgangs und die geöffneten
Fenster an. Die orange Hervorhebung hat eine dunkle Kontur. Bei einer Auswahl
über die Karte, einem ausdrücklich geteilten Ausschnitt und der Wiederherstellung
über den Browserverlauf bleibt die jeweilige Kameraposition maßgeblich.

## Ansichtszustand und URLs

| Parameter | Inhalt |
|---|---|
| `q`, `ebenen`, `verortet`, `seite` | Suchtext, Quellenebenen, Verortung und Ergebnisseite |
| `gebiet` | Optionaler Gebietsschlüssel, beispielsweise `bezirk:13` oder `stadtteil:18`. |
| `von`, `bis` | Datumsgrenzen im Format `JJJJ-MM-TT` oder vierstellige Jahre aus bestehenden Links |
| `vorgang` | Quellenqualifizierte ID des ausgewählten Vorgangs |
| `lat`, `lng`, `z` | Kartenmittelpunkt und Zoom |
| `fenster` | Offene Fenster (`list`, `detail`, `timeline`). `fenster=` öffnet die freie Karte. |
| `zeitzoom`, `zeitmitte` | Zoomstufe und Mittelpunkt der Zeitleiste |
| `ansicht` | Karten- oder Listenansicht in bestehenden Links |

Der Zustand lässt sich unter dem GitHub-Pages-Unterpfad aus der URL herstellen.
Die Zurück- und Vorwärtsnavigation stellt frühere Zustände wieder her. Der
Fenstercontroller begrenzt die Zahl gleichzeitig offener Fenster bei schmalen
Ansichten. Beim Aufruf einer geteilten Adresse erreichen deren Queryparameter
auch den Hostinganbieter.

Benötigt werden ein aktueller Browser mit ES-Modulen, Web Workers,
DecompressionStream, Web Crypto und Dialogunterstützung sowie JavaScript.
Lokal werden die beiden Projektionen vor dem Start des HTTP-Servers gebaut.

~~~bash
python3 -m pip install -r requirements-geo.txt
python3 scripts/snapshot_bundle.py unpack
python3 scripts/enrich_locations.py --source-dir site/data/ris --output-dir site/data/enriched
python3 scripts/build_geography.py --data-dir site/data/enriched
python3 -m http.server --directory site 8000
~~~

## Darstellung und Datenflüsse

Die Hauptseite verwendet das Bonner Stylesheet `style.css` mit Ergänzungen in
`hannover.css`. Die vorhandene Schrift- und Iconbasis bleibt lokal. Datenschutz
und 404-Seite beziehen ihre Textseitenklassen aus `portal.css`.

Leaflet 1.9.4 liegt lokal. Die Hintergrundkarte lädt Rasterkacheln von
https://tile.openstreetmap.org/. Das ist eine externe Verbindung: IP-Adresse,
Kacheladresse und übliche HTTP-Anfragedaten erreichen den Kartenanbieter.
Die Anwendung übermittelt dorthin keine Suchtexte oder Dokumentinhalte.

Die Fenstersteuerung speichert bei Größenänderungen die Breiten der Liste und
des Vorgangsfensters in `localStorage`. Rechercheparameter und Vorgangsauswahl
stehen in der URL. Der Browser kann geladene Dateien regulär zwischenspeichern
und Rechercheadressen im Verlauf behalten. **Link kopieren** nutzt nach
Betätigung die Zwischenablage. [Datenschutz](site/datenschutz.html)

Die CSP der Hauptseite erlaubt die lokalen Module und Worker sowie
OpenStreetMap-Kachelbilder. Leaflet benötigt dynamische Stile; die Hauptseite
erlaubt deshalb Inline-Stile. Die statischen Textseiten benötigen diese
Erweiterung nicht. HTTP-Sicherheitskopfzeilen werden bei GitHub Pages durch das
Hosting bestimmt; die alte Apache-.htaccess wird dort nicht ausgewertet.

## GitHub Pages und CI

Ziel ist die Projektadresse
[https://carstenartur.github.io/ratsatlas-Hannover/](https://carstenartur.github.io/ratsatlas-Hannover/).
Die normalen Asset- und Datenpfade sind relativ. Anwendungsdateien, Module und
Worker verwenden gemeinsam `v=kartenorte-20261121-2`. Die 404-Seite benutzt dagegen
den bekannten Projektwurzelpfad /ratsatlas-Hannover/, damit sie auch bei
fehlerhaften verschachtelten Adressen ihre Gestaltung und Startseite findet.
Canonical, Sitemap und robots.txt beziehen sich auf die Projektadresse.

Der einzige aktive Workflow heißt **Prüfen und veröffentlichen**:

| Ereignis | Ergebnis |
|---|---|
| Pull Request nach `main` | Quellarchiv entpacken, ergänzte Orts- und Gebietsdaten aufbauen, JavaScript- und Python-Tests, vollständige Offlineprüfung und Browserprüfungen in Chromium und WebKit |
| Push auf `main` | Dieselben Prüfungen. Für das Deployment werden das Archiv entpackt und die ergänzten Orts- und Gebietsdaten gebaut. Der Job liefert `site/` mit MIT-Lizenz und Herkunftshinweisen an GitHub Pages aus. |

Die Prüfmaschine verwendet Node.js 24 und Python 3.12. Die Browserprüfung
verwendet Playwright und speichert die Berichte und Bildschirmbilder im
Workflow-Artefakt `hannover-browser-qa`. Alle verwendeten Actions sind auf
Commit-Hashes festgelegt. Schreibrechte für Pages und das OIDC-Token erhält nur
der Deploymentjob.

GitHub Pages muss im Repository auf **GitHub Actions** als Veröffentlichungsquelle
gestellt sein. Ein vorbereiteter Workflow oder ein erfolgreicher PR-Test
belegt noch kein Live-Deployment. Maßgeblich sind der erfolgreiche Pagesjob und
die tatsächlich erreichbare Projektadresse nach der Zusammenführung.

## Prüfungen und Grenzen

~~~bash
python3 -m pip install -r requirements-geo.txt
python3 scripts/snapshot_bundle.py unpack
python3 scripts/enrich_locations.py --source-dir site/data/ris --output-dir site/data/enriched
python3 scripts/build_geography.py --data-dir site/data/enriched
python3 scripts/enrich_locations.py --check --source-dir site/data/ris --output-dir site/data/enriched
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/import_unfallwerkbank.py --check --output-dir site/data/ris
~~~

Die Tests und die Offlineprüfung ersetzen weder eine neue Prüfung amtlicher
Inhalte noch eine manuelle Bewertung jeder Verortung. Die Angaben
sourceVerifiedAt, builtAt und importedAt haben unterschiedliche Bedeutungen;
die [Datenbeschreibung](docs/DATEN.md) hält sie auseinander.

Das Portal-Prüfprotokoll `pruefung.tsv` und die Bildschirmbilder in `pruefung/`
dokumentieren den historischen Stand des Portals. Die Prüfberichte zur
Hannover-Anwendung führen ihre jeweiligen Stände auf. [Prüfberichte](docs/QA.md)
