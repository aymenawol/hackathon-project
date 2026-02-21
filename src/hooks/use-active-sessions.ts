"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ActiveSession } from "@/lib/types";

export function useActiveSessions() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔄 Fetch only ACTIVE sessions that have a customer attached
  const fetchSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select(`
        *,
        customer:customers(*),
        drinks(*)
      `)
      .eq("is_active", true)
      .not("customer_id", "is", null); // 🚨 THIS LINE FIXES YOUR PROBLEM

    if (!error && data) {
      setSessions(data as ActiveSession[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();

    // 🔥 Realtime listeners: refresh when sessions or drinks change
    const channel = supabase
      .channel("sessions-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
        },
        () => {
          fetchSessions(); // refetch when session updates
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drinks",
        },
        () => {
          fetchSessions(); // refetch when drinks are added/updated/deleted
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSessions]);

  const createPendingSession = async () => {
    // safer UUID generation
    const joinToken =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) +
          Date.now().toString(36);
  
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        is_active: true,
        customer_id: null,
        join_token: joinToken,
      })
      .select()
      .single();
      // just adding a comment
    if (error) {
      console.error("Create session error:", error);
      return null;
    }
  
    return data;
  };

  // ❌ End session
  const endSession = async (sessionId: string) => {
    await supabase
      .from("sessions")
      .update({ is_active: false })
      .eq("id", sessionId);

    fetchSessions();
  };

  return {
    sessions,
    loading,
    createPendingSession,
    endSession,
  };
}