/*
# Create race_records table for the Apex Rush Racing leaderboard

1. Plain-English summary
- Creates the table that stores online race records for the game's leaderboard.
- Each row is one finished race: who drove, on which track, and how long it took.
- The map screen reads the top 5 fastest times for the selected track; finishing
  a race inserts a new row.

2. New Tables
- `race_records`
  - `id` (uuid, primary key, auto-generated)
  - `player_name` (text, required, 1-20 characters — the racer name entered in the UI)
  - `track_name` (text, required, must be one of the 4 built-in tracks)
  - `time_ms` (integer, required, between 1 second and 1 hour)
  - `created_at` (timestamp, set automatically)

3. Security
- Row Level Security is ENABLED on `race_records`.
- This game has no sign-in, so every visitor shares one public leaderboard:
  policies target both `anon` and `authenticated` roles.
- SELECT policy: anyone can read records (the leaderboard is intentionally public).
- INSERT policy: anyone can submit a record, but only if the name length, track
  name, and time range pass the same validation the UI applies.
- No UPDATE or DELETE policies, and no grants for those verbs: records are
  immutable once submitted.
- Grants: SELECT and INSERT only, to `anon` + `authenticated`.

4. Performance
- Index on (`track_name`, `time_ms`) supports the leaderboard's per-track,
  fastest-first query.
*/

CREATE TABLE IF NOT EXISTS public.race_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 20),
  track_name text NOT NULL CHECK (track_name IN ('Sunset Speedway', 'Neon District', 'Alpine Pass', 'Diamond Ring')),
  time_ms integer NOT NULL CHECK (time_ms BETWEEN 1000 AND 3600000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS race_records_track_time_idx
  ON public.race_records (track_name, time_ms ASC);

ALTER TABLE public.race_records ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.race_records TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can read race records" ON public.race_records;
CREATE POLICY "Anyone can read race records"
  ON public.race_records FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can submit a race record" ON public.race_records;
CREATE POLICY "Anyone can submit a race record"
  ON public.race_records FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(player_name) BETWEEN 1 AND 20
    AND track_name IN ('Sunset Speedway', 'Neon District', 'Alpine Pass', 'Diamond Ring')
    AND time_ms BETWEEN 1000 AND 3600000
  );
