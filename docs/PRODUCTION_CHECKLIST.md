# CargoNepal — Production Checklist

Complete every item before going live. Items marked **[credential]** require a real
third-party key; until provided, the platform runs in sandbox and surfaces the requirement
rather than faking the integration (spec §59).

---

## 1. Backend / database

- [ ] All migrations `0001`–`0009` applied in order to the production database.
- [ ] `supabase/seed/seed.sql` applied (service areas, default pricing, templates, settings).
- [ ] Row Level Security **enabled on every table**; no allow-everyone policies present.
- [ ] `handle_new_user` trigger provisions profiles on signup (verified with a test account).
- [ ] Realtime publication includes: `orders`, `order_tracking`, `order_status_history`,
      `rider_profiles`, `rider_dispatches`, `notifications`.
- [ ] Storage buckets exist: private `proof-of-delivery`, `rider-documents`, `parcel-images`;
      public `avatars`, `marketing`. Per-user path policies enforced.
- [ ] Database backups / PITR enabled.
- [ ] At least one `super_admin` promoted; admin accounts created through the real flow.

## 2. Edge Functions

- [ ] All 18 functions deployed (`supabase functions deploy`).
- [ ] Server secrets set (see §5) — **not** the `VITE_` browser variables.
- [ ] `create-order` / `fare-estimate` compute pricing server-side (client totals ignored).
- [ ] `payment-verify` confirms via provider lookup; frontend redirect never trusted.
- [ ] `qr-verify` validates the opaque token server-side; QR carries no PII.
- [ ] `cod-settle` requires an admin and writes an audit log; COD never auto-settles.
- [ ] Functions return `configured:false` (not fake success) when a provider key is missing.

## 3. Frontend

- [ ] `npm run build` succeeds; `npm run typecheck` and `npm run lint` pass clean.
- [ ] `npm test` passes (pricing, geo/matching, order-status).
- [ ] All `VITE_*` variables set in the host build environment.
- [ ] SPA fallback configured so deep routes resolve to `index.html`.
- [ ] Firebase service worker (`firebase-messaging-sw.js`) served from site root and configured.
- [ ] Maps render with a real key; graceful placeholder when the key is absent.
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` or payment secret present in the bundle/network traffic.

## 4. **[credential]** Third-party integrations

| Service | Purpose | Sandbox → Production |
|---------|---------|----------------------|
| Supabase | DB/Auth/Storage/Realtime | project ref + anon + service-role keys |
| Google Maps | Maps, directions, geocoding, ETA | browser key (referrer-restricted) + server key (IP-restricted) |
| Firebase Cloud Messaging | Push notifications | web config + VAPID key + `FCM_SERVER_KEY` |
| Khalti | Digital payments | `test_` key → live secret key |
| eSewa | Digital payments | `EPAYTEST` → live merchant code + secret |
| Fonepay | Digital payments (optional) | merchant code + secret |
| SMS provider | Phone OTP | Supabase Auth SMS (Twilio/MessageBird) configured for OTP delivery |

- [ ] Each sandbox integration verified end-to-end before swapping to live keys.
- [ ] Live payment keys set only after sandbox verification passes.
- [ ] Payment provider webhooks/callback URLs pointed at the production domain.

## 5. Secrets inventory (server-side)

```
SUPABASE_SERVICE_ROLE_KEY   GOOGLE_MAPS_SERVER_KEY   FCM_SERVER_KEY
KHALTI_SECRET_KEY           KHALTI_BASE_URL          KHALTI_VERIFY_URL
ESEWA_MERCHANT_CODE         ESEWA_SECRET_KEY         ESEWA_GATEWAY_URL   ESEWA_STATUS_VERIFY_URL
FonePay_MERCHANT_CODE       FonePay_SECRET           FonePay_GATEWAY_URL
PLATFORM_BASE_URL
```

- [ ] All set via `supabase secrets set` / host secret manager.
- [ ] None committed to the repository; `.env` is git-ignored.
- [ ] Keys rotated on a schedule; service-role key restricted to functions/CI.

## 6. Business configuration (admin-editable, no code change)

- [ ] `pricing_rules`: base fare, per-km, per-kg, minimum fare, COD fee/%, waiting fee,
      peak multiplier + hours, priority/express/fragile fees, commission %, distance limits.
- [ ] `service_areas`: cities, radius, operating hours, zone multipliers for each launch city.
- [ ] `app_settings`: commission %, dispatch TTL/max attempts, radius ladder, GPS interval,
      high-value OTP threshold, support contacts.
- [ ] `notification_templates`: all keys active with correct copy.
- [ ] At least one `promo_codes` entry if running a launch promotion (optional).

## 7. Security & compliance

- [ ] API input validation on every endpoint; internal errors never leaked to clients.
- [ ] Google Maps keys restricted (referrer for browser, IP for server).
- [ ] Rider document uploads are private and access-controlled.
- [ ] Admin actions (rider status, pricing, refunds, COD settlement, manual status) audited.
- [ ] Cancellation fee/free-window behavior matches config.
- [ ] Privacy policy and terms published and linked from the app (spec §4/§31 screens).

## 8. Observability & ops

- [ ] Edge Function logs monitored; alerting on 5xx and on `configured:false` in production.
- [ ] Failed-delivery and payment-issue notifications reach admins.
- [ ] Support ticket inbox staffed; SLA defined.
- [ ] On-call runbook: how to re-dispatch a stuck order, refund a payment, settle COD.

## 9. Launch smoke test (production)

- [ ] Sign up customer + rider; approve rider as admin.
- [ ] Book a real parcel, accept as rider, track live, deliver with POD.
- [ ] COD collected → appears pending → admin settles → audit logged.
- [ ] Digital payment (live) completes and verifies server-side.
- [ ] Earnings recorded; admin KPIs reflect the transaction.

---

**Sign-off:** backend ☐ · frontend ☐ · payments ☐ · security ☐ · ops ☐
