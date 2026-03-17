# Admin panel: Edit-open performance audit

Narrow audit of the **movie list → click Edit → modal opens** flow. No redesign, no architecture change.

---

## 1. What happens when you click Edit on a movie row

**Component that handles the click**

- `AdminPanel` (src/components/admin/AdminPanel.tsx). The Edit button is inline in the list:
  - `onClick={() => setEditingId(editingId === m.id ? null : m.id)}`
  - So the only thing that runs on click is **one state update**: `setEditingId(m.id)` (or `null` if toggling off).

**State updates**

- `editingId` goes from `null` to the movie’s `id` (or the opposite when closing).
- No other state is set on click. No `refreshMovies()` or any async work is triggered by opening the modal.

**Where the data comes from**

- The modal does **not** trigger any new request. It uses the existing in-memory `movies` array:
  - `AdminPanel` passes `movies={movies}` and `movieId={editingId}` to `MovieEditForm`.
  - `MovieEditForm` does `const m = movies.find((x) => x.id === movieId)` and initializes all form state from `m`.
- So opening the modal is **purely client-side**: one `setState` → one re-render → modal mounts and reads from `movies`.

**Effects on modal open**

- `MovieEditForm` has **no useEffect**. It only uses `useState(initialValue)` with values derived from `m` (the found movie). So no effects run when the modal opens.

**Summary**

- Click → `setEditingId(id)` → React re-renders `AdminPanel` → `MovieEditForm` mounts with `movies` and `movieId`, does one `.find()` and ~12 `useState` initializers, renders the form. No network, no effects.

---

## 2. Likely causes of slowness when the list has grown

1. **Full list re-render on every Edit click**  
   When `setEditingId` runs, the whole `AdminPanel` re-renders. The list is rendered as `displayMovies.map((m) => <li>...</li>)` with no memoization. So **every list row** (100+ items) is re-rendered on that single state change. Each row has several buttons and inline handlers; React has to reconcile the entire list even though only `editingId` changed.

2. **Heavy modal initial render**  
   `MovieEditForm` has many controlled inputs and a lot of DOM. Mounting it in one go adds work, but the dominant cost is likely the list re-render, not the modal alone.

3. **No extra work from data**  
   `.find()` over 100 items and initializing form state from one object is cheap. Passing the full `movies` array into the modal doesn’t by itself cause re-renders of the list; the list re-renders because the **parent** (`AdminPanel`) re-rendered when `editingId` changed.

---

## 3. Where the bottleneck likely is

| Candidate | Likely? | Notes |
|-----------|--------|--------|
| **Client-side rendering / state work** | **Yes** | One state update forces a full AdminPanel (and thus full list) re-render. |
| **Unnecessary re-renders** | **Yes** | Every list row re-renders when only `editingId` changed; rows don’t need to. |
| **Expensive list operations** | No | `displayMovies` is memoized; one `.find()` in the modal is trivial. |
| **Modal/form initialization** | Some | Non-trivial but secondary to re-rendering 100+ rows. |
| **Supabase/network** | No | No request is made when opening the modal. |

**Conclusion:** The main bottleneck is **unnecessary re-renders**: the entire movie list re-renders on every Edit click because the list is not memoized and the parent re-renders.

---

## 4. Top 3 smallest, safest improvements

1. **Memoize the list row (highest impact, low risk)**  
   Extract each list item into a small component wrapped in `React.memo`. Pass only the props that row needs (movie, `isEditing`, and stable callbacks). When `editingId` changes, only the row whose `isEditing` changed (the one you clicked, or the one that was open and you closed) will re-render; the rest keep the same props and are skipped by React. No API changes, no new state, minimal code change.

2. **Pass the editing movie into the modal instead of the full list**  
   In `AdminPanel`, compute `editingMovie = movies.find(m => m.id === editingId)` (e.g. in a `useMemo` on `[movies, editingId]`) and pass `editingMovie` (or `null`) to `MovieEditForm` instead of `movies` + `movieId`. The modal then doesn’t receive the full array or do a `.find()`. This trims a bit of work and keeps modal props smaller; it’s a small, safe cleanup.

3. **Defer modal content with startTransition (optional)**  
   Wrap `setEditingId` in `startTransition` so React can treat the update as non-urgent and keep the list responsive while the modal appears. This can make the UI feel snappier without changing structure, but the main gain will still come from (1).

---

## 5. One obvious low-risk fix: implementation prompt

Use this to implement **only** the memoized list row (improvement #1):

---

**Implementation prompt (copy-paste):**

In `src/components/admin/AdminPanel.tsx`, extract the movie list item into a memoized component so that clicking Edit does not re-render every row.

1. Define a new component `MovieRow` (or `AdminMovieRow`) that accepts props: `movie` (one `MovieRow`), `isEditing` (boolean: `editingId === movie.id`), and handlers: `onEdit`, `onDelete`, `onQuickStatus`, `onQuickTogglePlayable`. Each handler can take the needed args (e.g. `onEdit: (id: string) => void`).

2. Render the same current list-item content inside this component (title, status text, Approve/Reject/Playable/Edit/Delete buttons). Use the `movie` and `isEditing` props; call the handlers with `movie.id` or `movie.is_playable` where needed.

3. Wrap the component in `React.memo` so it only re-renders when its props change.

4. In the parent, ensure the handlers passed to the row are stable: use `useCallback` for any handler that isn’t already (e.g. a single `onEdit` that receives `id` and calls `setEditingId(id)`). Pass `editingId` only indirectly by passing `isEditing={editingId === movie.id}` so each row gets a boolean that changes only for the row that is open or just closed.

5. In the list, replace the inline `<li>...</li>` with `<MovieRow key={m.id} movie={m} isEditing={editingId === m.id} onEdit={...} onDelete={...} ... />`. Do not change the modal, the schedule block, or any other behavior.

Goal: when the user clicks Edit, only the clicked row (and optionally the previously editing row) re-renders; the rest of the list does not. No new state, no API changes, no redesign.

---

End of audit.
