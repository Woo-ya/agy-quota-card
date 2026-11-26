// One-shot manual injection into all eligible running Antigravity windows.

import {
  PLUGIN_ROOT,
  RPC_BINDING,
  readCdpPort,
  listEligiblePages,
  CdpSession,
  buildInjectBundle,
} from '../sidecars/quota_card/cdp-client.mjs';

const port = readCdpPort();
if (!port) {
  console.error('[error] DevToolsActivePort not found. Start Antigravity first.');
  process.exit(1);
}

const pages = await listEligiblePages(port);
if (!pages.length) {
  console.error('[error] No eligible Antigravity window found.');
  process.exit(1);
}

const bundle = buildInjectBundle(PLUGIN_ROOT);
for (const page of pages) {
  const session = await CdpSession.connect(page.webSocketDebuggerUrl);
  try {
    await session.send('Runtime.enable');
    await session.send('Runtime.addBinding', { name: RPC_BINDING });
    await session.send('Runtime.evaluate', { expression: bundle.source, returnByValue: false });
    console.log(`[ok] Injected AGY Quota Card into: ${page.title || page.url}`);
  } finally {
    session.close();
  }
}
