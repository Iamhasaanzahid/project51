/* ============================================================
   mhzaly — POS Billing (fixed + WhatsApp receipt)
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal } from '../ui.js';
import { money, printReceipt, shareWhatsApp } from '../receipt-share.js';

export function render(root) {
  const cart = [];
  let customerName = '';
  let customerPhone = '';

  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>POS Billing</h2>
        <p>Scan or search products, add to cart, and create an invoice.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" id="checkoutBtn" disabled>${icon('check')} Checkout</button>
      </div>
    </div>

    <div class="grid k2 mt">
      <div class="card" style="min-height:520px">
        <div class="card-head"><h3>Add Product</h3></div>
        <div class="card-pad">
          <div class="field mt-sm">
            <label>Search product</label>
            <input class="input" id="posSearch" placeholder="Name, SKU or barcode" />
          </div>
          <div id="posProductList" class="pos-list">${renderProductList(db.products, cart)}</div>
        </div>
      </div>

      <div class="card" style="min-height:520px">
        <div class="card-head"><h3>Cart</h3><span class="right" id="posCount">0 items</span></div>
        <div class="card-pad">
          <div id="posCart" class="pos-cart">${renderCart(cart)}</div>

          <div class="field" style="margin-top:12px">
            <label>Customer name (optional)</label>
            <input class="input" id="posCustomer" placeholder="Walk-in" />
          </div>
          <div class="field">
            <label>Phone (WhatsApp receipt ke liye)</label>
            <input class="input" id="posPhone" placeholder="03xx-xxxxxxx" inputmode="tel" />
          </div>
          <div class="field">
            <label>Payment method</label>
            <select class="input" id="posPayment">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Online">Online / Bank</option>
              <option value="Udhaar">Udhaar (credit)</option>
            </select>
          </div>

          <div class="pos-summary">
            <div class="pos-summary-row"><span>Subtotal</span><span id="posSubtotal">${money(0)}</span></div>
            <div class="pos-summary-row" id="posTaxRow" hidden><span>Tax (<span id="posTaxRate">0</span>%)</span><span id="posTax">${money(0)}</span></div>
          </div>
          <div class="pos-total">
            <span>Total</span><span id="posTotal">${money(0)}</span>
          </div>
        </div>
      </div>
    </div>`;

  const listEl = root.querySelector('#posProductList');
  const cartEl = root.querySelector('#posCart');
  const totalEl = root.querySelector('#posTotal');
  const countEl = root.querySelector('#posCount');
  const checkoutBtn = root.querySelector('#checkoutBtn');
  const search = root.querySelector('#posSearch');

  function cartTotals() {
    const subtotal = cart.reduce((sum, i) => sum + i.qty * i.price, 0);
    const rate = Math.max(0, Math.min(100, Number(db.settings.taxRate) || 0));
    const tax = Math.round(subtotal * rate) / 100;
    return { subtotal, rate, tax, total: subtotal + tax };
  }

  function refresh() {
    listEl.innerHTML = renderProductList(db.products, cart);
    cartEl.innerHTML = renderCart(cart);
    const { subtotal, rate, tax, total } = cartTotals();
    const subEl = root.querySelector('#posSubtotal');
    if (subEl) subEl.textContent = money(subtotal);
    const taxRow = root.querySelector('#posTaxRow');
    if (taxRow) {
      taxRow.hidden = !(rate > 0);
      root.querySelector('#posTaxRate').textContent = rate;
      root.querySelector('#posTax').textContent = money(tax);
    }
    totalEl.textContent = money(total);
    const count = cart.reduce((sum, i) => sum + i.qty, 0);
    countEl.textContent = count + ' item' + (count === 1 ? '' : 's');
    checkoutBtn.disabled = cart.length === 0;
  }

  function addToCart(id) {
    const p = db.products.find((x) => x.id === id);
    if (!p) return;
    if ((p.stock || 0) <= 0) return toast('Ye product out of stock hai', 'error');
    const existing = cart.find((i) => i.id === id);
    if (existing) {
      if (existing.qty >= (p.stock || 0)) return toast('Stock limit reached', 'error');
      existing.qty += 1;
    } else {
      cart.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: 1 });
    }
    refresh();
  }

  function changeQty(id, delta) {
    const item = cart.find((i) => i.id === id);
    if (!item) return;
    const p = db.products.find((x) => x.id === id);
    const max = p ? p.stock || 0 : 9999;
    item.qty += delta;
    if (item.qty <= 0) {
      const idx = cart.findIndex((i) => i.id === id);
      cart.splice(idx, 1);
    } else if (p && item.qty > max) {
      item.qty = max;
      toast('Stock limit reached', 'error');
    }
    refresh();
  }

  function removeFromCart(id) {
    const idx = cart.findIndex((i) => i.id === id);
    if (idx >= 0) cart.splice(idx, 1);
    refresh();
  }

  search.addEventListener('input', (e) => {
    const q = String(e.target.value || '').toLowerCase();
    const filtered = db.products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    );
    listEl.innerHTML = renderProductList(filtered, cart);
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    addToCart(btn.dataset.add);
  });

  cartEl.addEventListener('click', (e) => {
    const inc = e.target.closest('[data-inc]');
    if (inc) return changeQty(inc.dataset.inc, 1);
    const dec = e.target.closest('[data-dec]');
    if (dec) return changeQty(dec.dataset.dec, -1);
    const rem = e.target.closest('[data-remove]');
    if (rem) return removeFromCart(rem.dataset.remove);
  });

  root.querySelector('#posCustomer').addEventListener('input', (e) => {
    customerName = e.target.value;
  });
  root.querySelector('#posPhone').addEventListener('input', (e) => {
    customerPhone = e.target.value;
  });

  checkoutBtn.addEventListener('click', () => {
    if (!cart.length) return toast('Cart is empty', 'error');
    const { subtotal, rate, tax, total } = cartTotals();
    const sale = {
      id: uid('sale'),
      invoiceNo: 'INV-' + String(Date.now()).slice(-6),
      customerName: (customerName || '').trim() || 'Walk-in',
      customerPhone: (customerPhone || '').trim(),
      items: [...cart],
      subtotal,
      taxRate: rate,
      tax,
      total,
      paymentMethod: (root.querySelector('#posPayment') || {}).value || 'Cash',
      createdAt: new Date().toISOString(),
    };

    db.sales.push(sale);
    for (const item of cart) {
      const p = db.products.find((x) => x.id === item.id);
      if (p) p.stock = Math.max(0, (p.stock || 0) - item.qty);
    }
    save();

    cart.length = 0;
    customerName = '';
    customerPhone = '';
    root.querySelector('#posCustomer').value = '';
    root.querySelector('#posPhone').value = '';
    search.value = '';
    refresh();

    showSaleComplete(sale);
  });
}

function showSaleComplete(sale) {
  const rows = (sale.items || [])
    .map(
      (it) =>
        `<tr><td>${esc(it.name)}</td><td style="text-align:center">${esc(it.qty)}</td><td style="text-align:right">${money(
          (Number(it.qty) || 1) * (Number(it.price) || 0)
        )}</td></tr>`
    )
    .join('');

  openModal({
    title: 'Sale complete',
    subtitle: `Invoice ${sale.invoiceNo}`,
    body: `
      <div class="sale-done">
        <div class="sale-done-ico">${icon('check')}</div>
        <div class="sale-done-total">${money(sale.total)}</div>
        <div class="sale-done-sub">${esc(sale.customerName || 'Walk-in')} · ${esc(sale.items.reduce((a, it) => a + (Number(it.qty) || 1), 0))} item(s) · ${esc(sale.paymentMethod || 'Cash')}</div>
      </div>
      <div class="table-wrap">
        <table style="width:100%">
          <thead><tr><th style="text-align:left">Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="field" style="margin-top:14px">
        <label>Customer phone (WhatsApp)</label>
        <input class="input" id="salePhone" value="${esc(sale.customerPhone || '')}" placeholder="03xx-xxxxxxx" inputmode="tel" />
      </div>`,
    footer: `
      <button class="btn btn-ghost" data-close-sale>Done</button>
      <button class="btn btn-ghost" id="salePrint">${icon('download')} Print</button>
      <button class="btn btn-primary" id="saleWhatsapp">${icon('check')} WhatsApp</button>`,
    onMount: (bd) => {
      bd.querySelector('[data-close-sale]').addEventListener('click', () => bd.remove());
      bd.querySelector('#salePrint').addEventListener('click', () => printReceipt(sale));
      bd.querySelector('#saleWhatsapp').addEventListener('click', () => {
        const phone = bd.querySelector('#salePhone').value;
        sale.customerPhone = String(phone || '').trim();
        save();
        shareWhatsApp(sale, phone);
      });
    },
  });
}

function renderProductList(products, cart) {
  if (!products.length) return '<div class="pos-empty">No products found.</div>';
  const qtyMap = new Map(cart.map((i) => [i.id, i.qty]));
  return products
    .map((p) => {
      const hasStock = (p.stock || 0) > 0;
      const inCart = qtyMap.get(p.id) || 0;
      return `<div class="pos-row">
        <div class="grow">
          <div class="pos-name">${esc(p.name)}</div>
          <div class="pos-meta">${esc(p.sku || '')}${p.category ? ' · ' + esc(p.category) : ''}</div>
          <div class="pos-meta">Stock: ${esc(p.stock)} · ${money(p.price)}</div>
        </div>
        <button class="btn btn-primary btn-sm" ${!hasStock ? 'disabled' : ''} data-add="${esc(p.id)}">
          ${icon('plus')}${inCart ? ` <span>${inCart}</span>` : ''}
        </button>
      </div>`;
    })
    .join('');
}

function renderCart(cart) {
  if (!cart.length) return '<div class="pos-empty">Cart is empty. Left se products add karein.</div>';
  return cart
    .map(
      (i) => `
    <div class="pos-row">
      <div class="grow">
        <div class="pos-name">${esc(i.name)}</div>
        <div class="pos-meta">${money(i.price)} each</div>
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" data-dec="${esc(i.id)}">−</button>
        <span class="qty-val">${i.qty}</span>
        <button class="qty-btn" data-inc="${esc(i.id)}">+</button>
        <button class="qty-del" data-remove="${esc(i.id)}" title="Remove">${icon('trash')}</button>
      </div>
    </div>`
    )
    .join('');
}
