import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateReadingProgress,
  calculateVisibleRingProgress,
} from '../src/lib/reading-progress.mjs';

const near = (actual, expected, tolerance = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test('reading progress spans from the reading line to the maximum reachable article position', () => {
  const geometry = {
    contentTop: 300,
    contentBottom: 3300,
    viewportHeight: 800,
    topOffset: 100,
    maximumViewportTop: 2700,
  };

  assert.equal(calculateReadingProgress({ ...geometry, viewportTop: 200 }), 0);
  assert.equal(calculateReadingProgress({ ...geometry, viewportTop: 2700 }), 1);
  near(calculateReadingProgress({ ...geometry, viewportTop: 1450 }), 0.5);
});

test('progress is not complete when the article bottom merely enters the viewport', () => {
  const geometry = {
    contentTop: 300,
    contentBottom: 3300,
    viewportTop: 2500,
    viewportHeight: 800,
    topOffset: 100,
    maximumViewportTop: 2700,
  };

  const progress = calculateReadingProgress(geometry);
  near(progress, 2300 / 2500);
  assert.ok(progress < 1);
});

test('an incomplete ring keeps a visible opening until true completion', () => {
  assert.equal(calculateVisibleRingProgress(0.5), 0.5);
  assert.equal(calculateVisibleRingProgress(0.9926), 0.98);
  assert.equal(calculateVisibleRingProgress(1), 1);
  assert.equal(calculateVisibleRingProgress(Number.NaN), 0);
});

test('visual viewport page offset participates in progress independently of window scroll', () => {
  const progress = calculateReadingProgress({
    contentTop: 1000,
    contentBottom: 4000,
    viewportTop: 1450,
    viewportHeight: 700,
    topOffset: 100,
    maximumViewportTop: 3300,
  });

  near(progress, 550 / 2400);
});

test('progress completes at the article reading line when enough trailing space exists', () => {
  const progress = calculateReadingProgress({
    contentTop: 1000,
    contentBottom: 4000,
    viewportTop: 3900,
    viewportHeight: 700,
    topOffset: 100,
    maximumViewportTop: 5000,
  });

  assert.equal(progress, 1);
});

test('short content becomes complete once its bottom is visible', () => {
  const geometry = {
    contentTop: 300,
    contentBottom: 700,
    viewportHeight: 800,
    topOffset: 100,
    maximumViewportTop: 0,
  };

  assert.equal(calculateReadingProgress({ ...geometry, viewportTop: -200 }), 0);
  assert.equal(calculateReadingProgress({ ...geometry, viewportTop: 0 }), 1);
});

test('invalid geometry fails closed at zero progress', () => {
  assert.equal(calculateReadingProgress({
    contentTop: 100,
    contentBottom: 50,
    viewportTop: 0,
    viewportHeight: 800,
  }), 0);
});
