const state = {
  route: "/",
  banner: null,
  loading: false,
  session: {
    authenticated: false,
    session_scope: "guest",
    user: null,
    can_view_financials: false,
    modules: [],
  },
};

const ROUTES = [
  { path: "/account", label: "My Account", module: "account" },
  { path: "/", label: "Overview", module: "dashboard" },
  { path: "/products", label: "Products", module: "products" },
  { path: "/customers", label: "Customers", module: "customers" },
  { path: "/orders", label: "Orders", module: "orders" },
  { path: "/suppliers", label: "Suppliers", module: "suppliers" },
  { path: "/employees", label: "Employees", module: "employees" },
  { path: "/service", label: "Service", module: "service" },
  { path: "/finance", label: "Finance", module: "finance" },
];

const app = document.getElementById("app");
const banner = document.getElementById("banner");
const nav = document.getElementById("site-nav");
const actions = document.getElementById("site-actions");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasModule(moduleKey) {
  return state.session.modules.some((module) => module.key === moduleKey);
}

function isStockOnlySession() {
  return state.session.authenticated && state.session.session_scope === "stock_check";
}

function isFullSession() {
  return state.session.authenticated && state.session.session_scope === "full";
}

function defaultRoute() {
  if (isStockOnlySession()) {
    return "/stock-access";
  }

  if (!state.session.authenticated) {
    return "/login";
  }

  const firstRoute = ROUTES.find((route) => hasModule(route.module));
  if (firstRoute) {
    return firstRoute.path;
  }

  if (hasModule("stock_check")) {
    return "/stock-access";
  }

  return "/login";
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(String(value).slice(0, 10));
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatCurrency(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function toneForStatus(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("reject") || status.includes("cancel") || status.includes("unavailable")) {
    return "danger";
  }
  if (status.includes("pending") || status.includes("progress") || status.includes("transit")) {
    return "warning";
  }
  if (status.includes("deliver") || status.includes("resolve") || status.includes("paid") || status.includes("approve")) {
    return "success";
  }
  return "neutral";
}

const ICONS = Object.freeze({
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h8V3H3z"/><path d="M13 21h8v-6h-8z"/><path d="M13 10h8V3h-8z"/><path d="M3 21h8v-4H3z"/></svg>',
  account:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
  customers:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14H7.5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="8" r="3.5"/><path d="M18 8.5a2.5 2.5 0 1 1 0 5"/><path d="M20 19v-1a3 3 0 0 0-2.2-2.9"/></svg>',
  products:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21 4 16.5v-9z"/><path d="m12 12 8-4.5"/><path d="M12 12 4 7.5"/><path d="M12 21v-9"/></svg>',
  orders:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.7L21 8H7"/></svg>',
  suppliers:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v8H3z"/><path d="M14 10h3l4 3v2h-7z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></svg>',
  employees:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21v-2.5A3.5 3.5 0 0 1 11.5 15h1A3.5 3.5 0 0 1 16 18.5V21"/><circle cx="12" cy="8" r="3.5"/><path d="M4 7h2"/><path d="M18 7h2"/></svg>',
  service:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m14 7 3-3 3 3-3 3"/><path d="M17 4v7a4 4 0 0 1-4 4H6"/><path d="m10 17-3 3-3-3"/><path d="M7 20v-7a4 4 0 0 1 4-4h7"/></svg>',
  finance:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M6 15 10 9l3 3 5-7"/><path d="M18 5h-4"/><path d="M18 5v4"/></svg>',
  stock_check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3.5 19h17z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
});

const MODULE_COPY = Object.freeze({
  account: "Profile details and customer access.",
  dashboard: "High-level operational summary.",
  products: "Catalog, stock, and pricing workspace.",
  customers: "Customer directory and relationships.",
  orders: "Sales orders, payments, and delivery flow.",
  suppliers: "Supply partners, offers, and replenishment.",
  employees: "Team records, leave, and staffing.",
  service: "Product service queue and diagnostics.",
  finance: "Revenue, expense, and profit reporting.",
  stock_check: "Restricted stock verification tools.",
});

function iconMarkup(key, className = "icon-badge") {
  return `<span class="${className}" aria-hidden="true">${ICONS[key] || ICONS.dashboard}</span>`;
}

function iconKeyForLabel(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("account")) {
    return "account";
  }
  if (value.includes("customer")) {
    return "customers";
  }
  if (value.includes("product") || value.includes("catalog") || value.includes("stock")) {
    return value.includes("stock") ? "alert" : "products";
  }
  if (value.includes("order")) {
    return "orders";
  }
  if (value.includes("supplier")) {
    return "suppliers";
  }
  if (value.includes("employee") || value.includes("staff")) {
    return "employees";
  }
  if (value.includes("service")) {
    return "service";
  }
  if (value.includes("revenue") || value.includes("profit") || value.includes("expense") || value.includes("cost")) {
    return "finance";
  }
  if (value.includes("overview")) {
    return "dashboard";
  }
  return "dashboard";
}

function metricTone(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("revenue") || value.includes("profit")) {
    return "success";
  }
  if (value.includes("expense") || value.includes("cost")) {
    return "danger";
  }
  if (value.includes("service") || value.includes("stock")) {
    return "warning";
  }
  return "accent";
}

function createStatusPill(value) {
  return `<span class="status-pill ${toneForStatus(value)}"><span class="status-dot"></span>${escapeHtml(value || "N/A")}</span>`;
}

function sectionHeader(title, copy, iconKey) {
  return `
    <div class="section-header">
      ${iconMarkup(iconKey, "section-icon")}
      <div class="stack section-copy">
        <h2 class="section-title">${escapeHtml(title)}</h2>
        ${copy ? `<p class="subtle">${escapeHtml(copy)}</p>` : ""}
      </div>
    </div>
  `;
}

function renderAccessCards(modules) {
  if (!modules.length) {
    return emptyState("No modules assigned to this account.");
  }

  return `
    <div class="access-grid">
      ${modules
        .map(
          (module) => `
            <article class="access-card">
              <div class="access-card-top">
                ${iconMarkup(module.key, "access-icon")}
                <span class="access-route">${escapeHtml(module.route || "/")}</span>
              </div>
              <div class="access-title">${escapeHtml(module.label)}</div>
              <div class="access-description">${escapeHtml(MODULE_COPY[module.key] || "Available in your current profile.")}</div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function setBanner(message, type = "success") {
  state.banner = message ? { message, type } : null;
  renderBanner();
}

function renderBanner() {
  if (!state.banner) {
    banner.hidden = true;
    banner.textContent = "";
    banner.className = "banner";
    return;
  }

  banner.hidden = false;
  banner.className = `banner is-${state.banner.type}`;
  banner.textContent = state.banner.message;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

async function refreshSession() {
  const payload = await api("/api/session");
  state.session = {
    authenticated: Boolean(payload.authenticated),
    session_scope: payload.session_scope || "guest",
    user: payload.user || null,
    can_view_financials: Boolean(payload.can_view_financials),
    modules: Array.isArray(payload.modules) ? payload.modules : [],
  };
}

function visibleRoutes() {
  if (!isFullSession()) {
    return [];
  }

  return ROUTES.filter((route) => hasModule(route.module));
}

function renderNav() {
  nav.innerHTML = visibleRoutes().map((route) => {
    const active = state.route === route.path ? " active" : "";
    return `<a href="${route.path}" class="nav-link${active}" data-link>${route.label}</a>`;
  }).join("");

  const authLabel = state.session.authenticated
    ? `${escapeHtml(state.session.user.display_name)} · ${escapeHtml(state.session.user.role)}`
    : "Guest session";

  actions.innerHTML = `
    <span class="role-pill">${authLabel}</span>
    <button class="button button-secondary" type="button" data-action="refresh-page">Refresh Data</button>
    ${
      state.session.authenticated
        ? '<button class="button button-ghost" type="button" data-action="logout">Logout</button>'
        : '<a href="/login" class="button button-primary" data-link>Login</a>'
    }
  `;

  const refreshButton = actions.querySelector('[data-action="refresh-page"]');
  refreshButton.addEventListener("click", () => {
    renderRoute();
  });

  const logoutButton = actions.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await api("/api/auth/logout", { method: "POST" });
        await refreshSession();
        setBanner("Logged out.", "success");
        navigate("/", true);
      } catch (error) {
        setBanner(error.message || "Logout failed.", "error");
      }
    });
  }
}

function navigate(path, replace = false) {
  if (replace) {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }
  state.route = path;
  renderNav();
  renderRoute();
}

function renderLoading(message = "Loading data...") {
  app.innerHTML = `<div class="loading">${escapeHtml(message)}</div>`;
}

function metricCard(label, value, note = "") {
  const tone = metricTone(label);
  return `
    <article class="metric-card" data-tone="${tone}">
      <div class="metric-head">
        <div class="stack metric-copy">
          <div class="metric-label">${escapeHtml(label)}</div>
          <div class="metric-value">${escapeHtml(value)}</div>
        </div>
        ${iconMarkup(iconKeyForLabel(label), "metric-icon")}
      </div>
      ${note ? `<div class="metric-note">${escapeHtml(note)}</div>` : ""}
    </article>
  `;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function createTable(headers, rows) {
  if (!rows.length) {
    return emptyState("No records available yet.");
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function optionMarkup(items, valueKey, labelKey, placeholder) {
  const options = items
    .map((item) => `<option value="${escapeHtml(item[valueKey])}">${escapeHtml(item[labelKey])}</option>`)
    .join("");
  return `<option value="">${escapeHtml(placeholder)}</option>${options}`;
}

function pageFrame(title, copy, content) {
  return `
    <section class="stack">
      <div class="hero-panel">
        <div class="stack">
          <div class="eyebrow">OpenMarket</div>
          <h1 class="page-title">${escapeHtml(title)}</h1>
          <p class="hero-copy">${escapeHtml(copy)}</p>
        </div>
      </div>
      ${content}
    </section>
  `;
}

async function renderLoginPage() {
  if (state.session.authenticated) {
    navigate("/", true);
    return;
  }

  app.innerHTML = pageFrame(
    "Login / Register new account",
    "Access your account or create a new client account.",
    `
      <section class="split-grid">
        <div class="form-card">
          <h2 class="section-title">Login</h2>
          <form id="login-form" class="stack">
            <div class="field-grid">
              <div class="field">
                <label>Username</label>
                <input name="username" required autocomplete="username" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" required autocomplete="current-password" />
              </div>
            </div>
            <button class="button button-primary" type="submit">Login</button>
          </form>
        </div>

        <div class="form-card">
          <h2 class="section-title">Create Account</h2>
          <form id="register-form" class="stack">
            <div class="field-grid">
              <div class="field">
                <label>First Name</label>
                <input name="first_name" required minlength="2" autocomplete="given-name" />
              </div>
              <div class="field">
                <label>Last Name</label>
                <input name="last_name" required minlength="2" autocomplete="family-name" />
              </div>
              <div class="field">
                <label>Email</label>
                <input name="email" type="email" required autocomplete="email" />
              </div>
              <div class="field">
                <label>Phone</label>
                <input name="phone" autocomplete="tel" />
              </div>
              <div class="field">
                <label>Username</label>
                <input name="username" required minlength="3" autocomplete="username" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" required minlength="8" autocomplete="new-password" />
              </div>
              <div class="field">
                <label>Confirm Password</label>
                <input name="confirm_password" type="password" required minlength="8" autocomplete="new-password" />
              </div>
            </div>
            <button class="button button-primary" type="submit">Create Client Account</button>
          </form>
        </div>
      </section>
    `
  );

  bindJsonForm(
    "login-form",
    "/api/auth/login",
    (form) => ({
      username: form.get("username"),
      password: form.get("password"),
    }),
    "Login successful.",
    async () => {
      await refreshSession();
      navigate("/", true);
    }
  );
}

async function renderOverviewPage() {
  const data = await api("/api/overview");

  app.innerHTML = pageFrame(
    "Operations Overview",
    "Track the current state of products, customers, orders, suppliers, staff, and service activity.",
    `
      <section class="metric-grid">
        ${metricCard("Customers", String(data.metrics.customers), "Registered customer records")}
        ${metricCard("Products", String(data.metrics.products), "Active product catalog items")}
        ${metricCard("Orders", String(data.metrics.orders), "Sales orders recorded")}
        ${metricCard("Suppliers", String(data.metrics.suppliers), "Suppliers and purchasing partners")}
        ${metricCard("Employees", String(data.metrics.employees), "Staff records and service owners")}
        ${metricCard("Open Service", String(data.metrics.open_service_cases), "Cases not yet resolved")}
        ${
          data.can_view_financials
            ? metricCard("Revenue", formatCurrency(data.metrics.revenue), "Sum of earnings")
            : ""
        }
        ${
          data.can_view_financials
            ? metricCard("Net Profit", formatCurrency(data.metrics.profit), "Revenue minus recorded expenses")
            : ""
        }
      </section>

      <section class="dashboard-grid">
        <div class="card stack">
          <div>
            <h2 class="section-title">Recent Orders</h2>
            <p class="subtle">Latest order activity, payment flow, and responsible employee.</p>
          </div>
          ${createTable(
            ["Order", "Customer", "Employee", "Status", "Total", "Date"],
            data.recent_orders.map(
              (row) => `
                <td>#${escapeHtml(row.order_id)}</td>
                <td>${escapeHtml(row.customer_name)}</td>
                <td>${escapeHtml(row.employee_name)}</td>
                <td>${createStatusPill(row.order_status)}</td>
                <td>${formatCurrency(row.total_value)}</td>
                <td>${formatDate(row.order_date)}</td>
              `
            )
          )}
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Low Stock Products</h2>
            <p class="subtle">Products at or below the alert threshold of five units.</p>
          </div>
          <div class="product-grid">
            ${
              data.low_stock_products.length
                ? data.low_stock_products
                    .map(
                      (product) => `
                        <article class="product-card stack">
                          <h3>${escapeHtml(product.product_name)}</h3>
                          <div class="product-meta">
                            <span>${escapeHtml(product.brand || "No brand")}</span>
                            <span>${escapeHtml(product.category || "No category")}</span>
                          </div>
                          <div class="chip-row">
                            <span class="tag">Stock ${escapeHtml(product.stock)}</span>
                            <span class="tag">${formatCurrency(product.sale_price)}</span>
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : emptyState("Stock coverage is healthy across the catalog.")
            }
          </div>
        </div>
      </section>

      <section class="dashboard-grid">
        <div class="card stack">
          <div>
            <h2 class="section-title">Recent Service Cases</h2>
            <p class="subtle">Latest product service rows linked to customers and products.</p>
          </div>
          ${createTable(
            ["Case", "Customer", "Product", "Status", "Received"],
            data.service_cases.map(
              (row) => `
                <td>#${escapeHtml(row.service_id)}</td>
                <td>${escapeHtml(row.customer_name)}</td>
                <td>${escapeHtml(row.product_name)}</td>
                <td>${createStatusPill(row.service_status)}</td>
                <td>${formatDate(row.received_date)}</td>
              `
            )
          )}
        </div>

        ${
          data.can_view_financials
            ? `
              <div class="card stack">
                <div>
                  <h2 class="section-title">Monthly Profit Snapshot</h2>
                  <p class="subtle">Most recent aggregate rows from the monthly_profit table.</p>
                </div>
                ${createTable(
                  ["Period", "Earnings", "Expenses", "Net"],
                  data.monthly_profit.map(
                    (row) => `
                      <td>${escapeHtml(`${row.month}/${row.year}`)}</td>
                      <td>${formatCurrency(row.total_earnings)}</td>
                      <td>${formatCurrency(row.total_expenses)}</td>
                      <td>${formatCurrency(row.net_profit)}</td>
                    `
                  )
                )}
              </div>
            `
            : `
              <div class="card stack">
                <div>
                  <h2 class="section-title">Financial Access Restricted</h2>
                  <p class="subtle">Revenue, net profit, and monthly profit widgets are available only for admin, director, and accountant accounts.</p>
                </div>
              </div>
            `
        }
      </section>
    `
  );
}

async function renderProductsPage() {
  const data = await api("/api/products");

  app.innerHTML = pageFrame(
    "Products",
    "Manage catalog items, pricing, and stock levels.",
    `
      <section class="split-grid">
        <div class="form-card">
          <h2 class="section-title">Add Product</h2>
          <form id="product-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Product Name</label><input name="product_name" required minlength="3" /></div>
              <div class="field"><label>Brand</label><input name="brand" /></div>
              <div class="field"><label>Product Type</label><input name="product_type" placeholder="Accessory, Peripheral, Lighting" /></div>
              <div class="field"><label>Category</label><input name="category" required minlength="2" /></div>
              <div class="field"><label>Sale Price</label><input name="sale_price" type="number" min="0" step="0.01" required /></div>
              <div class="field"><label>Stock</label><input name="stock" type="number" min="0" step="1" required /></div>
              <div class="field"><label>Date Added</label><input name="date_added" type="date" /></div>
            </div>
            <div class="field"><label>Description</label><textarea name="description"></textarea></div>
            <button class="button button-primary" type="submit">Create Product</button>
          </form>
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Category Summary</h2>
            <p class="subtle">Quick category breakdown for the current catalog.</p>
          </div>
          ${createTable(
            ["Category", "Products", "Total Stock", "Average Price"],
            data.category_summary.map(
              (row) => `
                <td>${escapeHtml(row.category || "Uncategorized")}</td>
                <td>${escapeHtml(row.product_count)}</td>
                <td>${escapeHtml(row.total_stock)}</td>
                <td>${formatCurrency(row.average_price)}</td>
              `
            )
          )}
        </div>
      </section>

      <section class="card stack">
        <div>
          <h2 class="section-title">Product Catalog</h2>
          <p class="subtle">Complete product list with stock, pricing, type, and creation date.</p>
        </div>
        ${createTable(
          ["ID", "Product", "Brand", "Type", "Category", "Price", "Stock", "Added"],
          data.products.map(
            (row) => `
              <td>#${escapeHtml(row.product_id)}</td>
              <td>${escapeHtml(row.product_name)}</td>
              <td>${escapeHtml(row.brand || "N/A")}</td>
              <td>${escapeHtml(row.product_type || "N/A")}</td>
              <td>${escapeHtml(row.category || "N/A")}</td>
              <td>${formatCurrency(row.sale_price)}</td>
              <td>${escapeHtml(row.stock)}</td>
              <td>${formatDate(row.date_added)}</td>
            `
          )
        )}
      </section>
    `
  );

  bindJsonForm("product-form", "/api/products", (form) => ({
    product_name: form.get("product_name"),
    brand: form.get("brand"),
    product_type: form.get("product_type"),
    category: form.get("category"),
    sale_price: form.get("sale_price"),
    stock: form.get("stock"),
    date_added: form.get("date_added"),
    description: form.get("description"),
  }), "Product created.");
}

async function renderCustomersPage() {
  const data = await api("/api/customers");

  app.innerHTML = pageFrame(
    "Customers",
    "Manage customer contact records and review their order and service history counts.",
    `
      <section class="split-grid">
        <div class="form-card">
          <h2 class="section-title">Add Customer</h2>
          <form id="customer-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>First Name</label><input name="first_name" required minlength="2" /></div>
              <div class="field"><label>Last Name</label><input name="last_name" required minlength="2" /></div>
              <div class="field"><label>Email</label><input name="email" type="email" /></div>
              <div class="field"><label>Phone</label><input name="phone" /></div>
              <div class="field"><label>City</label><input name="city" /></div>
              <div class="field"><label>County</label><input name="county" /></div>
              <div class="field"><label>Postal Code</label><input name="postal_code" /></div>
              <div class="field"><label>Registration Date</label><input name="registration_date" type="date" /></div>
            </div>
            <div class="field"><label>Address</label><textarea name="address"></textarea></div>
            <button class="button button-primary" type="submit">Create Customer</button>
          </form>
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Customer Coverage</h2>
            <p class="subtle">Overview of the current customer base.</p>
          </div>
          <div class="metric-grid">
            ${metricCard("Customer Records", String(data.customers.length), "Rows in the customers table")}
            ${metricCard(
              "Orders Logged",
              String(data.customers.reduce((sum, customer) => sum + Number(customer.total_orders || 0), 0)),
              "Order relationships aggregated from orders"
            )}
            ${metricCard(
              "Service Cases",
              String(data.customers.reduce((sum, customer) => sum + Number(customer.service_cases || 0), 0)),
              "Product service relationships"
            )}
          </div>
        </div>
      </section>

      <section class="card stack">
        <div>
          <h2 class="section-title">Customer Directory</h2>
          <p class="subtle">Includes email, location, registration date, order volume, and service volume.</p>
        </div>
        ${createTable(
          ["ID", "Customer", "Email", "Phone", "Location", "Orders", "Service", "Registered"],
          data.customers.map(
            (row) => `
              <td>#${escapeHtml(row.customer_id)}</td>
              <td>${escapeHtml(`${row.first_name} ${row.last_name}`)}</td>
              <td>${escapeHtml(row.email || "N/A")}</td>
              <td>${escapeHtml(row.phone || "N/A")}</td>
              <td>${escapeHtml([row.city, row.county].filter(Boolean).join(", ") || "N/A")}</td>
              <td>${escapeHtml(row.total_orders)}</td>
              <td>${escapeHtml(row.service_cases)}</td>
              <td>${formatDate(row.registration_date)}</td>
            `
          )
        )}
      </section>
    `
  );

  bindJsonForm("customer-form", "/api/customers", (form) => ({
    first_name: form.get("first_name"),
    last_name: form.get("last_name"),
    email: form.get("email"),
    phone: form.get("phone"),
    city: form.get("city"),
    county: form.get("county"),
    postal_code: form.get("postal_code"),
    registration_date: form.get("registration_date"),
    address: form.get("address"),
  }), "Customer created.");
}

function orderItemsTable(orderLines, orderId) {
  const lines = orderLines.filter((line) => Number(line.order_id) === Number(orderId));
  if (!lines.length) {
    return `<div class="subtle">No order lines recorded.</div>`;
  }

  return lines
    .map((line) => `${escapeHtml(line.product_name)} x ${escapeHtml(line.quantity)} (${formatCurrency(line.subtotal)})`)
    .join("<br />");
}

function orderItemRow(products) {
  return `
    <div class="field-grid order-item-row">
      <div class="field">
        <label>Product</label>
        <select name="product_id" required>${optionMarkup(products, "product_id", "product_name", "Choose product")}</select>
      </div>
      <div class="field">
        <label>Quantity</label>
        <input name="quantity" type="number" min="1" step="1" value="1" required />
      </div>
      <div class="field">
        <label>&nbsp;</label>
        <button class="button button-ghost" type="button" data-action="remove-order-item">Remove Line</button>
      </div>
    </div>
  `;
}

async function renderOrdersPage() {
  const data = await api("/api/orders");

  app.innerHTML = pageFrame(
    "Orders",
    "Create sales orders, attach delivery details, and persist payments and earnings in one flow.",
    `
      <section class="form-card stack">
        <div>
          <h2 class="section-title">Create Order</h2>
          <p class="subtle">Order creation inserts into orders, order_details, payments, deliveries, and earnings.</p>
        </div>
        <form id="order-form" class="stack">
          <div class="field-grid">
            <div class="field"><label>Customer</label><select name="customer_id" required>${optionMarkup(data.customers, "customer_id", "label", "Choose customer")}</select></div>
            <div class="field"><label>Employee</label><select name="employee_id" required>${optionMarkup(data.employees, "employee_id", "label", "Choose employee")}</select></div>
            <div class="field"><label>Order Date</label><input name="order_date" type="date" /></div>
            <div class="field"><label>Order Status</label><input name="order_status" value="Processing" /></div>
            <div class="field"><label>Payment Method</label><input name="payment_method" value="Card" /></div>
            <div class="field"><label>Payment Status</label><input name="payment_status" value="Paid" /></div>
            <div class="field"><label>Amount Paid</label><input name="amount_paid" type="number" min="0" step="0.01" /></div>
            <div class="field"><label>Shipping Date</label><input name="shipping_date" type="date" /></div>
            <div class="field"><label>Courier Company</label><input name="courier_company" /></div>
            <div class="field"><label>Delivery Status</label><input name="delivery_status" value="Prepared" /></div>
            <div class="field"><label>Delivery Cost</label><input name="delivery_cost" type="number" min="0" step="0.01" /></div>
            <div class="field"><label>AWB Number</label><input name="awb_number" /></div>
          </div>
          <div class="field">
            <label>Delivery Address</label>
            <textarea name="delivery_address" placeholder="Leave blank for in-store pickup or no shipping row."></textarea>
          </div>
          <div class="stack">
            <div class="inline-actions">
              <h3 class="card-title">Order Lines</h3>
              <button class="button button-secondary" type="button" id="add-order-item">Add Product Line</button>
            </div>
            <div id="order-items" class="stack"></div>
          </div>
          <button class="button button-primary" type="submit">Create Order</button>
        </form>
      </section>

      <section class="card stack">
        <div>
          <h2 class="section-title">Order Register</h2>
          <p class="subtle">Each row shows payment, delivery, and line summary information.</p>
        </div>
        ${createTable(
          ["Order", "Customer", "Employee", "Items", "Payment", "Delivery", "Total", "Date"],
          data.orders.map(
            (row) => `
              <td>
                <strong>#${escapeHtml(row.order_id)}</strong><br />
                ${createStatusPill(row.order_status)}
              </td>
              <td>${escapeHtml(row.customer_name)}</td>
              <td>${escapeHtml(row.employee_name)}</td>
              <td>${orderItemsTable(data.order_lines, row.order_id)}</td>
              <td>
                ${escapeHtml(row.payment_method || "N/A")}<br />
                ${createStatusPill(row.payment_status || "Unpaid")}<br />
                ${formatCurrency(row.amount_paid || 0)}
              </td>
              <td>
                ${createStatusPill(row.delivery_status || "No delivery")}<br />
                ${escapeHtml(row.awb_number || "No AWB")}
              </td>
              <td>${formatCurrency(row.total_value)}</td>
              <td>${formatDate(row.order_date)}</td>
            `
          )
        )}
      </section>
    `
  );

  bindOrderForm(data.products);
}

async function renderSuppliersPage() {
  const data = await api("/api/suppliers");

  app.innerHTML = pageFrame(
    "Suppliers",
    "Handle supplier records, catalog offers, and stock replenishment against the purchasing tables.",
    `
      <section class="collection-grid">
        <div class="form-card">
          <h2 class="section-title">Add Supplier</h2>
          <form id="supplier-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Company Name</label><input name="company_name" required minlength="2" /></div>
              <div class="field"><label>Contact Person</label><input name="contact_person" /></div>
              <div class="field"><label>Email</label><input name="email" type="email" /></div>
              <div class="field"><label>Phone</label><input name="phone" /></div>
            </div>
            <div class="field"><label>Address</label><textarea name="address"></textarea></div>
            <button class="button button-primary" type="submit">Create Supplier</button>
          </form>
        </div>

        <div class="form-card">
          <h2 class="section-title">Register Offer</h2>
          <form id="supplier-offer-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Supplier</label><select name="supplier_id" required>${optionMarkup(data.suppliers, "supplier_id", "company_name", "Choose supplier")}</select></div>
              <div class="field"><label>Product</label><select name="product_id" required>${optionMarkup(data.products, "product_id", "product_name", "Choose product")}</select></div>
              <div class="field"><label>Available Quantity</label><input name="available_quantity" type="number" min="0" step="1" required /></div>
              <div class="field"><label>Purchase Price</label><input name="purchase_price" type="number" min="0" step="0.01" required /></div>
            </div>
            <button class="button button-primary" type="submit">Create Offer</button>
          </form>
        </div>

        <div class="form-card">
          <h2 class="section-title">Register Supply</h2>
          <form id="supply-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Supplier</label><select name="supplier_id" required>${optionMarkup(data.suppliers, "supplier_id", "company_name", "Choose supplier")}</select></div>
              <div class="field"><label>Product</label><select name="product_id" required>${optionMarkup(data.products, "product_id", "product_name", "Choose product")}</select></div>
              <div class="field"><label>Quantity</label><input name="quantity" type="number" min="1" step="1" required /></div>
              <div class="field"><label>Purchase Price</label><input name="purchase_price" type="number" min="0" step="0.01" required /></div>
              <div class="field"><label>Supply Date</label><input name="supply_date" type="date" /></div>
            </div>
            <button class="button button-primary" type="submit">Create Supply</button>
          </form>
        </div>
      </section>

      <section class="dashboard-grid">
        <div class="card stack">
          <div>
            <h2 class="section-title">Suppliers</h2>
            <p class="subtle">Each supplier with offer and supply activity counts.</p>
          </div>
          ${createTable(
            ["Supplier", "Contact", "Email", "Offers", "Supplies"],
            data.suppliers.map(
              (row) => `
                <td>${escapeHtml(row.company_name)}</td>
                <td>${escapeHtml(row.contact_person || "N/A")}</td>
                <td>${escapeHtml(row.email || "N/A")}</td>
                <td>${escapeHtml(row.offer_count)}</td>
                <td>${escapeHtml(row.supply_count)}</td>
              `
            )
          )}
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Supplier Offers</h2>
            <p class="subtle">Current available offers by product and supplier.</p>
          </div>
          ${createTable(
            ["Supplier", "Product", "Available Qty", "Purchase Price"],
            data.offers.map(
              (row) => `
                <td>${escapeHtml(row.company_name)}</td>
                <td>${escapeHtml(row.product_name)}</td>
                <td>${escapeHtml(row.available_quantity)}</td>
                <td>${formatCurrency(row.purchase_price)}</td>
              `
            )
          )}
        </div>
      </section>

      <section class="card stack">
        <div>
          <h2 class="section-title">Supply History</h2>
          <p class="subtle">Stock replenishment records that also generate expense entries.</p>
        </div>
        ${createTable(
          ["Supply", "Supplier", "Product", "Quantity", "Purchase Price", "Date"],
          data.supplies.map(
            (row) => `
              <td>#${escapeHtml(row.supply_id)}</td>
              <td>${escapeHtml(row.company_name)}</td>
              <td>${escapeHtml(row.product_name)}</td>
              <td>${escapeHtml(row.quantity)}</td>
              <td>${formatCurrency(row.purchase_price)}</td>
              <td>${formatDate(row.supply_date)}</td>
            `
          )
        )}
      </section>
    `
  );

  bindJsonForm("supplier-form", "/api/suppliers", (form) => Object.fromEntries(form.entries()), "Supplier created.");
  bindJsonForm("supplier-offer-form", "/api/supplier-offers", (form) => Object.fromEntries(form.entries()), "Supplier offer created.");
  bindJsonForm("supply-form", "/api/supplies", (form) => Object.fromEntries(form.entries()), "Supply created and stock updated.");
}

async function renderEmployeesPage() {
  const data = await api("/api/employees");
  const employeeChoices = data.employees.map((employee) => ({
    employee_id: employee.employee_id,
    label: `${employee.first_name} ${employee.last_name}`,
  }));

  app.innerHTML = pageFrame(
    "Employees",
    "Track team records, leave management, resignations, and service ownership.",
    `
      <section class="collection-grid">
        <div class="form-card">
          <h2 class="section-title">Add Employee</h2>
          <form id="employee-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>First Name</label><input name="first_name" required minlength="2" /></div>
              <div class="field"><label>Last Name</label><input name="last_name" required minlength="2" /></div>
              <div class="field"><label>Job Title</label><input name="job_title" /></div>
              <div class="field"><label>Email</label><input name="email" type="email" /></div>
              <div class="field"><label>Phone</label><input name="phone" /></div>
              <div class="field"><label>Salary</label><input name="salary" type="number" min="0" step="0.01" /></div>
              <div class="field"><label>Hire Date</label><input name="hire_date" type="date" /></div>
            </div>
            <button class="button button-primary" type="submit">Create Employee</button>
          </form>
        </div>

        <div class="form-card">
          <h2 class="section-title">Log Leave</h2>
          <form id="leave-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Employee</label><select name="employee_id" required>${optionMarkup(employeeChoices, "employee_id", "label", "Choose employee")}</select></div>
              <div class="field"><label>Leave Type</label><select name="leave_type" required>${optionMarkup(data.leave_types, "code", "name", "Choose leave type")}</select></div>
              <div class="field"><label>Start Date</label><input name="start_date" type="date" required /></div>
              <div class="field"><label>End Date</label><input name="end_date" type="date" required /></div>
              <div class="field"><label>Status</label><input name="status" value="Pending" /></div>
            </div>
            <div class="field"><label>Reason</label><textarea name="reason"></textarea></div>
            <button class="button button-primary" type="submit">Create Leave Record</button>
          </form>
        </div>

        <div class="form-card">
          <h2 class="section-title">Log Resignation</h2>
          <form id="resignation-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Employee</label><select name="employee_id" required>${optionMarkup(employeeChoices, "employee_id", "label", "Choose employee")}</select></div>
              <div class="field"><label>Resignation Date</label><input name="resignation_date" type="date" required /></div>
              <div class="field"><label>Notice Period Days</label><input name="notice_period_days" type="number" min="0" step="1" /></div>
              <div class="field"><label>Status</label><input name="status" value="Submitted" /></div>
            </div>
            <div class="field"><label>Reason</label><textarea name="reason"></textarea></div>
            <button class="button button-primary" type="submit">Create Resignation Record</button>
          </form>
        </div>
      </section>

      <section class="dashboard-grid">
        <div class="card stack">
          <div>
            <h2 class="section-title">Employee Directory</h2>
            <p class="subtle">Staff records with salary, leave activity, service count, and latest resignation state.</p>
          </div>
          ${createTable(
            ["Employee", "Role", "Email", "Salary", "Leaves", "Service", "Resignation"],
            data.employees.map(
              (row) => `
                <td>${escapeHtml(`${row.first_name} ${row.last_name}`)}</td>
                <td>${escapeHtml(row.job_title || "N/A")}</td>
                <td>${escapeHtml(row.email || "N/A")}</td>
                <td>${formatCurrency(row.salary)}</td>
                <td>${escapeHtml(row.leave_count)}</td>
                <td>${escapeHtml(row.service_count)}</td>
                <td>${createStatusPill(row.resignation_status || "Active")}</td>
              `
            )
          )}
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Leave History</h2>
            <p class="subtle">Leave requests linked to the employee roster and leave type dictionary.</p>
          </div>
          ${createTable(
            ["Employee", "Type", "Start", "End", "Status", "Reason"],
            data.leaves.map(
              (row) => `
                <td>${escapeHtml(row.employee_name)}</td>
                <td>${escapeHtml(row.leave_type_name)}</td>
                <td>${formatDate(row.start_date)}</td>
                <td>${formatDate(row.end_date)}</td>
                <td>${createStatusPill(row.status)}</td>
                <td>${escapeHtml(row.reason || "N/A")}</td>
              `
            )
          )}
        </div>
      </section>

      <section class="card stack">
        <div>
          <h2 class="section-title">Resignation Records</h2>
          <p class="subtle">Notice periods and departure statuses stored in employee_resignations.</p>
        </div>
        ${createTable(
          ["Employee", "Date", "Notice Days", "Status", "Reason"],
          data.resignations.map(
            (row) => `
              <td>${escapeHtml(row.employee_name)}</td>
              <td>${formatDate(row.resignation_date)}</td>
              <td>${escapeHtml(row.notice_period_days ?? "N/A")}</td>
              <td>${createStatusPill(row.status)}</td>
              <td>${escapeHtml(row.reason || "N/A")}</td>
            `
          )
        )}
      </section>
    `
  );

  bindJsonForm("employee-form", "/api/employees", (form) => Object.fromEntries(form.entries()), "Employee created.");
  bindJsonForm("leave-form", "/api/employee-leaves", (form) => Object.fromEntries(form.entries()), "Employee leave created.");
  bindJsonForm("resignation-form", "/api/employee-resignations", (form) => Object.fromEntries(form.entries()), "Employee resignation created.");
}

async function renderServicePage() {
  const data = await api("/api/service");

  app.innerHTML = pageFrame(
    "Product Service",
    "Log incoming service cases, assign responsibility, and track diagnoses and resolutions.",
    `
      <section class="split-grid">
        <div class="form-card">
          <h2 class="section-title">Create Service Case</h2>
          <form id="service-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Customer</label><select name="customer_id" required>${optionMarkup(data.customers, "customer_id", "label", "Choose customer")}</select></div>
              <div class="field"><label>Product</label><select name="product_id" required>${optionMarkup(data.products, "product_id", "product_name", "Choose product")}</select></div>
              <div class="field"><label>Order</label><select name="order_id">${optionMarkup(data.orders, "order_id", "label", "Optional order link")}</select></div>
              <div class="field"><label>Assigned Employee</label><select name="employee_id">${optionMarkup(data.employees, "employee_id", "label", "Optional employee")}</select></div>
              <div class="field"><label>Received Date</label><input name="received_date" type="date" /></div>
              <div class="field"><label>Service Status</label><input name="service_status" value="Received" /></div>
              <div class="field"><label>Resolved Date</label><input name="resolved_date" type="date" /></div>
            </div>
            <div class="field"><label>Reported Issue</label><textarea name="reported_issue" required minlength="5"></textarea></div>
            <div class="field"><label>Diagnosis</label><textarea name="diagnosis"></textarea></div>
            <div class="field"><label>Solution</label><textarea name="solution"></textarea></div>
            <button class="button button-primary" type="submit">Create Service Case</button>
          </form>
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Service Queue</h2>
            <p class="subtle">Cases currently in progress, resolved, or waiting for work.</p>
          </div>
          <div class="product-grid">
            ${
              data.service_cases.length
                ? data.service_cases
                    .map(
                      (row) => `
                        <article class="collection-card stack">
                          <div class="inline-actions">
                            <h3>#${escapeHtml(row.service_id)} · ${escapeHtml(row.product_name)}</h3>
                            ${createStatusPill(row.service_status)}
                          </div>
                          <div class="meta-line">
                            <span>${escapeHtml(row.customer_name)}</span>
                            <span>${escapeHtml(row.employee_name || "Unassigned")}</span>
                            <span>${formatDate(row.received_date)}</span>
                          </div>
                          <div><strong>Issue:</strong> ${escapeHtml(row.reported_issue)}</div>
                          <div><strong>Diagnosis:</strong> ${escapeHtml(row.diagnosis || "Pending diagnosis")}</div>
                          <div><strong>Solution:</strong> ${escapeHtml(row.solution || "Pending resolution")}</div>
                        </article>
                      `
                    )
                    .join("")
                : emptyState("No service cases are stored yet.")
            }
          </div>
        </div>
      </section>
    `
  );

  bindJsonForm("service-form", "/api/service", (form) => Object.fromEntries(form.entries()), "Service case created.");
}

async function renderFinancePage() {
  if (!state.session.can_view_financials) {
    app.innerHTML = pageFrame(
      "Finance",
      "This area is restricted to admin, director, and accountant accounts.",
      emptyState("You do not have permission to access the finance dashboard.")
    );
    return;
  }

  const data = await api("/api/finance");

  app.innerHTML = pageFrame(
    "Finance",
    "Inspect earnings, expenses, and monthly profitability, and record new expenses.",
    `
      <section class="metric-grid">
        ${metricCard("Revenue", formatCurrency(data.metrics.revenue), "Sum of earnings.revenue")}
        ${metricCard("Cost", formatCurrency(data.metrics.cost), "Sum of earnings.cost")}
        ${metricCard("Gross Profit", formatCurrency(data.metrics.gross_profit), "Sum of earnings.profit")}
        ${metricCard("Expenses", formatCurrency(data.metrics.expenses), "Sum of expenses.amount")}
        ${metricCard("Net Profit", formatCurrency(data.metrics.net_profit), "Revenue minus expenses")}
      </section>

      <section class="split-grid">
        <div class="form-card">
          <h2 class="section-title">Create Expense</h2>
          <form id="expense-form" class="stack">
            <div class="field-grid">
              <div class="field"><label>Expense Type</label><input name="expense_type" required minlength="2" /></div>
              <div class="field"><label>Amount</label><input name="amount" type="number" min="0" step="0.01" required /></div>
              <div class="field"><label>Expense Date</label><input name="expense_date" type="date" /></div>
              <div class="field"><label>Supplier</label><select name="supplier_id">${optionMarkup(data.suppliers, "supplier_id", "company_name", "Optional supplier")}</select></div>
              <div class="field"><label>Supply Link</label><select name="supply_id">${optionMarkup(data.supplies, "supply_id", "label", "Optional supply")}</select></div>
              <div class="field"><label>Employee</label><select name="employee_id">${optionMarkup(data.employees, "employee_id", "label", "Optional employee")}</select></div>
            </div>
            <div class="field"><label>Description</label><textarea name="description"></textarea></div>
            <button class="button button-primary" type="submit">Create Expense</button>
          </form>
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Monthly Profit</h2>
            <p class="subtle">Each write operation recalculates the relevant monthly profitability row.</p>
          </div>
          ${createTable(
            ["Period", "Earnings", "Expenses", "Net", "Avg Earnings", "Avg Expenses"],
            data.monthly_profit.map(
              (row) => `
                <td>${escapeHtml(`${row.month}/${row.year}`)}</td>
                <td>${formatCurrency(row.total_earnings)}</td>
                <td>${formatCurrency(row.total_expenses)}</td>
                <td>${formatCurrency(row.net_profit)}</td>
                <td>${formatCurrency(row.average_earnings)}</td>
                <td>${formatCurrency(row.average_expenses)}</td>
              `
            )
          )}
        </div>
      </section>

      <section class="dashboard-grid">
        <div class="card stack">
          <div>
            <h2 class="section-title">Earnings Ledger</h2>
            <p class="subtle">Revenue and product cost snapshots linked to orders.</p>
          </div>
          ${createTable(
            ["Order", "Customer", "Revenue", "Cost", "Profit", "Date"],
            data.earnings.map(
              (row) => `
                <td>#${escapeHtml(row.order_id)}</td>
                <td>${escapeHtml(row.customer_name)}</td>
                <td>${formatCurrency(row.revenue)}</td>
                <td>${formatCurrency(row.cost)}</td>
                <td>${formatCurrency(row.profit)}</td>
                <td>${formatDate(row.record_date)}</td>
              `
            )
          )}
        </div>

        <div class="card stack">
          <div>
            <h2 class="section-title">Expense Ledger</h2>
            <p class="subtle">Operational and inventory expenses with optional supplier, supply, and employee links.</p>
          </div>
          ${createTable(
            ["Type", "Description", "Amount", "Supplier", "Employee", "Date"],
            data.expenses.map(
              (row) => `
                <td>${escapeHtml(row.expense_type || "N/A")}</td>
                <td>${escapeHtml(row.description || "N/A")}</td>
                <td>${formatCurrency(row.amount)}</td>
                <td>${escapeHtml(row.company_name || "N/A")}</td>
                <td>${escapeHtml(row.employee_name || "N/A")}</td>
                <td>${formatDate(row.expense_date)}</td>
              `
            )
          )}
        </div>
      </section>
    `
  );

  bindJsonForm("expense-form", "/api/expenses", (form) => Object.fromEntries(form.entries()), "Expense created.");
}

function bindJsonForm(formId, endpoint, buildPayload, successMessage, onSuccess) {
  const formElement = document.getElementById(formId);
  if (!formElement) {
    return;
  }

  formElement.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = formElement.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const formData = new FormData(formElement);
      await api(endpoint, { method: "POST", body: buildPayload(formData) });
      setBanner(successMessage, "success");
      formElement.reset();
      if (onSuccess) {
        await onSuccess();
      } else {
        await renderRoute();
      }
    } catch (error) {
      setBanner(error.message || "Submit failed.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindOrderForm(products) {
  const formElement = document.getElementById("order-form");
  if (!formElement) {
    return;
  }

  const itemsHost = document.getElementById("order-items");
  const addButton = document.getElementById("add-order-item");

  function addLine() {
    itemsHost.insertAdjacentHTML("beforeend", orderItemRow(products));
    const removeButtons = itemsHost.querySelectorAll('[data-action="remove-order-item"]');
    if (removeButtons.length === 1) {
      removeButtons[0].disabled = true;
    } else {
      removeButtons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  addButton.addEventListener("click", addLine);
  itemsHost.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="remove-order-item"]');
    if (!button) {
      return;
    }
    const rows = itemsHost.querySelectorAll(".order-item-row");
    if (rows.length <= 1) {
      return;
    }
    button.closest(".order-item-row").remove();
    const remaining = itemsHost.querySelectorAll('[data-action="remove-order-item"]');
    if (remaining.length === 1) {
      remaining[0].disabled = true;
    }
  });

  addLine();

  formElement.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = formElement.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const formData = new FormData(formElement);
      const items = Array.from(itemsHost.querySelectorAll(".order-item-row")).map((row) => ({
        product_id: row.querySelector('[name="product_id"]').value,
        quantity: row.querySelector('[name="quantity"]').value,
      }));

      await api("/api/orders", {
        method: "POST",
        body: {
          customer_id: formData.get("customer_id"),
          employee_id: formData.get("employee_id"),
          order_date: formData.get("order_date"),
          order_status: formData.get("order_status"),
          payment_method: formData.get("payment_method"),
          payment_status: formData.get("payment_status"),
          amount_paid: formData.get("amount_paid"),
          shipping_date: formData.get("shipping_date"),
          courier_company: formData.get("courier_company"),
          delivery_status: formData.get("delivery_status"),
          delivery_cost: formData.get("delivery_cost"),
          awb_number: formData.get("awb_number"),
          delivery_address: formData.get("delivery_address"),
          items,
        },
      });

      setBanner("Order created and financial records updated.", "success");
      await renderRoute();
    } catch (error) {
      setBanner(error.message || "Order creation failed.", "error");
      submitButton.disabled = false;
    }
  });
}

async function renderRoute() {
  state.loading = true;
  renderLoading();
  renderBanner();

  try {
    switch (window.location.pathname) {
      case "/login":
        await renderLoginPage();
        break;
      case "/":
        await renderOverviewPage();
        break;
      case "/products":
        await renderProductsPage();
        break;
      case "/customers":
        await renderCustomersPage();
        break;
      case "/orders":
        await renderOrdersPage();
        break;
      case "/suppliers":
        await renderSuppliersPage();
        break;
      case "/employees":
        await renderEmployeesPage();
        break;
      case "/service":
        await renderServicePage();
        break;
      case "/finance":
        await renderFinancePage();
        break;
      default:
        navigate("/", true);
        return;
    }
  } catch (error) {
    app.innerHTML = emptyState(error.message || "The page could not be loaded.");
    setBanner(error.message || "Page load failed.", "error");
  } finally {
    state.loading = false;
  }
}

async function refreshSession() {
  const payload = await api("/api/session");
  state.session = {
    authenticated: Boolean(payload.authenticated),
    session_scope: payload.session_scope || "guest",
    user: payload.user || null,
    can_view_financials: Boolean(payload.can_view_financials),
    modules: Array.isArray(payload.modules) ? payload.modules : [],
  };
}

function visibleRoutes() {
  if (!isFullSession()) {
    return [];
  }

  return ROUTES.filter((route) => hasModule(route.module));
}

function renderLoading(message = "Loading data...") {
  app.innerHTML = `<div class="loading">${escapeHtml(message)}</div>`;
}

function pageFrame(title, copy, content, eyebrow = "OpenMarket") {
  return `
    <section class="stack">
      <div class="hero-panel">
        <div class="stack">
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
          <h1 class="page-title">${escapeHtml(title)}</h1>
          ${copy ? `<p class="hero-copy">${escapeHtml(copy)}</p>` : ""}
        </div>
      </div>
      ${content}
    </section>
  `;
}

function renderNav() {
  nav.innerHTML = visibleRoutes()
    .map((route) => {
      const active = state.route === route.path ? " active" : "";
      return `<a href="${route.path}" class="nav-link${active}" data-link>${iconMarkup(route.module, "nav-icon")}<span>${route.label}</span></a>`;
    })
    .join("");

  const authLabel = state.session.authenticated
    ? `${escapeHtml(state.session.user.display_name)} | ${escapeHtml(
        isStockOnlySession() ? "stock check" : state.session.user.role
      )}`
    : "Guest session";

  const actionButtons = [];

  if (state.session.authenticated) {
    actionButtons.push('<button class="button button-secondary" type="button" data-action="refresh-page">Refresh Data</button>');
  }

  if (!state.session.authenticated) {
    actionButtons.push('<a href="/login" class="button button-primary" data-link>Login / Register new account</a>');
  }

  if (isFullSession()) {
    actionButtons.push('<button class="button button-ghost" type="button" data-action="lock-app">Lock App</button>');
  }

  if (state.session.authenticated) {
    actionButtons.push(
      `<button class="button button-danger" type="button" data-action="logout">${
        isStockOnlySession() ? "End Stock Check" : "Logout"
      }</button>`
    );
  }

  actions.innerHTML = `
    <div class="action-cluster">
      <span class="role-pill">${authLabel}</span>
      ${actionButtons.length ? `<div class="action-group">${actionButtons.join("")}</div>` : ""}
    </div>
  `;

  const refreshButton = actions.querySelector('[data-action="refresh-page"]');
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      renderRoute();
    });
  }

  const lockButton = actions.querySelector('[data-action="lock-app"]');
  if (lockButton) {
    lockButton.addEventListener("click", async () => {
      try {
        await api("/api/auth/logout", { method: "POST" });
        await refreshSession();
        setBanner("Application locked.", "success");
        navigate("/stock-access", true);
      } catch (error) {
        setBanner(error.message || "Lock action failed.", "error");
      }
    });
  }

  const logoutButton = actions.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        const wasStockSession = isStockOnlySession();
        await api("/api/auth/logout", { method: "POST" });
        await refreshSession();
        setBanner(wasStockSession ? "Stock check closed." : "Logged out.", "success");
        navigate("/login", true);
      } catch (error) {
        setBanner(error.message || "Logout failed.", "error");
      }
    });
  }
}

async function renderLoginPage() {
  if (isStockOnlySession()) {
    navigate("/stock-access", true);
    return;
  }

  if (isFullSession()) {
    navigate(defaultRoute(), true);
    return;
  }

  app.innerHTML = pageFrame(
    "Login / Register new account",
    "Access your account or create a new client account.",
    `
      <section class="split-grid">
        <div class="form-card">
          <h2 class="section-title">Login</h2>
          <form id="login-form" class="stack">
            <div class="field-grid">
              <div class="field">
                <label>Username</label>
                <input name="username" required autocomplete="username" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" required autocomplete="current-password" />
              </div>
            </div>
            <button class="button button-primary" type="submit">Login</button>
          </form>
        </div>

        <div class="form-card">
          <h2 class="section-title">Create Account</h2>
          <form id="register-form" class="stack">
            <div class="field-grid">
              <div class="field">
                <label>First Name</label>
                <input name="first_name" required minlength="2" autocomplete="given-name" />
              </div>
              <div class="field">
                <label>Last Name</label>
                <input name="last_name" required minlength="2" autocomplete="family-name" />
              </div>
              <div class="field">
                <label>Email</label>
                <input name="email" type="email" required autocomplete="email" />
              </div>
              <div class="field">
                <label>Phone</label>
                <input name="phone" autocomplete="tel" />
              </div>
              <div class="field">
                <label>Username</label>
                <input name="username" required minlength="3" autocomplete="username" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" required minlength="8" autocomplete="new-password" />
              </div>
              <div class="field">
                <label>Confirm Password</label>
                <input name="confirm_password" type="password" required minlength="8" autocomplete="new-password" />
              </div>
            </div>
            <button class="button button-primary" type="submit">Create Client Account</button>
          </form>
        </div>
      </section>
    `
  );

  bindJsonForm(
    "login-form",
    "/api/auth/login",
    (form) => ({
      username: form.get("username"),
      password: form.get("password"),
    }),
    "Login successful.",
    async () => {
      await refreshSession();
      navigate(defaultRoute(), true);
    }
  );

  bindJsonForm(
    "register-form",
    "/api/auth/register",
    (form) => {
      const password = String(form.get("password") || "");
      const confirmPassword = String(form.get("confirm_password") || "");
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      return {
        first_name: form.get("first_name"),
        last_name: form.get("last_name"),
        email: form.get("email"),
        phone: form.get("phone"),
        username: form.get("username"),
        password,
      };
    },
    "Account created.",
    async () => {
      await refreshSession();
      navigate(defaultRoute(), true);
    }
  );
}

function stockCheckResultMarkup(data) {
  return createTable(
    ["ID", "Product", "Brand", "Category", "Stock", "Added"],
    data.products.map(
      (row) => `
        <td>#${escapeHtml(row.product_id)}</td>
        <td>${escapeHtml(row.product_name)}</td>
        <td>${escapeHtml(row.brand || "N/A")}</td>
        <td>${escapeHtml(row.category || "N/A")}</td>
        <td>${escapeHtml(row.stock)}</td>
        <td>${formatDate(row.date_added)}</td>
      `
    )
  );
}

async function renderAccountPage() {
  const modules = state.session.modules.length
    ? state.session.modules
    : [{ key: "account", label: "My Account", route: "/account" }];

  app.innerHTML = pageFrame(
    "My Account",
    "Review your customer profile and the sections available to this account.",
    `
      <section class="dashboard-grid">
        <div class="card stack">
          ${sectionHeader("Account Details", "Your client account is active and ready to use.", "account")}
          <div class="metric-grid">
            ${metricCard("Name", state.session.user?.display_name || "Client")}
            ${metricCard("Username", state.session.user?.username || "N/A")}
            ${metricCard("Role", state.session.user?.role || "client")}
          </div>
        </div>

        <div class="card stack">
          ${sectionHeader("Access Scope", "This account is limited to customer-facing sections.", "dashboard")}
          ${renderAccessCards(modules)}
        </div>
      </section>
    `
  );
}

async function renderStockAccessPage() {
  const stockAccessEnabled = hasModule("stock_check");
  const stockData = stockAccessEnabled ? await api("/api/stock-check") : { query: "", products: [] };

  app.innerHTML = pageFrame(
    "Stock Check",
    stockAccessEnabled
      ? "Verify product availability without opening additional modules."
      : "Enter your employee access code to open stock verification.",
    `
      <section class="split-grid">
        ${
          stockAccessEnabled
            ? `
              <div class="form-card">
                <h2 class="section-title">Find Product Stock</h2>
                <form id="stock-search-form" class="stack">
                  <div class="field-grid">
                    <div class="field">
                      <label>Search</label>
                      <input name="q" placeholder="Product name, brand, category, or product ID" value="${escapeHtml(stockData.query || "")}" />
                    </div>
                  </div>
                  <button class="button button-primary" type="submit">Search Stock</button>
                </form>
              </div>
            `
            : `
              <div class="form-card">
                <h2 class="section-title">Enter Access Code</h2>
                <form id="stock-access-form" class="stack">
                  <div class="field-grid">
                    <div class="field">
                      <label>Employee Access Code</label>
                      <input name="access_code" type="password" required autocomplete="one-time-code" />
                    </div>
                  </div>
                  <button class="button button-primary" type="submit">Unlock Stock Check</button>
                </form>
              </div>
            `
        }

        <div class="card stack" id="stock-results-card">
          <div>
            <h2 class="section-title">${stockAccessEnabled ? "Stock Results" : "Access Scope"}</h2>
            <p class="subtle">${
              stockAccessEnabled
                ? "This mode is limited to stock verification."
                : "Stock access opens a restricted session limited to stock lookup."
            }</p>
          </div>
          ${stockAccessEnabled ? stockCheckResultMarkup(stockData) : emptyState("No stock session is active.")}
        </div>
      </section>
    `
  );

  if (stockAccessEnabled) {
    const stockSearchForm = document.getElementById("stock-search-form");
    stockSearchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = stockSearchForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;

      try {
        const queryValue = String(new FormData(stockSearchForm).get("q") || "");
        const data = await api(`/api/stock-check?q=${encodeURIComponent(queryValue)}`);
        const resultsCard = document.getElementById("stock-results-card");
        resultsCard.innerHTML = `
          <div>
            <h2 class="section-title">Stock Results</h2>
            <p class="subtle">This mode is limited to stock verification.</p>
          </div>
          ${stockCheckResultMarkup(data)}
        `;
      } catch (error) {
        setBanner(error.message || "Stock lookup failed.", "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  } else {
    bindJsonForm(
      "stock-access-form",
      "/api/stock-access/login",
      (form) => ({
        access_code: form.get("access_code"),
      }),
      "Stock access enabled.",
      async () => {
        await refreshSession();
        navigate("/stock-access", true);
      }
    );
  }
}

async function renderOverviewPage() {
  const data = await api("/api/overview");
  const accessModules = state.session.modules.length ? state.session.modules : data.access_profile?.modules || [];

  app.innerHTML = pageFrame(
    "Operations Overview",
    "Monitor the live state of products, orders, service activity, and business performance.",
    `
      <section class="metric-grid">
        ${metricCard("Customers", String(data.metrics.customers), "Registered customer records")}
        ${metricCard("Products", String(data.metrics.products), "Active catalog items")}
        ${metricCard("Orders", String(data.metrics.orders), "Sales orders recorded")}
        ${metricCard("Suppliers", String(data.metrics.suppliers), "Supply partners")}
        ${metricCard("Employees", String(data.metrics.employees), "Employee records")}
        ${metricCard("Open Service", String(data.metrics.open_service_cases), "Cases not yet resolved")}
        ${data.can_view_financials ? metricCard("Revenue", formatCurrency(data.metrics.revenue), "Total earnings") : ""}
        ${data.can_view_financials ? metricCard("Net Profit", formatCurrency(data.metrics.profit), "Revenue minus expenses") : ""}
      </section>

      <section class="dashboard-grid">
        <div class="card stack">
          ${sectionHeader("Access Profile", "Visible sections are filtered by your employee permissions.", "account")}
          ${renderAccessCards(accessModules)}
        </div>

        <div class="card stack">
          ${sectionHeader("Recent Orders", "Latest order activity and delivery progress.", "orders")}
          ${createTable(
            ["Order", "Customer", "Employee", "Status", "Total", "Date"],
            data.recent_orders.map(
              (row) => `
                <td>#${escapeHtml(row.order_id)}</td>
                <td>${escapeHtml(row.customer_name)}</td>
                <td>${escapeHtml(row.employee_name)}</td>
                <td>${createStatusPill(row.order_status)}</td>
                <td>${formatCurrency(row.total_value)}</td>
                <td>${formatDate(row.order_date)}</td>
              `
            )
          )}
        </div>
      </section>

      <section class="dashboard-grid">
        <div class="card stack">
          ${sectionHeader("Low Stock Products", "Products at or below the alert threshold of five units.", "alert")}
          <div class="product-grid">
            ${
              data.low_stock_products.length
                ? data.low_stock_products
                    .map(
                      (product) => `
                        <article class="product-card is-alert stack">
                          <div class="alert-row">
                            <div class="alert-note">${iconMarkup("alert", "alert-icon")}Low stock</div>
                            <span class="status-pill warning"><span class="status-dot"></span>Action required</span>
                          </div>
                          <div>
                            <h3>${escapeHtml(product.product_name)}</h3>
                            <div class="subtle">Product #${escapeHtml(product.product_id)}</div>
                          </div>
                          <div class="product-meta">
                            <span>${escapeHtml(product.brand || "No brand")}</span>
                            <span>${escapeHtml(product.category || "No category")}</span>
                          </div>
                          <div class="chip-row">
                            <span class="tag tag-warning">Stock ${escapeHtml(product.stock)}</span>
                            <span class="tag">${formatCurrency(product.sale_price)}</span>
                          </div>
                          <a href="/products" class="button button-secondary button-small" data-link>View product</a>
                        </article>
                      `
                    )
                    .join("")
                : emptyState("Stock coverage is healthy across the catalog.")
            }
          </div>
        </div>

        <div class="card stack">
          ${sectionHeader("Recent Service Cases", "Latest product service activity linked to customers and products.", "service")}
          ${createTable(
            ["Case", "Customer", "Product", "Status", "Received"],
            data.service_cases.map(
              (row) => `
                <td>#${escapeHtml(row.service_id)}</td>
                <td>${escapeHtml(row.customer_name)}</td>
                <td>${escapeHtml(row.product_name)}</td>
                <td>${createStatusPill(row.service_status)}</td>
                <td>${formatDate(row.received_date)}</td>
              `
            )
          )}
        </div>
      </section>

      ${
        data.can_view_financials
          ? `
            <section class="card stack">
              ${sectionHeader("Monthly Profit Snapshot", "Most recent monthly performance summary.", "finance")}
              ${createTable(
                ["Period", "Earnings", "Expenses", "Net"],
                data.monthly_profit.map(
                  (row) => `
                    <td>${escapeHtml(`${row.month}/${row.year}`)}</td>
                    <td>${formatCurrency(row.total_earnings)}</td>
                    <td>${formatCurrency(row.total_expenses)}</td>
                    <td>${formatCurrency(row.net_profit)}</td>
                  `
                )
              )}
            </section>
          `
          : ""
      }
    `
  );
}

async function renderRoute() {
  state.loading = true;
  renderLoading();
  renderBanner();

  try {
    const pathname = window.location.pathname;

    if (pathname === "/login") {
      await renderLoginPage();
      return;
    }

    if (pathname === "/stock-access") {
      await renderStockAccessPage();
      return;
    }

    if (!state.session.authenticated) {
      navigate("/login", true);
      return;
    }

    if (isStockOnlySession()) {
      navigate("/stock-access", true);
      return;
    }

    const route = ROUTES.find((entry) => entry.path === pathname);
    if (!route || !hasModule(route.module)) {
      navigate(defaultRoute(), true);
      return;
    }

    switch (pathname) {
      case "/account":
        await renderAccountPage();
        break;
      case "/":
        await renderOverviewPage();
        break;
      case "/products":
        await renderProductsPage();
        break;
      case "/customers":
        await renderCustomersPage();
        break;
      case "/orders":
        await renderOrdersPage();
        break;
      case "/suppliers":
        await renderSuppliersPage();
        break;
      case "/employees":
        await renderEmployeesPage();
        break;
      case "/service":
        await renderServicePage();
        break;
      case "/finance":
        await renderFinancePage();
        break;
      default:
        navigate(defaultRoute(), true);
        return;
    }
  } catch (error) {
    app.innerHTML = emptyState(error.message || "The page could not be loaded.");
    setBanner(error.message || "Page load failed.", "error");
  } finally {
    state.loading = false;
  }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-link]");
  if (!link) {
    return;
  }
  event.preventDefault();
  navigate(link.getAttribute("href"));
});

window.addEventListener("popstate", () => {
  state.route = window.location.pathname;
  renderNav();
  renderRoute();
});

document.addEventListener("DOMContentLoaded", () => {
  state.route = window.location.pathname;
  refreshSession()
    .catch(() => {
      state.session = {
        authenticated: false,
        session_scope: "guest",
        user: null,
        can_view_financials: false,
        modules: [],
      };
    })
    .finally(() => {
      renderNav();
      renderRoute();
    });
});
