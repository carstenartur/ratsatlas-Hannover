// Hannover data contract for the upstream Ratsatlas Bonn Timeline module.
// This adapter consumes only the complete search projection and an explicitly
// opened record. It never loads all record details or invents meeting dates.
import './timeline.js?v=bonn-20261121-1';
import { isoDay } from './search.js?v=bonn-20261121-1';
import { TIMELINE_ZOOMS } from './view-state.js?v=bonn-20261121-1';

export function timelineData(histogram, manifest = {}) {
  if (!histogram) throw new Error('Die Datumsverteilung fehlt im Suchergebnis.');
  const verified = isoDay(manifest.provenance?.sourceVerifiedAt?.slice(0, 10)) || isoDay(manifest.generatedAt?.slice(0, 10));
  const fallback = histogram.dataEnd || verified;
  if (!fallback) throw new Error('Für die Zeitleiste ist kein verlässliches Datum vorhanden.');
  const months = histogram.months.length ? histogram.months : [fallback.slice(0, 7)];
  const categories = histogram.categories;
  return {
    months, categories,
    density: histogram.months.length ? histogram.density : {
      vorlage: Object.fromEntries(categories.map(name => [name, [0]])), sitzung: [0]
    },
    daily: histogram.daily, undatedCount: histogram.undatedCount,
    dataStart: histogram.dataStart || fallback, dataEnd: histogram.dataEnd || fallback,
    dataStand: verified || histogram.dataEnd,
    standLabel: verified ? 'Quellenprüfstand' : 'Jüngstes Vorgangsdatum',
    meetings: [], terms: [], dimensions: ['vorlage'], dimension: 'vorlage',
    limits: [
      'Die Balken zählen Vorgänge nach ihrem überlieferten Datum. Sie folgen Suchbegriff, Quellenebenen und Verortungsfilter; der gewählte Zeitraum filtert anschließend Liste und Karte.',
      `${histogram.undatedCount.toLocaleString('de-DE')} passende Vorgänge haben kein Datum. „Gesamter Bestand“ hebt den Zeitfilter auf und schließt sie wieder ein.`,
      'Die Quelle kennzeichnet die Archivabdeckung als unvollständig. Der Quellenprüfstand und das jüngste Vorgangsdatum können voneinander abweichen.',
      'Die Auswahlspur zeigt überlieferte Beratungen des geöffneten Vorgangs. Eine vollständige Sitzungs- oder Wahlperiodenübersicht ist im Suchindex nicht enthalten.'
    ]
  };
}

export function timelinePaper(detail) {
  if (!detail?.record) return null;
  const { record, events = [] } = detail;
  const date = isoDay(record.date);
  const steps = date ? [{ typ: 'vorlage', date, label: 'Datum des Vorgangs', date_status: 'belegt', source_object: record.url }] : [];
  for (const event of events) {
    const eventDate = isoDay(event.date);
    if (!eventDate) continue;
    steps.push({ typ: 'beratung', date: eventDate, label: event.body || 'Überliefertes Beratungsereignis',
      result: event.outcome, date_status: 'belegt', source_object: event.url || record.url, evidence: event.evidence });
  }
  return { id: record.id, reference: record.number || record.id, name: record.title, date, steps };
}

export function createHannoverTimeline(element, { onRange = () => {}, onReset = () => {}, onStateChange = () => {} } = {}) {
  let data = null, state = { timelineZoom: 'Jahr', timelineCenter: '', dateFrom: '', dateTo: '', yearFrom: '', yearTo: '' };
  const changedView = raw => {
    state = { ...state, timelineZoom: raw.zoom, timelineCenter: raw.mitte };
    onStateChange({ timelineZoom: raw.zoom, timelineCenter: raw.mitte });
  };
  const timeline = globalThis.Timeline.create(element, {
    defaultZoom: 'Jahr',
    onRange(from, to) {
      state = { ...state, dateFrom: from, dateTo: to, yearFrom: '', yearTo: '' };
      onRange(from, to);
    },
    onReset() {
      state = { ...state, dateFrom: '', dateTo: '', yearFrom: '', yearTo: '' };
      onReset();
    },
    onStateChange: changedView,
    onDate(date) { timeline.center(date); changedView(timeline.getState()); }
  });

  function setState(next = {}) {
    state = { ...state, ...next };
    if (!data) return;
    const from = isoDay(state.dateFrom) || (/^\d{4}$/.test(String(state.yearFrom)) ? `${state.yearFrom}-01-01` : data.dataStart);
    const to = isoDay(state.dateTo) || (/^\d{4}$/.test(String(state.yearTo)) ? `${state.yearTo}-12-31` : data.dataEnd);
    timeline.setState({ von: from, bis: to, zoom: TIMELINE_ZOOMS.includes(state.timelineZoom) ? state.timelineZoom : 'Jahr',
      mitte: isoDay(state.timelineCenter), achse: 'vorlage' });
  }

  return {
    setStatus(message, busy) { timeline.setStatus(message,busy); },
    update(result, { state: next = state, manifest = {} } = {}) {
      data = timelineData(result.timeline, manifest);
      timeline.setData(data);
      setState(next);
    },
    select(detail) { timeline.select(timelinePaper(detail)); },
    setState,
    center(date) { if (data && isoDay(date)) timeline.center(date); },
    reset() {
      state = { ...state, dateFrom: '', dateTo: '', yearFrom: '', yearTo: '' };
      if (data) timeline.reset();
    },
    getState() {
      const view = data ? timeline.getState() : null;
      return { dateFrom: state.dateFrom || '', dateTo: state.dateTo || '',
        timelineZoom: view?.zoom || state.timelineZoom, timelineCenter: view?.mitte || state.timelineCenter };
    }
  };
}
