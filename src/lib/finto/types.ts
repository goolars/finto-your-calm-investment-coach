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
  nearTermNeeds: number; // currency amount needed in next 1-5y
  riskTolerance: "low" | "medium" | "high";
  lifeGoals: string;
  currency: string;
}

export interface Holding {
  id: string;
  name: string;
  amount: number;
  isin?: string;
  category?: Category; // for non-ISIN entries
  allocation?: Allocation; // resolved breakdown for ISIN entries
}

export interface FintoState {
  goals: Goals | null;
  holdings: Holding[];
}

export const EMPTY_ALLOCATION: Allocation = {
  equities: 0,
  real_estate: 0,
  liquidity: 0,
  commodities: 0,
};
