// The worker that makes the catalogue's pictures (decorlook.js picture) on an OffscreenCanvas, so
// drawing forty-odd starters never holds up the page: asked {key, id, colour}, it answers {key,
// blob} with a PNG, or {key, blob: null} when it can't. Started by decorate.js.
import { STARTERS, bounds, starterShape } from "/static/decor.js";
import { geometry, picture } from "/static/decorlook.js";

const canvas = new OffscreenCanvas(240, 240);
self.onmessage = async ({ data: { key, id, colour } }) => {
  let blob = null;
  try {
    if (STARTERS[id]) {
      const g = geometry(starterShape(id, colour || undefined));
      blob = await picture(g, bounds(g.attributes.position.array), 120, canvas).convertToBlob({ type: "image/png" });
      g.dispose();
    }
  } catch (e) { console.warn("decor picture", id, e); }
  self.postMessage({ key, blob });
};
