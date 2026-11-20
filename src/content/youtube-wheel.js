(function initYouTubeWheelSeek(root) {
  "use strict";

  const wheelMath = root.YTWheel;
  const settingsApi = root.YTWheelSettings;
  const mediaSession = root.YTMediaSession;
  const sessionTracker = mediaSession.createMediaSessionTracker();
  const progressPreview = root.YTProgressPreview.createProgressPreview();
  const pausedSeeker = root.YTPausedSeeker.createPausedSeekCoordinator({
    onSettled: (video, session) => progressPreview.clear(video, session),
  });
  const PLAYER_SELECTOR = ".html5-video-player, #movie_player";
  const VOLUME_SLIDER_SELECTOR = ".ytp-volume-panel, .ytp-volume-slider, .ytp-volume-slider-handle";
  const MEDIA_RESET_EVENTS = ["emptied", "loadstart"];

  let settings = { ...settingsApi.DEFAULT_SETTINGS };
  // Queued wheel input: { video, player, session, pixels, frame }.
  let pending = null;
  const sessions = new WeakMap();
  const playListeners = new WeakMap();
  const mediaListeners = new WeakSet();
  const adObservers = new WeakMap();

  function elementFromPath(path, predicate) {
    for (const item of path) {
      if (item instanceof Element && predicate(item)) {
        return item;
      }
    }
    return null;
  }

  function isInsideVolumeSlider(path) {
    return Boolean(elementFromPath(path, (element) => element.matches(VOLUME_SLIDER_SELECTOR)));
  }

  function findPlayer(path) {
    return elementFromPath(path, (element) => element.matches(PLAYER_SELECTOR));
  }

  function findVideo(path, player) {
    const directVideo = elementFromPath(path, (element) => element.tagName === "VIDEO");
    return directVideo || player.querySelector("video");
  }

  // Ads are only seekable when the media reports a real, non-empty seekable range;
  // a bare duration does not prove YouTube allows seeking inside the ad.
  function getAdSeekBounds(video) {
    const seekable = video.seekable;
    if (!seekable || seekable.length === 0) {
      return null;
    }

    const minimum = seekable.start(0);
    const maximum = seekable.end(seekable.length - 1);
    if (Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum) {
      return { minimum, maximum };
    }
    return null;
  }

  function getBounds(video, player) {
    if (!mediaSession.isAdActive(player)) {
      return wheelMath.getSeekBounds(video);
    }
    return settings.adSeeking ? getAdSeekBounds(video) : null;
  }

  function dropPending(video) {
    if (!pending || pending.video !== video) {
      return;
    }
    if (pending.frame !== null) {
      root.cancelAnimationFrame(pending.frame);
    }
    pending = null;
  }

  function removePlayListener(video) {
    const entry = playListeners.get(video);
    if (entry) {
      video.removeEventListener("play", entry.listener);
      playListeners.delete(video);
    }
  }

  // Ends the video's media session: queued input is dropped (never flushed) and
  // every listener, timer and preview owned by the old session is released.
  function endSession(video) {
    const session = sessions.get(video);
    sessions.delete(video);
    dropPending(video);
    removePlayListener(video);
    if (session) {
      sessionTracker.invalidate(session);
    }
    pausedSeeker.cancel(video);
    if (session) {
      progressPreview.clear(video, session);
    }
  }

  function isLive(video, session) {
    if (session.isCurrent()) {
      return true;
    }
    if (sessions.get(video) === session) {
      endSession(video);
    }
    return false;
  }

  function acquireSession(video, player) {
    const existing = sessions.get(video);
    if (existing && existing.isCurrent()) {
      return existing;
    }
    if (existing) {
      endSession(video);
    }

    const session = sessionTracker.begin(video, player);
    sessions.set(video, session);
    return session;
  }

  // The user took over the seek bar: drop queued input and the gesture, but keep
  // the media session itself.
  function cancelPendingSeek(video) {
    dropPending(video);
    pausedSeeker.cancel(video);
    const session = sessions.get(video);
    if (session) {
      progressPreview.clear(video, session);
    }
  }

  function observeMediaLifecycle(video) {
    if (mediaListeners.has(video)) {
      return;
    }
    mediaListeners.add(video);
    const onMediaReset = () => endSession(video);
    for (const type of MEDIA_RESET_EVENTS) {
      video.addEventListener(type, onMediaReset);
    }
  }

  function observeAdLifecycle(player, video) {
    const existing = adObservers.get(player);
    if (existing) {
      existing.video = video;
      return;
    }

    const state = { active: mediaSession.isAdActive(player), video };
    const observer = new root.MutationObserver(() => {
      const active = mediaSession.isAdActive(player);
      if (active === state.active) {
        return;
      }

      const previousVideo = state.video;
      const currentVideo = player.querySelector("video") || previousVideo;
      state.active = active;
      state.video = currentVideo;
      if (previousVideo) {
        endSession(previousVideo);
      }
      if (currentVideo && currentVideo !== previousVideo) {
        endSession(currentVideo);
      }
    });
    observer.observe(player, { attributes: true, attributeFilter: ["class"] });
    state.observer = observer;
    adObservers.set(player, state);
  }

  function applySeek(entry) {
    const { video, player, session, pixels } = entry;
    if (pixels === 0 || !isLive(video, session)) {
      return;
    }

    const bounds = getBounds(video, player);
    if (!bounds) {
      return;
    }

    const seconds = wheelMath.pixelsToSeconds(
      pixels,
      settings.secondsPerHundredPixels,
      settings.inverted,
    );
    const targetTime = pausedSeeker.seekBy(video, seconds, bounds, session);
    if (targetTime !== null && video.paused) {
      progressPreview.show(video, targetTime, bounds, session);
    }
  }

  function takePending(entry) {
    if (pending !== entry) {
      return false;
    }
    if (entry.frame !== null) {
      root.cancelAnimationFrame(entry.frame);
      entry.frame = null;
    }
    pending = null;
    return true;
  }

  function queueSeek(video, player, session, pixels) {
    if (pending && pending.session !== session) {
      const previous = pending;
      takePending(previous);
      // Input for another element still applies if its own session is live;
      // input for an older session of this element is dropped.
      if (previous.video !== video) {
        applySeek(previous);
      }
    }

    if (!pending) {
      const entry = { video, player, session, pixels: 0, frame: null };
      entry.frame = root.requestAnimationFrame(() => {
        if (pending === entry) {
          entry.frame = null;
          pending = null;
          applySeek(entry);
        }
      });
      pending = entry;
    }
    pending.pixels += pixels;
    observePlayback(video, session);
  }

  function handleWheel(event) {
    if (event.defaultPrevented || event.deltaX === 0 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
      return;
    }

    const path = event.composedPath();
    if (isInsideVolumeSlider(path)) {
      return;
    }

    const player = findPlayer(path);
    if (!player) {
      return;
    }

    const video = findVideo(path, player);
    if (!video) {
      return;
    }
    observeMediaLifecycle(video);
    observeAdLifecycle(player, video);
    const session = acquireSession(video, player);
    if (!getBounds(video, player)) {
      return;
    }

    const pixels = wheelMath.normalizeHorizontalDelta(event.deltaX, event.deltaMode, root.innerWidth);
    if (pixels === 0) {
      return;
    }

    event.preventDefault();
    queueSeek(video, player, session, pixels);
  }

  function handlePointerDown(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const progressBar = event.target.closest(".ytp-progress-bar-container, .ytp-progress-bar");
    const player = progressBar && progressBar.closest(PLAYER_SELECTOR);
    if (!player) {
      return;
    }
    const video = player.querySelector("video");
    if (video) {
      cancelPendingSeek(video);
    }
  }

  function handlePlaybackStart(video, session, listener) {
    const entry = playListeners.get(video);
    if (!entry || entry.listener !== listener) {
      return;
    }
    playListeners.delete(video);
    if (!isLive(video, session)) {
      return;
    }

    if (pending && pending.video === video && pending.session === session) {
      const queued = pending;
      takePending(queued);
      applySeek(queued);
    }
    pausedSeeker.flush(video, session);
  }

  function observePlayback(video, session) {
    const entry = playListeners.get(video);
    if (entry && entry.session === session) {
      return;
    }
    removePlayListener(video);

    const listener = () => handlePlaybackStart(video, session, listener);
    playListeners.set(video, { session, listener });
    video.addEventListener("play", listener, { once: true });
  }

  function applySettings(next) {
    settings = next;
    pausedSeeker.setTiming({
      throttleInterval: next.requestIntervalMs,
      commitDelay: next.gestureEndDelayMs,
    });
  }

  applySettings(settings);
  settingsApi.loadSettings().then(applySettings);
  settingsApi.watchSettings(applySettings);

  document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
  document.addEventListener("pointerdown", handlePointerDown, { capture: true });
})(typeof globalThis !== "undefined" ? globalThis : this);
