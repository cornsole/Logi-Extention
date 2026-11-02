(function initWheelInput(root) {
  "use strict";

  function getWheelStep(deltaX, deltaY, horizontalInverted) {
    const horizontal = Number.isFinite(deltaX) ? deltaX : 0;
    const vertical = Number.isFinite(deltaY) ? deltaY : 0;

    if (Math.abs(horizontal) > Math.abs(vertical) && horizontal !== 0) {
      const direction = horizontalInverted ? -1 : 1;
      return Math.sign(horizontal) * direction;
    }

    if (vertical !== 0) {
      return -Math.sign(vertical);
    }

    return 0;
  }

  const api = { getWheelStep };
  root.YTWheelInput = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
