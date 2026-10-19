// Posing and tattoo maths (src/body_studio/static/pose.js) against a real rig. Run by
// tests/unit/test_pose_js.py, which builds the rig from the MakeHuman test body:
//   RIG_JSON=/path/to/body.rig.json BODY_PLY=/path/to/body.ply node --test tests/js/pose.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Skeleton, SkinSurface, SkinWeights, dualQuats, skinPoint, q, v3, DOF } from "../../src/body_studio/static/pose.js";

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

// the splats of the body the rig was built from (BODY_PLY), as the page has them
function readPly(path) {
  const buf = readFileSync(path);
  const end = buf.indexOf("end_header\n") + 11;
  const head = buf.subarray(0, end).toString();
  const props = [...head.matchAll(/property float (\w+)/g)].map((m) => m[1]);
  const n = +head.match(/element vertex (\d+)/)[1], P = props.length;
  const f = new Float32Array(buf.buffer.slice(buf.byteOffset + end, buf.byteOffset + end + n * P * 4));
  const ix = props.indexOf("x"), io = props.indexOf("opacity");
  const centres = new Float32Array(n * 3), opaque = [];
  for (let i = 0; i < n; i++) {
    centres.set(f.subarray(i * P + ix, i * P + ix + 3), i * 3);
    if (1 / (1 + Math.exp(-f[i * P + io])) >= 0.3) opaque.push(i);     // tattoo.js: opacity >= 0.3
  }
  return { centres, opaque };
}
const body = readPly(process.env.BODY_PLY);
const skin = new SkinSurface(rig, body.centres, body.opaque);
const joint = (name) => rig.joints.find((j) => j.name === name).pos;
const between = (...names) => v3.scale(names.map(joint).reduce(v3.add), 1 / names.length);
// the outermost skin seen from `from` looking along `dir` (a tap on the body)
function tap(from, dir) {
  for (let d = 0.4 * H; d > 0; d -= 0.002 * H) {
    const x = v3.add(from, v3.scale(dir, d)), c = skin.nearest(x);
    if (c >= 0 && v3.len(v3.sub(skin._p(c), x)) < skin.h) return skin._p(c);
  }
  assert.fail("no skin there");
}
const grid = (g) => (i, j) => Array.from(g.positions.subarray((j * g.nx + i) * 3, (j * g.nx + i) * 3 + 3));
const count = (g) => g.valid.reduce((s, v) => s + v, 0);
// length of a row or column of grid points, in PLY units
const pathLength = (pts) => pts.slice(1).reduce((s, p, i) => s + v3.len(v3.sub(p, pts[i])), 0);
// distance from p to the nearest opaque splat
function offSkin(p) {
  let best = Infinity;
  for (const c of skin._near(p, 4 * skin.h)) {
    for (let m = skin.first[c]; m < skin.first[c + 1]; m++) {
      const i = skin.members[m];
      best = Math.min(best, Math.hypot(body.centres[i * 3] - p[0], body.centres[i * 3 + 1] - p[1], body.centres[i * 3 + 2] - p[2]));
    }
  }
  return best;
}
// the bone that carries a point most
function boneAt(p) {
  const w = new SkinWeights(rig), b = new Uint8Array(4), x = new Uint8Array(4);
  w.at(p[0], p[1], p[2], b, x);
  return rig.joints[b[0]].name;
}

test("a tattoo wraps around the forearm with its real size", () => {
  const axis = v3.unit(v3.sub(joint("elbow_l"), joint("wrist_l")));
  const at = tap(between("elbow_l", "wrist_l"), F);
  const tat = { at, up: axis, width: 0.06 * H, height: 0.08 * H, angle: 0, lift: 0 };
  const g = skin.wrap(tat, 25, 33), P = grid(g);
  assert.ok(g.valid.every((v) => v === 1), "every point is on the arm");
  const across = pathLength(Array.from({ length: 25 }, (_, i) => P(i, 16)));
  const along = pathLength(Array.from({ length: 33 }, (_, j) => P(12, j)));
  near(across, tat.width, 0.12 * tat.width, "width kept around the arm");
  near(along, tat.height, 0.08 * tat.height, "height kept along the arm");
  // not mirrored, seen from outside: right x up points out of the skin; up points to the shoulder
  const right = v3.sub(P(24, 16), P(0, 16)), upv = v3.sub(P(12, 32), P(12, 0));
  const centre = P(12, 16), wrist = joint("wrist_l");
  const out = v3.sub(v3.sub(centre, wrist), v3.scale(axis, v3.dot(v3.sub(centre, wrist), axis)));
  assert.ok(v3.dot(v3.cross(right, upv), out) > 0, "not mirrored");
  assert.ok(v3.dot(upv, axis) > 0.9 * v3.len(upv), "image up points up the arm");
  assert.ok(v3.len(out) > 0.005 * H && v3.len(out) < 0.04 * H, `on the forearm's skin (${v3.len(out) / H})`);
  for (let k = 0; k < 25 * 33; k += 7) assert.ok(offSkin(P(k % 25, Math.floor(k / 25))) < 0.008 * H, "on the skin");
});

test("a tattoo on the chest faces forward and turns as asked", () => {
  const at = tap(between("spine", "chest", "neck"), F);
  const g = skin.wrap({ at, up: U, width: 0.08 * H, height: 0.08 * H, angle: 30, lift: 0 }, 9, 9), P = grid(g);
  assert.equal(count(g), 81);
  assert.ok(v3.dot(v3.sub(P(4, 4), joint("chest")), F) > 0.03 * H, "on the front of the chest");
  // turned 30 degrees counterclockwise as seen from the front: the top leans to the viewer's left,
  // the person's right
  const top = v3.sub(P(4, 8), P(4, 0));
  const lean = Math.atan2(v3.dot(top, L), v3.dot(top, U)) / (Math.PI / 180);
  near(lean, -30, 6, "turned");
});

test("a back piece stays whole and upright from the buttocks to the shoulder blades", () => {
  // 30 x 60 cm on a 1.75 m body
  const at = tap(between("spine", "chest"), v3.scale(F, -1));
  const tat = { at, up: U, width: 0.17 * H, height: 0.34 * H, angle: 0, lift: 0 };
  const g = skin.wrap(tat, 24, 48), P = grid(g);
  assert.ok(count(g) >= 0.98 * 24 * 48, `${count(g)} of ${24 * 48} points`);
  const col = Array.from({ length: 48 }, (_, j) => P(12, j));
  near(pathLength(col), tat.height, 0.06 * tat.height, "full height");
  assert.ok(v3.dot(v3.sub(P(12, 47), P(12, 0)), U) > 0.3 * H, "top toward the head");
  for (const j of [8, 24, 40]) {
    const step = v3.sub(P(12, j + 4), P(12, j - 4));
    const lean = Math.abs(Math.atan2(v3.dot(step, L), v3.dot(step, U))) / (Math.PI / 180);
    assert.ok(lean < 8, `upright at row ${j} (${lean.toFixed(1)} degrees)`);
    assert.ok(v3.dot(v3.sub(P(12, j), joint("spine")), F) < 0, "on the back");
  }
});

test("a tattoo from the lower back runs onto both thighs, every point on the skin", () => {
  // centred between the hips, at the back: 36 x 36 cm reaches well down both thighs
  const at = tap(between("pelvis", "hip_l", "hip_r"), v3.scale(F, -1));
  const g = skin.wrap({ at, up: U, width: 0.2 * H, height: 0.2 * H, angle: 0, lift: 0 }, 31, 31), P = grid(g);
  let left = 0, right = 0;
  for (let j = 0; j < 31; j++) {
    for (let i = 0; i < 31; i++) {
      if (!g.valid[j * 31 + i]) continue;
      const p = P(i, j);
      assert.ok(offSkin(p) < 0.008 * H, `point ${i},${j} lies on the skin (${(offSkin(p) / H).toFixed(4)})`);
      if (v3.dot(v3.sub(p, joint("hip_l")), U) < -0.05 * H) {
        const bone = boneAt(p);
        if (bone.endsWith("_l")) left++;
        if (bone.endsWith("_r")) right++;
      }
    }
  }
  assert.ok(left > 40 && right > 40, `on both thighs below the buttocks (${left} left, ${right} right)`);
  assert.ok(count(g) > 0.95 * 31 * 31, `all of it is on the body (${count(g)})`);
});

test("a long tattoo runs from the hip past the knee", () => {
  const at = tap(between("hip_l", "knee_l", "knee_l"), F);
  const len = v3.len(v3.sub(joint("hip_l"), joint("ankle_l")));
  const g = skin.wrap({ at, up: U, width: 0.06 * H, height: 0.8 * len, angle: 0, lift: 0 }, 9, 40), P = grid(g);
  assert.ok(count(g) >= 0.97 * 9 * 40);
  const ends = [boneAt(P(4, 2)), boneAt(P(4, 37))];
  assert.equal(ends[0], "knee_l", "the bottom is on the shin");
  assert.equal(ends[1], "hip_l", "the top is on the thigh");
});

test("a tattoo over the shoulder runs from the back onto the arm", () => {
  const at = tap(joint("shoulder_l"), U);
  const g = skin.wrap({ at, up: F, width: 0.09 * H, height: 0.14 * H, angle: 0, lift: 0 }, 24, 36);
  assert.ok(count(g) >= 0.97 * 24 * 36, `${count(g)} of ${24 * 36}`);
  const P = grid(g), bones = new Set();
  for (let k = 0; k < 24 * 36; k++) if (g.valid[k]) bones.add(boneAt(P(k % 24, Math.floor(k / 24))));
  assert.ok(bones.has("shoulder_l"), [...bones].join(" "));
  assert.ok(["chest", "clavicle_l", "neck", "spine"].some((b) => bones.has(b)), [...bones].join(" "));
});

// a made-up body part, to check the maths exactly: a cylinder (an arm), and two side by side (legs)
function cylinders(list, n = 200000) {
  const centres = new Float32Array(n * 3), opaque = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const [x0, r] = list[i % list.length], th = rnd() * 2 * Math.PI, y = (rnd() - 0.5) * 0.6;
    centres.set([x0 + r * Math.cos(th), y, r * Math.sin(th)], i * 3);
    opaque.push(i);
  }
  const joints = [];
  list.forEach(([x0]) => joints.push({ pos: [x0, -0.3, 0], parent: -1 }, { pos: [x0, 0.3, 0], parent: joints.length }));
  return { surface: new SkinSurface({ height: 1.75, joints }, centres, opaque), centres };
}

test("on a cylinder the image keeps its size exactly", () => {
  const r = 0.05, { surface } = cylinders([[0, r]]);
  const g = surface.wrap({ at: [0, 0, r], up: [0, 1, 0], width: 0.2, height: 0.12, angle: 0, lift: 0 }, 21, 13), P = grid(g);
  assert.equal(count(g), 21 * 13);
  for (let i = 0; i < 21; i++) {
    const p = P(i, 6), arc = Math.atan2(p[0], p[2]) * r;
    near(arc, (i / 20 - 0.5) * 0.2, 0.004, `column ${i} at its arc length`);
    near(Math.hypot(p[0], p[2]), r, 0.002, "on the surface");
  }
  for (let j = 0; j < 13; j++) near(P(10, j)[1], (j / 12 - 0.5) * 0.12, 0.003, `row ${j} at its height`);
});

test("across two legs side by side, the gap between them stays bare", () => {
  const r = 0.07, { surface } = cylinders([[-0.09, r], [0.09, r]]);
  // centred on the left leg, wide enough to reach the right one across a 4 cm gap
  const g = surface.wrap({ at: [-0.09, 0, r], up: [0, 1, 0], width: 0.3, height: 0.1, angle: 0, lift: 0 }, 61, 11), P = grid(g);
  for (let i = 0; i < 61; i++) {
    if (!g.valid[5 * 61 + i]) continue;
    const p = P(i, 5), d = Math.min(Math.hypot(p[0] + 0.09, p[2]), Math.hypot(p[0] - 0.09, p[2]));
    near(d, r, 0.003, `point ${i} is on a leg`);
  }
  // the walk can't jump the gap: the image wraps around the left leg (like a sticker) and does not
  // land on the right one
  for (let i = 0; i < 61; i++) if (g.valid[5 * 61 + i]) assert.ok(P(i, 5)[0] < 0.005, `point ${i} stays on the left leg`);
});

test("skin weights always add up to one and change smoothly over the skin", () => {
  const w = new SkinWeights(rig), b = new Uint8Array(4), x = new Uint8Array(4), b2 = new Uint8Array(4), x2 = new Uint8Array(4);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 5000; t++) {
    const i = body.opaque[Math.floor(rnd() * body.opaque.length)], p = Array.from(body.centres.subarray(i * 3, i * 3 + 3));
    w.at(...p, b, x);
    // a byte can't hold more than 255: a total over 255 (or a wrapped -1) throws the splat across the room when posed
    assert.equal(x.reduce((s, v) => s + v, 0), 255, `weights at ${p}`);
    // a step a third of a centimetre along the skin moves at most half the weight to other bones
    // (a jump tears the skin open when the body moves, e.g. at the armpit)
    w.at(...v3.add(p, v3.scale(v3.unit([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), 0.002 * H)), b2, x2);
    const diff = new Map();
    for (let k = 0; k < 4; k++) { diff.set(b[k], (diff.get(b[k]) ?? 0) + x[k]); diff.set(b2[k], (diff.get(b2[k]) ?? 0) - x2[k]); }
    const moved = [...diff.values()].reduce((s, v) => s + Math.abs(v), 0) / 2;
    assert.ok(moved <= 64, `weights jump by ${moved}/255 near ${p}`);
  }
});

test("the image never stretches into a line, at rest or posed", () => {
  // the dragon's tail used to grow a thin line near the armpit: points of the grid landed on the
  // arm and on the chest, and the triangle between them was drawn across the gap
  const sk = new Skeleton(rig), w = new SkinWeights(rig);
  const both = (j, a) => ({ [j + "_l"]: a, [j + "_r"]: a });
  const poses = [
    { ...both("shoulder", { flex: 0, side: 165, twist: 0 }), ...both("elbow", { flex: 8, twist: 0 }) },
    { ...both("shoulder", { flex: 0, side: 90, twist: -90 }), ...both("elbow", { flex: 115, twist: 0 }) },
    { ...both("hip", { flex: 88, side: 6, twist: 0 }), ...both("knee", { flex: 88 }), spine: { flex: 8 } },
  ].map((p) => { sk.reset(); sk.setPose(p); return dualQuats(sk.transforms()); });
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const NX = 32, NY = 45, b = new Uint8Array(NX * NY * 4), x = new Uint8Array(NX * NY * 4), o = [0, 0, 0];
  for (let t = 0; t < 40; t++) {
    const i = body.opaque[Math.floor(rnd() * body.opaque.length)], at = Array.from(body.centres.subarray(i * 3, i * 3 + 3));
    const width = [8, 15, 25, 35][t % 4] / 170 * H, height = width * 1.41;
    const g = skin.wrap({ at, up: U, width, height, angle: (t * 37) % 360 - 180, lift: 0 }, NX, NY);
    for (let k = 0; k < NX * NY; k++) if (g.valid[k]) w.at(g.positions[k * 3], g.positions[k * 3 + 1], g.positions[k * 3 + 2], b, x, k);
    const dx = width / (NX - 1), dy = height / (NY - 1);
    // how much longer than in the image the longest edge of a drawn triangle is, in cells of the skin
    const stretch = (P) => {
      let worst = 0;
      for (let q = 0; q < g.index.length; q += 3) {
        for (const [a, c] of [[g.index[q], g.index[q + 1]], [g.index[q + 1], g.index[q + 2]], [g.index[q + 2], g.index[q]]]) {
          const want = Math.hypot((a % NX - c % NX) * dx, (((a / NX) | 0) - ((c / NX) | 0)) * dy);
          worst = Math.max(worst, (Math.hypot(P[a * 3] - P[c * 3], P[a * 3 + 1] - P[c * 3 + 1], P[a * 3 + 2] - P[c * 3 + 2]) - want) / skin.h);
        }
      }
      return worst;
    };
    const where = `${(width / H * 170).toFixed(0)} cm at ${boneAt(at)}`;
    assert.ok(stretch(g.positions) < 3, `${where}: an edge ${stretch(g.positions).toFixed(1)} cells too long at rest`);
    for (const dq of poses) {
      const P = new Float32Array(NX * NY * 3);
      for (let k = 0; k < NX * NY; k++) if (g.valid[k]) { skinPoint(Array.from(g.positions.subarray(k * 3, k * 3 + 3)), b, x, dq, o, k); P.set(o, k * 3); }
      // posing stretches skin (arms up pulls the chest), but never by a whole tear
      assert.ok(stretch(P) < 8, `${where}: an edge ${stretch(P).toFixed(1)} cells too long when posed`);
    }
  }
});
