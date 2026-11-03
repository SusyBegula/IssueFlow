#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir/backend"
exec .venv/bin/python -m uvicorn app.production:create_app --factory --host 0.0.0.0 --port "${PORT:-10000}"
