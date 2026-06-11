import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/finto/Shell";
import { useFintoState } from "@/lib/finto/storage";
import { useServerFn } from "@tanstack/react-start";
import { lookupIsin } from "@/lib/finto/finto.functions";
import type { Category, Goals, Holding } from "@/lib/finto/types";
import { CATEGORY_LABELS } from "@/lib/finto/types";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding — Finto" }] }),
  component: Onboarding,
});

const STEPS = ["Goals", "Portfolio", "Review"] as const;

function Onboarding() {
  const { state, setState, hydrated } = useFintoState();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  if (!hydrated) return <Shell><div className="p-10" /></Shell>;

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-5 py-12">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={i === step ? "text-foreground" : ""}>{s}</span>
              {i < STEPS.length - 1 && <span>—</span>}
            </div>
          ))}
        </div>

        {step === 0 && (
          <GoalsStep
            initial={state.goals}
            onNext={(g) => {
              setState((s) => ({ ...s, goals: g }));
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <PortfolioStep
            holdings={state.holdings}
            setHoldings={(h) => setState((s) => ({ ...s, holdings: h }))}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <ReviewStep
            onBack={() => setStep(1)}
            onDone={() => navigate({ to: "/dashboard" })}
          />
        )}
      </div>
    </Shell>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

function GoalsStep({ initial, onNext }: { initial: Goals | null; onNext: (g: Goals) => void }) {
  const [g, setG] = useState<Goals>(
    initial ?? {
      age: 35,
      horizonYears: 20,
      monthlySavings: 500,
      emergencyFundMonths: 3,
      nearTermNeeds: 0,
      riskTolerance: "medium",
      lifeGoals: "",
      currency: "EUR",
    },
  );
  return (
    <div>
      <h1 className="font-serif text-3xl mb-2">Your life, briefly.</h1>
      <p className="text-muted-foreground mb-8">No login. Nothing leaves this browser.</p>
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Age">
          <input type="number" className={inputCls} value={g.age} onChange={(e) => setG({ ...g, age: +e.target.value })} />
        </Field>
        <Field label="Investment horizon (years)" hint="When do you actually need most of this money?">
          <input type="number" className={inputCls} value={g.horizonYears} onChange={(e) => setG({ ...g, horizonYears: +e.target.value })} />
        </Field>
        <Field label="Monthly savings capacity">
          <input type="number" className={inputCls} value={g.monthlySavings} onChange={(e) => setG({ ...g, monthlySavings: +e.target.value })} />
        </Field>
        <Field label="Emergency fund (months covered)">
          <input type="number" className={inputCls} value={g.emergencyFundMonths} onChange={(e) => setG({ ...g, emergencyFundMonths: +e.target.value })} />
        </Field>
        <Field label="Cash needs in next 1–5 years" hint="House, kids, sabbatical… enter total amount.">
          <input type="number" className={inputCls} value={g.nearTermNeeds} onChange={(e) => setG({ ...g, nearTermNeeds: +e.target.value })} />
        </Field>
        <Field label="Risk tolerance">
          <select
            className={inputCls}
            value={g.riskTolerance}
            onChange={(e) => setG({ ...g, riskTolerance: e.target.value as Goals["riskTolerance"] })}
          >
            <option value="low">Low — drawdowns scare me</option>
            <option value="medium">Medium — I can stomach normal cycles</option>
            <option value="high">High — I won't sell in a crash</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Life goals" hint="Plain English. e.g. 'retire at 60', 'house deposit in 8y'.">
            <textarea rows={3} className={inputCls} value={g.lifeGoals} onChange={(e) => setG({ ...g, lifeGoals: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <button
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => onNext(g)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function PortfolioStep({
  holdings,
  setHoldings,
  onBack,
  onNext,
}: {
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [draft, setDraft] = useState<{ name: string; amount: string; isin: string; category: Category | "" }>({
    name: "",
    amount: "",
    isin: "",
    category: "",
  });
  const [loading, setLoading] = useState(false);
  const lookup = useServerFn(lookupIsin);

  const total = holdings.reduce((a, b) => a + b.amount, 0);

  async function add() {
    const amount = parseFloat(draft.amount);
    if (!draft.name || !amount || amount <= 0) return;
    const id = crypto.randomUUID();
    const base: Holding = { id, name: draft.name, amount };
    if (draft.isin.trim()) {
      setLoading(true);
      try {
        const res = await lookup({ data: { isin: draft.isin.trim(), name: draft.name } });
        base.isin = draft.isin.trim();
        base.allocation = res.allocation;
      } catch (e) {
        console.error(e);
        base.category = "equities";
      } finally {
        setLoading(false);
      }
    } else if (draft.category) {
      base.category = draft.category;
    } else {
      base.category = "equities";
    }
    setHoldings([...holdings, base]);
    setDraft({ name: "", amount: "", isin: "", category: "" });
  }

  function remove(id: string) {
    setHoldings(holdings.filter((h) => h.id !== id));
  }

  return (
    <div>
      <h1 className="font-serif text-3xl mb-2">What do you already own?</h1>
      <p className="text-muted-foreground mb-8">
        Add holdings one by one. For funds and ETFs, paste the ISIN — we'll dissect it into the four categories.
      </p>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name">
            <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. World ETF / Apartment / Savings" />
          </Field>
          <Field label="Amount">
            <input type="number" className={inputCls} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="10000" />
          </Field>
          <Field label="ISIN (optional)" hint="Funds & ETFs: we'll look up the true allocation.">
            <input className={inputCls} value={draft.isin} onChange={(e) => setDraft({ ...draft, isin: e.target.value })} placeholder="IE00B4L5Y983" />
          </Field>
          <Field label="Category (if no ISIN)">
            <select
              className={inputCls}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as Category | "" })}
            >
              <option value="">Choose…</option>
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((k) => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            disabled={loading}
            onClick={add}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Looking up…" : "Add holding"}
          </button>
        </div>
      </div>

      {holdings.length > 0 && (
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-serif text-xl">Your holdings</h2>
            <div className="text-sm text-muted-foreground">
              Total: <span className="text-foreground font-medium">{total.toLocaleString()}</span>
            </div>
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {holdings.map((h) => (
              <li key={h.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{h.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.isin ? `ISIN ${h.isin} — dissected` : h.category ? CATEGORY_LABELS[h.category] : ""}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="tabular-nums">{h.amount.toLocaleString()}</div>
                  <button onClick={() => remove(h.id)} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
        <button
          onClick={onNext}
          disabled={holdings.length === 0}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ReviewStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <div>
      <h1 className="font-serif text-3xl mb-3">Ready.</h1>
      <p className="text-muted-foreground mb-8">
        Next we'll show your current split across the four categories, the target plan derived from your goals,
        and the 2–3 gaps that matter most.
      </p>
      <div className="flex justify-between">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
        <button onClick={onDone} className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          See my allocation
        </button>
      </div>
    </div>
  );
}
