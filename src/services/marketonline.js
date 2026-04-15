const { query, withTransaction } = require("../db/client");
const { HttpError } = require("../utils/errors");
const { trimString, parseMoney, parseStock, parseDateInput, toNumber } = require("../utils/values");
const { accessibleModules, canViewFinancials, requireFinancialAccess, requireStockCheckAccess } = require("./auth");

function toInt(value, message) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new HttpError(400, message);
  }
  return numeric;
}

function toOptionalInt(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return toInt(value, "Expected a valid positive integer.");
}

function normalizeStatus(value, fallback) {
  const normalized = trimString(value);
  return normalized || fallback;
}

async function getEntityById(tableName, idColumn, idValue, executor = { query }) {
  const result = await executor.query(`SELECT * FROM ${tableName} WHERE ${idColumn} = $1 LIMIT 1`, [idValue]);
  return result.rows[0] || null;
}

async function estimateUnitCost(productId, executor = { query }) {
  const result = await executor.query(
    `
      SELECT
        COALESCE(
          (SELECT AVG(purchase_price)::numeric(10,2) FROM public.supplies WHERE product_id = $1),
          (SELECT AVG(purchase_price)::numeric(10,2) FROM public.supplier_offers WHERE product_id = $1)
        ) AS average_cost
    `,
    [productId]
  );
  return toNumber(result.rows[0]?.average_cost) || null;
}

async function recomputeMonthlyProfit(targetDate, executor = { query }) {
  const year = new Date(targetDate).getUTCFullYear();
  const month = new Date(targetDate).getUTCMonth() + 1;

  const totalsResult = await executor.query(
    `
      SELECT
        COALESCE(
          (
            SELECT SUM(revenue)::numeric(12,2)
            FROM public.earnings
            WHERE EXTRACT(MONTH FROM record_date) = $1
              AND EXTRACT(YEAR FROM record_date) = $2
          ),
          0
        ) AS total_earnings,
        COALESCE(
          (
            SELECT SUM(amount)::numeric(12,2)
            FROM public.expenses
            WHERE EXTRACT(MONTH FROM expense_date) = $1
              AND EXTRACT(YEAR FROM expense_date) = $2
          ),
          0
        ) AS total_expenses,
        COALESCE(
          (
            SELECT AVG(revenue)::numeric(12,2)
            FROM public.earnings
            WHERE EXTRACT(MONTH FROM record_date) = $1
              AND EXTRACT(YEAR FROM record_date) = $2
          ),
          0
        ) AS average_earnings,
        COALESCE(
          (
            SELECT AVG(amount)::numeric(12,2)
            FROM public.expenses
            WHERE EXTRACT(MONTH FROM expense_date) = $1
              AND EXTRACT(YEAR FROM expense_date) = $2
          ),
          0
        ) AS average_expenses
    `,
    [month, year]
  );

  const totals = totalsResult.rows[0];
  const totalEarnings = toNumber(totals.total_earnings) || 0;
  const totalExpenses = toNumber(totals.total_expenses) || 0;
  const averageEarnings = toNumber(totals.average_earnings) || 0;
  const averageExpenses = toNumber(totals.average_expenses) || 0;

  await executor.query(
    `
      INSERT INTO public.monthly_profit (
        month,
        year,
        total_earnings,
        total_expenses,
        net_profit,
        average_earnings,
        average_expenses,
        calculation_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
      ON CONFLICT (month, year)
      DO UPDATE
      SET total_earnings = EXCLUDED.total_earnings,
          total_expenses = EXCLUDED.total_expenses,
          net_profit = EXCLUDED.net_profit,
          average_earnings = EXCLUDED.average_earnings,
          average_expenses = EXCLUDED.average_expenses,
          calculation_date = CURRENT_DATE
    `,
    [
      month,
      year,
      totalEarnings,
      totalExpenses,
      Number((totalEarnings - totalExpenses).toFixed(2)),
      averageEarnings,
      averageExpenses,
    ]
  );
}

async function getOverviewData(user) {
  const [metricsResult, recentOrdersResult, lowStockResult, serviceResult, monthlyProfitResult] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.customers) AS customers,
        (SELECT COUNT(*)::int FROM public.products) AS products,
        (SELECT COUNT(*)::int FROM public.orders) AS orders,
        (SELECT COUNT(*)::int FROM public.suppliers) AS suppliers,
        (SELECT COUNT(*)::int FROM public.employees) AS employees,
        (SELECT COUNT(*)::int FROM public.product_service WHERE COALESCE(service_status, '') NOT ILIKE 'resolved') AS open_service_cases,
        (SELECT COALESCE(SUM(revenue), 0)::numeric(12,2) FROM public.earnings) AS revenue,
        (SELECT COALESCE(SUM(amount), 0)::numeric(12,2) FROM public.expenses) AS expenses
    `),
    query(`
      SELECT
        orders.order_id,
        orders.order_date,
        orders.order_status,
        orders.total_value,
        CONCAT(customers.first_name, ' ', customers.last_name) AS customer_name,
        CONCAT(employees.first_name, ' ', employees.last_name) AS employee_name
      FROM public.orders
      JOIN public.customers ON customers.customer_id = orders.customer_id
      JOIN public.employees ON employees.employee_id = orders.employee_id
      ORDER BY orders.order_date DESC, orders.order_id DESC
      LIMIT 6
    `),
    query(`
      SELECT
        product_id,
        product_name,
        brand,
        category,
        stock,
        sale_price
      FROM public.products
      WHERE stock <= 5
      ORDER BY stock ASC, product_name ASC
      LIMIT 8
    `),
    query(`
      SELECT
        product_service.service_id,
        product_service.service_status,
        product_service.received_date,
        products.product_name,
        CONCAT(customers.first_name, ' ', customers.last_name) AS customer_name
      FROM public.product_service
      JOIN public.products ON products.product_id = product_service.product_id
      JOIN public.customers ON customers.customer_id = product_service.customer_id
      ORDER BY product_service.received_date DESC, product_service.service_id DESC
      LIMIT 6
    `),
    query(`
      SELECT *
      FROM public.monthly_profit
      ORDER BY year DESC, month DESC
      LIMIT 6
    `),
  ]);

  const metrics = metricsResult.rows[0];
  const financialAccess = canViewFinancials(user);
  const revenue = toNumber(metrics.revenue) || 0;
  const expenses = toNumber(metrics.expenses) || 0;

  return {
    can_view_financials: financialAccess,
    access_profile: {
      session_scope: user?.session_scope || "guest",
      modules: accessibleModules(user),
    },
    metrics: {
      customers: metrics.customers,
      products: metrics.products,
      orders: metrics.orders,
      suppliers: metrics.suppliers,
      employees: metrics.employees,
      open_service_cases: metrics.open_service_cases,
      revenue: financialAccess ? revenue : null,
      expenses: financialAccess ? expenses : null,
      profit: financialAccess ? Number((revenue - expenses).toFixed(2)) : null,
    },
    recent_orders: recentOrdersResult.rows.map((row) => ({
      ...row,
      total_value: toNumber(row.total_value) || 0,
    })),
    low_stock_products: lowStockResult.rows.map((row) => ({
      ...row,
      sale_price: toNumber(row.sale_price) || 0,
    })),
    service_cases: serviceResult.rows,
    monthly_profit: financialAccess
      ? monthlyProfitResult.rows.map((row) => ({
          ...row,
          total_earnings: toNumber(row.total_earnings) || 0,
          total_expenses: toNumber(row.total_expenses) || 0,
          net_profit: toNumber(row.net_profit) || 0,
          average_earnings: toNumber(row.average_earnings) || 0,
          average_expenses: toNumber(row.average_expenses) || 0,
        }))
      : [],
  };
}

async function getStockCheckData(user, searchText) {
  requireStockCheckAccess(user);

  const normalizedSearch = trimString(searchText);
  const filters = [];
  const params = [];

  if (normalizedSearch) {
    params.push(`%${normalizedSearch.toLowerCase()}%`);
    filters.push(`(
      LOWER(product_name) LIKE $${params.length}
      OR LOWER(COALESCE(brand, '')) LIKE $${params.length}
      OR LOWER(COALESCE(category, '')) LIKE $${params.length}
      OR CAST(product_id AS TEXT) = $${params.length + 1}
    )`);
    params.push(normalizedSearch);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await query(
    `
      SELECT
        product_id,
        product_name,
        brand,
        category,
        stock,
        date_added
      FROM public.products
      ${whereClause}
      ORDER BY stock ASC, product_name ASC
      LIMIT 30
    `,
    params
  );

  return {
    query: normalizedSearch,
    products: result.rows,
  };
}

async function getProductsData() {
  const [productsResult, categorySummaryResult] = await Promise.all([
    query(`
      SELECT
        product_id,
        product_name,
        brand,
        product_type,
        category,
        sale_price,
        stock,
        description,
        date_added
      FROM public.products
      ORDER BY date_added DESC, product_name ASC
    `),
    query(`
      SELECT
        category,
        COUNT(*)::int AS product_count,
        COALESCE(SUM(stock), 0)::int AS total_stock
      FROM public.products
      GROUP BY category
      ORDER BY category ASC
    `),
  ]);

  return {
    products: productsResult.rows.map((row) => ({
      ...row,
      sale_price: toNumber(row.sale_price) || 0,
    })),
    category_summary: categorySummaryResult.rows,
  };
}

async function createProduct(payload) {
  const productName = trimString(payload.product_name);
  const brand = trimString(payload.brand);
  const productType = trimString(payload.product_type);
  const category = trimString(payload.category);
  const description = trimString(payload.description);
  const salePrice = parseMoney(payload.sale_price);
  const stock = parseStock(payload.stock);

  if (productName.length < 3) {
    throw new HttpError(400, "Product name must contain at least 3 characters.");
  }
  if (category.length < 2) {
    throw new HttpError(400, "Category must contain at least 2 characters.");
  }

  const result = await query(
    `
      INSERT INTO public.products (
        product_name,
        brand,
        product_type,
        category,
        sale_price,
        stock,
        description,
        date_added
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE))
      RETURNING *
    `,
    [productName, brand, productType, category, salePrice, stock, description, parseDateInput(payload.date_added)]
  );

  return {
    ...result.rows[0],
    sale_price: toNumber(result.rows[0].sale_price) || 0,
  };
}

async function getCustomersData() {
  const result = await query(`
    SELECT
      customers.*,
      COALESCE(order_counts.total_orders, 0)::int AS total_orders,
      COALESCE(service_counts.service_cases, 0)::int AS service_cases
    FROM public.customers
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS total_orders
      FROM public.orders
      GROUP BY customer_id
    ) AS order_counts ON order_counts.customer_id = customers.customer_id
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS service_cases
      FROM public.product_service
      GROUP BY customer_id
    ) AS service_counts ON service_counts.customer_id = customers.customer_id
    ORDER BY customers.registration_date DESC, customers.last_name ASC
  `);

  return {
    customers: result.rows,
  };
}

async function createCustomer(payload) {
  const firstName = trimString(payload.first_name);
  const lastName = trimString(payload.last_name);
  const phone = trimString(payload.phone);
  const email = trimString(payload.email);
  const address = trimString(payload.address);
  const city = trimString(payload.city);
  const county = trimString(payload.county);
  const postalCode = trimString(payload.postal_code);

  if (firstName.length < 2 || lastName.length < 2) {
    throw new HttpError(400, "Customer first name and last name must contain at least 2 characters.");
  }

  const result = await query(
    `
      INSERT INTO public.customers (
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE))
      RETURNING *
    `,
    [lastName, firstName, phone, email, address, city, county, postalCode, parseDateInput(payload.registration_date)]
  );

  return result.rows[0];
}

async function getOrdersData() {
  const [ordersResult, customersResult, employeesResult, productsResult] = await Promise.all([
    query(`
      SELECT
        orders.order_id,
        orders.order_date,
        orders.order_status,
        orders.total_value,
        CONCAT(customers.first_name, ' ', customers.last_name) AS customer_name,
        CONCAT(employees.first_name, ' ', employees.last_name) AS employee_name,
        payments.payment_status,
        payments.payment_method,
        deliveries.delivery_status,
        deliveries.awb_number,
        COALESCE(items.item_count, 0)::int AS item_count
      FROM public.orders
      JOIN public.customers ON customers.customer_id = orders.customer_id
      JOIN public.employees ON employees.employee_id = orders.employee_id
      LEFT JOIN LATERAL (
        SELECT payment_status, payment_method
        FROM public.order_payments
        WHERE order_id = orders.order_id
        ORDER BY payment_id DESC
        LIMIT 1
      ) AS payments ON TRUE
      LEFT JOIN LATERAL (
        SELECT delivery_status, awb_number
        FROM public.deliveries
        WHERE order_id = orders.order_id
        ORDER BY delivery_id DESC
        LIMIT 1
      ) AS deliveries ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS item_count
        FROM public.order_details
        WHERE order_id = orders.order_id
      ) AS items ON TRUE
      ORDER BY orders.order_date DESC, orders.order_id DESC
    `),
    query(`
      SELECT customer_id, CONCAT(first_name, ' ', last_name) AS label
      FROM public.customers
      ORDER BY first_name, last_name
    `),
    query(`
      SELECT employee_id, CONCAT(first_name, ' ', last_name, ' - ', COALESCE(job_title, 'Staff')) AS label
      FROM public.employees
      ORDER BY first_name, last_name
    `),
    query(`
      SELECT product_id, product_name, sale_price, stock
      FROM public.products
      ORDER BY product_name ASC
    `),
  ]);

  return {
    orders: ordersResult.rows.map((row) => ({
      ...row,
      total_value: toNumber(row.total_value) || 0,
    })),
    customers: customersResult.rows,
    employees: employeesResult.rows,
    products: productsResult.rows.map((row) => ({
      ...row,
      sale_price: toNumber(row.sale_price) || 0,
    })),
  };
}

async function createOrder(payload) {
  const customerId = toInt(payload.customer_id, "Choose a valid customer.");
  const employeeId = toInt(payload.employee_id, "Choose a valid employee.");
  const orderStatus = normalizeStatus(payload.order_status, "Processing");
  const paymentMethod = normalizeStatus(payload.payment_method, "Card");
  const paymentStatus = normalizeStatus(payload.payment_status, "Paid");
  const deliveryStatus = trimString(payload.delivery_address) ? normalizeStatus(payload.delivery_status, "Prepared") : null;
  const courierCompany = trimString(payload.courier_company);
  const deliveryAddress = trimString(payload.delivery_address);
  const deliveryCost = deliveryAddress ? parseMoney(payload.delivery_cost || 0) : 0;
  const orderDate = parseDateInput(payload.order_date) || new Date().toISOString().slice(0, 10);
  const shippingDate = parseDateInput(payload.shipping_date);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    throw new HttpError(400, "An order needs at least one product line.");
  }

  return withTransaction(async (client) => {
    const customer = await getEntityById("public.customers", "customer_id", customerId, client);
    const employee = await getEntityById("public.employees", "employee_id", employeeId, client);
    if (!customer) {
      throw new HttpError(404, "Customer not found.");
    }
    if (!employee) {
      throw new HttpError(404, "Employee not found.");
    }

    const productLines = [];
    let totalValue = 0;
    let totalEstimatedCost = 0;

    for (const rawItem of items) {
      const productId = toInt(rawItem.product_id, "Each item needs a valid product.");
      const quantity = toInt(rawItem.quantity, "Each item needs a quantity greater than zero.");
      const product = await getEntityById("public.products", "product_id", productId, client);
      if (!product) {
        throw new HttpError(404, "One of the selected products does not exist.");
      }
      if (product.stock < quantity) {
        throw new HttpError(400, `Insufficient stock for ${product.product_name}.`);
      }

      const unitPrice = toNumber(product.sale_price) || 0;
      const estimatedCost = (await estimateUnitCost(productId, client)) || Number((unitPrice * 0.6).toFixed(2));

      productLines.push({ productId, quantity, unitPrice, estimatedCost, productName: product.product_name });
      totalValue += unitPrice * quantity;
      totalEstimatedCost += estimatedCost * quantity;
    }

    totalValue = Number(totalValue.toFixed(2));
    totalEstimatedCost = Number(totalEstimatedCost.toFixed(2));

    const orderResult = await client.query(
      `
        INSERT INTO public.orders (
          customer_id,
          employee_id,
          order_date,
          order_status,
          total_value
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [customerId, employeeId, orderDate, orderStatus, totalValue]
    );
    const order = orderResult.rows[0];

    for (const line of productLines) {
      await client.query(
        `
          INSERT INTO public.order_details (
            order_id,
            product_id,
            quantity,
            unit_price
          )
          VALUES ($1, $2, $3, $4)
        `,
        [order.order_id, line.productId, line.quantity, line.unitPrice]
      );

      await client.query(
        `
          UPDATE public.products
          SET stock = stock - $2
          WHERE product_id = $1
        `,
        [line.productId, line.quantity]
      );
    }

    await client.query(
      `
        INSERT INTO public.order_payments (
          order_id,
          payment_date,
          amount_paid,
          payment_method,
          payment_status
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        order.order_id,
        orderDate,
        paymentStatus === "Partial" ? Number((totalValue * 0.4).toFixed(2)) : totalValue,
        paymentMethod,
        paymentStatus,
      ]
    );

    if (deliveryAddress) {
      await client.query(
        `
          INSERT INTO public.deliveries (
            order_id,
            courier_company,
            awb_number,
            delivery_cost,
            delivery_address,
            shipping_date,
            delivery_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          order.order_id,
          courierCompany,
          `AWB${Date.now()}${order.order_id}`,
          deliveryCost,
          deliveryAddress,
          shippingDate || orderDate,
          deliveryStatus,
        ]
      );
    }

    await client.query(
      `
        INSERT INTO public.earnings (
          order_id,
          revenue,
          cost,
          profit,
          record_date
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [order.order_id, totalValue, totalEstimatedCost, Number((totalValue - totalEstimatedCost).toFixed(2)), orderDate]
    );

    await recomputeMonthlyProfit(orderDate, client);
    return order;
  });
}

async function getSuppliersData() {
  const [suppliersResult, offersResult, suppliesResult, productsResult] = await Promise.all([
    query(`
      SELECT
        suppliers.*,
        COALESCE(offer_counts.offer_count, 0)::int AS offer_count,
        COALESCE(supply_counts.supply_count, 0)::int AS supply_count
      FROM public.suppliers
      LEFT JOIN (
        SELECT supplier_id, COUNT(*) AS offer_count
        FROM public.supplier_offers
        GROUP BY supplier_id
      ) AS offer_counts ON offer_counts.supplier_id = suppliers.supplier_id
      LEFT JOIN (
        SELECT supplier_id, COUNT(*) AS supply_count
        FROM public.supplies
        GROUP BY supplier_id
      ) AS supply_counts ON supply_counts.supplier_id = suppliers.supplier_id
      ORDER BY suppliers.company_name ASC
    `),
    query(`
      SELECT
        supplier_offers.offer_id,
        supplier_offers.supplier_id,
        suppliers.company_name,
        supplier_offers.product_id,
        products.product_name,
        supplier_offers.available_quantity,
        supplier_offers.purchase_price
      FROM public.supplier_offers
      JOIN public.suppliers ON suppliers.supplier_id = supplier_offers.supplier_id
      JOIN public.products ON products.product_id = supplier_offers.product_id
      ORDER BY supplier_offers.offer_id DESC
    `),
    query(`
      SELECT
        supplies.supply_id,
        supplies.supplier_id,
        suppliers.company_name,
        supplies.product_id,
        products.product_name,
        supplies.quantity,
        supplies.purchase_price,
        supplies.supply_date
      FROM public.supplies
      JOIN public.suppliers ON suppliers.supplier_id = supplies.supplier_id
      JOIN public.products ON products.product_id = supplies.product_id
      ORDER BY supplies.supply_date DESC, supplies.supply_id DESC
    `),
    query(`
      SELECT product_id, product_name
      FROM public.products
      ORDER BY product_name ASC
    `),
  ]);

  return {
    suppliers: suppliersResult.rows,
    offers: offersResult.rows.map((row) => ({
      ...row,
      purchase_price: toNumber(row.purchase_price) || 0,
    })),
    supplies: suppliesResult.rows.map((row) => ({
      ...row,
      purchase_price: toNumber(row.purchase_price) || 0,
    })),
    products: productsResult.rows,
  };
}

async function createSupplier(payload) {
  const companyName = trimString(payload.company_name);
  if (companyName.length < 2) {
    throw new HttpError(400, "Supplier company name must contain at least 2 characters.");
  }

  const result = await query(
    `
      INSERT INTO public.suppliers (
        company_name,
        contact_person,
        phone,
        email,
        address
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      companyName,
      trimString(payload.contact_person),
      trimString(payload.phone),
      trimString(payload.email),
      trimString(payload.address),
    ]
  );

  return result.rows[0];
}

async function createSupplierOffer(payload) {
  const supplierId = toInt(payload.supplier_id, "Choose a valid supplier.");
  const productId = toInt(payload.product_id, "Choose a valid product.");
  const availableQuantity = Math.max(0, Number(payload.available_quantity || 0));
  const purchasePrice = parseMoney(payload.purchase_price);

  const supplier = await getEntityById("public.suppliers", "supplier_id", supplierId);
  const product = await getEntityById("public.products", "product_id", productId);
  if (!supplier || !product) {
    throw new HttpError(404, "Supplier or product not found.");
  }

  const result = await query(
    `
      INSERT INTO public.supplier_offers (
        supplier_id,
        product_id,
        available_quantity,
        purchase_price
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [supplierId, productId, availableQuantity, purchasePrice]
  );

  return {
    ...result.rows[0],
    purchase_price: toNumber(result.rows[0].purchase_price) || 0,
  };
}

async function createSupply(payload) {
  const supplierId = toInt(payload.supplier_id, "Choose a valid supplier.");
  const productId = toInt(payload.product_id, "Choose a valid product.");
  const quantity = toInt(payload.quantity, "Supply quantity must be greater than zero.");
  const purchasePrice = parseMoney(payload.purchase_price);
  const supplyDate = parseDateInput(payload.supply_date) || new Date().toISOString().slice(0, 10);

  return withTransaction(async (client) => {
    const supplier = await getEntityById("public.suppliers", "supplier_id", supplierId, client);
    const product = await getEntityById("public.products", "product_id", productId, client);
    if (!supplier || !product) {
      throw new HttpError(404, "Supplier or product not found.");
    }

    const supplyResult = await client.query(
      `
        INSERT INTO public.supplies (
          supplier_id,
          product_id,
          quantity,
          purchase_price,
          supply_date
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [supplierId, productId, quantity, purchasePrice, supplyDate]
    );
    const supply = supplyResult.rows[0];

    await client.query(
      `
        UPDATE public.products
        SET stock = stock + $2
        WHERE product_id = $1
      `,
      [productId, quantity]
    );

    await client.query(
      `
        INSERT INTO public.expenses (
          expense_type,
          description,
          amount,
          expense_date,
          supplier_id,
          supply_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        "Inventory Supply",
        `${supplier.company_name} restock for ${product.product_name}`,
        Number((quantity * purchasePrice).toFixed(2)),
        supplyDate,
        supplierId,
        supply.supply_id,
      ]
    );

    await recomputeMonthlyProfit(supplyDate, client);
    return supply;
  });
}

async function getEmployeesData() {
  const [employeesResult, leaveTypesResult, leavesResult, resignationsResult] = await Promise.all([
    query(`
      SELECT
        employees.*,
        COALESCE(leave_counts.leave_count, 0)::int AS leave_count,
        COALESCE(service_counts.service_count, 0)::int AS service_count,
        latest_resignation.status AS resignation_status
      FROM public.employees
      LEFT JOIN (
        SELECT employee_id, COUNT(*) AS leave_count
        FROM public.employee_leaves
        GROUP BY employee_id
      ) AS leave_counts ON leave_counts.employee_id = employees.employee_id
      LEFT JOIN (
        SELECT employee_id, COUNT(*) AS service_count
        FROM public.product_service
        GROUP BY employee_id
      ) AS service_counts ON service_counts.employee_id = employees.employee_id
      LEFT JOIN LATERAL (
        SELECT status
        FROM public.employee_resignations
        WHERE employee_id = employees.employee_id
        ORDER BY resignation_date DESC, resignation_id DESC
        LIMIT 1
      ) AS latest_resignation ON TRUE
      ORDER BY employees.last_name ASC, employees.first_name ASC
    `),
    query(`
      SELECT leave_type_id, code, name
      FROM public.leave_types
      ORDER BY name ASC
    `),
    query(`
      SELECT
        employee_leaves.leave_id,
        employee_leaves.employee_id,
        CONCAT(employees.first_name, ' ', employees.last_name) AS employee_name,
        employee_leaves.leave_type,
        COALESCE(leave_types.name, employee_leaves.leave_type) AS leave_type_name,
        employee_leaves.start_date,
        employee_leaves.end_date,
        employee_leaves.reason,
        employee_leaves.status
      FROM public.employee_leaves
      JOIN public.employees ON employees.employee_id = employee_leaves.employee_id
      LEFT JOIN public.leave_types ON leave_types.code = employee_leaves.leave_type
      ORDER BY employee_leaves.start_date DESC, employee_leaves.leave_id DESC
    `),
    query(`
      SELECT
        employee_resignations.resignation_id,
        employee_resignations.employee_id,
        CONCAT(employees.first_name, ' ', employees.last_name) AS employee_name,
        employee_resignations.resignation_date,
        employee_resignations.notice_period_days,
        employee_resignations.reason,
        employee_resignations.status
      FROM public.employee_resignations
      JOIN public.employees ON employees.employee_id = employee_resignations.employee_id
      ORDER BY employee_resignations.resignation_date DESC, employee_resignations.resignation_id DESC
    `),
  ]);

  return {
    employees: employeesResult.rows.map((row) => ({
      ...row,
      salary: toNumber(row.salary) || 0,
    })),
    leave_types: leaveTypesResult.rows,
    leaves: leavesResult.rows,
    resignations: resignationsResult.rows,
  };
}

async function createEmployee(payload) {
  const firstName = trimString(payload.first_name);
  const lastName = trimString(payload.last_name);
  const jobTitle = trimString(payload.job_title);
  const phone = trimString(payload.phone);
  const email = trimString(payload.email);
  const salary = payload.salary === undefined || payload.salary === null || trimString(payload.salary) === "" ? null : parseMoney(payload.salary);
  const hireDate = parseDateInput(payload.hire_date);

  if (firstName.length < 2 || lastName.length < 2) {
    throw new HttpError(400, "Employee first name and last name must contain at least 2 characters.");
  }

  const result = await query(
    `
      INSERT INTO public.employees (
        last_name,
        first_name,
        job_title,
        phone,
        email,
        salary,
        hire_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE))
      RETURNING *
    `,
    [lastName, firstName, jobTitle, phone, email, salary, hireDate]
  );

  return {
    ...result.rows[0],
    salary: toNumber(result.rows[0].salary) || 0,
  };
}

async function createEmployeeLeave(payload) {
  const employeeId = toInt(payload.employee_id, "Choose a valid employee.");
  const leaveType = trimString(payload.leave_type);
  const startDate = parseDateInput(payload.start_date);
  const endDate = parseDateInput(payload.end_date);
  const reason = trimString(payload.reason);
  const status = normalizeStatus(payload.status, "Pending");

  if (!leaveType) {
    throw new HttpError(400, "Choose a valid leave type.");
  }
  if (!startDate || !endDate) {
    throw new HttpError(400, "Leave start date and end date are required.");
  }
  if (startDate > endDate) {
    throw new HttpError(400, "Leave end date must be on or after the start date.");
  }

  const employee = await getEntityById("public.employees", "employee_id", employeeId);
  if (!employee) {
    throw new HttpError(404, "Employee not found.");
  }

  const leaveTypeResult = await query(`SELECT code FROM public.leave_types WHERE code = $1 LIMIT 1`, [leaveType]);
  if (!leaveTypeResult.rows[0]) {
    throw new HttpError(400, "Choose a valid leave type.");
  }

  const result = await query(
    `
      INSERT INTO public.employee_leaves (
        employee_id,
        leave_type,
        start_date,
        end_date,
        reason,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [employeeId, leaveType, startDate, endDate, reason, status]
  );

  return result.rows[0];
}

async function createEmployeeResignation(payload) {
  const employeeId = toInt(payload.employee_id, "Choose a valid employee.");
  const resignationDate = parseDateInput(payload.resignation_date);
  const noticePeriodDays =
    payload.notice_period_days === undefined || payload.notice_period_days === null || trimString(payload.notice_period_days) === ""
      ? null
      : Math.max(0, Number(payload.notice_period_days));
  const reason = trimString(payload.reason);
  const status = normalizeStatus(payload.status, "Submitted");

  if (!resignationDate) {
    throw new HttpError(400, "Resignation date is required.");
  }

  const employee = await getEntityById("public.employees", "employee_id", employeeId);
  if (!employee) {
    throw new HttpError(404, "Employee not found.");
  }

  const result = await query(
    `
      INSERT INTO public.employee_resignations (
        employee_id,
        resignation_date,
        notice_period_days,
        reason,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [employeeId, resignationDate, noticePeriodDays, reason, status]
  );

  return result.rows[0];
}

async function getServiceData() {
  const [serviceResult, customersResult, productsResult, ordersResult, employeesResult] = await Promise.all([
    query(`
      SELECT
        product_service.service_id,
        product_service.customer_id,
        product_service.product_id,
        product_service.order_id,
        product_service.employee_id,
        product_service.received_date,
        product_service.reported_issue,
        product_service.diagnosis,
        product_service.service_status,
        product_service.solution,
        product_service.resolved_date,
        CONCAT(customers.first_name, ' ', customers.last_name) AS customer_name,
        products.product_name,
        CONCAT(employees.first_name, ' ', employees.last_name) AS employee_name
      FROM public.product_service
      JOIN public.customers ON customers.customer_id = product_service.customer_id
      JOIN public.products ON products.product_id = product_service.product_id
      LEFT JOIN public.employees ON employees.employee_id = product_service.employee_id
      ORDER BY product_service.received_date DESC, product_service.service_id DESC
    `),
    query(`
      SELECT customer_id, CONCAT(first_name, ' ', last_name) AS label
      FROM public.customers
      ORDER BY first_name, last_name
    `),
    query(`
      SELECT product_id, product_name
      FROM public.products
      ORDER BY product_name ASC
    `),
    query(`
      SELECT order_id, CONCAT('#', order_id, ' - ', order_status) AS label
      FROM public.orders
      ORDER BY order_id DESC
    `),
    query(`
      SELECT employee_id, CONCAT(first_name, ' ', last_name, ' - ', COALESCE(job_title, 'Staff')) AS label
      FROM public.employees
      ORDER BY first_name, last_name
    `),
  ]);

  return {
    service_cases: serviceResult.rows,
    customers: customersResult.rows,
    products: productsResult.rows,
    orders: ordersResult.rows,
    employees: employeesResult.rows,
  };
}

async function createServiceCase(payload) {
  const customerId = toInt(payload.customer_id, "Choose a valid customer.");
  const productId = toInt(payload.product_id, "Choose a valid product.");
  const orderId = toOptionalInt(payload.order_id);
  const employeeId = toOptionalInt(payload.employee_id);
  const receivedDate = parseDateInput(payload.received_date) || new Date().toISOString().slice(0, 10);
  const reportedIssue = trimString(payload.reported_issue);
  const diagnosis = trimString(payload.diagnosis);
  const serviceStatus = normalizeStatus(payload.service_status, "Received");
  const solution = trimString(payload.solution);
  const resolvedDate = parseDateInput(payload.resolved_date);

  if (reportedIssue.length < 5) {
    throw new HttpError(400, "Reported issue must contain at least 5 characters.");
  }
  if (resolvedDate && receivedDate > resolvedDate) {
    throw new HttpError(400, "Resolved date must be on or after the received date.");
  }

  const customer = await getEntityById("public.customers", "customer_id", customerId);
  const product = await getEntityById("public.products", "product_id", productId);
  if (!customer || !product) {
    throw new HttpError(404, "Customer or product not found.");
  }
  if (orderId) {
    const order = await getEntityById("public.orders", "order_id", orderId);
    if (!order) {
      throw new HttpError(404, "Order not found.");
    }
  }
  if (employeeId) {
    const employee = await getEntityById("public.employees", "employee_id", employeeId);
    if (!employee) {
      throw new HttpError(404, "Employee not found.");
    }
  }

  const result = await query(
    `
      INSERT INTO public.product_service (
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `,
    [customerId, productId, orderId, employeeId, receivedDate, reportedIssue, diagnosis, serviceStatus, solution, resolvedDate]
  );

  return result.rows[0];
}

async function getFinanceData(user) {
  requireFinancialAccess(user);

  const [metricsResult, earningsResult, expensesResult, monthlyProfitResult, suppliersResult, employeesResult, suppliesResult] =
    await Promise.all([
      query(`
        SELECT
          COALESCE((SELECT SUM(revenue) FROM public.earnings), 0)::numeric(12,2) AS revenue,
          COALESCE((SELECT SUM(cost) FROM public.earnings), 0)::numeric(12,2) AS cost,
          COALESCE((SELECT SUM(profit) FROM public.earnings), 0)::numeric(12,2) AS gross_profit,
          COALESCE((SELECT SUM(amount) FROM public.expenses), 0)::numeric(12,2) AS expenses
      `),
      query(`
        SELECT
          earnings.earning_id,
          earnings.order_id,
          earnings.revenue,
          earnings.cost,
          earnings.profit,
          earnings.record_date,
          CONCAT(customers.first_name, ' ', customers.last_name) AS customer_name
        FROM public.earnings
        JOIN public.orders ON orders.order_id = earnings.order_id
        JOIN public.customers ON customers.customer_id = orders.customer_id
        ORDER BY earnings.record_date DESC, earnings.earning_id DESC
      `),
      query(`
        SELECT
          expenses.expense_id,
          expenses.expense_type,
          expenses.description,
          expenses.amount,
          expenses.expense_date,
          suppliers.company_name,
          CONCAT(employees.first_name, ' ', employees.last_name) AS employee_name,
          expenses.supply_id
        FROM public.expenses
        LEFT JOIN public.suppliers ON suppliers.supplier_id = expenses.supplier_id
        LEFT JOIN public.employees ON employees.employee_id = expenses.employee_id
        ORDER BY expenses.expense_date DESC, expenses.expense_id DESC
      `),
      query(`
        SELECT *
        FROM public.monthly_profit
        ORDER BY year DESC, month DESC
      `),
      query(`
        SELECT supplier_id, company_name
        FROM public.suppliers
        ORDER BY company_name ASC
      `),
      query(`
        SELECT employee_id, CONCAT(first_name, ' ', last_name, ' - ', COALESCE(job_title, 'Staff')) AS label
        FROM public.employees
        ORDER BY first_name, last_name
      `),
      query(`
        SELECT supply_id, CONCAT('#', supply_id, ' - ', quantity, ' units') AS label
        FROM public.supplies
        ORDER BY supply_id DESC
      `),
    ]);

  const metrics = metricsResult.rows[0];
  const revenue = toNumber(metrics.revenue) || 0;
  const cost = toNumber(metrics.cost) || 0;
  const grossProfit = toNumber(metrics.gross_profit) || 0;
  const expenses = toNumber(metrics.expenses) || 0;

  return {
    metrics: {
      revenue,
      cost,
      gross_profit: grossProfit,
      expenses,
      net_profit: Number((revenue - expenses).toFixed(2)),
    },
    earnings: earningsResult.rows.map((row) => ({
      ...row,
      revenue: toNumber(row.revenue) || 0,
      cost: toNumber(row.cost) || 0,
      profit: toNumber(row.profit) || 0,
    })),
    expenses: expensesResult.rows.map((row) => ({
      ...row,
      amount: toNumber(row.amount) || 0,
    })),
    monthly_profit: monthlyProfitResult.rows.map((row) => ({
      ...row,
      total_earnings: toNumber(row.total_earnings) || 0,
      total_expenses: toNumber(row.total_expenses) || 0,
      net_profit: toNumber(row.net_profit) || 0,
      average_earnings: toNumber(row.average_earnings) || 0,
      average_expenses: toNumber(row.average_expenses) || 0,
    })),
    suppliers: suppliersResult.rows,
    employees: employeesResult.rows,
    supplies: suppliesResult.rows,
  };
}

async function createExpense(user, payload) {
  requireFinancialAccess(user);

  const expenseType = trimString(payload.expense_type);
  const description = trimString(payload.description);
  const amount = parseMoney(payload.amount);
  const expenseDate = parseDateInput(payload.expense_date) || new Date().toISOString().slice(0, 10);
  const supplierId = toOptionalInt(payload.supplier_id);
  const supplyId = toOptionalInt(payload.supply_id);
  const employeeId = toOptionalInt(payload.employee_id);

  if (expenseType.length < 2) {
    throw new HttpError(400, "Expense type must contain at least 2 characters.");
  }

  return withTransaction(async (client) => {
    if (supplierId) {
      const supplier = await getEntityById("public.suppliers", "supplier_id", supplierId, client);
      if (!supplier) {
        throw new HttpError(404, "Supplier not found.");
      }
    }
    if (supplyId) {
      const supply = await getEntityById("public.supplies", "supply_id", supplyId, client);
      if (!supply) {
        throw new HttpError(404, "Supply not found.");
      }
    }
    if (employeeId) {
      const employee = await getEntityById("public.employees", "employee_id", employeeId, client);
      if (!employee) {
        throw new HttpError(404, "Employee not found.");
      }
    }

    const result = await client.query(
      `
        INSERT INTO public.expenses (
          expense_type,
          description,
          amount,
          expense_date,
          supplier_id,
          supply_id,
          employee_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [expenseType, description, amount, expenseDate, supplierId, supplyId, employeeId]
    );

    await recomputeMonthlyProfit(expenseDate, client);
    return {
      ...result.rows[0],
      amount: toNumber(result.rows[0].amount) || 0,
    };
  });
}

module.exports = {
  getOverviewData,
  getStockCheckData,
  getProductsData,
  createProduct,
  getCustomersData,
  createCustomer,
  getOrdersData,
  createOrder,
  getSuppliersData,
  createSupplier,
  createSupplierOffer,
  createSupply,
  getEmployeesData,
  createEmployee,
  createEmployeeLeave,
  createEmployeeResignation,
  getServiceData,
  createServiceCase,
  getFinanceData,
  createExpense,
};
