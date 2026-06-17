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
import { defaultStarterCollection, STARTER_WORKSPACE_STORAGE_KEY } from './catalog/starterCatalog';
import {
  NestedCanvasWorkspace,
  NodeAccessPanel,
  WorkspaceStatusBar,
  initialViewportStatus,
  type NestedCanvasWorkspaceChromeState,
  type NestedCanvasWorkspaceHandle,
} from './engine/nested/NestedCanvasWorkspace';
import type { CanvasCommand, ThemeName } from './engine/types';
import type { DocumentCommand } from './engine/documentTypes';

const ONBOARDING_DISMISSED_STORAGE_KEY = 'canaster:onboarding-dismissed:v1';
const LOCAL_SAVE_MESSAGE = 'Saved on this device';
const ONLINE_READY_MESSAGE = 'Ready to save online';
const SAVED_MESSAGE = 'Saved';

export function App() {
  const workspaceRef = useRef<NestedCanvasWorkspaceHandle | null>(null);
  const ignoreDirtyUntilRef = useRef(0);
  const lastSavedSnapshotSignatureRef = useRef<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [nodesOpen, setNodesOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => window.localStorage.getItem(ONBOARDING_DISMISSED_STORAGE_KEY) === 'true');
  const [authEmail, setAuthEmail] = useState(() => window.localStorage.getItem(DAPTIN_LAST_EMAIL_STORAGE_KEY) ?? '');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [documents, setDocuments] = useState<CanasterDocumentSummary[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState(() => window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) ?? '');
  const [documentTitle, setDocumentTitle] = useState('Canaster Workspace');
  const [syncStatus, setSyncStatus] = useState<'anonymous' | 'loading' | 'clean' | 'dirty' | 'saving' | 'error'>(() => (getToken() ? 'loading' : 'anonymous'));
  const [syncMessage, setSyncMessage] = useState(() => (getToken() ? 'Opening last workspace' : LOCAL_SAVE_MESSAGE));
  const initialCollection = useMemo(() => defaultStarterCollection(), []);
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
        setSyncMessage(SAVED_MESSAGE);
        return;
      }
      setSyncStatus((current) => current === 'loading' || current === 'saving' || current === 'error' ? current : 'dirty');
      setSyncMessage((current) => current === 'Opening workspace' || current === 'Saving workspace' ? current : 'Unsaved changes');
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
    setSyncMessage('Opening workspace');
    try {
      const snapshot = await loadDocument(documentRef);
      lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      workspaceRef.current?.loadWorkspaceSnapshot(snapshot, 'Document loaded');
      window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
      setActiveDocumentId(documentRef);
      setSyncStatus('clean');
      setSyncMessage(SAVED_MESSAGE);
      window.setTimeout(() => {
        const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
        if (currentSnapshot && snapshotSignature(currentSnapshot) === lastSavedSnapshotSignatureRef.current) {
          setSyncStatus('clean');
          setSyncMessage(SAVED_MESSAGE);
        }
      }, 1600);
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(workspaceErrorMessage(error, 'open'));
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
        setSyncMessage(ONLINE_READY_MESSAGE);
      })
      .catch((error) => {
        if (canceled) return;
        setSyncStatus('error');
        setSyncMessage(workspaceErrorMessage(error, 'open'));
      });
    return () => {
      canceled = true;
    };
  }, [activeDocumentId, loadDaptinDocument, refreshDocuments, signedIn]);

  const handleSignUp = useCallback(async () => {
    if (!authEmail.trim() || !authPassword) return;
    setSyncStatus('loading');
    setSyncMessage('Creating account');
    try {
      await signUp({ name: authName.trim() || 'Canaster User', email: authEmail.trim(), password: authPassword });
      window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, authEmail.trim());
      setSignedIn(true);
      setSyncStatus('clean');
      setSyncMessage(ONLINE_READY_MESSAGE);
      await refreshDocuments();
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(accountErrorMessage(error, 'create'));
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
      setSyncMessage(ONLINE_READY_MESSAGE);
      await refreshDocuments();
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(accountErrorMessage(error, 'sign-in'));
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
    setSyncMessage(LOCAL_SAVE_MESSAGE);
  }, []);

  const handleCreateDocument = useCallback(async () => {
    const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
    if (!snapshot) {
      setSyncStatus('error');
      setSyncMessage('Workspace is not ready yet');
      return;
    }
    setSyncStatus('saving');
    setSyncMessage('Saving new workspace');
    try {
      await workspaceRef.current?.flushWorkspaceSnapshot();
      const documentRef = await createDocument(documentTitle, snapshot);
      lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
      window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
      setActiveDocumentId(documentRef);
      await refreshDocuments();
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      setSyncStatus('clean');
      setSyncMessage(SAVED_MESSAGE);
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(workspaceErrorMessage(error, 'save'));
    }
  }, [documentTitle, refreshDocuments]);

  const handleSaveDocument = useCallback(async () => {
    if (!activeDocumentId) return;
    const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
    if (!snapshot) {
      setSyncStatus('error');
      setSyncMessage('Workspace is not ready yet');
      return;
    }
    setSyncStatus('saving');
    setSyncMessage('Saving workspace');
    try {
      await workspaceRef.current?.flushWorkspaceSnapshot();
      await saveDocument(activeDocumentId, snapshot);
      lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
      await refreshDocuments();
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      setSyncStatus('clean');
      setSyncMessage(SAVED_MESSAGE);
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(workspaceErrorMessage(error, 'save'));
    }
  }, [activeDocumentId, refreshDocuments]);

  const handleRefreshDocuments = useCallback(async () => {
    if (!getToken()) {
      setSyncStatus('anonymous');
      setSyncMessage(LOCAL_SAVE_MESSAGE);
      return;
    }
    setSyncStatus('loading');
    setSyncMessage('Checking saved workspaces');
    try {
      await refreshDocuments();
      setSyncStatus('clean');
      setSyncMessage(activeDocumentId ? SAVED_MESSAGE : ONLINE_READY_MESSAGE);
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(workspaceErrorMessage(error, 'refresh'));
    }
  }, [activeDocumentId, refreshDocuments]);

  const dismissOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_STORAGE_KEY, 'true');
    setOnboardingDismissed(true);
  }, []);

  const handleOpenNodePanel = useCallback(() => {
    setNodesOpen((open) => {
      const next = !open;
      if (next) dismissOnboarding();
      return next;
    });
  }, [dismissOnboarding]);

  const handleShowWorkItems = useCallback(() => {
    setNodesOpen(true);
    dismissOnboarding();
  }, [dismissOnboarding]);

  const showOnboarding = !activeDocumentId && !onboardingDismissed && !nodesOpen;

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Workspace map">
        <div className="topbar" aria-label="Workspace tools">
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
            <IconButton label="Center map" onClick={() => workspaceRef.current?.fitActiveCanvas()}>
              <Maximize2 size={17} />
            </IconButton>
            <IconButton label="Reset map zoom" onClick={() => workspaceRef.current?.resetActiveZoom()}>
              <RotateCcw size={17} />
            </IconButton>
            <IconButton label="Zoom out" onClick={() => workspaceRef.current?.zoomActiveBy(0.82)}>
              <Minus size={17} />
            </IconButton>
            <span className="zoom-readout">Map</span>
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
            <IconButton label={nodesOpen ? 'Close work items' : 'Open work items'} onClick={handleOpenNodePanel}>
              {nodesOpen ? <X size={17} /> : <ListTree size={17} />}
            </IconButton>
          </div>
          <form className="toolbar-group document-group" aria-label="Saved workspaces" onSubmit={(event) => event.preventDefault()}>
            {signedIn ? (
              <>
                <select
                  className="shell-select"
                  aria-label="Saved workspace"
                  name="active-document"
                  value={activeDocumentId}
                  onChange={(event) => loadDaptinDocument(event.target.value)}
                >
                  <option value="">No saved workspace</option>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>{document.title}</option>
                  ))}
                </select>
                <input
                  className="shell-input"
                  aria-label="Workspace name"
                  name="document-title"
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                />
                <IconButton label="Save as new workspace" onClick={handleCreateDocument}>
                  <FilePlus2 size={17} />
                </IconButton>
                <IconButton label="Save workspace" disabled={!activeDocumentId || syncStatus === 'saving'} onClick={handleSaveDocument}>
                  <Save size={17} />
                </IconButton>
                <IconButton label="Refresh saved workspaces" onClick={handleRefreshDocuments}>
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
                  aria-label="Your name"
                  name="name"
                  autoComplete="name"
                  placeholder="Name"
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                />
                <input
                  className="shell-input"
                  type="email"
                  aria-label="Email"
                  name="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                />
                <input
                  className="shell-input"
                  type="password"
                  aria-label="Password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="Password"
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
          fitOnFirstLoad={!activeDocumentId}
          storageKey={workspaceStorageKey}
          onCollectionChange={handleWorkspaceCollectionChange}
          onChromeStateChange={handleChromeStateChange}
        />
        {showOnboarding ? (
          <FirstRunGuide
            onDismiss={dismissOnboarding}
            onFitSample={() => workspaceRef.current?.fitActiveCanvas()}
            onShowWorkItems={handleShowWorkItems}
          />
        ) : null}
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

type FirstRunGuideProps = {
  onDismiss: () => void;
  onFitSample: () => void;
  onShowWorkItems: () => void;
};

function FirstRunGuide({ onDismiss, onFitSample, onShowWorkItems }: FirstRunGuideProps) {
  return (
    <aside className="first-run-guide" aria-label="Start with the sample workspace">
      <button className="guide-close" type="button" aria-label="Dismiss getting started guide" onClick={onDismiss}>
        <X size={15} />
      </button>
      <p className="guide-label">Starter workspace</p>
      <h2>Plan one job, then step inside it.</h2>
      <p>
        This sample keeps intake, crew, site notes, and proof connected. Move a work item, open the large job view, and come back to the bigger picture when the details are clear.
      </p>
      <ul>
        <li>Your changes stay on this device until you sign in.</li>
        <li>The work-items panel gives a plain list when the map feels busy.</li>
      </ul>
      <div className="guide-actions" aria-label="Getting started actions">
        <button className="guide-action primary" type="button" onClick={onFitSample}>
          <Maximize2 size={15} />
          Center sample
        </button>
        <button className="guide-action" type="button" onClick={onShowWorkItems}>
          <ListTree size={15} />
          Show work items
        </button>
        <button className="guide-action quiet" type="button" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </aside>
  );
}

function workspaceErrorMessage(error: unknown, action: 'open' | 'refresh' | 'save'): string {
  const message = rawErrorMessage(error);
  if (looksOffline(message)) return 'Could not reach saved workspaces. Check your connection and try again.';
  if (action === 'open') return 'Could not open this workspace. Refresh saved workspaces or choose another one.';
  if (action === 'refresh') return 'Could not refresh saved workspaces. Check your connection and try again.';
  return 'Could not save this workspace. Check your connection and try again.';
}

function accountErrorMessage(error: unknown, action: 'create' | 'sign-in'): string {
  const message = rawErrorMessage(error);
  if (looksOffline(message)) return 'Could not reach accounts. Check your connection and try again.';
  if (action === 'create') return 'Could not create the account. Check the email and password, then try again.';
  return 'Could not sign in. Check the email and password, then try again.';
}

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

function looksOffline(message: string): boolean {
  return /network|fetch|offline|failed to fetch|connection|timeout/i.test(message);
}

function snapshotSignature(snapshot: unknown): string {
  return JSON.stringify(snapshot);
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
