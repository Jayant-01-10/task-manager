const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../middleware");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const params = [];
    let where = "";
    if (req.user.role !== "admin") {
      params.push(req.user.id);
      where = `WHERE t.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = $1
      )`;
    }

    const summary = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done')::int AS overdue
       FROM tasks t
       ${where}`,
      params
    );

    const projects = await query(
      req.user.role === "admin"
        ? "SELECT COUNT(*)::int AS total FROM projects"
        : `SELECT COUNT(*)::int AS total
           FROM project_members
           WHERE user_id = $1`,
      req.user.role === "admin" ? [] : [req.user.id]
    );

    const overdue = await query(
      `SELECT t.id, t.title, t.due_date, t.status, p.name AS project_name, u.name AS assignee_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
       ${where ? `${where} AND` : "WHERE"} t.due_date < CURRENT_DATE AND t.status <> 'done'
       ORDER BY t.due_date ASC
       LIMIT 8`,
      params
    );

    res.json({
      summary: {
        ...summary.rows[0],
        projects: projects.rows[0].total
      },
      overdue: overdue.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
