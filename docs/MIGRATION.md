# Перенесення з Supabase на власний сервер

Система з самого початку побудована так, щоб Supabase можна було замінити без переписування сторінок.

## Що від чого залежить

```
cabinet.html / cabinet.js ─┐
manager.html / manager.js ─┼──► api.js ──► Supabase (PostgreSQL + Auth + Realtime)
checkout.html ─────────────┘
```

- **Сторінки** працюють лише з `window.Api` (методи на кшталт `Api.loadMine()`, `Api.saveSub()`, `Api.listEvents()`)
  та з об'єктами в camelCase (`nextDate`, `petId`, `managerStatus`…). Про Supabase вони нічого не знають.
- **`api.js`** — єдиний файл, що спілкується з Supabase. Тут же перетворення назв полів (`map.*`).
- **`supabase/schema.sql`** — звичайний PostgreSQL: таблиці, тригери, правила доступу.

## Кроки переїзду

1. **База.** Піднімаєте PostgreSQL 15+ на своєму сервері, переносите дані:
   `pg_dump` з Supabase (Project Settings → Database → Connection string) → `psql` на новому сервері.
   `schema.sql` працює і без Supabase; від Supabase в ньому залежать лише:
   - `auth.uid()` і `auth.jwt()` — «хто робить запит». На своєму сервері їх замінює ваш бекенд
     (наприклад, `set_config('request.jwt.claims', …)` перед запитом, як робить PostgREST);
   - ролі `anon` / `authenticated`;
   - `pg_net` у функції `notify_telegram()` — можна замінити надсиланням із бекенду
     (бекенд слухає нові рядки в `events` через `LISTEN/NOTIFY` або раз на хвилину);
   - публікація `supabase_realtime` — замінюється WebSocket/SSE вашого бекенду.
2. **Вхід.** Будь-який механізм «код на email» (власний або сервіс). Користувачі зберігаються в `profiles`,
   менеджери — у `staff` (за email), тож перенести їх просто.
3. **API.** Найпростіше — [PostgREST](https://postgrest.org) (саме його використовує Supabase): ті самі запити, ті самі правила доступу.
   Або власний REST на Node/PHP/Python.
4. **`api.js`.** Переписуєте реалізацію методів під новий API, **зберігаючи їхні назви й формат об'єктів**.
   Сторінки змінювати не треба.
5. **`config.js`.** Замінюєте блок `backend` на адресу свого сервера.

## Перелік методів `Api`, які треба реалізувати

| Група | Методи |
|-------|--------|
| Вхід | `session`, `sendCode`, `verifyCode`, `signOut`, `onAuth` |
| Клієнт | `ensureProfile`, `loadMine`, `saveProfile`, `savePet`, `deletePet`, `saveSub`, `deleteSub`, `addOrder` |
| Менеджер | `whoami`, `loadAll`, `listEvents`, `setEventHandled`, `staffUpdateSub`, `staffUpdatePet`, `staffUpdateProfile`, `setOrderStatus`, `listNotes`, `addNote`, `deleteNote` |
| Адміністратор | `listStaff`, `saveStaff`, `deleteStaff`, `getSettings`, `saveSettings`, `sendTestNotification` |
| Сповіщення | `subscribeEvents(callback)` — може бути й опитуванням раз на N секунд |

Поведінку, яку зараз забезпечують тригери бази (статус «чекає підтвердження», журнал подій, Telegram),
варто лишити в базі — тоді вона переїде разом із `schema.sql` без змін.
