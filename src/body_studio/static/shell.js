// A drawn room's flat surfaces as smooth sheets (sample_room.py write_shell): walls, floors,
// ceilings and the lawn, drawn as meshes in place of their splats, which up close are soft blobs a
// few centimetres across. Free of three.js, so it can be tested on its own (tests/js/shell.test.mjs);
// house.js makes the mesh.
//
// The file: "BSSH", version, count, then per sheet its corner o and sides du, dv (9 float32, in the
// splat file's coordinates), na, nb (uint32), from version 2 its finish (uint32, in FINISHES) and
// na x nb cells as RGBA bytes, row by row (alpha 0: no cell). Each cell becomes a quad; a vertex
// takes the mean colour of the cells round it, so the colours blend from cell to cell as the
// splats' did, and edges stay sharp.
//
// Made once when a room loads, so drawing it costs no more than flat colours did: the shading in
// corners and under beams (ambient occlusion, baked into the vertices, one value for each side of a
// sheet) and each finish's fine detail (small tiling maps of colour, bumps and shine, made here).

export const SHELL = {
  // a little light from above and one side, as the decor has (a wall facing it lighter): the
  // shading is a fraction of the colour, by how the sheet faces `light` (in the room's metres, y up)
  light: [0.45, 0.8, 0.35], ambient: 0.8,
  // ambient occlusion: rays from points `step` metres apart on each side of a sheet, how many of
  // them hit another sheet within `reach` (a near hit counts more), at most `strength` darker
  ao: { step: 0.25, reach: 1.0, rays: 16, strength: 0.75 },
};

// what a sheet is made of (sample_room.py FINISHES, in the same order); "" none
export const FINISHES = ["", "plaster", "cement", "tile", "wood_x", "wood_z", "sand", "grass", "concrete"];

export function parseShell(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "BSSH") throw new Error("not a shell");
  const version = dv.getUint32(4, true), n = dv.getUint32(8, true), sheets = [];
  let at = 12;
  for (let s = 0; s < n; s++) {
    const f = [];
    for (let i = 0; i < 9; i++) f.push(dv.getFloat32(at + 4 * i, true));
    const na = dv.getUint32(at + 36, true), nb = dv.getUint32(at + 40, true);
    const finish = version >= 2 ? FINISHES[dv.getUint32(at + 44, true)] || "" : "";
    at += version >= 2 ? 48 : 44;
    const cells = new Uint8Array(dv.buffer, dv.byteOffset + at, na * nb * 4);
    at += na * nb * 4;
    sheets.push({ o: f.slice(0, 3), du: f.slice(3, 6), dv: f.slice(6, 9), na, nb, cells, finish });
  }
  return sheets;
}

// sRGB (the splats' colours) to linear, as three.js wants vertex colours
const linear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// The sheets as triangles: { position, color (linear), uv (metres along the room's axes, for the
// finishes' maps), ao (per vertex, its front and its back side's: 1 open, less in corners), index,
// groups } typed arrays; the triangles in groups by finish ({ finish, start, count } into index).
// `up` is the file's way up (sample rooms are y-down: [0, -1, 0]). `lit`: drawn with lights (as the
// decor is), so no shading is put in the colours.
export function shellGeometry(sheets, up = [0, -1, 0], lit = false) {
  let nv = 0, nt = 0;
  for (const s of sheets) {
    nv += (s.na + 1) * (s.nb + 1);
    for (let c = 0; c < s.na * s.nb; c++) if (s.cells[4 * c + 3]) nt += 2;
  }
  const position = new Float32Array(3 * nv), color = new Float32Array(3 * nv), index = new Uint32Array(3 * nt);
  const uv = new Float32Array(2 * nv), ao = new Float32Array(2 * nv);
  const L = unit(SHELL.light), U = unit(up), occ = occlusion(sheets);
  // the finishes in FINISHES' order, each one's triangles together
  const order = sheets.map((s, i) => i).sort((a, b) => FINISHES.indexOf(sheets[a].finish || "") - FINISHES.indexOf(sheets[b].finish || ""));
  const first = [];
  for (let i = 0, v = 0; i < sheets.length; v += (sheets[i].na + 1) * (sheets[i].nb + 1), i++) first.push(v);
  const groups = [];
  let t = 0;
  for (const si of order) {
    const s = sheets[si], v0 = first[si], fin = s.finish || "";
    const { o, du, dv, na, nb, cells } = s;
    // how it faces the light: its normal in the room's metres (the file's up turned to y)
    const n = unit(cross(du, dv)), facing = Math.abs(L[0] * n[0] + L[1] * dot(n, U) + L[2] * n[2]);
    const shade = lit ? 1 : SHELL.ambient + (1 - SHELL.ambient) * facing;
    // the maps lie along the room's axes: on a floor x and z, on a wall along x x and y, along z z and y
    const [ua, va] = sheetAxes(n), side = occ[si];
    for (let k = 0; k <= nb; k++)
      for (let i = 0; i <= na; i++) {
        const v = v0 + k * (na + 1) + i, u = i / na, w = k / nb;
        for (let j = 0; j < 3; j++) position[3 * v + j] = o[j] + u * du[j] + w * dv[j];
        uv[2 * v] = position[3 * v + ua];
        uv[2 * v + 1] = position[3 * v + va] * (va === 1 ? -1 : 1);          // (y-down: up the wall is up the map)
        ao[2 * v] = side.at(0, u, w);
        ao[2 * v + 1] = side.at(1, u, w);
        // the mean of the (up to four) cells that meet here
        let r = 0, g = 0, b = 0, m = 0;
        for (const [ci, ck] of [[i - 1, k - 1], [i, k - 1], [i - 1, k], [i, k]]) {
          if (ci < 0 || ck < 0 || ci >= na || ck >= nb) continue;
          const c = 4 * (ck * na + ci);
          if (!cells[c + 3]) continue;
          r += cells[c]; g += cells[c + 1]; b += cells[c + 2]; m++;
        }
        if (m) {
          color[3 * v] = linear(r / m / 255) * shade;
          color[3 * v + 1] = linear(g / m / 255) * shade;
          color[3 * v + 2] = linear(b / m / 255) * shade;
        }
      }
    const start = t;
    for (let k = 0; k < nb; k++)
      for (let i = 0; i < na; i++) {
        if (!cells[4 * (k * na + i) + 3]) continue;
        const a = v0 + k * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1;
        index.set([a, b, d, a, d, c], t);
        t += 6;
      }
    const g = groups[groups.length - 1];
    if (g && g.finish === fin) g.count += t - start;
    else if (t > start) groups.push({ finish: fin, start, count: t - start });
  }
  return { position, color, uv, ao, index, groups };
}

// The two of x, y, z (0, 1, 2) a sheet with normal n lies along: the maps' u and v
function sheetAxes(n) {
  const a = n.map(Math.abs);
  if (a[1] >= a[0] && a[1] >= a[2]) return [0, 2];
  return a[0] >= a[2] ? [2, 1] : [0, 1];
}

// ---------------------------------------------------------------- ambient occlusion
// For each sheet, its occlusion on a grid of points SHELL.ao.step apart, front (the side du x dv
// points to) and back; at(side, u, w) reads it between the points. A ray from a point counts if
// it meets another sheet where that sheet has a cell, within reach: 1 - t / reach.
export function occlusion(sheets, opt = SHELL.ao) {
  const { step, reach, rays, strength } = opt;
  const P = sheets.map((s) => {
    const n = unit(cross(s.du, s.dv));
    // the dual sides: (q - o) . a is how far along du, . b along dv
    const ea = cross(s.dv, n), eb = cross(n, s.du);
    const a = scale(ea, 1 / dot(s.du, ea)), b = scale(eb, 1 / dot(s.dv, eb));
    const lo = [0, 1, 2].map((j) => Math.min(s.o[j], s.o[j] + s.du[j], s.o[j] + s.dv[j], s.o[j] + s.du[j] + s.dv[j]));
    const hi = [0, 1, 2].map((j) => Math.max(s.o[j], s.o[j] + s.du[j], s.o[j] + s.dv[j], s.o[j] + s.du[j] + s.dv[j]));
    return { s, n, a, b, lo, hi, d: dot(s.o, n) };
  });
  // the sheets by the metre cubes their boxes touch
  const G = Math.max(reach, 0.5), grid = new Map(), key = (x, y, z) => x + "," + y + "," + z;
  P.forEach((p, i) => {
    const l = p.lo.map((v) => Math.floor(v / G)), h = p.hi.map((v) => Math.floor(v / G));
    for (let x = l[0]; x <= h[0]; x++) for (let y = l[1]; y <= h[1]; y++) for (let z = l[2]; z <= h[2]; z++) {
      const k = key(x, y, z);
      (grid.get(k) || grid.set(k, []).get(k)).push(i);
    }
  });
  const dirs = hemisphere(rays), seen = new Int32Array(P.length).fill(-1);
  let stamp = 0;
  return P.map((p, si) => {
    const { s, n } = p, lu = Math.hypot(...s.du), lv = Math.hypot(...s.dv);
    const ma = Math.max(1, Math.ceil(lu / step)), mb = Math.max(1, Math.ceil(lv / step));
    const val = new Float32Array(2 * (ma + 1) * (mb + 1));
    const t1 = unit(s.du), t2 = cross(n, t1);
    // the rays, turned to this sheet (front side; the back's are these with the normal part negated)
    const R = dirs.map((d) => [0, 1, 2].map((j) => d[0] * t1[j] + d[1] * t2[j]).concat([0, 1, 2].map((j) => d[2] * n[j])));
    for (let k = 0; k <= mb; k++)
      for (let i = 0; i <= ma; i++) {
        // (a point on an edge, 2 cm in: a sheet standing on that edge is then beside it, not through it)
        const fu = inset(i / ma, lu), fw = inset(k / mb, lv);
        const qx = s.o[0] + fu * s.du[0] + fw * s.dv[0];
        const qy = s.o[1] + fu * s.du[1] + fw * s.dv[1];
        const qz = s.o[2] + fu * s.du[2] + fw * s.dv[2];
        // the sheets near it
        const near = [], cx = Math.floor(qx / G), cy = Math.floor(qy / G), cz = Math.floor(qz / G);
        stamp++;
        for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++)
          for (const j of grid.get(key(x, y, z)) || []) {
            if (j === si || seen[j] === stamp) continue;
            seen[j] = stamp;
            const o = P[j];
            if (qx < o.lo[0] - reach || qx > o.hi[0] + reach || qy < o.lo[1] - reach || qy > o.hi[1] + reach ||
                qz < o.lo[2] - reach || qz > o.hi[2] + reach) continue;
            near.push(o);
          }
        for (let side = 0; side < 2; side++) {
          const sg = side ? -1 : 1, fx = qx + sg * n[0] * 0.01, fy = qy + sg * n[1] * 0.01, fz = qz + sg * n[2] * 0.01;
          let hit = 0;
          for (const r of R) {
            const rx = r[0] + sg * r[3], ry = r[1] + sg * r[4], rz = r[2] + sg * r[5];
            let best = reach;
            for (const o of near) {
              const on = o.n, den = rx * on[0] + ry * on[1] + rz * on[2];
              if (den < 1e-6 && den > -1e-6) continue;
              const tt = (o.d - (fx * on[0] + fy * on[1] + fz * on[2])) / den;
              if (tt <= 1e-3 || tt >= best) continue;
              const so = o.s.o, ex = fx + tt * rx - so[0], ey = fy + tt * ry - so[1], ez = fz + tt * rz - so[2];
              const u = ex * o.a[0] + ey * o.a[1] + ez * o.a[2];
              if (u < 0 || u > 1) continue;
              const w = ex * o.b[0] + ey * o.b[1] + ez * o.b[2];
              if (w < 0 || w > 1) continue;
              const na = o.s.na, ci = Math.min(na - 1, Math.floor(u * na)), ck = Math.min(o.s.nb - 1, Math.floor(w * o.s.nb));
              if (!o.s.cells[4 * (ck * na + ci) + 3]) continue;
              best = tt;
            }
            if (best < reach) hit += 1 - best / reach;
          }
          val[2 * (k * (ma + 1) + i) + side] = 1 - strength * hit / dirs.length;
        }
      }
    return {
      at(side, u, w) {
        const x = u * ma, y = w * mb, i = Math.min(ma - 1, Math.floor(x)), k = Math.min(mb - 1, Math.floor(y));
        const fx = x - i, fy = y - k, g = (a, b) => val[2 * ((k + b) * (ma + 1) + i + a) + side];
        return (g(0, 0) * (1 - fx) + g(1, 0) * fx) * (1 - fy) + (g(0, 1) * (1 - fx) + g(1, 1) * fx) * fy;
      },
    };
  });
}

const inset = (f, len) => { const e = Math.min(0.02 / len, 0.25); return e + f * (1 - 2 * e); };

// n directions over a hemisphere round z, cosine weighted, spread evenly (a golden-angle spiral)
function hemisphere(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n), a = i * 2.399963;
    out.push([r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - r * r)]);
  }
  return out;
}

// ---------------------------------------------------------------- the finishes' maps
// Each finish as three small square maps that tile: colour (a multiplier near 1: mottling, grain,
// specks), bumps (a normal map) and shine (roughness, in green as three.js reads it); `metres`: how
// far one tile goes. Made from noise here, so ours (no outside images) and nothing to download.
const LOOKS = {
  //            metres, colour change, bump, roughness and its change, and the noise that makes them
  plaster:  { metres: 1.6, tone: 0.06, bump: 1.2, rough: 0.9, rv: 0.06, kind: "cloud" },
  cement:   { metres: 2.0, tone: 0.05, bump: 0.15, rough: 0.45, rv: 0.15, kind: "cloud", pores: 0.003 },   // (polished, smooth)
  tile:     { metres: 1.0, tone: 0.04, bump: 0.5, rough: 0.28, rv: 0.12, kind: "cloud" },
  wood_x:   { metres: 1.2, tone: 0.16, bump: 1.6, rough: 0.6, rv: 0.12, kind: "grain" },
  wood_z:   { metres: 1.2, tone: 0.16, bump: 1.6, rough: 0.6, rv: 0.12, kind: "grain", across: true },
  sand:     { metres: 1.0, tone: 0.12, bump: 4.0, rough: 1.0, rv: 0, kind: "grit" },
  grass:    { metres: 0.6, tone: 0.3, bump: 5.0, rough: 1.0, rv: 0, kind: "blades" },
  concrete: { metres: 2.0, tone: 0.12, bump: 2.2, rough: 0.85, rv: 0.08, kind: "cloud", pores: 0.02 },
};

export function finishMaps(finish, size = 256) {
  const L = LOOKS[finish];
  if (!L) return null;
  const rnd = seeded(FINISHES.indexOf(finish) * 7919 + 17), N = size;
  const h = new Float32Array(N * N), tone = new Float32Array(N * N), shine = new Float32Array(N * N);
  const big = periodicNoise(rnd, 4), mid = periodicNoise(rnd, 16), fine = periodicNoise(rnd, 64), finer = periodicNoise(rnd, 128);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let u = x / N, v = y / N;
      if (L.across) [u, v] = [v, u];
      const i = y * N + x;
      let a, b;
      if (L.kind === "grain") {
        // long fibres along u, wavy, and the rings' light and dark bands
        const warp = 0.03 * mid(u, v * 4);
        const ring = Math.sin((v + warp + 0.2 * big(u * 0.25, v)) * Math.PI * 2 * 18);
        a = 0.6 * ring + 0.4 * fine(u * 0.25, v * 2);
        b = 0.5 * ring + 0.5 * big(u, v);
      } else if (L.kind === "grit") {
        a = 0.6 * finer(u, v) + 0.3 * fine(u, v) + 0.25 * Math.sin((u + 0.15 * big(u, v)) * Math.PI * 2 * 9);  // (wind ripples)
        b = 0.5 * finer(u, v) + 0.5 * mid(u, v);
      } else if (L.kind === "blades") {
        a = 0.7 * finer(u, v) + 0.3 * fine(u, v);
        b = 0.6 * finer(u, v) + 0.4 * mid(u, v);
      } else {
        a = 0.5 * big(u, v) + 0.3 * mid(u, v) + 0.2 * finer(u, v);
        b = 0.6 * big(u, v) + 0.4 * mid(u, v);
      }
      if (L.pores && rnd() < L.pores) a -= 1.5;           // a pit
      h[i] = a;
      tone[i] = b;
      shine[i] = big(u + 0.37, v + 0.61);
    }
  const color = new Uint8Array(4 * N * N), normal = new Uint8Array(4 * N * N), rough = new Uint8Array(4 * N * N);
  let sum = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      // the colour: 1 at its lightest, at most `tone` darker
      const k = 1 - L.tone * (0.5 - 0.5 * clamp(tone[i], -1, 1));
      sum += k;
      color.set([255 * k, 255 * k, 255 * k, 255], 4 * i);
      // bumps: the height's slope, wrapping round the tile's edges
      const dx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const nn = unit([-dx * L.bump * N / 256, -dy * L.bump * N / 256, 1]);
      normal.set([127.5 + 127.5 * nn[0], 127.5 + 127.5 * nn[1], 127.5 + 127.5 * nn[2], 255], 4 * i);
      const r = clamp(L.rough + L.rv * shine[i], 0.05, 1);
      rough.set([255, 255 * r, 255, 255], 4 * i);
    }
  return { size: N, metres: L.metres, color, normal, rough, mean: sum / (N * N) };
}

// Smooth noise in -1..1 over the unit square that tiles: `cells` lattice points a side
function periodicNoise(rnd, cells) {
  const g = new Float32Array(cells * cells).map(() => rnd() * 2 - 1);
  const at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
  return (u, v) => {
    const x = u * cells, y = v * cells, i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}
function seeded(s) {
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
