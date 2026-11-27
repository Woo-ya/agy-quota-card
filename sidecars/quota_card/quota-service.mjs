// AGY Quota Card — Multi-Account Quota & External Pool Service (quota-service.mjs)
// - Reads live quota & user identity from Antigravity's local Language Server
//   (RetrieveUserQuotaSummary + GetUserStatus)
// - Auto-persists every signed-in local Antigravity account so switching accounts
//   builds a unified multi-account tracker with live recovery countdowns
// - Supports external multi-account pools (Antigravity-Manager, dsh-agy-link,
//   CLIProxyAPI, Custom JSON) and manual tracked accounts
// - Credential isolation: pool auth tokens are stored only on disk (0600 on POSIX),
//   never returned in cleartext to renderer UI, and never written to logs.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../src/core/quota-card-core.js');

const DEFAULT_LS_CACHE_MS = 12000;
const DEFAULT_POOL_CACHE_MS = 30000;
const MAX_LOCAL_HISTORY = 24;
const MAX_POOL_SOURCES = 8;
const MAX_MANUAL_ACCOUNTS = 16;

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isAllowedPoolUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizePoolForUi(pool) {
  return {
    id: pool.id,
    type: pool.type,
    label: pool.label,
    url: pool.url,
    authHeader: pool.authHeader || 'Authorization',
    hasAuthToken: Boolean(pool.authToken),
    enabled: pool.enabled !== false,
    lastStatus: pool.lastStatus || 'idle',
    lastError: pool.lastError || '',
    lastFetchedAt: pool.lastFetchedAt || 0,
    accountCount: pool.accountCount || 0,
  };
}

export function createQuotaService({
  storePath,
  fetchImpl = globalThis.fetch,
  env = process.env,
  nowFn = () => Date.now(),
} = {}) {
  const defaultState = {
    version: 1,
    selectedAccountId: '',
    selectedGroup: 'gemini',
    collapsed: false,
    localAccounts: [], // Persisted local Antigravity accounts
    manualAccounts: [], // User-added snapshot/standby accounts
    poolSources: [], // External pool endpoints { id, type, label, url, authHeader, authToken, enabled }
    overrides: {}, // { [accountId]: { alias, hidden } }
  };

  let state = loadState();
  let lastLocalFetchAt = 0;
  let lastLiveLocal = null;
  let lastLocalError = '';
  const poolCache = new Map(); // poolId -> { fetchedAt, accounts, status, error }

  function prunePhantomLocalAccounts(list, currentSelectedId = '') {
    const arr = Array.isArray(list) ? list : [];
    const hasIdentified = arr.some((a) => a && a.id && a.id !== 'local:default' && (a.email || a.hasIdentity));
    const seen = new Set();
    const cleaned = [];
    for (const acc of arr) {
      if (!acc || !acc.id) continue;
      // Drop anonymous local:default phantom once any identified local account exists
      if (hasIdentified && acc.id === 'local:default' && !acc.email) {
        continue;
      }
      if (seen.has(acc.id)) continue;
      seen.add(acc.id);
      cleaned.push(acc);
    }
    let nextSelected = currentSelectedId;
    if (hasIdentified && nextSelected === 'local:default') {
      nextSelected = cleaned[0]?.id || '';
    }
    return { cleaned, nextSelected, changed: cleaned.length !== arr.length || nextSelected !== currentSelectedId };
  }

  function loadState() {
    if (!storePath) return structuredClone(defaultState);
    const loaded = safeReadJson(storePath, null);
    if (!loaded) return structuredClone(defaultState);
    const rawLocal = Array.isArray(loaded.localAccounts) ? loaded.localAccounts.slice(0, MAX_LOCAL_HISTORY) : [];
    const rawSel = typeof loaded.selectedAccountId === 'string' ? loaded.selectedAccountId : '';
    const { cleaned, nextSelected, changed } = prunePhantomLocalAccounts(rawLocal, rawSel);
    const nextState = {
      version: 1,
      selectedAccountId: nextSelected,
      selectedGroup: loaded.selectedGroup === 'claude' ? 'claude' : 'gemini',
      collapsed: Boolean(loaded.collapsed),
      localAccounts: cleaned,
      manualAccounts: Array.isArray(loaded.manualAccounts) ? loaded.manualAccounts.slice(0, MAX_MANUAL_ACCOUNTS) : [],
      poolSources: Array.isArray(loaded.poolSources) ? loaded.poolSources.slice(0, MAX_POOL_SOURCES) : [],
      overrides: loaded.overrides && typeof loaded.overrides === 'object' ? loaded.overrides : {},
    };
    if (changed) {
      try {
        atomicWriteJson(storePath, nextState);
      } catch {}
    }
    return nextState;
  }

  function saveState() {
    if (!storePath) return;
    try {
      atomicWriteJson(storePath, state);
    } catch {}
  }

  async function callLsRpc(method) {
    const lsAddr = env.ANTIGRAVITY_LS_ADDRESS || 'localhost:5387';
    const csrf = env.ANTIGRAVITY_CSRF_TOKEN || '';
    if (!csrf) {
      throw new Error('LS_CSRF_MISSING');
    }
    const res = await fetchImpl(
      `http://${lsAddr}/exa.language_server_pb.LanguageServerService/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrf,
        },
        body: '{}',
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) {
      throw new Error(`LS_HTTP_${res.status}`);
    }
    return res.json();
  }

  async function refreshLocalAccount(force = false) {
    const now = nowFn();
    if (!force && lastLiveLocal && now - lastLocalFetchAt < DEFAULT_LS_CACHE_MS) {
      return lastLiveLocal;
    }

    try {
      const [quotaRes, userRes] = await Promise.all([
        callLsRpc('RetrieveUserQuotaSummary').catch(() => null),
        callLsRpc('GetUserStatus').catch(() => null),
      ]);

      const parsed = core.parseNativeLsSnapshot(quotaRes, userRes, now);
      if (parsed) {
        lastLiveLocal = parsed;
        lastLocalFetchAt = now;
        lastLocalError = '';

        // Never persist anonymous fallback (`local:default` without email/name) into localAccounts,
        // because GetUserStatus may temporarily lag behind RetrieveUserQuotaSummary on startup/switch.
        if (parsed.hasIdentity !== false && parsed.id !== 'local:default') {
          const idx = state.localAccounts.findIndex((a) => a.id === parsed.id);
          const existing = idx >= 0 ? state.localAccounts[idx] : null;
          const mergedRecord = {
            ...(existing || {}),
            ...parsed,
            alias: existing?.alias || '',
            isActiveLocal: true,
          };
          if (idx >= 0) {
            state.localAccounts[idx] = mergedRecord;
          } else {
            state.localAccounts.unshift(mergedRecord);
            if (state.localAccounts.length > MAX_LOCAL_HISTORY) {
              state.localAccounts = state.localAccounts.slice(0, MAX_LOCAL_HISTORY);
            }
          }
          const pruned = prunePhantomLocalAccounts(state.localAccounts, state.selectedAccountId);
          state.localAccounts = pruned.cleaned;
          state.selectedAccountId = pruned.nextSelected;
          saveState();
          return mergedRecord;
        }
        return parsed;
      }

      lastLocalError = '未读取到 Antigravity 额度响应';
      return lastLiveLocal;
    } catch (err) {
      lastLocalError = String(err?.message || err);
      return lastLiveLocal;
    }
  }

  async function refreshPoolSource(pool, force = false) {
    const now = nowFn();
    const cached = poolCache.get(pool.id);
    if (!force && cached && now - cached.fetchedAt < DEFAULT_POOL_CACHE_MS) {
      return cached;
    }
    if (!isAllowedPoolUrl(pool.url)) {
      const bad = { fetchedAt: now, accounts: [], status: 'error', error: '无效的端点 URL（仅支持 http/https）' };
      poolCache.set(pool.id, bad);
      return bad;
    }

    try {
      const headers = { Accept: 'application/json' };
      if (pool.authToken) {
        const hdrName = String(pool.authHeader || 'Authorization').trim() || 'Authorization';
        headers[hdrName] =
          hdrName.toLowerCase() === 'authorization' && !/^(?:Bearer|Basic|Token)\s+/i.test(pool.authToken)
            ? `Bearer ${pool.authToken}`
            : pool.authToken;
      }
      const res = await fetchImpl(pool.url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json();
      const accounts = core.parseExternalPoolPayload(pool, payload, now);
      const entry = {
        fetchedAt: now,
        accounts,
        status: accounts.length ? 'ok' : 'empty',
        error: accounts.length ? '' : '接口已响应但未包含账号数据',
      };
      poolCache.set(pool.id, entry);
      return entry;
    } catch (err) {
      const prevAccounts = cached?.accounts || [];
      const entry = {
        fetchedAt: now,
        accounts: prevAccounts.map((a) => ({ ...a, status: 'stale' })),
        status: 'error',
        error: `拉取失败: ${String(err?.message || err)}`,
      };
      poolCache.set(pool.id, entry);
      return entry;
    }
  }

  async function getOverview({ force = false } = {}) {
    const now = nowFn();
    const liveLocal = await refreshLocalAccount(force);

    const enabledPools = state.poolSources.filter((p) => p.enabled !== false);
    const poolResults = await Promise.all(enabledPools.map((p) => refreshPoolSource(p, force)));

    const poolAccounts = [];
    for (let i = 0; i < enabledPools.length; i++) {
      const p = enabledPools[i];
      const r = poolResults[i];
      p.lastStatus = r.status;
      p.lastError = r.error;
      p.lastFetchedAt = r.fetchedAt;
      p.accountCount = r.accounts.length;
      poolAccounts.push(...r.accounts);
    }

    const accounts = core.mergeAccountRegistry({
      liveLocal,
      storedLocal: state.localAccounts,
      poolAccounts,
      manualAccounts: state.manualAccounts,
      overrides: state.overrides,
    });

    const selected = core.resolveSelectedAccount(accounts, state.selectedAccountId);
    const effectiveSelectedId = selected ? selected.id : '';

    return {
      ok: true,
      nowMs: now,
      selectedAccountId: effectiveSelectedId,
      selectedGroup: state.selectedGroup,
      collapsed: state.collapsed,
      localError: lastLocalError,
      accounts,
      pools: state.poolSources.map(sanitizePoolForUi),
    };
  }

  function setUiPrefs(patch = {}) {
    if (typeof patch.selectedAccountId === 'string') {
      state.selectedAccountId = patch.selectedAccountId;
    }
    if (patch.selectedGroup === 'gemini' || patch.selectedGroup === 'claude') {
      state.selectedGroup = patch.selectedGroup;
    }
    if (typeof patch.collapsed === 'boolean') {
      state.collapsed = patch.collapsed;
    }
    saveState();
    return {
      ok: true,
      selectedAccountId: state.selectedAccountId,
      selectedGroup: state.selectedGroup,
      collapsed: state.collapsed,
    };
  }

  function updateAccountOverride({ accountId, alias, hidden } = {}) {
    const id = String(accountId || '').trim();
    if (!id) return { ok: false, error: 'INVALID_ACCOUNT_ID' };
    const prev = state.overrides[id] || {};
    const next = { ...prev };
    if (alias !== undefined) next.alias = String(alias).trim().slice(0, 48);
    if (hidden !== undefined) next.hidden = Boolean(hidden);
    state.overrides[id] = next;
    saveState();
    return { ok: true, accountId: id, override: next };
  }

  function removeAccount({ accountId } = {}) {
    const id = String(accountId || '').trim();
    if (!id) return { ok: false, error: 'INVALID_ACCOUNT_ID' };
    if (lastLiveLocal && lastLiveLocal.id === id) {
      return { ok: false, error: 'CANNOT_REMOVE_ACTIVE_LOCAL' };
    }
    const beforeLocal = state.localAccounts.length;
    const beforeManual = state.manualAccounts.length;
    state.localAccounts = state.localAccounts.filter((a) => a.id !== id);
    state.manualAccounts = state.manualAccounts.filter((a) => a.id !== id);
    delete state.overrides[id];
    if (state.selectedAccountId === id) {
      state.selectedAccountId = lastLiveLocal?.id || '';
    }
    saveState();
    return {
      ok: true,
      removed: state.localAccounts.length < beforeLocal || state.manualAccounts.length < beforeManual,
    };
  }

  function upsertManualAccount(input = {}) {
    const now = nowFn();
    const id = String(input.id || '').trim() || `manual:${crypto.randomBytes(6).toString('hex')}`;
    const name = String(input.name || input.alias || '').trim().slice(0, 48);
    if (!name) return { ok: false, error: 'NAME_REQUIRED' };

    const email = String(input.email || '').trim().toLowerCase().slice(0, 80);
    const planName = String(input.planName || 'Google AI Pro').trim().slice(0, 32);

    const makeBucket = (pctInput, resetInput) => {
      if (pctInput === '' || pctInput === null || pctInput === undefined) return null;
      const frac = core.parsePercentToFraction(pctInput, false);
      if (frac === null) return null;
      return {
        remainingFraction: frac,
        resetTime: core.normalizeIsoTime(resetInput),
      };
    };

    const g5 = makeBucket(input.gemini5hPct, input.gemini5hReset);
    const gw = makeBucket(input.geminiWeeklyPct, input.geminiWeeklyReset);
    const c5 = makeBucket(input.claude5hPct, input.claude5hReset);
    const cw = makeBucket(input.claudeWeeklyPct, input.claudeWeeklyReset);

    const record = {
      id,
      source: 'manual',
      sourceLabel: '手动追踪',
      poolId: '',
      email,
      name,
      alias: String(input.alias || '').trim().slice(0, 48),
      planName,
      planBadge: core.shortPlanBadge(planName),
      avatarUrl: '',
      isActiveLocal: false,
      updatedAt: now,
      status: g5 || gw || c5 || cw ? 'ok' : 'stale',
      errorMessage: '',
      groups: {
        gemini: { id: 'gemini', label: 'Gemini', fiveHour: g5, weekly: gw },
        claude: { id: 'claude', label: 'Claude', fiveHour: c5, weekly: cw },
      },
    };

    const idx = state.manualAccounts.findIndex((a) => a.id === id);
    if (idx >= 0) {
      state.manualAccounts[idx] = record;
    } else {
      if (state.manualAccounts.length >= MAX_MANUAL_ACCOUNTS) {
        return { ok: false, error: 'MAX_MANUAL_ACCOUNTS_REACHED' };
      }
      state.manualAccounts.push(record);
    }
    saveState();
    return { ok: true, account: record };
  }

  function upsertPoolSource(input = {}) {
    const url = String(input.url || '').trim();
    if (!isAllowedPoolUrl(url)) {
      return { ok: false, error: 'INVALID_POOL_URL' };
    }
    const type = ['antigravity-manager', 'dsh-agy-link', 'cliproxyapi', 'custom'].includes(input.type)
      ? input.type
      : 'custom';
    const id = String(input.id || '').trim() || `pool_${crypto.randomBytes(5).toString('hex')}`;
    const label = String(input.label || '').trim().slice(0, 40) || type;
    const authHeader = String(input.authHeader || 'Authorization').trim().slice(0, 64) || 'Authorization';
    const enabled = input.enabled !== false;

    const idx = state.poolSources.findIndex((p) => p.id === id);
    const existing = idx >= 0 ? state.poolSources[idx] : null;
    // Only overwrite authToken if caller explicitly sent a non-empty string or clearToken flag
    const authToken = input.clearToken
      ? ''
      : typeof input.authToken === 'string' && input.authToken.trim()
        ? input.authToken.trim()
        : existing?.authToken || '';

    const record = {
      id,
      type,
      label,
      url,
      authHeader,
      authToken,
      enabled,
    };

    if (idx >= 0) {
      state.poolSources[idx] = record;
    } else {
      if (state.poolSources.length >= MAX_POOL_SOURCES) {
        return { ok: false, error: 'MAX_POOL_SOURCES_REACHED' };
      }
      state.poolSources.push(record);
    }
    poolCache.delete(id);
    saveState();
    return { ok: true, pool: sanitizePoolForUi(record) };
  }

  function removePoolSource({ poolId } = {}) {
    const id = String(poolId || '').trim();
    if (!id) return { ok: false, error: 'INVALID_POOL_ID' };
    const before = state.poolSources.length;
    state.poolSources = state.poolSources.filter((p) => p.id !== id);
    poolCache.delete(id);
    if (state.selectedAccountId.startsWith(`pool:${id}:`)) {
      state.selectedAccountId = lastLiveLocal?.id || '';
    }
    saveState();
    return { ok: true, removed: state.poolSources.length < before };
  }

  async function testPoolSource(input = {}) {
    const url = String(input.url || '').trim();
    if (!isAllowedPoolUrl(url)) {
      return { ok: false, error: '无效 URL（仅支持 http:// 或 https://）' };
    }
    const existing = input.id ? state.poolSources.find((p) => p.id === input.id) : null;
    const token = typeof input.authToken === 'string' && input.authToken.trim()
      ? input.authToken.trim()
      : existing?.authToken || '';

    const tempPool = {
      id: input.id || 'test',
      type: input.type || 'custom',
      label: input.label || '测试源',
      url,
      authHeader: input.authHeader || 'Authorization',
      authToken: token,
      enabled: true,
    };
    poolCache.delete(tempPool.id);
    const res = await refreshPoolSource(tempPool, true);
    poolCache.delete('test');
    return {
      ok: res.status === 'ok' || res.status === 'empty',
      status: res.status,
      accountCount: res.accounts.length,
      error: res.error,
    };
  }

  function mergeAccounts({ sourceAccountId, targetAccountId } = {}) {
    const srcId = String(sourceAccountId || '').trim();
    const dstId = String(targetAccountId || '').trim();
    if (!srcId || !dstId || srcId === dstId) {
      return { ok: false, error: 'INVALID_MERGE_TARGETS' };
    }
    if (lastLiveLocal && lastLiveLocal.id === srcId) {
      return { ok: false, error: 'CANNOT_MERGE_ACTIVE_AS_SOURCE' };
    }
    const srcAcc = state.localAccounts.find((a) => a.id === srcId) || state.manualAccounts.find((a) => a.id === srcId);
    const dstAcc =
      (lastLiveLocal && lastLiveLocal.id === dstId ? lastLiveLocal : null) ||
      state.localAccounts.find((a) => a.id === dstId) ||
      state.manualAccounts.find((a) => a.id === dstId);
    if (!srcAcc || !dstAcc) {
      return { ok: false, error: 'ACCOUNT_NOT_FOUND' };
    }

    // Preserve alias if target has none
    const srcAlias = state.overrides[srcId]?.alias || srcAcc.alias || '';
    if (srcAlias && !state.overrides[dstId]?.alias && !dstAcc.alias) {
      state.overrides[dstId] = { ...(state.overrides[dstId] || {}), alias: srcAlias };
    }

    state.localAccounts = state.localAccounts.filter((a) => a.id !== srcId);
    state.manualAccounts = state.manualAccounts.filter((a) => a.id !== srcId);
    delete state.overrides[srcId];
    if (state.selectedAccountId === srcId) {
      state.selectedAccountId = dstId;
    }
    saveState();
    return { ok: true, mergedInto: dstId };
  }

  return {
    getOverview,
    setUiPrefs,
    updateAccountOverride,
    removeAccount,
    mergeAccounts,
    upsertManualAccount,
    upsertPoolSource,
    removePoolSource,
    testPoolSource,
    getStateForTests: () => structuredClone(state),
  };
}
