"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MovieRow } from "@/lib/movieFromDb";
import type { ChallengeType, DbChallenge } from "@/types/challenges";
import {
  addMovieToChallenge,
  createChallenge,
  getChallengeMovies,
  getChallenges,
  publishChallenge,
  removeMovieFromChallenge,
  reorderChallengeMovies,
  unpublishChallenge,
  updateChallenge,
  type ChallengeMovieRow,
} from "@/actions/challenges";

interface ChallengesSectionProps {
  initialChallenges: DbChallenge[];
  movies: MovieRow[];
  onError: (message: string | null) => void;
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ChallengesSection({ initialChallenges, movies, onError }: ChallengesSectionProps) {
  const [challenges, setChallenges] = useState<DbChallenge[]>(initialChallenges);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const playableMovies = useMemo(
    () => movies.filter((m) => m.is_playable).sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" })),
    [movies]
  );

  const refreshChallenges = useCallback(async () => {
    const list = await getChallenges();
    setChallenges(list);
  }, []);

  const handlePublishToggle = async (challenge: DbChallenge) => {
    onError(null);
    if (challenge.is_published) {
      const res = await unpublishChallenge(challenge.id);
      if (res.error) {
        onError(res.error);
        return;
      }
      setChallenges((prev) =>
        prev.map((c) => (c.id === challenge.id ? { ...c, is_published: false } : c))
      );
      return;
    }

    const res = await publishChallenge(challenge.id);
    if (res.error) {
      const details = [
        res.error,
        res.blockingMovies?.length
          ? `Not playable: ${res.blockingMovies.map((m) => `${m.title} (${m.year})`).join(", ")}`
          : null,
        res.poolCount !== undefined && challenge.type === "daily_pool"
          ? `Pool size: ${res.poolCount}`
          : null,
      ]
        .filter(Boolean)
        .join(" — ");
      onError(details);
      return;
    }
    setChallenges((prev) =>
      prev.map((c) => (c.id === challenge.id ? { ...c, is_published: true } : c))
    );
  };

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-foreground">Challenges</h2>
        {!creating && !editingId && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-lg bg-gold/20 border border-gold/50 text-gold px-4 py-2 text-sm hover:bg-gold/30"
          >
            + Create challenge
          </button>
        )}
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-muted">
          No challenges yet. Create one to build the Indiana Jones completion challenge.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Eyebrow</th>
                <th className="px-4 py-3 font-medium">Legs</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Sort</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {challenges.map((c) => (
                <tr key={c.id} className="bg-white/[0.02]">
                  <td className="px-4 py-3 text-foreground">{c.title}</td>
                  <td className="px-4 py-3 text-muted">{c.type}</td>
                  <td className="px-4 py-3 text-muted">{c.eyebrow ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.leg_count}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                        c.is_published
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-white/10 text-muted"
                      }`}
                    >
                      {c.is_published ? "Yes" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.portal_sort_order ?? "—"}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setEditingId(c.id);
                        }}
                        className="text-gold hover:text-gold/90"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePublishToggle(c)}
                        className="text-muted hover:text-foreground/80"
                      >
                        {c.is_published ? "Unpublish" : "Publish"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ChallengeForm
          mode="create"
          playableMovies={playableMovies}
          onCancel={() => setCreating(false)}
          onSaved={async (id) => {
            setCreating(false);
            await refreshChallenges();
            setEditingId(id);
          }}
          onError={onError}
        />
      )}

      {editingId && (
        <ChallengeForm
          mode="edit"
          challenge={challenges.find((c) => c.id === editingId) ?? null}
          playableMovies={playableMovies}
          onCancel={() => setEditingId(null)}
          onSaved={async () => {
            await refreshChallenges();
          }}
          onError={onError}
        />
      )}
    </section>
  );
}

function ChallengeForm({
  mode,
  challenge,
  playableMovies,
  onCancel,
  onSaved,
  onError,
}: {
  mode: "create" | "edit";
  challenge?: DbChallenge | null;
  playableMovies: MovieRow[];
  onCancel: () => void;
  onSaved: (id: string) => void | Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState(challenge?.title ?? "");
  const [slug, setSlug] = useState(challenge?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!challenge);
  const [eyebrow, setEyebrow] = useState(challenge?.eyebrow ?? "");
  const [type, setType] = useState<ChallengeType>(challenge?.type ?? "completion");
  const [legCount, setLegCount] = useState(challenge?.leg_count ?? 5);
  const [challengeMovies, setChallengeMovies] = useState<ChallengeMovieRow[]>([]);
  const [movieSearch, setMovieSearch] = useState("");
  const [loadingMovies, setLoadingMovies] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(challenge?.id ?? null);

  useEffect(() => {
    if (mode === "edit" && challenge?.id) {
      setLoadingMovies(true);
      getChallengeMovies(challenge.id)
        .then(setChallengeMovies)
        .catch((e) => onError(e instanceof Error ? e.message : "Failed to load movies"))
        .finally(() => setLoadingMovies(false));
    }
  }, [mode, challenge?.id, onError]);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugifyTitle(title));
    }
  }, [title, slugTouched]);

  const searchResults = useMemo(() => {
    const q = movieSearch.trim().toLowerCase();
    const selected = new Set(challengeMovies.map((m) => m.movie_id));
    return playableMovies
      .filter((m) => !selected.has(m.id))
      .filter((m) => !q || m.title.toLowerCase().includes(q))
      .slice(0, 12);
  }, [movieSearch, playableMovies, challengeMovies]);

  const ensureChallengeId = async (): Promise<string | null> => {
    if (draftId) return draftId;
    const payload = {
      title,
      slug,
      eyebrow: eyebrow.trim() || null,
      type,
      leg_count: legCount,
    };
    const res = await createChallenge(payload);
    if ("error" in res) {
      onError(res.error);
      return null;
    }
    setDraftId(res.id);
    return res.id;
  };

  const handleSaveDraft = async () => {
    onError(null);
    if (!title.trim() || !slug.trim()) {
      onError("Title and slug are required.");
      return;
    }
    if (legCount < 1) {
      onError("Leg count must be at least 1.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        slug,
        eyebrow: eyebrow.trim() || null,
        type,
        leg_count: legCount,
      };

      if (mode === "create" && !draftId) {
        const res = await createChallenge(payload);
        if ("error" in res) {
          onError(res.error);
          return;
        }
        setDraftId(res.id);
        await onSaved(res.id);
        return;
      }

      const id = draftId ?? challenge?.id;
      if (!id) {
        onError("Challenge ID missing.");
        return;
      }

      const res = await updateChallenge(id, payload);
      if (res.error) {
        onError(res.error);
        return;
      }
      await onSaved(id);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMovie = async (movieId: string) => {
    onError(null);
    setSaving(true);
    try {
      const challengeId = await ensureChallengeId();
      if (!challengeId) return;

      const res = await addMovieToChallenge(challengeId, movieId);
      if (res.error) {
        onError(res.error);
        return;
      }
      const updated = await getChallengeMovies(challengeId);
      setChallengeMovies(updated);
      setMovieSearch("");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMovie = async (movieId: string) => {
    const challengeId = draftId ?? challenge?.id;
    if (!challengeId) return;
    onError(null);
    setSaving(true);
    try {
      const res = await removeMovieFromChallenge(challengeId, movieId);
      if (res.error) {
        onError(res.error);
        return;
      }
      const updated = await getChallengeMovies(challengeId);
      setChallengeMovies(updated);
    } finally {
      setSaving(false);
    }
  };

  const moveMovie = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= challengeMovies.length) return;
    const challengeId = draftId ?? challenge?.id;
    if (!challengeId) return;

    const reordered = [...challengeMovies];
    const [item] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, item!);
    const orderedIds = reordered.map((m) => m.movie_id);

    onError(null);
    setSaving(true);
    try {
      const res = await reorderChallengeMovies(challengeId, orderedIds);
      if (res.error) {
        onError(res.error);
        return;
      }
      setChallengeMovies(reordered.map((m, i) => ({ ...m, position: i + 1 })));
    } finally {
      setSaving(false);
    }
  };

  const poolHint =
    type === "daily_pool"
      ? "Daily pool: add at least 30 playable movies. Order is not used for daily legs."
      : "Fixed leg order for this challenge.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-foreground mb-4">
          {mode === "create" ? "Create challenge" : "Edit challenge"}
        </h3>

        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-foreground"
          />
          <div>
            <label className="block text-xs text-muted mb-1">Slug</label>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="indiana-jones-completion"
              className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-foreground font-mono text-sm"
            />
          </div>
          <input
            value={eyebrow}
            onChange={(e) => setEyebrow(e.target.value)}
            placeholder="Eyebrow (optional)"
            className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-foreground"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ChallengeType)}
                className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-foreground text-sm"
              >
                <option value="completion">completion</option>
                <option value="daily_pool">daily_pool</option>
                <option value="one_off">one_off</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Leg count</label>
              <input
                type="number"
                min={1}
                value={legCount}
                onChange={(e) => setLegCount(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-foreground"
              />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-medium text-foreground mb-1">Movies</h4>
          <p className="text-xs text-muted mb-3">{poolHint}</p>

          <input
            value={movieSearch}
            onChange={(e) => setMovieSearch(e.target.value)}
            placeholder="Search playable movies by title…"
            className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-foreground text-sm mb-2"
          />

          {movieSearch.trim() && searchResults.length > 0 && (
            <ul className="mb-3 max-h-40 overflow-y-auto rounded border border-white/10 bg-white/5 divide-y divide-white/10">
              {searchResults.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-foreground">
                    {m.title} ({m.year})
                  </span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleAddMovie(m.id)}
                    className="text-xs text-gold hover:text-gold/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}

          {loadingMovies ? (
            <p className="text-sm text-muted">Loading movies…</p>
          ) : challengeMovies.length === 0 ? (
            <p className="text-sm text-muted rounded border border-dashed border-white/15 px-3 py-4 text-center">
              No movies added yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {challengeMovies.map((m, index) => (
                <li
                  key={m.movie_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <span className="text-sm text-foreground">
                    <span className="text-muted mr-2">{index + 1}.</span>
                    {m.title} ({m.year})
                    {!m.is_playable && (
                      <span className="ml-2 text-xs text-rose-400">not playable</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={saving || index === 0}
                      onClick={() => moveMovie(index, -1)}
                      className="text-xs text-muted hover:text-foreground/80 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={saving || index === challengeMovies.length - 1}
                      onClick={() => moveMovie(index, 1)}
                      className="text-xs text-muted hover:text-foreground/80 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleRemoveMovie(m.movie_id)}
                      className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveDraft}
            className="rounded bg-gold text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/20 text-foreground/80 px-4 py-2 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
