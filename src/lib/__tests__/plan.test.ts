import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT as C } from "../content";
import { addDays, dayShort, diffDays, isoWeek, todayInLjubljana, weekday } from "../dates";
import { countdownColor, isBeforeTest, nearestTournament, pickQuizSet, planForDay, rule531, signsForWeek, subjectOn } from "../plan";

describe("koledar: dnevi v tednu iz tabele Turnirji (kriterij 8)", () => {
  const pricakovano: [string, string][] = [
    ["2026-12-10", "čet"], ["2026-12-14", "pon"], ["2026-12-18", "pet"], ["2027-01-07", "čet"],
    ["2027-01-12", "tor"], ["2027-01-14", "čet"], ["2027-01-19", "tor"], ["2027-01-20", "sre"],
  ];
  it.each(pricakovano)("%s je %s", (d, dan) => expect(dayShort(d)).toBe(dan));
  it("vsak turnir v podatkih ima pravilen dan", () => {
    for (const t of C.turnirji.turnirji) {
      const p = pricakovano.find(([d]) => d === t.datum);
      expect(p, t.id).toBeDefined();
    }
  });
  it("konec obdobja 29. 1. 2027 je petek, pouk 4. 1. 2027 je ponedeljek", () => {
    expect(weekday("2027-01-29")).toBe(5);
    expect(weekday("2027-01-04")).toBe(1);
  });
});

describe("pomožne funkcije za datume", () => {
  it("addDays in diffDays čez mejo meseca in leta", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-12-28", "2027-01-04")).toBe(7);
    expect(addDays("2027-03-27", 2)).toBe("2027-03-29"); // prehod na poletni čas
  });
  it("ISO teden", () => {
    expect(isoWeek("2026-12-28")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
  });
  it("današnji datum v Ljubljani, ne v UTC", () => {
    // 23:30 UTC 31. 12. je v Ljubljani že 1. 1.
    expect(todayInLjubljana(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // poleti +2 h
    expect(todayInLjubljana(new Date("2027-06-30T22:30:00Z"))).toBe("2027-07-01");
  });
});

describe("blok 1 = predmet z najbližjim ocenjevanjem", () => {
  it("pon 7. 12. 2026 → SLJ, karate, kata SLJ MAT DRU (kriterij 1)", () => {
    const p = planForDay("2026-12-07", C);
    expect(p.fokus?.predmet).toBe("SLJ");
    expect(p.fokus?.datum).toBe("2026-12-10");
    expect(p.opomniki.map((o) => o.id)).toContain("karate");
    expect(p.kata).toEqual(["SLJ", "MAT", "DRU"]);
    expect(p.bloki).toBe(1);
  });
  it("tor 8. 12. 2026 → 3 bloki in zgodaj spat (kriterij 2)", () => {
    const p = planForDay("2026-12-08", C);
    expect(p.predTestom).toBe(true);
    expect(p.bloki).toBe(3);
    expect(p.opomniki.map((o) => o.id)).toContain("spanje");
  });
  it("pet 11. 12. 2026 → MAT (kriterij 3)", () => {
    const p = planForDay("2026-12-11", C);
    expect(p.fokus?.predmet).toBe("MAT");
    expect(p.fokus?.datum).toBe("2026-12-14");
    expect(p.ponovitevTedna).toBe(15);
  });
  it("pon 28. 12. → počitniški plan, pet 25. 12. → samo uživaj (kriterij 4)", () => {
    const a = planForDay("2026-12-28", C);
    expect(a.tip).toBe("pocitnice-plan");
    expect(a.pocitnice?.naloge?.join(" ")).toMatch(/turistični vodnik/);
    expect(a.pocitnice?.naloge?.join(" ")).toMatch(/angleških/);
    const b = planForDay("2026-12-25", C);
    expect(b.tip).toBe("pocitnice-prosto");
    expect(b.pocitnice?.besedilo).toBe("Uživaj počitnice!");
    expect(b.bloki).toBe(0);
  });
  it("tor 19. 1. 2027 → po testu DRU je blok 1 MAT geometrija (kriterij 5)", () => {
    const p = planForDay("2027-01-19", C);
    expect(p.fokus?.id).toBe("mat-2027-01-20");
    expect(p.fokus?.vrsta).toMatch(/geometrijska/);
  });
  it("test na današnji dan ne šteje več", () => {
    expect(nearestTournament("2026-12-10", C)?.id).toBe("mat-2026-12-14");
    expect(nearestTournament("2026-12-09", C)?.id).toBe("slj-2026-12-10");
  });
  it("po zadnjem turnirju ni fokusa", () => {
    expect(nearestTournament("2027-01-20", C)).toBeUndefined();
  });
});

describe("dnevni ritem", () => {
  it("sreda: en blok in opozorilo najdaljši dan, karate", () => {
    const p = planForDay("2026-12-09", C);
    expect(p.bloki).toBe(1);
    expect(p.opomniki.map((o) => o.id)).toEqual(expect.arrayContaining(["sreda", "karate"]));
  });
  it("ponedeljek pred testom v torek ali sredo: 2 bloka", () => {
    expect(planForDay("2027-01-18", C).bloki).toBe(2); // DRU tor 19. 1.
  });
  it("četrtek brez testa v 2 dneh: 2 bloka", () => {
    expect(planForDay("2026-11-19", C).bloki).toBe(2);
  });
  it("sobota: blok samo, če je test v pon ali tor", () => {
    expect(planForDay("2026-12-12", C).bloki).toBe(1); // MAT pon 14. 12.
    expect(planForDay("2027-01-16", C).bloki).toBe(1); // DRU tor 19. 1.
    expect(planForDay("2026-12-05", C).bloki).toBe(0);
  });
  it("nedelja: pogovor z mamo in prometni znaki", () => {
    const p = planForDay("2026-12-13", C);
    expect(p.tip).toBe("nedelja");
    expect(p.prometniZnaki).toBe(true);
    expect(signsForWeek("2026-12-13", C)).toHaveLength(5);
  });
  it("torek pred počitnicami nima opomnika za dodatni pouk", () => {
    // tor 22. 12. → sreda 23. 12. je še pouk, opomnik ostane
    expect(planForDay("2026-12-22", C).opomniki.map((o) => o.id)).toContain("spanje");
  });
  it("pred testom: jutri ali pojutrišnjem", () => {
    expect(isBeforeTest("2026-12-07", C)).toBe(false); // 3 dni
    expect(isBeforeTest("2026-12-08", C)).toBe(true);
    expect(isBeforeTest("2026-12-09", C)).toBe(true);
  });
});

describe("pravilo 5·3·1 in barve odštevanja", () => {
  it("5, 3 in 1 dan pred SLJ 10. 12.", () => {
    expect(rule531("2026-12-05", C).find((r) => r.turnir.id === "slj-2026-12-10")?.korak).toBe(5);
    expect(rule531("2026-12-07", C).find((r) => r.turnir.id === "slj-2026-12-10")?.korak).toBe(3);
    expect(rule531("2026-12-09", C).find((r) => r.turnir.id === "slj-2026-12-10")?.korak).toBe(1);
    expect(rule531("2026-12-01", C).find((r) => r.turnir.id === "slj-2026-12-10")).toBeUndefined();
  });
  it("barve", () => {
    expect(countdownColor(8)).toBe("zelena");
    expect(countdownColor(7)).toBe("rumena");
    expect(countdownColor(3)).toBe("rumena");
    expect(countdownColor(2)).toBe("rdeca");
  });
});

describe("drugo polletje in kviz", () => {
  it("DRU → NIT od 1. 2. 2027", () => {
    expect(subjectOn("DRU", "2027-01-29", C)).toBe("DRU");
    expect(subjectOn("DRU", "2027-02-01", C)).toBe("NIT");
    expect(planForDay("2027-02-01", C).kata).toEqual(["SLJ", "MAT", "NIT"]);
  });
  it("tema kviza po najbližjem turnirju", () => {
    expect(pickQuizSet("2026-12-01", C)).toBe("slj");
    expect(pickQuizSet("2026-12-11", C)).toBe("dru-pokrajine"); // MAT nima kviza
    expect(pickQuizSet("2027-01-05", C)).toBe("tja");
  });
  it("SLJ kviz ima vsaj 30 vprašanj", () => {
    expect(C.kviz.slj.vprasanja.length).toBeGreaterThanOrEqual(30);
    expect(C.kviz.tja.vprasanja.length).toBeGreaterThanOrEqual(30);
  });
});
