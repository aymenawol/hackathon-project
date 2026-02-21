"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { estimateBAC, formatBAC } from "@/lib/bac";
import { ChevronLeft, Video, Phone } from "lucide-react";
import type { Session, Customer, Drink } from "@/lib/types";

interface FriendMessage {
  id: string;
  type: "high-risk" | "session-ended";
  text: string;
  time: Date;
}

export default function FriendPage() {
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [contactName, setContactName] = useState("SOBR");

  // Track which alerts we've already shown so we don't duplicate
  const shownAlertsRef = useRef(new Set<string>());

  const addMessage = (msg: FriendMessage) => {
    if (shownAlertsRef.current.has(msg.id)) return;
    shownAlertsRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg].sort((a, b) => a.time.getTime() - b.time.getTime()));

    // Auto-remove after 25 seconds
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    }, 25000);
  };

  useEffect(() => {
    let stopped = false;

    async function poll() {
      while (!stopped) {
        // 1. Find the most recent session (active or recently ended)
        const { data: sessions } = await supabase
          .from("sessions")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(1);

        const session = sessions?.[0] as Session | undefined;

        if (session) {
          // Get customer name
          const { data: custData } = await supabase
            .from("customers")
            .select("*")
            .eq("id", session.customer_id)
            .single();
          const customer = custData as Customer | null;
          const name = customer?.name || "Your friend";
          const firstName = name.split(" ")[0];
          setContactName(firstName);

          // Get drinks for this session
          const { data: drinkData } = await supabase
            .from("drinks")
            .select("*")
            .eq("session_id", session.id)
            .order("ordered_at", { ascending: true });
          const drinks = (drinkData || []) as Drink[];

          // --- High BAC alert ---
          if (customer && drinks.length > 0) {
            const bac = estimateBAC(drinks, customer.weight_lbs, customer.gender);
            if (bac >= 0.08) {
              addMessage({
                id: `highrisk-${session.id}`,
                type: "high-risk",
                text: `⚠️ SOBR Alert: ${firstName} has reached a high estimated BAC (${formatBAC(bac)}). They may need your help getting home safely tonight. Please check in on them.`,
                time: new Date(), // now
              });
            }
          }

          // --- Session ended ---
          if (!session.is_active && session.ended_at) {
            addMessage({
              id: `ended-${session.id}`,
              type: "session-ended",
              text: `🍻 SOBR: ${firstName} just ended their drinking session. Please make sure they get home safely — a quick call or text goes a long way!`,
              time: new Date(session.ended_at),
            });
          }
        }

        // Wait 3 seconds before polling again
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    poll();
    return () => { stopped = true; };
  }, []);

  return (
    <main className="flex min-h-dvh w-full flex-col bg-white dark:bg-black">
      {/* iOS-style nav bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-3 py-2 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80">
        <button className="flex items-center gap-0.5 text-blue-500">
          <ChevronLeft className="size-5" />
          <span className="text-[15px]">Back</span>
        </button>
        <div className="flex flex-col items-center">
          <div className="flex size-8 items-center justify-center rounded-full bg-gray-300 dark:bg-gray-700">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              {contactName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-[11px] font-semibold">{contactName}</span>
        </div>
        <div className="flex items-center gap-3 text-blue-500">
          <Video className="size-5" />
          <Phone className="size-4" />
        </div>
      </div>

      {/* Messages area */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-400">Waiting for your friend to check in...</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const currTime = msg.time.getTime();
          const prevTime = prev ? prev.time.getTime() : 0;
          const showTime = !prev || currTime - prevTime > 5 * 60 * 1000;

          return (
            <div key={msg.id}>
              {showTime && (
                <p className="my-2 text-center text-[11px] font-medium text-gray-400">
                  {msg.time.toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-gray-200 px-3.5 py-2 dark:bg-gray-800">
                  <p className="text-[15px] leading-snug text-black dark:text-white">
                    {msg.text}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* iMessage-style input bar */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-gray-50/80 px-3 py-2 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-gray-300 text-gray-500 dark:bg-gray-700">
            <span className="text-lg leading-none">+</span>
          </div>
          <div className="flex flex-1 items-center rounded-full border border-gray-300 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
            <span className="text-[15px] text-gray-400">iMessage</span>
          </div>
        </div>
      </div>
    </main>
  );
}
