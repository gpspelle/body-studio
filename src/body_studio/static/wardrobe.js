// Wardrobe: the Clothes section of the Try on panel (tattoo.js owns the panel, the skeleton and
// the pose). The body's base mesh is fitted once (fit.py, GET /api/fit); an item comes fitted to
// the body (GET /api/wardrobe/<id>), becomes splats (dress.js), is skinned with the body's own
// weights and moved by the same pose, and the body's splats under it are hidden while it is worn.
// One item per slot (clothes, shoes, hair, hat). The items are shown in a shop around the body (racks.js:
// a rail, a shoe rack, shelves and stands) while the panel is open; a click on one puts it on, and
// the panel lists what is worn. Design and sources: docs/wardrobe.md.
import * as THREE from "three";
import { SplatMesh, SplatSkinning } from "@sparkjsdev/spark";
import { SkinCover, decodeItem, f32, i32, fitNormals, fitSkin, hatOverHair, itemSplats, itemWeights, skinUnder } from "/static/dress.js";
import { dualQuats, skinPoint } from "/static/pose.js";
import { fold, hang, onHead, pair, shopLayout } from "/static/racks.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const V = window.bodyApp.viewer;
const SLOTS = ["outfit", "shoes", "hair", "hat"];
const SPACING = 0.0032;          // splat spacing on an item, fraction of the person's height (about 6 mm)
const REACH = 0.03;              // a body splat is under an item if its nearest skin vertex is (within this)
const HANG = 0.04;               // how far out from the skin an item still covers it (a skirt over the thighs)
const SCALP = 0.012;             // hair this close over the skin colours it (the scalp under the hair)
const HAT_GAP = 0.004;           // between the hair and the hat's crown, fraction of the height (7 mm)
const HAIR_SPACING = 0.7;        // hair cards are partly see-through: twice as many splats

let W = null;                    // the body being dressed: rig, weights, its mesh, what is worn…
let catalog = null;
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
  placeShop(W);
  if (await loadFit(W) && W.file === file) {
    for (const id of store.get("wear:" + file) || []) if (W && W.file === file) await wear(id, true);
  }
  if (W && W.file === file) window.wardrobe.ready = true;
});
addEventListener("studiogone", () => { undressAll(); W = null; showShop(); });
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

// ---------------------------------------------------------------- panel: what is worn
function ui() {
  const box = $("wearWorn");
  if (!W || !catalog) { box.replaceChildren(); return; }
  box.replaceChildren(...SLOTS.map((slot) => W.worn.get(slot)).filter(Boolean).map((e) => {
    const b = document.createElement("button");
    b.textContent = t("wear.item." + e.id) + " ✕";
    b.dataset.item = e.id;
    b.setAttribute("aria-label", t("wear.takeOff", { name: t("wear.item." + e.id) }));
    b.onclick = () => wear(e.id);
    return b;
  }));
  $("wearHint").textContent = t(W.fit ? "wear.hint" : "wear.wait");
  showShop();
}
addEventListener("langchange", ui);

// ---------------------------------------------------------------- wearing
async function wear(id, restoring = false) {
  const w = W, it = catalog && catalog.find((i) => i.id === id);
  if (!w || !w.fit || !it) return;
  const old = w.worn.get(it.slot);
  if (old && old.id === id && !restoring) { takeOff(it.slot); changed(); return rehat(it.slot); }
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
    // a hat goes over the hair worn, not through it
    let hatScale = 1;
    if (it.slot === "hat" && w.worn.get("hair")) ({ item: d, scale: hatScale } = hatOverHair(d, w.worn.get("hair").splats.centres, w.rig.frame, HAT_GAP * H));
    const s = itemSplats(d, tex, SPACING * H * (hair ? HAIR_SPACING : 1), w.rig.frame);
    const mesh = await splatMesh(s);
    if (W !== w) { mesh.dispose?.(); return; }
    const skinning = skin(mesh, s, w, d);
    takeOff(it.slot);
    const entry = { id, slot: it.slot, mesh, skinning, n: s.n, splats: s, nbr: neighbours(s, H),
                    grow: new Uint8Array(s.n).fill(GROW_STEPS), hatScale };
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
  await rehat(it.slot);
}

// when the hair changes, the hat is fitted again over the new hair
async function rehat(slot) {
  const hat = W && W.worn.get("hat");
  if (slot === "hair" && hat) await wear(hat.id, true);
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

// ---------------------------------------------------------------- the shop around the body
// Racks, shelves and the items on them are plain three.js meshes, not splats: they add nothing to
// what Spark sorts each frame (it already sorts the body and what it wears), and they stand apart
// from the body, so none of them cuts through its splats. Each item is shown as it is made (GET
// /api/wardrobe/<id>/shape, the same for every body), sized to the person, and hidden while worn.
const MATERIALS = { wood: 0xc8a57a, metal: 0x6b6f75, hanger: 0x8d6a45, back: 0xebe6dd, foam: 0xe6e2dc };
const SHAPE = { hang, fold, shoes: pair };
let shop = null;                 // {group, objects: Map id -> its group on the racks, pickable meshes}
let shopLoad = null;

function shopShape(V, kind, head) {
  return SHAPE[kind] ? SHAPE[kind](V) : onHead(V, head);
}

function itemGeometry(V, tris, tuv, uv) {
  // one vertex per (position, UV) pair: smooth normals, broken only where the UVs are
  const seen = new Map(), pos = [], uvs = [], index = [], nu = uv ? uv.length / 2 : 1;
  for (let c = 0; c < tris.length; c++) {
    const v = tris[c], u = tuv ? tuv[c] : 0, k = v * nu + u;
    let i = seen.get(k);
    if (i === undefined) {
      i = pos.length / 3;
      seen.set(k, i);
      pos.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]);
      uvs.push(uv ? uv[u * 2] : 0, uv ? uv[u * 2 + 1] : 0);
    }
    index.push(i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

async function loadShop() {
  const list = catalog || (catalog = await (await fetch("/api/wardrobe")).json());
  const head = await (await fetch("/api/mannequin")).json();
  const headV = f32(head.verts), headT = i32(head.tris);
  const mat = Object.fromEntries(Object.entries(MATERIALS).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c })]));
  const group = new THREE.Group();
  group.name = "shop";
  group.visible = false;
  group.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.6, 2, 1.5);
  group.add(sun);
  const { places, parts, half } = shopLayout(list);
  const up = new THREE.Vector3(0, 1, 0);
  for (const p of parts) {
    let m;
    if (p.kind === "box") {
      m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), mat[p.material]);
      m.position.set(...p.at);
    } else {
      const a = new THREE.Vector3(...p.at), b = new THREE.Vector3(...p.to), d = b.clone().sub(a);
      m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, d.length(), 10), mat[p.material]);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(up, d.normalize());
    }
    group.add(m);
  }
  const loader = new THREE.TextureLoader(), objects = new Map(), pickable = [];
  await Promise.all(list.map(async (it) => {
    const place = places[it.id];
    const d = await (await fetch(`/api/wardrobe/${it.id}/shape`)).json();
    const tex = await loader.loadAsync("/static/wardrobe/" + d.texture);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const V = f32(d.verts);
    const mesh = new THREE.Mesh(itemGeometry(shopShape(V, place.kind, headV), i32(d.tris), i32(d.tuv), f32(d.uv)),
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: d.alpha ? 0.5 : 0, transparent: false }));
    mesh.userData.item = it.id;
    const obj = new THREE.Group();
    obj.position.set(place.x, place.y, place.z);
    obj.rotation.x = place.tilt || 0;
    obj.add(mesh);
    if (["head", "stand", "hat"].includes(place.kind))                // the mannequin head it is shown on
      obj.add(new THREE.Mesh(itemGeometry(onHead(headV, headV), headT, null, null), mat.foam));
    group.add(obj);
    objects.set(it.id, obj);
    pickable.push(mesh);
  }));
  return { group, objects, pickable, half };
}

// The shop stands on the floor under the body as it was scanned, its racks behind it as the
// camera first sees it, sized to the person.
async function placeShop(w) {
  if (!shopLoad) shopLoad = loadShop().then((s) => { shop = s; V.scene.add(s.group); return s; });
  const s = await shopLoad;
  if (W !== w) return;
  V.holder.updateMatrixWorld(true);
  const C = w.centres, n = C.length / 3, step = Math.max(1, Math.floor(n / 20000)), p = new THREE.Vector3(), ys = [], xs = [], zs = [];
  for (let i = 0; i < n; i += step) {
    p.set(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]).applyMatrix4(V.holder.matrixWorld);
    xs.push(p.x); ys.push(p.y); zs.push(p.z);
  }
  const at = (a, q) => { a.sort((x, y) => x - y); return a[Math.floor(q * (a.length - 1))]; };
  s.group.position.set(at(xs, 0.5), at(ys, 0.003), at(zs, 0.5));
  s.group.scale.setScalar(w.rig.height);
  showShop();
  window.bodyApp.reframe();
}

// shown while the panel is open on a body, with what is worn taken off the racks
function showShop() {
  if (!shop) return;
  const on = !!W && !$("studio").hidden;
  shop.group.visible = on;
  for (const [id, obj] of shop.objects) obj.visible = !(W && [...W.worn.values()].some((e) => e.id === id));
  if (!on) tip(null);
}
// how wide a view the camera should take in (window.bodyApp.reframe): the shop, while shown (on a
// phone only the racks nearest the body, or the body would be too small to see; turn to see more)
window.bodyApp.room = () => (shop && W && !$("studio").hidden ? Math.min(2 * shop.half, innerWidth <= 600 ? 1.4 : 9) * W.rig.height : 0);
new MutationObserver(showShop).observe($("studio"), { attributes: true, attributeFilter: ["hidden"] });

// the item under the pointer (not one behind the body)
const ray = new THREE.Raycaster();
function shopItemAt(x, y, checkBody = true) {
  if (!shop || !shop.group.visible) return null;
  const r = V.canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), V.camera);
  const hit = ray.intersectObjects(shop.pickable.filter((m) => m.parent.visible), false)[0];
  if (!hit) return null;
  const body = checkBody && window.tattooStudio?.bodyDistance?.(x, y);
  return body && body < hit.distance ? null : hit.object.userData.item;
}

function tip(id, x, y) {
  const el = $("shopTip");
  if (!id) { el.hidden = true; V.canvas.style.cursor = ""; return; }
  el.textContent = t("wear.item." + id);
  el.style.left = x + 14 + "px"; el.style.top = y + 14 + "px";
  el.hidden = false;
  V.canvas.style.cursor = "pointer";
}

let press = null, hoverAt = null;
V.canvas.addEventListener("pointerdown", (e) => { press = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
V.canvas.addEventListener("pointerup", (e) => {
  const p = press;
  press = null;
  if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6 || performance.now() - p.t > 600) return;   // a drag turns the camera
  const id = shopItemAt(e.clientX, e.clientY);
  if (id && W && W.fit) { tip(null); wear(id); }
});
V.canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" || e.buttons) return;
  const first = !hoverAt;
  hoverAt = [e.clientX, e.clientY];
  if (first) requestAnimationFrame(() => { const [x, y] = hoverAt; hoverAt = null; tip(shopItemAt(x, y, false), x, y); });
});
V.canvas.addEventListener("pointerleave", () => tip(null));

// a point of the screen where a click picks the item (null: none in view), for tests and scripts
function onScreen(id) {
  const obj = shop && shop.objects.get(id);
  if (!obj || !shop.group.visible || !obj.visible) return null;
  const mesh = obj.children[0], P = mesh.geometry.attributes.position, p = new THREE.Vector3(), r = V.canvas.getBoundingClientRect();
  const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
  // its vertices from the middle out, until one is in view and in front of everything else
  const order = [...Array(P.count).keys()].filter((i) => i % 7 === 0)
    .map((i) => [i, p.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld).distanceToSquared(c)]).sort((a, b) => a[1] - b[1]);
  for (const [i] of order) {
    p.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld).lerp(c, 0.05).project(V.camera);
    if (Math.abs(p.x) > 0.98 || Math.abs(p.y) > 0.98 || p.z > 1) continue;
    const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height;
    if (document.elementFromPoint(x, y) === V.canvas && shopItemAt(x, y) === id) return { x, y };
  }
  return null;
}

// ---------------------------------------------------------------- for the tattoo panel, tests and scripts
window.wardrobe = {
  ready: false,
  items: () => catalog,
  wear: (id) => wear(id),
  worn: () => (W ? SLOTS.map((s) => W.worn.get(s)?.id).filter(Boolean) : []),
  // the shop: shown or not, how each item is displayed there, and where one is on the screen
  shop: () => (shop ? { shown: shop.group.visible, items: shop.objects.size,
                        racked: [...shop.objects].filter(([, o]) => o.visible).map(([id]) => id) } : null),
  onScreen,
  itemAt: (x, y) => shopItemAt(x, y),
  splats: (id) => [...(W ? W.worn.values() : [])].find((e) => e.id === id)?.n || 0,
  hidden: () => (W ? W.hidden.size : 0),
  // how much the hat was enlarged to go over the hair (1: no hair, or it fits as it is)
  hatScale: () => (W && W.worn.get("hat")?.hatScale) || 0,
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
