import os
import sqlite3
import tempfile
from contextlib import contextmanager


def sqlite_path():
    return os.getenv("SQLITE_PATH", os.path.join(tempfile.gettempdir(), "task_manager.sqlite3"))


@contextmanager
def get_connection():
    connection = sqlite3.connect(sqlite_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def normalize_row(row):
    return dict(row) if row is not None else None


def normalize_rows(rows):
    return [dict(row) for row in rows]


def query(sql, params=None, fetch="all"):
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(sql, params or [])
        if fetch == "one":
            return normalize_row(cursor.fetchone())
        if fetch == "none":
            return None
        return normalize_rows(cursor.fetchall())


def init_db():
    if os.getenv("SKIP_DB_INIT") == "true":
        return

    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
              description TEXT NOT NULL DEFAULT '',
              owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS project_members (
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (project_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS tasks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
              description TEXT NOT NULL DEFAULT '',
              assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
              priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
              due_date TEXT,
              created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            """
        )
