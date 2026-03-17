# Scripts

## importMovie.ts — Import one movie from TMDB (Step 3)

Imports a **single** movie from TMDB into Supabase as `pending_review` / not playable. Proof-of-concept for the ingestion pipeline.

### Required environment variables

| Variable | Description |
|----------|-------------|
| `TMDB_ACCESS_TOKEN` | TMDB API v4 Bearer token ([create at themoviedb.org](https://www.themoviedb.org/settings/api)) |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS for inserts) |

You can set these in a `.env` file in the project root; the script loads `.env` automatically.

### How to run

From the project root:

```bash
npx tsx scripts/importMovie.ts "Movie Title"
```

If `tsx` is not installed:

```bash
npm install -D tsx
npx tsx scripts/importMovie.ts "Movie Title"
```

### Example

```bash
npx tsx scripts/importMovie.ts "Back to the Future"
```

### Behavior

1. Searches TMDB by title and picks the first (best) result.
2. Fetches movie details and credits.
3. **Skips** if TMDB tagline is empty.
4. **Skips** if a movie with the same title and year already exists in `movies`.
5. Inserts into `movies` (title, year, genre, cast_hint, plot_hint, poster_path, status=`pending_review`, is_playable=`false`).
6. Inserts one row into `taglines` (primary tagline from TMDB).
7. Inserts the canonical title into `accepted_aliases`.
8. Logs what it did.

No new DB columns; uses existing tables only.

---

## importMovieList.ts — Import starter movies

Imports every title in `scripts/starterMovies.ts` (one at a time, same logic as `importMovie.ts`). Skips duplicates and empty taglines. Uses a 400ms delay between requests to avoid rate limits.

### How to run

From the project root:

```bash
npx tsx scripts/importMovieList.ts
```

Same env as `importMovie.ts` is required. You can edit the list in `scripts/starterMovies.ts`.
