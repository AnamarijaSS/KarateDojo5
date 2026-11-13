import { addDays, diffDays, isoWeek, weekday, type ISODate } from "./dates";
import type { Content, PocitniceObdobje, Turnir } from "./types";

/** Ocenjevanja z datumom, razvrščena po datumu. */
export function datedTournaments(c: Content): Turnir[] {
  return [...c.turnirji.turnirji].filter((t) => !!t.datum).sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Najbližji turnir PO današnjem dnevu. Test, ki je danes, ne šteje več:
 * Adam se doma uči po pouku, ko je test že mimo.
 */
export function nearestTournament(date: ISODate, c: Content): Turnir | undefined {
  return datedTournaments(c).find((t) => t.datum > date);
}

export function daysUntil(date: ISODate, t: Turnir): number {
  return diffDays(date, t.datum);
}

/** Barva odštevanja: zeleno > 7 dni, rumeno 3 do 7, rdeče < 3. */
export function countdownColor(days: number): "zelena" | "rumena" | "rdeca" {
  if (days > 7) return "zelena";
  if (days >= 3) return "rumena";
  return "rdeca";
}

/** "Pred testom" = test je čez 1 do predTestomDni dni (privzeto jutri ali pojutrišnjem). */
export function isBeforeTest(date: ISODate, c: Content): boolean {
  const n = c.ritem.predTestomDni ?? 2;
  return datedTournaments(c).some((t) => {
    const d = diffDays(date, t.datum);
    return d >= 1 && d <= n;
  });
}

export function holidayFor(date: ISODate, c: Content): PocitniceObdobje | undefined {
  return c.pocitnice.obdobja.find((o) => date >= o.od && date <= o.do);
}

/** Zamenjava predmeta (npr. DRU → NIT v 2. polletju). */
export function subjectOn(subject: string, date: ISODate, c: Content): string {
  let s = subject;
  for (const z of c.urnik.zamenjave ?? []) {
    if (date >= z.od) s = s.split(z.iz).join(z.v);
  }
  return s;
}

export function isOddWeek(date: ISODate, c: Content): boolean {
  const odd = isoWeek(date) % 2 === 1;
  return c["solsko-leto"].lihiTedenPravilo === "iso-obratno" ? !odd : odd;
}

export interface Pravilo531 { turnir: Turnir; dni: number; korak: 5 | 3 | 1; besedilo: string }

/** Pravilo 5·3·1 za vse turnirje v naslednjih 5 dneh. */
export function rule531(date: ISODate, c: Content): Pravilo531[] {
  const out: Pravilo531[] = [];
  for (const t of datedTournaments(c)) {
    const d = diffDays(date, t.datum);
    if (d >= 4 && d <= 5) out.push({ turnir: t, dni: d, korak: 5, besedilo: "Naredi seznam tem." });
    else if (d >= 2 && d <= 3) out.push({ turnir: t, dni: d, korak: 3, besedilo: "Vsak dan ena tema." });
    else if (d === 1) out.push({ turnir: t, dni: d, korak: 1, besedilo: "Samo kratka ponovitev in zgodaj spat." });
  }
  return out;
}

export type DayType = "solski" | "sobota" | "nedelja" | "pocitnice-prosto" | "pocitnice-plan";

export interface Opomnik { id: string; besedilo: string; ikona: "karate" | "luna" | "sonce" | "info" | "pogovor" }

export interface DayPlan {
  datum: ISODate;
  dan: number;
  tip: DayType;
  bloki: number;
  predTestom: boolean;
  /** Blok 1 oziroma fokus dneva = predmet z najbližjim turnirjem */
  fokus?: Turnir;
  fokusDni?: number;
  kata: string[];
  kataOpomba: string;
  kataCas: string;
  ponovitevTedna: number;
  opomniki: Opomnik[];
  pocitnice?: PocitniceObdobje;
  pravilo531: Pravilo531[];
  /** Turnirji, ki so že bili (zadnjih 7 dni) — za vprašanje »Kako je šlo?« */
  nedavniTurnirji: Turnir[];
  prometniZnaki: boolean;
}

export function planForDay(date: ISODate, c: Content): DayPlan {
  const dan = weekday(date);
  const r = c.ritem.dnevi[String(dan)] ?? { bloki: 0, blokiPredTestom: 0 };
  const fokus = nearestTournament(date, c);
  const predTestom = isBeforeTest(date, c);
  const hol = holidayFor(date, c);
  const nedavniTurnirji = datedTournaments(c).filter((t) => {
    const d = diffDays(t.datum, date);
    return d >= 1 && d <= 7;
  });
  const base: DayPlan = {
    datum: date, dan, tip: "solski", bloki: 0, predTestom, fokus,
    fokusDni: fokus ? diffDays(date, fokus.datum) : undefined,
    kata: [], kataOpomba: "", kataCas: "", ponovitevTedna: 0, opomniki: [],
    pravilo531: rule531(date, c), nedavniTurnirji, prometniZnaki: false,
  };

  if (hol) {
    return { ...base, tip: hol.nacin === "prosto" ? "pocitnice-prosto" : "pocitnice-plan", pocitnice: hol, pravilo531: hol.nacin === "prosto" ? [] : base.pravilo531 };
  }

  const kata = c.kata[String(dan)] ?? { predmeti: [], opomba: "" };
  const plan: DayPlan = {
    ...base,
    kata: kata.predmeti.map((p) => subjectOn(p, date, c)),
    kataOpomba: kata.opomba,
    kataCas: r.kata ?? "",
  };

  if (dan === 6) {
    // Sobota: en blok dopoldne samo, če je v ponedeljek ali torek ocenjevanje.
    const testPonTor = datedTournaments(c).some((t) => {
      const d = diffDays(date, t.datum);
      return (d === 2 || d === 3) && (weekday(t.datum) === 1 || weekday(t.datum) === 2);
    });
    return { ...plan, tip: "sobota", bloki: r.sobotaBlokCeTestPonTor && testPonTor ? 1 : 0 };
  }
  if (dan === 7) {
    plan.opomniki.push({ id: "nedelja", ikona: "pogovor", besedilo: r.nedelja ?? "10 minut pogovora z mamo + prometni znaki" });
    return { ...plan, tip: "nedelja", bloki: 0, prometniZnaki: true };
  }

  plan.bloki = predTestom ? r.blokiPredTestom : r.bloki;
  plan.ponovitevTedna = r.ponovitevTedna ?? 0;
  if (r.karate) plan.opomniki.push({ id: "karate", ikona: "karate", besedilo: c.ritem.karate });
  if (r.najdaljsiDan) plan.opomniki.push({ id: "sreda", ikona: "info", besedilo: "Danes je najdaljši dan. Samo en blok, to je dovolj." });
  if (r.zgodajSpat) {
    // Opomnik velja samo, če je jutri šolski dan (ne počitnice).
    if (!holidayFor(addDays(date, 1), c)) plan.opomniki.push({ id: "spanje", ikona: "luna", besedilo: "Danes zgodaj spat, jutri ob 7:30 dodatni pouk." });
  }
  return plan;
}

/** Tedenski izbor prometnih znakov (5 na teden, krožno). */
export function signsForWeek(date: ISODate, c: Content, perWeek = 5) {
  const all = c.znaki.znaki;
  if (all.length === 0) return [];
  const groups = Math.max(1, Math.ceil(all.length / perWeek));
  const g = isoWeek(date) % groups;
  return all.slice(g * perWeek, g * perWeek + perWeek);
}

/** Senseijev nasvet dneva (vedno isti za isti dan). */
export function tipForDay(date: ISODate, c: Content): string {
  const list = c.nasveti.length ? c.nasveti : ["Lepo, da si tu."];
  const n = Math.abs(diffDays("2026-01-01", date));
  return list[n % list.length];
}

/** Kateri kviz izbrati: sklop najbližjega turnirja, ki ima vprašanja; sicer prvi naslednji z vprašanji. */
export function pickQuizSet(date: ISODate, c: Content): string | undefined {
  for (const t of datedTournaments(c).filter((t) => t.datum > date)) {
    if (t.kviz && (c.kviz[t.kviz]?.vprasanja.length ?? 0) > 0) return t.kviz;
  }
  const any = Object.values(c.kviz).find((s) => s.vprasanja.length > 0);
  return any?.id;
}
