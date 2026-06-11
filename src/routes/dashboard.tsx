import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/finto/Shell";
import { useFintoState } from "@/lib/finto/storage";
import { summarizeState, BAND_LABEL } from "@/lib/finto/allocation";
import { CATEGORY_LABELS, type Allocation, type Category } from "@/lib/finto/types";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Your allocation — Finto" }] }),
  component: Dashboard,
});

const COLOR: Record<Category, string> = {
  equities: "var(--equities)",
  liquidity: "var(--liquidity)",
  real_estate: "var(--real-estate)",
  commodities: "var(--commodities)",
};

function Dashboard() {
  const { state, hydrated } = useFintoState();
  if (!hydrated) return <Shell><div className="p-10" /></Shell>;

  const summary = summarizeState(state);
  if (!summary || !state.goals) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl px-5 py-20 text-center">
          <h1 className="font-serif text-3xl mb-3">No plan yet.</h1>
          <p className="text-muted-foreground mb-6">Tell us your goals and holdings first.</p>
          <Link to="/onboarding" className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
            Start onboarding
          </Link>
        </div>
      </Shell>
    );
  }

  const { agg, target, gaps } = summary;
  const topGaps = gaps.filter((g) => Math.abs(g.delta) >= 3).slice(0, 3);
  const stmt = state.statement;

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="font-serif text-3xl mb-2">Your allocation</h1>
        <p className="text-muted-foreground mb-6">
          Total portfolio: <span className="text-foreground font-medium">{agg.total.toLocaleString()} {state.goals.currency}</span>
        </p>

        {stmt && (
          <div className="mb-8 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
              <h2 className="font-serif text-xl">Capacity & comfort</h2>
              <span className="text-xs text-muted-foreground">
                Score {stmt.capacity_score}/100 · confidence {stmt.confidence}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your finances support <span className="text-foreground font-medium">{BAND_LABEL[stmt.capacity_band]}</span> risk.
              You said you're comfortable with <span className="text-foreground font-medium">{BAND_LABEL[target.tolerance]}</span>.
              We size the plan to the lower of the two — <span className="text-foreground font-medium">{BAND_LABEL[target.governing]}</span> —
              because a plan you can hold beats one you'd panic-sell.
            </p>
            {target.notes.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {target.notes.map((n, i) => (
                  <li key={i} className="text-muted-foreground">— {n}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <AllocationCard title="Today" allocation={agg.pct} />
          <AllocationCard title="Target plan" allocation={target.allocation} />
        </div>

        <section className="mt-12">
          <h2 className="font-serif text-2xl mb-4">What to do, in plain English</h2>
          {topGaps.length === 0 ? (
            <p className="text-muted-foreground">You're close to plan. Hold steady. Most damage to long-term returns happens by reacting.</p>
          ) : (
            <ul className="space-y-3">
              {topGaps.map((g) => (
                <li key={g.category} className="rounded-2xl border border-border bg-card p-5 flex gap-4">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR[g.category] }} />
                  <div>
                    <div className="font-medium">
                      {g.delta > 0 ? "Increase" : "Reduce"} {CATEGORY_LABELS[g.category]} exposure by ~{Math.abs(g.delta).toFixed(0)} pts
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{rationale(g.category, g.delta)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground mt-6">
            We never name a product. Think in asset classes — the vehicle is secondary.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/coach" className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            Ask the coach
          </Link>
          <Link to="/onboarding" className="rounded-full border border-border px-6 py-2.5 text-sm font-medium hover:bg-secondary">
            Edit plan
          </Link>
        </div>
      </div>
    </Shell>
  );
}

function rationale(c: Category, delta: number) {
  const more = delta > 0;
  if (c === "equities") return more
    ? "Equities are productive capital — the real growth engine. Long-horizon money belongs here. Increase global equity exposure."
    : "You're heavier in equities than your horizon and risk capacity suggest. Reduce equity exposure to match plan.";
  if (c === "liquidity") return more
    ? "Liquidity exists for stability and near-term needs, not returns. Add cash/short bonds to cover what you actually need soon."
    : "Excess cash is a slow leak. Liquidity should be sized to needs and buffer — not held for safety theater.";
  if (c === "real_estate") return more
    ? "Real estate in this app is consumption, not growth. We don't recommend adding it for returns."
    : "Real estate is a vehicle, not a growth investment. Reweight toward equities for the growth engine.";
  return more
    ? "Add a small commodities/gold sleeve as crisis insurance. Keep it single-digit."
    : "Commodities are returnless insurance. Trim if you're holding too much — it's a drag in normal times.";
}

function AllocationCard({ title, allocation }: { title: string; allocation: Allocation }) {
  const data = (Object.keys(allocation) as Category[])
    .map((k) => ({ name: CATEGORY_LABELS[k], key: k, value: Math.max(0, allocation[k]) }))
    .filter((d) => d.value > 0.01);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="font-serif text-lg mb-4">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={56} outerRadius={86} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.key} fill={COLOR[d.key as Category]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => `${v.toFixed(1)}%`}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-4 space-y-2">
        {(Object.keys(allocation) as Category[]).map((k) => (
          <li key={k} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR[k] }} />
              {CATEGORY_LABELS[k]}
            </span>
            <span className="tabular-nums text-muted-foreground">{allocation[k].toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
