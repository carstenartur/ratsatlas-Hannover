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
