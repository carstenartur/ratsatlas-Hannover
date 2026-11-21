// User interactions which previously raced loading, lost dates or hid controls.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function checkInteractions(browser, url, output) {
  const results = [];
  const hits = (page, expected) => page.waitForFunction(count => {
    const text = document.querySelector('#count')?.textContent || '';
    return Number((text.match(/[\d.]+/) || [''])[0].replaceAll('.', '')) === count && !/läuft|geladen/i.test(text);
  }, expected, {timeout:60000});
  const loaded = async (page, suffix='?fenster=timeline') => { await page.goto(url + suffix); await hits(page,109605); };
  const cases = [
    ['timeline-loading', {width:1440,height:1000}, async page => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/data/ris/hannover.json', async route => { await gate; await route.continue().catch(()=>{}); });
      try {
        await page.goto(url+'?fenster=timeline', {waitUntil:'domcontentloaded'});
        await page.locator('#timeline-wrap .tl-svg').waitFor();
        const controls = page.locator('#timeline-wrap button[data-act], #timeline-wrap button[data-preset], #timeline-wrap select');
        assert.ok(await controls.evaluateAll(nodes=>nodes.length>0 && nodes.every(node=>node.disabled)), 'timeline controls are active before the manifest arrives');
        assert.equal(await page.locator('#timeline-wrap').getAttribute('aria-busy'),'true');
      } finally { release(); }
      await hits(page,109605);
      assert.equal(await page.locator('#timeline-wrap [data-preset="12m"]').isEnabled(),true);
      assert.equal(await page.locator('#timeline-wrap').getAttribute('aria-busy'),'false');
    }],
    ['late-detail-focus', {width:1440,height:1000}, async page => {
      await page.goto(url+'?q=1047%2F2026'); await hits(page,2);
      let release;
      const gate = new Promise(resolve => { release=resolve; });
      await page.route('**/hannover.*.records.json.gz', async route => { await gate; await route.continue().catch(()=>{}); });
      try {
        await page.locator('#papers [data-record="hannover-sim:1047-2026F1"]').click();
        await page.locator('#detail[aria-busy="true"]').waitFor();
        await page.locator('#q').focus();
      } finally { release(); }
      await page.locator('#detail-title').waitFor();
      assert.equal(await page.locator('#q').evaluate(node=>document.activeElement===node),true,'late detail response stole the search focus');
    }],
    ['immediate-preset-share', {width:1440,height:1000}, async page => {
      await loaded(page);
      await page.locator('#timeline-wrap [data-preset="12m"]').click();
      await page.locator('#share').click();
      const shared = new URL(await page.locator('#share-url').inputValue());
      assert.match(shared.searchParams.get('von') || '', /^\d{4}-\d{2}-\d{2}$/, 'sharing immediately lost the selected date range');
      await page.locator('#share-close').click();
      await page.locator('button[data-panel="panel-list"]').click();
      assert.equal(new URL(page.url()).searchParams.get('von'),shared.searchParams.get('von'),'opening a panel discarded the pending date range');
    }],
    ['mobile-timeline-reset', {width:390,height:844}, async page => {
      await loaded(page);
      const reset = page.locator('#timeline-wrap [data-preset="all"]');
      const recent = page.locator('#timeline-wrap [data-preset="12m"]');
      assert.equal(await reset.isVisible(),true,'the timeline reset is hidden on a phone');
      assert.equal(await recent.isVisible(),true,'the recent-date preset is hidden on a phone');
      await recent.click();
      await page.waitForFunction(()=>new URL(location.href).searchParams.has('von'));
      await reset.click(); await hits(page,109605);
      assert.equal(new URL(page.url()).searchParams.has('von'),false);
      assert.equal(await page.locator('#timeline-wrap').isVisible(),true);
    }],
    ['resized-timeline', {width:1280,height:900}, async page => {
      await loaded(page,'?fenster=list,detail,timeline');
      for (const [key, direction] of [['list','ArrowRight'],['detail','ArrowLeft']]) {
        const handle=page.locator(`.resizer[data-resize="${key}"]`);
        for(let step=0;step<12;step++) await handle.press('Shift+'+direction);
      }
      const stage = await page.locator('#timeline-wrap .tl-stage').boundingBox();
      assert.ok(stage.width >= 240, `resized side sheets leave only ${stage.width}px for the timeline`);
      assert.equal(await page.locator('#timeline-wrap [data-preset="all"]').isVisible(),true);
      await page.locator('#timeline-wrap [data-preset="all"]').click(); await hits(page,109605);
    }]
  ];
  for (const [name,viewport,run] of cases) {
    const context=await browser.newContext({viewport});
    const page=await context.newPage(); page.setDefaultTimeout(15000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    try {
      await run(page); assert.deepEqual(errors,[], 'browser errors during '+name);
      results.push({name,passed:true});
    } catch(error) {
      const screenshot='interaction-'+name+'.png';
      await page.screenshot({path:resolve(output,screenshot),fullPage:true}).catch(()=>{});
      results.push({name,passed:false,error:error.message,pageErrors:errors,screenshot});
    } finally { await context.close(); }
  }
  return results;
}
