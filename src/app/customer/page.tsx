'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

// Simple BAC estimation (weight in lbs, drinks consumed, hours elapsed)
const estimateBAC = (weight: number, drinks: number, hours: number) => {
  const gramsAlcoholPerDrink = 14; // standard drink
  const acetaldehyde = 0.68; // female metabolism, adjust as needed
  const volumeDistribution = 5.14 / weight; // Widmark formula
  const bac = (drinks * gramsAlcoholPerDrink * acetaldehyde * volumeDistribution * 100) - (0.15 * hours);
  return Math.max(0, bac);
};

// Get risk level and color based on BAC
const getRiskLevel = (bac: number): { level: string; color: string; bgColor: string } => {
  if (bac < 0.05) return { level: 'Safe', color: 'text-green-600', bgColor: 'bg-green-100' };
  if (bac < 0.08) return { level: 'Caution', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
  return { level: 'High Risk', color: 'text-red-600', bgColor: 'bg-red-100' };
};

export default function CustomerPage() {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drinks, setDrinks] = useState<number>(0);
  const [weight, setWeight] = useState<number>(150); // default 150 lbs
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [startTime] = useState<number>(Date.now());

  const startSession = () => {
    const id = Math.random().toString(36).substring(2, 9).toUpperCase();
    setSessionId(id);
    setDrinks(0);
    setSessionActive(true);
  };

  const endSession = () => {
    setSessionActive(false);
    setSessionId(null);
    setDrinks(0);
  };

  const hoursElapsed = (Date.now() - startTime) / (1000 * 60 * 60);
  const estimatedBAC = sessionActive ? estimateBAC(weight, drinks, hoursElapsed) : 0;
  const riskInfo = getRiskLevel(estimatedBAC);

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
      <main className="min-h-screen w-full bg-gradient-to-b from-red-50 to-white">
        <div className="mx-auto max-w-md flex h-screen w-full flex-col items-center justify-center gap-6 px-6 py-16">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-red-600 mb-2">SafePour</h1>
            <p className="text-gray-600">Drink Responsibly 🍷</p>
          </div>

          <div className="bg-white border-2 border-red-200 rounded-2xl p-8 text-center shadow-lg w-full">
            <p className="text-gray-600 mb-6 text-lg">Scan the QR code or tap to start</p>
            <Button
              onClick={startSession}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl"
            >
              Start Session
            </Button>
          </div>

          <div className="text-center text-sm text-gray-500 mt-8">
            <p>🍺 Track your drinks • 📊 Check your BAC • 🚗 Stay safe</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-red-50 to-white pb-8">
      <div className="mx-auto max-w-md w-full">
        {/* Header */}
        <div className="bg-red-600 text-white px-6 py-6 rounded-b-2xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Hi{!loadingProfile && name ? `, ${name.split(' ')[0]}` : ''}</p>
              <h1 className="text-2xl font-bold">SafePour</h1>
            </div>
            <div className="text-right">
              <p className="text-red-100 text-sm">Session</p>
              <p className="font-mono font-bold text-lg">{sessionId}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-4">
          {/* Risk Indicator Card */}
          <div className={`${riskInfo.bgColor} border-2 border-red-200 rounded-2xl p-6 shadow-md`}>
            <p className="text-gray-700 text-sm font-semibold mb-3 uppercase tracking-wide">Risk Status</p>
            
            {/* Drunkometer Visual */}
            <div className="mb-4">
              <div className="w-full bg-gray-300 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    estimatedBAC < 0.05 ? 'bg-green-500' :
                    estimatedBAC < 0.08 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.min((estimatedBAC / 0.15) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-2">
                <span>Safe</span>
                <span>Caution</span>
                <span>High Risk</span>
              </div>
            </div>

            {/* BAC and Status */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-gray-700 text-sm mb-1">Estimated BAC</p>
                <p className="text-3xl font-bold text-gray-900">{estimatedBAC.toFixed(2)}%</p>
              </div>
              <p className={`${riskInfo.color} text-2xl font-bold`}>{riskInfo.level}</p>
            </div>
          </div>

          {/* Drinks Counter Card */}
          <div className="bg-white border-2 border-red-200 rounded-2xl p-6 shadow-md">
            <p className="text-gray-700 text-sm font-semibold mb-4 uppercase tracking-wide">Drinks Consumed</p>
            <p className="text-5xl font-bold text-red-600 mb-6 text-center">{drinks}</p>
            <Button
              onClick={() => setDrinks(drinks + 1)}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl"
            >
              + Add Drink
            </Button>
          </div>

          {/* AI Analysis / Backend Data Card */}
          <div className="bg-white border-2 border-red-200 rounded-2xl p-6 shadow-md">
            <p className="text-gray-700 text-sm font-semibold mb-4 uppercase tracking-wide">Your Stats</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-gray-600">Time Elapsed</span>
                <span className="font-semibold text-gray-900">{hoursElapsed.toFixed(1)} hrs</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-gray-600">Body Weight</span>
                <span className="font-semibold text-gray-900">{weight} lbs</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Drinks/Hour</span>
                <span className="font-semibold text-gray-900">{(drinks / Math.max(hoursElapsed, 0.1)).toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            <Button
              onClick={endSession}
              className="w-full bg-gray-700 hover:bg-gray-800 text-white py-6 text-lg font-semibold rounded-xl"
            >
              End Session
            </Button>
            <p className="text-xs text-gray-500 text-center mt-4">
              ⚠️ Please arrange safe transportation when done
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
