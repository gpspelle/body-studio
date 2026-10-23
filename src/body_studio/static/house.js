// The body in a scanned room: a room (or a whole house) filmed from inside it, its splats around
// the body to the body's scale, its free floor under the body's feet. Walls and furniture stop the
// walk (the body goes along them), F sits down on a seat or leans on a wall nearby and F again (or
// a key to walk) gets up, and the camera stays inside the room. The room's map (where the floor,
// walls and seats are) is room.py's, the maths room.js's; the walk and the sitting are walk.js's.
import * as THREE from "three";
import { SplatMesh, dyno } from "@sparkjsdev/spark";
import { Placement, RoomMap, SKY, eyeView, lookBy, skyView } from "/static/room.js";
import { v3 } from "/static/pose.js";

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
  if (samples < 2 && samplesTries++ < 60) setTimeout(refresh, 2000);
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
  // (and the loading screen, index.html, until the body stands in the room)
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
    const res = await fetch("/files/" + file.split("/").map(encodeURIComponent).join("/"));
    if (!res.ok || want !== file) { if (want === file) say(t("room.failed", { advice: "" })); return; }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (want !== file) return;
    const mesh = new SplatMesh({ fileBytes: bytes, fileName: file });
    await mesh.initialized;
    if (want !== file) { mesh.dispose?.(); return; }
    clear();
    mesh.matrixAutoUpdate = false;
    roofless(mesh, map.frame);
    const room = new RoomMap(map);
    R = { file, map, room, mesh, size: +(store.get("room:size:" + file) || 1), ahead: room.openWay() };
    V.holder.add(mesh);
    place();
    say("");
    V.controls.autoRotate = false;
    document.body.classList.add("in-room");
    dispatchEvent(new Event("roomchange"));      // (index.html frames the body again: view())
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
// (index.html's frame() asks for it in a room.) Whether it did.
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
  if (sky) fromAbove(false);
  if (R) {
    V.holder.remove(R.mesh);
    R.mesh.dispose?.();
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
  if (fp || sky) return;                        // (the eyes are inside already; above, there is no ceiling)
  V.holder.updateMatrixWorld();
  const target = V.holder.worldToLocal(V.controls.target.clone()), eye = V.holder.worldToLocal(V.camera.position.clone());
  const tm = R.P.toMap([target.x, target.y, target.z]), em = R.P.toMap([eye.x, eye.y, eye.z]);
  const f = R.room.sight(tm, em);
  if (f >= 1) return;
  kept = V.camera.position.clone();
  V.camera.position.lerpVectors(V.controls.target, kept, Math.max(0.12, f - 0.04));
  V.camera.updateMatrixWorld();
});

// ---------------------------------------------------------------- first person
// In a room, the room seen through the body's eyes (V, or the eye button): the camera at the eyes,
// a drag looks round, W A S D walk the way it looks (tattoo.js moveDir takes the camera's way). The
// orbit is off meanwhile; leaving it, the camera goes back behind the body (view()).
let fp = null;                                  // { yaw, pitch, drag } while seeing as the body does
function firstPerson(on) {
  on = !!on && !!R;
  if (on === !!fp) return;
  if (on) {
    fp = { yaw: 0, pitch: -0.12, drag: null };
    V.controls.enabled = false; V.controls.autoRotate = false;
    V.camera.near = 0.02 * (R.P?.k || 1); V.camera.updateProjectionMatrix();
  } else {
    fp = null;
    V.controls.enabled = true;
    view();
  }
  $("eyeBtn").setAttribute("aria-pressed", String(on));
  $("eyeBtn").textContent = t(on ? "room.eyeOff" : "room.eye");
  document.body.classList.toggle("first-person", on);
  dispatchEvent(new Event("viewchange"));
}
// the eye and the look now, in the scene
function eyeNow() {
  const w = window.tattooStudio?.walker?.(), sk = w && w.sk;
  if (!fp || !sk) return null;
  const head = sk.P[sk.index("head")], top = sk.P[sk.index("head_end")] || head;
  if (!head) return null;
  const v = eyeView(head, top, w.facing(), w.up, fp.yaw, fp.pitch, w.H);
  V.holder.updateMatrixWorld();
  return { eye: V.holder.localToWorld(new THREE.Vector3(...v.eye)), look: V.holder.localToWorld(new THREE.Vector3(...v.look)) };
}
V.frameHooks.unshift((before) => {
  if (!before || !fp) return;
  const v = eyeNow();
  if (!v) return;
  V.camera.position.copy(v.eye);
  V.controls.target.copy(v.look);
  V.camera.lookAt(v.look);
  V.camera.updateMatrixWorld();
});
// the body turns where it walks; the look stays where it was looking, so it keeps the yaw
// measured from the body's way: turned back by as much as the body turned
let facedWas = null;
V.frameHooks.push((before) => {
  const w = window.tattooStudio?.walker?.();
  if (!before || !fp || !w) { facedWas = null; return; }
  if (facedWas !== null && w.heading !== facedWas) fp.yaw -= w.heading - facedWas;
  facedWas = w.heading;
});
$("eyeBtn").onclick = () => { fromAbove(false); firstPerson(!fp); };
addEventListener("keydown", (e) => {
  if (e.code !== "KeyV" || e.metaKey || e.ctrlKey || e.altKey || e.repeat || $("guide").open) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]") || !R) return;
  e.preventDefault();
  fromAbove(false);
  firstPerson(!fp);
});
// a drag on the room looks round (what decor or the joints take, they take first)
addEventListener("pointerdown", (e) => {
  if (!fp || e.target !== V.canvas || e.button !== 0) return;
  fp.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  V.canvas.setPointerCapture?.(e.pointerId);
});
addEventListener("pointermove", (e) => {
  if (!fp || !fp.drag || e.pointerId !== fp.drag.id) return;
  [fp.yaw, fp.pitch] = lookBy(fp.yaw, fp.pitch, e.clientX - fp.drag.x, e.clientY - fp.drag.y, innerWidth);
  fp.drag.x = e.clientX; fp.drag.y = e.clientY;
});
addEventListener("pointerup", () => { if (fp) fp.drag = null; });
addEventListener("pointercancel", () => { if (fp) fp.drag = null; });
addEventListener("roomchange", () => { $("eyeBtn").hidden = $("skyBtn").hidden = !R; if (!R) { firstPerson(false); fromAbove(false); } });

// ---------------------------------------------------------------- from above
// In a room, the room seen from above, as a plan comes alive: the camera high over the body,
// looking down at a slant, everything over SKY.cut (the ceiling, the lamps, the tops of the walls)
// taken off so the floor shows; the orbit turns it and zooms as usual, and W A S D still walk.
// Leaving it, the room is whole again and the camera goes back behind the body (view()).
let sky = null;                                 // the orbit's limits as they were, while above
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
}
function fromAbove(on) {
  on = !!on && !!R && !!R.P;
  if (on === !!sky) return;
  const C = V.controls;
  if (on) {
    firstPerson(false);
    sky = { min: C.minDistance, max: C.maxDistance, polar: C.maxPolarAngle };
    cutAt(R.map.ceiling ? Math.min(SKY.cut, R.map.ceiling - 0.2) : SKY.cut);
    const w = window.tattooStudio.walker(), at = R.toMap(w.pos), k = R.P.k;
    const box = [R.map.nx * R.map.cell, R.map.nz * R.map.cell];
    const v = skyView(at, R.P.wayToMap(w.facing()), box);
    V.holder.updateMatrixWorld();
    const world = (p) => V.holder.localToWorld(new THREE.Vector3(...R.P.toBody(p)));
    C.target.copy(world(v.look));
    V.camera.position.copy(world(v.eye));
    C.minDistance = 1.5 * k; C.maxDistance = 3 * v.height * k; C.maxPolarAngle = SKY.polar;
    V.camera.near = 0.05 * k; V.camera.far = 400 * k; V.camera.updateProjectionMatrix();
    C.autoRotate = false;
    C.update();
  } else {
    C.minDistance = sky.min; C.maxDistance = sky.max; C.maxPolarAngle = sky.polar;
    sky = null;
    cutAt(null);
    view();
  }
  $("skyBtn").setAttribute("aria-pressed", String(on));
  document.body.classList.toggle("from-above", on);
  dispatchEvent(new Event("viewchange"));
}
$("skyBtn").onclick = () => fromAbove(!sky);

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
  placement: () => R && R.P,
  nearby: () => { const n = nearby(); return n && n.kind; },
  rest: () => restNow(),
  hint: () => hint,
  // what the room's file says is where (sample_studio.py: the tattoo bed, chair, flash wall and
  // mirror), in map metres; and a room's own places for F: fn(at) -> { hint, go } or null
  fixtures: () => (R && R.map.fixtures) || null,
  station: (fn) => { station = fn; },
  // whether the camera's view of the body is clear (1) or something is in the way (less)
  // first person: on or off (firstPerson(on)), and where it looks ({ yaw, pitch } or null)
  firstPerson: (on) => { if (on !== undefined) firstPerson(on); return fp && { yaw: fp.yaw, pitch: fp.pitch }; },
  // from above: on or off (fromAbove(on)); whether it is
  fromAbove: (on) => { if (on !== undefined) fromAbove(on); return !!sky; },
  look: (yaw, pitch) => { if (fp) { fp.yaw = yaw; fp.pitch = pitch; } },
  sight: () => {
    if (!R || !R.P) return null;
    const target = V.holder.worldToLocal(V.controls.target.clone()), eye = V.holder.worldToLocal(V.camera.position.clone());
    return R.room.sight(R.P.toMap([target.x, target.y, target.z]), R.P.toMap([eye.x, eye.y, eye.z]));
  },
};
app.house = window.house;
refresh();
setInterval(() => { if (!document.hidden && !$("roomMenu").hidden) refresh(); }, 5000);
