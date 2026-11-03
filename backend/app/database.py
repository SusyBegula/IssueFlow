from pathlib import Path

import psycopg
from psycopg import sql
from fastapi import HTTPException
from psycopg.rows import dict_row

from .config import settings


def connect():
    url = settings().database_url.get_secret_value()
    if not url:
        raise HTTPException(503, "The database is not configured.")
    connection = psycopg.connect(url, row_factory=dict_row, connect_timeout=10)
    try:
        connection.execute(sql.SQL("set search_path to {}").format(sql.Identifier(settings().database_schema)))
        return connection
    except Exception:
        connection.close()
        raise


def get_db():
    try:
        with connect() as connection:
            yield connection
    except psycopg.OperationalError:
        raise HTTPException(503, "The database is unavailable. Check PostgreSQL and the database connection settings.") from None
    except psycopg.IntegrityError:
        raise HTTPException(422, "The change conflicts with existing data. Check the details and try again.") from None


def migrate(connection):
    # Serialize setup across processes; schema + version record commit atomically.
    connection.execute("select pg_advisory_xact_lock(548176023)")
    connection.execute("create table if not exists schema_migrations (version integer primary key)")
    for version, filename in [(1, "001_initial.sql"), (2, "002_profile_photo.sql")]:
        if not connection.execute("select version from schema_migrations where version = %s", (version,)).fetchone():
            connection.execute((Path(__file__).resolve().parents[1] / "sql" / filename).read_text())
            connection.execute("insert into schema_migrations(version) values (%s)", (version,))


def bootstrap(connection):
    config = settings()
    existing = connection.execute("select id from app_users where username = %s", (config.auth_username,)).fetchone()
    if existing:
        return
    encoded = config.auth_password_hash.get_secret_value()
    if not encoded.startswith("scrypt$"):
        raise RuntimeError("Set AUTH_PASSWORD_HASH with `uv run python -m app.manage hash-password` before starting the API.")
    connection.execute("insert into app_users(username, password_hash, name) values (%s, %s, %s)", (config.auth_username, encoded, config.auth_username))


def initialize_database():
    with connect() as connection:
        schema = settings().database_schema
        if schema != "public":
            # Keep credentials, sessions, and work data out of Supabase's exposed public schema.
            connection.execute(sql.SQL("create schema if not exists {}").format(sql.Identifier(schema)))
            connection.execute(sql.SQL("revoke all on schema {} from public").format(sql.Identifier(schema)))
        migrate(connection)
        bootstrap(connection)
