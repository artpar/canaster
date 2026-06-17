import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const appUrl = process.env.CANWAY_PROFILE_URL || 'http://127.0.0.1:5175/';
const fixturePath = process.env.CANWAY_PROFILE_FIXTURE || 'docs/fixtures/nested-3x3-4-level-workspace.json';
const fixtureUrl = process.env.CANWAY_PROFILE_FIXTURE_URL || `/${fixturePath}`;
const chromePath = process.env.CANWAY_CHROME_PATH || process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const timeoutMs = Number(process.env.CANWAY_PROFILE_TIMEOUT_MS || 20000);
const outputDir = path.resolve(process.env.CANWAY_PROFILE_OUTPUT_DIR || '.tmp/profiles');
const waitForFrames = process.env.CANWAY_PROFILE_WAIT_FRAMES !== '0';
const startJsProfiler = process.env.CANWAY_PROFILE_JS_PROFILER !== '0';
const useProfileLoadPath = process.env.CANWAY_PROFILE_LOAD_PATH !== 'normal';
const collectTrace = process.env.CANWAY_PROFILE_TRACE !== '0';
const traceAfterLoadMs = Number(process.env.CANWAY_PROFILE_TRACE_AFTER_MS || 3000);
const runInteractions = process.env.CANWAY_PROFILE_INTERACTIONS !== '0';
const traceCategories = [
  'devtools.timeline',
  'v8',
  'v8.execute',
  'blink',
  'blink.user_timing',
  'toplevel',
  'disabled-by-default-v8.cpu_profiler',
  'disabled-by-default-v8.cpu_profiler.hires',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.stack',
  'disabled-by-default-memory-infra',
].join(',');

function log(message, data = {}) {
  const suffix = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
  console.log(`[profile ${new Date().toISOString()}] ${message}${suffix}`);
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

async function waitForHttp(url, timeout = 30000) {
  const deadline = Date.now() + timeout;
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
      }, 2000),
    ),
  ]);
}

function execCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('close', (code) => resolve({ code, output: Buffer.concat(chunks).toString() }));
    child.on('error', (error) => resolve({ code: -1, output: `${error.stack ?? error}\n` }));
  });
}

class CdpClient {
  constructor(webSocketUrl) {
    this.ws = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method) {
        const waiters = this.eventWaiters?.get(message.method) ?? [];
        this.eventWaiters?.delete(message.method);
        for (const waiter of waiters) {
          clearTimeout(waiter.timeout);
          waiter.resolve(message.params);
        }
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, timeout } = this.pending.get(message.id);
        clearTimeout(timeout);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
        else resolve(message.result);
      }
    });
  }

  async send(method, params = {}, timeoutMsForCommand = 30000) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMsForCommand);
      timeout.unref();
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  close() {
    this.ws.close();
  }

  async waitForEvent(method, timeoutMsForEvent = 30000) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) ?? [];
        this.eventWaiters.set(method, waiters.filter((waiter) => waiter.resolve !== resolve));
        reject(new Error(`CDP event timed out: ${method}`));
      }, timeoutMsForEvent);
      timeout.unref();
      const waiters = this.eventWaiters.get(method) ?? [];
      waiters.push({ resolve, reject, timeout });
      this.eventWaiters.set(method, waiters);
    });
  }
}

async function readCdpStream(cdp, handle) {
  const chunks = [];
  while (true) {
    const result = await cdp.send('IO.read', { handle }, 10000);
    chunks.push(result.base64Encoded ? Buffer.from(result.data, 'base64').toString('utf8') : result.data);
    if (result.eof) break;
  }
  await cdp.send('IO.close', { handle }, 10000).catch(() => undefined);
  return chunks.join('');
}

async function rendererPidForChrome(chromePid) {
  const { output } = await execCapture('ps', ['-Ao', 'pid,ppid,pcpu,rss,command']);
  const rows = output
    .split('\n')
    .filter((line) => line.includes('Google Chrome Helper (Renderer)') && line.includes(` ${chromePid} `))
    .map((line) => {
      const parts = line.trim().split(/\s+/, 5);
      return { pid: Number(parts[0]), ppid: Number(parts[1]), cpu: Number(parts[2]), rss: Number(parts[3]), line };
    })
    .filter((row) => Number.isFinite(row.pid));
  rows.sort((a, b) => b.cpu - a.cpu || b.rss - a.rss);
  return rows[0] ?? null;
}

async function main() {
  if (!(await fileExists(chromePath))) throw new Error(`Chrome not found at ${chromePath}`);
  log('reading fixture', { fixturePath });
  const rawFixture = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(rawFixture);
  log('fixture ready', { bytes: rawFixture.length, metadata: fixture.metadata });
  log('waiting for app', { appUrl });
  await waitForHttp(appUrl);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const chromePort = await freePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'canway-profile-chrome-'));
  log('starting chrome', { chromePort, waitForFrames, timeoutMs });
  const chrome = spawnProcess(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${chromePort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    appUrl,
  ]);

  let cdp;
  try {
    await waitForHttp(`http://127.0.0.1:${chromePort}/json/version`);
    log('chrome remote debugging ready', { chromePid: chrome.pid });
    const targets = await (await waitForHttp(`http://127.0.0.1:${chromePort}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page' && target.url.startsWith(appUrl)) ?? targets.find((target) => target.type === 'page');
    if (!page?.webSocketDebuggerUrl) throw new Error('No debuggable Chrome page found');
    cdp = new CdpClient(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Profiler.enable');
    await cdp.send('HeapProfiler.enable');
    log('waiting for page load');
    await cdp.send('Runtime.evaluate', {
      expression: 'new Promise((resolve) => { if (document.readyState === "complete") resolve(true); else window.addEventListener("load", () => resolve(true), { once: true }); })',
      awaitPromise: true,
      returnByValue: true,
    });

    if (startJsProfiler) {
      await cdp.send('Profiler.start');
      log('started JS profiler');
    } else {
      log('skipping JS profiler');
    }
    let traceStatus = 'not-collected';
    let traceCompletePromise = null;
    if (collectTrace) {
      log('starting Chrome trace', { traceCategories, traceAfterLoadMs });
      traceCompletePromise = cdp.waitForEvent('Tracing.tracingComplete', 30000);
      await cdp.send('Tracing.start', {
        transferMode: 'ReturnAsStream',
        traceConfig: {
          includedCategories: traceCategories.split(','),
          enableSampling: true,
          memoryDumpConfig: {},
        },
      }, 10000);
      traceStatus = 'started';
    }
    const startedAt = Date.now();
    let loadResult = null;
    let loadError = null;
    try {
      loadResult = await cdp.send('Runtime.evaluate', {
        expression: `((async () => {
          window.__canwayProfileLog = [];
          window.__CANWAY_DEBUG_CANVAS = true;
          const mark = (name, data = {}) => {
            const entry = { name, at: Math.round(performance.now()), ...data };
            window.__canwayProfileLog.push(entry);
            performance.mark('canway:' + name, { detail: data });
            console.log('[canway-profile]', JSON.stringify(entry));
          };
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          mark('wait-api:start');
          for (let i = 0; i < 100; i += 1) {
            if (window.__canwayNested?.replaceCollection) break;
            await wait(50);
          }
          if (!window.__canwayNested?.replaceCollection) throw new Error('Canway debug API unavailable');
          mark('wait-api:done');
          mark('fetch:start', { url: ${JSON.stringify(fixtureUrl)} });
          const response = await fetch(${JSON.stringify(fixtureUrl)});
          if (!response.ok) throw new Error('Fixture fetch failed: ' + response.status);
          const fetchedAt = performance.now();
          mark('fetch:done');
          mark('json:start');
          const fixture = await response.json();
          const parsedAt = performance.now();
          mark('json:done', { documents: Object.keys(fixture.collection.documents).length });
          const replace = ${JSON.stringify(useProfileLoadPath)}
            ? (window.__canwayNested.replaceCollectionForProfile ?? window.__canwayNested.replaceCollection)
            : window.__canwayNested.replaceCollection;
          mark('replace:start', { profilePath: ${JSON.stringify(useProfileLoadPath)} });
          replace(fixture.collection);
          const replacedAt = performance.now();
          mark('replace:done');
          if (${JSON.stringify(waitForFrames)}) {
            mark('raf:start');
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            mark('raf:done');
          }
          const settledAt = performance.now();
          mark('get-collection:start');
          const collection = window.__canwayNested.getCollection();
          mark('get-collection:done');
          return {
            fetchJsonMs: Math.round(fetchedAt),
            parseMs: Math.round(parsedAt - fetchedAt),
            replaceMs: Math.round(replacedAt - parsedAt),
            settleMs: Math.round(settledAt - replacedAt),
            documentCount: Object.keys(collection.documents).length,
            activeCanvasId: collection.activeCanvasId,
            engineCount: window.__canwayNested.engineCount(),
            canvasCount: document.querySelectorAll('canvas[data-engine-mode]').length,
            totalNodes: Object.values(collection.documents).reduce((sum, document) => sum + document.model.nodes.length, 0),
            nativeLogTail: window.__canwayNested.runtimeLog?.().slice(-80) ?? null,
          };
        })())`,
        awaitPromise: true,
        returnByValue: true,
      }, timeoutMs);
      log('browser load evaluation returned', { durationMs: Date.now() - startedAt });
    } catch (error) {
      loadError = error;
      log('browser load evaluation failed', { durationMs: Date.now() - startedAt, error: error.message });
    }

    const durationMs = Date.now() - startedAt;
    let interactionResult = null;
    let interactionError = null;
    if (!loadError && runInteractions) {
      try {
        log('running interaction profile');
        interactionResult = await cdp.send('Runtime.evaluate', {
          expression: `((async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
            const mark = (name, data = {}) => {
              const entry = { name, at: Math.round(performance.now()), ...data };
              window.__canwayProfileLog.push(entry);
              performance.mark('canway:' + name, { detail: data });
              console.log('[canway-profile]', JSON.stringify(entry));
            };
            const canvas = () => document.querySelector('canvas[data-engine-mode="active"]');
            const dispatchPointer = (target, type, x, y, pointerId = 41, buttons = 1) => target.dispatchEvent(new PointerEvent(type, {
              bubbles: true,
              pointerId,
              pointerType: 'mouse',
              clientX: x,
              clientY: y,
              buttons,
              button: 0,
            }));
            const eventCountsSince = (startIndex) => window.__canwayNested.runtimeLog().slice(startIndex).reduce((counts, event) => {
              counts[event.name] = (counts[event.name] ?? 0) + 1;
              return counts;
            }, {});
            const active = canvas();
            if (!active) throw new Error('active canvas missing');
            const activeRect = active.getBoundingClientRect();
            const movementStart = window.__canwayNested.runtimeLog().length;
            mark('interaction:pan:start');
            dispatchPointer(active, 'pointerdown', activeRect.left + activeRect.width * 0.5, activeRect.top + activeRect.height * 0.5);
            for (let i = 0; i < 36; i += 1) {
              dispatchPointer(active, 'pointermove', activeRect.left + activeRect.width * 0.5 + i * 4, activeRect.top + activeRect.height * 0.5 + i * 2);
              await frame();
            }
            dispatchPointer(active, 'pointerup', activeRect.left + activeRect.width * 0.5 + 144, activeRect.top + activeRect.height * 0.5 + 72, 41, 0);
            await frame();
            mark('interaction:pan:done', { counts: eventCountsSince(movementStart), engineCount: window.__canwayNested.engineCount() });

            const zoomStart = window.__canwayNested.runtimeLog().length;
            mark('interaction:zoom:start');
            for (let i = 0; i < 16; i += 1) {
              active.dispatchEvent(new WheelEvent('wheel', {
                bubbles: true,
                clientX: activeRect.left + activeRect.width * 0.5,
                clientY: activeRect.top + activeRect.height * 0.5,
                deltaY: i % 2 ? -90 : 70,
                ctrlKey: true,
              }));
              await frame();
            }
            await frame();
            mark('interaction:zoom:done', { counts: eventCountsSince(zoomStart), engineCount: window.__canwayNested.engineCount() });

            const resizeStart = window.__canwayNested.runtimeLog().length;
            mark('interaction:resize-pane:start');
            const handle = document.querySelector('.embedded-nested-viewport .parent-context-resizer.vertical') ?? document.querySelector('.parent-context-resizer.vertical');
            if (handle) {
              const handleRect = handle.getBoundingClientRect();
              const x = handleRect.left + handleRect.width / 2;
              const y = handleRect.top + handleRect.height / 2;
              dispatchPointer(handle, 'pointerdown', x, y, 42);
              for (let i = 0; i < 18; i += 1) {
                dispatchPointer(handle, 'pointermove', x + i * 2, y, 42);
                await frame();
              }
              dispatchPointer(handle, 'pointerup', x + 36, y, 42, 0);
              await frame();
            }
            mark('interaction:resize-pane:done', { foundHandle: Boolean(handle), counts: eventCountsSince(resizeStart), engineCount: window.__canwayNested.engineCount() });

            const enterStart = window.__canwayNested.runtimeLog().length;
            mark('interaction:enter:start');
            const viewport = document.querySelector('.embedded-nested-viewport');
            if (viewport) {
              const rect = viewport.getBoundingClientRect();
              viewport.querySelector('canvas')?.dispatchEvent(new MouseEvent('dblclick', {
                bubbles: true,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
              }));
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }
            mark('interaction:enter:done', {
              foundViewport: Boolean(viewport),
              counts: eventCountsSince(enterStart),
              activeCanvasId: window.__canwayNested.activeCanvasId(),
              engineCount: window.__canwayNested.engineCount(),
            });
            await wait(500);
            return {
              engineCount: window.__canwayNested.engineCount(),
              activeCanvasId: window.__canwayNested.activeCanvasId(),
              logTail: window.__canwayNested.runtimeLog().slice(-120),
              profileTail: window.__canwayProfileLog.slice(-40),
            };
          })())`,
          awaitPromise: true,
          returnByValue: true,
        }, timeoutMs);
        log('interaction profile returned');
      } catch (error) {
        interactionError = error;
        log('interaction profile failed', { error: error.message });
      }
    }
    if (collectTrace) {
      try {
        if (traceAfterLoadMs > 0) {
          log('recording post-load trace window', { traceAfterLoadMs });
          await new Promise((resolve) => setTimeout(resolve, traceAfterLoadMs));
        }
        log('ending Chrome trace');
        await cdp.send('Tracing.end', {}, 5000);
        const tracingComplete = await traceCompletePromise;
        const traceJson = await readCdpStream(cdp, tracingComplete.stream);
        await writeFile(path.join(outputDir, 'chrome-trace.json'), traceJson);
        traceStatus = 'collected';
        log('Chrome trace collected', { bytes: traceJson.length });
      } catch (error) {
        traceStatus = `failed: ${error.message}`;
        log('Chrome trace failed', { error: error.message });
      }
    }
    let responsiveness = null;
    try {
      responsiveness = await cdp.send('Runtime.evaluate', {
        expression: `({
          at: Math.round(performance.now()),
          profileLog: window.__canwayProfileLog ?? null,
          nativeCanvasLog: window.__canwayNested?.runtimeLog?.() ?? window.__canwayNativeCanvasLog ?? null,
          engineCount: window.__canwayNested?.engineCount?.() ?? null,
          activeCanvasId: window.__canwayNested?.activeCanvasId?.() ?? null,
          canvasCount: document.querySelectorAll('canvas[data-engine-mode]').length,
          renderedNodes: [...document.querySelectorAll('canvas[data-engine-mode]')].map((canvas) => ({
            mode: canvas.dataset.engineMode,
            rendered: canvas.dataset.renderedNodes,
            total: canvas.dataset.totalNodes,
            rect: (() => {
              const rect = canvas.getBoundingClientRect();
              return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
            })(),
          })),
          embeddedViewports: [...document.querySelectorAll('.embedded-nested-viewport')].map((viewport) => {
            const rect = viewport.getBoundingClientRect();
            return {
              canvasId: viewport.dataset.canvasId,
              depth: viewport.dataset.depth,
              rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            };
          }),
        })`,
        returnByValue: true,
      }, 3000);
      log('responsiveness probe returned');
    } catch (error) {
      responsiveness = { error: error.message };
      log('responsiveness probe failed', { error: error.message });
    }
    log('locating renderer');
    const renderer = await rendererPidForChrome(chrome.pid);
    log('renderer selected', { renderer });
    let cpuProfileStatus = 'not-collected';
    if (startJsProfiler && !loadError) {
      try {
        log('stopping JS profiler');
        const profile = await cdp.send('Profiler.stop', {}, 10000);
        await writeFile(path.join(outputDir, 'chrome-js-cpu-profile.cpuprofile'), JSON.stringify(profile.profile, null, 2));
        cpuProfileStatus = 'collected';
      } catch (error) {
        cpuProfileStatus = `failed: ${error.message}`;
        log('JS profiler stop failed', { error: error.message });
      }
    }

    log('capturing process stats');
    const psAfter = await execCapture('ps', ['-p', String(renderer?.pid ?? chrome.pid), '-o', 'pid,ppid,pcpu,rss,vsz,etime,stat,command']);
    await writeFile(path.join(outputDir, 'process.txt'), psAfter.output);

    let sampleStatus = 'skipped';
    let vmmapStatus = 'skipped';
    if (renderer?.pid) {
      log('sampling renderer', { pid: renderer.pid });
      const sample = await execCapture('sample', [String(renderer.pid), '5', '-file', path.join(outputDir, 'renderer.sample.txt')]);
      sampleStatus = `exit-${sample.code}`;
      log('capturing vmmap', { pid: renderer.pid });
      const vmmap = await execCapture('vmmap', ['-summary', String(renderer.pid)]);
      await writeFile(path.join(outputDir, 'renderer-vmmap-summary.txt'), vmmap.output);
      vmmapStatus = `exit-${vmmap.code}`;
    }

    const summary = {
      appUrl,
      fixturePath,
      fixtureUrl,
      fixtureMetadata: fixture.metadata,
      timeoutMs,
      waitForFrames,
      startJsProfiler,
      useProfileLoadPath,
      collectTrace,
      traceAfterLoadMs,
      runInteractions,
      traceStatus,
      durationMs,
      loadOk: !loadError,
      loadResult: loadResult?.result?.value ?? null,
      loadError: loadError ? loadError.message : null,
      interactionResult: interactionResult?.result?.value ?? null,
      interactionError: interactionError ? interactionError.message : null,
      responsiveness: responsiveness?.result?.value ?? responsiveness,
      chromePid: chrome.pid,
      renderer,
      cpuProfileStatus,
      sampleStatus,
      vmmapStatus,
      outputDir,
    };
    await writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    log('summary written', { outputDir });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    log('cleanup:start');
    cdp?.close();
    await stopProcess(chrome);
    await rm(userDataDir, { recursive: true, force: true });
    log('cleanup:done');
  }
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exit(1);
});
