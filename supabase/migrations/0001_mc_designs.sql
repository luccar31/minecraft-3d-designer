-- MC Blueprint — almacenamiento de diseños en la nube.
-- Aplicar con: supabase db push   (o pegar en el SQL editor del proyecto)

create table if not exists public.mc_designs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  description  text not null default '',
  size_x       integer not null check (size_x between 1 and 256),
  size_y       integer not null check (size_y between 1 and 256),
  size_z       integer not null check (size_z between 1 and 256),
  block_count  integer not null default 0,
  -- { palette: string[], data: base64(gzip(registros de 6 bytes)) }
  payload      jsonb   not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists mc_designs_user_updated_idx
  on public.mc_designs (user_id, updated_at desc);

alter table public.mc_designs enable row level security;

-- Una sola política: cada usuario ve y escribe únicamente sus diseños.
drop policy if exists "mc_designs_owner" on public.mc_designs;
create policy "mc_designs_owner"
  on public.mc_designs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.mc_designs_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mc_designs_touch on public.mc_designs;
create trigger mc_designs_touch
  before update on public.mc_designs
  for each row execute function public.mc_designs_touch();
