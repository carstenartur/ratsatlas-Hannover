# Herkunft und Lizenzen

## Ratsatlas-Kern

Dieses Repository begann als Fork von
[daimpad/ratsatlas](https://github.com/daimpad/ratsatlas) am Stand
3b175bb7cb13e8830eb66bf1b64b96153fe16340.

Der ursprüngliche Code und die Gestaltung stammen von **Damian Paderta**,
Copyright © 2026. Die unveränderte [MIT-Lizenz](LICENSE) bleibt Teil dieser
Weiterentwicklung. Übernommen sind insbesondere Gestaltungsgrößen,
Textseitenlayout, Schriftintegration und die vorhandenen Ratsatlas-Symbole.

Der Kern verweist seinerseits auf die Gestaltung des
[Ratsatlas Bonn](https://github.com/daimpad/ratsatlas-bonn), früher
daimpad/allris-test. Hannover ergänzt eine eigene Anwendung und einen eigenen
Import; die Bonner Datenpipeline und ihr Datenbestand wurden nicht übernommen.

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

Die MIT-Lizenz des Codes wird nicht auf die Daten übertragen. Weitere
Informationen zu Quelle, Zeitständen und Grenzen: [docs/DATEN.md](docs/DATEN.md).

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
