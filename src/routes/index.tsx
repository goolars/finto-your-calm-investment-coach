import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/finto/Shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finto — a calm portfolio coach" },
      { name: "description", content: "One clear plan, four asset classes, no products pitched. A coach for your own investment plan." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-5 pt-24 pb-16">
        <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground mb-6">A calm portfolio coach</p>
        <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] tracking-tight">
          Separate rational decisions from emotional ones.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">
          Most investors underperform their own portfolios because they react. Finto gives you one clear,
          low-cost plan based on four asset classes — then holds you to it.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/onboarding"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
          >
            Build my plan
          </Link>
          <Link
            to="/coach"
            className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-medium hover:bg-secondary transition"
          >
            Talk to the coach
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-20">
        <h2 className="font-serif text-2xl mb-6">The four categories</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { c: "var(--equities)", t: "Equities", d: "Productive capital. The long-term growth engine (~7–9% real p.a.). Where long-horizon money belongs." },
            { c: "var(--liquidity)", t: "Liquidity & Debt", d: "Cash, deposits, bonds. Pure stability and crisis safety. Sized to near-term needs, not returns." },
            { c: "var(--real-estate)", t: "Real Estate", d: "Treated as consumption, not growth. A self-occupied home is lifestyle, not portfolio." },
            { c: "var(--commodities)", t: "Commodities", d: "Returnless crisis insurance. A small single-digit sleeve at most." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.c }} />
                <h3 className="font-serif text-lg">{x.t}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
