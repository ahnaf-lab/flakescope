// Reads the per-test run history that the flakiness score is computed from.
//
// Each line of the log is one JSON record for one test observed in one run:
// {"test": "<name>", "passed": true|false, "timestamp": "<ISO date>"}
// Grouping preserves the order records appear in the file, which is the
// chronological run order the daemon appends in.

import { readFile } from 'node:fs/promises';

/**
 * Groups a flat list of per-test result records into a history map keyed by
 * test name, each holding a chronological array of pass/fail booleans.
 *
 * @param {Array<{test: string, passed: boolean}>} records
 * @returns {Map<string, boolean[]>}
 */
export function groupByTest(records) {
  const byTest = new Map();
  for (const record of records) {
    if (!record || typeof record.test !== 'string' || !record.test) continue;
    if (!byTest.has(record.test)) {
      byTest.set(record.test, []);
    }
    byTest.get(record.test).push(Boolean(record.passed));
  }
  return byTest;
}

/**
 * Reads a JSONL run history log and groups it by test name. Blank lines are
 * skipped; a line that fails to parse as JSON throws, since a silently
 * dropped record would understate a test's flakiness.
 *
 * @param {string} logPath
 * @returns {Promise<Map<string, boolean[]>>}
 */
export async function readHistory(logPath) {
  if (!logPath) {
    throw new TypeError('logPath is required');
  }

  const content = await readFile(logPath, 'utf8');
  const records = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`invalid JSON on line ${index + 1} of ${logPath}: ${err.message}`);
      }
    });

  return groupByTest(records);
}
