// The spinner over the body while the page gets it ready (src/body_studio/static/busy.js), on a
// clock the test moves. Run by tests/unit/test_busy_js.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Busy, KEEP_FOR, SHOW_AFTER, SLOW_AFTER } from "../../src/body_studio/static/busy.js";

// a clock and timers the test moves by hand, and every render
function rig() {
  let t = 1000, id = 0;
  const timers = new Map(), seen = [];
  const busy = new Busy((s) => seen.push(s), {
    now: () => t,
    later: (f, ms) => { timers.set(++id, [t + ms, f]); return id; },
    cancel: (k) => timers.delete(k),
  });
  const wait = (ms) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers].filter(([, [at]]) => at <= end).sort((a, b) => a[1][0] - b[1][0])[0];
      if (!due) break;
      timers.delete(due[0]); t = due[1][0]; due[1][1]();
    }
    t = end;
  };
  return { busy, seen, wait, last: () => seen[seen.length - 1] || { shown: false } };
}

test("a step over in a moment shows nothing", () => {
  const { busy, seen, wait } = rig();
  busy.set("body", "Loading Mia…");
  wait(SHOW_AFTER - 50);
  busy.set("body", null);
  wait(5000);
  assert.ok(seen.every((s) => !s.shown));
});

test("a longer step shows the spinner and what it is doing, then goes", () => {
  const { busy, wait, last } = rig();
  busy.set("body", "Loading Mia…");
  wait(SHOW_AFTER + 10);
  assert.deepEqual(last(), { shown: true, text: "Loading Mia…", slow: "" });
  wait(2000);
  busy.set("body", null);
  assert.equal(last().shown, false);
});

test("once shown it stays long enough to see, with its last words", () => {
  const { busy, wait, last } = rig();
  busy.set("rig", "Finding the skeleton…");
  wait(SHOW_AFTER);
  busy.set("rig", null);
  assert.deepEqual(last(), { shown: true, text: "Finding the skeleton…", slow: "" });
  wait(KEEP_FOR - 10);
  assert.equal(last().shown, true);
  wait(20);
  assert.equal(last().shown, false);
});

test("steps one after another: one spinner, no gap, the latest step's words", () => {
  const { busy, seen, wait, last } = rig();
  busy.set("body", "Loading Mia…");
  wait(SHOW_AFTER + 100);
  busy.set("rig", "Finding the skeleton…");
  busy.set("body", null);
  assert.deepEqual(last(), { shown: true, text: "Finding the skeleton…", slow: "" });
  busy.set("rig", "Getting the body ready to move…");
  wait(300);
  busy.set("rig", null);
  wait(KEEP_FOR);
  const shown = seen.map((s) => s.shown);
  assert.deepEqual(shown.slice(shown.indexOf(true)).filter((v, k, a) => k === 0 || v !== a[k - 1]), [true, false]);
});

test("after a while, why it takes long", () => {
  const { busy, wait, last } = rig();
  busy.set("rig", "Finding the skeleton…", { slow: "The first time takes longer." });
  wait(SLOW_AFTER - 10);
  assert.equal(last().slow, "");
  wait(20);
  assert.equal(last().slow, "The first time takes longer.");
  // (a new step's words keep when the step began)
  busy.set("rig", "Still finding…", { slow: "The first time takes longer." });
  assert.equal(last().slow, "The first time takes longer.");
});

test("shown at once before a step that holds the page", () => {
  const { busy, wait, last } = rig();
  busy.set("rig", "Getting the body ready to move…", { now: true });
  assert.equal(last().shown, true);
  busy.set("rig", null);
  wait(KEEP_FOR);
  assert.equal(last().shown, false);
  assert.equal(busy.busy, false);
});
