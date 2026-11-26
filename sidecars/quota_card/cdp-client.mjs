// AGY Quota Card — Zero-Dependency CDP Client & Bundle Compiler (cdp-client.mjs)
// Requires Node >= 22 (built-in fetch & WebSocket).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
export const RPC_BINDING = '__agQcRpcCall';

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const APP_DATA = IS_MAC
  ? path.join(os.homedir(), 'Library', 'Application Support')
  : IS_WIN
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');

export const PORT_FILE = path.join(APP_DATA, 'Antigravity', 'DevToolsActivePort');

export function readCdpPort() {
  if (process.env.AG_CDP_PORT) {
    const p = parseInt(process.env.AG_CDP_PORT, 10);
    return Number.isInteger(p) && p > 0 ? p : null;
  }
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf8');
    const port = parseInt(raw.split(/\r?\n/)[0].trim(), 10);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

export function isEligibleTarget(target) {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = String(target.url || '').trim();
  const title = String(target.title || '').trim();
  if (!url) return false;
  const lowUrl = url.toLowerCase();
  if (
    lowUrl.startsWith('devtools://') ||
    lowUrl.startsWith('data:') ||
    lowUrl.startsWith('about:') ||
    lowUrl.startsWith('chrome:') ||
    lowUrl.startsWith('chrome-extension:') ||
    lowUrl.startsWith('edge:') ||
    lowUrl.startsWith('blob:') ||
    lowUrl.startsWith('plugin:')
  ) {
    return false;
  }
  if (/^(?:untitled|launchpad)$/i.test(title) || /\/launchpad(?:\.html)?(?:[?#]|$)/i.test(lowUrl)) {
    return false;
  }
  if (lowUrl.startsWith('vscode-file://') || lowUrl.startsWith('app://')) {
    return true;
  }
  if (lowUrl.startsWith('file://')) {
    return /workbench|antigravity/i.test(lowUrl) || /\bantigravity\b/i.test(title);
  }
  const m = /^(https?):\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(\/[^?#]*)?(?:[?#]|$)/i.exec(url);
  if (!m) return false;
  const pathname = (m[3] || '/').toLowerCase();
  if (/^\/(?:viewer(?:\/|$)|sandbox(?:\/|$)|stream(?:\/|$)|api(?:\/|$))/.test(pathname)) {
    return false;
  }
  if (/\bantigravity\b/i.test(title)) return true;
  if (m[1].toLowerCase() === 'https' && (!title || /^127\.0\.0\.1(?::\d+)?/.test(title))) {
    return true;
  }
  return false;
}

export async function listEligiblePages(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) return [];
  const targets = await res.json();
  return Array.isArray(targets) ? targets.filter(isEligibleTarget) : [];
}

export class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.onClose = null;
    this.listeners = new Map();

    ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.method) {
        for (const cb of this.listeners.get(msg.method) || []) {
          try {
            cb(msg.params);
          } catch {}
        }
        return;
      }
      const p = msg.id && this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    });

    const markClosed = () => {
      if (this.closed) return;
      this.closed = true;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('CDP session closed'));
      }
      this.pending.clear();
      if (typeof this.onClose === 'function') this.onClose();
    };

    ws.addEventListener('close', markClosed);
    ws.addEventListener('error', markClosed);
  }

  static connect(wsUrl, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new Error('CDP WebSocket connect timeout'));
      }, timeoutMs);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new CdpSession(ws));
      });
      ws.addEventListener('error', (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('CDP WebSocket error'));
      });
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(cb);
  }

  send(method, params = {}, timeoutMs = 8000) {
    if (this.closed) return Promise.reject(new Error('CDP session closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.closed) return;
    try {
      this.ws.close();
    } catch {}
  }
}

export function serializeJsonForEval(val) {
  const raw = JSON.stringify(val === undefined ? null : val);
  return String(raw).replace(/[<>/\u2028\u2029]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

const BUNDLE_JS_FILES = [
  'src/core/quota-card-core.js',
  'src/modules/quota-card-ui.js',
  'src/runtime.js',
];

export function buildInjectBundle(pluginRoot = PLUGIN_ROOT) {
  const cssPath = path.join(pluginRoot, 'src', 'style.css');
  const cssText = fs.readFileSync(cssPath, 'utf8');
  const jsParts = BUNDLE_JS_FILES.map((rel) => {
    const abs = path.join(pluginRoot, rel);
    return `// === ${rel} ===\n${fs.readFileSync(abs, 'utf8')}`;
  });

  const combined = jsParts.join('\n\n');
  const hash = crypto
    .createHash('sha256')
    .update(cssText)
    .update('\0')
    .update(combined)
    .digest('hex')
    .slice(0, 16);

  const source = `(function () {
  'use strict';
  try {
    var existing = window.__agQuotaCardInst;
    if (existing && existing.hash === ${serializeJsonForEval(hash)}) {
      existing.sync && existing.sync();
      return;
    }
    if (existing && typeof existing.destroy === 'function') {
      existing.destroy();
    }
  } catch (e) {}

  ${combined}

  try {
    var css = ${serializeJsonForEval(cssText)};
    var rt = window.__agQcRuntime;
    if (rt && typeof rt.mountQuotaCardRuntime === 'function') {
      var inst = rt.mountQuotaCardRuntime({
        doc: document,
        win: window,
        cssText: css,
        rpcBinding: ${serializeJsonForEval(RPC_BINDING)},
        hash: ${serializeJsonForEval(hash)},
      });
      window.__agQuotaCardInst = inst;
    }
  } catch (e) {
    try { console.error('[agy-quota-card] mount failed:', e); } catch (_) {}
  }
})();`;

  return { hash, source };
}

export const REMOVE_EXPRESSION = `(function () {
  try {
    if (window.__agQuotaCardInst && typeof window.__agQuotaCardInst.destroy === 'function') {
      window.__agQuotaCardInst.destroy();
    }
    delete window.__agQuotaCardInst;
  } catch (e) {}
  try {
    var st = document.getElementById('ag-qc-style');
    if (st) st.remove();
    document.querySelectorAll('.ag-qc-card, .ag-qc-popover, .ag-qc-modal-backdrop').forEach(function (n) { n.remove(); });
    document.documentElement.removeAttribute('data-ag-qc-version');
  } catch (e) {}
})();`;
