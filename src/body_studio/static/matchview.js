// The maths of the Compare tool (compare.js): where the video's frame and the room sit side by
// side, the camera's view cut to the room's place, a click on either as a spot on the frame (0..1
// from its top left) and back, the video's clock, and the kept view nearest a time. Free of three.js and the DOM: tests/js/matchview.test.mjs.

// The frame (vw by vh) fitted whole inside a box (bw by bh), centred: { left, top, width, height }.
export function frameRect(vw, vh, bw, bh) {
  if (!(vw > 0 && vh > 0 && bw > 0 && bh > 0)) return { left: 0, top: 0, width: bw || 0, height: bh || 0 };
  const k = Math.min(bw / vw, bh / vh), width = vw * k, height = vh * k;
  return { left: (bw - width) / 2, top: (bh - height) / 2, width, height };
}

// The video's frame and the room beside it, the same size, as big as fit in `area` ({left, top,
// width, height}: the window less the panel), `gap` px apart and centred as a pair: side by side
// in a wide area, one over the other in a tall one. -> { video: rect, room: rect, across }.
export function sideBySide(vw, vh, area, gap = 8) {
  const across = area.width >= area.height;
  const half = across ? { w: (area.width - gap) / 2, h: area.height } : { w: area.width, h: (area.height - gap) / 2 };
  const f = frameRect(vw, vh, Math.max(1, half.w), Math.max(1, half.h));
  const pairW = across ? 2 * f.width + gap : f.width, pairH = across ? f.height : 2 * f.height + gap;
  const left = area.left + (area.width - pairW) / 2, top = area.top + (area.height - pairH) / 2;
  const video = { left, top, width: f.width, height: f.height };
  const room = across ? { ...video, left: left + f.width + gap } : { ...video, top: top + f.height + gap };
  return { video, room, across };
}

// The camera's view offset (three.js setViewOffset) for a canvas `cw` by `ch` that shows the
// camera's whole view, its lens and shape, inside rect r and nothing cut: the rect is the full
// view, the canvas a window onto it. -> { fullWidth, fullHeight, x, y, width, height, aspect }.
export function viewIn(r, cw, ch) {
  return { fullWidth: r.width, fullHeight: r.height, x: -r.left, y: -r.top, width: cw, height: ch, aspect: r.width / r.height };
}

// A point in the box -> [u, v] on the frame, or null off it.
export function toFrame(px, py, r) {
  const u = (px - r.left) / r.width, v = (py - r.top) / r.height;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null;
}

// [u, v] on the frame -> the point in the box.
export function fromFrame(u, v, r) {
  return [r.left + u * r.width, r.top + v * r.height];
}

// The time `dt` seconds on from t, kept inside the video (0 to its length).
export function step(t, dt, length) {
  const end = Number.isFinite(length) && length > 0 ? length : Infinity;
  return Math.max(0, Math.min(end, Math.round((t + dt) * 1000) / 1000));
}

// Seconds as the video's clock: 83.5 -> "1:23.5" (as compare.py writes them).
export function clock(t) {
  const d = Math.round(Math.max(0, t) * 10) / 10, m = Math.floor(d / 60), s = d - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

// The kept view at time t (within tol seconds), the nearest one; or null.
export function viewAt(views, t, tol = 0.25) {
  let best = null;
  for (const v of views || []) if (Math.abs(v.t - t) <= tol && (!best || Math.abs(v.t - t) < Math.abs(best.t - t))) best = v;
  return best;
}

// The kept views before and after time t: { prev, next } (either null).
export function around(views, t) {
  let prev = null, next = null;
  for (const v of views || []) {
    if (v.t < t - 1e-3 && (!prev || v.t > prev.t)) prev = v;
    if (v.t > t + 1e-3 && (!next || v.t < next.t)) next = v;
  }
  return { prev, next };
}

export const KINDS = ["missing", "wrong", "remove", "note"];
