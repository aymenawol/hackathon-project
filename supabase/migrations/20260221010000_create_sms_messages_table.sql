-- SMS messages table for mock phone friend page
create table if not exists public.sms_messages (
  id uuid default gen_random_uuid() primary key,
  phone_number text not null,
  message text not null,
  type text not null check (type in ('high-risk', 'session-ended')),
  customer_name text not null,
  created_at timestamptz not null default now()
);

alter table public.sms_messages enable row level security;

create policy "Anyone can read sms_messages"
  on public.sms_messages for select to anon using (true);

create policy "Anyone can insert sms_messages"
  on public.sms_messages for insert to anon with check (true);

-- Enable realtime
alter publication supabase_realtime add table public.sms_messages;
