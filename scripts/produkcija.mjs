// Pripravi datoteki za ročno objavo v nadzorni plošči Supabase:
//   supabase/produkcija/1-baza-obvestila.sql   (prilepi v SQL Editor)
//   supabase/produkcija/2-funkcija-push.ts     (prilepi kot Edge funkcijo »push«)
// Zagon: node scripts/produkcija.mjs https://<projekt>.supabase.co
import fs from "node:fs";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base)) {
  console.error("Uporaba: node scripts/produkcija.mjs https://<projekt>.supabase.co");
  process.exit(1);
}
fs.mkdirSync("supabase/produkcija", { recursive: true });

const migration = fs.readFileSync("supabase/migrations/20261116000000_obvestila.sql", "utf8");
const cron = `
-- ---------------------------------------------------------------- časovnik: vsakih 5 minut pokliče funkcijo »push«
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'dojo-obvestila';
select cron.schedule('dojo-obvestila', '*/5 * * * *', $cron$
  select net.http_post(
    url := '${base}/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_settings where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
$cron$);
`;
fs.writeFileSync("supabase/produkcija/1-baza-obvestila.sql", migration + cron);

// ena sama datoteka: logic.ts vstavljen namesto uvoza
const logic = fs.readFileSync("supabase/functions/push/logic.ts", "utf8");
const index = fs.readFileSync("supabase/functions/push/index.ts", "utf8");
const importRe = /import \{[^}]*\} from "\.\/logic\.ts";\n/;
if (!importRe.test(index)) throw new Error("uvoz logic.ts ni najden");
const single = index.replace(importRe, `// ---- logic.ts (vstavljeno) ----\n${logic}\n// ---- konec logic.ts ----\n`);
fs.writeFileSync("supabase/produkcija/2-funkcija-push.ts", "// SAMODEJNO USTVARJENO z scripts/produkcija.mjs. Ne urejaj ročno.\n" + single);
console.log("Pripravljeno: supabase/produkcija/1-baza-obvestila.sql, 2-funkcija-push.ts");
