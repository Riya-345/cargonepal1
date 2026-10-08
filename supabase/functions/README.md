# CargoNepal — Supabase Edge Functions (Backend API)

Deno-based Edge Functions implementing the platform's server-side API.
Every privileged operation runs here with the **service-role key** (never
exposed to the browser), so RLS stays locked down on the client.

## Functions

| Function | HTTP | Purpose | Spec |
|----------|------|---------|------|
| `create-order` | POST | Creates an order with **server-calculated** pricing, validates promo, triggers matching | §7, §35 |
| `fare-estimate` | POST | Fare breakdown + ETA without creating an order | §7, §42 |
| `match-rider` | POST | Expanding-radius (1→2→5 km) nearest-rider dispatch + re-dispatch | §8 |
| `dispatch-response` | POST | Rider accepts/rejects; accept → RIDER_ACCEPTED, reject → re-match | §8 |
| `update-order-status` | POST | Authorized lifecycle transitions + history + delivered/terminal side effects | §13, §35 |
| `track-location` | POST | Rider GPS ingest → live position + order breadcrumbs | §12, §35 |
| `payment-initiate` | POST | Creates payment + provider checkout params (Khalti/eSewa/Fonepay) | §17, §35 |
| `payment-verify` | POST | **Server-side** provider verification; only this confirms success | §17, §35 |
| `qr-generate` | POST | Returns minimal, PII-free QR payload for an order | §14, §35 |
| `qr-verify` | POST | Rider scans QR → verifies token + assignment → advances state | §14, §35 |
| `proof-of-delivery` | POST | Stores POD, verifies OTP for high-value, marks DELIVERED, credits earnings | §15, §32 |
| `rider-register` | POST | Completes rider profile, vehicle, documents (status=pending) | §10, §35 |
| `rider-status` | POST | Admin approve/reject/suspend/activate + audit log | §22, §45 |
| `rider-earnings` | GET | Rider earnings summary (today/week/month) | §32, §35 |
| `cancel-order` | POST | Configurable cancellation fee, refund, release rider, audit | §41, §35 |
| `nearby-riders` | GET | Online riders near a point (admin live map) | §21, §35 |
| `cod-settle` | POST | Admin settles rider COD (never automatic) + audit | §16 |
| `admin-analytics` | GET | Dashboard KPIs + daily time-series for charts | §19, §44 |

Shared code lives in `_shared/` (`http.ts`, `pricing.ts`, `geo.ts`, `notify.ts`).

## Deploy

```bash
# from repo root, with the Supabase CLI linked to your project
supabase functions deploy create-order
supabase functions deploy fare-estimate
supabase functions deploy match-rider
supabase functions deploy dispatch-response
supabase functions deploy update-order-status
supabase functions deploy track-location
supabase functions deploy payment-initiate
supabase functions deploy payment-verify
supabase functions deploy qr-generate
supabase functions deploy qr-verify
supabase functions deploy proof-of-delivery
supabase functions deploy rider-register
supabase functions deploy rider-status
supabase functions deploy rider-earnings
supabase functions deploy cancel-order
supabase functions deploy nearby-riders
supabase functions deploy cod-settle
supabase functions deploy admin-analytics

# or deploy everything:
supabase functions deploy
```

## Required secrets

```bash
supabase secrets set \
  KHALTI_SECRET_KEY=... KHALTI_BASE_URL=... KHALTI_VERIFY_URL=... \
  ESEWA_MERCHANT_CODE=... ESEWA_SECRET_KEY=... ESEWA_GATEWAY_URL=... \
  FCM_SERVER_KEY=... GOOGLE_MAPS_SERVER_KEY=... PLATFORM_BASE_URL=https://app.cargonepal.com
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by the Supabase runtime.

## Security notes (spec §28, §59)

- Payment success is confirmed **only** by `payment-verify` calling the provider
  lookup API — the frontend redirect is never trusted.
- QR payloads contain no PII; verification is server-side against `orders.qr_token`.
- When provider credentials are absent, functions return `configured: false`
  with a clear message rather than faking success (spec §59).
- All client input is validated; internal/DB errors are never leaked (spec §39).
