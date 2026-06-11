export type Category = "equities" | "real_estate" | "liquidity" | "commodities";

export const CATEGORY_LABELS: Record<Category, string> = {
  equities: "Equities",
  real_estate: "Real Estate",
  liquidity: "Liquidity & Debt",
  commodities: "Commodities",
};

export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  equities: "Productive capital — the long-term growth engine.",
  real_estate: "Treated as consumption, not portfolio growth.",
  liquidity: "Cash, deposits, bonds — pure stability and crisis safety.",
  commodities: "Returnless crisis insurance, e.g. gold. Small sleeve only.",
};

export type Allocation = Record<Category, number>; // percentages 0-100, sum ~= 100

export interface Goals {
  age: number;
  horizonYears: number;
  monthlySavings: number;
  emergencyFundMonths: number;
  nearTermNeeds: number;
  riskTolerance: "low" | "medium" | "high";
  lifeGoals: string;
  currency: string;
}

export interface Holding {
  id: string;
  name: string;
  amount: number;
  isin?: string;
  category?: Category;
  allocation?: Allocation;
}

export type CapacityBand = "very_low" | "low" | "medium" | "high" | "very_high";
export type IncomeStability = "stable" | "variable" | "irregular";
export type Volatility = "low" | "medium" | "high";

export interface StatementMonthly {
  income_avg: number;
  income_stability: IncomeStability;
  essential_spend_avg: number;
  discretionary_spend_avg: number;
  savings_rate: number; // 0..1
  buffer_months: number;
  fixed_obligation_ratio: number; // 0..1
  expense_volatility: Volatility;
}

export interface StatementProfile {
  monthly: StatementMonthly;
  behavioral_flags: string[];
  capacity_score: number; // 0..100
  capacity_band: CapacityBand;
  notes: string[];
  confidence: "high" | "medium" | "low";
  source: "llm" | "placeholder" | "edited";
}

export interface FintoState {
  goals: Goals | null;
  holdings: Holding[];
  statement: StatementProfile | null;
}

export const EMPTY_ALLOCATION: Allocation = {
  equities: 0,
  real_estate: 0,
  liquidity: 0,
  commodities: 0,
};
