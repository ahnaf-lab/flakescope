// Pure helper for deciding whether the system counts as "idle" right now.
// Kept separate from the daemon so the decision logic can be tested without
// touching real OS load figures.

/**
 * @param {number} load1 - 1-minute load average (e.g. os.loadavg()[0]).
 * @param {number} cpuCount - number of logical CPUs (e.g. os.cpus().length).
 * @param {number} threshold - max normalized load (load1 / cpuCount) that
 *   still counts as idle.
 * @returns {boolean}
 */
export function isIdle(load1, cpuCount, threshold) {
  if (!Number.isFinite(cpuCount) || cpuCount <= 0) return false;
  if (!Number.isFinite(load1) || load1 < 0) return false;
  const normalized = load1 / cpuCount;
  return normalized <= threshold;
}
