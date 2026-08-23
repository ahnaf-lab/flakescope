import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'flakescope.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-history.jsonl');

async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'flakescope-cli-alert-'));
}

test('flakescope alert writes a summary file when a test crosses the threshold', async () => {
  const dir = await makeTempDir();
  try {
    const outPath = path.join(dir, 'alerts.json');
    const { stdout } = await execFileAsync('node', [
      BIN,
      'alert',
      '--log',
      FIXTURE,
      '--out',
      outPath,
      '--threshold',
      '0.1',
    ]);

    assert.match(stdout, /wrote/);
    const summary = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(summary.threshold, 0.1);
    assert.ok(summary.crossings.some((entry) => entry.test === 'suite/truly-flaky.test.js'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('flakescope alert writes no file when nothing crosses the threshold', async () => {
  const dir = await makeTempDir();
  try {
    const outPath = path.join(dir, 'alerts.json');
    const { stdout } = await execFileAsync('node', [
      BIN,
      'alert',
      '--log',
      FIXTURE,
      '--out',
      outPath,
      '--threshold',
      '0.999',
    ]);

    assert.match(stdout, /no test crossed/);
    await assert.rejects(() => stat(outPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('flakescope alert reads the threshold from a config file', async () => {
  const dir = await makeTempDir();
  try {
    const configPath = path.join(dir, 'config.json');
    const outPath = path.join(dir, 'alerts.json');
    await writeFile(configPath, JSON.stringify({ threshold: 0.1 }), 'utf8');

    await execFileAsync('node', [BIN, 'alert', '--log', FIXTURE, '--config', configPath, '--out', outPath]);

    const summary = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(summary.threshold, 0.1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('flakescope alert exits with an error for a missing log', async () => {
  await assert.rejects(
    execFileAsync('node', [
      BIN,
      'alert',
      '--log',
      path.join(__dirname, 'fixtures', 'does-not-exist.jsonl'),
    ]),
    /Command failed/,
  );
});
