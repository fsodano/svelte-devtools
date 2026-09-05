#!/bin/bash
# Validate every package before publishing any package. Default: validation only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PUBLISH=false
PUBLISH_ARGS=(--access public)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish) PUBLISH=true; shift ;;
    --dry-run) PUBLISH=false; shift ;;
    --otp|--tag)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      PUBLISH_ARGS+=("$1" "$2"); shift 2 ;;
    *) echo "Usage: $0 [--dry-run|--publish] [--otp CODE] [--tag TAG]" >&2; exit 2 ;;
  esac
done

npm run build
npm run check
npx vitest run --maxWorkers=2
npm run test:e2e
node scripts/verify-stress.mjs
node scripts/verify-ssr-sql.mjs
npm run build --prefix tests/apps/svelte-kit
TODO_SQLITE_DB_PATH="$(mktemp -d)/todos.db" npm run build --prefix tests/apps/todo-sqlite
node scripts/verify-production.mjs
npm run release:check

if [[ "$PUBLISH" != true ]]; then
  echo "Release validation passed. No packages published. Use --publish to publish."
  exit 0
fi
# The same manifest graph drives the pack gate and publishing order.
# Manifests must already use registry-safe versions; never rewrite dependencies.
while IFS= read -r package; do
  npm publish --workspace "$package" "${PUBLISH_ARGS[@]}"
done < <(node scripts/release-check.mjs --list)
