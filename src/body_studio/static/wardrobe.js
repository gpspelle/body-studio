// Wardrobe: the Clothes section of the Try on panel (tattoo.js owns the panel, the skeleton and
// the pose). The body's base mesh is fitted once (fit.py, GET /api/fit); an item comes fitted to
// the body (GET /api/wardrobe/<id>), becomes splats (dress.js), is skinned with the body's own
// weights and moved by the same pose, and the body's splats under it are hidden while it is worn.
// One item per slot (clothes, shoes, hair, hat). Design and sources: docs/wardrobe.md.
import * as THREE from "three";
import { SplatMesh, SplatSkinning } from "@sparkjsdev/spark";
import { SkinCover, decodeItem, fitNormals, fitSkin, itemSplats, itemWeights, skinUnder } from "/static/dress.js";
import { dualQuats, skinPoint } from "/static/pose.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const V = window.bodyApp.viewer;
const SLOTS = ["outfit", "shoes", "hair", "hat"];
const CUTS = ["all", "women", "men", "unisex"];
const SPACING = 0.0032;          // splat spacing on an item, fraction of the person's height (about 6 mm)
const REACH = 0.03;              // a body splat is under an item if its nearest skin vertex is (within this)
const HANG = 0.04;               // how far out from the skin an item still covers it (a skirt over the thighs)
const SCALP = 0.012;             // hair this close over the skin colours it (the scalp under the hair)
const HAIR_SPACING = 0.7;        // hair cards are partly see-through: twice as many splats

let W = null;                    // the body being dressed: rig, weights, its mesh, what is worn…
let catalog = null;
let cut = "all";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

addEventListener("studioready", async (e) => {
  undressAll();
  const { file, rig, weights, mesh, centres, transforms } = e.detail;
  W = { file, rig, weights, mesh, centres, transforms, worn: new Map(), fit: null, cover: null, hidden: new Map(),
        tinted: new Map(), busy: 0 };
  window.wardrobe.ready = false;
  if (!catalog) catalog = await (await fetch("/api/wardrobe")).json();
  ui();
  if (await loadFit(W) && W.file === file) {
    for (const id of store.get("wear:" + file) || []) if (W && W.file === file) await wear(id, true);
  }
  if (W && W.file === file) window.wardrobe.ready = true;
});
addEventListener("studiogone", () => { undressAll(); W = null; });
addEventListener("posed", (e) => {
  if (!W) return;
  W.transforms = e.detail;
  for (const w of W.worn.values()) pose(w);
  refit();
});

function status(text) { $("wearStatus").textContent = text || ""; }

async function loadFit(w) {
  status(t("wear.fitting"));
  for (;;) {
    const r = await fetch("/api/fit?body=" + encodeURIComponent(w.file));
    if (W !== w) return false;
    if (r.status === 202) { await new Promise((ok) => setTimeout(ok, 1000)); continue; }
    const d = await r.json();
    if (!r.ok) { status(t("wear.failed", { advice: t("rig.err." + (d.code || "shape")) })); return false; }
    w.fit = d;
    w.skin = fitSkin(d);
    w.normals = fitNormals(d);
    w.cover = new SkinCover(w.skin, w.centres, REACH * w.rig.height);
    status("");
    ui();
    return true;
  }
}

// ---------------------------------------------------------------- panel
function ui() {
  const box = $("wearSlots");
  if (!W || !catalog) { box.replaceChildren(); return; }
  $("wearCut").replaceChildren(...CUTS.map((c) => {
    const b = document.createElement("button");
    b.textContent = t("wear.cut." + c);
    b.classList.toggle("on", c === cut);
    b.onclick = () => { cut = c; ui(); };
    return b;
  }));
  box.replaceChildren(...SLOTS.map((slot) => {
    const items = catalog.filter((i) => i.slot === slot && (slot !== "outfit" || cut === "all" || i.cut === cut));
    const wrap = document.createElement("div");
    const h = document.createElement("h3");
    h.textContent = t("wear.slot." + slot);
    const chips = document.createElement("div");
    chips.className = "chips";
    chips.append(...items.map((it) => {
      const b = document.createElement("button");
      b.textContent = t("wear.item." + it.id);
      b.dataset.item = it.id;
      b.disabled = !W.fit;
      b.classList.toggle("on", W.worn.get(slot)?.id === it.id);
      b.setAttribute("aria-pressed", String(W.worn.get(slot)?.id === it.id));
      b.onclick = () => wear(it.id);
      return b;
    }));
    wrap.append(h, chips);
    return wrap;
  }));
}
addEventListener("langchange", ui);

// ---------------------------------------------------------------- wearing
async function wear(id, restoring = false) {
  const w = W, it = catalog && catalog.find((i) => i.id === id);
  if (!w || !w.fit || !it) return;
  const old = w.worn.get(it.slot);
  if (old && old.id === id && !restoring) { takeOff(it.slot); return changed(); }
  w.busy++;
  status(t("wear.loading", { name: t("wear.item." + id) }));
  try {
    let d;
    for (;;) {
      const r = await fetch(`/api/wardrobe/${id}?body=` + encodeURIComponent(w.file));
      if (W !== w) return;
      if (r.status === 202) { await new Promise((ok) => setTimeout(ok, 1000)); continue; }
      if (!r.ok) return;
      d = decodeItem(await r.json());
      break;
    }
    const tex = await texture("/static/wardrobe/" + d.texture);
    if (W !== w) return;
    const H = w.rig.height, hair = it.slot === "hair";
    const s = itemSplats(d, tex, SPACING * H * (hair ? HAIR_SPACING : 1), w.rig.frame);
    const mesh = await splatMesh(s);
    if (W !== w) { mesh.dispose?.(); return; }
    const skinning = skin(mesh, s, w, d);
    takeOff(it.slot);
    const entry = { id, slot: it.slot, mesh, skinning, n: s.n, splats: s, nbr: neighbours(s, H),
                    grow: new Uint8Array(s.n).fill(GROW_STEPS) };
    if (hair) {
      // hair cards let the scalp show between them: the scalp takes the hair's colour instead
      entry.tint = skinUnder(d, w.skin, w.normals, SCALP * H);
      entry.colour = meanColour(s);
    } else {
      entry.covers = Int32Array.from(new Set([...d.delete, ...skinUnder(d, w.skin, w.normals, HANG * H)]));
    }
    w.worn.set(it.slot, entry);
    V.holder.add(mesh);
    pose(entry);
    if (W.transforms) grow(entry);
  } finally {
    w.busy--;
    if (W === w && !w.busy) status("");
  }
  changed();
}

function takeOff(slot) {
  const e = W && W.worn.get(slot);
  if (!e) return;
  V.holder.remove(e.mesh);
  e.mesh.dispose?.();
  W.worn.delete(slot);
}

function undressAll() {
  if (!W) return;
  for (const slot of [...W.worn.keys()]) takeOff(slot);
  dressSkin();
}

// after something was put on or taken off: hide the skin under what is worn, remember it
function changed() {
  if (!W) return;
  dressSkin();
  store.set("wear:" + W.file, SLOTS.map((s) => W.worn.get(s)?.id).filter(Boolean));
  ui();
}

// The body's splats under what is worn are hidden, and those under hair take its colour. The
// originals are kept, so they come back when the item comes off.
function dressSkin() {
  const w = W;
  if (!w || !w.cover) return;
  const worn = [...w.worn.values()];
  const tint = new Map();
  for (const e of worn) if (e.tint) for (const i of w.cover.covered([e.tint])) tint.set(i, e.colour);
  const now = new Set(w.cover.covered(worn.filter((e) => e.covers).map((e) => e.covers)));
  for (const i of now) tint.delete(i);
  const packed = w.mesh.packedSplats;
  if (!packed) return;
  let touched = false;
  const put = (i, f) => { const s = packed.getSplat(i); f(s); packed.setSplat(i, s.center, s.scales, s.quaternion, s.opacity, s.color); touched = true; };
  for (const [i, op] of w.hidden) if (!now.has(i)) { put(i, (s) => { s.opacity = op; }); w.hidden.delete(i); }
  for (const [i, c] of w.tinted) if (tint.get(i) !== c.by) { put(i, (s) => s.color.copy(c.color)); w.tinted.delete(i); }
  for (const i of now) if (!w.hidden.has(i)) put(i, (s) => { w.hidden.set(i, s.opacity); s.opacity = 0; });
  for (const [i, col] of tint) {
    if (w.tinted.has(i)) continue;
    put(i, (s) => {
      w.tinted.set(i, { color: s.color.clone(), by: col });
      // the hair's colour, with a little of the skin's light and shade
      const l = (s.color.r + s.color.g + s.color.b) / 3;
      s.color.setRGB(col[0] * (0.6 + 0.6 * l), col[1] * (0.6 + 0.6 * l), col[2] * (0.6 + 0.6 * l));
    });
  }
  // the packed splats are read again only when the mesh rebuilds its generator
  if (touched) { packed.needsUpdate = true; w.mesh.updateGenerator(); }
  // a tattoo is ink in the skin: where the skin is hidden, so is its ink (tattoo.js)
  if (touched) dispatchEvent(new CustomEvent("skinhidden", { detail: new Set(w.hidden.keys()) }));
}

function meanColour(s) {
  const c = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < s.n; i++) {
    const a = s.opacity[i];
    for (let k = 0; k < 3; k++) c[k] += a * s.colours[i * 3 + k];
    n += a;
  }
  return c.map((v) => (n ? 0.85 * v / n : 0));
}

async function texture(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return { width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}

async function splatMesh(s) {
  const c = new THREE.Vector3(), sc = new THREE.Vector3(...s.scale), qq = new THREE.Quaternion(), col = new THREE.Color();
  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      for (let i = 0; i < s.n; i++) {
        c.fromArray(s.centres, i * 3);
        qq.fromArray(s.quats, i * 4);
        col.setRGB(s.colours[i * 3], s.colours[i * 3 + 1], s.colours[i * 3 + 2]);
        splats.pushSplat(c, sc, qq, s.opacity[i], col);
      }
    },
  });
  await mesh.initialized;
  return mesh;
}

// The item's splats move with the skin they hang from (itemWeights in dress.js): weights at the
// skin vertex nearest each anchor, smoothed over the item. Not the weights where the splats are:
// off the skin, beside the chest under the armpit, the nearest bone is the upper arm, and a
// shirt's sides flew out with the arms when they were raised.
function skin(mesh, s, w, item) {
  const nb = w.rig.joints.length;
  const skinning = new SplatSkinning({ mesh, numSplats: s.n, numBones: nb });
  const sk = w.skin, vb = new THREE.Vector4(), vw = new THREE.Vector4();
  const at = (x, y, z, bones, weights) => {
    const v = w.cover.nearestSkin(x, y, z);
    if (v >= 0) w.weights.at(sk[v * 3], sk[v * 3 + 1], sk[v * 3 + 2], bones, weights);
    else w.weights.at(x, y, z, bones, weights);
  };
  const { bones, weights } = itemWeights(item, s, at, nb);
  s.bones = bones; s.weights = weights;
  for (let i = 0; i < s.n; i++) {
    vb.set(bones[i * 4], bones[i * 4 + 1], bones[i * 4 + 2], bones[i * 4 + 3]);
    vw.set(weights[i * 4] / 255, weights[i * 4 + 1] / 255, weights[i * 4 + 2] / 255, weights[i * 4 + 3] / 255);
    skinning.setSplatBones(i, vb, vw);
  }
  skinning.skinTexture.needsUpdate = true;
  const qi = new THREE.Quaternion(), zero = new THREE.Vector3();
  for (let b = 0; b < nb; b++) skinning.setRestQuatPos(b, qi, zero);
  mesh.skinning = skinning;
  mesh.updateGenerator();
  return skinning;
}

function pose(e) {
  if (!W.transforms) return;
  const qv = new THREE.Quaternion(), tv = new THREE.Vector3();
  W.transforms.forEach(({ q, t: tt }, b) => e.skinning.setBoneQuatPos(b, qv.set(q[0], q[1], q[2], q[3]), tv.set(tt[0], tt[1], tt[2])));
  e.skinning.updateBones();
}

// A pose stretches cloth where it passes from one bone to the next (under a raised arm, the
// sleeve's underside spans from the chest to the arm): its splats, sized for the item at rest,
// would pull apart into flakes there. So after a pose each splat grows by how far its nearest
// neighbours at rest have moved away from it (up to 3 times), and shrinks back when they return.
const GROW_STEPS = 4;            // sizes in quarters: 4 is the size at rest
const GROW_MAX = 12;
let refitTimer = null, refitAt = 0;
function refit() {
  // at most a few times a second while the body moves (walking), and once more when it stops
  clearTimeout(refitTimer);
  const wait = Math.max(0, refitAt + 250 - performance.now());
  refitTimer = setTimeout(() => {
    refitAt = performance.now();
    if (W && W.transforms) for (const e of W.worn.values()) grow(e);
  }, wait);
}

function neighbours(s, H) {
  const grid = new SkinCover(s.centres, new Float32Array(0), 0.01 * H), C = s.centres, cell = grid.reach;
  const out = new Int32Array(s.n * 2).fill(-1), d2 = new Float64Array(2);
  for (let i = 0; i < s.n; i++) {
    const x = C[i * 3], y = C[i * 3 + 1], z = C[i * 3 + 2];
    d2[0] = d2[1] = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.grid.get(grid.key(Math.floor(x / cell) + dx, Math.floor(y / cell) + dy, Math.floor(z / cell) + dz)) || []) {
        if (j === i) continue;
        const d = (C[j * 3] - x) ** 2 + (C[j * 3 + 1] - y) ** 2 + (C[j * 3 + 2] - z) ** 2;
        if (d === 0) continue;
        if (d < d2[0]) { d2[1] = d2[0]; out[i * 2 + 1] = out[i * 2]; d2[0] = d; out[i * 2] = j; }
        else if (d < d2[1]) { d2[1] = d; out[i * 2 + 1] = j; }
      }
    }
  }
  return out;
}

function grow(e) {
  const s = e.splats, C = s.centres, dq = dualQuats(W.transforms), P = new Float32Array(s.n * 3), out = [0, 0, 0];
  for (let i = 0; i < s.n; i++) P.set(skinPoint([C[i * 3], C[i * 3 + 1], C[i * 3 + 2]], s.bones, s.weights, dq, out, i), i * 3);
  const packed = e.mesh.packedSplats;
  if (!packed) return;
  let touched = false;
  for (let i = 0; i < s.n; i++) {
    let f = 1;
    for (let k = 0; k < 2; k++) {
      const j = e.nbr[i * 2 + k];
      if (j < 0) continue;
      const rest = Math.hypot(C[j * 3] - C[i * 3], C[j * 3 + 1] - C[i * 3 + 1], C[j * 3 + 2] - C[i * 3 + 2]);
      const now = Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]);
      f = Math.max(f, now / rest);
    }
    const g = Math.min(GROW_MAX, Math.max(GROW_STEPS, Math.round(f * GROW_STEPS)));
    if (g === e.grow[i]) continue;
    e.grow[i] = g;
    const sp = packed.getSplat(i), k = g / GROW_STEPS;
    sp.scales.set(s.scale[0] * k, s.scale[1] * k, s.scale[2]);
    packed.setSplat(i, sp.center, sp.scales, sp.quaternion, sp.opacity, sp.color);
    touched = true;
  }
  if (touched) { packed.needsUpdate = true; e.mesh.updateGenerator(); }
}

// ---------------------------------------------------------------- for the tattoo panel, tests and scripts
window.wardrobe = {
  ready: false,
  items: () => catalog,
  wear: (id) => wear(id),
  worn: () => (W ? SLOTS.map((s) => W.worn.get(s)?.id).filter(Boolean) : []),
  splats: (id) => [...(W ? W.worn.values() : [])].find((e) => e.id === id)?.n || 0,
  hidden: () => (W ? W.hidden.size : 0),
  tinted: () => (W ? W.tinted.size : 0),
  // how many of an item's splats are grown to cover cloth the pose stretches
  grown: (id) => { const e = W && [...W.worn.values()].find((x) => x.id === id); return e ? e.grow.reduce((a, g) => a + (g > GROW_STEPS), 0) : 0; },
  // how much an item's surface is stretched in the current pose: for each splat, how far its
  // nearest neighbour at rest has moved away from it, as a multiple of their distance at rest (the
  // given quantile). Splats are sized for the item at rest; well past 2 they leave gaps.
  stretch(id, quantile = 0.99) {
    const e = W && [...W.worn.values()].find((x) => x.id === id);
    if (!e || !W.transforms) return null;
    const s = e.splats, dq = dualQuats(W.transforms), P = new Float32Array(s.n * 3), out = [0, 0, 0];
    for (let i = 0; i < s.n; i++)
      P.set(skinPoint([s.centres[i * 3], s.centres[i * 3 + 1], s.centres[i * 3 + 2]], s.bones, s.weights, dq, out, i), i * 3);
    const grid = new SkinCover(s.centres, new Float32Array(0), 0.01 * W.rig.height), C = s.centres, r = [];
    for (let i = 0; i < s.n; i += 3) {
      // nearest other splat at rest
      let best = -1, bd = Infinity;
      const x = C[i * 3], y = C[i * 3 + 1], z = C[i * 3 + 2], cell = grid.reach;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.grid.get(grid.key(Math.floor(x / cell) + dx, Math.floor(y / cell) + dy, Math.floor(z / cell) + dz)) || []) {
          if (j === i) continue;
          const d = (C[j * 3] - x) ** 2 + (C[j * 3 + 1] - y) ** 2 + (C[j * 3 + 2] - z) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
      }
      if (best < 0 || bd === 0) continue;
      r.push(Math.hypot(P[best * 3] - P[i * 3], P[best * 3 + 1] - P[i * 3 + 1], P[best * 3 + 2] - P[i * 3 + 2]) / Math.sqrt(bd));
    }
    r.sort((x, y) => x - y);
    return r[Math.min(r.length - 1, Math.floor(quantile * r.length))];
  },
  // how far an item's splats are, in the current pose, from the skin they hang from (the skin
  // vertex nearest their anchor): the given quantile, in fractions of the person's height
  gap(id, quantile = 0.99) {
    const e = W && [...W.worn.values()].find((x) => x.id === id);
    if (!e || !W.transforms) return null;
    const dq = dualQuats(W.transforms), b = new Uint8Array(4), wt = new Uint8Array(4), s = e.splats, d = [];
    for (let i = 0; i < s.n; i++) {
      const v = W.cover.nearestSkin(s.anchors[i * 3], s.anchors[i * 3 + 1], s.anchors[i * 3 + 2]);
      if (v < 0) continue;
      const p = [W.skin[v * 3], W.skin[v * 3 + 1], W.skin[v * 3 + 2]];
      W.weights.at(p[0], p[1], p[2], b, wt);
      const ps = skinPoint(p, b, wt, dq, [0, 0, 0]);
      const pc = skinPoint([s.centres[i * 3], s.centres[i * 3 + 1], s.centres[i * 3 + 2]], s.bones, s.weights, dq, [0, 0, 0], i);
      d.push(Math.hypot(pc[0] - ps[0], pc[1] - ps[1], pc[2] - ps[2]) / W.rig.height);
    }
    d.sort((x, y) => x - y);
    return d[Math.min(d.length - 1, Math.floor(quantile * d.length))];
  },
};
