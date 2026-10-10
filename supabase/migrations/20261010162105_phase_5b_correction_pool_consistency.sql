-- Material corrections retain the original rational basis in BOTH the cost fact
-- and the running pool. New receipt prices never re-price the corrected history.
do $migration$ declare body text;anchor text;begin
 body:=pg_get_functiondef('app_private.cost_stock_posted()'::regprocedure);
 anchor:='elsif dq<0 and known and before_q>=-dq then vn:=vn*(before_q+dq);vd:=vd*before_q;';
 if position(anchor in body)=0 then raise exception 'Correction pool anchor changed';end if;
 body:=replace(body,anchor,'elsif dq<0 and known and before_q>=-dq and anchor_found and a.status=''KNOWN'' then vn:=vn*a.unit_cost_denominator+dq*a.unit_cost_numerator*vd;vd:=vd*a.unit_cost_denominator;
  elsif dq<0 and anchor_found and a.status<>''KNOWN'' then known:=false;
  '||anchor);
 body:=replace(body,'if after_q=0 then','if vn<0 then vn:=0;vd:=1;known:=false;end if;
  if after_q=0 then');execute body;
end $migration$;
