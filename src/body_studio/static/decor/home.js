// Decor starters (../decor.js): a home and a tattoo studio. The sample living room and the sample
// tattoo studio (sample_room.py, sample_studio.py) have their furniture drawn by these, as the
// decor is (their fixtures), in place of the boxes of splats they were; each is also in the panel's
// Home tab, to furnish a room of your own. Sizes are the rooms' own.
import {
  COLOURS, LEAF, shape, vert, quad, lit, made, box, soft, cyl, rod, ball, blob, facing, leaf, hoop, rng, BULB, WIRE,
} from "./shapes.js";

const WALNUT = [0.36, 0.24, 0.16], OAK = [0.62, 0.46, 0.3], INK = [0.08, 0.08, 0.09], CHROME = [0.72, 0.73, 0.75];
const VINYL = [0.1, 0.1, 0.11], OCHRE = [0.8, 0.6, 0.25], TEAL = [0.2, 0.45, 0.47], SHADE_LINEN = [0.96, 0.92, 0.82];
const SOIL = [0.2, 0.15, 0.11], FIG = [0.2, 0.38, 0.17];
// the spines of the books, muted as a real shelf's are
const SPINES = [[0.55, 0.18, 0.15], [0.16, 0.27, 0.4], [0.85, 0.8, 0.68], [0.26, 0.4, 0.3], [0.78, 0.6, 0.3],
                [0.2, 0.2, 0.22], [0.62, 0.5, 0.42], [0.4, 0.22, 0.3], [0.9, 0.88, 0.84]];

// a leg from the floor up h, w x d at its foot to tw x td at its top, its faces flat (each its own
// corners)
function taper(s, w, d, tw, td, h, cx, cy, cz, col) {
  const c = [];
  for (const [y, a, b] of [[0, w / 2, d / 2], [h, tw / 2, td / 2]])
    for (const [x, z] of [[-a, -b], [a, -b], [a, b], [-a, b]]) c.push([cx + x, cy + y, cz + z]);
  const face = (q) => quad(s, ...q.map((p) => vert(s, p[0], p[1], p[2], col)));
  for (let k = 0; k < 4; k++) face([c[k], c[4 + k], c[4 + (k + 1) % 4], c[(k + 1) % 4]]);
  face([c[0], c[1], c[2], c[3]]);
  face([c[4], c[7], c[6], c[5]]);
}

export const HOME = {
  // ------------------------------------------------ the living room
  linen_sofa: {
    group: "home", height: 0.85, on: "floor", colour: "blue", size: { w: 2.2, d: 0.85 }, block: true,
    seats: [{ x: -0.47, y: 0.45, z: 0.08, back: true }, { x: 0.47, y: 0.45, z: 0.08, back: true }],
    make(col) {
      // a long linen sofa on dark tapered feet: a deep base, two seat cushions and two loose back
      // cushions, rounded arms, and a velvet cushion in each corner (ochre and teal)
      const s = shape(), pale = col.map((v) => Math.min(1, v * 1.12));
      made("wood", () => { for (const x of [-1.02, 1.02]) for (const z of [-0.36, 0.36]) taper(s, 0.03, 0.03, 0.045, 0.045, 0.07, x, 0, z, WALNUT); });
      made("cloth", () => {
        soft(s, 2.2, 0.22, 0.85, 0, 0.07, 0, col, 0.05);
        for (const x of [-0.475, 0.475]) soft(s, 0.93, 0.17, 0.62, x, 0.28, 0.11, pale, 0.06);
        soft(s, 2.2, 0.36, 0.2, 0, 0.27, -0.325, col, 0.07);
        for (const x of [-0.475, 0.475]) facing([0, 0.97, -0.24], [x, 0.44, -0.16], () => soft(s, 0.92, 0.42, 0.16, 0, 0, 0, pale, 0.07));
        for (const x of [-1.025, 1.025]) soft(s, 0.17, 0.42, 0.85, x, 0.27, 0, col, 0.07);
      });
      made("satin", () => {
        facing([0.25, 0.94, -0.2], [-0.72, 0.46, -0.04], () => soft(s, 0.38, 0.38, 0.1, 0, 0, 0, OCHRE, 0.045));
        facing([-0.25, 0.94, -0.2], [0.72, 0.46, -0.04], () => soft(s, 0.38, 0.38, 0.1, 0, 0, 0, TEAL, 0.045));
      });
      return s;
    },
  },
  bookshelf: {
    group: "home", height: 2.0, on: "floor", colour: "wood", size: { w: 1.2, d: 0.32 }, block: true,
    make(col) {
      // a walnut bookcase: sides, a back, six shelves; books standing on five of them, a few
      // leaning, a white vase and a small stack lying flat
      const s = shape(), rnd = rng(23);
      made("wood", () => {
        for (const x of [-0.585, 0.585]) box(s, 0.03, 2.0, 0.32, x, 0, 0, col);
        box(s, 1.14, 1.97, 0.015, 0, 0.02, -0.15, col.map((v) => v * 0.8));
        for (const y of [0.0, 0.4, 0.8, 1.2, 1.6, 1.97]) box(s, 1.14, 0.03, 0.3, 0, y, 0.005, col);
      });
      for (const y of [0.03, 0.43, 0.83, 1.23, 1.63]) {
        let x = -0.56;
        const stop = 0.56 - (y > 1 ? 0.22 : 0.05);
        while (x < stop) {
          const w = 0.02 + 0.03 * rnd(), h = 0.2 + 0.13 * rnd(), d = 0.15 + 0.08 * rnd(), c = SPINES[Math.floor(rnd() * SPINES.length)];
          if (x + w > stop) break;
          if (rnd() < 0.06) { x += 0.04; continue; }                 // a gap
          box(s, w, h, d, x + w / 2, y, 0.14 - d / 2, c);
          x += w + 0.003;
        }
        if (y > 1) {
          // what stands at the end of the upper shelves: a white vase, then a stack lying flat
          if (y > 1.4) made("satin", () => { cyl(s, 0.045, 0.06, 0.16, 0.45, y, 0.02, COLOURS.white, 18); cyl(s, 0.06, 0.035, 0.08, 0.45, y + 0.16, 0.02, COLOURS.white, 18); });
          else for (let k = 0; k < 4; k++) box(s, 0.2 - 0.01 * k, 0.03, 0.15, 0.44, y + 0.03 * k, 0.03, SPINES[(k * 3 + 1) % SPINES.length]);
        }
      }
      return s;
    },
  },
  tv_console: {
    group: "home", height: 1.72, on: "floor", colour: "wood", size: { w: 2.0, d: 0.42 }, block: true, top: 0.76,
    make(col) {
      // a low walnut console on black feet, fluted doors; a slim black television on a stand on it
      const s = shape();
      made("metal", () => { for (const x of [-0.9, 0.9]) for (const z of [-0.15, 0.15]) taper(s, 0.02, 0.02, 0.035, 0.035, 0.1, x, 0, z, INK); });
      made("wood", () => {
        box(s, 2.0, 0.66, 0.4, 0, 0.1, 0, col);
        // the fronts: vertical flutes, a dark gap between the four doors
        for (let k = 0; k < 4; k++) for (let j = 0; j < 12; j++)
          box(s, 0.032, 0.58, 0.012, -0.94 + k * 0.48 + 0.02 + j * 0.037, 0.14, 0.205, col.map((v) => v * (j % 2 ? 0.92 : 1.05)));
      });
      made("metal", () => { for (const x of [-0.48, 0, 0.48]) box(s, 0.006, 0.6, 0.004, x, 0.13, 0.212, COLOURS.gold); });
      made("satin", () => {
        box(s, 0.28, 0.012, 0.18, 0, 0.76, -0.1, INK);
        box(s, 0.05, 0.14, 0.03, 0, 0.77, -0.12, INK);
        box(s, 1.44, 0.82, 0.035, 0, 0.9, -0.12, INK);
      });
      // the screen, off: a deep glossy black just in front of the bezel
      made("glass", () => box(s, 1.41, 0.79, 0.004, 0, 0.915, -0.1, [0.02, 0.025, 0.03]));
      return s;
    },
  },
  dining_table: {
    group: "home", height: 0.76, on: "floor", colour: "wood", size: { w: 1.0, d: 0.9 }, block: true, top: 0.76,
    make(col) {
      // a solid oak table: a thick top with softened edges on four tapered legs and a rail under it
      const s = shape();
      made("wood", () => {
        soft(s, 1.0, 0.04, 0.9, 0, 0.72, 0, col, 0.008, 3);
        for (const x of [-0.45, 0.45]) for (const z of [-0.4, 0.4]) taper(s, 0.035, 0.035, 0.05, 0.05, 0.72, x, 0, z, col);
        box(s, 0.86, 0.08, 0.02, 0, 0.64, -0.39, col); box(s, 0.86, 0.08, 0.02, 0, 0.64, 0.39, col);
        box(s, 0.02, 0.08, 0.76, -0.44, 0.64, 0, col); box(s, 0.02, 0.08, 0.76, 0.44, 0.64, 0, col);
      });
      return s;
    },
  },
  oak_bench: {
    group: "home", height: 0.44, on: "floor", colour: "wood", size: { w: 0.8, d: 0.3 }, block: true,
    seats: [{ x: -0.2, y: 0.44, z: 0 }, { x: 0.2, y: 0.44, z: 0 }],
    make(col) {
      // a plain oak bench on four tapered legs, a rail between each pair, to tuck under the table
      const s = shape();
      made("wood", () => {
        soft(s, 0.8, 0.04, 0.3, 0, 0.4, 0, col, 0.008, 3);
        for (const x of [-0.33, 0.33]) for (const z of [-0.1, 0.1]) taper(s, 0.028, 0.028, 0.04, 0.04, 0.4, x, 0, z, col);
        for (const x of [-0.33, 0.33]) box(s, 0.025, 0.04, 0.17, x, 0.12, 0, col);
      });
      return s;
    },
  },
  side_table: {
    group: "home", height: 0.79, on: "floor", colour: "wood", size: { w: 0.4, d: 0.4 }, block: true, top: 0.71,
    make(col) {
      // a small walnut side table on slender legs, a shelf under it, a book and a cup on it
      const s = shape();
      made("wood", () => {
        soft(s, 0.4, 0.03, 0.4, 0, 0.68, 0, col, 0.006, 3);
        for (const x of [-0.17, 0.17]) for (const z of [-0.17, 0.17]) taper(s, 0.02, 0.02, 0.03, 0.03, 0.68, x, 0, z, col);
        box(s, 0.34, 0.015, 0.34, 0, 0.22, 0, col);
      });
      box(s, 0.2, 0.03, 0.14, -0.04, 0.71, 0.02, SPINES[1]);
      made("satin", () => cyl(s, 0.035, 0.04, 0.08, 0.1, 0.71, -0.08, COLOURS.white, 18));
      return s;
    },
  },
  floor_lamp: {
    group: "home", height: 1.7, on: "floor", colour: "black", size: { r: 0.22 }, block: true,
    make(col) {
      // a black floor lamp: a heavy round foot, a slim stem, a linen drum shade lit from inside
      const s = shape();
      made("metal", () => {
        cyl(s, 0.16, 0.15, 0.025, 0, 0, 0, col, 32);
        rod(s, [0, 0.02, 0], [0, 1.45, 0], 0.011, col, 10);
        for (let k = 0; k < 3; k++) { const a = k * 2.094; rod(s, [0, 1.45, 0], [0.2 * Math.sin(a), 1.47, 0.2 * Math.cos(a)], 0.004, col, 4); }
      });
      // the shade, open at both ends, glowing faintly through; the bulb inside it
      made("cloth", () => { cyl(s, 0.22, 0.17, 0.3, 0, 1.4, 0, SHADE_LINEN, 40); });
      lit(() => blob(s, 0.04, 0.05, 0.04, 0, 1.52, 0, BULB, 0, 10));
      return s;
    },
  },
  potted_fig: {
    group: "home", height: 1.4, on: "floor", colour: "coral", size: { r: 0.32 }, block: true,
    make(col) {
      // a fiddle-leaf fig in a glazed pot: a slim trunk, big glossy leaves turning round it all the
      // way up, darker toward the inside
      const s = shape(), rnd = rng(31);
      made("satin", () => {
        cyl(s, 0.15, 0.19, 0.36, 0, 0, 0, col, 32);
        cyl(s, 0.2, 0.2, 0.03, 0, 0.35, 0, col.map((v) => v * 0.92), 32);
      });
      cyl(s, 0.18, 0.18, 0.005, 0, 0.36, 0, SOIL, 24);
      made("wood", () => { rod(s, [0, 0.36, 0], [0.02, 0.9, 0.01], 0.018, [0.4, 0.32, 0.24], 8); rod(s, [0.02, 0.9, 0.01], [-0.01, 1.25, 0], 0.012, [0.4, 0.32, 0.24], 8); });
      made("satin", () => {
        for (let k = 0; k < 34; k++) {
          const y = 0.5 + 0.82 * (k / 33), a = k * 2.4 + rnd() * 0.5, len = 0.26 - 0.08 * (k / 33) + rnd() * 0.05;
          const up = 0.2 + 0.55 * rnd(), d = [Math.sin(a) * Math.cos(up), Math.sin(up), Math.cos(a) * Math.cos(up)];
          const c = (k % 3 ? FIG : LEAF).map((v) => v * (0.75 + 0.35 * rnd()));
          figLeaf(s, [0.02 * Math.sin(a), y, 0.02 * Math.cos(a)], d, len, c);
        }
      });
      return s;
    },
  },
  ceiling_light: {
    group: "home", height: 2.6, hangs: true, on: "floor", colour: "white", size: { r: 0.26 }, block: false,
    make(col) {
      // a flush round ceiling light, a white rim round its glowing opal face (its top against a
      // ceiling 2.6 m up; raised or lowered with the ceiling)
      const s = shape();
      made("satin", () => cyl(s, 0.26, 0.26, 0.02, 0, 2.58, 0, col, 40));
      lit(() => cyl(s, 0.235, 0.235, 0.004, 0, 2.577, 0, [1.0, 0.97, 0.9], 40));
      return s;
    },
  },

  // ------------------------------------------------ the tattoo studio
  tattoo_bed: {
    group: "home", height: 0.68, on: "floor", colour: "black", size: { w: 1.9, d: 0.7 }, block: true, top: 0.68,
    make(col) {
      // a tattoo bed: a padded vinyl top in two sections (a short one at the head, -x), on a black
      // frame, a chrome column and a broad chrome foot
      const s = shape();
      made("satin", () => {
        soft(s, 0.48, 0.08, 0.7, -0.71, 0.6, 0, VINYL, 0.03);
        soft(s, 1.41, 0.08, 0.7, 0.245, 0.6, 0, VINYL, 0.03);
      });
      made("metal", () => {
        box(s, 1.8, 0.04, 0.6, 0, 0.56, 0, col);
        cyl(s, 0.07, 0.07, 0.52, -0.05, 0.04, 0, CHROME, 28);
        soft(s, 0.7, 0.04, 0.5, -0.05, 0, 0, CHROME, 0.015, 3);
      });
      return s;
    },
  },
  tattoo_chair: {
    group: "home", height: 1.38, on: "floor", colour: "black", size: { w: 0.7, d: 0.9 }, block: true,
    seat: { y: 0.5, z: 0.07, back: true },
    make(col) {
      // a reclining tattoo chair: a padded seat, a back leaning 25 degrees with a head rest, an arm
      // rest each side on a chrome post, all on a chrome column and a round foot
      const s = shape(), lean = 25 * Math.PI / 180, up = [0, Math.cos(lean), -Math.sin(lean)];
      made("satin", () => {
        soft(s, 0.42, 0.1, 0.5, 0, 0.4, 0, VINYL, 0.04);
        facing(up, [0, 0.45, -0.22], () => soft(s, 0.42, 0.8, 0.08, 0, 0, 0, VINYL, 0.035));
        facing(up, [0, 0.45 + 0.88 * up[1], -0.22 + 0.88 * up[2] + 0.02], () => soft(s, 0.28, 0.14, 0.1, 0, 0, 0, VINYL, 0.04));
        for (const x of [-0.27, 0.27]) soft(s, 0.12, 0.05, 0.6, x, 0.77, -0.05, VINYL, 0.02);
      });
      made("metal", () => {
        for (const x of [-0.27, 0.27]) { rod(s, [x, 0.02, -0.25], [x, 0.77, -0.25], 0.018, CHROME, 12); rod(s, [x, 0.6, -0.25], [x * 0.7, 0.42, -0.2], 0.012, CHROME, 8); }
        cyl(s, 0.06, 0.06, 0.36, 0, 0.04, 0, CHROME, 24);
        cyl(s, 0.26, 0.25, 0.04, 0, 0, 0, CHROME, 40);
        box(s, 0.4, 0.03, 0.46, 0, 0.37, 0, col);
      });
      return s;
    },
  },
  artist_stool: {
    group: "home", height: 0.55, on: "floor", colour: "black", size: { r: 0.25 }, block: true, seat: { y: 0.55, z: 0 },
    make(col) {
      // the artist's stool: a round padded seat on a gas lift, a five-armed foot on casters and a
      // foot ring
      const s = shape();
      made("satin", () => { cyl(s, 0.19, 0.2, 0.06, 0, 0.48, 0, VINYL, 36); cyl(s, 0.2, 0.18, 0.012, 0, 0.54, 0, VINYL, 36); });
      made("metal", () => {
        cyl(s, 0.025, 0.025, 0.42, 0, 0.06, 0, CHROME, 16);
        cyl(s, 0.04, 0.04, 0.06, 0, 0.42, 0, col, 16);
        hoopFlat(s, 0.17, 0.24, 0.008, CHROME);
        for (let k = 0; k < 5; k++) {
          const a = k * 2 * Math.PI / 5, x = 0.24 * Math.sin(a), z = 0.24 * Math.cos(a);
          rod(s, [0, 0.07, 0], [x, 0.04, z], 0.014, CHROME, 8);
          ball(s, 0.022, x, 0.022, z, col, 10);
        }
      });
      return s;
    },
  },
  ink_trolley: {
    group: "home", height: 0.94, on: "floor", colour: "white", size: { w: 0.5, d: 0.35 }, block: true, top: 0.9,
    make() {
      // the artist's steel trolley: two trays on four legs, ink caps in a row and a machine on top
      const s = shape();
      made("metal", () => {
        for (const y of [0.88, 0.3]) { box(s, 0.5, 0.02, 0.35, 0, y, 0, CHROME); for (const [w, d, x, z] of [[0.5, 0.004, 0, -0.173], [0.5, 0.004, 0, 0.173], [0.004, 0.35, -0.248, 0], [0.004, 0.35, 0.248, 0]]) box(s, w, 0.03, d, x, y, z, CHROME); }
        for (const x of [-0.23, 0.23]) for (const z of [-0.155, 0.155]) { rod(s, [x, 0.03, z], [x, 0.88, z], 0.012, CHROME, 8); ball(s, 0.025, x, 0.025, z, INK, 8); }
      });
      made("satin", () => {
        [[0.08, 0.08, 0.1], [0.75, 0.12, 0.12], [0.12, 0.35, 0.7], [0.15, 0.55, 0.25], [0.92, 0.75, 0.15]].forEach((c, k) => {
          cyl(s, 0.016, 0.018, 0.025, -0.18 + 0.065 * k, 0.9, -0.1, c, 14);
          made("glass", () => cyl(s, 0.018, 0.018, 0.04, -0.18 + 0.065 * k, 0.9, 0.0, [0.9, 0.92, 0.92], 14));
        });
        box(s, 0.16, 0.035, 0.05, 0.08, 0.9, 0.08, INK);
        rod(s, [0.02, 0.92, 0.08], [-0.08, 0.92, 0.1], 0.012, [0.2, 0.2, 0.22], 10);
      });
      return s;
    },
  },
  reception_counter: {
    group: "home", height: 1.25, on: "floor", colour: "wood", size: { w: 1.25, d: 0.55 }, block: true, top: 1.04,
    make(col) {
      // a reception counter: a fluted wooden front, a black top with a small overhang, a plant and a
      // card stand on it
      const s = shape();
      made("wood", () => {
        box(s, 1.25, 1.0, 0.55, 0, 0, 0, col.map((v) => v * 0.92));
        for (let j = 0; j < 30; j++) cyl(s, 0.018, 0.018, 0.92, -0.6 + j * 0.0414, 0.04, 0.27, col.map((v) => v * (j % 2 ? 0.95 : 1.06)), 8);
      });
      made("satin", () => {
        soft(s, 1.29, 0.04, 0.59, 0, 1.0, 0, INK, 0.008, 3);
        box(s, 1.25, 0.04, 0.55, 0, 0, 0, INK);
        cyl(s, 0.05, 0.06, 0.1, 0.45, 1.04, -0.1, COLOURS.white, 16);
      });
      made("satin", () => { for (let k = 0; k < 7; k++) { const a = k * 0.9; leaf(s, [0.45, 1.14, -0.1], [0.5 * Math.sin(a), 0.85, 0.5 * Math.cos(a)], 0.14, 0.35, FIG); } });
      box(s, 0.12, 0.08, 0.04, -0.35, 1.04, 0.1, COLOURS.white);
      return s;
    },
  },
  waiting_bench: {
    group: "home", height: 0.46, on: "floor", colour: "wood", size: { w: 1.2, d: 0.45 }, block: true,
    seats: [{ x: -0.3, y: 0.46, z: 0 }, { x: 0.3, y: 0.46, z: 0 }],
    make(col) {
      // a slatted wooden bench on black steel legs
      const s = shape();
      made("wood", () => { for (let k = 0; k < 5; k++) soft(s, 1.2, 0.035, 0.08, 0, 0.425, -0.18 + k * 0.09, col.map((v) => v * (k % 2 ? 0.95 : 1.04)), 0.008, 3); });
      made("metal", () => { for (const x of [-0.5, 0.5]) { box(s, 0.04, 0.42, 0.04, x, 0, -0.18, INK); box(s, 0.04, 0.42, 0.04, x, 0, 0.18, INK); box(s, 0.04, 0.03, 0.4, x, 0.39, 0, INK); } });
      return s;
    },
  },
  ring_light: {
    group: "home", height: 2.7, hangs: true, on: "floor", colour: "black", size: { r: 0.4 }, block: false,
    make(col) {
      // a ring light hung over a bed on a cable from a 2.7 m ceiling: a black ring with a glowing
      // face under it
      const s = shape();
      made("metal", () => {
        rod(s, [0, 2.16, 0], [0, 2.7, 0], 0.004, WIRE, 4);
        for (let k = 0; k < 3; k++) { const a = k * 2.094; rod(s, [0, 2.3, 0], [0.38 * Math.sin(a), 2.16, 0.38 * Math.cos(a)], 0.002, WIRE, 3); }
        hoopFlat(s, 2.15, 0.38, 0.022, col);
      });
      lit(() => hoopFlat(s, 2.128, 0.38, 0.012, [1.0, 0.99, 0.95]));
      return s;
    },
  },

  // ------------------------------------------------ the wedding venue's fittings (sample_venue.py)
  skirting_board: {
    group: "home", height: 0.12, on: "floor", colour: "wood", size: { w: 2.0, d: 0.02 }, block: false, built: ["w"],
    make(col, k = { w: 2.0 }) {
      // a wooden skirting board along a wall (its back on the wall, at z = 0), 12 cm high, a
      // rounded bead along its top
      const s = shape();
      made("wood", () => {
        box(s, k.w, 0.11, 0.016, 0, 0, 0.008, col);
        rod(s, [-k.w / 2, 0.11, 0.009], [k.w / 2, 0.11, 0.009], 0.009, col, 8);
      });
      return s;
    },
  },
  floor_spot: {
    group: "lights", height: 0.133, on: "floor", colour: "black", size: { r: 0.035 }, block: false,
    make(col) {
      // a small spotlight on a stake in the floor, turned up at the wall behind it (-z): a black
      // can, its warm lit face
      const s = shape(), aim = [0, 0.82, -0.57], c = [0, 0.08, 0.01];
      made("satin", () => { rod(s, [0, 0, 0.01], [0, 0.06, 0.01], 0.008, col, 8); box(s, 0.06, 0.012, 0.03, 0, 0.055, 0.01, col); });
      facing(aim, c, () => {
        made("satin", () => cyl(s, 0.035, 0.035, 0.08, 0, -0.04, 0, col, 20));
        lit(() => cyl(s, 0.028, 0.028, 0.004, 0, 0.04, 0, BULB, 20));
      });
      return s;
    },
  },
  track_light: {
    group: "lights", height: 0.24, hangs: true, on: "floor", colour: "black", size: { w: 2.5, d: 0.1 }, block: false, built: ["w"],
    make(col, k = { w: 2.5 }) {
      // a track light under a ceiling (its top at 0.24; hung, lift it to the ceiling): a round
      // socket at its -x end, a black rail, spots on short stems, close together near the socket
      // and lit toward it, the rest lit the other way, a white rim round each lit face
      const s = shape(), x0 = -k.w / 2, top = 0.24;
      made("satin", () => {
        cyl(s, 0.07, 0.07, 0.07, x0, top - 0.07, 0, col, 24);
        box(s, k.w, 0.04, 0.05, 0, top - 0.04, 0, col);
      });
      for (let x = x0 + 0.35; x < k.w / 2; ) {
        const near = x < x0 + 1.6, dir = near ? -1 : 1;
        made("satin", () => rod(s, [x, top - 0.04, 0], [x, top - 0.12, 0], 0.01, col, 6));
        facing([dir * 0.94, -0.34, 0], [x, top - 0.13, 0], () => {
          made("satin", () => cyl(s, 0.045, 0.045, 0.14, 0, -0.07, 0, col, 18));
          made("satin", () => cyl(s, 0.047, 0.047, 0.006, 0, 0.068, 0, COLOURS.white, 18));
          lit(() => cyl(s, 0.036, 0.036, 0.004, 0, 0.072, 0, BULB, 18));
        });
        x += near ? 0.4 : 0.9;
      }
      return s;
    },
  },
  exit_sign: {
    group: "home", height: 0.14, hangs: true, on: "floor", colour: "green", size: { w: 0.32, d: 0.03 }, block: false,
    make(col) {
      // a lit exit sign on a wall (its back at z = 0; hung, lift it to its height): a green box,
      // a white running figure and arrow on its face
      const s = shape(), W = [0.97, 0.97, 0.95], z = 0.031;
      made("satin", () => box(s, 0.32, 0.13, 0.03, 0, 0.005, 0.015, col));
      lit(() => {
        box(s, 0.02, 0.02, 0.003, -0.05, 0.1, z, W);                         // (its head)
        rod(s, [-0.055, 0.09, z], [-0.065, 0.055, z], 0.006, W, 4);           // (body, legs and arms)
        rod(s, [-0.065, 0.055, z], [-0.04, 0.025, z], 0.005, W, 4);
        rod(s, [-0.065, 0.055, z], [-0.09, 0.03, z], 0.005, W, 4);
        rod(s, [-0.06, 0.08, z], [-0.035, 0.07, z], 0.004, W, 4);
        rod(s, [-0.06, 0.08, z], [-0.085, 0.085, z], 0.004, W, 4);
        rod(s, [0.02, 0.06, z], [0.1, 0.06, z], 0.006, W, 4);                 // (the arrow)
        rod(s, [0.1, 0.06, z], [0.08, 0.08, z], 0.005, W, 4);
        rod(s, [0.1, 0.06, z], [0.08, 0.04, z], 0.005, W, 4);
      });
      return s;
    },
  },
  wall_speaker: {
    group: "home", height: 0.23, hangs: true, on: "floor", colour: "black", size: { w: 0.14, d: 0.16 }, block: false,
    make(col) {
      // a small black speaker on a wall bracket (its back at z = 0; hung, lift it), its grille
      // a shade lighter
      const s = shape();
      made("satin", () => {
        box(s, 0.05, 0.08, 0.04, 0, 0.08, 0.02, col);
        soft(s, 0.13, 0.22, 0.12, 0, 0.01, 0.1, col, 0.012);
      });
      made("cloth", () => box(s, 0.11, 0.19, 0.004, 0, 0.025, 0.161, col.map((v) => v + 0.06)));
      return s;
    },
  },
  sheer_curtain: {
    group: "home", height: 3.25, on: "floor", colour: "ivory", size: { w: 0.6, d: 0.1 }, block: false,
    make(col) {
      // a sheer curtain on a short black rod, gathered and tied back a metre up: full under the
      // rod, pinched at the tie, flaring a little to the floor, falling in soft folds
      const s = shape(), top = 3.25, tie = 1.0, N = 40, M = 16;
      const half = (y) => (y > tie ? 0.04 + 0.2 * ((y - tie) / (top - 0.05 - tie)) ** 0.8 : 0.04 + 0.08 * (tie - y) / tie);
      made("cloth", () => {
        const rows = [];
        for (let j = 0; j <= N; j++) {
          const y = ((top - 0.05) * j) / N, w = half(y);
          rows.push(Array.from({ length: M + 1 }, (_, i) => {
            const u = i / M, fold = Math.sin(u * Math.PI * 6);
            const shade = 0.9 + 0.1 * fold;
            return vert(s, -w + 2 * w * u, y, 0.012 + 0.25 * w * fold, col.map((v) => Math.min(1, v * shade)));
          }));
        }
        for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) quad(s, rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
        cyl(s, 0.055, 0.055, 0.05, 0, tie - 0.025, 0.012, col.map((v) => v * 0.85), 18);   // (its tie)
      });
      made("metal", () => rod(s, [-0.3, top - 0.03, 0.012], [0.3, top - 0.03, 0.012], 0.012, INK, 8));
      return s;
    },
  },
};

// a fiddle-leaf fig's leaf from p toward d (unit), len long: a short stalk, then a broad leaf,
// widest toward its tip, cupped a little along a paler midrib
function figLeaf(s, p, d, len, col) {
  const q = [p[0] + d[0] * 0.03, p[1] + d[1] * 0.03, p[2] + d[2] * 0.03], a = Math.atan2(d[0], d[2]);
  rod(s, p, q, 0.004, col, 4);
  const n = 7, w = (t) => len * 0.36 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.6 + 0.4 * t), droop = 0.25 * len;
  const along = (t) => [q[0] + Math.sin(a) * len * t * 0.9, q[1] + d[1] * len * t - droop * t * t, q[2] + Math.cos(a) * len * t * 0.9];
  const side = [Math.cos(a), 0, -Math.sin(a)], rows = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, c = along(t), half = w(t);
    rows.push([-1, -0.5, 0, 0.5, 1].map((u) => vert(s, c[0] + side[0] * half * u, c[1] + 0.012 * len * 10 * (u * u) * 0.25, c[2] + side[2] * half * u,
                                                      u === 0 ? col.map((v) => Math.min(1, v * 1.35)) : col)));
  }
  for (let k = 0; k < n; k++) for (let j = 0; j < 4; j++) quad(s, rows[k][j], rows[k][j + 1], rows[k + 1][j + 1], rows[k + 1][j]);
}
// a ring lying flat at height y, radius R, its tube r thick
function hoopFlat(s, y, R, r, col) { facing([0, 0, 1], [0, y, 0], () => hoop(s, R, 0, 0, 0, r, col, 0, 2 * Math.PI, 48)); }
