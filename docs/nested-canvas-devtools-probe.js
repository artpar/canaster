export async function runCanwayNestedProbe() {
  const { createInitialDocumentCollection, cloneDocumentCollection } = await import('/src/engine/documentModel.ts');
  const { planDocumentCommand, stripPortalChildReferenceOnPaste } = await import('/src/engine/documentCommands.ts');
  const { regionForContextVector } = await import('/src/engine/nested/parentContextField.ts');

  const raf = async (count = 1) => {
    for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  };
  const card = (id, x, y, title = id) => ({
    id,
    type: 'card',
    x,
    y,
    w: 180,
    h: 96,
    data: { title, detail: `${title} detail`, accent: 'task' },
  });
  const portal = (id, x, y, childCanvasId = null, title = id) => ({
    id,
    type: 'canvas',
    x,
    y,
    w: 300,
    h: 180,
    data: { childCanvasId, title, nodeCount: 0 },
  });
  const waitForNested = async () => {
    for (let i = 0; i < 80; i++) {
      if (window.__canwayNested) return window.__canwayNested;
      await raf(1);
    }
    throw new Error('nested workspace debug API unavailable');
  };
  const waitFor = async (predicate, message) => {
    for (let i = 0; i < 80; i++) {
      const value = predicate();
      if (value) return value;
      await raf(1);
    }
    throw new Error(message);
  };
  const centerOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const dispatchWheel = async (element, init = {}) => {
    const point = centerOf(element);
    element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      deltaY: -140,
      ctrlKey: true,
      ...init,
    }));
    await raf(8);
  };
  const dragCanvas = async (element, dx, dy) => {
    const point = centerOf(element);
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, pointerId: 801, pointerType: 'mouse', buttons: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: point.x + dx, clientY: point.y + dy, pointerId: 801, pointerType: 'mouse', buttons: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: point.x + dx, clientY: point.y + dy, pointerId: 801, pointerType: 'mouse', buttons: 0 }));
    await raf(10);
  };
  const dragElement = async (element, dx, dy, pointerId = 901) => {
    const point = centerOf(element);
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, pointerId, pointerType: 'mouse', buttons: 1 }));
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: point.x + dx, clientY: point.y + dy, pointerId, pointerType: 'mouse', buttons: 1 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: point.x + dx, clientY: point.y + dy, pointerId, pointerType: 'mouse', buttons: 0 }));
    await raf(10);
  };
  const doubleClickCanvas = async (element) => {
    const point = centerOf(element);
    element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y }));
    await raf(12);
  };

  const api = await waitForNested();
  await raf(6);
  const shellChrome = {
    topbarInsideNestedWorkspace: Boolean(document.querySelector('.nested-workspace .topbar')),
    statusbarInsideNestedWorkspace: Boolean(document.querySelector('.nested-workspace .statusbar')),
    statusbarOutsideNestedWorkspace: Boolean(document.querySelector('.workspace > .statusbar')),
  };

  const initial = api.getCollection();
  const schema = {
    collection: initial.schemaVersion,
    modelVersions: Object.values(initial.documents).map((document) => document.model.schemaVersion),
  };

  api.executeDocumentCommand({ type: 'create-child-canvas', parentCanvasId: 'root', nodeId: 'planning-canvas', source: 'nonvisual' });
  await raf(10);
  const afterCreate = api.getCollection();
  const appPortal = afterCreate.documents.root.model.nodes.find((node) => node.id === 'planning-canvas');
  const childCanvasId = appPortal?.data?.childCanvasId;
  const previewCanvas = await waitFor(
    () => document.querySelector('.portal-overlay canvas[data-engine-mode="embedded-live"]'),
    'embedded child canvas was not mounted',
  );
  const childViewport = previewCanvas.closest('.embedded-nested-viewport');
  const childViewportRect = childViewport.getBoundingClientRect();
  const childCenterRect = childViewport.querySelector(':scope > .nested-center-cell')?.getBoundingClientRect();
  const childCenterPaneRatio = childCenterRect
    ? {
        width: childCenterRect.width / childViewportRect.width,
        height: childCenterRect.height / childViewportRect.height,
      }
    : null;
  const transparentActivationCount = document.querySelectorAll('.portal-activation').length;

  const withChildChange = cloneDocumentCollection(afterCreate);
  withChildChange.documents[childCanvasId].model = {
    schemaVersion: 2,
    nodes: [card('child-card', 0, 0, 'Child Card')],
  };
  api.replaceCollection(withChildChange);
  await raf(12);
  const previewUpdate = {
    total: previewCanvas.dataset.totalNodes,
    rendered: previewCanvas.dataset.renderedNodes,
  };

  const activeBeforePointer = api.activeCanvasId();
  const previewPoint = centerOf(previewCanvas);
  previewCanvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: previewPoint.x, clientY: previewPoint.y, pointerId: 501, pointerType: 'mouse', buttons: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: previewPoint.x, clientY: previewPoint.y, pointerId: 501, pointerType: 'mouse', buttons: 0 }));
  await raf(4);
  const activeAfterPointer = api.activeCanvasId();
  const beforeEmbeddedWheel = api.getCollection();
  await dispatchWheel(previewCanvas);
  const afterEmbeddedWheel = api.getCollection();
  await dragCanvas(previewCanvas, 26, 0);
  const afterEmbeddedDrag = api.getCollection();
  await doubleClickCanvas(previewCanvas);
  await raf(12);
  const activeAfterDoubleClick = api.activeCanvasId();
  const contextPlaneAfterEnter = document.querySelectorAll('canvas[data-engine-mode="context-live"]').length;

  api.executeDocumentCommand({ type: 'go-to-parent-canvas', source: 'nonvisual' });
  await raf(8);
  const afterParentReturn = api.getCollection();
  const parentSelection = afterParentReturn.view.selections.root;
  const resetForIsolation = cloneDocumentCollection(afterParentReturn);
  resetForIsolation.documents[childCanvasId].model = {
    schemaVersion: 2,
    nodes: [card('child-card', 0, 0, 'Child Card')],
  };
  api.replaceCollection(resetForIsolation);
  await raf(8);

  api.executeDocumentCommand({ type: 'enter-child-canvas', parentCanvasId: 'root', portalNodeId: 'planning-canvas', source: 'nonvisual' });
  await raf(8);
  api.executeActiveCanvasCommand({ type: 'select-node', nodeId: 'child-card', source: 'nonvisual' });
  api.executeActiveCanvasCommand({ type: 'move-selection', dx: 32, dy: 0, source: 'nonvisual' });
  await raf(8);
  const afterChildMove = api.getCollection();
  const parentPortalAfterChildMove = afterChildMove.documents.root.model.nodes.find((node) => node.id === 'planning-canvas');
  const movedChild = afterChildMove.documents[childCanvasId].model.nodes.find((node) => node.id === 'child-card');
  api.executeDocumentCommand({ type: 'go-to-parent-canvas', source: 'nonvisual' });
  await raf(8);
  api.executeActiveCanvasCommand({ type: 'move-selection', dx: 32, dy: 0, source: 'nonvisual' });
  await raf(8);
  const afterParentMove = api.getCollection();
  const parentPortalAfterParentMove = afterParentMove.documents.root.model.nodes.find((node) => node.id === 'planning-canvas');
  const childAfterParentMove = afterParentMove.documents[childCanvasId].model.nodes.find((node) => node.id === 'child-card');

  const contextFixture = makeContextFixture(createInitialDocumentCollection, planDocumentCommand, card, portal);
  api.replaceCollection(contextFixture);
  await raf(12);
  const stageBounds = document.querySelector('.nested-stage').getBoundingClientRect();
  const activeCenterCell = document.querySelector('.nested-stage > .nested-center-cell');
  const activeCenterBounds = activeCenterCell.getBoundingClientRect();
  const activeCanvasBounds = document.querySelector('.nested-stage > .nested-center-cell > canvas[data-engine-mode="active"]').getBoundingClientRect();
  const topContextLayer = document.querySelector('.nested-stage > .parent-context-layer');
  const contextShapes = [...topContextLayer.querySelectorAll(':scope > .parent-context-field .parent-context-shape-hit')];
  const contextNodeIds = contextShapes.map((item) => item.getAttribute('data-node-id'));
  const contextRegions = contextShapes.map((item) => item.getAttribute('data-region'));
  const contextUniqueRegions = [...new Set(contextRegions)].sort();
  const contextFieldText = topContextLayer.querySelector(':scope > .parent-context-field')?.textContent?.trim() ?? '';
  const legacyFloatingCardCount = document.querySelectorAll('.halo-item').length;
  const rightContextCanvas = topContextLayer.querySelector(':scope > .parent-context-canvas-layer > .parent-context-canvas-clip[data-node-id="portal-right"] canvas[data-engine-mode="embedded-live"]');
  const nestedRightPortalCanvas = topContextLayer.querySelector(':scope > .parent-context-canvas-layer > .parent-context-canvas-clip[data-node-id="portal-right"] .portal-overlay canvas[data-engine-mode="embedded-live"]');
  const contextCanvasClips = [...topContextLayer.querySelectorAll(':scope > .parent-context-canvas-layer > .parent-context-canvas-clip')];
  const liveContextCanvasCount = contextCanvasClips.length;
  const contextCanvasModels = contextCanvasClips.map((item) => item.getAttribute('data-context-model'));
  const readContextClipRects = () => [...topContextLayer.querySelectorAll(':scope > .parent-context-canvas-layer > .parent-context-canvas-clip')].map((item) => {
    const rect = item.getBoundingClientRect();
    return {
      region: item.getAttribute('data-region'),
      nodeId: item.getAttribute('data-node-id'),
      x: Math.round(rect.left - stageBounds.left),
      y: Math.round(rect.top - stageBounds.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
  });
  const contextClipRects = readContextClipRects();
  const clipFor = (region) => contextClipRects.find((item) => item.region === region);
  const near = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;
  const cardinalPaneFill = {
    top: Boolean(clipFor('top') && clipFor('top').y <= 2 && clipFor('top').x > 0 && clipFor('top').w >= stageBounds.width * 0.5 && clipFor('top').h >= 64),
    right: Boolean(clipFor('right') && near(clipFor('right').x + clipFor('right').w, stageBounds.width) && clipFor('right').y > 0 && clipFor('right').w >= 64 && clipFor('right').h >= stageBounds.height * 0.45),
    bottom: Boolean(clipFor('bottom') && near(clipFor('bottom').y + clipFor('bottom').h, stageBounds.height) && clipFor('bottom').x > 0 && clipFor('bottom').w >= stageBounds.width * 0.5 && clipFor('bottom').h >= 64),
    left: Boolean(clipFor('left') && clipFor('left').x <= 2 && clipFor('left').y > 0 && clipFor('left').w >= 64 && clipFor('left').h >= stageBounds.height * 0.45),
  };
  const rectsOverlap = (a, b) => {
    const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return xOverlap > 1 && yOverlap > 1;
  };
  const activeCenterRect = {
    x: Math.round(activeCenterBounds.left - stageBounds.left),
    y: Math.round(activeCenterBounds.top - stageBounds.top),
    w: Math.round(activeCenterBounds.width),
    h: Math.round(activeCenterBounds.height),
  };
  const activeCanvasRect = {
    x: Math.round(activeCanvasBounds.left - stageBounds.left),
    y: Math.round(activeCanvasBounds.top - stageBounds.top),
    w: Math.round(activeCanvasBounds.width),
    h: Math.round(activeCanvasBounds.height),
  };
  const panesExclusive = contextClipRects.every((rect, index) => contextClipRects.every((other, otherIndex) => index >= otherIndex || !rectsOverlap(rect, other)));
  const panesOutsideActiveCenter = contextClipRects.every((rect) => !rectsOverlap(rect, activeCenterRect));
  const activeCanvasConfinedToCenter = near(activeCanvasRect.x, activeCenterRect.x)
    && near(activeCanvasRect.y, activeCenterRect.y)
    && near(activeCanvasRect.w, activeCenterRect.w)
    && near(activeCanvasRect.h, activeCenterRect.h);
  const leftBeforeResize = clipFor('left')?.w ?? null;
  const topBeforeResize = clipFor('top')?.h ?? null;
  const leftResizeHandle = topContextLayer.querySelector('[data-resize-handle="left"]');
  if (leftResizeHandle) await dragElement(leftResizeHandle, 30, 0, 902);
  await raf(8);
  const clipAfterLeftResize = readContextClipRects();
  const leftAfterResize = clipAfterLeftResize.find((item) => item.region === 'left')?.w ?? null;
  const westColumnResized = ['top-left', 'left', 'bottom-left'].every((region) => {
    const before = contextClipRects.find((item) => item.region === region);
    const after = clipAfterLeftResize.find((item) => item.region === region);
    return before && after && after.w > before.w;
  });
  const centerColumnResized = ['top', 'bottom'].every((region) => {
    const before = contextClipRects.find((item) => item.region === region);
    const after = clipAfterLeftResize.find((item) => item.region === region);
    return before && after && after.w < before.w;
  });
  const topLeftResizeHandle = topContextLayer.querySelector('[data-resize-handle="top-left"]');
  if (topLeftResizeHandle) await dragElement(topLeftResizeHandle, 16, 18, 903);
  await raf(8);
  const clipAfterIntersectionResize = readContextClipRects();
  const leftAfterIntersectionResize = clipAfterIntersectionResize.find((item) => item.region === 'left')?.w ?? null;
  const topAfterIntersectionResize = clipAfterIntersectionResize.find((item) => item.region === 'top')?.h ?? null;
  const topRowResized = ['top-left', 'top', 'top-right'].every((region) => {
    const before = clipAfterLeftResize.find((item) => item.region === region);
    const after = clipAfterIntersectionResize.find((item) => item.region === region);
    return before && after && after.h > before.h;
  });
  const leftResizeHandleAfterIntersection = topContextLayer.querySelector('[data-resize-handle="left"]');
  if (leftResizeHandleAfterIntersection) await dragElement(leftResizeHandleAfterIntersection, 180, 0, 904);
  await raf(8);
  const clipAfterLargeResize = readContextClipRects();
  const leftAfterLargeResize = clipAfterLargeResize.find((item) => item.region === 'left')?.w ?? null;
  const contextLiveShapeCount = contextShapes.filter((item) => item.getAttribute('data-live-canvas') === 'true').length;
  const emptyContextCanvases = contextCanvasClips
    .map((item) => ({
      nodeId: item.getAttribute('data-node-id'),
      rendered: item.querySelector('canvas')?.dataset.renderedNodes ?? null,
      total: item.querySelector('canvas')?.dataset.totalNodes ?? null,
    }))
    .filter((item) => item.rendered === '0' || item.total === '0' || item.rendered === null || item.total === null);
  const beforeRightContextWheel = api.getCollection();
  if (rightContextCanvas) await dispatchWheel(rightContextCanvas);
  const afterRightContextWheel = api.getCollection();
  if (nestedRightPortalCanvas) await dispatchWheel(nestedRightPortalCanvas);
  const afterNestedRightWheel = api.getCollection();
  if (nestedRightPortalCanvas) await doubleClickCanvas(nestedRightPortalCanvas);
  const activeAfterNestedPortalDoubleClick = api.activeCanvasId();
  api.replaceCollection(contextFixture);
  await raf(12);
  const resetRightContextLayer = document.querySelector('.nested-stage > .parent-context-layer');
  const rightCanvasAfterNestedReset = resetRightContextLayer.querySelector(':scope > .parent-context-canvas-layer > .parent-context-canvas-clip[data-node-id="portal-right"] canvas[data-engine-mode="embedded-live"]');
  if (rightCanvasAfterNestedReset) await doubleClickCanvas(rightCanvasAfterNestedReset);
  const activeAfterPortalContext = api.activeCanvasId();
  api.replaceCollection(contextFixture);
  await raf(8);
  const resetTopContextLayer = document.querySelector('.nested-stage > .parent-context-layer');
  const topCanvasAfterReset = resetTopContextLayer.querySelector(':scope > .parent-context-canvas-layer > .parent-context-canvas-clip[data-node-id="neighbor-top"] canvas[data-engine-mode="embedded-live"]');
  if (topCanvasAfterReset) await doubleClickCanvas(topCanvasAfterReset);
  const afterNonPortalContext = api.getCollection();

  const pastedPortal = stripPortalChildReferenceOnPaste(portal('copy-source', 0, 0, 'planning', 'Copied Portal'));

  const deleteFixture = makeDeleteFixture(createInitialDocumentCollection, planDocumentCommand, card, portal);
  api.replaceCollection(deleteFixture);
  await raf(10);
  api.executeActiveCanvasCommand({ type: 'select-node', nodeId: 'delete-portal', source: 'nonvisual' });
  await raf(4);
  api.executeActiveCanvasCommand({ type: 'delete-selection', source: 'nonvisual' });
  await raf(8);
  const afterDeleteAttempt = api.getCollection();
  const modalOpen = Boolean(document.querySelector('.delete-confirmation'));
  api.executeDocumentCommand({ type: 'cancel-delete-confirmation', source: 'nonvisual' });
  await raf(6);
  const afterDeleteCancel = api.getCollection();
  api.executeActiveCanvasCommand({ type: 'select-node', nodeId: 'delete-portal', source: 'nonvisual' });
  await raf(4);
  api.executeActiveCanvasCommand({ type: 'delete-selection', source: 'nonvisual' });
  await raf(6);
  api.executeDocumentCommand({ type: 'confirm-delete-selection', canvasId: 'root', source: 'nonvisual' });
  await raf(8);
  const afterDeleteConfirm = api.getCollection();

  return {
    schema,
    shellChrome,
    appPortal: {
      type: appPortal?.type,
      childCanvasId,
      dataKeys: Object.keys(appPortal?.data ?? {}).sort(),
    },
    preview: {
      mounted: Boolean(previewCanvas),
      transparentActivationCount,
      update: previewUpdate,
      childCenterPaneRatio,
      pointerDidNotEnter: activeBeforePointer === activeAfterPointer,
      wheelChangedChildCamera: afterEmbeddedWheel.view.cameras[childCanvasId]?.scale !== beforeEmbeddedWheel.view.cameras[childCanvasId]?.scale,
      wheelKeptParentCamera: afterEmbeddedWheel.view.cameras.root?.scale === beforeEmbeddedWheel.view.cameras.root?.scale,
      dragMovedChildNode: afterEmbeddedDrag.documents[childCanvasId].model.nodes.find((node) => node.id === 'child-card')?.x !== 0,
      dragKeptParentPortalStable: afterEmbeddedDrag.documents.root.model.nodes.find((node) => node.id === 'planning-canvas')?.x === appPortal?.x,
      doubleClickEntered: activeAfterDoubleClick === childCanvasId,
      contextPlaneAfterEnter,
    },
    parentReturn: {
      activeCanvasId: afterParentReturn.activeCanvasId,
      selectedNodeId: parentSelection.primarySelectedNodeId,
    },
    isolation: {
      childMoved: movedChild?.x === 32,
      parentStableAfterChildMove: parentPortalAfterChildMove?.x === appPortal?.x,
      parentMoved: parentPortalAfterParentMove?.x === appPortal?.x + 32,
      childStableAfterParentMove: childAfterParentMove?.x === movedChild?.x,
    },
    parentContext: {
      regions: contextUniqueRegions,
      nodeIds: contextNodeIds,
      shapeCount: contextShapes.length,
      legacyFloatingCardCount,
      textContent: contextFieldText,
      liveCanvasCount: liveContextCanvasCount,
      liveShapeCount: contextLiveShapeCount,
      canvasModels: contextCanvasModels,
      clipRects: contextClipRects,
      activeCenterRect,
      activeCanvasRect,
      cardinalPaneFill,
      panesExclusive,
      panesOutsideActiveCenter,
      activeCanvasConfinedToCenter,
      dividerResizeChangedLeft: leftBeforeResize !== null && leftAfterResize !== null && leftAfterResize > leftBeforeResize,
      dividerResizeChangedWestColumn: westColumnResized,
      dividerResizeChangedCenterColumn: centerColumnResized,
      intersectionResizeChangedTop: topBeforeResize !== null && topAfterIntersectionResize !== null && topAfterIntersectionResize > topBeforeResize,
      intersectionResizeChangedLeft: leftAfterResize !== null && leftAfterIntersectionResize !== null && leftAfterIntersectionResize > leftAfterResize,
      intersectionResizeChangedTopRow: topRowResized,
      dividerResizeMovesBeyondLegacyCap: leftAfterLargeResize !== null && leftAfterLargeResize > 260,
      emptyCanvases: emptyContextCanvases,
      rightCanvasRendered: rightContextCanvas?.dataset.renderedNodes ?? null,
      rightCanvasTotal: rightContextCanvas?.dataset.totalNodes ?? null,
      rightPaneWheelChangedCamera: afterRightContextWheel.view.cameras['right-child']?.scale !== beforeRightContextWheel.view.cameras['right-child']?.scale,
      nestedPortalCanvasMounted: Boolean(nestedRightPortalCanvas),
      nestedPortalWheelChangedCamera: afterNestedRightWheel.view.cameras['right-grandchild']?.scale !== afterRightContextWheel.view.cameras['right-grandchild']?.scale,
      nestedPortalDoubleClickCanvas: activeAfterNestedPortalDoubleClick,
      borderPaneDoubleClickCanvas: activeAfterPortalContext,
      nonPortalActivationCanvas: afterNonPortalContext.activeCanvasId,
      nonPortalSelection: afterNonPortalContext.view.selections.root?.primarySelectedNodeId,
      buckets: {
        right: regionForContextVector(1, 0),
        bottomRight: regionForContextVector(1, 1),
        bottom: regionForContextVector(0, 1),
        bottomLeft: regionForContextVector(-1, 1),
        left: regionForContextVector(-1, 0),
        topLeft: regionForContextVector(-1, -1),
        top: regionForContextVector(0, -1),
        topRight: regionForContextVector(1, -1),
      },
    },
    paste: {
      childCanvasId: pastedPortal.data.childCanvasId,
      nodeCount: pastedPortal.data.nodeCount,
      title: pastedPortal.data.title,
    },
    deletePortal: {
      modalOpen,
      blockedBeforeConfirmation: Boolean(afterDeleteAttempt.documents.deleteChild),
      cancelPreservedChild: Boolean(afterDeleteCancel.documents.deleteChild),
      confirmRemovedPortal: !afterDeleteConfirm.documents.root.model.nodes.some((node) => node.id === 'delete-portal'),
      confirmRemovedChild: !afterDeleteConfirm.documents.deleteChild,
    },
    performance: {
      engineCount: api.engineCount(),
    },
    browser: {
      consoleErrors: [],
    },
  };
}

function makeContextFixture(createInitialDocumentCollection, planDocumentCommand, card, portal) {
  const root = {
    schemaVersion: 2,
    nodes: [
      portal('portal-center', 0, 0, null, 'Center'),
      card('neighbor-top', 20, -260, 'Top'),
      card('neighbor-top-far', 20, -560, 'Far Top'),
      portal('portal-right', 430, 24, null, 'Right Portal'),
      portal('portal-right-far', 780, 24, null, 'Far Right Portal'),
      card('neighbor-bottom', 20, 300, 'Bottom'),
      card('neighbor-left', -330, 24, 'Left'),
      card('neighbor-top-right', 390, -220, 'Top Right'),
      card('neighbor-bottom-right', 390, 300, 'Bottom Right'),
      card('neighbor-bottom-left', -330, 300, 'Bottom Left'),
      card('neighbor-top-left', -330, -220, 'Top Left'),
    ],
  };
  let collection = createInitialDocumentCollection(root, 'Root');
  collection = planDocumentCommand(collection, { type: 'create-child-canvas', parentCanvasId: 'root', nodeId: 'portal-center', source: 'nonvisual' }).collection;
  collection = renameNewestCanvas(collection, 'active-child', 'Active Child');
  collection = planDocumentCommand(collection, { type: 'create-child-canvas', parentCanvasId: 'root', nodeId: 'portal-right', source: 'nonvisual' }).collection;
  collection = renameNewestCanvas(collection, 'right-child', 'Right Child');
  collection.documents['right-child'].model = {
    schemaVersion: 2,
    nodes: [
      card('right-child-card', 0, 0, 'Right Child Card'),
      portal('right-nested-portal', 0, 0, null, 'Right Nested Portal'),
    ],
  };
  collection = planDocumentCommand(collection, { type: 'create-child-canvas', parentCanvasId: 'right-child', nodeId: 'right-nested-portal', source: 'nonvisual' }).collection;
  collection = renameNewestCanvas(collection, 'right-grandchild', 'Right Grandchild');
  collection.documents['right-grandchild'].model = { schemaVersion: 2, nodes: [card('right-grandchild-card', 0, 0, 'Right Grandchild Card')] };
  collection = planDocumentCommand(collection, { type: 'enter-child-canvas', parentCanvasId: 'root', portalNodeId: 'portal-center', source: 'nonvisual' }).collection;
  return collection;
}

function makeDeleteFixture(createInitialDocumentCollection, planDocumentCommand, card, portal) {
  const root = { schemaVersion: 2, nodes: [portal('delete-portal', 0, 0, null, 'Delete Portal'), card('safe-card', 360, 0, 'Safe Card')] };
  let collection = createInitialDocumentCollection(root, 'Root');
  collection = planDocumentCommand(collection, { type: 'create-child-canvas', parentCanvasId: 'root', nodeId: 'delete-portal', source: 'nonvisual' }).collection;
  collection = renameNewestCanvas(collection, 'deleteChild', 'Delete Child');
  collection.view.selections.root = { selectedNodeIds: ['delete-portal'], primarySelectedNodeId: 'delete-portal', resizeMode: false };
  return collection;
}

function renameNewestCanvas(collection, canvasId, title) {
  const next = clone(collection);
  const generatedId = Object.keys(next.documents).find((id) => id.startsWith('canvas-'));
  if (!generatedId) return next;
  const document = next.documents[generatedId];
  delete next.documents[generatedId];
  next.documents[canvasId] = { ...document, id: canvasId, title };
  if (next.activeCanvasId === generatedId) next.activeCanvasId = canvasId;
  if (next.view.activeCanvasId === generatedId) next.view.activeCanvasId = canvasId;
  next.view.cameras[canvasId] = next.view.cameras[generatedId] ?? { x: 0, y: 0, scale: 1 };
  next.view.selections[canvasId] = next.view.selections[generatedId] ?? { selectedNodeIds: [], primarySelectedNodeId: null, resizeMode: false };
  delete next.view.cameras[generatedId];
  delete next.view.selections[generatedId];
  for (const parent of Object.values(next.documents)) {
    if (parent.parentCanvasId === generatedId) parent.parentCanvasId = canvasId;
    parent.model.nodes = parent.model.nodes.map((node) =>
      node.type === 'canvas' && node.data.childCanvasId === generatedId
        ? { ...node, data: { ...node.data, childCanvasId: canvasId, title } }
        : node,
    );
  }
  return next;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
