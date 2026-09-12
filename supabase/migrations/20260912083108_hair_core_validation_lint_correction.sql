-- Explicit JSONB initialization and volatility matching PostgreSQL jsonb_build_object.
create or replace function app_private.hair_core_patch(p_patch jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare k text; v jsonb; s text; flattened jsonb:='{}'::jsonb;
begin
 if jsonb_typeof(p_patch) is distinct from 'object' then
  raise exception using errcode='23514',message='invalid technical state';
 end if;
 for k,v in select key,value from jsonb_each(p_patch) loop
  if k in ('technical_notes','integrity_notes') then
   if jsonb_typeof(v) not in ('string','null') or
    (jsonb_typeof(v)='string' and (char_length(v#>>'{}')>case k when 'technical_notes' then 4000 else 2000 end or trim(v#>>'{}')='')) then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   flattened:=flattened||jsonb_build_object(k,v);
  else
   if k not in ('natural_level','perceived_level','grey_ratio','thickness','density','porosity','elasticity','tone','cosmetic_color_history','bleach_history','chemical_history') or jsonb_typeof(v) is distinct from 'object' then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   if not (v ?& array['state','value']) or exists(select 1 from jsonb_object_keys(v) x where x not in ('state','value')) then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   s:=v->>'state';
   if s is null or s not in ('KNOWN','UNKNOWN','NOT_ASSESSED','NOT_APPLICABLE') or
    (s='NOT_APPLICABLE' and k in ('natural_level','perceived_level')) or
    (s<>'KNOWN' and v->'value'<>'null'::jsonb) or
    (s='KNOWN' and jsonb_typeof(v->'value') is distinct from
     case when k in ('natural_level','perceived_level','grey_ratio') then 'number' else 'string' end) then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   if s='KNOWN' then
    if (k in ('natural_level','perceived_level') and (v->>'value')::numeric not between 1 and 10)
     or (k='grey_ratio' and (v->>'value')::numeric not between 0 and 1)
     or (k='thickness' and v->>'value' not in ('FINE','MEDIUM','COARSE'))
     or (k in ('density','porosity') and v->>'value' not in ('LOW','MEDIUM','HIGH'))
     or (k='elasticity' and v->>'value' not in ('LOW','NORMAL','HIGH')) then
     raise exception using errcode='23514',message='invalid technical state';
    end if;
    if k in ('tone','cosmetic_color_history','bleach_history','chemical_history') and
     (trim(v->>'value')='' or char_length(v->>'value')>case k when 'tone' then 120 else 2000 end) then
     raise exception using errcode='23514',message='invalid technical state';
    end if;
   end if;
   flattened:=flattened||jsonb_build_object(k||'_state',s,k,v->'value');
  end if;
 end loop;
 return flattened;
end $$;
revoke all on function app_private.hair_core_patch(jsonb) from public,anon,authenticated;
grant execute on function app_private.hair_core_patch(jsonb) to elifora_hair_writer;
