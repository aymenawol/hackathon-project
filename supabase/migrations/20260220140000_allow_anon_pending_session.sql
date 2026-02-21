-- Allow bartender (anon) to create a "pending" session when showing QR:
-- - Insert placeholder customer (auth_user_id NULL only)
-- - Insert session linked to that customer

CREATE POLICY "Enable insert for anon placeholder customer"
  ON public.customers FOR INSERT TO anon
  WITH CHECK (auth_user_id IS NULL);

CREATE POLICY "Enable insert for anon"
  ON public.sessions FOR INSERT TO anon
  WITH CHECK (true);
