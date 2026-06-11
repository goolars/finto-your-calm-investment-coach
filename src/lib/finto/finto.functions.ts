import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Allocation, Category } from "./types";

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
    // No external fund-data API key configured — use LLM estimate as fallback.
    // (A real lookup would go here when FUND_DATA_API_KEY is set.)
    const sys = `You estimate the underlying asset-class allocation of a fund or ETF given its ISIN and (optional) name.
Return STRICT JSON only with keys: equities, real_estate, liquidity, commodities (numbers summing to ~100).
Use this taxonomy:
- equities: stocks / productive capital
- real_estate: REITs and direct real estate
- liquidity: cash, bonds, deposits, debt instruments
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
      // Conservative default for unknown funds: balanced 60/40 with small gold.
      allocation = { equities: 58, liquidity: 37, commodities: 5, real_estate: 0 };
    }
    return { allocation, source };
  });

const ChatInput = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  context: z.object({
    goals: z.any().nullable(),
    target: z.any().nullable(),
    current: z.any().nullable(),
  }),
});

const COACH_SYSTEM = `You are Finto, a calm, opinionated portfolio coach. You speak in plain, reassuring English. You never hype.

Worldview (apply to EVERY answer):
- All wealth fits into exactly four categories:
  1. Equities — productive capital, the long-term growth engine (~7-9% real p.a.). Where long-horizon money belongs.
  2. Real Estate — consumption / a vehicle, not growth. A self-occupied home is lifestyle, not portfolio.
  3. Liquidity / Debt (cash, deposits, bonds) — pure stability and crisis safety. Sized to near-term needs, not returns.
  4. Commodities (incl. gold) — returnless crisis insurance. Small single-digit sleeve at most.

Rules:
- Never recommend specific products, funds, tickers, brokers, or vendors.
- Speak only in asset-class allocations and principles.
- Hold the user accountable to their own stated plan (target allocation + goals).
- Reduce anxiety. Push back gently on emotional reactions (panic-selling, performance-chasing, over-diversifying).
- Always close with a brief disclaimer when giving guidance: "Educational information about asset allocation — not personalized investment advice."
- Keep answers short and concrete. Use bullets when helpful.`;

export const coachChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data }) => {
    const ctx = `User context (held in browser, not stored):
Goals: ${JSON.stringify(data.context.goals)}
Target allocation (%): ${JSON.stringify(data.context.target)}
Current allocation (%): ${JSON.stringify(data.context.current)}`;
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
