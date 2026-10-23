// A scanned room, for the body to stand in: where it can walk, sit and lean, and what is in the way
// of the camera. Free of three.js like pose.js, so it can be tested on its own (tests/js/room.test.mjs).
// The map comes from room.py (GET /api/room): metres in the room's own frame, x and z along the
// floor, y up from it, and 5 cm cells, each walkable or not, with the height of the highest surface
// in it that has room above (a seat) and of the tallest thing standing in it (a wall).
import { b64bytes } from "./pose.js";

export const ROOM = {
  radius: 0.2,          // m: how far the body keeps from walls and furniture (half its shoulders)
  sitReach: 0.9,        // m: a seat this near (its front) can be sat on
  leanReach: 0.7,       // m: a wall this near can be leant on
  wall: 1.5,            // m: as tall as this, it is a wall
  ceiling: 2.4,         // m: when the scan has none
};

export class RoomMap {
  constructor(map) {
    this.m = map;
    this.cell = map.cell; this.nx = map.nx; this.nz = map.nz; this.x0 = map.x0; this.z0 = map.z0;
    this.walk = b64bytes(map.walk); this.top = b64bytes(map.top); this.tall = b64bytes(map.tall);
    this.seats = map.seats || [];
    this.start = map.start;
    this.ceiling = map.ceiling || ROOM.ceiling;
  }

  _c(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), k = Math.floor((z - this.z0) / this.cell);
    return i >= 0 && k >= 0 && i < this.nx && k < this.nz ? k * this.nx + i : -1;
  }
  free(x, z) { const c = this._c(x, z); return c >= 0 && this.walk[c] === 1 && !(this.blocked && this.blocked(x, z)); }
  tallAt(x, z) { const c = this._c(x, z); return c >= 0 ? this.tall[c] / 100 : 0; }
  topAt(x, z) { const c = this._c(x, z); return c >= 0 ? this.top[c] / 100 : 0; }

  // what was put in the room (decor.js): blocked(x, z) is true where the body can't stand, and
  // more places to sit
  setDecor(blocked, seats = []) { this.blocked = blocked || null; this.decorSeats = seats; }

  // free floor all round (x, z) out to r
  clear(x, z, r = ROOM.radius) {
    const s = this.cell, n = Math.ceil(r / s);
    for (let dk = -n; dk <= n; dk++)
      for (let di = -n; di <= n; di++) {
        const dx = di * s, dz = dk * s;
        if (dx * dx + dz * dz > r * r) continue;
        if (!this.free(x + dx, z + dz)) return false;
      }
    return true;
  }

  // From `from` toward `to` (both [x, z]) as far as free floor goes, sliding along what is in the
  // way: a body walking into a wall at a slant goes along the wall. In steps of half a cell, so
  // nothing thin is walked through.
  move(from, to, r = ROOM.radius) {
    let p = from.slice();
    const d = [to[0] - from[0], to[1] - from[1]], len = Math.hypot(d[0], d[1]);
    if (len < 1e-9) return p;
    // a body that is in the way already (put down there, or the room was resized) may step out
    const stuck = !this.clear(p[0], p[1], r);
    const steps = Math.ceil(len / (0.5 * this.cell));
    for (let s = 1; s <= steps; s++) {
      const dx = d[0] / steps, dz = d[1] / steps;
      if (stuck || this.clear(p[0] + dx, p[1] + dz, r)) { p = [p[0] + dx, p[1] + dz]; continue; }
      if (Math.abs(dx) > 1e-9 && this.clear(p[0] + dx, p[1], r)) { p = [p[0] + dx, p[1]]; continue; }
      if (Math.abs(dz) > 1e-9 && this.clear(p[0], p[1] + dz, r)) { p = [p[0], p[1] + dz]; continue; }
      break;
    }
    return p;
  }

  // the nearest free spot to (x, z), within `reach` (null: none)
  nearestFree(x, z, r = ROOM.radius, reach = 2) {
    if (this.clear(x, z, r)) return [x, z];
    const s = this.cell;
    for (let ring = 1; ring * s <= reach; ring++) {
      let best = null, bd = Infinity;
      for (let dk = -ring; dk <= ring; dk++)
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dk)) !== ring) continue;
          const px = x + di * s, pz = z + dk * s, d = di * di + dk * dk;
          if (d < bd && this.clear(px, pz, r)) { best = [px, pz]; bd = d; }
        }
      if (best) return best;
    }
    return null;
  }

  // The place to sit nearest the body at (x, z): the seat's own spot (where the hips go), height
  // and the way to face, if its front (where the feet go) is within reach.
  seatNear(x, z, reach = ROOM.sitReach) {
    let best = null, bd = reach;
    for (const s of this.decorSeats ? this.seats.concat(this.decorSeats) : this.seats) {
      const fx = s.x + s.dir[0] * 0.35, fz = s.z + s.dir[1] * 0.35, d = Math.hypot(x - fx, z - fz);
      if (d < bd) { best = s; bd = d; }
    }
    return best;
  }

  // The wall nearest (x, z) within reach that a back can go against: the point on its face and the
  // way out of it (toward the body). A wall with something in front of it at the body's height (a
  // TV on its console, a shelf) isn't one: the floor just out from its face has to be free.
  wallNear(x, z, reach = ROOM.leanReach) {
    const s = this.cell, n = Math.ceil(reach / s), cands = [];
    for (let dk = -n; dk <= n; dk++)
      for (let di = -n; di <= n; di++) {
        const px = x + di * s, pz = z + dk * s, d = Math.hypot(di * s, dk * s);
        if (d < reach && d > 1e-9 && this.tallAt(px, pz) >= ROOM.wall) cands.push([d, px, pz]);
      }
    cands.sort((a, b) => a[0] - b[0]);
    for (const [d, px, pz] of cands) {
      const w = this._face(px, pz, x, z);
      // free floor right out from the face, and room there for the back and the heels
      if (w && this.free(w.at[0] + w.n[0] * s, w.at[1] + w.n[1] * s) &&
          this.clear(w.at[0] + w.n[0] * 0.25, w.at[1] + w.n[1] * 0.25, 0.12)) return { ...w, dist: d };
    }
    return null;
  }

  // the face of the wall at (px, pz) and the way out of it, seen from (x, z)
  _face(px, pz, x, z) {
    const s = this.cell;
    // the way out: from the wall cells round that point to the free ones
    let ox = 0, oz = 0;
    for (let dk = -3; dk <= 3; dk++)
      for (let di = -3; di <= 3; di++) {
        const qx = px + di * s, qz = pz + dk * s;
        const w = this.tallAt(qx, qz) >= ROOM.wall ? -1 : this.free(qx, qz) ? 1 : 0;
        ox += w * di; oz += w * dk;
      }
    let L = Math.hypot(ox, oz);
    if (L < 1e-6) { ox = x - px; oz = z - pz; L = Math.hypot(ox, oz) || 1; }
    const nrm = [ox / L, oz / L];
    if (nrm[0] * (x - px) + nrm[1] * (z - pz) <= 0) return null;          // its back, seen from the body
    // the wall's face: the last wall cell along the way out
    let face = [px, pz];
    for (let k = 1; k <= 8; k++) {
      const p = [px + nrm[0] * k * s * 0.5, pz + nrm[1] * k * s * 0.5];
      if (this.tallAt(p[0], p[1]) < ROOM.wall) break;
      face = p;
    }
    return { at: [face[0] + nrm[0] * 0.5 * s, face[1] + nrm[1] * 0.5 * s], n: nrm };
  }

  // How much of the way from `target` to `eye` (both [x, y, z]) is clear of walls, furniture and
  // the ceiling: 1 if the eye sees the target, less if something is in between (0..1).
  sight(target, eye) {
    const d = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return 1;
    const steps = Math.ceil(len / (0.5 * this.cell)), top = this.ceiling - 0.1;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps, x = target[0] + d[0] * f, y = target[1] + d[1] * f, z = target[2] + d[2] * f;
      const c = this._c(x, z);
      if (y >= top || y <= 0.02 || c < 0) return (s - 1) / steps;
      if (!this.walk[c] && this.tall[c] / 100 >= y) return (s - 1) / steps;
    }
    return 1;
  }

  // the way from the start with the most free floor ahead: where the body faces at first ([x, z])
  openWay(from = this.start, r = ROOM.radius) {
    let best = [0, 1], bd = -1;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI, d = [Math.cos(a), Math.sin(a)];
      let t = 0;
      while (t < 8 && this.clear(from[0] + d[0] * t, from[1] + d[1] * t, r)) t += this.cell;
      if (t > bd + 1e-9) { best = d; bd = t; }
    }
    return best;
  }
}

// Where the room is around the body: its free floor at `start` under the body's feet as scanned,
// and `ahead` (a way along the room's floor, [x, z]) the way the body faces. k: the body's units in
// a metre (its height in its units over its height in metres), so the room is to the body's
// scale. Turns places and ways between the map's metres and the body's coordinates (rig.js's PLY
// coordinates, where Walker.pos lives), and gives the matrix that puts the room's own splats there.
export class Placement {
  constructor(rig, map, k, ahead = null, start = null) {
    const fr = rig.frame, v = (a) => a.slice();
    this.L = v(fr.left); this.U = v(fr.up); this.F = v(fr.front); this.o = v(fr.origin);
    this.k = k; this.map = map;
    this.start = (start || map.start).slice();
    const a = ahead || [0, 1], n = Math.hypot(a[0], a[1]) || 1;
    this.a = [a[0] / n, a[1] / n];
    this.m = [this.a[1], -this.a[0]];                 // the map's way to the body's left
  }
  // [x, y, z] in the map's metres -> the body's coordinates
  toBody(p) {
    const hx = p[0] - this.start[0], hz = p[2] - this.start[1];
    const lat = hx * this.m[0] + hz * this.m[1], along = hx * this.a[0] + hz * this.a[1], k = this.k;
    return [0, 1, 2].map((i) => this.o[i] + k * (this.L[i] * lat + this.U[i] * p[1] + this.F[i] * along));
  }
  toMap(b) {
    const d = [0, 1, 2].map((i) => (b[i] - this.o[i]) / this.k);
    const dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
    const lat = dot(d, this.L), along = dot(d, this.F);
    return [this.start[0] + this.a[0] * along + this.m[0] * lat, dot(d, this.U),
            this.start[1] + this.a[1] * along + this.m[1] * lat];
  }
  // a way along the floor [x, z] -> the body's coordinates, and back
  wayToBody(w) { return [0, 1, 2].map((i) => this.L[i] * (w[0] * this.m[0] + w[1] * this.m[1]) + this.F[i] * (w[0] * this.a[0] + w[1] * this.a[1])); }
  wayToMap(b) {
    const dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2], lat = dot(b, this.L), along = dot(b, this.F);
    return [this.a[0] * along + this.m[0] * lat, this.a[1] * along + this.m[1] * lat];
  }
  // the room's PLY coordinates -> the body's: a 4x4 matrix, column by column (three.js Matrix4.fromArray)
  plyMatrix(frame = this.map.m.frame) {
    const mpu = frame.metres, X = frame.x, Y = frame.up, Z = frame.z;
    // the map's metres -> the body's: C (columns: the map's x, y, z in the body's coordinates)
    const cx = [0, 1, 2].map((i) => this.L[i] * this.m[0] + this.F[i] * this.a[0]);
    const cz = [0, 1, 2].map((i) => this.L[i] * this.m[1] + this.F[i] * this.a[1]);
    const C = [cx, this.U, cz], k = this.k;
    const out = new Array(16).fill(0);
    for (let col = 0; col < 3; col++)                 // A = k C M, M's rows X, Y, Z times mpu
      for (let row = 0; row < 3; row++)
        out[col * 4 + row] = k * mpu * (C[0][row] * X[col] + C[1][row] * Y[col] + C[2][row] * Z[col]);
    const m0 = [-this.start[0], -frame.floor * mpu, -this.start[1]];
    for (let row = 0; row < 3; row++) out[12 + row] = this.o[row] + k * (C[0][row] * m0[0] + C[1][row] * m0[1] + C[2][row] * m0[2]);
    out[15] = 1;
    return out;
  }
}

// ---------------------------------------------------------------- first person
// Seeing the room through the body's eyes (house.js, V): the eye between the head joint and the top
// of the head, a little in front of the face so the head stays behind the camera; the look turned
// `yaw` about up from `ahead` (the way the body faces) and tilted `pitch` up, both in radians.
// Everything in the body's coordinates; H the body's height. -> { eye, look } (look: 1 H ahead).
export const EYE = { up: 0.55, ahead: 0.07, pitch: 1.4 };   // of head to top, of H, the most it tilts
export function eyeView(head, top, ahead, up, yaw, pitch, H) {
  const u = unit(up), f0 = unit(sub(ahead, scale(u, dot(ahead, u))));
  const side = cross(u, f0);
  const f = add(scale(f0, Math.cos(yaw)), scale(side, Math.sin(yaw)));
  const p = Math.max(-EYE.pitch, Math.min(EYE.pitch, pitch));
  const dir = add(scale(f, Math.cos(p)), scale(u, Math.sin(p)));
  const eye = add(add(head, scale(sub(top, head), EYE.up)), scale(f, EYE.ahead * H));
  return { eye, look: add(eye, scale(dir, H)), dir };
}
// a drag of (dx, dy) screen pixels turns the look as if the room were held and pulled (as the
// orbit does): dragged right, the look turns left; dragged down, it tilts up. A full width is
// about half a turn. (yaw grows to the left: side = up x ahead.)
export function lookBy(yaw, pitch, dx, dy, width) {
  const k = Math.PI / Math.max(1, width);
  return [yaw + dx * k, Math.max(-EYE.pitch, Math.min(EYE.pitch, pitch + dy * k))];
}
// From above: the camera high over the body, behind it, looking down at a slant onto it, high
// enough to take in the room round it; the room's splats over `cut` metres are not drawn (house.js)
// and the orbit never tips under `polar` from straight down. `at` the body's place [x, z] and
// `face` its way on the map, `box` the map's size [x, z], in metres. -> { eye, look, height }
export const SKY = { cut: 2.4, tilt: 0.5, polar: 1.15, low: 6, high: 28, reach: 0.35 };
export function skyView(at, face, box) {
  const n = Math.hypot(face[0], face[1]) || 1, f = [face[0] / n, face[1] / n];
  const height = Math.max(SKY.low, Math.min(SKY.high, SKY.reach * Math.max(box[0], box[1])));
  const back = height * Math.tan(SKY.tilt);
  return { eye: [at[0] - f[0] * back, height, at[1] - f[1] * back], look: [at[0], 0, at[1]], height };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return scale(a, 1 / l); };
