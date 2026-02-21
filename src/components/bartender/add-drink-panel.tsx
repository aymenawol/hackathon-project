"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { DRINK_MENU, MenuDrink } from "@/lib/menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AddDrinkPanelProps {
  sessionId: string;
}

export function AddDrinkPanel({ sessionId }: AddDrinkPanelProps) {
  const [adding, setAdding] = useState<string | null>(null); // id of drink being added

  async function handleAdd(drink: MenuDrink) {
    setAdding(drink.id);
    try {
      const { error } = await supabase.from("drinks").insert({
        session_id: sessionId,
        name: drink.name,
        volume_ml: drink.volume_ml,
        abv: drink.abv,
        ordered_at: new Date().toISOString(),
      });
      if (error) console.error("Failed to add drink:", JSON.stringify(error, null, 2), error.message, error.code);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight">Add Drink</h3>
      <div className="grid grid-cols-5 gap-2">
        {DRINK_MENU.map((drink) => {
          const isLoading = adding === drink.id;
          return (
            <button
              key={drink.id}
              onClick={() => handleAdd(drink)}
              disabled={adding !== null}
              className={cn(
                "group flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                "hover:border-primary hover:bg-accent",
                "active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isLoading && "border-primary bg-accent"
              )}
            >
              <span className="text-2xl">{drink.emoji}</span>
              <span className="text-xs font-medium leading-none">
                {drink.name}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {drink.description}
              </span>
              {isLoading && (
                <div className="size-3 animate-spin rounded-full border-2 border-muted border-t-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
