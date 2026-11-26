// Uninstall AGY Quota Card from ~/.gemini/config/plugins/agy-quota-card

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'agy-quota-card');

try {
  execFileSync(process.execPath, [path.join(__dirname, 'remove.mjs')], { stdio: 'inherit' });
} catch {}

if (fs.existsSync(TARGET_DIR)) {
  fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  console.log(`[ok] Removed plugin directory: ${TARGET_DIR}`);
} else {
  console.log('[info] Plugin directory not present.');
}
