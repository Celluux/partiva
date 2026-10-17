-- Additive legacy migration support; existing pieces and their identities remain untouched.
begin;
alter table public.parts add column year_compatibility text not null default '';
alter table public.parts add column fee_percent_override numeric(5,2) check(fee_percent_override between 0 and 100);
alter table public.parts add column fee_fixed_cents_override integer check(fee_fixed_cents_override>=0);
alter table public.parts add column other_cost_cents integer not null default 0 check(other_cost_cents>=0);
alter table public.parts add column price_is_suggested boolean not null default false;
alter table public.parts add column legacy_origin_stage text not null default '';
alter table public.parts add column legacy_import_hash text;
alter table public.parts add column legacy_hold boolean not null default false;
alter table public.parts add column legacy_is_draft boolean not null default false;
alter table public.parts add column legacy_issues jsonb not null default '[]';
alter table public.parts add column legacy_created_at timestamptz;
alter table public.parts add column legacy_updated_at timestamptz;
alter table public.parts drop constraint parts_listing_status_check;
alter table public.parts add constraint parts_listing_status_check check(listing_status in ('not_applicable','draft','review','ready','published','paused','legacy_published'));
alter table public.part_sales drop constraint part_sales_channel_check;
alter table public.part_sales add constraint part_sales_channel_check check(channel in ('local','online','legacy'));
alter table public.part_photos add column legacy_photo_key text unique;
alter table public.part_photos add column legacy_photo_metadata jsonb not null default '{}';
create table public.legacy_import_batches(
 source_key text primary key,workspace_id uuid not null references public.workspaces(id),manifest_hash text not null,
 manifest jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table public.legacy_drafts(
 id uuid primary key default gen_random_uuid(),source_key text not null unique,
 workspace_id uuid not null references public.workspaces(id),part_id uuid references public.parts(id),
 resolution text not null check(resolution in ('same_id','new_piece','pending','empty')),
 candidate_sources jsonb not null default '[]',original_payload jsonb not null,content_hash text not null,
 created_at timestamptz not null default now()
);
alter table public.legacy_import_batches enable row level security;
alter table public.legacy_drafts enable row level security;
revoke all on public.legacy_import_batches,public.legacy_drafts from anon,authenticated;
grant select on public.legacy_import_batches,public.legacy_drafts to authenticated;
grant all on public.legacy_import_batches,public.legacy_drafts to service_role;
create policy legacy_batches_read on public.legacy_import_batches for select to authenticated using(partiva_private.member(workspace_id));
create policy legacy_drafts_read on public.legacy_drafts for select to authenticated using(partiva_private.member(workspace_id));
create index legacy_drafts_part on public.legacy_drafts(part_id);
create index legacy_drafts_company on public.legacy_drafts(workspace_id);

-- Keep guarded core functions private, so clients cannot bypass the adapters.
do $$ declare def text; begin
 def=pg_get_functiondef('partiva_private.save_part(jsonb,integer)'::regprocedure);
 execute replace(def,'FUNCTION partiva_private.save_part(','FUNCTION partiva_private.save_part_core(');
 def=pg_get_functiondef('partiva_private.sale_action(uuid,text,jsonb)'::regprocedure);
 execute replace(def,'FUNCTION partiva_private.sale_action(','FUNCTION partiva_private.sale_action_core(');
end $$;
revoke all on function partiva_private.save_part_core(jsonb,integer),partiva_private.sale_action_core(uuid,text,jsonb) from public,anon,authenticated;
create or replace function partiva_private.save_part(payload jsonb,expected_version integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; p uuid;
begin
 result=partiva_private.save_part_core(payload-array['year_compatibility','fee_percent_override','fee_fixed_cents_override','other_cost_cents','price_is_suggested'],expected_version);
 p=(result->'part'->>'id')::uuid;
 if length(coalesce(payload->>'year_compatibility',''))>250 then raise exception 'Compatibilidade muito longa'; end if;
 update public.parts set year_compatibility=case when payload?'year_compatibility' then coalesce(payload->>'year_compatibility','') else year_compatibility end,
 fee_percent_override=case when payload?'fee_percent_override' then (payload->>'fee_percent_override')::numeric else fee_percent_override end,
 fee_fixed_cents_override=case when payload?'fee_fixed_cents_override' then (payload->>'fee_fixed_cents_override')::integer else fee_fixed_cents_override end,
 other_cost_cents=coalesce((payload->>'other_cost_cents')::integer,other_cost_cents),
 price_is_suggested=coalesce((payload->>'price_is_suggested')::boolean,price_is_suggested) where id=p;
 if payload ?| array['year_compatibility','fee_percent_override','fee_fixed_cents_override','other_cost_cents','price_is_suggested'] then perform partiva_private.event(p,'commercial_details_updated',payload-array['legacy_payload']); end if;
 return jsonb_set(result,'{part}',(select to_jsonb(x) from public.parts x where id=p));
end $$;
create or replace function partiva_private.sale_action(pid uuid,command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not partiva_private.can('sales') then raise exception 'Sem permissão para vendas' using errcode='42501'; end if;
 if command in ('reserve','sell_local','sell_online') and exists(select 1 from public.parts where id=pid and legacy_hold) then raise exception 'Peça em repouso no histórico; um administrador deve liberar sua disponibilidade'; end if;
 return partiva_private.sale_action_core(pid,command,payload);
end $$;
create or replace function partiva_private.readiness(p uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.parts; w public.workspaces; missing jsonb='[]'; minimum integer;
begin
 select * into r from public.parts where id=p;select * into w from public.workspaces where id=r.workspace_id;
 minimum=coalesce((w.preferences->>'minimum_photos')::integer,2);
 if btrim(r.part_name)='' then missing=missing||'"Nome da peça"'::jsonb;end if;
 if btrim(coalesce(r.detran_reference,''))='' or lower(btrim(r.detran_reference))='sem info' then missing=missing||'"Número do Detran"'::jsonb;end if;
 if btrim(coalesce(r.category,''))='' then missing=missing||'"Categoria"'::jsonb;end if;
 if btrim(r.brand)='' then missing=missing||'"Marca"'::jsonb;end if;
 if btrim(r.model)='' then missing=missing||'"Modelo"'::jsonb;end if;
 if r.year is null and btrim(r.year_compatibility)='' then missing=missing||'"Ano"'::jsonb;end if;
 if partiva_private.needs_position(r.part_name) and r.position='' then missing=missing||'"Posição"'::jsonb;end if;
 if partiva_private.needs_side(r.part_name) and r.side='' then missing=missing||'"Lado"'::jsonb;end if;
 if btrim(r.title)='' then missing=missing||'"Título do anúncio"'::jsonb;end if;
 if r.price_cents is null or r.price_cents<=0 then missing=missing||'"Preço válido"'::jsonb;end if;
 if r.price_is_suggested then missing=missing||'"Conferir preço sugerido do sistema antigo"'::jsonb;end if;
 if r.fee_percent_override is null and not w.fee_configured then missing=missing||'"Configuração da taxa estimada"'::jsonb;end if;
 if (select count(distinct coalesce(original_photo_id,id)) from public.part_photos where part_id=p and archived_at is null and selected_for_listing)<minimum then missing=missing||jsonb_build_array('Selecionar ao menos '||minimum||' fotografias para anúncio');end if;
 return missing;
end $$;
create function partiva_private.release_legacy_hold(pid uuid,expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.parts;
begin
 if not partiva_private.can('admin') then raise exception 'Somente administradores podem liberar o repouso' using errcode='42501';end if;
 select * into r from public.parts where id=pid and workspace_id=partiva_private.company() for update;
 if not found or r.version is distinct from expected_version then raise exception 'Cadastro alterado; atualize' using errcode='PT409';end if;
 update public.parts set legacy_hold=false,version=version+1,updated_at=now() where id=pid returning * into r;
 perform partiva_private.event(pid,'legacy_hold_released');return to_jsonb(r);
end $$;
create function public.release_legacy_hold(pid uuid,expected_version integer) returns jsonb language sql security invoker set search_path='' as $$select partiva_private.release_legacy_hold(pid,expected_version);$$;
revoke all on function public.release_legacy_hold(uuid,integer),partiva_private.release_legacy_hold(uuid,integer) from public,anon;
grant execute on function partiva_private.release_legacy_hold(uuid,integer) to authenticated;
grant execute on function public.release_legacy_hold(uuid,integer) to authenticated;

create function partiva_private.import_desmonte(command text,payload jsonb,actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid=partiva_private.company(); source text; fingerprint text; p public.parts; document jsonb; result jsonb;
 old_sub text=current_setting('request.jwt.claim.sub',true); col uuid; role_name text; draft_flag boolean; photo public.part_photos; d public.legacy_drafts; b public.legacy_import_batches;
begin
 if not exists(select 1 from public.workspace_members where user_id=actor and workspace_id=w and active and role in ('owner','admin','manager')) then raise exception 'Administrador importador não autorizado';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if pg_column_size(payload)>1048576 then raise exception 'Pacote muito grande';end if;
 if command='batch' then
  source=payload->>'source_key';if source<>'desmonte:pecaflux-local' then raise exception 'Origem inválida';end if;
  select * into b from public.legacy_import_batches where source_key=source;
  if found then if b.manifest_hash<>payload->>'manifest_hash' then raise exception 'Manifesto da origem mudou: revisão necessária' using errcode='PT409';end if;
  else insert into public.legacy_import_batches(source_key,workspace_id,manifest_hash,manifest,created_by) values(source,w,payload->>'manifest_hash',payload->'manifest',actor);end if;
  result=jsonb_build_object('ok',true);
 else
  if not exists(select 1 from public.legacy_import_batches where source_key='desmonte:pecaflux-local' and workspace_id=w) then raise exception 'Registre antes o manifesto e backup';end if;
  if command='piece' then
   source=payload->'part'->>'legacy_source';
   if source is null or source not like 'desmonte:pecaflux-local:piece-%' then raise exception 'Referência de origem inválida';end if;
   fingerprint=encode(sha256(convert_to((payload->'part'->'legacy_payload')::text,'UTF8')),'hex');
   perform pg_advisory_xact_lock(hashtextextended(source,0));
   select * into p from public.parts where workspace_id=w and legacy_source=source;
   if found then
    if p.legacy_import_hash is distinct from fingerprint then raise exception 'Conteúdo da origem mudou; preserve e revise: %',source using errcode='PT409';end if;
    result=jsonb_build_object('part',to_jsonb(p),'reused',true);
   else
    document=payload->'part';if document ?| array['id','internal_code','internal_number'] then raise exception 'Identidade é gerada pelo banco';end if;
    result=partiva_private.save_part(document,null);p=jsonb_populate_record(null::public.parts,result->'part');
    role_name=coalesce(payload->'meta'->>'role','pending');draft_flag=coalesce((payload->'meta'->>'is_draft')::boolean,false);
    col=null;
    if not draft_flag and role_name in ('published','sold','standby','editing-photos') then
     select id into col from public.board_columns where workspace_id=w and name=case role_name when 'published' then 'Anunciadas (legado)' when 'sold' then 'Vendidas (legado)' when 'standby' then 'Em repouso (legado)' else 'Editar fotos (legado)' end;
     if col is null then
      insert into public.board_columns(workspace_id,name,position,color,phase)
      values(w,case role_name when 'published' then 'Anunciadas (legado)' when 'sold' then 'Vendidas (legado)' when 'standby' then 'Em repouso (legado)' else 'Editar fotos (legado)' end,
      (select coalesce(max(position),0)+1 from public.board_columns where workspace_id=w),'#64777c',case when role_name='editing-photos' then 'photos_pending' else 'registration' end) returning id into col;
     end if;
    else select id into col from public.board_columns where workspace_id=w and phase=case when role_name='incomplete' and not draft_flag then 'photos_pending' else 'registration' end order by position limit 1;end if;
    update public.parts set column_id=coalesce(col,column_id),legacy_import_hash=fingerprint,legacy_origin_stage=role_name,legacy_is_draft=draft_flag,
      year_compatibility=coalesce(document->'legacy_payload'->'piece'->>'year',''),
      fee_percent_override=(document->'legacy_payload'->'piece'->>'feePercent')::numeric,
      fee_fixed_cents_override=round(coalesce((document->'legacy_payload'->'piece'->>'fixedFee')::numeric,0)*100)::integer,
      other_cost_cents=round(coalesce((document->'legacy_payload'->'piece'->>'otherCost')::numeric,0)*100)::integer,
      price_is_suggested=coalesce((document->'legacy_payload'->'piece'->>'priceIsSuggested')::boolean,false),
      legacy_hold=role_name='standby' and not draft_flag,legacy_issues=coalesce(payload->'meta'->'issues','[]'),
      legacy_created_at=to_timestamp((document->'legacy_payload'->'piece'->>'createdAt')::double precision/1000),
      legacy_updated_at=to_timestamp((document->'legacy_payload'->'piece'->>'updatedAt')::double precision/1000),
      listing_status=case when role_name='published' and not draft_flag then 'legacy_published' else 'draft' end,
      sale_status=case when role_name='sold' and not draft_flag then 'sold' else 'available' end
      where id=p.id returning * into p;
    if p.sale_status='sold' then
     insert into public.part_sales(request_id,workspace_id,part_id,status,channel,amount_cents,note,created_by)
     values(p.id,w,p.id,'sold','legacy',null,'Venda informada no sistema antigo; valor e data efetivos não comprovados. Referência: '||source,actor);
    end if;
    perform partiva_private.event(p.id,'legacy_imported',jsonb_build_object('source',source,'historical_stage',role_name,'original_dates_preserved',true));
    result=jsonb_build_object('part',to_jsonb(p),'reused',false);
   end if;
  elsif command='draft' then
   source=payload->>'source_key';if source not like 'desmonte:pecaflux-local:draft:%' then raise exception 'Origem de rascunho inválida';end if;
   fingerprint=encode(sha256(convert_to((payload->'original_payload')::text,'UTF8')),'hex');
   perform pg_advisory_xact_lock(hashtextextended(source,0));select * into d from public.legacy_drafts where source_key=source;
   if found then if d.content_hash<>fingerprint then raise exception 'Rascunho de origem mudou' using errcode='PT409';end if;result=jsonb_build_object('id',d.id,'reused',true);
   else
    select * into p from public.parts where workspace_id=w and legacy_source=payload->>'part_source';
    if payload->>'part_source' is not null and p.id is null then raise exception 'Peça do rascunho não encontrada';end if;
    insert into public.legacy_drafts(source_key,workspace_id,part_id,resolution,candidate_sources,original_payload,content_hash)
    values(source,w,p.id,payload->>'resolution',coalesce(payload->'candidate_sources','[]'),payload->'original_payload',fingerprint) returning * into d;
    result=jsonb_build_object('id',d.id,'reused',false);
   end if;
  elsif command='photo' then
   source=payload->>'source_key';if source not like 'desmonte:pecaflux-local:photo:%' then raise exception 'Origem de fotografia inválida';end if;
   perform pg_advisory_xact_lock(hashtextextended(source,0));select * into photo from public.part_photos where legacy_photo_key=source;
   if found then
    if photo.legacy_photo_metadata->>'sha256' is distinct from payload->'metadata'->>'sha256' then raise exception 'Fotografia de origem mudou' using errcode='PT409';end if;
    result=jsonb_build_object('id',photo.id,'reused',true);
   else
    select * into p from public.parts where workspace_id=w and legacy_source=payload->>'part_source';if not found then raise exception 'Peça da fotografia não encontrada';end if;
    perform partiva_private.photo_action(p.id,'register',payload->'photo');
    update public.part_photos set legacy_photo_key=source,legacy_photo_metadata=payload->'metadata',
      selected_for_listing=not coalesce((payload->'metadata'->>'draft_pending')::boolean,false)
      where id=(payload->'photo'->>'id')::uuid returning * into photo;
    result=jsonb_build_object('id',photo.id,'reused',false);
   end if;
  else raise exception 'Comando de importação inválido';end if;
 end if;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);return result;
end $$;
create function public.import_desmonte(command text,payload jsonb,actor uuid) returns jsonb language sql security invoker set search_path='' as $$select partiva_private.import_desmonte(command,payload,actor);$$;
revoke all on function public.import_desmonte(text,jsonb,uuid),partiva_private.import_desmonte(text,jsonb,uuid) from public,anon,authenticated;
grant usage on schema partiva_private to service_role;
grant execute on function public.import_desmonte(text,jsonb,uuid),partiva_private.import_desmonte(text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
