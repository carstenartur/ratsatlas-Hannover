# Ratsatlas Hannover

**109.605 öffentliche Vorgänge aus Stadt Hannover, Region Hannover und dem
Niedersächsischen Landtag auf Karte, in der Liste und auf der Zeitleiste
recherchieren.**

Dieser Ratsatlas übernimmt den veröffentlichten Hannover-RIS-Datenstand der
[Unfallwerkbank](https://carstenartur.github.io/Unfallatlas/) in eine statische
Anwendung. Karte, Fenstersteuerung und Zeitleiste basieren auf Ratsatlas Bonn
von Damian Paderta. **9.502 Vorgänge haben einen Kartenort.** Die Gesamtsuche
umfasst auch die 100.103 Vorgänge ohne Geometrie.
[Ratsatlas Bonn](https://bonn.ratsatlas.de/)

[Technik](TECHNIK.md) · [Datenherkunft und Grenzen](docs/DATEN.md) ·
[Herkunft und Lizenzen](NOTICE.md) · [Bonner Quellstand](docs/UPSTREAM.md) ·
[Code-Lizenz](LICENSE)

## Recherchieren

- In der Suchleiste nach Drucksachennummer, Straße, Hausnummer oder mehreren
  Wörtern aus einem Titel suchen. Die Suche läuft im Browser über den gesamten
  übernommenen Bestand.
- Über **Liste**, **Zeitleiste** und **Vorgang** die Fenster über der Karte ein-
  und ausklappen. **Karte** schließt die Fenster. Auf schmalen Bildschirmen
  lässt sich jeweils ein Inhaltsfenster öffnen.
- Die Karte startet mit den **13 Stadtbezirken** auf grauem Kartenhintergrund.
  Einen Bezirk und danach einen seiner Stadtteile wählen, um die dort
  verorteten Vorgänge zu sehen. Der gewählte Bereich filtert Liste, Karte und
  Zeitleiste. **Ganz Hannover** hebt den Gebietsfilter auf.
- In der Liste **Stadt**, **Region** und **Land** gemeinsam oder einzeln
  auswählen. Unter **Zeitraum und Ortsbezug** lassen sich Datumsgrenzen
  eintragen und die Suche auf verortete Vorgänge beschränken.
- In der Zeitleiste die Verteilung nach Vorgangsdatum erkunden und den Zeitraum
  für Karte und Liste auswählen. **gesamter Bestand** hebt den Zeitfilter auf
  und schließt passende Vorgänge ohne Datum wieder ein.
- Einen Vorgang aus der Liste oder über eine Verknüpfung öffnen. Die Karte
  zoomt auf seine belegten Orte und hebt sie orange hervor. Bei Auswahl über
  die Karte bleibt der Ausschnitt erhalten. Im Vorgangsfenster stehen
  Originalverweise, Ortsbelege, überlieferte Beratungsereignisse und Links zu
  verbundenen Vorgängen.
- Mit **Teilen** die Rechercheadresse einschließlich Suche, Gebiet, Filtern,
  Kartenausschnitt, gewähltem Vorgang und offenen Fenstern kopieren. Unter
  **Quellen** stehen der Datenstand, Herkunft und bekannte Lücken.

Die Unfallanalyse ist weiterhin über den Link zur Unfallwerkbank erreichbar.
Diese Anwendung dient der Recherche in den Rats- und Parlamentsvorgängen.

## Bestand und Kartenorte

| Quellenebene | Vorgänge | Mit Geometrie im Quellpaket | Mit Kartenort im Ratsatlas | Ohne Kartenort im Ratsatlas |
|---|---:|---:|---:|---:|
| Stadt Hannover | 95.535 | 7.969 | 9.467 | 86.068 |
| Region Hannover | 14.055 | 35 | 35 | 14.020 |
| Land Niedersachsen | 15 | 0 | 0 | 15 |
| **Gesamt** | **109.605** | **8.004** | **9.502** | **100.103** |

Die Karte enthält **3.928 Geometrien**. Zu den **3.395 Originalgeometrien**
kommen **533** Kartenobjekte mit eigener Kennung. Die Ergänzung erschließt **1.498 weitere Vorgänge** anhand amtlicher
Hauskoordinaten, Straßenachsen und des belegten Projektstandorts des ehemaligen
Bumke-Areals. Die Suche nach „Bumke“ führt zu 19 Vorgängen in der Nordstadt,
darunter zum Bebauungsplan 1862 und zur Petition für das Gelände. Ein Kartenort
kann zu mehreren Vorgängen gehören. Bei aufgehobenem Zeitfilter sind auch die
16 Vorgänge ohne Datum durchsuchbar. [Verfahren und Grenzen](docs/DATEN.md#wie-die-ergänzten-kartenorte-entstehen)

| Zeitangabe | Bedeutung |
|---|---|
| **8. November 2026** | Überlieferter globaler Quellenprüfstand (`sourceVerifiedAt`). Einzelne Quellen tragen zusätzlich eigene Zeitstände. |
| **13. November 2026** | Jüngstes Vorgangsdatum im übernommenen Bestand |
| **15. November 2026** | Erstellung des veröffentlichten Quellpakets (`provenance.builtAt`) |
| **21. November 2026** | Übernahme in diesen Ratsatlas, dokumentiert in `migration.json` |

Das veröffentlichte Quellpaket ist vollständig übernommen. Die Quelle
kennzeichnet ihre Archivabdeckung als unvollständig. Für einzelne Jahrgänge und
Detailabrufe bestehen Lücken. Der Landtagsbestand umfasst 15 erschlossene
Archivvorgänge. Ältere verifizierte Details behalten ihren ursprünglichen Stand.
Der Import prüft die Integrität des Pakets und die Verknüpfungen darin anhand
der veröffentlichten Dateien.

Das unveränderte Quellmanifest enthält Quellenstatus, Warnungen, Rechtehinweise
und Erhebungsgrenzen. Es liegt zusammen mit allen Quelldateien im versionierten
[Datenarchiv](data/hannover-snapshot.parts.json). Nach dem Entpacken steht es unter
site/data/ris/hannover.json bereit. Details zur Generation und Abdeckung stehen
in [docs/DATEN.md](docs/DATEN.md).

## Lokal starten

Python 3.12 und Node.js 24 entsprechen der CI-Umgebung. Die Anwendung läuft
nach dem Aufbau der lokalen Such-, Karten- und Gebietsdaten als statische Website. Für die
automatisierte Browserprüfung wird zusätzlich Playwright installiert.

~~~bash
python3 -m pip install -r requirements-geo.txt
python3 scripts/snapshot_bundle.py unpack
python3 scripts/enrich_locations.py --source-dir site/data/ris --output-dir site/data/enriched
python3 scripts/build_geography.py --data-dir site/data/enriched
python3 -m http.server --directory site 8000
~~~

Danach [http://localhost:8000/](http://localhost:8000/) öffnen. Die HTML-Datei
direkt aus dem Dateisystem zu öffnen genügt für Module, Worker und Datenabrufe
nicht. Ein aktueller Browser mit JavaScript, Web Workers, Web Crypto und
DecompressionStream wird benötigt. Der Kartenhintergrund wird von
OpenStreetMap geladen; die Recherche verwendet die mitgelieferten Daten.

## Datenstand erneut übernehmen

Der Import liest ausschließlich das bereits veröffentlichte Datenpaket der
Unfallwerkbank. Er schreibt zuerst in ein temporäres Nachbarverzeichnis und
ersetzt den bisherigen Bestand erst nach erfolgreicher Prüfung.

~~~bash
python3 scripts/import_unfallwerkbank.py \
  --source-url https://carstenartur.github.io/Unfallatlas/data/ris/ \
  --output-dir site/data/ris

python3 scripts/import_unfallwerkbank.py --check --output-dir site/data/ris
python3 scripts/snapshot_bundle.py pack
~~~

Ein bereits vollständig heruntergeladenes Quellpaket lässt sich ohne Netz
übernehmen; --source-url dokumentiert dabei seine veröffentlichte Herkunft:

~~~bash
python3 scripts/import_unfallwerkbank.py \
  --source-dir /pfad/zum/vollstaendigen/quellpaket \
  --source-url https://carstenartur.github.io/Unfallatlas/data/ris/ \
  --output-dir site/data/ris
python3 scripts/snapshot_bundle.py pack
~~~

Das Originalmanifest und alle **6.905** referenzierten Gzip-Dateien bleiben
bytegleich. `migration.json` dokumentiert die Zählungen und Prüfsummen des
Quellimports. Nach einem neuen Import die beiden Verortungs- und Gebietsskripte
wie unter **Lokal starten** ausführen. Sie schreiben nach `site/data/enriched/`. Ein späterer
Quellstand kann andere Zahlen haben.

Versioniert werden die vier Teile `data/hannover-snapshot.tar.gz.part01` bis
`part04`, ihr Manifest und die zugehörige SHA-256-Datei. Das Entpackskript setzt
sie automatisch zusammen und prüft jeden Teil sowie das vollständige Archiv.
Das entpackte Verzeichnis site/data/ris/ wird lokal beziehungsweise
in CI bereitgestellt und nicht nochmals einzeln in Git abgelegt. Nach einer
Datenaktualisierung gehören Archivteile, Manifest und Prüfsummendatei in denselben Commit.
Es gibt keinen automatischen Datenabruf.

## Prüfen

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

Die Browserprüfung arbeitet mit dem übernommenen Datenpaket unter dem
Projektunterpfad und erzeugt Bildschirmbilder für Desktop, Tablet und Telefon.

~~~bash
npm ci --ignore-scripts
npx playwright install --with-deps chromium webkit
npm run test:browser
BROWSER_ENGINE=webkit npm run test:browser
~~~

Der CI-Lauf bewahrt diese Bilder und die getrennten Berichte
`chromium/report.json` und `webkit/report.json` im Artefakt
`hannover-browser-qa` auf, auch bei einem fehlgeschlagenen Test. Die Berichte
enthalten die Ergebnisse und Bildnamen; der zugehörige CI-Lauf nennt den
geprüften Commit. Dauerhaft festgehaltene Nachweise stehen unter
[Prüfberichte](docs/QA.md).

## Veröffentlichung

Projektadresse:
[carstenartur.github.io/ratsatlas-Hannover/](https://carstenartur.github.io/ratsatlas-Hannover/).
Der veröffentlichte Stand ergibt sich aus dem letzten erfolgreichen
[Pages-Lauf auf main](https://github.com/carstenartur/ratsatlas-Hannover/actions/workflows/veroeffentlichen.yml?query=branch%3Amain).

Der Workflow [Prüfen und veröffentlichen](.github/workflows/veroeffentlichen.yml)
prüft Pull Requests und Änderungen auf main. Nur ein erfolgreicher Push-Lauf
auf main liefert anschließend site/ an GitHub Pages aus. Das vollständige
Datenarchiv wird davor entpackt. Die ergänzten Orts- und Gebietsdateien werden
für die Auslieferung aus den versionierten Ortsgrundlagen gebaut. Dafür muss im Repository unter
**Settings → Pages → Build and deployment → Source** **GitHub Actions**
eingerichtet sein. Einen erfolgreichen Lauf und die tatsächlich erreichbare
Adresse vor einer Bekanntgabe kontrollieren.

Anwendungsdateien werden mit einer gemeinsamen Versionskennung in ihren URLs
geladen (derzeit `v=kartenorte-20261121-3`). Bei Änderungen an JavaScript oder den
Anwendungsstylesheets diese Kennung in `index.html` und der gesamten
Import-/Worker-Kette erneuern. Relative Modulimporte übernehmen den
Versionsparameter ihres Elternmoduls nicht automatisch. Die Browserprüfung
erfasst deshalb auch die tatsächlichen Worker-Anfragen und verlangt eine
einheitliche, nicht leere Version. Die Datenpfade und geteilten Recherche-URLs
bleiben davon unberührt.

Die geerbte Plesk-Veröffentlichung, IndexNow-Meldungen und Live-Prüfungen gegen
ratsatlas.de sind aus den aktiven Workflows entfernt. Es gibt keinen neuen
Zeitplan und keine Veröffentlichung in ein fremdes Repository.

## Herkunft, Rechte und Betrieb

- Anwendungskomponenten von **Damian Paderta** unter MIT aus Ratsatlas Bonn
  sowie Schriftintegration und Icons aus dem ursprünglichen Ratsatlas-Fork.
  [Bonner Quellstand und Dateizuordnung](docs/UPSTREAM.md)
- Hannover-Datenbestand aus der **Unfallwerkbank** mit den im Quellpaket
  genannten amtlichen Quellen.
  [carstenartur/Unfallatlas](https://github.com/carstenartur/Unfallatlas)
- Straßenachsen aus dem ATKIS Basis-DLM und INSPIRE-Hauskoordinaten aus ALKIS:
  LGLN (2026), bearbeitet, CC BY 4.0. Gebietsgrenzen aus der SKH5:
  Landeshauptstadt Hannover, Bereich Geoinformation, CC BY 4.0.
  [Ortsgrundlagen](data/geocoding/README.md) · [Gebietsgrundlagen](data/geography/README.md)
- Kartenbibliothek: **Leaflet 1.9.4**, lokal mit BSD-2-Clause-Lizenz.
- Schrift: **Inter**, lokal mit SIL Open Font License 1.1.
- Kartenhintergrund: **© OpenStreetMap-Mitwirkende**; Kartenkacheln werden von
  tile.openstreetmap.org abgerufen.

Die **MIT-Lizenz gilt für den Code**. Das Quellpaket führt die Gesamtdaten mit
dem Rechte-Status `not-specified` und enthält die einzelnen Rechte- und
Quellenhinweise. [Herkunft und Lizenzen](NOTICE.md)

Die Instanz gehört zum eigenständigen GitHub-Projekt carstenartur/ratsatlas-Hannover.
Eine Unterstützung dieser Instanz durch Damian Paderta oder Offene Kommunen.NRW
wird damit nicht behauptet. Hinweise zur Technik oder zu falschen Zuordnungen
können im [Projekt](https://github.com/carstenartur/ratsatlas-Hannover)
eingebracht werden. Die [Datenschutzhinweise](site/datenschutz.html) beschreiben
Hosting, Kartenabrufe und teilbare Rechercheadressen.
