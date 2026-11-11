/* ============================================================
   mhzaly — Reports
   ============================================================ */

import { db } from '../db.js';
import { icon, esc, emptyState, downloadFile } from '../ui.js';

function money(n) {
  return `${db.settings.currency || 'Rs'} ${Number(n || 0).toLocaleString()}`;
}

function cutoff(range) {
  if (range === 'all') return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'today') return d;
  const days = Number(range);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function itemProfit(it) {
  const p = db.products.find((x) => x.id === it.id || x.id === it.productId);
  const cost = p ? Number(p.cost) || 0 : 0;
  const qty = Number(it.qty) || 1;
  return ((Number(it.price) || 0) - cost) * qty;
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
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Reports</h2>
        <p>Revenue, profit aur expense summary.</p>
      </div>
      <div class="head-actions">
        <select class="input" id="reportRange" style="width:auto;min-width:140px">
          <option value="today">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="all" selected>All time</option>
        </select>
        <button class="btn btn-ghost" id="exportReports">${icon('download')} Export CSV</button>
      </div>
    </div>
    <div id="reportBody"></div>`;

  const rangeSel = root.querySelector('#reportRange');
  const body = root.querySelector('#reportBody');

  function filtered() {
    const from = cutoff(rangeSel.value);
    const sales = db.sales.filter((s) => !from || new Date(s.createdAt || 0) >= from);
    const expenses = db.expenses.filter((e) => !from || new Date(e.createdAt || 0) >= from);
    const returns = (db.returns || []).filter((r) => !from || new Date(r.createdAt || 0) >= from);
    return { sales, expenses, returns };
  }

  function renderBody() {
    const { sales, expenses, returns } = filtered();

    const returnsTotal = returns.reduce((a, r) => a + (r.items || []).reduce((x, it) => x + (Number(it.qty) || 0) * (Number(it.price) || 0), 0), 0);
    let returnsProfit = 0;
    for (const r of returns) {
      for (const it of r.items || []) returnsProfit += itemProfit(it);
    }
    const revenue = sales.reduce((a, s) => a + (Number(s.total) || 0), 0) - returnsTotal;
    let profit = 0;
    const productMap = new Map();
    for (const s of sales) {
      for (const it of s.items || []) {
        profit += itemProfit(it);
        const key = it.name || 'Item';
        const cur = productMap.get(key) || { qty: 0, revenue: 0 };
        cur.qty += Number(it.qty) || 1;
        cur.revenue += (Number(it.price) || 0) * (Number(it.qty) || 1);
        productMap.set(key, cur);
      }
    }
    const expenseTotal = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
    profit -= returnsProfit;
    const net = profit - expenseTotal;
    const top = [...productMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);

    const catMap = new Map();
    for (const e of expenses) {
      const key = e.category || 'Other';
      catMap.set(key, (catMap.get(key) || 0) + (Number(e.amount) || 0));
    }
    const cats = [...catMap.entries()].sort((a, b) => b[1] - a[1]);

    body.innerHTML = `
      <div class="kpi-grid">
        ${kpi('check', 'green', 'Revenue', money(revenue), `${sales.length} invoices${returns.length ? ` · ${returns.length} returns` : ''}`)}
        ${kpi('sparkle', 'blue', 'Gross Profit', money(profit), 'Sales − cost')}
        ${kpi('alert', 'amber', 'Expenses', money(expenseTotal), expenses.length + ' entries')}
        ${kpi('sparkle', net >= 0 ? 'teal' : 'amber', 'Net Profit', money(net), 'Profit − expenses')}
      </div>

      <div class="grid k2 mt">
        <div class="card">
          <div class="card-head"><h3>Top Products</h3></div>
          <div class="card-pad">
            ${
              top.length
                ? `<div class="table-wrap"><table style="width:100%"><thead><tr><th style="text-align:left">Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Revenue</th></tr></thead><tbody>${top
                    .map(
                      ([name, v]) =>
                        `<tr><td>${esc(name)}</td><td style="text-align:right">${v.qty}</td><td style="text-align:right">${money(
                          v.revenue
                        )}</td></tr>`
                    )
                    .join('')}</tbody></table></div>`
                : emptyState('Is range mein koi sale nahi.')
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Expenses by Category</h3></div>
          <div class="card-pad">
            ${
              cats.length
                ? `<div class="table-wrap"><table style="width:100%"><thead><tr><th style="text-align:left">Category</th><th style="text-align:right">Amount</th></tr></thead><tbody>${cats
                    .map(
                      ([c, v]) =>
                        `<tr><td><span class="badge neutral">${esc(c)}</span></td><td style="text-align:right">${money(
                          v
                        )}</td></tr>`
                    )
                    .join('')}</tbody></table></div>`
                : emptyState('Is range mein koi expense nahi.')
            }
          </div>
        </div>
      </div>

      <div class="card mt">
        <div class="card-head"><h3>Sales in this range</h3><span class="right">${sales.length} invoices</span></div>
        <div class="card-pad">
          ${
            sales.length
              ? `<div class="table-wrap"><table style="width:100%"><thead><tr><th style="text-align:left">Invoice</th><th style="text-align:left">Customer</th><th style="text-align:left">Date</th><th style="text-align:right">Total</th></tr></thead><tbody>${sales
                  .slice()
                  .reverse()
                  .map(
                    (s) =>
                      `<tr><td>${esc(s.invoiceNo || s.id)}</td><td>${esc(s.customerName || 'Walk-in')}</td><td>${new Date(
                        s.createdAt
                      ).toLocaleDateString('en-GB')}</td><td style="text-align:right">${money(s.total)}</td></tr>`
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('No sales data.')
          }
        </div>
      </div>`;
  }

  rangeSel.addEventListener('change', renderBody);
  renderBody();

  root.querySelector('#exportReports').addEventListener('click', () => {
    const { sales } = filtered();
    const rows = [['Invoice', 'Date', 'Customer', 'Total']];
    for (const s of sales) {
      rows.push([
        s.invoiceNo || s.id,
        new Date(s.createdAt).toISOString().slice(0, 10),
        s.customerName || 'Walk-in',
        Number(s.total) || 0,
      ]);
    }
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadFile(`mhzaly-report-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  });
}
