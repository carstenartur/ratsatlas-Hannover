# Bonner Quellstand und Pflege

Ratsatlas Hannover entstand als Fork von `daimpad/ratsatlas` auf dem Stand
`3b175bb7cb13e8830eb66bf1b64b96153fe16340`. Schriftintegration, Symbole und
Textseiten stammen aus dieser Portalbasis. Die Kartenanwendung integriert
Komponenten aus `daimpad/ratsatlas-bonn` vom Commit
`f8850008e81825ae79be49ca7f3441b928a1858b`. Die Entwicklung und die
Veröffentlichung erfolgen im bestehenden Hannover-Repository.
[Portalbasis](https://github.com/daimpad/ratsatlas/tree/3b175bb7cb13e8830eb66bf1b64b96153fe16340) ·
[Bonner Quellstand](https://github.com/daimpad/ratsatlas-bonn/tree/f8850008e81825ae79be49ca7f3441b928a1858b)

Die übernommenen Komponenten stammen von **Damian Paderta**, Copyright © 2026,
und stehen unter der **MIT-Lizenz**. Der Lizenztext im Bonner Quellstand ist
bytegleich mit dem Lizenztext dieses Forks. [Bonner Lizenz](https://github.com/daimpad/ratsatlas-bonn/blob/f8850008e81825ae79be49ca7f3441b928a1858b/LICENSE) ·
[MIT-Lizenz im Fork](../LICENSE) · [Herkunft und Lizenzen](../NOTICE.md)

## Dateizuordnung

| Bonner Quelle | Hannover-Datei | Übernahme und örtliche Anpassung |
|---|---|---|
| `site/style.css` | [`site/style.css`](../site/style.css) | Original-Stylesheet für die vollflächige Karte, Navigation, Fenster und Zeitleiste. Hannover-spezifische Regeln stehen in [`site/hannover.css`](../site/hannover.css). |
| `site/index.html` | [`site/index.html`](../site/index.html) | Abgeleitete Struktur der Karte, Navigation, Liste, Detailansicht und Zeitleiste. Hannover ergänzt Such- und Quellenfilter, Datenstatus, Teilen und eigene Metadaten. |
| `site/app.js` | [`site/bonn-panels.js`](../site/bonn-panels.js), [`site/app.js`](../site/app.js) | Abgeleitete Fenstersteuerung für Liste, Vorgang und Zeitleiste, inklusive Fokus, mobiler Navigation und Größenänderung per Zeiger und Tastatur. Auch die Darstellung von Liste, Details und Verfahrensschritten folgt dem Bonner Aufbau. |
| `site/timeline.js` | [`site/timeline.js`](../site/timeline.js) | Bonner Zeitleiste mit Anpassungen für Tagesaggregate, verfügbare Spuren, getrennten Quellenprüfstand und Datenzeitraum, das Aufheben des Zeitfilters sowie die URL-Anbindung für Zoom und Mittelpunkt. |

[`site/app.js`](../site/app.js) bindet die übernommenen Komponenten an den
bereits vorhandenen Hannover-Datenzugriff `AtlasData` an. Der
[`site/timeline-adapter.js`](../site/timeline-adapter.js) übergibt die
Datumsverteilungen des Suchindex und die belegten Ereignisse eines geöffneten
Vorgangs. [`site/view-state.js`](../site/view-state.js) erhält die Unterstützung
für bisherige Links und ergänzt Datum, Fensterzustand sowie Zoom und
Mittelpunkt der Zeitleiste. Das frühere Hannover-Stylesheet `site/app.css`
entfällt. Die vorhandenen Klassen für Datenschutz und 404-Seite liegen in
[`site/portal.css`](../site/portal.css).

## Datenabhängige Bonner Funktionen

Haushalt, Gebietsstatistik, Themenseiten, zusätzliche Geodaten, Bonner
Verfahrensmodelle und Ortsrecht, Beteiligungsfristen, Feeds, Einführungstour
und KI-Ratsassistent gehören zum Bonner Stand. Sie setzen Bonner Daten,
Regelwerke oder Dienste voraus und sind in Hannover nicht eingebunden. Die
Hannover-Zeitleiste verwendet die Vorgangsdaten der Unfallwerkbank und
überlieferte Beratungsereignisse einzelner Vorgänge. Bonner Sitzungs- und
Wahlperiodenspuren sind in Hannover deaktiviert. [Hannover-Daten und Grenzen](DATEN.md)

## Gezielt aus Bonn aktualisieren

1. Im Hannover-Repository einen Arbeitsbranch anlegen. Bei Bedarf einmalig
   einen lokalen Remote für Bonn einrichten und dessen Referenzen abrufen.

   ~~~bash
   git remote add bonn https://github.com/daimpad/ratsatlas-bonn.git
   git fetch --no-tags bonn
   git branch -r --list 'bonn/*'
   ~~~

2. Den geeigneten Bonner Commit auswählen und im folgenden Vergleich für
   `NEUER_COMMIT` dessen vollständigen Hash einsetzen. `bonn_bisher` bezeichnet
   den in diesem Dokument festgehaltenen Quellstand. Auch die Bonner Hinweise
   zu geänderten Datenabhängigkeiten prüfen.

   ~~~bash
   bonn_bisher=f8850008e81825ae79be49ca7f3441b928a1858b
   bonn_neu=NEUER_COMMIT
   git diff "$bonn_bisher" "$bonn_neu" -- \
     LICENSE README.md TECHNIK.md site/style.css site/index.html site/app.js site/timeline.js
   ~~~

3. Die geeigneten Änderungen anhand der Dateizuordnung übernehmen. Die
   Anpassungen für Hannoverer Quellen, Datenverträge, Verortung und URLs beim
   Übertragen berücksichtigen. Den verwendeten Commit und alle örtlichen
   Anpassungen hier, in [`NOTICE.md`](../NOTICE.md) und in den Herkunftsangaben
   der betroffenen Dateien nachführen. Bei unterschiedlichen Quellständen je
   Datei die jeweilige Herkunft einzeln eintragen.
4. JavaScript- und Python-Tests, Offlineprüfung sowie Browserprüfungen in
   Chromium und WebKit mit dem Hannover-Datenpaket ausführen. Besonders
   Zeitfilter und undatierte Treffer, Originalgeometrien, Verknüpfungen sowie
   die Wiederherstellung bisheriger und neuer URLs prüfen. Auf Telefon und
   Tablet auch Navigation und Fenster kontrollieren. [Prüfbefehle](../README.md#prüfen)

Die Übernahme von Bonner Code und die Aktualisierung des Hannover-Datenpakets
sind unabhängige Schritte. Für die Datenübernahme gilt das bestehende
Importverfahren der Unfallwerkbank. [Datenstand erneut übernehmen](../README.md#datenstand-erneut-übernehmen)
