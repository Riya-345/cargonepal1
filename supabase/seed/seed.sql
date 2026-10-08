-- ============================================================
-- CargoNepal — Seed: CONFIGURATION ONLY (spec §46, §26, §24, §52)
-- ============================================================
-- This file seeds *platform configuration*, never demo/fake business
-- data. There are deliberately NO seeded users, riders, customers,
-- orders, or payments. Production starts clean; test accounts are
-- created through the real signup + admin-approval flows.
--
-- Safe to re-run: every statement is idempotent (ON CONFLICT DO NOTHING
-- or guarded inserts). Apply AFTER all migrations in supabase/migrations.
--
--   psql "$SUPABASE_DB_URL" -f supabase/seed/seed.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Service areas (spec §26) — the five launch cities.
--    center_lat/lng are approximate city centers; admins refine
--    radius/boundary/hours from the dashboard.
-- ------------------------------------------------------------
insert into public.service_areas (city, district, province, zone, center_lat, center_lng, radius_km, is_active)
values
  ('Kathmandu',  'Kathmandu',  'Bagmati',      'metro',    27.7172, 85.3240, 20, true),
  ('Lalitpur',   'Lalitpur',   'Bagmati',      'metro',    27.6588, 85.3247, 15, true),
  ('Bhaktapur',  'Bhaktapur',  'Bagmati',      'standard', 27.6710, 85.4298, 12, true),
  ('Pokhara',    'Kaski',      'Gandaki',      'standard', 28.2096, 83.9856, 18, true),
  ('Biratnagar', 'Morang',     'Koshi',        'standard', 26.4567, 87.2718, 15, true)
on conflict (city, district) do nothing;

-- ------------------------------------------------------------
-- 2. Default pricing rule (spec §7, §24). One global fallback rule
--    with no service_area_id. Admins can clone it per city/zone and
--    adjust every rate from the dashboard without a code change.
--    Values mirror the spec's worked example (base 50, etc.).
-- ------------------------------------------------------------
insert into public.pricing_rules (
  service_area_id, name, is_active, currency,
  base_fare, per_km_rate, per_kg_rate, minimum_fare,
  cod_fee, cod_percent, waiting_fee_per_min, free_waiting_minutes,
  priority_fee, express_fee, fragile_fee,
  peak_multiplier, peak_hours, platform_commission_percent,
  min_distance_km, max_distance_km, rider_matching_radius_km,
  cancellation_free_minutes, cancellation_fee
)
select
  null, 'default', true, 'NPR',
  50, 15, 5, 60,
  20, 1, 5, 5,
  30, 60, 25,
  1.25, '[{"start":"08:00","end":"10:00"},{"start":"17:00","end":"19:00"}]'::jsonb, 20,
  0, 40, 5,
  3, 20
where not exists (
  select 1 from public.pricing_rules where name = 'default' and service_area_id is null
);

-- ------------------------------------------------------------
-- 3. Notification templates (spec §29, §52). Keys match the
--    TEMPLATES catalogue in supabase/functions/_shared/notify.ts.
--    {{token}} placeholders are interpolated at send time.
-- ------------------------------------------------------------
insert into public.notification_templates (key, audience, title, body, channel, is_active) values
  ('order.confirmed',      'customer', 'Booking confirmed',   'Your parcel booking {{order_code}} is confirmed.',                 'push',   true),
  ('order.searching',      'customer', 'Finding a rider',     'We''re matching you with the nearest available rider.',            'in_app', true),
  ('order.rider_assigned', 'customer', 'Rider assigned',      '{{rider_name}} is heading to your pickup.',                        'push',   true),
  ('order.picked_up',      'customer', 'Parcel picked up',    'Your parcel is on the way.',                                       'push',   true),
  ('order.delivered',      'customer', 'Delivered',           'Your parcel was delivered. Thanks for using CargoNepal!',          'push',   true),
  ('order.cancelled',      'customer', 'Order cancelled',     'Your order {{order_code}} was cancelled.',                         'push',   true),
  ('rider.new_request',    'rider',    'New Delivery Request','{{distance_km}} km pickup • Earn NPR {{earning}}',                 'push',   true),
  ('rider.order_cancelled','rider',    'Order cancelled',     'Order {{order_code}} was cancelled.',                              'push',   true),
  ('admin.new_order',      'admin',    'New order',           '{{order_code}} created.',                                          'in_app', true),
  ('admin.cod_alert',      'admin',    'COD alert',           'COD of NPR {{amount}} pending settlement.',                        'in_app', true)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 4. App settings (spec §52) — platform-wide tunables read by the
--    admin dashboard and edge functions.
-- ------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('platform_commission_percent', '20'::jsonb,        'Default platform commission applied to rider earnings (spec §32).'),
  ('dispatch_ttl_seconds',        '30'::jsonb,        'Seconds a delivery request stays open before re-dispatch (spec §8).'),
  ('dispatch_max_attempts',       '10'::jsonb,        'Maximum rider match attempts before an order is flagged (spec §8).'),
  ('radius_ladder_km',            '[1,2,5]'::jsonb,   'Expanding search radii for nearest-rider matching (spec §8).'),
  ('rider_location_interval_sec', '5'::jsonb,         'How often an active rider app reports GPS (spec §12).'),
  ('high_value_otp_threshold_npr','5000'::jsonb,      'Declared/COD value above which delivery requires OTP (spec §15).'),
  ('support_contact',             '{"email":"support@cargonepal.com","phone":"+977-1-5555555"}'::jsonb, 'Public support channels.')
on conflict (key) do nothing;

commit;

-- ------------------------------------------------------------
-- Verify (informational):
--   select city from service_areas;
--   select name, base_fare, per_km_rate from pricing_rules;
--   select key from notification_templates;
--   select key from app_settings;
-- ------------------------------------------------------------
