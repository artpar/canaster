import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromePath = process.env.CANWAY_CHROME_PATH || process.env.CHROME_PATH || defaultChromePath;
const STARTER_WORKSPACE_STORAGE_KEY = 'starter:service-work-v2';

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
  assert(!result.shellChrome.topbarInsideNestedWorkspace, 'toolbar is rendered inside the recursive nested workspace');
  assert(!result.shellChrome.statusbarInsideNestedWorkspace && result.shellChrome.statusbarOutsideNestedWorkspace, 'statusbar is not rendered outside the recursive nested workspace');
  assert(result.appPortal.type === 'canvas', 'portal node type mismatch');
  assert(result.appPortal.dataKeys.includes('childCanvasId') && result.appPortal.dataKeys.includes('nodeCount'), 'portal data not normalized');
  assert(result.preview.mounted, 'embedded child canvas missing');
  assert(result.preview.transparentActivationCount === 0, 'transparent portal activation overlay still blocks pointer interaction');
  assert(result.preview.update.total === '1', 'preview canvas did not reflect child model update');
  assert(
    Math.abs(result.preview.childCenterPaneRatio?.width - 0.8) <= 0.04 && Math.abs(result.preview.childCenterPaneRatio?.height - 0.8) <= 0.04,
    `embedded child center pane is not 80% of its panel: ${JSON.stringify(result.preview.childCenterPaneRatio)}`,
  );
  assert(result.preview.pointerDidNotEnter, 'single pointer interaction entered child canvas');
  assert(result.preview.wheelChangedChildCamera && result.preview.wheelKeptParentCamera, 'embedded portal wheel did not target only the child canvas camera');
  assert(result.preview.dragMovedChildNode && result.preview.dragKeptParentPortalStable, 'embedded portal drag did not edit child canvas in isolation');
  assert(result.preview.doubleClickEntered, 'double click did not enter child canvas');
  assert(result.preview.contextPlaneAfterEnter >= 1, 'context parent plane missing after enter');
  assert(result.parentReturn.activeCanvasId === 'root', 'parent navigation did not return to root');
  assert(result.parentReturn.selectedNodeId === 'planning-canvas', `return to parent did not select portal node: ${result.parentReturn.selectedNodeId}`);
  assert(result.isolation.childMoved, 'active child model did not move');
  assert(result.isolation.parentStableAfterChildMove, 'child edit mutated parent portal geometry');
  assert(result.isolation.parentMoved, 'parent portal did not move after returning');
  assert(result.isolation.childStableAfterParentMove, 'parent edit mutated child model');
  assert(result.history.undoAvailableBeforeUndo && result.history.redoEmptyBeforeUndo, 'workspace history stacks were not populated after edits');
  assert(result.history.undoRestoredParentPortal, 'workspace undo did not restore the previous collection snapshot');
  assert(result.history.redoAvailableAfterUndo && result.history.redoRestoredParentPortal && result.history.redoClearedAfterRedo, 'workspace redo did not restore and clear redo state');
  assert(result.history.persistedChildMove && result.history.persistedActiveCanvas === 'root', `workspace snapshot was not persisted to IndexedDB: ${JSON.stringify(result.history)}`);
  assert(result.parentContext.regions.length === 8, `parent context field did not render all eight regions: ${result.parentContext.regions.join(',')}`);
  assert(result.parentContext.shapeCount === 8, `parent context field must render one nearest shape per pane: ${result.parentContext.shapeCount}`);
  assert(!result.parentContext.nodeIds.includes('neighbor-top-far') && !result.parentContext.nodeIds.includes('portal-right-far'), `parent context did not choose nearest candidates per pane: ${result.parentContext.nodeIds.join(',')}`);
  assert(Object.values(result.parentContext.cardinalPaneFill).every(Boolean), `cardinal parent context canvases do not fill their pane viewports: ${JSON.stringify({ fill: result.parentContext.cardinalPaneFill, rects: result.parentContext.clipRects })}`);
  assert(result.parentContext.panesExclusive, `parent context panes overlap: ${JSON.stringify(result.parentContext.clipRects)}`);
  assert(result.parentContext.panesOutsideActiveCenter, `parent context panes overlap the active center cell: ${JSON.stringify({ center: result.parentContext.activeCenterRect, rects: result.parentContext.clipRects })}`);
  assert(result.parentContext.activeCanvasConfinedToCenter, `active canvas is not confined to center cell: ${JSON.stringify({ center: result.parentContext.activeCenterRect, active: result.parentContext.activeCanvasRect })}`);
  assert(result.parentContext.dividerResizeChangedLeft, 'vertical divider drag did not resize west/east pane partition');
  assert(result.parentContext.dividerResizeChangedWestColumn && result.parentContext.dividerResizeChangedCenterColumn, 'vertical divider drag did not resize the whole affected grid columns');
  assert(result.parentContext.intersectionResizeChangedTop && result.parentContext.intersectionResizeChangedLeft && result.parentContext.intersectionResizeChangedTopRow, 'intersection handle drag did not resize both affected grid axes');
  assert(result.parentContext.dividerResizeMovesBeyondLegacyCap, 'vertical divider drag is still capped near the default border band');
  assert(result.parentContext.legacyFloatingCardCount === 0, 'old floating sibling card DOM is still rendered');
  assert(result.parentContext.textContent === '', 'parent context field rendered visible text labels');
  assert(result.parentContext.liveCanvasCount === result.parentContext.shapeCount, `parent context field did not mount real canvases for every projected shape: ${result.parentContext.liveCanvasCount}/${result.parentContext.shapeCount}`);
  assert(result.parentContext.liveShapeCount === result.parentContext.shapeCount, `parent context hit shapes are not all backed by live canvases: ${result.parentContext.liveShapeCount}/${result.parentContext.shapeCount}`);
  assert(result.parentContext.canvasModels.includes('child'), 'parent context did not render sibling child canvas content');
  assert(result.parentContext.canvasModels.includes('snippet'), 'parent context did not render parent-node snippet canvases');
  assert(result.parentContext.emptyCanvases.length === 0, `parent context rendered empty canvas boxes: ${JSON.stringify(result.parentContext.emptyCanvases)}`);
  assert(Number(result.parentContext.rightCanvasRendered) >= 1 && Number(result.parentContext.rightCanvasTotal) >= 1, 'projected sibling canvas did not render real child canvas content');
  assert(result.parentContext.rightPaneWheelChangedCamera, 'border pane wheel did not target pane canvas camera');
  assert(result.parentContext.nestedPortalCanvasMounted, 'border pane did not render recursive nested portal canvas');
  assert(result.parentContext.nestedPortalWheelChangedCamera, 'recursive nested portal canvas did not respond to wheel interaction');
  assert(result.parentContext.nestedPortalDoubleClickCanvas === 'right-grandchild', 'recursive nested portal double-click did not enter nested child canvas');
  assert(result.parentContext.borderPaneDoubleClickCanvas === 'right-child', 'projected portal double-click did not move sideways into sibling child canvas');
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

function assertReloadPersistenceProbe(result) {
  assert(result.hasPersistChild, `reload did not restore persisted child canvas: ${JSON.stringify(result)}`);
  assert(result.activeCanvasId === 'persist-child', `reload did not restore active canvas: ${JSON.stringify(result)}`);
  assert(result.rootPortalChildCanvasId === 'persist-child', `reload did not restore portal child link: ${JSON.stringify(result)}`);
  assert(result.childNodeX === 77 && result.childNodeY === 33, `reload did not restore child model position: ${JSON.stringify(result)}`);
  assert(Math.abs(result.cameraScale - 1.73) < 0.001, `reload did not restore camera scale: ${JSON.stringify(result)}`);
  assert(result.paneLeft === 123 && result.paneTop === 91, `reload did not restore pane layout: ${JSON.stringify(result)}`);
  assert(result.undoStackLength > 0, `reload did not restore workspace undo history: ${JSON.stringify(result)}`);
  assert(result.persistedHasChild, `reload overwrote IndexedDB snapshot after hydration: ${JSON.stringify(result)}`);
}

function assertImmediateReloadPersistenceProbe(result) {
  assert(result.createdChildCanvasId, `immediate reload fixture did not create a child canvas: ${JSON.stringify(result)}`);
  assert(result.restoredChildCanvasId === result.createdChildCanvasId, `immediate reload did not restore the newly created portal link: ${JSON.stringify(result)}`);
  assert(result.restoredChildDocument, `immediate reload did not restore the newly created child document: ${JSON.stringify(result)}`);
}

async function evaluateRuntime(cdp, expression) {
  const evaluation = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text);
  return evaluation.result.value;
}

async function waitForLoadedPage(cdp) {
  await evaluateRuntime(cdp, 'new Promise((resolve) => { if (document.readyState === "complete") resolve(true); else window.addEventListener("load", () => resolve(true), { once: true }); })');
}

async function runReloadPersistenceProbe(cdp) {
  const seeded = await evaluateRuntime(cdp, `((async () => {
    const { createInitialDocumentCollection, setCameraForCanvas, setPaneLayoutForCanvas, setSelectionForCanvas } = await import('/src/engine/documentModel.ts');
    const { createWorkspaceHistory, createWorkspaceSnapshot, hydrateWorkspaceSnapshot, pushWorkspaceHistory } = await import('/src/engine/workspaceHistory.ts');
    const card = (id, x, y, title = id) => ({
      id,
      type: 'card',
      x,
      y,
      w: 180,
      h: 96,
      data: { title, detail: title + ' detail', accent: 'task' },
    });
    const rootModel = {
      schemaVersion: 2,
      nodes: [
        {
          id: 'persist-portal',
          type: 'canvas',
          x: 320,
          y: 40,
          w: 300,
          h: 180,
          data: { childCanvasId: 'persist-child', title: 'Persist Child', nodeCount: 1 },
        },
        card('persist-root-card', -140, -80, 'Persist Root Card'),
      ],
    };
    const base = createInitialDocumentCollection({ schemaVersion: 2, nodes: [card('base-card', 0, 0, 'Base Card')] }, 'Base Root');
    let collection = createInitialDocumentCollection(rootModel, 'Persist Root');
    collection.documents['persist-child'] = {
      id: 'persist-child',
      title: 'Persist Child',
      parentCanvasId: 'root',
      parentNodeId: 'persist-portal',
      model: { schemaVersion: 2, nodes: [card('persist-child-card', 77, 33, 'Persist Child Card')] },
    };
    collection.activeCanvasId = 'persist-child';
    collection.view.activeCanvasId = 'persist-child';
    collection.view.focusedEngineId = 'persist-child';
    collection = setCameraForCanvas(collection, 'persist-child', { x: -123, y: 456, scale: 1.73 });
    collection = setSelectionForCanvas(collection, 'persist-child', { selectedNodeIds: ['persist-child-card'], primarySelectedNodeId: 'persist-child-card', resizeMode: false });
    collection = setPaneLayoutForCanvas(collection, 'persist-child', { left: 123, right: 80, top: 91, bottom: 70 });
    const history = pushWorkspaceHistory(createWorkspaceHistory(base), collection);
    const snapshot = hydrateWorkspaceSnapshot(createWorkspaceSnapshot(history, { kind: 'active-canvas-change', from: 'root', to: 'persist-child', source: 'nonvisual' }));
    const record = {
      id: ${JSON.stringify(STARTER_WORKSPACE_STORAGE_KEY)},
      schemaVersion: 1,
      updatedAt: Date.now(),
      snapshot,
    };
    return {
      activeCanvasId: snapshot?.history.present.activeCanvasId ?? null,
      hasPersistChild: Boolean(snapshot?.history.present.documents['persist-child']),
      undoStackLength: snapshot?.history.undoStack.length ?? 0,
      recordJson: JSON.stringify(record),
    };
  })())`);
  assert(seeded.activeCanvasId === 'persist-child' && seeded.hasPersistChild && seeded.undoStackLength > 0, `failed to seed reload persistence fixture: ${JSON.stringify(seeded)}`);

  const initScript = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.localStorage.setItem('canway-workspace-snapshot:${STARTER_WORKSPACE_STORAGE_KEY}', ${JSON.stringify(seeded.recordJson)});`,
  });
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForLoadedPage(cdp);
  if (initScript.identifier) await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript.identifier });

  return evaluateRuntime(cdp, `((async () => {
    const { loadWorkspaceSnapshot } = await import('/src/engine/workspaceStorage.ts');
    const raf = async (count = 1) => {
      for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    let collection = null;
    let api = null;
    for (let i = 0; i < 120; i++) {
      api = window.__canwayNested;
      collection = api?.getCollection?.() ?? null;
      if (collection?.documents?.['persist-child'] && collection.activeCanvasId === 'persist-child') break;
      await raf(1);
    }
    await raf(12);
    api = window.__canwayNested;
    collection = api?.getCollection?.() ?? collection;
    const snapshot = api?.getWorkspaceSnapshot?.() ?? null;
    const persisted = await loadWorkspaceSnapshot(${JSON.stringify(STARTER_WORKSPACE_STORAGE_KEY)});
    const rootPortal = collection?.documents?.root?.model.nodes.find((node) => node.id === 'persist-portal') ?? null;
    const childNode = collection?.documents?.['persist-child']?.model.nodes.find((node) => node.id === 'persist-child-card') ?? null;
    return {
      activeCanvasId: collection?.activeCanvasId ?? null,
      hasPersistChild: Boolean(collection?.documents?.['persist-child']),
      rootPortalChildCanvasId: rootPortal?.data?.childCanvasId ?? null,
      childNodeX: childNode?.x ?? null,
      childNodeY: childNode?.y ?? null,
      cameraScale: collection?.view?.cameras?.['persist-child']?.scale ?? null,
      paneLeft: collection?.view?.paneLayouts?.['persist-child']?.left ?? null,
      paneTop: collection?.view?.paneLayouts?.['persist-child']?.top ?? null,
      undoStackLength: snapshot?.history?.undoStack?.length ?? 0,
      persistedHasChild: Boolean(persisted?.history.present.documents['persist-child']),
      persistedActiveCanvasId: persisted?.history.present.activeCanvasId ?? null,
    };
  })())`);
}

async function runImmediateReloadPersistenceProbe(cdp) {
  const created = await evaluateRuntime(cdp, `(() => {
    const api = window.__canwayNested;
    if (!api) throw new Error('nested workspace debug API unavailable');
    api.executeDocumentCommand({ type: 'select-canvas', canvasId: 'root', source: 'nonvisual' });
    api.executeDocumentCommand({ type: 'create-child-canvas', parentCanvasId: 'root', nodeId: 'persist-root-card', source: 'nonvisual' });
    const collection = api.getCollection();
    const node = collection.documents.root.model.nodes.find((candidate) => candidate.id === 'persist-root-card');
    return {
      createdChildCanvasId: node?.data?.childCanvasId ?? null,
      documentExists: Boolean(node?.data?.childCanvasId && collection.documents[node.data.childCanvasId]),
    };
  })()`);
  assert(created.createdChildCanvasId && created.documentExists, `failed to create immediate reload fixture: ${JSON.stringify(created)}`);

  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForLoadedPage(cdp);

  const restored = await evaluateRuntime(cdp, `((async () => {
    const raf = async (count = 1) => {
      for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    let collection = null;
    for (let i = 0; i < 120; i++) {
      const api = window.__canwayNested;
      collection = api?.getCollection?.() ?? null;
      const node = collection?.documents?.root?.model.nodes.find((candidate) => candidate.id === 'persist-root-card');
      if (node?.data?.childCanvasId === ${JSON.stringify(created.createdChildCanvasId)} && collection.documents[node.data.childCanvasId]) break;
      await raf(1);
    }
    const node = collection?.documents?.root?.model.nodes.find((candidate) => candidate.id === 'persist-root-card') ?? null;
    return {
      restoredChildCanvasId: node?.data?.childCanvasId ?? null,
      restoredChildDocument: Boolean(node?.data?.childCanvasId && collection?.documents?.[node.data.childCanvasId]),
    };
  })())`);

  return { ...created, ...restored };
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

    const result = await evaluateRuntime(cdp, "(async () => { const probe = await import('/docs/nested-canvas-devtools-probe.js'); return await probe.runCanwayNestedProbe(); })()");
    const browserEvents = summarizeBrowserEvents(cdp.events);
    assertProbe(result, browserEvents);
    const reloadPersistence = await runReloadPersistenceProbe(cdp);
    assertReloadPersistenceProbe(reloadPersistence);
    const immediateReloadPersistence = await runImmediateReloadPersistenceProbe(cdp);
    assertImmediateReloadPersistenceProbe(immediateReloadPersistence);
    console.log(JSON.stringify({ appUrl, browserEvents, result, reloadPersistence, immediateReloadPersistence }, null, 2));
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
