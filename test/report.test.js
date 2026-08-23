import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sparkline, buildReport, renderTable } from '../src/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-history.jsonl');

test('sparkline renders one glyph per run, pass and fail distinct', () => {
  const spark = sparkline([true, false, true]);
  assert.equal(spark.length, 3);
  assert.notEqual(spark[0], spark[1]);
  assert.equal(spark[0], spark[2]);
});

test('sparkline is empty for empty or missing history', () => {
  assert.equal(sparkline([]), '');
  assert.equal(sparkline(undefined), '');
});

test('sparkline keeps only the most recent `width` runs', () => {
  const results = Array.from({ length: 50 }, (_, i) => i % 2 === 0);
  const spark = sparkline(results, 10);
  assert.equal(spark.length, 10);

  const expected = sparkline(results.slice(-10), 50);
  assert.equal(spark, expected);
});

test('buildReport ranks the seeded fixture with the true flake first', async () => {
  const rows = await buildReport(FIXTURE);

  assert.equal(rows[0].test, 'suite/truly-flaky.test.js');
  assert.ok(rows[0].score > 0);

  const alwaysPass = rows.find((r) => r.test === 'suite/always-pass.test.js');
  const alwaysFail = rows.find((r) => r.test === 'suite/always-fail.test.js');
  assert.equal(alwaysPass.score, 0);
  assert.equal(alwaysFail.score, 0);

  // scores must be non-increasing down the ranked list
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].score >= rows[i].score);
  }
});

test('buildReport attaches a sparkline matching each test own history length', async () => {
  const rows = await buildReport(FIXTURE, { sparkWidth: 100 });
  const alwaysFail = rows.find((r) => r.test === 'suite/always-fail.test.js');
  assert.equal(alwaysFail.spark.length, alwaysFail.runs);
});

test('buildReport respects the limit option', async () => {
  const rows = await buildReport(FIXTURE, { limit: 2 });
  assert.equal(rows.length, 2);
});

test('renderTable prints a header and one row per test, most flaky first', () => {
  const table = renderTable([
    { test: 'a', score: 0.4, runs: 10, passes: 5, failures: 5, spark: '_#_#' },
    { test: 'b', score: 0.1, runs: 4, passes: 3, failures: 1, spark: '__#_' },
  ]);

  const lines = table.split('\n');
  assert.match(lines[0], /TEST/);
  assert.match(lines[0], /SCORE/);
  const aLine = lines.findIndex((l) => l.includes('a') && l.includes('0.400'));
  const bLine = lines.findIndex((l) => l.includes('b') && l.includes('0.100'));
  assert.ok(aLine > 0 && bLine > 0 && aLine < bLine);
});

test('renderTable reports an empty history without throwing', () => {
  assert.equal(renderTable([]), 'No test history found.');
});
