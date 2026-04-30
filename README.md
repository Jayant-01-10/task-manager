# ProjectFlow

ProjectFlow is a full-stack project and task management web app. Users can create projects, add team members, assign tasks, update task status, and track overall progress from a dashboard.

The app includes authentication, role-based access control, REST APIs, PostgreSQL database relationships, and Railway deployment configuration.

## Features

- User signup and login
- JWT-based authentication
- Password hashing with bcrypt
- Admin and Member roles
- Project creation and management
- Team member assignment
- Task creation, assignment, priority, due date, and status tracking
- Dashboard with total tasks, status counts, overdue tasks, and project count
- Admin-only user role management
- REST API backend
- PostgreSQL database
- Railway-ready deployment setup

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

The first user who signs up becomes an `admin`. Every user after that becomes a `member` by default.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: JWT
- Password Security: bcryptjs
- Validation: Zod
- Deployment: Railway

## Project Structure

```text
.
|-- public/
|   |-- index.html
|   |-- styles.css
|   `-- app.js
|-- src/
|   |-- routes/
|   |   |-- auth.js
|   |   |-- dashboard.js
|   |   |-- projects.js
|   |   |-- tasks.js
|   |   `-- users.js
|   |-- auth.js
|   |-- db.js
|   |-- middleware.js
|   `-- validators.js
|-- tests/
|   `-- auth-smoke.js
|-- server.js
|-- package.json
|-- railway.json
`-- .env.example
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell, you can use:

```powershell
Copy-Item .env.example .env
```

### 3. Add Environment Variables

Open `.env` and set:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
JWT_SECRET=use-a-long-random-secret
PORT=3000
```

Example local database URL:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/projectflow
```

### 4. Start the App

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Testing

Run the authentication smoke test:

```bash
npm run test:auth
```

This checks:

- Signup
- Duplicate signup rejection
- First user admin role
- Later user member role
- Login
- Invalid password rejection
- JWT-protected `/api/auth/me`
- Missing-token rejection

You can also check JavaScript syntax with:

```bash
node --check server.js
```

## API Overview

All protected routes require this header:

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

### 1. Push to GitHub

Create a GitHub repository and push this project.

### 2. Create Railway Project

In Railway:

1. Click `New Project`
2. Select `Deploy from GitHub repo`
3. Choose this repository

### 3. Add PostgreSQL

In the same Railway project:

1. Click `New`
2. Select `Database`
3. Select `PostgreSQL`

### 4. Add Variables

Open your web service variables and add:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-long-random-secret
NODE_ENV=production
```

Railway will automatically provide the app port through `PORT`.

Required deployment files are already included:

- `Procfile` tells Railway to run `npm start`
- `railway.json` defines the Nixpacks builder, start command, restart policy, and healthcheck
- `.node-version` pins Node.js 20
- `package.json` includes the production start script and Node engine

### 5. Deploy

Railway will use `railway.json` and run:

```bash
npm start
```

The database tables are created automatically when the server starts.

## Useful Commands

```bash
npm run dev
```

Start the app in development mode.

```bash
npm start
```

Start the app in production mode.

```bash
npm run test:auth
```

Run authentication checks.

## Notes

- Do not commit `.env`.
- Use a strong `JWT_SECRET` in production.
- The first signup should be your admin account.
- PostgreSQL is required for normal app startup.
- `SKIP_DB_INIT=true` is only for local smoke testing and should not be used in production.
