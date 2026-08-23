// Loads the config file that drives threshold alerts. A missing file is not
// an error — it just means "use the defaults" — but a config file that
// exists and fails to parse, or holds an out-of-range threshold, throws
// rather than silently falling back, since silently ignoring a bad config
// would make alerts stop firing without any indication why.

import { readFile } from 'node:fs/promises';

export const DEFAULT_THRESHOLD = 0.3;

/**
 * @param {string} [configPath] - path to a JSON config file. If omitted, or
 *   if no file exists at the path, the defaults are returned unchanged.
 * @returns {Promise<{threshold: number}>}
 */
export async function loadConfig(configPath) {
  if (!configPath) {
    return { threshold: DEFAULT_THRESHOLD };
  }

  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { threshold: DEFAULT_THRESHOLD };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in config file ${configPath}: ${err.message}`);
  }

  const threshold = parsed.threshold ?? DEFAULT_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(
      `config threshold must be a number between 0 and 1, got: ${JSON.stringify(parsed.threshold)}`,
    );
  }

  return { ...parsed, threshold };
}
