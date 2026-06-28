/**
 * fetch-ro-products.js
 *
 * Локальний скрипт для імпорту товарів із RO App API.
 * Запускається вручну командою: npm run fetch:products
 *
 * БЕЗПЕКА: API-ключ читається тільки з локального файлу .env
 * і НІКОЛИ не потрапляє у products.json або будь-який публічний файл.
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// ─── Константи ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.roapp.io/v2';
const OUTPUT_FILE = path.resolve(__dirname, '../products.json');
const DEBUG_DIR = path.resolve(__dirname, '../debug');

// Затримка між запитами (мс) — щоб не перевищити ліміт запитів API
const REQUEST_DELAY_MS = 300;

// Максимальна кількість сторінок пагінації (захист від нескінченного циклу)
const MAX_PAGES = 100;

// ─── Утиліти ──────────────────────────────────────────────────────────────────

/** Пауза між запитами */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Зберігає debug-відповідь у файл без API-ключа.
 * Використовується коли структура відповіді несподівана.
 */
function saveDebugResponse(filename, data) {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
  const filepath = path.join(DEBUG_DIR, filename);
  // Переконуємось що ключ не потрапив у debug
  const safeData = JSON.stringify(data, null, 2)
    .replace(/"Authorization":\s*"Bearer [^"]+"/g, '"Authorization": "Bearer [REDACTED]"');
  fs.writeFileSync(filepath, safeData, 'utf-8');
  console.log(`  ⚠️  Debug-відповідь збережена: ${filepath}`);
}

// ─── HTTP-запит із обробкою помилок ───────────────────────────────────────────

/**
 * Виконує GET-запит до RO App API.
 * Обробляє типові HTTP-помилки з зрозумілими повідомленнями.
 *
 * @param {string} url — повна URL-адреса ендпоінту
 * @param {string} apiKey — Bearer-токен
 * @returns {Promise<object>} — розпарсений JSON або null при помилці
 */
async function apiGet(url, apiKey) {
  let response;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  } catch (networkError) {
    console.error(`\n❌ Мережева помилка при запиті ${url}`);
    console.error(`   ${networkError.message}`);
    console.error('   Перевірте підключення до інтернету.');
    return null;
  }

  // ── Обробка HTTP-статусів ──────────────────────────────────────────────────

  if (response.status === 401) {
    console.error('\n❌ Помилка 401 — Неавторизовано.');
    console.error('   Можливі причини:');
    console.error('   • API-ключ неправильний або застарілий.');
    console.error('   • Файл .env не знайдено або в ньому порожній RO_APP_API_KEY.');
    console.error('   Дія: створіть новий API-ключ у RO App та оновіть .env');
    return null;
  }

  if (response.status === 403) {
    console.error('\n❌ Помилка 403 — Доступ заборонено.');
    console.error('   Можливі причини:');
    console.error('   • API-ключ не має прав для читання каталогу.');
    console.error('   • IP-адреса заблокована в налаштуваннях RO App.');
    console.error('   Дія: перевірте права доступу ключа у панелі RO App.');
    return null;
  }

  if (response.status === 429) {
    // Намагаємось отримати заголовок Retry-After
    const retryAfter = response.headers.get('Retry-After') || '60';
    const waitSeconds = parseInt(retryAfter, 10) || 60;
    console.warn(`\n⚠️  Помилка 429 — Забагато запитів. Чекаємо ${waitSeconds} секунд...`);
    await sleep(waitSeconds * 1000);
    // Повторний запит
    return apiGet(url, apiKey);
  }

  if (response.status >= 500) {
    console.error(`\n❌ Помилка сервера ${response.status} — RO App API тимчасово недоступний.`);
    console.error('   Спробуйте запустити скрипт пізніше.');
    return null;
  }

  if (!response.ok) {
    console.error(`\n❌ Несподіваний статус відповіді: ${response.status} ${response.statusText}`);
    return null;
  }

  // ── Розбираємо JSON ────────────────────────────────────────────────────────

  let json;
  try {
    json = await response.json();
  } catch (parseError) {
    console.error('\n❌ Не вдалося розпарсити JSON-відповідь API.');
    console.error(`   ${parseError.message}`);
    return null;
  }

  return json;
}

// ─── Отримання категорій ──────────────────────────────────────────────────────

/**
 * Отримує всі категорії з RO App API.
 * Повертає Map: { categoryId -> categoryName }
 */
async function fetchCategories(apiKey) {
  console.log('\n📂 Отримуємо категорії товарів...');

  const url = `${BASE_URL}/catalog/products/categories`;
  const data = await apiGet(url, apiKey);

  if (!data) {
    console.warn('   Категорії не отримані. Товари будуть без категорій.');
    return new Map();
  }

  // RO App може повернути масив або об'єкт із масивом
  const list = Array.isArray(data) ? data : (data.data || data.items || data.categories || []);

  if (!Array.isArray(list) || list.length === 0) {
    console.warn('   Категорії не знайдені або несподівана структура відповіді.');
    saveDebugResponse('categories-response.json', data);
    return new Map();
  }

  const categoryMap = new Map();
  for (const cat of list) {
    // Підтримуємо різні варіанти назв полів
    const id = cat.id ?? cat.category_id ?? cat.categoryId;
    const name = cat.name ?? cat.title ?? cat.category_name ?? 'Без категорії';
    if (id !== undefined) {
      categoryMap.set(String(id), name);
    }
  }

  console.log(`   ✓ Знайдено категорій: ${categoryMap.size}`);
  return categoryMap;
}

// ─── Отримання товарів із пагінацією ─────────────────────────────────────────

/**
 * Отримує всі товари з RO App API, підтримуючи пагінацію.
 * Повертає сирий масив товарів із API.
 */
async function fetchAllProducts(apiKey) {
  console.log('\n🛒 Отримуємо товари...');

  const allProducts = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES) {
    const url = `${BASE_URL}/catalog/products?page=${page}&per_page=50`;
    console.log(`   Сторінка ${page}...`);

    const data = await apiGet(url, apiKey);

    if (!data) {
      // Критична помилка — зупиняємо
      return null;
    }

    // Визначаємо масив товарів залежно від структури відповіді
    let items = [];

    if (Array.isArray(data)) {
      // API повернув просто масив
      items = data;
      hasMore = data.length === 50; // якщо повна сторінка — можливо є ще
    } else if (data.data && Array.isArray(data.data)) {
      // { data: [...], meta: { total_pages: N, ... } }
      items = data.data;

      // Перевіряємо мета-інформацію про пагінацію
      // RO App повертає: { paging: { page, total_pages, ... } }
      const paging = data.paging || data.meta || data.pagination || {};
      const totalPages = paging.total_pages ?? paging.last_page ?? paging.totalPages;
      const currentPage = paging.page ?? paging.current_page ?? page;

      if (totalPages) {
        hasMore = currentPage < totalPages;
      } else {
        hasMore = items.length === 50;
      }
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
      hasMore = items.length === 50;
    } else if (data.products && Array.isArray(data.products)) {
      items = data.products;
      hasMore = items.length === 50;
    } else {
      // Несподівана структура — зберігаємо debug і зупиняємось
      console.warn('   ⚠️  Несподівана структура відповіді API.');
      saveDebugResponse(`products-page-${page}-response.json`, data);
      hasMore = false;
    }

    allProducts.push(...items);
    console.log(`   ✓ Сторінка ${page}: отримано ${items.length} товарів (всього: ${allProducts.length})`);

    if (hasMore) {
      page++;
      await sleep(REQUEST_DELAY_MS);
    }
  }

  if (page > MAX_PAGES) {
    console.warn(`\n⚠️  Досягнуто ліміт сторінок (${MAX_PAGES}). Можливо, не всі товари завантажені.`);
  }

  return allProducts;
}

// ─── Нормалізація товару ──────────────────────────────────────────────────────

/**
 * Перетворює сирий об'єкт товару з API у формат products.json.
 * Не включає службові поля, які не повинні бачити клієнти.
 *
 * @param {object} raw — сирий об'єкт товару з RO App API
 * @param {Map} categoryMap — Map категорій { id -> name }
 * @returns {object} — нормалізований товар
 */
function normalizeProduct(raw, categoryMap) {
  // ── ID та артикул ──────────────────────────────────────────────────────────
  const id = String(raw.id ?? raw.product_id ?? raw.productId ?? `product-${Math.random().toString(36).slice(2)}`);
  const sku = String(raw.sku ?? raw.article ?? raw.barcode ?? id);

  // ── Назва ──────────────────────────────────────────────────────────────────
  const name = raw.name ?? raw.title ?? raw.product_name ?? 'Без назви';

  // ── Категорія ──────────────────────────────────────────────────────────────
  let category = 'Без категорії';
  const catId = raw.category_id ?? raw.categoryId ?? raw.category?.id;
  if (catId && categoryMap.has(String(catId))) {
    category = categoryMap.get(String(catId));
  } else if (raw.category?.name) {
    category = raw.category.name;
  } else if (typeof raw.category === 'string' && raw.category) {
    category = raw.category;
  }

  // ── Ціна ───────────────────────────────────────────────────────────────────
  // RO App повертає ціни як об'єкт { "priceId": "1385.00", ... }
  // Беремо першу ненульову ціну з об'єкта prices, або звичайне поле price
  let price = 0;
  if (raw.prices && typeof raw.prices === 'object') {
    const priceValues = Object.values(raw.prices)
      .map(v => parseFloat(v) || 0)
      .filter(v => v > 0);
    price = priceValues[0] ?? 0;
  } else {
    const rawPrice = raw.price ?? raw.retail_price ?? raw.price_retail ?? 0;
    price = typeof rawPrice === 'string' ? parseFloat(rawPrice) || 0 : Number(rawPrice) || 0;
  }

  // ── Валюта ─────────────────────────────────────────────────────────────────
  // Якщо API не повертає валюту, використовуємо "грн"
  const currency = raw.currency ?? raw.currency_code ?? 'грн';

  // ── Опис ───────────────────────────────────────────────────────────────────
  const description = raw.description ?? raw.short_description ?? raw.desc ?? '';

  // ── Залишки та наявність ───────────────────────────────────────────────────
  let stock = 0;
  let availability = 'unknown';

  if (raw.stock !== undefined || raw.quantity !== undefined || raw.stock_quantity !== undefined) {
    stock = Number(raw.stock ?? raw.quantity ?? raw.stock_quantity) || 0;
    availability = stock > 0 ? 'in_stock' : 'out_of_stock';
  } else if (raw.in_stock !== undefined) {
    // Деякі API повертають булеве поле
    const inStock = Boolean(raw.in_stock);
    stock = inStock ? 1 : 0;
    availability = inStock ? 'in_stock' : 'out_of_stock';
  } else if (raw.availability) {
    // API сам вказує наявність рядком
    availability = raw.availability;
    stock = 0;
  } else {
    // API не повертає залишки — позначаємо як preorder
    availability = 'preorder';
  }

  // ── Фото ───────────────────────────────────────────────────────────────────
  // RO App повертає масив images: [{ image: "url", thumbnail: "url" }]
  let image = 'images/product-placeholder.jpg';
  if (raw.images && Array.isArray(raw.images) && raw.images.length > 0) {
    const first = raw.images[0];
    // Поле називається "image" всередині об'єкта масиву
    image = typeof first === 'string' ? first : (first.image ?? first.thumbnail ?? first.url ?? first.src ?? image);
  } else if (raw.image) {
    image = typeof raw.image === 'string' ? raw.image : (raw.image.url ?? raw.image.src ?? image);
  } else if (raw.main_image) {
    image = typeof raw.main_image === 'string' ? raw.main_image : (raw.main_image.url ?? image);
  }

  // ── Результат (тільки публічні поля) ──────────────────────────────────────
  return {
    id,
    sku,
    name,
    category,
    price,
    currency,
    description,
    stock,
    availability,
    image,
  };
}

// ─── Головна функція ──────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🐾 Зоомагазин — імпорт товарів із RO App API');
  console.log('═══════════════════════════════════════════════════');

  // ── Перевірка API-ключа ────────────────────────────────────────────────────
  const apiKey = process.env.RO_APP_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_new_ro_app_api_key_here') {
    console.error('\n❌ API-ключ не знайдено або не налаштовано.');
    console.error('   1. Скопіюйте .env.example у .env');
    console.error('      cp .env.example .env');
    console.error('   2. Відкрийте .env та вставте реальний API-ключ із RO App.');
    console.error('   3. Запустіть скрипт знову: npm run fetch:products');
    process.exit(1);
  }

  console.log('\n✓ API-ключ знайдено (перші 4 символи: ' + apiKey.slice(0, 4) + '***)');

  // ── Отримання категорій ────────────────────────────────────────────────────
  const categoryMap = await fetchCategories(apiKey);

  // ── Отримання товарів ──────────────────────────────────────────────────────
  const rawProducts = await fetchAllProducts(apiKey);

  // Якщо критична помилка під час запиту
  if (rawProducts === null) {
    console.error('\n❌ Не вдалося отримати товари. Перевірте помилки вище.');
    process.exit(1);
  }

  // ── Нормалізація ───────────────────────────────────────────────────────────
  console.log('\n⚙️  Нормалізуємо товари...');
  const products = rawProducts.map((raw) => normalizeProduct(raw, categoryMap));

  // ── Результат ──────────────────────────────────────────────────────────────
  if (products.length === 0) {
    console.warn('\n⚠️  Товарів не знайдено.');
    console.warn('   Можливі причини:');
    console.warn('   • Каталог у RO App порожній.');
    console.warn('   • API-ключ не має доступу до каталогу.');
    console.warn('   • Фільтри або статус товарів приховують їх.');
    console.warn('   products.json буде створений із порожнім масивом.');
  }

  // ── Збереження products.json ───────────────────────────────────────────────
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2), 'utf-8');

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  ✅ Готово! Імпортовано товарів: ${products.length}`);
  console.log(`  📄 Файл: ${OUTPUT_FILE}`);
  console.log('═══════════════════════════════════════════════════\n');
}

// ── Запуск ─────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error('\n❌ Непередбачена помилка:', err.message);
  process.exit(1);
});
