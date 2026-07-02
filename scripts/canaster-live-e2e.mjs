#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const daptinImage = process.env.DAPTIN_LIVE_E2E_IMAGE || 'daptin/daptin:v0.12.27';
const keepRuntime = process.env.DAPTIN_LIVE_E2E_KEEP === 'true';
const starterRaw = JSON.parse(await readFile('src/catalog/service-business-atlas.json', 'utf8'));

let daptinContainer = '';
let daptinDataDir = '';
let vite;
let chrome;
let chromeDataDir = '';
let token = '';
let cdpWs;
const createdDocuments = [];

try {
  const daptinPort = await freePort();
  const vitePort = await freePort();
  const cdpPort = await freePort();
  const endpoint = `http://127.0.0.1:${daptinPort}`;
  const appUrl = `http://localhost:${vitePort}/`;

  await startDaptin(daptinPort);
  vite = spawnProcess('npm', ['run', 'dev', '--', '--port', String(vitePort)], {
    env: {
      ...process.env,
      VITE_DAPTIN_ENDPOINT: endpoint,
    },
  });
  await waitForHttp(appUrl, 30_000);

  await runCleanReloadCase({ endpoint, appUrl, cdpPort });
  await runDirtyConflictCase({ endpoint, appUrl, cdpPort: await freePort() });

  console.log('Canaster /live E2E passed');
} finally {
  await cleanupDocuments().catch((error) => console.error(`document cleanup failed: ${error.message}`));
  if (cdpWs) cdpWs.close();
  if (chrome) {
    chrome.kill('SIGTERM');
    await delay(500);
  }
  if (chromeDataDir) await rm(chromeDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  if (vite) await stopProcess(vite);
  if (!keepRuntime && daptinContainer) await run('docker', ['rm', '-f', daptinContainer]).catch(() => {});
  if (!keepRuntime && daptinDataDir) await rm(daptinDataDir, { recursive: true, force: true }).catch(() => {});
}

async function runCleanReloadCase({ endpoint, appUrl, cdpPort }) {
  const now = Date.now();
  const initialTitle = `Initial ${now}`;
  const updatedTitle = `Updated ${now}`;
  const documentRef = await createSignedInDocument(endpoint, initialTitle, now);
  const browser = await openSignedInBrowser({ appUrl, cdpPort, documentRef });

  await assertBrowserValue(browser.sessionId, `document.querySelector('input[name="document-title"]')?.value === ${JSON.stringify(initialTitle)}`, 'initial title did not load');
  await assertBrowserValue(browser.sessionId, `(window.__canasterLiveE2E?.sockets?.some((url) => url.includes('/live?token=')) || false)`, 'app did not open /live websocket');
  await assertBrowserValue(browser.sessionId, `window.__canasterLiveE2E?.messages?.some((message) => {
    try {
      const parsed = JSON.parse(message);
      return parsed.type === 'response' && parsed.method === 'subscribe' && parsed.ok === true;
    } catch {
      return false;
    }
  }) || false`, 'app did not subscribe to document topic');

  await patchDocument(endpoint, documentRef, updatedTitle, now);
  await assertBrowserValue(browser.sessionId, `document.querySelector('input[name="document-title"]')?.value === ${JSON.stringify(updatedTitle)}`, 'clean document did not reload after external update');
}

async function runDirtyConflictCase({ endpoint, appUrl, cdpPort }) {
  const now = Date.now();
  const initialTitle = `Dirty Initial ${now}`;
  const localTitle = `Dirty Local ${now}`;
  const remoteTitle = `Dirty Remote ${now}`;
  const documentRef = await createSignedInDocument(endpoint, initialTitle, now);
  const browser = await openSignedInBrowser({ appUrl, cdpPort, documentRef });

  await assertBrowserValue(browser.sessionId, `document.querySelector('input[name="document-title"]')?.value === ${JSON.stringify(initialTitle)}`, 'dirty case initial title did not load');
  await cdp('Runtime.evaluate', {
    expression: `
      (() => {
        const input = document.querySelector('input[name="document-title"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(localTitle)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `,
    awaitPromise: true,
  }, browser.sessionId);
  await assertBrowserValue(browser.sessionId, `document.querySelector('input[name="document-title"]')?.value === ${JSON.stringify(localTitle)}`, 'local title edit did not apply');

  await patchDocument(endpoint, documentRef, remoteTitle, now);
  await assertBrowserValue(browser.sessionId, `document.querySelector('input[name="document-title"]')?.value === ${JSON.stringify(localTitle)}`, 'dirty local title was overwritten by external update', 4_000, false);
  await assertBrowserValue(browser.sessionId, `document.body.innerText.includes('Online copy changed elsewhere')`, 'dirty conflict warning was not shown');
}

async function startDaptin(port) {
  daptinContainer = `canaster-live-e2e-${Date.now()}`;
  daptinDataDir = await mkdtemp(path.join(os.tmpdir(), 'canaster-live-e2e-daptin-'));
  await run('docker', [
    'run',
    '-d',
    '--name', daptinContainer,
    '-p', `127.0.0.1:${port}:8080`,
    '-v', `${daptinDataDir}:/data`,
    '--entrypoint', '/opt/daptin/daptin',
    daptinImage,
    '-port', ':8080',
    '-db_type', 'sqlite3',
    '-db_connection_string', '/data/canaster.db',
    '-local_storage_path', '/data/storage',
  ]);
  await waitForHttp(`http://127.0.0.1:${port}/api/world?page%5Bsize%5D=1`, 60_000);
}

async function createSignedInDocument(endpoint, title, unique) {
  const email = `canaster-live-e2e-${unique}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = `Canaster${unique}!`;
  await action(endpoint, '/action/user_account/signup', { email, name: 'Canaster Live E2E', password, passwordConfirm: password });
  token = extractToken(await action(endpoint, '/action/user_account/signin', { email, password }));
  if (!token) throw new Error('Daptin signin did not return a JWT');
  const created = await api(endpoint, '/api/document', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'document',
        attributes: documentAttributes(title, unique),
      },
    }),
  });
  const documentRef = String(created?.data?.id || '');
  if (!documentRef) throw new Error('Daptin document create did not return an id');
  createdDocuments.push({ endpoint, documentRef });
  return documentRef;
}

async function patchDocument(endpoint, documentRef, title, unique) {
  await api(endpoint, `/api/document/${documentRef}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'document',
        id: documentRef,
        attributes: documentAttributes(title, unique),
      },
    }),
  });
}

function documentAttributes(title, unique) {
  return {
    document_name: `${title}.canaster.json`,
    document_path: `/canaster/documents/e2e-${unique}.canaster.json`,
    document_extension: 'json',
    mime_type: 'application/json',
    document_content: encodeContent(title),
  };
}

function encodeContent(title) {
  const collection = structuredClone(starterRaw.collection);
  const root = collection.rootCanvasId;
  collection.documents[root].title = title;
  const snapshot = {
    schemaVersion: 1,
    history: { present: collection, undoStack: [], redoStack: [] },
    lastModelChange: null,
  };
  const payload = Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64');
  return JSON.stringify([{ name: `${title}.canaster.json`, file: `data:application/json;base64,${payload}`, type: 'application/json' }]);
}

async function openSignedInBrowser({ appUrl, cdpPort, documentRef }) {
  if (chrome) {
    chrome.kill('SIGTERM');
    await delay(500);
  }
  if (chromeDataDir) await rm(chromeDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  if (cdpWs) cdpWs.close();
  cdpWs = null;
  cdp.seq = 0;
  cdp.pending = new Map();

  chromeDataDir = await mkdtemp(path.join(os.tmpdir(), 'canaster-live-e2e-chrome-'));
  chrome = spawnProcess(chromePath(), [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${chromeDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    'about:blank',
  ]);
  await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, 20_000);
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  cdpWs = await wsConnect(targets[0].webSocketDebuggerUrl);
  cdpWs.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !cdp.pending.has(message.id)) return;
    const pending = cdp.pending.get(message.id);
    cdp.pending.delete(message.id);
    message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message);
  });

  const { result: { targetId } } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Page.enable', {}, sessionId);
  await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      localStorage.setItem('canaster:daptin:token', ${JSON.stringify(token)});
      localStorage.setItem('canaster:daptin:active-document', ${JSON.stringify(documentRef)});
      window.__canasterLiveE2E = { sockets: [], messages: [] };
      const NativeWebSocket = window.WebSocket;
      window.WebSocket = function(url, protocols) {
        const ws = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
        if (String(url).includes('/live')) {
          window.__canasterLiveE2E.sockets.push(String(url));
          ws.addEventListener('message', (event) => window.__canasterLiveE2E.messages.push(String(event.data)));
        }
        return ws;
      };
      window.WebSocket.prototype = NativeWebSocket.prototype;
      for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Object.defineProperty(window.WebSocket, key, { value: NativeWebSocket[key] });
    `,
  }, sessionId);
  await cdp('Page.navigate', { url: appUrl }, sessionId);
  return { sessionId };
}

async function action(endpoint, pathname, attributes) {
  const response = await fetch(`${endpoint}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attributes }),
  });
  const body = await parseResponse(response);
  if (!response.ok) throw new Error(`${pathname} failed with ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

async function api(endpoint, pathname, init = {}) {
  const response = await fetch(`${endpoint}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/vnd.api+json' } : {}),
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const body = await parseResponse(response);
  if (!response.ok) throw new Error(`${pathname} failed with ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function cleanupDocuments() {
  for (const { endpoint, documentRef } of createdDocuments.reverse()) {
    await api(endpoint, `/api/document/${documentRef}`, { method: 'DELETE' }).catch(() => {});
  }
}

async function assertBrowserValue(sessionId, expression, message, timeoutMs = 15_000, failWithState = true) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (response.result.result.value) return;
    await delay(250);
  }
  if (failWithState) {
    const state = await cdp('Runtime.evaluate', {
      expression: `({
        title: document.querySelector('input[name="document-title"]')?.value || '',
        text: document.body.innerText.slice(0, 800),
        live: window.__canasterLiveE2E ? {
          socketCount: window.__canasterLiveE2E.sockets.length,
          messageCount: window.__canasterLiveE2E.messages.length,
          messages: window.__canasterLiveE2E.messages.map((message) => {
            try {
              const parsed = JSON.parse(message);
              return { type: parsed.type, method: parsed.method, ok: parsed.ok, topic: parsed.topic, event: parsed.event };
            } catch {
              return { raw: String(message).slice(0, 120) };
            }
          }),
        } : null,
      })`,
      returnByValue: true,
    }, sessionId).catch(() => null);
    throw new Error(`${message}: ${JSON.stringify(state?.result?.result?.value || null)}`);
  }
  throw new Error(message);
}

async function cdp(method, params = {}, sessionId) {
  const id = ++cdp.seq;
  cdpWs.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => {
    cdp.pending.set(id, { resolve, reject });
    setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10_000).unref();
  });
}
cdp.seq = 0;
cdp.pending = new Map();

function extractToken(response) {
  return JSON.stringify(response).match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/)?.[0] || '';
}

function chromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome/Chromium not found. Set CHROME_BIN to run this E2E.');
  return found;
}

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('Could not allocate port')));
    });
    server.on('error', reject);
  });
}

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.env.DAPTIN_LIVE_E2E_VERBOSE === 'true' && process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.env.DAPTIN_LIVE_E2E_VERBOSE === 'true' && process.stderr.write(chunk));
  return child;
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000).then(() => child.kill('SIGKILL')),
  ]);
}

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with ${code}: ${stderr.slice(0, 1000)}`));
    });
  });
}
