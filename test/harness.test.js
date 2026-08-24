// End-to-end harness: feeds deterministic, seeded fixture history through
// the real pipeline (readHistory -> rankFlakiness -> buildReport /
// checkThreshold) so the scoring math is validated against known ground
// truth rather than hand-picked history arrays. Every fixture test declares
// its true failure probability; because the generator is seeded, the exact
// numbers here are reproducible and the assertions can check the scoring
// behaviour the rest of the suite documents in isolation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateFixtureHistory, toJsonl } from '../src/fixtures.js';
import { readHistory } from '../src/history.js';
import { rankFlakiness, scoreTest } from '../src/score.js';
import { buildReport } from '../src/report.js';
import { checkThreshold, findCrossings } from '../src/alerts.js';

const SEED = 20260825;
const RUNS = 300;

const SUITE = [
  { name: 'suite/always-pass.test.js', pFail: 0 },
  { name: 'suite/always-fail.test.js', pFail: 1 },
  { name: 'suite/coin-flip.test.js', pFail: 0.5 },
  { name: 'suite/rare-flake.test.js', pFail: 0.05 },
];

async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'flakescope-harness-'));
}

async function writeFixtureLog(dir, tests, runs, seed) {
  const records = generateFixtureHistory(tests, runs, seed, {
    startTime: '2026-08-01T00:00:00.000Z',
  });
  const logPath = path.join(dir, 'history.jsonl');
  await writeFile(logPath, toJsonl(records), 'utf8');
  return logPath;
}

test('seeded fixture history scores a never-failing test at exactly 0', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = await writeFixtureLog(dir, SUITE, RUNS, SEED);
    const history = await readHistory(logPath);
    const ranked = rankFlakiness(history);
    const alwaysPass = ranked.find((r) => r.test === 'suite/always-pass.test.js');

    assert.equal(alwaysPass.score, 0);
    assert.equal(alwaysPass.failures, 0);
    assert.equal(alwaysPass.runs, RUNS);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('seeded fixture history scores a never-passing test at exactly 0 (broken, not flaky)', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = await writeFixtureLog(dir, SUITE, RUNS, SEED);
    const history = await readHistory(logPath);
    const ranked = rankFlakiness(history);
    const alwaysFail = ranked.find((r) => r.test === 'suite/always-fail.test.js');

    assert.equal(alwaysFail.score, 0);
    assert.equal(alwaysFail.passes, 0);
    assert.equal(alwaysFail.runs, RUNS);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an established 50/50 flake outranks a rare flake, and both outrank the broken tests', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = await writeFixtureLog(dir, SUITE, RUNS, SEED);
    const history = await readHistory(logPath);
    const ranked = rankFlakiness(history);
    const byTest = Object.fromEntries(ranked.map((r) => [r.test, r]));

    // With 300 runs the coin-flip test's minority outcome count is large
    // enough that its Wilson lower bound must sit well above 0 - this is
    // the scoring math's core claim, checked against a known true rate
    // rather than an eyeballed fixture array.
    assert.ok(byTest['suite/coin-flip.test.js'].score > 0.3, `coin-flip score too low: ${byTest['suite/coin-flip.test.js'].score}`);

    // A rare flake (~5% minority rate) still has genuine disagreement, so
    // it must score above the never-flipping tests, but below the
    // established 50/50 flake.
    assert.ok(byTest['suite/rare-flake.test.js'].score > 0);
    assert.ok(byTest['suite/rare-flake.test.js'].score < byTest['suite/coin-flip.test.js'].score);

    assert.equal(byTest['suite/always-pass.test.js'].score, 0);
    assert.equal(byTest['suite/always-fail.test.js'].score, 0);

    assert.deepEqual(
      ranked.map((r) => r.test),
      ['suite/coin-flip.test.js', 'suite/rare-flake.test.js', 'suite/always-fail.test.js', 'suite/always-pass.test.js'],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rankFlakiness on the fixture matches scoreTest applied to each series independently', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = await writeFixtureLog(dir, SUITE, RUNS, SEED);
    const history = await readHistory(logPath);
    const ranked = rankFlakiness(history);

    for (const entry of ranked) {
      const expected = scoreTest(history.get(entry.test));
      assert.deepEqual(entry, { test: entry.test, ...expected });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the same seed reproduces byte-identical scoring results across independent runs', async () => {
  const dirA = await makeTempDir();
  const dirB = await makeTempDir();
  try {
    const logA = await writeFixtureLog(dirA, SUITE, RUNS, SEED);
    const logB = await writeFixtureLog(dirB, SUITE, RUNS, SEED);

    const rankedA = rankFlakiness(await readHistory(logA));
    const rankedB = rankFlakiness(await readHistory(logB));

    assert.deepEqual(rankedA, rankedB);
  } finally {
    await rm(dirA, { recursive: true, force: true });
    await rm(dirB, { recursive: true, force: true });
  }
});

test('a different seed produces a materially different score for the same fixture suite', async () => {
  const dirA = await makeTempDir();
  const dirB = await makeTempDir();
  try {
    const logA = await writeFixtureLog(dirA, SUITE, RUNS, SEED);
    const logB = await writeFixtureLog(dirB, SUITE, RUNS, SEED + 1);

    const scoreA = rankFlakiness(await readHistory(logA)).find((r) => r.test === 'suite/coin-flip.test.js').score;
    const scoreB = rankFlakiness(await readHistory(logB)).find((r) => r.test === 'suite/coin-flip.test.js').score;

    assert.notEqual(scoreA, scoreB);
  } finally {
    await rm(dirA, { recursive: true, force: true });
    await rm(dirB, { recursive: true, force: true });
  }
});

test('buildReport renders the fixture in the same order rankFlakiness computed, with a bounded sparkline', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = await writeFixtureLog(dir, SUITE, RUNS, SEED);
    const history = await readHistory(logPath);
    const ranked = rankFlakiness(history);
    const rows = await buildReport(logPath, { limit: 0, sparkWidth: 10 });

    assert.deepEqual(
      rows.map((r) => r.test),
      ranked.map((r) => r.test),
    );
    for (const row of rows) {
      assert.equal(row.spark.length, 10);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkThreshold against the fixture writes exactly the crossings findCrossings computes', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = await writeFixtureLog(dir, SUITE, RUNS, SEED);
    const outPath = path.join(dir, 'alerts.json');
    const threshold = 0.3;

    const history = await readHistory(logPath);
    const expectedCrossings = findCrossings(history, threshold);

    const result = await checkThreshold(logPath, outPath, threshold);

    assert.equal(result.written, expectedCrossings.length > 0);
    assert.deepEqual(result.crossings, expectedCrossings);
    assert.ok(expectedCrossings.some((c) => c.test === 'suite/coin-flip.test.js'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
