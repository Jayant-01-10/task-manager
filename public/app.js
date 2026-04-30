const state = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
  authMode: "login",
  view: "dashboard",
  projects: [],
  tasks: [],
  users: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setSession(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("token", token);
}

function clearSession() {
  state.user = null;
  state.token = null;
  localStorage.removeItem("user");
  localStorage.removeItem("token");
}

function renderShell() {
  $("#authView").classList.toggle("hidden", Boolean(state.token));
  $("#appView").classList.toggle("hidden", !state.token);

  if (state.user) {
    $("#userName").textContent = state.user.name;
    $("#userRole").textContent = state.user.role;
  }

  $$(".view-panel").forEach((panel) => panel.classList.add("hidden"));
  $(`#${state.view}Panel`).classList.remove("hidden");
  $("#viewTitle").textContent = state.view[0].toUpperCase() + state.view.slice(1);
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function setAuthMode(mode) {
  state.authMode = mode;
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  $$(".signup-only").forEach((field) => field.classList.toggle("hidden", mode !== "signup"));
  $("#passwordInput").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("#authMessage").textContent = "";
}

function populateSelects() {
  const projectOptions = state.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("");
  $$("select[name='projectId']").forEach((select) => {
    select.innerHTML = projectOptions || "<option value=''>No projects yet</option>";
  });

  const userOptions = state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)} (${escapeHtml(user.role)})</option>`).join("");
  $("select[name='userId']").innerHTML = userOptions || "<option value=''>No users available</option>";
  $("select[name='assigneeId']").innerHTML = `<option value="">Unassigned</option>${userOptions}`;
}

function renderDashboard(dashboard) {
  $("#metricTotal").textContent = dashboard.summary.total;
  $("#metricTodo").textContent = dashboard.summary.todo;
  $("#metricProgress").textContent = dashboard.summary.in_progress;
  $("#metricDone").textContent = dashboard.summary.done;
  $("#metricOverdue").textContent = dashboard.summary.overdue;
  $("#metricProjects").textContent = dashboard.summary.projects;

  $("#overdueList").innerHTML = dashboard.overdue.length
    ? dashboard.overdue.map((task) => `
      <article class="task-item">
        <h3>${escapeHtml(task.title)}</h3>
        <div class="task-meta">
          <span>${escapeHtml(task.project_name)}</span>
          <span>Due ${formatDate(task.due_date)}</span>
          <span>${escapeHtml(task.assignee_name || "Unassigned")}</span>
        </div>
      </article>
    `).join("")
    : "<p class='muted'>No overdue tasks.</p>";
}

function renderProjects() {
  $("#projectList").innerHTML = state.projects.length
    ? state.projects.map((project) => `
      <article class="project-card">
        <h3>${escapeHtml(project.name)}</h3>
        <p class="muted">${escapeHtml(project.description || "No description")}</p>
        <div class="progress-bar" aria-label="Progress ${project.progress}%">
          <span style="width: ${project.progress}%"></span>
        </div>
        <div class="task-meta">
          <span>${project.done_tasks}/${project.total_tasks} tasks done</span>
          <span>${project.members.length} members</span>
        </div>
        <div class="chip-row">
          ${project.members.map((member) => `<span class="chip">${escapeHtml(member.name)} - ${escapeHtml(member.project_role)}</span>`).join("")}
        </div>
      </article>
    `).join("")
    : "<p class='muted'>Create a project to get started.</p>";
}

function renderTasks() {
  $("#taskList").innerHTML = state.tasks.length
    ? state.tasks.map((task) => `
      <article class="task-item">
        <h3>${escapeHtml(task.title)}</h3>
        <p class="muted">${escapeHtml(task.description || "No description")}</p>
        <div class="task-meta">
          <span>${escapeHtml(task.project_name || "Project")}</span>
          <span>${labelStatus(task.status)}</span>
          <span>${escapeHtml(task.priority)} priority</span>
          <span>${escapeHtml(task.assignee_name || "Unassigned")}</span>
          ${task.due_date ? `<span>Due ${formatDate(task.due_date)}</span>` : ""}
        </div>
        <div class="task-actions">
          ${["todo", "in_progress", "done"].map((status) => `
            <button type="button" data-task-status="${status}" data-task-id="${task.id}">
              ${labelStatus(status)}
            </button>
          `).join("")}
        </div>
      </article>
    `).join("")
    : "<p class='muted'>No tasks yet.</p>";
}

function renderUsers() {
  $("#userList").innerHTML = state.users.length
    ? state.users.map((user) => `
      <article class="user-row">
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <span class="muted">${escapeHtml(user.email)}</span>
        </div>
        ${state.user.role === "admin" ? `
          <select data-role-user="${user.id}" ${user.id === state.user.id ? "disabled" : ""}>
            <option value="member" ${user.role === "member" ? "selected" : ""}>Member</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        ` : `<span class="chip">${escapeHtml(user.role)}</span>`}
      </article>
    `).join("")
    : "<p class='muted'>No visible users yet.</p>";
}

async function loadData() {
  if (!state.token) return;
  const [dashboard, projects, tasks, users] = await Promise.all([
    api("/api/dashboard"),
    api("/api/projects"),
    api("/api/tasks"),
    api("/api/users")
  ]);
  state.projects = projects.projects;
  state.tasks = tasks.tasks;
  state.users = users.users;
  renderDashboard(dashboard);
  renderProjects();
  renderTasks();
  renderUsers();
  populateSelects();
  renderShell();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function labelStatus(status) {
  return { todo: "To do", in_progress: "In progress", done: "Done" }[status] || status;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-auth-mode]");
  if (tab) setAuthMode(tab.dataset.authMode);

  const nav = event.target.closest("[data-view]");
  if (nav) {
    state.view = nav.dataset.view;
    renderShell();
  }

  const statusButton = event.target.closest("[data-task-status]");
  if (statusButton) {
    try {
      await api(`/api/tasks/${statusButton.dataset.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusButton.dataset.taskStatus })
      });
      await loadData();
      showToast("Task updated");
    } catch (error) {
      showToast(error.message);
    }
  }
});

document.addEventListener("change", async (event) => {
  const roleSelect = event.target.closest("[data-role-user]");
  if (!roleSelect) return;

  try {
    await api(`/api/users/${roleSelect.dataset.roleUser}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: roleSelect.value })
    });
    await loadData();
    showToast("User role updated");
  } catch (error) {
    showToast(error.message);
    await loadData();
  }
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    email: $("#emailInput").value,
    password: $("#passwordInput").value
  };
  if (state.authMode === "signup") payload.name = $("#nameInput").value;

  try {
    const data = await api(`/api/auth/${state.authMode}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setSession(data.user, data.token);
    await loadData();
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$("#projectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify(formData(event.currentTarget))
    });
    event.currentTarget.reset();
    await loadData();
    showToast("Project created");
  } catch (error) {
    showToast(error.message);
  }
});

$("#memberForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  try {
    await api(`/api/projects/${data.projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: Number(data.userId) })
    });
    await loadData();
    showToast("Member added");
  } catch (error) {
    showToast(error.message);
  }
});

$("#taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const payload = {
    ...data,
    projectId: Number(data.projectId),
    assigneeId: data.assigneeId ? Number(data.assigneeId) : null,
    dueDate: data.dueDate || null
  };

  try {
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    await loadData();
    showToast("Task created");
  } catch (error) {
    showToast(error.message);
  }
});

$("#logoutButton").addEventListener("click", () => {
  clearSession();
  renderShell();
});

$("#refreshButton").addEventListener("click", async () => {
  await loadData();
  showToast("Workspace refreshed");
});

setAuthMode("login");
renderShell();
loadData().catch((error) => {
  clearSession();
  renderShell();
  showToast(error.message);
});
