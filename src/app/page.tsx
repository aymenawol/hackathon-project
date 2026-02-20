import { Button } from "@/components/ui/button";

export default function Home() {
  const isSupabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Hackathon app is ready 🚀</h1>
      <p className="text-muted-foreground">
        Next.js + Tailwind + shadcn/ui + Supabase baseline is set up.
      </p>

      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>shadcn/ui installed with a Button component</li>
        <li>Supabase client configured in src/lib/supabase.ts</li>
        <li>SQL migration created for public.test_items table</li>
        <li>
          Env status: {isSupabaseConfigured ? "✅ configured" : "⚠️ add NEXT_PUBLIC_SUPABASE_* values"}
        </li>
      </ul>

      <Button asChild>
        <a href="https://vercel.com/new" target="_blank" rel="noreferrer">
          Deploy on Vercel
        </a>
      </Button>

      <p className="text-xs text-muted-foreground">
        After setting env vars, run your migration with Supabase and redeploy.
      </p>
    </main>
  );
}
