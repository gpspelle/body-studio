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
// A shape is { p: [x, y, z, ...], c: [r, g, b, ...] (0..1), g: [1 per vertex that glows: a bulb, a
// flame], m: [what each vertex is made of, an index in FINISHES], i: [triangles] }.
function shape() { return { p: [], c: [], g: [], m: [], i: [] }; }

// What things are made of, for the page's materials (decorate.js): how rough, how metal, how clear.
// A part's finish comes from its colour (gold and silver are metal, wood is wood, glass is glass)
// unless made() says otherwise.
export const FINISHES = [
  { name: "cloth", rough: 0.92, metal: 0 },          // linen, velvet, paint: no shine
  { name: "satin", rough: 0.4, metal: 0 },           // china, wax, icing, lacquer, petals
  { name: "wood", rough: 0.62, metal: 0 },
  { name: "metal", rough: 0.3, metal: 1 },           // brass, gold, silver, iron
  { name: "glass", rough: 0.05, metal: 0, clear: 0.28 },
  { name: "glow", rough: 1, metal: 0, glow: true },  // bulbs, flames: they give light
];
const F = Object.fromEntries(FINISHES.map((f, k) => [f.name, k]));
let glowing = 0, finish = null;
const finishes = new Map();                        // colour (the array itself) -> its finish
function finishOf(col) { return glowing ? F.glow : finish !== null ? finish : (finishes.get(col) ?? F.cloth); }
let place = null;                                  // while set, what vert() adds is moved by it
function vert(s, x, y, z, col) {
  if (place) [x, y, z] = place(x, y, z);
  s.p.push(x, y, z); s.c.push(col[0], col[1], col[2]); s.g.push(glowing); s.m.push(finishOf(col));
  return s.p.length / 3 - 1;
}
// what f() adds glows
function lit(f) { glowing = 1; try { f(); } finally { glowing = 0; } }
// what f() adds is made of `name` (whatever its colour)
function made(name, f) { const was = finish; finish = F[name]; try { f(); } finally { finish = was; } }
function quad(s, a, b, c, d) { s.i.push(a, b, c, a, c, d); }

// a box standing at (cx, cy, cz), its edges softly bevelled (a few millimetres: they catch the light
// as real edges do); thin boxes (a cloth, a tile) stay sharp
function box(s, w, h, d, cx, cy, cz, col) {
  const b = Math.min(0.006, Math.min(w, h, d) * 0.18);
  if (b < 0.0015) return sharpBox(s, w, h, d, cx, cy, cz, col);
  // the 6 faces inset by b, then the 12 edges and 8 corners between them
  const X = [cx - w / 2, cx + w / 2], Y = [cy, cy + h], Z = [cz - d / 2, cz + d / 2];
  const P = (i, j, k, ax) => [X[i] + (ax === 0 ? 0 : i ? -b : b), Y[j] + (ax === 1 ? 0 : j ? -b : b), Z[k] + (ax === 2 ? 0 : k ? -b : b)];
  const corner = {};
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
    for (let ax = 0; ax < 3; ax++) corner[`${i}${j}${k}${ax}`] = vert(s, ...P(i, j, k, ax), col);
  const c = (i, j, k, ax) => corner[`${i}${j}${k}${ax}`];
  const face = (a, b2, c2, d2, out) => quadOut(s, a, b2, c2, d2, out);
  // faces: x = 0/1 (ax 0), y (ax 1), z (ax 2)
  for (const i of [0, 1]) face(c(i, 0, 0, 0), c(i, 1, 0, 0), c(i, 1, 1, 0), c(i, 0, 1, 0), [i ? 1 : -1, 0, 0]);
  for (const j of [0, 1]) face(c(0, j, 0, 1), c(1, j, 0, 1), c(1, j, 1, 1), c(0, j, 1, 1), [0, j ? 1 : -1, 0]);
  for (const k of [0, 1]) face(c(0, 0, k, 2), c(1, 0, k, 2), c(1, 1, k, 2), c(0, 1, k, 2), [0, 0, k ? 1 : -1]);
  // edges along x (between the y and z faces), along y, along z
  for (const j of [0, 1]) for (const k of [0, 1])
    face(c(0, j, k, 1), c(1, j, k, 1), c(1, j, k, 2), c(0, j, k, 2), [0, j ? 1 : -1, k ? 1 : -1]);
  for (const i of [0, 1]) for (const k of [0, 1])
    face(c(i, 0, k, 0), c(i, 1, k, 0), c(i, 1, k, 2), c(i, 0, k, 2), [i ? 1 : -1, 0, k ? 1 : -1]);
  for (const i of [0, 1]) for (const j of [0, 1])
    face(c(i, j, 0, 0), c(i, j, 1, 0), c(i, j, 1, 1), c(i, j, 0, 1), [i ? 1 : -1, j ? 1 : -1, 0]);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
    triOut(s, c(i, j, k, 0), c(i, j, k, 1), c(i, j, k, 2), [i ? 1 : -1, j ? 1 : -1, k ? 1 : -1]);
}
// a triangle and a quad wound to face `out`
function triOut(s, a, b, c, out) {
  const p = (v) => s.p.slice(v * 3, v * 3 + 3);
  const A = p(a), B = p(b), C = p(c), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) s.i.push(a, b, c); else s.i.push(a, c, b);
}
function quadOut(s, a, b, c, d, out) { triOut(s, a, b, c, out); triOut(s, a, c, d, out); }

// An upholstered block: a box w x h x d standing at (cx, cy, cz) whose edges round off with radius
// r, as a cushion, a padded arm, a cloth over a table's edge do. Each face is a grid pushed out
// onto the rounded shape (as three.js's RoundedBoxGeometry).
function soft(s, w, h, d, cx, cy, cz, col, r = 0.04, n = 6) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const half = [w / 2, h / 2, d / 2], inner = half.map((v) => v - r), mid = [cx, cy + h / 2, cz];
  const at = (q) => {
    const c = q.map((v, a) => Math.max(-inner[a], Math.min(inner[a], v)));
    const off = q.map((v, a) => v - c[a]), L = Math.hypot(...off) || 1;
    return c.map((v, a) => mid[a] + v + (off[a] / L) * r);
  };
  // each face: its axis and side; u and v run over the other two axes
  for (let ax = 0; ax < 3; ax++) for (const side of [-1, 1]) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, ids = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const q = [0, 0, 0];
      q[ax] = side * half[ax];
      q[u] = (i / n * 2 - 1) * half[u];
      q[v] = (j / n * 2 - 1) * half[v];
      ids.push(vert(s, ...at(q), col));
    }
    const out = [0, 0, 0];
    out[ax] = side;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
      quadOut(s, ids[i * (n + 1) + j], ids[(i + 1) * (n + 1) + j], ids[(i + 1) * (n + 1) + j + 1], ids[i * (n + 1) + j + 1], out);
  }
}

function sharpBox(s, w, h, d, cx, cy, cz, col) {
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

// a ball squashed to radii (rx, ry, rz), turned by `turn` about y: a leaf, a petal's base
function blob(s, rx, ry, rz, cx, cy, cz, col, turn = 0, seg = 8) {
  const rows = [], c = Math.cos(turn), sn = Math.sin(turn);
  for (let j = 0; j <= seg / 2; j++) {
    const ph = (j / (seg / 2)) * Math.PI;
    rows.push(Array.from({ length: seg }, (_, k) => {
      const a = (k / seg) * 2 * Math.PI, x = rx * Math.sin(ph) * Math.sin(a), z = rz * Math.sin(ph) * Math.cos(a);
      return vert(s, cx + x * c + z * sn, cy + ry * Math.cos(ph), cz - x * sn + z * c, col);
    }));
  }
  for (let j = 0; j < rows.length - 1; j++)
    for (let k = 0; k < seg; k++) quad(s, rows[j][k], rows[j][(k + 1) % seg], rows[j + 1][(k + 1) % seg], rows[j + 1][k]);
}

// One bloom of radius b at (cx, cy, cz), facing up: a garden rose. A round bud at its heart, then
// three rings of cupped petals, each ring more open than the one inside it, the outer ones paler
// at their edges as real petals are; darker deep inside.
function bloom(s, b, cx, cy, cz, col, spin = 0) {
  const deep = col.map((v) => v * 0.7), edge = col.map((v) => v + (1 - v) * 0.25);
  made("satin", () => {
    blob(s, b * 0.36, b * 0.42, b * 0.36, cx, cy + b * 0.12, cz, deep, spin, 10);
    // [where the ring starts, petals, how open (0 upright .. 1 flat), length]
    for (const [r0, n, open, len, lift] of [[0.18, 4, 0.12, 0.62, 0.05], [0.28, 5, 0.32, 0.78, -0.05], [0.4, 6, 0.6, 0.9, -0.2]]) {
      for (let k = 0; k < n; k++) {
        const a = spin + (k + r0 * 3) * ((2 * Math.PI) / n), ca = Math.cos(a), sa = Math.sin(a);
        const U = 4, Vn = 4, pts = [];
        for (let u = 0; u <= U; u++) for (let v = 0; v <= Vn; v++) {
          const t = u / U, w = (v / Vn) * 2 - 1;
          // up the petal: rising from the root, curving out as it opens; across: a cup
          const ang = (Math.PI / 2) * (1 - open) * (1 - 0.55 * t) + (Math.PI / 2) * open * 0.15;
          const out = b * (r0 + len * t * Math.cos(ang) * 0.9), up = b * (lift + len * t * Math.sin(ang));
          const half = b * len * 0.48 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.95)), side = w * half;
          const cup = b * 0.16 * (w * w) * (0.4 + t);
          pts.push(vert(s, cx + (out - cup) * sa + side * ca, cy + up + cup * 0.6, cz + (out - cup) * ca - side * sa,
                        t > 0.75 ? edge : t < 0.3 ? deep : col));
        }
        for (let u = 0; u < U; u++) for (let v = 0; v < Vn; v++)
          quad(s, pts[u * (Vn + 1) + v], pts[u * (Vn + 1) + v + 1], pts[(u + 1) * (Vn + 1) + v + 1], pts[(u + 1) * (Vn + 1) + v]);
      }
    }
  });
}

// what f() adds at the origin, facing up, put at c facing along the unit direction n
function facing(n, c, f) {
  const up = [0, 1, 0], ax = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
  const sn = Math.hypot(...ax), cs = n[1], k = sn > 1e-9 ? ax.map((v) => v / sn) : [1, 0, 0];
  const was = place;
  // Rodrigues: turn by the angle between up and n about their common normal
  place = (x, y, z) => {
    const v = [x, y, z], dot = k[0] * x + k[1] * y + k[2] * z;
    const cr = [k[1] * z - k[2] * y, k[2] * x - k[0] * z, k[0] * y - k[1] * x];
    const r = v.map((q, a) => q * cs + cr[a] * sn + k[a] * dot * (1 - cs));
    return was ? was(r[0] + c[0], r[1] + c[1], r[2] + c[2]) : [r[0] + c[0], r[1] + c[1], r[2] + c[2]];
  };
  try { f(); } finally { place = was; }
}

// A bunch of flowers round (cx, cy, cz), r across: roses in the colour (a few paler) packed in a
// dome, each facing out from its middle as an arranged bouquet does, leaves tucked round the rim.
function bunch(s, n, r, cx, cy, cz, col, seed = 1) {
  let q = seed;
  const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  const pale = col.map((v) => v + (1 - v) * 0.45), golden = Math.PI * (3 - Math.sqrt(5));
  const blooms = Math.max(1, Math.round(n * 0.75));
  for (let k = 0; k < blooms; k++) {
    // spread over the top of a dome, from its crown to a little below its middle
    const t = (k + 0.5) / blooms, up = 1 - t * 1.15, ring = Math.sqrt(Math.max(0, 1 - up * up)), a = k * golden + seed;
    const d = [ring * Math.sin(a), up, ring * Math.cos(a)], b = r * (0.3 + 0.12 * rnd()) / Math.sqrt(Math.max(1, blooms / 6));
    const c = [cx + d[0] * r * 0.82, cy + d[1] * r * 0.55, cz + d[2] * r * 0.82];
    facing(d, c, () => bloom(s, b, 0, 0, 0, k % 5 === 4 ? pale : col, rnd() * 6.3));
  }
  for (let k = blooms; k < n; k++) {
    const a = rnd() * 2 * Math.PI, d = [Math.sin(a) * 0.9, -0.35, Math.cos(a) * 0.9], len = r * (0.22 + 0.08 * rnd());
    facing([d[0] * 0.5, 0.85, d[2] * 0.5], [cx + d[0] * r * 0.85, cy - r * 0.12, cz + d[2] * r * 0.85],
           () => blob(s, len * 0.45, len * 0.08, len, 0, 0, 0, LEAF, a, 8));
  }
}

// A cloth falling from a round top of radius r (at height h) to the floor, in soft folds that
// open towards the hem.
function drape(s, r, h, col, folds = 14, seg = 96) {
  const rows = 8, ring = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, y = h * (1 - t), R = r + 0.035 * t, f = 0.022 * t * t;
    ring.push(Array.from({ length: seg }, (_, k) => {
      const a = (k / seg) * 2 * Math.PI, rr = R + f * Math.sin(folds * a + 0.7 * Math.sin(3 * a));
      return vert(s, rr * Math.sin(a), y, rr * Math.cos(a), col);
    }));
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < seg; k++) quad(s, ring[j][k], ring[j + 1][k], ring[j + 1][(k + 1) % seg], ring[j][(k + 1) % seg]);
  // the top, a hair over the cloth's edge
  const c = vert(s, 0, h, 0, col);
  for (let k = 0; k < seg; k++) s.i.push(c, ring[0][k], ring[0][(k + 1) % seg]);
}

// ---------------------------------------------------------------- the starters
// size: the footprint, for walking and for what stands on it ({r} round, or {w, d}); top: the
// height things put on it stand at; seat: where the body sits on it (its hips, facing its front);
// block: whether the body walks round it (a runner, a candle are walked over or past).
export const STARTERS = {
  chair: {
    group: "tables", height: 0.9, on: "floor", colour: "gold", size: { w: 0.44, d: 0.46 }, block: true, seat: { y: 0.45, z: -0.02, back: true },
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
    group: "tables", height: 0.76, on: "floor", colour: "white", size: { r: 0.78 }, block: true, top: 0.76,
    make(col) { const s = shape(); drape(s, 0.76, 0.76, col); return s; },
  },
  long_table: {
    group: "tables", height: 0.76, on: "floor", colour: "white", size: { w: 1.84, d: 0.84 }, block: true, top: 0.76,
    make(col) { const s = shape(); cloth(s, 1.84, 0.84, 0.76, col); return s; },
  },
  arch: {
    group: "ceremony", height: 2.36, on: "floor", colour: "white", size: { w: 1.9, d: 0.4 }, block: "posts",
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
    group: "ceremony", height: 1.0, on: "floor", colour: "white", size: { r: 0.18 }, block: true, top: 1.0,
    make(col) { const s = shape(); box(s, 0.32, 0.06, 0.32, 0, 0, 0, col); cyl(s, 0.12, 0.12, 0.88, 0, 0.06, 0, col, 24); box(s, 0.3, 0.06, 0.3, 0, 0.94, 0, col); return s; },
  },
  runner: {
    group: "ceremony", height: 0.01, on: "floor", colour: "ivory", size: { w: 0.9, d: 6 }, block: false,
    make(col) { const s = shape(); box(s, 0.9, 0.006, 6, 0, 0, 0, col); return s; },
  },
  flowers: {
    group: "table", height: 0.45, on: "top", colour: "blush", size: { r: 0.15 }, block: false,
    make(col) {
      const s = shape();
      cyl(s, 0.05, 0.07, 0.18, 0, 0, 0, GLASS, 20);
      for (let k = 0; k < 5; k++) rod(s, [0, 0.12, 0], [0.08 * Math.sin(k * 1.3), 0.3, 0.08 * Math.cos(k * 1.3)], 0.005, LEAF, 5);
      bunch(s, 30, 0.14, 0, 0.365, 0, col, 11);
      return s;
    },
  },
  candle: {
    group: "table", height: 0.3, on: "top", colour: "gold", size: { r: 0.05 }, block: false,
    make(col) { const s = shape(); cyl(s, 0.05, 0.035, 0.03, 0, 0, 0, col, 20); cyl(s, 0.022, 0.022, 0.24, 0, 0.03, 0, WAX, 16); lit(() => ball(s, 0.012, 0, 0.285, 0, FLAME, 8)); return s; },
  },
  lantern: {
    group: "lights", height: 0.5, on: "floor", colour: "black", size: { r: 0.13 }, block: false,
    make(col) {
      const s = shape();
      box(s, 0.22, 0.03, 0.22, 0, 0, 0, col); box(s, 0.22, 0.03, 0.22, 0, 0.4, 0, col);
      for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]]) rod(s, [x, 0.03, z], [x, 0.4, z], 0.008, col, 6);
      cyl(s, 0.08, 0.02, 0.07, 0, 0.43, 0, col, 16);
      rod(s, [0, 0.5, 0], [0, 0.47, 0], 0.02, col, 8);
      cyl(s, 0.03, 0.03, 0.12, 0, 0.03, 0, WAX, 12); lit(() => ball(s, 0.012, 0, 0.165, 0, FLAME, 8));
      return s;
    },
  },
};

// ---------------------------------------------------------------- the wedding catalogue
const SILVER = [0.78, 0.79, 0.8], CHAMPAGNE = [0.96, 0.86, 0.55], BULB = [1.0, 0.86, 0.55], WIRE = [0.12, 0.12, 0.12];
const CAKE = [0.97, 0.95, 0.9], BOTTLES = [[0.18, 0.35, 0.2], [0.55, 0.32, 0.12], [0.85, 0.88, 0.86], [0.45, 0.1, 0.15]];
const other = (col, a = COLOURS.white, b = COLOURS.ivory) => (col === a ? b : a);
for (const [cols, f] of [[[COLOURS.gold, SILVER, WIRE], F.metal], [[COLOURS.wood], F.wood], [[GLASS, ...BOTTLES], F.glass],
                         [[WAX, CAKE, CHAMPAGNE], F.satin]]) for (const c of cols) finishes.set(c, f);

// a stemmed glass at (x, y, z): a wine glass, or a flat coupe
function glassAt(s, x, y, z, coupe = false, fill = null) {
  cyl(s, 0.03, 0.03, 0.004, x, y, z, GLASS, 12);
  rod(s, [x, y, z], [x, y + (coupe ? 0.09 : 0.1), z], 0.004, GLASS, 5);
  if (coupe) cyl(s, 0.012, 0.055, 0.035, x, y + 0.09, z, fill || GLASS, 14);
  else cyl(s, 0.015, 0.038, 0.09, x, y + 0.1, z, fill || GLASS, 14);
}
// a circle of rod in the x-y plane round (cx, cy, cz), from angle a0 to a1
function hoop(s, R, cx, cy, cz, r, col, a0 = 0, a1 = 2 * Math.PI, n = 36) {
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * (k / n), p = [cx + R * Math.cos(a), cy + R * Math.sin(a), cz];
    if (prev) rod(s, prev, p, r, col, 8);
    prev = p;
  }
}
// a cloth over a table's edge, falling to the floor
// a cloth over a table, its top's edges rounded where it falls over them, to the floor
function cloth(s, w, d, h, col) {
  // its top's outline is a squircle (straight sides, softly rounded corners); from it the cloth
  // falls in soft folds that open towards the hem, a little wider there
  const a = w / 2, b = d / 2, n = 10, N = 192, rows = 8;
  const edge = (k) => {
    const th = (k / N) * 2 * Math.PI, c = Math.cos(th), sn = Math.sin(th);
    const x = a * Math.sign(c) * Math.abs(c) ** (2 / n), z = b * Math.sign(sn) * Math.abs(sn) ** (2 / n);
    const nx = Math.sign(x) * Math.abs(x / a) ** (n - 1) / a, nz = Math.sign(z) * Math.abs(z / b) ** (n - 1) / b, L = Math.hypot(nx, nz) || 1;
    return { p: [x, z], n: [nx / L, nz / L], th };
  };
  const E = Array.from({ length: N }, (_, k) => edge(k)), ring = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, y = (h - 0.012) * (1 - t);
    ring.push(E.map((e, k) => {
      const off = 0.004 + 0.018 * t + 0.016 * t * t * Math.sin(e.th * 26 + 0.8 * Math.sin(k * 0.23));
      return vert(s, e.p[0] + e.n[0] * off, y, e.p[1] + e.n[1] * off, col);
    }));
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < N; k++) quad(s, ring[j][k], ring[j + 1][k], ring[j + 1][(k + 1) % N], ring[j][(k + 1) % N]);
  // the top, rolling softly over its edge
  const top = E.map((e) => vert(s, e.p[0] - e.n[0] * 0.012, h, e.p[1] - e.n[1] * 0.012, col));
  for (let k = 0; k < N; k++) quad(s, top[k], top[(k + 1) % N], ring[0][(k + 1) % N], ring[0][k]);
  const c = vert(s, 0, h, 0, col);
  for (let k = 0; k < N; k++) s.i.push(c, top[(k + 1) % N], top[k]);
}

Object.assign(STARTERS, {
  // ------------------------------------------------ tables and seating
  cross_back_chair: {
    group: "tables", height: 0.9, on: "floor", colour: "wood", size: { w: 0.45, d: 0.48 }, block: true, seat: { y: 0.46, z: 0, back: true },
    make(col) {
      const s = shape();
      for (const [x, z] of [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.21], [0.2, -0.21]]) box(s, 0.035, 0.44, 0.035, x, 0, z, col);
      box(s, 0.45, 0.04, 0.45, 0, 0.42, 0, col);
      box(s, 0.42, 0.03, 0.42, 0, 0.46, 0.01, COLOURS.ivory);
      for (const x of [-0.2, 0.2]) box(s, 0.04, 0.44, 0.04, x, 0.46, -0.21, col);
      box(s, 0.44, 0.05, 0.035, 0, 0.85, -0.21, col);
      rod(s, [-0.18, 0.5, -0.21], [0.18, 0.84, -0.21], 0.012, col, 6);
      rod(s, [0.18, 0.5, -0.21], [-0.18, 0.84, -0.21], 0.012, col, 6);
      return s;
    },
  },
  bench: {
    group: "tables", height: 0.45, on: "floor", colour: "wood", size: { w: 1.8, d: 0.4 }, block: true,
    seats: [{ x: -0.55, y: 0.45, z: 0, back: false }, { x: 0, y: 0.45, z: 0, back: false }, { x: 0.55, y: 0.45, z: 0, back: false }],
    make(col) {
      const s = shape();
      box(s, 1.8, 0.05, 0.4, 0, 0.4, 0, col);
      for (const x of [-0.8, 0.8]) box(s, 0.06, 0.4, 0.34, x, 0, 0, col);
      box(s, 1.5, 0.05, 0.05, 0, 0.12, 0, col);
      return s;
    },
  },
  square_table: {
    group: "tables", height: 0.76, on: "floor", colour: "white", size: { w: 1.24, d: 1.24 }, block: true, top: 0.76,
    make(col) { const s = shape(); cloth(s, 1.24, 1.24, 0.76, col); return s; },
  },
  cocktail_table: {
    group: "tables", height: 1.1, on: "floor", colour: "white", size: { r: 0.36 }, block: true, top: 1.1,
    make(col) {
      // a stretch cover: wide at the top and the foot, tied in at the waist
      const s = shape();
      cyl(s, 0.32, 0.17, 0.55, 0, 0, 0, col, 32); cyl(s, 0.17, 0.34, 0.52, 0, 0.55, 0, col, 32);
      cyl(s, 0.35, 0.35, 0.03, 0, 1.07, 0, col, 32);
      return s;
    },
  },
  sweetheart_table: {
    group: "tables", height: 0.79, on: "floor", colour: "white", size: { w: 1.7, d: 0.8 }, block: true, top: 0.76,
    make(col) {
      const s = shape(), bloom = other(col, COLOURS.white, COLOURS.blush);
      cloth(s, 1.5, 0.7, 0.76, col);
      // a garland draped along the front, flowers at its ends
      for (let k = 0; k <= 12; k++) {
        const x = -0.7 + (1.4 * k) / 12, y = 0.68 - 0.18 * Math.sin((Math.PI * k) / 12);
        bunch(s, 3, 0.05, x, y, 0.37, k % 3 ? LEAF : bloom, 30 + k);
      }
      for (const x of [-0.72, 0.72]) bunch(s, 14, 0.12, x, 0.7, 0.36, bloom, x > 0 ? 5 : 9);
      return s;
    },
  },
  // ------------------------------------------------ on the table
  place_setting: {
    group: "table", height: 0.19, on: "top", colour: "gold", size: { w: 0.5, d: 0.42 }, block: false,
    make(col) {
      // for the guest sitting at +z: the plates, the fork to the left, the knife and the glasses to the right
      const s = shape();
      cyl(s, 0.16, 0.16, 0.006, 0, 0, 0.04, col, 40);
      cyl(s, 0.12, 0.135, 0.016, 0, 0.006, 0.04, COLOURS.white, 40);
      box(s, 0.13, 0.025, 0.07, 0, 0.022, 0.04, COLOURS.ivory);
      box(s, 0.02, 0.004, 0.19, -0.2, 0, 0.04, SILVER);
      box(s, 0.016, 0.004, 0.21, 0.2, 0, 0.04, SILVER);
      glassAt(s, 0.17, 0, -0.14);
      glassAt(s, 0.06, 0, -0.17);
      return s;
    },
  },
  centrepiece: {
    group: "table", height: 0.245, on: "top", colour: "blush", size: { r: 0.3 }, block: false,
    make(col) {
      // a low ring of flowers and greenery round three candles
      const s = shape();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * 2 * Math.PI;
        bunch(s, 5, 0.06, 0.22 * Math.sin(a), 0.07, 0.22 * Math.cos(a), k % 2 ? col : COLOURS.white, 50 + k);
      }
      for (const [x, z, h] of [[0, 0, 0.22], [0.07, 0.05, 0.16], [-0.06, 0.05, 0.12]]) {
        cyl(s, 0.03, 0.03, h, x, 0, z, WAX, 14);
        lit(() => ball(s, 0.011, x, h + 0.012, z, FLAME, 8));
      }
      return s;
    },
  },
  tall_centrepiece: {
    group: "table", height: 0.94, on: "top", colour: "white", size: { r: 0.24 }, block: false,
    make(col) {
      // a tall glass vase with a ball of flowers above the guests' heads, greenery falling from it
      const s = shape();
      cyl(s, 0.08, 0.08, 0.01, 0, 0, 0, GLASS, 20);
      cyl(s, 0.035, 0.05, 0.62, 0, 0.01, 0, GLASS, 16);
      bunch(s, 60, 0.24, 0, 0.8, 0, col, 21);
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05;
        rod(s, [0.2 * Math.sin(a), 0.7, 0.2 * Math.cos(a)], [0.26 * Math.sin(a), 0.5, 0.26 * Math.cos(a)], 0.012, LEAF, 5);
      }
      return s;
    },
  },
  candelabra: {
    group: "table", height: 0.72, on: "top", colour: "gold", size: { w: 0.5, d: 0.16 }, block: false,
    make(col) {
      const s = shape();
      cyl(s, 0.09, 0.05, 0.03, 0, 0, 0, col, 20);
      rod(s, [0, 0.03, 0], [0, 0.42, 0], 0.012, col, 8);
      const arms = [[-0.22, 0.4], [-0.11, 0.45], [0, 0.48], [0.11, 0.45], [0.22, 0.4]];
      for (const [x, y] of arms) {
        rod(s, [0, 0.38, 0], [x, y, 0], 0.008, col, 6);
        cyl(s, 0.022, 0.018, 0.02, x, y, 0, col, 10);
        cyl(s, 0.011, 0.011, 0.2, x, y + 0.02, 0, WAX, 8);
        lit(() => ball(s, 0.009, x, y + 0.23, 0, FLAME, 6));
      }
      return s;
    },
  },
  bud_vases: {
    group: "table", height: 0.24, on: "top", colour: "blush", size: { r: 0.12 }, block: false,
    make(col) {
      const s = shape();
      for (const [x, z, h] of [[-0.07, 0.02, 0.12], [0.02, -0.04, 0.16], [0.08, 0.04, 0.1]]) {
        cyl(s, 0.025, 0.018, h, x, 0, z, GLASS, 12);
        rod(s, [x, h, z], [x, h + 0.04, z], 0.003, LEAF, 4);
        ball(s, 0.03, x, h + 0.05, z, col, 10);
      }
      return s;
    },
  },
  table_number: {
    group: "table", height: 0.21, on: "top", colour: "gold", size: { w: 0.14, d: 0.08 }, block: false,
    make(col) { const s = shape(); box(s, 0.1, 0.012, 0.06, 0, 0, 0, col); box(s, 0.14, 0.2, 0.012, 0, 0.012, 0, col); box(s, 0.12, 0.18, 0.004, 0, 0.022, 0.008, COLOURS.white); return s; },
  },
  cake: {
    group: "table", height: 0.6, on: "top", colour: "white", size: { r: 0.24 }, block: false,
    make(col) {
      const s = shape(), icing = col === COLOURS.white ? CAKE : col;
      cyl(s, 0.12, 0.05, 0.02, 0, 0, 0, SILVER, 24); rod(s, [0, 0.02, 0], [0, 0.1, 0], 0.03, SILVER, 12);
      cyl(s, 0.24, 0.24, 0.015, 0, 0.1, 0, SILVER, 40);
      let y = 0.115;
      for (const r of [0.19, 0.145, 0.1]) { cyl(s, r, r, 0.13, 0, y, 0, icing, 40); y += 0.13; }
      bunch(s, 10, 0.06, 0.02, y + 0.03, 0.02, COLOURS.blush, 14);
      bunch(s, 6, 0.05, 0.12, 0.27, 0.1, COLOURS.blush, 15);
      return s;
    },
  },
  champagne_tower: {
    group: "table", height: 0.52, on: "top", colour: "gold", size: { r: 0.3 }, block: false,
    make(col) {
      // coupes stacked in squares, each level on the rims of the one below
      const s = shape();
      cyl(s, 0.3, 0.3, 0.015, 0, 0, 0, col, 32);
      let y = 0.015;
      for (const n of [4, 3, 2, 1]) {
        for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) glassAt(s, (i - (n - 1) / 2) * 0.11, y, (k - (n - 1) / 2) * 0.11, true, CHAMPAGNE);
        y += 0.125;
      }
      return s;
    },
  },
  // ------------------------------------------------ flowers and the ceremony
  moon_arch: {
    group: "ceremony", height: 2.36, on: "floor", colour: "gold", size: { w: 2.2, d: 0.5 }, block: "posts", posts: [[-0.5, 0], [0.5, 0]],
    make(col) {
      // a moon gate: a ring on two feet, flowers over one side
      const s = shape();
      hoop(s, 1.08, 0, 1.2, 0, 0.03, col, 0, 2 * Math.PI, 60);
      for (const x of [-0.5, 0.5]) { box(s, 0.5, 0.04, 0.4, x, 0, 0, col); rod(s, [x, 0.04, 0], [x * 0.95, 0.28, 0], 0.025, col, 8); }
      for (let k = 0; k < 10; k++) {
        const a = Math.PI * (0.55 + 0.06 * k);
        bunch(s, 10, 0.15, 1.08 * Math.cos(a), 1.2 + 1.08 * Math.sin(a), 0.05, k % 2 ? COLOURS.blush : COLOURS.white, 60 + k);
      }
      bunch(s, 18, 0.2, 0.75, 0.4, 0.05, COLOURS.white, 71);
      return s;
    },
  },
  chuppah: {
    group: "ceremony", height: 2.44, on: "floor", colour: "wood", size: { w: 2.2, d: 2.2 }, block: "posts",
    posts: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    make(col) {
      // four posts, a frame and a canopy of fabric, flowers at the front corners
      const s = shape();
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(s, [x, 0, z], [x, 2.4, z], 0.04, col, 10);
      for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]])
        rod(s, [a[0], 2.4, a[1]], [b[0], 2.4, b[1]], 0.035, col, 8);
      box(s, 2.1, 0.02, 2.1, 0, 2.42, 0, COLOURS.white);
      for (const x of [-1, 1]) for (const z of [-1, 1]) box(s, 0.02, 0.9, 0.5, x * 1.03, 1.5, z * 0.78, COLOURS.white);
      for (const x of [-1, 1]) { bunch(s, 16, 0.2, x, 2.3, 1, COLOURS.blush, x > 0 ? 81 : 82); bunch(s, 12, 0.18, x, 0.15, 1, COLOURS.white, x > 0 ? 83 : 84); }
      return s;
    },
  },
  flower_wall: {
    group: "ceremony", height: 2.4, on: "floor", colour: "blush", size: { w: 2.4, d: 0.2 }, block: true,
    make(col) {
      // a backdrop: a board covered in blooms, the colour mixed with white
      const s = shape();
      box(s, 2.4, 0.06, 0.3, 0, 0, 0, COLOURS.white);
      box(s, 2.4, 2.34, 0.06, 0, 0.06, -0.04, LEAF);
      let q = 7;
      const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
      for (let y = 0.13; y < 2.36; y += 0.1)
        for (let x = -1.15; x <= 1.15; x += 0.1) {
          const pick = rnd();
          ball(s, 0.045 + 0.015 * rnd(), x + (rnd() - 0.5) * 0.04, y, 0.02, pick < 0.55 ? col : pick < 0.9 ? COLOURS.white : LEAF, 8);
        }
      return s;
    },
  },
  flower_stand: {
    group: "ceremony", height: 1.37, on: "floor", colour: "gold", size: { r: 0.27 }, block: true,
    make(col) {
      const s = shape();
      cyl(s, 0.18, 0.14, 0.04, 0, 0, 0, col, 24); rod(s, [0, 0.04, 0], [0, 0.95, 0], 0.025, col, 10);
      cyl(s, 0.08, 0.16, 0.1, 0, 0.95, 0, col, 24);
      bunch(s, 50, 0.24, 0, 1.2, 0, COLOURS.white, 91); bunch(s, 20, 0.2, 0, 1.25, 0.05, COLOURS.blush, 92);
      return s;
    },
  },
  aisle_flowers: {
    group: "ceremony", height: 0.41, on: "floor", colour: "blush", size: { r: 0.25 }, block: false,
    make(col) {
      const s = shape();
      box(s, 0.24, 0.16, 0.24, 0, 0, 0, COLOURS.white);
      bunch(s, 30, 0.22, 0, 0.27, 0, col, 101); bunch(s, 12, 0.2, 0, 0.25, 0, COLOURS.white, 102);
      return s;
    },
  },
  welcome_sign: {
    group: "ceremony", height: 1.6, on: "floor", colour: "gold", size: { w: 0.7, d: 0.6 }, block: true,
    make(col) {
      // a board on an easel, leaning back
      const s = shape();
      rod(s, [-0.28, 0, 0.15], [-0.04, 1.6, -0.1], 0.015, col, 6);
      rod(s, [0.28, 0, 0.15], [0.04, 1.6, -0.1], 0.015, col, 6);
      rod(s, [0, 0, -0.4], [0, 1.5, -0.1], 0.015, col, 6);
      box(s, 0.6, 0.03, 0.06, 0, 0.62, 0.08, col);
      const lean = 0.17, b = [];
      for (const [x, y] of [[-0.3, 0.65], [0.3, 0.65], [0.3, 1.5], [-0.3, 1.5]]) b.push(vert(s, x, y, 0.1 - (y - 0.65) * lean, COLOURS.white));
      quad(s, ...b); quad(s, b[3], b[2], b[1], b[0]);
      return s;
    },
  },
  // ------------------------------------------------ the bar and food
  bar: {
    group: "bar", height: 1.1, on: "floor", colour: "wood", size: { w: 2.4, d: 0.62 }, block: true, top: 1.1,
    make(col) {
      // the counter: a front panel, the top, a foot rail for the guests (at +z)
      const s = shape();
      box(s, 2.4, 1.05, 0.6, 0, 0, 0, col);
      for (let k = -5; k <= 5; k++) box(s, 0.02, 0.9, 0.01, k * 0.2, 0.08, 0.305, other(col, COLOURS.wood, COLOURS.ivory));
      box(s, 2.5, 0.05, 0.68, 0, 1.05, 0.02, COLOURS.white);
      rod(s, [-1.15, 0.18, 0.4], [1.15, 0.18, 0.4], 0.02, COLOURS.gold, 10);
      for (const x of [-1, 0, 1]) rod(s, [x, 0.18, 0.4], [x, 0.18, 0.3], 0.012, COLOURS.gold, 6);
      return s;
    },
  },
  back_bar: {
    group: "bar", height: 2.0, on: "floor", colour: "wood", size: { w: 2.0, d: 0.36 }, block: true,
    make(col) {
      // shelves of bottles and glasses behind the bar
      const s = shape();
      box(s, 2.0, 2.0, 0.04, 0, 0, -0.16, col);
      for (const x of [-0.98, 0.98]) box(s, 0.04, 2.0, 0.36, x, 0, 0, col);
      box(s, 2.0, 0.9, 0.36, 0, 0, 0, col);
      let q = 3;
      const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
      for (const y of [0.9, 1.3, 1.7]) {
        box(s, 1.92, 0.03, 0.34, 0, y - 0.03, 0, col);
        for (let x = -0.85; x <= 0.86; x += 0.13) {
          if (y === 1.7) { glassAt(s, x, y, 0.02); continue; }
          const h = 0.22 + 0.08 * rnd(), c = BOTTLES[Math.floor(rnd() * BOTTLES.length)];
          cyl(s, 0.035, 0.035, h, x, y, 0, c, 10); cyl(s, 0.035, 0.012, 0.05, x, y + h, 0, c, 10);
          rod(s, [x, y + h + 0.05, 0], [x, y + h + 0.1, 0], 0.012, c, 6);
        }
      }
      return s;
    },
  },
  bar_stool: {
    group: "bar", height: 0.76, on: "floor", colour: "wood", size: { r: 0.22 }, block: true, seat: { y: 0.76, z: 0, back: false },
    make(col) {
      const s = shape();
      cyl(s, 0.19, 0.19, 0.05, 0, 0.71, 0, col, 24);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * 2 * Math.PI + Math.PI / 4;
        rod(s, [0.2 * Math.sin(a), 0, 0.2 * Math.cos(a)], [0.13 * Math.sin(a), 0.71, 0.13 * Math.cos(a)], 0.015, col, 6);
      }
      for (let k = 0; k < 16; k++) {                    // a foot ring
        const a = (k / 16) * 2 * Math.PI, b = ((k + 1) / 16) * 2 * Math.PI;
        rod(s, [0.17 * Math.sin(a), 0.3, 0.17 * Math.cos(a)], [0.17 * Math.sin(b), 0.3, 0.17 * Math.cos(b)], 0.01, COLOURS.black, 6);
      }
      return s;
    },
  },
  buffet: {
    group: "bar", height: 0.98, on: "floor", colour: "white", size: { w: 2.44, d: 0.84 }, block: true, top: 0.76,
    make(col) {
      const s = shape();
      cloth(s, 2.44, 0.84, 0.76, col);
      for (const x of [-0.8, 0, 0.8]) {
        box(s, 0.55, 0.1, 0.34, x, 0.76, -0.05, SILVER);
        cyl(s, 0.16, 0.1, 0.1, x, 0.86, -0.05, SILVER, 20);
        ball(s, 0.025, x, 0.96, -0.05, SILVER, 8);
      }
      return s;
    },
  },
  // ------------------------------------------------ lights
  string_lights: {
    group: "lights", height: 2.8, hangs: true, on: "floor", colour: "white", size: { w: 4, d: 0.1 }, block: false,
    make() {
      // a festoon 4 m long, hung 2.8 m up at its ends, sagging 35 cm
      const s = shape(), at = (x) => 2.8 - 0.35 * (1 - (x / 2) ** 2);
      for (let k = 0; k < 20; k++) {
        const x0 = -2 + (4 * k) / 20, x1 = -2 + (4 * (k + 1)) / 20;
        rod(s, [x0, at(x0), 0], [x1, at(x1), 0], 0.004, WIRE, 4);
      }
      for (let x = -1.8; x <= 1.81; x += 0.4) {
        rod(s, [x, at(x), 0], [x, at(x) - 0.05, 0], 0.008, WIRE, 6);
        lit(() => ball(s, 0.03, x, at(x) - 0.08, 0, BULB, 10));
      }
      return s;
    },
  },
  light_pole: {
    group: "lights", height: 3.0, on: "floor", colour: "black", size: { r: 0.22 }, block: true,
    make(col) { const s = shape(); cyl(s, 0.2, 0.17, 0.4, 0, 0, 0, other(col, COLOURS.black, COLOURS.wood), 20); rod(s, [0, 0.4, 0], [0, 3.0, 0], 0.025, col, 8); return s; },
  },
  chandelier: {
    group: "lights", height: 3.2, hangs: true, on: "floor", colour: "gold", size: { r: 0.5 }, block: false,
    make(col) {
      // hung from 3.2 m: chains, two rings of candle bulbs
      const s = shape();
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * 2 * Math.PI;
        rod(s, [0, 3.2, 0], [0.45 * Math.sin(a), 2.55, 0.45 * Math.cos(a)], 0.006, col, 4);
      }
      for (const [R, y, n] of [[0.45, 2.55, 10], [0.25, 2.7, 6]]) {
        let prev = null;
        for (let k = 0; k <= 30; k++) {
          const a = (k / 30) * 2 * Math.PI, p = [R * Math.sin(a), y, R * Math.cos(a)];
          if (prev) rod(s, prev, p, 0.012, col, 6);
          prev = p;
        }
        for (let k = 0; k < n; k++) {
          const a = (k / n) * 2 * Math.PI, x = R * Math.sin(a), z = R * Math.cos(a);
          cyl(s, 0.012, 0.012, 0.08, x, y, z, WAX, 8);
          lit(() => ball(s, 0.016, x, y + 0.1, z, BULB, 8));
        }
      }
      ball(s, 0.06, 0, 2.5, 0, col, 12);
      return s;
    },
  },
  fairy_curtain: {
    group: "lights", height: 2.41, hangs: true, on: "floor", colour: "white", size: { w: 2.4, d: 0.06 }, block: true,
    make() {
      // a backdrop of strands of tiny lights, hung from a bar
      const s = shape();
      rod(s, [-1.2, 2.4, 0], [1.2, 2.4, 0], 0.012, WIRE, 6);
      for (let x = -1.15; x <= 1.16; x += 0.1) {
        rod(s, [x, 2.4, 0], [x, 0.3, 0], 0.0025, WIRE, 3);
        lit(() => { for (let y = 2.3; y >= 0.3; y -= 0.1) ball(s, 0.01, x, y + ((x * 10) % 2 ? 0.05 : 0), 0, BULB, 6); });
      }
      return s;
    },
  },
  uplight: {
    group: "lights", height: 0.2, on: "floor", colour: "blush", size: { r: 0.12 }, block: false,
    make(col) {
      // a small floor light washing a wall in its colour
      const s = shape();
      box(s, 0.18, 0.12, 0.16, 0, 0, 0, COLOURS.black);
      lit(() => box(s, 0.14, 0.012, 0.12, 0, 0.12, 0, col.map((c) => Math.min(1, c * 1.15))));
      box(s, 0.2, 0.08, 0.02, 0, 0.12, -0.08, COLOURS.black);
      return s;
    },
  },
  // ------------------------------------------------ lounge and dancing
  sofa: {
    group: "lounge", height: 0.82, on: "floor", colour: "ivory", size: { w: 1.7, d: 0.85 }, block: true,
    seats: [{ x: -0.38, y: 0.44, z: 0.05, back: true }, { x: 0.38, y: 0.44, z: 0.05, back: true }],
    make(col) {
      // a deep, softly rounded sofa on tapered brass feet: a base, two seat and two back
      // cushions, rounded arms
      const s = shape(), feet = COLOURS.gold;
      for (const x of [-0.76, 0.76]) for (const z of [-0.34, 0.34]) cyl(s, 0.018, 0.026, 0.1, x, 0, z, feet, 12);
      soft(s, 1.7, 0.2, 0.85, 0, 0.08, 0, col, 0.05);
      for (const x of [-0.355, 0.355]) soft(s, 0.7, 0.17, 0.66, x, 0.26, 0.07, col, 0.07);
      soft(s, 1.7, 0.56, 0.2, 0, 0.26, -0.325, col, 0.08);
      for (const x of [-0.355, 0.355]) soft(s, 0.68, 0.36, 0.18, x, 0.42, -0.19, col, 0.08);
      for (const x of [-0.77, 0.77]) soft(s, 0.16, 0.36, 0.85, x, 0.26, 0, col, 0.07);
      return s;
    },
  },
  armchair: {
    group: "lounge", height: 0.82, on: "floor", colour: "ivory", size: { w: 0.85, d: 0.85 }, block: true,
    seat: { y: 0.44, z: 0.05, back: true },
    make(col) {
      const s = shape(), feet = COLOURS.gold;
      for (const x of [-0.34, 0.34]) for (const z of [-0.34, 0.34]) cyl(s, 0.018, 0.026, 0.1, x, 0, z, feet, 12);
      soft(s, 0.85, 0.2, 0.85, 0, 0.08, 0, col, 0.05);
      soft(s, 0.56, 0.17, 0.66, 0, 0.26, 0.07, col, 0.07);
      soft(s, 0.85, 0.56, 0.2, 0, 0.26, -0.325, col, 0.08);
      soft(s, 0.54, 0.36, 0.18, 0, 0.42, -0.19, col, 0.08);
      for (const x of [-0.345, 0.345]) soft(s, 0.16, 0.36, 0.85, x, 0.26, 0, col, 0.07);
      return s;
    },
  },
  coffee_table: {
    group: "lounge", height: 0.42, on: "floor", colour: "wood", size: { w: 1.0, d: 0.55 }, block: true, top: 0.42,
    make(col) {
      const s = shape();
      box(s, 1.0, 0.04, 0.55, 0, 0.38, 0, col);
      for (const x of [-0.45, 0.45]) for (const z of [-0.22, 0.22]) box(s, 0.04, 0.38, 0.04, x, 0, z, col);
      return s;
    },
  },
  rug: {
    group: "lounge", height: 0.01, on: "floor", colour: "ivory", size: { w: 2.4, d: 1.7 }, block: false,
    make(col) {
      const s = shape(), edge = other(col, COLOURS.ivory, COLOURS.white);
      box(s, 2.4, 0.006, 1.7, 0, 0, 0, edge); box(s, 2.2, 0.008, 1.5, 0, 0.002, 0, col);
      return s;
    },
  },
  dance_floor: {
    group: "lounge", height: 0.02, on: "floor", colour: "white", size: { w: 4.8, d: 4.8 }, block: false,
    make(col) {
      // 8 x 8 gloss panels in the colour, each a shade off its neighbour as lacquer is, on a
      // thin edge trim
      const s = shape(), n = 8, t = 4.8 / n;
      made("satin", () => {
        for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
          const tint = 1 - 0.025 * (((i * 7 + k * 3) % 4) / 3);
          box(s, t - 0.006, 0.02, t - 0.006, -2.4 + t * (i + 0.5), 0, -2.4 + t * (k + 0.5), col.map((v) => v * tint));
        }
      });
      for (const [w, d, x, z] of [[4.84, 0.02, 0, 2.41], [4.84, 0.02, 0, -2.41], [0.02, 4.84, 2.41, 0], [0.02, 4.84, -2.41, 0]]) box(s, w, 0.015, d, x, 0, z, COLOURS.gold);
      return s;
    },
  },
});

// the groups the panel shows the starters in, in order
export const GROUPS = ["tables", "table", "ceremony", "bar", "lights", "lounge"];

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
                   seats: st.seats, block: st.block, posts: st.posts, colour: st.colour, group: st.group };
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

// A place setting in front of each seat at a table p (the chairs, benches round it): from the seat
// along the way it faces, to just inside the table's edge, its front toward the guest, on the
// table's top. Seats far from the table, and spots that already have a setting, are left out.
export function setTable(tableDef, p, placed, defs, setting = "place_setting") {
  if (tableDef.top === undefined) return [];
  const out = [], y = (p.y || 0) + tableDef.top, inset = 0.22;
  const taken = (x, z) => placed.concat(out).some((q) => q.item === setting && Math.hypot(q.x - x, q.z - z) < 0.2);
  for (const q of placed) {
    const d = defs(q.item);
    if (q === p || !d || d.on === "top") continue;
    const t = q.turn || 0, dir = [Math.sin(t), Math.cos(t)];
    for (const st of d.seats || (d.seat ? [d.seat] : [])) {
      const [sx, sz] = rot(t, st.x || 0, st.z || 0);
      for (let k = 1; k <= 24; k++) {
        const x = q.x + sx + dir[0] * 0.05 * k, z = q.z + sz + dir[1] * 0.05 * k;
        if (!covers(tableDef, p, x, z, -inset)) continue;
        if (!taken(x, z)) out.push({ item: setting, x, y, z, turn: wrap(t + Math.PI) });
        break;
      }
    }
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
    if (!d) continue;
    const t = p.turn || 0;
    for (const st of d.seats || (d.seat ? [d.seat] : [])) {
      const [x, z] = rot(t, st.x || 0, st.z || 0);
      out.push({ x: p.x + x, y: (p.y || 0) + st.y, z: p.z + z, dir: [Math.sin(t), Math.cos(t)], back: st.back, decor: true });
    }
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

// ---------------------------------------------------------------- handles on the picked thing
// Like the body's joints: grab a handle on the thing itself. A ring on the floor round it turns
// it (its knob shows the way its front faces), a knob over it raises and lowers it, and the thing
// itself moves along the floor. `lift` is how far it is raised above where it would stand.
const STEP_TURN = Math.PI / 12, STEP_LIFT = 0.01;
export const MAX_LIFT = 5;

// where the handles go for a placed p: the ring's radius and height, the turn knob, the lift knob
export function handles(def, p) {
  const sz = def.size, r = (sz.r !== undefined ? sz.r : Math.hypot(sz.w, sz.d) / 2) + 0.12;
  const base = p.y || 0, t = p.turn || 0;
  return {
    ring: { r, y: base + 0.01 },
    turn: [p.x + r * Math.sin(t), base + 0.01, p.z + r * Math.cos(t)],
    lift: [p.x, base + Math.min(def.height, 3) + 0.25, p.z],
  };
}

// the turn that points p's front at the floor point (x, z): in 15° steps, or free
export function turnToward(p, x, z, free = false) {
  const a = Math.atan2(x - p.x, z - p.z);
  return wrap(free ? a : Math.round(a / STEP_TURN) * STEP_TURN);
}

// The height on the upright line through p that a pointer ray (origin o, direction d, in the
// map's metres) passes closest to; null when the ray runs along the line.
export function heightOnRay(p, o, d) {
  const w = [o[0] - p.x, o[1], o[2] - p.z];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], denom = a - d[1] * d[1];
  if (denom < 1e-9) return null;
  const dw = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
  return (a * w[1] - d[1] * dw) / denom;
}

// a lift kept to 0..MAX_LIFT, in centimetres
export const clampLift = (v) => Math.round(Math.min(MAX_LIFT, Math.max(0, v)) / STEP_LIFT) * STEP_LIFT;

// The height p stands at: where it would be dropped (the floor, a table) plus its lift.
export function standY(def, placed, defs, p, roomTop = () => 0) {
  return dropY(def, placed, defs, p.x, p.z, roomTop, p) + (p.lift || 0);
}

// ---------------------------------------------------------------- the list of what is in the room
// One line per placed thing, in kinds (its group, then made from photos), numbered within its name
// when there is more than one: [{ k (its index in placed), name, n, group }]
export function listing(placed, nameOf, groupOf) {
  const count = new Map(), seen = new Map();
  for (const p of placed) count.set(p.item, (count.get(p.item) || 0) + 1);
  const rows = placed.map((p, k) => {
    const n = (seen.get(p.item) || 0) + 1;
    seen.set(p.item, n);
    return { k, item: p.item, name: nameOf(p.item) + (count.get(p.item) > 1 ? " " + n : ""), group: groupOf(p.item) };
  });
  const order = (g) => { const i = GROUPS.indexOf(g); return i < 0 ? GROUPS.length : i; };
  return rows.sort((a, b) => order(a.group) - order(b.group) || a.item.localeCompare(b.item) || a.k - b.k);
}

// ---------------------------------------------------------------- pictures for the panel
// a shape's bounds: { lo: [x, y, z], hi: [x, y, z] }
export function bounds(p) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.length; k++) { lo[k % 3] = Math.min(lo[k % 3], p[k]); hi[k % 3] = Math.max(hi[k % 3], p[k]); }
  return { lo, hi };
}

// Where the camera stands for a thing's picture: three-quarters from its front (+z), a little
// to its right and above, far enough that all of it fits; the shadow's size under it.
export function thumbView(b, fov = 28) {
  const c = [0, 1, 2].map((a) => (b.lo[a] + b.hi[a]) / 2), size = [0, 1, 2].map((a) => b.hi[a] - b.lo[a]);
  const r = Math.max(0.05, Math.hypot(...size) / 2);
  const dir = [0.5, 0.42, 1], n = Math.hypot(...dir), far = (r / Math.sin((fov / 2) * Math.PI / 180)) * 1.02;
  return {
    fov, target: c,
    eye: c.map((v, a) => v + (dir[a] / n) * far),
    shadow: [Math.max(0.1, size[0] * 1.3), Math.max(0.1, size[2] * 1.3)],
  };
}
