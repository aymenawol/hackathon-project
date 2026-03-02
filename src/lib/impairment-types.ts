// ============================================================
// Extended types for the AI Impairment Check system
// ============================================================

/** The three types of impairment checks */
export type ImpairmentCheckType = "stability" | "reaction" | "focus";

/** Result from a single impairment check */
export interface ImpairmentResult {
  type: ImpairmentCheckType;
  /** Raw metrics collected during the test */
  rawMetrics: Record<string, number>;
  /** Percentage delta from personal baseline */
  baselineDelta: number;
  /** Contribution score to overall impairment (0–100) */
  impairmentContributionScore: number;
  /** Timestamp when test was completed */
  completedAt: string;
}

/** BAC range instead of single value */
export interface BACRange {
  estimatedBACLow: number;
  estimatedBACHigh: number;
  midpoint: number;
}

/** Risk levels (never "legally drunk" or "safe to drive") */
export type ImpairmentRiskLevel = "Low" | "Elevated" | "High" | "Severe";

/** Confidence level based on how many tests were taken */
export type ConfidenceLevel = "low" | "medium" | "high";

/** Final risk assessment after impairment checks */
export interface RiskAssessment {
  finalRiskScore: number;
  impairmentRiskLevel: ImpairmentRiskLevel;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  bacRange: BACRange;
  checks: ImpairmentResult[];
  /** Projected minutes until high risk (if still drinking) */
  projectedHighRiskMinutes?: number;
}

/** User profile with baseline measurements for personalization */
export interface UserProfile {
  age?: number;
  weight: number;
  biologicalSex: string;
  baselineReactionTime: number;
  baselineStabilityVariance: number;
  baselineFocusScore: number;
  /** Average BAC elimination rate (default 0.015 BAC/hr) */
  avgEliminationRate: number;
  sessionHistory: SessionHistoryEntry[];
}

/** Lightweight representation of a past session */
export interface SessionHistoryEntry {
  sessionId: string;
  startTime: string;
  endTime: string;
  drinkCount: number;
  estimatedBACRange: BACRange;
  finalRiskScore: number;
  confidenceScore: number;
  userReportedImpaired?: boolean;
}

/** Drink event with computed alcohol grams */
export interface DrinkEvent {
  timestamp: string;
  drinkType: string;
  estimatedAlcoholGrams: number;
  volume_ml: number;
  abv: number;
}

/** Default baseline values for new users */
export const DEFAULT_USER_PROFILE: UserProfile = {
  weight: 150,
  biologicalSex: "male",
  baselineReactionTime: 250, // ms
  baselineStabilityVariance: 0.5, // normalized sway metric
  baselineFocusScore: 85, // 0–100
  avgEliminationRate: 0.015, // BAC/hr
  sessionHistory: [],
};
