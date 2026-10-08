-- Content mutation must enter the same series barrier before a release row.
-- Published content remains immutable; a compatibility change needs a new version.
do $$declare d text;n text;begin
 d:=pg_get_functiondef('app_private.catalog_content_guard()'::regprocedure);
 n:='select * into c from public.brand_catalog_releases where id=(v->>''catalog_id'')::uuid for update;';
 if position(n in d)=0 then raise exception 'catalog content guard definition mismatch';end if;
 d:=replace(d,n,'perform app_private.lock_brand_catalog((v->>''catalog_id'')::uuid); '||n);
 execute d;
end $$;

-- Resolve revoked membership again after a potentially blocking tenant lock.
do $$declare d text;n text;begin
 d:=pg_get_functiondef('app_private.store_live_session(uuid,uuid,text,text,uuid)'::regprocedure);
 n:='perform pg_advisory_xact_lock(hashtextextended(org::text,0));';
 if position(n in d)=0 then raise exception 'live context lock definition mismatch';end if;
 execute replace(d,n,n||' ctx:=app_private.hair_write_context(p_membership,p_location,app_private.live_permission(t));if ctx ? ''code'' then return ctx;end if;');
 d:=pg_get_functiondef('app_private.store_controlled_recipe(uuid,uuid,text,text,uuid)'::regprocedure);
 n:='perform pg_advisory_xact_lock(hashtextextended(ctx->>''organization_id'',0));';
 if position(n in d)=0 then raise exception 'controlled context lock definition mismatch';end if;
 execute replace(d,n,n||' ctx:=app_private.hair_write_context(p_membership,p_location,''color_plan.create'');if ctx ? ''code'' then return ctx;end if;');
end $$;

-- Pending application requires the current tip of the immutable recipe lineage.
-- Revision must explicitly supersede the session's current recipe.
do $$declare d text;n text;begin
 d:=pg_get_functiondef('app_private.store_live_session(uuid,uuid,text,text,uuid)'::regprocedure);
 n:='if not found or rec.location_id<>p_location or rec.created_at<statement_timestamp()-interval ''24 hours'' then';
 if position(n in d)=0 then raise exception 'live recipe lineage definition mismatch';end if;
 d:=replace(d,n,'if not found or rec.location_id<>p_location or rec.created_at<statement_timestamp()-interval ''24 hours'' or exists(select 1 from public.controlled_brand_recipes newer where newer.series_id=rec.series_id and newer.version>rec.version) or t=''RECIPE_REVISION'' and rec.supersedes_id is distinct from old.current_recipe_id then');
 execute d;
end $$;
