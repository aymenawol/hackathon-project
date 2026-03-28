'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImpairmentResult, ImpairmentCheckType } from '@/lib/impairment-types';
import { Eye,
  Activity,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

interface ImpairmentCheckModalProps {
  onComplete: (results: ImpairmentResult[]) => void;
  onCancel: () => void;
  onRunFocusCheck?: (onResult: (result: ImpairmentResult | null) => void) => void;
  onRunStabilityCheck?: (onResult: (result: ImpairmentResult | null) => void) => void;
}

interface CheckOption {
  type: ImpairmentCheckType;
  title: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
  duration: string;
}

const CHECK_OPTIONS: CheckOption[] = [
  {
    type: 'stability',
    title: 'Stability Check',
    description: 'Measures body sway and balance using motion sensors. Stand on one leg while holding your phone to your chest or pocket.',
    icon: <Activity className="size-8" />,
    available: true,
    duration: '20 sec',
  },
  {
    type: 'focus',
    title: 'Focus Check',
    description: 'Tracks eye movement with a follow-the-dot challenge powered by AI.',
    icon: <Eye className="size-8" />,
    available: true,
    duration: '10 sec',
  },
];

export function ImpairmentCheckModal({
  onComplete,
  onCancel,
  onRunFocusCheck,
  onRunStabilityCheck,
}: ImpairmentCheckModalProps) {
  const [selected, setSelected] = useState<Set<ImpairmentCheckType>>(new Set());
  const [completedResults, setCompletedResults] = useState<ImpairmentResult[]>([]);
  const [runningTest, setRunningTest] = useState<ImpairmentCheckType | null>(null);
  const [testsDone, setTestsDone] = useState<Set<ImpairmentCheckType>>(new Set());

  function toggleSelection(type: ImpairmentCheckType) {
    if (testsDone.has(type)) return;
    const option = CHECK_OPTIONS.find((o) => o.type === type);
    if (!option?.available) return;

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleRunTests() {
    // For now, only focus check is implemented
    const toRun = Array.from(selected).filter((t) => !testsDone.has(t));
    if (toRun.length === 0) return;

    const nextTest = toRun[0];
    if (nextTest === 'focus' && onRunFocusCheck) {
      setRunningTest('focus');
      onRunFocusCheck((result) => {
        if (result) {
          setCompletedResults((prev) => [...prev, result]);
          setTestsDone((prev) => new Set(prev).add('focus'));
        }
        setRunningTest(null);
      });
    } else if (nextTest === 'stability' && onRunStabilityCheck) {
      setRunningTest('stability');
      onRunStabilityCheck((result) => {
        if (result) {
          setCompletedResults((prev) => [...prev, result]);
          setTestsDone((prev) => new Set(prev).add('stability'));
        }
        setRunningTest(null);
      });
    }
  }

  function handleProceedToResults() {
    onComplete(completedResults);
  }

  const hasCompletedAtLeastOne = testsDone.size > 0;
  const hasSelectedTests = selected.size > 0;
  const allSelectedDone = hasSelectedTests && Array.from(selected).every((t) => testsDone.has(t));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-6 sm:px-6 sm:py-8 text-center space-y-4 border-b">
        <div className="flex size-16 mx-auto items-center justify-center rounded-full bg-primary/10">
          <AlertTriangle className="size-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Before You Leave
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a check to assess your impairment risk.
          </p>
        </div>
      </div>

      {/* Check Options */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 sm:px-6 sm:py-5 sm:space-y-4">
        {CHECK_OPTIONS.map((option) => {
          const isSelected = selected.has(option.type);
          const isDone = testsDone.has(option.type);
          const isRunning = runningTest === option.type;

          return (
            <Card
              key={option.type}
              className={`cursor-pointer transition-all duration-200 ${
                !option.available
                  ? 'opacity-50 cursor-not-allowed'
                  : isDone
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : isSelected
                  ? 'border-primary border-2 bg-primary/5 shadow-sm'
                  : 'border-border/50 hover:border-primary/50 hover:shadow-sm'
              }`}
              onClick={() => toggleSelection(option.type)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div
                  className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                    isDone
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="size-6" /> : option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{option.title}</h3>
                    {isDone && (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Complete
                      </span>
                    )}
                    {isRunning && (
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">
                        Running...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {option.description}
                  </p>
                  <span className="text-[10px] text-muted-foreground mt-1 inline-block">
                    Duration: {option.duration}
                  </span>
                </div>
                {option.available && !isDone && (
                  <div
                    className={`size-5 rounded-full border-2 shrink-0 transition-colors ${
                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}
                  >
                    {isSelected && (
                      <svg className="size-full text-primary-foreground" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <div className="px-4 py-4 border-t space-y-2 sm:px-6 sm:py-5">
        {!allSelectedDone && hasSelectedTests && (
          <Button
            onClick={handleRunTests}
            disabled={!hasSelectedTests || !!runningTest}
            className="w-full h-12 rounded-xl"
            size="lg"
          >
            {runningTest ? 'Running...' : testsDone.size > 0 ? 'Run Next Check' : `Start ${Array.from(selected).map(t => CHECK_OPTIONS.find(o => o.type === t)?.title).join(' & ')}`}
          </Button>
        )}
        {hasCompletedAtLeastOne && (
          <Button onClick={handleProceedToResults} className="w-full h-12 rounded-xl" size="lg">
            View Results <ArrowRight className="ml-2 size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={onCancel}
          className="w-full h-12 rounded-xl text-muted-foreground"
          size="lg"
        >
          Skip Assessment
        </Button>
      </div>
    </div>
  );
}
