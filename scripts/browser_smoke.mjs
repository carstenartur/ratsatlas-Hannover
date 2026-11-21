// Real Hannover snapshot, actual browser engines, repository subpath and screenshots.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { checkInteractions } from './interaction_checks.mjs';

const engine = process.env.BROWSER_ENGINE || 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw new Error('Unknown BROWSER_ENGINE');
const root = resolve(process.env.ATLAS_SITE_ROOT || 'site');
const output = resolve('browser-report', engine);
await mkdir(output, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.gz':'application/gzip', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const prefix = '/ratsatlas-Hannover/';
const runtimeAssets = new Set(['app.js','data.js','search-worker.js','search.js','view-state.js','bonn-panels.js','timeline-adapter.js','timeline.js','map-geography.js','style.css','hannover.css']);
const runtimeRequests = new Map();
const server = createServer(async (request, response) => {
  try {
    const requested = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(requested.pathname);
    if (!pathname.startsWith(prefix)) throw new Error('outside site');
    const asset = pathname.slice(prefix.length);
    if (runtimeAssets.has(asset)) {
      if (!runtimeRequests.has(asset)) runtimeRequests.set(asset,new Set());
      runtimeRequests.get(asset).add(requested.searchParams.get('v') || '');
    }
    const path = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!path.startsWith(root + sep)) throw new Error('outside site');
    response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}`;
const report = { engine, basePath:prefix, assertions:[], screenshots:[], pageErrors:[], consoleErrors:[], requestFailures:[], assetErrors:[] };
let browser, page;
async function painted() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(()=>{})));
    await new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}
async function capture(name) {
  await painted();
  await page.waitForFunction(()=>!document.querySelector('#map.leaflet-zoom-anim') && [...document.querySelectorAll('#map img')].every(image=>image.complete));
  await painted();
  await page.screenshot({path:resolve(output, name+'.png'), fullPage:false, animations:'disabled'});
  report.screenshots.push(name+'.png');
}
async function grayscaleBasemap() {
  // This patch of the desktop map is clear of district fills, labels and controls.
  const clip={x:20,y:90,width:180,height:100};
  await page.waitForFunction(({x,y,width,height})=>{
    const cx=x+width/2, cy=y+height/2;
    return [...document.querySelectorAll('#map img.leaflet-tile-loaded')].some(tile=>{
      const bounds=tile.getBoundingClientRect();
      return tile.naturalWidth>0 && bounds.left<=cx && cx<=bounds.right && bounds.top<=cy && cy<=bounds.bottom;
    });
  },clip);
  const png=await page.screenshot({clip,animations:'disabled'});
  const coloredFraction=await page.evaluate(async encoded=>{
    const image=new Image();
    image.src='data:image/png;base64,'+encoded;
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let colored=0;
    for(let i=0;i<pixels.length;i+=4) {
      const r=pixels[i], g=pixels[i+1], b=pixels[i+2];
      if (Math.max(r,g,b)-Math.min(r,g,b)>12) colored++;
    }
    return colored/(canvas.width*canvas.height);
  },png.toString('base64'));
  report.grayscaleSample={clip,coloredFraction};
  assert.ok(coloredFraction<0.005,`painted basemap contains ${(coloredFraction*100).toFixed(2)}% colored pixels`);
  report.assertions.push('Rendered desktop basemap pixels are grayscale in the unobstructed tile sample');
}
async function mobileAttribution({timelineOpen=false}={}) {
  const attribution=page.locator('#map .leaflet-control-attribution');
  for (const name of [/Ratsatlas Bonn/,'Datenschutz']) {
    assert.ok(await attribution.getByRole('link',{name}).isVisible(),`missing visible mobile attribution link: ${name}`);
  }
  const [credits,status,nav]=await Promise.all([attribution,page.locator('.map-info'),page.locator('nav.nav')].map(locator=>locator.boundingBox()));
  assert.ok(credits?.height&&status?.height&&nav?.height,'mobile attribution, map status and navigation must be visible');
  assert.ok(status.y+status.height<=credits.y,'map status overlaps mobile attribution');
  assert.ok(credits.y+credits.height<=nav.y,'mobile navigation overlaps attribution');
  if (timelineOpen) {
    const timeline=await page.locator('#timeline-wrap').boundingBox();
    assert.ok(timeline?.height,'the mobile timeline must be visible');
    const gap=credits.y-(timeline.y+timeline.height);
    report.mobileTimelineAttributionGap=gap;
    assert.ok(gap>=0,`mobile timeline covers ${(-gap).toFixed(1)}px of attribution`);
    report.assertions.push('The open mobile timeline ends above the full attribution bar');
    return;
  }
  report.assertions.push('Mobile attribution includes Bonn and privacy links between the map status and navigation');
}
async function hits(count) {
  await page.waitForFunction(expected => {
    const text = document.getElementById('count')?.textContent || '';
    return Number((text.match(/[\d.]+/) || [''])[0].replaceAll('.','')) === expected && !/läuft|geladen/i.test(text);
  }, count, {timeout:60000});
}
async function mapCount(count) {
  await page.waitForFunction(expected => {
    const text = document.getElementById('map-count')?.textContent || '';
    return text === expected.toLocaleString('de-DE') + ' Kartenorte';
  }, count);
}
async function pathCount(selector, count) {
  await page.waitForFunction(({selector,count}) => document.querySelectorAll('#map ' + selector).length === count,{selector,count});
}
async function togglePanel(id, open=true) {
  const panel = page.locator('#'+id);
  if (await panel.isVisible() !== open) await clickControl(`button[data-panel="${id}"]`);
  await panel.waitFor({state:open?'visible':'hidden'});
}
async function clickControl(selector) {
  const control = page.locator(selector).first();
  if (!await control.isVisible()) await page.locator('#nav-burger').click();
  await control.click();
}
async function overflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
}
async function singleSheet(expected=null) {
  const open = await page.locator('#panel-list, #panel-detail, #timeline-wrap').evaluateAll(elements => elements.filter(el=>!el.hidden).map(el=>el.id));
  assert.deepEqual(open,expected ? [expected] : [], 'unexpected mobile content sheet');
  assert.equal(await page.locator('#nav-burger').getAttribute('aria-expanded'),'false','mobile menu covers the requested view');
}
async function showSheet(id=null) {
  await painted();
  await clickControl('#map-view');
  if (id) await togglePanel(id);
  await painted();
  await singleSheet(id);
}
async function query(value,count) {
  await page.locator('#q').fill(value);
  await page.locator('#q').press('Enter');
  await hits(count);
}
function camera(href = page.url()) {
  const params = new URL(href).searchParams;
  return {lat:Number(params.get('lat') ?? 52.375),lng:Number(params.get('lng') ?? 9.735),zoom:Number(params.get('z') ?? 12)};
}
function result(id) { return page.locator(`#papers button[data-record="${id}"]`); }
async function recordReady(id) {
  await page.locator('#detail .source-identity').filter({hasText:id}).waitFor({state:'attached'});
}
async function focusedRecord(id, minZoom=15) {
  await recordReady(id);
  await page.waitForFunction(({id,minZoom}) => {
    const params = new URL(location.href).searchParams;
    return params.get('vorgang') === id && Number(params.get('z')) >= minZoom;
  }, {id,minZoom});
}
async function screenPoint(coordinate) {
  const {lat,lng,zoom}=camera();
  const project=([longitude,latitude])=>{
    const scale=256*2**zoom, s=Math.sin(latitude*Math.PI/180);
    return [(longitude+180)/360*scale,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale];
  };
  const mapBox=await page.locator('#map').boundingBox();
  const point=project(coordinate), center=project([lng,lat]);
  return {x:mapBox.x+mapBox.width/2+point[0]-center[0], y:mapBox.y+mapBox.height/2+point[1]-center[1]};
}
async function visibleHighlight(coordinate) {
  const pane = '#map .leaflet-record-selection-pane';
  await page.locator(pane+' canvas').waitFor({state:'visible'});
  await painted();
  const point=await screenPoint(coordinate);
  const sample=await page.evaluate(({pane,x,y})=>{
    const canvas = document.querySelector(pane+' canvas');
    const map = document.getElementById('map');
    if (!map.contains(document.elementFromPoint(x,y))) return {occluded:true};
    const box = canvas.getBoundingClientRect();
    const scaleX=canvas.width/box.width, scaleY=canvas.height/box.height;
    const left=Math.max(0,Math.floor((x-box.left-17)*scaleX)), right=Math.min(canvas.width,Math.ceil((x-box.left+17)*scaleX));
    const top=Math.max(0,Math.floor((y-box.top-17)*scaleY)), bottom=Math.min(canvas.height,Math.ceil((y-box.top+17)*scaleY));
    if (right<=left||bottom<=top) return {outsideCanvas:true};
    const pixels=canvas.getContext('2d').getImageData(left,top,right-left,bottom-top).data;
    const colors = [[255,176,0],[33,21,46]];
    const strokes = colors.map(rgb=>{
      for (let i=0;i<pixels.length;i+=4) {
        if (pixels[i+3]>=230 && rgb.every((value,c)=>Math.abs(pixels[i+c]-value)<=5)) return true;
      }
      return false;
    });
    const style=getComputedStyle(canvas.parentElement);
    return {strokes,pointerEvents:style.pointerEvents,zIndex:Number(style.zIndex)};
  }, {pane,...point});
  assert.deepEqual(sample.strokes,[true,true],`both selection strokes must be visible near ${coordinate}: ${JSON.stringify(sample)}`);
  assert.equal(sample.pointerEvents,'none','the highlight pane intercepts the map');
  assert.ok(sample.zIndex>400,'the selection must sit above the base vectors');
}
async function clickMapAt(coordinate) {
  await page.locator('#map .leaflet-overlay-pane canvas').waitFor({state:'visible'});
  await painted();
  const {x,y}=await screenPoint(coordinate);
  await page.mouse.click(x,y);
}
async function readPacked(path) {
  return JSON.parse(gunzipSync(await readFile(resolve(root,path))));
}
try {
  const {totals,derived}=JSON.parse(await readFile(resolve(root,'data/enriched/enrichment.json'),'utf8'));
  const [originalMap,enrichedMap,geography]=await Promise.all([
    readPacked('data/ris/map.geojson.gz'),
    readPacked('data/enriched/'+derived.map.path),
    readPacked('data/enriched/'+derived.geography.path)
  ]);
  const geometry = (map,id,type) => {
    const feature = map.features.find(f=>f.geometry.type===type && f.properties.recordIds.includes(id));
    assert.ok(feature,`missing fixture ${type} for ${id}`);
    return feature.geometry;
  };
  browser = await ({chromium,webkit}[engine]).launch({headless:true, ...(process.env.BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.BROWSER_EXECUTABLE_PATH}: {})});
  report.interactions = await checkInteractions(browser,url,output);
  page = await browser.newPage({viewport:{width:1440,height:1000},locale:'de-DE'});
  page.setDefaultTimeout(30000);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)report.assetErrors.push({url:r.url(),status:r.status()});});
  await page.goto(url);
  await page.locator('nav.nav').waitFor();
  await hits(totals.recordCount);
  await mapCount(totals.geometryCount);
  const districts='path[data-area-id^="bezirk:"]';
  const neighborhoods='path[data-area-id^="stadtteil:"]';
  await pathCount(districts,13);
  assert.match(await page.locator('#map img.leaflet-tile').first().evaluate(img=>getComputedStyle(img).filter),/grayscale/);
  assert.equal(await page.locator('#map .leaflet-overlay-pane canvas').count(),0,'the overview draws all original streets at once');
  const mapBox=await page.locator('#map').boundingBox();
  assert.equal(mapBox.x,0); assert.equal(mapBox.y,0);
  assert.equal(mapBox.width,1440); assert.equal(mapBox.height,1000);
  assert.equal(await page.locator('link[href="app.css"]').count(),0);
  await overflow(); await capture('desktop');
  await grayscaleBasemap();
  report.assertions.push(`Bonn fullviewport layout, gray map with 13 districts, ${totals.recordCount} records and ${totals.geometryCount} supplied geometries`);

  const areaSelect=page.locator('#f-area');
  const district=geography.features.find(({properties})=>properties.areaId==='bezirk:01').properties;
  const parts=geography.features.filter(({properties})=>properties.parentId===district.areaId).map(({properties})=>properties);
  const neighborhood=parts.find(part=>part.recordIds.length&&part.geometryIds.length);
  assert.ok(neighborhood,'the district fixture has a mapped neighborhood');
  for (const [area,visibleParts] of [[district,parts.length],[neighborhood,0]]) {
    await areaSelect.selectOption(area.areaId);
    await hits(new Set(area.recordIds).size);
    await mapCount(new Set(area.geometryIds).size);
    await pathCount(districts,0);
    await pathCount(neighborhoods,visibleParts);
    assert.equal(new URL(page.url()).searchParams.get('gebiet'),area.areaId);
    assert.equal(await areaSelect.inputValue(),area.areaId);
    if (visibleParts) await capture('neighborhoods');
  }
  await page.locator('#map .leaflet-overlay-pane canvas').waitFor({state:'visible'});
  await capture('places');
  await areaSelect.selectOption('');
  await hits(totals.recordCount);
  await mapCount(totals.geometryCount);
  await pathCount(districts,13);
  assert.equal(new URL(page.url()).searchParams.has('gebiet'),false);
  await painted();
  const districtPoint=await screenPoint(district.labelPoint);
  assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.getAttribute('data-area-id'),districtPoint),district.areaId,
    'the returned overview must expose the district path to the pointer');
  await page.mouse.click(districtPoint.x,districtPoint.y);
  await hits(new Set(district.recordIds).size);
  assert.equal(await areaSelect.inputValue(),district.areaId);
  await togglePanel('panel-list');
  const inDistrict=page.locator('#papers button[data-record]').first();
  const inDistrictId=await inDistrict.getAttribute('data-record');
  await inDistrict.click();
  await recordReady(inDistrictId);
  await pathCount(neighborhoods,0);
  await page.getByRole('button',{name:/Zurück zu „Los geht’s“/}).click();
  await pathCount(neighborhoods,parts.length);
  await painted();
  const baseHasPixels=await page.locator('#map .leaflet-overlay-pane canvas').evaluateAll(canvases=>canvases.some(canvas=>{
    if (!canvas.width || !canvas.height) return false;
    const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=3;i<rgba.length;i+=4) if (rgba[i]) return true;
    return false;
  }));
  assert.equal(baseHasPixels,false,'leaving the record must clear detail vectors from the district');
  await areaSelect.selectOption('');
  await hits(totals.recordCount);
  report.assertions.push('District and neighborhood picker use generated counts; the reset overview accepts district pointer clicks and leaving a selected record restores neighborhoods');

  await togglePanel('panel-list');
  await page.locator('#q').fill('1047/2026');
  await page.locator('#levels input[value="state"]').uncheck();
  await hits(2);
  assert.equal(await page.locator('#q').inputValue(),'1047/2026');
  await page.locator('#papers [data-record="hannover-sim:1047-2026F1"]').click();
  await page.locator('#detail [data-related="hannover-sim:1047-2026"]').waitFor();
  assert.ok(await page.locator('#detail a[href*="hannover-stadt.de"]').count());
  await capture('request-answer');
  await page.locator('#detail [data-related="hannover-sim:1047-2026"]').click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('vorgang')==='hannover-sim:1047-2026');
  await page.locator('#detail [data-related="hannover-sim:1047-2026F1"]').waitFor();
  await page.goBack();
  await page.locator('#detail [data-related="hannover-sim:1047-2026"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('vorgang'),'hannover-sim:1047-2026F1');
  await page.goForward();
  await page.locator('#detail [data-related="hannover-sim:1047-2026F1"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('vorgang'),'hannover-sim:1047-2026');
  report.assertions.push('Browser Back and Forward restore distinct linked request/answer selections');
  report.assertions.push('Rapid query/filter changes and clickable request/answer relationship preserve qualified identity');

  const street='hannover-sim:15-1782-2019F1';
  const streetPoint=geometry(originalMap,street,'Point').coordinates;
  await page.goto(url+'?q=Gustav+Adolf+Stra%C3%9Fe&lat=52.43732&lng=9.79231&z=11');
  await hits(2);
  // Select a result immediately after using the zoom control, while a zoom
  // transition could still be active.
  await page.locator('.leaflet-control-zoom-in').click();
  await result(street).click();
  await focusedRecord(street,16);
  await visibleHighlight(streetPoint);
  const autoCamera=camera();
  await page.locator('.leaflet-control-zoom-out').click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('z')==='15');
  await result(street).click();
  await focusedRecord(street,16);
  await visibleHighlight(streetPoint);
  assert.deepEqual(camera(),autoCamera,'selecting the same result again must restore its focused camera');
  report.assertions.push('Clicking a mapped result immediately after using a zoom control focuses its point; reselecting it restores the highlighted view');
  assert.match(await page.locator('#detail').innerText(),/Gustav.Adolf/);
  await capture('location-evidence');
  await page.getByRole('button',{name:'Auf Karte zeigen',exact:true}).click();
  const sharedStreet=page.url();
  await visibleHighlight(streetPoint);
  await clickMapAt(streetPoint);
  await page.locator(`.map-popup button[data-record="${street}"]`).waitFor();
  await togglePanel('panel-list');
  await page.locator('#levels input[value="city"]').uncheck();
  await hits(0);
  await page.locator('.map-popup').waitFor({state:'detached'});
  await page.goto(sharedStreet); await hits(2);
  assert.equal(new URL(page.url()).searchParams.get('q'),new URL(sharedStreet).searchParams.get('q'));
  report.assertions.push('Street evidence, clickable original point under highlight, filtered popup removal and shared selection');

  for (const [id,searchText,hitCount,type,clickCoordinate,screenshot] of [
    ['hannover-sim:15-0071-2025','15-0071/2025',2,'LineString',[9.860888,52.396525],'geometry-line'],
    ['hannover-sim:15-1035-2016','15-1035/2016',1,'Polygon',[9.71998654749,52.3707555],'geometry-polygon']
  ]) {
    const {coordinates}=geometry(originalMap,id,type);
    const strokeCoordinate=type==='LineString'?coordinates[1]:coordinates[0][1];
    await page.goto(url+'?q='+encodeURIComponent(searchText));
    await hits(hitCount);
    await result(id).click();
    await focusedRecord(id);
    await visibleHighlight(strokeCoordinate);
    await page.locator('#detail summary').filter({hasText:'Geometrien und Herkunft'}).click();
    assert.match(await page.locator('#detail').innerText(),new RegExp(type));
    await page.getByRole('button',{name:'Auf Karte zeigen',exact:true}).click();
    await visibleHighlight(strokeCoordinate);
    await clickMapAt(clickCoordinate);
    await page.locator(`.map-popup button[data-record="${id}"]`).waitFor();
    await capture(screenshot);
    report.assertions.push(`List selection automatically focuses and paints the original ${type}, which remains clickable: ${id}`);
  }
  await page.goto(url+'?vorgang='+encodeURIComponent(street));
  await focusedRecord(street,16);
  await visibleHighlight(streetPoint);
  report.assertions.push('A mapped record permalink without coordinates focuses its original point');

  const saved = new URL(url);
  saved.search=new URLSearchParams({q:'Gustav Adolf Straße',vorgang:street,lat:'52.40001',lng:'9.76432',z:'13',fenster:'list,detail'});
  await page.goto(saved.href);
  await hits(2);
  await recordReady(street);
  await visibleHighlight(streetPoint);
  assert.deepEqual(camera(),camera(saved.href),'explicit permalink camera was changed');
  const otherStreet='hannover-sim:15-1446-2010F1';
  await result(otherStreet).click();
  await recordReady(otherStreet);
  await page.locator('.leaflet-control-zoom-in').click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('z')==='14');
  const forwardCamera=camera();
  await page.goBack();
  await recordReady(street);
  await visibleHighlight(streetPoint);
  assert.deepEqual(camera(),camera(saved.href),'Back did not restore the stored record camera');
  await page.goForward();
  await recordReady(otherStreet);
  assert.deepEqual(camera(),forwardCamera,'Forward did not restore the later camera');
  report.assertions.push('Explicit record viewport is preserved and distinct saved cameras survive browser Back and Forward');

  await page.goto(url+'?q=Bumke');
  await hits(19);
  assert.equal(await page.locator('#papers button[data-record]').filter({hasText:'Mit Kartenort'}).count(),19);
  const bumke='hannover-sim:2235-2024';
  await result(bumke).click();
  await focusedRecord(bumke,16);
  await visibleHighlight(geometry(enrichedMap,bumke,'Point').coordinates);
  const siteLocation=page.locator('#detail .locs li').filter({hasText:'Bumke-Areal'});
  assert.match(await siteLocation.innerText(),/Im Ratsatlas ergänzt.*Projektstandort/);
  assert.match(await siteLocation.innerText(),/Landeshauptstadt Hannover, Hannover baut/);
  assert.match(await siteLocation.getByRole('link',{name:'Quelle der Verortung ↗'}).getAttribute('href'),/^https:\/\/www\.hannover\.de\//);
  await capture('bumke');
  report.assertions.push('Bumke finds 19 mapped records; choosing 2235/2024 focuses its municipal project location and displays its source');

  for (const [id,searchText,hitCount,type,label,accuracy,screenshot] of [
    ['hannover-sim:15-0139-2008','15-0139/2008',3,'LineString','Eckermannstraße','Straßenverlauf zur Orientierung','new-street'],
    ['hannover-sim:0874-2023','0874/2023',1,'Point','Ortskamp 89','Hauskoordinate','new-project-address'],
    ['hannover-sim:15-0423-2018','15-0423/2018',2,'MultiPoint','Bückeburger Allee / Göttinger Chaussee','Kreuzungsbereich aus Straßenachsen','new-crossing']
  ]) {
    const shape=geometry(enrichedMap,id,type);
    const points=type==='Point'?[shape.coordinates]:type==='MultiPoint'?shape.coordinates:[shape.coordinates[Math.floor(shape.coordinates.length/2)]];
    await page.goto(url+'?q='+encodeURIComponent(searchText));
    await hits(hitCount);
    await result(id).click();
    await focusedRecord(id,type==='LineString'?13:16);
    for (const point of points) await visibleHighlight(point);
    const evidence=page.locator('#detail .locs li').filter({hasText:label}).filter({hasText:'Im Ratsatlas ergänzt'});
    assert.ok((await evidence.innerText()).includes(accuracy));
    await page.getByRole('button',{name:'Auf Karte zeigen',exact:true}).click();
    for (const point of points) {
      await visibleHighlight(point);
      await clickMapAt(point);
      await page.locator(`.map-popup button[data-record="${id}"]`).waitFor();
    }
    await capture(screenshot);
    report.assertions.push(`New ${accuracy}: list selection focuses, displays evidence and keeps every tested part clickable (${id})`);
  }

  // Bothfeld and Isernhagen-Süd share a district. Only Bothfeld has a
  // neighborhood-level record group. Both interior points are clear of markers.
  await page.goto(url+'?lat=52.42945&lng=9.79625&z=14&fenster=');
  await hits(totals.recordCount);
  await mapCount(totals.geometryCount);
  const areaPopup=page.locator('.map-popup');
  for (const [coordinate,areaId,label,accuracy] of [
    [[9.799485,52.418199],'stadtteil:22','Stadtteil Bothfeld','Nur Stadtteil bekannt'],
    [[9.793014,52.440714],'bezirk:03','Stadtbezirk Bothfeld-Vahrenheide','Nur Stadtbezirk bekannt']
  ]) {
    const group=enrichedMap.features.find(f=>f.properties.areaId===areaId).properties;
    await clickMapAt(coordinate);
    await areaPopup.getByText(label,{exact:true}).waitFor();
    await areaPopup.getByText(accuracy,{exact:true}).waitFor();
    await areaPopup.getByText(group.recordIds.length+' verknüpfte Vorgänge',{exact:true}).waitFor();
    await areaPopup.locator(`button[data-record="${group.recordIds[0]}"]`).waitFor();
    await page.locator('#map .leaflet-pan-anim').waitFor({state:'detached'});
    const close=page.locator('.leaflet-popup-close-button');
    const closeBox=await close.boundingBox(), navBox=await page.locator('nav.nav').boundingBox();
    assert.ok(closeBox.y>=navBox.y+navBox.height,'the populated popup close control must clear the navigation');
    await close.click();
    // Leaflet keeps a closing popup in the DOM until its fade has finished.
    await areaPopup.waitFor({state:'detached'});
  }
  report.assertions.push('With all locations present, clicks in Bothfeld and Isernhagen-Süd open the separate neighborhood and district record groups with their exact accuracy');

  for (const [id,searchText,areaId,accuracy,screenshot] of [
    ['hannover-sim:15-1375-2023','15-1375/2023','bezirk:10','Nur Stadtbezirk bekannt','new-district'],
    ['hannover-sim:15-0143-2023S1','15-0143/2023','stadtteil:40','Nur Stadtteil bekannt','new-neighborhood']
  ]) {
    const area=geography.features.find(f=>f.properties.areaId===areaId).properties;
    const feature=enrichedMap.features.find(f=>f.properties.areaId===areaId&&f.properties.recordIds.includes(id));
    assert.ok(feature,'missing official area fixture');
    const initial=new URL(url);
    initial.search=new URLSearchParams({q:searchText,lat:String(area.labelPoint[1]),lng:String(area.labelPoint[0]),z:'14',fenster:''});
    await page.goto(initial.href);
    await hits(2);
    // A coarse location remains a clickable surface in overview mode. Its
    // interior must not disappear into a representative point on the border.
    await clickMapAt(area.labelPoint);
    await areaPopup.getByText(accuracy,{exact:true}).waitFor();
    await page.locator(`.map-popup button[data-record="${id}"]`).waitFor();
    await togglePanel('panel-list');
    await result(id).click();
    await focusedRecord(id,10);
    const ring=feature.geometry.type==='Polygon'?feature.geometry.coordinates[0]:feature.geometry.coordinates[0][0];
    await visibleHighlight(ring[1]);
    assert.ok((await page.locator('#detail .locs li').filter({hasText:accuracy}).innerText()).includes('Im Ratsatlas ergänzt'));
    await capture(screenshot);
    await areaSelect.selectOption(areaId);
    await hits(2);
    if (areaId.startsWith('bezirk:')) {
      const child=geography.features.find(f=>f.properties.parentId===areaId).properties;
      await areaSelect.selectOption(child.areaId);
      await hits(0);
    } else {
      await areaSelect.selectOption(area.parentId);
      await hits(2);
    }
    report.assertions.push(`${accuracy}: overview keeps a surface, selection highlights its boundary, and filters respect only the known area (${id})`);
  }

  await page.goto(url+'?q=1047%2F2026&vorgang=hannover-sim%3A1047-2026F1');
  await hits(2);
  await page.locator('#detail [data-related="hannover-sim:1047-2026"]').waitFor();
  await page.goto(url+'?ansicht=karte&q=1047%2F2026&vorgang=hannover-sim%3A1047-2026F1');
  await hits(2);
  await page.locator('#panel-detail').waitFor({state:'visible'});
  await page.locator('#detail [data-related="hannover-sim:1047-2026"]').waitFor();
  await page.goto(url+'?q=1047%2F2026'); await hits(2);
  await page.locator('#panel-list').waitFor({state:'visible'});
  report.assertions.push('Previously published map/record and query-only links restore the selected answer or results');

  let releaseDetail;
  const detailGate=new Promise(resolve=>{releaseDetail=resolve;});
  const delayedRecords='**/hannover.*.records.json.gz';
  await page.route(delayedRecords,async route=>{await detailGate;await route.continue();});
  await page.locator('#papers [data-record="hannover-sim:1047-2026F1"]').click();
  await page.locator('#detail[aria-busy="true"]').waitFor();
  await page.locator('#q').focus();
  releaseDetail();
  await page.locator('#detail-title').waitFor();
  assert.ok(await page.locator('#q').evaluate(el=>document.activeElement===el),'late detail response stole search focus');
  await page.unroute(delayedRecords);
  report.assertions.push('A slow record response preserves focus after the user returns to search');

  await page.goto(url); await hits(totals.recordCount);
  await query('0098/2004',2);
  for (const id of ['hannover-sim:0098-2004','region-hannover-ris:vo:1740']) {
    await page.locator(`#papers [data-record="${id}"]`).click();
    await page.locator('#detail .source-identity').waitFor({state:'attached'});
    assert.equal(new URL(page.url()).searchParams.get('vorgang'),id);
    assert.ok((await page.locator('#detail .source-identity').allTextContents()).includes(id));
  }
  report.assertions.push('Same number 0098/2004 opens distinct Stadt and Region records without collisions');

  await page.goto(url+'?ebenen=state'); await hits(15);
  await togglePanel('panel-list');
  await page.locator('#papers [data-record]').first().click();
  await page.waitForFunction(()=>document.querySelector('#detail')?.textContent.includes('Originalkennung'));
  assert.match(await page.locator('#detail').innerText(),/Ohne Kartenort|kein Kartenort|keine.*Geometrie/i);
  const sharedState=page.url(); await page.reload(); await hits(15);
  assert.equal(new URL(page.url()).searchParams.get('vorgang'),new URL(sharedState).searchParams.get('vorgang'));
  report.assertions.push('All 15 unlocated Landtag records retain their original identity and shared source filter');

  await page.goto(url); await hits(totals.recordCount);
  await togglePanel('timeline-wrap');
  await page.locator('#timeline-wrap .tl-svg').waitFor();
  await capture('timeline');
  await page.locator('#timeline-wrap [data-preset="12m"]').click();
  await clickControl('#share');
  const immediateShared=new URL(await page.locator('#share-url').inputValue());
  assert.match(immediateShared.searchParams.get('von')||'',/^\d{4}-\d{2}-\d{2}$/,'immediate share lost preset');
  await page.locator('#share-close').click();
  await togglePanel('panel-list');
  await page.waitForFunction(()=>/^\d{4}-\d{2}-\d{2}$/.test(new URL(location.href).searchParams.get('von')||''));
  await page.waitForFunction(total=>{
    const count=document.querySelector('#count')?.textContent||'';
    return /\d[\d.]* Treffer/.test(count)&&!count.includes(total.toLocaleString('de-DE'));
  },totals.recordCount);
  const filtered=page.url(); await page.reload();
  await page.locator('#timeline-wrap[aria-busy="false"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('von'),new URL(filtered).searchParams.get('von'));
  await page.locator('#timeline-wrap [data-preset="all"]').click();
  await hits(totals.recordCount);
  assert.ok(!new URL(page.url()).searchParams.has('von'));
  report.assertions.push('Real Bonn timeline filters and shares ISO dates; reset restores all 16 undated records');

  await page.setViewportSize({width:820,height:1180});
  await showSheet('panel-list');
  await overflow(); await capture('tablet');
  await page.setViewportSize({width:390,height:844});
  await showSheet('panel-list'); await overflow(); await capture('mobile-list');
  await showSheet();
  await overflow(); await capture('mobile-map');
  await mobileAttribution();
  await showSheet('timeline-wrap');
  await overflow(); await mobileAttribution({timelineOpen:true}); await capture('mobile-timeline');
  const phoneViews=await Promise.all(['mobile-list','mobile-map','mobile-timeline'].map(name=>readFile(resolve(output,name+'.png'))));
  for(let i=0;i<phoneViews.length;i++) for(let j=i+1;j<phoneViews.length;j++) assert.ok(!phoneViews[i].equals(phoneViews[j]),'distinct phone views produced the same screenshot');
  report.assertions.push('Phone list, unobstructed map and timeline are explicitly selected, painted and captured as distinct views');
  await clickControl('#status-open');
  await page.locator('#status-body').waitFor();
  const unlocated=(totals.recordCount-totals.mappedRecordCount).toLocaleString('de-DE');
  assert.ok((await page.locator('#status-body').innerText()).includes(`${unlocated} Vorgänge ohne Kartenort`));
  await overflow(); await capture('sources');
  report.assertions.push('Tablet/phone have one collapsible sheet, accessible full map and honest source totals');

  await page.goto(url+'datenschutz.html');
  assert.equal(await page.locator('link[href="portal.css"]').count(),1);
  await page.getByRole('heading',{name:'Hinweise zu Daten und Darstellung',exact:true}).scrollIntoViewIfNeeded();
  await overflow();
  assert.deepEqual(report.pageErrors,[]);
  assert.deepEqual(report.interactions.filter(result=>!result.passed),[], 'interaction regressions');
  assert.deepEqual(report.assetErrors,[]);
  assert.deepEqual(report.requestFailures.filter(r=>r.url.startsWith(url)&&!/ERR_ABORTED|cancelled|canceled|Aborted/i.test(String(r.error))),[]);
  assert.deepEqual([...runtimeRequests.keys()].sort(),[...runtimeAssets].sort(),'runtime asset coverage');
  const releases=new Set([...runtimeRequests.values()].flatMap(values=>[...values]));
  assert.deepEqual([...releases],['kartenorte-20261121-5'],'runtime files must use the same current cache version');
  report.assertions.push('Browser and search worker load one consistently versioned runtime, independent of old unversioned cache entries');
} catch(error) {
  report.failure=error.message;
  if(page){ report.body=await page.locator('body').innerText().catch(()=> 'Page unavailable'); await capture('failure').catch(()=>{}); }
  console.error(JSON.stringify(report,null,2));
  process.exitCode=1;
} finally {
  report.runtimeAssets=Object.fromEntries([...runtimeRequests].map(([asset,versions])=>[asset,[...versions]]));
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify(report,null,2));
