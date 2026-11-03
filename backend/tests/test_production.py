from uuid import uuid4

from fastapi.testclient import TestClient
from psycopg import sql
from pydantic import ValidationError
import pytest

from app import database, main
from app.config import Settings
from app.production import create_app

# Reuse the isolated PostgreSQL fixtures; no production database is contacted.
from test_api import context, TEST_PASSWORD  # noqa: F401


@pytest.fixture
def site(tmp_path):
    (tmp_path / "index.html").write_text("<html><body>IssueFlow export</body></html>")
    (tmp_path / "_next").mkdir()
    (tmp_path / "_next" / "app.js").write_text("console.log('app')")
    return tmp_path


def test_production_serves_only_exported_files_and_preserves_api_routes(context, site, monkeypatch):
    calls = []
    monkeypatch.setattr(main, "initialize_database", lambda: calls.append("initialized"))
    with TestClient(create_app(site)) as client:
        assert client.get("/").text == "<html><body>IssueFlow export</body></html>"
        assert client.get("/_next/app.js").status_code == 200
        assert client.get("/health").json()["database"] == "postgresql"
        assert client.get("/api/workspace").status_code == 401
        assert client.get("/api/unknown").status_code == 404
        assert client.post("/api/auth/signup", json={}).status_code == 404
        assert client.get("/.env").status_code == 404
        assert client.get("/../backend/.env").status_code == 404
        assert client.get("/openapi.json").status_code == 200
    assert calls == ["initialized"]


def test_production_same_origin_signin_sets_secure_cookie(context, site, monkeypatch):
    _, _, config = context
    origin = "https://issueflow.onrender.com"
    monkeypatch.setattr(main, "settings", lambda: config.model_copy(update={
        "cookie_secure": True, "cors_origins": [], "render_external_url": origin,
    }))
    with TestClient(create_app(site), base_url=origin) as client:
        response = client.post("/api/auth/login", json={"username": "susybegula", "password": TEST_PASSWORD}, headers={"origin": origin})
        assert response.status_code == 200
        assert "secure" in response.headers["set-cookie"].lower()
        assert "httponly" in response.headers["set-cookie"].lower()
        assert client.get("/api/workspace").status_code == 200
        assert client.patch("/api/profile", json={"name": "Hosted profile"}, headers={"origin": origin}).status_code == 200
        assert client.patch("/api/profile", json={"name": "Blocked"}, headers={"origin": "https://untrusted.example"}).status_code == 403
        assert client.post("/api/auth/logout", headers={"origin": origin}).status_code == 204
        assert client.get("/api/workspace").status_code == 401


def test_private_database_schema_is_created_and_preserves_account(context, monkeypatch):
    _, inspector, config = context
    schema = f"hosted_{uuid4().hex}"
    monkeypatch.setattr(database, "settings", lambda: config.model_copy(update={"database_schema": schema}))
    try:
        database.initialize_database()
        with database.connect() as db:
            assert db.execute("select current_schema() as name").fetchone()["name"] == schema
            assert db.execute("select count(*) as n from app_users").fetchone()["n"] == 1
            db.execute("update app_users set name = 'Preserved'")
        database.initialize_database()
        with database.connect() as db:
            assert db.execute("select name from app_users").fetchone()["name"] == "Preserved"
            assert db.execute("select count(*) as n from schema_migrations").fetchone()["n"] == 2
        # The original fixture's namespace is separate from the hosted namespace.
        assert inspector.execute("select name from app_users").fetchone()["name"] == "susybegula"
    finally:
        inspector.execute(sql.SQL("drop schema if exists {} cascade").format(sql.Identifier(schema)))


@pytest.mark.parametrize("schema", ["public,auth", "issueflow;drop", "../public", ""])
def test_schema_name_cannot_change_search_path_or_inject_sql(schema):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_schema=schema)


def test_production_requires_frontend_build(tmp_path):
    with pytest.raises(RuntimeError, match="Frontend export missing"):
        create_app(tmp_path)
