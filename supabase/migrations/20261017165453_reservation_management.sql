-- Add reservation details without replacing historical commercial records.
alter table public.part_sales add column reservation jsonb;
alter table public.part_sales add constraint reservation_object check (reservation is null or jsonb_typeof(reservation)='object');
update public.part_sales s set reservation='{}'::jsonb where s.status='reserved' or exists(select 1 from public.part_events e where e.part_id=s.part_id and e.event_type='reserve' and e.metadata->>'id'=s.id::text);
create or replace function partiva_private.sale_action(pid uuid,command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.parts; s public.part_sales; result jsonb; request uuid=(payload->>'request_id')::uuid;
begin
 if not partiva_private.can('sales') then raise exception 'Sem permissão para vendas' using errcode='42501'; end if;
 select * into r from public.parts where id=pid and workspace_id=partiva_private.company() and archived_at is null for update;
 if not found then raise exception 'Peça não encontrada'; end if;
 if command in ('reserve','sell_local','sell_online') and r.legacy_hold then raise exception 'Peça em repouso no histórico; um administrador deve liberar sua disponibilidade'; end if;
 if request is null then raise exception 'Identificador da operação obrigatório'; end if;
 if length(coalesce(payload->>'customer',''))>200 or length(coalesce(payload->>'note',''))>1000 then raise exception 'Dados da reserva muito longos'; end if;
 select * into s from public.part_sales where part_id=pid and status='reserved' for update;
 if s.id is not null and command in ('edit_reservation','sell_local','sell_online','release') and s.created_by is distinct from auth.uid() and not partiva_private.can('admin') then
   raise exception 'Somente o funcionário responsável ou um administrador pode alterar ou concluir esta reserva' using errcode='42501';
 end if;
 if command='edit_reservation' then
   if exists(select 1 from public.part_events where part_id=pid and event_type='reservation_updated' and metadata->>'request_id'=request::text) then return to_jsonb(s); end if;
   if s.id is null then raise exception 'Reserva ativa não encontrada'; end if;
   if (payload->>'version')::integer is distinct from r.version then raise exception 'Reserva alterada. Atualize os dados.' using errcode='PT409'; end if;
   update public.part_sales set reservation=coalesce(reservation,'{}')||jsonb_build_object('customer',btrim(coalesce(payload->>'customer',''))),note=coalesce(payload->>'note',''),updated_at=now() where id=s.id returning * into s;
   update public.parts set version=version+1,updated_at=now() where id=pid;
   perform partiva_private.event(pid,'reservation_updated',to_jsonb(s)||jsonb_build_object('request_id',request));
   return to_jsonb(s);
 end if;
 result=partiva_private.sale_action_core(pid,command,payload);
 if command='reserve' then
   update public.part_sales set reservation=coalesce(reservation,jsonb_build_object('customer',btrim(coalesce(payload->>'customer','')))) where id=(result->>'id')::uuid returning to_jsonb(part_sales.*) into result;
 end if;
 return result;
end $$;
notify pgrst,'reload schema';
