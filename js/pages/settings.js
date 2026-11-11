/* ============================================================
   mhzaly — Settings & data management
   ============================================================ */

import { db, save, exportDb, importDb, clearAll, loadSampleData, SHOP_TYPES } from '../db.js';
import { icon, esc, toast, confirmDialog, downloadFile, linkLabels } from '../ui.js';
import { getThemeChoice, setThemeChoice } from '../theme.js';

export const meta = { title: 'Settings', subtitle: 'Shop details, backup and preferences' };

const VERSION = '2.1.0';

function syncShell() {
  const shop = db.settings.shopName || 'My Mart';
  const brandSub = document.querySelector('.brand-sub');
  if (brandSub) brandSub.textContent = shop;
  const who = document.querySelector('.sidebar-foot .who');
  if (who) who.textContent = db.settings.ownerName || 'Shop Owner';
}

export function render(root) {
  const s = db.settings;
  const shop = s.shopName || 'My Mart';
  root.innerHTML = `
    <div class="page-head">
      <div class="grow">
        <h2>Settings</h2>
        <p>Manage your shop details, billing, data and security.</p>
      </div>
    </div>

    <div class="grid k2 mt">
      <div class="card">
        <div class="card-head"><h3>Shop details</h3><div class="right"><span class="hint">Shown on receipts</span></div></div>
        <div class="card-pad">
          <form id="shopForm">
            <div class="form-grid">
              <div class="field full">
                <label>Shop name</label>
                <input class="input" name="shopName" value="${esc(s.shopName)}" placeholder="My Mart" />
              </div>
              <div class="field full">
                <label>Shop category</label>
                <select class="input" name="shopType">
                  ${SHOP_TYPES.map((type) => `<option value="${type.id}" ${type.id === (s.shopType || 'mart') ? 'selected' : ''}>${esc(type.label)}</option>`).join('')}
                </select>
                <span class="hint">Category sirf label badalti hai — existing products wohi rahenge.</span>
              </div>
              <div class="field">
                <label>Owner name</label>
                <input class="input" name="ownerName" value="${esc(s.ownerName)}" placeholder="Your name" />
              </div>
              <div class="field">
                <label>Phone</label>
                <input class="input" name="phone" value="${esc(s.phone)}" placeholder="03xx-xxxxxxx" />
              </div>
              <div class="field full">
                <label>Address</label>
                <input class="input" name="address" value="${esc(s.address)}" placeholder="Shop address" />
              </div>
              <div class="field full">
                <label>Receipt footer note</label>
                <input class="input" name="receiptNote" value="${esc(s.receiptNote)}" placeholder="Thank you!" />
              </div>
            </div>
            <div class="alert-box mt" style="background:#f8fafc;border-color:#e2e8f0;color:#334155">
              ${icon('alert')}
              <div><b>Current Plan:</b> ${esc(db.settings._planLabel || '—')}</div>
              <div><b>Status:</b> ${esc(db.settings._billingStatus || '—')}</div>
              <div><b>Days Left:</b> ${esc(db.settings._daysLeft == null ? 'Lifetime' : db.settings._daysLeft + ' din')}</div>
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check')} Save shop details</button></div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Billing preferences</h3></div>
        <div class="card-pad">
          <form id="prefForm">
            <div class="form-grid">
              <div class="field">
                <label>Currency symbol</label>
                <input class="input" name="currency" value="${esc(s.currency)}" maxlength="4" placeholder="Rs" />
              </div>
              <div class="field">
                <label>Tax / GST rate (%)</label>
                <input class="input" name="taxRate" type="number" min="0" max="100" step="any" value="${esc(s.taxRate)}" />
              </div>
              <div class="field full">
                <label>Default low-stock alert level</label>
                <input class="input" name="lowStock" type="number" min="0" step="any" value="${esc(s.lowStock)}" />
                <span class="hint">Used for new products. Each product can have its own level.</span>
              </div>
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check')} Save preferences</button></div>
          </form>
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Appearance</h3><div class="right"><span class="hint">Light, dark ya device ke mutabiq</span></div></div>
      <div class="card-pad">
        <div class="theme-choices" id="themeChoices">
          <button class="theme-choice ${getThemeChoice() === 'light' ? 'active' : ''}" type="button" data-theme-choice="light">
            ${icon('sun')}<b>Light</b><span>Din wali bright look</span>
          </button>
          <button class="theme-choice ${getThemeChoice() === 'dark' ? 'active' : ''}" type="button" data-theme-choice="dark">
            ${icon('moon')}<b>Dark</b><span>Raat wali soft look</span>
          </button>
          <button class="theme-choice ${getThemeChoice() === 'system' ? 'active' : ''}" type="button" data-theme-choice="system">
            ${icon('settings')}<b>System</b><span>Device ke theme ke mutabiq</span>
          </button>
        </div>
        <p class="small muted mt-sm" style="margin-bottom:0">Login page hamesha waisa hi rehta hai — ye choice sirf app ke andar lagti hai.</p>
      </div>
    </div>

    <div class="grid k2 mt">
      <div class="card">
        <div class="card-head"><h3>Backup & restore</h3><div class="right"><span class="badge">${storageSize()}</span></div></div>
        <div class="card-pad">
          <p class="small muted">Your data is saved to your shop account and cached in this browser for offline use. Download a backup now and then — it is a full copy of your shop.</p>
          <div class="flex flex-wrap mt" style="gap:9px">
            <button class="btn btn-primary" id="exportBackup">${icon('download')} Download backup</button>
            <button class="btn btn-ghost" id="importBackup">${icon('upload')} Restore backup</button>
            <input type="file" id="backupFile" accept="application/json,.json" hidden />
          </div>
          <div class="alert-box mt" style="background:#f0fdfa;border-color:#99f6e4;color:#115e59">
            ${icon('alert')}
            <div>Cloud sync keeps your shop on every device you log in from. A backup file is an extra safety copy you can restore at any time.</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Demo & reset</h3></div>
        <div class="card-pad">
          <p class="small muted">Want to try the app with sample products and sales? Load the demo shop. This replaces your current data, so take a backup first.</p>
          <div class="flex flex-wrap mt" style="gap:9px">
            <button class="btn btn-ghost" id="loadDemo">${icon('sparkle')} Load demo data</button>
            <button class="btn btn-danger" id="clearData">${icon('trash')} Clear all data</button>
          </div>
          <div class="divider"></div>
          <div class="flex-between small">
            <span class="muted">Products</span><strong>${db.products.length}</strong>
          </div>
          <div class="flex-between small mt-sm">
            <span class="muted">Invoices</span><strong>${db.sales.length}</strong>
          </div>
          <div class="flex-between small mt-sm">
            <span class="muted">Customers</span><strong>${db.customers.length}</strong>
          </div>
          <div class="flex-between small mt-sm">
            <span class="muted">Suppliers</span><strong>${db.suppliers.length}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>About mhzaly</h3><div class="right"><span class="badge teal">v${VERSION}</span></div></div>
      <div class="card-pad">
        <p class="small muted" style="max-width:760px">
          mhzaly is a simple online shop manager for marts, mobile shops, pharmacies, clothing stores,
          electronics, hardware and general stores. Har shop ka apna login aur alag data hota hai —
          inventory, POS billing, purchases, customer khata, supplier payments, expenses and profit reports, sab ek jagah.
        </p>
        <div class="flex flex-wrap mt" style="gap:8px">
          <span class="badge">Multi-shop accounts</span>
          <span class="badge">POS billing</span>
          <span class="badge">Barcode ready</span>
          <span class="badge">Returns & refunds</span>
          <span class="badge">Hold bills</span>
          <span class="badge">Udhaar khata</span>
          <span class="badge">Purchases</span>
          <span class="badge">Reports</span>
          <span class="badge">Cloud sync</span>
          <span class="badge">Offline + backup</span>
        </div>
      </div>
    </div>`;

  syncShell();
  const rerender = () => { render(root); linkLabels(root); };

  root.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.themeChoice;
      setThemeChoice(choice);
      root.querySelectorAll('[data-theme-choice]').forEach((b) => b.classList.toggle('active', b === btn));
      toast(choice === 'system' ? 'Theme: device ke mutabiq' : `Theme: ${choice === 'dark' ? 'Dark' : 'Light'} mode`, 'success');
    });
  });

  root.querySelector('#shopForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    db.settings.shopName = String(fd.get('shopName') || '').trim() || 'My Mart';
    db.settings.shopType = String(fd.get('shopType') || 'mart');
    db.settings.ownerName = String(fd.get('ownerName') || '').trim();
    db.settings.phone = String(fd.get('phone') || '').trim();
    db.settings.address = String(fd.get('address') || '').trim();
    db.settings.receiptNote = String(fd.get('receiptNote') || '').trim();
    save();
    syncShell();
    toast('Shop details saved');
    rerender();
  });

  root.querySelector('#prefForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tax = Number(fd.get('taxRate'));
    const low = Number(fd.get('lowStock'));
    db.settings.currency = String(fd.get('currency') || 'Rs').trim() || 'Rs';
    db.settings.taxRate = Number.isFinite(tax) && tax >= 0 && tax <= 100 ? tax : 0;
    db.settings.lowStock = Number.isFinite(low) && low >= 0 ? low : 5;
    save();
    toast('Preferences saved');
    rerender();
  });

  root.querySelector('#exportBackup').addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadFile(`mhzaly-backup-${shop}-${stamp}.json`, exportDb());
    toast('Backup downloaded');
  });

  root.querySelector('#importBackup').addEventListener('click', () => {
    root.querySelector('#backupFile').click();
  });

  root.querySelector('#backupFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        importDb(ev.target.result);
        toast('Backup restored');
        rerender();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  root.querySelector('#loadDemo').addEventListener('click', () => {
    confirmDialog('Sample products load kiye jayenge (mojooda data safe rahega). Pehle backup le lein.', () => {
      loadSampleData();
      toast('Sample products loaded');
      rerender();
    });
  });

  root.querySelector('#clearData').addEventListener('click', () => {
    confirmDialog('Poori data delete ho jayegi — ye step undo nahi kiya ja sakta. Backup zaroor le lein.', () => {
      clearAll();
      toast('All data cleared');
      rerender();
    });
  });
}

function storageSize() {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mhzaly_db')) {
        bytes += new Blob([localStorage.getItem(key) || '']).size;
      }
    }
    return (bytes / 1024).toFixed(1) + ' KB';
  } catch { return '0 KB'; }
}

function refresh() {
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('settings:changed'));
  }
}

export { syncShell, refresh };
