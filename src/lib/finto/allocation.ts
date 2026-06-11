import {
  type Allocation,
  type Category,
  type FintoState,
  type Goals,
  type Holding,
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

export function targetAllocation(goals: Goals): Allocation {
  // Derive target from horizon + risk + near-term needs.
  // Long horizon + high risk → equity heavy.
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
  // Real estate is consumption, not part of growth target.
  const real_estate = 0;
  const liquidity = Math.max(5, 100 - equities - commodities - real_estate);
  // normalize
  const sum = equities + liquidity + commodities + real_estate;
  return {
    equities: (equities / sum) * 100,
    liquidity: (liquidity / sum) * 100,
    commodities: (commodities / sum) * 100,
    real_estate: (real_estate / sum) * 100,
  };
}

export function gaps(current: Allocation, target: Allocation) {
  return (Object.keys(target) as Category[])
    .map((k) => ({ category: k, current: current[k], target: target[k], delta: target[k] - current[k] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function summarizeState(state: FintoState) {
  if (!state.goals) return null;
  const agg = aggregateCurrent(state.holdings);
  const target = targetAllocation(state.goals);
  return { agg, target, gaps: gaps(agg.pct, target) };
}
