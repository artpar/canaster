import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  ListTree,
  Loader2,
  LogIn,
  LogOut,
  Maximize2,
  Minus,
  Moon,
  PanelsTopLeft,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Sun,
  Undo2,
  UserCircle,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDocument,
  listDocuments,
  loadDocumentDetails,
  requestEmailOtp,
  saveDocument,
  signOut,
  verifyEmailOtp,
  type CanasterDocumentSummary,
} from './backend/canasterDocuments';
import {
  DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY,
  DAPTIN_LAST_EMAIL_STORAGE_KEY,
  clearDaptinSession,
  hasUsableStoredToken,
  isSessionError,
  normalizeDaptinError,
  tokenEmail,
} from './backend/daptinClient';
import { defaultStarterCollection, STARTER_WORKSPACE_STORAGE_KEY } from './catalog/starterCatalog';
import { portalDataForNode } from './engine/documentModel';
import {
  NestedCanvasWorkspace,
  NodeAccessPanel,
  initialViewportStatus,
  type NestedCanvasWorkspaceChromeState,
  type NestedCanvasWorkspaceHandle,
} from './engine/nested/NestedCanvasWorkspace';
import { PARENT_CONTEXT_REGIONS, regionForContextVector } from './engine/nested/parentContextField';
import { describeNode } from './engine/nodeTypes/registry';
import type { CanvasCommand, CanvasNode, ThemeName } from './engine/types';
import type { CanvasDocument, CanvasDocumentCollection, CanvasDocumentId, CanvasWorkspaceSnapshot, DocumentCommand, ParentContextRegion, StackFrame } from './engine/documentTypes';
import { saveWorkspaceSnapshot } from './engine/workspaceStorage';
import { createWorkspaceHistory, createWorkspaceSnapshot } from './engine/workspaceHistory';

const ONBOARDING_DISMISSED_STORAGE_KEY = 'canaster:onboarding-dismissed:v1';
const DEFAULT_DOCUMENT_TITLE = 'Canaster Workspace';
const LOCAL_SAVE_MESSAGE = 'Saved on this device';
const ONLINE_READY_MESSAGE = 'Ready to save online';
const SAVED_MESSAGE = 'Saved online';
const NAVIGATOR_VIEWBOX = { width: 360, height: 150 };
const NAVIGATOR_MID_Y = 76;
const CURRENT_GRAPH_POINT: GraphPoint = { x: 150, y: NAVIGATOR_MID_Y };
const NEXT_GRAPH_ELBOW_X = 232;
const NEXT_GRAPH_X = 260;

type UtilityDrawerMode = 'documents' | 'work-items' | null;
type AuthStep = 'email' | 'otp';
type SyncStatus = 'anonymous' | 'loading' | 'clean' | 'dirty' | 'saving' | 'error';

export function App() {
  const workspaceRef = useRef<NestedCanvasWorkspaceHandle | null>(null);
  const ignoreDirtyUntilRef = useRef(0);
  const lastSavedSnapshotSignatureRef = useRef<string | null>(null);
  const preserveCameraOnNextLocalMountRef = useRef(false);
  const initialStoredSessionRef = useRef<boolean | null>(null);
  if (initialStoredSessionRef.current === null) initialStoredSessionRef.current = hasUsableStoredToken();
  const hasInitialStoredSession = initialStoredSessionRef.current === true;
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [utilityDrawerMode, setUtilityDrawerMode] = useState<UtilityDrawerMode>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [parentContextVisible, setParentContextVisible] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => window.localStorage.getItem(ONBOARDING_DISMISSED_STORAGE_KEY) === 'true');
  const [authEmail, setAuthEmail] = useState(() => emailFromStoredToken() || window.localStorage.getItem(DAPTIN_LAST_EMAIL_STORAGE_KEY) || '');
  const [authOtp, setAuthOtp] = useState('');
  const [signedIn, setSignedIn] = useState(() => hasInitialStoredSession);
  const [documents, setDocuments] = useState<CanasterDocumentSummary[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState(() => window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) ?? '');
  const [documentTitle, setDocumentTitle] = useState(DEFAULT_DOCUMENT_TITLE);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (hasInitialStoredSession ? 'loading' : 'anonymous'));
  const [syncMessage, setSyncMessage] = useState(() => (hasInitialStoredSession ? 'Checking saved workspaces' : LOCAL_SAVE_MESSAGE));
  const initialCollection = useMemo(() => defaultStarterCollection(), []);
  const workspaceStorageKey = activeDocumentId ? remoteWorkspaceStorageKey(activeDocumentId) : STARTER_WORKSPACE_STORAGE_KEY;
  const fitWorkspaceOnFirstLoad = !activeDocumentId && !preserveCameraOnNextLocalMountRef.current;
  const workItemsOpen = !accountOpen && utilityDrawerMode === 'work-items';
  const documentsOpen = !accountOpen && utilityDrawerMode === 'documents';
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
    if (!signedIn || !activeDocumentId) {
      setSyncStatus((current) => current === 'loading' || current === 'saving' || current === 'error' ? current : signedIn ? 'dirty' : 'anonymous');
      setSyncMessage((current) => current === 'Checking saved workspaces' || current === 'Saving workspace' ? current : signedIn ? ONLINE_READY_MESSAGE : LOCAL_SAVE_MESSAGE);
      return;
    }
    const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
    if (currentSnapshot && snapshotSignature(currentSnapshot) === lastSavedSnapshotSignatureRef.current) {
      setSyncStatus('clean');
      setSyncMessage(SAVED_MESSAGE);
      return;
    }
    setSyncStatus((current) => current === 'loading' || current === 'saving' || current === 'error' ? current : 'dirty');
    setSyncMessage((current) => current === 'Opening workspace' || current === 'Saving workspace' ? current : 'Unsaved online changes');
  }, [activeDocumentId, signedIn]);

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

  useEffect(() => {
    if (accountOpen && utilityDrawerMode) setUtilityDrawerMode(null);
  }, [accountOpen, utilityDrawerMode]);

  useEffect(() => {
    if (!activeDocumentId && preserveCameraOnNextLocalMountRef.current) {
      preserveCameraOnNextLocalMountRef.current = false;
    }
  }, [activeDocumentId, workspaceStorageKey]);

  useEffect(() => {
    if (!signedIn) return;
    const tokenEmail = emailFromStoredToken();
    if (!tokenEmail || tokenEmail === authEmail.trim()) return;
    setAuthEmail(tokenEmail);
    window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, tokenEmail);
  }, [authEmail, signedIn]);

  const dismissOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_STORAGE_KEY, 'true');
    setOnboardingDismissed(true);
  }, []);

  const handleSessionExpired = useCallback(async () => {
    let savedLocally = false;
    const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
    if (snapshot) {
      try {
        await saveWorkspaceSnapshot(snapshot, STARTER_WORKSPACE_STORAGE_KEY);
        savedLocally = true;
      } catch {
        savedLocally = false;
      }
    }
    clearDaptinSession();
    lastSavedSnapshotSignatureRef.current = null;
    preserveCameraOnNextLocalMountRef.current = true;
    setSignedIn(false);
    setActiveDocumentId('');
    setDocuments([]);
    setAuthOtp('');
    setAuthStep('email');
    setAccountOpen(true);
    setUtilityDrawerMode(null);
    setSyncStatus('error');
    setSyncMessage(savedLocally
      ? 'Session expired. Your workspace is saved on this device. Sign in again to save online.'
      : 'Session expired. Keep this tab open and sign in again to save online.');
  }, []);

  const recoverSessionError = useCallback(async (error: unknown): Promise<boolean> => {
    if (!isSessionError(error)) return false;
    await handleSessionExpired();
    return true;
  }, [handleSessionExpired]);

  const refreshDocuments = useCallback(async () => {
    if (!hasUsableStoredToken()) throw normalizeDaptinError(new Error('Session expired'), 'Session expired');
    const rows = await listDocuments();
    setDocuments(rows);
    return rows;
  }, []);

  const loadDaptinDocument = useCallback(async (documentRef: string, knownDocuments: CanasterDocumentSummary[] = []) => {
    if (!documentRef) return;
    setSyncStatus('loading');
    setSyncMessage('Opening workspace');
    try {
      const loadedDocument = await loadDocumentDetails(documentRef);
      const snapshot = loadedDocument.snapshot;
      const title = knownDocuments.find((document) => document.id === documentRef)?.title ?? loadedDocument.title ?? titleFromSnapshot(snapshot);
      await saveWorkspaceSnapshot(snapshot, remoteWorkspaceStorageKey(documentRef));
      lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      workspaceRef.current?.loadWorkspaceSnapshot(snapshot, 'Document loaded');
      window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
      setActiveDocumentId(documentRef);
      setDocumentTitle(title);
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
      if (await recoverSessionError(error)) return;
      setSyncStatus('error');
      setSyncMessage(workspaceErrorMessage(error, 'open'));
    }
  }, [recoverSessionError]);

  useEffect(() => {
    if (!signedIn) return;
    let canceled = false;
    setSyncStatus('loading');
    setSyncMessage('Checking saved workspaces');
    const restoredDocumentId = activeDocumentId || window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) || '';
    if (restoredDocumentId) {
      void loadDaptinDocument(restoredDocumentId);
      refreshDocuments()
        .then((rows) => {
          if (canceled) return;
          const restoredDocument = rows.find((document) => document.id === restoredDocumentId);
          if (restoredDocument) setDocumentTitle(restoredDocument.title);
        })
        .catch((error) => {
          if (canceled) return;
          void recoverSessionError(error).then((recovered) => {
            if (recovered || canceled) return;
            setSyncStatus('error');
            setSyncMessage(workspaceErrorMessage(error, 'refresh'));
          });
        });
      return () => {
        canceled = true;
      };
    }
    refreshDocuments()
      .then((rows) => {
        if (canceled) return;
        setSyncStatus('clean');
        setSyncMessage(ONLINE_READY_MESSAGE);
      })
      .catch((error) => {
        if (canceled) return;
        void recoverSessionError(error).then((recovered) => {
          if (recovered || canceled) return;
          setSyncStatus('error');
          setSyncMessage(workspaceErrorMessage(error, 'refresh'));
        });
      });
    return () => {
      canceled = true;
    };
  }, [signedIn]);

  const handleAuthEmailChange = useCallback((value: string) => {
    setAuthEmail(value);
    if (authStep === 'otp') {
      setAuthStep('email');
      setAuthOtp('');
    }
  }, [authStep]);

  const handleRequestEmailOtp = useCallback(async () => {
    const email = authEmail.trim().toLowerCase();
    if (!email) return;
    setSyncStatus('loading');
    setSyncMessage('Sending sign-in code');
    try {
      await requestEmailOtp({ email });
      window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, email);
      setAuthEmail(email);
      setAuthOtp('');
      setAuthStep('otp');
      setSyncStatus('clean');
      setSyncMessage('Check your email for the sign-in code.');
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(accountErrorMessage(error, 'send-code'));
    }
  }, [authEmail]);

  const handleVerifyEmailOtp = useCallback(async () => {
    const email = authEmail.trim().toLowerCase();
    const otp = authOtp.trim();
    if (!email || !otp) return;
    setSyncStatus('loading');
    setSyncMessage('Verifying sign-in code');
    try {
      await verifyEmailOtp({ email, otp });
      window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, email);
      setAuthEmail(email);
      setSignedIn(true);
      setAccountOpen(false);
      setAuthOtp('');
      setAuthStep('email');
      setSyncStatus('loading');
      setSyncMessage('Checking saved workspaces');
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(accountErrorMessage(error, 'verify-code'));
    }
  }, [authEmail, authOtp]);

  const handleSignOut = useCallback(async () => {
    const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
    if (snapshot) await saveWorkspaceSnapshot(snapshot, STARTER_WORKSPACE_STORAGE_KEY);
    try {
      await signOut();
    } catch {}
    clearDaptinSession();
    lastSavedSnapshotSignatureRef.current = null;
    preserveCameraOnNextLocalMountRef.current = true;
    setSignedIn(false);
    setActiveDocumentId('');
    setDocuments([]);
    setAuthOtp('');
    setAuthStep('email');
    setAccountOpen(false);
    setSyncStatus('anonymous');
    setSyncMessage(LOCAL_SAVE_MESSAGE);
  }, []);

  const handleNewLocalDraft = useCallback(async () => {
    const snapshot = createLocalDraftSnapshot();
    await saveWorkspaceSnapshot(snapshot, STARTER_WORKSPACE_STORAGE_KEY);
    window.localStorage.removeItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY);
    ignoreDirtyUntilRef.current = Date.now() + 700;
    lastSavedSnapshotSignatureRef.current = null;
    setActiveDocumentId('');
    setDocumentTitle(DEFAULT_DOCUMENT_TITLE);
    setSyncStatus(signedIn ? 'dirty' : 'anonymous');
    setSyncMessage(signedIn ? ONLINE_READY_MESSAGE : LOCAL_SAVE_MESSAGE);
    setUtilityDrawerMode(null);
    workspaceRef.current?.loadWorkspaceSnapshot(snapshot, 'New workspace');
  }, [signedIn]);

  const handleSaveOnline = useCallback(async () => {
    if (!signedIn) {
      setAuthStep('email');
      setAccountOpen(true);
      setUtilityDrawerMode(null);
      setSyncStatus('anonymous');
      setSyncMessage('Sign in to save online');
      return;
    }
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
      const freshSnapshot = workspaceRef.current?.getWorkspaceSnapshot() ?? snapshot;
      if (activeDocumentId) {
        await saveDocument(activeDocumentId, freshSnapshot, documentTitle);
        await saveWorkspaceSnapshot(freshSnapshot, remoteWorkspaceStorageKey(activeDocumentId));
      } else {
        const documentRef = await createDocument(documentTitle, freshSnapshot);
        await saveWorkspaceSnapshot(freshSnapshot, remoteWorkspaceStorageKey(documentRef));
        window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
        setActiveDocumentId(documentRef);
      }
      lastSavedSnapshotSignatureRef.current = snapshotSignature(freshSnapshot);
      await refreshDocuments();
      ignoreDirtyUntilRef.current = Date.now() + 1200;
      setSyncStatus('clean');
      setSyncMessage(SAVED_MESSAGE);
    } catch (error) {
      if (await recoverSessionError(error)) return;
      setSyncStatus('error');
      setSyncMessage(workspaceErrorMessage(error, 'save'));
    }
  }, [activeDocumentId, documentTitle, recoverSessionError, refreshDocuments, signedIn]);

  const handleRefreshDocuments = useCallback(async () => {
    if (!signedIn) {
      setAuthStep('email');
      setAccountOpen(true);
      setUtilityDrawerMode(null);
      setSyncStatus('anonymous');
      setSyncMessage('Sign in to see saved workspaces');
      return;
    }
    setSyncStatus('loading');
    setSyncMessage('Checking saved workspaces');
    try {
      await refreshDocuments();
      setSyncStatus('clean');
      setSyncMessage(activeDocumentId ? SAVED_MESSAGE : ONLINE_READY_MESSAGE);
    } catch (error) {
      if (await recoverSessionError(error)) return;
      setSyncStatus('error');
      setSyncMessage(workspaceErrorMessage(error, 'refresh'));
    }
  }, [activeDocumentId, recoverSessionError, refreshDocuments, signedIn]);

  const handleOpenDocumentsDrawer = useCallback(() => {
    const nextMode = utilityDrawerMode === 'documents' ? null : 'documents';
    if (nextMode) {
      setAccountOpen(false);
      dismissOnboarding();
    }
    setUtilityDrawerMode(nextMode);
  }, [dismissOnboarding, utilityDrawerMode]);

  const handleOpenNodePanel = useCallback(() => {
    const nextMode = utilityDrawerMode === 'work-items' ? null : 'work-items';
    if (nextMode) {
      setAccountOpen(false);
      dismissOnboarding();
    }
    setUtilityDrawerMode(nextMode);
  }, [dismissOnboarding, utilityDrawerMode]);

  const handleShowWorkItems = useCallback(() => {
    setUtilityDrawerMode('work-items');
    dismissOnboarding();
  }, [dismissOnboarding]);

  const navigation = useMemo(
    () => buildNestedNavigation(chromeState.collection, chromeState.status.selectedNodeId),
    [chromeState.collection, chromeState.status.selectedNodeId],
  );
  const zoomReadout = `${Math.round(chromeState.status.zoom * 100)}%`;
  const syncShortMessage = shortSyncMessage(syncStatus, syncMessage);
  const goToParentView = useCallback(() => {
    if (!navigation.parentCanvasId) return;
    executeDocumentCommand({ type: 'go-to-parent-canvas', source: 'nonvisual' });
  }, [executeDocumentCommand, navigation.parentCanvasId]);
  const openSelectedChildView = useCallback(() => {
    if (!navigation.selectedChildView) return;
    executeDocumentCommand({
      type: 'enter-child-canvas',
      parentCanvasId: navigation.activeCanvasId,
      portalNodeId: navigation.selectedChildView.portalNodeId,
      source: 'nonvisual',
    });
  }, [executeDocumentCommand, navigation.activeCanvasId, navigation.selectedChildView]);

  const showOnboarding = !activeDocumentId && !onboardingDismissed && utilityDrawerMode === null;

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Workspace map">
        <div className="topbar" aria-label="Workspace tools">
          <div className="brand">
            <span className="brand-mark" />
            <span>Canaster</span>
          </div>
          <form
            className="toolbar-group document-command-group"
            aria-label="Documents"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveOnline();
            }}
          >
            <input
              className="document-title-input"
              aria-label="Workspace name"
              name="document-title"
              value={documentTitle}
              onChange={(event) => setDocumentTitle(event.target.value)}
            />
            <IconButton label="New local workspace" onClick={() => void handleNewLocalDraft()}>
              <FilePlus2 size={17} />
            </IconButton>
            <IconButton label={documentsOpen ? 'Close saved workspaces' : 'Open saved workspaces'} pressed={documentsOpen} onClick={handleOpenDocumentsDrawer}>
              <FolderOpen size={17} />
            </IconButton>
            <button className="save-online-button" type="submit" disabled={syncStatus === 'loading' || syncStatus === 'saving'}>
              <Save size={16} />
              <span>Save online</span>
            </button>
            <span className={`sync-chip ${syncStatus}`} role="status" aria-live="polite" title={syncMessage}>
              <SyncStatusIcon status={syncStatus} />
              <span className="sync-chip-text">{syncMessage}</span>
              <span className="sync-chip-short">{syncShortMessage}</span>
            </span>
          </form>
          <div className="toolbar-group view-navigation-group" aria-label="View navigation">
            <IconButton label={navigation.parentTitle ? `Go up to ${navigation.parentTitle}` : 'Already at top view'} disabled={!navigation.parentCanvasId} onClick={goToParentView}>
              <ArrowUp size={17} />
            </IconButton>
            <div className="view-location" aria-label="Current view">
              <span className="view-title">{navigation.activeTitle}</span>
              <span className="view-depth">{navigation.depthLabel}</span>
            </div>
            <IconButton label={navigation.selectedChildView ? `Open ${navigation.selectedChildView.title}` : 'Select a view item to go down'} disabled={!navigation.selectedChildView} onClick={openSelectedChildView}>
              <ArrowDown size={17} />
            </IconButton>
          </div>
          <div className="toolbar-group" aria-label="History">
            <IconButton label="Undo" disabled={!chromeState.canUndo} onClick={() => workspaceRef.current?.undoWorkspace()}>
              <Undo2 size={17} />
            </IconButton>
            <IconButton label="Redo" disabled={!chromeState.canRedo} onClick={() => workspaceRef.current?.redoWorkspace()}>
              <Redo2 size={17} />
            </IconButton>
          </div>
          <div className="toolbar-group" aria-label="View controls">
            <IconButton label="Center map" onClick={() => workspaceRef.current?.fitActiveCanvas()}>
              <Maximize2 size={17} />
            </IconButton>
            <IconButton label="Reset map zoom" onClick={() => workspaceRef.current?.resetActiveZoom()}>
              <RotateCcw size={17} />
            </IconButton>
            <IconButton
              label={parentContextVisible ? 'Hide parent context panes' : 'Show parent context panes'}
              pressed={parentContextVisible}
              onClick={() => setParentContextVisible((visible) => !visible)}
            >
              <PanelsTopLeft size={17} />
            </IconButton>
            <IconButton label="Zoom out" onClick={() => workspaceRef.current?.zoomActiveBy(0.82)}>
              <Minus size={17} />
            </IconButton>
            <span className="zoom-readout" aria-label={`Zoom ${zoomReadout}`}>{zoomReadout}</span>
            <IconButton label="Zoom in" onClick={() => workspaceRef.current?.zoomActiveBy(1.22)}>
              <Plus size={17} />
            </IconButton>
          </div>
          <div className="toolbar-group" aria-label="Panels">
            <IconButton
              label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
            <IconButton label={workItemsOpen ? 'Close work items' : 'Open work items'} pressed={workItemsOpen} onClick={handleOpenNodePanel}>
              <ListTree size={17} />
            </IconButton>
          </div>
          <div className="toolbar-group account-command-group" aria-label="Account">
            <IconButton
              label={signedIn ? 'Open account' : 'Sign in'}
              pressed={accountOpen}
              onClick={() => {
                const nextOpen = !accountOpen;
                if (nextOpen) {
                  setUtilityDrawerMode(null);
                  dismissOnboarding();
                }
                setAccountOpen(nextOpen);
              }}
            >
              {signedIn ? <UserCircle size={17} /> : <LogIn size={17} />}
            </IconButton>
          </div>
        </div>
        {accountOpen ? (
          <AccountPopover
            authEmail={authEmail}
            authOtp={authOtp}
            authStep={authStep}
            signedIn={signedIn}
            syncMessage={syncMessage}
            syncStatus={syncStatus}
            onAuthStepChange={setAuthStep}
            onClose={() => setAccountOpen(false)}
            onEmailChange={handleAuthEmailChange}
            onOtpChange={setAuthOtp}
            onRequestEmailOtp={() => void handleRequestEmailOtp()}
            onSignOut={() => void handleSignOut()}
            onVerifyEmailOtp={() => void handleVerifyEmailOtp()}
          />
        ) : null}

        <NestedCanvasWorkspace
          ref={workspaceRef}
          initialCollection={initialCollection}
          theme={theme}
          parentContextVisible={parentContextVisible}
          fitOnFirstLoad={fitWorkspaceOnFirstLoad}
          storageKey={workspaceStorageKey}
          onCollectionChange={handleWorkspaceCollectionChange}
          onChromeStateChange={handleChromeStateChange}
        />
        <ViewNavigator navigation={navigation} executeDocumentCommand={executeDocumentCommand} />
        {showOnboarding ? (
          <FirstRunGuide
            onDismiss={dismissOnboarding}
            onFitSample={() => workspaceRef.current?.fitActiveCanvas()}
            onShowWorkItems={handleShowWorkItems}
          />
        ) : null}
        {documentsOpen ? (
          <DocumentsDrawer
            activeDocumentId={activeDocumentId}
            documents={documents}
            signedIn={signedIn}
            syncStatus={syncStatus}
            onClose={() => setUtilityDrawerMode(null)}
            onNew={() => void handleNewLocalDraft()}
            onOpenAccount={() => {
              setAuthStep('email');
              setAccountOpen(true);
              setUtilityDrawerMode(null);
            }}
            onOpenDocument={(documentRef) => void loadDaptinDocument(documentRef, documents)}
            onRefresh={() => void handleRefreshDocuments()}
            onSaveOnline={() => void handleSaveOnline()}
          />
        ) : null}
        {workItemsOpen ? (
          <NodeAccessPanel
            collection={chromeState.collection}
            status={chromeState.status}
            executeActiveCanvasCommand={executeActiveCanvasCommand}
            executeDocumentCommand={executeDocumentCommand}
          />
        ) : null}
      </section>
    </main>
  );
}

type NestedNavigation = {
  activeCanvasId: CanvasDocumentId;
  activeTitle: string;
  depthLabel: string;
  parentCanvasId: CanvasDocumentId | null;
  parentTitle: string | null;
  selectedChildView: ChildViewTarget | null;
  childViews: ChildViewTarget[];
  parentSiblings: SiblingViewTarget[];
  trail: ViewTrailItem[];
  siblings: Partial<Record<ParentContextRegion, SiblingViewTarget>>;
};

type ViewTrailItem = {
  canvasId: CanvasDocumentId;
  title: string;
  depth: number;
  active: boolean;
};

type ChildViewTarget = {
  portalNodeId: string;
  canvasId: CanvasDocumentId;
  title: string;
};

type SiblingViewTarget = {
  region: ParentContextRegion;
  parentCanvasId: CanvasDocumentId;
  portalNodeId: string;
  title: string;
  canOpen: boolean;
  distance: number;
};

type GraphPoint = {
  x: number;
  y: number;
};

type NavigatorLabelPlacement = 'above' | 'below';

type NavigatorGraphNode = GraphPoint & {
  id: string;
  title: string;
  kind: 'ancestor' | 'current' | 'parent-sibling' | 'sibling' | 'child';
  labelPlacement: NavigatorLabelPlacement;
  active?: boolean;
  command?: DocumentCommand;
};

type NavigatorGraphLink = {
  id: string;
  path: string;
  kind: 'lineage' | 'branch';
};

type NavigatorGraph = {
  nodes: NavigatorGraphNode[];
  links: NavigatorGraphLink[];
};

function ViewNavigator({
  navigation,
  executeDocumentCommand,
}: {
  navigation: NestedNavigation;
  executeDocumentCommand: (command: DocumentCommand) => void;
}) {
  const graph = buildNavigatorGraph(navigation);
  return (
    <aside className="view-navigator" aria-label="Bird's-eye view map">
      <svg className="navigator-links" viewBox={`0 0 ${NAVIGATOR_VIEWBOX.width} ${NAVIGATOR_VIEWBOX.height}`} aria-hidden="true">
        <defs>
          <marker id="navigator-arrow" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto">
            <path className="navigator-arrow" d="M0 0 L4.6 2.5 L0 5 Z" />
          </marker>
        </defs>
        {graph.links.map((link) => (
          <path
            key={link.id}
            className={`navigator-link ${link.kind}`}
            d={link.path}
          />
        ))}
      </svg>
      {graph.nodes.map((node) => (
        <button
          key={node.id}
          className={`navigator-node ${node.kind} label-${node.labelPlacement}${node.active ? ' current' : ''}`}
          type="button"
          style={{ left: node.x, top: node.y }}
          aria-current={node.active ? 'page' : undefined}
          aria-label={node.active ? `Current view: ${node.title}` : `Go to ${node.title}`}
          disabled={!node.command}
          onClick={() => {
            if (node.command) executeDocumentCommand(node.command);
          }}
        >
          <span className="navigator-dot" />
          <span className="navigator-label">{node.title}</span>
        </button>
      ))}
    </aside>
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
        <li>Your changes stay on this device.</li>
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

type DocumentsDrawerProps = {
  activeDocumentId: string;
  documents: CanasterDocumentSummary[];
  signedIn: boolean;
  syncStatus: SyncStatus;
  onClose: () => void;
  onNew: () => void;
  onOpenAccount: () => void;
  onOpenDocument: (documentRef: string) => void;
  onRefresh: () => void;
  onSaveOnline: () => void;
};

function DocumentsDrawer({
  activeDocumentId,
  documents,
  signedIn,
  syncStatus,
  onClose,
  onNew,
  onOpenAccount,
  onOpenDocument,
  onRefresh,
  onSaveOnline,
}: DocumentsDrawerProps) {
  return (
    <aside className="node-access-panel utility-drawer document-drawer" aria-label="Saved workspaces">
      <div className="utility-drawer-header">
        <div>
          <span>Documents</span>
          <span>{signedIn ? `${documents.length} saved` : 'Local only'}</span>
        </div>
        <button className="utility-close" type="button" aria-label="Close documents" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="utility-drawer-actions" aria-label="Document commands">
        <button className="drawer-action" type="button" onClick={onNew}>
          <FilePlus2 size={15} />
          New
        </button>
        <button className="drawer-action primary" type="button" disabled={syncStatus === 'loading' || syncStatus === 'saving'} onClick={onSaveOnline}>
          <Save size={15} />
          Save online
        </button>
        <button className="drawer-action" type="button" disabled={!signedIn || syncStatus === 'loading'} onClick={onRefresh}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      {signedIn ? (
        documents.length ? (
          <ul className="document-list" aria-label="Saved workspaces">
            {documents.map((document) => {
              const active = document.id === activeDocumentId;
              return (
                <li key={document.id} className="document-row">
                  <button
                    className="document-row-button"
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onOpenDocument(document.id)}
                  >
                    <span className="document-row-title">
                      {active ? <CheckCircle2 size={14} /> : <span className="document-row-dot" />}
                      <span>{document.title}</span>
                    </span>
                    <span>{formatDocumentDate(document.updatedAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="drawer-empty">
            <p>No online workspaces yet.</p>
            <button className="drawer-action primary" type="button" onClick={onSaveOnline}>
              <Save size={15} />
              Save this workspace
            </button>
          </div>
        )
      ) : (
        <div className="drawer-empty">
          <p>Sign in to save and open workspaces from other devices.</p>
          <button className="drawer-action primary" type="button" onClick={onOpenAccount}>
            <LogIn size={15} />
            Sign in
          </button>
        </div>
      )}
    </aside>
  );
}

type AccountPopoverProps = {
  authEmail: string;
  authOtp: string;
  authStep: AuthStep;
  signedIn: boolean;
  syncMessage: string;
  syncStatus: SyncStatus;
  onAuthStepChange: (step: AuthStep) => void;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onRequestEmailOtp: () => void;
  onSignOut: () => void;
  onVerifyEmailOtp: () => void;
};

function AccountPopover({
  authEmail,
  authOtp,
  authStep,
  signedIn,
  syncMessage,
  syncStatus,
  onAuthStepChange,
  onClose,
  onEmailChange,
  onOtpChange,
  onRequestEmailOtp,
  onSignOut,
  onVerifyEmailOtp,
}: AccountPopoverProps) {
  const busy = syncStatus === 'loading' || syncStatus === 'saving';
  const submitDisabled = busy || !authEmail.trim() || (authStep === 'otp' && !authOtp.trim());
  return (
    <aside className="account-popover" aria-label="Account">
      <div className="account-popover-header">
        <div>
          <span>Account</span>
          <span>{signedIn ? 'Signed in' : authStep === 'otp' ? 'Enter code' : 'Email sign in'}</span>
        </div>
        <button className="utility-close" type="button" aria-label="Close account" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {signedIn ? (
        <div className="account-signed-in">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">
              <UserCircle size={18} />
            </span>
            <div>
              <span>Canaster account</span>
              <span>{authEmail || 'Signed in on this browser'}</span>
            </div>
          </div>
          <button className="drawer-action" type="button" onClick={onSignOut}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      ) : (
        <form
          className="account-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (authStep === 'otp') onVerifyEmailOtp();
            else onRequestEmailOtp();
          }}
        >
          <div className="account-auth-copy">
            <span>{authStep === 'otp' ? 'Check your email' : 'Save workspaces online'}</span>
            <p>{authStep === 'otp' ? `Enter the code sent to ${authEmail.trim()}.` : 'Canaster sends a short code and creates the account if needed.'}</p>
          </div>
          <label className="account-field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" value={authEmail} onChange={(event) => onEmailChange(event.target.value)} />
          </label>
          {authStep === 'otp' ? (
            <label className="account-field">
              <span>Code</span>
              <input
                name="one-time-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={4}
                value={authOtp}
                onChange={(event) => onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </label>
          ) : null}
          <button className="account-submit" type="submit" disabled={submitDisabled}>
            {authStep === 'otp' ? <CheckCircle2 size={15} /> : <LogIn size={15} />}
            {authStep === 'otp' ? 'Verify code' : 'Send code'}
          </button>
          {authStep === 'otp' ? (
            <button className="account-text-action" type="button" onClick={() => onAuthStepChange('email')}>
              Use a different email
            </button>
          ) : null}
        </form>
      )}
      <div className={`account-status ${syncStatus}`} role="status" aria-live="polite">
        <SyncStatusIcon status={syncStatus} />
        <span>{syncMessage}</span>
      </div>
    </aside>
  );
}

function SyncStatusIcon({ status }: { status: SyncStatus }) {
  if (status === 'loading' || status === 'saving') return <Loader2 size={13} />;
  if (status === 'clean') return <CheckCircle2 size={13} />;
  return <span className="sync-dot" aria-hidden="true" />;
}

function shortSyncMessage(status: SyncStatus, message: string) {
  if (status === 'saving') return 'Saving';
  if (status === 'loading') return 'Checking';
  if (status === 'error') return 'Error';
  if (status === 'clean') return message === ONLINE_READY_MESSAGE ? 'Ready' : 'Saved';
  if (status === 'dirty') return 'Unsaved';
  return 'Local';
}

type IconButtonProps = {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function IconButton({ label, disabled = false, pressed, onClick, children }: IconButtonProps) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function buildNestedNavigation(collection: CanvasDocumentCollection, selectedNodeId: string | null): NestedNavigation {
  const active = collection.documents[collection.activeCanvasId] ?? collection.documents[collection.rootCanvasId];
  const trail = stackTrailFor(collection, active.id);
  const selectedNode = selectedNodeId ? active.model.nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const selectedChildView = selectedNode ? childViewTargetFor(collection, selectedNode) : null;
  const childViews = active.model.nodes
    .map((node) => childViewTargetFor(collection, node))
    .filter((target): target is ChildViewTarget => Boolean(target));
  const parent = active.parentCanvasId ? collection.documents[active.parentCanvasId] ?? null : null;
  const parentSiblingMap = parent ? siblingTargetsFor(collection, parent.id) : {};
  const parentSiblings = PARENT_CONTEXT_REGIONS
    .map((region) => parentSiblingMap[region])
    .filter((target): target is SiblingViewTarget => Boolean(target?.canOpen));
  return {
    activeCanvasId: active.id,
    activeTitle: active.title,
    depthLabel: trail.length > 1 ? `Level ${trail.length}` : 'Top view',
    parentCanvasId: parent?.id ?? null,
    parentTitle: parent?.title ?? null,
    selectedChildView,
    childViews,
    parentSiblings,
    trail,
    siblings: siblingTargetsFor(collection, active.id),
  };
}

function buildNavigatorGraph(navigation: NestedNavigation): NavigatorGraph {
  const nodes: NavigatorGraphNode[] = [];
  const links: NavigatorGraphLink[] = [];
  const ancestors = navigation.trail.filter((item) => !item.active).slice(-2);
  const ancestorStartX = ancestors.length > 1 ? 22 : 58;
  let previousAncestor: NavigatorGraphNode | null = null;
  const ancestorNodes: NavigatorGraphNode[] = [];

  ancestors.forEach((item, index) => {
    const point = {
      x: ancestorStartX + index * 64,
      y: NAVIGATOR_MID_Y,
    };
    const node: NavigatorGraphNode = {
      ...point,
      id: `trail-${item.canvasId}`,
      title: item.depth === 0 ? 'Top' : item.title,
      kind: 'ancestor',
      labelPlacement: 'below',
      command: { type: 'select-canvas', canvasId: item.canvasId, source: 'nonvisual' },
    };
    nodes.push(node);
    ancestorNodes.push(node);
    if (previousAncestor) links.push({ id: `trail-link-${item.canvasId}`, path: orthogonalPath(previousAncestor, node), kind: 'lineage' });
    previousAncestor = node;
  });

  const grandparentNode = ancestorNodes.length > 1 ? ancestorNodes[ancestorNodes.length - 2] : null;
  const parentNode = ancestorNodes.length ? ancestorNodes[ancestorNodes.length - 1] : null;
  const parentSiblingRows = parentSiblingRowsFor(navigation.parentSiblings.length);
  navigation.parentSiblings.slice(0, 3).forEach((sibling, index) => {
    if (!grandparentNode || !parentNode) return;
    const node: NavigatorGraphNode = {
      x: parentNode.x,
      y: parentSiblingRows[index] ?? NAVIGATOR_MID_Y + 52,
      id: `parent-sibling-${sibling.portalNodeId}`,
      title: sibling.title,
      kind: 'parent-sibling',
      labelPlacement: labelPlacementForRow(parentSiblingRows[index] ?? NAVIGATOR_MID_Y + 52),
      command: {
        type: 'activate-neighbor-portal',
        parentCanvasId: sibling.parentCanvasId,
        portalNodeId: sibling.portalNodeId,
        source: 'nonvisual',
      },
    };
    nodes.push(node);
    links.push({ id: `parent-sibling-link-${sibling.portalNodeId}`, path: orthogonalPath(grandparentNode, node), kind: 'branch' });
  });

  const currentNode: NavigatorGraphNode = {
    ...CURRENT_GRAPH_POINT,
    id: `current-${navigation.activeCanvasId}`,
    title: navigation.activeTitle,
    kind: 'current',
    labelPlacement: 'above',
    active: true,
  };
  nodes.push(currentNode);
  if (previousAncestor) {
    links.push({ id: `trail-current-${navigation.activeCanvasId}`, path: orthogonalPath(previousAncestor, currentNode), kind: 'lineage' });
  }

  const siblings = PARENT_CONTEXT_REGIONS
    .map((region) => navigation.siblings[region])
    .filter((target): target is SiblingViewTarget => Boolean(target?.canOpen));
  const childTargets: NavigatorGraphNode[] = navigation.childViews.map((child) => ({
      x: NEXT_GRAPH_X,
      y: NAVIGATOR_MID_Y,
      id: `child-${child.canvasId}`,
      title: child.title,
      kind: 'child' as const,
      labelPlacement: 'below' as const,
      command: {
        type: 'enter-child-canvas' as const,
        parentCanvasId: navigation.activeCanvasId,
        portalNodeId: child.portalNodeId,
        source: 'nonvisual' as const,
      },
    }));
  const siblingTargets: NavigatorGraphNode[] = siblings.slice(0, Math.max(0, 7 - childTargets.length)).map((sibling) => ({
      x: NEXT_GRAPH_X,
      y: NAVIGATOR_MID_Y,
      id: `sibling-${sibling.portalNodeId}`,
      title: sibling.title,
      kind: 'sibling' as const,
      labelPlacement: 'below' as const,
      command: {
        type: 'activate-neighbor-portal' as const,
        parentCanvasId: sibling.parentCanvasId,
        portalNodeId: sibling.portalNodeId,
        source: 'nonvisual' as const,
      },
    }));
  const nextTargets = [...childTargets, ...siblingTargets];
  const nextRows = graphRows(nextTargets.length);
  nextTargets.forEach((node, index) => {
    node.y = nextRows[index] ?? NAVIGATOR_MID_Y;
    node.labelPlacement = labelPlacementForRow(node.y);
    nodes.push(node);
    links.push({ id: `next-link-${node.id}`, path: orthogonalPath(currentNode, node, NEXT_GRAPH_ELBOW_X), kind: 'branch' });
  });

  return { nodes, links };
}

function graphRows(count: number): number[] {
  if (count <= 1) return [NAVIGATOR_MID_Y];
  const step = Math.min(28, 116 / (count - 1));
  const start = NAVIGATOR_MID_Y - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, index) => Math.round(start + index * step));
}

function parentSiblingRowsFor(count: number): number[] {
  if (count <= 1) return [NAVIGATOR_MID_Y - 28];
  if (count === 2) return [NAVIGATOR_MID_Y - 28, NAVIGATOR_MID_Y + 28];
  return [NAVIGATOR_MID_Y - 42, NAVIGATOR_MID_Y + 28, NAVIGATOR_MID_Y + 52];
}

function labelPlacementForRow(y: number): NavigatorLabelPlacement {
  return y < NAVIGATOR_MID_Y ? 'above' : 'below';
}

function orthogonalPath(from: GraphPoint, to: GraphPoint, elbowX?: number): string {
  if (from.y === to.y) return `M ${from.x} ${from.y} H ${to.x}`;
  const midX = elbowX ?? Math.round((from.x + to.x) / 2);
  return `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`;
}

function stackTrailFor(collection: CanvasDocumentCollection, activeCanvasId: CanvasDocumentId): ViewTrailItem[] {
  const frames = collection.view.stackPath.length ? collection.view.stackPath : fallbackStackPathFor(collection, activeCanvasId);
  return frames
    .map((frame) => {
      const document = collection.documents[frame.canvasId];
      if (!document) return null;
      return {
        canvasId: document.id,
        title: document.title,
        depth: frame.depth,
        active: document.id === activeCanvasId,
      };
    })
    .filter((item): item is ViewTrailItem => Boolean(item));
}

function fallbackStackPathFor(collection: CanvasDocumentCollection, activeCanvasId: CanvasDocumentId): StackFrame[] {
  const frames: StackFrame[] = [];
  let currentId: CanvasDocumentId | null = activeCanvasId;
  while (currentId) {
    const current: CanvasDocument = collection.documents[currentId];
    frames.unshift({
      canvasId: current.id,
      parentCanvasId: current.parentCanvasId,
      parentNodeId: current.parentNodeId,
      depth: 0,
    });
    currentId = current.parentCanvasId;
  }
  return frames.map((frame, depth) => ({ ...frame, depth }));
}

function childViewTargetFor(collection: CanvasDocumentCollection, node: CanvasNode): ChildViewTarget | null {
  const data = portalDataForNode(node);
  if (!data?.childCanvasId || !collection.documents[data.childCanvasId]) return null;
  return {
    portalNodeId: node.id,
    canvasId: data.childCanvasId,
    title: collection.documents[data.childCanvasId].title || data.title || describeNode(node).label,
  };
}

function siblingTargetsFor(collection: CanvasDocumentCollection, activeCanvasId: CanvasDocumentId): Partial<Record<ParentContextRegion, SiblingViewTarget>> {
  const active = collection.documents[activeCanvasId];
  const parent = active?.parentCanvasId ? collection.documents[active.parentCanvasId] : null;
  const source = parent && active?.parentNodeId ? parent.model.nodes.find((node) => node.id === active.parentNodeId) : null;
  if (!parent || !source) return {};

  const sourceCenter = nodeCenter(source);
  const siblings: Partial<Record<ParentContextRegion, SiblingViewTarget>> = {};
  for (const node of parent.model.nodes) {
    if (node.id === source.id) continue;
    const center = nodeCenter(node);
    const distance = Math.hypot(center.x - sourceCenter.x, center.y - sourceCenter.y);
    const region = regionForContextVector(center.x - sourceCenter.x, center.y - sourceCenter.y);
    const data = portalDataForNode(node);
    const childDocument = data?.childCanvasId ? collection.documents[data.childCanvasId] : null;
    const target: SiblingViewTarget = {
      region,
      parentCanvasId: parent.id,
      portalNodeId: node.id,
      title: childDocument?.title ?? data?.title ?? describeNode(node).label,
      canOpen: Boolean(childDocument),
      distance,
    };
    if (!siblings[region] || target.distance < siblings[region].distance) siblings[region] = target;
  }
  return PARENT_CONTEXT_REGIONS.reduce<Partial<Record<ParentContextRegion, SiblingViewTarget>>>((next, region) => {
    if (siblings[region]) next[region] = siblings[region];
    return next;
  }, {});
}

function nodeCenter(node: CanvasNode) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function remoteWorkspaceStorageKey(documentRef: string): string {
  return `daptin:${documentRef}`;
}

function createLocalDraftSnapshot(): CanvasWorkspaceSnapshot {
  return createWorkspaceSnapshot(createWorkspaceHistory(defaultStarterCollection()), null);
}

function titleFromSnapshot(snapshot: CanvasWorkspaceSnapshot): string {
  const collection = snapshot.history.present;
  return collection.documents[collection.rootCanvasId]?.title || DEFAULT_DOCUMENT_TITLE;
}

function workspaceErrorMessage(error: unknown, action: 'open' | 'refresh' | 'save'): string {
  const apiError = normalizeDaptinError(error, '');
  if (apiError.kind === 'session') return 'Session expired. Your workspace is saved on this device. Sign in again to save online.';
  if (apiError.kind === 'network') return 'Could not reach saved workspaces. Check your connection and try again.';
  if (apiError.kind === 'permission') return action === 'save'
    ? 'Could not save this workspace because this account no longer has access. Keep working locally or sign in again.'
    : 'This account cannot open that workspace. Choose another workspace or sign in again.';
  if (apiError.kind === 'not-found') return 'That saved workspace was not found. Refresh saved workspaces or keep working locally.';
  if (apiError.kind === 'server') return action === 'save'
    ? 'Saved workspaces are unavailable right now. Your workspace is still here; try Save online again.'
    : 'Saved workspaces are unavailable right now. Keep working locally and try again.';
  if (apiError.kind === 'invalid-response') return action === 'open'
    ? 'That saved workspace could not be read. The current workspace was left unchanged.'
    : 'Saved workspace data looked wrong. Keep working locally and try again.';
  if (action === 'open') return 'Could not open this workspace. Refresh saved workspaces or choose another one.';
  if (action === 'refresh') return 'Could not refresh saved workspaces. Check your connection and try again.';
  return 'Could not save this workspace. Check your connection and try again.';
}

function accountErrorMessage(error: unknown, action: 'send-code' | 'verify-code'): string {
  const apiError = normalizeDaptinError(error, '');
  if (apiError.kind === 'network') return 'Could not reach accounts. Check your connection and try again.';
  if (apiError.kind === 'server' && action === 'send-code') return 'Accounts are unavailable right now. Try sending the code again.';
  if (action === 'send-code') return 'Could not send a sign-in code. Check the email and try again.';
  return 'Could not verify that code. Check the code and try again.';
}

function emailFromStoredToken(): string {
  return tokenEmail();
}

function snapshotSignature(snapshot: unknown): string {
  return JSON.stringify(snapshot);
}

function formatDocumentDate(updatedAt: string | null): string {
  if (!updatedAt) return 'Saved workspace';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return 'Saved workspace';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
