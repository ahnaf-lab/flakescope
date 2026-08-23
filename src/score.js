// Flakiness scoring.
//
// A naive score (just the fail count or fail rate) treats "failed once in two
// runs" the same as "failed 50 times in 100 runs" — both read as 50%. Those
// are not the same claim: the second is well-established, the first could be
// a coin flip. The Wilson score interval accounts for sample size, so a test
// with few observations gets a conservative (lower) score until more runs
// confirm the pattern.
//
// Flakiness itself is defined as *inconsistency*, not failure: a test that
// fails every single time is broken, not flaky, and scores 0 here. A test
// whose result flips between pass and fail is what this score is meant to
// surface, so the input to the Wilson interval is the minority-outcome count
// (however many runs disagreed with the majority), not the raw fail count.

const DEFAULT_Z = 1.96; // ~95% confidence

/**
 * Lower bound of the Wilson score confidence interval for a binomial
 * proportion. Used here as a confidence-adjusted rate: with few
 * observations, the bound sits close to 0 even if the observed rate is
 * high, because there is not yet enough evidence to be confident in it.
 *
 * @param {number} successes - count of the outcome being measured
 * @param {number} total - total number of trials
 * @param {number} [z] - confidence z-score (default ~95%)
 * @returns {number} a value in [0, 1]
 */
export function wilsonLowerBound(successes, total, z = DEFAULT_Z) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(successes) || successes < 0) return 0;

  const n = total;
  const phat = Math.min(successes, n) / n;
  const z2 = z * z;

  const denominator = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);

  const lower = (centre - margin) / denominator;
  return Math.max(0, Math.min(1, lower));
}

/**
 * Computes a flakiness score for a single test from its chronological
 * pass/fail history.
 *
 * @param {boolean[]} results - pass/fail outcomes in run order
 * @param {number} [z] - confidence z-score, forwarded to wilsonLowerBound
 * @returns {{score: number, runs: number, passes: number, failures: number}}
 */
export function scoreTest(results, z = DEFAULT_Z) {
  if (!Array.isArray(results) || results.length === 0) {
    return { score: 0, runs: 0, passes: 0, failures: 0 };
  }

  const runs = results.length;
  const passes = results.filter(Boolean).length;
  const failures = runs - passes;
  const minority = Math.min(passes, failures);

  return { score: wilsonLowerBound(minority, runs, z), runs, passes, failures };
}

/**
 * Scores every test in a history map and returns them ranked from most to
 * least flaky.
 *
 * @param {Map<string, boolean[]>|Record<string, boolean[]>} historyByTest
 * @param {number} [z]
 * @returns {Array<{test: string, score: number, runs: number, passes: number, failures: number}>}
 */
export function rankFlakiness(historyByTest, z = DEFAULT_Z) {
  const entries =
    historyByTest instanceof Map
      ? historyByTest.entries()
      : Object.entries(historyByTest ?? {});

  const ranked = [];
  for (const [test, results] of entries) {
    ranked.push({ test, ...scoreTest(results, z) });
  }

  ranked.sort((a, b) => b.score - a.score || a.test.localeCompare(b.test));
  return ranked;
}
