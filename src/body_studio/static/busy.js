// What the page is still doing before the body can be used (loading it, finding its skeleton,
// getting it ready to move, the clothes panel and what is worn, the shop around it, a room), shown
// as one loading screen, the logo turning, with a line saying what, until all of it is done. Free
// of the page so it can be tested on its own (tests/js/busy.test.mjs, run by
// tests/unit/test_busy_js.py). As loading indicators usually go: nothing for a step that is over in
// a moment (no flash), once shown kept long enough to see (no flicker) and faded out, and after a
// while a word on why it takes long. Design: docs/loading.md.

export const SHOW_AFTER = 400;   // ms before a step shows the loading screen
export const KEEP_FOR = 600;     // ms it stays once shown, at the least
export const FADE = 350;         // ms it takes to fade out once everything is done
export const SLOW_AFTER = 8000;  // ms before the line on why it takes long

// render({shown, text, slow, waiting}): called whenever what to show changes (waiting: a step is
// still under way; shown and not waiting: fading out). `now`, `later` and `cancel`
// are the clock and timers (performance.now, setTimeout and clearTimeout on the page).
export class Busy {
  constructor(render, { now = () => performance.now(), later = (f, ms) => setTimeout(f, ms), cancel = (id) => clearTimeout(id) } = {}) {
    Object.assign(this, { render, now, later, cancel });
    this.steps = new Map();       // key -> {text, slow, since}, in the order they began
    this.shownAt = null;
    this.endedAt = null;          // when the last step ended, while shown
    this.timer = null;
    this.last = "";
    this.lastText = "";           // (still said while it fades out)
  }

  // `text`: what the step is doing (null: it is done); `slow`: why it may take long; `now`: show
  // at once (before a step that holds the page, when a timer couldn't fire to show it)
  set(key, text, { slow = "", now = false } = {}) {
    if (text == null) { if (this.steps.delete(key) && !this.steps.size) this.endedAt = this.now(); }
    else this.steps.set(key, { text, slow, since: this.steps.get(key)?.since ?? this.now() });
    if (now && text != null && this.shownAt === null) this.shownAt = this.now();
    this.update();
  }

  get busy() { return this.steps.size > 0; }

  // what to show at this moment, and when it next changes by itself
  state() {
    const t = this.now(), step = [...this.steps.values()].pop();
    if (step) {
      const first = Math.min(...[...this.steps.values()].map((s) => s.since));
      if (this.shownAt === null && t - first >= SHOW_AFTER) this.shownAt = t;
      if (this.shownAt === null) return { shown: false, waiting: true, text: "", slow: "", next: first + SHOW_AFTER - t };
      const slow = step.slow && t - step.since >= SLOW_AFTER;
      return { shown: true, waiting: true, text: step.text, slow: slow ? step.slow : "", next: step.slow && !slow ? step.since + SLOW_AFTER - t : null };
    }
    const until = this.shownAt === null ? -Infinity : Math.max(this.shownAt + KEEP_FOR, this.endedAt + FADE);
    if (t < until) return { shown: true, waiting: false, text: this.lastText, slow: "", next: until - t };
    this.shownAt = null;
    return { shown: false, waiting: false, text: "", slow: "", next: null };
  }

  update() {
    if (this.timer !== null) { this.cancel(this.timer); this.timer = null; }
    const s = this.state();
    if (s.shown && s.text) this.lastText = s.text;
    if (s.next !== null) this.timer = this.later(() => { this.timer = null; this.update(); }, Math.max(0, s.next));
    const key = JSON.stringify([s.shown, s.waiting, s.text, s.slow]);
    if (key === this.last) return;
    this.last = key;
    this.render({ shown: s.shown, waiting: s.waiting, text: s.text, slow: s.slow });
  }
}
