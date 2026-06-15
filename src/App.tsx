import { Clipboard, Copy, ListTree, Maximize2, Minus, Moon, MoveRight, Plus, RotateCcw, Sun, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CanvasEngine } from './engine/CanvasEngine';
import { sampleModel } from './engine/sampleModel';
import type { CanvasModel, CanvasModelChange, ThemeName, ViewportStatus } from './engine/types';

const initialStatus: ViewportStatus = {
  zoom: 1,
  selectedNodeId: null,
  selectedNodeIds: [],
  selectionCount: 0,
  cursorWorld: null,
  renderedNodes: 0,
  totalNodes: 0,
  interaction: 'Idle',
};

const initialModel: CanvasModel = {
  nodes: sampleModel.nodes.map((node) => ({ ...node })),
};

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const [model, setModel] = useState<CanvasModel>(initialModel);
  const [lastModelChange, setLastModelChange] = useState<CanvasModelChange | null>(null);
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [status, setStatus] = useState<ViewportStatus>(initialStatus);
  const [nodesOpen, setNodesOpen] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new CanvasEngine(canvasRef.current, {
      onStatus: setStatus,
      onModelChange: (nextModel, change) => {
        setModel(nextModel);
        setLastModelChange(change);
      },
    });
    engine.setModel(model);
    engine.setTheme(theme);
    engine.fit();
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setModel(model, { preserveInteraction: true });
  }, [model]);

  useEffect(() => {
    engineRef.current?.setTheme(theme);
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
            <IconButton label="Fit view" onClick={() => engineRef.current?.fit()}>
              <Maximize2 size={17} />
            </IconButton>
            <IconButton label="Reset zoom" onClick={() => engineRef.current?.resetZoom()}>
              <RotateCcw size={17} />
            </IconButton>
            <IconButton label="Zoom out" onClick={() => engineRef.current?.zoomBy(0.82)}>
              <Minus size={17} />
            </IconButton>
            <span className="zoom-readout">{Math.round(status.zoom * 100)}%</span>
            <IconButton label="Zoom in" onClick={() => engineRef.current?.zoomBy(1.22)}>
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

        <canvas ref={canvasRef} className="canvas-surface" aria-label="Canway canvas" />

        {nodesOpen ? <aside className="node-access-panel" aria-label="Canvas nodes">
          <div className="node-access-header">
            <span>Nodes</span>
            <span>{status.selectionCount ? `${status.selectionCount} selected` : 'No selection'}</span>
          </div>
          <div className="node-access-actions" aria-label="Node editing commands">
            <IconButton label="Move selection right" onClick={() => engineRef.current?.moveSelection(10, 0, 'nonvisual')}>
              <MoveRight size={16} />
            </IconButton>
            <IconButton label="Resize primary selection wider" onClick={() => engineRef.current?.resizePrimarySelection(10, 0, 'nonvisual')}>
              <Maximize2 size={16} />
            </IconButton>
            <IconButton label="Copy selection" onClick={() => engineRef.current?.copySelection()}>
              <Copy size={16} />
            </IconButton>
            <IconButton label="Paste copied nodes" onClick={() => engineRef.current?.pasteClipboard('nonvisual')}>
              <Clipboard size={16} />
            </IconButton>
            <IconButton label="Delete selection" onClick={() => engineRef.current?.deleteSelection('nonvisual')}>
              <Trash2 size={16} />
            </IconButton>
          </div>
          <ul className="node-access-list" aria-label="Canvas node list">
            {model.nodes.map((node) => {
              const selected = status.selectedNodeIds.includes(node.id);
              const primary = status.selectedNodeId === node.id;
              return (
                <li key={node.id} className="node-access-row">
                  <button
                    className="node-access-select"
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Selected' : 'Select'} ${node.label}, ${node.kind}, x ${Math.round(node.x)}, y ${Math.round(node.y)}, width ${Math.round(node.w)}, height ${Math.round(node.h)}`}
                    onClick={() => engineRef.current?.selectNode(node.id, 'nonvisual')}
                  >
                    <span>{node.label}</span>
                    <span>{primary ? 'Primary' : selected ? 'Selected' : node.kind}</span>
                  </button>
                  <button
                    className="node-access-toggle"
                    type="button"
                    aria-label={`Toggle ${node.label} in selection`}
                    aria-pressed={selected}
                    onClick={() => engineRef.current?.selectNode(node.id, 'nonvisual', 'toggle')}
                  >
                    +
                  </button>
                  <span className="node-access-meta">
                    {node.kind} · x {Math.round(node.x)} · y {Math.round(node.y)} · {Math.round(node.w)}x{Math.round(node.h)}
                  </span>
                  <span className="node-access-detail">{node.detail}</span>
                </li>
              );
            })}
          </ul>
        </aside> : null}

        <div className="statusbar" role="status" aria-live="polite">
          <span>
            {status.selectionCount > 1
              ? `${status.selectionCount} selected`
              : status.selectedNodeId
                ? `Selected ${status.selectedNodeId}`
                : 'No selection'}
          </span>
          <span>
            {status.cursorWorld
              ? `x ${Math.round(status.cursorWorld.x)} · y ${Math.round(status.cursorWorld.y)}`
              : 'Move over canvas'}
          </span>
          <span>
            Drawn {status.renderedNodes}/{status.totalNodes}
          </span>
          <span>{status.interaction}</span>
          <span>{lastModelChange ? `${lastModelChange.kind} ${lastModelChange.nodeId} ${lastModelChange.source}` : 'No model changes'}</span>
        </div>
      </section>
    </main>
  );
}

type IconButtonProps = {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

function IconButton({ label, onClick, children }: IconButtonProps) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}
