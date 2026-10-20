-- End-user JWTs cannot upload, download, sign, copy or list technical objects.
-- Only the application-authenticated Edge proxy uses the provider's server key.
create policy photo_application_boundary on storage.objects as restrictive for all to authenticated
using(bucket_id <> 'live-technical') with check(bucket_id <> 'live-technical');
update storage.buckets set file_size_limit=4194304 where id='live-technical';

create function public.live_photo_access(p_envelope text,p_signature text) returns jsonb
language plpgsql volatile security definer set search_path='' set row_security='on' as $$
declare e jsonb;ctx jsonb;p public.live_photos%rowtype;s public.live_sessions%rowtype;key bytea;upload boolean;
begin
 perform app_private.require_active_session();
 if octet_length(p_envelope)>2048 or coalesce(p_signature,'') !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select secret into key from app_private.color_engine_keys where id=1;
 if key is null or encode(extensions.hmac(convert_to('elifora/photo-proxy/v1'||chr(10)||p_envelope,'UTF8'),key,'sha256'),'hex') is distinct from p_signature then raise exception using errcode='42501',message='FORBIDDEN';end if;
 e:=p_envelope::jsonb;upload:=e->>'method'='POST';
 if not app_private.salon_keys(e,array['membershipId','locationId','sessionId','photoId','clientId','method','digest','size','expiresAt'])
  or e->>'method' not in ('GET','POST') or (e->>'expiresAt')::timestamptz<clock_timestamp() or (e->>'expiresAt')::timestamptz>clock_timestamp()+interval '65 seconds'
  or upload and (coalesce(e->>'digest','') !~ '^[a-f0-9]{64}$' or (e->>'size')::bigint not between 12 and 4194304)
  or not upload and (e->'digest'<>'null'::jsonb or (e->>'size')::bigint<>0) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 ctx:=app_private.hair_write_context((e->>'membershipId')::uuid,(e->>'locationId')::uuid,case when upload then 'live_session.contribute' else 'live_session.view' end);
 if ctx ? 'code' then return ctx;end if;
 select * into p from public.live_photos where id=(e->>'photoId')::uuid and session_id=(e->>'sessionId')::uuid and organization_id=(ctx->>'organization_id')::uuid;
 select * into s from public.live_sessions where id=p.session_id and organization_id=p.organization_id and location_id=(e->>'locationId')::uuid and client_id=(e->>'clientId')::uuid;
 if p.id is null or s.id is null or not exists(select 1 from public.clients where id=s.client_id and organization_id=s.organization_id and status='ACTIVE')
  or upload and (p.uploaded_by<>auth.uid() or s.status in ('COMPLETED','CANCELLED','ABORTED')) then return jsonb_build_object('code','FORBIDDEN');end if;
 if upload and not app_private.saas_storage_allowed(p.object_path) then return jsonb_build_object('code','QUOTA_UNKNOWN');end if;
 return jsonb_build_object('data',jsonb_build_object('path',p.object_path,'contentType',p.content_type,'actorId',auth.uid()));
exception when invalid_text_representation or datetime_field_overflow then raise exception using errcode='42501',message='FORBIDDEN';
end$$;
revoke all on function public.live_photo_access(text,text) from public,anon,service_role;
grant execute on function public.live_photo_access(text,text) to authenticated;
