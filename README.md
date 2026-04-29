# Taglines — Movie Guessing Game

A daily movie guessing game inspired by Framed, based on movie taglines. Guess the film from the tagline; each wrong guess reveals another hint (genre, cast, plot, year). Max 5 guesses.

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — Movies, taglines, accepted aliases, daily schedule; optional (fallback to local sample data)

## Getting Started

```bash
npm install
cp .env.example .env   # optional: add Supabase + admin secret
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Daily mode** — One movie per day from Supabase schedule (or local fallback). Streak and history in `localStorage`.
- **Practice mode** — Random movie from Supabase or local sample set.
- **Broad autocomplete catalog** — TMDB-derived local catalog powers suggestions through server-side search (client receives only top matches); guess validation still uses current playable answer logic.
- **Answer normalization** — Ignores capitalization and punctuation; handles “Part I”/“Part 1” and leading “The”; accepts configured aliases.
- **Admin** — `/admin`: create/edit movies, taglines, accepted aliases, and daily schedule (password-protected via `ADMIN_SECRET`).
- **Share** — Emoji-style results (e.g. 🎬 Taglines ✅ ❌ ❌ ✅).
- **Opening beat** — At the start of each new puzzle session (daily or practice), the tagline stays in the usual layout while guess input, hints strip, and guess history are withheld for about 3.5 seconds, then they fade in together. This phase runs once per session key (not on every React update). Users with **prefers-reduced-motion** get the normal layout immediately with no timed delay.

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration: `supabase/migrations/20250314000000_initial_schema.sql` in the SQL editor (or use Supabase CLI).
3. Add to `.env`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (for admin write access)
4. Set `ADMIN_SECRET` (min 8 chars) to protect `/admin`.

Without Supabase, the game uses hardcoded sample movies and a date-seeded daily pick.

## Build suggestion catalog (TMDB)

Create/update `src/data/suggestionCatalog.json` (default target: 5,000 titles):

```bash
TMDB_ACCESS_TOKEN=... npm run build:suggestions
```

Optional tuning:

- `TMDB_SUGGESTION_TARGET` (default `5000`)
- `TMDB_MAX_PAGES` (default `250`)
- `TMDB_MIN_RELEASE_YEAR` (default `1950`)
- `TMDB_MIN_VOTE_COUNT` (default `200`)

## Autocomplete architecture

- Suggestion catalog lives in `src/data/suggestionCatalog.json` and is generated ahead of time.
- Guess input calls a server action once query length reaches 3+ normalized characters.
- Server ranks and returns top 5 matches; full catalog is never sent to the client.
- Playable titles are still merged into the suggestion set server-side to guarantee coverage.

## Project Structure

```
src/
├── app/
│   ├── admin/page.tsx   # Admin-only CRUD (movies, taglines, schedule)
│   ├── layout.tsx, page.tsx, globals.css
├── actions/
│   ├── movies.ts       # getDailyMovie, getRandomPracticeMovie, listMovies, getSchedule
│   ├── admin.ts        # adminCreateMovie, adminSetTaglines, adminSetDailyMovie, etc.
│   └── auth.ts         # loginAdmin, logoutAdmin
├── components/
│   ├── admin/AdminPanel.tsx, AdminLoginForm.tsx
│   ├── GameScreen.tsx, HintReveal.tsx, ResultModal.tsx
├── data/movies.ts      # Sample movies + getTodayKey (local fallback)
├── data/suggestionCatalog.json  # Local autocomplete suggestion catalog
├── hooks/useGameState.ts
├── lib/
│   ├── answerNormalize.ts  # normalizeForComparison, isGuessCorrect
│   ├── movieFromDb.ts      # Map DB rows → game Movie
│   ├── adminAuth.ts        # Cookie-based admin gate
│   ├── storage.ts, share.ts
│   └── supabase/client.ts, server.ts
├── types/movie.ts, database.ts
└── supabase/migrations/   # movies, taglines, accepted_aliases, daily_schedule
```

## Data Model (Supabase)

- **movies** — `id`, `title`, `year`, `genre`, `cast_hint`, `plot_hint`
- **taglines** — `movie_id`, `tagline_text`, `is_primary` (one primary per movie)
- **accepted_aliases** — `movie_id`, `alias` (accepted answers besides title)
- **daily_schedule** — `scheduled_date` (PK), `movie_id`

## Build

```bash
npm run build
npm start
```
