// Baked light (bakelight.js): the light a drawn room's surfaces get, worked out once by following
// rays the way Take a photo does (the sun's shadows, soft at their edges; the sky's light, darker
// under roofs and in corners and indoors; the light the floor and walls throw back) and kept on
// every corner of the walls, floors, fittings and decor, so walking round shows it at no cost.
// Worked out only when asked (Bake the light, by Take a photo). Free of three.js, so it can be tested on its
// own (tests/js/bake.test.mjs). Design: docs/photo.md ("Baked light").

export const BAKE = {
  passes: 96,           // rays per corner: each pass one toward the sun, one round about, one more from where that lands
  width: 2048,          // the corners' texture is this wide (one texel per corner, per side for walls)
  band: 32,             // a pass is drawn in this many bands of rows, one a frame, so walking stays smooth
  // the light, as how many times its own colour a surface shows: the sun at noon on a floor facing
  // it, the open sky (blue overhead, paler at the horizon, the ground below), and a little light
  // everywhere for the lamps a room has indoors
  sun: 1.0, sunColour: [1, 0.95, 0.88], cone: 0.035,   // (the sun's disc: about 2°, for soft edges)
  zenith: [0.64, 0.69, 0.78], horizon: [0.82, 0.83, 0.82], ground: [0.32, 0.3, 0.27],
  ambient: 0.16, bounce: 1.0,
  lamps: 0.35,          // how much of the live view's own lamps is kept, for the shape of round things
  scale: 2.5,           // a value is kept as value / scale in a byte (0..2.5 times its colour)
};

// the texture for n corners: BAKE.width wide (or less, for a few), as many rows as it takes
export function layout(n, width = BAKE.width) {
  const w = Math.max(1, Math.min(width, n));
  return { width: w, height: Math.max(1, Math.ceil(n / w)) };
}

// the rows of band k of a pass (k from 0), [from, to)
export function band(k, height, bands = BAKE.band) {
  const step = Math.ceil(height / bands);
  return [Math.min(height, k * step), Math.min(height, (k + 1) * step)];
}

// how far the bake is, 0..100 (shown by the room's views while it works): pass `pass`, band k
export function progress(pass, k, passes = BAKE.passes, bands = BAKE.band) {
  return Math.min(100, Math.floor(100 * (pass * bands + k) / Math.max(1, passes * bands)));
}

// light (r, g, b: times the colour; a: how much of the sky is seen, 0..1) to bytes
export function pack(src, from, count, scale = BAKE.scale) {
  const out = new Uint8Array(4 * count);
  for (let i = 0; i < 4 * count; i++) {
    const v = src[4 * from + i] / ((i & 3) === 3 ? 1 : scale);
    out[i] = Math.round(255 * Math.max(0, Math.min(1, v)));
  }
  return out;
}

// what a mesh's light is kept under: its shape and where it stands (to a tenth of a millimetre),
// so a thing drawn again where it was gets its light back at once
export function keyOf(shape, matrix) {
  return shape + "@" + Array.from(matrix, (v) => Math.round(v * 1e4)).join(",");
}

// the sky's light from way d (length 1), up being `up`: as in the shader (bakelight.js)
export function skyLight(d, up, B = BAKE) {
  const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  if (y <= 0) return B.ground.slice();
  const t = Math.pow(y, 0.6);
  return B.horizon.map((h, i) => h + (B.zenith[i] - h) * t);
}
