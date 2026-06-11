import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shield, Flame } from "lucide-react";
import { Shell } from "@/components/finto/Shell";
import { useFintoState } from "@/lib/finto/storage";
import { summarizeState } from "@/lib/finto/allocation";
import { useServerFn } from "@tanstack/react-start";
import { analyzeStatement, coachChat } from "@/lib/finto/finto.functions";
import { BAND_LABEL } from "@/lib/finto/allocation";

export const Route = createFileRoute("/coach")({
  head: () => ({ meta: [{ title: "The coach — Finto" }] }),
  component: Coach,
});

type Msg = { role: "user" | "assistant"; content: string };
type Personality = "advisor" | "guru";

const PERSONAS: Record<Personality, {
  label: string;
  tagline: string;
  icon: typeof Shield;
  accent: string;
  greeting: string;
  placeholder: string;
}> = {
  advisor: {
    label: "The Advisor",
    tagline: "Calm. Disciplined. Holds you to your plan.",
    icon: Shield,
    accent: "text-primary",
    greeting:
      "I'm Finto. I won't tell you what to buy. I'll hold you to your own plan. What's on your mind?",
    placeholder: "e.g. Markets are down 15%, should I sell?",
  },
  guru: {
    label: "Maxx Rendite",
    tagline: "🔥 6-figure months. Inner Circle open. (Parody — spot the red flags.)",
    icon: Flame,
    accent: "text-orange-500",
    greeting:
      "YO 🔥 it's your boy Maxx Rendite — broke mindset stays broke, fam. You ready to PRINT? Drop me your move and I'll show you how the real ones do it. 💸🚀",
    placeholder: "e.g. Should I YOLO my paycheck into 0DTE calls?",
  },
};

function Coach() {
  const { state, setState, hydrated } = useFintoState();
  const chat = useServerFn(coachChat);
  const analyze = useServerFn(analyzeStatement);
  const [personality, setPersonality] = useState<Personality>("advisor");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: PERSONAS.advisor.greeting },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function switchPersonality(p: Personality) {
    if (p === personality) return;
    setPersonality(p);
    setMessages([{ role: "assistant", content: PERSONAS[p].greeting }]);
  }

  const persona = PERSONAS[personality];
  const summary = hydrated ? summarizeState(state) : null;


  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const payload: {
        text?: string;
        pdfBase64?: string;
        mimeType?: string;
        filename?: string;
        horizonYears: number;
        currency: string;
      } = {
        horizonYears: state.goals?.horizonYears ?? 10,
        currency: state.goals?.currency ?? "EUR",
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
      setState((s) => ({ ...s, statement: res }));
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Got it — I read your statement (${file.name}). Monthly income ≈ ${Math.round(
            res.monthly.income_avg,
          )} ${payload.currency}, essentials ≈ ${Math.round(
            res.monthly.essential_spend_avg,
          )}, discretionary ≈ ${Math.round(
            res.monthly.discretionary_spend_avg,
          )}, savings rate ≈ ${Math.round(res.monthly.savings_rate * 100)}%, buffer ≈ ${
            res.monthly.buffer_months
          } months. Capacity reads as ${BAND_LABEL[res.capacity_band]} (${res.capacity_score}/100). Ask me anything about your spending or the plan.`,
        },
      ]);
    } catch (err) {
      console.error(err);
      setUploadError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }


  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await chat({
        data: {
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          personality,

          context: {
            goals: state.goals,
            target: summary?.target.allocation ?? null,
            current: summary?.agg.pct ?? null,
            statement: state.statement
              ? {
                  monthly: state.statement.monthly,
                  capacity_score: state.statement.capacity_score,
                  capacity_band: state.statement.capacity_band,
                  behavioral_flags: state.statement.behavioral_flags,
                  governing_band: summary?.target.governing ?? null,
                  tolerance_band: summary?.target.tolerance ?? null,
                }
              : null,
          },
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply || "(no answer)" }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMessages((m) => [...m, { role: "assistant", content: `Couldn't reach the coach: ${msg}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-5 py-10 flex flex-col" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-3xl">The coach</h1>
            <p className="text-sm text-muted-foreground">Knows your goals and your target plan. Doesn't pitch products.</p>
          </div>
          {!state.goals && (
            <Link to="/onboarding" className="text-sm text-primary underline">Set up plan</Link>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 rounded-2xl border border-border bg-card p-5">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm leading-relaxed"
                    : "max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div className="text-sm text-muted-foreground">Thinking…</div>}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-full border border-border px-3 py-1.5 hover:bg-secondary disabled:opacity-50"
            >
              {uploading ? "Reading…" : state.statement ? "Replace statement" : "Upload statement (PDF/CSV)"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,application/pdf,.pdf"
              className="hidden"
              onChange={onUpload}
            />
            {state.statement && (
              <span>
                On file: income ≈ {Math.round(state.statement.monthly.income_avg)}, savings rate{" "}
                {Math.round(state.statement.monthly.savings_rate * 100)}%, buffer{" "}
                {state.statement.monthly.buffer_months.toFixed(1)}m
              </span>
            )}
          </div>
          {uploadError && <span className="text-destructive">{uploadError}</span>}
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-card p-2 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="e.g. Where is most of my money going? Should I sell in a dip?"
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Educational information about asset allocation — not personalized investment advice. Statements are analysed server-side and never stored.
        </p>

      </div>
    </Shell>
  );
}
