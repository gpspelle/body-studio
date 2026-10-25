// The Compare tool's maths (src/body_studio/static/matchview.js). Run by tests/unit/test_matchview_js.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS, around, clock, frameRect, fromFrame, sideBySide, step, toFrame, viewAt, viewIn } from "../../src/body_studio/static/matchview.js";

test("a portrait frame fills the window's height, centred", () => {
  const r = frameRect(480, 848, 1280, 800);
  assert.equal(r.height, 800);
  assert.ok(Math.abs(r.width - 480 * 800 / 848) < 1e-9);
  assert.ok(Math.abs(r.left - (1280 - r.width) / 2) < 1e-9);
  assert.equal(r.top, 0);
  // a landscape one in a tall window fills its width
  const l = frameRect(1920, 1080, 400, 900);
  assert.equal(l.width, 400);
  assert.ok(Math.abs(l.top - (900 - 225) / 2) < 1e-9);
  // no video yet: the whole box, never NaN
  assert.deepEqual(frameRect(0, 0, 300, 200), { left: 0, top: 0, width: 300, height: 200 });
});

test("a click on the frame is a spot on it and back; off it is nothing", () => {
  const r = frameRect(480, 848, 1280, 800);
  const [u, v] = toFrame(r.left + r.width / 4, 600, r);
  assert.ok(Math.abs(u - 0.25) < 1e-9 && Math.abs(v - 0.75) < 1e-9);
  const [x, y] = fromFrame(u, v, r);
  assert.ok(Math.abs(x - (r.left + r.width / 4)) < 1e-9 && Math.abs(y - 600) < 1e-9);
  assert.equal(toFrame(r.left - 1, 400, r), null);
  assert.equal(toFrame(r.left + 5, 801, r), null);
});

test("stepping half a second stays inside the video", () => {
  assert.equal(step(10, 0.5, 229), 10.5);
  assert.equal(step(0.2, -0.5, 229), 0);
  assert.equal(step(228.8, 0.5, 229), 229);
  assert.equal(step(3, 0.5, NaN), 3.5);           // (its length not known yet)
  assert.equal(step(0.1 + 0.2, 0, 10), 0.3);      // (no float dust)
});

test("the clock reads as compare.py writes it", () => {
  assert.deepEqual([0, 9.94, 83.5, 600].map(clock), ["0:00.0", "0:09.9", "1:23.5", "10:00.0"]);
});

test("the kept view at a time, and those either side", () => {
  const views = [{ id: "a", t: 12 }, { id: "b", t: 83.5 }, { id: "c", t: 84 }];
  assert.equal(viewAt(views, 83.6).id, "b");
  assert.equal(viewAt(views, 83.9).id, "c");
  assert.equal(viewAt(views, 50), null);
  assert.deepEqual([around(views, 50).prev.id, around(views, 50).next.id], ["a", "b"]);
  assert.equal(around(views, 12).prev, null);
  assert.equal(around(views, 84).next, null);
  assert.deepEqual(KINDS, ["missing", "wrong", "remove", "note"]);   // (compare.py KINDS)
});

test("the frame and the room side by side, the same size, centred as a pair", () => {
  const area = { left: 0, top: 0, width: 908, height: 800 };      // a 1280 x 800 window less the panel
  const { video, room, across } = sideBySide(480, 848, area);
  assert.ok(across);
  assert.equal(video.height, room.height);
  assert.equal(video.width, room.width);
  assert.ok(Math.abs(video.width / video.height - 480 / 848) < 1e-9);
  assert.ok(Math.abs(room.left - (video.left + video.width + 8)) < 1e-9);
  assert.ok(Math.abs((video.left + room.left + room.width) / 2 - 454) < 1e-9);   // (the pair centred)
  assert.ok(video.height <= 800 && 2 * video.width + 8 <= 908 + 1e-9);
  // a phone (the panel below): one over the other
  const tall = sideBySide(480, 848, { left: 0, top: 0, width: 390, height: 440 });
  assert.ok(!tall.across);
  assert.ok(Math.abs(tall.room.top - (tall.video.top + tall.video.height + 8)) < 1e-9);
  assert.equal(tall.room.left, tall.video.left);
});

test("the camera's whole view lands in the room's rect", () => {
  const r = { left: 460, top: 20, width: 400, height: 700 };
  const o = viewIn(r, 1280, 800);
  assert.deepEqual(o, { fullWidth: 400, fullHeight: 700, x: -460, y: -20, width: 1280, height: 800, aspect: 400 / 700 });
  // (three.js: a canvas pixel px is at (px + x) / fullWidth across the camera's view: the rect's edges at 0 and 1)
  assert.equal((r.left + o.x) / o.fullWidth, 0);
  assert.equal((r.left + r.width + o.x) / o.fullWidth, 1);
  assert.equal((r.top + r.height + o.y) / o.fullHeight, 1);
});
