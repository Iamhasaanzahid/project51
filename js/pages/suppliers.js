/* ============================================================
   mhzaly — Suppliers
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal, confirmDialog } from '../ui.js';
import { money } from '../receipt-share.js';

export function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Suppliers</h2>
        <p>Manage supplier list and payable balance.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" id="addSupplierBtn">${icon('plus')} Add Supplier</button>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad">
        <div class="field mt-sm">
          <label>Search</label>
          <input class="input" id="supplierSearch" placeholder="Name or phone" />
        </div>
        <div class="table-wrap">
          <table style="width:100%;margin-top:10px">
            <thead>
              <tr>
                <th style="text-align:left">Name</th>
                <th style="text-align:left">Phone</th>
                <th style="text-align:right">Payable</th>
                <th style="width:120px"></th>
              </tr>
            </thead>
            <tbody id="supplierTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  function renderTable() {
    const q = String(root.querySelector('#supplierSearch').value || '').toLowerCase();
    const list = db.suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.phone || '').toLowerCase().includes(q)
    );

    if (!list.length) {
      root.querySelector('#supplierTableBody').innerHTML = `
        <tr><td colspan="4"><div class="empty-state">Koi supplier nahi mila.</div></td></tr>`;
      return;
    }

    root.querySelector('#supplierTableBody').innerHTML = list
      .map((s) => {
        const bal = Number(s.balance || 0);
        return `
      <tr>
        <td><b>${esc(s.name)}</b></td>
        <td>${esc(s.phone || '')}</td>
        <td style="text-align:right">
          ${bal > 0 ? `<span class="badge danger">${money(bal)}</span>` : `<span class="badge ok">${money(0)}</span>`}
        </td>
        <td style="text-align:right">
          ${bal > 0 ? `<button class="btn btn-primary btn-sm" data-pay="${esc(s.id)}" title="Pay supplier">${icon('wallet')}</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-edit="${esc(s.id)}" title="Edit">${icon('settings')}</button>
          <button class="btn btn-ghost btn-sm" data-del="${esc(s.id)}" title="Delete">${icon('trash')}</button>
        </td>
      </tr>`;
      })
      .join('');
  }

  renderTable();
  root.querySelector('#supplierSearch').addEventListener('input', renderTable);

  function openForm(existing) {
    const s = existing || {};
    const isEdit = !!existing;

    openModal({
      title: isEdit ? 'Edit supplier' : 'Add supplier',
      subtitle: isEdit ? s.name : 'Naya supplier add karein',
      body: `
        <div class="owner-form-grid">
          <label style="grid-column:1/-1">Supplier name
            <input id="sfName" value="${esc(s.name || '')}" placeholder="e.g. Karachi Wholesale" />
          </label>
          <label>Phone
            <input id="sfPhone" value="${esc(s.phone || '')}" placeholder="03xx-xxxxxxx" inputmode="tel" />
          </label>
          <label>Payable balance (${esc(db.settings.currency || 'Rs')})
            <input id="sfBalance" type="number" min="0" step="0.01" value="${s.balance ?? 0}" />
          </label>
          <label style="grid-column:1/-1">Note (optional)
            <input id="sfNote" value="${esc(s.note || '')}" placeholder="e.g. weekly delivery" />
          </label>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="sfSave">${icon('check')} ${isEdit ? 'Save changes' : 'Add supplier'}</button>`,
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        const doSave = () => {
          const name = bd.querySelector('#sfName').value.trim();
          if (!name) return toast('Supplier ka naam likhein', 'error');
          const data = {
            name,
            phone: bd.querySelector('#sfPhone').value.trim(),
            balance: Number(bd.querySelector('#sfBalance').value || 0),
            note: bd.querySelector('#sfNote').value.trim(),
            updatedAt: new Date().toISOString(),
          };
          if (isEdit) {
            Object.assign(s, data);
            toast('Supplier updated', 'success');
          } else {
            db.suppliers.push({ id: uid('sup'), createdAt: new Date().toISOString(), ...data });
            toast('Supplier added', 'success');
          }
          save();
          renderTable();
          bd.remove();
        };
        bd.querySelector('#sfSave').addEventListener('click', doSave);
        bd.querySelector('#sfName').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSave();
        });
        setTimeout(() => bd.querySelector('#sfName').focus(), 60);
      },
    });
  }

  function openPay(s) {
    const bal = Number(s.balance) || 0;
    openModal({
      title: 'Pay supplier',
      subtitle: `${s.name} · payable ${money(bal)}`,
      body: `
        <div class="form-grid">
          <div class="field">
            <label>Amount paid (${esc(db.settings.currency || 'Rs')})</label>
            <input class="input" id="payAmt" type="number" min="0" step="0.01" value="${bal}" />
          </div>
          <div class="field">
            <label>Method</label>
            <select class="input" id="payMethod">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Online">Online / Bank</option>
            </select>
          </div>
          <div class="field full">
            <label>Note (optional)</label>
            <input class="input" id="payNote" placeholder="e.g. weekly payment" />
          </div>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="paySave">${icon('check')} Pay</button>`,
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        bd.querySelector('#paySave').addEventListener('click', () => {
          const amount = Math.max(0, Number(bd.querySelector('#payAmt').value) || 0);
          if (!amount) return toast('Amount likhein', 'error');
          const applied = Math.min(amount, bal);
          s.balance = Math.max(0, bal - applied);
          s.updatedAt = new Date().toISOString();
          db.payments = db.payments || [];
          db.payments.push({
            id: uid('pay'),
            type: 'supplier',
            party: s.name,
            amount: applied,
            method: bd.querySelector('#payMethod').value || 'Cash',
            note: bd.querySelector('#payNote').value.trim(),
            createdAt: new Date().toISOString(),
          });
          save();
          bd.remove();
          renderTable();
          toast(`${money(applied)} paid`, 'success');
        });
      },
    });
  }

  root.querySelector('#addSupplierBtn').addEventListener('click', () => openForm(null));

  root.querySelector('#supplierTableBody').addEventListener('click', (e) => {
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      const s = db.suppliers.find((x) => x.id === pay.dataset.pay);
      if (s) openPay(s);
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const s = db.suppliers.find((x) => x.id === edit.dataset.edit);
      if (s) openForm(s);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const s = db.suppliers.find((x) => x.id === del.dataset.del);
      if (!s) return;
      confirmDialog(`"${s.name}" delete karein?`, () => {
        db.suppliers = db.suppliers.filter((x) => x.id !== s.id);
        save();
        renderTable();
        toast('Supplier deleted', 'success');
      });
    }
  });
}
