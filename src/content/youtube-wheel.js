(function initYouTubeWheelSeek(root) {
  "use strict";

  const wheelMath = root.YTWheel;
  const settingsApi = root.YTWheelSettings;
  const progressPreview = root.YTProgressPreview.createProgressPreview();
  const pausedSeeker = root.YTPausedSeeker.createPausedSeekCoordinator({
    onSettled: (video) => progressPreview.clear(video),
  });
  const PLAYER_SELECTOR = ".html5-video-player, #movie_player";
  const VOLUME_SLIDER_SELECTOR = ".ytp-volume-panel, .ytp-volume-slider, .ytp-volume-slider-handle";
  const AD_STATE_CLASSES = ["ad-showing", "ad-interrupting"];

  let settings = { ...settingsApi.DEFAULT_SETTINGS };
  let pendingVideo = null;
  let pendingPixels = 0;
  let animationFrame = null;
  const playbackListeners = new WeakSet();
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
  function isAdActive(player) {
    return AD_STATE_CLASSES.some((className) => player.classList.contains(className));
  }

  function cancelPendingSeek(video) {
    if (pendingVideo === video) {
      if (animationFrame !== null) {
        root.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      pendingVideo = null;
      pendingPixels = 0;
    }
    pausedSeeker.cancel(video);
  }

  function observeMediaLifecycle(video) {
    if (mediaListeners.has(video)) {
      return;
    }
    mediaListeners.add(video);
    video.addEventListener("emptied", () => cancelPendingSeek(video));
  }

  function observeAdLifecycle(player, video) {
    const existing = adObservers.get(player);
    if (existing) {
      existing.video = video;
      return;
    }

    const state = { active: isAdActive(player), video };
    const observer = new root.MutationObserver(() => {
      const active = isAdActive(player);
      if (active === state.active) {
        return;
      }

      const previousVideo = state.video;
      const currentVideo = player.querySelector("video") || previousVideo;
      state.active = active;
      state.video = currentVideo;
      if (previousVideo) {
        cancelPendingSeek(previousVideo);
      }
      if (currentVideo && currentVideo !== previousVideo) {
        cancelPendingSeek(currentVideo);
      }
    });
    observer.observe(player, { attributes: true, attributeFilter: ["class"] });
    state.observer = observer;
    adObservers.set(player, state);
  }


  function applyPendingSeek() {
    animationFrame = null;
    const video = pendingVideo;
    const pixels = pendingPixels;
    pendingVideo = null;
    pendingPixels = 0;

    const player = video && video.closest(PLAYER_SELECTOR);
    if (!video || (player && isAdActive(player))) {
      if (video) {
        pausedSeeker.cancel(video);
      }
      return;
    }

    const bounds = wheelMath.getSeekBounds(video);
    if (!bounds) {
      return;
    }

    const seconds = wheelMath.pixelsToSeconds(
      pixels,
      settings.secondsPerHundredPixels,
      settings.inverted,
    );
    if (video.paused) {
      const targetTime = pausedSeeker.seekBy(video, seconds, bounds);
      if (targetTime !== null) {
        progressPreview.show(video, targetTime, bounds);
      }
      return;
    }

    pausedSeeker.reset(video);
    const nextTime = wheelMath.calculateSeekTime(video.currentTime, seconds, bounds);
    if (nextTime === null || nextTime === video.currentTime) {
      return;
    }

    try {
      video.currentTime = nextTime;
    } catch (_error) {
      // Media can become detached between the wheel event and this animation frame.
    }
  }

  function queueSeek(video, pixels) {
    if (pendingVideo && pendingVideo !== video) {
      applyPendingSeek();
    }

    pendingVideo = video;
    pendingPixels += pixels;
    observePlayback(video);
    if (animationFrame === null) {
      animationFrame = requestAnimationFrame(applyPendingSeek);
    }
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
    if (isAdActive(player)) {
      cancelPendingSeek(video);
      return;
    }
    if (!wheelMath.getSeekBounds(video)) {
      return;
    }

    const pixels = wheelMath.normalizeHorizontalDelta(event.deltaX, event.deltaMode, root.innerWidth);
    if (pixels === 0) {
      return;
    }

    event.preventDefault();
    queueSeek(video, pixels);
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

  function handlePlaybackStart(video) {
    playbackListeners.delete(video);
    const player = video.closest(PLAYER_SELECTOR);
    if (player && isAdActive(player)) {
      cancelPendingSeek(video);
      return;
    }
    if (pendingVideo === video && pendingPixels !== 0) {
      if (animationFrame !== null) {
        root.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      applyPendingSeek();
    }
    pausedSeeker.flush(video);
  }

  function observePlayback(video) {
    if (playbackListeners.has(video)) {
      return;
    }
    playbackListeners.add(video);
    video.addEventListener("play", () => handlePlaybackStart(video), { once: true });
  }

  settingsApi.loadSettings().then((loaded) => {
    settings = loaded;
  });
  settingsApi.watchSettings((updated) => {
    settings = updated;
  });

  document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
  document.addEventListener("pointerdown", handlePointerDown, { capture: true });
})(typeof globalThis !== "undefined" ? globalThis : this);
