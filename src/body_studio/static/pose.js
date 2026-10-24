// Posing maths for the page (the skeleton, its limits, skinning, skin weights, surface maps; the
// skin a tattoo is laid on and ink as splats are in skin.js), kept free of three.js so it can be
// tested on its own (tests/js/pose.test.mjs, run by tests/unit/test_pose_js.py). Quaternions are [x, y, z, w],
// vectors [x, y, z]. The rig comes from rig.py (GET /api/rig): joints in the PLY's coordinates,
// skin weights on a voxel grid and a surface map per bone.

// ---------------------------------------------------------------- vectors and quaternions
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  unit: (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; },
};
export const q = {
  id: () => [0, 0, 0, 1],
  mul: (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  conj: (a) => [-a[0], -a[1], -a[2], a[3]],
  norm: (a) => { const n = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / n, a[1] / n, a[2] / n, a[3] / n]; },
  rot(a, v) {                                   // rotate vector v by unit quaternion a
    const [x, y, z, w] = a;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
  },
  axisAngle(axis, angle) {
    const s = Math.sin(angle / 2), u = v3.unit(axis);
    return [u[0] * s, u[1] * s, u[2] * s, Math.cos(angle / 2)];
  },
  fromRotvec(r) {
    const a = v3.len(r);
    return a < 1e-12 ? [0, 0, 0, 1] : q.axisAngle(r, a);
  },
  toRotvec(a) {
    const b = a[3] < 0 ? a.map((x) => -x) : a;
    const s = Math.hypot(b[0], b[1], b[2]);
    if (s < 1e-12) return [0, 0, 0];
    const ang = 2 * Math.atan2(s, b[3]);
    return [b[0] / s * ang, b[1] / s * ang, b[2] / s * ang];
  },
  between(from, to) {                           // shortest rotation taking unit vector `from` to `to`
    const d = v3.dot(from, to);
    if (d < -0.999999) {
      let ax = v3.cross([1, 0, 0], from);
      if (v3.len(ax) < 1e-6) ax = v3.cross([0, 1, 0], from);
      return q.axisAngle(ax, Math.PI);
    }
    const c = v3.cross(from, to);
    return q.norm([c[0], c[1], c[2], 1 + d]);
  },
};
export const RAD = Math.PI / 180;

// ---------------------------------------------------------------- joints and their limits
// For each joint (left side; the right side is its mirror image): the direction of its bone in
// the anatomical position (n, in the person's frame: x left, y up, z front), the two axes it
// swings about (a1: forward and back, a2: sideways), and the signs that turn the anatomical
// angles (flex, side, twist about the bone) into rotations. Ranges are adult active ranges of
// motion in degrees (AAOS; Soucie et al. 2011; Norkin & White); a body whose resting pose lies
// outside a range gets that range widened to include it.
// flex and side together are one swing of the bone away from where it hangs: how far (the
// elevation, hypot(flex, side)) and in which plane (atan2(flex, side): 0 out to the side, 90
// forward, 180 across the front, -90 back). A shoulder and a hip reach much further in some
// planes than in others, so they list the furthest elevation per plane (cone); the other joints
// keep within the ellipse their ranges make. A knee turns about its bone only when it is bent
// (twistBent: the bend at which its whole twist range opens).
const L = [1, 0, 0], U = [0, 1, 0], F = [0, 0, 1], D = [0, -1, 0];
export const DOF = {
  // the pelvis turns and tilts a little in each step (walk.js); it carries everything
  pelvis:     { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-15, 15], side: [-10, 10], twist: [-20, 20], labels: ["forward", "side", "twist"] },
  spine:      { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-25, 50], side: [-25, 25], twist: [-15, 15], labels: ["forward", "side", "twist"] },
  chest:      { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-20, 35], side: [-20, 20], twist: [-35, 35], labels: ["forward", "side", "twist"] },
  neck:       { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-40, 40], side: [-30, 30], twist: [-45, 45], labels: ["forward", "side", "twist"] },
  head:       { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-35, 20], side: [-15, 15], twist: [-40, 40], labels: ["forward", "side", "twist"] },
  clavicle_l: { n: L, a1: F, a2: U, k: [1, -1, 0],  flex: [-10, 30], side: [-15, 15], twist: [0, 0],    labels: ["raise", "forward"] },
  // shoulder: flexion 180, extension 60, abduction 180, adduction 50 (across the front), horizontal
  // adduction 135 from out to the side (45 past straight forward), horizontal abduction 40 behind
  shoulder_l: { n: D, a1: L, a2: F, k: [-1, 1, 1],  flex: [-60, 180], side: [-110, 180], twist: [-90, 70], labels: ["forward", "out", "twist"],
                cone: [[-180, 50], [-135, 50], [-90, 60], [-60, 80], [-40, 95], [-20, 160], [0, 180], [90, 180], [120, 160], [135, 110], [155, 70], [180, 50]] },
  // elbow: bends 145; the forearm's turn is the wrist's twist (below)
  elbow_l:    { n: D, a1: L, a2: F, k: [-1, 1, 1],  flex: [0, 145], side: [0, 0],    twist: [0, 0],    labels: ["bend"] },
  // wrist: bends 80 toward the palm and 70 back, 20 toward the thumb and 30 away; the forearm turns
  // the hand 80 each way from thumb-forward (pronation, supination). Its axes are the hand's: at
  // twist 0 the palm faces the body (palm, the way it faces) and the thumb points forward. The
  // forearm turns the hand before it bends (pronation happens above the wrist), so the bend's axes
  // turn with the palm.
  wrist_l:    { n: D, a1: F, a2: L, k: [-1, -1, 1], flex: [-70, 80], side: [-30, 20], twist: [-80, 80], labels: ["bend", "side", "twist"],
                palm: [-1, 0, 0], pronation: true },
  // hip: flexion 125, extension 30, abduction 45, adduction 25, further across with the hip bent
  // (crossing the legs)
  hip_l:      { n: D, a1: L, a2: F, k: [-1, 1, 1],  flex: [-30, 125], side: [-60, 45], twist: [-45, 40], labels: ["forward", "out", "twist"],
                cone: [[-180, 25], [-90, 30], [-45, 35], [0, 45], [50, 95], [90, 125], [115, 115], [140, 60], [160, 35], [180, 25]] },
  // knee: bend 145; the shin turns in 30 and out 40, with the knee bent (none when straight)
  knee_l:     { n: D, a1: L, a2: F, k: [1, 1, 1],   flex: [0, 145], side: [0, 0],    twist: [-30, 40], labels: ["bend", null, "twist"], twistBent: 90 },
  ankle_l:    { n: F, a1: L, a2: U, k: [-1, 1, -1], flex: [-50, 20], side: [-10, 10], twist: [-15, 30], labels: ["foot", "side", "tilt"] },
};
const MAX_SWING = 175;
// the collarbone's raise with the arm: from this elevation of the arm (degrees), this many degrees
// per degree, at most this many (Skeleton._rhythm)
export const RHYTHM = { from: 30, ratio: 0.15, max: 20 };

// the furthest elevation of a cone in plane p (degrees), between the planes it lists
function coneAt(cone, p) {
  for (let i = 0; i + 1 < cone.length; i++) {
    const [p0, e0] = cone[i], [p1, e1] = cone[i + 1];
    if (p >= p0 && p <= p1) return e0 + (e1 - e0) * (p - p0) / (p1 - p0 || 1);
  }
  return cone[cone.length - 1][1];
}                          // keeps a swing away from the half-turn where it flips

function defFor(name) {
  if (DOF[name]) return DOF[name];
  if (!name.endsWith("_r")) return null;
  const d = DOF[name.slice(0, -2) + "_l"];
  if (!d) return null;
  // mirror: n is reflected across the midline; a rotation about an axis that the reflection keeps
  // turns the other way, about an axis it reverses (the left axis) the same way
  const keeps = (a) => Math.abs(a[0]) < 0.9;
  return { ...d, n: [-d.n[0], d.n[1], d.n[2]], ...(d.palm && { palm: [-d.palm[0], d.palm[1], d.palm[2]] }),
           k: [keeps(d.a1) ? -d.k[0] : d.k[0], keeps(d.a2) ? -d.k[1] : d.k[1], -d.k[2]] };
}

// The bone a joint points along: its first child, except the pelvis (to the spine) and the
// chest (to the neck). Same rule as rig.py.
function primaryChild(names, parents, j) {
  const kids = parents.map((p, i) => (p === j ? i : -1)).filter((i) => i >= 0);
  if (!kids.length) return -1;
  const pref = { pelvis: "spine", chest: "neck" }[names[j]];
  return pref ? names.indexOf(pref) : kids[0];
}

export class Skeleton {
  // opts.palms: {wrist_l: [x, y, z], …}, the way each palm faces in the scan (palmNormals);
  // without one a hand rests turned thumb-forward. opts.body (BodyVolume): keeps the arms out of
  // the trunk and the head.
  constructor(rig, opts = {}) {
    this.body = opts.body || null;
    this.rhythm = opts.rhythm !== false;        // the collarbone goes up with the arm (_rhythm)
    this.names = rig.joints.map((j) => j.name);
    this.parents = rig.joints.map((j) => j.parent);
    this.rest = rig.joints.map((j) => j.pos.slice());
    this.n = this.names.length;
    const fr = rig.frame;
    const toMesh = (v) => v3.add(v3.add(v3.scale(fr.left, v[0]), v3.scale(fr.up, v[1])), v3.scale(fr.front, v[2]));
    this.up = fr.up.slice();
    this.primary = this.names.map((_, j) => primaryChild(this.names, this.parents, j));
    this.defs = this.names.map((name) => {
      const d = defFor(name);
      if (!d) return null;
      return { ...d, n: toMesh(d.n), a1: toMesh(d.a1), a2: toMesh(d.a2), hinge: d.side[1] - d.side[0] < 1,
               palm: d.palm && toMesh(d.palm),
               flex: d.flex.slice(), side: d.side.slice(), twist: d.twist.slice() };
    });
    // rest frames: C[j] carries the anatomical frame of joint j to where it is in the scan
    // A shoulder is measured against the trunk, not the collarbone, so the collarbone's resting
    // angle doesn't tilt what "forward" means for the arm.
    this.C = []; this.restA = []; this.restAngles = [];
    for (let j = 0; j < this.n; j++) {
      const p = this.parents[j];
      this.C[j] = p < 0 ? q.id() : this.names[p].startsWith("clavicle") ? this.C[p] : q.mul(this.C[p], this.restA[p]);
      const d = this.defs[j];
      if (!d || this.primary[j] < 0) { this.restA[j] = q.id(); this.restAngles[j] = null; continue; }
      const dir = v3.unit(v3.sub(this.rest[this.primary[j]], this.rest[j]));
      const local = q.rot(q.conj(this.C[j]), dir);
      const palm = d.palm && opts.palms && opts.palms[this.names[j]];
      const a = palm ? this._handAngles(d, local, v3.unit(q.rot(q.conj(this.C[j]), palm))) : { ...this._swing(d, local), twist: 0 };
      for (const key of ["flex", "side", "twist"]) {   // the scan's own pose is always allowed
        d[key][0] = Math.min(d[key][0], a[key]); d[key][1] = Math.max(d[key][1], a[key]);
      }
      this.restAngles[j] = a;
      this.restA[j] = this.rotation(j, a);
    }
    this.angles = this.restAngles.map((a) => (a ? { ...a } : null));
    // where the whole body is: turned by q about the root joint, then moved by t (walk.js)
    this.place = { q: q.id(), t: [0, 0, 0] };
    // small motions added on top of the pose, never kept with it nor limited by the joints'
    // ranges: breathing, a sway, the head turning to look (walk.js Life). {joint index: angles}
    this.extra = null;
    this.solve();
  }

  index(name) { return this.names.indexOf(name); }

  // flex and side of the swing taking the bone from n to `local` (in the joint's frame)
  _swing(d, local) {
    const rv = q.toRotvec(q.between(d.n, local));
    return { flex: d.k[0] ? v3.dot(rv, d.a1) / RAD / d.k[0] : 0, side: d.k[1] ? v3.dot(rv, d.a2) / RAD / d.k[1] : 0 };
  }

  // a hand's angles at rest from where it points (local) and the way its palm faces (palm), both
  // in the wrist's frame: the rotation taking (n, d.palm) there, split into a turn about n after
  // a swing. A palm's normal can't tell palm from back: the turn nearer thumb-forward is taken.
  _handAngles(d, local, palm, flipped = false) {
    const r1 = q.between(d.n, local);
    const p1 = q.rot(r1, d.palm), pp = v3.unit(v3.sub(palm, v3.scale(local, v3.dot(palm, local))));
    const r = q.mul(q.axisAngle(local, Math.atan2(v3.dot(v3.cross(p1, pp), local), v3.dot(p1, pp))), r1);
    // r = T S; its inverse = S' T' (a swing after a turn about n), so T = T'^-1 and S = S'^-1
    const inv = q.conj(r), c = v3.dot(inv, d.n);
    const tw = q.norm([d.n[0] * c, d.n[1] * c, d.n[2] * c, inv[3]]);
    const swing = q.conj(q.mul(inv, q.conj(tw))), turn = q.conj(tw);
    const rv = q.toRotvec(swing);
    let twist = 2 * Math.atan2(v3.dot(turn, d.n), turn[3]) / RAD / d.k[2];
    twist = ((twist + 540) % 360) - 180;
    if (Math.abs(twist) > 90 && !flipped) return this._handAngles(d, local, v3.scale(palm, -1), true);
    return { flex: v3.dot(rv, d.a1) / RAD / d.k[0], side: v3.dot(rv, d.a2) / RAD / d.k[1], twist };
  }

  // the anatomical rotation of joint j for angles {flex, side, twist}, in its own frame
  rotation(j, a) {
    const d = this.defs[j];
    const swing = q.fromRotvec(v3.add(v3.scale(d.a1, d.k[0] * a.flex * RAD), v3.scale(d.a2, d.k[1] * a.side * RAD)));
    const turn = q.axisAngle(d.n, d.k[2] * a.twist * RAD);
    return q.norm(d.pronation ? q.mul(turn, swing) : q.mul(swing, turn));
  }

  // keep angles inside the joint's range: sideways and forward together stay inside the joint's
  // cone (or the ellipse of its ranges)
  clamp(j, a) {
    const d = this.defs[j];
    let { flex, side, twist } = a;
    const [f0, f1] = d.flex, [s0, s1] = d.side;
    if (d.hinge) side = this.restAngles[j] ? this.restAngles[j].side : 0;   // a hinge keeps its resting side angle
    else if (d.cone) {
      const el = Math.hypot(flex, side);
      if (el > 1e-9) {
        const plane = Math.atan2(flex, side) / RAD;
        let max = coneAt(d.cone, plane);
        // the scan's own pose is always allowed, and swings near it as far
        const r = this.restAngles[j];
        if (r) {
          const re = Math.hypot(r.flex, r.side), rp = Math.atan2(r.flex, r.side) / RAD;
          const dp = Math.abs(((plane - rp + 540) % 360) - 180);
          if (dp < 30) max = Math.max(max, re);
        }
        if (el > max) { flex *= max / el; side *= max / el; }
      }
    } else if (f0 <= 0 && f1 >= 0 && s0 <= 0 && s1 >= 0) {
      const rf = flex >= 0 ? f1 : -f0, rs = side >= 0 ? s1 : -s0;
      const e = (rf ? (flex / rf) ** 2 : flex ? Infinity : 0) + (rs ? (side / rs) ** 2 : side ? Infinity : 0);
      if (e > 1 && Number.isFinite(e)) { const k = 1 / Math.sqrt(e); flex *= k; side *= k; }
    }
    flex = Math.min(Math.max(flex, f0), f1);
    side = Math.min(Math.max(side, s0), s1);
    const mag = Math.hypot(flex, side);
    if (mag > MAX_SWING) { flex *= MAX_SWING / mag; side *= MAX_SWING / mag; }
    const open = d.twistBent ? Math.min(1, Math.max(0, flex / d.twistBent)) : 1;
    twist = Math.min(Math.max(twist, open * d.twist[0]), open * d.twist[1]);
    return { flex, side, twist };
  }

  // move joint j toward angles a, within its range; with a body, only as far as the arms stay out
  // of the trunk and the head (or no further in than they were), sliding along it where the way
  // straight there is blocked
  set(j, a) {
    if (typeof j === "string") j = this.index(j);
    if (!this.defs[j] || !this.angles[j]) return false;
    const to = this.clamp(j, { ...this.angles[j], ...a });
    if (!this.body) { this.angles[j] = to; return true; }
    const limit = Math.max(this.body.depth(this.solve()), this.body.tol);
    const free = (b) => { this.angles[j] = b; return this.body.depth(this.solve()) <= limit; };
    const keys = ["flex", "side", "twist"];
    const lerp = (f, g, t) => this.clamp(j, Object.fromEntries(keys.map((k) => [k, f[k] + (g[k] - f[k]) * t])));
    const walk = (from, goal) => {             // as far from `from` toward `goal` as is free, in steps of 2°
      const n = Math.max(1, Math.ceil(Math.max(...keys.map((k) => Math.abs(goal[k] - from[k]))) / 2));
      let ok = from;
      for (let i = 1; i <= n; i++) {
        const c = lerp(from, goal, i / n);
        if (free(c)) { ok = c; continue; }
        let lo = 0, hi = 1;
        for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (free(lerp(ok, c, m))) lo = m; else hi = m; }
        return lerp(ok, c, lo);
      }
      return ok;
    };
    let at = walk(this.angles[j], to);
    for (const k of keys) at = walk(at, { ...at, [k]: to[k] });
    this.angles[j] = at;
    this.solve();
    return true;
  }

  // world rotation (W) and position (P) of every joint for the current angles
  solve() {
    this.W = []; this.P = []; this.WP = [];
    const lift = this.rhythm ? this._rhythm() : null, plain = [];
    const delta = (j, a) => q.mul(q.mul(this.C[j], q.mul(this.rotation(j, a), q.conj(this.restA[j]))), q.conj(this.C[j]));
    for (let j = 0; j < this.n; j++) {
      const p = this.parents[j];
      let d = q.id();
      if (this.angles[j]) {
        const e = this.extra && this.extra[j], a0 = this.angles[j];
        const a = e ? { flex: a0.flex + (e.flex || 0), side: a0.side + (e.side || 0), twist: a0.twist + (e.twist || 0) } : a0;
        d = delta(j, a);
        if (lift && lift[j]) {                   // a collarbone lifted with its arm
          plain[j] = q.norm(q.mul(this.W[p], d));
          d = delta(j, { ...a, flex: a.flex + lift[j] });
        }
      }
      if (p < 0) { this.WP[j] = this.place.q; this.W[j] = q.norm(q.mul(this.place.q, d)); this.P[j] = v3.add(this.rest[j], this.place.t); continue; }
      // (the arm keeps the way it was set to point; only where it starts goes up with the collarbone)
      this.WP[j] = plain[p] || this.W[p];
      this.W[j] = q.norm(q.mul(this.WP[j], d));
      this.P[j] = v3.add(this.P[p], q.rot(this.W[p], v3.sub(this.rest[j], this.rest[p])));
    }
    return this;
  }

  // the rotation joint j's own turn is applied after (its parent's, or the collarbone's before it
  // was lifted with the arm)
  parentW(j) { return this.WP[j] || q.id(); }

  // The shoulder blade and the collarbone go up with the arm: past about 30 degrees, for every
  // degree the arm rises the collarbone rises a fraction of one (the scapulohumeral rhythm, about
  // 1 of shoulder blade to 2 of arm; Inman et al. 1944, McClure et al. 2001), so the top of the
  // shoulder lifts and the skin over it isn't crushed into the neck. Measured from the scan's pose,
  // which stays as it is. {collarbone index: degrees of raise}
  _rhythm() {
    // (across the front of the body the shoulder blade slides forward more than it turns up)
    const out = {}, f = (a) => {
      const plane = Math.atan2(a.flex, a.side) / RAD, across = plane > 90 ? Math.max(0, (180 - plane) / 90) : 1;
      return across * Math.min(RHYTHM.max, Math.max(0, (Math.hypot(a.flex, a.side) - RHYTHM.from) * RHYTHM.ratio));
    };
    for (const s of ["l", "r"]) {
      const sh = this.index("shoulder_" + s), cl = this.index("clavicle_" + s);
      if (sh < 0 || cl < 0 || !this.angles[sh] || !this.angles[cl] || !this.restAngles[sh]) continue;
      const lift = f(this.angles[sh]) - f(this.restAngles[sh]);
      if (Math.abs(lift) > 1e-6) out[cl] = lift;
    }
    return out;
  }

  // turn joint j so its bone points along `dir` (posed, PLY coordinates), keeping its twist
  aim(j, dir) {
    if (typeof j === "string") j = this.index(j);
    const d = this.defs[j];
    if (!d || !this.angles[j]) return false;
    const p = this.parents[j];
    const frame = q.mul(p < 0 ? q.id() : this.W[p], this.C[j]);
    let local = v3.unit(q.rot(q.conj(frame), v3.unit(dir)));
    if (d.pronation) local = q.rot(q.axisAngle(d.n, -d.k[2] * this.angles[j].twist * RAD), local);
    let flex, side;
    if (d.hinge) {                               // a hinge: the angle about its one axis
      local = v3.unit(v3.sub(local, v3.scale(d.a1, v3.dot(local, d.a1))));
      const ang = Math.atan2(v3.dot(v3.cross(d.n, local), d.a1), v3.dot(d.n, local));
      flex = ang / RAD / d.k[0]; side = this.angles[j].side;
    } else {
      ({ flex, side } = this._swing(d, local));
    }
    this.set(j, { flex, side });
    this.solve();
    return true;
  }

  reset() { this.angles = this.restAngles.map((a) => (a ? { ...a } : null)); return this.solve(); }

  // {joint: {flex, side, twist}} for every joint that moved from the scan's pose
  pose() {
    const out = {};
    this.angles.forEach((a, j) => {
      const r = this.restAngles[j];
      if (a && (Math.abs(a.flex - r.flex) > 0.01 || Math.abs(a.side - r.side) > 0.01 || Math.abs(a.twist - r.twist) > 0.01))
        out[this.names[j]] = { flex: +a.flex.toFixed(2), side: +a.side.toFixed(2), twist: +a.twist.toFixed(2) };
    });
    return out;
  }

  setPose(pose) {
    this.reset();
    for (const [name, a] of Object.entries(pose || {})) {
      const j = this.index(name);
      if (j >= 0 && this.angles[j]) this.angles[j] = this.clamp(j, { ...this.restAngles[j], ...a });
    }
    return this.solve();
  }

  // Each bone's skinning transform: x -> W x + t (what Spark's SplatSkinning takes as the bone's
  // quaternion and position when its rest quaternion and position are identity and zero)
  transforms() {
    return this.W.map((w, j) => ({ q: w, t: v3.sub(this.P[j], q.rot(w, this.rest[j])) }));
  }
}

// ---------------------------------------------------------------- the body in the way
// The trunk and the head as the surface map measures them (the body's radius around their axis at
// each height and angle, at rest), so an arm can't be moved through them. Points along the upper
// arm (past its first 40%, which starts inside the shoulder), the forearm and the hand are taken
// back to rest by the trunk bone nearest each; an arm may touch the body but not sink in by more
// than SINK of its own thickness.
const SINK = 0.4;
export class BodyVolume {
  constructor(rig, map) {
    const names = rig.joints.map((j) => j.name), idx = (n) => names.indexOf(n);
    this.map = map;
    this.tol = 0.001 * rig.height;
    this.parts = [
      { region: "trunk", bones: ["pelvis", "spine", "chest", "neck"].map(idx).filter((b) => b >= 0) },
      { region: "head", bones: [idx("head")].filter((b) => b >= 0) },
    ].filter((o) => map.maps[o.region] && o.bones.length);
    this.limbs = [];
    for (const s of ["l", "r"]) {
      for (const [bone, child, from] of [["shoulder", "elbow", 0.4], ["elbow", "wrist", 0], ["wrist", "hand_end", 0]]) {
        const b = idx(bone + "_" + s), c = idx(child + "_" + s);
        if (b < 0 || c < 0 || !map.maps[names[b]]) continue;
        this.limbs.push({ b, c, from, r: this._thickness(names[b], map.maps[names[b]].length) });
      }
    }
  }

  // a limb's typical radius: the median of its map along the bone
  _thickness(name, len) {
    const rs = [];
    for (let t = 0.2; t <= 0.8; t += 0.1) for (let a = 0; a < 16; a++) {
      const r = this.map.radius(name, t * len, a / 16 * 2 * Math.PI);
      if (!Number.isNaN(r)) rs.push(r);
    }
    rs.sort((x, y) => x - y);
    return rs.length ? rs[rs.length >> 1] : 0;
  }

  // how far a posed point x (with room r around it) is inside a part, given the skeleton sk
  _inside(sk, part, x, r) {
    let best = -1, bd = Infinity;
    for (const b of part.bones) {             // the part's bone whose posed segment is nearest
      const a = sk.P[b], e = sk.P[sk.primary[b]] || a, ab = v3.sub(e, a), ap = v3.sub(x, a);
      const t = Math.max(0, Math.min(1, v3.dot(ap, ab) / (v3.dot(ab, ab) || 1)));
      const dd = v3.len(v3.sub(ap, v3.scale(ab, t)));
      if (dd < bd) { bd = dd; best = b; }
    }
    const p = v3.add(sk.rest[best], q.rot(q.conj(sk.W[best]), v3.sub(x, sk.P[best])));
    const m = this.map.maps[part.region], d = v3.sub(p, m.origin), t = v3.dot(d, m.axis);
    const u = v3.dot(d, m.e0), w = v3.dot(d, m.e1);
    const R = this.map.radius(part.region, t, Math.atan2(w, u));
    return Number.isNaN(R) ? 0 : Math.max(0, R + r - Math.hypot(u, w));
  }

  // how deep the arms are in the trunk and the head, added up over points along them
  depth(sk) {
    let sum = 0;
    for (const l of this.limbs) {
      const a = sk.P[l.b], e = sk.P[l.c];
      for (let i = 0; i <= 6; i++) {
        const x = v3.add(a, v3.scale(v3.sub(e, a), l.from + (1 - l.from) * i / 6));
        for (const part of this.parts) sum += this._inside(sk, part, x, (1 - SINK) * l.r);
      }
    }
    return sum;
  }
}

// The way each palm faces in the scan: the hand's splats (those the wrist carries most) are flat,
// and the palm's normal is the direction across the hand they spread least in. null where the
// hand isn't clearly flat (a blurred or fisted hand).
export function palmNormals(rig, centres, bones, opaque) {
  const names = rig.joints.map((j) => j.name), out = {};
  for (const s of ["l", "r"]) {
    const w = names.indexOf("wrist_" + s), e = names.indexOf("hand_end_" + s);
    out["wrist_" + s] = null;
    if (w < 0 || e < 0) continue;
    const axis = v3.unit(v3.sub(rig.joints[e].pos, rig.joints[w].pos));
    const e0 = v3.unit(v3.cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e1 = v3.cross(axis, e0);
    let n = 0, su = 0, sv = 0, suu = 0, svv = 0, suv = 0;
    for (const i of opaque) {
      if (bones[i * 4] !== w) continue;
      const p = [centres[i * 3], centres[i * 3 + 1], centres[i * 3 + 2]];
      const u = v3.dot(p, e0), v = v3.dot(p, e1);
      n++; su += u; sv += v; suu += u * u; svv += v * v; suv += u * v;
    }
    if (n < 50) continue;
    const cuu = suu / n - (su / n) ** 2, cvv = svv / n - (sv / n) ** 2, cuv = suv / n - (su / n) * (sv / n);
    const mid = (cuu + cvv) / 2, dev = Math.hypot((cuu - cvv) / 2, cuv);
    const big = mid + dev, small = mid - dev;
    if (small <= 0 || big / small < 2.5) continue;
    const ang = 0.5 * Math.atan2(2 * cuv, cuu - cvv) + Math.PI / 2;   // the direction of least spread
    out["wrist_" + s] = v3.add(v3.scale(e0, Math.cos(ang)), v3.scale(e1, Math.sin(ang)));
  }
  return out;
}

// ---------------------------------------------------------------- dual quaternion skinning
// The same blend as Spark's SplatSkinning shader, so a tattoo moves exactly with the splats.
export function dualQuats(transforms) {
  const out = new Float32Array(transforms.length * 8);
  transforms.forEach(({ q: r, t }, j) => {
    const d = q.mul([t[0], t[1], t[2], 0], r);
    out.set([r[0], r[1], r[2], r[3], 0.5 * d[0], 0.5 * d[1], 0.5 * d[2], 0.5 * d[3]], j * 8);
  });
  return out;
}

export function skinPoint(p, bones, weights, dq, out = [0, 0, 0], o = 0) {
  let qx = 0, qy = 0, qz = 0, qw = 0, dx = 0, dy = 0, dz = 0, dw = 0;
  for (let i = 0; i < 4; i++) {
    const w = weights[o * 4 + i] / 255;
    if (w <= 0) continue;
    const b = bones[o * 4 + i] * 8;
    let s = w;
    if (i > 0 && qx * dq[b] + qy * dq[b + 1] + qz * dq[b + 2] + qw * dq[b + 3] < 0) s = -w;
    qx += s * dq[b]; qy += s * dq[b + 1]; qz += s * dq[b + 2]; qw += s * dq[b + 3];
    dx += s * dq[b + 4]; dy += s * dq[b + 5]; dz += s * dq[b + 6]; dw += s * dq[b + 7];
  }
  const n = Math.hypot(qx, qy, qz, qw) || 1;
  qx /= n; qy /= n; qz /= n; qw /= n; dx /= n; dy /= n; dz /= n; dw /= n;
  const tx = 2 * (-dw * qx + dx * qw - dy * qz + dz * qy);
  const ty = 2 * (-dw * qy + dx * qz + dy * qw - dz * qx);
  const tz = 2 * (-dw * qz - dx * qy + dy * qx + dz * qw);
  const r = q.rot([qx, qy, qz, qw], p);
  out[0] = r[0] + tx; out[1] = r[1] + ty; out[2] = r[2] + tz;
  return out;
}

// ---------------------------------------------------------------- skin weights
export function b64bytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class SkinWeights {
  constructor(rig) {
    const g = rig.grid, fr = rig.frame;
    this.lo = g.lo; this.size = g.size; this.dims = g.n;
    const cells = new Int32Array(b64bytes(g.cells).buffer);
    this.bones = b64bytes(g.bones); this.weights = b64bytes(g.weights);
    this.lut = new Int32Array(g.n[0] * g.n[1] * g.n[2]).fill(-1);
    cells.forEach((c, i) => { this.lut[c] = i; });
    this.o = fr.origin; this.L = fr.left; this.U = fr.up; this.F = fr.front;
    this.acc = new Float32Array(256); this.mean = new Float32Array(256); this.touched = [];
    this.corner = new Int32Array(8); this.frac = new Float32Array(8);
    this.parents = rig.joints.map((j) => j.parent);
    // for splats outside the grid: the nearest bone segment
    const sk = rig.joints;
    this.segments = [];
    sk.forEach((j, i) => { if (j.parent >= 0) this.segments.push([j.parent, sk[j.parent].pos, j.pos]); });
  }

  // skin weights at a point (PLY coordinates): four bone indices and weights in 0..255 adding to 255
  at(x, y, z, bones, weights, o = 0) {
    const px = x - this.o[0], py = y - this.o[1], pz = z - this.o[2];
    const L = this.L, U = this.U, F = this.F, n = this.dims, v = this.size;
    const fx = (px * L[0] + py * L[1] + pz * L[2] - this.lo[0]) / v - 0.5;
    const fy = (px * U[0] + py * U[1] + pz * U[2] - this.lo[1]) / v - 0.5;
    const fz = (px * F[0] + py * F[1] + pz * F[2] - this.lo[2]) / v - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
    const tx = fx - i0, ty = fy - j0, tz = fz - k0;
    // the 8 voxels around the point, each counted by how much its bones agree with the blend of all
    // eight: a splat on the inside of one thigh doesn't pick up the other thigh's voxels, and the
    // weights change smoothly from point to point (a voxel is never all in or all out, which would
    // tear the skin at the armpit when the arm moves)
    const corner = this.corner, frac = this.frac;
    let any = false;
    for (let c = 0; c < 8; c++) {
      const i = i0 + (c & 1), j = j0 + ((c >> 1) & 1), k = k0 + ((c >> 2) & 1);
      corner[c] = -1;
      if (i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2]) continue;
      corner[c] = this.lut[(i * n[1] + j) * n[2] + k];
      frac[c] = (c & 1 ? tx : 1 - tx) * ((c >> 1) & 1 ? ty : 1 - ty) * ((c >> 2) & 1 ? tz : 1 - tz);
      if (corner[c] >= 0 && frac[c] > 0) any = true;
    }
    const acc = this.acc, mean = this.mean, touched = this.touched;
    touched.length = 0;
    if (any) {
      let fs = 0;
      for (let c = 0; c < 8; c++) {
        const cell = corner[c];
        if (cell < 0 || frac[c] <= 0) continue;
        fs += frac[c];
        for (let m = 0; m < 4; m++) mean[this.bones[cell * 4 + m]] += frac[c] * this.weights[cell * 4 + m];
      }
      for (let c = 0; c < 8; c++) {
        const cell = corner[c];
        if (cell < 0 || frac[c] <= 0) continue;
        let agree = 0;
        for (let m = 0; m < 4; m++) agree += Math.min(this.weights[cell * 4 + m], mean[this.bones[cell * 4 + m]] / fs);
        agree /= 255;
        const f = frac[c] * agree * agree;
        for (let m = 0; m < 4; m++) {
          const w = this.weights[cell * 4 + m];
          if (!w || f <= 0) continue;
          const b = this.bones[cell * 4 + m];
          if (acc[b] === 0) touched.push(b);
          acc[b] += f * w;
        }
      }
      for (let c = 0; c < 8; c++) {
        const cell = corner[c];
        if (cell >= 0) for (let m = 0; m < 4; m++) mean[this.bones[cell * 4 + m]] = 0;
      }
    }
    if (!touched.length) return this.nearestBone(x, y, z, bones, weights, o);
    touched.sort((a, b) => acc[b] - acc[a]);
    const top = touched.slice(0, 4);
    const sum = top.reduce((s, b) => s + acc[b], 0);
    // rounded down, and what that leaves goes to the heaviest bone: never more than 255 in all
    // (rounding to nearest could leave -1 for the last bone, which a byte stores as 255)
    let left = 255;
    for (let m = 0; m < 4; m++) {
      const b = top[m];
      const w = b === undefined ? 0 : Math.floor(acc[b] / sum * 255);
      bones[o * 4 + m] = b === undefined ? 0 : b;
      weights[o * 4 + m] = w;
      left -= w;
    }
    weights[o * 4] += left;
    for (const b of touched) acc[b] = 0;
    return bones;
  }

  nearestBone(x, y, z, bones, weights, o) {
    let best = 0, bd = Infinity;
    for (const [b, a, e] of this.segments) {
      const ab = v3.sub(e, a), ap = [x - a[0], y - a[1], z - a[2]];
      const t = Math.max(0, Math.min(1, v3.dot(ap, ab) / (v3.dot(ab, ab) || 1)));
      const d = v3.len(v3.sub(ap, v3.scale(ab, t)));
      if (d < bd) { bd = d; best = b; }
    }
    bones.fill(0, o * 4, o * 4 + 4); weights.fill(0, o * 4, o * 4 + 4);
    bones[o * 4] = best; weights[o * 4] = 255;
    return bones;
  }
}

// ---------------------------------------------------------------- surface map
// Around each bone, and around the trunk and each leg: the body's radius at each step along the
// axis (t) and angle (theta). The page uses the axis to point a tattoo's top toward the head, and
// (t, theta) to read tattoos saved before SkinSurface.
export class SurfaceMap {
  constructor(rig) {
    this.maps = {};
    this.upHint = rig.frame.up;
    for (const [name, m] of Object.entries(rig.maps)) {
      const raw = new Uint16Array(b64bytes(m.radius).buffer.slice(0));
      const r = new Float32Array(raw.length);
      raw.forEach((v, i) => { r[i] = v ? v * rig.radius_scale : NaN; });
      this.maps[name] = { ...m, r, rgb: b64bytes(m.colour) };
    }
  }

  // (t, theta) of a point (PLY coordinates, rest pose) around a bone
  locate(bone, p) {
    const m = this.maps[bone];
    const d = v3.sub(p, m.origin);
    const t = v3.dot(d, m.axis);
    return { t, theta: Math.atan2(v3.dot(d, m.e1), v3.dot(d, m.e0)) };
  }

  _cell(m, t, theta) {
    const ft = (t - m.t0) / m.dt;
    let fa = (theta / (2 * Math.PI)) * m.na - 0.5;
    fa = ((fa % m.na) + m.na) % m.na;
    return { ft, fa };
  }

  radius(bone, t, theta) {
    const m = this.maps[bone];
    const { ft, fa } = this._cell(m, t, theta);
    if (ft < 0 || ft > m.nt - 1) return NaN;
    const t0 = Math.min(Math.floor(ft), m.nt - 2), a0 = Math.floor(fa) % m.na, a1 = (a0 + 1) % m.na;
    const wt = ft - t0, wa = fa - Math.floor(fa);
    let s = 0, ws = 0;
    for (const [ti, ai, w] of [[t0, a0, (1 - wt) * (1 - wa)], [t0, a1, (1 - wt) * wa], [t0 + 1, a0, wt * (1 - wa)], [t0 + 1, a1, wt * wa]]) {
      const v = m.r[ti * m.na + ai];
      if (!Number.isNaN(v) && w > 0) { s += v * w; ws += w; }
    }
    return ws > 0.25 ? s / ws : NaN;
  }

  point(bone, t, theta, lift = 0) {
    const m = this.maps[bone];
    const r = this.radius(bone, t, theta);
    if (Number.isNaN(r)) return null;
    const out = v3.add(v3.scale(m.e0, Math.cos(theta)), v3.scale(m.e1, Math.sin(theta)));
    return v3.add(v3.add(m.origin, v3.scale(m.axis, t)), v3.scale(out, r + lift));
  }
}
