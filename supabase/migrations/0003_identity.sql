-- ============================================================
-- CargoNepal — Migration 0003: Identity (users, profiles, vehicles, addresses)
-- ============================================================
-- `users` mirrors auth.users 1:1 and carries the platform role.
-- Role-specific detail lives in customer_profiles / rider_profiles.
-- A trigger in 0007 auto-provisions the profile row on signup.
-- ============================================================

create table if not exists public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          user_role       not null default 'customer',
  full_name     text,
  phone         text            unique,
  email         citext          unique,
  avatar_url    text,
  status        account_status  not null default 'active',
  -- FCM device tokens for push (one user may have many devices; stored as set).
  push_tokens   text[]          not null default '{}',
  last_seen_at  timestamptz,
  created_at    timestamptz     not null default now(),
  updated_at    timestamptz     not null default now()
);
comment on table public.users is 'Platform user mirror of auth.users with role and contact info.';

create index if not exists users_role_idx        on public.users (role);
create index if not exists users_status_idx      on public.users (status);
create index if not exists users_phone_idx       on public.users (phone);

-- ------------------------------------------------------------
-- Customer profiles (spec §43 supports future business accounts)
-- ------------------------------------------------------------
create table if not exists public.customer_profiles (
  id                uuid primary key references public.users (id) on delete cascade,
  is_business       boolean       not null default false,
  business_name     text,
  business_tax_id   text,
  default_address_id uuid,
  total_orders      integer       not null default 0,
  total_spent       numeric(12,2) not null default 0,
  loyalty_points    integer       not null default 0,
  referral_code     text          unique,
  referred_by       uuid          references public.users (id) on delete set null,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);
create index if not exists customer_profiles_business_idx on public.customer_profiles (is_business);

-- ------------------------------------------------------------
-- Rider profiles (spec §10, §11)
-- ------------------------------------------------------------
create table if not exists public.rider_profiles (
  id                  uuid primary key references public.users (id) on delete cascade,
  status              rider_status      not null default 'pending',
  availability        rider_availability not null default 'offline',
  -- Live location for matching + tracking (spec §12).
  current_lat         double precision,
  current_lng         double precision,
  heading             double precision,
  speed               double precision,
  accuracy            double precision,
  location_updated_at timestamptz,
  -- Optional PostGIS point (populated by trigger if PostGIS present).
  current_geo         geometry(Point, 4326),
  -- Operating geography.
  primary_city        text,
  service_area_id     uuid,
  active_order_id     uuid,               -- at most one active delivery
  active_order_count  integer             not null default 0,
  rating_avg          numeric(3,2)        not null default 0,
  rating_count        integer             not null default 0,
  total_deliveries    integer             not null default 0,
  cod_balance         numeric(12,2)       not null default 0,   -- COD collected not yet settled
  wallet_balance      numeric(12,2)       not null default 0,
  approved_at         timestamptz,
  approved_by         uuid                references public.users (id) on delete set null,
  rejection_reason    text,
  created_at          timestamptz         not null default now(),
  updated_at          timestamptz         not null default now()
);
create index if not exists rider_profiles_status_idx        on public.rider_profiles (status);
create index if not exists rider_profiles_availability_idx  on public.rider_profiles (availability);
create index if not exists rider_profiles_city_idx          on public.rider_profiles (primary_city);
-- Composite index powering the "nearest available rider" query (spec §8).
create index if not exists rider_matching_idx
  on public.rider_profiles (availability, status, current_lat, current_lng)
  where status = 'approved' and availability = 'online';

-- ------------------------------------------------------------
-- Vehicles (spec §10)
-- ------------------------------------------------------------
create table if not exists public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  rider_id        uuid          not null references public.rider_profiles (id) on delete cascade,
  vehicle_type    vehicle_type  not null default 'bike',
  make_model      text,
  license_plate   text          not null,
  color           text,
  year            integer,
  photo_url       text,
  is_verified     boolean       not null default false,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  unique (rider_id, license_plate)
);
create index if not exists vehicles_rider_idx on public.vehicles (rider_id);

-- ------------------------------------------------------------
-- Rider documents: license, citizenship/ID, insurance (spec §10)
-- ------------------------------------------------------------
create table if not exists public.rider_documents (
  id            uuid primary key default gen_random_uuid(),
  rider_id      uuid          not null references public.rider_profiles (id) on delete cascade,
  doc_type      text          not null,   -- 'license' | 'citizenship' | 'id' | 'insurance' | 'bluebook'
  doc_number    text,
  file_url      text          not null,   -- Supabase Storage path
  mime_type     text,
  size_bytes    bigint,
  expiry_date   date,
  status        rider_status  not null default 'pending',
  reviewed_by   uuid          references public.users (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
create index if not exists rider_documents_rider_idx on public.rider_documents (rider_id);
create index if not exists rider_documents_status_idx on public.rider_documents (status);

-- ------------------------------------------------------------
-- Addresses (saved addresses, spec §28). Used by customers and riders.
-- ------------------------------------------------------------
create table if not exists public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid          not null references public.users (id) on delete cascade,
  label         text          not null default 'Home',   -- Home / Work / Other
  contact_name  text,
  contact_phone text,
  address_line1 text,
  address_line2 text,
  city          text,
  district      text,
  province      text,
  postal_code   text,
  country       text          not null default 'Nepal',
  lat           double precision not null,
  lng           double precision not null,
  is_default    boolean       not null default false,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
create index if not exists addresses_user_idx on public.addresses (user_id);
create index if not exists addresses_user_default_idx on public.addresses (user_id, is_default);
