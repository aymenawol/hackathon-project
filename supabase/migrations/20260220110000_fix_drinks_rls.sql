-- Update RLS policies for drinks table to allow authenticated users
DROP POLICY IF EXISTS "Anyone can read drinks" ON public.drinks;
DROP POLICY IF EXISTS "Anyone can insert drinks" ON public.drinks;

-- Allow both anon and authenticated to read drinks
CREATE POLICY "Enable select for all"
  ON public.drinks FOR SELECT
  USING (true);

-- Allow authenticated users to insert drinks (bartender flow)
CREATE POLICY "Enable insert for authenticated users"
  ON public.drinks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow anon users to insert drinks (fallback / customer flow)
CREATE POLICY "Enable insert for anon"
  ON public.drinks FOR INSERT TO anon
  WITH CHECK (true);
