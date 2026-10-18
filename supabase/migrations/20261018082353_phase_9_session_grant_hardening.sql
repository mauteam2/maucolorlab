-- PostgREST checks provider-authoritative session existence on every Data API
-- request. Signature validity alone must not keep a globally signed-out JWT alive.
create function app_private.session_is_current() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=auth.jwt();sid uuid;
begin
 -- Non-JWT SQL migration/pgTAP contexts do not represent provider sessions.
 -- Every real authenticated Auth JWT contains its provider-assigned role.
 if claims->>'role' is distinct from 'authenticated' then return true;end if;
 begin sid:=(claims->>'session_id')::uuid;exception when invalid_text_representation then sid:=null;end;
 return auth.uid() is not null and sid is not null and exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>statement_timestamp()));
end $$;
revoke all on function app_private.session_is_current() from public,anon,service_role;
grant execute on function app_private.session_is_current() to authenticated;
create function app_private.require_active_session() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.session_is_current() then raise sqlstate 'PT401' using message='SESSION_EXPIRED';end if;
end $$;
revoke all on function app_private.require_active_session() from public,anon,service_role;
grant execute on function app_private.require_active_session() to authenticated,anon,service_role;
alter role authenticator set pgrst.db_pre_request='app_private.require_active_session';
notify pgrst,'reload config';
-- Storage does not execute PostgREST's pre-request hook. Restrict every existing
-- object policy with the same authoritative session predicate instead.
create policy phase_9_active_storage_session on storage.objects as restrictive for all to authenticated
using(app_private.session_is_current()) with check(app_private.session_is_current());

-- No application function obtains EXECUTE via PostgreSQL's implicit PUBLIC ACL.
-- Existing explicit authenticated/writer/operator grants are preserved.
alter table app_private.color_engine_keys enable row level security;
alter table app_private.catalog_operators enable row level security;
revoke create on schema public from public,anon,authenticated,service_role;
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') loop
  execute format('revoke execute on function %s from public,service_role',f.signature);
 end loop;
end $$;
alter default privileges for role postgres in schema public,app_private revoke execute on functions from public;

-- The pre-request hook is the sole service-role function exception; it is a no-op
-- for provider/server identities and grants no business access.
grant execute on function app_private.require_active_session() to service_role;
