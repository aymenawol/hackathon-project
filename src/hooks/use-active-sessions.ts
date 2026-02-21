"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ActiveSession, Customer, Session, Drink } from "@/lib/types";
import { generateJoinToken } from "@/lib/utils";

/**
 * Hook that fetches all active sessions with their customers and drinks,
 * then subscribes to realtime inserts/updates on sessions and drinks.
 */
export function useActiveSessions() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- Fetcher ----
  const fetchSessions = useCallback(async () => {
    // 1. Get active sessions
    const { data: sessionRows, error: sErr } = await supabase
      .from("sessions")
      .select("*")
      .eq("is_active", true)
      .order("started_at", { ascending: false });

    if (sErr || !sessionRows) {
      console.error("Failed to fetch sessions", sErr);
      setLoading(false);
      return;
    }

    // 2. Get all customer ids
    const customerIds = [...new Set(sessionRows.map((s: Session) => s.customer_id))];
    const { data: customerRows } = await supabase
      .from("customers")
      .select("*")
      .in("id", customerIds);

    const customersMap = new Map<string, Customer>(
      (customerRows ?? []).map((c: Customer) => [c.id, c])
    );

    // 3. Get all drinks for those sessions
    const sessionIds = sessionRows.map((s: Session) => s.id);
    const { data: drinkRows } = await supabase
      .from("drinks")
      .select("*")
      .in("session_id", sessionIds)
      .order("ordered_at", { ascending: true });

    const drinksMap = new Map<string, Drink[]>();
    for (const d of drinkRows ?? []) {
      const arr = drinksMap.get(d.session_id) ?? [];
      arr.push(d as Drink);
      drinksMap.set(d.session_id, arr);
    }

    // 4. Backfill join_token for sessions that don't have one; ensure every session has one in memory
    for (const s of sessionRows as Session[]) {
      if (!s.join_token) {
        const token = generateJoinToken();
        const { error: updateErr } = await supabase
          .from("sessions")
          .update({ join_token: token })
          .eq("id", s.id)
          .select("join_token")
          .single();
        if (updateErr) {
          console.warn("Session join_token backfill failed (RLS?):", updateErr.message);
        }
        (s as Session).join_token = token;
      }
    }

    // 5. Combine — explicitly keep join_token on each session
    const combined: ActiveSession[] = sessionRows
      .map((s: Session) => ({
        ...s,
        join_token: (s as Session).join_token ?? generateJoinToken(),
        customer: customersMap.get(s.customer_id)!,
        drinks: drinksMap.get(s.id) ?? [],
      }))
      .filter((s: ActiveSession) => s.customer); // guard against orphans

    setSessions(combined);
    setLoading(false);
  }, []);

  // ---- Initial fetch ----
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ---- Realtime subscriptions ----
  useEffect(() => {
    const channel = supabase
      .channel("bartender-realtime")
      // New drink inserted → append to correct session
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "drinks" },
        (payload) => {
          const newDrink = payload.new as Drink;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === newDrink.session_id
                ? { ...s, drinks: [...s.drinks, newDrink] }
                : s
            )
          );
        }
      )
      // Session updated (e.g. ended) → refresh or remove
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions" },
        (payload) => {
          const updated = payload.new as Session;
          if (!updated.is_active) {
            // Remove from active list
            setSessions((prev) => prev.filter((s) => s.id !== updated.id));
          } else {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === updated.id ? { ...s, ...updated, join_token: updated.join_token ?? s.join_token } : s
              )
            );
          }
        }
      )
      // New session inserted → full refetch (need customer data)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sessions" },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSessions]);

  // ---- End session ----
  const endSession = useCallback(async (sessionId: string) => {
    // Optimistically remove from UI immediately
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    const { error } = await supabase
      .from("sessions")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (error) {
      console.error("Failed to end session:", error);
      // Refetch to restore state on failure
      fetchSessions();
    }
  }, [fetchSessions]);

  return { sessions, loading, endSession, refetch: fetchSessions };
}
