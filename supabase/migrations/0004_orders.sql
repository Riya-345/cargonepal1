-- ============================================================
-- CargoNepal — Migration 0004: Orders & Delivery Lifecycle
-- ============================================================

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  -- Human-friendly reference e.g. CN-20261008-4F2A (generated in 0007).
  order_code         text          unique,
  customer_id        uuid          not null references public.users (id) on delete restrict,
  rider_id           uuid          references public.rider_profiles (id) on delete set null,

  status             order_status  not null default 'PENDING',
  priority           delivery_priority not null default 'standard',

  -- Pickup
  pickup_lat         double precision not null,
  pickup_lng         double precision not null,
  pickup_address     text          not null,
  pickup_city        text,
  pickup_contact_name  text,
  pickup_contact_phone text,

  -- Drop-off
  dropoff_lat        double precision not null,
  dropoff_lng        double precision not null,
  dropoff_address    text          not null,
  dropoff_city       text,
  receiver_name      text          not null,
  receiver_phone     text          not null,

  -- Parcel
  parcel_category    parcel_category not null default 'small_package',
  parcel_description text,
  weight_kg          numeric(6,2)  not null default 1,
  quantity           integer       not null default 1,
  is_fragile         boolean       not null default false,
  declared_value     numeric(12,2) not null default 0,
  special_instructions text,
  parcel_image_url   text,

  -- Routing / distance / ETA (spec §42)
  distance_km        numeric(8,2),
  pickup_eta_minutes integer,
  delivery_eta_minutes integer,

  -- Money (spec §7). All amounts NPR.
  base_fare          numeric(10,2) not null default 0,
  distance_fee       numeric(10,2) not null default 0,
  weight_fee         numeric(10,2) not null default 0,
  service_fees       numeric(10,2) not null default 0,
  cod_amount         numeric(10,2) not null default 0,   -- money rider collects from receiver
  cod_fee            numeric(10,2) not null default 0,   -- platform fee for offering COD
  discount_amount    numeric(10,2) not null default 0,
  total_amount       numeric(10,2) not null default 0,   -- what the customer pays for delivery
  platform_commission numeric(10,2) not null default 0,
  rider_earning      numeric(10,2) not null default 0,

  -- Payment
  payment_method     payment_provider not null default 'cod',
  is_cod             boolean       not null default true,
  payment_status     payment_status not null default 'pending',
  is_paid            boolean       not null default false,

  -- Promo
  promo_code_id      uuid,        -- FK added after promo_codes exists (0006)
  promo_code_text    text,

  -- QR (spec §14). Public tracking token is non-sensitive.
  qr_token           text          unique,

  -- Verification for high-value / OTP delivery (spec §15).
  delivery_otp_hash  text,
  requires_otp       boolean       not null default false,

  scheduled_for      timestamptz,
  picked_up_at       timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

comment on table public.orders is 'Courier delivery orders. Total = base + distance + weight + service + cod_fee - discount.';

create index if not exists orders_customer_idx     on public.orders (customer_id, created_at desc);
create index if not exists orders_rider_idx        on public.orders (rider_id, created_at desc);
create index if not exists orders_status_idx       on public.orders (status);
create index if not exists orders_code_idx         on public.orders (order_code);
create index if not exists orders_qr_token_idx     on public.orders (qr_token);
create index if not exists orders_created_idx      on public.orders (created_at desc);
-- Active orders (not in a terminal state) for live map + matching.
create index if not exists orders_active_idx
  on public.orders (status)
  where status in ('PENDING','SEARCHING_RIDER','RIDER_ASSIGNED','RIDER_ACCEPTED',
                   'RIDER_ON_THE_WAY_TO_PICKUP','ARRIVED_AT_PICKUP','PARCEL_PICKED_UP',
                   'ON_THE_WAY_TO_DESTINATION','ARRIVED_AT_DESTINATION');
create index if not exists orders_pickup_geo_idx on public.orders (pickup_lat, pickup_lng);

-- ------------------------------------------------------------
-- order_items: line items for multi-parcel / future business bulk (spec §43)
-- ------------------------------------------------------------
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders (id) on delete cascade,
  description   text          not null,
  category      parcel_category not null default 'other',
  quantity      integer       not null default 1,
  weight_kg     numeric(6,2)  not null default 0,
  declared_value numeric(12,2) not null default 0,
  created_at    timestamptz   not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ------------------------------------------------------------
-- order_tracking: GPS breadcrumb trail (spec §12)
-- ------------------------------------------------------------
create table if not exists public.order_tracking (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders (id) on delete cascade,
  rider_id      uuid          references public.rider_profiles (id) on delete set null,
  lat           double precision not null,
  lng           double precision not null,
  heading       double precision,
  speed         double precision,
  accuracy      double precision,
  recorded_at   timestamptz   not null default now()
);
create index if not exists order_tracking_order_idx on public.order_tracking (order_id, recorded_at desc);

-- ------------------------------------------------------------
-- order_status_history: one row per status change (spec §13)
-- ------------------------------------------------------------
create table if not exists public.order_status_history (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders (id) on delete cascade,
  status        order_status  not null,
  lat           double precision,
  lng           double precision,
  updated_by    uuid          references public.users (id) on delete set null,
  note          text,
  created_at    timestamptz   not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ------------------------------------------------------------
-- rider_dispatches: matching requests sent to riders (spec §8)
-- ------------------------------------------------------------
create table if not exists public.rider_dispatches (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders (id) on delete cascade,
  rider_id      uuid          not null references public.rider_profiles (id) on delete cascade,
  status        dispatch_status not null default 'sent',
  distance_km   numeric(8,2),
  offered_earning numeric(10,2),
  sent_at       timestamptz   not null default now(),
  responded_at  timestamptz,
  expires_at    timestamptz   not null default now() + interval '30 seconds'
);
create index if not exists rider_dispatches_order_idx  on public.rider_dispatches (order_id, sent_at desc);
create index if not exists rider_dispatches_rider_idx  on public.rider_dispatches (rider_id, status);

-- ------------------------------------------------------------
-- proof_of_delivery (spec §15)
-- ------------------------------------------------------------
create table if not exists public.proof_of_delivery (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders (id) on delete cascade,
  rider_id      uuid          references public.rider_profiles (id) on delete set null,
  photo_url     text,
  signature_url text,
  receiver_name text,
  receiver_phone text,
  otp_verified  boolean       not null default false,
  qr_verified   boolean       not null default false,
  lat           double precision,
  lng           double precision,
  note          text,
  created_at    timestamptz   not null default now()
);
create index if not exists proof_of_delivery_order_idx on public.proof_of_delivery (order_id);

-- ------------------------------------------------------------
-- order_cancellations (spec §41)
-- ------------------------------------------------------------
create table if not exists public.order_cancellations (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders (id) on delete cascade,
  cancelled_by  uuid          references public.users (id) on delete set null,
  cancelled_by_role user_role,
  reason        text          not null,
  reason_code   text,
  cancellation_fee numeric(10,2) not null default 0,
  refund_amount numeric(10,2) not null default 0,
  created_at    timestamptz   not null default now()
);
create index if not exists order_cancellations_order_idx on public.order_cancellations (order_id);
