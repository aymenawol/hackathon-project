-- Add emergency/trusted friend phone number to customers
alter table public.customers
  add column if not exists emergency_phone text;
