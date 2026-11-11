/* ============================================================
   mhzaly — app shell, auth gate & router
   ============================================================ */

import { db, lowStockProducts, totalReceivable, totalSales, totalProfit, configureShop, hydrate, save } from './db.js';
import { icon, esc, initials, toast, openModal, closeModal, linkLabels } from './ui.js';
import {
  getToken, getStoredShop, isDemo, bootstrap, clearSession,
  changePassword, onSyncStatus, getSyncStatus, markSynced,
} from './api.js';
import { resolvedTheme, applyTheme, toggleTheme, watchSystemTheme } from './theme.js';

import * as authPage from './pages/auth.js';
import * as dashboard from './pages/dashboard.js';
import * as assistant from './pages/assistant.js';
import * as pos from './pages/pos.js';
import * as products from './pages/products.js';
import * as sales from './pages/sales.js';
import * as purchases from './pages/purchases.js';
import * as customers from './pages/customers.js';
import * as suppliers from './pages/suppliers.js';
import * as expenses from './pages/expenses.js';
import * as reports from './pages/reports.js';
import * as settings from './pages/settings.js';
import * as returns from './pages/returns.js';

const PAGES = {
  dashboard, assistant, login: authPage, pos, products, sales, purchases, customers, suppliers, expenses, reports, settings, returns,
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  assistant: 'AI Assistant',
  pos: 'POS Billing',
  products: 'Products',
  sales: 'Sales',
  purchases: 'Purchases',
  customers: 'Customers',
  suppliers: 'Suppliers',
  expenses: 'Expenses',
  reports: 'Reports',
  settings: 'Settings',
  returns: 'Returns & Refunds',
};

let currentPage = null;

/* ---------- install prompt & command palette ---------- */
let deferredInstall = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.hidden = false;
});

function openCommandPalette() {
  const actions = [
    { label: 'New sale (POS)', hint: 'Create an invoice', go: 'pos', icon: 'plus' },
    { label: 'AI Assistant', hint: 'Ask about shop data', go: 'assistant', icon: 'sparkle' },
    { label: 'Dashboard', hint: 'Today overview', go: 'dashboard', icon: 'calendar' },
    { label: 'Products', hint: 'Inventory', go: 'products', icon: 'bag' },
    { label: 'Sales', hint: 'All invoices', go: 'sales', icon: 'check' },
    { label: 'Returns & refunds', hint: 'Return items', go: 'returns', icon: 'return' },
    { label: 'Purchases', hint: 'Supplier stock', go: 'purchases', icon: 'alert' },
    { label: 'Customers', hint: 'Udhaar khata', go: 'customers', icon: 'bag' },
    { label: 'Suppliers', hint: 'Payables', go: 'suppliers', icon: 'bag' },
    { label: 'Expenses', hint: 'Record costs', go: 'expenses', icon: 'alert' },
    { label: 'Reports', hint: 'Profit & summary', go: 'reports', icon: 'chart' },
    { label: 'Settings', hint: 'Shop & backup', go: 'settings', icon: 'settings' },
    { label: 'Toggle dark mode', hint: 'Theme', theme: true, icon: 'moon' },
  ];
  openModal({
    title: 'Quick actions',
    subtitle: 'Type to filter · Enter to open · Ctrl+/ anytime',
    body: `<input class="input" id="cmdInput" placeholder="Type a page or action…" autocomplete="off" />
      <div class="cmd-list" id="cmdList"></div>`,
    onMount: (bd) => {
      const input = bd.querySelector('#cmdInput');
      const list = bd.querySelector('#cmdList');
      let filtered = actions;
      const paint = () => {
        list.innerHTML = filtered.length
          ? filtered.map((a, i) => `<button class="cmd-item" data-i="${i}" type="button">${icon(a.icon)}<span>${esc(a.label)}</span><em>${esc(a.hint || '')}</em></button>`).join('')
          : '<div class="empty-state">Kuch match nahi hua.</div>';
      };
      const run = (a) => {
        if (!a) return;
        bd.remove();
        if (a.theme) toggleTheme();
        else if (a.go) navigate('#/' + a.go);
      };
      paint();
      input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        filtered = actions.filter((a) => a.label.toLowerCase().includes(q) || (a.hint || '').toLowerCase().includes(q));
        paint();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); run(filtered[0]); }
      });
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-i]');
        if (btn) run(filtered[Number(btn.dataset.i)]);
      });
      setTimeout(() => input.focus(), 60);
    },
  });
}

function renderAuthView() {
  const hash = location.hash.replace(/^#\/?/, '');
  const mode = hash === 'register' ? 'register' : 'login';
  const params = new URLSearchParams(location.search);
  const shopCode = (params.get('shop') || '').trim().toLowerCase();
  document.title = 'mhzaly — Shop Manager';
  authPage.render(document.getElementById('app'), { mode, shopCode });
  linkLabels(document.getElementById('app'));
}

export function init() {
  applyTheme();
  watchSystemTheme((resolved) => {
    const btn = document.getElementById('themeBtn');
    if (btn) btn.innerHTML = icon(resolved === 'dark' ? 'sun' : 'moon');
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  const params = new URLSearchParams(location.search);
  if (params.get('logout') === '1') {
    clearSession();
    history.replaceState(null, '', location.pathname);
    // Force a clean slate: drop the service worker + caches so a stale
    // build can never keep the old login/dashboard around.
    Promise.resolve().then(async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { /* ignore */ }
    });
  }
  if (isDemo()) {
    configureShop({ demo: true });
    renderShell();
    const hash = location.hash && location.hash !== '#/login' && location.hash !== '#/register' ? location.hash : '#/dashboard';
    if (!location.hash || location.hash === '#/login' || location.hash === '#/register') {
      history.replaceState(null, '', location.pathname + '#/dashboard');
    }
    navigate(hash);
    return;
  }
  const token = getToken();
  if (token) {
    const stored = getStoredShop();
    if (stored) {
      configureShop({ shopId: stored.id });
      bootstrap().then((res) => {
        hydrate(res.data);
        if (res.shop) {
          db.settings._plan = res.shop.plan;
          db.settings._planLabel = res.shop.planLabel;
          db.settings._daysLeft = res.shop.daysLeft;
          db.settings._billingStatus = res.shop.billingStatus;
          save();
        }
        markSynced();
        renderShell();
        navigate('#/dashboard');
      }).catch((err) => {
        console.error('bootstrap failed', err);
        clearSession();
        location.href = './';
      });
      return;
    }
  }
  renderAuthView();
}

function shell() {
  const shop = db.settings.shopName || 'My Mart';
  document.getElementById('app').innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-logo">${icon('bag')}</div>
          <div>
            <div class="brand-name">mhzaly</div>
            <div class="brand-sub">${esc(shop)}</div>
          </div>
        </div>
        <nav class="nav" id="nav"></nav>
        <button class="sidebar-foot" id="sidebarAccount" type="button">
          <div class="avatar">${esc(initials(db.settings.ownerName || shop))}</div>
          <div class="grow" style="text-align:left">
            <div class="who">${esc(db.settings.ownerName || 'Shop Owner')}</div>
            <div class="role">${isDemo() ? 'Demo — not synced' : 'Cloud synced'}</div>
          </div>
          ${icon('settings', 'foot-icon')}
        </button>
      </aside>

      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
          <div>
            <h1 id="pageTitle">Dashboard</h1>
            <div class="sub" id="pageSub"></div>
          </div>
          <div class="topbar-right">
            <span class="pill sync-pill idle" id="syncPill">${syncPillHTML('idle')}</span>
            <span class="pill date-pill">${icon('calendar')}<span id="todayPill"></span></span>
            <button class="icon-btn" id="installBtn" title="Install app" hidden>${icon('download')}</button>
            <button class="icon-btn" id="themeBtn" title="Dark mode">${icon('moon')}</button>
            <button class="icon-btn" id="cmdBtn" title="Quick actions (Ctrl+/)" aria-label="Quick actions">${icon('search')}</button>
            <button class="icon-btn account-btn" id="accountBtn" title="Shop account">${esc(initials(db.settings.ownerName || shop))}</button>
            <button class="btn btn-ghost btn-sm" id="logoutTopBtn" title="${isDemo() ? 'Exit demo' : 'Logout'}">${isDemo() ? 'Exit' : 'Logout'}</button>
            <button class="btn btn-primary btn-sm" data-nav="pos">${icon('plus')} New Sale</button>
          </div>
        </header>
        <main class="content" id="main"></main>
      </div>

      <button class="ai-fab" id="aiFab" type="button" title="Ask AI (Ctrl+K)" aria-label="Ask AI (Ctrl+K)">
        ${icon('sparkle')} <span>Ask AI</span>
      </button>
    </div>`;

  document.getElementById('todayPill').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  document.getElementById('nav').innerHTML = navHTML('dashboard');

  document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  const aiFab = document.getElementById('aiFab');
  if (aiFab) {
    aiFab.addEventListener('click', () => {
      navigate('#/assistant');
      document.getElementById('sidebar').classList.remove('open');
      setTimeout(() => document.getElementById('aiText')?.focus(), 120);
    });
  }
  if (!document.body.dataset.aiShortcut) {
    document.body.dataset.aiShortcut = '1';
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        navigate('#/assistant');
        setTimeout(() => document.getElementById('aiText')?.focus(), 140);
      }
      if ((e.ctrlKey || e.metaKey) && String(e.key) === '/') {
        e.preventDefault();
        openCommandPalette();
      }
    });
  }

  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    const paintThemeBtn = () => {
      themeBtn.innerHTML = icon(resolvedTheme() === 'dark' ? 'sun' : 'moon');
      themeBtn.title = resolvedTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    };
    paintThemeBtn();
    themeBtn.addEventListener('click', () => {
      toggleTheme();
      paintThemeBtn();
      toast(resolvedTheme() === 'dark' ? 'Dark mode on' : 'Light mode on');
    });
  }

  const cmdBtn = document.getElementById('cmdBtn');
  if (cmdBtn) cmdBtn.addEventListener('click', openCommandPalette);

  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    if (deferredInstall && !window.matchMedia('(display-mode: standalone)').matches) installBtn.hidden = false;
    installBtn.addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch { /* ignore */ }
      deferredInstall = null;
      installBtn.hidden = true;
    });
  }

  if (!document.body.dataset.netShortcut) {
    document.body.dataset.netShortcut = '1';
    window.addEventListener('offline', () => paintSyncPill('offline'));
    window.addEventListener('online', () => paintSyncPill(getSyncStatus()));
  }

  document.getElementById('accountBtn').addEventListener('click', openAccountModal);
  document.getElementById('sidebarAccount').addEventListener('click', openAccountModal);
  document.getElementById('logoutTopBtn').addEventListener('click', () => {
    if (isDemo()) {
      clearSession();
      window.location.href = location.pathname;
      return;
    }
    const stored = getStoredShop() || {};
    clearSession();
    window.location.href = stored.code ? `${location.pathname}?shop=${encodeURIComponent(stored.code)}` : location.pathname;
  });

  document.body.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      navigate('#/' + navBtn.dataset.nav);
      document.getElementById('sidebar').classList.remove('open');
      return;
    }
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) {
      navigate('#/' + goBtn.dataset.go);
    }
  });

  onSyncStatus(paintSyncPill);
  paintSyncPill(getSyncStatus());

  const welcome = sessionStorage.getItem('mhzaly_welcome');
  if (!welcome) {
    sessionStorage.setItem('mhzaly_welcome', '1');
  }
}

function navHTML(active) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: icon('calendar') },
    { id: 'assistant', label: 'AI Assistant', icon: icon('sparkle') },
    { id: 'pos', label: 'POS Billing', icon: icon('plus') },
    { id: 'products', label: 'Products', icon: icon('bag') },
    { id: 'sales', label: 'Sales', icon: icon('check') },
    { id: 'returns', label: 'Returns', icon: icon('return') },
    { id: 'purchases', label: 'Purchases', icon: icon('alert') },
    { id: 'customers', label: 'Customers', icon: icon('bag') },
    { id: 'suppliers', label: 'Suppliers', icon: icon('bag') },
    { id: 'expenses', label: 'Expenses', icon: icon('alert') },
    { id: 'reports', label: 'Reports', icon: icon('check') },
    { id: 'settings', label: 'Settings', icon: icon('settings') },
  ];
  return items.map((item) => `
    <button class="nav-item ${item.id === active ? 'active' : ''}" data-nav="${item.id}">
      ${item.icon} ${item.label}
    </button>`).join('');
}

function renderShell() {
  shell();
  window.dispatchEvent(new CustomEvent('shell:rendered'));
}

function paintSyncPill(status) {
  const el = document.getElementById('syncPill');
  if (!el) return;
  const labels = { idle: 'Synced', saving: 'Saving…', saved: 'Saved', offline: 'Offline', error: 'Session Expired' };
  const colors = { idle: 'teal', saving: 'warn', saved: 'ok', offline: 'warn', error: 'danger' };
  el.className = `pill sync-pill ${colors[status] || 'idle'}`;
  el.innerHTML = syncPillHTML(status);
  el.title = isDemo() ? 'Demo shop — data is only on this browser' : 'Cloud sync status';
}

function syncPillHTML(status) {
  const dots = status === 'saving' ? '…' : '';
  return `${icon('check')} ${status}`;
}

function navigate(hash) {
  if (!hash) hash = '#/dashboard';
  const path = hash.slice(2);
  const [page, ...rest] = path.split('/');
  const pageId = page;

  document.getElementById('nav').querySelectorAll('[data-nav]').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === pageId);
  });

  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSub');
  titleEl.textContent = PAGE_TITLES[pageId] || pageId;
  subEl.textContent = '';

  const mod = PAGES[pageId];
  if (mod && mod.render) {
    const root = document.getElementById('main');
    mod.render(root, rest.join('/'));
    linkLabels(root);
  } else {
    document.getElementById('main').innerHTML = `<div class="empty-state">Page not found: ${esc(pageId)}</div>`;
  }
  currentPage = pageId;
  document.body.classList.toggle('on-assistant', pageId === 'assistant');
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function openAccountModal() {
  const stored = getStoredShop() || {};
  const demo = isDemo();
  const code = stored.code || '';
  const link = code ? `${location.origin}${location.pathname}?shop=${code}` : '';

  const modal = openModal({
    title: 'Shop account',
    subtitle: stored.name || db.settings.shopName || 'mhzaly shop',
    body: `
      <div class="stat-strip">
        <div><div class="lbl">Shop code</div><div class="val mono" style="font-size:14px">${esc(code || 'demo')}</div></div>
        <div><div class="lbl">Login email</div><div class="val" style="font-size:13px;word-break:break-all">${esc(stored.email || '—')}</div></div>
        <div><div class="lbl">Category</div><div class="val" style="font-size:13px">${esc(db.settings.shopType ? db.settings.shopType : 'mart')}</div></div>
        <div><div class="lbl">Mode</div><div class="val" style="font-size:14px">${demo ? 'Demo' : 'Cloud'}</div></div>
      </div>
      ${
        link
          ? `<div class="field mt">
              <label>Your shop's login page</label>
              <div class="flex">
                <input class="input mono input-sm" id="shopLoginLink" readonly value="${esc(link)}" />
                <button class="btn btn-ghost btn-sm" id="copyLoginLink" type="button">${icon('download')} Copy</button>
              </div>
              <span class="hint">Send this link to your staff or open it on another device to log in with your password.</span>
            </div>`
          : ''
      }
      ${
        demo
          ? `<div class="alert-box mt">${icon('sparkle')}<div>You are exploring a demo shop. Data is saved only in this browser. Create an account to keep your shop online and synced.</div></div>`
          : `<div class="alert-box mt" style="background:#f0fdfa;border-color:#99f6e4;color:#115e59">${icon('check')}<div>Your shop data is synced to mhzaly cloud and available on any device after login.</div></div>`
      }`,
    footer: `
      ${demo ? `<button class="btn btn-ghost" id="createFromDemo">Create my shop</button>` : `<button class="btn btn-ghost" id="changePasswordBtn">Change password</button>`}
      <button class="btn btn-ghost" data-modal-close>Close</button>
      <button class="btn btn-danger" id="logoutBtn">${demo ? 'Exit demo' : 'Logout'}</button>`,
    onMount: (m) => {
      m.querySelector('#copyLoginLink')?.addEventListener('click', () => copyText(link));
      m.querySelector('#logoutBtn').addEventListener('click', () => {
        if (demo) {
          clearSession();
          window.location.href = location.pathname;
          return;
        }
        clearSession();
        window.location.href = code ? `${location.pathname}?shop=${encodeURIComponent(code)}` : location.pathname;
      });
      m.querySelector('#createFromDemo')?.addEventListener('click', () => {
        clearSession();
        window.location.href = location.pathname + '#/register';
      });
      m.querySelector('#changePasswordBtn')?.addEventListener('click', () => {
        closeModal();
        setTimeout(openChangePassword, 60);
      });
    },
  });
  return modal;
}

function openChangePassword() {
  const modal = openModal({
    title: 'Change password',
    subtitle: 'Keep your shop account secure',
    body: `
      <form id="passwordForm">
        <div class="field">
          <label>Current password</label>
          <input class="input" name="current" type="password" required autocomplete="current-password" />
        </div>
        <div class="field mt-sm">
          <label>New password</label>
          <input class="input" name="next" type="password" required minlength="8" autocomplete="new-password" />
        </div>
        <div class="field mt-sm">
          <label>Confirm new password</label>
          <input class="input" name="confirm" type="password" required minlength="8" autocomplete="new-password" />
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" data-modal-close>Cancel</button>
          <button class="btn btn-primary" type="submit">Update password</button>
        </div>
      </form>`,
    onMount: (m) => {
      m.querySelector('#passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const current = String(fd.get('current') || '');
        const next = String(fd.get('next') || '');
        const confirm = String(fd.get('confirm') || '');
        if (next !== confirm) return toast('New passwords match nahi kar rahe', 'error');
        try {
          await changePassword(current, next);
          toast('Password update ho gaya', 'success');
          closeModal();
        } catch (err) {
          toast(err.message || 'Password update nahi ho saka', 'error');
        }
      });
    },
  });
  return modal;
}

function copyText(text) {
  const value = text || '';
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Copied');
    } catch {
      toast('Copy nahi ho saka', 'error');
    }
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value).then(() => toast('Copied')).catch(fallback);
  } else {
    fallback();
  }
}

window.addEventListener('hashchange', () => {
  if (document.getElementById('main')) navigate(location.hash);
  else renderAuthView();
});
window.addEventListener('session:expired', () => {
  clearSession();
  toast('Session expire ho gaya — dobara login karein', 'error');
  setTimeout(() => { location.href = './'; }, 800);
});

export { shell, navigate };

init();
