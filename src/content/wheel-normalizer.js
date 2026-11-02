(function initWheelMath(root) {
  "use strict";

  const DOM_DELTA_PIXEL = 0;
  const DOM_DELTA_LINE = 1;
  const DOM_DELTA_PAGE = 2;
  const PIXELS_PER_LINE = 16;
  const MAX_EVENT_PIXELS = 1000;

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function normalizeHorizontalDelta(deltaX, deltaMode, viewportWidth) {
    if (!Number.isFinite(deltaX)) {
      return 0;
    }

    let pixels = deltaX;
    if (deltaMode === DOM_DELTA_LINE) {
      pixels *= PIXELS_PER_LINE;
    } else if (deltaMode === DOM_DELTA_PAGE) {
      pixels *= Math.max(Number(viewportWidth) || 0, 1);
    }

    return clamp(pixels, -MAX_EVENT_PIXELS, MAX_EVENT_PIXELS);
  }

  function pixelsToSeconds(pixels, secondsPerHundredPixels, inverted) {
    if (!Number.isFinite(pixels) || !Number.isFinite(secondsPerHundredPixels)) {
      return 0;
    }

    const direction = inverted ? -1 : 1;
    return (pixels * secondsPerHundredPixels * direction) / 100;
  }

  function getSeekBounds(video) {
    if (!video) {
      return null;
    }

    const seekable = video.seekable;
    if (seekable && seekable.length > 0) {
      const minimum = seekable.start(0);
      const maximum = seekable.end(seekable.length - 1);
      if (Number.isFinite(minimum) && Number.isFinite(maximum) && maximum >= minimum) {
        return { minimum, maximum };
      }
    }

    const duration = video.duration;
    if (Number.isFinite(duration) && duration >= 0) {
      return { minimum: 0, maximum: duration };
    }

    return null;
  }

  function calculateSeekTime(currentTime, secondsDelta, bounds) {
    if (!bounds || !Number.isFinite(currentTime) || !Number.isFinite(secondsDelta)) {
      return null;
    }

    return clamp(currentTime + secondsDelta, bounds.minimum, bounds.maximum);
  }

  const api = {
    DOM_DELTA_PIXEL,
    DOM_DELTA_LINE,
    DOM_DELTA_PAGE,
    normalizeHorizontalDelta,
    pixelsToSeconds,
    getSeekBounds,
    calculateSeekTime,
  };

  root.YTWheel = Object.assign(root.YTWheel || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
