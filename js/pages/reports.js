/* ============================================================
   mhzaly — Reports
   ============================================================ */

import { db, totalSales, totalProfit } from '../db.js';
import { icon, esc, emptyState } from '../ui.js';

export function render(root) {
  const sales = totalSales();
  const profit = totalProfit();
  const expenseTotal = db.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Reports</h2>
        <p>Date-range revenue, profit and expense summary.</p>
      </div>
    </div>

    <div class="stat-strip">
      <div><span class="lbl">Total Sales</span><b class="val">Rs ${esc(Number(sales || 0).toLocaleString())}</b></div>
      <div><span class="lbl">Expenses</span><b class="val">Rs ${esc(expenseTotal.toLocaleString())}</b></div>
      <div><span class="lbl">Net Profit</span><b class="val">Rs ${esc(Number(profit || 0).toLocaleString())}</b></div>
      <div><span class="lbl">Invoices</span><b class="val">${esc(db.sales.length)}</b></div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Sales by Category</h3></div>
      <div class="card-pad">
        ${db.sales.length ? `<table style="width:100%"><thead><tr><th style="text-align:left">Product</th><th style="text-align:right">Qty Sold</th><th style="text-align:right">Revenue</th></tr></thead><tbody>${db.sales.slice(-10).map((s) => `<tr><td>${esc(s.productName || s.name || 'Item')}</td><td style="text-align:right">${esc(s.qty || 1)}</td><td style="text-align:right">Rs ${Number(s.total || 0).toLocaleString()}</td></tr>`).join('')}</tbody></table>` : emptyState('No sales data.')}
      </div>
    </div>`;
}
