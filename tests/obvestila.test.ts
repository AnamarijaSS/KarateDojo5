import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT as C } from "../src/lib/content";
import { adamMessage, DEFAULT_OBVESTILA as O, ljubljanaNow, mamaMessage, potrditev } from "../supabase/functions/push/logic";

const P = C.pocitnice.obdobja;
const T = C.turnirji.turnirji;
const at = (iso: string) => ljubljanaNow(new Date(iso));

describe("čas v Ljubljani", () => {
  it("pozimi UTC+1, poleti UTC+2", () => {
    expect(at("2026-11-16T14:30:00Z")).toEqual({ date: "2026-11-16", weekday: 1, minutes: 15 * 60 + 30 });
    expect(at("2027-06-01T13:00:00Z").minutes).toBe(15 * 60);
  });
});

describe("Adamov opomnik", () => {
  it("ponedeljek ob 15:30 z omembo očija ob 16:30", () => {
    const m = adamMessage(at("2026-11-16T14:31:00Z"), O, P, T);
    expect(m?.body).toMatch(/16:30/);
  });
  it("ne pred uro in ne več kot eno uro kasneje", () => {
    expect(adamMessage(at("2026-11-16T14:20:00Z"), O, P, T)).toBeNull(); // 15:20
    expect(adamMessage(at("2026-11-16T15:31:00Z"), O, P, T)).toBeNull(); // 16:31
  });
  it("torek ob 15:00", () => {
    expect(adamMessage(at("2026-11-17T14:00:00Z"), O, P, T)?.title).toBe("Čas za trening");
  });
  it("petek: ponovitev tedna", () => {
    expect(adamMessage(at("2026-11-20T14:05:00Z"), O, P, T)?.body).toMatch(/ponovitve tedna/);
  });
  it("sobota samo pred testom v pon ali tor", () => {
    expect(adamMessage(at("2026-12-12T09:05:00Z"), O, P, T)?.body).toMatch(/ponedeljek/); // MAT 14. 12.
    expect(adamMessage(at("2026-11-21T09:05:00Z"), O, P, T)).toBeNull();
  });
  it("počitnice: prosto brez opomnika, plan z nalogami", () => {
    expect(adamMessage(at("2026-12-25T14:05:00Z"), O, P, T)).toBeNull();
    expect(adamMessage(at("2026-12-28T14:35:00Z"), O, P, T)?.body).toMatch(/turistični vodnik/);
  });
  it("prazna ura pomeni brez opomnika", () => {
    expect(adamMessage(at("2026-11-17T14:00:00Z"), { ...O, adam: { ...O.adam, "2": "" } }, P, T)).toBeNull();
  });
});

describe("mamin večerni opomnik", () => {
  it("samo če kaj čaka", () => {
    expect(mamaMessage(at("2026-11-16T19:05:00Z"), O, 0, 0)).toBeNull();
    expect(mamaMessage(at("2026-11-16T19:05:00Z"), O, 4, 5)?.body).toBe("Adam čaka na 4 potrditve (5 Ki).");
    expect(mamaMessage(at("2026-11-16T18:55:00Z"), O, 4, 5)).toBeNull();
  });
  it("slovenska dvojina in množina", () => {
    expect([1, 2, 3, 5, 101, 102].map(potrditev)).toEqual(["1 potrditev", "2 potrditvi", "3 potrditve", "5 potrditev", "101 potrditev", "102 potrditvi"]);
  });
});

describe("nov ritem ponedeljek in sreda", () => {
  it("opomnik za karate pove 16:15 in očija ob 16:30", () => {
    expect(C.ritem.karate).toMatch(/16:15/);
    expect(C.ritem.karate).toMatch(/16:30/);
  });
});
