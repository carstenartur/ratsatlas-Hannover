# Herkunft und Lizenzen

## Ratsatlas-Kern und Bonner Anwendung

Dieses Repository begann als Fork von
[daimpad/ratsatlas](https://github.com/daimpad/ratsatlas) am Stand
3b175bb7cb13e8830eb66bf1b64b96153fe16340.

Aus diesem Stand stammen die Gestaltungsgrundlagen, das Textseitenlayout, die
Schriftintegration und die vorhandenen Ratsatlas-Symbole. Die Anwendung bindet
zusätzlich Komponenten aus Ratsatlas Bonn von **Damian Paderta** ein. Grundlage
ist der Commit `f8850008e81825ae79be49ca7f3441b928a1858b`.
[Bonner Quellstand](https://github.com/daimpad/ratsatlas-bonn/tree/f8850008e81825ae79be49ca7f3441b928a1858b)

Der ursprüngliche Code und die Gestaltung tragen **Copyright © 2026 Damian
Paderta**. Der Lizenztext im Bonner Quellstand und der Lizenztext dieses Forks
sind bytegleich. Übernommen wurden das Bonner Stylesheet und das angepasste
Zeitleistenmodul. Die Kartenstruktur in `site/index.html`, die Steuerung in
`site/bonn-panels.js` und die Darstellung von Liste, Details und Verfahrensschritten
in `site/app.js` sind aus Bonn abgeleitet. `site/map-geography.js` adaptiert die
Bonner Gebietsnavigation, Beschriftung, Legende und Flächendarstellung für Hannover. Hannover ergänzt die Anbindung an
die Unfallwerkbank-Daten, Suche, Filter, Quellennachweise und Recherche-URLs.
[MIT-Lizenz](LICENSE) · [Dateizuordnung und Pflege](docs/UPSTREAM.md)

Die Herkunftsnennung bezeichnet keine Trägerschaft oder Unterstützung dieser
Hannover-Instanz durch Damian Paderta oder Offene Kommunen.NRW. Historische
Portaldateien und Prüfabbildungen im Fork beschreiben ihren ursprünglichen Stand.

## Hannover-Daten aus der Unfallwerkbank

Übernommen wird der veröffentlichte Hannover-RIS-Datenstand von
[carstenartur/Unfallatlas – Unfallwerkbank](https://github.com/carstenartur/Unfallatlas).
Das Originalmanifest, die 6.905 referenzierten Gzip-Dateien, Quellenkennungen,
Belege, Warnungen und Rechteangaben bleiben unverändert erhalten. Das
versionierte Datenarchiv bewahrt sie bytegleich. Herkunft und Prüfsummen
dokumentiert die darin enthaltene migration.json; nach dem Entpacken liegt sie
unter site/data/ris/migration.json.

Die amtlichen Quellen sind im Paket ausgewiesen, insbesondere Landeshauptstadt
Hannover, Region Hannover und Niedersächsischer Landtag. Die Gesamtrechte sind
in der Quelle als not-specified mit license: null gekennzeichnet. Der
Quellhinweis zu Landtagsdokumenten wird als überlieferte Angabe erhalten; er
ist keine eigene pauschale Rechtefreigabe durch dieses Projekt.

Für die Hannover-Daten gelten die überlieferten Hinweise im Quellpaket.
[Datenherkunft, Zeitstände und Grenzen](docs/DATEN.md)

## Amtliche Orts- und Gebietsgrundlagen

- **LGLN (2026), ATKIS Basis-DLM und INSPIRE-Hauskoordinaten aus ALKIS,
  bearbeitet, CC BY 4.0.** Die Unfallwerkbank stellt daraus ein Straßenachsen-
  und Hauskoordinatenverzeichnis für die Landeshauptstadt Hannover bereit.
  Der Ratsatlas verwendet diesen festgehaltenen Stand zur Verortung von
  Maßnahmen. [Quellen, Bearbeitung und Prüfsumme](https://github.com/carstenartur/ratsatlas-Hannover/blob/main/data/geocoding/README.md)
- **Datenquelle: CC-BY-4.0 – Bereich Geoinformation – LH Hannover.** Aus der
  Statistischen Gliederung SKH5 wurden benannte Stadtbezirke und Stadtteile
  ausgewählt, nach WGS 84 transformiert und für die Kartenanzeige vereinfacht.
  [SKH5-Datenstand und Bearbeitung](https://github.com/carstenartur/ratsatlas-Hannover/blob/main/data/geography/README.md) ·
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Landeshauptstadt Hannover, Hannover baut.** Der veröffentlichte Marker für
  das E-Damm-Bauprojekt am ehemaligen Bumke-Gelände bezeichnet den
  Projektstandort. Die Projektseite, der Kartenmarker und die Einzelnachweise
  sind am Datensatz verlinkt. [Quelle des Projektmarkers](https://github.com/carstenartur/ratsatlas-Hannover/blob/main/data/geocoding/bumke.json)

## Leaflet 1.9.4

[Leaflet](https://leafletjs.com/) wird lokal unter site/vendor/leaflet/
ausgeliefert. Die Version ist 1.9.4; die Lizenz ist **BSD 2-Clause**.

- Copyright © 2010–2023 Volodymyr Agafonkin
- Copyright © 2010–2011 CloudMade
- Vollständiger Lizenztext: [site/vendor/leaflet/LICENSE](site/vendor/leaflet/LICENSE)

Die lokale Auslieferung der Bibliothek lädt keine Bibliotheksdateien von einem
CDN. Kartenkacheln sind ein davon getrennter externer Abruf.

## Schrift Inter

Die lokal eingebundene Schrift **Inter** steht unter der **SIL Open Font License
1.1**. Ihre vollständigen Urheber- und Lizenzangaben stehen in
[site/fonts/LICENSE-Inter.txt](site/fonts/LICENSE-Inter.txt).

## OpenStreetMap

Der Kartenhintergrund stammt von tile.openstreetmap.org:
**© OpenStreetMap-Mitwirkende**. Die Kartenattribution wird auf der Karte
angezeigt. Maßgeblich sind die
[OpenStreetMap-Urheberrechts- und Lizenzhinweise](https://www.openstreetmap.org/copyright)
sowie die [Nutzungsregeln des Kacheldienstes](https://operations.osmfoundation.org/policies/tiles/).
Kartenkacheln werden nicht als Teil dieses Datenpakets gespiegelt.

## Betrieb dieses Forks

Diese Instanz ist das unabhängige Projekt
[carstenartur/ratsatlas-Hannover](https://github.com/carstenartur/ratsatlas-Hannover).
Die geerbten Betreiberangaben von NOZILLA/Damian Paderta werden nicht als
Betreiberangaben dieser Instanz weiterverwendet. Technische Datenflüsse
beschreibt [site/datenschutz.html](site/datenschutz.html).
