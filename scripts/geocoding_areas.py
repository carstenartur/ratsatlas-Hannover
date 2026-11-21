"""Resolve explicitly specified Hannover areas from the subject of a RIS title."""

import re


AREA_KIND = re.compile(r'(?<![\w-])stadt(bezirk|teil)(es|s|en|e)?\b\s*:?\s*')
SESSION_SUFFIX = re.compile(
    r'\b(?:sitzung\s+(?:des|der|vom|am|im)\b|ratssitzung\b|stadtbezirksratssitzung\b|top\s+\d)'
    r'|(?:^|[,;]|\s[-–—])\s*(?:stadtbezirksr(?:at|ät)\w*|bezirksrat\w*|ausschuss\w*|kommission)\b'
)
AREA_LOCATIVE = r'(?:im|in(?: (?:dem|den))?|für den)'
SCOPE_PREFIX = re.compile(rf'\b{AREA_LOCATIVE}\s+$')
COMMITTEE_PREFIX = re.compile(
    r'\b(?:fraktion|gruppe|partei|beirat|gremium|verein|stadtbezirksr(?:at|ät)\w*|bezirksrat\w*)'
    rf'\s+{AREA_LOCATIVE}\s+$'
)
PROPOSER_PREFIX = re.compile(
    r'\b(?:\w*antr(?:ag|äge|ägen)|anfragen?|vorschl(?:ag|äge)|anregungen?|stellungnahmen?)\s+(?:des|vom)\s+$'
)
NON_SCOPE_PREFIX = re.compile(
    rf'\b(?:(?:bis|anstatt|statt|nicht(?: nur)?|außerhalb(?: von)?)\s+{AREA_LOCATIVE}|bis zum|zwischen dem)\s+$'
)
JOINED_SCOPE = re.compile(rf'\b(?:und|oder|sowie|bzw\.?)\s+{AREA_LOCATIVE}\s+$')
LOCATIVE = re.compile(r'\b(?:im|in(?: (?:der|dem|den))?|für den)\s+')
UNRELATED = re.compile(
    r'\b(?:sitzungsort|tagungsort|einwohnerversammlung|kontakt(?:adresse)?|anschrift|'
    r'vorbild|vergleich|analog|beispiel|rückblick|anders als|wie (?:beim|im))\b'
)
HANNOVER = re.compile(r'^hannover(?:\s*[-–—]\s*|\s+)')
DISTRICT_NUMBER = re.compile(r'^(?:nr\.?\s*)?([0-9]{1,2})(?!\w|\s*\.\s*\d)')
PARENTHESIZED_NUMBER = re.compile(r'^\s*\(([0-9]{1,2})\)')
DISTRICT_LIST = re.compile(r'^\s*[-–—,]\s*[0-9]{1,2}(?![\w.])')
APPOSITION = re.compile(r'^(?:\s*[,|]\s*|\s+i\s+|\s+)')
CONTINUATION = re.compile(r'^\s*(?:und\b|oder\b|sowie\b|bzw\b|bis\b|nebst\b|[+/&])')
NON_AREA_SUFFIX = re.compile(
    r'^\s*(?:e\s*\.\s*v\s*\.|(?:g)?gmbh\b|der (?:stadt|gemeinde)\s+(?!hannover\b))'
)
NAME_SEPARATOR = r'(?:\s*[-–—/,]\s*|\s+)'
NAME_END = r'(?![\w\-/–—])'
LEVEL = {'bezirk': 'Stadtbezirk', 'stadtteil': 'Stadtteil'}
METHOD = 'Amtliches Gebiet aus ausdrücklicher Titelangabe'


class AreaResolver:
    def __init__(self, boundaries, source):
        self.source = source
        self.by_id = {feature['properties']['areaId']: feature for feature in boundaries}
        self.names = []
        self.area_ids = {}
        for area_id, feature in self.by_id.items():
            area = feature['properties']
            parts = area['name'].casefold().split('-')
            pattern = re.compile(NAME_SEPARATOR.join(map(re.escape, parts)) + NAME_END)
            self.names.append((pattern, feature))
            self.area_ids[f'{LEVEL[area["kind"]]} {area["name"]}'] = area_id
        self.names.sort(key=lambda pair: -len(pair[1]['properties']['name']))

    def match_name(self, text, kind=None):
        for name, feature in self.names:
            if kind is None or feature['properties']['kind'] == kind:
                match = name.match(text)
                if match:
                    return feature, text[match.end():]
        return None, text

    def match_area(self, text, kind):
        text = HANNOVER.sub('', text, count=1)
        number = DISTRICT_NUMBER.match(text) if kind == 'bezirk' else None
        if number:
            area_id = f'bezirk:{int(number[1]):02d}'
            area, tail = self.by_id.get(area_id), text[number.end():]
            if DISTRICT_LIST.match(tail):
                return None, tail
            apposition = APPOSITION.match(tail)
            if apposition:
                rest = tail[apposition.end():]
                name, name_tail = self.match_name(rest, kind)
                if name is not None:
                    return (area, name_tail) if name is area else (None, tail)
            return area, tail

        area, tail = self.match_name(text, kind)
        number = PARENTHESIZED_NUMBER.match(tail) if area is not None and kind == 'bezirk' else None
        if number:
            if f'bezirk:{int(number[1]):02d}' != area['properties']['areaId']:
                return None, tail
            tail = tail[number.end():]
        return area, tail

    def find(self, title, evidence):
        if evidence.get('source') != 'title':
            return []
        title = SESSION_SUFFIX.split(' '.join(title.casefold().split()), maxsplit=1)[0]
        if UNRELATED.search(title):
            return []

        mentioned = set()
        candidate = None
        for marker in AREA_KIND.finditer(title):
            prefix = title[:marker.start()]
            if marker[2] in ('e', 'en') or NON_SCOPE_PREFIX.search(prefix):
                return []
            if COMMITTEE_PREFIX.search(prefix) or PROPOSER_PREFIX.search(prefix):
                continue
            eligible = SCOPE_PREFIX.search(prefix)
            kind = 'bezirk' if marker[1] == 'bezirk' else 'stadtteil'
            area, tail = self.match_area(title[marker.end():], kind)
            if area is None or NON_AREA_SUFFIX.match(tail):
                if eligible:
                    return []
                continue

            # A bare designation can make a locative candidate ambiguous.
            mentioned.add(area['properties']['areaId'])
            if len(mentioned) > 1:
                return []
            if not eligible:
                continue
            if CONTINUATION.match(tail):
                return []
            join = JOINED_SCOPE.search(prefix)
            if join:
                previous = LOCATIVE.split(prefix[:join.start()])[-1].strip()
                previous_area, previous_tail = self.match_name(previous)
                if (previous_area is not None and not previous_tail) or previous in ('hannover', 'lhh', 'innenstadt'):
                    return []
            next_name, _ = self.match_name(tail.lstrip(' ,'))
            if next_name is not None:
                return []
            candidate = area

        if candidate is None:
            return []
        data = candidate['properties']
        level = LEVEL[data['kind']]
        return [(f'{level} {data["name"]}', candidate['geometry'], 'area', f'Nur {level} bekannt',
                 METHOD, self.source['url'], self.source['attribution'], evidence)]
