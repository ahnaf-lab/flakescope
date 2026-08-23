// Threshold alerts: compares each test's flakiness score against a
// config-driven confidence threshold and writes a summary file listing only
// the tests that crossed it. The summary file is written only when at least
// one test crosses the threshold — a run where nothing crosses leaves no
// file behind, so the presence of the file is itself the signal, not just
// its contents.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readHistory } from './history.js';
import { rankFlakiness } from './score.js';

/**
 * Ranks every test's flakiness score and returns only the ones at or above
 * the threshold, most flaky first.
 *
 * @param {Map<string, boolean[]>|Record<string, boolean[]>} history
 * @param {number} threshold - minimum score (inclusive) to count as crossing
 * @param {number} [z] - confidence z-score, forwarded to rankFlakiness
 * @returns {Array<{test: string, score: number, runs: number, passes: number, failures: number}>}
 */
export function findCrossings(history, threshold, z) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new TypeError('threshold must be a number between 0 and 1');
  }
  return rankFlakiness(history, z).filter((entry) => entry.score >= threshold);
}

/**
 * Writes a JSON alert summary listing the tests that crossed the threshold.
 * Nothing is written when `crossings` is empty, so a clean run never leaves
 * a stale-looking empty file behind.
 *
 * @param {string} summaryPath
 * @param {Array<object>} crossings
 * @param {{threshold: number}} meta
 * @returns {Promise<{written: boolean, path: string, crossings: Array<object>}>}
 */
export async function writeAlertSummary(summaryPath, crossings, meta) {
  if (!summaryPath) {
    throw new TypeError('summaryPath is required');
  }
  if (!meta || !Number.isFinite(meta.threshold)) {
    throw new TypeError('meta.threshold is required');
  }

  if (!Array.isArray(crossings) || crossings.length === 0) {
    return { written: false, path: summaryPath, crossings: [] };
  }

  const dir = path.dirname(summaryPath);
  if (dir && dir !== '.') {
    await mkdir(dir, { recursive: true });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    threshold: meta.threshold,
    crossings,
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return { written: true, path: summaryPath, crossings };
}

/**
 * Reads a per-test history log, finds tests whose score crosses the given
 * threshold, and writes the summary file if any did. This is the operation
 * the `flakescope alert` command runs end to end.
 *
 * @param {string} logPath
 * @param {string} summaryPath
 * @param {number} threshold
 * @param {{z?: number}} [options]
 * @returns {Promise<{written: boolean, path: string, crossings: Array<object>}>}
 */
export async function checkThreshold(logPath, summaryPath, threshold, options = {}) {
  const history = await readHistory(logPath);
  const crossings = findCrossings(history, threshold, options.z);
  return writeAlertSummary(summaryPath, crossings, { threshold });
}
