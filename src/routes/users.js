const express = require("express");
const { query } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware");
const { roleSchema, validate } = require("../validators");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let result;
    if (req.user.role === "admin") {
      result = await query(
        "SELECT id, name, email, role, created_at FROM users ORDER BY name ASC"
      );
    } else {
      result = await query(
        `SELECT DISTINCT u.id, u.name, u.email, u.role, u.created_at
         FROM users u
         JOIN project_members pm ON pm.user_id = u.id
         WHERE pm.project_id IN (
           SELECT project_id FROM project_members WHERE user_id = $1
         )
         ORDER BY u.name ASC`,
        [req.user.id]
      );
    }
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/:userId/role", requireAuth, requireAdmin, validate(roleSchema), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Valid user id is required" });
    }
    if (userId === req.user.id && req.validated.role !== "admin") {
      return res.status(400).json({ error: "Admins cannot demote their own account" });
    }

    const result = await query(
      `UPDATE users
       SET role = $1
       WHERE id = $2
       RETURNING id, name, email, role, created_at`,
      [req.validated.role, userId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
