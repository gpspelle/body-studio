// The shop around the body (src/body_studio/static/racks.js): where everything stands, and each item
// hung, folded, paired or on a mannequin head. Run by tests/unit/test_racks_js.py, which writes every
// item as it is made (GET /api/wardrobe/<id>/shape) to the folder in SHAPES.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HANGER_DROP, MH_HEIGHT, SHOP, bounds, fold, hang, onHead, pair, shopLayout } from "../../src/body_studio/static/racks.js";

const DIR = process.env.SHAPES;
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name + ".json")));
const f32 = (s) => { const b = Buffer.from(s, "base64"); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
const i32 = (s) => { const b = Buffer.from(s, "base64"); return new Int32Array(b.buffer, b.byteOffset, b.length / 4); };
const catalog = DIR ? read("catalog") : [];
const head = DIR ? f32(read("mannequin").verts) : null;
const items = Object.fromEntries(catalog.map((c) => { const d = read(c.id); return [c.id, { ...d, verts: f32(d.verts), tris: i32(d.tris) }]; }));
const SHAPE = { hang, fold, shoes: pair };
const shaped = (id, kind) => (SHAPE[kind] ? SHAPE[kind](items[id].verts) : onHead(items[id].verts, head));
const size = (b) => b.hi.map((h, k) => h - b.lo[k]);

// each edge of the item's triangles, as long now as at first (a ratio per edge)
function stretch(before, after, tris) {
  const r = [];
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = tris[t + k], b = tris[t + (k + 1) % 3];
    const l0 = Math.hypot(before[a * 3] - before[b * 3], before[a * 3 + 1] - before[b * 3 + 1], before[a * 3 + 2] - before[b * 3 + 2]) / MH_HEIGHT;
    const l1 = Math.hypot(after[a * 3] - after[b * 3], after[a * 3 + 1] - after[b * 3 + 1], after[a * 3 + 2] - after[b * 3 + 2]);
    if (l0 > 1e-6) r.push(l1 / l0);
  }
  return r.sort((x, y) => x - y);
}
const q = (a, f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];

test("the catalogue came along", { skip: !DIR }, () => {
  assert.equal(catalog.length, 46);
});

test("on a hanger: arms down by the sides, legs together, the shoulders just under the hook", { skip: !DIR }, () => {
  for (const c of catalog.filter((c) => c.slot === "outfit")) {
    const V = items[c.id].verts, H = hang(V), b = bounds(H), was = size(bounds(V));
    assert.ok(Math.abs(b.hi[1] + HANGER_DROP) < 1e-4, `${c.id}: top ${b.hi[1]}`);
    assert.ok(size(b)[0] < 0.31, `${c.id}: ${size(b)[0].toFixed(3)} wide`);           // the base mesh's A pose: up to 0.57
    assert.ok(Math.abs(size(b)[1] - was[1] / MH_HEIGHT) < 0.06, `${c.id}: as long as it was`);
    assert.ok(Math.abs(b.lo[0] + b.hi[0]) < 0.02, `${c.id}: centred on the hook`);
    // turned, not torn: the cloth's edges keep about their length (a loose jacket's armpit gives most)
    const s = stretch(V, H, items[c.id].tris);
    assert.ok(q(s, 0.99) < 1.6 && q(s, 0.01) > 0.45 && q(s, 0.5) > 0.9 && q(s, 0.5) < 1.1, `${c.id}: edges ${q(s, 0.01).toFixed(2)}–${q(s, 0.99).toFixed(2)}`);
  }
});

test("folded: a flat stack about a shirt's size, the front of the chest on top", { skip: !DIR }, () => {
  for (const c of catalog.filter((c) => c.display === "fold")) {
    const V = items[c.id].verts, F = fold(V), b = bounds(F), [w, h, d] = size(b);
    assert.ok(Math.abs(b.lo[1]) < 1e-6, c.id);
    assert.ok(w < 0.22 && d < 0.2 && w > 0.15 && d > 0.12, `${c.id}: ${w.toFixed(3)} × ${d.toFixed(3)}`);
    assert.ok(h < 0.1, `${c.id}: ${h.toFixed(3)} high`);
    // the top of the stack is the chest's front: high on the body, in front
    let top = 0;
    for (let i = 1; i < F.length; i += 3) if (F[i] > F[top * 3 + 1]) top = (i - 1) / 3;
    assert.ok(V[top * 3 + 1] > 3 && V[top * 3 + 2] > 0.4, `${c.id}: on top ${V.slice(top * 3, top * 3 + 3)}`);
  }
});

test("shoes as a pair: side by side on their soles, toes to the front", { skip: !DIR }, () => {
  for (const c of catalog.filter((c) => c.slot === "shoes")) {
    const P = pair(items[c.id].verts), b = bounds(P), [w, h, d] = size(b);
    assert.ok(Math.abs(b.lo[1]) < 1e-6 && w < 0.17 && w > 0.08 && d > 0.13, `${c.id}: ${w.toFixed(3)} × ${d.toFixed(3)}`);
    let gapL = -Infinity, gapR = Infinity;
    for (let i = 0; i < P.length; i += 3) { if (P[i] < 0) gapL = Math.max(gapL, P[i]); else gapR = Math.min(gapR, P[i]); }
    assert.ok(gapR - gapL > 0.01 && gapR - gapL < 0.03, `${c.id}: gap ${(gapR - gapL).toFixed(3)}`);
  }
});

test("hair and hats sit on the mannequin head where they sit on the body", { skip: !DIR }, () => {
  const hb = bounds(onHead(head, head));
  assert.ok(Math.abs(hb.lo[1]) < 1e-6 && Math.abs(hb.lo[0] + hb.hi[0]) < 1e-4);
  for (const c of catalog.filter((c) => c.slot === "hair" || (c.slot === "hat" && c.id !== "headband"))) {
    const b = bounds(onHead(items[c.id].verts, head));
    assert.ok(b.hi[1] > hb.hi[1] - 0.01, `${c.id} covers the crown`);
    assert.ok(b.lo[0] < hb.lo[0] + 0.03 && b.hi[0] > hb.hi[0] - 0.03, `${c.id} around the head`);
  }
});

test("the shop: every item in its place, none in another's, none on the body, all on what holds them", { skip: !DIR }, () => {
  const { places, parts, half } = shopLayout(catalog);
  const shown = catalog.filter((c) => c.display !== "none");             // (necklaces: only in the panel)
  assert.deepEqual(Object.keys(places).sort(), shown.map((c) => c.id).sort());
  const boxes = shown.map((c) => {
    const p = places[c.id];
    assert.equal(p.kind, c.display, c.id);
    const b = bounds(shaped(c.id, p.kind)), t = p.tilt || 0;
    if (!SHAPE[p.kind]) {                       // with the mannequin head it is shown on
      const h = bounds(onHead(head, head));
      for (let k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], h.lo[k]); b.hi[k] = Math.max(b.hi[k], h.hi[k]); }
    }
    // (shoes lean toes down a little: allow for it)
    const lean = Math.sin(t) * size(b)[2] / 2;
    return { id: c.id, kind: p.kind, lo: [p.x + b.lo[0], p.y + b.lo[1] - lean, p.z + b.lo[2]], hi: [p.x + b.hi[0], p.y + b.hi[1] + lean, p.z + b.hi[2]] };
  });
  for (const a of boxes) {
    assert.ok(a.lo[1] >= -1e-6, `${a.id} above the floor`);
    // out of the body's way: it stands at the middle, about half a height across
    assert.ok(a.hi[0] < -0.3 || a.lo[0] > 0.3 || a.hi[2] < -0.3, `${a.id} clear of the body`);
  }
  // hung garments overlap their neighbours' sleeves (stepped front to back); anything else, nothing
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.kind === "hang" && b.kind === "hang") continue;
    const shrink = 0.004, over = [0, 1, 2].every((k) => a.lo[k] + shrink < b.hi[k] - shrink && b.lo[k] + shrink < a.hi[k] - shrink);
    assert.ok(!over, `${a.id} and ${b.id} overlap`);
  }
  // shelved things stand on a board and fit under the next; hair on a stand stays off the floor
  const boards = parts.filter((p) => p.kind === "box" && p.size[1] < 0.02).map((p) => p.at[1] + p.size[1] / 2).sort((x, y) => x - y);
  for (const a of boxes.filter((a) => a.kind === "fold" || a.kind === "head")) {
    const under = boards.filter((y) => y <= a.lo[1] + 0.02).pop(), over = boards.find((y) => y > a.lo[1] + 0.02);
    assert.ok(under !== undefined && a.lo[1] - under < 0.02, `${a.id} on a shelf`);
    assert.ok(over !== undefined && a.hi[1] < over - 0.01, `${a.id} under the next shelf`);
  }
  for (const a of boxes.filter((a) => a.kind === "stand" || a.kind === "hat")) assert.ok(a.lo[1] > 0.2, a.id);
  // hung garments hang clear of the floor
  for (const a of boxes.filter((a) => a.kind === "hang")) assert.ok(a.lo[1] > 0.1, a.id);
  // and the whole shop is within what the camera is told to take in, under 2.4 heights to each side
  assert.ok(half < 2.4, `${half}`);
  for (const a of boxes) assert.ok(Math.abs(a.lo[0]) < half && Math.abs(a.hi[0]) < half, a.id);
  assert.ok(boxes.every((a) => a.hi[2] < SHOP.back + 0.5));
});

test("racks are built for any number of items", () => {
  const some = [{ id: "a", display: "hang" }, { id: "b", display: "fold" }, { id: "c", display: "hat" }];
  for (const n of [0, 1, 3]) {
    const { places, parts } = shopLayout(some.slice(0, n));
    assert.equal(Object.keys(places).length, n);
    assert.ok(parts.length > 4);
    for (const p of parts) for (const v of [...(p.at || []), ...(p.to || []), ...(p.size || [])]) assert.ok(Number.isFinite(v));
  }
});
