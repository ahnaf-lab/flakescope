import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, runFixtureSuite, generateFixtureHistory, toJsonl } from '../src/fixtures.js';

test('createRng produces the same sequence for the same seed', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('createRng produces different sequences for different seeds', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test('createRng stays within [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('createRng rejects a non-integer seed', () => {
  assert.throws(() => createRng(1.5), TypeError);
});

test('runFixtureSuite draws one outcome per test, in declaration order', () => {
  const rng = createRng(5);
  const outcomes = runFixtureSuite(
    [
      { name: 'a', pFail: 0 },
      { name: 'b', pFail: 1 },
    ],
    rng,
  );
  assert.deepEqual(
    outcomes.map((o) => o.test),
    ['a', 'b'],
  );
  assert.equal(outcomes[0].passed, true, 'pFail 0 must always pass');
  assert.equal(outcomes[1].passed, false, 'pFail 1 must always fail');
});

test('generateFixtureHistory rejects invalid input', () => {
  assert.throws(() => generateFixtureHistory([], 5, 1), TypeError);
  assert.throws(() => generateFixtureHistory([{ name: 'a', pFail: 0 }], 0, 1), TypeError);
  assert.throws(() => generateFixtureHistory([{ name: 'a', pFail: 2 }], 5, 1), TypeError);
});

test('generateFixtureHistory is deterministic for a fixed seed', () => {
  const tests = [
    { name: 'suite/a.test.js', pFail: 0.3 },
    { name: 'suite/b.test.js', pFail: 0.7 },
  ];
  const first = generateFixtureHistory(tests, 50, 12345);
  const second = generateFixtureHistory(tests, 50, 12345);
  assert.deepEqual(first, second);
  assert.equal(toJsonl(first), toJsonl(second));
});

test('generateFixtureHistory diverges for a different seed', () => {
  const tests = [{ name: 'suite/a.test.js', pFail: 0.5 }];
  const a = generateFixtureHistory(tests, 100, 1);
  const b = generateFixtureHistory(tests, 100, 2);
  assert.notDeepEqual(
    a.map((r) => r.passed),
    b.map((r) => r.passed),
  );
});

test('generateFixtureHistory produces one record per test per run, timestamps in run order', () => {
  const tests = [
    { name: 'a', pFail: 0 },
    { name: 'b', pFail: 0 },
  ];
  const records = generateFixtureHistory(tests, 3, 1, { startTime: '2026-08-01T00:00:00.000Z' });
  assert.equal(records.length, 6);

  const timestamps = records.map((r) => r.timestamp);
  const sorted = [...timestamps].sort();
  assert.deepEqual(timestamps, sorted, 'records must already be in chronological order');
  assert.equal(timestamps[0], '2026-08-01T00:00:00.000Z');
  assert.equal(timestamps[2], '2026-08-01T00:00:01.000Z');
});

test('toJsonl renders one JSON object per line with a trailing newline', () => {
  const text = toJsonl([{ test: 'a', passed: true }]);
  assert.equal(text, '{"test":"a","passed":true}\n');
  assert.throws(() => toJsonl('not an array'), TypeError);
});
