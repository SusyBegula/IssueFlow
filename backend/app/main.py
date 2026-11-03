"""PostgreSQL persistence and cookie-based authentication for IssueFlow."""
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import secrets
from threading import Lock
from time import monotonic
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import Connection, sql

from .config import settings
from .database import get_db, initialize_database
from .photos import normalize_photo
from .schemas import IssueCreate, IssuePatch, LoginInput, MemberInput, ProfileInput, ProjectInput
from .security import hash_password, hash_session, verify_password

COOKIE_NAME = "issueflow_session"
Db = Annotated[Connection, Depends(get_db)]
login_attempts = defaultdict(deque)
login_lock = Lock()
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


@asynccontextmanager
async def lifespan(_app):
    initialize_database()
    yield


app = FastAPI(title="IssueFlow API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings().allowed_origins, allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type"])


@app.middleware("http")
async def check_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin and origin not in settings().allowed_origins:
        return JSONResponse({"detail": "This origin is not allowed."}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def current_user(request: Request, db: Db):
    token = request.cookies.get(COOKIE_NAME, "")
    if not token or len(token) > 128:
        raise HTTPException(401, "Sign in to continue.")
    user = db.execute("""select u.id, u.username from sessions s
        join app_users u on u.id = s.user_id
        where s.token_hash = %s and s.expires_at > now() and u.username = %s""",
        (hash_session(token), settings().auth_username)).fetchone()
    if not user:
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    return user


User = Annotated[dict, Depends(current_user)]


def one(row):
    if not row:
        raise HTTPException(404, "This item is unavailable or you do not have access.")
    return row


def project_access(db, project_id, user_id, *, owner_only=False):
    row = one(db.execute("select * from projects where id = %s", (project_id,)).fetchone())
    if row["owner_id"] != user_id:
        member = not owner_only and db.execute("select 1 from project_members where project_id = %s and user_id = %s", (project_id, user_id)).fetchone()
        if not member:
            raise HTTPException(404, "This item is unavailable or you do not have access.")
    return row


def issue_access(db, issue_id, user_id):
    issue = one(db.execute("select * from issues where id = %s", (issue_id,)).fetchone())
    project_access(db, issue["project_id"], user_id)
    return issue


def check_assignee(db, project_id, assignee_id):
    if assignee_id is None:
        return
    exists = db.execute("""select 1 from projects where id = %s and owner_id = %s
        union all select 1 from project_members where project_id = %s and user_id = %s""",
        (project_id, assignee_id, project_id, assignee_id)).fetchone()
    if not exists:
        raise HTTPException(422, "The assignee must belong to this project.")


def update_row(db, table, row_id, values):
    assignments = sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(key)) for key in values)
    query = sql.SQL("update {} set {} where id = %s returning *").format(sql.Identifier(table), assignments)
    return one(db.execute(query, (*values.values(), row_id)).fetchone())


@app.get("/health")
def health(db: Db):
    db.execute("select 1")
    return {"status": "ok", "database": "postgresql"}


@app.post("/api/auth/login")
def login(payload: LoginInput, request: Request, response: Response, db: Db):
    address = request.client.host if request.client else "unknown"
    with login_lock:
        attempts = login_attempts[address]
        now = monotonic()
        while attempts and attempts[0] < now - 60:
            attempts.popleft()
        if len(attempts) >= 10:
            raise HTTPException(429, "Too many sign-in attempts. Try again in a minute.")
        attempts.append(now)
    user = db.execute("select * from app_users where username = %s", (settings().auth_username,)).fetchone()
    valid_password = verify_password(payload.password.get_secret_value(), user["password_hash"] if user else DUMMY_HASH)
    if not user or payload.username.strip() != user["username"] or not valid_password:
        raise HTTPException(401, "Invalid username or password.")
    db.execute("delete from sessions where expires_at <= now()")
    previous = request.cookies.get(COOKIE_NAME)
    if previous:
        db.execute("delete from sessions where token_hash = %s", (hash_session(previous),))
    token = secrets.token_urlsafe(32)
    duration = settings().session_hours * 3600
    db.execute("insert into sessions(token_hash, user_id, expires_at) values (%s, %s, %s)",
        (hash_session(token), user["id"], datetime.now(timezone.utc) + timedelta(seconds=duration)))
    response.set_cookie(COOKIE_NAME, token, max_age=duration, httponly=True, secure=settings().cookie_secure, samesite="strict", path="/")
    return {"user": {"id": user["id"], "username": user["username"]}}


@app.get("/api/auth/me")
def me(user: User):
    return {"user": user}


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, db: Db):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        db.execute("delete from sessions where token_hash = %s", (hash_session(token),))
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, secure=settings().cookie_secure, samesite="strict")
    return response


@app.get("/api/workspace")
def workspace(user: User, db: Db):
    projects = db.execute("""select p.* from projects p where p.owner_id = %s
        or exists(select 1 from project_members m where m.project_id = p.id and m.user_id = %s)
        order by p.created_at, p.id""", (user["id"], user["id"])).fetchall()
    ids = [p["id"] for p in projects]
    issues = db.execute("select * from issues where project_id = any(%s::uuid[]) order by created_at desc, number desc", (ids,)).fetchall()
    members = db.execute("select project_id, user_id from project_members where project_id = any(%s::uuid[])", (ids,)).fetchall()
    people = list({user["id"], *(p["owner_id"] for p in projects), *(m["user_id"] for m in members)})
    profiles = db.execute("select id, name, color, avatar_url from app_users where id = any(%s::uuid[]) order by name", (people,)).fetchall()
    return {"projects": projects, "issues": issues, "members": members, "profiles": profiles}


@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectInput, user: User, db: Db):
    return db.execute("insert into projects(name, description, code, color, owner_id) values (%s, %s, %s, %s, %s) returning *",
        (payload.name, payload.description, payload.code, payload.color, user["id"])).fetchone()


@app.patch("/api/projects/{project_id}")
def update_project(project_id: UUID, payload: ProjectInput, user: User, db: Db):
    project_access(db, project_id, user["id"], owner_only=True)
    return update_row(db, "projects", project_id, payload.model_dump())


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: UUID, user: User, db: Db):
    project_access(db, project_id, user["id"], owner_only=True)
    db.execute("delete from projects where id = %s", (project_id,))
    return Response(status_code=204)


@app.post("/api/projects/{project_id}/members", status_code=201)
def add_member(project_id: UUID, payload: MemberInput, user: User, db: Db):
    project_access(db, project_id, user["id"], owner_only=True)
    member = one(db.execute("select id from app_users where username = %s", (payload.username,)).fetchone())
    db.execute("insert into project_members(project_id, user_id) values (%s, %s) on conflict do nothing", (project_id, member["id"]))
    return {"ok": True}


@app.post("/api/issues", status_code=201)
def create_issue(payload: IssueCreate, user: User, db: Db):
    project_access(db, payload.project_id, user["id"])
    check_assignee(db, payload.project_id, payload.assignee_id)
    values = {**payload.model_dump(), "created_by": user["id"]}
    columns = sql.SQL(", ").join(map(sql.Identifier, values))
    placeholders = sql.SQL(", ").join(sql.Placeholder() for _ in values)
    return db.execute(sql.SQL("insert into issues({}) values ({}) returning *").format(columns, placeholders), tuple(values.values())).fetchone()


@app.patch("/api/issues/{issue_id}")
def update_issue(issue_id: UUID, payload: IssuePatch, user: User, db: Db):
    issue = issue_access(db, issue_id, user["id"])
    values = payload.model_dump(exclude_unset=True)
    if "assignee_id" in values:
        check_assignee(db, issue["project_id"], values["assignee_id"])
    values["updated_at"] = datetime.now(timezone.utc)
    return update_row(db, "issues", issue_id, values)


@app.delete("/api/issues/{issue_id}", status_code=204)
def delete_issue(issue_id: UUID, user: User, db: Db):
    issue_access(db, issue_id, user["id"])
    db.execute("delete from issues where id = %s", (issue_id,))
    return Response(status_code=204)


@app.patch("/api/profile")
def update_profile(payload: ProfileInput, user: User, db: Db):
    values = payload.model_dump(exclude_unset=True)
    if values.get("avatar_url") is not None:
        values["avatar_url"] = normalize_photo(values["avatar_url"])
    result = update_row(db, "app_users", user["id"], values)
    return {key: result[key] for key in ("id", "name", "color", "avatar_url")}
