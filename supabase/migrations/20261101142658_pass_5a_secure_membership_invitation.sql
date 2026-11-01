-- Recipient-bound membership lifecycle only. No email/token/signup/provisioning.
create table app_private.membership_acceptance_receipts (
 actor_id uuid not null, request_id uuid not null,
 membership_id uuid not null references public.salon_memberships(id) on delete restrict,
 created_at timestamptz not null default statement_timestamp(),
 primary key(actor_id,request_id)
);
alter table app_private.membership_acceptance_receipts enable row level security;
revoke all on app_private.membership_acceptance_receipts from public,anon,authenticated,service_role;
create trigger membership_acceptance_receipt_immutable before update or delete
 on app_private.membership_acceptance_receipts for each row execute function app_private.live_immutable();

-- Projection is private and has no caller grant. Public wrappers first establish
-- own-identity visibility; this helper must never become a general tenant lookup.
create function app_private.membership_invitation_view(m public.salon_memberships) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('membership_id',m.id,'organization_name',o.name,
  'location_name',l.name,'role_code',m.role_code,'status',m.status,
  'invited_at',m.invited_at,'joined_at',m.joined_at,
  'state',case when m.status='revoked' then 'REVOKED'
   when o.id is null or o.archived_at is not null then 'ORGANIZATION_UNAVAILABLE'
   when m.location_id is not null and (l.id is null or l.archived_at is not null) then 'LOCATION_UNAVAILABLE'
   when m.status='active' then 'ACTIVE' else 'PENDING' end)
 from public.organizations o left join public.locations l on l.id=m.location_id and l.organization_id=m.organization_id
 where o.id=m.organization_id;
$$;
revoke all on function app_private.membership_invitation_view(public.salon_memberships) from public,anon,authenticated,service_role;

-- Null locator lists pending invitations only. A specific locator reads the
-- caller's own current/terminal state without exposing another user's existence.
create function public.read_my_membership_invitations(p_membership_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('code','UNAUTHENTICATED');end if;
 perform app_private.require_active_session();
 select coalesce(jsonb_agg(app_private.membership_invitation_view(m) order by m.invited_at,m.id),'[]'::jsonb)
 into items from public.salon_memberships m where m.user_id=auth.uid()
 and ((p_membership_id is null and m.status='invited') or m.id=p_membership_id);
 if p_membership_id is not null and jsonb_array_length(items)=0 then return jsonb_build_object('code','INVITATION_NOT_FOUND');end if;
 return jsonb_build_object('data',items);
end $$;
revoke all on function public.read_my_membership_invitations(uuid) from public,anon,service_role;
grant execute on function public.read_my_membership_invitations(uuid) to authenticated;

create function public.accept_my_membership_invitation(p_membership_id uuid,p_request_id uuid,p_correlation_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare m public.salon_memberships%rowtype; org public.organizations%rowtype;
 loc public.locations%rowtype; receipt app_private.membership_acceptance_receipts%rowtype; view jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('code','UNAUTHENTICATED');end if;
 perform app_private.require_active_session();
 if p_membership_id is null or p_request_id is null or p_correlation_id is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 -- Serialize a recipient's request namespace across ALL organizations/targets.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':membership-acceptance',105));
 select * into m from public.salon_memberships where id=p_membership_id and user_id=auth.uid();
 if not found then return jsonb_build_object('code','INVITATION_NOT_FOUND');end if;
 select * into receipt from app_private.membership_acceptance_receipts where actor_id=auth.uid() and request_id=p_request_id;
 if found and receipt.membership_id<>m.id then return jsonb_build_object('code','INVITATION_REPLAY_CONFLICT');end if;
 -- Hold archive fences through commit. Acquire row locks BEFORE the quota
 -- advisory lock taken by membership/location UPDATE triggers, matching normal
 -- operator revocation ordering instead of advisory -> row lock inversion.
 select * into org from public.organizations where id=m.organization_id for share;
 if m.location_id is not null then
  select * into loc from public.locations where organization_id=m.organization_id and id=m.location_id for share;
 end if;
 select * into m from public.salon_memberships where id=p_membership_id and user_id=auth.uid() for update;
 if not found then return jsonb_build_object('code','INVITATION_NOT_FOUND');end if;
 -- A concurrent reviewed scope edit invalidates the earlier archive fence.
 if m.organization_id is distinct from org.id or (m.location_id is not null and m.location_id is distinct from loc.id) then
  return jsonb_build_object('code','INVITATION_UNAVAILABLE');end if;
 if m.status='revoked' then return jsonb_build_object('code','INVITATION_REVOKED');end if;
 if org.archived_at is not null or (m.location_id is not null and loc.archived_at is not null) then
  return jsonb_build_object('code','INVITATION_UNAVAILABLE');end if;
 if m.status='invited' then
  -- Existing quota trigger reserves no second seat for invited -> active.
  update public.salon_memberships set status='active',joined_at=clock_timestamp()
   where id=m.id and user_id=auth.uid() and status='invited' returning * into m;
  insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,correlation_id,metadata)
   values(auth.uid(),m.organization_id,'membership.invite_accepted','salon_memberships',m.id,p_correlation_id,jsonb_build_object('request_id',p_request_id));
 end if;
 insert into app_private.membership_acceptance_receipts(actor_id,request_id,membership_id)
  values(auth.uid(),p_request_id,m.id) on conflict(actor_id,request_id) do nothing;
 -- Never replay a stored ACTIVE snapshot after revocation/archive/scope change.
 view:=app_private.membership_invitation_view(m);
 return jsonb_build_object('data',view,'correlationId',p_correlation_id);
end $$;
revoke all on function public.accept_my_membership_invitation(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.accept_my_membership_invitation(uuid,uuid,uuid) to authenticated;
