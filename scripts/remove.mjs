// One-shot manual removal from all running Antigravity windows.

import {
  readCdpPort,
  listEligiblePages,
  CdpSession,
  REMOVE_EXPRESSION,
} from '../sidecars/quota_card/cdp-client.mjs';

const port = readCdpPort();
if (!port) {
  console.log('[info] DevToolsActivePort not found.');
  process.exit(0);
}

const pages = await listEligiblePages(port);
for (const page of pages) {
  const session = await CdpSession.connect(page.webSocketDebuggerUrl);
  try {
    await session.send('Runtime.evaluate', { expression: REMOVE_EXPRESSION, returnByValue: false });
    console.log(`[ok] Removed AGY Quota Card from: ${page.title || page.url}`);
  } finally {
    session.close();
  }
}
