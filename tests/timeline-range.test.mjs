import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchIndex} from '../site/search.js';
import {createHannoverTimeline} from '../site/timeline-adapter.js';

// Renderless DOM boundary: the real timeline still calculates and reports the
// range. Drawing has zero width; source dates and counts are never mocked.
function rootElement() {
  const parts=new Map();
  return {
    classList:{add(){},toggle(){},contains(){return false;}},
    addEventListener(){},setAttribute(){},removeAttribute(){},
    querySelector(selector) { if(!parts.has(selector)) parts.set(selector,rootElement()); return parts.get(selector); },
    querySelectorAll(){return [];},closest(){return rootElement();},replaceChildren(){},
    clientWidth:0,dataset:{},style:{},options:[{value:'vorlage'}],value:'vorlage'
  };
}

for(const [name,filter,expectedDate] of [
  ['a cutoff before the first record',{dateFrom:'',dateTo:'1900-01-01'},'01.01.1900'],
  ['reversed explicit bounds',{dateFrom:'2020-01-01',dateTo:'2005-01-01'},'01.01.2020']
]) test('timeline does not invent matching records for '+name,()=>{
  const priorDocument=globalThis.document, priorObserver=globalThis.ResizeObserver;
  globalThis.document={createElement:rootElement};
  globalThis.ResizeObserver=class{observe(){}};
  try {
    const index=new SearchIndex(['2005-01-01','2010-01-01','2020-01-01'].map((date,i)=>({id:'city:'+i,level:'city',title:'Record',date})));
    const root=rootElement(), timeline=createHannoverTimeline(root);
    const result=index.search(filter);
    assert.equal(result.total,0);
    timeline.update(result,{state:filter,manifest:{provenance:{sourceVerifiedAt:'2026-11-08'}}});
    const summary=root.querySelector('.tl-range').textContent;
    assert.match(summary,/· 0 Vorlagen/);
    assert.ok(summary.includes(expectedDate),'the supplied date was clipped away: '+summary);
  } finally { globalThis.document=priorDocument; globalThis.ResizeObserver=priorObserver; }
});
