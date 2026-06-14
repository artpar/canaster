export async function runCanwayFoundationProbe() {
  const { CanvasEngine } = await import('/src/engine/CanvasEngine.ts');
  const { sampleModel } = await import('/src/engine/sampleModel.ts');

  const raf = async (count = 1) => {
    for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  };
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
  const dispatchWheel = (target, x, y, deltaY) => {
    target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY }));
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

  const keyboardContract = await withEngine(sampleModel, async ({ canvas, changes }) => {
    const before = changes.length;
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', 'Enter', 'Escape', ' '];
    canvas.focus({ preventScroll: true });
    for (const key of keys) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
      canvas.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key }));
    }
    await raf(3);
    return {
      tabIndex: canvas.tabIndex,
      programmaticFocusWorks: document.activeElement === canvas,
      keyModelChangeDelta: changes.length - before,
      testedKeys: keys,
    };
  });

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

  const multiTouchPolicy = await withEngine(sampleModel, async ({ canvas, engine, changes, camera }) => {
    const source = engine.model.nodes.find((node) => node.id === 'source');
    const center = screen(camera, source.x + source.w / 2, source.y + source.h / 2);
    const blank = screen(camera, source.x - 70, source.y - 70);
    const activeHandle = () => screen(camera, source.x + source.w - 12, source.y + source.h - 12);
    const results = {};

    const record = async (name, run, check) => {
      const before = changes.length;
      await run();
      await raf(3);
      results[name] = { modelChangeDelta: changes.length - before, ...check() };
    };

    await record(
      'nodeIgnoresSecondPointerAndCommitsActive',
      async () => {
        dispatchPointer(canvas, 'pointerdown', center.x, center.y, 401, 'touch');
        dispatchPointer(window, 'pointermove', center.x + 60, center.y, 402, 'touch');
        dispatchPointer(window, 'pointerup', center.x + 60, center.y, 402, 'touch');
        dispatchPointer(canvas, 'pointercancel', center.x + 60, center.y, 402, 'touch');
        dispatchPointer(canvas, 'lostpointercapture', center.x + 60, center.y, 402, 'touch');
        dispatchPointer(window, 'pointermove', center.x + 70, center.y, 401, 'touch');
        dispatchPointer(window, 'pointerup', center.x + 70, center.y, 401, 'touch');
      },
      () => ({ lastChange: changes.at(-1)?.change }),
    );

    await record(
      'resizeIgnoresSecondPointerAndCommitsActive',
      async () => {
        const point = activeHandle();
        dispatchPointer(canvas, 'pointerdown', point.x, point.y, 403, 'touch');
        dispatchPointer(window, 'pointermove', point.x + 60, point.y, 404, 'touch');
        dispatchPointer(window, 'pointerup', point.x + 60, point.y, 404, 'touch');
        dispatchPointer(canvas, 'pointercancel', point.x + 60, point.y, 404, 'touch');
        dispatchPointer(canvas, 'lostpointercapture', point.x + 60, point.y, 404, 'touch');
        dispatchPointer(window, 'pointermove', point.x + 70, point.y + 30, 403, 'touch');
        dispatchPointer(window, 'pointerup', point.x + 70, point.y + 30, 403, 'touch');
      },
      () => ({ lastChange: changes.at(-1)?.change }),
    );

    await record(
      'panIgnoresSecondPointerAndCommitsActive',
      async () => {
        const beforeCamera = { ...engine.camera };
        results.panBeforeCamera = beforeCamera;
        dispatchPointer(canvas, 'pointerdown', blank.x, blank.y, 405, 'touch');
        dispatchPointer(window, 'pointermove', blank.x + 80, blank.y, 406, 'touch');
        dispatchPointer(window, 'pointerup', blank.x + 80, blank.y, 406, 'touch');
        dispatchPointer(canvas, 'pointercancel', blank.x + 80, blank.y, 406, 'touch');
        dispatchPointer(canvas, 'lostpointercapture', blank.x + 80, blank.y, 406, 'touch');
        results.panAfterSecondPointerCamera = { ...engine.camera };
        dispatchPointer(window, 'pointermove', blank.x + 70, blank.y + 30, 405, 'touch');
        dispatchPointer(window, 'pointerup', blank.x + 70, blank.y + 30, 405, 'touch');
      },
      () => ({
        cameraMovedOnlyAfterActivePointer:
          results.panBeforeCamera.x === results.panAfterSecondPointerCamera.x &&
          results.panBeforeCamera.y === results.panAfterSecondPointerCamera.y &&
          (engine.camera.x !== results.panBeforeCamera.x || engine.camera.y !== results.panBeforeCamera.y),
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
        dispatchPointer(window, 'pointermove', center.x + 8, center.y + 3, 5000 + i * 5);
        dispatchPointer(window, 'pointerup', center.x + 8, center.y + 3, 5000 + i * 5);
        dispatchPointer(canvas, 'pointerdown', handle.x, handle.y, 5001 + i * 5);
        dispatchPointer(window, 'pointermove', handle.x + 5, handle.y + 3, 5001 + i * 5);
        dispatchPointer(window, 'pointerup', handle.x + 5, handle.y + 3, 5001 + i * 5);
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
    culling,
    keyboardContract,
    cancellation,
    touchPointerOwnership,
    multiTouchPolicy,
    longRunChurn,
    futureModelShape,
    lifecycle,
  };
}
