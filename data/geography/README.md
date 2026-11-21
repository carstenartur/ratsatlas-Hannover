# Amtliche Gebietsgrenzen für Hannover

Datenquelle: CC-BY-4.0 – Bereich Geoinformation – LH Hannover

[Statistische Gliederung SKH5](https://www.hannover.de/Leben-in-der-Region-Hannover/Verwaltungen-Kommunen/Die-Verwaltung-der-Landeshauptstadt-Hannover/Dezernate-und-Fachbereiche-der-LHH/Stadtentwicklung-und-Bauen/Fachbereich-Planen-und-Stadtentwicklung/Geoinformation/Open-GeoData/Themenkarten-und-statistische-Gliederung/Statistische-Gliederungen/Statistische-Gliederung-SKH5) · [Shapefile-Download](https://www.hannover.de/content/download/887881/file/SKH5_Statistische_Gliederung.zip) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

`source.json` hält Datenstand und Prüfsummen fest. `hannover-skh5.geojson` führt die 13 Stadtbezirke und 51 Stadtteile mit ihren amtlichen Schlüsseln. Beim Import wurden die jeweiligen zwei Datensätze ohne Namen und Gebietsschlüssel weggelassen. Die Grenzen wurden aus EPSG:25832 nach EPSG:4326 transformiert und mit GDAL 3.10.3 (traditionelle GIS-Achsenreihenfolge) und 15 Nachkommastellen als GeoJSON ausgegeben.

Für eine Aktualisierung die Layer `SKH5_Stadtbezirke` und `SKH5_Stadtteile` aus dem amtlichen ZIP übernehmen. In den Attributen stehen `STADTBZNR` und `STADTBZNAM` für den Stadtbezirk, `STADTTLNR` und `STADTTLNAM` für den Stadtteil. Der Stadtteil-Layer enthält zusätzlich den Schlüssel seines Stadtbezirks. Die Schlüssel behalten ihre führende Null. Der GeoJSON-Import sortiert nach Gebietstyp und Schlüssel. Anschließend beide Prüfsummen, Datenstand und Abrufdatum in `source.json` aktualisieren und die Geografieprojektion neu bauen.

Der Build verwendet die vollständigen Grenzen für den räumlichen Schnitt mit den Kartenorten. Er schreibt vereinfacht dargestellte Grenzen in die Kartenprojektion. Ein Vorgang kann mehrere Gebiete berühren und wird je Gebiet einmal gezählt.
