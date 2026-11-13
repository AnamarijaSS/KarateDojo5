"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isValidISO, todayInLjubljana, type ISODate } from "./dates";
import { balances, beltFor } from "./ki";
import { holidayFor, planForDay } from "./plan";
import { streak } from "./streak";
import { checklistWithLocal, eventsWithLocal, feedbackWithLocal, getState, mistakesWithLocal, subscribe, type DojoState } from "./store";

const serverSnapshot = getState();
export function useDojo(): DojoState {
  return useSyncExternalStore(subscribe, getState, () => serverSnapshot);
}

/** Preglasitev datuma za preverjanje (samo v razvoju ali z NEXT_PUBLIC_ALLOW_DATE_OVERRIDE=1). */
export const DATE_OVERRIDE_ALLOWED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ALLOW_DATE_OVERRIDE === "1";

function readOverride(): ISODate | null {
  if (!DATE_OVERRIDE_ALLOWED || typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(location.search).get("datum");
    if (q && isValidISO(q)) { sessionStorage.setItem("dojo-datum", q); return q; }
    if (q === "") sessionStorage.removeItem("dojo-datum");
    const s = sessionStorage.getItem("dojo-datum");
    return s && isValidISO(s) ? s : null;
  } catch {
    return null;
  }
}

export function useToday(): { today: ISODate; override: ISODate | null } {
  const [override] = useState<ISODate | null>(() => readOverride());
  const [real, setReal] = useState<ISODate>(() => todayInLjubljana());
  useEffect(() => {
    const t = setInterval(() => setReal(todayInLjubljana()), 60_000);
    return () => clearInterval(t);
  }, []);
  return { today: override ?? real, override };
}

export function useDerived() {
  const s = useDojo();
  const { today, override } = useToday();
  return useMemo(() => {
    const events = eventsWithLocal(s);
    const checklist = checklistWithLocal(s);
    const mistakes = mistakesWithLocal(s);
    const feedback = feedbackWithLocal(s);
    const bal = balances(events, s.redemptions);
    const belt = beltFor(bal.potrjeneSkupaj, s.content.ki.pasovi);
    const plan = planForDay(today, s.content);
    const trainingDays = new Set(events.filter((e) => e.vrsta === "trening" && e.status !== "rejected").map((e) => e.dan));
    const niz = streak(trainingDays, today, (d) => !!holidayFor(d, s.content));
    const pending = events.filter((e) => e.status === "pending");
    return { s, today, override, events, checklist, mistakes, feedback, bal, belt, plan, niz, pending };
  }, [s, today, override]);
}
