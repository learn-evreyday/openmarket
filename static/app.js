const state = {
  session: { authenticated: false, user: null },
  route: null,
  data: null,
  loading: true,
  banner: null,
  filters: {
    category: "all",
    type: "all",
  },
};

const ROUTES = [
  { name: "home", pattern: /^\/$/, public: true },
  { name: "login", pattern: /^\/login$/, public: true },
  { name: "register", pattern: /^\/register$/, public: true },
  { name: "dashboard", pattern: /^\/dashboard$/, auth: true },
  { name: "profile", pattern: /^\/profile$/, auth: true },
  { name: "products", pattern: /^\/products$/, auth: true },
  { name: "product_detail", pattern: /^\/products\/([^/]+)$/, auth: true },
  { name: "vendor_products", pattern: /^\/vendor\/products$/, auth: true, roles: ["vendor"] },
  { name: "vendor_add_product", pattern: /^\/vendor\/add-product$/, auth: true, roles: ["vendor"] },
  { name: "admin_users", pattern: /^\/admin\/users$/, auth: true, roles: ["admin"] },
  { name: "admin_vendor_requests", pattern: /^\/admin\/vendor-requests$/, auth: true, roles: ["admin"] },
  { name: "admin_product_removals", pattern: /^\/admin\/product-removals$/, auth: true, roles: ["admin"] },
  { name: "admin_stats", pattern: /^\/admin\/stats$/, auth: true, roles: ["admin"] },
  { name: "moderator_complaints", pattern: /^\/moderator\/complaints$/, auth: true, roles: ["moderator"] },
  { name: "moderator_comments", pattern: /^\/moderator\/comments$/, auth: true, roles: ["moderator"] },
  { name: "super_settings", pattern: /^\/super-admin\/settings$/, auth: true, roles: ["super_admin"] },
  { name: "super_audit", pattern: /^\/super-admin\/audit$/, auth: true, roles: ["super_admin"] },
];

const ROLE_LABELS = {
  customer: "Customer",
  vendor: "Vendor",
  moderator: "Moderator",
  admin: "Admin",
  super_admin: "Super Admin",
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function hasRole(user, roles) {
  if (!user) {
    return false;
  }
  if (roles.includes(user.role)) {
    return true;
  }
  if (user.role === "super_admin" && roles.some((role) => role === "admin" || role === "moderator")) {
    return true;
  }
  return false;
}

function resolveRoute(targetPath) {
  const url = new URL(targetPath, window.location.origin);
  for (const route of ROUTES) {
    const match = url.pathname.match(route.pattern);
    if (match) {
      return {
        ...route,
        params: match.slice(1),
        path: url.pathname,
        search: url.search,
        query: Object.fromEntries(url.searchParams.entries()),
        fullPath: `${url.pathname}${url.search}`,
      };
    }
  }
  return {
    name: "not_found",
    path: url.pathname,
    search: url.search,
    query: Object.fromEntries(url.searchParams.entries()),
    fullPath: `${url.pathname}${url.search}`,
    public: true,
  };
}

function defaultRouteForUser(user) {
  if (!user) {
    return "/";
  }
  switch (user.role) {
    case "vendor":
      return "/vendor/products";
    case "moderator":
      return "/moderator/complaints";
    case "admin":
      return "/admin/stats";
    case "super_admin":
      return "/super-admin/settings";
    default:
      return "/dashboard";
  }
}

function activePath(route) {
  if (!route) {
    return "/";
  }
  if (route.name === "product_detail") {
    return "/products";
  }
  return route.path;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new ApiError(data.error || "Request failed.", response.status);
  }

  return data;
}

async function refreshSession() {
  try {
    state.session = await apiFetch("/api/session", { method: "GET" });
  } catch (error) {
    state.session = { authenticated: false, user: null };
  }
}

function setBanner(message, type = "info") {
  state.banner = message ? { message, type } : null;
}

function rolePill(role) {
  return `<span class="role-pill">${escapeHtml(ROLE_LABELS[role] || role)}</span>`;
}

function statusPill(status) {
  const tone =
    status.includes("approved") || status === "published" || status === "visible" || status === "resolved"
      ? "success"
      : status.includes("pending") || status === "unavailable" || status === "escalated_to_admin"
      ? "warning"
      : status.includes("rejected") || status === "removed" || status === "hidden" || status === "suspended"
      ? "danger"
      : "neutral";
  return `<span class="status-pill ${tone}">${escapeHtml(status.replaceAll("_", " "))}</span>`;
}

function metricCards(cards) {
  return `
    <div class="metric-grid">
      ${cards
        .map(
          (card) => `
            <article class="metric-card">
              <div class="eyebrow">${escapeHtml(card.label)}</div>
              <div class="metric-value">${escapeHtml(String(card.value))}</div>
              <div class="subtle">${escapeHtml(card.note || "")}</div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function emptyState(title, copy) {
  return `
    <div class="empty-state">
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(copy)}</p>
    </div>
  `;
}

function productCard(product, options = {}) {
  const actions = [];
  if (options.link !== false) {
    actions.push(`<a href="/products/${encodeURIComponent(product.id)}" class="button button-secondary" data-link>Open detail</a>`);
  }
  if (options.showEdit) {
    actions.push(
      `<a href="/vendor/add-product?edit=${encodeURIComponent(product.id)}" class="button button-ghost" data-link>Edit product</a>`
    );
  }
  if (options.showRemoval && !product.active_removal_request && product.status !== "removed") {
    actions.push(
      `<button class="button button-danger" type="button" data-removal-product="${escapeHtml(product.id)}">Request removal</button>`
    );
  }

  return `
    <article class="product-card">
      <div class="chip-row">
        <span class="tag">${escapeHtml(product.category)}</span>
        ${statusPill(product.status)}
        ${statusPill(product.product_type)}
      </div>
      <h3>${escapeHtml(product.title)}</h3>
      <p class="muted">${escapeHtml(product.summary)}</p>
      <div class="product-meta">
        <span>${escapeHtml(product.vendor_name)}</span>
        <span>${formatCurrency(product.price, product.currency)}</span>
        <span>${product.review_count} reviews</span>
        <span>${product.average_rating ? `${product.average_rating}/5` : "No rating yet"}</span>
      </div>
      ${
        product.product_type === "seasonal"
          ? `<div class="subtle">Available from ${escapeHtml(product.available_from || "-")} until ${escapeHtml(
              product.available_until || "-"
            )}</div>`
          : ""
      }
      ${product.active_removal_request ? `<div class="subtle">Removal request: ${escapeHtml(product.active_removal_request.status)}</div>` : ""}
      <div class="button-row">${actions.join("")}</div>
    </article>
  `;
}

function logCards(logs) {
  if (!logs?.length) {
    return emptyState("No audit activity yet", "Actions will appear here after workflows start moving.");
  }

  return `
    <div class="collection-grid">
      ${logs
        .map(
          (log) => `
            <article class="log-card">
              <div class="chip-row">
                ${rolePill(log.actor_role)}
                <span class="subtle">${escapeHtml(formatDateTime(log.created_at))}</span>
              </div>
              <h3>${escapeHtml(log.action)}</h3>
              <div class="muted">${escapeHtml(log.actor_name)} - ${escapeHtml(log.entity_type)} - ${escapeHtml(log.entity_id)}</div>
            </article>
          `
        )
      .join("")}
    </div>
  `;
}

async function loadRouteData(route) {
  switch (route.name) {
    case "dashboard":
      return apiFetch("/api/dashboard", { method: "GET" });
    case "profile":
      return apiFetch("/api/profile", { method: "GET" });
    case "products":
      return apiFetch("/api/products", { method: "GET" });
    case "product_detail":
      return apiFetch(`/api/products/${encodeURIComponent(route.params[0])}`, { method: "GET" });
    case "vendor_products":
      return apiFetch("/api/vendor/products", { method: "GET" });
    case "vendor_add_product": {
      const payload = await apiFetch("/api/vendor/products", { method: "GET" });
      const editId = route.query.edit || "";
      return {
        ...payload,
        editProduct: payload.products.find((product) => product.id === editId) || null,
      };
    }
    case "admin_users":
      return apiFetch("/api/admin/users", { method: "GET" });
    case "admin_vendor_requests":
      return apiFetch("/api/admin/vendor-requests", { method: "GET" });
    case "admin_product_removals":
      return apiFetch("/api/admin/product-removals", { method: "GET" });
    case "admin_stats":
      return apiFetch("/api/admin/stats", { method: "GET" });
    case "moderator_comments":
      return apiFetch("/api/moderator/comments", { method: "GET" });
    case "moderator_complaints":
      return apiFetch("/api/moderator/complaints", { method: "GET" });
    case "super_settings":
      return apiFetch("/api/super-admin/settings", { method: "GET" });
    case "super_audit":
      return apiFetch("/api/super-admin/audit", { method: "GET" });
    default:
      return {};
  }
}

function redirectForRoute(route) {
  const user = state.session.user;
  if (route.public && ["login", "register"].includes(route.name) && state.session.authenticated) {
    return defaultRouteForUser(user);
  }
  if (route.auth && !state.session.authenticated) {
    return `/login?next=${encodeURIComponent(route.fullPath)}`;
  }
  if (route.roles && !hasRole(user, route.roles)) {
    return state.session.authenticated ? defaultRouteForUser(user) : "/login";
  }
  return null;
}

async function navigate(targetPath, options = {}) {
  const route = resolveRoute(targetPath);
  state.loading = true;
  render();

  await refreshSession();
  const redirect = redirectForRoute(route);
  if (redirect && redirect !== route.fullPath) {
    await navigate(redirect, { replace: true });
    return;
  }

  if (!options.replace) {
    window.history.pushState({}, "", route.fullPath);
  } else if (window.location.pathname + window.location.search !== route.fullPath) {
    window.history.replaceState({}, "", route.fullPath);
  }

  state.route = route;
  state.loading = true;
  render();

  try {
    state.data = await loadRouteData(route);
    state.loading = false;
  } catch (error) {
    state.loading = false;
    if (error.status === 401) {
      setBanner("Your session has ended. Please log in again.", "error");
      await navigate(`/login?next=${encodeURIComponent(route.fullPath)}`, { replace: true });
      return;
    }
    if (error.status === 403) {
      setBanner(error.message, "error");
      await navigate(defaultRouteForUser(state.session.user), { replace: true });
      return;
    }
    state.data = { error: error.message || "Something went wrong." };
  }

  render();
}

function navItems() {
  const routePathValue = activePath(state.route);
  if (!state.session.authenticated) {
    return [
      { href: "/", label: "Home" },
      { href: "/login", label: "Login" },
      { href: "/register", label: "Register" },
    ]
      .map(
        (item) =>
          `<a href="${item.href}" class="nav-link ${routePathValue === item.href ? "active" : ""}" data-link>${escapeHtml(
            item.label
          )}</a>`
      )
      .join("");
  }

  const items = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/profile", label: "Profile" },
    { href: "/products", label: "Products" },
  ];

  if (hasRole(state.session.user, ["vendor"])) {
    items.push({ href: "/vendor/products", label: "Vendor Hub" });
  }
  if (hasRole(state.session.user, ["moderator"])) {
    items.push({ href: "/moderator/complaints", label: "Complaints" });
    items.push({ href: "/moderator/comments", label: "Comments" });
  }
  if (hasRole(state.session.user, ["admin"])) {
    items.push({ href: "/admin/users", label: "Users" });
    items.push({ href: "/admin/vendor-requests", label: "Vendor Requests" });
    items.push({ href: "/admin/product-removals", label: "Product Removals" });
    items.push({ href: "/admin/stats", label: "Stats" });
  }
  if (hasRole(state.session.user, ["super_admin"])) {
    items.push({ href: "/super-admin/settings", label: "Settings" });
    items.push({ href: "/super-admin/audit", label: "Audit" });
  }

  return items
    .map(
      (item) =>
        `<a href="${item.href}" class="nav-link ${routePathValue === item.href ? "active" : ""}" data-link>${escapeHtml(
          item.label
        )}</a>`
    )
    .join("");
}

function renderActions() {
  const target = document.getElementById("site-actions");
  if (!target) {
    return;
  }

  if (!state.session.authenticated) {
    target.innerHTML = `
      <a href="/login" class="button button-secondary" data-link>Login</a>
      <a href="/register" class="button button-primary" data-link>Create account</a>
    `;
    return;
  }

  target.innerHTML = `
    ${rolePill(state.session.user.role)}
    <div class="subtle">${escapeHtml(state.session.user.display_name)}</div>
    <button class="button button-ghost" type="button" data-logout>Logout</button>
  `;
}

function renderHome() {
  return `
    <section class="hero-grid">
      <article class="hero-panel stack">
        <div class="eyebrow">Marketplace workflow</div>
        <h1 class="hero-title">Independent products, controlled approvals, and transparent moderation.</h1>
        <p class="hero-copy">
          OpenMarket is a role-based multi-vendor marketplace. Customers buy and review. Vendors manage products. Moderators
          handle complaints and comments. Admins approve requests. Super admins finalize approvals and control the platform.
        </p>
        <div class="button-row">
          <a href="/register" class="button button-primary" data-link>Start with an account</a>
          <a href="/login" class="button button-secondary" data-link>Use a seeded demo login</a>
        </div>
        ${metricCards([
          { label: "Roles", value: 5, note: "Customer, vendor, moderator, admin, super admin" },
          { label: "Approval levels", value: 2, note: "Admin review followed by super admin finalization" },
          { label: "Product modes", value: 2, note: "Permanent listings and seasonal windows" },
        ])}
      </article>

      <aside class="hero-panel stack">
        <h2 class="section-title">Core rules</h2>
        <div class="collection-card">
          <div class="stack">
            <div><strong>Customers never become vendors directly.</strong> Vendor access always starts with a request.</div>
            <div><strong>Vendors cannot delete products instantly.</strong> Removal creates a request and sets the listing to unavailable.</div>
            <div><strong>Seasonal products expire automatically.</strong> The system marks them unavailable after the end date.</div>
            <div><strong>All important actions are logged.</strong> Super admins can review the audit trail at any time.</div>
          </div>
        </div>
        <div class="collection-card">
          <h3 class="card-title">Seeded local accounts</h3>
          <div class="subtle">All seeded accounts use the password <strong>OpenMarket123!</strong></div>
          <div class="stack">
            <div>customer@openmarket.local</div>
            <div>vendor@openmarket.local</div>
            <div>moderator@openmarket.local</div>
            <div>admin@openmarket.local</div>
            <div>superadmin@openmarket.local</div>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderAuthPage(mode) {
  const nextPath = state.route?.query?.next || defaultRouteForUser(state.session.user);
  const isLogin = mode === "login";

  return `
    <section class="split-grid">
      <article class="form-card stack">
        <div class="eyebrow">${isLogin ? "Welcome back" : "Create your account"}</div>
        <h1 class="page-title">${isLogin ? "Login to OpenMarket" : "Register for OpenMarket"}</h1>
        <p class="muted">
          ${isLogin ? "Use a seeded demo account or sign in with a local customer profile." : "Every new registration starts as a customer account."}
        </p>
        <form id="${isLogin ? "login-form" : "register-form"}" class="stack">
          ${isLogin ? "" : `<div class="field"><label for="register-name">Display name</label><input id="register-name" name="display_name" required /></div>`}
          <div class="field">
            <label for="${isLogin ? "login-email" : "register-email"}">Email</label>
            <input id="${isLogin ? "login-email" : "register-email"}" name="email" type="email" required />
          </div>
          <div class="field">
            <label for="${isLogin ? "login-password" : "register-password"}">Password</label>
            <input id="${isLogin ? "login-password" : "register-password"}" name="password" type="password" required />
          </div>
          <input type="hidden" name="next" value="${escapeHtml(nextPath)}" />
          <button class="button button-primary" type="submit">${isLogin ? "Login" : "Create account"}</button>
        </form>
      </article>

      <aside class="hero-panel stack">
        <h2 class="section-title">What you can test</h2>
        <div class="collection-card">
          <div class="stack">
            <div>Request vendor access from a customer profile.</div>
            <div>Create permanent or seasonal products as a vendor.</div>
            <div>Moderate comments and complaints as a moderator.</div>
            <div>Approve workflows as admin and super admin.</div>
          </div>
        </div>
        <div class="collection-card">
          <h3 class="card-title">Quick route</h3>
          <div class="muted">All demo credentials are listed on the home page and in the README.</div>
          <a href="/" class="button button-secondary" data-link>Back to overview</a>
        </div>
      </aside>
    </section>
  `;
}

function renderDashboard() {
  const data = state.data || {};
  const user = state.session.user;
  const cards = [];
  const summary = data.summary || {};

  if (user.role === "customer") {
    cards.push({ label: "Catalog listings", value: summary.total_live_products || 0, note: "Products currently published" });
    cards.push({ label: "My comments", value: summary.my_comments || 0, note: "Reviews submitted from this account" });
    cards.push({ label: "My complaints", value: summary.my_complaints || 0, note: "Reports created by you" });
  } else if (user.role === "vendor") {
    cards.push({ label: "My products", value: summary.my_products || 0, note: "Listings managed from this account" });
    cards.push({ label: "Seasonal products", value: summary.seasonal_products || 0, note: "Marketplace-wide seasonal inventory" });
    cards.push({ label: "Pending removals", value: summary.pending_product_removals || 0, note: "Admin-stage product removal requests" });
  } else if (user.role === "moderator") {
    cards.push({ label: "Pending comments", value: summary.pending_comments || 0, note: "Comment moderation queue" });
    cards.push({ label: "Open complaints", value: summary.open_complaints || 0, note: "Complaints waiting for review" });
    cards.push({ label: "Escalated complaints", value: summary.escalated_complaints || 0, note: "Already escalated to admin" });
  } else if (user.role === "admin") {
    cards.push({ label: "Vendor requests", value: summary.pending_vendor_requests || 0, note: "Waiting for admin review" });
    cards.push({ label: "Product removals", value: summary.pending_product_removals || 0, note: "Waiting for admin review" });
    cards.push({ label: "Active users", value: summary.active_users || 0, note: "Currently active accounts" });
  } else if (user.role === "super_admin") {
    cards.push({ label: "Final vendor approvals", value: summary.pending_final_vendor_requests || 0, note: "Pending super admin decisions" });
    cards.push({ label: "Final removals", value: summary.pending_final_product_removals || 0, note: "Pending super admin decisions" });
    cards.push({ label: "Audit events", value: data.recent_logs?.length || 0, note: "Latest logged activities" });
  }

  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="chip-row">
          ${rolePill(user.role)}
          ${statusPill(user.status)}
        </div>
        <h1 class="page-title">Welcome, ${escapeHtml(user.display_name)}.</h1>
        <p class="muted">${escapeHtml(data.settings?.tagline || "Marketplace control with clear roles and approvals.")}</p>
        ${metricCards(cards)}
      </article>

      <section class="dashboard-grid">
        <article class="card stack">
          <div>
            <div class="eyebrow">Recent catalog</div>
            <h2 class="section-title">Marketplace highlights</h2>
          </div>
          <div class="product-grid">
            ${(data.recent_products || []).map((product) => productCard(product)).join("") || emptyState("No products yet", "The catalog is empty.")}
          </div>
        </article>

        <article class="card stack">
          <div>
            <div class="eyebrow">Latest activity</div>
            <h2 class="section-title">Audit snapshot</h2>
          </div>
          ${logCards(data.recent_logs || [])}
        </article>
      </section>
    </section>
  `;
}

function renderProfile() {
  const data = state.data || {};
  const user = data.user || state.session.user;
  return `
    <section class="split-grid">
      <article class="form-card stack">
        <div class="eyebrow">Profile</div>
        <h1 class="page-title">${escapeHtml(user.display_name)}</h1>
        <p class="muted">Update your profile details. Customer accounts can also request vendor access from here.</p>
        <form id="profile-form" class="stack">
          <div class="field-grid">
            <div class="field">
              <label for="profile-name">Display name</label>
              <input id="profile-name" name="display_name" value="${escapeHtml(user.display_name || "")}" required />
            </div>
            <div class="field">
              <label for="profile-company">Company</label>
              <input id="profile-company" name="company" value="${escapeHtml(user.company || "")}" />
            </div>
          </div>
          <div class="field">
            <label for="profile-bio">Bio</label>
            <textarea id="profile-bio" name="bio">${escapeHtml(user.bio || "")}</textarea>
          </div>
          <button class="button button-primary" type="submit">Save profile</button>
        </form>

        ${
          user.role === "customer"
            ? `
              <div class="hr"></div>
              <div class="stack">
                <h2 class="section-title">Vendor access request</h2>
                ${
                  data.latest_vendor_request
                    ? `<div class="collection-card">
                        <div class="chip-row">${statusPill(data.latest_vendor_request.status)}</div>
                        <div class="muted">${escapeHtml(data.latest_vendor_request.reason || "")}</div>
                      </div>`
                    : `<form id="vendor-request-form" class="stack">
                        <div class="field">
                          <label for="vendor-reason">Why do you want vendor access?</label>
                          <textarea id="vendor-reason" name="reason" placeholder="Describe what you want to sell and how your shop fits OpenMarket."></textarea>
                        </div>
                        <button class="button button-secondary" type="submit">Request vendor access</button>
                      </form>`
                }
              </div>
            `
            : ""
        }
      </article>

      <aside class="stack">
        <article class="card stack">
          <h2 class="section-title">My comments</h2>
          ${
            data.my_comments?.length
              ? data.my_comments
                  .map(
                    (comment) => `
                      <div class="comment-card">
                        <div class="chip-row">${statusPill(comment.status)}</div>
                        <h3>${escapeHtml(comment.product_title)}</h3>
                        <div class="muted">${escapeHtml(comment.content)}</div>
                      </div>
                    `
                  )
                  .join("")
              : emptyState("No comments yet", "Your reviews will appear here.")
          }
        </article>

        <article class="card stack">
          <h2 class="section-title">My complaints</h2>
          ${
            data.my_complaints?.length
              ? data.my_complaints
                  .map(
                    (complaint) => `
                      <div class="collection-card">
                        <div class="chip-row">${statusPill(complaint.status)}</div>
                        <h3>${escapeHtml(complaint.reason)}</h3>
                        <div class="muted">Target: ${escapeHtml(complaint.target_label)}</div>
                      </div>
                    `
                  )
                  .join("")
              : emptyState("No complaints yet", "Reports filed from your account will appear here.")
          }
        </article>
      </aside>
    </section>
  `;
}

function renderProductsPage() {
  const data = state.data || {};
  const category = state.filters.category;
  const type = state.filters.type;
  const products = (data.products || []).filter((product) => {
    const categoryMatch = category === "all" || product.category === category;
    const typeMatch = type === "all" || product.product_type === type;
    return categoryMatch && typeMatch;
  });

  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Catalog</div>
        <h1 class="page-title">Products</h1>
        <p class="muted">Permanent listings stay available. Seasonal products close automatically after their end date.</p>
        <div class="chip-row">
          <button class="chip ${category === "all" ? "button-secondary" : "button-ghost"}" type="button" data-filter-category="all">All categories</button>
          ${(data.categories || [])
            .map(
              (entry) =>
                `<button class="chip ${category === entry ? "button-secondary" : "button-ghost"}" type="button" data-filter-category="${escapeHtml(
                  entry
                )}">${escapeHtml(entry)}</button>`
            )
            .join("")}
        </div>
        <div class="chip-row">
          <button class="chip ${type === "all" ? "button-secondary" : "button-ghost"}" type="button" data-filter-type="all">All product types</button>
          <button class="chip ${type === "permanent" ? "button-secondary" : "button-ghost"}" type="button" data-filter-type="permanent">Permanent</button>
          <button class="chip ${type === "seasonal" ? "button-secondary" : "button-ghost"}" type="button" data-filter-type="seasonal">Seasonal</button>
        </div>
      </article>
      <section class="product-grid">
        ${products.length ? products.map((product) => productCard(product)).join("") : emptyState("No products match this filter", "Try a different category or product type.")}
      </section>
    </section>
  `;
}

function renderProductDetail() {
  const data = state.data || {};
  if (data.error) {
    return emptyState("Unable to load product", data.error);
  }
  const product = data.product;
  const comments = data.comments || [];

  return `
    <section class="detail-grid">
      <article class="hero-panel stack">
        <div class="chip-row">
          <span class="tag">${escapeHtml(product.category)}</span>
          ${statusPill(product.status)}
          ${statusPill(product.product_type)}
        </div>
        <h1 class="page-title">${escapeHtml(product.title)}</h1>
        <p class="hero-copy">${escapeHtml(product.description)}</p>
        <div class="product-meta">
          <span>Vendor: ${escapeHtml(product.vendor_name)}</span>
          <span>${formatCurrency(product.price, product.currency)}</span>
          <span>Stock: ${escapeHtml(product.stock)}</span>
        </div>
        ${
          product.product_type === "seasonal"
            ? `<div class="collection-card">Seasonal window: ${escapeHtml(product.available_from || "-")} to ${escapeHtml(product.available_until || "-")}</div>`
            : ""
        }
        <div class="button-row">
          <button class="button button-secondary" type="button" data-complaint-target="product" data-complaint-id="${escapeHtml(product.id)}">Report product</button>
          <button class="button button-ghost" type="button" data-complaint-target="user" data-complaint-id="${escapeHtml(product.vendor_id)}">Report vendor</button>
        </div>
      </article>

      <aside class="stack">
        <article class="form-card stack">
          <h2 class="section-title">Leave a comment</h2>
          <form id="comment-form" class="stack">
            <input type="hidden" name="product_id" value="${escapeHtml(product.id)}" />
            <div class="field">
              <label for="comment-rating">Rating</label>
              <select id="comment-rating" name="rating">
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Strong</option>
                <option value="3">3 - Average</option>
                <option value="2">2 - Needs work</option>
                <option value="1">1 - Poor</option>
              </select>
            </div>
            <div class="field">
              <label for="comment-content">Comment</label>
              <textarea id="comment-content" name="content" placeholder="Write a product review. New comments enter moderation first."></textarea>
            </div>
            <button class="button button-primary" type="submit">Submit comment</button>
          </form>
        </article>

        <article class="card stack">
          <h2 class="section-title">Comments</h2>
          ${
            comments.length
              ? comments
                  .map(
                    (comment) => `
                      <div class="comment-card stack">
                        <div class="chip-row">
                          ${statusPill(comment.status)}
                          ${rolePill(comment.author_role)}
                        </div>
                        <h3>${escapeHtml(comment.author_name)}</h3>
                        <div class="muted">${escapeHtml(comment.content)}</div>
                        <div class="button-row">
                          <button class="button button-ghost" type="button" data-complaint-target="comment" data-complaint-id="${escapeHtml(comment.id)}">Report comment</button>
                          <button class="button button-ghost" type="button" data-complaint-target="user" data-complaint-id="${escapeHtml(comment.user_id)}">Report author</button>
                        </div>
                      </div>
                    `
                  )
                  .join("")
              : emptyState("No comments yet", "Be the first to leave a moderated review.")
          }
        </article>
      </aside>
    </section>
  `;
}

function renderVendorProducts() {
  const data = state.data || {};
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Vendor hub</div>
        <h1 class="page-title">My products</h1>
        <p class="muted">Create, update, and request product removals. Removal never deletes instantly.</p>
        <div class="button-row">
          <a href="/vendor/add-product" class="button button-primary" data-link>Add product</a>
        </div>
      </article>

      <section class="product-grid">
        ${(data.products || []).map((product) => productCard(product, { showEdit: true, showRemoval: true, link: true })).join("") || emptyState("No products yet", "Create your first listing from the vendor form.")}
      </section>

      <article class="table-wrap">
        <h2 class="section-title">Removal requests</h2>
        ${
          data.removal_requests?.length
            ? `<table>
                <thead><tr><th>Request</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  ${data.removal_requests
                    .map(
                      (request) => `
                        <tr>
                          <td>${escapeHtml(request.reason)}</td>
                          <td>${statusPill(request.status)}</td>
                          <td>${escapeHtml(formatDate(request.updated_at || request.created_at))}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>`
            : emptyState("No removal requests", "Products stay active until you request a removal review.")
        }
      </article>
    </section>
  `;
}

function renderVendorProductForm() {
  const editProduct = state.data?.editProduct || null;
  const editing = Boolean(editProduct);
  return `
    <section class="split-grid">
      <article class="form-card stack">
        <div class="eyebrow">${editing ? "Update listing" : "New listing"}</div>
        <h1 class="page-title">${editing ? "Edit product" : "Add a product"}</h1>
        <form id="product-form" class="stack">
          <input type="hidden" name="product_id" value="${escapeHtml(editProduct?.id || "")}" />
          <div class="field-grid">
            <div class="field"><label>Title</label><input name="title" value="${escapeHtml(editProduct?.title || "")}" required /></div>
            <div class="field"><label>Category</label><input name="category" value="${escapeHtml(editProduct?.category || "")}" required /></div>
          </div>
          <div class="field"><label>Summary</label><input name="summary" value="${escapeHtml(editProduct?.summary || "")}" required /></div>
          <div class="field"><label>Description</label><textarea name="description" required>${escapeHtml(editProduct?.description || "")}</textarea></div>
          <div class="field-grid">
            <div class="field"><label>Price (USD)</label><input name="price" type="number" min="0" step="0.01" value="${escapeHtml(editProduct?.price || "")}" required /></div>
            <div class="field"><label>Stock</label><input name="stock" type="number" min="0" step="1" value="${escapeHtml(editProduct?.stock || "0")}" required /></div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label>Product type</label>
              <select name="product_type">
                <option value="permanent" ${editProduct?.product_type === "permanent" || !editProduct ? "selected" : ""}>Permanent</option>
                <option value="seasonal" ${editProduct?.product_type === "seasonal" ? "selected" : ""}>Seasonal</option>
              </select>
            </div>
            <div class="field">
              <label>Status</label>
              <select name="status">
                <option value="draft" ${editProduct?.status === "draft" || !editProduct ? "selected" : ""}>Draft</option>
                <option value="published" ${editProduct?.status === "published" ? "selected" : ""}>Published</option>
                <option value="pending_review" ${editProduct?.status === "pending_review" ? "selected" : ""}>Pending review</option>
              </select>
            </div>
          </div>
          <div class="field-grid">
            <div class="field"><label>Available from</label><input name="available_from" type="date" value="${escapeHtml(editProduct?.available_from || "")}" /></div>
            <div class="field"><label>Available until</label><input name="available_until" type="date" value="${escapeHtml(editProduct?.available_until || "")}" /></div>
          </div>
          <div class="button-row">
            <button class="button button-primary" type="submit">${editing ? "Save changes" : "Create product"}</button>
            <a href="/vendor/products" class="button button-ghost" data-link>Back to vendor hub</a>
          </div>
        </form>
      </article>

      <aside class="hero-panel stack">
        <h2 class="section-title">Listing rules</h2>
        <div class="collection-card">
          <div class="stack">
            <div>Use <strong>draft</strong> while shaping the listing.</div>
            <div>Use <strong>published</strong> to make it visible in the marketplace.</div>
            <div>Use <strong>pending review</strong> when you want an internal hold before public release.</div>
            <div>Seasonal listings need a clear start and end date.</div>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderAdminUsers() {
  const users = state.data?.users || [];
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Admin</div>
        <h1 class="page-title">User management</h1>
      </article>
      <article class="table-wrap">
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${users
              .map(
                (user) => `
                  <tr>
                    <td><strong>${escapeHtml(user.display_name)}</strong><div class="subtle">${escapeHtml(user.email)}</div></td>
                    <td>${rolePill(user.role)}</td>
                    <td>${statusPill(user.status)}</td>
                    <td>
                      <div class="button-row">
                        <button class="button button-ghost" type="button" data-toggle-user="${escapeHtml(user.id)}" data-next-status="${user.status === "active" ? "suspended" : "active"}">
                          ${user.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}

function renderRequestCards(list, type) {
  if (!list?.length) {
    return emptyState("No requests right now", "This queue is currently empty.");
  }

  return `<div class="collection-grid">
    ${list
      .map((item) => {
        const reviewAction = type === "vendor" ? "data-review-vendor" : "data-review-removal";
        return `
          <article class="collection-card stack">
            <div class="chip-row">${statusPill(item.status)}</div>
            <h3>${escapeHtml(item.user_name || item.product_title || "Request")}</h3>
            <div class="muted">${escapeHtml(item.reason)}</div>
            ${
              item.user_email
                ? `<div class="subtle">${escapeHtml(item.user_email)}</div>`
                : `<div class="subtle">${escapeHtml(item.vendor_email || "")}</div>`
            }
            <div class="button-row">
              <button class="button button-secondary" type="button" ${reviewAction}="${escapeHtml(item.id)}" data-decision="approve">Approve</button>
              <button class="button button-danger" type="button" ${reviewAction}="${escapeHtml(item.id)}" data-decision="reject">Reject</button>
            </div>
          </article>
        `;
      })
      .join("")}
  </div>`;
}

function renderAdminQueuePage(title, copy, list, type) {
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Admin</div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(copy)}</p>
      </article>
      ${renderRequestCards(list, type)}
    </section>
  `;
}

function renderAdminStats() {
  const data = state.data || {};
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Admin</div>
        <h1 class="page-title">Marketplace statistics</h1>
        ${metricCards([
          { label: "Users", value: data.totals?.users || 0, note: "All registered accounts" },
          { label: "Published products", value: data.product_breakdown?.published || 0, note: "Currently visible listings" },
          { label: "Pending comments", value: data.totals?.pending_comments || 0, note: "Comment moderation queue" },
          { label: "Open complaints", value: data.totals?.open_complaints || 0, note: "Needs moderator review" },
        ])}
      </article>
      <article class="card stack">
        <h2 class="section-title">Product breakdown</h2>
        ${metricCards([
          { label: "Draft", value: data.product_breakdown?.draft || 0 },
          { label: "Published", value: data.product_breakdown?.published || 0 },
          { label: "Unavailable", value: data.product_breakdown?.unavailable || 0 },
          { label: "Removed", value: data.product_breakdown?.removed || 0 },
          { label: "Permanent", value: data.product_breakdown?.permanent || 0 },
          { label: "Seasonal", value: data.product_breakdown?.seasonal || 0 },
        ])}
      </article>
      <article class="card stack">
        <h2 class="section-title">Recent logs</h2>
        ${logCards(data.latest_logs || [])}
      </article>
    </section>
  `;
}

function renderModeratorComments() {
  const comments = state.data?.comments || [];
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Moderator</div>
        <h1 class="page-title">Comment moderation</h1>
      </article>
      <div class="collection-grid">
        ${comments
          .map(
            (comment) => `
              <article class="comment-card stack">
                <div class="chip-row">${statusPill(comment.status)} ${rolePill(comment.author_role)}</div>
                <h3>${escapeHtml(comment.product_title)}</h3>
                <div class="muted">${escapeHtml(comment.content)}</div>
                <div class="subtle">Author: ${escapeHtml(comment.author_name)}</div>
                <div class="button-row">
                  <button class="button button-secondary" type="button" data-review-comment="${escapeHtml(comment.id)}" data-status="visible">Make visible</button>
                  <button class="button button-ghost" type="button" data-review-comment="${escapeHtml(comment.id)}" data-status="hidden">Hide</button>
                  <button class="button button-danger" type="button" data-review-comment="${escapeHtml(comment.id)}" data-status="rejected">Reject</button>
                </div>
              </article>
            `
          )
          .join("") || emptyState("No comments in queue", "New comment items will appear here.")}
      </div>
    </section>
  `;
}

function renderModeratorComplaints() {
  const complaints = state.data?.complaints || [];
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Moderator</div>
        <h1 class="page-title">Complaint queue</h1>
      </article>
      <div class="collection-grid">
        ${complaints
          .map(
            (complaint) => `
              <article class="collection-card stack">
                <div class="chip-row">${statusPill(complaint.status)}</div>
                <h3>${escapeHtml(complaint.reason)}</h3>
                <div class="muted">Target: ${escapeHtml(complaint.target_label)}</div>
                <p class="muted">${escapeHtml(complaint.details)}</p>
                <div class="button-row">
                  <button class="button button-secondary" type="button" data-review-complaint="${escapeHtml(complaint.id)}" data-decision="resolve">Resolve</button>
                  <button class="button button-ghost" type="button" data-review-complaint="${escapeHtml(complaint.id)}" data-decision="escalate">Escalate</button>
                  <button class="button button-danger" type="button" data-review-complaint="${escapeHtml(complaint.id)}" data-decision="reject">Reject</button>
                </div>
              </article>
            `
          )
          .join("") || emptyState("No complaints", "New complaint items will appear here.")}
      </div>
    </section>
  `;
}

function renderSuperSettings() {
  const data = state.data || {};
  const settings = data.settings || {};
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Super admin</div>
        <h1 class="page-title">Global settings</h1>
      </article>
      <section class="split-grid">
        <article class="form-card stack">
          <form id="settings-form" class="stack">
            <div class="field"><label>Site name</label><input name="site_name" value="${escapeHtml(settings.site_name || "OpenMarket")}" required /></div>
            <div class="field"><label>Tagline</label><input name="tagline" value="${escapeHtml(settings.tagline || "")}" required /></div>
            <div class="field"><label>Support email</label><input name="support_email" type="email" value="${escapeHtml(settings.support_email || "")}" required /></div>
            <div class="field"><label>Featured categories (comma separated)</label><input name="featured_categories" value="${escapeHtml((settings.featured_categories || []).join(", "))}" /></div>
            <div class="field"><label>Seasonal policy</label><textarea name="seasonal_policy">${escapeHtml(settings.seasonal_policy || "")}</textarea></div>
            <button class="button button-primary" type="submit">Save settings</button>
          </form>
        </article>

        <aside class="stack">
          <article class="card stack">
            <h2 class="section-title">Final approval queues</h2>
            <div class="stack">
              <h3 class="card-title">Vendor requests</h3>
              ${renderRequestCards(data.pending_final_vendor_requests || [], "vendor")}
            </div>
            <div class="stack">
              <h3 class="card-title">Product removals</h3>
              ${renderRequestCards(data.pending_final_product_removals || [], "removal")}
            </div>
          </article>
        </aside>
      </section>

      <article class="table-wrap">
        <h2 class="section-title">Role management</h2>
        <table>
          <thead><tr><th>User</th><th>Current role</th><th>Change role</th></tr></thead>
          <tbody>
            ${(data.users || [])
              .map(
                (user) => `
                  <tr>
                    <td><strong>${escapeHtml(user.display_name)}</strong><div class="subtle">${escapeHtml(user.email)}</div></td>
                    <td>${rolePill(user.role)}</td>
                    <td>
                      <form class="button-row role-form" data-role-form="${escapeHtml(user.id)}">
                        <select name="role">
                          ${["customer", "vendor", "moderator", "admin", "super_admin"]
                            .map(
                              (role) =>
                                `<option value="${role}" ${user.role === role ? "selected" : ""}>${escapeHtml(ROLE_LABELS[role])}</option>`
                            )
                            .join("")}
                        </select>
                        <button class="button button-ghost" type="submit">Save role</button>
                      </form>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}

function renderSuperAudit() {
  return `
    <section class="stack">
      <article class="hero-panel stack">
        <div class="eyebrow">Super admin</div>
        <h1 class="page-title">Audit log</h1>
      </article>
      ${logCards(state.data?.logs || [])}
    </section>
  `;
}

function renderPage() {
  if (state.loading) {
    return `<div class="hero-panel loading">Loading OpenMarket...</div>`;
  }

  if (state.data?.error) {
    return emptyState("Request failed", state.data.error);
  }

  switch (state.route?.name) {
    case "home":
      return renderHome();
    case "login":
      return renderAuthPage("login");
    case "register":
      return renderAuthPage("register");
    case "dashboard":
      return renderDashboard();
    case "profile":
      return renderProfile();
    case "products":
      return renderProductsPage();
    case "product_detail":
      return renderProductDetail();
    case "vendor_products":
      return renderVendorProducts();
    case "vendor_add_product":
      return renderVendorProductForm();
    case "admin_users":
      return renderAdminUsers();
    case "admin_vendor_requests":
      return renderAdminQueuePage(
        "Vendor request approvals",
        "Approve or reject customer requests before they move to super admin.",
        state.data?.requests || [],
        "vendor"
      );
    case "admin_product_removals":
      return renderAdminQueuePage(
        "Product removal approvals",
        "Review vendor removal requests before they move to super admin.",
        state.data?.requests || [],
        "removal"
      );
    case "admin_stats":
      return renderAdminStats();
    case "moderator_comments":
      return renderModeratorComments();
    case "moderator_complaints":
      return renderModeratorComplaints();
    case "super_settings":
      return renderSuperSettings();
    case "super_audit":
      return renderSuperAudit();
    default:
      return emptyState("Page not found", "The requested route is not part of this OpenMarket build.");
  }
}

function render() {
  const nav = document.getElementById("site-nav");
  const banner = document.getElementById("banner");
  const app = document.getElementById("app");

  if (nav) {
    nav.innerHTML = navItems();
  }
  renderActions();

  if (banner) {
    if (state.banner) {
      banner.hidden = false;
      banner.className = `banner ${state.banner.type === "error" ? "is-error" : state.banner.type === "success" ? "is-success" : ""}`;
      banner.textContent = state.banner.message;
    } else {
      banner.hidden = true;
      banner.textContent = "";
      banner.className = "banner";
    }
  }

  if (app) {
    app.innerHTML = renderPage();
  }
}

async function performLogout() {
  await apiFetch("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
  setBanner("You have been logged out.", "success");
  await navigate("/login", { replace: true });
}

async function submitComplaint(targetType, targetId) {
  const reason = window.prompt("Complaint reason");
  if (!reason) {
    return;
  }
  const details = window.prompt("Add complaint details");
  if (!details) {
    return;
  }

  await apiFetch("/api/complaints", {
    method: "POST",
    body: JSON.stringify({
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
    }),
  });
  setBanner("Complaint submitted.", "success");
  await navigate(state.route.fullPath, { replace: true });
}

async function reviewWithNote(endpoint, payload, successMessage) {
  const note = window.prompt("Optional note");
  if (note === null) {
    return;
  }
  await apiFetch(endpoint, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      note,
    }),
  });
  setBanner(successMessage, "success");
  await navigate(state.route.fullPath, { replace: true });
}

document.addEventListener("click", async (event) => {
  try {
    const link = event.target.closest("[data-link]");
    if (link) {
      event.preventDefault();
      await navigate(link.getAttribute("href"));
      return;
    }

    const logoutButton = event.target.closest("[data-logout]");
    if (logoutButton) {
      await performLogout();
      return;
    }

    const categoryButton = event.target.closest("[data-filter-category]");
    if (categoryButton) {
      state.filters.category = categoryButton.dataset.filterCategory;
      render();
      return;
    }

    const typeButton = event.target.closest("[data-filter-type]");
    if (typeButton) {
      state.filters.type = typeButton.dataset.filterType;
      render();
      return;
    }

    const complaintButton = event.target.closest("[data-complaint-target]");
    if (complaintButton) {
      await submitComplaint(complaintButton.dataset.complaintTarget, complaintButton.dataset.complaintId);
      return;
    }

    const removalButton = event.target.closest("[data-removal-product]");
    if (removalButton) {
      const reason = window.prompt("Explain why this product should be removed");
      if (!reason) {
        return;
      }
      await apiFetch(`/api/products/${encodeURIComponent(removalButton.dataset.removalProduct)}/removal-request`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setBanner("Removal request submitted.", "success");
      await navigate(state.route.fullPath, { replace: true });
      return;
    }

    const commentReviewButton = event.target.closest("[data-review-comment]");
    if (commentReviewButton) {
      await reviewWithNote(
        `/api/moderator/comments/${encodeURIComponent(commentReviewButton.dataset.reviewComment)}/review`,
        { decision: commentReviewButton.dataset.status },
        "Comment decision saved."
      );
      return;
    }

    const complaintReviewButton = event.target.closest("[data-review-complaint]");
    if (complaintReviewButton) {
      await reviewWithNote(
        `/api/moderator/complaints/${encodeURIComponent(complaintReviewButton.dataset.reviewComplaint)}/review`,
        { decision: complaintReviewButton.dataset.decision },
        "Complaint decision saved."
      );
      return;
    }

    const vendorReviewButton = event.target.closest("[data-review-vendor]");
    if (vendorReviewButton) {
      const base =
        state.route.name === "super_settings"
          ? `/api/super-admin/vendor-requests/${encodeURIComponent(vendorReviewButton.dataset.reviewVendor)}/finalize`
          : `/api/admin/vendor-requests/${encodeURIComponent(vendorReviewButton.dataset.reviewVendor)}/review`;
      await reviewWithNote(base, { decision: vendorReviewButton.dataset.decision }, "Vendor request decision saved.");
      return;
    }

    const removalReviewButton = event.target.closest("[data-review-removal]");
    if (removalReviewButton) {
      const base =
        state.route.name === "super_settings"
          ? `/api/super-admin/product-removals/${encodeURIComponent(removalReviewButton.dataset.reviewRemoval)}/finalize`
          : `/api/admin/product-removals/${encodeURIComponent(removalReviewButton.dataset.reviewRemoval)}/review`;
      await reviewWithNote(base, { decision: removalReviewButton.dataset.decision }, "Removal request decision saved.");
      return;
    }

    const userToggleButton = event.target.closest("[data-toggle-user]");
    if (userToggleButton) {
      await apiFetch(`/api/admin/users/${encodeURIComponent(userToggleButton.dataset.toggleUser)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: userToggleButton.dataset.nextStatus }),
      });
      setBanner("User status updated.", "success");
      await navigate(state.route.fullPath, { replace: true });
    }
  } catch (error) {
    setBanner(error.message || "Action failed.", "error");
    render();
  }
});

document.addEventListener("submit", async (event) => {
  try {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    event.preventDefault();
    const data = new FormData(form);

    if (form.id === "login-form") {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      await refreshSession();
      setBanner("Login successful.", "success");
      await navigate(data.get("next") || defaultRouteForUser(state.session.user), { replace: true });
      return;
    }

    if (form.id === "register-form") {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          display_name: data.get("display_name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      await refreshSession();
      setBanner("Account created.", "success");
      await navigate(defaultRouteForUser(state.session.user), { replace: true });
      return;
    }

    if (form.id === "profile-form") {
      await apiFetch("/api/profile", {
        method: "POST",
        body: JSON.stringify({
          display_name: data.get("display_name"),
          bio: data.get("bio"),
          company: data.get("company"),
        }),
      });
      setBanner("Profile updated.", "success");
      await navigate(state.route.fullPath, { replace: true });
      return;
    }

    if (form.id === "vendor-request-form") {
      await apiFetch("/api/vendor/request-access", {
        method: "POST",
        body: JSON.stringify({
          reason: data.get("reason"),
        }),
      });
      setBanner("Vendor request submitted.", "success");
      await navigate(state.route.fullPath, { replace: true });
      return;
    }

    if (form.id === "product-form") {
      const productId = data.get("product_id");
      const endpoint = productId ? `/api/products/${encodeURIComponent(productId)}/update` : "/api/products";
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          category: data.get("category"),
          summary: data.get("summary"),
          description: data.get("description"),
          price: Number(data.get("price")),
          stock: Number(data.get("stock")),
          product_type: data.get("product_type"),
          status: data.get("status"),
          available_from: data.get("available_from"),
          available_until: data.get("available_until"),
        }),
      });
      setBanner(productId ? "Product updated." : "Product created.", "success");
      await navigate("/vendor/products", { replace: true });
      return;
    }

    if (form.id === "comment-form") {
      await apiFetch(`/api/products/${encodeURIComponent(data.get("product_id"))}/comment`, {
        method: "POST",
        body: JSON.stringify({
          rating: Number(data.get("rating")),
          content: data.get("content"),
        }),
      });
      setBanner("Comment sent to moderation.", "success");
      await navigate(state.route.fullPath, { replace: true });
      return;
    }

    if (form.id === "settings-form") {
      await apiFetch("/api/super-admin/settings", {
        method: "POST",
        body: JSON.stringify({
          site_name: data.get("site_name"),
          tagline: data.get("tagline"),
          support_email: data.get("support_email"),
          featured_categories: String(data.get("featured_categories") || "")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          seasonal_policy: data.get("seasonal_policy"),
        }),
      });
      setBanner("Settings updated.", "success");
      await navigate(state.route.fullPath, { replace: true });
      return;
    }

    if (form.matches(".role-form")) {
      await apiFetch(`/api/super-admin/users/${encodeURIComponent(form.dataset.roleForm)}/role`, {
        method: "POST",
        body: JSON.stringify({
          role: data.get("role"),
        }),
      });
      setBanner("User role updated.", "success");
      await navigate(state.route.fullPath, { replace: true });
    }
  } catch (error) {
    setBanner(error.message || "Submit failed.", "error");
    render();
  }
});

window.addEventListener("popstate", async () => {
  await navigate(window.location.pathname + window.location.search, { replace: true });
});

document.addEventListener("DOMContentLoaded", async () => {
  await navigate(window.location.pathname + window.location.search, { replace: true });
});
