import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/finto/Shell";
import { useFintoState } from "@/lib/finto/storage";
import { useServerFn } from "@tanstack/react-start";
import { analyzeStatement, lookupIsin } from "@/lib/finto/finto.functions";
import type { Category, Goals, Holding, StatementProfile, StatementMonthly } from "@/lib/finto/types";
import { CATEGORY_LABELS } from "@/lib/finto/types";
import {
  applyBehavioralAdjustments,
  bandFromScore,
  BAND_LABEL,
  computeCapacityScore,
} from "@/lib/finto/allocation";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding — Finto" }] }),
  component: Onboarding,
});

const STEPS = ["Goals", "Portfolio", "Statement", "Review"] as const;

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
          <StatementStep
            goals={state.goals}
            statement={state.statement}
            setStatement={(p) => setState((s) => ({ ...s, statement: p }))}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            onSkip={() => {
              setState((s) => ({ ...s, statement: null }));
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <ReviewStep
            onBack={() => setStep(2)}
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

function StatementStep({
  goals,
  statement,
  setStatement,
  onBack,
  onNext,
  onSkip,
}: {
  goals: Goals | null;
  statement: StatementProfile | null;
  setStatement: (p: StatementProfile | null) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const analyze = useServerFn(analyzeStatement);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFilename(file.name);
    setLoading(true);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const payload: Parameters<typeof analyze>[0]["data"] = {
        horizonYears: goals?.horizonYears ?? 10,
        currency: goals?.currency ?? "EUR",
      };
      if (isPdf) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        payload.pdfBase64 = btoa(bin);
        payload.mimeType = file.type || "application/pdf";
        payload.filename = file.name;
      } else {
        payload.text = await file.text();
      }
      const res = await analyze({ data: payload });
      setStatement(res);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't analyse the file.");
    } finally {
      setLoading(false);
    }
  }


  function updateMonthly(patch: Partial<StatementMonthly>) {
    if (!statement || !goals) return;
    const monthly = { ...statement.monthly, ...patch };
    const score = computeCapacityScore(monthly, goals.horizonYears);
    const adjusted = applyBehavioralAdjustments(bandFromScore(score), statement.behavioral_flags);
    setStatement({
      ...statement,
      monthly,
      capacity_score: score,
      capacity_band: adjusted.band,
      source: "edited",
    });
  }

  return (
    <div>
      <h1 className="font-serif text-3xl mb-2">Add a bank statement (optional)</h1>
      <p className="text-muted-foreground mb-6">
        A current/checking statement covering 3–12 months lets us read your real risk capacity —
        not just what you said.
      </p>

      <div className="mb-6 rounded-2xl border border-border bg-secondary/40 p-4 text-sm leading-relaxed">
        <div className="font-medium mb-1">Privacy</div>
        Your file is analysed on the server, never stored. Only aggregated, anonymised figures —
        monthly income, essential spend, savings rate, buffer — come back. No transaction
        descriptions or counterparties are saved.
      </div>

      {!statement && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <label className="inline-block cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            {loading ? "Analysing…" : "Choose CSV or PDF"}
            <input type="file" accept=".csv,text/csv,application/pdf,.pdf" className="hidden" onChange={onFile} disabled={loading} />
          </label>
          {filename && <div className="mt-3 text-xs text-muted-foreground">{filename}</div>}
          {error && <div className="mt-3 text-xs text-destructive">{error}</div>}
          <div className="mt-6">
            <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground underline">
              Skip — I'll just use my answers
            </button>
          </div>
        </div>
      )}

      {statement && goals && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
            <h2 className="font-serif text-xl">Review what we found</h2>
            <span className="text-xs text-muted-foreground">
              Confidence: {statement.confidence} · capacity {statement.capacity_score}/100 ({BAND_LABEL[statement.capacity_band]})
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            We estimated these from your statement — correct anything that looks off.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={`Monthly income (${goals.currency})`}>
              <input
                type="number"
                className={inputCls}
                value={Math.round(statement.monthly.income_avg)}
                onChange={(e) => updateMonthly({ income_avg: +e.target.value })}
              />
            </Field>
            <Field label="Income stability">
              <select
                className={inputCls}
                value={statement.monthly.income_stability}
                onChange={(e) => updateMonthly({ income_stability: e.target.value as StatementMonthly["income_stability"] })}
              >
                <option value="stable">Stable</option>
                <option value="variable">Variable</option>
                <option value="irregular">Irregular</option>
              </select>
            </Field>
            <Field label={`Essential spend / month (${goals.currency})`}>
              <input
                type="number"
                className={inputCls}
                value={Math.round(statement.monthly.essential_spend_avg)}
                onChange={(e) => updateMonthly({ essential_spend_avg: +e.target.value })}
              />
            </Field>
            <Field label={`Discretionary spend / month (${goals.currency})`}>
              <input
                type="number"
                className={inputCls}
                value={Math.round(statement.monthly.discretionary_spend_avg)}
                onChange={(e) => updateMonthly({ discretionary_spend_avg: +e.target.value })}
              />
            </Field>
            <Field label="Savings rate (%)">
              <input
                type="number"
                className={inputCls}
                value={Math.round(statement.monthly.savings_rate * 100)}
                onChange={(e) => updateMonthly({ savings_rate: +e.target.value / 100 })}
              />
            </Field>
            <Field label="Buffer (months)">
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={statement.monthly.buffer_months}
                onChange={(e) => updateMonthly({ buffer_months: +e.target.value })}
              />
            </Field>
            <Field label="Fixed obligation ratio (%)" hint="Recurring essentials ÷ income">
              <input
                type="number"
                className={inputCls}
                value={Math.round(statement.monthly.fixed_obligation_ratio * 100)}
                onChange={(e) => updateMonthly({ fixed_obligation_ratio: +e.target.value / 100 })}
              />
            </Field>
            <Field label="Expense volatility">
              <select
                className={inputCls}
                value={statement.monthly.expense_volatility}
                onChange={(e) => updateMonthly({ expense_volatility: e.target.value as StatementMonthly["expense_volatility"] })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>

          {statement.notes.length > 0 && (
            <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
              {statement.notes.map((n, i) => (
                <li key={i}>— {n}</li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => {
                setStatement(null);
                setFilename(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Discard and re-upload
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
        <button
          onClick={onNext}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
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
        Next we'll show your current split across the four categories, the target plan derived from your
        goals and (if provided) your statement, and the 2–3 gaps that matter most.
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
