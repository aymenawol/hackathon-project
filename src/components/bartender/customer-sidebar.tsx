"use client";

import { ActiveSession } from "@/lib/types";
import { estimateBAC, formatBAC } from "@/lib/bac";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import Image from "next/image";

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
    <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar h-full">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Image src="/logo1.png" alt="Woozy" width={32} height={32} className="h-6 w-auto object-contain" />
          <h2 className="text-sm font-semibold tracking-tight">
            Active Customers
          </h2>
        </div>
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
              session.customer.weight_lbs,
              session.customer.gender
            );
            const overLimit = bac >= 0.08;
            const isSelected = selectedId === session.id;

            return (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer",
                  isSelected && "bg-accent"
                )}
              >
                <Avatar className="size-8">
                  <AvatarFallback
                    className="text-xs font-medium"
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
                  <span className={cn(
                    "text-xs text-muted-foreground",
                    overLimit && "text-destructive font-medium"
                  )}>
                    {session.drinks.length} drink
                    {session.drinks.length !== 1 && "s"} ·{" "}
                    {formatBAC(bac)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="border-t px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Appearance</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
