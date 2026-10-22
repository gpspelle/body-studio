// Decor in a scanned room: the Decor panel (shown while a room is round the body; the body's own
// panel steps aside while it is open), the things in it drawn as plain three.js meshes (so Spark
// sorts no extra splats), listed under "In the room", dragged along the floor, turned and raised by
// handles on the picked one, repeated in rows and round tables, kept per room in layouts (GET/POST /api/decor/layout). Things
// come from the starters (decor.js draws them) or are made from a photo on this computer (POST
// /api/decor/photo, decor.py and photo3d.py). The maths is decor.js's; the room is house.js's.
import * as THREE from "three";
import { COLOURS, GROUPS, MAX_LIFT, STARTERS, around, blocker, clampLift, freeSpot, handles, heightOnRay, itemDef, listing, mapMatrix, row, seats,
         setTable, standY, starterShape, turnToward, unpack, wrap } from "/static/decor.js";

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
// the inventory's group shown (decor.js GROUPS, or "mine": the things made from photos), kept for next time
let shelf = (() => { try { return localStorage.getItem("decor.group"); } catch { return null; } })() || GROUPS[0];

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
// one panel at a time with the body's (Try on): decorating and dressing are two different moments
addEventListener("panelopen", (e) => { if (e.detail !== "decor" && (isPhone() || e.detail === "studio") && !$("decor").hidden) setOpen(false); });

// the tabs: things to add, and what is in the room
let tab = "add";
function setTab(which) {
  tab = which;
  $("decorAddTab").setAttribute("aria-selected", String(which === "add"));
  $("decorRoomTab").setAttribute("aria-selected", String(which === "room"));
  $("decorAdd").hidden = which !== "add";
  $("decorRoom").hidden = which !== "room";
  if (which === "room") list();
}
$("decorAddTab").onclick = () => setTab("add");
$("decorRoomTab").onclick = () => setTab("room");
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
  const mine = items.some((i) => i.kind === "photo"), groups = mine ? [...GROUPS, "mine"] : GROUPS;
  if (!groups.includes(shelf)) shelf = GROUPS[0];
  $("decorGroups").replaceChildren(...groups.map((g) => {
    const b = document.createElement("button");
    b.dataset.group = g; b.textContent = t("decor.group." + g);
    b.setAttribute("aria-pressed", String(g === shelf)); b.classList.toggle("on", g === shelf);
    b.onclick = () => { shelf = g; try { localStorage.setItem("decor.group", g); } catch {} inventory(); };
    return b;
  }));
  const shown = items.filter((it) => (it.kind === "photo" ? shelf === "mine" : STARTERS[it.id]?.group === shelf));
  $("decorItems").replaceChildren(...shown.map((it) => {
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
  $("decorRoomTab").textContent = t("decor.tabRoom", { n: L ? placed().length : 0 });
  if (tab === "room") list();
}

// what is in the room, by kind: tap a line to pick it, x to take it away
function list() {
  const rows = listing(placed(), (id) => nameOf(itemOf(id) || { id }), (id) => STARTERS[id]?.group || "mine");
  const out = [];
  let g = null;
  for (const r of rows) {
    if (r.group !== g) {
      g = r.group;
      const h = document.createElement("li");
      h.className = "group"; h.textContent = t("decor.group." + g);
      out.push(h);
    }
    const li = document.createElement("li"), b = document.createElement("button"), x = document.createElement("button");
    li.dataset.index = String(r.k);
    li.classList.toggle("on", r.k === sel);
    b.className = "name"; b.textContent = r.name;
    b.onclick = () => pick(r.k);
    x.className = "x"; x.textContent = "✕";
    x.setAttribute("aria-label", t("decor.removeOne", { name: r.name }));
    x.onclick = () => { placed().splice(r.k, 1); pick(-1); changed(); };
    li.append(b, x);
    out.push(li);
  }
  $("decorList").replaceChildren(...out);
  $("decorEmpty").hidden = rows.length > 0;
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
  if (it.kind === "photo" && shelf !== "mine") { shelf = "mine"; inventory(); }
  const d = defs(id), { x, z, turn } = landing(d);
  const p = { item: id, x, y: 0, z, turn };
  p.y = standY(d, placed(), defs, p, roomTop);
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
    $("decorLift").value = String(Math.round((p.lift || 0) * 100));
    $("decorLiftOut").textContent = $("decorLift").value + " cm";
    $("decorColours").hidden = !d.starter;
    for (const b of $("decorColours").children) b.classList.toggle("on", b.dataset.colour === (p.colour || STARTERS[p.item]?.colour));
    const table = d.top !== undefined && d.size && p.item.endsWith("table");
    $("decorAround").hidden = !table;
    $("decorSet").hidden = !table;
    $("decorHeightRow").hidden = d.starter;
    if (!d.starter) $("decorHeight").value = String(Math.round(it.height * 100));
    $("decorForget").hidden = d.starter;
  }
  for (const li of $("decorList").children) li.classList.toggle("on", li.dataset.index === String(k));
  draw();
}
$("decorDone").onclick = () => pick(-1);
$("decorLift").max = String(MAX_LIFT * 100);
$("decorLift").oninput = (e) => {
  const p = placed()[sel];
  if (!p) return;
  p.lift = clampLift(+e.target.value / 100);
  if (!p.lift) delete p.lift;
  p.y = standY(defs(p.item), placed(), defs, p, roomTop);
  $("decorLiftOut").textContent = e.target.value + " cm";
  changed();
};

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
  for (const q of row(defs(p.item), p, n)) { q.y = standY(defs(p.item), placed(), defs, q, roomTop); placed().push(q); }
  changed();
};
$("decorAround").onclick = () => {
  const p = placed()[sel], n = +$("decorRowN").value;
  if (!p) return;
  // the chairs already chosen for this layout (the last one put down), else the plain chair
  const last = [...placed()].reverse().find((q) => STARTERS[q.item]?.group === "tables" && STARTERS[q.item].seat);
  const chair = last ? last.item : "chair", colour = last ? last.colour || STARTERS[chair].colour : STARTERS.chair.colour;
  for (const c of around(defs(p.item), p, defs(chair), n, colour)) placed().push(c);
  changed();
};
// a place setting in front of every chair at the table, in the colour of the last one put down
$("decorSet").onclick = () => {
  const p = placed()[sel];
  if (!p) return;
  const last = [...placed()].reverse().find((q) => q.item === "place_setting");
  const set = setTable(defs(p.item), p, placed(), defs);
  for (const q of set) { if (last && last.colour) q.colour = last.colour; placed().push(q); }
  say(set.length ? "" : t("decor.noChairs"));
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
  // the triangles that glow (bulbs, flames) after the rest, drawn with the second material
  const tris = s.i instanceof Uint32Array ? s.i : new Uint32Array(s.i), idx = new Uint32Array(tris.length);
  let lo = 0, hi = tris.length;
  for (let k = 0; k < tris.length; k += 3) {
    const glow = s.g && s.g[tris[k]] && s.g[tris[k + 1]] && s.g[tris[k + 2]];
    if (glow) { hi -= 3; idx.set(tris.subarray(k, k + 3), hi); } else { idx.set(tris.subarray(k, k + 3), lo); lo += 3; }
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.addGroup(0, lo, 0);
  if (lo < idx.length) g.addGroup(lo, idx.length - lo, 1);
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
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });

function draw() {
  if (!group) return;
  for (const c of [...group.children]) if (c.isMesh) group.remove(c);
  placed().forEach((p, k) => {
    const g = geomFor(p);
    if (!g) return;
    const d = defs(p.item);
    const m = new THREE.Mesh(g, [k === sel && !$("decor").hidden ? PICKED : LOOK, GLOW]);
    m.position.set(p.x, p.y || 0, p.z);
    m.rotation.y = p.turn || 0;
    if (!d.starter) m.scale.setScalar(d.height);
    m.userData.index = k;
    group.add(m);
  });
  placeGizmo();
  const map = H()?.map();
  if (map) map.setDecor(blocker(placed(), defs), seats(placed(), defs));
}

// ---------------------------------------------------------------- the handles on the picked thing
// A ring on the floor round it with a knob where its front faces (drag: turn it, in 15° steps,
// Shift for any angle) and a knob on a stalk over it (drag: raise or lower it), drawn over
// everything so they are never hidden by the thing. Each knob has a bigger, unseen ball round it
// to grab.
let gizmo = null;
const HANDLE = new THREE.MeshBasicMaterial({ color: 0x2f6fd6, depthTest: false, transparent: true, opacity: 0.9, toneMapped: false });
const GRAB = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
function makeGizmo() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 64), HANDLE);
  ring.rotation.x = Math.PI / 2; ring.name = "ring";
  const knob = (name) => {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), HANDLE);
    k.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), GRAB), { name: name + "Grab" }));
    k.name = name;
    return k;
  };
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), HANDLE);
  stalk.name = "stalk";
  g.add(ring, knob("turn"), knob("lift"), stalk);
  g.traverse((o) => { o.renderOrder = 10; o.userData.handle = o.name.replace("Grab", ""); });
  return g;
}
function placeGizmo() {
  if (!group) return;
  if (!gizmo) gizmo = makeGizmo();
  if (gizmo.parent !== group) group.add(gizmo);
  const p = placed()[sel];
  gizmo.visible = !!p && !$("decor").hidden;
  if (!gizmo.visible) return;
  const h = handles(defs(p.item), p), ring = gizmo.getObjectByName("ring"), stalk = gizmo.getObjectByName("stalk");
  ring.scale.setScalar(h.ring.r); ring.position.set(p.x, h.ring.y, p.z);
  gizmo.getObjectByName("turn").position.set(...h.turn);
  gizmo.getObjectByName("lift").position.set(...h.lift);
  const low = (p.y || 0) + Math.min(defs(p.item).height, 3);
  stalk.scale.y = Math.max(0.01, h.lift[1] - low); stalk.position.set(p.x, (low + h.lift[1]) / 2, p.z);
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
function aim(e) {
  const r = V.canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), V.camera);
}
function hit(e) {
  aim(e);
  const h = ray.intersectObjects(group.children.filter((c) => c.isMesh), false)[0];
  return h ? h.object.userData.index : -1;
}
// the handle under the pointer: "turn" (the ring or its knob), "lift", or null
function handleAt(e) {
  if (!gizmo || !gizmo.visible) return null;
  aim(e);
  const h = ray.intersectObject(gizmo, true)[0];
  return h ? (h.object.userData.handle === "ring" ? "turn" : h.object.userData.handle) : null;
}
// the pointer's ray in the map's metres
function rayInMap(e) {
  aim(e);
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  return [ray.ray.origin.clone().applyMatrix4(inv).toArray(), ray.ray.direction.clone().transformDirection(inv).toArray()];
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
  const handle = handleAt(e);
  if (handle) {
    const p = placed()[sel], base = (p.y || 0) - (p.lift || 0);
    const [o, d] = rayInMap(e), y = heightOnRay(p, o, d);
    drag = { k: sel, handle, base, off: y === null ? 0 : y - (p.lift || 0) };
    e.stopImmediatePropagation(); e.preventDefault();
    V.controls.enabled = false;
    V.canvas.setPointerCapture?.(e.pointerId);
    return;
  }
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
  if (drag.handle) {
    const p = placed()[drag.k];
    if (!p) return;
    if (drag.handle === "turn") {
      const at = floorAt(e, p.y || 0);
      if (at) p.turn = turnToward(p, at[0], at[1], e.shiftKey);
    } else {
      const [o, d] = rayInMap(e), y = heightOnRay(p, o, d);
      if (y !== null) { p.lift = clampLift(y - drag.off); p.y = drag.base + p.lift; }
    }
    const m = group.children.find((c) => c.userData.index === drag.k);
    if (m) { m.position.set(p.x, p.y, p.z); m.rotation.y = p.turn; }
    placeGizmo();
    return;
  }
  const at = floorAt(e, drag.y), p = placed()[drag.k];
  if (!at || !p) return;
  p.x = at[0] + drag.off[0]; p.z = at[1] + drag.off[1];
  p.y = standY(defs(p.item), placed(), defs, p, roomTop);
  const m = group.children.find((c) => c.userData.index === drag.k);
  if (m) m.position.set(p.x, p.y, p.z);
  placeGizmo();
}, { capture: true });
function up() {
  if (!drag) return;
  const p = placed()[drag.k];
  if (p && p.lift === 0) delete p.lift;
  const handle = drag.handle;
  drag = null;
  if (handle) pick(sel);
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
  move: (k, x, z) => { const p = placed()[k]; p.x = x; p.z = z; p.y = standY(defs(p.item), placed(), defs, p, roomTop); changed(); },
  tab: (which) => { if (which) setTab(which); return tab; },
  handles: () => (gizmo && gizmo.visible ? Object.fromEntries(["turn", "lift", "ring"].map((h) => {
    const m = gizmo.getObjectByName(h);
    const v = m.getWorldPosition(new THREE.Vector3()).project(V.camera);
    return [h, [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]];
  })) : null),
  refresh: refreshItems,
  shelf: (g) => { if (g) { shelf = g; inventory(); } return shelf; },
  glowing: () => (group ? group.children.filter((c) => c.isMesh && c.geometry.groups.length > 1).length : 0),
};
