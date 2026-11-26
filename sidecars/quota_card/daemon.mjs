// AGY Quota Card — Managed Antigravity Sidecar Daemon (daemon.mjs)
// - Auto-discovers Antigravity Electron windows via DevToolsActivePort
// - Registers top-level main-frame CDP binding (__agQcRpcCall) for multi-account quota tracking
// - Persists across window reloads, hot-reloads on src/ edits, and restores clean DOM on shutdown

import fs from 'node:fs';
import path from 'node:path';
import {
  PLUGIN_ROOT,
  RPC_BINDING,
  readCdpPort,
  listEligiblePages,
  CdpSession,
  buildInjectBundle,
  serializeJsonForEval,
  REMOVE_EXPRESSION,
} from './cdp-client.mjs';
import { createQuotaService } from './quota-service.mjs';

const POLL_INTERVAL_MS = 3000;
const LOG_FILE = path.join(PLUGIN_ROOT, 'daemon.log');
const STORE_FILE = path.join(PLUGIN_ROOT, '.quota-accounts.json');

const quotaService = createQuotaService({ storePath: STORE_FILE });
const attached = new Map(); // targetId -> { session, scriptId, hash, title, mainFrameId, mainContextIds }
let shuttingDown = false;
let currentBundle = buildInjectBundle(PLUGIN_ROOT);
let scanTimer = null;
let reloadDebounce = null;
const watchers = [];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    console.log(line);
  } catch {}
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

async function dispatchRpc(action, params) {
  if (action === 'qc-get-overview') {
    return quotaService.getOverview({ force: Boolean(params?.force) });
  }
  if (action === 'qc-set-prefs') {
    return quotaService.setUiPrefs(params || {});
  }
  if (action === 'qc-update-account') {
    return quotaService.updateAccountOverride(params || {});
  }
  if (action === 'qc-remove-account') {
    return quotaService.removeAccount(params || {});
  }
  if (action === 'qc-upsert-manual-account') {
    return quotaService.upsertManualAccount(params || {});
  }
  if (action === 'qc-upsert-pool') {
    return quotaService.upsertPoolSource(params || {});
  }
  if (action === 'qc-remove-pool') {
    return quotaService.removePoolSource(params || {});
  }
  if (action === 'qc-test-pool') {
    return quotaService.testPoolSource(params || {});
  }
  return { ok: false, error: 'unknown-rpc-action' };
}

async function handleBindingCalled(entry, params) {
  if (!params || params.name !== RPC_BINDING) return;
  // Security boundary: reject calls originating from sub-iframes
  if (entry.mainContextIds.size > 0 && !entry.mainContextIds.has(params.executionContextId)) {
    return;
  }

  let req;
  try {
    req = JSON.parse(params.payload);
  } catch {
    return;
  }
  const id = typeof req?.id === 'string' ? req.id : '';
  if (!id) return;

  let response;
  try {
    response = await dispatchRpc(req.action, req.params || {});
  } catch (err) {
    response = { ok: false, error: String(err?.message || err) };
  }

  if (entry.session.closed) return;
  try {
    await entry.session.send('Runtime.evaluate', {
      expression: `window.__agQcRpcResolve && window.__agQcRpcResolve(${serializeJsonForEval(id)}, ${serializeJsonForEval(response)})`,
      contextId: params.executionContextId,
      returnByValue: false,
    });
  } catch {}
}

async function attachAndInject(page) {
  const existing = attached.get(page.id);
  if (existing && !existing.session.closed) {
    if (existing.hash === currentBundle.hash) return;
    try {
      if (existing.scriptId) {
        await existing.session.send('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: existing.scriptId,
        });
      }
      const addRes = await existing.session.send('Page.addScriptToEvaluateOnNewDocument', {
        source: currentBundle.source,
      });
      existing.scriptId = addRes?.identifier || null;
      await existing.session.send('Runtime.evaluate', {
        expression: currentBundle.source,
        returnByValue: false,
      });
      existing.hash = currentBundle.hash;
      log(`[hot-reload] Updated window: ${page.title || page.id}`);
    } catch (err) {
      log(`[warn] Hot-reload failed for ${page.id}: ${err?.message || err}`);
    }
    return;
  }

  try {
    const session = await CdpSession.connect(page.webSocketDebuggerUrl);
    const entry = {
      session,
      scriptId: null,
      hash: currentBundle.hash,
      title: page.title || page.url || page.id,
      mainFrameId: null,
      mainContextIds: new Set(),
    };
    attached.set(page.id, entry);

    session.onClose = () => {
      if (attached.get(page.id) === entry) {
        attached.delete(page.id);
      }
    };

    session.on('Runtime.executionContextCreated', (p) => {
      const ctx = p?.context;
      if (!ctx) return;
      const aux = ctx.auxData || {};
      if (aux.isDefault && (!entry.mainFrameId || aux.frameId === entry.mainFrameId)) {
        entry.mainContextIds.add(ctx.id);
      }
    });
    session.on('Runtime.executionContextDestroyed', (p) => {
      if (p?.executionContextId) entry.mainContextIds.delete(p.executionContextId);
    });
    session.on('Runtime.executionContextsCleared', () => {
      entry.mainContextIds.clear();
    });
    session.on('Runtime.bindingCalled', (p) => {
      void handleBindingCalled(entry, p);
    });

    await session.send('Page.enable');
    try {
      const ft = await session.send('Page.getFrameTree');
      entry.mainFrameId = ft?.frameTree?.frame?.id || null;
    } catch {}
    await session.send('Runtime.enable');
    await session.send('Runtime.addBinding', { name: RPC_BINDING });

    const addRes = await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source: currentBundle.source,
    });
    entry.scriptId = addRes?.identifier || null;

    await session.send('Runtime.evaluate', {
      expression: currentBundle.source,
      returnByValue: false,
    });

    log(`[attached] Injected AGY Quota Card into: ${entry.title}`);
  } catch (err) {
    attached.delete(page.id);
    log(`[warn] Failed to attach to ${page.id}: ${err?.message || err}`);
  }
}

async function scanOnce() {
  if (shuttingDown) return;
  const port = readCdpPort();
  if (!port) return;

  let pages = [];
  try {
    pages = await listEligiblePages(port);
  } catch {
    return;
  }

  for (const page of pages) {
    if (shuttingDown) break;
    await attachAndInject(page);
  }
}

function startWatchers() {
  const srcDir = path.join(PLUGIN_ROOT, 'src');
  if (!fs.existsSync(srcDir)) return;
  try {
    const w = fs.watch(srcDir, { recursive: true }, () => {
      if (shuttingDown) return;
      clearTimeout(reloadDebounce);
      reloadDebounce = setTimeout(() => {
        try {
          currentBundle = buildInjectBundle(PLUGIN_ROOT);
          void scanOnce();
        } catch (err) {
          log(`[warn] Bundle rebuild error: ${err?.message || err}`);
        }
      }, 250);
    });
    watchers.push(w);
  } catch {}
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[shutdown] Received ${signal}, cleaning up...`);
  if (scanTimer) clearInterval(scanTimer);
  if (reloadDebounce) clearTimeout(reloadDebounce);
  for (const w of watchers) {
    try {
      w.close();
    } catch {}
  }

  const cleanupTasks = [];
  for (const entry of attached.values()) {
    if (entry.session.closed) continue;
    cleanupTasks.push(
      (async () => {
        try {
          if (entry.scriptId) {
            await entry.session.send(
              'Page.removeScriptToEvaluateOnNewDocument',
              { identifier: entry.scriptId },
              1500
            );
          }
          await entry.session.send(
            'Runtime.evaluate',
            { expression: REMOVE_EXPRESSION, returnByValue: false },
            1500
          );
        } catch {}
        entry.session.close();
      })()
    );
  }
  await Promise.allSettled(cleanupTasks);
  attached.clear();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err) => {
    if (err?.code === 'EPIPE') process.exit(0);
  });
}

log(`[boot] AGY Quota Card sidecar started (bundle=${currentBundle.hash})`);
startWatchers();
void scanOnce();
scanTimer = setInterval(() => void scanOnce(), POLL_INTERVAL_MS);
