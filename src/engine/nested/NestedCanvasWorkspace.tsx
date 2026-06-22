import { Clipboard, Copy, Maximize2, MoveRight, Trash2 } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { listImageAssets, uploadImageAsset, type CanasterAssetSummary } from '../../backend/assets';
import { hasUsableStoredToken, normalizeDaptinError } from '../../backend/daptinClient';
import { cloneDocumentCollection } from '../documentModel';
import { describeNode, parseNodeData } from '../nodeTypes/registry';
import { BuiltInNodeTypes, type CanvasCommand, type CanvasNode, type CheckNodeData, type CheckNodeItem, type ImageNodeData, type ThemeName, type ViewportStatus } from '../types';
import type {
  CanvasDocumentCollection,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
} from '../documentTypes';
import { createWorkspaceHistory, createWorkspaceSnapshot } from '../workspaceHistory';
import { NativeNestedCanvasController } from './NativeNestedCanvasController';

export type NestedCanvasWorkspaceProps = {
  initialCollection: CanvasDocumentCollection;
  theme: ThemeName;
  parentContextVisible?: boolean;
  animationEnabled?: boolean;
  fitOnFirstLoad?: boolean;
  storageKey?: string;
  onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
};

export type NestedCanvasWorkspaceChromeState = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  lastModelChange: DocumentModelChange | null;
  canUndo: boolean;
  canRedo: boolean;
};

export type NestedCanvasWorkspaceHandle = {
  fitActiveCanvas(): void;
  refreshActiveCanvas(): void;
  resetActiveZoom(): void;
  zoomActiveBy(factor: number): void;
  undoWorkspace(): boolean;
  redoWorkspace(): boolean;
  executeActiveCanvasCommand(command: CanvasCommand): boolean;
  executeDocumentCommand(command: DocumentCommand): void;
  collection(): CanvasDocumentCollection;
  getWorkspaceSnapshot(): CanvasWorkspaceSnapshot;
  loadWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, interaction?: string): void;
  flushWorkspaceSnapshot(): Promise<void>;
};

export const initialViewportStatus: ViewportStatus = {
  zoom: 1,
  selectedNodeId: null,
  selectedNodeIds: [],
  selectionCount: 0,
  cursorWorld: null,
  renderedNodes: 0,
  totalNodes: 0,
  interaction: 'Idle',
};

export const NestedCanvasWorkspace = forwardRef<NestedCanvasWorkspaceHandle, NestedCanvasWorkspaceProps>(function NestedCanvasWorkspace(
  {
    initialCollection,
    theme,
    parentContextVisible = true,
    fitOnFirstLoad = true,
    storageKey,
    onCollectionChange,
    onChromeStateChange,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<NativeNestedCanvasController | null>(null);
  const callbacksRef = useRef({ onCollectionChange, onChromeStateChange });
  const initialCollectionRef = useRef(initialCollection);

  useEffect(() => {
    callbacksRef.current = { onCollectionChange, onChromeStateChange };
  }, [onCollectionChange, onChromeStateChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new NativeNestedCanvasController({
      root: host,
      initialCollection: initialCollectionRef.current,
      theme,
      parentContextVisible,
      fitOnFirstLoad,
      storageKey,
      onCollectionChange: (collection, changes) => callbacksRef.current.onCollectionChange?.(collection, changes),
      onChromeStateChange: (state) => callbacksRef.current.onChromeStateChange?.(state),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [fitOnFirstLoad, storageKey]);

  useEffect(() => {
    controllerRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    controllerRef.current?.setParentContextVisible(parentContextVisible);
  }, [parentContextVisible]);

  useImperativeHandle(ref, () => ({
    fitActiveCanvas: () => controllerRef.current?.fitActiveCanvas(),
    refreshActiveCanvas: () => controllerRef.current?.refreshActiveCanvas(),
    resetActiveZoom: () => controllerRef.current?.resetActiveZoom(),
    zoomActiveBy: (factor: number) => controllerRef.current?.zoomActiveBy(factor),
    undoWorkspace: () => controllerRef.current?.undoWorkspace() ?? false,
    redoWorkspace: () => controllerRef.current?.redoWorkspace() ?? false,
    executeActiveCanvasCommand: (command: CanvasCommand) => controllerRef.current?.executeActiveCanvasCommand(command) ?? false,
    executeDocumentCommand: (command: DocumentCommand) => controllerRef.current?.executeDocumentCommand(command),
    collection: () => controllerRef.current?.collection() ?? cloneDocumentCollection(initialCollection),
    getWorkspaceSnapshot: () => controllerRef.current?.getWorkspaceSnapshot() ?? createWorkspaceSnapshot(createWorkspaceHistory(initialCollection), null),
    loadWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot, interaction?: string) => controllerRef.current?.loadWorkspaceSnapshot(snapshot, interaction),
    flushWorkspaceSnapshot: () => controllerRef.current?.flushWorkspaceSnapshot() ?? Promise.resolve(),
  }), [initialCollection]);

  return <div ref={hostRef} className="nested-workspace" aria-label="Workspace map" />;
});

export type NodeAccessPanelProps = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  executeActiveCanvasCommand: (command: CanvasCommand) => boolean;
  executeDocumentCommand: (command: DocumentCommand) => void;
};

export function NodeAccessPanel({ collection, status, executeActiveCanvasCommand, executeDocumentCommand }: NodeAccessPanelProps) {
  const activeDocument = collection.documents[collection.activeCanvasId];
  const model = activeDocument.model;
  const primaryNode = status.selectedNodeId ? model.nodes.find((node) => node.id === status.selectedNodeId) ?? null : null;
  return (
    <aside className="node-access-panel" aria-label="Work items in this view">
      <div className="node-access-header">
        <span>Work items</span>
        <span>{status.selectionCount ? `${status.selectionCount} selected` : 'Choose an item'}</span>
      </div>
      <div className="node-access-actions" aria-label="Work item editing commands">
        <IconButton label="Move selected item right" onClick={() => executeActiveCanvasCommand({ type: 'move-selection', dx: 32, dy: 0, source: 'nonvisual' })}>
          <MoveRight size={16} />
        </IconButton>
        <IconButton label="Make selected item wider" onClick={() => executeActiveCanvasCommand({ type: 'resize-primary', dw: 32, dh: 0, source: 'nonvisual' })}>
          <Maximize2 size={16} />
        </IconButton>
        <IconButton label="Copy selected item" onClick={() => executeActiveCanvasCommand({ type: 'copy-selection', source: 'nonvisual' })}>
          <Copy size={16} />
        </IconButton>
        <IconButton label="Paste copied item" onClick={() => executeActiveCanvasCommand({ type: 'paste-clipboard', source: 'nonvisual' })}>
          <Clipboard size={16} />
        </IconButton>
        <IconButton label="Delete selected item" onClick={() => executeActiveCanvasCommand({ type: 'delete-selection', source: 'nonvisual' })}>
          <Trash2 size={16} />
        </IconButton>
      </div>
      <ul className="node-access-list" aria-label="Work items in this view">
        {model.nodes.map((node) => {
          const selected = status.selectedNodeIds.includes(node.id);
          const primary = status.selectedNodeId === node.id;
          const description = describeNode(node);
          return (
            <li key={node.id} className="node-access-row">
              <button
                className="node-access-select"
                type="button"
                aria-pressed={selected}
                aria-label={`${selected ? 'Selected' : 'Select'} ${description.label}, ${description.roleDescription}`}
                onClick={() => executeActiveCanvasCommand({ type: 'select-node', nodeId: node.id, source: 'nonvisual' })}
              >
                <span>{description.label}</span>
                <span>{primary ? 'Primary' : selected ? 'Selected' : description.roleDescription}</span>
              </button>
              <button
                className="node-access-toggle"
                type="button"
                aria-label={`Toggle ${description.label} in selection`}
                aria-pressed={selected}
                onClick={() => executeActiveCanvasCommand({ type: 'select-node', nodeId: node.id, mode: 'toggle', source: 'nonvisual' })}
              >
                +
              </button>
              <span className="node-access-meta">
                {description.roleDescription}
              </span>
              {description.details.length ? <span className="node-access-detail">{description.details.join(' · ')}</span> : null}
              {description.actions.map((action) => (
                <button
                  key={action.id}
                  className="node-action-button"
                  type="button"
                  disabled={!action.available}
                  onClick={() => executeDocumentCommand({ type: 'execute-node-action', canvasId: collection.activeCanvasId, nodeId: node.id, actionId: action.id, source: 'nonvisual' })}
                >
                  {action.label}
                </button>
              ))}
            </li>
          );
        })}
      </ul>
      {primaryNode?.type === BuiltInNodeTypes.check ? (
        <ChecklistInspector
          canvasId={collection.activeCanvasId}
          node={primaryNode}
          executeDocumentCommand={executeDocumentCommand}
        />
      ) : null}
      {primaryNode?.type === BuiltInNodeTypes.image ? (
        <ImageInspector
          canvasId={collection.activeCanvasId}
          node={primaryNode}
          executeDocumentCommand={executeDocumentCommand}
        />
      ) : null}
    </aside>
  );
}

function ImageInspector({
  canvasId,
  node,
  executeDocumentCommand,
}: {
  canvasId: string;
  node: CanvasNode;
  executeDocumentCommand: (command: DocumentCommand) => void;
}) {
  const data = parseNodeData(node) as ImageNodeData;
  const [assets, setAssets] = useState<CanasterAssetSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [assetAccess, setAssetAccess] = useState(() => hasUsableStoredToken());
  const canUseAssets = assetAccess;

  useEffect(() => {
    let canceled = false;
    if (!canUseAssets) {
      setAssets([]);
      setBusy(false);
      setMessage('Sign in to upload and select image sources.');
      return () => {
        canceled = true;
      };
    }
    setBusy(true);
    setMessage('');
    listImageAssets()
      .then((rows) => {
        if (!canceled) setAssets(rows);
      })
      .catch((error) => {
        if (!canceled) {
          const apiError = normalizeDaptinError(error);
          if (apiError.kind === 'session' || apiError.kind === 'permission') {
            setAssetAccess(false);
            setMessage('Sign in to upload and select image sources.');
          } else {
            setMessage(error instanceof Error ? error.message : 'Could not list images');
          }
        }
      })
      .finally(() => {
        if (!canceled) setBusy(false);
      });
    return () => {
      canceled = true;
    };
  }, [canUseAssets]);

  function updateImage(to: ImageNodeData) {
    executeDocumentCommand({ type: 'set-node-data', canvasId, nodeId: node.id, from: node.data, to, source: 'nonvisual' });
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    if (!canUseAssets) {
      setMessage('Sign in to upload and select image sources.');
      return;
    }
    setBusy(true);
    setMessage('Uploading image');
    try {
      const asset = await uploadImageAsset(file);
      setAssets((current) => [asset, ...current.filter((candidate) => candidate.id !== asset.id)]);
      updateImage({
        ...data,
        assetId: asset.id,
        alt: data.alt || cleanImageName(asset.name),
      });
      setMessage('Image uploaded');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not upload image');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="image-inspector" aria-label="Image editor">
      <div className="image-inspector-header">
        <span>Image</span>
        <span>{data.assetId ? 'Source selected' : 'Missing source'}</span>
      </div>
      <label className="image-upload-action">
        <span>{busy ? 'Working...' : 'Upload image'}</span>
        <input
          type="file"
          accept="image/*"
          disabled={busy || !canUseAssets}
          onChange={(event) => {
            void handleUpload(event.target.files?.[0] ?? null);
            event.currentTarget.value = '';
          }}
        />
      </label>
      <label className="image-field">
        <span>Select saved image</span>
        <select
          value={data.assetId ?? ''}
          disabled={busy || !canUseAssets}
          onChange={(event) => updateImage({ ...data, assetId: event.target.value || null })}
        >
          <option value="">No image source</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>{asset.name}</option>
          ))}
        </select>
      </label>
      <label className="image-field">
        <span>Alt text</span>
        <input value={data.alt} onChange={(event) => updateImage({ ...data, alt: event.target.value })} />
      </label>
      <label className="image-field">
        <span>Caption</span>
        <input value={data.caption ?? ''} onChange={(event) => updateImage({ ...data, caption: event.target.value })} />
      </label>
      <div className="image-fit-control" aria-label="Image fit">
        <button type="button" aria-pressed={data.fit === 'contain'} onClick={() => updateImage({ ...data, fit: 'contain' })}>Contain</button>
        <button type="button" aria-pressed={data.fit === 'cover'} onClick={() => updateImage({ ...data, fit: 'cover' })}>Cover</button>
      </div>
      {message ? <p className="image-inspector-status" role="status">{message}</p> : null}
    </section>
  );
}

function ChecklistInspector({
  canvasId,
  node,
  executeDocumentCommand,
}: {
  canvasId: string;
  node: CanvasNode;
  executeDocumentCommand: (command: DocumentCommand) => void;
}) {
  const data = parseNodeData(node) as CheckNodeData;
  const [draftText, setDraftText] = useState('');

  function updateChecklist(to: CheckNodeData) {
    executeDocumentCommand({ type: 'set-node-data', canvasId, nodeId: node.id, from: node.data, to, source: 'nonvisual' });
  }

  function updateItem(itemId: string, patch: Partial<Pick<CheckNodeItem, 'text' | 'checked'>>) {
    updateChecklist({
      ...data,
      items: data.items.map((item) => item.id === itemId ? {
        id: item.id,
        text: patch.text ?? item.text,
        checked: patch.checked ?? item.checked,
      } : item),
    });
  }

  function deleteItem(itemId: string) {
    updateChecklist({
      ...data,
      items: data.items.filter((item) => item.id !== itemId),
    });
  }

  function addItem() {
    const text = draftText.trim();
    updateChecklist({
      ...data,
      items: [...data.items, { id: nextChecklistItemId(data.items), text: text || 'New item', checked: false }],
    });
    setDraftText('');
  }

  return (
    <section className="checklist-inspector" aria-label="Checklist editor">
      <div className="checklist-inspector-header">
        <span>Checklist</span>
        <span>{data.items.filter((item) => item.checked).length} of {data.items.length} done</span>
      </div>
      <label className="checklist-field">
        <span>Title</span>
        <input
          value={data.title}
          onChange={(event) => updateChecklist({ ...data, title: event.target.value })}
        />
      </label>
      <ul className="checklist-editor-list" aria-label="Checklist items">
        {data.items.map((item) => (
          <li key={item.id} className="checklist-editor-row">
            <input
              type="checkbox"
              aria-label={`Mark ${item.text || 'item'} ${item.checked ? 'not done' : 'done'}`}
              checked={item.checked}
              onChange={(event) => updateItem(item.id, { checked: event.target.checked })}
            />
            <input
              type="text"
              value={item.text}
              aria-label="Checklist item text"
              onChange={(event) => updateItem(item.id, { text: event.target.value })}
            />
            <button type="button" aria-label={`Delete ${item.text || 'checklist item'}`} onClick={() => deleteItem(item.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="checklist-add-row">
        <input
          type="text"
          aria-label="New checklist item"
          placeholder="Add first item"
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addItem();
          }}
        />
        <button type="button" onClick={addItem}>Add item</button>
      </div>
    </section>
  );
}

function nextChecklistItemId(items: CheckNodeItem[]) {
  const ids = new Set(items.map((item) => item.id));
  let counter = items.length + 1;
  let id = `item-${counter}`;
  while (ids.has(id)) id = `item-${++counter}`;
  return id;
}

function cleanImageName(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Image';
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}
