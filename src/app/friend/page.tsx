"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Smartphone, AlertTriangle, PartyPopper, Bell } from "lucide-react";

interface SmsMessage {
  id: string;
  phone_number: string;
  message: string;
  type: "high-risk" | "session-ended";
  customer_name: string;
  created_at: string;
}

export default function FriendPage() {
  const [phone, setPhone] = useState("");
  const [watching, setWatching] = useState(false);
  const [messages, setMessages] = useState<SmsMessage[]>([]);

  // Fetch existing messages for this phone + subscribe to new ones
  useEffect(() => {
    if (!watching || !phone.trim()) return;

    const normalized = phone.trim();

    // Initial fetch
    (async () => {
      const { data } = await supabase
        .from("sms_messages")
        .select("*")
        .eq("phone_number", normalized)
        .order("created_at", { ascending: false });
      if (data) setMessages(data as SmsMessage[]);
    })();

    // Realtime subscription
    const channel = supabase
      .channel(`friend-sms-${normalized}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: `phone_number=eq.${normalized}`,
        },
        (payload) => {
          setMessages((prev) => [payload.new as SmsMessage, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [watching, phone]);

  return (
    <main className="flex min-h-dvh w-full flex-col items-center bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950">
      {/* Phone bezel */}
      <div className="mt-8 mb-12 flex w-full max-w-sm flex-col">
        {/* Notch */}
        <div className="mx-auto h-6 w-36 rounded-b-2xl bg-black" />

        <div className="mx-2 overflow-hidden rounded-[2rem] border-4 border-black bg-background shadow-2xl">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-black px-6 py-2 text-[10px] text-white">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <span>5G</span>
              <span>🔋</span>
            </div>
          </div>

          {/* App header */}
          <div className="flex items-center gap-3 border-b bg-primary/5 px-5 py-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Smartphone className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">SOBR Alerts</h1>
              <p className="text-xs text-muted-foreground">Friend safety texts</p>
            </div>
          </div>

          {/* Content area */}
          <div className="min-h-[70vh] flex flex-col">
            {!watching ? (
              /* Phone number entry */
              <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                  <Bell className="size-8 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold">Friend&apos;s Phone</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter the phone number that was registered as the trusted friend to see safety alerts.
                  </p>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +1 555-123-4567"
                  className="w-full rounded-xl border bg-background px-4 py-3 text-center text-sm outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && phone.trim()) setWatching(true);
                  }}
                />
                <button
                  onClick={() => phone.trim() && setWatching(true)}
                  disabled={!phone.trim()}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  Start Watching
                </button>
              </div>
            ) : (
              /* Messages feed */
              <div className="flex flex-1 flex-col">
                {/* Watching banner */}
                <div className="mx-4 mt-4 flex items-center justify-between rounded-lg bg-emerald-500/10 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Listening for alerts to {phone}
                    </span>
                  </div>
                  <button
                    onClick={() => { setWatching(false); setMessages([]); }}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </button>
                </div>

                {/* Messages */}
                <div className="flex flex-1 flex-col gap-3 p-4">
                  {messages.length === 0 && (
                    <div className="flex flex-1 flex-col items-center justify-center text-center gap-3 py-12">
                      <Smartphone className="size-12 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">No messages yet</p>
                      <p className="text-xs text-muted-foreground">
                        Alerts will appear here in real time when your friend needs help.
                      </p>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <Card className={`border-none shadow-md ${
                        msg.type === "high-risk"
                          ? "bg-rose-50 dark:bg-rose-950/30"
                          : "bg-amber-50 dark:bg-amber-950/30"
                      }`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                              msg.type === "high-risk"
                                ? "bg-rose-500/10"
                                : "bg-amber-500/10"
                            }`}>
                              {msg.type === "high-risk" ? (
                                <AlertTriangle className="size-4 text-rose-500" />
                              ) : (
                                <PartyPopper className="size-4 text-amber-600" />
                              )}
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-semibold uppercase tracking-wider ${
                                  msg.type === "high-risk" ? "text-rose-600" : "text-amber-600"
                                }`}>
                                  {msg.type === "high-risk" ? "Safety Alert" : "Session Ended"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(msg.created_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <p className="text-sm leading-relaxed">{msg.message}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Home indicator */}
          <div className="flex justify-center py-2">
            <div className="h-1 w-28 rounded-full bg-muted-foreground/20" />
          </div>
        </div>
      </div>
    </main>
  );
}
