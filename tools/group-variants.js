/**
 * group-variants.js
 *
 * Позначає у products.json товари, які є однією моделлю в різних розмірах,
 * щоб сайт показував їх однією карткою з вибором розміру.
 *
 * Кожному товару з такої групи додаються поля:
 *   group     — спільний ключ групи (категорія + назва без розміру)
 *   size      — підпис розміру ("S", "M 40", "3" тощо)
 *   baseName  — назва без розміру (для картки)
 *   sizeOrder — порядок розміру в групі (XS → XL, 1 → 6)
 * Товари поза групами цих полів не мають.
 *
 * Група створюється лише якщо в одній категорії є щонайменше два товари
 * з однаковою назвою (без розміру) і різними розмірами.
 *
 * Запуск вручну (оновлює products.json на місці):  npm run group:variants
 * Також викликається автоматично в кінці npm run fetch:products
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.resolve(__dirname, '../products.json');

const SIZE = '(?:XXS|XS-S|M-L|XS|2XL|3XL|4XL|XXL|XL|S|M|L|М)'; // остання М — кирилична
const ALNUM = 'A-Za-zА-Яа-яІіЇїЄєҐґ0-9';
const SIZE_RE = new RegExp(
  `(?:(?:розмір|р\\.)\\s*)?(?<![${ALNUM}'’ʼ])(${SIZE})(?:\\s?(\\d{2}(?:[.,]\\d)?)(?:\\s?см)?)?(?![${ALNUM}])`,
  'gu'
);
const RANK = ['XXS', 'XS', 'XS-S', 'S', 'M', 'M-L', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];

function tidy(s) {
  return s
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,;])(?=[^\s\d])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, '');
}

/** Повертає { base, size } або null, якщо в назві не знайдено однозначного розміру */
function splitSize(product) {
  const name = String(product.name || '');
  const sku = String(product.sku || '');

  // Трикотаж/шапки: артикул виду "Y-398/3", назва закінчується на " 3"
  const skuMatch = sku.match(/^(.+)\/(\d{1,2})$/);
  if (skuMatch && new RegExp(`\\s${skuMatch[2]}$`).test(name)) {
    return { base: tidy(name.slice(0, -skuMatch[2].length)), size: skuMatch[2] };
  }

  const matches = [...name.matchAll(SIZE_RE)];
  if (matches.length !== 1) return null;
  const m = matches[0];
  const letters = m[1].replace('М', 'M');
  const size = m[2] ? `${letters} ${m[2].replace(',', '.')}` : letters;
  const base = tidy(`${name.slice(0, m.index)} ${name.slice(m.index + m[0].length)}`);
  return { base, size };
}

function sizeSortKey(label) {
  const m = String(label).match(/^([A-Z0-9-]*?)(?:\s(\d+(?:\.\d)?))?$/);
  const letters = m ? m[1] : label;
  const num = m && m[2] ? parseFloat(m[2]) : 0;
  const rank = RANK.indexOf(letters);
  if (rank === -1 && /^\d+$/.test(letters)) return [-1, parseFloat(letters)];
  return [rank === -1 ? 99 : rank, num];
}

function normalizeKey(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Додає group/size/baseName; повертає { groups, items } зі статистикою */
function annotateVariants(products) {
  for (const p of products) {
    delete p.group;
    delete p.size;
    delete p.baseName;
    delete p.sizeOrder;
  }

  const buckets = new Map();
  for (const p of products) {
    const parts = splitSize(p);
    if (!parts || !parts.base) continue;
    const key = `${p.category}|${normalizeKey(parts.base)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ p, ...parts });
  }

  let groups = 0;
  let items = 0;
  for (const [key, members] of buckets) {
    const sizes = new Set(members.map(m => m.size));
    if (sizes.size < 2 || members.length !== sizes.size) continue; // однакові розміри двічі — не чіпаємо
    members.sort((a, b) => {
      const ka = sizeSortKey(a.size), kb = sizeSortKey(b.size);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
    const baseName = members[0].base;
    members.forEach((m, i) => {
      m.p.group = key;
      m.p.size = m.size;
      m.p.baseName = baseName;
      m.p.sizeOrder = i;
    });
    groups += 1;
    items += members.length;
  }
  return { groups, items };
}

module.exports = { annotateVariants, splitSize };

if (require.main === module) {
  const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
  const { groups, items } = annotateVariants(products);
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`✅ Груп розмірів: ${groups}, товарів у групах: ${items}`);
}
