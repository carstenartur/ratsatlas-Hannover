// Searchable projections are generated from the complete, verified RIS snapshot.
export function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD')
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Calendar days, not timestamps: rejecting rollover dates keeps URL filters and
// the timeline consistent (for example, 2025-02-29 must not become March 1).
export function isoDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? value : '';
}

const sourceCategories = { city: 'Stadt', region: 'Region', state: 'Land' };

function histogram(days, months, undatedCount) {
  const daily = [...days].sort(([a], [b]) => a.localeCompare(b));
  const dataStart = daily[0]?.[0] || null, dataEnd = daily.at(-1)?.[0] || null;
  const categories = Object.values(sourceCategories);
  const density = { vorlage: Object.fromEntries(categories.map(name => [name, []])), sitzung: [] };
  const orderedMonths = [];
  if (dataStart) {
    const first = Number(dataStart.slice(0, 4)) * 12 + Number(dataStart.slice(5, 7)) - 1;
    const last = Number(dataEnd.slice(0, 4)) * 12 + Number(dataEnd.slice(5, 7)) - 1;
    for (let month = first; month <= last; month++) {
      const key = `${String(Math.floor(month / 12)).padStart(4, '0')}-${String(month % 12 + 1).padStart(2, '0')}`;
      orderedMonths.push(key);
      for (const name of categories) density.vorlage[name].push(months.get(key)?.[name] || 0);
      density.sitzung.push(0);
    }
  }
  return { months: orderedMonths, categories, density, daily, undatedCount, dataStart, dataEnd };
}

export class SearchIndex {
  constructor(records) {
    if (!Array.isArray(records) || records.some(r => !r || typeof r.id !== 'string' || typeof r.title !== 'string')) {
      throw new Error('Der Suchindex ist ungültig.');
    }
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('Doppelte Vorgangs-ID im Suchindex.');
    this.rows = records.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.id.localeCompare(b.id));
    this.text = this.rows.map(r => normalize([r.title, r.number, r.body, r.type, ...(r.locations || [])].join(' ')));
    this.dates = this.rows.map(r => isoDay(r.date));
  }

  search({ query = '', levels, yearFrom, yearTo, dateFrom, dateTo, mappedOnly = false, offset = 0, limit = 24 } = {}) {
    const words = normalize(query).split(' ').filter(Boolean);
    const sourceLevels = new Set(levels ?? ['city', 'region', 'state']);
    const lower = isoDay(dateFrom) || (/^\d{4}$/.test(String(yearFrom)) ? `${yearFrom}-01-01` : '');
    const upper = isoDay(dateTo) || (/^\d{4}$/.test(String(yearTo)) ? `${yearTo}-12-31` : '');
    const start = Math.max(0, Math.floor(Number(offset) || 0));
    const size = Math.max(1, Math.min(100, Math.floor(Number(limit) || 24)));
    const items = [], matchedIds = [], years = {};
    const days = new Map(), months = new Map();
    let total = 0, undatedCount = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (!sourceLevels.has(row.level) || mappedOnly && !row.mapped || !words.every(w => this.text[i].includes(w))) continue;
      const day = this.dates[i], year = day ? Number(day.slice(0, 4)) : null;
      if (year !== null) years[year] = (years[year] || 0) + 1;
      // The brush is built from all non-date matches, never from the current
      // page or date range. Narrowing time must not erase the surrounding bars.
      if (day) {
        days.set(day, (days.get(day) || 0) + 1);
        const month = day.slice(0, 7), category = sourceCategories[row.level];
        if (!months.has(month)) months.set(month, {});
        const counts = months.get(month);
        counts[category] = (counts[category] || 0) + 1;
      } else undatedCount++;
      if (!day ? lower || upper : lower && day < lower || upper && day > upper) continue;
      if (total >= start && items.length < size) items.push(row);
      total++;
      matchedIds.push(row.id);
    }
    return { items, total, years, matchedIds, timeline: histogram(days, months, undatedCount) };
  }
}
