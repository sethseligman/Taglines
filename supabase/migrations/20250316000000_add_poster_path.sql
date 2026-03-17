-- TMDB poster path (e.g. /abc123.jpg); base URL applied at render time
alter table public.movies
  add column if not exists poster_path text;
