/* ============================================================
   mhzaly — POS Billing (barcode, discount, hold bill, udhaar)
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal } from '../ui.js';
import { money, printReceipt, shareWhatsApp } from '../receipt-share.js';

const HELD_KEY = 'mhzaly_held_bills';

function shopTag() { return db.settings.shopName || 'shop'; }
function loadHeld() {
  try {
    const all = JSON.parse(localStorage.getItem(HELD_KEY) || '[]');
    return Array.isArray(all) ? all.filter((h) => h.shop === shopTag()) : [];
  } catch { return []; }
}
function writeHeld(list) {
  try {
    let all = [];
    try { all = JSON.parse(localStorage.getItem(HELD_KEY) || '[]'); } catch { all = []; }
    all = (Array.isArray(all) ? all : []).filter((h) => h.shop !== shopTag());
    localStorage.setItem(HELD_KEY, JSON.stringify([...all, ...list]));
  } catch { /* ignore */ }
}

export function render(root) {
  const cart = [];
  let customerName = '';
  let customerPhone = '';
  let discountType = 'amount';
  let discountValue = 0;

  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>POS Billing</h2>
        <p>Scan barcode ya search karein, discount lagayein, aur invoice banayein.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" id="holdBtn" type="button" title="Bill hold karein">${icon('download')} Hold</button>
        <button class="btn btn-ghost" id="heldBtn" type="button" title="Held bills">${icon('return')} Held <span id="heldCount">0</span></button>
        <button class="btn btn-primary" id="checkoutBtn" disabled>${icon('check')} Checkout</button>
      </div>
    </div>

    <div class="grid k2 mt">
      <div class="card" style="min-height:520px">
        <div class="card-head"><h3>Add Product</h3><div class="right"><span class="hint">${icon('barcode')} Barcode scanner ready</span></div></div>
        <div class="card-pad">
          <div class="field mt-sm">
            <label>Search / scan product</label>
            <input class="input" id="posSearch" placeholder="Name, SKU ya barcode — Enter dabayein" autocomplete="off" />
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
            <input class="input" id="posCustomer" list="posCustomerList" placeholder="Walk-in" autocomplete="off" />
            <datalist id="posCustomerList">
              ${db.customers.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}
            </datalist>
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

          <div class="pos-discount">
            <div class="field">
              <label>Discount</label>
              <input class="input" id="posDiscount" type="number" min="0" step="0.01" value="0" placeholder="0" />
            </div>
            <div class="field" style="max-width:110px">
              <label>Type</label>
              <select class="input" id="posDiscountType">
                <option value="amount">${esc(db.settings.currency || 'Rs')}</option>
                <option value="percent">%</option>
              </select>
            </div>
          </div>

          <div class="pos-summary">
            <div class="pos-summary-row"><span>Subtotal</span><span id="posSubtotal">${money(0)}</span></div>
            <div class="pos-summary-row" id="posDiscountRow" hidden><span>Discount</span><span id="posDiscountAmt">${money(0)}</span></div>
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
  const discountEl = root.querySelector('#posDiscount');
  const discountTypeEl = root.querySelector('#posDiscountType');

  function cartTotals() {
    const subtotal = cart.reduce((sum, i) => sum + i.qty * i.price, 0);
    const rawDiscount = Number(discountValue) || 0;
    const discount = discountType === 'percent'
      ? Math.min(subtotal, Math.round(subtotal * Math.min(100, Math.max(0, rawDiscount))) / 100)
      : Math.min(subtotal, Math.max(0, rawDiscount));
    const taxable = Math.max(0, subtotal - discount);
    const rate = Math.max(0, Math.min(100, Number(db.settings.taxRate) || 0));
    const tax = Math.round(taxable * rate) / 100;
    return { subtotal, discount, taxable, rate, tax, total: taxable + tax };
  }

  function refresh() {
    listEl.innerHTML = renderProductList(db.products, cart);
    cartEl.innerHTML = renderCart(cart);
    const { subtotal, discount, rate, tax, total } = cartTotals();
    const subEl = root.querySelector('#posSubtotal');
    if (subEl) subEl.textContent = money(subtotal);
    const discRow = root.querySelector('#posDiscountRow');
    if (discRow) {
      discRow.hidden = !(discount > 0);
      root.querySelector('#posDiscountAmt').textContent = '− ' + money(discount);
    }
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
    const heldCount = root.querySelector('#heldCount');
    if (heldCount) heldCount.textContent = loadHeld().length;
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

  function filteredProducts() {
    const q = String(search.value || '').toLowerCase().trim();
    if (!q) return db.products;
    return db.products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    );
  }

  search.addEventListener('input', () => {
    listEl.innerHTML = renderProductList(filteredProducts(), cart);
  });

  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = String(search.value || '').trim().toLowerCase();
    if (!q) return;
    const bySku = db.products.find((p) => String(p.sku || '').trim().toLowerCase() === q);
    if (bySku) { addToCart(bySku.id); search.value = ''; listEl.innerHTML = renderProductList(db.products, cart); return; }
    const list = filteredProducts();
    const exact = list.find((p) => p.name.toLowerCase() === q);
    if (exact) { addToCart(exact.id); search.value = ''; listEl.innerHTML = renderProductList(db.products, cart); return; }
    if (list.length === 1) { addToCart(list[0].id); search.value = ''; listEl.innerHTML = renderProductList(db.products, cart); return; }
    toast('Product nahi mila — naam ya SKU check karein', 'error');
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
    const match = db.customers.find((c) => c.name.toLowerCase() === String(customerName || '').toLowerCase().trim());
    if (match && match.phone) {
      root.querySelector('#posPhone').value = match.phone;
      customerPhone = match.phone;
    }
  });
  root.querySelector('#posPhone').addEventListener('input', (e) => {
    customerPhone = e.target.value;
  });

  discountEl.addEventListener('input', (e) => {
    discountValue = Number(e.target.value) || 0;
    refresh();
  });
  discountTypeEl.addEventListener('change', (e) => {
    discountType = e.target.value === 'percent' ? 'percent' : 'amount';
    refresh();
  });

  function clearCart() {
    cart.length = 0;
    customerName = '';
    customerPhone = '';
    discountValue = 0;
    discountType = 'amount';
    root.querySelector('#posCustomer').value = '';
    root.querySelector('#posPhone').value = '';
    root.querySelector('#posDiscount').value = '0';
    root.querySelector('#posDiscountType').value = 'amount';
    root.querySelector('#posPayment').value = 'Cash';
    search.value = '';
    refresh();
  }

  root.querySelector('#holdBtn').addEventListener('click', () => {
    if (!cart.length) return toast('Cart khali hai', 'error');
    const held = loadHeld();
    held.push({
      id: uid('held'),
      shop: shopTag(),
      at: new Date().toISOString(),
      cart: cart.map((i) => ({ ...i })),
      customerName,
      customerPhone,
      discountType,
      discountValue,
    });
    writeHeld(held);
    clearCart();
    toast('Bill hold ho gaya');
  });

  root.querySelector('#heldBtn').addEventListener('click', () => {
    const held = loadHeld();
    if (!held.length) return toast('Koi held bill nahi hai');
    openModal({
      title: 'Held bills',
      subtitle: 'Resume karein ya delete karein',
      body: held.length
        ? `<div class="held-list">${held.map((h) => {
            const total = (h.cart || []).reduce((a, i) => a + i.qty * i.price, 0);
            return `<div class="held-row">
              <div class="grow">
                <b>${esc(h.customerName || 'Walk-in')}</b>
                <div class="small muted">${(h.cart || []).length} item(s) · ${money(total)} · ${new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <button class="btn btn-primary btn-sm" data-resume="${esc(h.id)}">Resume</button>
              <button class="btn btn-ghost btn-sm" data-drop="${esc(h.id)}" title="Delete">${icon('trash')}</button>
            </div>`;
          }).join('')}</div>`
        : '<div class="empty-state">Koi held bill nahi.</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Close</button>',
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        bd.querySelectorAll('[data-resume]').forEach((btn) => btn.addEventListener('click', () => {
          const bill = loadHeld().find((h) => h.id === btn.dataset.resume);
          if (!bill) return;
          cart.length = 0;
          for (const item of bill.cart || []) {
            const p = db.products.find((x) => x.id === item.id);
            if (p && (p.stock || 0) > 0) cart.push({ ...item, qty: Math.min(item.qty, p.stock || item.qty) });
          }
          customerName = bill.customerName || '';
          customerPhone = bill.customerPhone || '';
          discountType = bill.discountType || 'amount';
          discountValue = bill.discountValue || 0;
          root.querySelector('#posCustomer').value = customerName;
          root.querySelector('#posPhone').value = customerPhone;
          root.querySelector('#posDiscountType').value = discountType;
          root.querySelector('#posDiscount').value = discountValue;
          writeHeld(loadHeld().filter((h) => h.id !== bill.id));
          bd.remove();
          refresh();
          toast('Bill resume ho gaya');
        }));
        bd.querySelectorAll('[data-drop]').forEach((btn) => btn.addEventListener('click', () => {
          writeHeld(loadHeld().filter((h) => h.id !== btn.dataset.drop));
          bd.remove();
          refresh();
          toast('Held bill delete ho gaya');
        }));
      },
    });
  });

  checkoutBtn.addEventListener('click', () => {
    if (!cart.length) return toast('Cart is empty', 'error');
    const method = (root.querySelector('#posPayment') || {}).value || 'Cash';
    const name = (customerName || '').trim();
    if (method === 'Udhaar' && (!name || /^walk-in$/i.test(name))) {
      return toast('Udhaar ke liye customer ka naam zaroori hai', 'error');
    }
    const { subtotal, discount, rate, tax, total } = cartTotals();
    const sale = {
      id: uid('sale'),
      invoiceNo: 'INV-' + String(Date.now()).slice(-6),
      customerName: name || 'Walk-in',
      customerPhone: (customerPhone || '').trim(),
      items: [...cart],
      subtotal,
      discount,
      discountType,
      discountValue: Number(discountValue) || 0,
      taxRate: rate,
      tax,
      total,
      paymentMethod: method,
      createdAt: new Date().toISOString(),
    };

    db.sales.push(sale);
    for (const item of cart) {
      const p = db.products.find((x) => x.id === item.id);
      if (p) p.stock = Math.max(0, (p.stock || 0) - item.qty);
    }

    if (method === 'Udhaar') {
      let c = db.customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!c) {
        c = { id: uid('cust'), name, phone: sale.customerPhone, balance: 0, createdAt: new Date().toISOString() };
        db.customers.push(c);
      }
      c.balance = (Number(c.balance) || 0) + total;
      if (sale.customerPhone && !c.phone) c.phone = sale.customerPhone;
    }

    save();
    clearCart();
    showSaleComplete(sale);
  });

  refresh();
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

  const isCash = (sale.paymentMethod || 'Cash') === 'Cash';

  openModal({
    title: 'Sale complete',
    subtitle: `Invoice ${sale.invoiceNo}`,
    body: `
      <div class="sale-done">
        <div class="sale-done-ico">${icon('check')}</div>
        <div class="sale-done-total">${money(sale.total)}</div>
        <div class="sale-done-sub">${esc(sale.customerName || 'Walk-in')} · ${esc(sale.items.reduce((a, it) => a + (Number(it.qty) || 1), 0))} item(s) · ${esc(sale.paymentMethod || 'Cash')}</div>
      </div>
      ${Number(sale.discount) > 0 ? `<div class="small muted" style="text-align:center;margin:-4px 0 10px">Discount ${money(sale.discount)} applied</div>` : ''}
      ${isCash ? `
      <div class="cash-box">
        <div class="field">
          <label>Cash received</label>
          <input class="input" id="cashReceived" type="number" min="0" step="0.01" placeholder="${money(sale.total)}" />
        </div>
        <div class="cash-change">Change: <b id="cashChange">${money(0)}</b></div>
        <div class="cash-quick">
          ${[Math.ceil(Number(sale.total) / 100) * 100, Math.ceil(Number(sale.total) / 500) * 500, Math.ceil(Number(sale.total) / 1000) * 1000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => `<button class="btn btn-ghost btn-sm" type="button" data-cash="${v}">${money(v)}</button>`).join('')}
        </div>
      </div>` : ''}
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
      const cashInput = bd.querySelector('#cashReceived');
      const changeEl = bd.querySelector('#cashChange');
      const updateChange = () => {
        const received = Number(cashInput?.value) || 0;
        const change = Math.max(0, received - (Number(sale.total) || 0));
        if (changeEl) changeEl.textContent = money(change);
        sale.cashReceived = received;
        sale.change = change;
      };
      if (cashInput) {
        cashInput.addEventListener('input', updateChange);
        bd.querySelectorAll('[data-cash]').forEach((btn) => btn.addEventListener('click', () => {
          cashInput.value = btn.dataset.cash;
          updateChange();
        }));
        setTimeout(() => cashInput.focus(), 80);
      }
      bd.querySelector('#salePrint').addEventListener('click', () => { updateChange(); save(); printReceipt(sale); });
      bd.querySelector('#saleWhatsapp').addEventListener('click', () => {
        const phone = bd.querySelector('#salePhone').value;
        sale.customerPhone = String(phone || '').trim();
        updateChange();
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
