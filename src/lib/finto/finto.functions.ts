import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  Allocation,
  Category,
  StatementMonthly,
  StatementProfile,
} from "./types";
import {
  applyBehavioralAdjustments,
  bandFromScore,
  computeCapacityScore,
} from "./allocation";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

function normalizeAllocation(raw: Partial<Record<Category, number>>): Allocation {
  const a: Allocation = {
    equities: Number(raw.equities ?? 0),
    real_estate: Number(raw.real_estate ?? 0),
    liquidity: Number(raw.liquidity ?? 0),
    commodities: Number(raw.commodities ?? 0),
  };
  const sum = a.equities + a.real_estate + a.liquidity + a.commodities;
  if (sum <= 0) return { equities: 0, real_estate: 0, liquidity: 100, commodities: 0 };
  return {
    equities: (a.equities / sum) * 100,
    real_estate: (a.real_estate / sum) * 100,
    liquidity: (a.liquidity / sum) * 100,
    commodities: (a.commodities / sum) * 100,
  };
}

async function callGateway(body: unknown): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

export const lookupIsin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ isin: z.string().min(8), name: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const sys = `You estimate the underlying asset-class allocation of a fund or ETF given its ISIN and (optional) name.
Return STRICT JSON only with keys: equities, real_estate, liquidity, commodities (numbers summing to ~100).
Use this taxonomy:
- equities: stocks / productive capital
- real_estate: REITs and direct real estate
- liquidity: cash, deposits, bonds, debt instruments
- commodities: gold, broad commodities
If unknown, make a reasonable estimate based on common index/category naming. Never refuse.`;
    const user = `ISIN: ${data.isin}\nName: ${data.name ?? "(unknown)"}\nReturn JSON only.`;
    let allocation: Allocation;
    let source: "estimate" | "fallback" = "estimate";
    try {
      const txt = await callGateway({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(txt) as Partial<Record<Category, number>>;
      allocation = normalizeAllocation(parsed);
    } catch (e) {
      console.error("lookupIsin fallback:", e);
      source = "fallback";
      allocation = { equities: 58, liquidity: 37, commodities: 5, real_estate: 0 };
    }
    return { allocation, source };
  });

// ---------------- analyzeStatement ----------------

const STATEMENT_SYSTEM = `You are a privacy-preserving bank-statement analyser.

You receive text from a checking/current-account statement (CSV rows or extracted PDF text).
Categorise each transaction into one of:
- income (salary, dividends received, reliable inbound flows)
- essential (rent/mortgage, utilities, groceries, insurance, transport, loan/debt service, childcare, taxes)
- discretionary (dining, shopping, leisure, travel, subscriptions for entertainment)
- transfers_savings (transfers to brokerage / savings plans / investment accounts)
- flagged (crypto exchanges, gambling, leverage products)

Then aggregate to MONTHLY averages and return STRICT JSON ONLY with this exact shape:
{
  "monthly": {
    "income_avg": number,
    "income_stability": "stable" | "variable" | "irregular",
    "essential_spend_avg": number,
    "discretionary_spend_avg": number,
    "savings_rate": number,            // 0..1 ; (income - essential - discretionary) / income
    "buffer_months": number,           // estimate; if current balance unknown, infer from inflows/outflows
    "fixed_obligation_ratio": number,  // 0..1 ; recurring essentials / income
    "expense_volatility": "low" | "medium" | "high"
  },
  "behavioral_flags": string[],        // e.g. ["existing_savings_plan", "crypto_activity", "gambling_activity"]
  "notes": string[],                   // 1-3 short plain-English observations
  "confidence": "high" | "medium" | "low"
}

Privacy rules:
- Do NOT echo transaction descriptions, counterparties, or personal identifiers in notes or anywhere else.
- Only return aggregates and short, generic observations.
- If data is insufficient, set confidence to "low" and use conservative estimates. Never refuse.`;

function placeholderMonthly(): StatementMonthly {
  return {
    income_avg: 4200,
    income_stability: "stable",
    essential_spend_avg: 2100,
    discretionary_spend_avg: 800,
    savings_rate: 0.31,
    buffer_months: 4.2,
    fixed_obligation_ratio: 0.42,
    expense_volatility: "low",
  };
}

function clampMonthly(m: Partial<StatementMonthly>): StatementMonthly {
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const stab = (v: unknown): StatementMonthly["income_stability"] =>
    v === "stable" || v === "variable" || v === "irregular" ? v : "variable";
  const vol = (v: unknown): StatementMonthly["expense_volatility"] =>
    v === "low" || v === "medium" || v === "high" ? v : "medium";
  return {
    income_avg: Math.max(0, num(m.income_avg, 0)),
    income_stability: stab(m.income_stability),
    essential_spend_avg: Math.max(0, num(m.essential_spend_avg, 0)),
    discretionary_spend_avg: Math.max(0, num(m.discretionary_spend_avg, 0)),
    savings_rate: Math.max(-1, Math.min(1, num(m.savings_rate, 0))),
    buffer_months: Math.max(0, num(m.buffer_months, 0)),
    fixed_obligation_ratio: Math.max(0, Math.min(2, num(m.fixed_obligation_ratio, 0))),
    expense_volatility: vol(m.expense_volatility),
  };
}

export const analyzeStatement = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        text: z.string().max(120_000).optional().default(""),
        horizonYears: z.number().min(0).max(80),
        currency: z.string().optional().default("EUR"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<StatementProfile> => {
    const hasKey = !!process.env.LOVABLE_API_KEY;
    const hasContent = data.text.trim().length > 40;

    let monthly: StatementMonthly;
    let flags: string[];
    let notes: string[];
    let confidence: StatementProfile["confidence"];
    let source: StatementProfile["source"] = "placeholder";

    if (hasKey && hasContent) {
      try {
        const trimmed = data.text.slice(0, 60_000);
        const reply = await callGateway({
          model: MODEL,
          messages: [
            { role: "system", content: STATEMENT_SYSTEM },
            {
              role: "user",
              content: `Currency: ${data.currency}\n\nStatement content (may be CSV or extracted PDF text):\n\n${trimmed}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        const parsed = JSON.parse(reply) as {
          monthly?: Partial<StatementMonthly>;
          behavioral_flags?: unknown;
          notes?: unknown;
          confidence?: unknown;
        };
        monthly = clampMonthly(parsed.monthly ?? {});
        flags = Array.isArray(parsed.behavioral_flags)
          ? parsed.behavioral_flags.filter((x): x is string => typeof x === "string").slice(0, 8)
          : [];
        notes = Array.isArray(parsed.notes)
          ? parsed.notes.filter((x): x is string => typeof x === "string").slice(0, 4)
          : [];
        confidence =
          parsed.confidence === "high" || parsed.confidence === "low" ? parsed.confidence : "medium";
        source = "llm";
      } catch (e) {
        console.error("analyzeStatement fallback:", e);
        monthly = placeholderMonthly();
        flags = [];
        notes = [
          "We couldn't read your statement cleanly, so these are placeholder figures. Edit anything that looks off.",
        ];
        confidence = "low";
      }
    } else {
      monthly = placeholderMonthly();
      flags = hasContent ? [] : [];
      notes = hasKey
        ? ["No statement text provided — showing placeholder figures you can edit."]
        : ["AI key not set — showing demo figures. Numbers are still editable and flow into your plan."];
      confidence = "low";
    }

    const rawScore = computeCapacityScore(monthly, data.horizonYears);
    const rawBand = bandFromScore(rawScore);
    const adjusted = applyBehavioralAdjustments(rawBand, flags);
    if (adjusted.note) notes = [...notes, adjusted.note];

    return {
      monthly,
      behavioral_flags: flags,
      capacity_score: rawScore,
      capacity_band: adjusted.band,
      notes,
      confidence,
      source,
    };
  });

// ---------------- coachChat ----------------

const ChatInput = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  context: z.object({
    goals: z.any().nullable(),
    target: z.any().nullable(),
    current: z.any().nullable(),
    statement: z.any().nullable(),
  }),
});

const COACH_SYSTEM = `You are a calm, disciplined portfolio coach. Your single most important job is to separate rational decisions from emotional ones and to keep the user committed to the plan they themselves set out. You are not a salesperson and not a hype machine.

Your worldview (apply consistently):
- Equities are productive capital — the real long-term growth engine (~7–9% p.a.). Long-horizon money belongs here.
- Real estate is consumption / a vehicle; real returns after maintenance are often near zero. Don't treat a home as a growth investment.
- Liquidity / debt instruments exist for stability and crisis safety, sized to near-term needs and risk capacity — not for returns.
- Commodities / gold are returnless crisis insurance — a small sleeve at most.

Hard rules — never break these:
- Never recommend specific products, funds, tickers, ISINs, brokers, robo-advisors, or vendors. Speak only in asset classes and principles. If asked "which ETF should I buy?", explain the characteristics to look for (broad, global, low-cost, accumulating) and decline to name one.
- Keep it simple and low-cost: favor broad, cheap, passive exposure; warn against complexity, frequent trading, and high fees.
- You are giving educational information, not personalized financial advice. Say so when it matters.

Behavioral coaching (your core skill):
- The user's goals, target allocation, and current portfolio are in your context. Anchor every answer to their own stated plan.
- When the user shows emotion — fear in a crash, FOMO in a rally, the urge to time the market or chase a hot asset — name the emotion gently, then reframe rationally. Remind them why they set the plan when they were calm.
- Discourage panic-selling, market timing, and performance-chasing. Reinforce consistency, patience, and staying the course.
- Be warm and concise. Ask a clarifying question when the situation is ambiguous. Never lecture.`;

export const coachChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data }) => {
    const ctx = `User context (held in browser, not stored):
Goals: ${JSON.stringify(data.context.goals)}
Target allocation (%): ${JSON.stringify(data.context.target)}
Current allocation (%): ${JSON.stringify(data.context.current)}
Statement-derived capacity profile: ${JSON.stringify(data.context.statement)}`;
    const reply = await callGateway({
      model: MODEL,
      messages: [
        { role: "system", content: COACH_SYSTEM },
        { role: "system", content: ctx },
        ...data.messages,
      ],
    });
    return { reply };
  });
