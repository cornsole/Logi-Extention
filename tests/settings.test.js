const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  normalizeSettings,
} = require("../src/content/settings.js");

test("defines the default sensitivity, direction and seek timing", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    secondsPerHundredPixels: 2,
    inverted: true,
    requestIntervalMs: 50,
    gestureEndDelayMs: 80,
    adSeeking: true,
  });
});

test("uses defaults for missing or invalid settings", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({
    secondsPerHundredPixels: "invalid",
    inverted: "yes",
    requestIntervalMs: null,
    gestureEndDelayMs: "slow",
    adSeeking: 1,
  }), DEFAULT_SETTINGS);
});

test("accepts valid settings and clamps numeric ranges", () => {
  assert.deepEqual(normalizeSettings({
    secondsPerHundredPixels: 8,
    inverted: false,
    requestIntervalMs: 0,
    gestureEndDelayMs: 150,
    adSeeking: false,
  }), {
    secondsPerHundredPixels: 8,
    inverted: false,
    requestIntervalMs: 0,
    gestureEndDelayMs: 150,
    adSeeking: false,
  });
  assert.equal(normalizeSettings({ secondsPerHundredPixels: -2 }).secondsPerHundredPixels, 1);
  assert.equal(normalizeSettings({ secondsPerHundredPixels: 99 }).secondsPerHundredPixels, 20);
  assert.equal(normalizeSettings({ requestIntervalMs: 999 }).requestIntervalMs, 200);
  assert.equal(normalizeSettings({ gestureEndDelayMs: 5 }).gestureEndDelayMs, 20);
});
