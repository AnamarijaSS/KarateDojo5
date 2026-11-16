// SAMODEJNO USTVARJENO z scripts/produkcija.mjs. Ne urejaj ročno.
// Edge funkcija »push«: pokliče jo pg_cron vsakih 5 minut.
// Pogleda, ali je čas za Adamov opomnik ali mamin večerni opomnik, in pošlje
// spletno potisno obvestilo. Vsako obvestilo gre največ enkrat na dan (push_log).
// Brez zunanjih knjižnic: šifriranje (RFC 8291) in podpis VAPID (RFC 8292) z vgrajenim WebCrypto.
// Ključa VAPID ustvari funkcija sama ob prvem zagonu in ju hrani v bazi.
// ---- logic.ts (vstavljeno) ----
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

// ---- konec logic.ts ----

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const SUBJECT = Deno.env.get("PUSH_SUBJECT") ?? "https://adamov-dojo.vercel.app";

// ---------------------------------------------------------------- baza prek REST (vloga service_role)

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", SB_KEY);
  if (SB_KEY.startsWith("eyJ")) headers.set("Authorization", `Bearer ${SB_KEY}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers });
}
async function rows<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const r = await rest(path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return await r.json();
}
async function setting(key: string): Promise<string | null> {
  const r = await rows<{ value: string }>(`app_settings?select=value&key=eq.${encodeURIComponent(key)}`);
  return r[0]?.value ?? null;
}

// ---------------------------------------------------------------- base64url

const enc = new TextEncoder();
function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------------------------------------------------------------- VAPID

interface Vapid { publicKey: string; privateJwk: JsonWebKey }

async function vapidKeys(): Promise<Vapid> {
  let pub = await setting("vapid_public");
  let priv = await setting("vapid_private");
  if (!pub || !priv) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    // ignore-duplicates: če sta dva klica hkrati, obvelja prvi par
    await rest("app_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([{ key: "vapid_public", value: b64u(rawPub) }, { key: "vapid_private", value: JSON.stringify(jwk) }]),
    });
    pub = await setting("vapid_public");
    priv = await setting("vapid_private");
  }
  return { publicKey: pub!, privateJwk: JSON.parse(priv!) };
}

async function vapidHeader(endpoint: string, v: Vapid): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const key = await crypto.subtle.importKey("jwk", v.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${v.publicKey}`;
}

// ---------------------------------------------------------------- šifriranje aes128gcm (RFC 8291)

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

async function encrypt(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPub = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = zadnji zapis
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

interface Sub { endpoint: string; user_id: string; p256dh: string; auth: string }

async function send(sub: Sub, msg: Message, v: Vapid): Promise<number> {
  const body = await encrypt(JSON.stringify({ title: msg.title, body: msg.body, url: "/" }), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, v),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "high",
    },
    body,
  });
  await r.body?.cancel();
  return r.status;
}

// ---------------------------------------------------------------- glavna zanka

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const secret = await setting("cron_secret");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

  let input: { now?: string } = {};
  try { input = await req.json(); } catch { /* prazno telo */ }
  const now = ljubljanaNow(input.now ? new Date(input.now) : new Date());
  const v = await vapidKeys();

  const report: Record<string, unknown>[] = [];
  for (const fam of await rows<{ id: string }>("families?select=id")) {
    const f = fam.id;
    const [content, members, subs, pending] = await Promise.all([
      rows<{ key: string; value: Record<string, unknown> }>(`content?select=key,value&family_id=eq.${f}&key=in.(obvestila,pocitnice,turnirji)`),
      rows<{ user_id: string; role: string }>(`members?select=user_id,role&family_id=eq.${f}`),
      rows<Sub>(`push_subscriptions?select=endpoint,user_id,p256dh,auth&family_id=eq.${f}`),
      rows<{ ki: number }>(`events?select=ki&family_id=eq.${f}&status=eq.pending`),
    ]);
    const c = Object.fromEntries(content.map((r) => [r.key, r.value])) as Record<string, any>;
    const obv: Obvestila = { ...DEFAULT_OBVESTILA, ...(c.obvestila ?? {}) };
    const pocitnice: Pocitnice[] = c.pocitnice?.obdobja ?? [];
    const turnirji: TurnirMin[] = c.turnirji?.turnirji ?? [];
    const roleOf = new Map(members.map((m) => [m.user_id, m.role]));

    const msgs: Message[] = [];
    const a = adamMessage(now, obv, pocitnice, turnirji);
    if (a) msgs.push(a);
    const m = mamaMessage(now, obv, pending.length, pending.reduce((s, e) => s + e.ki, 0));
    if (m) msgs.push(m);

    for (const msg of msgs) {
      const role = msg.kind === "adam" ? "student" : "parent";
      // samo naprave, ki so še povezane in imajo pravo vlogo
      const targets = subs.filter((s) => roleOf.get(s.user_id) === role);
      if (targets.length === 0) continue;
      // najprej zapis v dnevnik: če že obstaja (409), je bilo danes že poslano
      const log = await rest("push_log", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ family_id: f, kind: msg.kind, dan: now.date }),
      });
      if (!log.ok) { await log.body?.cancel(); continue; }
      for (const s of targets) {
        try {
          const status = await send(s, msg, v);
          if (status === 404 || status === 410) {
            const d = await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
            await d.body?.cancel();
          }
          report.push({ kind: msg.kind, status });
        } catch (e) {
          report.push({ kind: msg.kind, error: String((e as Error).message ?? e).slice(0, 200) });
        }
      }
    }
  }
  return json({ now, sent: report });
});
