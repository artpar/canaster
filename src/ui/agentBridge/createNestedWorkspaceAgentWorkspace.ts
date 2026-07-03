import type { CanasterAgentWorkspace } from '../../app/agentBridge/CanasterAgentBridgePorts';
import type { NestedCanvasWorkspaceHandle } from '../canvas/nested/NestedCanvasWorkspace';

export function createNestedWorkspaceAgentWorkspace(workspace: NestedCanvasWorkspaceHandle): CanasterAgentWorkspace {
  return {
    captureActiveCanvasPreview: async () => {
      const capture = await workspace.captureActiveCanvasPreview();
      if (!capture) return null;
      return {
        mime: capture.blob.type || 'image/png',
        width: capture.width,
        height: capture.height,
        canvasId: capture.canvasId,
        size: capture.blob.size,
        readDataUri: () => blobToDataUri(capture.blob),
      };
    },
    collection: workspace.collection,
    currentViewState: workspace.currentWorkspaceUrlState,
    executeActiveCanvasCommand: workspace.executeActiveCanvasCommand,
    executeDocumentCommand: workspace.executeDocumentCommand,
    fitActiveCanvas: workspace.fitActiveCanvas,
    openViewState: workspace.openWorkspaceUrlState,
    zoomActiveBy: workspace.zoomActiveBy,
  };
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read preview image.')));
    reader.readAsDataURL(blob);
  });
}
