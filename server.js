require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { initDb } = require("./src/db");
const authRoutes = require("./src/routes/auth");
const projectRoutes = require("./src/routes/projects");
const taskRoutes = require("./src/routes/tasks");
const dashboardRoutes = require("./src/routes/dashboard");
const userRoutes = require("./src/routes/users");

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "project-task-rbac-app" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Unexpected server error" });
});

async function start() {
  if (process.env.SKIP_DB_INIT !== "true") {
    await initDb();
  }

  return app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
}

module.exports = { app, start };
