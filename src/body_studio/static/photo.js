// Take a photo of a room (darkroom.js): the view as it is now, path traced, so the light does what
// light does: the sun's shadows soft at the edges, light from the sky through the doors and
// windows, bounced off the walls and floor into the corners, shine on brass and through glass.
// Slow (a minute or two on a Mac's GPU) but only once per photo; walking round costs the same.
// Free of three.js, so it can be tested on its own (tests/js/photo.test.mjs). Design: docs/photo.md.

export const PHOTO = {
  long: 1600,           // px: the photo's long side (its shape is the window's)
  passes: 400,          // samples per pixel: past that the grain is hard to see
  bounces: 6,           // light bounced this many times (a room lit from its doors needs a few)
  exposure: 0.8,
  // the light: the sky's colours are the venue's sky dome's (decor/home.js), the ground a warm
  // stone; the sun warm, from where the decor's sun is (decorate.js), a little brighter than the sky
  zenith: [0.2, 0.42, 0.8], ground: [0.42, 0.39, 0.35],
  sky: 1.0, sun: 1.8, sunColour: [1, 0.945, 0.87],
  glow: [1, 0.84, 0.62], glowPower: 6,   // bulbs and flames give a warm light
};

// The photo's size in pixels, the window's shape with its long side PHOTO.long (even numbers)
export function photoSize(w, h, long = PHOTO.long) {
  if (!(w > 0 && h > 0)) return [long, Math.round(long * 0.625 / 2) * 2];
  const k = long / Math.max(w, h), even = (v) => Math.max(2, Math.round((v * k) / 2) * 2);
  return [even(w), even(h)];
}

// What goes into the photo: the room's meshes and what was put in it, as they are shown; not the
// body's splats (yet), the clothes on it, the decor's handles, the soft shadow cards under things
// (the path tracer makes the real ones) or the sky dome (the photo's sky is its light, below).
// `o` describes an object: {mesh, visible (it and all above it), inRoom (under a part marked room),
// shades (under the shadow cards), handle (drawn over everything), splat, item (the decor's id)}
export function keep(o) {
  return !!(o.mesh && o.visible && o.inRoom && !o.shades && !o.handle && !o.splat && o.item !== "sky_dome");
}

// How a decor finish (decor/shapes.js FINISHES) is made in the photo: its shine, metal, and glass
// as clear glass (light through it, tinted by its colour) rather than see-through paint
export function finishLook(f) {
  if (f.glow) return { kind: "glow", emissive: PHOTO.glow, power: PHOTO.glowPower };
  if (f.clear) return { kind: "glass", roughness: 0.02, metalness: 0, transmission: 1, ior: 1.5 };
  return { kind: "solid", roughness: f.rough, metalness: f.metal };
}

// how far the photo is (0..1) and what it says
export function progress(samples, passes = PHOTO.passes) {
  const p = Math.max(0, Math.min(1, samples / passes));
  return { done: p >= 1, part: p, percent: Math.floor(p * 100) };
}

// The sun's way in the world: the decor's sun is at `local` in the decor group, whose matrix (a
// column-major 4x4, as three.js keeps it) turns it round with the room; the way is from the room
// toward the sun, of length 1
export function sunWay(local, m) {
  const [x, y, z] = local;
  const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  const n = Math.hypot(...v) || 1;
  return v.map((c) => c / n);
}

// the file a photo is saved as: the room's name and when, e.g. "venue-2026-10-30-0945.png"
export function photoName(room, when = new Date()) {
  const base = String(room || "room").replace(/^_sample_/, "").replace(/\.[^.]*$/, "").replace(/[^\w-]+/g, "-") || "room";
  const p = (n) => String(n).padStart(2, "0");
  return `${base}-${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}.png`;
}

// ---------------------------------------------------------------- a photo of one piece
// The piece picked in Decorate on its own, as a product shot: on a plain floor, lit by the same sky
// and sun, framed to fill the photo. Far quicker than the room: a few thousand triangles to build
// the light's search tree over instead of millions (the venue's minute and a half to set up becomes
// a second or two), most rays leave the piece and end on the backdrop at once, the photo is smaller,
// and with no walls to bounce off it needs fewer bounces and passes.
export const PIECE = {
  long: 1024,           // px (the image model works at 768 for a piece: photoreal.py)
  passes: 160,          // the light settles sooner with nothing round it
  bounces: 3,
  margin: 1.2,          // the piece fills the photo with a little room round it
  floor: [0.78, 0.75, 0.7],          // a warm pale floor, matte (its shadow shows the light)
  backdrop: [0.93, 0.92, 0.9],       // what is behind it: a pale studio grey
  hangs: 1.5,           // m: a piece this far above the room's floor hangs, and its floor is the room's
};

// Where the camera goes for a piece whose bounding sphere is (centre, radius): on the line from
// the piece toward where the camera is now (the same side, the same height of view), as far as
// fits it in the photo both ways. `fov` is the camera's vertical one in degrees, `aspect` w / h.
export function frameOn(eye, centre, radius, fov, aspect = 1, margin = PIECE.margin) {
  let d = [eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]];
  let n = Math.hypot(...d);
  if (!(n > 1e-6)) { d = [0, 0.3, 1]; n = Math.hypot(...d); }       // (from the front, a little above)
  const half = (fov * Math.PI) / 360, across = Math.atan(Math.tan(half) * Math.min(1, aspect));
  const far = (Math.max(radius, 0.05) * margin) / Math.sin(across);
  return d.map((c, i) => centre[i] + (c / n) * far);
}

// The floor a piece stands on in its photo: its own lowest point, or the room's floor for a piece
// that hangs well above it (a cloud of flowers, an overhead canopy), so its shadow lands there
export function groundAt(lowest, roomFloor = 0, hangs = PIECE.hangs) {
  return lowest - roomFloor > hangs ? roomFloor : lowest;
}

// the file a piece's photo is saved as, e.g. "venue-custom-arch-2026-10-31-1205.png"
export function pieceName(room, item, when = new Date()) {
  const what = String(item || "piece").replace(/[^\w-]+/g, "-").replace(/_/g, "-");
  return photoName(room, when).replace(/(-\d{4}-\d\d-\d\d-\d{4}\.png)$/, `-${what}$1`);
}
