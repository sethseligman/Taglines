import { NextRequest, NextResponse } from "next/server";

interface TmdbMovieSearchResult {
  id: number;
  title: string;
  release_date?: string;
}

interface TmdbMovieDetails {
  imdb_id?: string | null;
  vote_average?: number;
  credits?: {
    cast?: Array<{ id: number; name: string }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string }>;
  };
}

interface TmdbPersonExternalIds {
  imdb_id?: string | null;
}

async function tmdbFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function getPersonImdbId(personId: number, token: string): Promise<string | null> {
  try {
    const data = await tmdbFetch<TmdbPersonExternalIds>(`/person/${personId}/external_ids`, token);
    return data.imdb_id ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TMDB token not configured" }, { status: 500 });
  }

  const title = request.nextUrl.searchParams.get("title")?.trim();
  const year = request.nextUrl.searchParams.get("year")?.trim();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const searchParams = new URLSearchParams({ query: title, include_adult: "false" });
    if (year) searchParams.set("year", year);
    const search = await tmdbFetch<{ results?: TmdbMovieSearchResult[] }>(
      `/search/movie?${searchParams.toString()}`,
      token
    );
    const best = search.results?.[0];
    if (!best?.id) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const details = await tmdbFetch<TmdbMovieDetails>(
      `/movie/${best.id}?append_to_response=credits`,
      token
    );

    const movieImdbId = details.imdb_id ?? null;
    const imdbRating =
      typeof details.vote_average === "number" && Number.isFinite(details.vote_average)
        ? Number(details.vote_average.toFixed(1))
        : null;

    const director = details.credits?.crew?.find((c) => c.job === "Director");
    const topCast = (details.credits?.cast ?? []).slice(0, 3);

    const [directorImdbId, ...castImdbIds] = await Promise.all([
      director?.id ? getPersonImdbId(director.id, token) : Promise.resolve(null),
      ...topCast.map((person) => getPersonImdbId(person.id, token)),
    ]);

    return NextResponse.json({
      ok: true,
      movieImdbId,
      imdbRating,
      director: director
        ? {
            name: director.name,
            imdbId: directorImdbId,
          }
        : null,
      cast: topCast.map((person, idx) => ({
        name: person.name,
        imdbId: castImdbIds[idx] ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
