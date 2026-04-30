const express = require("express");
const { query } = require("../db");
const {
  requireAuth,
  requireProjectAccess,
  requireProjectOwnerOrAdmin
} = require("../middleware");
const { projectParamSchema, projectSchema, memberSchema, validate } = require("../validators");

const router = express.Router();

async function attachProjectDetails(projects) {
  if (projects.length === 0) return [];
  const ids = projects.map((project) => project.id);
  const members = await query(
    `SELECT pm.project_id, u.id, u.name, u.email, u.role, pm.role AS project_role
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ANY($1::int[])
     ORDER BY u.name ASC`,
    [ids]
  );
  const tasks = await query(
    `SELECT project_id,
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE status = 'done')::int AS done_tasks
     FROM tasks
     WHERE project_id = ANY($1::int[])
     GROUP BY project_id`,
    [ids]
  );

  const membersByProject = new Map();
  for (const member of members.rows) {
    const list = membersByProject.get(member.project_id) || [];
    list.push(member);
    membersByProject.set(member.project_id, list);
  }

  const tasksByProject = new Map(tasks.rows.map((row) => [row.project_id, row]));
  return projects.map((project) => {
    const stats = tasksByProject.get(project.id) || { total_tasks: 0, done_tasks: 0 };
    const progress = stats.total_tasks === 0
      ? 0
      : Math.round((stats.done_tasks / stats.total_tasks) * 100);
    return {
      ...project,
      members: membersByProject.get(project.id) || [],
      total_tasks: stats.total_tasks,
      done_tasks: stats.done_tasks,
      progress
    };
  });
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const result = req.user.role === "admin"
      ? await query("SELECT * FROM projects ORDER BY created_at DESC")
      : await query(
          `SELECT p.*
           FROM projects p
           JOIN project_members pm ON pm.project_id = p.id
           WHERE pm.user_id = $1
           ORDER BY p.created_at DESC`,
          [req.user.id]
        );

    res.json({ projects: await attachProjectDetails(result.rows) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, validate(projectSchema), async (req, res, next) => {
  const client = await require("../db").pool.connect();
  try {
    await client.query("BEGIN");
    const { name, description } = req.validated;
    const project = await client.query(
      `INSERT INTO projects (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description, req.user.id]
    );
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [project.rows[0].id, req.user.id]
    );
    await client.query("COMMIT");
    res.status(201).json({ project: (await attachProjectDetails(project.rows))[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

router.get("/:projectId", requireAuth, validate(projectParamSchema, "params"), requireProjectAccess, async (req, res, next) => {
  try {
    res.json({ project: (await attachProjectDetails([req.project]))[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/:projectId", requireAuth, validate(projectParamSchema, "params"), requireProjectAccess, requireProjectOwnerOrAdmin, validate(projectSchema), async (req, res, next) => {
  try {
    const { name, description } = req.validated;
    const result = await query(
      `UPDATE projects
       SET name = $1, description = $2
       WHERE id = $3
       RETURNING *`,
      [name, description, req.project.id]
    );
    res.json({ project: (await attachProjectDetails(result.rows))[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/:projectId", requireAuth, validate(projectParamSchema, "params"), requireProjectAccess, requireProjectOwnerOrAdmin, async (req, res, next) => {
  try {
    await query("DELETE FROM projects WHERE id = $1", [req.project.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/:projectId/members", requireAuth, validate(projectParamSchema, "params"), requireProjectAccess, requireProjectOwnerOrAdmin, validate(memberSchema), async (req, res, next) => {
  try {
    const user = await query("SELECT id FROM users WHERE id = $1", [req.validated.userId]);
    if (!user.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [req.project.id, req.validated.userId]
    );
    res.status(201).json({ project: (await attachProjectDetails([req.project]))[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/:projectId/members/:userId", requireAuth, requireProjectAccess, requireProjectOwnerOrAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Valid user id is required" });
    }
    if (userId === req.project.owner_id) {
      return res.status(400).json({ error: "Project owner cannot be removed" });
    }
    await query(
      "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
      [req.project.id, userId]
    );
    await query(
      "UPDATE tasks SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2",
      [req.project.id, userId]
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
