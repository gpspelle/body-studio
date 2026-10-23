// Posing and tattoo maths (src/body_studio/static/pose.js) against a real rig. Run by
// tests/unit/test_pose_js.py, which builds the rig from the MakeHuman test body:
//   RIG_JSON=/path/to/body.rig.json BODY_PLY=/path/to/body.ply node --test tests/js/pose.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BodyVolume, Skeleton, SkinSurface, SkinWeights, SurfaceMap, dualQuats, palmNormals, inkSamples, inkUnder, placeInk, INK_OUT, skinPoint, q, v3, DOF, RHYTHM } from "../../src/body_studio/static/pose.js";

const rig = JSON.parse(readFileSync(process.env.RIG_JSON, "utf8"));
const { left: L, up: U, front: F } = rig.frame;
const H = rig.height;
const RAD = Math.PI / 180;
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
  sk.set("hip_l", { flex: 125, side: 45 });                  // both at once stay inside the hip's cone
  const a = sk.angles[sk.index("hip_l")];
  assert.ok(Math.hypot(a.flex, a.side) < 112, `hip ${a.flex}, ${a.side}`);
  sk.set("wrist_l", { flex: 80, side: 20 });                 // and other joints inside their ellipse
  const wr = sk.angles[sk.index("wrist_l")];
  assert.ok((wr.flex / 80) ** 2 + (wr.side / 20) ** 2 <= 1.0001);
  sk.set("shoulder_l", { twist: 500 }); assert.equal(sk.angles[sk.index("shoulder_l")].twist, DOF.shoulder_l.twist[1]);
  // a hinge can't be aimed sideways or backwards
  sk.reset();
  sk.aim("knee_l", F); sk.solve();
  assert.ok(v3.dot(dir(sk, "knee_l", "ankle_l"), U) < -0.9, "knee doesn't bend forward");
  sk.aim("elbow_l", v3.scale(F, -1)); sk.solve();
  assert.ok(v3.dot(dir(sk, "elbow_l", "wrist_l"), F) > -0.2, "elbow doesn't bend backward");
});

test("every joint moves as far as a person's does, and no further", () => {
  // adult active ranges of motion (AAOS, Norkin & White; horizontal adduction and abduction of the
  // shoulder measured from the arm out to the side at shoulder height)
  const sk = new Skeleton(rig);
  // (a swing in one plane: the other swing angle 0; a swing stops 5 short of a half turn, where it would flip)
  const reach = (j, a) => {
    sk.reset();
    sk.set(j, "flex" in a && !("side" in a) ? { side: 0, ...a } : "side" in a && !("flex" in a) ? { flex: 0, ...a } : a);
    return sk.angles[sk.index(j)];
  };
  const ranges = {
    shoulder: { flex: [-60, 180], side: [-50, 180], twist: [-90, 70] },
    elbow: { flex: [0, 145], twist: [0, 0] },
    wrist: { flex: [-70, 80], side: [-30, 20], twist: [-80, 80] },
    hip: { flex: [-30, 125], side: [-25, 45], twist: [-45, 40] },
    ankle: { flex: [-50, 20] },
  };
  for (const s of ["l", "r"]) {
    for (const [j, r] of Object.entries(ranges)) {
      for (const [k, [lo, hi]] of Object.entries(r)) {
        const rest = k === "twist" ? 0 : sk.restAngles[sk.index(j + "_" + s)][k];
        // each end of each range, on its own (the scan's own pose may be further: it always stays allowed)
        near(reach(j + "_" + s, { [k]: lo })[k], Math.min(lo, rest), 0.5, `${j}_${s} ${k} to ${lo}`);
        near(reach(j + "_" + s, { [k]: hi })[k], Math.min(175, Math.max(hi, rest)), 0.5, `${j}_${s} ${k} to ${hi}`);
        assert.ok(reach(j + "_" + s, { [k]: lo - 40 })[k] > lo - 39, `${j}_${s} ${k} stops at ${lo}`);
        assert.ok(reach(j + "_" + s, { [k]: hi + 40 })[k] < hi + 39, `${j}_${s} ${k} stops at ${hi}`);
      }
    }
    const arm = (target) => { sk.reset(); sk.aim("shoulder_" + s, target); return v3.dot(dir(sk, "shoulder_" + s, "elbow_" + s), target); };
    const out = s === "l" ? L : v3.scale(L, -1), back = v3.scale(F, -1);
    const at = (a, b, deg) => v3.unit(v3.add(v3.scale(a, Math.cos(deg * RAD)), v3.scale(b, Math.sin(deg * RAD))));
    // at shoulder height: across the chest 40 past straight forward (horizontal adduction 130), and
    // 35 behind out to the side (horizontal abduction), but not straight back
    assert.ok(arm(at(F, v3.scale(out, -1), 40)) > 0.99, `${s} arm across the chest`);
    assert.ok(arm(at(out, back, 35)) > 0.99, `${s} arm out and back`);
    assert.ok(arm(back) < 0.8, `${s} arm doesn't point straight back at shoulder height`);
    assert.ok(arm(U) > 0.99, `${s} arm straight up`);
    // a bent hip crosses the legs; a straight one only a little
    sk.reset(); sk.aim("hip_" + s, at(F, v3.scale(out, -1), 25));
    assert.ok(v3.dot(dir(sk, "hip_" + s, "knee_" + s), at(F, v3.scale(out, -1), 25)) > 0.99, `${s} thigh across, hip bent`);
    // the shin turns about its bone only with the knee bent
    assert.equal(reach("knee_" + s, { flex: 0, twist: 30 }).twist, 0, `${s} straight knee doesn't turn`);
    near(reach("knee_" + s, { flex: 90, twist: 30 }).twist, 30, 1e-6, `${s} bent knee turns in`);
    near(reach("knee_" + s, { flex: 90, twist: -40 }).twist, -30, 1e-6, `${s} bent knee turns`);
  }
  // the neck and head together: flexion 60, extension 75, sideways 45, turning 85
  const both = (k, v) => { sk.reset(); sk.set("neck", { flex: 0, side: 0, [k]: v }); sk.set("head", { flex: 0, side: 0, [k]: v }); return sk.angles[sk.index("neck")][k] + sk.angles[sk.index("head")][k]; };
  near(both("flex", 100), 60, 0.5, "neck forward"); near(both("flex", -100), -75, 0.5, "neck back");
  near(both("side", 100), 45, 0.5, "neck sideways"); near(both("twist", 100), 85, 0.5, "neck turning");
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
const skin = new SkinSurface(rig, body.centres, body.opaque, new SkinWeights(rig));
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
    // arms folded across the chest, legs crossed with the shins turned
    { ...both("shoulder", { flex: 80, side: -60, twist: 20 }), ...both("elbow", { flex: 120, twist: 0 }),
      hip_l: { flex: 80, side: -25, twist: 0 }, knee_l: { flex: 85, twist: 25 }, hip_r: { flex: 30, side: 5 }, knee_r: { flex: 40, twist: -20 } },
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
      // posing stretches skin (arms up pulls the chest, and the armpit to about three times its
      // length, as on the scan's skin itself), but never by a whole tear. With the arms up the
      // stretch gathers at the armpit crease, where the arm's weight stops so the side of the chest
      // stays put (spread wider, it swung the side out like big lats)
      const limit = dq === poses[0] ? 14 : 10;
      assert.ok(stretch(P) < limit, `${where}: an edge ${stretch(P).toFixed(1)} cells too long when posed`);
    }
  }
});

// the MakeHuman mesh's own outward normals where its skin is (from tests/fakes/makehuman.py)
const truth = JSON.parse(readFileSync(process.env.SKIN_NORMALS, "utf8"));
const truthGrid = new Map(), TG = 0.02 * H, tkey = (p) => p.map((x) => Math.floor(x / TG)).join();
truth.forEach((t, i) => { const k = tkey(t.slice(0, 3)); (truthGrid.get(k) || truthGrid.set(k, []).get(k)).push(i); });
function trueNormal(p) {
  let best = -1, bd = Infinity;
  const c = p.map((x) => Math.floor(x / TG));
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
    for (const t of truthGrid.get([c[0] + a, c[1] + b, c[2] + e].join()) || []) {
      const d = (truth[t][0] - p[0]) ** 2 + (truth[t][1] - p[1]) ** 2 + (truth[t][2] - p[2]) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
  }
  return best < 0 ? null : truth[best].slice(3);
}

test("the skin's normals point out of the body, under the arms too", () => {
  // the normal is what lifts the ink out of the skin and keeps a design on one surface: one that
  // points in (the side of the chest under the arm used to be turned toward the upper arm, the
  // nearer bone) sinks the ink into the body and stops the design there
  // every third cell: a fair sample of the whole skin, at a third of the cost (this check was most
  // of the unit tests' time)
  let bad = 0, all = 0;
  const flipped = {};
  for (let c = 0; c < skin.count; c += 3) {
    const p = skin._p(c), bone = boneAt(p);
    // (a face has the inside of its mouth in the mesh; fingers and toes are thinner than a cell)
    if (/^(head|neck|wrist|ankle)/.test(bone)) continue;
    skin._prep(c);
    const t = trueNormal(p);
    if (!t) continue;
    all++;
    if (v3.dot(skin._n(c), t) < 0) { bad++; flipped[bone] = (flipped[bone] || 0) + 1; }
  }
  assert.ok(bad < 0.003 * all, `${bad} of ${all} normals point into the body: ${JSON.stringify(flipped)}`);
  // designs laid in and around the armpits: on the skin's outside all over, and whole
  const sk = new Skeleton(rig);
  for (const side of ["l", "r"]) {
    const sh = joint("shoulder_" + side), out = v3.unit(v3.sub(joint("elbow_" + side), sh));
    const spots = [];
    for (let c = 0; c < skin.count && spots.length < 400; c++) {
      const p = skin._p(c), d = v3.sub(p, sh);
      // below the shoulder and no further out than it: the hollow under the arm and the chest around it
      if (v3.len(d) < 0.09 * H && v3.dot(d, U) < -0.02 * H && v3.dot(d, out) < 0.03 * H) spots.push(p);
    }
    assert.ok(spots.length > 50, `skin under the ${side} arm`);
    for (let t = 0; t < 8; t++) {
      const at = spots[Math.floor((t + 0.5) / 8 * spots.length)];
      const g = skin.wrap({ at, up: U, width: 0.05 * H, height: 0.05 * H, angle: t * 45, lift: 0 }, 21, 21);
      let pts = 0, outside = 0;
      for (let k = 0; k < g.nx * g.ny; k++) {
        if (!g.valid[k]) continue;
        pts++;
        const tn = trueNormal(Array.from(g.positions.subarray(k * 3, k * 3 + 3)));
        if (tn && v3.dot(tn, Array.from(g.normals.subarray(k * 3, k * 3 + 3))) > 0) outside++;
      }
      const where = `9 cm design at ${at.map((x) => x.toFixed(2))} (${boneAt(at)})`;
      assert.ok(pts > 0.75 * g.nx * g.ny, `${where}: only ${pts} of ${g.nx * g.ny} points on the skin`);
      assert.ok(outside > 0.97 * pts, `${where}: ${pts - outside} of ${pts} points face into the body`);
    }
  }
});

test("raising the arms leaves the back and the sides of the chest where they are", () => {
  // the upper arm used to carry part of the shoulder blade and the side of the chest, so arms up
  // swung the back out into wings and stretched a back piece with them
  const sk = new Skeleton(rig), w = new SkinWeights(rig);
  // the side of the chest under the arm, out to the armpit: it used to swing 5 to 8 cm out (big lats)
  {
    sk.setPose({ shoulder_l: { flex: 0, side: 165, twist: 0 }, shoulder_r: { flex: 0, side: 165, twist: 0 } });
    const dq = dualQuats(sk.transforms()), chest = joint("chest"), b = new Uint8Array(4), x = new Uint8Array(4), o = [0, 0, 0];
    const outs = [];
    for (const s of ["l", "r"]) {
      const sh = joint("shoulder_" + s), sg = Math.sign(v3.dot(v3.sub(sh, chest), L)), lat = sg * v3.dot(v3.sub(sh, chest), L);
      for (const i of body.opaque) {
        const p = Array.from(body.centres.subarray(i * 3, i * 3 + 3)), below = v3.dot(v3.sub(sh, p), U);
        const l = sg * v3.dot(v3.sub(p, chest), L);
        if (below < 0.025 * H || below > 0.12 * H || l > lat + 0.006 * H || l < 0.03 * H) continue;
        w.at(...p, b, x); skinPoint(p, b, x, dq, o);
        outs.push(sg * v3.dot(v3.sub(o, p), L));
      }
    }
    outs.sort((a, c) => a - c);
    const p95 = outs[Math.floor(0.95 * (outs.length - 1))];
    assert.ok(outs.length > 1000, `${outs.length} splats on the sides`);
    assert.ok(p95 < 0.02 * H, `the side of the chest swings ${(100 * p95).toFixed(1)} cm out with the arms up`);
  }
  sk.setPose({ shoulder_l: { flex: 0, side: 165, twist: 0 }, shoulder_r: { flex: 0, side: 165, twist: 0 } });
  const dq = dualQuats(sk.transforms());
  const chest = joint("chest"), sh = joint("shoulder_l"), lat = Math.abs(v3.dot(v3.sub(sh, chest), L));
  const b = new Uint8Array(4), x = new Uint8Array(4), o = [0, 0, 0];
  let n = 0, moved = 0;
  for (const i of body.opaque) {
    const p = Array.from(body.centres.subarray(i * 3, i * 3 + 3)), below = v3.dot(v3.sub(sh, p), U);
    // the trunk from 5 to 40 cm below the shoulders, inward of the shoulder joints
    if (Math.abs(v3.dot(v3.sub(p, chest), L)) > lat - 0.02 * H || below < 0.03 * H || below > 0.25 * H) continue;
    w.at(...p, b, x);
    skinPoint(p, b, x, dq, o);
    n++;
    if (v3.len(v3.sub(o, p)) > 0.025 * H) moved++;
  }
  assert.ok(n > 1000, `${n} splats on the trunk`);
  assert.ok(moved / n < 0.02, `${(100 * moved / n).toFixed(1)}% of the trunk moved more than 4 cm`);
});

// an image W x H: ink (black, opaque) where inked(x, y) is true, clear elsewhere
function image(W, Hh, inked) {
  const data = new Uint8ClampedArray(W * Hh * 4);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (inked(x, y)) data[(y * W + x) * 4 + 3] = 255;
  return { width: W, height: Hh, data };
}

// the dominant bone of every opaque splat, as tattoo.js has them
const domBones = (() => {
  const w = new SkinWeights(rig), n = body.centres.length / 3, bones = new Uint8Array(n * 4), ws = new Uint8Array(n * 4);
  for (const i of body.opaque) w.at(body.centres[i * 3], body.centres[i * 3 + 1], body.centres[i * 3 + 2], bones, ws, i);
  return bones;
})();
const palms = palmNormals(rig, body.centres, domBones, body.opaque);
const volume = new BodyVolume(rig, new SurfaceMap(rig));
const posed = () => new Skeleton(rig, { palms, body: volume });

test("the arms can touch the body but not go into it", () => {
  const sk = posed(), tol = volume.tol;
  assert.ok(volume.limbs.length === 6 && volume.parts.length === 2);
  near(volume.depth(sk), 0, tol, "at rest");
  const both = (j, a) => ({ [j + "_l"]: a, [j + "_r"]: a });
  // the page's presets and the arms folded across the chest are all outside
  for (const p of [{ ...both("shoulder", { flex: 0, side: 165, twist: 0 }), ...both("elbow", { flex: 8 }) },
                   { ...both("shoulder", { flex: 0, side: 90, twist: -90 }), ...both("elbow", { flex: 115 }), ...both("wrist", { flex: 20, side: 0 }) },
                   { ...both("shoulder", { flex: 22, side: 10, twist: 0 }), ...both("elbow", { flex: 75 }), ...both("wrist", { twist: 60 }), spine: { flex: 8 } },
                   { ...both("shoulder", { flex: 80, side: -60, twist: 20 }), ...both("elbow", { flex: 120 }) }])
    assert.ok(volume.depth(sk.setPose(p)) <= tol, JSON.stringify(p));
  for (const s of ["l", "r"]) {
    const o = s === "l" ? "r" : "l";
    // the elbow dragged toward the middle of the trunk (the arm used to go straight in)
    sk.reset();
    const sternum = v3.scale(v3.add(sk.P[sk.index("chest")], sk.P[sk.index("spine")]), 0.5);
    sk.aim("shoulder_" + s, v3.sub(sternum, sk.P[sk.index("shoulder_" + s)]));
    assert.ok(volume.depth(sk) <= tol, `${s} arm stops at the chest`);
    // straight through to the other side: a body without a volume lets it
    const free = new Skeleton(rig, { palms });
    free.aim("shoulder_" + s, v3.sub(free.P[free.index("shoulder_" + o)], free.P[free.index("shoulder_" + s)]));
    assert.ok(volume.depth(free) > 10 * tol, "(without the volume the arm goes through)");
    sk.reset();
    sk.aim("shoulder_" + s, v3.sub(sk.P[sk.index("shoulder_" + o)], sk.P[sk.index("shoulder_" + s)]));
    assert.ok(volume.depth(sk) <= tol, `${s} arm doesn't pass through the chest`);
    // down by the side, touching it
    sk.reset(); sk.set("shoulder_" + s, { flex: 0, side: -50 });
    const side = sk.angles[sk.index("shoulder_" + s)].side;
    assert.ok(side < 10 && side > -10, `${s} arm comes down to the side (${side})`);
    // turned in, the forearm stops at the belly; out to the side it bends all the way
    sk.reset(); sk.set("shoulder_" + s, { flex: 0, side: 10, twist: 70 }); sk.set("elbow_" + s, { flex: 145 });
    const bent = sk.angles[sk.index("elbow_" + s)].flex;
    assert.ok(bent < 100 && bent > 20, `${s} forearm stops at the belly (${bent})`);
    sk.reset(); sk.set("shoulder_" + s, { flex: 0, side: 90 }); sk.set("elbow_" + s, { flex: 145 });
    near(sk.angles[sk.index("elbow_" + s)].flex, 145, 1e-6, `${s} elbow bends fully out to the side`);
    // sliding: forward, then across the front, then the elbow bent: arms folded
    sk.reset(); sk.set("shoulder_" + s, { flex: 85, side: 0 }); sk.set("shoulder_" + s, { flex: 85, side: -60 });
    sk.set("elbow_" + s, { flex: 120 });
    assert.ok(sk.angles[sk.index("shoulder_" + s)].side < -40 && sk.angles[sk.index("elbow_" + s)].flex > 90, `${s} arm folds across the chest`);
  }
  // anything asked of the arms, one joint after another, never ends inside
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lo = (a, b) => a + (b - a) * rnd();
  sk.reset();
  for (let k = 0; k < 400; k++) {
    const s = rnd() < 0.5 ? "l" : "r", j = ["shoulder", "elbow", "wrist", "clavicle", "chest", "spine", "neck", "head"][k % 8];
    const name = ["shoulder", "elbow", "wrist", "clavicle"].includes(j) ? j + "_" + s : j;
    sk.set(name, { flex: lo(-90, 180), side: lo(-120, 180), twist: lo(-90, 90) });
    assert.ok(volume.depth(sk) <= tol * 1.001, `step ${k}: ${name} ${JSON.stringify(sk.angles[sk.index(name)])}`);
  }
});

test("the hand bends toward its palm, and the forearm turns it", () => {
  const sk = posed();
  for (const s of ["l", "r"]) {
    const j = sk.index("wrist_" + s), p = sk.parents[j], tip = sk.index("hand_end_" + s);
    assert.ok(palms["wrist_" + s], `${s} palm found`);
    const palmNow = () => q.rot(q.mul(q.mul(sk.W[p], sk.C[j]), sk.rotation(j, sk.angles[j])), sk.defs[j].palm);
    const hand = () => v3.unit(v3.sub(sk.P[tip], sk.P[j]));
    sk.reset();
    // at rest the hand's axes are the scan's: its palm faces the way the hand's splats are flat
    assert.ok(Math.abs(v3.dot(palmNow(), palms["wrist_" + s])) > 0.95, `${s} palm as scanned`);
    const rest = sk.restAngles[j];
    assert.ok(Math.abs(rest.twist) <= 90, `${s} rest turn ${rest.twist}`);
    // bending moves the fingers toward the palm, 80 of it
    const palm0 = palmNow(), h0 = hand();
    sk.set(j, { flex: 80, side: 0 }); sk.solve();
    assert.ok(v3.dot(hand(), palm0) > 0.8, `${s} bent toward the palm`);
    // sideways it moves across the palm (toward the thumb or away), not toward it
    sk.reset(); sk.set(j, { flex: 0, side: 20 }); sk.solve();
    const across = v3.sub(hand(), h0);
    assert.ok(Math.abs(v3.dot(v3.unit(across), palm0)) < 0.5, `${s} side bend is across the palm`);
    // turning: the palm goes round the forearm, the hand keeps pointing the same way
    sk.reset(); sk.set(j, { flex: 0, side: 0, twist: 0 }); sk.solve();
    const h1 = hand(), p1 = palmNow();
    sk.set(j, { twist: 70 }); sk.solve();
    assert.ok(v3.dot(hand(), h1) > 0.999, `${s} turning keeps the hand's direction`);
    near(Math.acos(Math.max(-1, Math.min(1, v3.dot(palmNow(), p1)))) / RAD, 70, 1, `${s} the palm turns 70`);
    // and a bend after the turn goes toward the turned palm
    const p2 = palmNow();
    sk.set(j, { flex: 60 }); sk.solve();
    assert.ok(v3.dot(hand(), p2) > 0.7, `${s} turned hand bends toward its palm`);
    // dragging the fingertips keeps the turn
    sk.aim(j, v3.add(h1, v3.scale(p2, 0.5)));
    near(sk.angles[j].twist, 70, 1e-6, `${s} aiming keeps the turn`);
    assert.ok(v3.dot(hand(), v3.unit(v3.add(h1, v3.scale(p2, 0.5)))) > 0.99, `${s} aim reaches`);
  }
});

test("ink splats cover the inked part of the image, evenly", () => {
  // the top half inked (image rows go down, v goes up)
  const s = inkSamples(image(200, 100, (x, y) => y < 50), 2000);
  near(s.n, 2000, 300, "about as many splats as asked");
  for (let i = 0; i < s.n; i++) assert.ok(s.v[i] > 0.45, `splat ${i} in the inked half (v ${s.v[i]})`);
  const inside = [...s.alpha].filter((a, i) => s.v[i] > 0.55);
  assert.ok(inside.every((a) => a > 0.99), "fully inked inside");
  assert.equal(inkSamples(image(50, 50, () => false), 100).n, 0, "nothing for an empty image");
});

test("ink splats lie on the skin, and only where the grid has skin", () => {
  const r = 0.05, { surface } = cylinders([[0, r]]);
  const g = surface.wrap({ at: [0, 0, r], up: [0, 1, 0], width: 0.2, height: 0.12, angle: 0, lift: 0 }, 21, 13);
  const s = inkSamples(image(100, 60, () => true), 3000), at = placeInk(g, s);
  assert.ok(at.ok.reduce((t, v) => t + v, 0) > 0.95 * s.n, "the whole image is on the cylinder");
  for (let i = 0; i < s.n; i++) {
    if (!at.ok[i]) continue;
    const p = at.positions.subarray(i * 3, i * 3 + 3);
    near(Math.hypot(p[0], p[2]), r, 0.002, `splat ${i} on the surface`);
    near(Math.atan2(p[0], p[2]) * r, (s.u[i] - 0.5) * 0.2, 0.005, `splat ${i} at its arc length`);
    near(p[1], (s.v[i] - 0.5) * 0.12, 0.005, `splat ${i} at its height`);
  }
  // past the edge of a limb (two legs, the image wider than the left one can hold): no ink in the air
  const two = cylinders([[-0.09, 0.07], [0.09, 0.07]]).surface;
  const g2 = two.wrap({ at: [-0.09, 0, 0.07], up: [0, 1, 0], width: 0.5, height: 0.1, angle: 0, lift: 0 }, 61, 11);
  const at2 = placeInk(g2, s);
  assert.ok(at2.ok.reduce((t, v) => t + v, 0) < s.n, "some of it has no skin under it");
  for (let i = 0; i < s.n; i++) {
    if (!at2.ok[i]) continue;
    const p = at2.positions.subarray(i * 3, i * 3 + 3);
    near(Math.min(Math.hypot(p[0] + 0.09, p[2]), Math.hypot(p[0] - 0.09, p[2])), 0.07, 0.004, `splat ${i} on a leg`);
  }
});

test("the body's splats under the ink take it, and only those", () => {
  // splats on a cylinder of radius 5 cm, a few mm in and out; the image's left half inked
  const r = 0.05, { surface } = cylinders([[0, r]]);
  const g = surface.wrap({ at: [0, 0, r], up: [0, 1, 0], width: 0.2, height: 0.12, angle: 0, lift: 0 }, 41, 25);
  const pts = [];
  for (let a = -Math.PI; a < Math.PI; a += 0.02) for (let y = -0.1; y <= 0.1; y += 0.004) {
    const rr = r + 0.003 * Math.sin(a * 37 + y * 900);
    pts.push(rr * Math.sin(a), y, rr * Math.cos(a));
  }
  pts.push(0, 0, r + 0.03);                                                    // a splat in the air
  const centres = Float32Array.from(pts), u = inkUnder(g, centres, image(100, 60, (x) => x < 50), 0.006);
  assert.ok(u.index.length > 100, `${u.index.length} splats under the ink`);
  const got = new Set(u.index);
  for (let i = 0; i < centres.length / 3; i++) {
    const [x, y, z] = centres.subarray(i * 3, i * 3 + 3), arc = Math.atan2(x, z) * r;
    if (z > 0.06) { assert.ok(!got.has(i), "not the splat in the air"); continue; }
    // well inside the inked part (the left half: arc -0.1 .. 0), and well outside it
    if (arc > -0.09 && arc < -0.01 && Math.abs(y) < 0.05) assert.ok(got.has(i), `splat at arc ${arc.toFixed(3)} y ${y.toFixed(3)} is inked`);
    if (arc > 0.01 || arc < -0.11 || Math.abs(y) > 0.07) assert.ok(!got.has(i), `splat at arc ${arc.toFixed(3)} y ${y.toFixed(3)} is bare`);
  }
  for (let j = 0; j < u.index.length; j++) assert.ok(u.alpha[j] > 0.04 && u.rgb[j * 3] < 0.01, "black ink");
});

test("quality sweep: ink anywhere on the body, in any pose, stays on the skin and in one piece", () => {
  // designs of 6 to 35 cm on random spots of the body, each in the standing pose and four others:
  // every ink splat lies on the skin, stays next to the skin it was put on when the body moves,
  // and the image isn't torn or stretched into lines
  const sk = new Skeleton(rig), w = new SkinWeights(rig);
  const both = (j, a) => ({ [j + "_l"]: a, [j + "_r"]: a });
  const poses = [
    { ...both("shoulder", { flex: 0, side: 165, twist: 0 }), ...both("elbow", { flex: 8, twist: 0 }) },
    { ...both("shoulder", { flex: 0, side: 90, twist: -90 }), ...both("elbow", { flex: 115, twist: 0 }), ...both("wrist", { flex: 20, side: 0 }) },
    { shoulder_l: { flex: -22, side: 8 }, shoulder_r: { flex: 24, side: 8 }, elbow_r: { flex: 35 }, hip_l: { flex: 24, side: 2 },
      hip_r: { flex: -12, side: 2 }, knee_r: { flex: 28 }, chest: { flex: 0, side: 0, twist: -6 } },
    { ...both("hip", { flex: 88, side: 6, twist: 0 }), ...both("knee", { flex: 88 }), spine: { flex: 8 } },
    // arms folded across the chest, legs crossed with the shins turned
    { ...both("shoulder", { flex: 80, side: -60, twist: 20 }), ...both("elbow", { flex: 120, twist: 0 }),
      hip_l: { flex: 80, side: -25, twist: 0 }, knee_l: { flex: 85, twist: 25 }, hip_r: { flex: 30, side: 5 }, knee_r: { flex: 40, twist: -20 } },
  ].map((p) => { sk.reset(); sk.setPose(p); return dualQuats(sk.transforms()); });
  // a dragon-like design: a blob with thin wings and a tail
  const designImage = image(150, 210, (x, y) => (x - 75) ** 2 + (y - 80) ** 2 < 900 ||
                                                      Math.abs(y - 60 - 0.4 * Math.abs(x - 75)) < 4 || (Math.abs(x - 75 - 20 * Math.sin(y / 20)) < 5 && y > 100));
  const design = inkSamples(designImage, 6000);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const b = new Uint8Array(4), x = new Uint8Array(4), o = [0, 0, 0], o2 = [0, 0, 0], bs = new Uint8Array(4), xs = new Uint8Array(4);
  for (let t = 0; t < 24; t++) {
    const i0 = body.opaque[Math.floor(rnd() * body.opaque.length)], at = Array.from(body.centres.subarray(i0 * 3, i0 * 3 + 3));
    const width = [6, 12, 20, 35][t % 4] / 170 * H, height = width * 1.4;
    const g = skin.wrap({ at, up: U, width, height, angle: (t * 53) % 360 - 180, lift: 0.001 * H }, 48, 67);
    const ink = placeInk(g, design, INK_OUT), where = `${(width / H * 170).toFixed(0)} cm at ${boneAt(at)}`;
    let placed = 0, worstOut = 0, worstIn = 0, worstApart = 0;
    for (let s = 0; s < design.n; s += 7) {
      if (!ink.ok[s]) continue;
      placed++;
      const p = Array.from(ink.positions.subarray(s * 3, s * 3 + 3));
      // on the skin: along the skin's normal there (the nearest cell's), no further out than the
      // skin's own outermost splats around it (no ink standing off the body) and not sunk into it;
      // and next to the splat of the body nearest to it
      const c = skin.nearest(p);
      if (c < 0) { worstOut = Infinity; continue; }
      const sc = skin._s(c), nc = skin._n(c);
      let best = -1, bd = Infinity, outer = -Infinity;
      for (const cc of skin._near(p, 4 * skin.h)) {
        for (let m = skin.first[cc]; m < skin.first[cc + 1]; m++) {
          const i = skin.members[m], q = Array.from(body.centres.subarray(i * 3, i * 3 + 3)), d = v3.len(v3.sub(q, p));
          if (d < bd) { bd = d; best = i; }
          if (d < 2 * skin.h) outer = Math.max(outer, v3.dot(v3.sub(q, sc), nc));
        }
      }
      const off = v3.dot(v3.sub(p, sc), nc);
      worstOut = Math.max(worstOut, off - outer);
      worstIn = Math.max(worstIn, -off);
      if (best < 0) continue;
      // and it moves with that splat (the page gives it that splat's weights)
      const sp = Array.from(body.centres.subarray(best * 3, best * 3 + 3));
      w.at(...sp, bs, xs); b.set(bs); x.set(xs);
      for (const dq of poses) {
        skinPoint(p, b, x, dq, o); skinPoint(sp, bs, xs, dq, o2);
        worstApart = Math.max(worstApart, v3.len(v3.sub(o, o2)) - bd);
      }
    }
    assert.ok(placed > 0, `${where}: some ink`);
    // (the scan's skin is a shell a few millimetres thick and each splat reaches a few millimetres past
    // its centre: the ink lies among the outermost, within 1 cm of their centres)
    const cm = (x) => (x / H * 170).toFixed(1);
    assert.ok(worstOut < 0.006 * H, `${where}: ink ${cm(worstOut)} cm further out than the skin's splats`);
    assert.ok(worstIn < 0.006 * H, `${where}: ink ${cm(worstIn)} cm inside the skin`);
    assert.ok(worstApart < 0.01 * H, `${where}: ink comes ${(worstApart / H * 170).toFixed(1)} cm away from its skin when posed`);
    // a small design on the body is whole (a big one can run off a limb)
    if (width < 0.08 * H) assert.ok(placed > 0.9 * Math.ceil(design.n / 7), `${where}: only ${placed} of ${Math.ceil(design.n / 7)} on the skin`);
    // and the body's own splats under it take the ink: about as much skin as the ink covers
    const under = inkUnder(g, body.centres, designImage, 0.006 * H);
    assert.ok(under.index.length > 0, `${where}: no skin under the ink`);
    for (const i of under.index) {
      const c = skin.nearest(Array.from(body.centres.subarray(i * 3, i * 3 + 3)));
      assert.ok(c >= 0, `${where}: splat ${i} under the ink is on the skin`);
    }
  }
});

test("the collarbone goes up with the arm; the arm points where it was set", () => {
  const up = rig.frame.up, sk = new Skeleton(rig), bare = new Skeleton(rig, { rhythm: false });
  const at = (k, name) => k.P[k.index(name)];
  // at rest nothing moves
  for (const name of ["shoulder_l", "elbow_r", "wrist_l"]) near(v3.len(v3.sub(at(sk, name), at(bare, name))), 0, 1e-9, name);
  for (const k of [sk, bare]) { k.set("shoulder_l", { flex: 0, side: 170 }); k.solve(); }
  const rise = v3.dot(v3.sub(at(sk, "shoulder_l"), at(bare, "shoulder_l")), up);
  assert.ok(rise > 0.008 * rig.height, `the shoulder rises with the arm up (${rise / rig.height})`);
  assert.ok(rise < 0.05 * rig.height, `by a few centimetres (${rise / rig.height})`);
  const dir = (k) => v3.unit(v3.sub(at(k, "elbow_l"), at(k, "shoulder_l")));
  assert.ok(v3.dot(dir(sk), dir(bare)) > 0.9999, "the arm points the same way");
  // the other side and a lowered arm hardly move
  near(v3.len(v3.sub(at(sk, "shoulder_r"), at(bare, "shoulder_r"))), 0, 1e-9, "the other shoulder");
  for (const k of [sk, bare]) { k.set("shoulder_l", { flex: 0, side: RHYTHM.from - 5 }); k.solve(); }
  assert.ok(v3.len(v3.sub(at(sk, "shoulder_l"), at(bare, "shoulder_l"))) < 0.004 * rig.height, "arm down: the shoulder about where it was");
});
