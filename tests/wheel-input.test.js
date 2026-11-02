const test = require("node:test");
const assert = require("node:assert/strict");
const { getWheelStep } = require("../src/popup/wheel-input.js");

test("maps the vertical wheel without horizontal inversion", () => {
  assert.equal(getWheelStep(0, -120, false), 1);
  assert.equal(getWheelStep(0, -120, true), 1);
  assert.equal(getWheelStep(0, 120, false), -1);
  assert.equal(getWheelStep(0, 120, true), -1);
});

test("applies direction inversion only to the horizontal wheel", () => {
  assert.equal(getWheelStep(120, 0, false), 1);
  assert.equal(getWheelStep(120, 0, true), -1);
  assert.equal(getWheelStep(-120, 0, false), -1);
  assert.equal(getWheelStep(-120, 0, true), 1);
});

test("uses the dominant wheel axis and ignores empty input", () => {
  assert.equal(getWheelStep(20, -100, true), 1);
  assert.equal(getWheelStep(100, -20, true), -1);
  assert.equal(getWheelStep(0, 0, true), 0);
});
