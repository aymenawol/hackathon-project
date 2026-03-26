'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImpairmentResult, ImpairmentCheckType } from '@/lib/impairment-types';
import { Eye, // Focus check icon
  Activity, // Stability icon
  Zap, // Reaction icon
  Lock,
  CheckCircle2,
  ArrowRight,
  X,
} from 'lucide-react';

interface ImpairmentCheckModalProps {
  onComplete: (results: ImpairmentResult[]) => void;
  onCancel: () => void;
  onRunFocusCheck?: (onResult: (result: ImpairmentResult) => void) => void;
  onRunReactionCheck?: (onResult: (result: ImpairmentResult) => void) => void;
  onRunStabilityCheck?: (onResult: (result: ImpairmentResult) => void) => void;
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
    type: 'reaction',
    title: 'Reaction Check',
    description: 'Tests your response time with a quick colour-tap challenge.',
    icon: <Zap className="size-8" />,
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
  onRunReactionCheck,
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
        setCompletedResults((prev) => [...prev, result]);
        setTestsDone((prev) => new Set(prev).add('focus'));
        setRunningTest(null);
      });
    } else if (nextTest === 'reaction' && onRunReactionCheck) {
      setRunningTest('reaction');
      onRunReactionCheck((result) => {
        setCompletedResults((prev) => [...prev, result]);
        setTestsDone((prev) => new Set(prev).add('reaction'));
        setRunningTest(null);
      });
    } else if (nextTest === 'stability' && onRunStabilityCheck) {
      setRunningTest('stability');
      onRunStabilityCheck((result) => {
        setCompletedResults((prev) => [...prev, result]);
        setTestsDone((prev) => new Set(prev).add('stability'));
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-h-[90dvh] sm:max-w-lg rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b sm:px-6 sm:py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              Before You Close Out — Run an AI Impairment Check
            </h2>
            <p className="text-xs text-muted-foreground mt-1 sm:text-sm">
              Choose at least one check to assess your performance-based impairment risk.
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-full hover:bg-muted shrink-0 mt-0.5">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        {/* Check Options */}
        <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1 sm:px-6 sm:py-4 sm:space-y-3">
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
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'hover:border-primary/50 hover:shadow-sm'
                }`}
                onClick={() => toggleSelection(option.type)}
              >
                <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-14 ${
                      isDone
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="size-6 sm:size-8" /> : option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{option.title}</h3>
                      {!option.available && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          <Lock className="size-3" /> Coming Soon
                        </span>
                      )}
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
                    <p className="text-xs text-muted-foreground mt-0.5">
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
        <div className="px-4 py-3 border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-4">
          <div className="flex gap-2 ml-auto">
            {!allSelectedDone && hasSelectedTests && (
              <Button
                onClick={handleRunTests}
                disabled={!hasSelectedTests || !!runningTest}
              >
                {runningTest ? 'Running...' : 'Run Selected Checks'}
              </Button>
            )}
            {hasCompletedAtLeastOne && (
              <Button onClick={handleProceedToResults}>
                View Results <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
