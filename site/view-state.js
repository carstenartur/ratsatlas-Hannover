import { isoDay } from './search.js?v=bonn-20261121-1';

export const LEVELS = ['city','region','state'];
export const PANELS = ['list','detail','timeline'];
export const TIMELINE_ZOOMS = ['Jahr','Quartal','Monat','Woche','Tag'];
const defaults = {query:'', levels:LEVELS, yearFrom:'', yearTo:'', dateFrom:'', dateTo:'', mappedOnly:false, record:'', lat:52.375, lng:9.735, zoom:12, pane:'list', page:1, panels:['detail'], timelineZoom:'Jahr', timelineCenter:''};

// Legacy links had a list/map background plus a separately opened record dialog.
// Derive the equivalent Bonn sheet from normalized values, and use exactly the
// same rule when deciding whether a new URL needs an explicit fenster value.
function impliedPanels(state) {
  if (state.record) return ['detail'];
  if (state.pane === 'map') return [];
  const levels = state.levels || LEVELS;
  const hasSearch = String(state.query || '').trim() ||
    LEVELS.some(level => !levels.includes(level)) ||
    /^\d{4}$/.test(String(state.yearFrom || '')) || /^\d{4}$/.test(String(state.yearTo || '')) ||
    isoDay(state.dateFrom) || isoDay(state.dateTo) || state.mappedOnly || Number(state.page) > 1;
  return hasSearch ? ['list'] : [...defaults.panels];
}

export function readState(url) {
  const p = new URL(url).searchParams;
  function number(key, fallback, min, max, integer = false) {
    const raw = p.get(key);
    const n = Number(raw);
    return raw?.trim() && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n)) ? n : fallback;
  }
  const year = key => /^\d{4}$/.test(p.get(key)) ? p.get(key) : '';
  const state = {
    query:p.get('q') || '', levels:p.has('ebenen') ? LEVELS.filter(l => p.get('ebenen').split(',').includes(l)) : [...LEVELS],
    yearFrom:year('von'), yearTo:year('bis'), mappedOnly:p.get('verortet') === '1', record:p.get('vorgang') || '',
    dateFrom:isoDay(p.get('von')), dateTo:isoDay(p.get('bis')),
    lat:number('lat',defaults.lat,-85,85), lng:number('lng',defaults.lng,-180,180), zoom:number('z',defaults.zoom,2,19,true),
    pane:p.get('ansicht') === 'karte' ? 'map' : 'list', page:number('seite',1,1,100000,true),
    timelineZoom:TIMELINE_ZOOMS.includes(p.get('zeitzoom')) ? p.get('zeitzoom') : defaults.timelineZoom,
    timelineCenter:isoDay(p.get('zeitmitte'))
  };
  state.panels = p.has('fenster') ? [...new Set(p.get('fenster').split(',').filter(name => PANELS.includes(name)))] : impliedPanels(state);
  return state;
}
export function writeState(base,state) {
  const url = new URL(base);
  url.search = '';
  const implied = impliedPanels(state);
  const panels = state.panels || implied;
  const entries = {q:state.query, ebenen:state.levels.join(',') === LEVELS.join(',') ? null : state.levels.join(','),
    von:isoDay(state.dateFrom) || state.yearFrom || null, bis:isoDay(state.dateTo) || state.yearTo || null, verortet:state.mappedOnly ? 1 : null, vorgang:state.record || null,
    lat:state.lat === defaults.lat ? null : state.lat, lng:state.lng === defaults.lng ? null : state.lng,
    z:state.zoom === defaults.zoom ? null : state.zoom, ansicht:state.pane === 'map' ? 'karte' : null, seite:state.page === 1 ? null : state.page,
    fenster:panels.join(',') === implied.join(',') && panels.length ? null : panels.join(','),
    zeitzoom:!state.timelineZoom || state.timelineZoom === defaults.timelineZoom ? null : state.timelineZoom,
    zeitmitte:isoDay(state.timelineCenter) || null};
  for (const [key,value] of Object.entries(entries)) if (value != null && (value !== '' || key === 'ebenen' || key === 'fenster')) url.searchParams.set(key,value);
  return url;
}
