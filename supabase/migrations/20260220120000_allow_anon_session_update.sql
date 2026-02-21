-- Allow unauthenticated (anon) users to update sessions (e.g. bartender ending a session)
CREATE POLICY "Enable update for anon"
  ON public.sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);
