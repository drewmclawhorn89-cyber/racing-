# Online records database (Supabase)

The game can store and display per-track race records in a Supabase-hosted Postgres database. Without these environment variables, the game still runs, but online records are unavailable.

## Configure

1. Create a Supabase project at https://supabase.com/.
2. In the SQL Editor, run `supabase/schema.sql` from this repository.
3. Copy the project URL and its **anon/public** API key (never put a `service_role` secret in frontend code).
4. Add these environment variables to your local `.env.local` or your hosting provider's build environment:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

5. Restart/redeploy the Vite app. The map screen shows the online connection status and records for the selected track. Finish a run to submit a record.

The browser key is public by design. Row Level Security is enabled; the included policies allow anonymous reads and validated inserts. Since race timing happens in the browser, submitted times are not cheat-proof. Use authenticated server-side validation if records must be trusted.
