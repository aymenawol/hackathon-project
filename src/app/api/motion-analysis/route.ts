import { NextRequest, NextResponse } from "next/server";

/**
 * Rule-based fallback when OpenAI is unavailable.
 */
function getRuleBasedVerdict(score: number) {
  const verdict =
    score >= 0.45 ? "impaired" : score >= 0.25 ? "slightly_impaired" : "sober";
  return {
    verdict,
    confidence: 0.6,
    explanation:
      score >= 0.45
        ? "Your gait data shows excessive sway and irregular steps consistent with impairment."
        : score >= 0.25
        ? "Some irregularity detected in your movement, but nothing conclusive."
        : "Your walking pattern looks steady. No signs of impairment detected.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { metrics, score, label } = body as {
      metrics: {
        accMean: number;
        accStd: number;
        accCv: number;
        gyroMean: number;
        gyroStd: number;
        jerkMean: number;
        jerkStd: number;
        lateralStd: number;
        sampleCount: number;
      };
      score: number;
      label: string;
    };

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(getRuleBasedVerdict(score));
    }

    const systemPrompt = `You are an AI clinical analyst for the Woozy bar app. You receive motion-sensor balance analysis metrics from a phone held to the user's chest while they stand on one leg, and assess the user's impairment level.

METRICS EXPLANATION (phone held to chest while standing on one leg):
- acc_std (acceleration standard deviation): sober one-leg balance ≈ 1–2.5 m/s², impaired > 3.5 m/s².
- acc_cv (coefficient of variation of accel magnitude): sober < 0.30, impaired > 0.40.
- gyro_std (gyroscope std dev): sober ≈ 0.3–0.7 rad/s, impaired > 1.0 rad/s.
- jerk_mean (average rate-of-change of accel): sober < 10 m/s³, impaired > 15 m/s³.
- lateral_std (x-axis sway): sober < 2.0 m/s², impaired > 3.0 m/s².

CONTEXT:
- Data comes from a phone's DeviceMotion API, not lab equipment. Expect noise.
- Be LENIENT. Only flag impairment if multiple metrics are clearly abnormal.
- People walk differently — some have unsteady gaits naturally.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "verdict": "sober" | "slightly_impaired" | "impaired",
  "confidence": 0.0-1.0,
  "explanation": "1-2 sentence explanation for the user"
}`;

    const userMessage = `Motion gait analysis results:
- Acceleration mean: ${metrics.accMean} m/s²
- Acceleration std: ${metrics.accStd} m/s²
- Acceleration CV: ${metrics.accCv}
- Gyroscope mean: ${metrics.gyroMean} rad/s
- Gyroscope std: ${metrics.gyroStd} rad/s
- Jerk mean: ${metrics.jerkMean} m/s³
- Jerk std: ${metrics.jerkStd} m/s³
- Lateral sway std: ${metrics.lateralStd} m/s²
- Sample count: ${metrics.sampleCount}
- Rule-based label: ${label} (score: ${score})

Based on these gait metrics, what is your assessment?`;

    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const cleaned = raw
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      return NextResponse.json(parsed);
    } catch (aiError) {
      console.error("OpenAI call failed for motion analysis:", aiError);
      return NextResponse.json(getRuleBasedVerdict(score));
    }
  } catch (error) {
    console.error("Motion analysis API error:", error);
    return NextResponse.json(getRuleBasedVerdict(0.2));
  }
}
