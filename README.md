# EtharaAI Task Manager

EtharaAI Task Manager is a full-stack project and task management web app. Users can sign up, log in, create projects, add team members, assign tasks, update task status, and track progress from a dashboard.

The backend is built with Flask and a SQL database. By default it uses SQLite automatically, so you can deploy without manually creating a database service. If `DATABASE_URL` is provided later, the app can use PostgreSQL instead.

## Features

- User signup and login
- JWT authentication
- Password hashing with bcrypt
- Admin and Member roles
- Project and team management
- Task creation, assignment, priority, due date, and status tracking
- Dashboard for total tasks, task status, overdue tasks, and project count
- Admin-only user role management
- REST API backend
- SQLite database by default
- Optional PostgreSQL support through `DATABASE_URL`
- Railway deployment support

## Folder Structure

```text
EtharaAI/
+-- app.py
+-- Procfile
+-- README.md
+-- requirements.txt
+-- runtime.txt
+-- public/
|   +-- index.html
|   +-- styles.css
|   +-- app.js
+-- task_manager/
    +-- __init__.py
    +-- auth.py
    +-- database.py
    +-- repository.py
    +-- server.py
```

## Role Access

### Admin

Admins can:

- View all users
- Change user roles
- View and manage all projects
- Manage project members
- Create, update, and delete tasks
- View the full dashboard

### Member

Members can:

- View projects they belong to
- View users who share a project with them
- Create and update tasks inside their projects
- Track their project dashboard

The first user who signs up becomes an `admin`. Every later user becomes a `member`.

## Local Setup

### 1. Create a Virtual Environment

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Create Environment Variables

Create a `.env` file:

```env
JWT_SECRET=use-a-long-random-secret
PORT=5000
SQLITE_PATH=task_manager.sqlite3
```

Optional PostgreSQL URL:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/task_manager
```

### 4. Run the App

```bash
python app.py
```

Open:

```text
http://localhost:5000
```

## API Overview

Protected routes require this header:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

### Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create a new user |
| POST | `/api/auth/login` | Log in and receive a token |
| GET | `/api/auth/me` | Get current logged-in user |

### Users

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/users` | List visible users |
| PATCH | `/api/users/:userId/role` | Update user role, admin only |

### Projects

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/:projectId` | Get project details |
| PUT | `/api/projects/:projectId` | Update a project |
| DELETE | `/api/projects/:projectId` | Delete a project |
| POST | `/api/projects/:projectId/members` | Add member to project |
| DELETE | `/api/projects/:projectId/members/:userId` | Remove member from project |

### Tasks

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/tasks` | List visible tasks |
| GET | `/api/tasks?projectId=1` | List tasks for one project |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/:taskId` | Update a task |
| DELETE | `/api/tasks/:taskId` | Delete a task |

### Dashboard

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/dashboard` | Get task and project summary |

## Railway Deployment

### Required Files

These files are included for Railway:

- `Procfile` starts the app with Gunicorn
- `requirements.txt` installs Python dependencies
- `runtime.txt` pins the Python version
- `app.py` exposes the Flask app as `app`

### Required Railway Variables

Add these variables to the Railway web service:

```env
JWT_SECRET=your-long-random-secret
```

Railway provides `PORT` automatically.

You do not need to add PostgreSQL manually. If `DATABASE_URL` is not set, the app creates and uses a SQLite database automatically.

Do not set this in production:

```env
SKIP_DB_INIT=true
```

### Deployment Steps

1. Push this project to GitHub.
2. Create a Railway project from the GitHub repository.
3. Add `JWT_SECRET` in the web service variables.
4. Redeploy the web service.

The database tables are created automatically when the Flask app starts.

Note: Railway's normal filesystem can reset across redeploys. The SQLite fallback is simple and deploys without manual setup, but PostgreSQL is still better for permanent production data.
