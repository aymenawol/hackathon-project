// ============================================================
// Drink menu scraped from:
// https://www.tkevinwilsonlawyer.com/library/alcohol-content-of-various-alcoholic-beverages.cfm
//
// ABV uses the midpoint of ranges. volume_ml uses standard
// serving sizes per category (beer 355ml / wine 150ml / spirit 44ml / sake 90ml).
// ============================================================

export type DrinkCategory = "Beer" | "Wine" | "Spirit" | "Other";

export interface MenuDrink {
  id: string;
  name: string;
  emoji: string;
  category: DrinkCategory;
  volume_ml: number;
  abv: number;
  description: string;
}

export const DRINK_MENU: MenuDrink[] = [
  // ── Beer ────────────────────────────────────
  {
    id: "beer-lager",
    name: "Beer (Lager)",
    emoji: "🍺",
    category: "Beer",
    volume_ml: 355,
    abv: 3.6,
    description: "12 oz · 3.2–4.0% ABV",
  },
  {
    id: "ale",
    name: "Ale",
    emoji: "🍺",
    category: "Beer",
    volume_ml: 355,
    abv: 4.5,
    description: "12 oz · 4.5% ABV",
  },
  {
    id: "porter",
    name: "Porter",
    emoji: "🍺",
    category: "Beer",
    volume_ml: 355,
    abv: 6.0,
    description: "12 oz · 6.0% ABV",
  },
  {
    id: "stout",
    name: "Stout",
    emoji: "🍺",
    category: "Beer",
    volume_ml: 355,
    abv: 7.0,
    description: "12 oz · 6.0–8.0% ABV",
  },
  {
    id: "malt-liquor",
    name: "Malt Liquor",
    emoji: "🍺",
    category: "Beer",
    volume_ml: 355,
    abv: 5.1,
    description: "12 oz · 3.2–7.0% ABV",
  },

  // ── Wine ────────────────────────────────────
  {
    id: "table-wine",
    name: "Table Wine",
    emoji: "🍷",
    category: "Wine",
    volume_ml: 150,
    abv: 10.5,
    description: "5 oz · 7.1–14.0% ABV",
  },
  {
    id: "sparkling-wine",
    name: "Sparkling Wine",
    emoji: "🥂",
    category: "Wine",
    volume_ml: 150,
    abv: 11.0,
    description: "5 oz · 8.0–14.0% ABV",
  },
  {
    id: "fortified-wine",
    name: "Fortified Wine",
    emoji: "🍷",
    category: "Wine",
    volume_ml: 90,
    abv: 19.0,
    description: "3 oz · 14.0–24.0% ABV",
  },
  {
    id: "aromatized-wine",
    name: "Aromatized Wine",
    emoji: "🍷",
    category: "Wine",
    volume_ml: 90,
    abv: 17.75,
    description: "3 oz · 15.5–20.0% ABV",
  },

  // ── Spirits ─────────────────────────────────
  {
    id: "brandy",
    name: "Brandy",
    emoji: "🥃",
    category: "Spirit",
    volume_ml: 44,
    abv: 41.5,
    description: "1.5 oz · 40.0–43.0% ABV",
  },
  {
    id: "whiskey",
    name: "Whiskey",
    emoji: "🥃",
    category: "Spirit",
    volume_ml: 44,
    abv: 57.5,
    description: "1.5 oz · 40.0–75.0% ABV",
  },
  {
    id: "vodka",
    name: "Vodka",
    emoji: "🍸",
    category: "Spirit",
    volume_ml: 44,
    abv: 45.0,
    description: "1.5 oz · 40.0–50.0% ABV",
  },
  {
    id: "gin",
    name: "Gin",
    emoji: "🍸",
    category: "Spirit",
    volume_ml: 44,
    abv: 44.25,
    description: "1.5 oz · 40.0–48.5% ABV",
  },
  {
    id: "rum",
    name: "Rum",
    emoji: "🍹",
    category: "Spirit",
    volume_ml: 44,
    abv: 67.5,
    description: "1.5 oz · 40.0–95.0% ABV",
  },
  {
    id: "tequila",
    name: "Tequila",
    emoji: "🌵",
    category: "Spirit",
    volume_ml: 44,
    abv: 47.75,
    description: "1.5 oz · 45.0–50.5% ABV",
  },
  {
    id: "aquavit",
    name: "Aquavit",
    emoji: "🥃",
    category: "Spirit",
    volume_ml: 44,
    abv: 40.0,
    description: "1.5 oz · 35.0–45.0% ABV",
  },
  {
    id: "okolehao",
    name: "Okolehao",
    emoji: "🥃",
    category: "Spirit",
    volume_ml: 44,
    abv: 40.0,
    description: "1.5 oz · 40.0% ABV",
  },

  // ── Other ───────────────────────────────────
  {
    id: "sake",
    name: "Sake",
    emoji: "🍶",
    category: "Other",
    volume_ml: 90,
    abv: 15.0,
    description: "3 oz · 14.0–16.0% ABV",
  },
];

/** All unique categories in menu order */
export const DRINK_CATEGORIES: DrinkCategory[] = ["Beer", "Wine", "Spirit", "Other"];

