from task_manager.database import placeholders, query


def public_user(user):
    if not user:
        return None
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "created_at": user.get("created_at"),
    }


def get_user_by_email(email):
    return query("SELECT * FROM users WHERE email = %s", [email], fetch="one")


def get_public_user_by_id(user_id):
    return query(
        "SELECT id, name, email, role, created_at FROM users WHERE id = %s",
        [user_id],
        fetch="one",
    )


def user_count():
    row = query("SELECT COUNT(*)::int AS total FROM users", fetch="one")
    return row["total"]


def create_user(name, email, password_hash, role):
    return query(
        """
        INSERT INTO users (name, email, password_hash, role)
        VALUES (%s, %s, %s, %s)
        RETURNING id, name, email, role, created_at
        """,
        [name, email, password_hash, role],
        fetch="one",
    )


def get_project_access(project_id, user):
    if user["role"] == "admin":
        project = query("SELECT * FROM projects WHERE id = %s", [project_id], fetch="one")
        if not project:
            return None
        return {"project": project, "membership": {"role": "owner"}}

    row = query(
        """
        SELECT p.*, pm.role AS member_role
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id
        WHERE p.id = %s AND pm.user_id = %s
        """,
        [project_id, user["id"]],
        fetch="one",
    )
    if not row:
        return None
    project = dict(row)
    project.pop("member_role", None)
    return {"project": project, "membership": {"role": row["member_role"]}}


def attach_project_details(projects):
    projects = list(projects or [])
    if not projects:
        return []

    project_ids = [project["id"] for project in projects]
    project_placeholders = placeholders(len(project_ids))
    members = query(
        f"""
        SELECT pm.project_id, u.id, u.name, u.email, u.role, pm.role AS project_role
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id IN ({project_placeholders})
        ORDER BY u.name ASC
        """,
        project_ids,
    )
    stats = query(
        f"""
        SELECT project_id,
          COUNT(*)::int AS total_tasks,
          COUNT(*) FILTER (WHERE status = 'done')::int AS done_tasks
        FROM tasks
        WHERE project_id IN ({project_placeholders})
        GROUP BY project_id
        """,
        project_ids,
    )

    members_by_project = {}
    for member in members:
        members_by_project.setdefault(member["project_id"], []).append(member)

    stats_by_project = {item["project_id"]: item for item in stats}
    enriched = []
    for project in projects:
        task_stats = stats_by_project.get(project["id"], {"total_tasks": 0, "done_tasks": 0})
        total = task_stats["total_tasks"]
        done = task_stats["done_tasks"]
        project = dict(project)
        project["members"] = members_by_project.get(project["id"], [])
        project["total_tasks"] = total
        project["done_tasks"] = done
        project["progress"] = 0 if total == 0 else round((done / total) * 100)
        enriched.append(project)
    return enriched
