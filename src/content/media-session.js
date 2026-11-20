(function initMediaSession(root) {
  "use strict";

  const PLAYER_SELECTOR = ".html5-video-player, #movie_player";
  const AD_STATE_CLASSES = ["ad-showing", "ad-interrupting"];
  const MEDIA_RESET_EVENTS = ["emptied", "loadstart"];

  function isAdActive(player) {
    return Boolean(
      player
      && AD_STATE_CLASSES.some((className) => player.classList.contains(className)),
    );
  }

  function createMediaSessionTracker(options) {
    const config = options || {};
    const getAdState = config.isAdActive || isAdActive;
    const states = new WeakMap();
    const records = new WeakMap();

    function invalidateRecord(record) {
      if (!record || record.invalidated) {
        return;
      }

      record.invalidated = true;
      if (record.state.active === record) {
        record.state.active = null;
      }
    }

    function getState(video) {
      let state = states.get(video);
      if (!state) {
        state = { generation: 0, active: null };
        states.set(video, state);
        // A reload can reuse the same element and even the same blob URL, so the
        // media lifecycle itself ends every session on this element.
        const onMediaReset = () => invalidateRecord(state.active);
        for (const type of MEDIA_RESET_EVENTS) {
          video.addEventListener(type, onMediaReset);
        }
      }
      return state;
    }

    function recordIsCurrent(record) {
      if (record.invalidated) {
        return false;
      }

      const { state, video, player } = record;
      const current = Boolean(
        state.active === record
        && state.generation === record.generation
        && player
        && video.isConnected
        && player.isConnected
        && player.querySelector("video") === video
        && video.currentSrc === record.currentSrc
        && getAdState(player) === record.adActive,
      );
      if (!current) {
        invalidateRecord(record);
      }
      return current;
    }

    function begin(video, player) {
      const state = getState(video);
      invalidateRecord(state.active);
      state.generation += 1;

      const owner = player || video.closest(PLAYER_SELECTOR);
      const record = {
        state,
        video,
        player: owner,
        generation: state.generation,
        currentSrc: video.currentSrc,
        adActive: getAdState(owner),
        invalidated: false,
      };
      const session = Object.freeze({
        video,
        generation: record.generation,
        isCurrent: () => recordIsCurrent(record),
      });
      state.active = record;
      records.set(session, record);
      return session;
    }

    function invalidate(session) {
      invalidateRecord(records.get(session));
    }

    return { begin, invalidate };
  }

  const api = { AD_STATE_CLASSES, isAdActive, createMediaSessionTracker };
  root.YTMediaSession = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
