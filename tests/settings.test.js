const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  normalizeSettings,
} = require("../src/content/settings.js");

test("uses defaults for missing or invalid settings", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ secondsPerHundredPixels: "invalid", inverted: "yes" }), DEFAULT_SETTINGS);
});

test("accepts valid settings and clamps sensitivity", () => {
  assert.deepEqual(normalizeSettings({ secondsPerHundredPixels: 8, inverted: true }), {
    secondsPerHundredPixels: 8,
    inverted: true,
  });
  assert.equal(normalizeSettings({ secondsPerHundredPixels: -2 }).secondsPerHundredPixels, 1);
  assert.equal(normalizeSettings({ secondsPerHundredPixels: 99 }).secondsPerHundredPixels, 20);
});
