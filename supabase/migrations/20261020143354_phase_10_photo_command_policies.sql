-- The non-login Live writer inherits authenticated's SQL grants. Restrict each
-- command separately: its internal existence SELECT must never permit DELETE.
drop policy photo_application_boundary on storage.objects;
create policy photo_application_read on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'live-technical' or current_user='elifora_live_writer');
create policy photo_application_insert on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'live-technical');
create policy photo_application_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'live-technical') with check(bucket_id<>'live-technical');
create policy photo_application_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'live-technical');
