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
  coral: [0.93, 0.42, 0.33], rattan: [0.74, 0.57, 0.37], copper: [0.83, 0.52, 0.4],
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

// ---------------------------------------------------------------- the flower shop
// What a florist puts round a wedding on the beach: calla lilies in tall glass, gerberas, clouds of
// baby's breath along the aisle, banks of tropical flowers (torch ginger, celosia plumes,
// alstroemeria, button chrysanthemums, golden rod), orchids, hydrangeas, pampas, greenery hung
// from the roof; and the lanterns, wicker lamps and wooden things they stand among. Each flower
// is built facing up at the origin and put in place by facing().
const STEM = [0.36, 0.55, 0.28], DARK_LEAF = [0.17, 0.33, 0.19], EUCALYPTUS = [0.5, 0.63, 0.56], PALM = [0.25, 0.42, 0.22];
const RED = [0.8, 0.1, 0.14], CORAL = [0.96, 0.45, 0.38], ORANGE = [0.96, 0.52, 0.14], YELLOW = [0.98, 0.79, 0.16];
const MAGENTA = [0.78, 0.18, 0.52], ORCHID = [0.8, 0.58, 0.86], PINK = [0.96, 0.62, 0.72], SNOW = [0.98, 0.98, 0.96];
const CENTRE = [0.62, 0.5, 0.16], SPADIX = [0.98, 0.82, 0.3], COPPER = [0.83, 0.52, 0.4], RATTAN = [0.74, 0.57, 0.37];
const DECK = [0.6, 0.42, 0.27], PAMPAS = [0.9, 0.83, 0.7], LINEN = [0.95, 0.93, 0.88];
for (const [cols, f] of [[[COPPER, COLOURS.copper], F.metal], [[RATTAN, DECK, COLOURS.rattan], F.wood]]) for (const c of cols) finishes.set(c, f);
// what was built moved up or down so its lowest point is on y = 0 (leaves and blooms piled loosely)
function grounded(s) {
  let lo = Infinity;
  for (let k = 1; k < s.p.length; k += 3) lo = Math.min(lo, s.p[k]);
  for (let k = 1; k < s.p.length; k += 3) s.p[k] -= lo;
  return s;
}
function rng(seed) { let q = (seed % 2147483646) + 1; return () => ((q = (q * 16807) % 2147483647) / 2147483647); }
// a unit direction tipped `tilt` from straight up toward the angle a
const tipped = (a, tilt) => [Math.sin(tilt) * Math.sin(a), Math.cos(tilt), Math.sin(tilt) * Math.cos(a)];

// a gerbera or a daisy, b across: a domed heart and a ring of long flat petals
function daisy(s, b, col, centre = CENTRE, n = 18) {
  made("satin", () => {
    blob(s, b * 0.26, b * 0.12, b * 0.26, 0, 0, 0, centre, 0, 8);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI;
      blob(s, b * 0.09, b * 0.025, b * 0.36, Math.sin(a) * b * 0.6, -b * 0.03, Math.cos(a) * b * 0.6, col, a, 6);
    }
  });
}
// a calla lily: a spathe rolled into a trumpet, open at the front (+z) and rising to a point at
// the back, its yellow spadix inside
function calla(s, b, col) {
  const U = 6, A = 12, pts = [];
  made("satin", () => {
    for (let u = 0; u <= U; u++) for (let v = 0; v <= A; v++) {
      const t = u / U, a = 0.35 + (v / A) * (2 * Math.PI - 0.7);
      const r = b * (0.05 + 0.42 * t * t), y = b * 1.25 * t + b * 0.55 * t ** 3 * (1 - Math.cos(a)) / 2;
      pts.push(vert(s, r * Math.sin(a), y, r * Math.cos(a), t < 0.25 ? STEM : col));
    }
    for (let u = 0; u < U; u++) for (let v = 0; v < A; v++)
      quad(s, pts[u * (A + 1) + v], pts[u * (A + 1) + v + 1], pts[(u + 1) * (A + 1) + v + 1], pts[(u + 1) * (A + 1) + v]);
    rod(s, [0, b * 0.2, 0], [0, b * 0.85, b * 0.04], b * 0.05, SPADIX, 5);
  });
}
// a phalaenopsis orchid facing up: two broad petals, three narrow sepals and a small darker lip
function orchid(s, b, col) {
  const lip = col.map((v) => v * 0.65);
  made("satin", () => {
    for (const a of [1.15, -1.15]) blob(s, b * 0.3, b * 0.03, b * 0.27, Math.sin(a) * b * 0.3, 0, Math.cos(a) * b * 0.3, col, a, 7);
    for (const a of [Math.PI, 2.2, -2.2]) blob(s, b * 0.13, b * 0.025, b * 0.3, Math.sin(a) * b * 0.32, -b * 0.01, Math.cos(a) * b * 0.32, col, a, 6);
    blob(s, b * 0.12, b * 0.05, b * 0.14, 0, b * 0.02, b * 0.12, lip, 0, 6);
  });
}
// a cloud of tiny blooms (baby's breath) over a dome r across at (cx, cy, cz)
function cloud(s, n, r, cx, cy, cz, col, seed, h = 0.6) {
  // (puffs of florets, those deeper in the cloud a shade darker, as it is in shadow there)
  const rnd = rng(seed), bud = 0.014 + r * 0.03, deep = col.map((v) => v * 0.82);
  made("satin", () => {
    for (let k = 0; k < n; k++) {
      const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()), up = Math.sqrt(Math.max(0, 1 - d * d)), depth = 0.55 + 0.45 * rnd();
      ball(s, bud * (0.6 + 0.8 * rnd()), cx + Math.sin(a) * d * r * depth, cy + up * r * h * depth, cz + Math.cos(a) * d * r * depth,
           depth < 0.75 ? deep : col, 4);
    }
  });
}
// a plume (celosia, astilbe) h tall from its foot at p, leaning toward a by `lean`
function plume(s, h, r, p, col, seed, a = 0, lean = 0) {
  const rnd = rng(seed), d = tipped(a, lean), n = Math.round(14 + 50 * h);
  rod(s, p, [p[0] + d[0] * h * 0.3, p[1] + d[1] * h * 0.3, p[2] + d[2] * h * 0.3], 0.004, STEM, 4);
  made("satin", () => {
    for (let k = 0; k < n; k++) {
      const t = 0.3 + 0.7 * (k / n), w = r * (1 - t) * 1.4, q = rnd() * 2 * Math.PI;
      ball(s, r * 0.28 * (1.1 - t * 0.6), p[0] + d[0] * h * t + Math.sin(q) * w, p[1] + d[1] * h * t, p[2] + d[2] * h * t + Math.cos(q) * w, col, 4);
    }
  });
}
// a torch ginger (or a heliconia's head): a cone of waxy bracts, h tall
function torch(s, h, col) {
  const lit = col.map((v) => Math.min(1, v * 1.15 + 0.05));
  made("satin", () => {
    for (let j = 0; j < 6; j++) {
      const t = j / 6, R = h * 0.42 * (1 - t * 0.75), n = 7 - j;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI + j;
        blob(s, R * 0.45, h * 0.13, R * 0.5, Math.sin(a) * R * 0.6, h * (0.08 + 0.15 * j), Math.cos(a) * R * 0.6, j % 2 ? lit : col, a, 6);
      }
    }
  });
}
// a button chrysanthemum: a ball of tiny petals
function pompom(s, b, col) { made("satin", () => { blob(s, b * 0.5, b * 0.38, b * 0.5, 0, 0, 0, col, 0, 8); daisy(s, b, col, col, 12); }); }
// a long leaf from p toward d (unit), len long; broad (monstera, banana) or narrow (palm, ginger)
function leaf(s, p, d, len, wide, col) {
  const a = Math.atan2(d[0], d[2]), c = [p[0] + d[0] * len / 2, p[1] + d[1] * len / 2, p[2] + d[2] * len / 2];
  facing([-d[0] * d[1], 1 - d[1] * d[1] + 1e-3, -d[2] * d[1]].map((v, _, arr) => v / Math.hypot(...arr)), c,
         () => blob(s, len * wide, len * 0.03, len / 2, 0, 0, 0, col, a, 6));
}
// a palm frond: a stem curving from p toward a, leaflets either side
function frond(s, p, a, len, col) {
  let prev = p;
  for (let k = 1; k <= 8; k++) {
    const t = k / 8, out = len * t, drop = len * 0.45 * t * t;
    const q = [p[0] + Math.sin(a) * out, p[1] + len * 0.35 * t - drop, p[2] + Math.cos(a) * out];
    rod(s, prev, q, 0.004, col, 4);
    for (const side of [-1, 1]) {
      const sa = a + side * 1.2, l = len * 0.32 * (1 - t * 0.6);
      blob(s, l * 0.1, 0.004, l / 2, q[0] + Math.sin(sa) * l / 2, q[1] - l * 0.15, q[2] + Math.cos(sa) * l / 2, col, sa, 6);
    }
    prev = q;
  }
}
// a sprig of eucalyptus from p toward d: round grey-green leaves along a thin stem
function sprig(s, p, d, len, seed) {
  const rnd = rng(seed);
  rod(s, p, [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len], 0.003, STEM, 4);
  for (let k = 1; k <= 6; k++) {
    const t = k / 6.5, q = [p[0] + d[0] * len * t, p[1] + d[1] * len * t, p[2] + d[2] * len * t];
    blob(s, len * 0.07, 0.003, len * 0.07, q[0] + (rnd() - 0.5) * 0.02, q[1], q[2] + (rnd() - 0.5) * 0.02, EUCALYPTUS, rnd() * 6, 6);
  }
}
// a tropical mix in a bank w across (x) by d deep (z), h high, as the florists line the aisle with
// in the photos: a mound of leaves, and over it patches of one flower each (a drift of button
// chrysanthemums, one of alstroemeria, red plumes, torch gingers, orchids, roses), packed so no
// leaf shows between them on top; `col` the colour it leans on
function tropical(s, w, d, h, col, seed) {
  const rnd = rng(seed), A = w / 2, B = d / 2, L = Math.min(1, w / 0.8);
  const top = (x, z) => h * Math.sqrt(Math.max(0, 1 - (x / A) ** 2 - (z / B) ** 2)) ** 0.7;
  for (let k = 0; k < Math.max(8, Math.round(w * d * 60)); k++) {
    const x = (rnd() - 0.5) * w * 0.9, z = (rnd() - 0.5) * d * 0.9, a = Math.atan2(x / A, z / B) + (rnd() - 0.5);
    leaf(s, [x * 0.8, top(x, z) * 0.5, z * 0.8], tipped(a, 0.7 + 0.5 * rnd()), L * (0.22 + 0.18 * rnd()), 0.3, k % 3 ? DARK_LEAF : LEAF);
  }
  const kinds = ["mum", "alstro", "plume", col === COLOURS.coral ? "torch" : "rose", "mum", "orchid", "golden", "torch", "alstro", "rose"];
  const patch = Math.max(0.16, Math.min(w, 0.6) / 3);
  for (let px = -A + patch / 2, n = 0; px < A; px += patch * 0.8, n++) for (const pz of d > 0.5 ? [-B / 2, B / 2] : [0]) {
    const kind = kinds[(n * 3 + (pz > 0 ? 1 : 0) + seed) % kinds.length], c0 = [col, RED, ORANGE, YELLOW, MAGENTA, CORAL, PINK][(n + seed) % 7];
    for (let k = 0; k < 12; k++) {
      const x = px + (rnd() - 0.5) * patch, z = pz + (rnd() - 0.5) * Math.min(d, 0.5);
      if ((x / A) ** 2 + (z / B) ** 2 > 0.92) continue;
      const y = top(x, z), dir = tipped(Math.atan2(x / A, z / B), 0.25 + 0.9 * Math.min(1, Math.hypot(x / A, z / B))), p = [x, y, z];
      if (kind === "mum") facing(dir, p, () => pompom(s, 0.055, k % 4 ? (c0 === RED ? YELLOW : c0) : YELLOW));
      else if (kind === "alstro") facing(dir, p, () => daisy(s, 0.06, k % 3 ? ORANGE : CORAL, YELLOW, 6));
      else if (kind === "plume") plume(s, 0.2 + 0.1 * rnd(), 0.03, [x, y - 0.05, z], k % 2 ? RED : MAGENTA, seed + n * 31 + k, Math.atan2(x, z), 0.3);
      else if (kind === "golden") plume(s, 0.16, 0.035, [x, y - 0.04, z], YELLOW, seed + n * 37 + k, Math.atan2(x, z), 0.5);
      else if (kind === "torch") { if (k % 2) facing(dir, [x, y - 0.02, z], () => torch(s, 0.17, k % 4 === 1 ? PINK : RED)); else facing(dir, p, () => pompom(s, 0.05, ORANGE)); }
      else if (kind === "orchid") facing(dir, p, () => orchid(s, 0.09, k % 2 ? ORCHID : MAGENTA));
      else facing(dir, p, () => bloom(s, 0.05, 0, 0, 0, c0, rnd() * 6));
    }
  }
}
// a woven shell (wicker, rattan) of rings and staves: radius r(t) from t = 0 (foot) to 1 (top)
function woven(s, h, r, cx, cy, cz, col, rings = 8, staves = 14) {
  const at = (t, a) => [cx + r(t) * Math.sin(a), cy + h * t, cz + r(t) * Math.cos(a)];
  for (let j = 0; j <= rings; j++) {
    let prev = null;
    for (let k = 0; k <= 24; k++) { const p = at(j / rings, (k / 24) * 2 * Math.PI); if (prev) rod(s, prev, p, 0.004, col, 4); prev = p; }
  }
  for (let k = 0; k < staves; k++) {
    let prev = null;
    for (let j = 0; j <= 8; j++) { const p = at(j / 8, (k / staves) * 2 * Math.PI + j * 0.06); if (prev) rod(s, prev, p, 0.0035, col, 4); prev = p; }
  }
}

Object.assign(STARTERS, {
  calla_vase: {
    group: "flowers", height: 0.92, on: "top", colour: "white", size: { r: 0.22 }, block: false,
    make(col) {
      // a tall glass cylinder, the stems showing through it, a sheaf of callas leaning out over it
      const s = shape();
      cyl(s, 0.075, 0.075, 0.5, 0, 0, 0, GLASS, 24);
      const rnd = rng(5);
      for (let k = 0; k < 15; k++) {
        const a = k * 2.4, tilt = 0.08 + 0.3 * (k % 5) / 4, len = 0.62 + 0.18 * rnd(), d = tipped(a, tilt);
        const top = [d[0] * len * 0.6, 0.05 + d[1] * len, d[2] * len * 0.6];
        rod(s, [0.03 * Math.sin(a), 0.02, 0.03 * Math.cos(a)], top, 0.005, STEM, 5);
        facing(tipped(a, tilt + 0.5), top, () => calla(s, 0.075, col));
      }
      return s;
    },
  },
  gerbera_posy: {
    group: "flowers", height: 0.24, on: "top", colour: "white", size: { r: 0.18 }, block: false,
    make(col) {
      // a low loose posy of gerberas among their leaves, as laid along a cake table
      const s = shape(), rnd = rng(9);
      for (let k = 0; k < 8; k++) leaf(s, [0, 0.03, 0], tipped(k * 0.8, 1.2), 0.2, 0.25, DARK_LEAF);
      for (let k = 0; k < 13; k++) {
        const a = k * 2.4, r = 0.13 * Math.sqrt((k + 0.5) / 13), d = tipped(a, 0.25 + r * 2.5);
        const p = [Math.sin(a) * r, 0.2 + 0.06 * (1 - r / 0.13) + 0.02 * rnd(), Math.cos(a) * r];
        rod(s, [0, 0.03, 0], p, 0.004, STEM, 4);
        facing(d, p, () => daisy(s, 0.075, col));
      }
      return grounded(s);
    },
  },
  baby_breath_bank: {
    group: "flowers", height: 0.52, on: "floor", colour: "white", size: { w: 1.4, d: 0.7 }, block: false,
    make(col) {
      // a bank of baby's breath along an aisle, palm leaves tucked under its front edge
      const s = shape(), rnd = rng(13);
      for (let k = 0; k < 10; k++) frond(s, [(rnd() - 0.5) * 1.1, 0.05, 0.12], (rnd() - 0.5) * 1.2, 0.3, PALM);
      for (let k = 0; k < 9; k++) cloud(s, 300, 0.24, -0.52 + k * 0.13, 0.04 + 0.03 * rnd(), (rnd() - 0.5) * 0.1, col, 40 + k, 1.9);
      return grounded(s);
    },
  },
  tropical_bank: {
    group: "flowers", height: 0.97, on: "floor", colour: "coral", size: { w: 1.4, d: 0.94 }, block: false,
    make(col) { const s = shape(); tropical(s, 1.3, 0.55, 0.85, col, 21); return grounded(s); },
  },
  floral_ring: {
    group: "flowers", height: 2.67, on: "floor", colour: "white", size: { w: 2.5, d: 0.6 }, block: "posts", posts: [[-0.6, 0], [0.6, 0]],
    make(col) {
      // a ring arch covered in white flowers and greenery all the way round, on a low base of the
      // same flowers, the sea seen through it
      const s = shape(), R = 1.12, cy = 1.36;
      hoop(s, R, 0, cy, 0, 0.02, WIRE, -0.95, Math.PI + 0.95, 40);
      // a thick rope of florets all round the ring (the part above the base), deeper ones darker
      const rnd = rng(17), deep = col.map((v) => v * 0.82);
      made("satin", () => { for (let k = 0; k < 2600; k++) {
        const a = -0.95 + rnd() * (Math.PI + 1.9), q = rnd() * 2 * Math.PI, d = 0.16 * Math.sqrt(rnd());
        const rr = R + Math.cos(q) * d;
        ball(s, 0.012 + 0.012 * rnd(), rr * Math.cos(a), cy + rr * Math.sin(a), Math.sin(q) * d, d < 0.1 ? deep : col, 4);
      } });
      for (let k = 0; k < 18; k++) {
        const a = -0.8 + (k / 17) * (Math.PI + 1.6), x = R * Math.cos(a), y = cy + R * Math.sin(a);
        bunch(s, 4, 0.08, x * 1.02, y, 0.08, k % 3 ? col : COLOURS.ivory, 300 + k);
        if (k % 2) sprig(s, [x, y, 0.05], [Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.5], 0.22, k);
      }
      for (const x of [-0.6, 0.6]) cloud(s, 260, 0.32, x, 0, 0, col, x > 0 ? 7 : 8, 1.4);
      return grounded(s);
    },
  },
  table_garland: {
    group: "flowers", height: 0.23, on: "top", colour: "coral", size: { w: 1.6, d: 0.44 }, block: false,
    make(col) {
      // a low garland down a long table: roses, orchids, golden sprays and greenery, as in the photos
      const s = shape(), rnd = rng(31), mix = [col, RED, CORAL, PINK, col];
      for (let k = 0; k < 18; k++) sprig(s, [-0.75 + k * 0.088, 0.01, (rnd() - 0.5) * 0.2], tipped(rnd() * 6.3, 1.25), 0.18, k);
      for (let k = 0; k < 64; k++) {
        const x = -0.74 + (k % 32) * 0.048, z = (k < 32 ? -0.06 : 0.06) + (rnd() - 0.5) * 0.08, y = 0.12 + 0.07 * rnd();
        const c = mix[k % mix.length], d = tipped(rnd() * 6.3, 0.5 * rnd());
        if (k % 4 === 1) facing(d, [x, y + 0.03, z], () => orchid(s, 0.09, k % 8 === 1 ? ORCHID : MAGENTA));
        else if (k % 4 === 3) facing(d, [x, y, z], () => pompom(s, 0.05, k % 8 === 3 ? YELLOW : PINK));
        else facing(d, [x, y, z], () => bloom(s, 0.065, 0, 0, 0, c, rnd() * 6));
        if (k % 3 === 0) plume(s, 0.14, 0.014, [x + 0.03, 0.12, z - 0.04], YELLOW, k, rnd() * 6, 0.5);
      }
      return grounded(s);
    },
  },
  floating_candles: {
    group: "flowers", height: 0.36, on: "top", colour: "white", size: { r: 0.11 }, block: false,
    make(col) {
      // three glass cylinders of water, each with a candle floating at the top
      const s = shape();
      for (const [x, z, h] of [[-0.06, 0.03, 0.36], [0.06, 0.04, 0.27], [0, -0.07, 0.2]]) {
        cyl(s, 0.05, 0.05, h, x, 0, z, GLASS, 20);
        cyl(s, 0.042, 0.042, 0.03, x, h - 0.05, z, col, 18);
        lit(() => ball(s, 0.01, x, h - 0.01, z, FLAME, 6));
      }
      return s;
    },
  },
  grass_vase: {
    group: "flowers", height: 0.46, on: "top", colour: "green", size: { r: 0.13 }, block: false,
    make(col) {
      // a ribbed glass jar of tall green wheat grass
      const s = shape(), rnd = rng(17);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * 2 * Math.PI; rod(s, [0.07 * Math.sin(a), 0, 0.07 * Math.cos(a)], [0.075 * Math.sin(a), 0.18, 0.075 * Math.cos(a)], 0.008, GLASS, 4); }
      cyl(s, 0.068, 0.072, 0.18, 0, 0, 0, GLASS, 24);
      for (let k = 0; k < 40; k++) {
        const a = rnd() * 6.3, d = tipped(a, 0.1 + 0.45 * rnd()), len = 0.2 + 0.08 * rnd(), p = [0, 0.16, 0];
        const q = [d[0] * len, 0.16 + d[1] * len, d[2] * len];
        rod(s, p, q, 0.0025, col, 3);
        blob(s, 0.006, 0.03, 0.006, q[0], q[1], q[2], col.map((v) => v * 1.1), 0, 4);
      }
      return s;
    },
  },
  orchid_pot: {
    group: "flowers", height: 0.62, on: "top", colour: "white", size: { w: 0.38, d: 0.34 }, block: false,
    make(col) {
      // a phalaenopsis in a white pot: broad leaves at its foot, an arching spray of flowers
      const s = shape();
      cyl(s, 0.07, 0.09, 0.14, 0, 0, 0, COLOURS.white, 22);
      for (let k = 0; k < 5; k++) leaf(s, [0, 0.14, 0], tipped(k * 1.25, 1.2), 0.2, 0.3, DARK_LEAF);
      let prev = [0, 0.14, 0];
      for (let k = 1; k <= 9; k++) {
        const t = k / 9, p = [0.15 * t * t, 0.14 + 0.42 * Math.sin(t * 1.6), 0.02];
        rod(s, prev, p, 0.003, STEM, 4);
        if (k >= 4) facing([0.3, 0.2, 1].map((v) => v / Math.hypot(0.3, 0.2, 1)), p, () => orchid(s, 0.1, col));
        prev = p;
      }
      return s;
    },
  },
  hydrangea_bowl: {
    group: "flowers", height: 0.29, on: "top", colour: "white", size: { r: 0.17 }, block: false,
    make(col) {
      // a low bowl of hydrangea heads: domes of small four-petalled florets
      const s = shape(), rnd = rng(23), tint = col.map((v) => v * 0.93);
      cyl(s, 0.11, 0.14, 0.09, 0, 0, 0, COLOURS.white, 24);
      for (const [x, z] of [[0, 0], [0.09, 0.05], [-0.08, 0.06], [0.02, -0.09], [-0.07, -0.05], [0.08, -0.05]]) {
        made("satin", () => { for (let k = 0; k < 110; k++) {
          const a = rnd() * 6.3, d = Math.sqrt(rnd()) * 0.08, up = Math.sqrt(Math.max(0, 1 - (d / 0.08) ** 2));
          blob(s, 0.02, 0.008, 0.02, x + Math.sin(a) * d, 0.12 + up * 0.08 + (x === 0 && z === 0 ? 0.08 : 0), z + Math.cos(a) * d, k % 3 ? col : tint, a, 4);
        } });
      }
      return s;
    },
  },
  pampas_vase: {
    group: "flowers", height: 1.65, on: "floor", colour: "ivory", size: { w: 0.85, d: 0.6 }, block: true,
    make(col) {
      // a tall rattan floor vase of pampas plumes
      const s = shape(), rnd = rng(29);
      woven(s, 0.6, (t) => 0.14 + 0.06 * Math.sin(Math.PI * t * 0.9), 0, 0, 0, RATTAN, 7, 16);
      for (let k = 0; k < 11; k++) {
        const a = k * 2.4, tilt = 0.1 + 0.4 * rnd(), d = tipped(a, tilt), len = 0.55 + 0.25 * rnd();
        const base = [0, 0.55, 0], top = [d[0] * len, 0.55 + d[1] * len, d[2] * len];
        rod(s, base, top, 0.004, PAMPAS.map((v) => v * 0.8), 4);
        plume(s, 0.32, 0.05, top, col, 60 + k, a, tilt);
      }
      return s;
    },
  },
  floor_arrangement: {
    group: "flowers", height: 0.69, on: "floor", colour: "coral", size: { w: 1.1, d: 0.84 }, block: true,
    make(col) {
      // under a dessert table: monstera and palm leaves and a mix of flowers on the sand
      const s = shape(), rnd = rng(37);
      for (let k = 0; k < 7; k++) leaf(s, [(rnd() - 0.5) * 0.6, 0.02, (rnd() - 0.5) * 0.2], tipped(rnd() * 6.3, 0.9), 0.4, 0.4, DARK_LEAF);
      tropical(s, 0.8, 0.4, 0.55, col, 41);
      return grounded(s);
    },
  },
  petals: {
    group: "flowers", height: 0.01, on: "floor", colour: "white", size: { w: 1.0, d: 3 }, block: false,
    make(col) {
      // petals scattered down an aisle, thicker toward its edges
      const s = shape(), rnd = rng(43);
      made("satin", () => { for (let k = 0; k < 260; k++) {
        const side = rnd() < 0.5 ? -1 : 1, x = side * 0.5 * Math.sqrt(rnd()), z = (rnd() - 0.5) * 3;
        blob(s, 0.018, 0.003, 0.014, x, 0.004, z, k % 5 ? col : col.map((v) => v * 0.9), rnd() * 6, 5);
      } });
      return s;
    },
  },
  wildflower_jar: {
    group: "flowers", height: 0.42, on: "top", colour: "coral", size: { w: 0.4, d: 0.5 }, block: false,
    make(col) {
      // a short jar of the tropical mix, for a cocktail table or a shelf
      const s = shape();
      cyl(s, 0.06, 0.06, 0.12, 0, 0, 0, GLASS, 20);
      const was = place;
      place = (x, y, z) => [x, 0.1 + y, z];
      try { tropical(s, 0.3, 0.3, 0.22, col, 47); } finally { place = was; }
      return s;
    },
  },
  hanging_greenery: {
    group: "flowers", height: 2.9, hangs: true, on: "floor", colour: "gold", size: { w: 2.2, d: 1.6 }, block: false,
    make(col) {
      // a cloud of greenery hung from the roof, ferns and fronds falling from it, sprays of flowers
      // in it, as over the dessert table in the photos
      const s = shape(), rnd = rng(53);
      for (const x of [-0.5, 0.5]) rod(s, [x, 2.9, 0], [x, 2.6, 0], 0.003, WIRE, 3);
      for (let k = 0; k < 56; k++) frond(s, [(rnd() - 0.5) * 1.1, 2.55 + 0.3 * rnd(), (rnd() - 0.5) * 0.6], rnd() * 6.3, 0.35 + 0.3 * rnd(), k % 3 ? PALM : DARK_LEAF);
      for (let k = 0; k < 24; k++) {
        const p = [(rnd() - 0.5) * 1.1, 2.5 + 0.1 * rnd(), (rnd() - 0.5) * 0.6];
        if (k % 2) plume(s, 0.2, 0.02, p, col, k, rnd() * 6, 2.6);
        else facing(tipped(rnd() * 6, 2.2), p, () => orchid(s, 0.09, k % 4 ? MAGENTA : PINK));
      }
      return s;
    },
  },
  flower_cloud: {
    group: "flowers", height: 2.9, hangs: true, on: "floor", colour: "white", size: { r: 0.52 }, block: false,
    make(col) {
      // a cloud of baby's breath hung overhead
      const s = shape();
      rod(s, [0, 2.9, 0], [0, 2.75, 0], 0.003, WIRE, 3);
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4, r = 0.4 * Math.sqrt((k + 0.5) / 9);
        cloud(s, 90, 0.2, Math.sin(a) * r, 2.42 + 0.06 * (k % 3), Math.cos(a) * r, col, 70 + k, 1.4);
      }
      return s;
    },
  },
  eucalyptus_runner: {
    group: "flowers", height: 0.05, on: "top", colour: "green", size: { w: 1.85, d: 0.24 }, block: false,
    make() {
      // a loose garland of eucalyptus down the middle of a table
      const s = shape(), rnd = rng(59);
      for (let k = 0; k < 34; k++) sprig(s, [-0.75 + k * 0.045, 0.012, (rnd() - 0.5) * 0.12], tipped((k % 2 ? 1.2 : -1.9) + rnd() * 0.6, 1.35), 0.2, k);
      return grounded(s);
    },
  },
  // ------------------------------------------------ what the flowers stand among
  copper_lantern: {
    group: "lights", height: 0.6, on: "floor", colour: "copper", size: { r: 0.13 }, block: false,
    make(col) {
      // a rose-copper lantern: glass sides, a roof and a ring, a candle inside
      const s = shape();
      box(s, 0.24, 0.025, 0.24, 0, 0, 0, col);
      for (const [x, z] of [[-0.11, -0.11], [0.11, -0.11], [0.11, 0.11], [-0.11, 0.11]]) rod(s, [x, 0.02, z], [x, 0.42, z], 0.007, col, 5);
      for (const [w, d, x, z] of [[0.21, 0.004, 0, 0.11], [0.21, 0.004, 0, -0.11], [0.004, 0.21, 0.11, 0], [0.004, 0.21, -0.11, 0]]) box(s, w, 0.4, d, x, 0.022, z, GLASS);
      box(s, 0.25, 0.025, 0.25, 0, 0.42, 0, col);
      cyl(s, 0.13, 0.03, 0.1, 0, 0.445, 0, col, 4);
      cyl(s, 0.03, 0.03, 0.03, 0, 0.545, 0, col, 12);
      hoop(s, 0.035, 0, 0.6, 0, 0.005, col, Math.PI, 2 * Math.PI + 0.01, 10);
      cyl(s, 0.035, 0.035, 0.15, 0, 0.025, 0, WAX, 14); lit(() => ball(s, 0.012, 0, 0.19, 0, FLAME, 8));
      return s;
    },
  },
  wicker_pendant: {
    group: "lights", height: 2.9, hangs: true, on: "floor", colour: "rattan", size: { r: 0.38 }, block: false,
    make(col) {
      // a wide woven lampshade hung from the roof, a warm bulb inside
      const s = shape();
      rod(s, [0, 2.9, 0], [0, 2.52, 0], 0.004, WIRE, 4);
      woven(s, 0.26, (t) => 0.36 * Math.sin(Math.PI / 2 * (1 - t) + 0.25) + 0.02, 0, 2.28, 0, col, 6, 22);
      lit(() => ball(s, 0.04, 0, 2.42, 0, BULB, 10));
      return s;
    },
  },
  wicker_lantern: {
    group: "lights", height: 0.6, on: "floor", colour: "rattan", size: { r: 0.2 }, block: false,
    make(col) {
      // a woven floor lantern, round-bellied, a candle glowing inside
      const s = shape();
      woven(s, 0.6, (t) => 0.06 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.1)), 0, 0, 0, col, 9, 18);
      cyl(s, 0.06, 0.06, 0.01, 0, 0, 0, col, 14);
      cyl(s, 0.03, 0.03, 0.12, 0, 0.01, 0, WAX, 12); lit(() => ball(s, 0.012, 0, 0.145, 0, FLAME, 8));
      return s;
    },
  },
  deck_aisle: {
    group: "ceremony", height: 0.06, on: "floor", colour: "wood", size: { w: 1.5, d: 6 }, block: false,
    make(col) {
      // a boardwalk of planks across the sand to the altar
      const s = shape();
      for (const x of [-0.6, 0, 0.6]) box(s, 0.08, 0.04, 6, x, 0, 0, col.map((v) => v * 0.8));
      for (let k = 0; k < 40; k++) box(s, 1.5, 0.02, 0.14, 0, 0.04, -2.93 + k * 0.15, col.map((v) => v * (0.93 + 0.07 * ((k * 7) % 3))));
      return s;
    },
  },
  fabric_ceiling: {
    group: "ceremony", height: 3.0, hangs: true, on: "floor", colour: "white", size: { w: 4, d: 4 }, block: false,
    make(col) {
      // white voile hung in swags under a roof, 4 m square: each length falls between two bars
      const s = shape(), n = 8, lo = 2.35;
      for (let k = 0; k <= n; k++) rod(s, [-2, 3.0, -2 + (4 * k) / n], [2, 3.0, -2 + (4 * k) / n], 0.006, WIRE, 4);
      made("cloth", () => { for (let k = 0; k < n; k++) {
        const z0 = -2 + (4 * k) / n, z1 = z0 + 4 / n, pts = [], X = 24, Z = 6;
        for (let i = 0; i <= X; i++) for (let j = 0; j <= Z; j++) {
          const x = -2 + (4 * i) / X, t = j / Z, z = z0 + (z1 - z0) * t;
          const sag = (3.0 - lo) * Math.sin(Math.PI * t) * (0.85 + 0.15 * Math.sin(x * 3 + k));
          pts.push(vert(s, x, 3.0 - sag, z, col));
        }
        for (let i = 0; i < X; i++) for (let j = 0; j < Z; j++)
          quad(s, pts[i * (Z + 1) + j], pts[i * (Z + 1) + j + 1], pts[(i + 1) * (Z + 1) + j + 1], pts[(i + 1) * (Z + 1) + j]);
      } });
      return s;
    },
  },
  cane_chair: {
    group: "tables", height: 0.88, on: "floor", colour: "wood", size: { w: 0.44, d: 0.48 }, block: true, seat: { y: 0.46, z: 0, back: true },
    make(col) {
      // a wooden chair with a woven cane back and seat, as round the long tables in the photos
      const s = shape(), cane = RATTAN;
      for (const [x, z] of [[-0.2, 0.21], [0.2, 0.21]]) box(s, 0.035, 0.44, 0.035, x, 0, z, col);
      for (const x of [-0.2, 0.2]) box(s, 0.035, 0.88, 0.035, x, 0, -0.22, col);
      box(s, 0.44, 0.035, 0.46, 0, 0.42, 0, col);
      box(s, 0.38, 0.012, 0.4, 0, 0.455, 0, cane);
      box(s, 0.38, 0.03, 0.03, 0, 0.84, -0.22, col);
      box(s, 0.36, 0.3, 0.008, 0, 0.52, -0.22, cane);
      return s;
    },
  },
  farm_table: {
    group: "tables", height: 0.76, on: "floor", colour: "wood", size: { w: 2.2, d: 0.9 }, block: true, top: 0.76,
    make(col) {
      // a long table of bare planks on square legs, a linen runner down it
      const s = shape();
      for (let k = 0; k < 5; k++) box(s, 2.2, 0.04, 0.178, 0, 0.72, -0.36 + k * 0.18, col.map((v) => v * (0.94 + 0.06 * (k % 2))));
      for (const x of [-1.0, 1.0]) for (const z of [-0.36, 0.36]) box(s, 0.08, 0.72, 0.08, x, 0, z, col.map((v) => v * 0.85));
      box(s, 2.0, 0.06, 0.06, 0, 0.62, 0, col.map((v) => v * 0.85));
      box(s, 0.4, 0.004, 0.9, 0, 0.76, 0, LINEN);
      return s;
    },
  },
  rattan_setting: {
    group: "table", height: 0.025, on: "top", colour: "rattan", size: { w: 0.42, d: 0.42 }, block: false,
    make(col) {
      // a looped rattan charger, a painted plate on it and a linen napkin under its edge
      const s = shape();
      box(s, 0.18, 0.004, 0.36, 0.12, 0, 0.02, LINEN);
      for (const R of [0.19, 0.16, 0.13]) {
        const pts = [];
        for (let k = 0; k <= 48; k++) { const a = (k / 48) * 2 * Math.PI, r = R + 0.012 * Math.sin(a * 12); pts.push([r * Math.sin(a), 0.006, r * Math.cos(a)]); }
        for (let k = 0; k < 48; k++) rod(s, pts[k], pts[k + 1], 0.004, col, 4);
      }
      cyl(s, 0.12, 0.13, 0.014, 0, 0.01, 0, COLOURS.white, 36);
      cyl(s, 0.08, 0.08, 0.001, 0, 0.0245, 0, CORAL, 24);
      return s;
    },
  },
});

// ---------------------------------------------------------------- from the decorators' proposals
// What two local decorators show for a wedding at the venue: clouds of greenery, bougainvillea and
// orchids hung over the tables with filament bulbs and woven lamps among them, a half-moon arch,
// a flower swing, red ginger on moss, a canoe of flowers, rattan lounges on jute rugs, backdrops
// for photos (bamboo, a green wall, woven plates), and the small furniture they stand on.
const CORDYLINE = [0.62, 0.12, 0.32], BOUGAIN = [0.86, 0.14, 0.46], MONSTERA = [0.13, 0.3, 0.17], MOSS = [0.3, 0.33, 0.17];
const JUTE = [0.72, 0.6, 0.42], CLAY = [0.72, 0.4, 0.28], BAMBOO = [0.76, 0.66, 0.45], TRUNK = [0.45, 0.31, 0.2];
const CUSHION = [0.95, 0.94, 0.9], BEIGE = [0.82, 0.76, 0.66], SNAP = [0.97, 0.96, 0.9];
for (const [cols, f] of [[[JUTE, BAMBOO, TRUNK], F.wood], [[CLAY], F.satin]]) for (const c of cols) finishes.set(c, f);
// what f() adds moved by (dx, dy, dz)
function at(dx, dy, dz, f) { const was = place; place = (x, y, z) => (was ? was(x + dx, y + dy, z + dz) : [x + dx, y + dy, z + dz]); try { f(); } finally { place = was; } }
// a filament bulb hung on a cord from `top` down to y: a glowing drop under a small dark cap
function bulb(s, x, top, y, z) {
  rod(s, [x, top, z], [x, y + 0.05, z], 0.002, WIRE, 3);
  cyl(s, 0.012, 0.012, 0.03, x, y + 0.03, z, WIRE, 8);
  lit(() => blob(s, 0.028, 0.04, 0.028, x, y, z, BULB, 0, 8));
}
// the lampshades of the photos, each `h` tall with its foot at y: their outlines from the foot (t 0)
// to the top (1), the cord above
const SHADES = {
  bell: (t) => 0.06 + 0.24 * (1 - t) ** 1.6, dome: (t) => 0.03 + 0.27 * Math.cos(t * Math.PI / 2),
  gourd: (t) => 0.03 + 0.16 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) ** 2 + 0.05 * (1 - t),
  egg: (t) => 0.02 + 0.17 * Math.sin(Math.PI * (0.08 + 0.88 * t)), drum: () => 0.17,
};
function shade(s, kind, h, x, y, z, top, col) {
  rod(s, [x, top, z], [x, y + h, z], 0.003, WIRE, 3);
  woven(s, h, SHADES[kind], x, y, z, col, kind === "drum" ? 10 : 8, kind === "drum" ? 26 : 18);
  lit(() => ball(s, 0.03, x, y + h * 0.45, z, BULB, 8));
}
// a canopy hung at y (its top), w by d: palm fronds, broad leaves and red cordyline falling from
// it; `extra(x, y, z, k)` adds what is tucked into it at a point under it
function canopy(s, w, d, y, n, seed, mix, extra) {
  const rnd = rng(seed);
  for (let k = 0; k < n; k++) {
    const x = (rnd() - 0.5) * w * 0.9, z = (rnd() - 0.5) * d * 0.9, a = rnd() * 6.3, kind = mix[k % mix.length];
    const p = [x, y - 0.12 * rnd(), z];
    if (kind === "palm") frond(s, p, a, 0.4 + 0.3 * rnd(), k % 2 ? PALM : DARK_LEAF);
    else if (kind === "monstera") leaf(s, p, tipped(a, 1.9 + 0.5 * rnd()), 0.36 + 0.14 * rnd(), 0.45, MONSTERA);
    else if (kind === "cordyline") leaf(s, p, tipped(a, 1.2 + 1.2 * rnd()), 0.34, 0.17, k % 3 ? CORDYLINE : RED);
    else if (kind === "fern") leaf(s, p, tipped(a, 2.5 + 0.4 * rnd()), 0.5 + 0.3 * rnd(), 0.12, k % 2 ? LEAF : PALM);
    if (extra) extra(x, y, z, k, rnd);
  }
}
// cords from the roof (at h) to the canopy's top
function hangers(s, h, y, xs) { for (const x of xs) rod(s, [x, h, 0], [x, y, 0], 0.003, WIRE, 3); }
// a cascade of phalaenopsis down from p, len long
function cascade(s, p, len, col, seed) {
  const rnd = rng(seed);
  let prev = p;
  for (let k = 1; k <= 7; k++) {
    const q = [p[0] + 0.04 * Math.sin(k + seed), p[1] - len * k / 7, p[2] + 0.04 * Math.cos(k * 1.3 + seed)];
    rod(s, prev, q, 0.003, STEM, 3);
    facing(tipped(rnd() * 6.3, 1.3), q, () => orchid(s, 0.11, col));
    prev = q;
  }
}
// a woven cube or drum, w across and h high, at (cx, cz): rattan or jute, banded as it is braided
function braided(s, w, d, h, cx, cz, col) {
  soft(s, w, h, d, cx, 0, cz, col, 0.04, 5);
  for (let k = 1; k < 6; k++) box(s, w + 0.006, 0.012, d + 0.006, cx, (h * k) / 6, cz, col.map((v) => v * 0.82));
}
// a round braided rug, r across, its rings a shade apart
function jute(s, r, col) {
  for (let k = 0; k < 7; k++) cyl(s, r * (1 - k / 7), r * (1 - k / 7), 0.006 + 0.0005 * k, 0, 0, 0, col.map((v) => v * (k % 2 ? 0.9 : 1)), 48);
}

// a dense rope of small mixed florets along points p(t), r thick: the mass under an arch's flowers
function florets(s, n, path, r, mix, seed) {
  const rnd = rng(seed);
  made("satin", () => { for (let k = 0; k < n; k++) {
    const p = path(rnd()), q = rnd() * 6.3, d = r * Math.sqrt(rnd());
    ball(s, 0.016 + 0.014 * rnd(), p[0] + Math.cos(q) * d * 0.7, p[1] + Math.sin(q) * d * 0.7, p[2] + Math.sin(q * 1.7) * d, mix[k % mix.length], 4);
  } });
}
Object.assign(STARTERS, {
  // ------------------------------------------------ hung overhead
  edison_bulbs: {
    group: "lights", height: 2.9, hangs: true, on: "floor", colour: "black", size: { r: 0.5 }, block: false,
    make() {
      // a cluster of bare filament bulbs on cords of every length, as over the cake table
      const s = shape(), rnd = rng(61);
      for (let k = 0; k < 22; k++) {
        const a = k * 2.4, r = 0.52 * Math.sqrt((k + 0.5) / 22);
        bulb(s, Math.sin(a) * r, 2.9, 1.9 + 0.75 * rnd(), Math.cos(a) * r);
      }
      return s;
    },
  },
  rattan_pendants: {
    group: "lights", height: 2.9, hangs: true, on: "floor", colour: "rattan", size: { w: 1.7, d: 1.15 }, block: false,
    make(col) {
      // a cluster of woven lamps of different shapes at different heights: bells, domes, gourds,
      // eggs and a drum, each with its bulb
      const s = shape();
      for (const [kind, h, x, y, z] of [["bell", 0.4, -0.55, 2.1, -0.2], ["egg", 0.5, -0.1, 1.95, 0.25], ["dome", 0.32, 0.35, 2.3, -0.25],
                                        ["gourd", 0.55, 0.62, 1.85, 0.22], ["drum", 0.45, 0.05, 2.25, -0.3], ["bell", 0.34, -0.3, 2.35, 0.3]])
        shade(s, kind, h, x, y, z, 2.9, col);
      return s;
    },
  },
  jute_pendant: {
    group: "lights", height: 2.9, hangs: true, on: "floor", colour: "rattan", size: { r: 0.2 }, block: false,
    make(col) {
      // a tall jute shade, a fringe of fibre hanging straight, a bulb glowing through it
      const s = shape();
      rod(s, [0, 2.9, 0], [0, 2.5, 0], 0.003, WIRE, 3);
      made("wood", () => { for (let k = 0; k < 90; k++) { const a = (k / 90) * 2 * Math.PI; rod(s, [0.18 * Math.sin(a), 2.5, 0.18 * Math.cos(a)], [0.19 * Math.sin(a), 1.95, 0.19 * Math.cos(a)], 0.0045, k % 3 ? col : col.map((v) => v * 0.85), 3); } });
      cyl(s, 0.18, 0.04, 0.03, 0, 2.48, 0, col, 24);
      lit(() => ball(s, 0.035, 0, 2.2, 0, BULB, 10));
      return s;
    },
  },
  globe_lanterns: {
    group: "lights", height: 2.9, hangs: true, on: "floor", colour: "white", size: { w: 1.4, d: 0.8 }, block: false,
    make(col) {
      // white paper globes at different heights, glowing softly
      const s = shape(), rnd = rng(67);
      for (let k = 0; k < 9; k++) {
        const x = -0.55 + (k % 5) * 0.28 + 0.05 * rnd(), z = (k % 2 ? 0.25 : -0.2) + 0.1 * (rnd() - 0.5), r = 0.1 + 0.07 * rnd(), y = 1.95 + 0.6 * rnd();
        rod(s, [x, 2.9, z], [x, y + r, z], 0.002, WIRE, 3);
        lit(() => ball(s, r, x, y, z, col.map((v) => Math.min(1, v * 1.02)), 16));
      }
      return s;
    },
  },
  tropical_cloud: {
    group: "flowers", height: 2.9, hangs: true, on: "floor", colour: "coral", size: { w: 2.9, d: 1.7 }, block: false,
    make(col) {
      // a cloud of palm fronds and red cordyline hung over a table, a few flowers in it and filament
      // bulbs hanging from under it
      const s = shape();
      hangers(s, 2.9, 2.6, [-0.7, 0.7]);
      canopy(s, 2.2, 1.2, 2.6, 200, 71, ["palm", "cordyline", "monstera", "palm", "cordyline"], (x, y, z, k, rnd) => {
        if (k % 9 === 0) bulb(s, x, y - 0.1, y - 0.5 - 0.3 * rnd(), z);
        else if (k % 9 === 4) facing(tipped(rnd() * 6, 2.4), [x, y - 0.15, z], () => torch(s, 0.14, k % 2 ? RED : col));
      });
      return s;
    },
  },
  bougainvillea_cloud: {
    group: "flowers", height: 2.9, hangs: true, on: "floor", colour: "blush", size: { w: 2.5, d: 1.6 }, block: false,
    make() {
      // a hung mass of magenta bougainvillea with its leaves, strands of greenery falling from it
      const s = shape(), rnd = rng(73), deep = BOUGAIN.map((v) => v * 0.78);
      hangers(s, 2.9, 2.62, [-0.8, 0.8]);
      canopy(s, 2.2, 1.0, 2.6, 40, 75, ["fern", "palm"]);
      made("satin", () => { for (let k = 0; k < 2400; k++) {
        const x = (rnd() - 0.5) * 2.2, z = (rnd() - 0.5) * 1.0, u = (x / 1.1) ** 2 + (z / 0.5) ** 2;
        if (u > 1) continue;
        const y = 2.62 - 0.4 * Math.sqrt(1 - u) * rnd() - 0.05;
        blob(s, 0.022, 0.012, 0.022, x, y, z, k % 4 ? BOUGAIN : deep, rnd() * 6, 4);
      } });
      return s;
    },
  },
  orchid_cloud: {
    group: "flowers", height: 2.9, hangs: true, on: "floor", colour: "white", size: { w: 2.2, d: 1.5 }, block: false,
    make(col) {
      // broad monstera leaves hung overhead and white orchids cascading down from among them
      const s = shape();
      hangers(s, 2.9, 2.6, [-0.7, 0.7]);
      canopy(s, 2.0, 1.1, 2.6, 60, 79, ["monstera", "fern", "monstera"], (x, y, z, k) => {
        if (k % 2 === 0) cascade(s, [x, y - 0.05, z], 0.4 + 0.08 * (k % 4), col, k);
      });
      return s;
    },
  },
  green_cloud: {
    group: "flowers", height: 2.9, hangs: true, on: "floor", colour: "green", size: { w: 2.7, d: 1.9 }, block: false,
    make() {
      // a cloud of ferns and palm leaves, filament bulbs hanging thick under it
      const s = shape();
      hangers(s, 2.9, 2.6, [-0.8, 0.8]);
      canopy(s, 2.2, 1.1, 2.6, 120, 83, ["fern", "palm", "fern"], (x, y, z, k, rnd) => { if (k % 5 === 0) bulb(s, x, y - 0.1, y - 0.45 - 0.35 * rnd(), z); });
      return s;
    },
  },
  ficus_pendants: {
    group: "lights", height: 2.9, hangs: true, on: "floor", colour: "rattan", size: { w: 1.8, d: 1.1 }, block: false,
    make(col) {
      // a canopy of small-leaved greenery with woven lamps hung close under it
      const s = shape(), rnd = rng(89);
      hangers(s, 2.9, 2.65, [-0.6, 0.6]);
      made("cloth", () => { for (let k = 0; k < 1500; k++) {
        const x = (rnd() - 0.5) * 1.7, z = (rnd() - 0.5) * 1.0;
        blob(s, 0.03, 0.005, 0.02, x, 2.65 - 0.25 * rnd(), z, k % 3 ? LEAF : DARK_LEAF, rnd() * 6, 4);
      } });
      for (const [kind, x, z] of [["bell", -0.5, -0.2], ["gourd", 0, 0.2], ["bell", 0.5, -0.15], ["egg", -0.2, 0.25]])
        shade(s, kind, 0.4, x, 1.95, z, 2.4, col);
      return s;
    },
  },
  hanging_pots: {
    group: "flowers", height: 2.9, hangs: true, on: "floor", colour: "white", size: { w: 2.0, d: 0.5 }, block: false,
    make(col) {
      // a row of white pots hung on cords, ferns and philodendron spilling from each
      const s = shape(), rnd = rng(97);
      for (let k = 0; k < 5; k++) {
        const x = -0.8 + k * 0.4, y = 2.0 + 0.15 * (k % 2);
        for (const a of [0, 2.1, 4.2]) rod(s, [x, 2.9, 0], [x + 0.11 * Math.sin(a), y + 0.16, 0.11 * Math.cos(a)], 0.002, WIRE, 3);
        cyl(s, 0.09, 0.12, 0.16, x, y, 0, col, 20);
        for (let j = 0; j < 9; j++) leaf(s, [x, y + 0.15, 0], tipped(rnd() * 6.3, 0.9 + 1.1 * rnd()), 0.22 + 0.1 * rnd(), j % 2 ? 0.4 : 0.14, j % 3 ? LEAF : MONSTERA);
      }
      return s;
    },
  },
  voile_swags: {
    group: "ceremony", height: 3.0, hangs: true, on: "floor", colour: "white", size: { w: 4, d: 3 }, block: false,
    make(col) {
      // long lengths of voile hung loose across a roof, side by side, each gathered in soft folds
      // across its width and sagging deep between its ends
      const s = shape();
      made("cloth", () => { for (const [z, dip, w] of [[-1.15, 0.75, 0.55], [-0.38, 0.95, 0.6], [0.38, 0.8, 0.6], [1.15, 0.95, 0.55]]) {
        const pts = [], U = 32, V = 10;
        for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) {
          const t = i / U, v = j / V - 0.5, sag = dip * Math.sin(Math.PI * t), wide = w * (0.35 + 0.65 * Math.sin(Math.PI * t));
          const fold = 0.035 * Math.sin(v * Math.PI * 6) * (0.3 + Math.sin(Math.PI * t));
          pts.push(vert(s, -2 + 4 * t, 3.0 - sag + fold - 0.08 * v * v, z + v * wide, col));
        }
        for (let i = 0; i < U; i++) for (let j = 0; j < V; j++)
          quad(s, pts[i * (V + 1) + j], pts[i * (V + 1) + j + 1], pts[(i + 1) * (V + 1) + j + 1], pts[(i + 1) * (V + 1) + j]);
      } });
      for (const x of [-2, 2]) rod(s, [x, 3.0, -1.5], [x, 3.0, 1.5], 0.006, WIRE, 4);
      return s;
    },
  },
  // ------------------------------------------------ flowers that stand
  ginger_moss: {
    group: "flowers", height: 0.89, on: "top", colour: "coral", size: { w: 1.44, d: 0.46 }, block: false,
    make() {
      // red ginger standing up out of a long mound of moss on a table, long leaves among them
      const s = shape(), rnd = rng(101);
      made("cloth", () => { for (let k = 0; k < 26; k++) blob(s, 0.09 + 0.05 * rnd(), 0.06, 0.08, -0.62 + k * 0.05, 0.03, (rnd() - 0.5) * 0.12, k % 3 ? MOSS : MOSS.map((v) => v * 0.8), rnd() * 6, 6); });
      for (let k = 0; k < 13; k++) {
        const x = -0.6 + k * 0.1 + 0.03 * rnd(), z = (rnd() - 0.5) * 0.14, len = 0.4 + 0.3 * rnd(), d = tipped(rnd() * 6.3, 0.15 * rnd());
        const top = [x + d[0] * len, 0.05 + d[1] * len, z + d[2] * len];
        rod(s, [x, 0.04, z], top, 0.005, STEM, 4);
        facing(d, top, () => torch(s, 0.12, k % 4 ? RED : CORDYLINE));
        leaf(s, [x, 0.06, z], tipped(rnd() * 6.3, 0.35 + 0.4 * rnd()), 0.45, 0.13, k % 2 ? LEAF : DARK_LEAF);
      }
      return grounded(s);
    },
  },
  bromeliad: {
    group: "flowers", height: 0.46, on: "floor", colour: "coral", size: { r: 0.26 }, block: false,
    make(col) {
      // a bromeliad in a woven basket: a rosette of striped leaves, its red heart in the middle
      const s = shape();
      woven(s, 0.22, (t) => 0.15 + 0.04 * t, 0, 0, 0, RATTAN, 6, 16);
      for (let k = 0; k < 16; k++) leaf(s, [0, 0.2, 0], tipped(k * 2.4, 0.5 + 0.8 * (k / 16)), 0.32, 0.12, k % 2 ? [0.55, 0.7, 0.45] : [0.85, 0.36, 0.4]);
      facing([0, 1, 0], [0, 0.24, 0], () => torch(s, 0.12, col === COLOURS.coral ? RED : col));
      return s;
    },
  },
  white_garden: {
    group: "flowers", height: 0.81, on: "floor", colour: "white", size: { w: 1.6, d: 0.86 }, block: false,
    make(col) {
      // a bank of white flowers for an aisle or under a cake table: roses, snapdragon spires,
      // orchids and baby's breath among broad leaves
      const s = shape(), rnd = rng(107);
      for (let k = 0; k < 14; k++) leaf(s, [(rnd() - 0.5) * 1.2, 0.05, (rnd() - 0.5) * 0.4], tipped(rnd() * 6.3, 1.0), 0.42, 0.4, k % 2 ? MONSTERA : DARK_LEAF);
      for (let k = 0; k < 7; k++) cloud(s, 160, 0.18, -0.6 + k * 0.2, 0.05, (rnd() - 0.5) * 0.3, SNOW, 110 + k, 1.6);
      for (let k = 0; k < 28; k++) {
        const x = (rnd() - 0.5) * 1.3, z = (rnd() - 0.5) * 0.5, y = 0.22 + 0.15 * rnd();
        facing(tipped(rnd() * 6.3, 0.6 * rnd()), [x, y, z], () => bloom(s, 0.06, 0, 0, 0, k % 4 ? col : COLOURS.ivory, rnd() * 6));
      }
      for (let k = 0; k < 9; k++) plume(s, 0.45 + 0.2 * rnd(), 0.035, [(rnd() - 0.5) * 1.2, 0.2, (rnd() - 0.5) * 0.3], SNAP, 120 + k, rnd() * 6, 0.15);
      for (let k = 0; k < 4; k++) cascade(s, [-0.5 + k * 0.33, 0.55, 0.15], 0.28, col, 130 + k);
      return grounded(s);
    },
  },
  clay_vases: {
    group: "flowers", height: 0.45, on: "top", colour: "coral", size: { w: 0.44, d: 0.24 }, block: false,
    make(col) {
      // three terracotta gourd vases, a few stems in each, for a lounge's side table
      const s = shape(), rnd = rng(113);
      for (const [x, z, h] of [[-0.13, 0, 0.2], [0.04, 0.04, 0.26], [0.15, -0.03, 0.16]]) {
        made("satin", () => { const q = (t) => 0.02 + 0.06 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)) ** 1.5; for (let j = 0; j < 8; j++) cyl(s, q(j / 8), q((j + 1) / 8), h / 8, x, (h * j) / 8, z, CLAY, 18); });
        for (let k = 0; k < 3; k++) {
          const d = tipped(rnd() * 6.3, 0.25 * rnd()), len = 0.12 + 0.06 * rnd(), top = [x + d[0] * len, h + d[1] * len, z + d[2] * len];
          rod(s, [x, h - 0.02, z], top, 0.003, STEM, 3);
          facing(d, top, () => (k ? bloom(s, 0.035, 0, 0, 0, col, k) : daisy(s, 0.05, PINK)));
        }
      }
      return s;
    },
  },
  flower_canoe: {
    group: "flowers", height: 0.71, on: "floor", colour: "coral", size: { w: 3.6, d: 0.95 }, block: true,
    make(col) {
      // an old wooden canoe on the lawn, filled with flowers and leaves
      const s = shape(), L = 1.8, B = 0.4, H = 0.34;
      made("wood", () => {
        const U = 36, V = 12, pts = [];
        for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) {
          // along it (t, the ends pointed and rising) and round its hull (v, from one gunwale to the other)
          const t = -1 + (2 * i) / U, v = -1 + (2 * j) / V, w = B * Math.sqrt(Math.max(0, 1 - t ** 4)), rim = H + 0.12 * t ** 4;
          pts.push(vert(s, t * L, rim - H * (1 - 0.5 * t * t) * Math.cos((v * Math.PI) / 2), w * Math.sin((v * Math.PI) / 2), j % 3 ? DECK : DECK.map((q) => q * 0.82)));
        }
        for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) quad(s, pts[i * (V + 1) + j], pts[i * (V + 1) + j + 1], pts[(i + 1) * (V + 1) + j + 1], pts[(i + 1) * (V + 1) + j]);
        for (const side of [-1, 1]) { let prev = null; for (let i = 0; i <= U; i++) { const t = -1 + (2 * i) / U, q = [t * L, H + 0.12 * t ** 4, side * B * Math.sqrt(Math.max(0, 1 - t ** 4))]; if (prev) rod(s, prev, q, 0.018, DECK.map((c) => c * 0.75), 5); prev = q; } }
      });
      at(0, 0.2, 0, () => tropical(s, 2.3, 0.5, 0.3, col, 117));
      return grounded(s);
    },
  },
  // ------------------------------------------------ the ceremony
  crescent_arch: {
    group: "ceremony", height: 2.65, on: "floor", colour: "coral", size: { w: 2.1, d: 0.85 }, block: "posts", posts: [[-0.3, 0]],
    make(col) {
      // a half-moon of flowers: a ring left open on one side, thick with tropical flowers and
      // leaves, its foot in a low bank of the same
      const s = shape(), R = 1.05, cy = 1.3, rnd = rng(127);
      hoop(s, R, 0, cy, 0, 0.02, WIRE, -1.75, 1.2, 40);
      const mix = [col, RED, MAGENTA, ORANGE, PINK, YELLOW];
      for (let k = 0; k < 100; k++) {
        const a = -1.75 + rnd() * 2.95, q = rnd() * 6.3, d = 0.18 * Math.sqrt(rnd()), rr = R + Math.cos(q) * d;
        const p = [rr * Math.cos(a), cy + rr * Math.sin(a), Math.sin(q) * d], out = [Math.cos(a) * Math.cos(q) * 0.6, Math.sin(a) * Math.cos(q) * 0.6, Math.sin(q) + 0.2];
        const n = Math.hypot(...out), dir = out.map((v) => v / n);
        if (k % 4 === 0) leaf(s, p, dir, 0.3, 0.2, k % 8 ? DARK_LEAF : CORDYLINE);
        else if (k % 4 === 1) facing(dir, p, () => orchid(s, 0.09, k % 8 === 1 ? ORCHID : MAGENTA));
        else facing(dir, p, () => bloom(s, 0.06, 0, 0, 0, mix[k % mix.length], rnd() * 6));
      }
      florets(s, 2200, (t) => { const a = -1.75 + t * 2.95; return [R * Math.cos(a), cy + R * Math.sin(a), 0]; }, 0.17, [DARK_LEAF, LEAF, col, RED, MAGENTA, PINK, DARK_LEAF, ORANGE], 133);
      at(0.2, 0, 0, () => tropical(s, 1.5, 0.5, 0.45, col, 131));
      return grounded(s);
    },
  },
  tropical_arch: {
    group: "ceremony", height: 2.78, on: "floor", colour: "coral", size: { w: 2.7, d: 0.74 }, block: "posts", posts: [[-1.05, 0], [1.05, 0]],
    make(col) {
      // an arch thick with tropical flowers and leaves from the ground over the top, for the altar
      const s = shape(), rnd = rng(137), mix = [col, RED, MAGENTA, ORANGE, PINK, YELLOW, CORAL];
      const path = (t) => { const a = Math.PI * Math.min(1, Math.max(0, (t - 0.3) / 0.4)); return t < 0.3 ? [-1.05, (t / 0.3) * 1.6, 0] : t > 0.7 ? [1.05, ((1 - t) / 0.3) * 1.6, 0] : [-1.05 * Math.cos(a), 1.6 + 0.9 * Math.sin(a), 0]; };
      for (let k = 0; k < 40; k++) rod(s, path(k / 40), path((k + 1) / 40), 0.025, WIRE, 6);
      florets(s, 3200, path, 0.2, [DARK_LEAF, LEAF, col, RED, MAGENTA, PINK, DARK_LEAF, ORANGE, YELLOW], 139);
      for (let k = 0; k < 140; k++) {
        const t = rnd(), p0 = path(t), q = rnd() * 6.3, d = 0.18 * Math.sqrt(rnd());
        const p = [p0[0] + Math.cos(q) * d * (t > 0.3 && t < 0.7 ? 0.3 : 1), p0[1] + Math.cos(q) * d * (t > 0.3 && t < 0.7 ? 1 : 0.2), Math.sin(q) * d];
        const dir = tipped(q, 1.3), kind = k % 5;
        if (kind === 0) leaf(s, p, tipped(rnd() * 6.3, 1.2), 0.3, 0.22, k % 10 ? DARK_LEAF : CORDYLINE);
        else if (kind === 1) facing(dir, p, () => torch(s, 0.12, RED));
        else if (kind === 2) facing(dir, p, () => orchid(s, 0.09, MAGENTA));
        else facing(dir, p, () => bloom(s, 0.06, 0, 0, 0, mix[k % mix.length], rnd() * 6));
      }
      return grounded(s);
    },
  },
  altar_table: {
    group: "ceremony", height: 0.95, on: "floor", colour: "wood", size: { w: 1.0, d: 0.5 }, block: true, top: 0.95,
    make(col) {
      // the small wooden table the celebrant stands behind
      const s = shape();
      box(s, 1.0, 0.04, 0.5, 0, 0.91, 0, col);
      for (const x of [-0.44, 0.44]) for (const z of [-0.2, 0.2]) box(s, 0.05, 0.91, 0.05, x, 0, z, col.map((v) => v * 0.88));
      box(s, 0.88, 0.08, 0.02, 0, 0.82, 0.2, col.map((v) => v * 0.88));
      box(s, 0.88, 0.03, 0.03, 0, 0.18, 0, col.map((v) => v * 0.88));
      return s;
    },
  },
  altar_deck: {
    group: "ceremony", height: 0.2, on: "floor", colour: "wood", size: { w: 3, d: 2 }, block: false, top: 0.2,
    make(col) {
      // a low wooden platform for the altar, its boards running across
      const s = shape();
      box(s, 3, 0.16, 2, 0, 0, 0, col.map((v) => v * 0.7));
      for (let k = 0; k < 14; k++) box(s, 3.02, 0.04, 0.14, 0, 0.16, -0.93 + k * 0.143, col.map((v) => v * (0.92 + 0.08 * ((k * 5) % 3) / 2)));
      return s;
    },
  },
  flower_swing: {
    group: "ceremony", height: 2.66, on: "floor", colour: "ivory", size: { w: 3.0, d: 1.7 }, block: "posts", posts: [[0, 0]],
    make(col) {
      // a ring of pampas and eucalyptus round a wooden swing seat, over an oval jute rug, for photos
      const s = shape(), R = 1.0, cy = 1.28, rnd = rng(139);
      made("wood", () => { for (let k = 0; k < 6; k++) { const pts = []; const r = 1.1 * (1 - k / 7); for (let j = 0; j <= 48; j++) { const a = (j / 48) * 2 * Math.PI; pts.push([r * 1.05 * Math.sin(a), 0.004 + 0.001 * k, r * 0.75 * Math.cos(a)]); } for (let j = 0; j < 48; j++) rod(s, pts[j], pts[j + 1], 0.012, k % 2 ? JUTE : JUTE.map((v) => v * 0.88), 4); } });
      hoop(s, R, 0, cy, 0, 0.02, WIRE);
      box(s, 0.9, 0.04, 0.3, 0, 0.5, 0, DECK);
      for (const x of [-0.4, 0.4]) rod(s, [x, 0.54, 0], [x * 0.6, cy + R * 0.98, 0], 0.006, JUTE, 4);
      for (let k = 0; k < 130; k++) {
        const a = rnd() * 6.3, p = [R * Math.cos(a), cy + R * Math.sin(a), (rnd() - 0.5) * 0.1];
        const out = tipped(rnd() * 6.3, 1.0);
        if (k % 3) plume(s, 0.38 + 0.2 * rnd(), 0.07, p, k % 2 ? PAMPAS : col, 140 + k, Math.atan2(Math.cos(a), 0.3), 0.6 + rnd());
        else sprig(s, p, out, 0.25, k);
      }
      return grounded(s);
    },
  },
  bamboo_screen: {
    group: "ceremony", height: 2.4, on: "floor", colour: "wood", size: { w: 2.4, d: 0.12 }, block: true,
    make() {
      // a backdrop of bamboo poles side by side, ringed at their knots
      const s = shape(), rnd = rng(149);
      for (let k = 0; k < 30; k++) {
        const x = -1.16 + k * 0.08, r = 0.035 + 0.008 * rnd(), h = 2.25 + 0.15 * rnd(), c = BAMBOO.map((v) => v * (0.85 + 0.2 * rnd()));
        cyl(s, r, r, h, x, 0, (rnd() - 0.5) * 0.04, c, 10);
        for (let j = 1; j < 5; j++) cyl(s, r + 0.004, r + 0.004, 0.015, x, (h * j) / 5 + 0.1 * rnd(), 0, c.map((v) => v * 0.85), 10);
      }
      return s;
    },
  },
  green_wall: {
    group: "ceremony", height: 2.4, on: "floor", colour: "green", size: { w: 2.4, d: 0.3 }, block: true,
    make() {
      // a wall of leaves for photos, on a frame
      const s = shape(), rnd = rng(151);
      box(s, 2.4, 2.4, 0.08, 0, 0, -0.1, DARK_LEAF);
      for (let k = 0; k < 900; k++) {
        const x = (rnd() - 0.5) * 2.3, y = 0.05 + rnd() * 2.3;
        leaf(s, [x, y, -0.04], [0.3 * (rnd() - 0.5), -0.2 + 0.4 * rnd(), 0.9].map((v, _, a) => v / Math.hypot(...a)), 0.12 + 0.06 * rnd(), 0.3,
             [LEAF, DARK_LEAF, PALM, MONSTERA][k % 4]);
      }
      return grounded(s);
    },
  },
  woven_wall: {
    group: "ceremony", height: 2.4, on: "floor", colour: "rattan", size: { w: 2.4, d: 0.3 }, block: true,
    make(col) {
      // a green wall hung with woven placemats and fans of every size, for photos
      const s = shape(), rnd = rng(157);
      box(s, 2.4, 2.4, 0.08, 0, 0, -0.1, DARK_LEAF);
      for (let k = 0; k < 300; k++) leaf(s, [(rnd() - 0.5) * 2.3, 0.05 + rnd() * 2.3, -0.04], [0, 0, 1], 0.14, 0.3, k % 2 ? LEAF : DARK_LEAF);
      for (let k = 0; k < 22; k++) {
        const r = 0.1 + 0.16 * rnd(), x = (rnd() - 0.5) * (2.2 - r), y = r + rnd() * (2.3 - 2 * r);
        facing([0, 0, 1], [x, y, 0.02 + 0.002 * k], () => jute(s, r, k % 3 ? col : JUTE));
      }
      return s;
    },
  },
  // ------------------------------------------------ the lounge and what things stand on
  rattan_sofa: {
    group: "lounge", height: 0.8, on: "floor", colour: "rattan", size: { w: 1.8, d: 0.85 }, block: true,
    seats: [{ x: -0.42, y: 0.44, z: 0.05, back: true }, { x: 0.42, y: 0.44, z: 0.05, back: true }],
    make(col) {
      // a rattan sofa, its back and arms one rounded sweep, white cushions and a few patterned ones
      const s = shape();
      braided(s, 1.8, 0.8, 0.32, 0, 0, col);
      soft(s, 1.8, 0.42, 0.16, 0, 0.32, -0.33, col, 0.07, 5);
      for (const x of [-0.86, 0.86]) soft(s, 0.14, 0.26, 0.8, x, 0.32, 0, col, 0.06, 5);
      for (const x of [-0.42, 0.42]) soft(s, 0.8, 0.12, 0.6, x, 0.32, 0.06, CUSHION, 0.04, 5);
      for (const [x, c] of [[-0.6, CUSHION], [-0.25, EUCALYPTUS], [0.25, BEIGE], [0.6, CUSHION]]) soft(s, 0.38, 0.36, 0.13, x, 0.42, -0.2, c, 0.05, 5);
      return s;
    },
  },
  rattan_round_chair: {
    group: "lounge", height: 0.82, on: "floor", colour: "rattan", size: { w: 0.95, d: 0.9 }, block: true, seat: { y: 0.42, z: 0.08, back: true },
    make(col) {
      // a round rattan armchair, a bowl of woven cane on a low foot, a deep white cushion in it
      const s = shape(), U = 14, A = 32, pts = [];
      made("wood", () => {
        for (let u = 0; u <= U; u++) for (let v = 0; v <= A; v++) {
          const t = u / U, a = -2.4 + (v / A) * 4.8, r = 0.46 * Math.sin(Math.PI * (0.15 + 0.6 * t)) + 0.02;
          const y = 0.1 + 0.72 * t * (0.55 + 0.45 * Math.cos(a / 2.4 * Math.PI / 2) ** 2);
          pts.push(vert(s, r * Math.sin(a + Math.PI), Math.min(y, 0.1 + 0.72 * t), r * Math.cos(a + Math.PI) * 0.95, (u + v) % 2 ? col : col.map((q) => q * 0.88)));
        }
        for (let u = 0; u < U; u++) for (let v = 0; v < A; v++) quad(s, pts[u * (A + 1) + v], pts[u * (A + 1) + v + 1], pts[(u + 1) * (A + 1) + v + 1], pts[(u + 1) * (A + 1) + v]);
      });
      cyl(s, 0.2, 0.26, 0.1, 0, 0, 0, col, 24);
      soft(s, 0.7, 0.14, 0.62, 0, 0.3, 0.06, CUSHION, 0.06, 5);
      return grounded(s);
    },
  },
  wicker_pouf: {
    group: "lounge", height: 0.42, on: "floor", colour: "rattan", size: { w: 0.5, d: 0.5 }, block: true, seat: { y: 0.42, z: 0, back: false },
    make(col) { const s = shape(); braided(s, 0.5, 0.5, 0.42, 0, 0, col); return s; },
  },
  jute_rug: {
    group: "lounge", height: 0.01, on: "floor", colour: "rattan", size: { r: 1.0 }, block: false,
    make(col) { const s = shape(); jute(s, 1.0, col); return s; },
  },
  trunk_table: {
    group: "lounge", height: 0.5, on: "floor", colour: "wood", size: { r: 0.25 }, block: true, top: 0.5,
    make() {
      // a slice of tree trunk for a side table: bark round it, the rings on top
      const s = shape();
      cyl(s, 0.24, 0.22, 0.47, 0, 0, 0, TRUNK, 20);
      for (let k = 0; k < 4; k++) cyl(s, 0.23 - k * 0.05, 0.23 - k * 0.05, 0.03 + 0.001 * k, 0, 0.47, 0, k % 2 ? DECK : DECK.map((v) => v * 1.1), 24);
      return s;
    },
  },
  cage_table: {
    group: "lounge", height: 0.46, on: "floor", colour: "black", size: { r: 0.3 }, block: true, top: 0.46,
    make(col) {
      // a round side table: a black wire cage under a wooden top
      const s = shape();
      const ring = (y) => { const out = []; for (let k = 0; k <= 32; k++) { const a = (k / 32) * 2 * Math.PI; out.push([0.27 * Math.sin(a), y, 0.27 * Math.cos(a)]); } return out; };
      for (const y of [0.01, 0.21, 0.42]) { const r = ring(y); for (let k = 0; k < 32; k++) rod(s, r[k], r[k + 1], 0.006, col, 4); }
      for (let k = 0; k < 14; k++) { const a = (k / 14) * 2 * Math.PI; rod(s, [0.27 * Math.sin(a), 0, 0.27 * Math.cos(a)], [0.27 * Math.sin(a + 0.3), 0.42, 0.27 * Math.cos(a + 0.3)], 0.005, col, 4); }
      cyl(s, 0.3, 0.3, 0.04, 0, 0.42, 0, DECK, 32);
      return s;
    },
  },
  dresser: {
    group: "bar", height: 0.88, on: "floor", colour: "green", size: { w: 1.56, d: 0.52 }, block: true, top: 0.88,
    make(col) {
      // an old painted chest of drawers for a cake table, brass knobs on its drawers
      const s = shape(), edge = col.map((v) => v * 0.8);
      box(s, 1.5, 0.74, 0.48, 0, 0.1, 0, col);
      box(s, 1.56, 0.04, 0.52, 0, 0.84, 0, edge);
      for (const x of [-0.7, 0.7]) for (const z of [-0.2, 0.2]) box(s, 0.06, 0.1, 0.06, x, 0, z, edge);
      for (const [y, h, xs] of [[0.62, 0.18, [-0.37, 0.37]], [0.38, 0.2, [0]], [0.14, 0.2, [0]]]) for (const x of xs) {
        const w = xs.length > 1 ? 0.66 : 1.38;
        box(s, w, h, 0.012, x, y, 0.24, col.map((v) => v * 1.05));
        for (const kx of xs.length > 1 ? [x] : [-0.35, 0.35]) ball(s, 0.016, kx, y + h / 2, 0.26, COLOURS.gold, 8);
      }
      return s;
    },
  },
  wicker_stand: {
    group: "bar", height: 0.62, on: "floor", colour: "rattan", size: { r: 0.22 }, block: true, top: 0.62,
    make(col) {
      // a waisted wicker stand to raise a cake or a tray, a wooden top on it
      const s = shape();
      woven(s, 0.58, (t) => 0.12 + 0.08 * (2 * t - 1) ** 2, 0, 0, 0, col, 10, 18);
      cyl(s, 0.22, 0.22, 0.04, 0, 0.58, 0, DECK, 32);
      return s;
    },
  },
  bamboo_chair: {
    group: "tables", height: 0.92, on: "floor", colour: "wood", size: { w: 0.46, d: 0.56 }, block: true, seat: { y: 0.45, z: 0, back: true },
    make(col) {
      // a folding chair of dark bamboo, its legs crossed at the side, a slatted seat and back
      const s = shape(), c = col.map((v) => v * 0.8);
      for (const x of [-0.21, 0.21]) {
        rod(s, [x, 0, 0.26], [x, 0.92, -0.2], 0.016, c, 8);
        rod(s, [x, 0, -0.24], [x, 0.44, 0.2], 0.016, c, 8);
        for (const y of [0.15]) rod(s, [x, y, -0.2], [x, y, 0.2], 0.01, c, 6);
      }
      for (let k = 0; k < 6; k++) rod(s, [-0.21, 0.44, -0.18 + k * 0.07], [0.21, 0.44, -0.18 + k * 0.07], 0.014, c, 6);
      for (let k = 0; k < 4; k++) { const y = 0.6 + k * 0.08; rod(s, [-0.21, y, -0.2 + (0.92 - y) * 0.0], [0.21, y, -0.2 + (0.92 - y) * 0.0], 0.012, c, 6); }
      box(s, 0.38, 0.01, 0.36, 0, 0.455, 0, RATTAN);
      return grounded(s);
    },
  },
  chiavari_chair: {
    group: "tables", height: 0.92, on: "floor", colour: "wood", size: { w: 0.42, d: 0.46 }, block: true, seat: { y: 0.46, z: 0, back: true },
    make(col) {
      // a slim chiavari chair, spindles in its back, a white seat pad
      const s = shape();
      for (const [x, z] of [[-0.18, 0.19], [0.18, 0.19]]) rod(s, [x * 1.08, 0, z * 1.05], [x, 0.44, z], 0.013, col, 8);
      for (const x of [-0.18, 0.18]) rod(s, [x * 1.08, 0, -0.21], [x * 0.95, 0.92, -0.22], 0.013, col, 8);
      box(s, 0.4, 0.03, 0.42, 0, 0.42, 0, col);
      soft(s, 0.38, 0.04, 0.38, 0, 0.45, 0.01, CUSHION, 0.015, 3);
      for (const y of [0.62, 0.74, 0.9]) rod(s, [-0.17, y, -0.22], [0.17, y, -0.22], 0.01, col, 6);
      for (const y of [0.12, 0.26]) rod(s, [-0.19, y, 0.2], [0.19, y, 0.2], 0.007, col, 6);
      return s;
    },
  },
  rope_lantern: {
    group: "lights", height: 0.44, on: "floor", colour: "rattan", size: { r: 0.1 }, block: false,
    make(col) {
      // a glass cylinder lantern with a wooden base and a rope handle, a candle inside
      const s = shape();
      cyl(s, 0.1, 0.1, 0.03, 0, 0, 0, DECK, 20);
      cyl(s, 0.09, 0.09, 0.3, 0, 0.03, 0, GLASS, 20);
      cyl(s, 0.1, 0.1, 0.02, 0, 0.33, 0, DECK, 20);
      cyl(s, 0.035, 0.035, 0.12, 0, 0.03, 0, WAX, 12); lit(() => ball(s, 0.012, 0, 0.165, 0, FLAME, 8));
      made("wood", () => hoop(s, 0.08, 0, 0.35, 0, 0.008, col, 0, Math.PI, 14));
      return s;
    },
  },
  tall_lanterns: {
    group: "lights", height: 1.0, on: "floor", colour: "rattan", size: { w: 0.5, d: 0.3 }, block: false,
    make(col) {
      // a pair of tall slatted floor lanterns, candles glowing inside
      const s = shape();
      for (const [x, h, r] of [[-0.12, 1.0, 0.11], [0.14, 0.75, 0.1]]) {
        woven(s, h, (t) => r * (0.85 + 0.15 * Math.sin(Math.PI * t)), x, 0, 0, col, 4, 20);
        cyl(s, 0.035, 0.035, 0.15, x, 0.01, 0, WAX, 12); lit(() => ball(s, 0.013, x, 0.18, 0, FLAME, 8));
      }
      return s;
    },
  },
});

// the groups the panel shows the starters in, in order
export const GROUPS = ["tables", "flowers", "table", "ceremony", "bar", "lights", "lounge"];

// A starter's shape in a colour (a name in COLOURS; its own colour if none).
export function starterShape(id, colour) {
  const def = STARTERS[id];
  if (!def) throw new Error("no such starter " + id);
  return def.make(colourOf(colour, def.colour));
}

// ---------------------------------------------------------------- colours of your own
// A colour is a name in COLOURS or "#rrggbb" (from the panel's picker, or typed as HEX or RGB).
// One of your own keeps the finish of the starter's own colour (a gold chair painted blue is still
// metal), so it gets its own array, registered once.
const own = new Map();                             // "#rrggbb|default name" -> [r, g, b]
export function colourOf(colour, fallback) {
  if (COLOURS[colour]) return COLOURS[colour];
  const base = COLOURS[fallback] || COLOURS.white, rgb = fromHex(colour);
  if (!rgb) return base;
  const key = colour.toLowerCase() + "|" + fallback;
  if (!own.has(key)) {
    const col = rgb.map((v) => v / 255);
    if (finishes.has(base)) finishes.set(col, finishes.get(base));
    own.set(key, col);
  }
  return own.get(key);
}
// "#c9a46a", "c9a46a" or "#fa0" -> [201, 164, 106] (0..255), else null
export function fromHex(text) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(text ?? "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
}
// [201, 164, 106] -> "#c9a46a" (each rounded and kept within 0..255)
export function toHex(rgb) {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
}
// "201, 164, 106", "rgb(201 164 106)" or "201;164;106" -> [201, 164, 106], else null
export function fromRgb(text) {
  const n = String(text ?? "").replace(/^\s*rgba?\s*\(|\)\s*$/gi, "").split(/[\s,;]+/).filter(Boolean);
  if (n.length !== 3 || n.some((v) => !/^\d{1,3}$/.test(v) || +v > 255)) return null;
  return n.map(Number);
}
// any colour the panel shows -> "#rrggbb"
export function hexOf(colour, fallback) {
  const rgb = fromHex(colour);
  return rgb ? toHex(rgb) : toHex(colourOf(colour, fallback).map((v) => v * 255));
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
