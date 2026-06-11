import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/finto/Shell";
import { useFintoState } from "@/lib/finto/storage";
import { summarizeState } from "@/lib/finto/allocation";
import { useServerFn } from "@tanstack/react-start";
import { coachChat } from "@/lib/finto/finto.functions";

export const Route = createFileRoute("/coach")({
  head: () => ({ meta: [{ title: "The coach — Finto" }] }),
  component: Coach,
});

type Msg = { role: "user" | "assistant"; content: string };

function Coach() {
  const { state, hydrated } = useFintoState();
  const chat = useServerFn(coachChat);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I'm Finto. I won't tell you what to buy. I'll hold you to your own plan. What's on your mind?",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const summary = hydrated ? summarizeState(state) : null;

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
            placeholder="e.g. Markets are down 15%, should I sell?"
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
          Educational information about asset allocation — not personalized investment advice.
        </p>
      </div>
    </Shell>
  );
}
