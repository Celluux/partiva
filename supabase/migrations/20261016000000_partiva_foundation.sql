-- Fundação do Partiva: identidade da peça, fluxo operacional e estados independentes.
-- Execute após habilitar o Supabase Auth no projeto.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operator' check (role in ('owner', 'manager', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text not null default '#6857df',
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  internal_code text not null,
  detran_reference text,
  title text not null,
  vehicle text,
  category text,
  stock_location text,
  condition text,
  notes text,
  price_cents integer check (price_cents >= 0),
  operational_status text not null default 'entry' check (operational_status in ('entry', 'dismantling', 'preparing', 'ready')),
  listing_status text not null default 'draft' check (listing_status in ('not_applicable', 'draft', 'review', 'published', 'paused')),
  sale_status text not null default 'available' check (sale_status in ('available', 'reserved', 'sold', 'cancelled')),
  column_id uuid references public.board_columns(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, internal_code)
);

create table if not exists public.part_photos (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.part_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete cascade,
  event_type text not null,
  from_value text,
  to_value text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists parts_workspace_idx on public.parts(workspace_id);
create index if not exists parts_column_idx on public.parts(column_id);
create index if not exists part_events_part_idx on public.part_events(part_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.board_columns enable row level security;
alter table public.parts enable row level security;
alter table public.part_photos enable row level security;
alter table public.part_events enable row level security;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_manager(target_workspace uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = (select auth.uid())
      and role in ('owner', 'manager')
  );
$$;

drop policy if exists "members can view workspaces" on public.workspaces;
create policy "members can view workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
drop policy if exists "users can view their memberships" on public.workspace_members;
create policy "users can view their memberships" on public.workspace_members for select to authenticated using (user_id = (select auth.uid()) or public.is_workspace_manager(workspace_id));
drop policy if exists "members can view columns" on public.board_columns;
create policy "members can view columns" on public.board_columns for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "managers can manage columns" on public.board_columns;
create policy "managers can manage columns" on public.board_columns for all to authenticated using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
drop policy if exists "members can view parts" on public.parts;
create policy "members can view parts" on public.parts for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "members can create parts" on public.parts;
create policy "members can create parts" on public.parts for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
drop policy if exists "members can update parts" on public.parts;
create policy "members can update parts" on public.parts for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists "managers can delete parts" on public.parts;
create policy "managers can delete parts" on public.parts for delete to authenticated using (public.is_workspace_manager(workspace_id));
drop policy if exists "members can view photos" on public.part_photos;
create policy "members can view photos" on public.part_photos for select to authenticated using (exists (select 1 from public.parts where parts.id = part_photos.part_id and public.is_workspace_member(parts.workspace_id)));
drop policy if exists "members can view events" on public.part_events;
create policy "members can view events" on public.part_events for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "members can create events" on public.part_events;
create policy "members can create events" on public.part_events for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));

grant select on public.workspaces, public.workspace_members, public.board_columns, public.parts, public.part_photos, public.part_events to authenticated;
grant insert, update, delete on public.parts to authenticated;
grant insert on public.part_events to authenticated;
grant insert, update, delete on public.board_columns to authenticated;

-- Primeira fase: todos os usuários autenticados compartilham o workspace principal.
-- A coluna workspace_id permanece para permitir segmentação por empresa no futuro.
insert into public.workspaces (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Partiva')
on conflict (id) do nothing;

drop policy if exists "all authenticated users can use columns" on public.board_columns;
create policy "all authenticated users can use columns" on public.board_columns for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
drop policy if exists "all authenticated users can use parts" on public.parts;
create policy "all authenticated users can use parts" on public.parts for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
drop policy if exists "all authenticated users can use photos" on public.part_photos;
create policy "all authenticated users can use photos" on public.part_photos for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
drop policy if exists "all authenticated users can use events" on public.part_events;
create policy "all authenticated users can use events" on public.part_events for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- Bucket privado para as fotos das peças. A aplicação deve gerar URLs assinadas.
insert into storage.buckets (id, name, public)
values ('part-photos', 'part-photos', false)
on conflict (id) do nothing;

drop policy if exists "authenticated users can manage part photos" on storage.objects;
create policy "authenticated users can manage part photos" on storage.objects for all to authenticated
  using (bucket_id = 'part-photos')
  with check (bucket_id = 'part-photos');
