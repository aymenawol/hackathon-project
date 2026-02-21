'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

export default function SignUpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any | null>(null);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [weight, setWeight] = useState<number>(150);

  useEffect(() => {
    // Try to handle OAuth redirect + get current session
    (async () => {
      try {
        // Attempt to parse session from URL if present (OAuth redirect)
        // Not all supabase clients require this, but calling it is safe.
        // @ts-ignore
        if (typeof supabase.auth.getSessionFromUrl === 'function') {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await supabase.auth.getSessionFromUrl();
        }

        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setSession(data.session);
          const user = data.session.user;
          setName((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || '');
          setEmail(user.email || '');
        }
      } catch (err) {
        // ignore
      }
    })();
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/sign-up' } });
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: currentSession } = await supabase.auth.getSession();
      const user = currentSession?.session?.user || session?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const profile = {
        id: user.id,
        full_name: name,
        email: email,
        weight,
      };

      await supabase.from('profiles').upsert(profile);
      // redirect to customer page
      router.push('/customer');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-red-50 px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-md border-2 border-red-100">
        <h2 className="text-2xl font-bold text-red-600 mb-2">Get started</h2>
        <p className="text-sm text-gray-600 mb-6">Sign in with Google to continue onboarding.</p>

        {!session ? (
          <div className="space-y-4">
            <Button onClick={handleSignIn} className="w-full bg-red-600 hover:bg-red-700 text-white py-3">
              {loading ? 'Signing in…' : 'Sign in with Google'}
            </Button>
            <p className="text-xs text-gray-500 text-center">We only request name & email from Google.</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-xs text-gray-600">Name</label>
              <div className="mt-1 text-sm font-semibold text-gray-900">{name}</div>
            </div>

            <div>
              <label className="text-xs text-gray-600">Email</label>
              <div className="mt-1 text-sm text-gray-900">{email}</div>
            </div>

            <div>
              <label className="text-xs text-gray-600">Weight (lbs)</label>
              <input
                type="number"
                min={80}
                max={700}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white py-3">
                {loading ? 'Saving…' : 'Finish Onboarding'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
