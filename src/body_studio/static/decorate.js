// Decor in a scanned room: the Decor panel (shown while a room is round the body), the things in it
// drawn as plain three.js meshes (so Spark sorts no extra splats), dragged along the floor, turned,
// repeated in rows and round tables, kept per room in layouts (GET/POST /api/decor/layout). Things
// come from the starters (decor.js draws them) or are made from a photo on this computer (POST
// /api/decor/photo, decor.py and photo3d.py). The maths is decor.js's; the room is house.js's.
import * as THREE from "three";
import { COLOURS, STARTERS, around, blocker, dropY, freeSpot, itemDef, mapMatrix, row, seats, starterShape, unpack, wrap } from "/static/decor.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const V = app.viewer;
const isPhone = () => innerWidth <= 600;

let items = [];             // the inventory (GET /api/decor)
let room = null;            // the room's file while one is shown
let L = null;               // its layouts: { current, layouts: [{ name, items: [{ item, x, y, z, turn, colour }] }] }
let sel = -1;               // the placed thing picked (its index in the layout)
let group = null;           // the meshes, in the map's metres (the group's matrix puts them round the body)
const meshes = new Map();   // made item id -> its unpacked mesh (or the promise of it)
const geoms = new Map();    // "id|colour" -> BufferGeometry
let saveTimer = 0, pollTimer = 0, pendingPhoto = null, drag = null;

const placed = () => (L ? L.layouts[L.current].items : []);
const itemOf = (id) => items.find((i) => i.id === id) || (STARTERS[id] ? { id } : null);
const nameOf = (it) => (it.kind === "photo" ? it.name : t("decor.item." + it.id));
function defs(id) {
  const it = itemOf(id);
  if (!it) return null;
  const m = meshes.get(id);
  return itemDef(it, m && !m.then ? m.packed : null);
}
const H = () => window.house;

// ---------------------------------------------------------------- the panel
function setOpen(open) {
  $("decor").hidden = !open;
  $("decorBtn").setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("with-panel", open || !$("progress").hidden);
  if (open) {
    if (!$("progress").hidden) $("closeProgress").click();
    dispatchEvent(new CustomEvent("panelopen", { detail: "decor" }));
    V.controls.autoRotate = false;
    refreshItems();
  }
  draw();
  app.reframe();
}
$("decorBtn").onclick = () => setOpen($("decor").hidden);
$("closeDecor").onclick = () => setOpen(false);
$("progressBtn").addEventListener("click", () => { if (!$("decor").hidden) setOpen(false); });
addEventListener("panelopen", (e) => { if (e.detail !== "decor" && isPhone() && !$("decor").hidden) setOpen(false); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("decor").hidden && !$("guide").open) { if (sel >= 0) pick(-1); else setOpen(false); } });
function say(text) { $("decorStatus").textContent = text || ""; }

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "failed"), { code: d.code });
  return d;
}
const errText = (e) => (t("decor.err." + e.code) !== "decor.err." + e.code ? t("decor.err." + e.code) : e.message);

async function refreshItems() {
  try { items = await api("/api/decor"); } catch { return; }
  inventory();
  clearTimeout(pollTimer);
  if (items.some((i) => i.status === "working")) pollTimer = setTimeout(refreshItems, 3000);
  // a thing made since the room was put round the body: drawn now
  if (placed().some((p) => !STARTERS[p.item] && !meshes.has(p.item))) draw();
}

function inventory() {
  $("decorItems").replaceChildren(...items.map((it) => {
    const b = document.createElement("button");
    b.dataset.item = it.id;
    if (it.kind === "photo") {
      const img = document.createElement("img");
      img.src = `/api/decor/${it.id}/photo`; img.alt = "";
      b.append(img);
    }
    b.append(document.createTextNode(nameOf(it)));
    if (it.status === "working") { b.disabled = true; b.title = t("decor.making", { name: it.name }); b.classList.add("busy"); }
    else if (it.status === "failed") {
      b.classList.add("failed");
      b.title = t("decor.failed", { name: it.name, error: errText({ code: it.code, message: it.error }) });
    }
    b.onclick = () => (it.status === "failed" ? retry(it) : add(it.id));
    return b;
  }));
  const working = items.filter((i) => i.status === "working"), failed = items.filter((i) => i.status === "failed");
  say(working.length ? t("decor.making", { name: working.map((i) => i.name).join(", ") })
      : failed.length ? t("decor.failed", { name: failed[0].name, error: errText({ code: failed[0].code, message: failed[0].error }) }) : "");
}

async function retry(it) {
  try { await api(`/api/decor/${it.id}/retry`, { method: "POST" }); } catch (e) { say(errText(e)); }
  refreshItems();
}

// a photo: its name and real height asked for, then sent to be made
$("decorPick").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  pendingPhoto = f;
  $("decorForm").hidden = false;
  $("decorForm").elements.label.value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 40);
  $("decorForm").elements.height.value = "";
  $("decorForm").elements.height.focus();
};
$("decorCancel").onclick = () => { pendingPhoto = null; $("decorForm").hidden = true; };
$("decorForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = pendingPhoto, form = $("decorForm");
  if (!f) return;
  const cm = +form.elements.height.value;
  const q = new URLSearchParams({ name: f.name, label: form.elements.label.value, height: String(cm / 100) });
  form.querySelector(".err").textContent = "";
  try {
    await api("/api/decor/photo?" + q, { method: "POST", body: f });
  } catch (err) { form.querySelector(".err").textContent = errText(err); return; }
  pendingPhoto = null; form.hidden = true;
  refreshItems();
};

// ---------------------------------------------------------------- layouts
function layoutsUI() {
  const s = $("decorLayout");
  s.replaceChildren(...(L ? L.layouts : []).map((l, k) => {
    const o = document.createElement("option");
    o.value = String(k); o.textContent = l.name;
    return o;
  }));
  if (L) s.value = String(L.current);
  $("decorDelete").disabled = !L || L.layouts.length < 2;
  $("decorCount").textContent = L ? t("decor.countThings", { n: placed().length }) : "";
}
$("decorLayout").onchange = (e) => { L.current = +e.target.value; pick(-1); changed(); };
function newLayout(items) {
  let n = L.layouts.length + 1;
  while (L.layouts.some((l) => l.name === t("decor.layoutName", { n }))) n++;
  L.layouts.push({ name: t("decor.layoutName", { n }), items });
  L.current = L.layouts.length - 1;
  pick(-1); changed();
}
$("decorNew").onclick = () => newLayout([]);
$("decorCopy").onclick = () => newLayout(placed().map((p) => ({ ...p })));
$("decorDelete").onclick = () => {
  if (L.layouts.length < 2) return;
  L.layouts.splice(L.current, 1);
  L.current = Math.max(0, L.current - 1);
  pick(-1); changed();
};

// every change: drawn, the walk told, saved a moment later
function changed() {
  layoutsUI();
  draw();
  saveSoon();
}
function saveSoon() {
  clearTimeout(saveTimer);
  const file = room, body = JSON.stringify(L);
  saveTimer = setTimeout(async () => {
    window.decor.saving = true;
    try { await api("/api/decor/layout?room=" + encodeURIComponent(file), { method: "POST", body }); }
    catch (e) { say(errText(e)); }
    window.decor.saving = false;
  }, 300);
  window.decor.saving = true;
}

// ---------------------------------------------------------------- adding and changing things
const roomTop = (x, z) => { const m = H().map(); return m ? m.topAt(x, z) : 0; };

// A new thing goes on the floor where the camera sees it, beside the body (or on the table there,
// for flowers), turned to face the camera; with no floor in view, a step ahead of the body.
function landing(d) {
  const cover = $("decor").hidden ? 0 : $("decor").getBoundingClientRect().width;
  const w = window.tattooStudio.walker(), P = H().placement(), at = H().where();
  let spot = null;
  for (const [fx, fy] of [[0.3, 0.72], [0.7, 0.72], [0.3, 0.6], [0.5, 0.82]]) {
    const xy = floorAt({ clientX: fx * (innerWidth - cover), clientY: fy * innerHeight }, 0);
    if (xy && Math.hypot(xy[0] - at[0], xy[1] - at[1]) < 6) { spot = xy; break; }
  }
  if (!spot) {
    const face = P.wayToMap(w.facing()), n = Math.hypot(face[0], face[1]) || 1;
    const reach = 0.9 + (d.size.r !== undefined ? d.size.r : d.size.d / 2);
    spot = [at[0] + face[0] / n * reach, at[1] + face[1] / n * reach];
  }
  const [x, z] = freeSpot(d, placed(), defs, spot[0], spot[1], (px, pz) => H().map().free(px, pz));
  group.updateMatrixWorld(true);
  const eye = group.worldToLocal(V.camera.position.clone());
  return { x, z, turn: wrap(Math.atan2(eye.x - x, eye.z - z)) };
}

async function add(id) {
  if (!L || !H().shown() || !group) return;
  const it = itemOf(id);
  if (!it) return;
  if (it.kind === "photo") await meshFor(id);
  const d = defs(id), { x, z, turn } = landing(d);
  const p = { item: id, x, y: 0, z, turn };
  p.y = dropY(d, placed(), defs, x, z, roomTop);
  if (d.starter && STARTERS[id].colour) p.colour = STARTERS[id].colour;
  placed().push(p);
  pick(placed().length - 1);
  changed();
}

function pick(k) {
  sel = k;
  const p = placed()[k];
  $("decorEdit").hidden = !p;
  if (p) {
    const it = itemOf(p.item), d = defs(p.item);
    $("decorName").textContent = nameOf(it);
    $("decorTurn").value = String(Math.round(((p.turn * 180 / Math.PI) % 360 + 540) % 360 - 180));
    $("decorTurnOut").textContent = $("decorTurn").value + "°";
    $("decorColours").hidden = !d.starter;
    for (const b of $("decorColours").children) b.classList.toggle("on", b.dataset.colour === (p.colour || STARTERS[p.item]?.colour));
    $("decorAround").hidden = !(d.top !== undefined && d.size && p.item.endsWith("table"));
    $("decorHeightRow").hidden = d.starter;
    if (!d.starter) $("decorHeight").value = String(Math.round(it.height * 100));
    $("decorForget").hidden = d.starter;
  }
  draw();
}

function colourChips() {
  $("decorColours").replaceChildren(...Object.keys(COLOURS).map((c) => {
    const b = document.createElement("button");
    b.dataset.colour = c; b.title = t("decor.colour." + c);
    b.setAttribute("aria-label", t("decor.colour." + c));
    b.style.setProperty("--swatch", "#" + new THREE.Color(...COLOURS[c]).getHexString());
    b.onclick = () => { const p = placed()[sel]; if (!p) return; p.colour = c; pick(sel); changed(); };
    return b;
  }));
}
colourChips();

$("decorTurn").oninput = (e) => {
  const p = placed()[sel];
  if (!p) return;
  p.turn = +e.target.value * Math.PI / 180;
  $("decorTurnOut").textContent = e.target.value + "°";
  changed();
};
$("decorHeight").onchange = async (e) => {
  const p = placed()[sel];
  if (!p) return;
  try {
    const it = await api("/api/decor/" + p.item, { method: "POST", body: JSON.stringify({ height: +e.target.value / 100 }) });
    items = items.map((i) => (i.id === it.id ? { ...i, ...it } : i));
  } catch (err) { say(errText(err)); }
  pick(sel); changed();
};
$("decorRow").onclick = () => {
  const p = placed()[sel], n = +$("decorRowN").value;
  if (!p) return;
  for (const q of row(defs(p.item), p, n)) { q.y = dropY(defs(p.item), placed(), defs, q.x, q.z, roomTop); placed().push(q); }
  changed();
};
$("decorAround").onclick = () => {
  const p = placed()[sel], n = +$("decorRowN").value;
  if (!p) return;
  for (const c of around(defs(p.item), p, defs("chair"), n, STARTERS.chair.colour)) placed().push(c);
  changed();
};
function removeSel() {
  if (sel < 0) return;
  placed().splice(sel, 1);
  pick(-1); changed();
}
$("decorRemove").onclick = removeSel;
$("decorForget").onclick = async () => {
  const p = placed()[sel];
  if (!p) return;
  const id = p.item;
  try { await api("/api/decor/" + id, { method: "DELETE" }); } catch (e) { say(errText(e)); return; }
  for (const l of L.layouts) l.items = l.items.filter((q) => q.item !== id);
  meshes.delete(id);
  pick(-1); changed(); refreshItems();
};
addEventListener("keydown", (e) => {
  if (sel < 0 || $("decor").hidden || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
  else if (e.key === "[" || e.key === "]") {
    const p = placed()[sel];
    p.turn = wrap(p.turn + (e.key === "]" ? 1 : -1) * Math.PI / 12);
    pick(sel); changed();
  }
});

// ---------------------------------------------------------------- drawing
function geometry(s) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(s.p instanceof Float32Array ? s.p : new Float32Array(s.p), 3));
  g.setAttribute("color", new THREE.BufferAttribute(s.c instanceof Float32Array ? s.c : new Float32Array(s.c), 3));
  g.setIndex(new THREE.BufferAttribute(s.i instanceof Uint32Array ? s.i : new Uint32Array(s.i), 1));
  g.computeVertexNormals();
  return g;
}
function meshFor(id) {
  if (!meshes.has(id))
    meshes.set(id, fetch(`/api/decor/${id}/mesh`).then((r) => (r.ok ? r.json() : null)).then((m) => {
      const out = m && { packed: m, shape: unpack(m) };
      if (out) meshes.set(id, out); else meshes.delete(id);
      return out;
    }).catch(() => { meshes.delete(id); return null; }));
  const m = meshes.get(id);
  return m && m.then ? m : Promise.resolve(m);
}
function geomFor(p) {
  const key = p.item + "|" + (p.colour || "");
  if (geoms.has(key)) return geoms.get(key);
  let g = null;
  if (STARTERS[p.item]) g = geometry(starterShape(p.item, p.colour));
  else {
    const m = meshes.get(p.item);
    if (!m) { meshFor(p.item).then((x) => x && draw()); return null; }
    if (m.then) return null;
    g = geometry(m.shape);
  }
  geoms.set(key, g);
  return g;
}

const LOOK = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const PICKED = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2f6fd6, emissiveIntensity: 0.35 });

function draw() {
  if (!group) return;
  for (const c of [...group.children]) if (c.isMesh) group.remove(c);
  placed().forEach((p, k) => {
    const g = geomFor(p);
    if (!g) return;
    const d = defs(p.item);
    const m = new THREE.Mesh(g, k === sel && !$("decor").hidden ? PICKED : LOOK);
    m.position.set(p.x, p.y || 0, p.z);
    m.rotation.y = p.turn || 0;
    if (!d.starter) m.scale.setScalar(d.height);
    m.userData.index = k;
    group.add(m);
  });
  const map = H()?.map();
  if (map) map.setDecor(blocker(placed(), defs), seats(placed(), defs));
}

function show() {
  hide();
  group = new THREE.Group();
  group.matrixAutoUpdate = false;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8178, 2.2);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 5, 3);
  group.add(hemi, sun, sun.target);
  V.holder.add(group);
  draw();
}
function hide() {
  if (group) { V.holder.remove(group); group = null; }
}

// the group follows the room round the body (it moves when the room is resized or put round it again)
V.frameHooks.push((before) => {
  if (!before || !group) return;
  const P = H()?.placement();
  if (!P) return;
  group.matrix.fromArray(mapMatrix(P));
  group.matrixWorldNeedsUpdate = true;
});

// ---------------------------------------------------------------- dragging along the floor
const ray = new THREE.Raycaster();
function hit(e) {
  const r = V.canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), V.camera);
  const h = ray.intersectObjects(group.children.filter((c) => c.isMesh), false)[0];
  return h ? h.object.userData.index : -1;
}
function floorAt(e, y) {
  const r = V.canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), V.camera);
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const o = ray.ray.origin.clone().applyMatrix4(inv), d = ray.ray.direction.clone().transformDirection(inv);
  if (Math.abs(d.y) < 1e-6) return null;
  const s = (y - o.y) / d.y;
  return s > 0 ? [o.x + d.x * s, o.z + d.z * s] : null;
}
addEventListener("pointerdown", (e) => {
  if (!group || $("decor").hidden || e.target !== V.canvas || e.button !== 0) return;
  const k = hit(e);
  if (k < 0) return;                            // the camera turns as usual
  pick(k);
  const p = placed()[k], at = floorAt(e, p.y || 0);
  drag = { k, off: at ? [p.x - at[0], p.z - at[1]] : [0, 0], y: p.y || 0 };
  e.stopImmediatePropagation(); e.preventDefault();
  V.controls.enabled = false;
  V.canvas.setPointerCapture?.(e.pointerId);
}, { capture: true });
addEventListener("pointermove", (e) => {
  if (!drag) return;
  e.stopImmediatePropagation();
  const at = floorAt(e, drag.y), p = placed()[drag.k];
  if (!at || !p) return;
  p.x = at[0] + drag.off[0]; p.z = at[1] + drag.off[1];
  p.y = dropY(defs(p.item), placed(), defs, p.x, p.z, roomTop, p);
  const m = group.children.find((c) => c.userData.index === drag.k);
  if (m) m.position.set(p.x, p.y, p.z);
}, { capture: true });
function up() {
  if (!drag) return;
  drag = null;
  V.controls.enabled = true;
  changed();
}
addEventListener("pointerup", up, { capture: true });
addEventListener("pointercancel", up, { capture: true });

// ---------------------------------------------------------------- the room coming and going
addEventListener("roomchange", async () => {
  const file = H()?.shown() ? H().file() : null;
  $("decorBtn").hidden = !file;
  if (!file) { room = null; L = null; sel = -1; hide(); if (!$("decor").hidden) setOpen(false); return; }
  if (file === room && group) { draw(); return; }
  room = file; sel = -1;
  try { L = await api("/api/decor/layout?room=" + encodeURIComponent(file)); } catch { L = { current: 0, layouts: [{ name: t("decor.layoutName", { n: 1 }), items: [] }] }; }
  if (room !== file) return;
  await refreshItems();
  await Promise.all([...new Set(placed().map((p) => p.item))].filter((id) => !STARTERS[id] && itemOf(id)?.status === "ready").map(meshFor));
  if (room !== file) return;
  show();
  layoutsUI();
  pick(-1);
  dispatchEvent(new Event("decorready"));
});
addEventListener("langchange", () => { inventory(); colourChips(); if (L) { layoutsUI(); pick(sel); } });

// ---------------------------------------------------------------- for tests and scripts
window.decor = {
  saving: false,
  items: () => items,
  placed: () => placed().map((p) => ({ ...p })),
  layouts: () => L && JSON.parse(JSON.stringify(L)),
  add,
  pick,
  selected: () => sel,
  open: () => setOpen(true),
  drawn: () => (group ? group.children.filter((c) => c.isMesh).length : 0),
  group: () => group,
  move: (k, x, z) => { const p = placed()[k]; p.x = x; p.z = z; p.y = dropY(defs(p.item), placed(), defs, x, z, roomTop, p); changed(); },
  refresh: refreshItems,
};
