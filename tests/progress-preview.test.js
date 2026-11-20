const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateProgressRatio,
  createProgressPreview,
  formatMediaTime,
} = require("../src/content/progress-preview.js");

const ACTIVE_CLASS = "yt-wheel-progress-preview-active";
const PREVIEW_CLASS = "yt-wheel-progress-preview";
const BOUNDS = { minimum: 0, maximum: 100 };

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
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.classList = new FakeClassList();
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.textContent = "";
    this.className = "";
    this.id = "";
    this.isConnected = false;
    this.parentNode = null;
    this.closestElement = null;
    this.selectors = new Map();
  }

  append(child) {
    child.parentNode = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.parentNode = null;
    this.isConnected = false;
  }

  setAttribute() {}

  closest() {
    return this.closestElement;
  }

  querySelector(selector) {
    return this.selectors.get(selector) || null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement("html", this);
    this.documentElement.isConnected = true;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.documentElement.children.find((child) => child.id === id) || null;
  }
}

function createFixture() {
  const document = new FakeDocument();
  const observers = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }

    observe(target) {
      this.target = target;
    }

    disconnect() {
      this.disconnected = true;
    }

    trigger() {
      this.callback();
    }
  }

  global.MutationObserver = FakeMutationObserver;

  const player = new FakeElement("div", document);
  const progressBar = new FakeElement("div", document);
  const timeCurrent = new FakeElement("span", document);
  const video = new FakeElement("video", document);
  player.isConnected = true;
  progressBar.isConnected = true;
  timeCurrent.isConnected = true;
  video.isConnected = true;
  video.duration = 100;
  video.currentTime = 12;
  video.closestElement = player;
  player.selectors.set(".ytp-progress-bar", progressBar);
  player.selectors.set(".ytp-time-current", timeCurrent);

  return {
    observers,
    player,
    preview: createProgressPreview(),
    progressBar,
    timeCurrent,
    video,
  };
}

function createSession(video, generation) {
  let current = true;
  return {
    session: Object.freeze({
      video,
      generation,
      isCurrent: () => current,
    }),
    invalidate() {
      current = false;
    },
  };
}

function overlays(progressBar) {
  return progressBar.children.filter((child) => child.className === PREVIEW_CLASS);
}

function listenerFor(video, type) {
  return [...(video.listeners.get(type) || [])][0];
}

test("calculates preview position within VOD and DVR ranges", () => {
  assert.equal(calculateProgressRatio(25, { minimum: 0, maximum: 100 }), 0.25);
  assert.equal(calculateProgressRatio(150, { minimum: 100, maximum: 300 }), 0.25);
});

test("clamps preview position and rejects invalid ranges", () => {
  assert.equal(calculateProgressRatio(-10, { minimum: 0, maximum: 100 }), 0);
  assert.equal(calculateProgressRatio(120, { minimum: 0, maximum: 100 }), 1);
  assert.equal(calculateProgressRatio(10, { minimum: 10, maximum: 10 }), null);
  assert.equal(calculateProgressRatio(Number.NaN, { minimum: 0, maximum: 100 }), null);
});

test("formats optimistic VOD timestamps", () => {
  assert.equal(formatMediaTime(0), "0:00");
  assert.equal(formatMediaTime(65.9), "1:05");
  assert.equal(formatMediaTime(3665), "1:01:05");
});

test("replaces preview ownership and removes old session resources", () => {
  const fixture = createFixture();
  const first = createSession(fixture.video, 1);
  const second = createSession(fixture.video, 2);

  fixture.preview.show(fixture.video, 20, BOUNDS, first.session);
  const firstOverlay = overlays(fixture.progressBar)[0];
  const firstObserver = fixture.observers[0];
  const firstPlay = listenerFor(fixture.video, "play");
  const firstEmptied = listenerFor(fixture.video, "emptied");

  first.invalidate();
  fixture.preview.show(fixture.video, 80, BOUNDS, second.session);

  const currentOverlays = overlays(fixture.progressBar);
  assert.equal(currentOverlays.length, 1);
  assert.notEqual(currentOverlays[0], firstOverlay);
  assert.equal(currentOverlays[0].style.width, "80%");
  assert.equal(fixture.timeCurrent.textContent, "1:20");
  assert.equal(firstOverlay.isConnected, false);
  assert.equal(firstObserver.disconnected, true);
  assert.equal(fixture.video.listeners.get("play").has(firstPlay), false);
  assert.equal(fixture.video.listeners.get("emptied").has(firstEmptied), false);
  assert.equal(fixture.video.listeners.get("play").size, 1);
  assert.equal(fixture.video.listeners.get("emptied").size, 1);
});

test("stale callbacks and clear cannot remove a newer preview", () => {
  const fixture = createFixture();
  const first = createSession(fixture.video, 1);
  const second = createSession(fixture.video, 2);

  fixture.preview.show(fixture.video, 20, BOUNDS, first.session);
  const staleObserver = fixture.observers[0];
  const stalePlay = listenerFor(fixture.video, "play");
  const staleEmptied = listenerFor(fixture.video, "emptied");
  first.invalidate();
  fixture.preview.show(fixture.video, 80, BOUNDS, second.session);
  const secondOverlay = overlays(fixture.progressBar)[0];

  staleObserver.trigger();
  stalePlay();
  staleEmptied();
  fixture.preview.clear(fixture.video, first.session);

  assert.deepEqual(overlays(fixture.progressBar), [secondOverlay]);
  assert.equal(secondOverlay.isConnected, true);
  assert.equal(secondOverlay.style.width, "80%");
  assert.equal(fixture.timeCurrent.textContent, "1:20");
  assert.equal(fixture.player.classList.contains(ACTIVE_CLASS), true);
});

test("invalid sessions do not modify DOM or write stale media time during teardown", () => {
  const fixture = createFixture();
  const owner = createSession(fixture.video, 1);
  const invalid = createSession(fixture.video, 2);

  fixture.preview.show(fixture.video, 20, BOUNDS, owner.session);
  const ownerOverlay = overlays(fixture.progressBar)[0];
  owner.invalidate();
  invalid.invalidate();
  fixture.timeCurrent.textContent = "7:07";

  fixture.preview.show(fixture.video, 90, BOUNDS, invalid.session);
  fixture.preview.clear(fixture.video, invalid.session);

  assert.deepEqual(overlays(fixture.progressBar), [ownerOverlay]);
  assert.equal(ownerOverlay.style.width, "20%");
  assert.equal(fixture.timeCurrent.textContent, "7:07");

  fixture.preview.clear(fixture.video, owner.session);

  assert.equal(overlays(fixture.progressBar).length, 0);
  assert.equal(fixture.player.classList.contains(ACTIVE_CLASS), false);
  assert.equal(fixture.timeCurrent.textContent, "7:07");
});

test("owning clear restores the current media time and releases every resource", () => {
  const fixture = createFixture();
  const owner = createSession(fixture.video, 1);

  fixture.preview.show(fixture.video, 45, BOUNDS, owner.session);
  const observer = fixture.observers[0];
  assert.equal(fixture.timeCurrent.textContent, "0:45");

  fixture.preview.clear(fixture.video, owner.session);

  assert.equal(overlays(fixture.progressBar).length, 0);
  assert.equal(fixture.player.classList.contains(ACTIVE_CLASS), false);
  assert.equal(fixture.timeCurrent.textContent, "0:12");
  assert.equal(observer.disconnected, true);
  assert.equal(fixture.video.listeners.get("play").size, 0);
  assert.equal(fixture.video.listeners.get("emptied").size, 0);
});

test("observer keeps the target text only while its session is current", () => {
  const fixture = createFixture();
  const owner = createSession(fixture.video, 1);

  fixture.preview.show(fixture.video, 30, BOUNDS, owner.session);
  const observer = fixture.observers[0];

  fixture.timeCurrent.textContent = "0:12";
  observer.trigger();
  assert.equal(fixture.timeCurrent.textContent, "0:30");

  owner.invalidate();
  fixture.timeCurrent.textContent = "3:03";
  observer.trigger();

  assert.equal(fixture.timeCurrent.textContent, "3:03");
  assert.equal(overlays(fixture.progressBar).length, 0);
  assert.equal(fixture.player.classList.contains(ACTIVE_CLASS), false);
  assert.equal(observer.disconnected, true);
  assert.equal(fixture.video.listeners.get("play").size, 0);
  assert.equal(fixture.video.listeners.get("emptied").size, 0);
});

test("play by the owning session clears preview and restores current time", () => {
  const fixture = createFixture();
  const owner = createSession(fixture.video, 1);

  fixture.preview.show(fixture.video, 30, BOUNDS, owner.session);
  fixture.video.currentTime = 31;
  listenerFor(fixture.video, "play")();

  assert.equal(overlays(fixture.progressBar).length, 0);
  assert.equal(fixture.timeCurrent.textContent, "0:31");
  assert.equal(fixture.observers[0].disconnected, true);
  assert.equal(fixture.video.listeners.get("emptied").size, 0);
});

test("play after the session became stale clears without writing media time", () => {
  const fixture = createFixture();
  const owner = createSession(fixture.video, 1);

  fixture.preview.show(fixture.video, 30, BOUNDS, owner.session);
  owner.invalidate();
  fixture.timeCurrent.textContent = "9:09";
  listenerFor(fixture.video, "play")();

  assert.equal(overlays(fixture.progressBar).length, 0);
  assert.equal(fixture.timeCurrent.textContent, "9:09");
  assert.equal(fixture.observers[0].disconnected, true);
});

test("emptied clears the preview without writing the replaced media time", () => {
  const fixture = createFixture();
  const owner = createSession(fixture.video, 1);

  fixture.preview.show(fixture.video, 30, BOUNDS, owner.session);
  fixture.timeCurrent.textContent = "0:00";
  fixture.video.currentTime = 5;
  listenerFor(fixture.video, "emptied")();

  assert.equal(overlays(fixture.progressBar).length, 0);
  assert.equal(fixture.player.classList.contains(ACTIVE_CLASS), false);
  assert.equal(fixture.timeCurrent.textContent, "0:00");
  assert.equal(fixture.observers[0].disconnected, true);
  assert.equal(fixture.video.listeners.get("play").size, 0);
});

test("a new session never transfers the old target text", () => {
  const fixture = createFixture();
  const first = createSession(fixture.video, 1);
  const second = createSession(fixture.video, 2);

  fixture.preview.show(fixture.video, 20, BOUNDS, first.session);
  first.invalidate();
  fixture.preview.show(fixture.video, Number.NaN, BOUNDS, second.session);

  assert.equal(overlays(fixture.progressBar).length, 0);
  assert.equal(fixture.observers[0].disconnected, true);
  fixture.timeCurrent.textContent = "0:12";
  fixture.observers[0].trigger();
  assert.equal(fixture.timeCurrent.textContent, "0:12");

  fixture.preview.show(fixture.video, 60, BOUNDS, second.session);
  assert.equal(fixture.observers.length, 2);
  fixture.timeCurrent.textContent = "0:13";
  fixture.observers[1].trigger();
  assert.equal(fixture.timeCurrent.textContent, "1:00");
});
