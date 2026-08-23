import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'flakescope.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-history.jsonl');

test('flakescope report prints a table sorted by flakiness score', async () => {
  const { stdout } = await execFileAsync('node', [BIN, 'report', '--log', FIXTURE]);
  const lines = stdout.trim().split('\n');

  assert.match(lines[0], /TEST/);
  const flakyLine = lines.find((l) => l.includes('suite/truly-flaky.test.js'));
  const passLine = lines.find((l) => l.includes('suite/always-pass.test.js'));
  assert.ok(flakyLine && passLine);
  assert.ok(lines.indexOf(flakyLine) < lines.indexOf(passLine));
});

test('flakescope report --json prints ranked rows as JSON', async () => {
  const { stdout } = await execFileAsync('node', [BIN, 'report', '--log', FIXTURE, '--json']);
  const rows = JSON.parse(stdout);
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length > 0);
  assert.equal(rows[0].test, 'suite/truly-flaky.test.js');
});

test('flakescope report exits with an error for a missing log', async () => {
  await assert.rejects(
    execFileAsync('node', [BIN, 'report', '--log', path.join(__dirname, 'fixtures', 'does-not-exist.jsonl')]),
    /Command failed/,
  );
});
