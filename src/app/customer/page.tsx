 "use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { estimateBAC, bacRiskLevel, formatBAC } from '@/lib/bac';
import { estimateBACRange, formatBACRange } from '@/lib/bac-range';
import { computeImpairmentRisk } from '@/lib/impairment-risk';
import { predictTimeToHighRisk, formatPrediction } from '@/lib/predictive';
import { loadUserProfile, saveUserProfile, updateBaselines } from '@/lib/baseline-learning';
import { ImpairmentResult, RiskAssessment, DEFAULT_USER_PROFILE } from '@/lib/impairment-types';
import { Customer, Session, Drink } from '@/lib/types';
import { DRINK_MENU } from '@/lib/menu';
import {
  Wine, Activity, User, LogOut, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react';
import { ImpairmentCheckModal } from '@/components/customer/impairment-check-modal';
import { ResultsDashboard } from '@/components/customer/results-dashboard';
import { FloatingChatbot } from '@/components/customer/floating-chatbot';
import { FocusCheck } from '@/components/customer/focus-check';

// ---- Risk badge helper (UI only) ----
function getRiskDisplay(bac: number) {
  const risk = bacRiskLevel(bac);
  if (risk === 'safe') return { level: 'Safe', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', icon: <CheckCircle2 className="size-5 text-emerald-500" /> };
  if (risk === 'caution') return { level: 'Caution', color: 'text-amber-500', bgColor: 'bg-amber-500/10', icon: <Info className="size-5 text-amber-500" /> };
  return { level: 'High Risk', color: 'text-rose-500', bgColor: 'bg-rose-500/10', icon: <AlertTriangle className="size-5 text-rose-500" /> };
}

function CustomerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ---- Onboarding state ----
  const [customerName, setCustomerName] = useState('');
  const [weightLbs, setWeightLbs] = useState(150);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const hasScannedRef = useRef(false);

  // ---- Session state ----
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'drinks' | 'profile'>('home');
  // ---- Impairment check flow state ----
  const [showImpairmentModal, setShowImpairmentModal] = useState(false);
  const [showResultsDashboard, setShowResultsDashboard] = useState(false);
  const [showFocusCheck, setShowFocusCheck] = useState(false);
  const [focusCheckCallback, setFocusCheckCallback] = useState<((r: ImpairmentResult) => void) | null>(null);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [projectedMinutes, setProjectedMinutes] = useState<number | undefined>(undefined);

  // ---- Derived ----
  const bac = customer && drinks.length > 0
    ? estimateBAC(drinks, customer.weight_lbs, customer.gender)
    : 0;
  const bacRange = customer && drinks.length > 0
    ? estimateBACRange(drinks, customer.weight_lbs, customer.gender)
    : { estimatedBACLow: 0, estimatedBACHigh: 0, midpoint: 0 };
  const riskInfo = getRiskDisplay(bac);
  const bacPercent = Math.min((bac / 0.15) * 100, 100);
  const hoursElapsed = session
    ? (Date.now() - new Date(session.started_at).getTime()) / (1000 * 60 * 60)
    : 0;
  const prediction = customer && drinks.length > 0
    ? predictTimeToHighRisk(bacRange, drinks, loadUserProfile()?.avgEliminationRate)
    : -1;

  // ---- Load authenticated user info ----
  useEffect(() => {
    (async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        router.push('/sign-up');
        return;
      }
      
      const user = authSession.user;
      setUserId(user.id);

      // Pre-fill name from Google OAuth metadata
      const googleName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Guest';
      setCustomerName(googleName);

      // Try to load existing customer data
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();
      
      if (existingCustomer) {
        setCustomer(existingCustomer as Customer);
        setWeightLbs(existingCustomer.weight_lbs || 150);
        setGender(existingCustomer.gender || 'male');
        setEmergencyPhone(existingCustomer.emergency_phone || '');
      }
    })();
  }, [router]);

  // ---- Open session when arriving via join URL (?joined=sessionId) ----
  useEffect(() => {
    const joinedId = searchParams.get('joined');
    if (!joinedId || !userId) return;

    (async () => {
      const { data: sess, error: sErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', joinedId)
        .eq('is_active', true)
        .single();
      if (sErr || !sess) return;

      const { data: cust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', (sess as Session).customer_id)
        .single();
      if (!cust) return;

      const { data: drinkRows } = await supabase
        .from('drinks')
        .select('*')
        .eq('session_id', joinedId)
        .order('ordered_at', { ascending: true });

      setCustomer(cust as Customer);
      setSession(sess as Session);
      setDrinks((drinkRows ?? []) as Drink[]);
      router.replace('/customer', { scroll: false });
    })();
  }, [searchParams, userId, router]);

  // ---- Join session via QR code scan ----
  async function joinSessionViaQR(sessionId: string) {
    setShowScanner(false);
    setLoading(true);
    try {
      console.log('Attempting to join session via QR:', sessionId);
      
      // 1. Save current customer info
      if (!userId) {
        alert('User not authenticated');
        return;
      }

      const { data: cust, error: cErr } = await supabase
        .from('customers')
        .update({ 
          name: customerName.trim(), 
          weight_lbs: weightLbs, 
          gender,
          emergency_phone: emergencyPhone.trim() || null,
        })
        .eq('auth_user_id', userId)
        .select()
        .single();
      
      if (cErr) { 
        console.error('Customer save error:', cErr);
        alert(`Error saving customer: ${cErr.message}`);
        return;
      }

      // 2. Subscribe to the session
      const { data: sess, error: sErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      
      if (sErr) { 
        console.error('Session fetch error:', sErr);
        alert(`Error joining session: ${sErr.message}`);
        return;
      }
      if (!sess) { 
        alert('Session not found');
        return;
      }

      console.log('Joined session:', sess);
      setCustomer(cust as Customer);
      setSession(sess as Session);
      setDrinks([]);
    } catch (err) {
      console.error('Unexpected error:', err);
      alert(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  // Preload qr-scanner so "Scan QR to Join" opens camera immediately (no import delay)
  useEffect(() => {
    import('qr-scanner');
  }, []);

  // ---- QR scanner: start camera as soon as modal opens; stop immediately on first scan ----
  useLayoutEffect(() => {
    if (!showScanner) return;

    hasScannedRef.current = false;
    const video = videoRef.current;
    if (!video) return;

    let mounted = true;
    (async () => {
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (!mounted || !videoRef.current) return;

        const scanner = new QrScanner(
          video,
          (result) => {
            if (hasScannedRef.current || !mounted) return;
            const code = typeof result === 'string' ? result : result?.data;
            if (!code) return;
            hasScannedRef.current = true;
            try {
              scanner.stop();
              scanner.destroy();
            } catch (e) { /* ignore */ }
            scannerRef.current = null;
            setShowScanner(false);

            // Parse scanned QR code:
            // 1. URL with /customer/join/<token> → redirect to join page
            // 2. Raw UUID → legacy direct session join
            // 3. Anything else → already on check-in page
            const joinMatch = code.match(/\/customer\/join\/([^/?#]+)/);
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (joinMatch) {
              // Redirect to the join URL (handles auth + session linking)
              const joinUrl = code.startsWith('http') ? code : `${window.location.origin}/customer/join/${joinMatch[1]}`;
              window.location.href = joinUrl;
            } else if (UUID_RE.test(code)) {
              joinSessionViaQR(code);
            } else {
              alert('You\'re already on the check-in page. Fill out your details and tap "Start Session" to begin!');
            }
          },
          {
            returnDetailedScanResult: true,
            preferredCamera: 'environment',
            maxScansPerSecond: 25,
            highlightScanRegion: true,
          }
        );
        scannerRef.current = scanner;
        await scanner.start();
      } catch (err) {
        console.error('Failed to start QR scanner:', err);
        alert('Unable to access camera. Please allow camera access and try again.');
        setShowScanner(false);
      }
    })();

    return () => {
      mounted = false;
      const s = scannerRef.current;
      if (s) {
        try { s.stop(); s.destroy(); } catch (e) { /* ignore */ }
        scannerRef.current = null;
      }
    };
  }, [showScanner]);

  // ---- Start session: creates or updates customer + session in Supabase ----
  async function startSession() {
    if (!customerName.trim() || !userId) return;
    setLoading(true);
    try {
      // 1. Check if customer already exists
      console.log('Checking for existing customer with auth_user_id:', userId);
      const { data: existingCustomers } = await supabase
        .from('customers')
        .select('*')
        .eq('auth_user_id', userId);

      let cust;
      let cErr;

      if (existingCustomers && existingCustomers.length > 0) {
        // Update existing customer
        console.log('Customer exists, updating...');
        const { data: updated, error: updateErr } = await supabase
          .from('customers')
          .update({ 
            name: customerName.trim(), 
            weight_lbs: weightLbs, 
            gender,
            emergency_phone: emergencyPhone.trim() || null,
          })
          .eq('auth_user_id', userId)
          .select()
          .single();
        
        cust = updated;
        cErr = updateErr;
      } else {
        // Create new customer
        console.log('No existing customer, creating new one...');
        const { data: created, error: createErr } = await supabase
          .from('customers')
          .insert({ 
            auth_user_id: userId,
            name: customerName.trim(), 
            weight_lbs: weightLbs, 
            gender,
            emergency_phone: emergencyPhone.trim() || null,
          })
          .select()
          .single();
        
        cust = created;
        cErr = createErr;
      }
      
      if (cErr) { 
        console.error('Customer save error:', cErr);
        alert(`Error saving customer: ${cErr.message}`);
        return;
      }
      if (!cust) { 
        alert('No customer data returned');
        return;
      }

      console.log('Customer saved:', cust);

      // 2. Create session with unique join URL token
      const { generateJoinToken } = await import("@/lib/utils");
      const join_token = generateJoinToken();
      console.log('Creating session for customer:', cust.id);
      const { data: sess, error: sErr } = await supabase
        .from('sessions')
        .insert({ customer_id: cust.id, join_token })
        .select()
        .single();
      
      if (sErr) { 
        console.error('Session creation error:', sErr);
        alert(`Error creating session: ${sErr.message}`);
        return;
      }
      if (!sess) { 
        alert('No session data returned');
        return;
      }

      console.log('Session created:', sess);
      setCustomer(cust as Customer);
      setSession(sess as Session);
      setDrinks([]);
    } catch (err) {
      console.error('Unexpected error:', err);
      alert(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  // ---- Trigger impairment check modal (called instead of ending directly) ----
  function requestEndSession() {
    if (!customer || !session) return;
    setShowImpairmentModal(true);
  }

  // ---- Handle impairment check completion → show results ----
  function handleImpairmentComplete(results: ImpairmentResult[]) {
    const assessment = computeImpairmentRisk(bacRange, results);
    const minutes = predictTimeToHighRisk(bacRange, drinks, loadUserProfile()?.avgEliminationRate);
    setRiskAssessment(assessment);
    setProjectedMinutes(minutes >= 0 ? minutes : undefined);
    setShowImpairmentModal(false);
    setShowResultsDashboard(true);
  }

  // ---- Handle skipping impairment checks ----
  function handleSkipImpairment() {
    setShowImpairmentModal(false);
    confirmEndSession();
  }

  // ---- Actually end session ----
  async function confirmEndSession() {
    // Save baseline learning if we have assessment results
    if (riskAssessment && customer && session) {
      const profile = loadUserProfile() || { ...DEFAULT_USER_PROFILE, weight: customer.weight_lbs, biologicalSex: customer.gender };
      const updated = updateBaselines(
        profile,
        riskAssessment.checks,
        bacRange,
        hoursElapsed,
        false // default: not self-reported impaired
      );
      saveUserProfile(updated);
    }

    if (session) {
      await supabase
        .from('sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', session.id);
    }
    setShowResultsDashboard(false);
    setRiskAssessment(null);
    setProjectedMinutes(undefined);
    setSession(null);
    setCustomer(null);
    setDrinks([]);
    setActiveTab('home');
  }

  // ---- Open floating chatbot with results context ----
  function openChatWithResults() {
    setShowResultsDashboard(false);
    window.dispatchEvent(new CustomEvent('open-chatbot', {
      detail: { prompt: 'Explain my impairment check results and what they mean.' },
    }));
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
            // Bartender ended the session — show impairment check modal
            if (customer) {
              setShowImpairmentModal(true);
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
      <>
        {showScanner && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black">
            <div className="relative flex-1 min-h-0 flex flex-col">
              <video
                ref={videoRef}
                className="block w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />
            </div>
            <div className="p-4 bg-black/80 flex gap-2">
              <Button onClick={() => setShowScanner(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}
      <main className="flex min-h-[100dvh] w-full flex-col items-center justify-start bg-background px-3 py-4 pt-[env(safe-area-inset-top,16px)] sm:justify-center sm:px-6 sm:py-8 overflow-y-auto">
        <div className="w-full max-w-md space-y-4 text-center sm:space-y-8">
          <div className="space-y-2">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 sm:size-20">
              <Wine className="size-8 text-primary sm:size-10" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">SOBR</h1>
            <p className="text-muted-foreground">Your personal drinking companion</p>
          </div>

          <Card className="border-none shadow-lg text-left">
            <CardContent className="pt-4 px-4 space-y-3 sm:pt-6 sm:px-6 sm:space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Your Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:px-4 sm:py-3 sm:text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {/* Weight */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Weight (lbs)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(Number(e.target.value))}
                  min={60}
                  max={600}
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:px-4 sm:py-3 sm:text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Gender</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setGender('male')}
                    className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors active:scale-95 ${gender === 'male' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  >
                    Male
                  </button>
                  <button
                    onClick={() => setGender('female')}
                    className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors active:scale-95 ${gender === 'female' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  >
                    Female
                  </button>
                </div>
              </div>
              {/* Trusted Friend Phone */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Trusted Friend&apos;s Phone</label>
                <input
                  type="tel"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="e.g. +1 555-123-4567"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:px-4 sm:py-3 sm:text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-[11px] sm:text-xs text-muted-foreground">
                  We&apos;ll text them if you reach a high risk level or when your session ends so they can make sure you get home safe.
                </p>
              </div>

              <Button
                onClick={() => setShowScanner(true)}
                size="lg"
                className="w-full rounded-full text-base h-12 sm:h-14 mt-2 active:scale-[0.98] transition-transform"
                disabled={!customerName.trim() || loading}
              >
                {loading ? 'Starting…' : 'Scan QR to Join'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      </>
    );
  }

  // ============================================================
  // ACTIVE SESSION SCREEN
  // ============================================================
  return (
    <main className="flex min-h-[100dvh] w-full flex-col bg-muted/30 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto w-full max-w-md flex-1 space-y-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top,12px))] sm:space-y-6 sm:p-4 sm:pt-8">

        {/* Header */}
        <header className="flex items-center justify-between px-1 sm:px-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">
              Hi, {customer?.name.split(' ')[0]}
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Your Session</h1>
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
              <div className={`flex items-center gap-2 px-4 py-3 sm:px-6 sm:py-4 ${riskInfo.bgColor}`}>
                {riskInfo.icon}
                <span className={`font-semibold text-sm sm:text-base ${riskInfo.color}`}>{riskInfo.level}</span>
              </div>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider sm:text-sm">Estimated BAC Range</span>
                  <span className="text-2xl font-black tracking-tighter tabular-nums sm:text-4xl">
                    {formatBACRange(bacRange)}
                  </span>
                  <span className="text-xs text-muted-foreground">Range accounts for absorption variance</span>
                </div>

                <div className="mt-5 sm:mt-8 space-y-2">
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
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
              <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col items-center justify-center p-3 sm:p-6">
                  <span className="text-[10px] font-medium text-muted-foreground mb-0.5 sm:text-sm sm:mb-1">Drinks</span>
                  <span className="text-2xl font-bold text-primary sm:text-4xl">{drinks.length}</span>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col items-center justify-center p-3 sm:p-6">
                  <span className="text-[10px] font-medium text-muted-foreground mb-0.5 sm:text-sm sm:mb-1">Hours</span>
                  <span className="text-2xl font-bold sm:text-4xl">{hoursElapsed.toFixed(1)}</span>
                </CardContent>
              </Card>
            </div>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Your bartender will add drinks to your session in real time.
            </p>

            {/* Predictive Alert */}
            {prediction >= 0 && (
              <Card className="border-primary/20 bg-primary/5 border-none shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <AlertTriangle className="size-5 text-primary shrink-0" />
                  <p className="text-sm font-medium">{formatPrediction(prediction)}</p>
                </CardContent>
              </Card>
            )}
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
                  <span className="font-medium">Trusted Friend</span>
                  <span className="text-muted-foreground">
                    {customer?.emergency_phone || 'Not set'}
                  </span>
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

      {/* Impairment Check Modal */}
      {showImpairmentModal && (
        <ImpairmentCheckModal
          onComplete={handleImpairmentComplete}
          onCancel={handleSkipImpairment}
          onRunFocusCheck={(onResultCb) => {
            setFocusCheckCallback(() => onResultCb);
            setShowFocusCheck(true);
          }}
        />
      )}

      {/* Focus Check (Eye Tracking) */}
      {showFocusCheck && focusCheckCallback && (
        <FocusCheck
          onResult={(result) => {
            focusCheckCallback(result);
            setShowFocusCheck(false);
            setFocusCheckCallback(null);
          }}
          onCancel={() => {
            setShowFocusCheck(false);
            setFocusCheckCallback(null);
          }}
        />
      )}

      {/* Results Dashboard */}
      {showResultsDashboard && riskAssessment && (
        <ResultsDashboard
          assessment={riskAssessment}
          projectedMinutes={projectedMinutes}
          onTalkToAI={openChatWithResults}
          onClose={confirmEndSession}
        />
      )}

      {/* Floating AI Chatbot — always available */}
      {customer && session && (
        <FloatingChatbot
          customer={customer}
          drinks={drinks}
          hoursElapsed={hoursElapsed}
          assessment={riskAssessment}
        />
      )}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-auto flex max-w-md items-center justify-around p-1.5 sm:p-2">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-colors sm:h-14 ${activeTab === 'home' ? 'text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Activity className="size-5 mb-0.5 sm:size-6 sm:mb-1" />
            <span className="text-[10px] font-medium">Status</span>
          </button>
          <button
            onClick={() => setActiveTab('drinks')}
            className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-colors sm:h-14 ${activeTab === 'drinks' ? 'text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Wine className="size-5 mb-0.5 sm:size-6 sm:mb-1" />
            <span className="text-[10px] font-medium">Drinks</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-colors sm:h-14 ${activeTab === 'profile' ? 'text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <User className="size-5 mb-0.5 sm:size-6 sm:mb-1" />
            <span className="text-[10px] font-medium">Profile</span>
          </button>
        </div>
      </div>
    </main>
  );
}

export default function CustomerPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-background px-6">
          <Card className="w-full max-w-sm border-0 shadow-xl">
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </CardContent>
          </Card>
        </main>
      }
    >
      <CustomerPageContent />
    </Suspense>
  );
}
