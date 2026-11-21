"""Test which official road-axis intersections qualify as one mapped place."""
import copy
import gzip
import json
from pathlib import Path
import unittest

from scripts.geocoding_geometry import intersection_geometry


def line(*positions):
    return dict(type='LineString', coordinates=[list(position) for position in positions])


def parallel_axes(*longitudes):
    return dict(type='MultiLineString', coordinates=[
        [[longitude, 52.399], [longitude, 52.401]] for longitude in longitudes
    ])


class RoadAxisIntersectionTests(unittest.TestCase):
    def test_returns_actual_crossing_and_preserves_axes(self):
        east_west = line((9.748, 52.4), (9.752, 52.4))
        north_south = line((9.75, 52.399), (9.75, 52.401))
        original = copy.deepcopy([east_west, north_south])
        self.assertEqual(intersection_geometry(east_west, north_south),
                         dict(type='Point', coordinates=[9.75, 52.4]))
        self.assertEqual([east_west, north_south], original)

    def test_accepts_an_actual_shared_endpoint(self):
        self.assertEqual(intersection_geometry(
            line((9.748, 52.4), (9.75, 52.4)),
            line((9.75, 52.4), (9.75, 52.401)),
        ), dict(type='Point', coordinates=[9.75, 52.4]))

    def test_does_not_snap_nearby_parallel_axes(self):
        self.assertIsNone(intersection_geometry(
            line((9.748, 52.4), (9.752, 52.4)),
            line((9.748, 52.40001), (9.752, 52.40001)),
        ))

    def test_compact_crossings_are_rounded_and_sorted(self):
        east_west = line((9.748, 52.4000003), (9.752, 52.4000003))
        lanes = parallel_axes(9.750876543, 9.749876543)
        expected = dict(type='MultiPoint', coordinates=[[9.749877, 52.4], [9.750877, 52.4]])
        self.assertEqual(intersection_geometry(east_west, lanes), expected)
        self.assertEqual(intersection_geometry(lanes, east_west), expected)

    def test_rejects_crossings_when_full_diameter_exceeds_eighty_meters(self):
        east_west = line((9.748, 52.4), (9.752, 52.4))
        for lanes in [parallel_axes(9.75, 9.7512), parallel_axes(9.75, 9.7506, 9.7512)]:
            with self.subTest(lanes=lanes):
                self.assertIsNone(intersection_geometry(east_west, lanes))

    def test_rejects_nearby_crossings_without_a_local_connection(self):
        isolated = dict(type='MultiLineString', coordinates=[
            [[9.74992, 52.4], [9.75008, 52.4]],
            [[9.7504, 52.4], [9.7506, 52.4]],
        ])
        long_detour = line((9.74992, 52.4), (9.75008, 52.4), (9.75008, 52.402),
                           (9.7504, 52.402), (9.7504, 52.4), (9.7506, 52.4))
        cross_axes = dict(type='MultiLineString', coordinates=[
            [[9.75, 52.39994], [9.75, 52.40006]],
            [[9.7505, 52.39994], [9.7505, 52.40006]],
        ])
        for connection, first in [('disconnected', isolated), ('distant loop', long_detour)]:
            with self.subTest(connection=connection):
                self.assertIsNone(intersection_geometry(first, cross_axes))

    def test_rejects_overlaps_even_if_there_is_also_a_crossing(self):
        east_west = line((9.748, 52.4), (9.752, 52.4))
        overlap = line((9.749, 52.4), (9.75, 52.4))
        mixed = dict(type='MultiLineString', coordinates=[
            overlap['coordinates'], [[9.751, 52.399], [9.751, 52.401]],
        ])
        for second in [overlap, mixed]:
            with self.subTest(second=second):
                self.assertIsNone(intersection_geometry(east_west, second))

    def test_hannover_gazetteer_single_and_divided_crossings(self):
        names = {'Hahnenstraße', 'Callinstraße', 'Hildesheimer Straße', 'Willmerstraße'}
        gazetteer = Path(__file__).resolve().parents[1] / 'data/geocoding/hannover-atkis.json.gz'
        with gzip.open(gazetteer, 'rt', encoding='utf-8') as data:
            axes = {entry['name']: entry['geometry'] for entry in json.load(data)['entries']
                    if entry['kind'] == 'street' and entry['name'] in names}
        self.assertEqual(axes.keys(), names)
        self.assertEqual(intersection_geometry(axes['Hahnenstraße'], axes['Callinstraße']),
                         dict(type='Point', coordinates=[9.717473, 52.386018]))
        self.assertEqual(intersection_geometry(axes['Hildesheimer Straße'], axes['Willmerstraße']),
                         dict(type='MultiPoint', coordinates=[[9.764535, 52.342898], [9.764667, 52.342723]]))
