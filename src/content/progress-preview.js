(function initProgressPreview(root) {
  "use strict";

  const ACTIVE_CLASS = "yt-wheel-progress-preview-active";
  const PREVIEW_CLASS = "yt-wheel-progress-preview";
  const STYLE_ID = "yt-wheel-progress-preview-style";

  function calculateProgressRatio(targetTime, bounds) {
    if (!bounds || !Number.isFinite(targetTime)) {
      return null;
    }

    const length = bounds.maximum - bounds.minimum;
    if (!Number.isFinite(length) || length <= 0) {
      return null;
    }

    return Math.min(Math.max((targetTime - bounds.minimum) / length, 0), 1);
  }

  function formatMediaTime(seconds) {
    const wholeSeconds = Math.max(Math.floor(Number(seconds) || 0), 0);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const remainingSeconds = wholeSeconds % 60;
    const minuteText = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
    const base = `${minuteText}:${String(remainingSeconds).padStart(2, "0")}`;
    return hours > 0 ? `${hours}:${base}` : base;
  }

  function ensureStyles(document) {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${ACTIVE_CLASS} .ytp-play-progress,
      .${ACTIVE_CLASS} .ytp-scrubber-container {
        visibility: hidden !important;
      }
      .${PREVIEW_CLASS} {
        position: absolute;
        left: 0;
        top: 50%;
        height: 4px;
        transform: translateY(-50%);
        transform-origin: left center;
        pointer-events: none;
        z-index: 40;
      }
      .${PREVIEW_CLASS}::after {
        position: absolute;
        right: -6px;
        top: 50%;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: inherit;
        content: "";
        transform: translateY(-50%);
      }
    `;
    document.documentElement.append(style);
  }

  function createProgressPreview() {
    const states = new WeakMap();

    function isCurrentSession(video, session) {
      return Boolean(
        session
          && session.video === video
          && typeof session.isCurrent === "function"
          && session.isCurrent(),
      );
    }

    function teardown(video, state, restoreTime) {
      if (state.timeObserver) {
        state.timeObserver.disconnect();
      }
      video.removeEventListener("play", state.onPlaybackStarted);
      video.removeEventListener("emptied", state.onMediaReplaced);
      if (restoreTime && state.timeCurrent && state.timeCurrent.isConnected) {
        state.timeCurrent.textContent = formatMediaTime(video.currentTime);
      }
      state.player.classList.remove(ACTIVE_CLASS);
      state.overlay.remove();
      if (states.get(video) === state) {
        states.delete(video);
      }
    }

    function clear(video, session) {
      const state = states.get(video);
      if (!state || state.session !== session) {
        return;
      }

      teardown(video, state, isCurrentSession(video, session));
    }

    function createState(video, session) {
      const player = video.closest(".html5-video-player, #movie_player");
      const progressBar = player && player.querySelector(".ytp-progress-bar");
      if (!player || !progressBar) {
        return null;
      }

      ensureStyles(player.ownerDocument);
      const overlay = player.ownerDocument.createElement("div");
      overlay.className = PREVIEW_CLASS;
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.backgroundColor = "var(--yt-spec-static-brand-red, #ff0033)";
      progressBar.append(overlay);
      player.classList.add(ACTIVE_CLASS);

      const timeCurrent = Number.isFinite(video.duration)
        ? player.querySelector(".ytp-time-current")
        : null;
      const state = {
        session,
        player,
        overlay,
        timeCurrent,
        timeObserver: null,
        targetText: null,
        onPlaybackStarted: null,
        onMediaReplaced: null,
      };

      function ownsState() {
        return states.get(video) === state && state.session === session;
      }

      state.onPlaybackStarted = () => {
        if (ownsState()) {
          teardown(video, state, isCurrentSession(video, session));
        }
      };
      // emptied means the media was replaced; video.currentTime no longer
      // belongs to the previewed media, so never write it into the display.
      state.onMediaReplaced = () => {
        if (ownsState()) {
          teardown(video, state, false);
        }
      };
      video.addEventListener("play", state.onPlaybackStarted, { once: true });
      video.addEventListener("emptied", state.onMediaReplaced, { once: true });

      if (timeCurrent && root.MutationObserver) {
        state.timeObserver = new root.MutationObserver(() => {
          if (!ownsState()) {
            return;
          }
          if (!isCurrentSession(video, session)) {
            teardown(video, state, false);
            return;
          }
          if (state.targetText !== null && timeCurrent.textContent !== state.targetText) {
            timeCurrent.textContent = state.targetText;
          }
        });
        state.timeObserver.observe(timeCurrent, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }

      states.set(video, state);
      return state;
    }

    function show(video, targetTime, bounds, session) {
      if (!isCurrentSession(video, session)) {
        return;
      }

      let state = states.get(video);
      if (state && state.session !== session) {
        teardown(video, state, false);
        state = null;
      }
      if (state && !state.player.isConnected) {
        teardown(video, state, false);
        state = null;
      }

      const ratio = calculateProgressRatio(targetTime, bounds);
      if (ratio === null) {
        return;
      }

      state = state || createState(video, session);
      if (!state) {
        return;
      }

      state.overlay.style.width = `${ratio * 100}%`;
      if (state.timeCurrent) {
        state.targetText = formatMediaTime(targetTime);
        state.timeCurrent.textContent = state.targetText;
      }
    }

    return { show, clear };
  }

  const api = { calculateProgressRatio, formatMediaTime, createProgressPreview };
  root.YTProgressPreview = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
