-- Integer FOR loops declare their own index. Remove the unused/shadowed outer declaration.
-- A bounded complete read in one MVCC snapshot. Existing service projection and caller RLS
-- remain authoritative; no scoring, privileged reads or new tables are introduced.
create or replace function public.hair_confidence_snapshot(
 p_membership_id uuid,p_location_id uuid,p_client_id uuid,
 p_include_archived boolean default false,p_correlation_id uuid default gen_random_uuid())
returns jsonb language plpgsql stable security invoker set search_path='' set row_security='on'
as $$
declare
 v_pages jsonb:='[]'::jsonb; v_result jsonb; v_more boolean;
begin
 if p_correlation_id is null then raise exception using errcode='22023',message='correlation identifier is required'; end if;
 if auth.uid() is null then return app_private.client_error('UNAUTHENTICATED',p_correlation_id); end if;
 if p_include_archived is null then return app_private.client_error('VALIDATION_FAILED',p_correlation_id); end if;
 for v_index in 0..9 loop
  v_result:=public.hair_passport_snapshot(p_membership_id,p_location_id,p_client_id,
   jsonb_build_object('include_archived',p_include_archived,'page_size',100,
    'observations_offset',v_index*100,'tests_offset',v_index*100,'history_offset',v_index*100),p_correlation_id);
  if v_result ? 'code' then return v_result; end if;
  if jsonb_array_length(v_result#>'{data,regions}')>100 then
   return app_private.client_error('CONFIDENCE_INPUT_LIMIT',p_correlation_id);
  end if;
  v_pages:=v_pages||jsonb_build_array(v_result->'data');
  v_more:=(v_result#>>'{data,observations,has_more}')::boolean
   or (v_result#>>'{data,physical_tests,has_more}')::boolean
   or (v_result#>>'{data,history,has_more}')::boolean;
  if not v_more then
   return jsonb_build_object('correlationId',p_correlation_id,'data',
    jsonb_build_object('pages',v_pages,'evaluatedAt',statement_timestamp()));
  end if;
 end loop;
 -- Never silently score a truncated timeline (1000 per kind is an operational bound).
 return app_private.client_error('CONFIDENCE_INPUT_LIMIT',p_correlation_id);
end $$;
revoke all on function public.hair_confidence_snapshot(uuid,uuid,uuid,boolean,uuid) from public,anon,service_role;
grant execute on function public.hair_confidence_snapshot(uuid,uuid,uuid,boolean,uuid) to authenticated;
