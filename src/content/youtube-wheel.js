(function initYouTubeWheelSeek(root) {
  "use strict";

  const wheelMath = root.YTWheel;
  const settingsApi = root.YTWheelSettings;
  const PLAYER_SELECTOR = ".html5-video-player, #movie_player";
  const VOLUME_SLIDER_SELECTOR = ".ytp-volume-panel, .ytp-volume-slider, .ytp-volume-slider-handle";

  let settings = { ...settingsApi.DEFAULT_SETTINGS };
  let pendingVideo = null;
  let pendingPixels = 0;
  let animationFrame = null;

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

  function applyPendingSeek() {
    animationFrame = null;
    const video = pendingVideo;
    const pixels = pendingPixels;
    pendingVideo = null;
    pendingPixels = 0;

    const bounds = wheelMath.getSeekBounds(video);
    if (!bounds) {
      return;
    }

    const seconds = wheelMath.pixelsToSeconds(
      pixels,
      settings.secondsPerHundredPixels,
      settings.inverted,
    );
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
    if (!video || !wheelMath.getSeekBounds(video)) {
      return;
    }

    const pixels = wheelMath.normalizeHorizontalDelta(event.deltaX, event.deltaMode, root.innerWidth);
    if (pixels === 0) {
      return;
    }

    event.preventDefault();
    queueSeek(video, pixels);
  }

  settingsApi.loadSettings().then((loaded) => {
    settings = loaded;
  });
  settingsApi.watchSettings((updated) => {
    settings = updated;
  });

  document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
})(typeof globalThis !== "undefined" ? globalThis : this);
