// ============================================================
// Shared TypeScript types for the bar tracking app
// Used by both /bartender and /customer pages
// ============================================================

export interface Customer {
  id: string;
  name: string;
  weight_lbs: number;
  gender: "male" | "female";
  /** Trusted friend's phone number for safety alerts */
  emergency_phone?: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  customer_id: string;
  /** Unique token for join URL; only someone with this link can join the session */
  join_token?: string | null;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Drink {
  id: string;
  session_id: string;
  name: string;
  volume_ml: number;
  abv: number;
  ordered_at: string;
  created_at: string;
}

/** Session enriched with customer info and drinks for the bartender view */
export interface ActiveSession extends Session {
  customer: Customer;
  drinks: Drink[];
}
