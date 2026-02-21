-- ============================================================
-- Bar Tracking Schema
-- Tables: customers, sessions, drinks
-- ============================================================

-- Customers table
create table if not exists public.customers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  weight_lbs numeric(5,1) not null default 150.0,
  gender text not null default 'male' check (gender in ('male', 'female')),
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "Anyone can read customers"
  on public.customers for select to anon using (true);

create policy "Anyone can insert customers"
  on public.customers for insert to anon with check (true);

create policy "Anyone can update customers"
  on public.customers for update to anon using (true);

-- Sessions table (one per customer visit)
create table if not exists public.sessions (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Anyone can read sessions"
  on public.sessions for select to anon using (true);

create policy "Anyone can insert sessions"
  on public.sessions for insert to anon with check (true);

create policy "Anyone can update sessions"
  on public.sessions for update to anon using (true);

-- Drinks table
create table if not exists public.drinks (
  id uuid default gen_random_uuid() primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  volume_ml numeric(7,1) not null,       -- e.g. 355 for a 12oz beer
  abv numeric(4,2) not null,             -- e.g. 5.00 for 5%
  ordered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.drinks enable row level security;

create policy "Anyone can read drinks"
  on public.drinks for select to anon using (true);

create policy "Anyone can insert drinks"
  on public.drinks for insert to anon with check (true);

-- Enable realtime for all tables
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.drinks;
