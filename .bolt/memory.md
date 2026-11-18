# Project memory

## Product intent & audience

- Browser-based racing game built with Vite + React.
- Includes an online leaderboard where players submit and view race records (lap times) per track.

## Brand personality & voice

- Game-oriented, competitive; leaderboard encourages replay and time improvement.

## Visual design & UX direction

- Map screen displays an "ONLINE" status indicator when the Supabase backend is reachable.
- Leaderboard reads/writes race records keyed by racer name, track, and lap time.
- Per-track leaderboard shows top 5 lap times; finish submissions are ranked automatically.

## Decisions, constraints & rationale

- Backend: Supabase (live database). Connection settings loaded from the project environment file.
- `race_records` table schema and constraints:
  - `racer_name`: max 20 characters.
  - `track`: limited to the four built-in tracks (validated at DB level).
  - `lap_time`: sane time limits enforced.
- Security: Row-Level Security enabled. Visitors can read and insert records but cannot edit or delete them. Table privileges tightened to read/insert only.
- Build tooling: resolved prior esbuild/vite version conflict by bumping `esbuild` to a version compatible with the pinned `vite`; build now passes.
- Online flow verified end to end: track load, finish submission, invalid submission rejection (wrong track / impossible time), and RLS tamper protection.

## Open questions & assumptions

- Four built-in track identifiers assumed stable; schema validation depends on them not changing without a migration.
- Leaderboard currently starts empty (test entry removed during verification).