// Integracijski test pravic: teče proti lokalnemu Supabase (npx supabase start).
// Preveri, da Adamova seja z neposrednimi klici API ne more potrditi točk,
// unovčiti nagrade, urejati vsebine ali brati druge družine.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_TEST_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date());

let mama: SupabaseClient, adam: SupabaseClient, tujec: SupabaseClient, anon: SupabaseClient;
let familyId = "";
let adamId = "";
const PIN = "4826";

async function reachable() {
  try { await fetch(URL + "/auth/v1/health"); return true; } catch { return false; }
}

describe.runIf(await reachable())("pravice na strežniku (RLS)", () => {
  beforeAll(async () => {
    mama = mk(); adam = mk(); tujec = mk(); anon = mk();
    await mama.auth.signInAnonymously();
    const { data: f, error } = await mama.rpc("create_family", { pin: PIN, child_name: "Adam", device_label: "Mama" });
    expect(error).toBeNull();
    familyId = f as string;
    await mama.rpc("save_content", { k: "ki", v: { dejanja: {}, pasovi: [], nagrade: [{ id: "roblox30", ime: "30 minut Robloxa", cena: 10 }] } });
    const { data: code } = await mama.rpc("create_pairing_code", { for_role: "student" });
    const { data: a } = await adam.auth.signInAnonymously();
    adamId = a.user!.id;
    const { data: role, error: je } = await adam.rpc("join_family", { code: (code as { code: string }[])[0].code, device_label: "Adam" });
    expect(je).toBeNull();
    expect(role).toBe("student");
    await tujec.auth.signInAnonymously();
    await tujec.rpc("create_family", { pin: "1111", child_name: "Drug", device_label: "x" });
  });

  it("Adam doda čakajoč trening; strežnik sam določi Ki in status", async () => {
    const id = randomUUID();
    const { error } = await adam.from("events").insert({ id, family_id: familyId, vrsta: "trening", dan: today, ki: 500, status: "pending" });
    expect(error).toBeNull();
    const { data } = await adam.from("events").select("ki, status").eq("id", id).single();
    expect(data).toEqual({ ki: 1, status: "pending" });
  });

  it("Adam ne more vstaviti že potrjenega dogodka (strežnik ga spremeni v čakajočega)", async () => {
    const id = randomUUID();
    await adam.from("events").insert({ id, family_id: familyId, vrsta: "trening", dan: today, status: "confirmed", decided_at: new Date().toISOString() });
    const { data } = await adam.from("events").select("status, decided_at").eq("id", id).single();
    expect(data).toEqual({ status: "pending", decided_at: null });
  });

  it("Adam ne more potrditi točk prek RPC", async () => {
    const { data: ev } = await adam.from("events").select("id").eq("status", "pending");
    const { error } = await adam.rpc("decide_events", { ids: ev!.map((e) => e.id), new_status: "confirmed", komentar: "" });
    expect(error?.code).toBe("42501");
    const { data } = await adam.from("events").select("status").eq("status", "confirmed");
    expect(data).toHaveLength(0);
  });

  it("Adam ne more neposredno spremeniti statusa ali Ki", async () => {
    const { data: ev } = await adam.from("events").select("id").limit(1).single();
    const { data, error } = await adam.from("events").update({ status: "confirmed", ki: 99 }).eq("id", ev!.id).select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const { data: after } = await adam.from("events").select("status, ki").eq("id", ev!.id).single();
    expect(after).toEqual({ status: "pending", ki: 1 });
  });

  it("Adam ne more unovčiti nagrade, niti s pravim PIN-om", async () => {
    // mama potrdi 12 Ki, da je dovolj za nagrado
    const ids = [];
    for (let i = 0; i < 12; i++) {
      const id = randomUUID(); ids.push(id);
      await adam.from("events").insert({ id, family_id: familyId, vrsta: "trening", dan: today });
    }
    const { error: de } = await mama.rpc("decide_events", { ids, new_status: "confirmed", komentar: "" });
    expect(de).toBeNull();
    const r1 = await adam.rpc("redeem_reward", { reward_id: "roblox30", pin: PIN });
    expect(r1.error?.code).toBe("42501");
    const r2 = await adam.from("redemptions").insert({ family_id: familyId, reward_id: "roblox30", label: "x", cost: 1, created_by: adamId });
    expect(r2.error).not.toBeNull();
    const { data } = await mama.from("redemptions").select("id");
    expect(data).toHaveLength(0);
  });

  it("Adam ne more ugibati PIN-a (verify_pin je samo za starša)", async () => {
    const { error } = await adam.rpc("verify_pin", { pin: PIN });
    expect(error?.code).toBe("42501");
  });

  it("Adam ne vidi zgoščenega PIN-a", async () => {
    const { error } = await adam.from("families").select("pin_hash");
    expect(error).not.toBeNull();
  });

  it("Adam ne more urejati vsebine, ustvarjati kod ali odstranjevati naprav", async () => {
    expect((await adam.rpc("save_content", { k: "ki", v: { nagrade: [{ id: "roblox30", ime: "x", cena: 1 }] } })).error?.code).toBe("42501");
    const up = await adam.from("content").update({ value: {} }).eq("family_id", familyId).select();
    expect(up.error !== null || (up.data ?? []).length === 0).toBe(true);
    expect((await adam.rpc("create_pairing_code", { for_role: "parent" })).error?.code).toBe("42501");
    const { data: m } = await mama.auth.getUser();
    expect((await adam.rpc("remove_member", { target: m.user!.id })).error?.code).toBe("42501");
    expect((await adam.rpc("import_backup", { data: { app: "adamov-dojo", events: [] } })).error?.code).toBe("42501");
    const mem = await adam.from("members").update({ role: "parent" }).eq("user_id", adamId).select();
    expect(mem.error !== null || (mem.data ?? []).length === 0).toBe(true);
    const { data: me } = await adam.from("members").select("role").eq("user_id", adamId).single();
    expect(me!.role).toBe("student");
  });

  it("Adam se ne more še enkrat pridružiti kot starš", async () => {
    const { data: code } = await mama.rpc("create_pairing_code", { for_role: "parent" });
    const { error } = await adam.rpc("join_family", { code: (code as { code: string }[])[0].code, device_label: "x" });
    expect(error?.code).toBe("42501");
  });

  it("bonus za isti turnir se ne podvoji", async () => {
    const a = await adam.from("events").insert({ id: randomUUID(), family_id: familyId, vrsta: "turnir_seznam", ref: "slj-2026-12-10", dan: today });
    const b = await adam.from("events").insert({ id: randomUUID(), family_id: familyId, vrsta: "turnir_seznam", ref: "slj-2026-12-10", dan: today });
    expect(a.error).toBeNull();
    expect(b.error?.code).toBe("23505");
  });

  it("isti dogodek, poslan dvakrat (ponovni poskus brez povezave), se zapiše enkrat", async () => {
    const id = randomUUID();
    const row = { id, family_id: familyId, vrsta: "branje", dan: today };
    expect((await adam.from("events").upsert(row, { onConflict: "id", ignoreDuplicates: true })).error).toBeNull();
    expect((await adam.from("events").upsert(row, { onConflict: "id", ignoreDuplicates: true })).error).toBeNull();
    const { data } = await adam.from("events").select("id").eq("id", id);
    expect(data).toHaveLength(1);
  });

  it("tuja družina ne vidi in ne piše Adamovih podatkov", async () => {
    expect((await tujec.from("events").select("id").eq("family_id", familyId)).data).toHaveLength(0);
    expect((await tujec.from("content").select("key").eq("family_id", familyId)).data).toHaveLength(0);
    const ins = await tujec.from("events").insert({ id: randomUUID(), family_id: familyId, vrsta: "trening", dan: today });
    expect(ins.error).not.toBeNull();
    const { data: ev } = await mama.from("events").select("id").eq("status", "pending").limit(1);
    const d = await tujec.rpc("decide_events", { ids: [ev![0].id], new_status: "confirmed", komentar: "" });
    expect(d.data ?? 0).toBe(0);
  });

  it("brez prijave ni dostopa", async () => {
    expect((await anon.from("events").select("id")).data ?? []).toHaveLength(0);
    expect((await anon.rpc("create_pairing_code", { for_role: "student" })).error).not.toBeNull();
  });

  it("mama potrdi in unovči; napačen PIN se omeji po 5 poskusih", async () => {
    const ok = await mama.rpc("redeem_reward", { reward_id: "roblox30", pin: PIN });
    expect(ok.data).toMatchObject({ ok: true });
    const low = await mama.rpc("redeem_reward", { reward_id: "roblox30", pin: PIN });
    expect(low.data).toMatchObject({ ok: false, error: "balance" });
    for (let i = 0; i < 5; i++) expect((await mama.rpc("verify_pin", { pin: "0000" })).data).toBe("bad");
    expect((await mama.rpc("verify_pin", { pin: PIN })).data).toBe("locked");
  });
});
