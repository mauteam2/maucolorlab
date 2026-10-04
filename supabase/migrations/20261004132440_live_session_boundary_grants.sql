-- Keep signature/context helpers private to the dedicated, non-login writer.
grant execute on function app_private.verify_color_signature(text,text),app_private.hair_write_context(uuid,uuid,text),app_private.client_error(text,uuid,text) to elifora_live_writer;
alter function public.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) set schema app_private;
create or replace function app_private.live_session_receipt(p_membership_id uuid,p_location_id uuid,p_mutation_id uuid,p_input jsonb,p_session_id uuid,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
 declare ctx jsonb;r public.live_session_versions%rowtype;begin
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,app_private.live_permission(coalesce(p_input->>'type','CREATE')));if ctx ? 'code' then return ctx;end if;
 select v.* into r from public.live_session_versions v join public.live_sessions s on s.id=v.session_id where v.organization_id=(ctx->>'organization_id')::uuid and v.actor_id=auth.uid() and v.mutation_id=p_mutation_id and s.location_id=p_location_id;
 if not found then return null;end if;
 if r.input is distinct from p_input or p_session_id is not null and r.session_id<>p_session_id then return app_private.client_error('LIVE_SESSION_CONFLICT',p_correlation_id);end if;return r.payload;end $$;
grant create on schema app_private to elifora_live_writer;
alter function app_private.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) owner to elifora_live_writer;
revoke create on schema app_private from elifora_live_writer;
revoke all on function app_private.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,service_role;
grant execute on function app_private.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;
create function public.live_session_receipt(p_membership_id uuid,p_location_id uuid,p_mutation_id uuid,p_input jsonb,p_session_id uuid,p_correlation_id uuid) returns jsonb language sql volatile security invoker set search_path='' set row_security='on' as $$ select app_private.live_session_receipt(p_membership_id,p_location_id,p_mutation_id,p_input,p_session_id,p_correlation_id); $$;
revoke all on function public.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,service_role;
grant execute on function public.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;
