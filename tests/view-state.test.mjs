import test from 'node:test';
import assert from 'node:assert/strict';
import {readState, writeState} from '../site/view-state.js';

test('complete shared view round-trips under a repository path', () => {
  const url = new URL('https://example.org/atlas/');
  const state = {...readState(url), query:'Straße & ÖPNV', levels:['region','state'], yearFrom:'2005', yearTo:'2024', mappedOnly:true, record:'region:12/3-A', lat:52.42, lng:9.81, zoom:14, pane:'map', page:2};
  const shared = writeState(url,state);
  assert.equal(shared.pathname,'/atlas/');
  assert.deepEqual(readState(shared),state);
});
test('empty selection and defaults remain distinct through history', () => {
  const url = new URL('https://example.org/');
  const initial = readState(url);
  const empty = writeState(url,{...initial,levels:[]});
  assert.deepEqual(readState(empty).levels,[]);
  assert.deepEqual(readState(url).levels,['city','region','state']);
  assert.equal(writeState(url,initial).search,'');
});
test('invalid coordinates, years and page revert to safe defaults', () => {
  const initial = readState(new URL('https://example.org/'));
  assert.deepEqual(readState(new URL('https://example.org/?lat=666&lng=NaN&z=77&von=NaN&seite=-1')),initial);
});
test('back navigation restores the list and map before opening a related record', () => {
  const original = new URL('https://example.org/fork/');
  const first = writeState(original,{...readState(original),query:'Schule',record:'hannover-sim:0123',zoom:15,pane:'map'});
  const second = writeState(first,{...readState(first),record:'hannover-sim:0123F1',page:3});
  const history = [original,first,second];
  history.pop();
  assert.equal(readState(history.at(-1)).record,'hannover-sim:0123');
  assert.equal(readState(history.at(-1)).zoom,15);
  assert.equal(readState(history.at(-1)).page,1);
  history.pop();
  assert.equal(readState(history.at(-1)).pane,'list');
  assert.equal(readState(history.at(-1)).query,'');
});

test('day ranges, timeline zoom and open panels round-trip without confusing legacy year links', () => {
  const base = new URL('https://example.org/atlas/?von=2005&bis=2024');
  const old = readState(base);
  assert.equal(old.yearFrom, '2005');
  assert.equal(old.yearTo, '2024');
  assert.equal(old.dateFrom, '');
  const state = { ...readState('https://example.org/atlas/'), dateFrom: '2024-02-29', dateTo: '2026-11-13',
    timelineZoom: 'Woche', timelineCenter: '2026-05-16', panels: ['list', 'timeline'] };
  const shared = writeState(base, state);
  assert.equal(shared.searchParams.get('von'), '2024-02-29');
  assert.equal(shared.searchParams.get('bis'), '2026-11-13');
  assert.equal(shared.searchParams.get('zeitzoom'), 'Woche');
  assert.equal(shared.searchParams.get('zeitmitte'), '2026-05-16');
  assert.deepEqual(readState(shared), state);
  assert.equal(writeState(base, { ...state, yearFrom: '1999', yearTo: '2025' }).searchParams.get('von'), '2024-02-29');
});

test('an explicitly empty panel list survives links and defaults stay absent from the URL', () => {
  const base = new URL('https://example.org/atlas/');
  const defaults = readState(base);
  assert.deepEqual(defaults.panels, ['detail']);
  assert.equal(defaults.timelineZoom, 'Jahr');
  const shared = writeState(base, { ...defaults, panels: [] });
  assert.equal(shared.searchParams.has('fenster'), true);
  assert.deepEqual(readState(shared).panels, []);
  assert.equal(writeState(base, defaults).search, '');
});

test('impossible calendar dates and unknown panel or zoom values are ignored', () => {
  const state = readState('https://example.org/?von=2025-02-29&bis=2026-13-01&zeitzoom=Stunde&fenster=chat,list,list,timeline');
  assert.equal(state.dateFrom, '');
  assert.equal(state.dateTo, '');
  assert.equal(state.timelineZoom, 'Jahr');
  assert.deepEqual(state.panels, ['list', 'timeline']);
  assert.equal(readState('https://example.org/?von=2024-02-29').dateFrom, '2024-02-29');
});

test('legacy map-only links stay unobstructed while new map links retain explicitly open detail panels', () => {
  const base = new URL('https://example.org/atlas/');
  assert.deepEqual(readState(new URL('?ansicht=karte', base)).panels, []);
  const newView = { ...readState(base), pane: 'map', panels: ['detail'] };
  const shared = writeState(base, newView);
  assert.equal(shared.searchParams.get('fenster'), 'detail');
  assert.deepEqual(readState(shared), newView);
});

test('legacy selected-record links open their detail even when the old background view was the map', () => {
  for (const query of [
    '?ansicht=karte&vorgang=hannover-sim%3A1047-2026F1',
    '?ansicht=karte&q=1047%2F2026&vorgang=hannover-sim%3A1047-2026F1',
    '?ebenen=state&vorgang=niedersachsen-landtag%3A19-1234'
  ]) {
    assert.deepEqual(readState('https://example.org/atlas/' + query).panels, ['detail'], query);
  }
});

test('legacy search and filter links open results while an empty homepage keeps the introduction', () => {
  for (const query of ['?q=Schule', '?ebenen=region', '?ebenen=', '?von=2005', '?bis=2026-11-15', '?verortet=1', '?seite=2']) {
    assert.deepEqual(readState('https://example.org/atlas/' + query).panels, ['list'], query);
  }
  assert.deepEqual(readState('https://example.org/atlas/').panels, ['detail']);
  assert.deepEqual(readState('https://example.org/atlas/?q=Schule&ansicht=karte').panels, []);
  assert.deepEqual(readState('https://example.org/atlas/?q=&verortet=0&von=ungueltig&seite=1').panels, ['detail']);
});

test('explicit panel selections override every legacy record, map and filter default including empty panels', () => {
  for (const query of ['?q=Schule', '?ansicht=karte', '?ansicht=karte&vorgang=hannover-sim%3A1047-2026F1']) {
    assert.deepEqual(readState('https://example.org/atlas/' + query + '&fenster=').panels, [], query);
    assert.deepEqual(readState('https://example.org/atlas/' + query + '&fenster=timeline,list').panels, ['timeline','list'], query);
  }
});

test('new links round-trip panel choices against the same record and search defaults used for legacy links', () => {
  const base = new URL('https://example.org/atlas/');
  const initial = readState(base);
  const queryIntro = {...initial, query:'Schule', panels:['detail']};
  assert.equal(writeState(base, queryIntro).searchParams.get('fenster'), 'detail');
  const recordOnMap = {...initial, pane:'map', record:'hannover-sim:1047-2026F1', panels:[]};
  assert.equal(writeState(base, recordOnMap).searchParams.get('fenster'), '');
  const views = [queryIntro, recordOnMap,
    {...initial, query:'Schule', panels:['list']},
    {...initial, levels:[], panels:['detail']},
    {...initial, pane:'map', record:'hannover-sim:1047-2026F1', panels:['detail']},
    {...initial, pane:'map', record:'hannover-sim:1047-2026F1', panels:['list','timeline']}];
  for (const view of views) assert.deepEqual(readState(writeState(base,view)), view);
});
