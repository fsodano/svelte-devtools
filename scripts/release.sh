#!/bin/bash
# Keep one release pipeline, including when called outside the repository root.
set -euo pipefail
exec bash "$(dirname "$0")/publish.sh" "$@"
