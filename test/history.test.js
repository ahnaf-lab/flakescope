import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupByTest, readHistory } from '../src/history.js';
import { rankFlakiness } from '../src/score.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sample-history.jsonl');

test('groupByTest groups records by test name, preserving run order', () => {
  const grouped = groupByTest([
    { test: 'a', passed: true },
    { test: 'b', passed: false },
    { test: 'a', passed: false },
  ]);

  assert.deepEqual(grouped.get('a'), [true, false]);
  assert.deepEqual(grouped.get('b'), [false]);
  assert.equal(grouped.size, 2);
});

test('groupByTest skips malformed records instead of throwing', () => {
  const grouped = groupByTest([
    { test: 'a', passed: true },
    { passed: true },
    null,
    { test: '', passed: false },
  ]);
  assert.deepEqual([...grouped.keys()], ['a']);
});

test('readHistory rejects a missing logPath', async () => {
  await assert.rejects(() => readHistory(undefined));
});

test('readHistory parses the seeded fixture into per-test histories', async () => {
  const history = await readHistory(FIXTURE_PATH);

  assert.deepEqual(history.get('suite/always-pass.test.js'), Array(10).fill(true));
  assert.equal(history.get('suite/always-fail.test.js').length, 8);
  assert.equal(history.get('suite/rare-flake-small-n.test.js').length, 2);
});

test('fixture history ranks the established flake above the small-sample and one-off flakes', async () => {
  const history = await readHistory(FIXTURE_PATH);
  const ranked = rankFlakiness(history);
  const byTest = Object.fromEntries(ranked.map((r) => [r.test, r.score]));

  assert.ok(byTest['suite/truly-flaky.test.js'] > byTest['suite/rare-flake-small-n.test.js']);
  assert.ok(byTest['suite/rare-flake-small-n.test.js'] > byTest['suite/mostly-stable-one-flake.test.js']);
  assert.equal(byTest['suite/always-pass.test.js'], 0);
  assert.equal(byTest['suite/always-fail.test.js'], 0);
});
