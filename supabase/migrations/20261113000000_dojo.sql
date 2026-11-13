-- Adamov Dojo: shema, pravice (RLS) in strežniške funkcije.
-- Načelo: naprava z vlogo 'student' lahko samo dodaja čakajoče dogodke in bere
-- podatke svoje družine. Potrjevanje, unovčenje, urejanje vsebine in upravljanje
-- naprav gredo samo prek funkcij, ki preverijo vlogo 'parent' na strežniku.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tabele

create table public.families (
  id uuid primary key default gen_random_uuid(),
  child_name text not null default 'Adam' check (char_length(child_name) between 1 and 40),
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  role text not null check (role in ('parent', 'student')),
  device_label text not null default '' check (char_length(device_label) <= 60),
  created_at timestamptz not null default now()
);
create index on public.members (family_id);

create table public.pairing_codes (
  code text primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  role text not null check (role in ('parent', 'student')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null
);

-- Vsebina (urnik, turnirji, kviz, nagrade, pasovi ...), ena vrstica na ključ.
create table public.content (
  family_id uuid not null references public.families (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{1,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (family_id, key)
);

-- Katalog dejanj: vrednost Ki določi strežnik, ne naprava.
create table public.ki_actions (
  vrsta text primary key,
  ki int not null check (ki between 0 and 20),
  unique_ref boolean not null default false
);
insert into public.ki_actions (vrsta, ki, unique_ref) values
  ('trening', 1, false),
  ('branje', 1, false),
  ('kata', 1, true),            -- ref = datum, enkrat na dan
  ('kviz', 1, false),
  ('napaka', 1, true),          -- ref = id napake
  ('ponovitev', 1, true),       -- ref = datum
  ('pocitnice', 1, true),       -- ref = datum + naloga
  ('turnir_zacetek', 3, true),  -- ref = id turnirja
  ('turnir_seznam', 5, true);   -- ref = id turnirja

create table public.events (
  id uuid primary key,                       -- ustvari naprava, zato ni podvajanja
  family_id uuid not null references public.families (id) on delete cascade,
  vrsta text not null references public.ki_actions (vrsta),
  predmet text not null default '' check (char_length(predmet) <= 40),
  ref text not null default '' check (char_length(ref) <= 80),
  opis text not null default '' check (char_length(opis) <= 200),
  dan date not null,                         -- dan v Europe/Ljubljana, ko je bilo narejeno
  ki int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  komentar text not null default '' check (char_length(komentar) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  decided_at timestamptz,
  decided_by uuid
);
create index on public.events (family_id, dan);
-- Bonus za isti turnir, isto napako ali isti dan samo enkrat (zavrnjeni ne štejejo).
create unique index events_unique_ref on public.events (family_id, vrsta, ref)
  where ref <> '' and status <> 'rejected';

create table public.checklist (
  family_id uuid not null references public.families (id) on delete cascade,
  turnir_id text not null check (char_length(turnir_id) <= 60),
  item_id text not null check (char_length(item_id) <= 20),
  done boolean not null default false,
  vnos text not null default '' check (char_length(vnos) <= 500),
  updated_at timestamptz not null default now(),
  primary key (family_id, turnir_id, item_id)
);

create table public.mistakes (
  id uuid primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  vprasanje text not null check (char_length(vprasanje) between 1 and 300),
  odgovor text not null default '' check (char_length(odgovor) <= 300),
  vir text not null default '' check (char_length(vir) <= 60),
  fixed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.mistakes (family_id);

create table public.feedback (
  family_id uuid not null references public.families (id) on delete cascade,
  turnir_id text not null check (char_length(turnir_id) <= 60),
  mood text not null check (mood in ('super', 'ok', 'tezko')),
  created_at timestamptz not null default now(),
  primary key (family_id, turnir_id)
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  reward_id text not null,
  label text not null,
  cost int not null check (cost > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null
);
create index on public.redemptions (family_id);

create table public.pin_attempts (
  family_id uuid not null references public.families (id) on delete cascade,
  at timestamptz not null default now()
);
create index on public.pin_attempts (family_id, at);

-- ---------------------------------------------------------------- pomožne funkcije

create or replace function public.my_family() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from public.members where user_id = auth.uid()
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where user_id = auth.uid()
$$;

create or replace function public.require_parent() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare f uuid;
begin
  select family_id into f from public.members where user_id = auth.uid() and role = 'parent';
  if f is null then
    raise exception 'Samo starš lahko to naredi.' using errcode = '42501';
  end if;
  return f;
end $$;

-- Preveri PIN in omeji ugibanje: največ 5 napačnih poskusov v 10 minutah.
-- Ne meče izjeme (ta bi razveljavila zapis poskusa), ampak vrne 'ok', 'bad' ali 'locked'.
create or replace function public.check_pin(f uuid, pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare h text; n int;
begin
  select count(*) into n from public.pin_attempts where family_id = f and at > now() - interval '10 minutes';
  if n >= 5 then return 'locked'; end if;
  select pin_hash into h from public.families where id = f;
  if h is null or extensions.crypt(coalesce(pin, ''), h) <> h then
    insert into public.pin_attempts (family_id) values (f);
    return 'bad';
  end if;
  delete from public.pin_attempts where family_id = f;
  return 'ok';
end $$;

-- ---------------------------------------------------------------- sprožilci

-- Ob vstavljanju dogodka strežnik sam določi Ki, status in avtorja.
create or replace function public.events_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.ki_actions;
begin
  select * into a from public.ki_actions where vrsta = new.vrsta;
  if a is null then raise exception 'Neznano dejanje.'; end if;
  if a.unique_ref and new.ref = '' then raise exception 'Manjka ref.'; end if;
  new.ki := a.ki;
  new.status := 'pending';
  new.komentar := '';
  new.decided_at := null;
  new.decided_by := null;
  new.created_by := auth.uid();
  new.created_at := now();
  if new.dan < (now() at time zone 'Europe/Ljubljana')::date - 14
     or new.dan > (now() at time zone 'Europe/Ljubljana')::date + 1 then
    raise exception 'Datum ni veljaven.';
  end if;
  return new;
end $$;
create trigger events_before_insert before insert on public.events
  for each row execute function public.events_before_insert();

-- ---------------------------------------------------------------- RLS

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.content enable row level security;
alter table public.ki_actions enable row level security;
alter table public.events enable row level security;
alter table public.checklist enable row level security;
alter table public.mistakes enable row level security;
alter table public.feedback enable row level security;
alter table public.redemptions enable row level security;
alter table public.pin_attempts enable row level security;

-- Najprej vse odvzamemo, nato dodelimo samo potrebno.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant select (id, child_name, created_at) on public.families to authenticated;
create policy fam_read on public.families for select to authenticated using (id = public.my_family());

grant select on public.members to authenticated;
create policy mem_read on public.members for select to authenticated using (family_id = public.my_family());

grant select on public.ki_actions to authenticated;
create policy ki_read on public.ki_actions for select to authenticated using (true);

grant select on public.content to authenticated;
create policy content_read on public.content for select to authenticated using (family_id = public.my_family());

grant select, insert on public.events to authenticated;
create policy ev_read on public.events for select to authenticated using (family_id = public.my_family());
create policy ev_insert on public.events for insert to authenticated
  with check (family_id = public.my_family() and status = 'pending');

grant select, insert, update on public.checklist to authenticated;
create policy cl_read on public.checklist for select to authenticated using (family_id = public.my_family());
create policy cl_insert on public.checklist for insert to authenticated with check (family_id = public.my_family());
create policy cl_update on public.checklist for update to authenticated
  using (family_id = public.my_family()) with check (family_id = public.my_family());

grant select, insert on public.mistakes to authenticated;
grant update (fixed_at) on public.mistakes to authenticated;
create policy mi_read on public.mistakes for select to authenticated using (family_id = public.my_family());
create policy mi_insert on public.mistakes for insert to authenticated with check (family_id = public.my_family());
create policy mi_update on public.mistakes for update to authenticated
  using (family_id = public.my_family()) with check (family_id = public.my_family());

grant select, insert on public.feedback to authenticated;
create policy fb_read on public.feedback for select to authenticated using (family_id = public.my_family());
create policy fb_insert on public.feedback for insert to authenticated with check (family_id = public.my_family());

grant select on public.redemptions to authenticated;
create policy re_read on public.redemptions for select to authenticated using (family_id = public.my_family());
-- pairing_codes, pin_attempts: brez neposrednega dostopa.

-- ---------------------------------------------------------------- RPC: družina in naprave

create or replace function public.create_family(pin text, child_name text default 'Adam', device_label text default '')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Ni seje.' using errcode = '42501'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Ta naprava je že povezana.' using errcode = '42501';
  end if;
  if pin !~ '^[0-9]{4,8}$' then raise exception 'PIN mora imeti 4 do 8 številk.'; end if;
  insert into public.families (child_name, pin_hash)
    values (coalesce(nullif(trim(child_name), ''), 'Adam'), extensions.crypt(pin, extensions.gen_salt('bf', 10)))
    returning id into f;
  insert into public.members (user_id, family_id, role, device_label) values (auth.uid(), f, 'parent', left(device_label, 60));
  return f;
end $$;

create or replace function public.create_pairing_code(for_role text default 'student')
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare f uuid := public.require_parent();
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text; i int; b bytea;
begin
  if for_role not in ('parent', 'student') then raise exception 'Neveljavna vloga.'; end if;
  delete from public.pairing_codes p where p.family_id = f and (p.used_at is not null or p.expires_at < now());
  loop
    b := extensions.gen_random_bytes(6);
    c := '';
    for i in 0..5 loop c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.pairing_codes p where p.code = c);
  end loop;
  insert into public.pairing_codes (code, family_id, role, expires_at, created_by)
    values (c, f, for_role, now() + interval '10 minutes', auth.uid());
  return query select c, now() + interval '10 minutes';
end $$;

create or replace function public.join_family(code text, device_label text default '')
returns text language plpgsql security definer set search_path = public as $$
declare p public.pairing_codes;
begin
  if auth.uid() is null then raise exception 'Ni seje.' using errcode = '42501'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Ta naprava je že povezana.' using errcode = '42501';
  end if;
  select * into p from public.pairing_codes pc
    where pc.code = upper(trim(join_family.code)) and pc.used_at is null and pc.expires_at > now()
    for update;
  if p is null then raise exception 'Koda ne velja ali je potekla.' using errcode = '22023'; end if;
  update public.pairing_codes set used_at = now() where pairing_codes.code = p.code;
  insert into public.members (user_id, family_id, role, device_label) values (auth.uid(), p.family_id, p.role, left(device_label, 60));
  return p.role;
end $$;

create or replace function public.remove_member(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f uuid := public.require_parent();
begin
  if target = auth.uid() then raise exception 'Svoje naprave ne moreš odstraniti.'; end if;
  delete from public.members where user_id = target and family_id = f;
end $$;

create or replace function public.verify_pin(pin text)
returns text language plpgsql security definer set search_path = public as $$
declare f uuid := public.require_parent();
begin
  return public.check_pin(f, pin);
end $$;

create or replace function public.change_pin(old_pin text, new_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare f uuid := public.require_parent(); res text;
begin
  if new_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN mora imeti 4 do 8 številk.'; end if;
  res := public.check_pin(f, old_pin);
  if res <> 'ok' then return res; end if;
  update public.families set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)) where id = f;
  return 'ok';
end $$;

-- ---------------------------------------------------------------- RPC: starš

create or replace function public.decide_events(ids uuid[], new_status text, komentar text default '')
returns int language plpgsql security definer set search_path = public as $$
declare f uuid := public.require_parent(); n int;
begin
  if new_status not in ('confirmed', 'rejected') then raise exception 'Neveljaven status.'; end if;
  update public.events e
    set status = new_status,
        komentar = case when new_status = 'rejected' then left(coalesce(decide_events.komentar, ''), 200) else '' end,
        decided_at = now(), decided_by = auth.uid()
    where e.family_id = f and e.id = any(ids) and e.status = 'pending';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.save_content(k text, v jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare f uuid := public.require_parent();
begin
  if pg_column_size(v) > 200000 then raise exception 'Vsebina je prevelika.'; end if;
  insert into public.content (family_id, key, value, updated_at) values (f, k, v, now())
    on conflict (family_id, key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function public.delete_mistake(mid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f uuid := public.require_parent();
begin
  delete from public.mistakes where id = mid and family_id = f;
end $$;

create or replace function public.balance(f uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(ki) from public.events where family_id = f and status = 'confirmed'), 0)
       - coalesce((select sum(cost) from public.redemptions where family_id = f), 0)
$$;

create or replace function public.redeem_reward(reward_id text, pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f uuid := public.require_parent(); r jsonb; c int; l text; rid uuid; res text;
begin
  res := public.check_pin(f, pin);
  if res <> 'ok' then return jsonb_build_object('ok', false, 'error', res); end if;
  -- zaklep vrstice družine, da dve hkratni unovčenji ne porabita istih točk
  perform 1 from public.families where id = f for update;
  select x into r from public.content, jsonb_array_elements(value -> 'nagrade') x
    where family_id = f and key = 'ki' and x ->> 'id' = reward_id;
  if r is null then raise exception 'Nagrada ne obstaja.'; end if;
  c := (r ->> 'cena')::int;
  l := r ->> 'ime';
  if c is null or c <= 0 then raise exception 'Nagrada nima cene.'; end if;
  if public.balance(f) < c then return jsonb_build_object('ok', false, 'error', 'balance'); end if;
  insert into public.redemptions (family_id, reward_id, label, cost, created_by)
    values (f, reward_id, l, c, auth.uid()) returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid);
end $$;

-- Uvoz varnostne kopije (samo starš): vsebina in zapisi, brez podvajanja.
create or replace function public.import_backup(data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare f uuid := public.require_parent(); x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(data -> 'content', '[]'::jsonb)) loop
    insert into public.content (family_id, key, value) values (f, x ->> 'key', x -> 'value')
      on conflict (family_id, key) do update set value = excluded.value, updated_at = now();
  end loop;
  alter table public.events disable trigger events_before_insert;
  insert into public.events (id, family_id, vrsta, predmet, ref, opis, dan, ki, status, komentar, created_at, created_by, decided_at, decided_by)
    select (e ->> 'id')::uuid, f, e ->> 'vrsta', coalesce(e ->> 'predmet', ''), coalesce(e ->> 'ref', ''), coalesce(e ->> 'opis', ''),
           (e ->> 'dan')::date, coalesce((e ->> 'ki')::int, 0), coalesce(e ->> 'status', 'pending'), coalesce(e ->> 'komentar', ''),
           coalesce((e ->> 'created_at')::timestamptz, now()), auth.uid(), (e ->> 'decided_at')::timestamptz, null
    from jsonb_array_elements(coalesce(data -> 'events', '[]'::jsonb)) e
    where exists (select 1 from public.ki_actions a where a.vrsta = e ->> 'vrsta')
    on conflict do nothing;
  alter table public.events enable trigger events_before_insert;
  insert into public.checklist (family_id, turnir_id, item_id, done, vnos)
    select f, c ->> 'turnir_id', c ->> 'item_id', coalesce((c ->> 'done')::boolean, false), coalesce(c ->> 'vnos', '')
    from jsonb_array_elements(coalesce(data -> 'checklist', '[]'::jsonb)) c
    on conflict (family_id, turnir_id, item_id) do update set done = excluded.done, vnos = excluded.vnos;
  insert into public.mistakes (id, family_id, vprasanje, odgovor, vir, fixed_at, created_at)
    select (m ->> 'id')::uuid, f, m ->> 'vprasanje', coalesce(m ->> 'odgovor', ''), coalesce(m ->> 'vir', ''),
           (m ->> 'fixed_at')::timestamptz, coalesce((m ->> 'created_at')::timestamptz, now())
    from jsonb_array_elements(coalesce(data -> 'mistakes', '[]'::jsonb)) m
    on conflict do nothing;
  insert into public.feedback (family_id, turnir_id, mood)
    select f, b ->> 'turnir_id', b ->> 'mood' from jsonb_array_elements(coalesce(data -> 'feedback', '[]'::jsonb)) b
    on conflict do nothing;
  insert into public.redemptions (id, family_id, reward_id, label, cost, created_at, created_by)
    select (r ->> 'id')::uuid, f, r ->> 'reward_id', r ->> 'label', (r ->> 'cost')::int,
           coalesce((r ->> 'created_at')::timestamptz, now()), auth.uid()
    from jsonb_array_elements(coalesce(data -> 'redemptions', '[]'::jsonb)) r
    on conflict do nothing;
end $$;

grant execute on function public.create_family(text, text, text) to authenticated;
grant execute on function public.create_pairing_code(text) to authenticated;
grant execute on function public.join_family(text, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.verify_pin(text) to authenticated;
grant execute on function public.change_pin(text, text) to authenticated;
grant execute on function public.decide_events(uuid[], text, text) to authenticated;
grant execute on function public.save_content(text, jsonb) to authenticated;
grant execute on function public.delete_mistake(uuid) to authenticated;
grant execute on function public.redeem_reward(text, text) to authenticated;
grant execute on function public.import_backup(jsonb) to authenticated;
-- my_family / my_role se uporabljata v pravilih RLS
grant execute on function public.my_family() to authenticated;
grant execute on function public.my_role() to authenticated;

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table
  public.events, public.content, public.checklist, public.mistakes, public.feedback, public.redemptions, public.members;
