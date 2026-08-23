// Report view: renders the ranked flakiness scores from a history log as a
// terminal table with a per-test sparkline, sorted from most to least flaky.
//
// The table is built as plain text (no ANSI colour, no external table
// library) so its output is deterministic and safe to golden-file test.

import { readHistory } from './history.js';
import { rankFlakiness } from './score.js';

const SPARK_PASS = '_';
const SPARK_FAIL = '#';

const COLUMNS = ['RANK', 'SCORE', 'RUNS', 'PASS', 'FAIL', 'SPARK', 'TEST'];

/**
 * Renders a run history as a fixed-width sparkline: one character per run,
 * oldest to newest, using a distinct glyph for pass vs fail so the shape of
 * a test's recent behaviour is visible at a glance. Only the most recent
 * `width` runs are shown, since a per-test row has limited terminal space.
 *
 * @param {boolean[]} results - chronological pass/fail outcomes
 * @param {number} [width] - max number of runs to render
 * @returns {string}
 */
export function sparkline(results, width = 30) {
  if (!Array.isArray(results) || results.length === 0) return '';
  if (!Number.isFinite(width) || width <= 0) return '';

  const slice = results.length > width ? results.slice(-width) : results;
  return slice.map((passed) => (passed ? SPARK_PASS : SPARK_FAIL)).join('');
}

/**
 * Reads a per-test JSONL history log and produces ranked report rows, each
 * augmented with the sparkline rendering of that test's own history.
 *
 * @param {string} logPath
 * @param {{limit?: number, sparkWidth?: number, z?: number}} [options]
 * @returns {Promise<Array<{test: string, score: number, runs: number, passes: number, failures: number, spark: string}>>}
 */
export async function buildReport(logPath, options = {}) {
  const { limit = 20, sparkWidth = 30, z } = options;

  const history = await readHistory(logPath);
  const ranked = rankFlakiness(history, z);
  const top = limit > 0 ? ranked.slice(0, limit) : ranked;

  return top.map((entry) => ({
    ...entry,
    spark: sparkline(history.get(entry.test) ?? [], sparkWidth),
  }));
}

function formatScore(score) {
  return score.toFixed(3);
}

/**
 * Renders report rows (as produced by buildReport) into an aligned plain
 * text table. Column widths are derived from the widest cell in each column
 * so the table stays readable regardless of test-name length.
 *
 * @param {Array<{test: string, score: number, runs: number, passes: number, failures: number, spark: string}>} rows
 * @returns {string}
 */
export function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'No test history found.';
  }

  const cells = rows.map((row, index) => [
    String(index + 1),
    formatScore(row.score),
    String(row.runs),
    String(row.passes),
    String(row.failures),
    row.spark,
    row.test,
  ]);

  const widths = COLUMNS.map((header, col) =>
    Math.max(header.length, ...cells.map((row) => row[col].length)),
  );

  const numericCol = [true, true, true, true, true, false, false];

  const formatRow = (row) =>
    row
      .map((cell, col) => (numericCol[col] ? cell.padStart(widths[col]) : cell.padEnd(widths[col])))
      .join('  ')
      .trimEnd();

  const header = formatRow(COLUMNS);
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = cells.map(formatRow);

  return [header, separator, ...body].join('\n');
}
