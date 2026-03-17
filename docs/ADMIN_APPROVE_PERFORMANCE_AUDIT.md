# Admin Approve / Reject / Playable — performance audit

Narrow audit of the **click Approve (or Reject / Playable toggle) → long “rendering” delay** path. Not the edit-modal-open path.

---

## 1. Exact action path when you click Approve

**Component handler**

- `AdminPanel` in `src/components/admin/AdminPanel.tsx`.
- The Approve button calls `handleQuickStatus(m.id, "approved")` (line ~195).
- `handleQuickStatus` is defined at lines 127–132:

```ts
const handleQuickStatus = useCallback(async (id: string, status: "approved" | "rejected") => {
  setError(null);
  const res = await adminUpdateMovie(id, { status });
  if (res.error) setError(res.error);
  else await refreshMovies();
}, [refreshMovies]);
```

**Server action**

- `adminUpdateMovie(id, { status })` in `src/actions/admin.ts`.
- It does a single Supabase update: `supabase.from("movies").update(payload).eq("id", id)`.
- Returns `{ error?: string }` only (no updated row).

**After the action resolves**

- If there is an error: `setError(res.error)` and stop.
- If success: **`await refreshMovies()`** is called.

**What `refreshMovies()` does**

- Defined in AdminPanel (lines 48–51): `const refreshMovies = useCallback(async () => { const list = await listMovies(); setMovies(list); }, []);`
- So it calls **`listMovies()`** (server action in `src/actions/movies.ts`), then `setMovies(list)`.

**Is `router.refresh()` or `revalidatePath()` involved?**

- **No.** Grep shows no `revalidatePath` or `router.refresh` in the codebase. The delay is not from Next route revalidation.

**Other state changes / rerenders**

- After `refreshMovies()` resolves: `setMovies(list)` runs with the **full** new list. That triggers one large client re-render (list + schedule block). The expensive part is **waiting for** `listMovies()`, not the subsequent re-render.

**Reject and Playable toggle**

- Same pattern: `handleQuickStatus(id, "rejected")` or `handleQuickTogglePlayable(id, current)` → `adminUpdateMovie(...)` → on success **`await refreshMovies()`**.

So the only difference between the three actions is the payload; in all cases success leads to a full **`refreshMovies()`** → **`listMovies()`** → then `setMovies(list)`.

---

## 2. Likely bottleneck

**What `listMovies()` does** (`src/actions/movies.ts`, lines 96–107):

```ts
export async function listMovies(): Promise<MovieRow[]> {
  // ...
  const { data: movies } = await supabase.from("movies").select("*").order("title");
  if (!movies?.length) return [];
  const rows: MovieRow[] = [];
  for (const m of movies as DbMovie[]) {
    const row = await fetchMovieRow(supabase, m.id);  // sequential!
    if (row) rows.push(row);
  }
  return rows;
}
```

**What `fetchMovieRow()` does** (lines 64–86):

- One query: `movies` by id (single row).
- One query: `taglines` for that `movie_id`.
- One query: `accepted_aliases` for that `movie_id`.

So for **N** movies, `listMovies()` does:

- **1** query to get all movie ids/rows.
- **N × 3** sequential queries (each `fetchMovieRow` does 3 round-trips).

With ~100 movies that is **1 + 300 = 301 sequential** Supabase round-trips. At ~50–100 ms per round-trip, that is **15–30 seconds**, which matches the ~20 s “rendering” the user sees (the UI is blocked waiting on this server action).

**Conclusion**

| Candidate | Likely? |
|-----------|--------|
| Supabase update itself (single row) | No — that’s one fast call. |
| Server action round-trip for `adminUpdateMovie` | No — one quick round-trip. |
| **refreshMovies → listMovies() refetching everything** | **Yes — 301 sequential DB calls.** |
| route refresh / revalidation | No — not used. |
| Rerendering large client tree after refetch | Contributes only after the slow fetch; not the main delay. |

The bottleneck is **`refreshMovies()`** calling **`listMovies()`**, which refetches the entire list with an N+1 pattern (1 + N×3 sequential queries).

---

## 3. Timing suspects (exact files/functions)

| File | Function / place | Role in delay |
|------|-------------------|----------------|
| `src/components/admin/AdminPanel.tsx` | `handleQuickStatus`, `handleTogglePlayable` | After success, call `await refreshMovies()`, so the UI waits for the full refetch. |
| `src/components/admin/AdminPanel.tsx` | `refreshMovies` | Calls `listMovies()` then `setMovies(list)`. Entry point for the heavy work. |
| `src/actions/movies.ts` | `listMovies()` | Fetches all movies, then runs a **sequential** `for` loop over every movie. |
| `src/actions/movies.ts` | `fetchMovieRow()` | Called once per movie (3 round-trips each). With ~100 movies this is ~300 sequential round-trips. |

The long delay is almost entirely from **`listMovies()`** in `src/actions/movies.ts` (and its use of `fetchMovieRow` per movie), triggered by **`refreshMovies()`** in `AdminPanel` after Approve/Reject/Playable.

---

## 4. Smallest safe fix

**Recommendation: avoid full refresh after quick actions; update the one movie in client state.**

- After a successful **Approve** or **Reject**, we know the new `status`; after a successful **Playable** toggle, we know the new `is_playable`.
- Do **not** call `refreshMovies()` for these three handlers. Instead, update the `movies` state in place for that one row:
  - Approve: `setMovies(prev => prev.map(m => m.id === id ? { ...m, status: "approved" } : m))`
  - Reject: same with `status: "rejected"`.
  - Playable toggle: `setMovies(prev => prev.map(m => m.id === id ? { ...m, is_playable: !current } : m))`.
- No refetch, no N+1, no extra server round-trips. The list and schedule block stay consistent for that row; the rest of the list is unchanged. Risk is low (single-editor admin; server remains source of truth on next full load or navigation).

**Other options (not chosen as the single best here):**

- Refetch only the one movie and merge: would still add 1–3 round-trips and more code; slower than in-place update.
- Optimistic update before the server call: would require reverting on error and is more code for the same UX after success; the current “update in place after success” is simpler and sufficient.

---

## 5. Implementation prompt (single fix)

Use this in Cursor to implement **only** the in-place state update for Approve / Reject / Playable (no full refresh).

---

**Implementation prompt (copy-paste):**

In `src/components/admin/AdminPanel.tsx`, make Approve, Reject, and Playable toggle feel instant by updating the movie list in place after a successful server action instead of refetching the entire list.

Current behavior: `handleQuickStatus` and `handleQuickTogglePlayable` call `await refreshMovies()` on success, which calls `listMovies()` and triggers hundreds of sequential Supabase round-trips, causing a long “rendering” delay.

Change only these two handlers:

1. **handleQuickStatus(id, status)**  
   After `const res = await adminUpdateMovie(id, { status });`:
   - If `res.error`, call `setError(res.error)` and return.
   - If success, do **not** call `refreshMovies()`. Instead update local state:  
     `setMovies(prev => prev.map(m => m.id === id ? { ...m, status } : m));`

2. **handleQuickTogglePlayable(id, current)**  
   After `const res = await adminUpdateMovie(id, { is_playable: !current });`:
   - If `res.error`, call `setError(res.error)` and return.
   - If success, do **not** call `refreshMovies()`. Instead update local state:  
     `setMovies(prev => prev.map(m => m.id === id ? { ...m, is_playable: !current } : m));`

Do not change any other handlers (Edit, Delete, Save from modal, schedule, etc.). Do not add new functions or refactor elsewhere. The list and schedule dropdown will still reflect the updated status/playable for that row because they read from `movies` state.

---

End of audit.
