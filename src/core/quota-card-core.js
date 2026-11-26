// AGY Quota Card — Pure Core Logic (quota-card-core.js)
// Shared UMD module used by both the Electron UI bundle and the Node sidecar/tests.
// Zero external dependencies. Deterministic when `nowMs` is passed.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.__agQcCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const GROUP_KEYS = ['gemini', 'claude'];
  const GROUP_LABELS = {
    gemini: 'Gemini',
    claude: 'Claude',
  };

  function clamp01(val) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    if (val < 0) return 0;
    if (val > 1) return 1;
    return val;
  }

  function parseFraction(val) {
    if (typeof val === 'number') {
      return Number.isFinite(val) && val >= 0 && val <= 1 ? val : null;
    }
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return null;
      if (s.endsWith('%')) {
        const n = Number(s.slice(0, -1));
        return Number.isFinite(n) ? clamp01(n / 100) : null;
      }
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
    }
    return null;
  }

  function parsePercentToFraction(val, isUsed = false) {
    if (val === null || val === undefined || val === '') return null;
    const raw = typeof val === 'string' ? val.trim().replace(/%$/, '') : val;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    const frac = n / 100;
    return clamp01(isUsed ? 1 - frac : frac);
  }

  function parseResetTimeMs(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) return null;
      return value > 1e12 ? value : value * 1000;
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) return null;
      const parsed = Date.parse(s);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      const num = Number(s);
      if (Number.isFinite(num) && num > 0) {
        return num > 1e12 ? num : num * 1000;
      }
    }
    return null;
  }

  function normalizeIsoTime(value) {
    const ms = parseResetTimeMs(value);
    if (!ms) return '';
    try {
      return new Date(ms).toISOString();
    } catch {
      return '';
    }
  }

  function shortPlanBadge(planName) {
    const s = String(planName || '').trim();
    if (!s) return '';
    if (/ultra/i.test(s)) return 'Ultra';
    if (/enterprise/i.test(s)) return 'Enterprise';
    if (/teams?/i.test(s)) return 'Teams';
    if (/pro/i.test(s)) return 'Pro';
    if (/free|hobby|starter/i.test(s)) return 'Free';
    return s.length > 12 ? s.slice(0, 12) : s;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /**
   * Compact ETA shown on the right of each quota bar (matches Obsidian Prism style):
   * e.g. "6d22h", "3h4m", "42m", or when ticking under 1h while exhausted: "42m18s" / "38s".
   */
  function formatCompactEta(remainingMs, { preciseUnderHour = false } = {}) {
    if (remainingMs === null || remainingMs === undefined || !Number.isFinite(remainingMs)) return '';
    if (remainingMs <= 0) return '';
    const totalSec = Math.max(1, Math.ceil(remainingMs / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (days > 0) return `${days}d${hours}h`;
    if (hours > 0) return `${hours}h${mins}m`;
    if (preciseUnderHour) {
      if (mins > 0) return `${mins}m${pad2(secs)}s`;
      return `${secs}s`;
    }
    return `${Math.max(1, mins)}m`;
  }

  /**
   * Exact wall-clock recovery time label in local timezone:
   * - Today: "今日 23:15"
   * - Tomorrow: "明日 01:05"
   * - Later: "11/29 14:30"
   */
  function formatResetClock(resetAtMs, nowMs = Date.now()) {
    if (!resetAtMs || !Number.isFinite(resetAtMs)) return '';
    const target = new Date(resetAtMs);
    const now = new Date(nowMs);
    if (!Number.isFinite(target.getTime())) return '';

    const hhmm = `${pad2(target.getHours())}:${pad2(target.getMinutes())}`;
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    const dayDiff = Math.round((startTarget - startToday) / 86400000);

    if (dayDiff === 0) return `今日 ${hhmm}`;
    if (dayDiff === 1) return `明日 ${hhmm}`;
    return `${pad2(target.getMonth() + 1)}/${pad2(target.getDate())} ${hhmm}`;
  }

  /**
   * Detailed human-readable recovery countdown for exhausted quota banners:
   * - < 1h: "00:42:18 后恢复（今日 22:45）"
   * - < 24h: "3小时 4分钟后恢复（明日 01:05）"
   * - >= 24h: "2天 5小时后恢复（11/29 14:30）"
   */
  function formatDetailedCountdown(remainingMs, resetAtMs, nowMs = Date.now()) {
    if (remainingMs === null || remainingMs === undefined || !Number.isFinite(remainingMs)) {
      return '等待上游返回恢复时间';
    }
    if (remainingMs <= 0) {
      return '已达重置时间，即将恢复';
    }
    const totalSec = Math.max(1, Math.ceil(remainingMs / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    let dur = '';
    if (days > 0) {
      dur = hours > 0 ? `${days}天 ${hours}小时` : `${days}天`;
    } else if (hours > 0) {
      dur = mins > 0 ? `${hours}小时 ${mins}分` : `${hours}小时`;
    } else {
      dur = `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`;
    }
    const clock = formatResetClock(resetAtMs, nowMs);
    return clock ? `${dur}后恢复（${clock}）` : `${dur}后恢复`;
  }

  /**
   * Resolves a single quota bucket (5h or weekly) at timestamp `nowMs`.
   */
  function resolveBucketState(bucket, nowMs = Date.now(), isActiveLocal = true) {
    if (!bucket || typeof bucket !== 'object') {
      return {
        available: false,
        rawFraction: null,
        effectiveFraction: null,
        pct: null,
        resetAtMs: null,
        remainingMs: null,
        isExhausted: false,
        likelyRecovered: false,
        awaitingRefresh: false,
        etaText: '',
        clockText: '',
        tone: 'muted',
      };
    }

    const rawFrac = clamp01(bucket.remainingFraction);
    if (rawFrac === null) {
      return {
        available: false,
        rawFraction: null,
        effectiveFraction: null,
        pct: null,
        resetAtMs: null,
        remainingMs: null,
        isExhausted: false,
        likelyRecovered: false,
        awaitingRefresh: false,
        etaText: '',
        clockText: '',
        tone: 'muted',
      };
    }

    const resetAtMs = parseResetTimeMs(bucket.resetTime);
    const remainingMs = resetAtMs ? Math.max(0, resetAtMs - nowMs) : null;
    const rawPct = Math.round(rawFrac * 100);
    const resetElapsed = Boolean(resetAtMs && nowMs >= resetAtMs);

    // If a cached/standby account had used quota and its resetTime has elapsed, treat as likely recovered
    const likelyRecovered = !isActiveLocal && resetElapsed && rawFrac < 0.995;
    const awaitingRefresh = isActiveLocal && resetElapsed && rawFrac < 0.995;

    const effectiveFraction = likelyRecovered ? 1 : rawFrac;
    const pct = likelyRecovered ? 100 : rawPct;
    const isExhausted = !likelyRecovered && pct <= 0;

    let etaText = '';
    if (likelyRecovered) {
      etaText = '已重置';
    } else if (awaitingRefresh) {
      etaText = '即将刷新';
    } else if (remainingMs !== null && remainingMs > 0) {
      etaText = formatCompactEta(remainingMs, { preciseUnderHour: isExhausted });
    }

    const clockText = resetAtMs ? formatResetClock(resetAtMs, nowMs) : '';

    let tone = 'ok';
    if (isExhausted) tone = 'exhausted';
    else if (pct <= 15) tone = 'low';
    else if (pct <= 35) tone = 'tight';
    else if (likelyRecovered) tone = 'recovered';

    return {
      available: true,
      rawFraction: rawFrac,
      effectiveFraction,
      pct,
      resetAtMs,
      remainingMs,
      isExhausted,
      likelyRecovered,
      awaitingRefresh,
      etaText,
      clockText,
      tone,
    };
  }

  /**
   * Evaluates a model group ('gemini' or 'claude') combining its 5h & weekly buckets.
   */
  function resolveGroupState(group, nowMs = Date.now(), isActiveLocal = true) {
    const fiveHour = resolveBucketState(group?.fiveHour, nowMs, isActiveLocal);
    const weekly = resolveBucketState(group?.weekly, nowMs, isActiveLocal);

    const activeBuckets = [
      fiveHour.available ? { key: 'fiveHour', label: '5h窗口', ...fiveHour } : null,
      weekly.available ? { key: 'weekly', label: '周额度', ...weekly } : null,
    ].filter(Boolean);

    if (!activeBuckets.length) {
      return {
        fiveHour,
        weekly,
        pace: 'idle',
        paceLabel: '待命',
        minPct: null,
        isExhausted: false,
        exhaustedBucket: null,
        needsSecondTick: false,
      };
    }

    const minPct = Math.min(...activeBuckets.map((b) => b.pct));
    // Pick the most critical exhausted bucket: if weekly is exhausted it blocks longer than 5h,
    // otherwise pick 5h if exhausted.
    const exhaustedBucket =
      (weekly.available && weekly.isExhausted ? { key: 'weekly', label: '周额度', ...weekly } : null) ||
      (fiveHour.available && fiveHour.isExhausted ? { key: 'fiveHour', label: '5h窗口', ...fiveHour } : null);

    let pace = 'ok';
    let paceLabel = '充裕';
    if (exhaustedBucket) {
      pace = 'exhausted';
      paceLabel = '已用尽';
    } else if (minPct <= 15) {
      pace = 'low';
      paceLabel = '额度偏低';
    } else if (minPct <= 35) {
      pace = 'tight';
      paceLabel = '余量偏紧';
    } else if (activeBuckets.every((b) => b.likelyRecovered)) {
      pace = 'recovered';
      paceLabel = '已重置';
    }

    const needsSecondTick = Boolean(
      exhaustedBucket &&
        exhaustedBucket.remainingMs !== null &&
        exhaustedBucket.remainingMs > 0 &&
        exhaustedBucket.remainingMs < 3600000
    );

    return {
      fiveHour,
      weekly,
      pace,
      paceLabel,
      minPct,
      isExhausted: Boolean(exhaustedBucket),
      exhaustedBucket,
      needsSecondTick,
    };
  }

  /**
   * Computes a concise display name for an account (alias > name > email prefix > id).
   */
  function getAccountDisplayName(account) {
    if (!account) return '未登录账号';
    const alias = String(account.alias || '').trim();
    if (alias) return alias;
    const name = String(account.name || '').trim();
    if (name) return name;
    const email = String(account.email || '').trim();
    if (email) {
      const at = email.indexOf('@');
      return at > 0 ? email.slice(0, at) : email;
    }
    return String(account.id || '账号');
  }

  /**
   * Generates a 1-2 character avatar monogram when no profile picture is available.
   */
  function getAccountInitials(account) {
    const label = getAccountDisplayName(account).trim();
    if (!label) return '?';
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && /^[a-zA-Z]/.test(parts[0]) && /^[a-zA-Z]/.test(parts[1])) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return label.slice(0, 2).toUpperCase();
  }

  /**
   * Finds the best alternative account with available quota when current account is exhausted/low.
   */
  function findBestAlternativeAccount(accounts, currentAccountId, groupKey, nowMs = Date.now()) {
    if (!Array.isArray(accounts) || accounts.length < 2) return null;
    const gKey = GROUP_KEYS.includes(groupKey) ? groupKey : 'gemini';
    let best = null;

    for (const acc of accounts) {
      if (!acc || acc.id === currentAccountId || acc.hidden) continue;
      const g = acc.groups?.[gKey];
      const state = resolveGroupState(g, nowMs, Boolean(acc.isActiveLocal));
      if (state.minPct === null || state.isExhausted || state.minPct <= 15) continue;
      // Score prefers higher minPct, then higher 5h pct, then active local
      const fivePct = state.fiveHour.available ? state.fiveHour.pct : state.minPct;
      const score = state.minPct * 1000 + fivePct * 10 + (acc.isActiveLocal ? 1 : 0);
      if (!best || score > best.score) {
        best = {
          account: acc,
          displayName: getAccountDisplayName(acc),
          minPct: state.minPct,
          fiveHourPct: state.fiveHour.available ? state.fiveHour.pct : null,
          weeklyPct: state.weekly.available ? state.weekly.pct : null,
          score,
        };
      }
    }
    return best;
  }

  /**
   * Parses Antigravity Language Server responses (`RetrieveUserQuotaSummary` + `GetUserStatus`)
   * into a normalized local account record.
   */
  function parseNativeLsSnapshot(quotaRes, userStatusRes, nowMs = Date.now()) {
    const user = userStatusRes?.userStatus || userStatusRes?.response?.userStatus || userStatusRes || {};
    const email = String(user.email || '').trim().toLowerCase();
    const name = String(user.name || '').trim();
    const tierName =
      String(user.userTier?.name || user.userTier?.description || user.planStatus?.planInfo?.planName || '').trim();
    const avatarUrl =
      typeof user.profilePictureUrl === 'string' && user.profilePictureUrl.startsWith('data:image/')
        ? user.profilePictureUrl
        : '';

    const rawGroups = quotaRes?.response?.groups || quotaRes?.groups || [];
    const groups = {
      gemini: { id: 'gemini', label: 'Gemini', fiveHour: null, weekly: null },
      claude: { id: 'claude', label: 'Claude', fiveHour: null, weekly: null },
    };

    if (Array.isArray(rawGroups)) {
      for (const g of rawGroups) {
        if (!g || typeof g !== 'object') continue;
        const gKey = /claude|gpt|3p|anthropic|openai/i.test(String(g.displayName || g.id || ''))
          ? 'claude'
          : 'gemini';
        const buckets = Array.isArray(g.buckets) ? g.buckets : [];
        for (const b of buckets) {
          if (!b || typeof b !== 'object') continue;
          const frac = parseFraction(b.remainingFraction);
          if (frac === null) continue;
          const resetTime = normalizeIsoTime(b.resetTime);
          const isWeekly = b.window === 'weekly' || /weekly|week|7d/i.test(String(b.bucketId || b.displayName || ''));
          const is5h = b.window === '5h' || /5h|five|rolling/i.test(String(b.bucketId || b.displayName || ''));
          if (isWeekly) {
            groups[gKey].weekly = { remainingFraction: frac, resetTime };
          } else if (is5h) {
            groups[gKey].fiveHour = { remainingFraction: frac, resetTime };
          }
        }
      }
    }

    const hasAnyBucket = Boolean(
      groups.gemini.fiveHour || groups.gemini.weekly || groups.claude.fiveHour || groups.claude.weekly
    );
    if (!email && !name && !hasAnyBucket) {
      return null;
    }

    const id = email ? `local:${email}` : `local:${name || 'default'}`;
    return {
      id,
      source: 'local',
      sourceLabel: '本机登录',
      poolId: '',
      email,
      name: name || (email ? email.split('@')[0] : 'Antigravity 账号'),
      alias: '',
      planName: tierName,
      planBadge: shortPlanBadge(tierName),
      avatarUrl,
      isActiveLocal: true,
      updatedAt: nowMs,
      status: hasAnyBucket ? 'ok' : 'stale',
      errorMessage: '',
      groups,
    };
  }

  /**
   * Helper for flexible snake_case / camelCase field reading without prototype traversal.
   */
  function pickField(obj, ...keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
    }
    const norm = (s) => String(s).toLowerCase().replace(/[_\s-]/g, '');
    const own = Object.keys(obj);
    for (const k of keys) {
      const target = norm(k);
      for (const ok of own) {
        if (norm(ok) === target) return obj[ok];
      }
    }
    return undefined;
  }

  function extractBucketFromObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const remFrac = parseFraction(pickField(obj, 'remainingFraction', 'remaining_fraction', 'fraction', 'remaining'));
    const remPct = remFrac === null
      ? parsePercentToFraction(pickField(obj, 'remainingPercent', 'remaining_percent', 'remainingPct'), false)
      : remFrac;
    const usedPct = remPct === null
      ? parsePercentToFraction(pickField(obj, 'usedPercent', 'used_percent', 'usedPct', 'percent'), true)
      : remPct;
    if (usedPct === null) return null;
    const resetTime = normalizeIsoTime(
      pickField(obj, 'resetTime', 'reset_time', 'resetsAt', 'resets_at', 'resetAt', 'reset_at')
    );
    return { remainingFraction: usedPct, resetTime };
  }

  /**
   * Parses external multi-account pool payloads (dsh-agy-link, Antigravity-Manager,
   * CLIProxyAPI, or custom JSON endpoints) into normalized account records.
   */
  function parseExternalPoolPayload(poolConfig, rawPayload, nowMs = Date.now()) {
    const poolId = String(poolConfig?.id || 'pool');
    const poolLabel = String(poolConfig?.label || poolConfig?.type || '外部账号池');
    const list = Array.isArray(rawPayload)
      ? rawPayload
      : Array.isArray(rawPayload?.accounts)
        ? rawPayload.accounts
        : Array.isArray(rawPayload?.items)
          ? rawPayload.items
          : Array.isArray(rawPayload?.data)
            ? rawPayload.data
            : [];

    const accounts = [];
    for (let i = 0; i < Math.min(list.length, 32); i++) {
      const raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      if (raw.enabled === false) continue;

      const rawId = String(pickField(raw, 'id', 'email', 'accountId', 'name', 'alias') || `acc-${i + 1}`).trim();
      const email = String(pickField(raw, 'email') || '').trim().toLowerCase();
      const alias = String(pickField(raw, 'alias', 'label') || '').trim();
      const name = String(pickField(raw, 'name', 'displayName') || alias || (email ? email.split('@')[0] : `账号 ${i + 1}`)).trim();
      const planName = String(pickField(raw, 'planName', 'tier', 'subscriptionTier', 'plan') || '').trim();
      const authRequired = raw.authRequired === true || raw.status === 'auth_required';

      const groups = {
        gemini: { id: 'gemini', label: 'Gemini', fiveHour: null, weekly: null },
        claude: { id: 'claude', label: 'Claude', fiveHour: null, weekly: null },
      };

      // Shape A: dsh-agy-link format -> raw.quotas.{ google | gemini | anthropic | claude | openai }
      const quotasObj = pickField(raw, 'quotas', 'quota');
      if (quotasObj && typeof quotasObj === 'object' && !Array.isArray(quotasObj)) {
        for (const [famKey, q] of Object.entries(quotasObj)) {
          if (!q || typeof q !== 'object') continue;
          const gKey = /anthropic|claude|openai|gpt|3p/i.test(famKey) ? 'claude' : 'gemini';
          const f5 = parseFraction(pickField(q, 'remainingFraction', 'fiveHourFraction', 'five_hour_fraction'));
          if (f5 !== null) {
            groups[gKey].fiveHour = {
              remainingFraction: f5,
              resetTime: normalizeIsoTime(pickField(q, 'resetTime', 'fiveHourResetTime', 'resetsAt')),
            };
          }
          const fw = parseFraction(pickField(q, 'weeklyFraction', 'weeklyRemainingFraction', 'weekly_fraction'));
          if (fw !== null) {
            groups[gKey].weekly = {
              remainingFraction: fw,
              resetTime: normalizeIsoTime(pickField(q, 'weeklyResetTime', 'weeklyResetsAt', 'weekly_reset_time')),
            };
          }
        }
      }

      // Shape B: normalized groups object -> raw.groups.{ gemini, claude }
      const groupsObj = pickField(raw, 'groups');
      if (groupsObj && typeof groupsObj === 'object' && !Array.isArray(groupsObj)) {
        for (const gKey of GROUP_KEYS) {
          const gVal = groupsObj[gKey];
          if (!gVal || typeof gVal !== 'object') continue;
          const b5 = extractBucketFromObject(pickField(gVal, 'fiveHour', 'five_hour', '5h'));
          const bw = extractBucketFromObject(pickField(gVal, 'weekly', 'week', '7d'));
          if (b5) groups[gKey].fiveHour = b5;
          if (bw) groups[gKey].weekly = bw;
        }
      }

      // Shape C: windows array (dsh-cost-meter unified window format)
      const windowsArr = pickField(raw, 'windows', 'buckets');
      if (Array.isArray(windowsArr)) {
        for (const w of windowsArr) {
          if (!w || typeof w !== 'object') continue;
          const scopeStr = String(pickField(w, 'scope', 'group', 'id', 'label') || '');
          const gKey = /claude|anthropic|gpt|openai|3p/i.test(scopeStr) ? 'claude' : 'gemini';
          const bucket = extractBucketFromObject(w);
          if (!bucket) continue;
          const hrs = Number(pickField(w, 'periodHours', 'period_hours'));
          const isWeekly = hrs >= 24 || /weekly|week|7d|周/i.test(String(pickField(w, 'window', 'id', 'label') || ''));
          if (isWeekly) groups[gKey].weekly = bucket;
          else groups[gKey].fiveHour = bucket;
        }
      }

      const hasAny = Boolean(
        groups.gemini.fiveHour || groups.gemini.weekly || groups.claude.fiveHour || groups.claude.weekly
      );

      accounts.push({
        id: `pool:${poolId}:${rawId}`,
        source: 'pool',
        sourceLabel: poolLabel,
        poolId,
        email,
        name,
        alias,
        planName,
        planBadge: shortPlanBadge(planName) || 'Pool',
        avatarUrl: '',
        isActiveLocal: false,
        updatedAt: Number(pickField(raw, 'updatedAt', 'updated_at')) || nowMs,
        status: authRequired ? 'error' : hasAny ? 'ok' : 'stale',
        errorMessage: authRequired ? '需要重新授权登录' : '',
        groups,
      });
    }

    return accounts;
  }

  /**
   * Merges live local account + persisted local history + external pool accounts + manual accounts.
   * Deduplicates by id, preserves user aliases/hidden flags, and orders cleanly:
   * 1) Active local login first
   * 2) Other cached local accounts (most recently updated first)
   * 3) External pool accounts
   * 4) Manual accounts
   */
  function mergeAccountRegistry({
    liveLocal = null,
    storedLocal = [],
    poolAccounts = [],
    manualAccounts = [],
    overrides = {},
  } = {}) {
    const byId = new Map();

    // 1. Persisted local accounts (marked inactive until matched by liveLocal)
    for (const acc of storedLocal) {
      if (!acc || !acc.id) continue;
      byId.set(acc.id, { ...acc, source: 'local', isActiveLocal: false });
    }

    // 2. Live local account overwrites/inserts and marks active
    if (liveLocal && liveLocal.id) {
      const prev = byId.get(liveLocal.id);
      byId.set(liveLocal.id, {
        ...(prev || {}),
        ...liveLocal,
        source: 'local',
        isActiveLocal: true,
        alias: prev?.alias || liveLocal.alias || '',
      });
    }

    // 3. External pool accounts
    for (const acc of poolAccounts) {
      if (!acc || !acc.id) continue;
      byId.set(acc.id, { ...acc, source: 'pool', isActiveLocal: false });
    }

    // 4. Manual accounts
    for (const acc of manualAccounts) {
      if (!acc || !acc.id) continue;
      byId.set(acc.id, { ...acc, source: 'manual', isActiveLocal: false });
    }

    // Apply user alias/hidden overrides
    const list = [];
    for (const acc of byId.values()) {
      const ov = overrides && overrides[acc.id] ? overrides[acc.id] : null;
      list.push({
        ...acc,
        alias: ov?.alias !== undefined ? String(ov.alias) : String(acc.alias || ''),
        hidden: Boolean(ov?.hidden),
      });
    }

    const rankSource = (acc) => {
      if (acc.isActiveLocal) return 0;
      if (acc.source === 'local') return 1;
      if (acc.source === 'pool') return 2;
      return 3;
    };

    list.sort((a, b) => {
      const ra = rankSource(a);
      const rb = rankSource(b);
      if (ra !== rb) return ra - rb;
      return (b.updatedAt || 0) - (a.updatedAt || 0) || a.id.localeCompare(b.id);
    });

    return list;
  }

  /**
   * Picks which account should be selected in the card UI.
   */
  function resolveSelectedAccount(accounts, selectedId) {
    const visible = (accounts || []).filter((a) => a && !a.hidden);
    if (!visible.length) return null;
    if (selectedId) {
      const hit = visible.find((a) => a.id === selectedId);
      if (hit) return hit;
    }
    return visible.find((a) => a.isActiveLocal) || visible[0];
  }

  return {
    GROUP_KEYS,
    GROUP_LABELS,
    clamp01,
    parseFraction,
    parsePercentToFraction,
    parseResetTimeMs,
    normalizeIsoTime,
    shortPlanBadge,
    formatCompactEta,
    formatResetClock,
    formatDetailedCountdown,
    resolveBucketState,
    resolveGroupState,
    getAccountDisplayName,
    getAccountInitials,
    findBestAlternativeAccount,
    parseNativeLsSnapshot,
    parseExternalPoolPayload,
    mergeAccountRegistry,
    resolveSelectedAccount,
  };
});
