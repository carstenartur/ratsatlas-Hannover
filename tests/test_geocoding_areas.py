import unittest

from scripts.build_geography import load_boundaries
from scripts.geocoding_areas import AreaResolver


class AreaResolverTests(unittest.TestCase):
    def setUp(self):
        boundaries, self.source = load_boundaries()
        self.official = {area['properties']['areaId']: area['geometry'] for area in boundaries}
        self.resolver = AreaResolver(boundaries, self.source)

    def find(self, title):
        evidence = dict(source='title', text=title, url='https://example.test/ds/42')
        return self.resolver.find(title, evidence)

    def test_uses_the_official_polygon_and_preserves_the_original_title(self):
        title = '  Dauerhafte Hundeauslaufflächen im Stadtbezirk Vahrenwald/List  '
        evidence = dict(source='title', text=title, url='https://example.test/ds/42')
        found, = self.resolver.find(title, evidence)
        label, geometry, kind, accuracy, method, url, attribution, actual_evidence = found
        self.assertEqual((label, kind, accuracy), (
            'Stadtbezirk Vahrenwald-List', 'area', 'Nur Stadtbezirk bekannt',
        ))
        self.assertEqual(geometry, self.official['bezirk:02'])
        self.assertEqual(self.resolver.area_ids[label], 'bezirk:02')
        self.assertEqual((url, attribution), (self.source['url'], self.source['attribution']))
        self.assertEqual(actual_evidence, evidence)
        self.assertIn('Titel', method)

    def test_area_type_disambiguates_identical_official_names(self):
        cases = (
            ('Spielplätze im Stadtbezirk Mitte', 'Stadtbezirk Mitte', 'bezirk:01', 'Nur Stadtbezirk bekannt'),
            ('Platzbenennung im Stadtteil Mitte', 'Stadtteil Mitte', 'stadtteil:01', 'Nur Stadtteil bekannt'),
            ('Platzbenennung in dem Stadtteil Mitte', 'Stadtteil Mitte', 'stadtteil:01', 'Nur Stadtteil bekannt'),
            ('Förderung des Radverkehrs im Stadtteil List', 'Stadtteil List', 'stadtteil:10', 'Nur Stadtteil bekannt'),
        )
        for title, label, area_id, accuracy in cases:
            with self.subTest(title=title):
                result, = self.find(title)
                self.assertEqual(result[:4], (label, self.official[area_id], 'area', accuracy))
                self.assertEqual(self.resolver.area_ids[label], area_id)

    def test_accepts_district_numbers_and_consistent_name_variants(self):
        titles = (
            'Busfahrplan im Stadtbezirk 03',
            'Busfahrplan im Stadtbezirk Nr. 3',
            'Straßenerneuerung im Stadtbezirk 03, Bothfeld-Vahrenheide',
            'Freie Gewerbeflächen im Stadtbezirk Hannover Bothfeld – Vahrenheide',
            'Bürgerbeteiligung für den Stadtbezirk Bothfeld-Vahrenheide (03)',
        )
        for title in titles:
            with self.subTest(title=title):
                result, = self.find(title)
                self.assertEqual(result[:2], ('Stadtbezirk Bothfeld-Vahrenheide', self.official['bezirk:03']))

    def test_route_endpoint_does_not_establish_an_area_for_the_whole_route(self):
        titles = (
            'Verbindung Stadtteil Bult - Fachmarktzentrum an der Weide',
            'Verbindung vom Stadtteil Bult zum Fachmarktzentrum an der Weide',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], [])

    def test_excluded_areas_do_not_supply_locations(self):
        titles = (
            'Radweg außerhalb des Stadtteils List',
            'Radweg statt im Stadtteil List',
            'Radweg nicht im Stadtteil List',
            'Radweg nicht nur im Stadtteil List',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], [])

    def test_date_does_not_supply_a_district_number(self):
        titles = (
            'Straßenerneuerung im Stadtbezirk 03.04.2025',
            'Straßenerneuerung im Stadtbezirk 3. 4. 2025',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], [])

    def test_skips_ambiguous_or_multiple_areas(self):
        titles = (
            'Neue Spielplätze in Ricklingen',
            'Spielplätze im Stadtbezirk 03, Vahrenwald-List',
            'Spielplätze im Stadtbezirk 03-04',
            'Spielplätze im Stadtbezirk 03, 04',
            'Spielplätze im Stadtbezirk Vahrenwald-List (03)',
            'Spielplätze im Stadtbezirk Ricklingen und im Stadtteil List',
            'Spielplätze im Stadtteil List und Kleefeld',
            'Spielplätze im Stadtteil List oder Havelse',
            'Spielplätze im Stadtteil List, Kleefeld und Bothfeld',
            'Straßenumbenennung in den Stadtteilen Herrenhausen und Nordstadt',
            'Spielplätze im Stadtteil List und im Stadtteil Havelse',
            'Neue Radwegplanung im Stadtteil List der Stadt Garbsen',
            'Parkplatzsituation in der Calenberger Neustadt und im Stadtbezirk Mitte insgesamt',
            'Ausbau der Veloroute 06 von der Innenstadt Hannover bis in den Stadtbezirk Kirchrode-Bemerode-Wülferode',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], [])

    def test_different_subject_areas_veto_a_single_locative_candidate(self):
        titles = (
            'Einführung von Bewohner*innenparkzonen in einem Teilgebiet Stadtteil Mitte und im Stadtteil Oststadt',
            'Änderungsantrag: Einführung von Bewohner*innenparkzonen in einem Teilgebiet Stadtteil Mitte un im Stadtteil Oststadt',
            'Übersicht: neue Radwege im Stadtteil List, Stadtteil Mitte',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], [])

    def test_repeated_place_names_and_proposer_names_do_not_veto_the_subject_area(self):
        titles = (
            'Übersicht: neue Radwege im Stadtteil List, Stadtteil List',
            'Änderungsantrag des Stadtbezirks Mitte zur Einführung von Schulstraßen im Stadtteil List',
            'Antrag der Fraktion im Stadtbezirk Mitte: Einrichtung eines Radwegs im Stadtteil List',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], ['Stadtteil List'])

    def test_meeting_and_committee_suffixes_do_not_supply_an_area(self):
        titles = (
            'Antwort zur Fahrradabstellanlage, Sitzung des Stadtbezirksrates Mitte am 06.06.2016',
            'Spielplatzsanierung – Sitzung des Stadtbezirksrats im Stadtbezirk Nord',
            'Spielplatzsanierung – Stadtbezirksrat im Stadtbezirk Nord, TOP 6.1',
            'Sitzung des Stadtbezirksrats im Stadtbezirk Mitte zum Thema Spielplätze',
            'Antrag der SPD-Fraktion im Stadtbezirk Mitte zur Drucksache 1451/2010',
            'Spielplatzsanierung – Sitzungsort im Stadtteil Mitte',
            'Änderungsanträge des Stadtbezirkes Misburg-Anderten zu Drucks. Nr. 1843/2008',
            'Durchführung einer Einwohnerversammlung im Stadtbezirk Vahrenwald-List',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], [])

    def test_comparison_area_is_only_a_reference(self):
        self.assertEqual([result[0] for result in self.find('Weitere Schulstraßen wie im Stadtteil List')], [])

    def test_preserves_an_explicit_subject_area_before_meeting_suffixes(self):
        title = ('Förderung des Fuß- und Radverkehrs im Stadtteil List, '
                 'Sitzung des Stadtbezirksrates im Stadtbezirk Vahrenwald-List am 06.06.2016')
        result, = self.find(title)
        self.assertEqual(self.resolver.area_ids[result[0]], 'stadtteil:10')
        self.assertEqual(result[-1]['text'], title)

    def test_place_names_inside_a_road_facility_or_subarea_are_not_matches(self):
        titles = (
            'Neue Beleuchtung an der Lister Meile',
            'Neue Spielplätze im Stadtbezirk Nordstadt',
            'Neue Spielplätze im Stadtteil List-Nord',
            'Neue Spielplätze im Stadtteil List Nord',
            'Verkehrsplanung im Stadtteil Burgstraße',
            'Kita-Förderung im Stadtteil Sahlkamp e.V.',
            'Spielplatzsanierung in der Nordstadt-Schule',
        )
        for title in titles:
            with self.subTest(title=title):
                self.assertEqual([result[0] for result in self.find(title)], [])
