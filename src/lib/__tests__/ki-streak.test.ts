import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT as C } from "../content";
import { balances, beltFor } from "../ki";
import { streak } from "../streak";
import type { DojoEvent, Redemption } from "../types";

const ev = (ki: number, status: DojoEvent["status"]): DojoEvent => ({
  id: Math.random().toString(), family_id: "f", vrsta: "trening", predmet: "", ref: "", opis: "",
  dan: "2026-12-01", ki, status, komentar: "", created_at: "",
});

describe("Ki in pasovi", () => {
  it("čakajoče ne štejejo za nagrade, unovčenje ne zniža pasu", () => {
    const r: Redemption[] = [{ id: "r", family_id: "f", reward_id: "x", label: "", cost: 10, created_at: "" }];
    const b = balances([ev(1, "confirmed"), ev(30, "confirmed"), ev(5, "pending"), ev(3, "rejected")], r);
    expect(b).toEqual({ potrjeneSkupaj: 31, cakajoce: 5, porabljene: 10, zaNagrade: 21 });
    expect(beltFor(b.potrjeneSkupaj, C.ki.pasovi).pas.ime).toBe("rumeni");
  });
  it("meje pasov", () => {
    expect(beltFor(0, C.ki.pasovi).pas.ime).toBe("beli");
    expect(beltFor(259, C.ki.pasovi).pas.ime).toBe("rjavi");
    expect(beltFor(260, C.ki.pasovi).pas.ime).toBe("črni");
    expect(beltFor(260, C.ki.pasovi).naslednji).toBeUndefined();
    expect(beltFor(30, C.ki.pasovi).doNaslednjega).toBe(30);
  });
});

describe("niz dni", () => {
  const S = (...d: string[]) => new Set(d);
  it("petek, sobota, nedelja niza ne prekinejo", () => {
    // čet 10. 12. trening, pon 14. 12. trening
    expect(streak(S("2026-12-10", "2026-12-14"), "2026-12-14")).toBe(2);
  });
  it("en zamujen delovni dan na teden je prost dan", () => {
    // pon, sre, čet treningi, tor manjka
    expect(streak(S("2026-12-07", "2026-12-09", "2026-12-10"), "2026-12-10")).toBe(3);
  });
  it("dva zamujena delovna dneva v istem tednu prekineta niz", () => {
    expect(streak(S("2026-12-07", "2026-12-10"), "2026-12-10")).toBe(1);
  });
  it("današnji še neopravljen dan ne prekine niza", () => {
    expect(streak(S("2026-12-07", "2026-12-08"), "2026-12-09")).toBe(2);
  });
  it("počitnice ne prekinejo niza", () => {
    const hol = (d: string) => d >= "2026-12-24" && d <= "2027-01-03";
    expect(streak(S("2026-12-23", "2027-01-04"), "2027-01-04", hol)).toBe(2);
  });
});
