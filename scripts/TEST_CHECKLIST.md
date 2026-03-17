# Single-movie ingestion pipeline — test checklist

Use this to validate the import → admin review → schedule → gameplay flow before scaling to batch import.

---

## 1. Import script behavior

- [ ] **Movie imports successfully**  
  Run: `npx tsx scripts/importMovie.ts "Back to the Future"`  
  Expect: "Done." plus movie id, title, year, tagline snippet, status.

- [ ] **Duplicate detection (normalized title + year)**  
  Run the same command again (or import a movie that already exists with same normalized title + year).  
  Expect: "Skipping: Movie already exists (id=...)."  
  Optional: Manually insert a movie with different punctuation (e.g. "Back To The Future") and re-import; should still skip.

- [ ] **Empty / malformed tagline skipped**  
  Use a TMDB title known to have no tagline (or mock by temporarily changing the script).  
  Expect: "Skipping: TMDB tagline is empty or cleaned to empty."

- [ ] **Tagline cleanup**  
  If you have a TMDB movie whose tagline has extra spaces or surrounding quotes, run import and then in DB check `taglines.tagline_text` has no leading/trailing quotes and single spaces.

---

## 2. Database state (after a successful import)

Inspect in Supabase (Table Editor or SQL).

- [ ] **movies**  
  One row: correct `title`, `year`, `genre`, `cast_hint`, `plot_hint`, `poster_path`.  
  `status` = `pending_review`, `is_playable` = `false`.

- [ ] **taglines**  
  One row for that movie: `movie_id` = movie id, `tagline_text` = cleaned tagline, `is_primary` = `true`.

- [ ] **accepted_aliases**  
  One row: `movie_id` = movie id, `alias` = canonical title.

**Query to run (replace `<movie_title>`):**

```sql
select m.id, m.title, m.year, m.status, m.is_playable,
       t.tagline_text, t.is_primary,
       a.alias
from movies m
left join taglines t on t.movie_id = m.id and t.is_primary = true
left join accepted_aliases a on a.movie_id = m.id
where m.title ilike '%<movie_title>%';
```

---

## 3. Admin review flow

- [ ] **Pending movie in list**  
  Open `/admin`. Imported movie appears in the Movies list with "pending_review · not playable".

- [ ] **Status filter**  
  Click "pending review". Movie appears. Switch to "approved" / "rejected" / "All" and confirm list updates.

- [ ] **Approve**  
  Click "Approve" on the row. List refreshes; movie shows "approved · not playable" (playable unchanged unless you changed quick actions).

- [ ] **Reject**  
  On another pending movie (or re-import one), click "Reject". Movie shows "rejected · not playable".

- [ ] **Playable toggle**  
  Click "Playable" (or "Unplayable") on a row. Status text updates; after "Playable", row shows "… · playable".

- [ ] **Edit modal**  
  Click "Edit". Modal opens with title, year, genre, tagline, aliases, Status dropdown, Playable checkbox. Change something, Save. List and schedule reflect changes.

---

## 4. Schedule behavior

- [ ] **Pending / non-playable not in dropdown**  
  With the imported movie still `pending_review` or `approved` but `is_playable = false`, open Daily schedule. In "Assign" dropdown for a date, the imported movie does **not** appear.

- [ ] **Approved + playable in dropdown**  
  Set movie to `approved` and `is_playable = true` (Edit or quick actions). In "Assign" dropdown, the movie **does** appear. Assign it to a date. Save. Row shows the movie title.

---

## 5. Gameplay behavior

- [ ] **Non-playable not in practice or autocomplete**  
  With movie `is_playable = false`, open the game. Practice mode: play multiple times (or refresh); the imported movie should not appear as the practice movie. In the guess input, typing the movie title should not suggest it in autocomplete (or it should not be in the suggestion set).

- [ ] **Approved + playable eligible**  
  Set movie to `is_playable = true`. Practice: it can appear as the random movie. Autocomplete: its title (and alias) can appear in suggestions. If you assigned it to today in schedule, Daily should show that movie for today.

---

## 6. Files / queries to inspect

| What | Where |
|------|--------|
| Import script (normalize + tagline cleanup) | `scripts/importMovie.ts` — `normalizeTitleForDedup`, `cleanTagline`, duplicate check, tagline skip. |
| Playable filter (practice) | `src/actions/movies.ts` — `getRandomPracticeMovie` (`.eq("is_playable", true)`). |
| Playable filter (autocomplete) | `src/actions/movies.ts` — `getAutocompleteTitles` (`.eq("is_playable", true)`). |
| Daily movie playable check | `src/actions/movies.ts` — `getDailyMovie` (checks `row.is_playable` after fetch). |
| Schedule dropdown (playable only) | `src/components/admin/AdminPanel.tsx` — `ScheduleBlock` uses `movies.filter((m) => m.is_playable)`. |
| Admin list + quick actions | `src/components/admin/AdminPanel.tsx` — status filter, Approve / Reject / Playable, Edit. |
| DB rows after import | Supabase: `movies`, `taglines`, `accepted_aliases` (query in section 2). |

---

## Sign-off

- [ ] All items above passed.  
- [ ] Single-movie pipeline is ready for batch-import design (Step 4).
