import { useEffect, useState } from "react";
import type { FintoState } from "./types";

const KEY = "finto-state-v1";

const empty: FintoState = { goals: null, holdings: [] };

export function loadState(): FintoState {
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return empty;
  }
}

export function saveState(state: FintoState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function useFintoState() {
  const [state, setState] = useState<FintoState>(empty);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  return { state, setState, hydrated };
}
