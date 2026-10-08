# CargoNepal — Deployment Guide

This guide takes the repository from source to a running production platform. The backend is
delivered as **source** (Supabase migrations + Deno Edge Functions); you deploy it to your own
Supabase project with the Supabase CLI. The frontend is a static React build you host anywhere.

---

## 0. Prerequisites

- Node.js ≥ 20
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- A Supabase project (free tier works for staging)
- Accounts/keys for: Google Maps Platform, Firebase (Cloud Messaging), Khalti, eSewa,
  optionally Fonepay. **You can deploy without these** — the platform runs in sandbox and
  reports what is missing (see `PRODUCTION_CHECKLIST.md`).

---

## 1. Environment variables

Copy the template and fill it in. Never commit the real `.env`.

```bash
cp .env.example .env
```

| Variable | Where used | Notes |
|----------|-----------|-------|
| `VITE_SUPABASE_URL` | web | Project URL — safe for browser |
| `VITE_SUPABASE_ANON_KEY` | web | Public anon key — safe for browser (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | server/CI only | **Never** expose to the browser |
| `SUPABASE_DB_URL` | migrations/seed | Postgres connection string |
| `VITE_GOOGLE_MAPS_API_KEY` | web | Browser key, restrict by HTTP referrer |
| `GOOGLE_MAPS_SERVER_KEY` | Edge Functions | Server key, restrict by IP |
| `VITE_FIREBASE_*` | web | Firebase web config (public) |
| `VITE_FIREBASE_VAPID_KEY` | web | Web push VAPID key |
| `FCM_SERVER_KEY` | Edge Functions | Sends push from the server |
| `KHALTI_*` | Edge Functions | Use `test_` keys in sandbox |
| `ESEWA_*` | Edge Functions | `EPAYTEST` merchant in sandbox |
| `FonePay_*` | Edge Functions | Optional |

---

## 2. Database (migrations)

Migrations are ordered and must be applied in sequence. Each is idempotent
(`create ... if not exists`, guarded inserts).

```
supabase/migrations/
  0001_extensions.sql        # pgcrypto, pgjwt, (optional postgis)
  0002_enums.sql             # all domain enums
  0003_identity.sql          # users, customer/rider profiles, vehicles, documents, addresses
  0004_orders.sql            # orders, items, tracking, status history, dispatches, POD, cancellations
  0005_payments.sql          # payments, cod_transactions, rider_earnings, wallet_transactions
  0006_business.sql          # service areas, pricing, promos, notifications, support, ratings, audit, settings
  0007_functions_triggers.sql# profile provisioning, order code/QR gen, status history, distance, audit
  0008_rls_policies.sql      # Row Level Security on every table
  0009_realtime_storage.sql  # realtime publication + storage buckets/policies
```

### Option A — Supabase CLI (recommended for local/staging)

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push            # applies all migrations in supabase/migrations
```

### Option B — psql directly (production DB URL)

```bash
for f in supabase/migrations/0*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

> Apply in filename order. `0007` depends on tables from `0003`–`0006`; `0008` (RLS) should
> run after all tables exist; `0006` wires a deferred FK on `orders.promo_code_id`.

---

## 3. Seed configuration

Seeds **configuration only** — service areas (5 launch cities), the default pricing rule,
notification templates, and app settings. It creates **no** fake users, riders, or orders.

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed/seed.sql
```

The script is safe to re-run.

---

## 4. Edge Functions (backend API)

```bash
# Deploy all functions
supabase functions deploy

# Set server-side secrets (NOT the VITE_ browser vars)
supabase secrets set \
  KHALTI_SECRET_KEY=... KHALTI_BASE_URL=... KHALTI_VERIFY_URL=... \
  ESEWA_MERCHANT_CODE=... ESEWA_SECRET_KEY=... ESEWA_GATEWAY_URL=... ESEWA_STATUS_VERIFY_URL=... \
  FCM_SERVER_KEY=... GOOGLE_MAPS_SERVER_KEY=... \
  PLATFORM_BASE_URL=https://app.cargonepal.com
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the runtime — do not set them manually.

Functions deployed: `create-order`, `fare-estimate`, `match-rider`, `dispatch-response`,
`update-order-status`, `track-location`, `payment-initiate`, `payment-verify`, `qr-generate`,
`qr-verify`, `proof-of-delivery`, `rider-register`, `rider-status`, `rider-earnings`,
`cancel-order`, `nearby-riders`, `cod-settle`, `admin-analytics`. See
`supabase/functions/README.md`.

---

## 5. Storage buckets

`0009_realtime_storage.sql` creates the buckets and their policies:

- **Private:** `proof-of-delivery`, `rider-documents`, `parcel-images`
- **Public:** `avatars`, `marketing`

Policies restrict writes to `<bucket>/<auth.uid()>/...`. No manual setup is required, but
confirm the buckets exist in the dashboard after migrating.

---

## 6. First admin account

There are no seeded users. Bootstrap an admin:

1. Sign up through the app (or Supabase Auth) with the account you want as admin.
2. Promote it in the database:

```sql
update public.users set role = 'super_admin' where id = '<that-user-id>';
```

The `handle_new_user` trigger provisions the matching profile row on signup. Super admins can
then create/promote other admins from the dashboard.

---

## 7. Frontend build & hosting

```bash
npm install
npm run build          # outputs apps/web/dist
```

Host `apps/web/dist` on any static CDN (Vercel, Netlify, Cloudflare Pages, S3+CloudFront).
Set the `VITE_*` variables in the host's build environment. Enable SPA fallback so client
routes (`/customer`, `/rider`, `/admin`, …) resolve to `index.html`.

The Firebase web-push service worker is at `apps/web/public/firebase-messaging-sw.js`; ensure
it is served from the site root and that its config is populated at build time.

---

## 8. Post-deploy smoke test

1. Load the landing page; confirm maps render (or the "Maps key missing" placeholder).
2. Sign up a customer → verify OTP → reach the customer home.
3. Register a rider → approve it as admin from `/admin`.
4. Bring the rider online; book a parcel as the customer; confirm the rider receives a request.
5. Accept → watch live tracking → complete pickup (QR) → deliver (POD).
6. Confirm earnings/COD rows appear in the admin dashboard.

See `docs/TESTING.md` for the full end-to-end checklist.

---

## 9. Production hardening

- Restrict the Google Maps browser key by referrer and the server key by IP.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Supabase secrets / CI.
- Verify RLS is enabled on all tables (`0008` does this) — never add allow-everyone policies.
- Use live payment keys only after sandbox verification passes.
- Enable database backups (Supabase PITR) and store `audit_logs` retention policy.

Full go-live checklist: `docs/PRODUCTION_CHECKLIST.md`.
