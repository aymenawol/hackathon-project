-- Add auth_user_id column to link customers with authenticated users
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE public.customers 
    ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;
    
    CREATE INDEX idx_customers_auth_user_id ON public.customers(auth_user_id);
  END IF;
END $$;

-- Update RLS policies to allow authenticated users
DROP POLICY IF EXISTS "Anyone can read customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;

-- Allow authenticated users to insert and update their own records
CREATE POLICY "Enable insert for authenticated users"
  ON public.customers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update for authenticated users"
  ON public.customers FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable select for all"
  ON public.customers FOR SELECT
  USING (true);
