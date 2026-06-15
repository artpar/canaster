import { ListTree, Maximize2, Minus, Moon, Plus, Redo2, RotateCcw, Sun, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChildCanvasForNode, createInitialDocumentCollection, updateCanvasModel } from './engine/documentModel';
import {
  NestedCanvasWorkspace,
  NodeAccessPanel,
  WorkspaceStatusBar,
  initialViewportStatus,
  type NestedCanvasWorkspaceChromeState,
  type NestedCanvasWorkspaceHandle,
} from './engine/nested/NestedCanvasWorkspace';
import { sampleModel } from './engine/sampleModel';
import type { CanvasCommand, CanvasModel, ThemeName } from './engine/types';
import type { DocumentCommand } from './engine/documentTypes';

export function App() {
  const workspaceRef = useRef<NestedCanvasWorkspaceHandle | null>(null);
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [nodesOpen, setNodesOpen] = useState(false);
  const initialCollection = useMemo(() => createSampleDocumentCollection(), []);
  const [chromeState, setChromeState] = useState<NestedCanvasWorkspaceChromeState>(() => ({
    collection: initialCollection,
    status: initialViewportStatus,
    lastModelChange: null,
    canUndo: false,
    canRedo: false,
  }));

  const handleChromeStateChange = useCallback((next: NestedCanvasWorkspaceChromeState) => {
    setChromeState(next);
  }, []);

  const executeActiveCanvasCommand = useCallback(
    (command: CanvasCommand) => workspaceRef.current?.executeActiveCanvasCommand(command) ?? false,
    [],
  );

  const executeDocumentCommand = useCallback((command: DocumentCommand) => {
    workspaceRef.current?.executeDocumentCommand(command);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Canvas workspace">
        <div className="topbar" aria-label="Canvas controls">
          <div className="brand">
            <span className="brand-mark" />
            <span>Canway</span>
          </div>
          <div className="toolbar-group">
            <IconButton label="Undo" disabled={!chromeState.canUndo} onClick={() => workspaceRef.current?.undoWorkspace()}>
              <Undo2 size={17} />
            </IconButton>
            <IconButton label="Redo" disabled={!chromeState.canRedo} onClick={() => workspaceRef.current?.redoWorkspace()}>
              <Redo2 size={17} />
            </IconButton>
            <IconButton label="Fit view" onClick={() => workspaceRef.current?.fitActiveCanvas()}>
              <Maximize2 size={17} />
            </IconButton>
            <IconButton label="Reset zoom" onClick={() => workspaceRef.current?.resetActiveZoom()}>
              <RotateCcw size={17} />
            </IconButton>
            <IconButton label="Zoom out" onClick={() => workspaceRef.current?.zoomActiveBy(0.82)}>
              <Minus size={17} />
            </IconButton>
            <span className="zoom-readout">Canvas</span>
            <IconButton label="Zoom in" onClick={() => workspaceRef.current?.zoomActiveBy(1.22)}>
              <Plus size={17} />
            </IconButton>
          </div>
          <div className="toolbar-group">
            <IconButton
              label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
            <IconButton label={nodesOpen ? 'Close node panel' : 'Open node panel'} onClick={() => setNodesOpen((open) => !open)}>
              {nodesOpen ? <X size={17} /> : <ListTree size={17} />}
            </IconButton>
          </div>
        </div>

        <NestedCanvasWorkspace
          ref={workspaceRef}
          initialCollection={initialCollection}
          theme={theme}
          onChromeStateChange={handleChromeStateChange}
        />
        {nodesOpen ? (
          <NodeAccessPanel
            collection={chromeState.collection}
            status={chromeState.status}
            executeActiveCanvasCommand={executeActiveCanvasCommand}
            executeDocumentCommand={executeDocumentCommand}
          />
        ) : null}
        <WorkspaceStatusBar
          collection={chromeState.collection}
          status={chromeState.status}
          lastModelChange={chromeState.lastModelChange}
        />
      </section>
    </main>
  );
}

const sampleNestedCanvasModel: CanvasModel = {
  schemaVersion: 2,
  nodes: [
    {
      id: 'nested-brief',
      type: 'card',
      x: -112,
      y: -64,
      w: 224,
      h: 112,
      data: {
        title: 'Nested Canvas',
        detail: 'This child canvas is live before the first click',
        accent: 'system',
      },
    },
    {
      id: 'nested-note',
      type: 'text',
      x: 160,
      y: 32,
      w: 220,
      h: 120,
      data: {
        text: 'Parent context stays visible around this plane.',
      },
    },
  ],
};

function createSampleDocumentCollection() {
  const collectionWithRoot = createInitialDocumentCollection(sampleModel, 'Root');
  const collectionWithChild = createChildCanvasForNode(collectionWithRoot, 'root', 'planning-canvas');
  const portal = collectionWithChild.documents.root.model.nodes.find((node) => node.id === 'planning-canvas');
  const childCanvasId = typeof portal?.data.childCanvasId === 'string' ? portal.data.childCanvasId : null;
  return childCanvasId ? updateCanvasModel(collectionWithChild, childCanvasId, sampleNestedCanvasModel) : collectionWithChild;
}

type IconButtonProps = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function IconButton({ label, disabled = false, onClick, children }: IconButtonProps) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
