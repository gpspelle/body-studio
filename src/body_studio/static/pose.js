// Posing and tattoo maths for the page, kept free of three.js so it can be tested on its own
// (tests/js/pose.test.mjs, run by tests/unit/test_pose_js.py). Quaternions are [x, y, z, w],
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
const RAD = Math.PI / 180;

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
    this.W = []; this.P = [];
    for (let j = 0; j < this.n; j++) {
      const p = this.parents[j];
      let delta = q.id();
      if (this.angles[j]) {
        const A = this.rotation(j, this.angles[j]);
        delta = q.mul(q.mul(this.C[j], q.mul(A, q.conj(this.restA[j]))), q.conj(this.C[j]));
      }
      if (p < 0) { this.W[j] = q.norm(q.mul(this.place.q, delta)); this.P[j] = v3.add(this.rest[j], this.place.t); continue; }
      this.W[j] = q.norm(q.mul(this.W[p], delta));
      this.P[j] = v3.add(this.P[p], q.rot(this.W[p], v3.sub(this.rest[j], this.rest[p])));
    }
    return this;
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

// ---------------------------------------------------------------- the skin, for tattoos
// The opaque splats' centres averaged into small cells: points on the skin, each with a normal
// pointing out of the body. A tattoo is laid on them with a discrete exponential map (Schmidt,
// Grimm & Wyvill, "Interactive decal compositing with discrete exponential maps", SIGGRAPH 2006):
// from the point tapped, each cell gets 2D coordinates by walking the surface, carrying a frame
// along. The image follows the skin wherever it goes (across the crotch, from the back onto a leg,
// over a shoulder) and keeps its size as it wraps around a limb. The walk doesn't jump a gap (an
// arm to the flank beside it, one leg to the other): parts of the image it can't reach on the
// skin are left out.
export class SkinSurface {
  // centres: x, y, z per splat (PLY coordinates, rest pose); opaque: the indices of opaque splats;
  // weights (SkinWeights, optional): which bones carry the skin, to tell out from in
  constructor(rig, centres, opaque, weights = null) {
    const H = this.H = rig.height, n = opaque.length;
    // about three splats per cell (a body's skin is about 0.6 H^2), never finer than 0.4 % of the height
    const h = this.h = Math.max(0.004 * H, Math.sqrt(3 * 0.6 * H * H / Math.max(n, 1)));
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const i of opaque) {
      for (let a = 0; a < 3; a++) {
        const v = centres[i * 3 + a];
        if (v < lo[a]) lo[a] = v;
        if (v > hi[a]) hi[a] = v;
      }
    }
    this.lo = lo;
    this.dims = lo.map((l, a) => Math.max(1, Math.floor((hi[a] - l) / h) + 1));
    this.cells = new Map();
    const sum = [], cnt = [];
    for (const i of opaque) {
      const x = centres[i * 3], y = centres[i * 3 + 1], z = centres[i * 3 + 2];
      const key = this._key(x, y, z);
      let c = this.cells.get(key);
      if (c === undefined) { c = cnt.length; this.cells.set(key, c); sum.push(0, 0, 0); cnt.push(0); }
      sum[c * 3] += x; sum[c * 3 + 1] += y; sum[c * 3 + 2] += z; cnt[c]++;
    }
    const m = this.count = cnt.length;
    this.pos = new Float32Array(m * 3);
    for (let c = 0; c < m; c++) for (let a = 0; a < 3; a++) this.pos[c * 3 + a] = sum[c * 3 + a] / cnt[c];
    // the splats of cell c: members[first[c] .. first[c + 1]]
    this.centres = centres;
    this.first = new Int32Array(m + 1);
    for (let c = 0; c < m; c++) this.first[c + 1] = this.first[c] + cnt[c];
    this.members = new Int32Array(opaque.length);
    const fill = this.first.slice(0, m);
    for (const i of opaque) this.members[fill[this.cells.get(this._key(centres[i * 3], centres[i * 3 + 1], centres[i * 3 + 2]))]++] = i;
    this.segments = [];
    rig.joints.forEach((j) => { if (j.parent >= 0) this.segments.push([rig.joints[j.parent].pos, j.pos]); });
    // each bone's own segment: from its joint to its first child (a bone with none: from its parent)
    this.weights = weights;
    this.boneSeg = rig.joints.map((j, b) => {
      const kid = rig.joints.findIndex((k) => k.parent === b);
      return kid >= 0 ? [j.pos, rig.joints[kid].pos] : j.parent >= 0 ? [rig.joints[j.parent].pos, j.pos] : null;
    });
    this._wb = new Uint8Array(4); this._ww = new Uint8Array(4);
    // worked out when a tattoo first needs them: neighbours and normal
    this.adj = new Array(m).fill(null);
    this.nrm = new Float32Array(m * 3); this.surf = new Float32Array(m * 3);
    // the walk's state, reused from one tattoo to the next (seen/done hold the walk's number)
    this.dist = new Float64Array(m); this.par = new Int32Array(m);
    this.uv = new Float32Array(m * 2); this.frame = new Float32Array(m * 6);
    this.seen = new Uint32Array(m); this.done = new Uint32Array(m); this.walks = 0;
  }

  _ijk(x, y, z) {
    const h = this.h, lo = this.lo;
    return [Math.floor((x - lo[0]) / h), Math.floor((y - lo[1]) / h), Math.floor((z - lo[2]) / h)];
  }

  _key(x, y, z) {
    const [i, j, k] = this._ijk(x, y, z);
    return (i * this.dims[1] + j) * this.dims[2] + k;
  }

  // cells within r of point p, from the cubes of cells around it
  _near(p, r, out = []) {
    const [i0, j0, k0] = this._ijk(p[0], p[1], p[2]), s = Math.ceil(r / this.h), d = this.dims, r2 = r * r;
    for (let i = Math.max(0, i0 - s); i <= Math.min(d[0] - 1, i0 + s); i++) {
      for (let j = Math.max(0, j0 - s); j <= Math.min(d[1] - 1, j0 + s); j++) {
        for (let k = Math.max(0, k0 - s); k <= Math.min(d[2] - 1, k0 + s); k++) {
          const c = this.cells.get((i * d[1] + j) * d[2] + k);
          if (c === undefined) continue;
          const x = this.pos[c * 3] - p[0], y = this.pos[c * 3 + 1] - p[1], z = this.pos[c * 3 + 2] - p[2];
          if (x * x + y * y + z * z <= r2) out.push(c);
        }
      }
    }
    return out;
  }

  _p(c) { return [this.pos[c * 3], this.pos[c * 3 + 1], this.pos[c * 3 + 2]]; }
  _n(c) { return [this.nrm[c * 3], this.nrm[c * 3 + 1], this.nrm[c * 3 + 2]]; }
  _s(c) { return [this.surf[c * 3], this.surf[c * 3 + 1], this.surf[c * 3 + 2]]; }

  // away from the bones that carry the skin here (by their weights), or else from the nearest bone.
  // The nearest bone alone gets it wrong where skin of one part lies close to another: the side of
  // the chest under the arm is nearer the upper arm than the spine.
  _outward(p) {
    if (this.weights) {
      const b = this._wb, w = this._ww, out = [0, 0, 0];
      this.weights.at(p[0], p[1], p[2], b, w);
      for (let k = 0; k < 4; k++) {
        const seg = w[k] ? this.boneSeg[b[k]] : null;
        if (!seg) continue;
        const [a, e] = seg, ab = v3.sub(e, a), ap = v3.sub(p, a);
        const t = Math.max(0, Math.min(1, v3.dot(ap, ab) / (v3.dot(ab, ab) || 1)));
        const d = v3.unit(v3.sub(ap, v3.scale(ab, t)));
        for (let x = 0; x < 3; x++) out[x] += w[k] * d[x];
      }
      if (v3.len(out) > 1e-6) return v3.unit(out);
    }
    let best = null, bd = Infinity;
    for (const [a, e] of this.segments) {
      const ab = v3.sub(e, a), ap = v3.sub(p, a);
      const t = Math.max(0, Math.min(1, v3.dot(ap, ab) / (v3.dot(ab, ab) || 1)));
      const d = v3.sub(ap, v3.scale(ab, t)), l = v3.len(d);
      if (l < bd) { bd = l; best = d; }
    }
    return v3.unit(best || [0, 1, 0]);
  }

  // neighbours, normal (the flattest direction of the cells around, turned away from the bone) and
  // where the skin is
  _prep(c) {
    if (this.adj[c]) return;
    const h = this.h, p = this._p(c);
    const adj = this.adj[c] = this._near(p, 2 * h).filter((d) => d !== c);
    const o = this._outward(p);
    let nv = o;
    if (adj.length >= 4) {
      const mean = [...p];
      for (const d of adj) for (let a = 0; a < 3; a++) mean[a] += this.pos[d * 3 + a];
      for (let a = 0; a < 3; a++) mean[a] /= adj.length + 1;
      const C = [0, 0, 0, 0, 0, 0];             // xx yy zz xy xz yz
      for (const d of [c, ...adj]) {
        const x = this.pos[d * 3] - mean[0], y = this.pos[d * 3 + 1] - mean[1], z = this.pos[d * 3 + 2] - mean[2];
        C[0] += x * x; C[1] += y * y; C[2] += z * z; C[3] += x * y; C[4] += x * z; C[5] += y * z;
      }
      // the smallest eigenvector of C is the largest of (trace - C), by power iteration from `o`
      const tr = C[0] + C[1] + C[2];
      let v = o;
      for (let it = 0; it < 30; it++) {
        v = v3.unit([(tr - C[0]) * v[0] - C[3] * v[1] - C[4] * v[2],
                     -C[3] * v[0] + (tr - C[1]) * v[1] - C[5] * v[2],
                     -C[4] * v[0] - C[5] * v[1] + (tr - C[2]) * v[2]]);
      }
      nv = v3.dot(v, o) < 0 ? v3.scale(v, -1) : v;
    }
    this.nrm.set(nv, c * 3);
    this._lift(c);
  }

  // the skin here: splats scatter a few millimetres above and below it, in layers a cell apart,
  // and a walk along the inner layers would come up short. So the cell is moved onto the outside
  // of the scatter (about three quarters of it below), keeping its place along the skin.
  _lift(c) {
    const p = this._p(c), adj = this.adj[c], nv = this._n(c);
    if (adj.length < 4) { this.surf.set(p, c * 3); return; }
    const mean = [...p];
    for (const d of adj) for (let a = 0; a < 3; a++) mean[a] += this.pos[d * 3 + a];
    for (let a = 0; a < 3; a++) mean[a] /= adj.length + 1;
    let vr = 0;
    for (const d of [c, ...adj]) vr += v3.dot(v3.sub(this._p(d), mean), nv) ** 2;
    const off = 0.67 * Math.sqrt(vr / (adj.length + 1)) - v3.dot(v3.sub(p, mean), nv);
    this.surf.set(v3.add(p, v3.scale(nv, off)), c * 3);
  }

  // the cell nearest a point, or -1
  nearest(p) {
    let best = -1, bd = Infinity;
    for (let r = 2 * this.h; r <= 8 * this.h && best < 0; r *= 2) {
      for (const c of this._near(p, r)) {
        const d = v3.len(v3.sub(this._p(c), p));
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  }

  // Walks out from cell `seed` (frame: right, up) to geodesic distance `reach`, giving every cell
  // reached its 2D coordinates (right, up on the skin). Returns the cells reached.
  _walk(seed, right, up, reach, axis, relax) {
    const w = ++this.walks, h = this.h, reached = [];
    const P = this.surf, N = this.nrm, UV = this.uv, Fr = this.frame, dist = this.dist, done = this.done;
    const hd = [], hc = [];                     // a binary heap of cells by distance
    const push = (d, c) => {
      let i = hd.length;
      hd.push(d); hc.push(c);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hd[p] <= d) break;
        hd[i] = hd[p]; hc[i] = hc[p]; i = p;
      }
      hd[i] = d; hc[i] = c;
    };
    const pop = () => {
      const c = hc[0], d = hd.pop(), e = hc.pop(), n = hd.length;
      if (n) {
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = l < n && hd[l] < d ? l : -1;
          if (r < n && hd[r] < (m < 0 ? d : hd[l])) m = r;
          if (m < 0) break;
          hd[i] = hd[m]; hc[i] = hc[m]; i = m;
        }
        hd[i] = d; hc[i] = e;
      }
      return c;
    };
    // skin that faces the other way (across the gap from an arm to the flank, or between the
    // thighs) or lies straight out from a cell is not the next step along the skin from it
    const along = (c, e) => {
      const x = P[e * 3] - P[c * 3], y = P[e * 3 + 1] - P[c * 3 + 1], z = P[e * 3 + 2] - P[c * 3 + 2];
      const len = Math.sqrt(x * x + y * y + z * z);
      if (N[c * 3] * N[e * 3] + N[c * 3 + 1] * N[e * 3 + 1] + N[c * 3 + 2] * N[e * 3 + 2] < 0.3) return -1;
      if (Math.abs(x * N[c * 3] + y * N[c * 3 + 1] + z * N[c * 3 + 2]) > 0.7 * len) return -1;
      return len;
    };
    // where neighbour e puts cell c: e's coordinates plus the step from e, laid in the plane
    // halfway between their tangent planes (the splats' scatter across the skin adds no length)
    const est = [0, 0];
    const estimate = (e, c) => {
      const x = P[c * 3] - P[e * 3], y = P[c * 3 + 1] - P[e * 3 + 1], z = P[c * 3 + 2] - P[e * 3 + 2];
      let mx = N[c * 3] + N[e * 3], my = N[c * 3 + 1] + N[e * 3 + 1], mz = N[c * 3 + 2] + N[e * 3 + 2];
      const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      mx /= ml; my /= ml; mz /= ml;
      const k = x * mx + y * my + z * mz, fx = x - k * mx, fy = y - k * my, fz = z - k * mz;
      est[0] = UV[e * 2] + fx * Fr[e * 6] + fy * Fr[e * 6 + 1] + fz * Fr[e * 6 + 2];
      est[1] = UV[e * 2 + 1] + fx * Fr[e * 6 + 3] + fy * Fr[e * 6 + 4] + fz * Fr[e * 6 + 5];
    };
    this.seen[seed] = w; dist[seed] = 0; this.par[seed] = -1;
    push(0, seed);
    while (hd.length) {
      const d = hd[0], c = pop();
      if (done[c] === w || d > dist[c]) continue;
      done[c] = w;
      reached.push(c);
      const nx = N[c * 3], ny = N[c * 3 + 1], nz = N[c * 3 + 2];
      if (c === seed) {
        UV[c * 2] = 0; UV[c * 2 + 1] = 0;
        Fr.set(right, c * 6); Fr.set(up, c * 6 + 3);
      } else {
        // the frame, carried from the cell it was reached from by the smallest turn
        const f = this.par[c];
        let u = q.rot(q.between(this._n(f), [nx, ny, nz]), [Fr[f * 6 + 3], Fr[f * 6 + 4], Fr[f * 6 + 5]]);
        const k = axis[0] * nx + axis[1] * ny + axis[2] * nz;
        const ax = [axis[0] - k * nx, axis[1] - k * ny, axis[2] - k * nz], al = v3.len(ax);
        const a = Math.min(1, Math.max(0, (al - 0.3) / 0.3)) * Math.min(1, (d - dist[f]) / relax);
        if (a > 0 && v3.dot(u, ax) > 0) u = v3.add(v3.scale(u, 1 - a), v3.scale(ax, a / al));
        const ku = u[0] * nx + u[1] * ny + u[2] * nz;
        u = v3.unit([u[0] - ku * nx, u[1] - ku * ny, u[2] - ku * nz]);
        Fr.set(v3.cross(u, [nx, ny, nz]), c * 6); Fr.set(u, c * 6 + 3);
        // coordinates: the estimates of the neighbours already placed, averaged ("upwind
        // averaging" in the paper), but only those that agree with the one from the cell it was
        // reached from: where the walk meets itself behind a limb, the two sides are far apart
        estimate(f, c);
        const ru = est[0], rv = est[1];
        let su = 0, sv = 0, sw = 0;
        for (const e of this.adj[c]) {
          if (done[e] !== w) continue;
          const len = along(e, c);
          if (len < 0) continue;
          estimate(e, c);
          if ((est[0] - ru) ** 2 + (est[1] - rv) ** 2 > 4 * h * h) continue;
          const wt = 1 / (len + 0.25 * h);
          su += wt * est[0]; sv += wt * est[1]; sw += wt;
        }
        UV[c * 2] = sw ? su / sw : ru; UV[c * 2 + 1] = sw ? sv / sw : rv;
      }
      for (const e of this.adj[c]) {
        if (done[e] === w) continue;
        this._prep(e);
        const len = along(c, e);
        if (len < 0) continue;
        const nd = d + len;
        if (nd > reach || (this.seen[e] === w && nd >= dist[e])) continue;
        this.seen[e] = w; dist[e] = nd; this.par[e] = c;
        push(nd, e);
      }
    }
    return reached;
  }

  // A tattoo as a grid of points on the skin (rest pose). tattoo: {at (the point tapped), up (the
  // image's top points this way, e.g. toward the head), width, height (PLY units), angle
  // (degrees, turns the image as seen from outside), lift (off the skin)}. Returns positions,
  // texture coordinates and triangles; points with no skin under them are left out (valid 0).
  wrap(tattoo, nx = 48, ny = 48) {
    const count = nx * ny, h = this.h;
    const pos = new Float32Array(count * 3), uvs = new Float32Array(count * 2), ok = new Uint8Array(count);
    const nrm = new Float32Array(count * 3), spread = new Float32Array(count);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { uvs[(j * nx + i) * 2] = i / (nx - 1); uvs[(j * nx + i) * 2 + 1] = j / (ny - 1); }
    const seed = this.nearest(tattoo.at);
    const done = (tris) => ({ positions: pos, uvs, index: new Uint32Array(tris), valid: ok, normals: nrm, spread, nx, ny });
    if (seed < 0) return done([]);
    this._prep(seed);
    const n = this._n(seed);
    let up = v3.sub(tattoo.up, v3.scale(n, v3.dot(tattoo.up, n)));
    if (v3.len(up) < 0.2 * v3.len(tattoo.up)) up = v3.cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]);
    up = v3.unit(up);
    const right = v3.cross(up, n);              // seen from outside, x right of y up
    const reach = 1.2 * 0.5 * Math.hypot(tattoo.width, tattoo.height) + 3 * h;
    // carried frames turn on curved, scattered skin (over the buttocks, or from a crease); they
    // are drawn back toward `up` laid on the skin over about 5 % of the height, so the image stays
    // upright, at the cost of a little stretch where the body tapers
    const reached = this._walk(seed, right, up, reach, v3.unit(tattoo.up), 0.05 * this.H);
    // and what lean is left (mostly from the seed's own frame) goes: the image is turned so that
    // on average, over its middle, its top points along `up` laid on the skin
    let tu = 0, tv = 0;
    const inner = 0.5 * Math.min(tattoo.width, tattoo.height), ua = v3.unit(tattoo.up);
    for (const c of reached) {
      if (this.dist[c] > inner) continue;
      const nc = this._n(c), k = v3.dot(ua, nc), ax = v3.sub(ua, v3.scale(nc, k));
      if (v3.len(ax) < 0.5) continue;
      const f = this.frame.subarray(c * 6, c * 6 + 6);
      tu += ax[0] * f[0] + ax[1] * f[1] + ax[2] * f[2];
      tv += ax[0] * f[3] + ax[1] * f[4] + ax[2] * f[5];
    }
    const lean = tu || tv ? Math.atan2(tu, tv) : 0;
    // centred on the point tapped, not on its cell's middle
    const off = v3.sub(tattoo.at, this._s(seed)), cu = v3.dot(off, right), cv = v3.dot(off, up);
    // the splats of the cells reached, with 2D coordinates from their cell's, sorted into bins
    // of size h by those coordinates
    const C = this.centres, Pc = this.surf, UV = this.uv, Nc = this.nrm;
    // (at most 8 a cell: plenty to find the skin, and a dense capture stays quick)
    const per = (c) => Math.min(8, this.first[c + 1] - this.first[c]);
    let total = 0;
    for (const c of reached) total += per(c);
    const sp = new Float32Array(total * 3), suv = new Float32Array(total * 2), sn = new Int32Array(total);
    let e = 0, lo = Infinity, hi = -Infinity;
    for (const c of reached) {
      const f = this.frame.subarray(c * 6, c * 6 + 6);
      for (let m = this.first[c]; m < this.first[c] + per(c); m++, e++) {
        const i = this.members[m];
        const x = C[i * 3] - Pc[c * 3], y = C[i * 3 + 1] - Pc[c * 3 + 1], z = C[i * 3 + 2] - Pc[c * 3 + 2];
        const u = UV[c * 2] + x * f[0] + y * f[1] + z * f[2], v = UV[c * 2 + 1] + x * f[3] + y * f[4] + z * f[5];
        sp[e * 3] = C[i * 3]; sp[e * 3 + 1] = C[i * 3 + 1]; sp[e * 3 + 2] = C[i * 3 + 2];
        suv[e * 2] = u; suv[e * 2 + 1] = v; sn[e] = c;
        lo = Math.min(lo, u, v); hi = Math.max(hi, u, v);
      }
    }
    const nb = Math.max(1, Math.ceil((hi - lo) / h) + 1), b0 = Math.floor(lo / h);
    const binOf = (u, v) => (Math.floor(u / h) - b0) * nb + Math.floor(v / h) - b0;
    const start = new Int32Array(nb * nb + 1), order = new Int32Array(total);
    for (let k = 0; k < total; k++) start[binOf(suv[k * 2], suv[k * 2 + 1]) + 1]++;
    for (let k = 0; k < nb * nb; k++) start[k + 1] += start[k];
    const put = start.slice(0, nb * nb);
    for (let k = 0; k < total; k++) order[put[binOf(suv[k * 2], suv[k * 2 + 1])]++] = k;
    // each grid point: the splats whose coordinates are close to its own, blended. A point with no
    // splat near has no skin under it (past the edge of a limb, over the gap between the legs).
    // Coordinates can repeat on skin far apart (the walk reaching the inside of a thigh by way of
    // the crotch, or the far side of an arm both ways round), so the points are placed outward from
    // the middle of the image, each next to the neighbour it was reached from: of the splats with
    // the right coordinates, those on the skin nearest that neighbour.
    const ca = Math.cos(tattoo.angle * RAD - lean), sa = Math.sin(tattoo.angle * RAD - lean);
    const R2 = 4 * h * h, s2 = 2 * h * h, same = 9 * h * h, lift = tattoo.lift || 0;
    const dx = tattoo.width / (nx - 1), dy = tattoo.height / (ny - 1);
    let near = new Int32Array(256), nd2 = new Float32Array(256);
    const place = (i, j, ref, apart) => {
      const k = j * nx + i;
      const u0 = (i / (nx - 1) - 0.5) * tattoo.width, v0 = (j / (ny - 1) - 0.5) * tattoo.height;
      const su = cu + u0 * ca - v0 * sa, sv = cv + u0 * sa + v0 * ca;
      let m = 0, best = -1, bd = Infinity;
      const bu = Math.floor(su / h) - b0, bv = Math.floor(sv / h) - b0;
      for (let a = Math.max(0, bu - 2); a <= Math.min(nb - 1, bu + 2); a++) {
        for (let b = Math.max(0, bv - 2); b <= Math.min(nb - 1, bv + 2); b++) {
          for (let o = start[a * nb + b]; o < start[a * nb + b + 1]; o++) {
            const x = order[o], du = suv[x * 2] - su, dv = suv[x * 2 + 1] - sv, d2 = du * du + dv * dv;
            if (d2 > R2) continue;
            if (m === near.length) {
              const n2 = new Int32Array(m * 2), d2s = new Float32Array(m * 2);
              n2.set(near); d2s.set(nd2); near = n2; nd2 = d2s;
            }
            near[m] = x; nd2[m++] = d2;
            if (d2 > h * h) continue;               // the anchor splat must be close in coordinates too
            const r2 = (sp[x * 3] - ref[0]) ** 2 + (sp[x * 3 + 1] - ref[1]) ** 2 + (sp[x * 3 + 2] - ref[2]) ** 2;
            if (r2 < bd) { bd = r2; best = x; }
          }
        }
      }
      // no skin here, or only skin that isn't next to the neighbour (the walk came round to it)
      if (best < 0 || bd > (1.5 * apart + 1.5 * h) ** 2) return false;
      const bx = sp[best * 3], by = sp[best * 3 + 1], bz = sp[best * 3 + 2];
      let sw = 0, px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
      for (let t = 0; t < m; t++) {
        const x = near[t];
        if ((sp[x * 3] - bx) ** 2 + (sp[x * 3 + 1] - by) ** 2 + (sp[x * 3 + 2] - bz) ** 2 > same) { near[t] = -1; continue; }
        const wt = Math.exp(-nd2[t] / s2), c = sn[x];
        sw += wt;
        px += wt * sp[x * 3]; py += wt * sp[x * 3 + 1]; pz += wt * sp[x * 3 + 2];
        qx += wt * Nc[c * 3]; qy += wt * Nc[c * 3 + 1]; qz += wt * Nc[c * 3 + 2];
      }
      px /= sw; py /= sw; pz /= sw;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
      qx /= ql; qy /= ql; qz /= ql;
      // on the outside of the skin: splats lie a little above and below it, so go out to where
      // about three quarters of them are under the point (mean + 0.67 standard deviations)
      let vr = 0;
      for (let t = 0; t < m; t++) {
        const x = near[t];
        if (x < 0) continue;
        const o = (sp[x * 3] - px) * qx + (sp[x * 3 + 1] - py) * qy + (sp[x * 3 + 2] - pz) * qz;
        vr += Math.exp(-nd2[t] / s2) * o * o;
      }
      spread[k] = Math.sqrt(vr / sw);
      const out = 0.67 * spread[k] + lift;
      pos[k * 3] = px + qx * out; pos[k * 3 + 1] = py + qy * out; pos[k * 3 + 2] = pz + qz * out;
      nrm[k * 3] = qx; nrm[k * 3 + 1] = qy; nrm[k * 3 + 2] = qz;
      ok[k] = 1;
      return true;
    };
    const seen = new Uint8Array(count), queue = [];
    const i0 = (nx - 1) >> 1, j0 = (ny - 1) >> 1;
    seen[j0 * nx + i0] = 1;
    if (place(i0, j0, tattoo.at, 0)) queue.push(j0 * nx + i0);
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi], i = k % nx, j = (k - i) / nx, ref = pos.subarray(k * 3, k * 3 + 3);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, kk = b * nx + a;
        if (a < 0 || b < 0 || a >= nx || b >= ny || seen[kk]) continue;
        seen[kk] = 1;
        if (place(a, b, ref, di ? dx : dy)) queue.push(kk);
      }
    }
    // single missing points inside the image (cells are a little uneven): halfway between the
    // points either side
    const fill = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (ok[k]) continue;
        for (const [a, b, apart] of [[i > 0 && i < nx - 1 ? k - 1 : -1, k + 1, 2 * dx], [j > 0 && j < ny - 1 ? k - nx : -1, k + nx, 2 * dy]]) {
          if (a >= 0 && ok[a] && ok[b] && v3.len(v3.sub(pos.subarray(a * 3, a * 3 + 3), pos.subarray(b * 3, b * 3 + 3))) < 1.5 * apart + h) {
            fill.push([k, a, b]);
            break;
          }
        }
      }
    }
    for (const [k, a, b] of fill) {
      for (let x = 0; x < 3; x++) {
        pos[k * 3 + x] = 0.5 * (pos[a * 3 + x] + pos[b * 3 + x]);
        nrm[k * 3 + x] = 0.5 * (nrm[a * 3 + x] + nrm[b * 3 + x]);
      }
      spread[k] = 0.5 * (spread[a] + spread[b]);
      ok[k] = 1;
    }
    // cells whose corners are all on the skin and next to each other: where two parts of the image
    // that reached the skin separately meet (one over the shoulder onto the arm, one down the side
    // of the chest) there is a tear, not a long thin triangle across it
    const close = (p, q, want) => (pos[p * 3] - pos[q * 3]) ** 2 + (pos[p * 3 + 1] - pos[q * 3 + 1]) ** 2 +
                                  (pos[p * 3 + 2] - pos[q * 3 + 2]) ** 2 <= (1.5 * want + 1.5 * h) ** 2;
    const tris = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
        if (close(a, b, dx) && close(c, d, dx) && close(a, c, dy) && close(b, d, dy) && close(a, d, Math.hypot(dx, dy))) {
          tris.push(a, b, d, a, d, c);
        }
      }
    }
    return done(tris);
  }
}

// ---------------------------------------------------------------- ink as splats
// A tattoo is drawn as splats of its own lying on the skin, skinned with the skin's weights, so
// the renderer moves, sorts and hides them with the body's splats: ink behind an arm, under
// clothes or in a fold behaves like the skin it is on, with no stand-in for depth.

// Points spread evenly over the image where it has ink: about `count` of them (fewer for small
// images), each with its place in the image (u right, v up, 0..1), its coverage and its colour
// (each averaged over the patch of pixels around it). img: {width, height, data: RGBA bytes}.
export function inkSamples(img, count = 40000) {
  const W = img.width, Hh = img.height, d = img.data;
  let inked = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 12) inked++;
  const step = Math.max(1, Math.sqrt(Math.max(1, inked) / count));   // pixels between samples
  const nu = Math.max(2, Math.round(W / step)), nv = Math.max(2, Math.round(Hh / step));
  const u = [], v = [], a = [], rgb = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      // each a little off its place on the lattice: a regular lattice of splats smaller than a
      // pixel beats with the pixels into stripes
      const h1 = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, h2 = Math.sin(i * 39.3468 + j * 11.135) * 24634.6345;
      const cu = (i + 0.5 + 0.7 * (h1 - Math.floor(h1) - 0.5)) / nu, cv = (j + 0.5 + 0.7 * (h2 - Math.floor(h2) - 0.5)) / nv;
      const x0 = Math.floor((cu - 0.5 / nu) * W), x1 = Math.ceil((cu + 0.5 / nu) * W);
      const y0 = Math.floor((1 - cv - 0.5 / nv) * Hh), y1 = Math.ceil((1 - cv + 0.5 / nv) * Hh);
      let sa = 0, sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = Math.max(0, y0); y < Math.min(Hh, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
          const k = (y * W + x) * 4, al = d[k + 3] / 255;
          sa += al; sr += al * d[k]; sg += al * d[k + 1]; sb += al * d[k + 2]; n++;
        }
      }
      if (!n || sa / n < 0.04) continue;
      u.push(cu); v.push(cv); a.push(sa / n);
      rgb.push(sr / sa / 255, sg / sa / 255, sb / sa / 255);
    }
  }
  return { n: a.length, u: Float32Array.from(u), v: Float32Array.from(v), alpha: Float32Array.from(a),
           rgb: Float32Array.from(rgb), spacing: [1 / nu, 1 / nv] };
}

// Where each ink sample lies on the skin at rest, from a wrapped grid (SkinSurface.wrap): inside a
// drawn cell, blended from its four corners (position, outward normal); a sample over a cell that
// isn't drawn (no skin there, or a tear) is left out (ok 0). `out` lifts each point this many
// spreads of the skin's scatter further out than the grid, so the skin's own splats lie under it.
export const INK_OUT = 2;   // the page's: ink at the outside of the skin's scatter, with the outermost skin splats
export function placeInk(grid, samples, out = 0) {
  const { nx, ny, positions: P, normals: N, spread } = grid;
  const drawn = new Uint8Array(nx * ny);
  for (let t = 0; t < grid.index.length; t += 6) drawn[grid.index[t]] = 1;       // a cell's corner a
  const n = samples.n, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), ok = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    const fu = samples.u[s] * (nx - 1), fv = samples.v[s] * (ny - 1);
    const i = Math.min(nx - 2, Math.floor(fu)), j = Math.min(ny - 2, Math.floor(fv)), a = j * nx + i;
    if (!drawn[a]) continue;
    const x = fu - i, y = fv - j;
    const w = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y], k = [a, a + 1, a + nx, a + nx + 1];
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0, sp = 0;
    for (let c = 0; c < 4; c++) {
      const kk = k[c], wc = w[c];
      px += wc * P[kk * 3]; py += wc * P[kk * 3 + 1]; pz += wc * P[kk * 3 + 2];
      qx += wc * N[kk * 3]; qy += wc * N[kk * 3 + 1]; qz += wc * N[kk * 3 + 2];
      sp += wc * spread[kk];
    }
    const ql = Math.hypot(qx, qy, qz) || 1;
    qx /= ql; qy /= ql; qz /= ql;
    pos[s * 3] = px + qx * out * sp; pos[s * 3 + 1] = py + qy * out * sp; pos[s * 3 + 2] = pz + qz * out * sp;
    nrm[s * 3] = qx; nrm[s * 3 + 1] = qy; nrm[s * 3 + 2] = qz;
    ok[s] = 1;
  }
  return { positions: pos, normals: nrm, ok };
}

// The body's own splats under a wrapped grid, and the ink over each: those whose centre lies over a
// drawn cell (along the skin, within a cell of a grid point) and no further than `reach` in or out
// of it. Their place in the image comes from the nearest grid point and the offset along the grid,
// and their ink is the mean over what they cover (`radius`, per splat, when given): a splat a
// centimetre wide over a thin line takes a little of it, not all. The body is then darkened there
// as well as covered with ink splats, so whichever of the two is in front, the skin shows the ink.
// Returns {index, alpha, rgb} for the splats with ink over them.
export function inkUnder(grid, centres, img, reach, radius = null) {
  const { nx, ny, positions: P, normals: N } = grid;
  const drawn = new Uint8Array(nx * ny);
  for (let t = 0; t < grid.index.length; t += 6) {
    const a = grid.index[t];
    drawn[a] = drawn[a + 1] = drawn[a + nx] = drawn[a + nx + 1] = 1;
  }
  // the grid's step along the skin, and a hash of its drawn points
  let step = 0, ns = 0;
  for (let k = 0; k < nx * ny; k++) {
    if (!drawn[k] || k % nx === nx - 1 || !drawn[k + 1]) continue;
    step += Math.hypot(P[k * 3 + 3] - P[k * 3], P[k * 3 + 4] - P[k * 3 + 1], P[k * 3 + 5] - P[k * 3 + 2]); ns++;
  }
  const out = { index: new Int32Array(0), alpha: new Float32Array(0), rgb: new Float32Array(0) };
  if (!ns) return out;
  step /= ns;
  const h = Math.max(2 * step, reach), key = (x, y, z) => `${Math.floor(x / h)},${Math.floor(y / h)},${Math.floor(z / h)}`;
  const cells = new Map(), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < nx * ny; k++) {
    if (!drawn[k]) continue;
    const kk = key(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
    (cells.get(kk) || cells.set(kk, []).get(kk)).push(k);
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[k * 3 + a] - h); hi[a] = Math.max(hi[a], P[k * 3 + a] + h); }
  }
  const W = img.width, Hh = img.height, box = Math.max(1, Math.round(W / (nx - 1) / 2));
  const sum = summedInk(img), pxPerUnit = W / ((nx - 1) * step), row = W + 1;
  const boxSum = (x0, y0, x1, y1, c) => sum[c][y1 * row + x1] - sum[c][y0 * row + x1] - sum[c][y1 * row + x0] + sum[c][y0 * row + x0];
  const index = [], alpha = [], rgb = [];
  const n = centres.length / 3;
  for (let i = 0; i < n; i++) {
    const x = centres[i * 3], y = centres[i * 3 + 1], z = centres[i * 3 + 2];
    if (x < lo[0] || x > hi[0] || y < lo[1] || y > hi[1] || z < lo[2] || z > hi[2]) continue;
    const cx = Math.floor(x / h), cy = Math.floor(y / h), cz = Math.floor(z / h);
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const k of cells.get(`${cx + a},${cy + b},${cz + c}`) || []) {
        const dd = (P[k * 3] - x) ** 2 + (P[k * 3 + 1] - y) ** 2 + (P[k * 3 + 2] - z) ** 2;
        if (dd < bd) { bd = dd; best = k; }
      }
    }
    if (best < 0) continue;
    const ox = x - P[best * 3], oy = y - P[best * 3 + 1], oz = z - P[best * 3 + 2];
    const on = ox * N[best * 3] + oy * N[best * 3 + 1] + oz * N[best * 3 + 2];
    const tx = ox - on * N[best * 3], ty = oy - on * N[best * 3 + 1], tz = oz - on * N[best * 3 + 2];
    if (Math.abs(on) > reach || Math.hypot(tx, ty, tz) > step) continue;
    // where along the grid: the offset over the grid's own steps at that point
    const bi = best % nx, bj = (best - bi) / nx;
    const along = (k2, sign) => {
      if (k2 < 0 || k2 >= nx * ny || !drawn[k2]) return 0;
      const ax = sign * (P[k2 * 3] - P[best * 3]), ay = sign * (P[k2 * 3 + 1] - P[best * 3 + 1]), az = sign * (P[k2 * 3 + 2] - P[best * 3 + 2]);
      const l2 = ax * ax + ay * ay + az * az;
      return l2 ? (tx * ax + ty * ay + tz * az) / l2 : 0;
    };
    const fu = bi + (bi < nx - 1 ? along(best + 1, 1) : along(best - 1, -1));
    const fv = bj + (bj < ny - 1 ? along(best + nx, 1) : along(best - nx, -1));
    const u = Math.min(1, Math.max(0, fu / (nx - 1))), v = Math.min(1, Math.max(0, fv / (ny - 1)));
    const px = Math.min(W - 1, Math.floor(u * W)), py = Math.min(Hh - 1, Math.floor((1 - v) * Hh));
    const bx = Math.max(box, radius ? Math.round(radius[i] * pxPerUnit) : 0);
    const x0 = Math.max(0, px - bx), x1 = Math.min(W, px + bx + 1), y0 = Math.max(0, py - bx), y1 = Math.min(Hh, py + bx + 1);
    // (past the image's edge counts as no ink)
    const m = (2 * bx + 1) ** 2, sa = boxSum(x0, y0, x1, y1, 0);
    if (sa / m < 0.04) continue;
    const sr = boxSum(x0, y0, x1, y1, 1), sg = boxSum(x0, y0, x1, y1, 2), sb = boxSum(x0, y0, x1, y1, 3);
    index.push(i); alpha.push(sa / m); rgb.push(sr / sa / 255, sg / sa / 255, sb / sa / 255);
  }
  return { index: Int32Array.from(index), alpha: Float32Array.from(alpha), rgb: Float32Array.from(rgb) };
}

// running sums of an image's ink (alpha, and alpha times red, green, blue), for the mean over any
// box in four lookups; kept with the image
function summedInk(img) {
  if (img._sums) return img._sums;
  const W = img.width, Hh = img.height, d = img.data, row = W + 1;
  const sums = [0, 1, 2, 3].map(() => new Float64Array(row * (Hh + 1)));
  for (let y = 0; y < Hh; y++) {
    const acc = [0, 0, 0, 0];
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4, al = d[q + 3] / 255;
      acc[0] += al; acc[1] += al * d[q]; acc[2] += al * d[q + 1]; acc[3] += al * d[q + 2];
      for (let c = 0; c < 4; c++) sums[c][(y + 1) * row + x + 1] = sums[c][y * row + x + 1] + acc[c];
    }
  }
  Object.defineProperty(img, "_sums", { value: sums });
  return sums;
}
