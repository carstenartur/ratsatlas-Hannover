# Ratsatlas Hannover

**109.605 öffentliche Vorgänge aus Stadt Hannover, Region Hannover und dem
Niedersächsischen Landtag gemeinsam recherchieren – mit Originalquellen,
Ortsbelegen und Karte.**

Dieser Ratsatlas übernimmt den veröffentlichten Hannover-RIS-Datenstand der
[Unfallwerkbank](https://carstenartur.github.io/Unfallatlas/) in eine eigenständige
statische Anwendung. Alle Vorgänge bleiben durchsuchbar, auch ohne Kartenort.
Die Gestaltung beruht auf [Ratsatlas von Damian Paderta](https://ratsatlas.de/).

[Technik](TECHNIK.md) · [Datenherkunft und Grenzen](docs/DATEN.md) ·
[Herkunft und Lizenzen](NOTICE.md) · [Code-Lizenz](LICENSE)

## Recherchieren

- Nach Titel, Drucksachennummer oder Ortsbezeichnung suchen. Die Suche läuft im
  Browser über den gesamten übernommenen Bestand.
- **Stadt**, **Region** und **Land** gemeinsam oder einzeln auswählen und den
  Zeitraum nach Jahren eingrenzen.
- Bei Bedarf nur verortete Vorgänge anzeigen. Die Karte zeigt die vorhandenen
  Geometrien; Vorgänge ohne Geometrie bleiben in der Liste erreichbar.
- Einen Vorgang öffnen: Originalverweise, Ortsbelege, vorhandene Beratungsereignisse
  und dokumentierte Beziehungen stehen in der Detailansicht.
- Mit **Ansicht teilen** einen Link zu Suche, Filtern, Vorgang und Kartenausschnitt
  weitergeben. Auf schmalen Bildschirmen zwischen **Liste** und **Karte** wechseln.
- Unter **Datenstand** die Herkunft, Zeitstände und bekannten Lücken nachlesen.

Die Unfallanalyse ist weiterhin über den Link zur Unfallwerkbank erreichbar.
Diese Anwendung dient der Recherche in den Rats- und Parlamentsvorgängen.

## Übernommener Bestand

| Quellenebene | Vorgänge | Mit vorhandener Geometrie | Ohne Geometrie |
|---|---:|---:|---:|
| Stadt Hannover | 95.535 | 7.969 | 87.566 |
| Region Hannover | 14.055 | 35 | 14.020 |
| Land Niedersachsen | 15 | 0 | 15 |
| **Gesamt** | **109.605** | **8.004** | **101.601** |

Die 8.004 verorteten Vorgänge teilen sich **3.395 Geometrien**. Ein Vorgang kann
mehrere Ortsbezüge haben; eine Geometrie kann zu mehreren Vorgängen gehören.
Die Übernahme erzeugt keine neuen Koordinaten, Mittelpunktmarkierungen oder
politischen Bewertungen.

| Zeitangabe | Bedeutung |
|---|---|
| **8. November 2026** | Überlieferter globaler Quellenprüfstand (sourceVerifiedAt); einzelne Quellen tragen zusätzlich eigene Zeitstände |
| **15. November 2026** | Erstellung des veröffentlichten Quellpakets (provenance.builtAt) |
| **21. November 2026** | Übernahme in diesen Ratsatlas; genauer Zeitpunkt in migration.json |

**Vollständig übernommen ist das veröffentlichte Quellpaket, nicht das amtliche
Gesamtarchiv.** Die Quelle kennzeichnet ihre Abdeckung als unvollständig. Für
einzelne Jahrgänge und Detailabrufe bestehen Lücken; der Landtagsbestand umfasst
nur 15 erschlossene Archivvorgänge. Ältere verifizierte Details bleiben mit ihrem
ursprünglichen Stand erhalten. Der Import prüft Integrität und Verknüpfungen des
Pakets, ruft die amtlichen Originale aber nicht erneut ab.

Das unveränderte Quellmanifest enthält Quellenstatus, Warnungen, Rechtehinweise
und Erhebungsgrenzen. Es liegt zusammen mit allen Quelldateien im versionierten
[Datenarchiv](data/hannover-snapshot.parts.json). Nach dem Entpacken steht es unter
site/data/ris/hannover.json bereit. Details zur Generation und Abdeckung stehen
in [docs/DATEN.md](docs/DATEN.md).

## Lokal starten

Python 3.12 und Node.js 24 entsprechen der CI-Umgebung. Die Anwendung benötigt
keinen Build-Schritt, keinen API-Schlüssel und keine npm-Abhängigkeiten.
Für die automatisierte Browserprüfung wird zusätzlich Playwright installiert.

~~~bash
python3 scripts/snapshot_bundle.py unpack
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
bytegleich. Suchindex und Kartenprojektion werden reproduzierbar abgeleitet;
migration.json dokumentiert Herkunft, Zählungen und Prüfsummen. Ein späterer
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
python3 scripts/snapshot_bundle.py unpack
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/import_unfallwerkbank.py --check --output-dir site/data/ris
~~~

Die Browserprüfung arbeitet ebenfalls mit dem tatsächlichen Datenpaket und
erzeugt Bildschirmbilder für Desktop, Tablet und Telefon:

~~~bash
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run test:browser
~~~

Der CI-Lauf bewahrt diese Bilder und den Prüfbericht als Artefakt
`hannover-browser-qa` auf. Der [Prüfbericht vom 21.11.2026](docs/QA.md)
enthält die erfolgreich geprüften Abläufe und Bildschirmbilder.

Die Prüfungen laufen gegen lokale Daten und Testfälle. Sie prüfen unter anderem
Suche, teilbare Ansichten, Datenzugriff und Importintegrität. Das alte
pruefung.tsv und die Bildschirmbilder unter pruefung/ stammen vom
ursprünglichen Ratsatlas-Portal und sind kein Prüfnachweis für diese Anwendung.

## Veröffentlichung

Vorgesehene Adresse:
[carstenartur.github.io/ratsatlas-Hannover/](https://carstenartur.github.io/ratsatlas-Hannover/).
**Die Konfiguration allein bedeutet noch nicht, dass die Seite veröffentlicht ist.**

Der Workflow [Prüfen und veröffentlichen](.github/workflows/veroeffentlichen.yml)
prüft Pull Requests und Änderungen auf main. Nur ein erfolgreicher Push-Lauf
auf main liefert anschließend site/ an GitHub Pages aus. Das vollständige
Datenarchiv wird davor entpackt. Dafür muss im Repository unter
**Settings → Pages → Build and deployment → Source** **GitHub Actions**
eingerichtet sein. Einen erfolgreichen Lauf und die tatsächlich erreichbare
Adresse vor einer Bekanntgabe kontrollieren.

Die geerbte Plesk-Veröffentlichung, IndexNow-Meldungen und Live-Prüfungen gegen
ratsatlas.de sind aus den aktiven Workflows entfernt. Es gibt keinen neuen
Zeitplan und keine Veröffentlichung in ein fremdes Repository.

## Herkunft, Rechte und Betrieb

- Gestaltung, Schrift- und Iconbasis: **Damian Paderta**,
  [daimpad/ratsatlas](https://github.com/daimpad/ratsatlas), mit Herkunft aus
  [Ratsatlas Bonn](https://github.com/daimpad/ratsatlas-bonn). Die ursprüngliche
  MIT-Lizenz bleibt erhalten.
- Hannover-Datenbestand: **Unfallwerkbank**,
  [carstenartur/Unfallatlas](https://github.com/carstenartur/Unfallatlas), mit den
  im Quellpaket genannten amtlichen Quellen.
- Kartenbibliothek: **Leaflet 1.9.4**, lokal mit BSD-2-Clause-Lizenz.
- Schrift: **Inter**, lokal mit SIL Open Font License 1.1.
- Kartenhintergrund: **© OpenStreetMap-Mitwirkende**; Kartenkacheln werden von
  tile.openstreetmap.org abgerufen.

Die **MIT-Lizenz des Codes ist keine pauschale Lizenz der Ratsdaten**. Das
Quellpaket nennt für die Gesamtdaten rights.status: not-specified; seine
einzelnen Rechte- und Quellenhinweise bleiben erhalten. Siehe [NOTICE.md](NOTICE.md).

Die Instanz gehört zum eigenständigen GitHub-Projekt carstenartur/ratsatlas-Hannover.
Eine Unterstützung dieser Instanz durch Damian Paderta oder Offene Kommunen.NRW
wird damit nicht behauptet. Hinweise zur Technik oder zu falschen Zuordnungen
können im [Projekt](https://github.com/carstenartur/ratsatlas-Hannover)
eingebracht werden. Die [Datenschutzhinweise](site/datenschutz.html) beschreiben
Hosting, Kartenabrufe und teilbare Rechercheadressen.
