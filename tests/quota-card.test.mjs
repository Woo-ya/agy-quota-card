import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

import { createQuotaService } from '../sidecars/quota_card/quota-service.mjs';
import { buildInjectBundle, PLUGIN_ROOT } from '../sidecars/quota_card/cdp-client.mjs';

const require = createRequire(import.meta.url);
const core = require('../src/core/quota-card-core.js');

const BASE_NOW = Date.parse('2026-11-26T14:00:00.000Z'); // 22:00:00 UTC+8

test('parseNativeLsSnapshot parses Gemini & Claude buckets and user profile accurately', () => {
  const quotaRes = {
    response: {
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [
            { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.9024, resetTime: '2026-12-03T11:55:56Z' },
            { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.6388, resetTime: '2026-11-26T16:55:56Z' },
          ],
        },
        {
          displayName: 'Claude and GPT models',
          buckets: [
            { bucketId: '3p-weekly', window: 'weekly', remainingFraction: 1 },
            { bucketId: '3p-5h', window: '5h', remainingFraction: 1 },
          ],
        },
      ],
    },
  };
  const userRes = {
    userStatus: {
      name: 'Yo Zho',
      email: 'Zhoyooy@gmail.com',
      userTier: { name: 'Google AI Pro' },
      profilePictureUrl: 'data:image/png;base64,AAAA',
    },
  };

  const acc = core.parseNativeLsSnapshot(quotaRes, userRes, BASE_NOW);
  assert.ok(acc);
  assert.equal(acc.id, 'local:zhoyooy@gmail.com');
  assert.equal(acc.planBadge, 'Pro');
  assert.equal(acc.isActiveLocal, true);
  assert.equal(acc.groups.gemini.fiveHour.remainingFraction, 0.6388);
  assert.equal(acc.groups.gemini.weekly.remainingFraction, 0.9024);
  assert.equal(acc.groups.claude.fiveHour.remainingFraction, 1);
});

test('exhausted quota (< 1h) computes precise countdown, clock label, and fast second-tick flag', () => {
  const resetAt = new Date(BASE_NOW + (42 * 60 + 18) * 1000).toISOString();
  const group = {
    id: 'gemini',
    label: 'Gemini',
    fiveHour: { remainingFraction: 0, resetTime: resetAt },
    weekly: { remainingFraction: 0.72, resetTime: new Date(BASE_NOW + 3 * 86400000).toISOString() },
  };

  const st = core.resolveGroupState(group, BASE_NOW, true);
  assert.equal(st.pace, 'exhausted');
  assert.equal(st.paceLabel, '已用尽');
  assert.equal(st.isExhausted, true);
  assert.equal(st.exhaustedBucket.key, 'fiveHour');
  assert.equal(st.exhaustedBucket.etaText, '42m18s');
  assert.equal(st.needsSecondTick, true);

  const detail = core.formatDetailedCountdown(st.exhaustedBucket.remainingMs, st.exhaustedBucket.resetAtMs, BASE_NOW);
  assert.match(detail, /^00:42:18后恢复（.+）$/);
});

test('weekly exhaustion takes precedence over 5h exhaustion when both are 0%', () => {
  const group = {
    id: 'gemini',
    label: 'Gemini',
    fiveHour: { remainingFraction: 0, resetTime: new Date(BASE_NOW + 3600000).toISOString() },
    weekly: { remainingFraction: 0, resetTime: new Date(BASE_NOW + 2 * 86400000 + 5 * 3600000).toISOString() },
  };
  const st = core.resolveGroupState(group, BASE_NOW, true);
  assert.equal(st.exhaustedBucket.key, 'weekly');
  assert.equal(st.needsSecondTick, false);
  const detail = core.formatDetailedCountdown(st.exhaustedBucket.remainingMs, st.exhaustedBucket.resetAtMs, BASE_NOW);
  assert.match(detail, /^2天 5小时后恢复（.+）$/);
});

test('cached standby account automatically transitions to likelyRecovered after resetTime elapses', () => {
  const pastReset = new Date(BASE_NOW - 60000).toISOString();
  const group = {
    id: 'gemini',
    label: 'Gemini',
    fiveHour: { remainingFraction: 0, resetTime: pastReset },
    weekly: { remainingFraction: 0.8, resetTime: pastReset },
  };

  const cachedSt = core.resolveGroupState(group, BASE_NOW, false);
  assert.equal(cachedSt.isExhausted, false);
  assert.equal(cachedSt.pace, 'recovered');
  assert.equal(cachedSt.paceLabel, '已重置');
  assert.equal(cachedSt.fiveHour.pct, 100);
  assert.equal(cachedSt.fiveHour.etaText, '已重置');

  // Active local account still awaits live LS refresh instead of faking 100%
  const activeSt = core.resolveGroupState(group, BASE_NOW, true);
  assert.equal(activeSt.isExhausted, true);
  assert.equal(activeSt.fiveHour.awaitingRefresh, true);
  assert.equal(activeSt.fiveHour.etaText, '即将刷新');
});

test('findBestAlternativeAccount recommends healthiest standby account when current is exhausted', () => {
  const accounts = [
    {
      id: 'local:a@gmail.com',
      name: 'Account A',
      isActiveLocal: true,
      groups: {
        gemini: { fiveHour: { remainingFraction: 0, resetTime: new Date(BASE_NOW + 1800000).toISOString() }, weekly: { remainingFraction: 0.6 } },
      },
    },
    {
      id: 'local:b@gmail.com',
      name: 'Account B',
      isActiveLocal: false,
      groups: {
        gemini: { fiveHour: { remainingFraction: 0.45 }, weekly: { remainingFraction: 0.9 } },
      },
    },
    {
      id: 'pool:p1:c',
      name: 'Account C',
      isActiveLocal: false,
      groups: {
        gemini: { fiveHour: { remainingFraction: 0.88 }, weekly: { remainingFraction: 0.95 } },
      },
    },
  ];

  const best = core.findBestAlternativeAccount(accounts, 'local:a@gmail.com', 'gemini', BASE_NOW);
  assert.ok(best);
  assert.equal(best.account.id, 'pool:p1:c');
  assert.equal(best.minPct, 88);
});

test('parseExternalPoolPayload supports dsh-agy-link and unified windows formats', () => {
  const agyLinkPayload = {
    accounts: [
      {
        id: 'acc-1',
        alias: 'Work Google',
        enabled: true,
        quotas: {
          google: { remainingFraction: 0.42, resetTime: '2026-11-26T17:00:00Z', weeklyFraction: 0.85, weeklyResetTime: '2026-12-02T00:00:00Z' },
          anthropic: { remainingFraction: 0.0, resetTime: '2026-11-26T15:00:00Z' },
        },
      },
      { id: 'acc-disabled', enabled: false },
    ],
  };

  const parsed = core.parseExternalPoolPayload({ id: 'p1', label: 'AGY Pool' }, agyLinkPayload, BASE_NOW);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'pool:p1:acc-1');
  assert.equal(parsed[0].alias, 'Work Google');
  assert.equal(parsed[0].groups.gemini.fiveHour.remainingFraction, 0.42);
  assert.equal(parsed[0].groups.claude.fiveHour.remainingFraction, 0);

  const windowsPayload = {
    items: [
      {
        email: 'pool2@example.com',
        windows: [
          { scope: 'gemini', periodHours: 5, usedPct: 30, resetsAt: '2026-11-26T18:00:00Z' },
          { scope: 'gemini', periodHours: 168, usedPct: 10, resetsAt: '2026-12-03T00:00:00Z' },
        ],
      },
    ],
  };
  const parsed2 = core.parseExternalPoolPayload({ id: 'p2', label: 'Custom' }, windowsPayload, BASE_NOW);
  assert.equal(parsed2.length, 1);
  assert.equal(parsed2[0].groups.gemini.fiveHour.remainingFraction, 0.7);
  assert.equal(parsed2[0].groups.gemini.weekly.remainingFraction, 0.9);
});

test('createQuotaService tracks multi-account login switches, external pools, and masks pool tokens', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-qc-test-'));
  const storePath = path.join(tmpDir, 'store.json');

  let activeUser = 'a@gmail.com';
  const mockFetch = async (url, init) => {
    if (String(url).includes('RetrieveUserQuotaSummary')) {
      return {
        ok: true,
        json: async () => ({
          response: {
            groups: [
              {
                displayName: 'Gemini Models',
                buckets: [
                  { window: '5h', remainingFraction: activeUser === 'a@gmail.com' ? 0.65 : 0.95, resetTime: '2026-11-26T17:00:00Z' },
                  { window: 'weekly', remainingFraction: 0.9, resetTime: '2026-12-03T12:00:00Z' },
                ],
              },
            ],
          },
        }),
      };
    }
    if (String(url).includes('GetUserStatus')) {
      return {
        ok: true,
        json: async () => ({
          userStatus: {
            name: activeUser === 'a@gmail.com' ? 'User A' : 'User B',
            email: activeUser,
            userTier: { name: 'Google AI Pro' },
          },
        }),
      };
    }
    if (String(url).includes('127.0.0.1:8045')) {
      assert.equal(init.headers.Authorization, 'Bearer secret-token-123');
      return {
        ok: true,
        json: async () => ({
          accounts: [
            {
              id: 'pool-u1',
              alias: 'Pool Alpha',
              quotas: { google: { remainingFraction: 0.82, weeklyFraction: 0.91 } },
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  try {
    const svc = createQuotaService({
      storePath,
      fetchImpl: mockFetch,
      env: { ANTIGRAVITY_LS_ADDRESS: 'localhost:5387', ANTIGRAVITY_CSRF_TOKEN: 'csrf' },
      nowFn: () => BASE_NOW,
    });

    // 1. Capture Account A -> auto-selected
    const ov1 = await svc.getOverview({ force: true });
    assert.equal(ov1.ok, true);
    assert.equal(ov1.accounts.length, 1);
    assert.equal(ov1.accounts[0].email, 'a@gmail.com');
    assert.equal(ov1.selectedAccountId, 'local:a@gmail.com');

    // 2. Simulate switching Google login in Antigravity to Account B -> auto-switches selectedAccountId!
    activeUser = 'b@gmail.com';
    const ov2 = await svc.getOverview({ force: true });
    assert.equal(ov2.accounts.length, 2);
    assert.equal(ov2.accounts[0].email, 'b@gmail.com');
    assert.equal(ov2.accounts[0].isActiveLocal, true);
    assert.equal(ov2.accounts[1].email, 'a@gmail.com');
    assert.equal(ov2.accounts[1].isActiveLocal, false);
    assert.equal(ov2.selectedAccountId, 'local:b@gmail.com');

    // 2b. Manual peek at Account A while still signed into Account B is preserved across polls
    svc.setUiPrefs({ selectedAccountId: 'local:a@gmail.com' });
    const ov2b = await svc.getOverview({ force: true });
    assert.equal(ov2b.selectedAccountId, 'local:a@gmail.com');

    // 2c. Switching login back to Account A then to Account B auto-follows again
    activeUser = 'a@gmail.com';
    const ov2c = await svc.getOverview({ force: true });
    assert.equal(ov2c.selectedAccountId, 'local:a@gmail.com');
    activeUser = 'b@gmail.com';
    const ov2d = await svc.getOverview({ force: true });
    assert.equal(ov2d.selectedAccountId, 'local:b@gmail.com');

    // 3. Add external pool with secret token — verify token is NEVER echoed to UI
    const addPool = svc.upsertPoolSource({
      type: 'antigravity-manager',
      label: 'Local Manager',
      url: 'http://127.0.0.1:8045/api/accounts',
      authToken: 'secret-token-123',
    });
    assert.equal(addPool.ok, true);
    assert.equal(addPool.pool.hasAuthToken, true);
    assert.equal('authToken' in addPool.pool, false);

    const ov3 = await svc.getOverview({ force: true });
    assert.equal(ov3.accounts.length, 3);
    assert.equal(ov3.pools[0].hasAuthToken, true);
    assert.equal('authToken' in ov3.pools[0], false);

    // 4. Active local account cannot be removed; historical account can be removed
    const rmActive = svc.removeAccount({ accountId: 'local:b@gmail.com' });
    assert.equal(rmActive.ok, false);
    const rmHist = svc.removeAccount({ accountId: 'local:a@gmail.com' });
    assert.equal(rmHist.ok, true);
    assert.equal(rmHist.removed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildInjectBundle produces syntactically valid JS bundle', () => {
  const bundle = buildInjectBundle(PLUGIN_ROOT);
  assert.ok(bundle.hash && bundle.hash.length === 16);
  assert.doesNotThrow(() => new vm.Script(bundle.source));
});

test('createQuotaService never persists anonymous local:default and auto-prunes legacy phantom records', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-qc-dedup-'));
  const storePath = path.join(tmpDir, 'store.json');

  // Seed legacy store containing a phantom local:default alongside a real account
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      version: 1,
      selectedAccountId: 'local:default',
      localAccounts: [
        { id: 'local:default', email: '', name: 'Antigravity 账号', groups: {} },
        { id: 'local:real@gmail.com', email: 'real@gmail.com', name: 'Real User', groups: {} },
      ],
    }),
    'utf8'
  );

  let userReady = false;
  const mockFetch = async (url) => {
    if (String(url).includes('RetrieveUserQuotaSummary')) {
      return {
        ok: true,
        json: async () => ({
          response: {
            groups: [{ displayName: 'Gemini Models', buckets: [{ window: '5h', remainingFraction: 0.8 }] }],
          },
        }),
      };
    }
    if (String(url).includes('GetUserStatus')) {
      if (!userReady) return { ok: false, status: 503, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({ userStatus: { name: 'Real User', email: 'real@gmail.com' } }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  try {
    const svc = createQuotaService({
      storePath,
      fetchImpl: mockFetch,
      env: { ANTIGRAVITY_LS_ADDRESS: 'localhost:5387', ANTIGRAVITY_CSRF_TOKEN: 'csrf' },
      nowFn: () => BASE_NOW,
    });

    // Legacy local:default should be pruned immediately on load
    assert.equal(svc.getStateForTests().localAccounts.length, 1);
    assert.equal(svc.getStateForTests().selectedAccountId, 'local:real@gmail.com');

    // When GetUserStatus temporarily fails, local:default must NOT be persisted
    await svc.getOverview({ force: true });
    assert.equal(svc.getStateForTests().localAccounts.length, 1);

    // Once GetUserStatus recovers, real account updates cleanly
    userReady = true;
    const ov = await svc.getOverview({ force: true });
    assert.equal(ov.accounts.filter((a) => a.id === 'local:default').length, 0);

    // Test manual/historical mergeAccounts
    svc.upsertManualAccount({ id: 'manual:dup1', name: 'Dup Account', alias: 'Backup Alias', gemini5hPct: '50' });
    const merged = svc.mergeAccounts({ sourceAccountId: 'manual:dup1', targetAccountId: 'local:real@gmail.com' });
    assert.equal(merged.ok, true);
    assert.equal(svc.getStateForTests().manualAccounts.length, 0);
    assert.equal(svc.getStateForTests().overrides['local:real@gmail.com']?.alias, 'Backup Alias');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
