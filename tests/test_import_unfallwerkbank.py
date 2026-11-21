"""CLI integration tests: preserve the full corpus and reject incomplete imports."""
import gzip
import functools
import http.server
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'import_unfallwerkbank.py'
KINDS = ['records', 'locations', 'relations', 'search', 'geometry', 'links', 'spatial']

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()

def put_node(directory, kind, entries, **extra):
    raw = compact({'type': 'leaf', 'entries': sorted(entries)})
    digest = hashlib.sha256(raw).hexdigest()
    name = f'hannover.{digest}.{kind}.json.gz'
    (directory / name).write_bytes(gzip.compress(raw, mtime=0))
    return dict(path=name, sha256=digest, bytes=len(raw), count=len(entries), kind=kind, **extra)

def page(identifier, items):
    return [json.dumps([identifier, 0], separators=(',', ':')), dict(items=items, start=0, total=len(items), nextPage=None)]

def fixture(directory):
    directory.mkdir()
    city = 'hannover-sim:1'
    region = 'region-hannover-ris:vo:1'
    state = '0123456789abcdef'
    geometry = {'type': 'LineString', 'coordinates': [[9.7, 52.3], [9.8, 52.4]]}
    geometry_id = 'geometry:' + hashlib.sha256(compact(geometry)).hexdigest()
    feature_key = 'feature:0000000000000000:' + geometry_id
    feature = dict(type='Feature', geometry=geometry, properties=dict(geometryId=geometry_id,
                   accuracy='derived', label='Belegte Straße', recordCount=2), bounds=[9.7, 52.3, 9.8, 52.4])
    records = []
    for identifier, source, level in [(city, 'hannover-sim', 'city'), (region, 'region-hannover-ris', 'region'), (state, 'niedersachsen-landtag', 'state')]:
        mapped = identifier != state
        records.append([identifier, dict(id=identifier, title='Straßenraum' if mapped else 'Ohne Kartenort',
            number='1/2026', type='Anfrage', date='2026-11-01', source=source,
            sourceContext=dict(level=level, publisher='Amtliche Quelle'), gremium='Verkehrsausschuss',
            url='https://example.org/' + identifier, locationCount=1 if mapped else 0, hasLocations=True,
            locationAssessment=dict(status='mapped' if mapped else 'unresolved'))])
    roots = {k: None for k in KINDS}
    roots['records'] = put_node(directory, 'records', records)
    locations = [page(identifier, [dict(id='location:' + identifier, label='Belegte Straße', kind='street',
                  mapped=True, geometryId=geometry_id, evidence=dict(source='document', text='Beleg'))]) for identifier in [city, region]]
    roots['locations'] = put_node(directory, 'locations', locations)
    roots['relations'] = put_node(directory, 'relations', [])
    roots['search'] = put_node(directory, 'search', [page('strassenraum', [city, region]), page('ohne', [state])])
    roots['links'] = put_node(directory, 'links', [page(geometry_id, [dict(recordId=identifier, locationId='location:' + identifier, locationIndex=0, accuracy='derived', label='Belegte Straße') for identifier in [city, region]]), page('record:' + city, [geometry_id]), page('record:' + region, [geometry_id])])
    roots['spatial'] = put_node(directory, 'spatial', [[feature_key, feature]], bounds=[9.7, 52.3, 9.8, 52.4], featureCount=1)
    roots['geometry'] = put_node(directory, 'geometry', [[geometry_id, dict(geometryId=geometry_id, spatialKey=feature_key, asset=roots['spatial'])]])
    manifest = dict(schemaVersion=2, city='hannover', spatialFormat='packed-bounds-v1', generatedAt='2026-11-01T10:00:00.000Z',
        roots=roots, generation=hashlib.sha256(compact(roots)).hexdigest(), recordCount=3, mappedRecordCount=2,
        geometryCount=1, levelCounts={level:dict(records=1, mapped=int(level!='state')) for level in ['city','region','state']},
        coverage=dict(complete=False, warnings=['Teilbestand']), sourceStatuses=[],
        provenance=dict(sourceVerifiedAt='2026-11-01T10:00:00.000Z'))
    (directory/'hannover.json').write_bytes(compact(manifest))
    return manifest

class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root/'source'
        self.output = self.root/'published'
        self.manifest = fixture(self.source)
    def tearDown(self):
        self.temp.cleanup()
    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)
    def import_data(self):
        return self.run_cli('--source-dir', str(self.source), '--output-dir', str(self.output))
    def read_gzip(self, name):
        return json.loads(gzip.decompress((self.output/name).read_bytes()))
    def test_all_sources_and_unlocated_records_survive_duplicate_document_numbers(self):
        result = self.import_data()
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = self.read_gzip('search-index.json.gz')['records']
        self.assertEqual(len(rows), 3)
        self.assertEqual({r['number'] for r in rows}, {'1/2026'})
        by_id = {r['id']: r for r in rows}
        self.assertEqual(set(by_id), {'hannover-sim:1', 'region-hannover-ris:vo:1', 'niedersachsen-landtag:0123456789abcdef'})
        state = by_id['niedersachsen-landtag:0123456789abcdef']
        self.assertEqual(state['sourceId'], '0123456789abcdef')
        self.assertFalse(state['mapped'])
        self.assertEqual(state['locations'], [])
        self.assertEqual(by_id['hannover-sim:1']['locations'], ['Belegte Straße'])
        features = self.read_gzip('map.geojson.gz')['features']
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]['geometry'], {'type':'LineString','coordinates':[[9.7,52.3],[9.8,52.4]]})
        self.assertEqual(set(features[0]['properties']['recordIds']), {'hannover-sim:1', 'region-hannover-ris:vo:1'})
        self.assertEqual((self.output/'hannover.json').read_bytes(), (self.source/'hannover.json').read_bytes())
        for asset in self.source.glob('*.gz'):
            self.assertEqual((self.output/asset.name).read_bytes(), asset.read_bytes())
        migration = json.loads((self.output/'migration.json').read_text())
        self.assertEqual(migration['source']['generation'], self.manifest['generation'])
        self.assertEqual(migration['counts']['unlocatedRecords'], 1)
        self.assertEqual(json.loads((self.output/'hannover.json').read_text())['provenance']['sourceVerifiedAt'], '2026-11-01T10:00:00.000Z')
        check = self.run_cli('--output-dir', str(self.output), '--check')
        self.assertEqual(check.returncode, 0, check.stderr)
    def test_corrupt_asset_does_not_replace_previous_published_generation(self):
        first = self.import_data()
        self.assertEqual(first.returncode, 0, first.stderr)
        old = {p.name:p.read_bytes() for p in self.output.iterdir()}
        bad = self.source/self.manifest['roots']['records']['path']
        bad.write_bytes(gzip.compress(b'{"type":"leaf","entries":[]}'))
        result = self.import_data()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('integrity', result.stderr.lower())
        self.assertEqual({p.name:p.read_bytes() for p in self.output.iterdir()}, old)
    def test_bad_generation_is_rejected_before_publishing(self):
        self.manifest['generation'] = '0'*64
        (self.source/'hannover.json').write_bytes(compact(self.manifest))
        result = self.import_data()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('generation', result.stderr.lower())
        self.assertFalse((self.output/'hannover.json').exists())
    def test_unsafe_asset_path_is_rejected(self):
        self.manifest['roots']['records']['path'] = '../outside.json.gz'
        self.manifest['generation'] = hashlib.sha256(compact(self.manifest['roots'])).hexdigest()
        (self.source/'hannover.json').write_bytes(compact(self.manifest))
        result = self.import_data()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('path', result.stderr.lower())
        self.assertFalse((self.output/'hannover.json').exists())
    def test_manifest_counts_must_match_downloaded_corpus(self):
        self.manifest['recordCount'] = 2
        (self.source/'hannover.json').write_bytes(compact(self.manifest))
        result = self.import_data()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('count', result.stderr.lower())
        self.assertFalse((self.output/'hannover.json').exists())
    def test_source_retry_after_recovers_without_dropping_any_records(self):
        attempts = {'manifest': 0}
        class Handler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                if self.path == '/hannover.json':
                    attempts['manifest'] += 1
                    if attempts['manifest'] == 1:
                        self.send_response(429)
                        self.send_header('Retry-After', '0')
                        self.send_header('Content-Length', '0')
                        self.end_headers()
                        return
                super().do_GET()
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(self.source)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            result = self.run_cli('--source-url', f'http://127.0.0.1:{server.server_port}/', '--output-dir', str(self.output), '--workers', '2')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(len(self.read_gzip('search-index.json.gz')['records']), 3)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
    def test_offline_check_detects_changed_browse_asset(self):
        first = self.import_data()
        self.assertEqual(first.returncode, 0, first.stderr)
        (self.output/'search-index.json.gz').write_bytes(gzip.compress(b'{}'))
        result = self.run_cli('--output-dir', str(self.output), '--check')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('integrity', result.stderr.lower())

if __name__ == '__main__':
    unittest.main()
