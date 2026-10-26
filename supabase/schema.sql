-- ═══════════════════════════════════════════════════════════════
--  Щасливі лапки — схема бази даних кабінетів клієнта та менеджера
--
--  Як застосувати: Supabase → SQL Editor → вставити весь файл → Run.
--  Файл можна запускати повторно: він не видаляє дані.
--
--  Звичайний PostgreSQL. Від Supabase залежать лише:
--    • auth.uid() / auth.jwt() — хто зараз виконує запит;
--    • ролі anon / authenticated;
--    • публікація supabase_realtime (миттєві сповіщення в панелі);
--    • розширення pg_net (надсилання сповіщень у Telegram).
--  При переїзді на власний сервер достатньо замінити ці місця
--  (див. docs/MIGRATION.md).
-- ═══════════════════════════════════════════════════════════════

-- pg_net потрібен для сповіщень у Telegram. Якщо його немає — усе інше працює.
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net недоступне — Telegram-сповіщення вимкнені';
end $$;


-- ───────────────────────────────────────────────
--  КОМАНДА МАГАЗИНУ (менеджери та адміністратори)
--  Доступ видається за email: людина входить у manager.html
--  кодом на цю пошту — і бачить панель.
-- ───────────────────────────────────────────────
create table if not exists public.staff (
  email            text primary key check (email = lower(email)),
  name             text,
  role             text not null default 'manager' check (role in ('admin', 'manager')),
  active           boolean not null default true,
  telegram_chat_id text,
  notify           boolean not null default true,
  created_at       timestamptz not null default now()
);

create or replace function public.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where email = public.current_email() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where email = public.current_email() and active and role = 'admin')
$$;

-- Хто я: для панелі менеджера
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', public.current_email(),
    'is_staff', s.email is not null,
    'role', s.role,
    'name', s.name
  )
  from (select 1) x
  left join public.staff s on s.email = public.current_email() and s.active
$$;


-- ───────────────────────────────────────────────
--  НАЛАШТУВАННЯ (токен Telegram-бота тощо) — лише для адміністраторів
-- ───────────────────────────────────────────────
create table if not exists public.app_settings (
  key   text primary key,
  value text
);


-- ───────────────────────────────────────────────
--  КЛІЄНТИ
-- ───────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key default auth.uid(),
  email      text,
  name       text,
  phone      text,
  city       text,
  branch     text,
  delivery   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ───────────────────────────────────────────────
--  УЛЮБЛЕНЦІ
-- ───────────────────────────────────────────────
create table if not exists public.pets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null,
  species    text,
  gender     text,
  breed      text,
  birth      date,
  age_text   text,
  weight     numeric,
  sterilized text,
  activity   text,
  allergies  text[] not null default '{}',
  food_pref  text,
  notes      text,
  photo      text,              -- data:image/jpeg;base64,… (стиснуте до 320px)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pets_owner_idx on public.pets(owner_id);


-- ───────────────────────────────────────────────
--  АВТОДОСТАВКИ (підписки на корм)
-- ───────────────────────────────────────────────
create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  num             text not null,
  owner_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  pet_id          uuid references public.pets(id) on delete set null,
  pet_name        text,
  items           jsonb not null default '[]',   -- [{id, name, price, image, qty}]
  freq            int not null check (freq between 7 and 180),
  next_date       date,
  paused_until    date,
  status          text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  portion         numeric,
  delivery        text,
  address         text,
  comment         text,
  -- pending — клієнт щось змінив, менеджер ще не підтвердив; confirmed — підтверджено
  manager_status  text not null default 'pending' check (manager_status in ('pending', 'confirmed')),
  manager_comment text,
  last_action     text,
  action_at       timestamptz,   -- змінюється лише при діях людини (не при автозсуві дат)
  history         jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists subs_owner_idx on public.subscriptions(owner_id);
create index if not exists subs_next_idx  on public.subscriptions(next_date) where status = 'active';


-- ───────────────────────────────────────────────
--  ЗАМОВЛЕННЯ (з checkout.html для клієнтів, що увійшли)
-- ───────────────────────────────────────────────
create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  num        text not null,
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  items      jsonb not null default '[]',
  delivery   text,
  payment    text,
  contact    jsonb,
  comment    text,
  status     text not null default 'pending' check (status in ('pending', 'confirmed', 'sent', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists orders_owner_idx on public.orders(owner_id);


-- ───────────────────────────────────────────────
--  НОТАТКИ МЕНЕДЖЕРІВ ПРО КЛІЄНТА / УЛЮБЛЕНЦЯ (клієнт їх не бачить)
-- ───────────────────────────────────────────────
create table if not exists public.staff_notes (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  pet_id     uuid references public.pets(id) on delete cascade,
  author     text not null default public.current_email(),
  text       text not null,
  created_at timestamptz not null default now()
);


-- ───────────────────────────────────────────────
--  ПОДІЇ = СПОВІЩЕННЯ ДЛЯ МЕНЕДЖЕРІВ
--  Створюються лише тригерами, клієнт напряму сюди не пише.
-- ───────────────────────────────────────────────
create table if not exists public.events (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind in ('subscription', 'pet', 'order', 'client')),
  owner_id        uuid references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  pet_id          uuid references public.pets(id) on delete set null,
  order_id        uuid references public.orders(id) on delete set null,
  actor_role      text not null,     -- client | staff
  actor_email     text,
  action          text not null,
  snapshot        jsonb,
  created_at      timestamptz not null default now(),
  handled_by      text,
  handled_at      timestamptz
);
create index if not exists events_open_idx on public.events(created_at desc) where handled_at is null;


-- ═══════════════════════════════════════════════
--  ТРИГЕРИ
-- ═══════════════════════════════════════════════

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists pets_touch on public.pets;
create trigger pets_touch before update on public.pets
  for each row execute function public.touch_updated_at();

-- Надсилання в Telegram: усім активним менеджерам з chat_id + у груповий чат.
-- Помилки не блокують збереження даних клієнта.
create or replace function public.notify_telegram(msg text) returns void
language plpgsql security definer set search_path = public as $$
declare
  token text;
  chat  text;
begin
  select value into token from public.app_settings where key = 'telegram_bot_token';
  if coalesce(token, '') = '' then return; end if;
  for chat in
    select telegram_chat_id from public.staff
      where active and notify and coalesce(telegram_chat_id, '') <> ''
    union
    select value from public.app_settings
      where key = 'telegram_group_chat_id' and coalesce(value, '') <> ''
  loop
    begin
      perform net.http_post(
        url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
        body    := jsonb_build_object('chat_id', chat, 'text', msg, 'disable_web_page_preview', true),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    exception when others then
      raise warning 'Telegram notify failed: %', sqlerrm;
    end;
  end loop;
end $$;

-- Тестове повідомлення з панелі (кнопка «Перевірити» в налаштуваннях)
create or replace function public.send_test_notification() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Лише для адміністратора'; end if;
  perform public.notify_telegram('✅ Тест: сповіщення панелі менеджера «Щасливі лапки» працюють. Надіслав ' || public.current_email());
end $$;

-- Записати подію (+ Telegram, якщо дію зробив клієнт)
drop function if exists public.log_event(text, uuid, text, jsonb, uuid, uuid, uuid);
create or replace function public.log_event(
  p_kind text, p_owner uuid, p_action text, p_snapshot jsonb,
  p_sub uuid default null, p_pet uuid default null, p_order uuid default null,
  p_details text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  staff_actor boolean := public.is_staff();
  client_name text;
  url text;
  icon text;
begin
  insert into public.events (kind, owner_id, subscription_id, pet_id, order_id,
                             actor_role, actor_email, action, snapshot, handled_by, handled_at)
  values (p_kind, p_owner, p_sub, p_pet, p_order,
          case when staff_actor then 'staff' else 'client' end,
          public.current_email(), p_action, p_snapshot,
          case when staff_actor then public.current_email() end,
          case when staff_actor then now() end);

  if not staff_actor then
    select coalesce(nullif(name, ''), email) || coalesce(', ' || nullif(phone, ''), '')
      into client_name from public.profiles where id = p_owner;
    select value into url from public.app_settings where key = 'manager_url';
    icon := case p_kind when 'subscription' then '🔁' when 'pet' then '🐾' when 'order' then '🛒' else '👤' end;
    perform public.notify_telegram(
      icon || ' ' || p_action
      || coalesce(E'\n' || nullif(p_details, ''), '')
      || coalesce(E'\n👤 ' || client_name, '')
      || coalesce(E'\n\n' || nullif(url, ''), '')
    );
  end if;
end $$;

-- Автодоставки: статус підтвердження + подія при кожній дії людини
create or replace function public.subscriptions_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if public.is_staff() then
    if tg_op = 'INSERT' or new.action_at is distinct from old.action_at then
      new.manager_status := 'confirmed';
    end if;
  else
    -- клієнт не може сам «підтвердити» свою автодоставку чи змінити коментар менеджера
    if tg_op = 'INSERT' then
      new.manager_status := 'pending';
      new.manager_comment := null;
    else
      new.owner_id := old.owner_id;
      new.manager_comment := old.manager_comment;
      new.manager_status := case when new.action_at is distinct from old.action_at
                                 then 'pending' else old.manager_status end;
    end if;
  end if;
  return new;
end $$;

create or replace function public.subscriptions_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pet_label text;
  details text;
begin
  if tg_op = 'INSERT' or new.action_at is distinct from old.action_at then
    select name into pet_label from public.pets where id = new.pet_id;
    select string_agg('• ' || (i ->> 'name') || ' × ' || (i ->> 'qty'), E'\n')
      into details from jsonb_array_elements(new.items) i;
    details := concat_ws(E'\n', details,
      case new.status
        when 'active' then '📅 Наступна відправка: ' || to_char(new.next_date, 'DD.MM.YYYY') || ', кожні ' || new.freq || ' дн.'
        when 'paused' then '⏸ Пауза' || coalesce(' до ' || to_char(new.paused_until, 'DD.MM.YYYY'), '')
        else '❌ Скасована' end,
      '📦 ' || nullif(concat_ws(', ',
        case new.delivery when 'nova_poshta' then 'Нова Пошта (відділення)'
                          when 'nova_poshta_courier' then 'Нова Пошта (кур''єр)'
                          when 'pickup' then 'Самовивіз' end,
        nullif(new.address, '')), ''),
      '💬 ' || nullif(new.comment, ''));
    perform public.log_event(
      'subscription', new.owner_id,
      'Автодоставка ' || new.num || coalesce(' (' || coalesce(pet_label, new.pet_name) || ')', '')
        || ': ' || coalesce(new.last_action, case when tg_op = 'INSERT' then 'нова' else 'зміни' end),
      to_jsonb(new) - 'history', new.id, new.pet_id, null, details);
  end if;
  return null;
end $$;

drop trigger if exists subscriptions_before on public.subscriptions;
create trigger subscriptions_before before insert or update on public.subscriptions
  for each row execute function public.subscriptions_before();
drop trigger if exists subscriptions_after on public.subscriptions;
create trigger subscriptions_after after insert or update on public.subscriptions
  for each row execute function public.subscriptions_after();

-- Улюбленці: новий / змінений профіль / видалення
create or replace function public.pets_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('pet', new.owner_id, 'Новий улюбленець: ' || new.name,
                             to_jsonb(new) - 'photo', null, new.id, null);
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'photo' - 'updated_at') is distinct from (to_jsonb(old) - 'photo' - 'updated_at') then
      perform public.log_event('pet', new.owner_id, 'Оновлено профіль улюбленця: ' || new.name,
                               to_jsonb(new) - 'photo', null, new.id, null);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_event('pet', old.owner_id, 'Видалено профіль улюбленця: ' || old.name,
                             to_jsonb(old) - 'photo', null, null, null);
  end if;
  return null;
end $$;

drop trigger if exists pets_after on public.pets;
create trigger pets_after after insert or update or delete on public.pets
  for each row execute function public.pets_after();

-- Замовлення
create or replace function public.orders_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  total numeric;
begin
  select coalesce(sum((i ->> 'price')::numeric * (i ->> 'qty')::numeric), 0)
    into total from jsonb_array_elements(new.items) i;
  perform public.log_event('order', new.owner_id,
    'Нове замовлення ' || new.num || ' на ' || replace(to_char(total, 'FM999,999,990'), ',', ' ') || ' грн',
    to_jsonb(new), null, null, new.id);
  return null;
end $$;

drop trigger if exists orders_after on public.orders;
create trigger orders_after after insert on public.orders
  for each row execute function public.orders_after();

-- Новий клієнт зареєструвався
create or replace function public.profiles_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    perform public.log_event('client', new.id, 'Новий клієнт у кабінеті: ' || coalesce(new.email, ''),
                             to_jsonb(new), null, null, null);
  end if;
  return null;
end $$;

drop trigger if exists profiles_after on public.profiles;
create trigger profiles_after after insert on public.profiles
  for each row execute function public.profiles_after();


-- ═══════════════════════════════════════════════
--  ПРАВА ДОСТУПУ (Row Level Security)
--  Клієнт бачить і змінює лише своє. Менеджер — усе.
-- ═══════════════════════════════════════════════
alter table public.staff         enable row level security;
alter table public.app_settings  enable row level security;
alter table public.profiles      enable row level security;
alter table public.pets          enable row level security;
alter table public.subscriptions enable row level security;
alter table public.orders        enable row level security;
alter table public.staff_notes   enable row level security;
alter table public.events        enable row level security;

-- staff
drop policy if exists staff_read  on public.staff;
drop policy if exists staff_admin on public.staff;
create policy staff_read  on public.staff for select to authenticated using (public.is_staff());
create policy staff_admin on public.staff for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- app_settings
drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
drop policy if exists profiles_own   on public.profiles;
drop policy if exists profiles_staff on public.profiles;
create policy profiles_own   on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff on public.profiles for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- pets
drop policy if exists pets_own   on public.pets;
drop policy if exists pets_staff on public.pets;
create policy pets_own   on public.pets for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pets_staff on public.pets for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- subscriptions
drop policy if exists subs_own   on public.subscriptions;
drop policy if exists subs_staff on public.subscriptions;
create policy subs_own   on public.subscriptions for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy subs_staff on public.subscriptions for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- orders: клієнт створює й читає свої, змінює статус лише менеджер
drop policy if exists orders_own_read   on public.orders;
drop policy if exists orders_own_insert on public.orders;
drop policy if exists orders_staff      on public.orders;
create policy orders_own_read   on public.orders for select to authenticated using (owner_id = auth.uid());
create policy orders_own_insert on public.orders for insert to authenticated with check (owner_id = auth.uid() and status = 'pending');
create policy orders_staff      on public.orders for all    to authenticated using (public.is_staff()) with check (public.is_staff());

-- staff_notes / events — лише команда
drop policy if exists notes_staff  on public.staff_notes;
drop policy if exists events_staff on public.events;
create policy notes_staff  on public.staff_notes for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy events_staff on public.events      for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.whoami() to authenticated;
grant execute on function public.send_test_notification() to authenticated;
revoke execute on function public.notify_telegram(text) from public, anon, authenticated;
revoke execute on function public.log_event(text, uuid, text, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;


-- ═══════════════════════════════════════════════
--  МИТТЄВІ СПОВІЩЕННЯ В ПАНЕЛІ (Supabase Realtime)
-- ═══════════════════════════════════════════════
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;


-- ═══════════════════════════════════════════════
--  ПЕРШИЙ АДМІНІСТРАТОР
--  Замініть email на свій і запустіть цей рядок окремо (один раз):
--
--  insert into public.staff (email, name, role) values ('your@email.com', 'Власник', 'admin');
--
--  Далі інших менеджерів додавайте в панелі: manager.html → «Команда».
-- ═══════════════════════════════════════════════
