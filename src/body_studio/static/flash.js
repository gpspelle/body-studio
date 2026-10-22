// The tattoo studio's maths, free of three.js so it can be tested on its own
// (tests/js/flash.test.mjs): the designs hung on the flash wall, where the body goes to be tattooed
// (lying on the bed face up or down, or in the chair with an arm on its rest) and the camera's
// views (the artist's, close over the tattoo; the mirror's). The page side is parlour.js; the
// studio is drawn by sample_studio.py, whose fixtures (room.py's map, in metres) say where its
// furniture is. Design: docs/tattoo.md.
import { v3 } from "./pose.js";

// The starter flash: line art drawn for this app (CC0, static/flash/), each named in i18n.js
// (flash.<id>). A design picked from the wall is laid on the body like any image.
export const STARTERS = ["rose", "swallow", "anchor", "heart", "dagger", "snake", "moth", "mandala",
                         "geometric", "wave", "sun", "lightning"];
export const starterUrl = (id) => `/static/flash/${id}.svg`;

// sizes in metres: a sheet of flash (a little taller than wide), the gap round it, the biggest one
export const FLASH = { aspect: 0.78, gap: 0.06, max: 0.42 };

// n sheets on the wall's face (wall: { centre, normal, right, width, height }, map metres, y up), in
// rows and columns as big as fit, centred, filled row by row from the top left: per sheet its
// centre (a little out from the wall), the way across it (right), up, its width and height
export function sheetLayout(wall, n) {
  if (!n) return [];
  let best = null;
  for (let rows = 1; rows <= Math.min(n, 6); rows++) {
    const cols = Math.ceil(n / rows);
    const h = Math.min(FLASH.max, (wall.height - FLASH.gap * (rows + 1)) / rows, (wall.width - FLASH.gap * (cols + 1)) / cols / FLASH.aspect);
    if (h > 0 && (!best || h > best.h + 1e-9)) best = { rows, cols, h };
  }
  if (!best) return [];
  const { rows, cols, h } = best, w = h * FLASH.aspect, up = [0, 1, 0], right = v3.unit(wall.right);
  const out = [], out0 = v3.add(wall.centre, v3.scale(v3.unit(wall.normal), 0.006));
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;            // the last row is centred too
    const x = (c - (inRow - 1) / 2) * (w + FLASH.gap), y = ((rows - 1) / 2 - r) * (h + FLASH.gap);
    out.push({ centre: v3.add(out0, v3.add(v3.scale(right, x), v3.scale(up, y))), right, up, w, h });
  }
  return out;
}

// Where a tattoo is made, from where it is on the body (spot: { bone, normal, along }: the bone
// or region it was laid on, the skin's outward normal at rest and how far up the trunk it is,
// 0 at the hips to 1 at the neck; front, left: the body's at rest):
//   - an arm (shoulder, elbow, wrist): in the chair, that arm on its rest;
//   - the head, the neck, the collarbones and the upper chest: in the chair, leaning back;
//   - the back of the trunk or of a leg: lying face down on the bed;
//   - the front of the belly, the hips or a leg: lying face up;
//   - the ribs and the flank: lying face up with that arm up over the head.
export function stationFor(spot, front, left) {
  const b = spot.bone || "";
  const m = b.match(/^(shoulder|elbow|wrist)_(l|r)$/);
  if (m) return { kind: "chair", arm: m[2] };
  if (/^(head|neck|clavicle_[lr])$/.test(b)) return { kind: "chair", arm: null };
  const f = spot.normal ? v3.dot(spot.normal, front) : 1, s = spot.normal ? v3.dot(spot.normal, left) : 0;
  if (/^(hip|knee|ankle)_[lr]$|^leg_[lr]$/.test(b)) return { kind: "lie", face: f < 0 ? "down" : "up", raise: null };
  // the trunk (pelvis, spine, chest or the trunk's region)
  if (f < -0.3) return { kind: "lie", face: "down", raise: null };
  if (Math.abs(s) > 0.75 && Math.abs(f) < 0.6) return { kind: "lie", face: "up", raise: s > 0 ? "l" : "r" };
  if (f > 0.3 && (spot.along ?? 0) > 0.62) return { kind: "chair", arm: null };
  return { kind: "lie", face: "up", raise: null };
}

// how far up the trunk a point at rest is: 0 at the pelvis, 1 at the neck (joints: rig joints by name)
export function alongTrunk(p, pelvis, neck) {
  const ax = v3.sub(neck, pelvis), l2 = v3.dot(ax, ax);
  return l2 > 0 ? v3.dot(v3.sub(p, pelvis), ax) / l2 : 0;
}

// The outward normal of a laid tattoo at its middle, from its grid of points (P: x, y, z per point,
// nx across; c: the middle point's index; valid: which points are on the skin) and a point inside
// the body under it (inside), so it points away from that
export function gridNormal(P, nx, c, valid, inside) {
  const at = (k) => (k >= 0 && k < valid.length && valid[k] ? [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]] : null);
  const mid = at(c);
  if (!mid) return null;
  for (const s of [2, 1]) {
    const a = at(c - s), b = at(c + s), d = at(c - s * nx), u = at(c + s * nx);
    const across = a && b ? v3.sub(b, a) : a ? v3.sub(mid, a) : b ? v3.sub(b, mid) : null;
    const along = d && u ? v3.sub(u, d) : d ? v3.sub(mid, d) : u ? v3.sub(u, mid) : null;
    if (!across || !along) continue;
    let n = v3.unit(v3.cross(across, along));
    if (v3.dot(n, v3.sub(mid, inside)) < 0) n = v3.scale(n, -1);
    return n;
  }
  return null;
}

// the point of the skeleton's bones (segments [a, b] of joint positions) nearest p
export function nearestOnBones(p, segs) {
  let best = null, bd = Infinity;
  for (const [a, b] of segs) {
    const e = v3.sub(b, a), t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), e) / (v3.dot(e, e) || 1e-12)));
    const x = v3.add(a, v3.scale(e, t)), d = v3.len(v3.sub(p, x));
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}

// The artist's view: close over the tattoo (centre, normal: where it is now and the way its skin
// faces), from a little toward the head and the light (up), at `dist`; and where it looks
export function artistView(centre, normal, up, dist) {
  const n = v3.unit(normal), side = v3.sub(up, v3.scale(n, v3.dot(up, n)));
  const lift = v3.len(side) > 1e-6 ? v3.scale(v3.unit(side), 0.35) : [0, 0, 0];
  return { eye: v3.add(centre, v3.scale(v3.unit(v3.add(n, lift)), dist)), target: centre.slice() };
}

// The mirror's view: from the mirror's face (mirror: { centre, normal, width, height }, map
// metres) at the height of what it looks at (target), as far along the mirror as it can toward it,
// a step out of the glass; the picture is then drawn mirrored
export function mirrorView(mirror, target) {
  const n = v3.unit(mirror.normal), across = v3.unit(v3.cross([0, 1, 0], n));
  const d = v3.sub(target, mirror.centre);
  const a = Math.max(-0.4 * mirror.width, Math.min(0.4 * mirror.width, v3.dot(d, across)));
  const y = Math.max(-0.4 * mirror.height, Math.min(0.4 * mirror.height, d[1]));
  return { eye: v3.add(mirror.centre, v3.add(v3.add(v3.scale(across, a), [0, y, 0]), v3.scale(n, 0.05))), target: target.slice() };
}

// whether the body (at, on the floor, map metres) is near enough to the bed or the chair to go
// there with F: within `reach` of the bed's sides or of the chair's front
export function nearStation(fx, at, reach = 1.0) {
  const out = [];
  if (fx.bed) {
    const h = v3.unit([fx.bed.head[0], 0, fx.bed.head[2]]), s = [-h[2], 0, h[0]];
    const d = [at[0] - fx.bed.at[0], 0, at[1] - fx.bed.at[2]];
    const along = Math.abs(v3.dot(d, h)) - fx.bed.length / 2, across = Math.abs(v3.dot(d, s)) - fx.bed.width / 2;
    if (Math.hypot(Math.max(0, along), Math.max(0, across)) < reach) out.push("bed");
  }
  if (fx.chair && Math.hypot(at[0] - fx.chair.at[0], at[1] - fx.chair.at[2]) < reach + 0.4) out.push("chair");
  return out;
}
