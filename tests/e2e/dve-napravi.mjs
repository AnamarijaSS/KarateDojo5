// E2E preizkus z dvema brskalnikoma (Adam in mama) proti lokalnemu Supabase.
// Zagon: npx supabase start && npm run build && (cd out && python3 -m http.server 3000) &
//        NODE_PATH=$(npm root -g) node tests/e2e/dve-napravi.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }
const { createClient } = require("@supabase/supabase-js");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU", { auth: { persistSession: false } });
const SHOTS = process.env.SHOTS ?? "";
const results = [];
const ok = (name, detail = "") => { results.push(["✔", name, detail]); console.log("✔", name, detail); };

const browser = await chromium.launch();
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "sl-SI", timezoneId: "Europe/Ljubljana" };
const mamaCtx = await browser.newContext(iphone);
const adamCtx = await browser.newContext({ ...iphone, acceptDownloads: true });
const mama = await mamaCtx.newPage();
const adam = await adamCtx.newPage();
for (const [n, p] of [["mama", mama], ["adam", adam]]) p.on("pageerror", (e) => console.log(`[${n} napaka]`, e.message));
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };

try {
  // ------------------------------------------------ mama ustvari družino
  await mama.goto(APP);
  await mama.getByRole("button", { name: "Nadaljuj tukaj" }).click({ timeout: 2000 }).catch(() => {});
  await mama.getByRole("button", { name: "Mama" }).click();
  await mama.locator("#pin1").fill("4826");
  await mama.locator("#pin2").fill("4826");
  await mama.getByRole("button", { name: "Ustvari dojo" }).click();
  await mama.getByText("Starševski način").waitFor({ timeout: 20000 });
  ok("mama ustvari dojo in PIN");

  await mama.getByRole("button", { name: "Več" }).click();
  await mama.getByRole("button", { name: "Povezane naprave" }).click();
  await mama.getByRole("button", { name: "Ustvari kodo" }).first().click();
  const code = (await mama.getByTestId("pairing-code").innerText()).trim();
  assert.match(code, /^[A-Z0-9]{6}$/);
  await shot(mama, "mama-koda");
  ok("koda za povezavo", code);

  // ------------------------------------------------ Adam se poveže
  await adam.goto(APP + "/?hitro=1");
  await adam.getByRole("button", { name: "Nadaljuj tukaj" }).click({ timeout: 2000 }).catch(() => {});
  await adam.getByRole("button", { name: "Adam" }).click();
  await adam.getByLabel("Koda").fill(code);
  await adam.getByRole("button", { name: "Poveži" }).click();
  await adam.getByText("Živijo, Adam!").waitFor({ timeout: 20000 });
  const { data: members } = await admin.from("members").select("role");
  assert.deepEqual(members.map((m) => m.role).sort(), ["parent", "student"]);
  await shot(adam, "adam-danes");
  ok("Adam povezan, vloga 'student' shranjena na strežniku");

  // ------------------------------------------------ kriterij 10: trening → mama ≤ 30 s → potrditev → Adam
  await adam.getByTestId("zacni-trening").click();
  await adam.getByTestId("start-timer").click();
  await adam.getByText("Zvezek odprt, telefon stran.").waitFor();
  await shot(adam, "adam-casovnik");
  await adam.getByText("Kaj si naredil?").waitFor({ timeout: 30000 });
  await adam.getByRole("radio", { name: "Matematika" }).click();
  await adam.getByText("Naredil sem").click();
  const t0 = Date.now();
  await adam.getByTestId("potrdi-trening").click();
  await mama.getByRole("button", { name: /Potrdi/ }).first().click();
  await mama.getByTestId("cakajoca").first().waitFor({ timeout: 30000 });
  const lag = ((Date.now() - t0) / 1000).toFixed(1);
  assert.ok(Number(lag) <= 30);
  await shot(mama, "mama-potrdi");
  ok("kriterij 10a: trening pride na mamin telefon", `v ${lag} s`);
  assert.equal((await adam.getByTestId("ki-cakajoce").innerText()).includes("1"), true);
  await adam.getByRole("button", { name: /Preskoči odmor/ }).click().catch(() => {});

  await mama.getByTestId("potrdi-eno").first().click();
  const t1 = Date.now();
  await adam.getByTestId("ki-potrjene").filter({ hasText: "1 Ki" }).waitFor({ timeout: 30000 });
  ok("kriterij 10b: mama potrdi, Adam vidi potrjene točke", `v ${((Date.now() - t1) / 1000).toFixed(1)} s`);

  // ------------------------------------------------ kriterij 6: Adam nima unovčenja
  await adam.getByRole("button", { name: "Nagrade" }).click();
  assert.equal(await adam.getByRole("button", { name: /Unovči/ }).count(), 0);
  await adam.getByText("Pokaži mami").or(adam.getByText(/^še \d+/)).first().waitFor();
  ok("kriterij 6: Adamova naprava nima gumba za unovčenje (API zavrne, glej security.test.ts)");

  // ------------------------------------------------ kriterij 12: brez povezave 2 nalogi, poslani natanko enkrat
  await adam.getByRole("button", { name: "Danes" }).click();
  await adam.reload(); // da service worker prevzame stran
  await adam.getByText("Živijo, Adam!").waitFor();
  await adamCtx.setOffline(true);
  await adam.evaluate(() => window.dispatchEvent(new Event("offline")));
  const kata = adam.getByRole("button", { name: /Kata narejena/ });
  const hasKata = await kata.count();
  if (hasKata) await kata.click();
  else {
    // ob vikendih ni kate: namesto nje odkljuka napako iz zvezka
    await adam.getByRole("button", { name: "Napake" }).click();
    await adam.getByRole("button", { name: /Dodaj/ }).click();
    await adam.getByLabel("Napaka").fill("s sestro, ne z sestro");
    await adam.getByRole("button", { name: "Shrani" }).click();
    await adam.getByRole("button", { name: "Danes" }).click();
  }
  await adam.getByRole("button", { name: "Turnirji" }).click();
  await adam.getByTestId("turnir-slj-2026-12-10").click();
  await adam.getByTestId("priprava-a").check();
  await adam.getByTestId("brez-povezave").waitFor();
  await shot(adam, "adam-brez-povezave");
  // ponovno nalaganje brez povezave: vrsta ostane v IndexedDB
  await adam.reload().catch(() => {});
  await adam.getByText(/Slovenščina|Živijo/).first().waitFor({ timeout: 10000 });
  const before = (await admin.from("events").select("id")).data.length;
  await adamCtx.setOffline(false);
  await adam.evaluate(() => window.dispatchEvent(new Event("online")));
  await adam.waitForTimeout(4000);
  // še en ponovni poskus pošiljanja ne sme podvojiti
  await adam.evaluate(() => window.dispatchEvent(new Event("online")));
  await adam.waitForTimeout(2000);
  const { data: evs } = await admin.from("events").select("vrsta, ref");
  const added = evs.length - before;
  const { data: cl } = await admin.from("checklist").select("turnir_id, item_id, done");
  assert.equal(cl.filter((r) => r.turnir_id === "slj-2026-12-10" && r.item_id === "a" && r.done).length, 1);
  const expected = hasKata ? 2 : 1; // kata + bonus za pravočasen začetek (napaka ni dogodek)
  assert.equal(added, expected, `pričakoval ${expected} nova dogodka, dobil ${added}`);
  assert.equal(evs.filter((e) => e.vrsta === "turnir_zacetek").length, 1);
  if (hasKata) assert.equal(evs.filter((e) => e.vrsta === "kata").length, 1);
  if (!hasKata) assert.equal((await admin.from("mistakes").select("id")).data.length, 1);
  ok("kriterij 12: 2 nalogi brez povezave poslani natanko enkrat", `${hasKata ? "kata + kljukica priprave (+3 Ki bonus)" : "napaka + kljukica priprave"}`);

  // ------------------------------------------------ kriteriji 1–5 v vmesniku
  const check = async (datum, fn, name) => {
    await adam.goto(`${APP}/?datum=${datum}`);
    await adam.getByTestId("preizkusni-datum").waitFor();
    await fn();
    await shot(adam, `datum-${datum}`);
    ok(name);
  };
  await check("2026-12-07", async () => {
    assert.match(await adam.getByTestId("blok1").innerText(), /Slovenščina/);
    await adam.getByTestId("opomnik-karate").waitFor();
    assert.match(await adam.getByTestId("kata").innerText(), /SLJ, MAT, DRU/);
  }, "kriterij 1: pon 7. 12. → blok 1 SLJ, karate, kata SLJ MAT DRU");
  await check("2026-12-08", async () => {
    assert.match(await adam.getByTestId("bloki").innerText(), /3 treningi/);
    await adam.getByTestId("opomnik-spanje").waitFor();
  }, "kriterij 2: tor 8. 12. → 3 bloki, zgodaj spat");
  await check("2026-12-11", async () => {
    assert.match(await adam.getByTestId("blok1").innerText(), /Matematika/);
  }, "kriterij 3: pet 11. 12. → MAT");
  await check("2026-12-28", async () => {
    const t = await adam.getByTestId("pocitnice-plan").innerText();
    assert.match(t, /turistični vodnik/);
    assert.match(t, /angleških besed/);
  }, "kriterij 4a: pon 28. 12. → počitniški plan");
  await check("2026-12-25", async () => {
    await adam.getByTestId("pocitnice-prosto").waitFor();
    assert.equal(await adam.getByTestId("plan-dneva").count(), 0);
    assert.equal(await adam.getByTestId("zacni-trening").count(), 0);
  }, "kriterij 4b: pet 25. 12. → samo »Uživaj počitnice«");
  await check("2027-01-19", async () => {
    assert.match(await adam.getByTestId("blok1").innerText(), /Matematika/);
    await adam.getByRole("button", { name: "Turnirji" }).click();
    await adam.getByTestId("turnir-mat-2027-01-20").waitFor();
  }, "kriterij 5: tor 19. 1. → MAT geometrija");
  await adam.goto(`${APP}/?datum=2026-12-10`);
  await adam.getByRole("button", { name: "Turnirji" }).click();
  const colors = await adam.locator("[data-color]").evaluateAll((els) => els.map((e) => e.getAttribute("data-color")));
  assert.equal(colors[0], "rdeca"); // SLJ je danes (0 dni)
  assert.equal(colors[1], "rumena"); // MAT 14. 12. čez 4 dni
  assert.equal(colors[2], "zelena"); // DRU 18. 12. čez 8 dni
  ok("barve odštevanja: rdeče < 3, rumeno 3 do 7, zeleno > 7");
  await adam.goto(`${APP}/?datum=`);

  // ------------------------------------------------ kriterij 7: osvežitev + izvoz/uvoz
  await mama.reload();
  await mama.getByText("Čaka na potrditev").or(mama.getByText("Ni ničesar za potrditi.")).first().waitFor();
  assert.ok((await admin.from("events").select("id").eq("status", "confirmed")).data.length >= 1);
  await mama.getByRole("button", { name: "Več" }).click();
  await mama.getByRole("button", { name: "Varnostna kopija" }).click();
  const dl = mama.waitForEvent("download");
  await mama.getByTestId("izvozi").click();
  const file = await (await dl).path();
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(json.app, "adamov-dojo");
  const countBefore = (await admin.from("events").select("id")).data.length;
  await mama.getByTestId("uvozi").setInputFiles(file);
  await mama.getByText("Shranjeno.").waitFor({ timeout: 15000 });
  const countAfter = (await admin.from("events").select("id")).data.length;
  assert.equal(countAfter, countBefore);
  assert.equal(json.events.length, countBefore);
  ok("kriterij 7: podatki ostanejo po osvežitvi; izvoz in uvoz JSON brez podvajanja", `${json.events.length} dogodkov`);

  // ------------------------------------------------ unovčenje na maminem telefonu s PIN
  // dodaj potrjene Ki neposredno v bazo (testna priprava), da je dovolj za nagrado
  execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -c "alter table events disable trigger events_before_insert; insert into events (id, family_id, vrsta, dan, ki, status, created_by) select gen_random_uuid(), m.family_id, 'branje', current_date, 1, 'confirmed', m.user_id from members m, generate_series(1,12) where m.role='student'; alter table events enable trigger events_before_insert;"`);
  await mama.getByRole("button", { name: "Nagrade" }).click();
  await mama.getByRole("button", { name: /30 minut Robloxa/ }).click({ timeout: 30000 });
  for (const d of "4826") await mama.getByRole("button", { name: d, exact: true }).click();
  await mama.getByTestId("pin-ok").click();
  await mama.getByText("Unovčeno: 30 minut Robloxa").waitFor({ timeout: 10000 });
  await shot(mama, "mama-unovceno");
  ok("mama unovči nagrado s PIN-om");

  await adam.getByRole("button", { name: "Nagrade" }).click();
  await adam.getByText("Unovčeno").waitFor({ timeout: 30000 });
  await shot(adam, "adam-nagrade");
  ok("Adam vidi zgodovino unovčenj");
} finally {
  await browser.close();
  console.log(`\n${results.length} preverjanj uspešnih.`);
}
