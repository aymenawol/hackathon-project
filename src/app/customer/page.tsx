'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { Wine, Activity, User, LogOut, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

// Simple BAC estimation (weight in lbs, drinks consumed, hours elapsed)
const estimateBAC = (weight: number, drinks: number, hours: number) => {
  const gramsAlcoholPerDrink = 14; // standard drink
  const acetaldehyde = 0.68; // female metabolism, adjust as needed
  const volumeDistribution = 5.14 / weight; // Widmark formula
  const bac = (drinks * gramsAlcoholPerDrink * acetaldehyde * volumeDistribution * 100) - (0.15 * hours);
  return Math.max(0, bac);
};

// Get risk level and color based on BAC
const getRiskLevel = (bac: number) => {
  if (bac < 0.05) return { level: 'Safe', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', icon: <CheckCircle2 className="size-5 text-emerald-500" /> };
  if (bac < 0.08) return { level: 'Caution', color: 'text-amber-500', bgColor: 'bg-amber-500/10', icon: <Info className="size-5 text-amber-500" /> };
  return { level: 'High Risk', color: 'text-rose-500', bgColor: 'bg-rose-500/10', icon: <AlertTriangle className="size-5 text-rose-500" /> };
};

export default function CustomerPage() {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drinks, setDrinks] = useState<number>(0);
  const [weight, setWeight] = useState<number>(150); // default 150 lbs
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [activeTab, setActiveTab] = useState<'home' | 'drinks' | 'profile'>('home');

  const startSession = () => {
    const id = Math.random().toString(36).substring(2, 9).toUpperCase();
    setSessionId(id);
    setDrinks(0);
    setStartTime(Date.now());
    setSessionActive(true);
  };

  const endSession = () => {
    setSessionActive(false);
    setSessionId(null);
    setDrinks(0);
    setActiveTab('home');
  };

  const hoursElapsed = (Date.now() - startTime) / (1000 * 60 * 60);
  const estimatedBAC = sessionActive ? estimateBAC(weight, drinks, hoursElapsed) : 0;
  const riskInfo = getRiskLevel(estimatedBAC);
  const bacPercent = Math.min((estimatedBAC / 0.15) * 100, 100);

  useEffect(() => {
    // Load user profile from Supabase if available
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user) {
          // try to fetch profile from 'profiles' table
          const { data } = await supabase.from('profiles').select('full_name, email, weight').eq('id', user.id).single();
          if (data) {
            setName(data.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || '');
            setEmail(data.email || user.email || '');
            if (data.weight) setWeight(data.weight);
          } else {
            setName(user.user_metadata?.full_name || user.user_metadata?.name || user.email || '');
            setEmail(user.email || '');
          }
        }
      } catch (err) {
        // ignore
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  if (!sessionActive) {
    return (
      <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-background px-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="space-y-2">
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10">
              <Wine className="size-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">SafePour</h1>
            <p className="text-muted-foreground">Your personal drinking companion</p>
          </div>

          <Card className="border-none shadow-lg">
            <CardContent className="pt-6">
              <p className="mb-6 text-sm text-muted-foreground">
                Start a session to track your drinks, monitor your BAC, and stay safe tonight.
              </p>
              <Button onClick={startSession} size="lg" className="w-full rounded-full text-base h-14">
                Start Session
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] w-full flex-col bg-muted/30 pb-20">
      <div className="mx-auto w-full max-w-md flex-1 space-y-6 p-4 pt-8">
        
        {/* Header */}
        <header className="flex items-center justify-between px-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {loadingProfile ? 'Welcome' : name ? `Hi, ${name.split(' ')[0]}` : 'Welcome'}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Your Session</h1>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</span>
            <span className="font-mono text-sm font-bold bg-background px-2 py-1 rounded-md border shadow-sm">{sessionId}</span>
          </div>
        </header>

        {activeTab === 'home' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* BAC Card */}
            <Card className="overflow-hidden border-none shadow-md">
              <div className={`flex items-center gap-2 px-6 py-4 ${riskInfo.bgColor}`}>
                {riskInfo.icon}
                <span className={`font-semibold ${riskInfo.color}`}>{riskInfo.level}</span>
              </div>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Estimated BAC</span>
                  <span className="text-6xl font-black tracking-tighter tabular-nums">
                    {estimatedBAC.toFixed(3)}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">%</span>
                </div>
                
                <div className="mt-8 space-y-2">
                  <div className="flex justify-between text-xs font-medium text-muted-foreground">
                    <span>0.00</span>
                    <span>0.08 (Limit)</span>
                    <span>0.15+</span>
                  </div>
                  <Progress 
                    value={bacPercent} 
                    className={
                      `h-3 ${
                        estimatedBAC < 0.05 ? '[&>[data-slot=indicator]]:bg-emerald-500' :
                        estimatedBAC < 0.08 ? '[&>[data-slot=indicator]]:bg-amber-500' : '[&>[data-slot=indicator]]:bg-rose-500'
                      }`
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <span className="text-sm font-medium text-muted-foreground mb-1">Drinks</span>
                  <span className="text-4xl font-bold text-primary">{drinks}</span>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <span className="text-sm font-medium text-muted-foreground mb-1">Hours</span>
                  <span className="text-4xl font-bold">{hoursElapsed.toFixed(1)}</span>
                </CardContent>
              </Card>
            </div>

            {/* Add Drink Button */}
            <Button 
              onClick={() => setDrinks(d => d + 1)} 
              size="lg" 
              className="w-full h-16 rounded-2xl text-lg shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform"
            >
              <Wine className="mr-2 size-5" />
              I just had a drink
            </Button>
          </div>
        )}

        {activeTab === 'drinks' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="px-2 text-lg font-semibold">Drink History</h2>
            <Card className="border-none shadow-sm">
              <CardContent className="p-0">
                {drinks === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Wine className="size-12 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground">No drinks recorded yet.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {Array.from({ length: drinks }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                            <Wine className="size-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">Standard Drink</p>
                            <p className="text-xs text-muted-foreground">14g Alcohol</p>
                          </div>
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">Recorded</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="px-2 text-lg font-semibold">Settings & Info</h2>
            <Card className="border-none shadow-sm">
              <CardContent className="p-0 divide-y">
                <div className="flex items-center justify-between p-4">
                  <span className="font-medium">Body Weight</span>
                  <span className="text-muted-foreground">{weight} lbs</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <span className="font-medium">Pacing</span>
                  <span className="text-muted-foreground">{(drinks / Math.max(hoursElapsed, 0.1)).toFixed(1)} / hr</span>
                </div>
              </CardContent>
            </Card>

            <Button 
              variant="destructive" 
              className="w-full mt-8 h-14 rounded-xl"
              onClick={endSession}
            >
              <LogOut className="mr-2 size-5" />
              End Session
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-4">
              Please arrange safe transportation when done.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg pb-safe">
        <div className="mx-auto flex max-w-md items-center justify-around p-2">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors ${activeTab === 'home' ? 'text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Activity className="size-6 mb-1" />
            <span className="text-[10px] font-medium">Status</span>
          </button>
          <button 
            onClick={() => setActiveTab('drinks')}
            className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors ${activeTab === 'drinks' ? 'text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Wine className="size-6 mb-1" />
            <span className="text-[10px] font-medium">Drinks</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors ${activeTab === 'profile' ? 'text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <User className="size-6 mb-1" />
            <span className="text-[10px] font-medium">Profile</span>
          </button>
        </div>
      </div>
    </main>
  );
}
