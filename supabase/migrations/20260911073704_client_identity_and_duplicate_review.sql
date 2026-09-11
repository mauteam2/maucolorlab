-- Organization-level identity. Privileged service functions run as a NOLOGIN,
-- NOBYPASSRLS role which is NOT the table owner. Public RPC stays SECURITY INVOKER.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'elifora_client_service') then
        create role elifora_client_service nologin nobypassrls;
    end if;
end $$;
alter role elifora_client_service nologin nobypassrls;
grant authenticated to elifora_client_service;
grant elifora_client_service to postgres;
grant usage on schema public, app_private, extensions to elifora_client_service;

insert into public.permissions(code, description) values
 ('clients.read','Read organization client identity.'),
 ('clients.create','Create client identity after duplicate review.'),
 ('clients.update','Update client identity after duplicate review.'),
 ('clients.archive','Archive and restore client identity.');
insert into public.role_permissions(role_code,permission_code)
select r.code,p.code from public.roles r cross join public.permissions p
where p.code like 'clients.%' and
 (p.code='clients.read' or r.code in ('owner','manager')
  or (r.code in ('colorist','reception') and p.code in ('clients.create','clients.update')));

create function app_private.client_name_key(value text)
returns text language sql immutable strict security invoker set search_path=''
as $$ select trim(regexp_replace(regexp_replace(lower(translate(value,'İIıÇçĞğÖöŞşÜü','iiiCcGgOoSsUu')),
 '[^[:alnum:] ]','','g'),'[[:space:]]+',' ','g')); $$;

create function app_private.client_phone_key(value text, region text default 'TR')
returns text language plpgsql immutable security invoker set search_path=''
as $$
declare digits text;
begin
 if value is null or char_length(value)>40 or value !~ '^[+0-9 () .-]+$' then return null; end if;
 digits:=regexp_replace(trim(value),'[ ().-]','','g');
 if left(digits,2)='00' then digits:='+'||substring(digits from 3); end if;
 if left(digits,1)<>'+' then
   -- National input is currently supported for TR. Other regions use explicit +country code.
   if upper(region)<>'TR' then return null; end if;
   if left(digits,1)='0' then digits:=substring(digits from 2); end if;
   if digits ~ '^[2-5][0-9]{9}$' then digits:='+90'||digits;
   elsif digits ~ '^90[2-5][0-9]{9}$' then digits:='+'||digits;
   else return null; end if;
 end if;
 if digits !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
 if left(digits,3)='+90' and digits !~ '^\+90[2-5][0-9]{9}$' then return null; end if;
 return digits;
end $$;

create function app_private.client_phone_mask(value text)
returns text language sql immutable strict security invoker set search_path=''
as $$ select left(value, greatest(2, length(value)-8))||'•••••'||right(value,3); $$;

create table public.clients (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 full_name text not null check(char_length(trim(full_name)) between 2 and 160),
 name_normalized text generated always as (app_private.client_name_key(full_name)) stored,
 phone text not null,
 phone_normalized text not null check(phone_normalized ~ '^\+[1-9][0-9]{7,14}$'),
 email text check(email is null or char_length(email)<=254),
 email_normalized text generated always as (lower(trim(email))) stored,
 birth_date date check(birth_date is null or birth_date>=date '1900-01-01'),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 updated_by uuid not null references public.profiles(user_id) on delete restrict,
 creation_location_id uuid not null,
 foreign key(organization_id,creation_location_id) references public.locations(organization_id,id) on delete restrict
);
-- Phone intentionally has a NON-UNIQUE index: family members may share it.
create index clients_organization_status_name on public.clients(organization_id,status,name_normalized,id);
create index clients_organization_phone on public.clients(organization_id,phone_normalized);
create index clients_organization_email on public.clients(organization_id,email_normalized) where email_normalized is not null;
create index clients_organization_birth_name on public.clients(organization_id,birth_date,name_normalized) where birth_date is not null;
create index clients_name_search on public.clients using gin(name_normalized extensions.gin_trgm_ops);
create index clients_phone_search on public.clients using gin(phone_normalized extensions.gin_trgm_ops);
create index clients_created_by on public.clients(created_by);
create index clients_updated_by on public.clients(updated_by);
create index clients_creation_location on public.clients(organization_id,creation_location_id);

create function app_private.can_access_clients(target_org uuid, permission text)
returns boolean language sql stable security invoker set search_path=''
as $$
 select exists(select 1 from public.locations l
  where l.organization_id=target_org and l.archived_at is null
    and app_private.user_has_permission(target_org,l.id,permission));
$$;
revoke all on function app_private.client_name_key(text), app_private.client_phone_key(text,text),
 app_private.client_phone_mask(text),app_private.can_access_clients(uuid,text) from public,anon;
grant execute on function app_private.client_name_key(text),app_private.client_phone_key(text,text),
 app_private.client_phone_mask(text),app_private.can_access_clients(uuid,text) to authenticated;

alter table public.clients enable row level security;
alter table public.clients force row level security;
revoke all on public.clients from anon,authenticated,service_role;
grant select on public.clients to authenticated;
grant select,insert,update on public.clients to elifora_client_service;
create policy clients_read on public.clients for select to authenticated
 using(app_private.can_access_clients(organization_id,'clients.read'));
create policy clients_create_service on public.clients for insert to elifora_client_service
 with check(created_by=(select auth.uid()) and updated_by=(select auth.uid())
  and app_private.can_access_clients(organization_id,'clients.create'));
create policy clients_update_service on public.clients for update to elifora_client_service
 using(app_private.can_access_clients(organization_id,'clients.update') or app_private.can_access_clients(organization_id,'clients.archive'))
 with check(updated_by=(select auth.uid()) and
  (app_private.can_access_clients(organization_id,'clients.update') or app_private.can_access_clients(organization_id,'clients.archive')));

create function app_private.protect_client_identity()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='23514',message='client identity cannot be deleted'; end if;
 if new.id<>old.id or new.organization_id<>old.organization_id or new.created_by<>old.created_by
  or new.created_at<>old.created_at or new.creation_location_id<>old.creation_location_id then
  raise exception using errcode='23514',message='client ownership is immutable';
 end if;
 return new;
end $$;
create trigger clients_immutable_ownership before update or delete on public.clients
 for each row execute function app_private.protect_client_identity();

create table app_private.client_duplicate_reviews (
 token uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 membership_id uuid not null,
 location_id uuid not null,
 operation text not null,
 payload_hash text not null,
 candidates_hash text not null,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create index client_duplicate_reviews_actor_expiry on app_private.client_duplicate_reviews(organization_id,actor_id,expires_at);
create table app_private.client_mutation_receipts (
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 request_id uuid not null,
 payload_hash text not null,
 response jsonb not null,
 expires_at timestamptz not null default now()+interval '24 hours',
 primary key(organization_id,actor_id,request_id)
);
alter table app_private.client_duplicate_reviews enable row level security;
alter table app_private.client_mutation_receipts enable row level security;
revoke all on app_private.client_duplicate_reviews,app_private.client_mutation_receipts from public,anon,authenticated,service_role;
grant select,insert,delete on app_private.client_duplicate_reviews,app_private.client_mutation_receipts to elifora_client_service;
create policy client_review_service on app_private.client_duplicate_reviews to elifora_client_service
 using(actor_id=(select auth.uid()) and app_private.can_access_clients(organization_id,'clients.read'))
 with check(actor_id=(select auth.uid()) and app_private.can_access_clients(organization_id,'clients.read'));
create policy client_receipt_service on app_private.client_mutation_receipts to elifora_client_service
 using(actor_id=(select auth.uid()) and app_private.can_access_clients(organization_id,'clients.read'))
 with check(actor_id=(select auth.uid()) and app_private.can_access_clients(organization_id,'clients.read'));

grant insert on public.audit_events to elifora_client_service;
create policy client_audit_append on public.audit_events for insert to elifora_client_service
 with check(actor_user_id=(select auth.uid()) and entity_type='client'
  and action in ('client.created','client.updated','client.archived','client.restored','client.duplicate_override')
  and app_private.can_access_clients(organization_id,'clients.read'));

create function app_private.client_error(code text, correlation uuid, field text default null)
returns jsonb language sql immutable security invoker set search_path=''
as $$ select jsonb_build_object('code',code,'message',code,'correlationId',correlation)
 ||case when field is null then '{}'::jsonb else jsonb_build_object('fieldErrors',
 jsonb_build_array(jsonb_build_object('field',field,'code',code))) end; $$;
revoke all on function app_private.client_error(text,uuid,text) from public,anon;
grant execute on function app_private.client_error(text,uuid,text) to authenticated;

create function app_private.execute_client_operation(
 p_membership_id uuid,p_location_id uuid,p_operation text,p_payload jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on'
as $$
declare
 v_org uuid; v_actor uuid:=auth.uid(); v_permission text; v_allowed text[];
 v_client public.clients%rowtype; v_old public.clients%rowtype;
 v_request uuid; v_token uuid; v_name text; v_phone text; v_email text; v_birth date;
 v_hash text; v_candidate_hash text; v_receipt app_private.client_mutation_receipts%rowtype;
 v_review app_private.client_duplicate_reviews%rowtype;
 v_candidates jsonb; v_data jsonb; v_response jsonb; v_query text; v_digits text;
 v_offset integer; v_limit integer; v_status text; v_confirmed boolean:=false;
begin
 p_correlation_id:=coalesce(p_correlation_id,gen_random_uuid());
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation_id); end if;
 if p_operation not in ('list','detail','create','update','archive','restore') or p_operation is null
  or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>8192 then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 v_permission:=case p_operation when 'list' then 'clients.read' when 'detail' then 'clients.read'
  when 'restore' then 'clients.archive' else 'clients.'||p_operation end;
 -- The selected membership and location are references, not authority.
 select m.organization_id into v_org from public.salon_memberships m
 join public.organizations o on o.id=m.organization_id and o.archived_at is null
 join public.locations l on l.organization_id=o.id and l.id=p_location_id and l.archived_at is null
 where m.id=p_membership_id and m.user_id=v_actor and m.status='active'
  and (m.location_id is null or m.location_id=l.id);
 if v_org is null then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id); end if;
 if not exists(select 1 from public.salon_memberships m join public.role_permissions rp on rp.role_code=m.role_code
   where m.id=p_membership_id and rp.permission_code=v_permission)
  or not app_private.user_has_permission(v_org,p_location_id,v_permission) then
  return app_private.client_error('FORBIDDEN',p_correlation_id);
 end if;
 v_allowed:=case p_operation
  when 'list' then array['query','status','offset','limit']
  when 'detail' then array['client_id']
  when 'create' then array['full_name','phone','phone_region','email','birth_date','request_id','confirmation_token']
  when 'update' then array['client_id','expected_version','full_name','phone','phone_region','email','birth_date','request_id','confirmation_token']
  else array['client_id','expected_version','request_id'] end;
 if exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(v_allowed))) then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 if p_operation='list' then
  v_query:=app_private.client_name_key(coalesce(p_payload->>'query',''));
  v_digits:=regexp_replace(coalesce(p_payload->>'query',''),'[^0-9]','','g');
  if left(v_digits,1)='0' then v_digits:=substring(v_digits from 2); end if;
  v_offset:=coalesce((p_payload->>'offset')::integer,0); v_limit:=coalesce((p_payload->>'limit')::integer,25);
  v_status:=coalesce(p_payload->>'status','ACTIVE');
  if v_offset<0 or v_offset>10000 or v_limit<1 or v_limit>50 or char_length(v_query)>80
   or v_status not in ('ACTIVE','ARCHIVED') then return app_private.client_error('VALIDATION_FAILED',p_correlation_id); end if;
  select coalesce(jsonb_agg(item),'[]') into v_data from (
   select jsonb_build_object('id',c.id,'full_name',c.full_name,'phone_masked',app_private.client_phone_mask(c.phone_normalized),
    'status',c.status,'updated_at',c.updated_at) item
   from public.clients c where c.organization_id=v_org and c.status=v_status
   and (v_query='' or c.name_normalized like '%'||v_query||'%'
    or (char_length(v_digits)>=3 and c.phone_normalized like '%'||v_digits||'%'))
   order by c.name_normalized,c.id limit v_limit+1 offset v_offset
  ) rows;
  return jsonb_build_object('data',jsonb_build_object('items',
   (select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(v_data) with ordinality a(value,n) where n<=v_limit),
   'has_more',jsonb_array_length(v_data)>v_limit,'offset',v_offset),'correlationId',p_correlation_id);
 end if;
 if p_operation='detail' then
  select * into v_client from public.clients c where c.id=(p_payload->>'client_id')::uuid and c.organization_id=v_org;
  if not found then return app_private.client_error('CLIENT_NOT_FOUND',p_correlation_id); end if;
  return jsonb_build_object('data',to_jsonb(v_client)-'name_normalized'-'email_normalized','correlationId',p_correlation_id);
 end if;
 v_request:=(p_payload->>'request_id')::uuid;
 if v_request is null then return app_private.client_error('VALIDATION_FAILED',p_correlation_id,'request_id'); end if;
 -- Serializes duplicate detection and writes within this organization, including retries.
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 if not exists(select 1 from public.salon_memberships m join public.role_permissions rp on rp.role_code=m.role_code
   where m.id=p_membership_id and m.user_id=v_actor and m.status='active' and rp.permission_code=v_permission)
  or not app_private.user_has_permission(v_org,p_location_id,v_permission) then
  return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id);
 end if;
 v_hash:=encode(extensions.digest(p_operation||p_membership_id::text||p_location_id::text||
  (p_payload-'request_id')::text,'sha256'),'hex');
 delete from app_private.client_mutation_receipts where organization_id=v_org and actor_id=v_actor and expires_at<now();
 select * into v_receipt from app_private.client_mutation_receipts
  where organization_id=v_org and actor_id=v_actor and request_id=v_request;
 if found then
  if v_receipt.payload_hash<>v_hash then return app_private.client_error('CONFLICT',p_correlation_id); end if;
  return v_receipt.response||jsonb_build_object('correlationId',p_correlation_id);
 end if;
 if p_operation<>'create' then
  select * into v_client from public.clients c where c.id=(p_payload->>'client_id')::uuid and c.organization_id=v_org for update;
  if not found then return app_private.client_error('CLIENT_NOT_FOUND',p_correlation_id); end if;
  v_old:=v_client;
  if (p_payload->>'expected_version')::bigint is distinct from v_client.version then
   return app_private.client_error('CONFLICT',p_correlation_id);
  end if;
  if p_operation='update' and v_client.status='ARCHIVED' then
   return app_private.client_error('CLIENT_ARCHIVED',p_correlation_id);
  end if;
 end if;
 if p_operation in ('create','update') then
  v_name:=trim(regexp_replace(p_payload->>'full_name','[[:space:]]+',' ','g'));
  v_phone:=app_private.client_phone_key(p_payload->>'phone',coalesce(p_payload->>'phone_region','TR'));
  v_email:=nullif(lower(trim(p_payload->>'email')),'');
  if v_name is null or char_length(v_name) not between 2 and 160 or char_length(app_private.client_name_key(v_name))<2 then
   return app_private.client_error('VALIDATION_FAILED',p_correlation_id,'full_name'); end if;
  if v_phone is null then return app_private.client_error('VALIDATION_FAILED',p_correlation_id,'phone'); end if;
  if v_email is not null and (char_length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
   return app_private.client_error('VALIDATION_FAILED',p_correlation_id,'email'); end if;
  v_birth:=nullif(p_payload->>'birth_date','')::date;
  if v_birth is not null and (v_birth<date '1900-01-01' or v_birth>current_date) then
   return app_private.client_error('VALIDATION_FAILED',p_correlation_id,'birth_date'); end if;
  with candidates as materialized (
   select c.id,c.full_name,c.phone_normalized,c.status,c.updated_at,c.version,
    array_remove(array[
     case when c.phone_normalized=v_phone then 'PHONE' end,
     case when c.name_normalized=app_private.client_name_key(v_name) then 'NAME' end,
     case when c.email_normalized=v_email then 'EMAIL' end,
     case when c.birth_date=v_birth then 'BIRTH_DATE' end],null) signals
   from public.clients c where c.organization_id=v_org and c.id is distinct from v_client.id
   and (c.phone_normalized=v_phone or c.name_normalized=app_private.client_name_key(v_name)
    or (v_email is not null and c.email_normalized=v_email)
    or (v_birth is not null and c.birth_date=v_birth and left(c.name_normalized,3)=left(app_private.client_name_key(v_name),3)))
  ), shown as (select * from candidates order by ('PHONE'=any(signals)) desc,updated_at desc,id limit 10)
  select (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,
   'phone_masked',app_private.client_phone_mask(s.phone_normalized),'status',s.status,'updated_at',s.updated_at,'signals',s.signals)),'[]') from shown s),
   (select encode(extensions.digest(coalesce(string_agg(c.id::text||':'||c.version::text,',' order by c.id),''),'sha256'),'hex') from candidates c)
  into v_candidates,v_candidate_hash;
  if jsonb_array_length(v_candidates)>0 then
   v_token:=nullif(p_payload->>'confirmation_token','')::uuid;
   if v_token is not null then
    select * into v_review from app_private.client_duplicate_reviews r where r.token=v_token and r.organization_id=v_org
      and r.actor_id=v_actor and r.membership_id=p_membership_id and r.location_id=p_location_id and r.operation=p_operation
      and r.expires_at>now() and r.payload_hash=encode(extensions.digest((p_payload-'request_id'-'confirmation_token')::text,'sha256'),'hex')
      and r.candidates_hash=v_candidate_hash;
    if not found then return app_private.client_error('DUPLICATE_CONFIRMATION_INVALID',p_correlation_id); end if;
    delete from app_private.client_duplicate_reviews where token=v_token;
    v_confirmed:=true;
   else
    delete from app_private.client_duplicate_reviews where organization_id=v_org and actor_id=v_actor and expires_at<now();
    insert into app_private.client_duplicate_reviews(organization_id,actor_id,membership_id,location_id,operation,payload_hash,candidates_hash)
    values(v_org,v_actor,p_membership_id,p_location_id,p_operation,
     encode(extensions.digest((p_payload-'request_id'-'confirmation_token')::text,'sha256'),'hex'),v_candidate_hash)
    returning token into v_token;
    return app_private.client_error('DUPLICATE_CLIENT_CANDIDATES',p_correlation_id)||
     jsonb_build_object('candidates',v_candidates,'confirmation_token',v_token);
   end if;
  elsif nullif(p_payload->>'confirmation_token','') is not null then
   return app_private.client_error('DUPLICATE_CONFIRMATION_INVALID',p_correlation_id);
  end if;
  if p_operation='create' then
   insert into public.clients(organization_id,full_name,phone,phone_normalized,email,birth_date,created_by,updated_by,creation_location_id)
   values(v_org,v_name,v_phone,v_phone,v_email,v_birth,v_actor,v_actor,p_location_id) returning * into v_client;
  else
   update public.clients set full_name=v_name,phone=v_phone,phone_normalized=v_phone,email=v_email,birth_date=v_birth,
    updated_by=v_actor,updated_at=now(),version=version+1 where id=v_client.id returning * into v_client;
  end if;
 else
  if (p_operation='archive' and v_client.status='ARCHIVED') or (p_operation='restore' and v_client.status='ACTIVE') then
   return app_private.client_error('CONFLICT',p_correlation_id);
  end if;
  update public.clients set status=case p_operation when 'archive' then 'ARCHIVED' else 'ACTIVE' end,
   updated_by=v_actor,updated_at=now(),version=version+1 where id=v_client.id returning * into v_client;
 end if;
 -- Only meaningful identity/status values are audited, never the raw request or review token.
 insert into public.audit_events(actor_user_id,organization_id,location_id,action,entity_type,entity_id,metadata,correlation_id)
 values(v_actor,v_org,p_location_id,case p_operation when 'create' then 'client.created' when 'update' then 'client.updated'
  when 'archive' then 'client.archived' else 'client.restored' end,'client',v_client.id,
  jsonb_build_object('old',case when p_operation='create' then null else
    jsonb_build_object('full_name',v_old.full_name,'phone',v_old.phone_normalized,'email',v_old.email,'birth_date',v_old.birth_date,'status',v_old.status,'version',v_old.version) end,
   'new',jsonb_build_object('full_name',v_client.full_name,'phone',v_client.phone_normalized,'email',v_client.email,
    'birth_date',v_client.birth_date,'status',v_client.status,'version',v_client.version)),p_correlation_id);
 if v_confirmed then
  insert into public.audit_events(actor_user_id,organization_id,location_id,action,entity_type,entity_id,reason,metadata,correlation_id)
  values(v_actor,v_org,p_location_id,'client.duplicate_override','client',v_client.id,'Confirmed separate person',
   jsonb_build_object('operation',p_operation,'candidate_count',jsonb_array_length(v_candidates)),p_correlation_id);
 end if;
 v_response:=jsonb_build_object('data',to_jsonb(v_client)-'name_normalized'-'email_normalized','correlationId',p_correlation_id);
 insert into app_private.client_mutation_receipts(organization_id,actor_id,request_id,payload_hash,response)
 values(v_org,v_actor,v_request,v_hash,v_response);
 return v_response;
exception
 when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
end $$;
-- Ownership is deliberately separate from table ownership; RLS remains active.
grant create on schema app_private to elifora_client_service;
alter function app_private.execute_client_operation(uuid,uuid,text,jsonb,uuid) owner to elifora_client_service;
revoke create on schema app_private from elifora_client_service;
revoke all on function app_private.execute_client_operation(uuid,uuid,text,jsonb,uuid) from public,anon;
grant execute on function app_private.execute_client_operation(uuid,uuid,text,jsonb,uuid) to authenticated;

create function public.client_operation(p_membership_id uuid,p_location_id uuid,p_operation text,
 p_payload jsonb default '{}',p_correlation_id uuid default gen_random_uuid())
returns jsonb language sql security invoker set search_path=''
as $$ select app_private.execute_client_operation(p_membership_id,p_location_id,p_operation,p_payload,p_correlation_id); $$;
revoke all on function public.client_operation(uuid,uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.client_operation(uuid,uuid,text,jsonb,uuid) to authenticated;
