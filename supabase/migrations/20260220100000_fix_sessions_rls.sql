-- Update RLS policies for sessions table to allow authenticated users
DROP POLICY IF EXISTS "Anyone can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Anyone can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "Anyone can update sessions" ON public.sessions;

CREATE POLICY "Enable insert for authenticated users"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update for authenticated users"
  ON public.sessions FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable select for all"
  ON public.sessions FOR SELECT
  USING (true);
