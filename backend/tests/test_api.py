import os
import base64
from io import BytesIO
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.rows import dict_row
from PIL import Image

from app import database, main
from app.config import Settings
from app.schemas import LoginInput
from app.security import hash_password, hash_session, verify_password

TEST_PASSWORD = "test-password"


@pytest.fixture
def context(monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Run with scripts/test-backend.py after `npm run db:test` to use isolated PostgreSQL tests.")
    from urllib.parse import urlparse
    if not urlparse(url).path.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a dedicated database ending in _test.")
    schema = f"test_{uuid4().hex}"
    config = Settings(_env_file=None, database_url=url, auth_username="susybegula", auth_password_hash=hash_password(TEST_PASSWORD))
    monkeypatch.setattr(database, "settings", lambda: config)
    monkeypatch.setattr(main, "settings", lambda: config)
    monkeypatch.setattr(main, "initialize_database", lambda: None)
    main.login_attempts.clear()
    admin = psycopg.connect(url, autocommit=True, row_factory=dict_row)
    admin.execute(sql.SQL("create schema {}").format(sql.Identifier(schema)))

    def connection():
        conn = psycopg.connect(url, row_factory=dict_row)
        conn.execute(sql.SQL("set search_path to {}").format(sql.Identifier(schema)))
        return conn

    with connection() as conn:
        database.migrate(conn)
        database.bootstrap(conn)
    inspector = psycopg.connect(url, autocommit=True, row_factory=dict_row)
    inspector.execute(sql.SQL("set search_path to {}").format(sql.Identifier(schema)))

    def dependency():
        with connection() as conn:
            yield conn
    main.app.dependency_overrides[database.get_db] = dependency
    try:
        with TestClient(main.app) as client:
            yield client, inspector, config
    finally:
        main.app.dependency_overrides.clear()
        inspector.close()
        admin.execute(sql.SQL("drop schema {} cascade").format(sql.Identifier(schema)))
        admin.close()


@pytest.fixture
def owner(context):
    client, db, _ = context
    response = client.post("/api/auth/login", json={"username": "susybegula", "password": TEST_PASSWORD})
    assert response.status_code == 200
    return client, db, response.json()["user"]


def project(client):
    response = client.post("/api/projects", json={"name": "Website", "code": "WEB"})
    assert response.status_code == 201
    return response.json()


def issue(client, project_id, **changes):
    return client.post("/api/issues", json={"project_id": project_id, "title": "Build navigation", **changes})


def outsider(db):
    return db.execute("insert into app_users(username, password_hash, name) values ('outsider', %s, 'Other') returning id", (hash_password("different-password"),)).fetchone()["id"]


def test_password_hash_is_salted_and_preserves_whitespace():
    encoded = hash_password(" seven7 ")
    assert verify_password(" seven7 ", encoded)
    assert not verify_password("seven7", encoded)
    assert hash_password(" seven7 ") != encoded
    assert not verify_password("anything", "malformed")
    assert not verify_password("anything", "unknown$00$00")
    assert "seven7" not in repr(LoginInput(username="owner", password=" seven7 "))


def test_health_queries_real_postgresql(context):
    client, _, _ = context
    assert client.get("/health").json()["database"] == "postgresql"


@pytest.mark.parametrize("method,path", [("GET", "/api/workspace"), ("GET", "/api/auth/me"), ("POST", "/api/projects"), ("DELETE", f"/api/issues/{uuid4()}")])
def test_requires_session(context, method, path):
    assert context[0].request(method, path, json={}).status_code == 401


@pytest.mark.parametrize("username,password", [("other", TEST_PASSWORD), ("susybegula", "wrong"), ("' OR 1=1 --", TEST_PASSWORD)])
def test_invalid_credentials(context, username, password):
    response = context[0].post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password."
    assert "set-cookie" not in response.headers


def test_cookie_is_httponly_and_server_session_is_hashed(owner):
    client, db, user = owner
    cookie = client.cookies.get(main.COOKIE_NAME)
    stored = db.execute("select token_hash, user_id from sessions").fetchone()
    assert stored["token_hash"] == hash_session(cookie)
    assert stored["token_hash"] != cookie
    assert str(stored["user_id"]) == user["id"]
    assert client.get("/api/auth/me").json() == {"user": user}
    assert client.get("/api/workspace").headers["cache-control"] == "no-store"


def test_login_cookie_flags_and_no_token_in_json(context):
    response = context[0].post("/api/auth/login", json={"username": "susybegula", "password": TEST_PASSWORD})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert "token" not in response.text and "password" not in response.text


def test_logout_revokes_cookie_on_server(owner):
    client, db, _ = owner
    token = client.cookies.get(main.COOKIE_NAME)
    assert client.post("/api/auth/logout").status_code == 204
    assert db.execute("select count(*) as n from sessions").fetchone()["n"] == 0
    assert client.get("/api/auth/me", headers={"cookie": f"{main.COOKIE_NAME}={token}"}).status_code == 401


def test_expired_or_arbitrary_session_is_denied(owner):
    client, db, _ = owner
    db.execute("update sessions set expires_at = %s", (datetime.now(timezone.utc) - timedelta(seconds=1),))
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"cookie": f"{main.COOKIE_NAME}=invented"}).status_code == 401


def test_second_database_account_cannot_access_app(owner):
    client, db, _ = owner
    other = outsider(db)
    db.execute("insert into sessions values (%s, %s, %s)", (hash_session("other-session"), other, datetime.now(timezone.utc) + timedelta(hours=1)))
    assert client.get("/api/workspace", headers={"cookie": f"{main.COOKIE_NAME}=other-session"}).status_code == 401


def test_workspace_starts_empty(owner):
    client, _, user = owner
    workspace = client.get("/api/workspace").json()
    assert workspace["projects"] == [] and workspace["issues"] == []
    assert workspace["profiles"][0]["id"] == user["id"]
    assert "password_hash" not in str(workspace)


def test_project_create_update_delete_and_persistence(owner):
    client, db, user = owner
    item = project(client)
    assert item["owner_id"] == user["id"]
    assert db.execute("select name from projects where id = %s", (item["id"],)).fetchone()["name"] == "Website"
    response = client.patch(f"/api/projects/{item['id']}", json={"name": "Renamed", "code": "APP", "description": "Updated", "color": "mint"})
    assert response.json()["name"] == "Renamed"
    assert client.delete(f"/api/projects/{item['id']}").status_code == 204
    assert client.get("/api/workspace").json()["projects"] == []


def test_issue_crud_and_nullable_fields(owner):
    client, _, user = owner
    item = project(client)
    created = issue(client, item["id"], assignee_id=user["id"], due_date="2026-11-02")
    assert created.status_code == 201
    key = created.json()["id"]
    updated = client.patch(f"/api/issues/{key}", json={"status": "in_progress", "assignee_id": None, "due_date": None})
    assert updated.status_code == 200
    assert updated.json()["status"] == "in_progress"
    assert updated.json()["assignee_id"] is None and updated.json()["due_date"] is None
    assert client.get("/api/workspace").json()["issues"][0]["id"] == key
    assert client.delete(f"/api/issues/{key}").status_code == 204


@pytest.mark.parametrize("body", [{"title": " "}, {"title": None}, {"status": "invalid"}, {"priority": "critical"}, {"created_by": str(uuid4())}, {"project_id": str(uuid4())}])
def test_reject_invalid_or_immutable_fields(owner, body):
    client, _, _ = owner
    key = issue(client, project(client)["id"]).json()["id"]
    assert client.patch(f"/api/issues/{key}", json=body).status_code == 422


def test_forbidden_resource_not_visible_or_mutable(owner):
    client, db, _ = owner
    other = outsider(db)
    foreign = db.execute("insert into projects(name, code, owner_id) values ('Private', 'PV', %s) returning id", (other,)).fetchone()["id"]
    task = db.execute("insert into issues(project_id, title, created_by) values (%s, 'Secret', %s) returning id", (foreign, other)).fetchone()["id"]
    assert client.get("/api/workspace").json()["projects"] == []
    assert issue(client, str(foreign)).status_code == 404
    assert client.patch(f"/api/issues/{task}", json={"status": "done"}).status_code == 404
    assert client.delete(f"/api/issues/{task}").status_code == 404
    assert client.delete(f"/api/projects/{foreign}").status_code == 404
    assert db.execute("select title from issues where id = %s", (task,)).fetchone()["title"] == "Secret"


def test_foreign_assignee_rejected_and_transaction_rolled_back(owner):
    client, db, _ = owner
    item = project(client)
    other = outsider(db)
    assert issue(client, item["id"], assignee_id=str(other)).status_code == 422
    assert db.execute("select count(*) as n from issues").fetchone()["n"] == 0


def test_project_delete_cascades_issues_and_members(owner):
    client, db, user = owner
    item = project(client)
    assert client.post(f"/api/projects/{item['id']}/members", json={"username": "susybegula"}).status_code == 201
    assert issue(client, item["id"], assignee_id=user["id"]).status_code == 201
    assert client.delete(f"/api/projects/{item['id']}").status_code == 204
    assert db.execute("select count(*) as n from issues").fetchone()["n"] == 0
    assert db.execute("select count(*) as n from project_members").fetchone()["n"] == 0


def test_profile_edit_keeps_password_private(owner):
    response = owner[0].patch("/api/profile", json={"name": "Updated"})
    assert response.status_code == 200 and response.json()["name"] == "Updated"
    assert "password" not in response.text


def test_cross_origin_writes_rejected(context):
    assert context[0].post("/api/auth/login", json={"username": "susybegula", "password": TEST_PASSWORD}, headers={"origin": "https://untrusted.example"}).status_code == 403


def test_cors_supports_exact_local_frontend_with_credentials(context):
    response = context[0].options("/api/auth/login", headers={"origin": "http://127.0.0.1:3000", "access-control-request-method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_no_registration_endpoint(context):
    assert context[0].post("/api/auth/signup", json={}).status_code == 404


def test_login_rate_limit(context):
    for _ in range(10):
        assert context[0].post("/api/auth/login", json={"username": "bad", "password": "bad"}).status_code == 401
    assert context[0].post("/api/auth/login", json={"username": "bad", "password": "bad"}).status_code == 429


def test_migrations_and_bootstrap_are_idempotent(context):
    _, db, _ = context
    database.migrate(db)
    database.bootstrap(db)
    assert db.execute("select count(*) as n from app_users").fetchone()["n"] == 1
    assert db.execute("select count(*) as n from schema_migrations").fetchone()["n"] == 2


def photo_data():
    output = BytesIO()
    Image.new("RGB", (420, 200), "#579c89").save(output, "PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


def test_profile_photo_persists_is_normalized_and_can_be_removed(owner):
    client, db, user = owner
    original = photo_data()
    response = client.patch("/api/profile", json={"name": "My profile", "color": "mint", "avatar_url": original})
    assert response.status_code == 200
    saved = response.json()
    assert saved["color"] == "mint" and saved["avatar_url"].startswith("data:image/webp;base64,")
    assert saved["avatar_url"] != original
    image = Image.open(BytesIO(base64.b64decode(saved["avatar_url"].split(",")[1])))
    assert image.size == (256, 256) and not image.getexif()
    assert db.execute("select avatar_url from app_users where id = %s", (user["id"],)).fetchone()["avatar_url"] == saved["avatar_url"]
    assert client.get("/api/workspace").json()["profiles"][0] == saved
    assert client.patch("/api/profile", json={"name": "Renamed"}).json()["avatar_url"] == saved["avatar_url"]
    assert client.patch("/api/profile", json={"name": "Renamed", "avatar_url": None}).json()["avatar_url"] is None
    assert client.get("/api/workspace").json()["profiles"][0]["avatar_url"] is None


@pytest.mark.parametrize("photo", ["https://example.com/photo.png", "data:image/svg+xml;base64,PHN2Zy8+", "data:image/png;base64,invalid!", "data:image/png;base64,aGVsbG8="])
def test_invalid_photos_do_not_overwrite_profile(owner, photo):
    client, db, user = owner
    assert client.patch("/api/profile", json={"name": "Changed", "avatar_url": photo}).status_code == 422
    saved = db.execute("select name, avatar_url from app_users where id = %s", (user["id"],)).fetchone()
    assert saved == {"name": "susybegula", "avatar_url": None}


def test_photo_size_limit_and_authentication(owner):
    client, _, _ = owner
    large = "data:image/png;base64," + base64.b64encode(b"x" * (2 * 1024 * 1024 + 1)).decode()
    assert client.patch("/api/profile", json={"name": "Changed", "avatar_url": large}).status_code == 413
    client.post("/api/auth/logout")
    assert client.patch("/api/profile", json={"name": "Changed", "avatar_url": photo_data()}).status_code == 401


def test_profile_photo_rejects_excessive_dimensions(owner):
    output = BytesIO()
    Image.new("RGB", (5100, 5000)).save(output, "PNG")
    photo = "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()
    assert owner[0].patch("/api/profile", json={"name": "Changed", "avatar_url": photo}).status_code == 422


def test_profile_migration_preserves_existing_users(context):
    _, db, _ = context
    db.execute("alter table app_users drop column avatar_url")
    db.execute("delete from schema_migrations where version = 2")
    database.migrate(db)
    assert db.execute("select username, avatar_url from app_users").fetchone() == {"username": "susybegula", "avatar_url": None}
