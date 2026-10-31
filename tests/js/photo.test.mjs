// Take a photo's maths (src/body_studio/static/photo.js). Run by tests/unit/test_photo_js.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHOTO, PIECE, finishLook, frameOn, groundAt, keep, photoName, photoSize, pieceName, progress, sunWay } from "../../src/body_studio/static/photo.js";
import { FINISHES } from "../../src/body_studio/static/decor/shapes.js";

test("the photo has the window's shape, its long side PHOTO.long, in even pixels", () => {
  assert.deepEqual(photoSize(1280, 800), [1600, 1000]);
  const [w, h] = photoSize(390, 844);
  assert.equal(h, PHOTO.long);
  assert.equal(w % 2, 0);
  assert.ok(Math.abs(w / h - 390 / 844) < 0.01);
  assert.deepEqual(photoSize(1000, 625, 400), [400, 250]);
  // no window yet: a landscape photo, never NaN
  const [a, b] = photoSize(0, 0);
  assert.ok(a > b && Number.isFinite(b));
});

test("only the room and its decor go in: not the body, its clothes, the handles, shadow cards or the sky dome", () => {
  const room = { mesh: true, visible: true, inRoom: true };
  assert.equal(keep(room), true);
  assert.equal(keep({ ...room, item: "round_table" }), true);
  assert.equal(keep({ ...room, inRoom: false }), false);          // clothes, the body's mesh
  assert.equal(keep({ ...room, visible: false }), false);
  assert.equal(keep({ ...room, splat: true }), false);
  assert.equal(keep({ ...room, handle: true }), false);
  assert.equal(keep({ ...room, shades: true }), false);
  assert.equal(keep({ ...room, item: "sky_dome" }), false);
  assert.equal(keep({ ...room, mesh: false }), false);            // groups, lights
});

test("each decor finish has a look: glass lets light through, bulbs give it", () => {
  for (const f of FINISHES) assert.ok(finishLook(f).kind);
  const glass = finishLook(FINISHES.find((f) => f.name === "glass"));
  assert.equal(glass.kind, "glass");
  assert.equal(glass.transmission, 1);
  assert.ok(glass.ior > 1.3 && glass.ior < 1.7);
  const glow = finishLook(FINISHES.find((f) => f.glow));
  assert.equal(glow.kind, "glow");
  assert.ok(glow.power > 1);
  const brass = finishLook(FINISHES.find((f) => f.name === "metal"));
  assert.deepEqual([brass.kind, brass.metalness], ["solid", 1]);
});

test("progress runs 0 to 100 and is done at the passes asked for", () => {
  assert.deepEqual(progress(0, 400), { done: false, part: 0, percent: 0 });
  assert.equal(progress(200, 400).percent, 50);
  assert.equal(progress(399, 400).done, false);
  assert.equal(progress(400, 400).done, true);
  assert.equal(progress(900, 400).percent, 100);
});

test("the sun turns with the room and comes from above", () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const w = sunWay([2, 5, 3], I);
  assert.ok(Math.abs(Math.hypot(...w) - 1) < 1e-9);
  assert.ok(w[1] > 0.7);
  // a room turned half round about y (and moved, and scaled): the sun's way turns, length 1
  const H = [-2, 0, 0, 0, 0, 2, 0, 0, 0, 0, -2, 0, 5, 1, 7, 1];
  const v = sunWay([2, 5, 3], H);
  assert.ok(Math.abs(v[0] + w[0]) < 1e-9 && Math.abs(v[1] - w[1]) < 1e-9 && Math.abs(v[2] + w[2]) < 1e-9);
});

test("a photo is saved under the room's name and the time", () => {
  const when = new Date(2026, 9, 30, 9, 5);
  assert.equal(photoName("_sample_venue.ply", when), "venue-2026-10-30-0905.png");
  assert.equal(photoName("My flat (2)", when), "My-flat-2--2026-10-30-0905.png");
  assert.equal(photoName(null, when), "room-2026-10-30-0905.png");
});

test("a piece's photo is quicker than the room's: smaller, fewer passes and bounces", () => {
  assert.ok(PIECE.long < PHOTO.long && PIECE.passes < PHOTO.passes && PIECE.bounces < PHOTO.bounces);
});

test("a piece is framed from where the camera looks at it, as far as fits it in the photo", () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // looking from 10 m in front: the camera comes in on the same line
  const e = frameOn([0, 1, 10], [0, 1, 0], 1, 60, 1, 1);
  assert.ok(near(e, [0, 1, 2]));              // 1 / sin(30°) = 2
  // a tall photo is narrower across: further back
  const tall = frameOn([0, 1, 10], [0, 1, 0], 1, 60, 0.5, 1);
  assert.ok(tall[2] > 2 && tall[0] === 0);
  // from above and to the side: the same way round, the same distance
  const s = frameOn([3, 4, 0], [0, 0, 0], 1, 60, 1, 1);
  assert.ok(Math.abs(Math.hypot(...s) - 2) < 1e-9 && Math.abs(s[1] / s[0] - 4 / 3) < 1e-9);
  // the margin moves it back; standing in the piece: from the front, a little above
  assert.ok(frameOn([0, 1, 10], [0, 1, 0], 1, 60, 1, 1.2)[2] > 2);
  const inside = frameOn([0, 0, 0], [0, 0, 0], 1, 60);
  assert.ok(inside[2] > 0 && inside[1] > 0 && inside.every(Number.isFinite));
  // a tiny piece still gets a camera that isn't in it
  assert.ok(frameOn([0, 0, 5], [0, 0, 0], 0, 60)[2] > 0);
});

test("a piece stands on its own floor; one that hangs gets the room's", () => {
  assert.equal(groundAt(0.75, 0), 0.75);        // flowers on a table
  assert.equal(groundAt(0, 0), 0);
  assert.equal(groundAt(2.6, 0), 0);            // an overhead cloud of flowers
  assert.equal(groundAt(3.2, 1), 1);
});

test("a piece's photo is named after the room and the piece", () => {
  const when = new Date(2026, 9, 31, 12, 5);
  assert.equal(pieceName("workspace/_sample_venue/run_1/venue.room.json", "custom_arch", when).endsWith("-custom-arch-2026-10-31-1205.png"), true);
  assert.equal(pieceName(null, "floral_cloud", when), "room-floral-cloud-2026-10-31-1205.png");
});
