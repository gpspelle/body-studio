// The body in a scanned room (src/body_studio/static/room.js, and walk.js's sitting and leaning),
// against the fake room's map and the MakeHuman test body's rig. Run by tests/unit/test_room_js.py:
//   ROOM_JSON=/path/to/room.room.json RIG_JSON=/path/to/body.rig.json node --test tests/js/room.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Skeleton, q, v3 } from "../../src/body_studio/static/pose.js";
import { Walker } from "../../src/body_studio/static/walk.js";
import { Placement, ROOM, RoomMap } from "../../src/body_studio/static/room.js";

const map = JSON.parse(readFileSync(process.env.ROOM_JSON, "utf8"));
const rig = JSON.parse(readFileSync(process.env.RIG_JSON, "utf8"));
// the fake room's furniture, in the map's frame (tests/unit/test_room_js.py works it out)
const at = JSON.parse(process.env.ROOM_PLACES);
const H = rig.height, U = rig.frame.up, DT = 1 / 60;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (±${tol})`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("free floor, walls and furniture", () => {
  const r = new RoomMap(map);
  assert.ok(r.clear(...at.middle));
  assert.ok(!r.free(...at.sofa) && !r.free(...at.wall));
  assert.ok(r.free(...r.start));
  assert.equal(r.free(1e3, 1e3), false);                     // off the map
});

test("walking into a wall stops short of it; at a slant, the body goes along it", () => {
  const r = new RoomMap(map);
  const into = [at.wall[0] - at.middle[0], at.wall[1] - at.middle[1]];
  const end = r.move(at.middle, [at.middle[0] + 3 * into[0], at.middle[1] + 3 * into[1]]);
  assert.ok(r.clear(...end), "never in the wall");
  assert.ok(dist(end, at.wall) < 0.35, `up to the wall: ${dist(end, at.wall)}`);
  // at 45 degrees to the wall the body slides along it
  // (one way along it the chair is in the way: the other)
  const n = [-into[0] / Math.hypot(...into), -into[1] / Math.hypot(...into)], from = end;
  const along = [1, -1].map((k) => {
    const side = [-k * n[1], k * n[0]], slid = r.move(from, [from[0] - n[0] + side[0], from[1] - n[1] + side[1]]);
    return { side: (slid[0] - from[0]) * side[0] + (slid[1] - from[1]) * side[1], into: (slid[0] - from[0]) * n[0] + (slid[1] - from[1]) * n[1] };
  });
  const best = along[0].side > along[1].side ? along[0] : along[1];
  assert.ok(best.side > 0.5, `along the wall: ${JSON.stringify(along)}`);
  assert.ok(Math.abs(best.into) < 0.06, "not into it");
  assert.deepEqual(r.nearestFree(...r.start), r.start);
  const out = r.nearestFree(...at.sofa);
  assert.ok(out && r.clear(...out) && dist(out, at.sofa) < 1.2);
});

test("a seat near the sofa's front, and a wall to lean on with the way out of it", () => {
  const r = new RoomMap(map);
  const s = r.seatNear(...at.sofaFront);
  assert.ok(s, "the sofa");
  near(s.y, 0.45, 0.05, "seat height");
  assert.equal(r.seatNear(...at.middle, 0.3), null);
  const w = r.wallNear(at.wall[0] + 0.5 * at.wallOut[0], at.wall[1] + 0.5 * at.wallOut[1]);
  assert.ok(w, "a wall");
  assert.ok(w.n[0] * at.wallOut[0] + w.n[1] * at.wallOut[1] > 0.95, `out of the wall: ${w.n}`);
  assert.ok(dist(w.at, at.wall) < 0.4, `on its face: ${w.at}`);
  assert.equal(r.wallNear(...at.middle), null);
});

test("the camera's view: blocked by a wall and the ceiling, clear inside", () => {
  const r = new RoomMap(map);
  const t = [at.middle[0], 1.0, at.middle[1]];
  near(r.sight(t, [at.middle[0] + 0.5, 1.4, at.middle[1] + 0.3]), 1, 1e-9);
  const out = [at.wall[0] + 2 * at.wallOut[0] * -1, 1.2, at.wall[1] + 2 * at.wallOut[1] * -1];   // behind the wall
  assert.ok(r.sight(t, out) < 0.9);
  assert.ok(r.sight(t, [at.middle[0], 4, at.middle[1]]) < 0.65, "above the ceiling");
  const way = r.openWay();
  near(Math.hypot(...way), 1, 1e-9);
});

test("placement: the map's metres and the body's coordinates", () => {
  const r = new RoomMap(map), k = H / 1.75, P = new Placement(rig, r, k, [0.6, 0.8]);
  for (const p of [[0.3, 0.2, -1.1], r.start.length && [r.start[0], 0, r.start[1]], [2, 1.5, 1]]) {
    const back = P.toMap(P.toBody(p));
    for (let i = 0; i < 3; i++) near(back[i], p[i], 1e-9);
  }
  const feet = P.toBody([r.start[0], 0, r.start[1]]);
  for (let i = 0; i < 3; i++) near(feet[i], rig.frame.origin[i], 1e-9, "the start is under the feet");
  const f = P.wayToBody([0.6, 0.8]);
  near(v3.dot(f, rig.frame.front), 1, 1e-9, "ahead is the body's front");
  const w = P.wayToMap(P.wayToBody([0.28, -0.96]));
  near(w[0], 0.28, 1e-9); near(w[1], -0.96, 1e-9);
  // the room's own splats: the matrix agrees with the map's frame
  const M = P.plyMatrix(), fr = map.frame, ply = [0.7, -0.4, 1.3];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const metric = [dot(ply, fr.x) * fr.metres, (dot(ply, fr.up) - fr.floor) * fr.metres, dot(ply, fr.z) * fr.metres];
  const want = P.toBody(metric);
  const got = [0, 1, 2].map((i) => M[i] * ply[0] + M[4 + i] * ply[1] + M[8 + i] * ply[2] + M[12 + i]);
  for (let i = 0; i < 3; i++) near(got[i], want[i], 1e-6 * H);
});

// a body standing in the room, walking with walls and furniture in the way
function inRoom() {
  const r = new RoomMap(map), k = H / 1.75, P = new Placement(rig, r, k, r.openWay());
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  const o = rig.frame.origin;
  w.bound = (from, to) => {
    const a = P.toMap(v3.add(o, from)), b = P.toMap(v3.add(o, to));
    const m = r.move([a[0], a[2]], [b[0], b[2]]);
    return v3.sub(P.toBody([m[0], 0, m[1]]), o);
  };
  const where = () => { const p = P.toMap(v3.add(o, w.pos)); return [p[0], p[2]]; };
  return { r, P, sk, w, where, k };
}
const run = (w, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT, input); };

test("the walker stops at a wall instead of walking through it", () => {
  const { r, P, w, where } = inRoom();
  // walk straight at the nearest wall from the middle, for long enough to cross the room
  const into = [at.wall[0] - r.start[0], at.wall[1] - r.start[1]], n = Math.hypot(...into);
  const move = P.wayToBody([into[0] / n, into[1] / n]);
  let closest = Infinity;
  for (let i = 0; i < 8 / DT; i++) {
    w.update(DT, { move });
    assert.ok(r.clear(...where(), ROOM.radius - 1e-6), `in the wall at ${where()}`);
    closest = Math.min(closest, dist(where(), at.wall));
  }
  assert.ok(closest < 0.4, `walked up to the wall (${closest})`);
});

test("sitting on the sofa: hips on the seat, feet on the floor, facing the room; up again", () => {
  const { r, P, sk, w, k } = inRoom();
  const seat = r.seatNear(...at.sofaFront);
  // walk near it first, then sit
  w.pos = v3.sub(P.toBody([seat.x + seat.dir[0] * 0.6, 0, seat.z + seat.dir[1] * 0.6]), rig.frame.origin);
  const before = w.pos.slice();
  assert.ok(w.restAt({ kind: "sit", at: P.toBody([seat.x, seat.y, seat.z]), facing: P.wayToBody(seat.dir),
                       height: seat.y * k, back: seat.back }));
  run(w, 3);
  assert.equal(w.resting, "sit");
  assert.ok(!w.busy, "sat down and still");
  const pel = sk.P[sk.index("pelvis")], m = P.toMap(pel);
  assert.ok(Math.hypot(m[0] - seat.x, m[2] - seat.z) < 0.04, `hips on the seat: ${m}`);
  near(m[1], seat.y + 0.05 * 1.75, 0.05, "hips above the seat");
  const foot = Math.min(...["ankle_l", "ankle_r", "toe_end_l", "toe_end_r"].map((j) => P.toMap(sk.P[sk.index(j)])[1]));
  const lowestRest = Math.min(...["ankle_l", "ankle_r", "toe_end_l", "toe_end_r"].map((j) => P.toMap(sk.rest[sk.index(j)])[1]));
  near(foot, lowestRest, 0.01, "feet on the floor");
  const facing = P.wayToMap(q.rot(sk.W[0], rig.frame.front));
  assert.ok((facing[0] * seat.dir[0] + facing[1] * seat.dir[1]) / Math.hypot(...facing) > 0.9, "facing the room");
  const knee = sk.angles[sk.index("knee_l")].flex, hip = sk.angles[sk.index("hip_l")].flex;
  assert.ok(knee > 50 && hip > 55, `knees and hips bent: ${hip} ${knee}`);
  // a key to walk: up first, back where it stood
  run(w, 0.2, { move: P.wayToBody(seat.dir) });
  assert.equal(w.resting, null);
  run(w, 3);
  assert.equal(w.rest, null);
  assert.ok(v3.len(v3.sub(w.pos, before)) < 0.1 * H, "stood up where it was");
});

test("leaning on a wall: the back on it, tilted, the feet out from it", () => {
  const { r, P, sk, w } = inRoom();
  const spot = [at.wall[0] + 0.5 * at.wallOut[0], at.wall[1] + 0.5 * at.wallOut[1]];
  w.pos = v3.sub(P.toBody([spot[0], 0, spot[1]]), rig.frame.origin);
  const wall = r.wallNear(...spot);
  assert.ok(w.restAt({ kind: "lean", at: P.toBody([wall.at[0], 0, wall.at[1]]), facing: P.wayToBody(wall.n) }));
  run(w, 3);
  assert.equal(w.resting, "lean");
  // how far each part is out from the wall's face (map metres)
  const out = (name) => { const p = P.toMap(sk.P[sk.index(name)]); return (p[0] - wall.at[0]) * wall.n[0] + (p[2] - wall.at[1]) * wall.n[1]; };
  near(out("chest") - 0.075 * 1.75, 0, 0.03, "the back of the chest on the wall");
  assert.ok(out("ankle_l") > out("chest") + 0.1, "the feet out from the wall");
  assert.ok(out("head") > 0.02, "the head isn't in the wall");
});
