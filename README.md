# OpenMarket

OpenMarket is a self-contained multi-vendor marketplace demo built with Node.js and plain frontend assets. The application follows the supplied plan: role-based access, vendor approval, comment and complaint moderation, product removal workflow, seasonal product availability, admin dashboards, super admin controls, and audit logging.

## Stack

- Node.js standard library only
- Static HTML, CSS, and vanilla JavaScript
- JSON file storage in `data/`

## Run locally

```bash
npm start
```

The app starts on `http://localhost:8000` by default.

## Demo accounts

All seeded demo accounts use the same password:

```text
OpenMarket123!
```

- `customer@openmarket.local`
- `vendor@openmarket.local`
- `moderator@openmarket.local`
- `admin@openmarket.local`
- `superadmin@openmarket.local`

## What is included

- Public landing page plus `/login` and `/register`
- Authenticated catalog, dashboard, and profile
- Vendor request workflow with admin and super admin approvals
- Product creation and edit flow for vendors
- Product removal workflow with two-step approval
- Product comments, moderation queue, and complaint queue
- Admin pages for users, requests, removals, and statistics
- Super admin settings, role management, and audit logs

## Notes

- JSON files are created and seeded automatically on first run.
- Seasonal products automatically become unavailable after `available_until`.
- The entire interface is written in English.
