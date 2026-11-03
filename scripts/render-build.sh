#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

# Render's Python runtime also includes Node/npm. Install the pinned uv explicitly
# because the Python project lives in backend/, rather than the service root.
if [[ "$(uv --version 2>/dev/null || true)" != "uv 0.13.6"* ]]; then
  python -m pip install 'uv==0.13.6'
fi
uv sync --locked --no-dev --project backend --python "$(command -v python)"
npm ci --prefix frontend --include=dev
NEXT_PUBLIC_API_URL=/ NEXT_TELEMETRY_DISABLED=1 npm run build --prefix frontend
