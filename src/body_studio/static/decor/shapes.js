// The starters' building blocks (decor.js, decor/*.js): a shape's vertices, colours, finishes and
// triangles, and the parts things are built from (boxes, rods, cylinders, flowers, leaves, trees,
// bulbs...), with the colours they share. Free of three.js. The catalogue that uses them is in
// basics.js, wedding.js, garden.js and proposals.js; the maths of where things go in ../decor.js.
export const COLOURS = {
  white: [0.95, 0.95, 0.93], ivory: [0.93, 0.88, 0.78], gold: [0.82, 0.67, 0.36], wood: [0.52, 0.36, 0.22],
  green: [0.33, 0.48, 0.31], blush: [0.92, 0.7, 0.69], black: [0.13, 0.13, 0.13],
  coral: [0.93, 0.42, 0.33], rattan: [0.74, 0.57, 0.37], copper: [0.83, 0.52, 0.4], blue: [0.55, 0.63, 0.66],
};
export const LEAF = [0.29, 0.45, 0.27], FLAME = [1.0, 0.78, 0.35], WAX = [0.97, 0.95, 0.88], GLASS = [0.86, 0.9, 0.9];

// ---------------------------------------------------------------- building shapes
// A shape is { p: [x, y, z, ...], c: [r, g, b, ...] (0..1), g: [1 per vertex that glows: a bulb, a
// flame], m: [what each vertex is made of, an index in FINISHES], i: [triangles] }.
export function shape() { return { p: [], c: [], g: [], m: [], i: [] }; }

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
export const F = Object.fromEntries(FINISHES.map((f, k) => [f.name, k]));
let glowing = 0, finish = null;
export const finishes = new Map();                        // colour (the array itself) -> its finish
export function finishOf(col) { return glowing ? F.glow : finish !== null ? finish : (finishes.get(col) ?? F.cloth); }
let place = null;                                  // while set, what vert() adds is moved by it
export function vert(s, x, y, z, col) {
  if (place) [x, y, z] = place(x, y, z);
  s.p.push(x, y, z); s.c.push(col[0], col[1], col[2]); s.g.push(glowing); s.m.push(finishOf(col));
  return s.p.length / 3 - 1;
}
// what f() adds glows
export function lit(f) { glowing = 1; try { f(); } finally { glowing = 0; } }
// what f() adds is made of `name` (whatever its colour)
export function made(name, f) { const was = finish; finish = F[name]; try { f(); } finally { finish = was; } }
export function quad(s, a, b, c, d) { s.i.push(a, b, c, a, c, d); }

// a box standing at (cx, cy, cz), its edges softly bevelled (a few millimetres: they catch the light
// as real edges do); thin boxes (a cloth, a tile) stay sharp
export function box(s, w, h, d, cx, cy, cz, col) {
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
export function triOut(s, a, b, c, out) {
  const p = (v) => s.p.slice(v * 3, v * 3 + 3);
  const A = p(a), B = p(b), C = p(c), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) s.i.push(a, b, c); else s.i.push(a, c, b);
}
export function quadOut(s, a, b, c, d, out) { triOut(s, a, b, c, out); triOut(s, a, c, d, out); }

// An upholstered block: a box w x h x d standing at (cx, cy, cz) whose edges round off with radius
// r, as a cushion, a padded arm, a cloth over a table's edge do. Each face is a grid pushed out
// onto the rounded shape (as three.js's RoundedBoxGeometry).
export function soft(s, w, h, d, cx, cy, cz, col, r = 0.04, n = 6) {
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

export function sharpBox(s, w, h, d, cx, cy, cz, col) {
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
export function cyl(s, r0, r1, h, cx, cy, cz, col, seg = 24) {
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
export function rod(s, a, b, r, col, seg = 10) {
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

export function ball(s, r, cx, cy, cz, col, seg = 10) {
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
export function blob(s, rx, ry, rz, cx, cy, cz, col, turn = 0, seg = 8) {
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
export function bloom(s, b, cx, cy, cz, col, spin = 0) {
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
export function facing(n, c, f) {
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
export function bunch(s, n, r, cx, cy, cz, col, seed = 1) {
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
export function drape(s, r, h, col, folds = 14, seg = 96) {
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

// ---------------------------------------------------------------- the wedding catalogue
export const SILVER = [0.78, 0.79, 0.8], CHAMPAGNE = [0.96, 0.86, 0.55], BULB = [1.0, 0.86, 0.55], WIRE = [0.12, 0.12, 0.12];
export const CAKE = [0.97, 0.95, 0.9], BOTTLES = [[0.18, 0.35, 0.2], [0.55, 0.32, 0.12], [0.85, 0.88, 0.86], [0.45, 0.1, 0.15]];
export const other = (col, a = COLOURS.white, b = COLOURS.ivory) => (col === a ? b : a);
for (const [cols, f] of [[[COLOURS.gold, SILVER, WIRE], F.metal], [[COLOURS.wood], F.wood], [[GLASS, ...BOTTLES], F.glass],
                         [[WAX, CAKE, CHAMPAGNE], F.satin]]) for (const c of cols) finishes.set(c, f);

// a stemmed glass at (x, y, z): a wine glass, or a flat coupe
export function glassAt(s, x, y, z, coupe = false, fill = null) {
  cyl(s, 0.03, 0.03, 0.004, x, y, z, GLASS, 12);
  rod(s, [x, y, z], [x, y + (coupe ? 0.09 : 0.1), z], 0.004, GLASS, 5);
  if (coupe) cyl(s, 0.012, 0.055, 0.035, x, y + 0.09, z, fill || GLASS, 14);
  else cyl(s, 0.015, 0.038, 0.09, x, y + 0.1, z, fill || GLASS, 14);
}
// a circle of rod in the x-y plane round (cx, cy, cz), from angle a0 to a1
export function hoop(s, R, cx, cy, cz, r, col, a0 = 0, a1 = 2 * Math.PI, n = 36) {
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * (k / n), p = [cx + R * Math.cos(a), cy + R * Math.sin(a), cz];
    if (prev) rod(s, prev, p, r, col, 8);
    prev = p;
  }
}
// a cloth over a table's edge, falling to the floor
// a cloth over a table, its top's edges rounded where it falls over them, to the floor
export function cloth(s, w, d, h, col) {
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

// ---------------------------------------------------------------- the flower shop
// What a florist puts round a wedding on the beach: calla lilies in tall glass, gerberas, clouds of
// baby's breath along the aisle, banks of tropical flowers (torch ginger, celosia plumes,
// alstroemeria, button chrysanthemums, golden rod), orchids, hydrangeas, pampas, greenery hung
// from the roof; and the lanterns, wicker lamps and wooden things they stand among. Each flower
// is built facing up at the origin and put in place by facing().
export const STEM = [0.36, 0.55, 0.28], DARK_LEAF = [0.17, 0.33, 0.19], EUCALYPTUS = [0.5, 0.63, 0.56], PALM = [0.25, 0.42, 0.22];
export const RED = [0.8, 0.1, 0.14], CORAL = [0.96, 0.45, 0.38], ORANGE = [0.96, 0.52, 0.14], YELLOW = [0.98, 0.79, 0.16];
export const MAGENTA = [0.78, 0.18, 0.52], ORCHID = [0.8, 0.58, 0.86], PINK = [0.96, 0.62, 0.72], SNOW = [0.98, 0.98, 0.96];
export const CENTRE = [0.62, 0.5, 0.16], SPADIX = [0.98, 0.82, 0.3], COPPER = [0.83, 0.52, 0.4], RATTAN = [0.74, 0.57, 0.37];
export const DECK = [0.6, 0.42, 0.27], PAMPAS = [0.9, 0.83, 0.7], LINEN = [0.95, 0.93, 0.88];
for (const [cols, f] of [[[COPPER, COLOURS.copper], F.metal], [[RATTAN, DECK, COLOURS.rattan], F.wood]]) for (const c of cols) finishes.set(c, f);
// what was built moved up or down so its lowest point is on y = 0 (leaves and blooms piled loosely)
export function grounded(s) {
  let lo = Infinity;
  for (let k = 1; k < s.p.length; k += 3) lo = Math.min(lo, s.p[k]);
  for (let k = 1; k < s.p.length; k += 3) s.p[k] -= lo;
  return s;
}
export function rng(seed) { let q = (seed % 2147483646) + 1; return () => ((q = (q * 16807) % 2147483647) / 2147483647); }
// a unit direction tipped `tilt` from straight up toward the angle a
export const tipped = (a, tilt) => [Math.sin(tilt) * Math.sin(a), Math.cos(tilt), Math.sin(tilt) * Math.cos(a)];

// a gerbera or a daisy, b across: a domed heart and a ring of long flat petals
export function daisy(s, b, col, centre = CENTRE, n = 18) {
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
export function calla(s, b, col) {
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
export function orchid(s, b, col) {
  const lip = col.map((v) => v * 0.65);
  made("satin", () => {
    for (const a of [1.15, -1.15]) blob(s, b * 0.3, b * 0.03, b * 0.27, Math.sin(a) * b * 0.3, 0, Math.cos(a) * b * 0.3, col, a, 7);
    for (const a of [Math.PI, 2.2, -2.2]) blob(s, b * 0.13, b * 0.025, b * 0.3, Math.sin(a) * b * 0.32, -b * 0.01, Math.cos(a) * b * 0.32, col, a, 6);
    blob(s, b * 0.12, b * 0.05, b * 0.14, 0, b * 0.02, b * 0.12, lip, 0, 6);
  });
}
// a cloud of tiny blooms (baby's breath) over a dome r across at (cx, cy, cz)
export function cloud(s, n, r, cx, cy, cz, col, seed, h = 0.6) {
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
export function plume(s, h, r, p, col, seed, a = 0, lean = 0) {
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
export function torch(s, h, col) {
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
export function pompom(s, b, col) { made("satin", () => { blob(s, b * 0.5, b * 0.38, b * 0.5, 0, 0, 0, col, 0, 8); daisy(s, b, col, col, 12); }); }
// a long leaf from p toward d (unit), len long; broad (monstera, banana) or narrow (palm, ginger)
export function leaf(s, p, d, len, wide, col) {
  const a = Math.atan2(d[0], d[2]), c = [p[0] + d[0] * len / 2, p[1] + d[1] * len / 2, p[2] + d[2] * len / 2];
  facing([-d[0] * d[1], 1 - d[1] * d[1] + 1e-3, -d[2] * d[1]].map((v, _, arr) => v / Math.hypot(...arr)), c,
         () => blob(s, len * wide, len * 0.03, len / 2, 0, 0, 0, col, a, 6));
}
// a palm frond: a stem curving from p toward a, leaflets either side
export function frond(s, p, a, len, col) {
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
export function sprig(s, p, d, len, seed) {
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
export function tropical(s, w, d, h, col, seed) {
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
// ---------------------------------------------------------------- trees
export const BARK = [0.42, 0.36, 0.3], PALM_BARK = [0.6, 0.54, 0.45], CANOPY = [[0.2, 0.36, 0.16], [0.26, 0.43, 0.19], [0.17, 0.3, 0.14], [0.32, 0.47, 0.22]];
// a limb from a to b, thinning from r0 to r1 and bending a little (sag: how far its middle drops)
export function limb(s, a, b, r0, r1, col, sag = 0, n = 5) {
  let prev = a;
  for (let k = 1; k <= n; k++) {
    const t = k / n, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * Math.sin(Math.PI * t), a[2] + (b[2] - a[2]) * t];
    rod(s, prev, q, r0 + (r1 - r0) * (t - 0.5 / n), col, 8);
    if (k < n) ball(s, r0 + (r1 - r0) * t, q[0], q[1], q[2], col, 8);   // (the joint, rounded)
    prev = q;
  }
}
// a clump of foliage round c, r across: a soft mass of leaf (so no sky shows through it) and leaves
// standing out of it all round, each its own green, lighter on top where the sun is
export function clump(s, c, r, rnd, flat = 1) {
  const col = CANOPY[Math.floor(rnd() * CANOPY.length)];
  blob(s, r * 0.82, r * 0.62 * flat, r * 0.82, c[0], c[1], c[2], col.map((v) => v * 0.8), rnd() * 6, 10);
  for (let k = 0; k < Math.round(70 * r * r * flat + 10); k++) {
    const a = rnd() * 2 * Math.PI, up = rnd() * 2 - 1 + 0.3, h = Math.sqrt(Math.max(0, 1 - up * up));
    const n = [h * Math.sin(a), up * flat, h * Math.cos(a)], p = [c[0] + n[0] * r * 0.75, c[1] + n[1] * r * 0.6, c[2] + n[2] * r * 0.75];
    const lit = 0.85 + 0.3 * Math.max(0, up);
    const shade = CANOPY[Math.floor(rnd() * CANOPY.length)].map((v) => Math.min(1, v * lit));
    leaf(s, p, tipped(a, 0.4 + 0.9 * rnd()), 0.16 + 0.1 * rnd(), 0.42, shade);
  }
}
export function broadTree(s, h, r, seed) {
  // a trunk forking into four limbs, a rounded crown of clumps over them
  const rnd = rng(seed), fork = h * 0.38;
  made("wood", () => limb(s, [0, 0, 0], [0.08, fork, 0.05], 0.24, 0.17, BARK, 0, 4));
  made("wood", () => cyl(s, 0.36, 0.24, 0.3, 0, 0, 0, BARK, 14));          // (its foot, flared)
  const ends = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.6 + rnd() * 0.6, out = r * (0.45 + 0.2 * rnd());
    const e = [0.08 + out * Math.sin(a), h * (0.66 + 0.1 * rnd()), 0.05 + out * Math.cos(a)];
    made("wood", () => limb(s, [0.08, fork, 0.05], e, 0.15, 0.06, BARK, -0.25));
    ends.push(e);
  }
  for (let k = 0; k < 16; k++) {
    const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * r * 0.62;
    const y = h * 0.74 + (1 - d / r) * h * 0.14 + (rnd() - 0.5) * 0.4;
    clump(s, [0.08 + d * Math.sin(a), y, 0.05 + d * Math.cos(a)], r * (0.34 + 0.12 * rnd()), rnd);
  }
}
export function almondTree(s, h, r, seed) {
  // a beach almond: a straight trunk, branches in level whorls, each tier a flat spread of leaves,
  // wider down low
  const rnd = rng(seed), tiers = 4;
  made("wood", () => limb(s, [0, 0, 0], [0, h * 0.86, 0], 0.22, 0.07, BARK, 0, 6));
  made("wood", () => cyl(s, 0.32, 0.22, 0.25, 0, 0, 0, BARK, 14));
  for (let t = 0; t < tiers; t++) {
    const y = h * (0.42 + 0.15 * t), w = r * (1 - 0.2 * t);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.257 + t * 0.6 + rnd() * 0.3, e = [w * Math.sin(a), y + 0.25, w * Math.cos(a)];
      made("wood", () => limb(s, [0, y, 0], e, 0.08 - 0.01 * t, 0.03, BARK, -0.1, 3));
      for (let j = 0; j < 3; j++) {
        const f = 0.45 + 0.28 * j;
        clump(s, [e[0] * f + (rnd() - 0.5) * 0.3, y + 0.25 * f + 0.15, e[2] * f + (rnd() - 0.5) * 0.3], w * 0.3, rnd, 0.45);
      }
    }
  }
}
export function coconutPalm(s, h, seed) {
  // a coconut palm: a thin ringed trunk curving up, a crown of long arching fronds, a few nuts
  const rnd = rng(seed), lean = 0.6, at = (t) => [lean * t * t, h * t, 0];
  made("wood", () => {
    for (let k = 0; k < 24; k++) {
      const a = at(k / 24), b = at((k + 1) / 24), r = 0.16 - 0.04 * (k / 24);
      rod(s, a, b, r, k % 2 ? PALM_BARK : PALM_BARK.map((v) => v * 0.86), 10);
    }
  });
  const top = at(1);
  blob(s, 0.2, 0.3, 0.2, top[0], top[1], top[2], [0.35, 0.42, 0.22], 0, 10);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI + rnd() * 0.2, len = 2.2 + 0.6 * rnd();
    frond(s, [top[0], top[1] + 0.15, top[2]], a, len, CANOPY[k % CANOPY.length]);
  }
  for (let k = 0; k < 5; k++) { const a = k * 1.3; ball(s, 0.1, top[0] + 0.2 * Math.sin(a), top[1] - 0.2, top[2] + 0.2 * Math.cos(a), [0.42, 0.33, 0.18], 10); }
}
export function smallTree(s, h, r, seed) {
  // a small garden tree: three slim stems from the sand, fanning out, a light open crown
  const rnd = rng(seed);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.3, top = [0.35 * r * Math.sin(a), h * 0.62, 0.35 * r * Math.cos(a)];
    made("wood", () => limb(s, [0.05 * Math.sin(a), 0, 0.05 * Math.cos(a)], top, 0.06, 0.035, BARK, -0.1, 4));
  }
  for (let k = 0; k < 11; k++) {
    const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * r * 0.6;
    clump(s, [d * Math.sin(a), h * 0.72 + (1 - d / r) * h * 0.12 + (rnd() - 0.5) * 0.3, d * Math.cos(a)], r * (0.3 + 0.1 * rnd()), rnd, 0.8);
  }
}
// a small palm or a cycad for a bed: a short trunk, fronds out of its top
export function bedPalm(s, x, z, h, len, n, rnd) {
  made("wood", () => { for (let k = 0; k < 6; k++) rod(s, [x, h * k / 6, z], [x, h * (k + 1) / 6, z], 0.07 - 0.005 * k, k % 2 ? PALM_BARK : PALM_BARK.map((v) => v * 0.85), 8); });
  for (let k = 0; k < n; k++) frond(s, [x, h, z], (k / n) * 2 * Math.PI + rnd(), len * (0.8 + 0.3 * rnd()), CANOPY[k % CANOPY.length]);
}
// a planted border w long (x) by d deep (z, the front at +z): palms at the back, ferns and
// monstera leaves in the middle, bromeliads and low leaves at the front, packed so no soil shows
export function border(s, w, d, seed) {
  const rnd = rng(seed);
  box(s, w, 0.04, d, 0, 0, 0, [0.3, 0.24, 0.17]);
  for (let k = 0; k < Math.round(w / 1.0); k++) bedPalm(s, -w / 2 + (k + 0.5) * (w / Math.round(w / 1.0)) + (rnd() - 0.5) * 0.2, -d / 2 + 0.25, 1.2 + 0.9 * rnd(), 1.1, 9, rnd);
  for (let k = 0; k < Math.round(w * 26); k++) {
    const x = (rnd() - 0.5) * w * 0.96, z = -d / 2 + 0.3 + rnd() * (d * 0.45), base = [x, 0.04, z];
    leaf(s, base, tipped(rnd() * 6.28, 0.25 + 0.45 * rnd()), 0.6 + 0.5 * rnd(), 0.32, k % 3 ? DARK_LEAF : MONSTERA);
  }
  for (let k = 0; k < Math.round(w * 3); k++) {
    const x = (rnd() - 0.5) * w * 0.9, z = d / 2 - 0.25 - rnd() * 0.15, red = rnd() < 0.4;
    for (let j = 0; j < 12; j++) leaf(s, [x, 0.04, z], tipped(j * 2.4 + rnd(), 0.6 + 0.6 * (j / 12)), 0.32, 0.14, red && j % 2 ? CORDYLINE : [0.4, 0.58, 0.32]);
  }
}
// one bay of a glass roof on dark steel: posts at its two ends, a pitched rafter, purlins along,
// two panes of glass; w along (x), d across (z)
export function roofBay(s, w, d, eave, ridge, steel = STEEL_DARK) {
  const roof = (z) => eave + (ridge - eave) * (1 - Math.abs(z) / (d / 2));
  made("metal", () => {
    for (const z of [-d / 2, d / 2]) box(s, 0.1, eave, 0.1, 0, 0, z, steel);
    for (const z of [-d / 2, d / 2]) rod(s, [0, roof(z), z], [0, ridge, 0], 0.04, steel, 6);
    for (const f of [0, 0.25, 0.5, 0.75, 1]) for (const side of [-1, 1]) {
      const z = side * f * d / 2;
      rod(s, [-w / 2, roof(z) + 0.02, z], [w / 2, roof(z) + 0.02, z], 0.025, steel, 6);
    }
  });
  made("glass", () => {
    for (const side of [-1, 1]) {
      const a = vert(s, -w / 2, ridge + 0.05, 0, GLASS), b = vert(s, w / 2, ridge + 0.05, 0, GLASS);
      const c = vert(s, w / 2, eave + 0.05, side * d / 2, GLASS), e = vert(s, -w / 2, eave + 0.05, side * d / 2, GLASS);
      quad(s, a, b, c, e);
    }
  });
}
export const STEEL_DARK = [0.13, 0.13, 0.14];
export const STEEL_MAROON = [0.36, 0.13, 0.11];   // painted steel, as the venue's garden cover
// a woven shell (wicker, rattan) of rings and staves: radius r(t) from t = 0 (foot) to 1 (top)
export function woven(s, h, r, cx, cy, cz, col, rings = 8, staves = 14) {
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

// ---------------------------------------------------------------- from the decorators' proposals
// What two local decorators show for a wedding at the venue: clouds of greenery, bougainvillea and
// orchids hung over the tables with filament bulbs and woven lamps among them, a half-moon arch,
// a flower swing, red ginger on moss, a canoe of flowers, rattan lounges on jute rugs, backdrops
// for photos (bamboo, a green wall, woven plates), and the small furniture they stand on.
export const CORDYLINE = [0.62, 0.12, 0.32], BOUGAIN = [0.86, 0.14, 0.46], MONSTERA = [0.13, 0.3, 0.17], MOSS = [0.3, 0.33, 0.17];
export const JUTE = [0.72, 0.6, 0.42], CLAY = [0.72, 0.4, 0.28], BAMBOO = [0.76, 0.66, 0.45], TRUNK = [0.45, 0.31, 0.2];
export const CUSHION = [0.95, 0.94, 0.9], BEIGE = [0.82, 0.76, 0.66], SNAP = [0.97, 0.96, 0.9];
for (const [cols, f] of [[[JUTE, BAMBOO, TRUNK], F.wood], [[CLAY], F.satin]]) for (const c of cols) finishes.set(c, f);
// what f() adds moved by (dx, dy, dz)
export function at(dx, dy, dz, f) { const was = place; place = (x, y, z) => (was ? was(x + dx, y + dy, z + dz) : [x + dx, y + dy, z + dz]); try { f(); } finally { place = was; } }
// a filament bulb hung on a cord from `top` down to y: a glowing drop under a small dark cap
export function bulb(s, x, top, y, z) {
  rod(s, [x, top, z], [x, y + 0.05, z], 0.002, WIRE, 3);
  cyl(s, 0.012, 0.012, 0.03, x, y + 0.03, z, WIRE, 8);
  lit(() => blob(s, 0.028, 0.04, 0.028, x, y, z, BULB, 0, 8));
}
// the lampshades of the photos, each `h` tall with its foot at y: their outlines from the foot (t 0)
// to the top (1), the cord above
export const SHADES = {
  bell: (t) => 0.06 + 0.24 * (1 - t) ** 1.6, dome: (t) => 0.03 + 0.27 * Math.cos(t * Math.PI / 2),
  gourd: (t) => 0.03 + 0.16 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) ** 2 + 0.05 * (1 - t),
  egg: (t) => 0.02 + 0.17 * Math.sin(Math.PI * (0.08 + 0.88 * t)), drum: () => 0.17,
};
export function shade(s, kind, h, x, y, z, top, col) {
  rod(s, [x, top, z], [x, y + h, z], 0.003, WIRE, 3);
  woven(s, h, SHADES[kind], x, y, z, col, kind === "drum" ? 10 : 8, kind === "drum" ? 26 : 18);
  lit(() => ball(s, 0.03, x, y + h * 0.45, z, BULB, 8));
}
// a canopy hung at y (its top), w by d: palm fronds, broad leaves and red cordyline falling from
// it; `extra(x, y, z, k)` adds what is tucked into it at a point under it
export function canopy(s, w, d, y, n, seed, mix, extra) {
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
export function hangers(s, h, y, xs) { for (const x of xs) rod(s, [x, h, 0], [x, y, 0], 0.003, WIRE, 3); }
// a cascade of phalaenopsis down from p, len long
export function cascade(s, p, len, col, seed) {
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
export function braided(s, w, d, h, cx, cz, col) {
  soft(s, w, h, d, cx, 0, cz, col, 0.04, 5);
  for (let k = 1; k < 6; k++) box(s, w + 0.006, 0.012, d + 0.006, cx, (h * k) / 6, cz, col.map((v) => v * 0.82));
}
// a round braided rug, r across, its rings a shade apart
export function jute(s, r, col) {
  for (let k = 0; k < 7; k++) cyl(s, r * (1 - k / 7), r * (1 - k / 7), 0.006 + 0.0005 * k, 0, 0, 0, col.map((v) => v * (k % 2 ? 0.9 : 1)), 48);
}

// a dense rope of small mixed florets along points p(t), r thick: the mass under an arch's flowers
export function florets(s, n, path, r, mix, seed) {
  const rnd = rng(seed);
  made("satin", () => { for (let k = 0; k < n; k++) {
    const p = path(rnd()), q = rnd() * 6.3, d = r * Math.sqrt(rnd());
    ball(s, 0.016 + 0.014 * rnd(), p[0] + Math.cos(q) * d * 0.7, p[1] + Math.sin(q) * d * 0.7, p[2] + Math.sin(q * 1.7) * d, mix[k % mix.length], 4);
  } });
}
