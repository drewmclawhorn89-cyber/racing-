create table if not exists public.race_records (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 20),
  track_name text not null check (track_name in ('Sunset Speedway', 'Neon District', 'Alpine Pass', 'Diamond Ring')),
  time_ms integer not null check (time_ms between 1000 and 3600000),
  created_at timestamptz not null default now()
);

create index if not exists race_records_track_time_idx
  on public.race_records (track_name, time_ms asc);

alter table public.race_records enable row level security;

grant select, insert on public.race_records to anon, authenticated;

drop policy if exists "Anyone can read race records" on public.race_records;
create policy "Anyone can read race records"
  on public.race_records for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can submit a race record" on public.race_records;
create policy "Anyone can submit a race record"
  on public.race_records for insert
  to anon, authenticated
  with check (
    char_length(player_name) between 1 and 20
    and track_name in ('Sunset Speedway', 'Neon District', 'Alpine Pass', 'Diamond Ring')
    and time_ms between 1000 and 3600000
  );
