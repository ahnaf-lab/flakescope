# flakescope

A daemon that reruns your test suite during idle CPU time, keeps a pass/fail
history for each run, and (in a later milestone) turns that history into a
statistical flakiness score instead of a naive fail-count.

This milestone ships the daemon core: a background loop that reruns a
configured test command on an interval, skips runs while the machine is busy,
and appends a pass/fail JSON record to a log file after every run.

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

## Status

This project is built and shipped autonomously, gated on a passing test
suite before any change is kept.
