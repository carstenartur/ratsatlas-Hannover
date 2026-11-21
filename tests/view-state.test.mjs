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
