// ============================================================
// Predefined drink menu for bartender quick-add
// Shared so /customer AI can reference the same catalog
// ============================================================

export interface MenuDrink {
  id: string;
  name: string;
  emoji: string;
  volume_ml: number;
  abv: number;
  description: string;
}

/**
 * 5 standard drink options covering the common categories.
 * volume_ml and abv are realistic defaults so BAC calculations are accurate.
 */
export const DRINK_MENU: MenuDrink[] = [
  {
    id: "beer",
    name: "Beer",
    emoji: "🍺",
    volume_ml: 355,   // 12 oz
    abv: 5.0,
    description: "12oz draft beer · 5% ABV",
  },
  {
    id: "wine",
    name: "Wine",
    emoji: "🍷",
    volume_ml: 150,   // 5 oz
    abv: 12.0,
    description: "5oz glass of wine · 12% ABV",
  },
  {
    id: "cocktail",
    name: "Cocktail",
    emoji: "🍹",
    volume_ml: 210,   // ~7 oz mixed
    abv: 14.0,
    description: "Standard mixed cocktail · 14% ABV",
  },
  {
    id: "shot",
    name: "Shot",
    emoji: "🥃",
    volume_ml: 44,    // 1.5 oz
    abv: 40.0,
    description: "1.5oz spirit shot · 40% ABV",
  },
  {
    id: "seltzer",
    name: "Hard Seltzer",
    emoji: "🫧",
    volume_ml: 355,   // 12 oz can
    abv: 5.0,
    description: "12oz hard seltzer · 5% ABV",
  },
];
