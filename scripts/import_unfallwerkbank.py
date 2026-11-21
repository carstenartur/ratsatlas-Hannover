#!/usr/bin/env python3
"""Import the complete published Hannover RIS snapshot using only the stdlib.

Original compressed assets and the manifest remain byte-exact. Two derived browse
files include every document, and only existing source geometries. Nothing is
published until hashes, graph structure, references, and totals pass validation.
"""
from __future__ import annotations

import argparse
import base64
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
import http.client
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import ssl
import sys
import tempfile
import threading
import time
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit
from urllib.request import getproxies, proxy_bypass

DEFAULT_SOURCE = 'https://carstenartur.github.io/Unfallatlas/data/ris/'
KINDS = ('records', 'locations', 'relations', 'search', 'geometry', 'links', 'spatial')
MAX_NODE_BYTES = 262144
MAX_COMPRESSED_BYTES = 1048576
MAX_MANIFEST_BYTES = 1048576
MAX_ASSETS = 100000
HEX = re.compile(r'[a-f0-9]{64}\Z')
SOURCE = re.compile(r'[a-z0-9][a-z0-9-]*\Z')

class InvalidSnapshot(ValueError):
    """A source or published snapshot failed an integrity check."""


def require(condition, message):
    if not condition:
        raise InvalidSnapshot(message)


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def integer(value, minimum=0):
    return type(value) is int and minimum <= value <= 9007199254740991


def unpack(blob, maximum, name):
    try:
        require(blob.startswith(b'\x1f\x8b'), f'Expected gzip asset: {name}')
        with gzip.GzipFile(fileobj=io.BytesIO(blob)) as reader:
            raw = reader.read(maximum + 1)
        require(len(raw) <= maximum, f'Asset exceeds bounded size: {name}')
        return raw
    except (OSError, EOFError) as exc:
        raise InvalidSnapshot(f'Gzip integrity failure: {name}') from exc


def parse(raw, name):
    try:
        return json.loads(raw, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    except (UnicodeError, ValueError) as exc:
        raise InvalidSnapshot(f'Invalid JSON: {name}') from exc


class SourceReader:
    """Read files locally or through reusable HTTP connections in each worker."""
    def __init__(self, directory=None, url=DEFAULT_SOURCE):
        self.directory = Path(directory).resolve() if directory else None
        self.url = url if url.endswith('/') else url + '/'
        self.local = threading.local()
        self.connections = []
        self.lock = threading.Lock()
        self.pause_until = 0.0
        if not self.directory:
            parsed = urlsplit(self.url)
            require(parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.query
                    and not parsed.fragment and not parsed.username and not parsed.password,
                    'Source URL must be an HTTP(S) directory without credentials or query')

    def close(self):
        for connection in self.connections:
            connection.close()

    def _connection(self, target):
        proxy_url = None if proxy_bypass(target.hostname) else getproxies().get(target.scheme)
        proxy = urlsplit(proxy_url) if proxy_url else None
        require(not proxy or proxy.scheme in ('http', 'https'), 'Unsupported HTTP proxy scheme')
        headers = {}
        if proxy and proxy.username:
            token = base64.b64encode(f'{proxy.username}:{proxy.password or ""}'.encode()).decode()
            headers['Proxy-Authorization'] = 'Basic ' + token
        if target.scheme == 'https':
            connection = http.client.HTTPSConnection(proxy.hostname if proxy else target.hostname,
                (proxy.port or 80) if proxy else (target.port or 443), timeout=40,
                context=ssl.create_default_context())
            if proxy:
                connection.set_tunnel(target.hostname, target.port or 443, headers=headers)
        else:
            connection = http.client.HTTPConnection(proxy.hostname if proxy else target.hostname,
                (proxy.port or 80) if proxy else (target.port or 80), timeout=40)
        with self.lock:
            self.connections.append(connection)
        return connection, bool(proxy and target.scheme == 'http'), headers

    def read(self, name, maximum):
        require('/' not in name and '\\' not in name and name not in ('.', '..'), 'Unsafe source asset path')
        if self.directory:
            path = self.directory / name
            require(path.is_file(), f'Missing source asset: {name}')
            require(path.stat().st_size <= maximum, f'Compressed asset exceeds size limit: {name}')
            return path.read_bytes()
        target_url = urljoin(self.url, name)
        target = urlsplit(target_url)
        for attempt in range(4):
            try:
                with self.lock:
                    pause = self.pause_until - time.monotonic()
                if pause > 0:
                    time.sleep(min(pause, 60))
                if not hasattr(self.local, 'connection'):
                    self.local.connection, self.local.proxy_http, self.local.headers = self._connection(target)
                path = target_url if self.local.proxy_http else target.path
                headers = {'Accept-Encoding': 'identity', 'User-Agent': 'Ratsatlas-Hannover-Snapshot-Importer/1'}
                if self.local.proxy_http:
                    headers.update(self.local.headers)
                self.local.connection.request('GET', path, headers=headers)
                response = self.local.connection.getresponse()
                if response.status in (429, 503) and attempt < 3:
                    retry_after = response.getheader('Retry-After')
                    delay = 5 * (attempt + 1)
                    if retry_after:
                        try:
                            delay = max(0, float(retry_after))
                        except ValueError:
                            try:
                                delay = max(0, (parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)).total_seconds())
                            except (TypeError, ValueError):
                                pass
                    self.local.connection.close()
                    del self.local.connection
                    require(delay <= 60, f'Source requested a {delay:g}s retry delay; retry this import later')
                    with self.lock:
                        self.pause_until = max(self.pause_until, time.monotonic() + delay)
                    continue
                require(response.status == 200, f'HTTP {response.status} while reading {name}')
                blob = response.read(maximum + 1)
                require(len(blob) <= maximum, f'HTTP asset exceeds size limit: {name}')
                return blob
            except (OSError, http.client.HTTPException):
                if hasattr(self.local, 'connection'):
                    self.local.connection.close()
                    del self.local.connection
                if attempt == 3:
                    raise
        raise InvalidSnapshot(f'Unable to read {name}')


def descriptor(ref, expected_kind=None):
    require(isinstance(ref, dict), 'Invalid asset descriptor')
    kind = ref.get('kind')
    require(kind in KINDS and (expected_kind is None or kind == expected_kind), 'Invalid asset kind')
    sha = ref.get('sha256', '')
    require(isinstance(sha, str) and HEX.fullmatch(sha), 'Invalid asset SHA-256')
    require(ref.get('path') == f'hannover.{sha}.{kind}.json.gz', 'Unsafe or invalid asset path')
    require(integer(ref.get('bytes'), 1) and ref['bytes'] <= MAX_NODE_BYTES, 'Invalid bounded asset bytes')
    require(integer(ref.get('count')) and ref['count'] <= 64, 'Invalid bounded asset count')
    return ref


def validate_manifest(manifest):
    require(isinstance(manifest, dict) and manifest.get('schemaVersion') == 2
            and manifest.get('city') == 'hannover', 'Expected Hannover RIS schemaVersion 2')
    require(manifest.get('spatialFormat') == 'packed-bounds-v1', 'Unsupported spatial format')
    roots = manifest.get('roots')
    require(isinstance(roots, dict) and set(roots) == set(KINDS), 'Invalid generation roots')
    for kind in KINDS:
        descriptor(roots[kind], kind)
    require(digest(compact(roots)) == manifest.get('generation'), 'Generation integrity failure')
    for key in ('recordCount', 'mappedRecordCount', 'geometryCount'):
        require(integer(manifest.get(key)), f'Invalid manifest count: {key}')
    require(manifest['mappedRecordCount'] <= manifest['recordCount'], 'Invalid mapped record count')


def qualified_id(record):
    identifier, source = record.get('id'), record.get('source')
    require(isinstance(source, str) and SOURCE.fullmatch(source), 'Invalid record source')
    require(isinstance(identifier, str) and identifier and len(identifier) <= 4096
            and not any(ord(c) < 32 for c in identifier), 'Invalid source record ID')
    # Fifteen published Landtag records have legacy bare hash IDs. Keep those raw
    # IDs in the snapshot and sourceId, while qualifying their derived app ID.
    if identifier.startswith(source + ':'):
        return identifier
    require(':' not in identifier, 'Mismatched source-qualified record ID')
    return source + ':' + identifier


def valid_bounds(value):
    return (isinstance(value, list) and len(value) == 4
            and all(type(x) in (int, float) and math.isfinite(x) for x in value)
            and -180 <= value[0] <= value[2] <= 180 and -90 <= value[1] <= value[3] <= 90)


def geometry_bounds(geometry):
    require(isinstance(geometry, dict) and geometry.get('type') in
            ('Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'),
            'Invalid GeoJSON geometry')
    positions = []
    def visit(value):
        require(isinstance(value, list) and value, 'Invalid GeoJSON coordinates')
        if type(value[0]) in (int, float):
            require(len(value) >= 2 and all(type(x) in (int, float) and math.isfinite(x) for x in value)
                    and -180 <= value[0] <= 180 and -90 <= value[1] <= 90, 'Invalid GeoJSON position')
            positions.append(value)
        else:
            for child in value:
                visit(child)
    visit(geometry.get('coordinates'))
    return [min(p[0] for p in positions), min(p[1] for p in positions),
            max(p[0] for p in positions), max(p[1] for p in positions)]


class Snapshot:
    def __init__(self, reader, staging=None, workers=16):
        self.reader, self.staging, self.workers = reader, staging, workers
        self.manifest_bytes = reader.read('hannover.json', MAX_MANIFEST_BYTES)
        self.manifest = parse(self.manifest_bytes, 'hannover.json')
        validate_manifest(self.manifest)
        self.refs, self.nodes = {}, {}
        self.records, self.locations, self.geometry, self.spatial = {}, {}, {}, {}
        self.geometry_links, self.record_links = {}, {}
        self.pages = defaultdict(dict)
        self.compressed_bytes = 0
        self.raw_bytes = 0
        self.source_counts = Counter()

    def read_asset(self, ref):
        descriptor(ref)
        blob = self.reader.read(ref['path'], MAX_COMPRESSED_BYTES)
        raw = unpack(blob, MAX_NODE_BYTES, ref['path'])
        require(len(raw) == ref['bytes'] and digest(raw) == ref['sha256'],
                f'Asset integrity failure: {ref["path"]}')
        node = parse(raw, ref['path'])
        require(isinstance(node, dict) and node.get('type') in ('branch', 'leaf')
                and isinstance(node.get('entries'), list) and len(node['entries']) == ref['count'],
                f'Node count or type mismatch: {ref["path"]}')
        previous = None
        for entry in node['entries']:
            require(isinstance(entry, list) and len(entry) == 2 and isinstance(entry[0], str)
                    and (previous is None or previous < entry[0]), 'Invalid or duplicate index key')
            previous = entry[0]
        if self.staging:
            (self.staging / ref['path']).write_bytes(blob)
        return node, len(blob)

    def add_page(self, kind, key, value):
        try:
            group, page = json.loads(key)
        except (ValueError, TypeError) as exc:
            raise InvalidSnapshot('Invalid page key') from exc
        require(isinstance(group, str) and integer(page) and isinstance(value, dict), 'Invalid page key')
        items, start, total, next_page = (value.get(k) for k in ('items', 'start', 'total', 'nextPage'))
        require(isinstance(items, list) and 0 < len(items) <= 64 and integer(start) and integer(total, 1)
                and (next_page is None or next_page == page + 1), 'Invalid bounded page')
        page_key = (kind, group)
        require(page not in self.pages[page_key], 'Duplicate page')
        self.pages[page_key][page] = (start, len(items), total, next_page)
        if kind == 'locations':
            self.locations.setdefault(group, {})[page] = items
        elif kind == 'links' and group.startswith('geometry:'):
            self.geometry_links.setdefault(group, {})[page] = items
        elif kind == 'links' and group.startswith('record:'):
            self.record_links.setdefault(group[7:], {})[page] = items

    def consume(self, ref, node, compressed_bytes):
        self.compressed_bytes += compressed_bytes
        self.raw_bytes += ref['bytes']
        kind, entries = ref['kind'], node['entries']
        children = []
        if node['type'] == 'branch':
            for key, child in entries:
                descriptor(child, kind)
                children.append(child)
            self.nodes[ref['path']] = dict(type='branch', edges=[(key, child['path']) for key, child in entries])
        else:
            self.nodes[ref['path']] = dict(type='leaf', first=entries[0][0] if entries else None,
                                         last=entries[-1][0] if entries else None)
            for key, value in entries:
                require(isinstance(value, dict), 'Invalid leaf value')
                if kind == 'records':
                    require(key == value.get('id') and key not in self.records, 'Duplicate or invalid source record ID')
                    qualified_id(value)
                    require(integer(value.get('locationCount')), 'Invalid record location count')
                    self.records[key] = value
                    self.source_counts[value['source']] += 1
                elif kind == 'geometry':
                    require(key not in self.geometry and value.get('geometryId') == key, 'Duplicate or invalid geometry ID')
                    descriptor(value.get('asset'), 'spatial')
                    self.geometry[key] = value
                    children.append(value['asset'])
                elif kind == 'spatial' and key.startswith('feature:'):
                    geometry_id = value.get('properties', {}).get('geometryId')
                    require(value.get('type') == 'Feature' and isinstance(geometry_id, str)
                            and geometry_id not in self.spatial, 'Duplicate or invalid spatial feature')
                    require(valid_bounds(value.get('bounds')) and geometry_bounds(value.get('geometry')) == value['bounds'],
                            'Spatial geometry bounds mismatch')
                    self.spatial[geometry_id] = (key, value, ref['path'])
                elif key.startswith('['):
                    self.add_page(kind, key, value)
        return children

    def load(self):
        pending_refs = list(self.manifest['roots'].values())
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            while pending_refs:
                batch = []
                for ref in pending_refs:
                    descriptor(ref)
                    previous = self.refs.get(ref['path'])
                    require(previous is None or previous == ref, 'Conflicting asset descriptors')
                    if previous is None:
                        self.refs[ref['path']] = ref
                        require(len(self.refs) <= MAX_ASSETS, 'Snapshot asset limit exceeded')
                        batch.append(ref)
                pending_refs = []
                futures = {pool.submit(self.read_asset, ref): ref for ref in batch}
                for future in as_completed(futures):
                    ref = futures.pop(future)
                    node, compressed = future.result()
                    pending_refs.extend(self.consume(ref, node, compressed))
        self.verify_tree_ranges()
        self.verify_pages()
        result = self.derive()
        # All source files are already verified and copied. Keeping their parsed
        # indexes while comparing the 40 MB browse JSON can double peak memory.
        for index in (self.records, self.locations, self.geometry, self.spatial,
                      self.geometry_links, self.record_links, self.pages, self.nodes):
            index.clear()
        return result

    def verify_tree_ranges(self):
        checked, visiting = {}, set()
        def visit(path):
            if path in checked:
                return checked[path]
            require(path not in visiting, 'Cyclic snapshot index')
            visiting.add(path)
            node = self.nodes[path]
            if node['type'] == 'leaf':
                bounds = node['first'], node['last']
            else:
                first, previous = None, None
                for maximum, child in node['edges']:
                    low, high = visit(child)
                    require(high == maximum and low is not None and (previous is None or previous < low),
                            'Index branch range mismatch')
                    first = low if first is None else first
                    previous = high
                bounds = first, previous
            visiting.remove(path)
            checked[path] = bounds
            return bounds
        for ref in self.manifest['roots'].values():
            visit(ref['path'])

    def verify_pages(self):
        for page_key, pages in self.pages.items():
            offset, total = 0, None
            require(sorted(pages) == list(range(len(pages))), 'Missing continuation page')
            for page, (start, count, expected, next_page) in sorted(pages.items()):
                require(start == offset and (total is None or total == expected), 'Page count mismatch')
                total = expected
                offset += count
                require(next_page == (page + 1 if page + 1 < len(pages) else None), 'Broken page continuation')
            require(offset == total, 'Incomplete paginated list')
        distribution = self.manifest.get('provenance', {}).get('distribution')
        if distribution:
            require(distribution.get('assetCount') == len(self.refs)
                    and distribution.get('compressedBytes') == self.compressed_bytes
                    and distribution.get('uncompressedBytes') == self.raw_bytes,
                    'Provenance distribution count or bytes mismatch')

    @staticmethod
    def flatten(pages):
        return [item for page in sorted(pages) for item in pages[page]]

    def derive(self):
        require(set(self.geometry) == set(self.spatial), 'Geometry index count mismatch')
        require(len(self.records) == self.manifest['recordCount'], 'Record count mismatch')
        require(len(self.geometry) == self.manifest['geometryCount'], 'Geometry count mismatch')
        app_ids = {key: qualified_id(record) for key, record in self.records.items()}
        require(len(set(app_ids.values())) == len(app_ids), 'Duplicate source-qualified record ID')
        mapped, features = set(), []
        geometry_records = defaultdict(set)
        for geometry_id, locator in self.geometry.items():
            key, feature, path = self.spatial[geometry_id]
            require(locator.get('spatialKey') == key and locator['asset']['path'] == path, 'Geometry locator mismatch')
            links = self.flatten(self.geometry_links.get(geometry_id, {}))
            record_ids = set()
            for link in links:
                require(isinstance(link, dict) and link.get('recordId') in self.records, 'Unknown geometry record reference')
                source_id = link['recordId']
                record_ids.add(source_id)
                geometry_records[source_id].add(geometry_id)
            require(len(record_ids) == feature['properties'].get('recordCount') and record_ids,
                    'Spatial feature record count mismatch')
            mapped.update(record_ids)
            features.append({**feature, 'properties': {**feature['properties'],
                            'recordIds': sorted(app_ids[key] for key in record_ids)}})
        require(len(mapped) == self.manifest['mappedRecordCount'], 'Mapped record count mismatch')
        for key, pages in self.record_links.items():
            require(key in self.records and set(self.flatten(pages)) == geometry_records[key], 'Record geometry links mismatch')
        require(set(self.record_links) == mapped, 'Missing record geometry links')
        require(set(self.locations) <= set(self.records), 'Unknown location record reference')
        levels, rows = {}, []
        for source_id, record in self.records.items():
            locations = self.flatten(self.locations.get(source_id, {}))
            require(len(locations) == record['locationCount'], 'Record location count mismatch')
            for field, count_key in (('events', 'eventCount'), ('relationships', 'relationshipCount')):
                expected = record.get(count_key, 0)
                actual = sum(row[1] for row in self.pages.get(('links', field + ':' + source_id), {}).values())
                require(integer(expected) and actual == expected, f'Record {field} count mismatch')
            level = record.get('sourceContext', {}).get('level')
            require(level in ('city', 'region', 'state', 'federal', 'eu'), 'Missing political source level')
            counts = levels.setdefault(level, {'records': 0, 'mapped': 0})
            counts['records'] += 1
            counts['mapped'] += int(source_id in mapped)
            labels = []
            for location in locations:
                require(isinstance(location, dict) and isinstance(location.get('label'), str), 'Invalid location label')
                if location['label'] not in labels:
                    labels.append(location['label'])
                if 'geometryId' in location:
                    require(location['geometryId'] in geometry_records[source_id], 'Location geometry link mismatch')
            rows.append(dict(id=app_ids[source_id], sourceId=source_id, title=record.get('title', ''),
                number=record.get('number'), date=record.get('date'), type=record.get('type'),
                source=record['source'], level=level, body=record.get('gremium'),
                mapped=source_id in mapped, locations=labels))
        require(self.manifest.get('levelCounts', levels) == levels, 'Political level counts mismatch')
        # Stable serialization keeps derivative hashes unchanged across repeat imports.
        rows.sort(key=lambda row: row['id'])
        features.sort(key=lambda feature: feature['properties']['geometryId'])
        self.counts = dict(records=len(rows), mappedRecords=len(mapped),
            unlocatedRecords=len(rows) - len(mapped), geometries=len(features), levels=levels,
            sources=dict(sorted(self.source_counts.items())), snapshotAssets=len(self.refs))
        return (dict(schemaVersion=1, generation=self.manifest['generation'], records=rows),
                dict(type='FeatureCollection', generation=self.manifest['generation'], features=features))


def write_derived(directory, name, value, count):
    raw = compact(value)
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    (directory/name).write_bytes(compressed)
    return dict(path=name, sha256=digest(raw), bytes=len(raw), compressedBytes=len(compressed),
                compressedSha256=digest(compressed), count=count)


def check_published(directory):
    reader = SourceReader(directory=directory)
    snapshot = Snapshot(reader)
    index, geojson = snapshot.load()
    migration = parse((directory/'migration.json').read_bytes(), 'migration.json')
    require(migration.get('source', {}).get('manifestSha256') == digest(snapshot.manifest_bytes)
            and migration['source'].get('generation') == snapshot.manifest['generation'],
            'Migration generation integrity failure')
    require(migration.get('counts') == snapshot.counts, 'Migration count mismatch')
    for key, expected in (('searchIndex', index), ('map', geojson)):
        ref = migration.get('derived', {}).get(key, {})
        expected_name = 'search-index.json.gz' if key == 'searchIndex' else 'map.geojson.gz'
        require(ref.get('path') == expected_name, 'Invalid derived asset path')
        blob = (directory/expected_name).read_bytes()
        require(len(blob) == ref.get('compressedBytes') and digest(blob) == ref.get('compressedSha256'),
                f'Derived integrity failure: {expected_name}')
        expected_bytes = compact(expected)
        raw = unpack(blob, max(len(expected_bytes), 1), expected_name)
        require(len(raw) == ref.get('bytes') and digest(raw) == ref.get('sha256') and raw == expected_bytes,
                f'Derived integrity failure: {expected_name}')
    return snapshot.counts


def install_snapshot(reader, output, source_url, workers):
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.ris-import-', dir=output.parent))
    backup = None
    try:
        snapshot = Snapshot(reader, staging, workers)
        index, geojson = snapshot.load()
        derived = dict(searchIndex=write_derived(staging, 'search-index.json.gz', index, len(index['records'])),
                       map=write_derived(staging, 'map.geojson.gz', geojson, len(geojson['features'])))
        migration = dict(schemaVersion=1, importer='ratsatlas-hannover/import_unfallwerkbank.py',
            importedAt=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            source=dict(url=source_url, manifestUrl=urljoin(source_url, 'hannover.json'),
                        manifestSha256=digest(snapshot.manifest_bytes), generation=snapshot.manifest['generation']),
            counts=snapshot.counts, derived=derived,
            identity=dict(id='Source-qualified application ID', sourceId='Unchanged source snapshot record ID'),
            snapshot=dict(assetCount=len(snapshot.refs), compressedBytes=snapshot.compressed_bytes,
                          uncompressedBytes=snapshot.raw_bytes))
        (staging/'migration.json').write_bytes(compact(migration) + b'\n')
        # The mutable source manifest is the final staged file. The old directory
        # stays intact throughout download, validation, and derivative generation.
        (staging/'hannover.json').write_bytes(snapshot.manifest_bytes)
        if output.exists():
            backup = Path(tempfile.mkdtemp(prefix='.ris-previous-', dir=output.parent))
            backup.rmdir()
            output.rename(backup)
        try:
            staging.rename(output)
        except BaseException:
            if backup:
                backup.rename(output)
                backup = None
            raise
        if backup:
            shutil.rmtree(backup)
            backup = None
        return snapshot.counts
    finally:
        reader.close()
        if staging.exists():
            shutil.rmtree(staging)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-url', default=DEFAULT_SOURCE, help='Published catalog directory (also provenance for local imports)')
    parser.add_argument('--source-dir', type=Path, help='Import an already downloaded complete snapshot')
    parser.add_argument('--output-dir', type=Path, default=Path('site/data/ris'))
    parser.add_argument('--workers', type=int, default=16, help='Concurrent asset reads, 1–32')
    parser.add_argument('--check', action='store_true', help='Verify the published snapshot and both derived files offline')
    args = parser.parse_args(argv)
    try:
        require(1 <= args.workers <= 32, 'Workers must be between 1 and 32')
        if args.check:
            counts = check_published(args.output_dir.resolve())
        else:
            reader = SourceReader(args.source_dir, args.source_url)
            counts = install_snapshot(reader, args.output_dir, reader.url, args.workers)
        print(json.dumps({'status': 'verified' if args.check else 'imported', 'counts': counts}, ensure_ascii=False))
        return 0
    except (InvalidSnapshot, OSError, http.client.HTTPException) as exc:
        print(f'Import failed: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
