"use client";

import { ActiveSession } from "@/lib/types";
import { estimateBAC, bacRiskLevel, formatBAC } from "@/lib/bac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddDrinkPanel } from "@/components/bartender/add-drink-panel";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const QRCode = dynamic(
  () =>
    import("qrcode.react").then((mod) => {
      const Comp = mod?.QRCodeSVG ?? mod?.QRCodeCanvas ?? (() => null);
      return { default: Comp };
    }) as any,
  { ssr: false }
);


interface SessionDetailProps {
  session: ActiveSession;
  onEndSession: (sessionId: string) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function SessionDetail({ session, onEndSession }: SessionDetailProps) {
  const { customer, drinks } = session;
  const bac = estimateBAC(drinks, customer.weight_lbs, customer.gender);
  const risk = bacRiskLevel(bac);

  // Sort drinks newest first
  const sortedDrinks = [...drinks].sort(
    (a, b) =>
      new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime()
  );

  // BAC as percentage of 0.15 for the progress bar (cap at 100)
  const bacPercent = Math.min((bac / 0.15) * 100, 100);

  return (
    <div className="relative flex flex-1 flex-col gap-4 overflow-hidden p-6">
      {/* Header with QR Code */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Session started {formatTime(session.started_at)} ·{" "}
            {customer.weight_lbs} lbs · {customer.gender}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEndSession(session.id)}
          >
            End Session
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* BAC Card */}
        <Card
          className={cn(
            risk === "danger" && "border-destructive",
            risk === "caution" && "border-yellow-500"
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Estimated BAC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span
                className={cn(
                  "text-3xl font-bold tabular-nums",
                  risk === "danger" && "text-destructive",
                  risk === "caution" && "text-yellow-600"
                )}
              >
                {formatBAC(bac)}
              </span>
              {risk === "danger" && (
                <Badge variant="destructive" className="mb-1">
                  ⚠ Over limit
                </Badge>
              )}
              {risk === "caution" && (
                <Badge
                  variant="outline"
                  className="mb-1 border-yellow-500 text-yellow-600"
                >
                  Approaching
                </Badge>
              )}
            </div>
            <Progress
              value={bacPercent}
              className={cn(
                "mt-3 h-2",
                risk === "danger" && "[&>[data-slot=indicator]]:bg-destructive",
                risk === "caution" && "[&>[data-slot=indicator]]:bg-yellow-500"
              )}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              0.08% legal limit
            </p>
          </CardContent>
        </Card>

        {/* Total Drinks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Drinks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold tabular-nums">
              {drinks.length}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              this session
            </p>
          </CardContent>
        </Card>

        {/* Session Duration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Session Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold tabular-nums">
              {(() => {
                const mins = Math.floor(
                  (Date.now() - new Date(session.started_at).getTime()) /
                    60000
                );
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return h > 0 ? `${h}h ${m}m` : `${m}m`;
              })()}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              since {formatTime(session.started_at)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Add Drink */}
      <AddDrinkPanel sessionId={session.id} />

      <Separator />

      {/* Drink History */}
      <div className="flex flex-col gap-2 overflow-hidden">
        <h2 className="text-sm font-semibold tracking-tight">Drink History</h2>
        <ScrollArea className="flex-1">
          <div className="space-y-2 pb-4">
            {sortedDrinks.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No drinks ordered yet
              </p>
            )}
            {sortedDrinks.map((drink) => (
              <div
                key={drink.id}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{drink.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {drink.volume_ml}ml · {drink.abv}% ABV
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTime(drink.ordered_at)}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Unique join URL QR — bottom-left; customer scans to open link and join this session */}
      {session.join_token && typeof window !== "undefined" && (
        <div className="fixed bottom-6 left-6 z-40">
          <Card className="border-2 p-2 shadow-lg">
            <QRCode
              value={`${window.location.origin}/customer/join/${session.join_token}`}
              size={110}
              level="H"
              includeMargin={false}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

