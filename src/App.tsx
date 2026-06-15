import { Maximize2, Minus, Moon, Plus, RotateCcw, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CanvasEngine } from './engine/CanvasEngine';
import { sampleModel } from './engine/sampleModel';
import type { CanvasModel, CanvasModelChange, ThemeName, ViewportStatus } from './engine/types';

const initialStatus: ViewportStatus = {
  zoom: 1,
  selectedNodeId: null,
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
          </div>
        </div>

        <canvas ref={canvasRef} className="canvas-surface" aria-label="Canway canvas" />

        <div className="statusbar" role="status" aria-live="polite">
          <span>{status.selectedNodeId ? `Selected ${status.selectedNodeId}` : 'No selection'}</span>
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
