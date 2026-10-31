// Decor starters (../decor.js): The flower shop and the trees (their helpers are in shapes.js).
import {
  COLOURS, FLAME, WAX, GLASS, shape, vert, lit, made, quad, box,
  cyl, rod, ball, blob, bloom, facing, bunch, BULB, WIRE, hoop,
  cloth, STEM, DARK_LEAF, PALM, RED, CORAL, YELLOW, MAGENTA, ORCHID, PINK,
  RATTAN, PAMPAS, LINEN, grounded, rng, tipped, daisy, calla, orchid, cloud,
  plume, pompom, leaf, frond, sprig, tropical, woven, at, bulb, florets,
} from "./shapes.js";

export const GARDEN = {
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
      at(0, 0.1, 0, () => tropical(s, 0.3, 0.3, 0.22, col, 47));
      return s;
    },
  },
  hanging_greenery: {
    group: "aerial", height: 2.9, hangs: true, on: "floor", colour: "gold", size: { w: 2.2, d: 1.6 }, block: false,
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
    group: "aerial", height: 2.9, hangs: true, on: "floor", colour: "white", size: { r: 0.52 }, block: false,
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
    group: "aerial", height: 2.9, hangs: true, on: "floor", colour: "rattan", size: { r: 0.38 }, block: false,
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
    group: "aerial", height: 3.0, hangs: true, on: "floor", colour: "white", size: { w: 4, d: 4 }, block: false,
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
};
