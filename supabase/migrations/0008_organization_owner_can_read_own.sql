-- ═══════════════════════════════════════════════════════════════
-- An owner can see the organisation they just created
--
-- `organizations_select_member` allowed a read to members and to PL·CE,
-- and to nobody else — including the person whose name is in
-- `owner_user_id`. Membership is the only way in, and membership does
-- not exist yet at the moment an organisation is created.
--
-- That made the first step of listing a studio impossible:
--
--   1. insert into organizations … returning *
--        The insert succeeds. PostgREST filters RETURNING through the
--        select policy, which matches nothing, so the caller gets no row
--        back for an organisation that now exists.
--
--   2. insert into organization_members …
--        `organization_members_bootstrap` exists precisely to allow this
--        first membership, and checks it by reading the organisation:
--
--            exists (select 1 from organizations
--                    where id = organization_id
--                      and owner_user_id = auth.uid())
--
--        That subquery is evaluated under RLS as the caller. The caller
--        cannot see the organisation. The check fails, Postgres raises
--        42501, and the wizard reports "You do not have permission to do
--        that" to somebody doing the one thing the policy was written to
--        permit.
--
-- This is the recursion the schema already guards against elsewhere —
-- it is why `is_org_member` is SECURITY DEFINER — reintroduced by a raw
-- subquery inside a policy.
--
-- The fix is the clause that was missing rather than a new mechanism:
-- an organisation is readable by the person who owns it. That is plainly
-- intended, widens nothing beyond the owner's own row, and lets both
-- steps above succeed. Once the membership row lands, `is_org_member`
-- carries everything afterwards as before.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists organizations_select_member on organizations;

create policy organizations_select_member on organizations
  for select to authenticated
  using (
    is_org_member(id)
    -- The bootstrap case: created, not yet joined.
    or owner_user_id = (select auth.uid())
    or is_platform_admin()
  );
