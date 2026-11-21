#!/usr/bin/env python3
"""Build the Hannover area overlay from official boundaries and the enriched map."""

import argparse
from collections import Counter, defaultdict
import gzip
from hashlib import sha256
import json
from pathlib import Path
import tempfile

from shapely.geometry import mapping, shape
from shapely.strtree import STRtree


SOURCE_DIR = Path(__file__).resolve().parents[1] / 'data' / 'geography'
DISPLAY_TOLERANCE = 0.000018  # Degrees, at most about two metres at Hannover's latitude.


def load_boundaries():
    source = json.loads((SOURCE_DIR / 'source.json').read_text(encoding='utf-8'))
    raw = (SOURCE_DIR / 'hannover-skh5.geojson').read_bytes()
    if sha256(raw).hexdigest() != source['snapshotSha256']:
        raise ValueError('Die Prüfsumme der amtlichen Gebietsgrenzen stimmt nicht.')
    collection = json.loads(raw)
    features = collection['features']
    properties = [feature['properties'] for feature in features]
    ids = {area['areaId'] for area in properties}
    counts = Counter(area['kind'] for area in properties)
    if collection['type'] != 'FeatureCollection' or counts != {'bezirk': 13, 'stadtteil': 51} or len(ids) != 64:
        raise ValueError('Erwartet werden 13 Stadtbezirke und 51 Stadtteile.')
    for area in properties:
        kind, number = area['areaId'].split(':', 1)
        parent = area['parentId']
        if (kind != area['kind'] or len(number) != 2 or not number.isascii() or not number.isdecimal()
                or not area['name'] or (parent is not None if kind == 'bezirk'
                                        else parent not in ids or not parent.startswith('bezirk:'))):
            raise ValueError(f'Ungültige amtliche Gebietskennung: {area["areaId"]}')
    return features, source


def display_value(value):
    """Round only the coordinates passed to the map renderer."""
    return [display_value(item) for item in value] if isinstance(value, (tuple, list)) else round(value, 6)


def project_geography(boundaries, locations):
    areas = [shape(feature['geometry']) for feature in boundaries]
    if any(area.is_empty or not area.is_valid or area.geom_type not in ('Polygon', 'MultiPolygon') for area in areas):
        raise ValueError('Mindestens eine amtliche Gebietsfläche ist leer oder ungültig.')

    place_ids = [feature['properties']['geometryId'] for feature in locations]
    if len(set(place_ids)) != len(place_ids):
        raise ValueError('Die Kartenprojektion enthält doppelte Geometriekennungen.')
    place_shapes = [shape(feature['geometry']) for feature in locations]
    if any(place.is_empty or not place.is_valid for place in place_shapes):
        raise ValueError('Die Kartenprojektion enthält leere oder ungültige Geometrien.')
    boundaries_by_id = {feature['properties']['areaId']: feature for feature in boundaries}
    ordinary_positions = []
    explicit_positions = defaultdict(list)
    for position, location in enumerate(locations):
        properties = location['properties']
        if 'areaId' not in properties and properties.get('kind') != 'area':
            ordinary_positions.append(position)
            continue
        area_id = properties.get('areaId')
        boundary = boundaries_by_id.get(area_id) if isinstance(area_id, str) else None
        if boundary is None:
            raise ValueError(f'Ungültige Gebietskennung am Kartenort {place_ids[position]}: {area_id!r}')
        if location['geometry'] != boundary['geometry']:
            raise ValueError(f'Kartenort {place_ids[position]} weicht von der amtlichen Gebietsfläche {area_id} ab.')
        explicit_positions[area_id].append(position)
        parent = boundary['properties']['parentId']
        if parent is not None:
            explicit_positions[parent].append(position)

    index = STRtree([place_shapes[position] for position in ordinary_positions])
    features = []
    for boundary, area in zip(boundaries, areas):
        area_id = boundary['properties']['areaId']
        contained = [ordinary_positions[position] for position in index.query(area, predicate='intersects')]
        contained.extend(explicit_positions[area_id])
        geometry_ids = sorted(place_ids[position] for position in contained)
        record_ids = sorted({
            record_id for position in contained for record_id in locations[position]['properties']['recordIds']
        })
        simplified = area.simplify(DISPLAY_TOLERANCE, preserve_topology=True)
        display = mapping(simplified)
        display['coordinates'] = display_value(display['coordinates'])
        main = max(simplified.geoms, key=lambda piece: piece.area) if simplified.geom_type == 'MultiPolygon' else simplified
        anchor = main.representative_point()
        properties = dict(boundary['properties'], geometryIds=geometry_ids, recordIds=record_ids,
                          labelPoint=display_value((anchor.x, anchor.y)))
        features.append(dict(type='Feature', properties=properties, geometry=display))
    return features


def read_enriched_map(data_dir, manifest):
    descriptor = manifest['derived']['map']
    path = descriptor['path']
    if Path(path).name != path or not path.endswith('.gz'):
        raise ValueError('Ungültiger Pfad zur ergänzten Kartenprojektion.')
    packed = (data_dir / path).read_bytes()
    raw = gzip.decompress(packed)
    if (len(packed) != descriptor['compressedBytes']
            or len(raw) != descriptor['bytes'] or sha256(raw).hexdigest() != descriptor['sha256']):
        raise ValueError('Die Prüfsumme oder Größe der ergänzten Kartenprojektion stimmt nicht.')
    data = json.loads(raw)
    if data['type'] != 'FeatureCollection' or data['generation'] != manifest['sourceGeneration']:
        raise ValueError('Die ergänzte Kartenprojektion gehört zu einem anderen Datenstand.')
    return data, descriptor


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True, allow_nan=False).encode('utf-8')


def replace_bytes(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f'.{path.name}.', delete=False) as file:
        staging = Path(file.name)
    try:
        staging.write_bytes(data)
        staging.chmod(0o644)
        staging.replace(path)
    finally:
        staging.unlink(missing_ok=True)


def build_geography(data_dir):
    manifest_path = data_dir / 'enrichment.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    map_data, map_descriptor = read_enriched_map(data_dir, manifest)
    boundaries, source = load_boundaries()
    features = project_geography(boundaries, map_data['features'])
    payload = dict(type='FeatureCollection', generation=map_data['generation'], mapSha256=map_descriptor['sha256'],
                   sources=[source], features=features)
    raw = json_bytes(payload)
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    descriptor = dict(path='geography.geojson.gz', sha256=sha256(raw).hexdigest(), bytes=len(raw),
                      compressedBytes=len(packed), compressedSha256=sha256(packed).hexdigest(), count=len(features))
    replace_bytes(data_dir / descriptor['path'], packed)
    manifest['derived']['geography'] = descriptor
    replace_bytes(manifest_path, json_bytes(manifest))
    return descriptor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path('site/data/enriched'))
    descriptor = build_geography(parser.parse_args().data_dir)
    print(f'{descriptor["count"]} Gebiete: {descriptor["path"]} ({descriptor["compressedBytes"]} Bytes)')


if __name__ == '__main__':
    main()
