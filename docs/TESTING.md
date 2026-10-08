# CargoNepal — Testing Guide

Testing has two layers: **automated unit tests** for the pure business logic, and a
**manual end-to-end checklist** for the flows that require a live Supabase project, maps, and
payment sandboxes.

---

## 1. Automated unit tests (Vitest)

The pricing engine, geo/matching helpers, and order state machine are pure, dependency-free
modules under `supabase/functions/_shared/`, so they are unit-tested directly.

```bash
npm install          # installs vitest (root devDependency)
npm test             # run once
npm run test:watch   # watch mode
```

Config: `vitest.config.ts` (root) — includes `tests/**/*.test.ts`, node environment.

### Coverage

| File | Subject | Asserts |
|------|---------|---------|
| `tests/pricing.test.ts` | `calculateFare`, `computeDiscount`, `isPeakHour` | base/distance/weight, commission split, COD (flat + %), priority/express/fragile/waiting, peak surcharge, minimum-fare floor, service-limit flag, promo percentage/fixed/min-order/max-cap/never-over-subtotal, overnight peak windows |
| `tests/geo.test.ts` | `haversineKm`, `estimateEtaMinutes`, `rankRiders` | zero/symmetric/realistic distances, ETA buffer, nearest-first ranking, drops unknown locations, excludes riders beyond the radius ladder, tie-break by active-orders then rating |
| `tests/order-status.test.ts` | `_shared/status.ts` state machine | full happy path PENDING→DELIVERED, legal vs skipped vs backward transitions, no onward step from DELIVERED, customer-cancellable window, terminal-state detection |

> **Note:** these tests validate the *logic* that the Edge Functions execute server-side.
> The functions themselves (`create-order`, `match-rider`, …) additionally require a live
> database and are exercised through the end-to-end checklist below.

---

## 2. Manual end-to-end checklist

Prereqs: migrations applied, seed loaded, functions deployed, `.env` populated. See
`DEPLOYMENT.md`. Create real accounts through the app — there is no fake seed data.

### Auth & roles
- [ ] Customer signs up with phone → receives OTP → verifies → lands on customer home.
- [ ] Email/password login works; Google OAuth works (if configured).
- [ ] Rider signs up via `/rider/join` → status `pending`.
- [ ] Admin promotes a user to `super_admin` (SQL) → admin dashboard accessible.
- [ ] A customer cannot reach `/admin` or `/rider` routes (role guard redirects).

### Booking & pricing
- [ ] `fare-estimate` returns a breakdown matching the pricing rule for a chosen route.
- [ ] Booking a parcel creates an order with a server-calculated total (not client-supplied).
- [ ] A valid promo code applies the correct discount; an expired/over-limit code is rejected.
- [ ] Distance beyond `max_distance_km` is flagged `within_service_limits = false`.

### Rider matching (spec §8)
- [ ] With an online, approved rider near pickup, a request is dispatched within ~seconds.
- [ ] Rider sees pickup distance, area, estimated earnings, parcel type, COD amount.
- [ ] Rejecting (or letting it expire) re-dispatches to the next-nearest rider.
- [ ] An offline rider receives no requests.
- [ ] After `dispatch_max_attempts`, the order is flagged rather than looping forever.

### Live tracking (spec §12)
- [ ] Rider app streams GPS; the customer map moves the rider marker **without page refresh**.
- [ ] ETA and distance-remaining update; pickup/drop markers and route render.
- [ ] Only the assigned rider and the owning customer can subscribe to that order's channel.

### Lifecycle, QR, POD (spec §13–§15)
- [ ] Status advances through the legal chain; illegal jumps are rejected (422).
- [ ] Every status change writes an `order_status_history` row.
- [ ] Customer QR contains no PII; `qr-verify` succeeds only for the assigned rider.
- [ ] Proof of delivery stores photo/signature/receiver name to the private bucket.
- [ ] High-value parcels require OTP before `DELIVERED`.

### Payments (spec §16–§17)
- [ ] COD: rider sees "Collect NPR X"; on delivery a `cod_transactions` row is `collected`.
- [ ] COD is **never** auto-settled; admin `cod-settle` records settlement + audit.
- [ ] Khalti/eSewa sandbox checkout initiates; `payment-verify` confirms via provider lookup.
- [ ] A tampered/forged frontend "success" does **not** mark a payment successful.
- [ ] With credentials absent, functions return `configured:false` (no fake success).

### Earnings & admin (spec §18–§24)
- [ ] On `DELIVERED`, a `rider_earnings` row and wallet credit are created (idempotent per order).
- [ ] Commission split matches `platform_commission_percent`.
- [ ] Admin dashboard KPIs and charts reflect real orders (`admin-analytics`).
- [ ] Admin live map shows online/busy riders and active deliveries.
- [ ] Admin can approve/reject/suspend riders; each writes an `audit_logs` entry.
- [ ] Pricing changes in the dashboard update future fares and write `pricing_history`.

### Security (spec §28)
- [ ] RLS: customer A cannot read customer B's orders via the API or direct query.
- [ ] Rider can only read assigned orders.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never appears in the browser bundle/network calls.
- [ ] Private storage buckets reject cross-user reads/writes.

---

## 3. Adding tests

New pure logic should live in `supabase/functions/_shared/` (or a frontend util) so it can be
imported by both the runtime and a `tests/*.test.ts` file. Keep DB-dependent behavior in Edge
Functions and cover it through the manual checklist or an integration harness against a staging
Supabase project.
