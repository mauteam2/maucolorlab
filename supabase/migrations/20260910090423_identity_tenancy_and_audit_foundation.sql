-- ELIFORA Phase 0 identity, tenancy, authorization, and audit foundation.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create table public.profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    display_name text check (display_name is null or char_length(display_name) between 1 and 120),
    locale text not null default 'tr' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 160),
    slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint organizations_archive_after_creation
        check (archived_at is null or archived_at >= created_at)
);

create table public.locations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    name text not null check (char_length(name) between 1 and 160),
    timezone text not null check (char_length(timezone) between 1 and 80),
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint locations_organization_id_id_unique unique (organization_id, id),
    constraint locations_archive_after_creation
        check (archived_at is null or archived_at >= created_at)
);

create table public.roles (
    code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
    label_key text not null unique check (label_key ~ '^roles\.[a-z][a-z0-9_]*$'),
    created_at timestamptz not null default now()
);

create table public.permissions (
    code text primary key check (code ~ '^[a-z][a-z0-9_.]*$'),
    description text not null check (char_length(description) between 1 and 240),
    created_at timestamptz not null default now()
);

create table public.role_permissions (
    role_code text not null references public.roles (code) on delete restrict,
    permission_code text not null references public.permissions (code) on delete restrict,
    created_at timestamptz not null default now(),
    primary key (role_code, permission_code)
);

create index role_permissions_by_permission
    on public.role_permissions (permission_code, role_code);

create table public.salon_memberships (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    location_id uuid,
    user_id uuid not null references public.profiles (user_id) on delete restrict,
    role_code text not null references public.roles (code) on delete restrict,
    status text not null check (status in ('invited', 'active', 'revoked')),
    invited_at timestamptz not null default now(),
    joined_at timestamptz,
    revoked_at timestamptz,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint salon_memberships_location_belongs_to_organization
        foreign key (organization_id, location_id)
        references public.locations (organization_id, id)
        on delete restrict,
    constraint salon_memberships_status_timestamps
        check (
            (status = 'invited' and joined_at is null and revoked_at is null)
            or (status = 'active' and joined_at is not null and revoked_at is null)
            or (status = 'revoked' and revoked_at is not null)
        )
);

create unique index salon_memberships_one_current_organization_membership
    on public.salon_memberships (organization_id, user_id)
    where location_id is null and status in ('invited', 'active');

create unique index salon_memberships_one_current_location_membership
    on public.salon_memberships (organization_id, location_id, user_id)
    where location_id is not null and status in ('invited', 'active');

create index salon_memberships_active_user_access
    on public.salon_memberships (user_id, organization_id, location_id)
    where status = 'active';

create index salon_memberships_user_history
    on public.salon_memberships (user_id, created_at desc);

create index salon_memberships_by_role
    on public.salon_memberships (role_code, organization_id);

create index salon_memberships_organization_location
    on public.salon_memberships (organization_id, location_id);

create index locations_active_by_organization
    on public.locations (organization_id, name)
    where archived_at is null;

create table public.audit_events (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid,
    organization_id uuid not null references public.organizations (id) on delete restrict,
    location_id uuid,
    action text not null check (action ~ '^[a-z][a-z0-9_.]*$'),
    entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]*$'),
    entity_id uuid,
    reason text check (reason is null or char_length(reason) <= 500),
    metadata jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default now(),
    correlation_id uuid not null default gen_random_uuid(),
    constraint audit_events_location_belongs_to_organization
        foreign key (organization_id, location_id)
        references public.locations (organization_id, id)
        on delete restrict,
    constraint audit_events_metadata_is_object
        check (jsonb_typeof(metadata) = 'object'),
    constraint audit_events_metadata_is_bounded
        check (pg_column_size(metadata) <= 16384)
);

create index audit_events_organization_timeline
    on public.audit_events (organization_id, occurred_at desc, id);

create index audit_events_location_timeline
    on public.audit_events (location_id, occurred_at desc, id)
    where location_id is not null;

create index audit_events_organization_location
    on public.audit_events (organization_id, location_id)
    where location_id is not null;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function app_private.set_updated_at();

create trigger locations_set_updated_at
before update on public.locations
for each row execute function app_private.set_updated_at();

create trigger salon_memberships_set_updated_at
before update on public.salon_memberships
for each row execute function app_private.set_updated_at();

create or replace function app_private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (user_id, display_name, locale)
    values (
        new.id,
        nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 120), ''),
        case
            when (new.raw_user_meta_data ->> 'locale') ~ '^[a-z]{2}(-[A-Z]{2})?$'
                then new.raw_user_meta_data ->> 'locale'
            else 'tr'
        end
    );
    return new;
end;
$$;

revoke all on function app_private.create_profile_for_auth_user() from public, anon, authenticated;

create trigger auth_user_created_create_profile
after insert on auth.users
for each row execute function app_private.create_profile_for_auth_user();

create or replace function app_private.user_has_organization_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $$
    select exists (
        select 1
        from public.salon_memberships membership
        join public.organizations organization
          on organization.id = membership.organization_id
        where membership.user_id = (select auth.uid())
          and membership.organization_id = target_organization_id
          and membership.status = 'active'
          and organization.archived_at is null
    );
$$;

create or replace function app_private.user_has_location_access(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $$
    select exists (
        select 1
        from public.locations location
        join public.organizations organization
          on organization.id = location.organization_id
        join public.salon_memberships membership
          on membership.organization_id = location.organization_id
         and (membership.location_id is null or membership.location_id = location.id)
        where membership.user_id = (select auth.uid())
          and location.id = target_location_id
          and membership.status = 'active'
          and location.archived_at is null
          and organization.archived_at is null
    );
$$;

create or replace function app_private.user_has_permission(
    target_organization_id uuid,
    target_location_id uuid,
    target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $$
    select exists (
        select 1
        from public.salon_memberships membership
        join public.role_permissions role_permission
          on role_permission.role_code = membership.role_code
        join public.organizations organization
          on organization.id = membership.organization_id
        left join public.locations location
          on location.id = target_location_id
         and location.organization_id = target_organization_id
        where membership.user_id = (select auth.uid())
          and membership.organization_id = target_organization_id
          and membership.status = 'active'
          and role_permission.permission_code = target_permission_code
          and organization.archived_at is null
          and (
              (target_location_id is null and membership.location_id is null)
              or (
                  target_location_id is not null
                  and location.archived_at is null
                  and (membership.location_id is null or membership.location_id = target_location_id)
              )
          )
    );
$$;

revoke all on function app_private.user_has_organization_access(uuid) from public, anon;
revoke all on function app_private.user_has_location_access(uuid) from public, anon;
revoke all on function app_private.user_has_permission(uuid, uuid, text) from public, anon;
grant execute on function app_private.user_has_organization_access(uuid) to authenticated;
grant execute on function app_private.user_has_location_access(uuid) to authenticated;
grant execute on function app_private.user_has_permission(uuid, uuid, text) to authenticated;

create or replace function app_private.reject_audit_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    raise exception using
        errcode = '23514',
        message = 'audit events are immutable';
end;
$$;

create trigger audit_events_are_immutable
before update or delete on public.audit_events
for each row execute function app_private.reject_audit_event_mutation();

insert into public.roles (code, label_key)
values
    ('owner', 'roles.owner'),
    ('manager', 'roles.manager'),
    ('colorist', 'roles.colorist'),
    ('assistant', 'roles.assistant'),
    ('reception', 'roles.reception');

insert into public.permissions (code, description)
values
    ('organization.read', 'Read the current organization identity and settings.'),
    ('organization.manage', 'Manage organization settings through a server operation.'),
    ('location.read', 'Read locations allowed by the current membership.'),
    ('location.manage', 'Manage allowed location settings through a server operation.'),
    ('memberships.read', 'Read memberships within the allowed membership scope.'),
    ('memberships.manage', 'Manage memberships through a server operation.'),
    ('audit.read', 'Read audit events within the allowed membership scope.');

insert into public.role_permissions (role_code, permission_code)
select 'owner', code from public.permissions;

insert into public.role_permissions (role_code, permission_code)
values
    ('manager', 'organization.read'),
    ('manager', 'location.read'),
    ('manager', 'location.manage'),
    ('manager', 'memberships.read'),
    ('manager', 'memberships.manage'),
    ('manager', 'audit.read'),
    ('colorist', 'organization.read'),
    ('colorist', 'location.read'),
    ('assistant', 'organization.read'),
    ('assistant', 'location.read'),
    ('reception', 'organization.read'),
    ('reception', 'location.read'),
    ('reception', 'memberships.read');

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.salon_memberships enable row level security;
alter table public.audit_events enable row level security;

revoke all on table
    public.profiles,
    public.organizations,
    public.locations,
    public.roles,
    public.permissions,
    public.role_permissions,
    public.salon_memberships,
    public.audit_events
from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, locale) on table public.profiles to authenticated;
grant select on table
    public.organizations,
    public.locations,
    public.roles,
    public.permissions,
    public.role_permissions,
    public.salon_memberships,
    public.audit_events
to authenticated;

revoke update, delete, truncate on table public.audit_events from service_role;
grant select, insert on table public.audit_events to service_role;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy organizations_select_by_active_membership
on public.organizations
for select
to authenticated
using ((select app_private.user_has_organization_access(id)));

create policy locations_select_by_active_membership
on public.locations
for select
to authenticated
using ((select app_private.user_has_location_access(id)));

create policy roles_select_authenticated
on public.roles
for select
to authenticated
using (true);

create policy permissions_select_authenticated
on public.permissions
for select
to authenticated
using (true);

create policy role_permissions_select_authenticated
on public.role_permissions
for select
to authenticated
using (true);

create policy salon_memberships_select_allowed_scope
on public.salon_memberships
for select
to authenticated
using (
    (
        user_id = (select auth.uid())
        and status = 'active'
        and (select app_private.user_has_organization_access(organization_id))
    )
    or (
        select app_private.user_has_permission(
            organization_id,
            location_id,
            'memberships.read'
        )
    )
);

create policy audit_events_select_with_permission
on public.audit_events
for select
to authenticated
using (
    (
        select app_private.user_has_permission(
            organization_id,
            location_id,
            'audit.read'
        )
    )
);
