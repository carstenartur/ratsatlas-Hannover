import { SearchIndex } from './search.js?v=kartenorte-20261121-5';
import { verifiedJson } from './data.js?v=kartenorte-20261121-5';

let indexPromise;
self.onmessage = async ({ data }) => {
  try {
    if (!indexPromise) indexPromise = (async () => {
      const value = await verifiedJson(await fetch(data.url), data.descriptor);
      if (value.generation !== data.generation || value.records?.length !== data.count) throw new Error('Der Suchindex gehört nicht zum übernommenen Datenstand.');
      return new SearchIndex(value.records);
    })().catch(error => { indexPromise = null; throw error; });
    const index = await indexPromise;
    self.postMessage({ id: data.id, result: index.search(data.params) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message || 'Die Suche konnte nicht geladen werden.' });
  }
};
