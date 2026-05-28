/** Challenge catalog and player-run types (Supabase public schema). */

export type ChallengeType = "completion" | "daily_pool" | "one_off";

export type ChallengeRunStatus = "in_progress" | "finished" | "failed";

export interface DbChallenge {
  id: string;
  slug: string;
  title: string;
  eyebrow: string | null;
  type: ChallengeType;
  leg_count: number;
  is_published: boolean;
  portal_sort_order: number | null;
  art_config: Record<string, unknown> | null;
  created_at: string;
}

export interface DbChallengeMovie {
  id: string;
  challenge_id: string;
  movie_id: string;
  position: number;
}

export interface DbChallengeDailyLeg {
  id: string;
  challenge_id: string;
  scheduled_date: string;
  position: number;
  movie_id: string;
}

export interface DbChallengeRun {
  id: string;
  challenge_id: string;
  user_id: string | null;
  date_key: string | null;
  status: ChallengeRunStatus;
  total_guesses: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface DbChallengeLegResult {
  id: string;
  run_id: string;
  movie_id: string;
  position: number;
  guesses_used: number;
  solved: boolean;
  completed_at: string;
}
