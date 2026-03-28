'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RiskAssessment, ImpairmentResult } from '@/lib/impairment-types';
import { formatBACRange } from '@/lib/bac-range';
import { formatPrediction } from '@/lib/predictive';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  Eye,
  Activity,
  Zap,
  MessageCircle,
  TrendingUp,
  LogOut,
  ChevronLeft,
  Shield,
} from 'lucide-react';

interface ResultsDashboardProps {
  assessment: RiskAssessment;
  projectedMinutes?: number;
  onTalkToAI: () => void;
  onClose: () => void;
  onEndSession: () => void;
}

function getRiskDisplay(level: string) {
  switch (level) {
    case 'Low':
      return {
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        icon: <ShieldCheck className="size-8 text-emerald-500" />,
        bigIcon: <ShieldCheck className="size-12 text-emerald-500" />,
        label: 'Low Risk',
      };
    case 'Elevated':
      return {
        color: 'text-amber-500',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        icon: <ShieldAlert className="size-8 text-amber-500" />,
        bigIcon: <ShieldAlert className="size-12 text-amber-500" />,
        label: 'Elevated Risk',
      };
    case 'High':
      return {
        color: 'text-orange-500',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        icon: <AlertTriangle className="size-8 text-orange-500" />,
        bigIcon: <AlertTriangle className="size-12 text-orange-500" />,
        label: 'High Risk',
      };
    case 'Severe':
      return {
        color: 'text-rose-500',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        icon: <AlertOctagon className="size-8 text-rose-500" />,
        bigIcon: <AlertOctagon className="size-12 text-rose-500" />,
        label: 'Severe Risk',
      };
    default:
      return {
        color: 'text-muted-foreground',
        bg: 'bg-muted',
        border: 'border-muted',
        icon: <ShieldCheck className="size-8" />,
        bigIcon: <ShieldCheck className="size-12" />,
        label: 'Unknown',
      };
  }
}

function getCheckIcon(type: string) {
  switch (type) {
    case 'stability': return <Activity className="size-4" />;
    case 'reaction': return <Zap className="size-4" />;
    case 'focus': return <Eye className="size-4" />;
    default: return null;
  }
}

function getCheckLabel(type: string) {
  switch (type) {
    case 'stability': return 'Stability Score';
    case 'reaction': return 'Reaction Score';
    case 'focus': return 'Focus Score';
    default: return type;
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-rose-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-emerald-500';
}

function scoreBarColor(score: number): string {
  if (score >= 70) return '[&>[data-slot=indicator]]:bg-rose-500';
  if (score >= 40) return '[&>[data-slot=indicator]]:bg-amber-500';
  return '[&>[data-slot=indicator]]:bg-emerald-500';
}

export function ResultsDashboard({
  assessment,
  projectedMinutes,
  onTalkToAI,
  onClose,
  onEndSession,
}: ResultsDashboardProps) {
  const riskDisplay = getRiskDisplay(assessment.impairmentRiskLevel);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Header with back button */}
      <div className="px-4 py-3 border-b flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
          <ChevronLeft className="size-5 text-muted-foreground" />
        </button>
        <h2 className="text-lg font-bold">Assessment Results</h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 sm:px-6">
        {/* Risk Hero */}
        <div className="text-center space-y-3 py-2">
          <div className={`flex size-16 mx-auto items-center justify-center rounded-2xl ${riskDisplay.bg}`}>
            {riskDisplay.bigIcon}
          </div>
          <div>
            <p className={`text-sm font-semibold ${riskDisplay.color}`}>
              {riskDisplay.label}
            </p>
            <p className={`text-3xl font-black ${riskDisplay.color}`}>
              {assessment.finalRiskScore}/100
            </p>
          </div>
          <Progress
            value={assessment.finalRiskScore}
            className={`h-2.5 max-w-xs mx-auto ${
              assessment.finalRiskScore >= 70 ? '[&>[data-slot=indicator]]:bg-rose-500' :
              assessment.finalRiskScore >= 40 ? '[&>[data-slot=indicator]]:bg-amber-500' :
              '[&>[data-slot=indicator]]:bg-emerald-500'
            }`}
          />
        </div>

        {/* BAC Range */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Estimated BAC Range</span>
              <span className="text-lg font-bold tabular-nums">
                {formatBACRange(assessment.bacRange)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Range accounts for ±25% absorption variance
            </p>
          </CardContent>
        </Card>

        {/* Confidence */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-muted-foreground">Confidence Level</span>
              <p className="text-sm font-bold capitalize">{assessment.confidenceLevel} <span className="text-muted-foreground font-normal">({assessment.confidenceScore}%)</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Individual Test Results */}
        {assessment.checks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1">Check Results</h3>
            {assessment.checks.map((check: ImpairmentResult, idx: number) => (
              <Card key={idx}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getCheckIcon(check.type)}
                      <span className="text-sm font-medium">{getCheckLabel(check.type)}</span>
                    </div>
                    <span className={`text-lg font-bold ${scoreColor(check.impairmentContributionScore)}`}>
                      {check.impairmentContributionScore}/100
                    </span>
                  </div>
                  <Progress
                    value={check.impairmentContributionScore}
                    className={`h-1.5 ${scoreBarColor(check.impairmentContributionScore)}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {check.baselineDelta > 0
                      ? `${check.baselineDelta.toFixed(0)}% deviation from your personal baseline`
                      : 'Within baseline range'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Predictive */}
        {projectedMinutes !== undefined && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="size-5 text-primary shrink-0" />
              <p className="text-sm font-medium">
                {formatPrediction(projectedMinutes)}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Talk to AI button */}
        <Button onClick={onTalkToAI} className="w-full h-12 rounded-xl" size="lg">
          <MessageCircle className="mr-2 size-5" />
          Talk to AI About My Results
        </Button>

        {/* End Session button */}
        <Button
          onClick={onEndSession}
          variant="destructive"
          className="w-full h-12 rounded-xl"
          size="lg"
        >
          <LogOut className="mr-2 size-5" />
          End Session
        </Button>
      </div>

      {/* Disclaimer Footer */}
      <div className="px-6 py-3 border-t bg-muted/30 shrink-0">
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          Estimates are based on behavioral modeling and population averages. Individual variation
          applies. This is not a legal determination of sobriety.
        </p>
      </div>
    </div>
  );
}
