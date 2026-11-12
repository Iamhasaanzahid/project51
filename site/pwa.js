/* MHZALY — progressive web app install prompt.
   Shows an "Install app" button only when the browser says the app is installable. */
(() => {
  if (!("serviceWorker" in navigator)) return;

  let deferred = null;

  function makeButton(host) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      (host.classList.contains("ar-header-actions") ? "ar-btn ar-btn-ghost " : "btn btn-ghost ") +
      "pwa-install";
    btn.textContent = "⤓ Install app";
    btn.hidden = true;
    btn.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch (e) {}
      deferred = null;
      btn.hidden = true;
    });
    return btn;
  }

  function attach() {
    const host =
      document.querySelector(".ar-header-actions") || document.querySelector(".site-header");
    if (!host || host.querySelector(".pwa-install")) return null;

    const btn = makeButton(host);
    const cta = host.querySelector(".site-cta") || host.querySelector(".ar-btn");
    if (cta && cta.parentNode === host) host.insertBefore(btn, cta);
    else host.appendChild(btn);
    return btn;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    const btn = attach();
    if (btn) btn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    document.querySelectorAll(".pwa-install").forEach((b) => b.remove());
    deferred = null;
  });
})();
