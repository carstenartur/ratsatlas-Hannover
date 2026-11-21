import { SearchIndex } from './search.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const ROOTS = ['records', 'locations', 'relations', 'search', 'geometry', 'links', 'spatial'];
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));

async function readLimited(stream, maximum) {
  if (!stream) throw new Error('Die Datendatei enthält keinen Inhalt.');
  const reader = stream.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new Error('Die Größe der Datendatei stimmt nicht mit dem geprüften Bestand überein.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return result;
}

export async function verifiedJson(response, descriptor) {
  if (!response.ok) throw new Error(`Datendatei nicht verfügbar (HTTP ${response.status}). Bitte erneut versuchen.`);
  if (!descriptor || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > 128 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(descriptor.sha256)) {
    throw new Error('Ungültige Prüfangaben zur Datendatei.');
  }
  let bytes = await readLimited(response.body, Math.max(descriptor.bytes + 1024, descriptor.compressedBytes || 0));
  // Some servers decode Content-Encoding automatically, others serve .gz bytes.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Bitte einen aktuellen Browser mit Gzip-Unterstützung verwenden.');
    bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), descriptor.bytes);
  }
  if (bytes.byteLength !== descriptor.bytes) throw new Error('Die Größe der Datendatei stimmt nicht mit dem geprüften Bestand überein.');
  if (await digest(bytes) !== descriptor.sha256) throw new Error('Die Prüfsumme der Datendatei stimmt nicht. Bitte die Seite neu laden.');
  return JSON.parse(decoder.decode(bytes));
}

export function qualifiedId(record) {
  return record.id.includes(':') ? record.id : `${record.source}:${record.id}`;
}

export class AtlasData {
  constructor({ baseUrl = new URL('./data/ris/', import.meta.url), fetch: fetchImpl = globalThis.fetch, worker = true } = {}) {
    this.baseUrl = new URL(baseUrl);
    this.fetch = fetchImpl;
    this.useWorker = worker && typeof Worker !== 'undefined';
    this.cache = new Map();
    this.jsonHashes = new Map();
    this.cacheBytes = 0;
    this.pending = new Map();
    this.serial = 0;
  }

  async _json(path) {
    const response = await this.fetch(new URL(path, this.baseUrl), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Der Datenstand konnte nicht geladen werden (HTTP ${response.status}).`);
    const bytes = await readLimited(response.body, 512 * 1024);
    this.jsonHashes.set(path, await digest(bytes));
    return JSON.parse(decoder.decode(bytes));
  }

  init() {
    if (!this.initializing) this.initializing = Promise.all([this._json('hannover.json'), this._json('migration.json')]).then(async ([manifest, migration]) => {
      if (manifest.schemaVersion !== 2 || manifest.city !== 'hannover' || !ROOTS.every(k => manifest.roots?.[k]?.kind === k) || migration.source?.generation !== manifest.generation) {
        throw new Error('Katalog und Importbericht gehören nicht zum selben Datenstand.');
      }
      if (migration.source.manifestSha256 !== this.jsonHashes.get('hannover.json')) throw new Error('Die Prüfsumme des übernommenen Quellenkatalogs stimmt nicht.');
      if (await digest(encoder.encode(JSON.stringify(manifest.roots))) !== manifest.generation) throw new Error('Die Prüfsumme des Datenkatalogs stimmt nicht.');
      for (const [key, expected] of [['searchIndex', 'search-index.json.gz'], ['map', 'map.geojson.gz']]) {
        if (migration.derived?.[key]?.path !== expected) throw new Error('Der Importbericht enthält keine gültige Such- oder Kartenprojektion.');
      }
      this.manifest = manifest; this.migration = migration;
      return { manifest, migration };
    }).catch(error => { this.initializing = null; throw error; });
    return this.initializing;
  }

  async _projection(name) {
    await this.init();
    const ref = this.migration.derived[name];
    const value = await verifiedJson(await this.fetch(new URL(ref.path, this.baseUrl)), ref);
    if (value.generation !== this.manifest.generation) throw new Error('Die Datenprojektion gehört zu einem anderen Datenstand.');
    return value;
  }

  async getMap() {
    if (!this.mapPromise) this.mapPromise = this._projection('map').then(map => {
      if (map.type !== 'FeatureCollection' || !Array.isArray(map.features) || map.features.length !== this.manifest.geometryCount) throw new Error('Die Kartenprojektion ist unvollständig.');
      return map;
    }).catch(error => { this.mapPromise = null; throw error; });
    return this.mapPromise;
  }

  async search(params = {}) {
    await this.init();
    if (this.useWorker) {
      if (!this.worker) {
        this.worker = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }) => {
          const request = this.pending.get(data.id);
          if (!request) return;
          this.pending.delete(data.id);
          data.error ? request.reject(new Error(data.error)) : request.resolve(data.result);
        };
        this.worker.onerror = () => {
          for (const request of this.pending.values()) request.reject(new Error('Die Suche konnte nicht gestartet werden. Bitte erneut versuchen.'));
          this.pending.clear(); this.worker.terminate(); this.worker = null; this.useWorker = false;
        };
      }
      const id = ++this.serial;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ id, params, url: new URL(this.migration.derived.searchIndex.path, this.baseUrl).href, descriptor: this.migration.derived.searchIndex, generation: this.manifest.generation, count: this.manifest.recordCount });
      });
    }
    if (!this.indexPromise) this.indexPromise = this._projection('searchIndex').then(value => {
      if (value.records?.length !== this.manifest.recordCount) throw new Error('Der Suchindex ist unvollständig.');
      return new SearchIndex(value.records);
    }).catch(error => { this.indexPromise = null; throw error; });
    return (await this.indexPromise).search(params);
  }

  async _node(ref) {
    if (!ref || !ROOTS.includes(ref.kind) || ref.path !== `hannover.${ref.sha256}.${ref.kind}.json.gz` || !/^[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.bytes) || ref.bytes > 262144 || ref.count > 64 || ref.count < 0) {
      throw new Error('Ungültiger Verweis im Datenkatalog.');
    }
    const key = `${ref.path}:${ref.bytes}:${ref.count}`;
    if (this.cache.has(key)) return this.cache.get(key);
    while (this.cache.size && this.cacheBytes + ref.bytes > 16 * 1024 * 1024) {
      const oldest = this.cache.keys().next().value;
      this.cacheBytes -= this.cache.get(oldest).bytes;
      this.cache.delete(oldest);
    }
    const promise = Promise.resolve().then(() => this.fetch(new URL(ref.path, this.baseUrl))).then(response => verifiedJson(response, ref)).then(value => {
      if (!['branch', 'leaf'].includes(value.type) || !Array.isArray(value.entries) || value.entries.length !== ref.count || value.entries.some((item, i, rows) => !Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || i > 0 && rows[i - 1][0] >= item[0])) {
        throw new Error('Ungültige Datenpartition.');
      }
      return value;
    });
    promise.bytes = ref.bytes;
    this.cache.set(key, promise); this.cacheBytes += ref.bytes;
    promise.catch(() => { if (this.cache.get(key) === promise) { this.cache.delete(key); this.cacheBytes -= ref.bytes; } });
    return promise;
  }

  async _get(kind, wanted) {
    await this.init();
    let ref = this.manifest.roots[kind], lower = null, upper = null;
    const seen = new Set();
    for (let depth = 0; depth < 32; depth++) {
      if (seen.has(ref.path)) break;
      seen.add(ref.path);
      const node = await this._node(ref);
      if (upper !== null && (node.entries.at(-1)?.[0] !== upper || lower !== null && node.entries[0]?.[0] <= lower)) throw new Error('Ungültige Reihenfolge im Datenkatalog.');
      if (node.type === 'leaf') return node.entries.find(([key]) => key === wanted)?.[1] ?? null;
      const position = node.entries.findIndex(([key]) => wanted <= key);
      if (position < 0) return null;
      lower = position ? node.entries[position - 1][0] : lower;
      [upper, ref] = node.entries[position];
      if (ref?.kind !== kind) throw new Error('Ungültige Teilbaum-Zuordnung.');
    }
    throw new Error('Der Datenkatalog enthält einen ungültigen Verweiszyklus.');
  }

  async _pages(kind, id, expected) {
    const items = [];
    let total = null;
    for (let page = 0; page < 10000; page++) {
      const value = await this._get(kind, JSON.stringify([id, page]));
      if (!value && page === 0 && !expected) return [];
      if (!value || !Array.isArray(value.items) || !value.items.length || value.items.length > 64 || value.start !== items.length || !Number.isSafeInteger(value.total) || value.total < value.items.length || total !== null && total !== value.total || expected !== undefined && value.total !== expected) {
        throw new Error('Die Detailangaben sind unvollständig oder widersprüchlich.');
      }
      total = value.total; items.push(...value.items);
      if (value.nextPage === null) {
        if (items.length !== total) throw new Error('Die Detailangaben sind unvollständig.');
        return items;
      }
      if (value.nextPage !== page + 1 || items.length >= total) throw new Error('Ungültige Fortsetzung der Detailangaben.');
    }
    throw new Error('Zu viele Detailseiten im Datenbestand.');
  }

  async _record(id) {
    let record = await this._get('records', id);
    if (!record && id.includes(':')) {
      const candidate = await this._get('records', id.slice(id.indexOf(':') + 1));
      if (candidate && qualifiedId(candidate) === id) record = candidate;
    }
    if (!record) return null;
    if (typeof record.id !== 'string' || typeof record.source !== 'string' || qualifiedId(record) !== id && record.id !== id) throw new Error('Widersprüchliche Vorgangs-ID.');
    return { ...record, sourceId: record.id, id: qualifiedId(record), level: record.sourceContext?.level || 'city' };
  }

  async getRecord(id) {
    const record = await this._record(id);
    if (!record) throw new Error('Dieser Vorgang ist nicht im übernommenen Bestand enthalten.');
    const raw = record.sourceId;
    const [locations, events, relationships, membership, geometryIds] = await Promise.all([
      this._pages('locations', raw, record.locationCount),
      this._pages('links', `events:${raw}`, record.eventCount),
      this._pages('links', `relationships:${raw}`, record.relationshipCount),
      this._get('relations', `member:${raw}`),
      this._pages('links', `record:${raw}`)
    ]);
    const relatedIds = membership ? await this._pages('relations', membership.component) : [];
    const related = [...new Set([...relatedIds, ...relationships.map(r => r.targetId).filter(Boolean), record.relatedTo].filter(r => r && r !== raw))];
    const relatedRecords = (await Promise.all(related.map(other => this._record(other)))).filter(Boolean);
    const features = await Promise.all(geometryIds.map(async geometryId => {
      const pointer = await this._get('geometry', geometryId);
      if (!pointer || pointer.geometryId !== geometryId || pointer.asset?.kind !== 'spatial') throw new Error('Eine verknüpfte Kartengeometrie fehlt.');
      const feature = (await this._node(pointer.asset)).entries.find(([key]) => key === pointer.spatialKey)?.[1];
      if (feature?.properties?.geometryId !== geometryId) throw new Error('Eine Kartengeometrie gehört nicht zum Vorgang.');
      return feature;
    }));
    return { record, locations, events, relationships, relatedRecords, features };
  }

  async getSummaries(ids) {
    if (!Array.isArray(ids) || ids.length > 30 || ids.some(id => typeof id !== 'string')) throw new Error('Bitte höchstens 30 Vorgänge gleichzeitig öffnen.');
    return (await Promise.all(ids.map(id => this._record(id)))).filter(Boolean);
  }
}
