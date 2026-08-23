import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Appends one JSON record per line (JSONL) to the given log file, creating
 * the parent directory if it does not exist yet. Each record is stamped
 * with the time it was written.
 *
 * @param {string} logPath
 * @param {object} result
 * @returns {Promise<object>} the record actually written, timestamp included
 */
export async function appendResult(logPath, result) {
  if (!logPath) {
    throw new TypeError('logPath is required');
  }

  const dir = path.dirname(logPath);
  if (dir && dir !== '.') {
    await mkdir(dir, { recursive: true });
  }

  const record = { timestamp: new Date().toISOString(), ...result };
  await appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}
