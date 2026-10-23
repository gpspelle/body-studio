// Decor in a scanned room: the Decor panel (shown while a room is round the body; the body's own
// panel steps aside while it is open), the things in it drawn as plain three.js meshes (so Spark
// sorts no extra splats), listed under "In the room", dragged along the floor, turned and raised by
// handles on the picked one, repeated in rows and round tables, kept per room in layouts (GET/POST /api/decor/layout). Things
// come from the starters (decor.js draws them) or are made from a photo on this computer (POST
// /api/decor/photo, decor.py and photo3d.py). The maths is decor.js's; the room is house.js's.
import * as THREE from "three";
import { geometry, materials, picture, shadow } from "/static/decorlook.js";
import { COLOURS, FINISHES, GROUPS, MAX_LIFT, STARTERS, around, blocker, clampLift, freeSpot, handles, heightOnRay, itemDef, listing, mapMatrix, row, seats,
         bounds, fromHex, fromRgb, hexOf, setTable, standY, starterShape, toHex, turnToward, unpack, wrap } from "/static/decor.js";

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
    pump();
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
  // a card each, its picture (the starters photographed as a shop does, decorlook.js) over its name
  $("decorItems").replaceChildren(...shown.map((it) => {
    const b = document.createElement("button");
    b.dataset.item = it.id;
    b.append(picFor(it.id, STARTERS[it.id]?.colour));
    const name = document.createElement("span");
    name.className = "name"; name.textContent = nameOf(it);
    b.append(name);
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

// ---------------------------------------------------------------- pictures
// "id|colour" -> a data URL; made one at a time, between frames, the first time one is wanted
const pics = new Map(), wanted = [];
let picking = false;
function picFor(id, colour) {
  const span = document.createElement("span");
  span.className = "pic";
  const it = itemOf(id);
  if (it && it.kind === "photo") { const img = new Image(); img.src = `/api/decor/${id}/photo`; img.alt = ""; span.append(img); return span; }
  const key = id + "|" + (colour || "");
  span.dataset.pic = key;
  const url = pics.get(key);
  if (url) { const img = new Image(); img.src = url; img.alt = ""; span.append(img); }
  else {
    // the ones just shown go first
    if (url === undefined) pics.set(key, null);
    const at = wanted.indexOf(key);
    if (at >= 0) wanted.splice(at, 1);
    if (url === undefined || at >= 0) { wanted.unshift(key); pump(); }
  }
  return span;
}
// made by a worker (decorpics.js) where the browser can; else here, between frames
// (a worker that doesn't answer within a few seconds, as when its graphics stall, is let go: the
// rest are made here)
let painter = null, flying = null, late = 0;
const PAINTER_MS = 15000;
function letGo() {
  painter?.terminate(); painter = null; clearTimeout(late);
  if (flying) wanted.unshift(flying);
  flying = null; picking = false; pump();
}
try {
  painter = new Worker("/static/decorpics.js", { type: "module" });
  painter.onmessage = ({ data: { key, blob } }) => shown(key, blob && URL.createObjectURL(blob));
  painter.onerror = (e) => { e.preventDefault(); letGo(); };
} catch { painter = null; }
function shown(key, url) {
  flying = null; clearTimeout(late);
  if (url) {
    pics.set(key, url);
    for (const el of document.querySelectorAll(`[data-pic="${key}"]`)) {
      const img = new Image(); img.src = url; img.alt = ""; el.replaceChildren(img);
    }
  }
  picking = false;
  pump();
}
function pump() {
  // (only while the panel is open: they are for it, and the room shouldn't wait for them)
  if (picking || !wanted.length || $("decor").hidden) return;
  picking = true;
  const key = wanted.shift(), [id, colour] = key.split("|");
  if (painter && STARTERS[id]) { flying = key; late = setTimeout(letGo, PAINTER_MS); painter.postMessage({ key, id, colour }); return; }
  requestAnimationFrame(() => setTimeout(() => {
    let url = null;
    try {
      const g = geomFor({ item: id, colour: colour || undefined });
      if (g) url = picture(g, bounds(g.attributes.position.array)).toDataURL("image/png");
    } catch (e) { console.warn("decor picture", id, e); }
    shown(key, url);
  }, 0));
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
    b.className = "name";
    const q = placed()[r.k];
    b.append(picFor(q.item, q.colour || STARTERS[q.item]?.colour), document.createTextNode(r.name));
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
    $("decorPic").replaceWith(Object.assign(picFor(p.item, p.colour || STARTERS[p.item]?.colour), { id: "decorPic" }));
    $("decorTurn").value = String(Math.round(((p.turn * 180 / Math.PI) % 360 + 540) % 360 - 180));
    $("decorTurnOut").textContent = $("decorTurn").value + "°";
    $("decorLift").value = String(Math.round((p.lift || 0) * 100));
    $("decorLiftOut").textContent = $("decorLift").value + " cm";
    $("decorColours").hidden = !d.starter;
    const colour = p.colour || STARTERS[p.item]?.colour, own = !!fromHex(colour);
    for (const b of $("decorColours").children) b.classList.toggle("on", own ? b.id === "decorOwn" : b.dataset.colour === colour);
    $("decorOwn").style.setProperty("--swatch", own ? colour : "");
    $("decorOwn").classList.toggle("set", own);
    if (!d.starter) $("decorMix").hidden = true;
    mixer();
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
  const named = Object.keys(COLOURS).map((c) => {
    const b = document.createElement("button");
    b.dataset.colour = c; b.title = t("decor.colour." + c);
    b.setAttribute("aria-label", t("decor.colour." + c));
    b.style.setProperty("--swatch", "#" + new THREE.Color(...COLOURS[c]).getHexString());
    b.onclick = () => { $("decorMix").hidden = true; setColour(c, true); };
    return b;
  });
  // your own colour: the mixer under the swatches (a colour wheel, HEX, RGB)
  const mine = document.createElement("button");
  mine.id = "decorOwn"; mine.className = "own"; mine.title = t("decor.own");
  mine.setAttribute("aria-label", t("decor.own")); mine.setAttribute("aria-expanded", "false");
  mine.onclick = () => { $("decorMix").hidden = !$("decorMix").hidden; mixer(); };
  $("decorColours").replaceChildren(...named, mine);
}
colourChips();

// the picked thing's colour: a name or "#rrggbb"; `done` once the choice is made (a swatch, the end
// of a drag on the wheel, Enter in a field), else it is only drawn
function setColour(c, done) {
  const p = placed()[sel];
  if (!p || !c) return;
  p.colour = c;
  if (done) { pick(sel); changed(); } else draw();
}
// the mixer shows the picked thing's colour
function mixer() {
  const p = placed()[sel];
  $("decorOwn").setAttribute("aria-expanded", String(!$("decorMix").hidden));
  if (!p) return;
  const hex = hexOf(p.colour, STARTERS[p.item]?.colour), rgb = fromHex(hex);
  $("decorWheel").value = hex;
  if (document.activeElement !== $("decorHex")) $("decorHex").value = hex;
  ["decorR", "decorG", "decorB"].forEach((id, k) => { if (document.activeElement !== $(id)) $(id).value = String(rgb[k]); });
  $("decorHex").classList.remove("bad");
}
$("decorWheel").oninput = (e) => { setColour(e.target.value, false); mixer(); };
$("decorWheel").onchange = (e) => { setColour(e.target.value, true); mixer(); };
$("decorHex").oninput = (e) => {
  const rgb = fromHex(e.target.value);
  e.target.classList.toggle("bad", !rgb && e.target.value.trim().length >= 4);
  if (rgb && e.target.value.replace("#", "").length === 6) { setColour(toHex(rgb), false); mixer(); }
};
$("decorHex").onchange = (e) => { const rgb = fromHex(e.target.value); if (rgb) setColour(toHex(rgb), true); mixer(); };
for (const id of ["decorR", "decorG", "decorB"]) {
  const now = () => toHex(["decorR", "decorG", "decorB"].map((k) => +$(k).value));
  $(id).oninput = () => { setColour(now(), false); mixer(); };
  $(id).onchange = () => { setColour(now(), true); mixer(); };
  // a whole "201, 164, 106" pasted in one field fills the three
  $(id).addEventListener("paste", (e) => {
    const rgb = fromRgb(e.clipboardData?.getData("text"));
    if (!rgb) return;
    e.preventDefault();
    ["decorR", "decorG", "decorB"].forEach((k, j) => { $(k).value = String(rgb[j]); });
    setColour(toHex(rgb), true); mixer();
  });
}

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
  // (colours of your own come and go as the wheel turns: only the last few are kept)
  if (fromHex(p.colour)) {
    mixed.push(key);
    while (mixed.length > 16) {
      const old = mixed.shift();
      if (mixed.includes(old) || placed().some((q) => q.item + "|" + q.colour === old)) continue;
      geoms.get(old)?.dispose(); geoms.delete(old);
    }
  }
  return g;
}
const mixed = [];

// one material per finish (decorlook.js), made once the renderer is there
let MATS = null;
const mats = () => (MATS ||= materials(V.renderer));
// the soft shadows, in their own group (not things to pick)
let shades = null;
const SHADE_PLANE = new THREE.PlaneGeometry(1, 1), SHADE = shadow();

function draw() {
  if (!group) return;
  for (const c of [...group.children]) if (c.isMesh) group.remove(c);
  if (!shades) { shades = new THREE.Group(); shades.userData.shades = true; }
  if (shades.parent !== group) group.add(shades);
  for (const c of [...shades.children]) shades.remove(c);
  placed().forEach((p, k) => {
    const g = geomFor(p);
    if (!g) return;
    const d = defs(p.item);
    const m = new THREE.Mesh(g, mats());
    m.position.set(p.x, p.y || 0, p.z);
    m.rotation.y = p.turn || 0;
    if (!d.starter) m.scale.setScalar(d.height);
    m.userData.index = k;
    group.add(m);
    // a soft shadow under what stands (not under what lies flat or hangs)
    if (d.height > 0.05 && !STARTERS[p.item]?.hangs) {
      const sh = new THREE.Mesh(SHADE_PLANE, SHADE), sz = d.size, w = sz.r !== undefined ? 2 * sz.r : sz.w, dd = sz.r !== undefined ? 2 * sz.r : sz.d;
      sh.rotation.set(-Math.PI / 2, p.turn || 0, 0, "YXZ");
      sh.position.set(p.x, (p.y || 0) - (p.lift || 0) + 0.004, p.z);
      sh.scale.set(w * 1.35, dd * 1.35, 1);
      sh.renderOrder = -1;
      shades.add(sh);
    }
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
// white with a soft dark edge, as the handles of a photo editor: seen on a pale floor and a dark one
const HANDLE = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
const EDGE = new THREE.MeshBasicMaterial({ color: 0x1c1c1a, depthTest: false, transparent: true, opacity: 0.45, toneMapped: false });
const GRAB = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
function makeGizmo() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 96), HANDLE);
  ring.add(Object.assign(new THREE.Mesh(new THREE.TorusGeometry(1, 0.011, 6, 96), EDGE), { name: "ringEdge", renderOrder: 9 }));
  ring.rotation.x = Math.PI / 2; ring.name = "ring";
  const knob = (name) => {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 14), HANDLE);
    k.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), EDGE), { name: name + "Edge", renderOrder: 9 }));
    k.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), GRAB), { name: name + "Grab" }));
    k.name = name;
    return k;
  };
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), HANDLE);
  stalk.name = "stalk";
  g.add(ring, knob("turn"), knob("lift"), stalk);
  g.traverse((o) => { if (!o.renderOrder) o.renderOrder = 10; o.userData.handle = o.name.replace(/Grab|Edge/, ""); });
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

// ---------------------------------------------------------------- the toolbar by the picked thing
// Over the room, just above the picked thing: turn it a step either way, duplicate it, take it
// away. It follows the thing on screen and keeps clear of the panel and the edges.
function placeBar() {
  const bar = $("decorBar"), p = placed()[sel];
  const show = !!(p && group && !$("decor").hidden && !drag);
  if (!show) { bar.hidden = true; return; }
  const top = new THREE.Vector3(...handles(defs(p.item), p).lift).add(new THREE.Vector3(0, 0.06, 0));
  group.updateMatrixWorld();
  const v = group.localToWorld(top).project(V.camera);
  if (v.z > 1) { bar.hidden = true; return; }
  bar.hidden = false;
  const w = bar.offsetWidth, h = bar.offsetHeight, right = innerWidth - ($("decor").getBoundingClientRect().width + 32);
  const x = Math.min(Math.max(12, (v.x + 1) / 2 * innerWidth - w / 2), right - w), y = Math.min(Math.max(64, (1 - v.y) / 2 * innerHeight - h - 14), innerHeight - h - 12);
  bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
const turnBy = (dir) => { const p = placed()[sel]; if (!p) return; p.turn = wrap(Math.round(p.turn / (Math.PI / 12)) * (Math.PI / 12) + dir * Math.PI / 12); pick(sel); changed(); };
$("barLeft").onclick = () => turnBy(1);
$("barRight").onclick = () => turnBy(-1);
$("barRemove").onclick = () => removeSel();
// a copy beside it (to its right, a hand's width apart), picked
$("barCopy").onclick = () => {
  const p = placed()[sel];
  if (!p) return;
  const q = row(defs(p.item), p, 2)[0];
  q.y = standY(defs(p.item), placed(), defs, q, roomTop);
  placed().push(q);
  pick(placed().length - 1); changed();
};
function barTitles() { for (const b of $("decorBar").querySelectorAll("button")) b.title = b.getAttribute("aria-label") || ""; }
barTitles();
V.frameHooks.push((before) => { if (!before) placeBar(); });

function show() {
  hide();
  group = new THREE.Group();
  group.matrixAutoUpdate = false;
  // the studio's reflections do most of the light (decorlook.js); a soft sky and a warm sun
  // give the shapes their shading
  const hemi = new THREE.HemisphereLight(0xfffaf2, 0x7d766e, 0.9);
  const sun = new THREE.DirectionalLight(0xfff1de, 1.6);
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
// The handle under the pointer, measured on the screen (as the body's joints are): a knob within
// KNOB_PX of its centre, else the ring within RING_PX of its line; the lift knob wins.
const KNOB_PX = 24, RING_PX = 12;
function handleAt(e) {
  if (!gizmo || !gizmo.visible) return null;
  const r = V.canvas.getBoundingClientRect(), v = new THREE.Vector3();
  const screen = (o) => { v.copy(o).project(V.camera); return v.z > 1 ? null : [(v.x + 1) / 2 * r.width + r.left, (1 - v.y) / 2 * r.height + r.top]; };
  const near = (q, px) => q && Math.hypot(q[0] - e.clientX, q[1] - e.clientY) < px;
  gizmo.updateMatrixWorld(true);
  for (const name of ["lift", "turn"]) if (near(screen(gizmo.getObjectByName(name).getWorldPosition(new THREE.Vector3())), KNOB_PX)) return name;
  const ring = gizmo.getObjectByName("ring");
  let a = null;
  for (let k = 0; k <= 64; k++) {
    const t = k / 64 * 2 * Math.PI, b = screen(ring.localToWorld(new THREE.Vector3(Math.cos(t), Math.sin(t), 0)));
    if (a && b) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((e.clientX - a[0]) * dx + (e.clientY - a[1]) * dy) / l));
      if (Math.hypot(a[0] + u * dx - e.clientX, a[1] + u * dy - e.clientY) < RING_PX) return "turn";
    }
    a = b && [...b];
  }
  return null;
}
// what the pointer shows over the room while Decor is open: a hand over a thing or a handle
let hoverAt = null;
function hover() {
  const e = hoverAt;
  hoverAt = null;
  if (!e || drag) return;
  const on = group && !$("decor").hidden && e.target === V.canvas;
  const h = on && handleAt(e);
  const cursor = !on ? "" : h === "lift" ? "ns-resize" : h ? "grab" : hit(e) >= 0 ? "grab" : "";
  if (V.canvas.style.cursor !== cursor) V.canvas.style.cursor = cursor;
  if (gizmo) for (const name of ["lift", "turn"]) gizmo.getObjectByName(name).scale.setScalar(h === name ? 1.25 : 1);
}
addEventListener("pointermove", (e) => {
  if (drag || e.pointerType === "touch") return;
  if (!hoverAt) requestAnimationFrame(hover);
  hoverAt = e;
});
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
    V.canvas.style.cursor = handle === "turn" ? "grabbing" : "ns-resize";
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
  V.canvas.style.cursor = "grabbing";
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
  V.canvas.style.cursor = "";
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
  move: (k, x, z, turn) => { const p = placed()[k]; p.x = x; p.z = z; if (turn != null) p.turn = turn; p.y = standY(defs(p.item), placed(), defs, p, roomTop); changed(); },
  tab: (which) => { if (which) setTab(which); return tab; },
  handles: () => (gizmo && gizmo.visible ? Object.fromEntries(["turn", "lift", "ring"].map((h) => {
    const m = gizmo.getObjectByName(h);
    const v = m.getWorldPosition(new THREE.Vector3()).project(V.camera);
    return [h, [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]];
  })) : null),
  refresh: refreshItems,
  pictures: () => ({ wanted: wanted.length, made: [...pics.values()].filter(Boolean).length, busy: picking, worker: !!painter }),
  shelf: (g) => { if (g) { shelf = g; inventory(); } return shelf; },
  glowing: () => (group ? group.children.filter((c) => c.isMesh && c.geometry.groups.some((g) => FINISHES[g.materialIndex].glow)).length : 0),
};
