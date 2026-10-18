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
// motion in degrees (AAOS; Soucie et al. 2011); a body whose resting pose lies outside a range
// gets that range widened to include it.
const L = [1, 0, 0], U = [0, 1, 0], F = [0, 0, 1], D = [0, -1, 0];
export const DOF = {
  spine:      { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-25, 50], side: [-25, 25], twist: [-15, 15], labels: ["forward", "side", "twist"] },
  chest:      { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-20, 35], side: [-20, 20], twist: [-35, 35], labels: ["forward", "side", "twist"] },
  neck:       { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-40, 40], side: [-25, 25], twist: [-45, 45], labels: ["forward", "side", "twist"] },
  head:       { n: U, a1: L, a2: F, k: [1, -1, 1],  flex: [-25, 20], side: [-15, 15], twist: [-40, 40], labels: ["forward", "side", "twist"] },
  clavicle_l: { n: L, a1: F, a2: U, k: [1, -1, 0],  flex: [-10, 30], side: [-15, 15], twist: [0, 0],    labels: ["raise", "forward"] },
  shoulder_l: { n: D, a1: L, a2: F, k: [-1, 1, 1],  flex: [-50, 180], side: [-30, 180], twist: [-90, 70], labels: ["forward", "out", "twist"] },
  elbow_l:    { n: D, a1: L, a2: F, k: [-1, 1, 1],  flex: [0, 145], side: [0, 0],    twist: [-80, 80], labels: ["bend", null, "twist"] },
  wrist_l:    { n: D, a1: L, a2: F, k: [-1, 1, 1],  flex: [-70, 80], side: [-30, 20], twist: [0, 0],    labels: ["bend", "side"] },
  hip_l:      { n: D, a1: L, a2: F, k: [-1, 1, 1],  flex: [-20, 120], side: [-25, 45], twist: [-45, 40], labels: ["forward", "out", "twist"] },
  knee_l:     { n: D, a1: L, a2: F, k: [1, 1, 1],   flex: [0, 145], side: [0, 0],    twist: [0, 0],    labels: ["bend"] },
  ankle_l:    { n: F, a1: L, a2: U, k: [-1, 1, -1], flex: [-50, 20], side: [-10, 10], twist: [-15, 30], labels: ["foot", "side", "tilt"] },
};
const MAX_SWING = 175;                          // keeps a swing away from the half-turn where it flips

function defFor(name) {
  if (DOF[name]) return DOF[name];
  if (!name.endsWith("_r")) return null;
  const d = DOF[name.slice(0, -2) + "_l"];
  if (!d) return null;
  // mirror: n is reflected across the midline; a rotation about an axis that the reflection keeps
  // turns the other way, about an axis it reverses (the left axis) the same way
  const keeps = (a) => Math.abs(a[0]) < 0.9;
  return { ...d, n: [-d.n[0], d.n[1], d.n[2]],
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
  constructor(rig) {
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
      const rv = q.toRotvec(q.between(d.n, local));
      const a = { flex: d.k[0] ? v3.dot(rv, d.a1) / RAD / d.k[0] : 0,
                  side: d.k[1] ? v3.dot(rv, d.a2) / RAD / d.k[1] : 0, twist: 0 };
      for (const key of ["flex", "side"]) {      // the scan's own pose is always allowed
        d[key][0] = Math.min(d[key][0], a[key]); d[key][1] = Math.max(d[key][1], a[key]);
      }
      this.restAngles[j] = a;
      this.restA[j] = this.rotation(j, a);
    }
    this.angles = this.restAngles.map((a) => (a ? { ...a } : null));
    this.solve();
  }

  index(name) { return this.names.indexOf(name); }

  // the anatomical rotation of joint j for angles {flex, side, twist}, in its own frame
  rotation(j, a) {
    const d = this.defs[j];
    const swing = q.fromRotvec(v3.add(v3.scale(d.a1, d.k[0] * a.flex * RAD), v3.scale(d.a2, d.k[1] * a.side * RAD)));
    return q.norm(q.mul(swing, q.axisAngle(d.n, d.k[2] * a.twist * RAD)));
  }

  // keep angles inside the joint's range: sideways and forward together stay inside an ellipse
  clamp(j, a) {
    const d = this.defs[j];
    let { flex, side, twist } = a;
    const [f0, f1] = d.flex, [s0, s1] = d.side;
    if (d.hinge) side = this.restAngles[j] ? this.restAngles[j].side : 0;   // a hinge keeps its resting side angle
    else if (f0 <= 0 && f1 >= 0 && s0 <= 0 && s1 >= 0) {
      const rf = flex >= 0 ? f1 : -f0, rs = side >= 0 ? s1 : -s0;
      const e = (rf ? (flex / rf) ** 2 : flex ? Infinity : 0) + (rs ? (side / rs) ** 2 : side ? Infinity : 0);
      if (e > 1 && Number.isFinite(e)) { const k = 1 / Math.sqrt(e); flex *= k; side *= k; }
    }
    flex = Math.min(Math.max(flex, f0), f1);
    side = Math.min(Math.max(side, s0), s1);
    const mag = Math.hypot(flex, side);
    if (mag > MAX_SWING) { flex *= MAX_SWING / mag; side *= MAX_SWING / mag; }
    twist = Math.min(Math.max(twist, d.twist[0]), d.twist[1]);
    return { flex, side, twist };
  }

  set(j, a) {
    if (typeof j === "string") j = this.index(j);
    if (!this.defs[j] || !this.angles[j]) return false;
    this.angles[j] = this.clamp(j, { ...this.angles[j], ...a });
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
      if (p < 0) { this.W[j] = q.norm(delta); this.P[j] = this.rest[j].slice(); continue; }
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
    let flex, side;
    if (d.hinge) {                               // a hinge: the angle about its one axis
      local = v3.unit(v3.sub(local, v3.scale(d.a1, v3.dot(local, d.a1))));
      const ang = Math.atan2(v3.dot(v3.cross(d.n, local), d.a1), v3.dot(d.n, local));
      flex = ang / RAD / d.k[0]; side = this.angles[j].side;
    } else {
      const rv = q.toRotvec(q.between(d.n, local));
      flex = d.k[0] ? v3.dot(rv, d.a1) / RAD / d.k[0] : 0;
      side = d.k[1] ? v3.dot(rv, d.a2) / RAD / d.k[1] : 0;
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
      if (a && (Math.abs(a.flex - r.flex) > 0.01 || Math.abs(a.side - r.side) > 0.01 || Math.abs(a.twist) > 0.01))
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
    this.acc = new Float32Array(256); this.touched = [];
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
    // the 8 voxels around the point; only those on the same part of the body as the nearest one
    // count, so a splat on the inside of one thigh doesn't pick up the other thigh
    const corner = this.corner, frac = this.frac;
    let ref = -1;
    for (let c = 0; c < 8; c++) {
      const i = i0 + (c & 1), j = j0 + ((c >> 1) & 1), k = k0 + ((c >> 2) & 1);
      corner[c] = -1;
      if (i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2]) continue;
      corner[c] = this.lut[(i * n[1] + j) * n[2] + k];
      frac[c] = (c & 1 ? tx : 1 - tx) * ((c >> 1) & 1 ? ty : 1 - ty) * ((c >> 2) & 1 ? tz : 1 - tz);
      if (corner[c] >= 0 && (ref < 0 || frac[c] > frac[ref])) ref = c;
    }
    const acc = this.acc, touched = this.touched;
    touched.length = 0;
    const dom = ref < 0 ? -1 : this.bones[corner[ref] * 4], par = this.parents;
    for (let c = 0; c < 8; c++) {
      const cell = corner[c];
      if (cell < 0 || frac[c] <= 0) continue;
      const b0 = this.bones[cell * 4];
      if (b0 !== dom && par[b0] !== dom && par[dom] !== b0) continue;
      for (let m = 0; m < 4; m++) {
        const w = this.weights[cell * 4 + m];
        if (!w) continue;
        const b = this.bones[cell * 4 + m];
        if (acc[b] === 0) touched.push(b);
        acc[b] += frac[c] * w;
      }
    }
    if (!touched.length) return this.nearestBone(x, y, z, bones, weights, o);
    touched.sort((a, b) => acc[b] - acc[a]);
    const top = touched.slice(0, 4);
    const sum = top.reduce((s, b) => s + acc[b], 0);
    let left = 255;
    for (let m = 0; m < 4; m++) {
      const b = top[m];
      const w = b === undefined ? 0 : (m === top.length - 1 ? left : Math.round(acc[b] / sum * 255));
      bones[o * 4 + m] = b === undefined ? 0 : b;
      weights[o * 4 + m] = w;
      left -= w;
    }
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

// ---------------------------------------------------------------- surface map and tattoos
// Around each bone: the body's radius at each step along the bone (t) and angle (theta), and the
// skin colour there. A tattoo is a grid laid on that surface by arc length, so it keeps its size
// as it wraps around an arm or a leg.
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

  colour(bone, t, theta) {
    const m = this.maps[bone];
    const { ft, fa } = this._cell(m, t, theta);
    const ti = Math.min(Math.max(Math.round(ft), 0), m.nt - 1), ai = Math.round(fa) % m.na;
    const c = (ti * m.na + ai) * 3;
    return [m.rgb[c] / 255, m.rgb[c + 1] / 255, m.rgb[c + 2] / 255];
  }

  point(bone, t, theta, lift = 0) {
    const m = this.maps[bone];
    const r = this.radius(bone, t, theta);
    if (Number.isNaN(r)) return null;
    const out = v3.add(v3.scale(m.e0, Math.cos(theta)), v3.scale(m.e1, Math.sin(theta)));
    return v3.add(v3.add(m.origin, v3.scale(m.axis, t)), v3.scale(out, r + lift));
  }

  // the angle reached by walking arc length s (signed) around the bone from theta0 at height t
  thetaForArc(bone, t, theta0, s) {
    const m = this.maps[bone];
    const dir = s < 0 ? -1 : 1, goal = Math.abs(s), step = (2 * Math.PI) / m.na / 4;
    let th = theta0, acc = 0, r0 = this.radius(bone, t, th);
    if (Number.isNaN(r0)) return NaN;
    for (let i = 0; i < m.na * 4; i++) {
      const th1 = th + dir * step, r1 = this.radius(bone, t, th1);
      if (Number.isNaN(r1)) return NaN;
      const ds = Math.hypot(0.5 * (r0 + r1) * step, r1 - r0);
      if (acc + ds >= goal) return th + dir * step * (goal - acc) / (ds || 1);
      acc += ds; th = th1; r0 = r1;
    }
    return NaN;                                 // more than once around
  }

  // A tattoo as a grid of points on the body (rest pose). tattoo: {bone, t, theta, width, height
  // (PLY units), angle (degrees, turns the image as seen from outside), lift}. Returns positions,
  // texture coordinates, skin colours and triangles (cells with a point off the map are left out).
  wrap(tattoo, nx = 48, ny = 48) {
    const m = this.maps[tattoo.bone];
    const up = v3.dot(m.axis, this.upHint || [0, 1, 0]) >= 0 ? 1 : -1;   // image up: toward the head
    const ca = Math.cos(tattoo.angle * RAD), sa = Math.sin(tattoo.angle * RAD);
    const count = nx * ny;
    const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2), rgb = new Float32Array(count * 3);
    const ok = new Uint8Array(count);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const u = (i / (nx - 1) - 0.5) * tattoo.width, v = (j / (ny - 1) - 0.5) * tattoo.height;
        const s = u * ca - v * sa, w = u * sa + v * ca;          // right, up on the skin
        const t = tattoo.t + up * w;
        const th = this.thetaForArc(tattoo.bone, t, tattoo.theta, up * s);
        uv[k * 2] = i / (nx - 1); uv[k * 2 + 1] = j / (ny - 1);
        if (Number.isNaN(th)) continue;
        const p = this.point(tattoo.bone, t, th, tattoo.lift || 0);
        if (!p) continue;
        pos.set(p, k * 3);
        rgb.set(this.colour(tattoo.bone, t, th), k * 3);
        ok[k] = 1;
      }
    }
    const tris = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        if (ok[a] && ok[b] && ok[c] && ok[d]) tris.push(a, b, d, a, d, c);
      }
    }
    return { positions: pos, uvs: uv, colours: rgb, index: new Uint32Array(tris), valid: ok, nx, ny };
  }
}
