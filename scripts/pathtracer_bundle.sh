#!/bin/sh
# Bundles the path tracer Take a photo uses (darkroom.js) into src/body_studio/static/pathtracer/:
# three-gpu-pathtracer and three-mesh-bvh as one module that imports three from the page's own
# copy (the import map's "three" and "three/addons/": splat-studio's, so there is one three).
# Versions: the newest that still accept splat-studio's three (r180). Needs Node (npx).
set -e
PT=0.0.24 BVH=0.9.9 THREE=0.180.0
ROOT=$(cd "$(dirname "$0")/.." && pwd) OUT="$ROOT/src/body_studio/static/pathtracer"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm i -s "three@$THREE" "three-gpu-pathtracer@$PT" "three-mesh-bvh@$BVH" xatlas-web@0.1.0 esbuild@0.25 >/dev/null
echo 'export { WebGLPathTracer, GradientEquirectTexture } from "three-gpu-pathtracer";' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --external:three --external:'three/*' \
  --external:xatlas-web --legal-comments=eof --outfile=bundle.js
mkdir -p "$OUT"
{ echo "// three-gpu-pathtracer $PT (MIT, Garrett Johnson) with three-mesh-bvh $BVH (MIT, Garrett Johnson),"
  echo "// bundled by scripts/pathtracer_bundle.sh: three is imported from the page's own (\"three\"). Licences: LICENSE here."
  sed 's#"three/examples/jsm/#"three/addons/#g' bundle.js; } > "$OUT/pathtracer.js"
{ echo "three-gpu-pathtracer:"; cat node_modules/three-gpu-pathtracer/LICENSE; echo
  echo "three-mesh-bvh:"; cat node_modules/three-mesh-bvh/LICENSE; } > "$OUT/LICENSE"
