"""Real archive/CLI tests for deterministic, validated snapshot distribution."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

from test_import_unfallwerkbank import fixture

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT/'scripts/snapshot_bundle.py'
IMPORTER = ROOT/'scripts/import_unfallwerkbank.py'

class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.raw = self.root/'raw'
        fixture(self.raw)
        self.published = self.root/'published'
        imported = subprocess.run([sys.executable, str(IMPORTER), '--source-dir', str(self.raw), '--output-dir', str(self.published)], capture_output=True, text=True)
        self.assertEqual(imported.returncode, 0, imported.stderr)
        self.archive = self.root/'hannover-snapshot.tar.gz'
        self.checksum = self.root/'hannover-snapshot.sha256'
        self.parts_manifest = self.root/'hannover-snapshot.parts.json'
    def tearDown(self):
        self.temp.cleanup()
    def run_bundle(self, mode, *args):
        return subprocess.run([sys.executable, str(BUNDLE), mode, '--archive', str(self.archive), '--checksum', str(self.checksum), *args], capture_output=True, text=True)
    def bytes_in(self, directory):
        return {p.name:p.read_bytes() for p in directory.iterdir()}
    def pack(self):
        result = self.run_bundle('pack', '--source-dir', str(self.published))
        self.assertEqual(result.returncode, 0, result.stderr)
    def custom_archive(self, entries):
        with tarfile.open(self.archive, 'w:gz') as archive:
            for name, data, kind in entries:
                info = tarfile.TarInfo(name)
                info.type = kind
                if kind == tarfile.SYMTYPE:
                    info.linkname = '../outside'
                    archive.addfile(info)
                else:
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
        self.checksum.write_text(hashlib.sha256(self.archive.read_bytes()).hexdigest() + '  ' + self.archive.name + '\n')
    def assert_rejected_without_replacing(self, expected):
        before = self.bytes_in(self.published)
        result = self.run_bundle('unpack', '--output-dir', str(self.published))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(expected, result.stderr.lower())
        self.assertEqual(self.bytes_in(self.published), before)
    def test_round_trip_is_byte_exact_and_archive_is_deterministic(self):
        self.pack()
        first = self.archive.read_bytes()
        checksum = self.checksum.read_bytes()
        self.pack()
        self.assertEqual(self.archive.read_bytes(), first)
        self.assertEqual(self.checksum.read_bytes(), checksum)
        target = self.root/'restored'
        result = self.run_bundle('unpack', '--output-dir', str(target))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.bytes_in(target), self.bytes_in(self.published))
    def test_corrupt_archive_is_rejected_before_replacing_previous_snapshot(self):
        self.pack()
        self.parts_manifest.unlink(missing_ok=True)
        self.archive.write_bytes(self.archive.read_bytes() + b'corruption')
        self.assert_rejected_without_replacing('checksum')
    def read_parts(self):
        self.assertTrue(self.parts_manifest.is_file(), 'pack must write the parts manifest')
        return json.loads(self.parts_manifest.read_text())
    def test_parts_round_trip_without_whole_archive_is_deterministic(self):
        self.pack()
        manifest = self.read_parts()
        expected = self.archive.read_bytes()
        self.assertEqual(manifest['archive'], 'hannover-snapshot.tar.gz')
        self.assertEqual(manifest['bytes'], len(expected))
        self.assertEqual(manifest['sha256'], hashlib.sha256(expected).hexdigest())
        parts_before = {part['path']:(self.root/part['path']).read_bytes() for part in manifest['parts']}
        self.assertEqual(b''.join(parts_before[part['path']] for part in manifest['parts']), expected)
        self.assertTrue(all(0 < part['bytes'] <= 9437184 for part in manifest['parts']))
        manifest_before = self.parts_manifest.read_bytes()
        self.pack()
        self.assertEqual(self.parts_manifest.read_bytes(), manifest_before)
        for name,data in parts_before.items():
            self.assertEqual((self.root/name).read_bytes(), data)
        self.archive.unlink()
        target = self.root/'restored-from-parts'
        result = self.run_bundle('unpack', '--output-dir', str(target))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.bytes_in(target), self.bytes_in(self.published))
    def test_parts_take_precedence_over_stale_whole_archive(self):
        self.pack()
        self.read_parts()
        self.archive.write_bytes(b'stale archive from another generation')
        target = self.root/'fresh-parts'
        result = self.run_bundle('unpack', '--output-dir', str(target))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.bytes_in(target), self.bytes_in(self.published))
    def test_damaged_part_is_rejected_without_falling_back_to_valid_whole_archive(self):
        self.pack()
        manifest = self.read_parts()
        part = self.root/manifest['parts'][0]['path']
        data = part.read_bytes()
        part.write_bytes(bytes([data[0] ^ 1]) + data[1:])
        self.assert_rejected_without_replacing('checksum')
    def test_missing_part_is_rejected_without_falling_back_to_valid_whole_archive(self):
        self.pack()
        manifest = self.read_parts()
        (self.root/manifest['parts'][0]['path']).unlink()
        self.assert_rejected_without_replacing('missing')
    def test_parts_manifest_cannot_escape_its_directory(self):
        self.pack()
        manifest = self.read_parts()
        manifest['parts'][0]['path'] = '../outside'
        self.parts_manifest.write_text(json.dumps(manifest))
        self.assert_rejected_without_replacing('path')
    def test_parts_manifest_total_must_match_parts(self):
        self.pack()
        manifest = self.read_parts()
        manifest['bytes'] += 1
        self.parts_manifest.write_text(json.dumps(manifest))
        self.assert_rejected_without_replacing('total')
    def test_parent_path_is_rejected_even_with_valid_archive_checksum(self):
        self.custom_archive([('../outside', b'escape', tarfile.REGTYPE)])
        self.assert_rejected_without_replacing('path')
        self.assertFalse((self.root/'outside').exists())
    def test_duplicate_archive_members_are_rejected(self):
        self.custom_archive([('hannover.json', b'{}', tarfile.REGTYPE), ('hannover.json', b'{}', tarfile.REGTYPE)])
        self.assert_rejected_without_replacing('duplicate')
    def test_symbolic_links_are_rejected(self):
        self.custom_archive([('hannover.json', b'', tarfile.SYMTYPE)])
        self.assert_rejected_without_replacing('regular')
    def test_valid_archive_hash_cannot_hide_invalid_snapshot_data(self):
        entries = [(p.name, p.read_bytes(), tarfile.REGTYPE) for p in self.published.iterdir()]
        for i,(name,data,kind) in enumerate(entries):
            if name == 'hannover.json':
                manifest = json.loads(data)
                manifest['recordCount'] = 999
                entries[i] = (name, json.dumps(manifest).encode(), kind)
        self.custom_archive(entries)
        self.assert_rejected_without_replacing('count')

if __name__ == '__main__':
    unittest.main()
