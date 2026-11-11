/* ============================================================
   mhzaly — Returns & Refunds
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal } from '../ui.js';
import { money } from '../receipt-share.js';

export const meta = { title: 'Returns & Refunds', subtitle: 'Sale return, refund aur stock wapas' };

function returnedQtyFor(saleId, productId) {
  let qty = 0;
  for (const r of db.returns || []) {
    if (r.saleId !== saleId) continue;
    for (const it of r.items || []) {
      if (it.id === productId) qty += Number(it.qty) || 0;
    }
  }
  return qty;
}

function refundTotal(returnRow) {
  return (returnRow.items || []).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
}

export function render(root) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthReturns = (db.returns || []).filter((r) => new Date(r.createdAt || 0) >= monthStart);
  const monthTotal = monthReturns.reduce((a, r) => a + refundTotal(r), 0);

  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Returns & Refunds</h2>
        <p>Customer wapas kiya hua maal receive karein — stock wapas add hoga aur refund record banega.</p>
      </div>
      <div class="head-actions">
        <span class="pill brand">${icon('return')} ${monthReturns.length} is month</span>
      </div>
    </div>

    <div class="grid k3 mt">
      <div class="card kpi"><div class="kpi-label">Refunds this month</div><div class="kpi-value">${money(monthTotal)}</div><div class="kpi-foot">${monthReturns.length} return(s)</div></div>
      <div class="card kpi"><div class="kpi-label">Total returns</div><div class="kpi-value">${(db.returns || []).length}</div><div class="kpi-foot">All time</div></div>
      <div class="card kpi"><div class="kpi-label">Restocked items</div><div class="kpi-value">${(db.returns || []).reduce((a, r) => a + (r.items || []).reduce((x, it) => x + (Number(it.qty) || 0), 0), 0)}</div><div class="kpi-foot">Units wapas stock mein</div></div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Recent sales</h3><div class="right"><span class="hint">Return karne ke liye invoice chunein</span></div></div>
      <div class="card-pad">
        <div class="field mt-sm">
          <label>Search invoice or customer</label>
          <input class="input" id="retSearch" placeholder="INV-1234 ya customer ka naam" />
        </div>
        <div class="table-wrap">
          <table style="width:100%;margin-top:10px">
            <thead>
              <tr>
                <th style="text-align:left">Invoice</th>
                <th style="text-align:left">Customer</th>
                <th style="text-align:left">Date</th>
                <th style="text-align:right">Total</th>
                <th style="text-align:right">Refunded</th>
                <th style="width:110px"></th>
              </tr>
            </thead>
            <tbody id="retSalesBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Return history</h3></div>
      <div class="card-pad">
        <div class="table-wrap">
          <table style="width:100%">
            <thead>
              <tr>
                <th style="text-align:left">Date</th>
                <th style="text-align:left">Invoice</th>
                <th style="text-align:left">Customer</th>
                <th style="text-align:left">Items</th>
                <th style="text-align:right">Refund</th>
                <th style="text-align:left">Method</th>
              </tr>
            </thead>
            <tbody id="retHistoryBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  const salesBody = root.querySelector('#retSalesBody');
  const historyBody = root.querySelector('#retHistoryBody');

  function refundedFor(saleId) {
    return (db.returns || [])
      .filter((r) => r.saleId === saleId)
      .reduce((a, r) => a + refundTotal(r), 0);
  }

  function paintSales() {
    const q = String(root.querySelector('#retSearch').value || '').toLowerCase().trim();
    const list = [...db.sales]
      .filter((s) => !q || String(s.invoiceNo || '').toLowerCase().includes(q) || String(s.customerName || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 60);

    if (!list.length) {
      salesBody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Koi sale nahi mili.</div></td></tr>';
      return;
    }
    salesBody.innerHTML = list.map((s) => {
      const refunded = refundedFor(s.id);
      const d = new Date(s.createdAt || 0);
      const canReturn = (Number(s.total) || 0) > refunded + 0.001;
      return `<tr>
        <td><b>${esc(s.invoiceNo || '—')}</b></td>
        <td>${esc(s.customerName || 'Walk-in')}</td>
        <td>${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
        <td style="text-align:right">${money(s.total)}</td>
        <td style="text-align:right">${refunded > 0 ? `<span class="badge warn">${money(refunded)}</span>` : '—'}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm" data-return="${esc(s.id)}" ${canReturn ? '' : 'disabled'} title="Return items">${icon('return')} Return</button>
        </td>
      </tr>`;
    }).join('');
  }

  function paintHistory() {
    const list = [...(db.returns || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 40);
    if (!list.length) {
      historyBody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Abhi koi return record nahi.</div></td></tr>';
      return;
    }
    historyBody.innerHTML = list.map((r) => `<tr>
      <td>${new Date(r.createdAt || 0).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
      <td><b>${esc(r.invoiceNo || '—')}</b></td>
      <td>${esc(r.customerName || 'Walk-in')}</td>
      <td>${(r.items || []).map((it) => `${esc(it.name)} × ${esc(it.qty)}`).join(', ')}</td>
      <td style="text-align:right">${money(refundTotal(r))}</td>
      <td>${esc(r.method || 'Cash')}</td>
    </tr>`).join('');
  }

  function openReturn(sale) {
    const rows = (sale.items || []).map((it, i) => {
      const already = returnedQtyFor(sale.id, it.id);
      const remaining = Math.max(0, (Number(it.qty) || 0) - already);
      return `<tr>
        <td>${esc(it.name)}</td>
        <td style="text-align:center">${money(it.price)}</td>
        <td style="text-align:center">${remaining}</td>
        <td style="text-align:center"><input class="input input-sm" id="rq_${i}" type="number" min="0" max="${remaining}" step="1" value="0" style="width:78px;text-align:center" ${remaining ? '' : 'disabled'} /></td>
      </tr>`;
    }).join('');

    openModal({
      title: 'Return items',
      subtitle: `${sale.invoiceNo || ''} · ${sale.customerName || 'Walk-in'}`,
      body: `
        <div class="table-wrap">
          <table style="width:100%">
            <thead><tr><th style="text-align:left">Item</th><th style="text-align:center">Price</th><th style="text-align:center">Available</th><th style="text-align:center">Return qty</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="form-grid mt">
          <div class="field">
            <label>Refund method</label>
            <select class="input" id="retMethod">
              <option value="Cash">Cash refund</option>
              <option value="Card">Card refund</option>
              <option value="Online">Online / Bank</option>
              <option value="Udhaar">Udhaar adjust (balance kam)</option>
            </select>
          </div>
          <div class="field">
            <label>Reason (optional)</label>
            <input class="input" id="retReason" placeholder="e.g. damaged / wrong item" />
          </div>
          <div class="field full">
            <label style="display:flex;align-items:center;gap:8px;font-weight:600">
              <input type="checkbox" id="retRestock" checked /> Stock wapas add karein
            </label>
          </div>
        </div>
        <div class="alert-box mt" style="background:#f0fdfa;border-color:#99f6e4;color:#115e59">
          ${icon('alert')}
          <div>Refund total qty ke hisaab se calculate hoga. Udhaar sale par balance khud kam ho jayega.</div>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="retSave">${icon('check')} Refund karein</button>`,
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        bd.querySelector('#retSave').addEventListener('click', () => {
          const items = [];
          (sale.items || []).forEach((it, i) => {
            const input = bd.querySelector(`#rq_${i}`);
            const qty = Math.max(0, Math.min(Number(input?.value) || 0, returnedQtyFor(sale.id, it.id) + (Number(it.qty) || 0)));
            const available = Math.max(0, (Number(it.qty) || 0) - returnedQtyFor(sale.id, it.id));
            const finalQty = Math.min(qty, available);
            if (finalQty > 0) items.push({ id: it.id, name: it.name, price: Number(it.price) || 0, qty: finalQty });
          });
          if (!items.length) return toast('Kam az kam ek item ki qty likhein', 'error');
          let total = items.reduce((a, it) => a + it.qty * it.price, 0);
          const alreadyRefunded = refundedFor(sale.id);
          const cap = Math.max(0, (Number(sale.total) || 0) - alreadyRefunded);
          if (total > cap + 0.001 && total > 0) {
            const factor = cap / total;
            for (const it of items) it.price = Math.round(it.price * factor * 100) / 100;
            total = items.reduce((a, it) => a + it.qty * it.price, 0);
          }
          const method = bd.querySelector('#retMethod').value || 'Cash';
          const restock = bd.querySelector('#retRestock').checked;
          const reason = bd.querySelector('#retReason').value.trim();

          db.returns = db.returns || [];
          db.returns.push({
            id: uid('ret'),
            saleId: sale.id,
            invoiceNo: sale.invoiceNo,
            customerName: sale.customerName || 'Walk-in',
            items,
            total,
            method,
            reason,
            restocked: restock,
            createdAt: new Date().toISOString(),
          });

          if (restock) {
            for (const it of items) {
              const p = db.products.find((x) => x.id === it.id);
              if (p) p.stock = (Number(p.stock) || 0) + it.qty;
            }
          }

          if (method === 'Udhaar' || sale.paymentMethod === 'Udhaar') {
            const c = db.customers.find((x) => x.name.toLowerCase() === String(sale.customerName || '').toLowerCase());
            if (c) c.balance = Math.max(0, (Number(c.balance) || 0) - total);
          }

          db.payments = db.payments || [];
          db.payments.push({
            id: uid('pay'),
            type: 'refund',
            party: sale.customerName || 'Walk-in',
            amount: -total,
            method,
            note: `Return ${sale.invoiceNo || ''}`,
            createdAt: new Date().toISOString(),
          });

          save();
          toast(`Refund ${money(total)} record ho gaya`, 'success');
          bd.remove();
          paintSales();
          paintHistory();
          const kpis = root.querySelectorAll('.kpi-value');
          if (kpis[1]) kpis[1].textContent = (db.returns || []).length;
        });
      },
    });
  }

  root.querySelector('#retSearch').addEventListener('input', paintSales);
  salesBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-return]');
    if (!btn) return;
    const sale = db.sales.find((s) => s.id === btn.dataset.return);
    if (sale) openReturn(sale);
  });

  paintSales();
  paintHistory();
}
