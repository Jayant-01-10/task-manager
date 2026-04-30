const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db");
const { signToken } = require("../auth");
const { requireAuth } = require("../middleware");
const { signupSchema, loginSchema, validate } = require("../validators");

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at
  };
}

router.post("/signup", validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.validated;
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const count = await query("SELECT COUNT(*)::int AS total FROM users");
    const role = count.rows[0].total === 0 ? "admin" : "member";
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role]
    );

    const user = result.rows[0];
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
