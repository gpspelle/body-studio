// Decor starters (../decor.js): The wedding catalogue (its helpers are in shapes.js).
import {
  COLOURS, LEAF, FLAME, WAX, GLASS, shape, vert, lit, made, quad,
  box, soft, cyl, rod, ball, bloom, bunch, SILVER, CHAMPAGNE, BULB,
  WIRE, CAKE, BOTTLES, other, glassAt, hoop, cloth, at, shade, canopy,
} from "./shapes.js";

export const WEDDING = {
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
    knobs: { glass: { colour: true, palette: "glass", value: "#dbe6e6", part: "glasses" }, glasses: { min: 1, max: 3, value: 2, part: "glasses" },
             napkin: { colour: true, palette: "cloth", value: "#f0e6cf", part: "table" } },
    make(col, k = { glass: GLASS, glasses: 2, napkin: COLOURS.ivory }) {
      // for the guest sitting at +z: the charger (in its colour) and plate, the napkin, the fork to
      // the left, the knife and the glasses to the right (water, wine, a flute), in the glass's colour
      const s = shape();
      cyl(s, 0.16, 0.16, 0.006, 0, 0, 0.04, col, 40);
      cyl(s, 0.12, 0.135, 0.016, 0, 0.006, 0.04, COLOURS.white, 40);
      box(s, 0.13, 0.025, 0.07, 0, 0.022, 0.04, k.napkin);
      box(s, 0.02, 0.004, 0.19, -0.2, 0, 0.04, SILVER);
      box(s, 0.016, 0.004, 0.21, 0.2, 0, 0.04, SILVER);
      made("glass", () => {
        tinted(s, 0.17, -0.14, k.glass, "goblet");
        if (k.glasses > 1) tinted(s, 0.06, -0.17, k.glass, "wine");
        if (k.glasses > 2) tinted(s, -0.05, -0.17, k.glass, "flute");
      });
      return s;
    },
  },
  centrepiece: {
    group: "table", height: 0.245, on: "top", colour: "blush", size: { r: 0.3 }, block: false,
    knobs: { bunches: { min: 6, max: 24, value: 14 } },
    make(col, kn = { bunches: 14 }) {
      // a low ring of flowers and greenery round three candles
      const s = shape(), n = kn.bunches;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI;
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
    knobs: { vases: { min: 1, max: 9, value: 3 } },
    make(col, k = { vases: 3 }) {
      // bud vases in a loose cluster (more of them spiral out from the first three)
      const s = shape(), at = [[-0.07, 0.02, 0.12], [0.02, -0.04, 0.16], [0.08, 0.04, 0.1]];
      for (let j = 3; j < k.vases; j++) { const a = j * 2.4, r = 0.05 + 0.025 * j; at.push([r * Math.sin(a), r * Math.cos(a), [0.13, 0.09, 0.15][j % 3]]); }
      for (const [x, z, h] of at.slice(0, k.vases)) {
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
    knobs: { tiers: { min: 1, max: 5, value: 3 } },
    make(col, k = { tiers: 3 }) {
      // tiers of 13 cm, each smaller than the one under it, on a silver stand (as tall as three
      // tiers: more of them are each a little lower)
      const s = shape(), icing = col === COLOURS.white ? CAKE : col, n = k.tiers, th = 0.39 / Math.max(3, n);
      cyl(s, 0.12, 0.05, 0.02, 0, 0, 0, SILVER, 24); rod(s, [0, 0.02, 0], [0, 0.1, 0], 0.03, SILVER, 12);
      cyl(s, 0.24, 0.24, 0.015, 0, 0.1, 0, SILVER, 40);
      let y = 0.115;
      for (let j = 0; j < n; j++) { const r = 0.19 - (0.09 * j) / Math.max(2, n - 1); cyl(s, r, r, th, 0, y, 0, icing, 40); y += th; }
      bunch(s, 10, 0.06, 0.02, y + 0.03, 0.02, COLOURS.blush, 14);
      if (n > 1) bunch(s, 6, 0.05, 0.12, 0.115 + th * 1.2, 0.1, COLOURS.blush, 15);
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
    built: ["w", "d", "h"], knobs: { slab: { min: 0.02, max: 0.12, value: 0.05, step: 0.01, size: true } },
    make(col, k = { w: 2.4, d: 0.62, h: 1.1, slab: 0.05 }) {
      // the counter: a front panel with its slats, the top (slab thick, over it all round), a foot
      // rail for the guests (at +z); drawn to its size, so the slats and the rail's posts keep theirs
      const s = shape(), w = k.w - 0.1, d = k.d - 0.02, t = k.slab, h = k.h - t;
      box(s, w, h, d - 0.08, 0, 0, -0.04, col);
      const n = Math.max(2, Math.round(w / 0.2));
      for (let j = 0; j <= n; j++) box(s, 0.02, h * 0.85, 0.01, (j / n - 0.5) * (w - 0.1), h * 0.07, d / 2 - 0.035, other(col, COLOURS.wood, COLOURS.ivory));
      box(s, k.w, t, k.d, 0, h, 0, COLOURS.white);
      rod(s, [-w / 2 + 0.05, 0.18, d / 2 + 0.06], [w / 2 - 0.05, 0.18, d / 2 + 0.06], 0.02, COLOURS.gold, 10);
      const posts = Math.max(2, Math.round(w / 1.1));
      for (let j = 0; j <= posts; j++) { const x = (j / posts - 0.5) * (w - 0.3); rod(s, [x, 0.18, d / 2 + 0.06], [x, 0.18, d / 2 - 0.04], 0.012, COLOURS.gold, 6); }
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
};

// a glass in a colour at (x, 0, z): a water goblet, a wine glass or a champagne flute
function tinted(s, x, z, col, kind) {
  cyl(s, 0.03, 0.03, 0.004, x, 0, z, col, 12);
  const stem = kind === "flute" ? 0.06 : kind === "goblet" ? 0.07 : 0.1;
  rod(s, [x, 0, z], [x, stem, z], 0.004, col, 5);
  if (kind === "flute") cyl(s, 0.012, 0.026, 0.13, x, stem, z, col, 14);
  else if (kind === "goblet") cyl(s, 0.02, 0.045, 0.09, x, stem, z, col, 16);
  else cyl(s, 0.015, 0.038, 0.09, x, stem, z, col, 14);
}
