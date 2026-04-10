# OpenMarket

OpenMarket is a fully English multi-vendor marketplace demo built around four clearly separated layers:

- frontend SPA in [static/app.js](/D:/Codex/sites/Openmarket/static/app.js)
- HTTP/API server in [src/server/app.js](/D:/Codex/sites/Openmarket/src/server/app.js)
- business logic and authorization in [src/services/marketplace.js](/D:/Codex/sites/Openmarket/src/services/marketplace.js)
- PostgreSQL schema and bootstrap in [sql/schema.sql](/D:/Codex/sites/Openmarket/sql/schema.sql), [src/db/bootstrap.js](/D:/Codex/sites/Openmarket/src/db/bootstrap.js), and [src/db/client.js](/D:/Codex/sites/Openmarket/src/db/client.js)

The runtime entry used by `npm start` is [src/server/start.js](/D:/Codex/sites/Openmarket/src/server/start.js).

## Core Architecture

### Frontend

- Single-page application with client-side routing
- Every UI string is in English
- All pages talk to the backend through JSON API routes
- Role-aware navigation and role-aware dashboard content

### Backend

- Native Node.js HTTP server
- Protected routes validate both session and role on the server
- Multi-step workflows are enforced in backend logic, not only in the UI
- Important actions write to the audit log

### Database

- External SQL database: PostgreSQL
- PostgreSQL is the only source of truth at runtime
- No in-memory cache, JSON file, or mock collection is used for live application logic
- On first boot, the app applies the SQL schema and inserts demo seed data only if the database is empty
- Legacy JSON files in [`data/`](/D:/Codex/sites/Openmarket/data) are not used by the current runtime

### Authorization

- Persistent sessions stored in the `user_sessions` table
- Passwords hashed with PBKDF2 before storage
- Role checks centralized in [src/auth/access.js](/D:/Codex/sites/Openmarket/src/auth/access.js)
- Session token hashing handled in [src/auth/sessions.js](/D:/Codex/sites/Openmarket/src/auth/sessions.js)

## Roles

### `customer`

- register, login, logout
- update profile
- browse the catalog
- open a product page
- submit comments and reviews
- submit complaints
- request vendor access

### `vendor`

- see only own vendor inventory in the vendor hub
- create products
- edit own products
- request product removal
- cannot directly delete published products

### `moderator`

- review pending comments
- make comments visible, hidden, or rejected
- review complaints
- resolve, reject, or escalate complaints to admin

### `admin`

- manage user active or suspended status
- first-stage review for vendor requests
- first-stage review for product removal requests
- review escalated complaints
- view marketplace statistics

### `super_admin`

- final-stage approval for vendor requests
- final-stage approval for product removal requests
- manage global settings
- change user roles
- inspect the full audit log

## Business Workflows

### Vendor access workflow

1. A `customer` submits a vendor request.
2. The request enters `pending_admin_review`.
3. `admin` approves or rejects the first stage.
4. If approved, the request moves to `pending_super_admin_review`.
5. `super_admin` makes the final decision.
6. Only after final approval does the user role become `vendor`.

### Product removal workflow

1. A `vendor` requests removal for a published product.
2. The product becomes immediately `unavailable`.
3. `admin` performs the first review.
4. If approved, the request moves to `pending_super_admin_review`.
5. `super_admin` makes the final decision.
6. Final approval sets the product to `removed`.
7. Final or first-stage rejection restores the product to `published`.

### Seasonal availability workflow

- Products support `permanent` and `seasonal`
- Seasonal products store:
  - `seasonal_window`
  - `available_from`
  - `available_until`
- PostgreSQL validates the seasonal classification:
  - `one_to_three_months`
  - `three_to_five_months`
- Expired seasonal products are automatically marked `unavailable`

## PostgreSQL Database

Configuration example lives in [.env.example](/D:/Codex/sites/Openmarket/.env.example):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/openmarket
PGSSLMODE=disable
PORT=8000
```

### Schema design

The schema uses:

- UUID primary keys for core entities
- PostgreSQL enum types for roles, statuses, product types, complaint targets, and review states
- `TIMESTAMPTZ` for audit and lifecycle fields
- `DATE` for seasonal windows
- foreign keys with explicit delete behavior
- database-level check constraints for seasonal duration validity
- useful indexes for email, slug, statuses, joins, and logs
- partial unique indexes to block duplicate open vendor or product removal requests

### Main tables

#### `users`

- purpose: accounts, roles, and profile data
- key fields:
  - `id UUID PRIMARY KEY`
  - `email TEXT NOT NULL`
  - `display_name TEXT NOT NULL`
  - `password_hash TEXT NOT NULL`
  - `role app_role NOT NULL`
  - `status user_account_status NOT NULL`
  - `bio TEXT`
  - `company TEXT`
  - `created_at TIMESTAMPTZ`
  - `updated_at TIMESTAMPTZ`
- indexes:
  - unique index on `LOWER(email)`
  - role index
  - status index

#### `products`

- purpose: marketplace listings
- key fields:
  - `id UUID PRIMARY KEY`
  - `vendor_id UUID REFERENCES users(id)`
  - `title TEXT`
  - `slug TEXT UNIQUE`
  - `summary TEXT`
  - `description TEXT`
  - `price NUMERIC(12,2)`
  - `stock INTEGER`
  - `category TEXT`
  - `status product_status`
  - `product_type product_type`
  - `seasonal_window seasonal_window`
  - `available_from DATE`
  - `available_until DATE`
  - `created_at TIMESTAMPTZ`
  - `updated_at TIMESTAMPTZ`
- validation:
  - permanent products cannot store seasonal fields
  - seasonal products must store all seasonal fields
  - seasonal dates must fit the selected classification

#### `vendor_requests`

- purpose: two-stage customer to vendor approval flow
- key fields:
  - `user_id`
  - `status`
  - `reason`
  - `reviewed_by_admin`
  - `admin_note`
  - `admin_reviewed_at`
  - `reviewed_by_super_admin`
  - `super_admin_note`
  - `super_admin_reviewed_at`
- indexes:
  - user index
  - status index
  - partial unique index for open requests

#### `product_removal_requests`

- purpose: two-stage product removal workflow
- key fields:
  - `product_id`
  - `vendor_id`
  - `status`
  - `reason`
  - admin and super admin review fields
- indexes:
  - product index
  - vendor index
  - status index
  - partial unique index for open requests

#### `comments`

- purpose: product reviews and moderated comments
- key fields:
  - `product_id`
  - `user_id`
  - `content`
  - `rating`
  - `status`
  - `moderation_note`
  - `reviewed_by`
  - timestamps

#### `complaints`

- purpose: reports against products, comments, or users
- key fields:
  - `reporter_id`
  - `target_type`
  - `target_product_id`
  - `target_comment_id`
  - `target_user_id`
  - `reason`
  - `details`
  - `status`
  - `reviewer_id`
  - `resolution_note`
  - timestamps
- validation:
  - exactly one target foreign key must be filled, depending on `target_type`

#### `user_sessions`

- purpose: persistent login sessions
- key fields:
  - `user_id`
  - `token_hash`
  - `expires_at`
  - `last_seen_at`

#### `activity_logs`

- purpose: audit log for important actions
- key fields:
  - `actor_user_id`
  - `actor_role`
  - `action`
  - `entity_type`
  - `entity_id`
  - `metadata JSONB`
  - `created_at TIMESTAMPTZ`
- indexes:
  - created-at descending index
  - actor index
  - entity index
  - action index

#### `global_settings`

- purpose: site-wide settings controlled by `super_admin`
- key fields:
  - `site_name`
  - `tagline`
  - `support_email`
  - `featured_categories JSONB`
  - `seasonal_policy`
  - `updated_at`

## Pages

### Public pages

- `/`
  - landing page
  - marketplace rules summary
  - roles overview
  - demo account list
- `/login`
  - login form
- `/register`
  - customer registration form

### Authenticated pages

- `/dashboard`
  - role-aware metrics
  - recent products
  - recent audit snapshot
- `/profile`
  - profile form
  - own comments
  - own complaints
  - vendor request card or form for customers
- `/products`
  - product catalog
  - category filter
  - product type filter
- `/products/:id`
  - product details
  - seasonal window information
  - unavailable message when relevant
  - comment form
  - complaint buttons for product, vendor, comment, and comment author

### Vendor pages

- `/vendor/products`
  - own products list
  - edit actions
  - removal request actions
  - removal request history
- `/vendor/add-product`
  - create product form
- `/vendor/add-product?edit=:id`
  - edit existing product
  - includes seasonal classification and date range

### Moderator pages

- `/moderator/comments`
  - pending comment queue
  - visible, hidden, rejected actions
- `/moderator/complaints`
  - open complaint queue
  - resolve, reject, escalate actions

### Admin pages

- `/admin/users`
  - activate or suspend users
- `/admin/vendor-requests`
  - first-stage vendor approval queue
- `/admin/product-removals`
  - first-stage product removal queue
- `/admin/escalated-complaints`
  - escalated cases from moderators
  - final admin resolve or reject actions
- `/admin/stats`
  - marketplace totals
  - product breakdown
  - recent log entries

### Super admin pages

- `/super-admin/settings`
  - global settings form
  - final vendor approvals
  - final product removal approvals
  - role management table
- `/super-admin/audit`
  - full audit log

## API Routes

### Authentication

- `GET /api/session`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Profile and dashboard

- `GET /api/dashboard`
- `GET /api/profile`
- `POST /api/profile`

### Products and comments

- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `POST /api/products/:id/update`
- `POST /api/products/:id/comment`
- `POST /api/products/:id/removal-request`

### Complaints

- `POST /api/complaints`

### Vendor access

- `POST /api/vendor/request-access`
- `GET /api/vendor/products`

### Moderator actions

- `GET /api/moderator/comments`
- `POST /api/moderator/comments/:id/review`
- `GET /api/moderator/complaints`
- `POST /api/moderator/complaints/:id/review`

### Admin actions

- `GET /api/admin/users`
- `POST /api/admin/users/:id/status`
- `GET /api/admin/vendor-requests`
- `POST /api/admin/vendor-requests/:id/review`
- `GET /api/admin/product-removals`
- `POST /api/admin/product-removals/:id/review`
- `GET /api/admin/escalated-complaints`
- `POST /api/admin/complaints/:id/review`
- `GET /api/admin/stats`

### Super admin actions

- `GET /api/super-admin/settings`
- `POST /api/super-admin/settings`
- `POST /api/super-admin/users/:id/role`
- `POST /api/super-admin/vendor-requests/:id/finalize`
- `POST /api/super-admin/product-removals/:id/finalize`
- `GET /api/super-admin/audit`

## Project Structure

- [package.json](/D:/Codex/sites/Openmarket/package.json)
  - npm scripts and dependencies
- [src/server/start.js](/D:/Codex/sites/Openmarket/src/server/start.js)
  - runtime bootstrap used by `npm start`
- [src/server/app.js](/D:/Codex/sites/Openmarket/src/server/app.js)
  - HTTP routing and SPA/static serving
- [src/services/marketplace.js](/D:/Codex/sites/Openmarket/src/services/marketplace.js)
  - business rules, SQL calls, audit logging, role checks
- [src/db/client.js](/D:/Codex/sites/Openmarket/src/db/client.js)
  - PostgreSQL pool and transactions
- [src/db/bootstrap.js](/D:/Codex/sites/Openmarket/src/db/bootstrap.js)
  - schema apply plus initial seeding
- [src/db/seed.js](/D:/Codex/sites/Openmarket/src/db/seed.js)
  - demo bootstrap records
- [src/auth/passwords.js](/D:/Codex/sites/Openmarket/src/auth/passwords.js)
  - PBKDF2 password hashing
- [src/auth/sessions.js](/D:/Codex/sites/Openmarket/src/auth/sessions.js)
  - session token generation and hashing
- [sql/schema.sql](/D:/Codex/sites/Openmarket/sql/schema.sql)
  - PostgreSQL schema, enums, constraints, indexes
- [static/index.html](/D:/Codex/sites/Openmarket/static/index.html)
  - SPA shell
- [static/style.css](/D:/Codex/sites/Openmarket/static/style.css)
  - styling
- [static/app.js](/D:/Codex/sites/Openmarket/static/app.js)
  - frontend router, rendering, and API integration

## Local Run

1. Create a PostgreSQL database.
2. Copy [.env.example](/D:/Codex/sites/Openmarket/.env.example) to your local environment.
3. Set `DATABASE_URL`.
4. Run:

```bash
npm install
npm start
```

Default local address:

```text
http://localhost:8000
```

## Demo Accounts

All seeded demo accounts use:

```text
OpenMarket123!
```

- `customer@openmarket.local`
- `vendor@openmarket.local`
- `moderator@openmarket.local`
- `admin@openmarket.local`
- `superadmin@openmarket.local`

Extra seeded records also exist for vendor-request and final-approval queues.

## Important Notes

- The entire interface is in English.
- Runtime persistence is PostgreSQL-only.
- Security checks are enforced in backend routes.
- Seasonal rules, request workflows, and complaint workflows are persisted and auditable.
- Audit logging is part of the main application flow, not an afterthought.
