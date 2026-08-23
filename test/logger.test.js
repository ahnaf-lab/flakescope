import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendResult } from '../src/logger.js';

async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'flakescope-logger-'));
}

test('appendResult writes a timestamped JSON line, creating parent dirs', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = path.join(dir, 'nested', 'results.jsonl');
    const record = await appendResult(logPath, { passed: true, exitCode: 0 });

    assert.equal(typeof record.timestamp, 'string');
    assert.equal(record.passed, true);

    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 1);

    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.exitCode, 0);
    assert.equal(parsed.passed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('appendResult appends subsequent calls as additional lines', async () => {
  const dir = await makeTempDir();
  try {
    const logPath = path.join(dir, 'results.jsonl');
    await appendResult(logPath, { passed: true, exitCode: 0 });
    await appendResult(logPath, { passed: false, exitCode: 1 });

    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.passed, true);
    assert.equal(second.passed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('appendResult rejects a missing logPath', async () => {
  await assert.rejects(() => appendResult(undefined, { passed: true }));
});
