# CargoNepal — RLS Policies

Row Level Security is defined in the migration
[`migrations/0008_rls_policies.sql`](../migrations/0008_rls_policies.sql) so it is
applied automatically and version-controlled with the schema.

This file is the human-readable index of the access model.

## Model

RLS is **enabled on every table**. There are **no `using (true)` / allow-everyone
policies**. All privileged writes (pricing finalization, rider matching, payment
verification, COD settlement, earnings crediting) run inside **SECURITY DEFINER**
Edge Functions using the service-role key, which is never sent to the browser.

## Roles

| Role | Access |
|------|--------|
| `customer` | Own `users`, `customer_profiles`, `addresses`, `orders` (own), `payments` (own), `notifications`, `ratings` (own), `support_tickets` (own). Can update own order only while `PENDING`/`SEARCHING_RIDER`. |
| `rider` | Own `rider_profiles` (availability + location only), `vehicles`, `rider_documents`, assigned `orders`, own `rider_dispatches`, `cod_transactions`, `rider_earnings`, `wallet_transactions`. |
| `admin` | Administrative read/write across orders, riders, customers, payments, COD, pricing, promos, service areas, support, settings. Read-only `audit_logs`. |
| `super_admin` | Same as admin, plus destructive/settings operations gated by `is_super_admin()`. |

## Helper functions

- `public.current_role_name()` — role of `auth.uid()`
- `public.is_admin()` — true for admin/super_admin
- `public.is_super_admin()` — true for super_admin only
- `public.is_self(uuid)` — row belongs to caller
- `public.is_order_rider(order_id)` — caller is the assigned rider

## Cross-user visibility rules

- A **customer** may read the **rider profile** and **users** contact row for riders
  assigned to their order (needed for live tracking + contact).
- A **rider** may read the **customer/users** contact row for their assigned orders
  (needed for pickup/dropoff coordination).
- These are scoped by `EXISTS (select 1 from orders ...)` so only the parties to an
  order can see each other — never the full user table.

## Storage

Buckets are private except `avatars` and `marketing`. Object policies restrict
writes to `<bucket>/<auth.uid()>/...` and reads to owner-or-admin. Delivery proof,
rider documents, and parcel images are served via short-lived signed URLs.

## Verification

RLS tests live in [`../../tests/rls.test.ts`](../../tests/rls.test.ts) and can be run
against a real project with `pgTAP` (see `docs/TESTING.md`).
