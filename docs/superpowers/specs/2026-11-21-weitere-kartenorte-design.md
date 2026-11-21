# Weitere belegte Kartenorte

## Auftrag und Ausgangspunkt

Carsten möchte nach PR #4 die Verortung weiter verbessern. Ausgangspunkt ist
`e5158261b10df09b5a287782d2c498187d3100b8`: 109.605 Vorgänge, 9.502 mit
Kartenort; 100.103 ohne, darunter 8.770 mit Ortsangaben aus dem Quellpaket.
Die bestehende, reproduzierbare Ergänzung wird erweitert. Originalarchive
bleiben unverändert. Der vorhandene Auftrag umfasst Prüfung, PR, Merge und
Veröffentlichung; es wird keine erneute Freigabe für diese Fortsetzung benötigt.

## Ansätze und Entscheidung

Die Bestandsanalyse verglich drei Ansätze: direkte Ortsbelege, Übertragung aus
Vorgangsbeziehungen und aktuelle Einrichtungsverzeichnisse. Direkte Titel- und
Dokumentbelege sind hier die primäre Grundlage. Exakte Anfrage-Antwort-Paare
können bereits falsch erkannte Ausgangskoordinaten enthalten; heutige
Schulverzeichnisse unterscheiden Hauptstandorte, Außenstellen und historische
Umzüge nicht ausreichend. Eine pauschale Übertragung dieser beiden Gruppen
findet daher in dieser Iteration nicht statt. Das ist eine Implementierungs-
entscheidung auf Basis der Gegenproben, keine zusätzliche Nutzeranforderung.

## Gewünschtes Verhalten

1. Eindeutige Ortsformulierungen wie „in der Stüvestraße“ benötigen keinen
   zusätzlichen Treffer in einer Themenwortliste. Unmittelbare Straßenmaßnahmen
   wie „Grunderneuerung der Eckermannstraße“ werden erkannt. Amtliche Namen,
   begrenzte grammatische Flexionen und eindeutige Schreibvarianten werden
   berücksichtigt; Einrichtungen bleiben von gleichnamigen Straßen getrennt.
2. Eine ausdrücklich als Kreuzung, Einmündung, Ecke oder Knotenpunkt benannte
   Kombination von genau zwei amtlichen Straßen darf deren tatsächlichen
   Achsschnitt verwenden. Ein einziger zusammenhängender Kreuzungsbereich
   mit maximal 80 m Durchmesser ist zulässig. Getrennte Kreuzungen, fehlende
   Schnitte, Abschnitte und nicht aufgelöste weitere Straßen bleiben offen.
   Die Genauigkeit lautet „Kreuzungsbereich aus Straßenachsen“.
3. Exakte Hausadressen hinter einem ausdrücklich benannten Gebäude oder als
   Apposition zu einer Einrichtung werden ergänzt. Ein Dokumentbeleg darf den
   eindeutig gleichen Einrichtungsnamen mit einer bestätigten Projektadresse
   verbinden. Hausnummern, Zusätze und Spannen bleiben erhalten. Listenpunkte
   und Teiladressen dürfen keine Hausnummern vortäuschen.
4. Als Rückfall dürfen ausdrücklich benannte Stadtbezirke/Stadtteile auf der
   amtlichen Fläche erscheinen: „Nur Stadtbezirk bekannt“ bzw. „Nur Stadtteil
   bekannt“. Das ist eine grobe Ortsangabe, kein erfundener Mittelpunkt und
   keine Aussage über eine genaue Maßnahmenfläche. Ein Stadtbezirk wird nur
   seinem eigenen Gebiet zugeordnet, ein Stadtteil sich selbst und seinem
   übergeordneten Bezirk. Gemeinsame Grenzlinien erzeugen keine Nachbarzuordnung;
   ein lediglich bekannter Bezirk erzeugt keine Zuordnung zu allen Stadtteilen.
5. Quelle, Beleg und Genauigkeit bleiben sichtbar. Präzisere direkte Ortsbelege
   haben Vorrang vor Gebietsangaben. Mehrdeutige Namen, Vergleichsorte, Kontakt-
   und Sitzungsadressen bleiben ausgeschlossen. Originalgeometrien, Original-
   ereignisse und qualifizierte Vorgangskennungen werden bewahrt.

## Abnahme

Regressionen für echte positive und negative Vorlagen; Gegenproben für benannte
Einrichtungen, Ordnungszahlen, unvollständig erkannte Mehrfachorte, räumlich
getrennte Kreuzungen und benachbarte Gebiete. Vollständiger Neubau und Prüfung
der zusätzlichen Zuordnungen, getrennte Zählung nach Methode/Genauigkeit,
geprüfte Stichprobe der tatsächlichen Ergänzungen. Browserprüfung mit echten
Daten in GitHub Actions; kein lokaler Browserstart. Anschließend grüner PR,
Merge, erfolgreiches Pages-Deployment und Prüfung der öffentlichen Daten.
