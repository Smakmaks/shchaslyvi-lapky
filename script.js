/**
 * script.js — Зоомагазин
 *
 * Завантажує products.json, відображає каталог,
 * реалізує пошук, фільтрацію, сортування та Telegram-кнопки.
 *
 * Не містить API-ключів. Не звертається до RO App API.
 */

'use strict';

// ─── Стан ─────────────────────────────────────────────
let allProducts = [];      // всі товари з products.json
let filteredProducts = []; // після фільтрів і пошуку
let searchQuery = '';
let selectedCategory = '';
let sortOrder = 'name';

// ─── Посилання на DOM ─────────────────────────────────
const $grid         = document.getElementById('products-grid');
const $loading      = document.getElementById('loading-state');
const $error        = document.getElementById('error-state');
const $errorMsg     = document.getElementById('error-message');
const $empty        = document.getElementById('empty-state');
const $search       = document.getElementById('search-input');
const $searchClear  = document.getElementById('search-clear');
const $catFilter    = document.getElementById('category-filter');
const $sortSelect   = document.getElementById('sort-select');
const $resetBtn     = document.getElementById('reset-filters-btn');
const $scrollTopBtn = document.getElementById('scroll-top-btn');
const $template     = document.getElementById('product-card-template');

// ─── Ініціалізація конфігу ────────────────────────────
function applyConfig() {
  const c = window.SHOP_CONFIG || {};

  // Назва магазину
  const shopName = c.shopName || 'Зоомагазин';
  document.title = `${shopName} — товари для улюбленців`;
  document.getElementById('page-title').textContent = `${shopName} — товари для улюбленців`;
  const footerName = document.getElementById('footer-shop-name');
  if (footerName) footerName.textContent = shopName;

  // Telegram
  const tg = c.telegramUsername ? c.telegramUsername.replace(/^@/, '') : null;
  const tgUrl = tg ? `https://t.me/${tg}` : '#';

  document.getElementById('header-tg-btn').href   = tgUrl;
  document.getElementById('mobile-tg-btn').href   = tgUrl;
  document.getElementById('hero-tg-btn').href      = tgUrl;
  document.getElementById('contacts-tg-btn').href  = tgUrl;

  // Контакти
  const phone = c.phone || '';
  const $phone = document.getElementById('contact-phone');
  if (phone) {
    $phone.textContent = phone;
    $phone.href = `tel:${phone.replace(/\s/g, '')}`;
  } else {
    $phone.textContent = 'Уточнити в Telegram';
    $phone.href = tgUrl;
  }

  const $tgContact = document.getElementById('contact-tg');
  if (tg) {
    $tgContact.textContent = `@${tg}`;
    $tgContact.href = tgUrl;
  } else {
    $tgContact.textContent = 'Вказати в config.js';
  }

  const address = [c.city, c.address].filter(Boolean).join(', ');
  document.getElementById('contact-address').textContent = address || '—';
  document.getElementById('contact-hours').textContent   = c.workingHours || '—';

  // Доставка й оплата
  if (c.deliveryText) {
    document.getElementById('benefit-delivery-text').textContent   = c.deliveryText;
    document.getElementById('delivery-text-content').textContent   = c.deliveryText;
  }
  if (c.paymentText) {
    document.getElementById('payment-text-content').textContent = c.paymentText;
  }
}

// ─── Telegram-посилання для товару ───────────────────
function buildTelegramUrl(product) {
  const c = window.SHOP_CONFIG || {};
  const tg = c.telegramUsername ? c.telegramUsername.replace(/^@/, '') : null;
  if (!tg) return '#';

  const name  = product.name  || 'товар';
  const price = product.price && product.price > 0
    ? `${product.price} грн`
    : 'Ціну прошу уточнити';

  let msg = `Добрий день! Хочу замовити: ${name}.`;

  // Показуємо артикул тільки якщо він є і відрізняється від id
  if (product.sku && product.sku !== product.id) {
    msg += ` Артикул: ${product.sku}.`;
  }
  msg += ` Ціна: ${price}. Підкажіть, будь ласка, чи є в наявності?`;

  return `https://t.me/${tg}?text=${encodeURIComponent(msg)}`;
}

// ─── Статус наявності ─────────────────────────────────
const AVAILABILITY = {
  in_stock:    { label: 'В наявності',         cls: 'badge-in-stock',  btnText: 'Замовити в Telegram',  btnCls: '' },
  out_of_stock:{ label: 'Немає в наявності',   cls: 'badge-out-stock', btnText: 'Уточнити в Telegram',  btnCls: 'btn-order--clarify' },
  preorder:    { label: 'Під замовлення',       cls: 'badge-preorder',  btnText: 'Замовити в Telegram',  btnCls: '' },
  unknown:     { label: 'Уточнити наявність',  cls: 'badge-unknown',   btnText: 'Уточнити в Telegram',  btnCls: 'btn-order--clarify' },
};

function getAvailability(key) {
  return AVAILABILITY[key] || AVAILABILITY.unknown;
}

// ─── Безпечна вставка тексту ──────────────────────────
// Використовуємо .textContent щоб уникнути XSS
function safeText(el, value) {
  el.textContent = value || '';
}

// ─── Рендер картки товару ─────────────────────────────
function renderCard(product) {
  const clone = $template.content.cloneNode(true);
  const card  = clone.querySelector('.product-card');

  const avail = getAvailability(product.availability);
  const tgUrl = buildTelegramUrl(product);

  // Зображення
  const img = clone.querySelector('.product-img');
  img.src = product.image || 'images/product-placeholder.jpg';
  img.alt = product.name  || 'Фото товару';
  img.onerror = () => { img.src = 'images/product-placeholder.jpg'; };

  // Бейдж наявності
  const badge = clone.querySelector('.product-badge');
  badge.textContent = avail.label;
  badge.classList.add(avail.cls);

  // Категорія
  safeText(clone.querySelector('.product-category'), product.category || '');

  // Назва
  safeText(clone.querySelector('.product-name'), product.name || 'Без назви');

  // Опис
  const descEl = clone.querySelector('.product-desc');
  if (product.description) {
    safeText(descEl, product.description);
  } else {
    descEl.hidden = true;
  }

  // Ціна
  const priceEl = clone.querySelector('.product-price');
  if (product.price && product.price > 0) {
    const currency = product.currency || 'грн';
    priceEl.textContent = `${product.price.toLocaleString('uk-UA')} ${currency}`;
  } else {
    priceEl.textContent = 'Ціна за запитом';
    priceEl.classList.add('product-price--free');
  }

  // Артикул
  const skuEl = clone.querySelector('.product-sku');
  if (product.sku && product.sku !== product.id) {
    skuEl.textContent = `Арт: ${product.sku}`;
  } else {
    skuEl.hidden = true;
  }

  // Кнопка замовлення
  const btn = clone.querySelector('.btn-order');
  btn.textContent = avail.btnText;
  btn.href = tgUrl;
  if (avail.btnCls) btn.classList.add(avail.btnCls);

  return clone;
}

// ─── Відображення відфільтрованих товарів ────────────
function renderProducts() {
  $grid.innerHTML = '';

  if (filteredProducts.length === 0) {
    $grid.hidden = true;
    $empty.hidden = false;
    return;
  }

  $empty.hidden = true;
  $grid.hidden = false;

  const fragment = document.createDocumentFragment();
  for (const product of filteredProducts) {
    fragment.appendChild(renderCard(product));
  }
  $grid.appendChild(fragment);
}

// ─── Фільтрація та сортування ────────────────────────
function applyFilters() {
  let result = [...allProducts];

  // Пошук
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(p => (p.name || '').toLowerCase().includes(q));
  }

  // Категорія
  if (selectedCategory) {
    result = result.filter(p => p.category === selectedCategory);
  }

  // Сортування
  if (sortOrder === 'price-asc') {
    result.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortOrder === 'price-desc') {
    result.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else {
    result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'));
  }

  filteredProducts = result;
  renderProducts();
}

// ─── Заповнення фільтру категорій ────────────────────
function populateCategories() {
  const cats = [...new Set(
    allProducts
      .map(p => p.category)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'uk'));

  for (const cat of cats) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    $catFilter.appendChild(opt);
  }
}

// ─── Показ / приховання стану ─────────────────────────
function showState(state) {
  $loading.hidden = state !== 'loading';
  $error.hidden   = state !== 'error';
  $empty.hidden   = state !== 'empty';
  $grid.hidden    = state !== 'products';
}

// ─── Завантаження products.json ───────────────────────
async function loadProducts() {
  showState('loading');

  try {
    const response = await fetch('products.json');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — не вдалося завантажити products.json`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Формат products.json не є масивом.');
    }

    const hidden = (window.SHOP_CONFIG && window.SHOP_CONFIG.hiddenCategories) || [];
    allProducts = hidden.length
      ? data.filter(p => !hidden.includes(p.category))
      : data;

    if (allProducts.length === 0) {
      showState('empty');
      return;
    }

    populateCategories();
    filteredProducts = [...allProducts];
    applyFilters();
    showState('products');

  } catch (err) {
    $errorMsg.textContent = err.message || 'Помилка завантаження товарів.';
    showState('error');

    // Підказка якщо відкрито як file://
    if (location.protocol === 'file:') {
      document.querySelector('.state-hint').hidden = false;
    }
  }
}

// ─── Debounce ─────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ─── Event listeners ──────────────────────────────────
function bindEvents() {
  // Пошук
  $search.addEventListener('input', debounce(() => {
    searchQuery = $search.value.trim();
    $searchClear.hidden = !searchQuery;
    applyFilters();
  }, 250));

  // Очищення пошуку
  $searchClear.addEventListener('click', () => {
    $search.value = '';
    searchQuery = '';
    $searchClear.hidden = true;
    $search.focus();
    applyFilters();
  });

  // Фільтр категорій
  $catFilter.addEventListener('change', () => {
    selectedCategory = $catFilter.value;
    applyFilters();
  });

  // Сортування
  $sortSelect.addEventListener('change', () => {
    sortOrder = $sortSelect.value;
    applyFilters();
  });

  // Скинути фільтри
  $resetBtn.addEventListener('click', () => {
    $search.value = '';
    $catFilter.value = '';
    $sortSelect.value = 'name';
    searchQuery = '';
    selectedCategory = '';
    sortOrder = 'name';
    $searchClear.hidden = true;
    applyFilters();
  });

  // Кнопка "Вгору"
  window.addEventListener('scroll', () => {
    const visible = window.scrollY > 300;
    $scrollTopBtn.hidden = !visible;
    $scrollTopBtn.classList.toggle('visible', visible);
  }, { passive: true });

  $scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Бургер-меню
  const $burger = document.getElementById('burger-btn');
  const $mobileMenu = document.getElementById('mobile-menu');

  $burger.addEventListener('click', () => {
    const isOpen = $burger.getAttribute('aria-expanded') === 'true';
    $burger.setAttribute('aria-expanded', String(!isOpen));
    $mobileMenu.hidden = isOpen;
  });

  // Закрити мобільне меню при кліку на посилання
  $mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      $burger.setAttribute('aria-expanded', 'false');
      $mobileMenu.hidden = true;
    });
  });

  // Smooth scroll для якорів у хедері
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ─── Старт ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyConfig();
  bindEvents();
  loadProducts();
});
