"use client";

import { useCallback, useMemo, useState } from "react";
import type { MovieRow } from "@/lib/movieFromDb";
import type { DbDailySchedule } from "@/types/database";
import { getSchedule, listMovies } from "@/actions/movies";
import {
  adminCreateMovie,
  adminUpdateMovie,
  adminDeleteMovie,
  adminSetTaglines,
  adminSetAliases,
  adminSetDailyMovie,
  adminRemoveDailyMovie,
} from "@/actions/admin";
import { logoutAdmin } from "@/actions/auth";
import Link from "next/link";

type StatusFilter = "all" | "pending_review" | "approved" | "rejected";

interface AdminPanelProps {
  initialMovies: MovieRow[];
  initialSchedule: DbDailySchedule[];
}

export function AdminPanel({ initialMovies, initialSchedule }: AdminPanelProps) {
  const [movies, setMovies] = useState<MovieRow[]>(initialMovies);
  const [schedule, setSchedule] = useState<DbDailySchedule[]>(initialSchedule);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const displayMovies = useMemo(() => {
    let list = movies;
    if (statusFilter !== "all") {
      list = list.filter((m) => m.status === statusFilter);
    }
    const order: Record<string, number> = { pending_review: 0, approved: 1, rejected: 2 };
    return [...list].sort((a, b) => {
      const ai = order[a.status] ?? 3;
      const bi = order[b.status] ?? 3;
      if (ai !== bi) return ai - bi;
      return (a.title ?? "").localeCompare(b.title ?? "", "en", { sensitivity: "base" });
    });
  }, [movies, statusFilter]);

  const refreshMovies = useCallback(async () => {
    const list = await listMovies();
    setMovies(list);
  }, []);
  const refreshSchedule = useCallback(async () => {
    const list = await getSchedule(60);
    setSchedule(list);
  }, []);

  const handleCreateMovie = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const res = await adminCreateMovie({
      title: (form.elements.namedItem("title") as HTMLInputElement).value.trim(),
      year: parseInt((form.elements.namedItem("year") as HTMLInputElement).value, 10),
      genre: (form.elements.namedItem("genre") as HTMLInputElement).value.trim(),
      cast_hint: (form.elements.namedItem("cast_hint") as HTMLInputElement).value.trim(),
      plot_hint: (form.elements.namedItem("plot_hint") as HTMLInputElement).value.trim(),
    });
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setCreating(false);
    await refreshMovies();
    setEditingId(res.id);
  };

  const handleUpdateMovie = async (id: string, payload: { title: string; year: number; genre: string; cast_hint: string; plot_hint: string; poster_url?: string | null; poster_path?: string | null; status?: string; is_playable?: boolean }) => {
    setError(null);
    const res = await adminUpdateMovie(id, payload);
    if (res.error) {
      setError(res.error);
      return;
    }
    await refreshMovies();
  };

  const handleDeleteMovie = async (id: string) => {
    if (!confirm("Delete this movie? This will remove its taglines, aliases, and schedule entries.")) return;
    setError(null);
    const res = await adminDeleteMovie(id);
    if (res.error) setError(res.error);
    else {
      setEditingId(null);
      await refreshMovies();
      await refreshSchedule();
    }
  };

  const handleSetTaglines = async (movieId: string, taglines: { tagline_text: string; is_primary: boolean }[]) => {
    setError(null);
    const res = await adminSetTaglines(movieId, taglines);
    if (res.error) setError(res.error);
    else await refreshMovies();
  };

  const handleSetAliases = async (movieId: string, aliases: string[]) => {
    setError(null);
    const res = await adminSetAliases(movieId, aliases);
    if (res.error) setError(res.error);
    else await refreshMovies();
  };

  const handleSetDaily = async (date: string, movieId: string) => {
    setError(null);
    const res = await adminSetDailyMovie(date, movieId);
    if (res.error) setError(res.error);
    else await refreshSchedule();
  };

  const handleRemoveDaily = async (date: string) => {
    setError(null);
    const res = await adminRemoveDailyMovie(date);
    if (res.error) setError(res.error);
    else await refreshSchedule();
  };

  const handleQuickStatus = useCallback(async (id: string, status: "approved" | "rejected") => {
    setError(null);
    const res = await adminUpdateMovie(id, { status, is_playable: status === "approved" });
    if (res.error) setError(res.error);
    else setMovies((prev) => prev.map((m) => (m.id === id ? { ...m, status, is_playable: status === "approved" } : m)));
  }, []);

  const handleQuickTogglePlayable = useCallback(async (id: string, current: boolean) => {
    setError(null);
    const res = await adminUpdateMovie(id, { is_playable: !current });
    if (res.error) setError(res.error);
    else setMovies((prev) => prev.map((m) => (m.id === id ? { ...m, is_playable: !current } : m)));
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm">← Game</Link>
          <h1 className="text-2xl font-semibold text-white mt-1">Admin</h1>
        </div>
        <form action={logoutAdmin}>
          <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-300">
            Log out
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-rose-500/20 border border-rose-500/50 text-rose-300 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-medium text-white mb-4">Movies</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-zinc-500">Status:</span>
          {(["all", "pending_review", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                statusFilter === f
                  ? "bg-amber-500/30 text-amber-200 border border-amber-500/50"
                  : "bg-white/5 text-zinc-400 border border-white/10 hover:text-zinc-300"
              }`}
            >
              {f === "all" ? "All" : f.replace("_", " ")}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {displayMovies.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-white">{m.title} ({m.year})</span>
              <span className="text-xs text-zinc-500">
                {m.status ?? "—"} · {m.is_playable ? "playable" : "not playable"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {m.status === "pending_review" && (
                  <>
                    <button type="button" onClick={() => handleQuickStatus(m.id, "approved")} className="text-xs text-emerald-400 hover:text-emerald-300">Approve</button>
                    <button type="button" onClick={() => handleQuickStatus(m.id, "rejected")} className="text-xs text-rose-400 hover:text-rose-300">Reject</button>
                  </>
                )}
                <button type="button" onClick={() => handleQuickTogglePlayable(m.id, m.is_playable)} className="text-xs text-zinc-400 hover:text-zinc-300">
                  {m.is_playable ? "Unplayable" : "Playable"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                  className="text-sm text-amber-400 hover:text-amber-300"
                >
                  {editingId === m.id ? "Cancel" : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteMovie(m.id)}
                  className="text-sm text-rose-400 hover:text-rose-300"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        {creating ? (
          <MovieForm
            onCancel={() => setCreating(false)}
            onSubmit={handleCreateMovie}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 px-4 py-2 text-sm hover:bg-amber-500/30"
          >
            + Add movie
          </button>
        )}

        {editingId && (
          <MovieEditForm
            movieId={editingId}
            movies={movies}
            onClose={() => setEditingId(null)}
            onUpdate={handleUpdateMovie}
            onSetTaglines={handleSetTaglines}
            onSetAliases={handleSetAliases}
          />
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-white mb-4">Daily schedule</h2>
        <ScheduleBlock
          schedule={schedule}
          movies={movies}
          onAssign={handleSetDaily}
          onRemove={handleRemoveDaily}
          onRefresh={refreshSchedule}
        />
      </section>
    </div>
  );
}

function MovieForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      <input name="title" placeholder="Title" required className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white placeholder-zinc-500" />
      <input name="year" type="number" placeholder="Year" required min={1800} max={2100} className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white placeholder-zinc-500" />
      <input name="genre" placeholder="Genre" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white placeholder-zinc-500" />
      <input name="cast_hint" placeholder="Cast hint" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white placeholder-zinc-500" />
      <textarea name="plot_hint" placeholder="Plot hint" rows={2} className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white placeholder-zinc-500 resize-none" />
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-amber-500 text-zinc-900 px-4 py-2 text-sm font-medium">Create</button>
        <button type="button" onClick={onCancel} className="rounded border border-white/20 text-zinc-300 px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}

function MovieEditForm({
  movieId,
  movies,
  onClose,
  onUpdate,
  onSetTaglines,
  onSetAliases,
}: {
  movieId: string;
  movies: MovieRow[];
  onClose: () => void;
  onUpdate: (id: string, p: { title: string; year: number; genre: string; cast_hint: string; plot_hint: string; poster_url?: string | null; poster_path?: string | null; status?: string; is_playable?: boolean }) => void;
  onSetTaglines: (id: string, t: { tagline_text: string; is_primary: boolean }[]) => void;
  onSetAliases: (id: string, a: string[]) => void;
}) {
  const m = movies.find((x) => x.id === movieId);
  const [title, setTitle] = useState(m?.title ?? "");
  const [year, setYear] = useState(m?.year ?? 0);
  const [genre, setGenre] = useState(m?.genre ?? "");
  const [castHint, setCastHint] = useState(m?.cast_hint ?? "");
  const [plotHint, setPlotHint] = useState(m?.plot_hint ?? "");
  const [posterPath, setPosterPath] = useState((m as { poster_path?: string | null })?.poster_path ?? "");
  const [posterUrl, setPosterUrl] = useState((m as { poster_url?: string | null })?.poster_url ?? "");
  const [status, setStatus] = useState(m?.status ?? "pending_review");
  const [isPlayable, setIsPlayable] = useState(m?.is_playable ?? false);
  const [primaryTagline, setPrimaryTagline] = useState(m?.taglines?.find((t) => t.is_primary)?.tagline_text ?? "");
  const [otherTaglines, setOtherTaglines] = useState<string[]>(m?.taglines?.filter((t) => !t.is_primary).map((t) => t.tagline_text) ?? []);
  const [aliasText, setAliasText] = useState((m?.aliases ?? []).join("\n"));

  if (!m) return null;

  const handleSave = () => {
    onUpdate(movieId, {
      title,
      year,
      genre,
      cast_hint: castHint,
      plot_hint: plotHint,
      poster_path: posterPath.trim() || null,
      poster_url: posterUrl.trim() || null,
      status,
      is_playable: isPlayable,
    });
    const taglines: { tagline_text: string; is_primary: boolean }[] = [];
    if (primaryTagline.trim()) taglines.push({ tagline_text: primaryTagline.trim(), is_primary: true });
    otherTaglines.forEach((t) => {
      if (t.trim()) taglines.push({ tagline_text: t.trim(), is_primary: false });
    });
    onSetTaglines(movieId, taglines);
    const aliasList = aliasText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    onSetAliases(movieId, aliasList);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-white mb-4">Edit movie</h3>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white" />
          <input type="number" value={year || ""} onChange={(e) => setYear(parseInt(e.target.value, 10) || 0)} placeholder="Year" min={1800} max={2100} className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white" />
          <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Genre" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white" />
          <input value={castHint} onChange={(e) => setCastHint(e.target.value)} placeholder="Cast hint" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white" />
          <textarea value={plotHint} onChange={(e) => setPlotHint(e.target.value)} placeholder="Plot hint" rows={2} className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white resize-none" />
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white text-sm">
              <option value="pending_review">pending_review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_playable" checked={isPlayable} onChange={(e) => setIsPlayable(e.target.checked)} className="rounded border-white/20" />
            <label htmlFor="is_playable" className="text-sm text-zinc-300">Playable (can appear in game and schedule)</label>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">TMDB poster path (optional)</label>
            <input value={posterPath} onChange={(e) => setPosterPath(e.target.value)} placeholder="/kqjL17yufvn9OVLyXYpvtyrFfak.jpg" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white font-mono text-sm" />
            <p className="mt-1 text-xs text-zinc-500">From TMDB; e.g. /abc123.jpg. Uses w500 size.</p>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Poster URL fallback (optional)</label>
            <input value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="https://..." type="url" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Primary tagline</label>
            <input value={primaryTagline} onChange={(e) => setPrimaryTagline(e.target.value)} placeholder="Official tagline" className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Other taglines</label>
            {otherTaglines.map((t, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={t} onChange={(e) => { const n = [...otherTaglines]; n[i] = e.target.value; setOtherTaglines(n); }} className="flex-1 rounded bg-white/10 border border-white/10 px-3 py-2 text-white" />
                <button type="button" onClick={() => setOtherTaglines(otherTaglines.filter((_, j) => j !== i))} className="text-rose-400 text-sm">Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setOtherTaglines([...otherTaglines, ""])} className="text-sm text-amber-400">+ Add tagline</button>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Accepted aliases (one per line or comma)</label>
            <textarea value={aliasText} onChange={(e) => setAliasText(e.target.value)} placeholder="One per line or comma: Shawshank Redemption, Shawshank" rows={3} className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-white resize-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={handleSave} className="rounded bg-amber-500 text-zinc-900 px-4 py-2 text-sm font-medium">Save</button>
          <button type="button" onClick={onClose} className="rounded border border-white/20 text-zinc-300 px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

function ScheduleBlock({
  schedule,
  movies,
  onAssign,
  onRemove,
  onRefresh,
}: {
  schedule: DbDailySchedule[];
  movies: MovieRow[];
  onAssign: (date: string, movieId: string) => void;
  onRemove: (date: string) => void;
  onRefresh: () => void;
}) {
  const next14 = (() => {
    const out: string[] = [];
    const d = new Date();
    for (let i = 0; i < 14; i++) {
      const x = new Date(d);
      x.setDate(x.getDate() + i);
      out.push(x.toISOString().slice(0, 10));
    }
    return out;
  })();
  const scheduleMap = new Map(schedule.map((s) => [s.scheduled_date, s.movie_id]));

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-zinc-500 mb-4">Assign a movie to a date. Only the first movie per date is used for the daily game.</p>
      <div className="space-y-2 mb-4">
        {next14.map((date) => {
          const movieId = scheduleMap.get(date);
          const movie = movieId ? movies.find((m) => m.id === movieId) : null;
          return (
            <div key={date} className="flex items-center justify-between gap-4 py-2 border-b border-white/5">
              <span className="text-zinc-400 font-mono text-sm">{date}</span>
              {movie ? (
                <>
                  <span className="text-white flex-1 truncate">{movie.title}</span>
                  <button type="button" onClick={() => onRemove(date)} className="text-sm text-rose-400 hover:text-rose-300">Remove</button>
                </>
              ) : (
                <select
                  className="flex-1 rounded bg-white/10 border border-white/10 px-3 py-1.5 text-white text-sm"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) onAssign(date, id);
                  }}
                >
                  <option value="">— Assign —</option>
                  {movies.filter((m) => m.is_playable).map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={onRefresh} className="text-sm text-zinc-500 hover:text-zinc-300">Refresh schedule</button>
    </div>
  );
}
