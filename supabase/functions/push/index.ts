// Edge funkcija »push«: pokliče jo pg_cron vsakih 5 minut.
// Pogleda, ali je čas za Adamov opomnik ali mamin večerni opomnik, in pošlje
// spletno potisno obvestilo. Vsako obvestilo gre največ enkrat na dan (push_log).
// Brez zunanjih knjižnic: šifriranje (RFC 8291) in podpis VAPID (RFC 8292) z vgrajenim WebCrypto.
// Ključa VAPID ustvari funkcija sama ob prvem zagonu in ju hrani v bazi.
import {
  adamMessage, DEFAULT_OBVESTILA, ljubljanaNow, mamaMessage,
  type Message, type Obvestila, type Pocitnice, type TurnirMin,
} from "./logic.ts";

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
