'use client';

import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Wine } from 'lucide-react';

function SignUpPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any | null>(null);

  useEffect(() => {
    // Persist redirect from URL so we still have it after OAuth (callback often drops query params)
    const redirectFromUrl = searchParams.get('redirect');
    if (redirectFromUrl && redirectFromUrl.startsWith('/')) {
      try {
        sessionStorage.setItem('auth_redirect', redirectFromUrl);
      } catch (_) {}
    }
  }, [searchParams]);

  useEffect(() => {
    // Try to handle OAuth redirect + get current session
    (async () => {
      try {
        // Attempt to parse session from URL if present (OAuth redirect)
        // @ts-ignore
        if (typeof supabase.auth.getSessionFromUrl === 'function') {
          // @ts-ignore
          await supabase.auth.getSessionFromUrl();
        }

        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setSession(data.session);
          // Use redirect from URL first, then from sessionStorage (in case OAuth callback dropped it)
          let redirect = searchParams.get('redirect');
          if (!redirect || !redirect.startsWith('/')) {
            try {
              redirect = sessionStorage.getItem('auth_redirect');
              if (redirect) sessionStorage.removeItem('auth_redirect');
            } catch (_) {}
          }
          router.push(redirect && redirect.startsWith('/') ? redirect : '/customer');
        }
      } catch (err) {
        console.error('Auth error:', err);
      }
    })();
  }, [router, searchParams]);

  const handleSignIn = async () => {
    setLoading(true);
    const redirect = searchParams.get('redirect');
    const returnTo = redirect && redirect.startsWith('/')
      ? `${window.location.origin}/sign-up?redirect=${encodeURIComponent(redirect)}`
      : `${window.location.origin}/sign-up`;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnTo } });
    setLoading(false);
  };

  return (
    <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10">
            <Wine className="size-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">SOBR</h1>
          <p className="text-muted-foreground">Your personal drinking companion</p>
        </div>

        <Card className="border-none shadow-lg">
          <CardContent className="pt-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Welcome</h2>
              <p className="text-sm text-muted-foreground">Sign in with Google to get started.</p>
            </div>

            <Button 
              onClick={handleSignIn} 
              className="w-full" 
              size="lg"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in with Google'}
            </Button>
            
            <p className="text-xs text-muted-foreground">We only request name & email from Google.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-background px-6">
          <Card className="w-full max-w-sm border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </CardContent>
          </Card>
        </main>
      }
    >
      <SignUpPageContent />
    </Suspense>
  );
}
