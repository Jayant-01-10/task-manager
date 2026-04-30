const { query } = require("./db");
const { verifyToken } = require("./auth");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = verifyToken(token);
    const result = await query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [payload.sub]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ error: "User no longer exists" });
    }
    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

async function getProjectAccess(projectId, user) {
  if (user.role === "admin") {
    const project = await query("SELECT * FROM projects WHERE id = $1", [projectId]);
    return project.rows[0] ? { project: project.rows[0], membership: { role: "owner" } } : null;
  }

  const result = await query(
    `SELECT p.*, pm.role AS member_role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = $1 AND pm.user_id = $2`,
    [projectId, user.id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    project: {
      id: row.id,
      name: row.name,
      description: row.description,
      owner_id: row.owner_id,
      created_at: row.created_at
    },
    membership: { role: row.member_role }
  };
}

async function requireProjectAccess(req, res, next) {
  const projectId = Number(req.params.projectId || req.body.projectId || req.validated?.projectId);
  if (!projectId) {
    return res.status(400).json({ error: "Project id is required" });
  }

  const access = await getProjectAccess(projectId, req.user);
  if (!access) {
    return res.status(404).json({ error: "Project not found or access denied" });
  }

  req.project = access.project;
  req.membership = access.membership;
  next();
}

function requireProjectOwnerOrAdmin(req, res, next) {
  if (req.user.role === "admin" || req.membership?.role === "owner") {
    return next();
  }
  res.status(403).json({ error: "Project owner or admin access required" });
}

module.exports = {
  requireAuth,
  requireAdmin,
  getProjectAccess,
  requireProjectAccess,
  requireProjectOwnerOrAdmin
};
