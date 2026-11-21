#!/usr/bin/env python3
"""Pack or restore a byte-exact, independently verified Hannover snapshot.

The repository stores deterministic parts of one archive. Deployment verifies every
part, rebuilds that archive, and restores the same flat browser files only after
checking the complete archive checksum and the full snapshot contract.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile

from import_unfallwerkbank import InvalidSnapshot, check_published, require

DEFAULT_DIRECTORY = Path('site/data/ris')
DEFAULT_ARCHIVE = Path('data/hannover-snapshot.tar.gz')
DEFAULT_CHECKSUM = Path('data/hannover-snapshot.sha256')
MAX_FILES = 100000
MAX_TOTAL_BYTES = 512 * 1024 * 1024
MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_PART_BYTES = 9 * 1024 * 1024
MAX_PARTS = 64
ALLOWED_NAME = re.compile(r'(?:hannover\.json|migration\.json|search-index\.json\.gz|map\.geojson\.gz|hannover\.[a-f0-9]{64}\.(?:records|locations|relations|search|geometry|links|spatial)\.json\.gz)\Z')


def file_digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def safe_name(name):
    require(isinstance(name, str) and ALLOWED_NAME.fullmatch(name), 'Unsafe archive path or filename')


def replace_directory(staging, output):
    """Keep the previous directory intact until a complete replacement is ready."""
    backup = None
    if output.exists():
        backup = Path(tempfile.mkdtemp(prefix='.ris-bundle-previous-', dir=output.parent))
        backup.rmdir()
        output.rename(backup)
    try:
        staging.rename(output)
    except BaseException:
        if backup:
            backup.rename(output)
        raise
    if backup:
        shutil.rmtree(backup)


def pack(source_dir, archive_path, checksum_path):
    source_dir = source_dir.resolve()
    counts = check_published(source_dir)
    files = sorted(source_dir.iterdir(), key=lambda path: path.name)
    require(0 < len(files) <= MAX_FILES, 'Snapshot file count exceeds archive limit')
    total = 0
    for path in files:
        safe_name(path.name)
        require(path.is_file() and not path.is_symlink(), 'Archive source must contain only regular files')
        size = path.stat().st_size
        require(0 <= size <= MAX_FILE_BYTES, 'Archive file exceeds size limit')
        total += size
    require(total <= MAX_TOTAL_BYTES, 'Archive total bytes exceed limit')
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    checksum_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix='.snapshot-pack-', dir=archive_path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, 'wb') as raw_archive:
            with gzip.GzipFile(filename='', mode='wb', fileobj=raw_archive, mtime=0, compresslevel=9) as compressed:
                with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
                    for path in files:
                        info = tarfile.TarInfo(path.name)
                        info.size = path.stat().st_size
                        info.mode = 0o644
                        info.uid = info.gid = info.mtime = 0
                        info.uname = info.gname = ''
                        with path.open('rb') as source:
                            archive.addfile(info, source)
        checksum = file_digest(temporary)
        checksum_content = checksum + '  ' + archive_path.name + '\n'
        # Finish both temporary files before exposing either deliverable.
        checksum_fd, checksum_name = tempfile.mkstemp(prefix='.snapshot-sha-', dir=checksum_path.parent)
        checksum_temporary = Path(checksum_name)
        try:
            with os.fdopen(checksum_fd, 'w', encoding='ascii') as output:
                output.write(checksum_content)
            temporary.replace(archive_path)
            checksum_temporary.replace(checksum_path)
        finally:
            checksum_temporary.unlink(missing_ok=True)
        manifest = split_archive(archive_path, checksum_path)
        return dict(status='packed', archive=str(archive_path), sha256=checksum,
                    files=len(files), bytes=total, archiveBytes=archive_path.stat().st_size, counts=counts,
                    partsManifest=str(parts_manifest_path(archive_path)), parts=manifest['parts'])
    finally:
        temporary.unlink(missing_ok=True)


def verify_archive_checksum(archive_path, checksum_path):
    require(archive_path.is_file() and not archive_path.is_symlink(), 'Missing regular snapshot archive')
    require(archive_path.stat().st_size <= MAX_TOTAL_BYTES, 'Compressed archive exceeds size limit')
    require(checksum_path.is_file() and checksum_path.stat().st_size <= 1024, 'Missing or invalid archive checksum')
    checksum_text = checksum_path.read_text(encoding='ascii').strip()
    match = re.fullmatch(r'([a-f0-9]{64})  ([^/\\\r\n]+)', checksum_text)
    require(match is not None and match.group(2) == archive_path.name, 'Invalid archive checksum sidecar')
    require(file_digest(archive_path) == match.group(1), 'Archive checksum mismatch')
    return match.group(1)


def unpack_archive(archive_path, checksum_path, output_dir):
    checksum = verify_archive_checksum(archive_path, checksum_path)
    output_dir = output_dir.resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.ris-bundle-', dir=output_dir.parent))
    total, names = 0, set()
    try:
        with tarfile.open(archive_path, mode='r|gz') as archive:
            for member in archive:
                safe_name(member.name)
                require(member.name not in names, 'Duplicate archive member')
                require(member.isfile() and not member.issym() and not member.islnk(),
                        'Archive members must be regular files')
                require(not member.pax_headers and not member.sparse, 'Unsupported archive metadata')
                require(0 <= member.size <= MAX_FILE_BYTES, 'Archive member exceeds size limit')
                names.add(member.name)
                total += member.size
                require(len(names) <= MAX_FILES and total <= MAX_TOTAL_BYTES, 'Archive count or total size exceeds limit')
                source = archive.extractfile(member)
                require(source is not None, 'Missing archive member bytes')
                copied = 0
                with source, (staging/member.name).open('xb') as destination:
                    for block in iter(lambda: source.read(1024 * 1024), b''):
                        copied += len(block)
                        require(copied <= member.size, 'Archive member size mismatch')
                        destination.write(block)
                require(copied == member.size, 'Truncated archive member')
        require(names, 'Empty snapshot archive')
        counts = check_published(staging)
        replace_directory(staging, output_dir)
        return dict(status='unpacked', files=len(names), bytes=total, sha256=checksum, counts=counts)
    finally:
        if staging.exists():
            shutil.rmtree(staging)



def parts_manifest_path(archive_path):
    require(archive_path.name.endswith('.tar.gz'), 'Snapshot archive must end in .tar.gz')
    return archive_path.with_name(archive_path.name[:-7] + '.parts.json')


def split_archive(archive_path, checksum_path):
    """Write bounded binary parts without changing the verified archive bytes."""
    checksum = verify_archive_checksum(archive_path, checksum_path)
    manifest_path = parts_manifest_path(archive_path)
    parts = []
    with tempfile.TemporaryDirectory(prefix='.snapshot-parts-', dir=archive_path.parent) as temporary_name:
        temporary = Path(temporary_name)
        with archive_path.open('rb') as source:
            while block := source.read(MAX_PART_BYTES):
                index = len(parts) + 1
                require(index <= MAX_PARTS, 'Archive part count exceeds limit')
                name = f'{archive_path.name}.part{index:02d}'
                (temporary/name).write_bytes(block)
                parts.append(dict(path=name, bytes=len(block), sha256=hashlib.sha256(block).hexdigest()))
        manifest = dict(schemaVersion=1, archive=archive_path.name, sha256=checksum,
                        bytes=archive_path.stat().st_size, parts=parts)
        require(parts and sum(part['bytes'] for part in parts) == manifest['bytes'], 'Archive parts total mismatch')
        (temporary/manifest_path.name).write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        for part in parts:
            (temporary/part['path']).replace(archive_path.parent/part['path'])
        (temporary/manifest_path.name).replace(manifest_path)
    return manifest


def assemble_parts(archive_path, manifest_path, target):
    require(manifest_path.is_file() and not manifest_path.is_symlink()
            and manifest_path.stat().st_size <= 65536, 'Missing or invalid regular parts manifest')
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (ValueError, UnicodeError) as exc:
        raise InvalidSnapshot('Invalid parts manifest JSON') from exc
    require(isinstance(manifest, dict) and manifest.get('schemaVersion') == 1
            and manifest.get('archive') == archive_path.name, 'Invalid parts manifest archive')
    require(isinstance(manifest.get('sha256'), str) and re.fullmatch(r'[a-f0-9]{64}', manifest['sha256']),
            'Invalid complete archive checksum')
    expected_bytes, parts = manifest.get('bytes'), manifest.get('parts')
    require(type(expected_bytes) is int and 0 < expected_bytes <= MAX_TOTAL_BYTES,
            'Invalid parts total bytes')
    require(isinstance(parts, list) and 0 < len(parts) <= MAX_PARTS, 'Invalid archive part count')
    declared_total = 0
    for index, part in enumerate(parts, 1):
        require(isinstance(part, dict) and part.get('path') == f'{archive_path.name}.part{index:02d}',
                'Unsafe, duplicate or out-of-order part path')
        require(type(part.get('bytes')) is int and 0 < part['bytes'] <= MAX_PART_BYTES, 'Invalid part bytes')
        require(isinstance(part.get('sha256'), str) and re.fullmatch(r'[a-f0-9]{64}', part['sha256']),
                'Invalid part checksum')
        declared_total += part['bytes']
    require(declared_total == expected_bytes, 'Archive parts total mismatch')
    complete_digest, total = hashlib.sha256(), 0
    with target.open('xb') as destination:
        for part in parts:
            path = manifest_path.parent/part['path']
            require(path.is_file() and not path.is_symlink(), f'Missing regular archive part: {part["path"]}')
            require(path.stat().st_size == part['bytes'], f'Part bytes mismatch: {part["path"]}')
            part_digest, copied = hashlib.sha256(), 0
            with path.open('rb') as source:
                for block in iter(lambda: source.read(1024 * 1024), b''):
                    copied += len(block)
                    require(copied <= part['bytes'], 'Archive part exceeded declared bytes')
                    part_digest.update(block)
                    complete_digest.update(block)
                    destination.write(block)
            require(copied == part['bytes'] and part_digest.hexdigest() == part['sha256'],
                    f'Part checksum mismatch: {part["path"]}')
            total += copied
    require(total == expected_bytes and complete_digest.hexdigest() == manifest['sha256'],
            'Complete archive checksum or total mismatch')
    return manifest


def unpack(archive_path, checksum_path, output_dir):
    manifest_path = parts_manifest_path(archive_path)
    if manifest_path.exists() or manifest_path.is_symlink():
        # Never fall back to a potentially stale whole archive when parts exist.
        with tempfile.TemporaryDirectory(prefix='ratsatlas-assembled-') as temporary_name:
            assembled = Path(temporary_name)/archive_path.name
            assemble_parts(archive_path, manifest_path, assembled)
            return unpack_archive(assembled, checksum_path, output_dir)
    return unpack_archive(archive_path, checksum_path, output_dir)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('pack', 'unpack'))
    parser.add_argument('--source-dir', type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument('--archive', type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument('--checksum', type=Path, default=DEFAULT_CHECKSUM)
    args = parser.parse_args(argv)
    try:
        result = pack(args.source_dir, args.archive, args.checksum) if args.mode == 'pack' else unpack(args.archive, args.checksum, args.output_dir)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (InvalidSnapshot, OSError, UnicodeError, tarfile.TarError) as exc:
        print(f'Snapshot bundle failed: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
