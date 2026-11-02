const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateSeekTime } = require("../src/content/wheel-normalizer.js");
const { createPausedSeekCoordinator } = require("../src/content/paused-seeker.js");

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.assignments = [];
    this._currentTime = 0;
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    this._currentTime = value;
    this.assignments.push(value);
  }
}

function createCoordinator(options) {
  return createPausedSeekCoordinator({
    calculateSeekTime,
    schedule: (callback) => callback(),
    setTimer: () => 1,
    clearTimer: () => {},
    ...options,
  });
}

test("allows only one paused seek at a time and keeps the latest accumulated target", () => {
  const video = new FakeVideo();
  const coordinator = createCoordinator();
  const bounds = { minimum: 0, maximum: 20 };

  coordinator.seekBy(video, 1, bounds);
  coordinator.seekBy(video, 1, bounds);
  coordinator.seekBy(video, 1, bounds);

  assert.deepEqual(video.assignments, [1]);

  video.dispatchEvent(new Event("seeked"));
  assert.deepEqual(video.assignments, [1, 3]);

  video.dispatchEvent(new Event("seeked"));
  assert.deepEqual(video.assignments, [1, 3]);
});

test("exposes the latest target immediately and settles only after the final seek", () => {
  const video = new FakeVideo();
  const settled = [];
  const coordinator = createCoordinator({
    onSettled: (settledVideo) => settled.push(settledVideo),
  });
  const bounds = { minimum: 0, maximum: 20 };

  assert.equal(coordinator.seekBy(video, 1, bounds), 1);
  assert.equal(coordinator.seekBy(video, 2, bounds), 3);
  assert.deepEqual(settled, []);

  video.dispatchEvent(new Event("seeked"));
  assert.deepEqual(settled, []);

  video.dispatchEvent(new Event("seeked"));
  assert.deepEqual(settled, [video]);
});

test("clamps accumulated paused seeks to media bounds", () => {
  const video = new FakeVideo();
  video._currentTime = 18;
  const coordinator = createCoordinator();
  const bounds = { minimum: 0, maximum: 20 };

  coordinator.seekBy(video, 5, bounds);
  coordinator.seekBy(video, 5, bounds);
  assert.deepEqual(video.assignments, [20]);
});

test("reset discards queued paused seeks", () => {
  const video = new FakeVideo();
  const coordinator = createCoordinator();
  const bounds = { minimum: 0, maximum: 20 };

  coordinator.seekBy(video, 1, bounds);
  coordinator.seekBy(video, 1, bounds);
  coordinator.reset(video);
  video.dispatchEvent(new Event("seeked"));

  assert.deepEqual(video.assignments, [1]);
});
