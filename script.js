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
let currentPage = 1;
let perPage = 20;

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
const $paginationTop = document.getElementById('pagination-top');
const $paginationNav = document.getElementById('pagination-nav');
const $paginationCount = document.getElementById('pagination-count');
const $perPageSelect = document.getElementById('per-page-select');

// ─── Ініціалізація конфігу ────────────────────────────
function applyConfig() {
  const c = window.SHOP_CONFIG || {};

  // Назва магазину
  const shopName = c.shopName || 'Зоомагазин';
  const pageTitle = `${shopName} — зоомагазин товарів для тварин у Дніпрі`;
  document.title = pageTitle;
  document.getElementById('page-title').textContent = pageTitle;
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

  // Соціальні мережі
  const socialIcons = {
    facebook: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>`,
    instagram: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
    tiktok: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.95a8.27 8.27 0 004.84 1.55V7.04a4.85 4.85 0 01-1.07-.35z"/></svg>`
  };
  const socialLabels = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };

  const social = c.social || {};
  const socialLinks = Object.entries(social)
    .filter(([, url]) => url)
    .map(([key, url]) => `<a href="${url}" class="social-link social-link--${key}" target="_blank" rel="noopener noreferrer" aria-label="${socialLabels[key] || key}">${socialIcons[key] || ''}<span>${socialLabels[key] || key}</span></a>`)
    .join('');

  const $footerSocial = document.getElementById('footer-social');
  if ($footerSocial) $footerSocial.innerHTML = socialLinks;
  const $contactsSocial = document.getElementById('contacts-social');
  if ($contactsSocial) $contactsSocial.innerHTML = socialLinks;

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

// ─── Пагінація ────────────────────────────────────────
function renderPagination() {
  const total = filteredProducts.length;
  const totalPages = Math.ceil(total / perPage);

  // Лічильник
  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const to   = Math.min(currentPage * perPage, total);
  $paginationCount.textContent = total > 0
    ? `Показано ${from}–${to} з ${total} товарів`
    : '';

  $paginationTop.hidden = total === 0;

  // Кнопки сторінок
  $paginationNav.innerHTML = '';
  if (totalPages <= 1) {
    $paginationNav.hidden = true;
    return;
  }
  $paginationNav.hidden = false;

  const makeBtn = (label, page, disabled = false, active = false) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled && !active) {
      btn.addEventListener('click', () => goToPage(page));
    }
    return btn;
  };

  const makeDots = () => {
    const s = document.createElement('span');
    s.className = 'page-dots';
    s.textContent = '…';
    return s;
  };

  $paginationNav.appendChild(makeBtn('←', currentPage - 1, currentPage === 1));

  // Показуємо: першу, останню, поточну ±1 та крапки між ними
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]
    .filter(p => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);

  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) $paginationNav.appendChild(makeDots());
    $paginationNav.appendChild(makeBtn(p, p, false, p === currentPage));
    prev = p;
  }

  $paginationNav.appendChild(makeBtn('→', currentPage + 1, currentPage === totalPages));
}

function goToPage(page) {
  currentPage = page;
  renderProducts();
  document.getElementById('catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Відображення відфільтрованих товарів ────────────
function renderProducts() {
  $grid.innerHTML = '';

  if (filteredProducts.length === 0) {
    $grid.hidden = true;
    $empty.hidden = false;
    $paginationTop.hidden = true;
    $paginationNav.hidden = true;
    return;
  }

  $empty.hidden = true;
  $grid.hidden = false;

  const start = (currentPage - 1) * perPage;
  const pageProducts = filteredProducts.slice(start, start + perPage);

  const fragment = document.createDocumentFragment();
  for (const product of pageProducts) {
    fragment.appendChild(renderCard(product));
  }
  $grid.appendChild(fragment);
  renderPagination();
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
  currentPage = 1;
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

    const urlSearch = new URLSearchParams(window.location.search).get('search');
    if (urlSearch) {
      searchQuery = urlSearch.trim();
      $search.value = searchQuery;
      $searchClear.hidden = !searchQuery;
    }

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

  // Кількість товарів на сторінці
  $perPageSelect.addEventListener('change', () => {
    perPage = Number($perPageSelect.value);
    currentPage = 1;
    renderProducts();
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

// ─── Банерний слайдер ─────────────────────────────────
function initBanners() {
  const banners = (window.SHOP_CONFIG && window.SHOP_CONFIG.banners) || [];
  const section = document.getElementById('banners');
  const track   = document.getElementById('banner-track');
  const dots    = document.getElementById('banner-dots');
  const btnPrev = document.getElementById('banner-prev');
  const btnNext = document.getElementById('banner-next');

  if (!banners.length) { section.hidden = true; return; }
  section.hidden = false;
  if (banners.length === 1) { btnPrev.hidden = true; btnNext.hidden = true; }

  let current = 0;
  let timer;
  let startX = 0;

  banners.forEach((b, i) => {
    const slide = document.createElement('div');
    slide.className = 'banner-slide';

    const img = document.createElement('img');
    const isMobile = window.matchMedia('(max-width: 600px)').matches;
    img.src = (isMobile && b.imageMobile) ? b.imageMobile : b.image;
    img.alt = b.title || `Банер ${i + 1}`;
    img.loading = 'lazy';

    // Переключаємо фото при зміні розміру вікна
    const mq = window.matchMedia('(max-width: 600px)');
    mq.addEventListener('change', e => {
      img.src = (e.matches && b.imageMobile) ? b.imageMobile : b.image;
    });

    slide.appendChild(img);

    if (b.title) {
      const cap = document.createElement('div');
      cap.className = 'banner-caption';
      cap.textContent = b.title;
      slide.appendChild(cap);
    }

    if (b.link) {
      slide.style.cursor = 'pointer';
      slide.addEventListener('click', () => { window.location.href = b.link; });
    }

    track.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'banner-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Банер ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dots.appendChild(dot);
  });

  function goTo(idx) {
    current = (idx + banners.length) % banners.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.querySelectorAll('.banner-dot').forEach((d, i) =>
      d.classList.toggle('active', i === current)
    );
  }

  function startAuto() { timer = setInterval(() => goTo(current + 1), 5000); }
  function stopAuto()  { clearInterval(timer); }

  btnPrev.addEventListener('click', () => { stopAuto(); goTo(current - 1); startAuto(); });
  btnNext.addEventListener('click', () => { stopAuto(); goTo(current + 1); startAuto(); });

  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { stopAuto(); goTo(current + (diff > 0 ? 1 : -1)); startAuto(); }
  }, { passive: true });

  section.addEventListener('mouseenter', stopAuto);
  section.addEventListener('mouseleave', startAuto);

  startAuto();
}

// ─── Слайдер оголошень ────────────────────────────────
function initAnnouncements() {
  const slides = (window.SHOP_CONFIG && window.SHOP_CONFIG.announcements) || [];
  const bar    = document.getElementById('announce-bar');
  const track  = document.getElementById('announce-track');
  const dots   = document.getElementById('announce-dots');
  const btnPrev = document.getElementById('announce-prev');
  const btnNext = document.getElementById('announce-next');

  if (!slides.length) { bar.hidden = true; return; }
  if (slides.length === 1) {
    btnPrev.hidden = true;
    btnNext.hidden = true;
  }

  let current = 0;
  let timer;

  slides.forEach((text, i) => {
    const slide = document.createElement('div');
    slide.className = 'announce-slide';
    slide.textContent = text;
    track.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'announce-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Оголошення ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dots.appendChild(dot);
  });

  function goTo(idx) {
    current = (idx + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.querySelectorAll('.announce-dot').forEach((d, i) =>
      d.classList.toggle('active', i === current)
    );
  }

  function startAuto() {
    timer = setInterval(() => goTo(current + 1), 4000);
  }

  function stopAuto() { clearInterval(timer); }

  btnPrev.addEventListener('click', () => { stopAuto(); goTo(current - 1); startAuto(); });
  btnNext.addEventListener('click', () => { stopAuto(); goTo(current + 1); startAuto(); });
  bar.addEventListener('mouseenter', stopAuto);
  bar.addEventListener('mouseleave', startAuto);

  startAuto();
}

// ─── Старт ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyConfig();
  initAnnouncements();
  initBanners();
  bindEvents();
  loadProducts();
});
