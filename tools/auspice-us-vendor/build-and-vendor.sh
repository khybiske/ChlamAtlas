#!/usr/bin/env bash
# Builds the patched auspice.us client and copies the static output into
# web/vendor/auspice-us/, rewriting the absolute /dist/ asset paths baked
# into index.html so they resolve correctly when served from that nested
# path instead of site root.
#
# The entry <script> tags in index.html are not the only place /dist/ is
# hardcoded: webpack's runtime chunk also bakes in its own public path
# (minified as `.p="/dist/"`), used at runtime to lazy-load code-split
# chunks (e.g. the tree-rendering code, only needed after a dataset loads).
# Rewriting only index.html leaves that runtime path stale — the splash
# screen loads fine, but the app hangs on the loading spinner the moment
# it tries to fetch a lazy chunk. Fix: rewrite the same literal string in
# every JS file under dist/, not just index.html.
set -euo pipefail
cd "$(dirname "$0")"

npm install
npm run build

rm -rf ../../web/vendor/auspice-us
mkdir -p ../../web/vendor/auspice-us
cp -r dist ../../web/vendor/auspice-us/dist
sed 's#/dist/#/web/vendor/auspice-us/dist/#g' index.html > ../../web/vendor/auspice-us/index.html
find ../../web/vendor/auspice-us/dist -name '*.js' -exec sed -i '' 's#"/dist/"#"/web/vendor/auspice-us/dist/"#g' {} +

# Auspice's client bundle ships with Nextstrain's own default Mapbox public
# token baked in, used for the map panel's background tiles. We don't use
# the map panel (ChlamAtlas's phylogeny dataset has no geo_resolutions, so
# it never renders), and GitHub's push protection flags the token pattern
# regardless of it being a public (pk.) token, not a secret one. Redact it
# at the source rather than allow-listing the flag — if a future dataset
# needs the map panel, get ChlamAtlas's own Mapbox token and set it here
# instead of re-enabling Nextstrain's.
# Matched by its surrounding context (any pk.* value directly following
# access_token=) rather than the literal token value, so this script's own
# source never contains a plaintext, token-shaped substring that could
# itself trip GitHub's secret scanning.
find ../../web/vendor/auspice-us/dist -name '*.js' -exec sed -i '' \
  's#access_token=pk\.[A-Za-z0-9_.-]*#access_token=pk.disabled#g' {} +

# Drop precompressed .br/.gz siblings: they're a stale binary snapshot of
# each .js file's PRE-patch content (compression happens during the
# webpack build, before either sed pass above runs), and text-patching a
# compressed file in place isn't meaningful. We don't need them —
# performance-only, and most static hosts (including Vercel) compress on
# the fly anyway. Deleting them here means any future patch added to this
# script can never leave a stale/corrupted compressed artifact behind.
find ../../web/vendor/auspice-us/dist -name '*.br' -o -name '*.gz' | xargs rm -f

echo "Built and vendored to web/vendor/auspice-us/"
