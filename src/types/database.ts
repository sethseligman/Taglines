export interface DbMovie {
  id: string;
  title: string;
  year: number;
  genre: string;
  cast_hint: string;
  plot_hint: string;
  poster_url?: string | null;
  poster_path?: string | null;
  status: string;
  is_playable: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbTagline {
  id: string;
  movie_id: string;
  tagline_text: string;
  is_primary: boolean;
  created_at: string;
}

export interface DbAcceptedAlias {
  id: string;
  movie_id: string;
  alias: string;
  created_at: string;
}

export interface DbDailySchedule {
  scheduled_date: string;
  movie_id: string;
  created_at: string;
}
