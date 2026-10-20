// The shop around the body, free of three.js so it can be tested on its own (tests/js/racks.test.mjs,
// run by tests/unit/test_racks_js.py): where each rack, shelf and stand stands, where each item goes,
// and each item's shape there: hung on a hanger, folded, a pair of shoes side by side, hair or a hat
// on a mannequin head. Items come as they are made (GET /api/wardrobe/<id>/shape): on MakeHuman's
// base mesh, in decimetres, y up, z to the front. The shop is in units of the person's height, from
// the floor under the body, y up, z toward the camera's home. The page draws it with plain three.js
// meshes, not splats, so it adds nothing to Spark's sort. Design: docs/wardrobe.md.

export const MH_HEIGHT = 16.66;  // MakeHuman's base mesh, soles to crown (decimetres)
export const MH_FLOOR = -8.2;    // its soles

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function bounds(V) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k]);
  }
  return { lo, hi };
}

// in units of the person's height, with the point (x, y, z) at the origin
function anchored(V, x, y, z) {
  const out = new Float32Array(V.length), s = 1 / MH_HEIGHT;
  for (let i = 0; i < V.length; i += 3) {
    out[i] = (V[i] - x) * s; out[i + 1] = (V[i + 1] - y) * s; out[i + 2] = (V[i + 2] - z) * s;
  }
  return out;
}

// The base mesh stands in an A pose: arms 42° out from the sides, feet apart. On a hanger the arms
// hang down beside the body and the legs together, turned about the shoulders and hips (blended
// across the armpit and the crotch so the cloth stays in one piece), and the cloth hangs flatter.
const SHOULDER = [1.85, 5.2], ARM_TURN = 38 * Math.PI / 180;
const HIP = [0.9, -0.4], LEG_TURN = 10 * Math.PI / 180;
function hangPose(V, flat) {
  const out = new Float32Array(V.length);
  for (let i = 0; i < V.length; i += 3) {
    let x = V[i], y = V[i + 1];
    const side = x < 0 ? -1 : 1, ax = Math.abs(x);
    const arm = smooth(1.55, 2.05, ax) * smooth(1.2, 2.2, y);
    if (arm > 0) {
      const a = -ARM_TURN * arm, c = Math.cos(a), s = Math.sin(a), dx = ax - SHOULDER[0], dy = y - SHOULDER[1];
      x = side * (SHOULDER[0] + c * dx - s * dy); y = SHOULDER[1] + s * dx + c * dy;
    }
    const leg = smooth(-0.2, -1.4, y) * smooth(0.1, 0.6, Math.abs(x));
    if (leg > 0) {
      const a = -LEG_TURN * leg, c = Math.cos(a), s = Math.sin(a), dx = Math.abs(x) - HIP[0], dy = y - HIP[1];
      x = side * (HIP[0] + c * dx - s * dy); y = HIP[1] + s * dx + c * dy;
    }
    out[i] = x; out[i + 1] = y; out[i + 2] = 0.3 + (V[i + 2] - 0.3) * flat;
  }
  return out;
}

// On a hanger: the hook's top at the origin, the garment's shoulders a little below it.
export const HANGER_DROP = 0.035;           // hook top to the shoulders' top, in heights
export function hang(V) {
  const P = hangPose(V, 0.6), b = bounds(P);
  return anchored(P, 0, b.hi[1] + HANGER_DROP * MH_HEIGHT, 0.3);
}

// Folded the way a shop folds it: the legs folded together along the inside seam and spread to the
// trunk's width, the sleeves folded back under it, then folded in zigzags from the collar down into a stack of
// bands, laid flat with the collar to the front and the chest on top. The bottom of the stack's
// middle at the origin.
export const FOLD = { half: 1.75, depth: 3.0, flat: 0.08, layer: 0.3, leg: 0.95, legSpread: 1.8 };   // decimetres
function zigzag(u, w) {                    // u folded into [0, w], and how many folds away it is
  const k = Math.floor(u / w), r = u - k * w;
  return [k % 2 === 0 ? r : w - r, k];
}
export function fold(V) {
  const P = hangPose(V, 1), n = V.length / 3, F = FOLD;
  const X = new Float32Array(n), Z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], legs = smooth(-0.2, -1.2, P[i * 3 + 1]);
    // the left leg over the right one (a little above it), both spread to the trunk's width
    X[i] = x + legs * ((Math.abs(x) - F.leg) * F.legSpread - x);
    Z[i] = (P[i * 3 + 2] - 0.3) * F.flat + legs * smooth(0.05, -0.3, x) * 0.12;
  }
  // what is still wider than the trunk (the sleeves) folded back under it
  for (let i = 0; i < n; i++) {
    const a = Math.abs(X[i]);
    if (a > F.half) { X[i] = Math.sign(X[i]) * Math.max(0, 2 * F.half - a); Z[i] -= 0.12; }
  }
  const top = bounds(P).hi[1];
  const out = new Float32Array(V.length);
  for (let i = 0; i < n; i++) {
    const [y, band] = zigzag(top - P[i * 3 + 1], F.depth);
    // each band under the one before it, turned over at each fold
    out[i * 3] = -X[i]; out[i * 3 + 1] = (band % 2 ? -Z[i] : Z[i]) - band * F.layer; out[i * 3 + 2] = F.depth / 2 - y;
  }
  const ob = bounds(out);
  return anchored(out, 0, ob.lo[1], 0);
}

// Shoes as a pair, side by side (the base mesh's feet are apart), the soles' middle at the origin.
export const PAIR_GAP = 0.25;                // between the two shoes, decimetres
export function pair(V) {
  let inL = -Infinity, inR = Infinity;
  for (let i = 0; i < V.length; i += 3) { const x = V[i]; if (x < 0) inL = Math.max(inL, x); else inR = Math.min(inR, x); }
  const out = new Float32Array(V);
  for (let i = 0; i < V.length; i += 3) out[i] += V[i] < 0 ? -PAIR_GAP / 2 - inL : PAIR_GAP / 2 - inR;
  const b = bounds(out);
  return anchored(out, (b.lo[0] + b.hi[0]) / 2, b.lo[1], (b.lo[2] + b.hi[2]) / 2);
}

// Hair and hats sit on a mannequin head where they sit on the base mesh: the head, the hair and
// the hat all move by the same amount, the bottom of the neck's middle to the origin.
export function onHead(V, head) {
  const b = bounds(head);
  return anchored(V, (b.lo[0] + b.hi[0]) / 2, b.lo[1], (b.lo[2] + b.hi[2]) / 2);
}

// ---------------------------------------------------------------- the shop
// Behind the body as the camera first sees it: the clothes rail to the left with the shoe rack in
// front of it, the shelves (folded clothes below, short hair on mannequin heads above) to the right,
// and beyond them the stands: a mannequin head on a pole for each hat and for hair too long for a
// shelf. Sizes in the person's heights.
export const SHOP = {
  back: -0.55,                              // the racks' line, behind the body
  inner: 0.35,                              // how far from the body's middle they start, to each side
  rail: { height: 1.08, spacing: 0.17, end: 0.17, hanger: 0.1 },
  shelves: { width: 0.8, depth: 0.2, first: 0.3, gap: 0.25, board: 0.012, folded: 3, heads: 5, foot: 0.012 },
  shoes: { front: -0.2, tiers: [0.03, 0.2], step: 0.16, perTier: 3, spacing: 0.2, tilt: 0.25 },
  stands: { gap: 0.13, spacing: 0.11, height: 0.98, stagger: 0.2 },
};

// Where every item goes ({id: {kind, x, y, z, tilt}}: the point its shape is anchored by, and how
// far it leans toes down, radians), the parts the racks are made of ({kind: "box", at, size} or
// {kind: "rod", at, to, r}, each with a material), and how far the shop reaches to either side
// (half). `items`: the catalogue, each with its display.
export function shopLayout(items) {
  const S = SHOP, places = {}, parts = [];
  const of = (...kinds) => items.filter((i) => kinds.includes(i.display));
  const box = (at, size, material = "wood") => parts.push({ kind: "box", at, size, material });
  const rod = (at, to, r, material = "metal") => parts.push({ kind: "rod", at, to, r, material });

  // the rail, with a hanger on it for each item
  const hung = of("hang"), rh = S.rail.height, back = S.back;
  const railEnd = -S.inner, railStart = railEnd - S.rail.end * 2 - Math.max(0, hung.length - 1) * S.rail.spacing;
  rod([railStart, rh, back], [railEnd, rh, back], 0.008);
  for (const x of [railStart, railEnd]) {
    rod([x, 0.012, back], [x, rh, back], 0.009);
    rod([x, 0.012, back - 0.12], [x, 0.012, back + 0.12], 0.012);
  }
  hung.forEach((it, k) => {
    // stepped a little front to back, so neighbouring sleeves lie over each other, not through
    const x = railStart + S.rail.end + k * S.rail.spacing, y = rh + 0.008, z = back + (k % 2 ? -0.03 : 0.03), w = S.rail.hanger;
    places[it.id] = { kind: "hang", x, y, z, tilt: 0 };
    const neck = [x, y - 0.014, z], low = y - HANGER_DROP - 0.03;    // (inside the sloping shoulders)
    rod([x, y, z], neck, 0.003);
    rod(neck, [x - w, low, z], 0.004, "hanger");
    rod(neck, [x + w, low, z], 0.004, "hanger");
    rod([x - w, low, z], [x + w, low, z], 0.003, "hanger");
  });

  // the shoe rack in front of the rail: tiers stepping up toward the back, the shoes on them toes
  // down a little, toward the camera
  const sr = S.shoes, shoes = of("shoes"), tiers = Math.max(1, Math.ceil(shoes.length / sr.perTier));
  const sw = sr.spacing * sr.perTier, sx = (railStart + railEnd) / 2;
  for (let t = 0; t < tiers; t++) {
    const y = sr.tiers[Math.min(t, sr.tiers.length - 1)] + Math.max(0, t - sr.tiers.length + 1) * 0.1, z = sr.front - t * sr.step;
    rod([sx - sw / 2, y, z + 0.04], [sx + sw / 2, y, z + 0.04], 0.006);
    rod([sx - sw / 2, y + 0.02, z - 0.04], [sx + sw / 2, y + 0.02, z - 0.04], 0.006);
    for (const x of [sx - sw / 2, sx + sw / 2]) rod([x, 0, z], [x, y + 0.02, z], 0.006);
    shoes.slice(t * sr.perTier, (t + 1) * sr.perTier).forEach((it, k) => {
      places[it.id] = { kind: "shoes", x: sx - sw / 2 + sr.spacing * (k + 0.5), y: y + 0.016, z, tilt: sr.tilt };
    });
  }

  // the shelves: folded clothes on the lower ones, mannequin heads above
  const sh = S.shelves, x0 = S.inner, x1 = S.inner + sh.width;
  const rows = [], folded = of("fold"), heads = of("head");
  for (let k = 0; k < folded.length; k += sh.folded) rows.push(folded.slice(k, k + sh.folded));
  for (let k = 0; k < heads.length; k += sh.heads) rows.push(heads.slice(k, k + sh.heads));
  const levels = rows.map((_, k) => sh.first + k * sh.gap);
  const top = (levels.length ? levels[levels.length - 1] : sh.first) + sh.gap;
  for (const y of [...levels, top]) box([(x0 + x1) / 2, y - sh.board / 2, back], [sh.width, sh.board, sh.depth]);
  for (const x of [x0, x1]) box([x, top / 2, back], [sh.board, top, sh.depth]);
  box([(x0 + x1) / 2, top / 2, back - sh.depth / 2], [sh.width, top, sh.board], "back");
  rows.forEach((row, r) => row.forEach((it, k) => {
    const x = x0 + sh.width * (k + 0.5) / row.length, y = levels[r];
    if (it.display === "head") {
      rod([x, y, back], [x, y + sh.foot, back], 0.02, "foam");             // the head's foot
      places[it.id] = { kind: "head", x, y: y + sh.foot, z: back, tilt: 0 };
    } else places[it.id] = { kind: "fold", x, y, z: back, tilt: 0 };
  }));

  // the stands: a pole on a cross foot, a mannequin head on top
  const st = S.stands;
  of("hat", "stand").forEach((it, k) => {
    const x = x1 + st.gap + k * st.spacing, z = back + (k % 2 ? st.stagger : 0);
    rod([x, 0, z], [x, st.height, z], 0.008);
    rod([x - 0.07, 0.01, z], [x + 0.07, 0.01, z], 0.01);
    rod([x, 0.01, z - 0.07], [x, 0.01, z + 0.07], 0.01);
    places[it.id] = { kind: it.display, x, y: st.height, z, tilt: 0 };
  });
  // (a garment on a hanger reaches about 0.15 past its place, anything else under 0.1)
  const half = Math.max(0, ...Object.values(places).map((p) => Math.abs(p.x) + (p.kind === "hang" ? 0.16 : 0.1)),
                        ...parts.flatMap((p) => [p.at[0], (p.to || p.at)[0]].map((x) => Math.abs(x) + 0.02)));
  return { places, parts, half };
}
