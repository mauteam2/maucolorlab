begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
values
    (
        '00000000-0000-0000-0000-000000000000',
        '10000000-0000-0000-0000-000000000001',
        'authenticated',
        'authenticated',
        'owner-a@elifora.test',
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Owner A","locale":"tr"}'::jsonb,
        now(),
        now()
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '10000000-0000-0000-0000-000000000002',
        'authenticated',
        'authenticated',
        'owner-b@elifora.test',
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Owner B","locale":"tr"}'::jsonb,
        now(),
        now()
    );

insert into public.organizations (id, name, slug, base_currency)
values
    ('20000000-0000-0000-0000-000000000001', 'Salon A', 'salon-a', 'TRY'),
    ('20000000-0000-0000-0000-000000000002', 'Salon B', 'salon-b', 'EUR');

insert into public.locations (id, organization_id, name, timezone)
values
    (
        '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        'A Nişantaşı',
        'Europe/Istanbul'
    ),
    (
        '30000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000001',
        'A Ankara',
        'Europe/Istanbul'
    ),
    (
        '30000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000002',
        'B Berlin',
        'Europe/Berlin'
    );

insert into public.salon_memberships (
    id,
    organization_id,
    location_id,
    user_id,
    role_code,
    status,
    joined_at
)
values
    (
        '40000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'owner',
        'active',
        now()
    ),
    (
        '40000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002',
        null,
        '10000000-0000-0000-0000-000000000002',
        'owner',
        'active',
        now()
    );

insert into public.audit_events (
    id,
    actor_user_id,
    organization_id,
    location_id,
    action,
    entity_type,
    entity_id,
    correlation_id
)
values
    (
        '50000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        'membership.created',
        'salon_membership',
        '40000000-0000-0000-0000-000000000001',
        '60000000-0000-0000-0000-000000000001'
    ),
    (
        '50000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000003',
        'membership.created',
        'salon_membership',
        '40000000-0000-0000-0000-000000000002',
        '60000000-0000-0000-0000-000000000002'
    );

select is(
    has_table_privilege('anon', 'public.organizations', 'SELECT'),
    false,
    'unauthenticated clients cannot read organizations'
);
select is(
    has_table_privilege('anon', 'public.locations', 'SELECT'),
    false,
    'unauthenticated clients cannot read locations'
);
select is(
    has_table_privilege('anon', 'public.salon_memberships', 'SELECT'),
    false,
    'unauthenticated clients cannot read memberships'
);
select is(
    has_table_privilege('anon', 'public.audit_events', 'SELECT'),
    false,
    'unauthenticated clients cannot read audit events'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is((select count(*) from public.organizations), 1::bigint, 'user A sees one organization');
select is(
    (select id from public.organizations),
    '20000000-0000-0000-0000-000000000001'::uuid,
    'user A sees organization A'
);
select is((select count(*) from public.locations), 1::bigint, 'user A sees only an assigned location');
select is(
    (select id from public.locations),
    '30000000-0000-0000-0000-000000000001'::uuid,
    'user A cannot see another location in the organization'
);
select is((select count(*) from public.salon_memberships), 1::bigint, 'user A sees memberships only in allowed scope');
select is((select count(*) from public.audit_events), 1::bigint, 'user A sees audit only in allowed scope');
select is(
    (select count(*) from public.audit_events where organization_id = '20000000-0000-0000-0000-000000000002'),
    0::bigint,
    'user A cannot read organization B audit'
);
select is((select count(*) from public.profiles), 1::bigint, 'user A reads only their own profile');

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select is((select count(*) from public.organizations), 1::bigint, 'user B sees one organization before revocation');
select is(
    (select count(*) from public.organizations where id = '20000000-0000-0000-0000-000000000001'),
    0::bigint,
    'user B cannot read organization A'
);
select is((select count(*) from public.locations), 1::bigint, 'organization-wide membership sees its active location');

reset role;
update public.salon_memberships
set status = 'revoked', revoked_at = now()
where id = '40000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select is((select count(*) from public.organizations), 0::bigint, 'revocation removes organization access');
select is((select count(*) from public.locations), 0::bigint, 'revocation removes location access');
select is((select count(*) from public.salon_memberships), 0::bigint, 'revoked user cannot read the membership row');

reset role;

select is(
    has_table_privilege('authenticated', 'public.organizations', 'INSERT'),
    false,
    'normal clients cannot forge organization ownership'
);
select is(
    has_table_privilege('authenticated', 'public.salon_memberships', 'INSERT'),
    false,
    'normal clients cannot forge a membership'
);
select is(
    has_table_privilege('authenticated', 'public.salon_memberships', 'UPDATE'),
    false,
    'normal clients cannot forge a role'
);
select is(
    has_table_privilege('authenticated', 'public.audit_events', 'INSERT'),
    false,
    'normal clients cannot append arbitrary audit events'
);
select is(
    has_table_privilege('authenticated', 'public.audit_events', 'UPDATE'),
    false,
    'normal clients cannot rewrite audit events'
);
select is(
    has_table_privilege('authenticated', 'public.audit_events', 'DELETE'),
    false,
    'normal clients cannot delete audit events'
);
select is(
    has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
    true,
    'normal clients may update their own display name'
);
select is(
    has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE'),
    false,
    'normal clients cannot reassign profile ownership'
);

select throws_ok(
    $$update public.audit_events set reason = 'rewrite' where id = '50000000-0000-0000-0000-000000000001'$$,
    '23514',
    'audit events are immutable',
    'the database rejects privileged audit rewrites'
);
select throws_ok(
    $$delete from public.audit_events where id = '50000000-0000-0000-0000-000000000001'$$,
    '23514',
    'audit events are immutable',
    'the database rejects privileged audit deletion'
);

select * from finish();
rollback;
