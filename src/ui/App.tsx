import {
    Check,
    Columns3,
    LayoutGrid,
    LayoutList,
    Rows3,
} from 'lucide-react';
import {
    forwardRef,
    type MouseEvent as ReactMouseEvent,
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
} from '../infra/daptin/canasterDocuments';
import {loadAssetObject, uploadImageAsset} from '../infra/daptin/assets';
import {
    isLocalAssetId,
    loadLocalAssetFile,
    loadLocalAssetObject,
    saveLocalImageAsset
} from '../infra/browser/localAssets';
import {
    clearDaptinSession,
    DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY,
    DAPTIN_LAST_EMAIL_STORAGE_KEY,
    hasUsableStoredToken,
    isSessionError,
    normalizeDaptinError,
    tokenEmail,
} from '../infra/daptin/daptinClient';
import {
    connectDaptinLive,
    type DaptinLiveEvent
} from '../infra/daptin/daptinLive';
import {
    defaultStarterCollection,
    defaultStarterEntry,
    starterCatalog,
    starterCollectionForEntry,
    starterEntryById,
    STARTER_WORKSPACE_STORAGE_KEY
} from '../app/starterWorkspace/starterCatalog';
import type {StarterCatalogEntry} from '../app/starterWorkspace/types';
import {
    canvasThemeId,
    documentThemeId,
    portalDataForNode
} from '../domain/documentModel';
import {
    initialViewportStatus,
    NestedCanvasWorkspace,
    type ArrangeCanvasMenuRequest,
    type CanvasThemeMenuRequest,
    type NestedCanvasWorkspaceChromeState,
    type NestedCanvasWorkspaceHandle,
    type WorkspaceFileDropRequest,
} from './canvas/nested/NestedCanvasWorkspace';
import {
    describeNode,
    referencedAssetIdsForNode
} from './canvas/nodeRegistry';
import {
    cacheAssetImage,
    hasCachedAssetImage
} from './canvas/imageAssets';
import {
    type CanvasArrangeLayout,
    type CanvasNode,
    type WorldPoint
} from '../domain/types';
import {BuiltInNodeTypes} from '../domain/types';
import type {
    CanvasDocumentCollection,
    CanvasDocumentId,
    CanvasWorkspaceSnapshot,
    DocumentCommand
} from '../domain/documentTypes';
import {saveWorkspaceSnapshot} from '../infra/browser/workspaceStorage';
import {
    createWorkspaceHistory,
    createWorkspaceSnapshot
} from '../domain/workspaceHistory';
import {
    readWorkspaceUrlState,
    replaceWorkspaceUrlState,
    type WorkspaceUrlState
} from '../infra/browser/workspaceUrlLocation';
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
import {HeaderToolbar} from "./HeaderToolbar";
import {hasMetaOrCtrlShortcutModifier, KeyboardShortcutsProvider, useKeyboardShortcut} from "./KeyboardShortcuts";
import "./theme/CanasterFonts";
import {CanasterThemeProvider} from "./theme/CanasterThemeProvider";
import {
    canasterThemeOptions,
    normalizeCanasterThemeId
} from "./theme/CanasterThemeRegistry";
import type {CanasterTheme, CanasterThemeId} from "./theme/CanasterTheme";

const DEFAULT_DOCUMENT_TITLE = 'Canaster Workspace';
const LOCAL_SAVE_MESSAGE = 'Saved on this device';
const ONLINE_READY_MESSAGE = 'Ready to save online';
const SAVED_MESSAGE = 'Saved online';

function canasterMenuWidth() {
    const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue('--canaster-menu-width');
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : 224;
}


type ArrangePanelMenuProps = {
    arrangeMenuPosition: ArrangeMenuPosition | null,
    onSelect: (layout: CanvasArrangeLayout, event: ReactMouseEvent<HTMLButtonElement>) => void
};

type CanvasThemeMenuProps = {
    canInherit: boolean;
    currentThemeId: CanasterThemeId;
    inherited: boolean;
    position: ArrangeMenuPosition | null;
    themes: CanasterTheme[];
    onSelect: (themeId: CanasterThemeId | null, event: ReactMouseEvent<HTMLButtonElement>) => void;
};

type ToolbarMenuTarget = {
    canvasId: CanvasDocumentId;
    metaOrCtrl: boolean;
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
                onClick={(event) => props.onSelect('grid', event)}>
            <LayoutGrid size={16}/>
            <span>
                <strong>Compact</strong>
                <small>Dense balanced packing</small>
              </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem"
                onClick={(event) => props.onSelect('rows', event)}>
            <Rows3 size={16}/>
            <span>
                <strong>Rows</strong>
                <small>Wide left-to-right flow</small>
              </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem"
                onClick={(event) => props.onSelect('columns', event)}>
            <Columns3 size={16}/>
            <span>
                <strong>Columns</strong>
                <small>Tall top-to-bottom flow</small>
              </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem"
                onClick={(event) => props.onSelect('list', event)}>
            <LayoutList size={16}/>
            <span>
                <strong>List</strong>
                <small>Single clean stack</small>
            </span>
        </button>
    </div>;
});

const CanvasThemeMenu = forwardRef<HTMLDivElement, CanvasThemeMenuProps>(function CanvasThemeMenu(props, ref) {
    return <div
        ref={ref}
        className="theme-menu canvas-theme-menu"
        role="menu"
        aria-label="Canvas theme"
        style={props.position ? {
            top : props.position.top,
            left: props.position.left
        } : undefined}
    >
        {props.canInherit ? <button
            className="theme-menu-item"
            type="button"
            role="menuitemradio"
            aria-checked={props.inherited}
            onClick={(event) => props.onSelect(null, event)}
        >
            <span className="theme-menu-swatch inherit" aria-hidden="true">
                <span style={{background: 'var(--canaster-color-canvas-background)'}}/>
                <span style={{background: 'var(--canaster-color-panel-raised)'}}/>
                <span style={{background: 'var(--canaster-color-action-primary)'}}/>
            </span>
            <span className="theme-menu-copy">
                <strong>Inherit theme</strong>
                <small>Use the workspace theme</small>
            </span>
            {props.inherited ? <Check className="theme-menu-check" size={15}/> : null}
        </button> : null}
        {props.themes.map((theme) => {
            const selected = !props.inherited && theme.id === props.currentThemeId;
            return <button
                key={theme.id}
                className="theme-menu-item"
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={(event) => props.onSelect(theme.id, event)}
            >
                <span className="theme-menu-swatch" aria-hidden="true">
                    <span style={{background: theme.colors.canvas.background}}/>
                    <span style={{background: theme.colors.panel.surfaceRaised}}/>
                    <span style={{background: theme.colors.action.primary}}/>
                </span>
                <span className="theme-menu-copy">
                    <strong>{theme.name}</strong>
                    <small>{theme.description}</small>
                </span>
                {selected ? <Check className="theme-menu-check" size={15}/> : null}
            </button>;
        })}
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
    const arrangeMenuRef = useRef<HTMLDivElement | null>(null);
    const canvasThemeMenuRef = useRef<HTMLDivElement | null>(null);
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
    const [accountOpen, setAccountOpen] = useState(false);
    const [arrangeMenuOpen, setArrangeMenuOpen] = useState(false);
    const [arrangeMenuPosition, setArrangeMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [arrangeMenuTarget, setArrangeMenuTarget] = useState<ToolbarMenuTarget | null>(null);
    const [canvasThemeMenuOpen, setCanvasThemeMenuOpen] = useState(false);
    const [canvasThemeMenuPosition, setCanvasThemeMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [canvasThemeMenuTarget, setCanvasThemeMenuTarget] = useState<ToolbarMenuTarget | null>(null);
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
    const activeCanvasTheme = normalizeCanasterThemeId(canvasThemeId(
        chromeState.collection,
        chromeState.collection.activeCanvasId
    ));
    const documentFallbackTheme = normalizeCanasterThemeId(documentThemeId(chromeState.collection));
    const canvasThemeMenuState = canvasToolbarThemeState(
        chromeState.collection,
        canvasThemeMenuTarget?.canvasId ?? chromeState.collection.activeCanvasId
    );

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
        setSidePanelOpen(true);
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
        setSidePanelOpen(true);
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
        const assetIds = imageAssetIdsInCollection(chromeState.collection).filter(
            (assetId) => !hasCachedAssetImage(assetId) && (isLocalAssetId(assetId) || (signedIn && hasUsableStoredToken())));
        if (!assetIds.length) return;
        let canceled = false;
        for (const assetId of assetIds) {
            const loadObject = isLocalAssetId(assetId) ? loadLocalAssetObject(assetId) : loadAssetObject(assetId);
            void loadObject
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

    const startLocalDraftFromCatalog = useCallback(async (entry: StarterCatalogEntry) => {
        const snapshot = createLocalDraftSnapshot(entry);
        await saveWorkspaceSnapshot(snapshot, STARTER_WORKSPACE_STORAGE_KEY);
        window.localStorage.removeItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY);
        ignoreDirtyUntilRef.current = Date.now() + 700;
        lastSavedSnapshotSignatureRef.current = null;
        setActiveDocumentId('');
        setDocumentTitle(entry.title || DEFAULT_DOCUMENT_TITLE);
        setSyncStatus(signedIn ? 'dirty' : 'anonymous');
        setSyncMessage(signedIn ? ONLINE_READY_MESSAGE : LOCAL_SAVE_MESSAGE);
        workspaceRef.current?.replaceWorkspaceSnapshot(snapshot, {
            storageKey : STARTER_WORKSPACE_STORAGE_KEY,
            interaction: `Started ${entry.title || 'workspace'}`,
        });
    }, [signedIn]);

    const handleNewLocalDraft = useCallback(async () => {
        await startLocalDraftFromCatalog(defaultStarterEntry);
    }, [startLocalDraftFromCatalog]);

    const handleStartFromCatalog = useCallback(async (entryId: string) => {
        await startLocalDraftFromCatalog(starterEntryById(entryId));
    }, [startLocalDraftFromCatalog]);

    const handleSaveOnline = useCallback(async () => {
        if (!signedIn) {
            setAuthStep('email');
            setSidePanelOpen(true);
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
            let freshSnapshot = workspaceRef.current?.getWorkspaceSnapshot() ?? snapshot;
            const promoted = await promoteLocalImageAssetsForOnlineSave(freshSnapshot);
            if (promoted.changed) {
                freshSnapshot = promoted.snapshot;
                workspaceRef.current?.replaceWorkspaceSnapshot(freshSnapshot, {
                    interaction: 'Images ready for online save',
                });
            }
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
            setSidePanelOpen(true);
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

    const updateArrangeMenuPositionForRect = useCallback((rect: Pick<DOMRect, 'bottom' | 'right'>) => {
        const margin = 12;
        const menuWidth = canasterMenuWidth();
        const left = Math.max(margin,
            Math.min(window.innerWidth - menuWidth - margin, rect.right - menuWidth));
        const top = Math.max(margin, Math.min(window.innerHeight - 220, rect.bottom + 8));
        setArrangeMenuPosition({
            left,
            top
        });
    }, []);

    const updateCanvasThemeMenuPositionForRect = useCallback((rect: Pick<DOMRect, 'bottom' | 'right'>) => {
        const margin = 12;
        const menuWidth = canasterMenuWidth();
        const left = Math.max(margin,
            Math.min(window.innerWidth - menuWidth - margin, rect.right - menuWidth));
        const top = Math.max(margin, Math.min(window.innerHeight - 280, rect.bottom + 8));
        setCanvasThemeMenuPosition({
            left,
            top
        });
    }, []);

    const updateAddPanelMenuPosition = useCallback(() => {
        const button = addPanelButtonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const margin = 12;
        const menuWidth = canasterMenuWidth();
        const left = Math.max(margin,
            Math.min(window.innerWidth - menuWidth - margin, rect.right - menuWidth));
        const top = Math.max(margin, Math.min(window.innerHeight - 280, rect.bottom + 8));
        setAddPanelMenuPosition({
            left,
            top
        });
    }, []);

    const closeArrangeMenu = useCallback(() => {
        setArrangeMenuOpen(false);
        setArrangeMenuPosition(null);
        setArrangeMenuTarget(null);
    }, []);

    const closeCanvasThemeMenu = useCallback(() => {
        setCanvasThemeMenuOpen(false);
        setCanvasThemeMenuPosition(null);
        setCanvasThemeMenuTarget(null);
    }, []);

    const handleArrangeCanvasMenuRequest = useCallback((request: ArrangeCanvasMenuRequest) => {
        setArrangeMenuTarget({
            canvasId  : request.canvasId,
            metaOrCtrl: request.metaOrCtrl ?? false
        });
        const anchor = request.anchor ?? {x: window.innerWidth - 18, y: window.innerHeight - 18, w: 1, h: 1};
        updateArrangeMenuPositionForRect({
            right : anchor.x + anchor.w,
            bottom: anchor.y + anchor.h,
        });
        setAddPanelMenuOpen(false);
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
        closeCanvasThemeMenu();
        setArrangeMenuOpen(true);
    }, [closeCanvasThemeMenu, updateArrangeMenuPositionForRect]);

    const handleCanvasThemeMenuRequest = useCallback((request: CanvasThemeMenuRequest) => {
        setCanvasThemeMenuTarget({
            canvasId  : request.canvasId,
            metaOrCtrl: request.metaOrCtrl ?? false
        });
        const anchor = request.anchor ?? {x: window.innerWidth - 18, y: window.innerHeight - 18, w: 1, h: 1};
        updateCanvasThemeMenuPositionForRect({
            right : anchor.x + anchor.w,
            bottom: anchor.y + anchor.h,
        });
        closeArrangeMenu();
        setAddPanelMenuOpen(false);
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
        setCanvasThemeMenuOpen(true);
    }, [closeArrangeMenu, updateCanvasThemeMenuPositionForRect]);

    const closeAddPanelMenu = useCallback(() => {
        setAddPanelMenuOpen(false);
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
    }, []);

    const handleToggleAddPanelMenu = useCallback(() => {
        setAddPanelMenuOpen((open) => {
            if (!open) updateAddPanelMenuPosition();
            if (!open) closeArrangeMenu();
            if (!open) closeCanvasThemeMenu();
            if (!open) {
                setAddPanelQuery('');
                setAddPanelActiveIndex(0);
            }
            return !open;
        });
    }, [closeArrangeMenu, closeCanvasThemeMenu, updateAddPanelMenuPosition]);

    const handleArrangeCanvas = useCallback((layout: CanvasArrangeLayout, event: ReactMouseEvent<HTMLButtonElement>) => {
        const target = arrangeMenuTarget;
        const recursive = Boolean(target?.metaOrCtrl) || hasMetaOrCtrlShortcutModifier(event);
        closeArrangeMenu();
        if (!target) return;
        const targetCanvasIds = canvasToolbarTargetCanvasIds(chromeState.collection, target.canvasId, recursive);
        const activeTarget = targetCanvasIds.includes(chromeState.collection.activeCanvasId);
        let changed = false;
        for (const canvasId of targetCanvasIds) {
            changed = (workspaceRef.current?.executeDocumentCommand({
                type    : 'arrange-canvas',
                canvasId,
                layout,
                source: 'nonvisual'
            }) ?? false) || changed;
        }
        if (activeTarget && changed) window.requestAnimationFrame(() => workspaceRef.current?.fitActiveCanvas());
    }, [arrangeMenuTarget, chromeState.collection, closeArrangeMenu]);

    const handleCreatePanel = useCallback((nodeType: string) => {
        workspaceRef.current?.executeActiveCanvasCommand({
            type  : 'create-node',
            nodeType,
            source: 'nonvisual'
        });
        closeAddPanelMenu();
    }, [closeAddPanelMenu]);

    const handleWorkspaceFileDrop = useCallback(async (request: WorkspaceFileDropRequest) => {
        if (request.canvasId !== (workspaceRef.current?.collection().activeCanvasId ?? chromeState.collection.activeCanvasId)) return;
        const imageFiles = request.files.filter((file) => file.type.startsWith('image/'));
        if (!imageFiles.length) {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Drop image files to add images.');
            return;
        }
        setSyncMessage(imageFiles.length > 1 ? `Adding ${imageFiles.length} images` : 'Adding image');
        try {
            const storeOnline = Boolean(activeDocumentId && signedIn && hasUsableStoredToken());
            for (const [index, file] of imageFiles.entries()) {
                const asset = await storeDroppedImage(file, storeOnline);
                await cacheAssetImage(asset.id, asset.objectUrl);
                if (workspaceRef.current?.collection().activeCanvasId !== request.canvasId) {
                    setSyncMessage('Image drop cancelled because the view changed.');
                    return;
                }
                const at = offsetDropPoint(request.at, index);
                workspaceRef.current?.executeActiveCanvasCommand({
                    type    : 'create-node',
                    nodeType: BuiltInNodeTypes.image,
                    source  : 'pointer',
                    at,
                    data    : {
                        assetId: asset.id,
                        alt    : cleanImageName(asset.name),
                        fit    : 'contain',
                        caption: '',
                    },
                });
            }
            workspaceRef.current?.refreshActiveCanvas();
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(error instanceof Error ? error.message : 'Could not add this image.');
        }
    }, [activeDocumentId, chromeState.collection.activeCanvasId, signedIn]);

    const handleCanvasThemeSelect = useCallback((themeId: CanasterThemeId | null, event: ReactMouseEvent<HTMLButtonElement>) => {
        const target = canvasThemeMenuTarget;
        const recursive = Boolean(target?.metaOrCtrl) || hasMetaOrCtrlShortcutModifier(event);
        closeCanvasThemeMenu();
        if (!target) return;
        const commands = canvasToolbarThemeCommands(chromeState.collection, target.canvasId, themeId, recursive);
        for (const command of commands) workspaceRef.current?.executeDocumentCommand(command);
    }, [canvasThemeMenuTarget, chromeState.collection, closeCanvasThemeMenu]);

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
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (arrangeMenuRef.current?.contains(target)) return;
            closeArrangeMenu();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeArrangeMenu();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [arrangeMenuOpen, closeArrangeMenu]);

    useEffect(() => {
        if (!canvasThemeMenuOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (canvasThemeMenuRef.current?.contains(target)) return;
            closeCanvasThemeMenu();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeCanvasThemeMenu();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [canvasThemeMenuOpen, closeCanvasThemeMenu]);

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

    return (<CanasterThemeProvider themeId={activeCanvasTheme}>
    <KeyboardShortcutsProvider>
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
                    onToggleParentContext: () => setParentContextVisible((visible) => !visible)
                }}
                addPanel={{
                    buttonRef: addPanelButtonRef,
                    open     : addPanelMenuOpen,
                    onToggle : handleToggleAddPanelMenu
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
                                                  onSelect={handleArrangeCanvas}/>) : null}
            {canvasThemeMenuOpen ? (<CanvasThemeMenu
                ref={canvasThemeMenuRef}
                canInherit={canvasThemeMenuState.canInherit}
                currentThemeId={canvasThemeMenuState.themeId}
                inherited={canvasThemeMenuState.inherited}
                position={canvasThemeMenuPosition}
                themes={canasterThemeOptions}
                onSelect={handleCanvasThemeSelect}
            />) : null}
            <div className={`workspace-body ${sidePanelOpen ? 'tree-open' : 'tree-closed'}`}>
                {sidePanelOpen ? (<SidePanel
                    tree={viewTree}
                    activeCanvasId={chromeState.collection.activeCanvasId}
                    activeDocumentId={activeDocumentId}
                    account={{
                        authEmail,
                        authOtp,
                        authStep,
                        open             : accountOpen,
                        signedIn,
                        syncMessage,
                        syncStatus,
                        onAuthStepChange : setAuthStep,
                        onClose          : () => setAccountOpen(false),
                        onEmailChange    : handleAuthEmailChange,
                        onOtpChange      : setAuthOtp,
                        onRequestEmailOtp: () => void handleRequestEmailOtp(),
                        onSignOut        : () => void handleSignOut(),
                        onToggle         : () => setAccountOpen((open) => !open),
                        onVerifyEmailOtp : () => void handleVerifyEmailOtp()
                    }}
                    documents={documents}
                    catalogEntries={starterCatalog}
                    saveButtonLabel={saveButtonLabel}
                    signedIn={signedIn}
                    syncMessage={syncMessage}
                    syncStatus={syncStatus}
                    executeDocumentCommand={executeDocumentCommand}
                    onClose={() => setSidePanelOpen(false)}
                    onNewDocument={() => void handleNewLocalDraft()}
                    onOpenAccount={() => {
                        setAuthStep('email');
                        setSidePanelOpen(true);
                        setAccountOpen(true);
                    }}
                    onOpenDocument={(documentRef) => void loadDaptinDocument(documentRef, documents)}
                    onStartFromCatalog={(entryId) => void handleStartFromCatalog(entryId)}
                    onRefreshDocuments={() => void handleRefreshDocuments()}
                    onSaveOnline={() => void handleSaveOnline()}
                />) : null}
                <div className="workspace-canvas-region">
                    <NestedCanvasWorkspace
                        ref={workspaceRef}
                        initialCollection={initialCollection}
                        theme={documentFallbackTheme}
                        parentContextVisible={parentContextVisible}
                        fitOnFirstLoad={fitWorkspaceOnFirstLoad}
                        storageKey={workspaceStorageKey}
                        onCollectionChange={handleWorkspaceCollectionChange}
                        onChromeStateChange={handleChromeStateChange}
                        onArrangeCanvasMenuRequest={handleArrangeCanvasMenuRequest}
                        onCanvasThemeMenuRequest={handleCanvasThemeMenuRequest}
                        onFileDrop={handleWorkspaceFileDrop}
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
                </div>
            </div>
        </section>
    </main>
    </KeyboardShortcutsProvider>
    </CanasterThemeProvider>);
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

async function storeDroppedImage(file: File, online: boolean): Promise<{ id: string; name: string; objectUrl: string }> {
    if (online) {
        const asset = await uploadImageAsset(file);
        return loadAssetObject(asset.id);
    }
    const asset = await saveLocalImageAsset(file);
    return loadLocalAssetObject(asset.id);
}

function offsetDropPoint(point: WorldPoint, index: number): WorldPoint {
    const offset = index * 32;
    return { x: point.x + offset, y: point.y + offset };
}

function cleanImageName(name: string): string {
    return name.replace(/\.[a-z0-9]+$/i, '').trim() || 'Image';
}

function imageAssetIdsInCollection(collection: CanvasDocumentCollection): string[] {
    const ids = new Set<string>();
    for (const document of Object.values(collection.documents)) {
        const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
        if (backgroundAssetId) ids.add(backgroundAssetId);
        for (const node of document.model.nodes) {
            for (const assetId of referencedAssetIdsForNode(node)) ids.add(assetId);
        }
    }
    return [...ids];
}

async function promoteLocalImageAssetsForOnlineSave(
    snapshot: CanvasWorkspaceSnapshot
): Promise<{ snapshot: CanvasWorkspaceSnapshot; changed: boolean }> {
    const localIds = localImageAssetIdsInSnapshot(snapshot);
    if (!localIds.length) return { snapshot, changed: false };
    const promotedIds = new Map<string, string>();
    for (const localId of localIds) {
        const file = await loadLocalAssetFile(localId);
        const asset = await uploadImageAsset(file);
        promotedIds.set(localId, asset.id);
    }
    return {
        snapshot: rewriteSnapshotAssetIds(snapshot, promotedIds),
        changed : promotedIds.size > 0,
    };
}

function localImageAssetIdsInSnapshot(snapshot: CanvasWorkspaceSnapshot): string[] {
    const ids = new Set<string>();
    for (const collection of collectionsInSnapshot(snapshot)) {
        for (const assetId of imageAssetIdsInCollection(collection)) {
            if (isLocalAssetId(assetId)) ids.add(assetId);
        }
    }
    return [...ids];
}

function collectionsInSnapshot(snapshot: CanvasWorkspaceSnapshot): CanvasDocumentCollection[] {
    return [
        snapshot.history.present,
        ...snapshot.history.undoStack,
        ...snapshot.history.redoStack,
    ];
}

function rewriteSnapshotAssetIds(snapshot: CanvasWorkspaceSnapshot, promotedIds: Map<string, string>): CanvasWorkspaceSnapshot {
    const next = structuredClone(snapshot) as CanvasWorkspaceSnapshot;
    for (const collection of collectionsInSnapshot(next)) {
        for (const document of Object.values(collection.documents)) {
            const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
            const promotedBackgroundId = backgroundAssetId ? promotedIds.get(backgroundAssetId) : null;
            if (promotedBackgroundId && document.appearance?.backgroundImage) {
                document.appearance.backgroundImage = {
                    ...document.appearance.backgroundImage,
                    assetId: promotedBackgroundId,
                };
            }
            document.model = {
                ...document.model,
                nodes: document.model.nodes.map((node) => {
                    const assetId = isRecord(node.data) ? stringField(node.data.assetId) : '';
                    const promotedId = promotedIds.get(assetId);
                    return promotedId ? { ...node, data: { ...node.data, assetId: promotedId } } : node;
                }),
            };
        }
    }
    return next;
}

function canvasIdsWithDescendants(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): CanvasDocumentId[] {
    const ids: CanvasDocumentId[] = [];
    const visit = (currentCanvasId: CanvasDocumentId) => {
        if (ids.includes(currentCanvasId) || !collection.documents[currentCanvasId]) return;
        ids.push(currentCanvasId);
        for (const document of Object.values(collection.documents)) {
            if (document.parentCanvasId === currentCanvasId) visit(document.id);
        }
    };
    visit(canvasId);
    return ids;
}

function canvasToolbarTargetCanvasIds(
    collection: CanvasDocumentCollection,
    canvasId: CanvasDocumentId,
    recursive: boolean
): CanvasDocumentId[] {
    if (recursive) return canvasIdsWithDescendants(collection, canvasId);
    return collection.documents[canvasId] ? [canvasId] : [];
}

function canvasToolbarThemeState(
    collection: CanvasDocumentCollection,
    canvasId: CanvasDocumentId
): { canInherit: boolean; inherited: boolean; themeId: CanasterThemeId } {
    const document = collection.documents[canvasId];
    if (!document) return {
        canInherit: false,
        inherited : false,
        themeId   : normalizeCanasterThemeId(documentThemeId(collection))
    };
    const explicitCanvasThemeId = document.appearance?.themeId ?? null;
    return {
        canInherit: canvasId !== collection.rootCanvasId,
        inherited : canvasId !== collection.rootCanvasId && !explicitCanvasThemeId,
        themeId   : normalizeCanasterThemeId(canvasThemeId(collection, canvasId))
    };
}

function canvasToolbarThemeCommands(
    collection: CanvasDocumentCollection,
    canvasId: CanvasDocumentId,
    themeId: CanasterThemeId | null,
    recursive: boolean
): DocumentCommand[] {
    // Bottom-right canvas toolbar actions target canvases only; selected panels do not affect this path.
    return canvasToolbarTargetCanvasIds(collection, canvasId, recursive).map((targetCanvasId) => ({
        type    : 'set-canvas-theme',
        canvasId: targetCanvasId,
        themeId,
        source  : 'nonvisual'
    }));
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

function createLocalDraftSnapshot(entry: StarterCatalogEntry = defaultStarterEntry): CanvasWorkspaceSnapshot {
    return createWorkspaceSnapshot(createWorkspaceHistory(starterCollectionForEntry(entry)), null);
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
