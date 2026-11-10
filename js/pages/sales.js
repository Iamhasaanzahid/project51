/* ============================================================
   mhzaly — Sales
   ============================================================ */

import { db, save } from '../db.js';
import { icon, esc, emptyState, openModal, downloadFile } from '../ui.js';
import { money, printReceipt, shareWhatsApp } from '../receipt-share.js';

function itemCount(sale) {
  return (sale.items || []).reduce((a, it) => a + (Number(it.qty) || 1), 0);
}

function showInvoice(sale) {
  const rows = (sale.items || [])
    .map(
      (it) =>
        `<tr><td>${esc(it.name)}</td><td style="text-align:center">${esc(it.qty)}</td><td style="text-align:right">${money(
          (Number(it.qty) || 1) * (Number(it.price) || 0)
        )}</td></tr>`
    )
    .join('');

  openModal({
    title: 'Invoice ' + (sale.invoiceNo || sale.id),
    subtitle: new Date(sale.createdAt).toLocaleString(),
    body: `
      <div class="sale-done">
        <div class="sale-done-total">${money(sale.total)}</div>
        <div class="sale-done-sub">${esc(sale.customerName || 'Walk-in')} · ${itemCount(sale)} item(s)</div>
      </div>
      <div class="table-wrap">
        <table style="width:100%">
          <thead><tr><th style="text-align:left">Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3">${emptyState('No items.')}</td></tr>`}</tbody>
        </table>
      </div>
      <div class="field" style="margin-top:14px">
        <label>Customer phone (WhatsApp)</label>
        <input class="input" id="invPhone" value="${esc(sale.customerPhone || '')}" placeholder="03xx-xxxxxxx" inputmode="tel" />
      </div>`,
    footer: `
      <button class="btn btn-ghost" data-close-inv>Close</button>
      <button class="btn btn-ghost" id="invPrint">${icon('download')} Print</button>
      <button class="btn btn-primary" id="invWhatsapp">${icon('check')} WhatsApp</button>`,
    onMount: (bd) => {
      const phoneEl = bd.querySelector('#invPhone');
      const syncPhone = () => {
        const value = String(phoneEl.value || '').trim();
        if (value !== (sale.customerPhone || '')) {
          sale.customerPhone = value;
          save();
        }
        return value;
      };
      bd.querySelector('[data-close-inv]').addEventListener('click', () => bd.remove());
      bd.querySelector('#invPrint').addEventListener('click', () => {
        syncPhone();
        printReceipt(sale);
      });
      bd.querySelector('#invWhatsapp').addEventListener('click', () => {
        shareWhatsApp(sale, syncPhone());
      });
    },
  });
}

export function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Sales</h2>
        <p>All invoices and transactions.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" id="exportSales">${icon('download')} Export CSV</button>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad">
        <div class="field mt-sm">
          <label>Search</label>
          <input class="input" id="salesSearch" placeholder="Invoice or customer" />
        </div>
        <div class="table-wrap">
          <table style="width:100%;margin-top:10px">
            <thead>
              <tr>
                <th style="text-align:left">Invoice</th>
                <th style="text-align:left">Customer</th>
                <th style="text-align:right">Items</th>
                <th style="text-align:left">Date</th>
                <th style="text-align:right">Total</th>
                <th style="width:70px"></th>
              </tr>
            </thead>
            <tbody id="salesTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  const searchEl = root.querySelector('#salesSearch');
  const body = root.querySelector('#salesTableBody');

  function list() {
    const q = String(searchEl.value || '').toLowerCase();
    return db.sales
      .filter(
        (s) =>
          String(s.invoiceNo || s.id).toLowerCase().includes(q) ||
          String(s.customerName || '').toLowerCase().includes(q)
      )
      .slice()
      .reverse();
  }

  function renderTable() {
    const rows = list();
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('Koi sale nahi mili.')}</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (s) => `
      <tr>
        <td><b>${esc(s.invoiceNo || s.id)}</b></td>
        <td>${esc(s.customerName || 'Walk-in')}</td>
        <td style="text-align:right">${itemCount(s)}</td>
        <td>${new Date(s.createdAt).toLocaleDateString('en-GB')}</td>
        <td style="text-align:right">${money(s.total)}</td>
        <td style="text-align:right; white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-view="${esc(s.id)}" title="View invoice">${icon('eye')}</button>
          <button class="btn btn-ghost btn-sm" data-print="${esc(s.id)}" title="Print receipt">${icon('download')}</button>
        </td>
      </tr>`
      )
      .join('');
  }

  renderTable();
  searchEl.addEventListener('input', renderTable);

  body.addEventListener('click', (e) => {
    const view = e.target.closest('[data-view]');
    if (view) {
      const sale = db.sales.find((s) => s.id === view.dataset.view);
      if (sale) showInvoice(sale);
      return;
    }
    const pr = e.target.closest('[data-print]');
    if (pr) {
      const sale = db.sales.find((s) => s.id === pr.dataset.print);
      if (sale) printReceipt(sale);
    }
  });

  root.querySelector('#exportSales').addEventListener('click', () => {
    const rows = [['Invoice', 'Date', 'Customer', 'Phone', 'Items', 'Total']];
    for (const s of list()) {
      rows.push([
        s.invoiceNo || s.id,
        new Date(s.createdAt).toISOString().slice(0, 10),
        s.customerName || 'Walk-in',
        s.customerPhone || '',
        itemCount(s),
        Number(s.total) || 0,
      ]);
    }
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadFile(`mhzaly-sales-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  });
}
