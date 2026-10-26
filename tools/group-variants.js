/**
 * group-variants.js
 *
 * Позначає у products.json товари, які є однією моделлю у різних варіантах
 * (розмір одягу, вага/об'єм упаковки, кількість у пачці, довжина), щоб сайт
 * показував їх однією карткою з вибором варіанту.
 *
 * Кожному товару з такої групи додаються поля:
 *   group     — спільний ключ групи (категорія + тип варіанту + назва без варіанту)
 *   size      — підпис варіанту ("S", "M 40", "2 кг", "10 шт" тощо)
 *   baseName  — назва без варіанту (для картки)
 *   sizeOrder — порядок варіанту в групі (від меншого до більшого)
 * Товари поза групами цих полів не мають.
 *
 * Група створюється лише якщо в одній категорії є щонайменше два товари
 * з однаковою назвою (без варіанту) і різними значеннями варіанту.
 *
 * Захист від хибних цін. Якщо товар у RO App продається на вагу (одиниця виміру
 * не «шт», поле unit ≠ 1), його ціна — за кілограм, а не за мішок, тож у групу
 * він не потрапляє. Так само відкидається варіант, який за вагою/кількістю більший,
 * а коштує менше за менший варіант (ознака ціни за кілограм/штуку). Такі товари
 * лишаються окремими картками, а їх список виводиться в консоль.
 *
 * Запуск вручну (оновлює products.json на місці):  npm run group:variants
 * Також викликається автоматично в кінці npm run fetch:products
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.resolve(__dirname, '../products.json');

const ALNUM = 'A-Za-zА-Яа-яІіЇїЄєҐґ0-9';

// ─── Допоміжне ────────────────────────────────────────────────────────────────

function tidy(s) {
  return s
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,;])(?=[^\s\d])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, '');
}

function normalizeKey(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── Тип 1: розмір одягу та амуніції ──────────────────────────────────────────

const SIZE = '(?:XXS|XS-S|M-L|XS|2XL|3XL|4XL|XXL|XL|S|M|L|М)'; // остання М — кирилична
const SIZE_RE = new RegExp(
  `(?:(?:розмір|р\\.)\\s*)?(?<![${ALNUM}'’ʼ])(${SIZE})(?:\\s?(\\d{2}(?:[.,]\\d)?)(?:\\s?см)?)?(?![${ALNUM}])`,
  'gu'
);
const RANK = ['XXS', 'XS', 'XS-S', 'S', 'M', 'M-L', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];

function sizeSortValue(label) {
  const m = String(label).match(/^([A-Z0-9-]*?)(?:\s(\d+(?:\.\d)?))?$/);
  const letters = m ? m[1] : label;
  const num = m && m[2] ? parseFloat(m[2]) : 0;
  const rank = RANK.indexOf(letters);
  if (rank === -1 && /^\d+$/.test(letters)) return parseFloat(letters) - 1000;
  return (rank === -1 ? 99 : rank) * 1000 + num;
}

function splitSize(product) {
  const name = String(product.name || '');
  const sku = String(product.sku || '');

  // Трикотаж/шапки: артикул виду "Y-398/3", назва закінчується на " 3"
  const skuMatch = sku.match(/^(.+)\/(\d{1,2})$/);
  if (skuMatch && new RegExp(`\\s${skuMatch[2]}$`).test(name)) {
    return { base: tidy(name.slice(0, -skuMatch[2].length)), label: skuMatch[2] };
  }

  const matches = [...name.matchAll(SIZE_RE)];
  if (matches.length !== 1) return null;
  const m = matches[0];
  const letters = m[1].replace('М', 'M');
  const label = m[2] ? `${letters} ${m[2].replace(',', '.')}` : letters;
  const base = tidy(`${name.slice(0, m.index)} ${name.slice(m.index + m[0].length)}`);
  return { base, label };
}

// ─── Тип 2–4: вага/об'єм, кількість, довжина ──────────────────────────────────

// Перед числом допускається множник упаковки: "6*15 г", "2х100 г"
function makeMeasureRe(units) {
  return new RegExp(
    `(?<![${ALNUM}])((?:\\d+\\s?[*xх×]\\s?)?\\d+(?:[.,]\\d+)?)\\s?(${units})(?![${ALNUM}])`,
    'gu'
  );
}

const TO_BASE = { 'кг': 1000, 'г': 1, 'л': 1000, 'мл': 1, 'шт': 1, 'м': 100, 'см': 1 };

function makeMeasureSplitter(units) {
  const re = makeMeasureRe(units);
  return function splitMeasure(product) {
    const name = String(product.name || '');
    const good = [];
    for (const m of name.matchAll(re)) {
      const before = name.slice(0, m.index).trimEnd();
      if (/(?:^|\s)(?:до|від|вагою|вагу|для)$/iu.test(before)) continue; // "до 15 кг" — не вага товару
      if (/\d\s?[-–]$/.test(before)) continue;                            // діапазон "4-10 кг"
      if (/\d\s?\+$/.test(before)) continue;                              // сума "0,2+0,2 кг"
      good.push(m);
    }
    if (good.length !== 1) return null;
    const m = good[0];
    const label = `${m[1].replace(/\s/g, '').replace('.', ',')} ${m[2]}`;
    const base = tidy(`${name.slice(0, m.index)} ${name.slice(m.index + m[0].length)}`);
    return { base, label };
  };
}

function measureValue(label) {
  const m = label.match(/^(?:(\d+)[*xх×])?(\d+(?:,\d+)?) (\S+)$/u);
  if (!m) return 0;
  return (m[1] ? parseInt(m[1], 10) : 1) * parseFloat(m[2].replace(',', '.')) * TO_BASE[m[3]];
}

// ─── Опис типів варіантів ─────────────────────────────────────────────────────

const DIMENSIONS = [
  { name: 'size',   split: splitSize,                         value: sizeSortValue, priceCheck: false },
  { name: 'weight', split: makeMeasureSplitter('кг|г'),     value: measureValue,  priceCheck: true },
  { name: 'volume', split: makeMeasureSplitter('л|мл'),     value: measureValue,  priceCheck: true },
  { name: 'count',  split: makeMeasureSplitter('шт'),         value: measureValue,  priceCheck: true },
  { name: 'length', split: makeMeasureSplitter('см|м'),       value: measureValue,  priceCheck: true },
];

// ─── Групування ───────────────────────────────────────────────────────────────

/**
 * Додає group/size/baseName/sizeOrder. Повертає статистику та список товарів,
 * які не потрапили до груп через підозрілу ціну.
 */
function annotateVariants(products) {
  for (const p of products) {
    delete p.group;
    delete p.size;
    delete p.baseName;
    delete p.sizeOrder;
  }

  const stats = { groups: 0, items: 0, byType: {}, suspicious: [] };

  for (const dim of DIMENSIONS) {
    const buckets = new Map();
    for (const p of products) {
      if (p.group) continue;
      const parts = dim.split(p);
      if (!parts || !parts.base) continue;
      const key = `${p.category}|${dim.name}|${normalizeKey(parts.base)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ p, ...parts, order: dim.value(parts.label) });
    }

    for (const [key, all] of buckets) {
      if (new Set(all.map(m => m.label)).size < 2) continue;
      let members = all;

      if (dim.priceCheck) {
        // Товари, що продаються на вагу, мають ціну за кг — у групу не беремо
        const weighed = members.filter(m => m.p.unit !== undefined && m.p.unit !== 1);
        stats.suspicious.push(...weighed.map(m => ({ name: m.p.name, price: m.p.price, why: 'ціна за одиницю ваги (unit≠1)' })));
        members = members.filter(m => !weighed.includes(m));

        // Більший варіант не може коштувати менше за менший
        members.sort((a, b) => a.order - b.order);
        const kept = [];
        for (const m of members) {
          if (kept.length && m.p.price < kept[kept.length - 1].p.price) {
            stats.suspicious.push({ name: m.p.name, price: m.p.price, why: 'дешевший за менший варіант' });
            continue;
          }
          kept.push(m);
        }
        members = kept;
      }

      const labels = new Set(members.map(m => m.label));
      if (labels.size < 2 || members.length !== labels.size) continue;

      members.sort((a, b) => a.order - b.order);
      const baseName = members[0].base;
      members.forEach((m, i) => {
        m.p.group = key;
        m.p.size = m.label;
        m.p.baseName = baseName;
        m.p.sizeOrder = i;
      });
      stats.groups += 1;
      stats.items += members.length;
      stats.byType[dim.name] = (stats.byType[dim.name] || 0) + 1;
    }
  }
  return stats;
}

module.exports = { annotateVariants };

if (require.main === module) {
  const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
  const { groups, items, byType, suspicious } = annotateVariants(products);
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`✅ Груп варіантів: ${groups}, товарів у групах: ${items}`, byType);
  if (suspicious.length) {
    console.log(`⚠️  Не об'єднано через підозрілу ціну (${suspicious.length}):`);
    suspicious.forEach(s => console.log(`   • ${s.name} — ${s.price} грн (${s.why})`));
  }
}
