/* ============================================================
   mhzaly — Dashboard
   ============================================================ */

import { db, lowStockProducts, totalSales, totalProfit } from '../db.js';
import { icon, esc, emptyState } from '../ui.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function render(root) {
  const shop = db.settings.shopName || 'My Mart';
  const low = lowStockProducts();
  const sales = totalSales();
  const profit = totalProfit();

  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>${greeting()}${db.settings.ownerName ? ', ' + esc(db.settings.ownerName) : ''} 👋</h2>
        <p>Here is what is happening at ${esc(shop)} today.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" data-nav="pos">${icon('plus')} New Sale</button>
        <button class="btn btn-ghost" data-nav="products">${icon('bag')} Add Product</button>
      </div>
    </div>

    <div class="stat-strip">
      <div><span class="lbl">Today Sales</span><b class="val">Rs ${esc(Number(sales || 0).toLocaleString())}</b></div>
      <div><span class="lbl">Profit</span><b class="val">Rs ${esc(Number(profit || 0).toLocaleString())}</b></div>
      <div><span class="lbl">Products</span><b class="val">${esc(db.products.length)}</b></div>
      <div><span class="lbl">Low Stock</span><b class="val">${esc(low.length)}</b></div>
      <div><span class="lbl">Plan</span><b class="val">${esc(db.settings._planLabel || '—')}</b></div>
      <div><span class="lbl">Days Left</span><b class="val">${esc(db.settings._daysLeft == null ? '—' : db.settings._daysLeft + ' din')}</b></div>
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
        <div class="card-head"><h3>Recent Sales</h3></div>
        <div class="card-pad">
          ${db.sales.length ? `<table style="width:100%"><thead><tr><th style="text-align:left">Invoice</th><th style="text-align:left">Customer</th><th style="text-align:right">Total</th></tr></thead><tbody>${db.sales.slice(-5).reverse().map((s) => `<tr><td>${esc(s.invoiceNo || s.id)}</td><td>${esc(s.customerName || 'Walk-in')}</td><td style="text-align:right">Rs ${Number(s.total || 0).toLocaleString()}</td></tr>`).join('')}</tbody></table>` : emptyState('No sales yet.')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Low Stock Alerts</h3></div>
        <div class="card-pad">
          ${low.length ? `<table style="width:100%"><thead><tr><th style="text-align:left">Product</th><th style="text-align:right">Stock</th><th style="text-align:right">Alert</th></tr></thead><tbody>${low.map((p) => `<tr><td>${esc(p.name)}</td><td style="text-align:right">${esc(p.stock)}</td><td style="text-align:right">${esc(p.lowStock)}</td></tr>`).join('')}</tbody></table>` : emptyState('All stock levels are good.')}
        </div>
      </div>
    </div>`;

    // Auto-dismiss alert after 10 seconds
    setTimeout(() => {
      const el = document.getElementById('dashboardAlert');
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }
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
