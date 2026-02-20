"use client";

import { ActiveSession } from "@/lib/types";
import { estimateBAC, bacRiskLevel, formatBAC } from "@/lib/bac";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CustomerSidebarProps {
  sessions: ActiveSession[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
}

export function CustomerSidebar({
  sessions,
  selectedId,
  onSelect,
}: CustomerSidebarProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Active Customers
        </h2>
        <p className="text-xs text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {sessions.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No active sessions
            </p>
          )}

          {sessions.map((session) => {
            const bac = estimateBAC(
              session.drinks,
              session.customer.weight_kg,
              session.customer.gender
            );
            const risk = bacRiskLevel(bac);
            const isSelected = selectedId === session.id;

            return (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  isSelected && "bg-accent",
                  risk === "danger" &&
                    "border border-destructive/50 bg-destructive/5"
                )}
              >
                <Avatar className="size-8">
                  <AvatarFallback
                    className={cn(
                      "text-xs font-medium",
                      risk === "danger" &&
                        "bg-destructive text-white",
                      risk === "caution" &&
                        "bg-yellow-500 text-white"
                    )}
                  >
                    {session.customer.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex flex-1 flex-col overflow-hidden">
                  <span className="truncate font-medium">
                    {session.customer.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {session.drinks.length} drink
                    {session.drinks.length !== 1 && "s"} ·{" "}
                    {formatBAC(bac)}
                  </span>
                </div>

                {risk === "danger" && (
                  <Badge variant="destructive" className="shrink-0 text-[10px]">
                    HIGH
                  </Badge>
                )}
                {risk === "caution" && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-yellow-500 text-[10px] text-yellow-600"
                  >
                    WARN
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
