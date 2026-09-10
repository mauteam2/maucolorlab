-- Read-only bootstrap. SECURITY INVOKER preserves every underlying RLS policy.
create function public.list_workspace_contexts()
returns table (
    membership_id uuid,
    organization_id uuid,
    organization_name text,
    location_id uuid,
    location_name text,
    role text,
    membership_status text,
    permissions text[]
)
language sql stable security invoker
set search_path = ''
as $$
    select m.id, o.id, o.name, l.id, l.name, m.role_code, m.status,
        array(select rp.permission_code from public.role_permissions rp
              where rp.role_code = m.role_code order by rp.permission_code)
    from public.salon_memberships m
    join public.organizations o on o.id = m.organization_id and o.archived_at is null
    join public.locations l on l.organization_id = o.id and l.archived_at is null
        and (m.location_id is null or m.location_id = l.id)
    where m.user_id = (select auth.uid()) and m.status = 'active'
    order by o.name, l.name, m.id;
$$;
revoke all on function public.list_workspace_contexts() from public, anon;
grant execute on function public.list_workspace_contexts() to authenticated;

-- The Phase 0 helper's LEFT JOIN could treat a missing location as unarchived.
-- Require a real location belonging to the requested organization.
create or replace function app_private.user_has_permission(
    target_organization_id uuid, target_location_id uuid, target_permission_code text
)
returns boolean language sql stable security definer
set search_path = '' set row_security = 'off'
as $$
    select exists (
        select 1 from public.salon_memberships m
        join public.role_permissions rp on rp.role_code = m.role_code
        join public.organizations o on o.id = m.organization_id
        where m.user_id = (select auth.uid())
          and m.organization_id = target_organization_id and m.status = 'active'
          and o.archived_at is null and rp.permission_code = target_permission_code
          and ((target_location_id is null and m.location_id is null)
            or (target_location_id is not null
                and (m.location_id is null or m.location_id = target_location_id)
                and exists (select 1 from public.locations l
                            where l.id = target_location_id
                              and l.organization_id = target_organization_id
                              and l.archived_at is null)))
    );
$$;
