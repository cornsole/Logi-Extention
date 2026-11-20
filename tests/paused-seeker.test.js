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

function createCoordinator(options) {
  const clock = new FakeClock();
  const settled = [];
  const settledSessions = [];
  const coordinator = createPausedSeekCoordinator({
    calculateSeekTime,
    isTimeBuffered,
    schedule: (callback) => callback(),
    setTimer: (callback, delay) => clock.setTimer(callback, delay),
    clearTimer: (timer) => clock.clearTimer(timer),
    now: () => clock.now,
    commitDelay: 80,
    throttleInterval: 50,
    onSettled: (video, session) => {
      settled.push(video);
      settledSessions.push(session);
    },
    ...options,
  });
  return { clock, coordinator, settled, settledSessions };
}

function createQueuedSchedule() {
  const queue = [];
  return {
    queue,
    schedule: (callback) => queue.push(callback),
    drain() {
      while (queue.length > 0) {
        queue.shift()();
      }
    },
  };
}

test("commits the first unbuffered target immediately and throttles the latest", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { session } = createSession(video, 1);
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  assert.equal(coordinator.seekBy(video, 10, bounds, session), 10);
  assert.deepEqual(video.assignments, [10]);
  assert.equal(coordinator.seekBy(video, 5, bounds, session), 15);
  assert.equal(coordinator.seekBy(video, 5, bounds, session), 20);
  assert.deepEqual(video.assignments, [10]);

  clock.advance(49);
  assert.deepEqual(video.assignments, [10]);
  clock.advance(1);
  assert.deepEqual(video.assignments, [10, 20]);
});

test("keeps loading the latest unbuffered target at the throttle cadence", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { session } = createSession(video, 1);
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 10, bounds, session);
  clock.advance(30);
  coordinator.seekBy(video, 10, bounds, session);
  clock.advance(20);
  assert.deepEqual(video.assignments, [10, 20]);

  clock.advance(10);
  coordinator.seekBy(video, 10, bounds, session);
  clock.advance(39);
  assert.deepEqual(video.assignments, [10, 20]);
  clock.advance(1);
  assert.deepEqual(video.assignments, [10, 20, 30]);
});

test("a new wheel gesture immediately preempts an older unbuffered seek", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { session } = createSession(video, 1);
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 10, bounds, session);
  assert.deepEqual(video.assignments, [10]);
  clock.advance(80);

  coordinator.seekBy(video, 10, bounds, session);
  assert.deepEqual(video.assignments, [10, 20]);
});

test("updates buffered targets without waiting for the gesture to end", () => {
  const video = new FakeVideo(createRanges([[0, 20]]));
  const { session } = createSession(video, 1);
  const { clock, coordinator, settled, settledSessions } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 1, bounds, session);
  coordinator.seekBy(video, 1, bounds, session);
  assert.deepEqual(video.assignments, [1]);

  video.finishSeek();
  assert.deepEqual(video.assignments, [1, 2]);
  video.finishSeek();

  clock.advance(80);
  assert.deepEqual(video.assignments, [1, 2]);
  assert.deepEqual(settled, [video]);
  assert.deepEqual(settledSessions, [session]);
});

test("throttles large unbuffered wheel input during playback", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  video.paused = false;
  const { session } = createSession(video, 1);
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 600 };

  for (let index = 0; index < 10; index += 1) {
    coordinator.seekBy(video, 20, bounds, session);
  }
  assert.deepEqual(video.assignments, [20]);

  clock.advance(50);
  assert.deepEqual(video.assignments, [20, 200]);
});

test("throttles buffered wheel input during playback", () => {
  const video = new FakeVideo(createRanges([[0, 100]]));
  video.paused = false;
  const { session } = createSession(video, 1);
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  for (let index = 0; index < 5; index += 1) {
    coordinator.seekBy(video, 2, bounds, session);
    video.finishSeek();
  }
  assert.deepEqual(video.assignments, [2]);

  clock.advance(50);
  assert.deepEqual(video.assignments, [2, 10]);
});

test("settles a reached target without seeking back while playback advances", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  video.paused = false;
  const { session } = createSession(video, 1);
  const { clock, coordinator, settled } = createCoordinator();
  const bounds = { minimum: 0, maximum: 600 };

  coordinator.seekBy(video, 30, bounds, session);
  video.finishSeek();
  video._currentTime = 30.5;
  clock.advance(80);

  assert.deepEqual(video.assignments, [30]);
  assert.deepEqual(settled, [video]);
});

test("flushes the latest throttled target immediately when playback starts", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { session } = createSession(video, 1);
  const { coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };
  video.addEventListener("play", () => coordinator.flush(video, session));

  coordinator.seekBy(video, 30, bounds, session);
  coordinator.seekBy(video, 10, bounds, session);
  assert.deepEqual(video.assignments, [30]);
  video.startPlayback();
  assert.deepEqual(video.assignments, [30, 40]);
});

test("the coordinator leaves play and emptied lifecycle to its caller", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { session } = createSession(video, 1);
  const { clock, coordinator, settled } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds, session);
  coordinator.seekBy(video, 10, bounds, session);
  video.startPlayback();
  video.dispatchEvent(new Event("emptied"));
  assert.deepEqual(video.assignments, [30]);
  assert.deepEqual(settled, []);

  clock.advance(80);
  assert.deepEqual(video.assignments, [30, 40]);
});

test("cancel discards a pending throttled target", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { session } = createSession(video, 1);
  const { clock, coordinator, settled, settledSessions } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds, session);
  coordinator.seekBy(video, 10, bounds, session);
  coordinator.cancel(video);
  clock.advance(200);

  assert.deepEqual(video.assignments, [30]);
  assert.deepEqual(settled, [video]);
  assert.deepEqual(settledSessions, [session]);
});

test("clamps the final target to media bounds", () => {
  const video = new FakeVideo(createRanges([]));
  video._currentTime = 18;
  const { session } = createSession(video, 1);
  const { clock, coordinator } = createCoordinator();
  const bounds = { minimum: 0, maximum: 20 };

  coordinator.seekBy(video, 5, bounds, session);
  coordinator.seekBy(video, 5, bounds, session);
  clock.advance(80);
  assert.deepEqual(video.assignments, [20]);
});

test("ignores seek and flush calls without a current session for the video", () => {
  const video = new FakeVideo(createRanges([[0, 20]]));
  const other = new FakeVideo(createRanges([[0, 20]]));
  const stale = createSession(video, 1);
  stale.invalidate();
  const { session: foreign } = createSession(other, 1);
  const { clock, coordinator, settled } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  assert.equal(coordinator.seekBy(video, 5, bounds), null);
  assert.equal(coordinator.seekBy(video, 5, bounds, stale.session), null);
  assert.equal(coordinator.seekBy(video, 5, bounds, foreign), null);
  assert.equal(coordinator.flush(video, stale.session), null);
  clock.advance(200);

  assert.deepEqual(video.assignments, []);
  assert.deepEqual(settled, []);
});

test("a stale throttle timer assigns nothing after its session is invalidated", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const old = createSession(video, 1);
  const { clock, coordinator, settledSessions } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds, old.session);
  coordinator.seekBy(video, 10, bounds, old.session);
  old.invalidate();
  clock.advance(200);

  assert.deepEqual(video.assignments, [30]);
  assert.deepEqual(settledSessions, [old.session]);
});

test("a stale idle timer assigns nothing after its session is invalidated", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const old = createSession(video, 1);
  const { clock, coordinator, settledSessions } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 10, bounds, old.session);
  clock.advance(60);
  coordinator.seekBy(video, 10, bounds, old.session);
  old.invalidate();
  clock.advance(200);

  assert.deepEqual(video.assignments, [10, 20]);
  assert.deepEqual(settledSessions, [old.session]);
});

test("a new session discards the old target and its pending timers", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const old = createSession(video, 1);
  const { clock, coordinator, settledSessions } = createCoordinator();
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds, old.session);
  coordinator.seekBy(video, 10, bounds, old.session);
  clock.advance(20);
  old.invalidate();
  const next = createSession(video, 2);
  assert.equal(coordinator.seekBy(video, 5, bounds, next.session), 35);
  assert.deepEqual(settledSessions, [old.session]);
  assert.deepEqual(video.assignments, [30, 35]);

  clock.advance(200);
  assert.deepEqual(video.assignments, [30, 35]);
});

test("a stale scheduled buffered preview cannot assign the old target", () => {
  const video = new FakeVideo(createRanges([[0, 20]]));
  const old = createSession(video, 1);
  const frames = createQueuedSchedule();
  const { clock, coordinator, settledSessions } = createCoordinator({
    schedule: frames.schedule,
  });
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 1, bounds, old.session);
  coordinator.seekBy(video, 1, bounds, old.session);
  assert.deepEqual(video.assignments, [1]);

  video.finishSeek();
  const bufferedPreview = frames.queue.pop();
  old.invalidate();
  bufferedPreview();
  frames.drain();
  clock.advance(200);

  assert.deepEqual(video.assignments, [1]);
  assert.deepEqual(settledSessions, [old.session]);
});

test("a stale session cannot flush or settle the newer session", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const old = createSession(video, 1);
  const frames = createQueuedSchedule();
  const { clock, coordinator, settledSessions } = createCoordinator({
    schedule: frames.schedule,
  });
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds, old.session);
  assert.deepEqual(video.assignments, [30]);

  old.invalidate();
  const next = createSession(video, 2);
  assert.equal(coordinator.seekBy(video, 5, bounds, next.session), 35);
  assert.deepEqual(settledSessions, [old.session]);
  assert.deepEqual(video.assignments, [30, 35]);

  assert.equal(coordinator.flush(video, old.session), null);
  frames.drain();
  assert.deepEqual(video.assignments, [30, 35]);
  assert.deepEqual(settledSessions, [old.session]);

  video.finishSeek();
  clock.advance(80);
  assert.deepEqual(settledSessions, [old.session, next.session]);
});

test("cancel invalidates a queued seek completion", () => {
  const video = new FakeVideo(createRanges([[0, 2]]));
  const { session } = createSession(video, 1);
  const frames = createQueuedSchedule();
  const { clock, coordinator, settledSessions } = createCoordinator({
    schedule: frames.schedule,
  });
  const bounds = { minimum: 0, maximum: 100 };

  coordinator.seekBy(video, 30, bounds, session);
  clock.advance(20);
  coordinator.seekBy(video, 10, bounds, session);
  coordinator.cancel(video);
  video.seeking = false;
  frames.drain();
  video.finishSeek();
  clock.advance(200);

  assert.deepEqual(video.assignments, [30]);
  assert.deepEqual(settledSessions, [session]);
});
