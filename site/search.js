// Searchable projections are generated from the complete, verified RIS snapshot.
export function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD')
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export class SearchIndex {
  constructor(records) {
    if (!Array.isArray(records) || records.some(r => !r || typeof r.id !== 'string' || typeof r.title !== 'string')) {
      throw new Error('Der Suchindex ist ungültig.');
    }
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('Doppelte Vorgangs-ID im Suchindex.');
    this.rows = records.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.id.localeCompare(b.id));
    this.text = this.rows.map(r => normalize([r.title, r.number, r.body, r.type, ...(r.locations || [])].join(' ')));
  }

  search({ query = '', levels, yearFrom, yearTo, mappedOnly = false, offset = 0, limit = 24 } = {}) {
    const words = normalize(query).split(' ').filter(Boolean);
    const sourceLevels = new Set(levels ?? ['city', 'region', 'state']);
    const lower = yearFrom ? Number(yearFrom) : 0, upper = yearTo ? Number(yearTo) : 9999;
    const start = Math.max(0, Math.floor(Number(offset) || 0));
    const size = Math.max(1, Math.min(100, Math.floor(Number(limit) || 24)));
    const items = [], matchedIds = [], years = {};
    let total = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (!sourceLevels.has(row.level) || mappedOnly && !row.mapped || !words.every(w => this.text[i].includes(w))) continue;
      const year = /^\d{4}/.test(row.date || '') ? Number(row.date.slice(0, 4)) : null;
      if (year !== null) years[year] = (years[year] || 0) + 1;
      if (year === null ? yearFrom || yearTo : year < lower || year > upper) continue;
      if (total >= start && items.length < size) items.push(row);
      total++;
      matchedIds.push(row.id);
    }
    return { items, total, years, matchedIds };
  }
}
