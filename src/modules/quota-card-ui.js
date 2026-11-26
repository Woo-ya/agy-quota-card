// AGY Quota Card — Sidebar Usage Card, Multi-Account Switcher Popover & Manager Modal (quota-card-ui.js)
// Combines dsh-cost-meter's bottom-sidebar placement & multi-account pool management
// with Obsidian Prism's clean Gemini/Claude segmented toggle & horizontal gradient quota bars.

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.__agQcUi = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (G) {
  'use strict';

  const S_SIDEBAR_NAV = '[data-testid="sidebar-navigation-items"]';
  const S_SETTINGS_BTN = '[data-testid="settings-button"]';

  const POOL_PRESETS = [
    {
      type: 'antigravity-manager',
      label: 'Antigravity-Manager',
      url: 'http://127.0.0.1:8045/api/accounts',
      authHeader: 'Authorization',
    },
    {
      type: 'dsh-agy-link',
      label: 'DSH AGY-Link',
      url: 'http://127.0.0.1:3000/plugins/agy-link/pool',
      authHeader: 'Authorization',
    },
    {
      type: 'cliproxyapi',
      label: 'CLIProxyAPI',
      url: 'http://127.0.0.1:8317/v0/management/usage',
      authHeader: 'Authorization',
    },
    {
      type: 'custom',
      label: '自定义 JSON 池',
      url: 'http://127.0.0.1:8080/accounts',
      authHeader: 'Authorization',
    },
  ];

  function markNoTranslate(el) {
    if (!el || !el.setAttribute) return el;
    el.setAttribute('translate', 'no');
    el.setAttribute('data-no-translate', 'true');
    el.setAttribute('data-ag-no-i18n', '');
    el.setAttribute('data-ag-localization-skip', 'true');
    el.setAttribute('data-agy-no-translate', 'true');
    el.setAttribute('data-antigravity-zh-skip', '1');
    el.setAttribute('data-ag-owned', '1');
    return el;
  }

  function mkSvg(doc, kind, size = 13) {
    const NS = 'http://www.w3.org/2000/svg';
    if (!doc.createElementNS) {
      const sp = doc.createElement('span');
      sp.textContent = '•';
      return sp;
    }
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const add = (tag, attrs) => {
      const n = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      svg.appendChild(n);
    };
    if (kind === 'refresh') {
      add('polyline', { points: '23 4 23 10 17 10' });
      add('path', { d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' });
    } else if (kind === 'users') {
      add('path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' });
      add('circle', { cx: '9', cy: '7', r: '4' });
      add('path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' });
      add('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' });
    } else if (kind === 'chevDown') {
      add('polyline', { points: '6 9 12 15 18 9' });
    } else if (kind === 'chevUp') {
      add('polyline', { points: '18 15 12 9 6 15' });
    } else if (kind === 'clock') {
      add('circle', { cx: '12', cy: '12', r: '9' });
      add('polyline', { points: '12 7 12 12 15.5 14' });
    } else if (kind === 'close') {
      add('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
      add('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
    } else if (kind === 'plus') {
      add('line', { x1: '12', y1: '5', x2: '12', y2: '19' });
      add('line', { x1: '5', y1: '12', x2: '19', y2: '12' });
    } else if (kind === 'settings') {
      add('circle', { cx: '12', cy: '12', r: '3' });
      add('path', {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
      });
    } else if (kind === 'trash') {
      add('polyline', { points: '3 6 5 6 21 6' });
      add('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' });
      add('path', { d: 'M10 11v6' });
      add('path', { d: 'M14 11v6' });
    } else if (kind === 'arrowRight') {
      add('line', { x1: '5', y1: '12', x2: '19', y2: '12' });
      add('polyline', { points: '12 5 19 12 12 19' });
    } else if (kind === 'check') {
      add('polyline', { points: '20 6 9 17 4 12' });
    }
    return svg;
  }

  /**
   * Locates Antigravity's left sidebar column and the anchor immediately above
   * the bottom divider + footer (Settings button), matching dsh-cost-meter's placement.
   */
  function findSidebarMountTarget(doc) {
    if (!doc?.querySelector) return null;
    const nav = doc.querySelector(S_SIDEBAR_NAV);
    if (!nav) return null;

    // Walk up to the flex-col sidebar container (typically depth 2: .bg-sidebar)
    let col = nav.parentElement;
    for (let i = 0; i < 4 && col; i++) {
      const cls = String(col.className || '');
      if (cls.includes('flex-col') && (cls.includes('bg-sidebar') || col.children.length >= 4)) {
        break;
      }
      col = col.parentElement;
    }
    if (!col || !col.children || !col.children.length) return null;

    // Find bottom footer (contains settings-button) or the 1px divider immediately preceding it
    const settingsBtn = col.querySelector(S_SETTINGS_BTN);
    let footerChild = null;
    if (settingsBtn) {
      let cur = settingsBtn;
      while (cur && cur.parentElement !== col) {
        cur = cur.parentElement;
      }
      if (cur && cur.parentElement === col) footerChild = cur;
    }

    let beforeNode = footerChild;
    if (beforeNode && beforeNode.previousElementSibling) {
      const prev = beforeNode.previousElementSibling;
      const pCls = String(prev.className || '');
      if (pCls.includes('h-px') && !prev.classList.contains('ag-qc-card')) {
        beforeNode = prev;
      }
    }

    return { container: col, beforeNode };
  }

  function createQuotaCardController(options = {}) {
    const core = options.core || G.__agQcCore;
    if (!core) throw new Error('AGY Quota Card core is required');
    const doc = options.doc || (typeof document !== 'undefined' ? document : null);
    const win = options.win || (typeof window !== 'undefined' ? window : null);
    const callRpc = typeof options.callRpc === 'function' ? options.callRpc : async () => ({ ok: false });

    let destroyed = false;
    let cardEl = null;
    let popoverEl = null;
    let modalBackdropEl = null;

    let overview = {
      nowMs: Date.now(),
      selectedAccountId: '',
      selectedGroup: 'gemini',
      collapsed: false,
      localError: '',
      accounts: [],
      pools: [],
    };
    let loading = false;
    let popoverOpen = false;
    let modalOpen = false;
    let modalTab = 'accounts'; // 'accounts' | 'pools'
    let modalMessage = '';
    let modalError = '';
    let editingAliasId = '';
    let editingAliasDraft = '';
    let showManualForm = false;
    let manualForm = {
      name: '',
      email: '',
      planName: 'Google AI Pro',
      gemini5hPct: '100',
      gemini5hReset: '',
      geminiWeeklyPct: '100',
      geminiWeeklyReset: '',
      claude5hPct: '100',
      claude5hReset: '',
      claudeWeeklyPct: '100',
      claudeWeeklyReset: '',
    };
    let poolForm = {
      type: 'antigravity-manager',
      label: 'Antigravity-Manager',
      url: 'http://127.0.0.1:8045/api/accounts',
      authHeader: 'Authorization',
      authToken: '',
    };
    let testingPool = false;
    let lastForceRefreshAt = 0;
    let tickTimer = 0;
    let narrowMode = false;
    let lastCardRenderKey = '';
    let lastPopoverRenderKey = '';

    function getNowMs() {
      return Date.now();
    }

    function getVisibleAccounts() {
      return (overview.accounts || []).filter((a) => a && !a.hidden);
    }

    function getSelectedAccount() {
      return core.resolveSelectedAccount(overview.accounts || [], overview.selectedAccountId);
    }

    async function fetchOverview(force = false) {
      if (destroyed) return;
      if (force) {
        const now = Date.now();
        if (now - lastForceRefreshAt < 2500) return;
        lastForceRefreshAt = now;
      }
      loading = true;
      renderCard();
      if (popoverOpen) renderPopover();
      const res = await callRpc('qc-get-overview', { force });
      if (destroyed) return;
      loading = false;
      if (res && res.ok) {
        overview = {
          ...overview,
          ...res,
          accounts: Array.isArray(res.accounts) ? res.accounts : [],
          pools: Array.isArray(res.pools) ? res.pools : [],
        };
      }
      renderCard();
      if (popoverOpen) renderPopover();
      if (modalOpen) renderModal();
      scheduleCountdownTick();
    }

    function persistPrefs(patch) {
      if (patch.selectedAccountId !== undefined) overview.selectedAccountId = patch.selectedAccountId;
      if (patch.selectedGroup !== undefined) overview.selectedGroup = patch.selectedGroup;
      if (patch.collapsed !== undefined) overview.collapsed = patch.collapsed;
      renderCard();
      if (popoverOpen) renderPopover();
      scheduleCountdownTick();
      void callRpc('qc-set-prefs', patch);
    }

    function selectAccount(accountId) {
      if (!accountId) return;
      popoverOpen = false;
      closePopover();
      persistPrefs({ selectedAccountId: accountId });
    }

    function selectGroup(groupKey) {
      if (groupKey !== 'gemini' && groupKey !== 'claude') return;
      if (overview.selectedGroup === groupKey) return;
      persistPrefs({ selectedGroup: groupKey });
    }

    function toggleCollapsed() {
      if (popoverOpen) closePopover();
      persistPrefs({ collapsed: !overview.collapsed });
    }

    function openNativeSettings() {
      closePopover();
      const btn = doc?.querySelector?.(S_SETTINGS_BTN);
      if (btn && typeof btn.click === 'function') {
        btn.click();
      }
    }

    function scheduleCountdownTick() {
      if (destroyed) return;
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = 0;
      }
      const acc = getSelectedAccount();
      const now = getNowMs();
      const gState = acc
        ? core.resolveGroupState(acc.groups?.[overview.selectedGroup], now, Boolean(acc.isActiveLocal))
        : null;
      const otherKey = overview.selectedGroup === 'gemini' ? 'claude' : 'gemini';
      const otherState = acc
        ? core.resolveGroupState(acc.groups?.[otherKey], now, Boolean(acc.isActiveLocal))
        : null;

      // Tick every 1 second when any exhausted bucket is under 1 hour (live HH:MM:SS countdown),
      // otherwise tick every 15 seconds so minute/hour countdowns stay accurate with near-zero CPU.
      const fastTick = Boolean(gState?.needsSecondTick || otherState?.needsSecondTick);
      const intervalMs = fastTick ? 1000 : 15000;
      tickTimer = setInterval(() => {
        if (destroyed || doc?.hidden) return;
        renderCard();
        if (popoverOpen) renderPopover();
      }, intervalMs);
    }

    function makeAvatarEl(account, size = 18) {
      const wrap = doc.createElement('span');
      wrap.className = 'ag-qc-avatar';
      wrap.style.width = `${size}px`;
      wrap.style.height = `${size}px`;
      if (account?.avatarUrl) {
        const img = doc.createElement('img');
        img.src = account.avatarUrl;
        img.alt = '';
        img.className = 'ag-qc-avatar-img';
        wrap.appendChild(img);
      } else {
        wrap.textContent = core.getAccountInitials(account);
      }
      const dot = doc.createElement('span');
      dot.className = 'ag-qc-source-dot';
      dot.setAttribute(
        'data-source',
        account?.isActiveLocal ? 'active' : account?.source || 'local'
      );
      wrap.appendChild(dot);
      return wrap;
    }

    function buildQuotaRow(label, bucketState) {
      const row = doc.createElement('div');
      row.className = 'ag-qc-row';
      row.setAttribute('data-tone', bucketState.tone);

      const lbl = doc.createElement('span');
      lbl.className = 'ag-qc-row-label';
      lbl.textContent = label;

      const track = doc.createElement('div');
      track.className = 'ag-qc-track';
      const fill = doc.createElement('div');
      fill.className = 'ag-qc-fill';
      fill.setAttribute('data-tone', bucketState.tone);
      const widthPct = bucketState.available ? Math.max(0, Math.min(100, bucketState.pct)) : 0;
      fill.style.width = `${widthPct}%`;
      track.appendChild(fill);

      const val = doc.createElement('span');
      val.className = 'ag-qc-row-val';
      if (!bucketState.available) {
        val.textContent = '--';
      } else if (bucketState.etaText) {
        val.textContent = `${bucketState.pct}% · ${bucketState.etaText}`;
      } else {
        val.textContent = `${bucketState.pct}%`;
      }

      if (bucketState.available && bucketState.clockText) {
        row.title = bucketState.likelyRecovered
          ? `${label}：预计已于 ${bucketState.clockText} 重置恢复`
          : `${label}：剩余 ${bucketState.pct}% · 重置时间 ${bucketState.clockText}`;
      }

      row.appendChild(lbl);
      row.appendChild(track);
      row.appendChild(val);
      return row;
    }

    function ensureCardMounted() {
      if (!doc || destroyed) return { mounted: false, changed: false };
      const target = findSidebarMountTarget(doc);
      if (!target) return { mounted: false, changed: false };

      let changed = false;
      // Measure sidebar width to adapt cleanly to collapsed narrow sidebar
      const rect = target.container.getBoundingClientRect?.();
      if (rect && rect.width > 0) {
        const nextNarrow = rect.width < 170;
        if (nextNarrow !== narrowMode) {
          narrowMode = nextNarrow;
          changed = true;
        }
      }

      if (!cardEl) {
        cardEl = doc.createElement('section');
        cardEl.className = 'ag-qc-card';
        cardEl.setAttribute('data-testid', 'ag-quota-card');
        cardEl.setAttribute('aria-label', '模型与用量卡片');
        markNoTranslate(cardEl);
        changed = true;
      }

      if (cardEl.parentElement !== target.container) {
        if (target.beforeNode && target.beforeNode.parentElement === target.container) {
          target.container.insertBefore(cardEl, target.beforeNode);
        } else {
          target.container.appendChild(cardEl);
        }
        changed = true;
      }
      return { mounted: true, changed };
    }

    function computeCardRenderKey(now, visibleAccounts, acc, groupKey, gState, otherState) {
      const alt = gState?.isExhausted && acc
        ? core.findBestAlternativeAccount(visibleAccounts, acc.id, groupKey, now)
        : null;
      const eb = gState?.exhaustedBucket;
      return JSON.stringify([
        narrowMode ? 1 : 0,
        overview.collapsed ? 1 : 0,
        loading ? 1 : 0,
        popoverOpen ? 1 : 0,
        visibleAccounts.length,
        acc ? acc.id : '',
        acc ? core.getAccountDisplayName(acc) : '',
        acc?.planBadge || '',
        acc?.isActiveLocal ? 1 : 0,
        acc?.source || '',
        acc?.sourceLabel || '',
        groupKey,
        gState?.pace || 'idle',
        gState?.fiveHour?.pct ?? -1,
        gState?.fiveHour?.etaText || '',
        gState?.fiveHour?.tone || '',
        gState?.weekly?.pct ?? -1,
        gState?.weekly?.etaText || '',
        gState?.weekly?.tone || '',
        otherState?.isExhausted ? 1 : otherState?.pace === 'low' ? 2 : 0,
        eb ? `${eb.key}:${core.formatDetailedCountdown(eb.remainingMs, eb.resetAtMs, now)}` : '',
        alt ? `${alt.account.id}:${alt.minPct}` : '',
        overview.localError || '',
      ]);
    }

    function renderCard(forceRender = false) {
      if (destroyed) return;
      const mountRes = ensureCardMounted();
      if (!mountRes.mounted || !cardEl) return;

      const now = getNowMs();
      const visibleAccounts = getVisibleAccounts();
      const acc = getSelectedAccount();
      const groupKey = overview.selectedGroup === 'claude' ? 'claude' : 'gemini';
      const otherKey = groupKey === 'gemini' ? 'claude' : 'gemini';
      const gState = acc ? core.resolveGroupState(acc.groups?.[groupKey], now, Boolean(acc.isActiveLocal)) : null;
      const otherState = acc ? core.resolveGroupState(acc.groups?.[otherKey], now, Boolean(acc.isActiveLocal)) : null;

      const renderKey = computeCardRenderKey(now, visibleAccounts, acc, groupKey, gState, otherState);
      if (!forceRender && !mountRes.changed && cardEl.childElementCount > 0 && renderKey === lastCardRenderKey) {
        return;
      }
      lastCardRenderKey = renderKey;

      cardEl.setAttribute('data-narrow', narrowMode ? '1' : '0');
      cardEl.setAttribute('data-collapsed', overview.collapsed ? '1' : '0');
      cardEl.setAttribute('data-exhausted', gState?.isExhausted ? '1' : '0');

      cardEl.textContent = '';

      // 1) Ultra-compact rail mode when Antigravity sidebar is collapsed
      if (narrowMode) {
        const railBtn = doc.createElement('button');
        railBtn.type = 'button';
        railBtn.className = 'ag-qc-rail-btn';
        railBtn.title = acc
          ? `${core.getAccountDisplayName(acc)} · ${core.GROUP_LABELS[groupKey]} ${gState?.minPct ?? '--'}%`
          : '模型与用量';
        railBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          togglePopover();
        });
        const dot = doc.createElement('span');
        dot.className = 'ag-qc-pace-dot';
        dot.setAttribute('data-pace', gState?.pace || 'idle');
        const txt = doc.createElement('span');
        txt.className = 'ag-qc-rail-pct';
        txt.textContent = gState?.minPct !== null && gState?.minPct !== undefined ? `${gState.minPct}%` : '--';
        railBtn.appendChild(dot);
        railBtn.appendChild(txt);
        cardEl.appendChild(railBtn);
        return;
      }

      // 2) Slim collapsed 1-line bar mode
      if (overview.collapsed) {
        const slim = doc.createElement('div');
        slim.className = 'ag-qc-slim';

        const left = doc.createElement('button');
        left.type = 'button';
        left.className = 'ag-qc-slim-main';
        left.title = '点击展开模型与用量卡片';
        left.addEventListener('click', toggleCollapsed);

        const dot = doc.createElement('span');
        dot.className = 'ag-qc-pace-dot';
        dot.setAttribute('data-pace', gState?.pace || 'idle');

        const summary = doc.createElement('span');
        summary.className = 'ag-qc-slim-text';
        if (!acc || !gState) {
          summary.textContent = loading ? '正在读取用量…' : '模型与用量';
        } else if (gState.isExhausted && gState.exhaustedBucket) {
          const eta = gState.exhaustedBucket.etaText || '即将恢复';
          summary.textContent = `${core.GROUP_LABELS[groupKey]} 已用尽 · ${eta}`;
        } else {
          const p5 = gState.fiveHour.available ? `${gState.fiveHour.pct}%` : '--';
          const pw = gState.weekly.available ? `${gState.weekly.pct}%` : '--';
          summary.textContent = `${core.GROUP_LABELS[groupKey]} ${p5} · 周 ${pw}`;
        }

        left.appendChild(dot);
        left.appendChild(summary);

        const expandBtn = doc.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'ag-qc-icon-btn';
        expandBtn.title = '展开用量卡片';
        expandBtn.setAttribute('aria-label', '展开用量卡片');
        expandBtn.appendChild(mkSvg(doc, 'chevUp', 12));
        expandBtn.addEventListener('click', toggleCollapsed);

        slim.appendChild(left);
        slim.appendChild(expandBtn);
        cardEl.appendChild(slim);
        return;
      }

      // 3) Full Card: Account Selector Header (dsh-cost-meter inspired)
      const accBar = doc.createElement('div');
      accBar.className = 'ag-qc-acc-bar';

      const accTrigger = doc.createElement('button');
      accTrigger.type = 'button';
      accTrigger.className = 'ag-qc-acc-trigger';
      accTrigger.setAttribute('data-testid', 'ag-qc-account-trigger');
      accTrigger.setAttribute('aria-expanded', popoverOpen ? 'true' : 'false');
      accTrigger.title = acc
        ? `${core.getAccountDisplayName(acc)}${acc.email ? ` (${acc.email})` : ''} · 点击查看/切换多账号`
        : '点击管理多账号';
      accTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover();
      });

      accTrigger.appendChild(makeAvatarEl(acc, 18));

      const accName = doc.createElement('span');
      accName.className = 'ag-qc-acc-name';
      accName.textContent = acc ? core.getAccountDisplayName(acc) : loading ? '读取中…' : '未检测到账号';
      accTrigger.appendChild(accName);

      if (visibleAccounts.length > 1) {
        const idx = Math.max(0, visibleAccounts.findIndex((a) => a.id === acc?.id));
        const countPill = doc.createElement('span');
        countPill.className = 'ag-qc-acc-count';
        countPill.textContent = `${idx + 1}/${visibleAccounts.length}`;
        accTrigger.appendChild(countPill);
      } else if (acc?.planBadge) {
        const planPill = doc.createElement('span');
        planPill.className = 'ag-qc-plan-badge';
        planPill.textContent = acc.planBadge;
        accTrigger.appendChild(planPill);
      }

      const chev = mkSvg(doc, 'chevDown', 11);
      chev.classList?.add('ag-qc-acc-chev');
      accTrigger.appendChild(chev);

      const actions = doc.createElement('div');
      actions.className = 'ag-qc-actions';

      const refreshBtn = doc.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = `ag-qc-icon-btn${loading ? ' is-spinning' : ''}`;
      refreshBtn.title = '立即刷新全部账号额度';
      refreshBtn.setAttribute('aria-label', '刷新额度');
      refreshBtn.setAttribute('data-testid', 'ag-qc-refresh-btn');
      refreshBtn.appendChild(mkSvg(doc, 'refresh', 12));
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void fetchOverview(true);
      });

      const manageBtn = doc.createElement('button');
      manageBtn.type = 'button';
      manageBtn.className = 'ag-qc-icon-btn';
      manageBtn.title = '管理多账号与外部额度池';
      manageBtn.setAttribute('aria-label', '管理账号');
      manageBtn.setAttribute('data-testid', 'ag-qc-manage-btn');
      manageBtn.appendChild(mkSvg(doc, 'users', 12));
      manageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal('accounts');
      });

      const collapseBtn = doc.createElement('button');
      collapseBtn.type = 'button';
      collapseBtn.className = 'ag-qc-icon-btn';
      collapseBtn.title = '收起为单行摘要';
      collapseBtn.setAttribute('aria-label', '收起卡片');
      collapseBtn.appendChild(mkSvg(doc, 'chevDown', 12));
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapsed();
      });

      actions.appendChild(refreshBtn);
      actions.appendChild(manageBtn);
      actions.appendChild(collapseBtn);

      accBar.appendChild(accTrigger);
      accBar.appendChild(actions);
      cardEl.appendChild(accBar);

      const divLine = doc.createElement('div');
      divLine.className = 'ag-qc-divider';
      cardEl.appendChild(divLine);

      // 4) Obsidian Prism Quota Header: [Gemini] [充裕]   [Gemini | Claude]
      const head = doc.createElement('div');
      head.className = 'ag-qc-head';

      const headLeft = doc.createElement('div');
      headLeft.className = 'ag-qc-head-left';

      const title = doc.createElement('span');
      title.className = 'ag-qc-group-title';
      title.textContent = core.GROUP_LABELS[groupKey];

      const pacePill = doc.createElement('span');
      pacePill.className = 'ag-qc-pace';
      pacePill.setAttribute('data-pace', gState?.pace || 'idle');
      pacePill.textContent = gState?.paceLabel || '待命';

      headLeft.appendChild(title);
      headLeft.appendChild(pacePill);

      const seg = doc.createElement('div');
      seg.className = 'ag-qc-seg';
      seg.setAttribute('role', 'tablist');
      seg.setAttribute('aria-label', '模型分组切换');

      for (const k of core.GROUP_KEYS) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = `ag-qc-seg-btn${k === groupKey ? ' is-active' : ''}`;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', k === groupKey ? 'true' : 'false');
        btn.setAttribute('data-group', k);
        btn.textContent = core.GROUP_LABELS[k];

        // Alert dot on inactive tab if that model group is exhausted or low
        if (k !== groupKey && otherState && (otherState.isExhausted || otherState.pace === 'low')) {
          const alertDot = doc.createElement('span');
          alertDot.className = 'ag-qc-seg-dot';
          btn.appendChild(alertDot);
        }

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectGroup(k);
        });
        seg.appendChild(btn);
      }

      head.appendChild(headLeft);
      head.appendChild(seg);
      cardEl.appendChild(head);

      // 5) Obsidian Prism Bars: 5h窗口 & 周额度
      if (!acc) {
        const empty = doc.createElement('div');
        empty.className = 'ag-qc-empty';
        empty.textContent = overview.localError
          ? `等待额度数据（${overview.localError}）`
          : '正在等待 Antigravity 额度快照…';
        cardEl.appendChild(empty);
        return;
      }

      const bars = doc.createElement('div');
      bars.className = 'ag-qc-bars';
      bars.appendChild(buildQuotaRow('5h窗口', gState.fiveHour));
      bars.appendChild(buildQuotaRow('周额度', gState.weekly));
      cardEl.appendChild(bars);

      // 6) Exhausted Recovery Countdown Banner (Core Requirement #2!)
      if (gState.isExhausted && gState.exhaustedBucket) {
        const eb = gState.exhaustedBucket;
        const banner = doc.createElement('div');
        banner.className = 'ag-qc-exhausted';
        banner.setAttribute('data-testid', 'ag-qc-exhausted-banner');

        const line1 = doc.createElement('div');
        line1.className = 'ag-qc-exhausted-main';
        line1.appendChild(mkSvg(doc, 'clock', 12));
        const msg = doc.createElement('span');
        const detail = core.formatDetailedCountdown(eb.remainingMs, eb.resetAtMs, now);
        msg.textContent = `${eb.label}已用尽 · ${detail}`;
        line1.appendChild(msg);
        banner.appendChild(line1);

        // Suggest switching to another account if one has healthy quota!
        const alt = core.findBestAlternativeAccount(visibleAccounts, acc.id, groupKey, now);
        if (alt) {
          const swBtn = doc.createElement('button');
          swBtn.type = 'button';
          swBtn.className = 'ag-qc-alt-btn';
          swBtn.setAttribute('data-testid', 'ag-qc-switch-alt-btn');
          const swTxt = doc.createElement('span');
          swTxt.textContent = `切换可用账号：${alt.displayName} (${alt.minPct}%)`;
          swBtn.appendChild(swTxt);
          swBtn.appendChild(mkSvg(doc, 'arrowRight', 11));
          swBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAccount(alt.account.id);
          });
          banner.appendChild(swBtn);
        }

        cardEl.appendChild(banner);
      }

      // 7) Subtle Standby Account Indicator (when viewing a cached/pool/manual account)
      if (!acc.isActiveLocal) {
        const foot = doc.createElement('div');
        foot.className = 'ag-qc-standby-foot';

        const tag = doc.createElement('span');
        tag.className = 'ag-qc-standby-label';
        tag.textContent =
          acc.source === 'pool'
            ? `来源：${acc.sourceLabel}`
            : acc.source === 'manual'
              ? '手动追踪账号'
              : '历史登录快照';
        foot.appendChild(tag);

        const activeLocal = visibleAccounts.find((a) => a.isActiveLocal);
        if (activeLocal) {
          const backBtn = doc.createElement('button');
          backBtn.type = 'button';
          backBtn.className = 'ag-qc-link-btn';
          backBtn.textContent = '回当前账号';
          backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAccount(activeLocal.id);
          });
          foot.appendChild(backBtn);
        }
        cardEl.appendChild(foot);
      }
    }

    // ── Multi-Account Switcher & Overview Popover ────────────────────────────
    function togglePopover() {
      if (popoverOpen) {
        closePopover();
      } else {
        popoverOpen = true;
        renderPopover();
        renderCard();
      }
    }

    function closePopover() {
      popoverOpen = false;
      lastPopoverRenderKey = '';
      if (popoverEl) {
        popoverEl.remove();
        popoverEl = null;
      }
      if (cardEl) {
        const trig = cardEl.querySelector?.('[data-testid="ag-qc-account-trigger"]');
        trig?.setAttribute?.('aria-expanded', 'false');
      }
    }

    function positionPopover() {
      if (!popoverEl || !cardEl || !win) return;
      const cRect = cardEl.getBoundingClientRect();
      const vw = win.innerWidth || 1280;
      const vh = win.innerHeight || 800;
      const popW = Math.min(316, vw - 24);
      popoverEl.style.width = `${popW}px`;

      // Place cleanly to the right of the left sidebar card, aligned near the bottom
      let left = cRect.right + 8;
      if (left + popW > vw - 12) {
        left = Math.max(12, cRect.left);
      }
      const pRect = popoverEl.getBoundingClientRect();
      const popH = pRect.height || 280;
      let top = cRect.bottom - popH;
      if (top < 12) top = 12;
      if (top + popH > vh - 12) top = Math.max(12, vh - popH - 12);

      popoverEl.style.left = `${Math.round(left)}px`;
      popoverEl.style.top = `${Math.round(top)}px`;
    }

    function formatMiniSummary(groupState, label) {
      if (!groupState || (!groupState.fiveHour.available && !groupState.weekly.available)) {
        return { text: `${label} --`, tone: 'muted' };
      }
      if (groupState.isExhausted && groupState.exhaustedBucket) {
        const eta = groupState.exhaustedBucket.etaText || '恢复中';
        return { text: `${label} 0%·${eta}`, tone: 'exhausted' };
      }
      const p5 = groupState.fiveHour.available ? `${groupState.fiveHour.pct}%` : '--';
      const pw = groupState.weekly.available ? `${groupState.weekly.pct}%` : '--';
      return { text: `${label} ${p5}/${pw}`, tone: groupState.pace };
    }

    function renderPopover(forceRender = false) {
      if (destroyed || !doc || !popoverOpen) return;
      const now = getNowMs();
      const visibleAccounts = getVisibleAccounts();
      const selected = getSelectedAccount();

      const popKey = JSON.stringify([
        loading ? 1 : 0,
        selected?.id || '',
        visibleAccounts.map((a) => {
          const g = core.resolveGroupState(a.groups?.gemini, now, Boolean(a.isActiveLocal));
          const c = core.resolveGroupState(a.groups?.claude, now, Boolean(a.isActiveLocal));
          return [
            a.id,
            core.getAccountDisplayName(a),
            a.isActiveLocal ? 1 : 0,
            formatMiniSummary(g, 'G').text,
            formatMiniSummary(c, 'C').text,
          ];
        }),
      ]);

      if (!forceRender && popoverEl && popoverEl.isConnected && popKey === lastPopoverRenderKey) {
        return;
      }
      lastPopoverRenderKey = popKey;

      if (!popoverEl) {
        popoverEl = doc.createElement('div');
        popoverEl.className = 'ag-qc-popover';
        popoverEl.setAttribute('data-testid', 'ag-qc-account-popover');
        popoverEl.setAttribute('role', 'dialog');
        popoverEl.setAttribute('aria-label', '多账号用量总览与切换');
        markNoTranslate(popoverEl);
        doc.body.appendChild(popoverEl);
      }

      popoverEl.textContent = '';

      const pHead = doc.createElement('div');
      pHead.className = 'ag-qc-pop-head';

      const pTitle = doc.createElement('span');
      pTitle.className = 'ag-qc-pop-title';
      pTitle.textContent = `多账号用量总览 (${visibleAccounts.length})`;

      const pBtns = doc.createElement('div');
      pBtns.className = 'ag-qc-pop-btns';

      const refBtn = doc.createElement('button');
      refBtn.type = 'button';
      refBtn.className = `ag-qc-pop-action${loading ? ' is-spinning' : ''}`;
      refBtn.title = '刷新全部账号';
      refBtn.appendChild(mkSvg(doc, 'refresh', 12));
      refBtn.addEventListener('click', () => void fetchOverview(true));

      const addBtn = doc.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'ag-qc-pop-action';
      addBtn.title = '添加外部账号池或手动账号';
      addBtn.appendChild(mkSvg(doc, 'plus', 12));
      const addLbl = doc.createElement('span');
      addLbl.textContent = '管理';
      addBtn.appendChild(addLbl);
      addBtn.addEventListener('click', () => {
        closePopover();
        openModal('accounts');
      });

      pBtns.appendChild(refBtn);
      pBtns.appendChild(addBtn);
      pHead.appendChild(pTitle);
      pHead.appendChild(pBtns);
      popoverEl.appendChild(pHead);

      const listEl = doc.createElement('div');
      listEl.className = 'ag-qc-pop-list';

      if (!visibleAccounts.length) {
        const empty = doc.createElement('div');
        empty.className = 'ag-qc-pop-empty';
        empty.textContent = '暂无可用账号，可点击右上角「管理」接入外部账号池或手动添加。';
        listEl.appendChild(empty);
      } else {
        for (const acc of visibleAccounts) {
          const isSel = selected && selected.id === acc.id;
          const item = doc.createElement('button');
          item.type = 'button';
          item.className = `ag-qc-pop-item${isSel ? ' is-selected' : ''}`;
          item.setAttribute('data-account-id', acc.id);
          item.addEventListener('click', () => selectAccount(acc.id));

          const top = doc.createElement('div');
          top.className = 'ag-qc-pop-item-top';

          const info = doc.createElement('div');
          info.className = 'ag-qc-pop-item-info';
          info.appendChild(makeAvatarEl(acc, 20));

          const textWrap = doc.createElement('div');
          textWrap.className = 'ag-qc-pop-item-text';

          const nameRow = doc.createElement('div');
          nameRow.className = 'ag-qc-pop-name-row';
          const nSpan = doc.createElement('span');
          nSpan.className = 'ag-qc-pop-name';
          nSpan.textContent = core.getAccountDisplayName(acc);
          nameRow.appendChild(nSpan);

          const srcBadge = doc.createElement('span');
          srcBadge.className = 'ag-qc-src-tag';
          srcBadge.setAttribute('data-kind', acc.isActiveLocal ? 'active' : acc.source);
          srcBadge.textContent = acc.isActiveLocal
            ? '当前'
            : acc.source === 'pool'
              ? acc.sourceLabel
              : acc.source === 'manual'
                ? '手动'
                : '历史';
          nameRow.appendChild(srcBadge);

          const sub = doc.createElement('div');
          sub.className = 'ag-qc-pop-sub';
          sub.textContent = [acc.email, acc.planBadge].filter(Boolean).join(' · ') || acc.sourceLabel;

          textWrap.appendChild(nameRow);
          textWrap.appendChild(sub);
          info.appendChild(textWrap);
          top.appendChild(info);

          if (isSel) {
            const chk = doc.createElement('span');
            chk.className = 'ag-qc-pop-check';
            chk.appendChild(mkSvg(doc, 'check', 13));
            top.appendChild(chk);
          }

          item.appendChild(top);

          // Mini dual-group quota chips (Gemini + Claude)
          const gGem = core.resolveGroupState(acc.groups?.gemini, now, Boolean(acc.isActiveLocal));
          const gCla = core.resolveGroupState(acc.groups?.claude, now, Boolean(acc.isActiveLocal));
          const chips = doc.createElement('div');
          chips.className = 'ag-qc-pop-chips';

          for (const [st, lbl] of [
            [gGem, 'Gemini'],
            [gCla, 'Claude'],
          ]) {
            const m = formatMiniSummary(st, lbl);
            const chip = doc.createElement('span');
            chip.className = 'ag-qc-mini-chip';
            chip.setAttribute('data-tone', m.tone);
            chip.textContent = m.text;
            chips.appendChild(chip);
          }
          item.appendChild(chips);
          listEl.appendChild(item);
        }
      }
      popoverEl.appendChild(listEl);

      // Footer shortcut to Antigravity native Settings (to switch real Google sign-in)
      const pFoot = doc.createElement('div');
      pFoot.className = 'ag-qc-pop-foot';
      const settingsLink = doc.createElement('button');
      settingsLink.type = 'button';
      settingsLink.className = 'ag-qc-pop-foot-btn';
      settingsLink.appendChild(mkSvg(doc, 'settings', 12));
      const sSpan = doc.createElement('span');
      sSpan.textContent = '打开 Antigravity 账号与配额设置';
      settingsLink.appendChild(sSpan);
      settingsLink.addEventListener('click', openNativeSettings);
      pFoot.appendChild(settingsLink);
      popoverEl.appendChild(pFoot);

      positionPopover();
    }

    // ── Multi-Account & External Pool Manager Modal ──────────────────────────
    function openModal(tab = 'accounts') {
      closePopover();
      modalOpen = true;
      modalTab = tab;
      modalMessage = '';
      modalError = '';
      renderModal();
    }

    function closeModal() {
      modalOpen = false;
      editingAliasId = '';
      if (modalBackdropEl) {
        modalBackdropEl.remove();
        modalBackdropEl = null;
      }
    }

    async function handleSaveAlias(accountId, alias) {
      const res = await callRpc('qc-update-account', { accountId, alias });
      if (res?.ok) {
        editingAliasId = '';
        modalMessage = '账号别名已更新';
        modalError = '';
        await fetchOverview(false);
      } else {
        modalError = `更新失败: ${res?.error || '未知错误'}`;
        renderModal();
      }
    }

    async function handleRemoveAccount(accountId) {
      const res = await callRpc('qc-remove-account', { accountId });
      if (res?.ok) {
        modalMessage = '已移除该账号记录';
        modalError = '';
        await fetchOverview(false);
      } else {
        modalError =
          res?.error === 'CANNOT_REMOVE_ACTIVE_LOCAL'
            ? '当前登录的本机账号不可删除'
            : `删除失败: ${res?.error || '未知错误'}`;
        renderModal();
      }
    }

    async function handleAddManualAccount() {
      const res = await callRpc('qc-upsert-manual-account', manualForm);
      if (res?.ok) {
        showManualForm = false;
        manualForm = {
          name: '',
          email: '',
          planName: 'Google AI Pro',
          gemini5hPct: '100',
          gemini5hReset: '',
          geminiWeeklyPct: '100',
          geminiWeeklyReset: '',
          claude5hPct: '100',
          claude5hReset: '',
          claudeWeeklyPct: '100',
          claudeWeeklyReset: '',
        };
        modalMessage = '已添加追踪账号';
        modalError = '';
        await fetchOverview(false);
      } else {
        modalError = res?.error === 'NAME_REQUIRED' ? '请填写账号名称' : `保存失败: ${res?.error || '未知错误'}`;
        renderModal();
      }
    }

    async function handleTestPool() {
      testingPool = true;
      modalError = '';
      modalMessage = '';
      renderModal();
      const res = await callRpc('qc-test-pool', poolForm);
      testingPool = false;
      if (res?.ok) {
        modalMessage = `连接成功，读取到 ${res.accountCount || 0} 个账号`;
      } else {
        modalError = res?.error || '连接失败，请检查地址与鉴权配置';
      }
      renderModal();
    }

    async function handleSavePool() {
      const res = await callRpc('qc-upsert-pool', poolForm);
      if (res?.ok) {
        poolForm.authToken = '';
        modalMessage = '已保存外部账号池并开始同步';
        modalError = '';
        await fetchOverview(true);
      } else {
        modalError = res?.error === 'INVALID_POOL_URL' ? '请输入有效的 http:// 或 https:// 地址' : `保存失败: ${res?.error || '未知错误'}`;
        renderModal();
      }
    }

    async function handleRemovePool(poolId) {
      const res = await callRpc('qc-remove-pool', { poolId });
      if (res?.ok) {
        modalMessage = '已移除该外部账号池';
        modalError = '';
        await fetchOverview(false);
      }
    }

    function renderModal() {
      if (destroyed || !doc || !modalOpen) return;
      if (!modalBackdropEl) {
        modalBackdropEl = doc.createElement('div');
        modalBackdropEl.className = 'ag-qc-modal-backdrop';
        modalBackdropEl.setAttribute('data-testid', 'ag-qc-manager-modal');
        markNoTranslate(modalBackdropEl);
        modalBackdropEl.addEventListener('click', (e) => {
          if (e.target === modalBackdropEl) closeModal();
        });
        doc.body.appendChild(modalBackdropEl);
      }

      modalBackdropEl.textContent = '';

      const dlg = doc.createElement('div');
      dlg.className = 'ag-qc-modal';
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-label', '多账号与额度池管理');

      // Header
      const mHead = doc.createElement('div');
      mHead.className = 'ag-qc-modal-head';
      const mTitle = doc.createElement('div');
      mTitle.className = 'ag-qc-modal-title';
      mTitle.textContent = '模型与用量 · 多账号管理';
      const closeBtn = doc.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ag-qc-icon-btn';
      closeBtn.setAttribute('aria-label', '关闭');
      closeBtn.appendChild(mkSvg(doc, 'close', 14));
      closeBtn.addEventListener('click', closeModal);
      mHead.appendChild(mTitle);
      mHead.appendChild(closeBtn);
      dlg.appendChild(mHead);

      // Tabs
      const tabs = doc.createElement('div');
      tabs.className = 'ag-qc-modal-tabs';
      for (const [k, label] of [
        ['accounts', `账号列表 (${(overview.accounts || []).length})`],
        ['pools', `外部账号池 (${(overview.pools || []).length})`],
      ]) {
        const tb = doc.createElement('button');
        tb.type = 'button';
        tb.className = `ag-qc-modal-tab${modalTab === k ? ' is-active' : ''}`;
        tb.textContent = label;
        tb.addEventListener('click', () => {
          modalTab = k;
          modalMessage = '';
          modalError = '';
          renderModal();
        });
        tabs.appendChild(tb);
      }
      dlg.appendChild(tabs);

      // Body
      const body = doc.createElement('div');
      body.className = 'ag-qc-modal-body';

      if (modalMessage) {
        const okBan = doc.createElement('div');
        okBan.className = 'ag-qc-banner ag-qc-banner-ok';
        okBan.textContent = modalMessage;
        body.appendChild(okBan);
      }
      if (modalError) {
        const errBan = doc.createElement('div');
        errBan.className = 'ag-qc-banner ag-qc-banner-err';
        errBan.textContent = modalError;
        body.appendChild(errBan);
      }

      if (modalTab === 'accounts') {
        const hint = doc.createElement('div');
        hint.className = 'ag-qc-modal-hint';
        hint.textContent =
          '本机在 Antigravity 切换登录不同 Google 账号时会自动记录各账号额度与恢复倒计时；您也可手动添加备用账号或为账号设置别名。';
        body.appendChild(hint);

        const list = doc.createElement('div');
        list.className = 'ag-qc-mgr-list';
        for (const acc of overview.accounts || []) {
          const row = doc.createElement('div');
          row.className = 'ag-qc-mgr-row';

          const left = doc.createElement('div');
          left.className = 'ag-qc-mgr-left';
          left.appendChild(makeAvatarEl(acc, 22));

          const meta = doc.createElement('div');
          meta.className = 'ag-qc-mgr-meta';
          if (editingAliasId === acc.id) {
            const editRow = doc.createElement('div');
            editRow.className = 'ag-qc-inline-edit';
            const inp = doc.createElement('input');
            inp.type = 'text';
            inp.className = 'ag-qc-input';
            inp.placeholder = '输入账号别名';
            inp.value = editingAliasDraft;
            inp.addEventListener('input', (e) => {
              editingAliasDraft = e.target.value;
            });
            inp.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') void handleSaveAlias(acc.id, editingAliasDraft);
              if (e.key === 'Escape') {
                editingAliasId = '';
                renderModal();
              }
            });
            const sv = doc.createElement('button');
            sv.type = 'button';
            sv.className = 'ag-qc-btn-primary ag-qc-btn-xs';
            sv.textContent = '保存';
            sv.addEventListener('click', () => void handleSaveAlias(acc.id, editingAliasDraft));
            editRow.appendChild(inp);
            editRow.appendChild(sv);
            meta.appendChild(editRow);
          } else {
            const tLine = doc.createElement('div');
            tLine.className = 'ag-qc-mgr-name';
            tLine.textContent = core.getAccountDisplayName(acc);
            const tag = doc.createElement('span');
            tag.className = 'ag-qc-src-tag';
            tag.setAttribute('data-kind', acc.isActiveLocal ? 'active' : acc.source);
            tag.textContent = acc.isActiveLocal ? '当前登录' : acc.sourceLabel;
            tLine.appendChild(tag);
            meta.appendChild(tLine);
          }
          const subLine = doc.createElement('div');
          subLine.className = 'ag-qc-mgr-sub';
          subLine.textContent = [acc.email, acc.planName].filter(Boolean).join(' · ') || acc.id;
          meta.appendChild(subLine);

          left.appendChild(meta);
          row.appendChild(left);

          const right = doc.createElement('div');
          right.className = 'ag-qc-mgr-actions';

          const aliasBtn = doc.createElement('button');
          aliasBtn.type = 'button';
          aliasBtn.className = 'ag-qc-btn-ghost ag-qc-btn-xs';
          aliasBtn.textContent = '别名';
          aliasBtn.addEventListener('click', () => {
            editingAliasId = acc.id;
            editingAliasDraft = acc.alias || '';
            renderModal();
          });
          right.appendChild(aliasBtn);

          if (!acc.isActiveLocal && acc.source !== 'pool') {
            const delBtn = doc.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'ag-qc-btn-ghost ag-qc-btn-xs is-danger';
            delBtn.title = '移除记录';
            delBtn.appendChild(mkSvg(doc, 'trash', 12));
            delBtn.addEventListener('click', () => void handleRemoveAccount(acc.id));
            right.appendChild(delBtn);
          }

          row.appendChild(right);
          list.appendChild(row);
        }
        body.appendChild(list);

        // Collapsible manual account form
        const addToggle = doc.createElement('button');
        addToggle.type = 'button';
        addToggle.className = 'ag-qc-btn-secondary';
        addToggle.textContent = showManualForm ? '收起手动添加表单' : '+ 手动添加追踪账号';
        addToggle.addEventListener('click', () => {
          showManualForm = !showManualForm;
          renderModal();
        });
        body.appendChild(addToggle);

        if (showManualForm) {
          const form = doc.createElement('div');
          form.className = 'ag-qc-form-box';
          const mkField = (label, key, placeholder = '', type = 'text') => {
            const f = doc.createElement('label');
            f.className = 'ag-qc-field';
            const sp = doc.createElement('span');
            sp.textContent = label;
            const inp = doc.createElement('input');
            inp.type = type;
            inp.className = 'ag-qc-input';
            inp.placeholder = placeholder;
            inp.value = manualForm[key] || '';
            inp.addEventListener('input', (e) => {
              manualForm[key] = e.target.value;
            });
            f.appendChild(sp);
            f.appendChild(inp);
            return f;
          };

          const grid2 = doc.createElement('div');
          grid2.className = 'ag-qc-form-grid';
          grid2.appendChild(mkField('账号名称 *', 'name', '例如：备用号 B'));
          grid2.appendChild(mkField('邮箱（可选）', 'email', 'user@gmail.com'));
          grid2.appendChild(mkField('Gemini 5h 剩余 %', 'gemini5hPct', '0 - 100'));
          grid2.appendChild(mkField('Gemini 5h 恢复时间', 'gemini5hReset', 'ISO 或留空', 'datetime-local'));
          grid2.appendChild(mkField('Gemini 周额度剩余 %', 'geminiWeeklyPct', '0 - 100'));
          grid2.appendChild(mkField('Claude 5h 剩余 %', 'claude5hPct', '0 - 100'));
          form.appendChild(grid2);

          const submitBtn = doc.createElement('button');
          submitBtn.type = 'button';
          submitBtn.className = 'ag-qc-btn-primary';
          submitBtn.textContent = '添加并显示在切换列表';
          submitBtn.addEventListener('click', () => void handleAddManualAccount());
          form.appendChild(submitBtn);
          body.appendChild(form);
        }
      } else {
        // Pools tab
        const hint = doc.createElement('div');
        hint.className = 'ag-qc-modal-hint';
        hint.textContent =
          '支持对接 Antigravity-Manager、DSH AGY-Link、CLIProxyAPI 或任意兼容 JSON 额度接口。鉴权 Token 仅加密/受限存储于本机插件配置，不回显明文。';
        body.appendChild(hint);

        if ((overview.pools || []).length) {
          const pList = doc.createElement('div');
          pList.className = 'ag-qc-mgr-list';
          for (const p of overview.pools) {
            const row = doc.createElement('div');
            row.className = 'ag-qc-mgr-row';
            const left = doc.createElement('div');
            left.className = 'ag-qc-mgr-meta';
            const name = doc.createElement('div');
            name.className = 'ag-qc-mgr-name';
            name.textContent = p.label;
            const st = doc.createElement('span');
            st.className = 'ag-qc-src-tag';
            st.setAttribute('data-kind', p.lastStatus === 'ok' ? 'active' : p.lastStatus === 'error' ? 'error' : 'pool');
            st.textContent =
              p.lastStatus === 'ok'
                ? `正常 · ${p.accountCount} 账号`
                : p.lastStatus === 'error'
                  ? '拉取异常'
                  : '待同步';
            name.appendChild(st);
            const sub = doc.createElement('div');
            sub.className = 'ag-qc-mgr-sub';
            sub.textContent = p.lastError ? `${p.url} · ${p.lastError}` : `${p.url}${p.hasAuthToken ? ' · 已配置 Token' : ''}`;
            left.appendChild(name);
            left.appendChild(sub);

            const delBtn = doc.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'ag-qc-btn-ghost ag-qc-btn-xs is-danger';
            delBtn.appendChild(mkSvg(doc, 'trash', 12));
            delBtn.addEventListener('click', () => void handleRemovePool(p.id));

            row.appendChild(left);
            row.appendChild(delBtn);
            pList.appendChild(row);
          }
          body.appendChild(pList);
        }

        // Preset buttons
        const presetRow = doc.createElement('div');
        presetRow.className = 'ag-qc-presets';
        for (const preset of POOL_PRESETS) {
          const pb = doc.createElement('button');
          pb.type = 'button';
          pb.className = `ag-qc-preset-chip${poolForm.type === preset.type ? ' is-active' : ''}`;
          pb.textContent = preset.label;
          pb.addEventListener('click', () => {
            poolForm.type = preset.type;
            poolForm.label = preset.label;
            poolForm.url = preset.url;
            poolForm.authHeader = preset.authHeader;
            renderModal();
          });
          presetRow.appendChild(pb);
        }
        body.appendChild(presetRow);

        const form = doc.createElement('div');
        form.className = 'ag-qc-form-box';
        const mkPoolField = (label, key, placeholder = '', type = 'text') => {
          const f = doc.createElement('label');
          f.className = 'ag-qc-field';
          const sp = doc.createElement('span');
          sp.textContent = label;
          const inp = doc.createElement('input');
          inp.type = type;
          inp.className = 'ag-qc-input';
          inp.placeholder = placeholder;
          inp.value = poolForm[key] || '';
          inp.addEventListener('input', (e) => {
            poolForm[key] = e.target.value;
          });
          f.appendChild(sp);
          f.appendChild(inp);
          return f;
        };
        form.appendChild(mkPoolField('来源名称', 'label', '例如：本地多账号池'));
        form.appendChild(mkPoolField('接口地址 (URL)', 'url', 'http://127.0.0.1:8045/api/accounts'));
        const row2 = doc.createElement('div');
        row2.className = 'ag-qc-form-grid';
        row2.appendChild(mkPoolField('鉴权请求头（可选）', 'authHeader', 'Authorization'));
        row2.appendChild(mkPoolField('鉴权 Token（可选）', 'authToken', '留空表示免鉴权', 'password'));
        form.appendChild(row2);

        const btnBar = doc.createElement('div');
        btnBar.className = 'ag-qc-form-actions';
        const testBtn = doc.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'ag-qc-btn-secondary';
        testBtn.disabled = testingPool;
        testBtn.textContent = testingPool ? '测试中…' : '测试连接';
        testBtn.addEventListener('click', () => void handleTestPool());

        const saveBtn = doc.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'ag-qc-btn-primary';
        saveBtn.textContent = '保存并同步';
        saveBtn.addEventListener('click', () => void handleSavePool());

        btnBar.appendChild(testBtn);
        btnBar.appendChild(saveBtn);
        form.appendChild(btnBar);
        body.appendChild(form);
      }

      dlg.appendChild(body);
      modalBackdropEl.appendChild(dlg);
    }

    // ── Global Events (outside-click, Escape, resize) ────────────────────────
    function onDocPointerDown(e) {
      if (destroyed) return;
      if (popoverOpen && popoverEl && !popoverEl.contains(e.target) && !cardEl?.contains(e.target)) {
        closePopover();
      }
    }

    function onKeyDown(e) {
      if (destroyed || e.key !== 'Escape') return;
      if (modalOpen) {
        closeModal();
        e.stopPropagation();
      } else if (popoverOpen) {
        closePopover();
        e.stopPropagation();
      }
    }

    function onResize() {
      if (destroyed) return;
      const mountRes = ensureCardMounted();
      if (mountRes.mounted && mountRes.changed) renderCard(true);
      if (popoverOpen) positionPopover();
    }

    doc?.addEventListener?.('pointerdown', onDocPointerDown, true);
    win?.addEventListener?.('keydown', onKeyDown, true);
    win?.addEventListener?.('resize', onResize, false);

    function sync() {
      if (destroyed) return;
      const mountRes = ensureCardMounted();
      if (mountRes.mounted && (mountRes.changed || !cardEl?.childElementCount)) {
        renderCard(true);
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = 0;
      }
      closePopover();
      closeModal();
      doc?.removeEventListener?.('pointerdown', onDocPointerDown, true);
      win?.removeEventListener?.('keydown', onKeyDown, true);
      win?.removeEventListener?.('resize', onResize, false);
      cardEl?.remove();
      cardEl = null;
    }

    // Initial mount & data load
    sync();
    void fetchOverview(false);

    return {
      sync,
      refresh: (force = true) => fetchOverview(force),
      selectAccount,
      selectGroup,
      openModal,
      closeModal,
      destroy,
      getDebugState: () => ({
        mounted: Boolean(cardEl && cardEl.isConnected),
        narrowMode,
        collapsed: overview.collapsed,
        selectedAccountId: overview.selectedAccountId,
        selectedGroup: overview.selectedGroup,
        accountCount: (overview.accounts || []).length,
        popoverOpen,
        modalOpen,
      }),
    };
  }

  return {
    createQuotaCardController,
    findSidebarMountTarget,
  };
});
