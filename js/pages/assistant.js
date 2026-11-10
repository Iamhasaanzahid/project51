/* ============================================================
   mhzaly — AI Assistant (offline, data-aware, free)
   Answers shop questions from the local database.
   ============================================================ */

import { db, lowStockProducts, totalReceivable } from '../db.js';
import { icon, esc } from '../ui.js';
import { money } from '../receipt-share.js';

export const meta = { title: 'AI Assistant', subtitle: 'Aap ke shop data se smart jawab' };

const EXAMPLES = [
  'Aaj ki sale kitni hai?',
  'Is mahine ka profit?',
  'Low stock products?',
  'Sab se zyada kya bika?',
  'Udhaar kitna hai?',
  'Aaj ka summary',
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function rangeBounds(kind) {
  const now = new Date();
  const today = startOfDay(now);
  if (kind === 'today') return [today, null];
  if (kind === 'yesterday') {
    const s = new Date(today);
    s.setDate(s.getDate() - 1);
    return [s, today];
  }
  if (kind === 'week') {
    const s = new Date(today);
    s.setDate(s.getDate() - 6);
    return [s, null];
  }
  if (kind === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), null];
  if (kind === 'year') return [new Date(now.getFullYear(), 0, 1), null];
  return [null, null];
}

const RANGE_LABEL = {
  today: 'Aaj',
  yesterday: 'Kal',
  week: 'Pichhle 7 din',
  month: 'Is mahine',
  year: 'Is saal',
  all: 'Ab tak',
};

function detectRange(q) {
  if (/\b(aaj|aj|today)\b/.test(q)) return 'today';
  if (/\b(kal|yesterday)\b/.test(q)) return 'yesterday';
  if (/\b(hafta|hafte|week)\b/.test(q)) return 'week';
  if (/\b(mahina|mahine|month)\b/.test(q)) return 'month';
  if (/\b(saal|year)\b/.test(q)) return 'year';
  if (/\b(total|kul|sab|all|overall)\b/.test(q)) return 'all';
  return 'today';
}

function inBounds(iso, [start, end]) {
  const t = new Date(iso || 0).getTime();
  if (start && t < start.getTime()) return false;
  if (end && t >= end.getTime()) return false;
  return true;
}

function salesIn(kind) {
  const b = rangeBounds(kind);
  return db.sales.filter((s) => inBounds(s.createdAt, b));
}

function expensesIn(kind) {
  const b = rangeBounds(kind);
  return db.expenses.filter((e) => inBounds(e.createdAt, b));
}

function profitOf(sales) {
  let p = 0;
  for (const s of sales) {
    if (Array.isArray(s.items) && s.items.length) {
      for (const it of s.items) {
        const prod = db.products.find((x) => x.id === it.id || x.id === it.productId);
        const cost = prod ? Number(prod.cost) || 0 : 0;
        const qty = Number(it.qty) || 1;
        p += ((Number(it.price) || 0) - cost) * qty;
      }
    } else if (s.productId) {
      const prod = db.products.find((x) => x.id === s.productId);
      const cost = prod ? Number(prod.cost) || 0 : 0;
      p += (Number(s.total) || 0) - cost * (Number(s.qty) || 1);
    }
  }
  return p;
}

function sum(list, key) {
  return list.reduce((a, x) => a + (Number(x[key]) || 0), 0);
}

function topProducts(sales, limit = 5) {
  const map = new Map();
  for (const s of sales) {
    for (const it of (s.items || [])) {
      const key = it.id || it.name;
      const row = map.get(key) || { name: it.name || 'Item', qty: 0, revenue: 0 };
      const qty = Number(it.qty) || 1;
      row.qty += qty;
      row.revenue += qty * (Number(it.price) || 0);
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

function paymentBreakdown(sales) {
  const map = new Map();
  for (const s of sales) {
    const m = s.paymentMethod || 'Cash';
    map.set(m, (map.get(m) || 0) + (Number(s.total) || 0));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

const SKIP_WORDS = new Set([
  'sale', 'sales', 'stock', 'price', 'rate', 'cost', 'profit', 'udhaar', 'udhar',
  'kharch', 'kharcha', 'expense', 'customer', 'customers', 'supplier', 'suppliers',
  'product', 'products', 'item', 'items', 'invoice', 'invoices', 'bill', 'bills',
  'report', 'reports', 'summary', 'hisab', 'aaj', 'kal', 'hafta', 'week', 'mahina',
  'month', 'saal', 'year', 'total', 'kul', 'kitna', 'kitni', 'kitne', 'hai', 'hain',
  'ka', 'ki', 'ke', 'low', 'out', 'the', 'and', 'for', 'kya', 'bika', 'bikta',
  'top', 'best', 'sab', 'se', 'zyada', 'kaisa', 'chal', 'raha', 'mujhe', 'batao',
]);

function findProduct(q) {
  const norm = q.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = new Set(norm.split(' ').filter(Boolean));
  let best = null;
  let bestScore = 0;
  for (const p of db.products) {
    const name = String(p.name || '').toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const nameTokens = name.split(' ').filter(Boolean);
    if (nameTokens.length && nameTokens.every((t) => words.has(t))) return p;
    const tokens = nameTokens.filter((t) => t.length > 2 && !SKIP_WORDS.has(t));
    if (!tokens.length) continue;
    const hits = tokens.filter((t) => words.has(t)).length;
    if (!hits) continue;
    const score = hits / Math.min(tokens.length, 2);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

function stat(label, value) {
  return `<div class="ai-stat"><span>${esc(label)}</span><b>${value}</b></div>`;
}

function summaryAnswer() {
  const sales = salesIn('today');
  const revenue = sum(sales, 'total');
  const gross = profitOf(sales);
  const exp = sum(expensesIn('today'), 'amount');
  const low = lowStockProducts();
  return `<b>📊 Aaj ka summary</b>${stat('Sale', money(revenue))}${stat('Invoices', sales.length)}${stat('Gross profit', money(gross))}${stat('Kharcha', money(exp))}${stat('Net profit', money(gross - exp))}${stat('Low stock items', low.length)}${stat('Total udhaar', money(totalReceivable()))}${low.length ? `<br><b>⚠️ Low stock:</b> ${low.slice(0, 6).map((p) => esc(p.name)).join(', ')}${low.length > 6 ? '…' : ''}` : ''}`;
}

function answer(raw) {
  const q = String(raw || '').toLowerCase().replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return 'Kuch likhein — jaise "aaj ki sale kitni hai?"';

  if (/^(salam|assalam|asalam|aoa|hi|hello|hey|hy)\b/.test(q)) {
    const today = salesIn('today');
    return `<b>Assalam-o-Alaikum! 👋</b><br>Main mhzaly AI hoon — aap ke shop data se jawab deta hoon.<br><br>${stat('Aaj ki sale', money(sum(today, 'total')))}${stat('Aaj ke invoices', today.length)}${stat('Low stock items', lowStockProducts().length)}<br>Aap poochh sakte hain: <i>"aaj ka summary"</i>, <i>"low stock"</i>, <i>"top product"</i>.`;
  }

  if (/\b(help|madad|kya kar sakte|kya kar sakti|commands|sikhao)\b/.test(q)) {
    return `<b>Main ye sab bata sakta hoon:</b><ul><li>Aaj / kal / hafte / mahine ki sale</li><li>Profit aur kharcha</li><li>Low stock aur out of stock</li><li>Sab se zyada bikne wale products</li><li>Customer udhaar (receivable)</li><li>Supplier payable</li><li>Kisi product ka stock/price</li><li>Aaj ka poora summary</li></ul>Bas apna sawal likhein.`;
  }

  if (/\b(low stock|stock kam|kam stock|khatam|out of stock|reorder|stock alert)\b/.test(q)) {
    const low = lowStockProducts().sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
    if (!low.length) return `✅ <b>Sab stock theek hai!</b> Koi product low stock mein nahi.`;
    return `<b>⚠️ Low stock / khatam hone wale products (${low.length}):</b><ul>${low.slice(0, 12).map((p) => `<li><b>${esc(p.name)}</b> — ${p.stock ?? 0} left <span style="color:#64748b">(alert ${p.lowStock ?? 5})</span></li>`).join('')}</ul>${low.length > 12 ? '<br>…aur baaki Products page par.' : ''}`;
  }

  if (/\b(top|best|sab se zyada|sabse zyada|zyada bika|best seller|bikta)\b/.test(q)) {
    const kind = detectRange(q);
    const top = topProducts(salesIn(kind));
    if (!top.length) return `Is duration (${RANGE_LABEL[kind]}) mein koi sale nahi hui.`;
    return `<b>🏆 Sab se zyada bikne wale products (${RANGE_LABEL[kind]}):</b><ul>${top.map((t, i) => `<li>${i + 1}. <b>${esc(t.name)}</b> — ${t.qty} qty · ${money(t.revenue)}</li>`).join('')}</ul>`;
  }

  if (/\b(udhaar|udhar|receivable|baqaya|lena|khata)\b/.test(q)) {
    const total = totalReceivable();
    const debtors = db.customers
      .filter((c) => (Number(c.balance) || 0) > 0)
      .sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
    if (!total) return `✅ <b>Koi udhaar baqi nahi.</b> Sab customers ka hisab clear hai.`;
    return `<b>💳 Total udhaar (receivable): ${money(total)}</b>${debtors.length ? `<ul>${debtors.slice(0, 10).map((c) => `<li><b>${esc(c.name)}</b> — ${money(c.balance)}${c.phone ? ` <span style="color:#64748b">(${esc(c.phone)})</span>` : ''}</li>`).join('')}</ul>` : ''}`;
  }

  if (/\b(supplier|payable|dena|daina)\b/.test(q)) {
    const payable = db.suppliers.reduce((a, s) => a + Math.max(0, Number(s.balance) || 0), 0);
    const list = db.suppliers
      .filter((s) => (Number(s.balance) || 0) > 0)
      .sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
    if (!payable) return `✅ <b>Suppliers ko koi payment baqi nahi.</b>`;
    return `<b>📤 Suppliers ko dena (payable): ${money(payable)}</b><ul>${list.slice(0, 10).map((s) => `<li><b>${esc(s.name)}</b> — ${money(s.balance)}</li>`).join('')}</ul>`;
  }

  if (/\b(kharch|kharcha|expense|cost)\b/.test(q)) {
    const kind = detectRange(q);
    const list = expensesIn(kind);
    const total = sum(list, 'amount');
    if (!list.length) return `Is duration (${RANGE_LABEL[kind]}) mein koi kharcha record nahi.`;
    const byCat = {};
    for (const e of list) {
      const k = e.category || 'Other';
      byCat[k] = (byCat[k] || 0) + (Number(e.amount) || 0);
    }
    return `<b>🧾 Kharcha (${RANGE_LABEL[kind]}): ${money(total)}</b><ul>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${esc(k)} — ${money(v)}</li>`).join('')}</ul>`;
  }

  if (/\b(profit|munafa|nafa|kamai|earning)\b/.test(q)) {
    const kind = detectRange(q);
    const sales = salesIn(kind);
    const revenue = sum(sales, 'total');
    const gross = profitOf(sales);
    const exp = sum(expensesIn(kind), 'amount');
    return `<b>📈 ${RANGE_LABEL[kind]} ka hisab:</b>${stat('Sale (revenue)', money(revenue))}${stat('Gross profit', money(gross))}${stat('Kharcha', money(exp))}${stat('Net profit', money(gross - exp))}${stat('Invoices', sales.length)}`;
  }

  if (/\b(tax|gst)\b/.test(q)) {
    const rate = Number(db.settings.taxRate) || 0;
    const kind = detectRange(q);
    const tax = salesIn(kind).reduce((a, s) => a + (Number(s.tax) || 0), 0);
    return `<b>🧮 Tax setting:</b> ${rate}%<br><b>${RANGE_LABEL[kind]} tax collected:</b> ${money(tax)}<br><span style="color:#64748b">Tax rate Settings → Billing preferences se change hota hai.</span>`;
  }

  if (/\b(sale|sales|bikri|revenue|turnover|bika|bill|invoice|order)\b/.test(q)) {
    const kind = detectRange(q);
    const sales = salesIn(kind);
    const revenue = sum(sales, 'total');
    const avg = sales.length ? revenue / sales.length : 0;
    const pay = paymentBreakdown(sales);
    return `<b>🧾 ${RANGE_LABEL[kind]} ki sale:</b>${stat('Total sale', money(revenue))}${stat('Invoices', sales.length)}${stat('Average bill', money(avg))}${pay.length ? `<br><b>Payment method:</b><ul>${pay.map(([m, v]) => `<li>${esc(m)} — ${money(v)}</li>`).join('')}</ul>` : ''}`;
  }

  const p = findProduct(q);
  if (p && /\b(stock|price|rate|cost|kitna|kitni|hai|ka|ki)\b/.test(q)) {
    return `<b>📦 ${esc(p.name)}</b>${stat('Stock', p.stock ?? 0)}${stat('Sale price', money(p.price))}${stat('Cost', money(p.cost))}${stat('Category', esc(p.category || '—'))}${stat('Low-stock alert', p.lowStock ?? 5)}`;
  }

  if (/\b(summary|hisab|report|overview|halat|kaisa chal|aaj ka)\b/.test(q)) {
    return summaryAnswer();
  }

  if (/\b(kitne|kitni|count)\b/.test(q)) {
    if (/product|item|maal/.test(q)) return `<b>📦 Total products:</b> ${db.products.length}<br><b>Low stock:</b> ${lowStockProducts().length}`;
    if (/customer|grahak/.test(q)) return `<b>👥 Customers:</b> ${db.customers.length}<br><b>Udhaar:</b> ${money(totalReceivable())}`;
    if (/supplier/.test(q)) return `<b>🚚 Suppliers:</b> ${db.suppliers.length}`;
  }

  if (p) {
    return `<b>📦 ${esc(p.name)}</b>${stat('Stock', p.stock ?? 0)}${stat('Sale price', money(p.price))}${stat('Cost', money(p.cost))}${stat('Category', esc(p.category || '—'))}`;
  }

  return `Main ye sawal samajh nahi saka. 🤔<br>Ye try karein:<ul><li>"Aaj ki sale kitni hai?"</li><li>"Is mahine ka profit?"</li><li>"Low stock products?"</li><li>"Sab se zyada kya bika?"</li><li>"Udhaar kitna hai?"</li><li>"Aaj ka summary"</li></ul>`;
}

export function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>AI Assistant</h2>
        <p>Apne shop ke baare mein sawal poochhein — jawab aap ke data se, bina internet.</p>
      </div>
      <div class="head-actions">
        <span class="pill brand">${icon('sparkle')} Offline · Free</span>
      </div>
    </div>

    <div class="ai-shell">
      <div class="card ai-card">
        <div class="ai-head">
          <div class="ai-avatar">${icon('sparkle')}</div>
          <div class="grow">
            <h3>mhzaly AI</h3>
            <p>Aap ke shop data se smart jawab · koi API key nahi</p>
          </div>
          <button class="btn btn-ghost btn-sm" id="aiClear" type="button">Clear</button>
        </div>
        <div class="ai-log" id="aiLog"></div>
        <div class="ai-chips" id="aiChips">
          ${EXAMPLES.map((e) => `<button class="ai-chip" type="button" data-q="${esc(e)}">${esc(e)}</button>`).join('')}
        </div>
        <form class="ai-input" id="aiForm">
          <input class="input" id="aiText" placeholder="Sawal likhein… jaise 'aaj ki sale kitni hai?'" autocomplete="off" />
          <button class="btn btn-primary ai-send" type="submit">${icon('check')} Bhejein</button>
        </form>
      </div>
      <p class="ai-note">Ye assistant aap ke browser mein hi chalta hai — data kahin nahi jata. Jawab aap ke products, sales, customers aur expenses se bante hain.</p>
    </div>`;

  const log = root.querySelector('#aiLog');
  const form = root.querySelector('#aiForm');
  const input = root.querySelector('#aiText');

  function add(html, who) {
    const el = document.createElement('div');
    el.className = `ai-msg ${who}`;
    el.innerHTML = `<div class="ai-bubble">${html}</div>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function ask(text) {
    const q = String(text || '').trim();
    if (!q) return;
    add(esc(q), 'user');
    input.value = '';
    const typing = document.createElement('div');
    typing.className = 'ai-msg bot';
    typing.innerHTML = `<div class="ai-bubble ai-typing"><span></span><span></span><span></span></div>`;
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    setTimeout(() => {
      typing.remove();
      add(answer(q), 'bot');
    }, 320);
  }

  add(
    `<b>Assalam-o-Alaikum! 👋</b><br>Main mhzaly AI hoon. Apne shop ke baare mein kuch bhi poochhein — sale, profit, stock, udhaar, top products.`,
    'bot'
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
  root.querySelector('#aiChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-q]');
    if (chip) ask(chip.dataset.q);
  });
  root.querySelector('#aiClear').addEventListener('click', () => {
    log.innerHTML = '';
    add('<b>Chat clear ho gayi.</b> Naya sawal poochhein.', 'bot');
  });
  setTimeout(() => input.focus(), 80);
}
