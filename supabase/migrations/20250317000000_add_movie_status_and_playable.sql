-- Step 1: Lightweight review status for movies
-- New rows default to pending_review and not playable until approved.

alter table public.movies
  add column if not exists status text not null default 'pending_review',
  add column if not exists is_playable boolean not null default false;

comment on column public.movies.status is 'Review state: pending_review, approved, rejected, etc.';
comment on column public.movies.is_playable is 'If true, movie can appear in daily/practice and autocomplete.';
