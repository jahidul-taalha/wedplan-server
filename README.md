# WedPlan Server

Backend API for **WedPlan**, a wedding-services platform. It provides authentication, service listings, booking workflows, premium vendor subscriptions via Stripe, and admin moderation tools.

## Technology Stack

- **Runtime / Language:** Node.js, TypeScript (ESM, `NodeNext`)
- **Web framework:** Express 5
- **Database:** MongoDB (native `mongodb` driver)
- **Authentication:** Better Auth with the MongoDB adapter and JWT plugin; `jose` for remote JWKS token verification
- **Payments:** Stripe Checkout + signed webhooks
- **Other:** `cors`, `dotenv`
- **Dev tooling:** `tsx` (dev/seed scripts), TypeScript compiler (`tsc`)

## Features by Role

Authentication is handled by Better Auth under `/api/auth/*` (email/password sign-up and sign-in, Google OAuth, sessions, and JWTs). New accounts default to `customer`; requesting `vendor` at sign-up creates a vendor account. Admin accounts are created with the seed command below.

### Customer

- Browse approved, active services with search, category, location, pagination, and price sorting (`GET /api/services`, `GET /api/services/:id`)
- Create a booking request for a service and event date (`POST /api/bookings`)
- View own bookings with service and vendor details (`GET /api/bookings/my`)
- Cancel a pending booking (`PATCH /api/bookings/:id/cancel`)
- View booking counts by status (`GET /api/bookings/stats`)
- Retrieve the current authenticated user (`GET /api/me`)

### Vendor

- Manage own service listings: create, update, and delete (owner-only) (`POST /api/services`, `PATCH /api/services/:id`, `DELETE /api/services/:id`)
- List own services (`GET /api/services/mine/list`)
- Free plan is limited to 3 active services; premium removes the limit
- View bookings received for own services (`GET /api/bookings/vendor`)
- Accept or reject pending bookings (`PATCH /api/bookings/:id/status`)
- View booking counts by status (`GET /api/bookings/stats`)
- Start a Stripe Checkout session and check its payment status (`POST /api/payments/create-checkout-session`, `GET /api/payments/session/:sessionId`)
- Stripe webhook activates the premium plan after a paid checkout (`POST /api/payments/webhook`, signature-verified)

### Admin

- Platform statistics: users, vendors, customers, services, pending services, transactions (`GET /api/admin/stats`)
- List/search/filter users and view a single user (`GET /api/admin/users`, `GET /api/admin/users/:id`)
- Block or unblock a user (`PATCH /api/admin/users/:id/block`)
- List premium transactions (`GET /api/admin/transactions`)
- Review all services and set status to approved / rejected / pending, or delete a service (`GET /api/services/admin/all`, `PATCH /api/services/admin/:id/status`, `DELETE /api/services/admin/:id`)
- Role-check test endpoint (`GET /api/admin-test`)

All protected endpoints require a `Bearer` JWT in the `Authorization` header. Blocked accounts are rejected with `403`.

## Installation

1. Clone the server repository and enter it:

   ```bash
   git clone https://github.com/jahidul-taalha/wedplan-server.git
   cd wedplan-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the example environment file and fill in your own values:

   ```bash
   cp .env.example .env
   ```

## Environment Variables

Set the following variable names in `.env` (see `.env.example` for the template). Never commit real values.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the HTTP server listens on |
| `MONGODB_URI` | MongoDB connection string |
| `BETTER_AUTH_SECRET` | Secret used by Better Auth |
| `BETTER_AUTH_URL` | Server base URL used for auth and JWKS discovery |
| `CLIENT_URL` | Allowed CORS / trusted client origin |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Stripe price ID for the premium plan |

Admin seed script variables: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Running Locally

Development mode (auto-reload via `tsx watch`):

```bash
npm run dev
```

Production build and run:

```bash
npm run build
npm start
```

The server exposes `GET /` and `GET /health` for basic checks.

## Admin Seed

This repository defines an admin seed command in `package.json`:

```bash
npm run seed:admin
```

It requires `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` to be set. It creates the account if it does not exist, promotes it to the `admin` role, and clears its blocked status.

## Live Server

`https://<your-live-server-url>`

## Repositories

- Client: https://github.com/jahidul-taalha/wedplan-client
- Server: https://github.com/jahidul-taalha/wedplan-server
