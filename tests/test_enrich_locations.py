"""Municipal subjects must map with the precision their evidence supports."""
import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))


def row(title, identifier='hannover-sim:sample', **extra):
    return dict(id=identifier, sourceId=identifier, title=title, source='hannover-sim',
                level='city', mapped=False, locations=[], **extra)


class LocationEnrichmentTests(unittest.TestCase):
    def setUp(self):
        try:
            from enrich_locations import Resolver, project
        except ModuleNotFoundError as exc:
            self.fail(f'Missing municipal enrichment entry point: {exc}')
        self.resolver = Resolver.load(ROOT / 'data' / 'geocoding')
        self.project = project

    def outcome(self, *records):
        index = dict(generation='test', schemaVersion=1, records=list(records))
        geojson = dict(type='FeatureCollection', generation='test', features=[])
        return self.project(index, geojson, self.resolver)

    def test_project_and_plan_link_to_the_same_official_marker(self):
        titles = ['Areal der Firma Bumke entwickeln',
                  'Bebauungsplan der Innenentwicklung Nr. 1862 - Oberstraße, Auslegungsbeschluss']
        rows = [row(title, f'hannover-sim:test{i}') for i, title in enumerate(titles)]
        index, geojson, additions = self.outcome(*rows)
        self.assertTrue(all(r['mapped'] for r in index['records']))
        feature, = geojson['features']
        self.assertEqual(feature['geometry'], dict(type='Point', coordinates=[9.72521, 52.3824]))
        self.assertEqual(set(feature['properties']['recordIds']), {r['id'] for r in rows})
        for r in rows:
            loc, = additions['records'][r['id']]['locations']
            self.assertEqual(loc['accuracy'], 'Projektstandort')
            self.assertEqual(loc['evidence']['text'], r['title'])
            self.assertTrue(loc['sourceUrl'].startswith('https://www.hannover.de/'))

    def test_reviewed_document_checks_identity_and_title(self):
        r = row('Anfrage der Fraktion die FRAKTION zum Thema: Gemeinnützigen Wohnraum selber machen',
                'hannover-sim:0701-2020')
        index, _, adds = self.outcome(r, row('Gemeinnützigen Wohnraum selber machen'))
        self.assertEqual([x['mapped'] for x in index['records']], [True, False])
        self.assertEqual(adds['records'][r['id']]['locations'][0]['evidence']['source'], 'document')
        self.assertFalse(self.outcome(row('Anderes Thema', r['id']))[0]['records'][0]['mapped'])

    def test_civic_address_has_exact_official_coordinate_even_without_traffic_subject(self):
        r = row('Neubau einer Kindertagesstätte am Engelbosteler Damm 5')
        index, geojson, _ = self.outcome(r)
        self.assertTrue(index['records'][0]['mapped'])
        f, = geojson['features']
        self.assertEqual(f['geometry'], dict(type='Point', coordinates=[9.725344, 52.382209]))
        self.assertEqual(f['properties']['accuracy'], 'Hauskoordinate')

    def test_range_keeps_both_address_endpoints_and_no_invented_interior(self):
        _, geojson, _ = self.outcome(row('Sanierung der Kita am Engelbosteler Damm 5–9'))
        points = {tuple(f['geometry']['coordinates']) for f in geojson['features']}
        self.assertEqual(points, {(9.725344, 52.382209), (9.725227, 52.382666)})
        self.assertTrue(all(f['properties']['accuracy']=='Adresspunkt der genannten Spanne'
                            for f in geojson['features']))

    def test_two_individually_named_addresses_are_not_a_continuous_range(self):
        _, geojson, _ = self.outcome(row('Umbau der Kita am Engelbosteler Damm 5 und 9'))
        self.assertEqual({f['properties']['label'] for f in geojson['features']},
                         {'Engelbosteler Damm 5', 'Engelbosteler Damm 9'})
        self.assertTrue(all(f['properties']['accuracy'] == 'Hauskoordinate'
                            for f in geojson['features']))

    def test_address_suffix_after_a_space_is_part_of_the_house_number(self):
        _, geojson, _ = self.outcome(row('Neubau der Kita in der Pfarrstraße 38 A'))
        feature, = geojson['features']
        self.assertEqual(feature['geometry']['coordinates'], [9.720757, 52.346478])
        self.assertEqual(feature['properties']['label'], 'Pfarrstraße 38a')

    def test_spaced_suffix_at_the_end_of_a_range_is_preserved(self):
        _, geojson, _ = self.outcome(row('Instandsetzung des Fußweges in der Zietenstraße 2 - 2 a'))
        self.assertEqual({f['properties']['label'] for f in geojson['features']},
                         {'Zietenstraße 2', 'Zietenstraße 2a'})

    def test_facility_and_stop_names_do_not_supply_a_street(self):
        titles = [
            'Neubau der Kindertagesstätte "Stadionbrücke" und Verlagerung des Park- und Bolzplatzes',
            'Verlegung Bushaltestelle "Im Born " zur Haltestelle "Sternheimweg"',
            'Antwort der Verwaltung auf die Anfrage Verlegung Bushaltestelle "Im Born " zur Haltestelle "Sternheimweg" Sitzung des Stadtbezirksrates Ahlem-Badenstedt-Davenstedt',
            'Sanierung der Haltestelle Sternheimweg',
            'Zugang zum Spielplatz Mecklenburger Straße',
            'Parkplatz Kneippweg',
            'Neubau der Kita „An der Stadionbrücke“',
        ]
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual(self.outcome(row(title))[2]['records'], {})

    def test_explicit_independent_location_of_named_stop_or_facility(self):
        for title, label in [
            ('Ausbau der Haltestelle „Sternheimweg“ an der Lenther Chaussee', 'Lenther Chaussee'),
            ('Neubau der Kindertagesstätte „Stadionbrücke“ an der Ricklinger Straße', 'Ricklinger Straße'),
            ('Spielplatz an der Gartenheimstraße', 'Gartenheimstraße'),
        ]:
            with self.subTest(title=title):
                _, features, _ = self.outcome(row(title))
                self.assertEqual([f['properties']['label'] for f in features['features']], [label])

    def test_street_measure_only_claims_an_axis(self):
        _, geojson, _ = self.outcome(row('NEUFASSUNG: Verkehrsberuhigung Kötnerholzweg'))
        f, = geojson['features']
        self.assertIn(f['geometry']['type'], ['LineString','MultiLineString'])
        self.assertEqual(f['properties']['accuracy'], 'Straßenverlauf zur Orientierung')

    def test_land_use_and_abbreviated_street_address(self):
        r = row('Vorhabenbezogener Bebauungsplan für das Grundstück Buchholzer Str. 60')
        result = self.outcome(r)
        self.assertEqual(result[2]['records'][r['id']]['locations'][0]['label'], 'Buchholzer Straße 60')

    def test_explicit_location_does_not_depend_on_a_topic_keyword(self):
        for title, label in [
            ('Oberflächensanierung in der Stüvestraße', 'Stüvestraße'),
            ('Geschwindigkeitskontrollen im Bünteweg', 'Bünteweg'),
            ('Grunderneuerung der Eckermannstraße in Kleefeld; Zusatzantrag', 'Eckermannstraße'),
            ('Bordsteinabsenkung Mellendorfer Straße', 'Mellendorfer Straße'),
            ('Fahrradbügel Odeonstraße', 'Odeonstraße'),
            ('Ampelschaltung Lerchenfeldstraße', 'Lerchenfeldstraße'),
        ]:
            with self.subTest(title=title):
                _, geo, _ = self.outcome(row(title))
                self.assertEqual([f['properties']['label'] for f in geo['features']], [label])
                self.assertEqual(geo['features'][0]['properties']['accuracy'], 'Straßenverlauf zur Orientierung')

    def test_complete_official_street_name_survives_grammar_and_unusual_endings(self):
        for title, label in [
            ('Sanierung der Alten Stöckener Straße', 'Alte Stöckener Straße'),
            ('Sanierung der Großen Packhofstraße', 'Große Packhofstraße'),
            ('Ausbau der Straße In der Rehre', 'In der Rehre'),
            ('Geschwindigkeitskontrollen in der Straße Am Lindenhofe', 'Am Lindenhofe'),
        ]:
            with self.subTest(title=title):
                _, geo, _ = self.outcome(row(title))
                self.assertEqual([f['properties']['label'] for f in geo['features']], [label])

    def test_facility_apposition_and_explicit_building_address_have_house_coordinates(self):
        cases = [
            ('Erweiterung und Umstrukturierung der 2-gruppigen Kita "Knirpse", Sven-Hedin-Str. 7',
             'Sven-Hedin-Straße 7', [9.823144, 52.401679]),
            ('Vorhabenbezogener Bebauungsplan Nr. 1879 - Wohn- und Geschäftshaus Hildesheimer Straße 114 - Einleitungsbeschluss',
             'Hildesheimer Straße 114', [9.752681, 52.356958]),
        ]
        for title, label, point in cases:
            with self.subTest(title=title):
                _, geo, _ = self.outcome(row(title))
                self.assertEqual([(f['properties']['label'], f['geometry']['coordinates']) for f in geo['features']],
                                 [(label, point)])

    def test_ordinal_and_partial_street_scopes_do_not_become_exact_locations(self):
        for title in [
            'Neubau am Engelbosteler Damm 5. Weitere Maßnahmen',
            'Ausbau der Straße In der Rehre zwischen Bergfeldstraße und Göttinger Chaussee',
            'Ausbau der Großen Packhofstraße zwischen Osterstraße und Georgstraße',
            'Sanierung in der Mardalstraße vom Spielplatz bis an den Fußweg',
            'Kreuzung Hahnenstraße/Callinstraße/Unbekanntstraße',
            'Kreuzung Hahnenstraße/Callinstraße zwischen zwei Abschnitten',
            'Kreuzung Hahnenstraße/Callinstraße 12',
            'Bebauungsplan Hahnenstraße/Callinstraße',
            'Verkehrsberuhigung Hahnenstraße und Callinstraße',
            'Übergang Ecke Hahnenstraße/Callinstraße zum Welfengarten',
        ]:
            with self.subTest(title=title):
                self.assertEqual(self.outcome(row(title))[2]['records'], {})

    def test_explicit_crossing_uses_real_axis_intersection(self):
        title = ('Antwort der Verwaltung auf die Anfrage Verkehrssicherheit Ecke Hahnenstraße/Callinstraße '
                 'Sitzung des Stadtbezirksrates Nord am 16.12.2019 TOP 7.1.2.')
        _, geo, _ = self.outcome(row(title))
        self.assertEqual(len(geo['features']), 1)
        self.assertEqual(geo['features'][0]['geometry'], dict(type='Point', coordinates=[9.717473, 52.386018]))
        self.assertEqual(geo['features'][0]['properties']['accuracy'], 'Kreuzungsbereich aus Straßenachsen')

    def test_same_named_facility_in_document_proves_its_address(self):
        r = row('Umstrukturierung einer Kindergartengruppe in der Kindertagesstätte "Twipsy"')
        def resolve(text):
            docs = {r['id']: [dict(kind='address', label='Ortskamp 89',
                                 evidence=dict(source='document', text=text))]}
            return self.project(dict(records=[r], generation='t'), dict(features=[], generation='t'),
                                self.resolver, docs)[2]['records']
        result = resolve('in der Kindertagesstätte " Twipsy" Ortskamp 89 in 30539 Hannover-Bemerode, '
                         'eine Kindergartengruppe umzustrukturieren und')
        self.assertEqual(result[r['id']]['locations'][0]['label'], 'Ortskamp 89')
        for text in [
            'in der Kindertagesstätte "Andere Einrichtung" Ortskamp 89 eine Gruppe umzustrukturieren',
            'Kindertagesstätte "Twipsy", Anschrift des Trägers: Ortskamp 89',
            'Kindertagesstätte "Twipsy" am bisherigen Standort Ortskamp 89',
            'Kindertagesstätte "Twipsy" und das Beratungsbüro am Standort Ortskamp 89',
        ]:
            with self.subTest(text=text):
                self.assertEqual(resolve(text), {})

    def test_explicit_area_is_a_coarse_polygon_and_precise_address_takes_precedence(self):
        r = row('Einsatz des Ordnungsdienstes im Stadtbezirk Linden-Limmer')
        _, geo, adds = self.outcome(r)
        self.assertEqual(len(geo['features']), 1)
        self.assertEqual(geo['features'][0]['properties']['areaId'], 'bezirk:10')
        self.assertIn(geo['features'][0]['geometry']['type'], ('Polygon', 'MultiPolygon'))
        loc, = adds['records'][r['id']]['locations']
        self.assertEqual((loc['kind'], loc['accuracy'], loc['areaId']),
                         ('area', 'Nur Stadtbezirk bekannt', 'bezirk:10'))
        precise = row('Neubau einer Kita am Engelbosteler Damm 5 im Stadtteil Nordstadt')
        _, geo, adds = self.outcome(precise)
        self.assertEqual([f['geometry']['type'] for f in geo['features']], ['Point'])
        self.assertEqual(adds['records'][precise['id']]['locations'][0]['label'], 'Engelbosteler Damm 5')

    def test_meeting_location_never_supplies_a_fallback_area(self):
        title = 'Antwort zum Schulangebot Sitzung des Stadtbezirksrates im Stadtbezirk Nord'
        self.assertEqual(self.outcome(row(title))[2]['records'], {})

    def test_schools_parks_and_partial_roads_do_not_supply_an_entire_street_axis(self):
        for title in [
            'GS An der Feldbuschwende, Klimatisierung der Verwaltung',
            'Umnutzung in der Grundschule (GS) an der Feldbuschwende für schulische Nutzung',
            'Förderverein der Grundschule An der Feldbuschwende; Anschaffung von Schulmaterial',
            'Wiederaufbau eines Spielgerätes im Hermann-Löns-Park',
            'Chaos und Vermüllung im Georgengarten konsequent beenden',
            'Baumbestand im Girlitzpark',
            'Umbau der Großen Barlinge - 2. Bauabschnitt',
            'Umbau eines Teilabschnitts im Jädekamp',
            'Umbau der Loccumer Straße in vier Teilbereichen zur Verkehrsberuhigung',
            'Sanierung Radweg Kugelfangtrift und Sahlkamp',
            'Barrierefreier Zugang von der Straße Am Plessenfelde zum Gehaplatz',
            'Kreuzung Hahnenstraße/Callinstraße, Unbekanntstraße',
            'Kreuzung Hahnenstraße/Callinstraße sowie Unbekanntstraße',
            'Kreuzung Hahnenstraße/Callinstraße - Unbekanntdamm',
            'Ausbau am Engelbosteler Damm 5) Weitere Maßnahmen',
        ]:
            with self.subTest(title=title):
                self.assertEqual(self.outcome(row(title))[2]['records'], {})
        _, geo, _ = self.outcome(row('Änderung der Beschilderung und Markierung in der Straße Hermann-Löns-Park'))
        self.assertEqual([f['properties']['label'] for f in geo['features']], ['Hermann-Löns-Park'])

    def test_same_named_facility_is_not_enough_for_a_recipient_address(self):
        r = row('Umstrukturierung der Kindertagesstätte "Twipsy"')
        for text in [
            'An die Kindertagesstätte "Twipsy", Ortskamp 89: wir bitten um Stellungnahme.',
            'Postanschrift der Kindertagesstätte "Twipsy", Ortskamp 89',
            'Brief an die Kindertagesstätte "Twipsy", Ortskamp 89: Bitte um Stellungnahme zum Umbau.',
        ]:
            with self.subTest(text=text):
                docs = {r['id']: [dict(kind='address', label='Ortskamp 89',
                                     evidence=dict(source='document', text=text))]}
                _, _, adds = self.project(dict(records=[r], generation='t'), dict(features=[], generation='t'),
                                         self.resolver, docs)
                self.assertEqual(adds['records'], {})

    def test_care_capacity_at_the_same_facility_is_project_evidence_before_the_address(self):
        for name, label, text in [
            ('Unterm Regenbogen', 'Vahrenwalder Straße 109',
             'die Betreuungszeit einer Kindergartengruppe (25 Plätze, 3/4-Betreuung) in der Kindertagesstätte "Unterm Regenbogen", Vahrenwalder Str. 109, in Trägerschaft des Ev.-Luth.'),
            ('Twipsy', 'Ortskamp 89',
             "die Betreuungszeit einer Kindergartengruppe (25 Plätze) in der Kindertagesstätte 'Twipsy', Ortskamp 89 im Stadtteil Bemerode, von 3/4 - auf eine Ganztagsbetreuung auszuweiten und"),
            ('Die kleinen Gallier', 'Peiner Straße 30',
             "die Betreuungszeit einer Kindergartengruppe (25 Plätze) der Kindertagesstätte 'Die kleinen Gallier', Peiner Str. 30 im Stadtteil Döhren, von einer 3/4- auf eine Ganztags-Betreuung auszuweiten und"),
        ]:
            with self.subTest(label=label):
                r = row(f'Aufstockung der Betreuungszeit in der Kindertagesstätte "{name}"')
                docs = {r['id']: [dict(kind='address', label=label, evidence=dict(source='document', text=text))]}
                _, _, adds = self.project(dict(records=[r], generation='t'), dict(features=[], generation='t'),
                                         self.resolver, docs)
                self.assertEqual([loc['label'] for loc in adds['records'].get(r['id'], {}).get('locations', [])], [label])

    def test_civic_document_address_must_be_the_explicit_project_site(self):
        r = row('Errichtung und Förderung einer fünfgruppigen Kindertagesstätte')
        def match(text):
            evidence = [{'kind':'address', 'label':'Cécile-Huk-Ring 9', 'evidence':{'source':'document','text':text}}]
            index = dict(records=[r], generation='test')
            return self.project(index, dict(features=[],generation='test'), self.resolver,
                                {r['sourceId']:evidence})[2]['records']
        result = match('dem Neubau am Standort Cécile-Huk-Ring 9 zuzustimmen')
        loc, = result[r['id']]['locations']
        self.assertEqual((loc['label'], loc['evidence']['source']), ('Cécile-Huk-Ring 9','document'))
        self.assertNotIn(r['id'], match('Anschrift der Antragstellerin: Cécile-Huk-Ring 9'))
        self.assertNotIn(r['id'], match('Im Vergleich zum Standort Cécile-Huk-Ring 9 zuzustimmen'))
        self.assertNotIn(r['id'], match('Auskunft vor Ort am Standort Cécile-Huk-Ring 9'))
        self.assertNotIn(r['id'], match('Die Sitzung findet am Standort Cécile-Huk-Ring 9 statt'))

    def test_explicit_title_address_takes_precedence_over_another_mentioned_site(self):
        r = row('Neubau einer Kita am Engelbosteler Damm 5')
        docs = {r['id']: [dict(kind='address', label='Cécile-Huk-Ring 9',
                               evidence=dict(source='document', text='dem Umbau am Standort Cécile-Huk-Ring 9 zuzustimmen'))]}
        index, geo, adds = self.project(dict(records=[r], generation='t'), dict(features=[], generation='t'),
                                        self.resolver, docs)
        self.assertEqual(adds['records'][r['id']]['locations'][0]['label'], 'Engelbosteler Damm 5')

    def test_private_ambiguous_or_unverified_references_remain_open(self):
        titles = ['Petition der Bürgerinitiative Bumke selber machen',
                  'Stellungnahme der Firma Bumke zur Verkehrspolitik',
                  'Entwicklung von Schulstandorten, ein Rückblick auf das Bumke-Areal',
                  'Neue Kita im Süden nach dem Vorbild des Bebauungsplans Nr. 1862 - Oberstraße',
                  'Sitzungsort Engelbosteler Damm 5',
                  'Anerkennung der Kindertagesstätte des Vereins der Freunde der Grundschule Mengendamm',
                  'Beihilfen aus Bezirksratsmitteln; hier: Kindertagesstätte Hebbelstraße',
                  'Betreuung an der Grundschule Mengendamm',
                  'Anschrift der Antragstellerin: Engelbosteler Damm 5, Neubau einer Kita',
                  'Umbesetzung in der Kommission Sanierung Soziale Stadt Sahlkamp-Mitte',
                  'Aufstellen von Fahrradbügeln vor dem Einkaufszentrum Sahlkamp',
                  'Sanierung der Kita am Engelbosteler Damm 999',
                  'Sanierung der Kita am Engelbosteler Damm 5/999',
                  'Sanierung der Kita am Engelbosteler Damm 5/9',
                  'Bebauungsplan Nr. 18620 - Oberstraße']
        samples = [row(t, f'hannover-sim:test{i}') for i,t in enumerate(titles)]
        external = row('Verkehrsberuhigung Kötnerholzweg', 'region-hannover-ris:123')
        external.update(level='region', source='region-hannover-ris')
        self.assertEqual(self.outcome(*samples, external)[2]['records'], {})

    def test_preserves_original_projection_and_aliases(self):
        old=row('Bestandsvorgang', 'hannover-sim:old')
        old.update(mapped=True, locations=['Originalort'])
        index=dict(records=[old,row('Verkehrsberuhigung Kötnerholzweg')], generation='test')
        original=dict(type='Feature',geometry=dict(type='Point',coordinates=[9.7,52.4]),
                      properties=dict(geometryId='original',recordIds=[old['id']]))
        geo=dict(type='FeatureCollection',features=[original],generation='test')
        before=copy.deepcopy((index,geo))
        new_index,new_geo,adds=self.project(index,geo,self.resolver)
        self.assertEqual((index,geo),before)
        self.assertEqual(new_index['records'][0],old)
        self.assertEqual(new_geo['features'][0],original)
        self.assertNotIn(old['id'],adds['records'])
