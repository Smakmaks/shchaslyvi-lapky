/* ═══════════════════════════════════════════════════════
   cabinet.js — Кабінет клієнта Щасливих лапок
   Етап 2: кілька улюбленців + керування автодоставкою корму.
   Усе зберігається в localStorage цього браузера; зміни
   автодоставки передаються менеджеру через Telegram.
   ═══════════════════════════════════════════════════════ */
'use strict';

/* ── STORAGE KEYS ── */
const KEY_PETS    = 'cabinet_pets_v2';
const KEY_SUBS    = 'cabinet_subs_v2';
const KEY_PROFILE = 'cabinet_profile_v1';
const KEY_ORDERS  = 'cart_orders_v1';
const KEY_CART    = 'cart_v1';
const KEY_PET_V1  = 'cabinet_pet_v1';   // старий єдиний профіль — мігруємо
const KEY_SUB_V1  = 'cabinet_sub_v1';

const CFG = window.SHOP_CONFIG || {};
const TG_USER = (CFG.telegramUsername || '').replace('@', '');
const DISCOUNT = (typeof CFG.subscriptionDiscount === 'number' ? CFG.subscriptionDiscount : 7) / 100;
const FREQ_OPTIONS = [14, 21, 30, 42, 60, 90];
const PLACEHOLDER_IMG = 'images/product-placeholder.jpg';

/* ── ДОВІДНИКИ ── */
const speciesEmoji = { cat:'🐱', dog:'🐶', rabbit:'🐰', rodent:'🐹', bird:'🦜', fish:'🐠', other:'🐾' };
const speciesLabel = { cat:'Кіт / кішка', dog:'Собака', rabbit:'Кролик', rodent:'Гризун', bird:'Птах', fish:'Риба', other:'Інше' };
const genderLabel  = { m:'Хлопчик', f:'Дівчинка' };
const activityLabel = { low:'Низька', mid:'Середня', high:'Висока' };
const deliveryLabel = {
  nova_poshta: 'Нова Пошта (відділення)',
  nova_poshta_courier: "Нова Пошта (кур'єр)",
  pickup: 'Самовивіз (Дніпро)'
};
const statusLabel = { active:'Активна', paused:'На паузі', cancelled:'Скасована' };

/* ══════════════════════════════
   УТИЛІТИ
══════════════════════════════ */
function $(id) { return document.getElementById(id); }

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
  catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch {
    showToast('⚠️ Не вдалося зберегти: у браузері закінчилось місце');
    return false;
  }
}

function money(n) {
  return Math.round(n).toLocaleString('uk-UA') + ' грн';
}

let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

function tgLink(text) {
  return TG_USER ? 'https://t.me/' + TG_USER + '?text=' + encodeURIComponent(text) : '#';
}

/* ── Дати: працюємо з рядками 'YYYY-MM-DD' у місцевому часі ── */
function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function today() { return toDateStr(new Date()); }
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function fmtDate(s, withYear) {
  const opts = { day: 'numeric', month: 'long' };
  if (withYear || parseDate(s).getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return parseDate(s).toLocaleDateString('uk-UA', opts);
}
function fmtShort(s) {
  return parseDate(s).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
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
  if (n < 0) return Math.abs(n) + ' ' + plural(Math.abs(n), 'день', 'дні', 'днів') + ' тому';
  return 'через ' + n + ' ' + plural(n, 'день', 'дні', 'днів');
}
function freqLabel(days) {
  const map = { 7:'Щотижня', 14:'Кожні 2 тижні', 21:'Кожні 3 тижні', 28:'Кожні 4 тижні', 30:'Щомісяця', 42:'Кожні 6 тижнів', 60:'Кожні 2 місяці', 90:'Кожні 3 місяці' };
  return map[days] || ('Кожні ' + days + ' ' + plural(days, 'день', 'дні', 'днів'));
}

/* ── Вік улюбленця ── */
function petAge(pet) {
  if (!pet.birth) return pet.age || '';
  const b = parseDate(pet.birth), now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months--;
  if (months < 0) return '';
  if (months < 12) return months + ' ' + plural(months, 'місяць', 'місяці', 'місяців');
  const y = Math.floor(months / 12), m = months % 12;
  return y + ' ' + plural(y, 'рік', 'роки', 'років') + (m ? ' ' + m + ' міс.' : '');
}

function daysToBirthday(pet) {
  if (!pet.birth) return null;
  const b = parseDate(pet.birth), now = new Date();
  const t = today();
  let next = toDateStr(new Date(now.getFullYear(), b.getMonth(), b.getDate()));
  if (next < t) next = toDateStr(new Date(now.getFullYear() + 1, b.getMonth(), b.getDate()));
  return daysBetween(t, next);
}

/* ── Вага упаковки з назви товару: «2 кг», «340 г», «10*85 гр» ── */
function parseGrams(name) {
  const s = String(name || '').toLowerCase().replace(/,/g, '.');
  const unit = '(кг|kg|грамм|грам|гр|г|g)(?![a-zа-яіїєґ])';
  const toG = (v, u) => parseFloat(v) * (u === 'кг' || u === 'kg' ? 1000 : 1);
  const multi = s.match(new RegExp('(\\d+)\\s*[x×х*]\\s*(\\d+(?:\\.\\d+)?)\\s*' + unit));
  if (multi) return Math.round(parseInt(multi[1], 10) * toG(multi[2], multi[3]));
  const all = [...s.matchAll(new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + unit, 'g'))];
  if (!all.length) return null;
  const last = all[all.length - 1];       // «для собак від 25 кг … 3 кг» → беремо останнє
  const g = Math.round(toG(last[1], last[2]));
  return g > 0 ? g : null;
}
function fmtWeight(g) {
  return g >= 1000 ? (g / 1000).toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + ' кг' : g + ' г';
}

/* ══════════════════════════════
   ДАНІ
══════════════════════════════ */
let pets = [];
let subs = [];

function loadAll() {
  pets = read(KEY_PETS, null);
  if (!Array.isArray(pets)) {
    pets = [];
    const old = read(KEY_PET_V1, null);
    if (old && old.name) pets.push({ ...old, id: uid(), createdAt: new Date().toISOString() });
    write(KEY_PETS, pets);
  }
  subs = read(KEY_SUBS, []);
  if (!Array.isArray(subs)) subs = [];
  advanceSchedules();
}

function savePets() { return write(KEY_PETS, pets); }
function saveSubs() { return write(KEY_SUBS, subs); }

function getPet(id) { return pets.find(p => p.id === id) || null; }
function getSub(id) { return subs.find(s => s.id === id) || null; }
function petSubs(petId) { return subs.filter(s => s.petId === petId); }

/* Зсуваємо дати, які вже минули: доставка відбулась — чекаємо наступну;
   пауза закінчилась — автодоставка відновлюється. */
function advanceSchedules() {
  const t = today();
  let changed = false;
  subs.forEach(s => {
    if (s.status === 'paused' && s.pausedUntil && s.pausedUntil <= t) {
      s.status = 'active';
      s.nextDate = s.pausedUntil;
      delete s.pausedUntil;
      logHistory(s, 'Пауза завершилась, автодоставку відновлено');
      changed = true;
    }
    if (s.status === 'active' && s.nextDate && s.nextDate < t) {
      while (s.nextDate < t) s.nextDate = addDays(s.nextDate, s.freq);
      changed = true;
    }
  });
  if (changed) saveSubs();
}

function logHistory(sub, text) {
  sub.history = sub.history || [];
  sub.history.push({ at: new Date().toISOString(), text });
  if (sub.history.length > 30) sub.history = sub.history.slice(-30);
}

function loadProfile() { return read(KEY_PROFILE, {}) || {}; }

/* ── Розрахунки автодоставки ── */
function subTotals(sub) {
  const full = (sub.items || []).reduce((sum, i) => sum + i.price * i.qty, 0);
  const total = Math.round(full * (1 - DISCOUNT));
  const perMonth = sub.freq ? Math.round(total * 30 / sub.freq) : total;
  return { full, total, perMonth, saved: full - total };
}

function subGrams(items) {
  let grams = 0, unknown = 0;
  (items || []).forEach(i => {
    const g = parseGrams(i.name);
    if (g) grams += g * i.qty; else unknown++;
  });
  return { grams, unknown };
}

function upcomingDates(sub, count) {
  const out = [];
  if (sub.status === 'cancelled' || !sub.nextDate) return out;
  let d = sub.status === 'paused' ? (sub.pausedUntil || sub.nextDate) : sub.nextDate;
  for (let i = 0; i < count; i++) { out.push(d); d = addDays(d, sub.freq); }
  return out;
}

/* ══════════════════════════════
   КАТАЛОГ (для вибору товарів)
══════════════════════════════ */
let catalog = null;
let catalogPromise = null;

function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch('products.json')
    .then(r => r.ok ? r.json() : [])
    .then(list => {
      const hidden = CFG.hiddenCategories || [];
      catalog = (Array.isArray(list) ? list : []).filter(p => p.price > 0 && !hidden.includes(p.category));
      catalog.forEach(p => { p._q = (p.name + ' ' + p.category + ' ' + (p.sku || '')).toLowerCase(); });
      refreshSubPrices();
      return catalog;
    })
    .catch(() => { catalog = []; return catalog; });
  return catalogPromise;
}

/* Ціни в каталозі змінюються — підтягуємо актуальні в збережені автодоставки */
function refreshSubPrices() {
  if (!catalog || !catalog.length) return;
  const byId = new Map(catalog.map(p => [p.id, p]));
  let changed = false;
  subs.forEach(s => (s.items || []).forEach(i => {
    const p = byId.get(i.id);
    if (p && (p.price !== i.price || p.name !== i.name)) {
      i.price = p.price; i.name = p.name; i.image = p.image || i.image;
      changed = true;
    }
  }));
  if (changed) { saveSubs(); renderAll(); }
}

function searchCatalog(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length || !catalog) return [];
  const res = [];
  for (const p of catalog) {
    if (tokens.every(t => p._q.includes(t))) {
      res.push(p);
      if (res.length >= 40) break;
    }
  }
  return res;
}

/* ══════════════════════════════
   ВКЛАДКИ ТА НАВІГАЦІЯ
══════════════════════════════ */
function switchTab(name) {
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  history.replaceState(null, '', '#' + name);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === 'pets') showPetsList();
  });
});
document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', () => {
    switchTab(el.dataset.goto);
    if (el.dataset.goto === 'pets') showPetsList();
    window.scrollTo({ top: document.querySelector('.tabs').offsetTop - 70, behavior: 'smooth' });
  });
});

/* ══════════════════════════════
   ОГЛЯД
══════════════════════════════ */
function renderOverview() {
  $('ov-pets').textContent = pets.length;
  $('ov-pets-sub').textContent = pets.length ? pets.map(p => p.name).join(', ') : 'Додайте першого';

  const live = subs.filter(s => s.status !== 'cancelled');
  const active = live.filter(s => s.status === 'active');
  $('ov-subs').textContent = live.length;
  const paused = live.length - active.length;
  $('ov-subs-sub').textContent = live.length
    ? active.length + ' ' + plural(active.length, 'активна', 'активні', 'активних') + (paused ? ' · ' + paused + ' на паузі' : '')
    : 'Знижка −' + Math.round(DISCOUNT * 100) + '% на кожну';

  const next = active.filter(s => s.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  if (next) {
    const pet = getPet(next.petId);
    $('ov-next').textContent = fmtShort(next.nextDate);
    $('ov-next-sub').textContent = inDays(next.nextDate) + (pet ? ' · для ' + pet.name : '');
  } else {
    $('ov-next').textContent = '—';
    $('ov-next-sub').textContent = 'Немає запланованих';
  }

  const unsynced = subs.filter(s => !s.synced);
  $('sync-alert').hidden = unsynced.length === 0;
  $('sync-alert-text').textContent = unsynced.length === 1
    ? 'Зміни в автодоставці ще не надіслані менеджеру.'
    : unsynced.length + ' автодоставки мають зміни, не надіслані менеджеру.';
}

/* ══════════════════════════════
   УЛЮБЛЕНЦІ
══════════════════════════════ */
let currentPetId = null;
let editingPetId = null;
let formAllergies = [];
let formPhoto = null;

function avatarHtml(pet) {
  if (pet && pet.photo) return `<img src="${esc(pet.photo)}" alt="${esc(pet.name)}">`;
  return speciesEmoji[pet && pet.species] || '🐾';
}

function petMeta(pet) {
  return [
    pet.species ? speciesLabel[pet.species] : '',
    pet.breed,
    petAge(pet),
    pet.weight ? pet.weight + ' кг' : ''
  ].filter(Boolean).join(' · ');
}

function showView(which) {
  $('pets-list-view').hidden  = which !== 'list';
  $('pet-detail-view').hidden = which !== 'detail';
  $('pet-form-view').hidden   = which !== 'form';
}

function showPetsList() {
  currentPetId = null;
  renderPetGrid();
  showView('list');
}

function renderPetGrid() {
  const grid = $('pet-grid');
  grid.innerHTML = '';

  pets.forEach(pet => {
    const card = document.createElement('button');
    card.className = 'pet-card';
    card.type = 'button';
    const live = petSubs(pet.id).filter(s => s.status !== 'cancelled');
    const next = live.filter(s => s.status === 'active').sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
    let subLine;
    if (next) subLine = `🔁 Наступна доставка: <b style="color:var(--fg)">${esc(fmtShort(next.nextDate))}</b> (${esc(inDays(next.nextDate))})`;
    else if (live.length) subLine = '⏸ Автодоставка на паузі';
    else subLine = '<span style="color:var(--lime)">+ Оформити автодоставку −' + Math.round(DISCOUNT * 100) + '%</span>';

    const bd = daysToBirthday(pet);
    const bdLine = bd !== null && bd <= 30
      ? `<div class="bday">🎂 ${bd === 0 ? 'Сьогодні день народження!' : 'День народження ' + esc(inDays(addDays(today(), bd)))}</div>` : '';

    card.innerHTML = `
      <div class="pet-card__head">
        <div class="pet-avatar sm">${avatarHtml(pet)}</div>
        <div style="min-width:0">
          <div class="pet-card__name">${esc(pet.name)}</div>
          <div class="pet-card__meta">${esc(petMeta(pet)) || 'Заповніть профіль'}</div>
        </div>
      </div>
      <div class="pet-card__foot"><div>${subLine}</div>${bdLine}</div>`;
    card.addEventListener('click', () => openPetDetail(pet.id));
    grid.appendChild(card);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'pet-card pet-add';
  add.innerHTML = pets.length
    ? '<span class="plus">+</span><span>Додати улюбленця</span>'
    : '<span style="font-size:42px">🐶🐱</span><span style="color:var(--fg)">Розкажіть про свого улюбленця</span><span class="small" style="font-weight:400;text-align:center">Ми допоможемо підібрати корм і нагадаємо, коли його поповнити</span><span class="btn btn-lime btn-sm">+ Додати улюбленця</span>';
  add.addEventListener('click', () => openPetForm(null));
  grid.appendChild(add);
}

function openPetDetail(id) {
  const pet = getPet(id);
  if (!pet) { showPetsList(); return; }
  currentPetId = id;

  $('detail-avatar').innerHTML = avatarHtml(pet);
  $('detail-name').textContent = pet.name;
  $('detail-name-2').textContent = pet.name;
  $('detail-meta').textContent = [pet.species ? speciesEmoji[pet.species] + ' ' + speciesLabel[pet.species] : '', genderLabel[pet.gender]].filter(Boolean).join(' · ');

  const bd = daysToBirthday(pet);
  $('detail-bday').hidden = !(bd !== null && bd <= 30);
  if (bd !== null) $('detail-bday').textContent = bd === 0 ? '🎂 Сьогодні день народження!' : '🎂 День народження ' + inDays(addDays(today(), bd));

  const rows = [];
  if (pet.breed) rows.push(['Порода', pet.breed]);
  const age = petAge(pet);
  if (age) rows.push(['Вік', age + (pet.birth ? ' (нар. ' + fmtDate(pet.birth, true) + ')' : '')]);
  if (pet.weight) rows.push(['Вага', pet.weight + ' кг']);
  if (pet.sterilized) rows.push(['Стерилізація', pet.sterilized === 'yes' ? 'Так' : 'Ні']);
  if (pet.activity) rows.push(['Активність', activityLabel[pet.activity]]);
  if (pet.foodPref) rows.push(['Улюблена їжа', pet.foodPref]);
  $('detail-rows').innerHTML = rows.map(([l, v]) =>
    `<div class="info-row"><span class="info-label">${esc(l)}</span><span class="info-val">${esc(v)}</span></div>`).join('');

  const al = pet.allergies || [];
  $('detail-allergies').hidden = !al.length;
  $('detail-allergy-tags').innerHTML = al.map(a => `<span class="allergy-tag">${esc(a)}</span>`).join('');
  $('detail-notes').hidden = !pet.notes;
  $('detail-notes-text').textContent = pet.notes || '';

  $('detail-tg-btn').href = tgLink(petTelegramText(pet));
  $('detail-tg-btn').hidden = !TG_USER;

  const list = $('detail-subs');
  list.innerHTML = '';
  const ps = petSubs(id).sort(subSort);
  if (ps.length) ps.forEach(s => list.appendChild(subCard(s, true)));
  else list.innerHTML = `<div class="card"><div class="empty-state" style="padding:20px"><p class="small">Для ${esc(pet.name)} ще немає автодоставки. Оформіть — і корм приїжджатиме сам, зі знижкою −${Math.round(DISCOUNT * 100)}%.</p></div></div>`;

  showView('detail');
}

function petTelegramText(pet) {
  let msg = `Привіт! Допоможіть підібрати корм для мого улюбленця 🐾\n\nІм'я: ${pet.name}`;
  if (pet.species)    msg += `\nВид: ${speciesLabel[pet.species]}`;
  if (pet.gender)     msg += `\nСтать: ${genderLabel[pet.gender]}`;
  if (pet.breed)      msg += `\nПорода: ${pet.breed}`;
  const age = petAge(pet);
  if (age)            msg += `\nВік: ${age}`;
  if (pet.weight)     msg += `\nВага: ${pet.weight} кг`;
  if (pet.sterilized) msg += `\nСтерилізований: ${pet.sterilized === 'yes' ? 'Так' : 'Ні'}`;
  if (pet.activity)   msg += `\nАктивність: ${activityLabel[pet.activity]}`;
  if (pet.allergies && pet.allergies.length) msg += `\nАлергії: ${pet.allergies.join(', ')}`;
  if (pet.foodPref)   msg += `\nПереваги: ${pet.foodPref}`;
  if (pet.notes)      msg += `\nОсобливості: ${pet.notes}`;
  return msg;
}

$('detail-edit-btn').addEventListener('click', () => openPetForm(currentPetId));
$('detail-new-sub-btn').addEventListener('click', () => openSubEditor(null, currentPetId));
document.querySelector('[data-pet-back]').addEventListener('click', showPetsList);

$('detail-delete-btn').addEventListener('click', () => {
  const pet = getPet(currentPetId);
  if (!pet) return;
  const live = petSubs(pet.id).filter(s => s.status !== 'cancelled');
  const warn = live.length
    ? `\n\nУ ${pet.name} є ${live.length} ${plural(live.length, 'активна автодоставка', 'активні автодоставки', 'активних автодоставок')} — їх буде позначено як скасовані, і ми запропонуємо повідомити менеджера.`
    : '';
  if (!confirm(`Видалити профіль ${pet.name}?${warn}`)) return;
  live.forEach(s => {
    s.status = 'cancelled';
    delete s.pausedUntil;
    markChanged(s, 'Скасовано (профіль улюбленця видалено)');
  });
  const removedSubs = live.slice();
  pets = pets.filter(p => p.id !== pet.id);
  // Скасовані автодоставки лишаються в історії, але без прив'язки до улюбленця
  subs.forEach(s => { if (s.petId === pet.id) { s.petId = null; s.petName = pet.name; } });
  savePets(); saveSubs();
  showPetsList();
  renderAll();
  showToast('Профіль видалено');
  if (removedSubs.length) openSyncModal(removedSubs[0].id);
});

/* ── Форма улюбленця ── */
function openPetForm(id) {
  editingPetId = id;
  const pet = id ? getPet(id) : {};
  $('pet-form-title').textContent = id ? 'Редагування: ' + pet.name : 'Новий улюбленець';
  $('pet-name').value       = pet.name || '';
  $('pet-species').value    = pet.species || '';
  $('pet-gender').value     = pet.gender || '';
  $('pet-breed').value      = pet.breed || '';
  $('pet-birth').value      = pet.birth || '';
  $('pet-birth').max        = today();
  $('pet-age').value        = pet.age || '';
  $('pet-age-legacy-wrap').hidden = !(pet.age && !pet.birth);
  $('pet-weight').value     = pet.weight || '';
  $('pet-sterilized').value = pet.sterilized || '';
  $('pet-activity').value   = pet.activity || '';
  $('pet-food-pref').value  = pet.foodPref || '';
  $('pet-notes').value      = pet.notes || '';
  $('pet-photo-input').value = '';
  formAllergies = pet.allergies ? [...pet.allergies] : [];
  formPhoto = pet.photo || null;
  renderFormAllergies();
  updateFormAvatar();
  showView('form');
  $('pet-name').focus();
}

$('pet-form-cancel').addEventListener('click', () => {
  if (editingPetId) openPetDetail(editingPetId); else showPetsList();
});

function updateFormAvatar() {
  $('form-avatar').innerHTML = avatarHtml({ photo: formPhoto, species: $('pet-species').value, name: '' });
  $('remove-photo-btn').hidden = !formPhoto;
}
$('pet-species').addEventListener('change', updateFormAvatar);

function renderFormAllergies() {
  const wrap = $('allergy-tags');
  wrap.innerHTML = '';
  formAllergies.forEach((a, i) => {
    const tag = document.createElement('span');
    tag.className = 'allergy-tag';
    tag.innerHTML = `${esc(a)} <button type="button" aria-label="Видалити">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      formAllergies.splice(i, 1);
      renderFormAllergies();
    });
    wrap.appendChild(tag);
  });
}

function addAllergy() {
  const inp = $('allergy-input');
  inp.value.split(',').map(v => v.trim()).filter(Boolean).forEach(v => {
    if (!formAllergies.some(a => a.toLowerCase() === v.toLowerCase())) formAllergies.push(v);
  });
  renderFormAllergies();
  inp.value = '';
  inp.focus();
}
$('allergy-add-btn').addEventListener('click', addAllergy);
$('allergy-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addAllergy(); }
});

/* Фото стискаємо до 320px, щоб кілька улюбленців вміщались у localStorage */
$('pet-photo-btn').addEventListener('click', () => $('pet-photo-input').click());
$('pet-photo-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const size = 320;
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      formPhoto = canvas.toDataURL('image/jpeg', 0.82);
      updateFormAvatar();
    };
    img.onerror = () => showToast('Не вдалося відкрити це зображення');
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});
$('remove-photo-btn').addEventListener('click', () => {
  formPhoto = null;
  $('pet-photo-input').value = '';
  updateFormAvatar();
});

$('save-pet-btn').addEventListener('click', () => {
  const name = $('pet-name').value.trim();
  if (!name) { $('pet-name').focus(); showToast("Введіть ім'я улюбленця"); return; }
  if ($('allergy-input').value.trim()) addAllergy();   // не губимо введене, але не додане

  const existing = editingPetId ? getPet(editingPetId) : null;
  const birth = $('pet-birth').value;
  const pet = {
    ...(existing || { id: uid(), createdAt: new Date().toISOString() }),
    name,
    species:    $('pet-species').value,
    gender:     $('pet-gender').value,
    breed:      $('pet-breed').value.trim(),
    birth,
    age:        birth ? '' : $('pet-age').value.trim(),
    weight:     $('pet-weight').value,
    sterilized: $('pet-sterilized').value,
    activity:   $('pet-activity').value,
    allergies:  [...formAllergies],
    foodPref:   $('pet-food-pref').value.trim(),
    notes:      $('pet-notes').value.trim(),
    photo:      formPhoto,
  };
  if (existing) pets[pets.indexOf(existing)] = pet; else pets.push(pet);
  if (!savePets()) return;
  renderAll();
  openPetDetail(pet.id);
  showToast(existing ? '✅ Профіль оновлено' : `✅ ${name} тепер у кабінеті!`);
});

/* ══════════════════════════════
   АВТОДОСТАВКА: КАРТКИ
══════════════════════════════ */
function subSort(a, b) {
  const rank = { active: 0, paused: 1, cancelled: 2 };
  return (rank[a.status] - rank[b.status]) || String(a.nextDate).localeCompare(String(b.nextDate));
}

function subCard(sub, compact) {
  const pet = getPet(sub.petId);
  const petName = pet ? pet.name : (sub.petName || 'Без прив\'язки');
  const t = subTotals(sub);
  const el = document.createElement('div');
  el.className = 'sub-card' + (sub.status === 'cancelled' ? ' is-cancelled' : '');
  el.dataset.id = sub.id;

  const chip = sub.status === 'active'
    ? '<span class="chip chip-active"><span class="pulse"></span>Активна</span>'
    : `<span class="chip chip-${sub.status}">${statusLabel[sub.status]}</span>`;

  let nextBlock = '';
  if (sub.status === 'active') {
    const later = upcomingDates(sub, 3).slice(1).map(fmtShort).join(', ');
    nextBlock = `
      <div class="sub-next">
        <div>
          <div class="sub-next__in">Наступна відправка · ${esc(inDays(sub.nextDate))}</div>
          <div class="sub-next__date">${esc(fmtDate(sub.nextDate))}</div>
        </div>
        <div class="sub-next__later">${esc(freqLabel(sub.freq))}<br>Далі: ${esc(later)}</div>
      </div>`;
  } else if (sub.status === 'paused') {
    nextBlock = `
      <div class="sub-next">
        <div>
          <div class="sub-next__in">На паузі до</div>
          <div class="sub-next__date">${sub.pausedUntil ? esc(fmtDate(sub.pausedUntil)) : 'відновлення'}</div>
        </div>
        <div class="sub-next__later">${esc(freqLabel(sub.freq))}<br>${sub.pausedUntil ? 'Відновиться автоматично' : 'Відновіть, коли буде потрібно'}</div>
      </div>`;
  }

  const items = (sub.items || []).map(i => `
    <div class="sub-item">
      <img src="${esc(i.image || PLACEHOLDER_IMG)}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER_IMG}'">
      <div class="sub-item__name">${esc(i.name)}</div>
      <div class="sub-item__price">${i.qty} × ${esc(money(i.price))}</div>
    </div>`).join('');

  let lasts = '';
  if (sub.portion) {
    const { grams } = subGrams(sub.items);
    if (grams) {
      const days = Math.floor(grams / sub.portion);
      const short = days < sub.freq;
      lasts = `<div class="small" style="margin-bottom:12px;color:${short ? 'var(--amber)' : 'var(--fg2)'}">
        ${short ? '⚠️' : '🥣'} ${esc(fmtWeight(grams))} корму вистачає ≈ на ${days} ${plural(days, 'день', 'дні', 'днів')} при ${sub.portion} г/день${short ? ' — менше, ніж інтервал доставки' : ''}</div>`;
    }
  }

  const sync = !sub.synced ? `
    <div class="sub-sync">
      <span>⏳ ${esc(sub.lastAction || 'Зміни')} — ще не надіслано менеджеру</span>
      <button class="btn btn-amber btn-sm" data-act="sync">Надіслати в Telegram</button>
    </div>` : '';

  let actions = '';
  if (sub.status === 'active') {
    actions = `
      <button class="btn btn-ghost btn-sm" data-act="skip">⏭ Пропустити наступну</button>
      <button class="btn btn-ghost btn-sm" data-act="move">📅 Перенести</button>
      <button class="btn btn-ghost btn-sm" data-act="pause">⏸ Пауза</button>
      <button class="btn btn-ghost btn-sm" data-act="edit">✏️ Змінити</button>
      <button class="btn btn-ghost btn-sm" data-act="ics">🔔 У календар</button>
      <button class="btn btn-danger btn-sm" data-act="cancel">Скасувати</button>`;
  } else if (sub.status === 'paused') {
    actions = `
      <button class="btn btn-lime btn-sm" data-act="resume">▶ Відновити</button>
      <button class="btn btn-ghost btn-sm" data-act="edit">✏️ Змінити</button>
      <button class="btn btn-danger btn-sm" data-act="cancel">Скасувати</button>`;
  } else {
    actions = `
      <button class="btn btn-ghost btn-sm" data-act="restart">↻ Оформити знову</button>
      <button class="btn btn-danger btn-sm" data-act="remove">Прибрати з історії</button>`;
  }

  const hist = (sub.history || []).slice().reverse().slice(0, 10).map(h =>
    `<li>${esc(new Date(h.at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }))} — ${esc(h.text)}</li>`).join('');

  el.innerHTML = `
    <div class="sub-card__head">
      ${compact ? '' : `<div class="pet-avatar xs">${avatarHtml(pet)}</div>`}
      <div class="sub-card__title">
        <b>${compact ? 'Автодоставка' : 'Для ' + esc(petName)}</b>
        <div>${esc(sub.num || '')}${sub.delivery ? ' · ' + esc(deliveryLabel[sub.delivery] || '') : ''}</div>
      </div>
      ${chip}
    </div>
    ${sync}
    ${nextBlock}
    <div class="sub-items">${items || '<div class="small muted">Товари не обрано</div>'}</div>
    ${lasts}
    <div class="sub-totals">
      <span>За доставку: <s>${esc(money(t.full))}</s> <b>${esc(money(t.total))}</b></span>
      <span>≈ ${esc(money(t.perMonth))} / міс · економія ${esc(money(t.saved))}</span>
    </div>
    <div class="btn-row">${actions}</div>
    ${hist ? `<details class="sub-history"><summary>Історія змін</summary><ul>${hist}</ul></details>` : ''}`;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) handleSubAction(sub.id, btn.dataset.act);
  });
  return el;
}

function renderSubs() {
  const list = $('subs-list');
  list.innerHTML = '';
  const sorted = subs.slice().sort(subSort);
  $('subs-empty').hidden = sorted.length > 0;
  sorted.forEach(s => list.appendChild(subCard(s, false)));
}

/* ── Дії з автодоставкою ── */
function markChanged(sub, action) {
  sub.synced = false;
  sub.lastAction = action;
  sub.updatedAt = new Date().toISOString();
  logHistory(sub, action);
}

function commit(sub, action, toast) {
  markChanged(sub, action);
  saveSubs();
  renderAll();
  showToast(toast || '✅ Збережено');
  openSyncModal(sub.id);
}

function handleSubAction(id, act) {
  const sub = getSub(id);
  if (!sub) return;

  switch (act) {
    case 'sync':
      openSyncModal(id);
      break;

    case 'skip': {
      const skipped = sub.nextDate;
      sub.nextDate = addDays(sub.nextDate, sub.freq);
      commit(sub, `Пропуск відправки ${fmtDate(skipped)}, наступна — ${fmtDate(sub.nextDate)}`, '⏭ Наступну відправку пропущено');
      break;
    }

    case 'move':
      openChoice({
        title: 'Перенести наступну відправку',
        desc: 'Зараз: ' + fmtDate(sub.nextDate) + '. Наступні доставки рахуватимуться від нової дати.',
        options: [
          ['Якнайшвидше (завтра)', addDays(today(), 1)],
          ['На тиждень раніше', addDays(sub.nextDate, -7)],
          ['На тиждень пізніше', addDays(sub.nextDate, 7)],
          ['На 2 тижні пізніше', addDays(sub.nextDate, 14)],
        ].filter(([, d]) => d > today() && d !== sub.nextDate),
        min: addDays(today(), 1),
        value: sub.nextDate,
        onPick: date => {
          const from = sub.nextDate;
          sub.nextDate = date;
          commit(sub, `Відправку перенесено з ${fmtDate(from)} на ${fmtDate(date)}`, '📅 Дату змінено');
        }
      });
      break;

    case 'pause':
      openChoice({
        title: 'Поставити на паузу',
        desc: 'Поки автодоставка на паузі, відправок не буде. Після паузи вона відновиться сама.',
        options: [
          ['На 2 тижні', addDays(today(), 14)],
          ['На місяць', addDays(today(), 30)],
          ['На 2 місяці', addDays(today(), 60)],
          ['До ручного відновлення', null],
        ],
        min: addDays(today(), 2),
        value: addDays(today(), 30),
        onPick: until => {
          sub.status = 'paused';
          if (until) sub.pausedUntil = until; else delete sub.pausedUntil;
          commit(sub, until ? `Пауза до ${fmtDate(until)}` : 'Пауза до ручного відновлення', '⏸ Автодоставку призупинено');
        }
      });
      break;

    case 'resume': {
      sub.status = 'active';
      delete sub.pausedUntil;
      if (!sub.nextDate || sub.nextDate <= today()) sub.nextDate = addDays(today(), 2);
      commit(sub, `Відновлено, наступна відправка ${fmtDate(sub.nextDate)}`, '▶ Автодоставку відновлено');
      break;
    }

    case 'edit':
      openSubEditor(id);
      break;

    case 'ics':
      downloadIcs(sub);
      break;

    case 'cancel':
      if (!confirm('Скасувати автодоставку? Знижка −' + Math.round(DISCOUNT * 100) + '% для неї перестане діяти.\n\nПорада: якщо корму поки вистачає — краще поставити на паузу.')) return;
      sub.status = 'cancelled';
      delete sub.pausedUntil;
      commit(sub, 'Автодоставку скасовано', 'Автодоставку скасовано');
      break;

    case 'restart':
      openSubEditor(null, sub.petId, sub);
      break;

    case 'remove':
      if (!confirm('Прибрати цю скасовану автодоставку з історії?')) return;
      subs = subs.filter(s => s.id !== id);
      saveSubs();
      renderAll();
      break;
  }
}

/* ── Повідомлення менеджеру ── */
function subTelegramText(sub) {
  const pet = getPet(sub.petId);
  const profile = loadProfile();
  const t = subTotals(sub);
  let msg = `🔁 Автодоставка ${sub.num}\n`;
  msg += `Дія: ${sub.lastAction || 'Оновлення'}\n`;
  msg += `Статус: ${statusLabel[sub.status]}\n\n`;
  if (pet) {
    msg += `🐾 Для: ${pet.name}`;
    const meta = [pet.species ? speciesLabel[pet.species] : '', pet.breed, petAge(pet), pet.weight ? pet.weight + ' кг' : ''].filter(Boolean).join(', ');
    if (meta) msg += ` (${meta})`;
    if (pet.allergies && pet.allergies.length) msg += `\nАлергії: ${pet.allergies.join(', ')}`;
    msg += '\n\n';
  } else if (sub.petName) {
    msg += `🐾 Для: ${sub.petName}\n\n`;
  }
  if (sub.status !== 'cancelled') {
    msg += 'Товари:\n';
    (sub.items || []).forEach(i => { msg += `• ${i.name} × ${i.qty} — ${money(i.price * i.qty)}\n`; });
    msg += `Сума зі знижкою −${Math.round(DISCOUNT * 100)}%: ${money(t.total)}\n\n`;
    msg += `Частота: ${freqLabel(sub.freq)}\n`;
    if (sub.status === 'active') msg += `Наступна відправка: ${fmtDate(sub.nextDate, true)}\n`;
    if (sub.status === 'paused') msg += sub.pausedUntil ? `Пауза до: ${fmtDate(sub.pausedUntil, true)}\n` : 'Пауза до ручного відновлення\n';
    msg += `Доставка: ${deliveryLabel[sub.delivery] || '—'}`;
    if (sub.delivery !== 'pickup' && sub.address) msg += `, ${sub.address}`;
    msg += '\n';
    if (sub.comment) msg += `Коментар: ${sub.comment}\n`;
  }
  if (profile.name || profile.phone) msg += `\n👤 ${[profile.name, profile.phone].filter(Boolean).join(', ')}`;
  return msg.trim();
}

let syncSubId = null;
function openSyncModal(id) {
  const sub = getSub(id);
  if (!sub || !TG_USER) return;
  syncSubId = id;
  const text = subTelegramText(sub);
  $('sync-preview').textContent = text;
  $('sync-tg-btn').href = tgLink(text);
  openModal('sync-modal');
}
$('sync-tg-btn').addEventListener('click', () => {
  const sub = getSub(syncSubId);
  if (sub) {
    sub.synced = true;
    logHistory(sub, 'Надіслано менеджеру в Telegram');
    saveSubs();
    renderAll();
  }
  closeModal('sync-modal');
});

/* ── Нагадування в календар (.ics з повторенням) ── */
function downloadIcs(sub) {
  const pet = getPet(sub.petId);
  const d = sub.nextDate.replace(/-/g, '');
  const dEnd = addDays(sub.nextDate, 1).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const title = 'Автодоставка корму' + (pet ? ' для ' + pet.name : '') + ' — Щасливі лапки';
  const desc = (sub.items || []).map(i => i.name + ' × ' + i.qty).join('\\n');
  const icsEsc = s => s.replace(/[,;]/g, m => '\\' + m);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shchaslyvi Lapky//Cabinet//UK', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + sub.id + '@shchaslyvi-lapky',
    'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + d,
    'DTEND;VALUE=DATE:' + dEnd,
    'RRULE:FREQ=DAILY;INTERVAL=' + sub.freq,
    'SUMMARY:' + icsEsc(title),
    'DESCRIPTION:' + icsEsc(desc),
    'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc('Через 3 дні — ' + title + '. Потрібні зміни? Відкрийте кабінет.'), 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'avtodostavka-' + (sub.num || sub.id) + '.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('🔔 Відкрийте файл, щоб додати нагадування в календар');
}

/* ══════════════════════════════
   МОДАЛКИ
══════════════════════════════ */
function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).hidden = true;
  if (!document.querySelector('.modal-overlay:not([hidden])')) document.body.style.overflow = '';
}
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-close]')) closeModal(ov.id);
  });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay:not([hidden])')].pop();
  if (open) closeModal(open.id);
});

/* ── Вибір варіанту (пауза / перенесення) ── */
let choiceCallback = null;
function openChoice({ title, desc, options, min, value, onPick }) {
  choiceCallback = onPick;
  $('choice-title').textContent = title;
  $('choice-desc').textContent = desc || '';
  const box = $('choice-options');
  box.innerHTML = '';
  options.forEach(([label, date]) => {
    const b = document.createElement('button');
    b.className = 'btn btn-ghost';
    b.type = 'button';
    b.innerHTML = esc(label) + (date ? ` <span class="muted" style="margin-left:auto;font-weight:400">${esc(fmtDate(date))}</span>` : '');
    b.addEventListener('click', () => pickChoice(date));
    box.appendChild(b);
  });
  $('choice-date').min = min || '';
  $('choice-date').value = value || '';
  openModal('choice-modal');
}
function pickChoice(date) {
  closeModal('choice-modal');
  if (choiceCallback) choiceCallback(date);
  choiceCallback = null;
}
$('choice-date-ok').addEventListener('click', () => {
  const v = $('choice-date').value;
  if (!v || (($('choice-date').min) && v < $('choice-date').min)) { showToast('Оберіть дату в майбутньому'); return; }
  pickChoice(v);
});

/* ══════════════════════════════
   РЕДАКТОР АВТОДОСТАВКИ
══════════════════════════════ */
let edSubId = null;
let edItems = [];

function openSubEditor(subId, petId, template) {
  if (!pets.length) {
    showToast('Спершу додайте улюбленця — автодоставка оформлюється для нього');
    switchTab('pets');
    openPetForm(null);
    return;
  }
  const sub = subId ? getSub(subId) : null;
  const src = sub || template || null;
  const profile = loadProfile();
  edSubId = sub ? sub.id : null;
  edItems = src ? (src.items || []).map(i => ({ ...i })) : [];

  $('sub-modal-title').textContent = sub ? 'Змінити автодоставку ' + (sub.num || '') : 'Нова автодоставка';
  $('ed-save-btn').textContent = sub ? 'Зберегти зміни' : 'Оформити автодоставку';

  $('ed-pet').innerHTML = pets.map(p => `<option value="${esc(p.id)}">${esc((speciesEmoji[p.species] || '🐾') + ' ' + p.name)}</option>`).join('');
  $('ed-pet').value = (src && getPet(src.petId) ? src.petId : null) || petId || pets[0].id;

  $('ed-freq').value = String(src ? src.freq : 30);
  if (!$('ed-freq').value) {   // нестандартна частота
    const o = document.createElement('option');
    o.value = String(src.freq); o.textContent = freqLabel(src.freq);
    $('ed-freq').appendChild(o);
    $('ed-freq').value = String(src.freq);
  }
  $('ed-date').min = addDays(today(), 1);
  $('ed-date').value = sub && sub.nextDate > today() ? sub.nextDate : addDays(today(), 2);
  $('ed-date').closest('.field').hidden = !!(sub && sub.status === 'paused');

  $('ed-portion').value = src && src.portion ? src.portion : '';
  $('ed-delivery').value = (src && src.delivery) || profile.delivery || 'nova_poshta';
  $('ed-address').value = src && src.address != null
    ? src.address
    : [profile.city, profile.branch].filter(Boolean).join(', ');
  $('ed-comment').value = (src && src.comment) || '';
  $('ed-search').value = '';
  $('ed-results').hidden = true;

  toggleAddress();
  renderEdItems();
  openModal('sub-modal');
  loadCatalog();
  if (!edItems.length) setTimeout(() => $('ed-search').focus(), 50);
}

$('new-sub-btn').addEventListener('click', () => openSubEditor(null));
document.querySelectorAll('[data-new-sub]').forEach(b => b.addEventListener('click', () => openSubEditor(null)));

function toggleAddress() {
  $('ed-address-wrap').hidden = $('ed-delivery').value === 'pickup';
}
$('ed-delivery').addEventListener('change', toggleAddress);

/* Пошук товарів */
let searchTimer;
$('ed-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 150);
});
$('ed-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
});

async function runSearch() {
  const q = $('ed-search').value.trim();
  const box = $('ed-results');
  if (q.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  if (!catalog) {
    box.innerHTML = '<div class="picker-empty">Завантажуємо каталог…</div>';
    await loadCatalog();
    if ($('ed-search').value.trim() !== q) return;
  }
  const res = searchCatalog(q);
  if (!res.length) {
    box.innerHTML = '<div class="picker-empty">Нічого не знайдено. Спробуйте іншу назву або напишіть нам у Telegram.</div>';
    return;
  }
  box.innerHTML = '';
  res.forEach(p => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'picker-row';
    const g = parseGrams(p.name);
    row.innerHTML = `
      <img src="${esc(p.image || PLACEHOLDER_IMG)}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER_IMG}'">
      <div class="picker-row__name">${esc(p.name)}<small>${esc(p.category)}${g ? ' · ' + esc(fmtWeight(g)) : ''}</small></div>
      <div class="picker-row__price">${esc(money(p.price))}</div>`;
    row.addEventListener('click', () => {
      const ex = edItems.find(i => i.id === p.id);
      if (ex) ex.qty = Math.min(ex.qty + 1, 20);
      else edItems.push({ id: p.id, name: p.name, price: p.price, image: p.image || PLACEHOLDER_IMG, qty: 1 });
      renderEdItems();
      $('ed-search').value = '';
      box.hidden = true;
      $('ed-search').focus();
    });
    box.appendChild(row);
  });
}

function renderEdItems() {
  const box = $('ed-items');
  box.innerHTML = '';
  edItems.forEach((item, idx) => {
    const g = parseGrams(item.name);
    const row = document.createElement('div');
    row.className = 'ed-item';
    row.innerHTML = `
      <img src="${esc(item.image || PLACEHOLDER_IMG)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'">
      <div class="ed-item__name">${esc(item.name)}<div class="hint">${esc(money(item.price))}${g ? ' · ' + esc(fmtWeight(g)) : ''}</div></div>
      <div class="qty">
        <button type="button" data-d="-1" aria-label="Менше">−</button>
        <span>${item.qty}</span>
        <button type="button" data-d="1" aria-label="Більше">+</button>
      </div>
      <button type="button" class="ed-remove" aria-label="Прибрати">×</button>`;
    row.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      item.qty = Math.max(1, Math.min(20, item.qty + parseInt(b.dataset.d, 10)));
      renderEdItems();
    }));
    row.querySelector('.ed-remove').addEventListener('click', () => {
      edItems.splice(idx, 1);
      renderEdItems();
    });
    box.appendChild(row);
  });
  updateEdCalc();
}

function updateEdCalc() {
  const freq = parseInt($('ed-freq').value, 10);
  const portion = parseFloat($('ed-portion').value);
  const res = $('ed-calc-result');
  const { grams, unknown } = subGrams(edItems);

  if (!edItems.length) {
    res.textContent = 'Додайте корм — і вкажіть порцію, щоб порахувати, на скільки його вистачить.';
  } else if (!grams) {
    res.textContent = 'Не вдалося визначити вагу упаковки з назви товару — уточніть частоту в менеджера.';
  } else if (!portion || portion <= 0) {
    res.innerHTML = `У доставці <b>${esc(fmtWeight(grams))}</b> корму. Вкажіть денну порцію — порахуємо, на скільки вистачить.`;
  } else {
    const days = Math.floor(grams / portion);
    const fit = FREQ_OPTIONS.filter(f => f <= days).pop();
    let html = `${esc(fmtWeight(grams))} корму вистачить ≈ на <b>${days} ${plural(days, 'день', 'дні', 'днів')}</b>.`;
    if (!fit) {
      html += ' Це менше двох тижнів — додайте ще упаковку або оберіть більшу.';
    } else if (fit !== freq) {
      html += ` Рекомендуємо: <b>${esc(freqLabel(fit).toLowerCase())}</b> <button type="button" class="link-btn" id="ed-apply-freq">застосувати</button>`;
    } else {
      html += ' Обрана частота підходить 👍';
    }
    if (freq > days) html += `<div style="color:var(--amber);margin-top:4px">⚠️ При частоті «${esc(freqLabel(freq).toLowerCase())}» корм закінчиться за ${freq - days} ${plural(freq - days, 'день', 'дні', 'днів')} до наступної доставки.</div>`;
    if (unknown) html += `<div class="hint" style="margin-top:4px">Для ${unknown} ${plural(unknown, 'товару', 'товарів', 'товарів')} вагу не визначено — їх не враховано.</div>`;
    res.innerHTML = html;
    const apply = $('ed-apply-freq');
    if (apply) apply.addEventListener('click', () => { $('ed-freq').value = String(fit); updateEdCalc(); });
  }

  const t = subTotals({ items: edItems, freq });
  $('ed-summary').innerHTML = edItems.length
    ? `<span>За доставку: <s class="muted">${esc(money(t.full))}</s> <b>${esc(money(t.total))}</b></span><span class="muted">≈ ${esc(money(t.perMonth))} на місяць</span>`
    : '';
}
$('ed-freq').addEventListener('change', updateEdCalc);
$('ed-portion').addEventListener('input', updateEdCalc);

$('ed-save-btn').addEventListener('click', () => {
  if (!edItems.length) { showToast('Додайте хоча б один товар'); $('ed-search').focus(); return; }
  const date = $('ed-date').value;
  const existing = edSubId ? getSub(edSubId) : null;
  const dateHidden = existing && existing.status === 'paused';
  if (!dateHidden && (!date || date <= today())) { showToast('Оберіть дату відправки, починаючи із завтра'); $('ed-date').focus(); return; }
  const delivery = $('ed-delivery').value;
  const address = $('ed-address').value.trim();
  if (delivery !== 'pickup' && !address) { showToast('Вкажіть місто та відділення'); $('ed-address').focus(); return; }

  const data = {
    petId:    $('ed-pet').value,
    items:    edItems.map(i => ({ ...i })),
    freq:     parseInt($('ed-freq').value, 10),
    portion:  parseFloat($('ed-portion').value) || null,
    delivery,
    address:  delivery === 'pickup' ? '' : address,
    comment:  $('ed-comment').value.trim(),
  };
  if (!dateHidden) data.nextDate = date;

  let sub;
  if (existing) {
    sub = existing;
    const changes = describeChanges(existing, data);
    Object.assign(sub, data);
    closeModal('sub-modal');
    if (!changes) { saveSubs(); renderAll(); showToast('Змін немає'); return; }
    commit(sub, 'Змінено: ' + changes, '✅ Автодоставку оновлено');
  } else {
    sub = {
      id: uid(),
      num: 'АД-' + Date.now().toString(36).toUpperCase().slice(-5),
      status: 'active',
      createdAt: new Date().toISOString(),
      history: [],
      ...data
    };
    subs.push(sub);
    closeModal('sub-modal');
    const pet = getPet(sub.petId);
    commit(sub, 'Нова автодоставка', `🎉 Автодоставку для ${pet ? pet.name : 'улюбленця'} оформлено`);
  }
});

function describeChanges(a, b) {
  const out = [];
  if (a.petId !== b.petId) out.push('улюбленець');
  const sig = items => items.map(i => i.id + 'x' + i.qty).sort().join('|');
  if (sig(a.items || []) !== sig(b.items)) out.push('товари');
  if (a.freq !== b.freq) out.push('частота — ' + freqLabel(b.freq).toLowerCase());
  if (b.nextDate && a.nextDate !== b.nextDate) out.push('дата — ' + fmtDate(b.nextDate));
  if (a.delivery !== b.delivery || (a.address || '') !== b.address) out.push('доставка');
  if ((a.comment || '') !== b.comment) out.push('коментар');
  if ((a.portion || null) !== b.portion && out.length === 0) return '';   // порція — лише для розрахунку, магазину байдуже
  return out.join(', ');
}

/* ══════════════════════════════
   ЗАМОВЛЕННЯ
══════════════════════════════ */
function renderOrders() {
  const orders = read(KEY_ORDERS, []);
  const list  = $('orders-list');
  const empty = $('orders-empty');
  list.innerHTML = '';
  if (!Array.isArray(orders) || orders.length === 0) { empty.hidden = false; return; }
  empty.hidden = true;

  const statusText = { pending:'Очікує підтвердження', confirmed:'Підтверджено', sent:'Відправлено', done:'Виконано' };
  orders.slice().reverse().forEach(o => {
    const div = document.createElement('div');
    div.className = 'order-item';
    const date = o.date ? new Date(o.date).toLocaleDateString('uk-UA', { day:'numeric', month:'long', year:'numeric' }) : '—';
    const done = o.status === 'done' || o.status === 'confirmed';
    const products = (o.items || []).map(i => `${esc(i.name)} × ${i.qty}`).join('<br>');
    const total = (o.items || []).reduce((s, i) => s + i.price * i.qty, 0);
    div.innerHTML = `
      <div class="order-item__head">
        <div>
          <div class="order-num">${esc(o.num || '—')}</div>
          <div class="order-date">${esc(date)}</div>
        </div>
        <span class="chip ${done ? 'chip-active' : 'chip-paused'}">${esc(statusText[o.status] || 'Очікує')}</span>
      </div>
      <div class="order-products">${products || '—'}</div>
      <div class="order-total">Сума: ${esc(money(total))}</div>
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" data-o="repeat">🔄 Повторити замовлення</button>
        <button class="btn btn-ghost btn-sm" data-o="sub">🔁 Зробити автодоставкою</button>
      </div>`;
    div.querySelector('[data-o="repeat"]').addEventListener('click', () => repeatOrder(o));
    div.querySelector('[data-o="sub"]').addEventListener('click', () => {
      openSubEditor(null, null, { items: (o.items || []).map(i => ({ id: i.id, name: i.name, price: i.price, image: i.image, qty: i.qty })), freq: 30 });
    });
    list.appendChild(div);
  });
}

function repeatOrder(order) {
  const cart = read(KEY_CART, []);
  const list = Array.isArray(cart) ? cart : [];
  (order.items || []).forEach(i => {
    const ex = list.find(c => c.id === i.id);
    if (ex) ex.qty = Math.min(ex.qty + i.qty, 99);
    else list.push({ id: i.id, name: i.name, price: i.price, image: i.image || PLACEHOLDER_IMG, qty: i.qty });
  });
  if (write(KEY_CART, list)) window.location.href = 'checkout.html';
}

/* ══════════════════════════════
   ПРОФІЛЬ КЛІЄНТА
══════════════════════════════ */
function fillProfile() {
  const p = loadProfile();
  $('client-name').value     = p.name || '';
  $('client-phone').value    = p.phone || '';
  $('client-email').value    = p.email || '';
  $('client-city').value     = p.city || '';
  $('client-branch').value   = p.branch || '';
  $('client-delivery').value = p.delivery || 'nova_poshta';
}

$('save-profile-btn').addEventListener('click', () => {
  const p = {
    name:     $('client-name').value.trim(),
    phone:    $('client-phone').value.trim(),
    email:    $('client-email').value.trim(),
    city:     $('client-city').value.trim(),
    branch:   $('client-branch').value.trim(),
    delivery: $('client-delivery').value,
  };
  if (write(KEY_PROFILE, p)) showToast('✅ Дані збережено');
});

/* ── Резервна копія ── */
const BACKUP_KEYS = [KEY_PETS, KEY_SUBS, KEY_PROFILE, KEY_ORDERS];

$('export-btn').addEventListener('click', () => {
  const data = { app: 'shchaslyvi-lapky-cabinet', version: 2, exportedAt: new Date().toISOString() };
  BACKUP_KEYS.forEach(k => { data[k] = read(k, null); });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kabinet-shchaslyvi-lapky-' + today() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import-btn').addEventListener('click', () => $('import-input').click());
$('import-input').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    let data;
    try { data = JSON.parse(ev.target.result); } catch { data = null; }
    if (!data || data.app !== 'shchaslyvi-lapky-cabinet') { showToast('⚠️ Це не файл резервної копії кабінету'); return; }
    if (!confirm('Замінити поточні дані кабінету даними з файлу?')) return;
    BACKUP_KEYS.forEach(k => {
      if (data[k] != null) write(k, data[k]);
    });
    location.reload();
  };
  reader.readAsText(file);
});

$('clear-all-btn').addEventListener('click', () => {
  if (!confirm('Видалити ВСІ дані кабінету в цьому браузері? Це незворотно.')) return;
  [...BACKUP_KEYS, KEY_PET_V1, KEY_SUB_V1].forEach(k => localStorage.removeItem(k));
  location.reload();
});

/* ══════════════════════════════
   ТЕМА ТА ІНІЦІАЛІЗАЦІЯ
══════════════════════════════ */
const root = document.documentElement;
if (localStorage.getItem('theme') === 'light') root.classList.add('light');
$('themeBtn').addEventListener('click', () => {
  root.classList.toggle('light');
  localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
});

function renderAll() {
  renderOverview();
  renderSubs();
  renderOrders();
  if (!$('pets-list-view').hidden) renderPetGrid();
  if (!$('pet-detail-view').hidden && currentPetId) openPetDetail(currentPetId);
}

loadAll();
fillProfile();
showView('list');
renderAll();
loadCatalog();

/* Хеш: #pets, #subs, #orders, #profile, #new-sub (з головної сторінки) */
function initFromHash() {
  const h = location.hash.replace('#', '');
  if (h === 'new-sub') {
    switchTab('subs');
    if (pets.length) openSubEditor(null);
    else { switchTab('pets'); openPetForm(null); showToast('Спершу розкажіть про улюбленця — і оформимо автодоставку'); }
  } else if (['pets', 'subs', 'orders', 'profile'].includes(h)) {
    switchTab(h);
    if (h === 'pets') showPetsList();
  }
}
initFromHash();
window.addEventListener('hashchange', initFromHash);
