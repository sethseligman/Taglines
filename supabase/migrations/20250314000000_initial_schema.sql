-- Movies: core entity
create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year integer not null check (year >= 1800 and year <= 2100),
  genre text not null default '',
  cast_hint text not null default '',
  plot_hint text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Taglines: one primary per movie, optional alternates
create table if not exists public.taglines (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  tagline_text text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index taglines_one_primary_per_movie on public.taglines (movie_id) where (is_primary = true);

create index if not exists taglines_movie_id_idx on public.taglines(movie_id);

-- Accepted aliases (alternate titles users can guess)
create table if not exists public.accepted_aliases (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (movie_id, alias)
);

create index if not exists accepted_aliases_movie_id_idx on public.accepted_aliases(movie_id);

-- Daily schedule: one movie per calendar date
create table if not exists public.daily_schedule (
  scheduled_date date primary key,
  movie_id uuid not null references public.movies(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists daily_schedule_movie_id_idx on public.daily_schedule(movie_id);

-- Updated_at trigger for movies
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists movies_updated_at on public.movies;
create trigger movies_updated_at
  before update on public.movies
  for each row execute function public.set_updated_at();

-- RLS: allow public read for movies, taglines, aliases, daily_schedule
alter table public.movies enable row level security;
alter table public.taglines enable row level security;
alter table public.accepted_aliases enable row level security;
alter table public.daily_schedule enable row level security;

create policy "Public read movies" on public.movies for select using (true);
create policy "Public read taglines" on public.taglines for select using (true);
create policy "Public read accepted_aliases" on public.accepted_aliases for select using (true);
create policy "Public read daily_schedule" on public.daily_schedule for select using (true);

-- Admin write: use service role key from app (bypasses RLS) or add auth policies
-- For app-only admin we rely on service role in server actions; no insert/update policies for anon.
-- If you add Supabase Auth later: create policy for authenticated users in app_metadata.role = 'admin'.
