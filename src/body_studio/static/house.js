// The body in a scanned room: a room (or a whole house) filmed from inside it, its splats around
// the body to the body's scale, its free floor under the body's feet. Walls and furniture stop the
// walk (the body goes along them), F sits down on a seat or leans on a wall nearby and F again (or
// a key to walk) gets up, and the camera stays inside the room. The room's map (where the floor,
// walls and seats are) is room.py's, the maths room.js's; the walk and the sitting are walk.js's.
import * as THREE from "three";
import { SplatMesh, dyno } from "@sparkjsdev/spark";
import { FLY, Placement, RoomMap, SKY, eyeView, flyStep, lookBy, panSpeed, skyView, steadyEye } from "/static/room.js";
import { v3 } from "/static/pose.js";
import { finishMaps, parseShell, shellGeometry } from "/static/shell.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const V = app.viewer;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};

let rooms = [];             // finished rooms (GET /api/rooms)
let R = null;               // the room shown: { file, map, room (RoomMap), mesh, P (Placement), size }
let want = store.get("room:last");   // the room asked for (kept while the body or its rig loads)
let busy = null;            // the room on its way
let hint = "";              // what the walk hint says about sitting or leaning, if anything
let station = null;         // the room's own places to go with F (parlour.js: the tattoo bed and chair), checked first

// ---------------------------------------------------------------- the menu
function setMenu(open) {
  $("roomMenu").hidden = !open;
  $("roomBtn").setAttribute("aria-expanded", String(open));
  if (open) list();
}
$("roomBtn").onclick = () => setMenu($("roomMenu").hidden);
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("roomMenu").hidden) setMenu(false); });
addEventListener("pointerdown", (e) => {
  if (!$("roomMenu").hidden && !e.target.closest("#roomMenu, #roomBtn")) setMenu(false);
});
function say(text) { $("roomStatus").textContent = text || ""; }

function list() {
  const pick = (file) => () => { choose(file); };
  const none = document.createElement("button");
  none.textContent = t("room.none");
  none.classList.toggle("on", !want);
  none.onclick = pick(null);
  $("roomList").replaceChildren(none, ...rooms.map((r) => {
    const b = document.createElement("button");
    b.textContent = r.sample ? t({ _sample_studio: "room.sampleStudio", _sample_venue: "room.sampleVenue" }[r.name] || "room.sample") : r.name.replace(/_/g, " ");
    b.dataset.file = r.file;
    b.classList.toggle("on", r.file === want);
    b.onclick = pick(r.file);
    return b;
  }));
  $("roomSize").hidden = !R;
  if (R) { $("roomScale").value = R.size; $("roomScaleOut").textContent = Math.round(R.size * 100) + "%"; }
  $("roomNone").hidden = rooms.some((r) => !r.sample);
}

let samplesTries = 0;
async function refresh() {
  const was = rooms.map((r) => r.file).join("|");
  try { rooms = await (await fetch("/api/rooms")).json(); } catch { rooms = []; }
  // the sample rooms are made in the background the first time: listed again until they are there
  const samples = rooms.filter((r) => r.sample).length;
  if ((samples < 2 || rooms.some((r) => r.making)) && samplesTries++ < 90) setTimeout(refresh, 2000);
  // the room shown, drawn again meanwhile (a new version of a sample room): shown again
  const now = R && rooms.find((r) => r.file === R.file);
  if (now && !now.making && R.updated && now.updated !== R.updated && !busy) { const f = R.file; clear(); choose(f); }
  if (want && !rooms.some((r) => r.file === want) && samples >= 2) want = null;
  if (!$("roomMenu").hidden && rooms.map((r) => r.file).join("|") !== was) list();
  if (want && !R && !busy && V.file() && rooms.some((r) => r.file === want)) choose(want);
  dispatchEvent(new Event("roomslisted"));       // (modes.js: the tattoo studio, once it is there)
}
addEventListener("roomsready", refresh);

$("roomPick").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) { setMenu(false); app.upload(f, "room"); }
};

// ---------------------------------------------------------------- showing a room
async function choose(file) {
  want = file;
  store.set("room:last", file);
  if (!$("roomMenu").hidden) list();
  if (!file) return clear();
  if (R && R.file === file) return;
  if (busy === file) return;                    // (on its way already: asked again by modes.js)
  const studio = window.tattooStudio;
  if (!V.file()) return;
  busy = file;
  // (and the loading screen, viewer.js, until the body stands in the room)
  const step = (text) => { say(text); app.busy("room", text); };
  try {
    step(t("room.body"));
    await studio.ensure();                      // the body's skeleton: its height, its feet, the walk
    if (!studio.ready || want !== file) return;
    step(t("room.mapping"));
    let map;
    for (;;) {
      const r = await fetch("/api/room?room=" + encodeURIComponent(file));
      if (want !== file) return;
      if (r.status === 202) { await new Promise((ok) => setTimeout(ok, 1000)); continue; }
      const d = await r.json();
      if (!r.ok) { say(t("room.failed", { advice: t("room.err." + (d.code || "room")) })); return; }
      map = d;
      break;
    }
    step(t("room.loading"));
    // a drawn room: its surfaces as a smooth shell, and only the splats it leaves (shell.js)
    const entry = rooms.find((r) => r.file === file), drawn = entry && entry.look && entry.shell;
    const get = async (f) => {
      const res = await fetch("/files/" + f.split("/").map(encodeURIComponent).join("/"));
      return res.ok ? res.arrayBuffer() : null;
    };
    const [splat, shellBytes] = await Promise.all([get(drawn ? entry.look : file), drawn ? get(entry.shell) : null]);
    if (!splat || (drawn && !shellBytes) || want !== file) { if (want === file) say(t("room.failed", { advice: "" })); return; }
    const mesh = new SplatMesh({ fileBytes: new Uint8Array(splat), fileName: file });
    await mesh.initialized;
    if (want !== file) { mesh.dispose?.(); return; }
    clear();
    mesh.matrixAutoUpdate = false;
    roofless(mesh, map.frame);
    const room = new RoomMap(map);
    const shell = shellBytes && shellMesh(shellBytes, map.frame);
    R = { file, map, room, mesh, shell, updated: entry && entry.updated, size: +(store.get("room:size:" + file) || 1), ahead: room.openWay() };
    V.holder.add(mesh);
    if (shell) V.holder.add(shell);
    place();
    say("");
    V.controls.autoRotate = false;
    document.body.classList.add("in-room");
    dispatchEvent(new Event("roomchange"));      // (viewer.js frames the body again)
    if (!$("roomMenu").hidden) list();
  } finally {
    if (busy === file) busy = null;
    if (!busy) app.busy("room", null);
  }
}

// the room to the body's scale, its free floor under the feet, and the walk kept inside it
function place() {
  const studio = window.tattooStudio, w = studio.walker(), rig = studio.rig();
  if (!R || !w) return;
  const k = rig.height / (studio.heightCm() / 100) * R.size;
  R.P = new Placement(rig, R.room, k, R.ahead);
  R.mesh.matrix.fromArray(R.P.plyMatrix(R.map.frame));
  R.mesh.matrixWorldNeedsUpdate = true;
  if (R.shell) { R.shell.matrix.copy(R.mesh.matrix); R.shell.matrixWorldNeedsUpdate = true; }
  const o = rig.frame.origin;
  R.toMap = (pos) => { const p = R.P.toMap(v3.add(o, pos)); return [p[0], p[2]]; };
  R.toPos = (xz) => v3.sub(R.P.toBody([xz[0], 0, xz[1]]), o);
  w.bound = (from, to) => R.toPos(R.room.move(R.toMap(from), R.toMap(to)));
  // a body standing in a wall or the sofa (the room was resized, or put round it) steps out
  const at = R.toMap(w.pos), free = R.room.nearestFree(...at);
  if (free && (free[0] !== at[0] || free[1] !== at[1])) { w.pos = R.toPos(free); studio.redraw(); }
  dispatchEvent(new Event("roomplaced"));       // (parlour.js hangs the flash again)
}

// The camera where it sees most of the room with the body in it: from the side of the body with
// the most free room behind the camera (in front of the body if it can), at eye height.
// (viewer.js's frame() asks for it in a room.) Whether it did.
function view() {
  const w = window.tattooStudio.walker(), sk = w && w.sk;
  if (!R || !R.P || !sk) return false;
  const at = R.toMap(w.pos), face = R.P.wayToMap(w.facing()), eye = 1.6;
  const body = R.P.toMap(sk.P[sk.index("chest")] || sk.P[0]);
  let best = null, score = -Infinity;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * 2 * Math.PI, d = [Math.cos(a), Math.sin(a)];
    const far = [at[0] + d[0] * 3.2, eye, at[1] + d[1] * 3.2];
    const reach = 3.2 * R.room.sight([at[0], body[1], at[1]], far);
    const s = Math.min(reach, 2.8) + 0.6 * (d[0] * face[0] + d[1] * face[1]);
    if (reach > 1.2 && s > score) { score = s; best = [at[0] + d[0] * (reach - 0.25), eye, at[1] + d[1] * (reach - 0.25)]; }
  }
  if (!best) return false;
  const k = R.P.k;
  V.camera.near = 0.03 * k; V.camera.far = 400 * k; V.camera.updateProjectionMatrix();      // (a venue is 80 m long, and sees the sea)
  V.controls.minDistance = 0.4 * k; V.controls.maxDistance = 6 * k;
  V.holder.updateMatrixWorld();
  const target = V.holder.localToWorld(new THREE.Vector3(...R.P.toBody([at[0], body[1] * 0.85, at[1]])));
  V.controls.target.copy(target);
  V.camera.position.copy(V.holder.localToWorld(new THREE.Vector3(...R.P.toBody(best))));
  V.controls.update();
  return true;
}

function clear() {
  if (mode !== "body") setView("body");
  if (R) {
    V.holder.remove(R.mesh);
    R.mesh.dispose?.();
    if (R.shell) { V.holder.remove(R.shell); R.shell.geometry.dispose(); for (const m of R.shell.material) m.dispose(); }
    R = null;
  }
  const w = window.tattooStudio?.walker?.();
  if (w) { w.bound = null; if (w.rest) { w.settle(); window.tattooStudio.redraw(); } }
  setHint("");
  document.body.classList.remove("in-room");
  dispatchEvent(new Event("roomchange"));
}

$("roomScale").oninput = (e) => {
  if (!R) return;
  R.size = +e.target.value;
  store.set("room:size:" + R.file, String(R.size));
  $("roomScaleOut").textContent = Math.round(R.size * 100) + "%";
  place();
};

// a new body (or the same one again, its skeleton made anew): the room goes round it
addEventListener("bodyshown", () => { if (R) clear(); if (want && !busy) choose(want); });
addEventListener("studioready", () => { if (want && !busy) choose(want); });
addEventListener("studiogone", () => { if (R) clear(); });
addEventListener("heightchange", () => { if (R) place(); });

// ---------------------------------------------------------------- sitting and leaning
// F: sit on the seat nearest the body's feet, else lean on the wall behind or beside it, else
// nothing; pressed again (or a key to walk), the body gets up.
function nearby() {
  const w = window.tattooStudio?.walker?.();
  if (!R || !R.P || !w) return null;
  const at = R.toMap(w.pos);
  const own = station && station(at);
  if (own) return { kind: "station", ...own };
  const seat = R.room.seatNear(...at);
  if (seat) return { kind: "sit", seat };
  const wall = R.room.wallNear(...at);
  return wall ? { kind: "lean", wall } : null;
}
function restNow() {
  const studio = window.tattooStudio, w = studio.walker();
  if (!w) return false;
  if (w.resting) { w.standUp(); studio.wake(); return true; }
  const n = nearby();
  if (!n) return false;
  const P = R.P;
  if (n.kind === "station") return n.go();
  const ok = n.kind === "sit"
    ? w.restAt({ kind: "sit", at: P.toBody([n.seat.x, n.seat.y, n.seat.z]), facing: P.wayToBody(n.seat.dir),
                 height: n.seat.y * P.k, back: n.seat.back })
    : w.restAt({ kind: "lean", at: P.toBody([n.wall.at[0], 0, n.wall.at[1]]), facing: P.wayToBody(n.wall.n) });
  if (ok) studio.wake();
  return ok;
}
addEventListener("keydown", (e) => {
  if (e.code !== "KeyF" || e.metaKey || e.ctrlKey || e.altKey || e.repeat || $("guide").open) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (!R) return;
  e.preventDefault();
  restNow();
});

// the walk hint says what F does here
function setHint(text) {
  if (text === hint) return;
  const el = $("walkHint");
  if (text) { el.textContent = text; el.hidden = false; }
  else if (hint && el.textContent === hint) { el.textContent = ""; el.hidden = true; }
  hint = text;
}
let hintFrame = 0;
function hintNow() {
  const w = window.tattooStudio?.walker?.();
  if (!R || !w) return setHint("");
  if (w.resting) return setHint(t("room.up"));
  const n = !w.busy && nearby();
  setHint(n ? (n.kind === "station" ? n.hint : t(n.kind === "sit" ? "room.sit" : "room.lean")) : "");
}

// ---------------------------------------------------------------- the camera stays inside
// Before each frame is drawn, a camera that is behind a wall or above the ceiling is brought in
// toward the body, to the last place it sees it from; afterwards it goes back where the orbit
// left it, so turning back round gives the same view as before.
let kept = null;
V.frameHooks.push((before) => {
  if (!before) {
    if (kept) { V.camera.position.copy(kept); V.camera.updateMatrixWorld(); kept = null; }
    return;
  }
  if (!R || !R.P) return;
  if (++hintFrame % 15 === 0) hintNow();
  if (mode !== "body") return;                  // (the eyes are inside already; above, there is no ceiling; flying goes through)
  V.holder.updateMatrixWorld();
  const target = V.holder.worldToLocal(V.controls.target.clone()), eye = V.holder.worldToLocal(V.camera.position.clone());
  const tm = R.P.toMap([target.x, target.y, target.z]), em = R.P.toMap([eye.x, eye.y, eye.z]);
  const f = R.room.sight(tm, em);
  if (f >= 1) return;
  kept = V.camera.position.clone();
  V.camera.position.lerpVectors(V.controls.target, kept, Math.max(0.12, f - 0.04));
  V.camera.updateMatrixWorld();
});

// ---------------------------------------------------------------- the four views
// In a room, the chips at the bottom (or 1 2 3 4) pick how it is seen:
//   body   third person: the orbit round the body, W A S D walk it (tattoo.js)
//   eyes   first person: the camera at its eyes (V too), a drag looks round, W A S D walk the way
//          it looks
//   above  from above, without the body: the ceiling taken off, the orbit turns and zooms, W A S D
//          slide the view across the plan
//   fly    fly through, without the body: the camera at eye height, a drag looks round, W A S D go
//          where it looks, through walls and fast (Shift faster still); back to the body or its
//          eyes, the body is put down where the flight ended
// Leaving the eyes or above, the camera goes back behind the body (view()).
let mode = "body";
let fp = null;                                  // { look, pitch, drag, eye } while seeing as the body does
let sky = null;                                 // the orbit's limits as they were, while above
let fly = null;                                 // { at [x, z], look, pitch, drag } while flying
const bodyless = () => mode === "above" || mode === "fly";
// (look: the way it looks, as an angle about up from the way the body was scanned facing, as the
// walker's heading; kept as the body turns, so the view never turns by itself)
function setView(v) {
  if (!R || !R.P || !window.tattooStudio?.walker?.()) v = "body";
  if (v === mode) return;
  const w = window.tattooStudio.walker(), was = mode, look = fp ? fp.look : fly ? fly.look : w.heading;
  if (was === "fly" && (v === "body" || v === "eyes")) land(fly);
  if (was === "eyes") { fp = null; V.controls.enabled = true; }
  if (was === "above") { const C = V.controls; C.minDistance = sky.min; C.maxDistance = sky.max; C.maxPolarAngle = sky.polar; sky = null; cutAt(null); }
  if (was === "fly") { fly = null; V.controls.enabled = true; }
  mode = v;
  if (v === "eyes" || v === "fly") {
    V.controls.enabled = false; V.controls.autoRotate = false;
    V.camera.near = 0.02 * R.P.k; V.camera.far = 400 * R.P.k; V.camera.updateProjectionMatrix();
  }
  if (v === "eyes") fp = { look, pitch: -0.12, drag: null, eye: null };
  if (v === "fly") fly = { at: R.toMap(w.pos), look, pitch: -0.08, drag: null };
  if (v === "above") above();
  if (v === "body") view();
  showBody(!bodyless());
  for (const [id, m] of [["bodyBtn", "body"], ["eyeBtn", "eyes"], ["skyBtn", "above"], ["flyBtn", "fly"]]) {
    $(id).setAttribute("aria-pressed", String(m === v));
    $(id).classList.toggle("on", m === v);
  }
  document.body.classList.toggle("first-person", v === "eyes");
  document.body.classList.toggle("from-above", v === "above");
  document.body.classList.toggle("flying", v === "fly");
  dispatchEvent(new Event("viewchange"));
}
// a chip pressed again goes back to the body
const toggle = (v) => setView(mode === v ? "body" : v);
$("roomViews").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) toggle(b.dataset.view); });
const VIEW_KEYS = { KeyV: "eyes", Digit1: "body", Digit2: "eyes", Digit3: "above", Digit4: "fly" };
addEventListener("keydown", (e) => {
  const v = VIEW_KEYS[e.code];
  if (!v || e.metaKey || e.ctrlKey || e.altKey || e.repeat || $("guide").open) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]") || !R) return;
  if (e.code !== "KeyV" && document.body.dataset.mode !== "rooms") return;     // (the tattoo studio has its own views)
  e.preventDefault();
  if (e.code === "KeyV") toggle("eyes"); else setView(v);
});
addEventListener("roomchange", () => { $("roomViews").hidden = !R; if (!R) setView("body"); });

// the way a look angle points, in the body's coordinates
function lookWay(look) {
  const w = window.tattooStudio.walker();
  return v3.add(v3.scale(w.front, Math.cos(look)), v3.scale(w.side, Math.sin(look)));
}
// the way W A S D say, in the body's coordinates, for a look angle (null: none held)
function keysWay(look) {
  const f = (held.has("f") ? 1 : 0) - (held.has("b") ? 1 : 0), r = (held.has("r") ? 1 : 0) - (held.has("l") ? 1 : 0);
  if (!f && !r) return null;
  const w = window.tattooStudio.walker(), ahead = lookWay(look), right = v3.cross(ahead, w.up);
  return v3.unit(v3.add(v3.scale(ahead, f), v3.scale(right, r)));
}
// what tattoo.js walks by: null, the camera's way as usual; false, the body stays (it isn't shown);
// in first person the way it looks, so the walk goes straight however the head moves
function steer() {
  if (bodyless()) return false;
  return fp ? lookWay(fp.look) : null;
}
// where the head turns to look (tattoo.js, walk.js's head look; null: the camera)
function gaze() {
  if (bodyless()) return null;
  if (!fp || !fp.eye) return undefined;
  const w = window.tattooStudio.walker();
  return v3.add(v3.add(fp.eye, fp.base), v3.scale(lookWay(fp.look), 5 * w.H));
}

// the keys, while the body isn't the one moving (tattoo.js has its own for walking)
const KEYS = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r" };
const held = new Set();
let hurry = false;
addEventListener("keydown", (e) => {
  hurry = e.shiftKey;
  if (e.metaKey || e.ctrlKey || e.altKey || $("guide").open || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (KEYS[e.code]) held.add(KEYS[e.code]);
});
addEventListener("keyup", (e) => { hurry = e.shiftKey; held.delete(KEYS[e.code]); });
addEventListener("blur", () => { held.clear(); hurry = false; });

// ---------------------------------------------------------------- first person
// the eye and the look now, in the scene
function eyeNow(dt) {
  const w = window.tattooStudio?.walker?.(), sk = w && w.sk;
  if (!fp || !sk) return null;
  const head = sk.P[sk.index("head")], top = sk.P[sk.index("head_end")] || head;
  if (!head) return null;
  const v = eyeView(head, top, w.front, w.up, fp.look, fp.pitch, w.H);
  // measured from the body's place on the floor, eased: the head's sway and bob don't shake it
  const base = v3.add(window.tattooStudio.rig().frame.origin, w.pos);
  fp.eye = steadyEye(fp.eye, v3.sub(v.eye, base), dt);
  fp.base = base;
  const eye = v3.add(base, fp.eye), look = v3.add(eye, v3.sub(v.look, v.eye));
  V.holder.updateMatrixWorld();
  return { eye: V.holder.localToWorld(new THREE.Vector3(...eye)), look: V.holder.localToWorld(new THREE.Vector3(...look)) };
}
let lastHook = 0;
V.keepDrawing.push(() => !!(fp || fly || sky));   // (the views move the camera every frame)
V.frameHooks.unshift((before) => {
  if (!before) return;
  const now = performance.now(), dt = lastHook ? (now - lastHook) / 1000 : 1 / 60;
  lastHook = now;
  if (bodyless()) hideBody();
  let v = null;
  if (fp) v = eyeNow(dt);
  else if (fly) v = flyNow(dt);
  else if (sky) { slide(dt); cutShell(); }
  if (!v) return;
  V.camera.position.copy(v.eye);
  V.controls.target.copy(v.look);
  V.camera.lookAt(v.look);
  V.camera.updateMatrixWorld();
});
// a drag on the room looks round, in first person and flying (what decor or the joints take, they take first)
const looking = () => fp || fly;
addEventListener("pointerdown", (e) => {
  const L = looking();
  if (!L || e.target !== V.canvas || e.button !== 0) return;
  L.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  V.canvas.setPointerCapture?.(e.pointerId);
});
addEventListener("pointermove", (e) => {
  const L = looking();
  if (!L || !L.drag || e.pointerId !== L.drag.id) return;
  [L.look, L.pitch] = lookBy(L.look, L.pitch, e.clientX - L.drag.x, e.clientY - L.drag.y, innerWidth);
  L.drag.x = e.clientX; L.drag.y = e.clientY;
});
addEventListener("pointerup", () => { const L = looking(); if (L) L.drag = null; });
addEventListener("pointercancel", () => { const L = looking(); if (L) L.drag = null; });

// ---------------------------------------------------------------- without the body
// From above and flying, the body isn't drawn: its splats, its clothes and tattoos and its shadow
// (everything under the holder that isn't the room's: the room's splats, decor, parlour.js's
// sheets are marked userData.room). Hidden each frame, as clothes may come in meanwhile.
const hidden = new Set();
function hideBody() {
  for (const o of [...V.holder.children, V.ground.mesh]) {
    if (!o || !o.visible || o === R?.mesh || o.userData.room) continue;
    o.visible = false;
    hidden.add(o);
  }
}
function showBody(on) {
  if (!on) return hideBody();
  for (const o of hidden) o.visible = true;
  hidden.clear();
}

// ---------------------------------------------------------------- from above
// The room seen from above, as a plan comes alive: the camera high over where the body is,
// looking down at a slant, everything over SKY.cut (the ceiling, the lamps, the tops of the walls)
// taken off so the floor shows; the orbit turns it and zooms as usual, and W A S D slide it.
// (a Spark object modifier on the room's splats: those above the cut are not drawn)
function roofless(mesh, frame) {
  const cut = new dyno.DynoUniform({ key: "roomCut", type: "vec4", value: new THREE.Vector4(...frame.up, 1e9) });
  mesh.objectModifier = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = dyno.dyno({
      inTypes: { gsplat: dyno.Gsplat, cut: "vec4" }, outTypes: { gsplat: dyno.Gsplat },
      inputs: { gsplat, cut },
      statements: ({ inputs: I, outputs: O }) => [
        `${O.gsplat} = ${I.gsplat};`,
        `if (dot(${O.gsplat}.center, ${I.cut}.xyz) > ${I.cut}.w) ${O.gsplat}.rgba.a = 0.0;`,
      ],
    });
    return { gsplat: d.outputs.gsplat };
  });
  mesh.updateGenerator();
  mesh.roomCut = cut;
}
// splats over `metres` above the floor hidden (null: none)
function cutAt(metres) {
  if (!R || !R.mesh.roomCut) return;
  const fr = R.map.frame;
  R.mesh.roomCut.value.w = metres === null ? 1e9 : fr.floor + metres / fr.metres;
  R.mesh.updateVersion?.();
  if (R.shell) for (const m of R.shell.material) m.clippingPlanes = metres === null ? [] : [shellCut];
}
// the same cut on the shell: a clipping plane in the scene, from the room's (kept up to date by
// the frame hook: the room moves with the holder)
const shellCut = new THREE.Plane();
function cutShell() {
  if (!R || !R.shell || !R.shell.material[0].clippingPlanes.length) return;
  const up = R.map.frame.up, w = R.mesh.roomCut.value.w;
  R.shell.updateMatrixWorld();
  shellCut.set(new THREE.Vector3(-up[0], -up[1], -up[2]), w).applyMatrix4(R.shell.matrixWorld);
}
V.renderer.localClippingEnabled = true;

// ---------------------------------------------------------------- the shell
// A drawn room's walls, floors and ceilings as one mesh of vertex-coloured quads (shell.js), in the
// splat file's coordinates like the splats, so it takes the same matrix. Lit as the decor is
// (under the decor's lights; decorate.js gives it the decor's studio reflections too), so the room
// and what is put in it look alike. A material per finish (plaster, cement, tile...) with that
// finish's fine detail, and the corners' shading baked in (shell.js): both made once, so a frame
// costs what flat colours did.
const FINISH_MAPS = new Map();          // finish -> { map, normalMap, roughnessMap, mean }, made once
function finishMaterial(finish) {
  if (!FINISH_MAPS.has(finish)) {
    const f = finishMaps(finish);
    let maps = null;
    if (f) {
      const tex = (data, srgb) => {
        const t = new THREE.DataTexture(data, f.size, f.size);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / f.metres, 1 / f.metres);
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.anisotropy = Math.min(8, V.renderer.capabilities.getMaxAnisotropy());
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.needsUpdate = true;
        return t;
      };
      maps = { map: tex(f.color, false), normalMap: tex(f.normal, false), roughnessMap: tex(f.rough, false), mean: f.mean };
    }
    FINISH_MAPS.set(finish, maps);
  }
  const maps = FINISH_MAPS.get(finish);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: maps ? 1 : 0.85, metalness: 0 });
  if (maps) {
    Object.assign(m, { map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap });
    m.normalScale.set(1, 1);
    m.color.setScalar(1 / maps.mean);             // (the detail's mean is 1: the room keeps its colours)
  }
  // the baked corners' shading, the side seen's: on the light from round about (the sky, the
  // reflections) and half of it on the sun's
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 ao2;\nvarying vec2 vAo2;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAo2 = ao2;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vAo2;")
      .replace("#include <aomap_fragment>", `
        float shellAo = gl_FrontFacing ? vAo2.x : vAo2.y;
        reflectedLight.indirectDiffuse *= shellAo;
        reflectedLight.indirectSpecular *= shellAo;
        reflectedLight.directDiffuse *= mix(1.0, shellAo, 0.5);`);
  };
  m.customProgramCacheKey = () => "shell-ao";
  return m;
}
function shellMesh(bytes, frame) {
  const g = shellGeometry(parseShell(bytes), frame.up, true);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(g.position, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(g.color, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(g.uv, 2));
  geom.setAttribute("ao2", new THREE.BufferAttribute(g.ao, 2));
  geom.setIndex(new THREE.BufferAttribute(g.index, 1));
  geom.computeVertexNormals();
  const mats = g.groups.map((gr, i) => { geom.addGroup(gr.start, gr.count, i); return finishMaterial(gr.finish); });
  const mesh = new THREE.Mesh(geom, mats.length ? mats : [finishMaterial("")]);
  mesh.matrixAutoUpdate = false;
  mesh.userData.room = true;                    // (still drawn without the body)
  mesh.name = "room-shell";
  return mesh;
}
function above() {
  const C = V.controls;
  sky = { min: C.minDistance, max: C.maxDistance, polar: C.maxPolarAngle };
  cutAt(R.map.ceiling ? Math.min(SKY.cut, R.map.ceiling - 0.2) : SKY.cut);
  const w = window.tattooStudio.walker(), at = R.toMap(w.pos), k = R.P.k;
  const box = [R.map.nx * R.map.cell, R.map.nz * R.map.cell];
  const v = skyView(at, R.P.wayToMap(w.facing()), box);
  V.holder.updateMatrixWorld();
  C.target.copy(toWorld(v.look));
  V.camera.position.copy(toWorld(v.eye));
  C.minDistance = 1.5 * k; C.maxDistance = 3 * v.height * k; C.maxPolarAngle = SKY.polar;
  V.camera.near = 0.05 * k; V.camera.far = 400 * k; V.camera.updateProjectionMatrix();
  C.autoRotate = false;
  C.update();
}
const toWorld = (p) => V.holder.localToWorld(new THREE.Vector3(...R.P.toBody(p)));
// W A S D from above: the view slides over the plan, the way the camera looks along the floor
function slide(dt) {
  const f = (held.has("f") ? 1 : 0) - (held.has("b") ? 1 : 0), r = (held.has("r") ? 1 : 0) - (held.has("l") ? 1 : 0);
  if (!f && !r) return;
  V.holder.updateMatrixWorld();
  const local = (p) => { const b = V.holder.worldToLocal(p.clone()); return R.P.toMap([b.x, b.y, b.z]); };
  const t = local(V.controls.target), e = local(V.camera.position);
  const ahead = [t[0] - e[0], t[2] - e[2]], n = Math.hypot(...ahead) || 1;
  // (the map's right of a way [x, z] along the floor: [-z, x], y being up)
  const a = [ahead[0] / n, ahead[1] / n], right = [-a[1], a[0]];
  const s = panSpeed(e[1] - t[1], hurry) * Math.min(dt, 0.1);
  const d = [(a[0] * f + right[0] * r) * s, (a[1] * f + right[1] * r) * s];
  const step = toWorld([t[0] + d[0], t[1], t[2] + d[1]]).sub(toWorld(t));
  V.controls.target.add(step);
  V.camera.position.add(step);
}

// ---------------------------------------------------------------- flying through
function bounds() {
  const m = R.room;
  return [m.x0, m.z0, m.x0 + m.nx * m.cell, m.z0 + m.nz * m.cell];
}
function flyNow(dt) {
  const way = keysWay(fly.look);
  fly.at = flyStep(fly.at, way && R.P.wayToMap(way), hurry, dt, bounds());
  const w = window.tattooStudio.walker(), dir = lookWay(fly.look), p = Math.max(-1.4, Math.min(1.4, fly.pitch));
  const look = v3.add(v3.scale(dir, Math.cos(p)), v3.scale(w.up, Math.sin(p)));
  V.holder.updateMatrixWorld();
  const eye = toWorld([fly.at[0], FLY.eye, fly.at[1]]);
  const local = V.holder.worldToLocal(eye.clone());
  return { eye, look: V.holder.localToWorld(new THREE.Vector3(local.x + look[0] * w.H, local.y + look[1] * w.H, local.z + look[2] * w.H)) };
}
// the body put down where the flight ended (the nearest free floor), facing the way it looked
function land(f) {
  const studio = window.tattooStudio, w = studio.walker();
  if (!R || !w) return;
  const spot = R.room.nearestFree(f.at[0], f.at[1], undefined, 3);
  if (!spot || w.resting) return;
  w.pos = R.toPos(spot);
  w.heading = f.look;
  w.settle();
  studio.redraw();
}

// ---------------------------------------------------------------- for tests and scripts
window.house = {
  rooms: () => rooms,
  // the sample tattoo studio's room, once it is made (modes.js puts the body there for tattoos)
  studio: () => rooms.find((r) => r.name === "_sample_studio") || null,
  view,
  choose,
  shown: () => !!R,
  file: () => R && R.file,
  wanted: () => want,                    // the room asked for, shown or on its way
  // the body's place in the room (map metres), and the room's map
  where: () => { const w = window.tattooStudio?.walker?.(); return R && R.P && w ? R.toMap(w.pos) : null; },
  map: () => R && R.room,
  mesh: () => R && R.mesh,
  shell: () => (R && R.shell) || null,           // a drawn room's smooth surfaces (shell.js)
  placement: () => R && R.P,
  nearby: () => { const n = nearby(); return n && n.kind; },
  rest: () => restNow(),
  hint: () => hint,
  // what the room's file says is where (sample_studio.py: the tattoo bed, chair, flash wall and
  // mirror), in map metres; and a room's own places for F: fn(at) -> { hint, go } or null
  fixtures: () => (R && R.map.fixtures) || null,
  station: (fn) => { station = fn; },
  // whether the camera's view of the body is clear (1) or something is in the way (less)
  // the view: "body", "eyes", "above" or "fly" (view(v) sets it); and for tattoo.js, the way to
  // walk and where the head looks (steer(), gaze())
  mode: (v) => { if (v !== undefined) setView(v); return mode; },
  steer, gaze,
  // first person: on or off (firstPerson(on)), and where it looks ({ yaw, pitch } or null; yaw
  // as the walker's heading)
  firstPerson: (on) => { if (on !== undefined) setView(on ? "eyes" : "body"); return fp && { yaw: fp.look, pitch: fp.pitch }; },
  // from above: on or off (fromAbove(on)); whether it is
  fromAbove: (on) => { if (on !== undefined) setView(on ? "above" : "body"); return !!sky; },
  // flying: on or off; where the camera is ([x, z] map metres) or null
  fly: (on) => { if (on !== undefined) setView(on ? "fly" : "body"); return fly && fly.at.slice(); },
  look: (yaw, pitch) => { const L = fp || fly; if (L) { L.look = yaw; L.pitch = pitch; } },
  // the body's things hidden now (from above and flying)
  bodyHidden: () => hidden.size > 0,
  sight: () => {
    if (!R || !R.P) return null;
    const target = V.holder.worldToLocal(V.controls.target.clone()), eye = V.holder.worldToLocal(V.camera.position.clone());
    return R.room.sight(R.P.toMap([target.x, target.y, target.z]), R.P.toMap([eye.x, eye.y, eye.z]));
  },
};
app.house = window.house;
refresh();
setInterval(() => { if (!document.hidden && !$("roomMenu").hidden) refresh(); }, 5000);
