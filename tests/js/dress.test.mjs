// Wardrobe maths (src/body_studio/static/dress.js): an item's splats and the body's splats under it.
// Run by tests/unit/test_dress_js.py:  node --test tests/js/dress.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { SkinCover, itemSplats, itemWeights, fitSkin, fitNormals, hatOverHair, skinUnder } from "../../src/body_studio/static/dress.js";
import { cavities, textureAt, texturePyramid } from "../../src/body_studio/static/dress.js";

const frame = { origin: [0, 0, 0], left: [1, 0, 0], up: [0, 1, 0], front: [0, 0, 1] };
const b64 = (a) => Buffer.from(a.buffer).toString("base64");

// a 10 cm square at z = 0.1 (in front of the body's axis), two triangles, wound to face -z
function square(uvs) {
  return {
    verts: new Float32Array([0, 0, 0.1, 0.1, 0, 0.1, 0.1, 0.1, 0.1, 0, 0.1, 0.1]),
    tris: new Int32Array([0, 2, 1, 0, 3, 2]), tuv: new Int32Array([0, 2, 1, 0, 3, 2]),
    uv: new Float32Array(uvs ?? [0, 0, 1, 0, 1, 1, 0, 1]), alpha: false,
  };
}
// 2×2 texture: bottom row red, top row see-through blue
const tex = { width: 2, height: 2, data: new Uint8ClampedArray([0, 0, 255, 0, 0, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255]) };

test("about one splat per spacing squared, on the surface, facing out", () => {
  const s = itemSplats(square(), tex, 0.005, frame);
  assert.ok(Math.abs(s.n - 400) <= 2, `${s.n} splats`);
  for (let i = 0; i < s.n; i++) {
    const [x, y, z] = s.centres.slice(i * 3, i * 3 + 3);
    assert.ok(x >= -1e-6 && x <= 0.1 + 1e-6 && y >= -1e-6 && y <= 0.1 + 1e-6 && Math.abs(z - 0.1) < 1e-6);
    // the disc's normal (its local z) points away from the body's axis: +z here
    const [qx, qy, qz, qw] = s.quats.slice(i * 4, i * 4 + 4);
    const nz = 1 - 2 * (qx * qx + qy * qy);
    assert.ok(nz > 0.99, `normal z ${nz}`);
  }
  assert.ok(s.scale[2] < s.scale[0] / 5, "flat");
});

test("coloured from the texture; see-through parts of hair get no splats", () => {
  const s = itemSplats(square(), tex, 0.005, frame);
  let red = 0, blue = 0;
  for (let i = 0; i < s.n; i++) {
    const y = s.centres[i * 3 + 1], [r, , b] = s.colours.slice(i * 3, i * 3 + 3);
    if (y < 0.05) { assert.ok(r > 0.6 && b < 0.01, "bottom is red"); red++; }
    else { assert.ok(b > 0.6 && r < 0.01, "top is blue"); blue++; }
  }
  assert.ok(red > 150 && blue > 150);
  const hair = itemSplats({ ...square(), alpha: true }, tex, 0.005, frame);
  for (let i = 0; i < hair.n; i++) assert.ok(hair.centres[i * 3 + 1] < 0.05 + 0.003, "only the opaque half");
  assert.ok(hair.n > 150 && hair.n < 250);
});

test("the body's splats under an item", () => {
  const skin = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const centres = new Float32Array([0.01, 0, 0, 0.98, 0.02, 0, 0, 1.02, 0, 5, 5, 5]);
  const c = new SkinCover(skin, centres, 0.05);
  assert.deepEqual([...c.nearest], [0, 1, 2, -1]);
  assert.deepEqual(c.covered([]), []);
  assert.deepEqual(c.covered([new Int32Array([1, 99])]), [1]);        // (vertices past the skin are not skin)
  assert.deepEqual(c.covered([new Int32Array([0]), new Int32Array([2])]), [0, 2]);
});

test("the fitted skin in the PLY's coordinates", () => {
  const fit = { n_body: 2, verts: b64(new Float32Array([1, 2, 3, 0, 0, 0, 9, 9, 9])),
    normals: b64(new Float32Array([0, 0, 1, 1, 0, 0])),
    frame: { origin: [10, 20, 30], left: [0, 1, 0], up: [0, 0, -1], front: [1, 0, 0] } };
  assert.deepEqual([...fitSkin(fit)], [13, 21, 28, 10, 20, 30]);
  assert.deepEqual([...fitNormals(fit)], [1, 0, 0, 0, 1, 0]);       // turned, not moved
});

test("the skin an item hangs over, and only that", () => {
  // skin: a row of points along x at z = 0, facing +z; a skirt: a square from x 0 to 0.1, 3 cm out
  const skin = new Float32Array([0.02, 0.05, 0, 0.08, 0.05, 0, 0.15, 0.05, 0, 0.05, 0.05, 0.2]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const skirt = { ...square(), verts: new Float32Array([0, 0, 0.03, 0.1, 0, 0.03, 0.1, 0.1, 0.03, 0, 0.1, 0.03]) };
  assert.deepEqual([...skinUnder(skirt, skin, normals, 0.05)], [0, 1]);   // not past its edge, nor outside it
  assert.deepEqual([...skinUnder(skirt, skin, normals, 0.02)], []);       // too far out to cover
  // tight: the item just under the scan's skin still covers it
  const tight = { ...square(), verts: new Float32Array([0, 0, -0.005, 0.1, 0, -0.005, 0.1, 0.1, -0.005, 0, 0.1, -0.005]) };
  assert.deepEqual([...skinUnder(tight, skin, normals, 0.05)], [0, 1]);
});

test("each splat knows the point of the skin it hangs from", () => {
  const item = { ...square(), anchors: new Float32Array([0, 0, 0.09, 0.1, 0, 0.09, 0.1, 0.1, 0.09, 0, 0.1, 0.09]) };
  const s = itemSplats(item, tex, 0.005, frame);
  for (let i = 0; i < s.n; i++) {
    assert.ok(Math.abs(s.anchors[i * 3] - s.centres[i * 3]) < 1e-6 && Math.abs(s.anchors[i * 3 + 1] - s.centres[i * 3 + 1]) < 1e-6);
    assert.ok(Math.abs(s.anchors[i * 3 + 2] - 0.09) < 1e-6);
  }
});

test("an item's weights blend across the cloth instead of jumping where the skin's bone changes", () => {
  // a strip of 11 vertices along x, the skin left of x = 0.05 on bone 0 and right of it on bone 1
  const xs = Array.from({ length: 11 }, (_, i) => i * 0.01), verts = [], tris = [];
  for (const x of xs) verts.push(x, 0, 0.1, x, 0.01, 0.1);
  for (let i = 0; i < 10; i++) { const a = i * 2; tris.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const item = { anchors: new Float32Array(verts), tris: new Int32Array(tris) };
  const n = 100, s = { n, tri: new Int32Array(n), bary: new Float32Array(n * 2) };
  for (let i = 0; i < n; i++) { s.tri[i] = 2 * Math.floor(i / 10); s.bary[i * 2] = (i % 10) / 10; }
  const at = (x, y, z, bones, weights) => { bones.fill(0); weights.fill(0); bones[0] = x < 0.05 ? 0 : 1; weights[0] = 255; };
  const share = (r, i) => { let w = 0; for (let m = 0; m < 4; m++) if (r.bones[i * 4 + m] === 1) w += r.weights[i * 4 + m]; return w; };
  const hard = itemWeights(item, s, at, 3, 0), soft = itemWeights(item, s, at, 3);
  for (const r of [hard, soft]) for (let i = 0; i < n; i++) {
    let sum = 0; for (let m = 0; m < 4; m++) sum += r.weights[i * 4 + m];
    assert.equal(sum, 255);
  }
  // without smoothing the whole change happens within one triangle; smoothed it spreads over several
  const jump = (r) => Math.max(...Array.from({ length: n - 10 }, (_, i) => Math.abs(share(r, i + 10) - share(r, i))));
  assert.ok(jump(soft) < jump(hard) * 0.6, `${jump(soft)} vs ${jump(hard)}`);
  assert.equal(share(soft, 0), 0);                  // far from the change the skin's own bone
  assert.equal(share(soft, n - 1), 255);
});

test("an inner layer of an item under an outer one gets no splats", () => {
  // two squares, 1 cm apart, hanging from the same skin: the inner one is under the outer one
  const sq = square(), outer = new Float32Array(sq.verts);
  for (let i = 0; i < 4; i++) outer[i * 3 + 2] = 0.11;
  const item = { ...sq, verts: new Float32Array([...sq.verts, ...outer]), anchors: new Float32Array([...sq.verts, ...sq.verts]),
                 tris: new Int32Array([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]), tuv: new Int32Array([0, 2, 1, 0, 3, 2, 0, 2, 1, 0, 3, 2]) };
  const s = itemSplats(item, tex, 0.005, frame);
  assert.ok(s.under > 350, `${s.under} hidden`);
  for (let i = 0; i < s.n; i++) assert.ok(Math.abs(s.centres[i * 3 + 2] - 0.11) < 1e-6);
  // apart (hanging from skin 10 cm away, like a sleeve beside the chest) both layers are kept
  const apart = { ...item, anchors: new Float32Array([...sq.verts, ...sq.verts.map((v, i) => (i % 3 === 0 ? v + 0.1 : v))]) };
  assert.equal(itemSplats(apart, tex, 0.005, frame).under, 0);
});

test("a hat is enlarged just enough to go over the hair", () => {
  // a hat: a cube's top and sides, 10 cm wide, its brim (bottom) open at y = 0
  const P = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]];
  const verts = new Float32Array(P.flat().map((v) => v * 0.05));
  const quads = [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const hat = { verts, tris: new Int32Array(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])) };
  const up = { ...frame, up: [0, 1, 0] };
  assert.equal(hatOverHair(hat, new Float32Array(0), up, 0.005).scale, 1);
  // hair inside the hat leaves it as it is; hair 1.5 cm above its top raises it to hold it
  const inside = new Float32Array(Array.from({ length: 300 }, (_, i) => [0.02 * Math.cos(i), 0.03, 0.02 * Math.sin(i)]).flat());
  assert.equal(hatOverHair(hat, inside, up, 0.005).scale, 1);
  const tall = new Float32Array(Array.from({ length: 300 }, (_, i) => [0.01 * Math.cos(i), 0.065, 0.01 * Math.sin(i)]).flat());
  const { item, scale } = hatOverHair(hat, tall, up, 0.005);
  assert.ok(Math.abs(scale - 0.07 / 0.05) < 0.01, `scale ${scale}`);
  for (let i = 0; i < 8; i++) assert.ok(item.verts[i * 3 + 1] >= -1e-6, "the brim stays where it was");
});

test("a splat takes the texture averaged over what it covers", () => {
  // a 1-texel checkerboard: one texel is black or white, a patch of them is grey
  const W = 64, data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) data.set([(x + y) % 2 ? 255 : 0, 0, 0, 255], (y * W + x) * 4);
  const tex = { width: W, height: W, data };
  assert.ok([0, 255].includes(textureAt(tex, 0.3, 0.3, 1)[0]));
  const grey = textureAt(tex, 0.3, 0.3, 8)[0];
  assert.ok(Math.abs(grey - 128) < 3, `grey from far (${grey})`);
  assert.equal(texturePyramid(tex).at(-1).w, 1);
  assert.equal(textureAt(tex, 1.3, -0.7, 8)[3], 255, "wraps");
});

test("folds are valleys, the outside of a tube isn't", () => {
  // a tube along z (convex outside), normals outward: no fold anywhere
  const V = [], T = [], N = [], ring = 16, rows = 6;
  for (let j = 0; j < rows; j++) for (let i = 0; i < ring; i++) {
    const a = (2 * Math.PI * i) / ring;
    V.push(Math.cos(a), Math.sin(a), j * 0.4); N.push(Math.cos(a), Math.sin(a), 0);
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < ring; i++) {
    const a = j * ring + i, b = j * ring + ((i + 1) % ring), c = a + ring, d = b + ring;
    T.push(a, b, c, b, d, c);
  }
  const tube = cavities(Float32Array.from(V), Int32Array.from(T), Float32Array.from(N));
  assert.ok(Math.max(...tube) <= 0, "convex: never darker");
  // the same normals turned inward (the inside of the tube, a valley)
  const inside = cavities(Float32Array.from(V), Int32Array.from(T), Float32Array.from(N.map((x) => -x)));
  assert.ok(Math.min(...inside) > 0.05, "concave: darker");
});
