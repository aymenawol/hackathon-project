"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Customer, Session } from "@/lib/types";

/**
 * Join session by unique token (from QR code URL).
 * Redirects to sign-in if not authenticated, then assigns this session to the
 * current user and redirects to /customer.
 */
export default function CustomerJoinPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params?.token === "string" ? params.token : null;
  const [status, setStatus] = useState<"loading" | "error" | "redirecting">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid link");
      return;
    }

    (async () => {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession) {
        const returnUrl = encodeURIComponent(`/customer/join/${token}`);
        router.replace(`/sign-up?redirect=${returnUrl}`);
        return;
      }

      const userId = authSession.user.id;
      const name =
        authSession.user.user_metadata?.full_name ||
        authSession.user.user_metadata?.name ||
        authSession.user.email ||
        "Guest";

      const { data: sess, error: sessErr } = await supabase
        .from("sessions")
        .select("*")
        .eq("join_token", token)
        .eq("is_active", true)
        .single();

      if (sessErr || !sess) {
        setStatus("error");
        setMessage("This link is invalid or the session has ended.");
        return;
      }

      setStatus("redirecting");

      let customerId: string;

      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("auth_user_id", userId)
        .single();w

      if (existingCustomer) {
        customerId = existingCustomer.id;
        await supabase
          .from("customers")
          .update({ name: name.trim(), weight_lbs: 150, gender: "male" })
          .eq("id", customerId);
      } else {
        const { data: newCustomer, error: createErr } = await supabase
          .from("customers")
          .insert({
            auth_user_id: userId,
            name: name.trim(),
            weight_lbs: 150,
            gender: "male",
          })
          .select("id")
          .single();
        if (createErr || !newCustomer) {
          setStatus("error");
          setMessage("Could not create profile.");
          return;
        }
        customerId = newCustomer.id;
      }

      await supabase
        .from("sessions")
        .update({ customer_id: customerId })
        .eq("id", (sess as Session).id);

      router.replace(`/customer?joined=${(sess as Session).id}`);
    })();
  }, [token, router]);

  if (status === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="text-center text-muted-foreground">{message}</p>
        <a href="/customer" className="text-primary underline">
          Go to customer app
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
      <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">
        {status === "redirecting" ? "Joining session…" : "Loading…"}
      </p>
    </div>
  );
}
