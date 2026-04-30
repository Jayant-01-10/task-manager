const assert = require("assert");
const db = require("../src/db");

process.env.JWT_SECRET = process.env.JWT_SECRET || "auth-smoke-test-secret";
process.env.SKIP_DB_INIT = "true";

const users = [];

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  };
}

db.query = async (sql, params = []) => {
  const compact = sql.replace(/\s+/g, " ").trim();

  if (compact === "SELECT id FROM users WHERE email = $1") {
    const user = users.find((item) => item.email === params[0]);
    return { rows: user ? [{ id: user.id }] : [] };
  }

  if (compact === "SELECT COUNT(*)::int AS total FROM users") {
    return { rows: [{ total: users.length }] };
  }

  if (compact.startsWith("INSERT INTO users")) {
    const user = {
      id: users.length + 1,
      name: params[0],
      email: params[1],
      password_hash: params[2],
      role: params[3],
      created_at: new Date().toISOString()
    };
    users.push(user);
    return { rows: [publicUser(user)] };
  }

  if (compact === "SELECT * FROM users WHERE email = $1") {
    const user = users.find((item) => item.email === params[0]);
    return { rows: user ? [user] : [] };
  }

  if (compact === "SELECT id, name, email, role, created_at FROM users WHERE id = $1") {
    const user = users.find((item) => item.id === Number(params[0]));
    return { rows: user ? [publicUser(user)] : [] };
  }

  throw new Error(`Unexpected query in auth smoke test: ${compact}`);
};

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function main() {
  const { start } = require("../server");
  const server = await start();
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const signup = await request(baseUrl, "/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Admin User",
        email: "admin@example.com",
        password: "password123"
      })
    });
    assert.equal(signup.response.status, 201);
    assert.equal(signup.body.user.role, "admin");
    assert.ok(signup.body.token);

    const duplicate = await request(baseUrl, "/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Admin User",
        email: "admin@example.com",
        password: "password123"
      })
    });
    assert.equal(duplicate.response.status, 409);

    const memberSignup = await request(baseUrl, "/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Member User",
        email: "member@example.com",
        password: "password123"
      })
    });
    assert.equal(memberSignup.response.status, 201);
    assert.equal(memberSignup.body.user.role, "member");

    const invalidSignup = await request(baseUrl, "/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "No",
        email: "invalid@example.com",
        password: "short"
      })
    });
    assert.equal(invalidSignup.response.status, 400);

    const login = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "password123"
      })
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.email, "admin@example.com");
    assert.ok(login.body.token);

    const badLogin = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "wrong-password"
      })
    });
    assert.equal(badLogin.response.status, 401);

    const me = await request(baseUrl, "/api/auth/me", {
      headers: {
        Authorization: `Bearer ${login.body.token}`
      }
    });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.email, "admin@example.com");

    const noToken = await request(baseUrl, "/api/auth/me");
    assert.equal(noToken.response.status, 401);

    console.log("Auth smoke test passed");
    console.table([
      { check: "first signup creates admin", status: signup.response.status },
      { check: "duplicate signup rejected", status: duplicate.response.status },
      { check: "second signup creates member", status: memberSignup.response.status },
      { check: "invalid signup rejected", status: invalidSignup.response.status },
      { check: "valid login succeeds", status: login.response.status },
      { check: "bad login rejected", status: badLogin.response.status },
      { check: "JWT /me succeeds", status: me.response.status },
      { check: "missing JWT rejected", status: noToken.response.status }
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
