"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { fmtDate } from "@/lib/dates";
import { useDerived, useDojo } from "@/lib/hooks";
import { ls } from "@/lib/idb";
import { clearError, start, syncNow, verifyPin } from "@/lib/store";
import { Onboarding } from "./Onboarding";
import { NotificationSettings } from "./Push";
import {
  Backup, ChangePin, Confirm, Devices, EditBelts, EditHolidays, EditQuiz, EditRewards, EditSchedule, EditTournaments,
  ParentHome, Redeem, Settings, Week, type ParentView,
} from "./Parent";
import {
  Mistakes, Quiz, Rewards, Today, TimerScreen, TournamentDetail, TournamentList, TrainingStart, useTimerState, type StudentView,
} from "./Student";
import { BeltBar, Icon, PinPad } from "./ui";

// Preprosto usmerjanje z #, da gumb »nazaj« na iPhonu deluje.
function useHashRoute<T extends string>(def: T): [T, string | undefined, (v: T, arg?: string) => void] {
  const read = useCallback((): [T, string | undefined] => {
    const h = typeof location === "undefined" ? "" : decodeURIComponent(location.hash.slice(1));
    const [v, arg] = h.split("/");
    return [(v || def) as T, arg];
  }, [def]);
  const [[view, arg], setR] = useState<[T, string | undefined]>(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [read]);
  const go = useCallback((v: T, a?: string) => {
    const h = a ? `${v}/${encodeURIComponent(a)}` : v;
    if (v === def && !a) history.pushState(null, "", location.pathname + location.search);
    else location.hash = h;
    setR([v, a]);
    document.getElementById("scroller")?.scrollTo(0, 0);
  }, [def]);
  return [view, arg, go];
}

const noop = () => () => {};

export default function App() {
  // Aplikacija teče samo v brskalniku: do prvega izrisa v brskalniku pokažemo uvodni zaslon.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <ClientApp /> : <Splash />;
}

function ClientApp() {
  const s = useDojo();
  useEffect(() => {
    void start();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(() => {
        // shrani že naložene datoteke, da se aplikacija odpre tudi brez povezave
        try {
          const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin) && u.includes("/_next/static/"));
          void caches.open("dojo-v2").then((c) => c.addAll(urls)).catch(() => undefined);
        } catch { /* ignoriraj */ }
      }).catch(() => undefined);
    }
  }, []);

  if (!s.ready) return <Splash />;
  if (!s.configured) return <Scroll><Missing /></Scroll>;
  if (!s.me) return <Scroll><Onboarding /></Scroll>;
  // Ogrodje: zgoraj obvestila, v sredini drsna vsebina, spodaj meni.
  // Meni ni "position: fixed", ker ga iPhone v aplikaciji na domačem zaslonu
  // po zaprtju tipkovnice lahko pusti sredi zaslona.
  return (
    <div className="flex h-full flex-col">
      <Banners />
      {s.me.role === "parent" ? <ParentApp /> : <StudentApp />}
    </div>
  );
}

function Scroll({ children }: { children: React.ReactNode }) {
  return <div id="scroller" className="h-full min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{children}</div>;
}

function Splash() {
  return <div className="grid h-full place-items-center"><img src="/icon.svg" alt="Nalagam" width={96} height={96} className="animate-pulse rounded-3xl" /></div>;
}

function Missing() {
  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-extrabold">Manjka nastavitev strežnika</h1>
      <p className="mt-2">Nastavi NEXT_PUBLIC_SUPABASE_URL in NEXT_PUBLIC_SUPABASE_ANON_KEY (glej README).</p>
    </div>
  );
}

function Banners() {
  const { s, override } = useDerived();
  const local = s.outbox.length;
  return (
    <div className="flex shrink-0 flex-col">
      {override && <div className="bg-warn-bg px-4 py-1 text-center text-base font-bold text-warn" data-testid="preizkusni-datum">Preizkusni datum: {fmtDate(override, true)}</div>}
      {!s.online && <div className="bg-line px-4 py-1 text-center text-base font-bold" data-testid="brez-povezave">Brez povezave. {local > 0 ? `${local} sprememb čaka na pošiljanje.` : "Vse je shranjeno v telefonu."}</div>}
      {s.error && (
        <button className="bg-bad-bg px-4 py-1 text-center text-base font-bold text-bad" onClick={clearError}>{s.error} (tapni za zapiranje)</button>
      )}
    </div>
  );
}

function TabBar<T extends string>({ tabs, view, go }: { tabs: { v: T; label: string; icon: Parameters<typeof Icon>[0]["name"]; badge?: number; also?: T[] }[]; view: T; go: (v: T) => void }) {
  return (
    <nav className="shrink-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]" aria-label="Glavni meni">
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((t) => {
          const active = view === t.v || t.also?.includes(view);
          return (
            <button key={t.v} className="relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-bold" style={{ color: active ? "var(--accent)" : "var(--muted)" }} onClick={() => go(t.v)} aria-current={active ? "page" : undefined}>
              <Icon name={t.icon} size={26} />
              <span className="text-[15px]">{t.label}</span>
              {!!t.badge && <span className="absolute right-[22%] top-1.5 min-w-6 rounded-full bg-accent px-1.5 text-center text-sm text-accent-ink" data-testid="tab-znacka">{t.badge}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- Adam

function StudentApp() {
  const [view, arg, go] = useHashRoute<StudentView>("danes");
  const [timer, setTimer] = useTimerState();
  const { mistakes, s } = useDerived();
  const openMistakes = mistakes.filter((m) => !m.fixed_at).length;

  if (timer) return <Scroll><TimerScreen timer={timer} setTimer={setTimer} onExit={() => go("danes")} /></Scroll>;

  let body;
  switch (view) {
    case "trening": body = <TrainingStart onBack={() => go("danes")} onStart={setTimer} />; break;
    case "turnirji": body = <TournamentList go={go} />; break;
    case "turnir": body = <TournamentDetail id={arg ?? ""} onBack={() => go("turnirji")} />; break;
    case "kviz": body = <Quiz />; break;
    case "napake": body = <Mistakes />; break;
    case "nagrade": body = <Rewards />; break;
    default: body = <Today go={go} startTimer={setTimer} />;
  }
  return (
    <>
      <Scroll>{body}</Scroll>
      {s.lastSync && <BeltCelebration />}
      <TabBar view={view} go={(v) => go(v)} tabs={[
        { v: "danes", label: "Danes", icon: "home", also: ["trening"] },
        { v: "turnirji", label: "Turnirji", icon: "trophy", also: ["turnir"] },
        { v: "kviz", label: "Kviz", icon: "car" },
        { v: "napake", label: "Napake", icon: "pencil", badge: openMistakes },
        { v: "nagrade", label: "Nagrade", icon: "gift" },
      ]} />
    </>
  );
}

function BeltCelebration() {
  const { belt } = useDerived();
  // Prvič samo zapomnimo trenutni pas; animacija se pokaže, ko pas zraste.
  const [seen, setSeen] = useState(() => {
    const v = Number(ls.get("dojo-pas") ?? "-1");
    if (v === -1) ls.set("dojo-pas", String(belt.index));
    return v === -1 ? belt.index : v;
  });
  const show = belt.index > seen;
  const setShow = (v: boolean) => { if (!v) { ls.set("dojo-pas", String(belt.index)); setSeen(belt.index); } };
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={() => setShow(false)} role="dialog" aria-label="Nov pas">
      <div className="card belt-pop flex flex-col items-center gap-4 text-center">
        <p className="text-3xl font-extrabold">Nov pas!</p>
        <BeltBar pas={belt.pas} size="lg" />
        <p className="text-xl font-bold">{belt.pas.ime.charAt(0).toUpperCase() + belt.pas.ime.slice(1)} pas. Bravo, Adam!</p>
        <button className="btn btn-primary" onClick={() => setShow(false)}>Naprej</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Mama

const UNLOCK_KEY = "dojo-odklenjeno";
const UNLOCK_MS = 30 * 60 * 1000;

function ParentApp() {
  const [view, , go] = useHashRoute<ParentView>("domov");
  const { pending } = useDerived();
  const [unlocked, setUnlocked] = useState<boolean>(() => Date.now() - Number(ls.get(UNLOCK_KEY) ?? "0") < UNLOCK_MS);
  useEffect(() => {
    const touch = () => { if (Date.now() - Number(ls.get(UNLOCK_KEY) ?? "0") < UNLOCK_MS) ls.set(UNLOCK_KEY, String(Date.now())); };
    const onVis = () => {
      if (document.visibilityState === "visible") setUnlocked(Date.now() - Number(ls.get(UNLOCK_KEY) ?? "0") < UNLOCK_MS);
    };
    window.addEventListener("pointerdown", touch);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pointerdown", touch); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  if (!unlocked) return <Scroll><Lock onUnlock={() => { ls.set(UNLOCK_KEY, String(Date.now())); setUnlocked(true); void syncNow(); }} /></Scroll>;

  const back = () => go("nastavitve");
  let body;
  switch (view) {
    case "potrdi": body = <Confirm />; break;
    case "unovci": body = <Redeem />; break;
    case "teden": body = <Week />; break;
    case "kviz": body = <Quiz parentHint />; break;
    case "nastavitve": body = <Settings go={go} />; break;
    case "uredi-turnirje": body = <EditTournaments onBack={back} />; break;
    case "uredi-kviz": body = <EditQuiz onBack={back} />; break;
    case "uredi-nagrade": body = <EditRewards onBack={back} />; break;
    case "uredi-pasove": body = <EditBelts onBack={back} />; break;
    case "uredi-urnik": body = <EditSchedule onBack={back} />; break;
    case "uredi-pocitnice": body = <EditHolidays onBack={back} />; break;
    case "naprave": body = <Devices onBack={back} />; break;
    case "pin": body = <ChangePin onBack={back} />; break;
    case "kopija": body = <Backup onBack={back} />; break;
    case "obvestila": body = <NotificationSettings onBack={back} />; break;
    default: body = <ParentHome go={go} />;
  }
  return (
    <>
      <Scroll>{body}</Scroll>
      <TabBar view={view} go={(v) => go(v)} tabs={[
        { v: "domov", label: "Domov", icon: "home", also: ["teden"] },
        { v: "potrdi", label: "Potrdi", icon: "check", badge: pending.filter((e) => !e.local).length },
        { v: "unovci", label: "Nagrade", icon: "gift" },
        { v: "kviz", label: "Kviz", icon: "car" },
        { v: "nastavitve", label: "Več", icon: "gear", also: ["uredi-turnirje", "uredi-kviz", "uredi-nagrade", "uredi-pasove", "uredi-urnik", "uredi-pocitnice", "naprave", "pin", "kopija", "obvestila"] },
      ]} />
    </>
  );
}

function Lock({ onUnlock }: { onUnlock: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = useCallback(async (pin: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await verifyPin(pin);
      if (r === "ok") onUnlock();
      else setErr(r === "locked" ? "Preveč poskusov. Počakaj 10 minut." : "Napačna PIN koda.");
    } catch (e) {
      setErr(/fetch|network|Load failed/i.test((e as Error).message) ? "Ni povezave. PIN preverim, ko bo povezava." : (e as Error).message);
    }
    setBusy(false);
  }, [onUnlock]);
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <Icon name="lock" size={48} className="text-accent" />
      <h1 className="text-2xl font-extrabold">Starševski način</h1>
      <PinPad onSubmit={submit} busy={busy} error={err} />
    </div>
  );
}
