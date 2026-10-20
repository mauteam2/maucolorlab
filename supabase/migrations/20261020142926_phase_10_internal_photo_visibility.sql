-- Internal signed Live storage checks run as this non-login SECURITY DEFINER
-- owner. It inherits authenticated for scoped RLS reads, but has SELECT only.
-- Preserve that internal existence check without reopening user Storage APIs.
alter policy photo_application_boundary on storage.objects
using(bucket_id <> 'live-technical' or current_user='elifora_live_writer')
with check(bucket_id <> 'live-technical');
