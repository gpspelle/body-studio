// The progress panel: one person's tape measures, body fat and scans over time.
// Tape: latest value, change since the first entry (grey when it is within measurement noise),
// and a small line of every entry. Body fat: one equation for the whole series, with its error.
// Scans: the circumference at every height of two dates, drawn over each other.
const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const NEW = "__new";
const ROWS = [["weight_kg", "prog.weight", "kg"], ["waist_cm", "prog.waist", "cm"],
              ["neck_cm", "prog.neck", "cm"], ["hip_cm", "prog.hips", "cm"]];
const SVG = "http://www.w3.org/2000/svg";

let people = [], data = null, compareTo = null, polling = null;

// ---------------------------------------------------------------- formatting
const lang = () => window.i18n.lang;
const num = (v) => v.toLocaleString(lang(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + num(Math.abs(v));
function day(iso) {
  const d = new Date(iso + "T12:00:00");
  const opts = { day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(lang(), opts);
}
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// ---------------------------------------------------------------- server
async function api(path, method = "GET", body) {
  const r = await fetch(path, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(t(`err.${d.code || "bad_request"}`));
  return d;
}

// ---------------------------------------------------------------- open and close
function setOpen(open) {
  $("progress").hidden = !open;
  $("progressBtn").setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("with-panel", open);
  store.set("progress:open", open ? "1" : "");
  app.reframe();
  if (open) loadPeople();
}
$("progressBtn").onclick = () => setOpen($("progress").hidden);
$("closeProgress").onclick = () => setOpen(false);
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("progress").hidden) setOpen(false); });

async function loadPeople(pick) {
  people = await api("/api/people");
  const sel = $("who");
  const chosen = pick || sel.value || store.get("progress:person");
  sel.replaceChildren(...people.map((p) => { const o = el("option", "", p.name); o.value = p.id; return o; }),
                      Object.assign(el("option", "", t("prog.newPerson")), { value: NEW }));
  sel.value = people.some((p) => p.id === chosen) ? chosen : people.length ? people[0].id : NEW;
  await pickPerson();
}
$("who").onchange = () => pickPerson();

async function pickPerson() {
  const id = $("who").value;
  $("personForm").hidden = id !== NEW;
  $("personView").hidden = id === NEW;
  if (id === NEW) { data = null; $("personForm").elements.name.focus(); return; }
  store.set("progress:person", id);
  compareTo = null;
  render(await api("/api/people/" + encodeURIComponent(id)));
}

// ---------------------------------------------------------------- forms
function formError(form, e) { form.querySelector(".err").textContent = e ? e.message : ""; }

$("personForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const v = f.elements;
    const p = await api("/api/people", "POST", { name: v.name.value, sex: v.sex.value, height_cm: v.height_cm.value });
    formError(f); f.reset();
    await loadPeople(p.person.id);
  } catch (err) { formError(f, err); }
};

$("tapeForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, body = { date: f.elements.date.value };
  for (const [k] of ROWS) if (f.elements[k].value !== "") body[k] = f.elements[k].value;
  try {
    render(await api(`/api/people/${data.person.id}/tape`, "POST", body));
    formError(f);
    for (const [k] of ROWS) f.elements[k].value = "";
  } catch (err) { formError(f, err); }
};

$("addScan").onclick = async () => {
  const b = app.current();
  if (!b) return;
  try {
    render(await api(`/api/people/${data.person.id}/scans`, "POST", { body: b.id }));
    $("scanErr").textContent = "";
  } catch (err) { $("scanErr").textContent = err.message; }
};

// ---------------------------------------------------------------- drawing
function sparkline(points, noise, w = 72, h = 22) {
  const s = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, class: "spark", "aria-hidden": "true" });
  if (points.length < 2) return s;
  // at least twice the noise tall, so changes within the noise draw as a flat line
  const vs = points.map((p) => p[1]), mid = (Math.min(...vs) + Math.max(...vs)) / 2;
  const span = Math.max(Math.max(...vs) - Math.min(...vs), 2 * (noise || 1)), lo = mid - span / 2;
  const xy = vs.map((v, i) => [2 + (i / (vs.length - 1)) * (w - 4), h - 3 - ((v - lo) / span) * (h - 6)]);
  s.append(svgEl("polyline", { points: xy.map((p) => p.join(",")).join(" "), class: "line" }));
  const [x, y] = xy[xy.length - 1];
  s.append(svgEl("circle", { cx: x, cy: y, r: 2.2, class: "dot" }));
  return s;
}

// one row: name, latest value, change since the first entry, every entry as a small line
function row(label, unit, c) {
  const r = el("div", "row");
  r.append(el("span", "name", t(label)));
  if (c.last == null) { r.append(el("span", "value muted", "–")); return r; }
  r.append(el("span", "value", `${num(c.last)} ${unit}`), sparkline(c.points, c.noise));
  const note = c.points.length < 2 ? t("prog.first")
    : c.beyond_noise ? t("prog.since", { change: `${signed(c.since_first)} ${unit}`, date: day(c.first_date) })
    : t("prog.same", { date: day(c.first_date) });
  r.append(el("span", "change" + (c.beyond_noise ? "" : " muted"), note));
  return r;
}

function fatChart(c) {
  const s = $("fatChart");
  s.replaceChildren();
  if (c.points.length < 2) { s.hidden = true; return; }
  s.hidden = false;
  const W = 300, H = 64, pad = 6;
  const time = c.points.map((p) => new Date(p[0] + "T12:00:00").getTime());
  const vs = c.points.map((p) => p[1]);
  const mid = (Math.min(...vs) + Math.max(...vs)) / 2;               // at least 4 points tall
  const half = Math.max((Math.max(...vs) - Math.min(...vs)) / 2, 2), lo = mid - half, hi = mid + half;
  const t0 = time[0], t1 = time[time.length - 1] || t0 + 1;
  const x = (tm) => pad + ((tm - t0) / (t1 - t0 || 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  s.append(svgEl("polyline", { points: vs.map((v, i) => `${x(time[i])},${y(v)}`).join(" "), class: "line" }));
  vs.forEach((v, i) => s.append(svgEl("circle", { cx: x(time[i]), cy: y(v), r: 3, class: "dot" })));
}

// circumference (x) at every height (y) for two scans: where on the body it changed
function profileChart(now, before) {
  const s = $("profileChart");
  s.replaceChildren();
  const all = [...now.profile, ...(before ? before.profile : [])];
  const W = 300, H = 200, padL = 6, padR = 70;
  const cs = all.map((p) => p[1]), lo = Math.min(...cs), hi = Math.max(...cs);
  const fs = all.map((p) => p[0]), f0 = Math.min(...fs), f1 = Math.max(...fs);
  const x = (c) => padL + ((c - lo) / (hi - lo || 1)) * (W - padL - padR);
  const y = (f) => H - 4 - ((f - f0) / (f1 - f0 || 1)) * (H - 8);
  const line = (scan, cls) => svgEl("polyline", { points: scan.profile.map((p) => `${x(p[1])},${y(p[0])}`).join(" "), class: cls });
  if (before) s.append(line(before, "line before"));
  s.append(line(now, "line"));
  // the three tape levels, with the change at each, on the right
  const levels = [["neck_cm", "prog.neck"], ["waist_cm", "prog.waist"], ["hip_cm", "prog.hips"]];
  for (const [k, label] of levels) {
    if (!now.levels) continue;
    const at = y(now.levels[k]);
    const d = before ? now.measurements[k] - before.measurements[k] : null;
    const tx = svgEl("text", { x: W - padR + 6, y: at + 4, class: "label" + (d != null && Math.abs(d) < 1 ? " muted" : "") });
    tx.textContent = d == null ? t(label) : `${t(label)} ${signed(d)}`;
    s.append(svgEl("line", { x1: padL, x2: W - padR, y1: at, y2: at, class: "level" }), tx);
  }
  const legend = (scan, cls, i) => {
    const g = svgEl("text", { x: W - padR + 6, y: H - 18 + i * 14, class: "label " + cls });
    g.textContent = day(scan.date);
    return g;
  };
  s.append(legend(now, "now", 0));
  if (before) s.append(legend(before, "before", 1));
}

function render(d) {
  data = d;
  const p = d.person;
  // body fat
  const bf = d.body_fat;
  $("fatNow").replaceChildren();
  if (bf.equation && bf.last != null) {
    const big = el("p", "big", `${num(bf.last)} %`);
    $("fatNow").append(big, el("p", "small" + (bf.beyond_noise ? "" : " muted"), bf.points.length < 2 ? t("prog.first")
      : bf.beyond_noise ? t("prog.since", { change: signed(bf.since_first), date: day(bf.first_date) })
      : t("prog.same", { date: day(bf.first_date) })));
    $("fatNote").textContent = `${t(`prog.eq.${bf.equation}`)}. ${t("prog.band", { band: num(bf.error_band) })}`;
  } else {
    $("fatNote").textContent = t("prog.noBodyFat");
  }
  fatChart(bf);
  // tape
  $("tapeRows").replaceChildren(...ROWS.map(([k, label, unit]) => row(label, unit, d.tape[k])));
  const f = $("tapeForm");
  if (!f.elements.date.value) f.elements.date.value = today();
  const list = $("entries");
  list.hidden = !d.entries.length;
  list.querySelector("summary").textContent = t("prog.entries", { n: d.entries.length });
  list.querySelector("ul").replaceChildren(...d.entries.map((e) => {
    const li = el("li");
    const parts = ROWS.filter(([k]) => e[k] != null).map(([k, label, unit]) => `${t(label)} ${num(e[k])} ${unit}`);
    li.append(el("span", "", `${day(e.date)}: ${parts.join(", ")}`));
    const del = el("button", "link", "✕");
    del.setAttribute("aria-label", t("prog.delete"));
    del.onclick = async () => {
      if (!confirm(t("prog.deleteAsk", { date: day(e.date) }))) return;
      render(await api(`/api/people/${p.id}/entries/${e.id}`, "DELETE"));
    };
    li.append(del);
    return li;
  }));
  renderScans();
}

function renderScans() {
  const d = data, cur = app.current();
  $("noScans").hidden = d.scans.length > 0;
  $("addScan").hidden = !cur || d.scans.some((s) => s.body === cur.id);
  $("scanList").replaceChildren(...d.scans.map((s) => {
    const b = el("button", "", day(s.date));
    b.classList.toggle("on", !!cur && cur.id === s.body);
    if (s.status === "measuring" || s.status === "stale") b.append(el("span", "muted", " · " + t("prog.measuring")));
    if (s.status === "failed") b.title = t("prog.scanFailed", { error: s.error || "" });
    b.onclick = () => app.show(s.body);
    return b;
  }));
  const done = d.scans.filter((s) => s.status === "done");
  $("scanRows").replaceChildren(...(done.length ? ROWS.slice(1).map(([k, label, unit]) => row(label, unit, d.scan_rows[k])) : []));
  // the body on screen against the first scan (or, for the first scan, against the next one)
  const now = done.find((s) => cur && s.body === cur.id) || done[done.length - 1];
  const before = now && done.find((s) => s !== now && s.date <= now.date) || done.find((s) => s !== now);
  $("profile").hidden = !now;
  if (now) profileChart(now, before);
  // measuring happens on the server: look again until it's done
  clearTimeout(polling);
  if (d.scans.some((s) => s.status === "measuring" || s.status === "stale")) {
    polling = setTimeout(async () => { if (data && data.person.id === d.person.id) render(await api("/api/people/" + d.person.id)); }, 2000);
  }
}

addEventListener("bodyshown", () => { if (data && !$("progress").hidden) renderScans(); });
addEventListener("langchange", () => { if (data) render(data); });
if (store.get("progress:open")) setOpen(true);
