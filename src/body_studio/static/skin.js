// The skin a tattoo is laid on and the ink as splats, for tattoo.js: free of three.js, tested with
// the posing maths (tests/js/pose.test.mjs). Vectors and quaternions are pose.js's.
import { RAD, q, v3 } from "./pose.js";

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
