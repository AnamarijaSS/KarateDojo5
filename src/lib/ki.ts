import type { DojoEvent, Pas, Redemption } from "./types";

export interface Balances {
  /** vse potrjene Ki, kar jih je kdaj zaslužil (za pas, nikoli ne pada) */
  potrjeneSkupaj: number;
  cakajoce: number;
  porabljene: number;
  /** stanje za nagrade = potrjene − porabljene */
  zaNagrade: number;
}

export function balances(events: DojoEvent[], redemptions: Redemption[]): Balances {
  let potrjeneSkupaj = 0;
  let cakajoce = 0;
  for (const e of events) {
    if (e.status === "confirmed") potrjeneSkupaj += e.ki;
    else if (e.status === "pending") cakajoce += e.ki;
  }
  const porabljene = redemptions.reduce((s, r) => s + r.cost, 0);
  return { potrjeneSkupaj, cakajoce, porabljene, zaNagrade: potrjeneSkupaj - porabljene };
}

export function sortedBelts(pasovi: Pas[]): Pas[] {
  return [...pasovi].sort((a, b) => a.od - b.od);
}

export interface BeltInfo { pas: Pas; index: number; naslednji?: Pas; doNaslednjega: number; napredek: number }

export function beltFor(total: number, pasovi: Pas[]): BeltInfo {
  const list = sortedBelts(pasovi);
  let index = 0;
  for (let i = 0; i < list.length; i++) if (total >= list[i].od) index = i;
  const pas = list[index];
  const naslednji = list[index + 1];
  const doNaslednjega = naslednji ? naslednji.od - total : 0;
  const napredek = naslednji ? (total - pas.od) / (naslednji.od - pas.od) : 1;
  return { pas, index, naslednji, doNaslednjega, napredek: Math.max(0, Math.min(1, napredek)) };
}
