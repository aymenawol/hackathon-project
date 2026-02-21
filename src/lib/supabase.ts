import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wnxnmxllmvilofbunlvj.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndueG5teGxsbXZpbG9mYnVubHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjgxMzIsImV4cCI6MjA4NzE0NDEzMn0.7LZjBP0CvNNKBiZ0E0BEbkoUegmpr_pf0Lnf94NiMVk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
