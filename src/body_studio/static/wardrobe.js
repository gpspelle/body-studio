// Wardrobe: the Clothes section of the Try on panel (tattoo.js owns the panel, the skeleton and
// the pose). The body's base mesh is fitted once (fit.py, GET /api/fit); an item comes fitted to
// the body (GET /api/wardrobe/<id>), becomes splats (dress.js), is skinned with the body's own
// weights and moved by the same pose, and the body's splats under it are hidden while it is worn.
// One item per slot (clothes, shoes, hair, hat). Design and sources: docs/wardrobe.md.
import * as THREE from "three";
import { SplatMesh, SplatSkinning } from "@sparkjsdev/spark";
import { SkinCover, decodeItem, fitSkin, itemSplats } from "/static/dress.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const V = window.bodyApp.viewer;
const SLOTS = ["outfit", "shoes", "hair", "hat"];
const CUTS = ["all", "women", "men", "unisex"];
const SPACING = 0.0032;          // splat spacing on an item, fraction of the person's height (about 6 mm)
const REACH = 0.03;              // a body splat is under an item if its nearest skin vertex is (within this)

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
  W = { file, rig, weights, mesh, centres, transforms, worn: new Map(), fit: null, cover: null, hidden: new Map(), busy: 0 };
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
    w.cover = new SkinCover(fitSkin(d), w.centres, REACH * w.rig.height);
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
    const s = itemSplats(d, tex, SPACING * w.rig.height, w.rig.frame);
    const mesh = await splatMesh(s);
    if (W !== w) { mesh.dispose?.(); return; }
    const skinning = skin(mesh, s, w);
    takeOff(it.slot);
    const entry = { id, slot: it.slot, mesh, skinning, delete: d.delete, n: s.n };
    w.worn.set(it.slot, entry);
    V.holder.add(mesh);
    pose(entry);
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
  hideSkin([]);
}

// after something was put on or taken off: hide the skin under what is worn, remember it, tell
// the tattoo panel (ink under clothes is hidden)
function changed() {
  if (!W) return;
  hideSkin([...W.worn.values()].map((e) => e.delete));
  store.set("wear:" + W.file, SLOTS.map((s) => W.worn.get(s)?.id).filter(Boolean));
  ui();
  dispatchEvent(new Event("wearchange"));
}

function hideSkin(lists) {
  const w = W;
  if (!w || !w.cover) return;
  const now = new Set(w.cover.covered(lists));
  const packed = w.mesh.packedSplats;
  if (!packed) return;
  let touched = false;
  for (const [i, op] of w.hidden) {
    if (now.has(i)) continue;
    const s = packed.getSplat(i);
    packed.setSplat(i, s.center, s.scales, s.quaternion, op, s.color);
    w.hidden.delete(i);
    touched = true;
  }
  for (const i of now) {
    if (w.hidden.has(i)) continue;
    const s = packed.getSplat(i);
    w.hidden.set(i, s.opacity);
    packed.setSplat(i, s.center, s.scales, s.quaternion, 0, s.color);
    touched = true;
  }
  // the packed splats are read again only when the mesh rebuilds its generator
  if (touched) { packed.needsUpdate = true; w.mesh.updateGenerator(); }
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

// the item's splats take the body's skin weights where they are, so they move with the body
function skin(mesh, s, w) {
  const nb = w.rig.joints.length;
  const skinning = new SplatSkinning({ mesh, numSplats: s.n, numBones: nb });
  const bones = new Uint8Array(4), weights = new Uint8Array(4), vb = new THREE.Vector4(), vw = new THREE.Vector4();
  for (let i = 0; i < s.n; i++) {
    w.weights.at(s.centres[i * 3], s.centres[i * 3 + 1], s.centres[i * 3 + 2], bones, weights);
    vb.set(bones[0], bones[1], bones[2], bones[3]);
    vw.set(weights[0] / 255, weights[1] / 255, weights[2] / 255, weights[3] / 255);
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

// ---------------------------------------------------------------- for the tattoo panel, tests and scripts
window.wardrobe = {
  ready: false,
  items: () => catalog,
  wear: (id) => wear(id),
  worn: () => (W ? SLOTS.map((s) => W.worn.get(s)?.id).filter(Boolean) : []),
  splats: (id) => [...(W ? W.worn.values() : [])].find((e) => e.id === id)?.n || 0,
  hidden: () => (W ? W.hidden.size : 0),
  // whether a point of the body (at rest, PLY coordinates) is under something worn
  covers(p) {
    if (!W || !W.cover || !W.worn.size) return false;
    const c = W.centres;
    let best = -1, bd = Infinity;
    for (let i = 0; i < c.length / 3; i += 1) {
      const d = (c[i * 3] - p[0]) ** 2 + (c[i * 3 + 1] - p[1]) ** 2 + (c[i * 3 + 2] - p[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best >= 0 && W.hidden.has(best);
  },
};
