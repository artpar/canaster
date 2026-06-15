export async function runCanwayFoundationProbe() {
  const { CanvasEngine } = await import('/src/engine/CanvasEngine.ts');
  const { sampleModel } = await import('/src/engine/sampleModel.ts');
  const SNAP_STEP = 32;

  const raf = async (count = 1) => {
    for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  };
  const isSnapped = (value) => Math.abs(value / SNAP_STEP - Math.round(value / SNAP_STEP)) < 0.0001;
  const cloneModel = (model) => ({ nodes: model.nodes.map((node) => ({ ...node })) });
  const modelBounds = (model) => {
    if (!model.nodes.length) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const node of model.nodes) {
      x0 = Math.min(x0, node.x);
      y0 = Math.min(y0, node.y);
      x1 = Math.max(x1, node.x + node.w);
      y1 = Math.max(y1, node.y + node.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const fitCamera = (model, viewW, viewH, padding = 72) => {
    const bounds = modelBounds(model);
    if (!bounds) return { x: 0, y: 0, scale: 1 };
    const scale = Math.max(
      0.08,
      Math.min(1.5, Math.min((viewW - padding * 2) / bounds.w, (viewH - padding * 2) / bounds.h)),
    );
    return {
      scale,
      x: (viewW - bounds.w * scale) / 2 - bounds.x * scale,
      y: (viewH - bounds.h * scale) / 2 - bounds.y * scale,
    };
  };
  const screen = (camera, x, y) => ({ x: camera.x + x * camera.scale, y: camera.y + y * camera.scale });
  const dispatchPointer = (target, type, x, y, id = 1, pointerType = 'mouse') => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType,
        isPrimary: id === 1,
        buttons: type === 'pointerup' || type === 'pointercancel' || type === 'lostpointercapture' ? 0 : 1,
      }),
    );
  };
  const dispatchWheel = (target, x, y, deltaY, options = {}) => {
    target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaX: options.deltaX ?? 0, deltaY, ...options }));
  };
  const makeCanvas = (w = 800, h = 600) => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.opacity = '0';
    document.body.appendChild(canvas);
    return canvas;
  };

  async function withEngine(model, fn, options = {}) {
    const width = options.width ?? 800;
    const height = options.height ?? 600;
    const canvas = makeCanvas(width, height);
    const changes = [];
    const statuses = [];
    const engine = new CanvasEngine(canvas, {
      onStatus: (status) => statuses.push({ ...status, cursorWorld: status.cursorWorld ? { ...status.cursorWorld } : null }),
      onModelChange: (modelSnapshot, change) => changes.push({ model: cloneModel(modelSnapshot), change: { ...change } }),
    });
    engine.setModel(cloneModel(model));
    if (options.fit !== false) engine.fit();
    await raf(4);
    try {
      return await fn({
        canvas,
        engine,
        changes,
        statuses,
        camera: options.fit === false ? { x: 0, y: 0, scale: 1 } : fitCamera(model, width, height),
      });
    } finally {
      engine.dispose();
      canvas.remove();
      await raf(1);
    }
  }

  const appCanvas = document.querySelector('canvas[aria-label="Canway canvas"]');
  await raf(3);
  document.querySelector('button[aria-label="Open node panel"]')?.click();
  await raf(3);
  const appRect = appCanvas?.getBoundingClientRect();
  const app = appCanvas
    ? {
        css: { w: appRect.width, h: appRect.height },
        bitmap: { w: appCanvas.width, h: appCanvas.height },
        dpr: appCanvas.dataset.dpr,
        rendered: appCanvas.dataset.renderedNodes,
        total: appCanvas.dataset.totalNodes,
        tabIndex: appCanvas.tabIndex,
        ariaLabel: appCanvas.getAttribute('aria-label'),
        statusRole: document.querySelector('.statusbar')?.getAttribute('role') ?? null,
        statusLive: document.querySelector('.statusbar')?.getAttribute('aria-live') ?? null,
        nodeAccess: {
          label: document.querySelector('.node-access-panel')?.getAttribute('aria-label') ?? null,
          nodeCount: document.querySelectorAll('.node-access-row').length,
          selectedText: document.querySelector('.node-access-header')?.textContent?.trim() ?? '',
          nodeLabels: [...document.querySelectorAll('.node-access-select')].map((element) => element.textContent?.trim() ?? ''),
          actionLabels: [...document.querySelectorAll('.node-access-actions button')].map((element) => element.getAttribute('aria-label') ?? ''),
        },
        sequentialFocusables: [...document.querySelectorAll('button, canvas')]
          .filter((element) => !element.disabled && element.tabIndex >= 0)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
            tabIndex: element.tabIndex,
          })),
      }
    : null;

  const modelBoundary = await withEngine(sampleModel, async ({ canvas, engine, changes, camera }) => {
    const source = sampleModel.nodes.find((node) => node.id === 'source');
    const center = screen(camera, source.x + source.w / 2, source.y + source.h / 2);
    const deltas = {};
    const mark = async (name, action) => {
      const before = changes.length;
      await action();
      await raf(3);
      deltas[name] = changes.length - before;
    };

    await mark('hover', async () => dispatchPointer(canvas, 'pointermove', center.x, center.y, 100));
    await mark('selection', async () => {
      dispatchPointer(canvas, 'pointerdown', center.x, center.y, 101);
      dispatchPointer(window, 'pointerup', center.x, center.y, 101);
    });
    await mark('zeroDeltaDrag', async () => {
      dispatchPointer(canvas, 'pointerdown', center.x, center.y, 102);
      dispatchPointer(window, 'pointermove', center.x, center.y, 102);
      dispatchPointer(window, 'pointerup', center.x, center.y, 102);
    });
    await mark('realDrag', async () => {
      dispatchPointer(canvas, 'pointerdown', center.x, center.y, 103);
      dispatchPointer(window, 'pointermove', center.x + 60, center.y + 30, 103);
      dispatchPointer(window, 'pointerup', center.x + 60, center.y + 30, 103);
    });
    const moved = changes.at(-1).model.nodes.find((node) => node.id === 'source');
    const handle = screen(camera, moved.x + moved.w - 12, moved.y + moved.h - 12);
    await mark('zeroDeltaResize', async () => {
      dispatchPointer(canvas, 'pointerdown', handle.x, handle.y, 104);
      dispatchPointer(window, 'pointermove', handle.x, handle.y, 104);
      dispatchPointer(window, 'pointerup', handle.x, handle.y, 104);
    });
    await mark('realResize', async () => {
      dispatchPointer(canvas, 'pointerdown', handle.x, handle.y, 105);
      dispatchPointer(window, 'pointermove', handle.x + 80, handle.y + 40, 105);
      dispatchPointer(window, 'pointerup', handle.x + 80, handle.y + 40, 105);
    });
    await mark('wheel', async () => dispatchWheel(canvas, 400, 300, -200));
    await mark('doubleClick', async () => {
      canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 400, clientY: 300 }));
    });
    await mark('theme', async () => {
      engine.setTheme('light');
      engine.setTheme('dark');
    });
    await mark('canvasResize', async () => {
      canvas.style.width = '840px';
      canvas.style.height = '620px';
    });

    return { deltas, changes: changes.map((entry) => entry.change) };
  });

  const overlappingResize = await withEngine(sampleModel, async ({ canvas, changes, camera }) => {
    let source = sampleModel.nodes.find((node) => node.id === 'source');
    const center = screen(camera, source.x + source.w / 2, source.y + source.h / 2);
    dispatchPointer(canvas, 'pointerdown', center.x, center.y, 200);
    dispatchPointer(window, 'pointerup', center.x, center.y, 200);
    await raf(2);

    const counts = [];
    for (let i = 0; i < 8; i++) {
      const handle = screen(camera, source.x + source.w - 12, source.y + source.h - 12);
      const before = changes.length;
      dispatchPointer(canvas, 'pointerdown', handle.x, handle.y, 210 + i);
      dispatchPointer(window, 'pointermove', handle.x + 28, handle.y + 16, 210 + i);
      dispatchPointer(window, 'pointerup', handle.x + 28, handle.y + 16, 210 + i);
      await raf(2);
      counts.push({ delta: changes.length - before, change: changes.at(-1)?.change });
      source = changes.at(-1).model.nodes.find((node) => node.id === 'source');
    }
    return { counts, changes: changes.map((entry) => entry.change), finalSource: source };
  });

  const navigationContract = await withEngine(sampleModel, async ({ canvas, engine, changes }) => {
    const worldAt = (x, y) => ({ x: (x - engine.camera.x) / engine.camera.scale, y: (y - engine.camera.y) / engine.camera.scale });
    const result = {};

    const beforePlain = { ...engine.camera };
    const beforePlainChanges = changes.length;
    dispatchWheel(canvas, 320, 240, 80, { deltaX: 24 });
    await raf(3);
    result.plainWheelPan = {
      modelDelta: changes.length - beforePlainChanges,
      xMoved: engine.camera.x !== beforePlain.x,
      yMoved: engine.camera.y !== beforePlain.y,
      scaleStable: engine.camera.scale === beforePlain.scale,
      interaction: engine.interaction,
    };

    const beforeShift = { ...engine.camera };
    dispatchWheel(canvas, 320, 240, 96, { shiftKey: true });
    await raf(3);
    result.shiftWheelHorizontalPan = {
      xMoved: engine.camera.x !== beforeShift.x,
      yStable: engine.camera.y === beforeShift.y,
      scaleStable: engine.camera.scale === beforeShift.scale,
    };

    const zoomPoint = { x: 360, y: 260 };
    const beforeZoom = { ...engine.camera };
    const anchorBefore = worldAt(zoomPoint.x, zoomPoint.y);
    const beforeZoomChanges = changes.length;
    dispatchWheel(canvas, zoomPoint.x, zoomPoint.y, -180, { ctrlKey: true });
    await raf(3);
    const anchorAfter = worldAt(zoomPoint.x, zoomPoint.y);
    result.modifierWheelZoom = {
      modelDelta: changes.length - beforeZoomChanges,
      zoomed: engine.camera.scale > beforeZoom.scale,
      anchorStable: Math.abs(anchorAfter.x - anchorBefore.x) < 0.001 && Math.abs(anchorAfter.y - anchorBefore.y) < 0.001,
      interaction: engine.interaction,
    };

    return result;
  });

  const culling = await (async () => {
    const edge = { nodes: [{ id: 'edge', label: 'edge', detail: 'crosses viewport edge', kind: 'task', x: -50, y: 80, w: 160, h: 120 }] };
    const off = { nodes: [{ id: 'off', label: 'off', detail: 'fully offscreen', kind: 'task', x: 5000, y: 5000, w: 160, h: 120 }] };
    return {
      edge: await withEngine(edge, async ({ canvas }) => ({ rendered: canvas.dataset.renderedNodes, total: canvas.dataset.totalNodes }), {
        width: 400,
        height: 300,
        fit: false,
      }),
      off: await withEngine(off, async ({ canvas }) => ({ rendered: canvas.dataset.renderedNodes, total: canvas.dataset.totalNodes }), {
        width: 400,
        height: 300,
        fit: false,
      }),
    };
  })();

  const keyboardContract = await withEngine(sampleModel, async ({ canvas, engine, changes, statuses }) => {
    canvas.focus({ preventScroll: true });

    const noSelectionBefore = changes.length;
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
      canvas.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key }));
    }
    await raf(2);
    const noSelectionDelta = changes.length - noSelectionBefore;

    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    await raf(3);
    const selectedNodeId = statuses.at(-1)?.selectedNodeId;
    const selectedBefore = engine.model.nodes.find((node) => node.id === selectedNodeId);
    const beforeGeometry = selectedBefore ? { x: selectedBefore.x, y: selectedBefore.y, w: selectedBefore.w, h: selectedBefore.h } : null;

    const keyboardBefore = changes.length;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown', shiftKey: true }));
    await raf(3);
    const keyboardMoveChanges = changes.slice(keyboardBefore).map((entry) => entry.change);

    const selectedAfter = engine.model.nodes.find((node) => node.id === selectedNodeId);
    const geometryAfterMove = selectedAfter ? { x: selectedAfter.x, y: selectedAfter.y, w: selectedAfter.w, h: selectedAfter.h } : null;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'r' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }));
    await raf(3);
    const resizedAfter = engine.model.nodes.find((node) => node.id === selectedNodeId);
    const resizeChange = changes.at(-1)?.change;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    await raf(3);

    return {
      tabIndex: canvas.tabIndex,
      programmaticFocusWorks: document.activeElement === canvas,
      noSelectionDelta,
      selectedNodeId,
      keyboardChanges: keyboardMoveChanges,
      movedBy:
        beforeGeometry && geometryAfterMove
          ? {
              x: geometryAfterMove.x - beforeGeometry.x,
              y: geometryAfterMove.y - beforeGeometry.y,
              w: geometryAfterMove.w - beforeGeometry.w,
              h: geometryAfterMove.h - beforeGeometry.h,
            }
          : null,
      movedTo: geometryAfterMove,
      moveSnapped: geometryAfterMove ? isSnapped(geometryAfterMove.x) && isSnapped(geometryAfterMove.y) : false,
      resizedBy:
        geometryAfterMove && resizedAfter
          ? { x: resizedAfter.x - geometryAfterMove.x, y: resizedAfter.y - geometryAfterMove.y, w: resizedAfter.w - geometryAfterMove.w, h: resizedAfter.h - geometryAfterMove.h }
          : null,
      resizedTo: resizedAfter ? { x: resizedAfter.x, y: resizedAfter.y, w: resizedAfter.w, h: resizedAfter.h } : null,
      resizeSnapped: resizedAfter ? isSnapped(resizedAfter.w) : false,
      resizeChange,
      escapeExitedResizeMode: statuses.at(-1)?.interaction === 'Keyboard resize ended',
    };
  });

  const advancedEditing = await withEngine(sampleModel, async ({ canvas, engine, changes, statuses }) => {
    const result = {};
    const beforeNoop = changes.length;
    result.noSelectionDelete = engine.executeCommand({ type: 'delete-selection', source: 'keyboard' }) === false;
    result.noSelectionCopy = engine.executeCommand({ type: 'copy-selection', source: 'keyboard' }) === false;
    result.noClipboardPaste = engine.executeCommand({ type: 'paste-clipboard', source: 'keyboard' }) === false;
    await raf(2);
    result.noopDelta = changes.length - beforeNoop;

    engine.executeCommand({ type: 'select-node', nodeId: 'source', source: 'nonvisual' });
    await raf(2);
    const beforeNonvisualMove = changes.length;
    engine.executeCommand({ type: 'move-selection', dx: SNAP_STEP, dy: 0, source: 'nonvisual' });
    await raf(2);
    const sourceAfterNonvisualMove = engine.model.nodes.find((node) => node.id === 'source');
    result.nonvisualMove = {
      delta: changes.length - beforeNonvisualMove,
      change: changes.at(-1)?.change,
      sourceX: sourceAfterNonvisualMove?.x,
      snapped: sourceAfterNonvisualMove ? isSnapped(sourceAfterNonvisualMove.x) && isSnapped(sourceAfterNonvisualMove.y) : false,
    };

    const beforeNonvisualResize = changes.length;
    const widthBeforeResize = engine.model.nodes.find((node) => node.id === 'source')?.w;
    engine.executeCommand({ type: 'resize-primary', dw: SNAP_STEP, dh: 0, source: 'nonvisual' });
    await raf(2);
    const sourceAfterNonvisualResize = engine.model.nodes.find((node) => node.id === 'source');
    result.nonvisualResize = {
      delta: changes.length - beforeNonvisualResize,
      change: changes.at(-1)?.change,
      widthDelta: (sourceAfterNonvisualResize?.w ?? 0) - (widthBeforeResize ?? 0),
      width: sourceAfterNonvisualResize?.w,
      widthSnapped: sourceAfterNonvisualResize ? isSnapped(sourceAfterNonvisualResize.w) : false,
    };

    engine.executeCommand({ type: 'select-node', nodeId: 'source', source: 'nonvisual' });
    const beforeSingleDelete = changes.length;
    engine.executeCommand({ type: 'delete-selection', source: 'keyboard' });
    await raf(2);
    result.singleDelete = {
      delta: changes.length - beforeSingleDelete,
      change: changes.at(-1)?.change,
      exists: engine.model.nodes.some((node) => node.id === 'source'),
      selectionCount: statuses.at(-1)?.selectionCount,
    };

    engine.setModel(cloneModel(sampleModel));
    await raf(2);
    engine.executeCommand({ type: 'select-node', nodeId: 'source', source: 'nonvisual' });
    engine.executeCommand({ type: 'select-node', nodeId: 'planner', mode: 'toggle', source: 'nonvisual' });
    await raf(2);
    const beforeMultiMove = changes.length;
    const beforeSource = { ...engine.model.nodes.find((node) => node.id === 'source') };
    const beforePlanner = { ...engine.model.nodes.find((node) => node.id === 'planner') };
    engine.executeCommand({ type: 'move-selection', dx: SNAP_STEP * 2, dy: SNAP_STEP, source: 'keyboard' });
    await raf(2);
    const afterSource = engine.model.nodes.find((node) => node.id === 'source');
    const afterPlanner = engine.model.nodes.find((node) => node.id === 'planner');
    result.multiMove = {
      delta: changes.length - beforeMultiMove,
      change: changes.at(-1)?.change,
      sourceDelta: { x: afterSource.x - beforeSource.x, y: afterSource.y - beforeSource.y },
      plannerDelta: { x: afterPlanner.x - beforePlanner.x, y: afterPlanner.y - beforePlanner.y },
      sourceSnapped: isSnapped(afterSource.x) && isSnapped(afterSource.y),
      plannerSnapped: isSnapped(afterPlanner.x) && isSnapped(afterPlanner.y),
      selectionCount: statuses.at(-1)?.selectionCount,
    };

    const beforeCopy = changes.length;
    result.copyReturned = engine.executeCommand({ type: 'copy-selection', source: 'keyboard' });
    await raf(1);
    result.copyDelta = changes.length - beforeCopy;
    const beforePaste = changes.length;
    const idsBeforePaste = new Set(engine.model.nodes.map((node) => node.id));
    engine.executeCommand({ type: 'paste-clipboard', source: 'keyboard' });
    await raf(3);
    const pasteChange = changes.at(-1)?.change;
    const pastedNodes = engine.model.nodes.filter((node) => !idsBeforePaste.has(node.id));
    result.multiPaste = {
      delta: changes.length - beforePaste,
      change: pasteChange,
      totalNodes: engine.model.nodes.length,
      newIds: pastedNodes.map((node) => node.id),
      positionsSnapped: pastedNodes.every((node) => isSnapped(node.x) && isSnapped(node.y)),
      selectedNodeIds: statuses.at(-1)?.selectedNodeIds ?? [],
    };

    const beforeMultiDelete = changes.length;
    engine.executeCommand({ type: 'delete-selection', source: 'nonvisual' });
    await raf(2);
    result.multiDelete = {
      delta: changes.length - beforeMultiDelete,
      change: changes.at(-1)?.change,
      remainingIds: engine.model.nodes.map((node) => node.id),
      selectionCount: statuses.at(-1)?.selectionCount,
    };

    engine.setModel(cloneModel(sampleModel));
    await raf(2);
    engine.executeCommand({ type: 'select-node', nodeId: 'source', source: 'nonvisual' });
    engine.executeCommand({ type: 'select-node', nodeId: 'planner', mode: 'toggle', source: 'nonvisual' });
    await raf(2);
    const beforePointerGroupDrag = changes.length;
    const groupBeforeSource = { ...engine.model.nodes.find((node) => node.id === 'source') };
    const groupBeforePlanner = { ...engine.model.nodes.find((node) => node.id === 'planner') };
    const groupPoint = {
      x: engine.camera.x + (groupBeforeSource.x + groupBeforeSource.w / 2) * engine.camera.scale,
      y: engine.camera.y + (groupBeforeSource.y + groupBeforeSource.h / 2) * engine.camera.scale,
    };
    dispatchPointer(canvas, 'pointerdown', groupPoint.x, groupPoint.y, 650);
    dispatchPointer(window, 'pointermove', groupPoint.x + 80, groupPoint.y + 30, 650);
    dispatchPointer(window, 'pointerup', groupPoint.x + 80, groupPoint.y + 30, 650);
    await raf(3);
    const groupAfterSource = engine.model.nodes.find((node) => node.id === 'source');
    const groupAfterPlanner = engine.model.nodes.find((node) => node.id === 'planner');
    result.pointerGroupDrag = {
      delta: changes.length - beforePointerGroupDrag,
      change: changes.at(-1)?.change,
      sourceDelta: { x: groupAfterSource.x - groupBeforeSource.x, y: groupAfterSource.y - groupBeforeSource.y },
      plannerDelta: { x: groupAfterPlanner.x - groupBeforePlanner.x, y: groupAfterPlanner.y - groupBeforePlanner.y },
      selectionCount: statuses.at(-1)?.selectionCount,
      selectedNodeIds: statuses.at(-1)?.selectedNodeIds ?? [],
    };

    return result;
  });

  const commandExecutor = await withEngine(sampleModel, async ({ engine, changes }) => {
    const result = {};
    result.selectReturned = engine.executeCommand({ type: 'select-node', nodeId: 'source', mode: 'replace', source: 'ai' });
    const beforeMove = changes.length;
    result.moveReturned = engine.executeCommand({ type: 'move-selection', dx: SNAP_STEP, dy: 0, source: 'ai' });
    const moved = engine.model.nodes.find((node) => node.id === 'source');
    result.move = {
      delta: changes.length - beforeMove,
      change: changes.at(-1)?.change,
      snapped: moved ? isSnapped(moved.x) && isSnapped(moved.y) : false,
    };
    const beforeResize = changes.length;
    result.resizeReturned = engine.executeCommand({ type: 'resize-primary', dw: SNAP_STEP, dh: 0, source: 'ai' });
    const resized = engine.model.nodes.find((node) => node.id === 'source');
    result.resize = {
      delta: changes.length - beforeResize,
      change: changes.at(-1)?.change,
      snapped: resized ? isSnapped(resized.w) : false,
    };
    const beforeNoop = changes.length;
    result.noopReturned = engine.executeCommand({ type: 'move-selection', dx: 0, dy: 0, source: 'ai' });
    result.noopDelta = changes.length - beforeNoop;
    return result;
  });

  const snapContract = await withEngine(
    { nodes: [{ id: 'snap', label: 'Snap Target', detail: 'grid snap probe', kind: 'task', x: 0, y: 0, w: 160, h: 96 }] },
    async ({ canvas, engine, changes }) => {
      const result = {};
      const center = () => {
        const node = engine.model.nodes[0];
        return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
      };
      const handle = () => {
        const node = engine.model.nodes[0];
        return { x: node.x + node.w - 12, y: node.y + node.h - 12 };
      };

      let point = center();
      const beforeSnappedMove = changes.length;
      dispatchPointer(canvas, 'pointerdown', point.x, point.y, 701);
      dispatchPointer(window, 'pointermove', point.x + 45, point.y + 45, 701);
      dispatchPointer(window, 'pointerup', point.x + 45, point.y + 45, 701);
      await raf(3);
      let node = engine.model.nodes[0];
      result.pointerMove = {
        delta: changes.length - beforeSnappedMove,
        x: node.x,
        y: node.y,
        snapped: isSnapped(node.x) && isSnapped(node.y),
      };

      point = handle();
      const beforeSnappedResize = changes.length;
      dispatchPointer(canvas, 'pointerdown', point.x, point.y, 702);
      dispatchPointer(window, 'pointermove', point.x + 23, point.y + 23, 702);
      dispatchPointer(window, 'pointerup', point.x + 23, point.y + 23, 702);
      await raf(3);
      node = engine.model.nodes[0];
      result.pointerResize = {
        delta: changes.length - beforeSnappedResize,
        w: node.w,
        h: node.h,
        snapped: isSnapped(node.w) && isSnapped(node.h),
      };

      engine.setModel({ nodes: [{ id: 'snap', label: 'Snap Target', detail: 'grid snap probe', kind: 'task', x: 0, y: 0, w: 160, h: 96 }] });
      await raf(3);
      let renderCount = 0;
      const originalRender = engine.render?.bind(engine);
      if (originalRender) {
        engine.render = () => {
          renderCount++;
          return originalRender();
        };
      }
      point = center();
      const beforeReturnPreview = changes.length;
      dispatchPointer(canvas, 'pointerdown', point.x, point.y, 703);
      dispatchPointer(window, 'pointermove', point.x + 45, point.y + 45, 703);
      await raf(3);
      const movedPreview = engine.previewGeometries.get('snap') ?? null;
      const modelDuringMovedPreview = { x: engine.model.nodes[0].x, y: engine.model.nodes[0].y };
      const renderCountAfterMove = renderCount;
      dispatchPointer(window, 'pointermove', point.x + 5, point.y + 5, 703);
      await raf(3);
      const returnedPreview = engine.previewGeometries.get('snap') ?? null;
      const modelDuringReturnedPreview = { x: engine.model.nodes[0].x, y: engine.model.nodes[0].y };
      const renderCountAfterReturn = renderCount;
      dispatchPointer(window, 'pointerup', point.x + 5, point.y + 5, 703);
      await raf(3);
      result.pointerPreviewReturn = {
        delta: changes.length - beforeReturnPreview,
        movedPreview,
        modelDuringMovedPreview,
        returnedPreview,
        modelDuringReturnedPreview,
        previewSizeAfterCommit: engine.previewGeometries.size,
        renderCountAfterMove,
        renderCountAfterReturn,
      };

      return result;
    },
    { width: 420, height: 320, fit: false },
  );

  const cancellation = await withEngine(sampleModel, async ({ canvas, engine, changes, camera }) => {
    const source = engine.model.nodes.find((node) => node.id === 'source');
    const original = { x: source.x, y: source.y, w: source.w, h: source.h };
    const center = screen(camera, source.x + source.w / 2, source.y + source.h / 2);
    const blank = screen(camera, source.x - 70, source.y - 70);
    const originalCamera = { ...engine.camera };
    const geometry = () => ({ x: source.x, y: source.y, w: source.w, h: source.h });
    const handle = () => screen(camera, source.x + source.w - 12, source.y + source.h - 12);
    const sameGeometry = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    const sameCamera = (a, b) => a.x === b.x && a.y === b.y && a.scale === b.scale;
    const results = {};

    const mark = async (name, run, check) => {
      const before = changes.length;
      await run();
      await raf(3);
      results[name] = { modelChangeDelta: changes.length - before, ...check() };
    };

    await mark(
      'nodePointerCancel',
      async () => {
        dispatchPointer(canvas, 'pointerdown', center.x, center.y, 301);
        dispatchPointer(window, 'pointermove', center.x + 50, center.y + 20, 301);
        dispatchPointer(canvas, 'pointercancel', center.x + 50, center.y + 20, 301);
      },
      () => ({ rolledBack: sameGeometry(geometry(), original) }),
    );
    await mark(
      'nodeLostPointerCapture',
      async () => {
        dispatchPointer(canvas, 'pointerdown', center.x, center.y, 302);
        dispatchPointer(window, 'pointermove', center.x + 50, center.y + 20, 302);
        dispatchPointer(canvas, 'lostpointercapture', center.x + 50, center.y + 20, 302);
      },
      () => ({ rolledBack: sameGeometry(geometry(), original) }),
    );
    await mark(
      'resizePointerCancel',
      async () => {
        const point = handle();
        dispatchPointer(canvas, 'pointerdown', point.x, point.y, 303);
        dispatchPointer(window, 'pointermove', point.x + 50, point.y + 20, 303);
        dispatchPointer(canvas, 'pointercancel', point.x + 50, point.y + 20, 303);
      },
      () => ({ rolledBack: sameGeometry(geometry(), original) }),
    );
    await mark(
      'resizeLostPointerCapture',
      async () => {
        const point = handle();
        dispatchPointer(canvas, 'pointerdown', point.x, point.y, 304);
        dispatchPointer(window, 'pointermove', point.x + 50, point.y + 20, 304);
        dispatchPointer(canvas, 'lostpointercapture', point.x + 50, point.y + 20, 304);
      },
      () => ({ rolledBack: sameGeometry(geometry(), original) }),
    );
    await mark(
      'panPointerCancel',
      async () => {
        dispatchPointer(canvas, 'pointerdown', blank.x, blank.y, 305);
        dispatchPointer(window, 'pointermove', blank.x + 50, blank.y + 20, 305);
        dispatchPointer(canvas, 'pointercancel', blank.x + 50, blank.y + 20, 305);
      },
      () => ({ rolledBack: sameCamera(engine.camera, originalCamera) }),
    );
    await mark(
      'panLostPointerCapture',
      async () => {
        dispatchPointer(canvas, 'pointerdown', blank.x, blank.y, 306);
        dispatchPointer(window, 'pointermove', blank.x + 50, blank.y + 20, 306);
        dispatchPointer(canvas, 'lostpointercapture', blank.x + 50, blank.y + 20, 306);
      },
      () => ({ rolledBack: sameCamera(engine.camera, originalCamera) }),
    );

    return results;
  });

  const touchPointerOwnership = await withEngine(sampleModel, async ({ canvas, changes, camera }) => {
    const source = sampleModel.nodes.find((node) => node.id === 'source');
    const center = screen(camera, source.x + source.w / 2, source.y + source.h / 2);

    dispatchPointer(canvas, 'pointerdown', center.x, center.y, 21, 'touch');
    dispatchPointer(window, 'pointermove', center.x + 50, center.y, 22, 'touch');
    dispatchPointer(window, 'pointerup', center.x + 50, center.y, 22, 'touch');
    await raf(3);
    const afterSecondPointer = changes.map((entry) => entry.change);

    dispatchPointer(window, 'pointermove', center.x + 80, center.y, 21, 'touch');
    dispatchPointer(window, 'pointerup', center.x + 80, center.y, 21, 'touch');
    await raf(3);

    return {
      afterSecondPointer,
      finalChanges: changes.map((entry) => entry.change),
    };
  });

  const multiTouchPolicy = await withEngine(sampleModel, async ({ canvas, engine, changes }) => {
    const source = engine.model.nodes.find((node) => node.id === 'source');
    const originalSource = { x: source.x, y: source.y, w: source.w, h: source.h };
    const screenPoint = (x, y) => ({ x: engine.camera.x + x * engine.camera.scale, y: engine.camera.y + y * engine.camera.scale });
    const center = () => screenPoint(source.x + source.w / 2, source.y + source.h / 2);
    const activeHandle = () => screenPoint(source.x + source.w - 12, source.y + source.h - 12);
    const sameGeometry = (node, geometry) => node.x === geometry.x && node.y === geometry.y && node.w === geometry.w && node.h === geometry.h;
    const results = {};

    const record = async (name, run, check) => {
      const before = changes.length;
      await run();
      await raf(3);
      results[name] = { modelChangeDelta: changes.length - before, ...check() };
    };

    await record(
      'twoFingerPanMovesViewportOnly',
      async () => {
        results.panBeforeCamera = { ...engine.camera };
        dispatchPointer(canvas, 'pointerdown', 180, 180, 401, 'touch');
        dispatchPointer(canvas, 'pointerdown', 300, 180, 402, 'touch');
        dispatchPointer(window, 'pointermove', 220, 210, 401, 'touch');
        dispatchPointer(window, 'pointermove', 340, 210, 402, 'touch');
        dispatchPointer(window, 'pointerup', 220, 210, 401, 'touch');
        dispatchPointer(window, 'pointerup', 340, 210, 402, 'touch');
      },
      () => ({
        cameraMoved:
          engine.camera.x !== results.panBeforeCamera.x ||
          engine.camera.y !== results.panBeforeCamera.y ||
          engine.camera.scale !== results.panBeforeCamera.scale,
        scaleDelta: Math.abs(engine.camera.scale - results.panBeforeCamera.scale),
      }),
    );

    await record(
      'pinchZoomMovesViewportOnly',
      async () => {
        results.pinchBeforeCamera = { ...engine.camera };
        dispatchPointer(canvas, 'pointerdown', 260, 320, 403, 'touch');
        dispatchPointer(canvas, 'pointerdown', 360, 320, 404, 'touch');
        dispatchPointer(window, 'pointermove', 210, 320, 403, 'touch');
        dispatchPointer(window, 'pointermove', 410, 320, 404, 'touch');
        dispatchPointer(window, 'pointerup', 210, 320, 403, 'touch');
        dispatchPointer(window, 'pointerup', 410, 320, 404, 'touch');
      },
      () => ({ zoomedIn: engine.camera.scale > results.pinchBeforeCamera.scale }),
    );

    await record(
      'secondTouchCancelsNodeDragAndGestures',
      async () => {
        const point = center();
        dispatchPointer(canvas, 'pointerdown', point.x, point.y, 405, 'touch');
        dispatchPointer(window, 'pointermove', point.x + 60, point.y, 405, 'touch');
        dispatchPointer(canvas, 'pointerdown', point.x + 120, point.y, 406, 'touch');
        dispatchPointer(window, 'pointermove', point.x + 20, point.y + 30, 405, 'touch');
        dispatchPointer(window, 'pointermove', point.x + 150, point.y + 30, 406, 'touch');
        dispatchPointer(window, 'pointerup', point.x + 20, point.y + 30, 405, 'touch');
        dispatchPointer(window, 'pointerup', point.x + 150, point.y + 30, 406, 'touch');
      },
      () => ({ rolledBack: sameGeometry(source, originalSource) }),
    );

    await record(
      'secondTouchCancelsResizeAndGestures',
      async () => {
        const point = center();
        dispatchPointer(canvas, 'pointerdown', point.x, point.y, 407, 'touch');
        dispatchPointer(window, 'pointerup', point.x, point.y, 407, 'touch');
        await raf(2);
        const handle = activeHandle();
        dispatchPointer(canvas, 'pointerdown', handle.x, handle.y, 408, 'touch');
        dispatchPointer(window, 'pointermove', handle.x + 80, handle.y + 30, 408, 'touch');
        dispatchPointer(canvas, 'pointerdown', handle.x + 140, handle.y, 409, 'touch');
        dispatchPointer(window, 'pointermove', handle.x + 20, handle.y + 40, 408, 'touch');
        dispatchPointer(window, 'pointermove', handle.x + 160, handle.y + 40, 409, 'touch');
        dispatchPointer(window, 'pointerup', handle.x + 20, handle.y + 40, 408, 'touch');
        dispatchPointer(window, 'pointerup', handle.x + 160, handle.y + 40, 409, 'touch');
      },
      () => ({ rolledBack: sameGeometry(source, originalSource) }),
    );

    await record(
      'gestureCancelLeavesNoStuckState',
      async () => {
        dispatchPointer(canvas, 'pointerdown', 240, 260, 410, 'touch');
        dispatchPointer(canvas, 'pointerdown', 340, 260, 411, 'touch');
        dispatchPointer(window, 'pointermove', 220, 270, 410, 'touch');
        dispatchPointer(window, 'pointermove', 360, 270, 411, 'touch');
        dispatchPointer(canvas, 'pointercancel', 220, 270, 410, 'touch');
        results.cancelCamera = { ...engine.camera };
        dispatchPointer(window, 'pointermove', 500, 500, 411, 'touch');
        dispatchPointer(window, 'pointerup', 500, 500, 411, 'touch');
      },
      () => ({
        cameraStableAfterCancel:
          engine.camera.x === results.cancelCamera.x &&
          engine.camera.y === results.cancelCamera.y &&
          engine.camera.scale === results.cancelCamera.scale,
      }),
    );

    return results;
  });

  const longRunChurn = await (async () => {
    const memoryBefore = performance.memory
      ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        }
      : null;
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const counts = new Map();
    const keyFor = (target, type) => `${target === window ? 'window' : target instanceof HTMLCanvasElement ? 'canvas' : 'other'}:${type}`;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const key = keyFor(this, type);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const key = keyFor(this, type);
      counts.set(key, (counts.get(key) ?? 0) - 1);
      return originalRemove.call(this, type, listener, options);
    };

    let modelCallbackCount = 0;
    let statusCallbackCount = 0;
    let error = null;
    const iterations = 60;
    try {
      for (let i = 0; i < iterations; i++) {
        const canvas = makeCanvas(640, 420);
        const engine = new CanvasEngine(canvas, {
          onStatus: () => statusCallbackCount++,
          onModelChange: () => modelCallbackCount++,
        });
        engine.setModel(cloneModel(sampleModel));
        engine.fit();
        await raf(2);
        const camera = fitCamera(sampleModel, 640, 420);
        const source = sampleModel.nodes.find((node) => node.id === 'source');
        const center = screen(camera, source.x + source.w / 2, source.y + source.h / 2);
        const blank = screen(camera, source.x - 70, source.y - 70);
        const handle = screen(camera, source.x + source.w - 12, source.y + source.h - 12);

        dispatchPointer(canvas, 'pointerdown', center.x, center.y, 5000 + i * 5);
        dispatchPointer(window, 'pointermove', center.x + 45, center.y + 20, 5000 + i * 5);
        dispatchPointer(window, 'pointerup', center.x + 45, center.y + 20, 5000 + i * 5);
        dispatchPointer(canvas, 'pointerdown', handle.x, handle.y, 5001 + i * 5);
        dispatchPointer(window, 'pointermove', handle.x + 23, handle.y + 23, 5001 + i * 5);
        dispatchPointer(window, 'pointerup', handle.x + 23, handle.y + 23, 5001 + i * 5);
        dispatchPointer(canvas, 'pointerdown', center.x, center.y, 5002 + i * 5);
        dispatchPointer(window, 'pointermove', center.x + 6, center.y, 5002 + i * 5);
        dispatchPointer(canvas, 'pointercancel', center.x + 6, center.y, 5002 + i * 5);
        dispatchPointer(canvas, 'pointerdown', blank.x, blank.y, 5003 + i * 5);
        dispatchPointer(window, 'pointermove', blank.x + 5, blank.y + 5, 5003 + i * 5);
        dispatchPointer(canvas, 'pointercancel', blank.x + 5, blank.y + 5, 5003 + i * 5);
        for (let wheel = 0; wheel < 4; wheel++) dispatchWheel(canvas, 320, 210, wheel % 2 === 0 ? -120 : 120);
        engine.setTheme(i % 2 === 0 ? 'light' : 'dark');
        engine.setTheme(i % 2 === 0 ? 'dark' : 'light');
        await raf(2);
        engine.dispose();
        canvas.remove();
        await raf(1);
      }
    } catch (caught) {
      error = String(caught?.stack ?? caught);
    } finally {
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
    }
    await raf(4);
    const memoryAfter = performance.memory
      ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        }
      : null;

    return {
      iterations,
      modelCallbackCount,
      expectedModelCallbacks: iterations * 2,
      statusCallbackCount,
      balancedCounts: Object.fromEntries([...counts.entries()].sort()),
      memoryBefore,
      memoryAfter,
      error,
    };
  })();

  const futureModelShape = await (async () => {
    const makeNode = (id, x, y, w = 160, h = 96, label = id, detail = `Detail for ${id}`) => ({
      id,
      label,
      detail,
      kind: 'task',
      x,
      y,
      w,
      h,
    });
    const grid = (count, columns, gap = 210) => ({
      nodes: Array.from({ length: count }, (_, i) => makeNode(`node-${i}`, (i % columns) * gap, Math.floor(i / columns) * 140)),
    });
    const cases = [
      { name: '1000-nodes', model: grid(1000, 40) },
      { name: '2000-nodes', model: grid(2000, 50) },
      {
        name: 'dense-overlap',
        model: { nodes: Array.from({ length: 180 }, (_, i) => makeNode(`dense-${i}`, 180 + (i % 12) * 4, 140 + Math.floor(i / 12) * 3)) },
      },
      { name: 'extreme-coordinates', model: { nodes: [makeNode('neg-far', -100000, -80000), makeNode('pos-far', 120000, 90000)] } },
      { name: 'min-size-nodes', model: { nodes: [makeNode('min-a', 0, 0, 140, 76), makeNode('min-b', 170, 0, 140, 76)] } },
      { name: 'very-wide-tall', model: { nodes: [makeNode('wide', 0, 0, 1600, 96), makeNode('tall', 0, 140, 160, 1600)] } },
      {
        name: 'long-text',
        model: {
          nodes: [
            makeNode(
              'long-text',
              0,
              0,
              220,
              132,
              'SupercalifragilisticexpialidociousUnbrokenCanvasLabelWithoutSpaces',
              'A very long multiword detail value that should wrap predictably and then clip without changing model data or throwing during paint',
            ),
          ],
        },
      },
      {
        name: 'mixed-near-far',
        model: { nodes: [makeNode('near', 20, 20), makeNode('far-1', 20000, 12000), makeNode('far-2', -26000, -16000)] },
      },
      {
        name: 'unusual-valid-ids-labels',
        model: {
          nodes: [
            makeNode('id with spaces', 0, 0, 180, 96, 'label with spaces', 'punctuation !@#$%^&*()[]{}'),
            makeNode('id/slash?query#hash', 210, 0, 180, 96, 'slash / query ? hash #', 'quotes "single" and backtick ` values'),
          ],
        },
      },
    ];
    const errors = [];
    const onError = (event) => errors.push(String(event.message ?? event.error ?? event));
    const onRejection = (event) => errors.push(String(event.reason ?? event));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    try {
      const results = [];
      for (const testCase of cases) {
        const result = await withEngine(
          testCase.model,
          async ({ canvas, changes, statuses }) => {
            const startedAt = performance.now();
            await raf(6);
            const rendered = Number(canvas.dataset.renderedNodes ?? 0);
            const total = Number(canvas.dataset.totalNodes ?? 0);
            return {
              rendered,
              total,
              elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
              modelCallbackCount: changes.length,
              statusCallbackCount: statuses.length,
              cullingCoherent: Number.isFinite(rendered) && Number.isFinite(total) && rendered >= 0 && rendered <= total,
              errors: [...errors],
            };
          },
          { width: 1000, height: 720 },
        );
        results.push({ name: testCase.name, ...result });
      }
      return results;
    } finally {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    }
  })();

  const largeGraphPerformance = await (async () => {
    const makeNode = (id, x, y) => ({
      id,
      label: `Node ${id}`,
      detail: `Dense render detail for ${id}`,
      kind: 'task',
      x,
      y,
      w: 160,
      h: 96,
    });
    const grid = (count, columns, gap = 210) => ({
      nodes: Array.from({ length: count }, (_, i) => makeNode(i, (i % columns) * gap, Math.floor(i / columns) * 140)),
    });
    const measure = async (name, model) =>
      await withEngine(
        model,
        async ({ canvas, engine, changes }) => {
          engine.setModel(cloneModel(model));
          engine.fit();
          const startedAt = performance.now();
          await raf(1);
          const firstFrameMs = performance.now() - startedAt;
          const frameDeltas = [];
          let last = performance.now();
          for (let i = 0; i < 10; i++) {
            await raf(1);
            const now = performance.now();
            frameDeltas.push(now - last);
            last = now;
          }
          const maxFrameMs = Math.max(firstFrameMs, ...frameDeltas);
          const avgFrameMs = [firstFrameMs, ...frameDeltas].reduce((sum, value) => sum + value, 0) / (frameDeltas.length + 1);
          return {
            name,
            rendered: Number(canvas.dataset.renderedNodes ?? 0),
            total: Number(canvas.dataset.totalNodes ?? 0),
            firstFrameMs: Math.round(firstFrameMs * 10) / 10,
            maxFrameMs: Math.round(maxFrameMs * 10) / 10,
            avgFrameMs: Math.round(avgFrameMs * 10) / 10,
            modelCallbackCount: changes.length,
          };
        },
        { width: 1000, height: 720 },
      );

    return [await measure('1000-nodes', grid(1000, 40)), await measure('2000-nodes', grid(2000, 50))];
  })();

  const lifecycle = await (async () => {
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const counts = new Map();
    const keyFor = (target, type) => `${target === window ? 'window' : target instanceof HTMLCanvasElement ? 'canvas' : 'other'}:${type}`;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const key = keyFor(this, type);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const key = keyFor(this, type);
      counts.set(key, (counts.get(key) ?? 0) - 1);
      return originalRemove.call(this, type, listener, options);
    };
    const changes = [];
    let error = null;
    try {
      const canvas = makeCanvas(400, 300);
      const engine = new CanvasEngine(canvas, { onModelChange: (_model, change) => changes.push(change) });
      engine.setModel(cloneModel(sampleModel));
      engine.fit();
      await raf(1);
      engine.dispose();
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10, pointerId: 900, pointerType: 'mouse' }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10, pointerId: 900, pointerType: 'mouse' }));
      canvas.remove();
      await raf(2);
    } catch (caught) {
      error = String(caught?.stack ?? caught);
    } finally {
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
    }
    return { balancedCounts: Object.fromEntries([...counts.entries()].sort()), changesAfterDispose: changes.length, error };
  })();

  return {
    app,
    modelBoundary,
    overlappingResize,
    navigationContract,
    culling,
    keyboardContract,
    advancedEditing,
    commandExecutor,
    snapContract,
    cancellation,
    touchPointerOwnership,
    multiTouchPolicy,
    longRunChurn,
    futureModelShape,
    largeGraphPerformance,
    lifecycle,
  };
}
