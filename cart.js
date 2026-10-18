/* ═══════════════════════════════════════════════════════
   cart.js — Кошик Щасливих лапок
   Зберігається в localStorage під ключем 'cart_v1'
   ═══════════════════════════════════════════════════════ */

const CART_KEY = 'cart_v1';

/* ─── Стан ──────────────────────────────────────────── */
let cart = [];

function loadCart() {
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { cart = []; }
}

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  catch {}
  updateCartUI();
}

/* ─── Операції ──────────────────────────────────────── */
function cartAdd(product) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty = Math.min(existing.qty + 1, 99);
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image || 'images/product-placeholder.jpg',
      qty: 1
    });
  }
  saveCart();
  showCartBounce();
}

function cartSetQty(id, qty) {
  if (qty < 1) { cartRemove(id); return; }
  const item = cart.find(i => i.id === id);
  if (item) { item.qty = Math.min(qty, 99); saveCart(); }
}

function cartRemove(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
}

function cartClear() {
  cart = [];
  saveCart();
}

function cartTotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function cartCount() {
  return cart.reduce((s, i) => s + i.qty, 0);
}

/* ─── UI: оновлення лічильника ──────────────────────── */
function updateCartUI() {
  const count = cartCount();
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = count;
    el.hidden = count === 0;
  });
  renderCartItems();
}

function showCartBounce() {
  const btn = document.getElementById('cart-btn');
  if (!btn) return;
  btn.classList.remove('cart-btn--bounce');
  void btn.offsetWidth;
  btn.classList.add('cart-btn--bounce');
  setTimeout(() => btn.classList.remove('cart-btn--bounce'), 400);
}

/* ─── Панель кошика ─────────────────────────────────── */
function openCart() {
  document.getElementById('cart-panel')?.removeAttribute('hidden');
  document.getElementById('cart-overlay')?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  renderCartItems();
}

function closeCart() {
  document.getElementById('cart-panel')?.setAttribute('hidden', '');
  document.getElementById('cart-overlay')?.setAttribute('hidden', '');
  document.body.style.overflow = '';
}

function renderCartItems() {
  const list = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  const empty = document.getElementById('cart-empty');
  if (!list) return;

  if (cart.length === 0) {
    list.innerHTML = '';
    if (empty) empty.removeAttribute('hidden');
    if (footer) footer.setAttribute('hidden', '');
    return;
  }

  if (empty) empty.setAttribute('hidden', '');
  if (footer) footer.removeAttribute('hidden');

  list.innerHTML = '';
  cart.forEach(item => {
    const li = document.createElement('div');
    li.className = 'cart-item';
    li.innerHTML = `
      <img class="cart-item__img" src="${escHtml(item.image)}" alt="${escHtml(item.name)}" onerror="this.src='images/product-placeholder.jpg'">
      <div class="cart-item__info">
        <div class="cart-item__name">${escHtml(item.name)}</div>
        <div class="cart-item__price">${(item.price * item.qty).toLocaleString('uk-UA')} грн</div>
        <div class="cart-item__controls">
          <button class="cart-qty-btn" data-id="${escHtml(item.id)}" data-delta="-1" aria-label="Зменшити">−</button>
          <span class="cart-qty-val">${item.qty}</span>
          <button class="cart-qty-btn" data-id="${escHtml(item.id)}" data-delta="1" aria-label="Збільшити">+</button>
          <button class="cart-remove-btn" data-id="${escHtml(item.id)}" aria-label="Видалити товар">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>`;
    list.appendChild(li);
  });

  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = cartTotal().toLocaleString('uk-UA') + ' грн';
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Обробники подій панелі ────────────────────────── */
function bindCartEvents() {
  document.getElementById('cart-btn')?.addEventListener('click', openCart);
  document.getElementById('cart-close')?.addEventListener('click', closeCart);
  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);

  document.getElementById('cart-items')?.addEventListener('click', e => {
    const qtyBtn = e.target.closest('.cart-qty-btn');
    const rmBtn  = e.target.closest('.cart-remove-btn');
    if (qtyBtn) {
      const id    = qtyBtn.dataset.id;
      const delta = parseInt(qtyBtn.dataset.delta, 10);
      const item  = cart.find(i => i.id === id);
      if (item) cartSetQty(id, item.qty + delta);
    }
    if (rmBtn) cartRemove(rmBtn.dataset.id);
  });

  document.getElementById('cart-checkout-btn')?.addEventListener('click', () => {
    if (cart.length === 0) return;
    window.location.href = 'checkout.html';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCart();
  });
}

/* ─── Ініціалізація ─────────────────────────────────── */
function initCart() {
  loadCart();
  bindCartEvents();
  updateCartUI();
}

/* ─── Публічне API для script.js ────────────────────── */
window.Cart = { add: cartAdd, open: openCart, count: cartCount };
