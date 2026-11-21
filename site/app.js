/* Hannover application adapter for the Ratsatlas Bonn UI.
 * Bonn navigation/panels, list/detail markup and process-line presentation:
 * daimpad/ratsatlas-bonn@f8850008e81825ae79be49ca7f3441b928a1858b (MIT).
 * The verified AtlasData store, qualified identifiers and original geometries
 * remain the data authority. No Bonn-only datasets or legal rules are used. */
import {AtlasData} from './data.js?v=kartenorte-20261121-2';
import {LEVELS, readState, writeState} from './view-state.js?v=kartenorte-20261121-2';
import {createBonnPanels} from './bonn-panels.js?v=kartenorte-20261121-2';
import {createHannoverTimeline} from './timeline-adapter.js?v=kartenorte-20261121-2';
import {createMapGeography,overviewPoint,combineCoincidentFeatures} from './map-geography.js?v=kartenorte-20261121-2';

const $ = id => document.getElementById(id);
const format = n => Number(n).toLocaleString('de-DE');
const labels = {city:'Stadt', region:'Region', state:'Land'};
const pageSize = 50;
const selectionPane = 'record-selection';
const atlas = new AtlasData({enrichmentUrl:new URL('./data/enriched/enrichment.json',import.meta.url)});
const initialUrl = new URL(location.href);
let state = readState(initialUrl);
let focusRecordId = ['lat','lng','z'].some(key => initialUrl.searchParams.has(key)) ? '' : state.record;
let initialMapFit = !state.record && !['lat','lng','z'].some(key => initialUrl.searchParams.has(key));
let manifest, migration, map, collection, layers, selectedLayer, selectedData, matched;
let geography, geographyData, geographyReady = false, geographyLoading = true;
let lastQuery, lastRecord, lastMapDraw, searchVersion = 0, detailVersion = 0;
let ready = false, restoringMap = false, timer, pendingQuery = null;
const join = (...values) => values.filter(Boolean).join(' · ');
const date = raw => {
  const value = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw || '');
  return value ? `${value[3]}.${value[2]}.${value[1]}` : raw || '';
};
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(label, action, className = 'btn btn-secondary') {
  const el = node('button', label, className);
  el.type = 'button'; el.addEventListener('click',action); return el;
}
function link(label, url, className) {
  if (!url) return null;
  try {
    const target = new URL(url);
    if (!['https:', 'http:'].includes(target.protocol)) return null;
    const el = node('a',label,className);
    el.href = target.href; el.target = '_blank'; el.rel = 'noopener noreferrer'; return el;
  } catch { return null; }
}
function append(parent, ...children) { parent.append(...children.filter(Boolean)); }
function badge(level) { return node('span',labels[level] || 'Quelle','source-badge ' + level); }
function section(parent, title) {
  const el = node('section'); el.append(node('h4',title)); parent.append(el); return el;
}
function evidence(parent, value) {
  if (!value) return;
  if (Array.isArray(value)) { value.forEach(item => evidence(parent,item)); return; }
  const text = typeof value === 'string' ? value : value.text;
  if (text) parent.append(node('blockquote',text));
  if (value.url) append(parent,link('Beleg öffnen ↗',value.url));
}
function syncHistory(replace = false) {
  const url = writeState(location.href,state);
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null,'',url);
}
const panels = createBonnPanels({
  onChange(open, {reason}) { update({panels:open, pane:open.includes('list') ? 'list' : open.length ? state.pane : 'map'}, reason === 'layout'); }
});
const timeline = createHannoverTimeline($('timeline-wrap'), {
  onRange(from,to) { filter({dateFrom:from, dateTo:to, yearFrom:'', yearTo:''}); },
  onReset() { resetDates(); },
  onStateChange(view) { update(view,true); }
});
const timelineClose = button('×',() => panels.closePanel('timeline-wrap'),'icon-btn timeline-close');
timelineClose.setAttribute('aria-label','Zeitleiste einklappen');
$('timeline-wrap').append(timelineClose);
const timelineRetry = button('Zeitleiste erneut laden',() => ready ? runSearch() : location.reload(),'btn btn-secondary timeline-retry');
timelineRetry.hidden = true;
$('timeline-wrap').append(timelineRetry);

function update(patch, replace = false) {
  state = {...state,...patch};
  state.panels = panels.setState(state.panels);
  syncHistory(replace);
  render();
}
function clearPendingQuery() { clearTimeout(timer); pendingQuery = null; }
function filter(patch = {}) {
  const query = pendingQuery ?? state.query;
  clearPendingQuery();
  focusRecordId = '';
  selectedLayer?.remove(); selectedLayer = null;
  update({query,...patch,page:1,record:''});
}
function resetDates() {
  timeline.reset();
  filter({dateFrom:'', dateTo:'', yearFrom:'', yearTo:''});
}
function render() {
  state.panels = panels.setState(state.panels);
  if (pendingQuery === null) $('q').value = state.query;
  for (const input of $('levels').querySelectorAll('input')) input.checked = state.levels.includes(input.value);
  $('from').value = state.dateFrom || (state.yearFrom ? `${state.yearFrom}-01-01` : '');
  $('to').value = state.dateTo || (state.yearTo ? `${state.yearTo}-12-31` : '');
  $('mapped').checked = state.mappedOnly;
  const hasDates = !!(state.dateFrom || state.dateTo || state.yearFrom || state.yearTo);
  $('reset-dates').hidden = !hasDates;
  if (hasDates || state.mappedOnly) $('more-filters').open = true;
  $('active-filters').textContent = hasDates || state.mappedOnly ? 'aktiv' : '';
  $('reset').hidden = !(state.query || state.area || state.levels.length !== LEVELS.length || hasDates || state.mappedOnly);
  const area = geography?.getArea(state.area);
  $('area-note').hidden = !state.area;
  $('area-note').textContent = area ? `${area.properties.name}: Vorgänge mit belegtem Kartenort in diesem Gebiet. Mehrere Gebiete können denselben Vorgang enthalten.` : 'Die Gebietszuordnung wird geladen.';
  timeline.setState(state);
  if (!ready) return;
  const key = JSON.stringify([state.query,state.area,state.levels,state.yearFrom,state.yearTo,state.dateFrom,state.dateTo,state.mappedOnly,state.page]);
  if (key !== lastQuery) { lastQuery = key; runSearch(); }
  if (state.record !== lastRecord) { lastRecord = state.record; renderRecord(); }
  drawFeatures();
}
async function runSearch() {
  const version = ++searchVersion;
  timeline.setStatus('Zeitleiste wird aktualisiert …',true); timelineRetry.hidden = true;
  map?.closePopup();
  $('count').textContent = 'Suche läuft …'; $('papers').setAttribute('aria-busy','true');
  try {
    if (state.area && !geographyReady) {
      if (!geographyLoading) throw new Error('Die Gebietszuordnung ist nicht verfügbar. Wähle „Ganz Hannover“ oder lade die Gebiete erneut.');
      $('count').textContent = 'Gebiet wird geladen …';
      return;
    }
    const area = geography?.getArea(state.area);
    const result = await atlas.search({...state,recordIds:state.area ? area?.properties.recordIds || [] : undefined,offset:(state.page - 1) * pageSize,limit:pageSize});
    if (version !== searchVersion) return;
    const pages = Math.max(1,Math.ceil(result.total / pageSize));
    if (state.page > pages) { update({page:pages},true); return; }
    $('count').textContent = format(result.total) + ' Treffer';
    const items = result.items.map(record => {
      const row = node('li');
      const el = button('',() => selectRecord(record.id),'');
      el.dataset.record = record.id; el.setAttribute('aria-current',String(state.record === record.id));
      const meta = node('span',null,'meta');
      meta.append(badge(record.level),node('span',record.number || record.id,'record-number'),node('span',date(record.date) || 'Ohne Datum'),node('span',record.type));
      el.append(node('span',record.title || record.id,'title'),meta,node('span',record.mapped ? 'Mit Kartenort' : 'Ohne Kartenort','meta'));
      row.append(el); return row;
    });
    if (!items.length) {
      const row = node('li',null,'empty-list');
      row.append(node('p','Keine passenden Vorgänge. Ändere den Suchbegriff, die Quellen oder den Zeitraum.'),button('Filter zurücksetzen',resetFilters,'btn btn-secondary'));
      items.push(row);
    }
    $('papers').replaceChildren(...items);
    document.querySelector('.pagination').hidden = pages < 2;
    $('prev').disabled = state.page === 1; $('next').disabled = state.page >= pages;
    $('page').textContent = `Seite ${format(state.page)} von ${format(pages)}`;
    matched = new Set(result.matchedIds);
    timeline.update(result,{state,manifest});
    timeline.select(selectedData?.record?.id === state.record ? selectedData : null);
    drawFeatures();
  } catch (error) {
    if (version !== searchVersion) return;
    timeline.setStatus('Zeitleiste nicht verfügbar. ' + (error.message || 'Der Suchindex konnte nicht geladen werden.'),false);
    timelineRetry.hidden = false;
    $('count').textContent = 'Suche nicht verfügbar';
    const row = node('li',null,'empty-list');
    row.append(node('p',error.message || 'Der Suchindex konnte nicht geladen werden.','error-message'),button('Suche erneut laden',runSearch));
    $('papers').replaceChildren(row); document.querySelector('.pagination').hidden = true;
    matched = new Set(); drawFeatures();
  } finally { if (version === searchVersion) $('papers').removeAttribute('aria-busy'); }
}
function resetFilters() {
  timeline.reset();
  filter({query:'',area:'',levels:[...LEVELS],yearFrom:'',yearTo:'',dateFrom:'',dateTo:'',mappedOnly:false});
}
function selectRecord(id, {fromMap = false} = {}) {
  if (pendingQuery !== null) filter();
  focusRecordId = fromMap ? '' : id;
  panels.setPanel('detail',true,{notify:false});
  update({record:id,panels:panels.getState()});
  fitRequestedRecord();
  panels.focusPanel('panel-detail');
}
function goHome() {
  clearPendingQuery();
  focusRecordId = '';
  panels.setPanel('detail',true,{notify:false});
  update({record:'',panels:panels.getState()});
  if (!state.record) showIntro();
  panels.focusPanel('panel-detail');
}
function showMap() {
  if (pendingQuery !== null) filter();
  panels.closeAll({notify:false});
  update({panels:[],pane:'map'});
  $('map').focus({preventScroll:true});
}
function showShare() {
  if (pendingQuery !== null) filter();
  panels.setNav(false);
  syncHistory(true);
  $('share-url').value = location.href; $('copy-status').textContent = '';
  if (!$('share-dialog').open) $('share-dialog').showModal();
  $('share-url').focus(); $('share-url').select();
}
function showStatusDialog() { panels.setNav(false); if (!$('status').open) $('status').showModal(); }
function showIntro() {
  $('detail-heading').textContent = 'Los geht’s';
  const body = $('detail');
  body.replaceChildren(node('p','Stadt · Region · Land','intro-kicker'),node('p','Was wird in Hannover beraten – und wo betrifft es dich?','intro-lead'));
  body.append(node('p','Wähle einen Stadtbezirk und dann einen Stadtteil auf der Karte – oder suche direkt nach einem Vorgang. Recherchiere Quellen, Beratungen und die belegten Orte.'));
  const stats = node('div',null,'intro-summary');
  if (manifest) {
    stats.append(node('strong',format(manifest.recordCount) + ' Vorgänge'));
    stats.append(node('p',`${format(manifest.mappedRecordCount)} mit Kartenort · ${format(manifest.recordCount - manifest.mappedRecordCount)} ohne Kartenort`));
    stats.append(node('p','Auch Vorgänge ohne Kartenort bleiben in der Liste und der Suche enthalten.'));
  } else stats.append(node('p','Der Datenbestand wird geladen …'));
  body.append(stats);
  const actions = node('div',null,'intro-actions');
  actions.append(button('Vorgänge durchsuchen',() => { panels.setPanel('list',true,{focus:true}); },'btn btn-primary'),button('Zeitleiste ansehen',() => panels.setPanel('timeline',true,{focus:true}),'btn btn-secondary'),button('Karte erkunden',showMap,'btn btn-soft'));
  body.append(actions);
  const help = node('ul',null,'intro-help');
  help.append(node('li','Suche nach einer Drucksache, Straße, Hausnummer oder mehreren Begriffen.'),node('li','Wähle Stadt, Region und Land getrennt in der Liste.'),node('li','Grenze den Zeitraum in der Zeitleiste ein. Ein Klick auf einen Vorgang zeigt Quellen, Ortsbelege und verknüpfte Dokumente.'));
  body.append(help,node('p','Der übernommene Bestand deckt die amtlichen Archive teilweise ab. Datenstände und bekannte Lücken stehen unter „Quellen“.','hint'),button('Datenstand und Quellen',showStatusDialog,'link-btn'));
}

function openMapRecords(feature,latlng) {
  const ids = feature.properties.recordIds.filter(id => matched?.has(id));
  if (!ids.length) return;
  const body = node('div',null,'map-popup'), list = node('div'), pager = node('div',null,'popup-pager');
  const pages = Math.ceil(ids.length / 10);
  body.append(node('strong',feature.properties.label || 'Kartenort'),node('p',format(ids.length) + ' verknüpfte Vorgänge'),list,pager);
  const popup = L.popup().setLatLng(latlng).setContent(body).openOn(map);
  let page = 0;
  async function display(index) {
    page = index;
    const visible = ids.slice(index * 10,(index + 1) * 10);
    list.replaceChildren(node('p','Vorgänge werden geladen …')); pager.replaceChildren();
    if (pages > 1) {
      const back = button('Zurück',() => display(index - 1),''), next = button('Weiter',() => display(index + 1),'');
      back.disabled = index === 0; next.disabled = index + 1 >= pages;
      pager.append(back,node('span',`${index + 1} / ${pages}`),next);
    }
    try {
      const records = await atlas.getSummaries(visible);
      if (index !== page || !popup.isOpen()) return;
      const byId = new Map(records.map(record => [record.id,record]));
      list.replaceChildren(...visible.map(id => {
        const record = byId.get(id);
        const el = button('',() => { map.closePopup(); selectRecord(id,{fromMap:true}); },'');
        el.dataset.record = id;
        el.append(node('strong',record?.title || id),node('span',join(record?.number,date(record?.date)))); return el;
      }));
    } catch (error) {
      if (index !== page || !popup.isOpen()) return;
      list.replaceChildren(node('p',error.message || 'Vorgänge konnten nicht geladen werden.'),button('Erneut laden',() => display(index),''));
    }
    popup.update();
  }
  display(0);
}
function drawFeatures() {
  if (!map) return;
  geography?.update({areaId:state.area,matchedIds:matched,zoom:map.getZoom(),focusRecord:!!selectedData?.features.length});
  if (!collection || !matched) return;
  const area = geography?.getArea(state.area);
  const places = geographyReady ? geography.mode === 'places' : (!geographyLoading && map.getZoom() >= 14 || !!selectedData?.features.length);
  // A street's overview point can lie outside a small selected neighborhood.
  // There the original path keeps its actually intersecting portion visible.
  const detail = map.getZoom() >= 15 || area?.properties.kind === 'stadtteil';
  // Panning, including a popup's automatic pan, must preserve the open popup
  // and its layers. Rebuild only when their data or representation changes.
  if (lastMapDraw?.collection === collection && lastMapDraw.matched === matched && lastMapDraw.area === state.area && lastMapDraw.places === places && lastMapDraw.detail === detail) return;
  lastMapDraw = {collection,matched,area:state.area,places,detail};
  map.closePopup(); layers?.remove(); layers = null;
  const allowedGeometries = area ? new Set(area.properties.geometryIds) : null;
  const features = collection.features.filter(feature => (!allowedGeometries || allowedGeometries.has(feature.properties.geometryId)) && feature.properties.recordIds.some(id => matched.has(id)));
  $('map-count').textContent = format(features.length) + ' Kartenorte';
  if (!places) return;
  const paint = feature => {
    const region = feature.properties.recordIds.some(id => matched.has(id) && id.startsWith('region-hannover-ris:'));
    return {color:region ? '#24715e' : '#6d28d9',weight:3,opacity:.8,fillOpacity:.27};
  };
  const display = detail ? features : features.map(feature => ({...feature,geometry:{type:'Point',coordinates:overviewPoint(feature.geometry)}})).filter(feature => feature.geometry.coordinates);
  layers = L.geoJSON(combineCoincidentFeatures(display),{
    style:paint,
    pointToLayer:(feature,ll) => L.circleMarker(ll,{color:'#fff',weight:1.5,opacity:1,fillColor:paint(feature).color,fillOpacity:.85,radius:5}),
    onEachFeature(feature,layer) { layer.on('click',event => openMapRecords(feature,event.latlng)); }
  }).addTo(map);
}
function highlightRecord(data) {
  selectedLayer?.remove(); selectedLayer = null;
  if (!map || !data?.features?.length) return;
  const stroke = (color,weight,fillOpacity) => L.geoJSON(data.features,{
    pane:selectionPane,
    interactive:false,
    style:{color,weight,fillOpacity},
    pointToLayer:(_feature,ll) => L.circleMarker(ll,{pane:selectionPane,interactive:false,radius:10,fill:false})
  });
  selectedLayer = L.featureGroup([stroke('#21152e',9,0),stroke('#ffb000',5,.14)]).addTo(map);
}
function mapPadding() {
  if (!map) return {};
  const mobile = panels.isMobile();
  const list = $('panel-list'), detail = $('panel-detail'), time = $('timeline-wrap');
  const left = mobile || list.hidden ? 0 : list.offsetWidth + 16;
  const right = mobile || detail.hidden ? 0 : detail.offsetWidth + 16;
  const {x:width,y:height} = map.getSize();
  if (width <= left + right || height < 2) return {};
  const gutter = Math.min(left || right ? 16 : 30,(width - left - right) / 4);
  const bottom = Math.min(mobile ? 150 : 70,height / 3);
  const top = Math.min(mobile || time.hidden ? 90 : 102 + time.offsetHeight,height - bottom - 1);
  return {paddingTopLeft:[left + gutter,top],paddingBottomRight:[right + gutter,bottom]};
}
function fitSelectedGeometry() {
  if (!map || !selectedLayer) return;
  const bounds = selectedLayer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds,{...mapPadding(),maxZoom:16,animate:false});
}
function fitRequestedRecord() {
  if (!map || !focusRecordId || selectedData?.record.id !== focusRecordId) return;
  focusRecordId = '';
  fitSelectedGeometry();
}
function focusRecordMap() {
  showMap();
  fitSelectedGeometry();
}
function restoreMap() {
  if (!map) return;
  restoringMap = true;
  map.invalidateSize({pan:false}); map.setView([state.lat,state.lng],state.zoom,{animate:false});
  restoringMap = false;
  drawFeatures();
}
function chooseArea(areaId, {bounds} = {}) {
  initialMapFit = false;
  panels.setNav(false);
  filter({area:areaId});
  if (bounds?.isValid()) map.fitBounds(bounds,{...mapPadding(),maxZoom:areaId ? 16 : 12,animate:false});
  drawFeatures();
}
async function loadGeography() {
  geographyLoading = true;
  try {
    geographyData = await atlas.getGeography();
    geography.setData(geographyData); geographyReady = true;
    $('geography-status').hidden = true;
    if (state.area && !geography.getArea(state.area)) {
      state.area = ''; syncHistory(true);
      $('announce').textContent = 'Dieses Gebiet ist nicht vorhanden. Es werden alle Vorgänge angezeigt.';
    }
    if (initialMapFit) {
      initialMapFit = false;
      const bounds = geography.getBounds(state.area);
      if (bounds?.isValid()) map.fitBounds(bounds,{...mapPadding(),maxZoom:state.area ? 16 : 12,animate:false});
    }
    renderStatus();
  } catch (error) {
    geographyReady = false;
    $('geography-status').hidden = false;
    $('geography-status').replaceChildren(node('span','Gebietsübersicht nicht verfügbar. '),button('Gebiete erneut laden',loadGeography,'link-btn'),button('Gesamtsuche',() => chooseArea(''),'link-btn'));
    $('geography-status').title = error.message;
  } finally {
    geographyLoading = false; lastQuery = null; render(); drawFeatures();
  }
}
async function startMap() {
  try {
    if (!map) {
      map = L.map('map',{preferCanvas:true,zoomAnimation:false,minZoom:2,maxZoom:19,worldCopyJump:true,zoomControl:false}).setView([state.lat,state.lng],state.zoom);
      const pane = map.createPane(selectionPane);
      pane.style.zIndex = '410';
      pane.style.pointerEvents = 'none';
      geography = createMapGeography({L,map,select:$('f-area'),onSelect:chooseArea,getPadding:mapPadding});
      L.control.zoom({position:'topright'}).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19
      }).addTo(map);
      map.on('moveend',() => {
        if (restoringMap || !$('map').clientWidth) return;
        initialMapFit = false;
        const center = map.getCenter().wrap();
        update({lat:+center.lat.toFixed(5),lng:+center.lng.toFixed(5),zoom:map.getZoom()},true);
        drawFeatures();
      });
      new ResizeObserver(() => { if ($('map').clientWidth) restoreMap(); }).observe($('map'));
    }
    await Promise.all([loadMapData(),loadGeography()]);
    if (!selectedLayer && selectedData?.record.id === state.record) {
      highlightRecord(selectedData);
      fitRequestedRecord();
    }
  } catch (error) {
    $('map-count').replaceChildren(node('span','Karte nicht verfügbar. '),button('Erneut laden',startMap,'link-btn'));
    $('map-count').title = error.message;
  }
}
async function loadMapData() {
  $('map-count').textContent = 'Orte werden geladen …';
  try { collection = await atlas.getMap(); drawFeatures(); }
  catch (error) {
    $('map-count').replaceChildren(node('span','Kartendaten nicht verfügbar. '),button('Erneut laden',loadMapData,'link-btn'));
    $('map-count').title = error.message;
  }
}
function renderLocations(parent,data) {
  const area = section(parent,'Ortsbezug');
  if (!data.features.length) area.append(node('p','Für diesen Vorgang ist kein Kartenort im übernommenen Bestand enthalten.','section-note'));
  const list = node('ul',null,'locs');
  for (const location of data.locations) {
    const item = node('li');
    const status = location.mapped ? 'Mit Kartenort' : data.features.length ? 'Im Quellpaket ohne Kartenort' : 'Ohne Kartenort';
    item.append(node('strong',location.label || 'Ortsangabe'),node('p',join(status,location.method,{title:'Beleg im Titel',document:'Beleg im Dokument'}[location.evidence?.source]),'evidence-note'));
    evidence(item,location.evidence); list.append(item);
    if (location.supplemental) {
      item.append(node('p',join('Im Ratsatlas ergänzt',location.accuracy),'evidence-note'));
      append(item,link('Quelle der Verortung ↗',location.sourceUrl));
      if (location.attribution) item.append(node('p',location.attribution,'evidence-note'));
    }
  }
  if (list.children.length) area.append(list);
  if (data.features.length) {
    const details = node('details',null,'acc'); details.append(node('summary','Geometrien und Herkunft'));
    const entries = node('ul');
    for (const feature of data.features) entries.append(node('li',join(feature.properties.label,feature.geometry.type,feature.properties.accuracy === 'derived' ? 'Geometrie abgeleitet' : feature.properties.accuracy)));
    details.append(entries); area.append(details);
  }
}
function renderEvents(parent,data) {
  const area = section(parent,'Beratungsverlauf');
  const steps = node('ol',null,'steps');
  function step(title,when,outcome,source,evidenceValue) {
    const item = node('li',null,'step'); item.dataset.status = 'belegt';
    const mark = node('span',null,'mark mark-belegt'); mark.setAttribute('aria-hidden','true');
    const heading = node('div',title,'step-head'); heading.append(node('span','Quelldaten','step-status'));
    const body = node('div',null,'step-body');
    if (when) body.append(node('p',date(when)));
    if (outcome) body.append(node('p',outcome));
    evidence(body,evidenceValue); append(body,link('Beratungsquelle ↗',source));
    if (when) body.append(button('In der Zeitleiste zeigen',() => {
      panels.setPanel('timeline',true,{focus:true}); timeline.center(when);
      const view = timeline.getState(); update({timelineZoom:view.timelineZoom,timelineCenter:view.timelineCenter},true);
    },'jump'));
    item.append(mark,heading,body); steps.append(item);
  }
  if (data.record.date) step('Datum des Vorgangs',data.record.date,null,null,null);
  for (const event of [...data.events].sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999'))) step(event.body || 'Überlieferter Beratungsschritt',event.date,event.outcome,event.url,event.evidence);
  if (!data.events.length) area.append(node('p','Keine Beratungsschritte im übernommenen Bestand.','section-note'));
  if (steps.children.length) area.append(steps);
}
function renderRelations(parent,data) {
  const area = section(parent,'Verknüpfte Dokumente'), list = node('ul',null,'related');
  const related = new Map();
  for (const record of data.relatedRecords) { related.set(record.id,record); if (record.sourceId) related.set(record.sourceId,record); }
  const seen = new Set();
  const relatedButton = (label,record) => {
    const el = button(label,() => selectRecord(record.id),'link-btn'); el.dataset.related = record.id; return el;
  };
  for (const relation of data.relationships) {
    const item = node('li'), target = related.get(relation.targetId);
    const label = target ? join(target.number,target.title) : relation.label || relation.targetId || relation.type;
    if (target) { item.append(relatedButton(label,target)); seen.add(target.id); }
    else item.append(node('strong',label));
    append(item,link('Originalverweis ↗',relation.targetUrl)); evidence(item,relation.evidence); list.append(item);
  }
  for (const record of data.relatedRecords) if (!seen.has(record.id) && record.id !== state.record) {
    const item = node('li'); item.append(relatedButton(join(record.number,record.title) || record.id,record)); list.append(item); seen.add(record.id);
  }
  area.append(list.children.length ? list : node('p','Keine Verknüpfungen im übernommenen Bestand.','section-note'));
}
async function renderRecord() {
  const id = state.record, version = ++detailVersion, body = $('detail');
  body.removeAttribute('aria-busy');
  selectedData = null; highlightRecord(null); timeline.select(null);
  document.querySelectorAll('#papers button[data-record]').forEach(el => el.setAttribute('aria-current',String(el.dataset.record === id)));
  if (!id) { document.title = 'Ratsatlas Hannover – Vorgänge auf Karte und Zeitleiste'; showIntro(); return; }
  $('detail-heading').textContent = 'Vorgang';
  body.replaceChildren(node('h3','Vorgang wird geladen …')); body.setAttribute('aria-busy','true'); body.scrollTop = 0;
  try {
    const data = await atlas.getRecord(id);
    if (state.record !== id || version !== detailVersion) return;
    if (!data?.record) throw new Error('Der Vorgang wurde nicht gefunden.');
    selectedData = data;
    const record = data.record, title = node('h3',record.title || record.id); title.tabIndex = -1; title.id = 'detail-title';
    body.replaceChildren(badge(record.level),title);
    if (data.features.length) body.append(button('Auf Karte zeigen',focusRecordMap,'btn btn-secondary'));
    const facts = node('dl',null,'facts');
    for (const [label,value] of [['Drucksache',record.number],['Art',record.type],['Datum',date(record.date) || 'Ohne Datum'],['Herausgeber',record.sourceContext?.publisher],['Gremium',record.gremium]]) {
      if (value) facts.append(node('dt',label),node('dd',value));
    }
    if (record.level === 'state' && record.sourceId) facts.append(node('dt','Originalkennung'),node('dd',record.sourceId));
    body.append(facts);
    const source = section(body,'Quelle');
    const links = node('div',null,'links');
    append(links,link(record.url === record.originalPdfUrl ? 'Amtliches Original (PDF) ↗' : 'Amtliches Original öffnen ↗',record.url,'btn btn-primary'),record.originalPdfUrl !== record.url && link('Original-PDF ↗',record.originalPdfUrl,'btn btn-secondary'),button('Vorgang teilen',showShare,'btn btn-soft'));
    source.append(links);
    const sourceDetails = node('details',null,'acc source-details'); sourceDetails.append(node('summary','Kennung und Herkunft'));
    const sourceBody = node('div'); sourceBody.append(node('p',record.id,'source-identity'));
    if (record.sourceId && record.sourceId !== record.id) sourceBody.append(node('p','Originalkennung: ' + record.sourceId,'source-identity'));
    const sourceStatus = manifest.sourceStatuses?.find(item => item.source === record.source);
    if (sourceStatus?.retrievedAt) sourceBody.append(node('p','Amtliche Quelle abgerufen: ' + date(sourceStatus.retrievedAt),'hint'));
    sourceDetails.append(sourceBody); source.append(sourceDetails);
    renderEvents(body,data); renderLocations(body,data); renderRelations(body,data);
    const back = node('p',null,'back-home'); back.append(button('← Zurück zu „Los geht’s“',goHome,'link-btn')); body.append(back);
    timeline.select(data); highlightRecord(data); fitRequestedRecord(); drawFeatures();
    document.title = `${record.number || record.title} – Ratsatlas Hannover`;
    $('announce').textContent = `Vorgang ${record.number || ''} geöffnet: ${record.title || record.id}`;
    if (!$('panel-detail').hidden && document.activeElement === $('detail-heading')) title.focus({preventScroll:true});
  } catch (error) {
    if (state.record !== id || version !== detailVersion) return;
    body.replaceChildren(node('h3','Vorgang nicht verfügbar'),node('p',error.message || 'Die Daten konnten nicht geladen werden.','error-message'),button('Erneut laden',renderRecord));
  } finally { if (state.record === id && version === detailVersion) body.removeAttribute('aria-busy'); }
}
function renderStatus() {
  const {recordCount,mappedRecordCount,levelCounts,coverage} = manifest;
  const body = $('status-body');
  body.replaceChildren(node('p','Die Unfallwerkbank erschließt öffentliche Rats- und Landtagsdaten. Der übernommene Bestand deckt die amtlichen Archive teilweise ab.'));
  const verified = manifest.provenance?.sourceVerifiedAt;
  append(body,verified && node('p','Quellenprüfstand: ' + date(verified)),node('p','Bestand erzeugt: ' + date(manifest.provenance?.builtAt || manifest.generatedAt) + ' · Import in den Ratsatlas: ' + date(migration.importedAt),'hint'));
  const totals = node('section'); totals.append(node('h3','Bestand nach Ebene')); body.append(totals);
  for (const level of LEVELS) if (levelCounts[level]) totals.append(node('p',`${labels[level]} · ${format(levelCounts[level].records)} Vorgänge · ${format(levelCounts[level].mapped)} mit Kartenort`));
  totals.append(node('p',`${format(recordCount - mappedRecordCount)} Vorgänge ohne Kartenort sind über die Liste recherchierbar.`));
  if (manifest.enrichment) {
    const additions = section(body,'Ergänzte Kartenorte');
    const {originalMappedRecordCount,addedRecordCount} = manifest.enrichment.totals;
    additions.append(node('p',`${format(originalMappedRecordCount)} Vorgänge hatten bereits einen Kartenort im Quellpaket. ${format(addedRecordCount)} weitere Vorgänge wurden anhand belegter Projektstandorte, amtlicher Hauskoordinaten oder Straßenachsen verortet.`));
    additions.append(node('p','Genauigkeit und Beleg stehen am jeweiligen Ortsbezug. Eine Straßenachse zeigt den Straßenverlauf, ein Projektpunkt den belegten Standort; daraus wird keine Grundstücksgrenze abgeleitet. Die Originaldaten bleiben erhalten.'));
    for (const source of manifest.enrichment.sources) {
      const credit = node('p'); append(credit,link(source.label,source.url));
      if (source.licenseUrl) append(credit,node('span',' · '),link('Lizenz',source.licenseUrl));
      additions.append(credit);
    }
  }
  if (geographyData) {
    const areas = section(body,'Stadtbezirke und Stadtteile');
    areas.append(node('p','Die Gebietsfilter verwenden die amtlichen Grenzen. Gezählt werden passende Vorgänge mit mindestens einem Kartenort im Gebiet. Ein Vorgang kann mehrere Gebiete berühren; die Gebietszahlen sind deshalb nicht additiv.'));
    for (const source of geographyData.sources || []) {
      areas.append(node('p',source.attribution));
      append(areas,link(source.dataset || 'Amtliche Gebietsgrenzen',source.url),link('Lizenz',source.licenseUrl));
    }
  }
  const sources = node('section'); sources.append(node('h3','Amtliche Quellen')); body.append(sources);
  for (const source of manifest.sourceStatuses || []) {
    const details = node('details'); details.append(node('summary',source.source + ' · ' + format(source.recordCount) + ' Vorgänge'),node('p',join(source.retrievedAt && 'Abgerufen ' + date(source.retrievedAt),source.from && 'Zeitraum ' + date(source.from) + ' bis ' + (date(source.to) || 'offen')),'hint'),node('p',source.message));
    append(details,link('Quelle öffnen ↗',source.url)); sources.append(details);
  }
  const gaps = node('section'); gaps.append(node('h3','Abdeckung und bekannte Lücken')); body.append(gaps);
  gaps.append(node('p','Erfassungszeitraum ' + date(coverage.from) + ' bis ' + date(coverage.to)));
  if (manifest.refreshFailure) gaps.append(node('p',join(date(manifest.refreshFailure.attemptedAt),manifest.refreshFailure.reason)));
  const years = manifest.provenance?.collection?.continuation?.pendingYears;
  if (years?.length) gaps.append(node('p','Offene Jahrgänge: ' + years.join(', ')));
  const warnings = node('ul',null,'coverage-list'); for (const warning of coverage.warnings || []) warnings.append(node('li',warning)); gaps.append(warnings);
  const rights = manifest.provenance?.rights;
  if (rights) {
    const area = node('section'); area.append(node('h3','Quellenrechte'),node('p',rights.license || 'Der Datenbestand weist keine einheitliche Lizenz aus.'));
    for (const credit of rights.attribution || []) area.append(node('p',credit,'hint')); body.append(area);
  }
  const footer = node('p',null,'source-footer-links');
  append(footer,link('Ratsatlas Bonn · Damian Paderta','https://bonn.ratsatlas.de/'),link('Hannover-Daten in der Unfallwerkbank','https://carstenartur.github.io/Unfallatlas/'),link('Quellcode und Lizenz','https://github.com/carstenartur/ratsatlas-Hannover'));
  body.append(footer);
}

$('q').addEventListener('focus',() => { if ($('panel-list').hidden) panels.setPanel('list',true); });
$('q').addEventListener('input',() => {
  clearTimeout(timer); pendingQuery = $('q').value; timer = setTimeout(() => filter(),200);
});
$('nav-search').addEventListener('submit',event => { event.preventDefault(); if (pendingQuery !== null) filter(); panels.setPanel('list',true,{focus:true}); });
$('filters').addEventListener('submit',event => event.preventDefault());
$('levels').addEventListener('change',() => filter({levels:[...$('levels').querySelectorAll(':checked')].map(el => el.value)}));
for (const [id,key,oldKey] of [['from','dateFrom','yearFrom'],['to','dateTo','yearTo']]) $(id).addEventListener('change',() => {
  if ($(id).reportValidity()) filter({[key]:$(id).value,[oldKey]:''});
});
$('mapped').addEventListener('change',() => filter({mappedOnly:$('mapped').checked}));
$('reset').addEventListener('click',resetFilters); $('reset-dates').addEventListener('click',resetDates);
$('map-view').addEventListener('click',showMap);
for (const [id,delta] of [['prev',-1],['next',1]]) $(id).addEventListener('click',() => {
  update({page:state.page + delta}); $('panel-list').querySelector('.panel-body').scrollTop = 0; $('papers').focus({preventScroll:true});
});
$('status-open').addEventListener('click',showStatusDialog);
$('status-close').addEventListener('click',() => $('status').close());
$('share').addEventListener('click',showShare); $('share-close').addEventListener('click',() => $('share-dialog').close());
$('copy').addEventListener('click',async () => {
  try { await navigator.clipboard.writeText($('share-url').value); $('copy-status').textContent = 'Link kopiert.'; }
  catch { $('share-url').select(); $('copy-status').textContent = 'Der Link ist zum Kopieren markiert.'; }
});
document.addEventListener('click',event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); $('q').focus(); }
  if (event.target.closest('[data-home]')) { event.preventDefault(); goHome(); }
  if (event.target.closest('[data-open-status]')) showStatusDialog();
});
window.addEventListener('popstate',() => {
  clearPendingQuery(); focusRecordId = ''; state = readState(location.href); render(); restoreMap();
});
showIntro(); render();
try {
  ({manifest,migration} = await atlas.init());
  renderStatus(); ready = true; showIntro(); startMap(); render();
} catch (error) {
  $('count').textContent = 'Daten nicht verfügbar';
  const message = error.message || 'Der Datenbestand konnte nicht geladen werden.';
  timeline.setStatus('Zeitleiste nicht verfügbar. ' + message,false); timelineRetry.hidden = false;
  $('detail').replaceChildren(node('h3','Datenbestand nicht verfügbar'),node('p',message,'error-message'),button('Seite neu laden',() => location.reload()));
  $('status-body').replaceChildren(node('p',message,'error-message'),button('Seite neu laden',() => location.reload()));
  const row = node('li',null,'empty-list'); row.append(node('p',message),button('Seite neu laden',() => location.reload())); $('papers').replaceChildren(row);
  $('map-count').textContent = 'Karte nicht verfügbar';
}
