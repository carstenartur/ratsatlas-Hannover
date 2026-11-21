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

function enrichedFixture({generation, manifestHash, foreignGeometry = false} = {}) {
  const base = fixture(), supplemental = new Map();
  const sourceGeneration = base.manifest.generation;
  const feature = {type:'Feature',geometry:{type:'Point',coordinates:[9.72521,52.3824]},properties:{geometryId:'place:example',recordIds:foreignGeometry ? ['hannover-sim:other'] : [base.id],label:'Belegter Projektstandort',accuracy:'Projektpunkt'}};
  const values = {
    searchIndex:{generation:sourceGeneration,records:[{id:base.id,title:'Radweg',level:'city',mapped:true,locations:['Belegter Projektstandort']}]},
    map:{type:'FeatureCollection',generation:sourceGeneration,features:[feature]},
    additions:{generation:sourceGeneration,records:{[base.id]:{geometryIds:['place:example'],locations:[{label:'Belegter Projektstandort',mapped:true,method:'Amtlicher Projektpunkt',sourceUrl:'https://www.hannover.de/projekt',evidence:{source:'document',text:'Der Projektstandort',url:'https://www.hannover.de/projekt'}}]}}}
  };
  const derived = {};
  for (const [key,name] of [['searchIndex','search-index.json.gz'],['map','map.geojson.gz'],['additions','additions.json.gz']]) {
    const a = asset(values[key]); a.ref.path = name; derived[key] = a.ref; supplemental.set(name,a.gzip);
  }
  const enrichment = {schemaVersion:1,sourceGeneration:generation ?? sourceGeneration,sourceManifestSha256:manifestHash ?? createHash('sha256').update(base.payloads.get('hannover.json')).digest('hex'),totals:{recordCount:1,mappedRecordCount:1,geometryCount:1,originalMappedRecordCount:0,addedRecordCount:1,addedGeometryCount:1,levelCounts:{city:{records:1,mapped:1}}},sources:[{url:'https://www.hannover.de/projekt',attribution:'Stadt Hannover'}],derived};
  supplemental.set('enrichment.json',JSON.stringify(enrichment));
  const fetch = async url => {
    const u = new URL(url), payloads = u.pathname.includes('/enriched/') ? supplemental : base.payloads;
    const name = u.pathname.split('/').pop();
    return payloads.has(name) ? new Response(payloads.get(name)) : new Response('missing',{status:404});
  };
  return {...base,atlas:new AtlasData({baseUrl:'https://example.org/project/data/ris/',enrichmentUrl:'https://example.org/project/data/enriched/enrichment.json',fetch,worker:false}),supplemental,enrichment};
}

test('verified supplemental locations reach search, map and details while original events and source bytes survive', async () => {
  const {atlas,id,payloads} = enrichedFixture();
  const original = payloads.get('hannover.json');
  const {manifest} = await atlas.init();
  assert.equal(manifest.recordCount,1);
  assert.equal(manifest.mappedRecordCount,1);
  assert.equal((await atlas.search({query:'Projektstandort',mappedOnly:true})).total,1);
  const map = await atlas.getMap(), detail = await atlas.getRecord(id);
  assert.deepEqual(map.features[0].geometry.coordinates,[9.72521,52.3824]);
  assert.deepEqual(detail.features[0].geometry.coordinates,[9.72521,52.3824]);
  assert.equal(detail.locations[0].sourceUrl,'https://www.hannover.de/projekt');
  assert.equal(detail.events[0].outcome,'Vertagt');
  assert.equal(payloads.get('hannover.json'),original);
});

test('supplemental data from another source generation or source manifest is refused', async () => {
  for (const options of [{generation:'0'.repeat(64)},{manifestHash:'f'.repeat(64)}]) {
    await assert.rejects(enrichedFixture(options).atlas.init(),/Ergänzung|Datenstand|Quell/);
  }
});

test('a supplemental feature assigned to another record cannot be shown as this records location', async () => {
  const {atlas,id} = enrichedFixture({foreignGeometry:true});
  await assert.rejects(atlas.getRecord(id),/Kartengeometrie|Zuordnung|Vorgang/);
});

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

test('default browser fetch retains its native global receiver', async () => {
  const { payloads } = fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async function (url) {
    assert.equal(this, globalThis, 'browser fetch must be called on its global scope');
    return new Response(payloads.get(new URL(url).pathname.split('/').pop()));
  };
  try {
    const atlas = new AtlasData({ baseUrl: 'http://localhost/project/data/ris/', worker: false });
    await atlas.init();
    assert.equal((await atlas.search({ query: 'Radweg' })).total, 1);
  } finally { globalThis.fetch = original; }
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
