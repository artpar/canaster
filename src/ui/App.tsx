import {
    Bot,
    Check,
    Columns3,
    Copy,
    Download,
    FileText,
    LayoutGrid,
    LayoutList,
    Link2,
    Rows3,
} from 'lucide-react';
import {
    forwardRef,
    type MouseEvent as ReactMouseEvent,
    type MutableRefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import {
    type CanasterDocumentSummary,
    createDocument,
    findDocumentByPublicPath,
    listDocuments,
    loadDocumentDetails,
    requestEmailOtp,
    saveDocument,
    setDocumentVisibility,
    signOut,
    verifyEmailOtp,
} from '../infra/daptin/canasterDocuments';
import {
    type DocumentVisibility,
    documentVisibilityFromPermission
} from '../infra/daptin/documentPermissions';
import {loadAssetObject, uploadImageAsset, uploadWorkspaceAsset} from '../infra/daptin/assets';
import {
    isLocalAssetId,
    loadLocalAssetFile,
    loadLocalAssetObject,
    saveLocalAsset
} from '../infra/browser/localAssets';
import {publicAccountSlugFromIdentity} from '../core/publicAccountSlug';
import {safeDocumentSlug} from '../core/documentSlug';
import {
    embedProviderForUrl,
    embedTitleForUrl,
    normalizeEmbedUrl
} from '../core/embedUrl';
import {
    cleanAssetTitle,
    isImageAssetMime,
    isSupportedWorkspaceAssetFile,
    workspaceAssetKindForFile
} from '../core/workspaceAssetTypes';
import {workspacePreviewAssetFileName} from '../core/workspacePreviewAssetFileName';
import {
    clearDaptinSession,
    DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY,
    DAPTIN_LAST_EMAIL_STORAGE_KEY,
    getDaptinEndpoint,
    getToken,
    hasUsableStoredToken,
    isSessionError,
    normalizeDaptinError,
    tokenEmail,
    tokenName,
} from '../infra/daptin/daptinClient';
import {
    connectDaptinLive,
    type DaptinLiveEvent
} from '../infra/daptin/daptinLive';
import {createDaptinAgentLiveTransport} from '../infra/daptin/createDaptinAgentLiveTransport';
import {createBrowserCanasterAgentTimer} from '../infra/browser/createBrowserCanasterAgentTimer';
import {createAgentAccessBrief} from '../app/agentAccess/createAgentAccessBrief';
import {
    connectCanasterAgentBridge,
    type CanasterAgentBridgeConnection
} from '../app/agentBridge/CanasterAgentBridge';
import {agentTopicName} from '../app/agentBridge/AgentProtocol';
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
    portalDataForNode,
    setWorkspaceSnapshotPreviewImage
} from '../domain/documentModel';
import {
    initialViewportStatus,
    NestedCanvasWorkspace,
    type ArrangeCanvasMenuRequest,
    type CanvasAddPanelMenuRequest,
    type CanvasThemeMenuRequest,
    type NestedCanvasWorkspaceChromeState,
    type NestedCanvasWorkspaceHandle,
    type WorkspaceFileDropRequest,
    type WorkspaceTextPasteRequest,
} from './canvas/nested/NestedCanvasWorkspace';
import {
    describeNode,
    referencedAssetIdsForNode
} from './canvas/nodeRegistry';
import {createCanasterAgentNodeMetadata} from './agentBridge/createCanasterAgentNodeMetadata';
import {createNestedWorkspaceAgentWorkspace} from './agentBridge/createNestedWorkspaceAgentWorkspace';
import {
    cacheAssetImage,
    hasCachedAssetImage
} from './canvas/imageAssets';
import {
    type CanvasArrangeLayout,
    type CanvasNode,
    type NodeData,
    type WorldPoint
} from '../domain/types';
import {BuiltInNodeTypes} from '../domain/types';
import type {
    CanvasDocumentCollection,
    CanvasDocumentId,
    CanvasWorkspacePreviewImage,
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
    shareDocumentUrl,
    type WorkspaceUrlState
} from '../infra/browser/workspaceUrlLocation';
import {
    AddPanelPopover,
    PANEL_CREATE_OPTIONS
} from "./AddPanelPopover";
import {AccountPopover} from "./AccountPopover";
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
const SIGN_IN_SAVE_MESSAGE = 'Sign in to save online';
const AGENT_LIVE_TRANSPORT = createDaptinAgentLiveTransport();
const AGENT_NODE_METADATA = createCanasterAgentNodeMetadata();
const AGENT_TIMER = createBrowserCanasterAgentTimer();
const MENU_VIEWPORT_MARGIN = 12;
const MENU_ANCHOR_GAP = 8;
const DEFAULT_ADD_PANEL_MENU_HEIGHT = 560;
const DEFAULT_ADD_PANEL_MENU_WIDTH = 360;
const DEFAULT_EXPORT_MENU_HEIGHT = 228;

function canasterMenuWidth() {
    const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue('--canaster-menu-width');
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : 224;
}

function clampedAddPanelMenuWidth() {
    return Math.max(0, Math.min(DEFAULT_ADD_PANEL_MENU_WIDTH, window.innerWidth - MENU_VIEWPORT_MARGIN * 2));
}

function anchoredMenuPosition(
    rect: Pick<DOMRect, 'bottom' | 'right' | 'top'>,
    menuHeight: number,
    menuWidth = canasterMenuWidth(),
): ArrangeMenuPosition {
    const margin = MENU_VIEWPORT_MARGIN;
    const left = Math.max(margin,
        Math.min(window.innerWidth - menuWidth - margin, rect.right - menuWidth));
    const lowestTop = Math.max(margin, window.innerHeight - menuHeight - margin);
    const belowTop = rect.bottom + MENU_ANCHOR_GAP;
    const aboveTop = rect.top - menuHeight - MENU_ANCHOR_GAP;
    return {
        left,
        top: belowTop <= lowestTop ? Math.max(margin, belowTop) : Math.max(margin, Math.min(lowestTop, aboveTop)),
    };
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

type ExportMenuProps = {
    agentAccessDisabled: boolean;
    agentAccessHint: string;
    copyImageDisabled: boolean;
    position: ArrangeMenuPosition | null;
    onCopyAgentAccess: () => void;
    onCopyDocument: () => void;
    onCopyImage: () => void;
    onCopyLink: () => void;
    onSaveImage: () => void;
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

const ExportMenu = forwardRef<HTMLDivElement, ExportMenuProps>(function ExportMenu(props, ref) {
    return <div
        ref={ref}
        className="arrange-menu export-menu"
        role="menu"
        aria-label="Export workspace"
        style={props.position ? {
            top : props.position.top,
            left: props.position.left
        } : undefined}
    >
        <button
            className="arrange-menu-item"
            type="button"
            role="menuitem"
            disabled={props.copyImageDisabled}
            onClick={props.onCopyImage}
        >
            <Copy size={16}/>
            <span>
                <strong>Copy as image</strong>
                <small>PNG to clipboard</small>
            </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem" onClick={props.onSaveImage}>
            <Download size={16}/>
            <span>
                <strong>Save image</strong>
                <small>Download PNG</small>
            </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem" onClick={props.onCopyLink}>
            <Link2 size={16}/>
            <span>
                <strong>Copy link</strong>
                <small>Current workspace URL</small>
            </span>
        </button>
        <button className="arrange-menu-item" type="button" role="menuitem" onClick={props.onCopyDocument}>
            <FileText size={16}/>
            <span>
                <strong>Copy document</strong>
                <small>Workspace JSON</small>
            </span>
        </button>
        <button
            className="arrange-menu-item"
            type="button"
            role="menuitem"
            disabled={props.agentAccessDisabled}
            title={props.agentAccessHint}
            onClick={props.onCopyAgentAccess}
        >
            <Bot size={16}/>
            <span>
                <strong>Copy for agent</strong>
                <small>{props.agentAccessHint}</small>
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
    const arrangeMenuRef = useRef<HTMLDivElement | null>(null);
    const canvasThemeMenuRef = useRef<HTMLDivElement | null>(null);
    const exportMenuButtonRef = useRef<HTMLButtonElement | null>(null);
    const exportMenuRef = useRef<HTMLDivElement | null>(null);
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
    const preserveShareUrlRef = useRef(Boolean(initialUrlStateRef.current?.shareUsername && initialUrlStateRef.current.shareSlug));
    const documentOpenRequestIdRef = useRef(0);
    const ignoreActiveDocumentLiveUntilRef = useRef<{ documentRef: string; until: number } | null>(null);
    const [accountOpen, setAccountOpen] = useState(false);
    const [arrangeMenuOpen, setArrangeMenuOpen] = useState(false);
    const [arrangeMenuPosition, setArrangeMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [arrangeMenuTarget, setArrangeMenuTarget] = useState<ToolbarMenuTarget | null>(null);
    const [canvasThemeMenuOpen, setCanvasThemeMenuOpen] = useState(false);
    const [canvasThemeMenuPosition, setCanvasThemeMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [canvasThemeMenuTarget, setCanvasThemeMenuTarget] = useState<ToolbarMenuTarget | null>(null);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [exportMenuPosition, setExportMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [addPanelMenuOpen, setAddPanelMenuOpen] = useState(false);
    const [addPanelMenuPosition, setAddPanelMenuPosition] = useState<ArrangeMenuPosition | null>(null);
    const [addPanelMenuTarget, setAddPanelMenuTarget] = useState<CanvasAddPanelMenuRequest | null>(null);
    const [addPanelQuery, setAddPanelQuery] = useState('');
    const [addPanelActiveIndex, setAddPanelActiveIndex] = useState(0);
    const [sidePanelOpen, setSidePanelOpen] = useState(() => window.matchMedia('(min-width: 641px)').matches);
    const [workspaceToast, setWorkspaceToast] = useState<WorkspaceToast>(null);
    const [authStep, setAuthStep] = useState<AuthStep>('email');
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
    const documentTitleRef = useRef(documentTitle);
    const documentsRef = useRef(documents);
    const signedInRef = useRef(signedIn);
    const syncMessageRef = useRef(syncMessage);
    const syncStatusRef = useRef(syncStatus);
    const agentBridgeRef = useRef<CanasterAgentBridgeConnection | null>(null);
    const agentPageIdRef = useRef(crypto.randomUUID());
    const agentStateVersionRef = useRef(1);
    const lastAgentStateSignatureRef = useRef('');
    const lastAgentVersionSignatureRef = useRef('');
    const suppressNextAgentStateEffectRef = useRef(false);
    const suppressNextAgentStateTimerRef = useRef<number | null>(null);
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
    const chromeStateRef = useRef(chromeState);
    const parentContextVisible = chromeState.collection.view.parentContextVisible ?? true;
    const activeCanvasTheme = normalizeCanasterThemeId(canvasThemeId(
        chromeState.collection,
        chromeState.collection.activeCanvasId
    ));
    const documentFallbackTheme = normalizeCanasterThemeId(documentThemeId(chromeState.collection));
    const canvasThemeMenuState = canvasToolbarThemeState(
        chromeState.collection,
        canvasThemeMenuTarget?.canvasId ?? chromeState.collection.activeCanvasId
    );
    const activeDocument = useMemo(
        () => documents.find((document) => document.id === activeDocumentId) ?? null,
        [activeDocumentId, documents]
    );
    const activeDocumentVisibility = activeDocument ? documentVisibilityFromPermission(activeDocument.permission) : null;
    const currentPublicOwner = signedIn
        ? publicAccountSlugFromIdentity(nameFromStoredToken(), authEmail || emailFromStoredToken())
        : '';
    const activeDocumentEditable = Boolean(activeDocument && currentPublicOwner &&
        activeDocument.publicOwner === currentPublicOwner);
    const viewportControlMenuState = useMemo(() => {
        if (arrangeMenuOpen && arrangeMenuTarget) {
            return {
                canvasId: arrangeMenuTarget.canvasId,
                control : 'arrange' as const,
            };
        }
        if (canvasThemeMenuOpen && canvasThemeMenuTarget) {
            return {
                canvasId: canvasThemeMenuTarget.canvasId,
                control : 'theme' as const,
            };
        }
        return null;
    }, [arrangeMenuOpen, arrangeMenuTarget, canvasThemeMenuOpen, canvasThemeMenuTarget]);

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
        if (pending.documentId && pending.documentId !== documentRef) return false;
        pendingUrlStateRef.current = null;
        urlStateReadyRef.current = true;
        return workspaceRef.current?.openWorkspaceUrlState(pending) ?? false;
    }, []);

    const replaceCurrentWorkspaceUrl = useCallback((documentRef: string | null) => {
        if (preserveShareUrlRef.current) return;
        const state = workspaceRef.current?.currentWorkspaceUrlState(documentRef);
        if (state) replaceWorkspaceUrlState(state);
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
        documentTitleRef.current = documentTitle;
    }, [documentTitle]);

    useEffect(() => {
        documentsRef.current = documents;
    }, [documents]);

    useEffect(() => {
        signedInRef.current = signedIn;
    }, [signedIn]);

    useEffect(() => {
        syncMessageRef.current = syncMessage;
    }, [syncMessage]);

    useEffect(() => {
        syncStatusRef.current = syncStatus;
    }, [syncStatus]);

    useEffect(() => {
        chromeStateRef.current = chromeState;
    }, [chromeState]);

    const currentAgentStateSignature = useCallback(() => {
        const fallback = chromeStateRef.current;
        const collection = workspaceRef.current?.collection() ?? fallback.collection;
        const activeCanvasId = collection.activeCanvasId;
        return snapshotSignature({
            activeDocumentId: activeDocumentIdRef.current,
            activeCanvasId,
            camera          : collection.view.cameras[activeCanvasId] ?? null,
            collection,
            documentTitle   : documentTitleRef.current,
            selection       : collection.view.selections[activeCanvasId] ?? null,
            syncMessage     : syncMessageRef.current,
            syncStatus      : syncStatusRef.current,
        });
    }, []);

    const bumpAgentStateVersion = useCallback(() => {
        agentStateVersionRef.current += 1;
        suppressNextAgentStateEffectRef.current = true;
        if (suppressNextAgentStateTimerRef.current !== null) window.clearTimeout(suppressNextAgentStateTimerRef.current);
        suppressNextAgentStateTimerRef.current = window.setTimeout(() => {
            suppressNextAgentStateEffectRef.current = false;
            suppressNextAgentStateTimerRef.current = null;
        }, 1000);
        const signature = currentAgentStateSignature();
        lastAgentStateSignatureRef.current = signature;
        lastAgentVersionSignatureRef.current = signature;
        return agentStateVersionRef.current;
    }, [currentAgentStateSignature]);

    const refreshAgentStateVersion = useCallback(() => {
        const signature = currentAgentStateSignature();
        if (signature !== lastAgentVersionSignatureRef.current) {
            agentStateVersionRef.current += 1;
            lastAgentVersionSignatureRef.current = signature;
        }
        return agentStateVersionRef.current;
    }, [currentAgentStateSignature]);

    useEffect(() => {
        const selection = chromeState.collection.view.selections[chromeState.collection.activeCanvasId] ?? null;
        const camera = chromeState.collection.view.cameras[chromeState.collection.activeCanvasId] ?? null;
        const signature = currentAgentStateSignature();
        if (signature === lastAgentStateSignatureRef.current) return;
        if (suppressNextAgentStateEffectRef.current) {
            suppressNextAgentStateEffectRef.current = false;
            if (suppressNextAgentStateTimerRef.current !== null) {
                window.clearTimeout(suppressNextAgentStateTimerRef.current);
                suppressNextAgentStateTimerRef.current = null;
            }
            if (signature !== lastAgentVersionSignatureRef.current) {
                agentStateVersionRef.current += 1;
                lastAgentVersionSignatureRef.current = signature;
            }
        } else {
            if (signature !== lastAgentVersionSignatureRef.current) {
                agentStateVersionRef.current += 1;
                lastAgentVersionSignatureRef.current = signature;
            }
        }
        lastAgentStateSignatureRef.current = signature;
        agentBridgeRef.current?.emitEvent('workspace.changed', {
            activeCanvasId: chromeState.collection.activeCanvasId,
            title: documentTitle,
        });
        agentBridgeRef.current?.emitEvent('selection.changed', {
            activeCanvasId: chromeState.collection.activeCanvasId,
            selection,
        });
        agentBridgeRef.current?.emitEvent('view.changed', {
            activeCanvasId: chromeState.collection.activeCanvasId,
            camera,
        });
        agentBridgeRef.current?.emitEvent('sync.changed', {
            message: syncMessage,
            status: syncStatus,
        });
    }, [activeDocumentId, chromeState, documentTitle, syncMessage, syncStatus]);

    useEffect(() => {
        const pending = pendingUrlStateRef.current;
        if ((!pending?.documentId && !pending?.shareUsername) || signedIn) return;
        setAuthStep('email');
        setSidePanelOpen(true);
        setAccountOpen(true);
        setSyncStatus('anonymous');
        setSyncMessage('Sign in to open shared workspace');
    }, [signedIn]);

    useEffect(() => {
        const pending = pendingUrlStateRef.current;
        if (!pending || pending.documentId || pending.shareUsername || !chromeState.storageReady) return;
        applyPendingUrlState(null);
    }, [applyPendingUrlState, chromeState.collection, chromeState.storageReady]);

    useEffect(() => {
        if (preserveShareUrlRef.current) return;
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
        documentOpenRequestIdRef.current += 1;
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
        replaceCurrentWorkspaceUrl(null);
    }, [replaceCurrentWorkspaceUrl]);

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

    const openDaptinDocument = useCallback(
        async (
            documentRef: string,
            knownDocuments: CanasterDocumentSummary[] = [],
            options: { preserveUrl?: boolean } = {},
        ) => {
            if (!documentRef) throw new Error('No saved workspace is open.');
            const openRequestId = documentOpenRequestIdRef.current + 1;
            documentOpenRequestIdRef.current = openRequestId;
            setSyncStatus('loading');
            setSyncMessage('Opening workspace');
            const loadedDocument = await loadDocumentDetails(documentRef);
            if (openRequestId !== documentOpenRequestIdRef.current) return;
            const snapshot = loadedDocument.snapshot;
            const title = knownDocuments.find((document) => document.id === documentRef)?.title ??
                loadedDocument.title ?? titleFromSnapshot(snapshot);
            const nextStorageKey = remoteWorkspaceStorageKey(documentRef);
            await saveWorkspaceSnapshot(snapshot, nextStorageKey);
            if (openRequestId !== documentOpenRequestIdRef.current) return;
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
            preserveShareUrlRef.current = Boolean(options.preserveUrl);
            replaceCurrentWorkspaceUrl(documentRef);
            window.setTimeout(() => {
                if (openRequestId !== documentOpenRequestIdRef.current) return;
                const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
                if (currentSnapshot && snapshotSignature(currentSnapshot) ===
                    lastSavedSnapshotSignatureRef.current) {
                    setSyncStatus('clean');
                    setSyncMessage(SAVED_MESSAGE);
                }
            }, 1600);
        }, [applyPendingUrlState, replaceCurrentWorkspaceUrl]);

    const loadDaptinDocument = useCallback(
        async (
            documentRef: string,
            knownDocuments: CanasterDocumentSummary[] = [],
            options: { preserveUrl?: boolean } = {},
        ) => {
            try {
                await openDaptinDocument(documentRef, knownDocuments, options);
            } catch (error) {
                if (await recoverSessionError(error)) return;
                setSyncStatus('error');
                setSyncMessage(workspaceErrorMessage(error, 'open'));
            }
        }, [openDaptinDocument, recoverSessionError]);

    useEffect(() => {
        if (!signedIn) return;
        let canceled = false;
        setSyncStatus('loading');
        setSyncMessage('Checking saved workspaces');
        const pendingShare = pendingUrlStateRef.current?.shareUsername && pendingUrlStateRef.current.shareSlug
            ? {
                username: pendingUrlStateRef.current.shareUsername,
                slug    : pendingUrlStateRef.current.shareSlug,
            }
            : null;
        if (pendingShare) {
            refreshDocuments()
                .then(async (rows) => {
                    if (canceled) return;
                    const listed = rows.find((document) => document.publicOwner === pendingShare.username &&
                        document.slug === pendingShare.slug);
                    const sharedDocument = listed ?? await findDocumentByPublicPath(pendingShare.username, pendingShare.slug);
                    if (canceled) return;
                    if (!sharedDocument) {
                        setSyncStatus('error');
                        setSyncMessage('That shared workspace was not found. Check the link or sign in with another account.');
                        return;
                    }
                    await loadDaptinDocument(sharedDocument.id, listed ? rows : [sharedDocument, ...rows], {
                        preserveUrl: true,
                    });
                })
                .catch((error) => {
                    if (canceled) return;
                    void recoverSessionError(error).then((recovered) => {
                        if (recovered || canceled) return;
                        setSyncStatus('error');
                        setSyncMessage(workspaceErrorMessage(error, 'open'));
                    });
                });
            return () => {
                canceled = true;
            };
        }
        const restoredDocumentId = pendingUrlStateRef.current?.documentId || activeDocumentId ||
            window.localStorage.getItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY) || '';
        if (restoredDocumentId) {
            const restoredDocumentAlreadyLoaded = restoredDocumentId === activeDocumentId &&
                Boolean(lastSavedSnapshotSignatureRef.current);
            if (!restoredDocumentAlreadyLoaded) {
                void loadDaptinDocument(restoredDocumentId, [], {
                    preserveUrl: preserveShareUrlRef.current,
                });
            }
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
    }, [activeDocumentId, loadDaptinDocument, recoverSessionError, refreshDocuments, signedIn]);

    useEffect(() => {
        const handlePopState = () => {
            const nextUrlState = readWorkspaceUrlState();
            pendingUrlStateRef.current = nextUrlState;
            urlStateReadyRef.current = !nextUrlState;
            preserveShareUrlRef.current = Boolean(nextUrlState?.shareUsername && nextUrlState.shareSlug);
            if (!nextUrlState) {
                urlStateReadyRef.current = true;
                return;
            }
            if (nextUrlState.documentId) {
                if (!signedInRef.current) {
                    setAuthStep('email');
                    setSidePanelOpen(true);
                    setAccountOpen(true);
                    setSyncStatus('anonymous');
                    setSyncMessage('Sign in to open saved workspace');
                    return;
                }
                if (nextUrlState.documentId === activeDocumentIdRef.current) {
                    applyPendingUrlState(nextUrlState.documentId);
                    return;
                }
                void loadDaptinDocument(nextUrlState.documentId, documentsRef.current);
                return;
            }
            if (!nextUrlState.shareUsername || !nextUrlState.shareSlug) {
                if (!activeDocumentIdRef.current) applyPendingUrlState(null);
                return;
            }
            if (!signedInRef.current) {
                setAuthStep('email');
                setSidePanelOpen(true);
                setAccountOpen(true);
                setSyncStatus('anonymous');
                setSyncMessage('Sign in to open shared workspace');
                return;
            }
            const urlOpenRequestId = documentOpenRequestIdRef.current + 1;
            documentOpenRequestIdRef.current = urlOpenRequestId;
            setSyncStatus('loading');
            setSyncMessage('Opening workspace');
            void refreshDocuments()
                .then(async (rows) => {
                    if (urlOpenRequestId !== documentOpenRequestIdRef.current) return;
                    const listed = rows.find((document) => document.publicOwner === nextUrlState.shareUsername &&
                        document.slug === nextUrlState.shareSlug);
                    const sharedDocument = listed ??
                        await findDocumentByPublicPath(nextUrlState.shareUsername ?? '', nextUrlState.shareSlug ?? '');
                    if (urlOpenRequestId !== documentOpenRequestIdRef.current) return;
                    if (!sharedDocument) {
                        setSyncStatus('error');
                        setSyncMessage('That shared workspace was not found. Check the link or sign in with another account.');
                        return;
                    }
                    await loadDaptinDocument(sharedDocument.id, listed ? rows : [sharedDocument, ...rows], {
                        preserveUrl: true,
                    });
                })
                .catch((error) => {
                    if (urlOpenRequestId !== documentOpenRequestIdRef.current) return;
                    void recoverSessionError(error).then((recovered) => {
                        if (recovered) return;
                        setSyncStatus('error');
                        setSyncMessage(workspaceErrorMessage(error, 'open'));
                    });
                });
        };
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [applyPendingUrlState, loadDaptinDocument, recoverSessionError, refreshDocuments]);

    const handleDocumentLiveEvent = useCallback(async (event: DaptinLiveEvent) => {
        if (event.topic !== 'document') return;
        try {
            const rows = await refreshDocuments();
            const liveDocumentRef = liveDocumentId(event);
            const currentDocumentRef = activeDocumentIdRef.current;
            const ignoredLiveUpdate = ignoreActiveDocumentLiveUntilRef.current;
            if (ignoredLiveUpdate && Date.now() > ignoredLiveUpdate.until) {
                ignoreActiveDocumentLiveUntilRef.current = null;
            }
            if (ignoredLiveUpdate && liveDocumentRef === ignoredLiveUpdate.documentRef &&
                Date.now() <= ignoredLiveUpdate.until) {
                return;
            }
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
        documentOpenRequestIdRef.current += 1;
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
        preserveShareUrlRef.current = false;
        replaceCurrentWorkspaceUrl(null);
    }, [replaceCurrentWorkspaceUrl]);

    const startLocalDraftFromCatalog = useCallback(async (entry: StarterCatalogEntry) => {
        documentOpenRequestIdRef.current += 1;
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
        preserveShareUrlRef.current = false;
        replaceCurrentWorkspaceUrl(null);
    }, [replaceCurrentWorkspaceUrl, signedIn]);

    const handleNewLocalDraft = useCallback(async () => {
        await startLocalDraftFromCatalog(defaultStarterEntry);
    }, [startLocalDraftFromCatalog]);

    const handleStartFromCatalog = useCallback(async (entryId: string) => {
        await startLocalDraftFromCatalog(starterEntryById(entryId));
    }, [startLocalDraftFromCatalog]);

    const saveOnlineDocument = useCallback(async () => {
        if (!signedIn) {
            setAuthStep('email');
            setSidePanelOpen(true);
            setAccountOpen(true);
            setSyncStatus('anonymous');
            setSyncMessage(SIGN_IN_SAVE_MESSAGE);
            throw new Error(SIGN_IN_SAVE_MESSAGE);
        }
        const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
        if (!snapshot) {
            setSyncStatus('error');
            setSyncMessage('Workspace is not ready yet');
            throw new Error('Workspace is not ready yet');
        }
        setSyncStatus('saving');
        setSyncMessage('Saving workspace');
        await workspaceRef.current?.flushWorkspaceSnapshot();
        const publicOwner = publicAccountSlugFromIdentity(nameFromStoredToken(), authEmail || emailFromStoredToken());
        if (!publicOwner) throw new Error('Sign in again before saving this workspace online.');
        let freshSnapshot = workspaceRef.current?.getWorkspaceSnapshot() ?? snapshot;
        const promoted = await promoteLocalAssetsForOnlineSave(freshSnapshot);
        if (promoted.changed) {
            freshSnapshot = promoted.snapshot;
            workspaceRef.current?.replaceWorkspaceSnapshot(freshSnapshot, {
                interaction: 'Files ready for online save',
            });
        }
        setSyncMessage('Preparing workspace preview');
        const previewCapture = await workspaceRef.current?.captureActiveCanvasPreview();
        if (!previewCapture) throw new Error('Workspace preview is not ready yet');
        setSyncMessage('Uploading workspace preview');
        const previewImage = await uploadWorkspacePreviewImage(previewCapture, documentTitle);
        freshSnapshot = setWorkspaceSnapshotPreviewImage(freshSnapshot, previewImage);
        let savedDocumentRef = activeDocumentId;
        if (activeDocumentId) {
            await saveDocument(activeDocumentId, freshSnapshot, documentTitle, publicOwner);
            await saveWorkspaceSnapshot(freshSnapshot, remoteWorkspaceStorageKey(activeDocumentId));
        } else {
            const documentRef = await createDocument(documentTitle, freshSnapshot, publicOwner);
            await saveWorkspaceSnapshot(freshSnapshot, remoteWorkspaceStorageKey(documentRef));
            window.localStorage.setItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY, documentRef);
            setActiveDocumentId(documentRef);
            savedDocumentRef = documentRef;
        }
        ignoreDirtyUntilRef.current = Date.now() + 1200;
        workspaceRef.current?.replaceWorkspaceSnapshot(freshSnapshot, {
            interaction: 'Workspace preview saved',
            persist    : false,
        });
        lastSavedSnapshotSignatureRef.current = snapshotSignature(freshSnapshot);
        if (savedDocumentRef) replaceCurrentWorkspaceUrl(savedDocumentRef);
        await refreshDocuments();
        setSyncStatus('clean');
        setSyncMessage(SAVED_MESSAGE);
    }, [activeDocumentId, authEmail, documentTitle, refreshDocuments, replaceCurrentWorkspaceUrl, signedIn]);

    const handleSaveOnline = useCallback(async () => {
        try {
            await saveOnlineDocument();
        } catch (error) {
            if (error instanceof Error && error.message === SIGN_IN_SAVE_MESSAGE) return;
            if (await recoverSessionError(error)) return;
            setSyncStatus('error');
            setSyncMessage(workspaceErrorMessage(error, 'save'));
        }
    }, [recoverSessionError, saveOnlineDocument]);

    const handleDownloadPreview = useCallback(async () => {
        try {
            const previewCapture = await workspaceRef.current?.captureActiveCanvasPreview();
            if (!previewCapture) throw new Error('Workspace preview is not ready yet');
            downloadBlob(previewCapture.blob, previewImageFileName(documentTitle));
        } catch {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Could not download workspace preview.');
        }
    }, [documentTitle]);

    const handleCopyPreview = useCallback(async () => {
        try {
            await copyPngCaptureToClipboard(() => workspaceRef.current?.captureActiveCanvasPreview() ?? Promise.resolve(null));
            setSyncMessage('Workspace preview copied');
        } catch {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Could not copy workspace preview.');
        }
    }, []);

    const handleCopyWorkspaceLink = useCallback(async () => {
        try {
            if (!activeDocumentId) throw new Error('Save online before copying a workspace link.');
            if (activeDocumentVisibility !== 'public') {
                throw new Error('Make this workspace public before copying a share link.');
            }
            const publicOwner = publicAccountSlugFromIdentity(nameFromStoredToken(), authEmail || emailFromStoredToken());
            if (!publicOwner) throw new Error('Sign in again before copying a workspace link.');
            await copyTextToClipboard(shareDocumentUrl(publicOwner, safeDocumentSlug(documentTitle)));
            setSyncMessage('Workspace link copied');
        } catch (error) {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage(error instanceof Error ? error.message : 'Could not copy workspace link.');
        }
    }, [activeDocumentId, activeDocumentVisibility, authEmail, documentTitle]);

    const handleSetDocumentVisibility = useCallback(async (visibility: DocumentVisibility) => {
        if (!signedIn) {
            setAuthStep('email');
            setSidePanelOpen(true);
            setAccountOpen(true);
            setSyncStatus('anonymous');
            setSyncMessage('Sign in before changing workspace visibility');
            return;
        }
        if (!activeDocumentId) {
            setSyncStatus('anonymous');
            setSyncMessage('Save online before changing workspace visibility');
            return;
        }
        if (!activeDocumentEditable) {
            setSyncStatus('error');
            setSyncMessage('Only the owner can change workspace visibility');
            return;
        }
        if (activeDocumentVisibility === visibility) return;
        const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
        const hasUnsavedWorkspaceChanges = syncStatusRef.current === 'dirty' ||
            Boolean(currentSnapshot && snapshotSignature(currentSnapshot) !== lastSavedSnapshotSignatureRef.current);
        setSyncStatus('saving');
        setSyncMessage(visibility === 'public' ? 'Making workspace public' : 'Making workspace private');
        try {
            ignoreActiveDocumentLiveUntilRef.current = { documentRef: activeDocumentId, until: Date.now() + 10000 };
            await setDocumentVisibility(activeDocumentId, visibility);
            ignoreActiveDocumentLiveUntilRef.current = { documentRef: activeDocumentId, until: Date.now() + 10000 };
            await refreshDocuments();
            if (hasUnsavedWorkspaceChanges) {
                setSyncStatus('dirty');
                setSyncMessage(visibility === 'public'
                    ? 'Workspace is public. Unsaved online changes'
                    : 'Workspace is private. Unsaved online changes');
            } else {
                setSyncStatus('clean');
                setSyncMessage(visibility === 'public' ? 'Workspace is public' : 'Workspace is private');
            }
        } catch (error) {
            if (await recoverSessionError(error)) return;
            setSyncStatus('error');
            const fallback = visibility === 'public'
                ? 'Could not make this workspace public. Check access and try again.'
                : 'Could not make this workspace private. Check access and try again.';
            const apiError = normalizeDaptinError(error, fallback);
            setSyncMessage(apiError.kind === 'permission'
                ? 'Only the owner can change workspace visibility'
                : apiError.message || fallback);
        }
    }, [activeDocumentEditable, activeDocumentId, activeDocumentVisibility, recoverSessionError, refreshDocuments, signedIn]);

    const handleCopyWorkspaceDocument = useCallback(async () => {
        try {
            const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
            if (!snapshot) throw new Error('Workspace is not ready yet');
            await copyTextToClipboard(JSON.stringify(snapshot, null, 2));
            setSyncMessage('Workspace document copied');
        } catch {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Could not copy workspace document.');
        }
    }, []);

    const handleCopyAgentAccess = useCallback(async () => {
        try {
            if (!signedIn) throw new Error('Sign in before copying agent access');
            if (!activeDocumentId) throw new Error('Save online before copying agent access');
            if (syncStatus !== 'clean') throw new Error('Save online before copying agent access');
            if (!hasUsableStoredToken()) throw new Error('Sign in again before copying agent access');
            const token = getToken();
            if (!token) throw new Error('Sign in again before copying agent access');
            const savedDocument = documents.find((document) => document.id === activeDocumentId);
            const state = workspaceRef.current?.currentWorkspaceUrlState(activeDocumentId);
            const agentTopic = agentTopicName(activeDocumentId, agentPageIdRef.current);
            if (state) replaceWorkspaceUrlState(state);
            await copyTextToClipboard(createAgentAccessBrief({
                appUrl        : window.location.href,
                daptinEndpoint: getDaptinEndpoint(),
                documentId    : activeDocumentId,
                documentPath  : savedDocument?.path ?? '',
                documentTitle,
                agentTopic,
                token,
            }));
            setSyncMessage('Agent access copied');
        } catch (error) {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage(error instanceof Error ? error.message : 'Could not copy agent access.');
        }
    }, [activeDocumentId, documentTitle, documents, signedIn, syncStatus]);

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

    useEffect(() => {
        if (!signedIn || !activeDocumentId || !hasUsableStoredToken()) {
            agentBridgeRef.current?.close();
            agentBridgeRef.current = null;
            return;
        }
        const bridge = connectCanasterAgentBridge({
            appUrl       : () => window.location.href,
            bumpStateVersion: bumpAgentStateVersion,
            documentId   : activeDocumentId,
            documentTitle: () => documentTitleRef.current,
            liveTransport: AGENT_LIVE_TRANSPORT,
            nodeMetadata : AGENT_NODE_METADATA,
            topicName    : agentTopicName(activeDocumentId, agentPageIdRef.current),
            reloadDocument: async () => {
                const documentRef = activeDocumentIdRef.current;
                if (!documentRef) throw new Error('No saved workspace is open.');
                const rows = documentsRef.current.length ? documentsRef.current : await refreshDocuments();
                await openDaptinDocument(documentRef, rows);
            },
            saveOnline: async () => {
                await saveOnlineDocument();
                agentBridgeRef.current?.emitEvent('document.saved', {
                    documentId: activeDocumentIdRef.current,
                });
            },
            stateVersion: refreshAgentStateVersion,
            syncState   : () => ({
                message : syncMessageRef.current,
                signedIn: signedInRef.current,
                status  : syncStatusRef.current,
            }),
            timer: AGENT_TIMER,
            workspace: () => workspaceRef.current ? createNestedWorkspaceAgentWorkspace(workspaceRef.current) : null,
        });
        agentBridgeRef.current = bridge;
        return () => {
            if (agentBridgeRef.current === bridge) agentBridgeRef.current = null;
            bridge.close();
        };
    }, [activeDocumentId, bumpAgentStateVersion, openDaptinDocument, refreshAgentStateVersion, refreshDocuments, saveOnlineDocument, signedIn]);

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

    const updateAddPanelMenuPositionForRect = useCallback((rect: Pick<DOMRect, 'bottom' | 'right' | 'top'>) => {
        const menuRect = addPanelMenuRef.current?.getBoundingClientRect();
        const menuHeight = menuRect?.height ?? DEFAULT_ADD_PANEL_MENU_HEIGHT;
        const menuWidth = menuRect?.width ?? clampedAddPanelMenuWidth();
        setAddPanelMenuPosition(anchoredMenuPosition(rect, menuHeight, menuWidth));
    }, []);

    const updateAddPanelMenuPosition = useCallback(() => {
        const button = addPanelButtonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const menuRect = addPanelMenuRef.current?.getBoundingClientRect();
        const menuHeight = menuRect?.height ?? DEFAULT_ADD_PANEL_MENU_HEIGHT;
        const menuWidth = menuRect?.width ?? clampedAddPanelMenuWidth();
        setAddPanelMenuPosition(anchoredMenuPosition(rect, menuHeight, menuWidth));
    }, []);

    const updateExportMenuPosition = useCallback(() => {
        const button = exportMenuButtonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const menuHeight = exportMenuRef.current?.getBoundingClientRect().height ?? DEFAULT_EXPORT_MENU_HEIGHT;
        setExportMenuPosition(anchoredMenuPosition(rect, menuHeight));
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

    const closeExportMenu = useCallback(() => {
        setExportMenuOpen(false);
        setExportMenuPosition(null);
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
        setAddPanelMenuTarget(null);
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
        closeExportMenu();
        closeCanvasThemeMenu();
        setArrangeMenuOpen(true);
    }, [closeCanvasThemeMenu, closeExportMenu, updateArrangeMenuPositionForRect]);

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
        setAddPanelMenuTarget(null);
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
        closeExportMenu();
        setCanvasThemeMenuOpen(true);
    }, [closeArrangeMenu, closeExportMenu, updateCanvasThemeMenuPositionForRect]);

    const closeAddPanelMenu = useCallback(() => {
        setAddPanelMenuOpen(false);
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
        setAddPanelMenuTarget(null);
    }, []);

    const handleToggleExportMenu = useCallback(() => {
        setExportMenuOpen((open) => {
            if (open) {
                setExportMenuPosition(null);
                return false;
            }
            updateExportMenuPosition();
            closeArrangeMenu();
            closeCanvasThemeMenu();
            closeAddPanelMenu();
            return true;
        });
    }, [closeAddPanelMenu, closeArrangeMenu, closeCanvasThemeMenu, updateExportMenuPosition]);

    const handleToggleAddPanelMenu = useCallback(() => {
        setAddPanelMenuOpen((open) => {
            if (open) {
                setAddPanelMenuTarget(null);
                return false;
            }
            setAddPanelMenuTarget(null);
            updateAddPanelMenuPosition();
            closeArrangeMenu();
            closeCanvasThemeMenu();
            closeExportMenu();
            setAddPanelQuery('');
            setAddPanelActiveIndex(0);
            return true;
        });
    }, [closeArrangeMenu, closeCanvasThemeMenu, closeExportMenu, updateAddPanelMenuPosition]);

    const handleCanvasAddPanelMenuRequest = useCallback((request: CanvasAddPanelMenuRequest) => {
        setAddPanelMenuTarget(request);
        updateAddPanelMenuPositionForRect({
            right : request.anchor.x + request.anchor.w,
            top   : request.anchor.y,
            bottom: request.anchor.y + request.anchor.h,
        });
        closeArrangeMenu();
        closeCanvasThemeMenu();
        closeExportMenu();
        setAddPanelQuery('');
        setAddPanelActiveIndex(0);
        setAddPanelMenuOpen(true);
    }, [closeArrangeMenu, closeCanvasThemeMenu, closeExportMenu, updateAddPanelMenuPositionForRect]);

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
        const beforeCollection = workspaceRef.current?.collection();
        const activeCanvasId = beforeCollection?.activeCanvasId ?? chromeState.collection.activeCanvasId;
        const target = addPanelMenuTarget?.canvasId === activeCanvasId ? addPanelMenuTarget : null;
        const beforeNodeIds = new Set(beforeCollection?.documents[activeCanvasId]?.model.nodes.map((node) => node.id) ?? []);
        const created = workspaceRef.current?.executeActiveCanvasCommand({
            type  : 'create-node',
            nodeType,
            source: target ? 'pointer' : 'nonvisual',
            ...(target ? { at: target.at } : {}),
        });
        if (created && nodeType === BuiltInNodeTypes.canvas) {
            const collection = workspaceRef.current?.collection();
            const node = collection?.documents[activeCanvasId]?.model.nodes.find((candidate) =>
                !beforeNodeIds.has(candidate.id) && candidate.type === BuiltInNodeTypes.canvas
            );
            if (node) {
                workspaceRef.current?.executeDocumentCommand({
                    type          : 'create-child-canvas',
                    parentCanvasId: activeCanvasId,
                    nodeId        : node.id,
                    source        : target ? 'pointer' : 'nonvisual',
                });
            }
        }
        closeAddPanelMenu();
    }, [addPanelMenuTarget, chromeState.collection.activeCanvasId, closeAddPanelMenu]);

    const handleWorkspaceFileDrop = useCallback(async (request: WorkspaceFileDropRequest) => {
        if (request.canvasId !== (workspaceRef.current?.collection().activeCanvasId ?? chromeState.collection.activeCanvasId)) return;
        const supportedFiles = request.files.filter(isSupportedWorkspaceAssetFile);
        if (!supportedFiles.length) {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Use image, PDF, or Markdown files.');
            return;
        }
        setSyncMessage(supportedFiles.length > 1 ? `Adding ${supportedFiles.length} files` : 'Adding file');
        try {
            const storeOnline = Boolean(activeDocumentId && signedIn && hasUsableStoredToken());
            for (const [index, file] of supportedFiles.entries()) {
                const asset = await storeWorkspaceAsset(file, storeOnline);
                if (isImageAssetMime(asset.mime)) await cacheAssetImage(asset.id, asset.objectUrl);
                if (workspaceRef.current?.collection().activeCanvasId !== request.canvasId) {
                    setSyncMessage('File add cancelled because the view changed.');
                    return;
                }
                const node = await nodeCreateRequestForFile(file, asset);
                const at = offsetDropPoint(request.at, index);
                workspaceRef.current?.executeActiveCanvasCommand({
                    type    : 'create-node',
                    nodeType: node.nodeType,
                    source  : 'pointer',
                    at,
                    data    : node.data,
                });
            }
            workspaceRef.current?.refreshActiveCanvas();
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(error instanceof Error ? error.message : 'Could not add this file.');
        }
    }, [activeDocumentId, chromeState.collection.activeCanvasId, signedIn]);

    const handleWorkspaceTextPaste = useCallback((request: WorkspaceTextPasteRequest) => {
        if (request.canvasId !== (workspaceRef.current?.collection().activeCanvasId ?? chromeState.collection.activeCanvasId)) return false;
        const url = normalizeEmbedUrl(request.text, { allowLocalHttp: allowLocalHttpForCurrentHost() });
        if (!url) return false;
        workspaceRef.current?.executeActiveCanvasCommand({
            type    : 'create-node',
            nodeType: BuiltInNodeTypes.embed,
            source  : 'pointer',
            at      : request.at,
            data    : {
                url,
                title      : embedTitleForUrl(url),
                provider   : embedProviderForUrl(url),
                aspectRatio: '16:9',
            },
        });
        return true;
    }, [chromeState.collection.activeCanvasId]);

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

    useLayoutEffect(() => {
        if (!addPanelMenuOpen) return;
        const updateOpenAddPanelMenuPosition = () => {
            if (addPanelMenuTarget) {
                updateAddPanelMenuPositionForRect({
                    right : addPanelMenuTarget.anchor.x + addPanelMenuTarget.anchor.w,
                    top   : addPanelMenuTarget.anchor.y,
                    bottom: addPanelMenuTarget.anchor.y + addPanelMenuTarget.anchor.h,
                });
                return;
            }
            updateAddPanelMenuPosition();
        };
        updateOpenAddPanelMenuPosition();
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
        window.addEventListener('resize', updateOpenAddPanelMenuPosition);
        window.addEventListener('scroll', updateOpenAddPanelMenuPosition, true);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updateOpenAddPanelMenuPosition);
            window.removeEventListener('scroll', updateOpenAddPanelMenuPosition, true);
        };
    }, [addPanelMenuOpen, addPanelMenuTarget, closeAddPanelMenu, updateAddPanelMenuPosition, updateAddPanelMenuPositionForRect]);

    useLayoutEffect(() => {
        if (!exportMenuOpen) return;
        const updateOpenExportMenuPosition = () => updateExportMenuPosition();
        updateOpenExportMenuPosition();
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (exportMenuButtonRef.current?.contains(target) || exportMenuRef.current?.contains(target)) return;
            closeExportMenu();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeExportMenu();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updateOpenExportMenuPosition);
        window.addEventListener('scroll', updateOpenExportMenuPosition, true);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updateOpenExportMenuPosition);
            window.removeEventListener('scroll', updateOpenExportMenuPosition, true);
        };
    }, [closeExportMenu, exportMenuOpen, updateExportMenuPosition]);

    const viewTree = useMemo(() => buildViewTree(chromeState.collection), [chromeState.collection]);
    const saveButtonLabel = saveActionLabel(syncStatus, syncMessage, signedIn);
    const exportActionDisabled = syncStatus === 'saving' || syncStatus === 'loading';
    const copyPreviewDisabled = exportActionDisabled || !canCopyPngToClipboard();
    const agentAccessToken = getToken();
    const agentAccessDisabled = exportActionDisabled || !signedIn || !activeDocumentId || syncStatus !== 'clean' ||
        !agentAccessToken;
    const agentAccessHint = agentAccessDisabled ?
        agentAccessDisabledReason({
            activeDocumentId,
            signedIn,
            syncStatus,
            token: agentAccessToken,
        }) :
        'Prompt with live document access';

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
                    onToggleParentContext: () => {
                        const current = chromeStateRef.current.collection.view.parentContextVisible ?? true;
                        workspaceRef.current?.setParentContextVisible(!current);
                    }
                }}
                exportMenu={{
                    buttonRef: exportMenuButtonRef,
                    disabled : exportActionDisabled,
                    open     : exportMenuOpen,
                    onToggle : handleToggleExportMenu
                }}
                addPanel={{
                    buttonRef: addPanelButtonRef,
                    open     : addPanelMenuOpen && !addPanelMenuTarget,
                    onToggle : handleToggleAddPanelMenu
                }}
                visibility={{
                    active     : activeDocumentVisibility,
                    editable   : activeDocumentEditable,
                    signedIn,
                    busy       : syncStatus === 'loading' || syncStatus === 'saving',
                    onCopyLink : () => void handleCopyWorkspaceLink(),
                    onSet      : (visibility) => void handleSetDocumentVisibility(visibility)
                }}
            />
            {exportMenuOpen ? (<ExportMenu
                ref={exportMenuRef}
                position={exportMenuPosition}
                agentAccessDisabled={agentAccessDisabled}
                agentAccessHint={agentAccessHint}
                copyImageDisabled={copyPreviewDisabled}
                onCopyAgentAccess={() => {
                    closeExportMenu();
                    void handleCopyAgentAccess();
                }}
                onCopyImage={() => {
                    closeExportMenu();
                    void handleCopyPreview();
                }}
                onSaveImage={() => {
                    closeExportMenu();
                    void handleDownloadPreview();
                }}
                onCopyLink={() => {
                    closeExportMenu();
                    void handleCopyWorkspaceLink();
                }}
                onCopyDocument={() => {
                    closeExportMenu();
                    void handleCopyWorkspaceDocument();
                }}
            />) : null}
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
                        fitOnFirstLoad={fitWorkspaceOnFirstLoad}
                        storageKey={workspaceStorageKey}
                        viewportControlMenuState={viewportControlMenuState}
                        onCollectionChange={handleWorkspaceCollectionChange}
                        onChromeStateChange={handleChromeStateChange}
                        onCanvasAddPanelMenuRequest={handleCanvasAddPanelMenuRequest}
                        onArrangeCanvasMenuRequest={handleArrangeCanvasMenuRequest}
                        onCanvasThemeMenuRequest={handleCanvasThemeMenuRequest}
                        onFileDrop={handleWorkspaceFileDrop}
                        onTextPaste={handleWorkspaceTextPaste}
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

function agentAccessDisabledReason(input: {
    activeDocumentId: string;
    signedIn: boolean;
    syncStatus: SyncStatus;
    token: string;
}): string {
    if (input.syncStatus === 'saving' || input.syncStatus === 'loading') return 'Wait for sync to finish';
    if (!input.signedIn || !input.token) return 'Sign in and save online';
    if (!input.activeDocumentId) return 'Save online first';
    if (input.syncStatus === 'dirty') return 'Save online first';
    if (input.syncStatus === 'error') return 'Resolve sync before sharing';
    return 'Save online first';
}

type StoredWorkspaceAsset = {
    id: string;
    name: string;
    mime: string;
    objectUrl: string;
};

type FileNodeCreateRequest = {
    nodeType: string;
    data: NodeData;
};

type WorkspacePreviewCapture = NonNullable<Awaited<ReturnType<NestedCanvasWorkspaceHandle['captureActiveCanvasPreview']>>>;

async function storeWorkspaceAsset(file: File, online: boolean): Promise<StoredWorkspaceAsset> {
    if (online) {
        const asset = await uploadWorkspaceAsset(file);
        return loadAssetObject(asset.id);
    }
    const asset = await saveLocalAsset(file);
    return loadLocalAssetObject(asset.id);
}

async function uploadWorkspacePreviewImage(capture: WorkspacePreviewCapture, documentTitle: string): Promise<CanvasWorkspacePreviewImage> {
    const capturedAt = new Date().toISOString();
    const file = new File([capture.blob], workspacePreviewAssetFileName({
        capturedAt,
        canvasId: capture.canvasId,
        documentTitle,
    }), {type: 'image/png'});
    const asset = await uploadImageAsset(file);
    return {
        assetId   : asset.id,
        mime      : 'image/png',
        width     : capture.width,
        height    : capture.height,
        capturedAt,
        canvasId  : capture.canvasId,
    };
}

function previewImageFileName(documentTitle: string): string {
    const slug = documentTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return `${slug || 'canaster-workspace'}-preview.png`;
}

function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function canCopyPngToClipboard(): boolean {
    return typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);
}

function copyPngCaptureToClipboard(capture: () => Promise<WorkspacePreviewCapture | null>): Promise<void> {
    if (!canCopyPngToClipboard()) throw new Error('Image clipboard is not available');
    const pngBlob = Promise.resolve().then(capture).then((previewCapture) => {
        if (!previewCapture) throw new Error('Workspace preview is not ready yet');
        return pngBlobForClipboard(previewCapture.blob);
    });
    return navigator.clipboard.write([
        new ClipboardItem({
            'image/png': pngBlob,
        }),
    ]);
}

function pngBlobForClipboard(blob: Blob): Blob {
    return blob.type === 'image/png' ? blob : new Blob([blob], {type: 'image/png'});
}

async function copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
        }
    }
    if (copyTextWithHiddenTextarea(text)) return;
    throw new Error('Text clipboard is not available');
}

function copyTextWithHiddenTextarea(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.append(textarea);
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch {
        copied = false;
    }
    textarea.remove();
    activeElement?.focus();
    return copied;
}

async function nodeCreateRequestForFile(file: File, asset: StoredWorkspaceAsset): Promise<FileNodeCreateRequest> {
    const kind = workspaceAssetKindForFile(file);
    const title = cleanAssetTitle(asset.name || file.name, kind === 'pdf' ? 'PDF' : kind === 'markdown' ? 'Markdown' : 'Image');
    if (kind === 'image') {
        return {
            nodeType: BuiltInNodeTypes.image,
            data    : {
                assetId: asset.id,
                alt    : title,
                fit    : 'contain',
                caption: '',
            },
        };
    }
    if (kind === 'pdf') {
        return {
            nodeType: BuiltInNodeTypes.pdf,
            data    : {
                assetId : asset.id,
                title,
                fileName: asset.name || file.name || 'document.pdf',
                mime    : asset.mime || 'application/pdf',
            },
        };
    }
    if (kind === 'markdown') {
        return {
            nodeType: BuiltInNodeTypes.md,
            data    : {
                assetId    : asset.id,
                title,
                fileName   : asset.name || file.name || 'note.md',
                mime       : asset.mime || 'text/markdown',
                markdownText: '',
            },
        };
    }
    throw new Error('Use image, PDF, or Markdown files.');
}

function offsetDropPoint(point: WorldPoint, index: number): WorldPoint {
    const offset = index * 32;
    return { x: point.x + offset, y: point.y + offset };
}

function allowLocalHttpForCurrentHost(): boolean {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function imageAssetIdsInCollection(collection: CanvasDocumentCollection): string[] {
    const ids = new Set<string>();
    for (const document of Object.values(collection.documents)) {
        const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
        if (backgroundAssetId) ids.add(backgroundAssetId);
        for (const node of document.model.nodes) {
            if (node.type !== BuiltInNodeTypes.image) continue;
            for (const assetId of referencedAssetIdsForNode(node)) ids.add(assetId);
        }
    }
    return [...ids];
}

function assetIdsInCollection(collection: CanvasDocumentCollection): string[] {
    const ids = new Set<string>();
    const previewAssetId = collection.appearance?.previewImage?.assetId;
    if (previewAssetId) ids.add(previewAssetId);
    for (const document of Object.values(collection.documents)) {
        const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
        if (backgroundAssetId) ids.add(backgroundAssetId);
        for (const node of document.model.nodes) {
            for (const assetId of referencedAssetIdsForNode(node)) ids.add(assetId);
        }
    }
    return [...ids];
}

async function promoteLocalAssetsForOnlineSave(
    snapshot: CanvasWorkspaceSnapshot
): Promise<{ snapshot: CanvasWorkspaceSnapshot; changed: boolean }> {
    const localIds = localAssetIdsInSnapshot(snapshot);
    if (!localIds.length) return { snapshot, changed: false };
    const promotedIds = new Map<string, string>();
    for (const localId of localIds) {
        const file = await loadLocalAssetFile(localId);
        const asset = await uploadWorkspaceAsset(file);
        promotedIds.set(localId, asset.id);
    }
    return {
        snapshot: rewriteSnapshotAssetIds(snapshot, promotedIds),
        changed : promotedIds.size > 0,
    };
}

function localAssetIdsInSnapshot(snapshot: CanvasWorkspaceSnapshot): string[] {
    const ids = new Set<string>();
    for (const collection of collectionsInSnapshot(snapshot)) {
        for (const assetId of assetIdsInCollection(collection)) {
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
        const previewAssetId = collection.appearance?.previewImage?.assetId;
        const promotedPreviewId = previewAssetId ? promotedIds.get(previewAssetId) : null;
        if (promotedPreviewId && collection.appearance?.previewImage) {
            collection.appearance.previewImage = {
                ...collection.appearance.previewImage,
                assetId: promotedPreviewId,
            };
        }
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

function nameFromStoredToken(): string {
    return tokenName();
}

function snapshotSignature(snapshot: unknown): string {
    return JSON.stringify(snapshot);
}
