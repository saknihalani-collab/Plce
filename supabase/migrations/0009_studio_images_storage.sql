-- ═══════════════════════════════════════════════════════════════
-- Storage for listing photographs
--
-- `studio-images` was documented as a manual dashboard step and never
-- created by a migration, so whether it existed — and what it allowed —
-- depended on someone remembering a comment in setup.sql. A bucket
-- created through the dashboard arrives with row level security on and
-- no policies at all, which reads as "public bucket, uploads denied":
-- anyone can fetch an object, nobody can write one.
--
-- That is what the wizard hit. `storage.from(...).upload(...)` runs as
-- the signed-in user, not the service role, so it is `authenticated`
-- that needs permission, and `authenticated` had none.
--
-- Objects are written as `<studio-slug>/<uuid>.<ext>`, so the first path
-- segment names the studio and the policies below can ask the obvious
-- question: does the caller belong to the organisation that owns it?
-- `is_org_member` is SECURITY DEFINER, so the lookup does not recurse
-- through the studios policy the way a raw subquery would — the same
-- trap migration 0008 had to dig the wizard out of.
--
-- Reads stay open because a marketplace listing is public by
-- definition; the photographs are the product. Writes are scoped to the
-- studio's own folder, so an owner can add and remove their own
-- photographs and nobody else's.
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('studio-images', 'studio-images', true)
on conflict (id) do update set public = true;

/*
  Resolves the studio a storage object belongs to, from the folder it
  sits in. Returns false for a path that names no studio, so a stray
  object at the bucket root is never writable.
*/
create or replace function owns_studio_folder(object_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from studios
    where slug = split_part(object_name, '/', 1)
      and is_org_member(organization_id)
  );
$$;

comment on function owns_studio_folder(text) is
  'True when the caller belongs to the organisation owning the studio named by the first segment of a storage object path.';

drop policy if exists studio_images_public_read on storage.objects;
drop policy if exists studio_images_owner_insert on storage.objects;
drop policy if exists studio_images_owner_delete on storage.objects;

-- A listing's photographs are the public face of it.
create policy studio_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'studio-images');

create policy studio_images_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studio-images'
    and owns_studio_folder(name)
  );

-- Removing a photograph should take the object with it, not just the row.
create policy studio_images_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'studio-images'
    and owns_studio_folder(name)
  );
