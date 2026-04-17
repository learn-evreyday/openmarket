const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { STATIC_DIR } = require("../config");
const { safeStaticPath, serveFile, sendJson, parseJsonBody, sessionCookie, clearSessionCookie } = require("../utils/http");
const { HttpError } = require("../utils/errors");
const marketonline = require("../services/marketonline");
const auth = require("../services/auth");

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function isStaticAssetPath(pathname) {
  return path.extname(pathname) !== "";
}

function sendError(res, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.statusCode, { error: error.message });
    return;
  }

  if (error && error.code === "23505") {
    sendJson(res, 409, { error: "A record with the same unique value already exists." });
    return;
  }

  if (error && error.code === "23503") {
    sendJson(res, 400, { error: "The request references a related record that does not exist." });
    return;
  }

  if (error && error.code === "22P02") {
    sendJson(res, 400, { error: "The request contains an invalid value or identifier." });
    return;
  }

  if (error instanceof Error && (error.message === "Invalid JSON body." || error.message === "Request body too large.")) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  console.error(error);
  sendJson(res, 500, { error: "Internal server error." });
}

async function getRequestBody(req) {
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
    return {};
  }
  return parseJsonBody(req);
}

async function handleApiRequest(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const user = await auth.loadRequestUser(req);
  const body = await getRequestBody(req);

  if (req.method === "GET" && pathname === "/api/session") {
    sendJson(res, 200, await auth.getSessionPayload(req));
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const result = await auth.loginUser(body);
    sendJson(
      res,
      200,
      {
        message: "Login successful.",
        user: result.user,
        can_view_financials: auth.canViewFinancials(result.user),
      },
      { "Set-Cookie": sessionCookie(result.sessionToken) }
    );
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const result = await auth.registerUser(body);
    sendJson(
      res,
      200,
      {
        message: "Account created.",
        user: result.user,
        can_view_financials: auth.canViewFinancials(result.user),
        modules: auth.accessibleModules(result.user),
      },
      { "Set-Cookie": sessionCookie(result.sessionToken) }
    );
    return;
  }

  if (req.method === "POST" && pathname === "/api/stock-access/login") {
    const result = await auth.loginWithStockAccessCode(body);
    sendJson(
      res,
      200,
      {
        message: "Stock access enabled.",
        user: result.user,
        can_view_financials: auth.canViewFinancials(result.user),
        modules: auth.accessibleModules(result.user),
      },
      { "Set-Cookie": sessionCookie(result.sessionToken) }
    );
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    await auth.logoutUser(req);
    sendJson(res, 200, { message: "Logged out." }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/overview") {
    auth.requireModuleAccess(user, "dashboard");
    sendJson(res, 200, await marketonline.getOverviewData(user));
    return;
  }

  if (req.method === "GET" && pathname === "/api/stock-check") {
    sendJson(res, 200, await marketonline.getStockCheckData(user, parsedUrl.searchParams.get("q")));
    return;
  }

  if (req.method === "GET" && pathname === "/api/products") {
    sendJson(res, 200, await marketonline.getProductsData(user));
    return;
  }

  if (req.method === "POST" && pathname === "/api/products") {
    auth.requireModuleAccess(user, "products");
    sendJson(res, 200, { product: await marketonline.createProduct(body) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/cart") {
    sendJson(res, 200, await marketonline.getCartData(user));
    return;
  }

  if (req.method === "POST" && pathname === "/api/cart") {
    sendJson(res, 200, await marketonline.addCartItem(user, body));
    return;
  }

  if (req.method === "GET" && pathname === "/api/customers") {
    auth.requireModuleAccess(user, "customers");
    sendJson(res, 200, await marketonline.getCustomersData());
    return;
  }

  if (req.method === "POST" && pathname === "/api/customers") {
    auth.requireModuleAccess(user, "customers");
    sendJson(res, 200, { customer: await marketonline.createCustomer(body) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    auth.requireModuleAccess(user, "orders");
    sendJson(res, 200, await marketonline.getOrdersData());
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    auth.requireModuleAccess(user, "orders");
    sendJson(res, 200, { order: await marketonline.createOrder(body) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/suppliers") {
    auth.requireModuleAccess(user, "suppliers");
    sendJson(res, 200, await marketonline.getSuppliersData());
    return;
  }

  if (req.method === "POST" && pathname === "/api/suppliers") {
    auth.requireModuleAccess(user, "suppliers");
    sendJson(res, 200, { supplier: await marketonline.createSupplier(body) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/supplier-offers") {
    auth.requireModuleAccess(user, "suppliers");
    sendJson(res, 200, { offer: await marketonline.createSupplierOffer(body) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/supplies") {
    auth.requireModuleAccess(user, "suppliers");
    sendJson(res, 200, { supply: await marketonline.createSupply(body) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/employees") {
    auth.requireModuleAccess(user, "employees");
    sendJson(res, 200, await marketonline.getEmployeesData());
    return;
  }

  if (req.method === "POST" && pathname === "/api/employees") {
    auth.requireModuleAccess(user, "employees");
    sendJson(res, 200, { employee: await marketonline.createEmployee(body) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/employee-leaves") {
    auth.requireModuleAccess(user, "employees");
    sendJson(res, 200, { leave: await marketonline.createEmployeeLeave(body) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/employee-resignations") {
    auth.requireModuleAccess(user, "employees");
    sendJson(res, 200, { resignation: await marketonline.createEmployeeResignation(body) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/service") {
    auth.requireModuleAccess(user, "service");
    sendJson(res, 200, await marketonline.getServiceData());
    return;
  }

  if (req.method === "POST" && pathname === "/api/service") {
    auth.requireModuleAccess(user, "service");
    sendJson(res, 200, { service_case: await marketonline.createServiceCase(body) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/finance") {
    auth.requireModuleAccess(user, "finance");
    sendJson(res, 200, await marketonline.getFinanceData(user));
    return;
  }

  if (req.method === "POST" && pathname === "/api/expenses") {
    auth.requireModuleAccess(user, "finance");
    sendJson(res, 200, { expense: await marketonline.createExpense(user, body) });
    return;
  }

  throw new HttpError(404, "Not found.");
}

function serveSpa(res, pathname) {
  if (pathname === "/") {
    serveFile(res, path.join(STATIC_DIR, "index.html"));
    return;
  }

  if (isStaticAssetPath(pathname)) {
    const relativeAssetPath = pathname.startsWith("/static/")
      ? pathname.slice("/static/".length)
      : pathname.replace(/^\/+/, "");
    const staticPath = safeStaticPath(STATIC_DIR, relativeAssetPath);
    if (staticPath && fileExists(staticPath)) {
      serveFile(res, staticPath);
      return;
    }
    throw new HttpError(404, "File not found.");
  }

  serveFile(res, path.join(STATIC_DIR, "index.html"));
}

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith("/api/")) {
    await handleApiRequest(req, res, parsedUrl);
    return;
  }

  if (req.method !== "GET") {
    throw new HttpError(405, "Method not allowed.");
  }

  serveSpa(res, pathname);
}

function createApp() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => sendError(res, error));
  });
}

module.exports = {
  createApp,
};
