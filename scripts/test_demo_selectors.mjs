import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const data = JSON.parse(await readFile(new URL('../public/assets/demo/demo-data.json', import.meta.url), 'utf8'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { rebalanceWeights, demoRoute, rankedCities, companiesForStage } = await server.ssrLoadModule('/src/demo/selectors.ts');
  const weights = [40, 20, 20, 20];
  const afterZero = rebalanceWeights(weights, 3, 0);
  assert.deepEqual(afterZero, [50, 25, 25, 0]);
  assert.deepEqual(rebalanceWeights(afterZero, 0, 95), [95, 3, 2, 0]);
  let state = weights;
  for (let i = 0; i < 4; i++) for (let value = 0; value <= 100; value += 5) {
    state = rebalanceWeights(state, i, value);
    assert.equal(state.reduce((sum, n) => sum + n, 0), 100);
    assert.ok(state.every(n => Number.isInteger(n) && n >= 0 && n <= 100));
    assert.equal(state[i], value);
  }
  const route = demoRoute(data);
  assert.equal(route.chainId, 'electronics');
  assert.equal(route.stageId, 'electronics-upstream');
  assert.equal(route.companyId, 'capchem');
  assert.equal(data.profile.chainLinks.find(link => link.stageId === route.stageId).status, 'unknown');
  assert.ok(companiesForStage(data, route.chainId, route.stageId, route.cityId).some(company => company.id === route.companyId));
  assert.ok(!companiesForStage(data, 'food', 'food-midstream').some(company => company.id === 'capchem'));
  assert.equal(rankedCities(data, route.chainId, route.stageId, weights, 100).length, 0);
  assert.ok(rankedCities(data, route.chainId, route.stageId, weights, 80).some(row => row.city.id === route.cityId));
  console.log('PASS: weight boundary regression, 84 normalized slider moves, sourced demonstration route, stage isolation, threshold filtering');
} finally { await server.close(); }
