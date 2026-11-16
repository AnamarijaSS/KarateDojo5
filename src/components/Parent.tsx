"use client";

import { useMemo, useState } from "react";
import { addDays, dayShort, diffDays, fmtDate, mondayOf, type ISODate } from "@/lib/dates";
import { useDerived } from "@/lib/hooks";
import { datedTournaments } from "@/lib/plan";
import {
  changePin, decideEvents, deleteMistake, exportBackup, importBackup, redeemReward, removeMember, resetDevice, saveContent,
} from "@/lib/store";
import type { Content, DojoEvent, Pas, Sklop, Turnir, Vprasanje } from "@/lib/types";
import { PairingCode } from "./Onboarding";
import { Empty, Icon, Modal, PinPad, Screen } from "./ui";

export type ParentView = "domov" | "potrdi" | "unovci" | "teden" | "kviz" | "nastavitve" | "obvestila" | "uredi-turnirje" | "uredi-kviz" | "uredi-nagrade" | "uredi-pasove" | "uredi-urnik" | "uredi-pocitnice" | "naprave" | "kopija" | "pin";

const VRSTA_IME: Record<string, string> = {
  trening: "Trening", branje: "Branje", kata: "Kata", kviz: "Avto kviz", napaka: "Popravljena napaka",
  ponovitev: "Ponovitev tedna", pocitnice: "Počitniški trening", turnir_zacetek: "Pravočasen začetek priprave", turnir_seznam: "Cel seznam priprav",
};

function describe(e: DojoEvent, c: Content): string {
  const p = e.predmet && (c.urnik.predmeti[e.predmet] ?? c.kviz[e.predmet]?.ime ?? e.predmet);
  const t = e.ref && c.turnirji.turnirji.find((x) => x.id === e.ref);
  const parts = [VRSTA_IME[e.vrsta] ?? e.vrsta];
  if (p) parts.push(p);
  if (t) parts.push(`turnir ${fmtDate(t.datum)}`);
  if (e.opis && e.vrsta !== "kata") parts.push(e.opis);
  return parts.join(" · ");
}
function when(e: DojoEvent): string {
  const d = new Date(e.created_at);
  const t = d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Ljubljana" });
  return `${dayShort(e.dan)} ${fmtDate(e.dan)}, ${t}`;
}

// ---------------------------------------------------------------- domov

export function ParentHome({ go }: { go: (v: ParentView) => void }) {
  const { s, pending, bal, belt, today, events, niz } = useDerived();
  const c = s.content;
  const next = datedTournaments(c).filter((t) => t.datum > today).slice(0, 3);
  const todayEv = events.filter((e) => e.dan === today && e.status !== "rejected");
  return (
    <Screen title="Starševski način">
      <button className="card flex items-center gap-3 text-left" onClick={() => go("potrdi")} data-testid="cakajoce-znacka">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl font-extrabold" style={{ background: pending.length ? "var(--accent)" : "var(--line)", color: pending.length ? "var(--accent-ink)" : "var(--ink)" }}>{pending.length}</span>
        <span className="flex-1">
          <span className="block text-xl font-extrabold">{pending.length ? "Čaka na potrditev" : "Vse potrjeno"}</span>
          <span className="text-muted">{pending.length ? `${pending.reduce((a, e) => a + e.ki, 0)} Ki` : "Ni novih nalog."}</span>
        </span>
        <Icon name="back" className="rotate-180" />
      </button>
      <div className="card grid grid-cols-3 gap-2 text-center">
        <div><p className="text-3xl font-extrabold" data-testid="mama-za-nagrade">{bal.zaNagrade}</p><p className="text-base text-muted">Ki za nagrade</p></div>
        <div><p className="text-3xl font-extrabold">{bal.potrjeneSkupaj}</p><p className="text-base text-muted">{belt.pas.ime} pas</p></div>
        <div><p className="text-3xl font-extrabold">{niz}</p><p className="text-base text-muted">dni niz</p></div>
      </div>
      <div className="card">
        <p className="mb-1 font-bold">Danes</p>
        {todayEv.length === 0 ? <p className="text-muted">Danes še nič odkljukanega.</p> : (
          <ul className="list-disc pl-5">{todayEv.map((e) => <li key={e.id}>{describe(e, c)}</li>)}</ul>
        )}
      </div>
      <div className="card">
        <p className="mb-1 font-bold">Naslednji turnirji</p>
        {next.map((t) => <p key={t.id}>{fmtDate(t.datum)} · {c.urnik.predmeti[t.predmet] ?? t.predmet} ({t.vrsta}) · čez {diffDays(today, t.datum)} d</p>)}
        {next.length === 0 && <p className="text-muted">Ni prihajajočih.</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={() => go("unovci")}><Icon name="gift" /> Unovči</button>
        <button className="btn" onClick={() => go("teden")}><Icon name="calendar" /> Teden</button>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- potrjevanje

const KOMENTARJI = ["Tole naredi še enkrat, skupaj pogledava.", "Pokaži mi zvezek, pa potrdim.", "Danes je bil to že drugi enak vnos."];

export function Confirm() {
  const { s, pending } = useDerived();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reject, setReject] = useState<DojoEvent | null>(null);
  const [comment, setComment] = useState("");
  const serverPending = pending.filter((e) => !e.local);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const byDay = useMemo(() => {
    const m = new Map<string, DojoEvent[]>();
    for (const e of [...serverPending].reverse()) m.set(e.dan, [...(m.get(e.dan) ?? []), e]);
    return [...m.entries()];
  }, [serverPending]);
  return (
    <Screen title="Čaka na potrditev">
      {err && <p className="font-bold text-bad" role="alert">{err}</p>}
      {serverPending.length === 0 && <Empty>Ni ničesar za potrditi.</Empty>}
      {serverPending.length > 1 && (
        <button className="btn btn-primary btn-big" disabled={busy} onClick={() => run(() => decideEvents(serverPending.map((e) => e.id), "confirmed"))} data-testid="potrdi-vse">
          <Icon name="check" size={28} /> Potrdi vse ({serverPending.reduce((a, e) => a + e.ki, 0)} Ki)
        </button>
      )}
      {byDay.map(([day, list]) => (
        <div key={day} className="flex flex-col gap-2">
          <p className="px-1 font-bold text-muted">{dayShort(day)} {fmtDate(day)}</p>
          {list.map((e) => (
            <div key={e.id} className="card flex items-center gap-3" data-testid="cakajoca">
              <div className="flex-1">
                <p className="font-bold">{describe(e, s.content)}</p>
                <p className="text-base text-muted">{when(e)} · +{e.ki} Ki</p>
              </div>
              <button className="btn !px-3 text-bad" aria-label="Zavrni" disabled={busy} onClick={() => { setReject(e); setComment(""); }}><Icon name="x" /></button>
              <button className="btn !px-3 text-ok" aria-label="Potrdi" disabled={busy} onClick={() => run(() => decideEvents([e.id], "confirmed"))} data-testid="potrdi-eno"><Icon name="check" /></button>
            </div>
          ))}
        </div>
      ))}
      <Modal open={!!reject} onClose={() => setReject(null)} title="Zavrni s prijaznim komentarjem">
        <div className="flex flex-col gap-2">
          {KOMENTARJI.map((k) => <button key={k} className="btn justify-start text-left" onClick={() => setComment(k)}>{k}</button>)}
          <textarea className="input min-h-20" maxLength={200} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Adam bo to videl." aria-label="Komentar" />
          <button className="btn btn-primary" disabled={busy} onClick={() => reject && run(async () => { await decideEvents([reject.id], "rejected", comment); setReject(null); })}>Zavrni</button>
        </div>
      </Modal>
    </Screen>
  );
}

// ---------------------------------------------------------------- unovčenje

export function Redeem() {
  const { s, bal } = useDerived();
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const reward = s.content.ki.nagrade.find((n) => n.id === pick);
  const submit = async (pin: string) => {
    if (!reward) return;
    setBusy(true); setErr(null);
    try {
      const r = await redeemReward(reward.id, pin);
      if (r.ok) { setOk(reward.ime); setPick(null); }
      else setErr(r.error === "bad" ? "Napačna PIN koda." : r.error === "locked" ? "Preveč poskusov. Počakaj 10 minut." : "Premalo potrjenih Ki.");
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <Screen title="Unovči nagrado">
      <div className="card text-center">
        <p className="text-base text-muted">Potrjene Ki za nagrade</p>
        <p className="text-5xl font-extrabold">{bal.zaNagrade}</p>
      </div>
      {ok && <p className="card bg-ok-bg font-bold text-ok" role="status">Unovčeno: {ok}. Uživajta!</p>}
      {s.content.ki.nagrade.map((n) => (
        <button key={n.id} className="card flex items-center gap-3 text-left disabled:opacity-50" disabled={bal.zaNagrade < n.cena} onClick={() => { setPick(n.id); setErr(null); setOk(null); }}>
          <Icon name="gift" className="shrink-0 text-accent" />
          <span className="flex-1 font-bold">{n.ime}</span>
          <span className="chip border border-line">{n.cena} Ki</span>
        </button>
      ))}
      <Modal open={!!reward} onClose={() => setPick(null)} title={reward ? `${reward.ime} (${reward.cena} Ki)` : ""}>
        <PinPad onSubmit={submit} busy={busy} error={err} label="PIN za unovčenje" />
      </Modal>
      <p className="mt-2 px-1 font-bold">Zgodovina</p>
      {s.redemptions.length === 0 && <Empty>Še nič unovčeno.</Empty>}
      {[...s.redemptions].reverse().map((r) => (
        <div key={r.id} className="card flex justify-between gap-2">
          <span>{r.label}</span>
          <span className="text-muted">−{r.cost} Ki · {new Date(r.created_at).toLocaleDateString("sl-SI", { timeZone: "Europe/Ljubljana" })}</span>
        </div>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------- tedenski pregled

export function Week() {
  const { s, events, today, feedback } = useDerived();
  const [start, setStart] = useState<ISODate>(() => mondayOf(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const c = s.content;
  const live = events.filter((e) => e.status !== "rejected");
  const count = (d: string, v: string) => live.filter((e) => e.dan === d && e.vrsta === v).length;
  const kiDay = (d: string) => live.filter((e) => e.dan === d).reduce((a, e) => a + e.ki, 0);
  const weekT = datedTournaments(c).filter((t) => t.datum >= start && t.datum <= addDays(start, 6));
  const moods: Record<string, string> = { super: "😀", ok: "🙂", tezko: "😕" };
  return (
    <Screen title="Tedenski pregled">
      <div className="flex items-center gap-2">
        <button className="btn !px-3" onClick={() => setStart(addDays(start, -7))} aria-label="Prejšnji teden"><Icon name="back" /></button>
        <p className="flex-1 text-center font-bold">{fmtDate(start)} – {fmtDate(addDays(start, 6))}</p>
        <button className="btn !px-3" onClick={() => setStart(addDays(start, 7))} aria-label="Naslednji teden"><Icon name="back" className="rotate-180" /></button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-center text-base">
          <thead><tr className="text-muted"><th className="text-left">Dan</th><th>Trening</th><th>Kata</th><th>Branje</th><th>Kviz</th><th>Ki</th></tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d} className={d === today ? "font-extrabold" : ""}>
                <td className="py-1 text-left">{dayShort(d)} {fmtDate(d)}</td>
                <td>{count(d, "trening") || "·"}</td><td>{count(d, "kata") || "·"}</td><td>{count(d, "branje") || "·"}</td><td>{count(d, "kviz") || "·"}</td><td>{kiDay(d) || "·"}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-extrabold">
              <td className="pt-1 text-left">Skupaj</td>
              {["trening", "kata", "branje", "kviz"].map((v) => <td key={v}>{days.reduce((a, d) => a + count(d, v), 0)}</td>)}
              <td>{days.reduce((a, d) => a + kiDay(d), 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <p className="mb-1 font-bold">Turnirji ta teden</p>
        {weekT.length === 0 && <p className="text-muted">Ni turnirjev.</p>}
        {weekT.map((t) => {
          const f = feedback.find((x) => x.turnir_id === t.id);
          return <p key={t.id}>{dayShort(t.datum)} {fmtDate(t.datum)} · {c.urnik.predmeti[t.predmet] ?? t.predmet} {f ? moods[f.mood] : ""}</p>;
        })}
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- nastavitve

export function Settings({ go }: { go: (v: ParentView) => void }) {
  const items: [ParentView, string, Parameters<typeof Icon>[0]["name"]][] = [
    ["obvestila", "Obvestila", "clock"],
    ["uredi-turnirje", "Turnirji in priprave", "trophy"],
    ["uredi-kviz", "Vprašanja za kviz", "car"],
    ["uredi-nagrade", "Nagrade", "gift"],
    ["uredi-pasove", "Meje pasov", "star"],
    ["uredi-urnik", "Urnik, kata in bloki", "calendar"],
    ["uredi-pocitnice", "Počitnice in nasveti", "sun"],
    ["naprave", "Povezane naprave", "phone"],
    ["pin", "Spremeni PIN", "lock"],
    ["kopija", "Varnostna kopija", "download"],
  ];
  return (
    <Screen title="Nastavitve">
      {items.map(([v, l, i]) => (
        <button key={v} className="card flex items-center gap-3 text-left" onClick={() => go(v)}>
          <Icon name={i} className="text-accent" /><span className="flex-1 font-bold">{l}</span><Icon name="back" className="rotate-180" />
        </button>
      ))}
    </Screen>
  );
}

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const save = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, t: "Shranjeno." }); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); }
    setBusy(false);
  };
  const Msg = () => msg ? <p className={`font-bold ${msg.ok ? "text-ok" : "text-bad"}`} role="status">{msg.t}</p> : null;
  return { busy, save, Msg };
}

const field = "input !min-h-11";

export function EditTournaments({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [list, setList] = useState<Turnir[]>(() => structuredClone(s.content.turnirji.turnirji));
  const [open, setOpen] = useState<string | null>(null);
  const { busy, save, Msg } = useSaver();
  const up = (id: string, patch: Partial<Turnir>) => setList((l) => l.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const sorted = [...list].sort((a, b) => a.datum.localeCompare(b.datum));
  return (
    <Screen title="Turnirji" onBack={onBack}>
      {sorted.map((t) => (
        <div key={t.id} className="card flex flex-col gap-2">
          <button className="flex items-center gap-2 text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
            <span className="flex-1 font-bold">{fmtDate(t.datum)} · {t.predmet} · {t.vrsta}</span><Icon name="pencil" />
          </button>
          {open === t.id && (
            <div className="flex flex-col gap-2">
              <label className="text-base font-semibold">Datum<input type="date" className={field} value={t.datum} onChange={(e) => up(t.id, { datum: e.target.value })} /></label>
              <label className="text-base font-semibold">Začnem se pripravljati<input type="date" className={field} value={t.zacetek} onChange={(e) => up(t.id, { zacetek: e.target.value })} /></label>
              <label className="text-base font-semibold">Predmet<input className={field} value={t.predmet} onChange={(e) => up(t.id, { predmet: e.target.value.toUpperCase() })} /></label>
              <label className="text-base font-semibold">Vrsta<input className={field} value={t.vrsta} onChange={(e) => up(t.id, { vrsta: e.target.value })} /></label>
              <label className="text-base font-semibold">Opomba (npr. datum še potrditi)<input className={field} value={t.potrditi ?? ""} onChange={(e) => up(t.id, { potrditi: e.target.value || undefined })} /></label>
              <label className="text-base font-semibold">Tema kviza
                <select className={field} value={t.kviz ?? ""} onChange={(e) => up(t.id, { kviz: e.target.value })}>
                  <option value="">brez</option>
                  {Object.values(s.content.kviz).map((k) => <option key={k.id} value={k.id}>{k.ime}</option>)}
                </select>
              </label>
              <p className="font-bold">Priprave</p>
              {t.priprave.map((p, i) => (
                <div key={p.id} className="flex gap-2">
                  <input className={field} value={p.besedilo} aria-label={`Priprava ${i + 1}`} onChange={(e) => up(t.id, { priprave: t.priprave.map((x) => (x.id === p.id ? { ...x, besedilo: e.target.value } : x)) })} />
                  <button className="btn !px-3" aria-label="Odstrani" onClick={() => up(t.id, { priprave: t.priprave.filter((x) => x.id !== p.id) })}><Icon name="trash" /></button>
                </div>
              ))}
              <button className="btn" onClick={() => up(t.id, { priprave: [...t.priprave, { id: Math.random().toString(36).slice(2, 8), besedilo: "" }] })}><Icon name="plus" /> Dodaj pripravo</button>
              <button className="btn text-bad" onClick={() => { if (confirm("Izbrišem ta turnir?")) setList((l) => l.filter((x) => x.id !== t.id)); }}><Icon name="trash" /> Izbriši turnir</button>
            </div>
          )}
        </div>
      ))}
      <button className="btn" onClick={() => {
        const id = `nov-${Date.now().toString(36)}`;
        setList((l) => [...l, { id, datum: addDays(new Date().toISOString().slice(0, 10), 14), zacetek: addDays(new Date().toISOString().slice(0, 10), 7), predmet: "MAT", vrsta: "pisno", kviz: "", priprave: [] }]);
        setOpen(id);
      }}><Icon name="plus" /> Nov turnir</button>
      <Msg />
      <button className="btn btn-primary btn-big" disabled={busy} onClick={() => save(() => saveContent("turnirji", { ...s.content.turnirji, turnirji: list.map((t) => ({ ...t, priprave: t.priprave.filter((p) => p.besedilo.trim()) })) }))}>Shrani</button>
    </Screen>
  );
}

export function EditQuiz({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [sets, setSets] = useState<Record<string, Sklop>>(() => structuredClone(s.content.kviz));
  const [cur, setCur] = useState<string>(() => Object.keys(s.content.kviz)[0] ?? "");
  const { busy, save, Msg } = useSaver();
  const sk = sets[cur];
  const upQ = (qs: Vprasanje[]) => setSets((x) => ({ ...x, [cur]: { ...x[cur], vprasanja: qs } }));
  return (
    <Screen title="Vprašanja za kviz" onBack={onBack}>
      <select className="input" value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Tema">
        {Object.values(sets).map((k) => <option key={k.id} value={k.id}>{k.ime} ({k.vprasanja.length})</option>)}
      </select>
      <button className="btn" onClick={() => {
        const name = prompt("Ime nove teme:");
        if (!name) return;
        const id = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").slice(0, 30) || `tema-${Date.now()}`;
        setSets((x) => ({ ...x, [id]: { id, ime: name, turnir: "", navodilo: "", vprasanja: [] } }));
        setCur(id);
      }}><Icon name="plus" /> Nova tema</button>
      {sk && (
        <>
          <label className="text-base font-semibold">Ime<input className={field} value={sk.ime} onChange={(e) => setSets((x) => ({ ...x, [cur]: { ...sk, ime: e.target.value } }))} /></label>
          <label className="text-base font-semibold">Navodilo<textarea className="input min-h-20" value={sk.navodilo} onChange={(e) => setSets((x) => ({ ...x, [cur]: { ...sk, navodilo: e.target.value } }))} /></label>
          {sk.vprasanja.map((q, i) => (
            <div key={q.id} className="card flex flex-col gap-2">
              <input className={field} value={q.v} placeholder="Vprašanje" aria-label={`Vprašanje ${i + 1}`} onChange={(e) => upQ(sk.vprasanja.map((x) => (x.id === q.id ? { ...x, v: e.target.value } : x)))} />
              <input className={field} value={q.o} placeholder="Odgovor" aria-label={`Odgovor ${i + 1}`} onChange={(e) => upQ(sk.vprasanja.map((x) => (x.id === q.id ? { ...x, o: e.target.value } : x)))} />
              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-base"><input type="checkbox" className="h-6 w-6" checked={!!q.preveri} onChange={(e) => upQ(sk.vprasanja.map((x) => (x.id === q.id ? { ...x, preveri: e.target.checked || undefined } : x)))} /> preveri v zvezku</label>
                <button className="btn !px-3" aria-label="Odstrani" onClick={() => upQ(sk.vprasanja.filter((x) => x.id !== q.id))}><Icon name="trash" /></button>
              </div>
            </div>
          ))}
          <button className="btn" onClick={() => upQ([...sk.vprasanja, { id: `${cur}-${Date.now().toString(36)}`, v: "", o: "" }])}><Icon name="plus" /> Dodaj vprašanje</button>
        </>
      )}
      <Msg />
      <button className="btn btn-primary btn-big" disabled={busy} onClick={() => save(() => saveContent("kviz", Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, { ...v, vprasanja: v.vprasanja.filter((q) => q.v.trim()) }]))))}>Shrani</button>
    </Screen>
  );
}

export function EditRewards({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [list, setList] = useState(() => structuredClone(s.content.ki.nagrade));
  const { busy, save, Msg } = useSaver();
  return (
    <Screen title="Nagrade" onBack={onBack}>
      {list.map((n, i) => (
        <div key={n.id} className="card flex gap-2">
          <input className={field} value={n.ime} aria-label={`Nagrada ${i + 1}`} onChange={(e) => setList(list.map((x) => (x.id === n.id ? { ...x, ime: e.target.value } : x)))} />
          <input className={`${field} !w-24`} type="number" min={1} value={n.cena} aria-label="Cena v Ki" onChange={(e) => setList(list.map((x) => (x.id === n.id ? { ...x, cena: Math.max(1, Number(e.target.value) || 1) } : x)))} />
          <button className="btn !px-3" aria-label="Odstrani" onClick={() => setList(list.filter((x) => x.id !== n.id))}><Icon name="trash" /></button>
        </div>
      ))}
      <button className="btn" onClick={() => setList([...list, { id: `n-${Date.now().toString(36)}`, ime: "", cena: 10 }])}><Icon name="plus" /> Dodaj nagrado</button>
      <Msg />
      <button className="btn btn-primary btn-big" disabled={busy} onClick={() => save(() => saveContent("ki", { ...s.content.ki, nagrade: list.filter((n) => n.ime.trim()) }))}>Shrani</button>
    </Screen>
  );
}

export function EditBelts({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [list, setList] = useState<Pas[]>(() => structuredClone(s.content.ki.pasovi));
  const { busy, save, Msg } = useSaver();
  const sortedOk = list.every((p, i) => i === 0 || p.od > list[i - 1].od) && list[0]?.od === 0;
  return (
    <Screen title="Meje pasov" onBack={onBack}>
      <p className="px-1 text-muted">Koliko vseh potrjenih Ki je potrebnih za pas. Unovčene nagrade pasu ne znižajo.</p>
      {list.map((p, i) => (
        <label key={p.ime} className="card flex items-center gap-3">
          <span className="h-6 w-10 rounded border border-line" style={{ background: p.barva }} />
          <span className="flex-1 font-bold">{p.ime}</span>
          <input className={`${field} !w-28`} type="number" min={0} value={p.od} disabled={i === 0} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, od: Math.max(0, Number(e.target.value) || 0) } : x)))} />
        </label>
      ))}
      {!sortedOk && <p className="font-bold text-bad">Vsak pas mora imeti večjo mejo od prejšnjega.</p>}
      <Msg />
      <button className="btn btn-primary btn-big" disabled={busy || !sortedOk} onClick={() => save(() => saveContent("ki", { ...s.content.ki, pasovi: list }))}>Shrani</button>
    </Screen>
  );
}

export function EditSchedule({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [urnik, setUrnik] = useState(() => structuredClone(s.content.urnik));
  const [kata, setKata] = useState(() => structuredClone(s.content.kata));
  const [ritem, setRitem] = useState(() => structuredClone(s.content.ritem));
  const { busy, save, Msg } = useSaver();
  const dni = ["pon", "tor", "sre", "čet", "pet"];
  return (
    <Screen title="Urnik in ritem" onBack={onBack}>
      <div className="card overflow-x-auto">
        <p className="mb-2 font-bold">Urnik</p>
        <table className="text-base">
          <thead><tr><th>Ura</th>{dni.map((d) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {urnik.ure.map((u, ui) => (
              <tr key={u.ura}>
                <td className="pr-1 text-center font-bold">{u.ura}</td>
                {u.dnevi.map((v, di) => (
                  <td key={di}><input className="input !min-h-10 !w-28 !px-2 !py-1" value={v} aria-label={`${dni[di]} ${u.ura}. ura`} onChange={(e) => setUrnik({ ...urnik, ure: urnik.ure.map((x, j) => (j === ui ? { ...x, dnevi: x.dnevi.map((y, k) => (k === di ? e.target.value : y)) } : x)) })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-base text-muted">Zamenjava v 2. polletju: {urnik.zamenjave.map((z) => `${z.iz} → ${z.v} od ${fmtDate(z.od, true)}`).join(", ")}</p>
      </div>
      <div className="card flex flex-col gap-2">
        <p className="font-bold">Bloki in kata po dnevih</p>
        <label className="text-base font-semibold">»Pred testom« = test čez največ toliko dni
          <input className={`${field} !w-24`} type="number" min={1} max={5} value={ritem.predTestomDni} onChange={(e) => setRitem({ ...ritem, predTestomDni: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        {["1", "2", "3", "4", "5", "6", "7"].map((d, i) => (
          <div key={d} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
            <span className="w-10 font-bold">{["pon", "tor", "sre", "čet", "pet", "sob", "ned"][i]}</span>
            {i < 5 && (
              <>
                <label className="text-base">bloki<input className={`${field} !w-16`} type="number" min={0} max={4} value={ritem.dnevi[d].bloki} onChange={(e) => setRitem({ ...ritem, dnevi: { ...ritem.dnevi, [d]: { ...ritem.dnevi[d], bloki: Number(e.target.value) || 0 } } })} /></label>
                <label className="text-base">pred testom<input className={`${field} !w-16`} type="number" min={0} max={4} value={ritem.dnevi[d].blokiPredTestom} onChange={(e) => setRitem({ ...ritem, dnevi: { ...ritem.dnevi, [d]: { ...ritem.dnevi[d], blokiPredTestom: Number(e.target.value) || 0 } } })} /></label>
              </>
            )}
            <label className="flex-1 text-base">kata (predmeti z vejico)<input className={field} value={kata[d]?.predmeti.join(", ") ?? ""} onChange={(e) => setKata({ ...kata, [d]: { ...(kata[d] ?? { opomba: "" }), predmeti: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) } })} /></label>
          </div>
        ))}
      </div>
      <Msg />
      <button className="btn btn-primary btn-big" disabled={busy} onClick={() => save(async () => { await saveContent("urnik", urnik); await saveContent("kata", kata); await saveContent("ritem", ritem); })}>Shrani</button>
    </Screen>
  );
}

export function EditHolidays({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [list, setList] = useState(() => structuredClone(s.content.pocitnice.obdobja));
  const [tips, setTips] = useState(() => s.content.nasveti.join("\n"));
  const { busy, save, Msg } = useSaver();
  return (
    <Screen title="Počitnice in nasveti" onBack={onBack}>
      {list.map((o, i) => (
        <div key={i} className="card flex flex-col gap-2">
          <div className="flex gap-2">
            <input type="date" className={field} value={o.od} aria-label="Od" onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, od: e.target.value } : x)))} />
            <input type="date" className={field} value={o.do} aria-label="Do" onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, do: e.target.value } : x)))} />
          </div>
          <select className={field} value={o.nacin} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, nacin: e.target.value as "prosto" | "plan" } : x)))}>
            <option value="prosto">prosto</option><option value="plan">počitniški plan</option>
          </select>
          <input className={field} value={o.besedilo} aria-label="Besedilo" onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, besedilo: e.target.value } : x)))} />
          {o.nacin === "plan" && <input className={field} value={(o.naloge ?? []).join("; ")} aria-label="Naloge, ločene s podpičjem" placeholder="Naloge, ločene s podpičjem" onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, naloge: e.target.value.split(";").map((y) => y.trim()).filter(Boolean) } : x)))} />}
          <button className="btn !px-3 self-end" aria-label="Odstrani" onClick={() => setList(list.filter((_, j) => j !== i))}><Icon name="trash" /></button>
        </div>
      ))}
      <button className="btn" onClick={() => setList([...list, { od: "", do: "", nacin: "prosto", besedilo: "Uživaj počitnice!" }])}><Icon name="plus" /> Dodaj obdobje</button>
      <label className="card flex flex-col gap-2 font-bold">Senseijevi nasveti (en na vrstico)
        <textarea className="input min-h-40 font-normal" value={tips} onChange={(e) => setTips(e.target.value)} />
      </label>
      <Msg />
      <button className="btn btn-primary btn-big" disabled={busy} onClick={() => save(async () => {
        await saveContent("pocitnice", { obdobja: list.filter((o) => o.od && o.do) });
        await saveContent("nasveti", tips.split("\n").map((t) => t.trim()).filter(Boolean));
      })}>Shrani</button>
    </Screen>
  );
}

export function Devices({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen title="Naprave" onBack={onBack}>
      {s.members.map((m) => (
        <div key={m.user_id} className="card flex items-center gap-3" data-testid="naprava">
          <Icon name="phone" className="shrink-0" />
          <div className="flex-1">
            <p className="font-bold">{m.device_label || (m.role === "parent" ? "Starš" : "Adam")}{m.user_id === s.userId && " (ta telefon)"}</p>
            <p className="text-base text-muted">{m.role === "parent" ? "starš" : "učenec"} · od {new Date(m.created_at).toLocaleDateString("sl-SI")}</p>
          </div>
          {m.user_id !== s.userId && (
            <button className="btn !px-3 text-bad" aria-label="Odstrani napravo" onClick={async () => {
              if (!confirm("Odstranim to napravo? Na njej bo treba znova vnesti kodo.")) return;
              try { await removeMember(m.user_id); } catch (e) { setErr((e as Error).message); }
            }}><Icon name="trash" /></button>
          )}
        </div>
      ))}
      {err && <p className="font-bold text-bad">{err}</p>}
      <p className="mt-2 px-1 font-bold">Poveži Adamov telefon</p>
      <PairingCode role="student" />
      <p className="mt-2 px-1 font-bold">Nov starševski telefon</p>
      <PairingCode role="parent" />
      <button className="btn mt-4 text-bad" onClick={() => { if (confirm("Ta telefon odjavim iz doja? Podatki ostanejo na strežniku.")) void resetDevice(); }}>Odjavi ta telefon</button>
    </Screen>
  );
}

export function ChangePin({ onBack }: { onBack: () => void }) {
  const [oldPin, setOld] = useState("");
  const [n1, setN1] = useState("");
  const { busy, save, Msg } = useSaver();
  return (
    <Screen title="Spremeni PIN" onBack={onBack}>
      <div className="card flex flex-col gap-2">
        <label className="font-bold">Trenutni PIN<input className="input" type="password" inputMode="numeric" value={oldPin} onChange={(e) => setOld(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="font-bold">Nov PIN (4 do 8 številk)<input className="input" type="password" inputMode="numeric" value={n1} onChange={(e) => setN1(e.target.value.replace(/\D/g, ""))} /></label>
        <Msg />
        <button className="btn btn-primary" disabled={busy || !/^\d{4,8}$/.test(n1)} onClick={() => save(async () => {
          const r = await changePin(oldPin, n1);
          if (r !== "ok") throw new Error(r === "locked" ? "Preveč poskusov. Počakaj 10 minut." : "Trenutni PIN ni pravilen.");
        })}>Shrani</button>
      </div>
    </Screen>
  );
}

export function Backup({ onBack }: { onBack: () => void }) {
  const { s } = useDerived();
  const { busy, save, Msg } = useSaver();
  const [delMode, setDelMode] = useState(false);
  const download = () => {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `adamov-dojo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <Screen title="Varnostna kopija" onBack={onBack}>
      <div className="card flex flex-col gap-2">
        <p>Izvozi vse podatke (vsebino, naloge, točke, napake) v datoteko JSON. Shrani jo na varno.</p>
        <button className="btn btn-primary" onClick={download} data-testid="izvozi"><Icon name="download" /> Izvozi JSON</button>
      </div>
      <div className="card flex flex-col gap-2">
        <p>Uvozi kopijo. Obstoječi zapisi ostanejo, manjkajoči se dodajo, vsebina se zamenja.</p>
        <label className="btn"><Icon name="upload" /> Izberi datoteko
          <input type="file" accept="application/json,.json" className="sr-only" data-testid="uvozi" onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void save(async () => importBackup(await f.text()));
            e.target.value = "";
          }} />
        </label>
        <Msg />
        {busy && <p>Uvažam ...</p>}
      </div>
      <div className="card flex flex-col gap-2">
        <button className="btn" onClick={() => setDelMode(!delMode)}>Uredi zvezek napak</button>
        {delMode && s.mistakes.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <span className="flex-1">{m.vprasanje}</span>
            <button className="btn !px-3" aria-label="Izbriši" onClick={() => void deleteMistake(m.id)}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
    </Screen>
  );
}
