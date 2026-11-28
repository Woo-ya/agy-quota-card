// AGY Quota Card — Runtime Orchestrator & CDP RPC Bridge (runtime.js)

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.__agQcRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (G) {
  'use strict';

  const VERSION = '1.0.0';
  const STYLE_ID = 'ag-qc-style';
  const ATTR_VER = 'data-ag-qc-version';
  const DATA_POLL_MS = 25000;

  function createRpcClient(win, bindingName) {
    let nextId = 1;
    const pending = new Map();

    const resolver = (id, payload) => {
      const rec = pending.get(id);
      if (!rec) return;
      pending.delete(id);
      clearTimeout(rec.timer);
      rec.resolve(payload);
    };

    if (win) {
      win.__agQcRpcResolve = resolver;
    }

    function call(action, params = {}, timeoutMs = 12000) {
      const fn = win && bindingName ? win[bindingName] : null;
      if (typeof fn !== 'function') {
        return Promise.resolve({ ok: false, error: 'rpc-unavailable' });
      }
      const id = `qc_${nextId++}_${Date.now().toString(36)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: 'rpc-timeout' });
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        try {
          fn(JSON.stringify({ id, action, params }));
        } catch (err) {
          clearTimeout(timer);
          pending.delete(id);
          resolve({ ok: false, error: String(err?.message || err) });
        }
      });
    }

    function destroy() {
      for (const rec of pending.values()) {
        clearTimeout(rec.timer);
        rec.resolve({ ok: false, error: 'destroyed' });
      }
      pending.clear();
      if (win && win.__agQcRpcResolve === resolver) {
        try {
          delete win.__agQcRpcResolve;
        } catch {}
      }
    }

    return { call, destroy };
  }

  function mountQuotaCardRuntime(options = {}) {
    const doc = options.doc || (typeof document !== 'undefined' ? document : null);
    const win = options.win || (typeof window !== 'undefined' ? window : null);
    const cssText = typeof options.cssText === 'string' ? options.cssText : '';
    const rpcBinding = options.rpcBinding || '__agQcRpcCall';
    const hash = options.hash || '';

    const core = options.core || G.__agQcCore;
    const uiMod = options.uiMod || G.__agQcUi;
    if (!core || !uiMod) {
      throw new Error('AGY Quota Card core/ui modules missing');
    }

    let destroyed = false;
    let styleEl = null;
    let mutObserver = null;
    let mutRaf = 0;
    let pollTimer = 0;

    if (doc && cssText) {
      styleEl = doc.getElementById?.(STYLE_ID) || doc.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = cssText;
      (doc.head || doc.documentElement).appendChild(styleEl);
    }
    doc?.documentElement?.setAttribute?.(ATTR_VER, VERSION);

    const rpc = options.callRpc
      ? { call: options.callRpc, destroy: () => {} }
      : createRpcClient(win, rpcBinding);

    const controller = uiMod.createQuotaCardController({
      core,
      doc,
      win,
      callRpc: (action, params) => rpc.call(action, params),
    });

    function scheduleSync() {
      if (destroyed || mutRaf) return;
      const raf = win?.requestAnimationFrame || ((cb) => setTimeout(cb, 50));
      mutRaf = raf(() => {
        mutRaf = 0;
        if (!destroyed) controller.sync();
      });
    }

    // Watch DOM mutations ONLY to re-mount if Antigravity unmounts/rebuilds the sidebar.
    // Never trigger unnecessary re-renders while the card is already mounted and interactive!
    if (win?.MutationObserver && doc?.body) {
      mutObserver = new win.MutationObserver(() => {
        if (destroyed) return;
        const card = doc.querySelector?.('[data-testid="ag-quota-card"]');
        if (card && card.isConnected) return;
        scheduleSync();
      });
      mutObserver.observe(doc.body, { childList: true, subtree: true });
    }

    // Periodic background quota sync (paused when tab is hidden)
    pollTimer = setInterval(() => {
      if (destroyed || doc?.hidden) return;
      void controller.refresh(false);
    }, DATA_POLL_MS);

    let lastFocusRefreshAt = 0;
    function onVisibilityChange() {
      if (destroyed || doc?.hidden) return;
      controller.sync();
      void controller.refresh(false);
    }
    function onWindowFocus() {
      if (destroyed || doc?.hidden) return;
      const now = Date.now();
      if (now - lastFocusRefreshAt < 2500) return;
      lastFocusRefreshAt = now;
      controller.sync();
      void controller.refresh(true);
    }
    doc?.addEventListener?.('visibilitychange', onVisibilityChange);
    win?.addEventListener?.('focus', onWindowFocus);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (mutObserver) mutObserver.disconnect();
      doc?.removeEventListener?.('visibilitychange', onVisibilityChange);
      win?.removeEventListener?.('focus', onWindowFocus);
      controller.destroy();
      rpc.destroy();
      if (styleEl && styleEl.parentNode) {
        styleEl.remove();
      }
      doc?.documentElement?.removeAttribute?.(ATTR_VER);
    }

    return {
      version: VERSION,
      hash,
      sync: () => controller.sync(),
      refresh: (force = true) => controller.refresh(force),
      getDebugState: () => controller.getDebugState(),
      destroy,
    };
  }

  return {
    VERSION,
    mountQuotaCardRuntime,
  };
});
