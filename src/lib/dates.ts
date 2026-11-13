// Vsi datumi so nizi 'YYYY-MM-DD' v časovnem pasu Europe/Ljubljana.
export type ISODate = string;

export const TZ = "Europe/Ljubljana";

export function todayInLjubljana(now: Date = new Date()): ISODate {
  // en-CA vrne obliko YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function hourInLjubljana(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
}

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function addDays(d: ISODate, n: number): ISODate {
  return new Date(toUTC(d) + n * 86400000).toISOString().slice(0, 10);
}

/** Koliko koledarskih dni je od a do b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

/** 1 = ponedeljek ... 7 = nedelja */
export function weekday(d: ISODate): number {
  const w = new Date(toUTC(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** ISO številka tedna */
export function isoWeek(d: ISODate): number {
  const t = new Date(toUTC(d));
  const day = weekday(d);
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** Ponedeljek tedna, v katerem je d */
export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - weekday(d));
}

export function isValidISO(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && addDays(d, 0) === d;
}

const DNEVI = ["", "ponedeljek", "torek", "sreda", "četrtek", "petek", "sobota", "nedelja"];
const DNEVI_KRATKO = ["", "pon", "tor", "sre", "čet", "pet", "sob", "ned"];

export function dayName(d: ISODate): string {
  return DNEVI[weekday(d)];
}
export function dayShort(d: ISODate): string {
  return DNEVI_KRATKO[weekday(d)];
}
/** '2026-12-10' → '10. 12.' */
export function fmtDate(d: ISODate, withYear = false): string {
  const [y, m, day] = d.split("-").map(Number);
  return withYear ? `${day}. ${m}. ${y}` : `${day}. ${m}.`;
}

export function daysWord(n: number): string {
  const a = Math.abs(n);
  const m100 = a % 100;
  if (m100 === 1) return `${n} dan`;
  if (m100 === 2) return `${n} dneva`;
  if (m100 === 3 || m100 === 4) return `${n} dnevi`;
  return `${n} dni`;
}
