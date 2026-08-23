import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCrossings, writeAlertSummary, checkThreshold } from '../src/alerts.js';
import { readHistory } from '../src/history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-history.jsonl');

async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'flakescope-alerts-'));
}

test('findCrossings returns only tests at or above the threshold, most flaky first', async () => {
  const history = await readHistory(FIXTURE);
  const crossings = findCrossings(history, 0.2);

  assert.ok(crossings.length > 0);
  assert.equal(crossings[0].test, 'suite/truly-flaky.test.js');
  for (const entry of crossings) {
    assert.ok(entry.score >= 0.2);
  }
  assert.ok(!crossings.some((entry) => entry.test === 'suite/always-pass.test.js'));
});

test('findCrossings returns an empty array when nothing crosses', async () => {
  const history = await readHistory(FIXTURE);
  const crossings = findCrossings(history, 0.999);
  assert.deepEqual(crossings, []);
});

test('findCrossings rejects a threshold outside [0, 1]', () => {
  assert.throws(() => findCrossings(new Map(), -0.1));
  assert.throws(() => findCrossings(new Map(), 1.1));
});

test('writeAlertSummary writes nothing when there are no crossings', async () => {
  const dir = await makeTempDir();
  try {
    const summaryPath = path.join(dir, 'alerts.json');
    const result = await writeAlertSummary(summaryPath, [], { threshold: 0.3 });

    assert.equal(result.written, false);
    await assert.rejects(() => stat(summaryPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeAlertSummary writes a JSON file listing crossings, creating parent dirs', async () => {
  const dir = await makeTempDir();
  try {
    const summaryPath = path.join(dir, 'nested', 'alerts.json');
    const crossings = [{ test: 'suite/truly-flaky.test.js', score: 0.4, runs: 10, passes: 5, failures: 5 }];
    const result = await writeAlertSummary(summaryPath, crossings, { threshold: 0.3 });

    assert.equal(result.written, true);
    const parsed = JSON.parse(await readFile(summaryPath, 'utf8'));
    assert.equal(parsed.threshold, 0.3);
    assert.equal(typeof parsed.generatedAt, 'string');
    assert.deepEqual(parsed.crossings, crossings);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkThreshold reads a history log and writes a summary only when a test crosses it', async () => {
  const dir = await makeTempDir();
  try {
    const lowResult = await checkThreshold(FIXTURE, path.join(dir, 'low.json'), 0.999);
    assert.equal(lowResult.written, false);

    const highResult = await checkThreshold(FIXTURE, path.join(dir, 'high.json'), 0.1);
    assert.equal(highResult.written, true);
    assert.ok(highResult.crossings.some((entry) => entry.test === 'suite/truly-flaky.test.js'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
