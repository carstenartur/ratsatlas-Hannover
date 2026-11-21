#!/usr/bin/env python3
"""Add evidenced Hannover places to derived projections of an immutable RIS snapshot."""
import argparse
from collections import Counter, defaultdict
import gzip
import json
import os
from pathlib import Path
import re
import tempfile

from import_unfallwerkbank import Snapshot, SourceReader, compact, digest, geometry_bounds, require, validate_manifest, write_derived


DATA = Path(__file__).resolve().parents[1] / 'data' / 'geocoding'
GAZETTEER_SHA = 'a75b7305430ad751cce8d7a61d35057137258ea79b6418bb6a051a79588c157c'
PROJECT = 'Amtlich belegter Projektstandort'
ADDRESS = 'Amtliche Hauskoordinate zum Vorgangstitel'
DOCUMENT = 'Amtliche Hauskoordinate zum belegten Projekt im Dokument'
RANGE = 'Amtliche Adresspunkte der im Titel genannten Spanne'
STREET = 'Amtliche Straßenachse zum Vorgangstitel'
PLAN = re.compile(r'\bbebauungsplan(?:s|es)?(?: der innenentwicklung)? nr\.?\s*1862\s*[-–—]\s*oberstrasse\b')
SITE = r'[„“»"«]?(?:ehemaligen? )?bumke[- ](?:gelände(?:s)?|areal(?:s)?)\b'
SITE_SUBJECT = re.compile(r'\bareal der firma bumke entwickeln\b|'
                          r'\b(?:entwicklung|nachnutzung|bebauung) (?:des|der|von) ' + SITE + r'|'
                          r'\bbürger\*?innenbeteiligung (?:zum|am|für das) ' + SITE + r'|'
                          r'\bentwicklungsbereich(?:es|s)? für das ' + SITE)
COMPARISON = re.compile(r'\b(?:vorbild|vergleich|analog|beispiel|rückblick|anders als|wie beim)\b')
PRIVATE = re.compile(r'\b(?:anschrift|absender\w*|kontakt(?:adresse)?|wohnanschrift|wohnort|sitzungsort|tagungsort|petition|petent\w*|bürgerantrag|bürgerinitiative|einwohnerfragestunde|zuwendung\w*|beihilf\w*|zusch[uü]ss?\w*|umbesetzung|besetzung|kommission|umbenennung|benennung)\b')
ROAD_ENDING = re.compile(r'(?:strasse|weg|allee|platz|damm|brücke|chaussee|ufer|stieg|gasse|steig|ring)$')
# These bare words name a class of feature or a district as well as an official street.
GENERIC_NAMES = {'ring', 'platz', 'ufer', 'brücke', 'allee', 'markt', 'am markt', 'sahlkamp', 'kronsberg'}
CIVIC = re.compile(r'\b(?:umbau|neubau|ausbau|sanierung|grundsanierung|umgestaltung|verkehrssicherheit|radverkehr|fahrbahn|fussweg|fussgänger|fahrrad|querung|erschliessung|gehweg|spielplatz|beleuchtung|parkplatz|haltestelle|bushaltestelle|strassenreinigung|verkehrsberuhigung|tempo[ -]?30|radweg|kindertagesstätte|kita|kindergarten|krippengruppe|grundschule|schulstandort|feuerwache|unterkunft|wohnheim|wohnungsbau|wohnquartier|wohnraum|grundstück|erbbaurecht|bebauungsplan|ausschreibung|bauvorhaben|unterbringung|schulzentrum|verkehrsführung|schulweg|zebrastreifen|radfahr|fahrradbügel|ampel|parkverbot|baumpflanzung|baumfällung)\w*\b')
LOCATIVE = re.compile(r'\b(?:an der|am|auf der|auf dem|in der|im|entlang der|für die|der strasse|die strasse|der kreuzung|höhe)\s*$')
DIRECT = re.compile(r'\b(?:verkehrsberuhigung|querungshilfe|verkehrssicherheit|gehweg|fussweg|radweg|spielplatz|bushaltestelle|haltestelle|strassenausbau|grundsanierung|sanierung|beleuchtung|tempo[ -]?30|wohnheim|unterkunft|kindertagesstätte|kita|grundschule|schulstandort|feuerwache|einrichtung|grundstück|grundstücke|grundstückes|standort|ausschreibung|neubau|ausbau|umbau|parkplatz)\s*(?:[-:]\s*)?$')
# An object's name may be an entirely different street from its address.
NAMED_OBJECT = (r'\b(?:\w*schule|einrichtung|kindertagesstätte|kita|kindergarten|schulstandort|feuerwache|'
                r'wohnheim|unterkunft|\w*haltestelle|haltepunkt|station|\w*spielplatz|bolzplatz|parkplatz)')
OBJECT_PREFIX = re.compile(NAMED_OBJECT + r'\s*(?:[-:]\s*)?$')
QUOTED_OBJECT = re.compile(NAMED_OBJECT + r"""\s*["„“«»'‚‘][^"„“”«»'‚‘’]*$""")
SCOPE = re.compile(r'\b(?:zwischen|abschnitt|einmündung|kreuzung|ecke|kreisel|bis zur?|von der .+ bis)\b')
FACILITY = re.compile(r'\b(?:kindertagesstätte|kindergarten|kita|grundschule|feuerwache|schulstandort|krippengruppe|sporthalle)\w*\b')
PROJECT_ACTION = re.compile(r'\b(?:errichtung|neubau|umbau|ausbau|förderung|betrieb|fortführung|sanierung|erweiterung|aufstockung|umstrukturierung|ersatzbau)\w*\b')
DOCUMENT_EXCLUDE = re.compile(r'\b(?:auskunft|kontakt|empfänger|ausweich\w*|altstandort|bisherig\w*|sitzung|einladung|vorstand|geschäftsstelle|antragsteller\w*|spenden|eigentümer|beispiel|ersatzstandort)\b')
PROJECT_SITE = re.compile(r'\bam (?:temporären |neuen )?standort (?:in der |im |am )?$')
DECISION = re.compile(r'\b(?:zuzustimmen|einzurichten|zu errichten|zu erweitern|zu sanieren|fortzuführen|zu betreiben)\b')
PLAN_ADDRESS = re.compile(r'\bbebauungsplan(?:s|es)?(?: der innenentwicklung)? nr\.?\s*\d{1,4}\s*[,–—-]\s*$')
TOKENS = re.compile(r'\w+(?:[-’\']\w+)*')
NUMBER = r'\d{1,3}(?:\s*[a-z](?!\w))?'
NUMBERS = re.compile(rf'\s+(?:nr\.?\s*)?({NUMBER})(?!\w)(?:\s*(?:[-–—]|bis(?:\s+nr\.?)?|und(?:\s+nr\.?)?|\+)\s*({NUMBER})(?!\w))?')
EXTRA_NUMBER = re.compile(r'\s*(?:[-–—/+,]|und |bis )\s*(?:nr\.?\s*)?\d')
FILENAMES = {'searchIndex': 'search-index.json.gz', 'map': 'map.geojson.gz', 'additions': 'additions.json.gz'}


def normalize(text):
    return re.sub(r'str\.(?=\s|$)', 'strasse', ' '.join(text.casefold().split()))


class Resolver:
    def __init__(self, gazetteer, site):
        self.site = site
        self.gazetteer = gazetteer
        names = Counter(normalize(entry['name']) for entry in gazetteer['entries'])
        self.by_first = defaultdict(list)
        for entry in gazetteer['entries']:
            name = normalize(entry['name'])
            if entry['kind'] != 'street' or names[name] != 1 or name in GENERIC_NAMES:
                continue
            first = TOKENS.match(name)
            if first:
                self.by_first[first.group()].append((name, entry))
        for candidates in self.by_first.values():
            candidates.sort(key=lambda pair: -len(pair[0]))

    @classmethod
    def load(cls, directory):
        blob = (directory / 'hannover-atkis.json.gz').read_bytes()
        require(digest(blob) == GAZETTEER_SHA, 'Hannover gazetteer checksum mismatch')
        gazetteer = json.loads(gzip.decompress(blob))
        require(gazetteer['municipalityKey'] == '03241001', 'Wrong municipality')
        return cls(gazetteer, json.loads((directory / 'bumke.json').read_bytes()))

    def street_matches(self, title):
        matches = []
        previous_end = 0
        for token in TOKENS.finditer(title):
            if token.start() < previous_end:
                continue
            for name, entry in self.by_first.get(token.group(), ()):
                end = token.start() + len(name)
                if title.startswith(name, token.start()) and (end == len(title) or not (title[end].isalnum() or title[end] in '-_')):
                    if not ROAD_ENDING.search(name) and not NUMBERS.match(title[end:]):
                        continue
                    matches.append((token.start(), end, entry))
                    previous_end = end
                    break
        return matches

    def document_address(self, title, evidence, documents):
        if not (FACILITY.search(title) and PROJECT_ACTION.search(title)):
            return []
        addresses = [loc for loc in documents if loc['kind'] == 'address' and loc['evidence']['source'] == 'document']
        labels = {normalize(loc['label']) for loc in addresses}
        if len(labels) != 1:
            return []
        wanted, = labels
        for loc in addresses:
            text = normalize(loc['evidence']['text'])
            if PRIVATE.search(text) or DOCUMENT_EXCLUDE.search(text) or COMPARISON.search(text):
                continue
            for start, end, entry in self.street_matches(text):
                numbers = NUMBERS.match(text[end:])
                if not numbers or numbers[2] or EXTRA_NUMBER.match(text[end+numbers.end():]):
                    continue
                number = numbers[1].replace(' ', '')
                label = entry['name'] + ' ' + number
                if normalize(label).replace(' ', '') != wanted.replace(' ', ''):
                    continue
                at_site = PROJECT_SITE.search(text[:start]) and DECISION.search(text[end:])
                named_in_title = normalize(entry['name']) in title and re.search(
                    r'\b(?:kita|kindertagesstätte|grundschule|feuerwache|sporthalle)\s*$', text[:start])
                if not (at_site or named_in_title):
                    continue
                point = self.gazetteer['addresses'].get(entry['streetKey'], {}).get(number)
                if point:
                    # Include the locative excerpt, leaving other parties' details out.
                    excerpt_start = PROJECT_SITE.search(text[:start]) if at_site else named_in_title
                    excerpt = text[excerpt_start.start():end + numbers.end()]
                    doc = dict(source='document', text=excerpt, url=evidence['url'],
                               note='Ortsbeleg in vereinheitlichter Schreibweise')
                    return [(label, dict(type='Point', coordinates=point), 'address', 'Hauskoordinate',
                             DOCUMENT, self.gazetteer['addressSourceMetadataUrl'], self.gazetteer['addressAttribution'], doc)]
        return []

    def find(self, row, documents=()):
        if row['mapped'] or row['level'] != 'city' or row['source'] != 'hannover-sim':
            return []
        title = normalize(row['title']).split('sitzung des stadtbezirksrat', 1)[0].strip()
        evidence = dict(source='title', text=row['title'],
                        url='https://e-government.hannover-stadt.de/lhhsimwebre.nsf/DS/' + row['sourceId'].removeprefix('hannover-sim:'))
        reviewed = self.site['reviewed'].get(row['id'])
        if reviewed and row['title'] == reviewed['title']:
            evidence = dict(source='document', text=reviewed['text'], url=reviewed['url'])
        elif PRIVATE.search(title) or COMPARISON.search(title):
            return []
        if evidence['source'] == 'document' or PLAN.search(title) or SITE_SUBJECT.search(title):
            return [(self.site['name'], self.site['geometry'], 'place', 'Projektstandort', PROJECT,
                     self.site['sourceUrl'], self.site['attribution'], evidence)]
        if not CIVIC.search(title):
            return []
        matches = []
        for start, end, entry in self.street_matches(title):
            prefix = title[:start]
            if QUOTED_OBJECT.search(prefix):
                continue
            if OBJECT_PREFIX.search(prefix) and not NUMBERS.match(title[end:]):
                continue
            matches.append((start, end, entry))
        title_sites = self.title_street(title, matches, evidence)
        if any(NUMBERS.match(title[end:]) for _, end, _ in matches):
            return title_sites
        documented = self.document_address(title, evidence, documents)
        if documented and (not matches or all(normalize(entry['name']) + ' ' in normalize(documented[0][0]) + ' '
                                             for _, _, entry in matches)):
            return documented
        return title_sites

    def title_street(self, title, matches, evidence):
        if len(matches) != 1:
            return []
        start, end, entry = matches[0]
        prefix = title[:start].rstrip('„“»"«').rstrip() + ' '
        suffix = title[end:]
        if not (LOCATIVE.search(prefix) or DIRECT.search(prefix) or (PLAN_ADDRESS.search(prefix) and NUMBERS.match(suffix))):
            return []
        numbers = NUMBERS.match(suffix)
        if numbers:
            tail = suffix[numbers.end():]
            if EXTRA_NUMBER.match(tail) or re.match(r'\s*\.\s*bauabschnitt|\s*[-–—/]\s*\w', tail):
                return []
            keys = list(dict.fromkeys(n.replace(' ', '') for n in numbers.groups() if n))
            points = self.gazetteer['addresses'].get(entry['streetKey'], {})
            if not all(number in points for number in keys):
                return []
            is_range = len(keys) == 2 and re.search(r'[-–—]|\bbis\b', numbers.group())
            method, accuracy = (RANGE, 'Adresspunkt der genannten Spanne') if is_range else (ADDRESS, 'Hauskoordinate')
            return [(entry['name'] + ' ' + number, dict(type='Point', coordinates=points[number]),
                     'address', accuracy, method, self.gazetteer['addressSourceMetadataUrl'],
                     self.gazetteer['addressAttribution'], evidence) for number in keys]
        if re.match(r'\s*(?:nr\.?\s*|[0-9/])', suffix) or SCOPE.search(title):
            return []
        return [(entry['name'], entry['geometry'], 'street', 'Straßenverlauf zur Orientierung', STREET,
                 self.gazetteer['sourceMetadataUrl'], self.gazetteer['attribution'], evidence)]


def project(index, geojson, resolver, documents=None):
    documents = documents or {}
    rows, additions, features = [], {}, {}
    for row in index['records']:
        found = resolver.find(row, documents.get(row['sourceId'], ()))
        if not found:
            rows.append(row)
            continue
        locations = []
        geometry_ids = []
        for label, geometry, kind, accuracy, method, source_url, attribution, evidence in found:
            identifier = 'atlas:' + digest(compact([kind, label, accuracy, geometry, source_url]))
            provenance = dict(sourceUrl=source_url, attribution=attribution)
            if identifier not in features:
                geometry_method = 'Abgleich mit amtlicher Hauskoordinate' if kind == 'address' else method
                features[identifier] = dict(type='Feature', geometry=geometry, bounds=geometry_bounds(geometry),
                    properties=dict(geometryId=identifier, label=label, accuracy=accuracy, recordIds=[],
                                    method=geometry_method, **provenance, provenance={**provenance, 'method': geometry_method}))
            features[identifier]['properties']['recordIds'].append(row['id'])
            locations.append(dict(id='atlas-location:' + digest(compact([row['id'], identifier])),
                    geometryId=identifier, label=label, kind=kind, mapped=True, accuracy=accuracy,
                    evidence=evidence, method=method, **provenance))
            geometry_ids.append(identifier)
        additions[row['id']] = dict(locations=locations, geometryIds=geometry_ids)
        labels = list(dict.fromkeys([*row['locations'], *(location['label'] for location in locations)]))
        rows.append({**row, 'locations': labels, 'mapped': True})
    new_features = []
    for identifier in sorted(features):
        feature = features[identifier]
        props = feature['properties']
        props['recordIds'].sort()
        props['recordCount'] = len(props['recordIds'])
        new_features.append(feature)
    return ({**index, 'records': rows}, {**geojson, 'features': [*geojson['features'], *new_features]},
            dict(schemaVersion=1, generation=index['generation'], records=additions))


def read_document_evidence(directory, manifest):
    snapshot = Snapshot(SourceReader(directory=directory))
    require(snapshot.manifest['generation'] == manifest['generation'], 'Source generation changed')
    pending = [manifest['roots']['locations']]
    seen = set()
    records = defaultdict(list)
    while pending:
        ref = pending.pop()
        require(ref['kind'] == 'locations' and ref['path'] not in seen, 'Invalid location index')
        seen.add(ref['path'])
        node, _ = snapshot.read_asset(ref)
        if node['type'] == 'branch':
            pending.extend(child for _, child in node['entries'])
        else:
            for key, page in node['entries']:
                identifier, _ = json.loads(key)
                for loc in page['items']:
                    if loc['kind'] == 'address' and loc['evidence']['source'] == 'document':
                        records[identifier].append(loc)
    return records


def load_source(directory):
    manifest_bytes = (directory / 'hannover.json').read_bytes()
    manifest_hash = digest(manifest_bytes)
    manifest = json.loads(manifest_bytes)
    validate_manifest(manifest)
    migration = json.loads((directory / 'migration.json').read_bytes())
    generation = manifest['generation']
    require(migration['source']['generation'] == generation and migration['source']['manifestSha256'] == manifest_hash,
            'Source manifest and migration disagree')
    projections = []
    for key in ('searchIndex', 'map'):
        ref = migration['derived'][key]
        require(ref['path'] == FILENAMES[key], 'Invalid projection path')
        blob = (directory / FILENAMES[key]).read_bytes()
        require(len(blob) == ref['compressedBytes'] and digest(blob) == ref['compressedSha256'], 'Invalid source projection')
        raw = gzip.decompress(blob)
        require(len(raw) == ref['bytes'] and digest(raw) == ref['sha256'], 'Invalid source projection content')
        value = json.loads(raw)
        require(value['generation'] == generation, 'Wrong source projection generation')
        projections.append(value)
    return manifest_hash, manifest, *projections


def build(directory, output, check=False):
    source, target = directory.resolve(), output.resolve()
    require(source != target and source not in target.parents and target not in source.parents,
            'Separate source and output directories are required')
    source_hash, manifest, index, geojson = load_source(source)
    resolver = Resolver.load(DATA)
    combined_index, combined_map, additions = project(index, geojson, resolver, read_document_evidence(source, manifest))
    levels = {}
    for row in combined_index['records']:
        counts = levels.setdefault(row['level'], {'records': 0, 'mapped': 0})
        counts['records'] += 1
        counts['mapped'] += row['mapped']
    mapped = sum(item['mapped'] for item in levels.values())
    n_added = len(additions['records'])
    new_geometries = len(combined_map['features']) - len(geojson['features'])
    require(len(index['records']) == manifest['recordCount'] and mapped - n_added == manifest['mappedRecordCount']
            and len(geojson['features']) == manifest['geometryCount'], 'Source count mismatch')
    by_method = Counter(method for record in additions['records'].values()
                        for method in {location['method'] for location in record['locations']})
    totals = dict(recordCount=len(index['records']), mappedRecordCount=mapped, geometryCount=len(combined_map['features']),
                  levelCounts=levels, originalMappedRecordCount=manifest['mappedRecordCount'], addedRecordCount=n_added,
                  addedGeometryCount=new_geometries, byMethod=dict(sorted(by_method.items())))
    sources = [dict(label=resolver.gazetteer[key], url=resolver.gazetteer[url_key],
                    licenseUrl=resolver.gazetteer['licenseUrl'], sha256=GAZETTEER_SHA)
               for key, url_key in [('attribution', 'sourceMetadataUrl'), ('addressAttribution', 'addressSourceMetadataUrl')]]
    sources.append(dict(label=resolver.site['attribution'], url=resolver.site['sourceUrl'],
                        sha256=digest((DATA/'bumke.json').read_bytes())))
    outputs = {'searchIndex': (combined_index, len(combined_index['records'])),
               'map': (combined_map, len(combined_map['features'])), 'additions': (additions, n_added)}
    header = dict(schemaVersion=1, sourceGeneration=manifest['generation'], sourceManifestSha256=source_hash,
                  totals=totals, sources=sources)
    if check:
        published = json.loads((target / 'enrichment.json').read_bytes())
        require(all(published.get(key) == value for key, value in header.items()), 'Enrichment manifest mismatch')
        for key, (payload, count) in outputs.items():
            ref = published['derived'][key]
            require(ref['path'] == FILENAMES[key] and ref['count'] == count, 'Enrichment descriptor mismatch')
            blob = (target / FILENAMES[key]).read_bytes()
            require(len(blob) == ref['compressedBytes'] and digest(blob) == ref['compressedSha256'], 'Compressed output mismatch')
            expected = compact(payload)
            require(len(expected) == ref['bytes'] and digest(expected) == ref['sha256']
                    and gzip.decompress(blob) == expected, 'Enrichment content mismatch')
        return totals
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target) as staging:
        tmp = Path(staging)
        refs = {key: write_derived(tmp, FILENAMES[key], payload, count) for key, (payload, count) in outputs.items()}
        (tmp/'enrichment.json').write_bytes(compact({**header, 'derived': refs}))
        for filename in (*FILENAMES.values(), 'enrichment.json'):
            os.replace(tmp/filename, target/filename)
    return totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=Path('site/data/ris'))
    parser.add_argument('--output-dir', type=Path, default=Path('site/data/enriched'))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.source_dir, args.output_dir, args.check), ensure_ascii=False))
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(1, f'Verortungsdaten: {exc}\n')


if __name__ == '__main__':
    main()
