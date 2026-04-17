const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { hashPassword, verifyPassword } = require("../auth/passwords");
const { RUNTIME_DIR } = require("../config");

function currentDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function resetIdentity(executor, tableName, columnName) {
  await executor.query(
    `
      SELECT setval(
        pg_get_serial_sequence($1, $2),
        COALESCE((SELECT MAX(${columnName}) FROM ${tableName}), 1),
        true
      )
    `,
    [tableName, columnName]
  );
}

async function seedDatabase(executor) {
  const query = executor.query.bind(executor);

  await query(`
    INSERT INTO public.leave_types (leave_type_id, code, name)
    VALUES
      (1, 'VAC', 'Vacation'),
      (2, 'SICK', 'Sick Leave'),
      (3, 'PERS', 'Personal Leave');
  `);

  await query(`
    INSERT INTO public.customers (
      customer_id,
      last_name,
      first_name,
      phone,
      email,
      address,
      city,
      county,
      postal_code,
      registration_date
    )
    VALUES
      (1, 'Carter', 'Emma', '+40 721 000 101', 'emma.carter@marketonline.test', '12 River Street', 'Cluj-Napoca', 'Cluj', '400001', '${currentDate(-120)}'),
      (2, 'Ionescu', 'Radu', '+40 722 000 202', 'radu.ionescu@marketonline.test', '8 Green Avenue', 'Bucharest', 'Bucharest', '010011', '${currentDate(-90)}'),
      (3, 'Marin', 'Elena', '+40 723 000 303', 'elena.marin@marketonline.test', '24 Central Blvd', 'Iasi', 'Iasi', '700100', '${currentDate(-60)}'),
      (4, 'Pop', 'Daniel', '+40 724 000 404', 'daniel.pop@marketonline.test', '31 Liberty Square', 'Timisoara', 'Timis', '300010', '${currentDate(-30)}');
  `);

  await query(`
    INSERT INTO public.employees (
      employee_id,
      last_name,
      first_name,
      job_title,
      phone,
      email,
      salary,
      hire_date
    )
    VALUES
      (1, 'Reed', 'Jonah', 'Operations Manager', '+40 731 100 111', 'jonah.reed@marketonline.test', 7200, '${currentDate(-700)}'),
      (2, 'Bloom', 'Nadia', 'Sales Specialist', '+40 731 100 222', 'nadia.bloom@marketonline.test', 5100, '${currentDate(-420)}'),
      (3, 'Vale', 'Marcus', 'Service Technician', '+40 731 100 333', 'marcus.vale@marketonline.test', 5600, '${currentDate(-360)}'),
      (4, 'North', 'Priya', 'Finance Lead', '+40 731 100 444', 'priya.north@marketonline.test', 8400, '${currentDate(-820)}');
  `);

  await query(`
    INSERT INTO public.suppliers (
      supplier_id,
      company_name,
      contact_person,
      phone,
      email,
      address
    )
    VALUES
      (1, 'North Distribution', 'Adrian Ilie', '+40 741 100 100', 'contact@northdistribution.test', '91 Logistic Park, Bucharest'),
      (2, 'Pixel Source', 'Irina Stan', '+40 742 200 200', 'sales@pixelsource.test', '22 Industrial Road, Cluj-Napoca'),
      (3, 'Nova Warehousing', 'Mihai Ene', '+40 743 300 300', 'office@novawarehousing.test', '6 Supply Street, Brasov');
  `);

  await query(`
    INSERT INTO public.products (
      product_id,
      product_name,
      brand,
      product_type,
      category,
      sale_price,
      stock,
      description,
      date_added
    )
    VALUES
      (1, 'Atlas Laptop Stand', 'NordicForm', 'Accessory', 'Office', 199.99, 14, 'Adjustable aluminum laptop stand for hybrid desks.', '${currentDate(-75)}'),
      (2, 'Nova Wireless Mouse', 'NovaTech', 'Peripheral', 'Electronics', 129.50, 22, 'Ergonomic wireless mouse with silent clicks.', '${currentDate(-65)}'),
      (3, 'Quartz Monitor Light', 'Lumio', 'Lighting', 'Office', 249.00, 8, 'USB-powered monitor light bar with dimming control.', '${currentDate(-54)}'),
      (4, 'Orbit Docking Station', 'CoreDock', 'Peripheral', 'Electronics', 389.00, 5, '11-port USB-C docking station for professional workspaces.', '${currentDate(-45)}'),
      (5, 'Craft Notebook Set', 'PaperGrid', 'Stationery', 'Office', 49.90, 36, 'Set of three premium notebooks for office and study.', '${currentDate(-25)}'),
      (6, 'Pulse Desk Fan', 'AeroPulse', 'Cooling', 'Home Office', 159.00, 3, 'Compact desk fan with quiet airflow and metal frame.', '${currentDate(-12)}');
  `);

  await query(`
    INSERT INTO public.supplier_offers (
      offer_id,
      supplier_id,
      product_id,
      available_quantity,
      purchase_price
    )
    VALUES
      (1, 1, 1, 80, 122.00),
      (2, 2, 2, 120, 74.00),
      (3, 2, 4, 40, 255.00),
      (4, 3, 3, 60, 164.00),
      (5, 1, 5, 200, 24.00),
      (6, 3, 6, 35, 96.00);
  `);

  await query(`
    INSERT INTO public.supplies (
      supply_id,
      supplier_id,
      product_id,
      quantity,
      purchase_price,
      supply_date
    )
    VALUES
      (1, 1, 1, 30, 120.00, '${currentDate(-40)}'),
      (2, 2, 2, 40, 72.00, '${currentDate(-35)}'),
      (3, 3, 3, 20, 160.00, '${currentDate(-28)}'),
      (4, 2, 4, 12, 252.00, '${currentDate(-21)}'),
      (5, 1, 5, 60, 22.00, '${currentDate(-18)}'),
      (6, 3, 6, 15, 94.00, '${currentDate(-10)}');
  `);

  await query(`
    INSERT INTO public.expenses (
      expense_id,
      expense_type,
      description,
      amount,
      expense_date,
      supplier_id,
      supply_id,
      employee_id
    )
    VALUES
      (1, 'Inventory Supply', 'North Distribution stock replenishment', 3600.00, '${currentDate(-40)}', 1, 1, NULL),
      (2, 'Inventory Supply', 'Pixel Source mouse inventory batch', 2880.00, '${currentDate(-35)}', 2, 2, NULL),
      (3, 'Inventory Supply', 'Nova Warehousing lighting batch', 3200.00, '${currentDate(-28)}', 3, 3, NULL),
      (4, 'Logistics', 'Warehouse handling and packaging', 950.00, '${currentDate(-8)}', NULL, NULL, 1),
      (5, 'Maintenance', 'Service bench calibration', 420.00, '${currentDate(-4)}', NULL, NULL, 3);
  `);

  await query(`
    INSERT INTO public.orders (
      order_id,
      customer_id,
      employee_id,
      order_date,
      order_status,
      total_value
    )
    VALUES
      (1, 1, 2, '${currentDate(-20)}', 'Delivered', 458.99),
      (2, 2, 2, '${currentDate(-12)}', 'In Transit', 518.50),
      (3, 3, 1, '${currentDate(-6)}', 'Processing', 448.90);
  `);

  await query(`
    INSERT INTO public.order_details (
      detail_id,
      order_id,
      product_id,
      quantity,
      unit_price
    )
    VALUES
      (1, 1, 1, 1, 199.99),
      (2, 1, 5, 2, 49.90),
      (3, 1, 6, 1, 159.00),
      (4, 2, 2, 1, 129.50),
      (5, 2, 4, 1, 389.00),
      (6, 3, 3, 1, 249.00),
      (7, 3, 5, 4, 49.90);
  `);

  await query(`
    INSERT INTO public.order_payments (
      payment_id,
      order_id,
      payment_date,
      amount_paid,
      payment_method,
      payment_status
    )
    VALUES
      (1, 1, '${currentDate(-20)}', 458.99, 'Card', 'Paid'),
      (2, 2, '${currentDate(-12)}', 518.50, 'Bank Transfer', 'Paid'),
      (3, 3, '${currentDate(-6)}', 200.00, 'Cash on Delivery', 'Partial');
  `);

  await query(`
    INSERT INTO public.deliveries (
      delivery_id,
      order_id,
      courier_company,
      awb_number,
      delivery_cost,
      delivery_address,
      shipping_date,
      delivery_date,
      delivery_status
    )
    VALUES
      (1, 1, 'FastCourier', 'AWB0001001', 24.00, '12 River Street, Cluj-Napoca', '${currentDate(-19)}', '${currentDate(-17)}', 'Delivered'),
      (2, 2, 'FastCourier', 'AWB0001002', 26.00, '8 Green Avenue, Bucharest', '${currentDate(-11)}', NULL, 'In Transit'),
      (3, 3, 'LocalExpress', 'AWB0001003', 19.00, '24 Central Blvd, Iasi', '${currentDate(-5)}', NULL, 'Prepared');
  `);

  await query(`
    INSERT INTO public.earnings (
      earning_id,
      order_id,
      revenue,
      cost,
      profit,
      record_date
    )
    VALUES
      (1, 1, 458.99, 260.00, 198.99, '${currentDate(-20)}'),
      (2, 2, 518.50, 329.00, 189.50, '${currentDate(-12)}'),
      (3, 3, 448.90, 238.00, 210.90, '${currentDate(-6)}');
  `);

  await query(`
    INSERT INTO public.product_service (
      service_id,
      customer_id,
      product_id,
      order_id,
      employee_id,
      received_date,
      reported_issue,
      diagnosis,
      service_status,
      solution,
      resolved_date
    )
    VALUES
      (1, 1, 1, 1, 3, '${currentDate(-9)}', 'Stand hinge feels too loose after daily use.', 'Top joint screw tension dropped below target.', 'Resolved', 'Recalibrated hinge and replaced top screw set.', '${currentDate(-7)}'),
      (2, 2, 4, 2, 3, '${currentDate(-3)}', 'Docking station loses external display signal.', 'Firmware mismatch on video controller.', 'In Progress', 'Firmware update scheduled for technician validation.', NULL);
  `);

  await query(`
    INSERT INTO public.employee_leaves (
      leave_id,
      employee_id,
      leave_type,
      start_date,
      end_date,
      reason,
      status
    )
    VALUES
      (1, 2, 'VAC', '${currentDate(14)}', '${currentDate(18)}', 'Planned annual leave.', 'Approved'),
      (2, 3, 'PERS', '${currentDate(7)}', '${currentDate(7)}', 'Personal appointment.', 'Pending');
  `);

  await query(`
    INSERT INTO public.employee_resignations (
      resignation_id,
      employee_id,
      resignation_date,
      notice_period_days,
      reason,
      status
    )
    VALUES
      (1, 4, '${currentDate(-15)}', 30, 'Transitioning to consulting work.', 'Notice Period');
  `);

  await query(`
    INSERT INTO public.monthly_profit (
      profit_id,
      month,
      year,
      total_earnings,
      total_expenses,
      net_profit,
      average_earnings,
      average_expenses,
      calculation_date
    )
    VALUES
      (
        1,
        EXTRACT(MONTH FROM CURRENT_DATE)::int,
        EXTRACT(YEAR FROM CURRENT_DATE)::int,
        1426.39,
        11050.00,
        -9623.61,
        475.46,
        2210.00,
        CURRENT_DATE
      );
  `);

  await resetIdentity(executor, "public.customers", "customer_id");
  await resetIdentity(executor, "public.employees", "employee_id");
  await resetIdentity(executor, "public.leave_types", "leave_type_id");
  await resetIdentity(executor, "public.suppliers", "supplier_id");
  await resetIdentity(executor, "public.products", "product_id");
  await resetIdentity(executor, "public.orders", "order_id");
  await resetIdentity(executor, "public.order_details", "detail_id");
  await resetIdentity(executor, "public.order_payments", "payment_id");
  await resetIdentity(executor, "public.deliveries", "delivery_id");
  await resetIdentity(executor, "public.earnings", "earning_id");
  await resetIdentity(executor, "public.supplier_offers", "offer_id");
  await resetIdentity(executor, "public.supplies", "supply_id");
  await resetIdentity(executor, "public.expenses", "expense_id");
  await resetIdentity(executor, "public.product_service", "service_id");
  await resetIdentity(executor, "public.employee_leaves", "leave_id");
  await resetIdentity(executor, "public.employee_resignations", "resignation_id");
  await resetIdentity(executor, "public.monthly_profit", "profit_id");
}

const SEEDED_AUTH_USERS = [
  { username: "admin", display_name: "System Admin", role: "admin", employee_key: "operations", stock_access_enabled: true },
  { username: "director", display_name: "Operations Director", role: "director", employee_key: "operations", stock_access_enabled: true },
  { username: "accountant", display_name: "Finance Accountant", role: "accountant", employee_key: "finance", stock_access_enabled: true },
  { username: "staff", display_name: "General Staff", role: "staff", employee_key: "staff", stock_access_enabled: true },
];

function randomPassword() {
  return `Om-${crypto.randomBytes(9).toString("base64url")}!`;
}

function randomAccessCode(usedCodes) {
  let code = "";
  do {
    code = String(crypto.randomInt(0, 100000000)).padStart(8, "0");
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}

function credentialEnvValue(username, field) {
  const envName = `OPENMARKET_${username.toUpperCase()}_${field}`;
  const value = process.env[envName];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function hasSeedPasswordOverrides() {
  return SEEDED_AUTH_USERS.some((account) => Boolean(credentialEnvValue(account.username, "PASSWORD")));
}

function buildCredentialBundle() {
  const usedCodes = new Set();

  return SEEDED_AUTH_USERS.map((account) => {
    const passwordFromEnv = credentialEnvValue(account.username, "PASSWORD");
    const password = passwordFromEnv || randomPassword();
    const accessCode =
      credentialEnvValue(account.username, "ACCESS_CODE") || randomAccessCode(usedCodes);

    return {
      ...account,
      password,
      password_source: passwordFromEnv ? "env" : "generated",
      access_code: accessCode,
      password_hash: hashPassword(password),
      access_code_hash: hashPassword(accessCode),
    };
  });
}

function employeeAssignmentMap(employees) {
  const fallbackEmployeeId = employees[0]?.employee_id || null;
  const operationsEmployeeId = employees[0]?.employee_id || null;
  const financeEmployeeId =
    employees.find((employee) => String(employee.job_title || "").toLowerCase().includes("finance"))?.employee_id ||
    fallbackEmployeeId;
  const staffEmployeeId = employees[1]?.employee_id || fallbackEmployeeId;

  return {
    operations: operationsEmployeeId,
    finance: financeEmployeeId,
    staff: staffEmployeeId,
  };
}

async function writeSeedCredentialsFile(credentials) {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  const outputPath = path.join(RUNTIME_DIR, "initial-access.json");

  const payload = {
    generated_at: new Date().toISOString(),
    note: "Local-only bootstrap credentials. This file is not served by the frontend.",
    accounts: credentials.map((account) => ({
      username: account.username,
      display_name: account.display_name,
      role: account.role,
      password: account.password,
      stock_access_code: account.access_code,
      stock_access_enabled: account.stock_access_enabled,
    })),
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`OpenMarket credentials written to ${outputPath}`);
}

function logSeedAccountSummary(credentials, mode) {
  const summary = credentials
    .map((account) => `${account.username}:${account.role}:${account.password_source}`)
    .join(", ");

  console.log(`OpenMarket bootstrap accounts ${mode}: ${summary}`);
}

async function upsertSeededAuthUsers(executor, credentials, employeeMap) {
  const query = executor.query.bind(executor);

  for (const account of credentials) {
    await query(
      `
        INSERT INTO public.app_users (
          username,
          display_name,
          role,
          password_hash,
          access_code_hash,
          employee_id,
          stock_access_enabled,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW())
        ON CONFLICT (username)
        DO UPDATE
        SET display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            password_hash = EXCLUDED.password_hash,
            access_code_hash = EXCLUDED.access_code_hash,
            employee_id = COALESCE(EXCLUDED.employee_id, app_users.employee_id),
            stock_access_enabled = EXCLUDED.stock_access_enabled,
            is_active = TRUE,
            updated_at = NOW()
      `,
      [
        account.username,
        account.display_name,
        account.role,
        account.password_hash,
        account.access_code_hash,
        employeeMap[account.employee_key] || null,
        account.stock_access_enabled,
      ]
    );
  }
}

function requiresSeedCredentialRefresh(existingRows) {
  const existingByUsername = new Map(existingRows.map((row) => [String(row.username || "").toLowerCase(), row]));
  const hasOverrides = hasSeedPasswordOverrides();

  if (hasOverrides) {
    return SEEDED_AUTH_USERS.some((account) => {
      const row = existingByUsername.get(account.username);
      const passwordOverride = credentialEnvValue(account.username, "PASSWORD");
      if (!row || !passwordOverride) {
        return !row;
      }

      return !verifyPassword(passwordOverride, row.password_hash);
    });
  }

  if (!existingRows.length) {
    return true;
  }

  const distinctPasswordHashes = new Set(existingRows.map((row) => row.password_hash).filter(Boolean));
  return (
    existingRows.length < SEEDED_AUTH_USERS.length ||
    distinctPasswordHashes.size < existingRows.length ||
    existingRows.some((row) => !row.access_code_hash || !row.stock_access_enabled)
  );
}

async function ensureSeededAuthUsers(executor) {
  const query = executor.query.bind(executor);
  const employeesResult = await query(`
    SELECT employee_id, job_title
    FROM public.employees
    ORDER BY employee_id ASC
  `);

  const existingResult = await query(
    `
      SELECT username, password_hash, access_code_hash, stock_access_enabled
      FROM public.app_users
      WHERE username = ANY($1::text[])
      ORDER BY username ASC
    `,
    [SEEDED_AUTH_USERS.map((account) => account.username)]
  );

  if (!requiresSeedCredentialRefresh(existingResult.rows)) {
    return null;
  }

  const credentials = buildCredentialBundle();
  await upsertSeededAuthUsers(executor, credentials, employeeAssignmentMap(employeesResult.rows));
  logSeedAccountSummary(credentials, existingResult.rows.length ? "updated" : "created");
  return credentials;
}

module.exports = {
  seedDatabase,
  ensureSeededAuthUsers,
  writeSeedCredentialsFile,
};
