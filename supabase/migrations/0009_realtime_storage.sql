-- ============================================================
-- CargoNepal — Migration 0009: Realtime & Storage
-- ============================================================

-- ------------------------------------------------------------
-- Realtime publication (spec §36)
-- Only tables that need live subscriptions are added. RLS still
-- governs WHICH rows a subscriber receives.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_tracking;
alter publication supabase_realtime add table public.order_status_history;
alter publication supabase_realtime add table public.rider_profiles;
alter publication supabase_realtime add table public.rider_dispatches;
alter publication supabase_realtime add table public.notifications;

-- ------------------------------------------------------------
-- Storage buckets (spec §15, §28). Private by default; access via
-- signed URLs generated in Edge Functions. Public bucket only for
-- marketing assets (landing page images).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('proof-of-delivery', 'proof-of-delivery', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('rider-documents',   'rider-documents',   false, 10485760, array['image/jpeg','image/png','application/pdf']),
  ('parcel-images',     'parcel-images',     false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars',           'avatars',           true,  2097152, array['image/jpeg','image/png','image/webp']),
  ('marketing',         'marketing',         true,  5242880, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- Storage policies: users may write into their own folder; reads are
-- admin or owner. Signed URLs are the primary access path in the app.
drop policy if exists pod_insert on storage.objects;
create policy pod_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('proof-of-delivery','parcel-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists rider_docs_insert on storage.objects;
create policy rider_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rider-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists owner_or_admin_read on storage.objects;
create policy owner_or_admin_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'marketing'
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  );
