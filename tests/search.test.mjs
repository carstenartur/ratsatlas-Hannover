import test from 'node:test';
import assert from 'node:assert/strict';

test('geographic membership restricts pagination, matching IDs and the entire non-date histogram', () => {
  const rows = [
    {id:'city:a',title:'Schule A',level:'city',date:'2024-01-01',mapped:true},
    {id:'city:b',title:'Schule B',level:'city',date:'2025-01-01',mapped:true},
    {id:'city:c',title:'Schule C',level:'city',date:'2026-01-01',mapped:true},
    {id:'city:d',title:'Schule D',level:'city',date:null,mapped:false}
  ];
  const index = new SearchIndex(rows);
  const result = index.search({query:'Schule',recordIds:['city:a','city:c','city:c'],limit:1});
  assert.equal(result.total,2);
  assert.equal(result.items[0].id,'city:c');
  assert.deepEqual(result.matchedIds,['city:c','city:a']);
  assert.deepEqual(result.timeline.daily,[['2024-01-01',1],['2026-01-01',1]]);
  assert.equal(result.timeline.undatedCount,0);
  assert.equal(index.search({recordIds:[]}).total,0);
  assert.equal(index.search({recordIds:['city:a','city:c'],dateFrom:'2025-01-01'}).total,1);
  assert.equal(index.search({query:'Schule'}).total,4);
});
import { SearchIndex, normalize } from '../site/search.js';

const rows = [
  { id: 'hannover-sim:1047-2026', title: 'Radwege in Döhren-Wülfel', number: '1047/2026', date: '2026-05-12', level: 'city', body: 'Stadtbezirksrat Döhren-Wülfel', mapped: true, locations: ['Gustav-Adolf-Straße 12'] },
  { id: 'hannover-sim:1047-2026F1', title: 'Antwort zu Radwegen', number: '1047/2026 F1', date: '2026-05-18', level: 'city', body: 'Stadtbezirksrat Döhren-Wülfel', mapped: false, locations: [] },
  { id: 'region-hannover-ris:1047-2026', title: 'Radwege im Umland', number: '1047/2026', date: '2026-04-01', level: 'region', body: 'Verkehrsausschuss', mapped: false, locations: [] },
  { id: 'niedersachsen-landtag:abcdef', title: 'Förderung des Radverkehrs', number: '19/1234', date: '2024-03-01', level: 'state', body: 'Landtag', mapped: false, locations: [] },
  { id: 'hannover-sim:undated', title: 'Öffentliche Sitzung', date: null, level: 'city', mapped: false, locations: [] }
];

test('normalizes German diacritics, ß and punctuation for street and body searches', () => {
  assert.equal(normalize('DÖHREN–Wülfel / Straße'), 'dohren wulfel strasse');
  const index = new SearchIndex(rows);
  assert.equal(index.search({ query: 'gustav adolf strasse 12' }).total, 1);
  assert.equal(index.search({ query: 'dohren wulfel' }).total, 2);
});

test('all records including unlocated records remain searchable and source-separated', () => {
  const index = new SearchIndex(rows);
  assert.equal(index.search({}).total, 5);
  const found = index.search({ query: '1047/2026' });
  assert.equal(found.total, 3);
  assert.equal(new Set(found.items.map(r => r.id)).size, 3);
  assert.equal(index.search({ levels: ['state'] }).items[0].id, 'niedersachsen-landtag:abcdef');
  assert.equal(index.search({ levels: [] }).total, 0);
});

test('combines source, date and mapped filters without confusing mentions with locations', () => {
  const index = new SearchIndex(rows);
  assert.deepEqual(index.search({ query: 'rad', levels: ['city'], yearFrom: 2026, yearTo: 2026, mappedOnly: true }).items.map(r => r.id), ['hannover-sim:1047-2026']);
  assert.equal(index.search({ yearFrom: 2025 }).total, 3);
  assert.equal(index.search({ yearFrom: 2027, yearTo: 2026 }).total, 0);
});

test('paginates in descending date order without dropping equal numbers or undated records', () => {
  const index = new SearchIndex(rows);
  const first = index.search({ limit: 2 });
  const second = index.search({ limit: 2, offset: 2 });
  assert.deepEqual(first.items.map(r => r.id), ['hannover-sim:1047-2026F1', 'hannover-sim:1047-2026']);
  assert.equal(second.items.length, 2);
  assert.equal(index.search({ offset: 4 }).items[0].id, 'hannover-sim:undated');
  assert.equal(first.matchedIds.length, 5);
});

test('query syntax is plain text and is never evaluated as a regular expression', () => {
  const index = new SearchIndex(rows);
  assert.doesNotThrow(() => index.search({ query: '[.*+' }));
  assert.equal(index.search({ query: 'radwege im umland' }).total, 1);
});

test('ISO day bounds are inclusive, override the corresponding year bound and retain undated records after reset', () => {
  const index = new SearchIndex(rows);
  assert.deepEqual(index.search({ dateFrom: '2026-05-12', dateTo: '2026-05-18', yearFrom: '2027', yearTo: '2025' }).items.map(r => r.id),
    ['hannover-sim:1047-2026F1', 'hannover-sim:1047-2026']);
  assert.equal(index.search({ dateTo: '2026-05-12' }).total, 3);
  assert.equal(index.search({ dateFrom: '2026-05-19', dateTo: '2026-05-12' }).total, 0);
  assert.equal(index.search({ dateFrom: '', dateTo: '', yearFrom: '', yearTo: '' }).total, 5);
});

test('timeline counts cover every matching source before date filtering and pagination', () => {
  const result = new SearchIndex(rows).search({ dateFrom: '2026-05-18', limit: 1 });
  assert.equal(result.total, 1);
  assert.ok(result.timeline, 'search must provide the complete timeline projection');
  const histogram = result.timeline;
  assert.deepEqual(histogram.daily, [['2024-03-01', 1], ['2026-04-01', 1], ['2026-05-12', 1], ['2026-05-18', 1]]);
  assert.equal(histogram.undatedCount, 1);
  assert.equal(histogram.dataStart, '2024-03-01');
  assert.equal(histogram.dataEnd, '2026-05-18');
  assert.equal(histogram.months.length, 27);
  assert.equal(histogram.density.vorlage.Stadt.at(-1), 2);
  assert.equal(histogram.density.vorlage.Region.at(-2), 1);
  assert.equal(histogram.density.vorlage.Land[0], 1);
});

test('timeline respects non-date filters and distinguishes no dated matches from missing records', () => {
  const index = new SearchIndex(rows);
  const mapped = index.search({ query: 'Rad', levels: ['city'], mappedOnly: true, yearTo: '2020' });
  assert.equal(mapped.total, 0);
  assert.ok(mapped.timeline, 'date filters must not erase the histogram');
  assert.deepEqual(mapped.timeline.daily, [['2026-05-12', 1]]);
  assert.equal(mapped.timeline.undatedCount, 0);
  const undated = index.search({ query: 'Öffentliche Sitzung' });
  assert.equal(undated.total, 1);
  assert.deepEqual(undated.timeline.daily, []);
  assert.equal(undated.timeline.undatedCount, 1);
  assert.deepEqual(index.search({ levels: [] }).timeline.daily, []);
});
