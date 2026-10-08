# CargoNepal

> **Fast. Safe. Parcel First.** — instant bike-courier & parcel delivery platform for Nepal.

CargoNepal is a production-ready, courier-first delivery platform (concept similar to
inDrive/Pathao Courier, but 100% parcel-focused — **no passenger rides**). Customers book a
bike courier instantly, the system finds the nearest available rider, the customer tracks the
rider live on a map, and pays digitally (Khalti / eSewa / Fonepay) or by Cash on Delivery.

## Platform composition

| Component | Location | Stack |
|-----------|----------|-------|
| Web apps (Customer, Rider, Admin, Landing) | `apps/web` | Vite + React 18 + TypeScript + Tailwind |
| Database, Auth, Storage, Realtime | `supabase/migrations` | PostgreSQL (Supabase) |
| Backend API | `supabase/functions` | Supabase Edge Functions (Deno) |
| Baseline configuration | `supabase/seed` | SQL (config only — no fake data) |
| Tests | `tests` | Vitest |
| Docs | `docs` | Deployment, testing, production checklist |

Roles are **Customer**, **Rider**, **Admin**, and **Super Admin**, enforced with role-based
access control in both the database (Row Level Security) and the API.

## Repository layout

```
.
├── apps/web/                 # Single React app serving all role dashboards + landing
│   └── src/
│       ├── components/       # MapView + shared UI kit
│       ├── core/             # config, constants, hooks (auth, realtime, geolocation), theme, utils
│       ├── models/           # TypeScript domain types
│       ├── routes/           # role guards
│       ├── screens/          # landing, auth, customer, rider, admin
│       ├── services/         # supabase client + auth/orders/payments/maps/storage/notifications
│       └── widgets/          # Logo, etc.
├── supabase/
│   ├── migrations/           # 0001..0009 schema, enums, RLS, triggers, realtime, storage
│   ├── functions/            # Edge Functions (backend API) + _shared helpers
│   └── seed/seed.sql         # service areas, default pricing, templates, app settings
├── tests/                    # pricing, geo/matching, order-status state machine
├── docs/                     # DEPLOYMENT, TESTING, PRODUCTION_CHECKLIST
└── .env.example              # every required environment variable
```

## Quick start (local)

```bash
# 1. Install dependencies (npm workspaces)
npm install

# 2. Configure environment
cp .env.example .env          # fill in Supabase, Maps, Firebase, payment keys

# 3. Run the web app
npm run dev                   # http://localhost:5173
```

Backend setup (Supabase schema, functions, seed) is documented in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Run the test suite with `npm test`
(see [`docs/TESTING.md`](docs/TESTING.md)).

## How a delivery works

1. **Customer** books a parcel: pickup + drop-off (map/search/saved), parcel details,
   payment method. Fare is calculated **server-side** by the pricing engine.
2. `create-order` inserts the order and triggers **`match-rider`**, which searches an
   expanding radius ladder (1 → 2 → 5 km), nearest-first, and dispatches a time-boxed
   request to eligible riders (online, approved, no active order, in service area).
3. A **rider** accepts (or the request expires/rejects and re-dispatches to the next best).
4. The rider app streams **GPS** (`track-location`); the customer watches live on the map
   via **Supabase Realtime** — no page refreshes.
5. Pickup and delivery are verified with a **PII-free QR** code and, for high-value parcels,
   an **OTP**. Delivery captures **proof of delivery** (photo/signature/receiver name).
6. On `DELIVERED`, rider earnings and COD records are created. **COD is never auto-settled** —
   an admin records settlement (`cod-settle`).
7. Digital payments are confirmed **only** by server-side provider verification (`payment-verify`).

## Security model (spec §28)

- Supabase Auth (phone OTP, email/password, Google) with JWT sessions.
- **Row Level Security on every table** — no allow-everyone policies. Customers see only
  their own orders; riders only their assigned orders; admins via `is_admin()`.
- The **service-role key is server-only** (Edge Functions / CI). It is never shipped to the browser.
- Payment success is verified server-side; the frontend redirect is never trusted.
- QR tokens are opaque and contain no customer PII; verification happens server-side.
- Storage buckets are private with per-user path policies; uploads are type/size validated.
- Admin actions are written to `audit_logs`.
- Secrets come from environment variables — **nothing is hardcoded**.

## Missing credentials are never faked (spec §59)

When an external provider (payment gateway, FCM, Maps) is not yet configured, the relevant
Edge Function returns `configured: false` with a clear message and the UI shows the setup
requirements (`/setup`). The integration architecture, environment variables, and sandbox
modes are all in place so real keys can be dropped in without code changes. See
[`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) for the exact credentials needed.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the web app dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint the web app |
| `npm run typecheck` | Type-check the web app |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run tests in watch mode |

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Supabase project, migrations, functions, secrets, hosting.
- [`docs/TESTING.md`](docs/TESTING.md) — unit tests, and how to exercise each flow end-to-end.
- [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) — go-live checklist and required credentials.
