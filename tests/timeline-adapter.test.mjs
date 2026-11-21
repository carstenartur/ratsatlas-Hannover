import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchIndex } from '../site/search.js';
import * as adapter from '../site/timeline-adapter.js';

test('the timeline retains dates newer than the source check and has no invented meeting or electoral data', () => {
  assert.equal(typeof adapter.timelineData, 'function');
  const result = new SearchIndex([
    { id: 'city:one', title: 'Vorlage', date: '2026-10-01', level: 'city' },
    { id: 'region:one', title: 'Vorlage', date: '2026-11-13', level: 'region' },
    { id: 'state:one', title: 'Ohne Datum', date: null, level: 'state' }
  ]).search();
  const data = adapter.timelineData(result.timeline, { provenance: { sourceVerifiedAt: '2026-11-08T17:02:48.611Z' } });
  assert.equal(data.dataStart, '2026-10-01');
  assert.equal(data.dataEnd, '2026-11-13');
  assert.equal(data.dataStand, '2026-11-08');
  assert.equal(data.undatedCount, 1);
  assert.deepEqual(data.dimensions, ['vorlage']);
  assert.deepEqual(data.meetings, []);
  assert.deepEqual(data.terms, []);
});

test('empty or entirely undated matches produce an empty dated timeline while retaining the unknown-date count', () => {
  assert.equal(typeof adapter.timelineData, 'function');
  const result = new SearchIndex([{ id: 'city:one', title: 'Ohne Datum', date: null, level: 'city' }]).search();
  const data = adapter.timelineData(result.timeline, { provenance: { sourceVerifiedAt: '2026-11-08T00:00:00Z' } });
  assert.equal(data.undatedCount, 1);
  assert.deepEqual(data.daily, []);
  assert.deepEqual(data.density.vorlage, { Stadt: [0], Region: [0], Land: [0] });
  assert.deepEqual(data.months, ['2026-11']);
});

test('the selected trace uses qualified identity and only dates and outcomes from the supplied record', () => {
  assert.equal(typeof adapter.timelinePaper, 'function');
  const paper = adapter.timelinePaper({
    record: { id: 'region:one', number: '1047/2026', date: '2026-05-12', title: 'Radweg', url: 'https://example.org/vorlage' },
    events: [
      { date: '2026-05-18', body: 'Verkehrsausschuss', outcome: 'Vertagt', evidence: 'Original', url: 'https://example.org/beratung' },
      { date: null, body: 'Rat', outcome: 'Offen' },
      { date: '2025-02-29', body: 'Rat', outcome: 'Ungültiges Datum' }
    ]
  });
  assert.equal(paper.id, 'region:one');
  assert.equal(paper.reference, '1047/2026');
  assert.deepEqual(paper.steps.map(s => [s.typ, s.date, s.result || null]),
    [['vorlage', '2026-05-12', null], ['beratung', '2026-05-18', 'Vertagt']]);
  assert.equal(paper.steps[1].source_object, 'https://example.org/beratung');
  assert.equal(paper.steps[1].evidence, 'Original');
  assert.equal(adapter.timelinePaper(null), null);
});
