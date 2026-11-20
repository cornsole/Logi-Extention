(function initPausedSeeker(root) {
  "use strict";

  const DEFAULT_COMMIT_DELAY_MS = 80;
  const TIME_EPSILON = 0.01;

  function createPausedSeekCoordinator(options) {
    const config = options || {};
    const calculateSeekTime = config.calculateSeekTime || root.YTWheel.calculateSeekTime;
    const isTimeBuffered = config.isTimeBuffered || root.YTWheel.isTimeBuffered;
    const schedule = config.schedule || ((callback) => requestAnimationFrame(callback));
    const setTimer = config.setTimer || ((callback, delay) => setTimeout(callback, delay));
    const clearTimer = config.clearTimer || ((timer) => clearTimeout(timer));
    const commitDelay = Number.isFinite(config.commitDelay)
      ? Math.max(config.commitDelay, 0)
      : DEFAULT_COMMIT_DELAY_MS;
    const onSettled = config.onSettled || (() => {});
    const states = new WeakMap();

    function clearCommitTimer(state) {
      if (state.commitTimer !== null) {
        clearTimer(state.commitTimer);
        state.commitTimer = null;
      }
    }

    function clearSeekListener(video, state) {
      if (state.onSeeked) {
        video.removeEventListener("seeked", state.onSeeked);
        state.onSeeked = null;
      }
    }

    function cancel(video) {
      const state = states.get(video);
      if (!state) {
        onSettled(video);
        return;
      }

      state.token += 1;
      state.targetTime = null;
      state.committedTime = null;
      state.inFlight = false;
      state.kind = null;
      clearCommitTimer(state);
      clearSeekListener(video, state);
      onSettled(video);
    }

    function getState(video) {
      let state = states.get(video);
      if (!state) {
        state = {
          targetTime: null,
          committedTime: null,
          inFlight: false,
          kind: null,
          token: 0,
          commitTimer: null,
          onSeeked: null,
        };
        states.set(video, state);
        video.addEventListener("play", () => flush(video));
        video.addEventListener("emptied", () => cancel(video));
      }
      return state;
    }

    function settle(video, state) {
      state.targetTime = null;
      state.committedTime = null;
      state.inFlight = false;
      state.kind = null;
      clearCommitTimer(state);
      clearSeekListener(video, state);
      onSettled(video);
    }

    function completeSeek(video, state, token) {
      if (token !== state.token) {
        return;
      }

      clearSeekListener(video, state);
      state.inFlight = false;

      if (state.commitTimer !== null) {
        if (
          video.paused
          && state.targetTime !== null
          && isTimeBuffered(video.buffered, state.targetTime)
        ) {
          schedule(() => startBufferedPreview(video, state));
        }
        return;
      }

      if (
        state.targetTime !== null
        && state.committedTime !== null
        && Math.abs(state.targetTime - state.committedTime) > TIME_EPSILON
      ) {
        commitFinal(video, state);
        return;
      }

      settle(video, state);
    }

    function assignSeek(video, state, targetTime, kind) {
      clearSeekListener(video, state);
      state.token += 1;
      const token = state.token;
      state.committedTime = targetTime;
      state.inFlight = true;
      state.kind = kind;
      state.onSeeked = () => completeSeek(video, state, token);
      video.addEventListener("seeked", state.onSeeked, { once: true });

      try {
        video.currentTime = targetTime;
        schedule(() => {
          if (token === state.token && !video.seeking) {
            completeSeek(video, state, token);
          }
        });
      } catch (_error) {
        cancel(video);
      }
    }

    function startBufferedPreview(video, state) {
      if (
        state.inFlight
        || state.targetTime === null
        || !video.paused
        || !isTimeBuffered(video.buffered, state.targetTime)
      ) {
        return;
      }

      if (Math.abs(video.currentTime - state.targetTime) <= TIME_EPSILON) {
        return;
      }
      assignSeek(video, state, state.targetTime, "preview");
    }

    function commitFinal(video, state) {
      clearCommitTimer(state);
      const targetTime = state.targetTime;
      if (targetTime === null) {
        return null;
      }

      if (
        state.inFlight
        && state.committedTime !== null
        && Math.abs(state.committedTime - targetTime) <= TIME_EPSILON
      ) {
        state.kind = "final";
        return targetTime;
      }

      if (!video.seeking && Math.abs(video.currentTime - targetTime) <= TIME_EPSILON) {
        settle(video, state);
        return targetTime;
      }

      assignSeek(video, state, targetTime, "final");
      return targetTime;
    }

    function scheduleFinalCommit(video, state) {
      clearCommitTimer(state);
      state.commitTimer = setTimer(() => {
        state.commitTimer = null;
        commitFinal(video, state);
      }, commitDelay);
    }

    function seekBy(video, secondsDelta, bounds) {
      const state = getState(video);
      const baseline = state.targetTime === null ? video.currentTime : state.targetTime;
      const targetTime = calculateSeekTime(baseline, secondsDelta, bounds);
      if (targetTime === null) {
        return null;
      }

      state.targetTime = targetTime;
      scheduleFinalCommit(video, state);
      if (isTimeBuffered(video.buffered, targetTime)) {
        startBufferedPreview(video, state);
      }
      return targetTime;
    }

    function flush(video) {
      const state = states.get(video);
      if (!state || state.targetTime === null) {
        return null;
      }
      return commitFinal(video, state);
    }

    return { seekBy, flush, cancel, reset: cancel };
  }

  const api = { DEFAULT_COMMIT_DELAY_MS, createPausedSeekCoordinator };
  root.YTPausedSeeker = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
