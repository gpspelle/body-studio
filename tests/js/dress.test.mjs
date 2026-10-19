// Wardrobe maths (src/body_studio/static/dress.js): an item's splats and the body's splats under it.
// Run by tests/unit/test_dress_js.py:  node --test tests/js/dress.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { SkinCover, itemSplats, fitSkin, fitNormals, skinUnder } from "../../src/body_studio/static/dress.js";

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

test("points of the skin under what is worn", () => {
  const skin = new Float32Array([0, 0, 0, 1, 0, 0]);
  const c = new SkinCover(skin, new Float32Array([0, 0, 0]), 0.1);
  assert.deepEqual([...c.under(new Float32Array([0.01, 0, 0, 0.99, 0, 0, 3, 3, 3]))], [0, 0, 0]);
  c.covered([new Int32Array([1])]);
  assert.deepEqual([...c.under(new Float32Array([0.01, 0, 0, 0.99, 0, 0, 3, 3, 3]))], [0, 1, 0]);
});
