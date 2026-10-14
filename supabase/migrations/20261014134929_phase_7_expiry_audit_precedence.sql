-- Audit the same deadline that resolves the authoritative current state.
-- An overall subscription end takes precedence over trial/grace deadlines.
do $migration$ declare body text;old text;replacement text;begin
 body:=pg_get_functiondef('app_private.saas_observe_expiry(uuid)'::regprocedure);
 old:=$anchor$ if s.status='TRIAL' and s.trial_end<=statement_timestamp() then kind:='TRIAL_ENDED';deadline:=s.trial_end;
 elsif s.status='PAST_DUE' and s.grace_end<=statement_timestamp() then kind:='GRACE_ENDED';deadline:=s.grace_end;
 elsif s.effective_until<=statement_timestamp() then kind:='SUBSCRIPTION_ENDED';deadline:=s.effective_until;$anchor$;
 replacement:=$anchor$ if s.effective_until<=statement_timestamp() then kind:='SUBSCRIPTION_ENDED';deadline:=s.effective_until;
 elsif s.status='TRIAL' and s.trial_end<=statement_timestamp() then kind:='TRIAL_ENDED';deadline:=s.trial_end;
 elsif s.status='PAST_DUE' and s.grace_end<=statement_timestamp() then kind:='GRACE_ENDED';deadline:=s.grace_end;$anchor$;
 if position(old in body)=0 then raise exception 'Expiry observation anchor absent';end if;
 execute replace(body,old,replacement);
end $migration$;
