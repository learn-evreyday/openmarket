const { query, withTransaction } = require("../db/client");
const { HttpError } = require("../utils/errors");
const { trimString } = require("../utils/values");
const { parseCookies } = require("../utils/http");
const { SESSION_COOKIE, SESSION_TTL_SECONDS, STOCK_ACCESS_TTL_SECONDS } = require("../config");
const { hashPassword, verifyPassword } = require("../auth/passwords");
const { issueSessionToken, hashSessionToken } = require("../auth/sessions");

const MODULES = {
  account: { key: "account", label: "My Account", route: "/account" },
  dashboard: { key: "dashboard", label: "Overview", route: "/" },
  products: { key: "products", label: "Products", route: "/products" },
  customers: { key: "customers", label: "Customers", route: "/customers" },
  orders: { key: "orders", label: "Orders", route: "/orders" },
  suppliers: { key: "suppliers", label: "Suppliers", route: "/suppliers" },
  employees: { key: "employees", label: "Employees", route: "/employees" },
  service: { key: "service", label: "Service", route: "/service" },
  finance: { key: "finance", label: "Finance", route: "/finance" },
  stock_check: { key: "stock_check", label: "Stock Check", route: "/stock-access" },
};

const ROLE_MODULES = {
  client: ["account"],
  admin: ["dashboard", "products", "customers", "orders", "suppliers", "employees", "service", "finance", "stock_check"],
  director: ["dashboard", "products", "customers", "orders", "suppliers", "employees", "service", "finance", "stock_check"],
  accountant: ["dashboard", "customers", "orders", "finance", "stock_check"],
  staff: ["dashboard", "products", "service", "stock_check"],
};

function moduleSetForUser(user) {
  if (!user) {
    return new Set();
  }

  if (user.session_scope === "stock_check") {
    return new Set(["stock_check"]);
  }

  return new Set(ROLE_MODULES[user.role] || []);
}

function accessibleModules(user) {
  return Array.from(moduleSetForUser(user))
    .map((key) => MODULES[key])
    .filter(Boolean);
}

function sanitizeUser(row) {
  if (!row) {
    return null;
  }

  return {
    user_id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    employee_id: row.employee_id,
    customer_id: row.customer_id,
    is_active: row.is_active,
    stock_access_enabled: Boolean(row.stock_access_enabled),
    session_scope: row.session_scope || "full",
  };
}

function hasModuleAccess(user, moduleKey) {
  return moduleSetForUser(user).has(moduleKey);
}

function canViewFinancials(user) {
  return hasModuleAccess(user, "finance");
}

async function createSession(userId, sessionScope, ttlSeconds) {
  const sessionToken = issueSessionToken();
  const tokenHash = hashSessionToken(sessionToken);

  await query(
    `
      INSERT INTO public.app_sessions (
        user_id,
        token_hash,
        session_scope,
        expires_at,
        created_at,
        last_seen_at
      )
      VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, NOW(), NOW())
    `,
    [userId, tokenHash, sessionScope, String(ttlSeconds)]
  );

  return sessionToken;
}

async function loadRequestUser(req) {
  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const result = await query(
    `
      SELECT
        app_users.user_id,
        app_users.username,
        app_users.display_name,
        app_users.role,
        app_users.employee_id,
        app_users.customer_id,
        app_users.is_active,
        app_users.stock_access_enabled,
        app_sessions.session_id,
        app_sessions.session_scope
      FROM public.app_sessions
      JOIN public.app_users ON app_users.user_id = app_sessions.user_id
      WHERE app_sessions.token_hash = $1
        AND app_sessions.expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  const sessionUser = result.rows[0];
  if (!sessionUser || !sessionUser.is_active) {
    return null;
  }

  await query(`UPDATE public.app_sessions SET last_seen_at = NOW() WHERE session_id = $1`, [sessionUser.session_id]);
  return sanitizeUser(sessionUser);
}

async function getSessionPayload(req) {
  const user = await loadRequestUser(req);
  return {
    authenticated: Boolean(user),
    user,
    session_scope: user?.session_scope || "guest",
    can_view_financials: canViewFinancials(user),
    modules: accessibleModules(user),
  };
}

async function loginUser(payload) {
  const login = trimString(payload.username).toLowerCase();
  const password = String(payload.password ?? "");

  if (!login || !password) {
    throw new HttpError(400, "Username and password are required.");
  }

  const result = await query(
    `
      SELECT *
      FROM public.app_users
      WHERE LOWER(username) = $1
      LIMIT 1
    `,
    [login]
  );

  const user = result.rows[0];
  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, "Invalid username or password.");
  }

  const sessionToken = await createSession(user.user_id, "full", SESSION_TTL_SECONDS);

  return {
    user: sanitizeUser({ ...user, session_scope: "full" }),
    sessionToken,
  };
}

async function registerUser(payload) {
  const username = trimString(payload.username).toLowerCase();
  const password = String(payload.password ?? "");
  const firstName = trimString(payload.first_name);
  const lastName = trimString(payload.last_name);
  const email = trimString(payload.email).toLowerCase();
  const phone = trimString(payload.phone);

  if (firstName.length < 2 || lastName.length < 2) {
    throw new HttpError(400, "First name and last name must contain at least 2 characters.");
  }
  if (username.length < 3) {
    throw new HttpError(400, "Username must contain at least 3 characters.");
  }
  if (password.length < 8) {
    throw new HttpError(400, "Password must contain at least 8 characters.");
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "A valid email address is required.");
  }

  return withTransaction(async (client) => {
    const customerResult = await client.query(
      `
        INSERT INTO public.customers (
          last_name,
          first_name,
          phone,
          email,
          registration_date
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE)
        RETURNING customer_id
      `,
      [lastName, firstName, phone, email]
    );

    const customerId = customerResult.rows[0].customer_id;
    const userResult = await client.query(
      `
        INSERT INTO public.app_users (
          username,
          display_name,
          role,
          password_hash,
          customer_id,
          stock_access_enabled,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'client', $3, $4, FALSE, TRUE, NOW(), NOW())
        RETURNING *
      `,
      [username, `${firstName} ${lastName}`.trim(), hashPassword(password), customerId]
    );

    const user = userResult.rows[0];
    const sessionToken = issueSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    await client.query(
      `
        INSERT INTO public.app_sessions (
          user_id,
          token_hash,
          session_scope,
          expires_at,
          created_at,
          last_seen_at
        )
        VALUES ($1, $2, 'full', NOW() + ($3 || ' seconds')::interval, NOW(), NOW())
      `,
      [user.user_id, tokenHash, String(SESSION_TTL_SECONDS)]
    );

    return {
      user: sanitizeUser({ ...user, session_scope: "full" }),
      sessionToken,
    };
  });
}

async function loginWithStockAccessCode(payload) {
  const accessCode = trimString(payload.access_code);
  if (accessCode.length < 4) {
    throw new HttpError(400, "Access code is required.");
  }

  const result = await query(
    `
      SELECT *
      FROM public.app_users
      WHERE is_active = TRUE
        AND stock_access_enabled = TRUE
        AND access_code_hash IS NOT NULL
      ORDER BY user_id ASC
    `
  );

  const matchedUser = result.rows.find((user) => verifyPassword(accessCode, user.access_code_hash));
  if (!matchedUser) {
    throw new HttpError(401, "Invalid access code.");
  }

  const sessionToken = await createSession(matchedUser.user_id, "stock_check", STOCK_ACCESS_TTL_SECONDS);

  return {
    user: sanitizeUser({ ...matchedUser, session_scope: "stock_check" }),
    sessionToken,
  };
}

async function logoutUser(req) {
  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) {
    return;
  }

  await query(`DELETE FROM public.app_sessions WHERE token_hash = $1`, [hashSessionToken(sessionToken)]);
}

function requireAuthenticatedUser(user) {
  if (!user) {
    throw new HttpError(401, "Login required.");
  }
}

function requireModuleAccess(user, moduleKey, customMessage) {
  requireAuthenticatedUser(user);
  if (!hasModuleAccess(user, moduleKey)) {
    throw new HttpError(403, customMessage || "You do not have permission to access this area.");
  }
}

function requireFinancialAccess(user) {
  requireModuleAccess(user, "finance", "You are not allowed to view financial data.");
}

function requireStockCheckAccess(user) {
  requireModuleAccess(user, "stock_check", "You are not allowed to verify stock.");
}

module.exports = {
  MODULES,
  accessibleModules,
  canViewFinancials,
  getSessionPayload,
  hasModuleAccess,
  loadRequestUser,
  loginUser,
  registerUser,
  loginWithStockAccessCode,
  logoutUser,
  requireAuthenticatedUser,
  requireFinancialAccess,
  requireModuleAccess,
  requireStockCheckAccess,
};
