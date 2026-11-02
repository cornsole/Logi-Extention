const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateProgressRatio,
  formatMediaTime,
} = require("../src/content/progress-preview.js");

test("calculates preview position within VOD and DVR ranges", () => {
  assert.equal(calculateProgressRatio(25, { minimum: 0, maximum: 100 }), 0.25);
  assert.equal(calculateProgressRatio(150, { minimum: 100, maximum: 300 }), 0.25);
});

test("clamps preview position and rejects invalid ranges", () => {
  assert.equal(calculateProgressRatio(-10, { minimum: 0, maximum: 100 }), 0);
  assert.equal(calculateProgressRatio(120, { minimum: 0, maximum: 100 }), 1);
  assert.equal(calculateProgressRatio(10, { minimum: 10, maximum: 10 }), null);
  assert.equal(calculateProgressRatio(Number.NaN, { minimum: 0, maximum: 100 }), null);
});

test("formats optimistic VOD timestamps", () => {
  assert.equal(formatMediaTime(0), "0:00");
  assert.equal(formatMediaTime(65.9), "1:05");
  assert.equal(formatMediaTime(3665), "1:01:05");
});
