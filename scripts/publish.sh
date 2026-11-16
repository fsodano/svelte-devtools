#!/bin/bash
# Validate every package before publishing any package. Default: validation only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PUBLISH=false
SKIP_VALIDATION=false
PUBLISH_ARGS=(--access public --registry https://registry.npmjs.org/)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish) PUBLISH=true; shift ;;
    --dry-run) PUBLISH=false; shift ;;
    --skip-validation) SKIP_VALIDATION=true; shift ;;
    --otp|--tag)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      PUBLISH_ARGS+=("$1" "$2"); shift 2 ;;
    *) echo "Usage: $0 [--dry-run|--publish] [--skip-validation] [--otp CODE] [--tag TAG]" >&2; exit 2 ;;
  esac
done

if [[ "$SKIP_VALIDATION" == true ]]; then
  # The slow gates are skipped. The build stays, because the tarballs must
  # carry the current dist. The package gate stays, because it checks the
  # metadata and proves every package packs.
  echo "Skipping the test, browser, stress, SSR, production, and consumer checks."
  echo "Run the full 'bash scripts/publish.sh --dry-run' before a release you care about."
  npm run build
  npm run release:check
else
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
  node scripts/verify-package-consumer.mjs
fi

if [[ "$PUBLISH" != true ]]; then
  echo "Release validation passed. No packages published. Use --publish to publish."
  exit 0
fi
# The same manifest graph drives the pack gate and publishing order.
# Manifests must already use registry-safe versions; never rewrite dependencies.
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
RELEASE_VERSION="$(node -p "require('./package.json').version")"
while IFS= read -r package; do
  # A publish can stop part way through, for example when the registry rejects
  # one package. Skip what is already on the registry so the script can run
  # again without failing on the packages that made it.
  if npm view "$package@$RELEASE_VERSION" version >/dev/null 2>&1; then
    echo "Already published, skipping: $package@$RELEASE_VERSION"
    continue
  fi
  npm pack --workspace "$package" --pack-destination "$STAGING" --json > "$STAGING/pack.json"
  TARBALL="$(node -e 'import("./scripts/npm-pack-output.mjs").then((m)=>{process.stdout.write(m.packFilenameFromFile(process.argv[1]))})' "$STAGING/pack.json")"
  # Publish the verified contents without inheriting project-level npm credentials.
  if ! (cd "$STAGING" && npm publish "$TARBALL" "${PUBLISH_ARGS[@]}"); then
    echo >&2
    echo "The publish of $package failed." >&2
    echo "If the error was EOTP, npm needs a two-factor code for this account:" >&2
    echo "  - run this in an interactive terminal, so npm can open the passkey challenge in a browser, or" >&2
    echo "  - pass a recovery code with --otp <code>. A recovery code does not expire, and npm asks once per package." >&2
    echo "  - run the same command again. Packages already on the registry are skipped." >&2
    exit 1
  fi
done < <(node scripts/release-check.mjs --list)
