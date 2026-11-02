const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DOM_DELTA_PIXEL,
  DOM_DELTA_LINE,
  DOM_DELTA_PAGE,
  normalizeHorizontalDelta,
  pixelsToSeconds,
  getSeekBounds,
  calculateSeekTime,
} = require("../src/content/wheel-normalizer.js");

test("normalizes WheelEvent units into bounded pixels", () => {
  assert.equal(normalizeHorizontalDelta(40, DOM_DELTA_PIXEL, 800), 40);
  assert.equal(normalizeHorizontalDelta(2, DOM_DELTA_LINE, 800), 32);
  assert.equal(normalizeHorizontalDelta(1, DOM_DELTA_PAGE, 800), 800);
  assert.equal(normalizeHorizontalDelta(2, DOM_DELTA_PAGE, 800), 1000);
  assert.equal(normalizeHorizontalDelta(Number.NaN, DOM_DELTA_PIXEL, 800), 0);
});

test("converts pixels to seconds with sensitivity and direction", () => {
  assert.equal(pixelsToSeconds(100, 5, false), 5);
  assert.equal(pixelsToSeconds(-20, 5, false), -1);
  assert.equal(pixelsToSeconds(100, 5, true), -5);
});

test("prefers the complete seekable range for DVR media", () => {
  const video = {
    duration: Infinity,
    seekable: {
      length: 2,
      start(index) {
        return [120, 300][index];
      },
      end(index) {
        return [240, 480][index];
      },
    },
  };

  assert.deepEqual(getSeekBounds(video), { minimum: 120, maximum: 480 });
});

test("falls back to finite media duration", () => {
  const video = { duration: 75, seekable: { length: 0 } };
  assert.deepEqual(getSeekBounds(video), { minimum: 0, maximum: 75 });
});

test("rejects media without a seekable range or finite duration", () => {
  const video = { duration: Infinity, seekable: { length: 0 } };
  assert.equal(getSeekBounds(video), null);
});

test("clamps seek time to the available range", () => {
  const bounds = { minimum: 10, maximum: 50 };
  assert.equal(calculateSeekTime(20, 5, bounds), 25);
  assert.equal(calculateSeekTime(20, -20, bounds), 10);
  assert.equal(calculateSeekTime(48, 10, bounds), 50);
});
