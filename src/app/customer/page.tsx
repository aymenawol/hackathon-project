 "use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { estimateBAC, formatBAC } from '@/lib/bac';
import { estimateBACRange, formatBACRange } from '@/lib/bac-range';
import { computeImpairmentRisk } from '@/lib/impairment-risk';
import { predictTimeToHighRisk, formatPrediction } from '@/lib/predictive';
import { loadUserProfile, saveUserProfile, updateBaselines } from '@/lib/baseline-learning';
import { ImpairmentResult, RiskAssessment, DEFAULT_USER_PROFILE } from '@/lib/impairment-types';
import { Customer, Session, Drink } from '@/lib/types';
import { DRINK_MENU } from '@/lib/menu';
import {
  Activity, User, LogOut, AlertTriangle, QrCode, Scale, Users, Phone, GlassWater, Clock, Home, Info, Sun,
} from 'lucide-react';
import { ImpairmentCheckModal } from '@/components/customer/impairment-check-modal';
import { ResultsDashboard } from '@/components/customer/results-dashboard';
import { FloatingChatbot } from '@/components/customer/floating-chatbot';
import { FocusCheck } from '@/components/customer/focus-check';
import { StabilityCheck } from '@/components/customer/stability-check';



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
  const [focusCheckCallback, setFocusCheckCallback] = useState<((r: ImpairmentResult | null) => void) | null>(null);
  const [showStabilityCheck, setShowStabilityCheck] = useState(false);
  const [stabilityCheckCallback, setStabilityCheckCallback] = useState<((r: ImpairmentResult | null) => void) | null>(null);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [projectedMinutes, setProjectedMinutes] = useState<number | undefined>(undefined);

  // ---- Derived ----
  const bac = customer && drinks.length > 0
    ? estimateBAC(drinks, customer.weight_lbs, customer.gender)
    : 0;
  const bacRange = customer && drinks.length > 0
    ? estimateBACRange(drinks, customer.weight_lbs, customer.gender)
    : { estimatedBACLow: 0, estimatedBACHigh: 0, midpoint: 0 };
  const overLimit = bac >= 0.08;
  const bacPercent = Math.min((bac / 0.08) * 100, 100);
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
    if (riskAssessment) {
      // Already completed checks — re-show results
      setShowResultsDashboard(true);
      return;
    }
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

  // ---- Polling fallback: refetch drinks periodically in case realtime misses ----
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(fetchDrinks, 10_000);
    return () => clearInterval(interval);
  }, [session, fetchDrinks]);

  // ============================================================
  // ONBOARDING SCREEN (no active session)
  // ============================================================
  if (!session) {
    return (
      <div className="customer-theme">
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
              {/* Scan frame corners */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative size-56">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-white rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-white rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-white rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-white rounded-br-lg" />
                  {/* Animated scanning line */}
                  <div className="absolute inset-x-2 h-0.5 bg-primary/80 animate-[scan_2s_ease-in-out_infinite]" style={{ animation: 'scan 2s ease-in-out infinite' }} />
                </div>
              </div>
              <style>{`@keyframes scan { 0%, 100% { top: 10%; } 50% { top: 85%; } }`}</style>
            </div>
            <div className="p-4 bg-black/80 flex flex-col items-center gap-3">
              <p className="text-white/70 text-sm text-center">Point camera at the QR code on your table</p>
              <Button onClick={() => setShowScanner(false)} variant="outline" className="w-full max-w-xs h-12 rounded-xl">
                Cancel
              </Button>
            </div>
          </div>
        )}
      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-3">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <Image src="/logo1.png" alt="Woozy" width={40} height={40} className="h-8 w-auto object-contain" />
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex min-h-[calc(100dvh-57px)] w-full flex-col items-center justify-start bg-background px-4 py-6 sm:justify-center sm:px-6 sm:py-8 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Welcome Back</h2>
            <p className="text-sm text-muted-foreground">Fill in your details to get started</p>
          </div>

          <Card className="border-none shadow-lg">
            <CardContent className="pt-5 px-4 space-y-4 sm:pt-6 sm:px-6 sm:space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="size-3.5 text-muted-foreground" />
                  Your Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full rounded-xl border bg-background px-4 py-3 h-12 text-base outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                />
              </div>
              {/* Weight */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Scale className="size-3.5 text-muted-foreground" />
                  Weight (lbs)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(Number(e.target.value))}
                  min={60}
                  max={600}
                  className="w-full rounded-xl border bg-background px-4 py-3 h-12 text-base outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                />
              </div>
              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="size-3.5 text-muted-foreground" />
                  Gender
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={gender === 'male' ? 'default' : 'outline'}
                    onClick={() => setGender('male')}
                    className="h-12 rounded-xl text-sm font-medium"
                  >
                    Male
                  </Button>
                  <Button
                    type="button"
                    variant={gender === 'female' ? 'default' : 'outline'}
                    onClick={() => setGender('female')}
                    className="h-12 rounded-xl text-sm font-medium"
                  >
                    Female
                  </Button>
                </div>
              </div>
              {/* Trusted Friend Phone */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="size-3.5 text-muted-foreground" />
                  Trusted Friend&apos;s Phone
                </label>
                <input
                  type="tel"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="e.g. +1 555-123-4567"
                  className="w-full rounded-xl border bg-background px-4 py-3 h-12 text-base outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  We&apos;ll text them if you reach a high risk level or when your session ends so they can make sure you get home safe.
                </p>
              </div>

              <Button
                onClick={() => setShowScanner(true)}
                size="lg"
                className="w-full rounded-xl text-base h-14 mt-2 gap-2 active:scale-[0.98] transition-transform"
                disabled={!customerName.trim() || loading}
              >
                <QrCode className="size-5" />
                {loading ? 'Starting…' : 'Scan QR to Join'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      </div>
    );
  }

  // ============================================================
  // ACTIVE SESSION SCREEN
  // ============================================================
  return (
    <div className="customer-theme flex h-[100dvh] w-full flex-col bg-muted/30">
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-md space-y-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top,12px))] pb-2 sm:space-y-6 sm:p-4 sm:pt-8">

        {/* Header */}
        <header className="flex items-center justify-between px-1 sm:px-2">
          <div className="flex items-center gap-3">
            <Image src="/logo1.png" alt="Woozy" width={40} height={40} className="h-8 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">Active Session</h1>
              <p className="text-xs text-muted-foreground">
                Hi, {customer?.name.split(' ')[0]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" />
            <span className="text-sm font-medium tabular-nums">
              {Math.floor(hoursElapsed)}:{String(Math.floor((hoursElapsed % 1) * 60)).padStart(2, '0')}
            </span>
          </div>
        </header>

        {activeTab === 'home' && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* BAC Hero Card */}
            <Card className={`overflow-hidden shadow-md ${overLimit ? 'border-destructive' : 'border-none'}`}>
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estimated BAC</span>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                    overLimit ? 'bg-destructive/10 text-destructive' : bac >= 0.05 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'
                  }`}>
                    {overLimit ? 'Over Limit' : bac >= 0.05 ? 'Elevated' : 'Safe'}
                  </span>
                </div>
                <div className="text-center mb-4">
                  <span className={`text-3xl font-black tracking-tighter tabular-nums sm:text-4xl ${overLimit ? 'text-destructive' : ''}`}>
                    {formatBACRange(bacRange)}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1">Range accounts for absorption variance</p>
                </div>

                <div className="space-y-1.5">
                  <div className="relative">
                    <Progress
                      value={bacPercent}
                      className={`h-3 rounded-full ${overLimit ? '[&>[data-slot=indicator]]:bg-destructive' : bac >= 0.05 ? '[&>[data-slot=indicator]]:bg-amber-500' : '[&>[data-slot=indicator]]:bg-emerald-500'}`}
                    />
                    {/* Legal limit marker */}
                    <div className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: '100%', transform: 'translateX(-1px)' }}>
                      <div className="w-px h-3 bg-destructive/50" />
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0.00%</span>
                    <span className="text-destructive/70 font-medium">0.08% limit</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <Card className="border-none shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                    <GlassWater className="size-5 text-primary" />
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-muted-foreground">Drinks</span>
                    <p className="text-xl font-bold text-primary">{drinks.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                    <Clock className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-muted-foreground">Elapsed</span>
                    <p className="text-xl font-bold tabular-nums">{Math.floor(hoursElapsed)}:{String(Math.floor((hoursElapsed % 1) * 60)).padStart(2, '0')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pace Warning */}
            {drinks.length > 0 && (drinks.length / Math.max(hoursElapsed, 0.1)) > 2 && (
              <Card className="border-amber-500/30 bg-amber-500/5 shadow-sm">
                <CardContent className="flex items-center gap-3 p-3.5">
                  <AlertTriangle className="size-5 text-amber-500 shrink-0" />
                  <p className="text-sm font-medium text-amber-700">
                    You&apos;re pacing at {(drinks.length / Math.max(hoursElapsed, 0.1)).toFixed(1)} drinks/hr — consider slowing down.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Predictive Alert */}
            {prediction >= 0 && (
              <Card className="border-primary/20 bg-primary/5 border-none shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <AlertTriangle className="size-5 text-primary shrink-0" />
                  <p className="text-sm font-medium">{formatPrediction(prediction)}</p>
                </CardContent>
              </Card>
            )}

            {/* Info note */}
            <div className="flex items-start gap-2.5 px-2 py-2">
              <Info className="size-4 text-muted-foreground/60 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your bartender will add drinks to your session in real time. BAC estimates update automatically.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'drinks' && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="px-1 text-lg font-bold">Drink History</h2>
            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {drinks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-muted mb-4">
                      <GlassWater className="size-8 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No drinks recorded yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Your bartender will add them here.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {[...drinks].reverse().map((drink) => {
                      const menuItem = DRINK_MENU.find((m) => m.name === drink.name);
                      return (
                        <div key={drink.id} className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                              {menuItem ? `${menuItem.standard_drinks}x` : '1x'}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{drink.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {drink.volume_ml}ml · {drink.abv}% ABV
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground tabular-nums">
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
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="px-1 text-lg font-bold">Settings & Info</h2>
            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0 divide-y">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-2.5">
                    <User className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Name</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{customer?.name}</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-2.5">
                    <Scale className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Body Weight</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{customer?.weight_lbs} lbs</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-2.5">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Gender</span>
                  </div>
                  <span className="text-sm text-muted-foreground capitalize">{customer?.gender}</span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-2.5">
                    <Phone className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Trusted Friend</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {customer?.emergency_phone || 'Not set'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-2.5">
                    <Activity className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Pacing</span>
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {(drinks.length / Math.max(hoursElapsed, 0.1)).toFixed(1)} drinks/hr
                  </span>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-2.5">
                    <Sun className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Appearance</span>
                  </div>
                  <ThemeToggle />
                </div>
              </CardContent>
            </Card>

            <Button
              variant="destructive"
              className="w-full mt-6 h-14 rounded-xl"
              onClick={requestEndSession}
            >
              <LogOut className="mr-2 size-5" />
              End Session
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3">
              Please arrange safe transportation when done.
            </p>
          </div>
        )}
      </div>
    </main>

      {/* Impairment Check Modal */}
      {showImpairmentModal && (
        <ImpairmentCheckModal
          onComplete={handleImpairmentComplete}
          onCancel={handleSkipImpairment}
          onRunFocusCheck={(onResultCb) => {
            setFocusCheckCallback(() => onResultCb);
            setShowFocusCheck(true);
          }}
          onRunStabilityCheck={(onResultCb) => {
            setStabilityCheckCallback(() => onResultCb);
            setShowStabilityCheck(true);
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
            if (focusCheckCallback) focusCheckCallback(null);
            setShowFocusCheck(false);
            setFocusCheckCallback(null);
          }}
          bacEstimate={bac}
        />
      )}

      {/* Stability Check (Motion / Gyroscope) */}
      {showStabilityCheck && stabilityCheckCallback && (
        <StabilityCheck
          onResult={(result) => {
            stabilityCheckCallback(result);
            setShowStabilityCheck(false);
            setStabilityCheckCallback(null);
          }}
          onCancel={() => {
            if (stabilityCheckCallback) stabilityCheckCallback(null);
            setShowStabilityCheck(false);
            setStabilityCheckCallback(null);
          }}
        />
      )}

      {/* Results Dashboard */}
      {showResultsDashboard && riskAssessment && (
        <ResultsDashboard
          assessment={riskAssessment}
          projectedMinutes={projectedMinutes}
          onTalkToAI={openChatWithResults}
          onClose={() => setShowResultsDashboard(false)}
          onEndSession={confirmEndSession}
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
      <nav className="shrink-0 border-t bg-background" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-auto flex max-w-md items-center justify-around p-1.5 sm:p-2">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center px-6 py-2 rounded-xl transition-colors ${activeTab === 'home' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Home className="size-5 mb-0.5" />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          <button
            onClick={() => setActiveTab('drinks')}
            className={`flex flex-col items-center justify-center px-6 py-2 rounded-xl transition-colors ${activeTab === 'drinks' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <GlassWater className="size-5 mb-0.5" />
            <span className="text-[10px] font-medium">Drinks</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center px-6 py-2 rounded-xl transition-colors ${activeTab === 'profile' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <User className="size-5 mb-0.5" />
            <span className="text-[10px] font-medium">Profile</span>
          </button>
        </div>
      </nav>
    </div>
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
