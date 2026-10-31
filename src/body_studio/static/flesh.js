// Flesh: what skin does that bones alone don't, for the page, free of three.js so it can be tested
// on its own (tests/js/flesh.test.mjs, run by tests/unit/test_pose_js.py). Spark's SplatSkinning
// moves each splat with its bones; after that, a small GPU step (fleshgpu.js, the same maths as
// here) adds, per splat:
//   - offsets made at rest and turned with the splat's skin: a biceps that swells as the elbow
//     bends, a chest that rises with each breath, fingers curling into a fist, and the person a
//     little lighter, heavier or more muscular ("what if" sliders);
//   - contact shading: skin darkens where another part of the body comes close to it (an arm
//     lowered against the side, the thighs together, the belly over the thighs when sitting),
//     measured against how close it was in the scan, whose light already has those shadows in it;
//   - stretch: where the skin passes from one bone to the next and the pose pulls it apart (the
//     armpit with the arms up), the splats grow, so the skin stays closed instead of flaking;
//   - for clothes, a push out of the body: a skirt can't go through a thigh, a sleeve through the side;
//   - for the skin itself, folds at a bent joint: the forearm's skin can't go into the upper arm,
//     nor the calf into the thigh, so a bent elbow or knee creases instead of passing through itself;
//   - twist spread along a limb: as the hand turns, the forearm's skin turns with it, most at the
//     wrist and nothing at the elbow (the radius rolls over the ulna), and the skin of the upper arm
//     and the thigh lags a little behind the bone near the shoulder and the hip.
// The body is a set of capsules (one per limb, two side by side for each part of the trunk), sized
// from the rig's surface maps. Design: docs/flesh.md.
import { q, v3 } from "./pose.js";

// ---------------------------------------------------------------- parts of the body
export const PARTS = ["trunk", "head", "arm_l", "forearm_l", "hand_l", "arm_r", "forearm_r", "hand_r",
                      "thigh_l", "shin_l", "foot_l", "thigh_r", "shin_r", "foot_r"];
const BONE_PART = { pelvis: "trunk", spine: "trunk", chest: "trunk", neck: "trunk", head: "head" };
for (const s of ["l", "r"]) {
  Object.assign(BONE_PART, { ["clavicle_" + s]: "trunk", ["shoulder_" + s]: "arm_" + s, ["elbow_" + s]: "forearm_" + s,
                             ["wrist_" + s]: "hand_" + s, ["hip_" + s]: "thigh_" + s, ["knee_" + s]: "shin_" + s,
                             ["ankle_" + s]: "foot_" + s });
}
// the part each bone belongs to, by bone index (-1: none)
export function boneParts(rig) {
  return Int8Array.from(rig.joints.map((j) => PARTS.indexOf(BONE_PART[j.name] ?? "")));
}

// the part a splat belongs to: its heaviest bone's
export function partsOf(bones, weights, n, parts) {
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let m = 1; m < 4; m++) if (weights[i * 4 + m] > weights[i * 4 + best]) best = m;
    out[i] = parts[bones[i * 4 + best]] ?? -1;
  }
  return out;
}

// a limb's typical radius: the median of its surface map along the middle of the bone
export function thickness(map, name, from = 0.2, to = 0.8) {
  const m = map.maps[name];
  if (!m) return 0;
  const rs = [];
  for (let t = from; t <= to + 1e-9; t += 0.1) for (let a = 0; a < 16; a++) {
    const r = map.radius(name, t * m.length, a / 16 * 2 * Math.PI);
    if (!Number.isNaN(r)) rs.push(r);
  }
  rs.sort((x, y) => x - y);
  return rs.length ? rs[rs.length >> 1] : 0;
}

// the body's radius around a bone's axis in direction d (median along the middle of the bone)
function reachToward(map, name, d) {
  const m = map.maps[name], rs = [];
  const theta = Math.atan2(v3.dot(d, m.e1), v3.dot(d, m.e0));
  for (let t = 0.2; t <= 0.8 + 1e-9; t += 0.1) {
    const r = map.radius(name, t * m.length, theta);
    if (!Number.isNaN(r)) rs.push(r);
  }
  rs.sort((x, y) => x - y);
  return rs.length ? rs[rs.length >> 1] : NaN;
}

// ---------------------------------------------------------------- the body as capsules
export const MAX_CAPSULES = 24;

// Capsules at rest: { bone, a, b, r, part }. A limb is one capsule along its bone. The trunk is
// wider than deep, so each of its bones (pelvis, spine, chest) gets two capsules side by side, as
// deep as the trunk is and together as wide; the head is one.
export function bodyCapsules(rig, map) {
  const names = rig.joints.map((j) => j.name), pos = rig.joints.map((j) => j.pos);
  const parts = boneParts(rig), primary = (j) => {
    const want = { pelvis: "spine", chest: "neck" }[names[j]];
    if (want) return names.indexOf(want);
    return rig.joints.findIndex((k) => k.parent === j);
  };
  const out = [], L = rig.frame.left, F = rig.frame.front;
  const add = (bone, a, b, r) => { if (r > 0) out.push({ bone, a, b, r, part: parts[bone] }); };
  for (let j = 0; j < names.length; j++) {
    const c = primary(j);
    if (c < 0 || parts[j] < 0 || !map.maps[names[j]] || names[j].startsWith("clavicle")) continue;
    const a = pos[j], b = pos[c];
    if (PARTS[parts[j]] === "trunk" && names[j] !== "neck") {
      const half = (d) => 0.5 * (reachToward(map, names[j], d) + reachToward(map, names[j], v3.scale(d, -1)));
      const W = half(L), D = half(F);
      if (!(W > 0) || !(D > 0)) continue;
      const side = Math.max(0, W - D);
      if (side < 0.1 * D) { add(j, a, b, Math.max(W, D)); continue; }
      for (const s of [1, -1]) add(j, v3.add(a, v3.scale(L, s * side)), v3.add(b, v3.scale(L, s * side)), D);
    } else {
      add(j, a, b, thickness(map, names[j]));
    }
  }
  return out.slice(0, MAX_CAPSULES);
}

// The capsules where the pose puts them: per capsule two vec4s, (a, r) and (b, part), in the
// PLY's coordinates (what the GPU step takes). transforms: Skeleton.transforms().
export function posedCapsules(caps, transforms, out = new Float32Array(MAX_CAPSULES * 8)) {
  out.fill(0);
  caps.forEach((c, i) => {
    const T = transforms[c.bone], a = v3.add(q.rot(T.q, c.a), T.t), b = v3.add(q.rot(T.q, c.b), T.t);
    out.set([a[0], a[1], a[2], c.r, b[0], b[1], b[2], c.part], i * 8);
  });
  return out;
}

// distance from p to the segment ab, and the point of the segment nearest p
function toSegment(p, C, i) {
  const ax = C[i], ay = C[i + 1], az = C[i + 2], bx = C[i + 4], by = C[i + 5], bz = C[i + 6];
  const ex = bx - ax, ey = by - ay, ez = bz - az, px = p[0] - ax, py = p[1] - ay, pz = p[2] - az;
  const t = Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / (ex * ex + ey * ey + ez * ez || 1e-12)));
  const dx = px - t * ex, dy = py - t * ey, dz = pz - t * ez;
  return [Math.hypot(dx, dy, dz), dx, dy, dz];
}

// ---------------------------------------------------------------- contact shading
// How much other parts of the body crowd the skin at p: per capsule of another part, (1 - d/reach)²
// where d is how far p is outside it (reach: fractions of the height, ~6 cm), capped.
export const SHADE = { reach: 0.035, depth: 0.32, cap: 1.5 };
export function occlusion(p, part, C, n, H, reach = SHADE.reach) {
  let o = 0;
  for (let k = 0; k < n; k++) {
    const i = k * 8;
    if (C[i + 7] === part) continue;
    const d = toSegment(p, C, i)[0] - C[i + 3];
    const f = Math.max(0, Math.min(1, 1 - d / (reach * H)));
    o += f * f;
  }
  return Math.min(o, SHADE.cap);
}
// the colour factor for skin with occlusion `now`, which had `rest` in the scan
export function shade(now, rest, depth = SHADE.depth) {
  return Math.max(1 - depth, Math.min(1 + 0.5 * depth, 1 - depth * (now - rest)));
}

// ---------------------------------------------------------------- clothes out of the body
// How deep a point of clothing is inside the capsules of parts other than its own (the deepest,
// beyond `margin`), and where it is pushed to so that it is no deeper than it was in the scan's
// pose (`rest`): clothes fitted to the scan may already sit a little inside the capsules.
// (only: a bitmask of the parts to keep out of; null: every part but its own)
export const COLLIDE = { margin: 0.004 };
const skip = (C, i, part, only) => C[i + 7] === part || (only !== null && !((only >> C[i + 7]) & 1));
export function penetration(p, part, C, n, H, margin = COLLIDE.margin, only = null) {
  let worst = -Infinity;
  for (let k = 0; k < n; k++) {
    const i = k * 8;
    if (skip(C, i, part, only)) continue;
    worst = Math.max(worst, C[i + 3] + margin * H - toSegment(p, C, i)[0]);
  }
  return worst;
}
export function pushOut(p, part, C, n, H, rest, margin = COLLIDE.margin, only = null) {
  let x = p.slice();
  for (let k = 0; k < n; k++) {
    const i = k * 8;
    if (skip(C, i, part, only)) continue;
    const [d, dx, dy, dz] = toSegment(x, C, i);
    const extra = C[i + 3] + margin * H - d - Math.max(0, rest);
    if (extra > 0 && d > 1e-9) x = [x[0] + dx / d * extra, x[1] + dy / d * extra, x[2] + dz / d * extra];
  }
  return x;
}

// ---------------------------------------------------------------- skin folds at a bent joint
// Skin is kept out of the capsule of the part across the joint from it, as clothes are kept out of
// the body (pushOut), but only of that one neighbour: the forearm's skin out of the upper arm, the
// calf out of the thigh, the thigh out of the trunk (and back). A bent elbow or knee then creases
// where the two meet instead of one part sinking through the other. No deeper than at rest: a
// relaxed arm in the scan may already overlap the forearm's capsule a little.
export const FOLD = { margin: 0.002, pairs: [["arm", "forearm"], ["thigh", "shin"], ["trunk", "thigh"]] };
// per part, the bitmask of parts it folds against
export function foldNeighbours() {
  const out = new Int32Array(PARTS.length);
  const of = (name, s) => PARTS.indexOf(name === "trunk" ? name : name + "_" + s);
  for (const s of ["l", "r"]) for (const [a, b] of FOLD.pairs) {
    const i = of(a, s), j = of(b, s);
    if (i < 0 || j < 0) continue;
    out[i] |= 1 << j; out[j] |= 1 << i;
  }
  return out;
}

// ---------------------------------------------------------------- twist along a limb
// A limb doesn't turn at one joint only. Turning the hand (pronation, supination) rolls the radius
// over the ulna: the forearm's skin turns with it, nearly all the way at the wrist and not at all at
// the elbow, where skinning alone leaves the whole forearm with the elbow and turns only the hand. The
// upper arm and the thigh turn as one bone, but the skin near the shoulder and the hip stays a
// little behind, held by the trunk. Per splat: which limb (TWIST.limbs) and how much of its joint's
// twist it takes on top of its skinning (negative: it lags behind the bone); per frame, each limb's
// pivot, axis and twist (twistState). Splats turn about the limb's axis, with their own orientation.
export const TWIST = { lag: 0.35, reach: 0.45, limbs: [] };
for (const s of ["l", "r"]) {
  TWIST.limbs.push({ part: "forearm_" + s, joint: "elbow_" + s, end: "wrist_" + s, driver: "wrist_" + s, spread: true },
                   { part: "arm_" + s, joint: "shoulder_" + s, end: "elbow_" + s, driver: "shoulder_" + s, spread: false },
                   { part: "thigh_" + s, joint: "hip_" + s, end: "knee_" + s, driver: "hip_" + s, spread: false });
}
export const MAX_TWISTS = TWIST.limbs.length;

// per splat (points at rest, with its bones, weights and part): [fraction, limb] into out (4 per
// splat, as the GPU layer takes them: x the fraction, y the limb or -1)
export function twistFractions(rig, points, bones, weights, parts, n, out = new Float32Array(n * 4)) {
  const names = rig.joints.map((j) => j.name), idx = (nm) => names.indexOf(nm);
  const limbs = new Map();
  TWIST.limbs.forEach((L, k) => {
    const a = idx(L.joint), b = idx(L.end), part = PARTS.indexOf(L.part);
    if (a < 0 || b < 0 || part < 0) return;
    const pa = rig.joints[a].pos, axis = v3.sub(rig.joints[b].pos, pa);
    limbs.set(part, { k, pa, axis, len2: v3.dot(axis, axis), driver: idx(L.driver), own: a, spread: L.spread });
  });
  const share = (i, b) => {
    let w = 0, s = 0;
    for (let m = 0; m < 4; m++) { s += weights[i * 4 + m]; if (bones[i * 4 + m] === b) w += weights[i * 4 + m]; }
    return s ? w / s : 0;
  };
  for (let i = 0; i < n; i++) {
    out[i * 4] = 0; out[i * 4 + 1] = -1;
    const L = limbs.get(parts[i]);
    if (!L) continue;
    const d = [points[i * 3] - L.pa[0], points[i * 3 + 1] - L.pa[1], points[i * 3 + 2] - L.pa[2]];
    const t = Math.max(0, Math.min(1, v3.dot(d, L.axis) / L.len2));
    // (the share the skinning already gives it: a splat near the wrist is partly the hand's)
    const f = L.spread ? Math.max(0, t - share(i, L.driver)) : -TWIST.lag * (1 - smooth(0, TWIST.reach, t)) * share(i, L.own);
    if (Math.abs(f) > 1e-3) { out[i * 4] = f; out[i * 4 + 1] = L.k; }
  }
  return out;
}

// per limb, two vec4s: (pivot, twist in radians), (axis, 0), in the PLY's coordinates, posed. The
// twist is the turn of the driving joint about the limb's axis (its swing taken out).
export function twistState(sk, out = new Float32Array(MAX_TWISTS * 8)) {
  out.fill(0);
  TWIST.limbs.forEach((L, k) => {
    const j = sk.index(L.joint), e = sk.index(L.end), d = sk.index(L.driver);
    if (j < 0 || e < 0 || d < 0 || !sk.W[d]) return;
    const rel = q.mul(q.conj(sk.parentW(d)), sk.W[d]);
    const a0 = v3.unit(v3.sub(sk.rest[e], sk.rest[j]));
    let ang = 2 * Math.atan2(v3.dot([rel[0], rel[1], rel[2]], a0), rel[3]);
    ang = ((ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    out.set([...sk.P[j], ang, ...q.rot(sk.W[j], a0), 0], k * 8);
  });
  return out;
}

// where a posed point c turns to, taking `frac` of limb k's twist (state: twistState())
export function twistPoint(c, state, k, frac) {
  const o = k * 8, a = state[o + 3] * frac, axis = [state[o + 4], state[o + 5], state[o + 6]];
  const pivot = [state[o], state[o + 1], state[o + 2]];
  return v3.add(pivot, q.rot(q.axisAngle(axis, a), v3.sub(c, pivot)));
}

// ---------------------------------------------------------------- channels: what the pose drives
// Offsets and shading made at rest are scaled by a channel each; channels come from the pose.
export const CHANNELS = ["elbow_l", "elbow_r", "breath", "fist_l_half", "fist_l_full", "fist_r_half", "fist_r_full",
                         "knee_l", "knee_r", "hip_l", "hip_r", "raise_l", "raise_r", "point_l", "point_r", "grip_l", "grip_r"];
export const CH = Object.fromEntries(CHANNELS.map((c, i) => [c, i]));
export const NUM_CHANNELS = 20;
export const SHADE_CHANNEL = 32;      // a channel id from here on darkens (wrinkles) instead of moving
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the channels' levels for the skeleton's pose, breath (0..1, how full the lungs are) and how far
// each hand is closed (0: as in the scan, 1: a fist)
export function channelLevels(sk, { breath = 0, fist = { l: 0, r: 0 } } = {}) {
  const out = new Float32Array(NUM_CHANNELS);
  const ang = (name) => { const j = sk.index(name); return j >= 0 && sk.angles[j] ? sk.angles[j] : null; };
  for (const s of ["l", "r"]) {
    const e = ang("elbow_" + s), k = ang("knee_" + s), h = ang("hip_" + s), sh = ang("shoulder_" + s), an = ang("ankle_" + s);
    if (e) out[CH["elbow_" + s]] = smooth(20, 130, e.flex);
    if (k) out[CH["knee_" + s]] = smooth(25, 120, k.flex);
    if (h) out[CH["hip_" + s]] = smooth(30, 100, h.flex);
    // the arm raised (forward or out: the deltoid works), the toes pointed (the calf works)
    if (sh) out[CH["raise_" + s]] = smooth(30, 150, Math.hypot(sh.flex, sh.side));
    if (an) out[CH["point_" + s]] = smooth(5, 40, -an.flex);
    const f = Math.min(1, Math.max(0, fist[s] || 0));
    out[CH[`fist_${s}_half`]] = Math.min(1, 2 * f);
    out[CH[`fist_${s}_full`]] = Math.max(0, 2 * f - 1);
    out[CH["grip_" + s]] = smooth(0.2, 1, f);
  }
  out[CH.breath] = Math.min(1, Math.max(0, breath));
  return out;
}

// ---------------------------------------------------------------- offsets at rest
// Sizes are fractions of the height (H): a biceps that swells 1.5 cm on someone 1.75 m tall, a
// breath that lifts the chest 6 mm; the deltoid with the arm raised, the forearm with a fist and
// the calf with the toes pointed, 6 to 9 mm.
export const BULGE = { biceps: 0.0085, breath: 0.0035, deltoid: 0.004, forearm: 0.0035, calf: 0.005, fistDeg: 250, knuckle: 0.44 };
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

// Per splat, up to two offsets at rest with the channel that drives each: slots A and B, each
// (x, y, z, channel), -1 when unused. Points: rest positions; part: each one's part. Hands: from
// handFrames(). The same function serves the body's splats, the ink on them and the clothes over
// them, so they move together.
export function restOffsets(rig, points, parts, hands, n = points.length / 3) {
  const names = rig.joints.map((j) => j.name), at = (nm) => rig.joints[names.indexOf(nm)]?.pos;
  const H = rig.height, F = rig.frame.front, U = rig.frame.up;
  const A = new Float32Array(n * 4).fill(-1), B = new Float32Array(n * 4).fill(-1);
  const put = (i, off, ch) => {
    // the bigger two offsets win
    const la = A[i * 4 + 3] < 0 ? -1 : Math.hypot(A[i * 4], A[i * 4 + 1], A[i * 4 + 2]);
    const lb = B[i * 4 + 3] < 0 ? -1 : Math.hypot(B[i * 4], B[i * 4 + 1], B[i * 4 + 2]);
    const l = v3.len(off);
    if (la < 0) A.set([off[0], off[1], off[2], ch], i * 4);
    else if (lb < 0) B.set([off[0], off[1], off[2], ch], i * 4);
    else if (l > Math.min(la, lb)) (la < lb ? A : B).set([off[0], off[1], off[2], ch], i * 4);
  };
  const arm = {}, fore = {}, shin = {}, trunk = { lo: at("spine"), hi: at("neck") }, mid = at("chest") || at("spine");
  for (const s of ["l", "r"]) {
    const sh = at("shoulder_" + s), el = at("elbow_" + s), wr = at("wrist_" + s), kn = at("knee_" + s), an = at("ankle_" + s);
    if (sh && el) arm[s] = { sh, axis: v3.sub(el, sh) };
    if (el && wr) fore[s] = { sh: el, axis: v3.sub(wr, el) };
    if (kn && an) shin[s] = { sh: kn, axis: v3.sub(an, kn) };
  }
  // (t along a limb from sh, the way out from its axis and how far)
  const across = (L, p) => {
    const len = v3.len(L.axis), u = v3.scale(L.axis, 1 / len), d = v3.sub(p, L.sh);
    const t = v3.dot(d, u) / len, radial = v3.sub(d, v3.scale(u, t * len));
    return { t, u, radial, rl: v3.len(radial) };
  };
  const iFore = { [PARTS.indexOf("forearm_l")]: "l", [PARTS.indexOf("forearm_r")]: "r" };
  const iShin = { [PARTS.indexOf("shin_l")]: "l", [PARTS.indexOf("shin_r")]: "r" };
  const iArm = { [PARTS.indexOf("arm_l")]: "l", [PARTS.indexOf("arm_r")]: "r" };
  const iHand = { [PARTS.indexOf("hand_l")]: "l", [PARTS.indexOf("hand_r")]: "r" };
  const iTrunk = PARTS.indexOf("trunk");
  for (let i = 0; i < n; i++) {
    const p = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]], part = parts[i];
    const s = iArm[part];
    if (s && arm[s]) {
      // the biceps: the front of the upper arm, most at 60% of the way to the elbow
      const { sh, axis } = arm[s], len = v3.len(axis), u = v3.scale(axis, 1 / len), d = v3.sub(p, sh);
      const t = v3.dot(d, u) / len, radial = v3.sub(d, v3.scale(u, t * len)), rl = v3.len(radial);
      const front = v3.unit(v3.sub(F, v3.scale(u, v3.dot(F, u))));
      if (rl > 1e-9) {
        const c = v3.dot(radial, front) / rl, w = bell(t, 0.6, 0.2) * Math.max(0, c) ** 1.5;
        if (w > 0.02) put(i, v3.scale(radial, BULGE.biceps * H * w / rl), CH["elbow_" + s]);
        // the deltoid: the cap of the shoulder, out from the body and over the top, near the joint
        if (mid) {
          const away = v3.unit(v3.sub(v3.sub(sh, mid), v3.scale(u, v3.dot(v3.sub(sh, mid), u))));
          const o = v3.dot(radial, away) / rl, wd = bell(t, 0.12, 0.16) * Math.max(0, o + 0.3) / 1.3;
          if (wd > 0.02) put(i, v3.scale(radial, BULGE.deltoid * H * wd / rl), CH["raise_" + s]);
        }
      }
    } else if (iFore[part] && fore[iFore[part]]) {
      // the forearm's muscles, all round its upper third, with a fist
      const s2 = iFore[part], { t, radial, rl } = across(fore[s2], p), w = bell(t, 0.28, 0.2);
      if (rl > 1e-9 && w > 0.02) put(i, v3.scale(radial, BULGE.forearm * H * w / rl), CH["grip_" + s2]);
    } else if (iShin[part] && shin[iShin[part]]) {
      // the calf, at the back of the shin's upper third, with the toes pointed
      const s2 = iShin[part], { t, u, radial, rl } = across(shin[s2], p);
      const back = v3.unit(v3.sub(v3.scale(F, -1), v3.scale(u, v3.dot(v3.scale(F, -1), u))));
      const w = rl > 1e-9 ? bell(t, 0.3, 0.18) * Math.max(0, v3.dot(radial, back) / rl) ** 1.5 : 0;
      if (w > 0.02) put(i, v3.scale(radial, BULGE.calf * H * w / rl), CH["point_" + s2]);
    } else if (part === iTrunk && trunk.lo && trunk.hi) {
      // a breath: the chest and the belly rise, mostly at the front
      const ax = v3.sub(trunk.hi, trunk.lo), len = v3.len(ax), u = v3.scale(ax, 1 / len), d = v3.sub(p, trunk.lo);
      const t = v3.dot(d, u) / len, radial = v3.sub(d, v3.scale(u, t * len)), rl = v3.len(radial);
      if (rl > 1e-9 && t > -0.15 && t < 0.95) {
        const c = v3.dot(radial, F) / rl, w = (0.35 + 0.65 * Math.max(0, c)) * smooth(-0.15, 0.15, t) * (1 - smooth(0.7, 0.95, t));
        if (w > 0.02) put(i, v3.add(v3.scale(radial, BULGE.breath * H * w / rl), v3.scale(U, 0.3 * BULGE.breath * H * w * Math.max(0, t))), CH.breath);
      }
    }
    const hs = iHand[part], hf = hands && hands[hs];
    if (hs && hf) {
      const half = curl(p, hf, 0.5), full = curl(p, hf, 1);
      if (half) {
        // half a fist on its own channel, the rest of the way on the next (positions along an arc
        // don't scale linearly with the angle)
        A.set([half[0] - p[0], half[1] - p[1], half[2] - p[2], CH[`fist_${hs}_half`]], i * 4);
        B.set([full[0] - half[0], full[1] - half[1], full[2] - half[2], CH[`fist_${hs}_full`]], i * 4);
      }
    }
  }
  return { A, B };
}

// Each hand's frame at rest: the wrist, the way the hand points (to the fingertips), the way the
// palm faces (palm: palmNormals(), or toward the body when the scan's hand isn't clearly flat),
// its length. Fingers bend at the knuckles (BULGE.knuckle of the way to the fingertips) toward
// the palm.
export function handFrames(rig, palms = {}) {
  const names = rig.joints.map((j) => j.name), at = (nm) => rig.joints[names.indexOf(nm)]?.pos;
  const out = {}, mid = at("chest") || at("spine");
  for (const s of ["l", "r"]) {
    const w = at("wrist_" + s), e = at("hand_end_" + s);
    if (!w || !e || !mid) continue;
    const len = v3.len(v3.sub(e, w)), axis = v3.scale(v3.sub(e, w), 1 / len);
    const flat = (v) => v3.unit(v3.sub(v, v3.scale(axis, v3.dot(v, axis))));
    let palm = palms["wrist_" + s] ? flat(palms["wrist_" + s]) : flat(v3.sub(mid, w));
    if (v3.dot(palm, v3.sub(mid, w)) < 0) palm = v3.scale(palm, -1);    // the palm faces the body
    out[s] = { wrist: w, axis, palm, len };
  }
  return out;
}

// Where a point of the hand goes with the fingers curled by f (0..1 of a fist): beyond the
// knuckles, the fingers bend as an arc toward the palm. null for a point before the knuckles.
export function curl(p, hf, f) {
  const d = v3.sub(p, hf.wrist), u = v3.dot(d, hf.axis), k0 = BULGE.knuckle * hf.len, s = u - k0;
  if (s <= 0) return null;
  const theta = f * BULGE.fistDeg * Math.PI / 180;
  if (theta < 1e-6) return p.slice();
  const Lf = hf.len - k0, R = Lf / theta, h = Math.min(v3.dot(d, hf.palm), 0.8 * R);
  const rest = v3.sub(d, v3.add(v3.scale(hf.axis, u), v3.scale(hf.palm, v3.dot(d, hf.palm))));
  const phi = s / R, rho = R - h;
  return v3.add(hf.wrist, v3.add(rest, v3.add(v3.scale(hf.axis, k0 + rho * Math.sin(phi)), v3.scale(hf.palm, R - rho * Math.cos(phi)))));
}

// Wrinkles: cloth gathers on the inside of a bent elbow, knee or hip. For clothing at rest
// points p with parts: a pattern across the bone (rings about 2.5 cm apart, darkest on the side
// the joint bends to), as a shading slot (SHADE_CHANNEL + channel).
export function wrinkles(rig, points, parts, n = points.length / 3) {
  const names = rig.joints.map((j) => j.name), at = (nm) => rig.joints[names.indexOf(nm)]?.pos;
  const H = rig.height, F = rig.frame.front, out = new Float32Array(n * 4).fill(-1);
  const joints = [];
  for (const s of ["l", "r"]) {
    for (const [j, a, b, bend, parts2] of [["elbow", "shoulder", "wrist", F, ["arm", "forearm"]],
                                           ["knee", "hip", "ankle", v3.scale(F, -1), ["thigh", "shin"]],
                                           ["hip", "pelvis", "knee", F, ["trunk", "thigh"]]]) {
      const c = at(j + "_" + s), pa = at(a === "pelvis" ? a : a + "_" + s), pb = at(b + "_" + s);
      if (!c || !pa || !pb) continue;
      const axis = v3.unit(v3.sub(pb, pa));
      joints.push({ c, axis, bend: v3.unit(v3.sub(bend, v3.scale(axis, v3.dot(bend, axis)))), ch: CH[j + "_" + s],
                    parts: parts2.map((p) => PARTS.indexOf(p === "trunk" ? p : p + "_" + s)) });
    }
  }
  const ring = 0.014 * H, span = 0.05 * H;
  for (let i = 0; i < n; i++) {
    const p = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
    for (const J of joints) {
      if (!J.parts.includes(parts[i])) continue;
      const d = v3.sub(p, J.c), along = v3.dot(d, J.axis);
      if (Math.abs(along) > span) continue;
      const radial = v3.sub(d, v3.scale(J.axis, along)), rl = v3.len(radial);
      if (rl < 1e-9) continue;
      const side = Math.max(0, v3.dot(radial, J.bend) / rl);
      const w = side * (1 - Math.abs(along) / span) * (0.5 + 0.5 * Math.cos(2 * Math.PI * along / ring));
      if (w > 0.03) { out.set([0.35 * w, 0, 0, SHADE_CHANNEL + J.ch], i * 4); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- stretch
// Where skin passes from bone b1 to bone b2 (b2's share w changing along the skin), a pose that
// moves the two bones apart stretches it: along the direction w changes fastest (g, its
// gradient), the skin's length grows by |R ĝ + (T2 p - T1 p) |g||. Per splat: g and the two bones,
// from the weights of the splats around it. Splats with one bone (or the same weight all around)
// get g = 0.
// A body of a few hundred thousand splats has hundreds within `radius` of each: the fit is made
// over every `stride`th of them (about as many as an 80,000-splat body has), which gives the same
// gradient at a fraction of the time (12 s to 2 s for 400,000 splats).
export const GRADIENT_SPLATS = 80000;
export function weightGradients(centres, bones, weights, n, radius) {
  // (a cell's key is exact, one number, for cells within a kilometre or so)
  const cell = radius, key = (x, y, z) => ((x + 65536) * 131072 + (y + 65536)) * 131072 + (z + 65536), grid = new Map();
  const stride = Math.max(1, Math.round(n / GRADIENT_SPLATS));
  const near = new Map();
  for (let i = 0; i < n; i += stride) {
    const k = key(Math.floor(centres[i * 3] / cell), Math.floor(centres[i * 3 + 1] / cell), Math.floor(centres[i * 3 + 2] / cell));
    (grid.get(k) || grid.set(k, []).get(k)).push(i);
  }
  const out = new Float32Array(n * 4).fill(-1), share = (j, b) => {
    let w = 0, s = 0;
    for (let m = 0; m < 4; m++) { s += weights[j * 4 + m]; if (bones[j * 4 + m] === b) w += weights[j * 4 + m]; }
    return s ? w / s : 0;
  };
  for (let i = 0; i < n; i++) {
    // its two heaviest bones
    let m1 = 0;
    for (let m = 1; m < 4; m++) if (weights[i * 4 + m] > weights[i * 4 + m1]) m1 = m;
    let m2 = -1;
    for (let m = 0; m < 4; m++) if (m !== m1 && weights[i * 4 + m] > 0 && (m2 < 0 || weights[i * 4 + m] > weights[i * 4 + m2])) m2 = m;
    if (m2 < 0 || weights[i * 4 + m2] < 3) continue;
    const b1 = bones[i * 4 + m1], b2 = bones[i * 4 + m2];
    // least squares of w (b2's share) over the splats within `radius`: w ≈ w0 + g·(x - p)
    const x = centres[i * 3], y = centres[i * 3 + 1], z = centres[i * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let n0 = 0, sw = 0;
    const S = [0, 0, 0, 0, 0, 0], sx = [0, 0, 0], sxw = [0, 0, 0], own = key(cx, cy, cz);
    let cells = near.get(own);                 // (the 27 cells round this one, found once per cell)
    if (!cells) {
      cells = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(key(cx + dx, cy + dy, cz + dz));
        if (list) cells.push(list);
      }
      near.set(own, cells);
    }
    for (const list of cells) {
      for (const j of list) {
        const ox = centres[j * 3] - x, oy = centres[j * 3 + 1] - y, oz = centres[j * 3 + 2] - z;
        if (ox * ox + oy * oy + oz * oz > radius * radius) continue;
        const w = share(j, b2);
        n0++; sw += w;
        sx[0] += ox; sx[1] += oy; sx[2] += oz;
        sxw[0] += ox * w; sxw[1] += oy * w; sxw[2] += oz * w;
        S[0] += ox * ox; S[1] += ox * oy; S[2] += ox * oz; S[3] += oy * oy; S[4] += oy * oz; S[5] += oz * oz;
      }
    }
    if (n0 < 8) continue;
    // centred covariance and cross-covariance, then solve C g = c (a little ridge for flat patches)
    const m = sx.map((v) => v / n0), mw = sw / n0;
    const C = [S[0] / n0 - m[0] * m[0], S[1] / n0 - m[0] * m[1], S[2] / n0 - m[0] * m[2], S[3] / n0 - m[1] * m[1],
               S[4] / n0 - m[1] * m[2], S[5] / n0 - m[2] * m[2]];
    const ridge = 0.05 * (C[0] + C[3] + C[5]) / 3;
    const a = C[0] + ridge, b = C[1], c = C[2], d = C[3] + ridge, e = C[4], f = C[5] + ridge;
    const r = [sxw[0] / n0 - m[0] * mw, sxw[1] / n0 - m[1] * mw, sxw[2] / n0 - m[2] * mw];
    const det = a * (d * f - e * e) - b * (b * f - e * c) + c * (b * e - d * c);
    if (Math.abs(det) < 1e-30) continue;
    const inv = [(d * f - e * e) / det, (c * e - b * f) / det, (b * e - c * d) / det, (a * f - c * c) / det,
                 (b * c - a * e) / det, (a * d - b * b) / det];
    const g = [inv[0] * r[0] + inv[1] * r[1] + inv[2] * r[2], inv[1] * r[0] + inv[3] * r[1] + inv[4] * r[2],
               inv[2] * r[0] + inv[4] * r[1] + inv[5] * r[2]];
    out.set([g[0], g[1], g[2], b1 * 256 + b2], i * 4);
  }
  return out;
}

export const STRETCH = { max: 3, power: 0.75 };

// ---------------------------------------------------------------- a field over the fitted skin
// Values given at the fitted base mesh's skin vertices (verts, PLY coordinates; vals, `width`
// numbers per vertex), at any point near the skin: the inverse-distance blend of the nearest few
// within `reach` (0 where none is).
export class SkinField {
  constructor(verts, reach) {
    this.V = verts; this.reach = reach; this.grid = new Map();
    for (let i = 0; i < verts.length / 3; i++) {
      const k = this._key(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
      (this.grid.get(k) || this.grid.set(k, []).get(k)).push(i);
    }
  }
  _key(x, y, z, dx = 0, dy = 0, dz = 0) {
    const r = this.reach;
    return ((Math.floor(x / r) + dx) * 73856093) ^ ((Math.floor(y / r) + dy) * 19349663) ^ ((Math.floor(z / r) + dz) * 83492791);
  }
  // the K nearest vertices: [index, weight] with weights adding to 1
  near(x, y, z, K = 4) {
    const V = this.V, best = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const i of this.grid.get(this._key(x, y, z, dx, dy, dz)) || []) {
        const d = Math.hypot(V[i * 3] - x, V[i * 3 + 1] - y, V[i * 3 + 2] - z);
        if (d > this.reach) continue;
        if (best.length < K) best.push([i, d]);
        else if (d < best[K - 1][1]) best[K - 1] = [i, d];
        else continue;
        best.sort((a, b) => a[1] - b[1]);
      }
    }
    if (!best.length) return [];
    const ws = best.map(([, d]) => 1 / (d + 0.05 * this.reach)), s = ws.reduce((a, b) => a + b, 0);
    return best.map(([i], k) => [i, ws[k] / s]);
  }
  at(x, y, z, vals, width, out) {
    out.fill(0);
    for (const [i, w] of this.near(x, y, z)) for (let k = 0; k < width; k++) out[k] += w * vals[i * width + k];
    return out;
  }
}

// The "what if" sliders' offsets for points near the skin (the body's splats, ink, clothes): the
// moves of the nearest skin vertices (field: a SkinField over them; moves: 3 numbers per vertex),
// into a layer's x, y, z (layer 0: weight, layer 1: muscle). Points with no skin near keep 0.
export function shapeOffsets(layer, field, moves, points, n) {
  const o = new Float64Array(3);
  for (let i = 0; i < n; i++) {
    field.at(points[i * 3], points[i * 3 + 1], points[i * 3 + 2], moves, 3, o);
    layer[i * 4] = o[0]; layer[i * 4 + 1] = o[1]; layer[i * 4 + 2] = o[2];
  }
}
// kilograms the body gains at the sliders (shape: [weight, muscle]), from the volume each adds
// (fit.py, fractions of the height cubed), the person heightCm tall, at the body's density
export const DENSITY = 1010;          // kg/m³
export function shapeKg(volumes, shape, heightCm) {
  const m3 = (heightCm / 100) ** 3;
  return DENSITY * m3 * ((volumes.weight || 0) * shape[0] + (volumes.muscle || 0) * shape[1]);
}

// ---------------------------------------------------------------- the data a mesh's splats take
// Fills the six layers the GPU step reads (each 4 floats per splat; fleshgpu.js):
//   0: weight slider offset (x, y, z), part      1: muscle slider offset, contact at rest
//   2: slot A (offset, channel)                  3: slot B (offset, channel, or a wrinkle's shading)
//   4: stretch (g, b1 * 256 + b2) for the body, or (0, 0, 0, depth at rest) for clothes
//   5: twist (fraction, limb), how deep the skin is at rest in the part across its joint (fold), 0
// points: rest positions; bones, weights: the splats' skin; caps: bodyCapsules() (at rest);
// opts.hands: handFrames(); opts.stretch: weight gradients (weightGradients()); opts.cloth: true
// for clothing (wrinkles, depth in the body at rest); opts.fold: true for the body's skin.
export function fillLayers(layers, rig, caps, points, bones, weights, n, opts = {}) {
  const H = rig.height, parts = partsOf(bones, weights, n, boneParts(rig));
  const rest = posedCapsules(caps, rig.joints.map(() => ({ q: [0, 0, 0, 1], t: [0, 0, 0] })));
  const nc = caps.length, p = [0, 0, 0], folds = foldNeighbours();
  for (let i = 0; i < n; i++) {
    p[0] = points[i * 3]; p[1] = points[i * 3 + 1]; p[2] = points[i * 3 + 2];
    layers[0][i * 4 + 3] = parts[i];
    layers[1][i * 4 + 3] = occlusion(p, parts[i], rest, nc, H);
    if (opts.cloth) layers[4][i * 4 + 3] = Math.max(0, penetration(p, parts[i], rest, nc, H));
    if (opts.fold && parts[i] >= 0) layers[5][i * 4 + 2] = Math.max(0, penetration(p, parts[i], rest, nc, H, FOLD.margin, folds[parts[i]]));
  }
  twistFractions(rig, points, bones, weights, parts, n, layers[5]);
  const { A, B } = restOffsets(rig, points, parts, opts.hands, n);
  layers[2].set(A.subarray(0, n * 4));
  layers[3].set(B.subarray(0, n * 4));
  if (opts.cloth) {
    // wrinkles where a slot B is free
    const W = wrinkles(rig, points, parts, n);
    for (let i = 0; i < n; i++) if (layers[3][i * 4 + 3] < 0 && W[i * 4 + 3] >= 0) layers[3].set(W.subarray(i * 4, i * 4 + 4), i * 4);
  }
  if (opts.stretch) layers[4].set(opts.stretch.subarray(0, n * 4));
  return parts;
}

// Copies of splat data: what ink takes from the skin splat it lies on (`from` per ink splat)
export function copyLayers(dst, src, from, n, which = [0, 1, 2, 3, 5]) {
  for (const k of which) for (let i = 0; i < n; i++) {
    const j = from[i];
    if (j >= 0) dst[k].set(src[k].subarray(j * 4, j * 4 + 4), i * 4);
  }
}

// ---------------------------------------------------------------- the shadow on the floor
// Soft discs on the floor under the body, for a light from straight above with a wide soft edge
// (an overcast sky, a room's ceiling): each capsule leaves discs along its length, bigger and
// fainter the higher it is, and darkest where it touches the floor (the feet). caps: in world
// coordinates with y up (the page's scene), as posedCapsules lays them out; floor: the floor's y.
// Returns [x, z, radius, darkness] per disc.
export const SHADOW = { steps: 4, spread: 0.25, fade: 0.22, dark: 0.45, touch: 1.2, contact: 0.02 };
export function shadowBlobs(caps, n, floor, H) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const i = k * 8, r = caps[i + 3];
    for (let s = 0; s <= SHADOW.steps; s++) {
      const t = s / SHADOW.steps;
      const x = caps[i] + t * (caps[i + 4] - caps[i]), y = caps[i + 1] + t * (caps[i + 5] - caps[i + 1]), z = caps[i + 2] + t * (caps[i + 6] - caps[i + 2]);
      const h = Math.max(0, y - r - floor);
      const touch = Math.exp(-h / (SHADOW.contact * H));
      out.push([x, z, r * (1 + 0.3 * touch) + SHADOW.spread * h, (SHADOW.dark * Math.exp(-h / (SHADOW.fade * H)) + SHADOW.touch * touch) * 2 / (SHADOW.steps + 1)]);
    }
  }
  return out;
}

// how dark the shadow is at (x, z) on the floor, 0..1: the sum ground.js's shader makes
export function darknessAt(blobs, x, z, stretch = [1, 1]) {
  let s = 0;
  for (const [bx, bz, r, a] of blobs) {
    const dx = (x - bx) / stretch[0], dz = (z - bz) / stretch[1];
    s += a * Math.exp(-2.5 * (dx * dx + dz * dz) / Math.max(r, 1e-5) ** 2);
  }
  return 1 - Math.exp(-s);
}

// ---------------------------------------------------------------- loose clothes and hair swing
// What hangs off the body (a skirt's hem, a ponytail, hair over the shoulders) lags behind as the
// body moves and swings back, as a pendulum hung from an anchor (the hips for clothes, the head for
// hair). Each splat of an item takes the swing in proportion to how loose it is, from nothing where
// the item lies on the skin to all of it this far off it (looseness()). The push out of the body
// (above) then keeps a swinging skirt out of the legs.
// - Cloth doesn't stretch: across the floor it swings slowly (hz, damping as a fraction of
//   critical, air and the body's own friction), but up and down it barely gives (vert), and it
//   rises a little as it swings out (a pendulum's arc).
// - It turns behind the body too: when the hips or the head turn, the hem or the hair catches up
//   a moment later (twist, in radians, about the anchor's up).
// - It answers how the body moves over a few frames, not frame to frame: the anchor is followed
//   by a critically damped filter at `smooth` Hz first, so a jolt of a step doesn't kick it.
// - It eases into its limits (max of the height, twist.max radians) rather than stopping dead.
// - Splats within `near` of the height of each other swing alike (smoothOver).
export const SWING = {
  hips: { hz: 0.95, damping: 0.4, vert: { hz: 5, damping: 1 }, twist: { hz: 1.1, damping: 0.55, max: 0.3 }, max: 0.025 },
  head: { hz: 1.25, damping: 0.38, vert: { hz: 5, damping: 1 }, twist: { hz: 1.4, damping: 0.5, max: 0.25 }, max: 0.025 },
  smooth: 1.5, jump: 0.15, loose: [0.006, 0.03], near: 0.02,
};
const G = 9.81 / 1.7;                    // gravity, in heights a second squared

const springOf = (hz, damping) => { const k = (2 * Math.PI * hz) ** 2; return [k, 2 * damping * Math.sqrt(k)]; };
const soft = (x, max) => max * Math.tanh(x / max);

export class Swing {
  // H: the person's height; spring: SWING.hips or SWING.head; up: the body's up (rig.frame.up),
  // front: its front (for the turn)
  constructor(H, spring, up = [0, 1, 0], front = [0, 0, 1]) {
    this.H = H; this.o = spring;
    const u = Math.hypot(...up); this.up = up.map((x) => x / u);
    const fu = front[0] * this.up[0] + front[1] * this.up[1] + front[2] * this.up[2];
    const f = front.map((x, a) => x - fu * this.up[a]), fl = Math.hypot(...f) || 1;
    this.front = f.map((x) => x / fl);
    this.side = [this.up[1] * this.front[2] - this.up[2] * this.front[1], this.up[2] * this.front[0] - this.up[0] * this.front[2], this.up[0] * this.front[1] - this.up[1] * this.front[0]];
    [this.kh, this.ch] = springOf(spring.hz, spring.damping);
    [this.kv, this.cv] = springOf(spring.vert.hz, spring.vert.damping);
    [this.kt, this.ct] = springOf(spring.twist.hz, spring.twist.damping);
    [this.ks, this.cs] = springOf(SWING.smooth, 1);
    this.L = G / (2 * Math.PI * spring.hz) ** 2;      // the pendulum's length, in heights
    this.reset();
  }

  // the way the anchor faces about up (radians), from its rotation q (null: no turn)
  _heading(q) {
    if (!q) return this.yaw ?? 0;
    const [x, y, z, w] = q, v = this.front;
    // q applied to front (q v q*)
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    const r = [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
    const a = Math.atan2(r[0] * this.side[0] + r[1] * this.side[1] + r[2] * this.side[2], r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
    if (this.yaw === null) return a;
    return this.yaw + ((a - this.yaw + 3 * Math.PI) % (2 * Math.PI) - Math.PI);   // unwrapped
  }

  // The anchor is at p now (and turned by the quaternion q), dt seconds after the last call:
  // [x, y, z, turn], the offset of what hangs from it (in p's units) and how far it turns about up
  // behind the anchor (radians). this.at is the anchor to turn about.
  update(dt, p, q = null) {
    const H = this.H, yaw = this._heading(q);
    if (!this.f || Math.hypot(p[0] - this.p[0], p[1] - this.p[1], p[2] - this.p[2]) > SWING.jump * H) {
      // the first frame, or the body put somewhere else (R): it hangs still there
      const keep = !!this.f;
      this.f = [...p]; this.fv = [0, 0, 0]; this.p = [...p]; this.yaw = yaw; this.fy = yaw; this.fyv = 0;
      if (!keep) { this.y = [0, 0, 0]; this.v = [0, 0, 0]; this.tw = 0; this.twv = 0; }
    }
    this.at = [...p];
    if (dt > 0) {
      dt = Math.min(dt, 0.1);
      const steps = Math.ceil(dt / 0.004), h = dt / steps, up = this.up;
      for (let s = 0; s < steps; s++) {
        const t = (s + 1) / steps;
        // the anchor, followed smoothly: its acceleration drives the swing
        const acc = [0, 0, 0];
        for (let a = 0; a < 3; a++) {
          const pa = this.p[a] + t * (p[a] - this.p[a]);
          acc[a] = this.ks * (pa - this.f[a]) - this.cs * this.fv[a];
          this.fv[a] += h * acc[a]; this.f[a] += h * this.fv[a];
        }
        const ya = this.yaw + t * (yaw - this.yaw), yacc = this.ks * (ya - this.fy) - this.cs * this.fyv;
        this.fyv += h * yacc; this.fy += h * this.fyv;
        // the offset (y, in heights): a slow pendulum across, stiff up and down
        const au = (acc[0] * up[0] + acc[1] * up[1] + acc[2] * up[2]) / H, ou = this.y[0] * up[0] + this.y[1] * up[1] + this.y[2] * up[2];
        const vu = this.v[0] * up[0] + this.v[1] * up[1] + this.v[2] * up[2];
        for (let a = 0; a < 3; a++) {
          const ah = acc[a] / H - au * up[a], oh = this.y[a] - ou * up[a], vh = this.v[a] - vu * up[a];
          const fh = -this.kh * oh - this.ch * vh - ah, fv = -this.kv * ou - this.cv * vu - au;
          this.v[a] += h * (fh + fv * up[a]);
        }
        for (let a = 0; a < 3; a++) this.y[a] += h * this.v[a];
        this.twv += h * (-this.kt * this.tw - this.ct * this.twv - yacc);
        this.tw += h * this.twv;
      }
      this.p = [...p]; this.yaw = yaw;
      // kept within a few times its limits, however hard it was thrown
      const m = 3 * this.o.max, len = Math.hypot(...this.y);
      if (len > m) for (let a = 0; a < 3; a++) { this.y[a] *= m / len; this.v[a] *= m / len; }
      const tm = 3 * this.o.twist.max;
      if (Math.abs(this.tw) > tm) { this.tw = Math.sign(this.tw) * tm; this.twv = 0; }
    }
    return this.offset();
  }

  // what update() last gave
  offset() {
    const up = this.up, H = this.H, ou = this.y[0] * up[0] + this.y[1] * up[1] + this.y[2] * up[2];
    const hz = this.y.map((x, a) => x - ou * up[a]), hl = Math.hypot(...hz), max = this.o.max;
    const sh = hl > 1e-12 ? soft(hl, max) / hl : 1, rise = (soft(hl, max) ** 2) / (2 * this.L);
    const vert = soft(ou, 0.25 * max) + rise;
    return [0, 1, 2].map((a) => H * (hz[a] * sh + vert * up[a])).concat(soft(this.tw, this.o.twist.max));
  }

  // whether it still moves (or isn't back at rest yet)
  moving() {
    return Math.hypot(...this.y) > 1e-4 || Math.hypot(...this.v) > 1e-3 || Math.abs(this.tw) > 1e-3 || Math.abs(this.twv) > 1e-2 ||
      (this.f && Math.hypot(...this.fv) > 1e-3 * this.H);
  }

  reset() { this.f = null; this.y = [0, 0, 0]; this.v = [0, 0, 0]; this.tw = 0; this.twv = 0; this.yaw = null; this.at = null; }
}

// where a splat at c (taking `loose` of the swing, looseness()) goes: turned by the swing's turn
// about its up through its anchor, then carried by its offset (fleshgpu.js does the same)
export function swingPoint(c, { o, at, up }, loose) {
  const a = (o[3] || 0) * loose, cs = Math.cos(a), sn = Math.sin(a), r = [c[0] - at[0], c[1] - at[1], c[2] - at[2]];
  const d = up[0] * r[0] + up[1] * r[1] + up[2] * r[2];
  const x = [up[1] * r[2] - up[2] * r[1], up[2] * r[0] - up[0] * r[2], up[0] * r[1] - up[1] * r[0]];
  return [0, 1, 2].map((k) => at[k] + r[k] * cs + x[k] * sn + up[k] * d * (1 - cs) + o[k] * loose);
}

// how much of the swing a splat this far (gap) from the skin takes, 0..1
export function looseness(gap, H) {
  const [a, b] = SWING.loose, t = Math.min(1, Math.max(0, (gap / H - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Splats of one item side by side must swing alike, or the cloth tears into lace as it moves
// (the splats of a layered hem are at different gaps from the skin). So each splat's looseness is
// replaced by the average around it: the splats are put in cells r wide, and each takes the means
// of the cells round its own, weighted by how many splats each holds and how near its middle is.
export function smoothOver(values, centres, n, r) {
  const cells = new Map(), ci = new Int32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = [0, 1, 2].map((a) => Math.floor(centres[i * 3 + a] / r));
    ci.set(c, i * 3);
    const k = c.join();
    let e = cells.get(k);
    if (!e) cells.set(k, (e = [0, 0, 0, 0, 0]));
    e[0] += values[i]; e[1] += centres[i * 3]; e[2] += centres[i * 3 + 1]; e[3] += centres[i * 3 + 2]; e[4]++;
  }
  const s2 = 2 * (0.6 * r) ** 2, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, wsum = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const e = cells.get(`${ci[i * 3] + dx},${ci[i * 3 + 1] + dy},${ci[i * 3 + 2] + dz}`);
      if (!e) continue;
      const m = e[4], d2 = (e[1] / m - centres[i * 3]) ** 2 + (e[2] / m - centres[i * 3 + 1]) ** 2 + (e[3] / m - centres[i * 3 + 2]) ** 2;
      const w = m * Math.exp(-d2 / s2);
      sum += w * e[0] / m; wsum += w;
    }
    out[i] = wsum > 0 ? sum / wsum : values[i];
  }
  return out;
}

// ---------------------------------------------------------------- ink healed into the skin
// A healed tattoo sits under the skin: its colours a little greyer and lighter than the design's,
// its edges soft, and the skin's own colour (freckles, redness, its grain) still showing through.
// The factor the skin's colour is multiplied by under ink of colour rgb (0..1) laid at `ink`
// (0..1): PIGMENT is the deep blue-grey black ink reads as. HEALED.skin: how much of the skin's
// colour comes from the splat right there rather than the area around; soft: how much bigger
// than the design's dots the ink splats are.
export const PIGMENT = [0.07, 0.08, 0.10];
export const HEALED = { desat: 0.2, depth: 0.9, skin: 0.55, soft: 1.2 };
export function inkFactor(rgb, ink, out = [0, 0, 0]) {
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], a = ink * HEALED.depth;
  for (let x = 0; x < 3; x++) {
    const c = rgb[x] + HEALED.desat * (lum - rgb[x]);
    out[x] = 1 - a + a * (PIGMENT[x] + 0.88 * c);
  }
  return out;
}
