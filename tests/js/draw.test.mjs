// When the page draws a frame (src/body_studio/static/draw.js). Run by tests/unit/test_draw_js.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Drawing, HEARTBEAT } from "../../src/body_studio/static/draw.js";

// the frames drawn over `ms` at 60 a second, from `t0`
function frames(d, t0, ms, opts = () => ({})) {
  let n = 0;
  for (let k = 0; k < Math.round(ms * 60 / 1000); k++) {
    const t = t0 + k * 1000 / 60, o = opts(t);
    if (d.due(t, o.moved, o.keep)) n++;
  }
  return n;
}

test("the first frame is drawn", () => {
  assert.equal(new Drawing().due(0), true);
});

test("a still page draws only a few frames a second", () => {
  const d = new Drawing();
  const n = frames(d, 0, 2000);
  assert.ok(n <= Math.ceil(2000 / HEARTBEAT) + 1, `${n} frames`);
  assert.ok(n >= Math.floor(2000 / HEARTBEAT) - 1, `${n} frames`);   // (but some: nothing missed stays missed)
});

test("a moving camera or a part that animates draws every frame", () => {
  assert.equal(frames(new Drawing(), 0, 1000, () => ({ moved: true })), 60);
  assert.equal(frames(new Drawing(), 0, 1000, () => ({ keep: true })), 60);
});

test("redraw draws the next frame, and every frame for as long as asked", () => {
  const d = new Drawing();
  d.due(0);
  assert.equal(d.due(20), false);
  d.redraw(30);
  assert.equal(d.due(40), true);
  assert.equal(d.due(60), false);
  d.redraw(100, 300);                        // (input: a moment of frames)
  assert.equal(frames(d, 110, 290), 17);     // (every frame up to 400)
  assert.equal(d.due(420), false);
});
