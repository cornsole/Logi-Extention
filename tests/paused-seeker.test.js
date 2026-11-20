const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateSeekTime,
  isTimeBuffered,
} = require("../src/content/wheel-normalizer.js");
const { createPausedSeekCoordinator } = require("../src/content/paused-seeker.js");

function createRanges(entries) {
  return {
    length: entries.length,
    start(index) {
      return entries[index][0];
    },
    end(index) {
      return entries[index][1];
    },
  };
}

class FakeVideo extends EventTarget {
  constructor(buffered) {
    super();
    this.paused = true;
    this.seeking = false;
    this.buffered = buffered || createRanges([]);
    this.assignments = [];
    this._currentTime = 0;
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    this._currentTime = value;
    this.seeking = true;
    this.assignments.push(value);
  }

  finishSeek() {
    this.seeking = false;
    this.dispatchEvent(new Event("seeked"));
  }

  startPlayback() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimer(callback, delay) {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { callback, due: this.now + delay });
    return id;
  }

  clearTimer(id) {
    this.tasks.delete(id);
  }

  advance(milliseconds) {
    const destination = this.now + milliseconds;
    while (true) {
      const next = Array.from(this.tasks.entries())
        .filter(([, task]) => task.due <= destination)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!next) {
        break;
      }
      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.due;
      task.callback();
    }
    this.now = destination;
  }
}

function createCoordinator(options) {
  const clock = new FakeClock();
  const settled = [];
  const coordinator = createPausedSeekCoordinator({
    calculateSeekTime,
    isTimeBuffered,
    schedule: (callback) => callback(),
    setTimer: (callback, delay) => clock.setTimer(callback, delay),
    clearTimer: (timer) => clock.clearTimer(timer),
    commitDelay: 80,
    maxCommitDelay: 100,
    onSettled: (video) => settled.push(video),
    ...options,
  });
  return { clock, coordinator, settled };
}

test("commits only the final unbuffered target after the wheel gesture ends", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  assert.equal(coordinator.seekBy(video, 10, bounds), 10);
  assert.equal(coordinator.seekBy(video, 5, bounds), 15);
  assert.equal(coordinator.seekBy(video, 5, bounds), 20);
  assert.deepEqual(video.assignments, []);

  clock.advance(79);
  assert.deepEqual(video.assignments, []);
  clock.advance(1);
  assert.deepEqual(video.assignments, [20]);
});

test("commits a checkpoint during a long unbuffered wheel gesture", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 10, bounds);
  clock.advance(30);
  coordinator.seekBy(video, 10, bounds);
  clock.advance(30);
  coordinator.seekBy(video, 10, bounds);
  clock.advance(40);
  assert.deepEqual(video.assignments, [30]);

  coordinator.seekBy(video, 10, bounds);
  clock.advance(40);
  coordinator.seekBy(video, 10, bounds);
  clock.advance(80);
  assert.deepEqual(video.assignments, [30, 50]);
});

test("a newer wheel gesture preempts an older final seek after its idle delay", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 10, bounds);
  clock.advance(80);
  assert.deepEqual(video.assignments, [10]);

  coordinator.seekBy(video, 10, bounds);
  clock.advance(80);
  assert.deepEqual(video.assignments, [10, 20]);
});

test("updates buffered targets without waiting for the gesture to end", () => {
  const video = new FakeVideo(createRanges([[0, 20]]));
  const { clock, coordinator, settled } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 1, bounds);
  coordinator.seekBy(video, 1, bounds);
  assert.deepEqual(video.assignments, [1]);

  video.finishSeek();
  assert.deepEqual(video.assignments, [1, 2]);
  video.finishSeek();

  clock.advance(80);
  assert.deepEqual(video.assignments, [1, 2]);
  assert.deepEqual(settled, [video]);
});

test("flushes the latest target immediately when playback starts", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds);
  assert.deepEqual(video.assignments, []);
  video.startPlayback();
  assert.deepEqual(video.assignments, [30]);
});

test("cancel discards a pending wheel target", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { clock, coordinator, settled } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds);
  coordinator.cancel(video);
  clock.advance(200);

  assert.deepEqual(video.assignments, []);
  assert.deepEqual(settled, [video]);
});

test("clamps the final target to media bounds", () => {
  const video = new FakeVideo(createRanges([]));
  video._currentTime = 18;
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 20 };

  coordinator.seekBy(video, 5, bounds);
  coordinator.seekBy(video, 5, bounds);
  clock.advance(80);
  assert.deepEqual(video.assignments, [20]);
});
