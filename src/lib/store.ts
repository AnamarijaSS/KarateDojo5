"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_KEYS, DEFAULT_CONTENT, mergeContent } from "./content";
import { todayInLjubljana, type ISODate } from "./dates";
import { idbClear, idbGet, idbSet, ls } from "./idb";
import type {
  ChecklistRow, Content, ContentKey, DojoEvent, Feedback, Member, Mistake, Redemption, Vrsta,
} from "./types";

// ---------------------------------------------------------------- stanje

export interface Family { id: string; child_name: string }

export type Op =
  | { opId: string; kind: "event"; row: Omit<DojoEvent, "ki" | "status" | "komentar" | "created_at"> & { created_at: string } }
  | { opId: string; kind: "checklist"; row: ChecklistRow }
  | { opId: string; kind: "mistake"; row: Mistake }
  | { opId: string; kind: "mistake_fix"; id: string; fixed_at: string }
  | { opId: string; kind: "feedback"; row: Feedback };

export interface DojoState {
  ready: boolean;
  configured: boolean;
  userId: string | null;
  me: Member | null;
  family: Family | null;
  content: Content;
  events: DojoEvent[];
  checklist: ChecklistRow[];
  mistakes: Mistake[];
  feedback: Feedback[];
  redemptions: Redemption[];
  members: Member[];
  outbox: Op[];
  online: boolean;
  lastSync: number | null;
  error: string | null;
}

const SNAPSHOT_KEY = "snapshot-v1";
const OUTBOX_KEY = "outbox-v1";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let state: DojoState = {
  ready: false,
  configured: !!(URL_ && KEY_),
  userId: null,
  me: null,
  family: null,
  content: DEFAULT_CONTENT,
  events: [],
  checklist: [],
  mistakes: [],
  feedback: [],
  redemptions: [],
  members: [],
  outbox: [],
  online: true,
  lastSync: null,
  error: null,
};

const listeners = new Set<() => void>();
function set(patch: Partial<DojoState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getState() {
  return state;
}

let sb: SupabaseClient | null = null;
export function client(): SupabaseClient {
  if (!sb) {
    sb = createClient(URL_, KEY_, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "adamov-dojo-auth" },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return sb;
}

export function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // starejši brskalniki
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
    );
  }
}

/** Pravi današnji dan v Ljubljani (za zapise na strežniku). */
export function realToday(): ISODate {
  return todayInLjubljana();
}

// ---------------------------------------------------------------- zagon

let started = false;
let channel: RealtimeChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function start() {
  if (started) return;
  started = true;
  if (!state.configured) {
    set({ ready: true });
    return;
  }
  // 1. lokalni posnetek (deluje brez povezave)
  const snap = await idbGet<Partial<DojoState>>(SNAPSHOT_KEY);
  const outbox = (await idbGet<Op[]>(OUTBOX_KEY)) ?? [];
  if (snap) {
    set({
      me: snap.me ?? null, family: snap.family ?? null, userId: snap.userId ?? null,
      content: mergeContent((snap.content as unknown as Record<string, unknown>) ?? {}),
      events: snap.events ?? [], checklist: snap.checklist ?? [], mistakes: snap.mistakes ?? [],
      feedback: snap.feedback ?? [], redemptions: snap.redemptions ?? [], members: snap.members ?? [],
      lastSync: snap.lastSync ?? null,
    });
  }
  set({ outbox, online: typeof navigator === "undefined" ? true : navigator.onLine });

  // 2. seja
  try {
    const { data } = await client().auth.getSession();
    const uid = data.session?.user.id ?? null;
    set({ userId: uid });
    if (!uid) {
      set({ me: null, family: null });
    }
  } catch {
    /* brez povezave: ostane posnetek */
  }
  set({ ready: true });

  window.addEventListener("online", () => { set({ online: true }); void syncNow(); });
  window.addEventListener("offline", () => set({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") void syncNow();
  }, 30_000);

  if (state.userId) await syncNow();
}

function saveSnapshot() {
  const { me, family, userId, content, events, checklist, mistakes, feedback, redemptions, members, lastSync } = state;
  void idbSet(SNAPSHOT_KEY, { me, family, userId, content, events, checklist, mistakes, feedback, redemptions, members, lastSync });
}
function saveOutbox() {
  void idbSet(OUTBOX_KEY, state.outbox);
}

// ---------------------------------------------------------------- sinhronizacija

let syncing: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (!state.configured || !state.userId) return Promise.resolve();
  if (syncing) { again = true; return syncing; }
  syncing = (async () => {
    try {
      do {
        again = false;
        await flushOutbox();
        await pull();
      } while (again);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e);
  return /fetch|network|Load failed|Failed to fetch|timeout|NetworkError/i.test(msg);
}

async function flushOutbox() {
  const c = client();
  while (state.outbox.length > 0) {
    const op = state.outbox[0];
    let error: { code?: string; message: string } | null = null;
    try {
      if (op.kind === "event") {
        ({ error } = await c.from("events").upsert(op.row, { onConflict: "id", ignoreDuplicates: true }));
      } else if (op.kind === "checklist") {
        const { family_id, turnir_id, item_id, done, vnos } = op.row;
        ({ error } = await c.from("checklist").upsert({ family_id, turnir_id, item_id, done, vnos, updated_at: new Date().toISOString() }, { onConflict: "family_id,turnir_id,item_id" }));
      } else if (op.kind === "mistake") {
        const { id, family_id, vprasanje, odgovor, vir } = op.row;
        ({ error } = await c.from("mistakes").upsert({ id, family_id, vprasanje, odgovor, vir }, { onConflict: "id", ignoreDuplicates: true }));
      } else if (op.kind === "mistake_fix") {
        ({ error } = await c.from("mistakes").update({ fixed_at: op.fixed_at }).eq("id", op.id));
      } else if (op.kind === "feedback") {
        const { family_id, turnir_id, mood } = op.row;
        ({ error } = await c.from("feedback").upsert({ family_id, turnir_id, mood }, { onConflict: "family_id,turnir_id", ignoreDuplicates: true }));
      }
    } catch (e) {
      if (isNetworkError(e)) { set({ online: false }); return; }
      error = { message: String(e) };
    }
    if (error) {
      if (isNetworkError(error)) { set({ online: false }); return; }
      // 23505 = že obstaja (npr. bonus za isti turnir): to ni napaka, samo zavržemo.
      if (error.code !== "23505") set({ error: "Nekaj ni šlo skozi: " + error.message });
    }
    set({ outbox: state.outbox.slice(1), online: true });
    saveOutbox();
  }
}

async function pull() {
  const c = client();
  try {
    const uid = state.userId!;
    const { data: me, error: meErr } = await c.from("members").select("*").eq("user_id", uid).maybeSingle();
    if (meErr) throw meErr;
    if (!me) {
      // naprava ni (več) povezana, npr. mama jo je odstranila
      set({ me: null, family: null, events: [], checklist: [], mistakes: [], feedback: [], redemptions: [], members: [], online: true });
      saveSnapshot();
      teardownRealtime();
      return;
    }
    const f = me.family_id as string;
    const [fam, content, events, checklist, mistakes, feedback, redemptions, members] = await Promise.all([
      c.from("families").select("id, child_name").eq("id", f).single(),
      c.from("content").select("key, value").eq("family_id", f),
      c.from("events").select("*").eq("family_id", f).order("created_at", { ascending: true }),
      c.from("checklist").select("*").eq("family_id", f),
      c.from("mistakes").select("*").eq("family_id", f).order("created_at", { ascending: true }),
      c.from("feedback").select("*").eq("family_id", f),
      c.from("redemptions").select("*").eq("family_id", f).order("created_at", { ascending: true }),
      c.from("members").select("*").eq("family_id", f).order("created_at", { ascending: true }),
    ]);
    const firstErr = [fam, content, events, checklist, mistakes, feedback, redemptions, members].find((r) => r.error)?.error;
    if (firstErr) throw firstErr;
    const stored: Record<string, unknown> = {};
    for (const row of (content.data ?? []) as { key: string; value: unknown }[]) stored[row.key] = row.value;
    set({
      me: me as Member,
      family: fam.data as Family,
      content: mergeContent(stored),
      events: (events.data ?? []) as DojoEvent[],
      checklist: (checklist.data ?? []) as ChecklistRow[],
      mistakes: (mistakes.data ?? []) as Mistake[],
      feedback: (feedback.data ?? []) as Feedback[],
      redemptions: (redemptions.data ?? []) as Redemption[],
      members: (members.data ?? []) as Member[],
      online: true,
      lastSync: Date.now(),
    });
    saveSnapshot();
    setupRealtime(f);
  } catch (e) {
    if (isNetworkError(e)) set({ online: false });
    else set({ error: "Napaka pri osveževanju: " + String((e as { message?: string })?.message ?? e) });
  }
}

let rtTimer: ReturnType<typeof setTimeout> | null = null;
function setupRealtime(familyId: string) {
  if (channel) return;
  const c = client();
  const onChange = () => {
    if (rtTimer) clearTimeout(rtTimer);
    rtTimer = setTimeout(() => void syncNow(), 400);
  };
  let ch = c.channel(`family-${familyId}`);
  for (const table of ["events", "content", "checklist", "mistakes", "feedback", "redemptions", "members"]) {
    ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `family_id=eq.${familyId}` }, onChange);
  }
  channel = ch.subscribe();
}
function teardownRealtime() {
  if (channel) { void client().removeChannel(channel); channel = null; }
}

// ---------------------------------------------------------------- pogled z lokalnimi spremembami

/** Dogodki s strežnika + tisti, ki še čakajo v vrsti (prikazani kot čakajoči). */
export function eventsWithLocal(s: DojoState): DojoEvent[] {
  const known = new Set(s.events.map((e) => e.id));
  const local: DojoEvent[] = [];
  for (const op of s.outbox) {
    if (op.kind === "event" && !known.has(op.row.id)) {
      const ki = s.content.ki.dejanja[op.row.vrsta]?.ki ?? 0;
      local.push({ ...op.row, ki, status: "pending", komentar: "", local: true });
    }
  }
  return [...s.events, ...local];
}

export function checklistWithLocal(s: DojoState): ChecklistRow[] {
  const map = new Map(s.checklist.map((r) => [`${r.turnir_id}/${r.item_id}`, r]));
  for (const op of s.outbox) if (op.kind === "checklist") map.set(`${op.row.turnir_id}/${op.row.item_id}`, op.row);
  return [...map.values()];
}

export function mistakesWithLocal(s: DojoState): Mistake[] {
  const map = new Map(s.mistakes.map((m) => [m.id, m]));
  for (const op of s.outbox) {
    if (op.kind === "mistake" && !map.has(op.row.id)) map.set(op.row.id, op.row);
    if (op.kind === "mistake_fix") {
      const m = map.get(op.id);
      if (m) map.set(op.id, { ...m, fixed_at: op.fixed_at });
    }
  }
  return [...map.values()];
}

export function feedbackWithLocal(s: DojoState): Feedback[] {
  const map = new Map(s.feedback.map((f) => [f.turnir_id, f]));
  for (const op of s.outbox) if (op.kind === "feedback" && !map.has(op.row.turnir_id)) map.set(op.row.turnir_id, op.row);
  return [...map.values()];
}

// ---------------------------------------------------------------- dejanja (delujejo brez povezave)

function enqueue(op: Op) {
  set({ outbox: [...state.outbox, op] });
  saveOutbox();
  void syncNow();
}

export function addEvent(vrsta: Vrsta, opts: { predmet?: string; ref?: string; opis?: string } = {}) {
  const f = state.family?.id;
  if (!f) return;
  // lokalna zaščita pred dvojnim klikom za enkratne bonuse
  if (opts.ref) {
    const dup = eventsWithLocal(state).some((e) => e.vrsta === vrsta && e.ref === opts.ref && e.status !== "rejected");
    if (dup) return;
  }
  enqueue({
    opId: uuid(),
    kind: "event",
    row: {
      id: uuid(), family_id: f, vrsta, predmet: opts.predmet ?? "", ref: opts.ref ?? "", opis: opts.opis ?? "",
      dan: realToday(), created_at: new Date().toISOString(),
    },
  });
}

export function setChecklist(turnir_id: string, item_id: string, done: boolean, vnos: string) {
  const f = state.family?.id;
  if (!f) return;
  enqueue({ opId: uuid(), kind: "checklist", row: { family_id: f, turnir_id, item_id, done, vnos } });
}

export function addMistake(vprasanje: string, odgovor: string, vir: string) {
  const f = state.family?.id;
  if (!f) return;
  const open = mistakesWithLocal(state).some((m) => !m.fixed_at && m.vprasanje === vprasanje);
  if (open) return;
  enqueue({ opId: uuid(), kind: "mistake", row: { id: uuid(), family_id: f, vprasanje, odgovor, vir, fixed_at: null, created_at: new Date().toISOString() } });
}

export function fixMistake(id: string) {
  enqueue({ opId: uuid(), kind: "mistake_fix", id, fixed_at: new Date().toISOString() });
  addEvent("napaka", { ref: id });
}

export function giveFeedback(turnir_id: string, mood: Feedback["mood"]) {
  const f = state.family?.id;
  if (!f) return;
  enqueue({ opId: uuid(), kind: "feedback", row: { family_id: f, turnir_id, mood } });
}

// ---------------------------------------------------------------- povezovanje

async function ensureSession(): Promise<string> {
  const c = client();
  const { data } = await c.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: d2, error } = await c.auth.signInAnonymously();
  if (error || !d2.user) throw new Error(error?.message ?? "Prijava ni uspela.");
  return d2.user.id;
}

function rpcError(e: { message?: string } | null): never {
  throw new Error(e?.message ?? "Napaka.");
}

export async function createFamily(pin: string): Promise<void> {
  const uid = await ensureSession();
  set({ userId: uid });
  const c = client();
  const { error } = await c.rpc("create_family", { pin, child_name: "Adam", device_label: "Mamin telefon" });
  if (error) rpcError(error);
  // vnaprej naloži vsebino iz /data
  for (const k of CONTENT_KEYS) {
    const { error: e2 } = await c.rpc("save_content", { k, v: DEFAULT_CONTENT[k] });
    if (e2) rpcError(e2);
  }
  await syncNow();
}

export async function joinFamily(code: string, label: string): Promise<string> {
  const uid = await ensureSession();
  set({ userId: uid });
  const { data, error } = await client().rpc("join_family", { code: code.trim().toUpperCase(), device_label: label });
  if (error) rpcError(error);
  await syncNow();
  return data as string;
}

// ---------------------------------------------------------------- starš (potrebuje povezavo)

export async function createPairingCode(role: "student" | "parent" = "student"): Promise<{ code: string; expires_at: string }> {
  const { data, error } = await client().rpc("create_pairing_code", { for_role: role });
  if (error) rpcError(error);
  return (data as { code: string; expires_at: string }[])[0];
}

export async function decideEvents(ids: string[], status: "confirmed" | "rejected", komentar = "") {
  const { error } = await client().rpc("decide_events", { ids, new_status: status, komentar });
  if (error) rpcError(error);
  await syncNow();
}

export async function saveContent<K extends ContentKey>(k: K, v: Content[K]) {
  const { error } = await client().rpc("save_content", { k, v });
  if (error) rpcError(error);
  set({ content: { ...state.content, [k]: v } });
  await syncNow();
}

export type PinResult = "ok" | "bad" | "locked";

export async function verifyPin(pin: string): Promise<PinResult> {
  const { data, error } = await client().rpc("verify_pin", { pin });
  if (error) rpcError(error);
  return data as PinResult;
}

export async function changePin(oldPin: string, newPin: string): Promise<PinResult> {
  const { data, error } = await client().rpc("change_pin", { old_pin: oldPin, new_pin: newPin });
  if (error) rpcError(error);
  return data as PinResult;
}

export async function redeemReward(rewardId: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await client().rpc("redeem_reward", { reward_id: rewardId, pin });
  if (error) rpcError(error);
  await syncNow();
  return data as { ok: boolean; error?: string };
}

export async function removeMember(userId: string) {
  const { error } = await client().rpc("remove_member", { target: userId });
  if (error) rpcError(error);
  await syncNow();
}

export async function deleteMistake(id: string) {
  const { error } = await client().rpc("delete_mistake", { mid: id });
  if (error) rpcError(error);
  await syncNow();
}

export function exportBackup(): string {
  const s = state;
  return JSON.stringify({
    app: "adamov-dojo", verzija: 1, izvozeno: new Date().toISOString(),
    content: CONTENT_KEYS.map((key) => ({ key, value: s.content[key] })),
    events: s.events, checklist: s.checklist, mistakes: s.mistakes, feedback: s.feedback, redemptions: s.redemptions,
  }, null, 2);
}

export async function importBackup(json: string) {
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error("Datoteka ni veljaven JSON."); }
  if (!data || typeof data !== "object" || (data as { app?: string }).app !== "adamov-dojo") {
    throw new Error("To ni varnostna kopija Adamovega doja.");
  }
  const { error } = await client().rpc("import_backup", { data });
  if (error) rpcError(error);
  await syncNow();
}

export function clearError() {
  set({ error: null });
}

/** Za odjavo ali ko je naprava odstranjena */
export async function resetDevice() {
  teardownRealtime();
  if (pollTimer) clearInterval(pollTimer);
  try { await client().auth.signOut(); } catch { /* ignoriraj */ }
  await idbClear();
  ls.del("adamov-dojo-auth");
  location.reload();
}
