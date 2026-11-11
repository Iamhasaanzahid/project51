/* ============================================================
   mhzaly — Customers (Udhaar Khata)
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal, confirmDialog } from '../ui.js';
import { money } from '../receipt-share.js';

export function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Customers</h2>
        <p>Manage customer khata (credit/udhaar).</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" id="addCustomerBtn">${icon('plus')} Add Customer</button>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad">
        <div class="field mt-sm">
          <label>Search</label>
          <input class="input" id="customerSearch" placeholder="Name or phone" />
        </div>
        <div class="table-wrap">
          <table style="width:100%;margin-top:10px">
            <thead>
              <tr>
                <th style="text-align:left">Name</th>
                <th style="text-align:left">Phone</th>
                <th style="text-align:right">Balance</th>
                <th style="width:120px"></th>
              </tr>
            </thead>
            <tbody id="customerTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  function renderTable() {
    const q = String(root.querySelector('#customerSearch').value || '').toLowerCase();
    const list = db.customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    );

    if (!list.length) {
      root.querySelector('#customerTableBody').innerHTML = `
        <tr><td colspan="4"><div class="empty-state">Koi customer nahi mila.</div></td></tr>`;
      return;
    }

    root.querySelector('#customerTableBody').innerHTML = list
      .map((c) => {
        const bal = Number(c.balance || 0);
        return `
      <tr>
        <td><b>${esc(c.name)}</b></td>
        <td>${esc(c.phone || '')}</td>
        <td style="text-align:right">
          ${bal > 0 ? `<span class="badge warn">${money(bal)}</span>` : `<span class="badge ok">${money(0)}</span>`}
        </td>
        <td style="text-align:right">
          ${bal > 0 ? `<button class="btn btn-primary btn-sm" data-receive="${esc(c.id)}" title="Payment receive">${icon('wallet')}</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-edit="${esc(c.id)}" title="Edit">${icon('settings')}</button>
          <button class="btn btn-ghost btn-sm" data-del="${esc(c.id)}" title="Delete">${icon('trash')}</button>
        </td>
      </tr>`;
      })
      .join('');
  }

  renderTable();
  root.querySelector('#customerSearch').addEventListener('input', renderTable);

  function openForm(existing) {
    const c = existing || {};
    const isEdit = !!existing;

    openModal({
      title: isEdit ? 'Edit customer' : 'Add customer',
      subtitle: isEdit ? c.name : 'Naya customer khata banayein',
      body: `
        <div class="owner-form-grid">
          <label style="grid-column:1/-1">Customer name
            <input id="cfName" value="${esc(c.name || '')}" placeholder="e.g. Ali Khan" />
          </label>
          <label>Phone
            <input id="cfPhone" value="${esc(c.phone || '')}" placeholder="03xx-xxxxxxx" inputmode="tel" />
          </label>
          <label>Opening udhaar (${esc(db.settings.currency || 'Rs')})
            <input id="cfBalance" type="number" min="0" step="0.01" value="${c.balance ?? 0}" />
          </label>
          <label style="grid-column:1/-1">Note (optional)
            <input id="cfNote" value="${esc(c.note || '')}" placeholder="e.g. gali no 4" />
          </label>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="cfSave">${icon('check')} ${isEdit ? 'Save changes' : 'Add customer'}</button>`,
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        const doSave = () => {
          const name = bd.querySelector('#cfName').value.trim();
          if (!name) return toast('Customer ka naam likhein', 'error');
          const data = {
            name,
            phone: bd.querySelector('#cfPhone').value.trim(),
            balance: Number(bd.querySelector('#cfBalance').value || 0),
            note: bd.querySelector('#cfNote').value.trim(),
            updatedAt: new Date().toISOString(),
          };
          if (isEdit) {
            Object.assign(c, data);
            toast('Customer updated', 'success');
          } else {
            db.customers.push({ id: uid('cust'), createdAt: new Date().toISOString(), ...data });
            toast('Customer added', 'success');
          }
          save();
          renderTable();
          bd.remove();
        };
        bd.querySelector('#cfSave').addEventListener('click', doSave);
        bd.querySelector('#cfName').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSave();
        });
        setTimeout(() => bd.querySelector('#cfName').focus(), 60);
      },
    });
  }

  function openReceive(c) {
    const bal = Number(c.balance) || 0;
    openModal({
      title: 'Receive payment',
      subtitle: `${c.name} · baqi ${money(bal)}`,
      body: `
        <div class="form-grid">
          <div class="field">
            <label>Amount received (${esc(db.settings.currency || 'Rs')})</label>
            <input class="input" id="recAmt" type="number" min="0" step="0.01" value="${bal}" />
          </div>
          <div class="field">
            <label>Method</label>
            <select class="input" id="recMethod">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Online">Online / Bank</option>
            </select>
          </div>
          <div class="field full">
            <label>Note (optional)</label>
            <input class="input" id="recNote" placeholder="e.g. partial payment" />
          </div>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="recSave">${icon('check')} Receive</button>`,
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        bd.querySelector('#recSave').addEventListener('click', () => {
          const amount = Math.max(0, Number(bd.querySelector('#recAmt').value) || 0);
          if (!amount) return toast('Amount likhein', 'error');
          const applied = Math.min(amount, bal);
          c.balance = Math.max(0, bal - applied);
          c.updatedAt = new Date().toISOString();
          db.payments = db.payments || [];
          db.payments.push({
            id: uid('pay'),
            type: 'customer',
            party: c.name,
            amount: applied,
            method: bd.querySelector('#recMethod').value || 'Cash',
            note: bd.querySelector('#recNote').value.trim(),
            createdAt: new Date().toISOString(),
          });
          save();
          bd.remove();
          renderTable();
          toast(`${money(applied)} receive ho gaya`, 'success');
        });
      },
    });
  }

  root.querySelector('#addCustomerBtn').addEventListener('click', () => openForm(null));

  root.querySelector('#customerTableBody').addEventListener('click', (e) => {
    const receive = e.target.closest('[data-receive]');
    if (receive) {
      const c = db.customers.find((x) => x.id === receive.dataset.receive);
      if (c) openReceive(c);
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const c = db.customers.find((x) => x.id === edit.dataset.edit);
      if (c) openForm(c);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const c = db.customers.find((x) => x.id === del.dataset.del);
      if (!c) return;
      confirmDialog(`"${c.name}" delete karein?`, () => {
        db.customers = db.customers.filter((x) => x.id !== c.id);
        save();
        renderTable();
        toast('Customer deleted', 'success');
      });
    }
  });
}
