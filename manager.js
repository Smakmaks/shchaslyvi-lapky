/* ═══════════════════════════════════════════════════════
   manager.js — Панель менеджера Щасливих лапок
   Улюбленці, автодоставки, клієнти, замовлення та сповіщення
   про дії клієнтів. Кілька облікових записів: доступ мають
   адреси зі списку «Команда» (таблиця staff).
   Усі дані — через window.Api (api.js).
   ═══════════════════════════════════════════════════════ */
'use strict';

const CFG = window.SHOP_CONFIG || {};
const DISCOUNT = (typeof CFG.subscriptionDiscount === 'number' ? CFG.subscriptionDiscount : 7) / 100;
const POLL_MS = 60000;

const speciesEmoji = { cat:'🐱', dog:'🐶', rabbit:'🐰', rodent:'🐹', bird:'🦜', fish:'🐠', other:'🐾' };
const speciesLabel = { cat:'Кіт / кішка', dog:'Собака', rabbit:'Кролик', rodent:'Гризун', bird:'Птах', fish:'Риба', other:'Інше' };
const genderLabel  = { m:'Хлопчик', f:'Дівчинка' };
const activityLabel = { low:'Низька', mid:'Середня', high:'Висока' };
const deliveryLabel = { nova_poshta:'Нова Пошта (відділення)', nova_poshta_courier:"Нова Пошта (кур'єр)", pickup:'Самовивіз' };
const statusLabel = { active:'Активна', paused:'На паузі', cancelled:'Скасована' };
const orderStatusLabel = { pending:'Очікує', confirmed:'Підтверджено', sent:'Відправлено', done:'Виконано', cancelled:'Скасовано' };
const paymentLabel = { card_prepay:'Карткою онлайн', cash_on_delivery:'Накладений платіж', transfer:'Переказ на карту', telegram:'Обговорити в Telegram' };
const kindIcon = { subscription:'🔁', pet:'🐾', order:'🛒', client:'👤' };

/* ══════════════════════════════
   УТИЛІТИ
══════════════════════════════ */
function $(id) { return document.getElementById(id); }
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function money(n) { return Math.round(n).toLocaleString('uk-UA') + ' грн'; }
function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function today() { return toDateStr(new Date()); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); }
function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
function fmtDate(s, withYear) {
  if (!s) return '—';
  const opts = { day: 'numeric', month: 'long' };
  if (withYear || parseDate(s).getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return parseDate(s).toLocaleDateString('uk-UA', opts);
}
function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function inDays(s) {
  const n = daysBetween(today(), s);
  if (n === 0) return 'сьогодні';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчора';
  if (n < 0) return Math.abs(n) + ' ' + plural(Math.abs(n), 'день', 'дні', 'днів') + ' тому';
  return 'через ' + n + ' ' + plural(n, 'день', 'дні', 'днів');
}
function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'щойно';
  if (min < 60) return min + ' хв тому';
  const h = Math.round(min / 60);
  if (h < 24) return h + ' год тому';
  return fmtDateTime(iso);
}
function freqLabel(days) {
  const map = { 7:'щотижня', 14:'кожні 2 тижні', 21:'кожні 3 тижні', 28:'кожні 4 тижні', 30:'щомісяця', 42:'кожні 6 тижнів', 60:'кожні 2 місяці', 90:'кожні 3 місяці' };
  return map[days] || ('кожні ' + days + ' ' + plural(days, 'день', 'дні', 'днів'));
}
function petAge(pet) {
  if (!pet.birth) return pet.age || '';
  const b = parseDate(pet.birth), now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months--;
  if (months < 0) return '';
  if (months < 12) return months + ' міс.';
  const y = Math.floor(months / 12), m = months % 12;
  return y + ' ' + plural(y, 'рік', 'роки', 'років') + (m ? ' ' + m + ' міс.' : '');
}
function subTotals(sub) {
  const full = (sub.items || []).reduce((s, i) => s + i.price * i.qty, 0);
  const total = Math.round(full * (1 - DISCOUNT));
  return { full, total, perMonth: sub.freq ? Math.round(total * 30 / sub.freq) : total };
}
function telLink(phone) {
  return phone ? `<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}" class="link" onclick="event.stopPropagation()">${esc(phone)}</a>` : '<span class="muted">—</span>';
}

/* ── Toasts, звук, сповіщення браузера ── */
function toast(title, sub, onClick) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = esc(title) + (sub ? `<small>${esc(sub)}</small>` : '');
  el.addEventListener('click', () => { el.remove(); if (onClick) onClick(); });
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), onClick ? 9000 : 3500);
}
function errToast(e) {
  console.error(e);
  toast('⚠️ Помилка збереження', (e && e.message) || 'Перевірте інтернет і спробуйте ще раз');
}
let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.15 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.15 + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.15);
      o.stop(audioCtx.currentTime + i * 0.15 + 0.3);
    });
  } catch {}
}
function browserNotify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(title, { body, tag: 'shl-' + Date.now() });
    n.onclick = () => { window.focus(); switchTab('events'); n.close(); };
  } catch {}
}

/* ══════════════════════════════
   СТАН
══════════════════════════════ */
let me = null;
let D = { profiles: [], pets: [], subs: [], orders: [] };
let events = [];
let profileById = new Map(), petById = new Map();
let maxEventId = null;
const freshIds = new Set();

function index() {
  profileById = new Map(D.profiles.map(p => [p.id, p]));
  petById = new Map(D.pets.map(p => [p.id, p]));
}
function clientName(ownerId) {
  const p = profileById.get(ownerId);
  return p ? (p.name || p.email || 'Клієнт') : 'Клієнт';
}
function ownerPets(id) { return D.pets.filter(p => p.ownerId === id); }
function ownerSubs(id) { return D.subs.filter(s => s.ownerId === id); }
function petSubs(id) { return D.subs.filter(s => s.petId === id); }
function avatarHtml(pet) {
  if (pet && pet.photo) return `<img src="${esc(pet.photo)}" alt="">`;
  return speciesEmoji[pet && pet.species] || '🐾';
}
function subPetLabel(sub) {
  const pet = petById.get(sub.petId);
  return pet ? (speciesEmoji[pet.species] || '🐾') + ' ' + pet.name : (sub.petName ? '🐾 ' + sub.petName : '');
}

/* ══════════════════════════════
   ЗАВАНТАЖЕННЯ ДАНИХ
══════════════════════════════ */
let loading = false;
async function loadData(silent) {
  if (loading) return;
  loading = true;
  try {
    const [data, ev] = await Promise.all([Api.loadAll(), Api.listEvents(300)]);
    D = data;
    index();
    const prevMax = maxEventId;
    events = ev;
    const newest = events.reduce((m, e) => Math.max(m, e.id), 0);
    if (prevMax !== null) {
      events.filter(e => e.id > prevMax).reverse().forEach(e => {
        freshIds.add(e.id);
        if (e.actorRole === 'client' && !e.handledAt) announce(e);
      });
    }
    maxEventId = Math.max(newest, prevMax || 0);
    renderAll();
  } catch (e) {
    if (!silent) errToast(e);
    else console.error(e);
  } finally {
    loading = false;
  }
}

function announce(ev) {
  const who = clientName(ev.ownerId);
  toast((kindIcon[ev.kind] || '🔔') + ' ' + ev.action, who + ' · натисніть, щоб відкрити', () => openEventTarget(ev));
  beep();
  browserNotify('Щасливі лапки: ' + ev.action, who);
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => loadData(true), 700);
}

/* ══════════════════════════════
   НАВІГАЦІЯ
══════════════════════════════ */
function switchTab(name) {
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (!btn || btn.hidden) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  history.replaceState(null, '', '#' + name);
  if (name === 'team') loadTeam();
}
document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));
$('bell-btn').addEventListener('click', () => {
  switchTab('events');
  setSeg('ev-seg', 'open');
  evFilter = 'open';
  renderEvents();
});

function setSeg(id, v) {
  document.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}

/* ══════════════════════════════
   РЕНДЕР: ЗАГАЛЬНЕ
══════════════════════════════ */
function renderAll() {
  renderStats();
  renderEvents();
  renderShip();
  renderSubs();
  renderPets();
  renderClients();
  renderOrders();
}

function renderStats() {
  const open = events.filter(e => !e.handledAt);
  const pending = D.subs.filter(s => s.managerStatus === 'pending' && s.status !== 'cancelled');
  $('st-events').textContent = open.length;
  $('st-events-sub').textContent = pending.length ? pending.length + ' ' + plural(pending.length, 'автодоставка чекає', 'автодоставки чекають', 'автодоставок чекають') + ' підтвердження' : 'Усе опрацьовано';

  const horizon = addDays(today(), 7);
  const ship = D.subs.filter(s => s.status === 'active' && s.nextDate && s.nextDate <= horizon);
  const overdue = ship.filter(s => s.nextDate < today()).length;
  const todayCnt = ship.filter(s => s.nextDate === today()).length;
  $('st-ship').textContent = ship.length;
  $('st-ship-sub').textContent = (overdue ? overdue + ' прострочено · ' : '') + todayCnt + ' на сьогодні';

  const active = D.subs.filter(s => s.status === 'active');
  const perMonth = active.reduce((sum, s) => sum + subTotals(s).perMonth, 0);
  $('st-subs').textContent = active.length;
  $('st-subs-sub').textContent = '≈ ' + money(perMonth) + ' / міс';

  $('st-clients').textContent = D.profiles.length + ' / ' + D.pets.length;
  const week = D.profiles.filter(p => p.createdAt && (Date.now() - new Date(p.createdAt)) < 7 * 86400000).length;
  $('st-clients-sub').textContent = week ? '+' + week + ' за тиждень' : 'зареєстровано';

  // Бейджі
  const n = open.length;
  $('bell-badge').hidden = n === 0;
  $('bell-badge').textContent = n > 99 ? '99+' : n;
  $('tab-count-events').hidden = n === 0;
  $('tab-count-events').textContent = n;
  const due = ship.filter(s => s.nextDate <= today()).length;
  $('tab-count-ship').hidden = due === 0;
  $('tab-count-ship').textContent = due;
  document.title = (n ? '(' + n + ') ' : '') + 'Панель менеджера — Щасливі лапки';
}

/* ══════════════════════════════
   СПОВІЩЕННЯ
══════════════════════════════ */
let evFilter = 'open';
document.querySelectorAll('#ev-seg button').forEach(b => b.addEventListener('click', () => {
  evFilter = b.dataset.v; setSeg('ev-seg', evFilter); renderEvents();
}));
$('ev-kind').addEventListener('change', renderEvents);

function filteredEvents() {
  const kind = $('ev-kind').value;
  return events.filter(e => (evFilter === 'all' || !e.handledAt) && (!kind || e.kind === kind));
}

function renderEvents() {
  const list = $('events-list');
  const items = filteredEvents();
  list.innerHTML = '';
  $('ev-all-btn').hidden = !items.some(e => !e.handledAt);
  if (!items.length) {
    list.innerHTML = `<div class="empty"><div>🎉</div>${evFilter === 'open' ? 'Нових сповіщень немає — усе опрацьовано.' : 'Подій ще немає.'}</div>`;
    return;
  }
  items.slice(0, 150).forEach(ev => list.appendChild(eventCard(ev)));
}

function eventCard(ev) {
  const el = document.createElement('div');
  el.className = 'event' + (!ev.handledAt ? ' is-open' : '') + (freshIds.has(ev.id) ? ' is-new' : '');
  freshIds.delete(ev.id);
  const p = profileById.get(ev.ownerId);
  const sub = ev.subId ? D.subs.find(s => s.id === ev.subId) : null;

  let details = '';
  if (ev.kind === 'subscription') {
    const s = ev.snapshot || {};
    const items = (s.items || []).map(i => `• ${i.name} × ${i.qty}`).join('\n');
    const when = s.status === 'active' ? '📅 Наступна відправка: ' + fmtDate(s.next_date) + ', ' + freqLabel(s.freq)
      : s.status === 'paused' ? '⏸ Пауза' + (s.paused_until ? ' до ' + fmtDate(s.paused_until) : '') : '❌ Скасована';
    details = [items, when].filter(Boolean).join('\n');
  } else if (ev.kind === 'order') {
    details = ((ev.snapshot || {}).items || []).map(i => `• ${i.name} × ${i.qty}`).join('\n');
  }

  const who = ev.actorRole === 'staff' ? ' · 🧑‍💼 ' + esc(ev.actorEmail || 'менеджер') : '';
  const handled = ev.handledAt ? ` · ✓ ${esc(ev.handledBy || '')}` : '';
  el.innerHTML = `
    <div class="event__icon">${kindIcon[ev.kind] || '🔔'}</div>
    <div class="event__body">
      <div class="event__title">${esc(ev.action)}</div>
      <div class="event__meta">${esc(p ? (p.name || p.email) : 'Клієнт')}${p && p.phone ? ' · ' + telLink(p.phone) : ''} · ${esc(timeAgo(ev.createdAt))}${who}${handled}</div>
      ${details ? `<div class="event__details">${esc(details)}</div>` : ''}
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" data-a="open">Відкрити</button>
        ${sub && sub.managerStatus === 'pending' && sub.status !== 'cancelled' ? '<button class="btn btn-lime btn-sm" data-a="confirm">✓ Підтвердити автодоставку</button>' : ''}
        ${ev.handledAt ? '<button class="btn btn-ghost btn-sm" data-a="reopen">↩ Повернути в нові</button>' : '<button class="btn btn-ghost btn-sm" data-a="done">✓ Опрацьовано</button>'}
      </div>
    </div>`;
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'open') openEventTarget(ev);
    if (a.dataset.a === 'confirm') quickConfirm(sub);
    if (a.dataset.a === 'done' || a.dataset.a === 'reopen') {
      const handled = a.dataset.a === 'done';
      try {
        await Api.setEventHandled([ev.id], handled, me.email);
        ev.handledAt = handled ? new Date().toISOString() : null;
        ev.handledBy = handled ? me.email : null;
        renderStats(); renderEvents();
      } catch (err) { errToast(err); }
    }
  });
  return el;
}

$('ev-all-btn').addEventListener('click', async () => {
  const ids = filteredEvents().filter(e => !e.handledAt).map(e => e.id);
  if (!ids.length || !confirm(`Позначити ${ids.length} ${plural(ids.length, 'сповіщення', 'сповіщення', 'сповіщень')} опрацьованими?`)) return;
  try {
    await Api.setEventHandled(ids, true, me.email);
    const now = new Date().toISOString();
    events.forEach(e => { if (ids.includes(e.id)) { e.handledAt = now; e.handledBy = me.email; } });
    renderStats(); renderEvents();
  } catch (err) { errToast(err); }
});

function openEventTarget(ev) {
  if (ev.kind === 'pet' && ev.petId && petById.get(ev.petId)) return openPet(ev.petId);
  if (ev.kind === 'subscription' && ev.subId) {
    const sub = D.subs.find(s => s.id === ev.subId);
    if (sub) return openClient(sub.ownerId, sub.id);
  }
  if (ev.ownerId && profileById.get(ev.ownerId)) return openClient(ev.ownerId);
  toast('Запис уже видалено');
}

/* Сповіщення в браузері */
if ('Notification' in window && Notification.permission === 'default') $('push-btn').hidden = false;
$('push-btn').addEventListener('click', async () => {
  const r = await Notification.requestPermission();
  $('push-btn').hidden = r !== 'default';
  if (r === 'granted') toast('🔔 Сповіщення увімкнено', 'Прийдуть, навіть коли вкладка у фоні');
});

/* ══════════════════════════════
   ДІЇ З АВТОДОСТАВКОЮ
══════════════════════════════ */
async function staffCommit(sub, text) {
  const at = new Date().toISOString();
  const action = 'Магазин: ' + text;
  sub.lastAction = action;
  sub.actionAt = at;
  sub.history = [...(sub.history || []), { at, text: action }].slice(-30);
  try {
    const saved = await Api.staffUpdateSub(sub);
    Object.assign(sub, saved);
    // менеджер відреагував — сповіщення про цю автодоставку вважаємо опрацьованими
    const ids = events.filter(e => e.subId === sub.id && !e.handledAt).map(e => e.id);
    if (ids.length) {
      await Api.setEventHandled(ids, true, me.email);
      events.forEach(e => { if (ids.includes(e.id)) { e.handledAt = at; e.handledBy = me.email; } });
    }
    toast('✅ Збережено', 'Клієнт побачить зміни у своєму кабінеті');
  } catch (e) {
    errToast(e);
    await loadData(true);
  }
  renderAll();
  refreshOpenModals();
}

function quickConfirm(sub) {
  if (!sub) return;
  staffCommit(sub, 'автодоставку підтверджено');
}

function markShipped(sub) {
  const shipped = sub.nextDate;
  let next = addDays(shipped, sub.freq);
  while (next <= today()) next = addDays(next, sub.freq);
  if (!confirm(`Позначити відправку ${fmtDate(shipped)} для «${clientName(sub.ownerId)}» як виконану?\nНаступна: ${fmtDate(next)}.`)) return;
  sub.nextDate = next;
  staffCommit(sub, `відправлено ${fmtDate(shipped, true)}, наступна відправка — ${fmtDate(next, true)}`);
}

function shipText(sub) {
  const p = profileById.get(sub.ownerId) || {};
  const t = subTotals(sub);
  return [
    `${sub.num} · ${subPetLabel(sub)}`,
    [p.name, p.phone].filter(Boolean).join(', '),
    [deliveryLabel[sub.delivery], sub.address].filter(Boolean).join(', '),
    ...(sub.items || []).map(i => `• ${i.name} × ${i.qty}`),
    `Сума зі знижкою: ${money(t.total)}`,
    sub.comment ? 'Коментар: ' + sub.comment : ''
  ].filter(Boolean).join('\n');
}

/* ── Модалка редагування автодоставки ── */
let smSub = null;
function openSubModal(sub) {
  smSub = sub;
  $('sub-modal-title').textContent = 'Автодоставка ' + sub.num + ' · ' + clientName(sub.ownerId);
  $('sm-status').value = sub.status;
  $('sm-freq').value = sub.freq;
  $('sm-next').value = sub.nextDate || '';
  $('sm-paused').value = sub.pausedUntil || '';
  $('sm-delivery').value = sub.delivery || 'nova_poshta';
  $('sm-address').value = sub.address || '';
  $('sm-comment').value = sub.managerComment || '';
  toggleSmFields();
  openModal('sub-modal');
}
function toggleSmFields() {
  $('sm-next-wrap').hidden = $('sm-status').value === 'cancelled';
  $('sm-paused-wrap').hidden = $('sm-status').value !== 'paused';
}
$('sm-status').addEventListener('change', toggleSmFields);

$('sm-save-btn').addEventListener('click', () => {
  const sub = smSub;
  if (!sub) return;
  const status = $('sm-status').value;
  const freq = parseInt($('sm-freq').value, 10);
  const next = $('sm-next').value;
  const paused = $('sm-paused').value;
  if (!(freq >= 7 && freq <= 180)) { toast('Частота — від 7 до 180 днів'); return; }
  if (status === 'active' && !next) { toast('Вкажіть дату наступної відправки'); return; }

  const changes = [];
  if (status !== sub.status) changes.push('статус — ' + statusLabel[status].toLowerCase());
  if (freq !== sub.freq) changes.push('частота — ' + freqLabel(freq));
  if (status !== 'cancelled' && next !== sub.nextDate) changes.push('наступна відправка — ' + fmtDate(next, true));
  if (status === 'paused' && paused !== (sub.pausedUntil || '')) changes.push(paused ? 'пауза до ' + fmtDate(paused, true) : 'пауза безстрокова');
  if ($('sm-delivery').value !== sub.delivery || $('sm-address').value.trim() !== (sub.address || '')) changes.push('доставка');
  const comment = $('sm-comment').value.trim();
  if (comment !== (sub.managerComment || '')) changes.push('коментар');

  sub.status = status;
  sub.freq = freq;
  if (status !== 'cancelled') sub.nextDate = next;
  sub.pausedUntil = status === 'paused' && paused ? paused : undefined;
  sub.delivery = $('sm-delivery').value;
  sub.address = $('sm-address').value.trim();
  sub.managerComment = comment;
  closeModal('sub-modal');
  staffCommit(sub, changes.length ? changes.join(', ') : 'автодоставку підтверджено');
});

/* ══════════════════════════════
   КАРТКА АВТОДОСТАВКИ
══════════════════════════════ */
function subCard(sub, opts) {
  opts = opts || {};
  const p = profileById.get(sub.ownerId) || {};
  const t = subTotals(sub);
  const pending = sub.managerStatus === 'pending' && sub.status !== 'cancelled';
  const el = document.createElement('div');
  el.className = 'row-card' + (pending ? ' is-pending' : '') + (sub.status === 'cancelled' ? ' is-cancelled' : '');
  el.dataset.sub = sub.id;

  const chip = `<span class="chip chip-${sub.status}">${statusLabel[sub.status]}</span>`;
  const pendChip = pending ? '<span class="chip chip-pending">Чекає підтвердження</span>' : '';
  let when = '—';
  if (sub.status === 'active') when = `${esc(fmtDate(sub.nextDate))} <span class="muted">(${esc(inDays(sub.nextDate))})</span>`;
  if (sub.status === 'paused') when = sub.pausedUntil ? 'пауза до ' + esc(fmtDate(sub.pausedUntil)) : 'пауза безстрокова';
  const overdue = sub.status === 'active' && sub.nextDate && sub.nextDate < today();

  const hist = (sub.history || []).slice().reverse().slice(0, 12)
    .map(h => `<li>${esc(fmtDateTime(h.at))} — ${esc(h.text)}</li>`).join('');

  el.innerHTML = `
    <div class="row-head">
      <div class="grow">
        <div class="row-title">${opts.hideClient ? esc(subPetLabel(sub) || 'Автодоставка') : esc(p.name || p.email || 'Клієнт') + (subPetLabel(sub) ? ' · ' + esc(subPetLabel(sub)) : '')}</div>
        <div class="row-sub">${esc(sub.num)}${opts.hideClient ? '' : ' · ' + telLink(p.phone)}${sub.lastAction ? ' · ' + esc(sub.lastAction) + (sub.actionAt ? ', ' + esc(timeAgo(sub.actionAt)) : '') : ''}</div>
      </div>
      <div class="btn-row">${pendChip}${chip}</div>
    </div>
    <div class="kv">
      <div><span>Наступна відправка</span><b style="${overdue ? 'color:var(--red)' : ''}">${when}</b></div>
      <div><span>Частота</span>${esc(freqLabel(sub.freq))}</div>
      <div><span>Доставка</span>${esc([deliveryLabel[sub.delivery], sub.address].filter(Boolean).join(', ') || '—')}</div>
      <div><span>Сума / доставку</span><b>${esc(money(t.total))}</b> <em class="muted" style="font-style:normal">≈ ${esc(money(t.perMonth))}/міс</em></div>
    </div>
    <div class="items">${(sub.items || []).map(i => `• <b>${esc(i.name)}</b> × ${i.qty} — ${esc(money(i.price * i.qty))}`).join('<br>') || '—'}</div>
    ${sub.comment ? `<div class="small" style="margin-bottom:10px">💬 Клієнт: ${esc(sub.comment)}</div>` : ''}
    ${sub.managerComment ? `<div class="note-mgr">🧑‍💼 Для клієнта: ${esc(sub.managerComment)}</div>` : ''}
    <div class="btn-row">
      ${pending ? '<button class="btn btn-lime btn-sm" data-a="confirm">✓ Підтвердити</button>' : ''}
      ${sub.status === 'active' && sub.nextDate <= addDays(today(), 3) ? '<button class="btn btn-lime btn-sm" data-a="shipped">📦 Відправлено</button>' : ''}
      <button class="btn btn-ghost btn-sm" data-a="edit">✏️ Змінити</button>
      <button class="btn btn-ghost btn-sm" data-a="copy">📋 Копіювати</button>
      ${opts.hideClient ? '' : '<button class="btn btn-ghost btn-sm" data-a="client">👤 Клієнт</button>'}
    </div>
    ${hist ? `<details class="small muted" style="margin-top:10px"><summary style="cursor:pointer">Історія</summary><ul style="list-style:none;margin-top:6px;display:flex;flex-direction:column;gap:3px">${hist}</ul></details>` : ''}`;

  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'confirm') quickConfirm(sub);
    if (a.dataset.a === 'shipped') markShipped(sub);
    if (a.dataset.a === 'edit') openSubModal(sub);
    if (a.dataset.a === 'client') openClient(sub.ownerId, sub.id);
    if (a.dataset.a === 'copy') {
      navigator.clipboard.writeText(shipText(sub)).then(() => toast('📋 Скопійовано', 'Дані для відправки в буфері обміну'), () => toast('Не вдалося скопіювати'));
    }
  });
  return el;
}

/* ══════════════════════════════
   ВІДПРАВКИ
══════════════════════════════ */
let shipRange = 7;
document.querySelectorAll('#ship-seg button').forEach(b => b.addEventListener('click', () => {
  shipRange = parseInt(b.dataset.v, 10); setSeg('ship-seg', b.dataset.v); renderShip();
}));

function renderShip() {
  const box = $('ship-list');
  box.innerHTML = '';
  const t = today();
  const horizon = addDays(t, shipRange);
  const subs = D.subs.filter(s => s.status === 'active' && s.nextDate && s.nextDate <= horizon)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  if (!subs.length) {
    box.innerHTML = `<div class="empty"><div>🚚</div>На найближчі ${shipRange} днів відправок немає.</div>`;
    return;
  }
  const groups = new Map();
  subs.forEach(s => {
    const key = s.nextDate < t ? 'overdue' : s.nextDate;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });
  groups.forEach((list, key) => {
    const head = document.createElement('div');
    const sum = list.reduce((x, s) => x + subTotals(s).total, 0);
    head.className = 'date-head' + (key === 'overdue' ? ' overdue' : '');
    head.innerHTML = key === 'overdue'
      ? `⚠️ Дата минула — відправлено? <small>${list.length} · позначте «Відправлено» або перенесіть</small>`
      : `${esc(fmtDate(key))} <small>${esc(inDays(key))} · ${list.length} ${plural(list.length, 'відправка', 'відправки', 'відправок')} · ${esc(money(sum))}</small>`;
    box.appendChild(head);
    const wrap = document.createElement('div');
    wrap.className = 'list';
    list.forEach(s => wrap.appendChild(subCard(s)));
    box.appendChild(wrap);
  });
}

/* ══════════════════════════════
   АВТОДОСТАВКИ
══════════════════════════════ */
['subs-q', 'subs-status', 'subs-pending'].forEach(id => $(id).addEventListener('input', renderSubs));

function renderSubs() {
  const q = $('subs-q').value.trim().toLowerCase();
  const st = $('subs-status').value;
  const onlyPending = $('subs-pending').checked;
  const rank = { active: 0, paused: 1, cancelled: 2 };
  const list = D.subs.filter(s => {
    if (st === 'live' && s.status === 'cancelled') return false;
    if (!['live', 'all'].includes(st) && s.status !== st) return false;
    if (onlyPending && !(s.managerStatus === 'pending' && s.status !== 'cancelled')) return false;
    if (!q) return true;
    const p = profileById.get(s.ownerId) || {};
    const hay = [s.num, p.name, p.email, p.phone, subPetLabel(s), s.address, ...(s.items || []).map(i => i.name)].join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a, b) =>
    ((b.managerStatus === 'pending') - (a.managerStatus === 'pending')) ||
    (rank[a.status] - rank[b.status]) ||
    String(a.nextDate).localeCompare(String(b.nextDate)));

  const box = $('subs-list');
  box.innerHTML = '';
  if (!list.length) { box.innerHTML = '<div class="empty"><div>🔁</div>Нічого не знайдено.</div>'; return; }
  list.forEach(s => box.appendChild(subCard(s)));
}

/* ══════════════════════════════
   УЛЮБЛЕНЦІ
══════════════════════════════ */
['pets-q', 'pets-species', 'pets-nosub'].forEach(id => $(id).addEventListener('input', renderPets));

function petMeta(pet) {
  return [pet.species ? speciesLabel[pet.species] : '', pet.breed, petAge(pet), pet.weight ? pet.weight + ' кг' : ''].filter(Boolean).join(' · ');
}

function renderPets() {
  const q = $('pets-q').value.trim().toLowerCase();
  const sp = $('pets-species').value;
  const noSub = $('pets-nosub').checked;
  const grid = $('pets-grid');
  grid.innerHTML = '';
  const list = D.pets.filter(pet => {
    if (sp && pet.species !== sp) return false;
    const live = petSubs(pet.id).filter(s => s.status !== 'cancelled');
    if (noSub && live.length) return false;
    if (!q) return true;
    const p = profileById.get(pet.ownerId) || {};
    return [pet.name, pet.breed, p.name, p.email, p.phone, ...(pet.allergies || [])].join(' ').toLowerCase().includes(q);
  });
  if (!list.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div>🐾</div>Нічого не знайдено.</div>'; return; }
  list.forEach(pet => {
    const live = petSubs(pet.id).filter(s => s.status !== 'cancelled');
    const next = live.filter(s => s.status === 'active').sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pet-card';
    card.innerHTML = `
      <div class="pet-head">
        <div class="avatar">${avatarHtml(pet)}</div>
        <div style="min-width:0">
          <div style="font-weight:700">${esc(pet.name)}</div>
          <div class="small muted">${esc(petMeta(pet)) || '—'}</div>
        </div>
      </div>
      <div class="small">👤 ${esc(clientName(pet.ownerId))}</div>
      ${(pet.allergies || []).length ? `<div class="tags">${pet.allergies.map(a => `<span class="tag tag-red">${esc(a)}</span>`).join('')}</div>` : ''}
      <div class="small muted">${next ? '🔁 Наступна доставка: ' + esc(fmtDate(next.nextDate)) : live.length ? '⏸ Автодоставка на паузі' : '— без автодоставки'}</div>`;
    card.addEventListener('click', () => openPet(pet.id));
    grid.appendChild(card);
  });
}

let openPetId = null;
let petEditing = false;
function openPet(id) {
  openPetId = id;
  petEditing = false;
  renderPetModal();
  openModal('pet-modal');
}

function renderPetModal() {
  const pet = petById.get(openPetId);
  const body = $('pet-modal-body');
  if (!pet) { body.innerHTML = '<p class="muted">Профіль видалено.</p>'; return; }
  const p = profileById.get(pet.ownerId) || {};

  if (petEditing) {
    body.innerHTML = `
      <h3>Редагування: ${esc(pet.name)}</h3>
      <div class="form-grid">
        <div class="form-grid form-row-3">
          <div class="field"><label>Ім'я</label><input id="pe-name" value="${esc(pet.name)}"></div>
          <div class="field"><label>Вид</label><select id="pe-species">${['', ...Object.keys(speciesLabel)].map(k => `<option value="${k}" ${pet.species === k ? 'selected' : ''}>${k ? esc(speciesLabel[k]) : '—'}</option>`).join('')}</select></div>
          <div class="field"><label>Стать</label><select id="pe-gender"><option value="">—</option><option value="m" ${pet.gender === 'm' ? 'selected' : ''}>Хлопчик</option><option value="f" ${pet.gender === 'f' ? 'selected' : ''}>Дівчинка</option></select></div>
        </div>
        <div class="form-grid form-row-3">
          <div class="field"><label>Порода</label><input id="pe-breed" value="${esc(pet.breed)}"></div>
          <div class="field"><label>Дата народження</label><input type="date" id="pe-birth" value="${esc(pet.birth)}"></div>
          <div class="field"><label>Вага, кг</label><input type="number" step="0.1" min="0" id="pe-weight" value="${esc(pet.weight)}"></div>
        </div>
        <div class="form-grid form-row-2">
          <div class="field"><label>Стерилізація</label><select id="pe-steril"><option value="">—</option><option value="yes" ${pet.sterilized === 'yes' ? 'selected' : ''}>Так</option><option value="no" ${pet.sterilized === 'no' ? 'selected' : ''}>Ні</option></select></div>
          <div class="field"><label>Активність</label><select id="pe-activity"><option value="">—</option>${Object.entries(activityLabel).map(([k, v]) => `<option value="${k}" ${pet.activity === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Алергії (через кому)</label><input id="pe-allergies" value="${esc((pet.allergies || []).join(', '))}"></div>
        <div class="field"><label>Улюблена їжа</label><input id="pe-food" value="${esc(pet.foodPref)}"></div>
        <div class="field"><label>Нотатки (бачить і клієнт)</label><textarea id="pe-notes">${esc(pet.notes)}</textarea></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="pe-cancel">Скасувати</button>
        <button class="btn btn-lime" id="pe-save">Зберегти</button>
      </div>`;
    $('pe-cancel').addEventListener('click', () => { petEditing = false; renderPetModal(); });
    $('pe-save').addEventListener('click', async () => {
      const name = $('pe-name').value.trim();
      if (!name) { toast("Вкажіть ім'я"); return; }
      const upd = {
        ...pet, name,
        species: $('pe-species').value, gender: $('pe-gender').value, breed: $('pe-breed').value.trim(),
        birth: $('pe-birth').value, age: $('pe-birth').value ? '' : pet.age, weight: $('pe-weight').value,
        sterilized: $('pe-steril').value, activity: $('pe-activity').value,
        allergies: $('pe-allergies').value.split(',').map(s => s.trim()).filter(Boolean),
        foodPref: $('pe-food').value.trim(), notes: $('pe-notes').value.trim()
      };
      try {
        await Api.staffUpdatePet(upd);
        Object.assign(pet, upd);
        petEditing = false;
        toast('✅ Профіль оновлено');
        renderAll();
        renderPetModal();
      } catch (e) { errToast(e); }
    });
    return;
  }

  const rows = [
    ['Вид', pet.species ? speciesEmoji[pet.species] + ' ' + speciesLabel[pet.species] : ''],
    ['Стать', genderLabel[pet.gender]],
    ['Порода', pet.breed],
    ['Вік', petAge(pet) + (pet.birth ? ' (нар. ' + fmtDate(pet.birth, true) + ')' : '')],
    ['Вага', pet.weight ? pet.weight + ' кг' : ''],
    ['Стерилізація', pet.sterilized ? (pet.sterilized === 'yes' ? 'Так' : 'Ні') : ''],
    ['Активність', activityLabel[pet.activity]],
    ['Улюблена їжа', pet.foodPref]
  ].filter(([, v]) => v && String(v).trim());

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding-right:40px">
      <div class="avatar lg">${avatarHtml(pet)}</div>
      <div style="min-width:0">
        <h3 style="margin:0;padding:0">${esc(pet.name)}</h3>
        <div class="small muted">Власник: <button class="link" id="pm-owner">${esc(p.name || p.email || 'Клієнт')}</button> · ${telLink(p.phone)}</div>
        <div class="hint">Додано ${esc(fmtDateTime(pet.createdAt))}</div>
      </div>
    </div>
    <div class="kv">${rows.map(([l, v]) => `<div><span>${esc(l)}</span>${esc(v)}</div>`).join('')}</div>
    ${(pet.allergies || []).length ? `<div class="sec-label">Алергії / протипоказання</div><div class="tags">${pet.allergies.map(a => `<span class="tag tag-red">${esc(a)}</span>`).join('')}</div>` : ''}
    ${pet.notes ? `<div class="sec-label">Нотатки клієнта</div><div class="small" style="white-space:pre-line">${esc(pet.notes)}</div>` : ''}
    <div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost btn-sm" id="pm-edit">✏️ Редагувати профіль</button></div>
    <div class="sec-label">Автодоставки</div>
    <div class="list" id="pm-subs"></div>
    <div class="sec-label">Внутрішні нотатки команди (клієнт не бачить)</div>
    <div id="pm-notes"></div>`;
  $('pm-owner').addEventListener('click', () => openClient(pet.ownerId));
  $('pm-edit').addEventListener('click', () => { petEditing = true; renderPetModal(); });
  const subsBox = $('pm-subs');
  const ps = petSubs(pet.id);
  if (ps.length) ps.forEach(s => subsBox.appendChild(subCard(s, { hideClient: true })));
  else subsBox.innerHTML = '<div class="small muted">Немає. Можна запропонувати клієнту автодоставку зі знижкою.</div>';
  renderNotes($('pm-notes'), pet.ownerId, pet.id);
}

/* ══════════════════════════════
   КЛІЄНТИ
══════════════════════════════ */
$('clients-q').addEventListener('input', renderClients);

function renderClients() {
  const q = $('clients-q').value.trim().toLowerCase();
  const body = $('clients-body');
  body.innerHTML = '';
  const list = D.profiles.filter(p => {
    if (!q) return true;
    const petNames = ownerPets(p.id).map(x => x.name).join(' ');
    return [p.name, p.email, p.phone, p.city, petNames].join(' ').toLowerCase().includes(q);
  });
  if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:28px">Нічого не знайдено</td></tr>'; return; }
  list.forEach(p => {
    const pets = ownerPets(p.id);
    const subs = ownerSubs(p.id);
    const active = subs.filter(s => s.status === 'active').length;
    const pending = subs.filter(s => s.managerStatus === 'pending' && s.status !== 'cancelled').length;
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `
      <td><b>${esc(p.name || '—')}</b><div class="hint">${esc(p.email)}</div></td>
      <td>${telLink(p.phone)}</td>
      <td>${esc(p.city || '—')}</td>
      <td>${pets.map(x => esc((speciesEmoji[x.species] || '🐾') + ' ' + x.name)).join(', ') || '<span class="muted">—</span>'}</td>
      <td>${active}${pending ? ' <span class="chip chip-pending">' + pending + ' чекає</span>' : ''}</td>
      <td class="muted">${p.createdAt ? esc(new Date(p.createdAt).toLocaleDateString('uk-UA')) : '—'}</td>`;
    tr.addEventListener('click', () => openClient(p.id));
    body.appendChild(tr);
  });
}

let openClientId = null;
let clientEditing = false;
function openClient(id, focusSubId) {
  openClientId = id;
  clientEditing = false;
  renderClientModal();
  openModal('client-modal');
  if (focusSubId) {
    const inModal = $('client-modal').querySelector('[data-sub="' + focusSubId + '"]');
    if (inModal) setTimeout(() => inModal.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
}

function renderClientModal() {
  const p = profileById.get(openClientId);
  const body = $('client-modal-body');
  if (!p) { body.innerHTML = '<p class="muted">Клієнта не знайдено.</p>'; return; }

  if (clientEditing) {
    body.innerHTML = `
      <h3>Контакти: ${esc(p.name || p.email)}</h3>
      <div class="form-grid">
        <div class="form-grid form-row-2">
          <div class="field"><label>Ім'я</label><input id="ce-name" value="${esc(p.name)}"></div>
          <div class="field"><label>Телефон</label><input id="ce-phone" value="${esc(p.phone)}"></div>
        </div>
        <div class="form-grid form-row-3">
          <div class="field"><label>Доставка</label><select id="ce-delivery">${Object.entries(deliveryLabel).map(([k, v]) => `<option value="${k}" ${p.delivery === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label>Місто</label><input id="ce-city" value="${esc(p.city)}"></div>
          <div class="field"><label>Відділення / адреса</label><input id="ce-branch" value="${esc(p.branch)}"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="ce-cancel">Скасувати</button>
        <button class="btn btn-lime" id="ce-save">Зберегти</button>
      </div>`;
    $('ce-cancel').addEventListener('click', () => { clientEditing = false; renderClientModal(); });
    $('ce-save').addEventListener('click', async () => {
      const upd = { ...p, name: $('ce-name').value.trim(), phone: $('ce-phone').value.trim(), delivery: $('ce-delivery').value, city: $('ce-city').value.trim(), branch: $('ce-branch').value.trim() };
      try {
        await Api.staffUpdateProfile(upd);
        Object.assign(p, upd);
        clientEditing = false;
        toast('✅ Контакти оновлено');
        renderAll();
        renderClientModal();
      } catch (e) { errToast(e); }
    });
    return;
  }

  const orders = D.orders.filter(o => o.ownerId === p.id);
  body.innerHTML = `
    <h3>${esc(p.name || p.email || 'Клієнт')}</h3>
    <div class="kv">
      <div><span>Телефон</span>${telLink(p.phone)}</div>
      <div><span>Email</span>${p.email ? `<a class="link" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '—'}</div>
      <div><span>Доставка</span>${esc([deliveryLabel[p.delivery], p.city, p.branch].filter(Boolean).join(', ') || '—')}</div>
      <div><span>У кабінеті з</span>${p.createdAt ? esc(new Date(p.createdAt).toLocaleDateString('uk-UA')) : '—'}</div>
    </div>
    <div class="btn-row"><button class="btn btn-ghost btn-sm" id="cm-edit">✏️ Редагувати контакти</button></div>

    <div class="sec-label">Улюбленці</div>
    <div class="grid" id="cm-pets"></div>
    <div class="sec-label">Автодоставки</div>
    <div class="list" id="cm-subs"></div>
    <div class="sec-label">Замовлення</div>
    <div id="cm-orders"></div>
    <div class="sec-label">Внутрішні нотатки команди (клієнт не бачить)</div>
    <div id="cm-notes"></div>`;
  $('cm-edit').addEventListener('click', () => { clientEditing = true; renderClientModal(); });

  const petsBox = $('cm-pets');
  const pets = ownerPets(p.id);
  if (!pets.length) petsBox.innerHTML = '<div class="small muted">Ще не додав улюбленців.</div>';
  pets.forEach(pet => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'pet-card';
    c.innerHTML = `<div class="pet-head"><div class="avatar">${avatarHtml(pet)}</div><div><div style="font-weight:700">${esc(pet.name)}</div><div class="small muted">${esc(petMeta(pet)) || '—'}</div></div></div>
      ${(pet.allergies || []).length ? `<div class="tags">${pet.allergies.map(a => `<span class="tag tag-red">${esc(a)}</span>`).join('')}</div>` : ''}`;
    c.addEventListener('click', () => openPet(pet.id));
    petsBox.appendChild(c);
  });

  const subsBox = $('cm-subs');
  const subs = ownerSubs(p.id).sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled'));
  if (!subs.length) subsBox.innerHTML = '<div class="small muted">Немає автодоставок.</div>';
  subs.forEach(s => subsBox.appendChild(subCard(s, { hideClient: true })));

  $('cm-orders').innerHTML = orders.length
    ? orders.map(o => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${esc(o.num)}</b> · ${esc(new Date(o.date).toLocaleDateString('uk-UA'))} · ${esc(money(o.items.reduce((s, i) => s + i.price * i.qty, 0)))} · ${esc(orderStatusLabel[o.status] || o.status)}</div>`).join('')
    : '<div class="small muted">Замовлень через сайт ще не було.</div>';

  renderNotes($('cm-notes'), p.id, null);
}

/* ── Нотатки команди ── */
async function renderNotes(box, ownerId, petId) {
  box.innerHTML = '<div class="small muted">Завантаження…</div>';
  let notes = [];
  try { notes = await Api.listNotes(ownerId); } catch (e) { box.innerHTML = '<div class="small muted">Не вдалося завантажити нотатки.</div>'; return; }
  if (petId) notes = notes.filter(n => n.petId === petId);
  box.innerHTML = `
    <div class="notes">${notes.map(n => `
      <div class="note">${esc(n.text)}
        <small><span>${esc(n.author)} · ${esc(fmtDateTime(n.createdAt))}${!petId && n.petId && petById.get(n.petId) ? ' · про ' + esc(petById.get(n.petId).name) : ''}</span>
        <button class="link" data-del="${n.id}" style="color:var(--fg3)">видалити</button></small>
      </div>`).join('') || '<div class="small muted">Поки немає.</div>'}</div>
    <div class="note-form"><input type="text" placeholder="Напр.: просила дзвонити після 18:00; любить Brit Care" maxlength="500"><button class="btn btn-ghost btn-sm">Додати</button></div>`;
  const input = box.querySelector('.note-form input');
  const add = async () => {
    const text = input.value.trim();
    if (!text) return;
    try { await Api.addNote(ownerId, petId, text); renderNotes(box, ownerId, petId); } catch (e) { errToast(e); }
  };
  box.querySelector('.note-form button').addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Видалити нотатку?')) return;
    try { await Api.deleteNote(Number(b.dataset.del)); renderNotes(box, ownerId, petId); } catch (e) { errToast(e); }
  }));
}

/* ══════════════════════════════
   ЗАМОВЛЕННЯ
══════════════════════════════ */
['orders-q', 'orders-status'].forEach(id => $(id).addEventListener('input', renderOrders));

function renderOrders() {
  const q = $('orders-q').value.trim().toLowerCase();
  const st = $('orders-status').value;
  const box = $('orders-list');
  box.innerHTML = '';
  const list = D.orders.filter(o => {
    if (st && o.status !== st) return false;
    if (!q) return true;
    const p = profileById.get(o.ownerId) || {};
    return [o.num, p.name, p.email, p.phone, (o.contact || {}).name, (o.contact || {}).phone, ...o.items.map(i => i.name)].join(' ').toLowerCase().includes(q);
  });
  if (!list.length) { box.innerHTML = '<div class="empty"><div>🛒</div>Замовлень немає. Тут з\'являються замовлення клієнтів, які увійшли в кабінет.</div>'; return; }
  list.forEach(o => {
    const p = profileById.get(o.ownerId) || {};
    const c = o.contact || {};
    const total = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    const el = document.createElement('div');
    el.className = 'row-card' + (o.status === 'pending' ? ' is-pending' : '');
    el.innerHTML = `
      <div class="row-head">
        <div class="grow">
          <div class="row-title">${esc(o.num)} · ${esc(money(total))}</div>
          <div class="row-sub">${esc(fmtDateTime(o.date))} · <button class="link" data-a="client">${esc(c.name || p.name || p.email || 'Клієнт')}</button> · ${telLink(c.phone || p.phone)}</div>
        </div>
        <select data-a="status" style="padding:6px 10px;border-radius:8px;border:1.5px solid var(--border2);background:var(--bg2);color:var(--fg);font-family:inherit">
          ${Object.entries(orderStatusLabel).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="items">${o.items.map(i => `• <b>${esc(i.name)}</b> × ${i.qty} — ${esc(money(i.price * i.qty))}`).join('<br>')}</div>
      <div class="small muted">${esc([deliveryLabel[o.delivery], c.city, c.branch].filter(Boolean).join(', '))}${o.payment ? ' · ' + esc(paymentLabel[o.payment] || o.payment) : ''}${o.comment ? '<br>💬 ' + esc(o.comment) : ''}</div>`;
    el.querySelector('[data-a="client"]').addEventListener('click', () => openClient(o.ownerId));
    el.querySelector('[data-a="status"]').addEventListener('change', async e => {
      try { await Api.setOrderStatus(o.id, e.target.value); o.status = e.target.value; toast('✅ Статус оновлено'); renderOrders(); }
      catch (err) { errToast(err); e.target.value = o.status; }
    });
    box.appendChild(el);
  });
}

/* ══════════════════════════════
   КОМАНДА (адміністратор)
══════════════════════════════ */
let settingsCache = {};
async function loadTeam() {
  if (!me || me.role !== 'admin') return;
  $('mgr-url-hint').textContent = location.origin + location.pathname;
  try {
    const [staff, settings] = await Promise.all([Api.listStaff(), Api.getSettings()]);
    settingsCache = settings;
    renderStaff(staff);
    const tok = settings.telegram_bot_token || '';
    $('set-token').value = '';
    $('set-token-hint').textContent = tok ? 'Токен збережено (…' + tok.slice(-4) + '). Залиште поле порожнім, щоб не змінювати.' : 'Токен ще не задано — Telegram-сповіщення вимкнені.';
    $('set-group').value = settings.telegram_group_chat_id || '';
    $('set-url').value = settings.manager_url || (location.origin + location.pathname);
  } catch (e) { errToast(e); }
}

function renderStaff(staff) {
  const body = $('staff-body');
  body.innerHTML = '';
  staff.forEach(s => {
    const self = s.email === me.email;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${esc(s.email)}</b>${self ? ' <span class="chip chip-info">це ви</span>' : ''}</td>
      <td><input type="text" data-f="name" value="${esc(s.name)}"></td>
      <td><select data-f="role" ${self ? 'disabled' : ''}><option value="manager" ${s.role === 'manager' ? 'selected' : ''}>Менеджер</option><option value="admin" ${s.role === 'admin' ? 'selected' : ''}>Адміністратор</option></select></td>
      <td><input type="text" data-f="chat" value="${esc(s.telegramChatId)}" placeholder="123456789"></td>
      <td style="text-align:center"><input type="checkbox" data-f="notify" ${s.notify ? 'checked' : ''}></td>
      <td style="text-align:center"><input type="checkbox" data-f="active" ${s.active ? 'checked' : ''} ${self ? 'disabled' : ''}></td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-a="save">💾</button> ${self ? '' : '<button class="btn btn-danger btn-sm" data-a="del">🗑</button>'}</td>`;
    tr.querySelector('[data-a="save"]').addEventListener('click', async () => {
      try {
        await Api.saveStaff({
          email: s.email,
          name: tr.querySelector('[data-f="name"]').value.trim(),
          role: tr.querySelector('[data-f="role"]').value,
          telegramChatId: tr.querySelector('[data-f="chat"]').value.trim(),
          notify: tr.querySelector('[data-f="notify"]').checked,
          active: tr.querySelector('[data-f="active"]').checked
        });
        toast('✅ Збережено');
      } catch (e) { errToast(e); }
    });
    const del = tr.querySelector('[data-a="del"]');
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Забрати доступ у ${s.email}?`)) return;
      try { await Api.deleteStaff(s.email); loadTeam(); } catch (e) { errToast(e); }
    });
    body.appendChild(tr);
  });
}

$('ns-add-btn').addEventListener('click', async () => {
  const email = $('ns-email').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Введіть коректний email'); return; }
  try {
    await Api.saveStaff({ email, name: $('ns-name').value.trim(), role: $('ns-role').value });
    $('ns-email').value = ''; $('ns-name').value = '';
    toast('✅ Доступ надано', email + ' може входити в панель');
    loadTeam();
  } catch (e) { errToast(e); }
});

$('set-save-btn').addEventListener('click', async () => {
  const data = {
    telegram_group_chat_id: $('set-group').value.trim(),
    manager_url: $('set-url').value.trim()
  };
  const tok = $('set-token').value.trim();
  if (tok) data.telegram_bot_token = tok;
  try { await Api.saveSettings(data); toast('✅ Налаштування збережено'); loadTeam(); } catch (e) { errToast(e); }
});
$('set-test-btn').addEventListener('click', async () => {
  try {
    await Api.sendTestNotification();
    toast('📨 Надіслано', 'Якщо не прийшло — перевірте токен, chat ID і що ви написали боту /start');
  } catch (e) { errToast(e); }
});

/* ══════════════════════════════
   МОДАЛКИ
══════════════════════════════ */
function openModal(id) {
  const el = $(id);
  document.body.appendChild(el);   // остання відкрита — поверх інших
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).hidden = true;
  if (id === 'client-modal') openClientId = null;
  if (id === 'pet-modal') openPetId = null;
  if (!document.querySelector('.modal-overlay:not([hidden])')) document.body.style.overflow = '';
}
function refreshOpenModals() {
  if (openClientId && !$('client-modal').hidden && !clientEditing) renderClientModal();
  if (openPetId && !$('pet-modal').hidden && !petEditing) renderPetModal();
}
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('.modal-close') || e.target.matches('[data-close]')) closeModal(ov.id);
  });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay:not([hidden])')].pop();
  if (open) closeModal(open.id);
});

/* ══════════════════════════════
   ВХІД І ЗАПУСК
══════════════════════════════ */
const root = document.documentElement;
if (localStorage.getItem('theme') === 'light') root.classList.add('light');
$('themeBtn').addEventListener('click', () => {
  root.classList.toggle('light');
  localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
});

function show(view) {
  ['loading-view', 'setup-view', 'auth-view', 'denied-view', 'app'].forEach(id => { $(id).hidden = id !== view; });
}

let authEmail = '';
function authError(msg) { $('auth-err').hidden = !msg; $('auth-err').textContent = msg || ''; }
function friendlyAuthError(e) {
  const m = String((e && e.message) || e || '').toLowerCase();
  if (m.includes('rate') || m.includes('second') || m.includes('too many')) return 'Забагато спроб. Зачекайте хвилину.';
  if (m.includes('expired') || m.includes('invalid') || m.includes('token')) return 'Код невірний або застарів. Запросіть новий.';
  if (m.includes('fetch') || m.includes('network')) return "Немає зв'язку з сервером.";
  return 'Помилка: ' + ((e && e.message) || e);
}
async function sendCode() {
  const email = $('auth-email').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authError('Введіть коректний email'); return; }
  authError('');
  $('auth-send-btn').disabled = true;
  try {
    await Api.sendCode(email);
    authEmail = email;
    $('auth-email-shown').textContent = email;
    $('auth-step-email').hidden = true;
    $('auth-step-code').hidden = false;
    $('auth-code').value = '';
    $('auth-code').focus();
  } catch (e) { authError(friendlyAuthError(e)); }
  finally { $('auth-send-btn').disabled = false; }
}
async function verifyCode() {
  const code = $('auth-code').value.replace(/\D/g, '');
  if (code.length < 6) { authError('Введіть код із листа'); return; }
  authError('');
  $('auth-verify-btn').disabled = true;
  try {
    const s = await Api.verifyCode(authEmail, code);
    await enter(s.user);
  } catch (e) { authError(friendlyAuthError(e)); }
  finally { $('auth-verify-btn').disabled = false; }
}
$('auth-send-btn').addEventListener('click', sendCode);
$('auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') sendCode(); });
$('auth-verify-btn').addEventListener('click', verifyCode);
$('auth-code').addEventListener('keydown', e => { if (e.key === 'Enter') verifyCode(); });
$('auth-resend-btn').addEventListener('click', () => { $('auth-email').value = authEmail; sendCode(); });
$('auth-back-btn').addEventListener('click', () => { authError(''); $('auth-step-code').hidden = true; $('auth-step-email').hidden = false; });
async function logout() { await Api.signOut(); location.reload(); }
$('logout-btn').addEventListener('click', logout);
$('denied-logout').addEventListener('click', logout);

let entered = false;
async function enter(user) {
  if (entered) return;
  entered = true;
  show('loading-view');
  try {
    const who = await Api.whoami();
    if (!who || !who.is_staff) {
      $('denied-email').textContent = user.email;
      $('logout-btn').hidden = false;
      show('denied-view');
      return;
    }
    me = { email: who.email, role: who.role, name: who.name };
    $('me-label').textContent = (me.name ? me.name + ' · ' : '') + me.email + (me.role === 'admin' ? ' · адмін' : '');
    $('bell-btn').hidden = false;
    $('logout-btn').hidden = false;
    $('team-tab-btn').hidden = me.role !== 'admin';
    await loadData(false);
    show('app');
    const h = location.hash.replace('#', '');
    if (h) switchTab(h);

    // Миттєві сповіщення + резервне опитування раз на хвилину
    try { Api.subscribeEvents(() => scheduleReload()); } catch (e) { console.warn('Realtime недоступний', e); }
    setInterval(() => loadData(true), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleReload(); });
    setInterval(renderStats, 60000);
  } catch (e) {
    console.error(e);
    entered = false;
    $('loading-view').textContent = '⚠️ Не вдалося завантажити дані: ' + ((e && e.message) || e);
  }
}

(async function start() {
  if (!window.Api || !Api.enabled) { show('setup-view'); return; }
  try {
    await Api.ready;
    Api.onAuth((evt, session) => { if (evt === 'SIGNED_IN' && session) enter(session.user); });
    const s = await Api.session();
    if (s) await enter(s.user);
    else { show('auth-view'); $('auth-email').focus(); }
  } catch (e) {
    console.error(e);
    $('loading-view').textContent = "⚠️ Немає зв'язку з сервером.";
  }
})();
