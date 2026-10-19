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
  return { ...d, verts: f32(d.verts), tris: i32(d.tris), tuv: i32(d.tuv), uv: f32(d.uv), delete: i32(d.delete) };
}

// The fitted base mesh's skin vertices in the PLY's coordinates (fit.py keeps them in body
// coordinates, with the body's frame).
export function fitSkin(fit) {
  const v = f32(fit.verts), n = fit.n_body, fr = fit.frame, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++)
      out[i * 3 + k] = fr.origin[k] + fr.left[k] * v[i * 3] + fr.up[k] * v[i * 3 + 1] + fr.front[k] * v[i * 3 + 2];
  }
  return out;
}

const R2 = [0.7548776662466927, 0.5698402909980532];     // a low-discrepancy sequence (Roberts' R2)

// Splats for an item: about one per `spacing` squared of its surface, spread evenly over each
// triangle, coloured from the texture (tex: {width, height, data: RGBA bytes}). Parts of the
// texture that are see-through (hair cards) get no splats. Each splat is a flat disc in the
// triangle's plane, lit a little from above and in front so folds and the underside of the
// arms read. `frame` is the body's (rig.frame): the light comes from its up and front.
export function itemSplats(item, tex, spacing, frame) {
  const V = item.verts, T = item.tris, TU = item.tuv, UV = item.uv;
  const light = v3.unit(v3.add(v3.scale(frame.up, 0.55), v3.scale(frame.front, 0.85)));
  const centres = [], quats = [], colours = [], opacity = [];
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
      if (item.alpha && alpha < 0.5) continue;
      centres.push(pa[0] + r1 * e1[0] + r2 * e2[0], pa[1] + r1 * e1[1] + r2 * e2[1], pa[2] + r1 * e1[2] + r2 * e2[2]);
      quats.push(...rot);
      colours.push(Math.min(1, tex.data[k] / 255 * shade), Math.min(1, tex.data[k + 1] / 255 * shade), Math.min(1, tex.data[k + 2] / 255 * shade));
      opacity.push(item.alpha ? 0.85 * alpha : 1);
    }
  }
  return { n: opacity.length, centres: Float32Array.from(centres), quats: Float32Array.from(quats),
           colours: Float32Array.from(colours), opacity: Float32Array.from(opacity),
           scale: [0.62 * spacing, 0.62 * spacing, 0.08 * spacing] };
}

// For every splat of the body, the skin vertex of the fitted base mesh nearest to it (-1 when
// none is within `reach`), so the splats under an item can be hidden while it is worn.
export class SkinCover {
  constructor(skin, centres, reach) {
    const nv = skin.length / 3, key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    const grid = new Map();
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

  // the body's splats under the worn items (each item's list of skin vertices it covers)
  covered(deleteLists) {
    const mask = new Uint8Array(this.nv);
    for (const list of deleteLists) for (const i of list) if (i < this.nv) mask[i] = 1;
    const out = [];
    this.nearest.forEach((v, s) => { if (v >= 0 && mask[v]) out.push(s); });
    return out;
  }
}
