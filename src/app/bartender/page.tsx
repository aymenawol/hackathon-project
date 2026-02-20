"use client";

import { useState } from "react";
import { useActiveSessions } from "@/hooks/use-active-sessions";
import { CustomerSidebar } from "@/components/bartender/customer-sidebar";
import { SessionDetail } from "@/components/bartender/session-detail";

export default function BartenderPage() {
  const { sessions, loading, endSession } = useActiveSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedSession =
    sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;

  // Keep selected in sync if current selection disappears
  const effectiveId = selectedSession?.id ?? null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading sessions…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <CustomerSidebar
        sessions={sessions}
        selectedId={effectiveId}
        onSelect={setSelectedId}
      />

      {/* Main content */}
      {selectedSession ? (
        <SessionDetail
          key={selectedSession.id}
          session={selectedSession}
          onEndSession={endSession}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold">No active sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Waiting for customers to check in…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
