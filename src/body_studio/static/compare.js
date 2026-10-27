// Compare a room with a video of the real place (opened from the Decor panel): the video's frame
// and the room side by side, the same size, a crosshair at the same spot on both; the video
// stepped half a second at a time, the camera flying (house.js) to line the room up with it, its
// lens and height set here (its whole view drawn in the room's place: viewIn). A view lined up is kept with a
// picture of both; a click on the frame tags what is missing or wrong there, in your words. All
// of it is kept per room by compare.py (/api/compare...) and exported as one zip to work from.
// The maths (where the two sit, the clock) is matchview.js's.
import { KINDS, around, clock, fromFrame, sideBySide, spotIn, step, viewAt, viewIn } from "/static/matchview.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const V = app.viewer;
const video = $("compareVideo");
const STEP = 0.5;                                   // s: one step through the video
const FRAME = 1 / 30;                               // s: one frame (Shift with the arrows)
const LENS = 70, EYE = 1.5;                         // a phone's lens up and down (portrait), held at the chest

let room = null;            // the room's file while open
let S = { video: null, views: [] };                 // compare.py's state for it
let cur = null;             // the kept view shown (at the video's time), or null
let tagging = false, pending = null, wasFov = null, url = null;
let pointer = null;         // where the pointer last was in the window, [x, y]
let L = null;               // where the frame and the room are drawn (sideBySide), while open

const q = () => "room=" + encodeURIComponent(room);
const say = (k, params) => ($("compareStatus").textContent = k ? t(k, params) : "");
const now = () => video.currentTime || 0;

async function api(path, opts = {}) {
  const r = await fetch(path + (path.includes("?") ? "&" : "?") + q(), opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}

// ---------------------------------------------------------------- open and close
async function open() {
  const H = window.house;
  if (!H?.shown()) return;
  room = H.file();
  if (!$("decor").hidden) $("closeDecor").click();
  $("compare").hidden = false;
  document.body.classList.add("comparing");
  wasFov = V.camera.fov;
  if (H.mode() !== "fly") H.mode("fly");
  place();
  lens(+$("compareLens").value || LENS);
  eye(+$("compareEye").value / 100 || EYE);
  try { S = await api("/api/compare"); } catch { S = { video: null, views: [] }; }
  show();
  if (S.video && !url) {
    say("compare.loading");
    try {
      const r = await fetch("/api/compare/video?" + q());
      if (!r.ok) throw new Error(r.statusText);
      use(await r.blob());
      say();
    } catch { say("compare.noLoad"); }
  }
}
function close() {
  $("compare").hidden = true;
  document.body.classList.remove("comparing");
  video.pause();
  setTagging(false);
  cross(null);
  L = null;
  V.camera.aspect = innerWidth / innerHeight;
  V.camera.clearViewOffset();
  if (wasFov) V.camera.fov = wasFov;
  V.camera.updateProjectionMatrix();
  $("decorBtn").click();                             // back to the Decor panel it was opened from
  app.reframe();
  V.redraw();
}
$("compareBtn").onclick = open;
$("closeCompare").onclick = close;
addEventListener("roomchange", () => { if (!$("compare").hidden) { url && URL.revokeObjectURL(url); url = null; close(); } });

// ---------------------------------------------------------------- the video
function use(blob) {
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  video.src = url;
  video.load();
}
video.addEventListener("loadedmetadata", () => { $("compareTime").max = String(Number.isFinite(video.duration) ? video.duration : 0); place(); show(); });
video.addEventListener("durationchange", () => { if (Number.isFinite(video.duration)) $("compareTime").max = String(video.duration); });
video.addEventListener("timeupdate", () => { $("compareTime").value = String(now()); find(); });
video.addEventListener("seeked", find);
$("comparePick").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  say("compare.uploading");
  try {
    S = await api("/api/compare/video?name=" + encodeURIComponent(f.name), { method: "POST", body: f });
    use(f);
    say();
  } catch (err) { say("compare.failed", { why: err.message }); }
  show();
};
function seek(s) {
  return new Promise((res) => {
    const to = step(s, 0, video.duration);
    if (Math.abs(video.currentTime - to) < 1e-3) return res();
    video.addEventListener("seeked", () => res(), { once: true });
    video.currentTime = to;
  });
}
$("compareTime").oninput = (e) => seek(+e.target.value);
$("compareBack").onclick = () => seek(step(now(), -STEP, video.duration));
$("compareOn").onclick = () => seek(step(now(), STEP, video.duration));
$("comparePlay").onclick = () => (video.paused ? video.play().catch(() => {}) : video.pause());   // (a pause before it starts is fine)
video.addEventListener("play", () => ($("comparePlay").textContent = t("compare.pause")));
video.addEventListener("pause", () => ($("comparePlay").textContent = t("compare.play")));
$("comparePrev").onclick = () => { const v = around(S.views, now()).prev; if (v) go(v); };
$("compareNext").onclick = () => { const v = around(S.views, now()).next; if (v) go(v); };
$("compareViews").onchange = (e) => { const v = S.views.find((x) => x.id === e.target.value); if (v) go(v); };
// ← and → (or [ and ]) step the video, with Shift a frame at a time; Space plays and pauses it, K keeps
// the view, T goes in and out of tagging (with the pointer on a picture, a tag right there), Esc
// leaves it: taken before the fly-through's arrows and the walk's jump see them (capture), and from
// a slider or button that has the focus
const KEYS = { ArrowLeft: -1, ArrowRight: 1, BracketLeft: -1, BracketRight: 1 };
addEventListener("keydown", (e) => {
  if ($("compare").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "Escape" && (tagging || pending)) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (pending) note(null); else setTagging(false);
    return;
  }
  if (e.target.closest?.("textarea, select, input:not([type=range])")) return;
  if (!(e.code in KEYS) && !["Space", "KeyK", "KeyT"].includes(e.code)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.repeat && !(e.code in KEYS)) return;
  if (e.code === "KeyK") $("compareKeep").click();
  else if (e.code === "Space") $("comparePlay").click();
  else if (e.code === "KeyT") toggleTagging();
  else { video.pause(); seek(step(now(), KEYS[e.code] * (e.shiftKey ? FRAME : STEP), video.duration)); }
}, true);

// ---------------------------------------------------------------- the camera
// before each frame while open: the camera's whole view, its lens and the frame's shape, in the
// room's place beside the video (whatever else set the view, as the Decor panel's room did)
function project() {
  if (!L) return;
  const o = viewIn(L.room, innerWidth, innerHeight);
  V.camera.aspect = o.aspect;
  V.camera.setViewOffset(o.fullWidth, o.fullHeight, o.x, o.y, o.width, o.height);
}
V.frameHooks.push((before) => before && project());
function lens(deg) {
  V.camera.fov = deg;
  V.camera.updateProjectionMatrix();
  $("compareLens").value = String(Math.round(deg));
  $("compareLensOut").textContent = Math.round(deg) + "°";
  V.redraw();
}
function eye(m) {
  const v = window.house.flyView();
  if (v) window.house.flyView({ ...v, eye: m });
  $("compareEye").value = String(Math.round(m * 100));
  $("compareEyeOut").textContent = m.toFixed(2) + " m";
}
$("compareLens").oninput = (e) => lens(+e.target.value);
$("compareEye").oninput = (e) => eye(+e.target.value / 100);

// a kept view: the video at its time, the camera where it was
async function go(v) {
  await seek(v.t);
  window.house.flyView(v.view);
  lens(v.view.fov);
  eye(v.view.eye);
  find();
}
function find() {
  const v = viewAt(S.views, now());
  if (v !== cur) { cur = v; show(); }
  $("compareClock").textContent = clock(now()) + (Number.isFinite(video.duration) ? " / " + clock(video.duration) : "");
}

// ---------------------------------------------------------------- keeping a view
function camera() {
  const v = window.house.flyView();
  return v && { ...v, fov: Math.round(V.camera.fov * 10) / 10 };
}
async function keep() {
  const view = camera();
  if (!view || !video.videoWidth) return null;
  const at = now();
  say("compare.keeping");
  const r = await api("/api/compare/view", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: cur?.id, t: at, view, tags: cur?.tags || [] }) });
  S = r.state;
  cur = S.views.find((v) => v.id === r.id);
  await Promise.all([snap(r.id, "video", frameShot()), snap(r.id, "render", renderShot())]);
  say("compare.keptAt", { at: clock(at) });
  show();
  return r.id;
}
$("compareKeep").onclick = () => keep().catch((e) => say("compare.failed", { why: e.message }));
async function snap(id, which, blob) {
  if (blob) await fetch(`/api/compare/snap?id=${id}&which=${which}&${q()}`, { method: "POST", body: await blob });
}
const jpeg = (c) => new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));
function frameShot() {
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  return jpeg(c);
}
// the room as drawn, cut to its place beside the frame (the same view, the same shape)
function renderShot() {
  for (const f of V.frameHooks) f(true);
  V.renderer.render(V.scene, V.camera);
  for (const f of V.frameHooks) f(false);
  const k = V.canvas.width / innerWidth, r = L.room;
  const c = document.createElement("canvas");
  c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
  c.getContext("2d").drawImage(V.canvas, r.left * k, r.top * k, r.width * k, r.height * k, 0, 0, c.width, c.height);
  return jpeg(c);
}
$("compareForget").onclick = async () => {
  if (!cur) return;
  S = await api("/api/compare/view/" + cur.id, { method: "DELETE" });
  cur = null;
  show();
};
// every kept view's pictures taken again, the room as it is drawn now (after a fix): flown to each
// in turn, a few frames let draw so the splats settle, then both pictures
async function retake() {
  const all = S.views.length;
  for (let k = 0; k < all; k++) {
    say("compare.retaking", { n: k + 1, all });
    const v = S.views[k];
    await go(v);
    V.redraw();
    for (let f = 0; f < 6; f++) await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 400));
    await Promise.all([snap(v.id, "video", frameShot()), snap(v.id, "render", renderShot())]);
  }
  say("compare.retaken", { all });
}
$("compareRetake").onclick = () => retake().catch((e) => say("compare.failed", { why: e.message }));
$("compareExport").onclick = () => { $("compareExport").href = "/api/compare/export?" + q(); };

// ---------------------------------------------------------------- tags on the frame
function setTagging(on) {
  tagging = on;
  $("compareTag").setAttribute("aria-pressed", String(on));
  $("compareFrame").classList.toggle("tagging", on);
  if (!on) note(null);
}
$("compareTag").onclick = () => setTagging(!tagging);
// T: out of tagging, or in; in with the pointer on the video or the room, the note opens at that spot
function toggleTagging() {
  if (tagging) return setTagging(false);
  setTagging(true);
  const s = pointer && spot(...pointer);
  if (s && S.video) note(s, pointer);
}
// a point in the window -> { uv: [u, v] on the frame, on: "video" | "room" }, from either side; or null
const spot = (x, y) => spotIn(x, y, L);
$("compareFrame").addEventListener("click", (e) => {
  if (!tagging || e.target.closest("form")) return;
  const s = spot(e.clientX, e.clientY);
  if (s) note(s, [e.clientX, e.clientY]);
});
// the crosshair: where the pointer is on one, the same spot on the other
function cross(uv) {
  for (const [id, r] of [["compareCrossVideo", L?.video], ["compareCrossRoom", L?.room]]) {
    const c = $(id);
    c.hidden = !uv || !r;
    if (c.hidden) continue;
    const [x, y] = fromFrame(uv[0], uv[1], r);
    c.style.left = x + "px"; c.style.top = y + "px";
  }
}
addEventListener("pointermove", (e) => { pointer = [e.clientX, e.clientY]; if (L) cross(spot(...pointer)?.uv); });
for (const k of KINDS) {
  const b = document.createElement("button");
  b.type = "button"; b.dataset.kind = k; b.textContent = t("compare.kind." + k);
  b.onclick = () => { for (const x of $("compareKinds").children) x.classList.toggle("on", x === b); };
  $("compareKinds").append(b);
}
// the note's form by the spot clicked ({uv, on}; at: where in the window), or put away (null)
function note(s, at) {
  pending = s;
  if (!s && $("compareNote").contains(document.activeElement)) document.activeElement.blur();   // (the keys are the tool's again)
  $("compareNote").hidden = !s;
  pins();
  if (!s) return;
  const [x, y] = at || fromFrame(s.uv[0], s.uv[1], L[s.on]);
  const f = $("compareNote");
  f.style.left = Math.min(innerWidth - 280, Math.max(8, x + 12)) + "px";
  f.style.top = Math.min(innerHeight - 200, Math.max(8, y - 20)) + "px";
  f.reset();
  for (const b of $("compareKinds").children) b.classList.toggle("on", b.dataset.kind === "missing");
  f.elements.note.focus();
}
$("compareNoteCancel").onclick = () => note(null);
$("compareNote").onsubmit = async (e) => {
  e.preventDefault();
  const kind = $("compareKinds").querySelector(".on")?.dataset.kind || "missing";
  await tag(pending.uv[0], pending.uv[1], kind, e.target.elements.note.value, pending.on);
  note(null);
};
// a tag on the view at this time (kept first, with its pictures, if it wasn't); on: the side it was
// placed on, "video" or "room" (the same spot on the frame either way)
async function tag(x, y, kind, text, on = "video") {
  const id = cur ? cur.id : await keep();
  const v = S.views.find((w) => w.id === id);
  if (!v) return;
  const r = await api("/api/compare/view", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, t: v.t, view: v.view, tags: [...v.tags, { x, y, kind, note: text, on }] }) });
  S = r.state;
  cur = S.views.find((w) => w.id === id);
  show();
}
async function untag(k) {
  const tags = cur.tags.filter((_, j) => j !== k);
  const r = await api("/api/compare/view", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: cur.id, t: cur.t, view: cur.view, tags }) });
  S = r.state;
  cur = S.views.find((w) => w.id === r.id);
  show();
}

// ---------------------------------------------------------------- what the panel and the frame show
// the window less the panel (beside it on a wide screen, above it on a phone), under the top bar
function area() {
  const b = $("compareBar").getBoundingClientRect();
  if (innerWidth <= 600) return { left: 8, top: 56, width: innerWidth - 16, height: Math.max(80, b.top - 64) };
  return { left: 16, top: 64, width: Math.max(80, b.left - 32), height: innerHeight - 80 };
}
const box = (el, r) => Object.assign(el.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
function place() {
  if ($("compare").hidden) return;
  L = sideBySide(video.videoWidth || 9, video.videoHeight || 16, area());   // (a phone's frame until the video says)
  box(video, L.video);
  box($("compareRoom"), L.room);
  pins();
  project();
  V.redraw();
}
addEventListener("resize", place);
// the tags as numbered pins, on the frame and on the room
function pins() {
  const el = $("comparePins");
  el.replaceChildren();
  if (!L) return;
  const all = (cur ? cur.tags : []).map((g, k) => [g.x, g.y, String(k + 1), g.kind]);
  if (pending) all.push([pending.uv[0], pending.uv[1], "+", "new"]);
  for (const r of [L.video, L.room]) for (const [x, y, label, kind] of all) {
    const p = document.createElement("span");
    const [px, py] = fromFrame(x, y, r);
    p.className = "pin " + kind;
    p.textContent = label;
    p.style.left = px + "px"; p.style.top = py + "px";
    el.append(p);
  }
}
function show() {
  const has = !!S.video;
  $("compareNoVideo").hidden = has;
  $("compareTools").hidden = !has;
  $("compareForget").hidden = !cur;
  $("compareKeep").textContent = t(cur ? "compare.keepAgain" : "compare.keep");
  const sel = $("compareViews");
  sel.replaceChildren(new Option(t("compare.views", { n: S.views.length }), ""));
  for (const v of S.views) sel.append(new Option(clock(v.t) + (v.tags.length ? " · " + t("compare.tags", { n: v.tags.length }) : ""), v.id));
  sel.value = cur ? cur.id : "";
  const list = $("compareTags");
  list.replaceChildren();
  (cur ? cur.tags : []).forEach((g, k) => {
    const li = document.createElement("li"), name = document.createElement("span"), x = document.createElement("button");
    name.className = "name";
    name.textContent = `${k + 1}. ${t("compare.kind." + g.kind)}${g.note ? ": " + g.note : ""}`;
    x.className = "x"; x.textContent = "✕"; x.setAttribute("aria-label", t("compare.untag"));
    x.onclick = () => untag(k);
    li.append(name, x);
    list.append(li);
  });
  pins();
}

window.compare = {
  open, close, state: () => S, current: () => cur, time: () => now(), seek, keep, tag, retake, layout: () => L,
  use: async (blob, name) => {             // (tests: a video made in the page, uploaded as if picked)
    S = await api("/api/compare/video?name=" + encodeURIComponent(name), { method: "POST", body: blob });
    use(blob);
    show();
  },
};
