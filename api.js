/* ═══════════════════════════════════════════════════════
   api.js — єдиний шар доступу до даних (Supabase).

   Сторінки (cabinet.js, manager.js, checkout.html) працюють лише
   з window.Api і нічого не знають про Supabase. При переїзді на
   власний сервер достатньо переписати цей файл, зберігши ті самі
   методи та формат об'єктів (camelCase) — див. docs/MIGRATION.md.

   Якщо в config.js не заповнено backend.supabaseUrl — Api.enabled
   буде false, і кабінет працює в локальному режимі (localStorage).
   ═══════════════════════════════════════════════════════ */
'use strict';

window.Api = (function () {
  const cfg = ((window.SHOP_CONFIG || {}).backend) || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';

  let sb = null;

  /* Бібліотеку Supabase вантажимо лише коли бекенд налаштовано */
  const ready = !enabled ? Promise.resolve(false) : new Promise((resolve, reject) => {
    const init = () => {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'shl-auth' }
      });
      resolve(true);
    };
    if (window.supabase && window.supabase.createClient) { init(); return; }
    const s = document.createElement('script');
    s.src = LIB_URL;
    s.onload = init;
    s.onerror = () => reject(new Error('Не вдалося завантажити бібліотеку Supabase'));
    document.head.appendChild(s);
  });

  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }

  const nz = v => (v === '' || v === undefined ? null : v);
  const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

  /* ── Перетворення рядків БД ↔ об'єкти сторінок ── */
  const map = {
    petToRow: p => ({
      id: p.id, name: p.name, species: nz(p.species), gender: nz(p.gender), breed: nz(p.breed),
      birth: nz(p.birth), age_text: nz(p.age), weight: num(p.weight), sterilized: nz(p.sterilized),
      activity: nz(p.activity), allergies: p.allergies || [], food_pref: nz(p.foodPref),
      notes: nz(p.notes), photo: nz(p.photo)
    }),
    rowToPet: r => ({
      id: r.id, ownerId: r.owner_id, name: r.name, species: r.species || '', gender: r.gender || '',
      breed: r.breed || '', birth: r.birth || '', age: r.age_text || '',
      weight: r.weight == null ? '' : String(r.weight), sterilized: r.sterilized || '',
      activity: r.activity || '', allergies: r.allergies || [], foodPref: r.food_pref || '',
      notes: r.notes || '', photo: r.photo || null, createdAt: r.created_at, updatedAt: r.updated_at
    }),
    subToRow: s => ({
      id: s.id, num: s.num, pet_id: nz(s.petId), pet_name: nz(s.petName), items: s.items || [],
      freq: s.freq, next_date: nz(s.nextDate), paused_until: nz(s.pausedUntil), status: s.status,
      portion: num(s.portion), delivery: nz(s.delivery), address: nz(s.address), comment: nz(s.comment),
      last_action: nz(s.lastAction), action_at: nz(s.actionAt), history: s.history || []
    }),
    rowToSub: r => ({
      id: r.id, num: r.num, ownerId: r.owner_id, petId: r.pet_id, petName: r.pet_name || '',
      items: r.items || [], freq: r.freq, nextDate: r.next_date || '', pausedUntil: r.paused_until || undefined,
      status: r.status, portion: r.portion, delivery: r.delivery || '', address: r.address || '',
      comment: r.comment || '', managerStatus: r.manager_status, managerComment: r.manager_comment || '',
      lastAction: r.last_action || '', actionAt: r.action_at, history: r.history || [],
      createdAt: r.created_at, updatedAt: r.updated_at
    }),
    rowToProfile: r => ({
      id: r.id, email: r.email || '', name: r.name || '', phone: r.phone || '', city: r.city || '',
      branch: r.branch || '', delivery: r.delivery || '', createdAt: r.created_at
    }),
    rowToOrder: r => ({
      id: r.id, num: r.num, ownerId: r.owner_id, date: r.created_at, status: r.status,
      items: r.items || [], delivery: r.delivery, payment: r.payment, contact: r.contact || {}, comment: r.comment || ''
    }),
    rowToEvent: r => ({
      id: r.id, kind: r.kind, ownerId: r.owner_id, subId: r.subscription_id, petId: r.pet_id, orderId: r.order_id,
      actorRole: r.actor_role, actorEmail: r.actor_email, action: r.action, snapshot: r.snapshot || {},
      createdAt: r.created_at, handledBy: r.handled_by, handledAt: r.handled_at
    }),
    rowToStaff: r => ({
      email: r.email, name: r.name || '', role: r.role, active: r.active,
      telegramChatId: r.telegram_chat_id || '', notify: r.notify, createdAt: r.created_at
    })
  };

  return {
    enabled,
    ready,
    map,

    /* ══════ ВХІД (код на email) ══════ */
    async session() {
      await ready;
      const { data } = await sb.auth.getSession();
      return data.session ? { user: { id: data.session.user.id, email: data.session.user.email } } : null;
    },
    async sendCode(email) {
      await ready;
      await q(sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname }
      }));
    },
    async verifyCode(email, code) {
      await ready;
      const data = await q(sb.auth.verifyOtp({ email, token: code, type: 'email' }));
      return { user: { id: data.user.id, email: data.user.email } };
    },
    async signOut() {
      await ready;
      await sb.auth.signOut();
    },
    onAuth(cb) {
      ready.then(() => sb.auth.onAuthStateChange((evt, session) => {
        cb(evt, session ? { user: { id: session.user.id, email: session.user.email } } : null);
      }));
    },

    /* ══════ КЛІЄНТ ══════ */
    async ensureProfile(user) {
      const rows = await q(sb.from('profiles').select('*').eq('id', user.id));
      if (rows.length) return map.rowToProfile(rows[0]);
      const created = await q(sb.from('profiles').insert({ id: user.id, email: user.email }).select());
      return map.rowToProfile(created[0]);
    },
    async loadMine(userId) {
      const [pets, subs, orders] = await Promise.all([
        q(sb.from('pets').select('*').eq('owner_id', userId).order('created_at')),
        q(sb.from('subscriptions').select('*').eq('owner_id', userId).order('created_at')),
        q(sb.from('orders').select('*').eq('owner_id', userId).order('created_at'))
      ]);
      return { pets: pets.map(map.rowToPet), subs: subs.map(map.rowToSub), orders: orders.map(map.rowToOrder) };
    },
    async saveProfile(userId, p) {
      await q(sb.from('profiles').update({
        name: nz(p.name), phone: nz(p.phone), email: nz(p.email), city: nz(p.city),
        branch: nz(p.branch), delivery: nz(p.delivery)
      }).eq('id', userId));
    },
    async savePet(pet) {
      await q(sb.from('pets').upsert(map.petToRow(pet)));
    },
    async deletePet(id) {
      await q(sb.from('pets').delete().eq('id', id));
    },
    async saveSub(sub) {
      const rows = await q(sb.from('subscriptions').upsert(map.subToRow(sub)).select());
      return map.rowToSub(rows[0]);
    },
    async deleteSub(id) {
      await q(sb.from('subscriptions').delete().eq('id', id));
    },
    async addOrder(order) {
      await ready;
      const { data } = await sb.auth.getSession();
      if (!data.session) return false;
      await q(sb.from('orders').insert({
        num: order.num, items: order.items, delivery: nz(order.delivery), payment: nz(order.payment),
        contact: order.contact || null, comment: nz(order.comment)
      }));
      return true;
    },

    /* ══════ МЕНЕДЖЕР ══════ */
    async whoami() {
      return await q(sb.rpc('whoami'));
    },
    async loadAll() {
      const [profiles, pets, subs, orders] = await Promise.all([
        q(sb.from('profiles').select('*').order('created_at', { ascending: false })),
        q(sb.from('pets').select('*').order('created_at', { ascending: false })),
        q(sb.from('subscriptions').select('*').order('next_date')),
        q(sb.from('orders').select('*').order('created_at', { ascending: false }).limit(500))
      ]);
      return {
        profiles: profiles.map(map.rowToProfile),
        pets: pets.map(map.rowToPet),
        subs: subs.map(map.rowToSub),
        orders: orders.map(map.rowToOrder)
      };
    },
    async listEvents(limit) {
      const rows = await q(sb.from('events').select('*').order('created_at', { ascending: false }).limit(limit || 200));
      return rows.map(map.rowToEvent);
    },
    async setEventHandled(ids, handled, email) {
      await q(sb.from('events').update(handled
        ? { handled_by: email, handled_at: new Date().toISOString() }
        : { handled_by: null, handled_at: null }).in('id', ids));
    },
    async staffUpdateSub(sub) {
      const row = map.subToRow(sub);
      delete row.id;
      const rows = await q(sb.from('subscriptions').update({ ...row, manager_comment: nz(sub.managerComment) }).eq('id', sub.id).select());
      return map.rowToSub(rows[0]);
    },
    async staffUpdatePet(pet) {
      const row = map.petToRow(pet);
      delete row.id;
      await q(sb.from('pets').update(row).eq('id', pet.id));
    },
    async staffUpdateProfile(p) {
      await q(sb.from('profiles').update({
        name: nz(p.name), phone: nz(p.phone), city: nz(p.city), branch: nz(p.branch), delivery: nz(p.delivery)
      }).eq('id', p.id));
    },
    async setOrderStatus(id, status) {
      await q(sb.from('orders').update({ status }).eq('id', id));
    },
    async listNotes(ownerId) {
      const rows = await q(sb.from('staff_notes').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }));
      return rows.map(r => ({ id: r.id, ownerId: r.owner_id, petId: r.pet_id, author: r.author, text: r.text, createdAt: r.created_at }));
    },
    async addNote(ownerId, petId, text) {
      await q(sb.from('staff_notes').insert({ owner_id: ownerId, pet_id: petId || null, text }));
    },
    async deleteNote(id) {
      await q(sb.from('staff_notes').delete().eq('id', id));
    },

    /* Команда (лише адміністратор може змінювати) */
    async listStaff() {
      const rows = await q(sb.from('staff').select('*').order('created_at'));
      return rows.map(map.rowToStaff);
    },
    async saveStaff(s) {
      await q(sb.from('staff').upsert({
        email: s.email.trim().toLowerCase(), name: nz(s.name), role: s.role || 'manager',
        active: s.active !== false, telegram_chat_id: nz(s.telegramChatId), notify: s.notify !== false
      }));
    },
    async deleteStaff(email) {
      await q(sb.from('staff').delete().eq('email', email));
    },
    async getSettings() {
      const rows = await q(sb.from('app_settings').select('*'));
      return Object.fromEntries(rows.map(r => [r.key, r.value]));
    },
    async saveSettings(obj) {
      const rows = Object.entries(obj).map(([key, value]) => ({ key, value: nz(value) }));
      await q(sb.from('app_settings').upsert(rows));
    },
    async sendTestNotification() {
      await q(sb.rpc('send_test_notification'));
    },

    /* Миттєві сповіщення: нові події (Supabase Realtime) */
    subscribeEvents(onInsert) {
      const ch = sb.channel('events-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' },
            payload => onInsert(map.rowToEvent(payload.new)))
        .subscribe();
      return () => sb.removeChannel(ch);
    }
  };
})();
