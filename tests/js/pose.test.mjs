// Posing and tattoo maths (src/body_studio/static/pose.js) against a real rig. Run by
// tests/unit/test_pose_js.py, which builds the rig from the MakeHuman test body:
//   RIG_JSON=/path/to/body.rig.json node --test tests/js/pose.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Skeleton, SkinWeights, SurfaceMap, dualQuats, skinPoint, q, v3, DOF } from "../../src/body_studio/static/pose.js";

const rig = JSON.parse(readFileSync(process.env.RIG_JSON, "utf8"));
const { left: L, up: U, front: F } = rig.frame;
const H = rig.height;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (±${tol})`);
const dir = (sk, a, b) => v3.unit(v3.sub(sk.P[sk.index(b)], sk.P[sk.index(a)]));

test("quaternion helpers", () => {
  const r = q.rot(q.axisAngle([0, 0, 1], Math.PI / 2), [1, 0, 0]);
  near(r[0], 0, 1e-9); near(r[1], 1, 1e-9);
  const b = q.between([0, 1, 0], v3.unit([1, 1, 0]));
  const s = q.rot(b, [0, 1, 0]);
  near(s[0], Math.SQRT1_2, 1e-9); near(s[1], Math.SQRT1_2, 1e-9);
  const rv = q.toRotvec(q.fromRotvec([0.3, -0.2, 0.1]));
  near(rv[0], 0.3, 1e-9); near(rv[1], -0.2, 1e-9); near(rv[2], 0.1, 1e-9);
});

test("the scan's own pose is the rest pose", () => {
  const sk = new Skeleton(rig);
  sk.W.forEach((w) => near(Math.abs(w[3]), 1, 1e-9, "no rotation"));
  sk.P.forEach((p, j) => near(v3.len(v3.sub(p, sk.rest[j])), 0, 1e-9, sk.names[j]));
  assert.deepEqual(sk.pose(), {});
  // A-pose: the arms are held out to the side, in the joint's own terms
  for (const s of ["l", "r"]) {
    const a = sk.angles[sk.index("shoulder_" + s)];
    assert.ok(a.side > 15 && a.side < 70, `shoulder_${s} rests abducted (${a.side})`);
  }
});

test("joints move the way a body does", () => {
  const sk = new Skeleton(rig);
  sk.set("shoulder_l", { flex: 90, side: 0 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "shoulder_l", "elbow_l"), F) > 0.95, "left arm raised forward");
  sk.set("shoulder_r", { flex: 0, side: 90 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "shoulder_r", "elbow_r"), L) < -0.95, "right arm raised to the right");
  sk.set("shoulder_l", { flex: 0, side: 175 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "shoulder_l", "elbow_l"), U) > 0.95, "left arm straight up");
  sk.reset();
  sk.set("hip_r", { flex: 90, side: 0 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "hip_r", "knee_r"), F) > 0.95, "thigh raised forward");
  sk.reset();
  sk.set("knee_l", { flex: 90 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "knee_l", "ankle_l"), F) < -0.9, "knee bends backward");
  sk.reset();
  sk.set("elbow_r", { flex: 90 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "elbow_r", "wrist_r"), F) > 0.9, "elbow bends forward");
  sk.reset();
  sk.set("spine", { flex: 40 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "spine", "chest"), F) > 0.4, "the trunk leans forward");
  sk.reset();
  sk.set("head", { twist: 40 }); sk.set("neck", { twist: 40 }); sk.solve();
  const face = q.rot(sk.W[sk.index("head")], F);
  assert.ok(v3.dot(face, L) > 0.8, "a positive twist turns the head to the left");
  sk.reset();
  sk.set("ankle_l", { flex: 15 }); sk.solve();
  assert.ok(v3.dot(dir(sk, "ankle_l", "toe_end_l"), U) > 0.05, "dorsiflexion lifts the toes");
});

test("double biceps: abducted, turned out, elbow bent points the forearm up", () => {
  const sk = new Skeleton(rig);
  for (const s of ["l", "r"]) {
    sk.set("shoulder_" + s, { flex: 0, side: 90, twist: -90 });
    sk.set("elbow_" + s, { flex: 90 });
  }
  sk.solve();
  for (const s of ["l", "r"]) assert.ok(v3.dot(dir(sk, "elbow_" + s, "wrist_" + s), U) > 0.9, s);
});

test("limits hold", () => {
  const sk = new Skeleton(rig);
  sk.set("elbow_l", { flex: 200 }); assert.equal(sk.angles[sk.index("elbow_l")].flex, 145);
  sk.set("knee_r", { flex: -30 }); assert.equal(sk.angles[sk.index("knee_r")].flex, 0);
  sk.set("hip_l", { flex: 120, side: 45 });                  // both at once stay inside the ellipse
  const a = sk.angles[sk.index("hip_l")];
  assert.ok((a.flex / 120) ** 2 + (a.side / 45) ** 2 <= 1.0001);
  sk.set("shoulder_l", { twist: 500 }); assert.equal(sk.angles[sk.index("shoulder_l")].twist, DOF.shoulder_l.twist[1]);
  // a hinge can't be aimed sideways or backwards
  sk.reset();
  sk.aim("knee_l", F); sk.solve();
  assert.ok(v3.dot(dir(sk, "knee_l", "ankle_l"), U) < -0.9, "knee doesn't bend forward");
  sk.aim("elbow_l", v3.scale(F, -1)); sk.solve();
  assert.ok(v3.dot(dir(sk, "elbow_l", "wrist_l"), F) > -0.2, "elbow doesn't bend backward");
});

test("aim points a bone where it can go", () => {
  const sk = new Skeleton(rig);
  const target = v3.unit(v3.add(F, U));
  sk.aim("shoulder_r", target);
  assert.ok(v3.dot(dir(sk, "shoulder_r", "elbow_r"), target) > 0.99);
  sk.aim("hip_l", v3.unit(v3.add(F, v3.scale(U, -0.2))));
  assert.ok(v3.dot(dir(sk, "hip_l", "knee_l"), F) > 0.9);
  const twist = sk.angles[sk.index("hip_l")].twist;
  sk.set("hip_l", { twist: 20 }); sk.aim("hip_l", F);
  assert.equal(sk.angles[sk.index("hip_l")].twist, 20, "aiming keeps the twist");
  assert.equal(twist, 0);
});

test("pose round trip", () => {
  const sk = new Skeleton(rig);
  sk.set("shoulder_l", { flex: 30, side: 60, twist: 10 }); sk.set("knee_r", { flex: 45 }); sk.solve();
  const p = sk.pose();
  assert.deepEqual(Object.keys(p).sort(), ["knee_r", "shoulder_l"]);
  const sk2 = new Skeleton(rig).setPose(p);
  sk2.P.forEach((x, j) => near(v3.len(v3.sub(x, sk.P[j])), 0, 1e-4 * H, sk.names[j]));
});

test("skinning matches the bones", () => {
  const sk = new Skeleton(rig);
  sk.set("shoulder_l", { flex: 80, side: 20 }); sk.set("elbow_l", { flex: 100 }); sk.solve();
  const dq = dualQuats(sk.transforms());
  const e = sk.index("elbow_l"), s = sk.index("shoulder_l");
  // a point at the elbow, half upper arm and half forearm, lands on the posed elbow
  const out = skinPoint(sk.rest[e], [s, e, 0, 0], [128, 127, 0, 0], dq);
  near(v3.len(v3.sub(out, sk.P[e])), 0, 1e-6, "elbow");
  // a point carried by one bone moves rigidly with it
  const p = v3.add(sk.rest[e], [0.01, -0.02, 0.03]);
  const one = skinPoint(p, [e, 0, 0, 0], [255, 0, 0, 0], dq);
  const tr = sk.transforms()[e];
  near(v3.len(v3.sub(one, v3.add(q.rot(tr.q, p), tr.t))), 0, 1e-6, "rigid");
});

test("skin weights follow the body", () => {
  const sk = new Skeleton(rig), w = new SkinWeights(rig);
  const b = new Uint8Array(4), x = new Uint8Array(4);
  const mid = (a, c) => v3.scale(v3.add(sk.rest[sk.index(a)], sk.rest[sk.index(c)]), 0.5);
  for (const [a, c, bone] of [["elbow_l", "wrist_l", "elbow_l"], ["hip_r", "knee_r", "hip_r"], ["knee_l", "ankle_l", "knee_l"],
                              ["shoulder_r", "elbow_r", "shoulder_r"], ["spine", "chest", "spine"], ["neck", "head", "neck"]]) {
    w.at(...mid(a, c), b, x);
    assert.equal(x.reduce((s, v) => s + v, 0), 255);
    assert.equal(sk.names[b[0]], bone, `${a}-${c}`);
    assert.ok(x[0] > 200, `${bone} carries the middle of its bone (${x[0]})`);
  }
  // the left thigh never moves with the right leg
  const thigh = mid("hip_l", "knee_l");
  w.at(...v3.add(thigh, v3.scale(L, -0.03 * H)), b, x);     // its inner side
  for (let i = 0; i < 4; i++) if (x[i]) assert.ok(!sk.names[b[i]].endsWith("_r"), sk.names[b[i]]);
});

test("a tattoo wraps around the forearm with its real size", () => {
  const sk = new Skeleton(rig), map = new SurfaceMap(rig);
  const m = map.maps.elbow_l;
  const tat = { bone: "elbow_l", t: 0.5 * m.length, theta: 0, width: 0.06 * H, height: 0.08 * H, angle: 0, lift: 0 };
  const g = map.wrap(tat, 25, 33);
  assert.ok(g.valid.every((v) => v === 1), "every point is on the arm");
  const P = (i, j) => Array.from(g.positions.subarray((j * 25 + i) * 3, (j * 25 + i) * 3 + 3));
  let across = 0, along = 0;
  for (let i = 0; i < 24; i++) across += v3.len(v3.sub(P(i + 1, 16), P(i, 16)));
  for (let j = 0; j < 32; j++) along += v3.len(v3.sub(P(12, j + 1), P(12, j)));
  near(across, tat.width, 0.1 * tat.width, "width kept around the arm");
  near(along, tat.height, 0.1 * tat.height, "height kept along the arm");
  // not mirrored, seen from outside: right x up points out of the skin; up points to the shoulder
  const right = v3.sub(P(24, 16), P(0, 16)), upv = v3.sub(P(12, 32), P(12, 0));
  const out = v3.sub(P(12, 16), v3.add(m.origin, v3.scale(m.axis, tat.t)));
  assert.ok(v3.dot(v3.cross(right, upv), out) > 0, "not mirrored");
  assert.ok(v3.dot(upv, U) > 0, "image up points up the arm");
  // the centre sits on the skin: as far from the bone as the arm's splats are
  const r = v3.len(v3.sub(out, v3.scale(m.axis, v3.dot(out, m.axis))));
  assert.ok(r > 0.005 * H && r < 0.04 * H, `forearm radius ${r / H}`);
});

test("a tattoo on the chest faces forward", () => {
  const map = new SurfaceMap(rig), m = map.maps.chest;
  const g = map.wrap({ bone: "chest", t: 0.5 * m.length, theta: 0, width: 0.08 * H, height: 0.08 * H, angle: 30, lift: 0 }, 9, 9);
  const c = Array.from(g.positions.subarray(40 * 3, 40 * 3 + 3));
  assert.ok(v3.dot(v3.sub(c, m.origin), F) > 0.03 * H, "on the front of the chest");
});
