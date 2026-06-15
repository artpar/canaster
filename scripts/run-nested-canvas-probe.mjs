import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromePath = process.env.CANWAY_CHROME_PATH || process.env.CHROME_PATH || defaultChromePath;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`);
}

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const output = [];
  child.stdout?.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr?.on('data', (chunk) => output.push(chunk.toString()));
  child.on('error', (error) => output.push(`${error.stack ?? error}\n`));
  child.output = output;
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) =>
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        resolve();
      }, 3000),
    ),
  ]);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.ws = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, timeout } = this.pending.get(message.id);
        clearTimeout(timeout);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
        else resolve(message.result);
        return;
      }
      if (message.method) this.events.push(message);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 30000);
      timeout.unref();
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  close() {
    this.ws.close();
  }
}

function summarizeBrowserEvents(events) {
  return events
    .filter((event) => ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded', 'Network.loadingFailed'].includes(event.method))
    .map((event) => {
      if (event.method === 'Runtime.consoleAPICalled') return { method: event.method, type: event.params.type, text: event.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') };
      if (event.method === 'Runtime.exceptionThrown') return { method: event.method, text: event.params.exceptionDetails?.text ?? event.params.exceptionDetails?.exception?.description ?? '' };
      if (event.method === 'Log.entryAdded') return { method: event.method, level: event.params.entry?.level, text: event.params.entry?.text };
      return { method: event.method, errorText: event.params.errorText, url: event.params.request?.url };
    });
}

function assertProbe(result, browserEvents) {
  assert(result.schema.collection === 1, 'document collection schemaVersion mismatch');
  assert(result.schema.modelVersions.every((version) => version === 2), 'canvas model schemaVersion mismatch');
  assert(result.appPortal.type === 'canvas', 'portal node type mismatch');
  assert(result.appPortal.dataKeys.includes('childCanvasId') && result.appPortal.dataKeys.includes('nodeCount'), 'portal data not normalized');
  assert(result.preview.mounted, 'live child preview canvas missing');
  assert(result.preview.update.total === '1', 'preview canvas did not reflect child model update');
  assert(result.preview.pointerDidNotEnter, 'single pointer preview activation entered child canvas');
  assert(result.preview.doubleClickEntered, 'double click did not enter child canvas');
  assert(result.preview.contextPlaneAfterEnter >= 1, 'context parent plane missing after enter');
  assert(result.parentReturn.activeCanvasId === 'root', 'parent navigation did not return to root');
  assert(result.parentReturn.selectedNodeId === 'planning-canvas', `return to parent did not select portal node: ${result.parentReturn.selectedNodeId}`);
  assert(result.isolation.childMoved, 'active child model did not move');
  assert(result.isolation.parentStableAfterChildMove, 'child edit mutated parent portal geometry');
  assert(result.isolation.parentMoved, 'parent portal did not move after returning');
  assert(result.isolation.childStableAfterParentMove, 'parent edit mutated child model');
  assert(result.parentContext.regions.length === 8, `parent context field did not render all eight regions: ${result.parentContext.regions.join(',')}`);
  assert(result.parentContext.shapeCount === 8, `parent context field must render one nearest shape per pane: ${result.parentContext.shapeCount}`);
  assert(!result.parentContext.nodeIds.includes('neighbor-top-far') && !result.parentContext.nodeIds.includes('portal-right-far'), `parent context did not choose nearest candidates per pane: ${result.parentContext.nodeIds.join(',')}`);
  assert(Object.values(result.parentContext.cardinalPaneFill).every(Boolean), `cardinal parent context canvases do not fill their pane viewports: ${JSON.stringify({ fill: result.parentContext.cardinalPaneFill, rects: result.parentContext.clipRects })}`);
  assert(result.parentContext.legacyFloatingCardCount === 0, 'old floating sibling card DOM is still rendered');
  assert(result.parentContext.textContent === '', 'parent context field rendered visible text labels');
  assert(result.parentContext.liveCanvasCount === result.parentContext.shapeCount, `parent context field did not mount real canvases for every projected shape: ${result.parentContext.liveCanvasCount}/${result.parentContext.shapeCount}`);
  assert(result.parentContext.liveShapeCount === result.parentContext.shapeCount, `parent context hit shapes are not all backed by live canvases: ${result.parentContext.liveShapeCount}/${result.parentContext.shapeCount}`);
  assert(result.parentContext.canvasModels.includes('child'), 'parent context did not render sibling child canvas content');
  assert(result.parentContext.canvasModels.includes('snippet'), 'parent context did not render parent-node snippet canvases');
  assert(result.parentContext.emptyCanvases.length === 0, `parent context rendered empty canvas boxes: ${JSON.stringify(result.parentContext.emptyCanvases)}`);
  assert(result.parentContext.rightCanvasRendered === '1' && result.parentContext.rightCanvasTotal === '1', 'projected sibling canvas did not render real child canvas content');
  assert(result.parentContext.portalActivationCanvas === 'right-child', 'projected portal activation did not move sideways into sibling child canvas');
  assert(result.parentContext.nonPortalActivationCanvas === 'root', 'projected non-portal activation did not return to parent');
  assert(result.parentContext.nonPortalSelection === 'neighbor-top', 'projected non-portal activation did not select clicked node');
  assert(JSON.stringify(Object.values(result.parentContext.buckets)) === JSON.stringify(['right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left', 'top', 'top-right']), 'parent context angle buckets mismatch');
  assert(result.paste.childCanvasId === null && result.paste.nodeCount === 0 && result.paste.title.endsWith(' copy'), 'portal paste did not strip child reference');
  assert(result.deletePortal.modalOpen, 'portal delete did not open confirmation');
  assert(result.deletePortal.blockedBeforeConfirmation, 'delete removed child before confirmation');
  assert(result.deletePortal.cancelPreservedChild, 'cancel delete did not preserve child');
  assert(result.deletePortal.confirmRemovedPortal, 'confirm delete did not remove portal');
  assert(result.deletePortal.confirmRemovedChild, 'confirm delete did not remove child document');
  assert(result.performance.engineCount <= 11, `mounted engine count exceeded cap: ${result.performance.engineCount}`);

  const severeBrowserEvents = browserEvents.filter((event) => {
    if (event.method === 'Network.loadingFailed' && event.errorText === 'net::ERR_ABORTED') return false;
    if (event.method === 'Log.entryAdded' && event.level === 'warning') return false;
    if (event.method === 'Runtime.consoleAPICalled' && ['debug', 'info', 'log'].includes(event.type)) return false;
    return true;
  });
  assert(severeBrowserEvents.length === 0, `browser console/network events found: ${JSON.stringify(severeBrowserEvents)}`);
}

async function main() {
  assert(await fileExists(chromePath), `Chrome not found at ${chromePath}. Set CANWAY_CHROME_PATH or CHROME_PATH to a compatible Chrome/Chromium binary.`);

  const vitePort = await freePort();
  const chromePort = await freePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'canway-nested-cdp-'));
  let devServer;
  let chrome;
  let cdp;

  try {
    const appUrl = `http://127.0.0.1:${vitePort}/`;
    devServer = spawnProcess('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort']);
    await waitForHttp(appUrl);

    chrome = spawnProcess(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${chromePort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      appUrl,
    ]);
    await waitForHttp(`http://127.0.0.1:${chromePort}/json/version`);
    const targets = await (await waitForHttp(`http://127.0.0.1:${chromePort}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page' && target.url.startsWith(appUrl)) ?? targets.find((target) => target.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No debuggable Chrome page found');

    cdp = new CdpClient(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');
    await cdp.send('Runtime.evaluate', {
      expression: 'new Promise((resolve) => { if (document.readyState === "complete") resolve(); else window.addEventListener("load", resolve, { once: true }); })',
      awaitPromise: true,
    });

    const evaluation = await cdp.send('Runtime.evaluate', {
      expression: "(async () => { const probe = await import('/docs/nested-canvas-devtools-probe.js'); return await probe.runCanwayNestedProbe(); })()",
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text);

    const result = evaluation.result.value;
    const browserEvents = summarizeBrowserEvents(cdp.events);
    assertProbe(result, browserEvents);
    console.log(JSON.stringify({ appUrl, browserEvents, result }, null, 2));
    console.log('Nested canvas probe passed');
  } catch (error) {
    console.error('Nested canvas probe failed');
    console.error(error.stack ?? error);
    if (devServer?.output?.length) console.error(`\nVite output:\n${devServer.output.join('')}`);
    if (chrome?.output?.length) console.error(`\nChrome output:\n${chrome.output.join('')}`);
    process.exitCode = 1;
  } finally {
    cdp?.close();
    await stopProcess(chrome);
    await stopProcess(devServer);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

await main();
