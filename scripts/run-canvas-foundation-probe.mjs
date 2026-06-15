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
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
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
    .filter((event) =>
      ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded', 'Network.loadingFailed'].includes(event.method),
    )
    .map((event) => {
      if (event.method === 'Runtime.consoleAPICalled') {
        return {
          method: event.method,
          type: event.params.type,
          text: event.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' '),
        };
      }
      if (event.method === 'Runtime.exceptionThrown') {
        return {
          method: event.method,
          text: event.params.exceptionDetails?.text ?? event.params.exceptionDetails?.exception?.description ?? '',
        };
      }
      if (event.method === 'Log.entryAdded') {
        return {
          method: event.method,
          level: event.params.entry?.level,
          text: event.params.entry?.text,
        };
      }
      return {
        method: event.method,
        errorText: event.params.errorText,
        url: event.params.request?.url,
      };
    });
}

function assertProbe(result, browserEvents) {
  assert(result.app, 'app canvas was not found');
  assert(Number(result.app.css.w) > 0 && Number(result.app.css.h) > 0, 'app canvas has invalid CSS size');
  assert(Number(result.app.bitmap.w) >= Number(result.app.css.w), 'app bitmap width is not DPR-backed');
  assert(Number(result.app.bitmap.h) >= Number(result.app.css.h), 'app bitmap height is not DPR-backed');
  assert(result.app.rendered === result.app.total, 'sample model should be fully rendered at fit');
  assert(result.app.tabIndex === 0, 'canvas must be keyboard focusable');
  assert(result.app.statusRole === 'status' && result.app.statusLive === 'polite', 'statusbar live-region contract failed');
  assert(result.app.sequentialFocusables.some((entry) => entry.tag === 'canvas'), 'canvas is not reachable in sequential keyboard focus');
  assert(result.app.sequentialFocusables.findIndex((entry) => entry.tag === 'canvas') >= 5, 'toolbar controls should remain before canvas in tab order');
  assert(result.app.nodeAccess.label === 'Canvas nodes', 'node access panel is missing');
  assert(result.app.nodeAccess.nodeCount === 4, 'node access panel does not expose all sample nodes');
  assert(result.app.nodeAccess.nodeLabels.some((label) => label.includes('Source Model')), 'node access panel missing Source Model');
  assert(result.app.nodeAccess.actionLabels.includes('Move selection right'), 'node access move command missing');
  assert(result.app.nodeAccess.actionLabels.includes('Delete selection'), 'node access delete command missing');

  const expectedDeltas = {
    hover: 0,
    selection: 0,
    zeroDeltaDrag: 0,
    realDrag: 1,
    zeroDeltaResize: 0,
    realResize: 1,
    wheel: 0,
    doubleClick: 0,
    theme: 0,
    canvasResize: 0,
  };
  for (const [name, expected] of Object.entries(expectedDeltas)) {
    assert(result.modelBoundary.deltas[name] === expected, `model boundary ${name} expected ${expected}`);
  }

  assert(result.overlappingResize.counts.every((entry) => entry.delta === 1), 'overlapping resize did not commit exactly once');
  assert(
    result.overlappingResize.counts.every((entry) => entry.change?.kind === 'node-resize' && entry.change?.nodeId === 'source'),
    'overlapping resize did not prioritize selected resize handle',
  );
  assert(result.culling.edge.rendered === '1' && result.culling.edge.total === '1', 'edge culling should render intersecting node');
  assert(result.culling.off.rendered === '0' && result.culling.off.total === '1', 'offscreen culling should skip fully offscreen node');

  assert(result.keyboardContract.tabIndex === 0, 'probe canvas is not sequentially focusable');
  assert(result.keyboardContract.programmaticFocusWorks, 'probe canvas does not accept programmatic pointer-style focus');
  assert(result.keyboardContract.noSelectionDelta === 0, 'no-selection arrow keys changed the model');
  assert(result.keyboardContract.selectedNodeId, 'Enter did not select a generic canvas node');
  assert(result.keyboardContract.keyboardChanges.length === 2, 'keyboard movement did not emit two model changes');
  assert(
    result.keyboardContract.keyboardChanges.every((change) => change.kind === 'node-move' && change.source === 'keyboard'),
    'keyboard movement change metadata is wrong',
  );
  assert(result.keyboardContract.moveSnapped, 'keyboard movement did not snap node position to grid');
  assert(result.keyboardContract.movedBy?.w === 0 && result.keyboardContract.movedBy?.h === 0, 'keyboard movement resized the node');
  assert(result.keyboardContract.resizedBy?.w > 0 && result.keyboardContract.resizedBy?.h === 0, 'keyboard resize distance mismatch');
  assert(result.keyboardContract.resizeSnapped, 'keyboard resize did not snap node width to grid');
  assert(result.keyboardContract.resizeChange?.kind === 'node-resize' && result.keyboardContract.resizeChange?.source === 'keyboard', 'keyboard resize change metadata is wrong');
  assert(result.keyboardContract.escapeExitedResizeMode, 'Escape did not exit keyboard resize mode');

  assert(result.advancedEditing.noSelectionDelete, 'delete without selection should be a no-op');
  assert(result.advancedEditing.noSelectionCopy, 'copy without selection should be a no-op');
  assert(result.advancedEditing.noClipboardPaste, 'paste without clipboard should be a no-op');
  assert(result.advancedEditing.noopDelta === 0, 'no-op edit commands emitted model changes');
  assert(result.advancedEditing.nonvisualMove.delta === 1, 'nonvisual move did not emit exactly once');
  assert(result.advancedEditing.nonvisualMove.change?.kind === 'node-move', 'nonvisual move change kind mismatch');
  assert(result.advancedEditing.nonvisualMove.change?.source === 'nonvisual', 'nonvisual move source mismatch');
  assert(result.advancedEditing.nonvisualMove.snapped, 'nonvisual move did not snap node position');
  assert(result.advancedEditing.nonvisualResize.delta === 1, 'nonvisual resize did not emit exactly once');
  assert(result.advancedEditing.nonvisualResize.widthDelta > 0, 'nonvisual resize width delta mismatch');
  assert(result.advancedEditing.nonvisualResize.widthSnapped, 'nonvisual resize did not snap node width');
  assert(result.advancedEditing.singleDelete.delta === 1, 'single delete did not emit exactly once');
  assert(result.advancedEditing.singleDelete.change?.kind === 'node-delete', 'single delete change kind mismatch');
  assert(result.advancedEditing.singleDelete.exists === false, 'single delete left deleted node behind');
  assert(result.advancedEditing.singleDelete.selectionCount === 0, 'single delete did not clear selection');
  assert(result.advancedEditing.multiMove.delta === 1, 'multi move did not emit exactly once');
  assert(result.advancedEditing.multiMove.change?.nodeIds?.length === 2, 'multi move did not include both selected node ids');
  assert(result.advancedEditing.multiMove.sourceSnapped, 'multi move did not snap source position');
  assert(result.advancedEditing.multiMove.plannerSnapped, 'multi move did not snap planner position');
  assert(result.advancedEditing.copyReturned === true && result.advancedEditing.copyDelta === 0, 'copy should not mutate model');
  assert(result.advancedEditing.multiPaste.delta === 1, 'multi paste did not emit exactly once');
  assert(result.advancedEditing.multiPaste.change?.kind === 'node-create', 'multi paste change kind mismatch');
  assert(result.advancedEditing.multiPaste.newIds.length === 2, 'multi paste did not create two nodes');
  assert(new Set(result.advancedEditing.multiPaste.newIds).size === 2, 'multi paste ids collided');
  assert(result.advancedEditing.multiPaste.positionsSnapped, 'multi paste did not snap pasted positions');
  assert(result.advancedEditing.multiPaste.selectedNodeIds.length === 2, 'multi paste did not select pasted nodes');
  assert(result.advancedEditing.multiDelete.delta === 1, 'multi delete did not emit exactly once');
  assert(result.advancedEditing.multiDelete.change?.nodeIds?.length === 2, 'multi delete did not include both selected nodes');
  assert(result.advancedEditing.multiDelete.selectionCount === 0, 'multi delete did not clear selection');
  assert(result.advancedEditing.pointerGroupDrag.delta === 1, 'pointer group drag did not emit exactly once');
  assert(result.advancedEditing.pointerGroupDrag.change?.nodeIds?.length === 2, 'pointer group drag did not include both selected node ids');
  assert(result.advancedEditing.pointerGroupDrag.sourceDelta.x !== 0 && result.advancedEditing.pointerGroupDrag.plannerDelta.x !== 0, 'pointer group drag did not move both selected nodes');
  assert(
    result.advancedEditing.pointerGroupDrag.sourceDelta.x === result.advancedEditing.pointerGroupDrag.plannerDelta.x &&
      result.advancedEditing.pointerGroupDrag.sourceDelta.y === result.advancedEditing.pointerGroupDrag.plannerDelta.y,
    'pointer group drag moved selected nodes by different deltas',
  );
  assert(result.advancedEditing.pointerGroupDrag.selectionCount === 2, 'pointer group drag collapsed multi-selection');

  assert(result.commandExecutor.selectReturned === true, 'AI command selection failed');
  assert(result.commandExecutor.moveReturned === true, 'AI command move failed');
  assert(result.commandExecutor.move.delta === 1, 'AI command move did not emit exactly once');
  assert(result.commandExecutor.move.change?.kind === 'node-move' && result.commandExecutor.move.change?.source === 'ai', 'AI command move metadata is wrong');
  assert(result.commandExecutor.move.snapped, 'AI command move did not share snap behavior');
  assert(result.commandExecutor.resizeReturned === true, 'AI command resize failed');
  assert(result.commandExecutor.resize.delta === 1, 'AI command resize did not emit exactly once');
  assert(result.commandExecutor.resize.change?.kind === 'node-resize' && result.commandExecutor.resize.change?.source === 'ai', 'AI command resize metadata is wrong');
  assert(result.commandExecutor.resize.snapped, 'AI command resize did not share snap behavior');
  assert(result.commandExecutor.noopReturned === false && result.commandExecutor.noopDelta === 0, 'AI command no-op emitted a model change');

  assert(result.snapContract.pointerMove.delta === 1, 'pointer snap move did not emit exactly once');
  assert(result.snapContract.pointerMove.x === 32 && result.snapContract.pointerMove.y === 32, 'pointer move did not snap to nearest grid coordinate');
  assert(result.snapContract.pointerMove.snapped, 'pointer move final position is not grid-snapped');
  assert(result.snapContract.pointerResize.delta === 1, 'pointer snap resize did not emit exactly once');
  assert(result.snapContract.pointerResize.w === 192 && result.snapContract.pointerResize.h === 128, 'pointer resize did not snap to nearest grid size');
  assert(result.snapContract.pointerResize.snapped, 'pointer resize final size is not grid-snapped');
  assert(result.snapContract.pointerPreviewReturn.delta === 0, 'pointer return-to-origin preview committed a model change');
  assert(result.snapContract.pointerPreviewReturn.movedPreview.x === 32 && result.snapContract.pointerPreviewReturn.movedPreview.y === 32, 'pointer preview did not move to snapped cell');
  assert(
    result.snapContract.pointerPreviewReturn.modelDuringMovedPreview.x === 0 && result.snapContract.pointerPreviewReturn.modelDuringMovedPreview.y === 0,
    'pointer preview mutated committed model during move',
  );
  assert(result.snapContract.pointerPreviewReturn.returnedPreview === null, 'pointer no-op preview did not clear render-only geometry');
  assert(
    result.snapContract.pointerPreviewReturn.modelDuringReturnedPreview.x === 0 && result.snapContract.pointerPreviewReturn.modelDuringReturnedPreview.y === 0,
    'pointer return preview mutated committed model',
  );
  assert(result.snapContract.pointerPreviewReturn.previewSizeAfterCommit === 0, 'pointer preview geometry was not cleared after commit');
  assert(
    result.snapContract.pointerPreviewReturn.renderCountAfterReturn > result.snapContract.pointerPreviewReturn.renderCountAfterMove,
    'pointer no-op preview after rollback did not schedule a repaint',
  );
  for (const [name, entry] of Object.entries(result.cancellation)) {
    assert(entry.modelChangeDelta === 0, `${name} emitted a model change`);
    assert(entry.rolledBack === true, `${name} did not roll back`);
  }

  assert(result.touchPointerOwnership.afterSecondPointer.length === 0, 'second touch pointer committed active drag');
  assert(result.touchPointerOwnership.finalChanges.length === 1, 'active touch pointer did not commit exactly once');
  assert(result.touchPointerOwnership.finalChanges[0].kind === 'node-move', 'active touch commit kind mismatch');

  assert(result.multiTouchPolicy.twoFingerPanMovesViewportOnly.modelChangeDelta === 0, 'two-finger pan emitted model changes');
  assert(result.multiTouchPolicy.twoFingerPanMovesViewportOnly.cameraMoved, 'two-finger pan did not move the viewport');
  assert(result.multiTouchPolicy.twoFingerPanMovesViewportOnly.scaleDelta < 0.01, 'two-finger pan changed zoom unexpectedly');
  assert(result.multiTouchPolicy.pinchZoomMovesViewportOnly.modelChangeDelta === 0, 'pinch zoom emitted model changes');
  assert(result.multiTouchPolicy.pinchZoomMovesViewportOnly.zoomedIn, 'pinch did not increase zoom');
  assert(result.multiTouchPolicy.secondTouchCancelsNodeDragAndGestures.modelChangeDelta === 0, 'second-touch node drag emitted model changes');
  assert(result.multiTouchPolicy.secondTouchCancelsNodeDragAndGestures.rolledBack, 'second-touch node drag did not roll back');
  assert(result.multiTouchPolicy.secondTouchCancelsResizeAndGestures.modelChangeDelta === 0, 'second-touch resize emitted model changes');
  assert(result.multiTouchPolicy.secondTouchCancelsResizeAndGestures.rolledBack, 'second-touch resize did not roll back');
  assert(result.multiTouchPolicy.gestureCancelLeavesNoStuckState.modelChangeDelta === 0, 'canceled gesture emitted model changes');
  assert(result.multiTouchPolicy.gestureCancelLeavesNoStuckState.cameraStableAfterCancel, 'canceled gesture left active state behind');

  assert(result.longRunChurn.error === null, `long-run churn error: ${result.longRunChurn.error}`);
  assert(
    result.longRunChurn.modelCallbackCount === result.longRunChurn.expectedModelCallbacks,
    `long-run model callback count expected ${result.longRunChurn.expectedModelCallbacks}, got ${result.longRunChurn.modelCallbackCount}`,
  );
  for (const [key, count] of Object.entries(result.longRunChurn.balancedCounts)) {
    assert(count === 0, `long-run listener count not balanced for ${key}: ${count}`);
  }

  assert(result.lifecycle.error === null, `lifecycle error: ${result.lifecycle.error}`);
  assert(result.lifecycle.changesAfterDispose === 0, 'disposed engine emitted model changes');
  for (const [key, count] of Object.entries(result.lifecycle.balancedCounts)) {
    assert(count === 0, `lifecycle listener count not balanced for ${key}: ${count}`);
  }

  for (const entry of result.futureModelShape) {
    assert(entry.cullingCoherent, `future model culling incoherent for ${entry.name}`);
    assert(entry.modelCallbackCount === 0, `future model render emitted model changes for ${entry.name}`);
    assert(entry.errors.length === 0, `future model errors for ${entry.name}: ${entry.errors.join('; ')}`);
  }

  const perf1000 = result.largeGraphPerformance.find((entry) => entry.name === '1000-nodes');
  const perf2000 = result.largeGraphPerformance.find((entry) => entry.name === '2000-nodes');
  assert(perf1000?.rendered === 1000 && perf1000.total === 1000, '1000-node performance probe rendered incoherently');
  assert(perf2000?.rendered === 2000 && perf2000.total === 2000, '2000-node performance probe rendered incoherently');
  assert(perf1000.maxFrameMs < 100, `1000-node max frame exceeded target: ${perf1000.maxFrameMs}ms`);
  assert(perf2000.maxFrameMs < 200, `2000-node max frame exceeded target: ${perf2000.maxFrameMs}ms`);

  const severeBrowserEvents = browserEvents.filter((event) => {
    if (event.method === 'Network.loadingFailed' && event.errorText === 'net::ERR_ABORTED') return false;
    if (event.method === 'Log.entryAdded' && event.level === 'warning') return false;
    if (event.method === 'Runtime.consoleAPICalled' && ['debug', 'info', 'log'].includes(event.type)) return false;
    return true;
  });
  assert(severeBrowserEvents.length === 0, `browser console/network events found: ${JSON.stringify(severeBrowserEvents)}`);
}

async function main() {
  assert(
    await fileExists(chromePath),
    `Chrome not found at ${chromePath}. Set CANWAY_CHROME_PATH or CHROME_PATH to a compatible Chrome/Chromium binary.`,
  );

  const vitePort = await freePort();
  const chromePort = await freePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'canway-cdp-'));
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
    const targetsResponse = await waitForHttp(`http://127.0.0.1:${chromePort}/json/list`);
    const targets = await targetsResponse.json();
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
      expression:
        "(async () => { const probe = await import('/docs/canvas-foundation-devtools-probe.js'); return await probe.runCanwayFoundationProbe(); })()",
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) {
      throw new Error(evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text);
    }

    const result = evaluation.result.value;
    const browserEvents = summarizeBrowserEvents(cdp.events);
    assertProbe(result, browserEvents);

    const summary = {
      appUrl,
      browserEvents,
      app: result.app,
      modelBoundaryDeltas: result.modelBoundary.deltas,
      keyboardContract: result.keyboardContract,
      advancedEditing: result.advancedEditing,
      cancellation: result.cancellation,
      multiTouchPolicy: result.multiTouchPolicy,
      longRunChurn: result.longRunChurn,
      futureModelShape: result.futureModelShape,
      largeGraphPerformance: result.largeGraphPerformance,
      lifecycle: result.lifecycle,
    };
    console.log(JSON.stringify(summary, null, 2));
    console.log('Canvas foundation probe passed');
  } catch (error) {
    console.error('Canvas foundation probe failed');
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
