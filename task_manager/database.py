import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor


def database_url():
    url = os.getenv("DATABASE_URL")
    if not url and os.getenv("SKIP_DB_INIT") != "true":
        raise RuntimeError("DATABASE_URL is required")
    return url


@contextmanager
def get_connection():
    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is required for database queries")

    connection = psycopg2.connect(url, cursor_factory=RealDictCursor)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def query(sql, params=None, fetch="all"):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params or [])
            if fetch == "one":
                return cursor.fetchone()
            if fetch == "none":
                return None
            return cursor.fetchall()


def init_db():
    if os.getenv("SKIP_DB_INIT") == "true":
        return

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id SERIAL PRIMARY KEY,
                  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
                  email TEXT NOT NULL UNIQUE,
                  password_hash TEXT NOT NULL,
                  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS projects (
                  id SERIAL PRIMARY KEY,
                  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
                  description TEXT NOT NULL DEFAULT '',
                  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS project_members (
                  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  PRIMARY KEY (project_id, user_id)
                );

                CREATE TABLE IF NOT EXISTS tasks (
                  id SERIAL PRIMARY KEY,
                  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
                  description TEXT NOT NULL DEFAULT '',
                  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
                  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
                  due_date DATE,
                  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
                """
            )
