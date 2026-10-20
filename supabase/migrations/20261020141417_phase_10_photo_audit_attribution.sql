-- The proxy performs Storage transport with a provider server credential, so
-- auth.uid() there is null. Only the trusted Edge transport supplies attribution.
-- All end-user object mutations are denied by the restrictive proxy policy.
create or replace function app_private.audit_live_photo() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.live_photos%rowtype;actor uuid;
begin
 if new.bucket_id='live-technical' then
  select * into p from public.live_photos where object_path=new.name;
  actor:=coalesce(auth.uid(),nullif(new.user_metadata->>'elifora_actor','')::uuid);
  if p.id is null or actor is distinct from p.uploaded_by then raise exception using errcode='42501',message='PHOTO_ATTRIBUTION_REQUIRED';end if;
  insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
  values(actor,p.organization_id,'live_session.photo_uploaded','live_sessions',p.session_id,jsonb_build_object('photo_id',p.id),gen_random_uuid());
 end if;
 return new;
end$$;
revoke all on function app_private.audit_live_photo() from public,anon,authenticated,service_role;
