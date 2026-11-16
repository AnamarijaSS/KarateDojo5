# Adamov Dojo

Motivacijska učna igra (PWA) za Adama, 5.a, OŠ Jožeta Hudalesa Jurovski Dol, 1. ocenjevalno obdobje 2026/27.
Adam vsak dan vidi eno jasno naslednjo nalogo, jo naredi v zvezku in odkljuka. Mama na svojem telefonu potrdi Ki točke in unovči nagrade.

## Kako je zgrajeno

| Del | Kje |
|---|---|
| Vsebina (urnik, kata, ritem, turnirji, priprave, počitnice, kviz, znaki, nasveti, Ki) | `data/*.json` |
| Logika datumov: blok 1, bloki, 5·3·1, počitnice, niz, pasovi | `src/lib/plan.ts`, `streak.ts`, `ki.ts` + testi v `src/lib/__tests__` |
| Sinhronizacija, vrsta brez povezave (IndexedDB) | `src/lib/store.ts`, `src/lib/idb.ts` |
| Baza, pravice (RLS), strežniške funkcije | `supabase/migrations/20261113000000_dojo.sql` |
| Zasloni | `src/components/` (Student, Parent, Onboarding, Timer) |
| Testi pravic proti strežniku | `tests/security.test.ts` |
| E2E z dvema brskalnikoma | `tests/e2e/dve-napravi.mjs` |

Aplikacija je statična (Next.js `output: "export"`), vsa strežniška logika in preverjanje pravic je v Supabase:

* Naprava z vlogo `student` lahko samo **dodaja čakajoče** dogodke. Število Ki določi strežnik (sprožilec), ne naprava.
* Potrjevanje, unovčenje, urejanje vsebine in naprav gre samo prek funkcij, ki preverijo vlogo `parent`.
* PIN je shranjen zgoščeno (bcrypt), po 5 napačnih poskusih se zaklene za 10 minut.
* Vsak dogodek dobi ID že v telefonu, zato se ob ponovnem pošiljanju ne podvoji. Bonusi za turnir in kato so enkratni (unikatni indeks).
* Pas raste po vseh potrjenih Ki in nikoli ne pade. Nagrade porabljajo ločeno stanje »Ki za nagrade«.

## Lokalni zagon

Potrebuješ Node 22 in Docker.

```bash
npm install
npx supabase start          # lokalni Supabase v Dockerju
cp .env.example .env.local  # vrednosti izpiše `npx supabase status`
npm run dev                 # http://localhost:3000
```

Preizkus datuma (samo v razvoju ali z `NEXT_PUBLIC_ALLOW_DATE_OVERRIDE=1`): `http://localhost:3000/?datum=2026-12-07`. Prazen `?datum=` ga izklopi.
Hitri časovniki za preizkus: `?hitro=1` (20 minut traja 10 sekund).

## Testi

```bash
npm test                    # logika datumov + pravice proti lokalnemu Supabase
npm run build && (cd out && python3 -m http.server 3000) &
npm run e2e                 # dva brskalnika: Adam in mama
```

## Nastavitev Supabase (koraki za mamo)

1. Na [supabase.com](https://supabase.com) ustvari brezplačen račun in nov projekt. Regija: **Central EU (Frankfurt)**. Geslo baze shrani v upravitelja gesel.
2. **Authentication → Sign In / Providers → Anonymous Sign-Ins**: vklopi. (Prijava z e-pošto ni potrebna.)
3. **SQL Editor → New query**: prilepi celotno vsebino `supabase/migrations/20261113000000_dojo.sql` in klikni **Run**.
4. **Project Settings → API**: prepiši **Project URL** in **anon / publishable key**. To sta edini vrednosti, ki ju potrebuje aplikacija. Ključ `service_role` ne gre nikamor v aplikacijo.
5. Na Vercelu (šele po potrditvi objave) vnesi okoljski spremenljivki:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   `NEXT_PUBLIC_ALLOW_DATE_OVERRIDE` v produkciji **ne** nastavi.

## Potisna obvestila

* Adam: opomnik za trening (privzeto pon 15:30, tor do pet 15:00, sobota 10:00 samo pred testom v pon ali tor, nedelja brez). Med počitnicami »prosto« ga ni.
* Mama: ob 20:00, samo če kaj čaka na potrditev.
* Ure ureja mama v **Več → Obvestila**. Vsak telefon obvestila vklopi ali izklopi sam.
* Delovanje: `pg_cron` vsakih 5 minut pokliče Edge funkcijo `push` (`supabase/functions/push`). Ta pošlje obvestilo največ enkrat na dan (`push_log`). Šifriranje in podpis sta narejena z vgrajenim WebCrypto, brez zunanjih knjižnic. Ključa VAPID ustvari funkcija sama in ju hrani v tabeli `app_settings`, do katere naprave nimajo dostopa.
* Na iPhonu delujejo samo v aplikaciji na domačem zaslonu, iOS 16.4 ali novejši.

Objava (ročno v nadzorni plošči Supabase): `node scripts/produkcija.mjs https://<projekt>.supabase.co` pripravi `supabase/produkcija/1-baza-obvestila.sql` (SQL Editor) in `2-funkcija-push.ts` (Edge Functions → nova funkcija `push`, brez preverjanja JWT).

Preizkus: `npx supabase functions serve --no-verify-jwt &` in `node tests/e2e/obvestila.mjs`.

## Prvi zagon na telefonih (iPhone)

1. Na maminem telefonu odpri naslov aplikacije v Safariju → **Deli → Dodaj na začetni zaslon** → odpri **Dojo** z domačega zaslona → **Mama** → izberi PIN.
2. **Več → Povezane naprave → Ustvari kodo**.
3. Na Adamovem telefonu prav tako **najprej dodaj na začetni zaslon** in šele nato odpri Dojo → **Adam** → vpiši kodo ali skeniraj QR.
   Na iPhonu imata Safari in aplikacija na domačem zaslonu ločen spomin, zato povezava v Safariju ne bi veljala za aplikacijo.

## Zasebnost

Na strežniku je samo ime »Adam«, naloge, točke in datumi. Brez e-pošte, telefonskih številk, lokacije, analitike ali oglasov.
