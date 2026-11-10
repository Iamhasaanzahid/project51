/* ============================================================
   mhzaly — Dashboard (enhanced)
   ============================================================ */

import { db, lowStockProducts, totalReceivable } from '../db.js';
import { icon, esc, emptyState } from '../ui.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function money(n) {
  return `${db.settings.currency || 'Rs'} ${Number(n || 0).toLocaleString()}`;
}

function saleProfit(s) {
  let p = 0;
  for (const it of (s.items || [])) {
    const prod = db.products.find((x) => x.id === it.id || x.id === it.productId);
    const cost = prod ? Number(prod.cost) || 0 : 0;
    const qty = Number(it.qty) || 1;
    p += (Number(it.price) || 0) * qty - cost * qty;
  }
  return p;
}

function dayStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function kpi(iconName, tone, label, value, sub) {
  return `<div class="kpi">
    <div class="kpi-ico ${tone}">${icon(iconName)}</div>
    <div class="grow">
      <div class="k-lbl">${esc(label)}</div>
      <div class="k-val">${esc(value)}</div>
      ${sub ? `<div class="k-sub">${esc(sub)}</div>` : ''}
    </div>
  </div>`;
}

export function render(root) {
  const shop = db.settings.shopName || 'My Mart';
  const low = lowStockProducts();
  const receivable = totalReceivable();

  const todayStart = dayStart(new Date());
  const todaySales = db.sales.filter((s) => new Date(s.createdAt || 0) >= todayStart);
  const todayTotal = todaySales.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const todayProfit = todaySales.reduce((a, s) => a + saleProfit(s), 0);

  const planLabel = db.settings._planLabel || '—';
  const daysLeft = db.settings._daysLeft;

  // last 7 days chart
  const chart = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayStart(new Date());
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const total = db.sales
      .filter((s) => {
        const t = new Date(s.createdAt || 0);
        return t >= d && t < next;
      })
      .reduce((a, s) => a + (Number(s.total) || 0), 0);
    chart.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), total });
  }
  const maxVal = Math.max(1, ...chart.map((c) => c.total));
  const weekTotal = chart.reduce((a, c) => a + c.total, 0);
  const chartBars = chart
    .map(
      (c) => `
      <div class="bar-wrap" title="${money(c.total)}">
        <div class="bar-val">${c.total ? money(c.total) : ''}</div>
        <div class="bar" style="height:${Math.max(4, Math.round((c.total / maxVal) * 100))}%"></div>
        <div class="bar-lbl">${esc(c.label)}</div>
      </div>`
    )
    .join('');

  const recent = db.sales.slice(-6).reverse();

  // AI insight strip
  const yStart = dayStart(new Date());
  yStart.setDate(yStart.getDate() - 1);
  const yEnd = new Date(yStart);
  yEnd.setDate(yEnd.getDate() + 1);
  const yTotal = db.sales
    .filter((s) => {
      const t = new Date(s.createdAt || 0);
      return t >= yStart && t < yEnd;
    })
    .reduce((a, s) => a + (Number(s.total) || 0), 0);

  const tips = [];
  if (low.length) {
    const worst = low.slice().sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))[0];
    tips.push(`<b>${low.length} product${low.length > 1 ? 's' : ''} low stock</b> mein hain — sab se kam <b>${esc(worst.name)}</b> (${worst.stock ?? 0} left). Restock karein.`);
  }
  if (receivable > 0) {
    tips.push(`Customers se <b>${money(receivable)}</b> udhaar baqi hai — reminder bhejne ka achha waqt hai.`);
  }
  if (todaySales.length && yTotal > 0) {
    const pct = Math.round(((todayTotal - yTotal) / yTotal) * 100);
    if (pct !== 0) {
      tips.push(`Aaj kal se <b>${pct > 0 ? '+' : ''}${pct}%</b> sale ho rahi hai (${money(todayTotal)} vs ${money(yTotal)}).`);
    }
  }
  if (!todaySales.length) {
    tips.push(`Aaj ab tak koi sale nahi hui. <b>New Sale</b> se pehla bill banayein.`);
  }
  if (!tips.length) {
    tips.push(`Sab theek chal raha hai — aaj <b>${money(todayTotal)}</b> ki sale ho chuki hai.`);
  }

  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>${greeting()}${db.settings.ownerName ? ', ' + esc(db.settings.ownerName) : ''} 👋</h2>
        <p>${esc(shop)} — aaj ka overview</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" data-nav="pos">${icon('plus')} New Sale</button>
        <button class="btn btn-ghost" data-nav="products">${icon('bag')} Add Product</button>
      </div>
    </div>

    <div class="kpi-grid">
      ${kpi('check', 'green', 'Today Sales', money(todayTotal), todaySales.length + ' invoices')}
      ${kpi('sparkle', 'blue', 'Today Profit', money(todayProfit), 'Aaj ka munafa')}
      ${kpi('bag', 'violet', 'Products', db.products.length, low.length + ' low stock')}
      ${kpi('alert', low.length ? 'amber' : 'green', 'Low Stock', low.length, low.length ? 'Restock karein' : 'Sab theek hai')}
      ${kpi('sparkle', 'teal', 'Udhaar', money(receivable), 'Customers se lena hai')}
      ${kpi('calendar', 'slate', 'Plan', planLabel, daysLeft == null ? '—' : daysLeft + ' din baqi')}
    </div>

    <div class="card ai-insight">
      <div class="ai-insight-ico">${icon('sparkle')}</div>
      <div class="grow">
        <div class="ai-insight-title">mhzaly AI insight</div>
        <div class="ai-insight-text">${tips.slice(0, 2).map((t) => `<div>• ${t}</div>`).join('')}</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-nav="assistant">Ask AI</button>
    </div>

    <div class="dashboard-row">
      <div class="card chart-card">
        <div class="card-head">
          <h3>Last 7 Days Sales</h3>
          <span class="right">${money(weekTotal)} total</span>
        </div>
        <div class="card-pad">
          <div class="chart">${chartBars}</div>
        </div>
      </div>

      <div class="card quick-card">
        <div class="card-head"><h3>Quick Actions</h3></div>
        <div class="card-pad">
          <div class="quick-actions">
            <button class="quick-btn" data-nav="pos">${icon('plus')} New Sale</button>
            <button class="quick-btn" data-nav="products">${icon('bag')} Products</button>
            <button class="quick-btn" data-nav="customers">${icon('bag')} Customers</button>
            <button class="quick-btn" data-nav="purchases">${icon('alert')} Purchases</button>
            <button class="quick-btn" data-nav="expenses">${icon('alert')} Expenses</button>
            <button class="quick-btn" data-nav="reports">${icon('check')} Reports</button>
          </div>
        </div>
      </div>
    </div>

    <div id="dashboardAlert" class="alert-box mt" style="${dashboardAlertStyle()}">
      ${icon('alert')}
      <div>
        <div style="font-weight:800">${dashboardAlertTitle()}</div>
        <div style="font-size:12.5px">${dashboardAlertMessage()}</div>
      </div>
    </div>

    <div class="grid k2 mt">
      <div class="card">
        <div class="card-head"><h3>Recent Sales</h3><button class="link-btn" data-nav="sales">View all</button></div>
        <div class="card-pad">
          ${
            recent.length
              ? `<div class="table-wrap"><table style="width:100%"><thead><tr><th style="text-align:left">Invoice</th><th style="text-align:left">Customer</th><th style="text-align:right">Total</th></tr></thead><tbody>${recent
                  .map(
                    (s) =>
                      `<tr><td>${esc(s.invoiceNo || s.id)}</td><td>${esc(s.customerName || 'Walk-in')}</td><td style="text-align:right">${money(s.total)}</td></tr>`
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('No sales yet.')
          }
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Low Stock Alerts</h3><button class="link-btn" data-nav="products">Manage</button></div>
        <div class="card-pad">
          ${
            low.length
              ? `<div class="table-wrap"><table style="width:100%"><thead><tr><th style="text-align:left">Product</th><th style="text-align:right">Stock</th><th style="text-align:right">Alert</th></tr></thead><tbody>${low
                  .map(
                    (p) =>
                      `<tr><td>${esc(p.name)}</td><td style="text-align:right">${esc(p.stock)}</td><td style="text-align:right"><span class="badge ${(p.stock ?? 0) === 0 ? 'danger' : 'warn'}">${esc(p.lowStock)}</span></td></tr>`
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('All stock levels are good.')
          }
        </div>
      </div>
    </div>`;

  // Auto-dismiss alert after 10 seconds
  setTimeout(() => {
    const el = document.getElementById('dashboardAlert');
    if (el) {
      el.style.transition = 'opacity .4s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 450);
    }
  }, 10000);
}

function dashboardAlertStyle() {
  const status = db.settings._billingStatus || 'active';
  if (status === 'trial') return 'background:#fffbeb;border-color:#f59e0b;color:#92400e';
  if (status === 'expired') return 'background:#fee2e2;border-color:#fca5a5;color:#991b1b';
  if (status === 'blocked') return 'background:#fee2e2;border-color:#fca5a5;color:#991b1b';
  return 'background:#eff6ff;border-color:#bfdbfe;color:#1e40af';
}

function dashboardAlertTitle() {
  const status = db.settings._billingStatus || 'active';
  if (status === 'trial') return 'Trial Plan Active';
  if (status === 'expired') return 'Plan Expired';
  if (status === 'blocked') return 'Account Blocked';
  return 'Welcome to mhzaly';
}

function dashboardAlertMessage() {
  const status = db.settings._billingStatus || 'active';
  if (status === 'trial') return `Aap ka trial ${db.settings._daysLeft} din baad khatam ho jayega. Owner se plan renew karwayein.`;
  if (status === 'expired') return 'Aap ka plan khatam ho gaya hai. Owner se rabta karein.';
  if (status === 'blocked') return 'Aap ka account temporarily block hai — owner se rabta karein.';
  return 'Aap ka shop active hai. Billing shuru karein!';
}
