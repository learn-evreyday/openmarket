# OpenMarket

OpenMarket is a self-contained multi-vendor marketplace demo built from the supplied plan. The application is written entirely in English and implements the core business rules requested for the project:

- customer accounts
- vendor access requests with two-step approval
- vendor product management
- permanent and seasonal products
- comment moderation
- complaint handling
- admin and super admin control layers
- audit logging

## Technology and Database

The current implementation does **not** use an external SQL or NoSQL server.

It uses:

- `Node.js` standard library only
- static frontend files: HTML, CSS, and vanilla JavaScript
- JSON file storage in [`data/`](/D:/Codex/sites/Openmarket/data)

### Current storage model

OpenMarket currently uses the JSON files inside `data/` as a lightweight local database. Each file acts like a logical table or collection.

This approach is useful for:

- local development
- simple deployment
- zero external dependencies
- easy seeding of demo data

If the project is later migrated to PostgreSQL, MySQL, SQLite, or MongoDB, the current JSON collections already map cleanly to a database schema.

## Logical Table Structure

Below is the logical data model used by the current app.

### `users`

Stores all accounts in the system.

Important fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique user ID |
| `email` | string | Login identity |
| `display_name` | string | Public name shown in the UI |
| `password_hash` | string | PBKDF2 password hash |
| `provider` | string | Current value is `local` |
| `role` | string | `customer`, `vendor`, `moderator`, `admin`, `super_admin` |
| `status` | string | `active` or `suspended` |
| `bio` | string | Profile description |
| `company` | string | Vendor or organization name |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### `products`

Stores product listings created by vendors.

Important fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique product ID |
| `vendor_id` | string | Owner user ID |
| `title` | string | Product title |
| `slug` | string | URL-friendly identifier |
| `summary` | string | Short product summary |
| `description` | string | Full product description |
| `price` | number | Product price |
| `currency` | string | Currently `USD` |
| `stock` | number | Integer quantity |
| `category` | string | Product category |
| `status` | string | `draft`, `published`, `pending_review`, `unavailable`, `removed` |
| `product_type` | string | `permanent` or `seasonal` |
| `available_from` | string/null | Start date for seasonal products |
| `available_until` | string/null | End date for seasonal products |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### `vendor_requests`

Stores requests sent by customers who want to become vendors.

Important fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique request ID |
| `user_id` | string | Customer who requested vendor access |
| `status` | string | `pending_admin_review`, `pending_super_admin_review`, `approved`, `rejected_by_admin`, `rejected_by_super_admin` |
| `reason` | string | Request justification |
| `admin_review` | object/null | First-stage decision |
| `super_admin_review` | object/null | Final decision |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### `product_removal_requests`

Stores vendor requests for product removal.

Important fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique request ID |
| `product_id` | string | Product requested for removal |
| `vendor_id` | string | Vendor who owns the product |
| `status` | string | Same approval lifecycle as vendor requests |
| `reason` | string | Removal explanation |
| `admin_review` | object/null | First review |
| `super_admin_review` | object/null | Final review |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### `comments`

Stores customer comments and reviews on products.

Important fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique comment ID |
| `product_id` | string | Linked product |
| `user_id` | string | Comment author |
| `content` | string | Review text |
| `rating` | number | 1 to 5 |
| `status` | string | `visible`, `hidden`, `pending_review`, `rejected` |
| `moderation_note` | string | Optional moderator note |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### `complaints`

Stores reports about products, comments, or users.

Important fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique complaint ID |
| `reporter_id` | string | User who submitted the complaint |
| `target_type` | string | `product`, `comment`, or `user` |
| `target_id` | string | Linked entity ID |
| `reason` | string | Short complaint title |
| `details` | string | Complaint explanation |
| `status` | string | `open`, `resolved`, `rejected`, `escalated_to_admin` |
| `reviewer_id` | string/null | Moderator who handled it |
| `resolution_note` | string | Decision or escalation note |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### `activity_logs`

Stores audit events across the platform.

Important fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique log ID |
| `actor_id` | string/null | User who performed the action |
| `actor_role` | string | Role or `system` |
| `action` | string | Event key such as `product.created` |
| `entity_type` | string | Related domain type |
| `entity_id` | string | Related entity ID |
| `details` | object | Additional context |
| `created_at` | string | ISO timestamp |

### `settings`

Stores global application settings.

Important fields:

| Field | Type | Description |
|---|---|---|
| `site_name` | string | Branding name |
| `tagline` | string | Global site message |
| `support_email` | string | Support contact |
| `featured_categories` | array | Categories highlighted by the platform |
| `seasonal_policy` | string | Seasonal product rule text |
| `updated_at` | string | ISO timestamp |

### Optional collections included for future growth

- `shopping_lists`
- `events`

They exist as placeholders in the current storage layer, but they are not yet core UI features.

## Roles in the System

The platform currently supports five roles:

### Customer

Can:

- register and log in
- browse products
- submit comments
- submit complaints
- request vendor access

### Vendor

Can:

- create products
- edit owned products
- publish or keep products in draft
- create seasonal listings
- request product removal
- view feedback related to products

Cannot:

- delete products directly

### Moderator

Can:

- review comments
- make comments visible, hidden, or rejected
- review complaints
- resolve, reject, or escalate complaints

### Admin

Can:

- review vendor access requests at stage 1
- review product removal requests at stage 1
- manage user status
- view marketplace statistics

### Super Admin

Can:

- finalize vendor access requests
- finalize product removal requests
- change user roles
- change global settings
- review the audit log

## Business Rules Implemented

- A user does not become a vendor directly.
- Vendor access always starts as a request.
- Vendor requests require admin review first and super admin approval second.
- Vendors cannot delete products directly.
- Product removal is request-based and moves through two approval stages.
- A product requested for removal becomes `unavailable` while the request is under review.
- Seasonal products automatically become `unavailable` after `available_until`.
- Comments enter moderation flow through `pending_review`.
- Complaints can target products, comments, or users.
- Important actions are written into the audit log.

## Application Pages

The frontend is a single-page application with route-based views.

### Public routes

| Route | Access | What the page contains |
|---|---|---|
| `/` | Public | Landing page, project overview, business rules, quick explanation of roles, seeded demo account information |
| `/login` | Public | Login form for existing accounts |
| `/register` | Public | Registration form for new customer accounts |

### Authenticated routes

| Route | Access | What the page contains |
|---|---|---|
| `/dashboard` | Authenticated | Role-aware dashboard, marketplace metrics, recent products, recent activity |
| `/profile` | Authenticated | Profile form, account details, personal comments, complaints, and vendor request section for customers |
| `/products` | Authenticated | Product catalog, category filters, permanent vs seasonal filtering |
| `/products/:id` | Authenticated | Product detail, comments, complaint actions, comment submission form |

### Vendor routes

| Route | Access | What the page contains |
|---|---|---|
| `/vendor/products` | Vendor | Vendor product list, edit shortcuts, product removal request actions, vendor removal request history |
| `/vendor/add-product` | Vendor | Product creation form |
| `/vendor/add-product?edit=:id` | Vendor | Product edit mode using the same form |

### Moderator routes

| Route | Access | What the page contains |
|---|---|---|
| `/moderator/complaints` | Moderator | Complaint review queue with resolve, reject, and escalate actions |
| `/moderator/comments` | Moderator | Comment moderation queue with visible, hidden, and rejected decisions |

### Admin routes

| Route | Access | What the page contains |
|---|---|---|
| `/admin/users` | Admin | User list, roles, status, activate/suspend actions |
| `/admin/vendor-requests` | Admin | Stage 1 vendor request approval queue |
| `/admin/product-removals` | Admin | Stage 1 product removal approval queue |
| `/admin/stats` | Admin | Marketplace statistics, product breakdown, recent logs |

### Super Admin routes

| Route | Access | What the page contains |
|---|---|---|
| `/super-admin/settings` | Super Admin | Global settings form, final vendor request queue, final product removal queue, role management |
| `/super-admin/audit` | Super Admin | Full audit log view |

## API Routes

Yes. The application already includes API routes and the frontend uses them directly.

### Authentication API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/session` | Returns current session state |
| `POST` | `/api/auth/register` | Creates a new customer account |
| `POST` | `/api/auth/login` | Logs in a user |
| `POST` | `/api/auth/logout` | Logs out a user |

### General authenticated API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/dashboard` | Returns dashboard data |
| `GET` | `/api/profile` | Returns profile data |
| `POST` | `/api/profile` | Updates profile data |
| `GET` | `/api/products` | Returns catalog products |
| `GET` | `/api/products/:id` | Returns product detail data |
| `POST` | `/api/products/:id/comment` | Creates a moderated product comment |
| `POST` | `/api/complaints` | Creates a complaint |

### Vendor API

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/vendor/request-access` | Customer requests vendor access |
| `GET` | `/api/vendor/products` | Returns vendor-owned products and removal history |
| `POST` | `/api/products` | Creates a new product |
| `POST` | `/api/products/:id/update` | Updates a product |
| `POST` | `/api/products/:id/removal-request` | Creates a product removal request |

### Moderator API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/moderator/comments` | Returns comment moderation queue |
| `POST` | `/api/moderator/comments/:id/review` | Saves comment moderation decision |
| `GET` | `/api/moderator/complaints` | Returns complaint queue |
| `POST` | `/api/moderator/complaints/:id/review` | Resolves, rejects, or escalates a complaint |

### Admin API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/admin/users` | Returns user management data |
| `POST` | `/api/admin/users/:id/status` | Activates or suspends a user |
| `GET` | `/api/admin/vendor-requests` | Returns stage 1 vendor request queue |
| `POST` | `/api/admin/vendor-requests/:id/review` | Approves or rejects vendor request at admin stage |
| `GET` | `/api/admin/product-removals` | Returns stage 1 removal queue |
| `POST` | `/api/admin/product-removals/:id/review` | Approves or rejects removal request at admin stage |
| `GET` | `/api/admin/stats` | Returns stats and logs |

### Super Admin API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/super-admin/settings` | Returns settings, role data, and final approval queues |
| `POST` | `/api/super-admin/settings` | Updates global settings |
| `POST` | `/api/super-admin/users/:id/role` | Changes a user role |
| `POST` | `/api/super-admin/vendor-requests/:id/finalize` | Final approval or rejection of vendor request |
| `POST` | `/api/super-admin/product-removals/:id/finalize` | Final approval or rejection of product removal |
| `GET` | `/api/super-admin/audit` | Returns the audit log |

## Project Files

Main files:

- [server.js](/D:/Codex/sites/Openmarket/server.js) - backend server, routing, storage, business logic
- [static/index.html](/D:/Codex/sites/Openmarket/static/index.html) - main HTML shell
- [static/style.css](/D:/Codex/sites/Openmarket/static/style.css) - styling
- [static/app.js](/D:/Codex/sites/Openmarket/static/app.js) - frontend router and UI logic
- [data/](/D:/Codex/sites/Openmarket/data) - JSON storage
- [package.json](/D:/Codex/sites/Openmarket/package.json) - package metadata

## Run Locally

```bash
npm start
```

Default local URL:

```text
http://localhost:8000
```

## Demo Accounts

All seeded demo accounts use the same password:

```text
OpenMarket123!
```

Available seeded accounts:

- `customer@openmarket.local`
- `vendor@openmarket.local`
- `moderator@openmarket.local`
- `admin@openmarket.local`
- `superadmin@openmarket.local`

## Final Notes

- The whole application is in English.
- The current database layer is JSON-file based.
- The logical schema is already structured well enough for a future SQL migration.
- The API layer already exists and is active in the current implementation.
