"""Run backend integration tests against a dedicated local test database."""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
from app.config import settings

url = urlsplit(settings().database_url.get_secret_value())
test_url = os.environ.get("TEST_DATABASE_URL") or urlunsplit(url._replace(path=url.path + "_test"))
result = subprocess.run([sys.executable, "-m", "pytest", *sys.argv[1:]], cwd=root / "backend", env={**os.environ, "TEST_DATABASE_URL": test_url})
raise SystemExit(result.returncode)
