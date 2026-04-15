# OpenMarket Project Plan

## Project Summary

OpenMarket is a PostgreSQL-driven commerce operations portal built around the SQL schema imported from `marketonline.sql`. The application is fully in English and is designed as a functional demo for managing products, customers, orders, suppliers, employees, service workflows, and financial reporting through a single web interface.

The project is built directly around the imported SQL structure. PostgreSQL is the primary source of truth for all live application data.

## Product Goals

- Build a complete web application around the imported `marketonline.sql` schema.
- Keep the interface entirely in English.
- Maintain clear separation between frontend, backend, database access, and business rules.
- Use PostgreSQL as the only runtime data source.
- Provide a practical demo for operations, sales, stock, service, and finance workflows.

## Core Scope

The current project scope includes:

- product catalog management
- customer management
- order creation and order history
- supplier and stock replenishment management
- employee management
- leave and resignation tracking
- service case tracking
- finance and profitability reporting

## Architecture

### Frontend

- Single-page application
- Static shell in `static/index.html`
- Client logic in `static/marketonline.js`
- English-only labels, forms, buttons, tables, and status messages

### Backend

- Native Node.js HTTP server
- Route handling in `src/server/app.js`
- Bootstrap entry in `src/server/start.js`
- Business logic in `src/services/marketonline.js`

### Database Layer

- PostgreSQL connection pool in `src/db/client.js`
- Schema bootstrap in `src/db/bootstrap.js`
- SQL schema in `sql/schema.sql`
- Initial demo seed data in `src/db/seed.js`

## Data Model Overview

The application is based on these main tables:

- `customers`
- `employees`
- `leave_types`
- `suppliers`
- `products`
- `orders`
- `order_details`
- `order_payments`
- `deliveries`
- `earnings`
- `supplier_offers`
- `supplies`
- `expenses`
- `product_service`
- `employee_leaves`
- `employee_resignations`
- `monthly_profit`

## Functional Modules

### 1. Overview Module

Purpose:

- present operational KPIs
- show recent orders
- highlight low-stock products
- summarize service activity
- display monthly profit snapshots

Main data sources:

- `orders`
- `products`
- `product_service`
- `earnings`
- `expenses`
- `monthly_profit`

### 2. Products Module

Purpose:

- create new products
- manage stock-oriented catalog entries
- review category summaries

Main data sources:

- `products`

Main fields used:

- product name
- brand
- product type
- category
- sale price
- stock
- description
- date added

### 3. Customers Module

Purpose:

- create customer records
- keep contact and location data
- review customer order and service counts

Main data sources:

- `customers`
- `orders`
- `product_service`

### 4. Orders Module

Purpose:

- create sales orders with multiple lines
- attach payment details
- optionally attach delivery details
- automatically create earnings rows
- decrease stock after each sale

Main data sources:

- `orders`
- `order_details`
- `order_payments`
- `deliveries`
- `earnings`
- `products`
- `customers`
- `employees`

Important backend behavior:

- an order inserts a row in `orders`
- each selected product inserts a row in `order_details`
- product stock is reduced
- a payment row is inserted into `order_payments`
- a delivery row is inserted when shipping data is present
- an earnings row is inserted
- monthly profitability is recalculated

### 5. Suppliers Module

Purpose:

- manage supplier records
- register supplier offers
- register incoming supplies
- automatically generate inventory-related expenses
- increase stock when supplies are received

Main data sources:

- `suppliers`
- `supplier_offers`
- `supplies`
- `products`
- `expenses`

Important backend behavior:

- a supply increases product stock
- a supply also creates a matching expense entry
- monthly profitability is recalculated

### 6. Employees Module

Purpose:

- manage employee records
- track leave requests
- record resignations
- keep workforce-related operational history

Main data sources:

- `employees`
- `leave_types`
- `employee_leaves`
- `employee_resignations`
- `product_service`

### 7. Service Module

Purpose:

- register product service cases
- connect service work to customers, products, orders, and employees
- track issue, diagnosis, status, solution, and resolution date

Main data sources:

- `product_service`
- `customers`
- `products`
- `orders`
- `employees`

### 8. Finance Module

Purpose:

- inspect earnings
- inspect expenses
- create new expense entries
- review monthly profit calculations

Main data sources:

- `earnings`
- `expenses`
- `monthly_profit`
- `suppliers`
- `supplies`
- `employees`

Important backend behavior:

- creating an expense recalculates the corresponding monthly profit row

## Pages

The application includes these main pages:

### `/`

- operations overview
- KPI cards
- recent orders
- low-stock products
- recent service cases
- monthly profit summary

### `/products`

- create product form
- category summary
- product list

### `/customers`

- create customer form
- customer summary cards
- customer directory table

### `/orders`

- create order form
- multi-line product selection
- payment and delivery inputs
- order register

### `/suppliers`

- create supplier form
- create supplier offer form
- create supply form
- suppliers table
- offers table
- supply history table

### `/employees`

- create employee form
- create leave form
- create resignation form
- employee directory
- leave history
- resignation history

### `/service`

- create service case form
- service case queue

### `/finance`

- financial KPI cards
- create expense form
- monthly profit table
- earnings ledger
- expense ledger

## API Plan

### Overview

- `GET /api/overview`

### Products

- `GET /api/products`
- `POST /api/products`

### Customers

- `GET /api/customers`
- `POST /api/customers`

### Orders

- `GET /api/orders`
- `POST /api/orders`

### Suppliers

- `GET /api/suppliers`
- `POST /api/suppliers`
- `POST /api/supplier-offers`
- `POST /api/supplies`

### Employees

- `GET /api/employees`
- `POST /api/employees`
- `POST /api/employee-leaves`
- `POST /api/employee-resignations`

### Service

- `GET /api/service`
- `POST /api/service`

### Finance

- `GET /api/finance`
- `POST /api/expenses`

## Database Rules and Constraints

The schema is designed with:

- primary keys on every table
- foreign key relationships across all dependent entities
- generated subtotal values in `order_details`
- unique email fields where required
- unique AWB numbers for deliveries
- unique `(month, year)` pairs for `monthly_profit`
- numeric checks for non-negative prices, amounts, and stock
- indexes for common filters and joins

## Seed Strategy

If the database is empty, the application inserts demo data for:

- customers
- employees
- suppliers
- products
- supplier offers
- supplies
- expenses
- orders
- order lines
- payments
- deliveries
- earnings
- service cases
- employee leaves
- employee resignations
- monthly profit

## Project Files

Important files in the project:

- `README.md`
- `plan.md`
- `package.json`
- `.env.example`
- `sql/schema.sql`
- `src/db/client.js`
- `src/db/bootstrap.js`
- `src/db/seed.js`
- `src/server/app.js`
- `src/server/start.js`
- `src/services/marketonline.js`
- `static/index.html`
- `static/style.css`
- `static/marketonline.js`

## Non-Goals

The current project does not include:

- advanced authentication and session management
- payments through an external provider
- file uploads
- multi-tenant account separation
- production deployment automation

## Future Improvements

Possible next steps for the project:

- add authentication and access control adapted to the current SQL schema
- add update and delete flows for major entities
- add filters, search, and pagination
- add charts for revenue, expenses, and stock movement
- add export features for orders, service, and finance
- add audit logging for business actions
- add automated test coverage for services and routes

## Delivery Standard

The project should remain:

- fully in English
- PostgreSQL-first
- modular and maintainable
- aligned with the imported SQL model
- functional as a realistic demo application
