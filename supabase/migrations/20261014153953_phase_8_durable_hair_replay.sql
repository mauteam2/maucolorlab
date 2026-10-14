-- G1-07: retain every remaining receipt and all future accepted Hair mutations.
-- expires_at is legacy metadata only; it never authorizes deletion or a new fact.
-- Already expired/deleted receipts cannot be reconstructed from historical facts.
do $migration$
declare signature text;definition text;anchor text;
begin
 anchor:='delete from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and expires_at<now();';
 foreach signature in array array[
  'app_private.execute_hair_core_operation(uuid,uuid,uuid,text,jsonb,uuid)',
  'app_private.execute_hair_observation(uuid,uuid,uuid,jsonb,uuid)',
  'app_private.execute_hair_physical_test(uuid,uuid,uuid,jsonb,uuid)',
  'app_private.execute_hair_history(uuid,uuid,uuid,jsonb,uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(anchor in definition)=0 then raise exception 'Hair receipt cleanup anchor absent: %',signature;end if;
  execute replace(definition,anchor,'-- Permanent replay identity; no TTL cleanup.');
 end loop;
end $migration$;

revoke delete on app_private.hair_core_mutation_receipts from elifora_hair_writer;
drop policy hair_core_receipts_expire on app_private.hair_core_mutation_receipts;
comment on column app_private.hair_core_mutation_receipts.expires_at is
 'Legacy timestamp, ignored by replay. Accepted identities and responses are permanent.';

create function app_private.hair_receipt_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 -- Only privileged maintenance may change inert legacy expiry metadata. Normal
 -- roles have no UPDATE grant. Identity, hash and accepted response never change.
 if tg_op='DELETE' or (to_jsonb(new)-'expires_at') is distinct from (to_jsonb(old)-'expires_at') then
  raise exception using errcode='23514',message='IMMUTABLE_HAIR_REPLAY';
 end if;
 return new;
end $$;
revoke all on function app_private.hair_receipt_immutable() from public,anon,authenticated,service_role;
create trigger hair_receipt_immutable before update or delete on app_private.hair_core_mutation_receipts
 for each row execute function app_private.hair_receipt_immutable();
