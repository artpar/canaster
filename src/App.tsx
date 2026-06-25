import {
  CheckCircle2,
  ChevronDown,
  Columns3,
  FilePlus2,
  LayoutGrid,
  LayoutList,
  Loader2,
  LogIn,
  LogOut,
  Maximize2,
  Minus,
  Moon,
  PanelLeftOpen,
  PanelsTopLeft,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Rows3,
  Save,
  Sun,
  Undo2,
  UserCircle,
  X,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
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
import { loadAssetObject } from './backend/assets';
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
  initialViewportStatus,
  type NestedCanvasWorkspaceChromeState,
  type NestedCanvasWorkspaceHandle,
} from './engine/nested/NestedCanvasWorkspace';
import { describeNode, parseNodeData } from './engine/nodeTypes/registry';
import { cacheAssetImage, hasCachedAssetImage } from './engine/nodeTypes/imageAssets';
import { BuiltInNodeTypes, type CanvasArrangeLayout, type CanvasNode, type ThemeName } from './engine/types';
import type { CanvasDocumentCollection, CanvasDocumentId, CanvasWorkspaceSnapshot, DocumentCommand } from './engine/documentTypes';
import { saveWorkspaceSnapshot } from './engine/workspaceStorage';
import { createWorkspaceHistory, createWorkspaceSnapshot } from './engine/workspaceHistory';
import { readWorkspaceUrlState, replaceWorkspaceUrlState, type WorkspaceUrlState } from './engine/workspaceUrlLocation';

const ONBOARDING_DISMISSED_STORAGE_KEY = 'canaster:onboarding-dismissed:v1';
const DEFAULT_DOCUMENT_TITLE = 'Canaster Workspace';
const LOCAL_SAVE_MESSAGE = 'Saved on this device';
const ONLINE_READY_MESSAGE = 'Ready to save online';
const SAVED_MESSAGE = 'Saved online';
const ARRANGE_MENU_WIDTH = 208;
const ADD_PANEL_MENU_WIDTH = 224;
const PANEL_CREATE_OPTIONS = [
  { type: BuiltInNodeTypes.card, label: 'Work item', detail: 'Title, detail, and work accent', badge: 'WORK' },
  { type: BuiltInNodeTypes.text, label: 'Note', detail: 'Plain text for local context', badge: 'NOTE' },
  { type: BuiltInNodeTypes.image, label: 'Image', detail: 'Visual reference with alt text', badge: 'IMAGE' },
  { type: BuiltInNodeTypes.canvas, label: 'View', detail: 'A child canvas portal', badge: 'VIEW' },
  { type: BuiltInNodeTypes.check, label: 'Checklist', detail: 'Actionable list with done count', badge: 'LIST' },
] as const;

type AuthStep = 'email' | 'otp';
type SyncStatus = 'anonymous' | 'loading' | 'clean' | 'dirty' | 'saving' | 'error';
type ArrangeMenuPosition = { top: number; left: number };
type WorkspaceToast = { id: number; message: string; actionLabel: string; action: () => void } | null;

export function App() {
  const workspaceRef = useRef<NestedCanvasWorkspaceHandle | null>(null);
  const arrangeButtonRef = useRef<HTMLButtonElement | null>(null);
  const arrangeMenuRef = useRef<HTMLDivElement | null>(null);
  const addPanelButtonRef = useRef<HTMLButtonElement | null>(null);
  const addPanelMenuRef = useRef<HTMLDivElement | null>(null);
  const addPanelSearchRef = useRef<HTMLInputElement | null>(null);
  const ignoreDirtyUntilRef = useRef(0);
  const lastSavedSnapshotSignatureRef = useRef<string | null>(null);
  const preserveCameraOnNextLocalMountRef = useRef(false);
  const initialStoredSessionRef = useRef<boolean | null>(null);
  if (initialStoredSessionRef.current === null) initialStoredSessionRef.current = hasUsableStoredToken();
  const hasInitialStoredSession = initialStoredSessionRef.current === true;
  const initialUrlStateRef = useRef<WorkspaceUrlState | null>(null);
  if (initialUrlStateRef.current === null) initialUrlStateRef.current = readWorkspaceUrlState();
  const pendingUrlStateRef = useRef<WorkspaceUrlState | null>(
    initialUrlStateRef.current,
  );
  const urlStateReadyRef = useRef(!pendingUrlStateRef.current);
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [accountOpen, setAccountOpen] = useState(false);
  const [arrangeMenuOpen, setArrangeMenuOpen] = useState(false);
  const [arrangeMenuPosition, setArrangeMenuPosition] = useState<ArrangeMenuPosition | null>(null);
  const [addPanelMenuOpen, setAddPanelMenuOpen] = useState(false);
  const [addPanelMenuPosition, setAddPanelMenuPosition] = useState<ArrangeMenuPosition | null>(null);
  const [addPanelQuery, setAddPanelQuery] = useState('');
  const [addPanelActiveIndex, setAddPanelActiveIndex] = useState(0);
  const [viewTreeOpen, setViewTreeOpen] = useState(() => window.matchMedia('(min-width: 641px)').matches);
  const [workspaceToast, setWorkspaceToast] = useState<WorkspaceToast>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [parentContextVisible, setParentContextVisible] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => window.localStorage.getItem(ONBOARDING_DISMISSED_STORAGE_KEY) === 'true');
  const [authEmail, setAuthEmail] = useState(() => emailFromStoredToken() || window.localStorage.getItem(DAPTIN_LAST_EMAIL_STORAGE_KEY) || '');
  const [authOtp, setAuthOtp] = useState('');
  const [signedIn, setSignedIn] = useState(() => hasInitialStoredSession);
  const [documents, setDocuments] = useState<CanasterDocumentSummary[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState(() => initialUrlStateRef.current?.documentId ?? window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) ?? '');
  const [documentTitle, setDocumentTitle] = useState(DEFAULT_DOCUMENT_TITLE);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (hasInitialStoredSession ? 'loading' : 'anonymous'));
  const [syncMessage, setSyncMessage] = useState(() => (hasInitialStoredSession ? 'Checking saved workspaces' : LOCAL_SAVE_MESSAGE));
  const initialCollection = useMemo(() => defaultStarterCollection(), []);
  const workspaceStorageKey = activeDocumentId ? remoteWorkspaceStorageKey(activeDocumentId) : STARTER_WORKSPACE_STORAGE_KEY;
  const fitWorkspaceOnFirstLoad = !activeDocumentId && !preserveCameraOnNextLocalMountRef.current;
  const [chromeState, setChromeState] = useState<NestedCanvasWorkspaceChromeState>(() => ({
    collection: initialCollection,
    status: initialViewportStatus,
    lastModelChange: null,
    lastCanvasModelChange: null,
    lastCanvasModelChangeId: 0,
    canUndo: false,
    canRedo: false,
    storageReady: false,
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

  const executeDocumentCommand = useCallback((command: DocumentCommand) => {
    workspaceRef.current?.executeDocumentCommand(command);
  }, []);

  const applyPendingUrlState = useCallback((documentRef: string | null) => {
    const pending = pendingUrlStateRef.current;
    if (!pending) {
      urlStateReadyRef.current = true;
      return false;
    }
    if (pending.documentId !== documentRef) return false;
    pendingUrlStateRef.current = null;
    urlStateReadyRef.current = true;
    return workspaceRef.current?.openWorkspaceUrlState(pending) ?? false;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!activeDocumentId && preserveCameraOnNextLocalMountRef.current) {
      preserveCameraOnNextLocalMountRef.current = false;
    }
  }, [activeDocumentId, workspaceStorageKey]);

  useEffect(() => {
    const pending = pendingUrlStateRef.current;
    if (!pending?.documentId || signedIn) return;
    setAuthStep('email');
    setAccountOpen(true);
    setSyncStatus('anonymous');
    setSyncMessage('Sign in to open shared workspace');
  }, [signedIn]);

  useEffect(() => {
    const pending = pendingUrlStateRef.current;
    if (!pending || pending.documentId || !chromeState.storageReady) return;
    applyPendingUrlState(null);
  }, [applyPendingUrlState, chromeState.collection, chromeState.storageReady]);

  useEffect(() => {
    if (!urlStateReadyRef.current || pendingUrlStateRef.current || !chromeState.storageReady) return;
    const updateUrl = window.setTimeout(() => {
      const state = workspaceRef.current?.currentWorkspaceUrlState(activeDocumentId || null);
      if (!state) return;
      replaceWorkspaceUrlState(state);
    }, 200);
    return () => window.clearTimeout(updateUrl);
  }, [
    activeDocumentId,
    chromeState,
  ]);

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
      applyPendingUrlState(documentRef);
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
  }, [applyPendingUrlState, recoverSessionError]);

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

  useEffect(() => {
    if (!signedIn || !hasUsableStoredToken()) return;
    const assetIds = imageAssetIdsInCollection(chromeState.collection).filter((assetId) => !hasCachedAssetImage(assetId));
    if (!assetIds.length) return;
    let canceled = false;
    for (const assetId of assetIds) {
      void loadAssetObject(assetId)
        .then((asset) => cacheAssetImage(asset.id, asset.objectUrl))
        .then(() => {
          if (!canceled) workspaceRef.current?.refreshActiveCanvas();
        })
        .catch(() => undefined);
    }
    return () => {
      canceled = true;
    };
  }, [chromeState.collection, signedIn]);

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
    workspaceRef.current?.loadWorkspaceSnapshot(snapshot, 'New workspace');
  }, [signedIn]);

  const handleSaveOnline = useCallback(async () => {
    if (!signedIn) {
      setAuthStep('email');
      setAccountOpen(true);
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

  const updateArrangeMenuPosition = useCallback(() => {
    const button = arrangeButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const margin = 12;
    const left = Math.max(margin, Math.min(window.innerWidth - ARRANGE_MENU_WIDTH - margin, rect.right - ARRANGE_MENU_WIDTH));
    const top = Math.max(margin, Math.min(window.innerHeight - 220, rect.bottom + 8));
    setArrangeMenuPosition({ left, top });
  }, []);

  const updateAddPanelMenuPosition = useCallback(() => {
    const button = addPanelButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const margin = 12;
    const left = Math.max(margin, Math.min(window.innerWidth - ADD_PANEL_MENU_WIDTH - margin, rect.right - ADD_PANEL_MENU_WIDTH));
    const top = Math.max(margin, Math.min(window.innerHeight - 280, rect.bottom + 8));
    setAddPanelMenuPosition({ left, top });
  }, []);

  const handleToggleArrangeMenu = useCallback(() => {
    setArrangeMenuOpen((open) => {
      if (!open) updateArrangeMenuPosition();
      if (!open) {
        setAddPanelMenuOpen(false);
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
      }
      return !open;
    });
  }, [updateArrangeMenuPosition]);

  const closeAddPanelMenu = useCallback(() => {
    setAddPanelMenuOpen(false);
    setAddPanelQuery('');
    setAddPanelActiveIndex(0);
  }, []);

  const handleToggleAddPanelMenu = useCallback(() => {
    setAddPanelMenuOpen((open) => {
      if (!open) updateAddPanelMenuPosition();
      if (!open) setArrangeMenuOpen(false);
      if (!open) {
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
      }
      return !open;
    });
  }, [updateAddPanelMenuPosition]);

  const handleArrangeCanvas = useCallback((layout: CanvasArrangeLayout) => {
    const changed = workspaceRef.current?.executeActiveCanvasCommand({ type: 'arrange-nodes', layout, source: 'nonvisual' }) ?? false;
    setArrangeMenuOpen(false);
    if (changed) window.requestAnimationFrame(() => workspaceRef.current?.fitActiveCanvas());
  }, []);

  const handleCreatePanel = useCallback((nodeType: string) => {
    workspaceRef.current?.executeActiveCanvasCommand({ type: 'create-node', nodeType, source: 'nonvisual' });
    closeAddPanelMenu();
    dismissOnboarding();
  }, [closeAddPanelMenu, dismissOnboarding]);

  const filteredPanelCreateOptions = useMemo(() => {
    const query = addPanelQuery.trim().toLowerCase();
    if (!query) return [...PANEL_CREATE_OPTIONS];
    return PANEL_CREATE_OPTIONS.filter((option) => {
      return `${option.label} ${option.detail} ${option.badge}`.toLowerCase().includes(query);
    });
  }, [addPanelQuery]);

  useEffect(() => {
    if (!addPanelMenuOpen) return;
    setAddPanelActiveIndex((index) => Math.min(index, Math.max(0, filteredPanelCreateOptions.length - 1)));
  }, [addPanelMenuOpen, filteredPanelCreateOptions.length]);

  useEffect(() => {
    if (!addPanelMenuOpen) return;
    window.requestAnimationFrame(() => addPanelSearchRef.current?.focus());
  }, [addPanelMenuOpen]);

  useEffect(() => {
    const change = chromeState.lastCanvasModelChange;
    if (!change || change.kind !== 'node-delete') return;
    const count = change.nodeIds.length;
    const id = Date.now();
    setWorkspaceToast({
      id,
      message: count > 1 ? `${count} panels deleted` : 'Panel deleted',
      actionLabel: 'Undo',
      action: () => {
        workspaceRef.current?.undoWorkspace();
        setWorkspaceToast(null);
      },
    });
    const timeout = window.setTimeout(() => {
      setWorkspaceToast((current) => current?.id === id ? null : current);
    }, 4200);
    return () => window.clearTimeout(timeout);
  }, [chromeState.lastCanvasModelChange, chromeState.lastCanvasModelChangeId]);

  useEffect(() => {
    if (!arrangeMenuOpen) return;
    updateArrangeMenuPosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (arrangeButtonRef.current?.contains(target) || arrangeMenuRef.current?.contains(target)) return;
      setArrangeMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArrangeMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateArrangeMenuPosition);
    window.addEventListener('scroll', updateArrangeMenuPosition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateArrangeMenuPosition);
      window.removeEventListener('scroll', updateArrangeMenuPosition, true);
    };
  }, [arrangeMenuOpen, updateArrangeMenuPosition]);

  useEffect(() => {
    if (!addPanelMenuOpen) return;
    updateAddPanelMenuPosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (addPanelButtonRef.current?.contains(target) || addPanelMenuRef.current?.contains(target)) return;
      closeAddPanelMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAddPanelMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateAddPanelMenuPosition);
    window.addEventListener('scroll', updateAddPanelMenuPosition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateAddPanelMenuPosition);
      window.removeEventListener('scroll', updateAddPanelMenuPosition, true);
    };
  }, [addPanelMenuOpen, closeAddPanelMenu, updateAddPanelMenuPosition]);

  const viewTree = useMemo(() => buildViewTree(chromeState.collection), [chromeState.collection]);
  const zoomReadout = `${Math.round(chromeState.status.zoom * 100)}%`;
  const saveButtonLabel = saveActionLabel(syncStatus, syncMessage, signedIn);

  const showOnboarding = !activeDocumentId && !onboardingDismissed;

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Workspace map">
        <div className="topbar" aria-label="Workspace tools">
          <div className="topbar-zone topbar-identity">
            <div className="brand" aria-label="Canaster" title="Canaster">
              <span className="brand-mark" aria-hidden="true" />
            </div>
            <form
              className="toolbar-group document-command-group"
              aria-label="Workspace name"
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
              <span className="sync-status-reader" role="status" aria-live="polite">{syncMessage}</span>
            </form>
          </div>
          <div className="topbar-zone topbar-controls">
            <div className="toolbar-group" aria-label="History">
              <IconButton label="Undo" disabled={!chromeState.canUndo} onClick={() => workspaceRef.current?.undoWorkspace()}>
                <Undo2 size={17} />
              </IconButton>
              <IconButton label="Redo" disabled={!chromeState.canRedo} onClick={() => workspaceRef.current?.redoWorkspace()}>
                <Redo2 size={17} />
              </IconButton>
            </div>
            <div className="toolbar-group" aria-label="View controls">
              <button
                ref={addPanelButtonRef}
                className="icon-button"
                type="button"
                aria-label="Add panel"
                aria-haspopup="dialog"
                aria-expanded={addPanelMenuOpen}
                title="Add panel"
                onClick={handleToggleAddPanelMenu}
              >
                <FilePlus2 size={17} />
              </button>
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
              <button
                ref={arrangeButtonRef}
                className="icon-button"
                type="button"
                aria-label="Arrange canvas panels"
                aria-haspopup="menu"
                aria-expanded={arrangeMenuOpen}
                title="Arrange canvas panels"
                onClick={handleToggleArrangeMenu}
              >
                <LayoutGrid size={17} />
              </button>
            </div>
            <div className="toolbar-group" aria-label="Panels">
              <IconButton
                label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </IconButton>
            </div>
            <div className="toolbar-group account-command-group" aria-label="Account">
              <IconButton
                label={signedIn ? 'Open account' : 'Sign in'}
                pressed={accountOpen}
                onClick={() => {
                  const nextOpen = !accountOpen;
                  if (nextOpen) {
                    dismissOnboarding();
                  }
                  setAccountOpen(nextOpen);
                }}
              >
                {signedIn ? <UserCircle size={17} /> : <LogIn size={17} />}
              </IconButton>
            </div>
          </div>
        </div>
        {addPanelMenuOpen ? (
          <AddPanelPopover
            ref={addPanelMenuRef}
            searchRef={addPanelSearchRef}
            position={addPanelMenuPosition}
            options={filteredPanelCreateOptions}
            query={addPanelQuery}
            activeIndex={addPanelActiveIndex}
            onQueryChange={(query) => {
              setAddPanelQuery(query);
              setAddPanelActiveIndex(0);
            }}
            onActiveIndexChange={setAddPanelActiveIndex}
            onCreate={handleCreatePanel}
            onClose={closeAddPanelMenu}
          />
        ) : null}
        {arrangeMenuOpen ? (
          <div
            ref={arrangeMenuRef}
            className="arrange-menu"
            role="menu"
            aria-label="Arrange canvas panels"
            style={arrangeMenuPosition ? { top: arrangeMenuPosition.top, left: arrangeMenuPosition.left } : undefined}
          >
            <button className="arrange-menu-item" type="button" role="menuitem" onClick={() => handleArrangeCanvas('grid')}>
              <LayoutGrid size={16} />
              <span>
                <strong>Compact</strong>
                <small>Dense balanced packing</small>
              </span>
            </button>
            <button className="arrange-menu-item" type="button" role="menuitem" onClick={() => handleArrangeCanvas('rows')}>
              <Rows3 size={16} />
              <span>
                <strong>Rows</strong>
                <small>Wide left-to-right flow</small>
              </span>
            </button>
            <button className="arrange-menu-item" type="button" role="menuitem" onClick={() => handleArrangeCanvas('columns')}>
              <Columns3 size={16} />
              <span>
                <strong>Columns</strong>
                <small>Tall top-to-bottom flow</small>
              </span>
            </button>
            <button className="arrange-menu-item" type="button" role="menuitem" onClick={() => handleArrangeCanvas('list')}>
              <LayoutList size={16} />
              <span>
                <strong>List</strong>
                <small>Single clean stack</small>
              </span>
            </button>
          </div>
        ) : null}
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

        <div className={`workspace-body ${viewTreeOpen ? 'tree-open' : 'tree-closed'}`}>
          {viewTreeOpen ? (
            <ViewTreePanel
              tree={viewTree}
              activeCanvasId={chromeState.collection.activeCanvasId}
              activeDocumentId={activeDocumentId}
              documents={documents}
              saveButtonLabel={saveButtonLabel}
              signedIn={signedIn}
              syncMessage={syncMessage}
              syncStatus={syncStatus}
              executeDocumentCommand={executeDocumentCommand}
              onClose={() => setViewTreeOpen(false)}
              onNewDocument={() => void handleNewLocalDraft()}
              onOpenAccount={() => {
                setAuthStep('email');
                setAccountOpen(true);
              }}
              onOpenDocument={(documentRef) => void loadDaptinDocument(documentRef, documents)}
              onRefreshDocuments={() => void handleRefreshDocuments()}
              onSaveOnline={() => void handleSaveOnline()}
            />
          ) : null}
          {!viewTreeOpen ? (
            <button
              className="icon-button sidepanel-open-button"
              type="button"
              aria-label="Open views and documents panel"
              title="Open views and documents"
              onClick={() => setViewTreeOpen(true)}
            >
              <PanelLeftOpen size={17} />
            </button>
          ) : null}
          <div className="workspace-canvas-region">
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
            {chromeState.collection.view.deleteConfirmation ? (
              <DeleteConfirmationPrompt
                collection={chromeState.collection}
                onCancel={() => executeDocumentCommand({ type: 'cancel-delete-confirmation', source: 'nonvisual' })}
                onConfirm={() => executeDocumentCommand({ type: 'confirm-delete-selection', canvasId: chromeState.collection.view.deleteConfirmation?.canvasId ?? chromeState.collection.activeCanvasId, source: 'nonvisual' })}
              />
            ) : null}
            {workspaceToast ? (
              <WorkspaceToastView toast={workspaceToast} onDismiss={() => setWorkspaceToast(null)} />
            ) : null}
            <div className="toolbar-group zoom-toolbar" aria-label="Zoom controls">
              <IconButton label="Zoom out" onClick={() => workspaceRef.current?.zoomActiveBy(0.82)}>
                <Minus size={17} />
              </IconButton>
              <span className="zoom-readout" aria-label={`Zoom ${zoomReadout}`}>{zoomReadout}</span>
              <IconButton label="Zoom in" onClick={() => workspaceRef.current?.zoomActiveBy(1.22)}>
                <Plus size={17} />
              </IconButton>
            </div>
            {showOnboarding ? (
              <FirstRunGuide
                onDismiss={dismissOnboarding}
                onFitSample={() => workspaceRef.current?.fitActiveCanvas()}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

type PanelCreateOption = (typeof PANEL_CREATE_OPTIONS)[number];

type AddPanelPopoverProps = {
  searchRef: Ref<HTMLInputElement>;
  position: ArrangeMenuPosition | null;
  options: PanelCreateOption[];
  query: string;
  activeIndex: number;
  onQueryChange: (query: string) => void;
  onActiveIndexChange: (index: number) => void;
  onCreate: (nodeType: string) => void;
  onClose: () => void;
};

const AddPanelPopover = forwardRef<HTMLDivElement, AddPanelPopoverProps>(function AddPanelPopover(
  {
    searchRef,
    position,
    options,
    query,
    activeIndex,
    onQueryChange,
    onActiveIndexChange,
    onCreate,
    onClose,
  },
  ref,
) {
  const activeOption = options[activeIndex] ?? null;
  return (
    <div
      ref={ref}
      className="add-panel-menu"
      role="dialog"
      aria-label="Add panel"
      style={position ? { top: position.top, left: position.left } : undefined}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onActiveIndexChange(options.length ? (activeIndex + 1) % options.length : 0);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onActiveIndexChange(options.length ? (activeIndex - 1 + options.length) % options.length : 0);
          return;
        }
        if (event.key === 'Enter' && activeOption) {
          event.preventDefault();
          onCreate(activeOption.type);
          return;
        }
        if (/^[1-9]$/.test(event.key)) {
          const option = options[Number(event.key) - 1];
          if (option) {
            event.preventDefault();
            onCreate(option.type);
          }
        }
      }}
    >
      <input
        ref={searchRef}
        className="add-panel-search"
        type="search"
        aria-label="Search panel types"
        placeholder="Add panel"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <div className="add-panel-options" role="listbox" aria-label="Panel types">
        {options.length ? options.map((option, index) => (
          <button
            key={option.type}
            className="arrange-menu-item add-panel-menu-item"
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseEnter={() => onActiveIndexChange(index)}
            onClick={() => onCreate(option.type)}
          >
            <span className="panel-type-mark" aria-hidden="true">{option.badge}</span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <kbd>{index + 1}</kbd>
          </button>
        )) : (
          <div className="add-panel-empty">No panel type</div>
        )}
      </div>
      <button className="add-panel-close" type="button" aria-label="Close add panel" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
});

function WorkspaceToastView({ toast, onDismiss }: { toast: NonNullable<WorkspaceToast>; onDismiss: () => void }) {
  return (
    <div className="workspace-toast" role="status" aria-live="polite">
      <span>{toast.message}</span>
      <button type="button" onClick={toast.action}>{toast.actionLabel}</button>
      <button className="workspace-toast-close" type="button" aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

function DeleteConfirmationPrompt({
  collection,
  onCancel,
  onConfirm,
}: {
  collection: CanvasDocumentCollection;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmation = collection.view.deleteConfirmation;
  if (!confirmation) return null;
  const document = collection.documents[confirmation.canvasId];
  const nodes = document?.model.nodes.filter((node) => confirmation.nodeIds.includes(node.id)) ?? [];
  const count = nodes.length || confirmation.nodeIds.length;
  return (
    <div className="delete-confirmation" role="presentation" onPointerDown={onCancel}>
      <section
        className="delete-confirmation-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirmation-title"
        aria-describedby="delete-confirmation-copy"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-confirmation-title">{count > 1 ? `Delete ${count} views?` : 'Delete this view?'}</h2>
        <p id="delete-confirmation-copy">Child canvas content will be removed with it.</p>
        <div>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="danger" type="button" onClick={onConfirm}>Delete</button>
        </div>
      </section>
    </div>
  );
}

type ChildViewTarget = {
  canvasId: CanvasDocumentId;
  title: string;
};

type ViewTreeNode = {
  canvasId: CanvasDocumentId;
  title: string;
  depth: number;
  children: ViewTreeNode[];
};

function ViewTreePanel({
  tree,
  activeCanvasId,
  activeDocumentId,
  documents,
  saveButtonLabel,
  signedIn,
  syncMessage,
  syncStatus,
  executeDocumentCommand,
  onClose,
  onNewDocument,
  onOpenAccount,
  onOpenDocument,
  onRefreshDocuments,
  onSaveOnline,
}: {
  tree: ViewTreeNode | null;
  activeCanvasId: CanvasDocumentId;
  activeDocumentId: string;
  documents: CanasterDocumentSummary[];
  saveButtonLabel: string;
  signedIn: boolean;
  syncMessage: string;
  syncStatus: SyncStatus;
  executeDocumentCommand: (command: DocumentCommand) => void;
  onClose: () => void;
  onNewDocument: () => void;
  onOpenAccount: () => void;
  onOpenDocument: (documentRef: string) => void;
  onRefreshDocuments: () => void;
  onSaveOnline: () => void;
}) {
  const viewCount = tree ? countViewTreeNodes(tree) : 0;
  return (
    <aside className="view-tree-panel" aria-label="Views and documents">
      <section className="sidepanel-section views-section" aria-label="Views">
        <div className="sidepanel-section-row">
          <div className="sidepanel-section-title">
            <span>Views</span>
            <span>{viewCount === 1 ? '1 view' : `${viewCount} views`}</span>
          </div>
          <button className="utility-close" type="button" aria-label="Close view tree" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <nav className="view-tree-list" aria-label="Canvas views">
          {tree ? (
            <ViewTreeItem
              node={tree}
              activeCanvasId={activeCanvasId}
              executeDocumentCommand={executeDocumentCommand}
            />
          ) : (
            <div className="view-tree-empty">No views</div>
          )}
        </nav>
      </section>
      <DocumentsPanel
        activeDocumentId={activeDocumentId}
        documents={documents}
        saveButtonLabel={saveButtonLabel}
        signedIn={signedIn}
        syncMessage={syncMessage}
        syncStatus={syncStatus}
        onNew={onNewDocument}
        onOpenAccount={onOpenAccount}
        onOpenDocument={onOpenDocument}
        onRefresh={onRefreshDocuments}
        onSaveOnline={onSaveOnline}
      />
    </aside>
  );
}

function ViewTreeItem({
  node,
  activeCanvasId,
  executeDocumentCommand,
}: {
  node: ViewTreeNode;
  activeCanvasId: CanvasDocumentId;
  executeDocumentCommand: (command: DocumentCommand) => void;
}) {
  const active = node.canvasId === activeCanvasId;
  return (
    <div className="view-tree-branch">
      <button
        className={`view-tree-row${active ? ' active' : ''}`}
        type="button"
        style={{ '--depth': node.depth } as CSSProperties}
        aria-current={active ? 'page' : undefined}
        onClick={() => executeDocumentCommand({ type: 'select-canvas', canvasId: node.canvasId, source: 'nonvisual' })}
      >
        <span className={`view-tree-disclosure${node.children.length ? '' : ' empty'}`} aria-hidden="true">
          {node.children.length ? <ChevronDown size={13} /> : null}
        </span>
        <span className="view-tree-title">{node.title}</span>
      </button>
      {node.children.length ? (
        <div className="view-tree-children">
          {node.children.map((child) => (
            <ViewTreeItem
              key={child.canvasId}
              node={child}
              activeCanvasId={activeCanvasId}
              executeDocumentCommand={executeDocumentCommand}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type FirstRunGuideProps = {
  onDismiss: () => void;
  onFitSample: () => void;
};

function FirstRunGuide({ onDismiss, onFitSample }: FirstRunGuideProps) {
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
        <li>Select a panel, then click its content to edit inline.</li>
      </ul>
      <div className="guide-actions" aria-label="Getting started actions">
        <button className="guide-action primary" type="button" onClick={onFitSample}>
          <Maximize2 size={15} />
          Center sample
        </button>
        <button className="guide-action quiet" type="button" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </aside>
  );
}

type DocumentsPanelProps = {
  activeDocumentId: string;
  documents: CanasterDocumentSummary[];
  saveButtonLabel: string;
  signedIn: boolean;
  syncMessage: string;
  syncStatus: SyncStatus;
  onNew: () => void;
  onOpenAccount: () => void;
  onOpenDocument: (documentRef: string) => void;
  onRefresh: () => void;
  onSaveOnline: () => void;
};

function DocumentsPanel({
  activeDocumentId,
  documents,
  saveButtonLabel,
  signedIn,
  syncMessage,
  syncStatus,
  onNew,
  onOpenAccount,
  onOpenDocument,
  onRefresh,
  onSaveOnline,
}: DocumentsPanelProps) {
  return (
    <section className="sidepanel-section documents-section" aria-label="Saved workspaces">
      <div className="sidepanel-section-row document-panel-header">
        <div className="sidepanel-section-title">
          <span>Documents</span>
          <span>{signedIn ? `${documents.length} saved` : 'Local only'}</span>
        </div>
        <div className="document-panel-actions" aria-label="Document commands">
          <button className="sidepanel-icon-button" type="button" aria-label="New workspace" title="New workspace" onClick={onNew}>
            <FilePlus2 size={15} />
          </button>
          <button
            className={`sidepanel-icon-button save-online-button ${syncStatus}`}
            type="button"
            aria-label={saveButtonLabel}
            title={syncMessage}
            disabled={syncStatus === 'loading' || syncStatus === 'saving'}
            onClick={onSaveOnline}
          >
            <Save size={15} />
            <span className="save-status-badge" aria-hidden="true">
              <SyncStatusIcon status={syncStatus} />
            </span>
          </button>
          <button className="sidepanel-icon-button" type="button" aria-label="Refresh saved workspaces" title="Refresh saved workspaces" disabled={!signedIn || syncStatus === 'loading'} onClick={onRefresh}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div className="document-panel-status" role="status" aria-live="polite">{syncMessage}</div>
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
    </section>
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

function saveActionLabel(status: SyncStatus, message: string, signedIn: boolean) {
  if (!signedIn) return 'Sign in to save online';
  if (status === 'saving' || status === 'loading') return message;
  if (status === 'error') return `${message}. Try saving again.`;
  if (status === 'dirty') return 'Save online changes';
  if (status === 'clean') return message === SAVED_MESSAGE ? 'Saved online' : 'Save workspace online';
  return 'Save workspace online';
}

function imageAssetIdsInCollection(collection: CanvasDocumentCollection): string[] {
  const ids = new Set<string>();
  for (const document of Object.values(collection.documents)) {
    for (const node of document.model.nodes) {
      if (node.type !== BuiltInNodeTypes.image) continue;
      const data = parseNodeData(node);
      const assetId = typeof data.assetId === 'string' ? data.assetId : '';
      if (assetId) ids.add(assetId);
    }
  }
  return [...ids];
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

function buildViewTree(collection: CanvasDocumentCollection): ViewTreeNode | null {
  const root = collection.documents[collection.rootCanvasId];
  if (!root) return null;
  const visited = new Set<CanvasDocumentId>();

  const buildNode = (canvasId: CanvasDocumentId, depth: number, fallbackTitle?: string): ViewTreeNode | null => {
    if (visited.has(canvasId)) return null;
    const document = collection.documents[canvasId];
    if (!document) return null;
    visited.add(canvasId);
    const children = document.model.nodes
      .map((node) => childViewTargetFor(collection, node))
      .filter((target): target is ChildViewTarget => Boolean(target))
      .map((target) => buildNode(target.canvasId, depth + 1, target.title))
      .filter((node): node is ViewTreeNode => Boolean(node));
    return {
      canvasId: document.id,
      title: document.title || fallbackTitle || 'Untitled view',
      depth,
      children,
    };
  };

  return buildNode(root.id, 0);
}

function countViewTreeNodes(node: ViewTreeNode): number {
  return 1 + node.children.reduce((count, child) => count + countViewTreeNodes(child), 0);
}

function childViewTargetFor(collection: CanvasDocumentCollection, node: CanvasNode): ChildViewTarget | null {
  const data = portalDataForNode(node);
  if (!data?.childCanvasId || !collection.documents[data.childCanvasId]) return null;
  return {
    canvasId: data.childCanvasId,
    title: collection.documents[data.childCanvasId].title || data.title || describeNode(node).label,
  };
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
