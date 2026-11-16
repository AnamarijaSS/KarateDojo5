// Integracijski preizkus potisnih obvestil proti lokalnemu Supabase z Edge funkcijo.
// Zagon: npx supabase start && npx supabase functions serve --no-verify-jwt &
//        node tests/e2e/obvestila.mjs
// Namesto prave Applove/Googlove storitve uporabi lažen strežnik na tem računalniku,
// ki sprejme obvestilo in ga odšifrira z zasebnim ključem "naprave".
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const API = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const GW = process.env.DOCKER_GW ?? "172.18.0.1";
const PORT = 4555;
const psql = (q) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -tAq -c "${q}"`).toString().trim();
const mk = () => createClient(API, ANON, { auth: { persistSession: false } });
const ok = (n, d = "") => console.log("✔", n, d);

// ---------------------------------------------------------------- lažna storitev za obvestila
const received = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(201).end();
  });
});
await new Promise((r) => server.listen(PORT, "0.0.0.0", r));

// ključi "naprave" (kot jih ustvari brskalnik)
function device(name) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    authSecret: crypto.randomBytes(16),
    endpoint: `http://${GW}:${PORT}/${name}/${crypto.randomUUID()}`,
  };
}
const b64u = (b) => Buffer.from(b).toString("base64url");

// odšifriranje aes128gcm (RFC 8291 + RFC 8188), da preverimo vsebino
function decrypt(dev, body) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const serverPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const shared = dev.ecdh.computeSecret(serverPub);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), dev.ecdh.getPublicKey(), serverPub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, dev.authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (plain[end] === 0) end--; // odstrani polnilo, zadnji bajt je ločilo 0x02
  return JSON.parse(plain.subarray(0, end).toString("utf8"));
}

const fn = (secret, body = {}) =>
  fetch(`${API}/functions/v1/push`, { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "x-cron-secret": secret } : {}) }, body: JSON.stringify(body) });

try {
  // ------------------------------------------------ družina: mama + Adam
  const mama = mk(), adam = mk();
  await mama.auth.signInAnonymously();
  const cf = await mama.rpc("create_family", { pin: "4826", child_name: "Adam", device_label: "Mama" });
  assert.equal(cf.error, null);
  const familyId = cf.data;
  for (const k of ["obvestila", "pocitnice", "turnirji"]) {
    const v = JSON.parse((await import("node:fs")).readFileSync(`data/${k}.json`, "utf8"));
    await mama.rpc("save_content", { k, v });
  }
  const { data: code } = await mama.rpc("create_pairing_code", { for_role: "student" });
  await adam.auth.signInAnonymously();
  await adam.rpc("join_family", { code: code[0].code, device_label: "Adam" });

  // ------------------------------------------------ brez skrivnosti ni dostopa
  assert.equal((await fn(null)).status, 403);
  assert.equal((await fn("napacna")).status, 403);
  ok("funkcija brez prave skrivnosti vrne 403");

  const secret = psql("select value from app_settings where key='cron_secret'");
  assert.match(secret, /^[0-9a-f]{48}$/);
  // Prvi klic ustvari ključa VAPID
  assert.equal((await fn(secret, { now: "2026-11-16T10:00:00Z" })).status, 200);
  const { data: vapid } = await adam.rpc("vapid_public_key");
  assert.match(vapid, /^[A-Za-z0-9_-]{80,90}$/);
  assert.equal((await mk().rpc("vapid_public_key")).data ?? null, null);
  ok("ključa VAPID ustvarjena na strežniku, javni ključ dobi samo povezana naprava");

  // ------------------------------------------------ naročnini
  const dA = device("adam"), dM = device("mama");
  for (const [cli, d] of [[adam, dA], [mama, dM]]) {
    const r = await cli.rpc("save_push_subscription", { endpoint: d.endpoint, p256dh: b64u(d.ecdh.getPublicKey()), auth: b64u(d.authSecret) });
    assert.equal(r.error, null);
    assert.equal((await cli.rpc("has_push_subscription", { endpoint: d.endpoint })).data, true);
  }
  // naprava ne vidi tabele naročnin
  assert.equal(((await adam.from("push_subscriptions").select("*")).data ?? []).length, 0);
  assert.equal(((await adam.from("app_settings").select("*")).data ?? []).length, 0);
  ok("naročnini shranjeni; naprave ne vidijo naročnin ne skrivnosti");

  // ------------------------------------------------ pon 16. 11. 15:31 → Adam
  received.length = 0;
  let r = await (await fn(secret, { now: "2026-11-16T14:31:00Z" })).json();
  await new Promise((s) => setTimeout(s, 300));
  assert.equal(received.length, 1, JSON.stringify(r));
  assert.match(received[0].path, /^\/adam\//);
  assert.equal(received[0].headers["content-encoding"], "aes128gcm");
  assert.match(received[0].headers.authorization, /^vapid t=.+, k=.+/);
  // podpis VAPID (ES256) mora biti veljaven za javni ključ k, kot to preveri Apple
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(received[0].headers.authorization);
  const [h, c, sig] = jwt.split(".");
  const pubRaw = Buffer.from(k, "base64url");
  assert.equal(pubRaw.length, 65);
  assert.equal(k, vapid);
  const pubKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pubRaw.subarray(1, 33)), y: b64u(pubRaw.subarray(33)) }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.aud, `http://${GW}:${PORT}`);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600);
  assert.match(claims.sub, /^https:\/\//);
  ok("podpis VAPID (ES256) je veljaven, aud in exp pravilna");
  const msg = decrypt(dA, received[0].body);
  assert.equal(msg.title, "Čas za trening");
  assert.match(msg.body, /16:30/);
  ok("pon 15:31: Adamov telefon dobi šifrirano obvestilo", `»${msg.title}: ${msg.body}«`);

  // drugi klic isti dan: nič
  received.length = 0;
  await fn(secret, { now: "2026-11-16T14:36:00Z" });
  await new Promise((s) => setTimeout(s, 300));
  assert.equal(received.length, 0);
  ok("drugi klic isti dan ne pošlje še enkrat");

  // ------------------------------------------------ mama 20:00 samo, če kaj čaka
  received.length = 0;
  await fn(secret, { now: "2026-11-16T19:02:00Z" });
  await new Promise((s) => setTimeout(s, 300));
  assert.equal(received.length, 0);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date());
  for (let i = 0; i < 3; i++) await adam.from("events").insert({ id: crypto.randomUUID(), family_id: familyId, vrsta: "trening", dan: today });
  psql("delete from push_log where kind='mama'");
  await fn(secret, { now: "2026-11-16T19:03:00Z" });
  await new Promise((s) => setTimeout(s, 300));
  assert.equal(received.length, 1);
  assert.match(received[0].path, /^\/mama\//);
  const mm = decrypt(dM, received[0].body);
  assert.equal(mm.body, "Adam čaka na 3 potrditve (3 Ki).");
  ok("mama ob 20:00 dobi opomnik samo, ko kaj čaka", `»${mm.body}«`);

  // ------------------------------------------------ počitnice: prosto
  received.length = 0;
  await fn(secret, { now: "2026-12-25T14:05:00Z" });
  await new Promise((s) => setTimeout(s, 300));
  assert.equal(received.filter((x) => x.path.startsWith("/adam/")).length, 0);
  ok("25. 12. (prosto): brez opomnika");

  // ------------------------------------------------ izklop
  await adam.rpc("delete_push_subscription", { endpoint: dA.endpoint });
  assert.equal((await adam.rpc("has_push_subscription", { endpoint: dA.endpoint })).data, false);
  received.length = 0;
  await fn(secret, { now: "2026-11-17T14:05:00Z" });
  await new Promise((s) => setTimeout(s, 300));
  assert.equal(received.length, 0);
  ok("po izklopu Adam ne dobi več obvestil");

  // ------------------------------------------------ odstranjena naprava ne dobi obvestil
  await adam.rpc("save_push_subscription", { endpoint: dA.endpoint, p256dh: b64u(dA.ecdh.getPublicKey()), auth: b64u(dA.authSecret) });
  const adamId = (await adam.auth.getUser()).data.user.id;
  await mama.rpc("remove_member", { target: adamId });
  received.length = 0;
  await fn(secret, { now: "2026-11-18T14:05:00Z" });
  await new Promise((s) => setTimeout(s, 300));
  assert.equal(received.length, 0);
  ok("naprava, ki jo mama odstrani, ne dobi več obvestil");

  // ------------------------------------------------ nov ritem pon/sre v obstoječi vsebini
  // stari ritem (kot ga ima obstoječa družina) + posodobitev iz migracije
  const fs = await import("node:fs");
  const old = JSON.parse(fs.readFileSync("data/ritem.json", "utf8"));
  old.dnevi["1"].kata = "16:30"; old.dnevi["3"].kata = "16:30"; old.karate = "Učenje končaj do 16:45, ob 17:00 greš na karate.";
  await mama.rpc("save_content", { k: "ritem", v: old });
  const mig = fs.readFileSync("supabase/migrations/20261116000000_obvestila.sql", "utf8");
  const upd = mig.slice(mig.indexOf("update public.content"));
  fs.writeFileSync("/tmp/claude-0/upd.sql", upd);
  execSync("psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -f /tmp/claude-0/upd.sql");
  const ritem = JSON.parse(psql("select value from content where key='ritem' limit 1"));
  assert.match(ritem.karate, /16:15.*16:30/);
  assert.match(ritem.dnevi["1"].kata, /16:15/);
  assert.match(ritem.dnevi["3"].kata, /16:15/);
  assert.equal(ritem.dnevi["2"].kata, "zvečer");
  ok("posodobitev obstoječe vsebine: pon/sre učenje do 16:15, oči ob 16:30");
} finally {
  server.close();
}
