// Decor starters (../decor.js): more of the flower shop (peonies, tulips, sunflowers, lavender,
// anthuriums, birds of paradise, a bridal bouquet, a kissing ball), the dessert table (a footed
// tray, a tiered stand, a macaron tower, a cloche), candles, a modular bar and drinks, and things
// for a wedding on the beach (tiki torches, a parasol, deck chairs, crates, driftwood, a hexagon
// arch, a macramé backdrop). Many have knobs (decor.js knobs()): how many flowers, tiers, pieces;
// those with `built` draw themselves to the size asked for (a tray's stem grows, its plate stays).
import {
  COLOURS, LEAF, FLAME, WAX, GLASS, F, finishes, shape, vert, quad, lit, made,
  box, soft, cyl, rod, ball, blob, bloom, facing, bunch, SILVER, CHAMPAGNE, BOTTLES,
  other, STEM, DARK_LEAF, PALM, RED, CORAL, ORANGE, YELLOW, PINK, SNOW,
  grounded, rng, tipped, daisy, leaf, frond, sprig, MONSTERA, JUTE, CLAY, BAMBOO, TRUNK, CUSHION,
} from "./shapes.js";

export const LAVENDER = [0.58, 0.48, 0.78], BROWN = [0.28, 0.17, 0.08], SAND = [0.86, 0.79, 0.66], DRIFT = [0.66, 0.6, 0.52];
export const STRAW = [0.8, 0.68, 0.45], CREAM = [0.98, 0.93, 0.82], BERRY = [0.62, 0.1, 0.22], LEMON = [0.98, 0.9, 0.5];
export const CHOC = [0.36, 0.2, 0.12], MINT = [0.66, 0.86, 0.74], LILAC = [0.8, 0.7, 0.9], BLUSHY = [0.96, 0.76, 0.76];
for (const [cols, f] of [[[STRAW, DRIFT, SAND], F.wood], [[CREAM, CHOC, BERRY, LEMON, MINT, LILAC, BLUSHY, CLAY], F.satin]]) for (const c of cols) finishes.set(c, f);

// ---------------------------------------------------------------- flowers, built facing up at the origin
// a peony b across: a full ball of ruffled petals, two roses' rings in one
function peony(s, b, col, spin) {
  made("satin", () => {
    blob(s, b * 0.5, b * 0.36, b * 0.5, 0, b * 0.18, 0, col.map((v) => v * 0.85), spin, 10);
    bloom(s, b * 1.1, 0, 0, 0, col, spin);
    bloom(s, b * 0.75, 0, b * 0.12, 0, col.map((v) => v + (1 - v) * 0.3), spin + 1);
  });
}
// a tulip: six petals closed into a cup
function tulip(s, b, col) {
  made("satin", () => { for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 2 * Math.PI + (k % 2) * 0.3, r = k % 2 ? 0.2 : 0.28;
    facing(tipped(a, 0.18), [Math.sin(a) * b * r, b * 0.55, Math.cos(a) * b * r], () => blob(s, b * 0.3, b * 0.6, b * 0.16, 0, 0, 0, col, a, 8));
  } });
}
// an anthurium: a glossy heart (the spathe) and its upright spadix
function anthurium(s, b, col) {
  made("satin", () => {
    blob(s, b * 0.5, b * 0.03, b * 0.6, 0, 0, 0, col, 0, 10);
    rod(s, [0, 0, -b * 0.1], [0, b * 0.5, -b * 0.2], b * 0.06, YELLOW, 5);
  });
}
// a bird of paradise: a beak-like green bract, orange crests and a blue tongue rising from it
function strelitzia(s, b) {
  made("satin", () => {
    blob(s, b * 0.12, b * 0.08, b * 0.6, 0, 0, b * 0.3, [0.28, 0.42, 0.3], 0, 8);
    for (let k = 0; k < 4; k++) facing(tipped(0.6 * (k - 1.5), 0.5), [0, b * 0.06, b * (0.15 + 0.1 * k)], () => blob(s, b * 0.04, b * 0.4, b * 0.07, 0, b * 0.3, 0, ORANGE, 0, 6));
    facing(tipped(0, 0.7), [0, b * 0.08, b * 0.45], () => blob(s, b * 0.04, b * 0.3, b * 0.05, 0, b * 0.2, 0, [0.22, 0.32, 0.72], 0, 6));
  });
}
// n stems in a vase's mouth (at y, r across) fanning out up to the flowers' heights; f(k, top, d)
// draws the flower k at `top` facing d
function stems(s, n, y, r, h, spread, seed, f, col = STEM) {
  const rnd = rng(seed);
  for (let k = 0; k < n; k++) {
    const a = k * 2.39996 + seed, t = Math.sqrt((k + 0.5) / n), d = tipped(a, spread * t);
    const len = h * (0.85 + 0.15 * rnd()) * (1 - 0.15 * t), foot = [Math.sin(a) * r * t, y, Math.cos(a) * r * t];
    const top = [foot[0] + d[0] * len, y + d[1] * len, foot[2] + d[2] * len];
    rod(s, foot, top, 0.004, col, 4);
    f(k, top, d, rnd);
  }
}
// a shell turned round the upright axis through the profile [[r, y], ...] (no lids): a glass dome
function lathe(s, prof, col, seg = 28) {
  const rings = prof.map(([r, y]) => Array.from({ length: seg }, (_, k) => vert(s, r * Math.sin((k / seg) * 2 * Math.PI), y, r * Math.cos((k / seg) * 2 * Math.PI), col)));
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < seg; k++) quad(s, rings[j][k], rings[j][(k + 1) % seg], rings[j + 1][(k + 1) % seg], rings[j + 1][k]);
}
// a cupcake at (x, y, z): its paper case, a swirl of frosting
function cupcake(s, x, y, z, col) {
  made("satin", () => {
    cyl(s, 0.022, 0.028, 0.03, x, y, z, CREAM, 12);
    for (let k = 0; k < 3; k++) cyl(s, 0.028 - 0.008 * k, 0.022 - 0.008 * k, 0.012, x, y + 0.03 + 0.012 * k, z, col, 12);
  });
}
// a macaron r across at (x, y, z): two shells and their filling
function macaron(s, r, x, y, z, col) {
  made("satin", () => {
    blob(s, r, r * 0.35, r, x, y + r * 0.35, z, col, 0, 10);
    cyl(s, r * 0.85, r * 0.85, r * 0.25, x, y + r * 0.5, z, CREAM, 12);
    blob(s, r, r * 0.35, r, x, y + r * 0.95, z, col, 0, 10);
  });
}
// a wooden crate w x h x d at (cx, cy, cz): slats with gaps, corner posts
function crate(s, w, h, d, cx, cy, cz, col) {
  for (let j = 0; j < 3; j++) {
    const y = cy + 0.01 + j * (h / 3);
    for (const z of [-d / 2 + 0.008, d / 2 - 0.008]) box(s, w, h / 3 - 0.02, 0.016, cx, y, cz + z, col);
    for (const x of [-w / 2 + 0.008, w / 2 - 0.008]) box(s, 0.016, h / 3 - 0.02, d - 0.03, cx + x, y, cz, col);
  }
  box(s, w - 0.03, 0.014, d - 0.03, cx, cy, cz, col);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(s, 0.03, h, 0.03, cx + x * (w / 2 - 0.015), cy, cz + z * (d / 2 - 0.015), col.map((v) => v * 0.85));
}
// a striped sling of canvas between two points (a deck chair's seat), `n` stripes along it
function sling(s, a, b, w, col, n = 7) {
  for (let k = 0; k < n; k++) {
    const x0 = -w / 2 + (w * k) / n, x1 = x0 + w / n, c = k % 2 ? COLOURS.white : col;
    const P = [[x0, ...a], [x1, ...a], [x1, ...b], [x0, ...b]];
    for (let j = 0; j < 4; j++) rod(s, P[j], P[(j + 1) % 4], 0.004, c, 3);
    for (let t = 1; t < 6; t++) rod(s, [x0, a[0] + (b[0] - a[0]) * t / 6, a[1] + (b[1] - a[1]) * t / 6], [x1, a[0] + (b[0] - a[0]) * t / 6, a[1] + (b[1] - a[1]) * t / 6], 0.012, c, 4);
  }
}

export const EXTRAS = {
  // ------------------------------------------------ the flower shop
  bridal_bouquet: {
    group: "flowers", height: 0.36, on: "top", colour: "blush", size: { r: 0.125 }, block: false,
    knobs: { flowers: { min: 6, max: 70, value: 24 } },
    make(col, k = { flowers: 24 }) {
      // a round hand-tied bouquet standing in a small glass stand: roses in a dome, a few paler, the
      // stems bound with ribbon; more flowers make it fuller and a little wider
      const s = shape(), r = 0.13 * Math.min(1.25, Math.max(0.8, (k.flowers / 24) ** 0.3));
      cyl(s, 0.06, 0.05, 0.1, 0, 0, 0, GLASS, 20);
      for (let j = 0; j < 7; j++) { const a = j * 0.9; rod(s, [0.012 * Math.sin(a), 0.02, 0.012 * Math.cos(a)], [0.02 * Math.sin(a), 0.2, 0.02 * Math.cos(a)], 0.005, STEM, 4); }
      cyl(s, 0.03, 0.03, 0.06, 0, 0.12, 0, COLOURS.ivory, 16);
      bunch(s, k.flowers, r, 0, 0.36 - r * 0.62, 0, col, 71);
      return s;
    },
  },
  peony_bowl: {
    group: "flowers", height: 0.24, on: "top", colour: "blush", size: { r: 0.18 }, block: false,
    knobs: { flowers: { min: 3, max: 25, value: 9 } },
    make(col, k = { flowers: 9 }) {
      // a low footed bowl of peonies, packed so they touch, leaves under their rim
      const s = shape(), n = k.flowers, R = 0.15;
      made("satin", () => { cyl(s, 0.05, 0.04, 0.03, 0, 0, 0, COLOURS.white, 20); cyl(s, 0.07, 0.13, 0.08, 0, 0.03, 0, COLOURS.white, 28); });
      for (let j = 0; j < 8; j++) leaf(s, [0, 0.1, 0], tipped(j * 0.8, 1.35), 0.14, 0.3, DARK_LEAF);
      const b = 0.075 * Math.min(1.2, Math.sqrt(9 / Math.max(n, 3)) * 1.05);
      for (let j = 0; j < n; j++) {
        const t = Math.sqrt((j + 0.5) / n), a = j * 2.39996, p = [Math.sin(a) * R * t * 0.8, 0.14 + 0.06 * (1 - t), Math.cos(a) * R * t * 0.8];
        facing(tipped(a, 0.9 * t), p, () => peony(s, b, j % 4 === 3 ? COLOURS.ivory : col, a));
      }
      return grounded(s);
    },
  },
  tulip_vase: {
    group: "flowers", height: 0.43, on: "top", colour: "coral", size: { r: 0.22 }, block: false,
    knobs: { flowers: { min: 3, max: 30, value: 12 } },
    make(col, k = { flowers: 12 }) {
      // tulips in a clear cylinder, their stems curving out and their long leaves among them
      const s = shape();
      cyl(s, 0.06, 0.06, 0.22, 0, 0, 0, GLASS, 20);
      stems(s, k.flowers, 0.04, 0.05, 0.38, 0.55, 3, (j, top, d) => {
        if (j % 2) leaf(s, [top[0] * 0.5, 0.22, top[2] * 0.5], tipped(Math.atan2(d[0], d[2]), 0.8), 0.14, 0.12, LEAF);
        facing(d, top, () => tulip(s, 0.055, j % 5 === 4 ? COLOURS.white : col));
      });
      return grounded(s);
    },
  },
  sunflower_jar: {
    group: "flowers", height: 0.39, on: "top", colour: "ivory", size: { r: 0.21 }, block: false,
    knobs: { flowers: { min: 1, max: 15, value: 7 } },
    make(col, k = { flowers: 7 }) {
      // sunflowers in a glass jar tied with twine (the petals take the colour when one is chosen)
      const s = shape(), petal = col === COLOURS.ivory ? YELLOW : col;
      cyl(s, 0.055, 0.055, 0.17, 0, 0, 0, GLASS, 20);
      for (const y of [0.12, 0.13]) cyl(s, 0.057, 0.057, 0.006, 0, y, 0, JUTE, 20);
      stems(s, k.flowers, 0.1, 0.04, 0.29, 0.6, 7, (j, top, d) => {
        leaf(s, [top[0] * 0.6, 0.2, top[2] * 0.6], tipped(Math.atan2(d[0], d[2]), 1.2), 0.08, 0.4, LEAF);
        facing(tipped(Math.atan2(d[0], d[2]), 0.5 + 0.4 * Math.hypot(d[0], d[2])), top, () => daisy(s, 0.11, petal, BROWN, 22));
      });
      return grounded(s);
    },
  },
  lavender_pot: {
    group: "flowers", height: 0.39, on: "top", colour: "white", size: { r: 0.18 }, block: false,
    knobs: { stems: { min: 8, max: 80, value: 36 } },
    make(col, k = { stems: 36 }) {
      // a pot of lavender: thin stems, each with a spike of tiny purple buds
      const s = shape();
      made("satin", () => { cyl(s, 0.07, 0.09, 0.14, 0, 0, 0, col, 20); cyl(s, 0.095, 0.095, 0.02, 0, 0.14, 0, col, 20); });
      stems(s, k.stems, 0.15, 0.07, 0.24, 0.5, 11, (j, top, d) => {
        made("satin", () => { for (let b = 0; b < 6; b++) ball(s, 0.006, top[0] + d[0] * 0.012 * b, top[1] + 0.012 * b - 0.04, top[2] + d[2] * 0.012 * b, LAVENDER, 4); });
      }, [0.45, 0.55, 0.42]);
      return grounded(s);
    },
  },
  anthurium_vase: {
    group: "flowers", height: 0.53, on: "top", colour: "coral", size: { r: 0.2 }, block: false,
    knobs: { flowers: { min: 2, max: 15, value: 7 } },
    make(col, k = { flowers: 7 }) {
      // anthuriums and one broad leaf in a tall slim glass, as the beach florists do
      const s = shape(), red = col === COLOURS.coral ? RED : col;
      cyl(s, 0.045, 0.045, 0.3, 0, 0, 0, GLASS, 18);
      leaf(s, [0, 0.3, 0], tipped(2.6, 0.5), 0.26, 0.4, MONSTERA);
      stems(s, k.flowers, 0.05, 0.03, 0.5, 0.5, 5, (j, top, d) => facing(tipped(Math.atan2(d[0], d[2]), 0.9), top, () => anthurium(s, 0.09, red)));
      return grounded(s);
    },
  },
  bird_of_paradise: {
    group: "flowers", height: 1.33, on: "floor", colour: "white", size: { r: 0.33 }, block: true,
    knobs: { flowers: { min: 1, max: 9, value: 5 } },
    make(col, k = { flowers: 5 }) {
      // a tall floor vase of birds of paradise among their paddle leaves
      const s = shape();
      made("satin", () => cyl(s, 0.14, 0.11, 0.6, 0, 0, 0, col, 28));
      for (let j = 0; j < 5; j++) leaf(s, [0, 0.55, 0], tipped(j * 1.3, 0.35), 0.6, 0.22, DARK_LEAF);
      stems(s, k.flowers, 0.58, 0.08, 0.6, 0.45, 13, (j, top, d) => facing([d[0], 0.3, d[2] + 0.001].map((v, _, a) => v / Math.hypot(...a)), top, () => strelitzia(s, 0.25)));
      return grounded(s);
    },
  },
  monstera_vase: {
    group: "flowers", height: 0.73, on: "floor", colour: "white", size: { r: 0.37 }, block: false,
    knobs: { leaves: { min: 2, max: 12, value: 6 } },
    make(col, k = { leaves: 6 }) {
      // a ceramic floor vase with big monstera leaves fanned out of it
      const s = shape();
      made("satin", () => { cyl(s, 0.1, 0.14, 0.25, 0, 0, 0, col, 28); cyl(s, 0.14, 0.08, 0.12, 0, 0.25, 0, col, 28); });
      stems(s, k.leaves, 0.36, 0.04, 0.3, 0.8, 17, (j, top, d) => leaf(s, top, tipped(Math.atan2(d[0], d[2]), 1.1), 0.3, 0.45, MONSTERA));
      return grounded(s);
    },
  },
  wildflower_bottles: {
    group: "flowers", height: 0.32, on: "top", colour: "blush", size: { w: 0.6, d: 0.1 }, block: false,
    built: ["w"], knobs: { bottles: { min: 1, max: 12, value: 5 } },
    make(col, k = { w: 0.6, bottles: 5 }) {
      // a row of small glass bottles along a table, one stem in each, spread over its width
      const s = shape(), n = k.bottles, rnd = rng(23), cols = [col, COLOURS.white, YELLOW, LAVENDER];
      for (let j = 0; j < n; j++) {
        const x = n === 1 ? 0 : (j / (n - 1) - 0.5) * (k.w - 0.1), h = 0.1 + 0.05 * ((j * 7) % 3) / 2;
        cyl(s, 0.03, 0.03, h, x, 0, 0, GLASS, 14); cyl(s, 0.03, 0.012, 0.04, x, h, 0, GLASS, 14);
        const top = [x + (rnd() - 0.5) * 0.06, h + 0.12 + 0.05 * rnd(), (rnd() - 0.5) * 0.04];
        rod(s, [x, h + 0.04, 0], top, 0.003, STEM, 3);
        facing(tipped(rnd() * 6.3, 0.4), top, () => (j % 2 ? daisy(s, 0.05, cols[j % 4], YELLOW, 12) : bloom(s, 0.04, 0, 0, 0, cols[j % 4], j)));
      }
      return grounded(s);
    },
  },
  rose_ball: {
    group: "aerial", height: 2.6, hangs: true, on: "floor", colour: "white", size: { r: 0.13 }, block: false,
    knobs: { flowers: { min: 20, max: 140, value: 60 } },
    make(col, k = { flowers: 60 }) {
      // a kissing ball: a sphere of roses hung on a satin ribbon, 2 m up to its middle
      const s = shape(), R = 0.13 * Math.min(1.3, Math.max(0.8, (k.flowers / 60) ** 0.3)), c = 2.15 - R, golden = Math.PI * (3 - Math.sqrt(5));
      rod(s, [0, 2.6, 0], [0, c + R, 0], 0.006, COLOURS.ivory, 4);
      made("satin", () => ball(s, R * 0.85, 0, c, 0, LEAF, 12));
      for (let j = 0; j < k.flowers; j++) {
        const up = 1 - 2 * (j + 0.5) / k.flowers, ring = Math.sqrt(1 - up * up), a = j * golden, d = [ring * Math.sin(a), up, ring * Math.cos(a)];
        facing(d, [d[0] * R * 0.85, c + d[1] * R * 0.85, d[2] * R * 0.85], () => bloom(s, R * 0.9 / Math.sqrt(k.flowers / 6), 0, 0, 0, j % 6 === 5 ? COLOURS.blush : col, j));
      }
      return s;
    },
  },
  // ------------------------------------------------ the dessert table
  dessert_tray: {
    group: "table", height: 0.3, on: "top", colour: "white", size: { r: 0.17 }, block: false,
    built: ["w", "h"], knobs: { pieces: { min: 1, max: 24, value: 9 } },
    make(col, k = { w: 0.34, h: 0.3, pieces: 9 }) {
      // a footed cake plate: a foot, a stem as tall as asked, a plate as wide as asked (the edge a
      // little raised) and little cakes on it: cupcakes in a ring and a ring inside it
      const s = shape(), R = k.w / 2, stem = Math.max(0.02, k.h - 0.093);
      made("satin", () => {
        cyl(s, Math.min(0.09, R * 0.55), Math.min(0.06, R * 0.35), 0.015, 0, 0, 0, col, 28);
        cyl(s, 0.014, 0.014, stem, 0, 0.015, 0, col, 14);
        cyl(s, R * 0.9, R, 0.012, 0, 0.015 + stem, 0, col, 40);
      });
      const y = 0.027 + stem, n = k.pieces, outer = Math.min(n, Math.max(1, Math.floor((2 * Math.PI * (R - 0.04)) / 0.065)));
      const tops = [COLOURS.blush, CREAM, BERRY, MINT, LILAC];
      for (let j = 0; j < n; j++) {
        const ring = j < outer ? R - 0.04 : Math.max(0, R - 0.105), m = j < outer ? outer : n - outer, i = j < outer ? j : j - outer;
        const a = (i / Math.max(1, m)) * 2 * Math.PI + (j < outer ? 0 : 0.4), r = m === 1 && j >= outer ? 0 : ring;
        cupcake(s, r * Math.sin(a), y, r * Math.cos(a), tops[j % tops.length]);
      }
      return s;
    },
  },
  tiered_stand: {
    group: "table", height: 0.45, on: "top", colour: "gold", size: { r: 0.16 }, block: false,
    knobs: { tiers: { min: 2, max: 5, value: 3 } },
    make(col, k = { tiers: 3 }) {
      // round plates on a brass rod, each smaller than the one below, cupcakes round each one
      const s = shape(), n = k.tiers, gap = 0.39 / n;
      rod(s, [0, 0, 0], [0, 0.42, 0], 0.006, col, 8);
      rod(s, [0, 0.42, 0], [0, 0.45, 0], 0.012, col, 8);
      for (let j = 0; j < n; j++) {
        const r = 0.16 - (0.08 * j) / Math.max(1, n - 1), y = j * gap;
        made("satin", () => cyl(s, r, r, 0.008, 0, y, 0, COLOURS.white, 36));
        const m = Math.max(1, Math.floor((2 * Math.PI * (r - 0.035)) / 0.065));
        for (let i = 0; i < m; i++) { const a = (i / m) * 2 * Math.PI + j; cupcake(s, (r - 0.035) * Math.sin(a), y + 0.008, (r - 0.035) * Math.cos(a), [COLOURS.blush, CREAM, LILAC][(i + j) % 3]); }
      }
      return s;
    },
  },
  macaron_tower: {
    group: "table", height: 0.48, on: "top", colour: "blush", size: { r: 0.13 }, block: false,
    make(col) {
      // a cone of macarons in rings, smaller up to its tip, a rose on top
      const s = shape(), cols = [col, MINT, LILAC, LEMON];
      made("satin", () => cyl(s, 0.13, 0.13, 0.01, 0, 0, 0, COLOURS.white, 32));
      for (let j = 0; j < 12; j++) {
        const R = 0.1 * (1 - j / 13), m = Math.max(3, Math.round((2 * Math.PI * R) / 0.03)), y = 0.01 + j * 0.036;
        for (let i = 0; i < m; i++) { const a = (i / m) * 2 * Math.PI + j * 0.3; facing([Math.sin(a), 0.001, Math.cos(a)], [R * Math.sin(a), y + 0.018, R * Math.cos(a)], () => macaron(s, 0.018, 0, -0.016, 0, cols[j % 4])); }
      }
      bloom(s, 0.04, 0, 0.455, 0, COLOURS.white, 1);
      return grounded(s);
    },
  },
  glass_cloche: {
    group: "table", height: 0.36, on: "top", colour: "wood", size: { r: 0.16 }, block: false,
    make(col) {
      // a small cake under a glass dome with a knob, on a wooden board
      const s = shape();
      cyl(s, 0.16, 0.16, 0.025, 0, 0, 0, col, 36);
      made("satin", () => { cyl(s, 0.08, 0.08, 0.1, 0, 0.025, 0, CREAM, 32); cyl(s, 0.082, 0.082, 0.012, 0, 0.12, 0, BERRY, 32); });
      for (let j = 0; j < 7; j++) ball(s, 0.012, 0.05 * Math.sin(j), 0.14, 0.05 * Math.cos(j), BERRY, 6);
      lathe(s, Array.from({ length: 13 }, (_, j) => { const t = j / 12; return t < 0.5 ? [0.14, 0.025 + 0.36 * t] : [0.14 * Math.cos((t - 0.5) * 2 * 1.45), 0.205 + 0.11 * Math.sin((t - 0.5) * Math.PI)]; }), GLASS);
      ball(s, 0.022, 0, 0.335, 0, GLASS, 10);
      return grounded(s);
    },
  },
  fruit_bowl: {
    group: "table", height: 0.27, on: "top", colour: "wood", size: { r: 0.2 }, block: false,
    knobs: { fruits: { min: 3, max: 20, value: 10 } },
    make(col, k = { fruits: 10 }) {
      // a wooden bowl heaped with tropical fruit, a pineapple standing in it
      const s = shape(), rnd = rng(31), fruit = [ORANGE, LEMON, [0.55, 0.75, 0.25], RED, [0.95, 0.75, 0.3]];
      cyl(s, 0.08, 0.2, 0.09, 0, 0, 0, col, 32);
      made("satin", () => {
        for (let j = 0; j < k.fruits; j++) { const a = j * 2.4, r = 0.13 * Math.sqrt((j + 0.5) / k.fruits); ball(s, 0.035 + 0.01 * rnd(), r * Math.sin(a), 0.1 + 0.02 * rnd(), r * Math.cos(a), fruit[j % fruit.length], 10); }
        blob(s, 0.05, 0.075, 0.05, -0.03, 0.15, -0.02, [0.78, 0.6, 0.25], 0, 10);
      });
      for (let j = 0; j < 9; j++) leaf(s, [-0.03, 0.21, -0.02], tipped(j * 0.7, 0.3 + 0.05 * j), 0.06, 0.15, DARK_LEAF);
      return grounded(s);
    },
  },
  taper_candles: {
    group: "table", height: 0.44, on: "top", colour: "gold", size: { w: 0.5, d: 0.11 }, block: false,
    built: ["w"], knobs: { candles: { min: 1, max: 12, value: 5 } },
    make(col, k = { w: 0.5, candles: 5 }) {
      // brass holders of different heights in a row, a tall taper and its flame in each
      const s = shape(), n = k.candles;
      for (let j = 0; j < n; j++) {
        const x = n === 1 ? 0 : (j / (n - 1) - 0.5) * (k.w - 0.08), h = [0.1, 0.06, 0.13, 0.08][j % 4], z = j % 2 ? 0.02 : -0.02;
        cyl(s, 0.035, 0.03, 0.012, x, 0, z, col, 16); rod(s, [x, 0.012, z], [x, h, z], 0.008, col, 8); cyl(s, 0.018, 0.022, 0.02, x, h, z, col, 12);
        cyl(s, 0.01, 0.009, 0.26, x, h + 0.02, z, WAX, 10);
        lit(() => blob(s, 0.006, 0.014, 0.006, x, h + 0.295, z, FLAME, 0, 6));
      }
      return s;
    },
  },
  hurricane: {
    group: "table", height: 0.43, on: "top", colour: "ivory", size: { r: 0.16 }, block: false,
    make(col) {
      // a pillar candle in a tall glass hurricane, a ring of greenery and roses round its foot
      const s = shape();
      cyl(s, 0.09, 0.1, 0.42, 0, 0.005, 0, GLASS, 28);
      cyl(s, 0.05, 0.05, 0.16, 0, 0.005, 0, WAX, 20);
      lit(() => blob(s, 0.01, 0.02, 0.01, 0, 0.185, 0, FLAME, 0, 6));
      for (let j = 0; j < 12; j++) { const a = (j / 12) * 2 * Math.PI; sprig(s, [0.11 * Math.sin(a), 0.01, 0.11 * Math.cos(a)], tipped(a + 1.4, 1.35), 0.09, j); }
      for (let j = 0; j < 5; j++) { const a = j * 1.26; bloom(s, 0.03, 0.12 * Math.sin(a), 0.005, 0.12 * Math.cos(a), j % 2 ? col : COLOURS.blush, j); }
      return grounded(s);
    },
  },
  driftwood_centrepiece: {
    group: "table", height: 0.1, on: "top", colour: "white", size: { w: 0.7, d: 0.22 }, block: false,
    make(col) {
      // for the beach: a log of driftwood, shells and starfish along it, candles in glass
      const s = shape(), rnd = rng(41);
      rod(s, [-0.33, 0.04, 0], [0.33, 0.035, 0.02], 0.035, DRIFT, 10);
      rod(s, [-0.1, 0.05, 0], [-0.25, 0.06, 0.07], 0.014, DRIFT, 6);
      made("satin", () => {
        for (let j = 0; j < 5; j++) {
          const x = -0.28 + j * 0.14, z = (j % 2 ? 1 : -1) * 0.065;
          for (let a = 0; a < 5; a++) blob(s, 0.008, 0.005, 0.03, x + 0.022 * Math.sin(a * 1.2566), 0.006, z + 0.022 * Math.cos(a * 1.2566), CORAL, a * 1.2566, 6);
          blob(s, 0.022, 0.012, 0.026, x + 0.05, 0.012, -z * 0.6, j % 2 ? SAND : col, rnd() * 6, 8);
        }
      });
      for (const x of [-0.18, 0.18]) { cyl(s, 0.035, 0.035, 0.1, x, 0, -0.01, GLASS, 16); cyl(s, 0.028, 0.028, 0.05, x, 0.005, -0.01, WAX, 14); lit(() => ball(s, 0.008, x, 0.062, -0.01, FLAME, 6)); }
      for (let j = 0; j < 4; j++) sprig(s, [-0.3 + j * 0.2, 0.06, 0.02], tipped(1.6 + j, 1.3), 0.12, 50 + j);
      return grounded(s);
    },
  },
  // ------------------------------------------------ the bar
  modular_bar: {
    group: "bar", height: 1.1, on: "floor", colour: "white", size: { w: 2.0, d: 0.6 }, block: true, top: 1.1,
    built: ["w", "d", "h"], knobs: { slab: { min: 0.02, max: 0.12, value: 0.04, step: 0.01, size: true } },
    make(col, k = { w: 2.0, d: 0.6, h: 1.1, slab: 0.04 }) {
      // modules of about 70 cm side by side, as many as the width takes, each a fluted front in a
      // frame (the frame in the colour, the flutes a shade darker), under one wooden top `slab` thick
      const s = shape(), n = Math.max(1, Math.round(k.w / 0.7)), mw = k.w / n, h = k.h - k.slab, d = k.d - 0.04;
      const flute = col.map((v) => v * 0.9);
      for (let j = 0; j < n; j++) {
        const x = -k.w / 2 + mw * (j + 0.5);
        box(s, mw - 0.01, h, d, x, 0, -0.02, col);
        const f = Math.max(3, Math.round((mw - 0.12) / 0.045));
        for (let i = 0; i < f; i++) cyl(s, 0.018, 0.018, h - 0.16, x - (mw - 0.12) / 2 + (i + 0.5) * ((mw - 0.12) / f), 0.08, d / 2 - 0.02, flute, 10);
        box(s, mw - 0.01, 0.05, 0.02, x, 0, d / 2 - 0.01, COLOURS.black);
      }
      box(s, k.w, k.slab, k.d, 0, h, 0, COLOURS.wood);
      return s;
    },
  },
  ice_bucket: {
    group: "bar", height: 0.4, on: "top", colour: "gold", size: { r: 0.15 }, block: false,
    knobs: { bottles: { min: 1, max: 5, value: 3 } },
    make(col, k = { bottles: 3 }) {
      // a brass champagne bucket of ice, bottles leaning in it
      const s = shape();
      cyl(s, 0.1, 0.14, 0.24, 0, 0, 0, col, 28);
      for (const a of [Math.PI / 2, -Math.PI / 2]) rod(s, [0.14 * Math.sin(a), 0.2, 0], [0.16 * Math.sin(a), 0.2, 0], 0.012, col, 6);
      made("glass", () => { for (let j = 0; j < 14; j++) box(s, 0.03, 0.03, 0.03, 0.09 * Math.sin(j * 2.4) * Math.sqrt(j / 14), 0.2, 0.09 * Math.cos(j * 2.4) * Math.sqrt(j / 14), SNOW); });
      for (let j = 0; j < k.bottles; j++) {
        const a = j * 2.1, base = [0.04 * Math.sin(a), 0.02, 0.04 * Math.cos(a)], d = tipped(a, 0.18);
        const c = BOTTLES[j % 2 ? 0 : 3], at = (t) => base.map((v, i) => v + d[i] * t);
        rod(s, base, at(0.24), 0.036, c, 12); rod(s, at(0.24), at(0.3), 0.014, c, 8); rod(s, at(0.3), at(0.38), 0.014, COLOURS.gold, 8);
      }
      return grounded(s);
    },
  },
  drinks_dispensers: {
    group: "bar", height: 0.56, on: "top", colour: "wood", size: { w: 0.62, d: 0.26 }, block: false,
    make(col) {
      // two glass dispensers of lemonade and hibiscus on a wooden stand, tap at the front
      const s = shape();
      box(s, 0.62, 0.12, 0.26, 0, 0, 0, col);
      for (const [x, fill] of [[-0.15, LEMON], [0.15, [0.85, 0.25, 0.35]]]) {
        cyl(s, 0.1, 0.1, 0.36, x, 0.12, 0, GLASS, 24);
        made("glass", () => cyl(s, 0.092, 0.092, 0.26, x, 0.13, 0, fill, 24));
        cyl(s, 0.07, 0.04, 0.05, x, 0.48, 0, GLASS, 20); ball(s, 0.03, x, 0.54, 0, GLASS, 10);
        rod(s, [x, 0.16, 0.1], [x, 0.16, 0.13], 0.01, SILVER, 6);
        for (let j = 0; j < 4; j++) made("satin", () => cyl(s, 0.03, 0.03, 0.006, x + 0.04 * Math.sin(j * 1.5), 0.18 + j * 0.06, 0.04 * Math.cos(j * 1.5), j % 2 ? LEMON : LEAF, 12));
      }
      return s;
    },
  },
  // ------------------------------------------------ lights
  tiki_torch: {
    group: "lights", height: 1.62, on: "floor", colour: "rattan", size: { r: 0.065 }, block: false,
    make(col) {
      // a bamboo pole, a woven cup at its top and the flame over it
      const s = shape();
      for (let j = 0; j < 5; j++) { cyl(s, 0.022, 0.022, 0.26, 0, j * 0.27, 0, BAMBOO, 10); cyl(s, 0.026, 0.026, 0.01, 0, j * 0.27 + 0.26, 0, BAMBOO, 10); }
      cyl(s, 0.03, 0.065, 0.14, 0, 1.36, 0, col, 16);
      for (let j = 1; j < 4; j++) cyl(s, 0.03 + 0.035 * j / 4 + 0.002, 0.03 + 0.035 * (j + 0.4) / 4 + 0.002, 0.012, 0, 1.36 + j * 0.035, 0, col.map((v) => v * 0.8), 16);
      rod(s, [0, 1.5, 0], [0, 1.52, 0], 0.008, WAX, 6);
      lit(() => blob(s, 0.03, 0.06, 0.03, 0, 1.56, 0, FLAME, 0, 8));
      return s;
    },
  },
  // ------------------------------------------------ lounge, for the beach
  parasol: {
    group: "lounge", height: 2.35, on: "floor", colour: "rattan", size: { r: 1.1 }, block: "posts", posts: [[0, 0]],
    make(col) {
      // a straw beach parasol: a wooden pole, a cone of thatch in layers, a fringe round its edge
      const s = shape(), rnd = rng(61);
      rod(s, [0, 0, 0], [0, 2.3, 0], 0.025, TRUNK, 10);
      for (let j = 0; j < 4; j++) cyl(s, 1.1 - j * 0.25, 0.85 - j * 0.25, 0.14, 0, 1.95 + j * 0.09, 0, j % 2 ? col : STRAW, 32);
      cyl(s, 0.12, 0.02, 0.06, 0, 2.29, 0, STRAW, 12);
      for (let j = 0; j < 64; j++) { const a = (j / 64) * 2 * Math.PI, l = 0.12 + 0.05 * rnd(); rod(s, [1.08 * Math.sin(a), 1.96, 1.08 * Math.cos(a)], [1.1 * Math.sin(a), 1.96 - l, 1.1 * Math.cos(a)], 0.012, STRAW, 3); }
      return s;
    },
  },
  deck_chair: {
    group: "lounge", height: 0.92, on: "floor", colour: "blue", size: { w: 0.6, d: 0.95 }, block: true, seat: { y: 0.4, z: 0.15, back: true },
    make(col) {
      // a wooden folding deck chair with a striped canvas sling, leaning back
      const s = shape();
      for (const x of [-0.3, 0.3]) {
        rod(s, [x, 0, 0.45], [x, 0.9, -0.42], 0.016, COLOURS.wood, 6);
        rod(s, [x, 0, -0.35], [x, 0.42, 0.3], 0.016, COLOURS.wood, 6);
        rod(s, [x, 0.42, 0.3], [x, 0.42, 0.48], 0.014, COLOURS.wood, 6);
      }
      for (const [y, z] of [[0.9, -0.42], [0.42, 0.48], [0.05, 0.4]]) rod(s, [-0.3, y, z], [0.3, y, z], 0.014, COLOURS.wood, 6);
      sling(s, [0.88, -0.4], [0.3, 0.3], 0.56, col);
      return grounded(s);
    },
  },
  crates: {
    group: "lounge", height: 0.9, on: "floor", colour: "wood", size: { w: 0.5, d: 0.35 }, block: true, top: 0.9,
    knobs: { crates: { min: 1, max: 6, value: 3 } },
    make(col, k = { crates: 3 }) {
      // wooden crates stacked on their sides, a little askew, 30 cm each (the stack as tall as three)
      const s = shape(), n = k.crates, h = 0.9 / Math.max(3, n);
      for (let j = 0; j < n; j++) crate(s, 0.48, h, 0.33, (j % 2 ? 0.01 : -0.01), j * h, 0, col);
      return s;
    },
  },
  // ------------------------------------------------ the ceremony
  hexagon_arch: {
    group: "ceremony", height: 2.33, on: "floor", colour: "white", size: { w: 2.0, d: 0.5 }, block: "posts", posts: [[-0.66, 0], [0.66, 0]],
    knobs: { flowers: { min: 6, max: 60, value: 24 } },
    make(col, k = { flowers: 24 }) {
      // a wooden hexagon on two feet, flowers and greenery spilling over two of its corners
      const s = shape(), R = 1.0, cy = 1.3, P = Array.from({ length: 6 }, (_, j) => [R * Math.cos(j * Math.PI / 3), cy + R * Math.sin(j * Math.PI / 3), 0]);
      for (let j = 0; j < 6; j++) rod(s, P[j], P[(j + 1) % 6], 0.035, COLOURS.wood, 6);
      for (const x of [-0.66, 0.66]) { rod(s, [x * 0.76, 0.42, 0], [x, 0, 0], 0.03, COLOURS.wood, 6); box(s, 0.12, 0.04, 0.45, x, 0, 0, COLOURS.wood); }
      const half = Math.ceil(k.flowers / 2);
      for (const [corner, side] of [[P[1], 1], [P[4], -1]]) {
        bunch(s, half, 0.22, corner[0], corner[1], 0.05, col, side > 0 ? 81 : 82);
        for (let j = 0; j < 6; j++) sprig(s, [corner[0], corner[1], 0.05], [side * 0.6 * Math.cos(j), -0.5 - 0.1 * j, 0.3 * Math.sin(j)], 0.3, j + (side > 0 ? 0 : 9));
      }
      return grounded(s);
    },
  },
  macrame_backdrop: {
    group: "ceremony", height: 2.3, on: "floor", colour: "ivory", size: { w: 2.0, d: 0.45 }, block: "posts", posts: [[-0.95, 0], [0.95, 0]],
    built: ["w"], knobs: { cords: { min: 10, max: 60, value: 30 } },
    make(col, k = { w: 2.0, cords: 30 }) {
      // a wooden frame (two posts on feet, a bar across), cotton cords knotted into diamonds hanging
      // from it, a fringe at the bottom; as wide as asked, with as many cords as asked
      const s = shape(), x0 = k.w / 2 - 0.05, n = k.cords;
      for (const x of [-x0, x0]) { rod(s, [x, 0, 0], [x, 2.3, 0], 0.03, COLOURS.wood, 8); box(s, 0.1, 0.04, 0.45, x, 0, 0, COLOURS.wood); }
      rod(s, [-x0 - 0.04, 2.2, 0], [x0 + 0.04, 2.2, 0], 0.025, COLOURS.wood, 8);
      const step = (2 * x0 - 0.1) / Math.max(1, n - 1);
      for (let j = 0; j < n; j++) {
        const x = -x0 + 0.05 + j * step, len = 1.0 + 0.35 * Math.sin((j / Math.max(1, n - 1)) * Math.PI);
        let prev = [x, 2.2, 0];
        for (let t = 1; t <= 6; t++) {
          const q = [x + (t % 2 ? 1 : -1) * step * 0.5 * (t < 5 ? 1 : 0), 2.2 - (len * t) / 6, 0.01];
          rod(s, prev, q, 0.006, col, 4);
          if (t < 5) made("cloth", () => ball(s, 0.014, q[0], q[1], q[2], col, 6));
          prev = q;
        }
        rod(s, prev, [prev[0], prev[1] - 0.22, 0.01], 0.004, col, 3);
      }
      return s;
    },
  },
};
