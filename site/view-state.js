export const LEVELS = ['city','region','state'];
const defaults = {query:'', levels:LEVELS, yearFrom:'', yearTo:'', mappedOnly:false, record:'', lat:52.375, lng:9.735, zoom:12, pane:'list', page:1};

export function readState(url) {
  const p = new URL(url).searchParams;
  function number(key, fallback, min, max, integer = false) {
    const raw = p.get(key);
    const n = Number(raw);
    return raw?.trim() && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n)) ? n : fallback;
  }
  const year = key => /^\d{4}$/.test(p.get(key)) ? p.get(key) : '';
  return {
    query:p.get('q') || '', levels:p.has('ebenen') ? LEVELS.filter(l => p.get('ebenen').split(',').includes(l)) : [...LEVELS],
    yearFrom:year('von'), yearTo:year('bis'), mappedOnly:p.get('verortet') === '1', record:p.get('vorgang') || '',
    lat:number('lat',defaults.lat,-85,85), lng:number('lng',defaults.lng,-180,180), zoom:number('z',defaults.zoom,2,19,true),
    pane:p.get('ansicht') === 'karte' ? 'map' : 'list', page:number('seite',1,1,100000,true)
  };
}
export function writeState(base,state) {
  const url = new URL(base);
  url.search = '';
  const entries = {q:state.query, ebenen:state.levels.join(',') === LEVELS.join(',') ? null : state.levels.join(','),
    von:state.yearFrom || null, bis:state.yearTo || null, verortet:state.mappedOnly ? 1 : null, vorgang:state.record || null,
    lat:state.lat === defaults.lat ? null : state.lat, lng:state.lng === defaults.lng ? null : state.lng,
    z:state.zoom === defaults.zoom ? null : state.zoom, ansicht:state.pane === 'map' ? 'karte' : null, seite:state.page === 1 ? null : state.page};
  for (const [key,value] of Object.entries(entries)) if (value != null && (value !== '' || key === 'ebenen')) url.searchParams.set(key,value);
  return url;
}
