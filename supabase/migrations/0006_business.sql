-- ============================================================
-- CargoNepal — Migration 0006: Business Config & Support
-- ============================================================

-- ------------------------------------------------------------
-- service_areas (spec §26)
-- ------------------------------------------------------------
create table if not exists public.service_areas (
  id             uuid primary key default gen_random_uuid(),
  city           text          not null,
  district       text,
  province       text,
  zone           zone_type     not null default 'standard',
  is_active      boolean       not null default true,
  center_lat     double precision,
  center_lng     double precision,
  radius_km      numeric(8,2)  not null default 15,
  -- Optional polygon boundary (GeoJSON) for precise coverage.
  boundary_geojson jsonb,
  operating_hours jsonb        not null default '{"start":"07:00","end":"21:00","days":[1,2,3,4,5,6,7]}'::jsonb,
  pricing_multiplier numeric(5,2) not null default 1.00,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  unique (city, district)
);
create index if not exists service_areas_active_idx on public.service_areas (is_active);

-- ------------------------------------------------------------
-- pricing_rules (spec §7, §24). Admin-editable, no code changes.
-- One active rule per (city/zone). key/value keeps it extensible.
-- ------------------------------------------------------------
create table if not exists public.pricing_rules (
  id                uuid primary key default gen_random_uuid(),
  service_area_id   uuid          references public.service_areas (id) on delete cascade,
  name              text          not null default 'default',
  is_active         boolean       not null default true,
  currency          char(3)       not null default 'NPR',
  base_fare         numeric(10,2) not null default 50,
  per_km_rate       numeric(10,2) not null default 15,
  per_kg_rate       numeric(10,2) not null default 5,
  minimum_fare      numeric(10,2) not null default 60,
  cod_fee           numeric(10,2) not null default 20,
  cod_percent       numeric(5,2)  not null default 0,      -- optional % of COD amount
  waiting_fee_per_min numeric(10,2) not null default 2,
  free_waiting_minutes integer     not null default 5,
  priority_fee      numeric(10,2) not null default 30,
  express_fee       numeric(10,2) not null default 60,
  fragile_fee       numeric(10,2) not null default 25,
  peak_multiplier   numeric(5,2)  not null default 1.00,
  peak_hours        jsonb         not null default '[{"start":"08:00","end":"10:00"},{"start":"17:00","end":"20:00"}]'::jsonb,
  platform_commission_percent numeric(5,2) not null default 20,
  min_distance_km   numeric(8,2)  not null default 0,
  max_distance_km   numeric(8,2)  not null default 40,
  rider_matching_radius_km numeric(8,2) not null default 5,
  cancellation_free_minutes integer not null default 3,
  cancellation_fee  numeric(10,2) not null default 20,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);
create index if not exists pricing_rules_active_idx on public.pricing_rules (is_active, service_area_id);

-- pricing_history: audit trail of pricing changes (spec §24)
create table if not exists public.pricing_history (
  id             uuid primary key default gen_random_uuid(),
  pricing_rule_id uuid         not null references public.pricing_rules (id) on delete cascade,
  changed_by     uuid          references public.users (id) on delete set null,
  snapshot       jsonb         not null,
  created_at     timestamptz   not null default now()
);
create index if not exists pricing_history_rule_idx on public.pricing_history (pricing_rule_id, created_at desc);

-- ------------------------------------------------------------
-- promo_codes (spec §25)
-- ------------------------------------------------------------
create table if not exists public.promo_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text          not null unique,
  description    text,
  discount_type  text          not null default 'percentage',  -- percentage | fixed
  discount_value numeric(10,2) not null default 0,
  min_order_amount numeric(10,2) not null default 0,
  max_discount   numeric(10,2),
  usage_limit    integer,       -- null = unlimited total
  per_user_limit integer       not null default 1,
  used_count     integer       not null default 0,
  service_area_id uuid         references public.service_areas (id) on delete cascade,
  is_active      boolean       not null default true,
  starts_at      timestamptz   not null default now(),
  expires_at     timestamptz,
  created_by     uuid          references public.users (id) on delete set null,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists promo_codes_active_idx on public.promo_codes (code, is_active);

-- Now that promo_codes exists, wire the deferred FK on orders.
alter table public.orders
  drop constraint if exists orders_promo_fk;
alter table public.orders
  add constraint orders_promo_fk
  foreign key (promo_code_id) references public.promo_codes (id) on delete set null;

-- promo_usage (spec §25) — one row per redemption
create table if not exists public.promo_usage (
  id            uuid primary key default gen_random_uuid(),
  promo_code_id uuid          not null references public.promo_codes (id) on delete cascade,
  user_id       uuid          not null references public.users (id) on delete cascade,
  order_id      uuid          references public.orders (id) on delete set null,
  discount_applied numeric(10,2) not null default 0,
  created_at    timestamptz   not null default now()
);
create index if not exists promo_usage_user_idx on public.promo_usage (promo_code_id, user_id);

-- ------------------------------------------------------------
-- notifications (spec §29). History + in-app inbox.
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid          references public.users (id) on delete cascade,   -- recipient
  audience      notification_audience not null default 'customer',
  channel       notification_channel  not null default 'in_app',
  title         text          not null,
  body          text,
  data          jsonb         not null default '{}'::jsonb,
  order_id      uuid          references public.orders (id) on delete cascade,
  is_read       boolean       not null default false,
  push_status   text          not null default 'pending',  -- pending | sent | failed
  sent_at       timestamptz,
  created_at    timestamptz   not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, is_read) where is_read = false;

-- notification_templates (spec §52)
create table if not exists public.notification_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text          not null unique,   -- 'order.confirmed', 'rider.request', ...
  audience      notification_audience not null,
  title         text          not null,
  body          text          not null,           -- supports {{token}} interpolation
  channel       notification_channel not null default 'push',
  is_active     boolean       not null default true,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

-- ------------------------------------------------------------
-- support_tickets (spec §30)
-- ------------------------------------------------------------
create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  ticket_no     text          unique,
  user_id       uuid          not null references public.users (id) on delete cascade,
  order_id      uuid          references public.orders (id) on delete set null,
  category      ticket_category not null default 'other',
  subject       text          not null,
  message       text          not null,
  status        ticket_status not null default 'open',
  priority      text          not null default 'normal',
  assigned_to   uuid          references public.users (id) on delete set null,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
create index if not exists support_tickets_user_idx   on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status);

create table if not exists public.support_ticket_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid          not null references public.support_tickets (id) on delete cascade,
  sender_id     uuid          references public.users (id) on delete set null,
  sender_role   user_role,
  is_internal   boolean       not null default false,
  message       text          not null,
  created_at    timestamptz   not null default now()
);
create index if not exists support_ticket_messages_idx on public.support_ticket_messages (ticket_id, created_at);

-- ------------------------------------------------------------
-- ratings & reviews (spec §31)
-- ------------------------------------------------------------
create table if not exists public.ratings (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders (id) on delete cascade,
  direction     rating_direction not null,
  from_user_id  uuid          not null references public.users (id) on delete cascade,
  to_rider_id   uuid          references public.rider_profiles (id) on delete cascade,
  to_customer_id uuid         references public.users (id) on delete cascade,
  stars         integer       not null check (stars between 1 and 5),
  review        text,
  created_at    timestamptz   not null default now(),
  -- prevent duplicate ratings for same order + direction (spec §31)
  unique (order_id, direction)
);
create index if not exists ratings_rider_idx on public.ratings (to_rider_id, created_at desc);

-- alias view kept for spec table-name parity (spec §27 lists `reviews`)
create or replace view public.reviews as
  select id, order_id, from_user_id, to_rider_id, stars, review, created_at
  from public.ratings
  where review is not null;

-- ------------------------------------------------------------
-- audit_logs (spec §45)
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid          references public.users (id) on delete set null,
  action        audit_action  not null,
  target_type   text,          -- 'rider' | 'order' | 'pricing' | 'user' | ...
  target_id     uuid,
  metadata      jsonb         not null default '{}'::jsonb,
  ip_address    inet,
  created_at    timestamptz   not null default now()
);
create index if not exists audit_logs_admin_idx   on public.audit_logs (admin_id, created_at desc);
create index if not exists audit_logs_action_idx  on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_target_idx  on public.audit_logs (target_type, target_id);

-- ------------------------------------------------------------
-- app_settings (spec §52): key/value business config editable by admin
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key           text primary key,
  value         jsonb         not null,
  description   text,
  updated_by    uuid          references public.users (id) on delete set null,
  updated_at    timestamptz   not null default now()
);
