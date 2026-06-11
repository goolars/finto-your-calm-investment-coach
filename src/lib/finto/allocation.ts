import {
  type Allocation,
  type CapacityBand,
  type Category,
  type FintoState,
  type Goals,
  type Holding,
  type StatementMonthly,
  type StatementProfile,
  EMPTY_ALLOCATION,
} from "./types";

export function aggregateCurrent(holdings: Holding[]): {
  total: number;
  byCategory: Allocation;
  pct: Allocation;
} {
  const byCategory: Allocation = { ...EMPTY_ALLOCATION };
  let total = 0;
  for (const h of holdings) {
    total += h.amount;
    if (h.allocation) {
      for (const k of Object.keys(byCategory) as Category[]) {
        byCategory[k] += (h.amount * (h.allocation[k] ?? 0)) / 100;
      }
    } else if (h.category) {
      byCategory[h.category] += h.amount;
    }
  }
  const pct: Allocation = { ...EMPTY_ALLOCATION };
  if (total > 0) {
    for (const k of Object.keys(byCategory) as Category[]) {
      pct[k] = (byCategory[k] / total) * 100;
    }
  }
  return { total, byCategory, pct };
}

// ---------------- Capacity scoring ----------------

export const CAPACITY_WEIGHTS = {
  savings_rate: 0.3,
  income_stability: 0.2,
  buffer_months: 0.2,
  fixed_obligation: 0.15,
  horizon: 0.15,
} as const;

const BANDS: CapacityBand[] = ["very_low", "low", "medium", "high", "very_high"];

export const BAND_LABEL: Record<CapacityBand, string> = {
  very_low: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very high",
};

export const EQUITY_BY_BAND: Record<CapacityBand, number> = {
  very_low: 0.25,
  low: 0.4,
  medium: 0.55,
  high: 0.7,
  very_high: 0.85,
};

export function scoreSavingsRate(r: number) {
  if (r < 0.05) return 20;
  if (r < 0.15) return 50;
  if (r < 0.3) return 75;
  return 95;
}
export function scoreIncomeStability(s: StatementMonthly["income_stability"]) {
  return s === "stable" ? 90 : s === "variable" ? 55 : 25;
}
export function scoreBuffer(m: number) {
  if (m < 3) return 25;
  if (m <= 6) return 60;
  return 90;
}
export function scoreFixedObligation(r: number) {
  if (r > 0.5) return 25;
  if (r >= 0.3) return 55;
  return 90;
}
export function scoreHorizon(years: number) {
  if (years < 3) return 20;
  if (years < 7) return 50;
  if (years <= 15) return 80;
  return 95;
}

export function computeCapacityScore(m: StatementMonthly, horizonYears: number) {
  const w = CAPACITY_WEIGHTS;
  const score =
    scoreSavingsRate(m.savings_rate) * w.savings_rate +
    scoreIncomeStability(m.income_stability) * w.income_stability +
    scoreBuffer(m.buffer_months) * w.buffer_months +
    scoreFixedObligation(m.fixed_obligation_ratio) * w.fixed_obligation +
    scoreHorizon(horizonYears) * w.horizon;
  return Math.round(score);
}

export function bandFromScore(score: number): CapacityBand {
  if (score < 30) return "very_low";
  if (score < 50) return "low";
  if (score < 70) return "medium";
  if (score < 85) return "high";
  return "very_high";
}

export function applyBehavioralAdjustments(
  band: CapacityBand,
  flags: string[],
): { band: CapacityBand; note?: string } {
  let idx = BANDS.indexOf(band);
  let note: string | undefined;
  const speculative = flags.some((f) =>
    /crypto|gambling|leverage|margin/i.test(f),
  );
  if (flags.some((f) => /existing_savings_plan|regular_savings|sip/i.test(f))) {
    if (idx < BANDS.length - 1) idx += 1;
  }
  if (speculative) {
    note =
      "We saw speculative activity. Keep it small and separate from your core plan — it doesn't change your capacity here.";
  }
  return { band: BANDS[idx], note };
}

export function toleranceBand(t: Goals["riskTolerance"]): CapacityBand {
  return t === "low" ? "low" : t === "high" ? "high" : "medium";
}

export function governingBand(capacity: CapacityBand, tolerance: CapacityBand) {
  const ci = BANDS.indexOf(capacity);
  const ti = BANDS.indexOf(tolerance);
  return BANDS[Math.min(ci, ti)];
}

export function bandGapNote(capacity: CapacityBand, tolerance: CapacityBand) {
  const diff = BANDS.indexOf(capacity) - BANDS.indexOf(tolerance);
  if (diff >= 2)
    return "Your finances could support more equity than you're comfortable with — that's fine; we've sized to your comfort. A plan you can hold beats one you'd panic-sell.";
  if (diff <= -2)
    return "You're open to more risk than your finances comfortably support right now. We've sized to capacity so a bad year doesn't force a sale.";
  return null;
}

// ---------------- Target allocation ----------------

export function legacyTarget(goals: Goals): Allocation {
  const horizon = goals.horizonYears;
  const risk = goals.riskTolerance;
  let equities = 60;
  if (horizon >= 20) equities = 85;
  else if (horizon >= 15) equities = 80;
  else if (horizon >= 10) equities = 70;
  else if (horizon >= 7) equities = 60;
  else if (horizon >= 4) equities = 45;
  else equities = 25;
  if (risk === "high") equities += 5;
  if (risk === "low") equities -= 15;
  equities = Math.max(15, Math.min(90, equities));
  const commodities = horizon >= 7 ? 5 : 3;
  const real_estate = 0;
  const liquidity = Math.max(5, 100 - equities - commodities - real_estate);
  const sum = equities + liquidity + commodities + real_estate;
  return {
    equities: (equities / sum) * 100,
    liquidity: (liquidity / sum) * 100,
    commodities: (commodities / sum) * 100,
    real_estate: (real_estate / sum) * 100,
  };
}

export interface TargetBreakdown {
  allocation: Allocation;
  governing: CapacityBand;
  capacity?: CapacityBand;
  tolerance: CapacityBand;
  liquidityFloor?: number; // currency amount (when statement present)
  bufferMonthsTarget?: number;
  notes: string[]; // why-the-picture-changed notes
}

export function targetAllocation(
  goals: Goals,
  statement: StatementProfile | null,
  portfolioTotal: number,
): TargetBreakdown {
  const tol = toleranceBand(goals.riskTolerance);
  const notes: string[] = [];

  if (!statement) {
    return {
      allocation: legacyTarget(goals),
      governing: tol,
      tolerance: tol,
      notes: ["Based on your self-reported answers. Add a bank statement later to refine the plan."],
    };
  }

  const cap = statement.capacity_band;
  const gov = governingBand(cap, tol);
  const gap = bandGapNote(cap, tol);
  if (gap) notes.push(gap);

  // Liquidity floor: 6 months of essentials + near-term needs.
  const monthsTarget = 6;
  const essentialFloor = statement.monthly.essential_spend_avg * monthsTarget;
  const floor = essentialFloor + (goals.nearTermNeeds || 0);

  // Reference "investable base" for percentages: real portfolio when known,
  // otherwise a sensible synthetic so percentages are still meaningful.
  const base = Math.max(portfolioTotal, floor + statement.monthly.income_avg * 12);

  const liquidityAmt = Math.min(base, floor);
  const surplus = Math.max(0, base - liquidityAmt);
  const equityWeight = EQUITY_BY_BAND[gov];
  const commoditiesAmt = surplus * 0.05;
  const equitiesAmt = (surplus - commoditiesAmt) * equityWeight;
  const extraLiquidityAmt = (surplus - commoditiesAmt) * (1 - equityWeight);

  const totalLiquidity = liquidityAmt + extraLiquidityAmt;
  const totalCom = commoditiesAmt;
  const totalEq = equitiesAmt;
  const sum = totalLiquidity + totalCom + totalEq;

  const allocation: Allocation = {
    equities: (totalEq / sum) * 100,
    liquidity: (totalLiquidity / sum) * 100,
    commodities: (totalCom / sum) * 100,
    real_estate: 0,
  };

  // Compare against self-reported buffer expectations.
  if (statement.monthly.buffer_months < (goals.emergencyFundMonths || 0) - 1) {
    notes.push(
      "Your statement shows a thinner cash buffer than expected, so we've increased the liquidity target.",
    );
  } else if (statement.monthly.buffer_months > (goals.emergencyFundMonths || 0) + 2) {
    notes.push(
      "Your statement shows more cash buffer than you expected. The plan can lean a bit more into equities for long-horizon money.",
    );
  }

  return {
    allocation,
    governing: gov,
    capacity: cap,
    tolerance: tol,
    liquidityFloor: floor,
    bufferMonthsTarget: monthsTarget,
    notes,
  };
}

export function gaps(current: Allocation, target: Allocation) {
  return (Object.keys(target) as Category[])
    .map((k) => ({
      category: k,
      current: current[k],
      target: target[k],
      delta: target[k] - current[k],
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function summarizeState(state: FintoState) {
  if (!state.goals) return null;
  const agg = aggregateCurrent(state.holdings);
  const target = targetAllocation(state.goals, state.statement, agg.total);
  return { agg, target, gaps: gaps(agg.pct, target.allocation) };
}
