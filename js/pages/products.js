/* ============================================================
   mhzaly — Products
   ============================================================ */

import { db, uid, save } from '../db.js';
import { icon, esc, toast, openModal, confirmDialog, downloadFile } from '../ui.js';
import { money } from '../receipt-share.js';

export function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Products</h2>
        <p>Add, edit and manage your inventory.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" id="exportProducts">${icon('download')} Export CSV</button>
        <button class="btn btn-primary" id="addProductBtn">${icon('plus')} Add Product</button>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad">
        <div class="field mt-sm">
          <label>Search</label>
          <input class="input" id="productSearch" placeholder="Name, SKU or category" />
        </div>
        <div class="table-wrap">
          <table style="width:100%;margin-top:10px">
            <thead>
              <tr>
                <th style="text-align:left">Name</th>
                <th style="text-align:left">Category</th>
                <th style="text-align:right">SKU</th>
                <th style="text-align:right">Cost</th>
                <th style="text-align:right">Price</th>
                <th style="text-align:right">Stock</th>
                <th style="text-align:right">Low</th>
                <th style="width:120px"></th>
              </tr>
            </thead>
            <tbody id="productTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  function renderTable() {
    const q = String(root.querySelector('#productSearch').value || '').toLowerCase();
    const filtered = db.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );

    if (!filtered.length) {
      root.querySelector('#productTableBody').innerHTML = `
        <tr><td colspan="8"><div class="empty-state">Koi product nahi mila.</div></td></tr>`;
      return;
    }

    root.querySelector('#productTableBody').innerHTML = filtered
      .map((p) => {
        const low = (p.stock ?? 0) <= (p.lowStock ?? 5);
        return `
      <tr>
        <td><b>${esc(p.name)}</b></td>
        <td>${esc(p.category || '')}</td>
        <td style="text-align:right"><span class="mono">${esc(p.sku || '')}</span></td>
        <td style="text-align:right">${money(p.cost)}</td>
        <td style="text-align:right">${money(p.price)}</td>
        <td style="text-align:right">${low ? `<span class="badge ${(p.stock ?? 0) === 0 ? 'danger' : 'warn'}">${esc(p.stock || 0)}</span>` : esc(p.stock || 0)}</td>
        <td style="text-align:right">${esc(p.lowStock || 5)}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}" title="Edit">${icon('settings')}</button>
          <button class="btn btn-ghost btn-sm" data-del="${esc(p.id)}" title="Delete">${icon('trash')}</button>
        </td>
      </tr>`;
      })
      .join('');
  }

  renderTable();
  root.querySelector('#productSearch').addEventListener('input', renderTable);

  function openProductForm(existing) {
    const p = existing || {};
    const isEdit = !!existing;

    openModal({
      title: isEdit ? 'Edit product' : 'Add product',
      subtitle: isEdit ? p.name : 'Naya product inventory mein add karein',
      body: `
        <div class="owner-form-grid">
          <label style="grid-column:1/-1">Product name
            <input id="pfName" value="${esc(p.name || '')}" placeholder="e.g. Basmati Rice 1kg" />
          </label>
          <label>Category
            <input id="pfCategory" value="${esc(p.category || 'General')}" placeholder="Grocery" />
          </label>
          <label>SKU
            <input id="pfSku" value="${esc(p.sku || '')}" placeholder="optional" />
          </label>
          <label>Cost price (${esc(db.settings.currency || 'Rs')})
            <input id="pfCost" type="number" min="0" step="0.01" value="${p.cost ?? 0}" />
          </label>
          <label>Selling price (${esc(db.settings.currency || 'Rs')})
            <input id="pfPrice" type="number" min="0" step="0.01" value="${p.price ?? 0}" />
          </label>
          <label>Stock
            <input id="pfStock" type="number" min="0" step="1" value="${p.stock ?? 0}" />
          </label>
          <label>Low stock alert
            <input id="pfLow" type="number" min="0" step="1" value="${p.lowStock ?? 5}" />
          </label>
          <label>Unit
            <input id="pfUnit" value="${esc(p.unit || 'pcs')}" placeholder="pcs / kg / pack" />
          </label>
        </div>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancel</button>
               <button class="btn btn-primary" id="pfSave">${icon('check')} ${isEdit ? 'Save changes' : 'Add product'}</button>`,
      onMount: (bd) => {
        bd.querySelector('[data-cancel]').addEventListener('click', () => bd.remove());
        const doSave = () => {
          const name = bd.querySelector('#pfName').value.trim();
          const price = Number(bd.querySelector('#pfPrice').value || 0);
          const cost = Number(bd.querySelector('#pfCost').value || 0);
          const stock = Number(bd.querySelector('#pfStock').value || 0);
          const low = Number(bd.querySelector('#pfLow').value || 5);
          if (!name) return toast('Product ka naam likhein', 'error');
          if (price <= 0) return toast('Selling price 0 se zyada honi chahiye', 'error');

          const data = {
            name,
            category: bd.querySelector('#pfCategory').value.trim() || 'General',
            sku: bd.querySelector('#pfSku').value.trim() || `SKU-${Date.now()}`,
            unit: bd.querySelector('#pfUnit').value.trim() || 'pcs',
            cost,
            price,
            stock,
            lowStock: low,
            updatedAt: new Date().toISOString(),
          };

          if (isEdit) {
            Object.assign(p, data);
            toast('Product updated', 'success');
          } else {
            db.products.push({ id: uid('prd'), createdAt: new Date().toISOString(), ...data });
            toast('Product added', 'success');
          }
          save();
          renderTable();
          bd.remove();
        };
        bd.querySelector('#pfSave').addEventListener('click', doSave);
        bd.querySelector('#pfName').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSave();
        });
        setTimeout(() => bd.querySelector('#pfName').focus(), 60);
      },
    });
  }

  root.querySelector('#addProductBtn').addEventListener('click', () => openProductForm(null));

  root.querySelector('#productTableBody').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const p = db.products.find((x) => x.id === editBtn.dataset.edit);
      if (p) openProductForm(p);
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const p = db.products.find((x) => x.id === delBtn.dataset.del);
      if (!p) return;
      confirmDialog(`"${p.name}" delete karein?`, () => {
        db.products = db.products.filter((x) => x.id !== p.id);
        save();
        renderTable();
        toast('Product deleted', 'success');
      });
    }
  });

  root.querySelector('#exportProducts').addEventListener('click', () => {
    const rows = [['Name', 'Category', 'SKU', 'Unit', 'Cost', 'Price', 'Stock', 'Low Stock']];
    for (const p of db.products) {
      rows.push([
        p.name,
        p.category || '',
        p.sku || '',
        p.unit || '',
        Number(p.cost) || 0,
        Number(p.price) || 0,
        Number(p.stock) || 0,
        Number(p.lowStock) || 0,
      ]);
    }
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadFile(`mhzaly-products-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
    toast('Products exported', 'success');
  });
}
