#!/bin/bash
# Publish all publishable packages to npm in dependency order.
# npm does NOT rewrite file: specs in published manifests — consumers would
# fail to resolve "../runtime" — so internal file: deps are rewritten to
# ^0.0.1 semver ranges before each publish, then the originals restored.
#
# Packages are published in dependency order:
#   types (no deps) -> runtime (no deps) -> client -> vite-plugin
# bridge is private ("private": true) and intentionally NOT published.
#
# 2FA: pass --otp <code> to use a one-time password (fresh code per package).
set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/../packages" && pwd)"
ORDER=(types runtime client vite-plugin)

OTP=""
if [[ "${1:-}" == "--otp" ]]; then
    OTP="${2:-}"
fi
OTP_ARGS=()
if [[ -n "$OTP" ]]; then
    OTP_ARGS=(--otp "$OTP")
fi

publish_one() {
    local name="$1"
    local dir="$PKG_DIR/$name"
    local pkg="$dir/package.json"
    local orig="$pkg.orig"
    local tmp="$pkg.pub"

    echo "── Preparing $name ..."
    # Snapshot original, rewrite file: deps -> ^0.0.1
    cp "$pkg" "$orig"
    node -e '
        const fs = require("fs");
        const p = process.argv[1];
        const d = JSON.parse(fs.readFileSync(p, "utf8"));
        for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
            if (!d[section]) continue;
            for (const [k, v] of Object.entries(d[section])) {
                if (typeof v === "string" && v.startsWith("file:")) {
                    d[section][k] = "^0.0.1";
                    console.log(`  ${section}.${k}: ${v} -> ^0.0.1`);
                }
            }
        }
        fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
    ' "$pkg"

    echo "── Publishing $name ..."
    if ! (cd "$dir" && npm publish --tag latest "${OTP_ARGS[@]}"); then
        echo "✗ publish failed for $name — restoring package.json"
        mv "$orig" "$pkg"
        exit 1
    fi

    echo "── Restoring $name package.json ..."
    mv "$orig" "$pkg"
    echo "✓ $name published"
    echo
}

echo "Verifying clean build before publish..."
(cd "$PKG_DIR/.." && npm run build >/dev/null 2>&1)
echo "✓ build ok"
echo

for p in "${ORDER[@]}"; do
    publish_one "$p"
done

echo "✅ All packages published: ${ORDER[*]}"
echo "Tag: latest (version 0.0.1)"
