const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SCRIPTS = [
  "wheel-normalizer.js",
  "paused-seeker.js",
  "media-session.js",
  "youtube-wheel.js",
].map((name) => ({
  name,
  source: fs.readFileSync(path.join(__dirname, "../src/content", name), "utf8"),
}));

function ranges(...pairs) {
  return {
    length: pairs.length,
    start: (index) => pairs[index][0],
    end: (index) => pairs[index][1],
  };
}

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
    this.isConnected = true;
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.currentSrc = "";
    this.currentTime = 0;
    this.duration = NaN;
    this.paused = true;
    this.seeking = false;
    this.seekable = ranges();
    this.buffered = ranges();
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

  addEventListener(type, listener, options) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options && options.once) });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((entry) => entry.listener !== listener));
  }

  listenersFor(type) {
    return (this.listeners.get(type) || []).map((entry) => entry.listener);
  }

  emit(type) {
    for (const entry of [...(this.listeners.get(type) || [])]) {
      if (entry.once) {
        this.removeEventListener(type, entry.listener);
      }
      entry.listener({ type, target: this });
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
  const timers = new Map();
  const observers = [];
  // Mirrors the preview ownership contract: show needs a current session and
  // clear only removes the preview owned by the given session.
  const previews = new Map();
  let nextId = 1;

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
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    YTWheelSettings: {
      DEFAULT_SETTINGS: { secondsPerHundredPixels: 2, inverted: true },
      loadSettings: () => Promise.resolve({ secondsPerHundredPixels: 2, inverted: true }),
      watchSettings: () => {},
    },
    YTProgressPreview: {
      createProgressPreview: () => ({
        show(video, targetTime, _bounds, session) {
          if (session && session.video === video && session.isCurrent()) {
            previews.set(video, { targetTime, session });
          }
        },
        clear(video, session) {
          const preview = previews.get(video);
          if (preview && preview.session === session) {
            previews.delete(video);
          }
        },
      }),
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const script of SCRIPTS) {
    vm.runInContext(script.source, context, { filename: script.name });
  }

  const player = new FakeElement("PLAYER");
  player.player = player;
  const video = new FakeElement("VIDEO", player);
  player.video = video;

  function drain(queue) {
    for (let round = 0; round < 20 && queue.size > 0; round += 1) {
      for (const id of [...queue.keys()]) {
        const callback = queue.get(id);
        if (callback) {
          queue.delete(id);
          callback();
        }
      }
    }
  }

  function wheel(deltaX) {
    const event = {
      defaultPrevented: false,
      deltaX,
      deltaY: 0,
      deltaMode: 0,
      composedPath: () => [video, player],
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    document.dispatch("wheel", event);
    return event;
  }

  function settle() {
    drain(frames);
    drain(timers);
    drain(frames);
  }

  function deliverMutations() {
    for (const observer of observers) {
      observer.callback([]);
    }
  }

  function enterAd(src) {
    player.classList.add("ad-showing");
    video.currentSrc = src;
    video.currentTime = 10;
    video.duration = 30;
    video.seekable = ranges([0, 30]);
  }

  // YouTube swaps the ad for content on the same element; the class change is
  // only delivered to MutationObservers later.
  function skipToContent(src) {
    player.classList.remove("ad-showing");
    video.currentSrc = src;
    video.currentTime = 300;
    video.duration = 600;
    video.seekable = ranges([0, 600]);
  }

  return {
    deliverMutations,
    drain,
    enterAd,
    frames,
    player,
    previews,
    settle,
    skipToContent,
    timers,
    video,
    wheel,
  };
}

test("seeks inside a seekable ad in both directions while playing", () => {
  const harness = createHarness();
  harness.enterAd("blob:ad");
  harness.video.paused = false;

  assert.equal(harness.wheel(100).defaultPrevented, true);
  harness.settle();
  assert.equal(harness.video.currentTime, 12);

  assert.equal(harness.wheel(-100).defaultPrevented, true);
  harness.settle();
  assert.equal(harness.video.currentTime, 10);
});

test("commits paused seeks inside a seekable ad in both directions", () => {
  const harness = createHarness();
  harness.enterAd("blob:ad");

  harness.wheel(-100);
  harness.drain(harness.frames);
  assert.equal(harness.previews.get(harness.video).targetTime, 8);
  harness.settle();
  assert.equal(harness.video.currentTime, 8);
  assert.equal(harness.previews.has(harness.video), false);

  harness.wheel(100);
  harness.settle();
  assert.equal(harness.video.currentTime, 10);
});

test("leaves ads without a real seekable range to YouTube", () => {
  const harness = createHarness();
  harness.enterAd("blob:ad");
  harness.video.seekable = ranges();

  const event = harness.wheel(100);
  harness.settle();

  assert.equal(event.defaultPrevented, false);
  assert.equal(harness.video.currentTime, 10);

  harness.video.seekable = ranges([5, 5]);
  assert.equal(harness.wheel(100).defaultPrevented, false);
});

test("keeps the duration fallback for content without a seekable range", () => {
  const harness = createHarness();
  harness.video.currentSrc = "blob:content";
  harness.video.duration = 60;
  harness.video.currentTime = 20;
  harness.video.paused = false;

  assert.equal(harness.wheel(100).defaultPrevented, true);
  harness.settle();
  assert.equal(harness.video.currentTime, 22);
});

test("never writes a pending paused ad target into the content that replaced it", () => {
  const harness = createHarness();
  harness.enterAd("blob:ad");

  harness.wheel(100);
  harness.drain(harness.frames);
  assert.equal(harness.previews.get(harness.video).targetTime, 12);

  harness.skipToContent("blob:content");
  harness.settle();
  assert.equal(harness.video.currentTime, 300);
  assert.equal(harness.previews.has(harness.video), false);

  harness.deliverMutations();
  harness.settle();
  assert.equal(harness.video.currentTime, 300);

  harness.wheel(100);
  harness.drain(harness.frames);
  assert.equal(harness.previews.get(harness.video).targetTime, 302);
  harness.settle();
  assert.equal(harness.video.currentTime, 302);
});

test("drops queued ad wheel input when the ad ends before the frame runs", () => {
  const harness = createHarness();
  harness.enterAd("blob:ad");
  harness.video.paused = false;

  harness.wheel(100);
  const [staleFrame] = harness.frames.values();
  harness.skipToContent("blob:content");
  harness.deliverMutations();

  assert.equal(harness.frames.size, 0);
  staleFrame();
  harness.settle();
  assert.equal(harness.video.currentTime, 300);

  harness.wheel(-100);
  harness.settle();
  assert.equal(harness.video.currentTime, 298);
});

test("a stale frame is a no-op even before the transition is observed", () => {
  const harness = createHarness();
  harness.enterAd("blob:ad");
  harness.video.paused = false;

  harness.wheel(100);
  harness.skipToContent("blob:content");
  harness.settle();

  assert.equal(harness.video.currentTime, 300);
});

test("a play handler from the ad session does nothing after the switch to content", () => {
  const harness = createHarness();
  harness.enterAd("blob:ad");

  harness.wheel(100);
  const stalePlayHandlers = harness.video.listenersFor("play");
  assert.equal(stalePlayHandlers.length, 1);

  harness.skipToContent("blob:content");
  harness.deliverMutations();
  assert.deepEqual(harness.video.listenersFor("play"), []);

  harness.video.paused = false;
  for (const handler of stalePlayHandlers) {
    handler({ type: "play", target: harness.video });
  }
  harness.video.emit("play");
  harness.settle();

  assert.equal(harness.video.currentTime, 300);
  assert.equal(harness.previews.has(harness.video), false);
});

test("play applies queued input and flushes the paused target of the current session", () => {
  const harness = createHarness();
  harness.video.currentSrc = "blob:content";
  harness.video.duration = 600;
  harness.video.seekable = ranges([0, 600]);
  harness.video.currentTime = 100;

  harness.wheel(100);
  harness.drain(harness.frames);
  assert.equal(harness.previews.get(harness.video).targetTime, 102);

  harness.video.emit("play");
  assert.equal(harness.video.currentTime, 102);
});

for (const resetEvent of ["emptied", "loadstart"]) {
  test(`${resetEvent} separates sessions on the same element and blob URL`, () => {
    const harness = createHarness();
    harness.video.currentSrc = "blob:same";
    harness.video.duration = 600;
    harness.video.seekable = ranges([0, 600]);
    harness.video.currentTime = 50;

    harness.wheel(100);
    harness.drain(harness.frames);
    assert.equal(harness.previews.get(harness.video).targetTime, 52);

    harness.video.emit(resetEvent);
    harness.video.currentTime = 0;
    harness.settle();
    assert.equal(harness.video.currentTime, 0);
    assert.equal(harness.previews.has(harness.video), false);

    harness.wheel(100);
    harness.drain(harness.frames);
    assert.equal(harness.previews.get(harness.video).targetTime, 2);
    harness.settle();
    assert.equal(harness.video.currentTime, 2);
  });

  test(`${resetEvent} drops queued wheel input on the same blob URL`, () => {
    const harness = createHarness();
    harness.video.currentSrc = "blob:same";
    harness.video.duration = 600;
    harness.video.seekable = ranges([0, 600]);
    harness.video.currentTime = 50;
    harness.video.paused = false;

    harness.wheel(100);
    harness.video.emit(resetEvent);
    harness.video.currentTime = 0;
    harness.settle();

    assert.equal(harness.video.currentTime, 0);
  });
}
