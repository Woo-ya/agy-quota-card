// Install AGY Quota Card into ~/.gemini/config/plugins/agy-quota-card
// and optionally inject immediately into running Antigravity windows.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'agy-quota-card');

const COPY_ITEMS = ['plugin.json', 'package.json', 'README.md', 'LICENSE', 'assets', 'src', 'sidecars', 'scripts', 'tests'];

fs.mkdirSync(TARGET_DIR, { recursive: true });

for (const item of COPY_ITEMS) {
  const srcPath = path.join(REPO_ROOT, item);
  if (!fs.existsSync(srcPath)) continue;
  const dstPath = path.join(TARGET_DIR, item);
  fs.cpSync(srcPath, dstPath, { recursive: true, force: true });
}

console.log(`[ok] Installed plugin to: ${TARGET_DIR}`);

// If a previous sidecar daemon recorded its PID, stop it so Antigravity respawns
// it with the newly deployed sidecar code.
const pidFile = path.join(TARGET_DIR, '.daemon.pid');
try {
  if (fs.existsSync(pidFile)) {
    const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (Number.isInteger(oldPid) && oldPid > 0 && oldPid !== process.pid) {
      process.kill(oldPid);
      console.log(`[ok] Signaled previous sidecar (pid=${oldPid}) to restart.`);
    }
  }
} catch {}

if (!process.argv.includes('--no-inject')) {
  try {
    execFileSync(process.execPath, [path.join(TARGET_DIR, 'scripts', 'inject.mjs')], {
      stdio: 'inherit',
    });
  } catch {
    console.log('[info] Antigravity window not active or DevTools port unavailable; Sidecar will auto-attach when Antigravity runs.');
  }
}
