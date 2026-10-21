// Walking and jumping (src/body_studio/static/walk.js) against a real rig. Run by
// tests/unit/test_pose_js.py with the rig it builds from the MakeHuman test body:
//   RIG_JSON=/path/to/body.rig.json node --test tests/js/walk.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BodyVolume, Skeleton, SkinWeights, SurfaceMap, dualQuats, skinPoint, q, v3 } from "../../src/body_studio/static/pose.js";
import { Life, LIFE, Walker, WALK, LIMBS, gait, stance } from "../../src/body_studio/static/walk.js";

const rig = JSON.parse(readFileSync(process.env.RIG_JSON, "utf8"));
const { left: L, up: U, front: F } = rig.frame;
const H = rig.height;
const DT = 1 / 60;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (±${tol})`);
const flat = (v) => v3.sub(v, v3.scale(U, v3.dot(v, U)));
const at = (sk, name) => sk.P[sk.index(name)];
const run = (w, seconds, input = {}, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { w.update(DT, input); each(i); }
};
const angle = (sk, name) => sk.angles[sk.index(name)];
const armsDown = (sk, w, sides = ["l", "r"]) => {
  for (const s of sides) {
    const a = angle(sk, "shoulder_" + s);
    near(a.side, w.armSide, 0.5, `shoulder_${s} beside the body`); near(a.flex, 0, 0.5, `shoulder_${s} not forward`);
  }
};
const lowestFoot = (sk) => Math.min(...["ankle_l", "ankle_r", "toe_end_l", "toe_end_r"].map((n) => v3.dot(at(sk, n), U)));
const corr = (a, b) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
  let ab = 0, aa = 0, bb = 0;
  a.forEach((x, i) => { ab += (x - ma) * (b[i] - mb); aa += (x - ma) ** 2; bb += (b[i] - mb) ** 2; });
  return ab / Math.sqrt(aa * bb);
};

test("the body's place moves every bone rigidly", () => {
  const sk = new Skeleton(rig);
  const turn = q.axisAngle(U, 0.7), move = v3.scale(F, 0.3 * H);
  sk.place = { q: turn, t: move };
  sk.solve();
  const root = sk.rest[0];
  const dq = dualQuats(sk.transforms());
  for (const name of ["head", "wrist_l", "toe_end_r"]) {
    const p = sk.rest[sk.index(name)];
    const want = v3.add(v3.add(root, q.rot(turn, v3.sub(p, root))), move);
    const got = skinPoint(p, [sk.index(name), 0, 0, 0], [255, 0, 0, 0], dq);
    near(v3.len(v3.sub(got, want)), 0, 1e-6 * H, name);
    near(v3.len(v3.sub(at(sk, name), want)), 0, 1e-6 * H, name + " joint");
  }
});

test("left alone, the walker leaves the body as it is", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  sk.setPose({ elbow_l: { flex: 60 } });
  const before = sk.pose();
  run(w, 1);
  assert.equal(w.active, false);
  assert.deepEqual(sk.pose(), before);
  near(v3.len(sk.place.t), 0, 0);
});

test("a walk cycle: legs swing in turn, each arm against its leg", () => {
  const hips = [], arms = [];
  for (let p = 0; p < 1; p += 0.02) { const g = gait(p); hips.push(g.hip); arms.push(g.shoulder); }
  assert.ok(corr(hips, arms) < -0.95);
  assert.ok(Math.max(...hips) >= 29 && Math.min(...hips) <= -9);
  const knee = (p) => gait(p).knee;
  assert.ok(knee(0.72) > 55 && knee(0.4) < 15, "the knee bends most in the swing");
});

test("W walks the body forward on the floor, legs and arms swinging", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  const start = at(sk, "pelvis").slice(), ground = lowestFoot(sk);
  const hipL = [], hipR = [], armL = [], floor = [];
  run(w, 3, { move: F }, (i) => {
    if (i < 60) return;
    hipL.push(sk.angles[sk.index("hip_l")].flex); hipR.push(sk.angles[sk.index("hip_r")].flex);
    armL.push(sk.angles[sk.index("shoulder_l")].flex);
    floor.push(lowestFoot(sk) - ground);
  });
  const moved = v3.sub(at(sk, "pelvis"), start);
  const ahead = v3.dot(moved, F);
  assert.ok(ahead > 0.6 * WALK.speed * 3 * H && ahead < 1.05 * WALK.speed * 3 * H, `walked ${ahead / H} H`);
  near(v3.dot(moved, L), 0, 0.02 * H, "straight ahead");
  for (const d of floor) near(d, 0, 0.002 * H, "a foot on the floor");
  assert.ok(Math.max(...hipL) > 25 && Math.min(...hipL) < -5, "the left thigh swings forward and back");
  assert.ok(corr(hipL, hipR) < -0.8, "the legs take turns");
  assert.ok(corr(hipL, armL) < -0.8, "the left arm swings against the left leg");
  const faced = w.facing();
  near(v3.dot(faced, F), 1, 1e-6, "still facing ahead");
});

test("the foot on the floor stays put while the body walks over it", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  run(w, 1.5, { move: F });
  let slid = 0, travelled = 0, prev = null;
  run(w, 2, { move: F }, () => {
    // the foot the walk cycle stands on, at its lowest point: the heel, then the toes as it rolls
    const k = stance(w.phase) > stance((w.phase + 0.5) % 1) ? 0 : 1, s = ["l", "r"][k];
    const low = w.footPoints(s).reduce((a, b) => (v3.dot(b, U) < v3.dot(a, U) ? b : a)).slice();
    const now = { k, low, pelvis: at(sk, "pelvis").slice() };
    if (prev && prev.k === k) {
      slid += v3.len(flat(v3.sub(now.low, prev.low)));
      travelled += v3.len(flat(v3.sub(now.pelvis, prev.pelvis)));
    }
    prev = now;
  });
  assert.ok(slid < 0.12 * travelled, `the standing foot slid ${(slid / travelled * 100).toFixed(0)}% of the way walked`);
});

test("feet don't slide as the walk starts and stops: the body only moves as far as they step", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  const start = at(sk, "pelvis").slice();
  w.update(DT, { move: F });
  const first = v3.dot(v3.sub(at(sk, "pelvis"), start), F);
  assert.ok(first < 0.003 * H, `a first frame's ${first / H} H`);
  run(w, 2, { move: F });
  const there = v3.dot(at(sk, "pelvis"), F);
  run(w, 2);
  const coast = v3.dot(at(sk, "pelvis"), F) - there;
  assert.ok(coast >= 0 && coast < 0.25 * H, `after letting go it steps on ${coast / H} H`);
});

test("the body never jolts back as a heel strikes: the walk only moves it on", () => {
  // (a foot rolling from toe to heel moved its point of contact, and the body went back with it)
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  run(w, 1, { move: F });
  let prev = w.pos.slice(), least = Infinity;
  run(w, 3, { move: F }, () => { least = Math.min(least, v3.dot(v3.sub(w.pos, prev), F) / DT / H); prev = w.pos.slice(); });
  assert.ok(least > -0.1, `the body went back at ${least} H/s`);
});

test("the camera's point goes on evenly while the feet carry the body in surges, and ends on it", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  run(w, 2, { move: F });
  const speeds = (key) => {
    const out = [];
    let prev = w[key].slice();
    return { out, step: () => { out.push(v3.dot(v3.sub(w[key], prev), F) / DT / H); prev = w[key].slice(); } };
  };
  const body = speeds("pos"), view = speeds("view");
  let far = 0, wobble = 0, prevSide = v3.dot(w.view, L);
  run(w, 3, { move: F }, () => {
    body.step(); view.step();
    far = Math.max(far, v3.len(v3.sub(w.view, w.pos)));
    wobble = Math.max(wobble, Math.abs(v3.dot(w.view, L) - prevSide) / DT / H); prevSide = v3.dot(w.view, L);
  });
  const spread = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(spread(view.out) < 0.25 * spread(body.out), `the camera's pace varies ${spread(view.out)} H/s, the body's ${spread(body.out)}`);
  assert.ok(spread(view.out) < 0.15, `the camera's pace varies ${spread(view.out)} H/s`);
  assert.ok(wobble < 0.05, `the camera moves sideways at up to ${wobble} H/s`);
  assert.ok(far < 0.12 * H, `the camera's point is ${far / H} H from the body`);
  // let go: the camera settles on the body, and then nothing moves
  let n = 0;
  while (w.update(DT, {}) && n < 600) n++;
  assert.ok(n < 600, "the walker stops");
  assert.equal(w.busy, false);
  assert.deepEqual(w.view, w.pos);
  w.home();
  assert.deepEqual(w.view, [0, 0, 0]);
});

test("walking, the pelvis turns and the weight shifts over the standing foot", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  run(w, 1.5, { move: F });
  const turn = [], side = [], foot = [];
  run(w, 2, { move: F }, () => {
    const hips = v3.sub(at(sk, "hip_l"), at(sk, "hip_r"));
    turn.push(v3.dot(hips, F) / v3.len(hips));               // the left hip ahead of the right
    side.push(v3.dot(at(sk, "pelvis"), L));
    foot.push(stance(w.phase) - stance((w.phase + 0.5) % 1));
  });
  const turned = Math.max(...turn) - Math.min(...turn);       // (sin 5° is 0.087 each way)
  assert.ok(turned > 0.12 && turned < 0.3, `the pelvis turns each way: ${turned}`);
  assert.ok(corr(side, foot) > 0.3, "it moves toward the foot it stands on");
  const sway = Math.max(...side) - Math.min(...side);
  assert.ok(sway > 0.01 * H && sway < 0.05 * H, `sways ${sway / H} H`);
});

test("A and D turn the body and walk it that way", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  const start = at(sk, "pelvis").slice();
  run(w, 3, { move: L });
  assert.ok(v3.dot(w.facing(), L) > 0.99, "faces left");
  const moved = flat(v3.sub(at(sk, "pelvis"), start));
  assert.ok(v3.dot(v3.unit(moved), L) > 0.9, "went left");
  // the face turned with the body
  const face = q.rot(sk.W[sk.index("head")], F);
  assert.ok(v3.dot(face, L) > 0.9);
  run(w, 3, { move: v3.scale(L, -1) });
  assert.ok(v3.dot(w.facing(), L) < -0.99, "turned round to the right");
});

test("let go: the panel's pose, arms that were held out as in the scan down, where the body got to", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  sk.setPose({ shoulder_r: { flex: 40, side: 20 }, elbow_r: { flex: 90 } });
  const before = sk.pose();
  run(w, 2, { move: F });
  assert.notDeepEqual(sk.pose(), before);
  const there = v3.dot(at(sk, "pelvis"), F);
  run(w, 2);
  assert.equal(w.active, false);
  const after = sk.pose();
  assert.deepEqual(after.shoulder_r, before.shoulder_r, "an arm placed in the panel stays where it was put");
  assert.deepEqual(after.elbow_r, before.elbow_r);
  armsDown(sk, w, ["l"]);                                   // the scan's A-pose arm stays down
  assert.deepEqual(w.basePose(), after, "what is kept is what is shown");
  run(w, 2, { move: F }); run(w, 2);
  assert.deepEqual(sk.pose(), after, "and stays so walk after walk");
  assert.ok(v3.dot(at(sk, "pelvis"), F) >= there, "it doesn't slide back");
  w.home();
  near(v3.len(v3.sub(at(sk, "pelvis"), sk.rest[sk.index("pelvis")])), 0, 1e-9, "home again");
});

test("Space jumps: a crouch, up off the floor, and down again", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  const ground = lowestFoot(sk), hip0 = v3.dot(at(sk, "pelvis"), U);
  let low = Infinity, high = -Infinity, air = 0, under = 0;
  w.update(DT, { jump: true });
  run(w, 2, { jump: true }, () => {          // held down: one jump, not another as it lands
    const hip = v3.dot(at(sk, "pelvis"), U);
    low = Math.min(low, hip); high = Math.max(high, hip);
    if (w.airborne) air = Math.max(air, lowestFoot(sk) - ground);
    under = Math.min(under, lowestFoot(sk) - ground);
  });
  assert.ok(hip0 - low > 0.03 * H, `crouches ${(hip0 - low) / H}`);
  assert.ok(high - hip0 > 0.12 * H, `rises ${(high - hip0) / H}`);
  assert.ok(air > 0.12 * H, `the feet leave the floor by ${air / H}`);
  near(under, 0, 0.003 * H, "never through the floor");
  run(w, 1);
  assert.equal(w.active, false, "landed and still");
  armsDown(sk, w);
  for (const j of ["hip_l", "knee_r", "spine"]) assert.deepEqual(angle(sk, j), sk.restAngles[sk.index(j)], j);
  near(v3.dot(at(sk, "pelvis"), U), hip0, 1e-9);
});

test("a jump while walking carries on forward", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  run(w, 1.5, { move: F });
  const start = v3.dot(at(sk, "pelvis"), F);
  w.update(DT, { move: F, jump: true });
  let airborne = false;
  run(w, 0.6, { move: F }, () => { airborne ||= w.airborne; });
  assert.ok(airborne);
  assert.ok(v3.dot(at(sk, "pelvis"), F) - start > 0.25 * H);
});

test("walking arms swing clear of the trunk", () => {
  const map = new SurfaceMap(rig);
  const sk = new Skeleton(rig, { body: new BodyVolume(rig, map) }), w = new Walker(sk, rig);
  const rest = sk.body.depth(sk.solve());
  assert.ok(w.armSide < sk.restAngles[sk.index("shoulder_l")].side, "the arms come down from the A-pose");
  let worst = 0;
  run(w, 3, { move: F }, () => { worst = Math.max(worst, sk.body.depth(sk)); });
  assert.ok(worst <= Math.max(rest, sk.body.tol) + 0.01 * H, `arms ${worst / H} H into the body`);
});

test("skin weights follow: a splat on the shin moves with its foot", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig), weights = new SkinWeights(rig);
  const knee = sk.rest[sk.index("knee_l")], ankle = sk.rest[sk.index("ankle_l")];
  const p = v3.add(v3.scale(knee, 0.3), v3.scale(ankle, 0.7));
  const b = new Uint8Array(4), wt = new Uint8Array(4);
  weights.at(p[0], p[1], p[2], b, wt);
  run(w, 2, { move: F });
  const shin = skinPoint(p, b, wt, dualQuats(sk.transforms()));
  const kn = at(sk, "knee_l"), an = at(sk, "ankle_l");
  const want = v3.add(v3.scale(kn, 0.3), v3.scale(an, 0.7));
  assert.ok(v3.len(v3.sub(shin, want)) < 0.05 * H, `${v3.len(v3.sub(shin, want)) / H} H from where the bones put it`);
});

test("settle: the panel's pose at once, where the body is", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  assert.equal(w.settle(), false, "nothing to settle");
  run(w, 1, { move: F });
  w.update(DT, { move: F, jump: true });
  const there = v3.dot(at(sk, "pelvis"), F);
  assert.equal(w.settle(), true);
  assert.equal(w.active, false);
  armsDown(sk, w);
  near(v3.dot(at(sk, "pelvis"), F), there, 0.01 * H, "stays where it got to");
  near(v3.dot(at(sk, "pelvis"), U), v3.dot(sk.rest[sk.index("pelvis")], U), 1e-9, "on the floor");
});

test("Q / E raise an arm and keep it up; pressed again, it comes down", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  assert.deepEqual(LIMBS, ["arm_l", "arm_r", "knee_l", "knee_r"]);
  assert.equal(w.toggle("arm_l"), true);
  run(w, 1);
  assert.ok(v3.dot(v3.unit(v3.sub(at(sk, "elbow_l"), at(sk, "shoulder_l"))), U) > 0.9, "left arm up");
  assert.ok(v3.dot(v3.unit(v3.sub(at(sk, "elbow_r"), at(sk, "shoulder_r"))), U) < -0.8, "right arm down by the side");
  assert.equal(w.busy, false, "held up without a key held down");
  assert.equal(w.update(DT), false, "nothing to redraw while it stays up");
  assert.deepEqual(w.raised(), ["arm_l"]);
  run(w, 2, { move: F });                                  // walking: the arm stays up
  assert.ok(v3.dot(v3.unit(v3.sub(at(sk, "elbow_l"), at(sk, "shoulder_l"))), U) > 0.9, "still up while walking");
  run(w, 2);
  assert.equal(w.toggle("arm_l"), false);
  run(w, 1.5);
  assert.equal(w.active, false);
  armsDown(sk, w);
});

test("Z / C raise a knee, standing on the other foot; one at a time; walking lowers it", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig);
  const ground = lowestFoot(sk), hip0 = v3.dot(at(sk, "pelvis"), U);
  w.toggle("knee_r");
  run(w, 1);
  const thigh = v3.unit(v3.sub(at(sk, "knee_r"), at(sk, "hip_r")));
  assert.ok(v3.dot(thigh, F) > 0.9, "right thigh forward, level");
  assert.ok(v3.dot(at(sk, "ankle_r"), U) - ground > 0.15 * H, "right foot off the floor");
  near(lowestFoot(sk), ground, 0.003 * H, "standing on the left foot");
  near(v3.dot(at(sk, "pelvis"), U), hip0, 0.01 * H, "standing as tall");
  w.toggle("knee_l");
  assert.deepEqual(w.raised(), ["knee_l"], "the other knee comes down");
  run(w, 1);
  assert.ok(v3.dot(v3.unit(v3.sub(at(sk, "knee_l"), at(sk, "hip_l"))), F) > 0.9);
  run(w, 1, { move: F });
  assert.deepEqual(w.raised(), [], "walking puts the knee down");
  run(w, 2);
  assert.equal(w.active, false);
});

test("standing, the body breathes, sways a little, blinks and looks at the camera", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sk = new Skeleton(rig), life = new Life(sk, rig, rand);
  const head = sk.P[sk.index("head")], side = v3.add(head, v3.add(v3.scale(L, 2 * H), v3.scale(F, 0.5 * H)));
  let peaks = 0, last = 0, rising = false, blinks = 0, shut = 0, longest = 0, r;
  for (let i = 0; i < 30 * 60; i++) {
    r = life.update(DT, { eye: side });
    if (r.breath > last) rising = true; else if (rising) { peaks++; rising = false; }
    last = r.breath;
    if (r.blink > 0) { if (!shut) blinks++; shut += DT; longest = Math.max(longest, shut); } else shut = 0;
    assert.ok(r.breath >= 0 && r.breath <= 1);
  }
  near(peaks, 30 * LIFE.breaths, 1.5, "breaths in 30 s");
  assert.ok(blinks >= 30 / LIFE.blink[1] - 1 && blinks <= 30 / LIFE.blink[0] + 1, `${blinks} blinks in 30 s`);
  assert.ok(longest < 0.25, `a blink is quick (${longest} s)`);
  // the head turned toward the camera at the side, no further than a neck goes
  assert.ok(life.yaw > 0.8 * LIFE.look.yaw && life.yaw <= LIFE.look.yaw + 1e-9, `looks to the side (${life.yaw})`);
  // all of it small: the pelvis sways a degree or so, the chest moves with the breath
  const pel = r.extra[sk.index("pelvis")];
  assert.ok(Math.abs(pel.side) <= 1 && Math.abs(pel.twist) <= 1);
  // walking, the head looks where it goes
  for (let i = 0; i < 3 * 60; i++) life.update(DT, { eye: side, walking: 1 });
  assert.ok(Math.abs(life.yaw) < 2, `faces ahead walking (${life.yaw})`);
});

test("a jump from standing lands where it took off", () => {
  for (const dt of [DT, 1 / 8]) {
    const sk = new Skeleton(rig), w = new Walker(sk, rig);
    const before = w.pos.slice();
    w.update(dt, { jump: true });
    for (let i = 0; i < 400 && w.active; i++) w.update(dt, {});
    assert.ok(!w.active);
    near(v3.len(v3.sub(w.pos, before)), 0, 0.002 * H, `dt ${dt}`);
  }
});
