const express = require("express");
const { query } = require("../db");
const { requireAuth, getProjectAccess } = require("../middleware");
const { taskCreateSchema, taskUpdateSchema, validate } = require("../validators");

const router = express.Router();

async function canUseAssignee(projectId, assigneeId) {
  if (!assigneeId) return true;
  const result = await query(
    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, assigneeId]
  );
  return Boolean(result.rows[0]);
}

async function getVisibleTask(taskId, user) {
  const result = await query("SELECT * FROM tasks WHERE id = $1", [taskId]);
  const task = result.rows[0];
  if (!task) return null;
  const access = await getProjectAccess(task.project_id, user);
  return access ? task : null;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    if (projectId && (!Number.isInteger(projectId) || projectId <= 0)) {
      return res.status(400).json({ error: "Valid project id is required" });
    }

    const params = [];
    let where = "";

    if (req.user.role !== "admin") {
      params.push(req.user.id);
      where = `WHERE t.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = $1
      )`;
    }

    if (projectId) {
      const access = await getProjectAccess(projectId, req.user);
      if (!access) {
        return res.status(404).json({ error: "Project not found or access denied" });
      }
      params.push(projectId);
      where += where ? ` AND t.project_id = $${params.length}` : `WHERE t.project_id = $${params.length}`;
    }

    const result = await query(
      `SELECT t.*, p.name AS project_name, u.name AS assignee_name, u.email AS assignee_email
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );
    res.json({ tasks: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, validate(taskCreateSchema), async (req, res, next) => {
  try {
    const access = await getProjectAccess(req.validated.projectId, req.user);
    if (!access) {
      return res.status(404).json({ error: "Project not found or access denied" });
    }
    if (!(await canUseAssignee(req.validated.projectId, req.validated.assigneeId))) {
      return res.status(400).json({ error: "Assignee must be a member of the project" });
    }

    const result = await query(
      `INSERT INTO tasks
        (project_id, title, description, assignee_id, status, priority, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.validated.projectId,
        req.validated.title,
        req.validated.description,
        req.validated.assigneeId || null,
        req.validated.status,
        req.validated.priority,
        req.validated.dueDate || null,
        req.user.id
      ]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/:taskId", requireAuth, validate(taskUpdateSchema), async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Valid task id is required" });
    }

    const task = await getVisibleTask(taskId, req.user);
    if (!task) {
      return res.status(404).json({ error: "Task not found or access denied" });
    }
    if (!(await canUseAssignee(task.project_id, req.validated.assigneeId))) {
      return res.status(400).json({ error: "Assignee must be a member of the project" });
    }

    const fields = [];
    const values = [];
    const columnMap = {
      title: "title",
      description: "description",
      assigneeId: "assignee_id",
      status: "status",
      priority: "priority",
      dueDate: "due_date"
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (Object.prototype.hasOwnProperty.call(req.validated, key)) {
        values.push(req.validated[key]);
        fields.push(`${column} = $${values.length}`);
      }
    }

    values.push(taskId);
    const result = await query(
      `UPDATE tasks
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    res.json({ task: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/:taskId", requireAuth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Valid task id is required" });
    }
    const task = await getVisibleTask(taskId, req.user);
    if (!task) {
      return res.status(404).json({ error: "Task not found or access denied" });
    }
    await query("DELETE FROM tasks WHERE id = $1", [taskId]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
