import {AtlasData} from './data.js';
import {LEVELS, readState, writeState} from './view-state.js';

const $ = id => document.getElementById(id);
const format = n => Number(n).toLocaleString('de-DE');
const labels = {city:'Stadt',region:'Region',state:'Land'};
const pageSize = 30;
const atlas = new AtlasData();
let state = readState(location.href);
let map, collection, layers, selectedLayer, matched, lastQuery, lastRecord, searchVersion = 0;
let ready = false, restoring = false, timer, pendingQuery = null, lastFocus;
const join = (...values) => values.filter(Boolean).join(' · ');
function node(tag,text,cls) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function button(label,action,cls) {
  const el = node('button',label,cls);
  el.type = 'button'; el.onclick = action;
  return el;
}
function link(label,url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['https:','http:'].includes(parsed.protocol)) return null;
    const a = node('a',label); a.href = parsed.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  } catch { return null; }
}
function append(parent,...children) { parent.append(...children.filter(Boolean)); }
function date(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw || '');
  return m ? m[3]+'.'+m[2]+'.'+m[1] : raw || '';
}
function badge(level) { return node('span',labels[level] || 'Quelle','badge '+level); }
function section(parent,title) {
  const el = node('section'); el.append(node('h3',title)); parent.append(el); return el;
}
function evidence(parent,entry) {
  if (!entry) return;
  if (Array.isArray(entry)) { entry.forEach(item => evidence(parent,item)); return; }
  const text = typeof entry === 'string' ? entry : entry.text;
  if (text) parent.append(node('blockquote',text));
  if (entry.url) append(parent,link('Beleg öffnen',entry.url));
}
function update(patch,replace = false) {
  state = {...state,...patch};
  const url = writeState(location.href,state);
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null,'',url);
  render();
}
function clearPendingQuery() {
  clearTimeout(timer);
  pendingQuery = null;
}
function filter(patch) {
  const query = pendingQuery ?? state.query;
  clearPendingQuery();
  selectedLayer?.remove(); selectedLayer = null;
  update({query,...patch,page:1,record:''});
}
function render() {
  document.body.dataset.pane = state.pane;
  $('list-tab').setAttribute('aria-pressed',state.pane === 'list');
  $('map-tab').setAttribute('aria-pressed',state.pane === 'map');
  if (pendingQuery === null) $('query').value = state.query;
  for (const input of $('levels').querySelectorAll('input')) input.checked = state.levels.includes(input.value);
  $('from').value = state.yearFrom; $('to').value = state.yearTo; $('mapped').checked = state.mappedOnly;
  if (state.yearFrom || state.yearTo || state.mappedOnly) $('filters').open = true;
  $('reset').hidden = !(state.query || state.levels.length !== 3 || state.yearFrom || state.yearTo || state.mappedOnly);
  if (!ready) return;
  const key = JSON.stringify([state.query,state.levels,state.yearFrom,state.yearTo,state.mappedOnly,state.page]);
  if (key !== lastQuery) { lastQuery = key; runSearch(); }
  if (state.record !== lastRecord) { lastRecord = state.record; renderRecord(); }
}
async function runSearch() {
  const version = ++searchVersion;
  map?.closePopup();
  $('hits').textContent = 'Suche läuft …'; $('list').setAttribute('aria-busy','true');
  try {
    const result = await atlas.search({...state,offset:(state.page-1)*pageSize,limit:pageSize});
    if (version !== searchVersion) return;
    const pages = Math.max(1,Math.ceil(result.total/pageSize));
    if (state.page > pages) { update({page:pages},true); return; }
    $('hits').textContent = format(result.total)+' Treffer';
    const buttons = result.items.map(item => {
      const el = button('',() => selectRecord(item.id),'result');
      el.append(badge(item.level),node('span','  '+join(item.type,date(item.date)),'meta'),
        node('span',item.title || item.id,'result-title'),node('span',join(item.number,item.mapped ? 'Verortet' : 'Ohne Kartenort'),'subtle'));
      return el;
    });
    if (!buttons.length) buttons.push(node('p','Keine passenden Vorgänge. Ändere den Suchbegriff oder die Filter.','empty'));
    $('list').replaceChildren(...buttons); $('list').scrollTop = 0;
    document.querySelector('.pagination').hidden = pages < 2;
    $('prev').disabled = state.page === 1; $('next').disabled = state.page >= pages;
    $('page').textContent = 'Seite '+format(state.page)+' von '+format(pages);
    matched = new Set(result.matchedIds); drawFeatures();
  } catch (error) {
    if (version !== searchVersion) return;
    $('hits').textContent = 'Suche nicht verfügbar'; $('list').replaceChildren(node('p',error.message || 'Der Suchindex konnte nicht geladen werden.','empty'),button('Suche erneut laden',runSearch));
    document.querySelector('.pagination').hidden = true; matched = new Set(); drawFeatures();
  } finally { if (version === searchVersion) $('list').removeAttribute('aria-busy'); }
}
function selectRecord(id) {
  if (!$('detail').open) lastFocus = document.activeElement;
  update({record:id});
}
function closeRecord() {
  update({record:''});
  if (lastFocus?.isConnected) lastFocus.focus();
}
function showShare() {
  if (pendingQuery !== null) filter({});
  $('share-url').value = location.href; $('copy-status').textContent = ''; $('share-dialog').showModal(); $('share-url').select();
}
function openMapRecords(feature,latlng) {
  const ids = feature.properties.recordIds.filter(id => matched.has(id));
  const body = node('div',null,'map-popup'), list = node('div'), pager = node('div',null,'popup-pager');
  const pages = Math.ceil(ids.length/10);
  body.append(node('strong',feature.properties.label || 'Kartenort'),node('p',format(ids.length)+' verknüpfte Vorgänge'),list,pager);
  const popup = L.popup().setLatLng(latlng).setContent(body).openOn(map);
  let page = 0;
  async function display(index) {
    page = index;
    const visible = ids.slice(index*10,(index+1)*10);
    list.replaceChildren(node('p','Vorgänge werden geladen …')); pager.replaceChildren();
    if (pages > 1) {
      const back = button('Zurück',() => display(index-1)), next = button('Weiter',() => display(index+1));
      back.disabled = index === 0; next.disabled = index+1 >= pages;
      pager.append(back,node('span',(index+1)+' / '+pages),next);
    }
    try {
      const summaries = await atlas.getSummaries(visible);
      if (index !== page || !popup.isOpen()) return;
      const rows = new Map(summaries.map(r => [r.id,r]));
      const choices = visible.map(id => {
        const r = rows.get(id);
        const el = button('',() => { map.closePopup(); selectRecord(id); });
        el.append(node('strong',r?.title || id),node('span',join(r?.number,date(r?.date)),'subtle'));
        return el;
      });
      list.replaceChildren(...choices);
    } catch (error) {
      if (index !== page || !popup.isOpen()) return;
      list.replaceChildren(node('p',error.message || 'Vorgänge konnten nicht geladen werden.'),button('Erneut laden',() => display(index)));
    }
    popup.update();
  }
  display(0);
}
function drawFeatures() {
  if (!map || !collection || !matched) return;
  map.closePopup();
  if (layers) layers.remove();
  const features = collection.features.filter(f => f.properties.recordIds.some(id => matched.has(id)));
  const paint = f => {
    const regional = f.properties.recordIds.some(id => matched.has(id) && id.startsWith('region-'));
    return {color:regional ? '#24715e' : '#6d28b1',weight:3,opacity:.75,fillOpacity:.36};
  };
  layers = L.geoJSON(features,{style:paint,pointToLayer:(f,ll) => L.circleMarker(ll,{...paint(f),radius:5}),
    onEachFeature(f,layer) {
      layer.on('click',e => openMapRecords(f,e.latlng));
    }}).addTo(map);
  $('map-count').textContent = format(features.length)+' Kartenorte';
  selectedLayer?.bringToFront();
}
function restoreMap() {
  if (!map) return;
  restoring = true;
  map.invalidateSize({pan:false}); map.setView([state.lat,state.lng],state.zoom,{animate:false});
  restoring = false;
}
async function startMap() {
  try {
    map = L.map('map',{preferCanvas:true,minZoom:2,maxZoom:19,worldCopyJump:true}).setView([state.lat,state.lng],state.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(map);
    map.on('moveend',() => {
      if (restoring || !$('map').clientWidth) return;
      const ll = map.getCenter().wrap();
      update({lat:+ll.lat.toFixed(5),lng:+ll.lng.toFixed(5),zoom:map.getZoom()},true);
    });
    new ResizeObserver(() => { if ($('map').clientWidth) restoreMap(); }).observe($('map'));
    await loadMapData();
  } catch (error) { $('map-count').textContent = 'Karte nicht verfügbar: '+error.message; }
}
async function loadMapData() {
  $('map-count').textContent = 'Orte werden geladen …';
  try { collection = await atlas.getMap(); drawFeatures(); }
  catch (error) {
    $('map-count').replaceChildren(node('span',error.message || 'Kartenorte konnten nicht geladen werden.'),
      button('Erneut laden',loadMapData,'text-button'));
  }
}
function renderLocations(parent,data) {
  const area = section(parent,'Ortsbezug');
  if (!data.features.length) area.append(node('p','Für diesen Vorgang ist kein Kartenort belegt.','subtle'));
  if (data.features.length && map) area.append(button('Auf Karte zeigen',() => {
    update({record:'',pane:'map'});
    requestAnimationFrame(() => {
      map.invalidateSize({pan:false});
      selectedLayer?.remove();
      selectedLayer = L.geoJSON(data.features,{interactive:false,style:{color:'#c04c00',weight:5,interactive:false},pointToLayer:(_f,ll) => L.circleMarker(ll,{color:'#c04c00',radius:9,interactive:false})}).addTo(map);
      map.fitBounds(selectedLayer.getBounds(),{padding:[25,25],maxZoom:16,animate:false});
    });
  }));
  const list = node('ul');
  for (const loc of data.locations) {
    const li = node('li'); li.append(node('strong',loc.label || 'Ortsangabe'));
    li.append(node('p',join(loc.mapped ? 'Verortet' : 'Ohne Kartenort',loc.method,
      {title:'Beleg im Titel',document:'Beleg im Dokument'}[loc.evidence?.source]),'subtle'));
    evidence(li,loc.evidence); list.append(li);
  }
  if (list.children.length) area.append(list);
}
async function renderRecord() {
  const id = state.record, dialog = $('detail'), body = $('detail-body');
  if (!id) { if (dialog.open) dialog.close(); return; }
  selectedLayer?.remove(); selectedLayer = null;
  body.replaceChildren(node('h2','Vorgang wird geladen …')); body.firstChild.id = 'detail-title';
  if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0;
  try {
    const data = await atlas.getRecord(id);
    if (state.record !== id) return;
    if (!data?.record) throw Error();
    const r = data.record;
    const title = node('h2',r.title || r.id); title.id = 'detail-title';
    body.replaceChildren(badge(r.sourceContext?.level || r.level),title,node('p',join(r.type,r.number,date(r.date))),
      node('p',join(r.sourceContext?.publisher,r.gremium),'subtle'));
    const source = section(body,'Quelle');
    source.append(node('p',r.id,'subtle'));
    if (r.sourceId && r.sourceId !== r.id) source.append(node('p','Originalkennung: '+r.sourceId,'subtle'));
    append(source,link(r.url === r.originalPdfUrl ? 'Amtliches Original (PDF) ↗' : 'Amtliches Original öffnen ↗',r.url),
      r.originalPdfUrl !== r.url && link('Original-PDF ↗',r.originalPdfUrl),button('Vorgang teilen',showShare,'link'));
    renderLocations(body,data);
    const timeline = section(body,'Beratungsverlauf');
    if (!data.events.length) timeline.append(node('p','Keine Beratungsschritte im übernommenen Bestand.','subtle'));
    const historyList = node('ol');
    for (const event of [...data.events].sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999'))) {
      const item = node('li'); item.append(node('strong',join(date(event.date) || 'Ohne Datum',event.body)));
      if (event.outcome) item.append(node('p',event.outcome));
      evidence(item,event.evidence); append(item,link('Beratungsquelle ↗',event.url)); historyList.append(item);
    }
    timeline.append(historyList);
    const relations = section(body,'Verknüpfte Dokumente'), list = node('ul');
    const related = new Map(data.relatedRecords.map(x => [x.sourceId || x.id,x]));
    const seen = new Set();
    for (const rel of data.relationships) {
      const li = node('li'), target = related.get(rel.targetId), label = rel.label || target?.title || rel.targetId || rel.type;
      if (target) { li.append(button(label,() => selectRecord(target.id),'link')); seen.add(target.id); }
      else li.append(node('strong',label));
      append(li,link('Originalverweis ↗',rel.targetUrl)); evidence(li,rel.evidence); list.append(li);
    }
    for (const r of related.values()) if (!seen.has(r.id) && r.id !== id) {
      const li = node('li'); li.append(button(join(r.number,r.title) || r.id,() => selectRecord(r.id),'link')); list.append(li);
    }
    relations.append(list.children.length ? list : node('p','Keine Verknüpfungen im übernommenen Bestand.','subtle'));
  } catch {
    if (state.record !== id) return;
    const title = node('h2','Vorgang nicht verfügbar'); title.id = 'detail-title';
    body.replaceChildren(title,node('p','Die Kennung wurde nicht gefunden oder die Daten konnten nicht geladen werden.'),button('Erneut laden',renderRecord));
  }
}
function showStatus(manifest,migration) {
  const {recordCount,mappedRecordCount,levelCounts,coverage} = manifest;
  const levels = LEVELS.filter(l => levelCounts[l]);
  $('stats').replaceChildren(node('strong',format(recordCount)+' Vorgänge'),' · '+format(mappedRecordCount)+' verortet · '+levels.length+' Ebenen');
  $('stamp').textContent = 'Quellenstand '+date(manifest.generatedAt);
  const body = $('status-body'); body.replaceChildren(node('p','Die Unfallwerkbank erschließt öffentliche Rats- und Landtagsdaten. Der übernommene Bestand deckt die amtlichen Archive teilweise ab.'),
    node('p','Quellenstand '+date(manifest.generatedAt)+' · Import in den Ratsatlas '+date(migration.importedAt)),
    node('p','Der Import übernimmt den veröffentlichten Datenstand. Die Zeitpunkte der amtlichen Abrufe stehen bei den einzelnen Quellen.','subtle'));
  const totals = section(body,'Bestand nach Ebene');
  for (const l of levels) totals.append(node('p',labels[l]+' · '+format(levelCounts[l].records)+' Vorgänge · '+format(levelCounts[l].mapped)+' verortet'));
  totals.append(node('p',format(recordCount-mappedRecordCount)+' Vorgänge ohne Kartenort sind über die Liste recherchierbar.'));
  const sources = section(body,'Amtliche Quellen');
  for (const s of manifest.sourceStatuses || []) {
    const row = node('details'); row.append(node('summary',s.source+' · '+format(s.recordCount)+' Vorgänge'),
      node('p',join(s.retrievedAt && 'Abgerufen '+date(s.retrievedAt),s.from && 'Zeitraum '+date(s.from)+' bis '+(date(s.to)||'offen')),'subtle'),node('p',s.message));
    append(row,link('Quelle öffnen ↗',s.url)); sources.append(row);
  }
  const gaps = section(body,'Abdeckung und bekannte Lücken');
  gaps.append(node('p','Erfassungszeitraum '+date(coverage.from)+' bis '+date(coverage.to)));
  if (manifest.refreshFailure) gaps.append(node('p',join(date(manifest.refreshFailure.attemptedAt),manifest.refreshFailure.reason)));
  const years = manifest.provenance?.collection?.continuation?.pendingYears;
  if (years?.length) gaps.append(node('p','Offene Jahrgänge: '+years.join(', ')));
  const list = node('ul');
  for (const warning of coverage.warnings || []) list.append(node('li',warning));
  gaps.append(list);
  const rights = manifest.provenance?.rights;
  if (rights) {
    const area = section(body,'Quellenrechte');
    area.append(node('p',rights.license || 'Der Datenbestand weist keine einheitliche Lizenz aus.'));
    for (const credit of rights.attribution || []) area.append(node('p',credit,'subtle'));
  }
}
$('query').oninput = () => {
  clearTimeout(timer);
  pendingQuery = $('query').value;
  timer = setTimeout(() => filter({}),200);
};
$('levels').onchange = () => filter({levels:[...$('levels').querySelectorAll(':checked')].map(el => el.value)});
for (const [id,key] of [['from','yearFrom'],['to','yearTo']]) $(id).onchange = () => {
  if ($(id).reportValidity()) filter({[key]:$(id).value});
};
$('mapped').onchange = () => filter({mappedOnly:$('mapped').checked});
$('reset').onclick = () => { filter({query:'',levels:[...LEVELS],yearFrom:'',yearTo:'',mappedOnly:false}); };
$('list-tab').onclick = () => update({pane:'list'});
$('map-tab').onclick = () => update({pane:'map'});
$('prev').onclick = () => update({page:state.page-1}); $('next').onclick = () => update({page:state.page+1});
$('detail-close').onclick = closeRecord;
$('detail').oncancel = e => { e.preventDefault(); closeRecord(); };
$('status-open').onclick = () => $('status').showModal();
$('status-close').onclick = () => $('status').close(); $('share-close').onclick = () => $('share-dialog').close();
$('share').onclick = showShare;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('share-url').value); $('copy-status').textContent = 'Link kopiert.'; }
  catch { $('share-url').select(); $('copy-status').textContent = 'Der Link ist zum Kopieren markiert.'; }
};
window.addEventListener('popstate',() => {
  clearPendingQuery(); selectedLayer?.remove(); selectedLayer = null;
  state = readState(location.href); render(); restoreMap();
});
render();
try {
  const {manifest,migration} = await atlas.init();
  showStatus(manifest,migration); ready = true; startMap(); render();
} catch {
  $('stats').textContent = 'Der Datenbestand konnte nicht geladen werden.';
  $('status-body').textContent = 'Quelleninformationen sind momentan nicht verfügbar.';
  $('hits').textContent = 'Daten nicht verfügbar'; $('list').append(button('Seite neu laden',() => location.reload()));
  $('map-count').textContent = 'Karte nicht verfügbar';
}
