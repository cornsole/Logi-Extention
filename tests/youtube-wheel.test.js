const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../src/content/youtube-wheel.js"),
  "utf8",
);

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, player) {
    this.tagName = tagName;
    this.player = player || null;
    this.video = null;
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.currentTime = 0;
    this.paused = true;
  }

  matches(selector) {
    return this.tagName === "PLAYER" && selector.includes(".html5-video-player");
  }

  querySelector(selector) {
    return selector === "video" ? this.video : null;
  }

  closest(selector) {
    return selector.includes(".html5-video-player") ? this.player : null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  emit(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ target: this });
    }
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event) {
    this.listeners.get(type)(event);
  }
}

function createHarness() {
  const document = new FakeDocument();
  const frames = new Map();
  const observers = [];
  const calls = { cancel: 0, seekBy: 0 };
  let nextFrame = 1;

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }

    observe() {}
  }

  const context = {
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    WeakMap,
    WeakSet,
    Promise,
    document,
    innerWidth: 1280,
    requestAnimationFrame(callback) {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    YTWheel: {
      getSeekBounds: () => ({ minimum: 0, maximum: 100 }),
      normalizeHorizontalDelta: (deltaX) => deltaX,
      pixelsToSeconds: (pixels) => pixels / 100,
      calculateSeekTime: (current, seconds, bounds) => (
        Math.min(Math.max(current + seconds, bounds.minimum), bounds.maximum)
      ),
    },
    YTWheelSettings: {
      DEFAULT_SETTINGS: { secondsPerHundredPixels: 2, inverted: true },
      loadSettings: () => Promise.resolve({ secondsPerHundredPixels: 2, inverted: true }),
      watchSettings: () => {},
    },
    YTProgressPreview: {
      createProgressPreview: () => ({ clear() {}, show() {} }),
    },
    YTPausedSeeker: {
      createPausedSeekCoordinator: () => ({
        seekBy() {
          calls.seekBy += 1;
          return 10;
        },
        cancel() {
          calls.cancel += 1;
        },
        reset() {},
        flush() {},
      }),
    },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  const player = new FakeElement("PLAYER");
  player.player = player;
  const video = new FakeElement("VIDEO", player);
  player.video = video;

  function wheelEvent() {
    return {
      defaultPrevented: false,
      deltaX: 100,
      deltaY: 0,
      deltaMode: 0,
      composedPath: () => [video, player],
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
  }

  return { calls, document, frames, observers, player, video, wheelEvent };
}

test("ignores horizontal-wheel input while a YouTube ad is active", () => {
  const harness = createHarness();
  harness.player.classList.add("ad-showing");
  const event = harness.wheelEvent();

  harness.document.dispatch("wheel", event);

  assert.equal(event.defaultPrevented, false);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.calls.seekBy, 0);
  assert.equal(harness.calls.cancel, 1);
});

test("cancels a queued seek when the player enters an ad state", () => {
  const harness = createHarness();
  const event = harness.wheelEvent();
  harness.document.dispatch("wheel", event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.frames.size, 1);
  harness.player.classList.add("ad-interrupting");
  harness.observers[0].callback();

  assert.equal(harness.frames.size, 0);
  assert.equal(harness.calls.seekBy, 0);
  assert.equal(harness.calls.cancel, 1);
});

test("cancels a queued seek when YouTube replaces the media source", () => {
  const harness = createHarness();
  harness.document.dispatch("wheel", harness.wheelEvent());
  assert.equal(harness.frames.size, 1);

  harness.video.emit("emptied");

  assert.equal(harness.frames.size, 0);
  assert.equal(harness.calls.seekBy, 0);
  assert.equal(harness.calls.cancel, 1);
});
