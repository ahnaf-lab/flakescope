import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIdle } from '../src/idle.js';

test('isIdle is true when normalized load is at or below threshold', () => {
  assert.equal(isIdle(1, 4, 0.5), true); // 0.25 <= 0.5
  assert.equal(isIdle(2, 4, 0.5), true); // 0.5 <= 0.5
});

test('isIdle is false when normalized load exceeds threshold', () => {
  assert.equal(isIdle(4, 4, 0.5), false); // 1.0 > 0.5
});

test('isIdle treats a non-positive cpu count as never idle', () => {
  assert.equal(isIdle(0, 0, 0.5), false);
  assert.equal(isIdle(0, -1, 0.5), false);
});

test('isIdle rejects a negative or non-finite load average', () => {
  assert.equal(isIdle(-1, 4, 0.5), false);
  assert.equal(isIdle(NaN, 4, 0.5), false);
});
