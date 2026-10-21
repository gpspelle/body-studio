// What skin does that bones don't (src/body_studio/static/flesh.js) against a real rig: capsules,
// contact shading, clothes out of the body, channels, a fist, the shadow on the floor and the swing
// of loose clothes. Run by tests/unit/test_pose_js.py:
//   RIG_JSON=/path/to/body.rig.json BODY_PLY=/path/to/body.ply node --test tests/js/flesh.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Skeleton, SkinWeights, SurfaceMap, q, v3 } from "../../src/body_studio/static/pose.js";
import { CH, MAX_CAPSULES, PARTS, SHADE, SWING, BULGE, Swing, bodyCapsules, channelLevels, curl, darknessAt, handFrames,
         looseness, occlusion, inkFactor, HEALED, PIGMENT, shapeKg, shapeOffsets, SkinField, partsOf, penetration, posedCapsules, pushOut, restOffsets, shadowBlobs, boneParts } from "../../src/body_studio/static/flesh.js";

const rig = JSON.parse(readFileSync(process.env.RIG_JSON, "utf8"));
const { up: U, front: F, left: L } = rig.frame;
const H = rig.height;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (±${tol})`);
const joint = (name) => rig.joints.find((j) => j.name === name).pos;
const map = new SurfaceMap(rig);
const caps = bodyCapsules(rig, map);
const posed = (sk) => { sk.solve(); return posedCapsules(caps, sk.transforms()); };

function readPly(path) {
  const buf = readFileSync(path);
  const end = buf.indexOf("end_header\n") + 11;
  const head = buf.subarray(0, end).toString();
  const props = [...head.matchAll(/property float (\w+)/g)].map((m) => m[1]);
  const n = +head.match(/element vertex (\d+)/)[1], P = props.length;
  const f = new Float32Array(buf.buffer.slice(buf.byteOffset + end, buf.byteOffset + end + n * P * 4));
  const ix = props.indexOf("x"), centres = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) centres.set(f.subarray(i * P + ix, i * P + ix + 3), i * 3);
  return centres;
}

test("the body as capsules: every part, sized like a body", () => {
  assert.ok(caps.length > 10 && caps.length <= MAX_CAPSULES, `${caps.length} capsules`);
  const parts = new Set(caps.map((c) => PARTS[c.part]));
  for (const p of ["trunk", "head", "arm_l", "forearm_r", "thigh_l", "shin_r"]) assert.ok(parts.has(p), p);
  for (const c of caps) assert.ok(c.r > 0.01 * H && c.r < 0.12 * H, `${PARTS[c.part]} radius ${c.r / H}`);
  // at rest the posed capsules are the capsules
  const C = posed(new Skeleton(rig));
  caps.forEach((c, i) => { near(v3.len(v3.sub([C[i * 8], C[i * 8 + 1], C[i * 8 + 2]], c.a)), 0, 1e-6 * H); near(C[i * 8 + 3], c.r, 1e-6 * H); });
});

test("skin is shaded where another part comes close, and not where nothing does", () => {
  const sk = new Skeleton(rig), trunk = PARTS.indexOf("trunk");
  // the flank, under the armpit and a little out from the chest
  const flank = v3.add(v3.scale(v3.add(joint("chest"), joint("spine")), 0.5), v3.scale(L, 0.09 * H));
  const rest = occlusion(flank, trunk, posed(sk), caps.length, H);
  sk.set("shoulder_l", { flex: 0, side: 0 }); sk.set("shoulder_r", { flex: 0, side: 0 });
  const down = occlusion(flank, trunk, posed(sk), caps.length, H);
  assert.ok(down > rest + 0.1, `arm down shades the flank more (${rest} → ${down})`);
  const far = v3.add(joint("head"), v3.scale(U, 0.5 * H));
  assert.equal(occlusion(far, trunk, posed(sk), caps.length, H), 0);
  assert.ok(down <= SHADE.cap);
});

test("clothes are pushed out of other parts, no deeper than at rest", () => {
  const C = posed(new Skeleton(rig)), k = caps.findIndex((c) => PARTS[c.part] === "thigh_l"), c = caps[k];
  const mid = v3.scale(v3.add(c.a, c.b), 0.5), side = v3.unit(v3.cross(v3.sub(c.b, c.a), F));
  const inside = v3.add(mid, v3.scale(side, 0.3 * c.r)), shin = PARTS.indexOf("shin_r");
  assert.ok(penetration(inside, shin, C, caps.length, H) > 0);
  const out = pushOut(inside, shin, C, caps.length, H, 0);
  assert.ok(penetration(out, shin, C, caps.length, H) < 1e-6 * H, "out of every capsule but its own");
  // cloth already that deep in the scan stays where it is
  const deep = penetration(inside, shin, C, caps.length, H);
  near(v3.len(v3.sub(pushOut(inside, shin, C, caps.length, H, deep), inside)), 0, 1e-9);
  // its own part doesn't push it
  assert.deepEqual(pushOut(inside, c.part, C, caps.length, H, 0), inside);
});

test("channels follow the joints, breath and the hands", () => {
  const sk = new Skeleton(rig);
  sk.set("elbow_l", { flex: 0 }); sk.set("knee_r", { flex: 120 }); sk.solve();
  const c = channelLevels(sk, { breath: 0.4, fist: { l: 0.25, r: 1 } });
  near(c[CH.elbow_l], 0, 1e-6); near(c[CH.knee_r], 1, 1e-6); near(c[CH.breath], 0.4, 1e-6);
  near(c[CH.fist_l_half], 0.5, 1e-6); near(c[CH.fist_l_full], 0, 1e-6);
  near(c[CH.fist_r_half], 1, 1e-6); near(c[CH.fist_r_full], 1, 1e-6);
});

test("a fist curls the fingers toward the palm, the palm stays", () => {
  const hf = handFrames(rig).l, tip = v3.add(hf.wrist, v3.scale(hf.axis, 0.95 * hf.len));
  assert.equal(curl(v3.add(hf.wrist, v3.scale(hf.axis, 0.2 * hf.len)), hf, 1), null, "the palm doesn't move");
  assert.deepEqual(curl(tip, hf, 0), tip);
  const half = curl(tip, hf, 0.5), full = curl(tip, hf, 1);
  const along = (p) => v3.dot(v3.sub(p, hf.wrist), hf.axis), toward = (p) => v3.dot(v3.sub(p, hf.wrist), hf.palm);
  assert.ok(along(full) < along(half) && along(half) < along(tip), "the fingertip comes back");
  assert.ok(toward(half) > toward(tip) + 0.1 * hf.len, "and goes toward the palm");
  // a finger keeps its length: the tip stays as far from the knuckle as it was
  const k = v3.add(hf.wrist, v3.scale(hf.axis, BULGE.knuckle * hf.len));
  assert.ok(v3.len(v3.sub(full, k)) <= v3.len(v3.sub(tip, k)) + 1e-9);
});

test("offsets at rest are small: a breath, a biceps", () => {
  const pts = readPly(process.env.BODY_PLY), n = pts.length / 3, w = new SkinWeights(rig);
  const bones = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) w.at(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], bones, weights, i);
  const parts = partsOf(bones, weights, n, boneParts(rig));
  const { A } = restOffsets(rig, pts, parts, handFrames(rig), n);
  let breath = 0, biceps = 0, most = 0;
  for (let i = 0; i < n; i++) {
    const ch = A[i * 4 + 3], len = Math.hypot(A[i * 4], A[i * 4 + 1], A[i * 4 + 2]);
    if (ch === CH.breath) { breath++; most = Math.max(most, len); }
    if (ch === CH.elbow_l || ch === CH.elbow_r) biceps++;
  }
  assert.ok(breath > 0.05 * n, `breathing moves the trunk (${breath} of ${n})`);
  assert.ok(biceps > 0.005 * n, `the biceps swells (${biceps})`);
  assert.ok(most < 1.2 * BULGE.breath * H, `a breath is a few millimetres (${most / H})`);
});

test("the shadow is darkest under the feet and fades as the body leaves the floor", () => {
  const sk = new Skeleton(rig);
  const C = posed(sk);
  // in the page's coordinates y is up: the rig's are turned so they are too
  const toY = q.between(U, [0, 1, 0]), Y = (c) => {
    const out = c.slice();
    for (let i = 0; i < caps.length; i++) for (const o of [0, 4]) out.set(q.rot(toY, [c[i * 8 + o], c[i * 8 + o + 1], c[i * 8 + o + 2]]), i * 8 + o);
    return out;
  };
  const W = Y(C), lowest = Math.min(...caps.map((_, i) => Math.min(W[i * 8 + 1], W[i * 8 + 5]) - W[i * 8 + 3]));
  const blobs = shadowBlobs(W, caps.length, lowest, H);
  const at = (name) => { const p = q.rot(toY, joint(name)); return darknessAt(blobs, p[0], p[2]); };
  const hand = q.rot(toY, joint("hand_end_l")), out = v3.add(hand, v3.scale(q.rot(toY, L), 0.3 * H));
  assert.ok(at("ankle_l") > 0.5, `dark under a foot (${at("ankle_l")})`);
  assert.ok(at("ankle_l") > 2 * darknessAt(blobs, out[0], out[2]), "not out to the side");
  // a jump: the same body 0.3 H up casts a fainter shadow
  const up = W.slice();
  for (let i = 0; i < caps.length; i++) { up[i * 8 + 1] += 0.3 * H; up[i * 8 + 5] += 0.3 * H; }
  const air = shadowBlobs(up, caps.length, lowest, H), a = q.rot(toY, joint("ankle_l"));
  assert.ok(darknessAt(air, a[0], a[2]) < 0.6 * at("ankle_l"), "fainter from the air");
});

test("loose clothes swing behind the body and settle", () => {
  const s = new Swing(H, SWING.hips), dt = 1 / 60;
  assert.deepEqual(s.update(dt, [0, 0, 0]), [0, 0, 0]);
  for (let i = 0; i < 60; i++) assert.deepEqual(s.update(dt, [0, 0, 0]).map((x) => Math.abs(x)), [0, 0, 0], "still: nothing moves");
  // walk off along x at 1 m/s-ish (0.6 H a second) for half a second, then stop
  let x = 0, most = 0, back = 0;
  for (let i = 0; i < 30; i++) { x += 0.6 * H * dt; const o = s.update(dt, [x, 0, 0]); most = Math.min(most, o[0]); }
  assert.ok(most < -0.002 * H, `it trails behind (${most / H})`);
  for (let i = 0; i < 60; i++) back = Math.max(back, s.update(dt, [x, 0, 0])[0]);
  assert.ok(back > 0.001 * H, `then swings past when the body stops (${back / H})`);
  let o;
  for (let i = 0; i < 300; i++) o = s.update(dt, [x, 0, 0]);
  assert.ok(Math.hypot(...o) < 1e-4 * H, "and settles");
  // a hard stop: never further than SWING.max
  const t = new Swing(H, SWING.hips);
  t.update(dt, [0, 0, 0]);
  for (let i = 0; i < 10; i++) assert.ok(Math.hypot(...t.update(dt, [(i + 1) * H, 0, 0])) <= SWING.max * H + 1e-9);
  // the same with a slow frame rate: no blow up
  const u = new Swing(H, SWING.head);
  u.update(0.5, [0, 0, 0]);
  for (let i = 0; i < 20; i++) assert.ok(Number.isFinite(u.update(0.5, [i * 0.1 * H, 0, 0])[0]));
});

test("only what hangs away from the skin swings", () => {
  assert.equal(looseness(0, H), 0);
  assert.equal(looseness(0.003 * H, H), 0, "a tight shirt");
  assert.equal(looseness(0.05 * H, H), 1, "a skirt's hem");
  let last = 0;
  for (let g = 0; g <= 0.04; g += 0.002) { const l = looseness(g * H, H); assert.ok(l >= last); last = l; }
});

test("what if: every splat takes the moves of the skin nearest it", () => {
  // two skin vertices, one moving up, one moving out
  const skin = Float32Array.from([0, 0, 0, 1, 0, 0]), moves = Float32Array.from([0, 1, 0, 0, 0, 1]);
  const field = new SkinField(skin, 0.3), pts = Float32Array.from([0.01, 0, 0, 0.99, 0, 0, 5, 5, 5]), layer = new Float32Array(12).fill(-1);
  shapeOffsets(layer, field, moves, pts, 3);
  assert.ok(layer[1] > 0.9 && layer[2] < 0.1, "near the first: up");
  assert.ok(layer[6] > 0.9 && layer[5] < 0.1, "near the second: out");
  assert.deepEqual([layer[8], layer[9], layer[10]], [0, 0, 0], "no skin near: still");
  assert.equal(layer[3], -1, "the part (w) is left alone");
  // kilograms: volume (of H³) × H³ × density
  near(shapeKg({ weight: 0.001, muscle: 0 }, [1, 1], 100), 1.01, 1e-9);
  near(shapeKg({ weight: 0.001, muscle: 0.002 }, [-1, 0.5], 200), 8 * 1010 * (-0.001 + 0.001), 1e-9);
});

test("healed ink: darker than the skin, greyer than the design, never black", () => {
  const black = inkFactor([0, 0, 0], 1), red = inkFactor([0.9, 0.1, 0.1], 1), none = inkFactor([0, 0, 0], 0);
  assert.deepEqual(none, [1, 1, 1], "no ink: the skin as it is");
  for (let x = 0; x < 3; x++) assert.ok(black[x] > PIGMENT[x] && black[x] < 0.25, "black ink lets a little skin through");
  // red stays red, but less so than the design: its channels closer together
  assert.ok(red[0] > red[1] && red[0] - red[1] < 0.88 * HEALED.depth * 0.8);
});
