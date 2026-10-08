-- ============================================================
-- CargoNepal — Migration 0008: Row Level Security
-- ============================================================
-- Principles (spec §28, §55):
--   * RLS enabled on EVERY table. No "allow everyone" policies.
--   * Customers see only their own data.
--   * Riders see only assigned/authorized data + own profile.
--   * Admins/super-admins see administrative data.
--   * Writes that must bypass RLS (pricing calc, matching, payment
--     verification) run in SECURITY DEFINER Edge Functions using the
--     service role — never from the browser.
-- ============================================================

-- Enable RLS everywhere.
do $$
declare t text;
begin
  foreach t in array array[
    'users','customer_profiles','rider_profiles','vehicles','rider_documents','addresses',
    'orders','order_items','order_tracking','order_status_history','rider_dispatches',
    'proof_of_delivery','order_cancellations','payments','cod_transactions','rider_earnings',
    'wallet_transactions','service_areas','pricing_rules','pricing_history','promo_codes',
    'promo_usage','notifications','notification_templates','support_tickets',
    'support_ticket_messages','ratings','audit_logs','app_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Helper: is the current user the rider owning a rider_profiles row?
create or replace function public.is_self(p_id uuid)
returns boolean language sql stable as $$
  select p_id = auth.uid();
$$;

-- Helper: is current user the rider assigned to an order?
create or replace function public.is_order_rider(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.rider_id = auth.uid()
  );
$$;

-- ============================================================
-- users
-- ============================================================
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (
    public.is_self(id)
    or public.is_admin()
    -- A rider may read the minimal contact of customers on their orders,
    -- and customers may read the rider assigned to their order.
    or exists (select 1 from public.orders o where o.customer_id = users.id and o.rider_id = auth.uid())
    or exists (select 1 from public.orders o where o.rider_id = users.id and o.customer_id = auth.uid())
  );

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (public.is_self(id)) with check (public.is_self(id));

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- customer_profiles
-- ============================================================
drop policy if exists customer_profiles_select on public.customer_profiles;
create policy customer_profiles_select on public.customer_profiles
  for select using (public.is_self(id) or public.is_admin());
drop policy if exists customer_profiles_update on public.customer_profiles;
create policy customer_profiles_update on public.customer_profiles
  for update using (public.is_self(id) or public.is_admin()) with check (public.is_self(id) or public.is_admin());
drop policy if exists customer_profiles_insert on public.customer_profiles;
create policy customer_profiles_insert on public.customer_profiles
  for insert with check (public.is_self(id) or public.is_admin());

-- ============================================================
-- rider_profiles
-- ============================================================
drop policy if exists rider_profiles_select on public.rider_profiles;
create policy rider_profiles_select on public.rider_profiles
  for select using (
    public.is_self(id)
    or public.is_admin()
    -- Customers can view the rider assigned to their order (name, rating, location).
    or exists (select 1 from public.orders o where o.rider_id = rider_profiles.id and o.customer_id = auth.uid())
  );
drop policy if exists rider_profiles_update_self on public.rider_profiles;
-- Riders update own availability + live location; NOT their approval status.
create policy rider_profiles_update_self on public.rider_profiles
  for update using (public.is_self(id)) with check (public.is_self(id));
drop policy if exists rider_profiles_admin_all on public.rider_profiles;
create policy rider_profiles_admin_all on public.rider_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- vehicles & rider_documents
-- ============================================================
drop policy if exists vehicles_owner on public.vehicles;
create policy vehicles_owner on public.vehicles
  for all using (public.is_self(rider_id) or public.is_admin())
  with check (public.is_self(rider_id) or public.is_admin());

drop policy if exists rider_documents_owner on public.rider_documents;
create policy rider_documents_owner on public.rider_documents
  for all using (public.is_self(rider_id) or public.is_admin())
  with check (public.is_self(rider_id) or public.is_admin());

-- ============================================================
-- addresses
-- ============================================================
drop policy if exists addresses_owner on public.addresses;
create policy addresses_owner on public.addresses
  for all using (public.is_self(user_id) or public.is_admin())
  with check (public.is_self(user_id) or public.is_admin());

-- ============================================================
-- orders (spec §28: customer only own; rider only assigned)
-- ============================================================
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    public.is_self(customer_id)
    or public.is_self(rider_id)
    or public.is_admin()
  );

-- Customers create their own orders. Server function finalizes pricing.
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert with check (public.is_self(customer_id));

-- Customers may update their own order ONLY while it is still PENDING
-- (before a rider is engaged). All lifecycle transitions go through
-- SECURITY DEFINER functions invoked by authorized roles.
drop policy if exists orders_update_customer on public.orders;
create policy orders_update_customer on public.orders
  for update using (
    public.is_self(customer_id)
    and status in ('PENDING','SEARCHING_RIDER')
  ) with check (public.is_self(customer_id));

drop policy if exists orders_update_rider on public.orders;
create policy orders_update_rider on public.orders
  for update using (public.is_self(rider_id) or public.is_admin())
  with check (public.is_self(rider_id) or public.is_admin());

-- ============================================================
-- order_items / order_tracking / order_status_history
-- ============================================================
drop policy if exists order_items_policy on public.order_items;
create policy order_items_policy on public.order_items
  for all using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_items.order_id and (o.customer_id = auth.uid() or o.rider_id = auth.uid()))
  ) with check (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_items.order_id and o.customer_id = auth.uid())
  );

-- Tracking points: written by the assigned rider; read by customer/rider/admin.
drop policy if exists order_tracking_select on public.order_tracking;
create policy order_tracking_select on public.order_tracking
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_tracking.order_id and (o.customer_id = auth.uid() or o.rider_id = auth.uid()))
  );
drop policy if exists order_tracking_insert on public.order_tracking;
create policy order_tracking_insert on public.order_tracking
  for insert with check (
    public.is_self(rider_id)
    or public.is_admin()
  );

-- Status history: read-only to participants; written by triggers/functions.
drop policy if exists order_status_history_select on public.order_status_history;
create policy order_status_history_select on public.order_status_history
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_status_history.order_id and (o.customer_id = auth.uid() or o.rider_id = auth.uid()))
  );

-- ============================================================
-- rider_dispatches (spec §8). Rider sees own requests.
-- ============================================================
drop policy if exists rider_dispatches_select on public.rider_dispatches;
create policy rider_dispatches_select on public.rider_dispatches
  for select using (public.is_self(rider_id) or public.is_admin());
-- Riders update only their own dispatch response (accept/reject).
drop policy if exists rider_dispatches_update on public.rider_dispatches;
create policy rider_dispatches_update on public.rider_dispatches
  for update using (public.is_self(rider_id)) with check (public.is_self(rider_id));

-- ============================================================
-- proof_of_delivery
-- ============================================================
drop policy if exists proof_of_delivery_select on public.proof_of_delivery;
create policy proof_of_delivery_select on public.proof_of_delivery
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = proof_of_delivery.order_id and (o.customer_id = auth.uid() or o.rider_id = auth.uid()))
  );
drop policy if exists proof_of_delivery_insert on public.proof_of_delivery;
create policy proof_of_delivery_insert on public.proof_of_delivery
  for insert with check (public.is_self(rider_id) or public.is_admin());

-- ============================================================
-- order_cancellations
-- ============================================================
drop policy if exists order_cancellations_policy on public.order_cancellations;
create policy order_cancellations_policy on public.order_cancellations
  for all using (
    public.is_admin()
    or public.is_self(cancelled_by)
    or exists (select 1 from public.orders o where o.id = order_cancellations.order_id and (o.customer_id = auth.uid() or o.rider_id = auth.uid()))
  ) with check (public.is_admin() or public.is_self(cancelled_by));

-- ============================================================
-- payments (spec §28: customer only own). Insert/verify via server fn.
-- ============================================================
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (public.is_self(customer_id) or public.is_admin());
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (public.is_self(customer_id));

-- ============================================================
-- cod_transactions
-- ============================================================
drop policy if exists cod_transactions_select on public.cod_transactions;
create policy cod_transactions_select on public.cod_transactions
  for select using (public.is_self(rider_id) or public.is_self(customer_id) or public.is_admin());
drop policy if exists cod_transactions_update on public.cod_transactions;
create policy cod_transactions_update on public.cod_transactions
  for update using (public.is_self(rider_id) or public.is_admin()) with check (public.is_self(rider_id) or public.is_admin());

-- ============================================================
-- rider_earnings / wallet_transactions (rider sees own; admin all)
-- ============================================================
drop policy if exists rider_earnings_policy on public.rider_earnings;
create policy rider_earnings_policy on public.rider_earnings
  for select using (public.is_self(rider_id) or public.is_admin());

drop policy if exists wallet_transactions_policy on public.wallet_transactions;
create policy wallet_transactions_policy on public.wallet_transactions
  for select using (public.is_self(rider_id) or public.is_admin());

-- ============================================================
-- service_areas / pricing_rules / promo_codes
--   * Read: authenticated users (needed for fare estimates + checkout).
--   * Write: admin only.
-- ============================================================
drop policy if exists service_areas_read on public.service_areas;
create policy service_areas_read on public.service_areas
  for select using (auth.role() = 'authenticated');
drop policy if exists service_areas_admin on public.service_areas;
create policy service_areas_admin on public.service_areas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pricing_rules_read on public.pricing_rules;
create policy pricing_rules_read on public.pricing_rules
  for select using (auth.role() = 'authenticated');
drop policy if exists pricing_rules_admin on public.pricing_rules;
create policy pricing_rules_admin on public.pricing_rules
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pricing_history_admin on public.pricing_history;
create policy pricing_history_admin on public.pricing_history
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists promo_codes_read on public.promo_codes;
create policy promo_codes_read on public.promo_codes
  for select using (auth.role() = 'authenticated' and is_active);
drop policy if exists promo_codes_admin on public.promo_codes;
create policy promo_codes_admin on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists promo_usage_policy on public.promo_usage;
create policy promo_usage_policy on public.promo_usage
  for all using (public.is_self(user_id) or public.is_admin()) with check (public.is_self(user_id) or public.is_admin());

-- ============================================================
-- notifications
-- ============================================================
drop policy if exists notifications_owner on public.notifications;
create policy notifications_owner on public.notifications
  for all using (public.is_self(user_id) or public.is_admin())
  with check (public.is_self(user_id) or public.is_admin());

drop policy if exists notification_templates_admin on public.notification_templates;
create policy notification_templates_admin on public.notification_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- support_tickets & messages
-- ============================================================
drop policy if exists support_tickets_policy on public.support_tickets;
create policy support_tickets_policy on public.support_tickets
  for all using (public.is_self(user_id) or public.is_admin() or public.is_self(assigned_to))
  with check (public.is_self(user_id) or public.is_admin());

drop policy if exists support_ticket_messages_policy on public.support_ticket_messages;
create policy support_ticket_messages_policy on public.support_ticket_messages
  for all using (
    public.is_admin()
    or exists (select 1 from public.support_tickets t where t.id = support_ticket_messages.ticket_id and t.user_id = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.support_tickets t where t.id = support_ticket_messages.ticket_id and t.user_id = auth.uid())
  );

-- ============================================================
-- ratings: a participant can rate once per order (unique enforced).
-- ============================================================
drop policy if exists ratings_policy on public.ratings;
create policy ratings_policy on public.ratings
  for all using (
    public.is_self(from_user_id)
    or public.is_admin()
    or public.is_self(to_rider_id)
  ) with check (public.is_self(from_user_id) or public.is_admin());

-- ============================================================
-- audit_logs: admin read-only (writes go through security definer fn)
-- ============================================================
drop policy if exists audit_logs_admin on public.audit_logs;
create policy audit_logs_admin on public.audit_logs
  for select using (public.is_admin());

-- ============================================================
-- app_settings: authenticated read, admin write
-- ============================================================
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (auth.role() = 'authenticated');
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());
