import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../src/runner.js';

test('runCommand reports passed=true on exit code 0', async () => {
  const result = await runCommand(['node', '-e', 'process.exit(0)']);
  assert.equal(result.exitCode, 0);
  assert.equal(result.passed, true);
});

test('runCommand reports passed=false on a nonzero exit code', async () => {
  const result = await runCommand(['node', '-e', 'process.exit(1)']);
  assert.equal(result.exitCode, 1);
  assert.equal(result.passed, false);
});

test('runCommand records a non-negative duration', async () => {
  const result = await runCommand(['node', '-e', 'process.exit(0)']);
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs >= 0);
});

test('runCommand captures stdout output', async () => {
  const result = await runCommand(['node', '-e', "console.log('hello-flakescope')"]);
  assert.ok(result.stdoutTail.includes('hello-flakescope'));
});

test('runCommand kills a command that exceeds the timeout', async () => {
  const result = await runCommand(['node', '-e', 'setTimeout(() => {}, 5000)'], {
    timeoutMs: 100,
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.passed, false);
});

test('runCommand resolves with an error for a non-existent executable', async () => {
  const result = await runCommand(['definitely-not-a-real-command-xyz']);
  assert.equal(result.passed, false);
  assert.ok(result.error);
});
