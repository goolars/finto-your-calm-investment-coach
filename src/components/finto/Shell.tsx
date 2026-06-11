import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="font-serif text-xl tracking-tight">finto</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link to="/onboarding" activeProps={{ className: "text-foreground" }}>Plan</Link>
            <Link to="/dashboard" activeProps={{ className: "text-foreground" }}>Allocation</Link>
            <Link to="/coach" activeProps={{ className: "text-foreground" }}>Coach</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Disclaimer />
    </div>
  );
}

export function Disclaimer() {
  return (
    <footer className="border-t border-border/60 mt-16">
      <div className="mx-auto max-w-5xl px-5 py-5 text-xs text-muted-foreground leading-relaxed">
        Educational information about asset allocation. Finto is not personalized
        investment advice and not a recommendation to buy or sell any security.
        Your data lives only in this browser.
      </div>
    </footer>
  );
}
