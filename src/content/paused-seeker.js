(function initPausedSeeker(root) {
  "use strict";

  const DEFAULT_COMMIT_DELAY_MS = 80;
  const DEFAULT_MAX_COMMIT_DELAY_MS = 100;
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
    const maxCommitDelay = Number.isFinite(config.maxCommitDelay)
      ? Math.max(config.maxCommitDelay, commitDelay)
      : Math.max(DEFAULT_MAX_COMMIT_DELAY_MS, commitDelay);
    const onSettled = config.onSettled || (() => {});
    const states = new WeakMap();

    function isCurrentSession(video, session) {
      return Boolean(
        session
        && session.video === video
        && typeof session.isCurrent === "function"
        && session.isCurrent(),
      );
    }

    function clearCommitTimer(state) {
      if (state.commitTimer !== null) {
        clearTimer(state.commitTimer);
        state.commitTimer = null;
      }
    }

    function clearMaxCommitTimer(state) {
      if (state.maxCommitTimer !== null) {
        clearTimer(state.maxCommitTimer);
        state.maxCommitTimer = null;
      }
    }

    function clearSeekListener(video, state) {
      if (state.onSeeked) {
        video.removeEventListener("seeked", state.onSeeked);
        state.onSeeked = null;
      }
    }

    function invalidateState(video, state) {
      state.token += 1;
      state.seekToken += 1;
      state.revision += 1;
      state.targetTime = null;
      state.committedTime = null;
      state.inFlight = false;
      state.kind = null;
      state.checkpointCommitted = false;
      clearCommitTimer(state);
      clearMaxCommitTimer(state);
      clearSeekListener(video, state);
    }

    function retireState(video, state) {
      if (states.get(video) !== state) {
        return false;
      }

      states.delete(video);
      const session = state.session;
      invalidateState(video, state);
      onSettled(video, session);
      return true;
    }

    function ensureCurrentState(video, state, token) {
      if (states.get(video) !== state || state.token !== token) {
        return false;
      }
      if (!isCurrentSession(video, state.session)) {
        retireState(video, state);
        return false;
      }
      return true;
    }

    function cancel(video) {
      const state = states.get(video);
      if (state) {
        retireState(video, state);
      }
    }

    function createState(session) {
      return {
        session,
        targetTime: null,
        committedTime: null,
        inFlight: false,
        kind: null,
        token: 0,
        seekToken: 0,
        revision: 0,
        commitTimer: null,
        onSeeked: null,
        maxCommitTimer: null,
        checkpointCommitted: false,
      };
    }

    function getState(video, session) {
      let state = states.get(video);
      if (state && state.session === session) {
        return state;
      }

      if (state) {
        retireState(video, state);
      }
      if (!isCurrentSession(video, session)) {
        return null;
      }

      state = createState(session);
      states.set(video, state);
      return state;
    }

    function settle(video, state, token) {
      if (ensureCurrentState(video, state, token)) {
        retireState(video, state);
      }
    }

    function startBufferedPreview(video, state, token, revision) {
      if (
        !ensureCurrentState(video, state, token)
        || revision !== state.revision
        || state.inFlight
        || state.targetTime === null
        || !video.paused
        || !isTimeBuffered(video.buffered, state.targetTime)
      ) {
        return;
      }

      if (Math.abs(video.currentTime - state.targetTime) <= TIME_EPSILON) {
        return;
      }
      assignSeek(video, state, state.targetTime, "preview", token);
    }

    function scheduleBufferedPreview(video, state, token) {
      const revision = state.revision;
      schedule(() => {
        if (
          ensureCurrentState(video, state, token)
          && revision === state.revision
        ) {
          startBufferedPreview(video, state, token, revision);
        }
      });
    }

    function completeSeek(video, state, token, seekToken) {
      if (
        !ensureCurrentState(video, state, token)
        || seekToken !== state.seekToken
        || !state.inFlight
      ) {
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
          scheduleBufferedPreview(video, state, token);
        }
        return;
      }

      if (
        state.targetTime !== null
        && state.committedTime !== null
        && Math.abs(state.targetTime - state.committedTime) > TIME_EPSILON
      ) {
        commitFinal(video, state, token);
        return;
      }

      settle(video, state, token);
    }

    function assignSeek(video, state, targetTime, kind, token) {
      if (!ensureCurrentState(video, state, token)) {
        return null;
      }

      clearSeekListener(video, state);
      state.seekToken += 1;
      const seekToken = state.seekToken;
      state.committedTime = targetTime;
      state.inFlight = true;
      state.kind = kind;
      state.onSeeked = () => completeSeek(video, state, token, seekToken);
      video.addEventListener("seeked", state.onSeeked, { once: true });

      try {
        video.currentTime = targetTime;
        schedule(() => {
          if (
            ensureCurrentState(video, state, token)
            && seekToken === state.seekToken
            && state.inFlight
            && !video.seeking
          ) {
            completeSeek(video, state, token, seekToken);
          }
        });
      } catch (_error) {
        retireState(video, state);
        return null;
      }
      return targetTime;
    }

    function commitTarget(video, state, kind, token) {
      if (!ensureCurrentState(video, state, token)) {
        return null;
      }

      const final = kind === "final";
      if (final) {
        clearCommitTimer(state);
        clearMaxCommitTimer(state);
      }

      const targetTime = state.targetTime;
      if (targetTime === null) {
        return null;
      }

      if (
        state.inFlight
        && state.committedTime !== null
        && Math.abs(state.committedTime - targetTime) <= TIME_EPSILON
      ) {
        state.kind = kind;
        return targetTime;
      }

      if (!video.seeking && Math.abs(video.currentTime - targetTime) <= TIME_EPSILON) {
        state.committedTime = targetTime;
        state.kind = kind;
        if (final) {
          settle(video, state, token);
        }
        return targetTime;
      }

      return assignSeek(video, state, targetTime, kind, token);
    }

    function commitCheckpoint(video, state, token) {
      state.checkpointCommitted = true;
      return commitTarget(video, state, "checkpoint", token);
    }

    function commitFinal(video, state, token) {
      return commitTarget(video, state, "final", token);
    }

    function scheduleFinalCommit(video, state, token) {
      clearCommitTimer(state);
      let commitTimer;
      commitTimer = setTimer(() => {
        if (
          ensureCurrentState(video, state, token)
          && state.commitTimer === commitTimer
        ) {
          state.commitTimer = null;
          commitFinal(video, state, token);
        }
      }, commitDelay);
      state.commitTimer = commitTimer;

      if (!state.checkpointCommitted && state.maxCommitTimer === null) {
        let maxCommitTimer;
        maxCommitTimer = setTimer(() => {
          if (
            ensureCurrentState(video, state, token)
            && state.maxCommitTimer === maxCommitTimer
          ) {
            state.maxCommitTimer = null;
            commitCheckpoint(video, state, token);
          }
        }, maxCommitDelay);
        state.maxCommitTimer = maxCommitTimer;
      }
    }

    function seekBy(video, secondsDelta, bounds, session) {
      if (!isCurrentSession(video, session)) {
        return null;
      }

      const state = getState(video, session);
      if (!state) {
        return null;
      }
      const token = state.token;
      const baseline = state.targetTime === null ? video.currentTime : state.targetTime;
      const targetTime = calculateSeekTime(baseline, secondsDelta, bounds);
      if (
        targetTime === null
        || !ensureCurrentState(video, state, token)
      ) {
        return null;
      }

      state.targetTime = targetTime;
      state.revision += 1;
      const revision = state.revision;
      scheduleFinalCommit(video, state, token);
      if (isTimeBuffered(video.buffered, targetTime)) {
        startBufferedPreview(video, state, token, revision);
      }
      return targetTime;
    }

    function flush(video, session) {
      if (!isCurrentSession(video, session)) {
        return null;
      }

      const state = states.get(video);
      if (!state) {
        return null;
      }
      if (state.session !== session) {
        retireState(video, state);
        return null;
      }
      return commitFinal(video, state, state.token);
    }

    return { seekBy, flush, cancel, reset: cancel };
  }

  const api = { DEFAULT_COMMIT_DELAY_MS, createPausedSeekCoordinator };
  root.YTPausedSeeker = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
