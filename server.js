const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const STATIC_DIR = path.join(ROOT, "static");
const DATA_DIR = path.join(ROOT, "data");
const INDEX_PATH = path.join(STATIC_DIR, "index.html");

const DATA_FILES = {
  users: path.join(DATA_DIR, "users.json"),
  products: path.join(DATA_DIR, "products.json"),
  vendorRequests: path.join(DATA_DIR, "vendor_requests.json"),
  productRemovalRequests: path.join(DATA_DIR, "product_removal_requests.json"),
  comments: path.join(DATA_DIR, "comments.json"),
  complaints: path.join(DATA_DIR, "complaints.json"),
  activityLogs: path.join(DATA_DIR, "activity_logs.json"),
  settings: path.join(DATA_DIR, "settings.json"),
  shoppingLists: path.join(DATA_DIR, "shopping_lists.json"),
  events: path.join(DATA_DIR, "events.json"),
};

const ROLE = Object.freeze({
  CUSTOMER: "customer",
  VENDOR: "vendor",
  MODERATOR: "moderator",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
});

const USER_STATUS = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
});

const PRODUCT_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  PENDING_REVIEW: "pending_review",
  UNAVAILABLE: "unavailable",
  REMOVED: "removed",
});

const PRODUCT_TYPE = Object.freeze({
  PERMANENT: "permanent",
  SEASONAL: "seasonal",
});

const COMMENT_STATUS = Object.freeze({
  VISIBLE: "visible",
  HIDDEN: "hidden",
  PENDING_REVIEW: "pending_review",
  REJECTED: "rejected",
});

const COMPLAINT_STATUS = Object.freeze({
  OPEN: "open",
  RESOLVED: "resolved",
  REJECTED: "rejected",
  ESCALATED: "escalated_to_admin",
});

const REQUEST_STATUS = Object.freeze({
  PENDING_ADMIN: "pending_admin_review",
  PENDING_SUPER_ADMIN: "pending_super_admin_review",
  APPROVED: "approved",
  REJECTED_BY_ADMIN: "rejected_by_admin",
  REJECTED_BY_SUPER_ADMIN: "rejected_by_super_admin",
});

const SESSION_COOKIE = "openmarket_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_DIGEST_BYTES = 32;

const sessions = new Map();

const APP_ROUTES = new Set([
  "/",
  "/login",
  "/register",
  "/dashboard",
  "/profile",
  "/products",
  "/vendor/products",
  "/vendor/add-product",
  "/admin/users",
  "/admin/vendor-requests",
  "/admin/product-removals",
  "/admin/stats",
  "/moderator/complaints",
  "/moderator/comments",
  "/super-admin/settings",
  "/super-admin/audit",
]);

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return nowIso().slice(0, 10);
}

function addDays(baseDate, days) {
  const copy = new Date(baseDate);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function trimString(value) {
  return String(value || "").trim();
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const digest = crypto.pbkdf2Sync(
    String(password),
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_DIGEST_BYTES,
    "sha256"
  );
  return `${salt.toString("hex")}:${digest.toString("hex")}`;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function verifyPassword(password, storedValue) {
  if (!storedValue || !storedValue.includes(":")) {
    return false;
  }
  const [saltHex, digestHex] = storedValue.split(":", 2);
  const digest = crypto.pbkdf2Sync(
    String(password),
    Buffer.from(saltHex, "hex"),
    PASSWORD_ITERATIONS,
    PASSWORD_DIGEST_BYTES,
    "sha256"
  );
  return constantTimeEqual(digest.toString("hex"), digestHex);
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function normalizeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("Price must be a valid positive number.");
  }
  return Number(numeric.toFixed(2));
}

function normalizeStock(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error("Stock must be a whole number greater than or equal to zero.");
  }
  return numeric;
}

function clampRating(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }
  return numeric;
}

function slugify(text) {
  return trimString(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function mimeTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function safeStaticPath(relativePath) {
  const resolved = path.resolve(STATIC_DIR, relativePath);
  if (!resolved.startsWith(path.resolve(STATIC_DIR))) {
    return null;
  }
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(res, 404, { error: "File not found." });
        return;
      }
      sendJson(res, 500, { error: "Internal server error." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypeFor(filePath),
      "Content-Length": String(content.length),
    });
    res.end(content);
  });
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload), "utf-8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    ...headers,
  });
  res.end(body);
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) {
        return acc;
      }
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024 * 2) {
        reject(new Error("Request body too large."));
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", (error) => reject(error));
  });
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function buildSeedData() {
  const seededAt = nowIso();
  const demoPassword = "OpenMarket123!";

  const ids = {
    customer: "user_customer_seed",
    vendor: "user_vendor_seed",
    moderator: "user_moderator_seed",
    admin: "user_admin_seed",
    superAdmin: "user_super_admin_seed",
    productLamp: "product_lamp_seed",
    productCandles: "product_candles_seed",
    productTray: "product_tray_seed",
    productPrints: "product_prints_seed",
    vendorRequest: "vendor_request_seed",
    removalRequest: "removal_request_seed",
    commentVisible: "comment_visible_seed",
    commentPending: "comment_pending_seed",
    complaintProduct: "complaint_product_seed",
    complaintComment: "complaint_comment_seed",
  };

  const users = [
    {
      id: ids.customer,
      email: "customer@openmarket.local",
      display_name: "Emma Carter",
      password_hash: hashPassword(demoPassword),
      provider: "local",
      role: ROLE.CUSTOMER,
      status: USER_STATUS.ACTIVE,
      bio: "Design-forward shopper focused on seasonal makers.",
      company: "",
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.vendor,
      email: "vendor@openmarket.local",
      display_name: "Marcus Vale",
      password_hash: hashPassword(demoPassword),
      provider: "local",
      role: ROLE.VENDOR,
      status: USER_STATUS.ACTIVE,
      bio: "Independent maker building warm desk objects and calm interiors.",
      company: "Atelier North",
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.moderator,
      email: "moderator@openmarket.local",
      display_name: "Nadia Bloom",
      password_hash: hashPassword(demoPassword),
      provider: "local",
      role: ROLE.MODERATOR,
      status: USER_STATUS.ACTIVE,
      bio: "Content moderator for product conversations and escalations.",
      company: "OpenMarket",
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.admin,
      email: "admin@openmarket.local",
      display_name: "Jonah Reed",
      password_hash: hashPassword(demoPassword),
      provider: "local",
      role: ROLE.ADMIN,
      status: USER_STATUS.ACTIVE,
      bio: "Marketplace operator handling approvals and reporting.",
      company: "OpenMarket",
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.superAdmin,
      email: "superadmin@openmarket.local",
      display_name: "Priya North",
      password_hash: hashPassword(demoPassword),
      provider: "local",
      role: ROLE.SUPER_ADMIN,
      status: USER_STATUS.ACTIVE,
      bio: "System owner with access to global settings and audit trails.",
      company: "OpenMarket",
      created_at: seededAt,
      updated_at: seededAt,
    },
  ];

  const products = [
    {
      id: ids.productLamp,
      vendor_id: ids.vendor,
      title: "Arc Desk Lamp",
      slug: "arc-desk-lamp",
      summary: "Soft bronze lamp for focused work corners and calm late sessions.",
      description:
        "A compact metal desk lamp with warm directional light, textured bronze finish, and a weighted base built for studios and remote desks.",
      price: 129,
      currency: "USD",
      stock: 14,
      category: "Home Studio",
      status: PRODUCT_STATUS.PUBLISHED,
      product_type: PRODUCT_TYPE.PERMANENT,
      available_from: null,
      available_until: null,
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.productCandles,
      vendor_id: ids.vendor,
      title: "Citrus Workshop Candle Set",
      slug: "citrus-workshop-candle-set",
      summary: "Seasonal candles built for bright workspaces and short limited drops.",
      description:
        "A three-piece candle set with citrus, cedar, and tea leaf notes. Sold as a seasonal batch with limited production windows.",
      price: 34,
      currency: "USD",
      stock: 26,
      category: "Seasonal Drops",
      status: PRODUCT_STATUS.PUBLISHED,
      product_type: PRODUCT_TYPE.SEASONAL,
      available_from: addDays(seededAt, -7),
      available_until: addDays(seededAt, 50),
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.productTray,
      vendor_id: ids.vendor,
      title: "Modular Catch-All Tray",
      slug: "modular-catch-all-tray",
      summary: "Draft organizer tray with magnetic inserts and cable slots.",
      description:
        "An in-progress accessory designed for laptops, pens, adapters, and compact creator tools. Still being tuned before launch.",
      price: 48,
      currency: "USD",
      stock: 8,
      category: "Maker Tools",
      status: PRODUCT_STATUS.DRAFT,
      product_type: PRODUCT_TYPE.PERMANENT,
      available_from: null,
      available_until: null,
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.productPrints,
      vendor_id: ids.vendor,
      title: "Botanical Print Series",
      slug: "botanical-print-series",
      summary: "Limited print bundle temporarily unavailable while a removal request is reviewed.",
      description:
        "A small set of textured botanical wall prints. The vendor has requested removal while reviewing framing and material costs.",
      price: 57,
      currency: "USD",
      stock: 4,
      category: "Wall Objects",
      status: PRODUCT_STATUS.UNAVAILABLE,
      product_type: PRODUCT_TYPE.SEASONAL,
      available_from: addDays(seededAt, -21),
      available_until: addDays(seededAt, 70),
      created_at: seededAt,
      updated_at: seededAt,
    },
  ];

  const vendorRequests = [
    {
      id: ids.vendorRequest,
      user_id: ids.customer,
      status: REQUEST_STATUS.PENDING_ADMIN,
      reason: "I want to sell handmade paper goods and seasonal stationery kits.",
      created_at: seededAt,
      updated_at: seededAt,
      admin_review: null,
      super_admin_review: null,
    },
  ];

  const productRemovalRequests = [
    {
      id: ids.removalRequest,
      product_id: ids.productPrints,
      vendor_id: ids.vendor,
      status: REQUEST_STATUS.PENDING_ADMIN,
      reason: "Pause this seasonal collection while the vendor refreshes packaging.",
      created_at: seededAt,
      updated_at: seededAt,
      admin_review: null,
      super_admin_review: null,
    },
  ];

  const comments = [
    {
      id: ids.commentVisible,
      product_id: ids.productLamp,
      user_id: ids.customer,
      content: "Beautiful light spread and a solid base. It feels premium on a small desk.",
      rating: 5,
      status: COMMENT_STATUS.VISIBLE,
      moderation_note: "",
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.commentPending,
      product_id: ids.productCandles,
      user_id: ids.customer,
      content: "I like the scent but the glass lid felt lighter than expected. Curious about the refill plan.",
      rating: 3,
      status: COMMENT_STATUS.PENDING_REVIEW,
      moderation_note: "",
      created_at: seededAt,
      updated_at: seededAt,
    },
  ];

  const complaints = [
    {
      id: ids.complaintProduct,
      reporter_id: ids.customer,
      target_type: "product",
      target_id: ids.productCandles,
      reason: "Availability clarification",
      details: "The seasonal dates are clear, but I want a moderator to confirm if restocks are allowed after the window ends.",
      status: COMPLAINT_STATUS.OPEN,
      reviewer_id: null,
      resolution_note: "",
      created_at: seededAt,
      updated_at: seededAt,
    },
    {
      id: ids.complaintComment,
      reporter_id: ids.vendor,
      target_type: "comment",
      target_id: ids.commentPending,
      reason: "Review needs moderator attention",
      details: "The comment is constructive, but I want it checked before it becomes public because it mentions product assumptions.",
      status: COMPLAINT_STATUS.ESCALATED,
      reviewer_id: ids.moderator,
      resolution_note: "Escalated to admin for a policy decision about pre-launch seasonal feedback.",
      created_at: seededAt,
      updated_at: seededAt,
    },
  ];

  const activityLogs = [
    {
      id: generateId("log"),
      actor_id: ids.superAdmin,
      actor_role: ROLE.SUPER_ADMIN,
      action: "seed.initialized",
      entity_type: "system",
      entity_id: "openmarket",
      details: {
        note: "Initial marketplace seed data was generated.",
      },
      created_at: seededAt,
    },
    {
      id: generateId("log"),
      actor_id: ids.vendor,
      actor_role: ROLE.VENDOR,
      action: "product.removal_requested",
      entity_type: "product_removal_request",
      entity_id: ids.removalRequest,
      details: {
        product_id: ids.productPrints,
      },
      created_at: seededAt,
    },
  ];

  const settings = {
    site_name: "OpenMarket",
    tagline: "Independent makers, moderated trust, and seasonal drops with clear lifecycle rules.",
    support_email: "support@openmarket.local",
    featured_categories: ["Home Studio", "Seasonal Drops", "Maker Tools"],
    seasonal_policy: "Seasonal products automatically become unavailable after their end date.",
    updated_at: seededAt,
  };

  return {
    users,
    products,
    vendorRequests,
    productRemovalRequests,
    comments,
    complaints,
    activityLogs,
    settings,
    shoppingLists: [],
    events: [],
  };
}

function readDefaultValue(name) {
  if (name === "settings") {
    return {};
  }
  return [];
}

function writeCollection(name, value) {
  ensureDirectory(DATA_DIR);
  const filePath = DATA_FILES[name];
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function ensureDataFiles() {
  ensureDirectory(DATA_DIR);
  const existingJson = Object.values(DATA_FILES).filter((filePath) => fs.existsSync(filePath));

  if (existingJson.length === 0) {
    const seed = buildSeedData();
    writeCollection("users", seed.users);
    writeCollection("products", seed.products);
    writeCollection("vendorRequests", seed.vendorRequests);
    writeCollection("productRemovalRequests", seed.productRemovalRequests);
    writeCollection("comments", seed.comments);
    writeCollection("complaints", seed.complaints);
    writeCollection("activityLogs", seed.activityLogs);
    writeCollection("settings", seed.settings);
    writeCollection("shoppingLists", seed.shoppingLists);
    writeCollection("events", seed.events);
    return;
  }

  const defaults = {
    users: [],
    products: [],
    vendorRequests: [],
    productRemovalRequests: [],
    comments: [],
    complaints: [],
    activityLogs: [],
    settings: {
      site_name: "OpenMarket",
      tagline: "Independent makers, moderated trust, and seasonal drops with clear lifecycle rules.",
      support_email: "support@openmarket.local",
      featured_categories: ["Home Studio", "Seasonal Drops", "Maker Tools"],
      seasonal_policy: "Seasonal products automatically become unavailable after their end date.",
      updated_at: nowIso(),
    },
    shoppingLists: [],
    events: [],
  };

  Object.entries(DATA_FILES).forEach(([key, filePath]) => {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaults[key], null, 2), "utf-8");
    }
  });
}

function readCollection(name) {
  ensureDataFiles();
  const filePath = DATA_FILES[name];
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) {
    return Array.isArray(readDefaultValue(name)) ? [] : {};
  }
  return safeJsonParse(raw, readDefaultValue(name));
}

function appendActivityLog(entry) {
  const logs = readCollection("activityLogs");
  logs.unshift(entry);
  writeCollection("activityLogs", logs.slice(0, 1000));
}

function logActivity(actor, action, entityType, entityId, details = {}) {
  appendActivityLog({
    id: generateId("log"),
    actor_id: actor?.id || null,
    actor_role: actor?.role || "system",
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    created_at: nowIso(),
  });
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return readCollection("users").find((user) => user.email === normalized) || null;
}

function findUserById(userId) {
  return readCollection("users").find((user) => user.id === userId) || null;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, {
    token,
    userId,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
  return token;
}

function getSession(token) {
  if (!token) {
    return null;
  }
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function deleteSession(token) {
  if (token) {
    sessions.delete(token);
  }
}

function publicUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    status: user.status,
    provider: user.provider,
    bio: user.bio || "",
    company: user.company || "",
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function currentUser(req) {
  const cookies = parseCookies(req);
  const session = getSession(cookies[SESSION_COOKIE]);
  if (!session) {
    return null;
  }
  return findUserById(session.userId);
}

function authPayload(user, message) {
  return {
    message,
    user: publicUser(user),
  };
}

function sessionPayload(user) {
  return {
    authenticated: Boolean(user),
    user: publicUser(user),
  };
}

function hasRole(user, allowedRoles) {
  if (!user) {
    return false;
  }
  if (allowedRoles.includes(user.role)) {
    return true;
  }
  if (user.role === ROLE.SUPER_ADMIN && allowedRoles.some((role) => [ROLE.ADMIN, ROLE.MODERATOR].includes(role))) {
    return true;
  }
  return false;
}

function requireAuthenticated(req, res) {
  const user = currentUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Login required." });
    return null;
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    sendJson(res, 403, { error: "Your account is suspended." });
    return null;
  }
  return user;
}

function requireRole(user, res, allowedRoles) {
  if (!hasRole(user, allowedRoles)) {
    sendJson(res, 403, { error: "You do not have access to this area." });
    return false;
  }
  return true;
}

function isAppRoute(pathname) {
  if (APP_ROUTES.has(pathname)) {
    return true;
  }
  return /^\/products\/[^/]+$/.test(pathname);
}

function reconcileSeasonalProducts() {
  const products = readCollection("products");
  const today = todayIso();
  let changed = false;
  const expiredIds = [];

  const updated = products.map((product) => {
    if (
      product.product_type === PRODUCT_TYPE.SEASONAL &&
      product.available_until &&
      today > product.available_until &&
      ![PRODUCT_STATUS.UNAVAILABLE, PRODUCT_STATUS.REMOVED].includes(product.status)
    ) {
      changed = true;
      expiredIds.push(product.id);
      return {
        ...product,
        status: PRODUCT_STATUS.UNAVAILABLE,
        updated_at: nowIso(),
      };
    }
    return product;
  });

  if (changed) {
    writeCollection("products", updated);
    expiredIds.forEach((productId) => {
      appendActivityLog({
        id: generateId("log"),
        actor_id: null,
        actor_role: "system",
        action: "product.auto_unavailable",
        entity_type: "product",
        entity_id: productId,
        details: {
          reason: "seasonal_window_elapsed",
        },
        created_at: nowIso(),
      });
    });
  }
}

function readProducts() {
  reconcileSeasonalProducts();
  return readCollection("products");
}

function mapById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function averageRating(comments) {
  if (comments.length === 0) {
    return null;
  }
  const total = comments.reduce((sum, comment) => sum + Number(comment.rating || 0), 0);
  return Number((total / comments.length).toFixed(1));
}

function sortNewest(first, second) {
  return String(second.created_at || "").localeCompare(String(first.created_at || ""));
}

function latestVendorRequestForUser(userId, vendorRequests) {
  return (
    vendorRequests
      .filter((request) => request.user_id === userId)
      .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0] ||
    null
  );
}

function pendingRemovalForProduct(productId, removalRequests) {
  return (
    removalRequests.find(
      (request) =>
        request.product_id === productId &&
        [REQUEST_STATUS.PENDING_ADMIN, REQUEST_STATUS.PENDING_SUPER_ADMIN].includes(request.status)
    ) || null
  );
}

function visibleCommentsForProduct(productId, comments) {
  return comments.filter(
    (comment) => comment.product_id === productId && comment.status === COMMENT_STATUS.VISIBLE
  );
}

function decorateProduct(product, usersMap, comments, removalRequests, currentViewer) {
  const visibleComments = visibleCommentsForProduct(product.id, comments);
  const vendor = usersMap.get(product.vendor_id);
  const activeRemoval = pendingRemovalForProduct(product.id, removalRequests);

  return {
    ...product,
    vendor_name: vendor?.display_name || "Unknown vendor",
    vendor_company: vendor?.company || "",
    average_rating: averageRating(visibleComments),
    review_count: visibleComments.length,
    can_comment: Boolean(currentViewer),
    can_edit: Boolean(
      currentViewer &&
        (currentViewer.id === product.vendor_id || hasRole(currentViewer, [ROLE.ADMIN, ROLE.SUPER_ADMIN]))
    ),
    active_removal_request: activeRemoval
      ? {
          id: activeRemoval.id,
          status: activeRemoval.status,
          reason: activeRemoval.reason,
        }
      : null,
  };
}

function canViewProduct(user, product) {
  if (!product) {
    return false;
  }
  if ([PRODUCT_STATUS.PUBLISHED, PRODUCT_STATUS.UNAVAILABLE].includes(product.status)) {
    return true;
  }
  if (!user) {
    return false;
  }
  if (product.vendor_id === user.id) {
    return true;
  }
  return hasRole(user, [ROLE.MODERATOR, ROLE.ADMIN, ROLE.SUPER_ADMIN]);
}

function decorateComment(comment, productsMap, usersMap) {
  const author = usersMap.get(comment.user_id);
  const product = productsMap.get(comment.product_id);
  return {
    ...comment,
    author_name: author?.display_name || "Unknown user",
    author_role: author?.role || ROLE.CUSTOMER,
    product_title: product?.title || "Unknown product",
  };
}

function canSeeComment(currentViewer, comment, product) {
  if (comment.status === COMMENT_STATUS.VISIBLE) {
    return true;
  }
  if (!currentViewer) {
    return false;
  }
  if (comment.user_id === currentViewer.id) {
    return true;
  }
  if (product?.vendor_id === currentViewer.id) {
    return true;
  }
  return hasRole(currentViewer, [ROLE.MODERATOR, ROLE.ADMIN, ROLE.SUPER_ADMIN]);
}

function decorateVendorRequest(request, usersMap) {
  const requester = usersMap.get(request.user_id);
  return {
    ...request,
    user_name: requester?.display_name || "Unknown user",
    user_email: requester?.email || "",
    user_role: requester?.role || ROLE.CUSTOMER,
  };
}

function decorateRemovalRequest(request, usersMap, productsMap) {
  const vendor = usersMap.get(request.vendor_id);
  const product = productsMap.get(request.product_id);
  return {
    ...request,
    vendor_name: vendor?.display_name || "Unknown vendor",
    vendor_email: vendor?.email || "",
    product_title: product?.title || "Unknown product",
    product_status: product?.status || PRODUCT_STATUS.REMOVED,
  };
}

function decorateComplaint(complaint, usersMap, productsMap, commentsMap) {
  const reporter = usersMap.get(complaint.reporter_id);
  const comment = commentsMap.get(complaint.target_id);
  const product = productsMap.get(complaint.target_id) || (comment ? productsMap.get(comment.product_id) : null);
  const targetUser =
    complaint.target_type === "user"
      ? usersMap.get(complaint.target_id)
      : comment
      ? usersMap.get(comment.user_id)
      : product
      ? usersMap.get(product.vendor_id)
      : null;

  return {
    ...complaint,
    reporter_name: reporter?.display_name || "Unknown user",
    target_label:
      complaint.target_type === "product"
        ? product?.title || "Unknown product"
        : complaint.target_type === "comment"
        ? comment?.content || "Unknown comment"
        : targetUser?.display_name || "Unknown user",
  };
}

function decorateLog(log, usersMap) {
  const actor = usersMap.get(log.actor_id);
  return {
    ...log,
    actor_name: actor?.display_name || (log.actor_role === "system" ? "System" : "Unknown user"),
    actor_email: actor?.email || "",
  };
}

function registerUser(email, password, displayName) {
  const normalizedEmail = normalizeEmail(email);
  const users = readCollection("users");

  if (users.some((user) => user.email === normalizedEmail)) {
    throw new Error("An account with this email already exists.");
  }

  const createdAt = nowIso();
  const user = {
    id: generateId("user"),
    email: normalizedEmail,
    display_name: trimString(displayName) || normalizedEmail.split("@", 1)[0],
    password_hash: hashPassword(password),
    provider: "local",
    role: ROLE.CUSTOMER,
    status: USER_STATUS.ACTIVE,
    bio: "",
    company: "",
    created_at: createdAt,
    updated_at: createdAt,
  };

  users.push(user);
  writeCollection("users", users);
  logActivity(user, "user.registered", "user", user.id, { email: user.email });
  return user;
}

function updateUserRecord(userId, updater) {
  const users = readCollection("users");
  const index = users.findIndex((user) => user.id === userId);
  if (index === -1) {
    return null;
  }
  const nextUser = updater(users[index]);
  users[index] = nextUser;
  writeCollection("users", users);
  return nextUser;
}

function updateProductRecord(productId, updater) {
  const products = readProducts();
  const index = products.findIndex((product) => product.id === productId);
  if (index === -1) {
    return null;
  }
  const nextProduct = updater(products[index]);
  products[index] = nextProduct;
  writeCollection("products", products);
  return nextProduct;
}

function getCatalogPayload(user) {
  const users = readCollection("users");
  const products = readProducts();
  const comments = readCollection("comments");
  const removalRequests = readCollection("productRemovalRequests");
  const usersMap = mapById(users);

  const visibleProducts = products
    .filter((product) => [PRODUCT_STATUS.PUBLISHED, PRODUCT_STATUS.UNAVAILABLE].includes(product.status))
    .map((product) => decorateProduct(product, usersMap, comments, removalRequests, user))
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));

  return {
    products: visibleProducts,
    categories: Array.from(new Set(visibleProducts.map((product) => product.category))).sort(),
  };
}

function getProductDetailPayload(productId, user) {
  const users = readCollection("users");
  const products = readProducts();
  const comments = readCollection("comments");
  const removalRequests = readCollection("productRemovalRequests");
  const complaints = readCollection("complaints");
  const usersMap = mapById(users);
  const productsMap = mapById(products);
  const commentsMap = mapById(comments);
  const product = productsMap.get(productId);

  if (!product) {
    return null;
  }
  if (!canViewProduct(user, product)) {
    return "forbidden";
  }

  return {
    product: decorateProduct(product, usersMap, comments, removalRequests, user),
    comments: comments
      .filter((comment) => comment.product_id === productId)
      .filter((comment) => canSeeComment(user, comment, product))
      .map((comment) => decorateComment(comment, productsMap, usersMap))
      .sort(sortNewest),
    related_complaints: complaints
      .filter((complaint) => complaint.target_id === productId || comments.some((comment) => comment.id === complaint.target_id))
      .map((complaint) => decorateComplaint(complaint, usersMap, productsMap, commentsMap))
      .sort(sortNewest),
  };
}

function getProfilePayload(user) {
  const vendorRequests = readCollection("vendorRequests");
  const removalRequests = readCollection("productRemovalRequests");
  const comments = readCollection("comments");
  const complaints = readCollection("complaints");
  const products = readProducts();
  const users = readCollection("users");
  const productsMap = mapById(products);
  const usersMap = mapById(users);

  return {
    user: publicUser(user),
    latest_vendor_request: latestVendorRequestForUser(user.id, vendorRequests),
    my_products: products
      .filter((product) => product.vendor_id === user.id)
      .map((product) => decorateProduct(product, usersMap, comments, removalRequests, user))
      .sort(sortNewest),
    my_comments: comments
      .filter((comment) => comment.user_id === user.id)
      .map((comment) => decorateComment(comment, productsMap, usersMap))
      .sort(sortNewest),
    my_complaints: complaints
      .filter((complaint) => complaint.reporter_id === user.id)
      .map((complaint) => decorateComplaint(complaint, usersMap, productsMap, mapById(comments)))
      .sort(sortNewest),
    my_removal_requests: removalRequests
      .filter((request) => request.vendor_id === user.id)
      .map((request) => decorateRemovalRequest(request, usersMap, productsMap))
      .sort(sortNewest),
  };
}

function getDashboardPayload(user) {
  const users = readCollection("users");
  const products = readProducts();
  const vendorRequests = readCollection("vendorRequests");
  const removalRequests = readCollection("productRemovalRequests");
  const comments = readCollection("comments");
  const complaints = readCollection("complaints");
  const logs = readCollection("activityLogs");
  const settings = readCollection("settings");
  const usersMap = mapById(users);

  return {
    user: publicUser(user),
    settings,
    summary: {
      total_live_products: products.filter((product) => product.status === PRODUCT_STATUS.PUBLISHED).length,
      seasonal_products: products.filter((product) => product.product_type === PRODUCT_TYPE.SEASONAL).length,
      pending_vendor_requests: vendorRequests.filter((request) => request.status === REQUEST_STATUS.PENDING_ADMIN).length,
      pending_final_vendor_requests: vendorRequests.filter((request) => request.status === REQUEST_STATUS.PENDING_SUPER_ADMIN)
        .length,
      pending_product_removals: removalRequests.filter((request) => request.status === REQUEST_STATUS.PENDING_ADMIN).length,
      pending_final_product_removals: removalRequests.filter(
        (request) => request.status === REQUEST_STATUS.PENDING_SUPER_ADMIN
      ).length,
      pending_comments: comments.filter((comment) => comment.status === COMMENT_STATUS.PENDING_REVIEW).length,
      open_complaints: complaints.filter((complaint) => complaint.status === COMPLAINT_STATUS.OPEN).length,
      escalated_complaints: complaints.filter((complaint) => complaint.status === COMPLAINT_STATUS.ESCALATED).length,
      active_users: users.filter((account) => account.status === USER_STATUS.ACTIVE).length,
      my_products: products.filter((product) => product.vendor_id === user.id).length,
      my_comments: comments.filter((comment) => comment.user_id === user.id).length,
      my_complaints: complaints.filter((complaint) => complaint.reporter_id === user.id).length,
    },
    latest_vendor_request: latestVendorRequestForUser(user.id, vendorRequests),
    recent_products: products
      .filter((product) => [PRODUCT_STATUS.PUBLISHED, PRODUCT_STATUS.UNAVAILABLE].includes(product.status))
      .map((product) => decorateProduct(product, usersMap, comments, removalRequests, user))
      .sort(sortNewest)
      .slice(0, 4),
    recent_logs: logs.map((log) => decorateLog(log, usersMap)).slice(0, 10),
  };
}

function getVendorProductsPayload(user) {
  const users = readCollection("users");
  const products = readProducts();
  const comments = readCollection("comments");
  const removalRequests = readCollection("productRemovalRequests");
  const usersMap = mapById(users);

  return {
    products: products
      .filter((product) => product.vendor_id === user.id)
      .map((product) => decorateProduct(product, usersMap, comments, removalRequests, user))
      .sort(sortNewest),
    removal_requests: removalRequests
      .filter((request) => request.vendor_id === user.id)
      .sort(sortNewest),
  };
}

function getModeratorCommentsPayload() {
  const users = readCollection("users");
  const products = readProducts();
  const comments = readCollection("comments");
  const usersMap = mapById(users);
  const productsMap = mapById(products);

  return {
    comments: comments
      .map((comment) => decorateComment(comment, productsMap, usersMap))
      .sort((a, b) => {
        const score = {
          [COMMENT_STATUS.PENDING_REVIEW]: 0,
          [COMMENT_STATUS.HIDDEN]: 1,
          [COMMENT_STATUS.VISIBLE]: 2,
          [COMMENT_STATUS.REJECTED]: 3,
        };
        return score[a.status] - score[b.status] || sortNewest(a, b);
      }),
  };
}

function getModeratorComplaintsPayload() {
  const users = readCollection("users");
  const products = readProducts();
  const comments = readCollection("comments");
  const complaints = readCollection("complaints");
  const usersMap = mapById(users);
  const productsMap = mapById(products);
  const commentsMap = mapById(comments);

  return {
    complaints: complaints
      .map((complaint) => decorateComplaint(complaint, usersMap, productsMap, commentsMap))
      .sort((first, second) => {
        const score = {
          [COMPLAINT_STATUS.OPEN]: 0,
          [COMPLAINT_STATUS.ESCALATED]: 1,
          [COMPLAINT_STATUS.RESOLVED]: 2,
          [COMPLAINT_STATUS.REJECTED]: 3,
        };
        return score[first.status] - score[second.status] || sortNewest(first, second);
      }),
  };
}

function getAdminUsersPayload() {
  const users = readCollection("users");
  return {
    users: users.map((user) => publicUser(user)).sort((a, b) => a.display_name.localeCompare(b.display_name)),
  };
}

function getAdminVendorRequestsPayload() {
  const users = readCollection("users");
  const usersMap = mapById(users);
  return {
    requests: readCollection("vendorRequests").map((request) => decorateVendorRequest(request, usersMap)).sort(sortNewest),
  };
}

function getAdminProductRemovalsPayload() {
  const users = readCollection("users");
  const products = readProducts();
  const usersMap = mapById(users);
  const productsMap = mapById(products);
  return {
    requests: readCollection("productRemovalRequests")
      .map((request) => decorateRemovalRequest(request, usersMap, productsMap))
      .sort(sortNewest),
  };
}

function getAdminStatsPayload() {
  const users = readCollection("users");
  const products = readProducts();
  const vendorRequests = readCollection("vendorRequests");
  const removalRequests = readCollection("productRemovalRequests");
  const comments = readCollection("comments");
  const complaints = readCollection("complaints");
  const logs = readCollection("activityLogs");
  const usersMap = mapById(users);

  return {
    totals: {
      users: users.length,
      active_users: users.filter((user) => user.status === USER_STATUS.ACTIVE).length,
      products: products.length,
      visible_catalog_products: products.filter((product) => product.status === PRODUCT_STATUS.PUBLISHED).length,
      pending_vendor_requests: vendorRequests.filter((request) => request.status === REQUEST_STATUS.PENDING_ADMIN).length,
      pending_product_removals: removalRequests.filter((request) => request.status === REQUEST_STATUS.PENDING_ADMIN).length,
      pending_comments: comments.filter((comment) => comment.status === COMMENT_STATUS.PENDING_REVIEW).length,
      open_complaints: complaints.filter((complaint) => complaint.status === COMPLAINT_STATUS.OPEN).length,
    },
    product_breakdown: {
      draft: products.filter((product) => product.status === PRODUCT_STATUS.DRAFT).length,
      published: products.filter((product) => product.status === PRODUCT_STATUS.PUBLISHED).length,
      pending_review: products.filter((product) => product.status === PRODUCT_STATUS.PENDING_REVIEW).length,
      unavailable: products.filter((product) => product.status === PRODUCT_STATUS.UNAVAILABLE).length,
      removed: products.filter((product) => product.status === PRODUCT_STATUS.REMOVED).length,
      permanent: products.filter((product) => product.product_type === PRODUCT_TYPE.PERMANENT).length,
      seasonal: products.filter((product) => product.product_type === PRODUCT_TYPE.SEASONAL).length,
    },
    latest_logs: logs.map((log) => decorateLog(log, usersMap)).slice(0, 12),
  };
}

function getSuperAdminSettingsPayload() {
  const users = readCollection("users");
  const settings = readCollection("settings");
  const vendorRequests = readCollection("vendorRequests");
  const removalRequests = readCollection("productRemovalRequests");
  const usersMap = mapById(users);
  const productsMap = mapById(readProducts());

  return {
    settings,
    users: users.map((user) => publicUser(user)).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    pending_final_vendor_requests: vendorRequests
      .filter((request) => request.status === REQUEST_STATUS.PENDING_SUPER_ADMIN)
      .map((request) => decorateVendorRequest(request, usersMap))
      .sort(sortNewest),
    pending_final_product_removals: removalRequests
      .filter((request) => request.status === REQUEST_STATUS.PENDING_SUPER_ADMIN)
      .map((request) => decorateRemovalRequest(request, usersMap, productsMap))
      .sort(sortNewest),
  };
}

function getSuperAdminAuditPayload() {
  const users = readCollection("users");
  const usersMap = mapById(users);
  return {
    logs: readCollection("activityLogs").map((log) => decorateLog(log, usersMap)),
  };
}

async function handleGet(req, res, pathname) {
  if (pathname === "/api/session") {
    sendJson(res, 200, sessionPayload(currentUser(req)));
    return;
  }

  if (pathname === "/api/dashboard") {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }
    sendJson(res, 200, getDashboardPayload(user));
    return;
  }

  if (pathname === "/api/profile") {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }
    sendJson(res, 200, getProfilePayload(user));
    return;
  }

  if (pathname === "/api/products") {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }
    sendJson(res, 200, getCatalogPayload(user));
    return;
  }

  const productDetailMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productDetailMatch) {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }
    const payload = getProductDetailPayload(productDetailMatch[1], user);
    if (!payload) {
      sendJson(res, 404, { error: "Product not found." });
      return;
    }
    if (payload === "forbidden") {
      sendJson(res, 403, { error: "You cannot view this product." });
      return;
    }
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === "/api/vendor/products") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.VENDOR])) {
      return;
    }
    sendJson(res, 200, getVendorProductsPayload(user));
    return;
  }

  if (pathname === "/api/moderator/comments") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.MODERATOR])) {
      return;
    }
    sendJson(res, 200, getModeratorCommentsPayload());
    return;
  }

  if (pathname === "/api/moderator/complaints") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.MODERATOR])) {
      return;
    }
    sendJson(res, 200, getModeratorComplaintsPayload());
    return;
  }

  if (pathname === "/api/admin/users") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.ADMIN])) {
      return;
    }
    sendJson(res, 200, getAdminUsersPayload());
    return;
  }

  if (pathname === "/api/admin/vendor-requests") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.ADMIN])) {
      return;
    }
    sendJson(res, 200, getAdminVendorRequestsPayload());
    return;
  }

  if (pathname === "/api/admin/product-removals") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.ADMIN])) {
      return;
    }
    sendJson(res, 200, getAdminProductRemovalsPayload());
    return;
  }

  if (pathname === "/api/admin/stats") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.ADMIN])) {
      return;
    }
    sendJson(res, 200, getAdminStatsPayload());
    return;
  }

  if (pathname === "/api/super-admin/settings") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.SUPER_ADMIN])) {
      return;
    }
    sendJson(res, 200, getSuperAdminSettingsPayload());
    return;
  }

  if (pathname === "/api/super-admin/audit") {
    const user = requireAuthenticated(req, res);
    if (!user || !requireRole(user, res, [ROLE.SUPER_ADMIN])) {
      return;
    }
    sendJson(res, 200, getSuperAdminAuditPayload());
    return;
  }

  if (pathname.startsWith("/static/")) {
    const filePath = safeStaticPath(pathname.slice("/static/".length));
    if (!filePath) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    serveFile(res, filePath);
    return;
  }

  if (isAppRoute(pathname)) {
    serveFile(res, INDEX_PATH);
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

function validateProductPayload(payload) {
  const title = trimString(payload.title);
  const summary = trimString(payload.summary);
  const description = trimString(payload.description);
  const category = trimString(payload.category);
  const productType = trimString(payload.product_type);
  const status = trimString(payload.status);

  if (title.length < 3) {
    throw new Error("Title must contain at least 3 characters.");
  }
  if (summary.length < 8) {
    throw new Error("Summary must contain at least 8 characters.");
  }
  if (description.length < 20) {
    throw new Error("Description must contain at least 20 characters.");
  }
  if (!category) {
    throw new Error("Category is required.");
  }
  if (![PRODUCT_TYPE.PERMANENT, PRODUCT_TYPE.SEASONAL].includes(productType)) {
    throw new Error("Choose a valid product type.");
  }
  if (![PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED, PRODUCT_STATUS.PENDING_REVIEW].includes(status)) {
    throw new Error("Choose a valid product status.");
  }

  const data = {
    title,
    slug: slugify(title) || generateId("product"),
    summary,
    description,
    category,
    price: normalizeMoney(payload.price),
    stock: normalizeStock(payload.stock),
    product_type: productType,
    status,
    currency: "USD",
    available_from: null,
    available_until: null,
  };

  if (productType === PRODUCT_TYPE.SEASONAL) {
    const availableFrom = trimString(payload.available_from);
    const availableUntil = trimString(payload.available_until);
    if (!isValidIsoDate(availableFrom) || !isValidIsoDate(availableUntil)) {
      throw new Error("Seasonal products require valid start and end dates.");
    }
    if (availableFrom > availableUntil) {
      throw new Error("The seasonal end date must be after the start date.");
    }
    data.available_from = availableFrom;
    data.available_until = availableUntil;
  }

  return data;
}

async function handlePost(req, res, pathname) {
  let payload = {};
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Invalid JSON body." });
    return;
  }

  if (pathname === "/api/auth/register") {
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || "");
    const displayName = trimString(payload.display_name);

    if (!email || !email.includes("@")) {
      sendJson(res, 400, { error: "Enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: "Use at least 8 characters for the password." });
      return;
    }

    try {
      const user = registerUser(email, password, displayName);
      const token = createSession(user.id);
      sendJson(res, 200, authPayload(user, "Account created."), {
        "Set-Cookie": sessionCookie(token),
      });
    } catch (error) {
      sendJson(res, 409, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/auth/login") {
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || "");
    const user = findUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      sendJson(res, 403, { error: "This account is suspended." });
      return;
    }

    const token = createSession(user.id);
    logActivity(user, "user.logged_in", "user", user.id);
    sendJson(res, 200, authPayload(user, "Logged in."), {
      "Set-Cookie": sessionCookie(token),
    });
    return;
  }

  if (pathname === "/api/auth/logout") {
    const user = currentUser(req);
    const cookies = parseCookies(req);
    deleteSession(cookies[SESSION_COOKIE]);
    if (user) {
      logActivity(user, "user.logged_out", "user", user.id);
    }
    sendJson(
      res,
      200,
      {
        message: "Logged out.",
      },
      {
        "Set-Cookie": clearSessionCookie(),
      }
    );
    return;
  }

  const user = requireAuthenticated(req, res);
  if (!user) {
    return;
  }

  if (pathname === "/api/profile") {
    const displayName = trimString(payload.display_name);
    const bio = trimString(payload.bio);
    const company = trimString(payload.company);

    const updatedUser = updateUserRecord(user.id, (current) => ({
      ...current,
      display_name: displayName || current.display_name,
      bio,
      company,
      updated_at: nowIso(),
    }));

    logActivity(user, "profile.updated", "user", user.id, {
      display_name: updatedUser.display_name,
    });

    sendJson(res, 200, {
      message: "Profile updated.",
      user: publicUser(updatedUser),
    });
    return;
  }

  if (pathname === "/api/vendor/request-access") {
    if (user.role !== ROLE.CUSTOMER) {
      sendJson(res, 400, { error: "Only customers can request vendor access." });
      return;
    }

    const reason = trimString(payload.reason);
    if (reason.length < 20) {
      sendJson(res, 400, { error: "Explain your vendor request in at least 20 characters." });
      return;
    }

    const vendorRequests = readCollection("vendorRequests");
    const existingPending = vendorRequests.find(
      (request) =>
        request.user_id === user.id &&
        [REQUEST_STATUS.PENDING_ADMIN, REQUEST_STATUS.PENDING_SUPER_ADMIN].includes(request.status)
    );

    if (existingPending) {
      sendJson(res, 409, { error: "You already have a vendor request under review." });
      return;
    }

    const request = {
      id: generateId("vendor_request"),
      user_id: user.id,
      status: REQUEST_STATUS.PENDING_ADMIN,
      reason,
      created_at: nowIso(),
      updated_at: nowIso(),
      admin_review: null,
      super_admin_review: null,
    };

    vendorRequests.push(request);
    writeCollection("vendorRequests", vendorRequests);
    logActivity(user, "vendor_request.created", "vendor_request", request.id, {
      user_id: user.id,
    });
    sendJson(res, 200, {
      message: "Vendor access request submitted.",
      request,
    });
    return;
  }

  if (pathname === "/api/products") {
    if (!requireRole(user, res, [ROLE.VENDOR])) {
      return;
    }

    try {
      const data = validateProductPayload(payload);
      const products = readProducts();
      const product = {
        id: generateId("product"),
        vendor_id: user.id,
        ...data,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      products.push(product);
      writeCollection("products", products);
      logActivity(user, "product.created", "product", product.id, {
        status: product.status,
        product_type: product.product_type,
      });
      sendJson(res, 200, {
        message: "Product saved.",
        product,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const updateProductMatch = pathname.match(/^\/api\/products\/([^/]+)\/update$/);
  if (updateProductMatch) {
    const productId = updateProductMatch[1];
    const product = readProducts().find((entry) => entry.id === productId);
    if (!product) {
      sendJson(res, 404, { error: "Product not found." });
      return;
    }
    if (product.vendor_id !== user.id && !hasRole(user, [ROLE.ADMIN, ROLE.SUPER_ADMIN])) {
      sendJson(res, 403, { error: "You can edit only your own products." });
      return;
    }

    try {
      const data = validateProductPayload(payload);
      const updated = updateProductRecord(productId, (current) => ({
        ...current,
        ...data,
        updated_at: nowIso(),
      }));
      logActivity(user, "product.updated", "product", productId, {
        status: updated.status,
      });
      sendJson(res, 200, {
        message: "Product updated.",
        product: updated,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const productCommentMatch = pathname.match(/^\/api\/products\/([^/]+)\/comment$/);
  if (productCommentMatch) {
    const productId = productCommentMatch[1];
    const product = readProducts().find((entry) => entry.id === productId);
    if (!product || !canViewProduct(user, product)) {
      sendJson(res, 404, { error: "Product not found." });
      return;
    }

    const content = trimString(payload.content);
    if (content.length < 12) {
      sendJson(res, 400, { error: "Write at least 12 characters for a review." });
      return;
    }

    let rating = 0;
    try {
      rating = clampRating(payload.rating);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    const comments = readCollection("comments");
    const comment = {
      id: generateId("comment"),
      product_id: productId,
      user_id: user.id,
      content,
      rating,
      status: COMMENT_STATUS.PENDING_REVIEW,
      moderation_note: "",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    comments.push(comment);
    writeCollection("comments", comments);
    logActivity(user, "comment.created", "comment", comment.id, {
      product_id: productId,
    });
    sendJson(res, 200, {
      message: "Comment submitted for moderation.",
      comment,
    });
    return;
  }

  const productRemovalMatch = pathname.match(/^\/api\/products\/([^/]+)\/removal-request$/);
  if (productRemovalMatch) {
    if (!requireRole(user, res, [ROLE.VENDOR])) {
      return;
    }
    const productId = productRemovalMatch[1];
    const product = readProducts().find((entry) => entry.id === productId);

    if (!product || product.vendor_id !== user.id) {
      sendJson(res, 404, { error: "Product not found." });
      return;
    }
    if (product.status === PRODUCT_STATUS.REMOVED) {
      sendJson(res, 400, { error: "This product is already removed." });
      return;
    }

    const removalRequests = readCollection("productRemovalRequests");
    const existingPending = removalRequests.find(
      (request) =>
        request.product_id === productId &&
        [REQUEST_STATUS.PENDING_ADMIN, REQUEST_STATUS.PENDING_SUPER_ADMIN].includes(request.status)
    );

    if (existingPending) {
      sendJson(res, 409, { error: "A removal request for this product is already pending." });
      return;
    }

    const reason = trimString(payload.reason);
    if (reason.length < 12) {
      sendJson(res, 400, { error: "Add a removal reason with at least 12 characters." });
      return;
    }

    const request = {
      id: generateId("product_removal_request"),
      product_id: productId,
      vendor_id: user.id,
      status: REQUEST_STATUS.PENDING_ADMIN,
      reason,
      created_at: nowIso(),
      updated_at: nowIso(),
      admin_review: null,
      super_admin_review: null,
    };

    removalRequests.push(request);
    writeCollection("productRemovalRequests", removalRequests);
    updateProductRecord(productId, (current) => ({
      ...current,
      status: PRODUCT_STATUS.UNAVAILABLE,
      updated_at: nowIso(),
    }));
    logActivity(user, "product.removal_requested", "product_removal_request", request.id, {
      product_id: productId,
    });
    sendJson(res, 200, {
      message: "Removal request submitted. The product is now unavailable until a decision is made.",
      request,
    });
    return;
  }

  if (pathname === "/api/complaints") {
    const targetType = trimString(payload.target_type);
    const targetId = trimString(payload.target_id);
    const reason = trimString(payload.reason);
    const details = trimString(payload.details);

    if (!["product", "comment", "user"].includes(targetType)) {
      sendJson(res, 400, { error: "Choose a valid complaint target." });
      return;
    }
    if (!targetId) {
      sendJson(res, 400, { error: "Target is required." });
      return;
    }
    if (reason.length < 6) {
      sendJson(res, 400, { error: "Reason must contain at least 6 characters." });
      return;
    }
    if (details.length < 12) {
      sendJson(res, 400, { error: "Details must contain at least 12 characters." });
      return;
    }

    const products = readProducts();
    const comments = readCollection("comments");
    const users = readCollection("users");
    const targetExists =
      (targetType === "product" && products.some((product) => product.id === targetId)) ||
      (targetType === "comment" && comments.some((comment) => comment.id === targetId)) ||
      (targetType === "user" && users.some((account) => account.id === targetId));

    if (!targetExists) {
      sendJson(res, 404, { error: "Complaint target not found." });
      return;
    }

    const complaints = readCollection("complaints");
    const complaint = {
      id: generateId("complaint"),
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
      status: COMPLAINT_STATUS.OPEN,
      reviewer_id: null,
      resolution_note: "",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    complaints.push(complaint);
    writeCollection("complaints", complaints);
    logActivity(user, "complaint.created", "complaint", complaint.id, {
      target_type: targetType,
      target_id: targetId,
    });
    sendJson(res, 200, {
      message: "Complaint submitted.",
      complaint,
    });
    return;
  }

  const moderatorCommentReviewMatch = pathname.match(/^\/api\/moderator\/comments\/([^/]+)\/review$/);
  if (moderatorCommentReviewMatch) {
    if (!requireRole(user, res, [ROLE.MODERATOR])) {
      return;
    }
    const commentId = moderatorCommentReviewMatch[1];
    const decision = trimString(payload.decision);
    const note = trimString(payload.note);
    if (![COMMENT_STATUS.VISIBLE, COMMENT_STATUS.HIDDEN, COMMENT_STATUS.REJECTED].includes(decision)) {
      sendJson(res, 400, { error: "Choose a valid moderation decision." });
      return;
    }
    const comments = readCollection("comments");
    const index = comments.findIndex((comment) => comment.id === commentId);
    if (index === -1) {
      sendJson(res, 404, { error: "Comment not found." });
      return;
    }
    comments[index] = {
      ...comments[index],
      status: decision,
      moderation_note: note,
      updated_at: nowIso(),
    };
    writeCollection("comments", comments);
    logActivity(user, "comment.reviewed", "comment", commentId, {
      decision,
    });
    sendJson(res, 200, {
      message: "Comment moderation saved.",
      comment: comments[index],
    });
    return;
  }

  const moderatorComplaintReviewMatch = pathname.match(/^\/api\/moderator\/complaints\/([^/]+)\/review$/);
  if (moderatorComplaintReviewMatch) {
    if (!requireRole(user, res, [ROLE.MODERATOR])) {
      return;
    }
    const complaintId = moderatorComplaintReviewMatch[1];
    const decision = trimString(payload.decision);
    const note = trimString(payload.note);
    const nextStatus =
      decision === "resolve"
        ? COMPLAINT_STATUS.RESOLVED
        : decision === "reject"
        ? COMPLAINT_STATUS.REJECTED
        : decision === "escalate"
        ? COMPLAINT_STATUS.ESCALATED
        : null;

    if (!nextStatus) {
      sendJson(res, 400, { error: "Choose a valid complaint action." });
      return;
    }

    const complaints = readCollection("complaints");
    const index = complaints.findIndex((complaint) => complaint.id === complaintId);
    if (index === -1) {
      sendJson(res, 404, { error: "Complaint not found." });
      return;
    }

    complaints[index] = {
      ...complaints[index],
      status: nextStatus,
      reviewer_id: user.id,
      resolution_note: note,
      updated_at: nowIso(),
    };
    writeCollection("complaints", complaints);
    logActivity(user, "complaint.reviewed", "complaint", complaintId, {
      decision: nextStatus,
    });
    sendJson(res, 200, {
      message: "Complaint review saved.",
      complaint: complaints[index],
    });
    return;
  }

  const adminUserStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (adminUserStatusMatch) {
    if (!requireRole(user, res, [ROLE.ADMIN])) {
      return;
    }
    const targetUserId = adminUserStatusMatch[1];
    const nextStatus = trimString(payload.status);
    if (![USER_STATUS.ACTIVE, USER_STATUS.SUSPENDED].includes(nextStatus)) {
      sendJson(res, 400, { error: "Choose a valid user status." });
      return;
    }
    if (targetUserId === user.id && nextStatus === USER_STATUS.SUSPENDED) {
      sendJson(res, 400, { error: "You cannot suspend your own account." });
      return;
    }
    const updated = updateUserRecord(targetUserId, (current) => ({
      ...current,
      status: nextStatus,
      updated_at: nowIso(),
    }));
    if (!updated) {
      sendJson(res, 404, { error: "User not found." });
      return;
    }
    logActivity(user, "user.status_changed", "user", targetUserId, {
      status: nextStatus,
    });
    sendJson(res, 200, {
      message: "User status updated.",
      user: publicUser(updated),
    });
    return;
  }

  const adminVendorReviewMatch = pathname.match(/^\/api\/admin\/vendor-requests\/([^/]+)\/review$/);
  if (adminVendorReviewMatch) {
    if (!requireRole(user, res, [ROLE.ADMIN])) {
      return;
    }
    const requestId = adminVendorReviewMatch[1];
    const decision = trimString(payload.decision);
    if (!["approve", "reject"].includes(decision)) {
      sendJson(res, 400, { error: "Choose a valid decision." });
      return;
    }
    const note = trimString(payload.note);
    const vendorRequests = readCollection("vendorRequests");
    const index = vendorRequests.findIndex((request) => request.id === requestId);
    if (index === -1) {
      sendJson(res, 404, { error: "Vendor request not found." });
      return;
    }
    const request = vendorRequests[index];
    if (request.status !== REQUEST_STATUS.PENDING_ADMIN) {
      sendJson(res, 400, { error: "This request is no longer waiting for admin review." });
      return;
    }
    vendorRequests[index] = {
      ...request,
      status: decision === "approve" ? REQUEST_STATUS.PENDING_SUPER_ADMIN : REQUEST_STATUS.REJECTED_BY_ADMIN,
      updated_at: nowIso(),
      admin_review: {
        reviewer_id: user.id,
        decision,
        note,
        reviewed_at: nowIso(),
      },
    };
    writeCollection("vendorRequests", vendorRequests);
    logActivity(user, "vendor_request.reviewed_by_admin", "vendor_request", requestId, {
      decision,
    });
    sendJson(res, 200, {
      message: "Vendor request reviewed.",
      request: vendorRequests[index],
    });
    return;
  }

  const adminRemovalReviewMatch = pathname.match(/^\/api\/admin\/product-removals\/([^/]+)\/review$/);
  if (adminRemovalReviewMatch) {
    if (!requireRole(user, res, [ROLE.ADMIN])) {
      return;
    }
    const requestId = adminRemovalReviewMatch[1];
    const decision = trimString(payload.decision);
    if (!["approve", "reject"].includes(decision)) {
      sendJson(res, 400, { error: "Choose a valid decision." });
      return;
    }
    const note = trimString(payload.note);
    const requests = readCollection("productRemovalRequests");
    const index = requests.findIndex((request) => request.id === requestId);
    if (index === -1) {
      sendJson(res, 404, { error: "Product removal request not found." });
      return;
    }
    const request = requests[index];
    if (request.status !== REQUEST_STATUS.PENDING_ADMIN) {
      sendJson(res, 400, { error: "This removal request is no longer waiting for admin review." });
      return;
    }

    requests[index] = {
      ...request,
      status: decision === "approve" ? REQUEST_STATUS.PENDING_SUPER_ADMIN : REQUEST_STATUS.REJECTED_BY_ADMIN,
      updated_at: nowIso(),
      admin_review: {
        reviewer_id: user.id,
        decision,
        note,
        reviewed_at: nowIso(),
      },
    };
    writeCollection("productRemovalRequests", requests);

    if (decision === "reject") {
      updateProductRecord(request.product_id, (current) => ({
        ...current,
        status: PRODUCT_STATUS.PUBLISHED,
        updated_at: nowIso(),
      }));
    }

    logActivity(user, "product_removal.reviewed_by_admin", "product_removal_request", requestId, {
      decision,
    });
    sendJson(res, 200, {
      message: "Product removal request reviewed.",
      request: requests[index],
    });
    return;
  }

  if (pathname === "/api/super-admin/settings") {
    if (!requireRole(user, res, [ROLE.SUPER_ADMIN])) {
      return;
    }
    const settings = readCollection("settings");
    const nextSettings = {
      ...settings,
      site_name: trimString(payload.site_name) || settings.site_name,
      tagline: trimString(payload.tagline) || settings.tagline,
      support_email: normalizeEmail(payload.support_email) || settings.support_email,
      featured_categories: Array.isArray(payload.featured_categories)
        ? payload.featured_categories.map((entry) => trimString(entry)).filter(Boolean)
        : settings.featured_categories,
      seasonal_policy: trimString(payload.seasonal_policy) || settings.seasonal_policy,
      updated_at: nowIso(),
    };
    writeCollection("settings", nextSettings);
    logActivity(user, "settings.updated", "settings", "global", {
      site_name: nextSettings.site_name,
    });
    sendJson(res, 200, {
      message: "Settings updated.",
      settings: nextSettings,
    });
    return;
  }

  const superAdminRoleMatch = pathname.match(/^\/api\/super-admin\/users\/([^/]+)\/role$/);
  if (superAdminRoleMatch) {
    if (!requireRole(user, res, [ROLE.SUPER_ADMIN])) {
      return;
    }
    const targetUserId = superAdminRoleMatch[1];
    const nextRole = trimString(payload.role);
    if (!Object.values(ROLE).includes(nextRole)) {
      sendJson(res, 400, { error: "Choose a valid role." });
      return;
    }
    if (targetUserId === user.id && nextRole !== ROLE.SUPER_ADMIN) {
      sendJson(res, 400, { error: "You cannot remove your own super admin role." });
      return;
    }
    const updatedUser = updateUserRecord(targetUserId, (current) => ({
      ...current,
      role: nextRole,
      updated_at: nowIso(),
    }));
    if (!updatedUser) {
      sendJson(res, 404, { error: "User not found." });
      return;
    }
    logActivity(user, "user.role_changed", "user", targetUserId, {
      role: nextRole,
    });
    sendJson(res, 200, {
      message: "User role updated.",
      user: publicUser(updatedUser),
    });
    return;
  }

  const superAdminVendorMatch = pathname.match(/^\/api\/super-admin\/vendor-requests\/([^/]+)\/finalize$/);
  if (superAdminVendorMatch) {
    if (!requireRole(user, res, [ROLE.SUPER_ADMIN])) {
      return;
    }
    const requestId = superAdminVendorMatch[1];
    const decision = trimString(payload.decision);
    if (!["approve", "reject"].includes(decision)) {
      sendJson(res, 400, { error: "Choose a valid decision." });
      return;
    }
    const note = trimString(payload.note);
    const vendorRequests = readCollection("vendorRequests");
    const index = vendorRequests.findIndex((request) => request.id === requestId);
    if (index === -1) {
      sendJson(res, 404, { error: "Vendor request not found." });
      return;
    }
    const request = vendorRequests[index];
    if (request.status !== REQUEST_STATUS.PENDING_SUPER_ADMIN) {
      sendJson(res, 400, { error: "This request is not waiting for super admin approval." });
      return;
    }

    vendorRequests[index] = {
      ...request,
      status: decision === "approve" ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.REJECTED_BY_SUPER_ADMIN,
      updated_at: nowIso(),
      super_admin_review: {
        reviewer_id: user.id,
        decision,
        note,
        reviewed_at: nowIso(),
      },
    };
    writeCollection("vendorRequests", vendorRequests);

    if (decision === "approve") {
      updateUserRecord(request.user_id, (current) => ({
        ...current,
        role: ROLE.VENDOR,
        updated_at: nowIso(),
      }));
    }

    logActivity(user, "vendor_request.finalized", "vendor_request", requestId, {
      decision,
      user_id: request.user_id,
    });
    sendJson(res, 200, {
      message: "Vendor request finalized.",
      request: vendorRequests[index],
    });
    return;
  }

  const superAdminRemovalMatch = pathname.match(/^\/api\/super-admin\/product-removals\/([^/]+)\/finalize$/);
  if (superAdminRemovalMatch) {
    if (!requireRole(user, res, [ROLE.SUPER_ADMIN])) {
      return;
    }
    const requestId = superAdminRemovalMatch[1];
    const decision = trimString(payload.decision);
    if (!["approve", "reject"].includes(decision)) {
      sendJson(res, 400, { error: "Choose a valid decision." });
      return;
    }
    const note = trimString(payload.note);
    const requests = readCollection("productRemovalRequests");
    const index = requests.findIndex((request) => request.id === requestId);
    if (index === -1) {
      sendJson(res, 404, { error: "Product removal request not found." });
      return;
    }
    const request = requests[index];
    if (request.status !== REQUEST_STATUS.PENDING_SUPER_ADMIN) {
      sendJson(res, 400, { error: "This request is not waiting for final approval." });
      return;
    }

    requests[index] = {
      ...request,
      status: decision === "approve" ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.REJECTED_BY_SUPER_ADMIN,
      updated_at: nowIso(),
      super_admin_review: {
        reviewer_id: user.id,
        decision,
        note,
        reviewed_at: nowIso(),
      },
    };
    writeCollection("productRemovalRequests", requests);

    updateProductRecord(request.product_id, (current) => ({
      ...current,
      status: decision === "approve" ? PRODUCT_STATUS.REMOVED : PRODUCT_STATUS.PUBLISHED,
      updated_at: nowIso(),
    }));

    logActivity(user, "product_removal.finalized", "product_removal_request", requestId, {
      decision,
      product_id: request.product_id,
    });
    sendJson(res, 200, {
      message: "Product removal finalized.",
      request: requests[index],
    });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "GET") {
    await handleGet(req, res, pathname);
    return;
  }

  if (req.method === "POST") {
    await handlePost(req, res, pathname);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

function run(port = Number(process.env.PORT || 8000), host = "0.0.0.0") {
  ensureDataFiles();
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error." });
      } else {
        res.end();
      }
    });
  });

  server.listen(port, host, () => {
    console.log(`OpenMarket server running on http://${host}:${port}`);
  });
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
};
