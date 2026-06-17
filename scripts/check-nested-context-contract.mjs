import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const chromePath = process.env.CANWAY_CHROME_PATH || process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject, timeout } = this.pending.get(message.id);
      clearTimeout(timeout);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
      else resolve(message.result);
    });
  }

  async send(method, params = {}, timeoutMs = 30000) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      timeout.unref();
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  if (!(await fileExists(chromePath))) throw new Error(`Chrome not found at ${chromePath}`);

  const vitePort = await freePort();
  const chromePort = await freePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'canway-context-contract-'));
  const appUrl = `http://127.0.0.1:${vitePort}/`;
  let devServer;
  let chrome;
  let cdp;

  try {
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
    if (!page?.webSocketDebuggerUrl) throw new Error('No debuggable Chrome page found');
    cdp = new CdpClient(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Runtime.evaluate', {
      expression: 'new Promise((resolve) => { if (document.readyState === "complete") resolve(true); else window.addEventListener("load", () => resolve(true), { once: true }); })',
      awaitPromise: true,
      returnByValue: true,
    });

    const evaluation = await cdp.send('Runtime.evaluate', {
      expression: `(${browserContract.toString()})(${createContractCollection.toString()})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text);
    console.log(JSON.stringify(evaluation.result.value, null, 2));
    console.log('Nested context contract passed');
  } finally {
    cdp?.close();
    await stopProcess(chrome);
    await stopProcess(devServer);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function browserContract(createCollection) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  for (let i = 0; i < 100; i += 1) {
    if (window.__canwayNested?.replaceCollection) break;
    await wait(50);
  }
  if (!window.__canwayNested?.replaceCollection) throw new Error('Canway debug API unavailable');

  const collection = createCollection();
  window.__canwayNested.replaceCollection(collection, { persist: false, notify: false, recordHistory: false });
  for (let i = 0; i < 12; i += 1) await frame();

  const regions = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];
  const activePanes = [...document.querySelectorAll('.nested-stage > .parent-context-field > .parent-context-canvas-clip')];
  const activeRegions = activePanes.map((pane) => pane.dataset.region).sort();
  const activePaneCanvasIds = activePanes.map((pane) => pane.dataset.canvasId);
  const activePaneTotals = activePanes.map((pane) => pane.querySelector('canvas')?.dataset.totalNodes ?? null);
  const embedded = document.querySelector('.embedded-nested-viewport[data-canvas-id="grand"]');
  if (!embedded) throw new Error('grandchild embedded viewport missing');
  const embeddedPanes = [...embedded.querySelectorAll(':scope > .parent-context-field > .parent-context-canvas-clip')];
  const embeddedRegions = embeddedPanes.map((pane) => pane.dataset.region).sort();

  const expected = [...regions].sort().join('|');
  if (activeRegions.join('|') !== expected) throw new Error(`active context regions mismatch: ${activeRegions.join(',')}`);
  if (embeddedRegions.length) throw new Error(`embedded previews should not render parent context panes: ${embeddedRegions.join(',')}`);
  if (!activePaneCanvasIds.every((id) => id === 'root')) throw new Error(`active panes are not root canvas viewports: ${activePaneCanvasIds.join(',')}`);
  if (!activePaneTotals.every((count) => count === String(collection.documents.root.model.nodes.length))) throw new Error(`active panes are not rendering root model: ${activePaneTotals.join(',')}`);
  const activeCamera = () => {
    const state = window.__canwayNested.getCollection();
    return state.view.cameras[state.activeCanvasId];
  };
  const activePortalRect = () => {
    const portal = document.querySelector('.nested-stage > .nested-center-cell > .portal-overlays > .portal-overlay');
    if (!portal) return null;
    const rect = portal.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  const parentContextToggle = document.querySelector('button[aria-label="Hide parent context panes"], button[aria-label="Show parent context panes"]');
  if (!parentContextToggle) throw new Error('parent context toolbar toggle missing');
  if (parentContextToggle.getAttribute('aria-pressed') !== 'true') throw new Error('parent context toolbar toggle should default on');
  const centerCell = document.querySelector('.nested-stage > .nested-center-cell');
  if (!centerCell) throw new Error('active center cell missing');
  const visibleCenterRect = centerCell.getBoundingClientRect();
  const visibleActiveCamera = activeCamera();
  const visibleActivePortalRect = activePortalRect();
  parentContextToggle.click();
  await frame();
  const firstHiddenActiveCamera = activeCamera();
  const firstHiddenActivePortalRect = activePortalRect();
  for (let i = 0; i < 11; i += 1) await frame();
  const hiddenPanes = [...document.querySelectorAll('.nested-stage > .parent-context-field > .parent-context-canvas-clip')];
  const hiddenHandles = [...document.querySelectorAll('.nested-stage > .parent-context-resizers > button[data-resize-handle]')];
  if (hiddenPanes.length) throw new Error(`parent context toggle left active panes mounted: ${hiddenPanes.length}`);
  if (hiddenHandles.length) throw new Error(`parent context toggle left resize handles mounted: ${hiddenHandles.length}`);
  if (parentContextToggle.getAttribute('aria-pressed') !== 'false') throw new Error('parent context toolbar toggle did not switch off');
  const hiddenCenterRect = centerCell.getBoundingClientRect();
  const hiddenActiveCamera = activeCamera();
  const expectedHiddenCamera = {
    x: visibleActiveCamera.x + visibleCenterRect.left - hiddenCenterRect.left,
    y: visibleActiveCamera.y + visibleCenterRect.top - hiddenCenterRect.top,
  };
  if (Math.abs(firstHiddenActiveCamera.x - expectedHiddenCamera.x) > 1 || Math.abs(firstHiddenActiveCamera.y - expectedHiddenCamera.y) > 1) {
    throw new Error(`parent context toggle first hidden frame had stale active camera: ${JSON.stringify({ firstHiddenActiveCamera, expectedHiddenCamera })}`);
  }
  if (Math.abs(hiddenActiveCamera.x - expectedHiddenCamera.x) > 1 || Math.abs(hiddenActiveCamera.y - expectedHiddenCamera.y) > 1) {
    throw new Error(`parent context toggle did not shift active camera with center origin: ${JSON.stringify({ visibleActiveCamera, hiddenActiveCamera, expectedHiddenCamera })}`);
  }
  if (visibleActivePortalRect && firstHiddenActivePortalRect && (
    Math.abs(firstHiddenActivePortalRect.left - visibleActivePortalRect.left) > 1 ||
    Math.abs(firstHiddenActivePortalRect.top - visibleActivePortalRect.top) > 1
  )) {
    throw new Error(`parent context toggle first hidden frame moved active portal overlay: ${JSON.stringify({ visibleActivePortalRect, firstHiddenActivePortalRect })}`);
  }
  parentContextToggle.click();
  await frame();
  const firstRestoredActiveCamera = activeCamera();
  const firstRestoredActivePortalRect = activePortalRect();
  for (let i = 0; i < 11; i += 1) await frame();
  const restoredPanes = [...document.querySelectorAll('.nested-stage > .parent-context-field > .parent-context-canvas-clip')];
  const restoredRegions = restoredPanes.map((pane) => pane.dataset.region).sort();
  if (restoredRegions.join('|') !== expected) throw new Error(`parent context toggle did not restore active panes: ${restoredRegions.join(',')}`);
  if (parentContextToggle.getAttribute('aria-pressed') !== 'true') throw new Error('parent context toolbar toggle did not switch back on');
  const restoredActiveCamera = activeCamera();
  if (Math.abs(firstRestoredActiveCamera.x - visibleActiveCamera.x) > 1 || Math.abs(firstRestoredActiveCamera.y - visibleActiveCamera.y) > 1) {
    throw new Error(`parent context toggle first restored frame had stale active camera: ${JSON.stringify({ visibleActiveCamera, firstRestoredActiveCamera })}`);
  }
  if (Math.abs(restoredActiveCamera.x - visibleActiveCamera.x) > 1 || Math.abs(restoredActiveCamera.y - visibleActiveCamera.y) > 1) {
    throw new Error(`parent context toggle did not restore active camera after center panel shift: ${JSON.stringify({ visibleActiveCamera, restoredActiveCamera })}`);
  }
  if (visibleActivePortalRect && firstRestoredActivePortalRect && (
    Math.abs(firstRestoredActivePortalRect.left - visibleActivePortalRect.left) > 1 ||
    Math.abs(firstRestoredActivePortalRect.top - visibleActivePortalRect.top) > 1
  )) {
    throw new Error(`parent context toggle first restored frame moved active portal overlay: ${JSON.stringify({ visibleActivePortalRect, firstRestoredActivePortalRect })}`);
  }
  const paneCanvases = [...document.querySelectorAll('.parent-context-canvas-clip > canvas')];
  const nonInteractive = paneCanvases.filter((canvas) => canvas.tabIndex !== 0 || canvas.dataset.engineMode !== 'embedded-live');
  if (nonInteractive.length) throw new Error(`context panes are not live interactive canvases: ${nonInteractive.length}`);
  const activePaneCamera = (region) => window.__canwayNested.contextPaneCameras().find((entry) => entry.ownerKey === 'active:child' && entry.region === region)?.camera;
  const emptyTopLeftCanvas = document.querySelector('.nested-stage > .parent-context-field > .parent-context-canvas-clip[data-region="top-left"] > canvas');
  if (!emptyTopLeftCanvas) throw new Error('active empty top-left pane canvas missing');
  const emptyRect = emptyTopLeftCanvas.getBoundingClientRect();
  const zoomBefore = activePaneCamera('top-left');
  emptyTopLeftCanvas.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true,
    clientX: emptyRect.left + emptyRect.width / 2,
    clientY: emptyRect.top + emptyRect.height / 2,
    deltaY: -140,
    ctrlKey: true,
  }));
  for (let i = 0; i < 6; i += 1) await frame();
  const zoomAfter = activePaneCamera('top-left');
  if (!zoomBefore || !zoomAfter || zoomAfter.scale === zoomBefore.scale) throw new Error('wheel zoom inside empty border pane did not persist');

  const panBefore = activePaneCamera('top-left');
  const dispatchEmptyPointer = (type, x, y, pointerId = 70, buttons = 1) => emptyTopLeftCanvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    pointerId,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    buttons,
    button: 0,
  }));
  dispatchEmptyPointer('pointerdown', emptyRect.left + emptyRect.width / 2, emptyRect.top + emptyRect.height / 2);
  await frame();
  dispatchEmptyPointer('pointermove', emptyRect.left + emptyRect.width / 2 + 36, emptyRect.top + emptyRect.height / 2 + 18, 70, 1);
  await frame();
  dispatchEmptyPointer('pointerup', emptyRect.left + emptyRect.width / 2 + 36, emptyRect.top + emptyRect.height / 2 + 18, 70, 0);
  for (let i = 0; i < 6; i += 1) await frame();
  const panAfter = activePaneCamera('top-left');
  if (!panBefore || !panAfter || (panAfter.x === panBefore.x && panAfter.y === panBefore.y)) throw new Error('empty-space pan inside border pane did not persist');
  const memoryEntry = window.__canwayNested.contextPaneCameras().find((entry) => entry.ownerKey === 'active:child' && entry.region === 'top-left');
  const snapshot = window.__canwayNested.getWorkspaceSnapshot();
  const remembered = memoryEntry?.memoryKey ? snapshot.history.present.view.viewportMemory?.contextPanes?.[memoryEntry.memoryKey] : null;
  if (!remembered) throw new Error('context pane camera was not written to serializable view memory');
  if (remembered.camera.scale !== panAfter.scale || remembered.camera.x !== panAfter.x || remembered.camera.y !== panAfter.y) {
    throw new Error('serialized context pane camera does not match live pane camera');
  }
  const exportedView = window.__canwayNested.getViewState();
  const roundTrippedView = JSON.parse(JSON.stringify(exportedView));
  if ('parentContext' in roundTrippedView || 'stackPath' in roundTrippedView || 'deleteConfirmation' in roundTrippedView) {
    throw new Error('shareable view state leaked derived document context or transient UI state');
  }
  window.__canwayNested.applyViewState(roundTrippedView);
  for (let i = 0; i < 12; i += 1) await frame();
  const restoredSharedViewPan = activePaneCamera('top-left');
  if (!restoredSharedViewPan || restoredSharedViewPan.scale !== panAfter.scale || restoredSharedViewPan.x !== panAfter.x || restoredSharedViewPan.y !== panAfter.y) {
    throw new Error('shared view state did not restore context pane camera');
  }
  window.__canwayNested.loadWorkspaceSnapshot(snapshot);
  for (let i = 0; i < 12; i += 1) await frame();
  const restoredPan = activePaneCamera('top-left');
  if (!restoredPan || restoredPan.scale !== panAfter.scale || restoredPan.x !== panAfter.x || restoredPan.y !== panAfter.y) {
    throw new Error('serialized context pane camera did not restore after workspace load');
  }

  const rootTopBefore = window.__canwayNested.getCollection().documents.root.model.nodes.find((node) => node.id === 'root-top')?.x;
  const topPaneCanvas = document.querySelector('.nested-stage > .parent-context-field > .parent-context-canvas-clip[data-region="top"] > canvas');
  if (!topPaneCanvas) throw new Error('active top pane canvas missing');
  const rect = topPaneCanvas.getBoundingClientRect();
  const dispatchPointer = (type, x, y, pointerId = 71, buttons = 1) => topPaneCanvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    pointerId,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    buttons,
    button: 0,
  }));
  dispatchPointer('pointerdown', rect.left + rect.width / 2, rect.top + rect.height / 2);
  await frame();
  dispatchPointer('pointermove', rect.left + rect.width / 2 + 48, rect.top + rect.height / 2, 71, 1);
  await frame();
  dispatchPointer('pointerup', rect.left + rect.width / 2 + 48, rect.top + rect.height / 2, 71, 0);
  for (let i = 0; i < 4; i += 1) await frame();
  const rootTopAfter = window.__canwayNested.getCollection().documents.root.model.nodes.find((node) => node.id === 'root-top')?.x;
  if (rootTopAfter === rootTopBefore) throw new Error('dragging inside active border pane did not mutate the real root canvas');

  return {
    activeRegions,
    activePaneCanvasIds,
    activePaneTotals,
    embeddedCanvasId: embedded.dataset.canvasId,
    embeddedRegions,
    hiddenPaneCount: hiddenPanes.length,
    restoredRegionCount: restoredRegions.length,
    visibleActiveCamera,
    firstHiddenActiveCamera,
    hiddenActiveCamera,
    expectedHiddenCamera,
    firstRestoredActiveCamera,
    restoredActiveCamera,
    visibleActivePortalRect,
    firstHiddenActivePortalRect,
    firstRestoredActivePortalRect,
    contextPaneCanvasModes: [...new Set(paneCanvases.map((canvas) => canvas.dataset.engineMode))],
    zoomBefore,
    zoomAfter,
    panBefore,
    panAfter,
    restoredSharedViewPan,
    restoredPan,
    contextPaneMemoryKeys: Object.keys(snapshot.history.present.view.viewportMemory.contextPanes).sort(),
    rootTopBefore,
    rootTopAfter,
    engineCount: window.__canwayNested.engineCount(),
  };
}

function createContractCollection() {
  const positions = {
    'top-left': [-360, -260],
    top: [0, -260],
    'top-right': [360, -260],
    left: [-360, 0],
    center: [0, 0],
    right: [360, 0],
    'bottom-left': [-360, 260],
    bottom: [0, 260],
    'bottom-right': [360, 260],
  };
  const paneLayout = { left: 144, right: 72, top: 112, bottom: 64 };
  const camera = { x: 380, y: 260, scale: 0.82 };
  const selection = { selectedNodeIds: [], primarySelectedNodeId: null, resizeMode: false };
  const card = (id, region) => {
    const [x, y] = positions[region];
    return { id, type: 'card', x, y, w: 220, h: 150, data: { title: region, detail: `Sibling ${region}`, accent: 'task' } };
  };
  const portal = (id, region, childCanvasId, title) => {
    const [x, y] = positions[region];
    return { id, type: 'canvas', x, y, w: 220, h: 150, data: { childCanvasId, title, nodeCount: 9 } };
  };
  const childNodes = Object.keys(positions)
    .filter((region) => region !== 'top-right')
    .map((region) => (
      region === 'center'
        ? portal('child-center', region, 'grand', 'Grand portal')
        : card(`child-${region}`, region)
    ));
  return {
    schemaVersion: 1,
    rootCanvasId: 'root',
    activeCanvasId: 'child',
    documents: {
      root: {
        id: 'root',
        title: 'Root',
        parentCanvasId: null,
        parentNodeId: null,
        model: {
          schemaVersion: 2,
          nodes: Object.keys(positions).filter((region) => region !== 'top-left').map((region) => {
            if (region === 'center') return portal('root-center', region, 'child', 'Active child');
            if (region === 'right') return portal('root-right', region, 'side', 'Canvas sibling');
            return card(`root-${region}`, region);
          }),
        },
      },
      child: {
        id: 'child',
        title: 'Child',
        parentCanvasId: 'root',
        parentNodeId: 'root-center',
        model: { schemaVersion: 2, nodes: childNodes },
      },
      grand: {
        id: 'grand',
        title: 'Grandchild',
        parentCanvasId: 'child',
        parentNodeId: 'child-center',
        model: { schemaVersion: 2, nodes: [card('grand-card', 'center')] },
      },
      side: {
        id: 'side',
        title: 'Side sibling canvas',
        parentCanvasId: 'root',
        parentNodeId: 'root-right',
        model: { schemaVersion: 2, nodes: [card('side-card', 'center')] },
      },
    },
    view: {
      cameras: { root: camera, child: camera, grand: camera, side: camera },
      selections: { root: selection, child: selection, grand: selection, side: selection },
      paneLayouts: { root: paneLayout, child: paneLayout, grand: paneLayout, side: paneLayout },
      viewportMemory: { schemaVersion: 1, contextPanes: {}, embeddedPortals: {} },
      activeCanvasId: 'child',
      focusedEngineId: 'child',
      previewFocus: null,
      stackPath: [
        { canvasId: 'root', parentCanvasId: null, parentNodeId: null, depth: 0 },
        { canvasId: 'child', parentCanvasId: 'root', parentNodeId: 'root-center', depth: 1 },
      ],
      parentContext: { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] },
      animationEnabled: false,
      deleteConfirmation: null,
    },
  };
}

main().catch((error) => {
  console.error('Nested context contract failed');
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
