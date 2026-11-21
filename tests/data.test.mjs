import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { AtlasData, verifiedJson, qualifiedId } from '../site/data.js';

function asset(value, kind = 'records') {
  const bytes = Buffer.from(JSON.stringify(value));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { ref: { path: `hannover.${sha256}.${kind}.json.gz`, sha256, bytes: bytes.length, count: value.entries?.length || 0, kind }, bytes, gzip: gzipSync(bytes) };
}

test('checks the hash of uncompressed bytes, including hosts which auto-decompress gzip', async () => {
  const a = asset({ type: 'leaf', entries: [] });
  assert.deepEqual(await verifiedJson(new Response(a.gzip), a.ref), { type: 'leaf', entries: [] });
  assert.deepEqual(await verifiedJson(new Response(a.bytes), a.ref), { type: 'leaf', entries: [] });
  const wrong = { ...a.ref, sha256: '0'.repeat(64) };
  await assert.rejects(verifiedJson(new Response(a.gzip), wrong), /Prüfsumme/);
  await assert.rejects(verifiedJson(new Response(a.gzip), { ...a.ref, bytes: a.bytes.length - 1 }), /Größe/);
});

test('source-qualified identities keep city/region numbers separate and preserve Landtag originals', () => {
  assert.equal(qualifiedId({ id: 'abc123', source: 'niedersachsen-landtag' }), 'niedersachsen-landtag:abc123');
  assert.equal(qualifiedId({ id: 'hannover-sim:1047', source: 'hannover-sim' }), 'hannover-sim:1047');
});

function fixture() {
  const id = 'hannover-sim:1047-2026';
  const records = asset({ type: 'leaf', entries: [[id, { id, source: 'hannover-sim', title: 'Radweg', url: 'https://e-government.hannover-stadt.de/test', date: '2026-01-01', sourceContext: { level: 'city' }, locationCount: 0, eventCount: 1, relationshipCount: 0 }]] });
  const empty = kind => asset({ type: 'leaf', entries: [] }, kind);
  const links = asset({ type: 'leaf', entries: [[JSON.stringify([`events:${id}`, 0]), { items: [{ date: '2026-01-02', body: 'Rat', outcome: 'Vertagt', evidence: 'Originalwortlaut', url: 'https://e-government.hannover-stadt.de/test' }], total: 1, start: 0, nextPage: null }]] }, 'links');
  const nodes = { records, locations: empty('locations'), relations: empty('relations'), search: empty('search'), geometry: empty('geometry'), links, spatial: empty('spatial') };
  const roots = Object.fromEntries(Object.entries(nodes).map(([kind, a]) => [kind, a.ref]));
  const generation = createHash('sha256').update(JSON.stringify(roots)).digest('hex');
  const manifest = { schemaVersion: 2, city: 'hannover', generation, roots, generatedAt: '2020-01-01T00:00:00.000Z', recordCount: 1, mappedRecordCount: 0, geometryCount: 0 };
  const map = asset({ type: 'FeatureCollection', generation, features: [] });
  const search = asset({ schemaVersion: 1, generation, records: [{ id, sourceId: id, title: 'Radweg', level: 'city', mapped: false, locations: [] }] });
  map.ref.path = 'map.geojson.gz'; search.ref.path = 'search-index.json.gz';
  const migration = { source: { generation, manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') }, importedAt: '2026-11-21T00:00:00.000Z', derived: { searchIndex: search.ref, map: map.ref } };
  const payloads = new Map([['hannover.json', JSON.stringify(manifest)], ['migration.json', JSON.stringify(migration)], [map.ref.path, map.gzip], [search.ref.path, search.gzip], ...Object.values(nodes).map(a => [a.ref.path, a.gzip])]);
  const fetch = async url => { const name = new URL(url).pathname.split('/').pop(); return payloads.has(name) ? new Response(payloads.get(name)) : new Response('missing', { status: 404 }); };
  return { atlas: new AtlasData({ baseUrl: 'http://localhost/project/data/ris/', fetch, worker: false }), id, payloads, manifest };
}

test('old archives remain accessible, with their original source date', async () => {
  const { atlas, id } = fixture();
  const { manifest } = await atlas.init();
  assert.equal(manifest.generatedAt, '2020-01-01T00:00:00.000Z');
  const detail = await atlas.getRecord(id);
  assert.equal(detail.record.id, id);
  assert.deepEqual(detail.locations, []);
  assert.equal(detail.events[0].outcome, 'Vertagt');
  assert.equal((await atlas.search({ query: 'Radweg' })).total, 1);
  assert.equal((await atlas.getMap()).features.length, 0);
});

test('missing records and damaged assets fail visibly instead of returning invented empty details', async () => {
  const { atlas, id, payloads, manifest } = fixture();
  await assert.rejects(atlas.getRecord('hannover-sim:missing'), /nicht im übernommenen Bestand/);
  payloads.set(manifest.roots.records.path, gzipSync(Buffer.from('{}')));
  const fresh = new AtlasData({ baseUrl: 'http://localhost/project/data/ris/', worker: false, fetch: async url => new Response(payloads.get(new URL(url).pathname.split('/').pop())) });
  await assert.rejects(fresh.getRecord(id), /Größe|Prüfsumme/);
});

test('map popup summaries load real titles and share a single in-flight partition request', async () => {
  const { atlas, id, manifest } = fixture();
  const original = atlas.fetch;
  let reads = 0;
  atlas.fetch = async (url, options) => {
    if (new URL(url).pathname.endsWith(manifest.roots.records.path)) reads++;
    return original(url, options);
  };
  const [first, second] = await Promise.all([atlas.getSummaries([id]), atlas.getSummaries([id])]);
  assert.equal(first[0].title, 'Radweg');
  assert.equal(second[0].id, id);
  assert.equal(reads, 1);
});
