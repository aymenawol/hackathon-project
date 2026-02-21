-- Add unique join_token to sessions for QR code join URLs (e.g. /customer/join/471-8718)
alter table public.sessions
  add column if not exists join_token text unique;

create index if not exists idx_sessions_join_token on public.sessions(join_token) where join_token is not null;
