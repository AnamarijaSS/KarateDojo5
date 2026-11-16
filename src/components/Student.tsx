"use client";

import { useCallback, useMemo, useState } from "react";
import { dayName, daysWord, diffDays, fmtDate, type ISODate } from "@/lib/dates";
import { useDerived } from "@/lib/hooks";
import { ls } from "@/lib/idb";
import { countdownColor, datedTournaments, pickQuizSet, signsForWeek, tipForDay } from "@/lib/plan";
import { addEvent, addMistake, fixMistake, giveFeedback, setChecklist } from "@/lib/store";
import type { DojoEvent, Turnir, Vprasanje } from "@/lib/types";
import { Sign } from "./Sign";
import { gong, loadTimer, minutes, saveTimer, setSoundOn, soundOn, TimerFace, unlockAudio, useCountdown, type TimerState } from "./Timer";
import { BeltBar, Empty, Icon, Modal, Screen, Toggle } from "./ui";

export type StudentView = "danes" | "trening" | "turnirji" | "turnir" | "kviz" | "napake" | "nagrade";

// ---------------------------------------------------------------- glava s pasom in točkami

export function KiHeader() {
  const { belt, bal, niz, s } = useDerived();
  return (
    <div className="card flex flex-col gap-3" style={{ borderColor: belt.pas.barva }}>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-2xl font-extrabold">Živijo, {s.family?.child_name ?? "Adam"}!</p>
          <p className="font-semibold text-muted">{cap(belt.pas.ime)} pas</p>
        </div>
        <BeltBar pas={belt.pas} size="md" />
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="chip bg-ok-bg text-ok" data-testid="ki-potrjene"><Icon name="check" size={18} /> {bal.zaNagrade} Ki</span>
        <span className="chip bg-warn-bg text-warn" data-testid="ki-cakajoce"><Icon name="clock" size={18} /> {bal.cakajoce} čaka</span>
        <span className="chip border border-line"><Icon name="fire" size={18} /> {niz > 0 ? `niz ${daysWord(niz)}` : "nov niz se začne danes"}</span>
      </div>
      {belt.naslednji && (
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(belt.napredek * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${belt.napredek * 100}%`, background: belt.naslednji.barva === "#f5f5f4" ? "var(--ink)" : belt.naslednji.barva }} />
          </div>
          <p className="mt-1 text-base text-muted">Še {belt.doNaslednjega} Ki do pasu: {belt.naslednji.ime}</p>
        </div>
      )}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- Danes

export function Today({ go, startTimer }: { go: (v: StudentView, arg?: string) => void; startTimer: (t: TimerState) => void }) {
  const d = useDerived();
  const { plan, s, today, events, feedback } = d;
  const c = s.content;
  const name = (p: string) => c.urnik.predmeti[p] ?? p;
  const todayTrainings = events.filter((e) => e.vrsta === "trening" && e.dan === today && e.status !== "rejected").length;
  const kataDone = events.some((e) => e.vrsta === "kata" && e.ref === today && e.status !== "rejected");
  const ponovitevDone = events.some((e) => e.vrsta === "ponovitev" && e.ref === today && e.status !== "rejected");

  if (plan.tip === "pocitnice-prosto") {
    return (
      <Screen>
        <KiHeader />
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <Icon name="sun" size={64} className="text-warn" />
          <p className="text-3xl font-extrabold" data-testid="pocitnice-prosto">{plan.pocitnice?.besedilo ?? "Uživaj počitnice!"}</p>
        </div>
      </Screen>
    );
  }

  const tournamentStart = (t: TimerState) => { unlockAudio(); startTimer(t); };

  return (
    <Screen>
      <KiHeader />
      <Rejections events={events} />
      <p className="px-1 text-lg font-bold capitalize">{dayName(today)}, {fmtDate(today)}</p>
      <div className="card flex gap-3 bg-card"><Icon name="star" className="shrink-0 text-warn" /><p className="italic">{tipForDay(today, c)}</p></div>

      {plan.nedavniTurnirji.filter((t) => !feedback.some((f) => f.turnir_id === t.id)).map((t) => (
        <HowDidItGo key={t.id} t={t} name={name(t.predmet)} />
      ))}

      {plan.tip === "pocitnice-plan" && plan.pocitnice && (
        <div className="card flex flex-col gap-3" data-testid="pocitnice-plan">
          <p className="text-xl font-extrabold">{plan.pocitnice.besedilo}</p>
          {(plan.pocitnice.naloge ?? []).map((n, i) => {
            const ref = `${today}#${i}`;
            const done = events.some((e) => e.vrsta === "pocitnice" && e.ref === ref && e.status !== "rejected");
            const min = Number((n.match(/(\d+)\s*min/) ?? [])[1] ?? (plan.pocitnice?.besedilo.match(/(\d+)\s*min/) ?? [])[1] ?? 20);
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="flex-1 font-semibold">{n}</span>
                {done ? <span className="chip bg-ok-bg text-ok"><Icon name="check" size={18} /> narejeno</span> : (
                  <button className="btn btn-primary" onClick={() => tournamentStart({ kind: "pocitnice", phase: "work", startedAt: Date.now(), durationSec: minutes(min), ref, opis: n })}>
                    <Icon name="play" size={18} /> {min} min
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {plan.tip !== "pocitnice-plan" && (
        <div className="card flex flex-col gap-3" data-testid="plan-dneva">
          {plan.bloki > 0 ? (
            <>
              <p className="text-xl font-extrabold" data-testid="bloki">Danes: {plan.bloki} {plan.bloki === 1 ? "trening" : plan.bloki === 2 ? "treninga" : "treningi"} po 20 min</p>
              <ol className="flex flex-col gap-2">
                {Array.from({ length: plan.bloki }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-2xl border-2 border-line p-3" style={i < todayTrainings ? { borderColor: "var(--ok)" } : undefined}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-extrabold" style={{ background: i < todayTrainings ? "var(--ok)" : "var(--line)", color: i < todayTrainings ? "var(--card)" : "var(--ink)" }}>
                      {i < todayTrainings ? <Icon name="check" size={20} /> : i + 1}
                    </span>
                    <span className="flex-1">
                      {i === 0 && plan.fokus ? (
                        <span data-testid="blok1"><b>{name(plan.fokus.predmet)}</b> <span className="text-muted">· turnir čez {daysWord(plan.fokusDni ?? 0)}</span></span>
                      ) : (
                        <span className="text-muted">{i === 0 ? "Po izbiri ali po seznamu priprav" : "Naslednja naloga s seznama priprav"}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              {plan.fokus && <p data-testid="blok1">Fokus tedna: <b>{name(plan.fokus.predmet)}</b> <span className="text-muted">· turnir čez {daysWord(plan.fokusDni ?? 0)}</span></p>}
              {plan.ponovitevTedna > 0 ? (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-xl font-extrabold">{plan.ponovitevTedna} min ponovitve tedna</span>
                  {ponovitevDone ? <span className="chip bg-ok-bg text-ok"><Icon name="check" size={18} /> narejeno</span> : (
                    <button className="btn btn-primary" onClick={() => tournamentStart({ kind: "ponovitev", phase: "work", startedAt: Date.now(), durationSec: minutes(plan.ponovitevTedna), ref: today })}><Icon name="play" size={18} /> Začni</button>
                  )}
                </div>
              ) : plan.tip === "nedelja" ? null : (
                <p className="text-xl font-extrabold">Danes ni treninga. Uživaj!</p>
              )}
            </>
          )}
        </div>
      )}

      {plan.opomniki.map((o) => (
        <div key={o.id} className="card flex items-start gap-3" data-testid={`opomnik-${o.id}`}>
          <Icon name={o.ikona === "luna" ? "moon" : o.ikona === "pogovor" ? "chat" : o.ikona === "karate" ? "karate" : "info"} className="mt-0.5 shrink-0 text-accent" />
          <p className="font-semibold">{o.besedilo}</p>
        </div>
      ))}

      {plan.pravilo531.map((r) => (
        <div key={r.turnir.id} className="card flex items-start gap-3 border-warn">
          <span className="chip shrink-0 bg-warn-bg text-warn">{r.korak}</span>
          <p><b>{name(r.turnir.predmet)}</b> čez {daysWord(r.dni)}: {r.besedilo}</p>
        </div>
      ))}

      {(plan.kata.length > 0 || plan.kataOpomba) && plan.tip === "solski" && (
        <div className="card flex flex-col gap-2" data-testid="kata">
          <p className="text-lg font-extrabold">Kata dneva {plan.kataCas && <span className="font-semibold text-muted">· {plan.kataCas}</span>}</p>
          <p>{plan.kata.length ? `Ponovi zvezke: ${plan.kata.join(", ")}` : plan.kataOpomba}</p>
          <p className="text-base text-muted">5 do 10 minut.</p>
          {kataDone ? <span className="chip self-start bg-ok-bg text-ok"><Icon name="check" size={18} /> kata narejena</span> : (
            <button className="btn self-start" onClick={() => addEvent("kata", { ref: today, opis: plan.kata.join(", ") || plan.kataOpomba })}><Icon name="check" /> Kata narejena (+1 Ki)</button>
          )}
        </div>
      )}

      {plan.prometniZnaki && <SignsCard today={today} />}

      {plan.tip !== "pocitnice-plan" && (
        <button className="btn btn-big btn-primary mt-2" data-testid="zacni-trening" onClick={() => go("trening")}>
          <Icon name="play" size={28} /> Začni trening
        </button>
      )}
      <button className="btn" onClick={() => tournamentStart({ kind: "branje", phase: "work", startedAt: Date.now(), durationSec: minutes(15) })}>
        <Icon name="book" /> 15 minut branja
      </button>
    </Screen>
  );
}

function Rejections({ events }: { events: DojoEvent[] }) {
  const [seen, setSeen] = useState<string[]>(() => {
    try { return JSON.parse(ls.get("dojo-videno") ?? "[]"); } catch { return []; }
  });
  const list = events.filter((e) => e.status === "rejected" && !seen.includes(e.id)).slice(-3);
  if (!list.length) return null;
  const hide = (id: string) => {
    const next = [...seen, id].slice(-200);
    setSeen(next);
    ls.set("dojo-videno", JSON.stringify(next));
  };
  return (
    <>
      {list.map((e) => (
        <div key={e.id} className="card flex items-start gap-3 border-warn" data-testid="sporocilo-mame">
          <Icon name="chat" className="mt-0.5 shrink-0 text-warn" />
          <div className="flex-1">
            <p className="font-bold">Mama sporoča</p>
            <p>{e.komentar || "Tole bova naredila še enkrat skupaj."}</p>
          </div>
          <button className="btn !min-h-11 !px-3" onClick={() => hide(e.id)} aria-label="Skrij"><Icon name="check" /></button>
        </div>
      ))}
    </>
  );
}

function HowDidItGo({ t, name }: { t: Turnir; name: string }) {
  return (
    <div className="card flex flex-col gap-3" data-testid="kako-je-slo">
      <p className="font-bold">Kako je šlo pri {name} ({fmtDate(t.datum)})?</p>
      <div className="grid grid-cols-3 gap-2">
        {([["super", "😀", "Super"], ["ok", "🙂", "V redu"], ["tezko", "😕", "Težko"]] as const).map(([m, e, l]) => (
          <button key={m} className="btn flex-col !py-3" onClick={() => giveFeedback(t.id, m)}>
            <span className="text-3xl" aria-hidden>{e}</span><span className="text-base">{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SignsCard({ today }: { today: ISODate }) {
  const { s } = useDerived();
  const signs = signsForWeek(today, s.content);
  const [show, setShow] = useState<string | null>(null);
  return (
    <div className="card flex flex-col gap-3" data-testid="prometni-znaki">
      <p className="text-lg font-extrabold">5 prometnih znakov za ponedeljek</p>
      <p className="text-base text-muted">Tapni znak in povej, kaj pomeni. Potem preveri.</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {signs.map((z) => (
          <button key={z.id} className="flex flex-col items-center gap-1 rounded-2xl border-2 border-line p-2" onClick={() => setShow(show === z.id ? null : z.id)} aria-expanded={show === z.id}>
            <Sign znak={z} size={72} />
            {show === z.id && <span className="text-center text-base font-semibold">{z.pomen}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- časovniki

export function TimerScreen({ timer, setTimer, onExit }: { timer: TimerState; setTimer: (t: TimerState | null) => void; onExit: () => void }) {
  const { s } = useDerived();
  const onEnd = useCallback(() => {
    gong();
    if (timer.phase === "break") { setTimer(null); onExit(); return; }
    const done = { ...timer, phase: "done" as const };
    setTimer(done);
  }, [timer, setTimer, onExit]);
  const { remaining, progress } = useCountdown(timer, onEnd);

  if (timer.phase === "done") {
    return <AfterTimer timer={timer} subjects={Object.keys(s.content.urnik.predmeti)} names={s.content.urnik.predmeti}
      onDone={(predmet) => {
        if (timer.kind === "trening") {
          addEvent("trening", { predmet });
          setTimer({ kind: "trening", phase: "break", startedAt: Date.now(), durationSec: minutes(5) });
        } else {
          if (timer.kind === "branje") addEvent("branje");
          if (timer.kind === "ponovitev") addEvent("ponovitev", { ref: timer.ref });
          if (timer.kind === "pocitnice") addEvent("pocitnice", { ref: timer.ref, opis: timer.opis });
          setTimer(null);
          onExit();
        }
      }}
      onSkip={() => { setTimer(null); onExit(); }} />;
  }
  const msg = timer.phase === "break"
    ? "Odmor. Vstani, popij vodo, pretegni se."
    : timer.kind === "branje" ? "Knjiga odprta, telefon stran. Vidimo se čez 15 minut."
    : timer.kind === "trening" ? "Zvezek odprt, telefon stran. Vidimo se čez 20 minut."
    : "Zvezek odprt, telefon stran. Vidimo se, ko se krog napolni.";
  return <TimerFace t={timer} remaining={remaining} progress={progress} message={msg} onCancel={() => { setTimer(null); onExit(); }} />;
}

function AfterTimer({ timer, subjects, names, onDone, onSkip }: { timer: TimerState; subjects: string[]; names: Record<string, string>; onDone: (predmet: string) => void; onSkip: () => void }) {
  const { plan } = useDerived();
  const [predmet, setPredmet] = useState(plan.fokus?.predmet ?? "");
  const [ok, setOk] = useState(false);
  const isTraining = timer.kind === "trening";
  return (
    <Screen title={isTraining ? "Kaj si naredil?" : "Bravo!"}>
      {isTraining && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Predmet">
          {subjects.filter((p) => ["SLJ", "MAT", "DRU", "NIT", "TJA", "GOS"].includes(p)).map((p) => (
            <button key={p} role="radio" aria-checked={predmet === p} className="btn" style={predmet === p ? { borderColor: "var(--accent)", background: "var(--bad-bg)" } : undefined} onClick={() => setPredmet(p)}>
              {names[p] ?? p}
            </button>
          ))}
        </div>
      )}
      <label className="card flex min-h-16 cursor-pointer items-center gap-3">
        <input type="checkbox" className="h-8 w-8 accent-[var(--ok)]" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span className="text-xl font-bold">{timer.kind === "branje" ? "Bral sem 15 minut" : "Naredil sem"}</span>
      </label>
      <button className="btn btn-big btn-primary" data-testid="potrdi-trening" disabled={!ok || (isTraining && !predmet)} onClick={() => onDone(predmet)}>
        <Icon name="check" size={28} /> +1 Ki
      </button>
      <button className="btn" onClick={onSkip}>Danes ne</button>
    </Screen>
  );
}

export function TrainingStart({ onStart, onBack }: { onStart: (t: TimerState) => void; onBack: () => void }) {
  const { plan, s } = useDerived();
  const name = (p: string) => s.content.urnik.predmeti[p] ?? p;
  return (
    <Screen title="Trening" onBack={onBack}>
      <div className="card flex flex-col items-center gap-3 py-8 text-center">
        <Icon name="karate" size={56} className="text-accent" />
        <p className="text-2xl font-extrabold">20 minut dela, 5 minut odmora</p>
        {plan.fokus && <p>Predlog: <b>{name(plan.fokus.predmet)}</b> (turnir {fmtDate(plan.fokus.datum)})</p>}
        <p className="text-muted">Pripravi zvezek in svinčnik. Telefon odloži.</p>
      </div>
      <div className="card"><SoundSwitch /></div>
      <button className="btn btn-big btn-primary" data-testid="start-timer" onClick={() => { unlockAudio(); onStart({ kind: "trening", phase: "work", startedAt: Date.now(), durationSec: minutes(20) }); }}>
        <Icon name="play" size={28} /> Začni
      </button>
    </Screen>
  );
}

function SoundSwitch() {
  const [on, setOn] = useState(soundOn);
  return <Toggle on={on} onChange={(v) => { setSoundOn(v); setOn(v); }} label="Zvok na koncu" />;
}

export function useTimerState(): [TimerState | null, (t: TimerState | null) => void] {
  const [t, setT] = useState<TimerState | null>(loadTimer);
  const set = useCallback((next: TimerState | null) => { saveTimer(next); setT(next); }, []);
  return [t, set];
}

// ---------------------------------------------------------------- Turnirji

export function TournamentList({ go }: { go: (v: StudentView, arg?: string) => void }) {
  const { s, today, checklist } = useDerived();
  const c = s.content;
  const all = datedTournaments(c);
  const upcoming = all.filter((t) => t.datum >= today);
  const past = all.filter((t) => t.datum < today);
  return (
    <Screen title="Turnirji">
      {c.turnirji.sprotni.map((sp) => (
        <div key={sp.id} className="card flex items-center gap-3">
          <Icon name="chat" className="shrink-0 text-muted" />
          <p><b>{c.urnik.predmeti[sp.predmet] ?? sp.predmet}</b>: {sp.vrsta}, od {fmtDate(sp.od)}. Priprava: {sp.priprava}.</p>
        </div>
      ))}
      {upcoming.length === 0 && <Empty>Ni prihajajočih turnirjev.</Empty>}
      {upcoming.map((t) => <TournamentRow key={t.id} t={t} today={today} done={checklist.filter((r) => r.turnir_id === t.id && r.done).length} onOpen={() => go("turnir", t.id)} />)}
      {past.length > 0 && <p className="mt-4 px-1 font-bold text-muted">Že mimo</p>}
      {past.map((t) => <TournamentRow key={t.id} t={t} today={today} done={checklist.filter((r) => r.turnir_id === t.id && r.done).length} onOpen={() => go("turnir", t.id)} past />)}
    </Screen>
  );
}

function TournamentRow({ t, today, done, onOpen, past }: { t: Turnir; today: ISODate; done: number; onOpen: () => void; past?: boolean }) {
  const { s } = useDerived();
  const days = diffDays(today, t.datum);
  const col = countdownColor(days);
  const style = col === "zelena" ? "bg-ok-bg text-ok" : col === "rumena" ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad";
  return (
    <button className={`card flex items-center gap-3 text-left ${past ? "opacity-60" : ""}`} onClick={onOpen} data-testid={`turnir-${t.id}`}>
      <div className="flex-1">
        <p className="text-lg font-extrabold">{s.content.urnik.predmeti[t.predmet] ?? t.predmet}</p>
        <p className="text-base text-muted">{t.vrsta} · {dayName(t.datum)} {fmtDate(t.datum)}</p>
        <p className="text-base">{done}/{t.priprave.length} priprav{t.potrditi ? " · datum še potrditi" : ""}</p>
      </div>
      {!past && <span className={`chip shrink-0 ${style}`} data-color={col}>{days === 0 ? "danes" : daysWord(days)}</span>}
    </button>
  );
}

export function TournamentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { s, today, checklist, events } = useDerived();
  const t = s.content.turnirji.turnirji.find((x) => x.id === id);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  if (!t) return <Screen title="Turnir" onBack={onBack}><Empty>Turnirja ni več.</Empty></Screen>;
  const rows = checklist.filter((r) => r.turnir_id === t.id);
  const row = (item: string) => rows.find((r) => r.item_id === item);
  const doneCount = t.priprave.filter((p) => row(p.id)?.done).length;
  const zacetekBonus = events.some((e) => e.vrsta === "turnir_zacetek" && e.ref === t.id && e.status !== "rejected");
  const seznamBonus = events.some((e) => e.vrsta === "turnir_seznam" && e.ref === t.id && e.status !== "rejected");
  const days = diffDays(today, t.datum);

  const toggle = (itemId: string, done: boolean) => {
    const vnos = inputs[itemId] ?? row(itemId)?.vnos ?? "";
    const wasNone = doneCount === 0;
    setChecklist(t.id, itemId, done, vnos);
    if (done && wasNone && today <= t.zacetek) addEvent("turnir_zacetek", { ref: t.id, predmet: t.predmet });
    const after = t.priprave.filter((p) => (p.id === itemId ? done : row(p.id)?.done)).length;
    if (done && after === t.priprave.length) addEvent("turnir_seznam", { ref: t.id, predmet: t.predmet });
  };

  return (
    <Screen title={s.content.urnik.predmeti[t.predmet] ?? t.predmet} onBack={onBack}>
      <div className="card">
        <p className="text-lg font-bold">{t.vrsta}</p>
        <p>{dayName(t.datum)}, {fmtDate(t.datum, true)} · {days > 0 ? `čez ${daysWord(days)}` : days === 0 ? "danes" : "že mimo"}</p>
        <p className="text-muted">Začnem se pripravljati: {fmtDate(t.zacetek)}</p>
        {t.potrditi && <p className="mt-2 rounded-xl bg-warn-bg p-2 font-semibold text-warn">{t.potrditi}</p>}
      </div>
      <div className="card flex flex-col gap-1 text-base">
        <p><Icon name="star" size={18} className="inline text-warn" /> Začni do {fmtDate(t.zacetek)}: <b>+3 Ki</b> {zacetekBonus && "✔"}</p>
        <p><Icon name="star" size={18} className="inline text-warn" /> Cel seznam odkljukan: <b>+5 Ki</b> {seznamBonus && "✔"}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {t.priprave.map((p) => {
          const r = row(p.id);
          return (
            <li key={p.id} className="card flex flex-col gap-2">
              <label className="flex min-h-12 cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-7 w-7 shrink-0 accent-[var(--ok)]" checked={!!r?.done} onChange={(e) => toggle(p.id, e.target.checked)} data-testid={`priprava-${p.id}`} />
                <span className={r?.done ? "text-muted line-through" : "font-semibold"}>{p.besedilo}</span>
              </label>
              {p.vnos && (
                <div className="flex gap-2">
                  <input className="input" placeholder={p.vnos} aria-label={p.vnos} value={inputs[p.id] ?? r?.vnos ?? ""} onChange={(e) => setInputs({ ...inputs, [p.id]: e.target.value })} />
                  <button className="btn" onClick={() => setChecklist(t.id, p.id, !!r?.done, inputs[p.id] ?? "")}>Shrani</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}

// ---------------------------------------------------------------- Avto kviz

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function Quiz({ parentHint = false }: { parentHint?: boolean }) {
  const { s, today } = useDerived();
  const c = s.content;
  const auto = pickQuizSet(today, c);
  const [setId, setSetId] = useState<string | undefined>(undefined);
  const active = setId ?? auto;
  const sklop = active ? c.kviz[active] : undefined;
  const [round, setRound] = useState<Vprasanje[] | null>(null);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [wrong, setWrong] = useState<Vprasanje[]>([]);
  const [finished, setFinished] = useState(false);

  const begin = () => {
    if (!sklop) return;
    setRound(shuffle(sklop.vprasanja).slice(0, 10));
    setI(0); setShow(false); setWrong([]); setFinished(false);
  };
  const answer = (ok: boolean) => {
    if (!round || !sklop) return;
    const q = round[i];
    if (!ok) { setWrong((w) => [...w, q]); addMistake(q.v, q.o, sklop.ime); }
    if (i + 1 >= round.length) {
      setFinished(true);
      addEvent("kviz", { predmet: sklop.id, opis: `${round.length - wrong.length - (ok ? 0 : 1)}/${round.length}` });
    } else { setI(i + 1); setShow(false); }
  };

  if (round && !finished) {
    const q = round[i];
    return (
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <span className="chip border border-line">{i + 1} / {round.length}</span>
          <button className="btn !min-h-11" onClick={() => setRound(null)}><Icon name="x" /> Končaj</button>
        </div>
        <div className="card flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <p className="text-3xl font-extrabold leading-snug" data-testid="kviz-vprasanje">{q.v}</p>
          {show ? (
            <p className="text-2xl font-bold text-ok">{q.o}{q.preveri && <span className="mt-2 block text-base text-warn">preveri v zvezku</span>}</p>
          ) : (
            <button className="btn" onClick={() => setShow(true)}><Icon name="eye" /> Pokaži odgovor</button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn h-28 border-bad text-bad" onClick={() => answer(false)} aria-label="Narobe" data-testid="kviz-narobe"><Icon name="x" size={56} /></button>
          <button className="btn h-28 border-ok text-ok" onClick={() => answer(true)} aria-label="Prav" data-testid="kviz-prav"><Icon name="check" size={56} /></button>
        </div>
      </div>
    );
  }

  return (
    <Screen title="Avto kviz">
      {finished && round && (
        <div className="card text-center" data-testid="kviz-konec">
          <p className="text-2xl font-extrabold">Runda končana! +1 Ki</p>
          <p>{round.length - wrong.length} od {round.length} prav.{wrong.length > 0 && " Napačna vprašanja so v zvezku napak."}</p>
        </div>
      )}
      <div className="card flex flex-col gap-2">
        <p className="font-semibold">{parentHint ? "Adam bere vprašanje in odgovori na glas. Ti rečeš prav ali narobe." : "Preberi vprašanje na glas in odgovori. Mama reče prav ali narobe, ti tapneš."}</p>
        <p className="text-base text-muted">Kdor vozi, ne tapa po telefonu.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tema">
        {Object.values(c.kviz).map((k) => (
          <button key={k.id} role="radio" aria-checked={active === k.id} className="chip border-2 border-line !py-2" style={active === k.id ? { borderColor: "var(--accent)" } : undefined} onClick={() => setSetId(k.id)}>
            {k.ime} ({k.vprasanja.length})
          </button>
        ))}
      </div>
      {sklop && sklop.vprasanja.length === 0 && <Empty>{sklop.navodilo || "Ta tema še nima vprašanj. Mama jih doda v nastavitvah."}</Empty>}
      {sklop && sklop.vprasanja.length > 0 && sklop.vprasanja.some((q) => q.preveri) && <p className="rounded-xl bg-warn-bg p-3 text-warn">{sklop.navodilo}</p>}
      <button className="btn btn-big btn-primary" disabled={!sklop || sklop.vprasanja.length === 0} onClick={begin} data-testid="kviz-zacni">
        <Icon name="car" size={28} /> {finished ? "Še ena runda" : "Začni rundo (10 vprašanj)"}
      </button>
    </Screen>
  );
}

// ---------------------------------------------------------------- Zvezek napak

export function Mistakes() {
  const { mistakes } = useDerived();
  const [add, setAdd] = useState(false);
  const [v, setV] = useState("");
  const [o, setO] = useState("");
  const [showFixed, setShowFixed] = useState(false);
  const open = mistakes.filter((m) => !m.fixed_at);
  const fixed = mistakes.filter((m) => m.fixed_at);
  return (
    <Screen title="Zvezek napak" right={<button className="btn !min-h-11" onClick={() => setAdd(true)}><Icon name="plus" /> Dodaj</button>}>
      <p className="px-1 text-muted">Napaka je zemljevid do zaklada. Ko jo popraviš v zvezku, tapni »Popravil sem«.</p>
      {open.length === 0 && <Empty>Zvezek napak je prazen. Super!</Empty>}
      {open.map((m) => (
        <div key={m.id} className="card flex flex-col gap-2" data-testid="napaka">
          <p className="font-bold">{m.vprasanje}</p>
          {m.odgovor && <p className="text-muted">Pravilno: {m.odgovor}</p>}
          <div className="flex items-center gap-2">
            <span className="flex-1 text-base text-muted">{m.vir}</span>
            <button className="btn" onClick={() => fixMistake(m.id)}><Icon name="check" /> Popravil sem (+1 Ki)</button>
          </div>
        </div>
      ))}
      {fixed.length > 0 && (
        <button className="btn" onClick={() => setShowFixed(!showFixed)}>{showFixed ? "Skrij popravljene" : `Popravljene (${fixed.length})`}</button>
      )}
      {showFixed && fixed.map((m) => (
        <div key={m.id} className="card opacity-70"><p className="line-through">{m.vprasanje}</p></div>
      ))}
      <Modal open={add} onClose={() => setAdd(false)} title="Nova napaka">
        <div className="flex flex-col gap-3">
          <input className="input" placeholder="Kaj je bilo narobe?" aria-label="Napaka" value={v} onChange={(e) => setV(e.target.value)} />
          <input className="input" placeholder="Pravilno je ..." aria-label="Pravilno" value={o} onChange={(e) => setO(e.target.value)} />
          <button className="btn btn-primary" disabled={!v.trim()} onClick={() => { addMistake(v.trim(), o.trim(), "ročno"); setV(""); setO(""); setAdd(false); }}>Shrani</button>
        </div>
      </Modal>
    </Screen>
  );
}

// ---------------------------------------------------------------- Nagrade (Adam samo gleda)

export function Rewards() {
  const { s, bal, belt } = useDerived();
  const list = s.content.ki.nagrade;
  const pasovi = useMemo(() => [...s.content.ki.pasovi].sort((a, b) => a.od - b.od), [s.content.ki.pasovi]);
  return (
    <Screen title="Nagrade">
      <div className="card text-center">
        <p className="text-base text-muted">Potrjene Ki za nagrade</p>
        <p className="text-5xl font-extrabold" data-testid="ki-za-nagrade">{bal.zaNagrade}</p>
        {bal.cakajoce > 0 && <p className="text-warn">+{bal.cakajoce} čaka na mamino potrditev</p>}
      </div>
      {list.map((n) => (
        <div key={n.id} className="card flex items-center gap-3">
          <Icon name="gift" className="shrink-0 text-accent" />
          <div className="flex-1">
            <p className="font-bold">{n.ime}</p>
            <p className="text-base text-muted">{n.cena} Ki</p>
          </div>
          {bal.zaNagrade >= n.cena ? <span className="chip bg-ok-bg text-ok">Pokaži mami</span> : <span className="chip border border-line">še {n.cena - bal.zaNagrade}</span>}
        </div>
      ))}
      <p className="px-1 text-base text-muted">Nagrado unovči mama na svojem telefonu. Pas ostane, tudi ko porabiš točke.</p>
      <p className="mt-2 px-1 font-bold">Pot do črnega pasu</p>
      <div className="card flex flex-col gap-2">
        {pasovi.map((p, i) => (
          <div key={p.ime} className={`flex items-center gap-3 ${i > belt.index ? "opacity-50" : ""}`}>
            <BeltBar pas={p} size="sm" />
            <span className="flex-1 font-semibold">{cap(p.ime)}</span>
            <span className="text-base text-muted">{p.od} Ki</span>
          </div>
        ))}
      </div>
      {s.redemptions.length > 0 && (
        <>
          <p className="mt-2 px-1 font-bold">Unovčeno</p>
          {[...s.redemptions].reverse().slice(0, 10).map((r) => (
            <div key={r.id} className="card flex justify-between"><span>{r.label}</span><span className="text-muted">{fmtDate(r.created_at.slice(0, 10))}</span></div>
          ))}
        </>
      )}
    </Screen>
  );
}
