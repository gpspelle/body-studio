// Decor in a room, free of three.js so it can be tested on its own (tests/js/decor.test.mjs, run by
// tests/unit/test_decor_js.py): the starter items' shapes (chairs, tables, an arch, flowers,
// candles...), the meshes made from photos (decor.py packs them), and where things go: on the
// floor or on a table, in a row, round a table, what the body can't walk through and where it can
// sit. Everything is in the room map's metres (room.py): x and z along the floor, y up. An item's
// own shape stands on y = 0 over x = z = 0, its front toward +z; `turn` turns it about y (radians,
// three.js's sense: its front then points along [sin turn, cos turn]). Design: docs/decor.md.
import { b64bytes } from "./pose.js";

export const COLOURS = {
  white: [0.95, 0.95, 0.93], ivory: [0.93, 0.88, 0.78], gold: [0.82, 0.67, 0.36], wood: [0.52, 0.36, 0.22],
  green: [0.33, 0.48, 0.31], blush: [0.92, 0.7, 0.69], black: [0.13, 0.13, 0.13],
};
const LEAF = [0.29, 0.45, 0.27], FLAME = [1.0, 0.78, 0.35], WAX = [0.97, 0.95, 0.88], GLASS = [0.86, 0.9, 0.9];

// ---------------------------------------------------------------- building shapes
// A shape is { p: [x, y, z, ...], c: [r, g, b, ...] (0..1), i: [triangles] }.
function shape() { return { p: [], c: [], i: [] }; }
function vert(s, x, y, z, col) { s.p.push(x, y, z); s.c.push(col[0], col[1], col[2]); return s.p.length / 3 - 1; }
function quad(s, a, b, c, d) { s.i.push(a, b, c, a, c, d); }

function box(s, w, h, d, cx, cy, cz, col) {
  const x = [cx - w / 2, cx + w / 2], y = [cy, cy + h], z = [cz - d / 2, cz + d / 2];
  // each face its own four corners, so the faces stay flat-shaded
  const faces = [
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  ];
  for (const f of faces) {
    const v = f.map(([a, b, c]) => vert(s, x[a], y[b], z[c], col));
    quad(s, ...v);
  }
}

// a cylinder (or a cone: r0 at the bottom, r1 at the top) standing at (cx, cy, cz), with its caps
function cyl(s, r0, r1, h, cx, cy, cz, col, seg = 24) {
  const ring = (r, y) => Array.from({ length: seg }, (_, k) => {
    const a = (k / seg) * 2 * Math.PI;
    return vert(s, cx + r * Math.sin(a), y, cz + r * Math.cos(a), col);
  });
  const lo = ring(r0, cy), hi = ring(r1, cy + h);
  for (let k = 0; k < seg; k++) quad(s, lo[k], lo[(k + 1) % seg], hi[(k + 1) % seg], hi[k]);
  const b = vert(s, cx, cy, cz, col), t = vert(s, cx, cy + h, cz, col);
  const lo2 = ring(r0, cy), hi2 = ring(r1, cy + h);
  for (let k = 0; k < seg; k++) { s.i.push(b, lo2[(k + 1) % seg], lo2[k]); s.i.push(t, hi2[k], hi2[(k + 1) % seg]); }
}

// a rod of radius r from a to b ([x, y, z] each)
function rod(s, a, b, r, col, seg = 10) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1;
  const w = d.map((x) => x / L);
  const t = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [w[1] * t[2] - w[2] * t[1], w[2] * t[0] - w[0] * t[2], w[0] * t[1] - w[1] * t[0]];
  const ul = Math.hypot(...u); u = u.map((x) => x / ul);
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const ring = (o) => Array.from({ length: seg }, (_, k) => {
    const q = (k / seg) * 2 * Math.PI, cs = Math.cos(q) * r, sn = Math.sin(q) * r;
    return vert(s, o[0] + u[0] * cs + v[0] * sn, o[1] + u[1] * cs + v[1] * sn, o[2] + u[2] * cs + v[2] * sn, col);
  });
  const A = ring(a), B = ring(b);
  for (let k = 0; k < seg; k++) quad(s, A[k], B[k], B[(k + 1) % seg], A[(k + 1) % seg]);
}

function ball(s, r, cx, cy, cz, col, seg = 10) {
  const rows = [];
  for (let j = 0; j <= seg / 2; j++) {
    const ph = (j / (seg / 2)) * Math.PI, y = cy + r * Math.cos(ph), rr = r * Math.sin(ph);
    rows.push(Array.from({ length: seg }, (_, k) => {
      const a = (k / seg) * 2 * Math.PI;
      return vert(s, cx + rr * Math.sin(a), y, cz + rr * Math.cos(a), col);
    }));
  }
  for (let j = 0; j < rows.length - 1; j++)
    for (let k = 0; k < seg; k++) quad(s, rows[j][k], rows[j][(k + 1) % seg], rows[j + 1][(k + 1) % seg], rows[j + 1][k]);
}

// a bunch of flowers round (cx, cy, cz): blooms in the colour, leaves under them
function bunch(s, n, r, cx, cy, cz, col, seed = 1) {
  let q = seed;
  const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < n; k++) {
    const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * r, b = 0.028 + 0.022 * rnd();
    const leaf = k % 3 === 2;
    ball(s, leaf ? b * 0.8 : b, cx + d * Math.sin(a), cy + (rnd() - 0.3) * r * 0.6, cz + d * Math.cos(a), leaf ? LEAF : col, 12);
  }
}

// ---------------------------------------------------------------- the starters
// size: the footprint, for walking and for what stands on it ({r} round, or {w, d}); top: the
// height things put on it stand at; seat: where the body sits on it (its hips, facing its front);
// block: whether the body walks round it (a runner, a candle are walked over or past).
export const STARTERS = {
  chair: {
    height: 0.9, on: "floor", colour: "gold", size: { w: 0.44, d: 0.46 }, block: true, seat: { y: 0.45, z: -0.02, back: true },
    make(col) {
      const s = shape(), cushion = col === COLOURS.white ? COLOURS.ivory : COLOURS.white;
      for (const [x, z] of [[-0.19, 0.19], [0.19, 0.19], [-0.19, -0.2], [0.19, -0.2]]) rod(s, [x, 0, z], [x, 0.43, z], 0.014, col);
      box(s, 0.42, 0.03, 0.42, 0, 0.42, 0, col);
      box(s, 0.4, 0.04, 0.4, 0, 0.45, 0.005, cushion);
      for (const x of [-0.19, 0.19]) rod(s, [x, 0.43, -0.2], [x * 0.92, 0.9, -0.23], 0.014, col);
      for (const y of [0.6, 0.7, 0.8, 0.89]) rod(s, [-0.18, y, -0.21 - (y - 0.45) * 0.06], [0.18, y, -0.21 - (y - 0.45) * 0.06], 0.01, col);
      for (const y of [0.15, 0.3]) rod(s, [-0.18, y, 0.18], [0.18, y, 0.18], 0.008, col);
      return s;
    },
  },
  round_table: {
    height: 0.76, on: "floor", colour: "white", size: { r: 0.78 }, block: true, top: 0.76,
    make(col) { const s = shape(); cyl(s, 0.8, 0.76, 0.73, 0, 0, 0, col, 48); cyl(s, 0.76, 0.76, 0.03, 0, 0.73, 0, col, 48); return s; },
  },
  long_table: {
    height: 0.76, on: "floor", colour: "white", size: { w: 1.84, d: 0.84 }, block: true, top: 0.76,
    make(col) { const s = shape(); box(s, 1.84, 0.73, 0.84, 0, 0, 0, col); box(s, 1.8, 0.03, 0.8, 0, 0.73, 0, col); return s; },
  },
  arch: {
    height: 2.3, on: "floor", colour: "white", size: { w: 1.7, d: 0.4 }, block: "posts",
    posts: [[-0.8, 0], [0.8, 0]],
    make(col) {
      const s = shape(), bloom = col === COLOURS.white ? COLOURS.blush : COLOURS.white;
      for (const x of [-0.8, 0.8]) { rod(s, [x, 0, 0], [x, 1.5, 0], 0.035, col); box(s, 0.2, 0.04, 0.2, x, 0, 0, col); }
      let prev = null;
      for (let k = 0; k <= 24; k++) {
        const a = Math.PI * (1 - k / 24), p = [0.8 * Math.cos(a), 1.5 + 0.8 * Math.sin(a), 0];
        if (prev) rod(s, prev, p, 0.035, col);
        prev = p;
      }
      // flowers over one shoulder of the arch and at the foot of the other post
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (0.55 + 0.05 * k);
        bunch(s, 10, 0.14, 0.8 * Math.cos(a), 1.5 + 0.8 * Math.sin(a), 0.03, k % 2 ? bloom : COLOURS.white, 7 + k);
      }
      bunch(s, 16, 0.18, 0.8, 0.15, 0.05, bloom, 3);
      return s;
    },
  },
  pillar: {
    height: 1.0, on: "floor", colour: "white", size: { r: 0.18 }, block: true, top: 1.0,
    make(col) { const s = shape(); box(s, 0.32, 0.06, 0.32, 0, 0, 0, col); cyl(s, 0.12, 0.12, 0.88, 0, 0.06, 0, col, 24); box(s, 0.3, 0.06, 0.3, 0, 0.94, 0, col); return s; },
  },
  runner: {
    height: 0.01, on: "floor", colour: "ivory", size: { w: 0.9, d: 6 }, block: false,
    make(col) { const s = shape(); box(s, 0.9, 0.006, 6, 0, 0, 0, col); return s; },
  },
  flowers: {
    height: 0.45, on: "top", colour: "blush", size: { r: 0.15 }, block: false,
    make(col) {
      const s = shape();
      cyl(s, 0.05, 0.07, 0.18, 0, 0, 0, GLASS, 20);
      for (let k = 0; k < 5; k++) rod(s, [0, 0.12, 0], [0.08 * Math.sin(k * 1.3), 0.3, 0.08 * Math.cos(k * 1.3)], 0.005, LEAF, 5);
      bunch(s, 30, 0.14, 0, 0.345, 0, col, 11);
      return s;
    },
  },
  candle: {
    height: 0.3, on: "top", colour: "gold", size: { r: 0.05 }, block: false,
    make(col) { const s = shape(); cyl(s, 0.05, 0.035, 0.03, 0, 0, 0, col, 20); cyl(s, 0.022, 0.022, 0.24, 0, 0.03, 0, WAX, 16); ball(s, 0.012, 0, 0.285, 0, FLAME, 8); return s; },
  },
  lantern: {
    height: 0.5, on: "floor", colour: "black", size: { r: 0.13 }, block: false,
    make(col) {
      const s = shape();
      box(s, 0.22, 0.03, 0.22, 0, 0, 0, col); box(s, 0.22, 0.03, 0.22, 0, 0.4, 0, col);
      for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]]) rod(s, [x, 0.03, z], [x, 0.4, z], 0.008, col, 6);
      cyl(s, 0.08, 0.02, 0.07, 0, 0.43, 0, col, 16);
      rod(s, [0, 0.5, 0], [0, 0.47, 0], 0.02, col, 8);
      cyl(s, 0.03, 0.03, 0.12, 0, 0.03, 0, WAX, 12); ball(s, 0.012, 0, 0.165, 0, FLAME, 8);
      return s;
    },
  },
};

// A starter's shape in a colour (a name in COLOURS; its own colour if none).
export function starterShape(id, colour) {
  const def = STARTERS[id];
  if (!def) throw new Error("no such starter " + id);
  return def.make(COLOURS[colour] || COLOURS[def.colour]);
}

// ---------------------------------------------------------------- meshes made from photos
// decor.py's pack(): positions as int16 over lo..hi, colours as bytes, faces as uint32 (all
// base64), the thing 1 high. -> { p: Float32Array, c: Float32Array (0..1), i: Uint32Array }
export function unpack(m) {
  const vb = b64bytes(m.v), cb = b64bytes(m.c), fb = b64bytes(m.f);
  const q = new Int16Array(vb.buffer, vb.byteOffset, vb.byteLength / 2);
  const p = new Float32Array(q.length);
  for (let k = 0; k < q.length; k++) {
    const a = k % 3, span = (m.hi[a] - m.lo[a]) || 1;
    p[k] = m.lo[a] + (q[k] + 32768) / 65535 * span;
  }
  const c = new Float32Array(cb.length);
  for (let k = 0; k < cb.length; k++) c[k] = cb[k] / 255;
  const i = new Uint32Array(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength));
  return { p, c, i };
}

// What the page knows of an item, starter or made: { id, height, on, size, top, seat, block }.
// A made item's footprint is its mesh's (lo, hi, scaled to its height); it blocks the walk when
// it is taller than a step.
export function itemDef(item, mesh = null) {
  const st = STARTERS[item.id];
  if (st) return { id: item.id, starter: true, height: st.height, on: st.on, size: st.size, top: st.top, seat: st.seat,
                   block: st.block, posts: st.posts, colour: st.colour };
  const h = item.height || 1;
  const size = mesh ? { w: (mesh.hi[0] - mesh.lo[0]) * h, d: (mesh.hi[2] - mesh.lo[2]) * h } : { r: 0.25 * h };
  return { id: item.id, starter: false, height: h, on: item.on || "floor", size, block: h > 0.25 };
}

// ---------------------------------------------------------------- where things go
// a turn kept within -pi..pi
export const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const rot = (turn, x, z) => [x * Math.cos(turn) + z * Math.sin(turn), -x * Math.sin(turn) + z * Math.cos(turn)];
const unrot = (turn, x, z) => [x * Math.cos(turn) - z * Math.sin(turn), x * Math.sin(turn) + z * Math.cos(turn)];

// whether the floor point (x, z) is on a placed item p (its footprint, grown by pad)
export function covers(def, p, x, z, pad = 0) {
  const [lx, lz] = unrot(p.turn || 0, x - p.x, z - p.z);
  const sz = def.size;
  if (sz.r !== undefined) return lx * lx + lz * lz <= (sz.r + pad) ** 2;
  return Math.abs(lx) <= sz.w / 2 + pad && Math.abs(lz) <= sz.d / 2 + pad;
}

// The height an item dropped at (x, z) stands at: on the floor (0), or for a thing that goes on
// top (flowers, a candle), on the highest placed table or pillar there, else on what the scan has
// there (roomTop(x, z): a table in the room, in metres, or 0).
export function dropY(def, placed, defs, x, z, roomTop = () => 0, skip = null) {
  if (def.on !== "top") return 0;
  let y = Math.max(0, roomTop(x, z) || 0);
  for (const p of placed) {
    const d = defs(p.item);
    if (p === skip || !d || d.top === undefined) continue;
    if (covers(d, p, x, z)) y = Math.max(y, (p.y || 0) + d.top);
  }
  return y;
}

// n - 1 more like p, side by side to its right (its own x), `gap` metres apart
export function row(def, p, n, gap = 0.1) {
  const w = (def.size.r !== undefined ? 2 * def.size.r : def.size.w) + gap, out = [];
  const [dx, dz] = rot(p.turn || 0, 1, 0);
  for (let k = 1; k < n; k++) out.push({ ...p, x: p.x + dx * w * k, z: p.z + dz * w * k });
  return out;
}

// n chairs round a table p, facing it: on a circle round a round one, along both long sides of a
// long one (and its ends when there are more than fit along them)
export function around(tableDef, p, chairDef, n, colour = null) {
  const out = [], back = chairDef.size.d / 2 + 0.08, add = (lx, lz, face) => {
    const [x, z] = rot(p.turn || 0, lx, lz);
    const c = { item: chairDef.id, x: p.x + x, y: 0, z: p.z + z, turn: wrap(face + (p.turn || 0)) };
    if (colour) c.colour = colour;
    out.push(c);
  };
  const sz = tableDef.size;
  if (sz.r !== undefined) {
    const R = sz.r + back - 0.12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI;
      add(R * Math.sin(a), R * Math.cos(a), a + Math.PI);       // its front toward the middle
    }
    return out;
  }
  const along = Math.max(1, Math.floor(sz.w / (chairDef.size.w + 0.12)));
  const ends = Math.min(2, Math.max(0, n - 2 * along)), sides = n - ends;
  for (let k = 0; k < sides; k++) {
    const side = k % 2 ? -1 : 1, j = Math.floor(k / 2), m = Math.ceil(sides / 2);
    const lx = (j - (m - 1) / 2) * (sz.w / Math.max(m, 1));
    add(lx, side * (sz.d / 2 + back - 0.12), side > 0 ? Math.PI : 0);
  }
  for (let k = 0; k < ends; k++) {
    const side = k ? -1 : 1;
    add(side * (sz.w / 2 + back - 0.12), 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  return out;
}

// Whether the body (its middle; room.js keeps it ROOM.radius from what blocks) can't stand at
// (x, z) for the placed items: chairs, tables and pillars are walked round; an arch only at its
// posts, so the body walks through it.
export function blocker(placed, defs) {
  const solid = [];
  for (const p of placed) {
    const d = defs(p.item);
    if (!d || !d.block) continue;
    if (d.block === "posts") for (const [px, pz] of d.posts) {
      const [x, z] = rot(p.turn || 0, px, pz);
      solid.push({ def: { size: { r: 0.08 } }, p: { x: p.x + x, z: p.z + z, turn: 0 } });
    }
    else solid.push({ def: d, p });
  }
  if (!solid.length) return null;
  return (x, z) => solid.some((s) => covers(s.def, s.p, x, z));
}

// the places to sit on the placed items, as room.py's seats: where the hips go, the seat's height,
// the way the body faces, whether it has a back
export function seats(placed, defs) {
  const out = [];
  for (const p of placed) {
    const d = defs(p.item);
    if (!d || !d.seat) continue;
    const [x, z] = rot(p.turn || 0, 0, d.seat.z || 0), t = p.turn || 0;
    out.push({ x: p.x + x, y: (p.y || 0) + d.seat.y, z: p.z + z, dir: [Math.sin(t), Math.cos(t)], back: d.seat.back, decor: true });
  }
  return out;
}

// The matrix that puts the map's metres in the body's coordinates (room.js Placement.toBody, which
// is linear): column by column, for three.js Matrix4.fromArray.
export function mapMatrix(P) {
  const o = P.toBody([0, 0, 0]), out = new Array(16).fill(0);
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((e, col) => {
    const b = P.toBody(e);
    for (let r = 0; r < 3; r++) out[col * 4 + r] = b[r] - o[r];
  });
  for (let r = 0; r < 3; r++) out[12 + r] = o[r];
  out[15] = 1;
  return out;
}

// a free spot for something new, near (x, z): off what is already placed there, on free floor
export function freeSpot(def, placed, defs, x, z, floorFree = () => true) {
  if (def.on === "top") return [x, z];
  const r = def.size.r !== undefined ? def.size.r : Math.hypot(def.size.w, def.size.d) / 2;
  const ok = (px, pz) => floorFree(px, pz) && !placed.some((p) => { const d = defs(p.item); return d && d.block && covers(d, p, px, pz, r); });
  if (ok(x, z)) return [x, z];
  for (let ring = 1; ring <= 30; ring++)
    for (let k = 0; k < 8 * ring; k++) {
      const a = (k / (8 * ring)) * 2 * Math.PI, px = x + 0.1 * ring * Math.cos(a), pz = z + 0.1 * ring * Math.sin(a);
      if (ok(px, pz)) return [px, pz];
    }
  return [x, z];
}
