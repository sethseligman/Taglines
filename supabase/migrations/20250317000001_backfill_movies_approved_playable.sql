-- One-time backfill: mark existing movies as approved and playable.
-- Run once after adding status/is_playable. New inserts still get defaults.

update public.movies
set status = 'approved', is_playable = true
where status = 'pending_review' and is_playable = false;
