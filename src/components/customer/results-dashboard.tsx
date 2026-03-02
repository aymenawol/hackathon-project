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
  X,
} from 'lucide-react';

interface ResultsDashboardProps {
  assessment: RiskAssessment;
  projectedMinutes?: number;
  onTalkToAI: () => void;
  onClose: () => void;
}

function getRiskDisplay(level: string) {
  switch (level) {
    case 'Low':
      return {
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        icon: <ShieldCheck className="size-6 text-emerald-500" />,
        label: 'Low Risk',
      };
    case 'Elevated':
      return {
        color: 'text-amber-500',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        icon: <ShieldAlert className="size-6 text-amber-500" />,
        label: 'Elevated Risk',
      };
    case 'High':
      return {
        color: 'text-orange-500',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        icon: <AlertTriangle className="size-6 text-orange-500" />,
        label: 'High Risk',
      };
    case 'Severe':
      return {
        color: 'text-rose-500',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        icon: <AlertOctagon className="size-6 text-rose-500" />,
        label: 'Severe Risk',
      };
    default:
      return {
        color: 'text-muted-foreground',
        bg: 'bg-muted',
        border: 'border-muted',
        icon: <ShieldCheck className="size-6" />,
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
}: ResultsDashboardProps) {
  const riskDisplay = getRiskDisplay(assessment.impairmentRiskLevel);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-h-[92dvh] sm:max-w-lg rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`px-4 py-4 ${riskDisplay.bg} border-b flex items-center justify-between sm:px-6 sm:py-5`}>
          <div className="flex items-center gap-2 sm:gap-3">
            {riskDisplay.icon}
            <div>
              <h2 className="text-base font-bold sm:text-lg">Impairment Check Results</h2>
              <p className={`text-xs font-semibold ${riskDisplay.color} sm:text-sm`}>
                Performance-Based Impairment Risk: {riskDisplay.label}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/10">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 sm:px-6 sm:py-4 sm:space-y-4">
          {/* Overall Risk Score */}
          <Card className={`border ${riskDisplay.border}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Overall Risk Score</span>
                <span className={`text-2xl font-bold ${riskDisplay.color}`}>
                  {assessment.finalRiskScore}/100
                </span>
              </div>
              <Progress
                value={assessment.finalRiskScore}
                className={`h-2 ${
                  assessment.finalRiskScore >= 70 ? '[&>[data-slot=indicator]]:bg-rose-500' :
                  assessment.finalRiskScore >= 40 ? '[&>[data-slot=indicator]]:bg-amber-500' :
                  '[&>[data-slot=indicator]]:bg-emerald-500'
                }`}
              />
            </CardContent>
          </Card>

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

          {/* Individual Test Results */}
          {assessment.checks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Check Results</h3>
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

          {/* Confidence Level */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Confidence Level</span>
              <div className="text-right">
                <span className="text-sm font-bold capitalize">{assessment.confidenceLevel}</span>
                <span className="text-xs text-muted-foreground ml-1">({assessment.confidenceScore}%)</span>
              </div>
            </CardContent>
          </Card>

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
          <Button onClick={onTalkToAI} className="w-full h-11 rounded-xl sm:h-12" size="lg">
            <MessageCircle className="mr-2 size-5" />
            Talk to AI About My Results
          </Button>
        </div>

        {/* Disclaimer Footer */}
        <div className="px-6 py-3 border-t bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Estimates are based on behavioral modeling and population averages. Individual variation
            applies. This is not a legal determination of sobriety.
          </p>
        </div>
      </div>
    </div>
  );
}
