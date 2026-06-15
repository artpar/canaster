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

  const api = await waitForNested();
  await raf(6);

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
    () => document.querySelector('.portal-overlay canvas[data-engine-mode="preview-live"]'),
    'live preview canvas was not mounted',
  );

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
  const activation = document.querySelector('.portal-activation');
  activation.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, pointerId: 501, pointerType: 'mouse', buttons: 1 }));
  activation.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, pointerId: 501, pointerType: 'mouse', buttons: 0 }));
  await raf(4);
  const activeAfterPointer = api.activeCanvasId();
  activation.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  await raf(12);
  const activeAfterDoubleClick = api.activeCanvasId();
  const contextPlaneAfterEnter = document.querySelectorAll('canvas[data-engine-mode="context-live"]').length;

  api.executeDocumentCommand({ type: 'go-to-parent-canvas', source: 'nonvisual' });
  await raf(8);
  const afterParentReturn = api.getCollection();
  const parentSelection = afterParentReturn.view.selections.root;

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
  const contextShapes = [...document.querySelectorAll('.parent-context-shape-hit')];
  const contextRegions = contextShapes.map((item) => item.getAttribute('data-region'));
  const contextUniqueRegions = [...new Set(contextRegions)].sort();
  const contextFieldText = document.querySelector('.parent-context-field')?.textContent?.trim() ?? '';
  const legacyFloatingCardCount = document.querySelectorAll('.halo-item').length;
  const rightContextCanvas = document.querySelector('.parent-context-canvas-clip[data-node-id="portal-right"] canvas[data-engine-mode="preview-live"]');
  const liveContextCanvasCount = document.querySelectorAll('.parent-context-canvas-clip canvas[data-engine-mode="preview-live"]').length;
  const contextCanvasClips = [...document.querySelectorAll('.parent-context-canvas-clip')];
  const contextCanvasModels = contextCanvasClips.map((item) => item.getAttribute('data-context-model'));
  const contextLiveShapeCount = contextShapes.filter((item) => item.getAttribute('data-live-canvas') === 'true').length;
  const emptyContextCanvases = contextCanvasClips
    .map((item) => ({
      nodeId: item.getAttribute('data-node-id'),
      rendered: item.querySelector('canvas')?.dataset.renderedNodes ?? null,
      total: item.querySelector('canvas')?.dataset.totalNodes ?? null,
    }))
    .filter((item) => item.rendered === '0' || item.total === '0' || item.rendered === null || item.total === null);
  document.querySelector('.parent-context-shape-hit[data-node-id="portal-right"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await raf(8);
  const activeAfterPortalContext = api.activeCanvasId();
  api.replaceCollection(contextFixture);
  await raf(8);
  document.querySelector('.parent-context-shape-hit[data-node-id="neighbor-top"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await raf(8);
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
    appPortal: {
      type: appPortal?.type,
      childCanvasId,
      dataKeys: Object.keys(appPortal?.data ?? {}).sort(),
    },
    preview: {
      mounted: Boolean(previewCanvas),
      update: previewUpdate,
      pointerDidNotEnter: activeBeforePointer === activeAfterPointer,
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
      shapeCount: contextShapes.length,
      legacyFloatingCardCount,
      textContent: contextFieldText,
      liveCanvasCount: liveContextCanvasCount,
      liveShapeCount: contextLiveShapeCount,
      canvasModels: contextCanvasModels,
      emptyCanvases: emptyContextCanvases,
      rightCanvasRendered: rightContextCanvas?.dataset.renderedNodes ?? null,
      rightCanvasTotal: rightContextCanvas?.dataset.totalNodes ?? null,
      portalActivationCanvas: activeAfterPortalContext,
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
      portal('portal-right', 430, 24, null, 'Right Portal'),
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
  collection.documents['right-child'].model = { schemaVersion: 2, nodes: [card('right-child-card', 0, 0, 'Right Child Card')] };
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
