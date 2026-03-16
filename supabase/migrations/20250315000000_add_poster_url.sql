-- Optional poster image URL for movie result card
alter table public.movies
  add column if not exists poster_url text;
