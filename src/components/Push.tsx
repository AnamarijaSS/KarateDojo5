"use client";

import { useEffect, useState } from "react";
import { useDerived } from "@/lib/hooks";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { saveContent } from "@/lib/store";
import { Icon, Screen } from "./ui";

export function usePushState(): [PushState | null, () => void] {
  const [st, setSt] = useState<PushState | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    void pushState().then((s) => { if (alive) setSt(s); });
    return () => { alive = false; };
  }, [n]);
  return [st, () => setN((x) => x + 1)];
}

/** Stikalo za obvestila na tej napravi. `compact`: samo kartica s pozivom, ko so izklopljena. */
export function PushToggle({ who, compact = false }: { who: "adam" | "mama"; compact?: boolean }) {
  const [st, refresh] = usePushState();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (st === null) return null;
  if (compact && st !== "off") return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
    refresh();
  };
  const label = who === "adam" ? "Opomnik za trening" : "Večerni opomnik za potrditve";

  return (
    <div className="card flex flex-col gap-2" data-testid="obvestila">
      <div className="flex items-center gap-3">
        <Icon name="clock" className="shrink-0 text-accent" />
        <p className="flex-1 font-bold">{label}</p>
        {st === "on" && <span className="chip bg-ok-bg text-ok">vklopljen</span>}
      </div>
      {st === "needs-install" && <p className="text-muted">Obvestila delujejo samo v aplikaciji na domačem zaslonu. Odpri Dojo z domačega zaslona.</p>}
      {st === "unsupported" && <p className="text-muted">Ta telefon ne podpira obvestil. Na iPhonu potrebuješ iOS 16.4 ali novejši.</p>}
      {st === "denied" && <p className="text-muted">Obvestila so izklopljena v telefonu. Vklopiš jih v Nastavitve → Obvestila → Dojo.</p>}
      {st === "off" && (
        <button className="btn btn-primary" disabled={busy} onClick={() => run(enablePush)} data-testid="vklopi-obvestila">
          <Icon name="check" /> {busy ? "Vklapljam ..." : "Vklopi"}
        </button>
      )}
      {st === "on" && !compact && (
        <button className="btn" disabled={busy} onClick={() => run(disablePush)}>Izklopi na tem telefonu</button>
      )}
      {err && <p className="font-bold text-bad" role="alert">{err}</p>}
    </div>
  );
}

const DNEVI = ["pon", "tor", "sre", "čet", "pet", "sob", "ned"];

export function NotificationSettings({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [obv, setObv] = useState(() => structuredClone(s.content.obvestila));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const valid = (v: string) => v === "" || /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);
  const allValid = Object.values(obv.adam).every(valid) && valid(obv.mama);
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await saveContent("obvestila", obv); setMsg({ ok: true, t: "Shranjeno." }); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <Screen title="Obvestila" onBack={onBack}>
      <PushToggle who="mama" />
      <p className="px-1 text-muted">Adamova obvestila vklopi Adam na svojem telefonu (Danes ali Nagrade).</p>
      <div className="card flex flex-col gap-2">
        <p className="font-bold">Adamov opomnik za trening</p>
        <p className="text-base text-muted">Ura po dnevih. Prazno pomeni brez opomnika. Ob počitnicah »prosto« ga ni, ob sobotah samo pred testom v pon ali tor.</p>
        {DNEVI.map((d, i) => {
          const k = String(i + 1);
          return (
            <label key={k} className="flex items-center gap-3">
              <span className="w-10 font-bold">{d}</span>
              <input className="input !min-h-11 !w-28" inputMode="numeric" placeholder="15:00" value={obv.adam[k] ?? ""} aria-label={`Ura opomnika ${d}`}
                onChange={(e) => setObv({ ...obv, adam: { ...obv.adam, [k]: e.target.value.trim() } })} />
              {!valid(obv.adam[k] ?? "") && <span className="text-base font-bold text-bad">npr. 15:00</span>}
            </label>
          );
        })}
      </div>
      <label className="card flex items-center gap-3">
        <span className="flex-1 font-bold">Moj večerni opomnik (samo če kaj čaka)</span>
        <input className="input !min-h-11 !w-28" inputMode="numeric" value={obv.mama} onChange={(e) => setObv({ ...obv, mama: e.target.value.trim() })} aria-label="Ura večernega opomnika" />
      </label>
      {msg && <p className={`font-bold ${msg.ok ? "text-ok" : "text-bad"}`} role="status">{msg.t}</p>}
      <button className="btn btn-primary btn-big" disabled={busy || !allValid} onClick={save}>Shrani</button>
    </Screen>
  );
}
