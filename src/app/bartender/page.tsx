"use client";

import { useState } from "react";
import { useActiveSessions } from "@/hooks/use-active-sessions";
import { CustomerSidebar } from "@/components/bartender/customer-sidebar";
import { SessionDetail } from "@/components/bartender/session-detail";
import { Button } from "@/components/ui/button";
import { QrCode, X } from "lucide-react";
import dynamic from "next/dynamic";

const QRCode = dynamic(
  () =>
    import("qrcode.react").then((mod) => {
      const Comp = mod?.QRCodeSVG ?? mod?.QRCodeCanvas ?? (() => null);
      return { default: Comp };
    }) as any,
  { ssr: false }
) as React.ComponentType<{
  value: string;
  size?: number;
  level?: string;
  includeMargin?: boolean;
}>;

export default function BartenderPage() {
  const { sessions, loading, endSession } = useActiveSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  const selectedSession =
    sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;

  // Keep selected in sync if current selection disappears
  const effectiveId = selectedSession?.id ?? null;

  // Build customer check-in URL (works in dev and prod)
  const customerUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/customer`
      : "/customer";

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
    <div className="relative flex h-screen overflow-hidden">
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

      {/* Fixed QR code button — bottom-left */}
      <Button
        onClick={() => setShowQR(true)}
        size="lg"
        className="fixed bottom-6 left-6 z-40 gap-2 rounded-full shadow-lg"
      >
        <QrCode className="size-5" />
        Show QR Code
      </Button>

      {/* QR code fullscreen overlay */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={() => setShowQR(false)}
        >
          <div
            className="relative flex flex-col items-center gap-6 rounded-2xl border bg-card p-10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQR(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>

            <h2 className="text-xl font-semibold tracking-tight">
              Scan to Check In
            </h2>
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Customers without an active session can scan this code to get started.
            </p>

            <div className="rounded-xl border-2 bg-white p-4">
              <QRCode value={customerUrl} size={280} level="H" includeMargin />
            </div>

            <p className="text-xs text-muted-foreground select-all break-all max-w-xs text-center">
              {customerUrl}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
