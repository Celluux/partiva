-- Additive operational upgrade. Existing pieces, files, events and legacy codes stay intact.
begin;
create schema if not exists partiva_private;
revoke all on schema partiva_private from public, anon;
grant usage on schema partiva_private to authenticated;
alter default privileges in schema partiva_private revoke execute on functions from public;

alter table public.workspaces add column if not exists legal_name text not null default '';
alter table public.workspaces add column if not exists trade_name text not null default '';
alter table public.workspaces add column if not exists tax_id text not null default '';
alter table public.workspaces add column if not exists phone text not null default '';
alter table public.workspaces add column if not exists email text not null default '';
alter table public.workspaces add column if not exists address jsonb not null default '{}';
alter table public.workspaces add column if not exists logo_path text;
alter table public.workspaces add column if not exists fee_percent numeric(5,2) not null default 0 check(fee_percent between 0 and 100);
alter table public.workspaces add column if not exists fee_fixed_cents integer not null default 0 check(fee_fixed_cents >= 0);
alter table public.workspaces add column if not exists fee_configured boolean not null default false;
alter table public.workspaces add column if not exists preferences jsonb not null default '{"minimum_photos":2,"default_brand":"","default_model":""}';
alter table public.workspaces add column if not exists version integer not null default 1;
create table if not exists public.app_configuration (
  singleton boolean primary key default true check(singleton),
  workspace_id uuid not null references public.workspaces(id)
);
insert into public.app_configuration(singleton, workspace_id)
select true, id from public.workspaces order by created_at, id limit 1
on conflict (singleton) do nothing;
alter table public.workspace_members add column if not exists active boolean not null default true;
alter table public.workspace_members add column if not exists display_name text not null default '';
alter table public.workspace_members add column if not exists email text not null default '';
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check(role in ('owner','admin','manager','operator','photographer','sales','viewer'));

create or replace function partiva_private.company() returns uuid language sql stable security definer set search_path='' as $$
  select workspace_id from public.app_configuration where singleton;
$$;
create or replace function partiva_private.member(w uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and w=partiva_private.company() and exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=auth.uid() and m.active);
$$;
create or replace function partiva_private.can(action text) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.workspace_members m where m.user_id=auth.uid() and m.workspace_id=partiva_private.company() and m.active
    and (m.role in ('owner','admin','manager') or
      (m.role='operator' and action in ('parts','photos','columns')) or
      (m.role='photographer' and action='photos') or
      (m.role='sales' and action in ('sales','parts')) or action='read')
  );
$$;
grant execute on function partiva_private.company(), partiva_private.member(uuid), partiva_private.can(text) to authenticated;

alter table public.board_columns add column if not exists phase text not null default 'registration' check(phase in ('registration','photos_pending','photos_edited','listing','publication'));
alter table public.board_columns add column if not exists version integer not null default 1;
insert into public.board_columns(workspace_id,name,position,color,phase)
select partiva_private.company(), v.name, v.position, v.color, v.phase from (values
 ('Cadastro',0,'#0e6b6e','registration'),('Fotografias pendentes',1,'#d89a4b','photos_pending'),
 ('Fotografias editadas',2,'#8ec1c1','photos_edited'),('Preparação do anúncio',3,'#64777c','listing'),('Publicação',4,'#3b9a78','publication')
) as v(name,position,color,phase) where not exists(select 1 from public.board_columns where workspace_id=partiva_private.company());

alter table public.parts add column if not exists internal_number bigint;
alter table public.parts add column if not exists complementary_code text not null default '';
alter table public.parts add column if not exists part_name text not null default '';
alter table public.parts add column if not exists brand text not null default '';
alter table public.parts add column if not exists model text not null default '';
alter table public.parts add column if not exists year integer check(year between 1900 and 2200);
alter table public.parts add column if not exists engine text not null default '';
alter table public.parts add column if not exists position text not null default '';
alter table public.parts add column if not exists side text not null default '';
alter table public.parts add column if not exists color text not null default '';
alter table public.parts add column if not exists title_manual boolean not null default false;
alter table public.parts add column if not exists version integer not null default 1;
alter table public.parts add column if not exists archived_at timestamptz;
alter table public.parts add column if not exists legacy_source text;
alter table public.parts add column if not exists legacy_payload jsonb;
alter table public.parts alter column title set default '';
alter table public.parts drop constraint if exists parts_operational_status_check;
alter table public.parts add constraint parts_operational_status_check check(operational_status in ('entry','dismantling','preparing','ready','registration','photos_pending','photos_edited','listing','publication'));
alter table public.parts drop constraint if exists parts_listing_status_check;
alter table public.parts add constraint parts_listing_status_check check(listing_status in ('not_applicable','draft','review','ready','published','paused'));
update public.parts set part_name=title where part_name='';
update public.parts p set column_id=(select id from public.board_columns c where c.workspace_id=p.workspace_id order by position,id limit 1) where column_id is null;

create table partiva_private.identifiers (
  number bigint generated always as identity (maxvalue 9007199254740991 no cycle) primary key,
  part_id uuid not null unique,
  issued_at timestamptz not null default now()
);
insert into partiva_private.identifiers(part_id) select id from public.parts order by created_at,id;
update public.parts p set internal_number=i.number from partiva_private.identifiers i where i.part_id=p.id;
alter table public.parts alter column internal_number set not null;
alter table public.parts add constraint parts_internal_number_key unique(internal_number);
create unique index parts_legacy_source_key on public.parts(workspace_id,legacy_source) where legacy_source is not null;
create index parts_detran_idx on public.parts(workspace_id, detran_reference) where archived_at is null;
create index parts_active_idx on public.parts(workspace_id, updated_at desc) where archived_at is null;

create or replace function partiva_private.protect_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.internal_number is not null then raise exception 'Identificador interno é gerado pelo banco'; end if;
    insert into partiva_private.identifiers(part_id) values(new.id) returning number into new.internal_number;
    if new.internal_code is null then new.internal_code=new.internal_number::text; end if;
  elsif tg_op='DELETE' then raise exception 'Use a exclusão controlada; a identidade deve ser preservada';
  elsif new.id<>old.id or new.internal_number<>old.internal_number or new.internal_code<>old.internal_code or new.workspace_id<>old.workspace_id or new.created_by is distinct from old.created_by then
    raise exception 'Identidade permanente: alteração não permitida';
  end if;
  if new.column_id is not null and not exists(select 1 from public.board_columns c where c.id=new.column_id and c.workspace_id=new.workspace_id) then raise exception 'Etapa inválida para esta empresa'; end if;
  if new.column_id is not null then select phase into new.operational_status from public.board_columns where id=new.column_id; end if;
  return new;
end $$;
create trigger protect_part_identity before insert or update or delete on public.parts for each row execute function partiva_private.protect_identity();

alter table public.part_photos add column if not exists original_photo_id uuid references public.part_photos(id);
alter table public.part_photos add column if not exists kind text not null default 'original' check(kind in ('original','edited'));
alter table public.part_photos add column if not exists is_cover boolean not null default false;
alter table public.part_photos add column if not exists selected_for_listing boolean not null default true;
alter table public.part_photos add column if not exists mime_type text not null default 'image/jpeg';
alter table public.part_photos add column if not exists size_bytes bigint not null default 0;
alter table public.part_photos add column if not exists archived_at timestamptz;
alter table public.part_photos add column if not exists created_by uuid references auth.users(id);
create unique index photo_one_cover on public.part_photos(part_id) where is_cover and archived_at is null;
create unique index photo_path_unique on public.part_photos(storage_path);
create index photo_active_part on public.part_photos(part_id,sort_order) where archived_at is null;
alter table public.part_events add column if not exists actor_name text not null default '';
alter table public.part_events add column if not exists metadata jsonb not null default '{}';

create table public.company_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  event_type text not null, actor_id uuid references auth.users(id), actor_name text not null default '',
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.part_sales (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  workspace_id uuid not null references public.workspaces(id), part_id uuid not null references public.parts(id),
  status text not null check(status in ('reserved','sold','cancelled')),
  channel text not null check(channel in ('local','online')), amount_cents integer check(amount_cents>=0),
  external_order_id text, note text not null default '', created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_active_sale on public.part_sales(part_id) where status in ('reserved','sold');
create unique index online_order_unique on public.part_sales(workspace_id,external_order_id) where external_order_id is not null;
create index sales_company_idx on public.part_sales(workspace_id,created_at desc);
create table public.user_preferences (
  user_id uuid primary key references auth.users(id), workspace_id uuid not null references public.workspaces(id),
  settings jsonb not null default '{}'
);

create or replace function partiva_private.actor() returns text language sql stable security definer set search_path='' as $$
  select coalesce(nullif(display_name,''),nullif(email,''),auth.uid()::text) from public.workspace_members where user_id=auth.uid() and workspace_id=partiva_private.company();
$$;
create or replace function partiva_private.event(p uuid, typ text, data jsonb default '{}') returns void language sql security definer set search_path='' as $$
  insert into public.part_events(workspace_id,part_id,event_type,metadata,created_by,actor_name)
  select workspace_id,id,typ,data,auth.uid(),partiva_private.actor() from public.parts where id=p;
$$;
create or replace function partiva_private.company_event(typ text, data jsonb default '{}') returns void language sql security definer set search_path='' as $$
  insert into public.company_events(workspace_id,event_type,metadata,actor_id,actor_name) values(partiva_private.company(),typ,data,auth.uid(),partiva_private.actor());
$$;

-- A shared server-side catalogue keeps conditional fields identical to the client rules.
create or replace function partiva_private.needs_position(n text) returns boolean language sql immutable set search_path='' as $$
  select lower(n) ~ '(farol|lanterna|porta|parachoque|para-choque|amortecedor|mola|pneu|roda|paralama|para-lama|banco|eixo|freio|retrovisor|vidro|maçaneta)';
$$;
create or replace function partiva_private.needs_side(n text) returns boolean language sql immutable set search_path='' as $$
  select lower(n) ~ '(farol|lanterna|porta|retrovisor|paralama|para-lama|amortecedor|maçaneta|vidro|banco|freio)';
$$;
create or replace function partiva_private.valid_cnpj(n text) returns boolean language plpgsql immutable set search_path='' as $$
declare total int; digit int; i int; weights int[];
begin
  if n !~ '^[0-9]{14}$' or n ~ '^([0-9])\1{13}$' then return false; end if;
  weights=array[5,4,3,2,9,8,7,6,5,4,3,2]; total=0;
  for i in 1..12 loop total=total+substring(n,i,1)::int*weights[i]; end loop;
  digit=case when total%11<2 then 0 else 11-total%11 end;
  if substring(n,13,1)::int<>digit then return false; end if;
  weights=array[6,5,4,3,2,9,8,7,6,5,4,3,2]; total=0;
  for i in 1..13 loop total=total+substring(n,i,1)::int*weights[i]; end loop;
  digit=case when total%11<2 then 0 else 11-total%11 end;
  return substring(n,14,1)::int=digit;
end $$;
create or replace function partiva_private.readiness(p uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.parts; w public.workspaces; missing jsonb='[]'; min_photos int;
begin
  select * into r from public.parts where id=p;
  select * into w from public.workspaces where id=r.workspace_id;
  min_photos=coalesce((w.preferences->>'minimum_photos')::int,2);
  if btrim(r.part_name)='' then missing=missing||'"Nome da peça"'::jsonb; end if;
  if btrim(coalesce(r.detran_reference,''))='' then missing=missing||'"Número do Detran"'::jsonb; end if;
  if btrim(coalesce(r.category,''))='' then missing=missing||'"Categoria"'::jsonb; end if;
  if btrim(r.brand)='' then missing=missing||'"Marca"'::jsonb; end if;
  if btrim(r.model)='' then missing=missing||'"Modelo"'::jsonb; end if;
  if r.year is null then missing=missing||'"Ano"'::jsonb; end if;
  if partiva_private.needs_position(r.part_name) and r.position='' then missing=missing||'"Posição"'::jsonb; end if;
  if partiva_private.needs_side(r.part_name) and r.side='' then missing=missing||'"Lado"'::jsonb; end if;
  if btrim(r.title)='' then missing=missing||'"Título do anúncio"'::jsonb; end if;
  if r.price_cents is null or r.price_cents<=0 then missing=missing||'"Preço válido"'::jsonb; end if;
  if not w.fee_configured then missing=missing||'"Configuração da taxa estimada"'::jsonb; end if;
  if (select count(distinct coalesce(original_photo_id,id)) from public.part_photos where part_id=p and archived_at is null and selected_for_listing)<min_photos then missing=missing||jsonb_build_array('Selecionar ao menos '||min_photos||' fotografias para anúncio'); end if;
  return missing;
end $$;

create or replace function partiva_private.validate_phase(pid uuid, phase text) returns void language plpgsql stable security definer set search_path='' as $$
declare minimum int;
begin
  if phase='photos_edited' then
    select coalesce((w.preferences->>'minimum_photos')::int,2) into minimum from public.parts p join public.workspaces w on w.id=p.workspace_id where p.id=pid;
    if (select count(*) from public.part_photos where part_id=pid and kind='original' and archived_at is null)<minimum or not exists(select 1 from public.part_photos where part_id=pid and kind='edited' and archived_at is null) then raise exception 'Fotografias pendentes: anexe os originais e identifique ao menos uma versão editada antes de avançar'; end if;
  elsif phase in ('listing','publication') and jsonb_array_length(partiva_private.readiness(pid))>0 then raise exception 'Complete as pendências antes de avançar: %',partiva_private.readiness(pid);
  end if;
end $$;

create or replace function partiva_private.save_part(payload jsonb, expected_version int default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.parts; oldrow public.parts; pid uuid=coalesce((payload->>'id')::uuid,gen_random_uuid()); w uuid=partiva_private.company(); cname uuid; duplicate_count int; k text; inserted boolean=false; dest public.board_columns;
begin
  if not partiva_private.can('parts') then raise exception 'Sem permissão para editar peças' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=w for share;
  if pg_column_size(payload)>65536 then raise exception 'Cadastro muito grande'; end if;
  for k in select jsonb_object_keys(payload) loop
    if k not in ('id','part_name','detran_reference','complementary_code','category','brand','model','year','engine','position','side','color','title','title_manual','price_cents','notes','column_id','legacy_source','legacy_payload','vehicle') then raise exception 'Campo não permitido: %',k; end if;
  end loop;
  select * into r from public.parts where id=pid for update;
  if found then
    if r.workspace_id<>w or r.archived_at is not null then raise exception 'Peça indisponível' using errcode='42501'; end if;
    if expected_version is null or expected_version<>r.version then raise exception 'Este cadastro foi atualizado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    oldrow=r;
  else
    if expected_version is not null then raise exception 'Peça não encontrada'; end if;
    r.id=pid; r.workspace_id=w; r.title=''; r.part_name=''; r.brand=''; r.model=''; r.engine=''; r.position=''; r.side=''; r.color=''; r.complementary_code=''; r.notes=''; r.title_manual=false; r.created_by=auth.uid(); r.version=1;
    r.column_id=(select id from public.board_columns where workspace_id=w order by position,id limit 1);
    if r.column_id is null then raise exception 'Crie uma coluna antes de cadastrar peças'; end if;
    inserted=true;
  end if;
  r.part_name=coalesce(payload->>'part_name',r.part_name);
  r.detran_reference=coalesce(payload->>'detran_reference',r.detran_reference);
  r.complementary_code=coalesce(payload->>'complementary_code',r.complementary_code);
  r.category=coalesce(payload->>'category',r.category);
  r.brand=coalesce(payload->>'brand',r.brand); r.model=coalesce(payload->>'model',r.model);
  if payload?'year' then r.year=(payload->>'year')::int; end if;
  r.engine=coalesce(payload->>'engine',r.engine); r.position=coalesce(payload->>'position',r.position);
  r.side=coalesce(payload->>'side',r.side); r.color=coalesce(payload->>'color',r.color);
  r.title=coalesce(payload->>'title',r.title); r.title_manual=coalesce((payload->>'title_manual')::boolean,r.title_manual);
  if payload?'price_cents' then r.price_cents=(payload->>'price_cents')::int; end if;
  r.notes=coalesce(payload->>'notes',r.notes);
  if payload?'column_id' then r.column_id=(payload->>'column_id')::uuid; end if;
  foreach k in array array['part_name','detran_reference','complementary_code','category','brand','model','engine','position','side','color','title'] loop
    if length(coalesce(to_jsonb(r)->>k,''))>250 then raise exception 'Campo muito longo: %',k; end if;
  end loop;
  if length(r.notes)>5000 then raise exception 'Observações muito longas'; end if;
  if r.price_cents<0 then raise exception 'Preço inválido'; end if;
  if r.year is not null and (r.year<1900 or r.year>2200) then raise exception 'Ano inválido'; end if;
  if r.position not in ('','Dianteira','Traseira','Dianteiro','Traseiro','Central','Superior','Inferior') or r.side not in ('','Esquerdo','Direito','Ambos','Não se aplica') then raise exception 'Posição ou lado inválido'; end if;
  select * into dest from public.board_columns where id=r.column_id and workspace_id=w for share;
  if not found then raise exception 'Etapa inválida'; end if;
  if inserted then
    if payload?'legacy_source' and not partiva_private.can('admin') then raise exception 'Somente administrador pode importar'; end if;
    if payload?'legacy_source' then
      select * into oldrow from public.parts where workspace_id=w and legacy_source=payload->>'legacy_source';
      if found then
        if oldrow.legacy_payload is distinct from payload->'legacy_payload' then raise exception 'Origem já importada com conteúdo diferente. Confira o registro antes de atualizar.'; end if;
        return jsonb_build_object('part',to_jsonb(oldrow),'imported',false,'duplicates',0);
      end if;
    end if;
    insert into public.parts(id,workspace_id,internal_code,title,part_name,detran_reference,complementary_code,category,brand,model,year,engine,position,side,color,title_manual,price_cents,notes,column_id,created_by,legacy_source,legacy_payload,vehicle)
    values(r.id,w,null,r.title,r.part_name,r.detran_reference,r.complementary_code,r.category,r.brand,r.model,r.year,r.engine,r.position,r.side,r.color,r.title_manual,r.price_cents,r.notes,r.column_id,auth.uid(),payload->>'legacy_source',payload->'legacy_payload',case when payload?'legacy_source' then payload->>'vehicle' else null end) returning * into r;
  else
    update public.parts set title=r.title, part_name=r.part_name,detran_reference=r.detran_reference,complementary_code=r.complementary_code,category=r.category,brand=r.brand,model=r.model,year=r.year,engine=r.engine,position=r.position,side=r.side,color=r.color,title_manual=r.title_manual,price_cents=r.price_cents,notes=r.notes,column_id=r.column_id,listing_status=case when listing_status='ready' then 'draft' else listing_status end,version=version+1,updated_at=now() where id=pid returning * into r;
  end if;
  perform partiva_private.validate_phase(pid,dest.phase);
  perform partiva_private.event(pid,case when inserted then 'created' when oldrow.column_id<>r.column_id then 'moved' else 'edited' end,jsonb_build_object('before',to_jsonb(oldrow)-'legacy_payload','after',to_jsonb(r)-'legacy_payload'));
  select count(*) into duplicate_count from public.parts where workspace_id=w and id<>pid and archived_at is null and btrim(coalesce(detran_reference,''))<>'' and lower(btrim(detran_reference))=lower(btrim(r.detran_reference));
  return jsonb_build_object('part',to_jsonb(r),'duplicates',duplicate_count,'missing',partiva_private.readiness(pid));
end $$;

create or replace function partiva_private.column_action(command text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.board_columns; dest public.board_columns; w uuid=partiva_private.company(); ids uuid[]; pid uuid; i int;
begin
  if not partiva_private.can('columns') then raise exception 'Sem permissão para alterar etapas' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=w for update;
  if command='create' then
    if length(btrim(coalesce(payload->>'name',''))) not between 1 and 80 then raise exception 'Informe um nome de até 80 caracteres'; end if;
    if coalesce(payload->>'color','#0e6b6e') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Cor inválida'; end if;
    insert into public.board_columns(workspace_id,name,position,color,phase) values(w,btrim(payload->>'name'),coalesce((select max(position)+1 from public.board_columns where workspace_id=w),0),coalesce(payload->>'color','#0e6b6e'),coalesce(payload->>'phase','registration')) returning * into c;
  elsif command='reorder' then
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(payload->'ids');
    if cardinality(ids)<>(select count(*) from public.board_columns where workspace_id=w) or (select count(distinct x) from unnest(ids) x)<>cardinality(ids) or exists(select 1 from unnest(ids) x where not exists(select 1 from public.board_columns where id=x and workspace_id=w)) then raise exception 'Ordem de colunas inválida'; end if;
    for i in 1..cardinality(ids) loop update public.board_columns set position=i-1,version=version+1 where id=ids[i]; end loop;
  else
    select * into c from public.board_columns where id=(payload->>'id')::uuid and workspace_id=w for update;
    if not found then raise exception 'Coluna não encontrada'; end if;
    if (payload->>'version')::int is distinct from c.version then raise exception 'Coluna alterada por outra pessoa. Atualize.' using errcode='40001'; end if;
    if command='update' then
      if length(btrim(coalesce(payload->>'name',''))) not between 1 and 80 or coalesce(payload->>'color','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Nome ou cor inválidos'; end if;
      if payload->>'phase' in ('photos_edited','listing','publication') then
        for pid in select id from public.parts where column_id=c.id and archived_at is null loop
          perform partiva_private.validate_phase(pid,payload->>'phase');
        end loop;
      end if;
      update public.board_columns set name=btrim(payload->>'name'),color=payload->>'color',phase=payload->>'phase',version=version+1 where id=c.id;
      update public.parts set operational_status=(payload->>'phase'),version=version+1,updated_at=now() where column_id=c.id;
    elsif command='delete' then
      select * into dest from public.board_columns where id=(payload->>'destination')::uuid and workspace_id=w and id<>c.id for update;
      if not found then raise exception 'Escolha outra coluna para receber as peças'; end if;
      for pid in select id from public.parts where column_id=c.id order by id for update loop
        perform partiva_private.validate_phase(pid,dest.phase);
        update public.parts set column_id=dest.id,version=version+1,updated_at=now() where id=pid;
        perform partiva_private.event(pid,'moved',jsonb_build_object('from',c.name,'to',dest.name,'reason','column_deleted'));
      end loop;
      delete from public.board_columns where id=c.id;
    else raise exception 'Ação de coluna inválida'; end if;
  end if;
  perform partiva_private.company_event('column_'||command,payload);
  return jsonb_build_object('ok',true);
end $$;

create or replace function partiva_private.part_action(pid uuid, command text, expected_version int) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.parts; missing jsonb;
begin
  if not partiva_private.can('parts') then raise exception 'Sem permissão' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=partiva_private.company() for share;
  select * into r from public.parts where id=pid and workspace_id=partiva_private.company() for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if r.version is distinct from expected_version then raise exception 'Peça atualizada por outra pessoa' using errcode='40001'; end if;
  if command='restore' then
    if r.archived_at is null then raise exception 'Peça já está ativa'; end if;
    update public.parts set archived_at=null,version=version+1,updated_at=now() where id=pid;
  elsif r.archived_at is not null then raise exception 'Peça excluída da operação';
  elsif command='archive' then
    if r.sale_status in ('reserved','sold') then raise exception 'Resolva a reserva ou venda antes de excluir'; end if;
    update public.parts set archived_at=now(),version=version+1,updated_at=now() where id=pid;
  elsif command='ready' then
    missing=partiva_private.readiness(pid);
    if jsonb_array_length(missing)>0 then raise exception 'Pendências do anúncio: %',missing; end if;
    update public.parts set listing_status='ready',version=version+1,updated_at=now() where id=pid;
  else raise exception 'Ação inválida'; end if;
  perform partiva_private.event(pid,command);
  return (select to_jsonb(p) from public.parts p where id=pid);
end $$;

create or replace function partiva_private.photo_action(pid uuid, command text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.parts; photo public.part_photos; parent public.part_photos; ids uuid[]; i int; file_path text;
begin
  if not partiva_private.can('photos') then raise exception 'Sem permissão para fotografias' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=partiva_private.company() for share;
  select * into r from public.parts where id=pid and workspace_id=partiva_private.company() and archived_at is null for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if command='register' then
    file_path=payload->>'storage_path';
    if file_path !~ ('^'||r.workspace_id::text||'/'||pid::text||'/[a-f0-9-]+\.(jpg|jpeg|png|webp|avif)$') then raise exception 'Caminho de fotografia inválido'; end if;
    if not exists(select 1 from storage.objects where bucket_id='part-photos' and name=file_path) then raise exception 'Envio da fotografia não confirmado'; end if;
    if payload->>'mime_type' not in ('image/jpeg','image/png','image/webp','image/avif') or (payload->>'size_bytes')::bigint not between 1 and 20971520 then raise exception 'Formato ou tamanho inválido'; end if;
    select * into photo from public.part_photos where id=(payload->>'id')::uuid;
    if found then
      if photo.part_id<>pid or photo.storage_path<>file_path then raise exception 'Identificador de fotografia já utilizado'; end if;
      return jsonb_build_object('ok',true);
    end if;
    if payload->>'original_photo_id' is not null then
      select * into parent from public.part_photos where id=(payload->>'original_photo_id')::uuid and part_id=pid and kind='original' and archived_at is null;
      if not found then raise exception 'Fotografia original inválida'; end if;
    end if;
    insert into public.part_photos(id,part_id,storage_path,sort_order,kind,original_photo_id,mime_type,size_bytes,created_by,is_cover)
    values((payload->>'id')::uuid,pid,file_path,coalesce((select max(sort_order)+1 from public.part_photos where part_id=pid),0),case when parent.id is null then 'original' else 'edited' end,parent.id,payload->>'mime_type',(payload->>'size_bytes')::bigint,auth.uid(),not exists(select 1 from public.part_photos where part_id=pid and archived_at is null))
    on conflict(id) do nothing;
  elsif command='reorder' then
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(payload->'ids');
    if cardinality(ids)<>(select count(*) from public.part_photos where part_id=pid and archived_at is null) or (select count(distinct x) from unnest(ids) x)<>cardinality(ids) or exists(select 1 from unnest(ids) x where not exists(select 1 from public.part_photos where id=x and part_id=pid and archived_at is null)) then raise exception 'Ordem de fotografias inválida'; end if;
    for i in 1..cardinality(ids) loop update public.part_photos set sort_order=i-1 where id=ids[i]; end loop;
  else
    select * into photo from public.part_photos where id=(payload->>'id')::uuid and part_id=pid and archived_at is null;
    if not found then raise exception 'Fotografia não encontrada'; end if;
    if command='cover' then
      update public.part_photos set is_cover=false where part_id=pid;
      update public.part_photos set is_cover=true where id=photo.id;
    elsif command='select' then update public.part_photos set selected_for_listing=(payload->>'selected')::boolean where id=photo.id;
    elsif command='archive' then
      if exists(select 1 from public.part_photos where original_photo_id=photo.id and archived_at is null) then raise exception 'Arquive as versões editadas antes de remover o original da galeria'; end if;
      update public.part_photos set archived_at=now(),is_cover=false,selected_for_listing=false where id=photo.id;
      if photo.is_cover then update public.part_photos set is_cover=true where id=(select id from public.part_photos where part_id=pid and archived_at is null order by sort_order,id limit 1); end if;
    else raise exception 'Ação de fotografia inválida'; end if;
  end if;
  update public.parts set version=version+1,updated_at=now(),listing_status=case when listing_status='ready' then 'draft' else listing_status end where id=pid;
  perform partiva_private.event(pid,'photo_'||command,payload);
  return jsonb_build_object('ok',true);
end $$;

create or replace function partiva_private.sale_action(pid uuid, command text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.parts; s public.part_sales; existing public.part_sales; request uuid=(payload->>'request_id')::uuid;
begin
  if not partiva_private.can('sales') then raise exception 'Sem permissão para vendas' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=partiva_private.company() for share;
  if request is null then raise exception 'Identificador da operação obrigatório'; end if;
  if length(coalesce(payload->>'note',''))>1000 or length(coalesce(payload->>'external_order_id',''))>250 then raise exception 'Dados de venda muito longos'; end if;
  select * into r from public.parts where id=pid and workspace_id=partiva_private.company() and archived_at is null for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  select * into existing from public.part_sales where request_id=request;
  if found then
    if existing.part_id<>pid then raise exception 'Operação já utilizada'; end if;
    return to_jsonb(existing);
  end if;
  if (payload->>'version')::int is distinct from r.version then raise exception 'Disponibilidade alterada por outra pessoa. Atualize.' using errcode='40001'; end if;
  select * into s from public.part_sales where part_id=pid and status in ('reserved','sold') for update;
  if command='reserve' then
    if s.id is not null or r.sale_status in ('reserved','sold') then raise exception 'Peça já reservada ou vendida'; end if;
    insert into public.part_sales(request_id,workspace_id,part_id,status,channel,note,created_by) values(request,r.workspace_id,pid,'reserved','local',coalesce(payload->>'note',''),auth.uid()) returning * into s;
    update public.parts set sale_status='reserved',version=version+1,updated_at=now() where id=pid;
  elsif command in ('sell_local','sell_online') then
    if r.sale_status='sold' or s.status='sold' then raise exception 'Peça já vendida'; end if;
    if (payload->>'amount_cents')::int is null or (payload->>'amount_cents')::int<=0 then raise exception 'Valor de venda inválido'; end if;
    if command='sell_online' and (length(btrim(coalesce(payload->>'external_order_id','')))=0 or coalesce((payload->>'confirmed')::boolean,false)=false) then raise exception 'Informe o pedido externo e confirme a venda online'; end if;
    if s.id is not null then update public.part_sales set status='cancelled',note=note||' [Reserva concluída]',updated_at=now() where id=s.id; end if;
    insert into public.part_sales(request_id,workspace_id,part_id,status,channel,amount_cents,external_order_id,note,created_by)
    values(request,r.workspace_id,pid,'sold',case when command='sell_online' then 'online' else 'local' end,(payload->>'amount_cents')::int,case when command='sell_online' then btrim(payload->>'external_order_id') else null end,coalesce(payload->>'note',''),auth.uid()) returning * into s;
    update public.parts set sale_status='sold',version=version+1,updated_at=now() where id=pid;
  elsif command in ('release','cancel') then
    if s.id is null or (command='release' and s.status<>'reserved') or (command='cancel' and s.status<>'sold') then raise exception 'Não existe reserva ou venda compatível'; end if;
    if length(btrim(coalesce(payload->>'note','')))<3 then raise exception 'Informe o motivo do cancelamento'; end if;
    update public.part_sales set status='cancelled',request_id=request,note=note||' | '||(payload->>'note'),updated_at=now() where id=s.id returning * into s;
    update public.parts set sale_status='available',version=version+1,updated_at=now() where id=pid;
  else raise exception 'Ação de venda inválida'; end if;
  perform partiva_private.event(pid,command,to_jsonb(s));
  return to_jsonb(s);
end $$;

create or replace function partiva_private.company_save(payload jsonb, expected_version int) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.workspaces; k text; min_photos int;
begin
  if not partiva_private.can('admin') then raise exception 'Somente administradores podem alterar a empresa' using errcode='42501'; end if;
  select * into w from public.workspaces where id=partiva_private.company() for update;
  if w.version is distinct from expected_version then raise exception 'Configurações atualizadas por outro administrador' using errcode='40001'; end if;
  for k in select jsonb_object_keys(payload) loop
    if k not in ('legal_name','trade_name','tax_id','phone','email','address','logo_path','fee_percent','fee_fixed_cents','fee_configured','preferences') then raise exception 'Campo da empresa não permitido: %',k; end if;
  end loop;
  if length(coalesce(payload->>'legal_name',''))>250 or length(coalesce(payload->>'trade_name',''))>250 or pg_column_size(payload)>32768 then raise exception 'Dados da empresa muito longos'; end if;
  if coalesce(payload->>'tax_id','')<>'' and not partiva_private.valid_cnpj(payload->>'tax_id') then raise exception 'CNPJ inválido'; end if;
  if payload?'address' and jsonb_typeof(payload->'address')<>'object' or payload?'preferences' and jsonb_typeof(payload->'preferences')<>'object' then raise exception 'Endereço ou preferências inválidos'; end if;
  if length(coalesce(payload->>'phone',''))>40 then raise exception 'Telefone muito longo'; end if;
  if coalesce(payload->>'email','')<>'' and payload->>'email' !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'E-mail inválido'; end if;
  min_photos=coalesce((payload->'preferences'->>'minimum_photos')::int,2);
  if min_photos not between 2 and 30 then raise exception 'Quantidade mínima de fotografias: 2 a 30'; end if;
  if payload->>'logo_path' is not null and not exists(select 1 from storage.objects where bucket_id='company-assets' and name=payload->>'logo_path' and name like w.id::text||'/logo/%') then raise exception 'Logotipo não enviado'; end if;
  update public.workspaces set legal_name=coalesce(payload->>'legal_name',legal_name),trade_name=coalesce(payload->>'trade_name',trade_name),name=coalesce(nullif(payload->>'trade_name',''),name),tax_id=coalesce(payload->>'tax_id',tax_id),phone=coalesce(payload->>'phone',phone),email=coalesce(payload->>'email',email),address=coalesce(payload->'address',address),logo_path=coalesce(payload->>'logo_path',logo_path),fee_percent=coalesce((payload->>'fee_percent')::numeric,fee_percent),fee_fixed_cents=coalesce((payload->>'fee_fixed_cents')::int,fee_fixed_cents),fee_configured=coalesce((payload->>'fee_configured')::boolean,fee_configured),preferences=coalesce(payload->'preferences',preferences),version=version+1 where id=w.id returning * into w;
  update public.parts set listing_status='draft',version=version+1,updated_at=now() where workspace_id=w.id and listing_status='ready';
  perform partiva_private.company_event('company_updated',payload);
  return to_jsonb(w);
end $$;

create or replace function partiva_private.member_save(uid uuid, new_role text, enabled boolean, label text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.workspace_members;
begin
  if not partiva_private.can('admin') then raise exception 'Somente administradores podem gerenciar funcionários' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=partiva_private.company() for update;
  select * into m from public.workspace_members where workspace_id=partiva_private.company() and user_id=uid for update;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if new_role not in ('admin','operator','photographer','sales','viewer') then raise exception 'Perfil inválido'; end if;
  if m.role in ('owner','admin','manager') and (not enabled or new_role<>'admin') and (select count(*) from public.workspace_members where workspace_id=m.workspace_id and active and role in ('owner','admin','manager'))<=1 then raise exception 'Mantenha ao menos um administrador ativo'; end if;
  update public.workspace_members set role=new_role,active=enabled,display_name=left(label,100) where workspace_id=m.workspace_id and user_id=uid returning * into m;
  perform partiva_private.company_event('employee_updated',jsonb_build_object('user_id',uid,'role',new_role,'active',enabled));
  return to_jsonb(m);
end $$;

-- Only the trusted Worker can bind an invited Auth account; it independently verifies the administrator.
create or replace function public.bind_invited_employee(admin_id uuid, invited_id uuid, employee_email text, employee_name text, employee_role text) returns void language plpgsql security definer set search_path='' as $$
declare w uuid=partiva_private.company();
begin
  if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=admin_id and active and role in ('owner','admin','manager')) then raise exception 'Administrador inválido'; end if;
  if employee_role not in ('admin','operator','photographer','sales','viewer') then raise exception 'Perfil inválido'; end if;
  insert into public.workspace_members(workspace_id,user_id,email,display_name,role) values(w,invited_id,employee_email,left(employee_name,100),employee_role) on conflict(workspace_id,user_id) do nothing;
  insert into public.company_events(workspace_id,event_type,actor_id,metadata) values(w,'employee_invited',admin_id,jsonb_build_object('user_id',invited_id,'email',employee_email,'role',employee_role));
end $$;
revoke all on function public.bind_invited_employee(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bind_invited_employee(uuid,uuid,text,text,text) to service_role;

create or replace function partiva_private.preferences_save(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  if not partiva_private.can('read') then raise exception 'Sem acesso' using errcode='42501'; end if;
  if pg_column_size(payload)>8192 then raise exception 'Preferências muito grandes'; end if;
  insert into public.user_preferences(user_id,workspace_id,settings) values(auth.uid(),partiva_private.company(),payload) on conflict(user_id) do update set settings=excluded.settings;
end $$;

-- PostgREST exposes only these INVOKER wrappers. Private definer functions enforce all writes.
create function public.save_part(payload jsonb, expected_version int default null) returns jsonb language sql security invoker set search_path='' as $$ select partiva_private.save_part(payload,expected_version); $$;
create function public.column_action(command text, payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select partiva_private.column_action(command,payload); $$;
create function public.part_action(pid uuid, command text, expected_version int) returns jsonb language sql security invoker set search_path='' as $$ select partiva_private.part_action(pid,command,expected_version); $$;
create function public.photo_action(pid uuid, command text, payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select partiva_private.photo_action(pid,command,payload); $$;
create function public.sale_action(pid uuid, command text, payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select partiva_private.sale_action(pid,command,payload); $$;
create function public.company_save(payload jsonb, expected_version int) returns jsonb language sql security invoker set search_path='' as $$ select partiva_private.company_save(payload,expected_version); $$;
create function public.member_save(uid uuid, new_role text, enabled boolean, label text) returns jsonb language sql security invoker set search_path='' as $$ select partiva_private.member_save(uid,new_role,enabled,label); $$;
create function public.preferences_save(payload jsonb) returns void language sql security invoker set search_path='' as $$ select partiva_private.preferences_save(payload); $$;
do $$ declare signature text; begin
  foreach signature in array array['save_part(jsonb,integer)','column_action(text,jsonb)','part_action(uuid,text,integer)','photo_action(uuid,text,jsonb)','sale_action(uuid,text,jsonb)','company_save(jsonb,integer)','member_save(uuid,text,boolean,text)','preferences_save(jsonb)'] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
    execute 'grant execute on function partiva_private.'||signature||' to authenticated';
  end loop;
end $$;

-- Replace legacy permissive policies without removing any data or table.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('workspaces','workspace_members','parts','board_columns','part_photos','part_events','app_configuration','company_events','part_sales','user_preferences') loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;
alter table public.app_configuration enable row level security;
alter table public.company_events enable row level security;
alter table public.part_sales enable row level security;
alter table public.user_preferences enable row level security;
create policy company_read on public.workspaces for select to authenticated using(partiva_private.member(id));
create policy configuration_read on public.app_configuration for select to authenticated using(partiva_private.member(workspace_id));
create policy members_read on public.workspace_members for select to authenticated using(partiva_private.member(workspace_id) and (user_id=auth.uid() or partiva_private.can('admin')));
create policy columns_read on public.board_columns for select to authenticated using(partiva_private.member(workspace_id));
create policy parts_read on public.parts for select to authenticated using(partiva_private.member(workspace_id));
create policy photos_read on public.part_photos for select to authenticated using(exists(select 1 from public.parts p where p.id=part_id and partiva_private.member(p.workspace_id)));
create policy events_read on public.part_events for select to authenticated using(partiva_private.member(workspace_id));
create policy company_events_read on public.company_events for select to authenticated using(partiva_private.member(workspace_id) and partiva_private.can('admin'));
create policy sales_read on public.part_sales for select to authenticated using(partiva_private.member(workspace_id) and partiva_private.can('sales'));
create policy preferences_read on public.user_preferences for select to authenticated using(user_id=auth.uid() and partiva_private.member(workspace_id));
revoke all on public.workspaces,public.workspace_members,public.board_columns,public.parts,public.part_photos,public.part_events,public.app_configuration,public.company_events,public.part_sales,public.user_preferences from anon,authenticated;
grant select on public.workspaces,public.workspace_members,public.board_columns,public.parts,public.part_photos,public.part_events,public.app_configuration,public.company_events,public.part_sales,public.user_preferences to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('company-assets','company-assets',false,20971520,array['image/jpeg','image/png','image/webp','image/avif']) on conflict(id) do nothing;
update storage.buckets set public=false,file_size_limit=20971520,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif'] where id='part-photos';
drop policy if exists "authenticated users can manage part photos" on storage.objects;
create policy partiva_private_files_read on storage.objects for select to authenticated using(
  partiva_private.member(partiva_private.company()) and (
    bucket_id in ('part-photos','company-assets') and split_part(name,'/',1)=partiva_private.company()::text
    or bucket_id='part-photos' and exists(select 1 from public.part_photos f join public.parts p on p.id=f.part_id where f.storage_path=storage.objects.name and p.workspace_id=partiva_private.company())
  )
);
create policy partiva_photos_insert on storage.objects for insert to authenticated with check(
  bucket_id='part-photos' and partiva_private.can('photos') and split_part(name,'/',1)=partiva_private.company()::text
  and exists(select 1 from public.parts p where p.id::text=split_part(name,'/',2) and p.workspace_id=partiva_private.company() and p.archived_at is null)
);
create policy partiva_logo_insert on storage.objects for insert to authenticated with check(
  bucket_id='company-assets' and partiva_private.can('admin') and split_part(name,'/',1)=partiva_private.company()::text and split_part(name,'/',2)='logo'
);
-- No UPDATE/DELETE Storage policy: originals cannot be overwritten or destroyed by application users.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['parts','board_columns','part_photos','part_events','workspaces','workspace_members','part_sales'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute 'alter publication supabase_realtime add table public.'||quote_ident(t); end if;
    end loop;
  end if;
end $$;
commit;
