-- Rebuild can capture tens of thousands of IDs. Joining the captured set avoids
-- repeatedly testing a large parameter array for each queue row. Only IDs that
-- were actually visible at capture are removed; late commits still survive.
do $migration$ declare body text;anchor text;begin
 body:=pg_get_functiondef('app_private.report_refresh(uuid,uuid,boolean)'::regprocedure);
 anchor:='delete from app_private.report_invalidations where id=any(captured) and organization_id=org and location_id=loc;';
 if position(anchor in body)=0 then raise exception 'report queue cleanup anchor missing';end if;
 body:=replace(body,anchor,'delete from app_private.report_invalidations q using unnest(captured) visible(id)
  where q.id=visible.id and q.organization_id=org and q.location_id=loc;');
 execute body;
end $migration$;
