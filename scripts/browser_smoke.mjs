// Run against the real unpacked snapshot; screenshots and report are CI artifacts.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('site'), output = resolve('browser-report');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
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
const browser = await chromium.launch({ headless: true });
const report = { basePath: prefix, assertions: [], screenshots: [], pageErrors: [] };
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', error => report.pageErrors.push(error.message));
async function screenshot(name) {
  await page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
  report.screenshots.push(name + '.png');
}
async function hits(count) {
  await page.waitForFunction(expected => document.getElementById('hits')?.textContent === expected, Number(count).toLocaleString('de-DE') + ' Treffer');
}
async function overflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
}
try {
  await page.goto(url);
  await hits(109605);
  await page.waitForFunction(() => document.getElementById('map-count').textContent === '3.395 Kartenorte');
  await overflow();
  await screenshot('desktop');
  report.assertions.push('Complete dataset and all 3,395 source geometries under repository subpath');

  // Query remains typed when another control is changed before the debounce.
  await page.locator('#query').fill('1047/2026');
  await page.locator('#levels input[value="state"]').uncheck();
  await hits(2);
  assert.equal(await page.locator('#query').inputValue(), '1047/2026');
  await page.getByRole('button').filter({ hasText: '1047/2026 F1' }).click();
  await page.getByRole('heading', { name: 'Quelle', exact: true }).waitFor();
  assert.ok(await page.getByRole('link', { name: 'Amtliches Original öffnen ↗' }).getAttribute('href'));
  await screenshot('request-answer');
  await page.locator('#detail-body section').filter({ has: page.getByRole('heading', { name: 'Verknüpfte Dokumente', exact: true }) }).getByRole('button').first().click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get('vorgang') === 'hannover-sim:1047-2026');
  await page.getByRole('heading', { name: 'Quelle', exact: true }).waitFor();
  report.assertions.push('Rapid query/filter change; linked request/answer and original link');
  await page.locator('#detail-close').click();

  await page.locator('#reset').click();
  await hits(109605);
  await page.locator('#query').fill('Gustav Adolf Straße');
  await hits(2);
  await page.locator('#list .result').first().click();
  await page.getByRole('button', { name: 'Auf Karte zeigen', exact: true }).waitFor();
  await screenshot('location-evidence');
  await page.getByRole('button', { name: 'Auf Karte zeigen', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('detail').open);
  await page.waitForFunction(() => new URL(location.href).searchParams.get('z') === '16');
  // The selected single point is at the fitted map center. Highlight must not eat its click.
  const mapBox = await page.locator('#map').boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await page.locator('.map-popup').waitFor();
  await page.locator('.map-popup button').first().waitFor();
  await page.locator('#levels input[value="city"]').uncheck();
  await hits(0);
  assert.equal(await page.locator('.map-popup').count(), 0);
  report.assertions.push('Highlighted geometry remains clickable; filtered-out popup closes');

  // All Landtag records are searchable without fictitious points.
  await page.locator('#reset').click(); await hits(109605);
  await page.locator('#levels input[value="city"]').uncheck();
  await page.locator('#levels input[value="region"]').uncheck();
  await hits(15);
  await page.locator('#list .result').first().click();
  await page.getByRole('heading', { name: 'Quelle', exact: true }).waitFor();
  assert.match(await page.locator('#detail-body').innerText(), /Originalkennung/);
  await page.locator('#detail-close').click();
  const shared = page.url(); await page.reload(); await hits(15); assert.equal(page.url(), shared);
  report.assertions.push('All 15 Landtag records, preserved original identity and shared filter URL');

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.locator('#list-tab').click();
  await page.locator('#reset').click(); await hits(109605);
  await overflow(); await screenshot('tablet');
  await page.setViewportSize({ width: 390, height: 844 });
  await overflow(); await screenshot('mobile-list');
  await page.locator('#map-tab').click();
  assert.equal(await page.locator('.sidebar').isVisible(), false);
  await page.locator('#map').waitFor(); await overflow(); await screenshot('mobile-map');
  await page.locator('#status-open').click();
  await screenshot('sources');
  assert.match(await page.locator('#status-body').innerText(), /101\.601/);
  report.assertions.push('820px and 390px layouts, list/map switching, honest source and unlocated counts');
  assert.deepEqual(report.pageErrors, []);
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
