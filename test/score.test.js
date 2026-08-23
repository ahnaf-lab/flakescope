import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wilsonLowerBound, scoreTest, rankFlakiness } from '../src/score.js';

test('wilsonLowerBound is 0 with no trials', () => {
  assert.equal(wilsonLowerBound(0, 0), 0);
});

test('wilsonLowerBound stays low for a single observation despite a 100% rate', () => {
  // One success out of one trial is 100% naively, but there is no evidence
  // yet — the confidence-adjusted bound should be far below 1.
  const bound = wilsonLowerBound(1, 1);
  assert.ok(bound < 0.5, `expected a conservative bound, got ${bound}`);
});

test('wilsonLowerBound approaches the raw rate as sample size grows', () => {
  const small = wilsonLowerBound(50, 100);
  const large = wilsonLowerBound(5000, 10000);
  assert.ok(large > small, 'more evidence at the same rate should raise the lower bound');
});

test('scoreTest gives a consistently passing test a score of 0', () => {
  const result = scoreTest(Array(10).fill(true));
  assert.equal(result.score, 0);
  assert.equal(result.runs, 10);
  assert.equal(result.passes, 10);
  assert.equal(result.failures, 0);
});

test('scoreTest gives a consistently failing test a score of 0 (broken, not flaky)', () => {
  const result = scoreTest(Array(8).fill(false));
  assert.equal(result.score, 0);
  assert.equal(result.failures, 8);
});

test('scoreTest gives an alternating pass/fail test a high score', () => {
  const alternating = Array.from({ length: 10 }, (_, i) => i % 2 === 0);
  const result = scoreTest(alternating);
  assert.equal(result.passes, 5);
  assert.equal(result.failures, 5);
  assert.ok(result.score > 0.2, `expected a high flakiness score, got ${result.score}`);
});

test('scoreTest handles an empty history', () => {
  const result = scoreTest([]);
  assert.deepEqual(result, { score: 0, runs: 0, passes: 0, failures: 0 });
});

test('Wilson correction scores a one-off flip in a short history lower than an established 50/50 flake', () => {
  // Both have a naive 50% "disagreement rate", but two runs is far weaker
  // evidence than ten — the score must reflect that difference.
  const shortHistory = scoreTest([true, false]);
  const longHistory = scoreTest(Array.from({ length: 10 }, (_, i) => i % 2 === 0));

  assert.ok(
    shortHistory.score < longHistory.score,
    `expected small-sample score (${shortHistory.score}) < established score (${longHistory.score})`,
  );
});

test('a single flake in a long, mostly stable run scores lower than an established flake', () => {
  const mostlyStable = Array(20).fill(true);
  mostlyStable[3] = false;
  const oneOff = scoreTest(mostlyStable);
  const established = scoreTest(Array.from({ length: 10 }, (_, i) => i % 2 === 0));

  assert.ok(oneOff.score < established.score);
  assert.ok(oneOff.score > 0, 'a single disagreement should still register above 0');
});

test('rankFlakiness sorts tests from most to least flaky', () => {
  const ranked = rankFlakiness({
    steady: Array(10).fill(true),
    flaky: Array.from({ length: 10 }, (_, i) => i % 2 === 0),
    broken: Array(10).fill(false),
  });

  assert.equal(ranked[0].test, 'flaky');
  assert.ok(ranked[0].score > 0);
  const remainingScores = ranked.slice(1).map((r) => r.score);
  assert.ok(remainingScores.every((s) => s === 0));
});

test('rankFlakiness accepts a Map as well as a plain object', () => {
  const map = new Map([
    ['a', [true, true]],
    ['b', [true, false, true, false]],
  ]);
  const ranked = rankFlakiness(map);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].test, 'b');
});
