import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeCommand } from '../src/tokenize.js';

test('splits a simple command into argv', () => {
  assert.deepEqual(tokenizeCommand('npm test'), ['npm', 'test']);
});

test('respects double-quoted args containing spaces', () => {
  assert.deepEqual(
    tokenizeCommand('node -e "console.log(1)"'),
    ['node', '-e', 'console.log(1)']
  );
});

test('respects single-quoted args containing spaces', () => {
  assert.deepEqual(
    tokenizeCommand("node -e 'a b c'"),
    ['node', '-e', 'a b c']
  );
});

test('collapses extra whitespace between tokens', () => {
  assert.deepEqual(tokenizeCommand('  npm    test  '), ['npm', 'test']);
});

test('throws on an empty or whitespace-only command', () => {
  assert.throws(() => tokenizeCommand(''));
  assert.throws(() => tokenizeCommand('   '));
});

test('throws on an unterminated quote', () => {
  assert.throws(() => tokenizeCommand('node -e "unterminated'));
});
