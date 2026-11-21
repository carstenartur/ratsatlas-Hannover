import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from scripts.build_geography import build_geography, load_boundaries, project_geography


def district(number, west, east):
    return {
        "type": "Feature",
        "properties": {"areaId": f"bezirk:{number}", "kind": "bezirk", "name": number, "parentId": None},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[west, 0], [east, 0], [east, 2], [west, 2], [west, 0]]],
        },
    }


def place(geometry_id, kind, coordinates, record_ids):
    return {
        "type": "Feature",
        "properties": {"geometryId": geometry_id, "recordIds": record_ids},
        "geometry": {"type": kind, "coordinates": coordinates},
    }


def neighborhood(number, parent, west, east):
    boundary = district(number, west, east)
    boundary["properties"].update(areaId=f"stadtteil:{number}", kind="stadtteil", parentId=f"bezirk:{parent}")
    return boundary


def scoped_place(geometry_id, boundary, record_ids):
    geometry = boundary["geometry"]
    feature = place(geometry_id, geometry["type"], geometry["coordinates"], record_ids)
    feature["properties"].update(kind="area", areaId=boundary["properties"]["areaId"])
    return feature


class GeographyTests(unittest.TestCase):
    def test_membership_uses_geometry_intersections_and_unique_qualified_ids(self):
        features = [
            place("street", "LineString", [[-0.1, 1], [2.1, 1]], ["stadt:1", "region:1", "stadt:1"]),
            place("office", "Point", [0.5, 0.5], ["stadt:1", "stadt:2"]),
            place("outside", "Point", [3, 1], ["stadt:3"]),
            place("far", "Polygon", [[[4, 4], [5, 4], [5, 5], [4, 4]]], ["stadt:2"]),
            place("project", "Polygon", [[[1.1, 0.5], [1.8, 0.5], [1.8, 1.2], [1.1, 0.5]]], ["stadt:4"]),
        ]
        areas = project_geography([district("01", 0, 1), district("02", 1, 2)], features)
        self.assertEqual(areas[0]["properties"]["geometryIds"], ["office", "street"])
        self.assertEqual(areas[0]["properties"]["recordIds"], ["region:1", "stadt:1", "stadt:2"])
        self.assertEqual(areas[1]["properties"]["geometryIds"], ["project", "street"])
        self.assertEqual(areas[1]["properties"]["recordIds"], ["region:1", "stadt:1", "stadt:4"])

    def test_scoped_geometries_follow_official_membership_at_shared_boundaries(self):
        boundaries = [district("01", 0, 1), district("02", 1, 2),
                      neighborhood("10", "01", 0.5, 1), neighborhood("11", "01", 0, 0.5),
                      neighborhood("12", "02", 1, 1.5)]
        places = [scoped_place("district", boundaries[0], ["stadt:1"]),
                  scoped_place("neighborhood", boundaries[2], ["stadt:2"])]
        areas = project_geography(boundaries, places)
        self.assertEqual(
            [(area["properties"]["areaId"], area["properties"]["geometryIds"], area["properties"]["recordIds"])
             for area in areas],
            [("bezirk:01", ["district", "neighborhood"], ["stadt:1", "stadt:2"]),
             ("bezirk:02", [], []),
             ("stadtteil:10", ["neighborhood"], ["stadt:2"]),
             ("stadtteil:11", [], []),
             ("stadtteil:12", [], [])],
        )

    def test_rejects_unknown_or_missing_scoped_area_ids(self):
        boundaries = [district("01", 0, 1)]
        for area_id in ("bezirk:99", None):
            with self.subTest(area_id=area_id):
                location = scoped_place("district", boundaries[0], ["stadt:1"])
                del location["properties"]["areaId"]
                if area_id is not None:
                    location["properties"]["areaId"] = area_id
                with self.assertRaisesRegex(ValueError, "Gebietskennung"):
                    project_geography(boundaries, [location])

    def test_rejects_scoped_geometry_different_from_its_official_polygon(self):
        boundaries = [district("01", 0, 1), district("02", 1, 2)]
        location = scoped_place("district", boundaries[1], ["stadt:1"])
        location["properties"]["areaId"] = "bezirk:01"
        with self.assertRaisesRegex(ValueError, "Gebietsfläche"):
            project_geography(boundaries, [location])

    def test_official_snapshot_includes_each_named_district_and_neighborhood(self):
        boundaries, source = load_boundaries()
        districts = {f["properties"]["areaId"] for f in boundaries if f["properties"]["kind"] == "bezirk"}
        neighborhoods = [f["properties"] for f in boundaries if f["properties"]["kind"] == "stadtteil"]
        self.assertEqual(districts, {f"bezirk:{number:02d}" for number in range(1, 14)})
        self.assertEqual(len(neighborhoods), 51)
        self.assertEqual(len({f["areaId"] for f in neighborhoods}), 51)
        self.assertEqual({f["parentId"] for f in neighborhoods}, districts)
        self.assertEqual(next(f for f in neighborhoods if f["areaId"] == "stadtteil:10")["name"], "List")
        x, y = boundaries[0]["geometry"]["coordinates"][0][0][:2]
        self.assertTrue(9 < x < 10 and 52 < y < 53)
        self.assertIn("Landeshauptstadt Hannover", source["publisher"])
        self.assertEqual(source["attribution"], "Datenquelle: CC-BY-4.0 – Bereich Geoinformation – LH Hannover")
        self.assertEqual(source["licenseUrl"], "https://creativecommons.org/licenses/by/4.0/")

    def test_build_links_geography_to_verified_map_and_is_repeatable(self):
        map_data = {"type": "FeatureCollection", "generation": "original", "features": [
            place("list", "Point", [9.743, 52.4], ["stadt:1"]),
            place("outside", "Point", [9.6, 52.5], ["stadt:2"]),
        ]}
        raw = json.dumps(map_data).encode()
        sha = hashlib.sha256(raw).hexdigest()
        packed = gzip.compress(raw)
        manifest = {"sourceGeneration": "original", "derived": {
            "map": {"path": "map.geojson.gz", "sha256": sha, "bytes": len(raw), "compressedBytes": len(packed)},
        }}
        with tempfile.TemporaryDirectory() as root:
            output = Path(root)
            (output / "map.geojson.gz").write_bytes(packed)
            manifest_file = output / "enrichment.json"
            manifest_file.write_text(json.dumps(manifest))
            build_geography(output)
            metadata = json.loads(manifest_file.read_text())
            descriptor = metadata["derived"]["geography"]
            asset = output / descriptor["path"]
            first_run = asset.read_bytes()
            unpacked = gzip.decompress(first_run)
            self.assertEqual(descriptor["sha256"], hashlib.sha256(unpacked).hexdigest())
            self.assertEqual(descriptor["bytes"], len(unpacked))
            self.assertEqual(descriptor["compressedBytes"], len(first_run))
            payload = json.loads(unpacked)
            self.assertEqual(payload["generation"], "original")
            self.assertEqual(payload["mapSha256"], sha)
            self.assertEqual(len(payload["features"]), 64)
            self.assertEqual(metadata["derived"]["map"], manifest["derived"]["map"])
            listed = [f["properties"]["areaId"] for f in payload["features"] if "stadt:1" in f["properties"]["recordIds"]]
            self.assertEqual(listed, ["bezirk:02", "stadtteil:10"])
            self.assertFalse(any("stadt:2" in f["properties"]["recordIds"] for f in payload["features"]))
            build_geography(output)
            self.assertEqual(asset.read_bytes(), first_run)
            (output / "map.geojson.gz").write_bytes(gzip.compress(raw.replace(b"list", b"city")))
            with self.assertRaisesRegex(ValueError, "Prüfsumme"):
                build_geography(output)
            self.assertEqual(asset.read_bytes(), first_run)
