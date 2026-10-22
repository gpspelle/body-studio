// What skin does that bones don't (src/body_studio/static/flesh.js) against a real rig: capsules,
// contact shading, clothes out of the body, channels, a fist, the shadow on the floor and the swing
// of loose clothes. Run by tests/unit/test_pose_js.py:
//   RIG_JSON=/path/to/body.rig.json BODY_PLY=/path/to/body.ply node --test tests/js/flesh.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Skeleton, SkinWeights, SurfaceMap, dualQuats, skinPoint, q, v3 } from "../../src/body_studio/static/pose.js";
import { Walker } from "../../src/body_studio/static/walk.js";
import { CH, MAX_CAPSULES, PARTS, SHADE, SWING, BULGE, Swing, bodyCapsules, channelLevels, curl, darknessAt, handFrames,
         looseness, smoothOver, swingPoint, occlusion, inkFactor, HEALED, PIGMENT, shapeKg, shapeOffsets, SkinField, partsOf, penetration, posedCapsules, pushOut, restOffsets, shadowBlobs, boneParts,
         FOLD, TWIST, foldNeighbours, twistFractions, twistState, twistPoint } from "../../src/body_studio/static/flesh.js";

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

// the swing of loose clothes: offsets along the floor (front, left) and up, in heights
const parts = (o) => [v3.dot(o, F) / H, v3.dot(o, L) / H, v3.dot(o, U) / H];
const along = (x) => v3.scale(F, x * H);

test("loose clothes swing behind the body and settle", () => {
  const s = new Swing(H, SWING.hips, U, F), dt = 1 / 60;
  assert.deepEqual(s.update(dt, [0, 0, 0]), [0, 0, 0, 0]);
  for (let i = 0; i < 60; i++) assert.ok(Math.hypot(...s.update(dt, [0, 0, 0])) === 0, "still: nothing moves");
  assert.equal(s.moving(), false);
  // walk off forward at about 1 m/s (0.6 H a second) for a second, then stop
  let x = 0, most = 0, back = 0, o;
  for (let i = 0; i < 60; i++) { x += 0.6 * dt; most = Math.min(most, parts(s.update(dt, along(x)))[0]); }
  assert.ok(most < -0.004, `it trails behind (${most})`);
  assert.ok(most > -SWING.hips.max - 1e-9, `no further than its limit (${most})`);
  let again = 0;
  for (let i = 0; i < 40; i++) back = Math.max(back, parts(s.update(dt, along(x)))[0]);
  for (let i = 0; i < 40; i++) again = Math.min(again, parts(s.update(dt, along(x)))[0]);
  assert.ok(back > 0.004, `then swings on when the body stops (${back})`);
  assert.ok(-again < 0.5 * back, `and back less far: it is damped (${again} after ${back})`);
  for (let i = 0; i < 120; i++) o = s.update(dt, along(x));
  assert.ok(Math.hypot(...o.slice(0, 3)) < 2e-4 * H, `and settles within 4 s (${Math.hypot(...o) / H})`);
  assert.equal(s.moving(), false);
  // the same with a slow frame rate: no blow up
  const u = new Swing(H, SWING.head, U, F);
  u.update(0.5, [0, 0, 0]);
  for (let i = 0; i < 20; i++) assert.ok(u.update(0.5, along(i * 0.1)).every(Number.isFinite));
});

test("cloth swings across, not up and down, and eases into its limit", () => {
  // the hips going up and down 3 cm-ish twice a second (steps): the hem hardly bounces
  const s = new Swing(H, SWING.hips, U, F), dt = 1 / 60;
  let up = 0, side = 0;
  for (let i = 0; i < 240; i++) {
    const t = i * dt, o = parts(s.update(dt, v3.add(v3.scale(U, 0.02 * H * Math.sin(2 * Math.PI * 2 * t)), v3.scale(L, 0.02 * H * Math.sin(2 * Math.PI * 0.9 * t)))));
    if (t > 2) { up = Math.max(up, Math.abs(o[2])); side = Math.max(side, Math.abs(o[1])); }
  }
  assert.ok(up < 0.003, `up and down: ${up}`);
  assert.ok(side > 3 * up, `side to side swings more: ${side} vs ${up}`);
  // thrown hard (running off at 2 H a second, then stopping dead): never past its limit, and smooth
  const t = new Swing(H, SWING.hips, U, F);
  t.update(dt, [0, 0, 0]);
  let last = 0, step = 0, x = 0, most = 0;
  for (let i = 0; i < 150; i++) {
    if (i < 60) x += 2 * dt;
    const o = parts(t.update(dt, along(x)));
    assert.ok(Math.hypot(o[0], o[1]) <= SWING.hips.max + 1e-9);
    step = Math.max(step, Math.abs(o[0] - last)); last = o[0]; most = Math.max(most, Math.abs(o[0]));
  }
  assert.ok(most > 0.8 * SWING.hips.max, `near its limit (${most})`);
  assert.ok(step < 0.25 * SWING.hips.max, `no snap from one frame to the next (${step})`);
  // put somewhere else at once (R, back where it was scanned): it hangs still there
  const r = new Swing(H, SWING.hips, U, F);
  r.update(dt, [0, 0, 0]);
  assert.ok(Math.hypot(...r.update(dt, along(1))) === 0);
});

test("a jolt of the body doesn't kick the cloth", () => {
  // walking along at 0.6 H a second, the hips jump back 3% of the height for a frame
  const s = new Swing(H, SWING.hips, U, F), dt = 1 / 60, x = (i) => 0.6 * i * dt - (i === 120 ? 0.03 : 0);
  const os = [];
  for (let i = 0; i < 200; i++) os.push(parts(s.update(dt, along(x(i))))[0]);
  const jump = Math.max(...[118, 119, 120, 121, 122].map((i) => Math.abs(os[i + 1] - 2 * os[i] + os[i - 1])));
  assert.ok(jump < 0.0015, `the hem moves on smoothly (${jump})`);
});

test("cloth and hair turn behind the body", () => {
  const s = new Swing(H, SWING.hips, U, F), dt = 1 / 60;
  s.update(dt, [0, 0, 0], q.id());
  let lag = 0, over = 0, again = 0, o;
  // a half turn in half a second, then held
  for (let i = 1; i <= 30; i++) lag = Math.min(lag, s.update(dt, [0, 0, 0], q.axisAngle(U, Math.PI * i / 30 * 0.999))[3]);
  for (let i = 0; i < 30; i++) over = Math.max(over, s.update(dt, [0, 0, 0], q.axisAngle(U, Math.PI * 0.999))[3]);
  for (let i = 0; i < 30; i++) again = Math.min(again, s.update(dt, [0, 0, 0], q.axisAngle(U, Math.PI * 0.999))[3]);
  assert.ok(lag < -0.1, `the hem stays behind as the hips turn (${lag})`);
  assert.ok(lag >= -SWING.hips.twist.max - 1e-9, "no further than its limit");
  assert.ok(over > 0.05, `swings on past when the hips stop (${over})`);
  assert.ok(-again < 0.5 * over, `and back less far (${again} after ${over})`);
  for (let i = 0; i < 240; i++) o = s.update(dt, [0, 0, 0], q.axisAngle(U, Math.PI * 0.999));
  assert.ok(Math.abs(o[3]) < 1e-3, `and settles (${o[3]})`);
  // a splat in front of the anchor, all of it loose, is carried back against the turn (the way
  // the page draws it)
  const at = joint("pelvis"), c = v3.add(at, v3.scale(F, 0.1 * H));
  const turned = swingPoint(c, { o: [0, 0, 0, -0.2], at, up: U }, 1);
  near(v3.len(v3.sub(turned, at)), 0.1 * H, 1e-9, "turned, not moved off");
  near(v3.dot(v3.sub(turned, at), q.rot(q.axisAngle(U, -0.2), F)), 0.1 * H, 1e-9, "the way q turns it");
  assert.deepEqual(swingPoint(c, { o: [1, 2, 3, -0.2], at, up: U }, 0), c, "a tight splat stays");
});

test("walking, a skirt sways without jitter", () => {
  const sk = new Skeleton(rig), w = new Walker(sk, rig), dt = 1 / 60, j = sk.index("pelvis");
  const s = new Swing(H, SWING.hips, U, F), rows = [];
  for (let i = 0; i < 4 * 60; i++) {
    w.update(dt, { move: F });
    const o = s.update(dt, sk.P[j], sk.W[j]);
    if (i * dt > 1.5) rows.push(parts(o));
  }
  const range = (a) => Math.max(...rows.map((r) => r[a])) - Math.min(...rows.map((r) => r[a]));
  let jerk = 0;
  for (let i = 2; i < rows.length; i++) for (let a = 0; a < 3; a++) jerk = Math.max(jerk, Math.abs(rows[i][a] - 2 * rows[i - 1][a] + rows[i - 2][a]));
  assert.ok(range(2) < 0.012, `the hem bobs ${range(2)} of the height`);
  assert.ok(range(0) < 0.03 && range(1) < 0.03, `sways ${range(0)}, ${range(1)}`);
  assert.ok(jerk < 0.002, `no jitter from frame to frame (${jerk})`);
});

test("splats side by side swing alike", () => {
  // a hem's splats in two layers, one on the skin and one 2 cm out: noisy looseness, made even
  const n = 2000, C = new Float32Array(n * 3), l = new Float32Array(n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    C.set([rnd() * 0.2 * H, rnd() * 0.2 * H, (i % 2) * 0.012 * H], i * 3);
    l[i] = (i % 2) * 0.6 + 0.4 * C[i * 3 + 1] / (0.2 * H);   // two layers, and a slope down the hem
  }
  const sm = smoothOver(l, C, n, SWING.near * H);
  let jump = 0, slope = 0;
  for (let i = 1; i < n; i += 2) {             // each outer splat against the inner one under it
    let best = -1, bd = Infinity;
    for (let j = 0; j < n; j += 2) { const d = Math.hypot(C[i * 3] - C[j * 3], C[i * 3 + 1] - C[j * 3 + 1]); if (d < bd) { bd = d; best = j; } }
    jump = Math.max(jump, Math.abs(sm[i] - sm[best]));
  }
  for (let i = 0; i < n; i++) slope += (sm[i] - 0.3) * (C[i * 3 + 1] / (0.2 * H) - 0.5);
  assert.ok(jump < 0.25, `the layers swing nearly together (${jump})`);
  assert.ok(slope > 0, "the hem still swings more than the top");
  const same = smoothOver(new Float32Array(n).fill(0.7), C, n, SWING.near * H);
  assert.ok(same.every((x) => Math.abs(x - 0.7) < 1e-6), "an even field stays as it is");
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

// the MakeHuman body's splats with their skin, once
let skinned = null;
function body() {
  if (skinned) return skinned;
  const pts = readPly(process.env.BODY_PLY), n = pts.length / 3, w = new SkinWeights(rig);
  const bones = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) w.at(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], bones, weights, i);
  return (skinned = { pts, n, bones, weights, parts: partsOf(bones, weights, n, boneParts(rig)) });
}

test("more bulges: the deltoid with the arm up, the forearm with a fist, the calf with the toes pointed", () => {
  const { pts, n, parts } = body();
  const { A, B } = restOffsets(rig, pts, parts, handFrames(rig), n);
  const count = (chs) => { let c = 0; for (let i = 0; i < n; i++) if (chs.includes(A[i * 4 + 3]) || chs.includes(B[i * 4 + 3])) c++; return c; };
  for (const [name, chs] of [["deltoid", [CH.raise_l, CH.raise_r]], ["forearm", [CH.grip_l, CH.grip_r]], ["calf", [CH.point_l, CH.point_r]]])
    assert.ok(count(chs) > 0.004 * n, `${name} swells (${count(chs)} of ${n})`);
  // and their channels follow the pose
  const sk = new Skeleton(rig);
  const rest = channelLevels(sk);
  sk.set("shoulder_l", { flex: 0, side: 160 }); sk.set("ankle_r", { flex: -45 }); sk.solve();
  const c = channelLevels(sk, { fist: { l: 1, r: 0 } });
  assert.ok(c[CH.raise_l] > 0.9 && c[CH.raise_l] > rest[CH.raise_l] + 0.5, `arm up ${c[CH.raise_l]}`);
  assert.ok(c[CH.point_r] > 0.9, `toes pointed ${c[CH.point_r]}`);
  near(c[CH.grip_l], 1, 1e-6); near(c[CH.grip_r], 0, 1e-6);
});

test("the forearm's skin turns with the hand: all of it at the wrist, none at the elbow", () => {
  const { pts, n, bones, weights, parts } = body();
  const T = twistFractions(rig, pts, bones, weights, parts, n), fore = PARTS.indexOf("forearm_l");
  const el = joint("elbow_l"), wr = joint("wrist_l"), ax = v3.sub(wr, el), len2 = v3.dot(ax, ax);
  const k = TWIST.limbs.findIndex((L) => L.part === "forearm_l");
  let nearElbow = [], nearWrist = [];
  for (let i = 0; i < n; i++) {
    if (parts[i] !== fore) continue;
    const t = v3.dot(v3.sub([pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]], el), ax) / len2;
    assert.equal(T[i * 4 + 1], T[i * 4] ? k : -1);
    if (t < 0.15) nearElbow.push(T[i * 4]);
    if (t > 0.6 && t < 0.8) nearWrist.push(T[i * 4]);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(nearElbow) < 0.12, `near the elbow it hardly turns (${mean(nearElbow)})`);
  assert.ok(mean(nearWrist) > 0.5, `near the wrist most of the way (${mean(nearWrist)})`);
  // the twist is the wrist's turn, and a point taking all of it goes where the hand takes it
  const sk = new Skeleton(rig), j = sk.index("wrist_l"), r = sk.restAngles[j];
  sk.angles[j] = sk.clamp(j, { ...r, twist: r.twist + 60 });
  sk.solve();
  const S = twistState(sk);
  near(Math.abs(S[k * 8 + 3]) * 180 / Math.PI, 60, 2, "the forearm's twist");
  const dq = dualQuats(sk.transforms()), p = v3.add(v3.scale(el, 0.2), v3.scale(wr, 0.8));
  const side = v3.scale(v3.unit(v3.cross(ax, F)), 0.03 * H), on = v3.add(p, side);
  const byHand = skinPoint(on, [j, 0, 0, 0], [255, 0, 0, 0], dq);
  const byElbow = twistPoint(skinPoint(on, [sk.index("elbow_l"), 0, 0, 0], [255, 0, 0, 0], dq), S, k, 1);
  // (the hand's bone pivots at the wrist, the twist about the forearm's axis: the same turn about the same line)
  near(v3.len(v3.sub(byHand, byElbow)), 0, 0.002 * H, "frac 1 is the hand's turn");
  // no twist: nothing turns
  const S0 = twistState(new Skeleton(rig));
  for (let m = 0; m < TWIST.limbs.length; m++) near(S0[m * 8 + 3], 0, 1e-6);
});

test("the upper arm's and the thigh's skin lags near the trunk", () => {
  const { pts, n, bones, weights, parts } = body();
  const T = twistFractions(rig, pts, bones, weights, parts, n);
  for (const name of ["arm_r", "thigh_l"]) {
    const k = TWIST.limbs.findIndex((L) => L.part === name), part = PARTS.indexOf(name);
    let lag = 0, most = 0;
    for (let i = 0; i < n; i++) if (parts[i] === part && T[i * 4 + 1] === k) { lag++; most = Math.min(most, T[i * 4]); }
    assert.ok(lag > 100, `${name}: ${lag} splats lag`);
    assert.ok(most >= -TWIST.lag - 1e-6 && most < -0.1, `${name}: at most ${TWIST.lag} behind (${most})`);
  }
  const sk = new Skeleton(rig), j = sk.index("hip_l"), r = sk.restAngles[j];
  sk.angles[j] = sk.clamp(j, { ...r, twist: r.twist + 30 });
  sk.solve();
  const k = TWIST.limbs.findIndex((L) => L.part === "thigh_l");
  near(Math.abs(twistState(sk)[k * 8 + 3]) * 180 / Math.PI, 30, 2, "the thigh's twist");
});

test("a bent elbow or knee folds the skin instead of passing through", () => {
  const nb = foldNeighbours(), I = (p) => PARTS.indexOf(p);
  for (const s of ["l", "r"]) for (const [a, b] of FOLD.pairs) {
    const pa = I(a === "trunk" ? a : a + "_" + s), pb = I(b + "_" + s);
    assert.ok((nb[pa] >> pb) & 1 && (nb[pb] >> pa) & 1, `${a} and ${b} fold against each other`);
  }
  assert.equal((nb[I("arm_l")] >> I("trunk")) & 1, 0, "an arm doesn't fold against the trunk");
  const sk = new Skeleton(rig);
  sk.set("knee_l", { flex: 140 }); sk.solve();
  const C = posedCapsules(caps, sk.transforms()), shinCap = caps.findIndex((c) => PARTS[c.part] === "shin_l");
  // the back of the calf, near the knee, where the bend has brought it into the thigh
  const c0 = caps[shinCap], back = v3.scale(F, -1);
  const dq = dualQuats(sk.transforms()), kn = sk.index("knee_l");
  const atRest = v3.add(v3.add(c0.a, v3.scale(v3.sub(c0.b, c0.a), 0.15)), v3.scale(back, 0.8 * c0.r));
  const p = skinPoint(atRest, [kn, 0, 0, 0], [255, 0, 0, 0], dq), shin = I("shin_l");
  const deep = penetration(p, shin, C, caps.length, H, FOLD.margin, nb[shin]);
  assert.ok(deep > 0.005 * H, `the calf goes into the thigh by ${deep / H}`);
  const out = pushOut(p, shin, C, caps.length, H, 0, FOLD.margin, nb[shin]);
  assert.ok(penetration(out, shin, C, caps.length, H, FOLD.margin, nb[shin]) < 1e-6 * H, "pushed out of it");
  assert.ok(v3.len(v3.sub(out, p)) < 0.08 * H, "by a few centimetres");
});
