// Wardrobe maths for the page, free of three.js so it can be tested on its own
// (tests/js/dress.test.mjs, run by tests/unit/test_dress_js.py). An item comes from
// GET /api/wardrobe/<id>?body=… already fitted to the body (wardrobe.py): its vertices in the
// PLY's coordinates, its triangles and UVs. Here it becomes splats (flat discs lying on its
// surface, coloured from its texture), and the body's own splats under it are found so they can
// be hidden. Design: docs/wardrobe.md.
import { b64bytes, q, v3 } from "./pose.js";

export const f32 = (s) => new Float32Array(b64bytes(s).buffer);
export const i32 = (s) => new Int32Array(b64bytes(s).buffer);

export function decodeItem(d) {
  return { ...d, verts: f32(d.verts), anchors: f32(d.anchors), tris: i32(d.tris), tuv: i32(d.tuv), uv: f32(d.uv),
           delete: i32(d.delete) };
}

// The fitted base mesh's skin vertices in the PLY's coordinates (fit.py keeps them in body
// coordinates, with the body's frame), and their outward normals.
export function fitSkin(fit) {
  return toModel(f32(fit.verts), fit.n_body, fit.frame, fit.frame.origin);
}
export function fitNormals(fit) {
  return toModel(f32(fit.normals), fit.n_body, fit.frame, [0, 0, 0]);
}
function toModel(v, n, fr, origin) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++)
      out[i * 3 + k] = origin[k] + fr.left[k] * v[i * 3] + fr.up[k] * v[i * 3 + 1] + fr.front[k] * v[i * 3 + 2];
  }
  return out;
}

// The skin vertices an item covers: those whose outward normal meets one of the item's triangles
// within `reach` (or just behind the skin, where the item is tight). MakeHuman's own list (the
// item's "delete" vertices) leaves out skin a loose item hangs over, like the thighs under a skirt,
// and the scan's skin there would show through it.
export function skinUnder(item, skin, normals, reach) {
  const V = item.verts, T = item.tris, cell = reach, grid = new Map();
  const key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  for (let t = 0; t < T.length / 3; t++) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) {
      const c = V[T[t * 3 + m] * 3 + k];
      lo[k] = Math.min(lo[k], c); hi[k] = Math.max(hi[k], c);
    }
    for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x++)
      for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y++)
        for (let z = Math.floor(lo[2] / cell); z <= Math.floor(hi[2] / cell); z++) {
          const k = key(x, y, z);
          (grid.get(k) || grid.set(k, []).get(k)).push(t);
        }
  }
  const out = [], seen = new Set();
  for (let i = 0; i < skin.length / 3; i++) {
    const o = [skin[i * 3], skin[i * 3 + 1], skin[i * 3 + 2]], d = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    seen.clear();
    let hit = false;
    // the cells along the ray, from a little behind the skin to `reach` out
    for (let s = -0.25; s <= 1 && !hit; s += 0.25) {
      const p = v3.add(o, v3.scale(d, s * reach));
      for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) for (let dz = -1; dz <= 1 && !hit; dz++) {
        const list = grid.get(key(Math.floor(p[0] / cell) + dx, Math.floor(p[1] / cell) + dy, Math.floor(p[2] / cell) + dz));
        if (!list) continue;
        for (const t of list) {
          if (seen.has(t)) continue;
          seen.add(t);
          const r = rayTriangle(o, d, V, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
          if (r !== null && r >= -0.25 * reach && r <= reach) { hit = true; break; }
        }
      }
    }
    if (hit) out.push(i);
  }
  return Int32Array.from(out);
}

// where the line o + r·d meets the triangle (r, or null) (Möller–Trumbore)
function rayTriangle(o, d, V, a, b, c) {
  const pa = [V[a * 3], V[a * 3 + 1], V[a * 3 + 2]];
  const e1 = v3.sub([V[b * 3], V[b * 3 + 1], V[b * 3 + 2]], pa), e2 = v3.sub([V[c * 3], V[c * 3 + 1], V[c * 3 + 2]], pa);
  const p = v3.cross(d, e2), det = v3.dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const tv = v3.sub(o, pa), u = v3.dot(tv, p) / det;
  if (u < 0 || u > 1) return null;
  const q = v3.cross(tv, e1), w = v3.dot(d, q) / det;
  if (w < 0 || u + w > 1) return null;
  return v3.dot(e2, q) / det;
}

const R2 = [0.7548776662466927, 0.5698402909980532];     // a low-discrepancy sequence (Roberts' R2)

// Splats for an item: about one per `spacing` squared of its surface, spread evenly over each
// triangle, coloured from the texture (tex: {width, height, data: RGBA bytes}). Parts of the
// texture that are see-through (hair cards) get no splats. Each splat is a flat disc in the
// triangle's plane, lit a little from above and in front so folds and the underside of the
// arms read. `frame` is the body's (rig.frame): the light comes from its up and front.
export function itemSplats(item, tex, spacing, frame) {
  const V = item.verts, A = item.anchors || item.verts, T = item.tris, TU = item.tuv, UV = item.uv;
  const light = v3.unit(v3.add(v3.scale(frame.up, 0.55), v3.scale(frame.front, 0.85)));
  const centres = [], anchors = [], quats = [], colours = [], opacity = [], tri = [], bary = [];
  let carry = 0;
  for (let t = 0; t < T.length / 3; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const pa = [V[a * 3], V[a * 3 + 1], V[a * 3 + 2]], pb = [V[b * 3], V[b * 3 + 1], V[b * 3 + 2]], pc = [V[c * 3], V[c * 3 + 1], V[c * 3 + 2]];
    const e1 = v3.sub(pb, pa), e2 = v3.sub(pc, pa);
    const cr = v3.cross(e1, e2), area = v3.len(cr) / 2;
    if (area <= 0) continue;
    let n = v3.scale(cr, 0.5 / area);
    // outward: away from the body's vertical axis (a garment's triangles face either way)
    const rel = v3.sub(pa, frame.origin);
    const radial = v3.sub(rel, v3.scale(frame.up, v3.dot(rel, frame.up)));
    if (v3.dot(n, radial) < 0) n = v3.scale(n, -1);
    const shade = 0.74 + 0.3 * Math.max(0, v3.dot(n, light)) - 0.08 * Math.max(0, -v3.dot(n, frame.up));
    const rot = q.between([0, 0, 1], n);
    carry += area / (spacing * spacing);
    const count = Math.floor(carry);
    carry -= count;
    const ua = TU[t * 3], ub = TU[t * 3 + 1], uc = TU[t * 3 + 2];
    for (let s = 0; s < count; s++) {
      let r1 = ((t * 0.618034 + (s + 0.5) * R2[0]) % 1), r2 = ((t * 0.414214 + (s + 0.5) * R2[1]) % 1);
      if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      const u = UV[ua * 2] + r1 * (UV[ub * 2] - UV[ua * 2]) + r2 * (UV[uc * 2] - UV[ua * 2]);
      const w = UV[ua * 2 + 1] + r1 * (UV[ub * 2 + 1] - UV[ua * 2 + 1]) + r2 * (UV[uc * 2 + 1] - UV[ua * 2 + 1]);
      const px = Math.min(tex.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * tex.width)));
      const py = Math.min(tex.height - 1, Math.max(0, Math.floor((1 - (w - Math.floor(w))) * tex.height)));
      const k = (py * tex.width + px) * 4;
      const alpha = tex.data[k + 3] / 255;
      if (item.alpha && alpha < 0.2) continue;
      centres.push(pa[0] + r1 * e1[0] + r2 * e2[0], pa[1] + r1 * e1[1] + r2 * e2[1], pa[2] + r1 * e1[2] + r2 * e2[2]);
      for (let k = 0; k < 3; k++) anchors.push(A[a * 3 + k] + r1 * (A[b * 3 + k] - A[a * 3 + k]) + r2 * (A[c * 3 + k] - A[a * 3 + k]));
      tri.push(t); bary.push(r1, r2);
      quats.push(...rot);
      colours.push(Math.min(1, tex.data[k] / 255 * shade), Math.min(1, tex.data[k + 1] / 255 * shade), Math.min(1, tex.data[k + 2] / 255 * shade));
      opacity.push(item.alpha ? 0.95 * alpha : 1);
    }
  }
  return { n: opacity.length, centres: Float32Array.from(centres), anchors: Float32Array.from(anchors),
           tri: Int32Array.from(tri), bary: Float32Array.from(bary),
           quats: Float32Array.from(quats),
           colours: Float32Array.from(colours), opacity: Float32Array.from(opacity),
           scale: [0.62 * spacing, 0.62 * spacing, 0.08 * spacing] };
}

// Skin weights for an item's splats (four bones and weights in 0..255 adding to 255 per splat).
// Each vertex of the item takes the weights of the skin it hangs from (`weightAt(x, y, z, bones,
// weights)` at its anchor); the weights are then smoothed over the item's own surface, and each
// splat blends those of its triangle's corners. Cloth doesn't shear the way skin does where it
// passes from one bone to the next: under a raised arm, splats that each copied the skin under
// them pulled apart into flakes, the sleeve going with the arm and the side with the chest.
export function itemWeights(item, s, weightAt, numBones, smooth = SMOOTH_STEPS) {
  const nv = item.anchors.length / 3, T = item.tris, A = item.anchors;
  let W = new Float32Array(nv * numBones), next = new Float32Array(nv * numBones);
  const bones = new Uint8Array(4), weights = new Uint8Array(4);
  for (let v = 0; v < nv; v++) {
    weightAt(A[v * 3], A[v * 3 + 1], A[v * 3 + 2], bones, weights);
    for (let m = 0; m < 4; m++) if (weights[m]) W[v * numBones + bones[m]] += weights[m] / 255;
  }
  const nbrs = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < T.length / 3; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    nbrs[a].add(b).add(c); nbrs[b].add(a).add(c); nbrs[c].add(a).add(b);
  }
  for (let it = 0; it < smooth; it++) {
    for (let v = 0; v < nv; v++) {
      const o = v * numBones, k = nbrs[v].size;
      for (let j = 0; j < numBones; j++) next[o + j] = k ? 0.5 * W[o + j] : W[o + j];
      if (!k) continue;
      for (const u of nbrs[v]) for (let j = 0; j < numBones; j++) next[o + j] += 0.5 * W[u * numBones + j] / k;
    }
    [W, next] = [next, W];
  }
  const outB = new Uint8Array(s.n * 4), outW = new Uint8Array(s.n * 4), blend = new Float32Array(numBones);
  for (let i = 0; i < s.n; i++) {
    const t = s.tri[i], r1 = s.bary[i * 2], r2 = s.bary[i * 2 + 1];
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    for (let j = 0; j < numBones; j++)
      blend[j] = (1 - r1 - r2) * W[a * numBones + j] + r1 * W[b * numBones + j] + r2 * W[c * numBones + j];
    const top = [...blend.keys()].sort((x, y) => blend[y] - blend[x]).slice(0, 4).filter((j) => blend[j] > 0);
    const sum = top.reduce((acc, j) => acc + blend[j], 0) || 1;
    let left = 255;
    top.forEach((j, m) => {
      const w = m === top.length - 1 ? left : Math.floor(255 * blend[j] / sum);
      outB[i * 4 + m] = j; outW[i * 4 + m] = w; left -= w;
    });
    if (!top.length) outW[i * 4] = 255;
  }
  return { bones: outB, weights: outW };
}
const SMOOTH_STEPS = 3;

// For every splat of the body, the skin vertex of the fitted base mesh nearest to it (-1 when
// none is within `reach`), so the splats under an item can be hidden while it is worn.
export class SkinCover {
  constructor(skin, centres, reach) {
    const nv = skin.length / 3, key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    const grid = new Map();
    this.skin = skin; this.grid = grid; this.key = key; this.reach = reach;
    for (let i = 0; i < nv; i++) {
      const k = key(Math.floor(skin[i * 3] / reach), Math.floor(skin[i * 3 + 1] / reach), Math.floor(skin[i * 3 + 2] / reach));
      (grid.get(k) || grid.set(k, []).get(k)).push(i);
    }
    const n = centres.length / 3, r2 = reach * reach;
    this.nearest = new Int32Array(n).fill(-1);
    for (let s = 0; s < n; s++) {
      const x = centres[s * 3], y = centres[s * 3 + 1], z = centres[s * 3 + 2];
      const cx = Math.floor(x / reach), cy = Math.floor(y / reach), cz = Math.floor(z / reach);
      let best = -1, bd = r2;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(key(cx + dx, cy + dy, cz + dz));      // (a shared key only adds candidates)
        if (!list) continue;
        for (const i of list) {
          const d = (skin[i * 3] - x) ** 2 + (skin[i * 3 + 1] - y) ** 2 + (skin[i * 3 + 2] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
      this.nearest[s] = best;
    }
    this.nv = nv;
  }

  // the skin vertex nearest a point (-1 when none is within reach)
  nearestSkin(x, y, z) {
    const r = this.reach, skin = this.skin;
    const cx = Math.floor(x / r), cy = Math.floor(y / r), cz = Math.floor(z / r);
    let best = -1, bd = r * r;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.grid.get(this.key(cx + dx, cy + dy, cz + dz));
      if (!list) continue;
      for (const i of list) {
        const d = (skin[i * 3] - x) ** 2 + (skin[i * 3 + 1] - y) ** 2 + (skin[i * 3 + 2] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  // the body's splats under the worn items (each item's list of skin vertices it covers)
  covered(deleteLists) {
    const mask = new Uint8Array(this.nv);
    for (const list of deleteLists) for (const i of list) if (i < this.nv) mask[i] = 1;
    const out = [];
    this.nearest.forEach((v, s) => { if (v >= 0 && mask[v]) out.push(s); });
    return out;
  }
}
