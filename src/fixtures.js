// Deterministic fixtures for validating the scoring pipeline end-to-end.
//
// A real flaky test only reveals its true behaviour over many runs, which
// makes the scoring math hard to check against real test suites - the
// ground truth (a test's actual failure probability) isn't known. This
// module generates synthetic per-test run history from a seeded
// pseudo-random generator instead: each fixture test declares its true
// failure probability, the generator flips a seeded coin that many times,
// and the resulting Wilson score can be checked against that known
// probability rather than a guess.
//
// The generator is deterministic - the same seed always produces the same
// sequence of outcomes - so a failing assertion reproduces exactly, and the
// fixtures double as a regression harness for src/score.js without needing
// to run a real (slow, non-reproducible) test suite thousands of times.

/**
 * mulberry32 - a small, fast, deterministic PRNG. Not cryptographic; good
 * enough for reproducible fixtures, and needs no dependency.
 *
 * @param {number} seed - any 32-bit integer
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function createRng(seed) {
  if (!Number.isInteger(seed)) {
    throw new TypeError('seed must be an integer');
  }

  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {{name: string, pFail: number}} FixtureTest
 *   `pFail` is the test's true, per-run failure probability in [0, 1] -
 *   the ground truth the generated history is checked against.
 */

function validateTests(tests) {
  if (!Array.isArray(tests) || tests.length === 0) {
    throw new TypeError('tests must be a non-empty array');
  }
  for (const t of tests) {
    if (!t || typeof t.name !== 'string' || !t.name) {
      throw new TypeError('every fixture test needs a non-empty name');
    }
    if (!Number.isFinite(t.pFail) || t.pFail < 0 || t.pFail > 1) {
      throw new TypeError(`fixture test "${t.name}" needs pFail in [0, 1]`);
    }
  }
}

/**
 * Simulates one run of a fake test suite: every declared test gets a
 * pass/fail outcome by drawing one number from the rng and comparing it to
 * the test's declared failure probability. Tests are drawn in declaration
 * order so a given seed always consumes the rng the same way.
 *
 * @param {FixtureTest[]} tests
 * @param {() => number} rng
 * @returns {Array<{test: string, passed: boolean}>}
 */
export function runFixtureSuite(tests, rng) {
  validateTests(tests);
  return tests.map((t) => ({ test: t.name, passed: rng() >= t.pFail }));
}

/**
 * Generates a full run history for a fake test suite: `runs` sequential
 * invocations, each producing one record per declared test, in the same
 * `{test, passed, timestamp}` shape src/history.js reads. Timestamps
 * advance one second per run starting at `startTime` so records sort the
 * same way real daemon-appended ones would.
 *
 * @param {FixtureTest[]} tests
 * @param {number} runs - number of simulated suite invocations
 * @param {number} seed - PRNG seed; the same seed always reproduces the
 *   same history
 * @param {{startTime?: Date|string|number}} [options]
 * @returns {Array<{test: string, passed: boolean, timestamp: string}>}
 */
export function generateFixtureHistory(tests, runs, seed, options = {}) {
  validateTests(tests);
  if (!Number.isInteger(runs) || runs <= 0) {
    throw new TypeError('runs must be a positive integer');
  }

  const rng = createRng(seed);
  const start = options.startTime !== undefined ? new Date(options.startTime).getTime() : 0;
  if (!Number.isFinite(start)) {
    throw new TypeError('startTime must be a valid date');
  }

  const records = [];
  for (let i = 0; i < runs; i++) {
    const timestamp = new Date(start + i * 1000).toISOString();
    for (const outcome of runFixtureSuite(tests, rng)) {
      records.push({ ...outcome, timestamp });
    }
  }

  return records;
}

/**
 * Renders fixture records as JSONL text, one record per line - the exact
 * format readHistory() parses, so generated fixtures can be written
 * straight to a log file and read back through the real pipeline.
 *
 * @param {Array<object>} records
 * @returns {string}
 */
export function toJsonl(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('records must be an array');
  }
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}
