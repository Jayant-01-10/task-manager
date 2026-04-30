import os
import re
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

from task_manager.auth import decode_token, hash_password, sign_token, verify_password
from task_manager.database import init_db, query
from task_manager.repository import (
    attach_project_details,
    create_user,
    get_project_access,
    get_public_user_by_id,
    get_user_by_email,
    public_user,
    user_count,
)

load_dotenv()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
STATUSES = {"todo", "in_progress", "done"}
PRIORITIES = {"low", "medium", "high"}


def create_app():
    app = Flask(__name__, static_folder="../public", static_url_path="")
    CORS(app)

    init_db()

    @app.errorhandler(Exception)
    def handle_error(error):
        status = getattr(error, "status_code", 500)
        if status == 500:
            app.logger.exception(error)
        return jsonify({"error": str(error) or "Unexpected server error"}), status

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/api/health")
    def health():
        return jsonify({
            "ok": True,
            "service": "project-task-rbac-app",
            "databaseBackend": "sqlite",
            "databaseConfigured": True,
        })

    @app.post("/api/auth/signup")
    def signup():
        data = request.get_json(silent=True) or {}
        errors = validate_signup(data)
        if errors:
            return validation_error(errors)

        email = data["email"].strip().lower()
        if get_user_by_email(email):
            return jsonify({"error": "Email is already registered"}), 409

        role = "admin" if user_count() == 0 else "member"
        user = create_user(
            data["name"].strip(),
            email,
            hash_password(data["password"]),
            role,
        )
        return jsonify({"user": public_user(user), "token": sign_token(user)}), 201

    @app.post("/api/auth/login")
    def login():
        data = request.get_json(silent=True) or {}
        errors = validate_login(data)
        if errors:
            return validation_error(errors)

        user = get_user_by_email(data["email"].strip().lower())
        if not user or not verify_password(data["password"], user["password_hash"]):
            return jsonify({"error": "Invalid email or password"}), 401

        return jsonify({"user": public_user(user), "token": sign_token(user)})

    @app.get("/api/auth/me")
    @require_auth
    def me():
        return jsonify({"user": public_user(g.user)})

    @app.get("/api/users")
    @require_auth
    def users():
        if g.user["role"] == "admin":
            rows = query("SELECT id, name, email, role, created_at FROM users ORDER BY name ASC")
        else:
            rows = query(
                """
                SELECT DISTINCT u.id, u.name, u.email, u.role, u.created_at
                FROM users u
                JOIN project_members pm ON pm.user_id = u.id
                WHERE pm.project_id IN (
                  SELECT project_id FROM project_members WHERE user_id = ?
                )
                ORDER BY u.name ASC
                """,
                [g.user["id"]],
            )
        return jsonify({"users": rows})

    @app.patch("/api/users/<int:user_id>/role")
    @require_auth
    @require_admin
    def update_user_role(user_id):
        data = request.get_json(silent=True) or {}
        role = data.get("role")
        if role not in {"admin", "member"}:
            return validation_error([{"path": "role", "message": "Role must be admin or member"}])
        if user_id == g.user["id"] and role != "admin":
            return jsonify({"error": "Admins cannot demote their own account"}), 400

        user = query(
            """
            UPDATE users
            SET role = ?
            WHERE id = ?
            RETURNING id, name, email, role, created_at
            """,
            [role, user_id],
            fetch="one",
        )
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"user": user})

    @app.get("/api/projects")
    @require_auth
    def projects():
        if g.user["role"] == "admin":
            rows = query("SELECT * FROM projects ORDER BY created_at DESC")
        else:
            rows = query(
                """
                SELECT p.*
                FROM projects p
                JOIN project_members pm ON pm.project_id = p.id
                WHERE pm.user_id = ?
                ORDER BY p.created_at DESC
                """,
                [g.user["id"]],
            )
        return jsonify({"projects": attach_project_details(rows)})

    @app.post("/api/projects")
    @require_auth
    def create_project():
        data = request.get_json(silent=True) or {}
        errors = validate_project(data)
        if errors:
            return validation_error(errors)

        project = query(
            """
            INSERT INTO projects (name, description, owner_id)
            VALUES (?, ?, ?)
            RETURNING *
            """,
            [data["name"].strip(), data.get("description", "").strip(), g.user["id"]],
            fetch="one",
        )
        query(
            """
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (?, ?, 'owner')
            """,
            [project["id"], g.user["id"]],
            fetch="none",
        )
        return jsonify({"project": attach_project_details([project])[0]}), 201

    @app.get("/api/projects/<int:project_id>")
    @require_auth
    def project(project_id):
        access = get_project_access(project_id, g.user)
        if not access:
            return jsonify({"error": "Project not found or access denied"}), 404
        return jsonify({"project": attach_project_details([access["project"]])[0]})

    @app.put("/api/projects/<int:project_id>")
    @require_auth
    def update_project(project_id):
        access = get_project_access(project_id, g.user)
        if not access:
            return jsonify({"error": "Project not found or access denied"}), 404
        if not is_project_owner_or_admin(access):
            return jsonify({"error": "Project owner or admin access required"}), 403

        data = request.get_json(silent=True) or {}
        errors = validate_project(data)
        if errors:
            return validation_error(errors)

        project = query(
            """
            UPDATE projects
            SET name = ?, description = ?
            WHERE id = ?
            RETURNING *
            """,
            [data["name"].strip(), data.get("description", "").strip(), project_id],
            fetch="one",
        )
        return jsonify({"project": attach_project_details([project])[0]})

    @app.delete("/api/projects/<int:project_id>")
    @require_auth
    def delete_project(project_id):
        access = get_project_access(project_id, g.user)
        if not access:
            return jsonify({"error": "Project not found or access denied"}), 404
        if not is_project_owner_or_admin(access):
            return jsonify({"error": "Project owner or admin access required"}), 403
        query("DELETE FROM projects WHERE id = ?", [project_id], fetch="none")
        return "", 204

    @app.post("/api/projects/<int:project_id>/members")
    @require_auth
    def add_project_member(project_id):
        access = get_project_access(project_id, g.user)
        if not access:
            return jsonify({"error": "Project not found or access denied"}), 404
        if not is_project_owner_or_admin(access):
            return jsonify({"error": "Project owner or admin access required"}), 403

        data = request.get_json(silent=True) or {}
        user_id = parse_positive_int(data.get("userId"))
        if not user_id:
            return validation_error([{"path": "userId", "message": "Valid user id is required"}])
        if not get_public_user_by_id(user_id):
            return jsonify({"error": "User not found"}), 404

        query(
            """
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (?, ?, 'member')
            ON CONFLICT (project_id, user_id) DO NOTHING
            """,
            [project_id, user_id],
            fetch="none",
        )
        return jsonify({"project": attach_project_details([access["project"]])[0]}), 201

    @app.delete("/api/projects/<int:project_id>/members/<int:user_id>")
    @require_auth
    def remove_project_member(project_id, user_id):
        access = get_project_access(project_id, g.user)
        if not access:
            return jsonify({"error": "Project not found or access denied"}), 404
        if not is_project_owner_or_admin(access):
            return jsonify({"error": "Project owner or admin access required"}), 403
        if user_id == access["project"]["owner_id"]:
            return jsonify({"error": "Project owner cannot be removed"}), 400

        query(
            "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
            [project_id, user_id],
            fetch="none",
        )
        query(
            "UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?",
            [project_id, user_id],
            fetch="none",
        )
        return "", 204

    @app.get("/api/tasks")
    @require_auth
    def tasks():
        project_id = request.args.get("projectId", type=int)
        params = []
        where = ""

        if g.user["role"] != "admin":
            params.append(g.user["id"])
            where = "WHERE t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)"

        if project_id:
            if not get_project_access(project_id, g.user):
                return jsonify({"error": "Project not found or access denied"}), 404
            params.append(project_id)
            where += (" AND " if where else "WHERE ") + "t.project_id = ?"

        rows = query(
            f"""
            SELECT t.*, p.name AS project_name, u.name AS assignee_name, u.email AS assignee_email
            FROM tasks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN users u ON u.id = t.assignee_id
            {where}
            ORDER BY t.created_at DESC
            """,
            params,
        )
        return jsonify({"tasks": rows})

    @app.post("/api/tasks")
    @require_auth
    def create_task():
        data = request.get_json(silent=True) or {}
        errors = validate_task_create(data)
        if errors:
            return validation_error(errors)

        project_id = int(data["projectId"])
        if not get_project_access(project_id, g.user):
            return jsonify({"error": "Project not found or access denied"}), 404
        if not can_use_assignee(project_id, data.get("assigneeId")):
            return jsonify({"error": "Assignee must be a member of the project"}), 400

        task = query(
            """
            INSERT INTO tasks
              (project_id, title, description, assignee_id, status, priority, due_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            """,
            [
                project_id,
                data["title"].strip(),
                data.get("description", "").strip(),
                data.get("assigneeId") or None,
                data.get("status", "todo"),
                data.get("priority", "medium"),
                data.get("dueDate") or None,
                g.user["id"],
            ],
            fetch="one",
        )
        return jsonify({"task": task}), 201

    @app.patch("/api/tasks/<int:task_id>")
    @require_auth
    def update_task(task_id):
        task = visible_task(task_id)
        if not task:
            return jsonify({"error": "Task not found or access denied"}), 404

        data = request.get_json(silent=True) or {}
        errors = validate_task_update(data)
        if errors:
            return validation_error(errors)
        if not can_use_assignee(task["project_id"], data.get("assigneeId")):
            return jsonify({"error": "Assignee must be a member of the project"}), 400

        fields = []
        values = []
        column_map = {
            "title": "title",
            "description": "description",
            "assigneeId": "assignee_id",
            "status": "status",
            "priority": "priority",
            "dueDate": "due_date",
        }
        for key, column in column_map.items():
            if key in data:
                fields.append(f"{column} = ?")
                values.append(data[key])

        values.append(task_id)
        updated = query(
            f"""
            UPDATE tasks
            SET {", ".join(fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *
            """,
            values,
            fetch="one",
        )
        return jsonify({"task": updated})

    @app.delete("/api/tasks/<int:task_id>")
    @require_auth
    def delete_task(task_id):
        if not visible_task(task_id):
            return jsonify({"error": "Task not found or access denied"}), 404
        query("DELETE FROM tasks WHERE id = ?", [task_id], fetch="none")
        return "", 204

    @app.get("/api/dashboard")
    @require_auth
    def dashboard():
        params = []
        where = ""
        if g.user["role"] != "admin":
            params.append(g.user["id"])
            where = "WHERE t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)"

        summary = query(
            f"""
            SELECT
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'todo') AS todo,
              COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
              COUNT(*) FILTER (WHERE status = 'done') AS done,
              COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done') AS overdue
            FROM tasks t
            {where}
            """,
            params,
            fetch="one",
        )

        if g.user["role"] == "admin":
            project_count = query("SELECT COUNT(*) AS total FROM projects", fetch="one")
        else:
            project_count = query(
                "SELECT COUNT(*) AS total FROM project_members WHERE user_id = ?",
                [g.user["id"]],
                fetch="one",
            )

        overdue = query(
            f"""
            SELECT t.id, t.title, t.due_date, t.status, p.name AS project_name, u.name AS assignee_name
            FROM tasks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN users u ON u.id = t.assignee_id
            {where + " AND" if where else "WHERE"} t.due_date < CURRENT_DATE AND t.status <> 'done'
            ORDER BY t.due_date ASC
            LIMIT 8
            """,
            params,
        )

        summary["projects"] = project_count["total"]
        return jsonify({"summary": summary, "overdue": overdue})

    return app


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else None
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        try:
            payload = decode_token(token)
            user = get_public_user_by_id(int(payload["sub"]))
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401
        if not user:
            return jsonify({"error": "User no longer exists"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if g.user["role"] != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)

    return wrapper


def is_project_owner_or_admin(access):
    return g.user["role"] == "admin" or access["membership"]["role"] == "owner"


def can_use_assignee(project_id, assignee_id):
    if not assignee_id:
        return True
    row = query(
        "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
        [project_id, assignee_id],
        fetch="one",
    )
    return bool(row)


def visible_task(task_id):
    task = query("SELECT * FROM tasks WHERE id = ?", [task_id], fetch="one")
    if not task:
        return None
    return task if get_project_access(task["project_id"], g.user) else None


def validation_error(details):
    return jsonify({"error": "Validation failed", "details": details}), 400


def parse_positive_int(value):
    try:
        number = int(value)
        return number if number > 0 else None
    except (TypeError, ValueError):
        return None


def validate_signup(data):
    errors = []
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if len(name) < 2 or len(name) > 80:
        errors.append({"path": "name", "message": "Name must be 2-80 characters"})
    if len(email) > 160 or not EMAIL_RE.match(email):
        errors.append({"path": "email", "message": "Valid email is required"})
    if len(password) < 8 or len(password) > 128:
        errors.append({"path": "password", "message": "Password must be 8-128 characters"})
    return errors


def validate_login(data):
    errors = []
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if len(email) > 160 or not EMAIL_RE.match(email):
        errors.append({"path": "email", "message": "Valid email is required"})
    if not password:
        errors.append({"path": "password", "message": "Password is required"})
    return errors


def validate_project(data):
    errors = []
    name = str(data.get("name", "")).strip()
    description = str(data.get("description", "")).strip()
    if len(name) < 2 or len(name) > 120:
        errors.append({"path": "name", "message": "Project name must be 2-120 characters"})
    if len(description) > 1200:
        errors.append({"path": "description", "message": "Description must be 1200 characters or fewer"})
    return errors


def validate_task_create(data):
    errors = validate_task_common(data, partial=False)
    if not parse_positive_int(data.get("projectId")):
        errors.append({"path": "projectId", "message": "Valid project id is required"})
    return errors


def validate_task_update(data):
    if not data:
        return [{"path": "body", "message": "At least one field is required"}]
    return validate_task_common(data, partial=True)


def validate_task_common(data, partial):
    errors = []
    if (not partial or "title" in data) and not 2 <= len(str(data.get("title", "")).strip()) <= 160:
        errors.append({"path": "title", "message": "Title must be 2-160 characters"})
    if "description" in data and len(str(data.get("description", "")).strip()) > 2000:
        errors.append({"path": "description", "message": "Description must be 2000 characters or fewer"})
    if "assigneeId" in data and data.get("assigneeId") is not None and not parse_positive_int(data.get("assigneeId")):
        errors.append({"path": "assigneeId", "message": "Valid assignee id is required"})
    if "status" in data and data.get("status") not in STATUSES:
        errors.append({"path": "status", "message": "Invalid status"})
    if "priority" in data and data.get("priority") not in PRIORITIES:
        errors.append({"path": "priority", "message": "Invalid priority"})
    if "dueDate" in data and data.get("dueDate") and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(data["dueDate"])):
        errors.append({"path": "dueDate", "message": "Due date must be YYYY-MM-DD"})
    return errors
