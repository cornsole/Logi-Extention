(function initSettings(root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    secondsPerHundredPixels: 5,
    inverted: false,
  });
  const MIN_SENSITIVITY = 1;
  const MAX_SENSITIVITY = 20;

  function normalizeSettings(candidate) {
    const sensitivity = Number(candidate && candidate.secondsPerHundredPixels);
    return {
      secondsPerHundredPixels: Number.isFinite(sensitivity)
        ? Math.min(Math.max(sensitivity, MIN_SENSITIVITY), MAX_SENSITIVITY)
        : DEFAULT_SETTINGS.secondsPerHundredPixels,
      inverted: candidate && typeof candidate.inverted === "boolean"
        ? candidate.inverted
        : DEFAULT_SETTINGS.inverted,
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
