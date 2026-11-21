import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AtlasData } from '../site/data.js';

const directory = new URL('../site/data/ris/', import.meta.url);
const atlas = new AtlasData({ baseUrl: 'https://test.invalid/ratsatlas-Hannover/data/ris/', worker: false,
  fetch: async url => {
    try { return new Response(await readFile(new URL(new URL(url).pathname.split('/').pop(), directory))); }
    catch { return new Response('Missing source file', { status: 404 }); }
  }
});

test('actual imported dataset is searchable across every source including unlocated records', async () => {
  const { manifest } = await atlas.init();
  const all = await atlas.search({});
  assert.equal(all.total, manifest.recordCount);
  assert.equal((await atlas.search({ mappedOnly: true })).total, manifest.mappedRecordCount);
  for (const level of ['city', 'region', 'state']) {
    const found = await atlas.search({ levels: [level] });
    assert.equal(found.total, manifest.levelCounts[level].records);
    const detail = await atlas.getRecord(found.items[0].id);
    assert.equal(detail.record.sourceContext.level, level);
    assert.match(detail.record.url, /^https:\/\//);
  }
});

test('request and answer stay separate and linked, even without map positions', async () => {
  const result = await atlas.search({ query: '1047/2026' });
  const ids = new Set(result.items.map(row => row.id));
  assert.ok(ids.has('hannover-sim:1047-2026'));
  assert.ok(ids.has('hannover-sim:1047-2026F1'));
  const answer = await atlas.getRecord('hannover-sim:1047-2026F1');
  assert.ok(answer.relatedRecords.some(record => record.id === 'hannover-sim:1047-2026'));
  assert.ok(answer.relationships.some(relation => relation.evidence));
});

test('Gustav-Adolf-Straße remains findable and mapped evidence uses source geometry', async () => {
  const result = await atlas.search({ query: 'Gustav Adolf Straße' });
  assert.ok(result.total > 0);
  const mapped = result.items.find(row => row.mapped);
  assert.ok(mapped);
  const detail = await atlas.getRecord(mapped.id);
  assert.ok(detail.locations.some(location => location.evidence?.text));
  assert.ok(detail.features.length > 0);
  const map = await atlas.getMap();
  assert.equal(map.features.length, atlas.manifest.geometryCount);
  assert.ok(map.features.some(feature => feature.properties.recordIds.includes(mapped.id)));
});
