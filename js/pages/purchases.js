/* ============================================================
   mhzaly — Purchases
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal, confirmDialog } from '../ui.js';
import { money } from '../receipt-share.js';

export function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Purchases</h2>
        <p>Record supplier purchases and update stock.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" id="addPurchaseBtn">${icon('plus')} Record Purchase</button>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad">
        <div class="table-wrap">
          <table style="width:100%">
            <thead>
              <tr>
                <th style="text-align:left">Product</th>
                <th style="text-align:left">Supplier</th>
                <th style="text-align:right">Qty</th>
                <th style="text-align:right">Cost</th>
                <th style="text-align:left">Date</th>
                <th style="width:70px"></th>
              </tr>
            </thead>
            <tbody id="purchaseTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  function renderTable() {
    const list = db.purchases.slice().reverse();
    if (!list.length) {
      root.querySelector('#purchaseTableBody').innerHTML = `
        <tr><td colspan="6"><div class="empty-state">Abhi koi purchase record nahi hui.</div></td></tr>`;
      return;
    }
    root.querySelector('#purchaseTableBody').innerHTML = list
      .map(
        (p) => `
      <tr>
        <td><b>${esc(p.productName)}</b></td>
        <td>${esc(p.supplierName || '')}</td>
        <td style="text-align:right">${esc(p.qty)}</td>
        <td style="text-align:right">${money(p.totalCost)}</td>
        <td>${new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm" data-del="${esc(p.id)}" title="Delete">${icon('trash')}</button>
        </td>
      </tr>`
      )
      .join('');
  }

  renderTable();

  function openForm() {
    const productOptions = db.products
      .map((p) => `<option value="${esc(p.id)}" data-cost="${Number(p.cost || 0)}">${esc(p.name)}</option>`)
      .join('');
    const supplierOptions = db.suppliers
      .map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`)
      .join('');

    openModal({
      title: 'Record purchase',
      subtitle: 'Supplier se maal kharida — stock auto update hoga',
      body: `
        <div class="owner-form-grid">
          <label style="grid-column:1/-1">Product
            <select id="pfProduct">
              <option value="">— New / other product —</option>
              ${productOptions}
            </select>
          </label>
          <label style="grid-column:1/-1" id="pfNameWrap">Product name
            <input id="pfProductName" placeholder="e.g. Basmati Rice 1kg" />
          </label>
          <label>Supplier
            <select id="pfSupplier">
              <option value="">— Select supplier —</option>
              ${supplierOptions}
            </select>
          </label>
          <label>Supplier name (agar list mein nahi)
            <input id="pfSupplierName" placeholder="optional" />
          </label>
          <label>Quantity
            <input id="pfQty" type="number" min="1" step="1" value="1" />
          </label>
          <label>Cost per unit (${esc(db.settings.currency || 'Rs')})
            <input id="pfCost" type="number" min="0" step="0.01" value="0" />
          </label>
          <div style="grid-column:1/-1" class="pos-total">
            <span>Total cost</span><span id="pfTotal">${money(0)}</span>
          </div>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="pfSave">${icon('check')} Record purchase</button>`,
      onMount: (bd) => {
        const productSel = bd.querySelector('#pfProduct');
        const nameWrap = bd.querySelector('#pfNameWrap');
        const nameInput = bd.querySelector('#pfProductName');
        const qtyInput = bd.querySelector('#pfQty');
        const costInput = bd.querySelector('#pfCost');
        const totalEl = bd.querySelector('#pfTotal');

        const updateTotal = () => {
          const total = Number(qtyInput.value || 0) * Number(costInput.value || 0);
          totalEl.textContent = money(total);
        };

        const toggleName = () => {
          const isNew = !productSel.value;
          nameWrap.style.display = isNew ? '' : 'none';
          if (!isNew) {
            const opt = productSel.selectedOptions[0];
            costInput.value = opt ? opt.dataset.cost || 0 : 0;
            updateTotal();
          }
        };

        productSel.addEventListener('change', toggleName);
        qtyInput.addEventListener('input', updateTotal);
        costInput.addEventListener('input', updateTotal);
        toggleName();

        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());

        bd.querySelector('#pfSave').addEventListener('click', () => {
          const selectedId = productSel.value;
          const selectedProd = selectedId ? db.products.find((p) => p.id === selectedId) : null;
          const productName = selectedProd ? selectedProd.name : nameInput.value.trim();
          const qty = Number(qtyInput.value || 0);
          const cost = Number(costInput.value || 0);

          if (!productName) return toast('Product name likhein', 'error');
          if (qty <= 0) return toast('Quantity 0 se zyada likhein', 'error');
          if (cost < 0) return toast('Cost sahi likhein', 'error');

          const supplierSelect = bd.querySelector('#pfSupplier').value;
          const supplierName =
            supplierSelect || bd.querySelector('#pfSupplierName').value.trim() || '';

          db.purchases.push({
            id: uid('pur'),
            productId: selectedProd ? selectedProd.id : null,
            productName,
            supplierName,
            qty,
            cost,
            totalCost: qty * cost,
            createdAt: new Date().toISOString(),
          });

          if (selectedProd) {
            selectedProd.stock = (selectedProd.stock || 0) + qty;
            selectedProd.cost = cost;
          } else {
            const prod = db.products.find((x) => x.name === productName);
            if (prod) {
              prod.stock = (prod.stock || 0) + qty;
              prod.cost = cost;
            }
          }

          save();
          renderTable();
          toast('Purchase recorded', 'success');
          bd.remove();
        });

        setTimeout(() => {
          if (!productSel.value) nameInput.focus();
        }, 60);
      },
    });
  }

  root.querySelector('#addPurchaseBtn').addEventListener('click', openForm);

  root.querySelector('#purchaseTableBody').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const item = db.purchases.find((x) => x.id === del.dataset.del);
    if (!item) return;
    confirmDialog(`"${item.productName}" ki purchase delete karein? (stock reverse nahi hoga)`, () => {
      db.purchases = db.purchases.filter((x) => x.id !== item.id);
      save();
      renderTable();
      toast('Purchase deleted', 'success');
    });
  });
}
