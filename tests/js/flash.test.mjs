// The tattoo studio (src/body_studio/static/flash.js, and lying and reclining in walk.js) against
// the sample studio's map and the MakeHuman test body's rig. Run by tests/unit/test_flash_js.py:
//   ROOM_JSON=/path/to/tattoo_studio_clean.room.json RIG_JSON=/path/to/body.rig.json node --test tests/js/flash.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Skeleton, q, v3 } from "../../src/body_studio/static/pose.js";
import { Walker } from "../../src/body_studio/static/walk.js";
import { Placement, RoomMap } from "../../src/body_studio/static/room.js";
import { FLASH, STARTERS, alongTrunk, artistView, gridNormal, mirrorView, nearStation, nearestOnBones, sheetLayout, stationFor } from "../../src/body_studio/static/flash.js";

const map = JSON.parse(readFileSync(process.env.ROOM_JSON, "utf8"));
const rig = JSON.parse(readFileSync(process.env.RIG_JSON, "utf8"));
const fx = map.fixtures;
const H = rig.height, U = rig.frame.up, F = rig.frame.front, L = rig.frame.left, DT = 1 / 60;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (±${tol})`);
const run = (w, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT, {}); };
const joint = (name) => rig.joints.find((j) => j.name === name).pos;

function inStudio() {
  const r = new RoomMap(map), k = H / 1.75, P = new Placement(rig, r, k, r.openWay());
  const sk = new Skeleton(rig), w = new Walker(sk, rig), o = rig.frame.origin;
  const stand = (x, z) => { w.pos = v3.sub(P.toBody([x, 0, z]), o); w.update(DT, {}); };
  return { r, P, sk, w, k, stand, at: (n) => P.toMap(sk.P[sk.index(n)]) };
}

test("the studio's map knows its furniture", () => {
  for (const name of ["bed", "chair", "rests", "flash", "mirror"]) assert.ok(fx[name], name);
  near(fx.bed.at[1], 0.68, 0.02, "the bed's top");
  near(fx.chair.height, 0.5, 0.02, "the chair's seat");
  assert.equal(fx.rests.length, 2);
  assert.ok(new RoomMap(map).clear(...map.start), "the body starts on free floor");
});

test("the designs hang in rows on the flash wall, none over another, all on it", () => {
  for (const n of [1, 5, 12, 20]) {
    const S = sheetLayout(fx.flash, n), right = fx.flash.right;
    assert.equal(S.length, n);
    for (const s of S) {
      const d = v3.sub(s.centre, fx.flash.centre);
      assert.ok(Math.abs(v3.dot(d, right)) + s.w / 2 <= fx.flash.width / 2 + 1e-6, `across ${n}`);
      assert.ok(Math.abs(d[1]) + s.h / 2 <= fx.flash.height / 2 + 1e-6, `up ${n}`);
      assert.ok(s.h <= FLASH.max + 1e-9);
      near(s.w / s.h, FLASH.aspect, 1e-9);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = v3.sub(S[i].centre, S[j].centre);
      assert.ok(Math.abs(v3.dot(d, right)) >= S[i].w - 1e-6 || Math.abs(d[1]) >= S[i].h - 1e-6, `sheets ${i} and ${j} of ${n} overlap`);
    }
    if (n > 1) assert.ok(S[0].centre[1] >= S[n - 1].centre[1], "from the top");
  }
  assert.ok(sheetLayout(fx.flash, STARTERS.length)[0].h > 0.25, "the starters are big enough to see");
});

test("where a tattoo is made, from where it is", () => {
  const pel = joint("pelvis"), neck = joint("neck");
  const cases = [
    [{ bone: "elbow_l", normal: F }, { kind: "chair", arm: "l" }],
    [{ bone: "shoulder_r", normal: v3.scale(L, -1) }, { kind: "chair", arm: "r" }],
    [{ bone: "neck", normal: F }, { kind: "chair", arm: null }],
    [{ bone: "trunk", normal: v3.scale(F, -1), along: 0.5 }, { kind: "lie", face: "down", raise: null }],
    [{ bone: "trunk", normal: F, along: 0.85 }, { kind: "chair", arm: null }],
    [{ bone: "trunk", normal: F, along: 0.2 }, { kind: "lie", face: "up", raise: null }],
    [{ bone: "trunk", normal: L, along: 0.5 }, { kind: "lie", face: "up", raise: "l" }],
    [{ bone: "leg_r", normal: v3.scale(F, -1) }, { kind: "lie", face: "down", raise: null }],
    [{ bone: "knee_l", normal: F }, { kind: "lie", face: "up", raise: null }],
  ];
  for (const [spot, want] of cases) assert.deepEqual(stationFor(spot, F, L), want, JSON.stringify(spot));
  near(alongTrunk(pel, pel, neck), 0, 1e-9); near(alongTrunk(neck, pel, neck), 1, 1e-9);
});

for (const face of ["down", "up"]) {
  test(`lying face ${face} on the bed: along it, on its top, in its middle; up again`, () => {
    const { P, sk, w, k, stand, at } = inStudio();
    stand(fx.bed.at[0], fx.bed.at[2] + 0.9);                  // beside the bed
    const before = w.pos.slice();
    assert.ok(w.restAt({ kind: "lie", at: P.toBody(fx.bed.at), head: P.wayToBody([fx.bed.head[0], fx.bed.head[2]]), face }));
    run(w, 3);
    assert.equal(w.resting, "lie");
    assert.ok(!w.busy, "lying still");
    // the skin's lowest point on the bed's top
    near(w.lowest() / k - v3.dot(rig.frame.origin, U) / k + 0, fx.bed.at[1] + v3.dot(P.toBody([0, 0, 0]), U) / k - v3.dot(rig.frame.origin, U) / k, 0.012, "on the bed");
    // along the bed, the head at its head end
    const head = at("head_end"), feet = v3.scale(v3.add(at("ankle_l"), at("ankle_r")), 0.5);
    const along = v3.unit([head[0] - feet[0], 0, head[2] - feet[2]]);
    assert.ok(along[0] * fx.bed.head[0] + along[2] * fx.bed.head[2] > 0.97, "along the bed, head first");
    const mid = v3.scale(v3.add(head, feet), 0.5);
    assert.ok(Math.hypot(mid[0] - fx.bed.at[0], mid[2] - fx.bed.at[2]) < 0.06, `in its middle (${mid})`);
    for (const p of [head, feet]) {
      const d = [p[0] - fx.bed.at[0], p[2] - fx.bed.at[2]];
      assert.ok(Math.abs(d[0] * fx.bed.head[0] + d[1] * fx.bed.head[2]) < fx.bed.length / 2 + 0.12, "on the bed, not off its end");
    }
    // the chest faces the ceiling (face up) or the bed (face down)
    const chest = P.wayToMap(q.rot(sk.W[sk.index("chest")], F)), upness = v3.dot(q.rot(sk.W[sk.index("chest")], F), U);
    assert.ok(face === "up" ? upness > 0.9 : upness < -0.9, `the chest faces ${face}: ${upness} ${chest}`);
    // F again: up, back where it stood
    w.standUp();
    run(w, 3);
    assert.equal(w.rest, null);
    assert.ok(v3.len(v3.sub(w.pos, before)) < 0.02 * H, "stood up where it was");
    near(v3.dot(q.rot(sk.W[sk.index("chest")], F), U), 0, 0.15, "standing again");
  });
}

test("lying face up with an arm over the head, for the ribs", () => {
  const { P, sk, w, stand } = inStudio();
  stand(fx.bed.at[0], fx.bed.at[2] + 0.9);
  w.restAt({ kind: "lie", at: P.toBody(fx.bed.at), head: P.wayToBody([fx.bed.head[0], fx.bed.head[2]]), face: "up", raise: "l" });
  run(w, 3);
  const a = sk.angles[sk.index("shoulder_l")], b = sk.angles[sk.index("shoulder_r")];
  assert.ok(Math.hypot(a.flex, a.side) > 140, `the left arm up (${a.side})`);
  assert.ok(Math.hypot(b.flex, b.side) < 40, "the right one down");
});

test("in the tattoo chair: leaning back, the arm on its rest, the tattoo facing up", () => {
  const { P, sk, w, k, stand, at } = inStudio();
  const c = fx.chair, rest = fx.rests.find((r) => r.side === "r");
  stand(c.at[0] + c.facing[0] * 0.7, c.at[2] + c.facing[2] * 0.7);
  // a tattoo on the inside of the right forearm: the skin that faces forward at rest, palm in
  const n = F;
  assert.ok(w.restAt({ kind: "sit", at: P.toBody(c.at), facing: P.wayToBody([c.facing[0], c.facing[2]]), height: c.height * k, back: true,
                       recline: c.recline, arm: { side: "r", at: P.toBody(rest.at), face: { bone: "elbow_r", normal: n } } }));
  run(w, 3);
  assert.equal(w.resting, "sit");
  const pel = at("pelvis");
  assert.ok(Math.hypot(pel[0] - c.at[0], pel[2] - c.at[2]) < 0.05, "hips on the seat");
  near(pel[1], c.height + 0.05 * 1.75, 0.06, "hips above the seat");
  // the trunk leans back about as far as the chair's back
  const spine = v3.unit(v3.sub(at("neck"), at("pelvis")));
  const lean = Math.acos(spine[1]) * 180 / Math.PI;
  assert.ok(lean > c.recline - 10 && lean < c.recline + 12, `leaning back ${lean}°`);
  // the thighs still along the seat, not lifted by the leaning back
  for (const s of ["l", "r"]) {
    const th = v3.unit(v3.sub(at("knee_" + s), at("hip_" + s)));
    assert.ok(Math.abs(th[1]) < 0.4, `the ${s} thigh about level (${th[1]})`);
  }
  // the forearm on the rest, about level
  const el = at("elbow_r"), wr = at("wrist_r"), mid = v3.scale(v3.add(el, wr), 0.5);
  assert.ok(Math.hypot(mid[0] - rest.at[0], mid[2] - rest.at[2]) < 0.1, `the forearm over the rest (${mid} vs ${rest.at})`);
  near(mid[1], rest.at[1] + 0.022 * 1.75, 0.05, "lying on it");
  const fa = v3.unit(v3.sub(wr, el));
  assert.ok(Math.abs(fa[1]) < 0.35, `about level (${fa[1]})`);
  // the tattoo's skin turned up
  const face = v3.dot(q.rot(sk.W[sk.index("elbow_r")], n), U);
  assert.ok(face > 0.6, `the tattoo faces up (${face})`);
  // the left arm isn't on a rest: in the lap
  assert.ok(sk.angles[sk.index("shoulder_l")].side < 40);
});

test("the artist's view looks at the tattoo from close by; the mirror's from the glass", () => {
  const v = artistView([0, 1, 0], [0, 0, 1], [0, 1, 0], 0.5);
  near(v3.len(v3.sub(v.eye, v.target)), 0.5, 1e-9);
  assert.ok(v.eye[2] > 0.4 && v.eye[1] > 1, "in front, a little above");
  const m = mirrorView(fx.mirror, [0, 1.2, 0]);
  near(v3.dot(v3.sub(m.eye, fx.mirror.centre), fx.mirror.normal), 0.05, 1e-6, "just off the glass");
  near(m.eye[1], 1.2, 1e-6, "at the height it looks at");
  assert.deepEqual(nearStation(fx, [fx.bed.at[0], fx.bed.at[2] + 0.9]), ["bed"]);
  assert.deepEqual(nearStation(fx, [fx.chair.at[0], fx.chair.at[2] + 0.8]), ["chair"]);
  assert.deepEqual(nearStation(fx, [99, 99]), []);
});

test("a tattoo's normal from its grid points out of the body", () => {
  // a grid on a cylinder round the y axis, radius 1, facing +z at its middle
  const nx = 5, ny = 5, P = new Float32Array(nx * ny * 3), valid = new Uint8Array(nx * ny).fill(1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = (i - 2) * 0.1;
    P.set([Math.sin(a), (j - 2) * 0.1, Math.cos(a)], (j * nx + i) * 3);
  }
  const n = gridNormal(P, nx, 2 * nx + 2, valid, nearestOnBones([0, 0, 1], [[[0, -1, 0], [0, 1, 0]]]));
  assert.ok(n[2] > 0.99, `out of the cylinder: ${n}`);
});
