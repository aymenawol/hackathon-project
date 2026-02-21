'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { estimateBAC, bacRiskLevel, formatBAC } from '@/lib/bac';
import { Customer, Session, Drink } from '@/lib/types';
import { DRINK_MENU } from '@/lib/menu';
import {
  Wine, Activity, User, LogOut, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react';
import { BreathyModal } from '@/components/customer/breathy-modal';

// ---- Risk badge helper (UI only) ----
function getRiskDisplay(bac: number) {
  const risk = bacRiskLevel(bac);
  if (risk === 'safe') return { level: 'Safe', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', icon: <CheckCircle2 className="size-5 text-emerald-500" /> };
  if (risk === 'caution') return { level: 'Caution', color: 'text-amber-500', bgColor: 'bg-amber-500/10', icon: <Info className="size-5 text-amber-500" /> };
  return { level: 'High Risk', color: 'text-rose-500', bgColor: 'bg-rose-500/10', icon: <AlertTriangle className="size-5 text-rose-500" /> };
}

export default function CustomerPage() {
  // ---- Onboarding state ----
  const [customerName, setCustomerName] = useState('');
  const [weightLbs, setWeightLbs] = useState(150);
  const [gender, setGender] = useState<'male' | 'female'>('male');

  // ---- Session state ----
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'drinks' | 'profile'>('home');
  const [showBreathy, setShowBreathy] = useState(false);
  // Snapshot data for Breathy when user or bartender triggers end
  const [breathyData, setBreathyData] = useState<{ customer: Customer; drinks: Drink[]; hours: number } | null>(null);

  // ---- Derived ----
  const bac = customer && drinks.length > 0
    ? estimateBAC(drinks, customer.weight_lbs, customer.gender)
    : 0;
  const riskInfo = getRiskDisplay(bac);
  const bacPercent = Math.min((bac / 0.15) * 100, 100);
  const hoursElapsed = session
    ? (Date.now() - new Date(session.started_at).getTime()) / (1000 * 60 * 60)
    : 0;

  // ---- Start session: creates customer + session in Supabase ----
  async function startSession() {
    if (!customerName.trim()) return;
    setLoading(true);
    try {
      // 1. Create customer
      const { data: cust, error: cErr } = await supabase
        .from('customers')
        .insert({ name: customerName.trim(), weight_lbs: weightLbs, gender })
        .select()
        .single();
      if (cErr || !cust) { console.error('Customer create failed', cErr); return; }

      // 2. Create session
      const { data: sess, error: sErr } = await supabase
        .from('sessions')
        .insert({ customer_id: cust.id })
        .select()
        .single();
      if (sErr || !sess) { console.error('Session create failed', sErr); return; }

      setCustomer(cust as Customer);
      setSession(sess as Session);
      setDrinks([]);
    } finally {
      setLoading(false);
    }
  }

  // ---- Trigger Breathy (called instead of ending directly) ----
  function requestEndSession() {
    if (!customer || !session) return;
    setBreathyData({
      customer,
      drinks: [...drinks],
      hours: (Date.now() - new Date(session.started_at).getTime()) / (1000 * 60 * 60),
    });
    setShowBreathy(true);
  }

  // ---- Actually end session (called after Breathy confirmation) ----
  async function confirmEndSession() {
    if (session) {
      await supabase
        .from('sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', session.id);
    }
    setShowBreathy(false);
    setBreathyData(null);
    setSession(null);
    setCustomer(null);
    setDrinks([]);
    setActiveTab('home');
  }

  // ---- Fetch drinks for this session ----
  const fetchDrinks = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('drinks')
      .select('*')
      .eq('session_id', session.id)
      .order('ordered_at', { ascending: true });
    if (data) setDrinks(data as Drink[]);
  }, [session]);

  // ---- Realtime: listen for new drinks added by bartender ----
  useEffect(() => {
    if (!session) return;
    fetchDrinks(); // initial fetch

    const channel = supabase
      .channel(`customer-drinks-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'drinks', filter: `session_id=eq.${session.id}` },
        (payload) => {
          setDrinks((prev) => [...prev, payload.new as Drink]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const updated = payload.new as Session;
          if (!updated.is_active) {
            // Bartender ended the session — show Breathy first
            if (customer) {
              setBreathyData({
                customer,
                drinks: [...drinks],
                hours: (Date.now() - new Date(session.started_at).getTime()) / (1000 * 60 * 60),
              });
              setShowBreathy(true);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session, fetchDrinks]);

  // ============================================================
  // ONBOARDING SCREEN (no active session)
  // ============================================================
  if (!session) {
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

          <Card className="border-none shadow-lg text-left">
            <CardContent className="pt-6 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Your Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {/* Weight */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Weight (lbs)</label>
                <input
                  type="number"
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(Number(e.target.value))}
                  min={60}
                  max={600}
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Gender</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setGender('male')}
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${gender === 'male' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  >
                    Male
                  </button>
                  <button
                    onClick={() => setGender('female')}
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${gender === 'female' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  >
                    Female
                  </button>
                </div>
              </div>

              <Button
                onClick={startSession}
                size="lg"
                className="w-full rounded-full text-base h-14 mt-2"
                disabled={!customerName.trim() || loading}
              >
                {loading ? 'Starting…' : 'Start Session'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // ============================================================
  // ACTIVE SESSION SCREEN
  // ============================================================
  return (
    <main className="flex min-h-[100dvh] w-full flex-col bg-muted/30 pb-20">
      <div className="mx-auto w-full max-w-md flex-1 space-y-6 p-4 pt-8">

        {/* Header */}
        <header className="flex items-center justify-between px-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Hi, {customer?.name.split(' ')[0]}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Your Session</h1>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Session</span>
            <span className="font-mono text-[10px] font-bold bg-background px-2 py-1 rounded-md border shadow-sm">
              {session.id.slice(0, 8).toUpperCase()}
            </span>
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
                    {formatBAC(bac).replace('%', '')}
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
                        bac < 0.05 ? '[&>[data-slot=indicator]]:bg-emerald-500' :
                        bac < 0.08 ? '[&>[data-slot=indicator]]:bg-amber-500' : '[&>[data-slot=indicator]]:bg-rose-500'
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
                  <span className="text-4xl font-bold text-primary">{drinks.length}</span>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <span className="text-sm font-medium text-muted-foreground mb-1">Hours</span>
                  <span className="text-4xl font-bold">{hoursElapsed.toFixed(1)}</span>
                </CardContent>
              </Card>
            </div>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Your bartender will add drinks to your session in real time.
            </p>
          </div>
        )}

        {activeTab === 'drinks' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="px-2 text-lg font-semibold">Drink History</h2>
            <Card className="border-none shadow-sm">
              <CardContent className="p-0">
                {drinks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Wine className="size-12 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground">No drinks recorded yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Your bartender will add them here.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {[...drinks].reverse().map((drink) => {
                      const menuItem = DRINK_MENU.find((m) => m.name === drink.name);
                      return (
                        <div key={drink.id} className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-lg">
                              {menuItem?.emoji ?? '🍸'}
                            </div>
                            <div>
                              <p className="font-medium">{drink.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {drink.volume_ml}ml · {drink.abv}% ABV
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {new Date(drink.ordered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}
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
                  <span className="font-medium">Name</span>
                  <span className="text-muted-foreground">{customer?.name}</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <span className="font-medium">Body Weight</span>
                  <span className="text-muted-foreground">{customer?.weight_lbs} lbs</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <span className="font-medium">Gender</span>
                  <span className="text-muted-foreground capitalize">{customer?.gender}</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <span className="font-medium">Pacing</span>
                  <span className="text-muted-foreground">
                    {(drinks.length / Math.max(hoursElapsed, 0.1)).toFixed(1)} drinks/hr
                  </span>
                </div>
              </CardContent>
            </Card>

            <Button
              variant="destructive"
              className="w-full mt-8 h-14 rounded-xl"
              onClick={requestEndSession}
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

      {/* Breathy Modal */}
      {showBreathy && breathyData && (
        <BreathyModal
          customer={breathyData.customer}
          drinks={breathyData.drinks}
          hoursElapsed={breathyData.hours}
          onConfirmEnd={confirmEndSession}
        />
      )}

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
