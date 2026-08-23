import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, DEFAULT_THRESHOLD } from '../src/config.js';

async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'flakescope-config-'));
}

test('loadConfig returns the default threshold when no path is given', async () => {
  const config = await loadConfig();
  assert.equal(config.threshold, DEFAULT_THRESHOLD);
});

test('loadConfig returns the default threshold when the file does not exist', async () => {
  const dir = await makeTempDir();
  try {
    const config = await loadConfig(path.join(dir, 'missing.json'));
    assert.equal(config.threshold, DEFAULT_THRESHOLD);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadConfig reads a threshold from a real config file', async () => {
  const dir = await makeTempDir();
  try {
    const configPath = path.join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({ threshold: 0.6 }), 'utf8');
    const config = await loadConfig(configPath);
    assert.equal(config.threshold, 0.6);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadConfig rejects malformed JSON instead of silently using defaults', async () => {
  const dir = await makeTempDir();
  try {
    const configPath = path.join(dir, 'config.json');
    await writeFile(configPath, '{ not json', 'utf8');
    await assert.rejects(() => loadConfig(configPath), /invalid JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadConfig rejects a threshold outside [0, 1]', async () => {
  const dir = await makeTempDir();
  try {
    const configPath = path.join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({ threshold: 1.5 }), 'utf8');
    await assert.rejects(() => loadConfig(configPath), /between 0 and 1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
