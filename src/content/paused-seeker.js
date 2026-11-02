(function initPausedSeeker(root) {
  "use strict";

  const SEEK_TIMEOUT_MS = 1000;
  const TIME_EPSILON = 0.01;

  function createPausedSeekCoordinator(options) {
    const config = options || {};
    const calculateSeekTime = config.calculateSeekTime || root.YTWheel.calculateSeekTime;
    const schedule = config.schedule || ((callback) => requestAnimationFrame(callback));
    const setTimer = config.setTimer || ((callback, delay) => setTimeout(callback, delay));
    const clearTimer = config.clearTimer || ((timer) => clearTimeout(timer));
    const onSettled = config.onSettled || (() => {});
    const states = new WeakMap();

    function getState(video) {
      let state = states.get(video);
      if (!state) {
        state = {
          targetTime: null,
          inFlight: false,
          token: 0,
          timer: null,
          onSeeked: null,
        };
        states.set(video, state);
      }
      return state;
    }

    function clearCompletion(video, state) {
      if (state.onSeeked) {
        video.removeEventListener("seeked", state.onSeeked);
        state.onSeeked = null;
      }
      if (state.timer !== null) {
        clearTimer(state.timer);
        state.timer = null;
      }
    }
    function scheduleSettled(video, state) {
      const token = state.token;
      schedule(() => {
        if (token === state.token && !state.inFlight && state.targetTime === null) {
          onSettled(video);
        }
      });
    }


    function startNextSeek(video, state) {
      if (state.inFlight || state.targetTime === null || !video.paused) {
        return;
      }

      if (Math.abs(video.currentTime - state.targetTime) <= TIME_EPSILON) {
        state.targetTime = null;
        scheduleSettled(video, state);
        return;
      }

      state.inFlight = true;
      state.token += 1;
      const token = state.token;
      let completed = false;

      const complete = () => {
        if (completed || token !== state.token) {
          return;
        }
        if (video.seeking && video.isConnected !== false) {
          state.timer = setTimer(complete, SEEK_TIMEOUT_MS);
          return;
        }
        completed = true;
        clearCompletion(video, state);
        state.inFlight = false;

        if (!video.paused) {
          state.targetTime = null;
          scheduleSettled(video, state);
          return;
        }

        if (
          state.targetTime !== null
          && Math.abs(video.currentTime - state.targetTime) > TIME_EPSILON
        ) {
          schedule(() => startNextSeek(video, state));
        } else {
          state.targetTime = null;
          scheduleSettled(video, state);
        }
      };

      state.onSeeked = complete;
      video.addEventListener("seeked", complete, { once: true });
      state.timer = setTimer(complete, SEEK_TIMEOUT_MS);

      try {
        video.currentTime = state.targetTime;
      } catch (_error) {
        complete();
      }
    }

    function seekBy(video, secondsDelta, bounds) {
      const state = getState(video);
      const baseline = state.targetTime === null ? video.currentTime : state.targetTime;
      const targetTime = calculateSeekTime(baseline, secondsDelta, bounds);
      if (targetTime === null) {
        return null;
      }

      state.targetTime = targetTime;
      startNextSeek(video, state);
      return targetTime;
    }

    function reset(video) {
      const state = states.get(video);
      if (!state) {
        onSettled(video);
        return;
      }

      state.token += 1;
      state.targetTime = null;
      state.inFlight = false;
      clearCompletion(video, state);
      onSettled(video);
    }

    return { seekBy, reset };
  }

  const api = { createPausedSeekCoordinator };
  root.YTPausedSeeker = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
