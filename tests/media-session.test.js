const test = require("node:test");
const assert = require("node:assert/strict");

const { createMediaSessionTracker, isAdActive } = require("../src/content/media-session.js");

function createMedia() {
  const classes = new Set();
  const player = {
    isConnected: true,
    video: null,
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    },
    querySelector(selector) {
      return selector === "video" ? this.video : null;
    },
  };
  const listeners = new Map();
  const video = {
    isConnected: true,
    currentSrc: "blob:one",
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    emit(type) {
      for (const listener of listeners.get(type) || []) {
        listener({ type });
      }
    },
  };
  player.video = video;
  return { player, video };
}

test("detects YouTube ad state classes", () => {
  const { player } = createMedia();
  assert.equal(isAdActive(player), false);
  player.classList.add("ad-interrupting");
  assert.equal(isAdActive(player), true);
  assert.equal(isAdActive(null), false);
});

test("a session is frozen and stays current while the media is unchanged", () => {
  const { player, video } = createMedia();
  const session = createMediaSessionTracker().begin(video, player);

  assert.equal(Object.isFrozen(session), true);
  assert.equal(session.video, video);
  assert.equal(session.isCurrent(), true);
  assert.equal(session.isCurrent(), true);
});

const transitions = {
  "ad state changes": ({ player }) => player.classList.add("ad-showing"),
  "currentSrc changes": ({ video }) => {
    video.currentSrc = "blob:two";
  },
  "player hosts another video": ({ player }) => {
    player.video = { isConnected: true };
  },
  "video disconnects": ({ video }) => {
    video.isConnected = false;
  },
  "player disconnects": ({ player }) => {
    player.isConnected = false;
  },
  "emptied fires on the same blob URL": ({ video }) => video.emit("emptied"),
  "loadstart fires on the same blob URL": ({ video }) => video.emit("loadstart"),
};

for (const [name, apply] of Object.entries(transitions)) {
  test(`a session ends forever when ${name}`, () => {
    const media = createMedia();
    const original = { src: media.video.currentSrc, hosted: media.player.video };
    const session = createMediaSessionTracker().begin(media.video, media.player);

    apply(media);
    assert.equal(session.isCurrent(), false);

    media.player.classList.remove("ad-showing");
    media.video.currentSrc = original.src;
    media.player.video = original.hosted;
    media.video.isConnected = true;
    media.player.isConnected = true;
    assert.equal(session.isCurrent(), false);
  });
}

test("a newer session or explicit invalidation ends the previous one", () => {
  const { player, video } = createMedia();
  const tracker = createMediaSessionTracker();
  const first = tracker.begin(video, player);
  const second = tracker.begin(video, player);

  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  assert.ok(second.generation > first.generation);

  tracker.invalidate(second);
  assert.equal(second.isCurrent(), false);
  assert.equal(tracker.begin(video, player).isCurrent(), true);
});
