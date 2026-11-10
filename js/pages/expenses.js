/* ============================================================
   mhzaly — Expenses
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal, confirmDialog } from '../ui.js';
import { money } from '../receipt-share.js';

const CATEGORIES = ['Rent', 'Utilities', 'Salary', 'Transport', 'Other'];

export function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Expenses</h2>
        <p>Record rent, utilities, salary and other costs.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" id="addExpenseBtn">${icon('plus')} Add Expense</button>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad">
        <div class="table-wrap">
          <table style="width:100%">
            <thead>
              <tr>
                <th style="text-align:left">Title</th>
                <th style="text-align:left">Category</th>
                <th style="text-align:right">Amount</th>
                <th style="text-align:left">Date</th>
                <th style="width:70px"></th>
              </tr>
            </thead>
            <tbody id="expenseTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  function renderTable() {
    const list = db.expenses.slice().reverse();
    if (!list.length) {
      root.querySelector('#expenseTableBody').innerHTML = `
        <tr><td colspan="5"><div class="empty-state">Abhi koi expense record nahi hui.</div></td></tr>`;
      return;
    }
    root.querySelector('#expenseTableBody').innerHTML = list
      .map(
        (e) => `
      <tr>
        <td><b>${esc(e.title)}</b>${e.note ? `<div class="pos-meta">${esc(e.note)}</div>` : ''}</td>
        <td><span class="badge neutral">${esc(e.category || 'Other')}</span></td>
        <td style="text-align:right">${money(e.amount)}</td>
        <td>${new Date(e.createdAt).toLocaleDateString('en-GB')}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm" data-del="${esc(e.id)}" title="Delete">${icon('trash')}</button>
        </td>
      </tr>`
      )
      .join('');
  }

  renderTable();

  function openForm() {
    openModal({
      title: 'Add expense',
      subtitle: 'Dukaan ka kharcha record karein',
      body: `
        <div class="owner-form-grid">
          <label style="grid-column:1/-1">Title
            <input id="efTitle" placeholder="e.g. Electricity bill" />
          </label>
          <label>Category
            <select id="efCategory">
              ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </label>
          <label>Amount (${esc(db.settings.currency || 'Rs')})
            <input id="efAmount" type="number" min="0" step="0.01" placeholder="0" />
          </label>
          <label>Date
            <input id="efDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </label>
          <label>Note (optional)
            <input id="efNote" placeholder="details" />
          </label>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="efSave">${icon('check')} Add expense</button>`,
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        const doSave = () => {
          const title = bd.querySelector('#efTitle').value.trim();
          const amount = Number(bd.querySelector('#efAmount').value || 0);
          if (!title) return toast('Expense ka title likhein', 'error');
          if (amount <= 0) return toast('Amount 0 se zyada likhein', 'error');
          const dateVal = bd.querySelector('#efDate').value;
          db.expenses.push({
            id: uid('exp'),
            title,
            category: bd.querySelector('#efCategory').value,
            amount,
            note: bd.querySelector('#efNote').value.trim(),
            createdAt: dateVal ? new Date(dateVal + 'T12:00:00').toISOString() : new Date().toISOString(),
          });
          save();
          renderTable();
          toast('Expense recorded', 'success');
          bd.remove();
        };
        bd.querySelector('#efSave').addEventListener('click', doSave);
        bd.querySelector('#efTitle').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSave();
        });
        setTimeout(() => bd.querySelector('#efTitle').focus(), 60);
      },
    });
  }

  root.querySelector('#addExpenseBtn').addEventListener('click', openForm);

  root.querySelector('#expenseTableBody').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const item = db.expenses.find((x) => x.id === del.dataset.del);
    if (!item) return;
    confirmDialog(`"${item.title}" delete karein?`, () => {
      db.expenses = db.expenses.filter((x) => x.id !== item.id);
      save();
      renderTable();
      toast('Expense deleted', 'success');
    });
  });
}
