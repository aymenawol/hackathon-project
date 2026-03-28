'use client';

import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { ThemeToggle } from '@/components/ui/theme-toggle';

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
    function getRedirect() {
      let redirect = searchParams.get('redirect');
      if (!redirect || !redirect.startsWith('/')) {
        try {
          redirect = sessionStorage.getItem('auth_redirect');
          if (redirect) sessionStorage.removeItem('auth_redirect');
        } catch (_) {}
      }
      return redirect && redirect.startsWith('/') ? redirect : '/customer';
    }

    // Listen for OAuth callback (fires when Supabase processes tokens from URL hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && authSession) {
        setSession(authSession);
        window.location.href = getRedirect();
      }
    });

    // Also check if already signed in
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        window.location.href = getRedirect();
      }
    });

    return () => { subscription.unsubscribe(); };
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
    <main className="customer-theme flex min-h-[100dvh] w-full flex-col items-center justify-center bg-background px-4 sm:px-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <Image src="/logo1.png" alt="Woozy" width={120} height={120} className="mx-auto size-24 object-contain" />
          <p className="text-sm text-muted-foreground">Your personal drinking companion</p>
        </div>

        <Card className="border-none shadow-lg">
          <CardContent className="pt-6 pb-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold mb-1">Welcome</h2>
              <p className="text-sm text-muted-foreground">Sign in with Google to get started.</p>
            </div>

            <Button 
              onClick={handleSignIn} 
              className="w-full h-14 text-base rounded-xl gap-3" 
              size="lg"
              disabled={loading}
            >
              {!loading && (
                <svg className="size-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {loading ? 'Signing in…' : 'Sign in with Google'}
            </Button>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              We only request your name and email. Your data stays private and is never shared.
            </p>
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
