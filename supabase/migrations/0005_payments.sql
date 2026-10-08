-- ============================================================
-- CargoNepal — Migration 0005: Payments, COD, Earnings, Wallet
-- ============================================================

-- ------------------------------------------------------------
-- payments (spec §17). Server-side verified only.
-- ------------------------------------------------------------
create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid          not null references public.orders (id) on delete cascade,
  customer_id           uuid          not null references public.users (id) on delete restrict,
  amount                numeric(12,2) not null,
  currency              char(3)       not null default 'NPR',
  provider              payment_provider not null,
  status                payment_status not null default 'pending',
  transaction_reference text,          -- provider tx id (Khalti pidx / eSewa product_code)
  provider_payload      jsonb,         -- raw verified response from provider
  failure_reason        text,
  refunded_amount       numeric(12,2) not null default 0,
  verified_at           timestamptz,
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);
create index if not exists payments_order_idx    on public.orders (id);
create index if not exists payments_customer_idx on public.payments (customer_id, created_at desc);
create index if not exists payments_status_idx   on public.payments (status);
create index if not exists payments_provider_ref_idx on public.payments (provider, transaction_reference);
create index if not exists payments_order_lookup on public.payments (order_id);

-- ------------------------------------------------------------
-- cod_transactions (spec §16). Rider-collected cash lifecycle.
-- Never auto-settled; settlement requires an explicit record.
-- ------------------------------------------------------------
create table if not exists public.cod_transactions (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid          not null references public.orders (id) on delete cascade,
  rider_id       uuid          not null references public.rider_profiles (id) on delete restrict,
  customer_id    uuid          not null references public.users (id) on delete restrict,
  amount         numeric(12,2) not null,
  status         cod_status    not null default 'pending',
  collected_at   timestamptz,
  settled_at     timestamptz,
  settled_by     uuid          references public.users (id) on delete set null,
  settlement_ref text,
  note           text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists cod_rider_idx   on public.cod_transactions (rider_id, status);
create index if not exists cod_order_idx   on public.cod_transactions (order_id);
create index if not exists cod_status_idx  on public.cod_transactions (status);

-- ------------------------------------------------------------
-- rider_earnings (spec §32). One row per completed order.
-- ------------------------------------------------------------
create table if not exists public.rider_earnings (
  id                 uuid primary key default gen_random_uuid(),
  rider_id           uuid          not null references public.rider_profiles (id) on delete cascade,
  order_id           uuid          not null references public.orders (id) on delete cascade,
  gross_fare         numeric(12,2) not null default 0,
  platform_commission numeric(12,2) not null default 0,
  commission_percent numeric(5,2)  not null default 0,
  net_earning        numeric(12,2) not null default 0,
  tips               numeric(12,2) not null default 0,
  incentive          numeric(12,2) not null default 0,
  cod_collected      numeric(12,2) not null default 0,
  status             text          not null default 'credited',  -- credited | adjusted | reversed
  earned_at          timestamptz   not null default now(),
  created_at         timestamptz   not null default now(),
  unique (order_id)
);
create index if not exists rider_earnings_rider_idx on public.rider_earnings (rider_id, earned_at desc);

-- ------------------------------------------------------------
-- wallet_transactions (spec §27). Rider payout/settlement ledger.
-- ------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  rider_id      uuid          not null references public.rider_profiles (id) on delete cascade,
  entry_type    wallet_entry_type not null,
  amount        numeric(12,2) not null,   -- positive = credit, negative = debit
  balance_after numeric(12,2) not null default 0,
  reference_id  uuid,
  reference_type text,        -- 'order' | 'earning' | 'cod' | 'payout'
  status        text          not null default 'completed',
  note          text,
  created_at    timestamptz   not null default now()
);
create index if not exists wallet_rider_idx on public.wallet_transactions (rider_id, created_at desc);
