-- ============================================================
-- donor_otps table — run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create the table
create table if not exists donor_otps (
  id          uuid          default gen_random_uuid() primary key,
  email       text          not null,
  otp_hash    text          not null,
  salt        text          not null,
  expires_at  timestamptz   not null,
  used        boolean       default false,
  attempts    integer       default 0,
  created_at  timestamptz   default now()
);

-- 2. Index for fast lookup by email + validity
create index if not exists donor_otps_email_idx  on donor_otps (email);
create index if not exists donor_otps_expiry_idx on donor_otps (expires_at);

-- 3. Row Level Security — Edge Functions use service role key (bypasses RLS).
--    Anon/authenticated users should NOT be able to read OTPs directly.
alter table donor_otps enable row level security;

-- No client-side policies: only the Edge Function (service role) touches this table.
-- This is intentional — do NOT add SELECT/INSERT policies for anon or authenticated roles.

-- 4. Optional: auto-cleanup old OTPs via pg_cron (free on Supabase)
--    Uncomment if you have pg_cron enabled in your project.
-- select cron.schedule(
--   'delete-expired-otps',
--   '*/15 * * * *',          -- every 15 minutes
--   $$ delete from donor_otps where expires_at < now() - interval '1 hour' $$
-- );
