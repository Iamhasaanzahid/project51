/* ============================================================
   mhzaly — owner panel (subscriptions & shops)
   ============================================================ */

const API_BASE = 'https://mhzaly-api.mhzaly.workers.dev';
const TOKEN_KEY = 'mhzaly_owner_token';
const app = document.getElementById('ownerApp');

const PLAN_DAYS = { trial: 14, monthly: 30, quarterly: 90, annual: 365, lifetime: null };
const PLAN_LABELS = {
  trial: 'Trial',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  lifetime: 'Lifetime',
};

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  owner: null,
  shops: [],
  stats: {},
  filter: 'all',
  search: '',
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Internet connection nahi hai — please check your network', 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

let toastTimer = null;
function toast(message, type = '') {
  let el = document.querySelector('.owner-toast');
  if (!el) {
    el = document.createElement('div');
    document.body.appendChild(el);
  }
  el.className = `owner-toast ${type}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 4000);
}

/* ---------------- login ---------------- */

function showLogin(message = '') {
  app.innerHTML = `
    <div class="owner-login">
      <div class="owner-login-card">
        <div class="owner-login-logo">m</div>
        <h1>Owner Panel</h1>
        <p>Sirf mhzaly owner ke liye. Shops, subscriptions aur payments manage karein.</p>
        <form id="ownerLoginForm">
          <label>Email</label>
          <input name="email" type="email" required autocomplete="off" spellcheck="false" />
          <label>Password</label>
          <input name="password" type="password" required autocomplete="current-password" />
          <button type="submit">Login</button>
        </form>
        <div id="ownerLoginError" class="owner-error" ${message ? '' : 'hidden'}>${esc(message)}</div>
        <div class="owner-login-note">mhzaly owner panel · private</div>
      </div>
    </div>`;

  const form = app.querySelector('#ownerLoginForm');
  const err = app.querySelector('#ownerLoginError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    try {
      const data = await api('/api/owner/login', { method: 'POST', body: { email, password } });
      state.token = data.token;
      state.owner = data.owner;
      localStorage.setItem(TOKEN_KEY, data.token);
      await refresh();
    } catch (e2) {
      err.hidden = false;
      err.textContent = e2.message;
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });
}

/* ---------------- dashboard ---------------- */

async function refresh() {
  if (!state.token) return showLogin();
  try {
    const data = await api('/api/owner/overview');
    state.shops = data.shops || [];
    state.stats = data.stats || {};
    renderDashboard();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      state.token = '';
      localStorage.removeItem(TOKEN_KEY);
      showLogin('Session expire ho gaya — dobara login karein.');
      return;
    }
    toast(err.message, 'error');
  }
}

const FILTERS = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['trial', 'Trial'],
  ['active', 'Active'],
  ['expired', 'Expired'],
  ['blocked', 'Blocked'],
];

function statCard(label, value, cls = '') {
  return `<div class="stat-card ${cls}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function tabsHTML() {
  return FILTERS.map(
    ([id, label]) =>
      `<button class="owner-tab ${state.filter === id ? 'active' : ''}" data-filter="${id}">${label}</button>`
  ).join('');
}

function statusBadge(shop) {
  if (shop.status === 'pending') return '<span class="badge warn">Pending</span>';
  if (shop.billingStatus === 'blocked') return '<span class="badge danger">Blocked</span>';
  if (shop.billingStatus === 'expired') return '<span class="badge danger">Expired</span>';
  if (shop.billingStatus === 'trial') return '<span class="badge warn">Trial</span>';
  return '<span class="badge ok">Active</span>';
}

function endCell(shop) {
  if (shop.plan === 'lifetime') return '<span class="shop-sub">Never</span>';
  if (!shop.subscriptionEnd) return '<span class="shop-sub">—</span>';
  const left = shop.daysLeft == null ? '' : `${shop.daysLeft} din left`;
  return `<div>${esc(fmtDate(shop.subscriptionEnd))}</div><div class="shop-sub">${esc(left)}</div>`;
}

function filteredShops() {
  const q = state.search.trim().toLowerCase();
  return state.shops.filter((s) => {
    if (state.filter === 'pending' && s.status !== 'pending') return false;
    if (state.filter === 'trial' && !(s.status === 'active' && s.billingStatus === 'trial')) return false;
    if (state.filter === 'active' && !(s.status === 'active' && s.billingStatus === 'active')) return false;
    if (state.filter === 'expired' && s.billingStatus !== 'expired') return false;
    if (state.filter === 'blocked' && s.billingStatus !== 'blocked') return false;
    if (q && !`${s.name} ${s.code} ${s.phone} ${s.email}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderTable() {
  const body = app.querySelector('#ownerTableBody');
  if (!body) return;
  const shops = filteredShops();
  if (!shops.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="owner-empty">Koi shop nahi mili.</div></td></tr>';
    return;
  }
  body.innerHTML = shops
    .map(
      (s) => `<tr>
        <td>
          <div class="shop-name">${esc(s.name)}</div>
          <div class="shop-sub mono">${esc(s.code)}</div>
        </td>
        <td><span class="badge neutral">${esc(s.shopTypeLabel)}</span></td>
        <td>
          <div class="shop-contact">${esc(s.phone || '—')}</div>
          <div class="shop-sub">${esc(s.email || '')}</div>
        </td>
        <td><span class="badge teal">${esc(s.planLabel)}</span></td>
        <td>${statusBadge(s)}</td>
        <td>${endCell(s)}</td>
        <td style="text-align:right"><button class="owner-btn sm" data-manage="${esc(s.id)}">Manage</button></td>
      </tr>`
    )
    .join('');
}

function renderDashboard() {
  const s = state.stats || {};
  app.innerHTML = `
    <div class="owner-shell">
      <header class="owner-topbar">
        <div class="owner-brand">
          <div class="mark">m</div>
          <div><b>mhzaly</b><span>Owner Panel</span></div>
        </div>
        <div class="owner-actions">
          <span class="owner-email">${esc(state.owner?.email || 'Owner')}</span>
          <button class="owner-btn ghost" data-action="refresh">Refresh</button>
          <button class="owner-btn ghost" data-action="password">Change password</button>
          <button class="owner-btn danger" data-action="logout">Logout</button>
        </div>
      </header>

      <main class="owner-main">
        <div class="owner-stats">
          ${statCard('Total shops', s.total || 0, 'teal')}
          ${statCard('Active', s.active || 0, 'ok')}
          ${statCard('Trial', s.trial || 0, 'warn')}
          ${statCard('Expired', s.expired || 0, 'danger')}
          ${statCard('Blocked', s.blocked || 0, 'danger')}
          ${statCard('Pending', s.pending || 0, 'warn')}
          ${statCard('This month revenue', `Rs ${fmtMoney(s.revenueThisMonth || 0)}`, 'wide')}
        </div>

        <div class="owner-toolbar">
          <div class="owner-search">
            <input id="ownerSearch" placeholder="Search shop, phone, code..." value="${esc(state.search)}" />
          </div>
          <div class="owner-tabs">${tabsHTML()}</div>
        </div>

        <div class="owner-card">
          <div class="owner-table-wrap">
            <table class="owner-table">
              <thead>
                <tr>
                  <th>Shop</th><th>Category</th><th>Contact</th><th>Plan</th>
                  <th>Status</th><th>Ends</th><th></th>
                </tr>
              </thead>
              <tbody id="ownerTableBody"></tbody>
            </table>
          </div>
        </div>
      </main>
    </div>`;

  app.querySelector('[data-action="refresh"]').addEventListener('click', () => refresh());
  app.querySelector('[data-action="password"]').addEventListener('click', openPassword);
  app.querySelector('[data-action="logout"]').addEventListener('click', () => {
    state.token = '';
    state.owner = null;
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  });

  app.querySelector('#ownerSearch').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTable();
  });

  app.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      app.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b === btn));
      renderTable();
    });
  });

  app.querySelector('#ownerTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-manage]');
    if (btn) openManage(btn.dataset.manage);
  });

  renderTable();
}

/* ---------------- manage shop ---------------- */

function planSelectOptions(selected) {
  return Object.entries(PLAN_LABELS)
    .map(([id, label]) => {
      const days = PLAN_DAYS[id];
      const hint = days == null ? 'no expiry' : `${days} days`;
      return `<option value="${id}" ${id === selected ? 'selected' : ''}>${label} — ${hint}</option>`;
    })
    .join('');
}

function paymentsHTML(payments) {
  if (!payments.length) {
    return '<div class="owner-payments"><div class="owner-payment-empty">Koi payment record nahi hai.</div></div>';
  }
  const rows = payments
    .map(
      (p) => `<div class="owner-payment-row">
        <div>${esc(fmtDateTime(p.created_at))}</div>
        <div>${esc(PLAN_LABELS[p.plan] || p.plan || '—')}</div>
        <div>Rs ${esc(fmtMoney(p.amount))}</div>
        <div>${esc(p.method || '—')}</div>
        <div>${esc(p.note || '—')}</div>
      </div>`
    )
    .join('');
  return `<div class="owner-payments">
    <div class="owner-payment-row head"><div>Date</div><div>Plan</div><div>Amount</div><div>Method</div><div>Note</div></div>
    ${rows}
  </div>`;
}

async function openManage(shopId) {
  const shop = state.shops.find((s) => s.id === shopId);
  if (!shop) return;

  let payments = [];
  try {
    const data = await api(`/api/owner/payments?shopId=${encodeURIComponent(shopId)}`);
    payments = data.payments || [];
  } catch (err) {
    toast(err.message, 'error');
  }

  const selectedPlan = Object.prototype.hasOwnProperty.call(PLAN_DAYS, shop.plan) ? shop.plan : 'monthly';
  const modal = document.createElement('div');
  modal.className = 'owner-modal-backdrop';
  modal.innerHTML = `
    <div class="owner-modal">
      <div class="owner-modal-head">
        <div>
          <h2>${esc(shop.name)}</h2>
          <p>${esc(shop.code)} · ${esc(shop.shopTypeLabel)} · ${esc(shop.phone || 'no phone')}</p>
        </div>
        <button class="owner-modal-close" data-close>×</button>
      </div>
      <div class="owner-modal-body">
        <div class="owner-current">
          <div><span>Plan</span><b>${esc(shop.planLabel)}</b></div>
          <div><span>Status</span><b>${statusBadge(shop)}</b></div>
          <div><span>Ends</span><b>${shop.plan === 'lifetime' ? 'Never' : esc(fmtDate(shop.subscriptionEnd))}</b></div>
          <div><span>Days left</span><b>${shop.daysLeft == null ? '—' : `${shop.daysLeft} din`}</b></div>
        </div>

        <h3 class="owner-section-title">Set or extend subscription</h3>
        <form id="ownerPlanForm">
          <div class="owner-form-grid">
            <label>Plan
              <select name="plan">${planSelectOptions(selectedPlan)}</select>
            </label>
            <label>Amount received (Rs)
              <input name="amount" type="number" min="0" step="1" value="0" />
            </label>
            <label>Payment method
              <select name="method">
                <option>Cash</option><option>Bank</option><option>JazzCash</option><option>Easypaisa</option><option>Other</option>
              </select>
            </label>
            <label>Note
              <input name="note" placeholder="e.g. June payment" maxlength="200" />
            </label>
          </div>
          <div class="owner-modal-actions">
            <button class="btn btn-primary" type="submit">Set plan &amp; save payment</button>
            <button class="owner-btn" type="button" data-extend>Extend current plan</button>
          </div>
        </form>

        <div class="owner-divider"></div>
        <div class="owner-modal-actions">
          ${
            shop.status === 'pending'
              ? `<button class="btn btn-primary" data-shop-action="approve">Approve shop</button>
                 <button class="btn btn-danger" data-shop-action="reject">Reject</button>`
              : ''
          }
          ${
            shop.billingStatus === 'blocked'
              ? '<button class="btn btn-primary" data-shop-action="unblock">Unblock account</button>'
              : '<button class="btn btn-danger" data-shop-action="block">Block account</button>'
          }
        </div>

        <div class="owner-divider"></div>
        <h3 class="owner-section-title">Payment history</h3>
        ${paymentsHTML(payments)}
      </div>
    </div>`;

  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('[data-close]').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  const form = modal.querySelector('#ownerPlanForm');
  const readForm = () => {
    const fd = new FormData(form);
    return {
      plan: String(fd.get('plan') || 'monthly'),
      amount: Number(fd.get('amount') || 0),
      method: String(fd.get('method') || ''),
      note: String(fd.get('note') || ''),
    };
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await runShopAction(shopId, { action: 'set_plan', ...readForm() }, close);
  });

  modal.querySelector('[data-extend]').addEventListener('click', async () => {
    await runShopAction(shopId, { action: 'extend', ...readForm() }, close);
  });

  modal.querySelectorAll('[data-shop-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.shopAction;
      if (action === 'reject' && !confirm('Ye shop request reject karni hai? Is ka data delete ho jayega.')) return;
      if (action === 'block') {
        const reason = prompt('Block reason (optional):', 'Payment pending');
        if (reason === null) return;
        await runShopAction(shopId, { action, reason }, close);
        return;
      }
      await runShopAction(shopId, { action }, close);
    });
  });
}

async function runShopAction(shopId, body, onDone) {
  try {
    await api('/api/owner/shop', { method: 'POST', body: { shopId, ...body } });
    toast('Shop update ho gayi', 'success');
    if (onDone) onDone();
    await refresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------- password ---------------- */

function openPassword() {
  const modal = document.createElement('div');
  modal.className = 'owner-modal-backdrop';
  modal.innerHTML = `
    <div class="owner-modal" style="max-width:440px">
      <div class="owner-modal-head">
        <div>
          <h2>Change owner password</h2>
          <p>Owner account: ${esc(state.owner?.email || 'Owner')}</p>
        </div>
        <button class="owner-modal-close" data-close>×</button>
      </div>
      <div class="owner-modal-body">
        <form id="ownerPasswordForm">
          <div class="owner-form-grid" style="grid-template-columns:1fr">
            <label>Current password<input name="current" type="password" required autocomplete="current-password" /></label>
            <label>New password<input name="next" type="password" required minlength="8" autocomplete="new-password" /></label>
            <label>Confirm new password<input name="confirm" type="password" required minlength="8" autocomplete="new-password" /></label>
          </div>
          <div class="owner-modal-actions">
            <button class="btn btn-primary" type="submit">Update password</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('[data-close]').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('#ownerPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const current = String(fd.get('current') || '');
    const next = String(fd.get('next') || '');
    const confirm = String(fd.get('confirm') || '');
    if (next !== confirm) return toast('New passwords match nahi kar rahe', 'error');
    try {
      await api('/api/owner/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      toast('Password update ho gaya', 'success');
      close();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ---------------- start ---------------- */

if (state.token) refresh();
else showLogin();
