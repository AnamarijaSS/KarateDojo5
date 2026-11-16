// Odločitev, katero obvestilo poslati. Čiste funkcije brez odvisnosti,
// da jih lahko testiramo z Vitest in uporabimo v Edge funkciji (Deno).

export interface Obvestila { adam: Record<string, string>; mama: string }
export interface Pocitnice { od: string; do: string; nacin: "prosto" | "plan"; besedilo: string; naloge?: string[] }
export interface TurnirMin { id: string; datum: string; predmet: string }
export interface Now { date: string; weekday: number; minutes: number }
export interface Message { kind: "adam" | "mama"; title: string; body: string }

export const DEFAULT_OBVESTILA: Obvestila = {
  adam: { "1": "15:30", "2": "15:00", "3": "15:00", "4": "15:00", "5": "15:00", "6": "10:00", "7": "" },
  mama: "20:00",
};

/** Okno, v katerem pošljemo obvestilo (če cron kdaj zamudi, ne pošljemo pozno zvečer). */
export const WINDOW_MIN = 60;

export function ljubljanaNow(d: Date): Now {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: wd, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function parseHM(s: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

function inWindow(now: Now, hm: string | undefined | null): boolean {
  const t = parseHM(hm);
  return t !== null && now.minutes >= t && now.minutes < t + WINDOW_MIN;
}

function days(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
function weekdayOf(d: string): number {
  const w = new Date(d + "T00:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}

export function adamMessage(now: Now, obv: Obvestila, pocitnice: Pocitnice[], turnirji: TurnirMin[]): Message | null {
  if (!inWindow(now, obv.adam?.[String(now.weekday)])) return null;
  const hol = pocitnice.find((p) => now.date >= p.od && now.date <= p.do);
  if (hol?.nacin === "prosto") return null;
  if (hol?.nacin === "plan") {
    return { kind: "adam", title: "Počitniški trening", body: (hol.naloge ?? []).join(" + ") || hol.besedilo };
  }
  switch (now.weekday) {
    case 1:
    case 3:
      return { kind: "adam", title: "Čas za trening", body: "Odpri Dojo in začni. Ob 16:30 pride oči." };
    case 2:
    case 4:
      return { kind: "adam", title: "Čas za trening", body: "Odpri Dojo in poglej današnjo nalogo." };
    case 5:
      return { kind: "adam", title: "Petek", body: "15 minut ponovitve tedna, potem je vikend tvoj." };
    case 6: {
      const t = turnirji.find((x) => {
        const d = days(now.date, x.datum);
        return (d === 2 || d === 3) && (weekdayOf(x.datum) === 1 || weekdayOf(x.datum) === 2);
      });
      return t ? { kind: "adam", title: "Sobotni trening", body: `En blok dopoldne, ${weekdayOf(t.datum) === 1 ? "v ponedeljek" : "v torek"} je test.` } : null;
    }
    case 7:
      return { kind: "adam", title: "Nedelja", body: "10 minut pogovora z mamo in 5 prometnih znakov." };
  }
  return null;
}

export function potrditev(n: number): string {
  const m = n % 100;
  if (m === 1) return `${n} potrditev`;
  if (m === 2) return `${n} potrditvi`;
  if (m === 3 || m === 4) return `${n} potrditve`;
  return `${n} potrditev`;
}

export function mamaMessage(now: Now, obv: Obvestila, pendingCount: number, pendingKi: number): Message | null {
  if (pendingCount <= 0 || !inWindow(now, obv.mama)) return null;
  return { kind: "mama", title: "Adamov Dojo", body: `Adam čaka na ${potrditev(pendingCount)} (${pendingKi} Ki).` };
}
