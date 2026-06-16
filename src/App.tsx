import { FilePlus2, ListTree, LogIn, LogOut, Maximize2, Minus, Moon, Plus, Redo2, RefreshCw, RotateCcw, Save, Sun, Undo2, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDocument,
  listDocuments,
  loadDocument,
  saveDocument,
  signIn,
  signOut,
  signUp,
  type CanasterDocumentSummary,
} from './backend/canasterDocuments';
import { DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, DAPTIN_LAST_EMAIL_STORAGE_KEY, getToken } from './backend/daptinClient';
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

const STARTER_WORKSPACE_STORAGE_KEY = 'starter:service-work-v2';

export function App() {
  const workspaceRef = useRef<NestedCanvasWorkspaceHandle | null>(null);
  const ignoreDirtyUntilRef = useRef(0);
  const lastSavedSnapshotSignatureRef = useRef<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [nodesOpen, setNodesOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState(() => window.localStorage.getItem(DAPTIN_LAST_EMAIL_STORAGE_KEY) ?? '');
  const [authName, setAuthName] = useState('Canaster User');
  const [authPassword, setAuthPassword] = useState('');
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [documents, setDocuments] = useState<CanasterDocumentSummary[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState(() => window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) ?? '');
  const [documentTitle, setDocumentTitle] = useState('Canaster Workspace');
  const [syncStatus, setSyncStatus] = useState<'anonymous' | 'loading' | 'clean' | 'dirty' | 'saving' | 'error'>(() => (getToken() ? 'loading' : 'anonymous'));
  const [syncMessage, setSyncMessage] = useState(() => (getToken() ? 'Restoring session' : 'Local draft'));
  const initialCollection = useMemo(() => createSampleDocumentCollection(), []);
  const workspaceStorageKey = activeDocumentId ? `daptin:${activeDocumentId}` : STARTER_WORKSPACE_STORAGE_KEY;
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

  const handleWorkspaceCollectionChange = useCallback(() => {
    if (Date.now() < ignoreDirtyUntilRef.current) return;
    if (activeDocumentId) {
      const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
      if (currentSnapshot && snapshotSignature(currentSnapshot) === lastSavedSnapshotSignatureRef.current) {
        setSyncStatus('clean');
        setSyncMessage('Saved');
        return;
      }
      setSyncStatus((current) => current === 'loading' || current === 'saving' || current === 'error' ? current : 'dirty');
      setSyncMessage((current) => current === 'Loading document' || current === 'Saving document' ? current : 'Unsaved changes');
    }
  }, [activeDocumentId]);

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

  const refreshDocuments = useCallback(async () => {
    if (!getToken()) return [];
    const rows = await listDocuments();
    setDocuments(rows);
    return rows;
  }, []);

  const loadDaptinDocument = useCallback(async (documentRef: string) => {
    if (!documentRef) return;
    setSyncStatus('loading');
    setSyncMessage('Loading document');
    try {
      const snapshot = await loadDocument(documentRef);
      lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      workspaceRef.current?.loadWorkspaceSnapshot(snapshot, 'Document loaded');
      window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
      setActiveDocumentId(documentRef);
      setSyncStatus('clean');
      setSyncMessage('Saved');
      window.setTimeout(() => {
        const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
        if (currentSnapshot && snapshotSignature(currentSnapshot) === lastSavedSnapshotSignatureRef.current) {
          setSyncStatus('clean');
          setSyncMessage('Saved');
        }
      }, 1600);
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let canceled = false;
    refreshDocuments()
      .then((rows) => {
        if (canceled) return;
        const restoredDocumentId = activeDocumentId || window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) || '';
        if (restoredDocumentId) {
          return loadDaptinDocument(restoredDocumentId);
        }
        setSyncStatus('clean');
        setSyncMessage('Signed in');
      })
      .catch((error) => {
        if (canceled) return;
        setSyncStatus('error');
        setSyncMessage(errorMessage(error));
      });
    return () => {
      canceled = true;
    };
  }, [activeDocumentId, loadDaptinDocument, refreshDocuments, signedIn]);

  const handleSignUp = useCallback(async () => {
    if (!authEmail.trim() || !authPassword) return;
    setSyncStatus('loading');
    setSyncMessage('Signing up');
    try {
      await signUp({ name: authName.trim() || 'Canaster User', email: authEmail.trim(), password: authPassword });
      window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, authEmail.trim());
      setSignedIn(true);
      setSyncStatus('clean');
      setSyncMessage('Signed in');
      await refreshDocuments();
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(errorMessage(error));
    }
  }, [authEmail, authName, authPassword, refreshDocuments]);

  const handleSignIn = useCallback(async () => {
    if (!authEmail.trim() || !authPassword) return;
    setSyncStatus('loading');
    setSyncMessage('Signing in');
    try {
      await signIn({ email: authEmail.trim(), password: authPassword });
      window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, authEmail.trim());
      setSignedIn(true);
      setSyncStatus('clean');
      setSyncMessage('Signed in');
      await refreshDocuments();
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(errorMessage(error));
    }
  }, [authEmail, authPassword, refreshDocuments]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    window.localStorage.removeItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY);
    setSignedIn(false);
    setActiveDocumentId('');
    lastSavedSnapshotSignatureRef.current = null;
    setDocuments([]);
    setAuthPassword('');
    setSyncStatus('anonymous');
    setSyncMessage('Local draft');
  }, []);

  const handleCreateDocument = useCallback(async () => {
    const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
    if (!snapshot) return;
    setSyncStatus('saving');
    setSyncMessage('Creating document');
    try {
      await workspaceRef.current?.flushWorkspaceSnapshot();
      const documentRef = await createDocument(documentTitle, snapshot);
      lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
      window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
      setActiveDocumentId(documentRef);
      await refreshDocuments();
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      setSyncStatus('clean');
      setSyncMessage('Saved');
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(errorMessage(error));
    }
  }, [documentTitle, refreshDocuments]);

  const handleSaveDocument = useCallback(async () => {
    if (!activeDocumentId) return;
    const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
    if (!snapshot) return;
    setSyncStatus('saving');
    setSyncMessage('Saving document');
    try {
      await workspaceRef.current?.flushWorkspaceSnapshot();
      await saveDocument(activeDocumentId, snapshot);
      lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
      await refreshDocuments();
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      setSyncStatus('clean');
      setSyncMessage('Saved');
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(errorMessage(error));
    }
  }, [activeDocumentId, refreshDocuments]);

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Canvas workspace">
        <div className="topbar" aria-label="Canvas controls">
          <div className="brand">
            <span className="brand-mark" />
            <span>Canaster</span>
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
          <form className="toolbar-group document-group" aria-label="Documents" onSubmit={(event) => event.preventDefault()}>
            {signedIn ? (
              <>
                <select
                  className="shell-select"
                  aria-label="Active document"
                  name="active-document"
                  value={activeDocumentId}
                  onChange={(event) => loadDaptinDocument(event.target.value)}
                >
                  <option value="">No document</option>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>{document.title}</option>
                  ))}
                </select>
                <input
                  className="shell-input"
                  aria-label="Document title"
                  name="document-title"
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                />
                <IconButton label="Create document" onClick={handleCreateDocument}>
                  <FilePlus2 size={17} />
                </IconButton>
                <IconButton label="Save document" disabled={!activeDocumentId || syncStatus === 'saving'} onClick={handleSaveDocument}>
                  <Save size={17} />
                </IconButton>
                <IconButton label="Refresh documents" onClick={() => refreshDocuments()}>
                  <RefreshCw size={17} />
                </IconButton>
                <IconButton label="Sign out" onClick={handleSignOut}>
                  <LogOut size={17} />
                </IconButton>
              </>
            ) : (
              <>
                <input
                  className="shell-input"
                  aria-label="Name"
                  name="name"
                  autoComplete="name"
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                />
                <input
                  className="shell-input"
                  type="email"
                  aria-label="Email"
                  name="email"
                  autoComplete="email"
                  placeholder="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                />
                <input
                  className="shell-input"
                  type="password"
                  aria-label="Password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
                <IconButton label="Sign up" disabled={!authEmail || !authPassword || syncStatus === 'loading'} onClick={handleSignUp}>
                  <UserPlus size={17} />
                </IconButton>
                <IconButton label="Sign in" disabled={!authEmail || !authPassword || syncStatus === 'loading'} onClick={handleSignIn}>
                  <LogIn size={17} />
                </IconButton>
              </>
            )}
            <span className={`sync-readout ${syncStatus}`}>{syncMessage}</span>
          </form>
        </div>

        <NestedCanvasWorkspace
          ref={workspaceRef}
          initialCollection={initialCollection}
          theme={theme}
          storageKey={workspaceStorageKey}
          onCollectionChange={handleWorkspaceCollectionChange}
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return userFacingError(error.message);
  if (typeof error === 'string') return userFacingError(error);
  return 'Save failed';
}

function userFacingError(message: string): string {
  return message.replace(/daptin\s*/gi, '').replace(/\s+/g, ' ').trim() || 'Request failed';
}

function snapshotSignature(snapshot: unknown): string {
  return JSON.stringify(snapshot);
}

const sampleNestedCanvasModel: CanvasModel = {
  schemaVersion: 2,
  nodes: [
    {
      id: 'site-summary',
      type: 'card',
      x: -120,
      y: -72,
      w: 248,
      h: 112,
      data: {
        title: 'Customer and site',
        detail: 'Address, contact, access notes, and arrival window',
        accent: 'data',
      },
    },
    {
      id: 'work-checklist',
      type: 'card',
      x: 168,
      y: -64,
      w: 248,
      h: 112,
      data: {
        title: 'Work checklist',
        detail: 'Inspect, repair, test, clean up, and get sign-off',
        accent: 'task',
      },
    },
    {
      id: 'parts-tools',
      type: 'card',
      x: -96,
      y: 88,
      w: 252,
      h: 112,
      data: {
        title: 'Parts and tools',
        detail: 'Items to bring, missing supplies, and return stock',
        accent: 'system',
      },
    },
    {
      id: 'site-note',
      type: 'text',
      x: 196,
      y: 96,
      w: 236,
      h: 120,
      data: {
        text: 'Keep notes here while the full day stays visible one level up.',
      },
    },
  ],
};

function createSampleDocumentCollection() {
  const collectionWithRoot = createInitialDocumentCollection(sampleModel, 'Work board');
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
