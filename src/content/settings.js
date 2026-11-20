(function initSettings(root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    secondsPerHundredPixels: 2,
    inverted: true,
    requestIntervalMs: 50,
    gestureEndDelayMs: 80,
    adSeeking: true,
  });
  const LIMITS = Object.freeze({
    secondsPerHundredPixels: Object.freeze({ minimum: 1, maximum: 20 }),
    requestIntervalMs: Object.freeze({ minimum: 0, maximum: 200 }),
    gestureEndDelayMs: Object.freeze({ minimum: 20, maximum: 300 }),
  });
  const MIN_SENSITIVITY = LIMITS.secondsPerHundredPixels.minimum;
  const MAX_SENSITIVITY = LIMITS.secondsPerHundredPixels.maximum;

  function normalizeNumber(candidate, key) {
    const value = candidate && candidate[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_SETTINGS[key];
    }
    const { minimum, maximum } = LIMITS[key];
    return Math.min(Math.max(Math.round(value), minimum), maximum);
  }

  function normalizeBoolean(candidate, key) {
    return candidate && typeof candidate[key] === "boolean"
      ? candidate[key]
      : DEFAULT_SETTINGS[key];
  }

  function normalizeSettings(candidate) {
    return {
      secondsPerHundredPixels: normalizeNumber(candidate, "secondsPerHundredPixels"),
      inverted: normalizeBoolean(candidate, "inverted"),
      requestIntervalMs: normalizeNumber(candidate, "requestIntervalMs"),
      gestureEndDelayMs: normalizeNumber(candidate, "gestureEndDelayMs"),
      adSeeking: normalizeBoolean(candidate, "adSeeking"),
    };
  }

  function getStorageApi() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.sync) {
      return null;
    }
    return chrome.storage.sync;
  }

  function loadSettings() {
    const storage = getStorageApi();
    if (!storage) {
      return Promise.resolve({ ...DEFAULT_SETTINGS });
    }

    return new Promise((resolve) => {
      storage.get(DEFAULT_SETTINGS, (stored) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }
        resolve(normalizeSettings(stored));
      });
    });
  }

  function saveSettings(candidate) {
    const settings = normalizeSettings(candidate);
    const storage = getStorageApi();
    if (!storage) {
      return Promise.resolve(settings);
    }

    return new Promise((resolve, reject) => {
      storage.set(settings, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(settings);
      });
    });
  }

  function watchSettings(listener) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) {
      return function noop() {};
    }

    const handleChange = (changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }
      loadSettings().then(listener);
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }

  const api = {
    DEFAULT_SETTINGS,
    LIMITS,
    MIN_SENSITIVITY,
    MAX_SENSITIVITY,
    normalizeSettings,
    loadSettings,
    saveSettings,
    watchSettings,
  };

  root.YTWheelSettings = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
