-- ============================================================
-- CargoNepal — Migration 0007: Functions & Triggers
-- ============================================================

-- ------------------------------------------------------------
-- Generic updated_at trigger
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'users','customer_profiles','rider_profiles','vehicles','rider_documents',
    'addresses','orders','payments','cod_transactions','pricing_rules','promo_codes',
    'support_tickets','notification_templates','app_settings'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                  for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Haversine distance in km (PostGIS-free fallback) (spec §7, §8)
-- ------------------------------------------------------------
create or replace function public.distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 6371 * acos(
    least(1, greatest(-1,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2 - lng1))
      + sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$;

-- ------------------------------------------------------------
-- Role helpers used by RLS policies (defined in 0008)
-- ------------------------------------------------------------
create or replace function public.current_role_name()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('admin','super_admin') from public.users where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'super_admin' from public.users where id = auth.uid()),
    false
  );
$$;

-- ------------------------------------------------------------
-- Auto-provision user + role profile on auth signup (spec §1, §28)
-- Role comes from raw_user_meta_data->>'role' supplied at signup.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
  v_phone text := new.phone;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  v_role := coalesce((v_meta->>'role')::user_role, 'customer');

  insert into public.users (id, role, full_name, phone, email, avatar_url)
  values (new.id, v_role, v_meta->>'full_name', v_phone, new.email, v_meta->>'avatar_url')
  on conflict (id) do nothing;

  if v_role = 'rider' then
    insert into public.rider_profiles (id, status, primary_city)
    values (new.id, 'pending', v_meta->>'city')
    on conflict (id) do nothing;
  else
    insert into public.customer_profiles (id, referral_code)
    values (new.id, upper(substr(md5(new.id::text), 1, 8)))
    on conflict (id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Generate human order_code + non-sensitive qr_token on insert (spec §14)
-- ------------------------------------------------------------
create or replace function public.generate_order_code()
returns text language plpgsql as $$
declare
  v_date text := to_char(now(), 'YYYYMMDD');
  v_rand text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
begin
  return 'CN-' || v_date || '-' || v_rand;
end $$;

create or replace function public.orders_before_insert()
returns trigger language plpgsql as $$
begin
  if new.order_code is null then
    new.order_code := public.generate_order_code();
  end if;
  if new.qr_token is null then
    -- Random, opaque token. Contains NO customer PII (spec §14).
    new.qr_token := encode(gen_random_bytes(16), 'hex');
  end if;
  return new;
end $$;

drop trigger if exists orders_before_insert on public.orders;
create trigger orders_before_insert
  before insert on public.orders
  for each row execute function public.orders_before_insert();

-- ------------------------------------------------------------
-- Every status change writes an order_status_history row (spec §13)
-- and seeds key timestamps.
-- ------------------------------------------------------------
create or replace function public.orders_after_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status, lat, lng, updated_by, note)
    values (
      new.id, new.status,
      case when new.status in ('RIDER_ON_THE_WAY_TO_PICKUP','ARRIVED_AT_PICKUP','PARCEL_PICKED_UP')
           then new.pickup_lat else new.dropoff_lat end,
      case when new.status in ('RIDER_ON_THE_WAY_TO_PICKUP','ARRIVED_AT_PICKUP','PARCEL_PICKED_UP')
           then new.pickup_lng else new.dropoff_lng end,
      auth.uid(),
      'Status changed from ' || old.status::text || ' to ' || new.status::text
    );

    if new.status = 'PARCEL_PICKED_UP' and new.picked_up_at is null then
      new.picked_up_at := now();
    end if;
    if new.status = 'DELIVERED' and new.delivered_at is null then
      new.delivered_at := now();
    end if;
    if new.status in ('CANCELLED','FAILED','RETURNED') and new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  end if;

  -- Seed the initial history row on creation.
  if old.id is null then
    insert into public.order_status_history (order_id, status, updated_by, note)
    values (new.id, new.status, auth.uid(), 'Order created');
  end if;

  return new;
end $$;

drop trigger if exists orders_after_status_change on public.orders;
create trigger orders_after_status_change
  after update of status on public.orders
  for each row execute function public.orders_after_status_change();

-- Record the initial status on insert too (after trigger so order_code exists).
create or replace function public.orders_after_insert_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.order_status_history (order_id, status, updated_by, note)
  values (new.id, new.status, auth.uid(), 'Order created');
  return new;
end $$;
drop trigger if exists orders_after_insert on public.orders;
create trigger orders_after_insert
  after insert on public.orders
  for each row execute function public.orders_after_insert_history();

-- ------------------------------------------------------------
-- Keep rider_profiles.current_geo in sync when PostGIS present (spec §12)
-- ------------------------------------------------------------
create or replace function public.sync_rider_geo()
returns trigger language plpgsql as $$
begin
  if new.current_lat is not null and new.current_lng is not null then
    begin
      new.current_geo := st_setsrid(st_makepoint(new.current_lng, new.current_lat), 4326);
    exception when undefined_function then
      -- PostGIS not installed; leave current_geo null (haversine fallback used).
      null;
    end;
    new.location_updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists sync_rider_geo on public.rider_profiles;
create trigger sync_rider_geo
  before update of current_lat, current_lng on public.rider_profiles
  for each row execute function public.sync_rider_geo();

-- ------------------------------------------------------------
-- Maintain rider rating aggregates on new rating (spec §31)
-- ------------------------------------------------------------
create or replace function public.update_rider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'customer_to_rider' and new.to_rider_id is not null then
    update public.rider_profiles rp
    set rating_count = rp.rating_count + 1,
        rating_avg = round(
          ((rp.rating_avg * rp.rating_count) + new.stars)::numeric / (rp.rating_count + 1), 2
        )
    where rp.id = new.to_rider_id;
  end if;
  return new;
end $$;

drop trigger if exists update_rider_rating on public.ratings;
create trigger update_rider_rating
  after insert on public.ratings
  for each row execute function public.update_rider_rating();

-- ------------------------------------------------------------
-- Single default address enforcement (spec §28)
-- ------------------------------------------------------------
create or replace function public.enforce_single_default_address()
returns trigger language plpgsql as $$
begin
  if new.is_default then
    update public.addresses set is_default = false
    where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end $$;
drop trigger if exists enforce_single_default_address on public.addresses;
create trigger enforce_single_default_address
  before insert or update of is_default on public.addresses
  for each row execute function public.enforce_single_default_address();

-- ------------------------------------------------------------
-- Audit writer helper callable from Edge Functions (spec §45)
-- ------------------------------------------------------------
create or replace function public.write_audit(
  p_admin_id uuid, p_action audit_action, p_target_type text,
  p_target_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (admin_id, action, target_type, target_id, metadata)
  values (p_admin_id, p_action, p_target_type, p_target_id, coalesce(p_metadata,'{}'::jsonb));
$$;
