/* ============================================================
   mhzaly — login / create shop (enhanced)
   ============================================================ */

import { login, register, clearSession, setDemo } from '../api.js';
import { configureShop, hydrate, SHOP_TYPES, shopTypeLabel, loadSampleData } from '../db.js';
import { icon, esc } from '../ui.js';

function goToApp() {
  history.replaceState(null, '', location.pathname + '#/dashboard');
  location.reload();
}

function showError(message) {
  const box = document.querySelector('#authError');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `${icon('alert')}<span>${esc(message)}</span>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearError() {
  const box = document.querySelector('#authError');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

export function render(root, { mode = 'login', shopCode = '' } = {}) {
  const isRegister = mode === 'register';
  root.innerHTML = `
    <div class="auth">
      <section class="auth-side">
        <div class="auth-logo">
          <span class="brand-logo">${icon('bag')}</span>
          <span>mhzaly</span>
        </div>
        <div class="auth-pitch">
          <span class="auth-eyebrow">Shop &amp; inventory management</span>
          <h1>Your whole shop,<br /><em>in one place.</em></h1>
          <p>Billing, stock, udhaar khata, purchases aur profit — itna simple ke har shopkeeper use kar sakay.</p>
          <ul class="auth-points">
            <li>${icon('check')}<div><b>Fast POS billing</b><span>Barcode, cash, card and udhaar</span></div></li>
            <li>${icon('check')}<div><b>Inventory that stays right</b><span>Stock, low-stock alerts and purchases</span></div></li>
            <li>${icon('check')}<div><b>Har shop ka apna account</b><span>Alag login, alag data — cloud mein safe</span></div></li>
            <li>${icon('check')}<div><b>Works on any device</b><span>Shop PC, laptop or mobile — same data</span></div></li>
          </ul>
        </div>
        <div class="auth-side-foot">Cloud synced · Offline ready · No setup cost</div>
      </section>

      <section class="auth-main">
        <div class="auth-card">
          <div class="auth-card-top">
            <div class="brand-logo">${icon('bag')}</div>
            <div>
              <h2 id="authTitle">${isRegister ? 'Create your shop' : 'Welcome back'}</h2>
              <p id="authSub">${isRegister ? 'Free account — start in a minute' : 'Login to your shop'}</p>
            </div>
          </div>

          <div id="shopBrand" class="shop-brand" hidden></div>

          <div class="auth-tabs">
            <button type="button" data-mode="login" class="${isRegister ? '' : 'active'}">Login</button>
            <button type="button" data-mode="register" class="${isRegister ? 'active' : ''}">Create a shop</button>
          </div>

          <div id="authError" class="auth-error" hidden></div>

          <form id="loginForm" ${isRegister ? 'hidden' : ''} autocomplete="on">
            <div class="field">
              <label>Phone number, email or shop code</label>
              <input class="input" name="identifier" id="loginIdentifier" required placeholder="03xx-xxxxxxx or shop code" value="${esc(shopCode)}" autocomplete="username" />
            </div>
            <div class="field" style="margin-top:12px;position:relative">
              <label>Password</label>
              <input class="input" name="password" id="loginPassword" type="password" required minlength="8" placeholder="Your password" autocomplete="current-password" style="padding-right:44px" />
              <button type="button" class="toggle-password" id="toggleLoginPassword" aria-label="Show password">${icon('eye')}</button>
            </div>
            <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" id="loginBtn" type="submit">Login</button>
          </form>

          <form id="registerForm" ${isRegister ? '' : 'hidden'} autocomplete="on">
            <div class="form-grid">
              <div class="field full">
                <label>Shop category *</label>
                <select class="input" name="shopType" id="shopType" required>
                  ${SHOP_TYPES.map((type) => `<option value="${type.id}">${esc(type.label)}</option>`).join('')}
                </select>
                <span class="hint" id="shopTypeHint">${esc(SHOP_TYPES[0].hint)}</span>
              </div>
              <div class="field full">
                <label>Shop name *</label>
                <input class="input" name="shopName" id="shopName" required placeholder="e.g. Al-Madina Mart" maxlength="60" />
              </div>
              <div class="field full">
                <label>Shop phone number *</label>
                <input class="input" name="phone" id="shopPhone" type="tel" inputmode="tel" required placeholder="e.g. 03001234567" maxlength="20" />
                <span class="hint">Yehi number login aur receipt par automatically aayega.</span>
              </div>
              <div class="field full">
                <label>Password *</label>
                <input class="input" name="password" id="registerPassword" type="password" required minlength="8" placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special" autocomplete="new-password" style="padding-right:44px" />
                <button type="button" class="toggle-password" id="toggleRegisterPassword" aria-label="Show password">${icon('eye')}</button>
                <span class="hint">Strong password zaroori hai — aap ka account secure rahe.</span>
              </div>
            </div>
            <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" id="registerBtn" type="submit">Create shop account</button>
            <p class="auth-legal" style="text-align:left;margin-top:10px">Aap ki category ke mutabiq starter products automatically add honge. Approval ke liye request owner ke email par jayegi.</p>
          </form>

          <div id="registerPending" class="auth-success" hidden></div>

          <div class="auth-or"><span>or</span></div>
          <button type="button" class="auth-demo" id="demoBtn">${icon('sparkle')} Try a demo shop — no account needed</button>

          <p class="auth-legal">Secure login · Aap ka data sirf aap ke shop account ke saath cloud mein save hota hai.</p>
          <p class="auth-legal"><a href="./owner.html">Owner login</a> — sab shops manage karne ke liye</p>
        </div>
        <div class="auth-bottom-note">mhzaly · Shop manager for every dukaan</div>
      </section>
    </div>`;

  const loginForm = root.querySelector('#loginForm');
  const registerForm = root.querySelector('#registerForm');
  const loginBtn = root.querySelector('#loginBtn');
  const registerBtn = root.querySelector('#registerBtn');
  const title = root.querySelector('#authTitle');
  const sub = root.querySelector('#authSub');
  const shopTypeSelect = root.querySelector('#shopType');
  const shopTypeHint = root.querySelector('#shopTypeHint');

  if (shopTypeSelect) {
    shopTypeSelect.addEventListener('change', () => {
      const type = SHOP_TYPES.find((item) => item.id === shopTypeSelect.value);
      if (shopTypeHint) shopTypeHint.textContent = type?.hint || '';
    });
  }

  function setMode(next) {
    const reg = next === 'register';
    loginForm.hidden = reg;
    registerForm.hidden = !reg;
    const panel = root.querySelector('#registerPending');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    title.textContent = reg ? 'Create your shop' : 'Welcome back';
    sub.textContent = reg ? 'Free account — start in a minute' : 'Login to your shop';
    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === next));
    history.replaceState(null, '', location.pathname + location.search + `#/${next}`);
    clearError();
  }

  root.querySelectorAll('[data-mode]').forEach((btn) =>
    btn.addEventListener('click', () => setMode(btn.dataset.mode))
  );

  function showPending(res) {
    const shop = res.shop || {};
    const emailLine = res.emailSent
      ? `Approval ke liye owner ko email bhej di gayi hai.`
      : `Approval request owner ke paas pahunch gayi hai. Owner approve karte hi aap login kar sakte hain.`;
    registerForm.hidden = true;
    const panel = root.querySelector('#registerPending');
    panel.hidden = false;
    panel.innerHTML = `
      <div class="auth-success-icon">${icon('check')}</div>
      <h3>Request bhej di gayi!</h3>
      <p><b>${esc(shop.name || 'Shop')}</b> ka account banane ki request save ho gayi hai. ${emailLine}</p>
      <div class="auth-success-shop">
        <div><span>Category</span><b>${esc(shop.shopTypeLabel || shopTypeLabel(shop.shopType))}</b></div>
        <div><span>Shop code</span><b>${esc(shop.code || '')}</b></div>
        <div><span>Phone</span><b>${esc(shop.phone || '')}</b></div>
      </div>
      <p class="auth-success-note">Approval ke baad aap apne <b>phone number</b> aur password se login kar sakte hain.</p>
      <button type="button" class="btn btn-primary btn-lg btn-block" id="pendingLoginBtn">Login page par jayein</button>
    `;
    panel.querySelector('#pendingLoginBtn').addEventListener('click', () => {
      setMode('login');
      const idInput = root.querySelector('#loginIdentifier');
      if (idInput) idInput.value = shop.phone || shop.code || '';
    });
  }

  if (shopCode) {
    import('../api.js').then(({ publicShop }) => {
      publicShop(shopCode)
        .then(({ shop }) => {
          const el = root.querySelector('#shopBrand');
          el.hidden = false;
          el.innerHTML = `<div class="brand-logo">${icon('bag')}</div><div><b>${esc(shop.name)}</b><span>Shop code: ${esc(shop.code)}</span></div>`;
          document.title = `${shop.name} · Login | mhzaly`;
        })
        .catch(() => {
          showError('Is shop code ka koi account nahi mila. Aap phone number se login kar sakte hain.');
        });
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const fd = new FormData(loginForm);
    const identifier = String(fd.get('identifier') || '').trim();
    const password = String(fd.get('password') || '');
    if (!identifier || !password) return showError('Phone number/shop code/email aur password likhein');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in…';
    try {
      const res = await login(identifier, password);
      configureShop({ shopId: res.shop.id });
      hydrate(res.data);
      goToApp();
    } catch (err) {
      showError(err.message || 'Login nahi ho saka');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const fd = new FormData(registerForm);
    const shopTypeVal = String(fd.get('shopType') || 'mart');
    const shopNameVal = String(fd.get('shopName') || '').trim();
    const phoneVal = String(fd.get('phone') || '').trim();
    const password = String(fd.get('password') || '');
    const phoneDigits = phoneVal.replace(/[^\d]/g, '');

    if (shopNameVal.length < 2) return showError('Shop ka naam likhein');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return showError('Sahi phone number likhein (misal: 03001234567)');
    }

    registerBtn.disabled = true;
    registerBtn.textContent = 'Request bhej rahe hain…';
    try {
      const res = await register({ shopType: shopTypeVal, shopName: shopNameVal, phone: phoneVal, password });
      showPending(res);
    } catch (err) {
      showError(err.message || 'Account request nahi bhej saki');
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = 'Create shop account';
    }
  });

  root.querySelector('#demoBtn').addEventListener('click', async () => {
    try {
      clearSession();
      setDemo(true);
      configureShop({ demo: true });
      await loadSampleData({ demo: true });
    } catch (err) {
      console.error('demo setup failed', err);
    }
    history.replaceState(null, '', location.pathname + '#/dashboard');
    location.reload();
  });

  const first = isRegister ? root.querySelector('#shopName') : root.querySelector('#loginIdentifier');
  setTimeout(() => first?.focus(), 80);

  const toggleLoginPassword = root.querySelector('#toggleLoginPassword');
  const toggleRegisterPassword = root.querySelector('#toggleRegisterPassword');
  const loginPasswordInput = root.querySelector('#loginPassword');
  const registerPasswordInput = root.querySelector('#registerPassword');
  let loginShown = false;
  let registerShown = false;
  if (toggleLoginPassword && loginPasswordInput) {
    toggleLoginPassword.addEventListener('click', () => {
      loginShown = !loginShown;
      loginPasswordInput.type = loginShown ? 'text' : 'password';
      toggleLoginPassword.innerHTML = loginShown ? icon('eyeOff') : icon('eye');
    });
  }
  if (toggleRegisterPassword && registerPasswordInput) {
    toggleRegisterPassword.addEventListener('click', () => {
      registerShown = !registerShown;
      registerPasswordInput.type = registerShown ? 'text' : 'password';
      toggleRegisterPassword.innerHTML = registerShown ? icon('eyeOff') : icon('eye');
    });
  }
}
