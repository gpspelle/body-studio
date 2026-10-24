// When the page draws a frame (viewer.js's loop): only when something changed, so the GPU (and a
// laptop's fan) rests while the body stands still. A frame is due when the camera moved (a drag,
// its damping, the turntable, a part moving it), while a part animates (keep: a walk through a
// room), until a moment after redraw(ms) (Spark has something new to show, a pose, any input),
// and every HEARTBEAT ms anyway, so a change nobody announced still shows. Free of three.js, so
// it is tested on its own (tests/js/draw.test.mjs).
export const HEARTBEAT = 250;                // ms

export class Drawing {
  constructor() { this.next = true; this.until = 0; this.drawnAt = -Infinity; }
  // draw the next frame, and every frame until `ms` from now
  redraw(now, ms = 0) { this.next = true; this.until = Math.max(this.until, now + ms); }
  // whether to draw the frame at `now`; when it says yes, the frame counts as drawn
  due(now, moved = false, keep = false) {
    if (!moved && !keep && !this.next && now > this.until && now - this.drawnAt < HEARTBEAT) return false;
    this.drawnAt = now;
    this.next = false;
    return true;
  }
}
