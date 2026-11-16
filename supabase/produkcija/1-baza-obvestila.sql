-- Adamov Dojo: potisna obvestila + nov ritem ob ponedeljkih in sredah (oči ob 16:30).

-- ---------------------------------------------------------------- nastavitve samo za strežnik
-- Skrivnost za cron in ključa VAPID. Brez pravic za naprave; bere jih le Edge funkcija.
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value)
  values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (key) do nothing;

-- ---------------------------------------------------------------- naročnine naprav
create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 10 and 1000 and endpoint ~ '^https?://'),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_family on public.push_subscriptions (family_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Kaj je bilo danes že poslano (vsako obvestilo največ enkrat na dan).
create table if not exists public.push_log (
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null check (kind in ('adam', 'mama')),
  dan date not null,
  sent_at timestamptz not null default now(),
  primary key (family_id, kind, dan)
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

-- ---------------------------------------------------------------- RPC za naprave

create or replace function public.vapid_public_key() returns text
language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = 'vapid_public' and public.my_family() is not null
$$;

create or replace function public.save_push_subscription(endpoint text, p256dh text, auth text)
returns void language plpgsql security definer set search_path = public as $$
declare f uuid := public.my_family();
begin
  if f is null then raise exception 'Naprava ni povezana.' using errcode = '42501'; end if;
  insert into public.push_subscriptions (endpoint, user_id, family_id, p256dh, auth)
    values (save_push_subscription.endpoint, auth.uid(), f, save_push_subscription.p256dh, save_push_subscription.auth)
    on conflict on constraint push_subscriptions_pkey do update
      set user_id = auth.uid(), family_id = f, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

create or replace function public.delete_push_subscription(endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions p where p.endpoint = delete_push_subscription.endpoint and p.user_id = auth.uid()
$$;

create or replace function public.has_push_subscription(endpoint text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.push_subscriptions p where p.endpoint = has_push_subscription.endpoint and p.user_id = auth.uid())
$$;

revoke all on function public.vapid_public_key() from public, anon;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.has_push_subscription(text) from public, anon;
grant execute on function public.vapid_public_key() to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.has_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------- nov ritem pon/sre (obstoječe družine)
update public.content
set value = jsonb_set(jsonb_set(jsonb_set(jsonb_set(value,
      '{dnevi,1,kata}', '"pred odhodom, do 16:15 (pred testom zvečer)"'),
      '{dnevi,3,kata}', '"pred odhodom, do 16:15"'),
      '{karate}', '"Učenje in kato končaj do 16:15. Ob 16:30 te pride iskat oči."'),
      '{karateUrnik}', '"Odhod z očijem ob 16:30, trening na Ptuju 17:30–18:30, doma okoli 19:00."'),
    updated_at = now()
where key = 'ritem';

-- ---------------------------------------------------------------- časovnik: vsakih 5 minut pokliče funkcijo »push«
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'dojo-obvestila';
select cron.schedule('dojo-obvestila', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://dgursvwzcaqevlkkgyqc.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_settings where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
$cron$);
