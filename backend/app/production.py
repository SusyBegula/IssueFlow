"""Serve the exported Next.js site and the API on one origin."""
from pathlib import Path

from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.staticfiles import StaticFiles

from .main import app as api


def create_app(frontend_directory: Path | None = None):
    directory = frontend_directory or Path(__file__).resolve().parents[2] / "frontend" / "out"
    if not (directory / "index.html").is_file():
        raise RuntimeError("Frontend export missing. Run `bash scripts/render-build.sh` before starting production.")
    website = Starlette(routes=[Mount("/", app=StaticFiles(directory=directory, html=True))])

    async def application(scope, receive, send):
        path = scope.get("path", "")
        api_path = path == "/api" or path.startswith("/api/") or path in {"/health", "/docs", "/openapi.json", "/redoc"} or path.startswith("/docs/")
        # Delegate lifespan as well, so database migrations run before traffic is accepted.
        target = api if scope["type"] != "http" or api_path else website
        await target(scope, receive, send)

    return application
