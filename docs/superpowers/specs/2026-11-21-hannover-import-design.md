# Ratsatlas Hannover: Übernahme der Unfallwerkbank

## Auftrag und Ausgangspunkt

Carsten möchte die bereits erschlossenen Hannover-Daten der Unfallwerkbank in
`carstenartur/ratsatlas-Hannover` übernehmen. Der Fork basiert auf
`daimpad/ratsatlas` (3b175bb7cb13e8830eb66bf1b64b96153fe16340); er enthält die
gemeinsame Startseite und Gestaltung, noch keine Stadtanwendung.

Der veröffentlichte RIS-Bestand der Unfallwerkbank enthält 109.605 Vorgänge:
95.535 Stadt, 14.055 Region und 15 Land. 8.004 Vorgänge sind 3.395 Geometrien
zugeordnet. Diese Zahlen sind eine Bestandsaufnahme, keine Vollständigkeitszusage
über die amtlichen Archive. Der Quellenstand und die bekannten Lücken bleiben
unverändert erhalten.

## Umsetzung und Alternativen

Eine Verlinkung auf die Unfallwerkbank würde die gewünschte eigenständige
Hannover-Lösung nicht schaffen. Eine vollständige Übernahme der Bonn-Anwendung
brächte einen zweiten, auf OParl und Bonn ausgerichteten Import mit.

Umsetzungsentscheidung: die vorhandene Ratsatlas-Gestaltung und lokalen Schriften
behalten, eine statische Hannover-Anwendung ergänzen und den bestehenden
Hannover-Datenbestand mit einem geprüften, wiederholbaren Import übernehmen.
Die Rohpartitionen bleiben unverändert; kompakte Such- und Kartenprojektionen
werden daraus reproduzierbar abgeleitet. Kein zusätzlicher Server oder API-Key.

## Anforderungen

- Stadt, Region und Land gemeinsam durchsuchen, einzeln filtern und klar kennzeichnen.
- Alle Vorgänge erhalten, auch ohne Koordinaten; keine künstlichen Kartenpunkte.
- IDs mitsamt Quellenpräfix, Drucksachensuffixe, Originalquellen, Ortsbelege,
  Beratungsverlauf und dokumentierte Beziehungen erhalten.
- Karte und Ergebnisliste mit Zeitraumfilter, Detailansicht, Originalverweisen
  und teilbaren URLs für Filter, Auswahl und Kartenausschnitt.
- Auf Telefon und Tablet bedienbar: keine dauerhaft übereinander liegenden Fenster;
  Liste/Karte umschaltbar und Details schließbar.
- Datenstatus zeigt Quellenstand, Importdatum, Quellenzählungen, nicht verortete
  Vorgänge und bekannte Importlücken getrennt an.
- Veraltete Archivdaten bleiben mit sichtbarem Stand recherchierbar. Die Übernahme
  ist keine neue Prüfung der amtlichen Originale.
- Vor Veröffentlichung Integritätsprüfung, Funktionstests und visuelle Kontrolle.
- Anerkennung und MIT-Lizenz von Damian Paderta/Ratsatlas erhalten. Datenrechte
  werden nicht aus der Code-Lizenz abgeleitet; Ursprungsaussagen bleiben erhalten.

## Schnittstellen

`site/data/ris/` enthält `hannover.json`, alle erreichbaren unveränderten
Gzip-Partitionen, `migration.json`, `search-index.json.gz`, `map.geojson.gz`.

Suchprojektion: Objekt mit `schemaVersion`, `generation` und `records`; die
Einträge enthalten `id`, `sourceId`, `title`, `number`, `date`, `type`,
`source`, `level` (`city|region|state`), `body`, `mapped` und `locations`
(Liste von Ortsbezeichnungen). Kartenprojektion: GeoJSON FeatureCollection mit
Originalgeometrien; `properties.recordIds` enthält zugeordnete Vorgangs-IDs.

`site/data.js` exportiert `AtlasData` mit `init()`, `search(params)`,
`getRecord(id)`, `getMap()`. `init()` liefert `{manifest,migration}` und setzt
diese Eigenschaften am Objekt. `search({query,levels,yearFrom,yearTo,mappedOnly,
offset,limit})` liefert `{items,total,years}`. `getRecord()` liefert
`{record,locations,events,relationships,relatedRecords,features}`; `getMap()` eine
GeoJSON FeatureCollection. Die Suche liefert zusätzlich alle `matchedIds` zum
Filtern der Karte. `getSummaries(ids)` lädt bis zu 30 Metadatensätze für lesbare
Karten-Popups. `relatedRecords` enthält die im Bestand erreichbaren
verknüpften Vorgänge. Unbekannte Angaben bleiben unbekannt.

## Betrieb und Umfang

Statische Auslieferung aus `site/` unter dem Repository-Unterpfad auf GitHub Pages.
Der bestehende fremde Plesk-/IndexNow-Workflow wird für diesen Fork ersetzt.
CI prüft Import und Anwendung ohne Zugriff auf amtliche Serversysteme.
Das vollständige Archiv wird als vier überprüfbare Binärteile mit Manifest und
SHA-256-Prüfsumme versioniert und vor Tests und Auslieferung lokal entpackt.
Ein manueller Import kann spätere veröffentlichte Datenstände der Unfallwerkbank
übernehmen. Eine neue regelmäßige Automatisierung ist nicht Teil dieses Auftrags.
Die Unfallanalyse bleibt über einen Link zur Unfallwerkbank erreichbar.
