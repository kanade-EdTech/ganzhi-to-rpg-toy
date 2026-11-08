import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadEraData, getErasByDynasty, lookupEra, astroToState } from '../src/era.js';

test('年号加载失败可重试，同名年号按君主区分，公元前纪年正确', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    if (++requests === 1) throw new Error('temporary network failure');
    return new Response(await readFile(new URL('../data/history/all-era-years.csv', import.meta.url)));
  };
  try {
    await assert.rejects(loadEraData(), /temporary/);
    await loadEraData();
    const eras = await getErasByDynasty('西漢');
    const unnamed = eras.filter(e => e.eraName === '（無年號）');
    assert.ok(unnamed.length > 1);
    const entries = await Promise.all(unnamed.map(e => lookupEra('西漢', e.id, e.yearMin)));
    assert.equal(new Set(entries.map(e => e.emperor)).size, unnamed.length);
    assert.equal(await lookupEra('西漢', '（無年號）', 1), null);
    const qing = await getErasByDynasty('清');
    const kangxi = qing.find(e => e.eraName === '康熙');
    assert.equal((await lookupEra('清', kangxi.id, 1)).astroYear, 1662);
    assert.equal(await lookupEra('清', kangxi.id, 999), null);
    assert.deepEqual(astroToState(0), {era:'BC',year:1});
    assert.deepEqual(astroToState(-220), {era:'BC',year:221});
  } finally {
    globalThis.fetch = originalFetch;
  }
});
