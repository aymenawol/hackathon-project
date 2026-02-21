"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronLeft, Video, Phone } from "lucide-react";

interface SmsMessage {
  id: string;
  phone_number: string;
  message: string;
  type: "high-risk" | "session-ended";
  customer_name: string;
  created_at: string;
}

export default function FriendPage() {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  const addMessages = useCallback((newMsgs: SmsMessage[]) => {
    setMessages((prev) => {
      const toAdd = newMsgs.filter((m) => !seenIdsRef.current.has(m.id));
      if (toAdd.length === 0) return prev;
      toAdd.forEach((m) => seenIdsRef.current.add(m.id));
      const merged = [...prev, ...toAdd].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return merged;
    });
  }, []);

  useEffect(() => {
    // Initial fetch — load all messages
    (async () => {
      const { data } = await supabase
        .from("sms_messages")
        .select("*")
        .order("created_at", { ascending: true });
      if (data && data.length > 0) addMessages(data as SmsMessage[]);
    })();

    // Realtime subscription for new inserts
    const channel = supabase
      .channel("friend-sms-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages" },
        (payload) => {
          addMessages([payload.new as SmsMessage]);
        }
      )
      .subscribe();

    // Polling fallback every 3 seconds
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("sms_messages")
        .select("*")
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        addMessages(data as SmsMessage[]);
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [addMessages]);

  // Get the customer name from the latest message for the header
  const contactName = messages.length > 0
    ? messages[messages.length - 1].customer_name.split(" ")[0]
    : "SOBR";

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
            <p className="text-sm text-gray-400">No messages yet</p>
          </div>
        )}

        {messages.map((msg, i) => {
          // Show time separator if first message or > 5 min gap
          const prev = i > 0 ? messages[i - 1] : null;
          const currTime = new Date(msg.created_at).getTime();
          const prevTime = prev ? new Date(prev.created_at).getTime() : 0;
          const showTime = !prev || (currTime - prevTime > 5 * 60 * 1000);

          return (
            <div key={msg.id}>
              {showTime && (
                <p className="my-2 text-center text-[11px] font-medium text-gray-400">
                  {new Date(msg.created_at).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {/* iMessage-style gray received bubble */}
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-gray-200 px-3.5 py-2 dark:bg-gray-800">
                  <p className="text-[15px] leading-snug text-black dark:text-white">
                    {msg.message}
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
