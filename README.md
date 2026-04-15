# OpenMarket

OpenMarket is an English-only web application built on top of the PostgreSQL schema imported from `marketonline.sql`. The project functions as a commerce operations portal for managing products, customers, orders, suppliers, employees, service cases, and financial reporting.

## Project Purpose

This project turns the imported SQL schema into a working application with:

- a browser-based frontend
- a Node.js backend
- PostgreSQL as the only source of truth
- business rules for stock, orders, supplies, service, and profitability

For the complete project specification, architecture plan, and scope details, see `plan.md`.

## Main Features

- product catalog management
- customer management
- order creation with multiple order lines
- payment and delivery recording
- supplier offers and incoming supplies
- employee management
- leave and resignation tracking
- product service case registration
- expense tracking
- monthly profitability reporting

## Tech Stack

- Frontend: vanilla JavaScript SPA
- Backend: Node.js HTTP server
- Database: PostgreSQL
- Driver: `pg`

## Project Structure

- `plan.md` - full project plan and scope
- `README.md` - quick project overview and run guide
- `sql/schema.sql` - PostgreSQL schema used by the application
- `src/db/client.js` - PostgreSQL connection and transactions
- `src/db/bootstrap.js` - schema bootstrap and seed trigger
- `src/db/seed.js` - demo data inserted into an empty database
- `src/server/app.js` - API routing and static file serving
- `src/server/start.js` - runtime entry point
- `src/services/marketonline.js` - business logic and SQL operations
- `static/index.html` - SPA shell
- `static/style.css` - frontend styling
- `static/marketonline.js` - frontend logic and page rendering

## Application Pages

- `/` - overview dashboard
- `/products` - product management
- `/customers` - customer management
- `/orders` - order management
- `/suppliers` - supplier, offer, and supply management
- `/employees` - employee, leave, and resignation management
- `/service` - service case management
- `/finance` - expense and profitability reporting

## API Endpoints

- `GET /api/overview`
- `GET /api/products`
- `POST /api/products`
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/suppliers`
- `POST /api/suppliers`
- `POST /api/supplier-offers`
- `POST /api/supplies`
- `GET /api/employees`
- `POST /api/employees`
- `POST /api/employee-leaves`
- `POST /api/employee-resignations`
- `GET /api/service`
- `POST /api/service`
- `GET /api/finance`
- `POST /api/expenses`

## Database Behavior

- the app applies `sql/schema.sql` if the `customers` table does not already exist
- the app seeds demo data only when the database is empty
- creating an order also inserts:
  - order details
  - payment data
  - optional delivery data
  - earnings data
- creating a supply also:
  - increases product stock
  - creates an expense row
- creating an expense recalculates monthly profit

## Environment Configuration

Example configuration:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/marketonline
PGSSLMODE=disable
PORT=8000
```

## How to Run

### 1. Create the PostgreSQL database

```sql
CREATE DATABASE marketonline;
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the app

```bash
npm start
```

Or use the WSL helper script:

```bash
bash run.sh
```

### 4. Open the application

```text
http://localhost:8000
```

## Demo Data

If the database starts empty, the seed inserts:

- customers
- employees
- leave types
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

It also inserts these login accounts:

- `admin`
- `director`
- `accountant`
- `staff`

Default password for all seeded accounts:

```text
OpenMarket123!
```

## Notes

- all visible UI text is in English
- the runtime is PostgreSQL-first
- the application is aligned directly to `marketonline.sql`
- the project has been cleaned so only the current SQL-based runtime remains active
