// What the page is for at the moment, picked from the menu behind the name at the top left: style
// the clothes (the shop round the body: walk up to a rack and click what to wear), style the
// tattoos (in the tattoo studio: the tattoos and the pose), a room (rooms and decor: nothing worn
// or inked changes there) or the body's progress; and from the same menu a new body, the guide and
// the language. Each mode shows only its own tools: <body data-mode> and body.css hide the rest,
// wardrobe.js shows the shop only for the clothes, tattoo.js the joints only for the tattoos.
const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
export const MODES = ["clothes", "tattoos", "rooms", "progress"];
const house = () => window.house;

// the first time on a computer the clothes, as the page opened before; on a phone just the body
let mode = store.get("mode");
if (mode === null) mode = innerWidth <= 600 ? "none" : "clothes";
if (mode !== "none" && !MODES.includes(mode)) mode = "none";
let wantStudio = false;          // the tattoos asked for before the studio is listed
let wantRoom = false;            // a room asked for before the rooms are listed

// ---------------------------------------------------------------- the menu
function setMenu(open) {
  if (open) { $("modes").showModal(); mark(); } else if ($("modes").open) $("modes").close();
  $("menuBtn").setAttribute("aria-expanded", String(open));
}
$("menuBtn").onclick = () => setMenu(!$("modes").open);
$("modes").addEventListener("close", () => $("menuBtn").setAttribute("aria-expanded", "false"));
$("modes").addEventListener("click", (e) => {
  if (e.target === $("modes")) return setMenu(false);           // (a click outside the card)
  const b = e.target.closest("button, label");
  if (!b) return;
  if (b.dataset.mode) go(b.dataset.mode);
  setMenu(false);
});
$("newBody").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("pick").click(); } });
function mark() {
  for (const b of $("modes").querySelectorAll("button[data-mode]")) b.setAttribute("aria-current", String(b.dataset.mode === mode));
}

// ---------------------------------------------------------------- going into a mode
function label() {
  $("modeName").textContent = mode === "none" ? "" : t("modes.short." + mode);
  const head = $("studio").querySelector(".panel-head strong");
  head.textContent = t(mode === "clothes" ? "modes.clothesTitle" : mode === "tattoos" ? "modes.tattoosTitle" : "studio.open");
}
const panel = (id, open) => {
  // (each panel's own button or close button, so its code does what it always does)
  const shut = $(id).hidden;
  if (open && shut) $(id === "studio" ? "studioBtn" : "progressBtn").click();
  if (!open && !shut) $(id === "studio" ? "closeStudio" : id === "progress" ? "closeProgress" : "closeDecor").click();
};

function go(m) {
  mode = MODES.includes(m) ? m : "none";
  store.set("mode", mode);
  document.body.dataset.mode = mode;
  label();
  if (mode !== "rooms") {
    if ($("decor") && !$("decor").hidden) panel("decor", false);
    $("roomMenu").hidden || $("roomBtn").click();
  }
  if (mode !== "progress") panel("progress", false);
  dispatchEvent(new Event("modechange"));
  if (!app.viewer.file()) return;                  // (the rest once a body is shown)
  place();
}

// the room and the panel each mode has
function place() {
  const h = house();
  if (!h) return;
  wantStudio = wantRoom = false;
  if (mode === "clothes" || mode === "tattoos") panel("studio", true);
  else panel("studio", false);
  if (mode === "tattoos") {
    const s = h.studio();
    if (s) h.choose(s.file); else wantStudio = true;
  } else if (mode === "rooms") {
    const keep = store.get("mode:room"), rooms = h.rooms().filter((r) => r.name !== "_sample_studio");
    // the room it was in last, else the first one (filmed rooms come first, then the sample living room)
    const file = keep && h.rooms().some((r) => r.file === keep) ? keep : rooms[0]?.file || null;
    if (file) h.choose(file);
    else if (!h.rooms().length) wantRoom = true;
    else if ($("roomMenu").hidden) $("roomBtn").click();
  } else if (h.shown() || h.wanted()) h.choose(null);   // (also the room on its way, or kept from last time)
  if (mode === "progress") panel("progress", true);
  app.reframe();
}
addEventListener("roomslisted", () => {
  if (!app.viewer.file()) return;
  if (wantStudio && house().studio()) { wantStudio = false; house().choose(house().studio().file); }
  if (wantRoom && house().rooms().length) place();
});
// once a body is shown (the panel opened loads its skeleton), and each time another is picked
// the room to come back to in the rooms mode: the last one shown there
addEventListener("roomplaced", () => { if (mode === "rooms") store.set("mode:room", house().file()); });
addEventListener("bodyshown", () => { if (mode !== "none") place(); });
addEventListener("langchange", label);

document.body.dataset.mode = mode;
label();

// ---------------------------------------------------------------- for tests and scripts
// show(m): the mode's tools only, without moving the body into its room or opening its panel
function show(m) {
  mode = MODES.includes(m) ? m : "none";
  store.set("mode", mode);
  document.body.dataset.mode = mode;
  label();
  dispatchEvent(new Event("modechange"));
}
window.modes = { go, show, mode: () => mode, open: () => setMenu(true) };
