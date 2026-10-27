// Decor starters (../decor.js): From the decorators' proposals (their helpers are in shapes.js).
import {
  COLOURS, LEAF, FLAME, WAX, GLASS, shape, vert, lit, made, quad,
  box, soft, cyl, rod, ball, blob, bloom, facing, BULB, WIRE,
  other, hoop, cloth, STEM, DARK_LEAF, EUCALYPTUS, PALM, RED, CORAL, ORANGE,
  YELLOW, MAGENTA, ORCHID, PINK, SNOW, RATTAN, DECK, PAMPAS, grounded, rng,
  tipped, daisy, orchid, cloud, plume, torch, leaf, sprig, tropical, broadTree,
  almondTree, coconutPalm, smallTree, border, roofBay, STEEL_MAROON, woven, CORDYLINE, BOUGAIN, MONSTERA, MOSS,
  JUTE, CLAY, BAMBOO, TRUNK, CUSHION, BEIGE, SNAP, at, bulb, shade,
  canopy, hangers, cascade, braided, jute, florets,
} from "./shapes.js";

export const PROPOSALS = {
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
  gourd_pendants: {
    group: "lights", height: 2.9, hangs: true, on: "floor", colour: "rattan", size: { w: 2.0, d: 1.6 }, block: false,
    make(col) {
      // nine woven teardrops glowing warm from inside, at different heights on long cords, as in
      // the venue's vertical garden: pointed at the top, round below, open at the bottom
      const s = shape();
      for (const [x, y, z, h, r] of [[0, 1.55, 0, 0.58, 0.22], [-0.55, 1.75, 0.4, 0.5, 0.19], [0.6, 1.8, -0.35, 0.5, 0.19],
                                     [-0.35, 2.15, -0.5, 0.45, 0.17], [0.45, 2.1, 0.55, 0.46, 0.18], [-0.85, 2.2, -0.05, 0.42, 0.17],
                                     [0.9, 2.25, 0.1, 0.42, 0.17], [0.05, 2.3, 0.65, 0.44, 0.17], [0.1, 2.25, -0.7, 0.44, 0.17]])
        teardrop(s, x, y, z, h, r, col);
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
  // trees, as in the venue's garden (and for any garden)
  small_tree: {
    group: "garden", height: 3.3, on: "floor", colour: "green", size: { w: 2.4, d: 2.5 }, block: "posts", posts: [[0, 0]],
    make() { const s = shape(); smallTree(s, 3.2, 1.6, 31); return grounded(s); },
  },
  tropical_border: {
    group: "garden", height: 2.05, on: "floor", colour: "green", size: { w: 3.0, d: 2.2 }, block: true,
    make() { const s = shape(); border(s, 2.0, 1.3, 41); return grounded(s); },
  },
  living_wall: {
    group: "garden", height: 3.4, on: "floor", colour: "green", size: { w: 2.0, d: 0.3 }, block: true,
    make() {
      // a wall planted all over, 3.4 m high: fern fronds hanging from pockets on a dark green
      // backing, each arching a little out from the wall and falling down it, its leaflets either
      // side lying along the wall, so the whole wall flows downward like the venue's
      const s = shape(), rnd = rng(173);
      box(s, 2.0, 3.4, 0.08, 0, 0, -0.1, FERN_SHADOW);            // (deep in the leaves: dark)
      for (let k = 0; k < 300; k++) {
        const len = 0.6 + 0.4 * rnd(), x = (rnd() - 0.5) * 1.8, y = len * 0.75 + rnd() * (3.35 - len * 0.75);
        fern(s, [x, y, -0.05], len, (rnd() - 0.5) * 0.5, [FERN, FERN_DARK, FERN_LIGHT, FERN][k % 4], rnd);
      }
      return grounded(s);
    },
  },
  glass_roof: {
    group: "garden", height: 4.85, on: "floor", colour: "black", size: { w: 3.3, d: 16.6 }, block: "posts", posts: [[0, -8.3], [0, 8.3]],
    make() { const s = shape(); roofBay(s, 3.3, 16.6, 3.4, 4.8, STEEL_MAROON); return s; },
  },
  glass_lantern: {
    group: "garden", height: 4.6, hangs: true, on: "floor", colour: "wood", size: { w: 4.5, d: 4.0 }, block: false,
    make() {
      // a glass roof light over a room, 4.5 by 4 m, as in the venue's vertical garden: a low hipped
      // pyramid from a frame round its foot (3.4 m, the ceiling) to a short ridge 1.2 m higher; four
      // stout reddish rafters at its corners and one up the middle of each side, a purlin round it
      // part way up, and clear glass between them, the sky pale through it
      const s = shape(), w = 4.5, d = 4.0, eave = 3.4, top = 4.6, r = (w - d) / 2, up = 0.42;
      // (the point a fraction t of the way up from (x, eave, z) toward the ridge)
      const on = (x, z, t) => [x + (Math.max(-r, Math.min(r, x)) - x) * t, eave + (top - eave) * t, z * (1 - t)];
      made("wood", () => {
        for (const z of [-d / 2, d / 2]) box(s, w + 0.2, 0.18, 0.14, 0, eave - 0.16, z, TIMBER_RED);
        for (const x of [-w / 2, w / 2]) box(s, 0.14, 0.18, d, x, eave - 0.16, 0, TIMBER_RED);
        rod(s, [-r, top, 0], [r, top, 0], 0.06, TIMBER_RED, 8);
        const feet = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
        for (const [x, z] of feet) rod(s, [x, eave, z], on(x, z, 1), 0.06, TIMBER_RED, 8);
        for (const [x, z] of [[0, -d / 2], [0, d / 2], [-w / 2, 0], [w / 2, 0]]) rod(s, [x, eave, z], on(x, z, 1), 0.05, TIMBER_RED, 8);
        for (let k = 0; k < 4; k++) rod(s, on(...feet[k], up), on(...feet[(k + 1) % 4], up), 0.04, TIMBER_RED, 8);   // (the purlin)
      });
      made("glass", () => {
        const v = (p) => vert(s, p[0], p[1] + 0.05, p[2], SKY_GLASS);
        for (const z of [-1, 1]) quad(s, v([-w / 2, eave, z * d / 2]), v([w / 2, eave, z * d / 2]), v([r, top, 0]), v([-r, top, 0]));
        for (const x of [-1, 1]) { const a = v([x * w / 2, eave, -d / 2]), b = v([x * w / 2, eave, d / 2]), c = v([x * r, top, 0]); s.i.push(a, b, c); }
      });
      return s;
    },
  },
  jute_ceiling: {
    group: "ceremony", height: 3.4, hangs: true, on: "floor", colour: "rattan", size: { w: 4, d: 4 }, block: false,
    make(col) { const s = shape(); swags(s, col, true); return s; },
  },
  jute_swags: {
    group: "ceremony", height: 3.4, hangs: true, on: "floor", colour: "rattan", size: { w: 4, d: 4 }, block: false,
    make(col) { const s = shape(); swags(s, col, false); return s; },
  },
  agave: {
    group: "garden", height: 0.575, on: "floor", colour: "green", size: { r: 0.64 }, block: true,
    make() {
      // an agave in the sand: a rosette of thick blue-grey leaves, the inner ones standing up
      const s = shape(), rnd = rng(211);
      for (let k = 0; k < 26; k++) {
        const t = k / 26;
        leaf(s, [0, 0.02, 0], tipped(k * 2.4 + 0.3 * rnd(), 1.25 - 0.95 * t), 0.8 - 0.15 * t, 0.13, k % 3 ? AGAVE : AGAVE_PALE);
      }
      return grounded(s);
    },
  },
  pink_shrub: {
    group: "garden", height: 1.025, on: "floor", colour: "blush", size: { r: 0.66 }, block: true,
    make() {
      // a rounded flowering shrub, dark leaves under a scatter of pink and magenta flowers
      const s = shape(), rnd = rng(191);
      const dome = (r) => {
        const a = rnd() * 6.283, t = Math.acos(rnd());
        return [r * Math.sin(t) * Math.sin(a), 0.05 + 1.0 * r * Math.cos(t) / 0.66, r * Math.sin(t) * Math.cos(a)];
      };
      blob(s, 0.5, 0.36, 0.5, 0, 0.42, 0, DARK_LEAF, 0, 10);       // (its dense middle, so nothing shows through)
      for (let k = 0; k < 700; k++) { const p = dome(0.58 * (0.75 + 0.25 * rnd())); leaf(s, p, tipped(rnd() * 6.283, 0.3 + 0.9 * rnd()), 0.2, 0.1, k % 2 ? DARK_LEAF : LEAF); }
      made("satin", () => { for (let k = 0; k < 800; k++) { const p = dome(0.62); blob(s, 0.032, 0.02, 0.032, p[0], p[1], p[2], k % 3 ? PINK_FLOWER : MAGENTA, rnd() * 6, 4); } });
      return grounded(s);
    },
  },
  garden_bench: {
    group: "garden", height: 0.45, on: "floor", colour: "wood", size: { w: 2.0, d: 0.42 }, block: true,
    seats: [{ x: -0.6, y: 0.45, z: 0, back: false }, { x: 0, y: 0.45, z: 0, back: false }, { x: 0.6, y: 0.45, z: 0, back: false }],
    make(col) {
      // the garden's benches: a thick hardwood plank on two solid ends, no back
      const s = shape(), dark = col.map((v) => v * 0.8);
      made("wood", () => {
        box(s, 2.0, 0.07, 0.42, 0, 0.38, 0, col);
        box(s, 2.0, 0.004, 0.006, 0, 0.45, 0, dark);              // (the joint between its two boards)
        for (const x of [-0.94, 0.94]) box(s, 0.07, 0.38, 0.42, x, 0, 0, dark);
      });
      return s;
    },
  },
  broad_tree: {
    group: "garden", height: 5.65, on: "floor", colour: "green", size: { r: 2.4 }, block: "posts", posts: [[0.04, 0.03]],
    make() { const s = shape(); broadTree(s, 5.5, 2.6, 11); return grounded(s); },
  },
  beach_almond: {
    group: "garden", height: 5.89, on: "floor", colour: "green", size: { r: 3.6 }, block: "posts", posts: [[0, 0]],
    make() { const s = shape(); almondTree(s, 6.0, 3.0, 23); return grounded(s); },
  },
  coconut_palm: {
    group: "garden", height: 8.34, on: "floor", colour: "green", size: { w: 6.0, d: 5.2 }, block: "posts", posts: [[0, 0]],
    make() { const s = shape(); coconutPalm(s, 8.0, 5); return grounded(s); },
  },
  // seen at Casa Arandella (the walkthrough filmed there, 2026-10-24)
  blue_bookcase: {
    group: "lounge", height: 1.9, on: "floor", colour: "blue", size: { w: 0.9, d: 0.4 }, block: true,
    make(col) {
      // a painted bookcase, an X brace down each side, wooden shelves and a dark back
      const s = shape(), x = 0.43;
      for (const sx of [-x, x]) {
        for (const z of [-0.18, 0.18]) box(s, 0.05, 1.9, 0.05, sx, 0, z, col);
        box(s, 0.05, 0.05, 0.4, sx, 0, 0, col);
        box(s, 0.05, 0.05, 0.4, sx, 1.83, 0, col);
        rod(s, [sx, 0.06, -0.16], [sx, 1.82, 0.16], 0.018, col, 4);
        rod(s, [sx, 0.06, 0.16], [sx, 1.82, -0.16], 0.018, col, 4);
      }
      box(s, 0.92, 0.06, 0.42, 0, 1.88, 0, col);
      made("wood", () => { for (const y of [0.1, 0.55, 1.0, 1.42]) box(s, 0.82, 0.03, 0.36, 0, y, 0.01, COLOURS.wood); });
      made("wood", () => box(s, 0.82, 1.78, 0.02, 0, 0.08, -0.18, TRUNK));
      return s;
    },
  },
  iron_shelves: {
    group: "lounge", height: 2.0, on: "floor", colour: "black", size: { w: 1.0, d: 0.36 }, block: true,
    make(col) {
      // open shelves: four black iron posts, five thick wooden boards
      const s = shape();
      made("metal", () => { for (const x of [-0.48, 0.48]) for (const z of [-0.16, 0.16]) box(s, 0.03, 2.0, 0.03, x, 0, z, col); });
      made("wood", () => { for (let k = 0; k < 5; k++) box(s, 1.0, 0.04, 0.36, 0, 0.12 + k * 0.45, 0, DECK); });
      return s;
    },
  },
  high_table: {
    group: "bar", height: 1.1, on: "floor", colour: "wood", size: { r: 0.3 }, block: true, top: 1.1,
    make(col) {
      // a standing table in wood: a round top on a post, three splayed feet
      const s = shape();
      made("wood", () => {
        cyl(s, 0.3, 0.3, 0.04, 0, 1.06, 0, col, 28);
        cyl(s, 0.035, 0.035, 1.0, 0, 0.06, 0, col, 10);
        for (let k = 0; k < 3; k++) { const a = (k / 3) * 2 * Math.PI; rod(s, [0, 0.36, 0], [0.32 * Math.sin(a), 0.01, 0.32 * Math.cos(a)], 0.025, col, 6); }
      });
      return s;
    },
  },
  egg_planter: {
    group: "flowers", height: 1.23, on: "floor", colour: "white", size: { r: 0.32 }, block: true,
    make(col) {
      // a big egg-shaped pot, matt white, a peace lily's broad leaves standing out of it
      const s = shape();
      blob(s, 0.32, 0.4, 0.32, 0, 0.4, 0, col, 0, 14);
      cyl(s, 0.18, 0.18, 0.02, 0, 0.78, 0, TRUNK, 16);
      for (let k = 0; k < 9; k++) leaf(s, [0, 0.78, 0], tipped(k * 0.7, 0.25 + 0.06 * (k % 3)), 0.5, 0.32, k % 2 ? DARK_LEAF : LEAF);
      return s;
    },
  },
  daybed: {
    group: "lounge", height: 0.42, on: "floor", colour: "wood", size: { w: 1.9, d: 0.8 }, block: true, seat: { y: 0.42, z: 0, back: false },
    make(col) {
      // a low wooden daybed, a mattress in a fine black and white stripe on it
      const s = shape();
      made("wood", () => { box(s, 1.9, 0.22, 0.8, 0, 0.04, 0, col); for (const x of [-0.9, 0.9]) for (const z of [-0.35, 0.35]) box(s, 0.08, 0.04, 0.08, x, 0, z, col); });
      for (let k = 0; k < 18; k++) soft(s, 1.84 / 18, 0.16, 0.76, -0.92 + (k + 0.5) * (1.84 / 18), 0.26, 0, k % 2 ? COLOURS.black : CUSHION, 0.01, 2);
      return s;
    },
  },
  diamond_rug: {
    group: "lounge", height: 0.01, on: "floor", colour: "black", size: { w: 1.6, d: 1.0 }, block: false,
    make(col) {
      // a flat-woven rug, black diamonds in rows on off-white
      const s = shape();
      box(s, 1.6, 0.004, 1.0, 0, 0, 0, CUSHION);
      for (let i = 0; i < 8; i++) for (let k = 0; k < 5; k++) {
        const x = -0.7 + i * 0.2, z = -0.4 + k * 0.2;
        at(x, 0.004, z, () => { const a = s.p.length / 3; for (const [dx, dz] of [[0.07, 0], [0, 0.07], [-0.07, 0], [0, -0.07]]) vert(s, dx, 0.001, dz, col); quad(s, a, a + 1, a + 2, a + 3); });
      }
      return s;
    },
  },
  wall_fan: {
    group: "lights", height: 0.55, hangs: true, on: "floor", colour: "black", size: { w: 0.55, d: 0.58 }, block: false,
    make(col) {
      // an oscillating fan on a wall bracket, black, its face tipped down a little: the venue's
      // (stood on the floor here; hung on a wall, lift it to 2.4 m)
      const s = shape(), tip = 0.25, c = [0, 0.3, 0.26];
      box(s, 0.12, 0.16, 0.02, 0, 0.12, -0.19, col);
      rod(s, [0, 0.2, -0.18], [0, 0.3, 0.08], 0.018, col, 8);
      const face = [0, -Math.sin(tip), Math.cos(tip)];
      facing(face, [c[0], c[1], c[2] - 0.04], () => cyl(s, 0.07, 0.06, 0.12, 0, -0.06, 0, col, 16));
      facing(face, c, () => {
        made("metal", () => {
          for (const y of [0.0, 0.07]) for (let k = 0; k < 48; k++) {
            const a = (k / 48) * 2 * Math.PI, b = ((k + 1) / 48) * 2 * Math.PI;
            rod(s, [0.25 * Math.cos(a), y, 0.25 * Math.sin(a)], [0.25 * Math.cos(b), y, 0.25 * Math.sin(b)], 0.004, col, 4);
          }
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * 2 * Math.PI;
            rod(s, [0, 0.085, 0], [0.25 * Math.cos(a), 0.07, 0.25 * Math.sin(a)], 0.0025, col, 3);
            rod(s, [0, -0.01, 0], [0.25 * Math.cos(a), 0.0, 0.25 * Math.sin(a)], 0.0025, col, 3);
          }
        });
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * 2 * Math.PI, p = s.p.length / 3;
          for (const [r, da] of [[0.03, -0.35], [0.21, -0.25], [0.22, 0.3], [0.03, 0.35]]) vert(s, r * Math.cos(a + da), 0.04, r * Math.sin(a + da), col);
          quad(s, p, p + 1, p + 2, p + 3); quad(s, p + 3, p + 2, p + 1, p);
        }
      });
      return s;
    },
  },
  striped_rug: {
    group: "lounge", height: 0.01, on: "floor", colour: "coral", size: { w: 2.4, d: 1.7 }, block: false,
    make(col) {
      // a flat-woven rug in stripes across it: rust, orange, sand and a thin dark line, as in the
      // venue's toilets' hall
      const s = shape(), tones = [col, col.map((v) => v * 0.78), SAND_RUG, col.map((v, k) => v * [1.0, 1.15, 1.3][k]), [0.25, 0.16, 0.12]];
      for (let k = 0; k < 34; k++) {
        const w = 2.4 / 34;
        box(s, w, 0.008, 1.7, -1.2 + (k + 0.5) * w, 0, 0, tones[(k * 7 + (k >> 2)) % tones.length]);
      }
      for (const z of [-0.88, 0.88]) for (let k = 0; k < 40; k++) box(s, 0.012, 0.002, 0.06, -1.17 + k * 0.06, 0, z, SAND_RUG);   // (its fringes)
      return s;
    },
  },
  wall_plates: {
    group: "ceremony", height: 2.5, hangs: true, on: "floor", colour: "rattan", size: { w: 0.5, d: 0.04 }, block: false,
    make(col) {
      // three round woven plates hung one above the other on a wall, the venue's hall's
      const s = shape();
      for (const [y, r] of [[1.95, 0.22], [1.48, 0.24], [1.0, 0.22]]) facing([0, 0, 1], [0, y + 0.3, 0.01], () => jute(s, r, y === 1.48 ? JUTE : col));
      return s;
    },
  },
  sunburst: {
    group: "ceremony", height: 2.4, hangs: true, on: "floor", colour: "rattan", size: { w: 1.3, d: 0.06 }, block: false,
    make(col) {
      // a big woven sun hung on a wall: a round plate, a ring of straw rays round it, as by the
      // venue's hall's windows
      const s = shape(), cy = 1.75, rnd = rng(211);
      facing([0, 0, 1], [0, cy, 0.03], () => jute(s, 0.3, col));
      for (let k = 0; k < 90; k++) {
        const a = (k / 90) * 2 * Math.PI, r1 = 0.32, r2 = 0.6 + 0.06 * rnd();
        rod(s, [Math.cos(a) * r1, cy + Math.sin(a) * r1, 0.02], [Math.cos(a) * r2, cy + Math.sin(a) * r2, 0.02], 0.008, k % 3 ? col : JUTE, 3);
      }
      return s;
    },
  },
  wicker_bench: {
    group: "lounge", height: 0.45, on: "floor", colour: "rattan", size: { w: 1.2, d: 0.45 }, block: true, seat: { y: 0.45, z: 0, back: false },
    make(col) {
      // a woven bench, a white cushion along it
      const s = shape();
      braided(s, 1.2, 0.45, 0.36, 0, 0, col);
      soft(s, 1.16, 0.09, 0.42, 0, 0.36, 0, CUSHION, 0.03, 4);
      return s;
    },
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
};

// A woven teardrop lamp at (x, y, z) (its foot), h high and r at its widest, a third of the way up,
// hung from a cord to 2.9 m: a warm lit skin inside its weave.
function teardrop(s, x, y, z, h, r, col) {
  const rad = (t) => 0.012 + r * Math.sin(Math.PI * (0.05 + 0.95 * t) ** 0.7);   // (a little ring at its top, round the cord)
  rod(s, [x, 2.9, z], [x, y + h, z], 0.003, WIRE, 3);
  lit(() => {
    const rows = [], N = 10, M = 18;
    for (let j = 0; j <= N; j++) rows.push(Array.from({ length: M }, (_, k) => {
      const a = (k / M) * 2 * Math.PI, rr = rad(j / N) * 0.95;
      return vert(s, x + rr * Math.sin(a), y + (h * j) / N, z + rr * Math.cos(a), GLOW);
    }));
    for (let j = 0; j < N; j++) for (let k = 0; k < M; k++) quad(s, rows[j][k], rows[j][(k + 1) % M], rows[j + 1][(k + 1) % M], rows[j + 1][k]);
  });
  woven(s, h, rad, x, y, z, col.map((v) => v * 0.8), 10, 22);
}

// The draped jute ceiling of the venue's ante-room and stage, 4 m square, hung from 3.4 m: lengths
// of burlap across it, each sagging between two bars 0.5 m apart; with `bands`, two black strips
// along it, sagging a little lower, as in the ante-room.
const FERN = [0.14, 0.25, 0.08], FERN_DARK = [0.07, 0.14, 0.04], FERN_LIGHT = [0.25, 0.35, 0.11], FERN_SHADOW = [0.04, 0.07, 0.03];
const GLOW = [1.0, 0.7, 0.4], SKY_GLASS = [0.8, 0.88, 0.95];
const AGAVE = [0.42, 0.56, 0.52], AGAVE_PALE = [0.55, 0.66, 0.6], PINK_FLOWER = [0.93, 0.42, 0.62];
const TIMBER_RED = [0.5, 0.27, 0.18], BAND = [0.09, 0.09, 0.09], SAND_RUG = [0.86, 0.76, 0.6];
function swags(s, col, bands) {
  const top = 3.4, sag = 0.28, n = 8;
  for (let k = 0; k <= n; k++) rod(s, [-2 + (4 * k) / n, top, -2], [-2 + (4 * k) / n, top, 2], 0.008, WIRE, 4);
  const sheet = (x0, x1, z0, z1, deep, c, below = 0) => {
    const pts = [], X = 6, Z = 16;
    for (let i = 0; i <= X; i++) for (let j = 0; j <= Z; j++) {
      const t = i / X, z = z0 + ((z1 - z0) * j) / Z;
      // (lighter where it hangs lowest, in the room's light; darker up by the bars, a fold now and then)
      const k = 0.8 + 0.28 * Math.sin(Math.PI * t) + 0.05 * Math.sin(z * 11 + x0 * 3), cc = c === BAND ? c : c.map((v) => Math.min(1, v * k));
      pts.push(vert(s, x0 + (x1 - x0) * t, top - below - deep * Math.sin(Math.PI * t) * (0.9 + 0.1 * Math.sin(z * 2.3 + x0)), z, cc));
    }
    for (let i = 0; i < X; i++) for (let j = 0; j < Z; j++)
      quad(s, pts[i * (Z + 1) + j], pts[i * (Z + 1) + j + 1], pts[(i + 1) * (Z + 1) + j + 1], pts[(i + 1) * (Z + 1) + j]);
  };
  made("cloth", () => {
    for (let k = 0; k < n; k++) {
      const x0 = -2 + (4 * k) / n, x1 = x0 + 4 / n, c = col.map((v) => Math.min(1, v * 1.15 * (0.94 + 0.06 * (k % 2))));   // (burlap: paler than rattan)
      sheet(x0, x1, -2, 2, sag, c);
      if (bands) for (const z of [-0.7, 0.7]) sheet(x0, x1, z - 0.13, z + 0.13, sag + 0.04, BAND, 0.012);
    }
  });
}

// A fern frond hanging on a wall (the wall's face toward +z) from p, len long, drifting `lean`
// sideways as it falls: arching out a little, then down; its leaflets either side, smaller toward
// the tip, flat along the wall and angled down.
function fern(s, p, len, lean, col, rnd) {
  const n = 7;
  for (let k = 1; k <= n; k++) {
    const t = k / n, q = [p[0] + lean * len * t * t, p[1] + len * (0.2 * t - 0.95 * t * t), p[2] + len * 0.4 * t * (1.4 - t)];
    const l = len * 0.26 * (1 - 0.6 * t);
    for (const side of [-1, 1]) {
      const a = side * (0.9 + 0.3 * rnd());          // (down and out to its side: the blob's length turned off straight down)
      facing([0, 0.25, 1].map((v) => v / Math.hypot(0, 0.25, 1)), [q[0] + side * l * 0.42, q[1] - l * 0.2, q[2]],
             () => blob(s, l * 0.22, 0.003, l / 2, 0, 0, 0, col, a, 4));
    }
  }
  facing([0, 0.25, 1].map((v) => v / Math.hypot(0, 0.25, 1)), [p[0] + lean * len, p[1] - len * 0.78, p[2] + len * 0.16],
         () => blob(s, len * 0.03, 0.003, len * 0.08, 0, 0, 0, col, 0, 4));   // (its tip)
}
