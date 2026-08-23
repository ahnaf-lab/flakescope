import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Daemon } from '../src/daemon.js';

async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'flakescope-daemon-'));
}

test('daemon runs the command on each tick and stops after maxRuns', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = path.join(dir, 'results.jsonl');
    const daemon = new Daemon({
      command: ['node', '-e', 'process.exit(0)'],
      interval: 10,
      checkIdle: false,
      logPath,
      maxRuns: 2,
    });

    const runs = [];
    await new Promise((resolve, reject) => {
      daemon.on('run', (record) => runs.push(record));
      daemon.on('stop', resolve);
      daemon.on('error', reject);
      daemon.start();
    });

    assert.equal(runs.length, 2);
    assert.equal(daemon.runCount, 2);

    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 2);
    for (const line of lines) {
      const record = JSON.parse(line);
      assert.equal(record.passed, true);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('daemon logs failing runs with passed=false', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = path.join(dir, 'results.jsonl');
    const daemon = new Daemon({
      command: ['node', '-e', 'process.exit(1)'],
      interval: 10,
      checkIdle: false,
      logPath,
      maxRuns: 1,
    });

    const record = await new Promise((resolve, reject) => {
      daemon.on('run', resolve);
      daemon.on('error', reject);
      daemon.start();
    });

    assert.equal(record.passed, false);
    assert.equal(record.exitCode, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('daemon skips ticks and does not log when the system is treated as busy', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = path.join(dir, 'results.jsonl');
    const daemon = new Daemon({
      command: ['node', '-e', 'process.exit(0)'],
      interval: 10,
      checkIdle: true,
      idleThreshold: -1, // normalized load is never below -1, so never idle
      logPath,
      maxRuns: 1,
    });

    const skip = await new Promise((resolve, reject) => {
      daemon.on('skip', (info) => {
        daemon.stop();
        resolve(info);
      });
      daemon.on('run', () => reject(new Error('should not have run')));
      daemon.start();
    });

    assert.equal(skip.reason, 'busy');
    await assert.rejects(() => readFile(logPath, 'utf8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('daemon constructor requires a non-empty command and a logPath', () => {
  assert.throws(() => new Daemon({ command: [], logPath: 'x.jsonl' }));
  assert.throws(() => new Daemon({ command: ['npm', 'test'] }));
});

test('stop() before start() does not emit stop', () => {
  const daemon = new Daemon({ command: ['npm', 'test'], logPath: 'x.jsonl' });
  let stopped = false;
  daemon.on('stop', () => {
    stopped = true;
  });
  daemon.stop();
  assert.equal(stopped, false);
});
