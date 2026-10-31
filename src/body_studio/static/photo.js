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

// A mesh drawn with a material per group (the decor: its linen, wood, brass, glass and bulbs in
// one mesh; the shell: a material per finish) as one piece per material: the path tracer (0.0.24)
// gives a whole mesh one material, picked by the mesh's place in its list, so a multi-material
// mesh came out all glass, all metal or all glowing at random. Each piece: its material's number,
// the corners it uses (`verts`, the geometry's own numbers) and its triangles in those (`index`).
// `index` the geometry's (null: unindexed), `groups` its {start, count, materialIndex}, `count`
// its corners.
export function byMaterial(index, groups, count) {
  const tri = index ? (k) => index[k] : (k) => k, total = index ? index.length : count;
  const spans = groups && groups.length ? groups : [{ start: 0, count: total, materialIndex: 0 }];
  const per = new Map();
  for (const g of spans) {
    const end = Math.min(total, g.start + g.count);
    if (!(end > g.start)) continue;
    if (!per.has(g.materialIndex)) per.set(g.materialIndex, []);
    per.get(g.materialIndex).push([g.start, end]);
  }
  const out = [], seen = new Int32Array(count).fill(-1);
  for (const [material, list] of per) {
    let n = 0;
    for (const [a, b] of list) n += b - a;
    const ix = new Uint32Array(n), verts = [];
    let at = 0;
    for (const [a, b] of list)
      for (let k = a; k < b; k++) {
        const v = tri(k);
        if (seen[v] < 0) { seen[v] = verts.length; verts.push(v); }
        ix[at++] = seen[v];
      }
    for (const v of verts) seen[v] = -1;
    out.push({ material, verts: Uint32Array.from(verts), index: ix });
  }
  return out;
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
  margin: 1.05,         // the piece fills the photo with a little room round it (its sphere is loose)
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

// ---------------------------------------------------------------- the sky and the sea
// Outdoors, what the live view draws in faint splats (the far beach, the sea, the island across
// the channel) can't be path traced, and a plain gradient made a flat grey sky. So the photo has a
// sky of its own (deep blue overhead, pale haze down at the horizon, a glow round the sun, a few
// soft clouds) and draws the shore, the sea and the island as surfaces, where the room's map says
// they are (its fixtures' `sea`: {at, facing, beach, distance}).
export const SKY = {
  zenith: [0.13, 0.3, 0.68], haze: [0.62, 0.72, 0.82], below: [0.36, 0.38, 0.38],
  glow: [1.0, 0.86, 0.66],             // round the sun
  clouds: 0.42,                        // how much of the sky the clouds cover (0..1)
  cloud: [1.0, 0.99, 0.97], cloudShade: [0.62, 0.66, 0.72],
};
export const SHORE = {
  sand: [0.86, 0.79, 0.66], wet: [0.5, 0.45, 0.36], foam: [0.9, 0.92, 0.9],
  sea: [0.035, 0.13, 0.15], seaFar: [0.05, 0.16, 0.2],   // deep green-blue near, bluer far off
  island: [0.22, 0.32, 0.26], islandHaze: [0.56, 0.64, 0.72],
  wide: 600,                           // m along the shore each way
  horizon: 4000,                       // m out to where the sea stops (past the horizon's haze)
  level: -0.25,                        // m: the water under the sand's level
};

// smooth noise in 2D, -1..1, the same everywhere for a seed (no tiles needed: worked out per point)
function hash(i, j, seed) {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 - 1;
}
export function noise(x, y, seed = 1) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, seed, n = 5) {
  let s = 0, w = 0.5, f = 1;
  for (let k = 0; k < n; k++) { s += w * noise(x * f, y * f, seed + k); w *= 0.5; f *= 2.03; }
  return s;
}

// The sky's light coming from way `d` (unit, y up), the sun toward `sun` (unit): [r, g, b]
export function skyColour(d, sun = [0.4, 0.8, 0.45]) {
  const [x, y, z] = d, mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  if (y < 0) return mix(SKY.haze, SKY.below, Math.min(1, -y * 6)).map((v) => v * 0.9);
  // the blue deepening up from the haze at the horizon
  let c = mix(SKY.haze, SKY.zenith, Math.pow(y, 0.45));
  // a warm glow round the sun, wide and faint, then close and bright
  const cs = Math.max(0, x * sun[0] + y * sun[1] + z * sun[2]);
  c = c.map((v, i) => v + SKY.glow[i] * (0.25 * Math.pow(cs, 8) + 0.8 * Math.pow(cs, 400)));
  // the clouds: on a layer high up, seen through at a slant (thinner, flatter toward the horizon)
  if (y > 0.03 && SKY.clouds > 0) {
    const k = 1 / (y + 0.08), u = x * k * 0.5, v = z * k * 0.5;
    const n = fbm(u, v, 7) + 0.35 * fbm(u * 3.1, v * 3.1, 11, 3);
    const t = Math.max(0, Math.min(1, (n - (0.42 - SKY.clouds * 0.9)) * 2.2)) * Math.min(1, (y - 0.03) * 8);
    if (t > 0) {
      const lit = 0.55 + 0.45 * (0.5 + 0.5 * cs);  // (brighter on the sun's side of the sky)
      const cloud = mix(SKY.cloudShade, SKY.cloud, lit).map((q) => q * (0.85 + 0.5 * Math.pow(cs, 6)));
      c = mix(c, cloud, t);
    }
  }
  return c;
}

// The shore, the sea and the island as surfaces, from the room's `sea` ({at: the middle of where
// the garden meets the beach, facing: the way out to sea, beach: how deep the dry sand is,
// distance: how far the island across the channel is}), in the room's own metres. Each piece:
// {name, position (x y z a corner), uv (metres), colour (r g b a corner), index}.
export function seascape(sea) {
  const at = sea.at, f = [sea.facing[0], 0, sea.facing[2]], n = Math.hypot(f[0], f[2]) || 1;
  const out = [f[0] / n, 0, f[2] / n], side = [out[2], 0, -out[0]];
  const beach = sea.beach ?? 8, far = sea.distance ?? 130, W = SHORE.wide, L = SHORE.level;
  // (u along the shore, v out to sea, y up)
  const pt = (u, v, y) => [at[0] + side[0] * u + out[0] * v, at[1] + y, at[2] + side[2] * u + out[2] * v];
  const piece = (name) => ({ name, position: [], uv: [], colour: [], index: [] });
  const grid = (p, nu, nv, f) => {
    const first = p.position.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const { u, v, y, c } = f(i / nu, j / nv);
      p.position.push(...pt(u, v, y)); p.uv.push(u, v); p.colour.push(...c);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = first + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      p.index.push(a, c, b, b, c, d);
    }
    return p;
  };
  const wet = beach + 3;
  // the dry sand on along the shore (under the room's own where they meet), sloping a little
  const sand = grid(piece("sand"), 60, 4, (s, t) => ({ u: -W + 2 * W * s, v: t * beach, y: -0.03 - 0.02 * t, c: SHORE.sand }));
  // the wet sand down to the water, darker, its edge where the waves come up wavy
  const edge = (u) => wet + 0.6 * Math.sin(u * 0.31) + 0.4 * Math.sin(u * 0.83 + 1.3);
  const wetSand = grid(piece("wet"), 600, 4, (s, t) => {
    const u = -W + 2 * W * s, v = beach + (edge(u) - beach) * t;
    return { u, v, y: -0.05 + (L + 0.01 + 0.05) * t, c: SHORE.wet.map((q, i) => SHORE.sand[i] + (q - SHORE.sand[i]) * Math.min(1, t * 1.4)) };
  });
  // the foam: bands of broken white on the water near the shore
  const foam = piece("foam");
  for (const [v0, w, seed] of [[0, 0.7, 3], [2.2, 0.35, 5], [4.8, 0.25, 9]])
    grid(foam, 600, 1, (s, t) => {
      const u = -W + 2 * W * s, v = edge(u) - 0.2 + v0 + w * t * (0.4 + 0.6 * Math.abs(noise(u * 0.4, v0, seed)));
      return { u, v, y: L + 0.006, c: SHORE.foam };
    });
  // the sea, out past the horizon (bluer as it goes)
  const water = grid(piece("sea"), 8, 8, (s, t) => {
    const v = edge(0) - 0.5 + Math.pow(t, 3) * SHORE.horizon, k = Math.min(1, v / 400);
    return { u: (-1 + 2 * s) * SHORE.horizon, v, y: L, c: SHORE.sea.map((q, i) => q + (SHORE.seaFar[i] - q) * k) };
  });
  // the island across the channel: a ridge, its peaks 15 to 30 m up, green under the haze
  const top = (u) => 15 + 8 * Math.sin(u * 0.021 + 1) + 5 * Math.sin(u * 0.067) + 3 * Math.sin(u * 0.17 + 2) + 1.2 * noise(u * 0.4, 0, 13);
  const island = grid(piece("island"), 400, 6, (s, t) => {
    const u = -380 + 760 * s, h = top(u) * Math.max(0, 1 - Math.pow(Math.abs(u) / 380, 6)), y = L + h * Math.sin(t * Math.PI / 2);
    const k = 0.62 + 0.3 * (1 - t);              // (in the haze across the channel, most at its foot)
    return { u, v: far + 10 + 30 * (1 - t) - 0.5 * h * t, y, c: SHORE.island.map((q, i) => q + (SHORE.islandHaze[i] - q) * k) };
  });
  return [sand, wetSand, foam, water, island];
}

// The sea's ripples as a normal map that tiles (r g b a a pixel, `size` a side): swells from out at
// sea and smaller chop across them, so the water breaks the sky's reflection into glints
export function waveNormals(size = 256, strength = 1) {
  const h = new Float32Array(size * size), out = new Uint8Array(4 * size * size), T = 2 * Math.PI;
  const waves = [[0, 3, 0.5], [1, 5, 0.3], [-2, 7, 0.22], [4, 9, 0.12], [-5, 13, 0.08], [7, -11, 0.06], [11, 17, 0.04]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let s = 0;
    for (const [a, b, w] of waves) s += w * Math.sin(T * (a * u + b * v) + 3 * w * Math.sin(T * (b * u - a * v)));
    h[y * size + x] = s;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (i, j) => h[((j + size) % size) * size + ((i + size) % size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const n = Math.hypot(dx, dy, 1), i = 4 * (y * size + x);
    out[i] = 127.5 - 127.5 * dx / n; out[i + 1] = 127.5 - 127.5 * dy / n; out[i + 2] = 127.5 + 127.5 / n; out[i + 3] = 255;
  }
  return out;
}
