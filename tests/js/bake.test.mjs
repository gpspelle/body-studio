// Baked light's numbers (src/body_studio/static/bake.js). Run by tests/unit/test_bake_js.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BAKE, band, keyOf, layout, pack, progress, skyLight } from "../../src/body_studio/static/bake.js";

test("one texel per corner: as wide as allowed, as many rows as it takes", () => {
  assert.deepEqual(layout(10, 2048), { width: 10, height: 1 });
  assert.deepEqual(layout(5000, 2048), { width: 2048, height: 3 });
  assert.deepEqual(layout(0), { width: 1, height: 1 });
  const L = layout(1e6);
  assert.ok(L.width * L.height >= 1e6 && L.width * (L.height - 1) < 1e6);
});

test("the bands of a pass cover every row once", () => {
  for (const h of [1, 7, 8, 9, 1000]) {
    const seen = new Array(h).fill(0);
    for (let k = 0; k < BAKE.band; k++) { const [a, b] = band(k, h); for (let y = a; y < b; y++) seen[y]++; }
    assert.ok(seen.every((n) => n === 1), `height ${h}`);
  }
});

test("light kept as bytes: colour over the scale, sky seen as it is, clamped", () => {
  const src = new Float32Array([1, 2, 0.5, 0.25, 9, -1, 0, 1]);
  const b = pack(src, 0, 2, 2);
  assert.deepEqual(Array.from(b), [128, 255, 64, 64, 255, 0, 0, 255]);
  assert.deepEqual(Array.from(pack(src, 1, 1, 2)), [255, 0, 0, 255]);
});

test("a thing drawn again where it was keeps its key; moved a millimetre, it doesn't", () => {
  const M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0, -1.25, 1];
  assert.equal(keyOf("g1", M), keyOf("g1", M.slice()));
  const moved = M.slice(); moved[12] += 0.001;
  assert.notEqual(keyOf("g1", M), keyOf("g1", moved));
  assert.notEqual(keyOf("g1", M), keyOf("g2", M));
});

test("the sky is bluer overhead, paler at the horizon, the ground darker", () => {
  const up = [0, 1, 0];
  const top = skyLight([0, 1, 0], up), side = skyLight([1, 0.01, 0], up), below = skyLight([0, -1, 0], up);
  assert.deepEqual(top, BAKE.zenith);
  assert.ok(top[2] - top[0] > side[2] - side[0], "bluer overhead");
  assert.deepEqual(below, BAKE.ground);
  assert.ok(below.every((v, i) => v < side[i]));
});

test("a sunny floor shows brighter than a shaded one, and neither past what a byte keeps", () => {
  const sky = skyLight([0, 1, 0], [0, 1, 0]);
  const sunny = BAKE.ambient + BAKE.sun + Math.max(...sky), shaded = BAKE.ambient + Math.max(...sky) * 0.6;
  assert.ok(sunny / shaded > 1.5);
  assert.ok(sunny <= BAKE.scale);
});

test("how far it is: 0 at the start, 100 once the last band of the last pass is drawn, never back", () => {
  assert.equal(progress(0, 0, 4, 8), 0);
  assert.equal(progress(2, 0, 4, 8), 50);
  assert.equal(progress(3, 8, 4, 8), 100);
  let last = -1;
  for (let p = 0; p < 4; p++) for (let k = 1; k <= 8; k++) { const n = progress(p, k, 4, 8); assert.ok(n >= last); last = n; }
});
