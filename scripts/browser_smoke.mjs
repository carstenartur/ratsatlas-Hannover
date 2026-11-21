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
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) throw new Error('outside site');
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
async function capture(name) {
  await page.screenshot({path:resolve(output, name+'.png'), fullPage:true});
  report.screenshots.push(name+'.png');
}
async function hits(count) {
  await page.waitForFunction(expected => {
    const text = document.getElementById('count')?.textContent || '';
    return Number((text.match(/[\d.]+/) || [''])[0].replaceAll('.','')) === expected && !/läuft|geladen/i.test(text);
  }, count, {timeout:60000});
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
async function singleSheet() {
  const open = await page.locator('#panel-list, #panel-detail, #timeline-wrap').evaluateAll(elements => elements.filter(el=>!el.hidden).map(el=>el.id));
  assert.ok(open.length<=1, 'mobile shows more than one content sheet: '+open.join(', '));
}
async function query(value,count) {
  await page.locator('#q').fill(value);
  await page.locator('#q').press('Enter');
  await hits(count);
}
try {
  browser = await ({chromium,webkit}[engine]).launch({headless:true, ...(process.env.BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.BROWSER_EXECUTABLE_PATH}: {})});
  report.interactions = await checkInteractions(browser,url,output);
  page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(30000);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)report.assetErrors.push({url:r.url(),status:r.status()});});
  await page.goto(url);
  await page.locator('nav.nav').waitFor();
  await hits(109605);
  await page.waitForFunction(()=>document.querySelector('#map-count')?.textContent.includes('3.395'));
  const mapBox=await page.locator('#map').boundingBox();
  assert.equal(mapBox.x,0); assert.equal(mapBox.y,0);
  assert.equal(mapBox.width,1440); assert.equal(mapBox.height,1000);
  assert.equal(await page.locator('link[href="app.css"]').count(),0);
  await overflow(); await capture('desktop');
  report.assertions.push('Bonn fullviewport map/nav/panel layout; all 109605 records and 3395 source geometries');

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

  await page.goto(url);
  await hits(109605);
  await query('Gustav Adolf Straße',2);
  await page.locator('#papers [data-record]').first().click();
  await page.getByRole('button',{name:'Auf Karte zeigen',exact:true}).waitFor();
  assert.match(await page.locator('#detail').innerText(),/Gustav.Adolf/);
  await capture('location-evidence');
  await page.getByRole('button',{name:'Auf Karte zeigen',exact:true}).click();
  await page.waitForFunction(()=>Number(new URL(location.href).searchParams.get('z'))>=14);
  const sharedStreet=page.url();
  const mapState=new URL(sharedStreet).searchParams;
  const geometries=JSON.parse(gunzipSync(await readFile(resolve(root,'data/ris/map.geojson.gz'))));
  const point=geometries.features.find(f=>f.geometry.type==='Point'&&f.properties.recordIds.includes(mapState.get('vorgang')));
  assert.ok(point,'selected street record has its original point');
  const mercator=([lng,lat])=>{
    const scale=256*2**Number(mapState.get('z')), s=Math.sin(lat*Math.PI/180);
    return [(lng+180)/360*scale,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale];
  };
  const target=mercator(point.geometry.coordinates), center=mercator([Number(mapState.get('lng')),Number(mapState.get('lat'))]);
  const box=await page.locator('#map').boundingBox();
  await page.mouse.click(box.x+box.width/2+target[0]-center[0],box.y+box.height/2+target[1]-center[1]);
  await page.locator('.map-popup button[data-record]').first().waitFor();
  await togglePanel('panel-list');
  await page.locator('#levels input[value="city"]').uncheck();
  await hits(0);
  await page.locator('.map-popup').waitFor({state:'detached'});
  await page.goto(sharedStreet); await hits(2);
  assert.equal(new URL(page.url()).searchParams.get('q'),new URL(sharedStreet).searchParams.get('q'));
  report.assertions.push('Street evidence, clickable original point under highlight, filtered popup removal and shared selection');

  for (const [id,type,coordinate,screenshot] of [
    ['hannover-sim:15-0071-2025','LineString',[9.860888,52.396525],'geometry-line'],
    ['hannover-sim:15-1035-2016','Polygon',[9.71998654749,52.3707555],'geometry-polygon']
  ]) {
    await page.goto(url+'?fenster=detail&vorgang='+encodeURIComponent(id)); await hits(109605);
    await page.locator('#detail-title').waitFor();
    await page.waitForFunction(()=>document.querySelector('#map-count')?.textContent.includes('3.395'));
    assert.match(await page.locator('#detail').innerText(),new RegExp(type));
    await page.getByRole('button',{name:'Auf Karte zeigen',exact:true}).click();
    await page.waitForFunction(()=>Number(new URL(location.href).searchParams.get('z'))>=14);
    const view=new URL(page.url()).searchParams;
    const project=([lng,lat])=>{
      const scale=256*2**Number(view.get('z')), s=Math.sin(lat*Math.PI/180);
      return [(lng+180)/360*scale,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale];
    };
    const point=project(coordinate), center=project([Number(view.get('lng')),Number(view.get('lat'))]);
    const mapBox=await page.locator('#map').boundingBox();
    await page.mouse.click(mapBox.x+mapBox.width/2+point[0]-center[0],mapBox.y+mapBox.height/2+point[1]-center[1]);
    await page.locator(`.map-popup button[data-record="${id}"]`).waitFor();
    await capture(screenshot);
    report.assertions.push(`Original ${type} remains visible and clickable under selection: ${id}`);
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

  await page.goto(url); await hits(109605);
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

  await page.goto(url); await hits(109605);
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
  await page.waitForFunction(()=>/\d[\d.]* Treffer/.test(document.querySelector('#count')?.textContent||'')&&!document.querySelector('#count')?.textContent.includes('109.605'));
  const filtered=page.url(); await page.reload();
  await page.locator('#timeline-wrap[aria-busy="false"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('von'),new URL(filtered).searchParams.get('von'));
  await page.locator('#timeline-wrap [data-preset="all"]').click();
  await hits(109605);
  assert.ok(!new URL(page.url()).searchParams.has('von'));
  report.assertions.push('Real Bonn timeline filters and shares ISO dates; reset restores all 16 undated records');

  await page.setViewportSize({width:820,height:1180});
  await togglePanel('panel-list'); await singleSheet();
  await overflow(); await capture('tablet');
  await page.setViewportSize({width:390,height:844});
  await singleSheet(); await overflow(); await capture('mobile-list');
  await togglePanel('panel-list',false); await singleSheet();
  await overflow(); await capture('mobile-map');
  await togglePanel('timeline-wrap'); await singleSheet();
  await overflow(); await capture('mobile-timeline');
  await clickControl('#status-open');
  await page.locator('#status-body').waitFor();
  assert.match(await page.locator('#status-body').innerText(),/101\.601/);
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
} catch(error) {
  report.failure=error.message;
  if(page){ report.body=await page.locator('body').innerText().catch(()=> 'Page unavailable'); await capture('failure').catch(()=>{}); }
  console.error(JSON.stringify(report,null,2));
  process.exitCode=1;
} finally {
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify(report,null,2));
