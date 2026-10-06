-- Scope operational projections through the accessible parent service.
do $$ declare t text;begin
 foreach t in array array['salon_service_staff','salon_service_capabilities','salon_service_requirements'] loop
  execute format('drop policy salon_read on public.%I',t);
  execute format('drop policy salon_write on public.%I',t);
  execute format('create policy salon_read on public.%I for select to authenticated using(exists(select 1 from public.salon_services s where s.id=service_id and s.organization_id=%I.organization_id))',t,t);
  execute format('create policy salon_write on public.%I for all to elifora_salon_writer using(exists(select 1 from public.salon_services s where s.id=service_id and s.organization_id=%I.organization_id)) with check(exists(select 1 from public.salon_services s where s.id=service_id and s.organization_id=%I.organization_id))',t,t,t);
 end loop;
end $$;
drop policy salon_profile_directory on public.profiles;
create policy salon_profile_directory on public.profiles for select to elifora_salon_writer
 using(exists(select 1 from public.salon_memberships m where m.user_id=profiles.user_id and m.status='active' and app_private.can_access_clients(m.organization_id,'salon.read')));
-- Relational membership ownership is explicit even in controlled writer tables.
alter table public.salon_memberships add constraint salon_membership_org_identity unique(organization_id,id);
alter table public.salon_staff add constraint salon_staff_owned_membership foreign key(organization_id,membership_id) references public.salon_memberships(organization_id,id);
alter table public.salon_service_staff add constraint salon_eligible_owned_membership foreign key(organization_id,membership_id) references public.salon_memberships(organization_id,id);
create index salon_staff_member_org on public.salon_staff(organization_id,membership_id);
create index salon_service_eligible_member_org on public.salon_service_staff(organization_id,membership_id);
create index salon_availability_all_parent on public.salon_availability(organization_id,location_id,membership_id);
