-- One-time: mark all approved movies as playable so they appear in practice/autocomplete/schedule.
-- Run this if you approved many movies but only a few (or one) were toggled Playable.

update public.movies
set is_playable = true
where status = 'approved' and (is_playable = false or is_playable is null);
