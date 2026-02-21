import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wnxnmxllmvilofbunlvj.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndueG5teGxsbXZpbG9mYnVubHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjgxMzIsImV4cCI6MjA4NzE0NDEzMn0.7LZjBP0CvNNKBiZ0E0BEbkoUegmpr_pf0Lnf94NiMVk";
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/sms
 * Stores a mock SMS in the sms_messages table so it appears on the /friend page.
 *
 * Body: { to: string, type: "high-risk" | "session-ended", customerName: string, bac?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { to, type, customerName, bac } = (await req.json()) as {
      to: string;
      type: "high-risk" | "session-ended";
      customerName: string;
      bac?: string;
    };

    if (!to || !type || !customerName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const firstName = customerName.split(" ")[0];

    let message: string;
    if (type === "high-risk") {
      message =
        `⚠️ SOBR Alert: Your friend ${firstName} has reached a high estimated BAC` +
        (bac ? ` (${bac})` : "") +
        `. They may need your help getting home safely tonight. Please check in on them.`;
    } else {
      message =
        `🍻 SOBR: Your friend ${firstName} just ended their drinking session. ` +
        `Please make sure they get home safely — a quick call or text goes a long way!`;
    }

    const { error } = await supabase.from("sms_messages").insert({
      phone_number: to,
      message,
      type,
      customer_name: customerName,
    });

    if (error) {
      console.error("Failed to store SMS:", error);
      return NextResponse.json({ sent: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("SMS API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
