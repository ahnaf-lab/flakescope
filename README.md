# flakescope

A daemon that reruns your test suite during idle CPU time, keeps a pass/fail
history for each run, and turns that history into a statistical flakiness
score per test instead of a naive fail-count.

The daemon core is a background loop that reruns a configured test command on
an interval, skips runs while the machine is busy, and appends a pass/fail
JSON record to a log file after every run.

On top of that, `src/score.js` and `src/history.js` compute a per-test
flakiness score from a JSONL history log using a Wilson score interval. A
naive score (fail count or fail rate) treats "failed once in two runs" the
same as "failed 50 times in 100 runs" — both read as 50%, but the second is
far better evidence. The Wilson lower bound accounts for sample size, so a
test with only a couple of observations gets a conservative (low) score until
more runs confirm the pattern. It also scores on *inconsistency*, not on
failure: a test that fails every single run is broken, not flaky, and scores
0 — the score is driven by the minority-outcome count (however many runs
disagreed with the majority), so only tests whose result actually flips rank
highly.

## Install

Requires Node.js 18 or later. No external dependencies.

```sh
git clone <this-repository-url>
cd flakescope
npm install
```

Optionally link the CLI onto your `PATH`:

```sh
npm link
```

## Usage

Run the daemon against your own test command:

```sh
flakescope --command "npm test" --interval 60000 --idle-threshold 0.5
```

Or, without linking, run it directly:

```sh
node bin/flakescope.js --command "npm test"
```

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--command, -c <cmd>` | *(required)* | Test command to run, e.g. `"npm test"`. Parsed into argv and spawned directly — never through a shell. |
| `--interval <ms>` | `60000` | How often to check whether to run. |
| `--idle-threshold <n>` | `0.5` | Max normalized load (`loadavg / cpuCount`) that still counts as idle. Runs are skipped above this. |
| `--log <path>` | `.flakescope/results.jsonl` | Where pass/fail records are appended, one JSON object per line. |
| `--max-runs <n>` | `0` (unlimited) | Stop after `n` runs. Mainly useful for scripting and testing. |
| `--no-idle-check` | off | Always run on the interval, ignoring system load. |
| `--timeout <ms>` | none | Kill the test command if it runs longer than this. |
| `--cwd <dir>` | current directory | Working directory the command runs in. |

Each log entry looks like:

```json
{"timestamp":"2026-08-24T00:00:00.000Z","command":"npm test","exitCode":0,"passed":true,"durationMs":842}
```

The daemon never shells out to arbitrary input: the command you pass is
tokenized locally and spawned with `shell: false`, so it only ever runs the
program you configured — nothing else touches the network or reads files
outside the working directory you specify.

### Flakiness scoring

Given a JSONL history log where each line is one per-test observation —
`{"test": "<name>", "passed": true|false, "timestamp": "..."}` — you can
compute a ranked flakiness score:

```js
import { readHistory } from './src/history.js';
import { rankFlakiness } from './src/score.js';

const history = await readHistory('.flakescope/history.jsonl');
const ranked = rankFlakiness(history);
// [{ test: 'suite/flaky.test.js', score: 0.237, runs: 10, passes: 5, failures: 5 }, ...]
```

`score` is the Wilson lower bound on how often the test's result disagreed
with its own majority outcome, so it rewards tests with a well-established
pattern of flipping and stays low for tests with too little history or a
single one-off failure. See `test/fixtures/sample-history.jsonl` for seeded
example data covering an always-passing, an always-failing, an established
50/50 flake, and two low-evidence cases.

### Report view

```sh
flakescope report --log .flakescope/history.jsonl
```

Reads the same per-test JSONL history log, ranks every test by flakiness
score (most flaky first), and prints a table with a sparkline of its recent
pass/fail pattern — `_` for a pass, `#` for a fail, oldest run on the left:

```
RANK  SCORE  RUNS  PASS  FAIL  SPARK       TEST
----  -----  ----  ----  ----  ----------  --------------------------
   1  0.237    10     5     5  _#_#_#_#_#  suite/truly-flaky.test.js
   2  0.000    10    10     0  __________  suite/always-pass.test.js
```

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--log <path>` | `.flakescope/history.jsonl` | Per-test JSONL history log to read. |
| `--limit <n>` | `20` | Max number of tests to show, `0` for all. |
| `--width <n>` | `30` | Max number of most-recent runs shown per sparkline. |
| `--json` | off | Print the ranked rows as JSON instead of a table. |

## Status

This project is built and shipped autonomously, gated on a passing test
suite before any change is kept.
