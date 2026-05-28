-- Challenge system foundation (slice-first, auth-later).
-- Player tables exist for Phase 7 auth; no anon policies on runs/leg_results.

create type public.challenge_type as enum (
  'completion',
  'daily_pool',
  'one_off'
);

create type public.challenge_run_status as enum (
  'in_progress',
  'finished',
  'failed'
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  eyebrow text,
  type public.challenge_type not null,
  leg_count integer not null check (leg_count > 0),
  is_published boolean not null default false,
  portal_sort_order integer,
  art_config jsonb,
  created_at timestamptz not null default now()
);

create index if not exists challenges_type_idx on public.challenges (type);
create index if not exists challenges_is_published_idx on public.challenges (is_published) where is_published = true;
create index if not exists challenges_portal_sort_order_idx on public.challenges (portal_sort_order) where portal_sort_order is not null;

create table public.challenge_movies (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete restrict,
  position integer not null check (position > 0),
  unique (challenge_id, position),
  unique (challenge_id, movie_id)
);

create index if not exists challenge_movies_challenge_id_idx on public.challenge_movies (challenge_id);
create index if not exists challenge_movies_movie_id_idx on public.challenge_movies (movie_id);

create table public.challenge_daily_legs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  scheduled_date date not null,
  position integer not null check (position > 0 and position <= 5),
  movie_id uuid not null references public.movies (id) on delete restrict,
  unique (challenge_id, scheduled_date, position)
);

create index if not exists challenge_daily_legs_challenge_date_idx
  on public.challenge_daily_legs (challenge_id, scheduled_date);

create table public.challenge_runs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid,
  date_key text,
  status public.challenge_run_status not null default 'in_progress',
  total_guesses integer check (total_guesses is null or total_guesses >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists challenge_runs_challenge_id_idx on public.challenge_runs (challenge_id);
create index if not exists challenge_runs_user_id_idx on public.challenge_runs (user_id) where user_id is not null;
create index if not exists challenge_runs_date_key_idx on public.challenge_runs (challenge_id, date_key) where date_key is not null;

comment on column public.challenge_runs.user_id is 'Nullable until auth; will reference auth.users in Phase 7.';
comment on column public.challenge_runs.date_key is 'YYYY-MM-DD for daily_pool runs; null for completion/one_off.';

create table public.challenge_leg_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.challenge_runs (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete restrict,
  position integer not null check (position > 0),
  guesses_used integer not null check (guesses_used >= 0),
  solved boolean not null,
  completed_at timestamptz not null default now(),
  unique (run_id, position)
);

create index if not exists challenge_leg_results_run_id_idx on public.challenge_leg_results (run_id);

-- RLS
alter table public.challenges enable row level security;
alter table public.challenge_movies enable row level security;
alter table public.challenge_daily_legs enable row level security;
alter table public.challenge_runs enable row level security;
alter table public.challenge_leg_results enable row level security;

create policy "Public read published challenges"
  on public.challenges
  for select
  using (is_published = true);

create policy "Public read challenge_movies for published challenges"
  on public.challenge_movies
  for select
  using (
    exists (
      select 1
      from public.challenges c
      where c.id = challenge_id
        and c.is_published = true
    )
  );

create policy "Public read challenge_daily_legs for published challenges today"
  on public.challenge_daily_legs
  for select
  using (
    scheduled_date = current_date
    and exists (
      select 1
      from public.challenges c
      where c.id = challenge_id
        and c.is_published = true
    )
  );

-- challenge_runs and challenge_leg_results: RLS enabled, no policies (anon/authenticated denied until Phase 7).
