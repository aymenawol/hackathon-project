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
  const { sessions, loading, endSession, createPendingSession } = useActiveSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrJoinToken, setQrJoinToken] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const selectedSession =
    sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;

  const effectiveId = selectedSession?.id ?? null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // When QR overlay is open, use the token we created for it; otherwise use selected session's token
  const joinUrl =
    (showQR && qrJoinToken)
      ? `${origin}/customer/join/${qrJoinToken}`
      : selectedSession?.join_token
        ? `${origin}/customer/join/${selectedSession.join_token}`
        : `${origin}/customer`;

  const handleShowQR = async () => {
    setShowQR(true);
    setQrLoading(true);
    setQrJoinToken(null);
    const result = await createPendingSession();
    setQrLoading(false);
    if (result) setQrJoinToken(result.join_token);
  };

  const handleCloseQR = () => {
    setShowQR(false);
    setQrJoinToken(null);
  };

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

      {/* Fixed QR code button — bottom-left: creates a new pending session and shows its unique join URL */}
      <Button
        onClick={handleShowQR}
        size="lg"
        className="fixed bottom-6 left-6 z-40 gap-2 rounded-full shadow-lg"
        disabled={qrLoading}
      >
        <QrCode className="size-5" />
        Show QR Code
      </Button>

      {/* QR overlay: session is created when this opens; customer scanning the QR "starts" and joins that session */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={handleCloseQR}
        >
          <div
            className="relative flex flex-col items-center gap-6 rounded-2xl border bg-card p-10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCloseQR}
              className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>

            <h2 className="text-xl font-semibold tracking-tight">
              Scan to join session
            </h2>
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Customer scans this code to open their unique link and start this session.
            </p>

            {qrLoading ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border-2 bg-muted/30 p-12">
                <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
                <p className="text-sm text-muted-foreground">Creating unique link…</p>
              </div>
            ) : qrJoinToken ? (
              <>
                <div className="rounded-xl border-2 bg-white p-4">
                  <QRCode value={joinUrl} size={280} level="H" includeMargin />
                </div>
                <p className="text-xs text-muted-foreground select-all break-all max-w-xs text-center">
                  {joinUrl}
                </p>
              </>
            ) : (
              <p className="text-sm text-destructive">Could not create link. Try again.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
