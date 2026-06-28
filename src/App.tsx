import {
    Columns3,
    LayoutGrid,
    LayoutList,
    Maximize2,
    Minus,
    Plus,
    Rows3,
} from 'lucide-react';
import {
    forwardRef,
    type MutableRefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import {
    type CanasterDocumentSummary,
    createDocument,
    listDocuments,
    loadDocumentDetails,
    requestEmailOtp,
    saveDocument,
    signOut,
    verifyEmailOtp,
} from './backend/canasterDocuments';
import {loadAssetObject} from './backend/assets';
import {
    clearDaptinSession,
    DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY,
    DAPTIN_LAST_EMAIL_STORAGE_KEY,
    hasUsableStoredToken,
    isSessionError,
    normalizeDaptinError,
    tokenEmail,
} from './backend/daptinClient';
import {
    connectDaptinLive,
    type DaptinLiveEvent
} from './backend/daptinLive';
import {
    defaultStarterCollection,
    STARTER_WORKSPACE_STORAGE_KEY
} from './catalog/starterCatalog';
import {portalDataForNode} from './engine/documentModel';
import {
    initialViewportStatus,
    NestedCanvasWorkspace,
    type NestedCanvasWorkspaceChromeState,
    type NestedCanvasWorkspaceHandle,
} from './engine/nested/NestedCanvasWorkspace';
import {
    describeNode,
    referencedAssetIdsForNode
} from './engine/nodeTypes/registry';
import {
    cacheAssetImage,
    hasCachedAssetImage
} from './engine/nodeTypes/imageAssets';
import {
    type CanvasArrangeLayout,
    type CanvasNode,
    type ThemeName
} from './engine/types';
import type {
    CanvasDocumentCollection,
    CanvasDocumentId,
    CanvasWorkspaceSnapshot,
    DocumentCommand
} from './engine/documentTypes';
import {saveWorkspaceSnapshot} from './engine/workspaceStorage';
import {
    createWorkspaceHistory,
    createWorkspaceSnapshot
} from './engine/workspaceHistory';
import {
    readWorkspaceUrlState,
    replaceWorkspaceUrlState,
    type WorkspaceUrlState
} from './engine/workspaceUrlLocation';
import {
    AddPanelPopover,
    PANEL_CREATE_OPTIONS
} from "./AddPanelPopover";
import {
    SidePanel,
    ViewTreeNode
} from "./SidePanel";
import {
    WorkspaceToast,
    WorkspaceToastView
} from "./WorkspaceToastView";
import {DeleteConfirmationPrompt} from "./DeleteConfirmationPrompt";
import {AccountPopover} from "./AccountPopover";
import {IconButton} from "./IconButton";
import {HeaderToolbar} from "./HeaderToolbar";
import {KeyboardShortcutsProvider, useKeyboardShortcut} from "./KeyboardShortcuts";

const DEFAULT_DOCUMENT_TITLE = 'Canaster Workspace';
const LOCAL_SAVE_MESSAGE = 'Saved on this device';
const ONLINE_READY_MESSAGE = 'Ready to save online';
const SAVED_MESSAGE = 'Saved online';
const ARRANGE_MENU_WIDTH = 208;
const ADD_PANEL_MENU_WIDTH = 224;


type ArrangePanelMenuProps = {
    arrangeMenuPosition: ArrangeMenuPosition | null,
    onSelect: (layout: CanvasArrangeLayout) => void
};

const ArrangePanelMenu = forwardRef<HTMLDivElement, ArrangePanelMenuProps>(function ArrangePanelMenu(props, ref) {
    return <div
        ref={ref}
        className="arrange-menu"
        role="menu"
        aria-label="Arrange canvas panels"
        style={props.arrangeMenuPosition ? {
            top : props.arrangeMenuPosition.top,
            left: props.arrangeMenuPosition.left
        } : undefined}
    >
        <button className="arrange-menu-item" type="button" role="menuitem"
                onClick={() => props.onSelect('grid')}>
            <LayoutGrid size={16}/>
            <span>
                <strong>Compact</strong>
                <small>Dense balanced packing</small>
              </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem"
                onClick={() => props.onSelect('rows')}>
            <Rows3 size={16}/>
            <span>
                <strong>Rows</strong>
                <small>Wide left-to-right flow</small>
              </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem"
                onClick={() => props.onSelect('columns')}>
            <Columns3 size={16}/>
            <span>
                <strong>Columns</strong>
                <small>Tall top-to-bottom flow</small>
              </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem"
                onClick={() => props.onSelect('list')}>
            <LayoutList size={16}/>
            <span>
                <strong>List</strong>
                <small>Single clean stack</small>
            </span>
        </button>
    </div>;
});

function WorkspaceHistoryShortcuts({workspaceRef}: { workspaceRef: MutableRefObject<NestedCanvasWorkspaceHandle | null> }) {
    useKeyboardShortcut({
        key       : 'z',
        metaOrCtrl: true,
        handler   : () => workspaceRef.current?.undoWorkspace() ?? false,
    });
    useKeyboardShortcut({
        key       : 'z',
        metaOrCtrl: true,
        shift     : true,
        handler   : () => workspaceRef.current?.redoWorkspace() ?? false,
    });
    return null;
}

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
    const hasInitialStoredSession = initialStoredSessionRef.current;
    const initialUrlStateRef = useRef<WorkspaceUrlState | null>(null);
    if (initialUrlStateRef.current === null) initialUrlStateRef.current = readWorkspaceUrlState();
    const pendingUrlStateRef = useRef<WorkspaceUrlState | null>(initialUrlStateRef.current,);
    const urlStateReadyRef = useRef(!pendingUrlStateRef.current);
    const [theme, setTheme] = useState<ThemeName>('dark');
    const [accountOpen, setAccountOpen] = useState(false);
    const [arrangeMenuOpen, setArrangeMenuOpen] = useState(false);
    const [arrangeMenuPosition, setArrangeMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [addPanelMenuOpen, setAddPanelMenuOpen] = useState(false);
    const [addPanelMenuPosition, setAddPanelMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [addPanelQuery, setAddPanelQuery] = useState('');
    const [addPanelActiveIndex, setAddPanelActiveIndex] = useState(0);
    const [sidePanelOpen, setSidePanelOpen] = useState(() => window.matchMedia('(min-width: 641px)').matches);
    const [workspaceToast, setWorkspaceToast] = useState<WorkspaceToast>(null);
    const [authStep, setAuthStep] = useState<AuthStep>('email');
    const [parentContextVisible, setParentContextVisible] = useState(true);
    const [authEmail, setAuthEmail] = useState(
        () => emailFromStoredToken() || window.localStorage.getItem(DAPTIN_LAST_EMAIL_STORAGE_KEY) || '');
    const [authOtp, setAuthOtp] = useState('');
    const [signedIn, setSignedIn] = useState(() => hasInitialStoredSession);
    const [documents, setDocuments] = useState<CanasterDocumentSummary[]>([]);
    const [activeDocumentId, setActiveDocumentId] = useState(() => initialUrlStateRef.current?.documentId ??
        window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) ?? '');
    const [documentTitle, setDocumentTitle] = useState(DEFAULT_DOCUMENT_TITLE);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (hasInitialStoredSession ? 'loading' : 'anonymous'));
    const [syncMessage, setSyncMessage] = useState(
        () => (hasInitialStoredSession ? 'Checking saved workspaces' : LOCAL_SAVE_MESSAGE));
    const activeDocumentIdRef = useRef(activeDocumentId);
    const syncStatusRef = useRef(syncStatus);
    const initialCollection = useMemo(() => defaultStarterCollection(), []);
    const workspaceStorageKey = activeDocumentId ? remoteWorkspaceStorageKey(activeDocumentId) :
        STARTER_WORKSPACE_STORAGE_KEY;
    const fitWorkspaceOnFirstLoad = !activeDocumentId && !preserveCameraOnNextLocalMountRef.current;
    const [chromeState, setChromeState] = useState<NestedCanvasWorkspaceChromeState>(() => ({
        collection             : initialCollection,
        status                 : initialViewportStatus,
        lastModelChange        : null,
        lastCanvasModelChange  : null,
        lastCanvasModelChangeId: 0,
        canUndo                : false,
        canRedo                : false,
        storageReady           : false,
    }));

    const handleChromeStateChange = useCallback((next: NestedCanvasWorkspaceChromeState) => {
        setChromeState(next);
    }, []);

    const handleWorkspaceCollectionChange = useCallback(() => {
        if (Date.now() < ignoreDirtyUntilRef.current) return;
        if (!signedIn || !activeDocumentId) {
            setSyncStatus((current) => current === 'loading' || current === 'saving' || current === 'error' ? current :
                signedIn ? 'dirty' : 'anonymous');
            setSyncMessage(
                (current) => current === 'Checking saved workspaces' || current === 'Saving workspace' ? current :
                    signedIn ? ONLINE_READY_MESSAGE : LOCAL_SAVE_MESSAGE);
            return;
        }
        const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
        if (currentSnapshot && snapshotSignature(currentSnapshot) === lastSavedSnapshotSignatureRef.current) {
            setSyncStatus('clean');
            setSyncMessage(SAVED_MESSAGE);
            return;
        }
        setSyncStatus(
            (current) => current === 'loading' || current === 'saving' || current === 'error' ? current : 'dirty');
        setSyncMessage((current) => current === 'Opening workspace' || current === 'Saving workspace' ? current :
            'Unsaved online changes');
    }, [activeDocumentId, signedIn]);

    const executeDocumentCommand = useCallback((command: DocumentCommand) => {
        workspaceRef.current?.executeDocumentCommand(command);
    }, []);

    const handleDocumentTitleChange = useCallback((value: string) => {
        setDocumentTitle(value);
        if (!signedIn || !activeDocumentId) return;
        setSyncStatus(
            (current) => current === 'loading' || current === 'saving' || current === 'error' ? current : 'dirty');
        setSyncMessage((current) => current === 'Opening workspace' || current === 'Saving workspace' ? current :
            'Unsaved online changes');
    }, [activeDocumentId, signedIn]);

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
        activeDocumentIdRef.current = activeDocumentId;
    }, [activeDocumentId]);

    useEffect(() => {
        syncStatusRef.current = syncStatus;
    }, [syncStatus]);

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
        activeDocumentId, chromeState,
    ]);

    useEffect(() => {
        if (!signedIn) return;
        const tokenEmail = emailFromStoredToken();
        if (!tokenEmail || tokenEmail === authEmail.trim()) return;
        setAuthEmail(tokenEmail);
        window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, tokenEmail);
    }, [authEmail, signedIn]);


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
        setSyncMessage(
            savedLocally ? 'Session expired. Your workspace is saved on this device. Sign in again to save online.' :
                'Session expired. Keep this tab open and sign in again to save online.');
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

    const loadDaptinDocument = useCallback(
        async (documentRef: string, knownDocuments: CanasterDocumentSummary[] = []) => {
            if (!documentRef) return;
            setSyncStatus('loading');
            setSyncMessage('Opening workspace');
            try {
                const loadedDocument = await loadDocumentDetails(documentRef);
                const snapshot = loadedDocument.snapshot;
                const title = knownDocuments.find((document) => document.id === documentRef)?.title ??
                    loadedDocument.title ?? titleFromSnapshot(snapshot);
                const nextStorageKey = remoteWorkspaceStorageKey(documentRef);
                await saveWorkspaceSnapshot(snapshot, nextStorageKey);
                lastSavedSnapshotSignatureRef.current = snapshotSignature(snapshot);
                ignoreDirtyUntilRef.current = Date.now() + 1200;
                workspaceRef.current?.replaceWorkspaceSnapshot(snapshot, {
                    storageKey : nextStorageKey,
                    interaction: 'Document loaded',
                });
                applyPendingUrlState(documentRef);
                window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
                setActiveDocumentId(documentRef);
                setDocumentTitle(title);
                setSyncStatus('clean');
                setSyncMessage(SAVED_MESSAGE);
                window.setTimeout(() => {
                    const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
                    if (currentSnapshot && snapshotSignature(currentSnapshot) ===
                        lastSavedSnapshotSignatureRef.current) {
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
        const restoredDocumentId = activeDocumentId ||
            window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) || '';
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

    const handleDocumentLiveEvent = useCallback(async (event: DaptinLiveEvent) => {
        if (event.topic !== 'document') return;
        try {
            const rows = await refreshDocuments();
            const liveDocumentRef = liveDocumentId(event);
            const currentDocumentRef = activeDocumentIdRef.current;
            if (!liveDocumentRef || !currentDocumentRef || liveDocumentRef !== currentDocumentRef) return;
            if (syncStatusRef.current === 'saving' || syncStatusRef.current === 'loading') return;
            const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
            const isClean = syncStatusRef.current !== 'dirty' && currentSnapshot &&
                snapshotSignature(currentSnapshot) === lastSavedSnapshotSignatureRef.current;
            if (!isClean) {
                setSyncStatus('dirty');
                setSyncMessage('Online copy changed elsewhere. Save or refresh before continuing.');
                return;
            }
            await loadDaptinDocument(currentDocumentRef, rows);
        } catch (error) {
            if (await recoverSessionError(error)) return;
            setSyncStatus('error');
            setSyncMessage(workspaceErrorMessage(error, 'refresh'));
        }
    }, [loadDaptinDocument, recoverSessionError, refreshDocuments]);

    useEffect(() => {
        if (!signedIn || !hasUsableStoredToken()) return;
        const connection = connectDaptinLive({
            topicName     : 'document',
            onEvent       : (event) => {
                void handleDocumentLiveEvent(event);
            },
            onUnauthorized: () => {
                void handleSessionExpired();
            },
        });
        return () => {
            connection.close();
        };
    }, [handleDocumentLiveEvent, handleSessionExpired, signedIn]);

    useEffect(() => {
        if (!signedIn || !hasUsableStoredToken()) return;
        const assetIds = imageAssetIdsInCollection(chromeState.collection).filter(
            (assetId) => !hasCachedAssetImage(assetId));
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
            await requestEmailOtp({email});
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
            await verifyEmailOtp({
                email,
                otp
            });
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
        } catch {
        }
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
        workspaceRef.current?.replaceWorkspaceSnapshot(snapshot, {
            storageKey : STARTER_WORKSPACE_STORAGE_KEY,
            interaction: 'New workspace',
        });
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
        const left = Math.max(margin,
            Math.min(window.innerWidth - ARRANGE_MENU_WIDTH - margin, rect.right - ARRANGE_MENU_WIDTH));
        const top = Math.max(margin, Math.min(window.innerHeight - 220, rect.bottom + 8));
        setArrangeMenuPosition({
            left,
            top
        });
    }, []);

    const updateAddPanelMenuPosition = useCallback(() => {
        const button = addPanelButtonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const margin = 12;
        const left = Math.max(margin,
            Math.min(window.innerWidth - ADD_PANEL_MENU_WIDTH - margin, rect.right - ADD_PANEL_MENU_WIDTH));
        const top = Math.max(margin, Math.min(window.innerHeight - 280, rect.bottom + 8));
        setAddPanelMenuPosition({
            left,
            top
        });
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
        const changed = workspaceRef.current?.executeActiveCanvasCommand({
            type  : 'arrange-nodes',
            layout,
            source: 'nonvisual'
        }) ?? false;
        setArrangeMenuOpen(false);
        if (changed) window.requestAnimationFrame(() => workspaceRef.current?.fitActiveCanvas());
    }, []);

    const handleCreatePanel = useCallback((nodeType: string) => {
        workspaceRef.current?.executeActiveCanvasCommand({
            type  : 'create-node',
            nodeType,
            source: 'nonvisual'
        });
        closeAddPanelMenu();
    }, [closeAddPanelMenu]);

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
            message    : count > 1 ? `${count} panels deleted` : 'Panel deleted',
            actionLabel: 'Undo',
            action     : () => {
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
    const saveButtonLabel = saveActionLabel(syncStatus, syncMessage, signedIn);

    return (<KeyboardShortcutsProvider>
        <WorkspaceHistoryShortcuts workspaceRef={workspaceRef}/>
        <main className="app-shell">
        <section className="workspace" aria-label="Workspace map">
            <HeaderToolbar
                sidePanel={{
                    open    : sidePanelOpen,
                    onToggle: () => setSidePanelOpen((open) => !open)
                }}
                document={{
                    title        : documentTitle,
                    syncMessage,
                    onTitleChange: handleDocumentTitleChange,
                    onSave       : () => void handleSaveOnline()
                }}
                history={{
                    canUndo: chromeState.canUndo,
                    canRedo: chromeState.canRedo,
                    onUndo : () => workspaceRef.current?.undoWorkspace(),
                    onRedo : () => workspaceRef.current?.redoWorkspace()
                }}
                view={{
                    parentContextVisible,
                    onResetZoom          : () => workspaceRef.current?.resetActiveZoom(),
                    onToggleParentContext: () => setParentContextVisible((visible) => !visible)
                }}
                addPanel={{
                    buttonRef: addPanelButtonRef,
                    open     : addPanelMenuOpen,
                    onToggle : handleToggleAddPanelMenu
                }}
                arrange={{
                    buttonRef: arrangeButtonRef,
                    open     : arrangeMenuOpen,
                    onToggle : handleToggleArrangeMenu
                }}
                theme={{
                    name    : theme,
                    onToggle: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
                }}
                account={{
                    signedIn,
                    open    : accountOpen,
                    onToggle: () => {
                        const nextOpen = !accountOpen;
                        setAccountOpen(nextOpen);
                    }
                }}
            />
            {addPanelMenuOpen ? (<AddPanelPopover
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
            />) : null}
            {arrangeMenuOpen ? (<ArrangePanelMenu ref={arrangeMenuRef} arrangeMenuPosition={arrangeMenuPosition}
                                                  onSelect={(layout: CanvasArrangeLayout) => handleArrangeCanvas(
                                                      layout)}/>) : null}
            {accountOpen ? (<AccountPopover
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
            />) : null}

            <div className={`workspace-body ${sidePanelOpen ? 'tree-open' : 'tree-closed'}`}>
                {sidePanelOpen ? (<SidePanel
                    tree={viewTree}
                    activeCanvasId={chromeState.collection.activeCanvasId}
                    activeDocumentId={activeDocumentId}
                    documents={documents}
                    saveButtonLabel={saveButtonLabel}
                    signedIn={signedIn}
                    syncMessage={syncMessage}
                    syncStatus={syncStatus}
                    executeDocumentCommand={executeDocumentCommand}
                    onClose={() => setSidePanelOpen(false)}
                    onNewDocument={() => void handleNewLocalDraft()}
                    onOpenAccount={() => {
                        setAuthStep('email');
                        setAccountOpen(true);
                    }}
                    onOpenDocument={(documentRef) => void loadDaptinDocument(documentRef, documents)}
                    onRefreshDocuments={() => void handleRefreshDocuments()}
                    onSaveOnline={() => void handleSaveOnline()}
                />) : null}
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
                    {chromeState.collection.view.deleteConfirmation ? (<DeleteConfirmationPrompt
                        collection={chromeState.collection}
                        onCancel={() => executeDocumentCommand({
                            type  : 'cancel-delete-confirmation',
                            source: 'nonvisual'
                        })}
                        onConfirm={() => executeDocumentCommand({
                            type    : 'confirm-delete-selection',
                            canvasId: chromeState.collection.view.deleteConfirmation?.canvasId ??
                                chromeState.collection.activeCanvasId,
                            source  : 'nonvisual'
                        })}
                    />) : null}
                    {workspaceToast ?
                        (<WorkspaceToastView toast={workspaceToast} onDismiss={() => setWorkspaceToast(null)}/>) :
                        null}
                    <div className="toolbar-group zoom-toolbar" aria-label="Zoom controls">
                        <IconButton label="Zoom in" onClick={() => workspaceRef.current?.zoomActiveBy(1.22)}>
                            <Plus size={17}/>
                        </IconButton>
                        <IconButton label="Center map" onClick={() => workspaceRef.current?.fitActiveCanvas()}>
                            <Maximize2 size={17}/>
                        </IconButton>
                        <IconButton label="Zoom out" onClick={() => workspaceRef.current?.zoomActiveBy(0.82)}>
                            <Minus size={17}/>
                        </IconButton>
                    </div>
                </div>
            </div>
        </section>
    </main>
    </KeyboardShortcutsProvider>);
}


type ChildViewTarget = {
    canvasId: CanvasDocumentId; title: string;
};


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
            for (const assetId of referencedAssetIdsForNode(node)) ids.add(assetId);
        }
    }
    return [...ids];
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
            title   : document.title || fallbackTitle || 'Untitled view',
            depth,
            children,
        };
    };

    return buildNode(root.id, 0);
}

function childViewTargetFor(collection: CanvasDocumentCollection, node: CanvasNode): ChildViewTarget | null {
    const data = portalDataForNode(node);
    if (!data?.childCanvasId || !collection.documents[data.childCanvasId]) return null;
    return {
        canvasId: data.childCanvasId,
        title   : collection.documents[data.childCanvasId].title || data.title || describeNode(node).label,
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
    if (apiError.kind ===
        'session') return 'Session expired. Your workspace is saved on this device. Sign in again to save online.';
    if (apiError.kind === 'network') return 'Could not reach saved workspaces. Check your connection and try again.';
    if (apiError.kind === 'permission') return action === 'save' ?
        'Could not save this workspace because this account no longer has access. Keep working locally or sign in again.' :
        'This account cannot open that workspace. Choose another workspace or sign in again.';
    if (apiError.kind ===
        'not-found') return 'That saved workspace was not found. Refresh saved workspaces or keep working locally.';
    if (apiError.kind === 'server') return action === 'save' ?
        'Saved workspaces are unavailable right now. Your workspace is still here; try Save online again.' :
        'Saved workspaces are unavailable right now. Keep working locally and try again.';
    if (apiError.kind === 'invalid-response') return action === 'open' ?
        'That saved workspace could not be read. The current workspace was left unchanged.' :
        'Saved workspace data looked wrong. Keep working locally and try again.';
    if (action === 'open') return 'Could not open this workspace. Refresh saved workspaces or choose another one.';
    if (action === 'refresh') return 'Could not refresh saved workspaces. Check your connection and try again.';
    return 'Could not save this workspace. Check your connection and try again.';
}

function accountErrorMessage(error: unknown, action: 'send-code' | 'verify-code'): string {
    const apiError = normalizeDaptinError(error, '');
    if (apiError.kind === 'network') return 'Could not reach accounts. Check your connection and try again.';
    if (apiError.kind === 'server' && action ===
        'send-code') return 'Accounts are unavailable right now. Try sending the code again.';
    if (action === 'send-code') return 'Could not send a sign-in code. Check the email and try again.';
    return 'Could not verify that code. Check the code and try again.';
}

function liveDocumentId(event: DaptinLiveEvent): string {
    console.log("Get document id from", event)
    return documentIdFromLivePayload(event.data) || documentIdFromLivePayload(event.raw);
}

function documentIdFromLivePayload(value: unknown): string {
    if (!isRecord(value)) return '';
    const direct = stringField(value.reference_id) || stringField(value.referenceId) || stringField(value.id);
    if (direct) return direct;
    const attributes = isRecord(value.attributes) ? value.attributes : null;
    if (!attributes) return '';
    return stringField(attributes.reference_id) || stringField(attributes.referenceId) || stringField(attributes.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function stringField(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function emailFromStoredToken(): string {
    return tokenEmail();
}

function snapshotSignature(snapshot: unknown): string {
    return JSON.stringify(snapshot);
}
