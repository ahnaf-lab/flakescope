#!/usr/bin/env node
import path from 'node:path';
import { tokenizeCommand } from '../src/tokenize.js';
import { Daemon } from '../src/daemon.js';
import { buildReport, renderTable } from '../src/report.js';

const DEFAULT_LOG_PATH = path.join('.flakescope', 'results.jsonl');
const DEFAULT_HISTORY_PATH = path.join('.flakescope', 'history.jsonl');

function parseArgs(argv) {
  const opts = {
    command: null,
    interval: 60_000,
    idleThreshold: 0.5,
    logPath: DEFAULT_LOG_PATH,
    maxRuns: 0,
    checkIdle: true,
    timeoutMs: undefined,
    cwd: process.cwd(),
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--command':
      case '-c':
        opts.command = argv[++i];
        break;
      case '--interval':
        opts.interval = Number(argv[++i]);
        break;
      case '--idle-threshold':
        opts.idleThreshold = Number(argv[++i]);
        break;
      case '--log':
        opts.logPath = argv[++i];
        break;
      case '--max-runs':
        opts.maxRuns = Number(argv[++i]);
        break;
      case '--no-idle-check':
        opts.checkIdle = false;
        break;
      case '--timeout':
        opts.timeoutMs = Number(argv[++i]);
        break;
      case '--cwd':
        opts.cwd = argv[++i];
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`flakescope - rerun a test command during idle CPU time and log pass/fail history

Usage:
  flakescope --command "<test command>" [options]

Options:
  --command, -c <cmd>     test command to run, e.g. "npm test" (required)
  --interval <ms>         how often to check whether to run (default 60000)
  --idle-threshold <n>    max normalized load (loadavg / cpu count) that
                          still counts as idle (default 0.5)
  --log <path>            path to the JSONL results log
                          (default .flakescope/results.jsonl)
  --max-runs <n>          stop after n runs, 0 = run forever (default 0)
  --no-idle-check         always run on interval, ignoring system load
  --timeout <ms>          kill the test command if it exceeds this duration
  --cwd <dir>             working directory to run the command in
  --help, -h              show this help
`);
}

function parseReportArgs(argv) {
  const opts = {
    logPath: DEFAULT_HISTORY_PATH,
    limit: 20,
    sparkWidth: 30,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--log':
        opts.logPath = argv[++i];
        break;
      case '--limit':
        opts.limit = Number(argv[++i]);
        break;
      case '--width':
        opts.sparkWidth = Number(argv[++i]);
        break;
      case '--json':
        opts.json = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return opts;
}

function printReportHelp() {
  console.log(`flakescope report - show the flakiest tests as a table with sparklines

Usage:
  flakescope report [options]

Options:
  --log <path>    path to the per-test JSONL history log
                  (default .flakescope/history.jsonl)
  --limit <n>     max number of tests to show, 0 = all (default 20)
  --width <n>     max number of runs shown per sparkline (default 30)
  --json          print the ranked rows as JSON instead of a table
  --help, -h      show this help
`);
}

async function runReport(argv) {
  const opts = parseReportArgs(argv);

  if (opts.help) {
    printReportHelp();
    return;
  }

  let rows;
  try {
    rows = await buildReport(opts.logPath, { limit: opts.limit, sparkWidth: opts.sparkWidth });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`[flakescope] no history log found at ${opts.logPath}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(renderTable(rows));
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);

  if (sub === 'report') {
    return runReport(rest);
  }

  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.command) {
    printHelp();
    if (!opts.help) process.exitCode = 1;
    return;
  }

  const argv = tokenizeCommand(opts.command);

  const daemon = new Daemon({
    command: argv,
    interval: opts.interval,
    idleThreshold: opts.idleThreshold,
    logPath: opts.logPath,
    maxRuns: opts.maxRuns,
    checkIdle: opts.checkIdle,
    timeoutMs: opts.timeoutMs,
    cwd: opts.cwd,
  });

  daemon.on('run', (record) => {
    const status = record.passed ? 'PASS' : 'FAIL';
    console.log(`[flakescope] ${status} (exit ${record.exitCode}, ${record.durationMs}ms)`);
  });
  daemon.on('skip', (info) => {
    const load = typeof info.loadavg === 'number' ? info.loadavg.toFixed(2) : 'n/a';
    console.log(`[flakescope] skipped run, system busy (loadavg ${load})`);
  });
  daemon.on('error', (err) => {
    console.error(`[flakescope] tick error: ${err.message}`);
  });
  daemon.on('stop', () => {
    console.log('[flakescope] stopped');
  });

  process.on('SIGINT', () => daemon.stop());
  process.on('SIGTERM', () => daemon.stop());

  daemon.start();
}

main().catch((err) => {
  console.error(`[flakescope] fatal: ${err.message}`);
  process.exitCode = 1;
});
