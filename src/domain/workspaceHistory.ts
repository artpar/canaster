import { cloneDocumentCollection, hydrateDocumentCollection, setWorkspaceThemeId } from './documentModel';
import type { CanvasDocumentCollection, CanvasWorkspaceHistory, CanvasWorkspaceSnapshot, DocumentModelChange } from './documentTypes';

export const WORKSPACE_HISTORY_LIMIT = 80;

export function createWorkspaceHistory(present: CanvasDocumentCollection): CanvasWorkspaceHistory {
  return {
    present: hydrateDocumentCollection(present),
    undoStack: [],
    redoStack: [],
  };
}

export function hydrateWorkspaceHistory(history: CanvasWorkspaceHistory): CanvasWorkspaceHistory {
  return {
    present: hydrateDocumentCollection(history.present),
    undoStack: history.undoStack.map(hydrateDocumentCollection).slice(-WORKSPACE_HISTORY_LIMIT),
    redoStack: history.redoStack.map(hydrateDocumentCollection).slice(-WORKSPACE_HISTORY_LIMIT),
  };
}

export function replaceWorkspacePresent(history: CanvasWorkspaceHistory, present: CanvasDocumentCollection): CanvasWorkspaceHistory {
  return {
    ...history,
    present: hydrateDocumentCollection(present),
  };
}

export function setWorkspaceHistoryThemeId(history: CanvasWorkspaceHistory, themeId: string): CanvasWorkspaceHistory {
  return {
    present: setWorkspaceThemeId(history.present, themeId),
    undoStack: history.undoStack.map((collection) => setWorkspaceThemeId(collection, themeId)),
    redoStack: history.redoStack.map((collection) => setWorkspaceThemeId(collection, themeId)),
  };
}

export function pushWorkspaceHistory(history: CanvasWorkspaceHistory, present: CanvasDocumentCollection): CanvasWorkspaceHistory {
  const current = hydrateDocumentCollection(history.present);
  return {
    present: hydrateDocumentCollection(present),
    undoStack: [...history.undoStack.map(cloneDocumentCollection), current].slice(-WORKSPACE_HISTORY_LIMIT),
    redoStack: [],
  };
}

export function undoWorkspaceHistory(history: CanvasWorkspaceHistory): CanvasWorkspaceHistory {
  if (!history.undoStack.length) return history;
  const undoStack = history.undoStack.map(cloneDocumentCollection);
  const previous = undoStack[undoStack.length - 1];
  return {
    present: hydrateDocumentCollection(previous),
    undoStack: undoStack.slice(0, -1),
    redoStack: [...history.redoStack.map(cloneDocumentCollection), hydrateDocumentCollection(history.present)].slice(-WORKSPACE_HISTORY_LIMIT),
  };
}

export function redoWorkspaceHistory(history: CanvasWorkspaceHistory): CanvasWorkspaceHistory {
  if (!history.redoStack.length) return history;
  const redoStack = history.redoStack.map(cloneDocumentCollection);
  const next = redoStack[redoStack.length - 1];
  return {
    present: hydrateDocumentCollection(next),
    undoStack: [...history.undoStack.map(cloneDocumentCollection), hydrateDocumentCollection(history.present)].slice(-WORKSPACE_HISTORY_LIMIT),
    redoStack: redoStack.slice(0, -1),
  };
}

export function createWorkspaceSnapshot(
  history: CanvasWorkspaceHistory,
  lastModelChange: DocumentModelChange | null,
): CanvasWorkspaceSnapshot {
  return {
    schemaVersion: 1,
    history: hydrateWorkspaceHistory(history),
    lastModelChange: cloneDocumentModelChange(lastModelChange),
  };
}

export function hydrateWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot): CanvasWorkspaceSnapshot {
  return {
    schemaVersion: 1,
    history: hydrateWorkspaceHistory(snapshot.history),
    lastModelChange: cloneDocumentModelChange(snapshot.lastModelChange),
  };
}

export function cloneDocumentModelChange(change: DocumentModelChange | null): DocumentModelChange | null {
  if (!change) return null;
  if (change.kind === 'delete-confirmation-open') return { ...change, nodeIds: [...change.nodeIds] };
  if (change.kind === 'document-delete') return { ...change, canvasIds: [...change.canvasIds] };
  if (change.kind === 'node-theme-change') return { ...change, nodeIds: [...change.nodeIds] };
  return { ...change };
}
